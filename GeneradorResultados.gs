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
      // Leemos desde la fila 2 para devolver al frontal (27 columnas)
      const rawData = sheet.getRange(2, 1, lastRow - 1, 27).getDisplayValues();

      // Formatear para el frontend:
      // Nos interesan las columnas A(0) a S(18), y U(20) a AA(26)
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
          lmsUrl: row[21], // V
          acompScore: row[22], // W
          acompUrl: row[23], // X
          centesimal: row[24], // Y
          vigesimal: row[25], // Z
          nivel: row[26], // AA
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
    // BC = Col 55, ED = Col 134, AF = Col 32, BE = Col 57
    var mapVirtual = construirMapaResultados(hojaVirtual, 3, 55, 134);
    var mapPresencial = construirMapaResultados(hojaPresencial, 3, 55, 134);
    var mapAcomp = construirMapaResultados(hojaAcomp, 3, 32, 57);

    var resultadosFinales = [];

    for (var i = 0; i < datosAsignacion.length; i++) {
      var filaCentral = datosAsignacion[i];
      var id = String(filaCentral[15]); // Col P (Indice 15)

      if (!id || id === 'undefined' || id === '') continue;

      var u_scoreLMS = '';
      var v_urlLMS = '';
      var w_scoreAcomp = '';
      var x_urlAcomp = '';

      // Buscar en diccionarios LMS
      if (mapVirtual.hasOwnProperty(id)) {
        u_scoreLMS = mapVirtual[id].score;
        v_urlLMS = mapVirtual[id].url;
      } else if (mapPresencial.hasOwnProperty(id)) {
        u_scoreLMS = mapPresencial[id].score;
        v_urlLMS = mapPresencial[id].url;
      }

      // Buscar en diccionario Acompañamiento
      if (mapAcomp.hasOwnProperty(id)) {
        w_scoreAcomp = mapAcomp[id].score;
        x_urlAcomp = mapAcomp[id].url;
      }

      // Cálculos Matemáticos (Centesimal, Vigesimal y Nivel)
      var u_val = parseFloat(u_scoreLMS) || 0;
      var w_val = parseFloat(w_scoreAcomp) || 0;

      var y_centesimal = '';
      var z_vigesimal = '';
      var aa_nivel = '';

      if (u_scoreLMS !== '' || w_scoreAcomp !== '') {
        y_centesimal = ((u_val / 136) * 100) / 2 + ((w_val / 44) * 100) / 2;
        z_vigesimal = ((u_val / 136) * 20) / 2 + ((w_val / 44) * 20) / 2;

        // Redondeo de visualización a 2 decimales para almacenar en base
        // Formular directamente sin redondear demasiado para niveles exactos.

        if (z_vigesimal >= 17) aa_nivel = 'Muy Bueno';
        else if (z_vigesimal >= 14) aa_nivel = 'Bueno';
        else if (z_vigesimal >= 11) aa_nivel = 'Regular';
        else if (z_vigesimal >= 10) aa_nivel = 'Deficiente';
        else aa_nivel = 'Bajo';
      }

      // Ensamblar la fila
      var filaDestino = filaCentral.slice(); // Copia A a S
      filaDestino.push(''); // Col T vacía
      filaDestino.push(u_scoreLMS === '' ? '' : u_scoreLMS); // U
      filaDestino.push(v_urlLMS); // V
      filaDestino.push(w_scoreAcomp === '' ? '' : w_scoreAcomp); // W
      filaDestino.push(x_urlAcomp); // X
      filaDestino.push(y_centesimal); // Y
      filaDestino.push(z_vigesimal); // Z
      filaDestino.push(aa_nivel); // AA

      resultadosFinales.push(filaDestino);
    }

    // Escritura Masiva
    if (resultadosFinales.length > 0) {
      var ultFilaRes = hojaResultados.getLastRow();
      if (ultFilaRes > 1) {
        hojaResultados.getRange(2, 1, ultFilaRes - 1, 27).clearContent();
      }

      hojaResultados.getRange(2, 1, resultadosFinales.length, 27).setValues(resultadosFinales);
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
 * Función auxiliar para crear diccionarios en memoria.
 */
function construirMapaResultados(hoja, iniciarEnFila, colScore, colUrl) {
  var mapa = {};
  if (!hoja) return mapa;

  var lr = hoja.getLastRow();
  if (lr < iniciarEnFila) return mapa;

  var numFilas = lr - iniciarEnFila + 1;

  var colIds = hoja.getRange(iniciarEnFila, 16, numFilas, 1).getValues();
  var colScores = hoja.getRange(iniciarEnFila, colScore, numFilas, 1).getValues();
  var colUrls = hoja.getRange(iniciarEnFila, colUrl, numFilas, 1).getValues();

  for (var i = 0; i < numFilas; i++) {
    var id = String(colIds[i][0]);
    if (id !== '' && id !== 'undefined') {
      mapa[id] = {
        score: colScores[i][0],
        url: colUrls[i][0],
      };
    }
  }

  return mapa;
}
