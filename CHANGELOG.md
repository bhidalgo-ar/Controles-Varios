# CHANGELOG — Controles Nómina

> Formato: [Conventional Commits](https://www.conventionalcommits.org/). Mensajes en español.
> Cada entrada: versión · fecha · tipo · descripción.

---

## [Unreleased] — MVP en desarrollo

### feat: Control Acumuladores Ganancias (Axton) — 2026-08-06

- `js/parsers/acumuladoresParser.js` — parser del export `repacumuladores` de Axton (formato fijo: fila 1 encabezados, datos desde la 2). Resuelve columnas por nombre tolerando acentos y espacios duros; matchea acumuladores por `Nro` (columna numérica), no por el texto (el origen mezcla acentuación entre cuentas).
- `js/controls/acumuladoresGanancias.js` — el control: consolida por legajo las filas `Operacion` vacía (valores del mes propio, sumando las liquidaciones del legajo — 204 de 308 legajos de POP tienen dos), calcula la doceava parte del mes (excluye SAC 1ra cuota y Retenciones) y el SAC teórico como suma de las doceavas de todos los meses subidos. Arma la hoja `MM-AAAA` (mes de proceso + SAC teórico acumulado) y la hoja `DATOS` (acumulado del año, **sólo del crudo más nuevo** — no se suman los crudos entre sí), con `TOTAL` sin "Excluye del SAC teórico". Control de generación: `status: 'info'`, sin semáforo ni hero de diferencias.
- `js/ui/fileUpload.js` — `initAcumuladoresMultiUpload()`: un crudo por cada mes de la ventana del SAC teórico (2 para RG 4030, hasta 8 para RG 4003), reusando el mecanismo de `initContaMultiUpload` (D-018) en vez de tocar el contrato del registry. Cada archivo lleva además un período editable (`<input type="month">`), inferido de la fecha de generación del nombre del archivo y corregible a mano.
- `js/ui/tabs.js` — componente nuevo y reusable de solapas accesibles (`initTabs`, patrón WAI-ARIA tabs), primera vez que el proyecto necesita este patrón en una pantalla de resultados. Usado para las tablas `MM-AAAA` / `DATOS`, al estilo del motor SIRADIG F572 de H&A que pidió Guillermo como referencia visual.
- Pantalla de resultados: tira de KPIs (legajos, sin movimiento en el mes, SAC teórico total, meses en ventana + régimen), banda de alertas de la validación de ventana, solapas por tabla, buscador y paginación por tabla, fila de totales, y un único menú de export al final que arma el `.xlsx` con ambas hojas.
- `js/controls/registry.js` — entrada `acumuladores_ganancias`, segundo control `scope: 'sistema'` de `sourceSystems: ['axton']` (después de Acreditaciones, D-021).
- `tests/acumuladoresGananciasControl.test.js` — cubre la consolidación por legajo (regresión de doble liquidación), la doceava parte, el SAC teórico acumulado, que `DATOS` sale sólo del crudo más nuevo, la distinción `null`/`0`, la validación de ventana RG 4003/RG 4030 y el override de códigos de acumulador. Sumado a `test:unit`. `tests/controlsRegistryScope.test.js` y `tests/controlsScope.test.js` actualizados (15 controles; un cliente Axton ve ahora 3).
- Ver `specs/control-acumuladores-ganancias.md`, `specs/referencia-patron-siradig.md` y D-026 en `DECISIONS.md`.

### docs: aclarar que OPmobility es el nombre nuevo de Plastic Omnium — 2026-08-06

- `DECISIONS.md` D-024 — deja explícito que **OPmobility es el nombre comercial nuevo del grupo Plastic Omnium**, no una empresa distinta, y que eso no cambia nada del sistema: Pilar (`POP`, Axton) y Florida (`POF`, Meta4) siguen siendo dos clientes únicos e independientes, cada uno con su scope y su histórico. Sin cambios de código ni de datos — los `name` del seed no se tocan hasta que Guillermo pida el rename explícitamente.
- `specs/reporte-variaciones-opmobility.md` — nota aclaratoria al tope: este documento es sólo sobre Florida (`POF`); Pilar tiene su propio control (Acreditaciones, `specs/control-acreditaciones-axton.md`).

### feat: Variación entre períodos como control de la app (POF) + soporte de Tabulado HTML — 2026-08-06

- `js/parsers/tabuladoHtml.js` — parser del Tabulado que llega como `.xls` pero es HTML (export del sistema de liquidación de OPmobility / Plastic Omnium Florida). Hasta ahora la app **no podía leer ese archivo**: SheetJS no lo reconoce como HTML y lo parte por las comas de los `style=`. Deduce el ancho real de las filas, corta los encabezados en ese ancho (descarta la segunda fila de `<th>` con "Imp"), devuelve la fila `TOTAL GENERAL` aparte (tiene `colspan=3`, va corrida 2 columnas) y saca del encabezado la razón social, el período y la quincena. Va con regex y no con DOMParser para que corra igual en Node.
- `js/parsers/tabuladoControl.js` — `detectHeaders` y `parseTabuladoControl` detectan el formato por contenido (`isHtmlTabulado`) y derivan a la rama HTML; la rama de Excel queda intacta. `autoDetectTabMapping` acepta varios nombres por columna (`EMPLEADO` o `LEGAJO`, …), así el Tabulado de OPmobility se auto-detecta sin mapeo manual.
- `js/controls/variaciones.js` — los controles **Variación Sueldos** (899999 + 1000 sumados) y **Variación Conceptos** (2517 y 2519, uno por sección). Consolidan por legajo, ocultan filas y conceptos sin valor real, hero de empleados con y sin variación, avisos de conceptos no liquidados y de cambio de dotación, export a .xlsx/CSV/portapapeles y botón "Imprimir / PDF" con el entregable A4 horizontal.
- `js/ui/controlsWizard.js` + `js/db.js` (`getRunFileFromPeriod`) — el período anterior se resuelve reusando el Tabulado ya cargado en la corrida del mes anterior del cliente; si ese mes no se corrió, se pide como archivo adicional opcional (`tab_prev_file`). `run()` sigue siendo sincrónico.
- `js/controls/registry.js` — entradas `variaciones_sueldos` y `variaciones_conceptos`, `scope: 'cliente'` de `POF`, agrupadas bajo "Variación entre períodos". POF pasa de 1 control a 3.
- `tests/variacionesControl.test.js` — 57 asserts: parser HTML (ancho, headers, TOTAL GENERAL, metadata), auto-detección de columnas, comparación entre períodos, suma de 899999+1000, **consolidación de un legajo con dos liquidaciones**, altas y bajas del mes, concepto no liquidado y las ramas de error. Sumado a `test:unit`.
- Verificado en el navegador con los dos tabulados reales (2ª quincena de marzo y abril 2025, 71 empleados): los totales cierran al centavo contra la fila `TOTAL GENERAL` del tabulado y las columnas se auto-detectan solas.
- Ver `specs/reporte-variaciones-opmobility.md` y D-023 en `DECISIONS.md`.

### feat: reporte de Variación de Conceptos Liquidados de OPmobility — 2026-08-06

- `reportes/opmobility-variaciones.html` — HTML standalone (se abre con doble click, sin ES modules ni CDNs obligatorios) que compara el tabulado de OPmobility C-Power Argentina S.A. entre dos períodos y muestra la variación por empleado, con exportación a PDF A4 horizontal. Dos reportes: **Variación Sueldos** (`899999` + `1000` sumados en una columna) y **Variación Conceptos** (`2517` y `2519`, cada uno en su sección y en página nueva).
- Parser del tabulado (`.xls` que en realidad es HTML del sistema de payroll): decodifica Windows-1252, saca período, quincena y razón social del propio encabezado del archivo, y matchea los conceptos **por código del `<th>`** — nunca por posición, porque la cantidad de columnas cambia entre meses (83 en marzo 2025, 84 en abril). La fila `TOTAL GENERAL` (corrida 2 columnas por el `colspan=3`) se usa sólo para validar sumas, y la validación sale como aviso en pantalla.
- Persistencia entre períodos: al generar el reporte los dos períodos quedan guardados en `localStorage`, así el mes siguiente alcanza con subir el tabulado nuevo. Export/import JSON del histórico, con aviso de datos confidenciales al exportar.
- Pantalla con los patrones del proyecto: aviso de privacidad antes de cualquier input, hero de empleados con y sin variación, tira de contexto con los totales por concepto, avisos de conceptos no liquidados / totales que no cierran / cambio de dotación, y el filtro de ocultar filas sin valor real (apagado por defecto).
- Verificado contra los dos tabulados reales de muestra (2ª quincena de marzo y de abril 2025, 71 empleados): los totales cierran al centavo contra la fila `TOTAL GENERAL` del tabulado.
- Ver `specs/reporte-variaciones-opmobility.md` y D-022 en `DECISIONS.md`.

### fix: Acreditaciones — ancla de fecha por Listado, alertas unificadas y asignación manual — 2026-08-06

- `js/controls/acreditaciones.js` — la herencia de fecha de acreditación ahora ancla primero por Listado (la unidad real del banco) y sólo cae al texto de la liquidación cuando la fila no tiene Listado. Corrige el caso en que un Listado entero (todos sus empleados) queda sin fecha resoluble en el archivo: antes generaba una alerta idéntica por cada empleado, ahora es **un solo grupo pendiente**.
- Nuevo: `assignAcreditacionesDate()` / `unassignAcreditacionesDate()` — el analista asigna a mano la fecha de un grupo pendiente desde la propia pantalla de resultados (campo de fecha + botón "Asignar" por grupo) y el reporte (pantalla y .xlsx) se regenera al instante, sin recargar el archivo ni volver al wizard. El grupo se mergea con la lista existente de su mismo tipo+fecha si hay una, o forma una lista nueva. Las asignaciones quedan listadas con un botón "Deshacer".
- `results.sinAsignar` pasa de un objeto único a un array de grupos (`{ key, listado, liqRaw, tipo, rows, count, total }`) — cambio de forma interno del control, sin impacto en el registry ni en otros módulos.
- `tests/acreditacionesControl.test.js` — cubre el nuevo ancla por Listado, el fallback por liquidación cruda cuando no hay Listado, la unificación de alertas por grupo, la asignación manual (merge con lista existente / lista nueva / deshacer / encadenar asignaciones sin duplicar datos) y que julio de POP sigue dando el mismo resultado (regresión).
- Ver `specs/control-acreditaciones-axton.md` y D-025 en `DECISIONS.md`.

### feat: Control Acreditaciones (Axton) — modo "Generar Reporte" — 2026-08-05

- `js/parsers/acreditacionesParser.js` — parser del export `contacred` de Axton (formato fijo, igual en todas las cuentas de Axton): encuentra la fila de encabezados (la 1 es un separador), resuelve las columnas por nombre tolerando acentos y espacios duros, normaliza el CBU (viene con un espacio duro adelante) y descarta la fila de `TOTAL GENERAL`.
- `js/controls/acreditaciones.js` — el control: agrupa las acreditaciones del mes por (tipo de liquidación × fecha de acreditación) mergeando los listados del mismo pago, normaliza los tipos por patrón con fallback al texto crudo de Axton, hereda la fecha de las filas huérfanas sólo cuando es unívoca (el resto va a `SIN ASIGNAR`), y exporta el .xlsx: hoja `CONTROL` con el cierre en fórmulas contra el total del archivo de origen, más una hoja por lista (`07 1Q 16-07`) con CUIT y CBU como texto. Corte por empresa configurable.
- Pantalla de resultados con los patrones del proyecto: hero de listas con y sin alertas, tarjeta de cierre, filtro por tipo, paginación, buscador y menú de export; el conteo de empleados por lista, las alertas de integridad (sin importe, duplicado, CBU inválido o compartido, importe ≤ 0) y el corte por banco se muestran **sólo acá** y no en el .xlsx — ver D-020.
- `js/controls/registry.js` — entrada `acreditaciones_reporte`, primer control con `scope: 'sistema'` para `sourceSystems: ['axton']` (lo ven los 8 clientes Axton). `js/ui/fileUpload.js` y `js/ui/controlsWizard.js` cablean el tipo de archivo y el toggle de corte por empresa.
- `tests/acreditacionesControl.test.js` — 51 asserts: normalización de tipos, qué filas entran, merge y corte de listados, herencia de fecha, `SIN ASIGNAR`, cierre contra el origen, las cinco alertas, corte por empresa y las ramas de error. Sumado a `test:unit`.
- `CLAUDE.md` §6.5 — guardrail nuevo: los entregables que van a Finanzas no llevan información de HR.
- Ver `specs/control-acreditaciones-axton.md` y D-020 / D-021 en `DECISIONS.md`.

### feat: Rendimiento vs Asiento admite varios archivos de Contabilidad — 2026-08-05

- `js/parsers/contaExcel.js` — `mergeContaFiles()`: concatena las filas parseadas de varios archivos de Contabilidad Desglosada (CONTA) y avisa (sin bloquear) si dos archivos distintos comparten filas idénticas — pensado para acumular varios meses en una sola corrida.
- `js/ui/fileUpload.js` — `initContaMultiUpload()`: el paso de carga de CONTA pasa a aceptar selección/arrastre múltiple, con lista de archivos cargados y opción de quitar cualquiera antes de ejecutar. Es el único `additionalFile` con este comportamiento; el resto sigue siendo un archivo por slot.
- `tests/contaMerge.test.js` — cubre el merge de meses distintos (sin falsos positivos de duplicado por `ID_CONTA`), la detección de un archivo subido dos veces, y que las repeticiones dentro de un mismo archivo no se marcan como duplicado cruzado. Sumado a `test:unit` en `package.json`.
- Ver D-018 en `DECISIONS.md`.

### docs: agregar README.md — 2026-08-04

- `README.md` — guía práctica de uso del repo: cómo levantar la app localmente (static server, por qué no funciona con doble click), flujo de uso básico, tabla de controles disponibles hoy (`CONTROL_REGISTRY`), modo admin, privacidad, cómo correr los tests (`npm run test:unit` / `test:e2e`) y estructura real del repo. Referenciado desde `CLAUDE.md` §3, §9 y §10 pero no existía hasta ahora.

### chore: skill `nuevo-control` + allowlist de permisos versionados — 2026-08-04

- `.claude/skills/nuevo-control/SKILL.md` — guía operativa para agregar un control nuevo (o una variante "Generar Reporte" de uno existente): los 6 puntos de integración con referencias `archivo:línea` a `nr.js`, contratos de `run`/`summarize`/`renderResults`, patrones de UI obligatorios (hero de diferencias, ocultar filas/columnas sin valor real), mínimo de test exigido y errores frecuentes.
- `.claude/settings.json` — allowlist de comandos del proyecto (scripts de `package.json`, runner de tests, `python3 -m http.server`, lecturas de git), derivado de `package.json` y `.github/workflows/ci.yml`.
- `.gitignore` — `.claude/` pasa a `.claude/*` con excepciones para `skills/` y `settings.json`, para que ambos se compartan con el equipo. Ver D-017.

### feat: bootstrap del proyecto (bloque 1.1) — 2026-05-18

- `index.html` — shell de la app con header H&A (logo + wordmark + fallback CSS offline), banner de privacidad obligatorio, área de contenido principal y footer corporativo con las 3 sedes y datos de contacto.
- `css/tokens.css` — variables CSS de diseño: paleta H&A (`#00ACD4`, `#8C837B`), tipografía Source Sans Pro, escala de espaciado, bordes, sombras, z-index.
- `css/base.css` — reset, estilos generales, estructura del header y footer, clases utilitarias (text-muted, text-primary, container, page-content).
- `css/components.css` — sistema completo de componentes UI: botones (primary/secondary/ghost/danger), pills de agrupadores, badges, cards, tablas de datos con paginación, wizard de pasos, formularios, file upload, spinner, toast, modal, empty state, alert, welcome screen.
- `js/main.js` — bootstrap: inicialización de la app, verificación de CDNs (SheetJS + Dexie), setup del banner de privacidad, router básico, helper `showToast()` exportable, pantalla de bienvenida con estado del MVP.
- `DECISIONS.md` — creado. Log de decisiones técnicas (D-001 a D-003).

---

*Próximo: bloque 1.2 — DB layer con Dexie + schemas + helpers CRUD.*
