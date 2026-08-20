// brutos.js — Controles del Reporte de Brutos
import { diffStats } from './semaforo.js';
import { isDiff } from './tolerance.js';
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
import {
  renderVerdict, renderTiles, renderIssues, renderResumenDetalle,
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
  const rows = results.rows;

  // Evaluado = los DOS lados tenían dato (ctrlXxx !== null) — no confundir con
  // "algún valor real en cualquiera de los dos lados" (eso es lo que hace
  // `brutosHasAnyValue`, más abajo). Si el archivo de Brutos nunca tuvo
  // `salBaseColumn` mapeado, `salBase` es `null` en TODAS las filas: `conDif`
  // sale en 0 igual, y "0 diferencias" se leía como "verificado, todo bien"
  // cuando en realidad no se comparó ni un legajo (Paso 5 de
  // specs/contrato-export.md — D-041).
  const evalSalBase     = rows.filter(r => r.ctrlSalBase     !== null).length;
  const evalACuFutAumen = rows.filter(r => r.ctrlACuFutAumen !== null).length;
  const unitsEvaluated  = rows.filter(r => r.ctrlSalBase !== null || r.ctrlACuFutAumen !== null).length;
  const nadaEvaluado    = s.total > 0 && unitsEvaluated === 0;

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
  const contextNote = nadaEvaluado
    ? 'sin datos para comparar — revisá el mapeo del archivo de Brutos'
    : concepts.length === 0
    ? 'SAL_BASE y A_CTA_FUT_AUMEN verificados'
    : concepts.length === 1 ? `todos en ${concepts[0]}` : concepts.join(' y ');

  return {
    // `nadaEvaluado` fuerza 'error' — mismo mecanismo que ya usa este campo
    // para cortocircuitar el semáforo (CLAUDE.md: "el status crudo... es para
    // cortocircuitar en 'error'"). Un control que verificó CERO legajos de
    // los que tenía no es un resultado limpio, aunque unitsWithDiff sea 0.
    status:   nadaEvaluado ? 'error' : (hasDiff ? 'warning' : 'success'),
    headline: nadaEvaluado
      ? `${s.total} registros · ninguno se pudo comparar`
      : `${s.total} registros · ${s.sinTabData} sin datos en Tabulado`,
    insights: [
      {
        type:  evalSalBase === 0 ? 'warning' : (s.conDifSalario > 0 ? 'warning' : 'success'),
        label: evalSalBase === 0 ? 'SAL_BASE — sin datos para comparar' : 'diferencias SAL_BASE vs Tabulado',
        value: evalSalBase === 0 ? 0 : s.conDifSalario,
      },
      {
        type:  evalACuFutAumen === 0 ? 'warning' : (s.conDifACuFutAumen > 0 ? 'warning' : 'success'),
        label: evalACuFutAumen === 0 ? 'A_CTA_FUT_AUMEN — sin datos para comparar' : 'diferencias A_CTA_FUT_AUMEN vs Tabulado',
        value: evalACuFutAumen === 0 ? 0 : s.conDifACuFutAumen,
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

export function runBrutos(brutosRows, tabRows, mapping) {
  const bm = mapping.brutos;
  const tm = mapping.tab;

  // Columnas del Tabulado para los conceptos. La resolución por código de
  // concepto ('1003' / '1017') vive en la auto-detección del Paso 2 (D-039), que
  // cubre los dos formatos de encabezado — el fallback que había acá buscaba una
  // columna llamada literalmente '1003' y era letra muerta contra un Tabulado
  // real, donde Meta4 la exporta '1003-SUELDO'.
  const salBaseTabCol   = tm.tabSalBaseColumn    || null;
  const aCuFutAuTabCol  = tm.tabACuFutAumenColumn || null;

  // Un legajo puede tener más de una liquidación en el mes (ej: baja después de
  // haber cobrado el mensual), en el Tabulado y también en el reporte. Meta4
  // informa el total sumado, así que se consolidan los DOS lados por legajo
  // (ver ./consolidate.js) — comparar una liquidación suelta contra un total
  // consolidado da una diferencia falsa.
  const keyFn = makeLegajoKey(mapping.legajoKeyMode);
  const tabGroups = groupRowsByLegajo(tabRows, tm.empleadoColumn, { keyFn });
  const tabByLegajo = new Map();
  for (const [id, group] of tabGroups) {
    const last   = lastRow(group);
    const valSal = sumColumn(group, salBaseTabCol);
    const valAcu = sumColumn(group, aCuFutAuTabCol);
    const nombre = tm.apellidoNombreColumn ? norm(last[tm.apellidoNombreColumn]) : '';
    tabByLegajo.set(id, { valSal, valAcu, nombre });
  }

  const rows = [...groupRowsByLegajo(brutosRows, bm.legajoColumn, { keyFn }).entries()].map(([legajo, group]) => {
    const salBase     = sumColumn(group, bm.salBaseColumn);
    const aCuFutAumen = sumColumn(group, bm.aCuFutAumenColumn);
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

  const conDifSalario     = rows.filter(r => isDiff(r.ctrlSalBase)).length;
  const conDifACuFutAumen = rows.filter(r => isDiff(r.ctrlACuFutAumen)).length;
  const sinTabData        = rows.filter(r => r.tabValSal === null && r.tabValAcu === null).length;

  return {
    summary: { total: rows.length, conDifSalario, conDifACuFutAumen, sinTabData },
    rows,
    period: mapping.period || '',
  };
}

// Un legajo es "evaluable" si hay algún valor real de alguno de los dos
// conceptos, en cualquiera de las dos fuentes (Brutos o Tabulado).
//
// Acá NO entra el monto de diferencia del cliente (D-069): esto no pregunta si
// algo difiere, pregunta si el concepto se liquidó. Con el monto en $ 100, un
// sueldo de $ 50 dejaría de existir para el control y el legajo desaparecería
// de la comparación en vez de salir como diferencia.
const VALOR_REAL_EPS = 0.01;
function brutosHasAnyValue(r) {
  return [r.salBase, r.aCuFutAumen, r.tabValSal, r.tabValAcu].some(v => v !== null && Math.abs(v) > VALOR_REAL_EPS);
}
function brutosRowHasDiff(r) {
  return isDiff(r.ctrlSalBase) || isDiff(r.ctrlACuFutAumen);
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
  const noValueCount    = rows.length - relevantRows.length;

  // Evaluado = los DOS lados tenían dato — DISTINTO de `relevantRows`, que
  // sólo pide algún valor real en CUALQUIERA de los dos lados. Si el archivo
  // de Brutos nunca tuvo `salBaseColumn` mapeado pero el Tabulado sí tiene
  // sueldos reales, `relevantRows` sale grande (el Tabulado aporta el valor) y
  // `diffRows` sale en 0 (nunca hay par para comparar) — la pantalla decía
  // "coinciden... sin diferencias" sin haber comparado un solo legajo (Paso 5
  // de specs/contrato-export.md — D-041).
  const evalSalBase     = rows.filter(r => r.ctrlSalBase     !== null).length;
  const evalACuFutAumen = rows.filter(r => r.ctrlACuFutAumen !== null).length;
  const unitsEvaluated  = rows.filter(r => r.ctrlSalBase !== null || r.ctrlACuFutAumen !== null).length;
  const nadaEvaluado    = rows.length > 0 && evalSalBase === 0 && evalACuFutAumen === 0;
  // Con dato real en algún lado, pero sin par para comparar (el otro lado
  // vacío) — el hueco que `relevantRows.length - diffRows.length` tapaba
  // antes contando estos legajos como "sin diferencia".
  const noEvaluatedCount = relevantRows.length - unitsEvaluated;
  // "Sin diferencia" es sobre lo EVALUADO, no sobre "relevantRows" (algún
  // valor real en cualquier lado): antes de este fix, un legajo con dato real
  // sólo del lado Tabulado (el archivo sin mapear) contaba como "sin
  // diferencia" — no se había comparado nada, así que tampoco había "sin
  // diferencia" que reportar.
  const okCount = unitsEvaluated - diffRows.length;

  const sumSalBrutos = relevantRows.reduce((s, r) => s + (r.salBase   ?? 0), 0);
  const sumSalTab    = relevantRows.reduce((s, r) => s + (r.tabValSal ?? 0), 0);
  const diffSal      = sumSalTab - sumSalBrutos;
  const sumAcuBrutos = relevantRows.reduce((s, r) => s + (r.aCuFutAumen ?? 0), 0);
  const sumAcuTab    = relevantRows.reduce((s, r) => s + (r.tabValAcu  ?? 0), 0);
  const diffAcu      = sumAcuTab - sumAcuBrutos;

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'brutos',
    resumen(panel) {
      const tone = nadaEvaluado ? 'error' : (diffRows.length === 0 ? 'ok' : 'warn');
      renderVerdict(panel, {
        tone,
        title: nadaEvaluado
          ? 'No se pudo comparar ningún legajo.'
          : diffRows.length === 0
          ? 'SAL_BASE y A_CTA_FUT_AUMEN coinciden con el Tabulado en todos los legajos.'
          : `${diffRows.length} de ${unitsEvaluated} legajos tienen diferencia en SAL_BASE o A_CTA_FUT_AUMEN.`,
        body: nadaEvaluado
          ? 'El archivo de Brutos no aportó ningún valor en SAL_BASE ni en A_CTA_FUT_AUMEN — revisá el mapeo de columnas de ese archivo.'
          : diffRows.length === 0
          ? `${unitsEvaluated} legajo${unitsEvaluated === 1 ? '' : 's'} verificados contra el Tabulado, sin diferencias.`
          : `Diferencia total de <strong>${fmt(diffSal)}</strong> en SAL_BASE y <strong>${fmt(diffAcu)}</strong> en A_CTA_FUT_AUMEN (Tab − Brutos). El detalle completo está en la solapa «Planilla».`,
      });

      renderTiles(panel, [
        { label: 'Legajos evaluados', value: unitsEvaluated,
          sub: noEvaluatedCount > 0
            ? `${noEvaluatedCount} con dato de un solo lado (sin comparar)`
            : noValueCount > 0 ? `${noValueCount} sin valor real (no se muestran)` : 'del Reporte de Brutos' },
        { label: 'Sin diferencia', value: okCount, tone: 'ok' },
        { label: 'Con diferencia', value: diffRows.length, tone: diffRows.length > 0 ? 'error' : 'ok' },
        evalSalBase === 0
          ? { label: 'SAL_BASE', value: 'sin datos para comparar', tone: 'error' }
          : { label: 'Dif. SAL_BASE', value: fmt(diffSal), tone: isDiff(diffSal) ? 'error' : 'ok' },
        evalACuFutAumen === 0
          ? { label: 'A_CTA_FUT_AUMEN', value: 'sin datos para comparar', tone: 'error' }
          : { label: 'Dif. A_CTA_FUT_AUMEN', value: fmt(diffAcu), tone: isDiff(diffAcu) ? 'error' : 'ok' },
      ]);

      if (diffRows.length > 0) {
        const top = [...diffRows].sort((a, b) => brutosDiffAmount(b) - brutosDiffAmount(a)).slice(0, 5);
        renderIssues(panel, {
          heading: `Casos para revisar · ${top.length} de ${diffRows.length}`,
          items: top.map(r => {
            const bits = [];
            if (isDiff(r.ctrlSalBase)) bits.push(`SAL_BASE ${fmt(r.ctrlSalBase)}`);
            if (isDiff(r.ctrlACuFutAumen)) bits.push(`A_CTA_FUT_AUMEN ${fmt(r.ctrlACuFutAumen)}`);
            const worst = Math.abs(r.ctrlSalBase ?? 0) >= Math.abs(r.ctrlACuFutAumen ?? 0) ? r.ctrlSalBase : r.ctrlACuFutAumen;
            return {
              sev: bits.length > 1 ? 'hi' : 'lo',
              // Sin `esc()`: `renderIssues` ya escapa `who` (se veía "SANGUINETTI &amp;amp; FALCIONI").
              who: r.nombre || `Legajo ${r.legajo}`,
              sub: `Legajo ${r.legajo}`,
              what: bits.join(' · '),
              why: 'Diferencia Tab − Brutos.',
              right: `<span class="${mvClass(worst)}">${mvArrow(worst)} ${fmtSigned(worst)}</span>`,
            };
          }),
        });
      }
    },
    planilla(panel) { renderBrutosPlanilla(panel, { relevantRows, results }); },
  });
}

// ── La planilla (§5 de specs/vista-estandar-resultados.md) ───────────────────
//
// Dos bandas, una por concepto, y adentro de cada una las tres columnas de
// siempre: lo que informa el Reporte de Brutos, lo que dice el Tabulado y la
// resta. El tinte de las bandas lo pone la pieza compartida — hasta acá este
// módulo lo escribía a mano en celeste y lila, y el lila no es de la marca.
const COLS_BRUTOS = [
  { key: 'legajo', label: 'Legajo',            band: 'Identificación' },
  { key: 'nombre', label: 'Apellido y Nombre', band: 'Identificación' },

  { key: 'salBase',     label: 'Brutos', sub: 'lo que informa el reporte',        band: 'Salario Base', num: true },
  { key: 'tabValSal',   label: 'Tab',    sub: 'la columna de sueldo del Tabulado', band: 'Salario Base', num: true },
  { key: 'ctrlSalBase', label: 'CTRL',   sub: 'Tab − Brutos',                      band: 'Salario Base', diff: true, close: true,
    absentLabel: 'sin comparar',
    total: (rows) => sumaDe(rows, 'tabValSal') - sumaDe(rows, 'salBase') },

  { key: 'aCuFutAumen',     label: 'Brutos', sub: 'lo que informa el reporte',              band: 'A Cta Fut Aumen', num: true },
  { key: 'tabValAcu',       label: 'Tab',    sub: 'la columna A_CTA_FUT_AUMEN del Tabulado', band: 'A Cta Fut Aumen', num: true },
  { key: 'ctrlACuFutAumen', label: 'CTRL',   sub: 'Tab − Brutos',                            band: 'A Cta Fut Aumen', diff: true, close: true,
    absentLabel: 'sin comparar',
    total: (rows) => sumaDe(rows, 'tabValAcu') - sumaDe(rows, 'aCuFutAumen') },
];

/**
 * El TOTAL de una columna CTRL es la **resta de los totales** (Σ Tab − Σ Brutos)
 * y no la suma de la columna: son números distintos en cuanto un legajo no se
 * pudo comparar —el que está en el reporte y no en el Tabulado suma de un lado
 * y de ninguno del otro— y el de la resta es el que muestra la tile
 * "Dif. SAL_BASE" del Resumen. Si acá saliera la suma de la columna, la misma
 * pantalla diría dos cosas distintas.
 */
function sumaDe(rows, key) {
  return rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
}

function renderBrutosPlanilla(container, { relevantRows, results }) {
  // Exportar siempre incluye todos los legajos evaluados, sin importar el filtro de pantalla.
  const csvHeaders = ['Legajo', 'Nombre', 'SAL_BASE', 'CTRL SALARIO BASE', 'A_CTA_FUT_AUMEN', 'CTRL A_CTA_FUT_AUMEN', 'SAL_BASE (Tab)', 'A_CTA_FUT (Tab)'];
  const csvRows = () => relevantRows.map(r => [r.legajo, r.nombre, fmt(r.salBase), fmt(r.ctrlSalBase), fmt(r.aCuFutAumen), fmt(r.ctrlACuFutAumen), fmt(r.tabValSal), fmt(r.tabValAcu)]);

  renderPlanillaPanel(container, {
    columns: COLS_BRUTOS,
    rows: relevantRows,
    unitLabel: 'legajos',
    estadoDe: r => estadoDeFila([r.ctrlSalBase, r.ctrlACuFutAumen]),
    getLabel: r => `${r.legajo} — ${r.nombre}`,
    empty: 'Ningún legajo tiene valor real en SAL_BASE o A_CTA_FUT_AUMEN.',
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onExcel: () => exportBrutosToXlsx({ ...results, rows: relevantRows }),
      onCsv:   () => downloadCsv(csvHeaders, csvRows(), `Brutos_Control_${periodSuffix(results.period)}.csv`),
      onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
  });
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
  const tabGroups = groupRowsByLegajo(tabRows, tm.empleadoColumn, {
    keyFn: makeLegajoKey(mapping.legajoKeyMode),
  });
  const rows = [...tabGroups.entries()].map(([legajo, group]) => {
    const last = lastRow(group);
    return {
      fecIni:      fecIniStr,
      fecFin:      fecFinStr,
      legajo,
      nombre:      nombreCol    ? norm(last[nombreCol])                      : null,
      apellido1:   apellido1Col ? norm(last[apellido1Col])                  : null,
      fecAlta:     tm.tabFecAltaColumn ? fmtDate(last[tm.tabFecAltaColumn]) : null,
      fecBaja:     tm.tabFecBajaColumn ? fmtDate(last[tm.tabFecBajaColumn]) : null,
      fecPago:     tm.tabFecPagoColumn ? fmtDate(last[tm.tabFecPagoColumn]) : null,
      salBase:     sumColumn(group, tm.tabSalBaseColumn),
      aCuFutAumen: sumColumn(group, tm.tabACuFutAumenColumn),
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

const BRUTOS_REPORTE_CONTRACT = EXPORT_CONTRACTS.brutos_reporte;
const BRUTOS_CONTROLAR_CONTRACT = EXPORT_CONTRACTS.brutos;

export function renderBrutosReporteResults(results, container) {
  const { rows, cols } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  // Columnas: SIEMPRE las 11 del contrato, en su orden — layout:'fijo'
  // (D-041). Antes esta lista se armaba con `cols.has*` y la columna
  // DESAPARECÍA si la clave de origen no estaba mapeada (Paso 4a de
  // specs/contrato-export.md); ahora sale igual para pantalla, CSV y xlsx
  // porque las tres leen `BRUTOS_REPORTE_CONTRACT.columns` — un solo lugar.
  const colDefs = contractColDefs(BRUTOS_REPORTE_CONTRACT);

  // "Sin columnas configuradas" ya no se puede leer del largo de `colDefs`
  // (ahora siempre son 11): es que ninguna de las columnas opcionales del
  // Tabulado esté mapeada — el reporte sale igual, pero vacío salvo
  // FECHA_INI/FECHA_FIN/ID_EMPLEADO.
  const sinColumnas = !Object.values(cols).some(Boolean);

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'brutos_reporte',
    resumen(panel) {
      renderVerdict(panel, {
        tone: sinColumnas ? 'warn' : 'info',
        title: sinColumnas
          ? 'No hay columnas configuradas en el Tabulado para el Reporte de Brutos.'
          : `Reporte de Brutos generado — ${rows.length} registro${rows.length === 1 ? '' : 's'}.`,
        body: sinColumnas
          ? 'Volvé a cargar el Tabulado y completá los campos de la sección "Brutos".'
          : 'Armado directo desde el Tabulado. El detalle completo está en la solapa «Planilla».',
      });
      if (!sinColumnas) {
        const mapeadas = 3 + Object.values(cols).filter(Boolean).length; // 3 fijas + opcionales
        renderTiles(panel, [
          { label: 'Registros', value: rows.length },
          { label: 'Columnas mapeadas', value: `${mapeadas} / ${colDefs.length}` },
        ]);
      }
    },
    planilla(panel) { renderBrutosReportePlanilla(panel, { rows, cols, colDefs, sinColumnas, results }); },
  });
}

// ── La planilla del Reporte (§5) ─────────────────────────────────────────────
//
// Las columnas y su orden son las del contrato de exportación —o sea, las del
// archivo que se entrega— y no se tocan. Lo que agrega la vista estándar es la
// BANDA (qué es cada bloque de columnas) y el SUBLABEL: de dónde sale cada
// valor. Es lo que contesta, sin preguntar, la duda de siempre: si un importe
// del reporte es el de una liquidación o el de todas las del mes.
const BANDAS_REPORTE_BRUTOS = {
  fecIni:      { band: 'Identificación',    sub: 'primer día hábil del período' },
  fecFin:      { band: 'Identificación',    sub: 'último día hábil del período' },
  legajo:      { band: 'Identificación',    sub: 'el legajo del Tabulado' },
  nombre:      { band: 'Identificación',    sub: 'de la última liquidación del mes' },
  apellido1:   { band: 'Identificación',    sub: 'de la última liquidación del mes' },
  fecAlta:     { band: 'Fechas del legajo', sub: 'de la última liquidación del mes' },
  fecBaja:     { band: 'Fechas del legajo', sub: 'de la última liquidación del mes' },
  fecPago:     { band: 'Fechas del legajo', sub: 'de la última liquidación del mes' },
  salBase:     { band: 'Importes del mes',  sub: 'suma de todas las liquidaciones del mes' },
  aCuFutAumen: { band: 'Importes del mes',  sub: 'suma de todas las liquidaciones del mes' },
  puesto:      { band: 'Puesto',            sub: 'de la última liquidación del mes' },
};

function renderBrutosReportePlanilla(container, { rows, cols, colDefs, sinColumnas, results }) {
  if (sinColumnas) {
    container.innerHTML = '';
    return;
  }

  const legajoKey = colDefs.find(c => c.key === 'legajo') ? 'legajo' : colDefs[0].key;
  const nombreKey = cols.hasNombre ? 'nombre' : (cols.hasApellido1 ? 'apellido1' : null);

  const csvHeaders = colDefs.map(c => c.label);
  const csvRows = () => rows.map(r => colDefs.map(c => c.type === 'num' ? fmt(r[c.key]) : (r[c.key] ?? '')));

  renderPlanillaPanel(container, {
    columns: reporteColumns(colDefs, BANDAS_REPORTE_BRUTOS),
    rows,
    unitLabel: 'legajos',
    // Este control no cruza nada: genera el archivo desde el Tabulado. Los cinco
    // chips salen igual —los cuatro de caso en gris y con su porqué— para que la
    // barra sea la misma que en las otras veinte pantallas.
    estadoDe: () => null,
    noAplica: NO_APLICA_REPORTE,
    getLabel: r => nombreKey ? `${r[legajoKey]} — ${r[nombreKey]}` : `${r[legajoKey]}`,
    // stickyCols:0 — la 1ª y la 2ª columna son FECHA_INI/FECHA_FIN (el orden es
    // el del archivo entregable), no Legajo/Nombre: anclarlas no ayudaría a nadie.
    stickyCols: 0,
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onExcel: () => exportBrutosReporteToXlsx(results),
      onCsv:   () => downloadCsv(csvHeaders, csvRows(), `Brutos_Reporte_${periodSuffix(results.period)}.csv`),
      onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
  });
}

// ── Exports a Excel ───────────────────────────────────────────────────────────

async function exportBrutosToXlsx(results) {
  await loadExcelJS();
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();
  writeGroupedContractSheet(wb, BRUTOS_CONTROLAR_CONTRACT, results.rows);
  await downloadWorkbook(wb, `Brutos_Control_${periodSuffix(results.period)}.xlsx`);
}

async function exportBrutosReporteToXlsx(results) {
  await loadExcelJS();

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  // Única fuente de las 11 columnas — layout:'fijo' (Paso 4a): salen siempre
  // las mismas, en el mismo orden que la tabla de pantalla y el CSV.
  writeContractSheet(wb, BRUTOS_REPORTE_CONTRACT, results.rows);

  await downloadWorkbook(wb, `Brutos_Reporte_${periodSuffix(results.period)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Limpieza de texto (nombre, puesto). La clave de legajo NO sale de acá: sale
// de `makeLegajoKey(mapping.legajoKeyMode)` (D-038).
function norm(v) { return v != null ? String(v).trim() : ''; }

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
