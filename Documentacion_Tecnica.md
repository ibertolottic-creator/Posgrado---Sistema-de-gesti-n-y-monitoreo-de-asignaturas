# Manual de Referencia Técnica: Sistema de Monitoreo USMP

Este documento contiene la especificación completa y detallada de cada componente, función y flujo lógico del sistema. Está diseñado para permitir a un desarrollador replicar la aplicación desde cero.

---

## 1. Arquitectura de la Base de Datos (Google Sheets)

El sistema utiliza una hoja de cálculo como backend. Para replicar el proyecto, se deben crear las siguientes pestañas con estructuras específicas.

### 1.1 Pestañas de Datos (LMS)

Se requieren tres hojas organizadas en estructura para almacenar los datos de cada modalidad:

- **Nombre Hoja 1:** `Sistema de gestión del aprendizaje (LMS)- virtual`
- **Nombre Hoja 2:** `Sistema de gestión del aprendizaje (LMS)- presencial`
- **Nombre Hoja 3:** `Acompañamiento del desempeño Pedagógico` (Fase 4 - Exclusivo para revisión docencial en escala del 1 al 4, 11 criterios).

#### Estructura de Columnas (Crucial)

El sistema **detecta dinámicamente** las columnas, pero espera cierta estructura base:

- **Meta-Data (A-R):** Información administrativa (N°, Grado, Programa, etc.).
- **Columna S (19) - "Asignación de COORDINADOR ACADÉMICO":** Usada para filtrar la vista por usuario (seguridad a nivel de fila).
- **Columna T (20) - "Periodo fecha" (o similar):** Fecha de inicio del curso (`dd/mm/yyyy`). Vital para el cálculo de semanas y tracking.
- **Columnas de Criterios (A partir de la Col 22):**
  - Encabezado (Fila 1): ID Técnico (ej. `c_1_1_pre`, `cp_1_1_pre`).
  - Contenido: Notas del 1 al 4.
- **Columnas de Timestamp (Ocultas):**
  - Encabezado (Fila 1): ID Técnico + `_ts` (Para virtual/presencial) o `_T` (Para Acompañamiento, ej. `A_C01_OBJ_T`).
  - Contenido: Fecha/Hora de la última modificación almacenado como objeto `Date`.
- **Columnas de Tracking (Hits):**
  - Encabezados: `hits_s1_ap`, `hits_s1_usmp`, `hits_s2_ap`, etc.
  - Contenido: Contadores numéricos.
- **Columnas de Auditoría:**
  - Encabezados: `audit_time_s1`, `audit_burst5_s1`, etc.

---

## 2. Backend (Google Apps Script - `Code.gs`)

Este archivo contiene la lógica del servidor. A continuación, cada función explicada:

### `doGet(e)`

- **Función:** Punto de entrada de la Web App.
- **Lógica:** Carga el archivo `Index.html`, establece el título de la página y permite que se muestre en un iframe (`setXFrameOptionsMode(ALLOWALL)`).

### `include(filename)`

- **Función:** Helper para modularización.
- **Lógica:** Permite incrustar contenido de otros archivos HTML (`JS_Client`, `CSS`, etc.) dentro del `Index.html` usando `<?!= include(...) ?>`.

### `getHeaders(sheet)`

- **Función:** Detector inteligente de la estructura de la hoja.
- **Lógica:**
  - Lee las primeras **5 filas** de la hoja.
  - Busca en cada fila si existe alguna celda que contenga identificadores clave (`c_1_1`, `cp_1_1`, `hits_`).
  - **Retorna:** El índice de la fila y los valores de esa fila.
  - **Propósito:** Permite que el sistema funcione incluso si el usuario inserta filas decorativas encima de los encabezados técnicos.

### `getInitialData(moduleKey)`

- **Función:** API principal de carga de datos.
- **Lógica:**
  1.  **Selección de Hoja:** Usa `moduleKey` ('VIRTUAL' o 'PRESENCIAL') para abrir la pestaña correcta.
  2.  **Seguridad:** Verifica el email del usuario activo (`Session.getActiveUser()`).
      - Si es `ADMIN`: Carga todas las filas.
      - Si no: Filtra las filas donde la columna "Coordinador" coincide con el email del usuario.
  3.  **Mapeo de Datos y Fallbacks:** Recorre las filas y construye un arreglo de objetos `course` con:
      - `rowIndex`: Índice real en la hoja (para guardar después).
      - `grades`: Objeto con pares `id_criterio: nota`.
      - `timestamps`: Objeto con fechas de modificación (incluyendo la conversión explícita de sufijos `_T` a formato ISO string para compatibilidad de JSON).
      - `hits/audit`: Datos de tracking.
      - **Extracción de Enlaces (Robustez):** Intenta extraer la URL mediante `getRichTextValues()`. Si falla u obtiene texto plano (fallback), emplea algoritmos para interpretar columnas M/N (12/13) inyectando prefijos "https://" al vuelo si están ausentes, garantizando el despliegue de los botones AP/USMP en el Frontend.
  4.  **Retorno:** Objeto JSON con `courses`, `userEmail` y `role`. (Nota: Los invitados reciben toda la carga pero son restringidos visualmente en el frontend).

### `getSpreadsheetInfo()`

- **Función:** API auxiliar para contexto visual y comunicaciones (Fase 3.4).
- **Lógica:**
  - Ejecuta `SpreadsheetApp.getActiveSpreadsheet().getName()`.
  - **Propósito:** Provee al Frontend el nombre del archivo en tiempo real para identificar la sede conectada ("PREGRADO" o "POSGRADO") y actuar en consecuencia (mostrar Insignias en el Home y armar el correo de contacto adecuado para la sede virtual conectada).

### `saveGrade(rowIndex, criteriaId, value, weekKey, moduleKey)`

- **Función:** Guarda una nota y audita la acción.
- **Lógica Compleja:**
  1.  **Bloqueo:** Usa `LockService` para evitar condiciones de carrera (dos usuarios editando a la vez).
  2.  **Búsqueda de Columna:** Busca el índice de la columna que coincide con `criteriaId` en la fila de encabezados detectada.
  3.  **Corrección de Prefijos (Presencial):**
      - El sistema Presencial usa criterios `cp_...` pero columnas de timestamp `c_..._ts`.
      - El código detecta `cp_` y busca automáticamente la columna `c_` equivalente para guardar el timestamp.
  4.  **Escritura:** Guarda la nota (`value`) y la fecha actual (`new Date()`) en sus respectivas columnas.
  5.  **Auditoría:** Llama a `analyzeRapidFill` para verificar la velocidad de llenado.

### `trackAccess(rowIndex, type, moduleKey)`

- **Función:** Registra clics en enlaces (Hits).
- **Lógica de Fechas (Estricta):**
  1.  Busca la columna **"Periodo fecha"**.
  2.  Calcula `dias_transcurridos = Hoy - Fecha_Inicio`.
  3.  **Reglas de Negocio:**
      - `0-7 días` -> **S1**
      - `8-14 días` -> **S2**
      - `15-21 días` -> **S3**
      - `22-28 días` -> **S4**
      - `>28 días` -> **Post**
  4.  **Incremento:** Construye el nombre de la columna (ej. `hits_s1_ap`) y suma +1 al valor actual.

### `trackInteraction(rowIndex, headerName, moduleKey)`

- **Función:** Registro genérico (Emails/WhatsApp).
- **Lógica:** Recibe el nombre exacto de la columna (ej. `email_felicita_s1`), busca su índice y suma +1.

---

## 3. Frontend (HTML + JS)

### `Index.html`

- **Estructura:** Skeleton HTML con contenedores para el Dashboard (`overview-panel`) y Detalle (`detail-panel`).
- **Librerías:** Carga Tailwind CSS (diseño) y FontAwesome (iconos).

### `JS_Client.html`

Controlador de la interfaz.

- **`DOMContentLoaded` (Nuevo en 3.4):**
  - Ejecuta `fetchSpreadsheetInfo()` apenas carga la UI. Solicita al backend el nombre del documento e inserta un "Badge" o Insignia en la pantalla de Inicio de color azul o morado indicando formalmente si se consulta datos de Pregrado o Posgrado. Luego guarda esa variable de entorno (`window.SS_NAME`).
- **`loadModule(key)`:**
  - Establece la variable global `currentModule`.
  - Define `CURRENT_CRITERIA_MAP` eligiendo entre la configuración Virtual o Presencial.
  - Llama a `getInitialData`.
- **`renderOverview()`:**
  - Itera sobre `globalData.courses` para el filtrado, y las usa directamente en la barra macro global `renderDashboardStats()`.
  - **Control de Invitados:** Implementa un `return` anticipado inyectando un componente DOM (candado/bloqueo) si detecta la variable global `window.AUTH_DATA.isGuest`, permitiendo al usuario ver el progreso y promedio general en la barra superior estadística, pero encapsulando estrictamente el detalle por fila/docente.
  - Calcula el progreso visual (barras de colores) usando `getWeekStats`.
  - Calcula el promedio vigesimal usando `getCourseVigesimal`.
  - Genera las tarjetas de los cursos.
- **`setupLink(id, url, label)`:**
  - Genera los botones de "Aula Virtual" en la vista de detalle.
  - **Tracking:** Inyecta el evento `onclick="logAccess(...)"` para capturar el clic antes de abrir el enlace.
- **`renderCriteria()`:**
  - Dibuja la matriz de evaluación (botones 1-4).
  - Aplica lógica de semaforización (colores según nota).
- **`save(id, val, btn)`:**
  - Envía la nota al backend (`saveGrade`).
  - Muestra una notificación "Toast" ("Guardando...") que solo desaparece al confirmar el éxito de Google Apps Script.

### `JS_Acompanamiento.html` (FASE 4)

Interfaz y controlador autónomo para la recolección de métricas pedagógicas.

- **Motor Base 20:** Implementación matemática customizada que solo contabiliza los criterios que han sido respondidos en vivo para evitar promedios decaídos por casillas sin evaluar.
- **UI Lock System:** Utiliza inyección de clases CSS (`pointer-events-none`, `opacity-50`, `disabled`) en los selectores `<select>` para evitar colisiones asincrónicas por clics compulsivos hasta obtener la respuesta positiva del backend.
- **Visibilidad de Botones Dinámica:** Incorpora validadores estrictos en el `renderDetail` para exponer el botón de Felicitar únicamente en promedios perfectos (20) y exponer el Reporte de Deficiencias únicamente al hallar notas "1" o "2" y ocultarlos en caso contrario.

### `JS_Resultados.html` (NUEVO FASE 5)

Controlador autónomo para la vista de Consolidación General y Envío Masivo.

- **Renderizado Asíncrono de DataTable:** Intercepta la carga de la vista para llamar inmediatamente a `getConsolidatedData()`. Utiliza manipulación directa del DOM para construir la tabla HTML y posteriormente inicializa la librería DataTables.
- **Protección Visual (Loader):** Oscurece e inutiliza la pantalla mientras el Backend está escaneando las hojas para mitigar impaciencia del usuario.
- **Integración de Rutas Seguras:** Posee una función explícita interconectada al sistema de ruteo universal para regresar al Dashboard principal sin alterar el `Index.html`.

---

## 3.5. Sistema Generador de Reportes (Fase 6)

### `GeneradorDoc.gs` (Backend Autocontenido)

- **`generateDocAcomp(courseData)`:** Motor de clonado. Toma la plantilla ID, copia a la Carpeta Destino, intercepta con `DocumentApp` y realiza reemplazos matemáticos de Llaves (`{{}}`).
- **`generateDocVirtual` y `generateDocPresencial`:** Versiones iterativas que leen los arreglos nativos del Dashboard principal (reemplazando keys dinámicas como `{{cp_1_1_pre}}`). Al finalizar, insertan la URL del documento resultante de vuelta usando un bypass de `saveGrade()` apuntando al encabezado fijo `Url_ficha`.
- **Prevención de Duplicados:** Antes de generar una nueva Ficha de Google Docs oficial, el script escanea el string existente en Columna `Url_ficha` usando una RegEx y envía la variante antigua inmediatamente a la Papelera de Google Drive.

### Bloqueo de UI (`JS_Client.html` -> `updateActionButtons`)

- Se desarrolló la regla Estricta de las 4 Semanas. Antes, bastaba completar 1 semana para enviar Reporte. Ahora, para que se active la botonera azul de "Actualizar Ficha Documento Oficial", el Coordinador (Usuario `ADMIN/Jefatura`) se ve obligado a que los campos base obtengan el 100% en el cálculo de matriz completa visual del Frontend.

### `JS_Tracking.html`

Módulo de analítica.

- **`logAccess(type)`:** Intermediario. Recibe 'AP' o 'USMP' y llama al backend.
- **`logInteraction(channel, type)`:**
  - Recibe canal ('email', 'wa') y tipo ('felicita', 'reporta').
  - Combina estos datos con la semana actual (`currentWeekId`) para determinar el encabezado destino (ej. `wa_felicita_s2`).

### Envíos y Notificaciones (`View_Modal.html` / Correo)

Este sistema emplea el modal dinámico para crear las comunicaciones en base a Templates.

- **Correos Masivos y Tracking (Fase 3.4):**
  - Cuando el usuario activa un evento de comunicación (Click en Email de la semana), se despliega el modal.
  - **Lógica Inteligente de Destinatarios:** La función `openEmailModal()` no solo enlaza el correo del Docente 1 y Docente 2 alojado en el registro. De forma asíncrona pero visible, detecta el correo guardado en memoria del **Coordinador Asignado** e inserta un **4to Destinatario** (`pregrado@usmpvirtual...` o `posgrado@usmpvirtual...`) leyendo el contexto inyectado de `window.SS_NAME`.
  - Uso de Native `MailApp.sendEmail` para empujar el array concatenado final, mitigando problemas de copias ocultas y permisos con un pipeline de solo Destinatarios (To-Only) transparente.

### `JS_Templates.html`

Generador de correos.

- **`getTemplate(type, course, week)`:**
  - Contiene plantillas HTML para correos de Monitoreo General y de Acompañamiento.
  - **Lógica:**
    - Si es `CONGRATULATE`: Genera un mensaje positivo animando a seguir así.
    - Si es `REPORT`: Genera una tabla HTML listando solo los criterios con notas 1 o 2.
  - **Fallback Global de Grados:** Determina contextualmente el remitente leyendo `window.SS_NAME` e inyectando condicionalmente "Área de Pregrado" o "Posgrado" automáticamente en la firma.

---

## 3.6. Sistema de Consolidación y Envío Masivo (Fase 5)

### `GeneradorResultados.gs`

Script Backend estructurado para no interferir con `Code.gs` e independizar el ruteo de red.

- **Arquitectura de 33 Columnas (Fase 5.1):** La matriz consolidada mapea 33 parámetros de datos.
- **`sincronizarResultadosGenerales()`:** Motor de lectura multidimensional. Protegido por `LockService.getScriptLock()` con Tiempos de Espera (WaitLock de 30s).
  - Escanea la hoja madre "Asignación de coordinador".
  - Procesa la integración de datos insertando las sumas totales (LMS vs Presencial vs Acompañamiento).
  - Convierte los puntajes individuales y la nota centesimal global en Base Vigesimal dinámicamente.
  - Genera y asigna el "Nivel" corporativo (Ej. "DESTAQUE" 19-20, "DEFICIENTE" 0-10).
- **`construirMapaResultados(hoja, iniciarEnFila... )`:** Hash Mapper Auxiliar.
  - Extrae y procesa arreglos enteros para calcular el **% Avance**.
  - **Extractor de Mejoras:** Escanea el DataRange de criterios buscando valores `1` o `2`. Si encuentra coincidencia cruzada, captura el valor descriptivo de la pregunta (Localizado en la **Fila 2** de la base de datos) y retorna un listado en formato texto plano separado por comas hacia la columna principal.
- **`getConsolidatedData()`:** El endpoint API ligero. Al ser invocado por el usuario, lee los 33 valores de "Envío de resultados y fichas" combinándolos para DataTables.

---

## 4. Scripts Auxiliares (Pipeline de Datos)

Para replicar el flujo de datos completo, se necesitan estos scripts independientes:

1.  **`ImportacionExterna.gs`**:
    - Conecta a una hoja externa por ID.
    - Copia datos crudos a una hoja temporal "Todo Matr".
2.  **`generar matriz.gs`**:
    - Procesa "Todo Matr", filtra cursos cerrados o de programas inválidos y actualiza la hoja maestra "Asignación de coordinador".
3.  **`SincronizacionIntern.gs`**:
    - Toma la data de "Asignación de coordinador".
    - Distribuye a las hojas finales "LMS-virtual" y "LMS-presencial" según la modalidad del curso.

---

## 5. Pasos para Replicar el Proyecto

1.  **Crear Spreadsheet:** Crear una nueva hoja de cálculo en Google.
2.  **Estructurar Hojas:** Crear las pestañas requeridas (`Sistema de gestión...`) y rellenar la Fila 1 (o 4) con los encabezados técnicos.
3.  **Editor de Secuencias de Comandos:** Abrir Extensiones > Apps Script.
4.  **Crear Archivos:**
    - Copiar el contenido de `Code.gs` a `Code.gs`.
    - Crear archivos HTML: `Index`, `JS_Client`, `JS_Tracking`, `JS_Templates`, `CSS`, `View_Home`, `View_Dashboard`, `View_Modal`.
    - Copiar el código correspondiente a cada uno.
5.  **Implementar:**
    - Clic en "Implementar" > "Nueva implementación".
    - Tipo: "Aplicación web".
    - Ejecutar como: "Usuario que accede a la aplicación web" (CRUCIAL para que se registre el correo del coordinador).
    - Quién tiene acceso: "Cualquier persona dentro de [Organización]" o "Cualquiera" según política de seguridad.

Esta documentación cubre cada aspecto necesario para entender, mantener y reconstruir el sistema LMS de la USMP.
