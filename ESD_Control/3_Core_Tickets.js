// ==========================================
// 🛠️ TICKETS: MANEJO DE FALLAS Y DRIVE
// ==========================================

function getFolderRecursive(pathArray) {
  const ssFile = DriveApp.getFileById(CONF.SS_ID);
  let folder = ssFile.getParents().next(); 
  
  pathArray.forEach(folderName => {
    const safeName = folderName ? String(folderName).trim() : "SIN_DATO";
    const folders = folder.getFoldersByName(safeName);
    if (folders.hasNext()) folder = folders.next();
    else folder = folder.createFolder(safeName);
  });
  return folder;
}

function uploadTicketFile(fileObj, controlNo, project, description) {
  try {
    const date = new Date();
    const monthYear = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM");
    const safeProject = project ? String(project).trim() : "GENERAL";
    const path = ["EVIDENCIA_ESD_PLEXUS", safeProject, monthYear];
    const folder = getFolderRecursive(path);
    const contentType = fileObj.data.substring(5, fileObj.data.indexOf(';')) || 'image/jpeg';
    const bytes = Utilities.base64Decode(fileObj.data.split(',')[1]);
    const blob = Utilities.newBlob(bytes, contentType);
    const safeDesc = String(description || 'ACTIVO').replace(/[^a-zA-Z0-9]/g, '_');
    const safeId = String(controlNo || 'ID').replace(/[^a-zA-Z0-9]/g, '_');
    blob.setName(`${safeId}_${safeDesc}_${Date.now()}.jpg`);
    const file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    return { success: true, url: file.getUrl() };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function uploadTicketFiles(files, ticketId, assetData) {
  try {
    const date = new Date();
    const monthYear = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM");
    const path = ["EVIDENCIA_ESD_PLEXUS", assetData.factory, assetData.project, monthYear];
    const folder = getFolderRecursive(path);
    const urls = [];
    
    files.forEach((fileObj, index) => {
      const contentType = fileObj.data.substring(5, fileObj.data.indexOf(';'));
      const bytes = Utilities.base64Decode(fileObj.data.split(',')[1]);
      const blob = Utilities.newBlob(bytes, contentType);
      
      const safeDesc = String(assetData.description || 'ACTIVO').replace(/[^a-zA-Z0-9]/g, '_');
      blob.setName(`${ticketId}_${assetData.quadrant}_${safeDesc}_${index + 1}.jpg`);
      
      const file = folder.createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
      urls.push(file.getUrl());
    });
    return { success: true, urls: urls };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function updateAssetStatusInSheet(ss, assetId, newStatus, newResult, comments, measurements) {
  try {
    const shAssets = ss.getSheetByName(CONF.SHEET_ASSETS);
    if (!shAssets) return false;
    const data = shAssets.getDataRange().getValues();
    const headers = data[0] || [];
    const targetId = String(assetId).trim().toUpperCase();
    const VALID_REASONS = ['Instalación', 'Movimiento', 'Validación', 'Instalacion', 'Validacion'];
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === targetId) {
        const rowNum = i + 1;
        const numCols = Math.max(shAssets.getLastColumn(), 20);
        const rowValues = shAssets.getRange(rowNum, 1, 1, numCols).getValues()[0];
        
        // Solo actualizar Col G si es un valor de motivo admitido por la regla de validación de Google Sheets
        if (newStatus && VALID_REASONS.includes(newStatus)) {
          rowValues[6] = newStatus;
        }
        
        // El resultado técnico (FALLA, CUMPLE) reside estrictamente en Col P (index 15)
        if (newResult) {
          rowValues[15] = (typeof Utils !== 'undefined' && Utils.normalizeStatusResult) ? Utils.normalizeStatusResult(newResult) : newResult;
        }
        
        if (measurements) {
          const chk = (val) => (val === null || val === undefined || val === "") ? "N/A" : val;
          if (measurements.surfaceRes) {
            rowValues[7] = chk(measurements.surfaceRes.mantissa);
            rowValues[8] = chk(measurements.surfaceRes.exponent);
          }
          if (measurements.floorMat) {
            rowValues[9] = chk(measurements.floorMat.mantissa);
            rowValues[10] = chk(measurements.floorMat.exponent);
          }
          if (measurements.elecRes !== undefined) rowValues[11] = chk(measurements.elecRes);
          if (measurements.impedance !== undefined) rowValues[12] = chk(measurements.impedance);
          if (measurements.voltage !== undefined) rowValues[13] = chk(measurements.voltage);
          if (measurements.jack !== undefined) rowValues[14] = chk(measurements.jack);
        }
        
        if (comments) {
          rowValues[19] = comments;
        }

        const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MMM-yy");
        rowValues[16] = todayStr;

        const modColIndex = headers.indexOf('LastModified');
        if (modColIndex !== -1 && modColIndex < rowValues.length) {
          rowValues[modColIndex] = new Date().toISOString();
        }
        
        shAssets.getRange(rowNum, 1, 1, rowValues.length).setValues([rowValues]);
        return true;
      }
    }
  } catch (err) {
    console.error("Error al actualizar estatus de activo en hoja:", err);
  }
  return false;
}

function saveTicketRecord(payload) {
  if (!payload || !payload.assetId || !payload.mode) {
    return Utils.buildResponse(false, "Datos de ticket incompletos o inválidos.");
  }

  if (typeof Validator !== 'undefined') {
    if (Validator.isBlank(payload.assetId)) {
      return Utils.buildResponse(false, "El ID de activo es obligatorio.");
    }
    if (Validator.isBlank(payload.mode)) {
      return Utils.buildResponse(false, "El modo de ticket (OPEN/CLOSE) es obligatorio.");
    }
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    let sh = ss.getSheetByName(CONF.SHEET_TICKETS);
    if (!sh) {
      sh = ss.insertSheet(CONF.SHEET_TICKETS);
      sh.appendRow(["TICKET_ID", "ASSET_ID", "FECHA_APERTURA", "ESTADO_TICKET", "DATA_JSON"]);
      sh.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#e11d48").setFontColor("#ffffff");
    }
    
    const data = sh.getDataRange().getValues();
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    const userEmail = Session.getActiveUser().getEmail(); 
    
    let emailsStr = "";
    if (payload.emails && Array.isArray(payload.emails)) {
        emailsStr = payload.emails.filter(e => e && e.trim() !== '').map(e => e.includes('@') ? e.trim() : `${e.trim()}@plexus.com`).join(', ');
    }

    let ticketId = "";
    if (payload.mode === 'OPEN') {
        // Prevención de duplicados: si ya existe un ticket abierto, registrarlo como nuevo intento de falla en el mismo ticket
        let existingOpenTicket = null;
        let existingRowIndex = -1;
        for (let i = data.length - 1; i >= 1; i--) {
          if (String(data[i][1]).trim().toUpperCase() === String(payload.assetId).trim().toUpperCase() && 
              String(data[i][3]).trim().toUpperCase() === "ABIERTO") {
            existingOpenTicket = String(data[i][0]);
            existingRowIndex = i + 1;
            break;
          }
        }

        if (existingOpenTicket) {
          ticketId = existingOpenTicket;
          let oldData = { apertura: {}, intentos_medicion: [] };
          try { oldData = JSON.parse(data[existingRowIndex - 1][4]); } catch(e) {}
          if (!oldData.intentos_medicion) oldData.intentos_medicion = [];
          oldData.intentos_medicion.push({
            fecha: dateStr, ticketData: payload.formData, mediciones: payload.measurements,
            dictamen: "RE-NOTIFICACIÓN DE FALLA (SIGUE ABIERTO)"
          });
          sh.getRange(existingRowIndex, 4, 1, 2).setValues([["ABIERTO", JSON.stringify(oldData)]]);
          updateAssetStatusInSheet(ss, payload.assetId, null, "FALLA", payload.formData?.Comentarios || payload.formData?.comments || payload.formData?.Observaciones, payload.measurements);
          sendTicketEmail(ticketId, payload.formData, payload.assetInfo, "OPEN");
          if (typeof CacheManager !== 'undefined') CacheManager.invalidateAll();
          if (typeof VersionManager !== 'undefined') VersionManager.bumpVersion('ALL');
          return Utils.buildResponse(true, { ticketId: ticketId, reused: true });
        }

        ticketId = "TKT-" + getNextFolio('TICKETS');
    } else {
        for (let i = data.length - 1; i >= 1; i--) {
            if (String(data[i][1]) === String(payload.assetId) && String(data[i][3]) === "ABIERTO") {
                ticketId = data[i][0]; break;
            }
        }
        if(!ticketId) ticketId = "TKT-" + getNextFolio('TICKETS');
    }

    let photoUrls = [];
    if (payload.photos && Array.isArray(payload.photos) && payload.photos.length > 0) {
        const uploadRes = uploadTicketFiles(payload.photos, ticketId, payload.assetInfo);
        if (uploadRes.success) photoUrls = uploadRes.urls;
    }

    if (!payload.formData) payload.formData = {};
    payload.formData.systemUser = userEmail;
    payload.formData.emails_notificados = emailsStr;
    if(photoUrls.length > 0) payload.formData.evidencia_fotos = photoUrls;

    if (payload.mode === 'OPEN') {
        const initialData = { apertura: payload.formData, intentos_medicion: [] };
        sh.appendRow([ticketId, payload.assetId, dateStr, "ABIERTO", JSON.stringify(initialData)]);
        
        // Sincronizar inmediatamente el resultado a FALLA en Col P (sin tocar Col G)
        updateAssetStatusInSheet(ss, payload.assetId, null, "FALLA", payload.formData?.Comentarios || payload.formData?.comments || payload.formData?.Observaciones, payload.measurements);
        
        sendTicketEmail(ticketId, payload.formData, payload.assetInfo, "OPEN");
        if (typeof CacheManager !== 'undefined') CacheManager.invalidateAll();
        if (typeof VersionManager !== 'undefined') VersionManager.bumpVersion('ALL');
        return Utils.buildResponse(true, { ticketId: ticketId });
    } else {
        let isUpdated = false;
        for (let i = data.length - 1; i >= 1; i--) {
          if (String(data[i][1]) === String(payload.assetId) && String(data[i][3]) === "ABIERTO") {
            let oldData = { apertura: {}, intentos_medicion: [] };
            try { oldData = JSON.parse(data[i][4]); } catch(e) {}
            if (!oldData.intentos_medicion) oldData.intentos_medicion = [];
            oldData.intentos_medicion.push({
                fecha: dateStr, ticketData: payload.formData, mediciones: payload.measurements,
                dictamen: payload.passed ? "CUMPLE (CERRADO)" : "NO CUMPLE (SIGUE ABIERTO)"
            });
            sh.getRange(i + 1, 4, 1, 2).setValues([[payload.passed ? "CERRADO" : "ABIERTO", JSON.stringify(oldData)]]);
            isUpdated = true;
            if (payload.passed) sendTicketEmail(ticketId, payload.formData, payload.assetInfo, "CLOSE");
            break;
          }
        }
        
        if (!isUpdated) {
          const newData = { apertura: {}, intentos_medicion: [{ fecha: dateStr, ticketData: payload.formData, mediciones: payload.measurements, dictamen: payload.passed ? "CUMPLE" : "NO CUMPLE" }] };
          sh.appendRow([ticketId, payload.assetId, dateStr, payload.passed ? "CERRADO" : "ABIERTO", JSON.stringify(newData)]);
          if (payload.passed) sendTicketEmail(ticketId, payload.formData, payload.assetInfo, "CLOSE");
        }
        
        // Sincronizar el estatus en Col P de DB_Assets según dictamen de cierre
        if (payload.passed) {
          updateAssetStatusInSheet(ss, payload.assetId, null, "CUMPLE", payload.formData?.Comentarios || payload.formData?.comments || payload.formData?.Observaciones, payload.measurements);
        } else {
          updateAssetStatusInSheet(ss, payload.assetId, null, "FALLA", payload.formData?.Comentarios || payload.formData?.comments || payload.formData?.Observaciones, payload.measurements);
        }

        if (typeof CacheManager !== 'undefined') CacheManager.invalidateAll();
        if (typeof VersionManager !== 'undefined') VersionManager.bumpVersion('ALL');
        return Utils.buildResponse(true, { ticketId: ticketId });
    }
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK, "Guardado de Ticket");
  }
  return runner();
}

function getActiveTicketData(assetId) {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_TICKETS);
    if (!sh) return null;

    const data = sh.getDataRange().getValues();
    const targetId = String(assetId).trim().toUpperCase();
    for (let i = data.length - 1; i >= 1; i--) {
      const rowAssetId = String(data[i][1]).trim().toUpperCase();
      const rowStatus = String(data[i][3]).trim().toUpperCase();

      if (rowAssetId === targetId && rowStatus === "ABIERTO") {
        try {
          const json = JSON.parse(data[i][4]);
          let fotosArray = [];
          let commentsStr = "Sin comentarios en el registro inicial.";
          if (json.apertura) {
              if (json.apertura.evidencia_fotos) {
                  fotosArray = json.apertura.evidencia_fotos.map(url => {
                      const match = String(url).match(/[-\w]{25,}/);
                      return match ? "https://lh3.googleusercontent.com/d/" + match[0] : url;
                  });
              }
              commentsStr = json.apertura.Comentarios || json.apertura.comments || json.apertura.Observaciones || "Sin comentarios en el registro inicial.";
          }
          let fechaString = "N/A";
          if (data[i][2]) fechaString = Utilities.formatDate(new Date(data[i][2]), Session.getScriptTimeZone(), "dd-MMM-yyyy HH:mm");

          return { folio: data[i][0], fecha: fechaString, fotos: fotosArray, comentarios: commentsStr };
        } catch(parseErr) { continue; }
      }
    }
    return null;
  } catch (e) { console.error("Error leyendo tickets:", e); return null; }
}