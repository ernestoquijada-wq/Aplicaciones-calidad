// ==========================================
// 📦 CORE: LECTURA Y ESCRITURA DE ACTIVOS
// ==========================================

function getData() {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const clean = (typeof Utils !== 'undefined' && Utils.clean) ? Utils.clean : (v) => (v === null || v === undefined) ? "" : String(v).trim();
    const formatDateISO = (typeof Utils !== 'undefined' && Utils.formatDateISO) ? Utils.formatDateISO : (d) => {
      if (!d) return "";
      if (d instanceof Date) { try { return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"); } catch (e) { return ""; } }
      return String(d);
    };

    let auditCounts = {};
    if (typeof CacheManager !== 'undefined') {
      const cachedCounts = CacheManager.get(CacheManager.KEYS.AUDIT_COUNTS);
      if (cachedCounts) auditCounts = cachedCounts;
    }
    if (Object.keys(auditCounts).length === 0) {
      const shLogs = ss.getSheetByName(CONF.SHEET_LOGS);
      if (shLogs) {
        const lastRow = shLogs.getLastRow();
        if (lastRow > 1) {
          const colData = shLogs.getRange(2, 3, lastRow - 1, 1).getValues();
          for (let i = 0; i < colData.length; i++) {
            const id = String(colData[i][0]).trim();
            if (id) auditCounts[id] = (auditCounts[id] || 0) + 1;
          }
        }
      }
      if (typeof CacheManager !== 'undefined' && Object.keys(auditCounts).length > 0) {
        CacheManager.put(CacheManager.KEYS.AUDIT_COUNTS, auditCounts, CONF.TIMEOUTS.CACHE_TTL_DEFAULT || 600);
      }
    }

    // 🚀 Optimización de Caché: Intentar obtener catálogos, reglas, matriz y alertas desde CacheService
    let cachedStatic = (typeof CacheManager !== 'undefined') ? CacheManager.get(CacheManager.KEYS.CATALOGS_AND_RULES) : null;
    let rulesDB, catalogs, matrixDB, alertsDB;

    if (cachedStatic && cachedStatic.rulesDB && cachedStatic.catalogs && cachedStatic.matrixDB && cachedStatic.alertsDB) {
      rulesDB = cachedStatic.rulesDB;
      catalogs = cachedStatic.catalogs;
      matrixDB = cachedStatic.matrixDB;
      alertsDB = cachedStatic.alertsDB;
    } else {
      rulesDB = {};
      const shRules = ss.getSheetByName(CONF.SHEET_RULES);
      if(shRules) {
        const data = shRules.getDataRange().getValues();
        for(let i=1; i<data.length; i++) {
          const id = clean(data[i][0]).toUpperCase();
          if(id) {
            rulesDB[id] = {
              surfaceRes: data[i][1], floorMat: data[i][2], elecRes: data[i][3], jack: data[i][4], voltage: data[i][5], impedance: data[i][6],
              defaultIcon: data[i][7] || "fa-box", recommendation: data[i][8] || "", tolerance: data[i][9],
              recs: { surfaceRes: data[i][10] || "", floorMat: data[i][11] || "", elecRes: data[i][12] || "", impedance: data[i][13] || "", voltage: data[i][14] || "", jack: data[i][15] || "" }
            };
          }
        }
      }

      catalogs = { sectors: [], factories: [], projects: [], auditors: [], templates: [], ticketFields: [], emailGroups: [], aiPrompts: [] };
      const shConfig = ss.getSheetByName(CONF.SHEET_CONFIG);
      if(shConfig) {
        const data = shConfig.getDataRange().getValues();
        for(let i=1; i<data.length; i++) {
          const cat = clean(data[i][0]).toUpperCase();
          const id = clean(data[i][1]);
          const label = clean(data[i][2]) || id;
          let hex = clean(data[i][3]);
          if (cat === "SECTOR" && hex && !hex.startsWith("#")) hex = "#" + hex;
          
          let configJson = { startRow: 8, columns: [] };
          try { if(data[i][4]) configJson = JSON.parse(data[i][4]); } catch(e){}

          if(id) {
             const item = { id: id, label: label, hex: hex, config: configJson };
             if(cat === "SECTOR") catalogs.sectors.push(item);
             else if(cat === "FACTORY") catalogs.factories.push(item);
             else if(cat === "PROJECT") catalogs.projects.push(item);
             else if(cat === "AUDITOR") catalogs.auditors.push(item);
             else if(cat === "TEMPLATE") catalogs.templates.push(item);
             else if(cat === "TICKET_FIELD") catalogs.ticketFields.push(item);
             else if(cat === "EMAIL_GROUP") catalogs.emailGroups.push(item);
             else if(cat === "AI_PROMPT") catalogs.aiPrompts.push(item);
          }
        }
      }

      matrixDB = { validationReasons: [] };
      const shMatrix = ss.getSheetByName(CONF.SHEET_MATRIX);
      if(shMatrix) {
        const data = shMatrix.getDataRange().getValues();
        for(let i=1; i<data.length; i++) { 
          if(String(data[i][0]).toUpperCase() === "VALIDATION_REASON") {
             const stName = clean(data[i][1]);
             const stUpper = stName.toUpperCase();
             const rawReqMeas = data[i][5];
             const defaultReqMeas = !['BAJA', 'SCRAP', 'OBSOLETO', 'DESINCORPORADO'].includes(stUpper);
             const requiresMeasurements = (rawReqMeas === "" || rawReqMeas === null || rawReqMeas === undefined)
               ? defaultReqMeas
               : (rawReqMeas === true || String(rawReqMeas).toLowerCase() === 'true');
             matrixDB.validationReasons.push({
                 name: stName,
                 showCard: data[i][2] === true || String(data[i][2]).toLowerCase() === 'true',
                 color: clean(data[i][3]) || '#64748b',
                 isAdmin: data[i][4] === true || String(data[i][4]).toLowerCase() === 'true',
                 requiresMeasurements: requiresMeasurements
             });
          } 
        }
      }

      alertsDB = [];
      let shAlerts = ss.getSheetByName(CONF.SHEET_ALERTS);
      if (!shAlerts) {
        shAlerts = ss.insertSheet(CONF.SHEET_ALERTS);
        const alertHeaders = ['ID', 'Nombre', 'Campo_Objetivo', 'Valores_Disparo', 'Color_Fondo', 'Color_Texto', 'Color_Borde', 'Icono', 'Pulso', 'Mostrar_Prefijo', 'Activo'];
        shAlerts.getRange(1, 1, 1, alertHeaders.length).setValues([alertHeaders]).setFontWeight('bold').setBackground(CONF.DEFAULT_COLOR).setFontColor('white').setHorizontalAlignment('center');
        shAlerts.setFrozenRows(1);
      }
      
      const alertsData = shAlerts.getDataRange().getValues();
      if (alertsData.length <= 1) {
        // Sembrar reglas por defecto estándar de la industria
        const defaultRules = [
          ['ALERT_FAIL', 'FALLA', 'RESULTADO', 'FALLA, FAIL, F, RECHAZADO, NO CUMPLE', '#fee2e2', '#b91c1c', '#fca5a5', 'fa-exclamation-circle', true, true, true],
          ['ALERT_WARNING', 'POR VENCER', 'VENCIMIENTO', 'POR_VENCER', '#fef3c7', '#b45309', '#fcd34d', 'fa-exclamation-triangle', false, true, true],
          ['ALERT_BAJA', 'EQUIPO EN BAJA', 'ESTADO', 'BAJA', '#f1f5f9', '#475569', '#cbd5e1', 'fa-ban', false, false, true]
        ];
        shAlerts.getRange(2, 1, defaultRules.length, defaultRules[0].length).setValues(defaultRules);
        defaultRules.forEach(r => {
          alertsDB.push({
            id: r[0], name: r[1], targetField: r[2], triggerValues: r[3],
            bgColor: r[4], textColor: r[5], borderColor: r[6], icon: r[7],
            pulse: r[8], showPrefix: r[9], active: r[10]
          });
        });
      } else {
        for (let i = 1; i < alertsData.length; i++) {
          const row = alertsData[i];
          const id = clean(row[0]);
          if (!id) continue;
          alertsDB.push({
            id: id,
            name: clean(row[1]) || id,
            targetField: clean(row[2]).toUpperCase() || 'RESULTADO',
            triggerValues: clean(row[3]),
            bgColor: clean(row[4]) || '#fee2e2',
            textColor: clean(row[5]) || '#b91c1c',
            borderColor: clean(row[6]) || '#fca5a5',
            icon: clean(row[7]) || 'fa-exclamation-circle',
            pulse: row[8] === true || String(row[8]).toLowerCase() === 'true',
            showPrefix: row[9] === true || String(row[9]).toLowerCase() === 'true',
            active: row[10] === true || String(row[10]).toLowerCase() === 'true'
          });
        }
      }

      if (typeof CacheManager !== 'undefined') {
        CacheManager.put(CacheManager.KEYS.CATALOGS_AND_RULES, { rulesDB, catalogs, matrixDB, alertsDB });
      }
    }

    // 🚀 Optimización I/O: Lectura en bloque de todas las propiedades del script en 1 sola llamada
    const props = PropertiesService.getScriptProperties();
    const allProps = props.getProperties();

    // Verificación única de esquema: desacoplada de la ruta crítica de lectura
    if (allProps['DB_CONFIGURED_ESTADO_REGISTRO'] !== 'true') {
      autoConfigurarBaseDatos();
      props.setProperty('DB_CONFIGURED_ESTADO_REGISTRO', 'true');
    }

    let openTickets = {};
    const shTickets = ss.getSheetByName(CONF.SHEET_TICKETS);
    if (shTickets) {
      const tktData = shTickets.getDataRange().getValues();
      for (let i = 1; i < tktData.length; i++) {
        const tktAssetId = clean(tktData[i][1]).toUpperCase();
        const tktStatus = clean(tktData[i][3]).toUpperCase();
        if (tktAssetId && tktStatus === "ABIERTO") {
          let comments = "";
          try {
            const parsed = JSON.parse(tktData[i][4]);
            comments = parsed?.apertura?.Comentarios || parsed?.apertura?.comments || parsed?.apertura?.Observaciones || "";
          } catch(e) {}
          openTickets[tktAssetId] = {
            folio: clean(tktData[i][0]),
            date: tktData[i][2] ? Utilities.formatDate(new Date(tktData[i][2]), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm") : "",
            comments: comments
          };
        }
      }
    }

    let assets = [];
    const shAssets = ss.getSheetByName(CONF.SHEET_ASSETS);
    if(shAssets) {
      const data = shAssets.getDataRange().getValues();
      const headers = data[0] || [];
      const estadoColIndex = (typeof DataRepository !== 'undefined')
        ? DataRepository.findHeaderIndex(headers, 'ESTADO_REGISTRO', -1)
        : headers.indexOf("Estado_Registro");

      for(let i=1; i<data.length; i++) {
        const r = data[i];
        if(!r[0]) continue;
        const q = clean(r[1]).toUpperCase();
        let c = clean(r[2]);
        if(!c || c === "#000000" || c === "#000") { 
            const foundSector = catalogs.sectors.find(s => s.id.toUpperCase() === q);
            c = foundSector ? foundSector.hex : CONF.DEFAULT_COLOR; 
        }
        
        const estadoReg = estadoColIndex > -1 ? clean(r[estadoColIndex]).toUpperCase() : "ACTIVO";
        const assetIdClean = clean(r[0]).toUpperCase();

        assets.push({
          rowIndex: i + 1, controlNo: clean(r[0]), quadrant: q, colorCode: c,
          description: clean(r[3]), project: clean(r[4]), factory: clean(r[5]), status: clean(r[6]),
          measurements: { surfaceRes: { mantissa: clean(r[7]), exponent: clean(r[8]) }, floorMat: { mantissa: clean(r[9]), exponent: clean(r[10]) }, elecRes: clean(r[11]), impedance: clean(r[12]), voltage: clean(r[13]), jack: clean(r[14]) },
          lastResult: (typeof Utils !== 'undefined' && Utils.normalizeStatusResult) ? Utils.normalizeStatusResult(clean(r[15])) : clean(r[15]), lastDate: formatDateISO(r[16]), nextDate: formatDateISO(r[17]),
          responsible: clean(r[18]), comments: clean(r[19]),
          auditCount: auditCounts[clean(r[0])] || 0, estadoRegistro: estadoReg,
          openTicket: openTickets[assetIdClean] || null
        });
      }
    }

    const masterConfigStr = allProps['EMAIL_MASTER_CONFIG'];
    let emailSettings = masterConfigStr ? JSON.parse(masterConfigStr) : {
        OPEN: { to: '', subject: '⚠️ FALLA DETECTADA - {{ID_ACTIVO}}', body: 'Se ha reportado una falla en el activo {{ID_ACTIVO}} ({{DESCRIPCION}}).', factoryRules: [] },
        CLOSE: { to: '', subject: '✅ EQUIPO REPARADO / LIBERADO - {{ID_ACTIVO}}', body: 'El activo {{ID_ACTIVO}} ha pasado la verificación y el ticket {{FOLIO_TICKET}} ha sido cerrado.', factoryRules: [] },
        FORCED: { to: '', subject: '⚠️ ALERTA: Dictamen Forzado - {{ID_ACTIVO}}', body: 'Se ha registrado un resultado manual que requiere revisión para {{ID_ACTIVO}}.', factoryRules: [] }
    };

    const aiConfigStr = allProps['AI_COPILOT_CONFIG'];
    let aiSettings = aiConfigStr ? JSON.parse(aiConfigStr) : { enabled: false, apiKeys: [''], activePromptId: '' };

    const rolesStr = allProps['ROLES_DB'];
    const usersStr = allProps['USERS_DB'];
    let rolesDB = rolesStr ? JSON.parse(rolesStr) : {
        "SUPER_ADMIN": { canView: true, canAudit: true, canConfig: true, canUsers: true, canUseCopilot: true },
        "AUDITOR": { canView: true, canAudit: true, canConfig: false, canUsers: false, canUseCopilot: true },
        "INVITADO": { canView: true, canAudit: false, canConfig: false, canUsers: false, canUseCopilot: false }
    };
    let usersDB = usersStr ? JSON.parse(usersStr) : {};

    const rawEmail = Session.getActiveUser().getEmail();
    const userEmail = rawEmail ? rawEmail.toLowerCase().trim() : 'invitado@anonimo.com';
    
    let userRoleName = usersDB[userEmail] || "INVITADO";
    if (Object.keys(usersDB).length === 0 && userEmail !== 'invitado@anonimo.com') {
        usersDB[userEmail] = "SUPER_ADMIN";
        userRoleName = "SUPER_ADMIN";
        props.setProperty('USERS_DB', JSON.stringify(usersDB));
    }
    const userPermissions = rolesDB[userRoleName] || rolesDB["INVITADO"];
    const showPrevEv = allProps['SETTING_SHOW_PREV_EVIDENCE'] === 'true';

    // Sanitizar aiConfig: solo enviar llaves privadas a roles con permiso canConfig
    const clientAiSettings = {
      enabled: !!aiSettings.enabled,
      activePromptId: aiSettings.activePromptId || '',
      apiKeys: (userPermissions && userPermissions.canConfig) ? (aiSettings.apiKeys || ['']) : ['']
    };

    const serverVersion = (typeof VersionManager !== 'undefined') ? VersionManager.getVersion() : String(Date.now());

    // Calcular y cachear el resumen del Banner Dinámico (Próximo Consecutivo y Último Registro) en O(N) en memoria
    let maxNumericAssetId = 0;
    let latestActiveAsset = null;
    for (let idx = 0; idx < assets.length; idx++) {
      const item = assets[idx];
      const num = parseInt(String(item.controlNo || '').replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > maxNumericAssetId && num < 999999) {
        maxNumericAssetId = num;
      }
      const estReg = String(item.estadoRegistro || 'ACTIVO').toUpperCase();
      const stCol = String(item.status || '').toUpperCase();
      const resCol = String(item.lastResult || '').toUpperCase();
      if (estReg !== 'INACTIVO' && stCol !== 'BAJA' && resCol !== 'BAJA') {
        latestActiveAsset = {
          controlNo: item.controlNo,
          quadrant: item.quadrant,
          colorCode: item.colorCode,
          description: item.description,
          project: item.project,
          factory: item.factory,
          status: item.status,
          lastResult: item.lastResult
        };
      }
    }
    const bannerSummary = {
      nextAssetId: maxNumericAssetId + 1,
      lastAsset: latestActiveAsset
    };
    if (typeof CacheManager !== 'undefined') {
      CacheManager.put(CacheManager.KEYS.ASSET_BANNER, bannerSummary, CacheManager.DEFAULT_TTL);
    }

    // Registrar sesión deduplicada (ventana 30m) y presencia activa en CacheService
    try {
      if (typeof TrafficMonitor !== 'undefined') {
        TrafficMonitor.recordUserSessionIfNeeded(userEmail, userRoleName);
      }
    } catch (trafficErr) {}

    // Hidratar mapa de traducciones dinámicas desde CacheService en 0ms
    let cachedTranslations = {};
    try {
      if (typeof CacheService !== 'undefined') {
        const dynMapKey = (CONF.CACHE_KEYS && CONF.CACHE_KEYS.I18N_DYNAMIC_MAP) || 'ESD_CACHE_I18N_DYNAMIC_MAP';
        const rawDyn = CacheService.getScriptCache().get(dynMapKey);
        if (rawDyn) cachedTranslations = JSON.parse(rawDyn);
      }
    } catch (trErr) {}

    return { 
      success: true, assets, rules: rulesDB, catalogs, matrix: matrixDB, alerts: alertsDB || [],
      email: emailSettings, aiConfig: clientAiSettings, rolesDB: rolesDB, usersDB: usersDB,
      userRoleName: userRoleName, userPermissions: userPermissions, showPrevEvidence: showPrevEv,
      user: userEmail, serverTime: new Date().toISOString(),
      serverVersion: serverVersion,
      bannerSummary: bannerSummary,
      cachedTranslations: cachedTranslations
    };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function saveNewAsset(payload) {
  if (!payload || !payload.asset) {
    return Utils.buildResponse(false, "Datos de activo inválidos o incompletos.");
  }

  const a = payload.asset;
  if (typeof Validator !== 'undefined') {
    const valRes = Validator.validateRequired(a, ['quadrant', 'description', 'project', 'factory']);
    if (!valRes.valid) {
      return Utils.buildResponse(false, valRes.message);
    }
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_ASSETS);
    if (!sh) return Utils.buildResponse(false, "Hoja de activos no encontrada.");

    const data = sh.getDataRange().getValues();
    let maxId = 0;
    const existingIds = new Set();
    for (let i = 1; i < data.length; i++) {
      const rawCellId = String(data[i][0] || '').trim().toUpperCase();
      if (rawCellId) existingIds.add(rawCellId);
      const v = parseInt(rawCellId.replace(/\D/g, ''), 10);
      if (!isNaN(v) && v > maxId && v < 999999) maxId = v;
    }

    // Asignación atómica libre de colisiones bajo LockService:
    // Si no se envió ID o si el ID sugerido ya fue tomado por otro usuario concurrente, se asigna maxId + 1
    let newId = a.controlNo ? String(a.controlNo).trim() : String(maxId + 1);
    if (existingIds.has(newId.toUpperCase())) {
      newId = String(maxId + 1);
    }

    const f = payload.formData || {};
    const m = f.measurements || {};
    const chk = (val) => (val === null || val === undefined || val === "") ? "N/A" : val;

    const rawDate = f.validationDate ? new Date(f.validationDate) : new Date();
    const vDateUser = new Date(rawDate.getTime() + rawDate.getTimezoneOffset()*60000); 
    
    const nDate = new Date(vDateUser);
    nDate.setFullYear(nDate.getFullYear() + 1);
    nDate.setMonth(nDate.getMonth() + 1, 0); 

    const vDateStr = Utilities.formatDate(vDateUser, Session.getScriptTimeZone(), "dd-MMM-yy");
    const nDateStr = Utilities.formatDate(nDate, Session.getScriptTimeZone(), "dd-MMM-yy");

    const safeStatus = (a.status && String(a.status).trim()) ? String(a.status).trim() : "Validación";
    const safeResult = (typeof Utils !== 'undefined' && Utils.normalizeStatusResult) ? Utils.normalizeStatusResult(f.result) : (f.result || "CUMPLE");

    const headers = data[0] || [];
    const estadoColIndex = (typeof DataRepository !== 'undefined')
      ? DataRepository.findHeaderIndex(headers, 'ESTADO_REGISTRO', -1)
      : headers.indexOf("Estado_Registro");
    const modColIndex = (typeof DataRepository !== 'undefined')
      ? DataRepository.findHeaderIndex(headers, 'LAST_MODIFIED', -1)
      : headers.indexOf("LastModified");

    const row = [
      newId, a.quadrant, a.colorCode || CONF.DEFAULT_COLOR, a.description, a.project, a.factory, safeStatus,
      chk(m.surfaceRes?.mantissa), chk(m.surfaceRes?.exponent), chk(m.floorMat?.mantissa), chk(m.floorMat?.exponent),
      chk(m.elecRes), chk(m.impedance), chk(m.voltage), chk(m.jack),
      safeResult, vDateStr, nDateStr, a.responsible || "", f.comments||""
    ];
    while (row.length < headers.length) row.push("");
    if (estadoColIndex !== -1) row[estadoColIndex] = "ACTIVO";
    if (modColIndex !== -1) row[modColIndex] = new Date().toISOString();

    sh.appendRow(row);
    if (modColIndex === -1) stampLastModified(sh, sh.getLastRow());
    logAudit(ss, newId, f.result, { ...m, comments: f.comments, nextDate: nDateStr, validationDate: vDateStr });
    
    // Forzar volcado físico a Google Sheets antes de liberar el bloqueo atómico
    SpreadsheetApp.flush();
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateAll();
    if (typeof VersionManager !== 'undefined') VersionManager.bumpVersion('ALL');
    return Utils.buildResponse(true, { id: newId });
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK, "Registro de Activo");
  }
  return runner();
}

function processAudit(payload) {
  if (!payload || !payload.asset || typeof payload.asset.rowIndex !== 'number' || payload.asset.rowIndex < 2) {
    return Utils.buildResponse(false, "Datos de activo o índice de fila inválidos.");
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_ASSETS);
    if (!sh) return Utils.buildResponse(false, "Hoja de activos no encontrada.");

    const { formData, asset } = payload;
    const numCols = Math.max(sh.getLastColumn(), 20);
    const headers = sh.getRange(1, 1, 1, numCols).getValues()[0];
    const targetControlNo = String(asset.controlNo || '').trim().toUpperCase();

    let r = Number(asset.rowIndex);
    let rowValues = null;

    if (r >= 2 && r <= sh.getLastRow()) {
      const candidateRow = sh.getRange(r, 1, 1, numCols).getValues()[0];
      if (String(candidateRow[0] || '').trim().toUpperCase() === targetControlNo) {
        rowValues = candidateRow;
      }
    }

    // Fallback: si rowIndex se desfasó o no coincide con controlNo, buscar la fila exacta por ID
    if (!rowValues && targetControlNo) {
      const allIds = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
      for (let idx = 1; idx < allIds.length; idx++) {
        if (String(allIds[idx][0] || '').trim().toUpperCase() === targetControlNo) {
          r = idx + 1;
          rowValues = sh.getRange(r, 1, 1, numCols).getValues()[0];
          break;
        }
      }
    }

    if (!rowValues) {
      return Utils.buildResponse(false, "No se encontró el activo " + targetControlNo + " en la base de datos maestra.");
    }

    // Actualizar todos los campos de INFORMACIÓN GENERAL en DB_Assets
    if (asset.quadrant !== undefined && String(asset.quadrant).trim() !== "") {
      rowValues[1] = String(asset.quadrant).trim().toUpperCase();
    }
    if (asset.colorCode !== undefined && String(asset.colorCode).trim() !== "") {
      rowValues[2] = String(asset.colorCode).trim();
    }
    if (asset.description !== undefined && String(asset.description).trim() !== "") {
      rowValues[3] = String(asset.description).trim().toUpperCase();
    }
    if (asset.project !== undefined && String(asset.project).trim() !== "") {
      rowValues[4] = String(asset.project).trim();
    }
    if (asset.factory !== undefined && String(asset.factory).trim() !== "") {
      rowValues[5] = String(asset.factory).trim();
    }
    if (asset.status && String(asset.status).trim()) {
      rowValues[6] = String(asset.status).trim();
    } else if (!rowValues[6]) {
      rowValues[6] = "Validación";
    }
    if (asset.responsible !== undefined && String(asset.responsible).trim() !== "") {
      rowValues[18] = String(asset.responsible).trim();
    }

    let vDateStr = "";
    let nDateStr = "";
    const m = (formData && formData.measurements) || {};

    if (formData && formData.isAudit) {
      const chk = (val) => (val === null || val === undefined || val === "") ? "N/A" : val;
      rowValues[7] = chk(m.surfaceRes?.mantissa);
      rowValues[8] = chk(m.surfaceRes?.exponent);
      rowValues[9] = chk(m.floorMat?.mantissa);
      rowValues[10] = chk(m.floorMat?.exponent);
      rowValues[11] = chk(m.elecRes);
      rowValues[12] = chk(m.impedance);
      rowValues[13] = chk(m.voltage);
      rowValues[14] = chk(m.jack);

      // Sincronizar el resultado técnico (Col P, index 15) sin violar validación de Col G
      const normalizedRes = (typeof Utils !== 'undefined' && Utils.normalizeStatusResult) 
        ? Utils.normalizeStatusResult(formData.result) 
        : String(formData.result || '').toUpperCase().trim();
        
      if (normalizedRes === 'FALLA' || normalizedRes === 'NO CUMPLE') {
        rowValues[15] = "FALLA";
      } else if (normalizedRes === 'CUMPLE') {
        rowValues[15] = "CUMPLE";
      } else if (normalizedRes === 'BAJA' || String(asset.status || '').toUpperCase().trim() === 'BAJA') {
        rowValues[15] = "BAJA";
      } else if (formData.result) {
        rowValues[15] = formData.result;
      }

      const vDateUser = new Date(formData.validationDate);
      const vDateFixed = new Date(vDateUser.getTime() + vDateUser.getTimezoneOffset()*60000);
      const nDate = new Date(vDateFixed); 
      nDate.setFullYear(nDate.getFullYear() + 1);
      nDate.setMonth(nDate.getMonth() + 1, 0);

      vDateStr = Utilities.formatDate(vDateFixed, Session.getScriptTimeZone(), "dd-MMM-yy");
      nDateStr = Utilities.formatDate(nDate, Session.getScriptTimeZone(), "dd-MMM-yy");

      rowValues[16] = vDateStr;
      rowValues[17] = nDateStr;
      rowValues[19] = formData.comments || "";
    }

    const modColIndex = (typeof DataRepository !== 'undefined')
      ? DataRepository.findHeaderIndex(headers, 'LAST_MODIFIED', -1)
      : headers.indexOf('LastModified');
    if (modColIndex !== -1 && modColIndex < rowValues.length) {
      rowValues[modColIndex] = new Date().toISOString();
    }

    // Escritura única por lote para toda la fila
    sh.getRange(r, 1, 1, rowValues.length).setValues([rowValues]);

    // Si el activo se da de BAJA, auto-cerrar cualquier ticket abierto asociado
    const isBajaAction = String(asset.status || '').toUpperCase().trim() === 'BAJA' || (formData && String(formData.result || '').toUpperCase().trim() === 'BAJA');
    if (isBajaAction) {
      try {
        const shTkts = ss.getSheetByName(CONF.SHEET_TICKETS);
        if (shTkts) {
          const tktData = shTkts.getDataRange().getValues();
          const targetAsset = String(asset.controlNo).trim().toUpperCase();
          const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
          for (let ti = tktData.length - 1; ti >= 1; ti--) {
            if (String(tktData[ti][1]).trim().toUpperCase() === targetAsset && String(tktData[ti][3]).trim().toUpperCase() === "ABIERTO") {
              let oldData = { apertura: {}, intentos_medicion: [] };
              try { oldData = JSON.parse(tktData[ti][4]); } catch(e) {}
              if (!oldData.intentos_medicion) oldData.intentos_medicion = [];
              oldData.intentos_medicion.push({
                fecha: dateStr,
                ticketData: { comments: (formData && formData.comments) || "Baja administrativa de activo" },
                dictamen: "CERRADO POR BAJA DE ACTIVO"
              });
              shTkts.getRange(ti + 1, 4, 1, 2).setValues([["CERRADO", JSON.stringify(oldData)]]);
            }
          }
        }
      } catch (tktErr) {
        console.error("Error al auto-cerrar tickets por baja:", tktErr);
      }
    }

    if (formData && formData.isAudit) {
      logAudit(ss, asset.controlNo, formData.result, { ...m, comments: formData.comments, nextDate: nDateStr, validationDate: vDateStr });
      
      if (formData.requiresSecondRevision) {
         const alertData = {
           result: formData.result,
           Comentarios: formData.comments || "",
           auditComments: formData.comments || "",
           emails_notificados: "",
           evidencia_fotos: [],
           systemUser: Session.getActiveUser().getEmail() || (typeof Utils !== 'undefined' && Utils.getActiveUserEmail ? Utils.getActiveUserEmail() : '') || (formData && formData.auditor) || ''
         };
         sendTicketEmail("ALERTA-CALIDAD", alertData, asset, "FORCED");
      }
    }

    SpreadsheetApp.flush();
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateAll();
    if (typeof VersionManager !== 'undefined') VersionManager.bumpVersion('ALL');
    if (asset && asset.controlNo && typeof PresenceManager !== 'undefined') {
      const activeUser = Session.getActiveUser().getEmail() || (formData && formData.auditor) || '';
      PresenceManager.release(asset.controlNo, activeUser);
    }
    return Utils.buildResponse(true, { nextDate: nDateStr, validationDate: vDateStr });
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Auditoría de Activo");
  }
  return runner();
}

function autoConfigurarBaseDatos() {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sheet = ss.getSheetByName(CONF.SHEET_ASSETS);
    if (!sheet) return;
    const numCols = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
    
    let estadoColIndex = (typeof DataRepository !== 'undefined')
      ? DataRepository.findHeaderIndex(headers, 'ESTADO_REGISTRO', -1)
      : headers.indexOf("Estado_Registro");
    if (estadoColIndex === -1) {
      const newColIndex = numCols + 1;
      sheet.getRange(1, newColIndex).setValue("Estado_Registro");
      sheet.getRange(1, newColIndex).setFontWeight('bold').setBackground(CONF.DEFAULT_COLOR).setFontColor('white');
      const numRows = sheet.getLastRow();
      if (numRows > 1) {
        const activosArray = new Array(numRows - 1).fill(["ACTIVO"]);
        sheet.getRange(2, newColIndex, numRows - 1, 1).setValues(activosArray);
      }
    }
  } catch (error) { console.error("Error en auto-configuración: " + error); }
}

function adminDeleteAsset(id) {
  if (typeof Validator !== 'undefined' && Validator.isBlank(id)) {
    return Utils.buildResponse(false, "ID de activo no proporcionado.");
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_ASSETS);
    if (!sh) return Utils.buildResponse(false, "Hoja de activos no encontrada.");
    const data = sh.getDataRange().getValues();
    const headers = data[0];
    const estadoColIndex = ((typeof DataRepository !== 'undefined')
      ? DataRepository.findHeaderIndex(headers, 'ESTADO_REGISTRO', -1)
      : headers.indexOf("Estado_Registro")) + 1;
    if (estadoColIndex === 0) return Utils.buildResponse(false, "Columna de Estado_Registro no encontrada.");

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === String(id).trim().toUpperCase()) {
        sh.getRange(i + 1, estadoColIndex).setValue("INACTIVO");
        stampLastModified(sh, i + 1);
        if (typeof CacheManager !== 'undefined') CacheManager.invalidateAll();
        if (typeof VersionManager !== 'undefined') VersionManager.bumpVersion('ASSETS');
        return Utils.buildResponse(true);
      }
    }
    return Utils.buildResponse(false, "Equipo no encontrado");
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Eliminar Activo");
  }
  return runner();
}