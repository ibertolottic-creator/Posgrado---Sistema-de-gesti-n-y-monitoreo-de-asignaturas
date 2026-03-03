const fs = require('fs');
const file = 'c:/Users/ibert/OneDrive/Documentos/pruebas antigravity/GeneradorDoc.gs';
let content = fs.readFileSync(file, 'utf8');

const constantsToAdd = \
const TEMPLATE_ID_PRESENCIAL = '1y56u-BrA811KJWQOeMfydoCKTc_OvquZLvOV5QNudmo';
const DESTINATION_FOLDER_ID_PRESENCIAL = '1w4JhB3uklqB4E-rhkpGntCj5blQvJY4y';
\;

// Insert after DESTINATION_FOLDER_ID_VIRTUAL
if (!content.includes('TEMPLATE_ID_PRESENCIAL')) {
  content = content.replace(
    /const DESTINATION_FOLDER_ID_VIRTUAL = '.*?';/,
    match => match + '\\n' + constantsToAdd
  );
}

const funcToAdd = \

/**
 * Genera la Ficha Presencial en formato Google Docs
 * y guarda la URL generada en la columna ED (Url_ficha).
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
        periodoFecha = \\\\/\\\\;
      } else {
        periodoFecha = startDate;
      }
    }

    // Fecha Ficha (Hoy)
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const anio = hoy.getFullYear();
    const fechaFicha = \\\\/\/\\\\;

    // Preparar el nuevo Título del Documento
    const docTitle = \\\FICHA DE OBSERVACIÓN PARA SISTEMA DE GESTIÓN DEL APRENDIZAJE (LMS)- PRESENCIAL_\_\_\\\\;

    // Prevenir Duplicados: Eliminar archivo anterior si existe
    const existingUrl = grades['Url_ficha'];
    if (existingUrl && typeof existingUrl === 'string' && existingUrl.includes('/d/')) {
        try {
            const match = existingUrl.match(/\\/d\\/(.*?)\\//);
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

    // Reemplazos de Texto Dinámico para Presencial (prefijo cp_)
    const keysToReplace = [
      'cp_1_1_pre', 'cp_1_2_s1',
      'cp_2_1_b', 'cp_2_1_s1', 'cp_2_1_s2', 'cp_2_1_s3', 'cp_2_1_s4',
      'cp_2_2_b', 'cp_2_2_s1', 'cp_2_2_s2', 'cp_2_2_s3', 'cp_2_2_s4',
      'cp_3_1_s1', 'cp_3_2_s2', 'cp_3_3_s4',
      'cp_4_1_s4',
      'cp_5_1_s1', 'cp_5_1_s2', 'cp_5_1_s3', 'cp_5_1_s4',
      'cp_5_2_s1', 'cp_5_2_s2', 'cp_5_2_s3', 'cp_5_2_s4',
      'cp_6_1_s1', 'cp_6_1_s2', 'cp_6_1_s3', 'cp_6_1_s4',
      'cp_7_1_s1', 'cp_7_1_s2', 'cp_7_1_s3', 'cp_7_1_s4',
      'cp_8_1_s4', 'cp_8_2_s4',
      'total_score'
    ];

    keysToReplace.forEach(k => {
      const val = (grades[k] !== undefined && grades[k] !== null) ? grades[k] : '';
      body.replaceText(\\\{{{\}}}\\\, String(val));
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
      'PRESENCIAL'
    );

    if (!saveResult.success) {
      Logger.log('Advertencia: Se generó el doc Presencial pero falló guardando en DB: ' + saveResult.message);
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
\;

if (!content.includes('function generateDocPresencial')) {
  content += funcToAdd;
}

fs.writeFileSync(file, content);
console.log('Presencial logic added automatically');
