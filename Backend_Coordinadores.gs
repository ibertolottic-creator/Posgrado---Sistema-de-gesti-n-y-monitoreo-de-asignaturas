/**
 * ==========================================
 * SUBSISTEMA BI - ANÁLISIS DE RESULTADOS DE COORDINADORES
 * Archivo: Backend_Coordinadores.gs
 * ==========================================
 * Analiza el rendimiento del equipo de coordinación leyendo
 * la metadata inyectada en la Sábana General de forma cruda.
 */

function getMetricasCoordinadores() {
  try {
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

        // Tiempos LMS: Usamos las columnas pre-calculadas (audit_time_s1...s4)
        var diffMinLms = 0;
        var tieneTsLms = false;
        
        // Primero verificamos si tenemos actividad en Moodle via Ts crudos
        for (var t = 0; t < idxTsLms.length; t++) {
            if (row[idxTsLms[t]]) tieneTsLms = true;
        }

        // Sumamos los minutos precalculados de las semanas
        for (var t = 0; t < idxAuditTimeLms.length; t++) {
            var valAuditStr = String(row[idxAuditTimeLms[t]] || '').trim();
            if (valAuditStr !== '') {
                // Eliminar palabra 'min' u otras letras para parsear el flotante ("15.4 min" => 15.4)
                var numStr = valAuditStr.replace(/[^0-9.]/g, ''); 
                var num = parseFloat(numStr);
                if (!isNaN(num)) diffMinLms += num;
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
            ts_lms: parseFloat(diffMinLms.toFixed(1)),
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
