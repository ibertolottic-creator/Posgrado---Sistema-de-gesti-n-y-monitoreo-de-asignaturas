const fs = require('fs');
const file = 'c:/Users/ibert/OneDrive/Documentos/pruebas antigravity/GeneradorDoc.gs';
let content = fs.readFileSync(file, 'utf8');

const marker = '/**\r\n * Genera la Ficha Virtual en formato Google Docs';
const marker2 = '/**\n * Genera la Ficha Virtual en formato Google Docs';

let idx = content.indexOf(marker);
if (idx === -1) idx = content.indexOf(marker2);

if (idx !== -1) {
    content = content.substring(0, idx);
}

const correctFunction = \/**
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
    const docTitle = \\\FICHA DE OBSERVACIÓN PARA SISTEMA DE GESTIÓN DEL APRENDIZAJE (LMS)- VIRTUAL_\_\_\\\\;

    // Prevenir Duplicados
    const existingUrl = grades['Url_ficha'];
    if (existingUrl && typeof existingUrl === 'string' && existingUrl.includes('/d/')) {
        try {
            const match = existingUrl.match(/\\\/d\\\/([^\\/]+)\\\//);
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

    body.replaceText('{{Asignatura}}', courseName || '');
    body.replaceText('{{Nombre docente}}', professor || '');
    body.replaceText('{{Programa}}', program || '');
    body.replaceText('{{Semestre}}', periodoFecha);
    body.replaceText('{{Fecha_Ficha}}', fechaFicha);

    const keysToReplace = [
      'c_1_1_pre', 'c_1_2_s1',
      'c_2_1_b', 'c_2_1_s1', 'c_2_1_s2', 'c_2_1_s3', 'c_2_1_s4',
      'c_2_2_b', 'c_2_2_s1', 'c_2_2_s2', 'c_2_2_s3', 'c_2_2_s4',
      'c_3_1_s1', 'c_3_1_s2', 'c_3_1_s3', 'c_3_1_s4',
      'c_4_1_s1', 'c_4_1_s2', 'c_4_1_s3', 'c_4_1_s4',
      'c_4_2_s1', 'c_4_2_s2', 'c_4_2_s3', 'c_4_2_s4',
      'c_5_1_s1', 'c_5_1_s2', 'c_5_1_s3', 'c_5_1_s4',
      'c_6_1_s1', 'c_6_1_s2', 'c_6_1_s3', 'c_6_1_s4',
      'c_7_1_s4', 'c_7_2_s4',
      'total_score'
    ];

    keysToReplace.forEach(k => {
      const val = (grades[k] !== undefined && grades[k] !== null) ? grades[k] : '';
      body.replaceText(\\\{{{\}}}\\\, String(val));
    });

    doc.saveAndClose();

    const fileUrl = newFile.getUrl();

    const saveResult = saveGrade(
      rowIndex,
      'Url_ficha',
      fileUrl,
      'VIRTUAL',
      'VIRTUAL'
    );

    if (!saveResult.success) {
      Logger.log('Advertencia: Falló guardando en DB: ' + saveResult.message);
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
}\;

fs.writeFileSync(file, content + correctFunction);
console.log('Fixed successfully');
