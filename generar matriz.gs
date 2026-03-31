/**
 * ======================================================================
 * ARCHIVO: Sincronización desde "Todo Matr" a "Asignación de coordinador"
 * DESCRIPCIÓN: Sincronización COMPLETA (Agregar, Actualizar, Eliminar)
 * CLAVE ÚNICA: Columna Z en "Todo Matr" vs Columna P en "Asignación"
 * AUTOR: Generado por Asistente (Optimizado)
 * ======================================================================
 */

function importarDesdeTodoMatr() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var nombreHojaOrigen = "Todo Matr";
  var nombreHojaDestino = "Asignación de coordinador";
  
  // Ejecutamos la lógica principal dentro de un bloque try-catch para manejo de errores
  try {
    procesarSincronizacionCompleta(ss, ui, nombreHojaOrigen, nombreHojaDestino);
  } catch (e) {
    ui.alert("❌ Error Crítico: " + e.toString());
  }
}

function procesarSincronizacionCompleta(ss, ui, hojaOrigenNombre, hojaDestinoNombre) {
  var hojaOrigen = ss.getSheetByName(hojaOrigenNombre);
  var hojaDestino = ss.getSheetByName(hojaDestinoNombre);

  // 1. Validaciones básicas
  if (!hojaOrigen || !hojaDestino) {
    throw new Error("No se encontraron las hojas requeridas ('" + hojaOrigenNombre + "' o '" + hojaDestinoNombre + "').");
  }

  // 2. Obtener datos de ORIGEN ("Todo Matr")
  // Importante: Leemos todo el rango hasta la columna AA (27)
  var ultFilaOrigen = hojaOrigen.getLastRow();
  if (ultFilaOrigen < 2) {
    ui.alert("⚠️ La hoja origen no tiene datos.");
    return;
  }
  
  var rangoOrigen = hojaOrigen.getRange(2, 1, ultFilaOrigen - 1, 27); // A2:AA
  var datosOrigen = rangoOrigen.getValues();
  // Para RichText (enlaces), solo nos interesan las columnas U (20) y V (21)
  // Índices array: 20 y 21. Se leen aparte para no sobrecargar si no es necesario,
  // pero para sincronización completa es mejor leerlos.
  var datosRichTextOrigen = hojaOrigen.getRange(2, 21, ultFilaOrigen - 1, 2).getRichTextValues();

  // 3. Crear Mapa de ORIGEN por ID (Columna Z -> Índice 25)
  // Clave: ID, Valor: { datos: filaArray, links: [rtU, rtV] }
  var mapaOrigen = {};
  
  for (var i = 0; i < datosOrigen.length; i++) {
    var fila = datosOrigen[i];
    
    // --- FILTROS DE ORIGEN ---
    // Columna G (Indce 6) <> Vacio
    // Columna Z (Indce 25) <> Vacio (ID)
    // Columna J (Indce 9) <> "Cerrada"
    // Columna B (Indce 1) REGEXMATCH "POSGRADO"
    
    var colG = fila[6];
    var idOrigen = String(fila[25]);
    var colJ = fila[9];
    var colB = String(fila[1]).toUpperCase();

    if (colG === "" || colG === null) continue;
    if (idOrigen === "" || idOrigen === null || idOrigen === "undefined") continue;
    if (String(colJ).toUpperCase() === "CERRADA") continue; 

    var regex = /POSGRADO/;
    if (!colB.match(regex)) continue;

    // Guardamos en el mapa. Si hay duplicados en origen, el último gana (o podrías validar duplicados)
    mapaOrigen[idOrigen] = {
      filaCompleta: fila,
      richTextUV: datosRichTextOrigen[i] // Array de 2 elementos [U, V]
    };
  }

  // 4. Obtener datos de DESTINO ("Asignación de coordinador")
  // Leemos columnas A hasta Q (17 columnas) que son las que controlamos.
  // Nota: Si hay columnas R, S... con datos manuales, NO las tocamos en la lectura masiva para escritura,
  // salvo que vayamos a eliminas la fila.
  var ultFilaDestino = hojaDestino.getLastRow();
  var datosDestino = [];
  var idsDestino = [];
  var formulasDestino = []; // Por si hubiera fórmulas, pero asumimos valores.
  
  if (ultFilaDestino >= 2) {
    // Leemos A:Q (1-17)
    datosDestino = hojaDestino.getRange(2, 1, ultFilaDestino - 1, 17).getValues();
    // Los IDs están en la columna P -> Índice 15 en el array de destino (Col 16 es P)
    // ESPERA: En el script anterior decia: "80, // Z -> P (ID)".
    // A=0... P=15.
    // Vamos a verificar el mapeo anterior:
    // P -> H (Index 15 -> Col 8) ??? No, el mapeo era Origen -> Destino.
    // Revisemos `indicesMapeo` del script original:
    // 71, // P -> H  (Origen P va a Destino H)
    // 79, // Z -> P  (Origen Z va a Destino P)
    // Entonces en DESTINO, el ID está en la Columna P (Columna 16).
    // En array (base 0), índice 15.
  }

  // Mapeo de columnas: Origen (Indice) -> Destino (Indice)
  // Destino tiene estructura A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q
  // 0->0, 1->1, 2->2, 3->3, 6->4(E), 10->5(F), 24->6(G), 15->7(H), 16->8(I), 17->9(J), 19->10(K)
  // 20->11(L), 21->12(M), 22->13(N), 23->14(O), 25->15(P-ID), 26->16(Q)
  var mapeo = [
    {origen: 0, destino: 0},
    {origen: 1, destino: 1},
    {origen: 2, destino: 2},
    {origen: 3, destino: 3},
    {origen: 6, destino: 4},  // G -> E (Nombre Asignatura?)
    {origen: 10, destino: 5}, // K -> F
    {origen: 24, destino: 6}, // Y -> G (Nombre Docente?)
    {origen: 15, destino: 7}, // P -> H (Email 1?)
    {origen: 16, destino: 8}, // Q -> I (Email 2?)
    {origen: 17, destino: 9}, // R -> J (Teléfono?)
    {origen: 19, destino: 10},// T -> K
    {origen: 22, destino: 13},// W -> N
    {origen: 23, destino: 14},// X -> O
    {origen: 25, destino: 15},// Z -> P (ID)
    {origen: 26, destino: 16} // AA -> Q
  ];
  // Nota: Las columnas L (11) y M (12) son RichText y se manejan aparte.

  // ---------------------------------------------------------
  // FASE A: ELIMINACIÓN (DELETE)
  // Recorremos destino de abajo hacia arriba para borrar sin afectar índices
  // ---------------------------------------------------------
  var filasEliminadas = 0;
  // ultFilaDestino es la última fila real en la hoja (base 1).
  // datosDestino tiene longitud (ultFilaDestino - 1).
  // Iteramos sobre datosDestino.
  
  // Vamos a usar una lista de filas a eliminar para hacerlo eficiente o uno por uno (deleteRow es lento pero seguro).
  // Dado que pueden ser pocas, deleteRow está "bien". Si son muchas, es mejor ordenar y borrar bloque.
  // Haremos deleteRow de abajo hacia arriba.
  
  for (var i = datosDestino.length - 1; i >= 0; i--) {
    var filaDest = datosDestino[i];
    var idDest = String(filaDest[15]); // Col P es índice 15

    if (!mapaOrigen.hasOwnProperty(idDest)) {
      // El ID ya no existe en Origen -> ELIMINAR
      // Fila en hoja = i + 2
      hojaDestino.deleteRow(i + 2);
      filasEliminadas++;
    }
  }

  // ---------------------------------------------------------
  // FASE B: PREPARAR ACTUALIZACIONES (UPDATE) Y NUEVOS (create)
  // Volvemos a leer destino o mantenemos lógica? 
  // Al haber borrado filas, los índices de datosDestino ya no coinciden con la hoja.
  // Lo mejor es:
  // 1. Construir la NUEVA matriz de datos en memoria para TODAS las filas que quedan.
  // 2. Agregar las nuevas al final.
  // 3. Sobrescribir TODO el rango A:Q. (Respetando R, S si existen, que no se tocan).
  
  // Re-leemos para asegurar sincronía perfecta tras borrado
  var ultFilaDestinoPostDelete = hojaDestino.getLastRow();
  var datosDestinoFinal = [];
  var richTextDestinoFinal = []; // Para columnas L y M
  
  // Array de IDs actuales en la hoja (post-delete)
  var idsActuales = [];
  
  if (ultFilaDestinoPostDelete >= 2) {
    // Leemos valores A:Q
    datosDestinoFinal = hojaDestino.getRange(2, 1, ultFilaDestinoPostDelete - 1, 17).getValues();
    // Leemos RichText L:M
    richTextDestinoFinal = hojaDestino.getRange(2, 12, ultFilaDestinoPostDelete - 1, 2).getRichTextValues();
    
    // Extraemos IDs para saber qué actualizar
    for (var j = 0; j < datosDestinoFinal.length; j++) {
      idsActuales.push(String(datosDestinoFinal[j][15])); // ID en col 15
    }
  }

  var filasActualizadas = 0;
  var filasNuevas = 0;

  // Lista de control de IDs procesados para no duplicar si origen tiene duplicados (ya filtrado por mapaOrigen)
  // Iteramos sobre las claves del mapaOrigen para asegurar orden? No, el mapa no garantiza orden.
  // Mejor iteramos sobre datosOrigen para mantener el orden original del Source si es posible,
  // o simplemente usamos el mapa.
  // Si usamos el mapa, perdemos el orden de "Todo Matr". Si el orden importa, iterar datosOrigen.
  
  var idsProcesados = {};

  // 1. ACTUALIZAR (UPDATE) en datosDestinoFinal
  for (var k = 0; k < idsActuales.length; k++) {
    var idActual = idsActuales[k];
    if (mapaOrigen.hasOwnProperty(idActual)) {
      // Existe en origen, actualizamos datosDestinoFinal[k]
      var infoOrigen = mapaOrigen[idActual];
      var filaSrc = infoOrigen.filaCompleta;
      
      // Actualizamos columnas mapeadas (Valores)
      mapeo.forEach(function(m) {
        datosDestinoFinal[k][m.destino] = filaSrc[m.origen];
      });
      
      // Actualizamos RichText L y M (Source U->L, Source V->M)
      // indices source U=20, V=21. indices dest L=11, M=12.
      // infoOrigen.richTextUV es [U, V]
      richTextDestinoFinal[k][0] = infoOrigen.richTextUV[0]; // L
      richTextDestinoFinal[k][1] = infoOrigen.richTextUV[1]; // M
      
      filasActualizadas++;
      idsProcesados[idActual] = true;
    }
  }

  // 2. NUEVOS (INSERT)
  // Iteramos datosOrigen para encontrar los que NO están en idsProcesados
  // (Así mantenemos el orden relativo de los nuevos)
  var nuevosValores = [];
  var nuevosRichText = [];

  for (var i = 0; i < datosOrigen.length; i++) {
    var fila = datosOrigen[i];
    var idOrigen = String(fila[25]);

    // Verificar filtros de nuevo (o confiar en que mapaOrigen ya tiene solo válidos)
    if (!mapaOrigen.hasOwnProperty(idOrigen)) continue; // Fue filtrado
    if (idsProcesados[idOrigen]) continue; // Ya existe y fue actualizado

    // Crear nueva fila vacía de 17 columnas
    var nuevaFila = new Array(17).fill(""); 
    
    // Llenar datos mapeados
    mapeo.forEach(function(m) {
      nuevaFila[m.destino] = fila[m.origen];
    });

    // RichText
    var rtU = datosRichTextOrigen[i][0];
    var rtV = datosRichTextOrigen[i][1];

    nuevosValores.push(nuevaFila);
    nuevosRichText.push([rtU, rtV]);
    
    // Marcar procesado para evitar duplicados en el loop
    idsProcesados[idOrigen] = true;
    filasNuevas++;
  }

  // ---------------------------------------------------------
  // FASE C: ESCRITURA FINAL
  // ---------------------------------------------------------
  
  // 1. Escribir actualizaciones (Sobrescribir rango existente)
  if (datosDestinoFinal.length > 0) {
     hojaDestino.getRange(2, 1, datosDestinoFinal.length, 17).setValues(datosDestinoFinal);
     try {
       hojaDestino.getRange(2, 12, richTextDestinoFinal.length, 2).setRichTextValues(richTextDestinoFinal);
     } catch(e) { console.warn("Aviso RichText Updates: " + e.message); }
  }
  
  // 2. Escribir nuevos (Append al final)
  if (nuevosValores.length > 0) {
    var filaInicioNuevos = (ultFilaDestinoPostDelete > 1 ? ultFilaDestinoPostDelete : 1) + 1;
    // Ajuste: si la hoja estaba vacía (fila 1 header), filaInicio es 2.
    if (ultFilaDestinoPostDelete < 1) filaInicioNuevos = 2; // Seguridad

    hojaDestino.getRange(filaInicioNuevos, 1, nuevosValores.length, 17).setValues(nuevosValores);
    try {
      hojaDestino.getRange(filaInicioNuevos, 12, nuevosRichText.length, 2).setRichTextValues(nuevosRichText);
    } catch(e) { console.warn("Aviso RichText Nuevos: " + e.message); }
  }

  ui.alert("✅ Sincronización COMPLETA terminada.\n" +
           "🗑️ Eliminados: " + filasEliminadas + "\n" +
           "🔄 Actualizados: " + filasActualizadas + "\n" +
           "✨ Nuevos: " + filasNuevas);
}