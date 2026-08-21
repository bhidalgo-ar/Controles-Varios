// planillaPanel.js — La solapa **Planilla** completa (§2, §3 y §5 de
// specs/vista-estandar-resultados.md): la barra estándar arriba y la tabla ancha
// con bandas abajo, enganchadas entre sí.
//
// Es el gemelo de `renderFichasPanel()` (js/ui/fichaList.js) para la otra
// solapa. La ficha sirve para entender UN caso; la planilla, para comparar entre
// casos y totalizar — y **19 de los 21 controles la tienen**. Hasta acá cada uno
// armaba su mitad a mano: `createEstadoFilter` + `createResultsToolbar` +
// `renderRubroGrid` + `wireTableTools` + el cruce del chip con el buscador, cinco
// llamadas y treinta líneas repetidas diecinueve veces. Acá el control declara
// SUS COLUMNAS, en qué estado cerró cada fila y qué exporta; todo lo demás lo
// hereda (§10: "eso es lo que hace que salga con esto por defecto").
//
// El orden de la barra es el del §3 y no lo decide el control:
//
//   [chips de estado] [Marcas ▾] [buscador] ····· [KPIs] [⬇ Exportar ▾]
//
// El **`⬇ Exportar ▾` va último, siempre**. Ningún control inventa otro botón de
// exportar ni le cambia el rótulo.
//
// Lo que NO hace: no calcula nada. `estadoDe()` lo escribe cada control con la
// regla que ya usa —el monto de diferencia del cliente o el propio (D-069)— y
// esta pieza sólo lo cuenta, lo filtra y lo totaliza.
//
// ── Cómo filtra: la tabla se dibuja UNA vez ──────────────────────────────────
// Los chips y "Marcas ▾" NO re-dibujan la tabla: ocultan filas. Eso es lo que
// hace que la fila de TOTAL pase a "TOTAL de la selección — N legajos" y que el
// KPI diga "23 de 514 filas" (`initSelectionTotals` / `initToolbarKpis`, vía
// `wireTableTools`). Y es lo que hace dos cosas más, las dos pedidas:
//
//   1. **Las columnas no cambian al cambiar de chip.** Antes, pasar de "sólo con
//      diferencia" a "todos" hacía aparecer y desaparecer columnas, y el analista
//      perdía la referencia de dónde estaba mirando. El descriptor se resuelve
//      sobre TODAS las filas, una sola vez.
//   2. **El chip y el buscador son dos criterios sobre la misma selección, y se
//      cruzan** (lo hace `wireTableTools`, D-078). Con la tabla re-dibujada en
//      cada filtro esto no se puede sostener: `initSearchCombobox()` reescribe el
//      `innerHTML` del buscador, así que tocar un chip le borraba al analista lo
//      que había tipeado. Dibujando una vez, la búsqueda sobrevive al chip.
//
// La única cosa que sí reordena el `<tbody>` es `sortable` (§ más abajo), y lo
// hace moviendo las `<tr>` que ya existen, no rehaciéndolas: así el buscador, la
// paginación y el TOTAL siguen apuntando a las mismas filas.

import { renderRubroGrid } from './resultBlocks.js';
import {
  createResultsToolbar, createEstadoFilter, createMarcasFilter, contarEstados, wireTableTools,
} from './tableTools.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtInt(n) {
  return Math.round(n || 0).toLocaleString('es-AR');
}

/** `columns` y `footnote` pueden venir como valor o como función. */
function resolve(v, ...args) {
  return typeof v === 'function' ? v(...args) : v;
}

/**
 * Los cuatro estados de caso, para un control que **genera un archivo** desde el
 * Tabulado en vez de cruzar dos: ahí no hay nada que haya cerrado o dejado de
 * cerrar. Los chips salen igual —en gris, con su 0 y con este texto en el
 * `title`— porque la fila de chips tiene que ser la misma en las 21 pantallas:
 * esconderlos movería de lugar a los demás, que es justo lo que este estándar
 * viene a arreglar (§3).
 */
export const NO_APLICA_REPORTE = Object.fromEntries(
  ['conDif', 'margen', 'centavo', 'sinComparar'].map(e => [e,
    'arma un archivo desde el Tabulado y no lo cruza contra nada, así que no hay '
    + 'nada que pueda cerrar o no cerrar']),
);

/**
 * El descriptor de la planilla de un control que **genera un archivo**, a partir
 * de las columnas de su contrato de exportación (`contractColDefs`). Las
 * columnas y su orden son las del archivo que se entrega y no se tocan: lo único
 * que agrega la vista estándar es la BANDA (qué es cada bloque) y el SUBLABEL
 * (de dónde sale el valor), que es lo que hace que la planilla se explique sola.
 *
 * @param {{ key: string, label: string, type?: string }[]} colDefs
 * @param {Record<string, { band: string, sub?: string }>} bandas - por `key`
 */
export function reporteColumns(colDefs, bandas) {
  return colDefs.map(c => ({
    key: c.key,
    label: c.label,
    band: bandas[c.key]?.band ?? '',
    sub: bandas[c.key]?.sub,
    num: c.type === 'num',
  }));
}

/**
 * La solapa Planilla de un control, entera.
 *
 * @param {HTMLElement} panel - el panel de la solapa (se le agrega la barra y la tabla)
 * @param {object} opts
 * @param {object[]} opts.rows - una fila por unidad (legajo, cuenta, lista, línea…)
 * @param {object[]|((rows: object[]) => object[])} opts.columns - los descriptores
 *   de `renderRubroGrid()` (`{ key, label, sub, num, band, close, cell, total }`,
 *   más `mag: true` para marcar la celda Δ). El `sub` es la BASE DE CÁLCULO de la
 *   columna, en criollo: es lo que hace que la planilla se explique sola. Como
 *   función recibe TODAS las filas —nunca la selección—: sirve para ocultar la
 *   columna que en esta corrida no tiene ningún valor, sin que la tabla cambie de
 *   forma cuando el analista toca un chip.
 * @param {(row: object) => string} [opts.estadoDe] - en qué estado cerró cada
 *   fila (`'conDif'|'margen'|'centavo'|'sinComparar'`, ver `estadoDeFila()`).
 *   Sin esto la barra sale sin chips — sólo para una planilla que no compara
 *   nada contra nada.
 * @param {Record<string,string>} [opts.noAplica] - estado → por qué no aplica a
 *   este control. El chip sale igual, en gris con su 0 y ese texto en el `title`.
 * @param {{ value: string, label: string, match: (row: object) => boolean }[]} [opts.marcas]
 *   El segundo eje: qué MÁS le pasa a la fila, que no es cómo cerró.
 * @param {(row: object) => string} opts.getLabel - el texto buscable de una fila
 * @param {string} [opts.searchLabel] · @param {string} [opts.searchPlaceholder]
 * @param {string} [opts.unitLabel='legajos'] - la unidad que declara el control
 *   en `unit`; es la que cuenta la fila de TOTAL.
 * @param {(exportEl: HTMLElement) => void} [opts.onExport] - el control monta acá
 *   su `renderExportMenu()`; va último, siempre.
 * @param {(host: HTMLElement) => void} [opts.beforeTable] - nota o leyenda entre
 *   la barra y la tabla (la que dice cuántas columnas se ocultaron, por ejemplo).
 *   Se dibuja una sola vez, no en cada filtro.
 * @param {(host: HTMLElement) => void} [opts.afterTable] - lo que va abajo de la
 *   tabla (una nota al pie, otra tablita). Una sola vez, igual que `beforeTable`.
 * @param {string|((shown: object[], todas: object[]) => string)} [opts.footnote]
 *   La nota al pie que SÍ sigue al filtro ("Mostrando 23 de 514 legajos…").
 * @param {boolean} [opts.totals=true] · @param {boolean} [opts.bands=true]
 * @param {0|1|2} [opts.stickyCols=2]
 * @param {number} [opts.col1Width] · @param {number} [opts.pageSize]
 * @param {boolean} [opts.sortable=false] - encabezados clickeables para ordenar.
 *   Sólo donde el control YA lo tenía: la planilla del estándar no ordena (el
 *   `Orden ▾` es de la solapa Fichas, D-078), y sumarlo donde no estaba sería
 *   inventar.
 * @param {string} [opts.empty] - qué decir cuando no hay ni una fila
 * @param {string} [opts.emptyText] - qué decir cuando el filtro no deja ninguna
 *   fila. Sin esto se usa `empty`.
 * @returns {{ tableEl, wrap, toolbar, tools, estadoSel, marcaSel, searchEl, exportEl, kpisEl, redraw }|null}
 */
export function renderPlanillaPanel(panel, {
  columns, rows,
  estadoDe, noAplica = {}, marcas = [],
  getLabel, searchLabel, searchPlaceholder,
  unitLabel = 'legajos',
  onExport, beforeTable, afterTable, footnote,
  totals = true, bands = true, stickyCols = 2, col1Width, pageSize,
  sortable = false,
  empty = 'No hay nada para mostrar.', emptyText,
} = {}) {
  if (!rows || rows.length === 0) {
    panel.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(empty)}</p>`;
    return null;
  }

  // ── La barra ───────────────────────────────────────────────────────────────
  const estadoPorFila = estadoDe ? new Map(rows.map(r => [r, estadoDe(r)])) : null;
  const estadoSel = estadoPorFila
    ? createEstadoFilter({ counts: contarEstados(rows, r => estadoPorFila.get(r)), noAplica })
    : null;
  const marcaWrap = marcas.length ? createMarcasFilter(marcas, rows) : null;

  const left = [estadoSel, marcaWrap].filter(Boolean);
  const { toolbar, searchEl, exportEl, kpisEl } = createResultsToolbar(panel, { left });
  onExport?.(exportEl);

  // ── La tabla ───────────────────────────────────────────────────────────────
  beforeTable?.(panel);

  // Sin scroller propio alrededor: el de la planilla lo arma `enhanceGrid()`
  // pegado a la tabla, y uno intermedio se tragaría la nota al pie (D-060).
  const tableHost = document.createElement('div');
  panel.appendChild(tableHost);

  // El cartel de "ningún caso quedó con los filtros puestos" vive al lado de la
  // tabla y no en su lugar: la tabla se dibuja una sola vez, así que se esconde
  // y se muestra en vez de rehacerse.
  const vacio = document.createElement('p');
  vacio.className = 'text-muted';
  vacio.style.cssText = 'padding:var(--sp-4);';
  vacio.textContent = emptyText || 'Ninguna fila quedó con los filtros puestos.';
  vacio.hidden = true;
  panel.appendChild(vacio);

  // Las columnas se resuelven sobre TODAS las filas, no sobre las visibles: si se
  // resolvieran sobre el filtro, una columna aparecería y desaparecería al tocar
  // un chip y la planilla dejaría de ser la misma tabla.
  const cols = resolve(columns, rows) || [];
  const { tableEl, wrap } = renderRubroGrid(tableHost, {
    columns: cols, rows, unitLabel, totals, bands, stickyCols,
    ...(col1Width !== undefined ? { col1Width } : {}),
  });
  marcarCeldasDeDiferencia(tableEl, cols);

  afterTable?.(panel);

  // La nota al pie que sigue al filtro va DESPUÉS de `afterTable`: es lo último
  // de la solapa, como la fila de TOTAL es lo último de la tabla.
  let pie = null;
  if (footnote !== undefined) {
    pie = document.createElement('p');
    pie.className = 'text-muted';
    pie.style.cssText = 'font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);';
    panel.appendChild(pie);
  }

  // Sólo el `<tbody>` entra en paginación y búsqueda: el `<tfoot>` es la fila de
  // TOTAL, que `enhanceGrid()` fija abajo. `sticky: false` porque los
  // superpoderes ya se los puso `renderRubroGrid()`.
  const tools = wireTableTools(tableEl, {
    rows, getLabel, searchEl, sticky: false,
    ...(searchLabel !== undefined ? { label: searchLabel } : {}),
    ...(searchPlaceholder !== undefined ? { placeholder: searchPlaceholder } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
  });

  // ── Los filtros de la barra ────────────────────────────────────────────────
  const marcaSel = marcaWrap?.querySelector('select') || null;
  const trs = tools.dataRows;
  const trDe = new Map(rows.map((r, i) => [r, trs[i]]));

  /** Las filas que pasan el chip de estado y la marca — sin el buscador, que es
   *  el otro eje y lo cruza `wireTableTools`. `null` = ningún filtro puesto, que
   *  es lo que le devuelve a la fila de TOTAL su valor original: con un filtro
   *  activo el TOTAL se recalcula sumando lo que se ve, y una columna cuyo total
   *  no es la suma (`total: () => …`) sólo puede mostrar ese valor sin filtro. */
  function seleccion() {
    const estado = estadoSel?.value || 'todos';
    const marcaDef = marcas.find(m => m.value === marcaSel?.value) || null;
    if (estado === 'todos' && !marcaDef) return null;
    return rows.filter(r =>
      (estado === 'todos' || estadoPorFila?.get(r) === estado)
      && (!marcaDef || marcaDef.match(r)));
  }

  function filtrar() {
    const sel = seleccion();
    const shown = sel ?? rows;
    tools.setFilter(sel === null ? null : new Set(sel.map(r => trDe.get(r)).filter(Boolean)));

    if (pie) pie.textContent = resolve(footnote, shown, rows) || '';

    // Con la selección vacía se esconde la tabla y se dice por qué: dejar el
    // encabezado y la fila de TOTAL sobre un cuerpo sin filas se lee como si el
    // control no hubiera traído nada.
    const vaciaLaSeleccion = shown.length === 0;
    if (wrap) wrap.hidden = vaciaLaSeleccion;
    vacio.hidden = !vaciaLaSeleccion;
    // El KPI se reescribe a mano: dejarlo con el número del dibujo anterior
    // sería un número que no cierra con nada de lo que se ve en pantalla.
    if (vaciaLaSeleccion && kpisEl) {
      kpisEl.innerHTML = `<span class="results-kpi"><strong>0</strong> de ${fmtInt(rows.length)} filas</span>`;
    }
  }

  estadoSel?.addEventListener('change', filtrar);
  marcaSel?.addEventListener('change', filtrar);

  if (sortable) wireSorting(tableEl, cols, rows, trDe, trs, filtrar);

  // Arranca en el estado que `createEstadoFilter` dejó elegido ("Con diferencia"
  // si hay alguno): el filtro inicial se aplica igual que si lo hubiera tocado
  // el analista, así la tabla, el TOTAL y el KPI coinciden con el chip encendido.
  filtrar();

  return {
    tableEl, wrap, toolbar, tools, estadoSel, marcaSel, searchEl, exportEl, kpisEl,
    redraw: filtrar,
  };
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

/**
 * Encabezados clickeables para ordenar, sólo donde el control ya los tenía.
 *
 * **Reordena moviendo las `<tr>` que ya están**, no rehaciendo la tabla: el
 * buscador, la paginación y el TOTAL de la selección apuntan a esas mismas filas
 * (`tools.dataRows`), así que rehacerlas les cortaría el hilo — y `dataRows` se
 * reordena en el mismo movimiento para que "los primeros 50" sean los primeros
 * 50 **del orden nuevo** y no del original.
 *
 * Primer click descendente en los importes y ascendente en el texto; el segundo
 * invierte.
 */
function wireSorting(tableEl, cols, rows, trDe, trs, filtrar) {
  let orden = null; // { key, dir }
  const tbody = tableEl.tBodies[0];
  if (!tbody) return;

  function pintarEncabezados() {
    const ths = [...(tableEl.tHead?.rows?.[1]?.cells || [])];
    ths.forEach((th, i) => {
      const col = cols[i];
      if (!col || col.sortable === false) return;
      th.querySelector('.rb-col__sort')?.remove();
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
        (th.querySelector('.rb-col__label') || th).appendChild(flecha);
      }
      if (th.dataset.plsorted === '1') return;
      th.dataset.plsorted = '1';
      th.addEventListener('click', () => {
        orden = (orden && orden.key === col.key)
          ? { key: col.key, dir: orden.dir === 'asc' ? 'desc' : 'asc' }
          : { key: col.key, dir: col.num ? 'desc' : 'asc' };
        aplicarOrden();
      });
    });
  }

  function aplicarOrden() {
    const col = cols.find(c => c.key === orden?.key);
    if (col) {
      const ordenadas = [...rows].sort(comparador(col, orden.dir));
      // El `<tbody>` y `dataRows` se reordenan juntos; la fila de "Mostrar
      // todas" vuelve al final, que es donde la dejó la paginación.
      const masRow = tbody.querySelector(':scope > tr.table-show-more-row');
      for (const r of ordenadas) {
        const tr = trDe.get(r);
        if (tr) tbody.appendChild(tr);
      }
      if (masRow) tbody.appendChild(masRow);
      trs.length = 0;
      for (const r of ordenadas) { const tr = trDe.get(r); if (tr) trs.push(tr); }
    }
    pintarEncabezados();
    filtrar();
  }

  pintarEncabezados();
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
