/**
 * SISTEMA DE GESTIÓN DEL APRENDIZAJE (LMS) - MULTI-MODULO
 * Backend: Versión ULTIMATE (Robusta, Auditoría y Concurrencia)
 */

const SHEET_MAP = {
  'VIRTUAL': "Sistema de gestión del aprendizaje (LMS)- virtual",
  'PRESENCIAL': "Sistema de gestión del aprendizaje (LMS)- presencial",
  'ASIGNACION': "Asignación de coordinador",
  'ACOMPANAMIENTO': "Acompañamiento del desempeño Pedagógico"
};

const SHEET_COORDINATORS = "Datos de los coordinadores";

// Eliminamos la anulación de sesión dinámica global para evitar vulnerabilidades de permisos.
// Ahora la fuente de la verdad para los permisos es EXCLUSIVAMENTE la hoja "Datos de los coordinadores".

function doGet() {
  const maintenance = PropertiesService.getScriptProperties().getProperty('MAINTENANCE_MODE');
  if(maintenance === 'true') {
      return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;text-align:center;margin-top:50px;"><h2>El sistema se encuentra en mantenimiento (Sincronizando Bases de Datos).</h2><p>Por favor, intente ingresar en unos minutos.</p></div>');
  }
  const tpl = HtmlService.createTemplateFromFile('Index');
  return tpl.evaluate()
      .setTitle('Sistema de Monitoreo del Cumplimiento de los Estándares de Calidad USMP')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- HELPER: Detect Spreadsheet Name (Pregrado/Posgrado) ---
function getSpreadsheetInfo() {
  try {
    return { success: true, name: SpreadsheetApp.getActiveSpreadsheet().getName() };
  } catch(e) {
    return { success: false, name: '' };
  }
}

// --- HELPER: Detect Header Row ---
function getHeaders(sheet) {
  // Try rows 1 to 5 to find the ID row (contains 'c_1_1' or 'cp_1_1')
  const lastCol = sheet.getLastColumn();
  const range = sheet.getRange(1, 1, 5, lastCol).getValues();
  
  for (let r = 0; r < range.length; r++) {
    const row = range[r];
    // Check for known ID patterns
    const hasId = row.some(cell => {
      const s = String(cell).trim();
      return s.startsWith('c_1_1') || s.startsWith('cp_1_1') || s.startsWith('hits_');
    });
    
    if (hasId) {
       return { rowIndex: r, values: row }; // rowIndex is 0-based relative to sheet start (0 = Row 1)
    }
  }
  // Fallback to Row 1 (Index 0)
  return { rowIndex: 0, values: range[0] };
}

// --- AUTENTICACIÓN Y ROLES (Fase 3) ---
function getGlobalSessionData() {
  const userEmail = Session.getActiveUser().getEmail();
  let role = 'Invitado';
  let name = userEmail;
  let isGuest = true;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_COORDINATORS);
    
    if (sheet) {
      const lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        // La fila 1 es el encabezado, los datos inician en la fila 2
        // Cols: F (6)=Rol, G (7)=Correo, J (10)=Nombres
        const data = sheet.getRange(2, 6, lastRow - 1, 5).getValues(); // Leemos desde col F hasta J. (indices: 0=F, 1=G, 4=J)
        
        for (let i = 0; i < data.length; i++) {
          const rowEmail = String(data[i][1] || '').trim().toLowerCase();
          if (rowEmail === userEmail.toLowerCase()) {
            role = String(data[i][0] || '').trim(); // Col F
            name = String(data[i][4] || '').trim(); // Col J
            isGuest = false;
            break;
          }
        }
      }
    }

    // Admins overrides eliminados por vulnerabilidad de escalamiento de privilegios.
    // Solo se valida contra la hoja "Datos de los coordinadores".

    return { 
      success: true, 
      userEmail: userEmail, 
      name: name, 
      role: role, 
      isGuest: isGuest 
    };
  } catch(e) {
    return { success: false, message: e.toString(), isGuest: true, userEmail: userEmail };
  }
}


// --- OBTENER DATOS (Módulo Dinámico) ---
function getInitialData(moduleKey) {
  try {
    const sheetName = SHEET_MAP[moduleKey];
    if (!sheetName) return { role: 'ERROR', message: "Módulo no válido: " + moduleKey };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) return { role: 'ERROR', message: "No se encontró la hoja: " + sheetName };

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 3) return { role: 'ERROR', message: 'La hoja está vacía.' };

    const headerObj = getHeaders(sheet);
    const idsRow = headerObj.values;
    // Data starts after header? Or fixed at Row 3?
    // CSV says Headers at Row 4. Data likely starts after.
    // However, existing code processed from I=2 (Row 3).
    // If header is at Row 4, data must be at Row 5+.
    
    // Safety: Start processing from the row AFTER the description row.
    // El encabezado está en la fila 1 (index 0). La fila 2 tiene descripciones.
    // Por lo tanto, los datos inician en headerObj.rowIndex + 2.
    const startRowIndex = headerObj.rowIndex + 2; 
    
    // Leer valores desde la fila de datos
    // READ ALL from Row 1 to be safe, then map
    const allValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    
    // Leer enlaces (L=12, M=13 en la hoja, pero para RichTextRange es 12 y 2 columnas)
    let urlRichText = [];
    try {
      urlRichText = sheet.getRange(1, 12, lastRow, 2).getRichTextValues();
    } catch(e) {
      Logger.log("Error leyendo RichText: " + e);
    }
    
    const userEmail = Session.getActiveUser().getEmail();
    const sessionData = getGlobalSessionData();
    const role = sessionData.role;

    const courses = [];
    let totalCoursesCount = 0;

    // Iterate starting from row AFTER headers
    for (let i = startRowIndex; i < allValues.length; i++) {
        try {
            const row = allValues[i];
            if (!row[4]) continue; // Saltar filas sin nombre de curso
            
            totalCoursesCount++; 
            
            const coordEmail = String(row[18] || '').trim(); // Col S
            const coordName = String(row[17] || '').trim(); // Col R
            
            // Filtro de seguridad estricto (Jefes y Coordinadores regulares ven solo lo suyo)
            // Invitados y Admins ven todo (los Invitados solo verán el resumen por bloqueo en el frontend)
            if (role !== 'Admin' && role !== 'Invitado') {
               if (coordEmail.toLowerCase() !== userEmail.toLowerCase()) continue; 
            }
    
            let startDateStr = "";
            if (row[19] instanceof Date) {
              startDateStr = row[19].toISOString();
            } else {
              startDateStr = String(row[19]); 
            }
    
            const grades = {};
            const timestamps = {};
            
            // Notas (Desde U=20)
            for (let c = 20; c < idsRow.length; c++) {
              const id = idsRow[c];
              if (!id) continue;
              const cellValue = row[c];
              
              const idStr = String(id);
              if (idStr.endsWith('_ts') || idStr.endsWith('_T')) {
                const cleanId = idStr.replace(/_ts$/, '').replace(/_T$/, '');
                if (cellValue instanceof Date) timestamps[cleanId] = cellValue.toISOString();
                else timestamps[cleanId] = String(cellValue);
              } else {
                if (cellValue instanceof Date) grades[id] = cellValue.toISOString();
                else grades[id] = cellValue;
              }
            }
            
            // Link Extraction
            let codeAP='', urlAP='', codeUSMP='', urlUSMP='';
        
        try {
           if (urlRichText && urlRichText.length > i) {
              const rowRich = urlRichText[i]; // rowRich[0] is col L (AP), rowRich[1] is col M (USMP).
              
              const cellL = rowRich ? rowRich[0] : null; 
              const cellM = rowRich ? rowRich[1] : null;
              
              if (cellL) {
                 codeAP = cellL.getText() || '';
                 urlAP = cellL.getLinkUrl() || '';
              }
              // Fallback directo a allValues
              const rawL = String(row[11] || '').trim(); 
              if (!urlAP && rawL.startsWith('http')) { urlAP = rawL; codeAP = rawL; }
              if (!urlAP && rawL.length > 5 && !rawL.startsWith('http')) { urlAP = 'https://' + rawL; codeAP = rawL; }
              
              if (cellM) {
                 codeUSMP = cellM.getText() || '';
                 urlUSMP = cellM.getLinkUrl() || '';
              }
              // Fallback directo a allValues
              const rawM = String(row[12] || '').trim();
              if (!urlUSMP && rawM.startsWith('http')) { urlUSMP = rawM; codeUSMP = rawM; }
              if (!urlUSMP && rawM.length > 5 && !rawM.startsWith('http')) { urlUSMP = 'https://' + rawM; codeUSMP = rawM; }
           }
        } catch(e) { console.warn("Link error row " + i, e); }

         // Correos Docente (H=7, I=8)
        const email1 = String(row[7] || '').trim();
        const email2 = String(row[8] || '').trim();

            courses.push({
               rowIndex: i + 1, // 1-indexed for Apps Script (i is 0-indexed where 0 is Row 1)
               courseName: String(row[4] || '').trim(), // Col E
               professor: String(row[6] || '').trim(), // Col G
               studentsCount: String(row[14] || '0').trim(), // Col O (Index 14) "N° ESTUDIANTES"
               email1: String(row[7] || '').trim(), // Col H
               email2: String(row[8] || '').trim(), // Col I
               phoneNumber: String(row[9] || '').trim(), // Col J
               startDate: startDateStr,      // Col T (Index 19)
               program: String(row[2] || '').trim(), // Col C (Index 2)
               coordName: coordName,         // Col R (Index 17)
               coordEmail: coordEmail,       // Col S (Index 18)
               links: {
                 AP: { code: codeAP, url: urlAP },
                 USMP: { code: codeUSMP, url: urlUSMP }
               },
               grades: grades,
               timestamps: timestamps
            });
      } catch (errRow) {
        Logger.log("Error en fila " + (i+1) + ": " + errRow);
        // Continuamos con la siguiente fila, no detenemos todo
      }
    }

    return { role: role, userEmail: userEmail, courses: courses, totalCourses: totalCoursesCount };

  } catch (e) {
    return { role: 'ERROR', message: 'Error Crítico Backend: ' + e.toString() };
  }
}

// --- MÓDULO: ASIGNACIÓN DE CARGA (Fase 3) ---
function getAssignmentData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Obtener lista de posibles coordinadores
    const coordSheet = ss.getSheetByName(SHEET_COORDINATORS);
    if (!coordSheet) throw new Error("No se encontró la hoja: " + SHEET_COORDINATORS);
    
    const coordLastRow = coordSheet.getLastRow();
    const coordinators = [];
    if (coordLastRow >= 2) {
       // Cols: F (6)=Rol, G (7)=Correo, J (10)=Nombres
       const data = coordSheet.getRange(2, 6, coordLastRow - 1, 5).getValues();
       for(let i=0; i<data.length; i++){
          const rol = String(data[i][0]).trim().toLowerCase();
          const email = String(data[i][1]).trim();
          const nombre = String(data[i][4]).trim();
          // Filtrar: Jefes y Coordinadores (no invitados)
          if((rol.includes('coordinador') || rol.includes('jefe')) && email && nombre) {
              coordinators.push({ name: nombre, email: email, role: rol });
          }
       }
    }

    // 2. Obtener lista de asignaturas desde la hoja de "Asignación de coordinador"
    const asignSheet = ss.getSheetByName(SHEET_MAP['ASIGNACION']);
    if (!asignSheet) throw new Error("No se encontró la hoja de Asignación: " + SHEET_MAP['ASIGNACION']);

    const asignLastRow = asignSheet.getLastRow();
    if (asignLastRow < 3) return { courses: [], coordinators: coordinators }; // Asumiendo datos inician fila 3

    // Asumimos encabezados en fila 1 y/o 2. Leemos todo y mapeamos
    // Como las demás hojas, Col R = Index 17 (Nombre), Col S = Index 18 (Email)
    // Curso = Col E (Index 4), Docente = Col G (Index 6), Modalidad/Tipo = Col C (Index 2)
    const allValues = asignSheet.getRange(1, 1, asignLastRow, 22).getValues();
    
    // Para Asignación, ignoramos la cabecera (Fila 1). Los datos inician en la Fila 2.
    // getHeaders retorna rowIndex 0 para Fila 1. 
    const startRowIndex = 1; // Fila 2 en array (índice 1)

    const courses = [];
    for (let i = startRowIndex; i < allValues.length; i++) {
        const row = allValues[i];
        if (!row[4]) continue; // Saltar vacíos

        courses.push({
            rowIndex: i + 1,
            courseName: String(row[4] || ''),   
            professor: String(row[6] || ''),
            program: String(row[2] || ''),       // Col C
            studentsCount: String(row[14] || '0'), // Col O
            currentCoordName: String(row[17] || ''), // R
            currentCoordEmail: String(row[18] || '') // S
        });
    }

    // Retornamos todo al front
    return {
       courses: courses,
       coordinators: coordinators
    };

  } catch(e) {
    return { error: true, message: "Error cargando asignaciones: " + e.toString() };
  }
}

function saveAssignment(rowIndex, coordName, coordEmail) {
   const maintenance = PropertiesService.getScriptProperties().getProperty('MAINTENANCE_MODE');
   if(maintenance === 'true') {
       return { success: false, maintenance: true, message: "Sistema en mantenimiento." };
   }

   const lock = LockService.getScriptLock();
   try {
     lock.waitLock(10000); 

     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const sheet = ss.getSheetByName(SHEET_MAP['ASIGNACION']);
     if(!sheet) throw new Error("Hoja no encontrada.");

     // Actualizar Col R (18) y Col S (19)
     sheet.getRange(rowIndex, 18).setValue(coordName);
     sheet.getRange(rowIndex, 19).setValue(coordEmail);

     return { success: true };
   } catch(e) {
     return { success: false, message: e.toString() };
   } finally {
     lock.releaseLock();
   }
}

function saveBulkAssignment(rowIndices, coordName, coordEmail) {
   const maintenance = PropertiesService.getScriptProperties().getProperty('MAINTENANCE_MODE');
   if(maintenance === 'true') {
       return { success: false, maintenance: true, message: "Sistema en mantenimiento." };
   }

   const lock = LockService.getScriptLock();
   try {
     lock.waitLock(15000); 

     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const sheet = ss.getSheetByName(SHEET_MAP['ASIGNACION']);
     if(!sheet) throw new Error("Hoja no encontrada.");

     if(!Array.isArray(rowIndices) || rowIndices.length === 0) {
         throw new Error("No hay filas para actualizar.");
     }

     // Para ser eficientes y seguros con Google Sheets, iteramos las filas.
     // Podría optimizarse con getRangeList si están muy separados, pero iterar localmente en apps script para <1000 filas es muy rápido.
     rowIndices.forEach(rowIndex => {
         sheet.getRange(rowIndex, 18).setValue(coordName);
         sheet.getRange(rowIndex, 19).setValue(coordEmail);
     });

     return { success: true, count: rowIndices.length };
   } catch(e) {
     return { success: false, message: e.toString() };
   } finally {
     lock.releaseLock();
   }
}

// --- GUARDAR (Con LockService) ---
function saveGrade(rowIndex, criteriaId, value, weekKey, moduleKey) {
  const maintenance = PropertiesService.getScriptProperties().getProperty('MAINTENANCE_MODE');
  if(maintenance === 'true') {
      return { success: false, maintenance: true, message: "Sistema en mantenimiento." };
  }

  const lock = LockService.getScriptLock();
  try {
    // Esperar hasta 10 segundos por el lock (para concurrencia)
    lock.waitLock(10000); 

    const sheetName = SHEET_MAP[moduleKey];
    if (!sheetName) throw new Error("Módulo inválido");

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    const headerObj = getHeaders(sheet);
    const idsRow = headerObj.values;
    
    // Modificación Robusta: Búsqueda flexible de ID
    const colIndexGrade = idsRow.findIndex(h => String(h).trim().toLowerCase() === String(criteriaId).trim().toLowerCase());
    
    // TIMESTAMP LOGIC FIX:
    // Presencial headers use 'c_' prefix for timestamps even if criteria is 'cp_'
    // Example: criteria='cp_1_1_pre' -> timestamp='c_1_1_pre_ts'
    let tsId = criteriaId + '_ts';
    if (moduleKey === 'ACOMPANAMIENTO') {
        tsId = criteriaId + '_T';
    } else if (String(criteriaId).startsWith('cp_')) {
        // Try precise mapping: replace 'cp_' with 'c_'
        const altTsId = String(criteriaId).replace('cp_', 'c_') + '_ts';
        // Check if this alt ID exists in headers
        if (idsRow.some(h => String(h).trim().toLowerCase() === altTsId.toLowerCase())) {
            tsId = altTsId;
        }
    }
    
    const colIndexTs = idsRow.findIndex(h => String(h).trim().toLowerCase() === String(tsId).trim().toLowerCase());
    
    if (colIndexGrade === -1) {
       console.error("ID '" + criteriaId + "' no encontrado. IDs disponibles: " + JSON.stringify(idsRow.slice(0, 5) + "..."));
       throw new Error("ID '" + criteriaId + "' no encontrado en hoja '" + sheetName + "'");
    }
    
    // Detectar Update
    const currentCell = sheet.getRange(rowIndex, colIndexGrade + 1);
    const currentValue = currentCell.getValue();
    const isUpdate = (currentValue !== "" && currentValue !== null);

    const timestamp = new Date();
    currentCell.setValue(value);
    
    // Save Timestamp if column exists
    if (colIndexTs !== -1) {
        sheet.getRange(rowIndex, colIndexTs + 1).setValue(timestamp);
    }
    
    // Auditoría de tiempos
    if (weekKey) analyzeRapidFill(sheet, rowIndex, weekKey, idsRow, isUpdate);
    
    return { success: true, timestamp: timestamp.toISOString() };
  } catch (e) {
    throw new Error(e.toString());
  } finally {
    lock.releaseLock();
  }
}

// --- AUDITORÍA DE TIEMPOS (Helper interno) ---
function analyzeRapidFill(sheet, rowIndex, weekKey, idsRow, isUpdate) {
  try {
    // Si viene del módulo ACOMPANAMIENTO, aplicamos lógica distinta
    if (weekKey === 'ACOMPANAMIENTO') {
      const idxTimeAll = idsRow.findIndex(h => String(h).trim() === 'audit_time_alll');
      const idxTimeAvg = idsRow.findIndex(h => String(h).trim() === 'audit_time');
      const idxB9 = idsRow.findIndex(h => String(h).trim() === 'A_audit_burst9');
      const idxB4 = idsRow.findIndex(h => String(h).trim() === 'A_audit_burst4');
      
      const relevantTimestamps = [];
      idsRow.forEach((id, index) => {
        if (!id) return;
        const idLower = String(id).toLowerCase();
        // Criterios de acompañamiento terminan en _T
        if (idLower.endsWith('_t') && idLower.length > 3) {
           relevantTimestamps.push(index + 1);
        }
      });
      
      if (relevantTimestamps.length === 0) return;
      
      const startColData = 21; 
      const numCols = sheet.getLastColumn() - startColData + 1;
      if (numCols < 1) return;
      const rowValues = sheet.getRange(rowIndex, startColData, 1, numCols).getValues()[0];
      
      const dates = [];
      relevantTimestamps.forEach(colIndex => {
        const arrayIndex = colIndex - startColData; 
        if (arrayIndex >= 0 && arrayIndex < rowValues.length) {
          const val = rowValues[arrayIndex];
          if (val instanceof Date) dates.push(val.getTime());
        }
      });
      dates.sort((a, b) => a - b); 
      if (dates.length < 2) return; 
      
      // Promedio 9 primeros
      if (dates.length >= 9 && idxTimeAvg !== -1) {
         const cellTimeAvg = sheet.getRange(rowIndex, idxTimeAvg + 1);
         if (cellTimeAvg.getValue() === "") {
            const time9 = dates[8] - dates[0];
            const min9 = (time9 / 60000).toFixed(2);
            cellTimeAvg.setValue(min9 + " min");
         }
      }
      // Tiempo total (11)
      if (dates.length >= 11 && idxTimeAll !== -1) {
         const cellTimeAll = sheet.getRange(rowIndex, idxTimeAll + 1);
         if (cellTimeAll.getValue() === "") {
            const totalTime = dates[dates.length - 1] - dates[0];
            const totalMin = (totalTime / 60000).toFixed(2);
            cellTimeAll.setValue(totalMin + " min");
         }
      }
      
      // Ráfaga 8 nuevos en < 60s
      if (!isUpdate && dates.length >= 8 && idxB9 !== -1) {
        let burstDetected = false;
        for (let i = 0; i <= dates.length - 8; i++) {
          if ((dates[i+7] - dates[i]) < 60000) { burstDetected = true; break; }
        }
        if (burstDetected) sheet.getRange(rowIndex, idxB9 + 1).setValue("DETECTADO (" + new Date().toLocaleTimeString() + ")");
      }
      
      // Ráfaga Update: 4 criterios en < 30s
      if (isUpdate && dates.length >= 4 && idxB4 !== -1) {
        let burstDetected = false;
        const len = dates.length;
        if ((dates[len-1] - dates[len-4]) < 30000) burstDetected = true;
        if (burstDetected) sheet.getRange(rowIndex, idxB4 + 1).setValue("DETECTADO (" + new Date().toLocaleTimeString() + ")");
      }
      return;
    }
    
    // LOGICA ORIGINAL VIRTUAL / PRESENCIAL
    const targetWeek = (weekKey === 'Pre') ? 'S1' : weekKey;
    const reportMap = {
      'S1': { time: 'audit_time_s1', b5: 'audit_burst5_s1', b4: 'audit_burst4_s1' }, 
      'S2': { time: 'audit_time_s2', b5: 'audit_burst5_s2', b4: 'audit_burst4_s2' }, 
      'S3': { time: 'audit_time_s3', b5: 'audit_burst5_s3', b4: 'audit_burst4_s3' }, 
      'S4': { time: 'audit_time_s4', b5: 'audit_burst5_s4', b4: 'audit_burst4_s4' }  
    };
    const configNames = reportMap[targetWeek];
    if (!configNames) return; 

    // Buscar índices dinámicamente
    const idxTime = idsRow.findIndex(h => String(h).trim() === configNames.time);
    const idxB5 = idsRow.findIndex(h => String(h).trim() === configNames.b5);
    const idxB4 = idsRow.findIndex(h => String(h).trim() === configNames.b4);

    if (idxTime === -1) return; // Si no existen las columnas de auditoría, salir.

    // Buscar timestamps de la semana
    const relevantTimestamps = [];
    idsRow.forEach((id, index) => {
      if (!id || !id.toString().endsWith('_ts')) return;
      let belongs = false;
      const idLower = id.toLowerCase();
      // Lógica de pertenencia robusta (Virtual c_ y Presencial cp_ o c_ts mixed)
      
      // S1: _pre, _s1, _b
      if (targetWeek === 'S1' && (idLower.includes('_pre') || idLower.includes('_s1') || idLower.includes('_b'))) belongs = true;
      // S2: _s2
      else if (targetWeek === 'S2' && idLower.includes('_s2')) belongs = true;
      // S3: _s3
      else if (targetWeek === 'S3' && idLower.includes('_s3')) belongs = true;
      // S4: _s4
      else if (targetWeek === 'S4' && idLower.includes('_s4')) belongs = true;
      
      if (belongs) relevantTimestamps.push(index + 1);
    });

    if (relevantTimestamps.length === 0) return;

    // Leer datos
    const startColData = 21; 
    const numCols = sheet.getLastColumn() - startColData + 1;
    if (numCols < 1) return;

    const rowValues = sheet.getRange(rowIndex, startColData, 1, numCols).getValues()[0];
    
    const dates = [];
    relevantTimestamps.forEach(colIndex => {
      const arrayIndex = colIndex - startColData; 
      if (arrayIndex >= 0 && arrayIndex < rowValues.length) {
        const val = rowValues[arrayIndex];
        if (val instanceof Date) dates.push(val.getTime());
      }
    });
    dates.sort((a, b) => a - b); 

    if (dates.length < 2) return; 

    // Regla 1: Tiempo Total (1ra vez)
    if (dates.length >= (relevantTimestamps.length * 0.8)) { 
       const cellTime = sheet.getRange(rowIndex, idxTime + 1);
       if (cellTime.getValue() === "") {
          const totalTimeMs = dates[dates.length - 1] - dates[0];
          const totalMinutes = (totalTimeMs / 60000).toFixed(2);
          cellTime.setValue(totalMinutes + " min");
       }
    }

    // Regla 2: Ráfaga Nuevos (<30s, 5 items)
    if (!isUpdate && dates.length >= 5 && idxB5 !== -1) {
      let burstDetected = false;
      for (let i = 0; i <= dates.length - 5; i++) {
        if ((dates[i+4] - dates[i]) < 30000) { burstDetected = true; break; }
      }
      if (burstDetected) sheet.getRange(rowIndex, idxB5 + 1).setValue("DETECTADO (" + new Date().toLocaleTimeString() + ")");
    }

    // Regla 3: Ráfaga Update (<30s, 4 items)
    if (isUpdate && dates.length >= 4 && idxB4 !== -1) {
      let burstDetected = false;
      const len = dates.length;
      if ((dates[len-1] - dates[len-4]) < 30000) burstDetected = true;
      
      if (burstDetected) sheet.getRange(rowIndex, idxB4 + 1).setValue("DETECTADO (" + new Date().toLocaleTimeString() + ")");
    }
  } catch (e) {
    Logger.log("Audit Error: " + e.toString());
  }
}

// --- ANALYTICS CLICKS (Con LockService) ---
function trackAccess(rowIndex, type, moduleKey) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000); 

    const sheetName = SHEET_MAP[moduleKey];
    if (!sheetName) return;

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    const headerObj = getHeaders(sheet);
    const headers = headerObj.values;

    const userEmail = Session.getActiveUser().getEmail();
    
    // Obtener información exacta de la hoja de coordinadores para analytics
    const sessionResponse = getGlobalSessionData();
    const isAdmin = (sessionResponse.role === 'Admin' || sessionResponse.role === 'Jefe de área');
    
    // Determinar nombre de columna destino
    let targetHeader = '';

    if (moduleKey === 'ACOMPANAMIENTO') {
      const typeSuffix = (type === 'AP') ? 'ap' : 'usmp';
      if (isAdmin) {
        targetHeader = `A_hits_admin_${typeSuffix}`;
      } else {
        targetHeader = `A-hits_s1_${typeSuffix}`; // A-hits_s1_ap o A_hits_s1_usmp
      }
    } else {
      if (isAdmin) {
        targetHeader = (type === 'AP') ? 'hits_admin_ap' : 'hits_admin_usmp';
      } else {
        // Buscar columna "Periodo fecha" dinámicamente
        const colIndexDate = headers.findIndex(h => String(h).trim().toLowerCase().includes('periodo fecha'));
        
        let startDateCell;
        if (colIndexDate !== -1) {
            startDateCell = sheet.getRange(rowIndex, colIndexDate + 1).getValue();
        } else {
            startDateCell = sheet.getRange(rowIndex, 20).getValue(); 
        }
        
        let start = null;
        if (startDateCell instanceof Date) start = startDateCell;
        else start = new Date(startDateCell);
        
        if (!start || isNaN(start.getTime())) return;
        
        const now = new Date();
        if (Math.abs(now - start) / (1000 * 3600 * 24) > 180) start.setFullYear(now.getFullYear());

        const diffDays = Math.floor((now - start) / (1000 * 3600 * 24));
        
        let weekLabel = 's1'; 
        if (diffDays >= 0 && diffDays <= 7) weekLabel = 's1';        
        else if (diffDays > 7 && diffDays <= 14) weekLabel = 's2';   
        else if (diffDays > 14 && diffDays <= 21) weekLabel = 's3';  
        else if (diffDays > 21 && diffDays <= 28) weekLabel = 's4'; 
        else if (diffDays > 28) weekLabel = 'post';

        const typeSuffix = (type === 'AP') ? 'ap' : 'usmp';
        targetHeader = `hits_${weekLabel}_${typeSuffix}`;
      }
    }
    
    // Buscar columna
    const targetCol = headers.findIndex(h => String(h).trim() === targetHeader);
    
    if (targetCol !== -1) {
      const cell = sheet.getRange(rowIndex, targetCol + 1);
      cell.setValue((parseInt(cell.getValue()) || 0) + 1);
    }
  } catch (e) {
    Logger.log("Tracking error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

// --- EMAILS ---
  function sendTeacherEmail(toEmails, subject, htmlBody) {
    try {
      const recipients = toEmails.split(',').filter(e => e.includes('@')).join(',');
      if (!recipients) return { success: false, message: "Sin email válido" };
      
      // Procesar imágenes base64 para convertirlas a inlineImages (cid)
      // Esto es necesario para que Gmail muestre las imágenes pegadas
      const inlineImages = {};
      const imgRegex = /<img[^>]+src="data:image\/([^;]+);base64,([^"]+)"[^>]*>/g;
      
      const processedBody = htmlBody.replace(imgRegex, function(match, contentType, base64Data) {
        const blobId = "img" + Math.random().toString(36).substr(2, 9);
        const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, blobId);
        inlineImages[blobId] = blob;
        return match.replace(/src="[^"]+"/, 'src="cid:' + blobId + '"');
      });

      const options = {
        htmlBody: processedBody,
        name: "Monitor Calidad"
      };
      
      if (Object.keys(inlineImages).length > 0) {
        options.inlineImages = inlineImages;
      }

      // MailApp.sendEmail(recipient, subject, body, options)
      MailApp.sendEmail(recipients, subject, "Su cliente de correo no soporta HTML.", options);
      
      return { success: true };
    } catch (e) {
      return { success: false, message: e.toString() };
    }
  }

// --- TRACKING INTERACCIONES (Email / WhatsApp) (Con LockService) ---
function trackInteraction(rowIndex, headerName, moduleKey) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // Wait up to 10s

    const sheetName = SHEET_MAP[moduleKey];
    if (!sheetName) return { success: false, message: "Módulo desconocido" };

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    
    // 1. Buscar columna por nombre de encabezado
    const headers = getHeaders(sheet).values;
    
    // Búsqueda robusta: ignorar espacios y mayúsculas/minúsculas
    let colIndex = headers.indexOf(headerName);
    if (colIndex === -1) {
      colIndex = headers.findIndex(h => String(h).trim() === headerName.trim());
    }

    if (colIndex === -1) {
      return { success: false, message: "Encabezado '" + headerName + "' no encontrado en fila 1." };
    }

    // 2. Incrementar contador
    // rowIndex viene del frontend. Aseguramos que sea número válido.
    const row = parseInt(rowIndex);
    if (isNaN(row) || row < 1) return { success: false, message: "Fila inválida: " + rowIndex };

    const cell = sheet.getRange(row, colIndex + 1);
    const val = parseInt(cell.getValue()) || 0;
    cell.setValue(val + 1);

    return { success: true, newVal: val + 1 };
  } catch (e) {
    return { success: false, message: "Error interno: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}
// END OF CODE.GS

// ==========================================
// MÓDULO: SINCRONIZACIÓN Y MANTENIMIENTO (Fase 3.3)
// ==========================================

function runSyncAllWebApp() {
  const lock = LockService.getScriptLock();
  const props = PropertiesService.getScriptProperties();
  try {
     // Prevenir doble ejecución de mantenimiento
     lock.waitLock(30000); 
     props.setProperty('MAINTENANCE_MODE', 'true');

     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const mockUi = { alert: function(m){ console.log("Sync Alert:", m); } };
     
     // Llamar secuencialmente a SincronizacionIntern.gs
     ejecutarSincronizacion(ss, mockUi, "Asignación de coordinador", "Sistema de gestión del aprendizaje (LMS)- virtual", "VIRTUAL");
     ejecutarSincronizacion(ss, mockUi, "Asignación de coordinador", "Sistema de gestión del aprendizaje (LMS)- presencial", "PRESENCIAL");
     ejecutarSincronizacion(ss, mockUi, "Asignación de coordinador", "Acompañamiento al desempeño docente Pedagógico", "TODO");
     
     return { success: true };
  } catch(e) {
     return { error: true, message: "Fallo durante la sincronización: " + e.toString() };
  } finally {
     props.deleteProperty('MAINTENANCE_MODE');
     lock.releaseLock();
  }
}

function runImportAndSyncWebApp() {
  const lock = LockService.getScriptLock();
  const props = PropertiesService.getScriptProperties();
  try {
     // Prevenir doble ejecución de mantenimiento
     lock.waitLock(30000); 
     props.setProperty('MAINTENANCE_MODE', 'true');

     const ss = SpreadsheetApp.getActiveSpreadsheet();
     const mockUi = { alert: function(m){ console.log("Import Alert:", m); } };

     // 1. Llamar a ImportacionExterna.gs
     importarDatosATodoMatr();

     // 2. Llamar SincronizacionIntern.gs para armar la base en Acompañamiento
     ejecutarSincronizacion(ss, mockUi, "Asignación de coordinador", "Acompañamiento al desempeño docente Pedagógico", "TODO");
     
     return { success: true };
  } catch(e) {
     return { error: true, message: "Fallo durante la importación/sincronización: " + e.toString() };
  } finally {
     props.deleteProperty('MAINTENANCE_MODE');
     lock.releaseLock();
  }
}
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
