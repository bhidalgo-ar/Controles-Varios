# Pantalla de resultados de un control

Los bloques ya existen: `js/ui/resultBlocks.js`. No armes el hero a mano.
`renderResumenDetalle(container, { resumen, detalle })` envuelve todo en dos solapas fijas. Dentro de
`resumen`: `renderVerdict` (ícono + titular en prosa), `renderTiles` (label/valor/subtexto),
`renderIssues` (casos para revisar, con severidad y por qué), `renderChecks` (chequeos de
coherencia). Dentro de `detalle`: toolbar + tabla + paginación. `nr.js` es el ejemplo completo de los
dos modos.

Criterio del proyecto: mostrar sólo lo que tiene valor real. No es forma, es lo que hace usable una
tabla de 900 legajos.

- Guard de vacío primero: `if (rows.length === 0)` → `<p class="text-muted">Sin datos.</p>`.
- Filtrá las filas sin ningún valor distinto de cero **antes de contar nada** (`hasAnyNrValue` en
  `nr.js`) y decí en un tile cuántas se ocultaron. Nunca listes un catálogo fijo con todo en cero.
- Ocultá también las columnas sin ninguna diferencia, y aclará al pie cuántas.
- Si no hay ninguna diferencia, la tabla de ceros no aporta: tarjeta verde con ✓ y salí.
- Cuando las dos distribuciones coinciden 1:1, un toggle "sólo con diferencia / todos"
  (`catXEmpleados.js`).

Tabla: `class="data-table data-table--compact"` + `enhanceGrid()`. Toolbar: `class="results-toolbar"`,
filtros y buscador a la izquierda, `renderExportMenu` a la derecha. Después de **cada** render del
`<tbody>` —incluido el re-render que dispara un filtro— hay que volver a inicializar
`initShowMorePagination(tbody, { pageSize: 50 })` y después `initSearchCombobox(...)` pasándole la
paginación, de `js/ui/tableTools.js`. En ese orden: el buscador necesita la paginación ya creada.

Export: `renderExportMenu(el, { onExcel, onCsv, onCopy })`. Las tres salidas llevan **todas** las
filas con diferencia y **todos** los conceptos, sin importar el filtro de pantalla. El `.xlsx` se
arma con `loadExcelJS()` de `js/utils/exportData.js`; nombre
`<Control>_<Modo>_${periodSuffix(results.period)}.xlsx`.

Colores desde `css/tokens.css` (`var(--color-danger)`, `var(--color-success)`, `var(--sp-3)`). Si
necesitás un tinte por grupo de concepto, declaralo como constante arriba del módulo y compartilo
entre tabla y export (`nr.js`) — pero comprobalo en dark mode antes de darlo por cerrado; ya hubo un
badge ilegible por eso.

Números: `toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`, y `'—'`
para `null`.
