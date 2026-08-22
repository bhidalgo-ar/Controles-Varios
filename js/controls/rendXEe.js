// rendXEe.js — Control: Rendimiento x EE
//
// Cruza el Reporte de Costo Total por empleado de M4 contra el Costo Total
// calculado desde el Tabulado. Por cada legajo suma los 5 totalizadores de
// Rend vs Tabulado (PRECIO, ASIG. ESTÍMULO, CARGAS SS, PROV. MES, PROV. CCSS MES)
// usando la misma agrupación de conceptos, y compara contra el Costo Total del reporte.
//
// Dif = Costo Total (Reporte) − Costo Total (Calculado del Tabulado).

import { DEFAULT_CONCEPT_CONFIG, leyendaDeConceptos } from './rendVsTabu.js';
import { diffStats } from './semaforo.js';
import { isDiff, currentTolerance } from './tolerance.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { estadoDeFila } from '../ui/tableTools.js';
import { renderPlanillaPanel } from '../ui/planillaPanel.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { buildColByCode } from './tabCodes.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { formatAmount as fmt, toNum } from '../utils/currency.js';
import { periodSuffix } from '../utils/dates.js';
import { resumenStats } from './resumenStats.js';
import {
  renderVerdict, renderTiles, renderIssues, renderResumenDetalle,
  mvClass, mvArrow, fmtSigned,
} from '../ui/resultBlocks.js';

// ── Definición de columnas calculadas desde el Tabulado ──────────────────────
// Mismos colores que las categorías de Rend vs Tabulado.

// Los colores del .xlsx viven en `js/exports/contracts.js` (`rend_x_ee`), que es
// quien alimenta al writer. Los de PANTALLA no están más acá: el tinte de cada
// banda lo pone la pieza compartida, que es lo que hace que la misma categoría
// salga del mismo color en los tres controles de Rendimiento.
const CATS = [
  { key: 'precio',   label: 'PRECIO' },
  { key: 'estimulo', label: 'ASIG. ESTÍMULO' },
  { key: 'cargas',   label: 'CARGAS SS' },
  { key: 'provMes',  label: 'PROV. MES' },
  { key: 'provCcss', label: 'PROV. CCSS MES' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v) { return v != null ? String(v).trim() : ''; }



// Qué cuenta como diferencia sale del monto del cliente (D-069).
const hasDiff = d => isDiff(d);


// ── summarizeRendXEe ──────────────────────────────────────────────────────────

export function summarizeRendXEe(results) {
  const s = results.summary;
  const anyIssue = s.conDif > 0 || s.sinTabData > 0 || s.soloEnTab > 0;

  // Unidad = legajo. sinTabData/soloEnTab son legajos huérfanos (dif: null en
  // ambos casos) — no tienen ambos lados del cruce, así que no entran en el
  // monto de diferencia ni en el "peor caso", sólo afectan el status arriba.
  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    results.rows,
    [{ key: 'dif', get: r => r.dif }],
    row => `leg. ${row.legajo}`
  );

  return {
    status:   anyIssue ? 'warning' : 'success',
    headline: `${s.total} legajos · ${s.conDif} con diferencias de Costo Total`,
    insights: [
      {
        type:  s.conDif > 0 ? 'warning' : 'success',
        label: 'legajos con diferencia Reporte vs Calculado',
        value: s.conDif,
      },
      {
        type:  s.sinTabData > 0 ? 'warning' : 'success',
        label: 'legajos del reporte sin datos en Tabulado',
        value: s.sinTabData,
      },
      {
        type:  s.soloEnTab > 0 ? 'warning' : 'success',
        label: 'legajos del Tabulado que no están en el reporte',
        value: s.soloEnTab,
      },
    ],
    unit: 'legajo',
    unitsTotal: s.total,
    unitsWithDiff,
    diffTotalAmount,
    worstCase,
    contextNote: null,
    resumen: resumenDelRendXEe(results),
  };
}

// ── runRendXEe ────────────────────────────────────────────────────────────────

export function runRendXEe(ctRows, tabRows, mapping) {
  const cm = mapping.costoTotal;
  const tm = mapping.tab;

  // Clave de comparación de legajo para este cliente (D-038) — antes era un
  // `normId` local, uno de los tres criterios que convivían en el repo.
  const normId = makeLegajoKey(mapping.legajoKeyMode);

  // Misma agrupación de conceptos que Rend vs Tabulado (personalizada o default)
  const conceptConfig = mapping.conceptGrouping || DEFAULT_CONCEPT_CONFIG;

  // Resolver columnas del Tabulado por código de concepto
  const sampleRow = tabRows[0] || {};
  const colByCode = buildColByCode(sampleRow);

  const catCols = {};
  for (const [catKey, entries] of Object.entries(conceptConfig)) {
    catCols[catKey] = entries
      .map(e => ({ col: colByCode[e.code] || null, sign: e.sign, code: e.code }))
      .filter(e => e.col !== null);
  }

  // ── Agrupar Tabulado por legajo ────────────────────────────────────────────
  const tabByLegajo = new Map();  // normId(legajo) → bucket de sumas

  for (const row of tabRows) {
    const rawLegajo = norm(row[tm.empleadoColumn]);
    const key = normId(rawLegajo);
    if (!key) continue;

    if (!tabByLegajo.has(key)) {
      tabByLegajo.set(key, {
        legajo: rawLegajo,
        nombre: tm.apellidoNombreColumn ? norm(row[tm.apellidoNombreColumn]) : '',
        precio: 0, estimulo: 0, cargas: 0, provMes: 0, provCcss: 0,
      });
    }
    const g = tabByLegajo.get(key);

    for (const cat of CATS) {
      for (const { col, sign } of (catCols[cat.key] || [])) {
        g[cat.key] += (toNum(row[col]) ?? 0) * sign;
      }
    }
  }

  // COSTO TOTAL calculado por legajo = suma de las 5 categorías
  for (const g of tabByLegajo.values()) {
    g.calcTotal = g.precio + g.estimulo + g.cargas + g.provMes + g.provCcss;
  }

  // ── Cruzar con el Reporte de Costo Total ───────────────────────────────────
  const rows    = [];
  const matched = new Set();

  for (const ctRow of ctRows) {
    const legajo = norm(ctRow[cm.legajoColumn]);
    if (!legajo) continue;
    if (legajo.toLowerCase().startsWith('total')) continue;

    const repTotal = toNum(ctRow[cm.costoTotalColumn]);

    const key = normId(legajo);
    const tab = key ? (tabByLegajo.get(key) || null) : null;
    if (tab && key) matched.add(key);

    rows.push({
      legajo,
      nombre:    tab ? tab.nombre : '',
      repTotal,
      precio:    tab ? tab.precio    : null,
      estimulo:  tab ? tab.estimulo  : null,
      cargas:    tab ? tab.cargas    : null,
      provMes:   tab ? tab.provMes   : null,
      provCcss:  tab ? tab.provCcss  : null,
      calcTotal: tab ? tab.calcTotal : null,
      dif:       (repTotal !== null && tab) ? repTotal - tab.calcTotal : null,
      sinTabData: tab === null,
      soloEnTab:  false,
    });
  }

  // Legajos del Tabulado que no aparecen en el reporte → al final
  for (const [key, g] of tabByLegajo) {
    if (matched.has(key)) continue;
    rows.push({
      legajo:    g.legajo,
      nombre:    g.nombre,
      repTotal:  null,
      precio:    g.precio,
      estimulo:  g.estimulo,
      cargas:    g.cargas,
      provMes:   g.provMes,
      provCcss:  g.provCcss,
      calcTotal: g.calcTotal,
      dif:       null,
      sinTabData: false,
      soloEnTab:  true,
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = {
    total:      rows.length,
    conDif:     rows.filter(r => hasDiff(r.dif)).length,
    sinTabData: rows.filter(r => r.sinTabData).length,
    soloEnTab:  rows.filter(r => r.soloEnTab).length,
  };

  return {
    summary, rows, period: mapping.period || '', meta: { conceptConfig, colByCode },
    // El modo de clave de legajo del cliente (D-038), para los cortes cruzados
    // del Resumen.
    legajoKeyMode: mapping.legajoKeyMode || null,
    // El puente del Resumen: Total Calculado → Diferencia comparada → Total
    // Reporte (D-086: `rows` ya trae los `sinTabData`/`soloEnTab` con `dif:
    // null`, así que la diferencia comparada no los cuenta como cero del lado
    // que falta).
    bridge: bridgeDelRunRendXEe(rows),
  };
}

/** El puente del Resumen (D-086), sobre los mismos `rows` que ya arma este `run()`. */
function bridgeDelRunRendXEe(rows) {
  if (rows.length === 0) return null;

  const totalCalc = rows.reduce((s, r) => s + (r.calcTotal ?? 0), 0);
  const totalRep  = rows.reduce((s, r) => s + (r.repTotal  ?? 0), 0);
  const diffComparada = rows.reduce((s, r) => s + (r.dif ?? 0), 0);

  const sinTabData = rows.filter(r => r.sinTabData);
  const soloEnTab  = rows.filter(r => r.soloEnTab);
  const soloCount  = sinTabData.length + soloEnTab.length;

  return {
    steps: [
      { label: 'Total Calculado', amount: totalCalc, tone: 'ink' },
      { label: 'Diferencia comparada', amount: diffComparada, tone: 'error' },
      { label: 'Total Reporte', amount: totalRep, tone: 'ink' },
    ],
    proportion: {
      parts: [
        { tone: 'neutral', amount: Math.abs(totalCalc), label: 'Total Calculado' },
        { tone: 'error',   amount: Math.abs(diffComparada), label: 'Diferencia comparada' },
      ],
    },
    uncompared: soloCount === 0 ? null : {
      label: (() => {
        const bits = [];
        if (sinTabData.length > 0) bits.push(`${sinTabData.length} sólo en el Reporte`);
        if (soloEnTab.length  > 0) bits.push(`${soloEnTab.length} sólo en el Tabulado`);
        return `${bits.join(' y ')}, por`;
      })(),
      amount: sinTabData.reduce((s, r) => s + (r.repTotal ?? 0), 0)
            + soloEnTab.reduce((s, r) => s + (r.calcTotal ?? 0), 0),
    },
  };
}

// ── renderRendXEeResults ──────────────────────────────────────────────────────

export function renderRendXEeResults(results, container) {
  const { rows, summary } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  // Totales para las tiles y la fila TOTAL GENERAL
  const totals = { repTotal: 0, precio: 0, estimulo: 0, cargas: 0, provMes: 0, provCcss: 0, calcTotal: 0 };
  for (const r of rows) {
    for (const k of Object.keys(totals)) totals[k] += r[k] ?? 0;
  }
  const totDif = totals.repTotal - totals.calcTotal;
  const matchedRows = rows.filter(r => !r.sinTabData && !r.soloEnTab);
  const diffRows = matchedRows.filter(r => hasDiff(r.dif));
  const okCount = matchedRows.length - diffRows.length;

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'rend_x_ee',
    resumen(panel) {
      const tone = diffRows.length === 0 ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: diffRows.length === 0
          ? 'El Costo Total del reporte coincide con el calculado desde el Tabulado.'
          : `${diffRows.length} de ${matchedRows.length} legajos tienen diferencia en Costo Total.`,
        body: diffRows.length === 0
          ? `${matchedRows.length} legajo${matchedRows.length === 1 ? '' : 's'} verificados, sin diferencias.`
          : `Diferencia total de <strong>${fmt(totDif)}</strong> (Reporte − Calculado). El detalle completo está en la solapa «Planilla».`,
      });

      renderTiles(panel, [
        { label: 'Legajos evaluados', value: matchedRows.length,
          sub: (summary.sinTabData + summary.soloEnTab) > 0
            ? `${summary.sinTabData} sin Tabulado · ${summary.soloEnTab} sólo en Tabulado`
            : 'del cruce Reporte × Tabulado' },
        { label: 'Sin diferencia', value: okCount, tone: 'ok' },
        { label: 'Con diferencia', value: diffRows.length, tone: diffRows.length > 0 ? 'error' : 'ok' },
        { label: 'Dif. COSTO TOTAL', value: fmt(totDif), tone: hasDiff(totDif) ? 'error' : 'ok' },
      ]);

      if (diffRows.length > 0) {
        const top = [...diffRows].sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 5);
        renderIssues(panel, {
          heading: `Casos para revisar · ${top.length} de ${diffRows.length}`,
          items: top.map(r => ({
            who: r.nombre || `Legajo ${r.legajo}`,
            sub: r.nombre ? `Legajo ${r.legajo}` : null,
            what: `Costo Total: Reporte ${fmt(r.repTotal)} vs Calculado ${fmt(r.calcTotal)}`,
            why: 'Reporte − Calculado.',
            right: `<span class="${mvClass(r.dif)}">${mvArrow(r.dif)} ${fmtSigned(r.dif)}</span>`,
          })),
        });
      }
    },
    planilla(panel) { renderRendXEePlanilla(panel, { rows, totDif, results }); },
  });
}

// ── La planilla (§5 de specs/vista-estandar-resultados.md) ───────────────────
//
// Tres bandas: lo que informa el reporte de M4, lo que sale de sumar el Tabulado
// (con sus cinco categorías abiertas) y el control. **Qué conceptos componen
// cada categoría** ya no vive adentro del `<th>` de la banda —ahí no entra— sino
// en la leyenda de arriba, la misma que usa Rendimiento vs Tabulado.
const COLS_REND_X_EE = [
  { key: 'legajo', label: 'Legajo', band: 'Identificación' },
  { key: 'nombre', label: 'Nombre', band: 'Identificación' },

  { key: 'repTotal', label: 'COSTO TOTAL', sub: 'lo que informa el reporte de M4',
    band: 'Reporte', num: true, close: true },

  ...CATS.map(c => ({
    key: c.key, label: c.label, sub: 'la suma de sus conceptos en el Tabulado',
    band: 'Calculado desde el Tabulado', num: true,
  })),
  { key: 'calcTotal', label: 'COSTO TOTAL', sub: 'la suma de las cinco categorías',
    band: 'Calculado desde el Tabulado', num: true, close: true },
];

/** El segundo eje: por qué un legajo no se pudo comparar (§3). */
const MARCAS_REND_X_EE = [
  { value: 'sinTab',    label: 'Sin datos en el Tabulado', match: r => r.sinTabData },
  { value: 'soloEnTab', label: 'Sólo en el Tabulado',      match: r => r.soloEnTab },
];

// ── El sub-objeto que dibuja el tablero del Resumen ─────────────────────────
//
// Este control compara UN solo importe (Costo Total) por legajo, así que no
// hay causa que abrir en categorías (§4 de la spec: "un solo importe") — a
// diferencia de Rendimiento vs Tabulado y Rendimiento vs Asiento, que sí
// abren en las cinco categorías.
function resumenDelRendXEe(results) {
  const legajoKey = makeLegajoKey(results.legajoKeyMode);
  const conDif = results.rows.filter(r => r.dif !== null && hasDiff(r.dif));

  return resumenStats({
    unit: 'legajo',
    tolerance: currentTolerance(),
    rows: conDif,
    diff: (r) => r.dif,
    key: (r) => legajoKey(r.legajo),
    unitLabel: (r) => r.nombre,
    top: (r) => ({ legajo: r.legajo, nombre: r.nombre }),
    bridge: results.bridge || null,
    // Un solo importe: no hay concepto/categoría que atribuir, y este control
    // no trae empresa.
    notApplicable: ['cause', 'group'],
  });
}

function renderRendXEePlanilla(container, { rows, totDif, results }) {
  const columns = [
    ...COLS_REND_X_EE,
    { key: 'dif', label: 'Dif', sub: 'Reporte − Calculado', band: 'Control',
      diff: true, close: true, absentLabel: 'sin comparar',
      // La resta de los totales, no la suma de la columna: los legajos que están
      // de un solo lado suman de un lado y de ninguno del otro. Es el número de
      // la tile "Dif. COSTO TOTAL" del Resumen.
      total: () => totDif },
  ];

  const csvHeaders = ['Legajo', 'Nombre', 'COSTO TOTAL (Reporte)', ...CATS.map(c => c.label), 'COSTO TOTAL (Calculado)', 'Dif (Reporte - Calculado)'];
  const csvRows = () => rows.map(r => [r.legajo, r.nombre, fmt(r.repTotal), ...CATS.map(c => fmt(r[c.key])), fmt(r.calcTotal), fmt(r.dif)]);

  renderPlanillaPanel(container, {
    columns,
    rows,
    unitLabel: 'legajos',
    estadoDe: r => estadoDeFila([r.dif]),
    marcas: MARCAS_REND_X_EE,
    getLabel: r => `${r.legajo} — ${r.nombre}`,
    stickyCols: 2,
    empty: 'Sin datos.',
    beforeTable: (host) => leyendaDeConceptos(host, { cols: CATS, meta: results.meta }),
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onExcel: () => exportRendXEeToXlsx(results),
      onCsv:   () => downloadCsv(csvHeaders, csvRows(), `RendXEE_${periodSuffix(results.period)}.csv`),
      onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
  });
}

// ── Excel export ──────────────────────────────────────────────────────────────

// Migrado a `writeGroupedContractSheet` (specs/contrato-export.md, "Lo que
// falta para migrar los writers del Paso 6" — D-047). `contracts.js` importa
// `COLS` de `rendVsTabu.js`, del que sale `CATS` acá — mismo ciclo de módulos
// que ese archivo documenta (D-041): `import()` dinámico, recién al exportar.

async function exportRendXEeToXlsx(results) {
  await loadExcelJS();
  const { rows } = results;
  const { EXPORT_CONTRACTS } = await import('../exports/contracts.js');
  const { writeGroupedContractSheet } = await import('../exports/contractSheet.js');

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const totals = { repTotal: 0, precio: 0, estimulo: 0, cargas: 0, provMes: 0, provCcss: 0, calcTotal: 0 };
  for (const r of rows) {
    for (const k of Object.keys(totals)) totals[k] += r[k] ?? 0;
  }
  const totalRow = {
    legajo: 'TOTAL GENERAL', nombre: '', ...totals,
    dif: totals.repTotal - totals.calcTotal,
  };

  writeGroupedContractSheet(wb, EXPORT_CONTRACTS.rend_x_ee, rows, {
    totalRow,
    dimIf: r => r.sinTabData || r.soloEnTab,
  });

  await downloadWorkbook(wb, `RendXEE_${periodSuffix(results.period)}.xlsx`);
}
