Estado del Proyecto: LMS Auditoría Docente
Fecha: 3 de Marzo de 2026
Versión: 5.0 (Consolidación, Envío Masivo y Arquitectura de Inicio)

1. Resumen Técnico
   Se ha implementado la Fase 4 completa, además de las actualizaciones previas (Fase 3 enfocadas en seguridad y asignación masiva de carga). El hito actual es la estabilización del seguimiento docente en vivo:

- **Autenticación y Roles:** El sistema ahora lee la hoja `Datos de los coordinadores` (columna G para correo, F para rol, J para nombres). Los usuarios no registrados reciben el rol transitorio de "Invitado".
- **Restricciones de Invitado:** Los invitados solo tienen acceso de lectura. La interfaz bloquea opcionalmente los botones de guardar calificación y desactiva el envío de correos, mostrando advertencias ("Acceso Limitado").
- **Módulo de Asignación de Carga (Fase 3.1):** Se creó `View_Assignment.html`, accesible única y exclusivamente por usuarios con rol "Jefe de área" (o "Admin"). Se lee directamente desde la fila 2 para extraer las asignaturas.
- **Dashboard Visual (NUEVO):** En la parte superior del módulo de asignación se añadió un gráfico circular interactivo (Chart.js) que muestra de inmediato la "Distribución de Carga". Junto a este, aparecen tarjetas de resumen (KPI) para cada coordinador (incluyendo a los Jefes de área) ilustrando la cantidad exacta de asignaturas y alumnos a su cargo.
- **Filtrado Dinámico:** Al hacer clic en la tarjeta de resumen de un coordinador, la lista se filtra de inmediato para mostrar las asignaturas que tiene asignadas. También puede filtrar manualmente por programa (Columna C), nombre de curso, o nombre de docente.
- **Auto-asignación de Jefatura:** Los perfiles de "Jefe de área" ahora aparecen listados (marcados con una ⭐ en el menú desplegable) permitiendo que coordinen sus propias asignaturas si lo requieren.
- **Asignación Masiva por Programa (Fase 3.2):** Se integró una barra morada dedicada a la asignación en lote. Permite elegir un Programa Institucional específico y un Responsable, y mediante el botón "Asignar Todos", transfiere en un solo instante toda la carga académica de ese programa al Jefe/Coordinador seleccionado.
- **Sincronización Integrada y Mantenimiento (LMS Core):** Se añadieron botones de "Importar Matriz" y "Sincronizar Plataformas" al gestor de asignaciones. Estos ejecutan wrappers seguros (`runImportAndSyncWebApp`, `runSyncAllWebApp`) hacia los scripts nativos `ImportacionExterna.gs` y `SincronizacionIntern.gs`. Además, se implementó un sistema de `MAINTENANCE_MODE` global que bloquea instántaneamente el sistema durante actualizaciones para prevenir corrupciones.
- **Bloqueo Anti-Concurrencia (Backend):** La función de guardado implementa `LockService` asegurando la consistencia de datos ante colisiones.
- **Envío de Correos Inteligente (Fase 3.4):** Se optimizó la lógica de comunicación para que al enviar un reporte o felicitación, automáticamente se concatenen en el destinatario ("Para") los correos del Docente (primario y secundario), el correo del Coordinador asignado a esa asignatura específica, y el correo institucional del Área respectiva. Esta concatenación ocurre de forma transparente en la UI, mitigando riesgos de configuración en el servidor al reutilizar la funcionalidad nativa de envíos masivos.
- **Badge Contextual de Sede (Fase 3.4):** La interfaz Home ahora detecta en tiempo real (vía `getSpreadsheetInfo()`) el nombre de la base de datos conectada (Spreadsheet activo). Inserta dinámicamente una etiqueta visual (Badge) indicando si se está trabajando sobre la matriz de "PREGRADO" (color azul) o "POSGRADO" (color morado), brindando certeza contextual inmediata al usuario.
- **Panel de Supervisión Global para Invitados:** Los usuarios tipo "Invitado" ahora pueden visualizar exclusivamente las métricas agregadas globales, manteniéndose bloqueado el acceso al detalle de calificación y al envío de correos.
- **Tolerancia a Fallos en Enlaces (Fix):** Se integró un sistema de rescate (fallback) en App Script para la extracción de "Accesos Directos". Si la hoja de cálculo pierde el formato "RichText" de las aulas virtuales, el sistema leerá el texto plano y forzará la creación algorítmica de enlaces funcionales.
- **Tolerancia a Códigos Fusionados (NUEVO):** El motor principal de cruces de datos (`GeneradorBI.gs` y `GeneradorResultados.gs`) ahora emplea Expresiones Regulares (`.match(/P[0-9A-Z_]+/g)`) para despiezar celdas de Asignación malformadas (ej. dos códigos de curso pegados en uno solo `P2026..._v01P2026..._v02`). De esta forma extrae de manera limpia todas las calificaciones subyacentes sin generar blancos.
- **Autosuma de Rescate (Fallback):** Se inyectó una lógica preventiva matemática en los generadores. Si el sistema detecta que un docente tiene rúbricas calificadas pero el puntaje total llega vacío por culpa de una fórmula del Excel rota (Daño colateral recurrente de combinar celdas en el LMS), el backend asume el cálculo, suma las notas una a una por su cuenta y genera el score total automáticamente.
- **Corrección de Layout UI:** Se ajustó la estructuración de la vista de "Asignación de carga a coordinadores" eliminando etiquetas conflictivas, asegurando que los botones de Sincronización Global permanezcan estrictamente confinados y ocultos si el usuario se encuentra navegando fuera de su jurisdicción.

- **Módulo de Acompañamiento del Desempeño Pedagógico (Fase 4):** Se desarrolló un nuevo ecosistema independiente con un dashboard propio (`View_Dashboard_Acomp.html`).
  - **Lógicas Temporales:** Semáforo configurado estrictamente a 31 días (plomo > azul > amarillo 22-28 > naranja 29-31 > rojo pasado el plazo).
  - **Cálculo Dinámico Base 20:** El promedio se calcula en tiempo real únicamente sobre los criterios que ya han sido calificados, manteniendo la viabilidad estadística (escala 1 a 4 convertida a 20).
  - **Protección de Interfaz (UI Lock):** Al guardar una calificación, el selector se bloquea visualmente con un factor de transparencia hasta que Google Sheets confirme el guardado, previniendo dobles ingresos accidentales.
  - **Comunicaciones y WhatsApp:** Rediseño del modal de correos con plantillas automatizadas (`CONGRATULATE` puro para notas de 20 y `REPORT` que lista las deficiencias si hay notas de 1 o 2). Se habilitó la derivación automática de estos textos hacia la API web de WhatsApp.
  - **Refactorización Estructural UI (Final):** La burbuja de "Guardando..." fue extraída en un componente flotante independiente (`save-indicator-acomp`) garantizando su visibilidad exclusiva sobre el dashboard nuevo. Adicionalmente, las reglas lógicas matemáticas de Felicitar (20) y Reportar (1/2) aplican una estricta exclusión mutua para impedir colisiones visuales.
  - **Generación de Fichas Oficiales (Acompañamiento):** Se implementó `generateDocAcomp()` que clona la plantilla base, y reemplaza campos clave devolviendo la URL.
  - **Motor Global de Fichas (Fase 6 Finalizada):** Se expandió el motor `GeneradorDoc.gs` para los módulos académicos.
    - Se crearon las funciones `generateDocVirtual()` y `generateDocPresencial()`.
    - Generan dinámicamente el documento en una carpeta de Drive centralizada cruzando las columnas del 1 al 4 para las Semanas 1 a 4.
    - El Frontend (`JS_Client.html`) ahora rastrea el progreso "Global". Solo cuando un docente virtual o presencial llega al 100% de Evaluación en sus 4 semanas, se activa el botón azul de "Generar Ficha Doc". Al procesarlo, interconecta con la `Url_ficha` guardándola nativamente en la Hoja respectiva para que quede una constancia incrustada.

- **Arquitectura Visual de Inicio (Fase 5):** Rediseño total de `View_Home.html`.
  - Se habilitó **Scroll nativo** (`overflow-y-auto`) permitiendo la escala infinita de módulos.
  - El menú principal ahora se categoriza en tres vertientes visuales escalonadas (animación tipo Cascada):
    1. **Área Operativa:** Módulos transaccionales de uso diario (Virtual, Presencial, Acompañamiento, Consolidación).
    2. **Área de Gestión:** Modulo "Asignación de carga" encapsulado, exclusivo para cuentas Jefatura.
    3. **Área Estratégica y Análisis:** Interfaces preparadas ("En Desarrollo") para minería de datos de Docentes y Coordinadores.
- **Módulo de Consolidación y Envío Masivo (Fase 5):**
  - Nuevo ecosistema backend (`GeneradorResultados.gs`) que clona en la RAM a través de `LockService` todas las variables del sistema para combinarlas de forma multi-dimensional sin corromper la base de datos de producción.
  - Endpoint `sincronizarResultadosGenerales()` lee el índice de la pestaña principal ("Asignación de coordinador"), extrae los nombres en bruto, rastrea sus IDs tanto en "LMS-virtual" o "LMS-presencial" y extrae adicionalmente la nota Base 20 de "Acompañamiento".
  - **Reconocimiento de Usuario y Filtrado:** El módulo ahora identifica a la sesión activa (`getGlobalSessionData()`) y visualiza su correo en la cabecera del módulo. La lógica del backend filtra automáticamente la base de datos para devolver únicamente las filas asignadas a dicho Responsable (Columna S en Módulo Asignación), salvo que se cuente con rol Admin.
  - Interfaz de tabla de datos interactiva (`View_Resultados.html` y `JS_Resultados.html`) equipada con estado temporal (Loader) previniendo que la pantalla se congele durante el renderizado asíncrono.
  - **Corrección Visual de Tabla (DataTables):** Se refactorizó la estructura del `<thead/>` haciendo uso de celdas con salto `rowspan="2"` para garantizar compatibilidad total e inyección correcta de iconos por parte de la librería DataTables, eliminando cualquier desfase entre el encabezado y el contenido mostrado.
  - **Reingeniería de 33 Columnas (Fase 5.1):** Se expandió el motor de consolidación para mapear y estructurar 33 columnas de información.
    - **Cálculo Vigesimal Dinámico:** El backend ahora extrae el puntaje parcial de LMS (sobre 136) y Acompañamiento (sobre 44) e inyecta su respectivo ponderado vigesimal (Base 20) al momento de la consolidación en columnas independientes.
    - **Píldoras de Avance (%):** Se agregó la cuantificación porcentual de cuántos criterios se han calificado versus el total posible. En el frontend se dibuja como una _etiqueta o pastilla (Badge)_ que cambia en 5 niveles de color pastel desde el rosa (0-10%) hasta el verde (100%).
    - **Algoritmo Extractor "Criterios a Mejorar":** Se desarrolló un escáner lógico dentro de `GeneradorResultados.gs` que al momento de evaluar filas pregunta: _"¿Esta celda tiene calificación 1 o 2?"_. En caso afirmativo, asciende directamente a la Fila 2 (donde habitan los nombres descriptivos de la rúbrica), y captura la oración completa (Ej: _"Mantiene empatía..."_).
    - **Renderizado UI de Deficiencias:** El backend inyecta todos estos conceptos bajos en formato de texto separado por comas hacia el frontend `JS_Resultados.html`. Allí se divide el array y se inyecta en el DOM en forma de mini-etiquetas rojas de Bootstrap (Pill Badges) permitiendo al Coordinador detectar la falencia específica en un solo golpe de vista de la tabla.

- **Subsistema de Inteligencia de Negocios (Data Mart BI):**
  - **Generación de Cabeceras Dinámicas:** Nueva funcionalidad (`generarCabecerasSabanaGeneral()` en `GeneradorBI.gs`) que escanea las matrices "Virtual", "Asignación" y "Acompañamiento", y ensambla automáticamente 68 columnas (IDs técnicos + Nombres descriptivos) en la nueva hoja `Sábana General Docente`.
  - **Motor de Consolidación Base 20:** El backend (`sincronizarSabanaBI()`) unifica todas las evaluaciones de un docente. Cruza las notas matemáticas crudas de LMS (ej. puntaje base 136) y Acompañamiento (ej. puntaje base 44), y transfiere ambos totales transformados explícitamente a Base Vigesimal (Máx 20) dentro del Data Mart.
  - **Cálculo de Fórmula Final:** Se procesa matemáticamente la ecuación final requerida `((50*LMS)/136) + ((50*ACOMP)/44)` para inyectar el Score Centesimal en la sábana física, permitiendo integración directa con Looker Studio o Power BI.
  - **Arquitectura Unificada (Columnas Expandidas):** Se resolvió el solapamiento de identidades de criterios. La sábana se expande paramétricamente a 38 columnas LMS (separando las 4 exclusivas de Virtual [Tutorías] y las 4 de Presencial [Evaluaciones/Asistencia]). Las celdas incompatibles con la jurisdicción de cada docente se inyectan como estrictamente nulas (`null`), garantizando limpieza absoluta al conectarse con herramientas estadísticas (PowerBI / Looker Studio). Los 11 Criterios de "Acompañamiento Pedagógico" aplican el mismo concepto de transitoriedad y nulidad.

2. Estructura de Archivos (Google Apps Script)

- **Code.gs:** Lógica backend, funciones `getGlobalSessionData()`, `getAssignmentData()` y `saveAssignment()`.
- **Index.html:** Controles del flujo inicial, loader (`initial-auth-loader`) y Toast UI.
- **View_Home.html:** Contiene tarjeta de entrada al módulo de Asignación y módulos académicos.
- **View_Assignment.html:** Módulo frontend exclusivo para la Jefatura.
- **View_Dashboard_Acomp.html / JS_Acompanamiento.html:** Interfaces y controladores dedicados al seguimiento docente (Fase Acompañamiento).
- **JS_Client.html:** Lógica principal de renderizado, validación de estado de `isGuest`.
- **JS_Tracking.html / JS_Templates.html:** Controles auxiliares de analíticas y correos.
- **Documentacion_Tecnica.md:** (Mantenida).

3. Pasos para Continuar

- **Implementación:** Realiza una nueva implementación como "Aplicación Web" (Nueva versión).
- **Verificación:**
  - Ingresar y observar el toast de bienvenida "Autenticando usuario...".
  - Validar la funcionalidad del panel de `Acompañamiento`.
  - Probar el bloqueo de UI temporal guardando una calificación lenta.
  - Verificar envíos de Whatsapp con cuentas conectadas.
  - **NUEVO:** Probar la sincronización en vivo del padrón "Envío de Resultados Generales" dando clic al botón "Actualizar Datos". Revisar que la interfaz proteja a otros coordinadores vía `LockService`.
  - Proporcionar la plantilla oficial para el envío masivo de correos (Fase final de reportes).

¡El sistema Fase 5 está listo para ser validado por la Jefatura!
