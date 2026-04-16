/**
 * ==========================================
 * SUBSISTEMA BI - ANÁLISIS DE RESULTADOS DE COORDINADORES
 * Archivo: Backend_Coordinadores.gs
 * ==========================================
 * Analiza el rendimiento del equipo de coordinación leyendo
 * la metadata inyectada en la Sábana General de forma cruda.
 */

function getMetricasCoordinadores(forceSync) {
  try {
    // 1. Lógica de sincronización inteligente (Caché de 3 min)
    var props = PropertiesService.getScriptProperties();
    var lastSync = props.getProperty('LAST_BI_SYNC');
    var now = new Date().getTime();
    var diffMin = lastSync ? (now - parseInt(lastSync)) / 60000 : 999;
    
    // Si se fuerza o pasaron más de 3 minutos, sincronizamos silenciosamente
    if (forceSync || diffMin > 3) {
      sincronizarSabanaBI(true);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sábana General Docente");
    if (!sheet) {
       return { role: 'ERROR', message: "Hoja 'Sábana General Docente' no encontrada." };
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 3) {
       return { role: 'ERROR', message: "La Sábana no tiene datos consolidados." };
    }

    // Datos crudos completos (Memoria)
    var allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headerCodes = allData[0]; // Fila 1: Códigos de columna (ej. hits_s1_ap)

    // Índices Maestros (Base)
    var indPrograma = 2;     // Col C
    var indCurso = 4;        // Col E
    var indDocente = 6;      // Col G
    var indCoordName = 17;   // Col R — Nombre del Coordinador
    var indCoordinator = 18; // Col S — Email del Coordinador

    var idxScoreLMS = headerCodes.indexOf('LMS_TOTAL');
    var idxScoreAcomp = headerCodes.indexOf('ACOMP_TOTAL');
    
    // Función robusta para buscar columna por código (sin depender de findIndex)
    var getColIdx = function(targetCode) {
        var target = targetCode.toLowerCase().trim();
        for (var ci = 0; ci < headerCodes.length; ci++) {
            var cellVal = headerCodes[ci];
            if (cellVal === null || cellVal === undefined) continue;
            var cellStr = String(cellVal).trim().toLowerCase();
            if (cellStr === target) return ci;
        }
        return -1;
    };
    
    // Se eliminó la extracción de tsCodes_V y tsCodes_P (masterTsMapping)
    // porque generaba desalineaciones con las posiciones reales de Sábana General Docente.
    // Ahora leemos el código de semana ('_s2', '_s3', etc.) directamente desde 'headerCodes'.

    // Arrays para clasificar los índices de los metadatos
    var idxTsLms = [];
    var idxTsAcomp = [];
    var idxAuditTimeLms = []; 
    var idxAuditTimeAcomp = []; // Precalculados Acomp
    var idxHits = [];
    var idxEmails = [];
    var idxWa = [];
    var idxAuditLms = [];
    var idxAuditAcomp = [];

    for (var c = 0; c < headerCodes.length; c++) {
      var code = String(headerCodes[c]).trim().toLowerCase();
      if (!code) continue;

      // Timestamps LMS: columnas tipo c_1_1_pre_ts, c_2_1_s2_ts (terminan en _ts)
      // Timestamps Acomp: columnas tipo A_C01_OBJ_T, C_C10_EVA_T (terminan en _t, contienen _c0 o _c1)
      var endsTs = (code.length >= 3 && code.substring(code.length - 3) === '_ts');
      var endsT = (code.length >= 2 && code.substring(code.length - 2) === '_t' && !endsTs);
      
      if (endsTs) {
          idxTsLms.push(c);
      } else if (endsT && (code.indexOf('_c0') !== -1 || code.indexOf('_c1') !== -1)) {
          idxTsAcomp.push(c);
      } else if (code === 'audit_time' || code === 'audit_time_alll' || code.indexOf('a_audit_time') !== -1) {
          // Acomp time columns: 'audit_time' (promedio 9 primeros), 'audit_time_alll' (total 11)
          // NOTA: Deben checarse ANTES de audit_time_s* para no caer en LMS
          idxAuditTimeAcomp.push(c);
      } else if (code.indexOf('audit_time_s') !== -1) {
          idxAuditTimeLms.push(c);
      } else if (code.indexOf('hits_') !== -1) {
          idxHits.push(c);
      } else if (code.indexOf('email_') !== -1) {
          idxEmails.push(c);
      } else if (code.indexOf('wa_') !== -1) {
          idxWa.push(c);
      } else if (code.indexOf('a_audit_burst') !== -1 || (code.indexOf('audit_burst') !== -1 && code.startsWith('a_'))) {
          idxAuditAcomp.push(c);
      } else if (code.indexOf('audit_burst') !== -1 || code.indexOf('alerta') !== -1) {
          idxAuditLms.push(c);
      }
    }

    var asignaturasRaw = [];

    for (var i = 2; i < allData.length; i++) {
        var row = allData[i];
        var coordEmail = String(row[indCoordinator] || '').trim().toLowerCase();
        
        // Exclusión de "basura" o jefatura pura que no audita individualmente en Moodle
        if (!coordEmail || coordEmail === 'undefined' || coordEmail.indexOf('pregrado@usmpvirtual') !== -1 || coordEmail.indexOf('posgrado@usmpvirtual') !== -1) {
            continue;
        }

        var prog = String(row[indPrograma] || '').trim();
        var cur = String(row[indCurso] || '').trim();
        var doc = String(row[indDocente] || '').trim();
        // Usar nombre real de Col R; fallback al email si está vacío
        var rawName = String(row[indCoordName] || '').trim();
        var cleanName = rawName || (coordEmail.split('@')[0].charAt(0).toUpperCase() + coordEmail.split('@')[0].slice(1));

        // Notas Vigesimales
        var scoreLMS = idxScoreLMS !== -1 ? row[idxScoreLMS] : '';
        var scoreAcomp = idxScoreAcomp !== -1 ? row[idxScoreAcomp] : '';

        // Tiempos LMS: Extracción Raw para Clustering en Frontend (6 Bins: Bienvenida, S1-S4, Cierre)
        var tieneTsLms = false;
        var raw_lms_w = [[], [], [], [], [], []];
        
        for (var t = 0; t < idxTsLms.length; t++) {
            var colIndex = idxTsLms[t];
            var codeName = String(headerCodes[colIndex]).trim().toLowerCase();

            var val = row[colIndex];
            if (val && String(val).trim() !== '') {
                var d = new Date(val);
                if (!isNaN(d.getTime())) {
                    var wk = -1;
                    if (codeName.indexOf('_b') !== -1 || codeName.indexOf('_bien') !== -1 || codeName.indexOf('_pre') !== -1) wk = 0;
                    else if (codeName.indexOf('_s1') !== -1) wk = 1;
                    else if (codeName.indexOf('_s2') !== -1) wk = 2;
                    else if (codeName.indexOf('_s3') !== -1) wk = 3;
                    else if (codeName.indexOf('_s4') !== -1) wk = 4;
                    else if (codeName.indexOf('_cier') !== -1 || codeName.indexOf('_s5') !== -1) wk = 5;

                    if (wk !== -1) {
                        raw_lms_w[wk].push(d.getTime());
                    }
                    tieneTsLms = true;
                }
            }
        }

        // MÉTODO CLÁSICO: audit_time_sX para Promedio Min LMS (por asignatura individual)
        // También requerimos expansión a 6 bins para el Clásico si aplicara, pero
        // los audit_time precalculados solo son s1, s2, s3, s4 (4 columnas generadas de la matriz).
        // Se preserva la matriz antigua [0,1,2,3] para compatibilidad del Classic Promedio.
        var audit_lms_total = 0;
        var audit_lms_w = [0, 0, 0, 0, 0, 0];
        for (var t = 0; t < idxAuditTimeLms.length; t++) {
            var colIndex = idxAuditTimeLms[t];
            var codeName = String(headerCodes[colIndex]).trim().toLowerCase();
            var wkIdx = -1;
            if (codeName.indexOf('_b') !== -1 || codeName.indexOf('_bien') !== -1 || codeName.indexOf('_pre') !== -1) wkIdx = 0;
            else if (codeName.indexOf('_s1') !== -1) wkIdx = 1;
            else if (codeName.indexOf('_s2') !== -1) wkIdx = 2;
            else if (codeName.indexOf('_s3') !== -1) wkIdx = 3;
            else if (codeName.indexOf('_s4') !== -1) wkIdx = 4;
            else if (codeName.indexOf('_cier') !== -1 || codeName.indexOf('_s5') !== -1) wkIdx = 5;

            var valAuditStr = String(row[colIndex] || '').trim();
            if (valAuditStr !== '') {
                var numStr = valAuditStr.replace(/[^0-9.]/g, '');
                var num = parseFloat(numStr);
                if (!isNaN(num)) {
                    audit_lms_total += num;
                    if (wkIdx !== -1) audit_lms_w[wkIdx] += num;
                }
                tieneTsLms = true;
            }
        }

        // Tiempos Acomp: Extracción Raw para Clustering
        var diffMinAcomp = 0;
        var tieneTsAcomp = false;
        var raw_acp = [];
        
        for (var t = 0; t < idxTsAcomp.length; t++) {
            var val = row[idxTsAcomp[t]];
            if (val && String(val).trim() !== '') {
                var d = new Date(val);
                if (!isNaN(d.getTime())) {
                    raw_acp.push(d.getTime());
                    tieneTsAcomp = true;
                }
            }
        }

        // Sumar minutos de columnas Acomp (Ej. a_audit_time_...)
        for (var t = 0; t < idxAuditTimeAcomp.length; t++) {
            var valAuditStr = String(row[idxAuditTimeAcomp[t]] || '').trim();
            if (valAuditStr !== '') {
                var numStr = valAuditStr.replace(/[^0-9.]/g, ''); 
                var num = parseFloat(numStr);
                if (!isNaN(num)) diffMinAcomp += num;
                tieneTsAcomp = true;
            }
        }

        // Función auxiliar para extraer semana de la columna
        function extractWk(cIdx) {
            var colName = String(headerCodes[cIdx]).trim().toLowerCase();
            if (colName.indexOf('_b') !== -1 || colName.indexOf('_bien') !== -1 || colName.indexOf('_pre') !== -1) return 0;
            if (colName.indexOf('_s1') !== -1) return 1;
            if (colName.indexOf('_s2') !== -1) return 2;
            if (colName.indexOf('_s3') !== -1) return 3;
            if (colName.indexOf('_s4') !== -1) return 4;
            if (colName.indexOf('_cier') !== -1 || colName.indexOf('_s5') !== -1) return 5;
            return -1;
        }

        // Sumatorias Hits Moodle por semana
        var h = 0;
        var h_w = [0,0,0,0,0,0];
        for (var idx = 0; idx < idxHits.length; idx++) {
            var valH = row[idxHits[idx]];
            if (valH && !isNaN(valH)) {
                h += Number(valH);
                var w = extractWk(idxHits[idx]);
                if (w !== -1) h_w[w] += Number(valH);
            }
        }

        // Sumatorias Mails por semana
        var m = 0;
        var m_w = [0,0,0,0,0,0];
        for (var idx = 0; idx < idxEmails.length; idx++) {
            var valM = row[idxEmails[idx]];
            if (valM && !isNaN(valM)) {
                m += Number(valM);
                var w = extractWk(idxEmails[idx]);
                if (w !== -1) m_w[w] += Number(valM);
            }
        }

        // Sumatorias WA por semana
        var w_tot = 0;
        var w_w = [0,0,0,0,0,0];
        for (var idx = 0; idx < idxWa.length; idx++) {
            var valW = row[idxWa[idx]];
            if (valW && !isNaN(valW)) {
                w_tot += Number(valW);
                var wk = extractWk(idxWa[idx]);
                if (wk !== -1) w_w[wk] += Number(valW);
            }
        }

        // Auditorías LMS por semana
        var a_lms = 0;
        var a_lms_w = [0,0,0,0,0,0];
        for (var idx = 0; idx < idxAuditLms.length; idx++) {
            var valA = String(row[idxAuditLms[idx]] || '').trim().toUpperCase();
            if (valA.indexOf('DETECTADO') !== -1 || valA === '1') {
                a_lms++;
                var wk = extractWk(idxAuditLms[idx]);
                if (wk !== -1) a_lms_w[wk]++;
            }
        }

        // Auditorías ACOMP por semana
        var a_acp = 0;
        var a_acp_w = [0,0,0,0,0,0];
        for (var idx = 0; idx < idxAuditAcomp.length; idx++) {
            var valA = String(row[idxAuditAcomp[idx]] || '').trim().toUpperCase();
            if (valA.indexOf('DETECTADO') !== -1 || valA === '1') {
                a_acp++;
                var wk = extractWk(idxAuditAcomp[idx]);
                if (wk !== -1) a_acp_w[wk]++;
            }
        }

        asignaturasRaw.push({
            prog: prog,
            cur: cur,
            doc: doc,
            coord: cleanName,
            coordEmail: coordEmail,
            s_lms: (scoreLMS !== '' && !isNaN(scoreLMS)) ? parseFloat(scoreLMS) : null,
            s_acp: (scoreAcomp !== '' && !isNaN(scoreAcomp)) ? parseFloat(scoreAcomp) : null,
            // Promedio Min LMS (método clásico audit_time)
            audit_lms: parseFloat(audit_lms_total.toFixed(1)),
            audit_lms_w: audit_lms_w,
            // Tiempo Absoluto LMS (raw arrays para clustering frontend)
            raw_lms_w: raw_lms_w,
            raw_acp: raw_acp,
            ts_acp: parseFloat(diffMinAcomp.toFixed(1)),
            h: h,
            m: m,
            w: w_tot,
            h_w: h_w,
            m_w: m_w,
            w_w: w_w,
            a: a_lms + a_acp, // Backward compatibility for chart if needed
            a_lms: a_lms,
            a_acp: a_acp,
            a_lms_w: a_lms_w,
            a_acp_w: a_acp_w,
            // Bandera para saber si se empezó el llenado (aunque sea con score 0 pero tiene timestamp)
            startedLms: tieneTsLms,
            startedAcp: tieneTsAcomp
        });
    }

    return {
        success: true,
        data: asignaturasRaw
    };

  } catch(e) {
    return { role: 'ERROR', message: "Error Extract Coordinadores: " + e.toString() };
  }
}

function saveCoordinatorSnapshot(payload) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Histórico_Tiempos_Coord');
    if (!sheet) return { success: false, message: 'No se encontró la pestaña Histórico_Tiempos_Coord.' };

    var data = JSON.parse(payload);
    var timestamp = new Date();
    
    var rowsToInsert = [];
    for (var i = 0; i < data.length; i++) {
        var c = data[i];
        rowsToInsert.push([
            timestamp,
            c.periodo || 'Mensual',
            c.coord,
            c.total,
            c.lmsAprobados,
            c.acompAprobados,
            c.avgLms,
            c.lmsTsTotalW && c.lmsTsTotalW[1] ? c.lmsTsTotalW[1] : 0, // Mins S1
            c.lmsTsTotalW && c.lmsTsTotalW[2] ? c.lmsTsTotalW[2] : 0, // Mins S2
            c.lmsTsTotalW && c.lmsTsTotalW[3] ? c.lmsTsTotalW[3] : 0, // Mins S3
            c.lmsTsTotalW && c.lmsTsTotalW[4] ? c.lmsTsTotalW[4] : 0, // Mins S4
            c.hits,
            c.mails,
            c.wa,
            c.audits
        ]);
    }

    if (rowsToInsert.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);
    }
    
    return { success: true, message: 'Snapshot guardado exitosamente (' + rowsToInsert.length + ' registros).' };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}
