# Arquitectura y Lógica del Sistema de Gestión y Monitoreo LMS USMP

Este documento expone detalladamente la arquitectura de software, el flujo de datos y la lógica de negocio de cada uno de los subsistemas que componen el entorno de Seguimiento Docente de la Universidad de San Martín de Porres (USMP).

---

## 1. Visión General de la Arquitectura

El ecosistema está construido bajo una arquitectura **Serverless (Sin Servidor)** haciendo uso íntegro de **Google Workspace**.

- **Capa de Presentación (Frontend):** Construido como una _Single Page Application_ (SPA) plana usando **HTML, Vanilla JavaScript y Tailwind CSS**. Se orquesta en un único punto de entrada (`Index.html`) donde los diferentes módulos (Vistas) se inyectan dinámicamente sin recargar la página.
- **Capa de Lógica de Negocio (Backend):** Desarrollado en **Google Apps Script (GAS)** (`Code.gs`, `GeneradorResultados.gs`, `GeneradorDoc.gs`), operando como puentes de API RPC (Remote Procedure Call) a través de los métodos asíncronos nativos `google.script.run`.
- **Capa de Persistencia (Base de Datos):** Utiliza **Google Sheets** como matriz relacional/documental. Las hojas (`Virtual`, `Presencial`, `Acompañamiento`, `Asignación`) actúan como tablas interconectadas, cuyas filas son registradas e indexadas en torno al cruce entre la "Asignatura" y el "Coordinador".

---

## 2. Subsistemas del Proyecto

El sistema integral se divide rigurosamente en 6 subsistemas modulares autónomos pero profundamente interconectados.

### 2.1. Subsistema de Seguridad, Identidad y Control de Concurrencia

- **Control de Identidad:** Mediante la función global `getGlobalSessionData()`, el sistema detecta de forma inherente la cuenta de Google (Gmail/USMP) bajo la que se ejecuta el script.
- **Gestión de Roles:** El sistema corrobora el email capturado contra la hoja "Datos de los coordinadores". Devuelve roles específicos ("Admin", "Jefe de área", "Invitado").
- **Motor Anti-Colisión (Concurrency Lock):** El guardado de cualquier métrica implementa el `LockService` (`getScriptLock()`) de Google. Cuando el sistema procesa un `saveGrade()`, coloca un cerrojo lógico temporal, evitando de manera infalible la corrupción de la base de datos producida si múltiples coordinadores evaluaran al mismo tiempo.
- **Filtrado Dinámico Seguro:** La API de Backend (`getInitialData`) extrae **únicamente** la data/filas pertenecientes al `Responsable / Coordinador` logueado (Columna S en matriz), a menos que posea permisos administrativos globales.

### 2.2. Subsistema de Control y Asignación de Carga (Jefatura)

Módulo restringido (`View_Assignment.html`) diseñado para gestionar la matriz maestra de la cual derivan los demás módulos operativos.

- **Lógica de Renderizado:** Ejecuta lectura en RAM de las asignaturas activas y las muestra con `Chart.js` para visualización macro del reparto.
- **Asignación Masiva:** Los usuarios de Jefatura pueden elegir un Programa Institucional de un menú y ejecutar la asignación en lote, transmitiendo a la vez cientos de asignaturas al coordinador asignado de manera optimizada y re-calculando el gráfico circular instantáneamente.
- **Sincronización Transversal (Wrappers):** Las transferencias de datos desde repositorios externos operan aquí mediante wrappers (`runImportAndSyncWebApp`, `runSyncAllWebApp`), bloqueando la plataforma entera mediante la bandera `MAINTENANCE_MODE` mientras se transfiere la información cruda a las diferentes divisiones (LMS Virtual / LMS Presencial).

### 2.3. Subsistema Operativo (LMS Virtual y LMS Presencial)

Representan los módulos transaccionales de uso diario, desplegados principalmente desde `JS_Client.html`.

- **Indexación Inteligente de Data:** Emplea algoritmos detectores de configuración (Ej. `getHeaders`) que escanean las filas buscando llaves únicas como `c_1_1` o `cp_1_1`. Esto inmuniza al código de quiebres si los usuarios insertan filas estéticas superiores en la hoja de cálculo matriz.
- **Flujo de Evaluación y Auditoría:** La nota introducida por el coordinador (escala temporal de 4) se inyecta en la celda del ID Criterio. Inmediatamente el código inyecta el **Timestamp (Sufijo `_ts`)**, permitiendo generar la auditoría visual y controlar reglas temporales.
- **Tolerancia a Fallos en Enlaces:** Si la hoja pierde el formato dinámico nativo "RichText" de un Aula Virtual (falla común entre copias de Excel a Sheets), el backend lo detecta y obliga al algoritmo a parsear URLs planas armando hipervínculos consistentes.

### 2.4. Subsistema de Acompañamiento Pedagógico

Un sistema independiente (`View_Dashboard_Acomp.html` / `JS_Acompanamiento.html`) basado en plazos críticos y protección de doble capa.

- **Reloj de 31 Días (Semáforo Dinámico):** Un cronograma de iteración que cruza la fecha de apertura actual ("Periodo Fecha") respecto al tiempo de entrada de la nota.
  - Actúa sobre rangos: (0-21 azul), (22-28 amarillo), (29-31 naranja) y finalmente se bloquea en ROJO.
- **Cálculo Asimétrico Base 20:** El algoritmo del promédio extrae puntajes y los convierte a base 20, **pero excluye matemáticamente los criterios que aún no han sido calificados**. Esto imposibilita destruir el promedio parcial de un profesor por estar recién a mitad de proceso de revisión.
- **Gestor de Estados (Mutually Exclusive Logic):** Para evitar desbordes visuales, las acciones terminales (Ej. Botón "Felicitar Docente" si hay nota pura de 20 vs. Botón "Reportar Fallas" si existen deficiencias) no coexisten; la subrutina valida el promedio dinámico y anula el render del botón incorrecto y viceversa.

### 2.5. Subsistema de Motores Documentales (Google Docs API)

Este ecosistema automatiza la burocracia técnica a un solo clic clonando plantillas a través de `GeneradorDoc.gs`.

- **Motor de Inyección y Clonado:** La función `generateDocVirtual()` y equivalentes se disparan leyendo un ID Base. Operan copiando la tabla estructural del documento `.doc` en destino y buscando variables abstractas `{{c_1_1_pre}}` con expresiones regulares (`RegEx`), sustituyéndolas por el valor numérico en base de datos.
- **Regla Condicional (Estricta 4 Semanas):** En la FASE 6 de implementación, el motor de UI detecta primero que el 100% de la cuadrícula gráfica operativa haya recibido un voto. Solo bajo esa exclusividad el sistema enciende o habilita el componente para clonación de **Ficha Global**. Posteriormente reescribe el hipervínculo dentro del mismo Excel para la trazabilidad futura y control histórico de Fichas (columna `Url_ficha`).

### 2.6. Subsistema de Consolidación Multidimensional y Reporte

El núcleo central del ecosistema actual (Arquitectura de 33 Columnas - Fase 5.1).

- **Ingeniería de RAM (`GeneradorResultados.gs`):** Este mecanismo lee la totalidad del proyecto separando hilos. Para armar el DataTables de consolidado (Envío Masivo de Resultados), el backend carga arreglos en paralelo buscando coincidencias de "DNI" de profesores entre "LMS Virtual", "LMS Presencial" y "Acompañamiento".
- **Cálculo Vigesimal Dinámico:** El algoritmo intercepta el puntaje bruto sobre 136 (LMS) y 44 (Acompañamiento) y calcula asíncronamente en RAM sus equivalentes ponderados base 20 (Vigesimal) para inyectarlos en columnas independientes.
- **Extractor de Criterios a Mejorar:** El subsistema cruza la red de notas buscando debilidades (calificaciones de 1 o 2). Si detecta fallas, en lugar de exportar códigos (c_1_1), el puntero sube a la Fila 2 de la matriz original para capturar el texto descriptivo humano de la rúbrica y lo concatena en una cadena separada por comas.
- **Reestructuración UI (Pill Badges):** Compatibilidad inyectada en celdas unidas (`rowspan="2"`) arreglando bugs gráficos con `DataTables`. Las deficiencias y porcentajes de avance capturados de la RAM se transforman dinámicamente en `JS_Resultados.html` como mini-etiquetas de colores (Pastillas o "Pills") visuales para una lectura y auditoría jerárquica instantánea de los Jefes de Programa.

### 2.7. Subsistema de Comunicaciones (Mail & WhatsApp)

Diseñado con plantillas inteligentes integradas (`JS_Templates.html`).

- **Enrutador Inclusivo y Adaptativo (CC Tracking):** El sistema, al llamar a `openEmailModal()`, intercepta las propiedades nativas recuperando el e-mail interno del Docente Primario y Secundario, agregando intrínsecamente a nivel backend el correo del **Coordinador Asistente Responsable** asociado a ese curso. Además, el `SS_NAME` global (`PREGRADO`/`POSGRADO`) dicta la variable para agregar automáticamente a la jefatura pertinente a las copias.
- **Puerta de Enlace (Gateway):** Construcción y redirección nativa de estructuras textuales hacia el esquema `wa.me/` (WhatsApp Web URL API), integrando reportes automáticos en la plataforma web de mensajería respetando los saltos de línea (URL Encoded).

---

### Conclusión Técnica de la Evolución Sistémica

El LMS del entorno actual de USMP transicionó de un entorno de cuadrícula plana a un ecosistema centralizado donde la lógica no es controlada por Visual Basic for Applications (VBA), sino puramente por una SPA desacoplada apoyada por el Cloud de Google (V8 JS Engine), logrando escabilidad asíncrona, robustez anti-concurrente, roles estructurados y auditoría granular sobre el comportamiento de sus monitores.
