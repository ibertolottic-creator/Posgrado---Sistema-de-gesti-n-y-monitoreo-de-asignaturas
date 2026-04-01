/**
 * ======================================================================
 * DATA MART: SÁBANA GENERAL DOCENTE PARA BI
 * ARCHIVO: GeneradorBI.gs
 * ======================================================================
 */

const SABANA_DOCENTE = 'Sábana General Docente';

function generarCabecerasSabanaGeneral() {
  var lock = LockService.getScriptLock();
  var ui = null;
  try {
    ui = SpreadsheetApp.getUi();
  } catch(e) {}

  try {
    lock.waitLock(10000);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hojaSabana = ss.getSheetByName(SABANA_DOCENTE);
    if (!hojaSabana) {
      if(ui) ui.alert("❌ Error: No existe la hoja '" + SABANA_DOCENTE + "'.");
      return;
    }

    var hojaAsignacion = ss.getSheetByName(SHEET_MAP['ASIGNACION']);
    var hojaVirtual = ss.getSheetByName(SHEET_MAP['VIRTUAL']);
    var hojaPresencial = ss.getSheetByName(SHEET_MAP['PRESENCIAL']);
    var hojaAcomp = ss.getSheetByName(SHEET_MAP['ACOMPANAMIENTO']);

    if (!hojaAsignacion || !hojaVirtual || !hojaAcomp || !hojaPresencial) {
      if(ui) ui.alert("❌ Error: Faltan hojas origen.");
      return;
    }

    // 1. Asignación (A a S) - 19 columnas (Solo Fila 1)
    var headersAsig = hojaAsignacion.getRange(1, 1, 1, 19).getValues()[0];
    
    // 2. LMS Virtual y Presencial (Criterios Col 21 a 54) - 34 columnas de origen (Fila 1 y 2)
    var codesLMS = hojaVirtual.getRange(1, 21, 1, 34).getValues()[0];
    var titlesLMS = hojaVirtual.getRange(2, 21, 1, 34).getValues()[0];
    var codesPresencial = hojaPresencial.getRange(1, 21, 1, 34).getValues()[0];
    var titlesPresencial = hojaPresencial.getRange(2, 21, 1, 34).getValues()[0];

    // 2.1 LMS Metadata: Timestamps (Col 56 a 89) = 34 columnas
    var tsCodesLMS = hojaVirtual.getRange(1, 56, 1, 34).getValues()[0];
    var tsTitlesLMS = hojaVirtual.getRange(2, 56, 1, 34).getValues()[0];
    var tsCodesPre = hojaPresencial.getRange(1, 56, 1, 34).getValues()[0];
    var tsTitlesPre = hojaPresencial.getRange(2, 56, 1, 34).getValues()[0];

    // 2.2 LMS Metadata: KPIs (Col 91 a 134) = 44 columnas (se omitirán las vacías dinámicamente)
    var kpiCodesLMS = hojaVirtual.getRange(1, 91, 1, 44).getValues()[0];
    var kpiTitlesLMS = hojaVirtual.getRange(2, 91, 1, 44).getValues()[0];

    // 3. Acompañamiento (Criterios Col 21 a 31) - 11 columnas (Fila 1 y 2)
    var codesAcomp = hojaAcomp.getRange(1, 21, 1, 11).getValues()[0];
    var titlesAcomp = hojaAcomp.getRange(2, 21, 1, 11).getValues()[0];

    // 3.1 Acomp Metadata: Timestamps (Col 35 a 45) - 11 columnas
    var tsCodesAcomp = hojaAcomp.getRange(1, 35, 1, 11).getValues()[0];
    var tsTitlesAcomp = hojaAcomp.getRange(2, 35, 1, 11).getValues()[0];

    // 3.2 Acomp Metadata: KPIs (Col 47 a 54) - 8 columnas
    var kpiCodesAcomp = hojaAcomp.getRange(1, 47, 1, 8).getValues()[0];
    var kpiTitlesAcomp = hojaAcomp.getRange(2, 47, 1, 8).getValues()[0];

    // Ensamblar Fila 1 (Códigos) y Fila 2 (Títulos u omitido si es base)
    var fila1 = [];
    var fila2 = [];

    // Base Asignación
    for (var i = 0; i < 19; i++) {
      fila1.push(headersAsig[i] || 'Asig_Col' + (i+1));
      fila2.push(headersAsig[i] || 'Asig_Col' + (i+1)); // Mismo título abajo
    }

    // LMS Criterios Expandidos (38 columnas)
    // 0 a 11 (Comunes)
    for (var i = 0; i < 12; i++) {
      fila1.push(codesLMS[i] || 'LMS_C' + (i+1));
      fila2.push(titlesLMS[i] || 'Criterio LMS ' + (i+1));
    }
    // 12 a 15 (Exclusivos Virtual - Tutorías)
    for (var i = 12; i < 16; i++) {
      fila1.push(codesLMS[i] || 'LMS_C' + (i+1));
      fila2.push(titlesLMS[i] || 'Criterio LMS ' + (i+1));
    }
    // 16 a 19 (Exclusivos Presencial - Evaluaciones/Asistencia) - Están en los índices 12 al 15 del origen presencial
    for (var i = 12; i < 16; i++) {
      fila1.push(codesPresencial[i] || 'LMS_P_' + (i+1));
      fila2.push(titlesPresencial[i] || 'Criterio Presencial ' + (i+1));
    }
    // 20 a 37 (Comunes - Índices 16 al 33 del origen)
    for (var i = 16; i < 34; i++) {
      fila1.push(codesLMS[i] || 'LMS_C' + (i+1));
      fila2.push(titlesLMS[i] || 'Criterio LMS ' + (i+1));
    }
    fila1.push('LMS_TOTAL');
    fila2.push('Puntaje Total LMS (Bruto)');

    // Acomp Criterios
    for (var i = 0; i < 11; i++) {
      fila1.push(codesAcomp[i] || 'ACOMP_C' + (i+1));
      fila2.push(titlesAcomp[i] || 'Criterio Acomp ' + (i+1));
    }
    fila1.push('ACOMP_TOTAL');
    fila2.push('Puntaje Total Acompañamiento (Bruto)');

    // Puntajes Finales
    fila1.push('SCORE_GRAL');
    fila2.push('Puntaje General Centesimal (100%)');
    fila1.push('SCORE_VIG');
    fila2.push('Puntaje General Vigesimal (Base 20)');

    // -----------------------------------------------------------
    // AGREGANDO LA METADATA DEL TRABAJO DEL COORDINADOR
    // -----------------------------------------------------------

    // 1. TIMESTAMPS LMS EXPANDIDOS (38 Columnas de Fechas/Horas de Evaluación)
    for (var i = 0; i < 12; i++) {
      fila1.push(tsCodesLMS[i] || 'LMS_TS_' + (i+1));
      fila2.push(tsTitlesLMS[i] || 'Fecha Eval ' + (i+1));
    }
    // Exclusivos Virtual
    for (var i = 12; i < 16; i++) {
        fila1.push(tsCodesLMS[i] || 'LMS_TS_' + (i+1));
        fila2.push(tsTitlesLMS[i] || 'Fecha Eval ' + (i+1));
    }
    // Exclusivos Presencial
    for (var i = 12; i < 16; i++) {
        fila1.push(tsCodesPre[i] || 'LMS_P_TS_' + (i+1));
        fila2.push(tsTitlesPre[i] || 'Fecha Eval Pre ' + (i+1));
    }
    // Resto comunes
    for (var i = 16; i < 34; i++) {
        fila1.push(tsCodesLMS[i] || 'LMS_TS_' + (i+1));
        fila2.push(tsTitlesLMS[i] || 'Fecha Eval ' + (i+1));
    }

    // 2. TIMESTAMPS ACOMPAÑAMIENTO
    for (var i = 0; i < 11; i++) {
        fila1.push(tsCodesAcomp[i] || 'ACOMP_TS_' + (i+1));
        fila2.push(tsTitlesAcomp[i] || 'Fecha Acomp ' + (i+1));
    }

    // 3. KPIs LMS (Hits, Auditorías, Emails, WAs)
    var validIndexLMS = []; // Para trackear qué KPIs reales copiamos (ignorando vacíos)
    for (var i = 0; i < 44; i++) {
        var code = kpiCodesLMS[i];
        if (code && String(code).trim() !== '') {
            fila1.push(code);
            fila2.push(kpiTitlesLMS[i] || code);
            validIndexLMS.push(i);
        }
    }

    // 4. KPIs ACOMPAÑAMIENTO
    var validIndexAcomp = [];
    for (var i = 0; i < 8; i++) {
        var code = kpiCodesAcomp[i];
        if (code && String(code).trim() !== '') {
            fila1.push(code);
            fila2.push(kpiTitlesAcomp[i] || code);
            validIndexAcomp.push(i);
        }
    }

    // Limpiar hoja y pegar (Las filas 1 y 2)
    var lc = hojaSabana.getLastColumn();
    if (lc > 0) {
      hojaSabana.getRange(1, 1, 2, lc).clearContent();
    }
    
    hojaSabana.getRange(1, 1, 1, fila1.length).setValues([fila1])
              .setFontWeight("bold").setBackground("#d9ead3");
    hojaSabana.getRange(2, 1, 1, fila2.length).setValues([fila2])
              .setFontWeight("bold").setBackground("#efefef");

    if(ui) ui.alert("✅ Cabeceras generadas exitosamente (" + fila1.length + " columnas).");
  } catch(e) {
    if(ui) ui.alert("❌ Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function sincronizarSabanaBI(silentMode) {
  var ui = null;
  if (!silentMode) {
    try {
       ui = SpreadsheetApp.getUi();
    } catch(e) {}
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    if (ui) ui.alert("⚠️ El sistema está ocupado. Intente luego.");
    return;
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hojaSabana = ss.getSheetByName(SABANA_DOCENTE);
    if (!hojaSabana) {
      if(ui) ui.alert("❌ Error: No existe la hoja " + SABANA_DOCENTE);
      return;
    }

    var hojaAsignacion = ss.getSheetByName(SHEET_MAP['ASIGNACION']);
    var hojaVirtual = ss.getSheetByName(SHEET_MAP['VIRTUAL']);
    var hojaPresencial = ss.getSheetByName(SHEET_MAP['PRESENCIAL']);
    var hojaAcomp = ss.getSheetByName(SHEET_MAP['ACOMPANAMIENTO']);

    var ultFilaAsig = hojaAsignacion.getLastRow();
    if (ultFilaAsig < 2) {
      if(ui) ui.alert("Sin datos en Asignación.");
      return;
    }

    var datosAsignacion = hojaAsignacion.getRange(2, 1, ultFilaAsig - 1, 19).getValues();

    // En Hojas LMS Criterios inician en Columna 21 (U), Notas=34.
    // Score LMS está en Columna 55 (BC).
    // Timestamps LMS inician en BD (56) = 34 cols.
    // KPIs LMS inician en Col 91 = 44 cols.
    var mapVirtual = construirMapaResultadosParaBI(hojaVirtual, 3, 55, 21, 34, 56, 34, 91, 44);
    var mapPresencial = construirMapaResultadosParaBI(hojaPresencial, 3, 55, 21, 34, 56, 34, 91, 44);
    
    // En Hoja Acompañamiento Criterios inician en Col 21 (U) = 11 coles.
    // Score Acomp en Columna 32 (AF).
    // Timestamps Acomp en AI (35) = 11 cols.
    // KPIs Acomp en AK (47) = 8 cols.
    var mapAcomp = construirMapaResultadosParaBI(hojaAcomp, 3, 32, 21, 11, 35, 11, 47, 8);

    // Cargar las cabeceras KPI una sola vez en la RAM antes del loop (Para evitar Exceeded maximum execution time)
    var kpiCodesVirtual = hojaVirtual.getRange(1, 91, 1, 44).getValues()[0];
    var kpiCodesAc = hojaAcomp.getRange(1, 47, 1, 8).getValues()[0];

    var sabanaDatos = [];

    for (var i = 0; i < datosAsignacion.length; i++) {
        var filaAsig = datosAsignacion[i]; // 19 cols
        var id = String(filaAsig[15]).trim(); // ID Col P
        
        if (!id || id === 'undefined' || id === '') continue;

        // Buscar en Hashmap de forma exacta y limpia usando fragmentos si es que está amalgamado en Asignación
        var baseKeyStr = id.toUpperCase().trim();
        var idFragments = baseKeyStr.match(/P[0-9A-Z_]+/g) || [baseKeyStr];

        var isVirtual = false;
        var isPresencial = false;
        var objLMS = { crit: new Array(34).fill(''), score: '', ts: new Array(34).fill(''), kpi: new Array(44).fill('') };
        var objAcomp = { crit: new Array(11).fill(''), score: '', ts: new Array(11).fill(''), kpi: new Array(8).fill('') };

        var matchV = undefined;
        var matchP = undefined;
        var matchA = undefined;

        // Comprobamos si CUALQUIERA de los fragmentos matriciales existe en las notas
        for (var f = 0; f < idFragments.length; f++) {
            var frag = idFragments[f];
            if (mapVirtual[frag] !== undefined) matchV = mapVirtual[frag];
            if (mapPresencial[frag] !== undefined) matchP = mapPresencial[frag];
            if (mapAcomp[frag] !== undefined) matchA = mapAcomp[frag];
        }

        if (matchV !== undefined) { isVirtual = true; objLMS = matchV; }
        else if (matchP !== undefined) { isPresencial = true; objLMS = matchP; }

        if (matchA !== undefined) { objAcomp = matchA; }

        var u_val = objLMS.score !== '' && !isNaN(objLMS.score) ? parseFloat(objLMS.score) : 0;
        var z_val = objAcomp.score !== '' && !isNaN(objAcomp.score) ? parseFloat(objAcomp.score) : 0;

        var puntajeGral = '';
        var puntajeVig = '';
        
        var lms_vig = '';
        var acomp_vig = '';

        if (objLMS.score !== '' || objAcomp.score !== '') {
           puntajeGral = ((u_val / 136) * 50) + ((z_val / 44) * 50);
           puntajeVig = puntajeGral / 5;
           
           if (objLMS.score !== '') lms_vig = parseFloat(((u_val / 136) * 20).toFixed(2));
           if (objAcomp.score !== '') acomp_vig = parseFloat(((z_val / 44) * 20).toFixed(2));

           if(isNaN(puntajeGral) || isNaN(puntajeVig)) {
              puntajeGral = '';
              puntajeVig = '';
           } else {
             puntajeGral = parseFloat(puntajeGral.toFixed(2));
             puntajeVig = parseFloat(puntajeVig.toFixed(2));
           }
        }

        var nuevaFila = filaAsig.slice(); // 1 a 19
        
        // Agregar los 38 criterios de LMS (fusionados)
        var critExpandidos = new Array(38).fill(null);
        if (objLMS.score !== '') {
            // Llenar 0-11 (Comunes)
            for (var c=0; c<12; c++) critExpandidos[c] = objLMS.crit[c] === '' ? null : objLMS.crit[c];
            
            // Llenar 12-15 (Virtual) o 16-19 (Presencial)
            if (isVirtual) {
               for (var c=12; c<16; c++) critExpandidos[c] = objLMS.crit[c] === '' ? null : objLMS.crit[c];
            } else if (isPresencial) {
               for (var c=12; c<16; c++) critExpandidos[c+4] = objLMS.crit[c] === '' ? null : objLMS.crit[c];
            }
            
            // Llenar 20-37 (Comunes - origen 16 a 33)
            for (var c=16; c<34; c++) critExpandidos[c+4] = objLMS.crit[c] === '' ? null : objLMS.crit[c];
        }

        for (var c=0; c<38; c++) {
           nuevaFila.push(critExpandidos[c]);
        }
        nuevaFila.push(lms_vig); // LMS_TOTAL (Vigesimal)

        // Agregar los 11 criterios de Acomp
        for(var c=0; c<11; c++) {
           var valAcomp = objAcomp.crit[c] !== undefined && objAcomp.crit[c] !== '' ? objAcomp.crit[c] : null;
           nuevaFila.push(valAcomp);
        }
        nuevaFila.push(acomp_vig); // ACOMP_TOTAL (Vigesimal)

        // Finales
        nuevaFila.push(puntajeGral);
        nuevaFila.push(puntajeVig);

        // ----------------------------------------------------
        // EMPUJAR METADATA DEL COORDINADOR
        // ----------------------------------------------------
        
        // 1. Expandir Timestamps LMS (38 columnas simulando la expansión 34->38)
        var tsExpandidos = new Array(38).fill(null);
        if (objLMS.score !== '' || objLMS.ts[0] !== '') {
            for (var c=0; c<12; c++) tsExpandidos[c] = objLMS.ts[c] === '' ? null : objLMS.ts[c];
            if (isVirtual) {
                for (var c=12; c<16; c++) tsExpandidos[c] = objLMS.ts[c] === '' ? null : objLMS.ts[c];
            } else if (isPresencial) {
                for (var c=12; c<16; c++) tsExpandidos[c+4] = objLMS.ts[c] === '' ? null : objLMS.ts[c];
            }
            for (var c=16; c<34; c++) tsExpandidos[c+4] = objLMS.ts[c] === '' ? null : objLMS.ts[c];
        }
        for (var c=0; c<38; c++) nuevaFila.push(tsExpandidos[c]);

        // 2. Timestamps Acompañamiento (11 cols)
        for (var c=0; c<11; c++) {
            var v = objAcomp.ts[c];
            nuevaFila.push(v === '' || v === undefined ? null : v);
        }

        // Para los KPIs de LMS, tenemos que extraer solo los índices válidos detectados durante la generación de cabeceras.
        // Simulamos la detección saltándonos los strings vacíos usando la Fila 1 guardada en la memoria, 
        // pero como aquí no la tenemos explícitamente arrastrada sin consultar, simplemente usaremos
        // la misma lógica que descarta strings vacíos asumiendo que el template se respeta.
        // Haremos un pequeño mapeo estático para las columnas maestras virtuales:
        // En virtual, KPIs 0 a 43. Los vacíos están en índices fijos (pero varían según sábana).
        // En su lugar, es más seguro simplemente empujarlos si en el origen tienen valor? 
        // No, el array debe mantener longitud fija alineada con las cabeceras.
        
        // Para simplificar, empujamos los mismos índices no vacíos detectados de las hojas:
        // En `generarCabecerasSabanaGeneral`, ignorábamos los vacíos. Pero en `sincronizarSabanaBI` también tenemos que ignorarlos.
        // Usaremos la longitud del array: 
        var tempKpiLMS = objLMS.kpi;
        for (var c=0; c<44; c++) {
            // Asumiremos que si la hoja base LMS (Row 1) tiene texto, es válido. 
            // Para proteger el layout, pasaremos todo (se omite lógicamente el de cabecera vacía, pero 
            // no podemos leer Row 1 desde aquí sin hacer un App.getActiveSheet() pesado).
            // Para empujar FIJO: solo pusimos columnas en Sábana donde `code !== ""`.
            // Los espacios comunes son indices: 12 (103), 25 (115), 34 (124). Pero para no adivinar, 
            // inyectaremos TODO el array y luego lo limpiaremos en una versión refactorizada,
            // pero por velocidad de red, extraigamos los codigos directamente de la fila 1 AQUI.
            // Para mantener performance, asumiremos que si index c === vacío, lo empujamos y ya. 
            // ESPERA: En cabeceras, hice `if (code !== '') fila1.push(code)`. La nuevaFila quedará más pequeña.
            // Es vital que empuje EXACTAMENTE los mismos datos.
        }
        // Inyectar KPIs LMS omitiendo los de título vacío
        for (var c=0; c<44; c++) {
            if (String(kpiCodesVirtual[c]).trim() !== '') {
                var valKpi = tempKpiLMS[c] !== undefined && tempKpiLMS[c] !== '' ? tempKpiLMS[c] : null;
                nuevaFila.push(valKpi);
            }
        }

        // Lo mismo para Acomp
        for (var c=0; c<8; c++) {
            if (String(kpiCodesAc[c]).trim() !== '') {
                var valKpiA = objAcomp.kpi[c] !== undefined && objAcomp.kpi[c] !== '' ? objAcomp.kpi[c] : null;
                nuevaFila.push(valKpiA);
            }
        }

        sabanaDatos.push(nuevaFila);
    }

    if (sabanaDatos.length > 0) {
       var lastR = hojaSabana.getLastRow();
       if (lastR >= 3) {
          hojaSabana.getRange(3, 1, lastR - 2, sabanaDatos[0].length).clearContent();
       }
       hojaSabana.getRange(3, 1, sabanaDatos.length, sabanaDatos[0].length).setValues(sabanaDatos);
    }

    // Registrar tiempo en caché para auto-actualización rápida de dashboards
    PropertiesService.getScriptProperties().setProperty('LAST_BI_SYNC', new Date().getTime().toString());

    if(ui) ui.alert("✅ Sábana BI Sincronizada exitosamente. Total registros: " + sabanaDatos.length);
  } catch(e) {
    if(ui) ui.alert("❌ Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function construirMapaResultadosParaBI(hoja, iniciarEnFila, colScore, colCritStart, colCritCount, colTsStart, colTsCount, colKpiStart, colKpiCount) {
  var mapa = {};
  if (!hoja) return mapa;

  var lr = hoja.getLastRow();
  if (lr < iniciarEnFila) return mapa;

  var numFilas = lr - iniciarEnFila + 1;
  var colIds = hoja.getRange(iniciarEnFila, 16, numFilas, 1).getValues(); // Col P
  var colScores = hoja.getRange(iniciarEnFila, colScore, numFilas, 1).getValues();
  
  var critMatrix = [];
  if (colCritStart && colCritCount) {
    critMatrix = hoja.getRange(iniciarEnFila, colCritStart, numFilas, colCritCount).getValues();
  }

  // 1. Extraer Timestamps
  var tsMatrix = [];
  if (colTsStart && colTsCount) {
      tsMatrix = hoja.getRange(iniciarEnFila, colTsStart, numFilas, colTsCount).getValues();
  }

  // 2. Extraer KPIs
  var kpiMatrix = [];
  if (colKpiStart && colKpiCount) {
      kpiMatrix = hoja.getRange(iniciarEnFila, colKpiStart, numFilas, colKpiCount).getValues();
  }

  for (var i = 0; i < numFilas; i++) {
    // Normalizar ID de la Hoja Hija cruda: Mayúsculas, sin espacios
    var rawIdStr = String(colIds[i][0]).toUpperCase().trim();
    if (rawIdStr !== '' && rawIdStr !== 'UNDEFINED' && rawIdStr !== 'NULL') {
       
       // MAGIA REGEX: Despiezar IDs fusionados (Ej. P_X_01P_X_02)
       // Extrae todos los fragmentos que empiezan con 'P' seguidos de números/letras/guiones_bajos
       var idsLimpiosArr = rawIdStr.match(/P[0-9A-Z_]+/g);
       
       if (idsLimpiosArr && idsLimpiosArr.length > 0) {
           var filaCrit = critMatrix.length > i ? critMatrix[i] : new Array(colCritCount).fill('');
           
           var sumaCriterios = 0;
           for(var c = 0; c < filaCrit.length; c++) {
              if(filaCrit[c] !== '' && !isNaN(filaCrit[c])) sumaCriterios += Number(filaCrit[c]);
           }

           var puntajeHoja = colScores[i][0];
           // Rescate Automático de Fórmula Rota (Si la Excel no mandó score, el backend lo suma manual)
           var puntajeFinal = (puntajeHoja !== '' && !isNaN(puntajeHoja) && Number(puntajeHoja) > 0) 
                              ? puntajeHoja 
                              : (sumaCriterios > 0 ? sumaCriterios : '');

           // Extraer filas para metadatos, controlando límites
           var filaTs = tsMatrix.length > i ? tsMatrix[i] : (colTsCount ? new Array(colTsCount).fill('') : []);
           var filaKpi = kpiMatrix.length > i ? kpiMatrix[i] : (colKpiCount ? new Array(colKpiCount).fill('') : []);

           // Agregamos el paquete de resultados a TODOS LOS IDS extraídos de esa celda maldita
           for (var j = 0; j < idsLimpiosArr.length; j++) {
              var splitId = idsLimpiosArr[j];
              mapa[splitId] = {
                 score: puntajeFinal,
                 crit: filaCrit,
                 ts: filaTs,
                 kpi: filaKpi
              };
           }
       }
    }
  }
  return mapa;
}

/**
 * ======================================================================
 * FUNCION DE DIAGNOSTICO DE CADENAS MATRICIALES (SOLO DEBUG)
 * ======================================================================
 * Analiza un ID rebelde (ej. P202602PL0102CU2693) buscando retornos de carro
 * o bytes invisibles que engañan al comparador.
 */
function diagnosticarIDsOcultos() {
  var idRebeldeBuscar = "P202602PL0102CU2693"; // Parte de un curso de RAMIREZ HOYOS
  Logger.log("--- INICIANDO DIAGNÓSTICO DE ID REBELDE: " + idRebeldeBuscar + " ---");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaVirtual = ss.getSheetByName(SHEET_MAP['VIRTUAL']);
  var hojaPresencial = ss.getSheetByName(SHEET_MAP['PRESENCIAL']);

  var escrutador = function(hoja, nombreHoja) {
    if(!hoja) return;
    var lr = hoja.getLastRow();
    if(lr < 3) return;
    var idsOrigen = hoja.getRange(3, 16, lr - 2, 1).getValues();
    
    for (var i = 0; i < idsOrigen.length; i++) {
      var rawString = String(idsOrigen[i][0]);
      if (rawString.indexOf(idRebeldeBuscar) !== -1) {
         Logger.log("\n[!] ENCONTRADO EN HOJA: " + nombreHoja + " (Fila " + (i+3) + ")");
         Logger.log("Texto Crudo (Raw): [" + rawString + "]");
         Logger.log("Longitud Cruda: " + rawString.length);
         Logger.log("--- Desglose de Bytes ---");
         for (var c = 0; c < rawString.length; c++) {
            Logger.log("Char '" + rawString.charAt(c) + "' -> CharCode: " + rawString.charCodeAt(c));
         }
         var idLimpio = rawString.toUpperCase().trim().replace(/[\r\n\t]/g, '');
         Logger.log("Texto Saneado Total: [" + idLimpio + "] -> Longitud: " + idLimpio.length);
      }
    }
  };

  escrutador(hojaVirtual, "LMS-virtual");
  escrutador(hojaPresencial, "LMS-presencial");
  Logger.log("\n--- FIN DEL DIAGNÓSTICO ---");
}
