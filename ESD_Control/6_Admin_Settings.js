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
    const reqMeas = obj.requiresMeasurements !== undefined ? Boolean(obj.requiresMeasurements) : !['BAJA', 'SCRAP', 'OBSOLETO', 'DESINCORPORADO'].includes(upperVal);
    sh.appendRow(["VALIDATION_REASON", upperVal, obj.showCard || false, obj.color || '#64748b', obj.isAdmin || false, reqMeas]);
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
    const upperNew = String(obj.name).trim().toUpperCase();
    const reqMeas = obj.requiresMeasurements !== undefined ? Boolean(obj.requiresMeasurements) : !['BAJA', 'SCRAP', 'OBSOLETO', 'DESINCORPORADO'].includes(upperNew);
    const data = sh.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase() === "VALIDATION_REASON" && String(data[i][1]).trim().toUpperCase() === targetOld) {
        sh.getRange(i + 1, 1, 1, 6).setValues([["VALIDATION_REASON", upperNew, obj.showCard || false, obj.color || '#64748b', obj.isAdmin || false, reqMeas]]);
        SpreadsheetApp.flush();
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

/**
 * 👤 Actualiza de forma atómica y concurrente el rol de un usuario existente.
 * Sincroniza la hoja CONF.SHEET_USERS ('Seguridad_Usuarios') y ScriptProperties 'USERS_DB'.
 * @param {Object} payload { email: string, newRole: string }
 * @return {Object} Respuesta con éxito y usuarios actualizados.
 */
function adminUpdateUserRole(payload) {
  const runner = () => {
    if (!payload || !payload.email || !payload.newRole) {
      throw new Error("Parámetros 'email' y 'newRole' requeridos.");
    }

    const email = String(payload.email).trim().toLowerCase();
    const newRole = String(payload.newRole).trim().toUpperCase();

    // 1. Obtener y actualizar ScriptProperties USERS_DB
    const props = PropertiesService.getScriptProperties();
    let usersObj = {};
    try {
      usersObj = JSON.parse(props.getProperty('USERS_DB') || '{}');
    } catch(e) {
      usersObj = {};
    }
    usersObj[email] = newRole;

    // 2. Persistir en la Hoja de Cálculo
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    let sh = ss.getSheetByName(CONF.SHEET_USERS);
    if (!sh) {
      sh = ss.insertSheet(CONF.SHEET_USERS);
      sh.appendRow(['Correo Electrónico', 'Rol Asignado']);
    }

    const data = sh.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === email) {
        sh.getRange(i + 1, 2).setValue(newRole);
        found = true;
        break;
      }
    }
    if (!found) {
      sh.appendRow([email, newRole]);
    }

    // 3. Guardar en PropertiesService e invalidar caché
    props.setProperty('USERS_DB', JSON.stringify(usersObj));
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();

    return (typeof Utils !== 'undefined' && Utils.buildResponse) 
      ? Utils.buildResponse(true, { email: email, role: newRole, users: usersObj }) 
      : { success: true, email: email, role: newRole, users: usersObj };
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Actualizar Rol Usuario");
  }
  return runner();
}

// ==========================================
// 🚨 ADMINISTRACIÓN: REGLAS DE ALERTAS DINÁMICAS
// ==========================================

function adminSaveAlertRule(rule) {
  if (!rule || !rule.name) {
    return Utils.buildResponse(false, "El nombre de la alerta es obligatorio.");
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    let sh = ss.getSheetByName(CONF.SHEET_ALERTS);
    const headers = ['ID', 'Nombre', 'Campo_Objetivo', 'Valores_Disparo', 'Color_Fondo', 'Color_Texto', 'Color_Borde', 'Icono', 'Pulso', 'Mostrar_Prefijo', 'Activo'];
    if (!sh) {
      sh = ss.insertSheet(CONF.SHEET_ALERTS);
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground(CONF.DEFAULT_COLOR).setFontColor('white').setHorizontalAlignment('center');
      sh.setFrozenRows(1);
    }

    const clean = (typeof Utils !== 'undefined' && Utils.clean) ? Utils.clean : (v) => String(v || '').trim();
    const ruleId = rule.id ? clean(rule.id) : ('ALERT_' + new Date().getTime());
    const row = [
      ruleId,
      clean(rule.name),
      clean(rule.targetField).toUpperCase() || 'RESULTADO',
      clean(rule.triggerValues),
      clean(rule.bgColor) || '#fee2e2',
      clean(rule.textColor) || '#b91c1c',
      clean(rule.borderColor) || '#fca5a5',
      clean(rule.icon) || 'fa-exclamation-circle',
      rule.pulse === true || String(rule.pulse).toLowerCase() === 'true',
      rule.showPrefix !== false && String(rule.showPrefix).toLowerCase() !== 'false',
      rule.active !== false && String(rule.active).toLowerCase() !== 'false'
    ];

    sh.appendRow(row);
    if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();

    const createdRule = {
      id: row[0], name: row[1], targetField: row[2], triggerValues: row[3],
      bgColor: row[4], textColor: row[5], borderColor: row[6], icon: row[7],
      pulse: row[8], showPrefix: row[9], active: row[10]
    };
    return Utils.buildResponse(true, { rule: createdRule });
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Guardar Regla Alerta");
  }
  return runner();
}

function adminUpdateAlertRule(id, rule) {
  if (!id || !rule) {
    return Utils.buildResponse(false, "ID y datos de regla requeridos.");
  }

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_ALERTS);
    if (!sh) return Utils.buildResponse(false, "Hoja de alertas no encontrada.");

    const data = sh.getDataRange().getValues();
    const clean = (typeof Utils !== 'undefined' && Utils.clean) ? Utils.clean : (v) => String(v || '').trim();
    const targetId = clean(id);

    for (let i = 1; i < data.length; i++) {
      if (clean(data[i][0]) === targetId) {
        const row = [
          targetId,
          clean(rule.name) || clean(data[i][1]),
          clean(rule.targetField).toUpperCase() || clean(data[i][2]),
          clean(rule.triggerValues) || clean(data[i][3]),
          clean(rule.bgColor) || clean(data[i][4]),
          clean(rule.textColor) || clean(data[i][5]),
          clean(rule.borderColor) || clean(data[i][6]),
          clean(rule.icon) || clean(data[i][7]),
          rule.pulse !== undefined ? (rule.pulse === true || String(rule.pulse).toLowerCase() === 'true') : data[i][8],
          rule.showPrefix !== undefined ? (rule.showPrefix === true || String(rule.showPrefix).toLowerCase() === 'true') : data[i][9],
          rule.active !== undefined ? (rule.active === true || String(rule.active).toLowerCase() === 'true') : data[i][10]
        ];

        sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();

        const updatedRule = {
          id: row[0], name: row[1], targetField: row[2], triggerValues: row[3],
          bgColor: row[4], textColor: row[5], borderColor: row[6], icon: row[7],
          pulse: row[8], showPrefix: row[9], active: row[10]
        };
        return Utils.buildResponse(true, { rule: updatedRule });
      }
    }
    return Utils.buildResponse(false, "Regla de alerta no encontrada.");
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Actualizar Regla Alerta");
  }
  return runner();
}

function adminDeleteAlertRule(id) {
  if (!id) return Utils.buildResponse(false, "ID de regla requerido.");

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_ALERTS);
    if (!sh) return Utils.buildResponse(false, "Hoja de alertas no encontrada.");

    const data = sh.getDataRange().getValues();
    const clean = (typeof Utils !== 'undefined' && Utils.clean) ? Utils.clean : (v) => String(v || '').trim();
    const targetId = clean(id);

    for (let i = data.length - 1; i >= 1; i--) {
      if (clean(data[i][0]) === targetId) {
        sh.deleteRow(i + 1);
        if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
        return Utils.buildResponse(true, { deletedId: targetId });
      }
    }
    return Utils.buildResponse(false, "Regla de alerta no encontrada.");
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Eliminar Regla Alerta");
  }
  return runner();
}

function adminToggleAlertRule(id, isActive) {
  if (!id) return Utils.buildResponse(false, "ID requerido.");

  const runner = () => {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_ALERTS);
    if (!sh) return Utils.buildResponse(false, "Hoja de alertas no encontrada.");

    const data = sh.getDataRange().getValues();
    const clean = (typeof Utils !== 'undefined' && Utils.clean) ? Utils.clean : (v) => String(v || '').trim();
    const targetId = clean(id);
    const newActiveState = isActive === true || String(isActive).toLowerCase() === 'true';

    for (let i = 1; i < data.length; i++) {
      if (clean(data[i][0]) === targetId) {
        sh.getRange(i + 1, 11).setValue(newActiveState);
        if (typeof CacheManager !== 'undefined') CacheManager.invalidateCatalogs();
        return Utils.buildResponse(true, { id: targetId, active: newActiveState });
      }
    }
    return Utils.buildResponse(false, "Regla no encontrada.");
  };

  if (typeof withScriptLock !== 'undefined') {
    return withScriptLock(runner, CONF.TIMEOUTS.LOCK_SHORT, "Alternar Regla Alerta");
  }
  return runner();
}


/**
 * 9. MÓDULO DE TRÁFICO Y ANALÍTICAS DE USO (PANEL ADMIN)
 * Agrega telemetría en tiempo real (CacheService) + sesiones (DB_Traffic_Logs) +
 * volumen transaccional real (Registros, DB_Assets, DB_Tickets) sin saturar cuotas.
 */
function getTrafficAnalytics(periodDays = 30, forceRefresh = false) {
  try {
    const days = Math.max(1, parseInt(periodDays, 10) || 30);
    const cache = CacheService.getScriptCache();
    const cacheKey = ((CONF.CACHE_KEYS && CONF.CACHE_KEYS.ADMIN_ANALYTICS) ? CONF.CACHE_KEYS.ADMIN_ANALYTICS : 'ESD_ADMIN_ANALYTICS_V1') + '_' + days;

    // Actualizar heartbeat del propio usuario que consulta el panel
    const currentEmail = (typeof Utils !== 'undefined' && Utils.getActiveUserEmail) ? Utils.getActiveUserEmail() : '';
    if (typeof TrafficMonitor !== 'undefined' && TrafficMonitor.updateOnlineHeartbeat && currentEmail) {
      TrafficMonitor.updateOnlineHeartbeat(currentEmail);
    }

    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          // Refrescar estado online en vivo incluso si el agregado viene de caché
          if (typeof TrafficMonitor !== 'undefined' && TrafficMonitor.getOnlineUsersMap) {
            const onlineMap = TrafficMonitor.getOnlineUsersMap();
            const onlineEmails = Object.keys(onlineMap);
            parsed.kpis.onlineCount = onlineEmails.length;
            if (Array.isArray(parsed.usersList)) {
              parsed.usersList.forEach(u => {
                u.isOnline = Boolean(onlineMap[u.email]);
                if (onlineMap[u.email] && onlineMap[u.email] > (u.lastSeenTs || 0)) {
                  u.lastSeenTs = onlineMap[u.email];
                }
              });
            }
          }
          return Utils.buildResponse(true, parsed);
        } catch (e) {}
      }
    }

    const nowMs = Date.now();
    const cutoffMs = nowMs - (days * 24 * 60 * 60 * 1000);
    const ss = (typeof Utils !== 'undefined' && Utils.getSpreadsheet) ? Utils.getSpreadsheet() : SpreadsheetApp.openById(CONF.SS_ID);

    // 1. Mapa de usuarios registrados y roles
    const props = PropertiesService.getScriptProperties();
    let usersDb = [];
    try { usersDb = JSON.parse(props.getProperty('USERS_DB') || '[]'); } catch (e) { usersDb = []; }

    const roleByEmail = {};
    if (CONF.SUPER_ADMINS) {
      CONF.SUPER_ADMINS.forEach(em => { roleByEmail[String(em).toLowerCase().trim()] = 'SUPER ADMIN'; });
    }
    usersDb.forEach(u => {
      if (u && u.email) roleByEmail[String(u.email).toLowerCase().trim()] = String(u.role || 'TECNICO').toUpperCase();
    });

    // 2. Usuarios conectados en vivo (CacheService heartbeat <= 90s)
    const onlineMap = (typeof TrafficMonitor !== 'undefined' && TrafficMonitor.getOnlineUsersMap)
      ? TrafficMonitor.getOnlineUsersMap()
      : {};

    // Estructura acumuladora por usuario
    const userMap = {};
    const ensureUser = (rawEmail, explicitRole) => {
      const email = String(rawEmail || '').toLowerCase().trim();
      if (!email || email === 'anónimo' || email === 'anonimo') return null;
      if (!userMap[email]) {
        userMap[email] = {
          email: email,
          role: explicitRole || roleByEmail[email] || 'OPERADOR / AUDITOR',
          isOnline: Boolean(onlineMap[email]),
          lastSeenTs: onlineMap[email] || 0,
          sessionsCount: 0,
          activeDaysSet: {},
          auditsPass: 0,
          auditsFail: 0,
          assetsCreated: 0,
          ticketsHandled: 0,
          exports: 0,
          aiQueries: 0,
          totalInteractions: 0
        };
      } else if (explicitRole && userMap[email].role === 'OPERADOR / AUDITOR') {
        userMap[email].role = explicitRole;
      }
      return userMap[email];
    };

    // Pre-cargar usuarios registrados y usuarios online
    Object.keys(roleByEmail).forEach(em => ensureUser(em, roleByEmail[em]));
    Object.keys(onlineMap).forEach(em => ensureUser(em));

    const parseDateMs = (val) => {
      if (!val) return 0;
      if (val instanceof Date) return val.getTime();
      const str = String(val).trim();
      const parsed = Date.parse(str);
      if (!isNaN(parsed)) return parsed;
      // Soportar dd/MM/yyyy HH:mm
      const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2}))?/);
      if (m) {
        return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0)).getTime();
      }
      return 0;
    };

    const toDayKey = (ms) => {
      if (!ms) return '';
      const d = new Date(ms);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };

    // 3. Leer bitácora de tráfico (DB_Traffic_Logs)
    const shTraffic = ss.getSheetByName(CONF.SHEET_TRAFFIC || 'DB_Traffic_Logs');
    if (shTraffic && shTraffic.getLastRow() > 1) {
      const tVals = shTraffic.getDataRange().getValues();
      for (let i = 1; i < tVals.length; i++) {
        const row = tVals[i];
        const tsMs = parseDateMs(row[0]);
        if (tsMs < cutoffMs) continue;
        const email = String(row[1] || '').toLowerCase().trim();
        const role = String(row[2] || '').trim();
        const eventType = String(row[3] || '').toUpperCase().trim();
        const u = ensureUser(email, role);
        if (!u) continue;

        if (tsMs > u.lastSeenTs) u.lastSeenTs = tsMs;
        const dKey = toDayKey(tsMs);
        if (dKey) u.activeDaysSet[dKey] = true;

        if (eventType === 'SESSION_START') {
          u.sessionsCount++;
        } else if (eventType === 'REPORT_EXPORT') {
          u.exports++;
          u.totalInteractions++;
        } else if (eventType === 'AI_QUERY') {
          u.aiQueries++;
          u.totalInteractions++;
        } else if (eventType === 'ADMIN_CONFIG') {
          u.totalInteractions++;
        }
      }
    }

    // 4. Leer bitácora de auditorías (Registros)
    const shLogs = ss.getSheetByName(CONF.SHEET_LOGS);
    if (shLogs && shLogs.getLastRow() > 1) {
      const lVals = shLogs.getDataRange().getValues();
      for (let i = 1; i < lVals.length; i++) {
        const row = lVals[i];
        const tsMs = parseDateMs(row[1]);
        if (tsMs < cutoffMs) continue;
        const email = String(row[4] || '').toLowerCase().trim();
        const status = String(row[5] || '').toUpperCase().trim();
        const u = ensureUser(email);
        if (!u) continue;

        if (tsMs > u.lastSeenTs) u.lastSeenTs = tsMs;
        const dKey = toDayKey(tsMs);
        if (dKey) u.activeDaysSet[dKey] = true;

        if (status === 'FALLA' || status === 'FAIL') {
          u.auditsFail++;
        } else {
          u.auditsPass++;
        }
        u.totalInteractions++;
      }
    }

    // 5. Leer altas de activos (DB_Assets)
    const shAssets = ss.getSheetByName(CONF.SHEET_ASSETS);
    if (shAssets && shAssets.getLastRow() > 1) {
      const aVals = shAssets.getDataRange().getValues();
      for (let i = 1; i < aVals.length; i++) {
        const row = aVals[i];
        const tsMs = parseDateMs(row[9] || row[5]);
        if (tsMs && tsMs < cutoffMs) continue;
        const email = String(row[8] || '').toLowerCase().trim();
        const u = ensureUser(email);
        if (!u) continue;

        if (tsMs > u.lastSeenTs) u.lastSeenTs = tsMs;
        const dKey = toDayKey(tsMs);
        if (dKey) u.activeDaysSet[dKey] = true;

        u.assetsCreated++;
        u.totalInteractions++;
      }
    }

    // 6. Leer tickets CAPA atendidos/cerrados (DB_Tickets)
    const shTickets = ss.getSheetByName(CONF.SHEET_TICKETS);
    if (shTickets && shTickets.getLastRow() > 1) {
      const tkVals = shTickets.getDataRange().getValues();
      for (let i = 1; i < tkVals.length; i++) {
        const row = tkVals[i];
        const tsMs = parseDateMs(row[8] || row[2]);
        if (tsMs && tsMs < cutoffMs) continue;
        const email = String(row[7] || '').toLowerCase().trim();
        if (!email) continue;
        const u = ensureUser(email);
        if (!u) continue;

        if (tsMs > u.lastSeenTs) u.lastSeenTs = tsMs;
        const dKey = toDayKey(tsMs);
        if (dKey) u.activeDaysSet[dKey] = true;

        u.ticketsHandled++;
        u.totalInteractions++;
      }
    }

    // 7. Consolidar métricas por usuario y totales globales
    let totalSessions = 0;
    let totalInteractions = 0;
    let activeUsersCount = 0;
    let modAudits = 0;
    let modAssets = 0;
    let modTickets = 0;
    let modExportsAi = 0;

    const usersList = Object.values(userMap).map(u => {
      const activeDaysCount = Object.keys(u.activeDaysSet).length;
      const effectiveSessions = Math.max(u.sessionsCount, activeDaysCount);
      u.sessionsCount = effectiveSessions;

      if (effectiveSessions > 0 || u.totalInteractions > 0 || u.isOnline) {
        activeUsersCount++;
      }

      totalSessions += effectiveSessions;
      totalInteractions += u.totalInteractions;
      modAudits += (u.auditsPass + u.auditsFail);
      modAssets += u.assetsCreated;
      modTickets += u.ticketsHandled;
      modExportsAi += (u.exports + u.aiQueries);

      let frequencyTier = 'OCCASIONAL';
      if (activeDaysCount >= Math.max(3, Math.round(days * 0.35)) || effectiveSessions >= 10) {
        frequencyTier = 'DAILY';
      } else if (activeDaysCount >= 2 || effectiveSessions >= 3 || u.totalInteractions >= 5) {
        frequencyTier = 'WEEKLY';
      }

      return {
        email: u.email,
        role: u.role,
        isOnline: u.isOnline,
        lastSeenTs: u.lastSeenTs,
        activeDaysCount: activeDaysCount,
        sessionsCount: effectiveSessions,
        frequencyTier: frequencyTier,
        auditsPass: u.auditsPass,
        auditsFail: u.auditsFail,
        assetsCreated: u.assetsCreated,
        ticketsHandled: u.ticketsHandled,
        exports: u.exports,
        aiQueries: u.aiQueries,
        totalInteractions: u.totalInteractions
      };
    });

    // Ordenar: primero usuarios online, luego por volumen de interacciones, luego por sesiones
    usersList.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      if (b.totalInteractions !== a.totalInteractions) return b.totalInteractions - a.totalInteractions;
      if (b.sessionsCount !== a.sessionsCount) return b.sessionsCount - a.sessionsCount;
      return (b.lastSeenTs || 0) - (a.lastSeenTs || 0);
    });

    const totalMod = Math.max(1, modAudits + modAssets + modTickets + modExportsAi);
    const payload = {
      periodDays: days,
      generatedAt: nowMs,
      kpis: {
        onlineCount: Object.keys(onlineMap).length,
        activeUsersCount: activeUsersCount,
        totalRegisteredUsers: Math.max(Object.keys(roleByEmail).length, usersList.length),
        totalSessions: totalSessions,
        avgDailySessions: Number((totalSessions / Math.max(1, days)).toFixed(1)),
        totalInteractions: totalInteractions,
        avgActionsPerSession: totalSessions > 0 ? Number((totalInteractions / totalSessions).toFixed(1)) : 0
      },
      moduleBreakdown: {
        audits: { count: modAudits, pct: Math.round((modAudits / totalMod) * 100) },
        assets: { count: modAssets, pct: Math.round((modAssets / totalMod) * 100) },
        tickets: { count: modTickets, pct: Math.round((modTickets / totalMod) * 100) },
        exportsAndAi: { count: modExportsAi, pct: Math.round((modExportsAi / totalMod) * 100) }
      },
      usersList: usersList
    };

    try {
      cache.put(cacheKey, JSON.stringify(payload), (CONF.CACHE_TTL && CONF.CACHE_TTL.ADMIN_ANALYTICS) ? CONF.CACHE_TTL.ADMIN_ANALYTICS : 120);
    } catch (e) {}

    return Utils.buildResponse(true, payload);
  } catch (e) {
    return Utils.buildResponse(false, "Error al calcular analíticas de tráfico: " + e.toString());
  }
}
