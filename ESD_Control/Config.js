// ==========================================
// ⚙️ CONFIGURACIÓN GLOBAL
// ==========================================
const CONF = {
  SS_ID: '1CiZnIPUbtw3eCpC2-Hsre6tKh647BSxOkZEk-8r85WA', // TU ID DE HOJA DE CÁLCULO
  SHEET_ASSETS: 'DB_Assets',
  SHEET_RULES: 'DB_Rules',
  SHEET_CONFIG: 'DB_Config',
  SHEET_MATRIX: 'DB_Matrix',
  SHEET_LOGS: 'Registros',
  SHEET_AI_LOGS: 'DB_AI_Logs' 
};

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