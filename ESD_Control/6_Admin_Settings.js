// ==========================================
// ⚙️ ADMINISTRACIÓN: AJUSTES Y CATÁLOGOS
// ==========================================

function adminSaveConfigItem(item) {
  if (!item || !item.category || !item.id) {
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(false, "Datos de catálogo incompletos (categoría e ID requeridos).") : { success: false, error: "Datos de catálogo incompletos." };
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_CONFIG);
    if (!sh) return Utils.buildResponse(false, "Hoja de configuración no encontrada.");
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase() === String(item.category).toUpperCase() && String(data[i][1]).toUpperCase() === String(item.id).toUpperCase()) {
        sh.getRange(i + 1, 3, 1, 3).setValues([[item.label || item.id, item.color || "", JSON.stringify(item.config || {})]]);
        if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
        return Utils.buildResponse(true);
      }
    }
    sh.appendRow([item.category, item.id, item.label || item.id, item.color || "", JSON.stringify(item.config || {})]);
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
    return Utils.buildResponse(true);
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Guardar Catálogo");
  }
  return runner();
}

function adminUpdateCatalogItem(oldCategory, oldId, item) {
  if (!item || !item.category || !item.id) {
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(false, "Datos de catálogo incompletos.") : { success: false, error: "Datos de catálogo incompletos." };
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_CONFIG);
    if (!sh) return Utils.buildResponse(false, "Hoja de configuración no encontrada.");
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase() === String(oldCategory).toUpperCase() && String(data[i][1]).toUpperCase() === String(oldId).toUpperCase()) {
        sh.getRange(i + 1, 1, 1, 5).setValues([[item.category, item.id, item.label || item.id, item.color || "", JSON.stringify(item.config || {})]]);
        if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
        return Utils.buildResponse(true);
      }
    }
    return Utils.buildResponse(false, "Elemento no encontrado");
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Actualizar Catálogo");
  }
  return runner();
}

function adminDeleteConfigItem(cat, id) {
  if (typeof Validator !== 'undefined' && (Validator.isBlank(cat) || Validator.isBlank(id))) {
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(false, "Categoría e ID requeridos para eliminar.") : { success: false, error: "Categoría e ID requeridos." };
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_CONFIG);
    if (!sh) return Utils.buildResponse(false, "Hoja de configuración no encontrada.");
    const data = sh.getDataRange().getValues();
    let deleted = false;
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).toUpperCase() === String(cat).toUpperCase() && String(data[i][1]).toUpperCase() === String(id).toUpperCase()) {
        sh.deleteRow(i + 1);
        deleted = true;
      }
    }
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
    return Utils.buildResponse(true, { deleted: deleted });
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Eliminar Catálogo");
  }
  return runner();
}

function adminSaveRule(r) {
  if (!r || !r.description) {
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(false, "La regla requiere una descripción o tipo de activo.") : { success: false, error: "Descripción requerida." };
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_RULES);
    if (!sh) return Utils.buildResponse(false, "Hoja de reglas no encontrada.");
    const data = sh.getDataRange().getValues();
    let rowIdx = -1;
    const targetDesc = String(r.description).trim().toUpperCase();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === targetDesc) {
        rowIdx = i + 1;
        break;
      }
    }

    const recs = r.recs || {};
    const rowData = [
      r.description, r.surfaceRes || "", r.floorMat || "", r.elecRes || "", r.jack || "", r.voltage || "", r.impedance || "",
      r.defaultIcon || "fa-box", r.recommendation || "", r.tolerance || 0.8,
      recs.surfaceRes || "", recs.floorMat || "", recs.elecRes || "", recs.impedance || "", recs.voltage || "", recs.jack || ""
    ];

    if (rowIdx > 0) {
      sh.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sh.appendRow(rowData);
    }

    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
    return Utils.buildResponse(true);
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Guardar Regla");
  }
  return runner();
}

function adminDeleteRule(ruleId) {
  if (typeof Validator !== 'undefined' && Validator.isBlank(ruleId)) {
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(false, "ID de regla requerido.") : { success: false, error: "ID requerido." };
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_RULES);
    if (!sh) return Utils.buildResponse(false, "Hoja de reglas no encontrada.");
    const data = sh.getDataRange().getValues();
    const targetId = String(ruleId).trim().toUpperCase();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === targetId) {
        sh.deleteRow(i + 1);
        if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
        return Utils.buildResponse(true);
      }
    }
    return Utils.buildResponse(false, "Regla no encontrada");
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Eliminar Regla");
  }
  return runner();
}

function adminAddMatrixOption(obj) {
  if (!obj || !obj.name) {
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(false, "El estado requiere un nombre válido.") : { success: false, error: "Nombre requerido." };
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_MATRIX);
    if (!sh) return Utils.buildResponse(false, "Hoja de matriz no encontrada.");
    const upperVal = String(obj.name).trim().toUpperCase();
    const data = sh.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase() === "VALIDATION_REASON" && String(data[i][1]).trim().toUpperCase() === upperVal) {
        return Utils.buildResponse(false, "El estado ya existe.");
      }
    }
    sh.appendRow(["VALIDATION_REASON", upperVal, obj.showCard || false, obj.color || '#64748b', obj.isAdmin || false]);
    SpreadsheetApp.flush();
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
    return Utils.buildResponse(true);
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Agregar Estado a Matriz");
  }
  return runner();
}

function adminDeleteMatrixOption(val) {
  if (typeof Validator !== 'undefined' && Validator.isBlank(val)) {
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(false, "Nombre de estado requerido.") : { success: false, error: "Nombre requerido." };
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_MATRIX);
    if (!sh) return Utils.buildResponse(false, "Hoja de matriz no encontrada.");
    const targetVal = String(val).trim().toUpperCase();
    const data = sh.getDataRange().getValues();
    let deleted = false;
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]).toUpperCase() === "VALIDATION_REASON" && String(data[i][1]).trim().toUpperCase() === targetVal) {
        sh.deleteRow(i + 1);
        deleted = true;
      }
    }
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
    return Utils.buildResponse(true, { deleted: deleted });
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Eliminar Estado de Matriz");
  }
  return runner();
}

function adminUpdateMatrixOption(oldVal, obj) {
  if (!obj || !obj.name) {
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(false, "El nuevo estado requiere un nombre válido.") : { success: false, error: "Nombre requerido." };
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_MATRIX);
    if (!sh) return Utils.buildResponse(false, "Hoja de matriz no encontrada.");
    const targetOld = String(oldVal).trim().toUpperCase();
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase() === "VALIDATION_REASON" && String(data[i][1]).trim().toUpperCase() === targetOld) {
        sh.getRange(i + 1, 1, 1, 5).setValues([["VALIDATION_REASON", String(obj.name).trim().toUpperCase(), obj.showCard || false, obj.color || '#64748b', obj.isAdmin || false]]);
        if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
        return Utils.buildResponse(true);
      }
    }
    return Utils.buildResponse(false, "Estado no encontrado");
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Actualizar Estado de Matriz");
  }
  return runner();
}

function adminSaveEmailConfig(config) {
  const runner = () => {
    PropertiesService.getScriptProperties().setProperty('EMAIL_MASTER_CONFIG', JSON.stringify(config || {}));
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(true) : { success: true };
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Guardar Configuración de Correo");
  }
  return runner();
}

function adminSaveAiConfig(config) {
  const runner = () => {
    PropertiesService.getScriptProperties().setProperty('AI_COPILOT_CONFIG', JSON.stringify(config || {}));
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(true) : { success: true };
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Guardar Configuración de IA");
  }
  return runner();
}

function adminSaveRoles(rolesObj) {
  const runner = () => {
    PropertiesService.getScriptProperties().setProperty('ROLES_DB', JSON.stringify(rolesObj || {}));
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(true) : { success: true };
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Guardar Roles");
  }
  return runner();
}

function adminSaveUsers(usersObj) {
  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    let sh = ss.getSheetByName(CONF.SHEET_USERS);
    if (!sh) {
      sh = ss.insertSheet(CONF.SHEET_USERS);
      sh.appendRow(['Correo Electrónico', 'Rol Asignado']);
    }

    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
    const rows = [];
    for (let email in (usersObj || {})) rows.push([email, usersObj[email]]);
    if (rows.length > 0) sh.getRange(2, 1, rows.length, 2).setValues(rows);

    PropertiesService.getScriptProperties().setProperty('USERS_DB', JSON.stringify(usersObj || {}));
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(true) : { success: true };
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Guardar Usuarios");
  }
  return runner();
}

function adminSaveGeneralSettings(settings) {
  const runner = () => {
    PropertiesService.getScriptProperties().setProperty('SETTING_SHOW_PREV_EVIDENCE', (settings && settings.showPreviousEvidence) ? 'true' : 'false');
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
    return (typeof Utils !== 'undefined' && Utils.buildResponse) ? Utils.buildResponse(true) : { success: true };
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Guardar Configuración General");
  }
  return runner();
}