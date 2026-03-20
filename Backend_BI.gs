/**
 * ==========================================
 * SUBSISTEMA BI - ANÁLISIS DE RESULTADOS DE DOCENTES
 * Archivo: Backend_BI.gs
 * ==========================================
 * Endpoint para obtener datos de la "Sábana General Docente"
 * 
 * RESPUESTA (getSabanaBIData):
 *   headerCodesLMS[]  - Array de 38 códigos de criterios LMS
 *   headerCodesAcomp[] - Array de 11 códigos de criterios Acomp
 *   biData[] - Array de docentes, cada uno con:
 *     criteriosLMS[]  - 38 valores numéricos (null si vacío)
 *     criteriosAcomp[] - 11 valores numéricos (null si vacío)
 *     ptsLMS, ptsAcomp, promedio, scoreGral, modalidad, etc.
 *
 * NOTA: Este archivo es independiente de Code.gs.
 */

function getSabanaBIData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sábana General Docente");
    if (!sheet) {
       return { role: 'ERROR', message: "Hoja 'Sábana General Docente' no encontrada. Ejecute '(BI) Generar Cabeceras' y '(BI) Sincronizar' desde el menú." };
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 3) {
       return { role: 'ERROR', message: "La Sábana no tiene datos. Ejecute '(BI) Sincronizar Sábana General Docente' desde el menú." };
    }

    // Fila 1 = Códigos, Fila 2 = Títulos, Datos desde Fila 3
    var allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headerCodes = allData[0]; // Fila 1: códigos de columna

    // Mapeo dinámico de índices por código de columna (Fila 1)
    function findCol(code) {
      for (var c = 0; c < headerCodes.length; c++) {
        if (String(headerCodes[c]).trim() === code) return c;
      }
      return -1;
    }

    // Columnas base de Asignación (índices 0-based)
    var iPrograma = 2;    // Col C (Programa)
    var iAsignatura = 4;  // Col E (Asignatura/Curso)
    var iDocente = 6;     // Col G (Docente)
    var iCoordinador = 18; // Col S (Coordinador)

    // Puntajes finales (por código)
    var iLmsTotal = findCol('LMS_TOTAL');
    var iAcompTotal = findCol('ACOMP_TOTAL');
    var iScoreGral = findCol('SCORE_GRAL');
    var iScoreVig = findCol('SCORE_VIG');

    // ---------------------------------------------------------------
    // BLOQUE LMS: 38 columnas expandidas (cols 20-57 = índices 19-56)
    // Se ubican dinámicamente: desde col después de Asignación (19 cols)
    // hasta LMS_TOTAL (exclusive)
    // ---------------------------------------------------------------
    var iLmsStart = 19; // Índice 0-based de la primera col LMS
    var iLmsEnd = iLmsTotal !== -1 ? iLmsTotal : iLmsStart + 38;
    var lmsCount = iLmsEnd - iLmsStart;

    var lmsHeaderCodes = [];
    for (var c = iLmsStart; c < iLmsEnd; c++) {
      lmsHeaderCodes.push(String(headerCodes[c] || '').trim());
    }

    // ---------------------------------------------------------------
    // BLOQUE ACOMP: 11 columnas (después de LMS_TOTAL hasta ACOMP_TOTAL)
    // ---------------------------------------------------------------
    var iAcompStart = iLmsTotal !== -1 ? iLmsTotal + 1 : -1;
    var iAcompEnd = iAcompTotal !== -1 ? iAcompTotal : (iAcompStart > 0 ? iAcompStart + 11 : -1);
    var acompCount = iAcompStart > 0 && iAcompEnd > iAcompStart ? iAcompEnd - iAcompStart : 0;

    var acompHeaderCodes = [];
    if (iAcompStart > 0) {
      for (var c = iAcompStart; c < iAcompEnd; c++) {
        acompHeaderCodes.push(String(headerCodes[c] || '').trim());
      }
    }

    var result = [];

    // Recorrer datos desde Fila 3 (índice 2 en el array)
    for (var i = 2; i < allData.length; i++) {
      var row = allData[i];

      // Validar que tenga asignatura
      var asignatura = String(row[iAsignatura] || '').trim();
      if (!asignatura) continue;

      var docente = String(row[iDocente] || '').trim();
      var programa = String(row[iPrograma] || '').trim();
      var coordinador = String(row[iCoordinador] || '').trim();

      // Determinar modalidad según reglas de negocio
      var colD = String(row[3] || '').trim().toUpperCase();
      var colN = String(row[13] || '').trim().toUpperCase();

      var esHibrida = (colN.indexOf('HÍBRIDA') !== -1 || colN.indexOf('HIBRIDA') !== -1);
      var esPresencialEnD = (colD.indexOf('PRESENCIAL') !== -1);

      var modalidad = 'VIRTUAL'; // default
      if (esPresencialEnD && !esHibrida) {
        modalidad = 'PRESENCIAL';
      }

      // Extraer puntajes
      var lmsVig = iLmsTotal !== -1 ? parseFloat(row[iLmsTotal]) : 0;
      var acompVig = iAcompTotal !== -1 ? parseFloat(row[iAcompTotal]) : 0;
      var scoreGral = iScoreGral !== -1 ? parseFloat(row[iScoreGral]) : 0;
      var scoreVig = iScoreVig !== -1 ? parseFloat(row[iScoreVig]) : 0;

      if (isNaN(lmsVig)) lmsVig = 0;
      if (isNaN(acompVig)) acompVig = 0;
      if (isNaN(scoreGral)) scoreGral = 0;
      if (isNaN(scoreVig)) scoreVig = 0;

      // Extraer los 38 valores de criterios LMS
      var criteriosLMS = [];
      for (var c = iLmsStart; c < iLmsEnd; c++) {
        var val = row[c];
        criteriosLMS.push(val !== null && val !== '' && !isNaN(val) ? Number(val) : null);
      }

      // Extraer los 11 valores de criterios Acomp
      var criteriosAcomp = [];
      if (iAcompStart > 0) {
        for (var c = iAcompStart; c < iAcompEnd; c++) {
          var val = row[c];
          criteriosAcomp.push(val !== null && val !== '' && !isNaN(val) ? Number(val) : null);
        }
      }

      result.push({
        rowIndex: i + 1,
        nombre: docente || asignatura,
        asignatura: asignatura,
        programa: programa,
        modalidad: modalidad,
        coordinador: coordinador,
        ptsLMS: lmsVig,
        ptsAcomp: acompVig,
        promedio: scoreVig,
        scoreGral: scoreGral,
        criteriosLMS: criteriosLMS,
        criteriosAcomp: criteriosAcomp
      });
    }

    return {
      success: true,
      biData: result,
      headerCodesLMS: lmsHeaderCodes,
      headerCodesAcomp: acompHeaderCodes
    };

  } catch(e) {
    return { role: 'ERROR', message: "Error en Backend_BI: " + e.toString() };
  }
}
