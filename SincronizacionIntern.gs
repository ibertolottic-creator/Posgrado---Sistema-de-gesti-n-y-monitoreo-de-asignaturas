/**
 * ======================================================================
 * ARCHIVO: Sincronización a Destinos (LMS, Acompañamiento) - SUPER OPTIMIZADO
 * DESCRIPCIÓN: Exporta "Asignación de coordinador" hacia hojas hijas.
 * OPTIMIZACIÓN: Escritura en bloque (Batch) y Limpieza de Filas (Batch Deletion).
 * CONFIGURACIÓN DE FILAS:
 * - ORIGEN ("Asignación de coordinador"): Encabezados Fila 1 -> Datos inician Fila 2.
 * - DESTINOS (LMS, Acompañamiento): Encabezados Filas 1 y 2 -> Datos inician Fila 3.
 * ======================================================================
 */

function sincronizarAcompanamiento() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  ejecutarSincronizacion(ss, ui, "Asignación de coordinador", "Acompañamiento al desempeño docente Pedagógico", "TODO");
}

function sincronizarLMSVirtual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  ejecutarSincronizacion(ss, ui, "Asignación de coordinador", "Sistema de gestión del aprendizaje (LMS)- virtual", "VIRTUAL");
}

function sincronizarLMSPresencial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  ejecutarSincronizacion(ss, ui, "Asignación de coordinador", "Sistema de gestión del aprendizaje (LMS)- presencial", "PRESENCIAL");
}

function ejecutarSincronizacion(ss, ui, nombreOrigen, nombreDestino, tipoFiltro) {
  var hojaOrigen = ss.getSheetByName(nombreOrigen);
  var hojaDestino = ss.getSheetByName(nombreDestino);

  if (!hojaOrigen || !hojaDestino) {
    ui.alert("❌ Error: Faltan hojas '" + nombreOrigen + "' o '" + nombreDestino + "'.");
    return;
  }

  // ==========================================
  // 1. LEER ORIGEN (Datos inician en Fila 2)
  // ==========================================
  var ultFilaOrigen = hojaOrigen.getLastRow();
  
  if (ultFilaOrigen < 2) {
    ui.alert("⚠️ La hoja de origen no tiene datos suficientes.");
    return;
  }
  
  // Leemos desde Fila 2
  // Optimizacion: Solo leemos columnas necesarias para filtrar si fuera posible, pero necesitamos todo para copiar.
  var datosOrigen = hojaOrigen.getRange(2, 1, ultFilaOrigen - 1, 19).getValues();
  var richTextOrigenLM = hojaOrigen.getRange(2, 12, ultFilaOrigen - 1, 2).getRichTextValues();

  // Mapear Origen Filtrado
  var mapaOrigenFiltrado = {}; 
  var listaOrdenadaIDs = []; 

  for (var i = 0; i < datosOrigen.length; i++) {
    var filaSrc = datosOrigen[i];
    var idOrigen = String(filaSrc[15]); // ID en Col P (15)

    if (!idOrigen || idOrigen === "undefined" || idOrigen === "") continue;

    var valD = String(filaSrc[3]);  // D
    var valN = String(filaSrc[13]); // N
    
    var pasaFiltro = false;
    if (tipoFiltro === "TODO") pasaFiltro = true;
    else if (tipoFiltro === "VIRTUAL" && (valD.indexOf("Virtual") > -1 || valN.indexOf("Híbrida") > -1)) pasaFiltro = true;
    else if (tipoFiltro === "PRESENCIAL" && valD.indexOf("Presencial") > -1 && valN.indexOf("Híbrida") === -1) pasaFiltro = true;

    if (pasaFiltro) {
      if (!mapaOrigenFiltrado.hasOwnProperty(idOrigen)) {
         mapaOrigenFiltrado[idOrigen] = { valores: filaSrc, richText: richTextOrigenLM[i] };
         listaOrdenadaIDs.push(idOrigen);
      }
    }
  }

  // ==========================================
  // 2. ELIMINAR EN DESTINO (Batch Delete)
  // ==========================================
  var ultFilaDestino = hojaDestino.getLastRow();
  var filasEliminadas = 0;
  
  if (ultFilaDestino >= 3) {
    var numFilas = ultFilaDestino - 2;
    var idsDestinoRaw = hojaDestino.getRange(3, 16, numFilas, 1).getValues();
    
    // Lista de filas a eliminar (Índices relativos a F3: 0, 1, 2...)
    var indicesEliminar = [];

    for (var i = 0; i < idsDestinoRaw.length; i++) {
       var idDest = String(idsDestinoRaw[i][0]);
       if (!mapaOrigenFiltrado.hasOwnProperty(idDest)) {
         indicesEliminar.push(i);
       }
    }

    if (indicesEliminar.length > 0) {
      // Ordenamos descendente para borrar sin alterar índices de los siguientes
      indicesEliminar.sort(function(a, b){return b - a});
      
      // Agrupamos eliminaciones contiguas para optimizar api calls
      var grupos = []; // {inicio, cantidad}
      var grupoActual = {inicio: indicesEliminar[0], cantidad: 1};
      
      for (var k = 1; k < indicesEliminar.length; k++) {
        var idx = indicesEliminar[k]; // idx es menor que el anterior (descendente)
        var anterior = grupoActual.inicio - grupoActual.cantidad + 1; // Fila superior del grupo actual si fuera ascendente? No.
        // Simplifiquemos grupos descendentes:
        // Si borro fila 10, y luego fila 9. Es un bloque de 9 y 10.
        // En sort descendente: [10, 9, 5, 2]
        // G1: 10 (cant 1) -> siguiente es 9 (10-1 = 9). SI son contiguos.
        // G1 ahora abarca 9 y 10. Inicio sigue siendo relativo al bloque: Fila 9, cantidad 2.
        
        var ultimoDelGrupo = grupoActual.inicio - grupoActual.cantidad + 1; // La fila mas "arriba" del grupo
        // idx debe ser ultimoDelGrupo - 1 para ser contiguo.
        
        if (idx === (ultimoDelGrupo - 1)) {
           grupoActual.cantidad++;
           // El inicio visual en deleteRows es la primera fila del grupo
           // Pero al borrar descendente, el inicio del grupo siempre es idx (la fila mas arriba).
           // Espera, deleteRows(start, num): borra num filas a partir de start.
           // Si tenemos filas 9 y 10. deleteRows(9, 2).
           // En mi logica: grupoActual.inicio=10. idx=9.
           // Grupo deberia ser Start=9, Count=2.
        } else {
           // Cerramos grupo anterior y empezamos uno nuevo
           // El "start" del grupo para la API es (inicioOriginal - cantidad + 1) + 3 (offset Fila 3)
           grupos.push(grupoActual);
           grupoActual = {inicio: idx, cantidad: 1};
        }
      }
      grupos.push(grupoActual);

      // Ejecutamos eliminaciones
      for (var g = 0; g < grupos.length; g++) {
         var grp = grupos[g];
         // Indice relativo más alto: grp.inicio
         // Indice relativo más bajo (start): grp.inicio - grp.cantidad + 1
         
         var filaStartRelativa = grp.inicio - grp.cantidad + 1;
         var filaReal = filaStartRelativa + 3; // Offset Fila 3
         
         hojaDestino.deleteRows(filaReal, grp.cantidad);
         filasEliminadas += grp.cantidad;
      }
    }
  }

  // ==========================================
  // 3. ACTUALIZAR / INSERTAR EN DESTINO
  // ==========================================
  var ultFilaDestinoPost = hojaDestino.getLastRow();
  var mapaIndicesDestino = {};
  var datosDestinoMemoria = [];
  var richTextDestinoMemoria = [];
  
  if (ultFilaDestinoPost >= 3) {
    var numFilasPost = ultFilaDestinoPost - 2;
    datosDestinoMemoria = hojaDestino.getRange(3, 1, numFilasPost, 19).getValues(); 
    richTextDestinoMemoria = hojaDestino.getRange(3, 12, numFilasPost, 2).getRichTextValues(); 
    
    for (var j = 0; j < datosDestinoMemoria.length; j++) {
      var idMem = String(datosDestinoMemoria[j][15]); 
      if (idMem) mapaIndicesDestino[idMem] = j;
    }
  }

  var contadorActualizados = 0;
  var contadorNuevos = 0;
  var nuevosValores = [];
  var nuevosRichText = [];

  for (var k = 0; k < listaOrdenadaIDs.length; k++) {
    var idObj = listaOrdenadaIDs[k];
    var datosObj = mapaOrigenFiltrado[idObj];
    
    if (mapaIndicesDestino.hasOwnProperty(idObj)) {
      // UPDATE
      var idx = mapaIndicesDestino[idObj];
      datosDestinoMemoria[idx] = datosObj.valores;
      richTextDestinoMemoria[idx][0] = datosObj.richText[0];
      richTextDestinoMemoria[idx][1] = datosObj.richText[1];
      contadorActualizados++;
    } else {
      // INSERT
      nuevosValores.push(datosObj.valores);
      nuevosRichText.push(datosObj.richText);
      contadorNuevos++;
    }
  }

  // --- ESCRITURA ---
  
  // A. Guardar Updates
  if (datosDestinoMemoria.length > 0) {
    hojaDestino.getRange(3, 1, datosDestinoMemoria.length, 19).setValues(datosDestinoMemoria);
    hojaDestino.getRange(3, 12, richTextDestinoMemoria.length, 2).setRichTextValues(richTextDestinoMemoria);
  }
  
  // B. Guardar Nuevos
  if (nuevosValores.length > 0) {
    var filaInicio = (ultFilaDestinoPost > 2 ? ultFilaDestinoPost : 2) + 1;
    if (filaInicio < 3) filaInicio = 3;

    hojaDestino.getRange(filaInicio, 1, nuevosValores.length, 19).setValues(nuevosValores);
    hojaDestino.getRange(filaInicio, 12, nuevosRichText.length, 2).setRichTextValues(nuevosRichText);
  }

  ui.alert("✅ Sincronización '" + tipoFiltro + "' completada (OPTIMIZADA).\n\n" +
           "🗑️ Eliminados: " + filasEliminadas + "\n" +
           "📝 Actualizados: " + contadorActualizados + "\n" +
           "✨ Nuevos: " + contadorNuevos);
}