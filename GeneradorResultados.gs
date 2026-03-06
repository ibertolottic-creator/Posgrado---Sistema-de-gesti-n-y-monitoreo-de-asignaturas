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
      // Leemos desde la fila 2 para devolver al frontal (33 columnas: de A a AG)
      const rawData = sheet.getRange(2, 1, lastRow - 1, 33).getDisplayValues();

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

    // 2. Extraer datos Base de Asignaciones (Fila 2 hacia abajo, 19 columnas A-S)
    var ultFilaAsig = hojaAsignacion.getLastRow();
    if (ultFilaAsig < 2) {
      return { success: true, message: 'Sin datos base' };
    }
    var datosAsignacion = hojaAsignacion.getRange(2, 1, ultFilaAsig - 1, 19).getValues();

    // 3. Crear Diccionarios (Solo las col necesarias)
    // Para Virtual/Presencial: Inicio de Criterios (Col V=22). Son 34 Criterios.
    // Score BC = Col 55, Url ED = Col 134.
    var mapVirtual = construirMapaResultados(hojaVirtual, 3, 55, 134, 22, 34);
    var mapPresencial = construirMapaResultados(hojaPresencial, 3, 55, 134, 22, 34);

    // Para Acompañamiento: Inicio de Criterios (Col V=22). Son 11 Criterios.
    // Score AF = Col 32, Url BE = Col 57
    var mapAcomp = construirMapaResultados(hojaAcomp, 3, 32, 57, 22, 11);

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

      resultadosFinales.push(filaDestino);
    }

    // Escritura Masiva
    if (resultadosFinales.length > 0) {
      var ultFilaRes = hojaResultados.getLastRow();
      if (ultFilaRes > 1) {
        hojaResultados.getRange(2, 1, ultFilaRes - 1, 33).clearContent();
      }

      hojaResultados.getRange(2, 1, resultadosFinales.length, 33).setValues(resultadosFinales);
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
function construirMapaResultados(
  hoja,
  iniciarEnFila,
  colScore,
  colUrl,
  colCritStart,
  colCritCount
) {
  var mapa = {};
  if (!hoja) return mapa;

  var lr = hoja.getLastRow();
  if (lr < iniciarEnFila) return mapa;

  var numFilas = lr - iniciarEnFila + 1;

  var colIds = hoja.getRange(iniciarEnFila, 16, numFilas, 1).getValues(); // Col P
  var colScores = hoja.getRange(iniciarEnFila, colScore, numFilas, 1).getValues();
  var colUrls = hoja.getRange(iniciarEnFila, colUrl, numFilas, 1).getValues();

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
        url: colUrls[i][0],
        avance: avanceNum, // Número entre 0 y 100
        criteriosBajos: arrCriteriosBajos.join(', '), // String separado porm comas "c_1_1, c_1_2"
      };
    }
  }

  return mapa;
}
