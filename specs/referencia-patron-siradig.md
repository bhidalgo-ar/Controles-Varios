# Referencia visual: patrón SIRADIG F572 para la pantalla de resultados

Guillermo pidió que la pantalla de resultados de `acumuladores_ganancias` siga
el estilo del motor SIRADIG F572 de H&A (`payroll-portal-ha`), no su código —
es otro repo, sin backend compartido y con su propia lógica de negocio. Lo que
se reutiliza es **la estructura de la pantalla**, adaptada a los patrones
obligatorios de Controles Nómina (`CLAUDE.md` §11, skill `nuevo-control`).

**Estado:** implementado — ver D-026 en `DECISIONS.md` y
`js/controls/acumuladoresGanancias.js` (`renderAcumuladoresResults`).

## Por qué este control la necesita

Es un control de generación (`status: 'info'`, sin semáforo, sin hero de
diferencias): no hay nada contra qué comparar. La info es ~308 legajos × 11
columnas × 2 tablas (`MM-AAAA` y `DATOS`), demasiado para una lista plana.

## Estructura replicada

**1. Tira de KPIs arriba**, cifras grandes sin decoración: total de legajos,
legajos sin movimiento en el mes (excluidos de la solapa `MM-AAAA` en
pantalla), SAC teórico total del período, y meses acumulados en la ventana
junto con el régimen (RG 4003 / RG 4030), para que se vea de un vistazo cuántos
crudos entraron. Reusa las clases `.hero-kpi*` de `css/components.css`
(generalizado a `grid-template-columns: repeat(auto-fit, minmax(...))` en vez
del `1fr 1fr` fijo del hero global).

**2. Solapas**, no todo junto: una por tabla (`MM-AAAA` y `DATOS`), con el
componente nuevo `js/ui/tabs.js` (`initTabs`) — patrón WAI-ARIA
`tablist/tab/tabpanel`, primera vez que el proyecto usa solapas en una pantalla
de resultados (hasta ahora el idioma para segmentar era `<details open>`, ver
`catXEmpleados.js`/`rendVsAsiento.js`). Queda disponible para el resto de los
controles.

**3. Filtros y buscador arriba de cada tabla**: buscador por legajo o nombre
(`initSearchCombobox`), mismo patrón que el resto de los controles. El filtro
"con movimiento / sin movimiento" no se expone como control aparte: la solapa
`MM-AAAA` ya viene pre-filtrada a "con movimiento" (ver spec del control,
sección "Salida — la app").

**4. Tabla paginada** (`initShowMorePagination`, 50 por página) en vez de
scroll infinito, con fila de totales en un segundo `<tbody>` — fuera de la
paginación y la búsqueda, mismo patrón que `rendXEe.js`.

**5. Export al final, no por tabla**: un solo `renderExportMenu` que arma el
`.xlsx` con ambas hojas, en vez de un menú de export por tabla. El CSV/copiar
exporta la tabla `MM-AAAA` (con movimiento); el `.xlsx` completo es el único
formato que lleva las dos hojas.

## Lo que NO se copió

- Password de acceso, carga de ZIP y todo lo de SIRADIG específico de ese
  dominio (F572, AFIP).
- Semáforo de colores por variación (verde/rojo por celda): ahí sí hay
  comparación entre dos períodos; acá no hay período B, es un solo mes con su
  acumulado.
- Cualquier estilo o CSS del otro repo: se usó `css/tokens.css` de este
  proyecto en todo momento, no se trajo paleta de afuera.

## Decisiones que quedaron resueltas (antes abiertas)

Las cuatro preguntas que dejaba pendiente esta referencia, resueltas en D-026:

1. **Columnas de identificación:** Legajo + Apellido y Nombre. Sin CUIL.
2. **Legajo sin movimiento:** fuera de la solapa `MM-AAAA` en pantalla (con
   KPI del conteo), incluido en el `.xlsx` en cero.
3. **Fila de totales:** sí, en pantalla y en el Excel.
4. **Solapas vs. tablas apiladas:** solapas, con el componente nuevo
   `js/ui/tabs.js`.
