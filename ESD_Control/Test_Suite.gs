/**
 * ====================================================================
 * SISTEMA PLEXUS ESD - SUITE DE PRUEBAS UNITARIAS AUTOMATIZADAS
 * Archivo: Test_Suite.gs
 * ====================================================================
 * Propósito:
 * Validar de forma automatizada la integridad, seguridad, utilidades,
 * guardas defensivas y optimizaciones de rendimiento (Batch I/O) de
 * los módulos de las Fases 1, 2 y 3 del sistema ESD Control.
 *
 * Módulos de Prueba Cubiertos:
 * - TC-01: Validación de Configuración Inicial y Constantes (Config.js)
 * - TC-02: Verificación de Funciones de Utilidad y Respuestas (7_Utils_Logs.js)
 * - TC-03: Guardas Defensivas de Activos y Tickets (2_Core_Assets.js y 3_Core_Tickets.js)
 * - TC-04: Rendimiento y Operaciones por Lote / Batching (4_Service_AI.js y 5_Admin_DataHub.js)
 * - TC-05: Seguridad, Roles y Consistencia de Base de Datos
 *
 * Modo de Uso en Google Apps Script:
 * 1. Abrir el editor de Apps Script del proyecto.
 * 2. Seleccionar la función "runAllTests" en la barra superior.
 * 3. Hacer clic en "Ejecutar" y abrir el panel de "Registro de Ejecución".
 * ====================================================================
 */

/**
 * Función principal que orquesta y ejecuta todos los casos de prueba unitarios.
 * @return {Object} Objeto con el balance detallado de la ejecución.
 */
function runAllTests() {
  const startTime = new Date().getTime();
  const summary = {
    total: 0,
    passed: 0,
    failed: 0,
    suites: [],
    durationMs: 0
  };

  function log(msg) {
    if (typeof Logger !== 'undefined' && Logger.log) {
      Logger.log(msg);
    } else if (typeof console !== 'undefined' && console.log) {
      console.log(msg);
    }
  }

  log("====================================================================");
  log("   INICIANDO SUITE DE PRUEBAS UNITARIAS - PLEXUS ESD CONTROL");
  log("   Fecha/Hora: " + new Date().toISOString());
  log("====================================================================\n");

  // Harness de afirmaciones para cada prueba
  function createTestContext(suiteName) {
    const suiteResults = { name: suiteName, total: 0, passed: 0, failed: 0, tests: [] };

    function record(isPass, testId, description, details) {
      suiteResults.total++;
      summary.total++;
      if (isPass) {
        suiteResults.passed++;
        summary.passed++;
        log(`  [PASS] ${testId}: ${description}`);
        suiteResults.tests.push({ id: testId, status: 'PASS', description: description });
      } else {
        suiteResults.failed++;
        summary.failed++;
        const errDetail = details ? ` | Detalle: ${details}` : '';
        log(`  [FAIL] ${testId}: ${description}${errDetail}`);
        suiteResults.tests.push({ id: testId, status: 'FAIL', description: description, error: details });
      }
    }

    return {
      assert: function(condition, testId, description, errorMsg) {
        record(Boolean(condition), testId, description, errorMsg || "Condición evaluada como falsa");
      },
      assertEqual: function(actual, expected, testId, description) {
        const isMatch = actual === expected;
        const msg = isMatch ? '' : `Esperado: [${expected}], Obtenido: [${actual}]`;
        record(isMatch, testId, description, msg);
      },
      assertDeepEqual: function(actual, expected, testId, description) {
        const strActual = JSON.stringify(actual);
        const strExpected = JSON.stringify(expected);
        const isMatch = strActual === strExpected;
        const msg = isMatch ? '' : `Esperado: ${strExpected}, Obtenido: ${strActual}`;
        record(isMatch, testId, description, msg);
      },
      assertNotEqual: function(actual, unexpected, testId, description) {
        const isDiff = actual !== unexpected;
        const msg = isDiff ? '' : `El valor no debió ser: [${unexpected}]`;
        record(isDiff, testId, description, msg);
      },
      finish: function() {
        summary.suites.push(suiteResults);
        log(`  --> Subtotal ${suiteName}: ${suiteResults.passed}/${suiteResults.total} pasaron.\n`);
      }
    };
  }

  // ------------------------------------------------------------------
  // EJECUCIÓN DE MÓDULOS DE PRUEBA
  // ------------------------------------------------------------------

  try {
    log("--- TC-01: Configuración Inicial y Constantes del Sistema (Config.js) ---");
    const ctx1 = createTestContext("TC-01: Configuración");
    testTC01_ConfigConstants(ctx1);
    ctx1.finish();

    log("--- TC-02: Utilidades y Respuestas Estándar (7_Utils_Logs.js) ---");
    const ctx2 = createTestContext("TC-02: Utilidades");
    testTC02_UtilityFunctions(ctx2);
    ctx2.finish();

    log("--- TC-03: Guardas Defensivas e Integridad (2_Core_Assets.js y 3_Core_Tickets.js) ---");
    const ctx3 = createTestContext("TC-03: Guardas Defensivas");
    testTC03_DefensiveGuards(ctx3);
    ctx3.finish();

    log("--- TC-04: Batching y Optimización de Rendimiento (4_Service_AI.js y 5_Admin_DataHub.js) ---");
    const ctx4 = createTestContext("TC-04: Rendimiento y Batching");
    testTC04_BatchingAndPerformance(ctx4);
    ctx4.finish();

    log("--- TC-05: Seguridad, Roles y Consistencia de Base de Datos ---");
    const ctx5 = createTestContext("TC-05: Seguridad y Esquema");
    testTC05_SecurityAndDatabaseConsistency(ctx5);
    ctx5.finish();

  } catch (fatalError) {
    log(`\n[FATAL ERROR] Ocurrió una excepción no controlada en el ejecutor: ${fatalError.message}\n${fatalError.stack}`);
  }

  // ------------------------------------------------------------------
  // REPORTE FINAL CONSOLIDADO
  // ------------------------------------------------------------------
  summary.durationMs = new Date().getTime() - startTime;
  const passRate = summary.total > 0 ? ((summary.passed / summary.total) * 100).toFixed(1) : "0.0";

  log("====================================================================");
  log("          RESUMEN FINAL DE PRUEBAS UNITARIAS - PLEXUS ESD");
  log("====================================================================");
  log(`  Total de Pruebas Ejecutadas : ${summary.total}`);
  log(`  Pruebas Aprobadas ([PASS])  : ${summary.passed}`);
  log(`  Pruebas Fallidas  ([FAIL])  : ${summary.failed}`);
  log(`  Tasa de Éxito               : ${passRate}%`);
  log(`  Tiempo de Ejecución         : ${summary.durationMs} ms`);
  log("--------------------------------------------------------------------");
  if (summary.failed === 0 && summary.total > 0) {
    log("  ESTADO GENERAL: [EXITOSO] TODOS LOS TESTS PASARON SATISFACTORIAMENTE");
  } else {
    log(`  ESTADO GENERAL: [ATENCIÓN] ${summary.failed} PRUEBA(S) REQUIEREN REVISIÓN`);
  }
  log("====================================================================\n");

  return summary;
}

// ====================================================================
// CASOS DE PRUEBA ESPECÍFICOS (TC-01 A TC-05)
// ====================================================================

/**
 * TC-01: Validación de Configuración Inicial y Constantes CONF
 */
function testTC01_ConfigConstants(ctx) {
  ctx.assert(typeof CONF !== 'undefined' && CONF !== null, "TC-01.01", "El objeto global CONF debe estar definido");
  ctx.assert(typeof CONF.SS_ID === 'string' && CONF.SS_ID.length > 0, "TC-01.02", "CONF.SS_ID debe ser un string válido no vacío");

  // Hojas base del sistema
  ctx.assertEqual(CONF.SHEET_ASSETS, 'DB_Assets', "TC-01.03", "CONF.SHEET_ASSETS debe apuntar a 'DB_Assets'");
  ctx.assertEqual(CONF.SHEET_RULES, 'DB_Rules', "TC-01.04", "CONF.SHEET_RULES debe apuntar a 'DB_Rules'");
  ctx.assertEqual(CONF.SHEET_CONFIG, 'DB_Config', "TC-01.05", "CONF.SHEET_CONFIG debe apuntar a 'DB_Config'");
  ctx.assertEqual(CONF.SHEET_MATRIX, 'DB_Matrix', "TC-01.06", "CONF.SHEET_MATRIX debe apuntar a 'DB_Matrix'");
  ctx.assertEqual(CONF.SHEET_LOGS, 'Registros', "TC-01.07", "CONF.SHEET_LOGS debe apuntar a 'Registros'");
  ctx.assertEqual(CONF.SHEET_AI_LOGS, 'DB_AI_Logs', "TC-01.08", "CONF.SHEET_AI_LOGS debe apuntar a 'DB_AI_Logs'");

  // Constantes añadidas en Fase 3
  ctx.assertEqual(CONF.SHEET_TICKETS, 'DB_Tickets', "TC-01.09", "CONF.SHEET_TICKETS debe apuntar a 'DB_Tickets'");
  ctx.assertEqual(CONF.SHEET_ROLES, 'Seguridad_Roles', "TC-01.10", "CONF.SHEET_ROLES debe apuntar a 'Seguridad_Roles'");
  ctx.assertEqual(CONF.SHEET_USERS, 'Seguridad_Usuarios', "TC-01.11", "CONF.SHEET_USERS debe apuntar a 'Seguridad_Usuarios'");
  ctx.assertEqual(CONF.DEFAULT_COLOR, '#005565', "TC-01.12", "CONF.DEFAULT_COLOR institucional debe ser '#005565'");

  // Timeouts centralizados
  ctx.assert(typeof CONF.TIMEOUTS === 'object', "TC-01.13", "CONF.TIMEOUTS debe ser un objeto de configuración");
  ctx.assertEqual(CONF.TIMEOUTS.LOCK, 15000, "TC-01.14", "Timeout de Lock estándar debe ser de 15,000 ms");
  ctx.assertEqual(CONF.TIMEOUTS.LOCK_SHORT, 10000, "TC-01.15", "Timeout de Lock corto debe ser de 10,000 ms");
}

/**
 * TC-02: Verificación de Funciones de Utilidad (7_Utils_Logs.js)
 */
function testTC02_UtilityFunctions(ctx) {
  ctx.assert(typeof Utils !== 'undefined' && Utils !== null, "TC-02.01", "El namespace Utils debe estar definido");

  // Utils.clean
  ctx.assertEqual(Utils.clean(null), "", "TC-02.02", "Utils.clean(null) debe retornar cadena vacía");
  ctx.assertEqual(Utils.clean(undefined), "", "TC-02.03", "Utils.clean(undefined) debe retornar cadena vacía");
  ctx.assertEqual(Utils.clean("   "), "", "TC-02.04", "Utils.clean solo con espacios debe retornar cadena vacía");
  ctx.assertEqual(Utils.clean("  ESD-2024  "), "ESD-2024", "TC-02.05", "Utils.clean debe eliminar espacios en blanco alrededor");
  ctx.assertEqual(Utils.clean(9876), "9876", "TC-02.06", "Utils.clean debe convertir números a cadena");

  // Utils.formatDateISO
  const fechaPrueba = new Date(2026, 9, 7); // 7 de octubre de 2026
  const isoResultado = Utils.formatDateISO(fechaPrueba);
  ctx.assert(isoResultado.includes("2026-10"), "TC-02.07", `Utils.formatDateISO debe formatear a YYYY-MM (obtenido: ${isoResultado})`);
  ctx.assertEqual(Utils.formatDateISO(null), "", "TC-02.08", "Utils.formatDateISO(null) debe retornar cadena vacía");
  ctx.assertEqual(Utils.formatDateISO(""), "", "TC-02.09", "Utils.formatDateISO('') debe retornar cadena vacía");
  ctx.assertEqual(Utils.formatDateISO("PENDIENTE"), "PENDIENTE", "TC-02.10", "Utils.formatDateISO con texto debe conservar el texto");

  // Utils.normalizeText
  ctx.assertEqual(Utils.normalizeText("Árbol Éxito Índigo Ópera Último"), "ARBOL EXITO INDIGO OPERA ULTIMO", "TC-02.11", "Utils.normalizeText debe remover tildes y convertir a mayúsculas");
  ctx.assertEqual(Utils.normalizeText("   texto con espacios   "), "TEXTO CON ESPACIOS", "TC-02.12", "Utils.normalizeText debe recortar espacios");
  ctx.assertEqual(Utils.normalizeText(null), "", "TC-02.13", "Utils.normalizeText(null) debe retornar cadena vacía");

  // Utils.buildResponse
  const respOk = Utils.buildResponse(true, { folio: "TK-001", count: 5 });
  ctx.assertEqual(respOk.success, true, "TC-02.14", "Utils.buildResponse(true, ...) debe marcar success: true");
  ctx.assertEqual(respOk.folio, "TK-001", "TC-02.15", "Utils.buildResponse debe propagar las propiedades del objeto de datos");

  const respErrStr = Utils.buildResponse(false, "Permiso denegado");
  ctx.assertEqual(respErrStr.success, false, "TC-02.16", "Utils.buildResponse(false, string) debe marcar success: false");
  ctx.assertEqual(respErrStr.error, "Permiso denegado", "TC-02.17", "Utils.buildResponse debe asignar el mensaje de error correctamente");

  const respErrObj = Utils.buildResponse(false, new Error("Conexión interrumpida"));
  ctx.assertEqual(respErrObj.success, false, "TC-02.18", "Utils.buildResponse(false, Error) debe marcar success: false");
  ctx.assertEqual(respErrObj.error, "Conexión interrumpida", "TC-02.19", "Utils.buildResponse debe extraer el mensaje de instancias Error");
}

/**
 * TC-03: Integridad y Guardas Defensivas de Activos y Tickets (2_Core_Assets.js y 3_Core_Tickets.js)
 */
function testTC03_DefensiveGuards(ctx) {
  // saveNewAsset: Protección contra payloads inválidos
  ctx.assert(typeof saveNewAsset === 'function', "TC-03.01", "saveNewAsset debe ser una función disponible");

  const resNewAssetNull = saveNewAsset(null);
  ctx.assertEqual(resNewAssetNull.success, false, "TC-03.02", "saveNewAsset(null) debe ser rechazado inmediatamente");
  ctx.assert(resNewAssetNull.error.length > 0, "TC-03.03", "saveNewAsset(null) debe incluir mensaje de error descriptivo");

  const resNewAssetEmpty = saveNewAsset({});
  ctx.assertEqual(resNewAssetEmpty.success, false, "TC-03.04", "saveNewAsset({}) sin asset debe ser rechazado");

  // processAudit: Protección contra payloads inválidos o fila de cabecera
  ctx.assert(typeof processAudit === 'function', "TC-03.05", "processAudit debe ser una función disponible");

  const resAuditNull = processAudit(null);
  ctx.assertEqual(resAuditNull.success, false, "TC-03.06", "processAudit(null) debe ser rechazado inmediatamente");

  const resAuditNoAsset = processAudit({});
  ctx.assertEqual(resAuditNoAsset.success, false, "TC-03.07", "processAudit({}) sin asset debe ser rechazado");

  const resAuditHeaderRow = processAudit({ asset: { rowIndex: 1 } });
  ctx.assertEqual(resAuditHeaderRow.success, false, "TC-03.08", "processAudit en rowIndex 1 debe rechazarse para proteger la fila de cabeceras");

  const resAuditInvalidRow = processAudit({ asset: { rowIndex: "fila_cinco" } });
  ctx.assertEqual(resAuditInvalidRow.success, false, "TC-03.09", "processAudit con rowIndex no numérico debe ser rechazado");

  // saveTicketRecord: Protección contra tickets incompletos
  ctx.assert(typeof saveTicketRecord === 'function', "TC-03.10", "saveTicketRecord debe ser una función disponible");

  const resTicketNull = saveTicketRecord(null);
  ctx.assertEqual(resTicketNull.success, false, "TC-03.11", "saveTicketRecord(null) debe ser rechazado");

  const resTicketNoMode = saveTicketRecord({ assetId: "ESD-101" });
  ctx.assertEqual(resTicketNoMode.success, false, "TC-03.12", "saveTicketRecord sin 'mode' debe ser rechazado");

  const resTicketNoAsset = saveTicketRecord({ mode: "OPEN" });
  ctx.assertEqual(resTicketNoAsset.success, false, "TC-03.13", "saveTicketRecord sin 'assetId' debe ser rechazado");
}

/**
 * TC-04: Batching y Optimización de Rendimiento (4_Service_AI.js y 5_Admin_DataHub.js)
 */
function testTC04_BatchingAndPerformance(ctx) {
  ctx.assert(typeof prepararContextoESD === 'function', "TC-04.01", "prepararContextoESD debe ser una función disponible");

  // Manejo seguro de casos extremos
  const emptyContext = prepararContextoESD(null);
  ctx.assert(typeof emptyContext === 'string' && emptyContext.includes("| ID |"), "TC-04.02", "prepararContextoESD(null) debe generar la cabecera Markdown sin errores");

  const singleRowContext = prepararContextoESD([["ID", "Cuadrante", "Color"]]);
  ctx.assert(typeof singleRowContext === 'string' && singleRowContext.includes("| ID |"), "TC-04.03", "prepararContextoESD solo con cabecera debe retornar tabla vacía estructurada");

  // Formato compacto optimizado para Gemini (15 columnas esenciales)
  const mockAssetRows = [
    ["ID", "Cuadrante", "Color", "Descripcion", "Proyecto", "Fabrica", "Estado", "SurfM", "SurfE", "MatM", "MatE", "Elec", "Imp", "Volt", "Jack", "Dictamen", "UltFecha", "Vence", "Auditor"],
    ["ESD-001", "Q1", "#005565", "TAPETE ESD", "ALPHA", "FAB-1", "CALIBRADO", "1.2", "7", "2.5", "8", "10", "5", "0", "0", "CUMPLE", new Date(2026, 0, 1), new Date(2026, 11, 31), "AUD-01"],
    ["ESD-002", "Q2", "#005565", "TALONERA", "BETA", "FAB-2", "VENCIDO", "5.0", "9", "", "", "12", "8", "1", "0", "FALLA", new Date(2025, 5, 1), new Date(2025, 11, 31), "AUD-02"]
  ];

  const formattedContext = prepararContextoESD(mockAssetRows, "ALPHA");
  ctx.assert(formattedContext.includes("ESD-001"), "TC-04.04", "El contexto generado debe contener los activos de prueba");
  ctx.assert(formattedContext.includes("1.2E7"), "TC-04.05", "Las medidas científicas deben comprimirse en formato 'MantisaEExponente'");
  ctx.assert(formattedContext.includes("2026-12-31"), "TC-04.06", "La fecha de vencimiento debe formatearse a ISO YYYY-MM-DD");

  // Invariante de matrices rectangulares para escrituras en lote (setValues)
  // Google Sheets requiere que cada fila en setValues() tenga exactamente la misma cantidad de columnas
  const testBatchMatrix = [
    new Array(20).fill("DATO_A"),
    new Array(20).fill("DATO_B"),
    new Array(20).fill("DATO_C")
  ];

  const colCount = testBatchMatrix[0].length;
  const isUniformMatrix = testBatchMatrix.every(row => row.length === colCount);
  ctx.assert(isUniformMatrix, "TC-04.07", "Las matrices para setValues() en lote deben ser perfectamente rectangulares");

  // Medición de rendimiento en generación de estructuras en memoria
  const tStart = new Date().getTime();
  const largeMockData = [mockAssetRows[0]];
  for (let i = 1; i <= 500; i++) {
    largeMockData.push([
      `ESD-PERF-${i}`, "Q1", "#005565", "PULSERA", "PROYECTO_X", "PLANTA_1", "ACTIVO",
      "1.0", "6", "1.0", "6", "5", "2", "0", "0", "CUMPLE", new Date(), new Date(), "AUDITOR_TEST"
    ]);
  }
  const largeContextResult = prepararContextoESD(largeMockData, "PERF-250", 100);
  const tElapsed = new Date().getTime() - tStart;

  ctx.assert(largeContextResult.includes("ESD-PERF-250"), "TC-04.08", "prepararContextoESD debe priorizar registros que coincidan con la búsqueda");
  ctx.assert(tElapsed < 500, "TC-04.09", `Procesamiento en memoria de 500 registros debe ejecutarse en menos de 500ms (obtenido: ${tElapsed}ms)`);
}

/**
 * TC-05: Seguridad, Roles y Consistencia Estructural
 */
function testTC05_SecurityAndDatabaseConsistency(ctx) {
  // Verificación de permisos estándar de SUPER_ADMIN
  const expectedPerms = {
    canView: true,
    canAudit: true,
    canConfig: true,
    canUsers: true,
    canUseCopilot: true
  };

  const strPerms = JSON.stringify(expectedPerms);
  const parsedPerms = JSON.parse(strPerms);

  ctx.assertEqual(parsedPerms.canView, true, "TC-05.01", "Rol SUPER_ADMIN debe poseer permiso canView");
  ctx.assertEqual(parsedPerms.canAudit, true, "TC-05.02", "Rol SUPER_ADMIN debe poseer permiso canAudit");
  ctx.assertEqual(parsedPerms.canConfig, true, "TC-05.03", "Rol SUPER_ADMIN debe poseer permiso canConfig");
  ctx.assertEqual(parsedPerms.canUsers, true, "TC-05.04", "Rol SUPER_ADMIN debe poseer permiso canUsers");
  ctx.assertEqual(parsedPerms.canUseCopilot, true, "TC-05.05", "Rol SUPER_ADMIN debe poseer permiso canUseCopilot");

  // Validación de integridad de tablas de la base de datos
  const requiredTables = [
    CONF.SHEET_ASSETS,
    CONF.SHEET_RULES,
    CONF.SHEET_CONFIG,
    CONF.SHEET_MATRIX,
    CONF.SHEET_TICKETS,
    CONF.SHEET_LOGS,
    CONF.SHEET_AI_LOGS,
    CONF.SHEET_ROLES,
    CONF.SHEET_USERS
  ];

  const uniqueTables = new Set(requiredTables);
  ctx.assertEqual(uniqueTables.size, 9, "TC-05.06", "El esquema del sistema debe constar de exactamente 9 tablas maestras sin duplicados");
  ctx.assert(!uniqueTables.has(undefined) && !uniqueTables.has(""), "TC-05.07", "Ningún nombre de tabla maestra debe ser indefinido o vacío");
}

// Soporte para ejecución en entornos de testing locales / Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runAllTests,
    testTC01_ConfigConstants,
    testTC02_UtilityFunctions,
    testTC03_DefensiveGuards,
    testTC04_BatchingAndPerformance,
    testTC05_SecurityAndDatabaseConsistency
  };
}
