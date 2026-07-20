# Estado del Proyecto: Sistema de Monitoreo USMP

**Fecha de Última Actualización:** 01 de Abril de 2026
**Versión:** 2.5.0 (Timestamps Inmutables y Trazabilidad en BI)

---

## 1. Resumen General del Sistema

Sistema de **Monitoreo del Cumplimiento de los Estándares de Calidad** construido como una SPA (Single Page Application) en Google Apps Script. Permite a coordinadores evaluar asignaturas, generar fichas docentes, enviar resultados y analizar métricas de desempeño.

- **Arquitectura:** Serverless (Google Workspace). Frontend SPA con HTML/JS/Tailwind CSS. Backend en GAS.
- **Base de Datos:** Google Sheets como matriz relacional.
- **Autenticación:** Implícita mediante `Session.getActiveUser().getEmail()`.
- **Roles:** Admin, Jefe de área, Coordinador, Invitado.
- **Concurrencia:** `LockService.getScriptLock()` para operaciones de escritura.

---

## 2. Estructura de Archivos (Clave)

### Backend (.gs)
- `Code.gs`: Controlador principal. Maneja autenticación, enrutamiento `doGet()` y guardado `saveGrade()` con concurrencia.
- `GeneradorDoc.gs`: Motor de clonado de Fichas Docentes (`Virtual`, `Presencial`, `Acompañamiento`). Usa plantillas y destina los reportes a carpetas ID parametrizadas.
- `GeneradorResultados.gs`: Consolidación en 33 columnas para envío de PDFs automáticos extraídos desde las URLs generadas por `GeneradorDoc`.
- `GeneradorBI.gs` / `Backend_BI.gs`: Generador y Endpoint para el Data Mart BI (Dashboard General).
- `Backend_Coordinadores.gs`: Data Lake de Coordinadores.
- `SincronizacionIntern.gs`: Distribuye data de asignaciones de coordinador hacia las hojas de origen. Activa y desactiva el `MAINTENANCE_MODE`.
- `ImportacionExterna.gs` / `generar matriz.gs`: Funciones para importar datos desde el registro externo y generar la nueva matriz (filtrada por POSGRADO).

### Frontend (.html)
- `JS_Client.html`: Controlador frontend central y diccionario de Criterios (`CURRENT_CRITERIA_MAP`).
- `View_Home.html`, `View_Dashboard.html`, `View_Dashboard_BI.html`, `View_Dashboard_Coordinadores.html`: Vistas principales.
- `JS_BI.html`, `JS_Resultados.html`, `JS_Coordinadores.html`: Controladores modulares por cada vista.
- `Propuesta_Plantillas_Resultados.html`: Mockups y estilos quemados para correos y plantillas.

---

## 3. Cambios Recientes (30 de Marzo de 2026 - Sesión Actual)

### 3.1 Estabilización y Resiliencia de Datos
- **Seguridad en Chips Inteligentes (Smart Chips):** Se detectó que Google Apps Script genera errores críticos de interrupción cuando intenta leer o escribir celdas que contienen metadatos restrictivos de Drive (Enlaces o Chips). Para evitar el bloqueo de la importación y la sincronización (específicamente la que nutre a "Acompañamiento del desempeño Pedagógico"), se protegió la instrucción `setRichTextValues` con bloques `try...catch` en `generar matriz.gs` y `SincronizacionIntern.gs`. Esto asegura que los textos continuos e información sensible prevalezcan sin abortar el script.

### 3.2 Lógica de Importación de Matriz
- **Filtro Exclusivo de Posgrado:** Se refactorizó la expresión regular en la función `procesarSincronizacionCompleta()` (archivo `generar matriz.gs`) para que el motor de importación filtre y traiga de forma exclusiva las asignaturas correspondientes al grado de `"POSGRADO"`, eliminando el antiguo filtro de `PREGRADO|PAT|SEGUNDA CARRERA`.

### 3.3. Consistencia de Nomenclatura (UI y BI)
- **Actualización de OVA a Materiales:** Se reemplazó integralmente el nombre del criterio principal en el diccionario de validación (`JS_Client.html` IDs: `c_1_1_pre` y `cp_1_1_pre`) pasando de `"1.1 Actualiza OVAs (Antes S1)"` a **`"1.1 Actualiza Materiales del Aula virtual"`**. Este cambio visual Frontend se emparejó con la actualización manual de las cabeceras matriz en Google Sheets realizada por el administrador, garantizando que los tableros dinámicos en `JS_BI.html` (Leyendas LMS y gráficos) asuman automáticamente el nuevo rótulo oficial.
- **Plantillas de Referencia:** El nuevo título numérico se aplicó de igual manera sobre los layouts renderizados en `Propuesta_Plantillas_Resultados.html`.

### 3.4 Actualización de Infraestructura de Almacenamiento
- **Nuevas Carpetas de Destino Documental:** Se reprogramó `GeneradorDoc.gs` para conectar las rutas y plantillas actualizadas en Google Drive para la consolidación de los PDF/Docs. 
  - *Carpeta Acompañamiento:* `1lsW7oxzJFdm6K5883_JnCVoj1HVb2T0m`
  - *Carpeta Virtual/Presencial:* `1gWE1NEjp8fDeCpB6SzRTSH6Z5XQe6FHu`

---

## 4. Cambios Recientes (01 de Abril de 2026 - Sesión Actual)

### 4.1 Arquitectura First-Write-Only en Timestamps 
- **Inmutabilidad de Auditoría:** Se rediseñó el mecanismo de grabación en `saveGrade()` (archivo `Code.gs`). Anteriormente, los timestamps se sobrescribían en cada modificación. Ahora graban de forma inmutable la primera vez que se evalúa un criterio. Esto blinda el cálculo de la herramienta "Tiempo Absoluto LMS" para generar reportes exactos e infalibles sobre la velocidad real del coordinador.

### 4.2 Trazabilidad de Revisiones (Criterios vs Cambios)
- **Nuevas Columnas Operativas:** Se definieron y documentaron dos nuevas métricas de seguimiento llamadas `criterios_notificados` y `cambios_realizados`. Se insertan al extremo derecho de la hoja LMS (Columnas EF y EG) y Acompañamiento (Columnas BF y BG).
- **Contadores Asíncronos:** El primer guardado de nota incrementa `criterios_notificados`. Toda edición o actualización posterior de una nota existente eleva silenciosamente el termómetro de `cambios_realizados`.

### 4.3 Expansión Periférica del Data Mart (Sábana BI)
- **Mapeo a prueba de fallos:** Se planificó la actualización de `GeneradorBI.gs` aumentando artificialmente el "alcance" dinámico de lectura (de 44 a 48 columnas y de 8 a 13) para capturar los metadatos de las columnas "EF/EG" y "BF/BG". Posteriormente el script fuerza esta data hacia las columnas finales perimetrales de la visualización en la **Sábana General Docente (Mapeo explícito en columnas FP, FQ, FR, FS, FT, FU)** garantizando cero alteraciones/desplazamientos de todos los subsistemas anteriores e impidiendo colisiones entre Modalidades (Virtual vs Presencial).

---

## 5. Cambios Recientes (08 de Abril de 2026 - Sesión Actual)

### 5.1 Corrección de Mapeo de Timestamps para Clustering
- **Solución del Bug de Timestamps:** Se eliminó la dependencia inflexible de `tsCodes_V` y `tsCodes_P` (`masterTsMapping`) en `Backend_Coordinadores.gs`. Ahora, el motor de extracción lee orgánicamente las semanas (`_s2`, `_s3`, `_s4`) inspeccionando directamente el string nominal desde `headerCodes` en la "Sábana General Docente". Esto asegura un empaquetado milimétrico de los arreglos (`raw_lms_w` y `lms_audited_w`) resolviendo las asincronías previas.
- **Validación de Métricas:** Con este rediseño estructural, el frontend (`JS_Coordinadores.html`) vuelve a recibir matrices puras para sus operaciones de Map-Reduce (Tiempo Absoluto LMS y Dedicación LMS).
- **Snapshot Listo:** Las dependencias del `Histórico_Tiempos_Coord` también obtienen resultados transparentes para inyecciones correctas.

---

## 6. Cambios Recientes (20 de Julio de 2026 - Sesión Actual)

### 6.1 Reconstrucción y Auditoría Integral de Subsistemas
- **Restauración y Clonado:** Se realizó la descarga completa del repositorio de GitHub (`Posgrado---Sistema-de-gesti-n-y-monitoreo-de-asignaturas`) tras el formateo del equipo de desarrollo, sincronizando los 9 subsistemas del proyecto.
- **Auditoría de Arquitectura:** Se auditó la coherencia entre el frontend SPA (`Index.html`, `JS_Client.html`, `JS_Coordinadores.html`, `JS_BI.html`) y el backend en Google Apps Script (`Code.gs`, `Backend_Coordinadores.gs`, `GeneradorBI.gs`, `GeneradorDoc.gs`, `GeneradorResultados.gs`).

### 6.2 Consolidación de la Pestaña ANÁLISIS (Resumen del Equipo por Semanas)
- **Integración Visual:** Se actualizó `JS_Coordinadores.html` para incorporar el manejo completo del estado `CURRENT_TAB === 'ANALISIS'`.
- **Desglose Semanal:** Se implementó la renderización iterativa en `renderCoordResumen()` creando contenedores de tabla independientes para **Semana 1, Semana 2, Semana 3, Semana 4 y Semana de Cierre**.
- **Aislamiento de Componentes:** Al seleccionar la pestaña "ANÁLISIS", el sistema oculta los KPIs globales, gráficas de dona/radar y el listado individual de asignaturas, enfocando la pantalla exclusivamente en el reporte ejecutivo consolidado del equipo.

---

## 7. Pasos para la Próxima Sesión

1. **Despliegue de Nueva Versión en Google Apps Script:** Publicar la versión web actualizada en Google Workspace para que los coordinadores accedan a la vista de análisis semanal.
2. **Auditoría de Permisos en Drive:** Verificar la correcta emisión de PDFs de fichas docentes en las carpetas de destino de Google Drive.
3. **Monitoreo de Snapshots:** Ejecutar pruebas de guardado de snapshots en `Histórico_Tiempos_Coord`.

