// ==========================================
// 🛠️ TICKETS: MANEJO DE FALLAS Y DRIVE
// ==========================================

function getFolderRecursive(pathArray) {
  const ssFile = DriveApp.getFileById(CONF.SS_ID);
  let folder = ssFile.getParents().next(); 
  
  pathArray.forEach(folderName => {
    const safeName = folderName ? String(folderName).trim() : "SIN_DATO";
    const folders = folder.getFoldersByName(safeName);
    if (folders.hasNext()) folder = folders.next();
    else folder = folder.createFolder(safeName);
  });
  return folder;
}

function uploadTicketFile(fileObj, controlNo, project, description) {
  try {
    const date = new Date();
    const monthYear = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM");
    const safeProject = project ? String(project).trim() : "GENERAL";
    const path = ["EVIDENCIA_ESD_PLEXUS", safeProject, monthYear];
    const folder = getFolderRecursive(path);
    const contentType = fileObj.data.substring(5, fileObj.data.indexOf(';')) || 'image/jpeg';
    const bytes = Utilities.base64Decode(fileObj.data.split(',')[1]);
    const blob = Utilities.newBlob(bytes, contentType);
    const safeDesc = String(description || 'ACTIVO').replace(/[^a-zA-Z0-9]/g, '_');
    const safeId = String(controlNo || 'ID').replace(/[^a-zA-Z0-9]/g, '_');
    blob.setName(`${safeId}_${safeDesc}_${Date.now()}.jpg`);
    const file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    return { success: true, url: file.getUrl() };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function uploadTicketFiles(files, ticketId, assetData) {
  try {
    const date = new Date();
    const monthYear = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM");
    const path = ["EVIDENCIA_ESD_PLEXUS", assetData.factory, assetData.project, monthYear];
    const folder = getFolderRecursive(path);
    const urls = [];
    
    files.forEach((fileObj, index) => {
      const contentType = fileObj.data.substring(5, fileObj.data.indexOf(';'));
      const bytes = Utilities.base64Decode(fileObj.data.split(',')[1]);
      const blob = Utilities.newBlob(bytes, contentType);
      
      const safeDesc = String(assetData.description || 'ACTIVO').replace(/[^a-zA-Z0-9]/g, '_');
      blob.setName(`${ticketId}_${assetData.quadrant}_${safeDesc}_${index + 1}.jpg`);
      
      const file = folder.createFile(blob);
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
      urls.push(file.getUrl());
    });
    return { success: true, urls: urls };
  } catch (e) { return { success: false, error: e.toString() }; }
}

function saveTicketRecord(payload) {
  const lock = LockService.getScriptLock(); lock.tryLock(15000);
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    let sh = ss.getSheetByName('DB_Tickets');
    if (!sh) {
      sh = ss.insertSheet('DB_Tickets');
      sh.appendRow(["TICKET_ID", "ASSET_ID", "FECHA_APERTURA", "ESTADO_TICKET", "DATA_JSON"]);
      sh.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#e11d48").setFontColor("#ffffff");
    }
    
    const data = sh.getDataRange().getValues();
    const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    const userEmail = Session.getActiveUser().getEmail(); 
    
    let emailsStr = "";
    if (payload.emails && Array.isArray(payload.emails)) {
        emailsStr = payload.emails.filter(e => e && e.trim() !== '').map(e => e.includes('@') ? e.trim() : `${e.trim()}@plexus.com`).join(', ');
    }

    let ticketId = "";
    if (payload.mode === 'OPEN') {
        ticketId = "TKT-" + getNextFolio('TICKETS');
    } else {
        for (let i = data.length - 1; i >= 1; i--) {
            if (String(data[i][1]) === String(payload.assetId) && String(data[i][3]) === "ABIERTO") {
                ticketId = data[i][0]; break;
            }
        }
        if(!ticketId) ticketId = "TKT-" + getNextFolio('TICKETS');
    }

    let photoUrls = [];
    if (payload.photos && Array.isArray(payload.photos) && payload.photos.length > 0) {
        const uploadRes = uploadTicketFiles(payload.photos, ticketId, payload.assetInfo);
        if (uploadRes.success) photoUrls = uploadRes.urls;
    }

    payload.formData.systemUser = userEmail;
    payload.formData.emails_notificados = emailsStr;
    if(photoUrls.length > 0) payload.formData.evidencia_fotos = photoUrls;

    if (payload.mode === 'OPEN') {
        const initialData = { apertura: payload.formData, intentos_medicion: [] };
        sh.appendRow([ticketId, payload.assetId, dateStr, "ABIERTO", JSON.stringify(initialData)]);
        sendTicketEmail(ticketId, payload.formData, payload.assetInfo, "OPEN");
        return { success: true, ticketId: ticketId };
    } else {
        let isUpdated = false;
        for (let i = data.length - 1; i >= 1; i--) {
          if (String(data[i][1]) === String(payload.assetId) && String(data[i][3]) === "ABIERTO") {
            let oldData = { apertura: {}, intentos_medicion: [] };
            try { oldData = JSON.parse(data[i][4]); } catch(e) {}
            if (!oldData.intentos_medicion) oldData.intentos_medicion = [];
            oldData.intentos_medicion.push({
                fecha: dateStr, ticketData: payload.formData, mediciones: payload.measurements,
                dictamen: payload.passed ? "CUMPLE (CERRADO)" : "NO CUMPLE (SIGUE ABIERTO)"
            });
            sh.getRange(i + 1, 4).setValue(payload.passed ? "CERRADO" : "ABIERTO"); 
            sh.getRange(i + 1, 5).setValue(JSON.stringify(oldData));
            isUpdated = true;
            if (payload.passed) sendTicketEmail(ticketId, payload.formData, payload.assetInfo, "CLOSE");
            break;
          }
        }
        
        if (!isUpdated) {
          const newData = { apertura: {}, intentos_medicion: [{ fecha: dateStr, ticketData: payload.formData, mediciones: payload.measurements, dictamen: payload.passed ? "CUMPLE" : "NO CUMPLE" }] };
          sh.appendRow([ticketId, payload.assetId, dateStr, payload.passed ? "CERRADO" : "ABIERTO", JSON.stringify(newData)]);
          if (payload.passed) sendTicketEmail(ticketId, payload.formData, payload.assetInfo, "CLOSE");
        }
        return { success: true, ticketId: ticketId };
    }
  } catch(e) { return { success: false, error: e.toString() }; } finally { lock.releaseLock(); }
}

function getActiveTicketData(assetId) {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const sh = ss.getSheetByName('DB_Tickets');
    if (!sh) return null;

    const data = sh.getDataRange().getValues();
    const targetId = String(assetId).trim().toUpperCase();
    for (let i = data.length - 1; i >= 1; i--) {
      const rowAssetId = String(data[i][1]).trim().toUpperCase();
      const rowStatus = String(data[i][3]).trim().toUpperCase();

      if (rowAssetId === targetId && rowStatus === "ABIERTO") {
        try {
          const json = JSON.parse(data[i][4]);
          let fotosArray = [];
          let commentsStr = "Sin comentarios en el registro inicial.";
          if (json.apertura) {
              if (json.apertura.evidencia_fotos) {
                  fotosArray = json.apertura.evidencia_fotos.map(url => {
                      const match = String(url).match(/[-\w]{25,}/);
                      return match ? "https://lh3.googleusercontent.com/d/" + match[0] : url;
                  });
              }
              commentsStr = json.apertura.Comentarios || json.apertura.comments || json.apertura.Observaciones || "Sin comentarios en el registro inicial.";
          }
          let fechaString = "N/A";
          if (data[i][2]) fechaString = Utilities.formatDate(new Date(data[i][2]), Session.getScriptTimeZone(), "dd-MMM-yyyy HH:mm");

          return { folio: data[i][0], fecha: fechaString, fotos: fotosArray, comentarios: commentsStr };
        } catch(parseErr) { continue; }
      }
    }
    return null;
  } catch (e) { console.error("Error leyendo tickets:", e); return null; }
}