// ==========================================
// ⏱️ UTILIDADES: LOGS, CORREOS Y SETUP
// ==========================================

const Utils = {
  clean: function(v) {
    return (v === null || v === undefined) ? "" : String(v).trim();
  },
  formatDateISO: function(d) {
    if (!d) return "";
    if (d instanceof Date) {
      try { return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"); } catch (e) { return ""; }
    }
    return String(d);
  },
  formatDateDisplay: function(d, format = "dd-MMM-yy") {
    if (!d || d === "N/A" || d === "PENDIENTE") return "N/A";
    if (d instanceof Date) {
      try { return Utilities.formatDate(d, Session.getScriptTimeZone(), format); } catch (e) { return ""; }
    }
    return String(d);
  },
  normalizeText: function(text) {
    if (!text) return "";
    return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  },
  buildResponse: function(success, dataOrError = {}, error = null) {
    if (success) {
      const data = (typeof dataOrError === 'object' && dataOrError !== null) ? dataOrError : { data: dataOrError };
      return { success: true, ...data };
    }
    const err = error || dataOrError;
    return { success: false, error: err ? (err.message || String(err)) : "Error desconocido" };
  }
};

/**
 * Envolvente global de exclusión mutua para operaciones atómicas de escritura.
 * Protege contra condiciones de carrera en entornos multi-usuario.
 *
 * @param {Function} actionFn Función a ejecutar dentro del bloqueo.
 * @param {number} timeoutMs Tiempo de espera máximo (ms). Por defecto 10,000 ms.
 * @param {string} opName Nombre descriptivo de la operación.
 * @return {Object} Resultado retornado por actionFn o respuesta de error estandarizada.
 */
function withScriptLock(actionFn, timeoutMs = 10000, opName = "Operación") {
  if (typeof LockService === 'undefined') {
    return actionFn();
  }
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {
    acquired = lock.tryLock(timeoutMs);
  } catch (lockErr) {
    acquired = false;
  }

  if (!acquired) {
    return Utils.buildResponse(false, `El servidor está ocupado procesando otra solicitud (${opName}). Por favor, intente nuevamente en unos segundos.`);
  }

  try {
    return actionFn();
  } catch (err) {
    console.error(`Error en bloque con bloqueo [${opName}]:`, err);
    return Utils.buildResponse(false, err);
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseErr) {
      // Ignorar si el lock ya expiró
    }
  }
}

/**
 * Validador estricto de datos: previene valores nulos, blancos y duplicados.
 */
const Validator = {
  isBlank: function(val) {
    return val === null || val === undefined || String(val).trim() === "";
  },
  sanitize: function(val) {
    return (val === null || val === undefined) ? "" : String(val).trim();
  },
  validateRequired: function(obj, requiredFields) {
    if (!obj || typeof obj !== 'object') {
      return { valid: false, message: "Objeto de datos no proporcionado o inválido." };
    }
    for (let i = 0; i < requiredFields.length; i++) {
      const field = requiredFields[i];
      if (this.isBlank(obj[field])) {
        return { valid: false, field: field, message: `El campo '${field}' es obligatorio y no puede estar vacío.` };
      }
    }
    return { valid: true };
  },
  isDuplicateId: function(sheet, colIndex, targetId, excludeRowIndex = -1) {
    if (!sheet || this.isBlank(targetId)) return false;
    const data = sheet.getDataRange().getValues();
    const normTarget = String(targetId).trim().toUpperCase();
    for (let i = 1; i < data.length; i++) {
      if (excludeRowIndex > 0 && (i + 1) === excludeRowIndex) continue;
      if (String(data[i][colIndex - 1]).trim().toUpperCase() === normTarget) {
        return true;
      }
    }
    return false;
  }
};

/**
 * Gestor centralizado de caché y estrategias de invalidación.
 * Optimiza lecturas (< 3s) y purga datos inmediatamente tras escrituras.
 */
const CacheManager = {
  KEYS: {
    CATALOGS_AND_RULES: 'ESD_CACHE_CATALOGS_AND_RULES',
    SETTINGS: 'ESD_CACHE_SETTINGS'
  },
  DEFAULT_TTL: 21600, // 6 horas en segundos (máximo de Apps Script)

  get: function(key) {
    if (typeof CacheService === 'undefined') return null;
    try {
      const cache = CacheService.getScriptCache();
      const raw = cache.get(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn(`Error al leer de caché [${key}]:`, e);
    }
    return null;
  },

  put: function(key, data, ttlSeconds = 21600) {
    if (typeof CacheService === 'undefined') return;
    try {
      const cache = CacheService.getScriptCache();
      const serialized = JSON.stringify(data);
      if (serialized.length < 100000) {
        cache.put(key, serialized, ttlSeconds);
      }
    } catch (e) {
      console.warn(`Error al guardar en caché [${key}]:`, e);
    }
  },

  remove: function(keys) {
    if (typeof CacheService === 'undefined') return;
    try {
      const cache = CacheService.getScriptCache();
      if (Array.isArray(keys)) {
        cache.removeAll(keys);
      } else {
        cache.remove(keys);
      }
    } catch (e) {
      console.warn("Error al invalidar caché:", e);
    }
  },

  invalidateCatalogs: function() {
    this.remove([this.KEYS.CATALOGS_AND_RULES, this.KEYS.SETTINGS]);
    if (typeof VersionManager !== 'undefined') VersionManager.bumpVersion('CONFIG');
  },

  invalidateAll: function() {
    this.invalidateCatalogs();
    this.remove([this.KEYS.AUDIT_COUNTS]);
    if (typeof VersionManager !== 'undefined') VersionManager.bumpVersion('ALL');
  }
};

/**
 * Gestor de Presencia y Control de Concurrencia para Mediciones en Tiempo Real.
 * Usa CacheService.getScriptCache() para coordinar accesos simultáneos sin sobrecargar Sheets.
 */
const PresenceManager = {
  PREFIX: 'ESD_LOCK_',
  DEFAULT_TTL: 90, // 90 segundos de vigencia

  acquire: function(payload) {
    if (!payload || !payload.assetId) {
      return { success: false, error: "ID de activo no proporcionado." };
    }
    if (typeof CacheService === 'undefined') {
      return { success: true, status: 'ACQUIRED' };
    }

    try {
      const cache = CacheService.getScriptCache();
      const assetId = String(payload.assetId).trim().toUpperCase();
      const key = this.PREFIX + assetId;
      const now = Date.now();
      const userEmail = String(payload.userEmail || (typeof Session !== 'undefined' ? Session.getActiveUser().getEmail() : '') || 'anonimo').toLowerCase().trim();
      const userName = String(payload.userName || userEmail.split('@')[0]);

      const raw = cache.get(key);
      if (raw) {
        try {
          const current = JSON.parse(raw);
          // Si el mismo usuario vuelve a pedir el lock o hace refresh
          if (current.userEmail === userEmail) {
            current.lastHeartbeat = now;
            cache.put(key, JSON.stringify(current), this.DEFAULT_TTL);
            return { success: true, status: 'ACQUIRED', holder: current };
          }

          // Si otro usuario tiene el lock y no se fuerza la adquisición
          if (!payload.force) {
            const elapsedSeconds = Math.max(0, Math.floor((now - (current.startedAt || now)) / 1000));
            return {
              success: true,
              status: 'LOCKED',
              holder: {
                userEmail: current.userEmail,
                userName: current.userName,
                startedAt: current.startedAt,
                elapsedSeconds: elapsedSeconds
              }
            };
          }
        } catch (e) {
          console.warn("Error parseando presencia previa:", e);
        }
      }

      // Adquisición nueva o forzada
      const record = {
        assetId: assetId,
        userEmail: userEmail,
        userName: userName,
        startedAt: now,
        lastHeartbeat: now
      };
      cache.put(key, JSON.stringify(record), this.DEFAULT_TTL);
      return { success: true, status: payload.force ? 'OVERRIDDEN' : 'ACQUIRED', holder: record };
    } catch (e) {
      console.warn("Error en PresenceManager.acquire:", e);
      return { success: true, status: 'ACQUIRED' };
    }
  },

  renew: function(assetId, userEmail) {
    if (!assetId || typeof CacheService === 'undefined') return { success: true, status: 'EXPIRED' };
    try {
      const cache = CacheService.getScriptCache();
      const key = this.PREFIX + String(assetId).trim().toUpperCase();
      const raw = cache.get(key);
      if (raw) {
        const current = JSON.parse(raw);
        const normUser = String(userEmail || (typeof Session !== 'undefined' ? Session.getActiveUser().getEmail() : '') || '').toLowerCase().trim();
        if (!normUser || current.userEmail === normUser) {
          current.lastHeartbeat = Date.now();
          cache.put(key, JSON.stringify(current), this.DEFAULT_TTL);
          return { success: true, status: 'RENEWED' };
        } else {
          return { success: false, status: 'OVERRIDDEN', byUser: current.userName || current.userEmail };
        }
      }
    } catch (e) {
      console.warn("Error en PresenceManager.renew:", e);
    }
    return { success: true, status: 'EXPIRED' };
  },

  release: function(assetId, userEmail) {
    if (!assetId || typeof CacheService === 'undefined') return { success: true };
    try {
      const cache = CacheService.getScriptCache();
      const key = this.PREFIX + String(assetId).trim().toUpperCase();
      const raw = cache.get(key);
      if (raw) {
        const current = JSON.parse(raw);
        const normUser = String(userEmail || '').toLowerCase().trim();
        // Solo libera si es el mismo usuario o no se especificó usuario
        if (!normUser || current.userEmail === normUser) {
          cache.remove(key);
        }
      }
    } catch (e) {
      console.warn("Error en PresenceManager.release:", e);
    }
    return { success: true };
  },

  check: function(assetId) {
    if (!assetId || typeof CacheService === 'undefined') return null;
    try {
      const cache = CacheService.getScriptCache();
      const key = this.PREFIX + String(assetId).trim().toUpperCase();
      const raw = cache.get(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("Error en PresenceManager.check:", e);
    }
    return null;
  }
};

/**
 * Gestor de Versión y Sincronización en Vivo (Polling Ligero).
 * Permite verificar si existen cambios en el servidor en < 100ms sin tocar Sheets.
 */
const VersionManager = {
  KEY_VERSION: 'ESD_SYS_VERSION',
  KEY_TYPE: 'ESD_SYS_LAST_CHANGE_TYPE',
  DEFAULT_TTL: 21600, // 6 horas

  getVersion: function() {
    if (typeof CacheService === 'undefined') return String(Date.now());
    try {
      const cache = CacheService.getScriptCache();
      let v = cache.get(this.KEY_VERSION);
      if (!v) {
        const props = (typeof PropertiesService !== 'undefined') ? PropertiesService.getScriptProperties() : null;
        v = props ? (props.getProperty(this.KEY_VERSION) || String(Date.now())) : String(Date.now());
        cache.put(this.KEY_VERSION, v, this.DEFAULT_TTL);
      }
      return v;
    } catch (e) {
      return String(Date.now());
    }
  },

  bumpVersion: function(changeType = 'GENERAL') {
    const newVer = String(Date.now());
    try {
      if (typeof CacheService !== 'undefined') {
        const cache = CacheService.getScriptCache();
        cache.put(this.KEY_VERSION, newVer, this.DEFAULT_TTL);
        cache.put(this.KEY_TYPE, changeType, this.DEFAULT_TTL);
      }
      if (typeof PropertiesService !== 'undefined') {
        PropertiesService.getScriptProperties().setProperty(this.KEY_VERSION, newVer);
      }
    } catch (e) {
      console.warn("Error en VersionManager.bumpVersion:", e);
    }
    return newVer;
  },

  checkSyncStatus: function(clientVersion) {
    const serverVer = this.getVersion();
    let changeType = 'NONE';
    const hasChanges = String(clientVersion) !== String(serverVer);
    if (hasChanges && typeof CacheService !== 'undefined') {
      changeType = CacheService.getScriptCache().get(this.KEY_TYPE) || 'GENERAL';
    }
    return {
      success: true,
      hasChanges: hasChanges,
      serverVersion: serverVer,
      changeType: changeType
    };
  }
};

// ==========================================
// 🌐 FUNCIONES EXPUESTAS PARA GOOGLE.SCRIPT.RUN
// ==========================================
function acquireAssetPresence(payload) {
  return PresenceManager.acquire(payload);
}

function renewAssetPresence(assetId, userEmail) {
  return PresenceManager.renew(assetId, userEmail);
}

function releaseAssetPresence(assetId, userEmail) {
  return PresenceManager.release(assetId, userEmail);
}

function checkSyncStatus(clientVersion) {
  return VersionManager.checkSyncStatus(clientVersion);
}


function sendTicketEmail(tId, tData, aInfo, type = "OPEN") {
  try {
    const props = PropertiesService.getScriptProperties();
    const masterConfig = JSON.parse(props.getProperty('EMAIL_MASTER_CONFIG') || '{}');
    const cfg = masterConfig[type] || {};

    const fixedTo = cfg.to || "";
    const dynamicTo = tData.emails_notificados || "";
    const finalTo = [fixedTo, dynamicTo].filter(Boolean).join(", ");
    if (!finalTo) return; 

    const subject = `${cfg.subject || 'Notificación ESD'} - Ticket: ${tId}`;
    
    let photoLinks = "<p style='color: #64748b;'>Sin evidencia fotográfica adjunta.</p>";
    if (tData.evidencia_fotos && tData.evidencia_fotos.length > 0) {
        photoLinks = tData.evidencia_fotos.map((url, i) => 
            `<a href="${url}" target="_blank" style="display:inline-block; margin: 5px 10px 5px 0; padding:8px 15px; background-color:${type==='CLOSE'?'#10b981':CONF.DEFAULT_COLOR}; color:#ffffff; text-decoration:none; font-weight:bold; border-radius:5px; font-size: 12px;">Ver Foto ${i+1}</a>`
        ).join('');
    }
    
    const htmlBody = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background-color: #ffffff;">
        <div style="background-color: ${type==='OPEN'?'#e11d48':(type==='CLOSE'?'#10b981':'#f59e0b')}; color: white; padding: 20px; text-align: center;">
            <h2 style="margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 1px;">${cfg.subject || 'Reporte de Sistema'}</h2>
        </div>
        <div style="padding: 30px; color: #334155;">
            <p style="margin-top: 0; font-size: 15px; line-height: 1.6;">${cfg.body || 'Se ha registrado una novedad.'}</p>
            <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 4px; margin: 20px 0;">
                <p style="margin:5px 0; font-size: 14px;"><b>Folio de Ticket:</b> <span style="color:#0f172a; font-family:monospace; font-size: 16px; font-weight: bold;">${tId}</span></p>
                <p style="margin:5px 0; font-size: 14px;"><b>Activo:</b> ${aInfo.controlNo} (${aInfo.description})</p>
                <p style="margin:5px 0; font-size: 14px;"><b>Ubicación:</b> Factoria ${aInfo.factory} - Proyecto ${aInfo.project}</p>
                <p style="margin:5px 0; font-size: 14px;"><b>Cuadrante:</b> ${aInfo.quadrant}</p>
                <p style="margin:5px 0; font-size: 14px;"><b>Reportado por:</b> ${tData.systemUser || 'Sistema Automático'}</p>
            </div>
            <h3 style="color: ${CONF.DEFAULT_COLOR}; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-top: 25px;">Evidencia</h3>
            <div style="margin: 15px 0;">${photoLinks}</div>
            <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                Este es un mensaje automático generado por el Sistema PLEXUS ESD. No responda a este correo.
            </p>
        </div>
      </div>`;
    MailApp.sendEmail({ to: finalTo, subject: subject, htmlBody: htmlBody });
  } catch (e) { console.error("Error al enviar correo:", e); }
}

function logAudit(ss, id, res, data) {
  let sh = ss.getSheetByName(CONF.SHEET_LOGS);
  const userEmail = Session.getActiveUser().getEmail(); 
  if(!sh) { sh = ss.insertSheet(CONF.SHEET_LOGS); sh.appendRow(["UUID","FECHA","ID","RESULTADO","DATA", "USUARIO_SISTEMA"]); }
  data.systemUser = userEmail;
  sh.appendRow([Utilities.getUuid(), new Date(), id, res, JSON.stringify(data), userEmail]);
}

function getAssetHistory(controlNo) {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName(CONF.SHEET_LOGS);
    if (!sh) return [];
    const data = sh.getDataRange().getValues();
    const history = [];
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][2]) === String(controlNo)) {
        let displayDate = Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), "dd-MMM-yy");
        try { const jsonData = JSON.parse(data[i][4]); if(jsonData.validationDate) displayDate = jsonData.validationDate; } catch(e) {}
        const timeStr = Utilities.formatDate(new Date(data[i][1]), Session.getScriptTimeZone(), "HH:mm");
        history.push({ date: displayDate + " " + timeStr, result: data[i][3], technicalData: data[i][4] });
        if (history.length >= 10) break;
      }
    }
    return history;
  } catch (e) { return []; }
}

function stampLastModified(sheet, rowIndex) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let modColIndex = headers.indexOf('LastModified');
  if (modColIndex !== -1) sheet.getRange(rowIndex, modColIndex + 1).setValue(new Date().toISOString());
}

function getUpdates(lastSyncTime) {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sheet = ss.getSheetByName(CONF.SHEET_ASSETS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const modColIndex = headers.indexOf('LastModified');
    if (modColIndex === -1) return { success: true, updates: [], serverTime: new Date().toISOString() };

    let auditCounts = {};
    const shLogs = ss.getSheetByName(CONF.SHEET_LOGS);
    if(shLogs) {
      const logData = shLogs.getDataRange().getValues();
      for(let i=1; i<logData.length; i++) auditCounts[String(logData[i][2])] = (auditCounts[String(logData[i][2])] || 0) + 1;
    }

    const clean = Utils.clean;
    const formatDateISO = Utils.formatDateISO;

    const updates = [];
    const syncTimeMs = new Date(lastSyncTime).getTime();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const cellModTime = row[modColIndex];
      if (!cellModTime) continue; 
      
      if (new Date(cellModTime).getTime() > syncTimeMs) {
        const controlNo = clean(row[0]);
        updates.push({
          rowIndex: i + 1, controlNo: controlNo, quadrant: clean(row[1]).toUpperCase(), colorCode: clean(row[2]),
          description: clean(row[3]).toUpperCase(), project: clean(row[4]).toUpperCase(), factory: clean(row[5]), status: clean(row[6]),
          measurements: {
            surfaceRes: { mantissa: clean(row[7]), exponent: clean(row[8]) }, floorMat: { mantissa: clean(row[9]), exponent: clean(row[10]) },
            elecRes: clean(row[11]), impedance: clean(row[12]), voltage: clean(row[13]), jack: clean(row[14])
          },
          lastResult: clean(row[15]), lastDate: formatDateISO(row[16]), nextDate: formatDateISO(row[17]),
          responsible: clean(row[18]), comments: clean(row[19]), auditCount: auditCounts[controlNo] || 0
        });
      }
    }
    return { success: true, updates: updates, serverTime: new Date().toISOString() };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function getNextFolio(reportName) {
  const lock = LockService.getScriptLock(); lock.waitLock(CONF.TIMEOUTS.LOCK_SHORT);
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'FOLIO_' + String(reportName).toUpperCase().replace(/\s+/g, '_');
    let current = parseInt(props.getProperty(key) || '0', 10);
    current++;
    props.setProperty(key, current.toString());
    return current.toString().padStart(4, '0');
  } finally { lock.releaseLock(); }
}

function setupDatabase() {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const dbStructure = [
      { name: CONF.SHEET_ASSETS, headers: ['ID / Control No.', 'Tipo / Descripción', 'Cuadrante', 'Fábrica', 'Proyecto', 'Estado Actual', 'Última Verificación', 'Último Resultado', 'Vencimiento', 'Responsable', 'Color Code', 'Comentarios', 'Auditorías', 'Datos Ocultos'] },
      { name: CONF.SHEET_RULES, headers: ['Tipo de Activo (ID)', 'Icono', 'Recomendación General', 'Tolerancia', 'Configuraciones (JSON)', 'Reglas Específicas...'] },
      { name: CONF.SHEET_CONFIG, headers: ['Categoría', 'ID (Valor)', 'Etiqueta / Correos', 'Color / Configuración Extra'] },
      { name: CONF.SHEET_MATRIX, headers: ['Nombre del Estado', 'Mostrar Tarjeta (TRUE/FALSE)', 'Color de Tarjeta', 'Es Administrativo (TRUE/FALSE)'] },
      { name: CONF.SHEET_TICKETS, headers: ['Folio', 'ID de Activo', 'Fecha de Movimiento', 'Estado del Ticket', 'Datos del Ticket (JSON)'] },
      { name: CONF.SHEET_LOGS, headers: ['Fecha y Hora', 'Usuario', 'Acción Realizada', 'ID Relacionado', 'Detalle Técnico'] },
      { name: CONF.SHEET_AI_LOGS, headers: ['Fecha/Hora', 'Usuario', 'Rol', 'Pregunta Usuario', 'Personalidad Usada', 'Respuesta IA', 'Tokens/Status'] },
      { name: CONF.SHEET_ROLES, headers: ['Nombre del Rol', 'Permisos (JSON)'] },
      { name: CONF.SHEET_USERS, headers: ['Correo Electrónico', 'Rol Asignado'] }
    ];
    let creadas = 0;

    dbStructure.forEach(table => {
      let sheet = ss.getSheetByName(table.name);
      if (!sheet) {
        sheet = ss.insertSheet(table.name);
        sheet.getRange(1, 1, 1, table.headers.length).setValues([table.headers]).setFontWeight('bold').setBackground(CONF.DEFAULT_COLOR).setFontColor('white').setHorizontalAlignment('center');
        sheet.setFrozenRows(1); sheet.autoResizeColumns(1, table.headers.length); creadas++;
      }
    });

    const shRoles = ss.getSheetByName(CONF.SHEET_ROLES);
    if (shRoles && shRoles.getLastRow() <= 1) shRoles.appendRow(['SUPER_ADMIN', JSON.stringify({canView: true, canAudit: true, canConfig: true, canUsers: true, canUseCopilot: true})]);

    return `¡Éxito! Se crearon/verificaron ${creadas} pestañas de la base de datos. Tu sistema está listo para operar.`;
  } catch (error) { return "Error al instalar la base de datos: " + error.message; }
}

// ==========================================
// 🌐 SERVICIO DE TRADUCCIÓN HÍBRIDA (LanguageApp + CacheService)
// ==========================================

/**
 * Traduce un texto libre utilizando LanguageApp con caché en servidor.
 * 
 * @param {string} text Texto a traducir.
 * @param {string} targetLang Idioma destino ('en', 'es', 'zh', 'th').
 * @param {string} sourceLang Idioma origen (opcional, por defecto autodetectado).
 * @return {Object} Respuesta con el texto traducido.
 */
function translateText(text, targetLang = 'en', sourceLang = '') {
  if (!text || String(text).trim() === '') {
    return (typeof Utils !== 'undefined' && Utils.buildResponse) 
      ? Utils.buildResponse(true, { text: '', translated: '' }) 
      : { success: true, text: '', translated: '' };
  }

  const cleanText = String(text).trim();
  const rawTarget = String(targetLang || 'en').toLowerCase().trim();
  let targetCode = rawTarget;
  if (rawTarget === 'zh' || rawTarget === 'zh-cn' || rawTarget === 'cn') targetCode = 'zh-CN';
  else if (rawTarget === 'es' || rawTarget === 'mx') targetCode = 'es';
  else if (rawTarget === 'en' || rawTarget === 'us') targetCode = 'en';
  else if (rawTarget === 'th') targetCode = 'th';

  if (sourceLang && sourceLang.toLowerCase() === targetCode.toLowerCase()) {
    return Utils.buildResponse(true, { text: cleanText, translated: cleanText, fromCache: true });
  }

  const hashKey = 'TR_' + targetCode + '_' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, cleanText.toLowerCase())).replace(/[\/=+\s]/g, '_');

  if (typeof CacheService !== 'undefined') {
    try {
      const cache = CacheService.getScriptCache();
      const cached = cache.get(hashKey);
      if (cached) {
        return Utils.buildResponse(true, { text: cleanText, translated: cached, fromCache: true });
      }
    } catch (e) {
      console.warn('Error leyendo caché de traducción:', e);
    }
  }

  try {
    if (typeof LanguageApp !== 'undefined') {
      const translated = LanguageApp.translate(cleanText, sourceLang || '', targetCode);
      if (translated) {
        if (typeof CacheService !== 'undefined') {
          try {
            CacheService.getScriptCache().put(hashKey, translated, 21600);
          } catch (cacheErr) {}
        }
        return Utils.buildResponse(true, { text: cleanText, translated: translated, fromCache: false });
      }
    }
    return Utils.buildResponse(true, { text: cleanText, translated: cleanText, fallback: true });
  } catch (err) {
    console.warn(`Error en LanguageApp.translate para '${cleanText}':`, err);
    return Utils.buildResponse(true, { text: cleanText, translated: cleanText, fallback: true });
  }
}

/**
 * Traduce una lista de textos en lote para optimizar viajes de red.
 * 
 * @param {Array<string>} texts Lista de textos a traducir.
 * @param {string} targetLang Idioma destino.
 * @param {string} sourceLang Idioma origen (opcional).
 * @return {Object} Mapa de { originalText: translatedText }.
 */
function translateBatch(texts, targetLang = 'en', sourceLang = '') {
  if (!Array.isArray(texts) || texts.length === 0) {
    return Utils.buildResponse(true, { results: {} });
  }

  const results = {};
  const pending = [];

  const rawTarget = String(targetLang || 'en').toLowerCase().trim();
  let targetCode = rawTarget;
  if (rawTarget === 'zh' || rawTarget === 'zh-cn' || rawTarget === 'cn') targetCode = 'zh-CN';
  else if (rawTarget === 'es' || rawTarget === 'mx') targetCode = 'es';
  else if (rawTarget === 'en' || rawTarget === 'us') targetCode = 'en';
  else if (rawTarget === 'th') targetCode = 'th';

  const cache = (typeof CacheService !== 'undefined') ? CacheService.getScriptCache() : null;

  texts.forEach(t => {
    if (!t || String(t).trim() === '') return;
    const cleanT = String(t).trim();
    const hashKey = 'TR_' + targetCode + '_' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, cleanT.toLowerCase())).replace(/[\/=+\s]/g, '_');
    
    let hit = null;
    if (cache) {
      try { hit = cache.get(hashKey); } catch (e) {}
    }
    if (hit) {
      results[cleanT] = hit;
    } else {
      pending.push({ text: cleanT, key: hashKey });
    }
  });

  if (pending.length > 0 && typeof LanguageApp !== 'undefined') {
    const toCache = {};
    pending.forEach(item => {
      try {
        const translated = LanguageApp.translate(item.text, sourceLang || '', targetCode);
        results[item.text] = translated || item.text;
        if (translated) toCache[item.key] = translated;
      } catch (err) {
        results[item.text] = item.text;
      }
    });

    if (cache && Object.keys(toCache).length > 0) {
      try {
        cache.putAll(toCache, 21600);
      } catch (e) {}
    }
  }

  return Utils.buildResponse(true, { results: results });
}