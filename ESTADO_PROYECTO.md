# Estado del Proyecto: Sistema de Monitoreo USMP

**Fecha de Última Actualización:** 30 de Marzo de 2026
**Versión:** 2.3.1 (Corrección Sincronización Acompañamiento)

---

## 1. Resumen General del Sistema

Sistema de **Monitoreo del Cumplimiento de los Estándares de Calidad** construido como una SPA (Single Page Application) en Google Apps Script. Permite a coordinadores evaluar asignaturas, generar fichas docentes, enviar resultados y analizar métricas de desempeño.

- **Arquitectura:** Serverless (Google Workspace). Frontend SPA con HTML/JS/Tailwind CSS. Backend en GAS.
- **Base de Datos:** Google Sheets como matriz relacional.
- **Autenticación:** Implícita mediante `Session.getActiveUser().getEmail()`.
- **Roles:** Admin, Jefe de área, Coordinador, Invitado.
- **Concurrencia:** `LockService.getScriptLock()` para operaciones de escritura.

---

## 2. Estructura de Archivos (26 archivos en Apps Script)

### Backend (.gs) — 9 archivos

| #   | Archivo                   | Responsabilidad                                                                                                                                                                                                                                                  |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Code.gs`                 | **Controlador principal** (931 líneas). `doGet()`, `include()`, `getGlobalSessionData()`, `getInitialData()`, `saveGrade()`, `trackAccess()`, `getHeaders()`. Detecta columnas dinámicamente. Filtro de seguridad por email del coordinador (Col S).             |
| 2   | `GeneradorDoc.gs`         | Motor de clonado de Fichas Docentes. `generateDocVirtual()`, `generateDocPresencial()`, `generateDocAcomp()`. Usa plantillas Google Docs con variables `{{}}` y RegEx. Regla estricta: solo genera si 100% completado en 4 semanas.                              |
| 3   | `GeneradorResultados.gs`  | Consolidación multidimensional (33 columnas). `sincronizarResultadosGenerales()`, `getConsolidatedData()`. Cruza DNI entre hojas Virtual/Presencial/Acomp. Calcula vigesimal, % avance, y extrae criterios deficientes (notas 1-2) como texto descriptivo.       |
| 4   | `GeneradorBI.gs`          | Generador de la Sábana General Docente (72 columnas). `generarCabecerasSabanaGeneral()` ensambla headers. `sincronizarSabanaBI()` cruza Asignación+LMS+Acomp. Segrega criterios exclusivos Virtual (Tutorías) vs Presencial (Evaluaciones). Convierte a Base 20. |
| 5   | `Backend_BI.gs`           | **(NUEVO v2.0)** Endpoint `getSabanaBIData()`. Lee Sábana (Fila 1=códigos, Fila 3+=datos). Determina modalidad con Col D + Col N. Retorna datos para KPIs y gráficos Chart.js.                                                                                   |
| 6   | `Menu.gs`                 | Menú personalizado en Google Sheets para ejecutar sincronizaciones y generaciones desde la interfaz de la hoja.                                                                                                                                                  |
| 7   | `ImportacionExterna.gs`   | Pipeline de importación. Conecta a hoja externa por ID, copia datos crudos a "Todo Matr".                                                                                                                                                                        |
| 8   | `Backend_Coordinadores.gs` | **(NUEVO v2.3)** Data Lake de Coordinadores. `getMetricasCoordinadores()`. Extrae aulas crudas de la Sábana, separa tiempos LMS (`audit_time_s`) vs Acomp (`a_audit_time`), y ráfagas (`audit_burst` vs `a_audit_burst`). |
| 9   | `SincronizacionIntern.gs` | Distribuye data de "Asignación de coordinador" a hojas "LMS-virtual" y "LMS-presencial" según modalidad. Activa `MAINTENANCE_MODE` durante el proceso.                                                                                                           |

### Frontend (.html) — 17 archivos

| #   | Archivo                     | Responsabilidad                                                                                                                                                                                                       |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | `Index.html`                | Punto de entrada. Incluye todos los views/scripts vía `<?!= include() ?>`. Safety hide del módulo BI en `window.onload`. Carga `getGlobalSessionData()` al iniciar.                                                   |
| 10  | `CSS.html`                  | Tailwind CSS CDN + Font Awesome 6.4 + Chart.js + Google Fonts (Inter). Estilos custom: semáforos, loaders, animaciones.                                                                                               |
| 11  | `View_Home.html`            | Pantalla principal con 3 áreas: **Operativa** (Virtual, Presencial, Acompañamiento, Resultados), **Gestión** (Asignación), **Estratégica** (BI Docentes, BI Coordinadores).                                           |
| 12  | `View_Dashboard.html`       | Dashboard LMS (Virtual/Presencial). Sidebar con lista de cursos, panel de detalle con semáforos semanales (S1-S4), barra de progreso, leyenda de calificación (1-4), accesos directos a Aulas Virtuales.              |
| 13  | `View_Dashboard_Acomp.html` | Dashboard de Acompañamiento Pedagógico. 11 criterios en modelo de 31 días. Semáforo dinámico por plazos (0-21 azul, 22-28 amarillo, 29-31 naranja, >31 rojo bloqueado).                                               |
| 14  | `View_Dashboard_BI.html`    | **(NUEVO v2.0)** Dashboard BI con **inline styles** (no depende de Tailwind para layout). Header fijo con botón retorno + filtro + actualizar. 4 KPI cards (grid 4 cols). 2 gráficos Chart.js (grid 2 cols).          |
| 15  | `View_Assignment.html`      | Asignación de coordinadores (exclusivo Jefatura). Gráfico Chart.js de distribución de carga. Asignación masiva por programa. Dashboard KPI por coordinador.                                                           |
| 16  | `View_Resultados.html`      | Consolidación y envío masivo. DataTables con 33 columnas, checkboxes de selección, Pills de colores para deficiencias.                                                                                                |
| 17  | `View_Modal.html`           | Modal de correos (Felicitar/Reportar). Plantillas HTML con firma institucional. CC automático al coordinador y jefatura según sede.                                                                                   |
| 18  | `JS_Client.html`            | **Controlador principal frontend**. `loadModule()`, `goHome()`, `renderOverview()`, `renderCriteria()`, `save()`, `getCourseVigesimal()`. Routing de todos los módulos. Semaforización. Control de invitados.         |
| 19  | `JS_Acompanamiento.html`    | Controlador autónomo de Acompañamiento. Motor Base 20 asimétrico (no penaliza vacíos). UI Lock System. Botones Felicitar/Reportar mutuamente exclusivos.                                                              |
| 20  | `JS_Resultados.html`        | Controlador de Resultados. Init DataTables, procesamiento de consolidado, envío masivo de correos con PDFs adjuntos. Filtro por coordinador.                                                                          |
| 21  | `JS_BI.html`                | **(NUEVO v2.0)** Controlador BI. `mostrarModuloBI()`, `cargarDataSabanaBI()`, `renderBiDashboard()`, `renderChartDistribucion()`, `renderPanelDinamicoExclusivo()`. Usa `style.display` para show/hide (bulletproof). |
| 22  | `JS_Coordinadores.html`     | **(NUEVO v2.3)** Controlador del módulo Coordinadores. Map-Reduce en cliente sobre Data Lake. Nav Tabs (`CURRENT_TAB`). Formato horario `formatMinutes()`. Gráficos Chart.js dinámicos.                               |
| 23  | `View_Dashboard_Coordinadores.html` | **(NUEVO v2.3)** UI Full-Width del módulo Coordinadores. KPIs macro, grid de gráficas, tabla DataTables, modales informativos (`coordInfoModal`).                                                           |
| 24  | `JS_Templates.html`         | Plantillas HTML de correo (Monitoreo + Acompañamiento). Firma adaptativa Pregrado/Posgrado.                                                                                                                           |
| 25  | `JS_Tracking.html`          | Analítica. `logAccess()` para hits AP/USMP. `logInteraction()` para emails/WhatsApp. Cálculo de semana según días transcurridos.                                                                                      |

---

## 3. Hojas de Cálculo (Base de Datos)

| Pestaña                                                | Función                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `Sistema de gestión del aprendizaje (LMS)- virtual`    | Datos de asignaturas virtuales. Criterios `c_1_1` a `c_*_*`. Timestamps `_ts`. |
| `Sistema de gestión del aprendizaje (LMS)- presencial` | Datos de asignaturas presenciales. Criterios `cp_1_1` a `cp_*_*`.              |
| `Acompañamiento del desempeño Pedagógico`              | 11 criterios de supervisión. Timestamps `_T`. Reloj de 31 días.                |
| `Asignación de coordinador`                            | Matriz maestra (19 cols). Col S = Coordinador asignado.                        |
| `Datos de los coordinadores`                           | Roles y permisos de usuarios del sistema.                                      |
| `Envío de resultados y fichas`                         | Consolidado de 33 columnas para envío masivo.                                  |
| `Sábana General Docente`                               | Data Mart BI (72 cols). Fila 1=Códigos, Fila 2=Títulos, Fila 3+=Datos.         |

---

## 4. Reglas de Negocio Críticas

### Seguridad y Concurrencia

- **Filtrado por Rol:** Backend filtra filas por email del coordinador (Col S). Admin ve todo.
- **Anti-Colisión:** `LockService.getScriptLock()` en `saveGrade()`. Cerrojo temporal obligatorio.
- **UI Lock:** `pointer-events-none` + `opacity-50` al guardar. No permite doble clic.

### Evaluación y Calificación

- **Escala Interna:** 1 (Deficiente) a 4 (Muy Bueno).
- **Vigesimal Asimétrico:** Promedio Base 20 NO penaliza celdas vacías. Solo divide entre máximo posible de criterios calificados.
- **Exclusión Mutua:** Botones "Felicitar" (nota 20) y "Reportar" (deficiencias) nunca coexisten.
- **Regla 4 Semanas:** Generar Ficha Doc solo se habilita al 100% de evaluación completa.

### Módulo BI — Modalidad (v2.0)

- **Col D** (índice 3) = "Modalidad" → indica "Virtual" o "Presencial".
- **Col N** (índice 13) = "Tipo de metodología" → indica "Híbrida" o vacío.
- **Virtual/Híbrida** (criterios tutorías `c_3_1_s1..s4`): Col D = "Virtual" **O** Col N = "Híbrida".
- **Presencial** (criterios evaluaciones `cp_3_1_s1`, `cp_3_2_s2`, `cp_3_3_s4`, `cp_4_1_s4`): Col D = "Presencial" **Y** Col N ≠ "Híbrida".

### Comunicaciones

- **CC Automático:** Correo del coordinador + jefatura según sede (Pregrado/Posgrado).
- **Plantillas:** HTML con color rojo institucional. Remitente: "Acompañamiento docente USMP Virtual".
- **Periodo:** Formateado como `MM-yyyy` vía `Utilities.formatDate()`.

---

## 5. Cambios de la Sesión Actual (13 Mar 2026)

### Bugs Corregidos

1. ✅ `ReferenceError: include is not defined` → `Code.gs` restaurado de Git (931 líneas)
2. ✅ `doGet()` faltante → Restaurado en `Code.gs`
3. ✅ BI visible debajo del Home → `style="display:none"` inline + JS safety en `window.onload`
4. ✅ `goHome()` usaba `d-none` (Bootstrap inexistente) → Corregido a `style.display='none'`
5. ✅ `goHome()` no restauraba Home → Ahora limpia `style.display=''` en `home-view`
6. ✅ Promedios BI mostraban "-" → Headers corregidos a códigos reales (`SCORE_VIG`, `LMS_TOTAL`)
7. ✅ Filtro Presencial vacío → Detección de modalidad por Col D + Col N

### Archivos Creados/Modificados

| Archivo                  | Acción     | Commit    |
| ------------------------ | ---------- | --------- |
| `Backend_BI.gs`          | CREADO     | `e4bc65c` |
| `View_Dashboard_BI.html` | CREADO     | `e4bc65c` |
| `JS_BI.html`             | CREADO     | `e4bc65c` |
| `Code.gs`                | RESTAURADO | `e4bc65c` |
| `Index.html`             | MODIFICADO | `e4bc65c` |
| `JS_Client.html`         | MODIFICADO | `e4bc65c` |
| `View_Home.html`         | MODIFICADO | `e4bc65c` |

---

## 5.1 Cambios de la Sesión Actual (27 Mar 2026)

### Correcciones y Mejoras en Dashboard BI
1. **Filtro Modalidad Virtual/Híbrida:** Se corrigió un bug lógico silente en `JS_BI.html` donde el uso erróneo de la constante `DIMENSIONES_TODAS` provocaba un quiebre (`TypeError`) al seleccionar el filtro "Virtual / Híbrida", congelando visualmente la pantalla en la vista "Presencial".
2. **Radar de Acompañamiento Granular (11 Puntos):** El gráfico de araña de Acompañamiento Pedagógico ahora dibuja de forma independiente los 11 criterios específicos en lugar de limitarse a promediar 3 grandes dimensiones (Inicio/Desarrollo/Cierre), con lógica de auto-wrapping y truncado inteligente para los nombres extensos.
3. **Leyendas sin Límite (Full Text):** Se removió el truncamiento forzado de texto CSS (`text-overflow: ellipsis`) en las nomenclaturas de todos los gráficos del Dashboard BI, habilitando contenedores Flexbox multi-línea (`wrap`). 
4. **Nombres Completos Oficiales:** Se programó el array maestro `NOMBRES_COMPLETOS_ACOMP` con la transcripción exacta y literal de los 11 ejes de evaluación de acompañamiento (Ej. "Desarrollo de capacidades cognitivas" en lugar de "Capac. Cognitivas"), superponiendo su lectura sobre la metadata abreviada provista por el backend.
5. **Módulo de Exportación Individual a PDF:** Se inyectó la librería estándar `html2pdf.js` y se adjuntó un botón interactivo de "Descargar PDF" sobre el reporte "Desempeño Detallado por Programa". Genera dinámicamente un documento A4 renderizando nativamente la tabla filtrada y devolviendo la interfaz a su estado original sin artefactos impresos.

---

## 5.2 Cambios de la Sesión Actual (Refactorización Módulo Coordinadores)

### Arquitectura Data Lake y UI Modular
1. **Migración Backend (`Backend_Coordinadores.gs`):** Se eliminó el motor de pre-cálculo de reducciones (promedios) en el servidor. Ahora se despacha la data cruda completa por cada asignatura (Data Lake). Esto elimina los cuellos de botella de procesamiento de Google Apps Script y traslada el esfuerzo al cliente.
2. **Pestañas Dinámicas (Nav Tabs):** Se construyó un sistema en `JS_Coordinadores.html` de filtrado visual ultra-rápido mediante `CURRENT_TAB`. Permite aislar la interfaz entre **"LMS"** y **"Acompañamiento"**, adaptando `DataTables` y `Chart.js` instantáneamente.
3. **Precisión de Tiempos:** Se independizó la sumatoria de minutos de evaluación, leyendo directamente los cálculos semanales pre-procesados de la base de datos (`audit_time_s...` y `a_audit_time...`), y se formateó el texto a formato horario natural (ej. `2h 15m`).
4. **Separación de Tráfico (Burst Audits):** Las auditorías relacionales (`a_audit_burst`) de modo presencial/síncrono ahora existen como variables independientes, garantizando la política de "Tolerancia Cero de Ruido" al saltar entre pestañas.

---

## 5.3 Cambios de la Sesión Actual (30 Mar 2026)

### Correcciones Críticas de Sincronización
1. **Fallo en Extracción de Hoja (Bug):** Se resolvió un error bloqueante en la sincronización del módulo de Acompañamiento Pedagógico generado por el llamado a una hoja inexistente (`Acompañamiento al desempeño docente Pedagógico`). 
2. **Corrección de Referencias:** Se actualizó la referencia en texto duro al nombre correcto de la pestaña (`Acompañamiento del desempeño Pedagógico`) en `SincronizacionIntern.gs` (función `sincronizarAcompanamiento`) y `Code.gs` (funciones `runSyncAllWebApp` y `runImportAndSyncWebApp`). Esto restablece la función remota "Sincronizar TODO".

---

## 6. Pasos para la Próxima Sesión

1. ~~**Módulo Coordinadores:** Implementar "Análisis de Resultados de Coordinadores" (botón placeholder activo).~~ ✅ COMPLETADO v2.3
2. **Validar Tiempos LMS en Producción:** Confirmar que `audit_time_s1..s4` producen sumas exactas en el formato `Xh Ym`.
3. **Validar Ráfagas Acomp en Producción:** Confirmar que `a_audit_burst4`, `a_audit_burst9` se cuentan correctamente en pestaña Acompañamiento.
4. **Testing General:** Probar que los demás módulos (Virtual, Presencial, Acompañamiento, Resultados, Asignación, BI Docentes) siguen funcionando correctamente.
5. **Considerar:** Agregar exportación CSV/Excel del Data Lake de Coordinadores para análisis externo.

---

## 7. Pasos para Desplegar Cambios

1. Abrir proyecto en `script.google.com`
2. Verificar/actualizar: `Code.gs`, `Index.html`, `JS_Client.html`, `View_Home.html`
3. Crear/actualizar archivos del módulo BI: `Backend_BI` (.gs), `View_Dashboard_BI` (.html), `JS_BI` (.html)
4. Crear/actualizar archivos del módulo Coordinadores: `Backend_Coordinadores` (.gs), `View_Dashboard_Coordinadores` (.html), `JS_Coordinadores` (.html)
5. **Implementar** > **Nueva implementación** > Aplicación web
6. Ejecutar como: "Yo" | Acceso: "Cualquier usuario de la organización"
7. Probar: Home → clic en "Análisis de Resultados de Docentes" → verificar KPIs y gráficos
8. Probar: Home → clic en "Análisis de Gestión de Coordinadores" → verificar pestañas LMS/Acomp
9. Probar: Cambio de pestañas → verificar que columnas y gráficos se ocultan/muestran correctamente
10. Probar: Filtros Programa/Coordinador → verificar que la tabla y KPIs se recalculan sin recarga
