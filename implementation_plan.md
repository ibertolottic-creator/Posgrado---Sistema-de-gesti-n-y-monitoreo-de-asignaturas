# Plan de Implementación - Módulo de Envío Masivo de Resultados

## 1. Persistencia de "Fecha de Envío" en el Backend (Columna AH en Resultados)

- **Archivo**: `GeneradorResultados.gs`
- **Cambios y Análisis Crítico**:
  - **El Problema**: La función `sincronizarResultadosGenerales` recrea y sobreescribe constantemente la hoja `Envío de resultados y fichas`. Si solo agregamos una columna estática (AH = Col 34), cuando los cursos cambien o se reordenen, las fechas quedarán desalineadas.
  - **La Solución**:
    1. Antes de ejecutar `clearContent()`, el script leerá las columnas P (ID) y AH (Fecha Envío) actuales de la hoja `Envío de resultados y fichas`.
    2. Creará un diccionario en memoria (`mapaFechasEnvio`), mapeando cada `ID` a su respectiva `fechaEnvio`.
    3. Durante el bucle de reconstrucción de `resultadosFinales`, inyectará la fecha preexistente en el índice 33 (Columna 34) si el ID coincide.
    4. Se ampliará la escritura/borrado de 33 a **34 columnas** (`getRange(..., 34)`).
  - Crear función remota `enviarCorreosResultadosMasivos(idArray)`:
    - Iterará sobre las filas de `Envío de resultados y fichas`.
    - Procesará los envíos y estampará un `new Date()` en la columna AH (Índice 34) para registrar que ya se notificó.

## 2. Lógica del Frontend (Tabla y Selecciones)

- **Archivos**: `GeneradorResultados.gs` (getConsolidatedData), `JS_Resultados.html`
- **Cambios**:
  - Modificar `getConsolidatedData()` para extraer la Columna 34 como `fechaEnvio`.
  - En `JS_Resultados.html` `renderResultadosTable`, inyectar:
    1. `<input type="checkbox">` al inicio de cada fila.
    2. Columna textual o visual de **"Estado Envío"** (mostrando la fecha o "Pendiente").
  - **Lógica de Habilitación & Selección Automática**:
    - Condiciones para habilitar el Checkbox:
      `lmsAvance == 100` && `acompAvance == 100` && `lmsUrl != ""` && `acompUrl != ""` && `fechaEnvio == ""`
    - Si se cumple todo lo anterior, el Checkbox debe estar habilitado.
    - Para que esté **marcado (checked) por defecto**, debe pertenecer al coordinador logueado: `coordinadorEmail === currentUserEmail`.
  - Implementar el evento del botón `btnEnviarCorreos` que compile los IDs de las filas seleccionadas (checked) y llame a `google.script.run.enviarCorreosResultadosMasivos(ids)`.

## 3. Lógica de Plantillas (Plantillas Oficiales)

- **Archivo**: `JS_Templates.html` o directo en el Backend (`Code.gs` / `GeneradorResultados.gs`)
- **Cambios**:
  - Ya que el envío será masivo e iniciado por un solo botón, es más seguro componer y enviar el HTML directo en el **Backend**.
  - Convertiremos el texto de `plantillas.txt` a funciones literales en Javascript dentro de `GeneradorResultados.gs`.
  - Reglas (basadas en Resultado General Vigesimal):
    - `< 14`: Plantilla 1 (Insuficientes - Requiere Atención).
    - `>= 14` y `< 19`: Plantilla 2 (Regulares/Buenos).
    - `>= 19`: Plantilla 3 (Excelentes - Felicitaciones).
  - Las plantillas incluirán variables inyectadas: `{{Docente}}`, `{{Asignatura}}`, `{{Centro}}`, notas individuales, y URLS adjuntas usando `MailApp.sendEmail()`.

## 4. Pruebas y Post-Implementación

- Ejecutar en el entorno local pruebas unitarias verificando que los checkbox se bloqueen para % menores a 100.
- Verificar visualmente la visualización de Etiquetas y la persistencia del Timestamp.
