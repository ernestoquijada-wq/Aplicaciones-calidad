// ==========================================
// ⏱️ UTILIDADES: LOGS, CORREOS Y SETUP
// ==========================================

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
            `<a href="${url}" target="_blank" style="display:inline-block; margin: 5px 10px 5px 0; padding:8px 15px; background-color:${type==='CLOSE'?'#10b981':'#005565'}; color:#ffffff; text-decoration:none; font-weight:bold; border-radius:5px; font-size: 12px;">Ver Foto ${i+1}</a>`
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
            <h3 style="color: #005565; font-size: 15px; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-top: 25px;">Evidencia</h3>
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

    const clean = (v) => (v === null || v === undefined) ? "" : String(v).trim();
    const formatDateISO = (d) => {
      if (!d) return "";
      if (d instanceof Date) { try { return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd"); } catch (e) { return ""; } }
      return String(d);
    };

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
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
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
      { name: 'DB_Tickets', headers: ['Folio', 'ID de Activo', 'Fecha de Movimiento', 'Estado del Ticket', 'Datos del Ticket (JSON)'] },
      { name: CONF.SHEET_LOGS, headers: ['Fecha y Hora', 'Usuario', 'Acción Realizada', 'ID Relacionado', 'Detalle Técnico'] },
      { name: CONF.SHEET_AI_LOGS, headers: ['Fecha/Hora', 'Usuario', 'Rol', 'Pregunta Usuario', 'Personalidad Usada', 'Respuesta IA', 'Tokens/Status'] },
      { name: 'Seguridad_Roles', headers: ['Nombre del Rol', 'Permisos (JSON)'] },
      { name: 'Seguridad_Usuarios', headers: ['Correo Electrónico', 'Rol Asignado'] }
    ];
    let creadas = 0;

    dbStructure.forEach(table => {
      let sheet = ss.getSheetByName(table.name);
      if (!sheet) {
        sheet = ss.insertSheet(table.name);
        sheet.getRange(1, 1, 1, table.headers.length).setValues([table.headers]).setFontWeight('bold').setBackground('#005565').setFontColor('white').setHorizontalAlignment('center');
        sheet.setFrozenRows(1); sheet.autoResizeColumns(1, table.headers.length); creadas++;
      }
    });

    const shRoles = ss.getSheetByName('Seguridad_Roles');
    if (shRoles && shRoles.getLastRow() <= 1) shRoles.appendRow(['SUPER_ADMIN', JSON.stringify({canView: true, canAudit: true, canConfig: true, canUsers: true, canUseCopilot: true})]);

    return `¡Éxito! Se crearon/verificaron ${creadas} pestañas de la base de datos. Tu sistema está listo para operar.`;
  } catch (error) { return "Error al instalar la base de datos: " + error.message; }
}