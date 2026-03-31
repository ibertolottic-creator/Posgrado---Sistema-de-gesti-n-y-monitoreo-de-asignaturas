// ==========================================
// MÓDULO: GENERADOR DE FICHAS (GOOGLE DOCS)
// ==========================================

const TEMPLATE_ID_ACOMP = '1SHN8DqCzahmtfE9xEgcUj9UZAoZ_4GqtX6AfpVVeOpE';
const DESTINATION_FOLDER_ID = '1lsW7oxzJFdm6K5883_JnCVoj1HVb2T0m';

const TEMPLATE_ID_VIRTUAL = '15mTMCq1FZHwZwBKOnBAPReZfjpl-L4Kq84vFz4vXiPU';
const DESTINATION_FOLDER_ID_VIRTUAL = '1gWE1NEjp8fDeCpB6SzRTSH6Z5XQe6FHu';

const TEMPLATE_ID_PRESENCIAL = '1y56u-BrA811KJWQOeMfydoCKTc_OvquZLvOV5QNudmo';
const DESTINATION_FOLDER_ID_PRESENCIAL = '1gWE1NEjp8fDeCpB6SzRTSH6Z5XQe6FHu';

/**
 * Genera la Ficha de Acompañamiento en formato Google Docs partiendo de una plantilla
 * y guarda la URL generada en la columna "BE" (Url_ficha) de la base de datos.
 *
 * @param {Object} courseData Datos del curso evaluado y sus notas (grades)
 * @returns {Object} { success: boolean, url: string, message?: string }
 */
function generateDocAcomp(courseData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    // 1. Validaciones básicas
    if (!courseData || !courseData.rowIndex) {
      return { success: false, message: 'Faltan datos de la fila del curso.' };
    }

    const { rowIndex, courseName, professor, program, startDate, grades } = courseData;

    // 2. Extraer o calcular Semestre (Periodo fecha)
    // El formato solicitado es MM/YYYY basado en la fecha de inicio (startDate)
    let periodoFecha = 'Periodo no definido';
    if (startDate) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0'); // Añade 0 a la izquierda (ej. 02)
        periodoFecha = `${month}/${year}`;
      } else {
        periodoFecha = startDate; // Backup fallback
      }
    }

    // 3. Fecha Ficha (Hoy)
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const anio = hoy.getFullYear();
    const fechaFicha = `${dia}/${mes}/${anio}`;

    // 4. Preparar el nuevo Título del Documento
    const docTitle = `FICHA DE OBSERVACIÓN DEL ACOMPAÑAMIENTO DEL DESEMPEÑO PEDAGÓGICO_${courseName}_${professor}_${periodoFecha}`;

    // 4.5. Prevenir Duplicados: Eliminar archivo anterior si existe
    const existingUrl = grades['Url_ficha'];
    if (existingUrl && typeof existingUrl === 'string' && existingUrl.includes('/d/')) {
      try {
        // Extraer el ID de la URL típica de Google Docs: https://docs.google.com/document/d/ALPHANUMERIC_ID/edit
        const match = existingUrl.match(/\/d\/(.*?)\//);
        if (match && match[1]) {
          const oldFileId = match[1];
          const oldFile = DriveApp.getFileById(oldFileId);
          oldFile.setTrashed(true);
        }
      } catch (delErr) {
        // Ignorar el error si el archivo ya fue borrado manualmente o no hay permisos
        Logger.log('No se pudo borrar el archivo anterior (posiblemente ya no existe): ' + delErr);
      }
    }

    // 5. Copiar la plantilla a la carpeta destino
    const templateFile = DriveApp.getFileById(TEMPLATE_ID_ACOMP);
    const destFolder = DriveApp.getFolderById(DESTINATION_FOLDER_ID);
    const newFile = templateFile.makeCopy(docTitle, destFolder);
    const newDocId = newFile.getId();

    // 6. Abrir y mutar el documento
    const doc = DocumentApp.openById(newDocId);
    const body = doc.getBody();

    // Reemplazos de Texto (Metadatos)
    body.replaceText('{{Asignatura}}', courseName || '');
    body.replaceText('{{Nombre docente}}', professor || '');
    body.replaceText('{{Programa}}', program || '');
    body.replaceText('{{Tema}}', grades['Tema'] || '');
    body.replaceText('{{Semestre}}', periodoFecha);
    body.replaceText('{{Periodo fecha}}', periodoFecha); // Por si se usó la vieja llave
    body.replaceText('{{Fecha_Ficha}}', fechaFicha);

    // Reemplazos de Texto (Puntajes 1 al 4)
    body.replaceText('{{A_C01_OBJ}}', grades['A_C01_OBJ'] || '');
    body.replaceText('{{A_C02_SAB}}', grades['A_C02_SAB'] || '');
    body.replaceText('{{A_C03_CCO}}', grades['A_C03_CCO'] || '');

    body.replaceText('{{B_C04_CON}}', grades['B_C04_CON'] || '');
    body.replaceText('{{B_C05_APL}}', grades['B_C05_APL'] || '');
    body.replaceText('{{B_C06_EST}}', grades['B_C06_EST'] || '');
    body.replaceText('{{B_C07_REC}}', grades['B_C07_REC'] || '');
    body.replaceText('{{B_C08_COM}}', grades['B_C08_COM'] || '');
    body.replaceText('{{B_C09_CAP}}', grades['B_C09_CAP'] || '');

    body.replaceText('{{C_C10_EVA}}', grades['C_C10_EVA'] || '');
    body.replaceText('{{C_C11_EXT}}', grades['C_C11_EXT'] || '');

    body.replaceText('{{PT}}', grades['PT'] || '0');
    body.replaceText('{{Opor_Mejora}}', grades['Opor_Mejora'] || '-Ninguna-');

    // Guardar Documento para asegurarnos de que persisten los cambios antes de extraer URL
    doc.saveAndClose();

    // 7. Generar respuesta con la URL pública
    const fileUrl = newFile.getUrl();

    // 8. Guardar la URL en la Hoja de "Acompañamiento" (Columna BE: Url_ficha)
    const saveResult = saveGrade(
      rowIndex,
      'Url_ficha',
      fileUrl,
      'ACOMPANAMIENTO',
      'ACOMPANAMIENTO'
    );

    if (!saveResult.success) {
      // Log failed save attempt but don't crash the PDF generator return
      Logger.log('Advertencia: Se generó el doc pero falló guardando en DB: ' + saveResult.message);
    }

    return {
      success: true,
      url: fileUrl,
      docId: newDocId,
    };
  } catch (e) {
    return { success: false, message: 'Error generando documento: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Genera la Ficha Virtual en formato Google Docs
 * y guarda la URL generada en la columna ED (Url_ficha).
 */
function generateDocVirtual(courseData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    if (!courseData || !courseData.rowIndex) {
      return { success: false, message: 'Faltan datos de la fila del curso.' };
    }

    const { rowIndex, courseName, professor, program, startDate, grades } = courseData;

    // Extraer o calcular Semestre (Periodo fecha) MM/YYYY
    let periodoFecha = 'Periodo no definido';
    if (startDate) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        periodoFecha = `${month}/${year}`;
      } else {
        periodoFecha = startDate;
      }
    }

    // Fecha Ficha (Hoy)
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const anio = hoy.getFullYear();
    const fechaFicha = `${dia}/${mes}/${anio}`;

    // Preparar el nuevo Título del Documento
    const docTitle = `FICHA DE OBSERVACIÓN PARA SISTEMA DE GESTIÓN DEL APRENDIZAJE (LMS)- VIRTUAL_${courseName}_${professor}_${periodoFecha}`;

    // Prevenir Duplicados: Eliminar archivo anterior si existe
    const existingUrl = grades['Url_ficha'];
    if (existingUrl && typeof existingUrl === 'string' && existingUrl.includes('/d/')) {
      try {
        const match = existingUrl.match(/\/d\/(.*?)\//);
        if (match && match[1]) {
          const oldFileId = match[1];
          const oldFile = DriveApp.getFileById(oldFileId);
          oldFile.setTrashed(true);
        }
      } catch (delErr) {
        Logger.log('No se pudo borrar el archivo anterior (Virtual): ' + delErr);
      }
    }

    // Copiar la plantilla a la carpeta destino VIRTUAL
    const templateFile = DriveApp.getFileById(TEMPLATE_ID_VIRTUAL);
    const destFolder = DriveApp.getFolderById(DESTINATION_FOLDER_ID_VIRTUAL);
    const newFile = templateFile.makeCopy(docTitle, destFolder);
    const newDocId = newFile.getId();

    // Abrir y mutar el documento
    const doc = DocumentApp.openById(newDocId);
    const body = doc.getBody();

    // Reemplazos de Texto (Metadatos)
    body.replaceText('{{Asignatura}}', courseName || '');
    body.replaceText('{{Nombre docente}}', professor || '');
    body.replaceText('{{Programa}}', program || '');
    body.replaceText('{{Semestre}}', periodoFecha);
    body.replaceText('{{Fecha_Ficha}}', fechaFicha);

    // Reemplazos de Texto Dinámico
    const keysToReplace = [
      'c_1_1_pre',
      'c_1_2_s1',
      'c_2_1_b',
      'c_2_1_s1',
      'c_2_1_s2',
      'c_2_1_s3',
      'c_2_1_s4',
      'c_2_2_b',
      'c_2_2_s1',
      'c_2_2_s2',
      'c_2_2_s3',
      'c_2_2_s4',
      'c_3_1_s1',
      'c_3_1_s2',
      'c_3_1_s3',
      'c_3_1_s4',
      'c_4_1_s1',
      'c_4_1_s2',
      'c_4_1_s3',
      'c_4_1_s4',
      'c_4_2_s1',
      'c_4_2_s2',
      'c_4_2_s3',
      'c_4_2_s4',
      'c_5_1_s1',
      'c_5_1_s2',
      'c_5_1_s3',
      'c_5_1_s4',
      'c_6_1_s1',
      'c_6_1_s2',
      'c_6_1_s3',
      'c_6_1_s4',
      'c_7_1_s4',
      'c_7_2_s4',
      'total_score',
    ];

    keysToReplace.forEach((k) => {
      const val = grades[k] !== undefined && grades[k] !== null ? grades[k] : '';
      body.replaceText(`{{${k}}}`, String(val));
    });

    // Guardar Documento para asegurarnos de que persisten los cambios
    doc.saveAndClose();

    // Generar respuesta con la URL pública
    const fileUrl = newFile.getUrl();

    // Guardar la URL en la Hoja Virtual
    const saveResult = saveGrade(rowIndex, 'Url_ficha', fileUrl, 'VIRTUAL', 'VIRTUAL');

    if (!saveResult.success) {
      Logger.log(
        'Advertencia: Se generó el doc Virtual pero falló guardando en DB: ' + saveResult.message
      );
    }

    return {
      success: true,
      url: fileUrl,
      docId: newDocId,
    };
  } catch (e) {
    return { success: false, message: 'Error generando documento Virtual: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Genera la Ficha Presencial en formato Google Docs
 * y guarda la URL generada en la columna ED (Url_ficha) de la base de datos Presencial.
 */
function generateDocPresencial(courseData) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    if (!courseData || !courseData.rowIndex) {
      return { success: false, message: 'Faltan datos de la fila del curso.' };
    }

    const { rowIndex, courseName, professor, program, startDate, grades } = courseData;

    // Extraer o calcular Semestre (Periodo fecha) MM/YYYY
    let periodoFecha = 'Periodo no definido';
    if (startDate) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        periodoFecha = `${month}/${year}`;
      } else {
        periodoFecha = startDate;
      }
    }

    // Fecha Ficha (Hoy)
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const anio = hoy.getFullYear();
    const fechaFicha = `${dia}/${mes}/${anio}`;

    // Preparar el nuevo Título del Documento
    const docTitle = `FICHA DE OBSERVACIÓN PARA SISTEMA DE GESTIÓN DEL APRENDIZAJE (LMS)- PRESENCIAL_${courseName}_${professor}_${periodoFecha}`;

    // Prevenir Duplicados: Eliminar archivo anterior si existe
    const existingUrl = grades['Url_ficha'];
    if (existingUrl && typeof existingUrl === 'string' && existingUrl.includes('/d/')) {
      try {
        const match = existingUrl.match(/\/d\/(.*?)\//);
        if (match && match[1]) {
          const oldFileId = match[1];
          const oldFile = DriveApp.getFileById(oldFileId);
          oldFile.setTrashed(true);
        }
      } catch (delErr) {
        Logger.log('No se pudo borrar el archivo anterior (Presencial): ' + delErr);
      }
    }

    // Copiar la plantilla a la carpeta destino PRESENCIAL
    const templateFile = DriveApp.getFileById(TEMPLATE_ID_PRESENCIAL);
    const destFolder = DriveApp.getFolderById(DESTINATION_FOLDER_ID_PRESENCIAL);
    const newFile = templateFile.makeCopy(docTitle, destFolder);
    const newDocId = newFile.getId();

    // Abrir y mutar el documento
    const doc = DocumentApp.openById(newDocId);
    const body = doc.getBody();

    // Reemplazos de Texto (Metadatos)
    body.replaceText('{{Asignatura}}', courseName || '');
    body.replaceText('{{Nombre docente}}', professor || '');
    body.replaceText('{{Programa}}', program || '');
    body.replaceText('{{Semestre}}', periodoFecha);
    body.replaceText('{{Fecha_Ficha}}', fechaFicha);

    // Reemplazos de Texto Dinámico (prefijo cp_)
    const keysToReplace = [
      'cp_1_1_pre',
      'cp_1_2_s1',
      'cp_2_1_b',
      'cp_2_1_s1',
      'cp_2_1_s2',
      'cp_2_1_s3',
      'cp_2_1_s4',
      'cp_2_2_b',
      'cp_2_2_s1',
      'cp_2_2_s2',
      'cp_2_2_s3',
      'cp_2_2_s4',
      'cp_3_1_s1',
      'cp_3_2_s2',
      'cp_3_3_s4',
      'cp_4_1_s4',
      'cp_5_1_s1',
      'cp_5_1_s2',
      'cp_5_1_s3',
      'cp_5_1_s4',
      'cp_5_2_s1',
      'cp_5_2_s2',
      'cp_5_2_s3',
      'cp_5_2_s4',
      'cp_6_1_s1',
      'cp_6_1_s2',
      'cp_6_1_s3',
      'cp_6_1_s4',
      'cp_7_1_s1',
      'cp_7_1_s2',
      'cp_7_1_s3',
      'cp_7_1_s4',
      'cp_8_1_s4',
      'cp_8_2_s4',
      'total_score',
    ];

    keysToReplace.forEach((k) => {
      const val = grades[k] !== undefined && grades[k] !== null ? grades[k] : '';
      body.replaceText(`{{${k}}}`, String(val));
    });

    // Guardar Documento para asegurarnos de que persisten los cambios
    doc.saveAndClose();

    // Generar respuesta con la URL pública
    const fileUrl = newFile.getUrl();

    // Guardar la URL en la Hoja Presencial
    const saveResult = saveGrade(
      rowIndex,
      'Url_ficha',
      fileUrl,
      'PRESENCIAL',
      'PRESENCIAL' // Sirve de moduleKey y weekKey interno dummy para que pase al Switch de Code.gs
    );

    if (!saveResult.success) {
      Logger.log(
        'Advertencia: Se generó el doc Presencial pero falló guardando en DB: ' + saveResult.message
      );
    }

    return {
      success: true,
      url: fileUrl,
      docId: newDocId,
    };
  } catch (e) {
    return { success: false, message: 'Error generando documento Presencial: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}
