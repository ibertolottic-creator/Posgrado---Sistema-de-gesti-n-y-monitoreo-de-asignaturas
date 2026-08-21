# Estado del Proyecto: Sistema de Monitoreo USMP - Posgrado

**Fecha de Última Actualización:** 21 de Agosto de 2026  
**Versión:** 2.8.0 (Exportación PDF Matriz Consolidada, Integración Sheets y Precisión Decimal 1:1 con BI)

---

## 1. Resumen General del Sistema

Sistema de **Monitoreo del Cumplimiento de los Estándares de Calidad (Posgrado)** construido como una SPA (Single Page Application) en Google Apps Script. Permite a coordinadores y jefaturas evaluar asignaturas de maestrías y doctorados, registrar Acompañamiento Pedagógico, generar fichas docentes, enviar resultados y analizar métricas de desempeño mediante dashboards ejecutivos de Business Intelligence.

---

## 2. Principales Mejoras y Correcciones Recientes (v2.7.0)

### A. Trazabilidad y Asignación de Hits Aula
1. **Ruteo Estricto de Semana en `trackAccess`**:
   - El cliente envía la semana activa de evaluación (`currentWeekId`), garantizando que los accesos realizados durante la etapa de inicio/Semana 1 se guarden en `hits_s1_ap` / `hits_s1_usmp`.
2. **Reasignación Automática en Backend**:
   - En `Backend_Coordinadores.gs`, si existen hits en columnas de semanas posteriores (S2, S3 o S4) pero esas semanas aún no tienen registros de evaluación (semanas no iniciadas/evaluadas), los hits se consolidan automáticamente en la **Semana 1**.
3. **Herramienta en Menú de Google Sheets**:
   - En `Menu.gs` se integró la opción `🔄 Sincronización -> 🎯 Reubicar Hits de prueba a Semana 1` (`corregirHitsSemana1()`), permitiendo con 1 clic limpiar las columnas de S2 y S3 y consolidarlas físicamente en la columna S1 de la hoja.

### B. Tiempo Absoluto LMS (Clustering y Exclusión de Tiempos Muertos)
1. **Sesiones Activas Continuas ($\Delta t \le 20\text{ min}$)**:
   - Se calcula la suma neta del tiempo transcurrido entre acciones consecutivas dentro de un intervalo $\le 20$ minutos.
2. **Exclusión Estricta de Tiempos Muertos ($> 30\text{ min}$)**:
   - Toda pausa o inactividad superior a 30 minutos se **descarta al 100%**.
   - Al retomarse la actividad, se inicia una nueva sesión de trabajo sumando únicamente el tiempo base estimado por acción (2 minutos).
3. **Pausas intermedias ($> 20\text{ min}$ y $\le 30\text{ min}$)**:
   - Se tratan como cierre de sesión activa e inicio de un nuevo bloque (+2 min base).

### C. Precisión en el Avance de Monitoreo LMS (100% vs 97%)
1. **Doble Validación (Calificaciones + Timestamps)**:
   - `Backend_Coordinadores.gs` evalúa tanto las columnas de notas (`c_...`, `cp_...`) como las columnas de auditoría (`c_..._ts`, `cp_..._ts`), consolidando el arreglo `eval_lms_w`.
   - Se resolvió la discrepancia donde cursos evaluados al 100% figuraban al 97% ($33/34$) debido a ausencia de timestamp en un único criterio o variaciones de cierre.
2. **Umbrales Semanales y de Ciclo**:
   - S1 (Bienvenida + Semana 1): Meta de 11 criterios evaluados = 100%.
   - S2: Meta de 7 criterios = 100%.
   - S3: Meta de 7 (Virtual) / 6 (Presencial) = 100%.
   - S4: Meta de 9 (Virtual) / 10 (Presencial) = 100%.
   - Ciclo Completo (General): $\ge 34$ criterios evaluados o puntaje LMS consolidado con $\ge 33$ criterios = 100%.

### D. Blindaje de Seguridad y Control de Acceso por Rol (Row-Level Security)
1. **Bloqueo Estricto de Usuarios Invitados**:
   - `getInitialData` rechaza con `UNAUTHORIZED` a cualquier usuario que no esté registrado como Coordinador, Jefe o Admin en `Datos de los coordinadores`.
2. **Filtro de Fila Exclusivo para Coordinadores**:
   - En *Acompañamiento Pedagógico*, *Virtual* y *Presencial*, un coordinador solo recibe los cursos asignados a su correo (Col S) o a su nombre (Col R). Los cursos de otros coordinadores quedan completamente invisibles.
3. **Validación de Propiedad en Escritura (`saveGrade`)**:
   - Se valida en backend que el usuario que intenta calificar sea el coordinador asignado a la fila o un Administrador/Jefe. Si un usuario intenta enviar una nota a un curso no asignado, la petición se bloquea con `Acceso denegado`.

### E. Consolidación de Resultados, Exportación PDF y Descarga Excel XLSX (v2.8.0)
1. **Exportación a PDF de toda la Matriz Consolidada (`html2pdf.js`)**:
   - Botón `Descargar PDF` con diseño institucional en la cabecera del módulo *Envío de Resultados y Fichas*.
   - Genera un documento horizontal (*landscape* A4) con membrete oficial USMP Virtual, fecha/hora de emisión, conteo de asignaturas, resumen multidimensional y badges de estado.
2. **Descarga Directa en Excel (.xlsx) (`exportarExcelMatrizConsolidada`)**:
   - Botón `Descargar Excel` con ícono verde institucional (`fa-solid fa-file-excel`) en la cabecera.
   - Genera dinámicamente un archivo nativo Microsoft Excel (`.xlsx`) mediante **SheetJS** con anchos de columna automáticos, tipificación numérica adecuada (scores con 2 decimales, porcentajes de avance enteros) y fallback transparente a formato CSV UTF-8 con BOM.
3. **Corrección de Precisión Decimal y Consistencia 1:1 con BI**:
   - Lectura numérica exacta `getValues()` en `GeneradorResultados.gs` y formato `.setNumberFormat("0.00")` para preservar los decimales reales (ej. `17.35`, `15.82`).
   - Alineación total con el cálculo vigesimal de BI (`(sL + sA) / 2`).


