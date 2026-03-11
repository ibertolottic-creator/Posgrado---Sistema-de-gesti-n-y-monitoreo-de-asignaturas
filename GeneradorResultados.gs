/**
 * ======================================================================
 * ARCHIVO: GeneradorResultados.gs
 * DESCRIPCIÓN: Consolida la Asignación con las notas de LMS y Acompañamiento.
 * Reemplaza las fórmulas de Sheets para evitar Lag en la UI.
 * ======================================================================
 */

function getConsolidatedData(forceSync = false) {
  const result = sincronizarResultadosGenerales(forceSync);
  if (!result.success && result.retryLater) {
    return {
      success: false,
      retryLater: true,
      message:
        'El sistema está sincronizando datos en este momento. Por favor, reintente en unos segundos.',
    };
  }

  // Si tuvo éxito, extraemos la data para el Front-End
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_MAP['RESULTADOS']);

    if (!sheet) throw new Error('No se encontró la hoja de resultados.');

    const lastRow = sheet.getLastRow();
    let data = [];

    const sessionData = getGlobalSessionData();
    const role = sessionData.role;
    const userEmail = sessionData.userEmail;

    if (lastRow > 1) {
      // Leemos desde la fila 2 para devolver al frontal (34 columnas: de A a AH)
      const rawData = sheet.getRange(2, 1, lastRow - 1, 34).getDisplayValues();

      // Formatear para el frontend:
      // Nos interesan las columnas A(0) a S(18), y U(20) a AG(32)
      for (let i = 0; i < rawData.length; i++) {
        let row = rawData[i];
        // Filtramos filas vacías basándonos en ID de Asignación (Col P=15) o Nombre (Col E=4)
        if (!row[4] && !row[15]) continue;

        const coordEmail = String(row[18] || '').trim(); // Col S
        if (role !== 'Admin' && role !== 'Invitado') {
          if (coordEmail.toLowerCase() !== userEmail.toLowerCase()) continue;
        }

        data.push({
          id: row[15],
          programa: row[2],
          curso: row[4],
          docente: row[6],
          coordinadorId: row[14], // Nro Documento de Coord
          coordinadorName: row[17],

          lmsScore: row[20], // U
          lmsVigesimal: row[21], // V
          lmsAvance: row[22], // W
          lmsMejorar: row[23], // X (NUEVO)
          lmsUrl: row[24], // Y

          acompScore: row[25], // Z
          acompVigesimal: row[26], // AA
          acompAvance: row[27], // AB
          acompMejorar: row[28], // AC (NUEVO)
          acompUrl: row[29], // AD

          centesimal: row[30], // AE
          vigesimal: row[31], // AF
          nivel: row[32], // AG
          fechaEnvio: row[33] || '', // AH (NUEVO)
        });
      }
    }

    return { success: true, data: data, userEmail: userEmail, role: role };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * Función Principal de Sincronización con LockService
 * @returns {Object} Estado de la operación
 */
function sincronizarResultadosGenerales(isManualUI = false) {
  var lock = LockService.getScriptLock();
  var ui = null;

  if (isManualUI) {
    try {
      ui = SpreadsheetApp.getUi();
    } catch (e) {
      /* background execution context */
    }
  }

  // Intenta obtener el candado por 10 segundos
  if (!lock.tryLock(10000)) {
    if (ui)
      ui.alert(
        '⚠️ El sistema se está sincronizando actualmente. Por favor, intente en unos segundos.'
      );
    return { success: false, retryLater: true };
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Obtener Hojas usando las constantes
    var hojaAsignacion = ss.getSheetByName(SHEET_MAP['ASIGNACION']);
    var hojaVirtual = ss.getSheetByName(SHEET_MAP['VIRTUAL']);
    var hojaPresencial = ss.getSheetByName(SHEET_MAP['PRESENCIAL']);
    var hojaAcomp = ss.getSheetByName(SHEET_MAP['ACOMPANAMIENTO']);
    var hojaResultados = ss.getSheetByName(SHEET_MAP['RESULTADOS']);

    if (!hojaResultados) {
      if (ui) ui.alert("❌ Error: No se encontró la hoja 'Envío de resultados y fichas'.");
      return { success: false, message: 'Hoja de resultados no encontrada.' };
    }

    // --- NUEVO: Capturar fechas de envío preexistentes (Columna AH = Índice 34) ---
    var mapaFechasEnvio = {};
    var ultFilaResExistente = hojaResultados.getLastRow();
    if (ultFilaResExistente > 1) {
      // Leemos Col P (16) para el ID, y Col AH (34) para la fecha
      var idsAntiguos = hojaResultados.getRange(2, 16, ultFilaResExistente - 1, 1).getValues();
      var fechasAntiguas = hojaResultados.getRange(2, 34, ultFilaResExistente - 1, 1).getValues();
      for (var f = 0; f < idsAntiguos.length; f++) {
        var idStr = String(idsAntiguos[f][0]).trim();
        if (idStr && idStr !== '') {
          mapaFechasEnvio[idStr] = String(fechasAntiguas[f][0] || '').trim();
        }
      }
    }

    // 2. Extraer datos Base de Asignaciones (Fila 2 hacia abajo, 19 columnas A-S)
    var ultFilaAsig = hojaAsignacion.getLastRow();
    if (ultFilaAsig < 2) {
      return { success: true, message: 'Sin datos base' };
    }
    var datosAsignacion = hojaAsignacion.getRange(2, 1, ultFilaAsig - 1, 19).getValues();

    // 3. Crear Diccionarios (Solo las col necesarias)
    // Para Virtual/Presencial: Inicio de Criterios (Col V=22). Son 34 Criterios.
    // Score BC = Col 55, Url ED = colUrl (Dinámico).
    var mapVirtual = construirMapaResultados(hojaVirtual, 3, 55, 22, 34);
    var mapPresencial = construirMapaResultados(hojaPresencial, 3, 55, 22, 34);

    // Para Acompañamiento: Inicio de Criterios (Col V=22). Son 11 Criterios.
    // Score AF = Col 32, Url BE = colUrl (Dinámico)
    var mapAcomp = construirMapaResultados(hojaAcomp, 3, 32, 22, 11);

    var resultadosFinales = [];

    for (var i = 0; i < datosAsignacion.length; i++) {
      var filaCentral = datosAsignacion[i];
      var id = String(filaCentral[15]); // Col P (Indice 15)

      if (!id || id === 'undefined' || id === '') continue;

      var u_scoreLMS = '';
      var v_vigesimalLMS = ''; // NUEVO
      var w_avanceLMS = '';
      var x_mejorarLMS = ''; // NUEVO (X)
      var y_urlLMS = ''; // Y

      var z_scoreAcomp = ''; // Z
      var aa_vigesimalAcomp = ''; // NUEVO
      var ab_avanceAcomp = ''; // AB
      var ac_mejorarAcomp = ''; // NUEVO (AC)
      var ad_urlAcomp = ''; // AD

      // Buscar en diccionarios LMS
      if (mapVirtual.hasOwnProperty(id)) {
        u_scoreLMS = mapVirtual[id].score;
        w_avanceLMS = mapVirtual[id].avance;
        x_mejorarLMS = mapVirtual[id].criteriosBajos;
        y_urlLMS = mapVirtual[id].url;
      } else if (mapPresencial.hasOwnProperty(id)) {
        u_scoreLMS = mapPresencial[id].score;
        w_avanceLMS = mapPresencial[id].avance;
        x_mejorarLMS = mapPresencial[id].criteriosBajos;
        y_urlLMS = mapPresencial[id].url;
      }

      // Buscar en diccionario Acompañamiento
      if (mapAcomp.hasOwnProperty(id)) {
        z_scoreAcomp = mapAcomp[id].score;
        ab_avanceAcomp = mapAcomp[id].avance;
        ac_mejorarAcomp = mapAcomp[id].criteriosBajos;
        ad_urlAcomp = mapAcomp[id].url;
      }

      // Cálculos Matemáticos (Centesimal, Vigesimal y Nivel)
      // Aseguramos que los scores sean numéricos válidos o cero antes del cálculo
      var u_val = u_scoreLMS !== '' && !isNaN(u_scoreLMS) ? parseFloat(u_scoreLMS) : 0;
      var z_val = z_scoreAcomp !== '' && !isNaN(z_scoreAcomp) ? parseFloat(z_scoreAcomp) : 0;

      var ae_centesimal = '';
      var af_vigesimal = '';
      var ag_nivel = '';

      // Si al menos una de las dos sedes tiene calificación, procesamos matemática
      if (u_scoreLMS !== '' || z_scoreAcomp !== '') {
        if (u_scoreLMS !== '') v_vigesimalLMS = (u_val / 136) * 20;
        if (z_scoreAcomp !== '') aa_vigesimalAcomp = (z_val / 44) * 20;

        ae_centesimal = ((u_val / 136) * 100) / 2 + ((z_val / 44) * 100) / 2;
        af_vigesimal = ((u_val / 136) * 20) / 2 + ((z_val / 44) * 20) / 2;

        // Limpieza anti NaN: Si las sumas generan NaN por algún div/0 imprevisto (que no debería por los enteros literales 136 y 44), volvemos a cadena vacía
        if (isNaN(ae_centesimal) || isNaN(af_vigesimal)) {
          ae_centesimal = '';
          af_vigesimal = '';
        } else {
          // Redondeo de visualización a 2 decimales para almacenar en base
          if (af_vigesimal >= 17) ag_nivel = 'Muy Bueno';
          else if (af_vigesimal >= 14) ag_nivel = 'Bueno';
          else if (af_vigesimal >= 11) ag_nivel = 'Regular';
          else if (af_vigesimal >= 10) ag_nivel = 'Deficiente';
          else ag_nivel = 'Bajo';
        }
      }

      // Ensamblar la fila
      var filaDestino = filaCentral.slice(); // Copia A a S
      filaDestino.push(''); // Col T vacía
      filaDestino.push(u_scoreLMS === '' ? '' : u_scoreLMS); // U
      filaDestino.push(v_vigesimalLMS); // V (Nuevo - Vigesimal)
      filaDestino.push(w_avanceLMS); // W (Avance)
      filaDestino.push(x_mejorarLMS); // X (Criterios Bajos LMS)
      filaDestino.push(y_urlLMS); // Y (Url)

      filaDestino.push(z_scoreAcomp === '' ? '' : z_scoreAcomp); // Z
      filaDestino.push(aa_vigesimalAcomp); // AA (Nuevo - Vigesimal)
      filaDestino.push(ab_avanceAcomp); // AB (Avance)
      filaDestino.push(ac_mejorarAcomp); // AC (Criterios Bajos Acomp)
      filaDestino.push(ad_urlAcomp); // AD (Url)

      filaDestino.push(ae_centesimal); // AE
      filaDestino.push(af_vigesimal); // AF
      filaDestino.push(ag_nivel); // AG

      // Inyectar fecha histórica de envío rescatada de la RAM (si existe)
      var fechaHistorica = mapaFechasEnvio[id] || '';
      filaDestino.push(fechaHistorica); // AH (Índice 33)

      resultadosFinales.push(filaDestino);
    }

    // Escritura Masiva
    if (resultadosFinales.length > 0) {
      var ultFilaRes = hojaResultados.getLastRow();
      if (ultFilaRes > 1) {
        hojaResultados.getRange(2, 1, ultFilaRes - 1, 34).clearContent();
      }

      hojaResultados.getRange(2, 1, resultadosFinales.length, 34).setValues(resultadosFinales);
    }

    if (ui) ui.alert('✅ Panel General de Resultados consolidado y actualizado.');
    return { success: true };
  } catch (e) {
    if (ui) ui.alert('❌ Error durante la sincronización: ' + e.toString());
    return { success: false, message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Función auxiliar para crear diccionarios en memoria y calcular avance.
 */
function construirMapaResultados(hoja, iniciarEnFila, colScore, colCritStart, colCritCount) {
  var mapa = {};
  if (!hoja) return mapa;

  var lr = hoja.getLastRow();
  var lc = hoja.getLastColumn();
  if (lr < iniciarEnFila) return mapa;

  var numFilas = lr - iniciarEnFila + 1;

  // Buscar dinámicamente la columna Url_ficha en las primeras 2 filas usando la utilidad nativa
  var colUrlIndex = -1;
  var headersRange = hoja.getRange(1, 1, 2, lc).getValues();
  for (var r = 0; r < headersRange.length; r++) {
    for (var c = 0; c < headersRange[r].length; c++) {
      if (String(headersRange[r][c]).trim() === 'Url_ficha') {
        colUrlIndex = c + 1; // 1-indexed para getRange
        break;
      }
    }
    if (colUrlIndex !== -1) break;
  }

  var colIds = hoja.getRange(iniciarEnFila, 16, numFilas, 1).getValues(); // Col P
  var colScores = hoja.getRange(iniciarEnFila, colScore, numFilas, 1).getValues();
  var colUrls =
    colUrlIndex !== -1 ? hoja.getRange(iniciarEnFila, colUrlIndex, numFilas, 1).getValues() : null;

  // Extraemos la matriz completa de criterios para calcular la proporción de completados y valores bajos
  var critMatrix = [];
  var titulosCriterios = [];

  if (colCritStart && colCritCount) {
    critMatrix = hoja.getRange(iniciarEnFila, colCritStart, numFilas, colCritCount).getValues();
    // Extraemos la fila de títulos desde la Fila 2, que contiene el concepto o pregunta real (ej. "Demuestra dominio del tema")
    titulosCriterios = hoja.getRange(2, colCritStart, 1, colCritCount).getValues()[0];
  }

  for (var i = 0; i < numFilas; i++) {
    var id = String(colIds[i][0]);
    if (id !== '' && id !== 'undefined') {
      var avanceNum = 0;
      var arrCriteriosBajos = []; // Para almacenar las que tienen 1 o 2

      if (critMatrix.length > i) {
        var filaCrit = critMatrix[i];
        var completados = 0;
        for (var c = 0; c < colCritCount; c++) {
          var celdaCrit = filaCrit[c];

          if (celdaCrit !== '' && celdaCrit !== null) {
            completados++;
            // Capturar criterios bajos
            if (String(celdaCrit) === '1' || String(celdaCrit) === '2') {
              // Sacamos el nombre del encabezado (Ej: "c_1_1")
              var titulo = titulosCriterios[c]
                ? String(titulosCriterios[c]).trim()
                : `Crit-${c + 1}`;
              arrCriteriosBajos.push(titulo);
            }
          }
        }
        avanceNum = (completados / colCritCount) * 100;
      }

      mapa[id] = {
        score: colScores[i][0],
        url: colUrls ? colUrls[i][0] : '', // Uso dinámico
        avance: avanceNum, // Número entre 0 y 100
        criteriosBajos: arrCriteriosBajos.join(', '), // String separado porm comas "c_1_1, c_1_2"
      };
    }
  }

  return mapa;
}

/**
 * ======================================================================
 * MÓDULO DE CORREOS MASIVOS
 * ======================================================================
 * Envia los correos orquestando de acuerdo al arreglo de DNI mandados desde Frontend.
 * Modifica directamente la Hoja RESULTADOS en su columna AH (Índice 34)
 */

/**
 * Transforma una URL de Google Docs para forzar descarga en PDF.
 * Reemplaza /edit... o /preview... por /export?format=pdf
 */
function forcePdfUrl(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(/\/(edit|preview)(\?.*)?$/, '/export?format=pdf');
}

function enviarCorreosResultadosMasivos(idsArray) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hojaResultados = ss.getSheetByName(SHEET_MAP['RESULTADOS']);

    if (!hojaResultados) {
      return { success: false, message: 'Hoja de Resultados no encontrada.' };
    }

    var lastRow = hojaResultados.getLastRow();
    if (lastRow < 2 || !idsArray || idsArray.length === 0) {
      return { success: false, message: 'Sin datos para enviar.' };
    }

    // Leemos la data base matriz de resultados (Fila 2 hacia abajo, 34 Columnas)
    var allData = hojaResultados.getRange(2, 1, lastRow - 1, 34).getValues();
    var correosEnviados = 0;
    // Helper
    var STR_trim = function (str) {
      return str ? String(str).trim() : '';
    };

    var erroresDetalle = [];

    // Iteramos sobre las filas para encontrar coincidencias de ID
    for (var i = 0; i < allData.length; i++) {
      var row = allData[i];
      var idFila = String(row[15]); // Col P

      // Verificamos si este ID fue checkeado y mandado por el FrontEnd
      if (idsArray.includes(idFila)) {
        // Ya tiene fecha de envio? Proteccion backend redundante
        var fechaExistente = String(row[33] || '').trim();
        if (fechaExistente !== '') continue;

        // Extracción Variables Plantillas
        var docenteNombre = row[6] || 'Docente'; // Col G
        var asignatura = row[4] || 'Asignatura'; // Col E
        var programa = row[2] || 'Coordinación Académica'; // Col C

        // Parsear el periodo
        var periodoRaw = row[16]; // Col Q
        var periodo = '';
        if (periodoRaw) {
          if (periodoRaw instanceof Date) {
            // "MM-yyyy" (ej: 02-2026)
            periodo = Utilities.formatDate(periodoRaw, Session.getScriptTimeZone(), 'MM-yyyy'); 
          } else {
            // Fallback en caso sea un string y se pueda parsear
            var dateObj = new Date(periodoRaw);
            if (!isNaN(dateObj)) {
               periodo = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'MM-yyyy'); 
            } else {
               periodo = String(periodoRaw);
            }
          }
        }

        var LMS_Score = row[20]; // Col U
        var LMS_Vigesimal = row[21] !== '' ? parseFloat(row[21]).toFixed(2) : '-'; // Col V
        var ACOMP_Score = row[25]; // Col Z
        var ACOMP_Vigesimal = row[26] !== '' ? parseFloat(row[26]).toFixed(2) : '-'; // Col AA

        var mejorarLMS = row[23] || 'Ninguno'; // Col X
        var mejorarACOMP = row[28] || 'Ninguno'; // Col AC

        var URL_LMS = row[24]; // Col Y
        var URL_ACOMP = row[29]; // Col AD

        var resCentesimal = row[30] !== '' ? parseFloat(row[30]).toFixed(2) : '0'; // Col AE
        var resVigesimalRaw = row[31] !== '' ? parseFloat(row[31]) : 0; // Col AF
        var resVigesimal = row[31] !== '' ? resVigesimalRaw.toFixed(2) : '0'; // Col AF

        // Determinar nivel y colores
        var nivelTexto = '';
        var headerColor = '';
        var headerSubtitle = '';
        var nivelBadgeBg = '';
        var nivelBadgeColor = '';

        if (resVigesimalRaw >= 17) {
          nivelTexto = 'Muy Bueno';
          nivelBadgeBg = '#c6f6d5';
          nivelBadgeColor = '#276749';
        } else if (resVigesimalRaw >= 14) {
          nivelTexto = 'Bueno';
          nivelBadgeBg = '#bee3f8';
          nivelBadgeColor = '#2a4365';
        } else if (resVigesimalRaw >= 11) {
          nivelTexto = 'Regular';
          nivelBadgeBg = '#fefcbf';
          nivelBadgeColor = '#744210';
        } else if (resVigesimalRaw >= 10) {
          nivelTexto = 'Deficiente';
          nivelBadgeBg = '#fed7d7';
          nivelBadgeColor = '#9b2c2c';
        } else {
          nivelTexto = 'Bajo';
          nivelBadgeBg = '#fed7d7';
          nivelBadgeColor = '#9b2c2c';
        }

        // Botones de descarga PDF
        var btnLmsHtml =
          URL_LMS && STR_trim(URL_LMS) !== ''
            ? `<a href="${forcePdfUrl(URL_LMS)}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:#2b6cb0;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;margin:5px 5px 5px 0;">📄 Descargar Ficha LMS (PDF)</a>`
            : '';
        var btnAcompHtml =
          URL_ACOMP && STR_trim(URL_ACOMP) !== ''
            ? `<a href="${forcePdfUrl(URL_ACOMP)}" target="_blank" style="display:inline-block;padding:10px 20px;background-color:#6b46c1;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold;margin:5px 5px 5px 0;">📄 Descargar Ficha Acompañamiento (PDF)</a>`
            : '';

        // Criterios de mejora como tags
        var buildMejorarTags = function (str) {
          if (!str || str === 'Ninguno')
            return '<span style="color:#718096;font-style:italic;">Ninguno</span>';
          return str
            .split(',')
            .map(function (item) {
              return (
                '<span style="display:inline-block;background-color:#fed7d7;color:#9b2c2c;font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;margin:2px 3px;">' +
                item.trim() +
                '</span>'
              );
            })
            .join(' ');
        };

        var tagsLMS = buildMejorarTags(mejorarLMS);
        var tagsACOMP = buildMejorarTags(mejorarACOMP);

        var emailsRaw = String(row[7] || '') + ',' + String(row[8] || ''); // Emails Col H y I

        // SELECCIONAR PLANTILLA SEGÚN NOTA
        var isPregrado = ss.getName().toUpperCase().indexOf('PREGRADO') !== -1;
        var sedeString = isPregrado ? 'Pregrado' : 'Posgrado';

        var correoInstitucional = isPregrado
          ? 'pregrado@usmpvirtual.edu.pe'
          : 'posgrado@usmpvirtual.edu.pe';

        var correoCoordinador = String(row[18] || '').trim(); // Col S
        if (correoInstitucional) emailsRaw += ',' + correoInstitucional;
        if (correoCoordinador) emailsRaw += ',' + correoCoordinador;

        var subjectStr = '';
        var mensajeCentral = '';

        if (resVigesimalRaw < 14) {
          headerColor = '#c53030';
          headerSubtitle = '⚠️ Requiere Atención';
          subjectStr = 'Resultados de Evaluación Docente - Requiere Atención';
          mensajeCentral =
            'Le informamos que ha obtenido resultados que requieren atención en la evaluación del presente periodo. Esta calificación refleja áreas por mejorar y requiere un mayor compromiso de su parte con el cumplimiento estricto de los estándares de calidad establecidos por nuestra casa de estudios. Lo exhortamos a revisar las observaciones de sus coordinadores para subsanar estos puntos a la brevedad.';
        } else if (resVigesimalRaw >= 14 && resVigesimalRaw < 19) {
          headerColor = '#c53030';
          headerSubtitle = '📊 Periodo Académico';
          subjectStr = 'Resultados de Evaluación Docente - Periodo Académico';
          mensajeCentral =
            'Valoramos su compromiso en el desarrollo de la asignatura y apostamos por la mejora continua. Confiamos plenamente en que, fortaleciendo algunas áreas de oportunidad en el próximo periodo, logrará alcanzar el cumplimiento de todos los criterios de calidad establecidos por la universidad.';
        } else {
          headerColor = '#c53030';
          headerSubtitle = '🏆 ¡Felicitaciones!';
          subjectStr = 'Resultados de Evaluación Docente - ¡Felicitaciones!';
          mensajeCentral =
            '¡Felicitaciones! Queremos expresar nuestro reconocimiento por su excelente desempeño y por cumplir a cabalidad con los estándares de calidad de la universidad. Agradecemos su notable dedicación, proactividad y esfuerzo en pro del aprendizaje de nuestros estudiantes.';
        }

        // Sección de criterios de mejora (solo si nota < 19)
        var seccionMejora = '';
        if (resVigesimalRaw < 19) {
          seccionMejora = `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
              <tr><td style="padding:12px 20px;background-color:#fff5f5;border-left:4px solid #c53030;border-radius:0 8px 8px 0;">
                <p style="margin:0 0 8px 0;font-size:14px;font-weight:bold;color:#9b2c2c;">Criterios de Mejora Prioritaria</p>
                <p style="margin:0 0 6px 0;font-size:13px;color:#4a5568;"><strong>LMS:</strong> ${tagsLMS}</p>
                <p style="margin:0;font-size:13px;color:#4a5568;"><strong>Acompañamiento:</strong> ${tagsACOMP}</p>
              </td></tr>
            </table>`;
        }

        var bodyHtml = `
        <div style="font-family:'Segoe UI',Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;background-color:#f7fafc;">
          <!-- HEADER -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${headerColor};border-radius:8px 8px 0 0;">
            <tr><td style="padding:24px 30px;text-align:center;">
              <p style="margin:0;font-size:20px;font-weight:bold;color:#ffffff;">Universidad de San Martín de Porres</p>
              <p style="margin:6px 0 0 0;font-size:14px;color:rgba(255,255,255,0.85);">Resultados de Evaluación Docente</p>
              <p style="margin:8px 0 0 0;font-size:16px;font-weight:bold;color:#ffffff;">${headerSubtitle}</p>
            </td></tr>
          </table>

          <!-- BODY -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <tr><td style="padding:28px 30px;">

              <!-- Saludo -->
              <p style="margin:0 0 6px 0;font-size:15px;color:#4a5568;">Estimado(a) docente,</p>
              <p style="margin:0 0 16px 0;font-size:18px;font-weight:bold;color:#1a202c;">${docenteNombre}</p>

              <!-- Contexto -->
              <p style="margin:0 0 8px 0;font-size:14px;color:#4a5568;line-height:1.6;">
                Reciba un cordial saludo. A través del presente comunicado, le hacemos llegar los resultados oficiales correspondientes a la supervisión y monitoreo de la asignatura <strong>${asignatura}</strong> (Periodo: ${periodo}, Programa: ${programa}).
              </p>
              <p style="margin:0 0 20px 0;font-size:14px;color:#4a5568;line-height:1.6;">${mensajeCentral}</p>

              <!-- TABLA: RESULTADO GENERAL -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
                <tr>
                  <td colspan="2" style="background-color:#edf2f7;padding:10px 16px;font-size:14px;font-weight:bold;color:#2d3748;border-bottom:1px solid #e2e8f0;">
                    📋 Resultado General
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#4a5568;border-bottom:1px solid #f0f0f0;width:60%;">Puntaje Centesimal (100%)</td>
                  <td style="padding:10px 16px;font-size:15px;font-weight:bold;color:#1a202c;border-bottom:1px solid #f0f0f0;text-align:center;">${resCentesimal}%</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#4a5568;border-bottom:1px solid #f0f0f0;">Puntaje Vigesimal (Base 20)</td>
                  <td style="padding:10px 16px;font-size:15px;font-weight:bold;color:#1a202c;border-bottom:1px solid #f0f0f0;text-align:center;">${resVigesimal}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:10px 16px;font-size:12px;color:#718096;text-align:center;font-style:italic;">
                    * Se considera resultado positivo si es mayor o igual al 70% (14 en base vigesimal)
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:10px 16px;font-size:12px;color:#718096;background-color:#f7fafc;border-top:1px solid #e2e8f0;line-height:1.5;">
                    <strong>Cálculo del Resultado General:</strong><br>
                    Sistema de gestión del aprendizaje (LMS) = (50 × puntaje obtenido por el docente) / 136<br>
                    Acompañamiento al desempeño docente Pedagógico = (50 × puntaje obtenido por el docente) / 44
                  </td>
                </tr>
              </table>

              <!-- TABLA: DETALLE POR MÓDULO -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:6px;">
                <tr>
                  <td colspan="3" style="background-color:#edf2f7;padding:10px 16px;font-size:14px;font-weight:bold;color:#2d3748;border-bottom:1px solid #e2e8f0;">
                    📊 Detalle por Módulo Evaluado
                  </td>
                </tr>
                <tr style="background-color:#f7fafc;">
                  <td style="padding:8px 16px;font-size:12px;font-weight:bold;color:#718096;border-bottom:1px solid #e2e8f0;">Módulo</td>
                  <td style="padding:8px 12px;font-size:12px;font-weight:bold;color:#718096;border-bottom:1px solid #e2e8f0;text-align:center;">Puntaje</td>
                  <td style="padding:8px 12px;font-size:12px;font-weight:bold;color:#718096;border-bottom:1px solid #e2e8f0;text-align:center;">Nota Vigesimal</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#2d3748;border-bottom:1px solid #f0f0f0;">Sistema de gestión del aprendizaje (LMS)</td>
                  <td style="padding:10px 12px;font-size:13px;color:#4a5568;border-bottom:1px solid #f0f0f0;text-align:center;">${LMS_Score} / 136</td>
                  <td style="padding:10px 12px;font-size:14px;font-weight:bold;color:#2b6cb0;border-bottom:1px solid #f0f0f0;text-align:center;">${LMS_Vigesimal}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;font-size:13px;color:#2d3748;">Acompañamiento del desempeño Pedagógico</td>
                  <td style="padding:10px 12px;font-size:13px;color:#4a5568;text-align:center;">${ACOMP_Score} / 44</td>
                  <td style="padding:10px 12px;font-size:14px;font-weight:bold;color:#6b46c1;text-align:center;">${ACOMP_Vigesimal}</td>
                </tr>
              </table>

              ${seccionMejora}

              <!-- BOTONES DE DESCARGA PDF -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr><td style="padding:16px 20px;background-color:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center;">
                  <p style="margin:0 0 12px 0;font-size:14px;font-weight:bold;color:#2d3748;">📥 Documentos de Evaluación</p>
                  <p style="margin:0 0 14px 0;font-size:13px;color:#718096;">Descargue las fichas de evaluación detalladas en formato PDF:</p>
                  ${btnLmsHtml}
                  ${btnAcompHtml}
                </td></tr>
              </table>

            </td></tr>
          </table>

          <!-- FOOTER -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#edf2f7;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
            <tr><td style="padding:20px 30px;text-align:center;">
              <p style="margin:0 0 4px 0;font-size:13px;color:#718096;">Atentamente,</p>
              <p style="margin:0 0 2px 0;font-size:14px;font-weight:bold;color:#2d3748;">Área de ${sedeString}</p>
              <p style="margin:0;font-size:13px;color:#718096;">Universidad de San Martín de Porres</p>
            </td></tr>
          </table>
        </div>`;

        // Enviar Correo (To: Todos Juntos, Subj, Html, Cc: Vacío, Sin Adjuntos)
        var emailResponse = sendTeacherEmail(emailsRaw, subjectStr, bodyHtml, '', []);
        if (emailResponse.success) {
          // Registrar el Timestamp en la matriz en local RAM (Índice 33 es Columna AH)
          var nowStamp = Utilities.formatDate(
            new Date(),
            Session.getScriptTimeZone(),
            'dd/MM/yyyy HH:mm:ss'
          );
          allData[i][33] = nowStamp;
          correosEnviados++;
        } else {
          erroresDetalle.push('Fallo correo (' + emailsRaw + '): ' + emailResponse.message);
        }
      }
    }

    // Devolvemos toda la matriz reescrita a la hoja para un guardado asíncrono eficiente (Solo 1 llamada a Google Sheets)
    hojaResultados.getRange(2, 1, lastRow - 1, 34).setValues(allData);

    if (correosEnviados === 0 && erroresDetalle.length > 0) {
      return {
        success: false,
        message: 'Fallaron los envíos. Detalles: ' + erroresDetalle.join(' | '),
      };
    }

    return { success: true, count: correosEnviados, message: erroresDetalle.join(' | ') };
  } catch (e) {
    return { success: false, message: 'Error Servidor: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ======================================================================
 * FUNCIÓN PARA PRUEBA DE DIAGNÓSTICO (Ejecutar Manualmente desde Apps Script)
 * ======================================================================
 */
function testEnvioDiagnostico() {
  try {
    var emailPrueba = Session.getActiveUser().getEmail();
    Logger.log('Iniciando prueba de diagnóstico de correos para: ' + emailPrueba);

    // Test 1: Correo básico directo
    Logger.log('Enviando correo básico HTML nativo de Google...');
    MailApp.sendEmail({
      to: emailPrueba,
      subject: 'Test Antigravity Básico de Sistema',
      htmlBody: '<b>Hola</b>, si ves esto, MailApp está permitido y funcionando.',
      name: 'Diagnóstico Sistema',
    });
    Logger.log('Éxito en Test 1.');

    // Test 2: Usar sendTeacherEmail
    Logger.log('Evaluando sendTeacherEmail (Code.gs)...');
    var resp = sendTeacherEmail(
      emailPrueba,
      'Test Antigravity Estructurado',
      '<b>Cuerpo</b> de prueba',
      '',
      []
    );
    Logger.log('Respuesta de sendTeacherEmail: ' + JSON.stringify(resp));

    Logger.log('=== PRUEBA FINALIZADA ===');
  } catch (e) {
    Logger.log('ERROR CRÍTICO DETECTADO: ' + e.toString());
  }
}

/**
 * Función que permite diagnosticar exactamente el error de generación del PDF y los valores en las columnas
 */
function testExtraerPdf() {
  Logger.log('--- INICIO DE DIAGNÓSTICO PROFUNDO ---');
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_MAP['RESULTADOS']);
    if (!sheet) {
      Logger.log('❌ Error: No se encontró la hoja RESULTADOS para leer los links');
    } else {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var rowData = sheet.getRange(2, 1, 1, 34).getValues()[0];
        var lmsUrl = rowData[24]; // Col Y
        var acompUrl = rowData[29]; // Col AD
        Logger.log('Lectura de la hoja RESULTADOS - FILA 2:');
        Logger.log(
          '➡️ Columna Y (LMS URL - Índice 24): [' + lmsUrl + '] (Tipo: ' + typeof lmsUrl + ')'
        );
        Logger.log(
          '➡️ Columna AD (ACOMP URL - Índice 29): [' +
            acompUrl +
            '] (Tipo: ' +
            typeof acompUrl +
            ')'
        );
      } else {
        Logger.log('⚠️ La hoja RESULTADOS está vacía (solo cabeceras)');
      }
    }
  } catch (e) {
    Logger.log('❌ Error leyendo hoja: ' + e.message);
  }

  // Prueba de extracción directa
  var urlPrueba =
    'https://docs.google.com/document/d/13GuB-r0to1cap0PyW1OJY4QBKVDl_9eURtYc_hWqpaE/edit?tab=t.0';

  Logger.log('\n--- PRUEBA DE DESCARGA PDF ---');
  var match = urlPrueba.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!match || !match[1]) {
    Logger.log('❌ Error: La URL no contiene un ID de documento de Google válido.');
    return;
  }

  var fileId = match[1];
  Logger.log('ID extraído correctamente: ' + fileId);

  try {
    // Intento 1: UrlFetchApp
    var urlExport = 'https://docs.google.com/document/d/' + fileId + '/export?format=pdf';
    Logger.log('Intentando descargar vía UrlFetchApp: ' + urlExport);
    var responseAuth = UrlFetchApp.fetch(urlExport, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });

    var code = responseAuth.getResponseCode();
    Logger.log('Código HTTP UrlFetchApp: ' + code);

    if (code === 200) {
      Logger.log('✅ Éxito UrlFetchApp: Se descargó el Blob.');
      var blob = responseAuth.getBlob();
      Logger.log('✅ Tipo Mime: ' + blob.getContentType());
      if (blob.getContentType() !== 'application/pdf') {
        Logger.log(
          '⚠️ Alerta: El contenido no es PDF. Es posible que el token no tenga permisos y redirija a login.'
        );
      }
    } else {
      Logger.log(
        '⚠️ Falló UrlFetchApp (código ' +
          code +
          '). Contenido: ' +
          responseAuth.getContentText().substring(0, 100)
      );
      Logger.log('Pasando al Intento 2 (DriveApp)...');

      // Intento 2: DriveApp (Fallback nativo)
      var file = DriveApp.getFileById(fileId);
      Logger.log('✅ Archivo encontrado en DriveApp: ' + file.getName());

      var pdfBlob = file.getAs(MimeType.PDF);
      Logger.log('✅ Éxito DriveApp: Se generó el Blob del PDF correctamente.');
    }
  } catch (e) {
    Logger.log('❌ ERROR EXCEPCIÓN: ' + e.message);
    Logger.log('Detalles: ' + e.stack);
  }
}
