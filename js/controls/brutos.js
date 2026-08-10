// brutos.js — Controles del Reporte de Brutos
import { diffStats } from './semaforo.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { initShowMorePagination, initSearchCombobox } from '../ui/tableTools.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { norm, toNum, esc, fmtNum } from '../utils/textFormatters.js';
import { groupRowsByLegajo, sumColumn, sumTabColumn } from '../utils/dataAggregation.js';
import {
  renderVerdict, renderTiles, renderIssues, renderResumenDetalle, enhanceGrid, diffCellHtml,
  mvClass, mvArrow, fmtSigned,
} from '../ui/resultBlocks.js';
//
// Modo 1 — "Controlar": cruza SAL_BASE y A_CTA_FUT_AUMEN del Reporte de Brutos
//   contra las columnas configuradas en el Tabulado (tabSalBaseColumn / tabACuFutAumenColumn).
//
// Modo 2 — "Generar Reporte": genera el Reporte de Brutos directamente desde el
//   Tabulado, sin necesitar el archivo de Brutos. Usa las columnas configuradas
//   en el mapeo del Tabulado y exporta a .xlsx sin columnas de control ni colores.

// ── Modo 1: Controlar ─────────────────────────────────────────────────────────

export function summarizeBrutos(results) {
  const s = results.summary;
  const hasDiff = s.conDifSalario > 0 || s.conDifACuFutAumen > 0;

  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    results.rows,
    [
      { key: 'ctrlSalBase',     get: r => r.ctrlSalBase,     label: 'SAL_BASE' },
      { key: 'ctrlACuFutAumen', get: r => r.ctrlACuFutAumen, label: 'A_CTA_FUT_AUMEN' },
    ],
    (row, field) => `${field.label} — leg. ${row.legajo}`
  );
  const concepts = [];
  if (s.conDifSalario > 0)     concepts.push('SAL_BASE');
  if (s.conDifACuFutAumen > 0) concepts.push('A_CTA_FUT_AUMEN');
  const contextNote = concepts.length === 0
    ? 'SAL_BASE y A_CTA_FUT_AUMEN verificados'
    : concepts.length === 1 ? `todos en ${concepts[0]}` : concepts.join(' y ');

  return {
    status:   hasDiff ? 'warning' : 'success',
    headline: `${s.total} registros · ${s.sinTabData} sin datos en Tabulado`,
    insights: [
      {
        type:  s.conDifSalario > 0 ? 'warning' : 'success',
        label: 'diferencias SAL_BASE vs Tabulado',
        value: s.conDifSalario,
      },
      {
        type:  s.conDifACuFutAumen > 0 ? 'warning' : 'success',
        label: 'diferencias A_CTA_FUT_AUMEN vs Tabulado',
        value: s.conDifACuFutAumen,
      },
    ],
    unit: 'legajo',
    unitsTotal: s.total,
    unitsWithDiff,
    diffTotalAmount,
    worstCase,
    contextNote,
  };
}

export function runBrutos(brutosRows, tabRows, mapping) {
  const bm = mapping.brutos;
  const tm = mapping.tab;

  // Columnas del Tabulado para los conceptos — configuradas por el usuario en el mapeo.
  // Fallback a '1003' / '1017' por compatibilidad con tabulados que usan código solo.
  const salBaseTabCol   = tm.tabSalBaseColumn    || null;
  const aCuFutAuTabCol  = tm.tabACuFutAumenColumn || null;

  // Índice del Tabulado: legajo → { valSal, valAcu }
  // Un legajo puede tener más de una liquidación en el mes (ej: baja después
  // de haber cobrado el mensual). Meta4 suma todas las liquidaciones del
  // legajo en el Reporte de Brutos real, así que consolidamos igual acá para
  // comparar contra el mismo total (en vez de quedarnos solo con la última).
  const tabGroups = groupRowsByLegajo(tabRows, tm.empleadoColumn);
  const tabByLegajo = new Map();
  for (const [id, group] of tabGroups) {
    const last   = group[group.length - 1];
    const valSal = sumTabColumn(group, salBaseTabCol, '1003');
    const valAcu = sumTabColumn(group, aCuFutAuTabCol, '1017');
    const nombre = tm.apellidoNombreColumn ? norm(last[tm.apellidoNombreColumn]) : '';
    tabByLegajo.set(id, { valSal, valAcu, nombre });
  }

  const rows = brutosRows.map(row => {
    const legajo      = norm(row[bm.legajoColumn]);
    const salBase     = toNum(row[bm.salBaseColumn]);
    const aCuFutAumen = toNum(row[bm.aCuFutAumenColumn]);
    const tab         = tabByLegajo.get(legajo) ?? { valSal: null, valAcu: null };

    const ctrlSalBase     = tab.valSal !== null && salBase !== null
      ? tab.valSal - salBase : null;
    const ctrlACuFutAumen = tab.valAcu !== null && aCuFutAumen !== null
      ? tab.valAcu - aCuFutAumen : null;

    return {
      legajo,
      nombre:       tab.nombre ?? '',
      salBase,
      aCuFutAumen,
      tabValSal:    tab.valSal,
      tabValAcu:    tab.valAcu,
      ctrlSalBase,
      ctrlACuFutAumen,
    };
  });

  const conDifSalario     = rows.filter(r => r.ctrlSalBase !== null     && Math.abs(r.ctrlSalBase)     > 0.01).length;
  const conDifACuFutAumen = rows.filter(r => r.ctrlACuFutAumen !== null && Math.abs(r.ctrlACuFutAumen) > 0.01).length;
  const sinTabData        = rows.filter(r => r.tabValSal === null && r.tabValAcu === null).length;

  return {
    summary: { total: rows.length, conDifSalario, conDifACuFutAumen, sinTabData },
    rows,
    period: mapping.period || '',
  };
}

const CYAN_BG   = 'rgba(0,172,212,0.10)';
const CYAN_HDR  = 'rgba(0,172,212,0.22)';
const LILAC_BG  = 'rgba(130,80,200,0.09)';
const LILAC_HDR = 'rgba(130,80,200,0.20)';


// Un legajo es "evaluable" si hay algún valor real de alguno de los dos
// conceptos, en cualquiera de las dos fuentes (Brutos o Tabulado).
function brutosHasAnyValue(r) {
  return [r.salBase, r.aCuFutAumen, r.tabValSal, r.tabValAcu].some(v => v !== null && Math.abs(v) > 0.01);
}
function brutosRowHasDiff(r) {
  return (r.ctrlSalBase !== null && Math.abs(r.ctrlSalBase) > 0.01)
    || (r.ctrlACuFutAumen !== null && Math.abs(r.ctrlACuFutAumen) > 0.01);
}
function brutosDiffAmount(r) {
  return Math.abs(r.ctrlSalBase ?? 0) + Math.abs(r.ctrlACuFutAumen ?? 0);
}

export function renderBrutosResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const relevantRows = rows.filter(brutosHasAnyValue);
  const diffRows      = relevantRows.filter(brutosRowHasDiff);
  const okCount        = relevantRows.length - diffRows.length;
  const noValueCount    = rows.length - relevantRows.length;

  const sumSalBrutos = relevantRows.reduce((s, r) => s + (r.salBase   ?? 0), 0);
  const sumSalTab    = relevantRows.reduce((s, r) => s + (r.tabValSal ?? 0), 0);
  const diffSal      = sumSalTab - sumSalBrutos;
  const sumAcuBrutos = relevantRows.reduce((s, r) => s + (r.aCuFutAumen ?? 0), 0);
  const sumAcuTab    = relevantRows.reduce((s, r) => s + (r.tabValAcu  ?? 0), 0);
  const diffAcu      = sumAcuTab - sumAcuBrutos;

  container.innerHTML = '';

  renderResumenDetalle(container, {
    resumen(panel) {
      const tone = diffRows.length === 0 ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: diffRows.length === 0
          ? 'SAL_BASE y A_CTA_FUT_AUMEN coinciden con el Tabulado en todos los legajos.'
          : `${diffRows.length} de ${relevantRows.length} legajos tienen diferencia en SAL_BASE o A_CTA_FUT_AUMEN.`,
        body: diffRows.length === 0
          ? `${relevantRows.length} legajo${relevantRows.length === 1 ? '' : 's'} verificados contra el Tabulado, sin diferencias.`
          : `Diferencia total de <strong>${fmtNum(diffSal)}</strong> en SAL_BASE y <strong>${fmtNum(diffAcu)}</strong> en A_CTA_FUT_AUMEN (Tab − Brutos). El detalle completo está en la solapa «Detalle».`,
      });

      renderTiles(panel, [
        { label: 'Legajos evaluados', value: relevantRows.length,
          sub: noValueCount > 0 ? `${noValueCount} sin valor real (no se muestran)` : 'del Reporte de Brutos' },
        { label: 'Sin diferencia', value: okCount, tone: 'ok' },
        { label: 'Con diferencia', value: diffRows.length, tone: diffRows.length > 0 ? 'error' : 'ok' },
        { label: 'Dif. SAL_BASE', value: fmtNum(diffSal), tone: Math.abs(diffSal) > 0.01 ? 'error' : 'ok' },
        { label: 'Dif. A_CTA_FUT_AUMEN', value: fmtNum(diffAcu), tone: Math.abs(diffAcu) > 0.01 ? 'error' : 'ok' },
      ]);

      if (diffRows.length > 0) {
        const top = [...diffRows].sort((a, b) => brutosDiffAmount(b) - brutosDiffAmount(a)).slice(0, 5);
        renderIssues(panel, {
          heading: `Casos para revisar · ${top.length} de ${diffRows.length}`,
          items: top.map(r => {
            const bits = [];
            if (r.ctrlSalBase !== null && Math.abs(r.ctrlSalBase) > 0.01) bits.push(`SAL_BASE ${fmtNum(r.ctrlSalBase)}`);
            if (r.ctrlACuFutAumen !== null && Math.abs(r.ctrlACuFutAumen) > 0.01) bits.push(`A_CTA_FUT_AUMEN ${fmtNum(r.ctrlACuFutAumen)}`);
            const worst = Math.abs(r.ctrlSalBase ?? 0) >= Math.abs(r.ctrlACuFutAumen ?? 0) ? r.ctrlSalBase : r.ctrlACuFutAumen;
            return {
              sev: bits.length > 1 ? 'hi' : 'lo',
              who: r.nombre ? esc(r.nombre) : `Legajo ${r.legajo}`,
              sub: `Legajo ${r.legajo}`,
              what: bits.join(' · '),
              why: 'Diferencia Tab − Brutos.',
              right: `<span class="${mvClass(worst)}">${mvArrow(worst)} ${fmtSigned(worst)}</span>`,
            };
          }),
        });
      }
    },
    detalle(panel) { renderBrutosDetalle(panel, { relevantRows, diffRows, results }); },
  });
}

function renderBrutosDetalle(container, { relevantRows, diffRows, results }) {
  if (relevantRows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Ningún legajo tiene valor real en SAL_BASE o A_CTA_FUT_AUMEN.</p>`;
    return;
  }

  // Barra: filtro Sólo con diferencia/Todos (izquierda) + buscador + exportar (derecha)
  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';

  const leftGroup = document.createElement('div');
  leftGroup.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--sp-3);align-items:flex-end;';

  const filterSel = document.createElement('select');
  filterSel.className = 'form-select form-select--sm';
  filterSel.innerHTML = `
    <option value="dif">Sólo con diferencia (${diffRows.length})</option>
    <option value="all">Todos los evaluados (${relevantRows.length})</option>
  `;
  if (diffRows.length === 0) filterSel.value = 'all';

  const searchEl = document.createElement('div');
  leftGroup.appendChild(filterSel);
  leftGroup.appendChild(searchEl);

  const exportEl = document.createElement('div');
  toolbar.appendChild(leftGroup);
  toolbar.appendChild(exportEl);
  container.appendChild(toolbar);

  // Exportar siempre incluye todos los legajos evaluados, sin importar el filtro de pantalla.
  const csvHeaders = ['Legajo', 'Nombre', 'SAL_BASE', 'CTRL SALARIO BASE', 'A_CTA_FUT_AUMEN', 'CTRL A_CTA_FUT_AUMEN', 'SAL_BASE (Tab)', 'A_CTA_FUT (Tab)'];
  const csvRows = () => relevantRows.map(r => [r.legajo, r.nombre, fmtNum(r.salBase), fmtNum(r.ctrlSalBase), fmtNum(r.aCuFutAumen), fmtNum(r.ctrlACuFutAumen), fmtNum(r.tabValSal), fmtNum(r.tabValAcu)]);

  renderExportMenu(exportEl, {
    onExcel: () => exportBrutosToXlsx({ ...results, rows: relevantRows }),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `Brutos_Control_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });

  const tableHost = document.createElement('div');
  container.appendChild(tableHost);

  function renderTable() {
    const shownRows = filterSel.value === 'dif' ? diffRows : relevantRows;
    const maxAbs = Math.max(1, ...shownRows.flatMap(r => [Math.abs(r.ctrlSalBase ?? 0), Math.abs(r.ctrlACuFutAumen ?? 0)]));
    const totSal = shownRows.reduce((s, r) => s + (r.salBase ?? 0), 0);
    const totSalTab = shownRows.reduce((s, r) => s + (r.tabValSal ?? 0), 0);
    const totAcu = shownRows.reduce((s, r) => s + (r.aCuFutAumen ?? 0), 0);
    const totAcuTab = shownRows.reduce((s, r) => s + (r.tabValAcu ?? 0), 0);

    tableHost.innerHTML = `
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th rowspan="2">Legajo</th>
            <th rowspan="2">Nombre</th>
            <th colspan="3" style="text-align:center;background:${CYAN_HDR};">Salario Base</th>
            <th colspan="3" style="text-align:center;background:${LILAC_HDR};">A Cta Fut Aumen</th>
          </tr>
          <tr>
            <th style="background:${CYAN_HDR};">Brutos</th>
            <th style="background:${CYAN_HDR};">Tab</th>
            <th style="background:${CYAN_HDR};"><strong>CTRL</strong><br><small style="font-weight:400;">Tab − Brutos</small></th>
            <th style="background:${LILAC_HDR};">Brutos</th>
            <th style="background:${LILAC_HDR};">Tab</th>
            <th style="background:${LILAC_HDR};"><strong>CTRL</strong><br><small style="font-weight:400;">Tab − Brutos</small></th>
          </tr>
        </thead>
        <tbody>
          ${shownRows.map(r => `
            <tr>
              <td>${esc(r.legajo)}</td>
              <td style="font-size:var(--text-sm);">${esc(r.nombre)}</td>
              <td style="text-align:right;background:${CYAN_BG};">${fmtNum(r.salBase)}</td>
              <td style="text-align:right;background:${CYAN_BG};">${fmtNum(r.tabValSal)}</td>
              ${diffCellHtml(r.ctrlSalBase, { max: maxAbs, background: CYAN_BG })}
              <td style="text-align:right;background:${LILAC_BG};">${fmtNum(r.aCuFutAumen)}</td>
              <td style="text-align:right;background:${LILAC_BG};">${fmtNum(r.tabValAcu)}</td>
              ${diffCellHtml(r.ctrlACuFutAumen, { max: maxAbs, background: LILAC_BG })}
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>TOTAL</strong> — ${shownRows.length} legajo${shownRows.length === 1 ? '' : 's'}</td>
            <td style="text-align:right;background:${CYAN_HDR};">${fmtNum(totSal)}</td>
            <td style="text-align:right;background:${CYAN_HDR};">${fmtNum(totSalTab)}</td>
            ${diffCellHtml(totSalTab - totSal, { background: CYAN_HDR })}
            <td style="text-align:right;background:${LILAC_HDR};">${fmtNum(totAcu)}</td>
            <td style="text-align:right;background:${LILAC_HDR};">${fmtNum(totAcuTab)}</td>
            ${diffCellHtml(totAcuTab - totAcu, { background: LILAC_HDR })}
          </tr>
        </tfoot>
      </table>
    `;

    const tbodyEl = tableHost.querySelector('tbody');
    const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
    initSearchCombobox(searchEl, {
      rows: shownRows,
      trEls: pagination.dataRows,
      getLabel: r => `${r.legajo} — ${r.nombre}`,
      pagination,
    });
    enhanceGrid(tableHost.querySelector('table'), { stickyCols: 2 });
  }

  filterSel.addEventListener('change', renderTable);
  renderTable();
}

// ── Modo 2: Generar Reporte ───────────────────────────────────────────────────

export function runBrutosReporte(_primaryRows, tabRows, mapping) {
  const tm     = mapping.tab;
  const period = mapping.period || '';

  // FECHA_INI y FECHA_FIN: primer y último día hábil del período
  const [year, month] = period.split('-').map(Number);
  const fecIniStr = (year && month) ? fmtDateAR(firstBusinessDay(year, month)) : '';
  const fecFinStr = (year && month) ? fmtDateAR(lastBusinessDay(year, month))  : '';

  // La columna de nombre puede ser combinada (apellidoNombreColumn) o
  // separada (tabNombreColumn + tabApellido1Column)
  const nombreCol   = tm.tabNombreColumn   || tm.apellidoNombreColumn || null;
  const apellido1Col = tm.tabApellido1Column || null;

  // Un legajo puede tener más de una liquidación en el mes (ej: baja después
  // de haber cobrado el mensual). Consolidamos por legajo: los importes se
  // suman (igual que hace Meta4 en el Reporte de Brutos real) y los datos de
  // referencia (nombre, fechas, puesto) se toman de la última liquidación.
  const tabGroups = groupTabRowsByLegajo(tabRows, tm.empleadoColumn);
  const rows = [...tabGroups.entries()].map(([legajo, group]) => {
    const last = group[group.length - 1];
    return {
      fecIni:      fecIniStr,
      fecFin:      fecFinStr,
      legajo,
      nombre:      nombreCol    ? norm(last[nombreCol])                      : null,
      apellido1:   apellido1Col ? norm(last[apellido1Col])                  : null,
      fecAlta:     tm.tabFecAltaColumn ? fmtDate(last[tm.tabFecAltaColumn]) : null,
      fecBaja:     tm.tabFecBajaColumn ? fmtDate(last[tm.tabFecBajaColumn]) : null,
      fecPago:     tm.tabFecPagoColumn ? fmtDate(last[tm.tabFecPagoColumn]) : null,
      salBase:     sumTabColumn(group, tm.tabSalBaseColumn,     null),
      aCuFutAumen: sumTabColumn(group, tm.tabACuFutAumenColumn, null),
      puesto:      tm.puestoColumn ? norm(last[tm.puestoColumn]) : null,
    };
  });

  return {
    summary: { total: rows.length },
    rows,
    period,
    cols: {
      hasNombre:    !!nombreCol,
      hasApellido1: !!apellido1Col,
      hasFecAlta:   !!tm.tabFecAltaColumn,
      hasFecBaja:   !!tm.tabFecBajaColumn,
      hasFecPago:   !!tm.tabFecPagoColumn,
      hasSalBase:   !!tm.tabSalBaseColumn,
      hasACuFut:    !!tm.tabACuFutAumenColumn,
      hasPuesto:    !!tm.puestoColumn,
    },
  };
}

export function summarizeBrutosReporte(results) {
  return {
    status:   'info',
    headline: `${results.summary.total} registros — Reporte generado del Tabulado`,
    insights: [],
    // Genera el reporte desde el Tabulado — no hay una segunda fuente contra
    // la cual cruzar, así que no aplica un semáforo de diferencias.
    unit:            null,
    unitsTotal:      null,
    unitsWithDiff:   null,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote:     null,
  };
}

export function renderBrutosReporteResults(results, container) {
  const { rows, cols } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  // Definición de columnas activas (orden idéntico al archivo de Brutos)
  const colDefs = [
    { label: 'FECHA_INI',                            key: 'fecIni',      type: 'txt' },
    { label: 'FECHA_FIN',                            key: 'fecFin',      type: 'txt' },
    { label: 'ID_EMPLEADO',                          key: 'legajo',      type: 'txt' },
    cols.hasNombre    && { label: 'NOMBRE',           key: 'nombre',      type: 'txt' },
    cols.hasApellido1 && { label: 'APELLIDO_1',       key: 'apellido1',   type: 'txt' },
    cols.hasFecAlta   && { label: 'FECHA_ALTA',       key: 'fecAlta',     type: 'txt' },
    cols.hasFecBaja   && { label: 'FECHA_BAJA',       key: 'fecBaja',     type: 'txt' },
    cols.hasFecPago   && { label: 'FEC_PAGO',         key: 'fecPago',     type: 'txt' },
    cols.hasSalBase   && { label: 'SAL_BASE',         key: 'salBase',     type: 'num' },
    cols.hasACuFut    && { label: 'A_CTA_FUT_AUMEN',  key: 'aCuFutAumen', type: 'num' },
    cols.hasPuesto    && { label: 'N_PUESTO',         key: 'puesto',      type: 'txt' },
  ].filter(Boolean);

  const sinColumnas = colDefs.length <= 1;

  container.innerHTML = '';

  renderResumenDetalle(container, {
    resumen(panel) {
      renderVerdict(panel, {
        tone: sinColumnas ? 'warn' : 'info',
        title: sinColumnas
          ? 'No hay columnas configuradas en el Tabulado para el Reporte de Brutos.'
          : `Reporte de Brutos generado — ${rows.length} registro${rows.length === 1 ? '' : 's'}.`,
        body: sinColumnas
          ? 'Volvé a cargar el Tabulado y completá los campos de la sección "Brutos".'
          : 'Armado directo desde el Tabulado. El detalle completo está en la solapa «Detalle».',
      });
      if (!sinColumnas) {
        renderTiles(panel, [
          { label: 'Registros', value: rows.length },
          { label: 'Columnas mapeadas', value: `${colDefs.length} / 11` },
        ]);
      }
    },
    detalle(panel) { renderBrutosReporteDetalle(panel, { rows, cols, colDefs, sinColumnas, results }); },
  });
}

function renderBrutosReporteDetalle(container, { rows, cols, colDefs, sinColumnas, results }) {
  if (sinColumnas) {
    container.innerHTML = '';
    return;
  }

  const fmt    = v => v === null ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtTxt = v => v === null ? '—' : esc(String(v));

  // Barra: buscador (izquierda) + menú de exportar (derecha)
  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  const searchEl = document.createElement('div');
  const exportEl = document.createElement('div');
  toolbar.appendChild(searchEl);
  toolbar.appendChild(exportEl);

  // Tabla
  const tableWrap = document.createElement('div');
  tableWrap.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          ${colDefs.map(c => `<th>${esc(c.label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            ${colDefs.map(c =>
              c.type === 'num'
                ? `<td style="text-align:right;">${fmtNum(r[c.key])}</td>`
                : `<td>${fmtTxt(r[c.key])}</td>`
            ).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.appendChild(toolbar);
  container.appendChild(tableWrap);

  const tbodyEl = tableWrap.querySelector('tbody');
  const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
  const legajoKey  = colDefs.find(c => c.key === 'legajo') ? 'legajo' : colDefs[0].key;
  const nombreKey  = cols.hasNombre ? 'nombre' : (cols.hasApellido1 ? 'apellido1' : null);
  initSearchCombobox(searchEl, {
    rows,
    trEls: pagination.dataRows,
    getLabel: r => nombreKey ? `${r[legajoKey]} — ${r[nombreKey]}` : `${r[legajoKey]}`,
    pagination,
  });
  // stickyCols:0 — la 1ª/2ª columna real son FECHA_INI/FECHA_FIN (mismo orden
  // que el archivo de Brutos), no Legajo/Nombre, así que no conviene anclarlas.
  enhanceGrid(tableWrap.querySelector('table'), { stickyCols: 0 });

  const csvHeaders = colDefs.map(c => c.label);
  const csvRows = () => rows.map(r => colDefs.map(c => c.type === 'num' ? fmtNum(r[c.key]) : (r[c.key] ?? '')));

  renderExportMenu(exportEl, {
    onExcel: () => exportBrutosReporteToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `Brutos_Reporte_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
}

// ── Exports a Excel ───────────────────────────────────────────────────────────

async function exportBrutosToXlsx(results) {
  await loadExcelJS();
  const { rows, period } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Reporte de Brutos');
  ws.columns = [
    { width: 12 }, { width: 28 }, { width: 18 }, { width: 22 },
    { width: 20 }, { width: 24 }, { width: 12 },
    { width: 18 }, { width: 18 },
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };

  const CYAN_HDR  = 'FFC7ECF6';
  const CYAN_BG   = 'FFE6F8FB';
  const LILAC_HDR = 'FFE6DCF4';
  const LILAC_BG  = 'FFF4EFFA';
  const GRAY_HDR  = 'FFE8E8E8';

  // Fila 1: grupos  (col A=Legajo, B=Nombre, C:D=Salario Base, E:F=ACFA, G:I=Tabulado)
  const r1 = ws.addRow(['Legajo', 'Apellido y Nombre', 'Salario Base', null, 'A Cta Fut Aumen', null, 'Valores Tabulado', null, null]);
  const r2 = ws.addRow(['', '', 'SAL_BASE', 'CTRL SALARIO BASE', 'A_CTA_FUT_AUMEN', 'CTRL A_CTA_FUT_AUMEN', 'Legajo', 'SAL_BASE (Tab)', 'A_CTA_FUT (Tab)']);

  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:B2');
  ws.mergeCells('C1:D1');
  ws.mergeCells('E1:F1');
  ws.mergeCells('G1:I1');
  r1.height = 22;
  r2.height = 20;

  const styleGrp = (cell, bg) => {
    cell.font = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = solidFill(bg);
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } } };
  };
  styleGrp(r1.getCell(1), GRAY_HDR);
  styleGrp(r1.getCell(2), GRAY_HDR);
  styleGrp(r1.getCell(3), CYAN_HDR);
  styleGrp(r1.getCell(5), LILAC_HDR);
  styleGrp(r1.getCell(7), GRAY_HDR);

  const styleCol = (cell, bg, isBold = false) => {
    cell.font = isBold ? { ...bold } : { ...base };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = solidFill(bg);
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  };
  styleCol(r2.getCell(3), CYAN_HDR,  false);
  styleCol(r2.getCell(4), CYAN_HDR,  true);
  styleCol(r2.getCell(5), LILAC_HDR, false);
  styleCol(r2.getCell(6), LILAC_HDR, true);
  styleCol(r2.getCell(7), GRAY_HDR,  false);
  styleCol(r2.getCell(8), GRAY_HDR,  false);
  styleCol(r2.getCell(9), GRAY_HDR,  false);

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  const numFmt = '#,##0.00';
  for (const r of rows) {
    const dr = ws.addRow([r.legajo, r.nombre, r.salBase, r.ctrlSalBase, r.aCuFutAumen, r.ctrlACuFutAumen, r.legajo, r.tabValSal, r.tabValAcu]);
    dr.getCell(3).fill = solidFill(CYAN_BG);
    dr.getCell(4).fill = solidFill(CYAN_BG);
    dr.getCell(5).fill = solidFill(LILAC_BG);
    dr.getCell(6).fill = solidFill(LILAC_BG);
    for (const col of [3, 4, 5, 6, 8, 9]) {
      dr.getCell(col).numFmt    = numFmt;
      dr.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
      dr.getCell(col).font      = { ...base };
    }
    if (r.ctrlSalBase !== null && Math.abs(r.ctrlSalBase) > 0.01)
      dr.getCell(4).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    if (r.ctrlACuFutAumen !== null && Math.abs(r.ctrlACuFutAumen) > 0.01)
      dr.getCell(6).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    dr.getCell(1).font = { ...base };
    dr.getCell(2).font = { ...base };
    dr.getCell(7).font = { ...base };
  }

  await downloadWorkbook(wb, `Brutos_Control_${periodSuffix(period)}.xlsx`);
}

async function exportBrutosReporteToXlsx(results) {
  await loadExcelJS();
  const { rows, cols } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Reporte de Brutos');

  // Columnas activas (orden idéntico al archivo de Brutos)
  const colDefs = [
    { label: 'FECHA_INI',                             key: 'fecIni',      type: 'txt', width: 14 },
    { label: 'FECHA_FIN',                             key: 'fecFin',      type: 'txt', width: 14 },
    { label: 'ID_EMPLEADO',        key: 'legajo',     type: 'txt', width: 12 },
    cols.hasNombre    && { label: 'NOMBRE',            key: 'nombre',      type: 'txt', width: 22 },
    cols.hasApellido1 && { label: 'APELLIDO_1',        key: 'apellido1',   type: 'txt', width: 22 },
    cols.hasFecAlta   && { label: 'FECHA_ALTA',        key: 'fecAlta',     type: 'txt', width: 14 },
    cols.hasFecBaja   && { label: 'FECHA_BAJA',        key: 'fecBaja',     type: 'txt', width: 14 },
    cols.hasFecPago   && { label: 'FEC_PAGO',          key: 'fecPago',     type: 'txt', width: 14 },
    cols.hasSalBase   && { label: 'SAL_BASE',          key: 'salBase',     type: 'num', width: 18 },
    cols.hasACuFut    && { label: 'A_CTA_FUT_AUMEN',   key: 'aCuFutAumen', type: 'num', width: 20 },
    cols.hasPuesto    && { label: 'N_PUESTO',          key: 'puesto',      type: 'txt', width: 14 },
  ].filter(Boolean);

  ws.columns = colDefs.map(c => ({ width: c.width }));

  // Fila de encabezado
  const hdr = ws.addRow(colDefs.map(c => c.label));
  hdr.height = 20;
  hdr.eachCell(cell => {
    cell.font      = { name: 'Calibri', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  const numFmt = '#,##0.00';
  for (const r of rows) {
    const values = colDefs.map(c => r[c.key]);
    const dr = ws.addRow(values);
    colDefs.forEach((c, i) => {
      const cell = dr.getCell(i + 1);
      cell.font = { name: 'Calibri', size: 10 };
      if (c.type === 'num') {
        cell.numFmt    = numFmt;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { vertical: 'middle' };
      }
    });
  }

  await downloadWorkbook(wb, `Brutos_Reporte_${periodSuffix(results.period)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRaw(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// Convierte un serial de fecha Excel (ej: 45734) a "D/M/YYYY".
// Si el valor no es un serial válido (ya viene como texto de fecha), lo devuelve tal cual.
function fmtDate(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  // Seriales razonables: > 1 (post 1900) y < 100000 (no es un importe)
  if (!isNaN(n) && n > 1 && n < 100000 && String(v).trim() !== '') {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  }
  // Ya viene como string de fecha u otro formato — lo devuelve sin cambios
  const s = String(v).trim();
  return s === '' ? null : s;
}


function dateSuffix() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function periodSuffix(period) {
  if (!period) return dateSuffix();
  const [year, month] = period.split('-');
  return (!year || !month) ? dateSuffix() : String(month).padStart(2, '0') + year;
}

// Primer día hábil (lun–vie) del mes
function firstBusinessDay(year, month) {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

// Último día hábil (lun–vie) del mes
function lastBusinessDay(year, month) {
  const d = new Date(year, month, 0); // día 0 del mes siguiente = último del actual
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

// Fecha como D/M/YYYY (formato usado en el archivo de Brutos)
function fmtDateAR(d) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
