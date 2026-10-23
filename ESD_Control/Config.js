// ==========================================
// ⚙️ CONFIGURACIÓN GLOBAL (PROPERTIES SERVICE)
// ==========================================

/**
 * Mapa de respaldo y auto-inicialización para PropertiesService según el Script ID del entorno.
 */
const ENV_PROPERTIES_MAP = {
  // 1. Entorno de Pruebas (QA)
  '1GwS99kQDAiUxSTfECzSSQEXNMF67mpbv6BLurPFZ2bZ0V0j5l0dO2EWk': {
    ENV_NAME: 'PRUEBAS (QA)',
    SS_ID: '1y_6x3bp-CR-kSieVv6TPSIOjD4-S9jvhIZOxDXlV_yk',
    HEAD_ID: 'AKfycbyg9OSHFG9RxzG0ZoQoO-ZsLZtfveBb1mmXjPtdsN0'
  },
  // 2. Entorno de Producción - Azteca
  '13OCo9k9qF-oI4Z-J2nif3Lyp6E-iWEPVDB5v2MyD6Nu2lGNYokTJKN4W': {
    ENV_NAME: 'PRODUCCIÓN - AZTECA',
    SS_ID: '1CiZnIPUbtw3eCpC2-Hsre6tKh647BSxOkZEk-8r85WA',
    HEAD_ID: 'AKfycbyk8lyqN8C6JH687pvCk-1O7j7NlXIpr94GfCo9Y48'
  },
  // 3. Entorno de Producción - Maya
  '1PSzubxj_GWEFF1_oEvn1PFzXODtZZmm8gPk8yLM4mrvJstjbPwQaQk8h': {
    ENV_NAME: 'PRODUCCIÓN - MAYA',
    SS_ID: '1vpqnf0Psk2AJrU_LYe6Tag3z-k98wcIlwaa4DlAmEqI',
    HEAD_ID: 'AKfycbzy3MDs5P_HoXDBzhVaGYpKfMZPRtGYoH1d3umy54I'
  }
};

const CONF = {
  _cachedSsId: null,
  _cachedEnvName: null,

  /**
   * Resuelve la configuración del entorno actual combinando:
   * 1. Auto-detección del Script ID en tiempo de ejecución (ScriptApp.getScriptId() -> ENV_PROPERTIES_MAP)
   * 2. Inyección en tiempo de despliegue desde deploy.ps1 (ENV_CONFIG en ConfigEnv.js)
   * 3. Propiedades persistidas en el contenedor (PropertiesService.getScriptProperties())
   */
  _resolveEnvironment() {
    let targetConfig = null;

    // Capa 1: Identificación exacta por Script ID del proyecto en ejecución (a prueba de errores de push)
    try {
      if (typeof ScriptApp !== 'undefined' && typeof ScriptApp.getScriptId === 'function') {
        const currentScriptId = ScriptApp.getScriptId();
        if (currentScriptId && ENV_PROPERTIES_MAP[currentScriptId]) {
          targetConfig = ENV_PROPERTIES_MAP[currentScriptId];
        }
      }
    } catch (e) {
      // Continuar a la Capa 2 si ScriptApp no está disponible en el contexto actual
    }

    // Capa 2: Archivo ConfigEnv.js inyectado dinámicamente por deploy.ps1 durante el push
    if (!targetConfig && typeof ENV_CONFIG !== 'undefined' && ENV_CONFIG && ENV_CONFIG.SS_ID) {
      targetConfig = {
        ENV_NAME: ENV_CONFIG.ENV_NAME || 'ENTORNO INYECTADO',
        SS_ID: String(ENV_CONFIG.SS_ID).trim()
      };
    }

    // Capa 3: Sincronización y lectura desde PropertiesService.getScriptProperties()
    try {
      if (typeof PropertiesService !== 'undefined') {
        const scriptProps = PropertiesService.getScriptProperties();
        const storedSsId = scriptProps.getProperty('SS_ID');
        const storedEnvName = scriptProps.getProperty('ENV_NAME');

        if (targetConfig && targetConfig.SS_ID) {
          // Auto-reparación: si PropertiesService está vacío o desactualizado respecto al entorno real, lo sincroniza
          if (storedSsId !== targetConfig.SS_ID || storedEnvName !== targetConfig.ENV_NAME) {
            scriptProps.setProperties({
              'SS_ID': targetConfig.SS_ID,
              'ENV_NAME': targetConfig.ENV_NAME
            }, false);
          }
          this._cachedSsId = targetConfig.SS_ID;
          this._cachedEnvName = targetConfig.ENV_NAME;
          return targetConfig;
        }

        // Si es un proyecto nuevo no listado en el mapa pero configurado en PropertiesService
        if (storedSsId && String(storedSsId).trim().length > 10) {
          this._cachedSsId = String(storedSsId).trim();
          this._cachedEnvName = storedEnvName || 'CUSTOM_ENV';
          return { SS_ID: this._cachedSsId, ENV_NAME: this._cachedEnvName };
        }
      }
    } catch (e) {
      // Continuar al respaldo en memoria si el contexto de ejecución restringe PropertiesService
    }

    if (targetConfig && targetConfig.SS_ID) {
      this._cachedSsId = targetConfig.SS_ID;
      this._cachedEnvName = targetConfig.ENV_NAME;
      return targetConfig;
    }

    // Capa 4: Respaldo para pruebas unitarias locales (Test_Suite.js)
    this._cachedSsId = '1y_6x3bp-CR-kSieVv6TPSIOjD4-S9jvhIZOxDXlV_yk';
    this._cachedEnvName = 'PRUEBAS (QA)';
    return { SS_ID: this._cachedSsId, ENV_NAME: this._cachedEnvName };
  },

  /**
   * Obtiene el ID del Spreadsheet correspondiente al entorno activo (Pruebas, Azteca o Maya).
   */
  get SS_ID() {
    if (this._cachedSsId) return this._cachedSsId;
    return this._resolveEnvironment().SS_ID;
  },

  /**
   * Obtiene el nombre descriptivo del entorno activo.
   */
  get ENV_NAME() {
    if (this._cachedEnvName) return this._cachedEnvName;
    return this._resolveEnvironment().ENV_NAME;
  },

  SHEET_ASSETS: 'DB_Assets',
  SHEET_RULES: 'DB_Rules',
  SHEET_CONFIG: 'DB_Config',
  SHEET_MATRIX: 'DB_Matrix',
  SHEET_LOGS: 'Registros',
  SHEET_AI_LOGS: 'DB_AI_Logs',
  SHEET_TICKETS: 'DB_Tickets',
  SHEET_ROLES: 'Seguridad_Roles',
  SHEET_USERS: 'Seguridad_Usuarios',
  SHEET_ALERTS: 'DB_Alerts',
  SHEET_TRAFFIC: 'DB_Traffic_Logs',
  DEFAULT_COLOR: '#043e49',
  CACHE_KEYS: {
    I18N_STATIC_PREFIX: 'ESD_CACHE_I18N_STATIC_',
    I18N_DYNAMIC_MAP: 'ESD_CACHE_I18N_DYNAMIC_MAP',
    ONLINE_USERS_MAP: 'ESD_ONLINE_USERS_MAP',
    SESSION_ACTIVE_PREFIX: 'ESD_SESSION_ACTIVE_',
    ADMIN_ANALYTICS_PREFIX: 'ESD_ADMIN_ANALYTICS_'
  },
  CACHE_TTL: {
    I18N_SECONDS: 21600,       // 6 horas (máximo permitido por CacheService)
    ONLINE_SECONDS: 300,       // 5 minutos para presencia activa
    SESSION_DEDUP_SECONDS: 1800, // 30 minutos para deduplicar inicios de sesión
    ANALYTICS_SECONDS: 120     // 2 minutos para el resumen de analíticas del Admin
  },
  TIMEOUTS: {
    LOCK: 15000,
    LOCK_SHORT: 10000
  }
};

// ==========================================
// 🗺️ DICCIONARIO Y MOTOR DE MAPEO DE ESQUEMA (DataRepository)
// ==========================================
const SCHEMA_MAP = {
  ASSETS: {
    HEADERS: [
      'CONTROL_NO', 'CUADRANTE', 'COLOR_CODE', 'DESCRIPCION', 'PROYECTO',
      'FABRICA', 'ESTADO_ACTUAL', 'SURFACE_MANTISSA', 'SURFACE_EXPONENTE',
      'FLOORMAT_MANTISSA', 'FLOORMAT_EXPONENTE', 'ELEC_RES', 'IMPEDANCE',
      'VOLTAGE', 'JACK', 'ULTIMO_RESULTADO', 'ULTIMA_VERIFICACION',
      'VENCIMIENTO', 'RESPONSABLE', 'COMENTARIOS', 'Estado_Registro', 'LastModified'
    ],
    COLS: {
      CONTROL_NO: 0,
      CUADRANTE: 1,
      COLOR_CODE: 2,
      DESCRIPCION: 3,
      PROYECTO: 4,
      FABRICA: 5,
      ESTADO_ACTUAL: 6,
      SURFACE_MANTISSA: 7,
      SURFACE_EXPONENTE: 8,
      FLOORMAT_MANTISSA: 9,
      FLOORMAT_EXPONENTE: 10,
      ELEC_RES: 11,
      IMPEDANCE: 12,
      VOLTAGE: 13,
      JACK: 14,
      ULTIMO_RESULTADO: 15,
      ULTIMA_VERIFICACION: 16,
      VENCIMIENTO: 17,
      RESPONSABLE: 18,
      COMENTARIOS: 19,
      ESTADO_REGISTRO: 20,
      LAST_MODIFIED: 21
    },
    ALIASES: {
      CONTROL_NO: ['CONTROL_NO', 'ID', 'ID_CONTROL_NO', 'CONTROLNO'],
      CUADRANTE: ['CUADRANTE', 'SECTOR', 'QUADRANT'],
      COLOR_CODE: ['COLOR_CODE', 'COLORCODE', 'COLOR'],
      DESCRIPCION: ['DESCRIPCION', 'TIPO_DESCRIPCION', 'TIPO', 'DESCRIPTION'],
      PROYECTO: ['PROYECTO', 'PROJECT'],
      FABRICA: ['FABRICA', 'PLANTA', 'FACTORY'],
      ESTADO_ACTUAL: ['ESTADO_ACTUAL', 'ESTADO', 'STATUS'],
      ULTIMO_RESULTADO: ['ULTIMO_RESULTADO', 'RESULTADO', 'LASTRESULT'],
      ULTIMA_VERIFICACION: ['ULTIMA_VERIFICACION', 'FECHA_VERIFICACION', 'LASTDATE'],
      VENCIMIENTO: ['VENCIMIENTO', 'PROXIMA_VERIFICACION', 'NEXTDATE'],
      RESPONSABLE: ['RESPONSABLE', 'RESP_VERIFICACION', 'AUDITOR'],
      COMENTARIOS: ['COMENTARIOS', 'OBSERVACIONES', 'COMMENTS'],
      ESTADO_REGISTRO: ['ESTADO_REGISTRO', 'ESTADOREGISTRO'],
      LAST_MODIFIED: ['LASTMODIFIED', 'LAST_MODIFIED', 'ULTIMA_MODIFICACION']
    }
  },
  MATRIX: {
    HEADERS: [
      'Tipo_Registro', 'Nombre_Estado', 'Mostrar_Tarjeta',
      'Color_Hex', 'Es_Administrativo', 'Requiere_Mediciones'
    ]
  },
  RULES: {
    HEADERS: [
      'TIPO_ACTIVO_ID', 'SURFACE_RES', 'FLOOR_MAT', 'ELEC_RES', 'JACK',
      'VOLTAGE', 'IMPEDANCE', 'ICONO', 'REC_GENERAL', 'TOLERANCIA',
      'REC_SURFACE_RES', 'REC_FLOOR_MAT', 'REC_ELEC_RES', 'REC_IMPEDANCE',
      'REC_VOLTAGE', 'REC_JACK'
    ]
  },
  CONFIG: {
    HEADERS: ['CATEGORIA', 'ID', 'ETIQUETA', 'COLOR_HEX', 'CONFIG_JSON']
  },
  TICKETS: {
    HEADERS: ['TICKET_ID', 'ASSET_ID', 'FECHA_APERTURA', 'ESTADO_TICKET', 'DATA_JSON']
  },
  LOGS: {
    HEADERS: ['UUID', 'FECHA', 'ID', 'RESULTADO', 'DATA', 'USUARIO_SISTEMA']
  }
};

const DataRepository = {
  /**
   * Normaliza un nombre de encabezado removiendo acentos, signos y unificando espacios a guion bajo.
   */
  normalizeKey(str) {
    if (!str) return '';
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  },

  /**
   * Obtiene el índice (0-based) de una columna en un arreglo de encabezados,
   * tolerando mayúsculas/minúsculas, acentos y alias.
   */
  findHeaderIndex(headers, canonicalKey, fallbackIndex = -1) {
    if (!Array.isArray(headers) || headers.length === 0) return fallbackIndex;
    const normalizedHeaders = headers.map(h => this.normalizeKey(h));
    const targetNorm = this.normalizeKey(canonicalKey);

    const directIdx = normalizedHeaders.indexOf(targetNorm);
    if (directIdx !== -1) return directIdx;

    const aliases = (SCHEMA_MAP.ASSETS.ALIASES && SCHEMA_MAP.ASSETS.ALIASES[targetNorm]) || [];
    for (let i = 0; i < aliases.length; i++) {
      const idx = normalizedHeaders.indexOf(this.normalizeKey(aliases[i]));
      if (idx !== -1) return idx;
    }
    return fallbackIndex;
  },

  /**
   * Sanitiza un objeto de fila importada para que sus llaves coincidan con las llaves canónicas de SCHEMA_MAP.
   */
  sanitizeRowObject(rawObj) {
    if (!rawObj || typeof rawObj !== 'object') return {};
    const sanitized = {};
    const aliasMap = SCHEMA_MAP.ASSETS.ALIASES;

    Object.keys(rawObj).forEach(rawKey => {
      const normKey = this.normalizeKey(rawKey);
      sanitized[normKey] = rawObj[rawKey];

      for (const canonical in aliasMap) {
        if (aliasMap[canonical].some(a => this.normalizeKey(a) === normKey)) {
          if (sanitized[canonical] === undefined || sanitized[canonical] === '') {
            sanitized[canonical] = rawObj[rawKey];
          }
        }
      }
    });
    return sanitized;
  }
};


/**
 * Ejecuta esta función manualmente una vez en el editor de Google Apps Script (opcional)
 * para forzar el guardado de SS_ID y ENV_NAME en PropertiesService.getScriptProperties().
 */
function inicializarPropiedadesEntorno() {
  const scriptId = ScriptApp.getScriptId();
  const envConfig = ENV_PROPERTIES_MAP[scriptId];
  if (!envConfig) {
    Logger.log('⚠️ El Script ID actual (' + scriptId + ') no está en ENV_PROPERTIES_MAP.');
    return;
  }
  PropertiesService.getScriptProperties().setProperties({
    'SS_ID': envConfig.SS_ID,
    'ENV_NAME': envConfig.ENV_NAME,
    'HEAD_ID': envConfig.HEAD_ID
  }, false);
  Logger.log('✅ PropertiesService configurado para [' + envConfig.ENV_NAME + '] -> SS_ID: ' + envConfig.SS_ID);
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ESD Control')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 🟢 FUNCIÓN MÁGICA PARA FUSIONAR ARCHIVOS (HTML INCLUDES)
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}