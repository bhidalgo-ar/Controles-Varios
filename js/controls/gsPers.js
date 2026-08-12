// gsPers.js — Controles de Gastos Personales y Cochera (GS Pers)
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
//
// Modo 1 — "Controlar": cruza GTOS_PERSONALES y DTO_COCHERA del Reporte de GS Pers
//   contra las columnas configuradas en el Tabulado (tabGtosPersonalesColumn / tabDtoCocheraColumn).
//
// Modo 2 — "Generar Reporte": genera el Reporte de GS Pers directamente desde el
//   Tabulado, sin necesitar el archivo externo. Exporta a .xlsx sin colores de control.

// ── Modo 1: Controlar ─────────────────────────────────────────────────────────

export function summarizeGsPers(results) {
  const s = results.summary;
  const hasDiff = s.conDifGtos > 0 || s.conDifDto > 0;

  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    results.rows,
    [
      { key: 'ctrlGtos', get: r => r.ctrlGtos, label: 'GTOS_PERSONALES' },
      { key: 'ctrlDto',  get: r => r.ctrlDto,  label: 'DTO_COCHERA' },
    ],
    (row, field) => `${field.label} — leg. ${row.legajo}`
  );
  const concepts = [];
  if (s.conDifGtos > 0) concepts.push('GTOS_PERSONALES');
  if (s.conDifDto > 0)  concepts.push('DTO_COCHERA');
  const contextNote = concepts.length === 0
    ? 'GTOS_PERSONALES y DTO_COCHERA verificados'
    : concepts.length === 1 ? `todos en ${concepts[0]}` : concepts.join(' y ');

  return {
    status:   hasDiff ? 'warning' : 'success',
    headline: `${s.total} registros · ${s.sinTabData} sin datos en Tabulado`,
    insights: [
      {
        type:  s.conDifGtos > 0 ? 'warning' : 'success',
        label: 'diferencias GTOS_PERSONALES vs Tabulado',
        value: s.conDifGtos,
      },
      {
        type:  s.conDifDto > 0 ? 'warning' : 'success',
        label: 'diferencias DTO_COCHERA vs Tabulado',
        value: s.conDifDto,
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

export function runGsPers(gsRows, tabRows, mapping) {
  const gm = mapping.gs_pers;
  const tm = mapping.tab;

  const gtosTabCol = tm.tabGtosPersonalesColumn || null;
  const dtoTabCol  = tm.tabDtoCocheraColumn     || null;

  // Índice del Tabulado: legajo → { valGtos, valDto } sumado entre todas las
  // liquidaciones del legajo en el mes (ej: mensual + baja) — igual que en
  // Brutos y NR (ver groupTabRowsByLegajo/sumTabColumn más abajo).
  const tabByLegajo = new Map();
  for (const [id, group] of groupTabRowsByLegajo(tabRows, tm.empleadoColumn)) {
    tabByLegajo.set(id, {
      valGtos: sumTabColumn(group, gtosTabCol),
      valDto:  sumTabColumn(group, dtoTabCol),
    });
  }

  const rows = gsRows.map(row => {
    const legajo = norm(row[gm.legajoColumn]);
    const gtos   = toNum(row[gm.gtosPersonalesColumn]);
    const dto    = toNum(row[gm.dtoCocheraColumn]);
    const tab    = tabByLegajo.get(legajo) ?? { valGtos: null, valDto: null };

    const ctrlGtos = tab.valGtos !== null && gtos !== null ? tab.valGtos - gtos : null;
    const ctrlDto  = tab.valDto  !== null && dto  !== null ? tab.valDto  - dto  : null;

    return {
      legajo,
      gtos,
      dto,
      tabValGtos: tab.valGtos,
      tabValDto:  tab.valDto,
      ctrlGtos,
      ctrlDto,
    };
  });

  const conDifGtos  = rows.filter(r => r.ctrlGtos !== null && Math.abs(r.ctrlGtos) > 0.01).length;
  const conDifDto   = rows.filter(r => r.ctrlDto  !== null && Math.abs(r.ctrlDto)  > 0.01).length;
  const sinTabData  = rows.filter(r => r.tabValGtos === null && r.tabValDto === null).length;

  return {
    summary: { total: rows.length, conDifGtos, conDifDto, sinTabData },
    rows,
    period: mapping.period || '',
  };
}

const CYAN_BG   = 'rgba(0,172,212,0.10)';
const CYAN_HDR  = 'rgba(0,172,212,0.22)';
const LILAC_BG  = 'rgba(130,80,200,0.09)';
const LILAC_HDR = 'rgba(130,80,200,0.20)';

// Un legajo es "evaluable" si hay algún valor real de GTOS_PERSONALES o
// DTO_COCHERA en cualquiera de las dos fuentes — la mayoría de los legajos no
// tienen ninguno de los dos (CLAUDE.md §11.1).
function gsPersHasAnyValue(r) {
  return [r.gtos, r.dto, r.tabValGtos, r.tabValDto].some(v => v !== null && Math.abs(v) > 0.01);
}
function gsPersRowHasDiff(r) {
  return (r.ctrlGtos !== null && Math.abs(r.ctrlGtos) > 0.01) || (r.ctrlDto !== null && Math.abs(r.ctrlDto) > 0.01);
}
function gsPersDiffAmount(r) {
  return Math.abs(r.ctrlGtos ?? 0) + Math.abs(r.ctrlDto ?? 0);
}

export function renderGsPersResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const relevantRows = rows.filter(gsPersHasAnyValue);
  const diffRows     = relevantRows.filter(gsPersRowHasDiff);
  const okCount      = relevantRows.length - diffRows.length;
  const noValueCount = rows.length - relevantRows.length;

  const sumGtos    = relevantRows.reduce((s, r) => s + (r.gtos       ?? 0), 0);
  const sumGtosTab = relevantRows.reduce((s, r) => s + (r.tabValGtos ?? 0), 0);
  const diffGtos   = sumGtosTab - sumGtos;
  const sumDto     = relevantRows.reduce((s, r) => s + (r.dto        ?? 0), 0);
  const sumDtoTab  = relevantRows.reduce((s, r) => s + (r.tabValDto  ?? 0), 0);
  const diffDto    = sumDtoTab - sumDto;

  container.innerHTML = '';

  renderResumenDetalle(container, {
    resumen(panel) {
      const tone = diffRows.length === 0 ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: diffRows.length === 0
          ? 'GTOS_PERSONALES y DTO_COCHERA coinciden con el Tabulado en todos los legajos.'
          : `${diffRows.length} de ${relevantRows.length} legajos tienen diferencia en GTOS_PERSONALES o DTO_COCHERA.`,
        body: diffRows.length === 0
          ? `${relevantRows.length} legajo${relevantRows.length === 1 ? '' : 's'} con algún valor real, verificados contra el Tabulado sin diferencias.`
          : `Diferencia total de <strong>${fmt(diffGtos)}</strong> en GTOS_PERSONALES y <strong>${fmt(diffDto)}</strong> en DTO_COCHERA (Tab − GS Pers). El detalle completo está en la solapa «Detalle».`,
      });

      renderTiles(panel, [
        { label: 'Legajos evaluados', value: relevantRows.length,
          sub: noValueCount > 0 ? `${noValueCount} sin valor real (no se muestran)` : 'del Reporte de GS Pers' },
        { label: 'Sin diferencia', value: okCount, tone: 'ok' },
        { label: 'Con diferencia', value: diffRows.length, tone: diffRows.length > 0 ? 'error' : 'ok' },
        { label: 'Dif. GTOS_PERSONALES', value: fmt(diffGtos), tone: Math.abs(diffGtos) > 0.01 ? 'error' : 'ok' },
        { label: 'Dif. DTO_COCHERA', value: fmt(diffDto), tone: Math.abs(diffDto) > 0.01 ? 'error' : 'ok' },
      ]);

      if (diffRows.length > 0) {
        const top = [...diffRows].sort((a, b) => gsPersDiffAmount(b) - gsPersDiffAmount(a)).slice(0, 5);
        renderIssues(panel, {
          heading: `Casos para revisar · ${top.length} de ${diffRows.length}`,
          items: top.map(r => {
            const bits = [];
            if (r.ctrlGtos !== null && Math.abs(r.ctrlGtos) > 0.01) bits.push(`GTOS_PERSONALES ${fmt(r.ctrlGtos)}`);
            if (r.ctrlDto !== null && Math.abs(r.ctrlDto) > 0.01) bits.push(`DTO_COCHERA ${fmt(r.ctrlDto)}`);
            const worst = Math.abs(r.ctrlGtos ?? 0) >= Math.abs(r.ctrlDto ?? 0) ? r.ctrlGtos : r.ctrlDto;
            return {
              sev: bits.length > 1 ? 'hi' : 'lo',
              who: `Legajo ${r.legajo}`,
              what: bits.join(' · '),
              why: 'Diferencia Tab − GS Pers.',
              right: `<span class="${mvClass(worst)}">${mvArrow(worst)} ${fmtSigned(worst)}</span>`,
            };
          }),
        });
      }
    },
    detalle(panel) { renderGsPersDetalle(panel, { relevantRows, diffRows, results }); },
  });
}

function renderGsPersDetalle(container, { relevantRows, diffRows, results }) {
  if (relevantRows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Ningún legajo tiene valor real en GTOS_PERSONALES o DTO_COCHERA.</p>`;
    return;
  }

  const filterSel = document.createElement('select');
  filterSel.className = 'form-select form-select--sm';
  filterSel.innerHTML = `
    <option value="dif">Sólo con diferencia (${diffRows.length})</option>
    <option value="all">Todos los evaluados (${relevantRows.length})</option>
  `;
  if (diffRows.length === 0) filterSel.value = 'all';

  const { searchEl, exportEl } = createResultsToolbar(container, { left: filterSel });

  const csvHeaders = ['Legajo', 'GTOS_PERSONALES', 'CTRL GTOS_PERSONALES', 'DTO_COCHERA', 'CTRL DTO_COCHERA', 'GTOS_PERSONALES (Tab)', 'DTO_COCHERA (Tab)'];
  const csvRows = () => relevantRows.map(r => [r.legajo, fmt(r.gtos), fmt(r.ctrlGtos), fmt(r.dto), fmt(r.ctrlDto), fmt(r.tabValGtos), fmt(r.tabValDto)]);

  renderExportMenu(exportEl, {
    onExcel: () => exportGsPersToXlsx({ ...results, rows: relevantRows }),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `GsPers_Control_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });

  const tableHost = document.createElement('div');
  container.appendChild(tableHost);

  function renderTable() {
    const shownRows = filterSel.value === 'dif' ? diffRows : relevantRows;
    const maxAbs = Math.max(1, ...shownRows.flatMap(r => [Math.abs(r.ctrlGtos ?? 0), Math.abs(r.ctrlDto ?? 0)]));
    const totGtos = shownRows.reduce((s, r) => s + (r.gtos ?? 0), 0);
    const totGtosTab = shownRows.reduce((s, r) => s + (r.tabValGtos ?? 0), 0);
    const totDto = shownRows.reduce((s, r) => s + (r.dto ?? 0), 0);
    const totDtoTab = shownRows.reduce((s, r) => s + (r.tabValDto ?? 0), 0);

    tableHost.innerHTML = `
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th rowspan="2">Legajo</th>
            <th colspan="3" style="text-align:center;background:${CYAN_HDR};">GTOS_PERSONALES</th>
            <th colspan="3" style="text-align:center;background:${LILAC_HDR};">DTO_COCHERA</th>
          </tr>
          <tr>
            <th style="background:${CYAN_HDR};">GS Pers</th>
            <th style="background:${CYAN_HDR};">Tab</th>
            <th style="background:${CYAN_HDR};"><strong>CTRL</strong><br><small style="font-weight:400;">Tab − GS Pers</small></th>
            <th style="background:${LILAC_HDR};">GS Pers</th>
            <th style="background:${LILAC_HDR};">Tab</th>
            <th style="background:${LILAC_HDR};"><strong>CTRL</strong><br><small style="font-weight:400;">Tab − GS Pers</small></th>
          </tr>
        </thead>
        <tbody>
          ${shownRows.map(r => `
            <tr>
              <td>${esc(r.legajo)}</td>
              <td style="text-align:right;background:${CYAN_BG};">${fmt(r.gtos)}</td>
              <td style="text-align:right;background:${CYAN_BG};">${fmt(r.tabValGtos)}</td>
              ${diffCellHtml(r.ctrlGtos, { max: maxAbs, background: CYAN_BG })}
              <td style="text-align:right;background:${LILAC_BG};">${fmt(r.dto)}</td>
              <td style="text-align:right;background:${LILAC_BG};">${fmt(r.tabValDto)}</td>
              ${diffCellHtml(r.ctrlDto, { max: maxAbs, background: LILAC_BG })}
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>TOTAL</strong> — ${shownRows.length}</td>
            <td style="text-align:right;background:${CYAN_HDR};">${fmt(totGtos)}</td>
            <td style="text-align:right;background:${CYAN_HDR};">${fmt(totGtosTab)}</td>
            ${diffCellHtml(totGtosTab - totGtos, { background: CYAN_HDR })}
            <td style="text-align:right;background:${LILAC_HDR};">${fmt(totDto)}</td>
            <td style="text-align:right;background:${LILAC_HDR};">${fmt(totDtoTab)}</td>
            ${diffCellHtml(totDtoTab - totDto, { background: LILAC_HDR })}
          </tr>
        </tfoot>
      </table>
    `;

    const tbodyEl = tableHost.querySelector('tbody');
    const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
    initSearchCombobox(searchEl, {
      rows: shownRows,
      trEls: pagination.dataRows,
      getLabel: r => `${r.legajo}`,
      pagination,
    });
    enhanceGrid(tableHost.querySelector('table'), { stickyCols: 1 });
  }

  filterSel.addEventListener('change', renderTable);
  renderTable();
}

// ── Modo 2: Generar Reporte ───────────────────────────────────────────────────

export function runGsPersReporte(_primaryRows, tabRows, mapping) {
  const tm     = mapping.tab;
  const period = mapping.period || '';

  const [year, month] = period.split('-').map(Number);
  const fecIniStr = (year && month) ? fmtDateAR(firstBusinessDay(year, month)) : '';
  const fecFinStr = (year && month) ? fmtDateAR(lastBusinessDay(year, month))  : '';

  const nombreCol    = tm.tabNombreColumn   || tm.apellidoNombreColumn || null;
  const apellido1Col = tm.tabApellido1Column || null;
  const idCCCol      = tm.idCCColumn || null;
  const ccCol        = tm.ccColumn   || null;

  // Un legajo puede tener más de una liquidación en el mes (ej: baja después de
  // haber cobrado el mensual). Consolidamos por legajo: los importes se suman
  // —Meta4 informa el total del mes por empleado— y los datos de referencia
  // (nombre, fechas, CC) se toman de la última liquidación. Mismo criterio que
  // runBrutosReporte y runNrReporte, y que el modo Controlar de este archivo.
  // Sin esto el .xlsx generado saca dos filas por cada legajo con doble paga,
  // con los importes partidos entre ellas.
  const tabGroups = groupTabRowsByLegajo(tabRows, tm.empleadoColumn);
  const rows = [...tabGroups.entries()].map(([legajo, group]) => {
    const last = group[group.length - 1];
    return {
      fecIni:       fecIniStr,
      fecFin:       fecFinStr,
      legajo,
      nombre:       nombreCol    ? norm(last[nombreCol])    : null,
      apellido1:    apellido1Col ? norm(last[apellido1Col]) : null,
      fecAlta:      tm.tabFecAltaColumn ? fmtDate(last[tm.tabFecAltaColumn]) : null,
      fecPago:      tm.tabFecPagoColumn ? fmtDate(last[tm.tabFecPagoColumn]) : null,
      idCC:         idCCCol ? norm(last[idCCCol]) : null,
      gtos:         sumTabColumn(group, tm.tabGtosPersonalesColumn),
      dto:          sumTabColumn(group, tm.tabDtoCocheraColumn),
      nCC:          ccCol ? norm(last[ccCol]) : null,
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
      hasFecPago:   !!tm.tabFecPagoColumn,
      hasIdCC:      !!idCCCol,
      hasGtos:      !!tm.tabGtosPersonalesColumn,
      hasDto:       !!tm.tabDtoCocheraColumn,
      hasNCC:       !!ccCol,
    },
  };
}

export function summarizeGsPersReporte(results) {
  return {
    status:   'info',
    headline: `${results.summary.total} registros — Reporte de GS Pers generado del Tabulado`,
    insights: [],
    unit:            null,
    unitsTotal:      null,
    unitsWithDiff:   null,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote:     null,
  };
}

export function renderGsPersReporteResults(results, container) {
  const { rows, cols } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const colDefs = [
    { label: 'FECHA_INI',         key: 'fecIni',    type: 'txt' },
    { label: 'FECHA_FIN',         key: 'fecFin',    type: 'txt' },
    { label: 'ID_EMPLEADO',       key: 'legajo',    type: 'txt' },
    cols.hasNombre    && { label: 'NOMBRE',         key: 'nombre',    type: 'txt' },
    cols.hasApellido1 && { label: 'APELLIDO_1',     key: 'apellido1', type: 'txt' },
    cols.hasFecPago   && { label: 'FEC_PAG',        key: 'fecPago',   type: 'txt' },
    cols.hasFecAlta   && { label: 'FECHA_ALTA',     key: 'fecAlta',   type: 'txt' },
    cols.hasIdCC      && { label: 'ID_CENTRO_COSTO', key: 'idCC',     type: 'txt' },
    cols.hasGtos      && { label: 'GTOS_PERSONALES', key: 'gtos',     type: 'num' },
    cols.hasDto       && { label: 'DTO_COCHERA',     key: 'dto',      type: 'num' },
    cols.hasNCC       && { label: 'N_CENTRO_COSTO',  key: 'nCC',      type: 'txt' },
  ].filter(Boolean);

  const sinColumnas = colDefs.length <= 3;

  container.innerHTML = '';

  renderResumenDetalle(container, {
    resumen(panel) {
      renderVerdict(panel, {
        tone: sinColumnas ? 'warn' : 'info',
        title: sinColumnas
          ? 'No hay columnas configuradas en el Tabulado para el Reporte de GS Pers.'
          : `Reporte de GS Pers generado — ${rows.length} registro${rows.length === 1 ? '' : 's'}.`,
        body: sinColumnas
          ? 'Volvé al paso de Controles y completá los campos de la sección "GS Pers".'
          : 'Armado directo desde el Tabulado. El detalle completo está en la solapa «Detalle».',
      });
      if (!sinColumnas) {
        renderTiles(panel, [
          { label: 'Registros', value: rows.length },
          { label: 'Columnas mapeadas', value: `${colDefs.length} / 11` },
        ]);
      }
    },
    detalle(panel) { renderGsPersReporteDetalle(panel, { rows, cols, colDefs, sinColumnas, results }); },
  });
}

function renderGsPersReporteDetalle(container, { rows, cols, colDefs, sinColumnas, results }) {
  if (sinColumnas) {
    container.innerHTML = '';
    return;
  }

  const fmtTxt = v => v === null ? '—' : esc(String(v));

  // Barra: buscador (izquierda) + menú de exportar (derecha)
  const { searchEl, exportEl } = createResultsToolbar(container);

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
                ? `<td style="text-align:right;">${fmt(r[c.key])}</td>`
                : `<td>${fmtTxt(r[c.key])}</td>`
            ).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

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
  // stickyCols:0 — la 1ª/2ª columna real son FECHA_INI/FECHA_FIN, no Legajo/Nombre.
  enhanceGrid(tableWrap.querySelector('table'), { stickyCols: 0 });

  const csvHeaders = colDefs.map(c => c.label);
  const csvRows = () => rows.map(r => colDefs.map(c => c.type === 'num' ? fmt(r[c.key]) : (r[c.key] ?? '')));

  renderExportMenu(exportEl, {
    onExcel: () => exportGsPersReporteToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `GsPers_Reporte_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
}

// ── Exports a Excel ───────────────────────────────────────────────────────────

async function exportGsPersToXlsx(results) {
  await loadExcelJS();
  const { rows } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Control GS Pers');
  ws.columns = [
    { width: 12 }, { width: 20 }, { width: 24 },
    { width: 18 }, { width: 22 }, { width: 12 },
    { width: 22 }, { width: 22 },
  ];

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };

  const CYAN_HDR  = 'FFC7ECF6';
  const CYAN_BG   = 'FFE6F8FB';
  const LILAC_HDR = 'FFE6DCF4';
  const LILAC_BG  = 'FFF4EFFA';
  const GRAY_HDR  = 'FFE8E8E8';

  const r1 = ws.addRow(['Legajo', 'GTOS_PERSONALES', null, 'DTO_COCHERA', null, 'Valores Tabulado', null, null]);
  const r2 = ws.addRow(['', 'GTOS_PERSONALES', 'CTRL GTOS_PERSONALES', 'DTO_COCHERA', 'CTRL DTO_COCHERA', 'Legajo', 'GTOS_PERS (Tab)', 'DTO_COCHERA (Tab)']);

  ws.mergeCells('A1:A2');
  ws.mergeCells('B1:C1');
  ws.mergeCells('D1:E1');
  ws.mergeCells('F1:H1');
  r1.height = 22;
  r2.height = 20;

  const styleGrp = (cell, bg) => {
    cell.font = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = solidFill(bg);
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } } };
  };
  styleGrp(r1.getCell(1), GRAY_HDR);
  styleGrp(r1.getCell(2), CYAN_HDR);
  styleGrp(r1.getCell(4), LILAC_HDR);
  styleGrp(r1.getCell(6), GRAY_HDR);

  const styleCol = (cell, bg, isBold = false) => {
    cell.font = isBold ? { ...bold } : { ...base };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = solidFill(bg);
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  };
  styleCol(r2.getCell(2), CYAN_HDR,  false);
  styleCol(r2.getCell(3), CYAN_HDR,  true);
  styleCol(r2.getCell(4), LILAC_HDR, false);
  styleCol(r2.getCell(5), LILAC_HDR, true);
  styleCol(r2.getCell(6), GRAY_HDR,  false);
  styleCol(r2.getCell(7), GRAY_HDR,  false);
  styleCol(r2.getCell(8), GRAY_HDR,  false);

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  const numFmt = '#,##0.00';
  for (const r of rows) {
    const dr = ws.addRow([r.legajo, r.gtos, r.ctrlGtos, r.dto, r.ctrlDto, r.legajo, r.tabValGtos, r.tabValDto]);
    dr.getCell(2).fill = solidFill(CYAN_BG);
    dr.getCell(3).fill = solidFill(CYAN_BG);
    dr.getCell(4).fill = solidFill(LILAC_BG);
    dr.getCell(5).fill = solidFill(LILAC_BG);
    for (const col of [2, 3, 4, 5, 7, 8]) {
      dr.getCell(col).numFmt    = numFmt;
      dr.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
      dr.getCell(col).font      = { ...base };
    }
    if (r.ctrlGtos !== null && Math.abs(r.ctrlGtos) > 0.01)
      dr.getCell(3).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    if (r.ctrlDto !== null && Math.abs(r.ctrlDto) > 0.01)
      dr.getCell(5).font = { ...base, bold: true, color: { argb: 'FFCC0000' } };
    dr.getCell(1).font = { ...base };
    dr.getCell(6).font = { ...base };
  }

  await downloadWorkbook(wb, `GsPers_Control_${periodSuffix(results.period)}.xlsx`);
}

async function exportGsPersReporteToXlsx(results) {
  await loadExcelJS();
  const { rows, cols } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const ws = wb.addWorksheet('Reporte GS Pers');

  const colDefs = [
    { label: 'FECHA_INI',          key: 'fecIni',    type: 'txt', width: 14 },
    { label: 'FECHA_FIN',          key: 'fecFin',    type: 'txt', width: 14 },
    { label: 'ID_EMPLEADO',        key: 'legajo',    type: 'txt', width: 12 },
    cols.hasNombre    && { label: 'NOMBRE',           key: 'nombre',    type: 'txt', width: 22 },
    cols.hasApellido1 && { label: 'APELLIDO_1',       key: 'apellido1', type: 'txt', width: 22 },
    cols.hasFecPago   && { label: 'FEC_PAG',          key: 'fecPago',   type: 'txt', width: 14 },
    cols.hasFecAlta   && { label: 'FECHA_ALTA',       key: 'fecAlta',   type: 'txt', width: 14 },
    cols.hasIdCC      && { label: 'ID_CENTRO_COSTO',  key: 'idCC',      type: 'txt', width: 16 },
    cols.hasGtos      && { label: 'GTOS_PERSONALES',  key: 'gtos',      type: 'num', width: 18 },
    cols.hasDto       && { label: 'DTO_COCHERA',      key: 'dto',       type: 'num', width: 18 },
    cols.hasNCC       && { label: 'N_CENTRO_COSTO',   key: 'nCC',       type: 'txt', width: 22 },
  ].filter(Boolean);

  ws.columns = colDefs.map(c => ({ width: c.width }));

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

  await downloadWorkbook(wb, `GsPers_Reporte_${periodSuffix(results.period)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v) { return v != null ? String(v).trim() : ''; }

function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// Agrupa las filas del Tabulado por legajo, preservando el orden de aparición.
// Espeja groupTabRowsByLegajo de brutos.js.
function groupTabRowsByLegajo(tabRows, empleadoColumn) {
  const groups = new Map();
  for (const row of tabRows) {
    const id = norm(row[empleadoColumn]);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

// Suma un concepto a través de las liquidaciones de un legajo. Devuelve null
// si la columna no está mapeada o ninguna liquidación tiene dato (distinto de 0).
function sumTabColumn(rows, col) {
  if (!col) return null;
  let total = null;
  for (const row of rows) {
    const v = toNum(row[col]);
    total = (total === null && v === null) ? null : (total ?? 0) + (v ?? 0);
  }
  return total;
}

// Convierte un serial de fecha Excel a "D/M/YYYY".
function fmtDate(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!isNaN(n) && n > 1 && n < 100000 && String(v).trim() !== '') {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function firstBusinessDay(year, month) {
  const d = new Date(year, month - 1, 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

function lastBusinessDay(year, month) {
  const d = new Date(year, month, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

function fmtDateAR(d) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
