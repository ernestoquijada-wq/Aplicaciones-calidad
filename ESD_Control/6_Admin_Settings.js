// ==========================================
// ⚙️ ADMINISTRACIÓN: AJUSTES Y CATÁLOGOS
// ==========================================

function adminSaveConfigItem(item) {
  const ss = SpreadsheetApp.openById(CONF.SS_ID);
  const sh = ss.getSheetByName(CONF.SHEET_CONFIG);
  const data = sh.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
     if(String(data[i][0]) === String(item.category) && String(data[i][1]) === String(item.id)) {
         sh.getRange(i+1, 3).setValue(item.label);
         sh.getRange(i+1, 4).setValue(item.color);
         sh.getRange(i+1, 5).setValue(JSON.stringify(item.config || {}));
         return { success: true };
     }
  }
  sh.appendRow([item.category, item.id, item.label, item.color, JSON.stringify(item.config || {})]);
  return { success: true };
}

function adminUpdateCatalogItem(oldCategory, oldId, item) {
  const ss = SpreadsheetApp.openById(CONF.SS_ID);
  const sh = ss.getSheetByName(CONF.SHEET_CONFIG);
  const data = sh.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(oldCategory) && String(data[i][1]) === String(oldId)) {
      sh.getRange(i+1, 1, 1, 5).setValues([[item.category, item.id, item.label, item.color, JSON.stringify(item.config || {})]]);
      return { success: true };
    }
  }
  return { success: false, error: "Elemento no encontrado" };
}

function adminDeleteConfigItem(cat, id) {
  const ss = SpreadsheetApp.openById(CONF.SS_ID);
  const sh = ss.getSheetByName(CONF.SHEET_CONFIG);
  const data = sh.getDataRange().getValues();
  for(let i=data.length-1; i>=1; i--) {
    if(String(data[i][0]) === String(cat) && String(data[i][1]) === String(id)) sh.deleteRow(i+1);
  }
  return { success: true };
}

function adminSaveRule(r) {
  const ss = SpreadsheetApp.openById(CONF.SS_ID);
  const sh = ss.getSheetByName(CONF.SHEET_RULES);
  const data = sh.getDataRange().getValues();
  let rowIdx = -1;
  for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(r.description)) { rowIdx = i+1; break; } }
  
  const rowData = [ r.description, r.surfaceRes, r.floorMat, r.elecRes, r.jack, r.voltage, r.impedance, r.defaultIcon, r.recommendation, r.tolerance, r.recs.surfaceRes, r.recs.floorMat, r.recs.elecRes, r.recs.impedance, r.recs.voltage, r.recs.jack ];
  if(rowIdx > 0) sh.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]); else sh.appendRow(rowData);
  return { success: true };
}

function adminDeleteRule(ruleId) {
  const ss = SpreadsheetApp.openById(CONF.SS_ID);
  const sh = ss.getSheetByName(CONF.SHEET_RULES);
  const data = sh.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(ruleId)) { sh.deleteRow(i+1); return { success: true }; }
  }
  return { success: false, error: "Regla no encontrada" };
}

function adminAddMatrixOption(obj) {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_MATRIX);
    const upperVal = String(obj.name).trim().toUpperCase();
    const data = sh.getDataRange().getValues();
    
    for(let i=1; i<data.length; i++) { 
      if(String(data[i][0]) === "VALIDATION_REASON" && String(data[i][1]).toUpperCase() === upperVal) return { success: false, error: "El estado ya existe." }; 
    }
    sh.appendRow(["VALIDATION_REASON", upperVal, obj.showCard || false, obj.color || '#64748b', obj.isAdmin || false]);
    SpreadsheetApp.flush(); return { success: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function adminDeleteMatrixOption(val) {
  const ss = SpreadsheetApp.openById(CONF.SS_ID);
  const sh = ss.getSheetByName(CONF.SHEET_MATRIX);
  const data = sh.getDataRange().getValues();
  for(let i=data.length-1; i>=1; i--) {
    if(String(data[i][0]) === "VALIDATION_REASON" && String(data[i][1]) === String(val)) sh.deleteRow(i+1);
  }
  return { success: true };
}

function adminUpdateMatrixOption(oldVal, obj) {
  const ss = SpreadsheetApp.openById(CONF.SS_ID);
  const sh = ss.getSheetByName(CONF.SHEET_MATRIX);
  const data = sh.getDataRange().getValues();
  for(let i=1; i<data.length; i++) {
    if(String(data[i][0]) === "VALIDATION_REASON" && String(data[i][1]) === String(oldVal)) {
      sh.getRange(i+1, 1, 1, 5).setValues([["VALIDATION_REASON", String(obj.name).toUpperCase(), obj.showCard, obj.color, obj.isAdmin]]);
      return { success: true };
    }
  }
  return { success: false, error: "Estado no encontrado" };
}

function adminSaveEmailConfig(config) {
  try {
    PropertiesService.getScriptProperties().setProperty('EMAIL_MASTER_CONFIG', JSON.stringify(config));
    return { success: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function adminSaveAiConfig(config) {
  try {
    PropertiesService.getScriptProperties().setProperty('AI_COPILOT_CONFIG', JSON.stringify(config));
    return { success: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function adminSaveRoles(rolesObj) {
  try {
    PropertiesService.getScriptProperties().setProperty('ROLES_DB', JSON.stringify(rolesObj));
    return { success: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function adminSaveUsers(usersObj) {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    let sh = ss.getSheetByName('Seguridad_Usuarios');
    if (!sh) { sh = ss.insertSheet('Seguridad_Usuarios'); sh.appendRow(['Correo Electrónico', 'Rol Asignado']); }
    
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
    const rows = [];
    for (let email in usersObj) rows.push([email, usersObj[email]]);
    if (rows.length > 0) sh.getRange(2, 1, rows.length, 2).setValues(rows);
    
    PropertiesService.getScriptProperties().setProperty('USERS_DB', JSON.stringify(usersObj));
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}

function adminSaveGeneralSettings(settings) {
  try {
    PropertiesService.getScriptProperties().setProperty('SETTING_SHOW_PREV_EVIDENCE', settings.showPreviousEvidence ? 'true' : 'false');
    return { success: true };
  } catch (e) { return { success: false, error: e.toString() }; }
}