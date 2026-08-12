// rendXEe.js — Control: Rendimiento x EE
//
// Cruza el Reporte de Costo Total por empleado de M4 contra el Costo Total
// calculado desde el Tabulado. Por cada legajo suma los 5 totalizadores de
// Rend vs Tabulado (PRECIO, ASIG. ESTÍMULO, CARGAS SS, PROV. MES, PROV. CCSS MES)
// usando la misma agrupación de conceptos, y compara contra el Costo Total del reporte.
//
// Dif = Costo Total (Reporte) − Costo Total (Calculado del Tabulado).

import { DEFAULT_CONCEPT_CONFIG } from './rendVsTabu.js';
import { diffStats } from './semaforo.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { initShowMorePagination, initSearchCombobox, createResultsToolbar } from '../ui/tableTools.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmt } from '../utils/currency.js';
import { periodSuffix } from '../utils/dates.js';
import {
  renderVerdict, renderTiles, renderIssues, renderResumenDetalle, enhanceGrid, diffCellHtml,
  mvClass, mvArrow, fmtSigned,
} from '../ui/resultBlocks.js';

// ── Definición de columnas calculadas desde el Tabulado ──────────────────────
// Mismos colores que las categorías de Rend vs Tabulado.

const CATS = [
  { key: 'precio',   label: 'PRECIO',          hdr: 'rgba(0,112,192,0.22)',  bg: 'rgba(0,112,192,0.08)',  xlHdr: 'FFCCE0F5', xlBg: 'FFF0F6FD' },
  { key: 'estimulo', label: 'ASIG. ESTÍMULO',  hdr: 'rgba(0,156,64,0.22)',   bg: 'rgba(0,156,64,0.08)',   xlHdr: 'FFC9EDD8', xlBg: 'FFEDF9F2' },
  { key: 'cargas',   label: 'CARGAS SS',       hdr: 'rgba(192,0,0,0.22)',    bg: 'rgba(192,0,0,0.08)',    xlHdr: 'FFF5CCCC', xlBg: 'FFFCEAEA' },
  { key: 'provMes',  label: 'PROV. MES',       hdr: 'rgba(0,176,240,0.22)',  bg: 'rgba(0,176,240,0.08)',  xlHdr: 'FFC7EDF9', xlBg: 'FFEAF7FD' },
  { key: 'provCcss', label: 'PROV. CCSS MES',  hdr: 'rgba(0,70,127,0.22)',   bg: 'rgba(0,70,127,0.08)',   xlHdr: 'FFCCDDED', xlBg: 'FFEAF2F8' },
];

// Verde de la columna Dif (pantalla y Excel)
const DIF_HDR   = 'rgba(0,166,81,0.28)';
const DIF_BG    = 'rgba(0,166,81,0.12)';
const DIF_XLHDR = 'FFA9D08E';
const DIF_XLBG  = 'FFE2EFDA';

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v) { return v != null ? String(v).trim() : ''; }

function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Normaliza legajo para matching: quita ceros iniciales → "0870" y "870" matchean
function normId(v) {
  const s = String(v ?? '').trim().replace(/^0+/, '');
  return s || null;
}

const THRESHOLD = 0.01;
const hasDiff   = d => d !== null && Math.abs(d) > THRESHOLD;

// Construye mapa código numérico → clave de columna a partir de los headers del Tabulado.
// Soporta formato "1003-SUELDO" (extrae "1003") o nombre numérico exacto "1003".
function buildColByCode(sampleRow) {
  const colByCode = {};
  for (const col of Object.keys(sampleRow)) {
    const s = String(col).trim();
    const m = s.match(/^(\d+)[-_]/);
    if (m) {
      if (!colByCode[m[1]]) colByCode[m[1]] = col;
    } else if (/^\d+$/.test(s)) {
      if (!colByCode[s]) colByCode[s] = col;
    }
  }
  return colByCode;
}

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
  };
}

// ── runRendXEe ────────────────────────────────────────────────────────────────

export function runRendXEe(ctRows, tabRows, mapping) {
  const cm = mapping.costoTotal;
  const tm = mapping.tab;

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

  return { summary, rows, period: mapping.period || '', meta: { conceptConfig, colByCode } };
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
    resumen(panel) {
      const tone = diffRows.length === 0 ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: diffRows.length === 0
          ? 'El Costo Total del reporte coincide con el calculado desde el Tabulado.'
          : `${diffRows.length} de ${matchedRows.length} legajos tienen diferencia en Costo Total.`,
        body: diffRows.length === 0
          ? `${matchedRows.length} legajo${matchedRows.length === 1 ? '' : 's'} verificados, sin diferencias.`
          : `Diferencia total de <strong>${fmt(totDif)}</strong> (Reporte − Calculado). El detalle completo está en la solapa «Detalle».`,
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
    detalle(panel) { renderRendXEeDetalle(panel, { rows, totals, totDif, results }); },
  });
}

function renderRendXEeDetalle(container, { rows, totals, totDif, results }) {
  // ── Encabezados con detalle de conceptos por categoría ────────────────────
  const { conceptConfig: cc, colByCode: cbc } = results.meta || {};
  const catHdrs = CATS.map(c => {
    if (!cc || !cbc) return `<th style="text-align:right;background:${c.hdr};">${esc(c.label)}</th>`;
    const entries = cc[c.key] || [];
    const conceptList = entries
      .filter(e => cbc[e.code])
      .map(e => {
        const sign = e.sign === -1 ? '−' : '+';
        return `<span style="display:inline-block;margin:1px 3px;white-space:nowrap;">${sign} ${esc(cbc[e.code])}</span>`;
      })
      .join('');
    const missing = entries.filter(e => !cbc[e.code]);
    const missingNote = missing.length
      ? `<span style="display:block;margin-top:2px;color:var(--color-warning);font-size:10px;">⚠ ${missing.length} código${missing.length > 1 ? 's' : ''} no hallado${missing.length > 1 ? 's' : ''} en Tabulado</span>`
      : '';
    const conceptDetail = entries.length
      ? `<details style="font-size:10px;font-weight:400;text-align:left;margin-top:2px;">
           <summary style="cursor:pointer;list-style:none;text-align:center;color:inherit;opacity:0.75;">▾ ${entries.length} concepto${entries.length !== 1 ? 's' : ''}</summary>
           <div style="padding:3px 0;line-height:1.6;">${conceptList}${missingNote}</div>
         </details>`
      : `<div style="font-size:10px;font-weight:400;opacity:0.6;">(sin conceptos)</div>`;
    return `<th style="text-align:center;background:${c.hdr};">${esc(c.label)}${conceptDetail}</th>`;
  }).join('');

  const maxAbsDif = Math.max(1, ...rows.map(r => Math.abs(r.dif ?? 0)));

  // ── Filas de datos ─────────────────────────────────────────────────────────
  const dataRows = rows.map(r => {
    const rowStyle = (r.sinTabData || r.soloEnTab) ? ' style="opacity:0.55;"' : '';
    const catCells = CATS.map(c =>
      `<td style="text-align:right;background:${c.bg};">${fmt(r[c.key])}</td>`
    ).join('');
    return `
      <tr${rowStyle}>
        <td style="white-space:nowrap;font-family:monospace;">${esc(r.legajo)}</td>
        <td style="white-space:nowrap;font-size:var(--text-sm);">${esc(r.nombre)}</td>
        <td style="text-align:right;">${fmt(r.repTotal)}</td>
        ${catCells}
        <td style="text-align:right;background:rgba(64,64,64,0.07);">${fmt(r.calcTotal)}</td>
        ${diffCellHtml(r.dif, { max: maxAbsDif, background: DIF_BG })}
      </tr>
    `;
  }).join('');

  const totCatCells = CATS.map(c =>
    `<td style="text-align:right;background:${c.hdr};font-weight:600;">${fmt(totals[c.key])}</td>`
  ).join('');

  // Barra: buscador (izquierda) + menú de exportar (derecha)
  const { searchEl, exportEl } = createResultsToolbar(container);

  const tableWrap = document.createElement('div');
  tableWrap.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th style="white-space:nowrap;">Legajo</th>
          <th>Nombre</th>
          <th style="text-align:center;">COSTO TOTAL<br><small style="font-weight:400;">Reporte</small></th>
          ${catHdrs}
          <th style="text-align:center;background:rgba(64,64,64,0.18);">COSTO TOTAL<br><small style="font-weight:400;">Calculado</small></th>
          <th style="text-align:center;background:${DIF_HDR};"><strong>Dif</strong><br><small style="font-weight:400;white-space:nowrap;">Reporte − Calculado</small></th>
        </tr>
      </thead>
      <tbody>
        ${dataRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="font-weight:600;white-space:nowrap;">TOTAL GENERAL</td>
          <td style="text-align:right;font-weight:600;">${fmt(totals.repTotal)}</td>
          ${totCatCells}
          <td style="text-align:right;background:rgba(64,64,64,0.18);font-weight:600;">${fmt(totals.calcTotal)}</td>
          ${diffCellHtml(totDif, { background: DIF_HDR })}
        </tr>
      </tfoot>
    </table>
  `;
  container.appendChild(tableWrap);

  // Paginación (tablas de cientos de legajos) + buscador por legajo/nombre
  const tbodyEl = tableWrap.querySelector('tbody');
  const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
  initSearchCombobox(searchEl, {
    rows,
    trEls: pagination.dataRows,
    getLabel: r => `${r.legajo} — ${r.nombre}`,
    pagination,
  });
  enhanceGrid(tableWrap.querySelector('table'), { stickyCols: 2 });

  const csvHeaders = ['Legajo', 'Nombre', 'COSTO TOTAL (Reporte)', ...CATS.map(c => c.label), 'COSTO TOTAL (Calculado)', 'Dif (Reporte - Calculado)'];
  const csvRows = () => rows.map(r => [r.legajo, r.nombre, fmt(r.repTotal), ...CATS.map(c => fmt(r[c.key])), fmt(r.calcTotal), fmt(r.dif)]);

  renderExportMenu(exportEl, {
    onExcel: () => exportRendXEeToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `RendXEE_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
}

// ── Excel export ──────────────────────────────────────────────────────────────

async function exportRendXEeToXlsx(results) {
  await loadExcelJS();
  const { rows } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Rendimiento x EE');

  ws.columns = [
    { width: 10 },  // Legajo
    { width: 30 },  // Nombre
    { width: 18 },  // Costo Total Reporte
    ...CATS.map(() => ({ width: 18 })),
    { width: 18 },  // Costo Total Calculado
    { width: 18 },  // Dif
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const numFmt = '#,##0.00';
  const RED      = 'FFCC0000';
  const GRAY_HDR = 'FFE0E0E0';
  const GRAY_TOT_HDR = 'FFDCDCDC';
  const GRAY_TOT_BG  = 'FFF2F2F2';

  // ── Encabezado ─────────────────────────────────────────────────────────────
  const hdrValues = [
    'Legajo', 'Nombre', 'COSTO TOTAL (Reporte)',
    ...CATS.map(c => c.label),
    'COSTO TOTAL (Calculado)', 'Dif (Reporte − Calculado)',
  ];
  const hdrFills = [
    GRAY_HDR, GRAY_HDR, GRAY_HDR,
    ...CATS.map(c => c.xlHdr),
    GRAY_TOT_HDR, DIF_XLHDR,
  ];
  const r1 = ws.addRow(hdrValues);
  r1.height = 24;
  hdrValues.forEach((_, i) => {
    const cell = r1.getCell(i + 1);
    cell.font      = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill      = solidFill(hdrFills[i]);
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  // ── Filas de datos ─────────────────────────────────────────────────────────
  const dataFills = [null, null, null, ...CATS.map(c => c.xlBg), GRAY_TOT_BG, DIF_XLBG];

  for (const r of rows) {
    const values = [
      r.legajo, r.nombre, r.repTotal,
      ...CATS.map(c => r[c.key]),
      r.calcTotal, r.dif,
    ];
    const dr = ws.addRow(values);

    values.forEach((_, i) => {
      const cell = dr.getCell(i + 1);
      cell.font = { ...base };
      if (i >= 2) {
        cell.numFmt    = numFmt;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
      if (dataFills[i]) cell.fill = solidFill(dataFills[i]);
    });

    // Dif en rojo si hay diferencia
    const difCell = dr.getCell(values.length);
    if (hasDiff(r.dif)) difCell.font = { ...bold, color: { argb: RED } };

    if (r.sinTabData || r.soloEnTab) {
      dr.eachCell(cell => { cell.font = { ...cell.font, color: { argb: 'FF999999' } }; });
    }
  }

  // ── Fila de totales ────────────────────────────────────────────────────────
  const totals = { repTotal: 0, precio: 0, estimulo: 0, cargas: 0, provMes: 0, provCcss: 0, calcTotal: 0 };
  for (const r of rows) {
    for (const k of Object.keys(totals)) totals[k] += r[k] ?? 0;
  }
  const totDif = totals.repTotal - totals.calcTotal;

  const totValues = [
    'TOTAL GENERAL', '', totals.repTotal,
    ...CATS.map(c => totals[c.key]),
    totals.calcTotal, totDif,
  ];
  const tr = ws.addRow(totValues);
  totValues.forEach((_, i) => {
    const cell = tr.getCell(i + 1);
    cell.font = { ...bold };
    if (i >= 2) {
      cell.numFmt    = numFmt;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
    }
    cell.fill   = solidFill(hdrFills[i]);
    cell.border = { top: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });
  if (hasDiff(totDif)) tr.getCell(totValues.length).font = { ...bold, color: { argb: RED } };

  await downloadWorkbook(wb, `RendXEE_${periodSuffix(results.period)}.xlsx`);
}
