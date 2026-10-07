// ==========================================
// 🤖 INTELIGENCIA ARTIFICIAL Y GEMINI
// ==========================================

function prepararContextoESD(assetData, userQuery = "", maxRecords = 300) {
  const lines = [
    "| ID | Quad | Desc | Proj | Fab | Motivo | Surf | Mat | Elec | Imp | Volt | Jack | Dict | Vence | Auditor |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"
  ];
  
  if (!assetData || assetData.length <= 1) return lines.join("\n");

  const queryUpper = String(userQuery || "").toUpperCase();
  const priorityRows = [];
  const standardRows = [];
  let totalActivos = 0;

  for (let i = 1; i < assetData.length; i++) {
    const r = assetData[i];
    if (!r[0]) continue;
    totalActivos++;

    const id = String(r[0]).trim();
    const quad = r[1] || "";
    const desc = r[3] || "";
    const proj = r[4] || "";
    const fab = r[5] || "";
    const reas = r[6] || "";
    const surf = (r[7] && r[8]) ? `${r[7]}E${r[8]}` : (r[7] || "0");
    const mat  = (r[9] && r[10]) ? `${r[9]}E${r[10]}` : (r[9] || "0"); 
    const elec = r[11] || "0", imp = r[12] || "0", volt = r[13] || "0", jack = r[14] || "0"; 
    const dict = r[15] || "N/A", resp = r[18] || "N/A"; 

    let vence = "SIN FECHA";
    if (r[17] instanceof Date && r[17].getFullYear() > 2000) {
      vence = Utilities.formatDate(r[17], Session.getScriptTimeZone(), "yyyy-MM-dd");
    } else if (String(r[17]).toUpperCase() === "PENDIENTE") {
      vence = "PENDIENTE";
    }

    const rowMd = `| ${id} | ${quad} | ${desc} | ${proj} | ${fab} | ${reas} | ${surf} | ${mat} | ${elec} | ${imp} | ${volt} | ${jack} | ${dict} | ${vence} | ${resp} |`;

    const dictUpper = String(dict).toUpperCase();
    const isExplicitlyQueried = queryUpper && (id.toUpperCase().includes(queryUpper) || queryUpper.includes(id.toUpperCase()));
    const isCritical = isExplicitlyQueried || dictUpper.includes("FALLA") || dictUpper.includes("NO CUMPLE") || vence === "PENDIENTE";

    if (isCritical) {
      priorityRows.push(rowMd);
    } else {
      standardRows.push(rowMd);
    }
  }

  // Priorizar fallas, pendientes y activos consultados específicamente
  const combined = priorityRows.concat(standardRows);
  const selected = combined.slice(0, maxRecords);
  lines.push(...selected);

  if (totalActivos > maxRecords) {
    lines.push(`\n[Nota: Tabla optimizada mostrando ${selected.length} activos prioritarios de un total de ${totalActivos}. Para métricas globales usa los totales exactos del dashboard]`);
  }

  return lines.join("\n");
}

function askGemini(userQuestion, personalityId) {
  const props = PropertiesService.getScriptProperties();
  const aiConfig = JSON.parse(props.getProperty('AI_COPILOT_CONFIG') || '{}');
  
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    const assetData = ss.getSheetByName(CONF.SHEET_ASSETS).getDataRange().getValues();
    
    const normalizeTexto = (texto) => {
      if (!texto) return "";
      return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    };

    let totalReal = 0, cumple = 0, falla = 0, baja = 0, incompleto = 0, vencidos = 0, porVencer = 0;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

    for(let i = 1; i < assetData.length; i++){
       const r = assetData[i];
       if (!r.join("").trim()) continue; 
       
       totalReal++;
       let dict = normalizeTexto(r[15]);   
       let motivo = normalizeTexto(r[6]);
       let fechaVal = r[17];

       if (motivo === "BAJA" || motivo === "INACTIVO") {
         baja++;
       } else {
         if (dict === "CUMPLE" || dict === "OK" || dict === "PASS") cumple++;
         else if (dict === "" || dict === "---" || dict === "N/A" || dict === "NA") incompleto++;
         else falla++;

         if (fechaVal && fechaVal instanceof Date && fechaVal.getFullYear() > 2000) {
             let fechaVence = new Date(fechaVal);
             fechaVence.setHours(0, 0, 0, 0);
             let msDiff = fechaVence.getTime() - hoy.getTime();
             let diasDiff = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
             if (diasDiff < 0) vencidos++;
             else if (diasDiff >= 0 && diasDiff <= 30) porVencer++;
         }
       }
    }

    const mathSummary = `
    [DATOS OFICIALES DEL DASHBOARD - USA ESTOS NÚMEROS EXACTOS]:
    - Total de Activos: ${totalReal}
    - Cumplimiento: ${cumple}
    - Vencidos: ${vencidos}
    - Por Vencer: ${porVencer}
    - Falla: ${falla}
    - Baja: ${baja}
    - Datos Incompletos: ${incompleto}
    `;

    const contextDataMD = prepararContextoESD(assetData, userQuestion);
    const cfgData = ss.getSheetByName(CONF.SHEET_CONFIG).getDataRange().getValues();
    let systemInstructions = "Eres un asistente ejecutivo.";
    for (let i = 1; i < cfgData.length; i++) {
      if (cfgData[i][0] === "AI_PROMPT" && String(cfgData[i][1]).trim() === String(personalityId).trim()) {
        systemInstructions = cfgData[i][2];
        break;
      }
    }

    const promptFinal = `INSTRUCCIONES PRINCIPALES:\n${systemInstructions}\n\n${mathSummary}\n\n[TABLA DETALLADA DEL INVENTARIO]:\n${contextDataMD}\n\nPREGUNTA DEL USUARIO: ${userQuestion}`;
    const payload = { contents: [{ parts: [{ text: promptFinal }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192 } };
    const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };
    
    let lastError = "";
    for (let key of aiConfig.apiKeys) {
      if (!key) continue;
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
        const response = UrlFetchApp.fetch(url, options);
        const resJson = JSON.parse(response.getContentText());

        if (response.getResponseCode() === 200) return { success: true, answer: resJson.candidates[0].content.parts[0].text };
        else lastError = resJson.error ? resJson.error.message : "Error API";
      } catch (e) { lastError = e.toString(); }
    }
    return { success: false, error: lastError };
  } catch (error) { return { success: false, error: error.toString() }; }
}

function logAiInteraction(email, role, question, promptId, answer) {
  try {
    const ss = SpreadsheetApp.openById(CONF.SS_ID);
    let sh = ss.getSheetByName('DB_AI_Logs');
    if (!sh) return; 
    sh.appendRow([ new Date(), email, role, question, promptId, "Gemini 2.5 Flash", answer ]);
  } catch (e) {}
}

function getFormattedDataForCopilot(rawRangeData) {
  let header = "| ID | Cuadrante | Descripción | Proyecto | Fábrica | Estado |\n|---|---|---|---|---|---|\n";
  let rows = rawRangeData.map(row => `| ${row[0]} | ${row[1]} | ${row[3]} | ${row[4]} | ${row[5]} | ${row[15]} |`).join('\n');
  return header + rows;
}