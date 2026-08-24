// gsPers.js — Controles de Gastos Personales y Cochera (GS Pers)
import { diffStats } from './semaforo.js';
import { isDiff, currentTolerance } from './tolerance.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { estadoDeFila } from '../ui/tableTools.js';
import { renderPlanillaPanel, reporteColumns, NO_APLICA_REPORTE } from '../ui/planillaPanel.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmt, toNum } from '../utils/currency.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { groupRowsByLegajo, sumColumn, lastRow } from './consolidate.js';
import { EXPORT_CONTRACTS } from '../exports/contracts.js';
import { writeContractSheet, writeGroupedContractSheet, contractColDefs } from '../exports/contractSheet.js';
import { periodSuffix } from '../utils/dates.js';
import { resumenStats, RESUMEN_BLOCKS } from './resumenStats.js';
import {
  renderVerdict, renderTiles, renderIssues, renderResumenDetalle,
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
    resumen: resumenDelGsPers(results),
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
    // Ver el comentario largo en brutos.js: misma clave (D-038), mismo puente
    // (D-086), mismo motivo.
    legajoKeyMode: mapping.legajoKeyMode || null,
    bridge: bridgeDelRunGsPers(rows),
  };
}

/** El puente del Resumen: mismo criterio que `bridgeDelRunBrutos` (D-086),
 *  sumando GTOS_PERSONALES y DTO_COCHERA juntos —un solo puente por control. */
function bridgeDelRunGsPers(rows) {
  const relevantes = rows.filter(gsPersHasAnyValue);
  if (relevantes.length === 0) return null;

  let totalTabulado = 0, totalReporte = 0, diffComparada = 0;
  let tabSoloCount = 0, tabSoloAmount = 0, repSoloCount = 0, repSoloAmount = 0;

  const acumular = (tabVal, repVal, ctrl) => {
    if (tabVal !== null) totalTabulado += tabVal;
    if (repVal !== null) totalReporte  += repVal;
    if (ctrl !== null) {
      diffComparada += ctrl;
    } else if (tabVal !== null) {
      tabSoloCount++; tabSoloAmount += tabVal;
    } else if (repVal !== null) {
      repSoloCount++; repSoloAmount += repVal;
    }
  };
  for (const r of relevantes) {
    acumular(r.tabValGtos, r.gtos, r.ctrlGtos);
    acumular(r.tabValDto,  r.dto,  r.ctrlDto);
  }

  const soloCount = tabSoloCount + repSoloCount;
  return {
    steps: [
      { label: 'Total Tabulado', amount: totalTabulado, tone: 'ink' },
      { label: 'Diferencia comparada', amount: diffComparada, tone: 'error' },
      { label: 'Total Reporte', amount: totalReporte, tone: 'ink' },
    ],
    proportion: {
      parts: [
        { tone: 'neutral', amount: Math.abs(totalTabulado), label: 'Total Tabulado' },
        { tone: 'error',   amount: Math.abs(diffComparada), label: 'Diferencia comparada' },
      ],
    },
    uncompared: soloCount === 0 ? null : {
      label: labelSoloUnLadoGsPers(tabSoloCount, repSoloCount),
      amount: tabSoloAmount + repSoloAmount,
    },
  };
}

/** El texto de "lo que quedó de un solo lado" (D-086), con ambos lados si hace falta. */
function labelSoloUnLadoGsPers(tabCount, repCount) {
  const bits = [];
  if (tabCount > 0) bits.push(`${tabCount} sólo en el Tabulado`);
  if (repCount > 0) bits.push(`${repCount} sólo en el Reporte de GS Pers`);
  return `${bits.join(' y ')}, por`;
}

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

// ── El sub-objeto que dibuja el tablero del Resumen ─────────────────────────
//
// Mismo criterio que brutos.js: dos conceptos independientes por legajo, así
// que se abre cada legajo en hasta dos instancias (una por concepto con
// diferencia) para que "byCause" los junte por separado.
function instanciasPorConceptoGsPers(rows) {
  const out = [];
  for (const r of rows) {
    if (isDiff(r.ctrlGtos)) out.push({ legajo: r.legajo, concepto: 'GTOS_PERSONALES', dif: r.ctrlGtos });
    if (isDiff(r.ctrlDto))  out.push({ legajo: r.legajo, concepto: 'DTO_COCHERA',      dif: r.ctrlDto });
  }
  return out;
}

function resumenDelGsPers(results) {
  const legajoKey = makeLegajoKey(results.legajoKeyMode);
  const instancias = instanciasPorConceptoGsPers(results.rows);

  return resumenStats({
    unit: 'legajo',
    tolerance: currentTolerance(),
    rows: instancias,
    diff: (i) => i.dif,
    key: (i) => legajoKey(i.legajo),
    // Este control no trae el nombre del legajo (ver COLS_GS_PERS): sin
    // `unitLabel`, "Por dónde empezar" muestra sólo el número de legajo.
    cause: (i) => ({ key: i.concepto, label: i.concepto }),
    top: (i) => ({ legajo: i.legajo, rubro: i.concepto }),
    bridge: results.bridge || null,
    // Este control no trae empresa: una sola razón social por corrida.
    notApplicable: ['group'],
  });
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
          : `Diferencia total de <strong>${fmt(diffGtos)}</strong> en GTOS_PERSONALES y <strong>${fmt(diffDto)}</strong> en DTO_COCHERA (Tab − GS Pers). El detalle completo está en la solapa «Planilla».`,
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
    planilla(panel) { renderGsPersPlanilla(panel, { relevantRows, results }); },
  });
}

// ── La planilla (§5 de specs/vista-estandar-resultados.md) ───────────────────
//
// Una banda por concepto y, adentro, las tres columnas de siempre: lo que
// informa el Reporte de GS Pers, lo que dice el Tabulado y la resta. El tinte de
// las bandas sale de la pieza compartida — este módulo lo escribía a mano en
// celeste y lila, y el lila no es de la marca.
const COLS_GS_PERS = [
  { key: 'legajo', label: 'Legajo', band: 'Identificación' },

  { key: 'gtos',       label: 'GS Pers', sub: 'lo que informa el reporte',            band: 'GTOS_PERSONALES', num: true },
  { key: 'tabValGtos', label: 'Tab',     sub: 'la columna GTOS_PERSONALES del Tabulado', band: 'GTOS_PERSONALES', num: true },
  { key: 'ctrlGtos',   label: 'CTRL',    sub: 'Tab − GS Pers',                        band: 'GTOS_PERSONALES', diff: true, close: true,
    absentLabel: 'sin comparar',
    total: (rows) => sumaDe(rows, 'tabValGtos') - sumaDe(rows, 'gtos') },

  { key: 'dto',       label: 'GS Pers', sub: 'lo que informa el reporte',        band: 'DTO_COCHERA', num: true },
  { key: 'tabValDto', label: 'Tab',     sub: 'la columna DTO_COCHERA del Tabulado', band: 'DTO_COCHERA', num: true },
  { key: 'ctrlDto',   label: 'CTRL',    sub: 'Tab − GS Pers',                    band: 'DTO_COCHERA', diff: true, close: true,
    absentLabel: 'sin comparar',
    total: (rows) => sumaDe(rows, 'tabValDto') - sumaDe(rows, 'dto') },
];

/**
 * El TOTAL de una columna CTRL es la **resta de los totales** (Σ Tab − Σ GS Pers)
 * y no la suma de la columna: en cuanto un legajo no se puede comparar los dos
 * números dejan de coincidir, y el de la resta es el que muestra la tile
 * "Dif. GTOS_PERSONALES" del Resumen.
 */
function sumaDe(rows, key) {
  return rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
}

function renderGsPersPlanilla(container, { relevantRows, results }) {
  const csvHeaders = ['Legajo', 'GTOS_PERSONALES', 'CTRL GTOS_PERSONALES', 'DTO_COCHERA', 'CTRL DTO_COCHERA', 'GTOS_PERSONALES (Tab)', 'DTO_COCHERA (Tab)'];
  const csvRows = () => relevantRows.map(r => [r.legajo, fmt(r.gtos), fmt(r.ctrlGtos), fmt(r.dto), fmt(r.ctrlDto), fmt(r.tabValGtos), fmt(r.tabValDto)]);

  renderPlanillaPanel(container, {
    columns: COLS_GS_PERS,
    rows: relevantRows,
    unitLabel: 'legajos',
    estadoDe: r => estadoDeFila([r.ctrlGtos, r.ctrlDto]),
    getLabel: r => `${r.legajo}`,
    // Una sola columna de identificación: este control no trae el nombre.
    stickyCols: 1,
    empty: 'Ningún legajo tiene valor real en GTOS_PERSONALES o DTO_COCHERA.',
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onExcel: () => exportGsPersToXlsx({ ...results, rows: relevantRows }),
      onCsv:   () => downloadCsv(csvHeaders, csvRows(), `GsPers_Control_${periodSuffix(results.period)}.csv`),
      onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
  });
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
  // Mismo criterio que `renderGsPersReporteResults`: sin columnas mapeadas el
  // reporte sale vacío salvo lo fijo y no hay nada para descargar.
  const sinColumnas = !Object.values(results.cols).some(Boolean);
  const total = results.summary.total;

  return {
    status:   sinColumnas ? 'warning' : 'info',
    headline: sinColumnas
      ? 'No hay columnas configuradas en el Tabulado para el Reporte de GS Pers — no se puede descargar.'
      : `Reporte de GS Pers generado — ${total} registro${total === 1 ? '' : 's'}, listo para descargar.`,
    insights: [],
    unit:            null,
    unitsTotal:      null,
    unitsWithDiff:   null,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote:     sinColumnas
      ? 'Volvé al paso de Controles y completá los campos de la sección "GS Pers".'
      : null,
    // No cruza dos archivos: no hay escala, puente, lados ni cortes que
    // dibujar. La declaración explícita es lo que el candado de CI reconoce
    // como migrado (specs/vista-estandar-resumen.md §4).
    resumen: resumenStats({ unit: null, rows: [], notApplicable: RESUMEN_BLOCKS }),
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
          : 'Armado directo desde el Tabulado. El detalle completo está en la solapa «Planilla».',
      });
      if (!sinColumnas) {
        const mapeadas = 3 + Object.values(cols).filter(Boolean).length;
        renderTiles(panel, [
          { label: 'Registros', value: rows.length },
          { label: 'Columnas mapeadas', value: `${mapeadas} / ${colDefs.length}` },
        ]);
      }
    },
    planilla(panel) { renderGsPersReportePlanilla(panel, { rows, cols, colDefs, sinColumnas, results }); },
  });
}

// ── La planilla del Reporte (§5) ─────────────────────────────────────────────
//
// Las columnas y su orden son las del contrato de exportación (el archivo que se
// entrega) y no se tocan. Lo que agrega la vista estándar es la banda y el
// sublabel: de dónde sale cada valor, que es la duda de siempre —si un importe
// es el de una liquidación o el de todas las del mes.
const BANDAS_REPORTE_GS_PERS = {
  fecIni:    { band: 'Identificación',    sub: 'primer día hábil del período' },
  fecFin:    { band: 'Identificación',    sub: 'último día hábil del período' },
  legajo:    { band: 'Identificación',    sub: 'el legajo del Tabulado' },
  nombre:    { band: 'Identificación',    sub: 'de la última liquidación del mes' },
  apellido1: { band: 'Identificación',    sub: 'de la última liquidación del mes' },
  // El código del centro de costo va con las fechas y el nombre queda al final:
  // así lo pide el archivo entregable, y una banda tiene que ser un bloque
  // seguido de columnas — dos bandas separadas con el mismo rótulo se leerían
  // como un error de la pantalla.
  fecPago:   { band: 'Datos del legajo',  sub: 'de la última liquidación del mes' },
  fecAlta:   { band: 'Datos del legajo',  sub: 'de la última liquidación del mes' },
  idCC:      { band: 'Datos del legajo',  sub: 'el código de CC de la última liquidación' },
  gtos:      { band: 'Importes del mes',  sub: 'suma de todas las liquidaciones del mes' },
  dto:       { band: 'Importes del mes',  sub: 'suma de todas las liquidaciones del mes' },
  nCC:       { band: 'Centro de costo',   sub: 'el nombre, de la última liquidación' },
};

function renderGsPersReportePlanilla(container, { rows, cols, colDefs, sinColumnas, results }) {
  if (sinColumnas) {
    container.innerHTML = '';
    return;
  }

  const legajoKey = colDefs.find(c => c.key === 'legajo') ? 'legajo' : colDefs[0].key;
  const nombreKey = cols.hasNombre ? 'nombre' : (cols.hasApellido1 ? 'apellido1' : null);

  const csvHeaders = colDefs.map(c => c.label);
  const csvRows = () => rows.map(r => colDefs.map(c => c.type === 'num' ? fmt(r[c.key]) : (r[c.key] ?? '')));

  renderPlanillaPanel(container, {
    columns: reporteColumns(colDefs, BANDAS_REPORTE_GS_PERS),
    rows,
    unitLabel: 'legajos',
    // Genera el archivo desde el Tabulado, no cruza nada: los cuatro chips de
    // caso salen en gris con su porqué, y la barra queda igual a las otras.
    estadoDe: () => null,
    noAplica: NO_APLICA_REPORTE,
    getLabel: r => nombreKey ? `${r[legajoKey]} — ${r[nombreKey]}` : `${r[legajoKey]}`,
    // stickyCols:0 — la 1ª y la 2ª columna son FECHA_INI/FECHA_FIN (el orden es
    // el del archivo entregable), no Legajo/Nombre.
    stickyCols: 0,
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onExcel: () => exportGsPersReporteToXlsx(results),
      onCsv:   () => downloadCsv(csvHeaders, csvRows(), `GsPers_Reporte_${periodSuffix(results.period)}.csv`),
      onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
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
