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
    
    // Mapa de criterios: posición expandida en la Sábana (0-based dentro del bloque de 38 TS)
    // Estructura expandida: [0-11]=Comunes, [12-15]=Virtual excl, [16-19]=Presencial excl, [20-37]=Comunes(16-33)
    // En la hoja origen Virtual: c_1_2_s1 está en idx 1  → pos expandida 1
    //                           c_2_1_s2 está en idx 4  → pos expandida 4
    //                           c_2_1_s3 está en idx 5  → pos expandida 5
    //                           c_2_1_s4 está en idx 6  → pos expandida 6
    //                           c_5_1_s1 está en idx 24 → pos expandida: 24=idx_origen16+4=28
    //                           c_5_1_s2 está en idx 25 → pos expandida 29
    //                           c_5_1_s3 está en idx 26 → pos expandida 30
    //                           c_5_1_s4 está en idx 27 → pos expandida 31
    // NOTA: Origen Virtual indices 0-11 → Sábana 0-11; 12-15 → Sábana 12-15; 16-33 → Sábana 20-37
    
    // Primero encontramos el inicio del bloque de timestamps en la Sábana
    // El bloque de TS empieza justo después de SCORE_VIG (que es la última col antes de metadata)
    var idxScoreVig = getColIdx('SCORE_VIG');
    var tsBlockStart = idxScoreVig !== -1 ? idxScoreVig + 1 : -1;
    
    // Mapeo: criterio → posición dentro del bloque expandido de 38 timestamps
    // c_1_2_s1_ts = índice expandido 1 (origen idx 1, bloque 0-11)
    // c_5_1_s1_ts = origen idx 24 (>= 16), expandido = 24 - 16 + 20 = 28
    // c_2_1_s2_ts = origen idx 4, expandido 4
    // c_5_1_s2_ts = origen idx 25, expandido = 25 - 16 + 20 = 29
    // c_2_1_s3_ts = origen idx 5, expandido 5
    // c_5_1_s3_ts = origen idx 26, expandido 30
    // c_2_1_s4_ts = origen idx 6, expandido 6
    // c_5_1_s4_ts = origen idx 27, expandido 31
    
    var pivotIdx;
    
    // Intento 1: Búsqueda por nombre exacto
    var p_s1_start = getColIdx('c_1_2_s1_ts');
    var p_s1_end   = getColIdx('c_5_1_s1_ts');
    
    if (p_s1_start !== -1 && p_s1_end !== -1) {
        // Los códigos de timestamp existen tal cual en la Sábana
        pivotIdx = [
            [p_s1_start, p_s1_end],
            [getColIdx('c_2_1_s2_ts'), getColIdx('c_5_1_s2_ts')],
            [getColIdx('c_2_1_s3_ts'), getColIdx('c_5_1_s3_ts')],
            [getColIdx('c_2_1_s4_ts'), getColIdx('c_5_1_s4_ts')]
        ];
        Logger.log('PIVOT_MODE: exact_match');
    } else if (tsBlockStart !== -1) {
        // Fallback: calcular por posición conocida en la estructura expandida
        pivotIdx = [
            [tsBlockStart + 1,  tsBlockStart + 28], // S1: c_1_2_s1_ts, c_5_1_s1_ts
            [tsBlockStart + 4,  tsBlockStart + 29], // S2: c_2_1_s2_ts, c_5_1_s2_ts
            [tsBlockStart + 5,  tsBlockStart + 30], // S3: c_2_1_s3_ts, c_5_1_s3_ts
            [tsBlockStart + 6,  tsBlockStart + 31]  // S4: c_2_1_s4_ts, c_5_1_s4_ts
        ];
        Logger.log('PIVOT_MODE: positional (tsBlockStart=' + tsBlockStart + ')');
    } else {
        // Sin timestamps disponibles
        pivotIdx = [[-1,-1],[-1,-1],[-1,-1],[-1,-1]];
        Logger.log('PIVOT_MODE: NONE - No timestamp columns found');
    }
    
    Logger.log('PIVOT_DEBUG: S1=[' + pivotIdx[0] + '] S2=[' + pivotIdx[1] + '] S3=[' + pivotIdx[2] + '] S4=[' + pivotIdx[3] + ']');

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

      if (code.indexOf('lms_ts_') !== -1 || code.indexOf('lms_p_ts_') !== -1) {
          idxTsLms.push(c);
      } else if (code.indexOf('acomp_ts_') !== -1) {
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

        // Tiempos LMS y variables semanales
        var tieneTsLms = false;
        var diffMinLms = 0; // Legacy fallback count
        var ts_lms_w_start = [null, null, null, null];
        var ts_lms_w_end = [null, null, null, null];
        var lms_audited_w = [0, 0, 0, 0];
        
        // Primero verificamos si tenemos actividad en Moodle via Ts crudos
        for (var t = 0; t < idxTsLms.length; t++) {
            if (row[idxTsLms[t]]) tieneTsLms = true;
        }

        // NUEVO MÉTODO DE TIEMPOS LMS: Por Pivotes Bookend Absolutos (Start/End de la semana)
        var ts_lms_w = [0, 0, 0, 0];
        for (var w = 0; w < 4; w++) {
            var iA = pivotIdx[w][0];
            var iB = pivotIdx[w][1];
            if (iA !== -1 && iB !== -1) {
                var vA = row[iA];
                var vB = row[iB];
                if (vA && vB && String(vA).trim() !== '' && String(vB).trim() !== '') {
                    var dA = new Date(vA);
                    var dB = new Date(vB);
                    if (!isNaN(dA.getTime()) && !isNaN(dB.getTime())) {
                        var tempStart = Math.min(dA.getTime(), dB.getTime());
                        var tempEnd = Math.max(dA.getTime(), dB.getTime());
                        var diffClass = (tempEnd - tempStart) / 60000;
                        
                        if (diffClass <= 360) {
                            ts_lms_w_start[w] = tempStart;
                            ts_lms_w_end[w] = tempEnd;
                            lms_audited_w[w] = 1;
                            tieneTsLms = true;
                            ts_lms_w[w] = parseFloat(diffClass.toFixed(2));
                            diffMinLms += ts_lms_w[w];
                        } else {
                            ts_lms_w[w] = -1; // Abandono: Sobrepasó límite de 6 horas
                        }
                    } else {
                        ts_lms_w[w] = -1;
                    }
                } else {
                    ts_lms_w[w] = -1;
                }
            } else {
                ts_lms_w[w] = -1;
            }
        }

        // MÉTODO CLÁSICO: audit_time_sX para Promedio Min LMS (por asignatura individual)
        var audit_lms_total = 0;
        var audit_lms_w = [0, 0, 0, 0];
        for (var t = 0; t < idxAuditTimeLms.length; t++) {
            var colIndex = idxAuditTimeLms[t];
            var codeName = String(headerCodes[colIndex]).trim().toLowerCase();
            var wkIdx = -1;
            if (codeName.indexOf('_s1') !== -1) wkIdx = 0;
            else if (codeName.indexOf('_s2') !== -1) wkIdx = 1;
            else if (codeName.indexOf('_s3') !== -1) wkIdx = 2;
            else if (codeName.indexOf('_s4') !== -1) wkIdx = 3;

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

        // Tiempos Acomp
        var diffMinAcomp = 0;
        var tieneTsAcomp = false;
        
        // Mismo fallback de Ts Crudos por si acaso
        for (var t = 0; t < idxTsAcomp.length; t++) {
            if (row[idxTsAcomp[t]]) tieneTsAcomp = true;
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

        // Sumatorias Hits Moodle
        var h = 0;
        for (var idx = 0; idx < idxHits.length; idx++) {
            var valH = row[idxHits[idx]];
            if (valH && !isNaN(valH)) h += Number(valH);
        }

        // Sumatorias Mails
        var m = 0;
        for (var idx = 0; idx < idxEmails.length; idx++) {
            var valM = row[idxEmails[idx]];
            if (valM && !isNaN(valM)) m += Number(valM);
        }

        // Sumatorias WA
        var w = 0;
        for (var idx = 0; idx < idxWa.length; idx++) {
            var valW = row[idxWa[idx]];
            if (valW && !isNaN(valW)) w += Number(valW);
        }

        // Auditorías LMS (DETECTADO o 1)
        var a_lms = 0;
        for (var idx = 0; idx < idxAuditLms.length; idx++) {
            var valA = String(row[idxAuditLms[idx]] || '').trim().toUpperCase();
            if (valA.indexOf('DETECTADO') !== -1 || valA === '1') a_lms++;
        }

        // Auditorías ACOMP (DETECTADO o 1)
        var a_acp = 0;
        for (var idx = 0; idx < idxAuditAcomp.length; idx++) {
            var valA = String(row[idxAuditAcomp[idx]] || '').trim().toUpperCase();
            if (valA.indexOf('DETECTADO') !== -1 || valA === '1') a_acp++;
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
            // Tiempo Absoluto LMS (método bookend con merge)
            ts_lms: parseFloat(diffMinLms.toFixed(1)),
            ts_lms_w: ts_lms_w,
            ts_start_w: ts_lms_w_start,
            ts_end_w: ts_lms_w_end,
            lms_audited_w: lms_audited_w,
            ts_acp: parseFloat(diffMinAcomp.toFixed(1)),
            h: h,
            m: m,
            w: w,
            a: a_lms + a_acp, // Backward compatibility for chart if needed
            a_lms: a_lms,
            a_acp: a_acp,
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
