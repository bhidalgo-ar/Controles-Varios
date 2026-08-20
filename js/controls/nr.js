// nr.js — Control No Remunerativos (Control NR)
import { diffStats } from './semaforo.js';
import { isDiff } from './tolerance.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { estadoDeFila } from '../ui/tableTools.js';
import { renderPlanillaPanel, NO_APLICA_REPORTE } from '../ui/planillaPanel.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum, toNum } from '../utils/currency.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { groupRowsByLegajo, sumColumn, lastRow } from './consolidate.js';
import { writeGroupedContractSheet } from '../exports/contractSheet.js';
import { periodSuffix } from '../utils/dates.js';
import {
  renderVerdict, renderTiles, renderIssues, renderResumenDetalle,
  mvClass, mvArrow, fmtSigned,
} from '../ui/resultBlocks.js';
//
// Modo 1 — "Controlar": cruza los 18 conceptos NR del Reporte de M4
//   contra las columnas configuradas en el Tabulado.
//
// Modo 2 — "Generar Reporte": genera el Reporte de NR directamente desde
//   el Tabulado. Layout: A(vacía) | B=ID_EMPLEADO | C=NOMBRE | D=APELLIDO_1
//   | E=FECHA_ALTA | F=FECHA_BAJA | G=FEC_PAGO | H=ID_CENTRO_TRAB
//   | I=ID_CATEGORIA | J-AA = 18 conceptos en orden.

// ── Definición de conceptos NR ────────────────────────────────────────────────
// Orden = orden de columnas en el XLSX de salida.
// tabKey = clave en tabExtraConfig | nrKey = clave en mapping del archivo NR
// group: 'indem' = Indemnizatorios (verde) | 'otros' = Otros NR (naranja)

// Exportado para que js/exports/contracts.js derive la lista de columnas del
// Reporte NR de ACÁ, en vez de mantener una segunda copia de los 18 conceptos.
export const NR_CONCEPTS = [
  { key: 'reinHomeOfice',  label: 'REIN_HOME_OFICE',  tabKey: 'tabReinHomeOficeColumn',  nrKey: 'reinHomeOficeColumn',  group: 'otros' },
  { key: 'indemPreaviso',  label: 'INDEM_PREAVISO',   tabKey: 'tabIndemPreavisoColumn',  nrKey: 'indemPreavisoColumn',  group: 'indem' },
  { key: 'sacPreaviso',    label: 'SAC_PREAVISO',     tabKey: 'tabSacPreavisoColumn',    nrKey: 'sacPreavisoColumn',    group: 'indem' },
  { key: 'indemAntDesp',   label: 'INDEM_ANT_DESP',   tabKey: 'tabIndemAntDespColumn',   nrKey: 'indemAntDespColumn',   group: 'indem' },
  { key: 'indemAntFalle',  label: 'INDEM_ANT_FALLE',  tabKey: 'tabIndemAntFalleColumn',  nrKey: 'indemAntFalleColumn',  group: 'indem' },
  { key: 'indemInteg',     label: 'INDEM_INTEG',      tabKey: 'tabIndemIntegColumn',     nrKey: 'indemIntegColumn',     group: 'indem' },
  { key: 'sacIndemInteg',  label: 'SAC_INDEM_INTEG',  tabKey: 'tabSacIndemIntegColumn',  nrKey: 'sacIndemIntegColumn',  group: 'indem' },
  { key: 'indmMaternidad', label: 'INDM_MATERNIDAD',  tabKey: 'tabIndmMaternidadColumn', nrKey: 'indmMaternidadColumn', group: 'indem' },
  { key: 'vacNoGozadas',   label: 'VAC_NO_GOZADAS',   tabKey: 'tabVacNoGozadasColumn',   nrKey: 'vacNoGozadasColumn',   group: 'indem' },
  { key: 'vacNoGozSac',    label: 'VAC_NO_GOZ_SAC',   tabKey: 'tabVacNoGozSacColumn',    nrKey: 'vacNoGozSacColumn',    group: 'indem' },
  { key: 'gratVac',        label: 'GRAT_VAC',         tabKey: 'tabGratVacColumn',        nrKey: 'gratVacColumn',        group: 'indem' },
  { key: 'graVacnogSac',   label: 'GRA_VACNOG_SAC',   tabKey: 'tabGraVacnogSacColumn',   nrKey: 'graVacnogSacColumn',   group: 'indem' },
  { key: 'indemFuerMay',   label: 'INDEM_FUER_MAY',   tabKey: 'tabIndemFuerMayColumn',   nrKey: 'indemFuerMayColumn',   group: 'indem' },
  { key: 'indemEmbarazo',  label: 'INDEM_EMBARAZO',   tabKey: 'tabIndemEmbarazoColumn',  nrKey: 'indemEmbarazoColumn',  group: 'indem' },
  { key: 'gratExtraord',   label: 'GRAT_EXTRAORD',    tabKey: 'tabGratExtraordColumn',   nrKey: 'gratExtraordColumn',   group: 'otros' },
  { key: 'asigPas',        label: 'ASIG_PAS',         tabKey: 'tabAsigPasColumn',        nrKey: 'asigPasColumn',        group: 'otros' },
  { key: 'reintGuard',     label: 'REINT_GUARD',      tabKey: 'tabReintGuardColumn',     nrKey: 'reintGuardColumn',     group: 'otros' },
  { key: 'incrementoSt',   label: 'INCREMENTO_ST',    tabKey: 'tabIncrementoStColumn',   nrKey: 'incrementoStColumn',   group: 'otros' },
];

// NOTA: contracts.js importa `NR_CONCEPTS` de ESTE archivo — un `import`
// estático de `contracts.js` acá arriba arma un ciclo de módulos donde,
// según qué archivo cargue primero, `contracts.js` puede intentar leer
// `NR_CONCEPTS` antes de que este módulo termine de definirlo (confirmado:
// rompía en el navegador aunque los tests de Node, con otro orden de carga,
// no lo agarraban). Las dos funciones de export de acá abajo importan
// `contracts.js` con `import()` dinámico en vez de un `import` estático — para
// cuando esa promesa resuelve (el analista ya clickeó "Exportar"), toda la
// app terminó de cargar y el ciclo ya no es un problema.

// ── Modo 1: Controlar ─────────────────────────────────────────────────────────

export function summarizeNr(results) {
  const s = results.summary;

  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    results.rows,
    NR_CONCEPTS.map(c => ({ key: c.key, get: row => row.valores[c.key]?.ctrl ?? null, label: c.label })),
    (row, field) => `${field.label} — leg. ${row.legajo}`
  );

  // Concepto NR más afectado (el que aparece en más legajos con diferencia) —
  // más útil acá que "el peor caso individual" porque hay 18 conceptos posibles.
  const conceptCounts = NR_CONCEPTS
    .map(c => ({ label: c.label, count: results.rows.filter(r => isDif(r.valores[c.key].ctrl)).length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const contextNote = conceptCounts.length
    ? `concepto más afectado: ${conceptCounts[0].label}${conceptCounts.length > 1 ? ` (+${conceptCounts.length - 1} más)` : ''}`
    : '18 conceptos NR verificados';

  return {
    status:   s.conDif > 0 ? 'warning' : 'success',
    headline: `${s.total} registros · ${s.sinTabData} sin datos en Tabulado`,
    insights: [
      {
        type:  s.conDif > 0 ? 'warning' : 'success',
        label: 'empleados con al menos una diferencia NR',
        value: s.conDif,
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

export function runNr(nrRows, tabRows, mapping) {
  const nm = mapping.nr;
  const tm = mapping.tab;

  // Un legajo puede tener varias liquidaciones (pagas) en el mismo mes, tanto
  // en el Tabulado como en el Reporte de NR (ej: mensual + baja). Verificado
  // contra archivos reales de 04-2026: un legajo con 9 pagas trae 9 filas en
  // los DOS archivos. Meta4 informa el total sumado, así que se consolidan
  // ambos lados por legajo antes de comparar (ver ./consolidate.js).
  const keyFn = makeLegajoKey(mapping.legajoKeyMode);

  // Índice del Tabulado: legajo → { [conceptKey]: total sumado entre pagas }
  const tabByLegajo = new Map();
  for (const [id, group] of groupRowsByLegajo(tabRows, tm.empleadoColumn, { keyFn })) {
    const vals = {};
    for (const c of NR_CONCEPTS) {
      vals[c.key] = sumColumn(group, tm[c.tabKey]);
    }
    tabByLegajo.set(id, vals);
  }

  // Reporte de NR: una fila por legajo, sumando sus liquidaciones.
  const rows = [...groupRowsByLegajo(nrRows, nm.legajoColumn, { keyFn }).entries()].map(([legajo, group]) => {
    const tabVals = tabByLegajo.get(legajo) ?? null;

    const valores = {};
    for (const c of NR_CONCEPTS) {
      const nrVal  = sumColumn(group, nm[c.nrKey]);
      const tabVal = tabVals ? tabVals[c.key] : null;
      const ctrl   = (tabVal !== null && nrVal !== null) ? tabVal - nrVal : null;
      valores[c.key] = { nrVal, tabVal, ctrl };
    }

    return { legajo, valores, sinTabData: !tabVals };
  });

  const conDif     = rows.filter(r =>
    Object.values(r.valores).some(v => isDiff(v.ctrl))
  ).length;
  const sinTabData = rows.filter(r => r.sinTabData).length;

  return {
    summary: { total: rows.length, conDif, sinTabData },
    rows,
    period: mapping.period || '',
  };
}

// "Tiene valor real" es otra pregunta que "difiere", así que el monto de
// diferencia del cliente no entra acá (D-069): con el monto en $ 100 una
// indemnización de $ 50 dejaría de existir para el control en vez de salir
// como diferencia.
const VALOR_REAL_EPS = 0.01;
const tieneValor = v => v !== null && Math.abs(v) > VALOR_REAL_EPS;

/** ¿Este concepto tiene algún valor real en alguna de las dos fuentes? */
function hasValor(v) {
  return tieneValor(v.nrVal) || tieneValor(v.tabVal);
}

// Un empleado es "relevante" si tiene algún valor NR (Tab o reporte) distinto de cero.
// Filtra el ruido de legajos que no cobran ningún concepto no remunerativo.
function hasAnyNrValue(r) {
  return Object.values(r.valores).some(hasValor);
}

// Qué cuenta como diferencia: el monto que el cliente puso en "Umbrales" (D-069).
const isDif = v => isDiff(v);

// La banda de cada concepto: los 18 se leen como dos bloques, indemnizatorios y
// el resto. El tinte lo pone la pieza compartida (antes lo escribía este módulo
// en verde y naranja, con su propio rgba).
const BANDA = { indem: 'Indemnizatorios', otros: 'Otros NR' };

export function renderNrResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const rowDiffConcepts = r => NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl));
  const rowHasDiff = r => rowDiffConcepts(r).length > 0;
  const rowDiffAmount = r => rowDiffConcepts(r).reduce((s, c) => s + Math.abs(r.valores[c.key].ctrl), 0);

  // Empleados con algún valor NR (los "evaluables"); dentro de ellos, los que tienen diferencia.
  const relevantRows = rows.filter(hasAnyNrValue);
  const diffRows     = relevantRows.filter(rowHasDiff);
  const okCount      = relevantRows.length - diffRows.length;
  const noNrCount    = rows.length - relevantRows.length;
  const totalDiffAmount = diffRows.reduce((s, r) => s + rowDiffAmount(r), 0);

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'nr',
    resumen(panel) {
      const tone = diffRows.length === 0 ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: diffRows.length === 0
          ? 'Todos los empleados con valores NR coinciden con el Tabulado.'
          : `${diffRows.length} de ${relevantRows.length} empleados con NR tienen alguna diferencia.`,
        body: diffRows.length === 0
          ? `${relevantRows.length} empleado${relevantRows.length === 1 ? '' : 's'} con valores no remunerativos, verificados contra el Tabulado sin diferencias.`
          : `Diferencia total de <strong>${fmtNum(totalDiffAmount)}</strong> entre los 18 conceptos no remunerativos. El detalle completo está en la solapa «Planilla».`,
      });

      renderTiles(panel, [
        { label: 'Empleados con NR', value: relevantRows.length,
          sub: noNrCount > 0 ? `${noNrCount} sin valores NR (no se muestran)` : 'del total del Tabulado' },
        { label: 'Sin diferencia', value: okCount, tone: 'ok' },
        { label: 'Con diferencia', value: diffRows.length, tone: diffRows.length > 0 ? 'error' : 'ok' },
        { label: 'Diferencia total', value: fmtNum(totalDiffAmount), tone: diffRows.length > 0 ? 'error' : 'ok' },
      ]);

      if (diffRows.length > 0) {
        const top = [...diffRows].sort((a, b) => rowDiffAmount(b) - rowDiffAmount(a)).slice(0, 5);
        renderIssues(panel, {
          heading: `Casos para revisar · ${top.length} de ${diffRows.length}`,
          items: top.map(r => {
            const concepts = rowDiffConcepts(r).sort((a, b) => Math.abs(r.valores[b.key].ctrl) - Math.abs(r.valores[a.key].ctrl));
            const worst = concepts[0];
            const worstVal = r.valores[worst.key].ctrl;
            const rest = concepts.length - 1;
            return {
              sev: concepts.length > 1 ? 'hi' : 'lo',
              who: `Legajo ${r.legajo}`,
              what: `${worst.label}: diferencia de ${fmtNum(Math.abs(worstVal))}`,
              why: rest > 0 ? `y ${rest} concepto${rest === 1 ? '' : 's'} más con diferencia (Tab − NR).` : 'Tab − NR.',
              right: `<span class="${mvClass(worstVal)}">${mvArrow(worstVal)} ${fmtSigned(worstVal)}</span>`,
            };
          }),
        });
      }
    },
    planilla(panel) { renderNrPlanilla(panel, { relevantRows, diffRows, results }); },
  });
}

// ── La planilla (§5 de specs/vista-estandar-resultados.md) ───────────────────
//
// Una columna por concepto NR con la diferencia Tab − NR, agrupadas en dos
// bandas (indemnizatorios y el resto) y con el TOTAL de cada una abajo. Los
// conceptos que no se liquidaron en el período no salen como una columna de
// ceros: se ocultan y se dice cuántos al pie (D-036).
//
// **Los 18 conceptos son el segundo eje y van en `Marcas ▾`, no en la fila de
// chips**: 18 chips no son un filtro, son una pared (§3). La fila de chips dice
// siempre lo mismo en las 21 pantallas y por eso son sólo los cinco estados.

/** Los conceptos que tienen algún valor real en la corrida — las columnas que se muestran. */
function conceptosConValor(rows) {
  return NR_CONCEPTS.filter(c => rows.some(r => hasValor(r.valores[c.key])));
}

/**
 * En qué estado cerró un legajo. Se miran SÓLO los conceptos que ese legajo
 * liquidó: los otros 15 vienen en `null` porque no se liquidaron, y contarlos
 * dejaría a todos los legajos en "Sin comparar" — que es distinto de "el
 * concepto está de un solo lado", que sí es un sin comparar de verdad.
 */
function estadoDeLegajoNr(r, conceptos) {
  const suyos = conceptos.filter(c => hasValor(r.valores[c.key]));
  return estadoDeFila(suyos.map(c => r.valores[c.key].ctrl));
}

/** Cuántos conceptos de este legajo tienen diferencia. */
function difsDeLegajo(r) {
  return NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length;
}

/**
 * La planilla lee filas planas y `runNr` guarda cada concepto anidado en
 * `valores[key].ctrl`, así que se aplana acá —una vez, como ya hace el export— y
 * la fila se queda con una referencia a la original para lo que no es un importe.
 */
function filasDePlanilla(rows, conceptos) {
  return rows.map(r => {
    const fila = { legajo: r.legajo, difs: difsDeLegajo(r), _row: r };
    for (const c of conceptos) fila[c.key] = r.valores[c.key].ctrl;
    return fila;
  });
}

function renderNrPlanilla(container, { relevantRows, diffRows, results }) {
  const conceptos = conceptosConValor(relevantRows);
  const ocultos = NR_CONCEPTS.length - conceptos.length;
  const filas = filasDePlanilla(relevantRows, conceptos);

  const columns = [
    { key: 'legajo', label: 'Legajo', band: 'Identificación' },
    { key: 'difs', label: '# Difs', sub: 'conceptos con diferencia', band: 'Identificación',
      cell: (f) => `<strong style="color:var(${f.difs > 0 ? '--color-danger' : '--color-success'});">${f.difs}</strong>`,
      total: false },
    ...conceptos.map(c => ({
      key: c.key, label: c.label, sub: 'Tab − NR', band: BANDA[c.group],
      diff: true, absentLabel: 'sin comparar',
    })),
  ];

  // Exportar sigue trayendo los 18 conceptos y todos los legajos evaluados: el
  // filtro de pantalla recorta lo que se ve, no lo que se archiva.
  const csvHeaders = ['Legajo', '# Difs', ...NR_CONCEPTS.map(c => c.label)];
  const csvRows = () => relevantRows.map(r => [
    r.legajo, difsDeLegajo(r), ...NR_CONCEPTS.map(c => fmtNum(r.valores[c.key].ctrl)),
  ]);

  renderPlanillaPanel(container, {
    columns,
    rows: filas,
    unitLabel: 'legajos',
    estadoDe: (f) => estadoDeLegajoNr(f._row, conceptos),
    marcas: conceptos.map(c => ({
      value: c.key, label: c.label, match: (f) => hasValor(f._row.valores[c.key]),
    })),
    getLabel: (f) => `${f.legajo}`,
    searchLabel: 'Buscar legajo',
    stickyCols: 2,
    empty: 'Ningún empleado tiene valor real en los 18 conceptos NR.',
    beforeTable: (host) => {
      // Con cero diferencias igual se muestra la tabla de evaluados: es el
      // respaldo de que el control se corrió y cerró — y es lo que el analista
      // archiva. Antes acá se salía con el cartel de OK y sin tabla, y eso se
      // llevaba puesto el exportable.
      if (diffRows.length > 0) return;
      const ok = document.createElement('div');
      ok.className = 'alert alert--success';
      ok.style.cssText = 'margin:var(--sp-3);padding:var(--sp-3) var(--sp-4);';
      ok.textContent = 'Todos los empleados con valores NR coinciden con el Tabulado. '
        + 'No hay diferencias para revisar.';
      host.appendChild(ok);
    },
    afterTable: (host) => {
      const pie = document.createElement('p');
      pie.className = 'text-muted';
      pie.style.cssText = 'font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);';
      pie.textContent = 'Cada columna es la diferencia Tab − NR de ese concepto.'
        + (ocultos > 0 ? ` Se ocultan ${ocultos} concepto${ocultos === 1 ? '' : 's'} sin valores en el período.` : '')
        + ' Exportá el .xlsx para ver los valores originales de cada fuente.';
      host.appendChild(pie);
    },
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onExcel: () => exportNrToXlsx({ ...results, rows: relevantRows }),
      onCsv:   () => downloadCsv(csvHeaders, csvRows(), `NR_Control_${periodSuffix(results.period)}.csv`),
      onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
  });
}

// ── Modo 2: Generar Reporte ───────────────────────────────────────────────────

export function runNrReporte(_primaryRows, tabRows, mapping) {
  const tm = mapping.tab;

  const nombreCol    = tm.tabNombreColumn    || null;
  const apellido1Col = tm.tabApellido1Column || null;

  // Consolidar por legajo: los importes de cada concepto se suman entre todas
  // las liquidaciones del mes; los datos de referencia (nombre, fechas) se
  // toman de la última liquidación (igual que runBrutosReporte).
  const keyFn = makeLegajoKey(mapping.legajoKeyMode);
  const rows = [...groupRowsByLegajo(tabRows, tm.empleadoColumn, { keyFn }).entries()].map(([legajo, group]) => {
    const last = lastRow(group);
    const base = {
      legajo,
      nombre:       nombreCol    ? norm(last[nombreCol])    : null,
      apellido1:    apellido1Col ? norm(last[apellido1Col]) : null,
      fecAlta:      tm.tabFecAltaColumn     ? fmtDate(last[tm.tabFecAltaColumn])     : null,
      fecBaja:      tm.tabFecBajaColumn     ? fmtDate(last[tm.tabFecBajaColumn])     : null,
      fecPago:      tm.tabFecPagoColumn     ? fmtDate(last[tm.tabFecPagoColumn])     : null,
      idCentroTrab: tm.tabIdCentroTrabColumn ? norm(last[tm.tabIdCentroTrabColumn]) : null,
      idCategoria:  tm.tabIdCategoriaColumn  ? norm(last[tm.tabIdCategoriaColumn])  : null,
    };
    for (const c of NR_CONCEPTS) {
      base[c.key] = sumColumn(group, tm[c.tabKey]);
    }
    return base;
  });

  return {
    summary: { total: rows.length },
    rows,
    period: mapping.period || '',
  };
}

export function summarizeNrReporte(results) {
  return {
    status:   'info',
    headline: `${results.summary.total} registros — Reporte de NR generado del Tabulado`,
    insights: [],
    unit:            null,
    unitsTotal:      null,
    unitsWithDiff:   null,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote:     null,
  };
}

// En "Generar Reporte" cada fila trae los conceptos como r[c.key] (número o null).
function reporteRowHasValue(r) {
  return NR_CONCEPTS.some(c => tieneValor(r[c.key]));
}

export function renderNrReporteResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  // Sólo empleados con algún valor NR distinto de cero.
  const relevantRows = rows.filter(reporteRowHasValue);
  const noNrCount    = rows.length - relevantRows.length;
  const conceptsWithValue = NR_CONCEPTS.filter(c =>
    relevantRows.some(r => tieneValor(r[c.key]))
  );

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'nr_reporte',
    resumen(panel) {
      renderVerdict(panel, {
        tone: relevantRows.length > 0 ? 'info' : 'warn',
        title: relevantRows.length > 0
          ? `Reporte de NR generado — ${relevantRows.length} empleado${relevantRows.length === 1 ? '' : 's'} con valores.`
          : 'Ningún empleado tiene valores NR distintos de cero en este período.',
        body: relevantRows.length > 0
          ? `Armado directo desde el Tabulado, con ${conceptsWithValue.length} de los 18 conceptos no remunerativos con algún valor. El detalle completo está en la solapa «Planilla».`
          : null,
      });
      renderTiles(panel, [
        { label: 'Empleados con NR', value: relevantRows.length },
        { label: 'Sin valores NR', value: noNrCount, sub: 'no entran al reporte' },
        { label: 'Conceptos con valor', value: `${conceptsWithValue.length} / 18` },
      ]);
    },
    planilla(panel) { renderNrReportePlanilla(panel, { relevantRows, conceptsWithValue, results }); },
  });
}

// ── La planilla del Reporte (§5) ─────────────────────────────────────────────
//
// Las columnas y su orden son las del archivo que se entrega. Lo que agrega la
// vista estándar es la banda y el sublabel: de dónde sale cada valor. Los 18
// conceptos siguen siendo un desplegable —ahora "Marcas ▾"— y no chips.
const BANDAS_REPORTE_NR = {
  legajo:       { band: 'Identificación',    sub: 'el legajo del Tabulado' },
  nombre:       { band: 'Identificación',    sub: 'de la última liquidación del mes' },
  apellido1:    { band: 'Identificación',    sub: 'de la última liquidación del mes' },
  fecAlta:      { band: 'Fechas del legajo', sub: 'de la última liquidación del mes' },
  fecBaja:      { band: 'Fechas del legajo', sub: 'de la última liquidación del mes' },
  fecPago:      { band: 'Fechas del legajo', sub: 'de la última liquidación del mes' },
  idCentroTrab: { band: 'Centro y categoría', sub: 'de la última liquidación del mes' },
  idCategoria:  { band: 'Centro y categoría', sub: 'de la última liquidación del mes' },
};

/** Las ocho columnas fijas del layout del Reporte NR, antes de los conceptos. */
const COLS_FIJAS_REPORTE_NR = [
  { key: 'legajo',       label: 'ID_EMPLEADO' },
  { key: 'nombre',       label: 'NOMBRE' },
  { key: 'apellido1',    label: 'APELLIDO_1' },
  { key: 'fecAlta',      label: 'FECHA_ALTA' },
  { key: 'fecBaja',      label: 'FECHA_BAJA' },
  { key: 'fecPago',      label: 'FEC_PAGO' },
  { key: 'idCentroTrab', label: 'ID_CENTRO_TRAB' },
  { key: 'idCategoria',  label: 'ID_CATEGORIA' },
];

function renderNrReportePlanilla(container, { relevantRows, conceptsWithValue, results }) {
  const ocultos = NR_CONCEPTS.length - conceptsWithValue.length;

  const columns = [
    ...COLS_FIJAS_REPORTE_NR.map(c => ({
      key: c.key, label: c.label,
      band: BANDAS_REPORTE_NR[c.key].band, sub: BANDAS_REPORTE_NR[c.key].sub,
    })),
    ...conceptsWithValue.map(c => ({
      key: c.key, label: c.label, band: BANDA[c.group], num: true,
      sub: 'suma de todas las liquidaciones del mes',
    })),
  ];

  // Exportar siempre incluye TODOS los empleados con valores NR y las 18
  // columnas de conceptos completas (igual que exportNrReporteToXlsx) — el
  // filtro de pantalla sólo recorta lo que se ve.
  const csvHeaders = ['ID_EMPLEADO', 'NOMBRE', 'APELLIDO_1', 'FECHA_ALTA', 'FECHA_BAJA', 'FEC_PAGO', 'ID_CENTRO_TRAB', 'ID_CATEGORIA', ...NR_CONCEPTS.map(c => c.label)];
  const csvRows = () => relevantRows.map(r => [
    r.legajo, r.nombre ?? '', r.apellido1 ?? '', r.fecAlta ?? '', r.fecBaja ?? '', r.fecPago ?? '', r.idCentroTrab ?? '', r.idCategoria ?? '',
    ...NR_CONCEPTS.map(c => fmtNum(r[c.key])),
  ]);

  renderPlanillaPanel(container, {
    columns,
    rows: relevantRows,
    unitLabel: 'legajos',
    // Genera el archivo desde el Tabulado, no cruza nada: los cuatro chips de
    // caso salen en gris con su porqué, y la barra queda igual a las otras.
    estadoDe: () => null,
    noAplica: NO_APLICA_REPORTE,
    marcas: conceptsWithValue.map(c => ({
      value: c.key, label: c.label, match: (r) => tieneValor(r[c.key]),
    })),
    getLabel: r => r.nombre ? `${r.legajo} — ${r.nombre}` : `${r.legajo}`,
    stickyCols: 2,
    empty: 'Ningún empleado tiene valores NR distintos de cero en este período.',
    afterTable: (host) => {
      const pie = document.createElement('p');
      pie.className = 'text-muted';
      pie.style.cssText = 'font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);';
      pie.textContent = (ocultos > 0
        ? `Se ocultan ${ocultos} concepto${ocultos === 1 ? '' : 's'} sin valores en el período. `
        : '')
        + 'El .xlsx exportado incluye las 18 columnas de conceptos en el layout estándar.';
      host.appendChild(pie);
    },
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onExcel: () => exportNrReporteToXlsx({ ...results, rows: relevantRows }),
      onCsv:   () => downloadCsv(csvHeaders, csvRows(), `NR_Reporte_${periodSuffix(results.period)}.csv`),
      onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
  });
}

// ── Exports a Excel ───────────────────────────────────────────────────────────

// XLSX "Controlar": Legajo + 18 columnas CTRL (Tab − NR), coloreadas por grupo
async function exportNrToXlsx(results) {
  await loadExcelJS();

  // El contrato lee columnas planas (`row[c.key]`); `runNr()` guarda cada
  // concepto anidado en `valores[c.key].ctrl` — se aplana acá, una sola vez,
  // en vez de que el writer conozca esa forma.
  const flatRows = results.rows.map(r => {
    const flat = { legajo: r.legajo, difs: NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length };
    for (const c of NR_CONCEPTS) flat[c.key] = r.valores[c.key].ctrl;
    return flat;
  });

  const { EXPORT_CONTRACTS } = await import('../exports/contracts.js');
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();
  writeGroupedContractSheet(wb, EXPORT_CONTRACTS.nr, flatRows);
  await downloadWorkbook(wb, `NR_Control_${periodSuffix(results.period)}.xlsx`);
}

// XLSX "Generar Reporte": A(vacía) · B=ID_EMPLEADO · ... · I=ID_CATEGORIA · J-AA=18 conceptos
async function exportNrReporteToXlsx(results) {
  await loadExcelJS();
  const { EXPORT_CONTRACTS } = await import('../exports/contracts.js');
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();
  writeGroupedContractSheet(wb, EXPORT_CONTRACTS.nr_reporte, results.rows);
  await downloadWorkbook(wb, `NR_Reporte_${periodSuffix(results.period)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Limpieza de texto (nombre, centro de costo). La clave de legajo NO sale de
// acá: sale de `makeLegajoKey(mapping.legajoKeyMode)` (D-038).
function norm(v) { return v != null ? String(v).trim() : ''; }

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

