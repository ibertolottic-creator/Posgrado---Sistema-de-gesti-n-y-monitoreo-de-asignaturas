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

## 5. Pasos para la Próxima Sesión

1. **Monitorear Ejecución en Drive:** Confirmar que los nuevos enlaces generados por el botón "Generar Ficha" se almacenen físicamente en las nuevas carpetas proporcionadas y que los archivos hereden permisos aptos para que el módulo de "Enviar Resultados Automáticos" pueda mandarlos sin restricciones de acceso.
2. **Validar Importación de Posgrado:** Realizar una corrida en frío de la herramienta "Importar Matriz" (para verificar que el volumen de datos alojados corresponda únicamente a Posgrado, descartando anomalías por celdas vacías).
3. **Auditar Tiempos LMS y Acomp:** Confirmar que la suma de rangos horarios (`audit_time_s...` y `a_audit_time...`) continúan devolviéndose correctamente en el entorno pre-productivo bajo el formato (`Xh Ym`).
