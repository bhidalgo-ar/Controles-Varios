# Pantalla de resultados de un control

Los bloques ya existen: `js/ui/resultBlocks.js`. No armes el hero a mano.
`renderResumenDetalle(container, { resumen, detalle })` envuelve todo en dos solapas fijas. Dentro de
`resumen`: `renderVerdict` (ícono + titular en prosa), `renderTiles` (label/valor/subtexto),
`renderIssues` (casos para revisar, con severidad y por qué), `renderChecks` (chequeos de
coherencia). Dentro de `detalle`: toolbar + tabla + paginación. `nr.js` es el ejemplo completo de los
dos modos.

## Antes de implementar: mockeá contra estas reglas

Estas reglas —bloques de `resultBlocks.js`, toolbar y tabla de `tableTools.js`, convención de
export— no son sólo para el código final: son también el criterio contra el que se arma el mockup
que Willy confirma antes del PR (ver "Antes de escribir el punto 3 y el punto 4" en
`nuevo-control/SKILL.md`). Un mockup que no las respeta no sirve como mockup: corregilo antes de
mostrárselo, no dejes que la corrección aparezca recién en el código real.

Criterio del proyecto: mostrar sólo lo que tiene valor real. No es forma, es lo que hace usable una
tabla de 900 legajos.

- Guard de vacío primero: `if (rows.length === 0)` → `<p class="text-muted">Sin datos.</p>`.
- Filtrá las filas sin ningún valor distinto de cero **antes de contar nada** (`hasAnyNrValue` en
  `nr.js`) y decí en un tile cuántas se ocultaron. Nunca listes un catálogo fijo con todo en cero.
- Ocultá también las columnas sin ninguna diferencia, y aclará al pie cuántas.
- Si no hay ninguna diferencia, la tabla de ceros no aporta: tarjeta verde con ✓ y salí.
- Cuando las dos distribuciones coinciden 1:1, un toggle "sólo con diferencia / todos"
  (`catXEmpleados.js`).

Toolbar y tabla salen de dos funciones de `js/ui/tableTools.js`, y las usan los 10 controles: no armes
la barra a mano ni encadenes la paginación vos.

```js
import { createResultsToolbar, wireTableTools } from '../ui/tableTools.js';

// filterSel es tu <select> de siempre ("sólo con diferencia / todos"); va a la izquierda
const { searchEl, exportEl, kpisEl } = createResultsToolbar(container, { left: filterSel });
renderExportMenu(exportEl, { onExcel, onCsv, onCopy });

// después de CADA render del <tbody> —incluido el re-render que dispara el filtro—
wireTableTools(tableHost.querySelector('table'), {
  rows: shownRows,                                  // mismo orden que los <tr>
  getLabel: r => `${r.legajo} — ${r.nombre}`,
  searchEl,
  stickyCols: 2,                                    // 0 si no querés columnas fijas
});
```

`wireTableTools` encadena paginación (50 filas + "Mostrar todas"), buscador, `enhanceGrid()`, el total
de la selección y los KPIs de la barra. Cinco cosas que se deducen mal:

- **La fila de TOTAL se recalcula sola si la ponés en un `<tfoot>`.** Cuando el analista filtra o busca,
  la etiqueta pasa a "TOTAL de la selección" y los importes bajan a las filas que quedaron. Sólo toca las
  celdas que ya mostraban un número; si alguna no se puede totalizar sale `—`, no un número inventado. No
  escribas tu propio "TOTAL — N legajos": lo va a pisar. Paginar **no** cambia el total (no cambiaste lo
  que estás mirando, sólo cuánto entra en la pantalla).
- **El rótulo de esa fila lleva la unidad: `<td colspan="2">TOTAL — ${n} legajos</td>`.** De ahí saca la
  unidad el "TOTAL de la selección — 1 legajo" al filtrar; si escribís sólo `TOTAL`, sale "1 fila", que no
  dice de qué. La celda del rótulo tiene que ocupar las columnas fijas (`colspan` = `stickyCols`) — el
  sticky y el ancho de la fila de totales se resuelven a partir de eso (D-060).
- **Del ancho no te ocupás, pero no lo peleés.** El Detalle usa el ancho de la ventana
  (`.page-content--wide`), la planilla avisa con una sombra que sigue para el costado, `enhanceGrid()`
  reserva el ancho que necesitan los totales —que tienen más dígitos que cualquier fila— y ofrece
  "Ampliar" si aún así no entra. Todo eso es automático: no le pongas `white-space`, `min-width` ni
  `overflow` a mano a las celdas, y no metas la tabla en un scroller propio (`enhanceGrid` arma el suyo;
  uno intermedio le rompe el sticky). Lo fija `tests/e2e/planillaAncha.spec.js`.
- **Tu `<select>` de filtro se dibuja como chips** si tiene hasta 4 opciones (con más sigue siendo un
  desplegable: los 18 conceptos de NR serían una pared). Los chips son sólo la piel — el `<select>` sigue
  en el DOM y sigue siendo el único que leés. No cambies cómo leés el filtro.
- La barra queda **pegada arriba** al scrollear. Si tu pantalla no es la tabla Detalle típica (sólo
  exportar, sin buscador; selects de orden propios), no la fuerces acá.
- `sticky: false` saltea `enhanceGrid` — lo usa `variaciones.js` en una de sus tablas.

La tabla, `class="data-table data-table--compact"`. Para la celda de diferencia, `diffCellHtml(v, { max })`
de `resultBlocks.js`: pinta la pastilla roja, el cero en gris y, con `absentLabel: 'sin comparar'`, el
amarillo de lo que **no se pudo** comparar — que antes se leía igual que "dio cero".

Export: `renderExportMenu(el, { onExcel, onCsv, onCopy })`. Las tres salidas llevan **todas** las
filas con diferencia y **todos** los conceptos, sin importar el filtro de pantalla. El `.xlsx` se
arma con `loadExcelJS()` de `js/utils/exportData.js`; nombre
`<Control>_<Modo>_${periodSuffix(results.period)}.xlsx`.

**Ningún color cableado en `js/`, ni uno.** `tests/themeSourceOfTruth.test.js` falla si aparece un `#hex`
en cualquier módulo de `js/` (la única excepción declarada es `js/controls/variaciones.js`, que arma un
documento HTML aparte para imprimir a PDF, sin las hojas de la app). Todo sale de `css/tokens.css`:
`var(--color-danger)`, `var(--color-success)`, `var(--sp-3)`. Si te falta un tinte —por ejemplo uno por
grupo de concepto—, el token nuevo va a `tokens.css` con su valor en los tres temas, y el módulo lo pide
por `var(--…)`. Tampoco preguntes por el tema desde `js/` (nada de `data-theme`): el único que puede es
`js/main.js`, que es quien lo aplica. Y el serif se pide por `--font-display`, nunca por `--serif`: es
tipografía de un solo tema.

Los temas son **tres** —Sobrio (default), Intenso y Oscuro— y hay que mirar la pantalla en los tres antes
de darla por cerrada. Ya hubo un badge ilegible, y en la última pasada tres cosas más (D-059).

Números: `toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`, y `'—'`
para `null`.
