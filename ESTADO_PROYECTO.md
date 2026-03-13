# Estado del Proyecto: Sistema de Monitoreo USMP
**Fecha de Última Actualización:** 13 de Marzo de 2026
**Versión:** 2.0 (Dashboard BI + Correcciones Críticas)

---

## 1. Resumen General del Sistema

Sistema de **Monitoreo del Cumplimiento de los Estándares de Calidad** construido como una SPA (Single Page Application) en Google Apps Script. Permite a coordinadores evaluar asignaturas, generar fichas docentes, enviar resultados y analizar métricas de desempeño.

- **Arquitectura:** Serverless (Google Workspace). Frontend SPA con HTML/JS/Tailwind CSS. Backend en GAS.
- **Base de Datos:** Google Sheets como matriz relacional.
- **Autenticación:** Implícita mediante `Session.getActiveUser().getEmail()`.
- **Roles:** Admin, Jefe de área, Coordinador, Invitado.
- **Concurrencia:** `LockService.getScriptLock()` para operaciones de escritura.

---

## 2. Estructura de Archivos (23 archivos en Apps Script)

### Backend (.gs) — 8 archivos

| # | Archivo | Responsabilidad |
|---|---------|----------------|
| 1 | `Code.gs` | **Controlador principal** (931 líneas). `doGet()`, `include()`, `getGlobalSessionData()`, `getInitialData()`, `saveGrade()`, `trackAccess()`, `getHeaders()`. Detecta columnas dinámicamente. Filtro de seguridad por email del coordinador (Col S). |
| 2 | `GeneradorDoc.gs` | Motor de clonado de Fichas Docentes. `generateDocVirtual()`, `generateDocPresencial()`, `generateDocAcomp()`. Usa plantillas Google Docs con variables `{{}}` y RegEx. Regla estricta: solo genera si 100% completado en 4 semanas. |
| 3 | `GeneradorResultados.gs` | Consolidación multidimensional (33 columnas). `sincronizarResultadosGenerales()`, `getConsolidatedData()`. Cruza DNI entre hojas Virtual/Presencial/Acomp. Calcula vigesimal, % avance, y extrae criterios deficientes (notas 1-2) como texto descriptivo. |
| 4 | `GeneradorBI.gs` | Generador de la Sábana General Docente (72 columnas). `generarCabecerasSabanaGeneral()` ensambla headers. `sincronizarSabanaBI()` cruza Asignación+LMS+Acomp. Segrega criterios exclusivos Virtual (Tutorías) vs Presencial (Evaluaciones). Convierte a Base 20. |
| 5 | `Backend_BI.gs` | **(NUEVO v2.0)** Endpoint `getSabanaBIData()`. Lee Sábana (Fila 1=códigos, Fila 3+=datos). Determina modalidad con Col D + Col N. Retorna datos para KPIs y gráficos Chart.js. |
| 6 | `Menu.gs` | Menú personalizado en Google Sheets para ejecutar sincronizaciones y generaciones desde la interfaz de la hoja. |
| 7 | `ImportacionExterna.gs` | Pipeline de importación. Conecta a hoja externa por ID, copia datos crudos a "Todo Matr". |
| 8 | `SincronizacionIntern.gs` | Distribuye data de "Asignación de coordinador" a hojas "LMS-virtual" y "LMS-presencial" según modalidad. Activa `MAINTENANCE_MODE` durante el proceso. |

### Frontend (.html) — 15 archivos

| # | Archivo | Responsabilidad |
|---|---------|----------------|
| 9 | `Index.html` | Punto de entrada. Incluye todos los views/scripts vía `<?!= include() ?>`. Safety hide del módulo BI en `window.onload`. Carga `getGlobalSessionData()` al iniciar. |
| 10 | `CSS.html` | Tailwind CSS CDN + Font Awesome 6.4 + Chart.js + Google Fonts (Inter). Estilos custom: semáforos, loaders, animaciones. |
| 11 | `View_Home.html` | Pantalla principal con 3 áreas: **Operativa** (Virtual, Presencial, Acompañamiento, Resultados), **Gestión** (Asignación), **Estratégica** (BI Docentes, BI Coordinadores). |
| 12 | `View_Dashboard.html` | Dashboard LMS (Virtual/Presencial). Sidebar con lista de cursos, panel de detalle con semáforos semanales (S1-S4), barra de progreso, leyenda de calificación (1-4), accesos directos a Aulas Virtuales. |
| 13 | `View_Dashboard_Acomp.html` | Dashboard de Acompañamiento Pedagógico. 11 criterios en modelo de 31 días. Semáforo dinámico por plazos (0-21 azul, 22-28 amarillo, 29-31 naranja, >31 rojo bloqueado). |
| 14 | `View_Dashboard_BI.html` | **(NUEVO v2.0)** Dashboard BI con **inline styles** (no depende de Tailwind para layout). Header fijo con botón retorno + filtro + actualizar. 4 KPI cards (grid 4 cols). 2 gráficos Chart.js (grid 2 cols). |
| 15 | `View_Assignment.html` | Asignación de coordinadores (exclusivo Jefatura). Gráfico Chart.js de distribución de carga. Asignación masiva por programa. Dashboard KPI por coordinador. |
| 16 | `View_Resultados.html` | Consolidación y envío masivo. DataTables con 33 columnas, checkboxes de selección, Pills de colores para deficiencias. |
| 17 | `View_Modal.html` | Modal de correos (Felicitar/Reportar). Plantillas HTML con firma institucional. CC automático al coordinador y jefatura según sede. |
| 18 | `JS_Client.html` | **Controlador principal frontend**. `loadModule()`, `goHome()`, `renderOverview()`, `renderCriteria()`, `save()`, `getCourseVigesimal()`. Routing de todos los módulos. Semaforización. Control de invitados. |
| 19 | `JS_Acompanamiento.html` | Controlador autónomo de Acompañamiento. Motor Base 20 asimétrico (no penaliza vacíos). UI Lock System. Botones Felicitar/Reportar mutuamente exclusivos. |
| 20 | `JS_Resultados.html` | Controlador de Resultados. Init DataTables, procesamiento de consolidado, envío masivo de correos con PDFs adjuntos. Filtro por coordinador. |
| 21 | `JS_BI.html` | **(NUEVO v2.0)** Controlador BI. `mostrarModuloBI()`, `cargarDataSabanaBI()`, `renderBiDashboard()`, `renderChartDistribucion()`, `renderPanelDinamicoExclusivo()`. Usa `style.display` para show/hide (bulletproof). |
| 22 | `JS_Templates.html` | Plantillas HTML de correo (Monitoreo + Acompañamiento). Firma adaptativa Pregrado/Posgrado. |
| 23 | `JS_Tracking.html` | Analítica. `logAccess()` para hits AP/USMP. `logInteraction()` para emails/WhatsApp. Cálculo de semana según días transcurridos. |

---

## 3. Hojas de Cálculo (Base de Datos)

| Pestaña | Función |
|---------|---------|
| `Sistema de gestión del aprendizaje (LMS)- virtual` | Datos de asignaturas virtuales. Criterios `c_1_1` a `c_*_*`. Timestamps `_ts`. |
| `Sistema de gestión del aprendizaje (LMS)- presencial` | Datos de asignaturas presenciales. Criterios `cp_1_1` a `cp_*_*`. |
| `Acompañamiento del desempeño Pedagógico` | 11 criterios de supervisión. Timestamps `_T`. Reloj de 31 días. |
| `Asignación de coordinador` | Matriz maestra (19 cols). Col S = Coordinador asignado. |
| `Datos de los coordinadores` | Roles y permisos de usuarios del sistema. |
| `Envío de resultados y fichas` | Consolidado de 33 columnas para envío masivo. |
| `Sábana General Docente` | Data Mart BI (72 cols). Fila 1=Códigos, Fila 2=Títulos, Fila 3+=Datos. |

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
| Archivo | Acción | Commit |
|---------|--------|--------|
| `Backend_BI.gs` | CREADO | `e4bc65c` |
| `View_Dashboard_BI.html` | CREADO | `e4bc65c` |
| `JS_BI.html` | CREADO | `e4bc65c` |
| `Code.gs` | RESTAURADO | `e4bc65c` |
| `Index.html` | MODIFICADO | `e4bc65c` |
| `JS_Client.html` | MODIFICADO | `e4bc65c` |
| `View_Home.html` | MODIFICADO | `e4bc65c` |

---

## 6. Pasos para la Próxima Sesión

1. **Verificar Filtro Presencial:** Confirmar que "Presencial (Evaluaciones)" muestra docentes presenciales no-híbridos.
2. **Validar Gráfico de Barras:** Verificar criterios exclusivos (Tutorías S1-S4 / Evaluaciones S1-S4).
3. **Tabla Detallada:** Considerar agregar tabla con listado individual de docentes debajo de gráficos.
4. **Módulo Coordinadores:** Implementar "Análisis de Resultados de Coordinadores" (botón placeholder activo).
5. **Testing General:** Probar que los demás módulos (Virtual, Presencial, Acompañamiento, Resultados, Asignación) siguen funcionando correctamente tras los cambios.

---

## 7. Pasos para Desplegar Cambios

1. Abrir proyecto en `script.google.com`
2. Verificar/actualizar: `Code.gs`, `Index.html`, `JS_Client.html`, `View_Home.html`
3. Crear archivos nuevos: `Backend_BI` (.gs), `View_Dashboard_BI` (.html), `JS_BI` (.html)
4. **Implementar** > **Nueva implementación** > Aplicación web
5. Ejecutar como: "Yo" | Acceso: "Cualquier usuario de la organización"
6. Probar: Home → clic en "Análisis de Resultados de Docentes" → verificar KPIs y gráficos
7. Probar: Botón retorno ← → verificar que regresa al Home correctamente
8. Probar: Filtros Virtual/Presencial → verificar datos correctos en cada filtro
