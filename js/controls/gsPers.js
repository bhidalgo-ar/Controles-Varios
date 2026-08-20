// gsPers.js — Controles de Gastos Personales y Cochera (GS Pers)
import { diffStats } from './semaforo.js';
import { isDiff } from './tolerance.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { createResultsToolbar, wireTableTools } from '../ui/tableTools.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmt, toNum } from '../utils/currency.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { groupRowsByLegajo, sumColumn, lastRow } from './consolidate.js';
import { EXPORT_CONTRACTS } from '../exports/contracts.js';
import { writeContractSheet, writeGroupedContractSheet, contractColDefs } from '../exports/contractSheet.js';
import { periodSuffix } from '../utils/dates.js';
import {
  renderVerdict, renderTiles, renderIssues, renderResumenDetalle, diffCellHtml,
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
  const rows = results.rows;

  // Evaluado = los DOS lados tenían dato — no "algún valor real en cualquiera
  // de los dos" (eso es `gsPersHasAnyValue`, más abajo). Mismo mecanismo que
  // brutos.js: si `gtosPersonalesColumn` nunca se mapeó en el archivo de GS
  // Pers, "0 diferencias" no es un resultado limpio, es que no se comparó
  // nada (Paso 5 de specs/contrato-export.md — D-041).
  const evalGtos       = rows.filter(r => r.ctrlGtos !== null).length;
  const evalDto        = rows.filter(r => r.ctrlDto  !== null).length;
  const unitsEvaluated = rows.filter(r => r.ctrlGtos !== null || r.ctrlDto !== null).length;
  const nadaEvaluado   = s.total > 0 && unitsEvaluated === 0;

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
  const contextNote = nadaEvaluado
    ? 'sin datos para comparar — revisá el mapeo del archivo de GS Pers'
    : concepts.length === 0
    ? 'GTOS_PERSONALES y DTO_COCHERA verificados'
    : concepts.length === 1 ? `todos en ${concepts[0]}` : concepts.join(' y ');

  return {
    status:   nadaEvaluado ? 'error' : (hasDiff ? 'warning' : 'success'),
    headline: nadaEvaluado
      ? `${s.total} registros · ninguno se pudo comparar`
      : `${s.total} registros · ${s.sinTabData} sin datos en Tabulado`,
    insights: [
      {
        type:  evalGtos === 0 ? 'warning' : (s.conDifGtos > 0 ? 'warning' : 'success'),
        label: evalGtos === 0 ? 'GTOS_PERSONALES — sin datos para comparar' : 'diferencias GTOS_PERSONALES vs Tabulado',
        value: evalGtos === 0 ? 0 : s.conDifGtos,
      },
      {
        type:  evalDto === 0 ? 'warning' : (s.conDifDto > 0 ? 'warning' : 'success'),
        label: evalDto === 0 ? 'DTO_COCHERA — sin datos para comparar' : 'diferencias DTO_COCHERA vs Tabulado',
        value: evalDto === 0 ? 0 : s.conDifDto,
      },
    ],
    unit: 'legajo',
    unitsTotal: s.total,
    unitsEvaluated,
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

  // Los dos lados se consolidan por legajo: un legajo puede tener más de una
  // liquidación en el mes (ej: mensual + baja) y el reporte informa el total
  // sumado (ver ./consolidate.js). Este control ya arrastró el bug dos veces —
  // en modo Controlar y en modo Reporte — por tener el helper copiado.
  const keyFn = makeLegajoKey(mapping.legajoKeyMode);
  const tabByLegajo = new Map();
  for (const [id, group] of groupRowsByLegajo(tabRows, tm.empleadoColumn, { keyFn })) {
    tabByLegajo.set(id, {
      valGtos: sumColumn(group, gtosTabCol),
      valDto:  sumColumn(group, dtoTabCol),
    });
  }

  const rows = [...groupRowsByLegajo(gsRows, gm.legajoColumn, { keyFn }).entries()].map(([legajo, group]) => {
    const gtos   = sumColumn(group, gm.gtosPersonalesColumn);
    const dto    = sumColumn(group, gm.dtoCocheraColumn);
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

  const conDifGtos  = rows.filter(r => isDiff(r.ctrlGtos)).length;
  const conDifDto   = rows.filter(r => isDiff(r.ctrlDto)).length;
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
// El monto de diferencia del cliente (D-069) no entra acá: la pregunta es si el
// concepto se liquidó, no si difiere. Con el monto en $ 100, una cochera de
// $ 50 haría desaparecer al legajo de la comparación en vez de marcarlo.
const VALOR_REAL_EPS = 0.01;
function gsPersHasAnyValue(r) {
  return [r.gtos, r.dto, r.tabValGtos, r.tabValDto].some(v => v !== null && Math.abs(v) > VALOR_REAL_EPS);
}
function gsPersRowHasDiff(r) {
  return isDiff(r.ctrlGtos) || isDiff(r.ctrlDto);
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
  const noValueCount = rows.length - relevantRows.length;

  // Evaluado = los DOS lados tenían dato — ver el comentario largo en
  // renderBrutosResults. Mismo mecanismo, mismo motivo (D-041, Paso 5).
  const evalGtos       = rows.filter(r => r.ctrlGtos !== null).length;
  const evalDto        = rows.filter(r => r.ctrlDto  !== null).length;
  const unitsEvaluated = rows.filter(r => r.ctrlGtos !== null || r.ctrlDto !== null).length;
  const nadaEvaluado   = rows.length > 0 && evalGtos === 0 && evalDto === 0;
  // Con dato real en algún lado pero sin par para comparar — mismo hueco que
  // en brutos.js, mismo motivo.
  const noEvaluatedCount = relevantRows.length - unitsEvaluated;
  // "Sin diferencia" es sobre lo EVALUADO, no sobre "algún valor real en
  // cualquier lado" (relevantRows) — ver el comentario largo en brutos.js.
  const okCount = unitsEvaluated - diffRows.length;

  const sumGtos    = relevantRows.reduce((s, r) => s + (r.gtos       ?? 0), 0);
  const sumGtosTab = relevantRows.reduce((s, r) => s + (r.tabValGtos ?? 0), 0);
  const diffGtos   = sumGtosTab - sumGtos;
  const sumDto     = relevantRows.reduce((s, r) => s + (r.dto        ?? 0), 0);
  const sumDtoTab  = relevantRows.reduce((s, r) => s + (r.tabValDto  ?? 0), 0);
  const diffDto    = sumDtoTab - sumDto;

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'gs_pers',
    resumen(panel) {
      const tone = nadaEvaluado ? 'error' : (diffRows.length === 0 ? 'ok' : 'warn');
      renderVerdict(panel, {
        tone,
        title: nadaEvaluado
          ? 'No se pudo comparar ningún legajo.'
          : diffRows.length === 0
          ? 'GTOS_PERSONALES y DTO_COCHERA coinciden con el Tabulado en todos los legajos.'
          : `${diffRows.length} de ${unitsEvaluated} legajos tienen diferencia en GTOS_PERSONALES o DTO_COCHERA.`,
        body: nadaEvaluado
          ? 'El archivo de GS Pers no aportó ningún valor en GTOS_PERSONALES ni en DTO_COCHERA — revisá el mapeo de columnas de ese archivo.'
          : diffRows.length === 0
          ? `${unitsEvaluated} legajo${unitsEvaluated === 1 ? '' : 's'} con algún valor real, verificados contra el Tabulado sin diferencias.`
          : `Diferencia total de <strong>${fmt(diffGtos)}</strong> en GTOS_PERSONALES y <strong>${fmt(diffDto)}</strong> en DTO_COCHERA (Tab − GS Pers). El detalle completo está en la solapa «Detalle».`,
      });

      renderTiles(panel, [
        { label: 'Legajos evaluados', value: unitsEvaluated,
          sub: noEvaluatedCount > 0
            ? `${noEvaluatedCount} con dato de un solo lado (sin comparar)`
            : noValueCount > 0 ? `${noValueCount} sin valor real (no se muestran)` : 'del Reporte de GS Pers' },
        { label: 'Sin diferencia', value: okCount, tone: 'ok' },
        { label: 'Con diferencia', value: diffRows.length, tone: diffRows.length > 0 ? 'error' : 'ok' },
        evalGtos === 0
          ? { label: 'GTOS_PERSONALES', value: 'sin datos para comparar', tone: 'error' }
          : { label: 'Dif. GTOS_PERSONALES', value: fmt(diffGtos), tone: isDiff(diffGtos) ? 'error' : 'ok' },
        evalDto === 0
          ? { label: 'DTO_COCHERA', value: 'sin datos para comparar', tone: 'error' }
          : { label: 'Dif. DTO_COCHERA', value: fmt(diffDto), tone: isDiff(diffDto) ? 'error' : 'ok' },
      ]);

      if (diffRows.length > 0) {
        const top = [...diffRows].sort((a, b) => gsPersDiffAmount(b) - gsPersDiffAmount(a)).slice(0, 5);
        renderIssues(panel, {
          heading: `Casos para revisar · ${top.length} de ${diffRows.length}`,
          items: top.map(r => {
            const bits = [];
            if (isDiff(r.ctrlGtos)) bits.push(`GTOS_PERSONALES ${fmt(r.ctrlGtos)}`);
            if (isDiff(r.ctrlDto)) bits.push(`DTO_COCHERA ${fmt(r.ctrlDto)}`);
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
  // El filtro de estado es lo que se dibuja como chips (§3 de
  // specs/vista-estandar-resultados.md) — se declara, no se adivina.
  filterSel.dataset.chips = '1';
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

    wireTableTools(tableHost.querySelector('table'), {
      rows: shownRows,
      getLabel: r => `${r.legajo}`,
      searchEl,
      stickyCols: 1,
    });
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
  const tabGroups = groupRowsByLegajo(tabRows, tm.empleadoColumn, {
    keyFn: makeLegajoKey(mapping.legajoKeyMode),
  });
  const rows = [...tabGroups.entries()].map(([legajo, group]) => {
    const last = lastRow(group);
    return {
      fecIni:       fecIniStr,
      fecFin:       fecFinStr,
      legajo,
      nombre:       nombreCol    ? norm(last[nombreCol])    : null,
      apellido1:    apellido1Col ? norm(last[apellido1Col]) : null,
      fecAlta:      tm.tabFecAltaColumn ? fmtDate(last[tm.tabFecAltaColumn]) : null,
      fecPago:      tm.tabFecPagoColumn ? fmtDate(last[tm.tabFecPagoColumn]) : null,
      idCC:         idCCCol ? norm(last[idCCCol]) : null,
      gtos:         sumColumn(group, tm.tabGtosPersonalesColumn),
      dto:          sumColumn(group, tm.tabDtoCocheraColumn),
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

const GS_PERS_REPORTE_CONTRACT = EXPORT_CONTRACTS.gs_pers_reporte;
const GS_PERS_CONTROLAR_CONTRACT = EXPORT_CONTRACTS.gs_pers;

export function renderGsPersReporteResults(results, container) {
  const { rows, cols } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  // Columnas: SIEMPRE las 11 del contrato, en su orden — layout:'fijo'
  // (D-041, Paso 4a). Antes desaparecían con `cols.has*`; ahora pantalla,
  // CSV y xlsx leen las tres de `GS_PERS_REPORTE_CONTRACT.columns`.
  const colDefs = contractColDefs(GS_PERS_REPORTE_CONTRACT);
  const sinColumnas = !Object.values(cols).some(Boolean);

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'gs_pers_reporte',
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
        const mapeadas = 3 + Object.values(cols).filter(Boolean).length;
        renderTiles(panel, [
          { label: 'Registros', value: rows.length },
          { label: 'Columnas mapeadas', value: `${mapeadas} / ${colDefs.length}` },
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

  const legajoKey  = colDefs.find(c => c.key === 'legajo') ? 'legajo' : colDefs[0].key;
  const nombreKey  = cols.hasNombre ? 'nombre' : (cols.hasApellido1 ? 'apellido1' : null);
  // stickyCols:0 — la 1ª/2ª columna real son FECHA_INI/FECHA_FIN, no Legajo/Nombre.
  wireTableTools(tableWrap.querySelector('table'), {
    rows,
    getLabel: r => nombreKey ? `${r[legajoKey]} — ${r[nombreKey]}` : `${r[legajoKey]}`,
    searchEl,
    stickyCols: 0,
  });

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
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();
  writeGroupedContractSheet(wb, GS_PERS_CONTROLAR_CONTRACT, results.rows);
  await downloadWorkbook(wb, `GsPers_Control_${periodSuffix(results.period)}.xlsx`);
}

async function exportGsPersReporteToXlsx(results) {
  await loadExcelJS();

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  // Única fuente de las 11 columnas — layout:'fijo' (Paso 4a).
  writeContractSheet(wb, GS_PERS_REPORTE_CONTRACT, results.rows);

  await downloadWorkbook(wb, `GsPers_Reporte_${periodSuffix(results.period)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Limpieza de texto (nombre, centro de costo). La clave de legajo NO sale de
// acá: sale de `makeLegajoKey(mapping.legajoKeyMode)` (D-038).
function norm(v) { return v != null ? String(v).trim() : ''; }

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
