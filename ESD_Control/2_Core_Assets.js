// ==========================================
// 📦 CORE: LECTURA Y ESCRITURA DE ACTIVOS
// ==========================================

function getData() {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const clean = (v) => (v === null || v === undefined) ? "" : String(v).trim();
    const formatDateISO = (d) => {
      if (!d) return "";
      if (d instanceof Date) { try { return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"); } catch (e) { return ""; } }
      return String(d);
    };

    let auditCounts = {};
    const shLogs = ss.getSheetByName(CONF.SHEET_LOGS);
    if(shLogs) {
      const logData = shLogs.getDataRange().getValues();
      for(let i=1; i<logData.length; i++) {
        const id = String(logData[i][2]);
        auditCounts[id] = (auditCounts[id] || 0) + 1;
      }
    }

    let rulesDB = {};
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

    let catalogs = { sectors: [], factories: [], projects: [], auditors: [], templates: [], ticketFields: [], emailGroups: [], aiPrompts: [] };
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

    let matrixDB = { validationReasons: [] };
    const shMatrix = ss.getSheetByName(CONF.SHEET_MATRIX);
    if(shMatrix) {
      const data = shMatrix.getDataRange().getValues();
      for(let i=1; i<data.length; i++) { 
        if(String(data[i][0]).toUpperCase() === "VALIDATION_REASON") {
           matrixDB.validationReasons.push({
               name: clean(data[i][1]),
               showCard: data[i][2] === true || String(data[i][2]).toLowerCase() === 'true',
               color: clean(data[i][3]) || '#64748b',
               isAdmin: data[i][4] === true || String(data[i][4]).toLowerCase() === 'true'
           });
        } 
      }
    }

    let assets = [];
    autoConfigurarBaseDatos(); 
    const shAssets = ss.getSheetByName(CONF.SHEET_ASSETS);
    if(shAssets) {
      const data = shAssets.getDataRange().getValues();
      const headers = data[0] || [];
      const estadoColIndex = headers.indexOf("Estado_Registro");

      for(let i=1; i<data.length; i++) {
        const r = data[i];
        if(!r[0]) continue;
        const q = clean(r[1]).toUpperCase();
        let c = clean(r[2]);
        if(!c || c === "#000000" || c === "#000") { 
            const foundSector = catalogs.sectors.find(s => s.id.toUpperCase() === q);
            c = foundSector ? foundSector.hex : "#005565"; 
        }
        
        const estadoReg = estadoColIndex > -1 ? clean(r[estadoColIndex]).toUpperCase() : "ACTIVO";

        assets.push({
          rowIndex: i + 1, controlNo: clean(r[0]), quadrant: q, colorCode: c,
          description: clean(r[3]), project: clean(r[4]), factory: clean(r[5]), status: clean(r[6]),
          measurements: { surfaceRes: { mantissa: clean(r[7]), exponent: clean(r[8]) }, floorMat: { mantissa: clean(r[9]), exponent: clean(r[10]) }, elecRes: clean(r[11]), impedance: clean(r[12]), voltage: clean(r[13]), jack: clean(r[14]) },
          lastResult: clean(r[15]), lastDate: formatDateISO(r[16]), nextDate: formatDateISO(r[17]),
          responsible: clean(r[18]), comments: clean(r[19]),
          auditCount: auditCounts[clean(r[0])] || 0, estadoRegistro: estadoReg 
        });
      }
    }

    const props = PropertiesService.getScriptProperties();
    const masterConfigStr = props.getProperty('EMAIL_MASTER_CONFIG');
    let emailSettings = masterConfigStr ? JSON.parse(masterConfigStr) : {
        OPEN: { to: '', subject: '⚠️ FALLA DETECTADA', body: 'Se ha reportado una falla en el siguiente activo.' },
        CLOSE: { to: '', subject: '✅ EQUIPO REPARADO / LIBERADO', body: 'El activo ha pasado la verificación y el ticket ha sido cerrado.' },
        FORCED: { to: '', subject: '⚠️ ALERTA: Dictamen Forzado', body: 'Se ha registrado un resultado manual que requiere revisión.' }
    };

    const aiConfigStr = props.getProperty('AI_COPILOT_CONFIG');
    let aiSettings = aiConfigStr ? JSON.parse(aiConfigStr) : { enabled: false, apiKeys: [''], activePromptId: '' };

    const rolesStr = props.getProperty('ROLES_DB');
    const usersStr = props.getProperty('USERS_DB');
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
    const showPrevEv = props.getProperty('SETTING_SHOW_PREV_EVIDENCE') === 'true';

    // Sanitizar aiConfig: solo enviar llaves privadas a roles con permiso canConfig
    const clientAiSettings = {
      enabled: !!aiSettings.enabled,
      activePromptId: aiSettings.activePromptId || '',
      apiKeys: (userPermissions && userPermissions.canConfig) ? (aiSettings.apiKeys || ['']) : ['']
    };

    return { 
      success: true, assets, rules: rulesDB, catalogs, matrix: matrixDB, 
      email: emailSettings, aiConfig: clientAiSettings, rolesDB: rolesDB, usersDB: usersDB,
      userRoleName: userRoleName, userPermissions: userPermissions, showPrevEvidence: showPrevEv,
      user: userEmail, serverTime: new Date().toISOString() 
    };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function saveNewAsset(payload) {
  const lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_ASSETS);
    
    const data = sh.getDataRange().getValues();
    let maxId = 0;
    for(let i=1; i<data.length; i++) {
      let v = parseInt(String(data[i][0]).replace(/\D/g,''), 10);
      if(!isNaN(v) && v > maxId && v < 999999) maxId = v;
    }
    const newId = payload.asset.controlNo || (maxId + 1);

    const a = payload.asset;
    const f = payload.formData;
    const m = f.measurements || {};
    const chk = (val) => (val === null || val === undefined || val === "") ? "N/A" : val;

    const rawDate = f.validationDate ? new Date(f.validationDate) : new Date();
    const vDateUser = new Date(rawDate.getTime() + rawDate.getTimezoneOffset()*60000); 
    
    const nDate = new Date(vDateUser);
    nDate.setFullYear(nDate.getFullYear() + 1);
    nDate.setMonth(nDate.getMonth() + 1, 0); 

    const vDateStr = Utilities.formatDate(vDateUser, Session.getScriptTimeZone(), "dd-MMM-yy");
    const nDateStr = Utilities.formatDate(nDate, Session.getScriptTimeZone(), "dd-MMM-yy");

    const row = [
      newId, a.quadrant, a.colorCode, a.description, a.project, a.factory, a.status,
      chk(m.surfaceRes?.mantissa), chk(m.surfaceRes?.exponent), chk(m.floorMat?.mantissa), chk(m.floorMat?.exponent),
      chk(m.elecRes), chk(m.impedance), chk(m.voltage), chk(m.jack),
      f.result||"", vDateStr, nDateStr, a.responsible, f.comments||""
    ];

    sh.appendRow(row);
    stampLastModified(sh, sh.getLastRow());
    logAudit(ss, newId, f.result, { ...m, comments: f.comments, nextDate: nDateStr, validationDate: vDateStr });
    
    return { success: true, id: newId };
  } catch(e) { return { success: false, error: e.toString() }; } finally { lock.releaseLock(); }
}

function processAudit(payload) {
  const lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_ASSETS);
    const { formData, asset } = payload;
    const r = asset.rowIndex;

    sh.getRange(r, 2).setValue(asset.quadrant);
    sh.getRange(r, 3).setValue(asset.colorCode);
    sh.getRange(r, 7).setValue(asset.status);
    sh.getRange(r, 19).setValue(asset.responsible);

    if(formData.isAudit) {
      const m = formData.measurements;
      const chk = (val) => (val === null || val === undefined || val === "") ? "N/A" : val;
      const techRow = [[
        chk(m.surfaceRes?.mantissa), chk(m.surfaceRes?.exponent), chk(m.floorMat?.mantissa), chk(m.floorMat?.exponent),
        chk(m.elecRes), chk(m.impedance), chk(m.voltage), chk(m.jack), formData.result
      ]];
      
      sh.getRange(r, 8, 1, 9).setValues(techRow);

      const vDateUser = new Date(formData.validationDate);
      const vDateFixed = new Date(vDateUser.getTime() + vDateUser.getTimezoneOffset()*60000);
      const nDate = new Date(vDateFixed); 
      nDate.setFullYear(nDate.getFullYear() + 1);
      nDate.setMonth(nDate.getMonth() + 1, 0);

      const vDateStr = Utilities.formatDate(vDateFixed, Session.getScriptTimeZone(), "dd-MMM-yy");
      const nDateStr = Utilities.formatDate(nDate, Session.getScriptTimeZone(), "dd-MMM-yy");

      sh.getRange(r, 17).setValue(vDateStr);
      sh.getRange(r, 18).setValue(nDateStr);
      sh.getRange(r, 20).setValue(formData.comments||"");
      stampLastModified(sh, r);
      
      logAudit(ss, asset.controlNo, formData.result, { ...m, comments: formData.comments, nextDate: nDateStr, validationDate: vDateStr });
      
      if (formData.requiresSecondRevision) {
         const alertData = { result: formData.result, emails_notificados: "", evidencia_fotos: [], systemUser: Session.getActiveUser().getEmail() };
         sendTicketEmail("ALERTA-CALIDAD", alertData, asset, "FORCED");
      }
    }
    return { success: true };
  } catch(e) { return { success: false, error: e.toString() }; } finally { lock.releaseLock(); }
}

function autoConfigurarBaseDatos() {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sheet = ss.getSheetByName(CONF.SHEET_ASSETS);
    if (!sheet) return;
    const numCols = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
    
    let estadoColIndex = headers.indexOf("Estado_Registro");
    if (estadoColIndex === -1) {
      const newColIndex = numCols + 1;
      sheet.getRange(1, newColIndex).setValue("Estado_Registro");
      sheet.getRange(1, newColIndex).setFontWeight('bold').setBackground('#005565').setFontColor('white');
      const numRows = sheet.getLastRow();
      if (numRows > 1) {
        const activosArray = new Array(numRows - 1).fill(["ACTIVO"]);
        sheet.getRange(2, newColIndex, numRows - 1, 1).setValues(activosArray);
      }
    }
  } catch (error) { console.error("Error en auto-configuración: " + error); }
}

function adminDeleteAsset(id) {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_ASSETS);
    const data = sh.getDataRange().getValues();
    const headers = data[0];
    const estadoColIndex = headers.indexOf("Estado_Registro") + 1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(id).trim()) {
        sh.getRange(i + 1, estadoColIndex).setValue("INACTIVO");
        return { success: true };
      }
    }
    return { success: false, error: 'Equipo no encontrado' };
  } catch (error) { return { success: false, error: error.toString() }; }
}