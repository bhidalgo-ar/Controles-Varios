// planillaPanel.js — La solapa Planilla completa, para los controles que NO
// llevan ficha (§2, §3 y §5 de specs/vista-estandar-resultados.md).
//
// Es el gemelo de `renderFichasPanel()` (js/ui/fichaList.js): la misma barra —
// los cinco chips de estado · el buscador · `Marcas ▾` · el KPI de la selección ·
// el `⬇ Exportar ▾` último— pero sobre la tabla ancha en vez de sobre una lista
// de tarjetas. La ficha explica UN caso; la planilla compara ENTRE casos.
//
// Existe porque el estándar tiene dos formas de detalle y hasta acá sólo la de
// las fichas estaba armada como pieza: cada control que no lleva ficha repetía a
// mano las mismas ~35 líneas —contar los estados, chipificar, cruzar el filtro
// con la búsqueda, redibujar la tabla— y ahí es donde 21 pantallas empiezan a
// divergir de nuevo. Acá el control declara SUS COLUMNAS y EN QUÉ ESTADO CERRÓ
// CADA FILA, y nada más.
//
// Lo que NO hace: no calcula nada. `estadoDe()` lo escribe cada control con la
// regla que ya usa —el monto de diferencia del cliente o el propio (D-069)— y
// esta pieza sólo lo cuenta y lo filtra.

import { renderRubroGrid } from './resultBlocks.js';
import { createResultsToolbar, createEstadoFilter, wireTableTools } from './tableTools.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtInt(n) {
  return Math.round(n || 0).toLocaleString('es-AR');
}

/** `rows`/`columns`/`footnote` pueden venir como valor o como función de la selección. */
function resolve(v, ...args) {
  return typeof v === 'function' ? v(...args) : v;
}

/**
 * La solapa Planilla de un control, entera.
 *
 * @param {HTMLElement} panel - el panel de la solapa (se le agrega la barra y la tabla)
 * @param {object} opts
 * @param {object[]} opts.rows - una fila por unidad (legajo, cuenta, lista…)
 * @param {object[]|((rows: object[]) => object[])} opts.columns - el descriptor
 *   de `renderRubroGrid()` (`{ key, label, sub, num, band, close, cell, total }`,
 *   más `mag: true` para marcar la celda Δ). Como función recibe TODAS las filas:
 *   sirve para ocultar la columna que en esta corrida no tiene ningún valor.
 * @param {string} [opts.unitLabel='legajos'] - la unidad que declara el control
 *   en `unit`; es la que cuenta la fila de TOTAL.
 * @param {(row: object) => 'conDif'|'margen'|'centavo'|'sinComparar'} opts.estadoDe
 * @param {Record<string,string>} [opts.noAplica] - estado → por qué no aplica a
 *   este control. El chip sale igual, en gris y con su 0, y lo dice en el `title`:
 *   sacarlo movería los demás de lugar (§3).
 * @param {{ value: string, label: string, match: (row: object) => boolean }[]} [opts.marcas]
 *   El segundo eje: qué MÁS le pasa a la fila, que no es cómo cerró.
 * @param {(row: object) => string} opts.getLabel - texto buscable
 * @param {(exportEl: HTMLElement) => void} [opts.onExport] - el control monta acá
 *   su `renderExportMenu()`; va último, siempre.
 * @param {string|((shown: object[], todas: object[]) => string)} [opts.footnote]
 * @param {string} [opts.emptyText] - qué decir cuando el filtro no deja ninguna fila
 * @param {boolean} [opts.sortable=false] - encabezados clickeables para ordenar.
 *   Sólo donde el control YA lo tenía: la planilla del estándar no ordena (el
 *   `Orden ▾` es de la solapa Fichas), y sumarlo donde no estaba sería inventar.
 * @returns {{ toolbar, searchEl, exportEl, kpisEl, redraw: () => void }|null}
 */
export function renderPlanillaPanel(panel, {
  rows, columns, unitLabel = 'legajos',
  estadoDe, noAplica = {}, marcas = [],
  getLabel, onExport, footnote, emptyText,
  totals = true, stickyCols = 2, col1Width, pageSize,
  searchLabel, searchPlaceholder, sortable = false,
} = {}) {
  if (!rows?.length) {
    panel.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${
      esc(emptyText || 'Sin datos.')}</p>`;
    return null;
  }

  // En qué estado cerró cada fila, una sola vez: el filtro y los chips leen de
  // acá, así que nunca pueden decir cosas distintas.
  const estadoPorFila = new Map(rows.map(r => [r, estadoDe ? estadoDe(r) : 'centavo']));
  const counts = { todos: rows.length };
  for (const r of rows) {
    const e = estadoPorFila.get(r);
    counts[e] = (counts[e] || 0) + 1;
  }

  const estadoSel = createEstadoFilter({ counts, noAplica });
  const left = [estadoSel];
  const marcaSel = marcas.length ? marcasDropdown(marcas, rows) : null;
  if (marcaSel) left.push(marcaSel);

  const { toolbar, searchEl, exportEl, kpisEl } = createResultsToolbar(panel, { left });
  onExport?.(exportEl);

  // Sin scroller propio: el de la planilla lo arma `enhanceGrid()` alrededor de
  // la tabla, y uno intermedio además se tragaría la nota al pie (D-060).
  const tableHost = document.createElement('div');
  panel.appendChild(tableHost);

  const pie = document.createElement('p');
  pie.className = 'text-muted';
  pie.style.cssText = 'font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);';
  panel.appendChild(pie);

  const marcaSelEl = marcaSel?.querySelector('select');
  let orden = null; // { key, dir } — sólo con `sortable`

  function seleccion() {
    const estado = estadoSel.value;
    const marcaDef = marcas.find(m => m.value === marcaSelEl?.value);
    return rows.filter(r =>
      (estado === 'todos' || estadoPorFila.get(r) === estado)
      && (!marcaDef || marcaDef.match(r)));
  }

  function redraw() {
    let shown = seleccion();
    // Las columnas se resuelven sobre TODAS las filas, no sobre las visibles:
    // si se resolvieran sobre el filtro, una columna aparecería y desaparecería
    // al tocar un chip y la planilla dejaría de ser la misma tabla.
    const cols = resolve(columns, rows) || [];
    if (orden) {
      const col = cols.find(c => c.key === orden.key);
      if (col) shown = [...shown].sort(comparador(col, orden.dir));
    }

    tableHost.innerHTML = '';
    pie.textContent = resolve(footnote, shown, rows) || '';

    if (shown.length === 0) {
      tableHost.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${
        esc(emptyText || 'Ninguna fila queda con los filtros puestos.')}</p>`;
      // El KPI se reescribe a mano: dejarlo con el número del dibujo anterior
      // sería un número que no cierra con nada de lo que se ve en pantalla.
      if (kpisEl) {
        kpisEl.innerHTML = `<span class="results-kpi"><strong>0</strong> de ${fmtInt(rows.length)} filas</span>`;
      }
      return;
    }

    const { tableEl } = renderRubroGrid(tableHost, {
      columns: cols, rows: shown, unitLabel, totals, stickyCols,
      ...(col1Width !== undefined ? { col1Width } : {}),
    });

    marcarCeldasDeDiferencia(tableEl, cols);
    if (sortable) wireSorting(tableEl, cols);

    // Sólo el <tbody> entra a la paginación y a la búsqueda: el <tfoot> es la
    // fila de TOTAL, que queda afuera para que `enhanceGrid()` la pueda fijar
    // abajo. `sticky: false` porque los superpoderes de la planilla ya se los
    // puso `renderRubroGrid()`.
    wireTableTools(tableEl, {
      rows: shown, getLabel, searchEl, sticky: false,
      ...(pageSize !== undefined ? { pageSize } : {}),
      ...(searchLabel !== undefined ? { label: searchLabel } : {}),
      ...(searchPlaceholder !== undefined ? { placeholder: searchPlaceholder } : {}),
    });
  }

  /** Primer click descendente en los importes y ascendente en el texto; el segundo invierte. */
  function wireSorting(tableEl, cols) {
    const ths = [...(tableEl.tHead?.rows?.[1]?.cells || [])];
    ths.forEach((th, i) => {
      const col = cols[i];
      if (!col || col.sortable === false) return;
      const activa = orden?.key === col.key;
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      th.title = `Ordenar por ${col.label}`;
      th.setAttribute('aria-sort', activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none');
      if (activa) {
        const flecha = document.createElement('span');
        flecha.className = 'rb-col__sort';
        flecha.setAttribute('aria-hidden', 'true');
        flecha.textContent = orden.dir === 'asc' ? ' ▲' : ' ▼';
        th.querySelector('.rb-col__label')?.appendChild(flecha);
      }
      th.addEventListener('click', () => {
        orden = (orden && orden.key === col.key)
          ? { key: col.key, dir: orden.dir === 'asc' ? 'desc' : 'asc' }
          : { key: col.key, dir: col.num ? 'desc' : 'asc' };
        redraw();
      });
    });
  }

  estadoSel.addEventListener('change', redraw);
  marcaSelEl?.addEventListener('change', redraw);

  // Arranca en el estado que dejó elegido `createEstadoFilter()` ("Con
  // diferencia" si hay alguno): la tabla y el KPI coinciden con el chip
  // encendido desde el primer dibujo.
  redraw();

  return { toolbar, searchEl, exportEl, kpisEl, redraw };
}

/**
 * La celda Δ de la planilla se marca como `.rb-magcell`: es lo que ubica la
 * barra de magnitud debajo del badge y lo que le permite al KPI de la barra
 * contar "N con diferencias" — ese conteo sale de la tabla ya pintada, no de los
 * datos, así que sin la clase el KPI no aparece. El descriptor de columnas no
 * tiene forma de poner una clase en el `<td>`, así que se pone acá con
 * `mag: true` y en un solo lugar.
 */
function marcarCeldasDeDiferencia(tableEl, cols) {
  const filas = [...(tableEl.tBodies[0]?.rows || [])];
  cols.forEach((c, i) => {
    if (!c.mag) return;
    for (const tr of filas) tr.cells[i]?.classList.add('rb-magcell');
  });
}

/** Los nulls van siempre al final, en los dos sentidos: ordenar no puede esconder al que no tiene dato. */
function comparador(col, dir) {
  const signo = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    const va = a[col.key];
    const vb = b[col.key];
    const na = va === null || va === undefined || (col.num && !Number.isFinite(va));
    const nb = vb === null || vb === undefined || (col.num && !Number.isFinite(vb));
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    if (col.num) return (va - vb) * signo;
    const ia = parseInt(va, 10), ib = parseInt(vb, 10);
    if (isFinite(ia) && isFinite(ib) && ia !== ib) return (ia - ib) * signo;
    return String(va).localeCompare(String(vb), 'es') * signo;
  };
}

/**
 * El segundo eje, desplegable y propio de cada control (§3). No son chips: el
 * estado dice CÓMO CERRÓ el caso y la marca dice QUÉ MÁS LE PASA — mezclarlos
 * haría que la fila de chips diga algo distinto en cada pantalla, que es lo
 * contrario de lo que se pidió.
 */
export function marcasDropdown(marcas, rows, { label = 'Marcas' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'form-group results-toolbar__drop';
  wrap.innerHTML = `
    <select class="form-select form-select--sm" data-planilla-marca aria-label="${esc(label)}">
      <option value="">${esc(label)} ▾</option>
      ${marcas.map(m => {
        const n = rows.filter(m.match).length;
        return `<option value="${esc(m.value)}"${n === 0 ? ' disabled' : ''}>${esc(m.label)} (${fmtInt(n)})</option>`;
      }).join('')}
    </select>
  `;
  return wrap;
}
