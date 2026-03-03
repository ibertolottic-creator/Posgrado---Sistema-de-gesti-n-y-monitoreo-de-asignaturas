function uiAlertSafe(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch(e) {
    console.log("WebApp Alert Bypass:", msg);
  }
}

function importarDatosATodoMatr() {
  var ssActual = SpreadsheetApp.getActiveSpreadsheet();

  // 1. CONFIGURACIÓN: Leemos C1 y D1 desde la pestaña "Hoja de rutas"
  var hojaConfig = ssActual.getSheetByName("Hoja de rutas");
  if (!hojaConfig) {
    uiAlertSafe('Error: No se encontró la pestaña de configuración "Hoja de rutas".');
    return;
  }

  var idOrigen = hojaConfig.getRange("C1").getValue();
  var nombreHojaOrigen = hojaConfig.getRange("D1").getValue(); // Aquí debe decir el nombre de la pestaña externa

  // 2. DESTINO: Referencia a la pestaña "Todo Matr"
  var hojaDestino = ssActual.getSheetByName("Todo Matr");
  if (!hojaDestino) {
    // Si no existe, la creamos (opcional, pero buena práctica)
    hojaDestino = ssActual.insertSheet("Todo Matr");
  }

  // Validaciones básicas
  if (!idOrigen || !nombreHojaOrigen) {
    uiAlertSafe('Por favor, revisa C1 y D1 en "Hoja de rutas". Están vacíos.');
    return;
  }

  try {
    // 3. CONEXIÓN: Abrir hoja externa
    var ssOrigen = SpreadsheetApp.openById(idOrigen);
    var hojaOrigen = ssOrigen.getSheetByName(nombreHojaOrigen);

    if (!hojaOrigen) {
      uiAlertSafe('No se encontró la pestaña llamada "' + nombreHojaOrigen + '" en el archivo de origen.');
      return;
    }

    // 4. LEER DATOS
    var ultimaFila = hojaOrigen.getLastRow();
    
    // Asumimos que la fila 1 son encabezados y empezamos desde la 2.
    // Si quieres incluir encabezados, cambia filaInicio a 1.
    var filaInicio = 2; 
    
    if (ultimaFila < filaInicio) {
      uiAlertSafe('La hoja de origen no tiene datos suficientes.');
      return;
    }
    
    var numFilas = ultimaFila - filaInicio + 1;

    // A. Leer A hasta T (Valores normales) -> Columnas 1 a 20
    var datosAT = hojaOrigen.getRange(filaInicio, 1, numFilas, 20).getValues();

    // B. Leer U y V (RichText para enlaces) -> Columnas 21 y 22
    var datosUV = hojaOrigen.getRange(filaInicio, 21, numFilas, 2).getRichTextValues();

    // C. Leer AF (Valor normal) -> Columna 32
    var datosAF = hojaOrigen.getRange(filaInicio, 32, numFilas, 1).getValues();

    // 5. ESCRIBIR EN "Todo Matr"
    
    // Limpiamos la hoja destino (excepto encabezados si quisieras conservarlos)
    // Aquí limpiamos desde la fila 2 hacia abajo para tener datos frescos
    var ultimaFilaDestino = hojaDestino.getLastRow();
    if (ultimaFilaDestino >= 2) {
      hojaDestino.getRange(2, 1, ultimaFilaDestino, 23).clearContent(); // Limpia hasta la columna W (23)
    }

    // Pegar A-T (Columnas 1-20)
    hojaDestino.getRange(2, 1, numFilas, 20).setValues(datosAT);

    // Pegar U-V (Columnas 21-22) con enlaces
    hojaDestino.getRange(2, 21, numFilas, 2).setRichTextValues(datosUV);

    // Pegar AF en la Columna W (Columna 23)
    hojaDestino.getRange(2, 23, numFilas, 1).setValues(datosAF);

    uiAlertSafe('Importación completada en "Todo Matr".');

  } catch (e) {
    uiAlertSafe('Error al importar: ' + e.message);
  }
}