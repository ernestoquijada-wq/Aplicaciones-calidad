// ==========================================
// 🗄️ DATA HUB: IMPORTACIÓN Y REPORTES
// ==========================================

function adminGenerateFullReport(targetIds, templateObj = null, isDryRun = false) {
  const lock = LockService.getScriptLock(); lock.tryLock(CONF.TIMEOUTS.LOCK);
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
    let newSS;
    let activeAssets = [];

    if (isDryRun) {
      activeAssets = [
        { controlNo: 'DEMO-001', quadrant: 'A1', description: 'MESA ESD', project: 'N/A', factory: 'PLANTA 1', status: 'FALLA SIMULADA', nextDate: '31-DEC-26', responsible: 'JUAN PÉREZ', comments: 'Este es un comentario de prueba.' },
        { controlNo: 'DEMO-002', quadrant: 'B4', description: 'CARRITO', project: 'PROY-X', factory: 'PLANTA 2', status: 'FALLA SIMULADA', nextDate: '15-JAN-27', responsible: 'MARÍA LÓPEZ', comments: 'Falla detectada visualmente.' }
      ];
    } else {
      const shAssets = ss.getSheetByName(CONF.SHEET_ASSETS);
      const dataAssets = shAssets.getDataRange().getValues();
      const idSet = new Set(targetIds.map(String));

      const shTickets = ss.getSheetByName(CONF.SHEET_TICKETS);
      let ticketsDB = {}; 
      if (shTickets) {
        const dataTickets = shTickets.getDataRange().getValues();
        for (let i = 1; i < dataTickets.length; i++) {
            const tAssetId = String(dataTickets[i][1]);
            const tIdFull = String(dataTickets[i][0]);
            let tIdNum = "N/A";
            const match = tIdFull.match(/\d+/);
            if (match) tIdNum = parseInt(match[0], 10).toString();

            let parsedJson = {}; try { parsedJson = JSON.parse(dataTickets[i][4]); } catch(e){}

            let lastAttemptDate = "N/A";
            if (parsedJson.intentos_medicion && parsedJson.intentos_medicion.length > 0) {
                const lastAttempt = parsedJson.intentos_medicion[parsedJson.intentos_medicion.length - 1];
                if (lastAttempt.fecha) lastAttemptDate = Utilities.formatDate(new Date(lastAttempt.fecha), Session.getScriptTimeZone(), "dd-MMM-yyyy");
            }

            ticketsDB[tAssetId] = { tkt_id_number: tIdNum, tkt_open_date: dataTickets[i][2] ? Utilities.formatDate(new Date(dataTickets[i][2]), Session.getScriptTimeZone(), "dd-MMM-yyyy") : "N/A", tkt_status: dataTickets[i][3], tkt_last_attempt_date: lastAttemptDate, json_data: parsedJson };
        }
      }

      const shConfig = ss.getSheetByName(CONF.SHEET_CONFIG);
      let sectorLabels = {};
      if (shConfig) {
          const cfgData = shConfig.getDataRange().getValues();
          for (let i = 1; i < cfgData.length; i++) {
              if (String(cfgData[i][0]) === "SECTOR") sectorLabels[String(cfgData[i][1]).toUpperCase()] = String(cfgData[i][2]) || String(cfgData[i][1]);
          }
      }

      for (let i = 1; i < dataAssets.length; i++) {
        const row = dataAssets[i];
        const id = String(row[0]);
        if (idSet.has(id)) {
          const fmtMeas = (m, e) => (m && m !== "N/A" && e && e !== "N/A") ? `${m} x 10^${e}` : (m || "N/A");
          const safeDate = (typeof Utils !== 'undefined' && Utils.formatDateDisplay)
            ? ((d) => Utils.formatDateDisplay(d, "dd-MMM-yyyy"))
            : ((d) => {
                if (!d || d === "N/A" || d === "PENDIENTE") return "N/A";
                if (d instanceof Date) { try { return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MMM-yyyy"); } catch(e) {} }
                return String(d);
              });
          
          let assetData = {
            controlNo: id, quadrant: row[1], quadrantLabel: sectorLabels[String(row[1]).toUpperCase()] || "N/A", 
            description: row[3], project: row[4], factory: row[5], status: row[6],
            lastResult: (typeof Utils !== 'undefined' && Utils.normalizeStatusResult) ? Utils.normalizeStatusResult(row[15]) : row[15], lastDate: safeDate(row[16]), nextDate: safeDate(row[17]),
            responsible: row[18], comments: row[19],
            meas_surfaceRes: fmtMeas(row[7], row[8]), meas_floorMat: fmtMeas(row[9], row[10]),
            meas_surfaceRes_m: row[7] || "N/A", meas_surfaceRes_e: row[8] || "N/A",
            meas_floorMat_m: row[9] || "N/A", meas_floorMat_e: row[10] || "N/A",
            meas_elecRes: row[11] || "N/A", meas_impedance: row[12] || "N/A", meas_voltage: row[13] || "N/A", meas_jack: row[14] || "N/A",
            systemUser: "N/A" 
          };

          if (ticketsDB[id]) {
              const tData = ticketsDB[id];
              assetData.tkt_id_number = tData.tkt_id_number; assetData.tkt_open_date = tData.tkt_open_date;
              assetData.tkt_status = tData.tkt_status; assetData.tkt_last_attempt_date = tData.tkt_last_attempt_date;
              
              const jData = tData.json_data;
              const formData = (jData.intentos_medicion && jData.intentos_medicion.length > 0) ? jData.intentos_medicion[jData.intentos_medicion.length - 1].ticketData : (jData.apertura || {});
              if (formData.systemUser) assetData.systemUser = formData.systemUser;
              for (const fieldName in formData) assetData["tkt_data_" + fieldName] = formData[fieldName];
          }
          activeAssets.push(assetData);
        }
      }
    }

    if (templateObj && templateObj.label) {
      const templateName = templateObj.label;
      const tplSheet = ss.getSheetByName(templateName);
      if (!tplSheet) throw new Error(`No se encontró pestaña: ${templateName}`);
      
      const prefix = isDryRun ? "VISTA_PREVIA_" : "Reporte_";
      newSS = SpreadsheetApp.create(prefix + templateObj.id + "_" + dateStr);
      const tempSheet = tplSheet.copyTo(newSS);
      tempSheet.setName(templateObj.id);
      newSS.deleteSheet(newSS.getSheets()[0]); 
      
      const folio = isDryRun ? "PREV-0000" : getNextFolio(templateObj.id);
      const tplData = tempSheet.getDataRange().getValues();
      const maxTplRows = Math.min(tplData.length, 20);
      let tplChanged = false;
      const formattedDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MMM-yyyy");
      for (let r = 0; r < maxTplRows; r++) {
        for (let c = 0; c < tplData[r].length; c++) {
          let cellVal = String(tplData[r][c]);
          let newVal = cellVal;
          if (newVal.includes('{{FOLIO}}')) newVal = newVal.replace(/\{\{FOLIO\}\}/g, folio);
          if (newVal.includes('{{FECHA}}')) newVal = newVal.replace(/\{\{FECHA\}\}/g, formattedDate);
          if (newVal !== cellVal) {
            tplData[r][c] = newVal;
            tplChanged = true;
          }
        }
      }
      if (tplChanged && maxTplRows > 0) {
        tempSheet.getRange(1, 1, maxTplRows, tplData[0].length).setValues(tplData.slice(0, maxTplRows));
      }

      const config = templateObj.config || { startRow: 8, columns: [] };
      const startRow = parseInt(config.startRow, 10) || 8;
      const cols = config.columns || [];
      if (cols.length > 0) {
        const headerRow = cols.map(c => c.header);
        tempSheet.getRange(startRow, 1, 1, headerRow.length).setValues([headerRow]);
        tempSheet.getRange(startRow, 1, 1, headerRow.length).setFontWeight("bold").setBackground(CONF.DEFAULT_COLOR).setFontColor("#ffffff").setBorder(true, true, true, true, true, true);

        const rowsToInsert = [];
        activeAssets.forEach(asset => rowsToInsert.push(cols.map(c => asset[c.field] || "N/A")));
        if (rowsToInsert.length > 0) {
          tempSheet.getRange(startRow + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);
          tempSheet.getRange(startRow + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setHorizontalAlignment("center").setVerticalAlignment("middle").setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.SOLID);
        }
      }
    } else {
      newSS = SpreadsheetApp.create("Reporte_Basico_" + dateStr);
      const sheet = newSS.getSheets()[0];
      const basicData = [["ID ACTIVO", "TIPO", "ESTADO", "CUADRANTE", "FÁBRICA", "PROYECTO", "VENCIMIENTO"]];
      activeAssets.forEach(a => basicData.push([a.controlNo, a.description, a.status, a.quadrant, a.factory, a.project, a.nextDate]));
      sheet.getRange(1, 1, basicData.length, basicData[0].length).setValues(basicData);
      sheet.getRange(1, 1, 1, basicData[0].length).setFontWeight("bold").setBackground(CONF.DEFAULT_COLOR).setFontColor("#ffffff");
    }

    const file = DriveApp.getFileById(newSS.getId());
    const sourceFile = DriveApp.getFileById(CONF.SS_ID); 
    const parents = sourceFile.getParents();
    if (parents.hasNext()) {
      const parentFolder = parents.next();
      const folderName = isDryRun ? "REPORTES_ESD_VISTAS_PREVIAS" : "REPORTES_ESD"; 
      let targetFolder;
      const folders = parentFolder.getFoldersByName(folderName);
      if (folders.hasNext()) targetFolder = folders.next();
      else targetFolder = parentFolder.createFolder(folderName); 
      file.moveTo(targetFolder); 
    }
    return { success: true, url: newSS.getUrl() };
  } catch (e) { return { success: false, error: e.toString() }; } finally { lock.releaseLock(); }
}

function adminCreateSheetTemplate(target, lists) {
  try {
    const nombreArchivo = "Plantilla_Plexus_" + target + "_" + Utilities.formatDate(new Date(), "GMT", "yyyy-MM-dd");
    const ss = SpreadsheetApp.create(nombreArchivo);
    const sh = ss.getSheets()[0];
    
    let headers = [];
    if (target === 'ASSETS') headers = ["CONTROL_NO", "CUADRANTE", "COLOR_CODE", "DESCRIPCION", "PROYECTO", "FABRICA", "ESTADO_ACTUAL", "RESPONSABLE", "COMENTARIOS"];
    else if (target === 'USERS') headers = ["CORREO_ELECTRONICO", "ROL_ASIGNADO"];
    else if (target === 'RULES') headers = ["TIPO_ACTIVO_ID", "TOLERANCIA", "REC_GENERAL", "SURFACE_MANTISSA", "SURFACE_EXPONENTE", "FLOORMAT_MANTISSA", "FLOORMAT_EXPONENTE", "ELEC_RES", "IMPEDANCE", "VOLTAGE", "JACK"];
    
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground(CONF.DEFAULT_COLOR).setFontColor('white');
    sh.setFrozenRows(1);
    for(let i=1; i<=headers.length; i++) sh.setColumnWidth(i, 150);

    if (lists) {
      const buildDropdown = (colIndex, listArray) => {
        if (listArray && listArray.length > 0) {
          const rule = SpreadsheetApp.newDataValidation().requireValueInList(listArray, true).setAllowInvalid(false).build();
          sh.getRange(2, colIndex, 1000, 1).setDataValidation(rule);
        }
      };
      if (target === 'USERS') buildDropdown(2, lists.roles);
      else if (target === 'ASSETS') {
        buildDropdown(2, lists.sectors); buildDropdown(4, lists.types);
        buildDropdown(5, lists.projects); buildDropdown(6, lists.factories);
        buildDropdown(7, lists.statuses); buildDropdown(8, lists.auditors);
      }
    }
    return { success: true, url: ss.getUrl() };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function adminFetchExternalData(url) {
  try {
    const ss = SpreadsheetApp.openByUrl(url);
    const sh = ss.getSheets()[0];
    const data = sh.getDataRange().getValues();
    if (data.length < 2) throw new Error("La hoja está vacía.");
    const headers = data[0].map(h => (typeof DataRepository !== 'undefined') ? DataRepository.normalizeKey(h) : String(h).trim().toUpperCase());
    let results = [];
    for (let i = 1; i < data.length; i++) {
      let obj = {};
      headers.forEach((h, idx) => { obj[h] = data[i][idx]; });
      if (typeof DataRepository !== 'undefined') {
        obj = DataRepository.sanitizeRowObject(obj);
      }
      results.push(obj);
    }
    return { success: true, data: results };
  } catch (e) { return { success: false, error: "No se pudo leer la hoja externa." }; }
}

function adminBulkProcess(target, data, isUpdate) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(false, "No se proporcionaron datos para el procesamiento masivo.") : { success: false, error: "No se proporcionaron datos para el procesamiento masivo." };
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    let result;
    if (target === 'ASSETS') result = bulkProcessAssets(ss, data, isUpdate);
    else if (target === 'USERS') result = bulkProcessUsers(ss, data);
    else if (target === 'RULES') result = bulkProcessRules(ss, data, isUpdate);
    else return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(false, "Módulo no soporta carga masiva.") : { success: false, error: "Módulo no soporta carga masiva." };

    if (typeof CacheManager !== 'undefined') CacheManager.invalidateAll();
    return result;
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK, "Procesamiento Masivo");
  }
  return runner();
}

function bulkProcessAssets(ss, data, isUpdate) {
  const sh = ss.getSheetByName(CONF.SHEET_ASSETS);
  const dbData = sh.getDataRange().getValues();
  const headers = dbData[0];
  const estadoRegIdx = (typeof DataRepository !== 'undefined')
    ? DataRepository.findHeaderIndex(headers, 'ESTADO_REGISTRO', -1)
    : headers.indexOf("Estado_Registro");
  const estadoRegCol = estadoRegIdx + 1;
  const modColIdx = (typeof DataRepository !== 'undefined')
    ? DataRepository.findHeaderIndex(headers, 'LAST_MODIFIED', -1)
    : headers.indexOf("LastModified");

  if (isUpdate) {
    // Optimización O(1) con Map y actualización en memoria por lotes (Batch I/O)
    const idMap = new Map();
    for (let i = 1; i < dbData.length; i++) {
      const id = String(dbData[i][0]).trim().toUpperCase();
      if (id) idMap.set(id, i);
    }

    let modified = false;
    data.forEach(rawRow => {
      const row = (typeof DataRepository !== 'undefined') ? DataRepository.sanitizeRowObject(rawRow) : rawRow;
      const id = String(row.CONTROL_NO || row.ID || "").trim().toUpperCase();
      if (!id || !idMap.has(id)) return;
      const i = idMap.get(id);

      // Asegurar que la fila en memoria tenga longitud suficiente
      while (dbData[i].length < headers.length) dbData[i].push("");

      if (row.CUADRANTE !== undefined && row.CUADRANTE !== "") { dbData[i][1] = row.CUADRANTE; modified = true; }
      if (row.COLOR_CODE !== undefined && row.COLOR_CODE !== "") { dbData[i][2] = row.COLOR_CODE; modified = true; }
      if (row.DESCRIPCION !== undefined && row.DESCRIPCION !== "") { dbData[i][3] = row.DESCRIPCION; modified = true; }
      if (row.PROYECTO !== undefined && row.PROYECTO !== "") { dbData[i][4] = row.PROYECTO; modified = true; }
      if (row.FABRICA !== undefined && row.FABRICA !== "") { dbData[i][5] = row.FABRICA; modified = true; }
      if (row.ESTADO_ACTUAL !== undefined && row.ESTADO_ACTUAL !== "") { dbData[i][6] = row.ESTADO_ACTUAL; modified = true; }
      if (row.RESPONSABLE !== undefined && row.RESPONSABLE !== "") { dbData[i][18] = row.RESPONSABLE; modified = true; }
      if (row.COMENTARIOS !== undefined && row.COMENTARIOS !== "") { dbData[i][19] = row.COMENTARIOS; modified = true; }
      if (modified && modColIdx !== -1 && modColIdx < dbData[i].length) {
        dbData[i][modColIdx] = new Date().toISOString();
      }
    });

    if (modified && dbData.length > 1) {
      sh.getRange(2, 1, dbData.length - 1, headers.length).setValues(dbData.slice(1));
    }
  } else {
    const rowsToInject = data.map(rawRow => {
      const r = (typeof DataRepository !== 'undefined') ? DataRepository.sanitizeRowObject(rawRow) : rawRow;
      let newRow = new Array(headers.length).fill("");
      newRow[0] = r.CONTROL_NO || r.ID; newRow[1] = r.CUADRANTE; newRow[2] = r.COLOR_CODE || CONF.DEFAULT_COLOR;
      newRow[3] = r.DESCRIPCION; newRow[4] = r.PROYECTO; newRow[5] = r.FABRICA; newRow[6] = r.ESTADO_ACTUAL || "ACTIVO";
      newRow[16] = new Date(); newRow[18] = r.RESPONSABLE; newRow[19] = r.COMENTARIOS;
      if (estadoRegCol > 0) newRow[estadoRegCol - 1] = "ACTIVO";
      if (modColIdx !== -1 && modColIdx < newRow.length) newRow[modColIdx] = new Date().toISOString();
      return newRow;
    });
    if (rowsToInject.length > 0) sh.getRange(sh.getLastRow() + 1, 1, rowsToInject.length, headers.length).setValues(rowsToInject);
  }
  return { success: true };
}

function bulkProcessRules(ss, data, isUpdate) {
  const sh = ss.getSheetByName(CONF.SHEET_RULES);
  const dbData = sh.getDataRange().getValues();
  const numCols = Math.max(dbData[0] ? dbData[0].length : 0, 16);

  // Mapear reglas existentes por ID para búsqueda O(1)
  const ruleMap = new Map();
  for (let i = 1; i < dbData.length; i++) {
    const id = String(dbData[i][0]).trim().toUpperCase();
    if (id) ruleMap.set(id, i);
  }

  const rowsToAppend = [];
  let updatedInMemory = false;

  data.forEach(row => {
     const id = String(row.TIPO_ACTIVO_ID || "").trim().toUpperCase();
     if(!id) return;
     const newRow = [
       id,
       row.SURFACE_MANTISSA && row.SURFACE_EXPONENTE ? `< ${row.SURFACE_MANTISSA}E${row.SURFACE_EXPONENTE}` : "",
       row.FLOORMAT_MANTISSA && row.FLOORMAT_EXPONENTE ? `< ${row.FLOORMAT_MANTISSA}E${row.FLOORMAT_EXPONENTE}` : "",
       row.ELEC_RES || "", row.JACK || "", row.VOLTAGE || "", row.IMPEDANCE || "",
       "fa-box", row.REC_GENERAL || "", row.TOLERANCIA || 0.8,
       "", "", "", "", "", "" 
     ];

     if (isUpdate) {
       if (ruleMap.has(id)) {
         const idx = ruleMap.get(id);
         dbData[idx] = newRow;
         updatedInMemory = true;
       }
     } else {
       if (!ruleMap.has(id)) {
         rowsToAppend.push(newRow);
         ruleMap.set(id, dbData.length + rowsToAppend.length - 1);
       }
     }
  });

  if (isUpdate && updatedInMemory && dbData.length > 1) {
    // Un solo guardado masivo en memoria para todas las reglas actualizadas
    const normalizedData = dbData.slice(1).map(row => {
      while (row.length < numCols) row.push("");
      return row.slice(0, numCols);
    });
    sh.getRange(2, 1, normalizedData.length, numCols).setValues(normalizedData);
  } else if (!isUpdate && rowsToAppend.length > 0) {
    // Un solo append por lote para todas las nuevas reglas
    const normalizedRows = rowsToAppend.map(row => {
      while (row.length < numCols) row.push("");
      return row.slice(0, numCols);
    });
    sh.getRange(sh.getLastRow() + 1, 1, normalizedRows.length, numCols).setValues(normalizedRows);
  }

  return { success: true };
}

function bulkProcessUsers(ss, data) {
  // Ahora usamos el estándar de PropertiesService 
  const props = PropertiesService.getScriptProperties();
  const usersStr = props.getProperty('USERS_DB');
  let usersDB = usersStr ? JSON.parse(usersStr) : {};

  data.forEach(row => {
    const email = String(row.CORREO_ELECTRONICO || row.EMAIL || "").trim().toLowerCase();
    const role = String(row.ROL_ASIGNADO || row.ROLE || "").trim().toUpperCase();
    if (email && role) usersDB[email] = role;
  });
  
  // Usamos el método oficial de adminSaveUsers para mantener en sincronía la Hoja y las Propiedades
  return adminSaveUsers(usersDB);
}