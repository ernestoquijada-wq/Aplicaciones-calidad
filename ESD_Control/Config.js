// ==========================================
// ⚙️ CONFIGURACIÓN GLOBAL MULTI-ENTORNO
// ==========================================

const DEFAULT_ENV_NAME = 'ENTORNO DE PRUEBAS (QA)'; // @DEPLOY_ENV_NAME
const DEFAULT_ENV_SS_ID = '1y_6x3bp-CR-kSieVv6TPSIOjD4-S9jvhIZOxDXlV_yk'; // @DEPLOY_SS_ID

/**
 * Registro maestro de entornos por Script ID (Auto-detección en la nube)
 */
const ENV_REGISTRY = {
  '1GwS99kQDAiUxSTfECzSSQEXNMF67mpbv6BLurPFZ2bZ0V0j5l0dO2EWk': {
    name: 'PRUEBAS (QA)',
    ssId: '1y_6x3bp-CR-kSieVv6TPSIOjD4-S9jvhIZOxDXlV_yk',
    headDeploymentId: 'AKfycbyg9OSHFG9RxzG0ZoQoO-ZsLZtfveBb1mmXjPtdsN0'
  },
  '13OCo9k9qF-oI4Z-J2nif3Lyp6E-iWEPVDB5v2MyD6Nu2lGNYokTJKN4W': {
    name: 'PRODUCCIÓN - AZTECA',
    ssId: '1CiZnIPUbtw3eCpC2-Hsre6tKh647BSxOkZEk-8r85WA',
    headDeploymentId: 'AKfycbyk8lyqN8C6JH687pvCk-1O7j7NlXIpr94GfCo9Y48'
  },
  '1PSzubxj_GWEFF1_oEvn1PFzXODtZZmm8gPk8yLM4mrvJstjbPwQaQk8h': {
    name: 'PRODUCCIÓN - MAYA',
    ssId: '1vpqnf0Psk2AJrU_LYe6Tag3z-k98wcIlwaa4DlAmEqI',
    headDeploymentId: 'AKfycbzy3MDs5P_HoXDBzhVaGYpKfMZPRtGYoH1d3umy54I'
  }
};

const CONF = {
  _cachedSsId: null,
  ENV_NAME: DEFAULT_ENV_NAME,

  /**
   * Resuelve el Spreadsheet ID activo con caché en memoria por ejecución:
   * 1. Propiedad de Script 'SS_ID' en PropertiesService (si fue configurada en GAS).
   * 2. Auto-detección por ScriptApp.getScriptId() usando ENV_REGISTRY.
   * 3. Constante DEFAULT_ENV_SS_ID inyectada por deploy.ps1.
   */
  get SS_ID() {
    if (this._cachedSsId) return this._cachedSsId;

    try {
      if (typeof PropertiesService !== 'undefined') {
        const propId = PropertiesService.getScriptProperties().getProperty('SS_ID');
        if (propId && String(propId).trim().length > 10) {
          this._cachedSsId = String(propId).trim();
          return this._cachedSsId;
        }
      }
    } catch (e) {}

    try {
      if (typeof ScriptApp !== 'undefined' && typeof ScriptApp.getScriptId === 'function') {
        const currentScriptId = ScriptApp.getScriptId();
        if (currentScriptId && ENV_REGISTRY[currentScriptId]) {
          this._cachedSsId = ENV_REGISTRY[currentScriptId].ssId;
          return this._cachedSsId;
        }
      }
    } catch (e) {}

    this._cachedSsId = DEFAULT_ENV_SS_ID;
    return this._cachedSsId;
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
  DEFAULT_COLOR: '#005565',
  TIMEOUTS: {
    LOCK: 15000,
    LOCK_SHORT: 10000
  }
};

/**
 * Función utilitaria opcional (ejecutable desde el editor de GAS) para inicializar
 * automáticamente las Script Properties (SS_ID y ENV_NAME) según el Script ID actual.
 */
function inicializarPropiedadesEntorno() {
  const scriptId = ScriptApp.getScriptId();
  const env = ENV_REGISTRY[scriptId];
  const props = PropertiesService.getScriptProperties();
  if (env) {
    props.setProperties({
      'SS_ID': env.ssId,
      'ENV_NAME': env.name
    }, false);
    Logger.log('✅ Propiedades configuradas para [' + env.name + '] -> SS_ID: ' + env.ssId);
  } else {
    props.setProperties({
      'SS_ID': DEFAULT_ENV_SS_ID,
      'ENV_NAME': DEFAULT_ENV_NAME
    }, false);
    Logger.log('⚠️ Script ID no listado en ENV_REGISTRY. Se aplicó configuración por defecto: ' + DEFAULT_ENV_SS_ID);
  }
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