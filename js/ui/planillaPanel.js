// planillaPanel.js — La solapa **Planilla** completa (§5 de
// specs/vista-estandar-resultados.md): la barra estándar arriba y la tabla ancha
// con bandas abajo, enganchadas entre sí.
//
// Es el gemelo de `renderFichasPanel()` (js/ui/fichaList.js) para la otra solapa.
// La ficha sirve para entender UN caso; la planilla, para comparar entre casos y
// totalizar — y 19 de los 21 controles la tienen. Hasta acá cada uno armaba su
// mitad a mano: `createEstadoFilter` + `createResultsToolbar` +
// `renderRubroGrid` + `wireTableTools` + el cruce del chip con el buscador, cinco
// llamadas y treinta líneas repetidas diecinueve veces. Acá el control declara
// SUS COLUMNAS, en qué estado cerró cada fila y qué exporta; todo lo demás lo
// hereda (§10: "eso es lo que hace que salga con esto por defecto").
//
// El orden de la barra es el del §3 y no lo decide el control:
//
//   [chips de estado] [buscador] [Marcas ▾] ····· [KPIs] [⬇ Exportar ▾]
//
// El **`⬇ Exportar ▾` va último, siempre**. Ningún control inventa otro botón de
// exportar ni le cambia el rótulo.
//
// ── Cómo filtra ──────────────────────────────────────────────────────────────
// Los chips y "Marcas ▾" NO re-dibujan la tabla: ocultan filas. Eso es lo que
// hace que la fila de TOTAL pase a "TOTAL de la selección — N legajos" y que el
// KPI diga "23 de 514 filas" (`initSelectionTotals` / `initToolbarKpis`, vía
// `wireTableTools`). Y es también lo que hace que **las columnas no cambien al
// cambiar de chip**: antes, pasar de "sólo con diferencia" a "todos" hacía
// aparecer y desaparecer columnas, y el analista perdía la referencia de dónde
// estaba mirando.

import { renderRubroGrid } from './resultBlocks.js';
import {
  createResultsToolbar, createEstadoFilter, createMarcasFilter, contarEstados, wireTableTools,
} from './tableTools.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
 * @param {HTMLElement} panel - el panel de la solapa
 * @param {object} opts
 * @param {object[]} opts.columns - los descriptores de `renderRubroGrid()`
 *   (`{ key, label, sub, num, band, close, cell, total }`). El `sub` es la BASE
 *   DE CÁLCULO de la columna, en criollo: es lo que hace que la planilla se
 *   explique sola.
 * @param {object[]} opts.rows
 * @param {(row: object) => string} [opts.estadoDe] - en qué estado cerró cada
 *   fila (`'conDif'|'margen'|'centavo'|'sinComparar'`, ver `estadoDeFila()`).
 *   Sin esto la barra sale sin chips — sólo para una planilla que no compara
 *   nada contra nada.
 * @param {Record<string,string>} [opts.noAplica] - estado → por qué no aplica a
 *   este control. El chip sale igual, en gris con su 0 y ese texto en el `title`.
 * @param {{ value: string, label: string, match: (row: object) => boolean }[]} [opts.marcas]
 * @param {(row: object) => string} opts.getLabel - el texto buscable de una fila
 * @param {string} [opts.searchLabel] · @param {string} [opts.searchPlaceholder]
 * @param {string} [opts.unitLabel='legajos'] - la unidad que cuenta el TOTAL
 * @param {(exportEl: HTMLElement) => void} [opts.onExport]
 * @param {(host: HTMLElement) => void} [opts.beforeTable] - nota o leyenda entre
 *   la barra y la tabla (la que dice cuántas columnas se ocultaron, por ejemplo)
 * @param {(host: HTMLElement) => void} [opts.afterTable] - la nota al pie
 * @param {boolean} [opts.totals=true] · @param {boolean} [opts.bands=true]
 * @param {0|1|2} [opts.stickyCols=2]
 * @param {number} [opts.col1Width] · @param {number} [opts.pageSize]
 * @param {string} [opts.empty] - qué decir cuando no hay ni una fila
 * @returns {{ tableEl, wrap, toolbar, tools, estadoSel, marcaSel }|null}
 */
export function renderPlanillaPanel(panel, {
  columns, rows,
  estadoDe, noAplica = {}, marcas = [],
  getLabel, searchLabel, searchPlaceholder,
  unitLabel = 'legajos',
  onExport, beforeTable, afterTable,
  totals = true, bands = true, stickyCols = 2, col1Width, pageSize,
  empty = 'No hay nada para mostrar.',
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
  const { toolbar, searchEl, exportEl } = createResultsToolbar(panel, { left });
  onExport?.(exportEl);

  // ── La tabla ───────────────────────────────────────────────────────────────
  beforeTable?.(panel);

  // Sin scroller propio alrededor: el de la planilla lo arma `enhanceGrid()`
  // pegado a la tabla, y uno intermedio se tragaría la nota al pie (D-060).
  const tableHost = document.createElement('div');
  panel.appendChild(tableHost);
  const { tableEl, wrap } = renderRubroGrid(tableHost, {
    columns, rows, unitLabel, totals, bands, stickyCols,
    ...(col1Width !== undefined ? { col1Width } : {}),
  });

  afterTable?.(panel);

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

  function filtrar() {
    const estado = estadoSel?.value || 'todos';
    const marcaDef = marcas.find(m => m.value === marcaSel?.value) || null;
    if (estado === 'todos' && !marcaDef) { tools.setFilter(null); return; }

    const set = new Set();
    rows.forEach((r, i) => {
      if (!trs[i]) return;
      if (estado !== 'todos' && estadoPorFila?.get(r) !== estado) return;
      if (marcaDef && !marcaDef.match(r)) return;
      set.add(trs[i]);
    });
    tools.setFilter(set);
  }

  estadoSel?.addEventListener('change', filtrar);
  marcaSel?.addEventListener('change', filtrar);

  // Arranca en el estado que `createEstadoFilter` dejó elegido ("Con diferencia"
  // si hay alguno): el filtro inicial se aplica igual que si lo hubiera tocado
  // el analista, así la tabla, el TOTAL y el KPI coinciden con el chip encendido.
  filtrar();

  return { tableEl, wrap, toolbar, tools, estadoSel, marcaSel };
}
