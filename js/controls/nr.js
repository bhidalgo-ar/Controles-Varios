// nr.js — Control No Remunerativos (Control NR)
import { diffStats } from './semaforo.js';
import { isDiff, currentTolerance } from './tolerance.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { estadoDeFila } from '../ui/tableTools.js';
import { renderPlanillaPanel, NO_APLICA_REPORTE } from '../ui/planillaPanel.js';
import { renderFichasPanel } from '../ui/fichaList.js';
import { codeOfColumn } from './tabCodes.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum, toNum } from '../utils/currency.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { groupRowsByLegajo, sumColumn, lastRow } from './consolidate.js';
import { writeGroupedContractSheet, colLetter } from '../exports/contractSheet.js';
import { periodSuffix } from '../utils/dates.js';
import { resumenStats, RESUMEN_BLOCKS } from './resumenStats.js';
import {
  renderVerdict, renderTiles, renderIssues, renderResumenDetalle,
  mvClass, mvArrow, fmtSigned,
} from '../ui/resultBlocks.js';
//
// Modo 1 — "Controlar": cruza los 19 conceptos NR del Reporte de M4
//   contra las columnas configuradas en el Tabulado.
//
// Modo 2 — "Generar Reporte": genera el Reporte de NR directamente desde
//   el Tabulado. Layout: A(vacía) | B=ID_EMPLEADO | C=NOMBRE | D=APELLIDO_1
//   | E=FECHA_ALTA | F=FECHA_BAJA | G=FEC_PAGO | H=ID_CENTRO_TRAB
//   | I=ID_CATEGORIA | J-AB = 19 conceptos en orden.

// ── Definición de conceptos NR ────────────────────────────────────────────────
// Orden = orden de columnas en el XLSX de salida.
// tabKey = clave en tabExtraConfig | nrKey = clave en mapping del archivo NR
// group: 'indem' = Indemnizatorios (verde) | 'otros' = Otros NR (naranja)

// Exportado para que js/exports/contracts.js derive la lista de columnas del
// Reporte NR de ACÁ, en vez de mantener una segunda copia de los conceptos.
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
  // 4418-AJUSTE_NR — el 19º concepto, pedido de Willy (2026-09-03). Va AL FINAL
  // de la lista a propósito: el orden de `NR_CONCEPTS` es el orden de columnas
  // del XLSX del modo "Generar Reporte", y meterlo en el medio correría de
  // lugar las 18 columnas que Meta4 ya emite en un orden fijo.
  { key: 'ajusteNr',       label: 'AJUSTE_NR',        tabKey: 'tabAjusteNrColumn',       nrKey: 'ajusteNrColumn',       group: 'otros' },
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
  // más útil acá que "el peor caso individual" porque hay 19 conceptos posibles.
  const conceptCounts = NR_CONCEPTS
    .map(c => ({ label: c.label, count: results.rows.filter(r => isDif(r.valores[c.key].ctrl)).length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const contextNote = conceptCounts.length
    ? `concepto más afectado: ${conceptCounts[0].label}${conceptCounts.length > 1 ? ` (+${conceptCounts.length - 1} más)` : ''}`
    : `${NR_CONCEPTS.length} conceptos NR verificados`;

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
    resumen: resumenDelNr(results),
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

  // El CÓDIGO de concepto de cada columna del Tabulado que alimentó el cruce.
  // No entra en ningún cálculo: es para que la pantalla pueda NOMBRAR cada
  // concepto por su código, que es lo único estable —el rótulo lo renombra el
  // cliente sin avisar, y el Tabulado real trae `'4899-COCHERA_IG'` y
  // `'8805-DTO_COCHERA'` a la vez (D-039). Sale de la columna que el analista
  // confirmó en el Paso 2, así que es el código de ESTE cliente y no una
  // semilla; si el encabezado no declara ninguno queda `null`, nunca uno
  // inventado por parecido.
  const codigos = {};
  for (const c of NR_CONCEPTS) codigos[c.key] = codeOfColumn(tm[c.tabKey]);

  const conDif     = rows.filter(r =>
    Object.values(r.valores).some(v => isDiff(v.ctrl))
  ).length;
  const sinTabData = rows.filter(r => r.sinTabData).length;

  return {
    summary: { total: rows.length, conDif, sinTabData },
    rows,
    codigos,
    period: mapping.period || '',
    // El modo de clave de legajo del cliente (D-038), para los cortes cruzados
    // del Resumen (specs/vista-estandar-resumen.md §4).
    legajoKeyMode: mapping.legajoKeyMode || null,
    // El puente del Resumen: Total Tabulado → Diferencia comparada → Total
    // Reporte NR. Es EL caso que motivó D-086: un concepto liquidado de un solo
    // lado no resta contra cero del otro, se informa aparte.
    bridge: bridgeDelRunNr(rows),
  };
}

/**
 * El puente del Resumen (D-086). Recorre, por legajo y por concepto, los
 * mismos `valores[key] = { nrVal, tabVal, ctrl }` que ya calculó este `run()` —
 * el mismo par que arma la ficha de cada legajo (`buildFichasNr`), acá sumado
 * sobre TODA la corrida en vez de sobre un legajo.
 *
 * Un concepto que ningún legajo liquidó (`hasValor` falso en las dos fuentes)
 * no entra ni a un total ni al otro: no es que esté "de un solo lado", es que
 * no se liquidó en el período, y contarlo movería los totales sin motivo.
 */
function bridgeDelRunNr(rows) {
  const relevantes = rows.filter(hasAnyNrValue);
  if (relevantes.length === 0) return null;

  let totalTabulado = 0, totalReporte = 0, diffComparada = 0;
  let tabSoloCount = 0, tabSoloAmount = 0, repSoloCount = 0, repSoloAmount = 0;

  for (const r of relevantes) {
    for (const c of NR_CONCEPTS) {
      const v = r.valores[c.key];
      if (!hasValor(v)) continue;
      if (v.tabVal !== null) totalTabulado += v.tabVal;
      if (v.nrVal  !== null) totalReporte  += v.nrVal;
      if (v.ctrl !== null) {
        diffComparada += v.ctrl;
      } else if (v.tabVal !== null) {
        tabSoloCount++; tabSoloAmount += v.tabVal;
      } else if (v.nrVal !== null) {
        repSoloCount++; repSoloAmount += v.nrVal;
      }
    }
  }

  const soloCount = tabSoloCount + repSoloCount;
  return {
    steps: [
      { label: 'Total Tabulado', amount: totalTabulado, tone: 'ink' },
      { label: 'Diferencia comparada', amount: diffComparada, tone: 'error' },
      { label: 'Total Reporte NR', amount: totalReporte, tone: 'ink' },
    ],
    proportion: {
      parts: [
        { tone: 'neutral', amount: Math.abs(totalTabulado), label: 'Total Tabulado' },
        { tone: 'error',   amount: Math.abs(diffComparada), label: 'Diferencia comparada' },
      ],
    },
    uncompared: soloCount === 0 ? null : {
      label: (() => {
        const bits = [];
        if (tabSoloCount > 0) bits.push(`${tabSoloCount} concepto${tabSoloCount === 1 ? '' : 's'} sólo en el Tabulado`);
        if (repSoloCount > 0) bits.push(`${repSoloCount} concepto${repSoloCount === 1 ? '' : 's'} sólo en el Reporte NR`);
        return `${bits.join(' y ')}, por`;
      })(),
      amount: tabSoloAmount + repSoloAmount,
    },
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

// La banda de cada concepto: los 19 se leen como dos bloques, indemnizatorios y
// el resto. El tinte lo pone la pieza compartida (antes lo escribía este módulo
// en verde y naranja, con su propio rgba).
const BANDA = { indem: 'Indemnizatorios', otros: 'Otros NR' };

// ── El sub-objeto que dibuja el tablero del Resumen ─────────────────────────
//
// La causa arranca por las DOS BANDAS (indemnizatorios / otros NR), no por los
// 19 conceptos: 19 cortes son una pared en un gráfico de causa igual que lo son
// en la fila de chips (§7.7 de la spec — Willy elige en pantalla si conviene
// abrir a concepto). Cada legajo se abre en una instancia por concepto CON
// DIFERENCIA, para que la banda que más pesa sea la que más conceptos suma.
function instanciasPorConceptoNr(rows) {
  const out = [];
  for (const r of rows) {
    for (const c of NR_CONCEPTS) {
      const v = r.valores[c.key];
      if (v.ctrl !== null && isDif(v.ctrl)) out.push({ legajo: r.legajo, concepto: c, dif: v.ctrl });
    }
  }
  return out;
}

function resumenDelNr(results) {
  const legajoKey = makeLegajoKey(results.legajoKeyMode);
  const instancias = instanciasPorConceptoNr(results.rows);

  return resumenStats({
    unit: 'legajo',
    tolerance: currentTolerance(),
    rows: instancias,
    diff: (i) => i.dif,
    key: (i) => legajoKey(i.legajo),
    cause: (i) => ({ key: i.concepto.group, label: BANDA[i.concepto.group] }),
    top: (i) => ({ legajo: i.legajo, rubro: etiquetaConcepto(i.concepto, results.codigos) }),
    bridge: results.bridge || null,
    // Este control no trae empresa: una sola razón social por corrida.
    notApplicable: ['group'],
  });
}

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
    // Con diferencias lo primero que se ve es POR QUÉ falla (§2): abre en Fichas.
    conDiferencias: diffRows.length > 0,
    resumen(panel) {
      const tone = diffRows.length === 0 ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: diffRows.length === 0
          ? 'Todos los empleados con valores NR coinciden con el Tabulado.'
          : `${diffRows.length} de ${relevantRows.length} empleados con NR tienen alguna diferencia.`,
        body: diffRows.length === 0
          ? `${relevantRows.length} empleado${relevantRows.length === 1 ? '' : 's'} con valores no remunerativos, verificados contra el Tabulado sin diferencias.`
          : `Diferencia total de <strong>${fmtNum(totalDiffAmount)}</strong> entre los ${NR_CONCEPTS.length} conceptos no remunerativos. El detalle completo está en la solapa «Planilla».`,
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
    fichas(panel) { renderNrFichas(panel, { relevantRows, results }); },
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
// **Los 19 conceptos son el segundo eje y van en `Marcas ▾`, no en la fila de
// chips**: 19 chips no son un filtro, son una pared (§3). La fila de chips dice
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
 * `valores[key] = { nrVal, tabVal, ctrl }`, así que se aplana acá —una vez, como
 * ya hace el export— y la fila se queda con una referencia a la original para lo
 * que no es un importe.
 *
 * Las tres claves por concepto son las MISMAS que usa el `.xlsx`
 * (`nr_<key>` · `tab_<key>` · `<key>`), así que la pantalla y el archivo nombran
 * lo mismo y un total se puede escribir una sola vez para los dos.
 */
function filasDePlanilla(rows, conceptos) {
  return rows.map(r => {
    const fila = { legajo: r.legajo, difs: difsDeLegajo(r), _row: r };
    for (const c of conceptos) {
      const { nrVal, tabVal, ctrl } = r.valores[c.key];
      fila[`nr_${c.key}`]  = nrVal;
      fila[`tab_${c.key}`] = tabVal;
      fila[c.key]          = ctrl;
    }
    return fila;
  });
}

/** Suma de una columna ya aplanada. `null` —no `0`— si ninguna fila trajo dato:
 *  un concepto que nadie liquidó deja la celda del TOTAL vacía. */
function totalDeColumna(rows, key) {
  return sumaONull(rows.map(r => r[key]));
}

/**
 * El TOTAL de una columna CTRL es la **resta de los totales** (Σ Tab − Σ Reporte)
 * y no la suma de la columna: son números distintos en cuanto un legajo no se
 * pudo comparar —el que está en el reporte y no en el Tabulado suma de un lado y
 * de ninguno del otro—, y el de la resta es el que muestra el puente del Resumen.
 * Si acá saliera la suma de la columna, la misma pantalla diría dos cosas.
 *
 * Con un solo lado del concepto liquidado no hay resta que mostrar: la celda va
 * vacía, no en cero (`null` no es `0`).
 */
function totalCtrl(rows, c) {
  const tab = totalDeColumna(rows, `tab_${c.key}`);
  const nr  = totalDeColumna(rows, `nr_${c.key}`);
  return (tab === null || nr === null) ? null : tab - nr;
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
    // Una banda por concepto y, adentro, las tres columnas de siempre: lo que
    // informa el Reporte de NR, lo que dice el Tabulado y la resta — el mismo
    // molde que el Control de Brutos (pedido de Willy, 2026-09-03). Antes acá
    // salía sólo la diferencia y los dos lados había que ir a buscarlos al
    // `.xlsx` exportado o abrir la ficha del legajo.
    ...conceptos.flatMap(c => {
      const banda = etiquetaConcepto(c, results.codigos);
      return [
        { key: `nr_${c.key}`,  label: 'NR',   sub: 'lo que informa el reporte', band: banda, num: true },
        { key: `tab_${c.key}`, label: 'Tab',  sub: 'la columna del Tabulado',   band: banda, num: true },
        { key: c.key,          label: 'CTRL', sub: 'Tab − NR',                  band: banda,
          diff: true, close: true, absentLabel: 'sin comparar',
          total: (filas) => totalCtrl(filas, c) },
      ];
    }),
  ];

  // Exportar sigue trayendo los 19 conceptos y todos los legajos evaluados: el
  // filtro de pantalla recorta lo que se ve, no lo que se archiva. Las tres
  // columnas por concepto son las mismas que la pantalla y que el `.xlsx`.
  const csvHeaders = ['Legajo', '# Difs', ...NR_CONCEPTS.flatMap(c => [
    `${c.label} (NR)`, `${c.label} (Tab)`, `${c.label} (Dif)`,
  ])];
  const csvRows = () => relevantRows.map(r => [
    r.legajo, difsDeLegajo(r), ...NR_CONCEPTS.flatMap(c => {
      const { nrVal, tabVal, ctrl } = r.valores[c.key];
      return [fmtNum(nrVal), fmtNum(tabVal), fmtNum(ctrl)];
    }),
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
    empty: `Ningún empleado tiene valor real en los ${NR_CONCEPTS.length} conceptos NR.`,
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
      pie.textContent = 'Cada concepto trae lo que informa el Reporte de NR, lo que dice el '
        + 'Tabulado y la resta Tab − NR. La última fila es el total de cada columna.'
        + (ocultos > 0 ? ` Se ocultan ${ocultos} concepto${ocultos === 1 ? '' : 's'} sin valores en el período.` : '')
        + ' En el .xlsx la resta va como fórmula, apuntando a las dos celdas de la fila.';
      host.appendChild(pie);
    },
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onExcel: () => exportNrToXlsx({ ...results, rows: relevantRows }),
      onCsv:   () => downloadCsv(csvHeaders, csvRows(), `NR_Control_${periodSuffix(results.period)}.csv`),
      onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
  });
}


// ══════════════════════════════════════════════════════════════════════════════
// La solapa Fichas (§4 de specs/vista-estandar-resultados.md)
// ══════════════════════════════════════════════════════════════════════════════
//
// La planilla compara 19 conceptos entre cientos de legajos; la ficha abre UN
// legajo y dice por qué no cierra. Hasta acá la fila de un legajo decía
// "# Difs: 3" y nada más: cuáles de los 19 conceptos, de qué lado, y por cuánto
// había que ir a buscarlo al .xlsx exportado.
//
// La ficha no recalcula nada. Los dos lados de cada concepto y su diferencia ya
// los publica `runNr()` en `valores[key] = { nrVal, tabVal, ctrl }`; acá se
// suman los conceptos de ESE legajo y se les pone nombre, código y una
// instrucción.

/** Los conceptos que este legajo tiene con valor real en alguna de las dos fuentes. */
function conceptosDeLegajo(r) {
  return NR_CONCEPTS.filter(c => hasValor(r.valores[c.key]));
}

/** Suma que respeta `null`: sin ningún dato el total es `null`, no `0`. */
function sumaONull(valores) {
  let total = null;
  for (const v of valores) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    total = (total ?? 0) + v;
  }
  return total;
}

const SEVERIDAD_NR = { conDif: 'error', sinComparar: 'warn', margen: 'info', centavo: 'ok' };

/**
 * El segundo eje del filtro: **qué conceptos liquidó** este legajo. Son los 19 y
 * van en `Marcas ▾`, nunca en la fila de chips: 19 chips no son un filtro, son
 * una pared, y la fila de chips dice siempre lo mismo en las 21 pantallas (§3).
 *
 * La misma lista alimenta las pills de cada tarjeta, así que el desplegable y la
 * ficha nombran exactamente lo mismo.
 */
function marcasNr(conceptos, codigos) {
  return conceptos.map(c => ({
    value: c.key,
    label: etiquetaConcepto(c, codigos),
    match: (f) => f.conceptos.some(x => x.key === c.key),
  }));
}

/** El concepto nombrado por su CÓDIGO y su rótulo. Sin código, sólo el rótulo:
 *  un código inventado por parecido manda a mirar la columna equivocada. */
function etiquetaConcepto(c, codigos) {
  const cod = codigos?.[c.key] || null;
  return cod ? `${cod} · ${c.label}` : c.label;
}

/** Cuántas pills de concepto entran en una tarjeta antes de que sean una pared. */
const MAX_PILLS_NR = 6;

const NO_APLICA_NR = {};

/** Los descriptores de ficha del control: uno por legajo con algún valor NR.
 *  Exportada para el test: es donde se decide qué dice cada tarjeta. */
export function buildFichasNr(relevantRows, codigos) {
  return relevantRows.map(r => {
    const conceptos = conceptosDeLegajo(r);
    const conDif = conceptos.filter(c => isDif(r.valores[c.key].ctrl));
    const sinComparar = conceptos.filter(c => r.valores[c.key].ctrl === null);

    const sumNr  = sumaONull(conceptos.map(c => r.valores[c.key].nrVal));
    const sumTab = sumaONull(conceptos.map(c => r.valores[c.key].tabVal));
    // **La diferencia se suma sólo sobre lo COMPARABLE, no como resta de los dos
    // totales.** Con la resta, un concepto que trae valor de un solo lado se
    // cuenta como si el otro lado valiera cero: un legajo con 7.000,00 en un
    // concepto que el Tabulado no informa salía con "−7.000,00 de diferencia",
    // que es exactamente lo que `null` no es (CLAUDE.md). Los dos totales de
    // arriba siguen siendo los de cada archivo —eso es lo que el analista
    // compara—, y lo que quedó afuera se dice en la línea de contexto, en la
    // tabla con "—" y en la conclusión.
    const difComparada = sumaONull(conceptos.map(c => r.valores[c.key].ctrl));
    // Lo que hay para revisar es la suma de las diferencias EN VALOR ABSOLUTO de
    // los conceptos que las tienen — el mismo número que el tile "Diferencia
    // total" del Resumen totaliza. No es el neto: un legajo con +12.000 en un
    // concepto y −12.000 en otro tiene neto cero y dos conceptos mal, y ése es
    // justo el caso que la ficha existe para mostrar.
    const aRevisar = conDif.reduce((s, c) => s + Math.abs(r.valores[c.key].ctrl), 0);

    const base = { id: r.legajo, row: r, conceptos, conDif, sinComparar, sumNr, sumTab, difComparada, aRevisar };
    // El mismo estado que la planilla, con la misma función: si la ficha y la
    // fila contaran distinto, la misma pantalla se contradiría.
    base.estado = estadoDeLegajoNr(r, conceptos);
    return { ...base, ...presentacionNr(base, codigos) };
  });
}

/** Lo que se ve: la tarjeta cerrada arriba y el cuerpo que se dibuja al abrir. */
function presentacionNr(f, codigos) {
  const { row: r, conceptos, conDif, sinComparar } = f;
  const sev = SEVERIDAD_NR[f.estado] || 'info';
  const nIndem = conceptos.filter(c => c.group === 'indem').length;

  // El peor concepto: es el que da el badge, o sea la causa principal.
  const peor = [...conDif].sort((a, b) =>
    Math.abs(r.valores[b.key].ctrl) - Math.abs(r.valores[a.key].ctrl))[0] || null;

  return {
    unit: r.legajo,
    severity: sev,
    name: `Legajo ${r.legajo}`,
    tag: { text: nIndem === conceptos.length ? 'Indemnizatorios' : nIndem > 0 ? 'Indem. + otros NR' : 'Otros NR' },
    badge: badgeNr(f, peor, codigos),
    context: [
      `${conceptos.length} de ${NR_CONCEPTS.length} conceptos con valor`,
      conDif.length > 0
        ? `${conDif.length} con diferencia`
        : sinComparar.length > 0 ? 'ninguna diferencia comparable' : 'todos coinciden',
      sinComparar.length > 0 ? `${sinComparar.length} de un solo lado` : null,
    ],
    marks: pillsNr(f, codigos),
    amountLabel: 'A revisar',
    amount: f.aRevisar,
    amountTone: sev === 'error' ? 'error' : sev === 'warn' ? 'warn' : undefined,
    body: {
      // 1. La tira: el total del reporte de NR contra el total del Tabulado, y
      //    qué conceptos explican la diferencia. Las dos primeras pastillas son
      //    los dos lados tal como los trae cada archivo; la tercera es la
      //    diferencia de lo que SÍ se pudo comparar (no la resta de las dos de
      //    arriba: ver `difComparada`); la cuarta, lo que hay que ir a mirar (por
      //    qué son dos números distintos, ver `aRevisar`).
      strip: [
        { label: 'Reporte NR', value: f.sumNr },
        { label: 'Tabulado', value: f.sumTab },
        { label: 'Diferencia comparada', value: f.difComparada, invert: true },
        {
          label: conDif.length > 0
            ? `A revisar · ${conDif.length} de ${conceptos.length} concepto${conceptos.length === 1 ? '' : 's'}`
            : 'A revisar',
          value: f.aRevisar,
          residuo: conDif.length > 0,
        },
      ],
      // 2. El detalle: un renglón por concepto de este legajo, con su CÓDIGO,
      //    los dos lados y la diferencia. Verde suave lo que el Tabulado tiene
      //    de más, rojo suave lo que tiene de menos.
      detail: {
        title: 'Concepto por concepto — los dos lados y la diferencia',
        columns: [
          { key: 'concepto', label: 'Concepto' },
          { key: 'tab', label: 'Tabulado', num: true },
          { key: 'nr', label: 'Reporte NR', num: true },
          { key: 'dif', label: 'Tab − NR', num: true },
        ],
        rows: ordenarConceptos(conceptos, r).map(c => {
          const v = r.valores[c.key];
          return {
            concepto: etiquetaConcepto(c, codigos),
            tab: v.tabVal, nr: v.nrVal, dif: v.ctrl,
            tone: v.ctrl === null || Math.abs(v.ctrl) <= CENTAVO_NR
              ? undefined : (v.ctrl > 0 ? 'pos' : 'neg'),
          };
        }),
        foot: { label: 'Diferencia comparada', value: f.difComparada, key: 'dif' },
      },
      // 3. La conclusión: qué mirar, descontando lo que ya está explicado.
      conclusion: conclusionNr(f, peor, codigos),
    },
  };
}

/** El redondeo de Meta4, el piso de todo el repo: abajo de esto no hay color. */
const CENTAVO_NR = 0.01;

/** Peor primero: la diferencia más grande arriba, después lo que no se pudo
 *  comparar, y al final lo que cerró. */
function ordenarConceptos(conceptos, r) {
  const rango = (c) => {
    const d = r.valores[c.key].ctrl;
    if (d === null) return 1;
    return isDif(d) ? 0 : 2;
  };
  return [...conceptos].sort((a, b) => {
    const ra = rango(a), rb = rango(b);
    if (ra !== rb) return ra - rb;
    return Math.abs(r.valores[b.key].ctrl ?? 0) - Math.abs(r.valores[a.key].ctrl ?? 0);
  });
}

/** La causa principal, en una línea. */
function badgeNr(f, peor, codigos) {
  const r = f.row;
  if (peor) {
    const v = r.valores[peor.key].ctrl;
    return {
      text: `${etiquetaConcepto(peor, codigos)} ${fmtSigned(v)}`,
      title: `El Tabulado tiene ${v > 0 ? 'de más' : 'de menos'} que el Reporte NR en este concepto.`,
      tone: 'error',
    };
  }
  if (r.sinTabData) {
    return { text: 'No está en el Tabulado', tone: 'warn' };
  }
  if (f.sinComparar.length > 0) {
    return {
      text: `${f.sinComparar.length} concepto${f.sinComparar.length === 1 ? '' : 's'} de un solo lado`,
      tone: 'warn',
    };
  }
  if (f.estado === 'margen') {
    return { text: 'Dentro del monto de diferencia', tone: 'info' };
  }
  return { text: 'Coincide al centavo', tone: 'ok' };
}

/**
 * Las pills de la tarjeta: los conceptos que este legajo liquidó, los mismos que
 * el desplegable `Marcas ▾`. En celeste el que tiene diferencia, en gris el que
 * cerró. Con más de MAX_PILLS_NR la línea deja de ser una marca y pasa a ser una
 * pared: se cortan y se dice cuántas quedaron afuera.
 */
function pillsNr(f, codigos) {
  const r = f.row;
  const orden = ordenarConceptos(f.conceptos, r);
  const pills = orden.slice(0, MAX_PILLS_NR).map(c => ({
    text: etiquetaConcepto(c, codigos),
    tone: isDif(r.valores[c.key].ctrl) || r.valores[c.key].ctrl === null ? 'info' : 'neutral',
  }));
  const resto = orden.length - pills.length;
  if (resto > 0) pills.push({ text: `+${resto} más`, tone: 'neutral', title: orden.slice(MAX_PILLS_NR).map(c => etiquetaConcepto(c, codigos)).join(' · ') });
  return pills;
}

/** No un resumen del importe que ya se ve arriba: una instrucción, descontando
 *  lo que la ficha ya explicó. */
function conclusionNr(f, peor, codigos) {
  const r = f.row;
  const cerraron = f.conceptos.length - f.conDif.length - f.sinComparar.length;
  const yaExplicado = cerraron === 0 ? ''
    : cerraron === 1
      ? ' El otro concepto de este legajo ya cierra: no hace falta mirarlo.'
      : ` Los otros ${cerraron} conceptos de este legajo ya cierran: no hace falta mirarlos.`;

  if (r.sinTabData) {
    return {
      tone: 'warn',
      title: 'Este legajo informa NR y no aparece en el Tabulado',
      text: 'El Reporte de NR trae valores para este legajo y el Tabulado del período no lo tiene en ninguna '
        + 'liquidación. Confirmá que los dos archivos sean del mismo mes y de la misma empresa antes de '
        + 'tocar el reporte: si el Tabulado es el correcto, el legajo está de más en el Reporte de NR.',
    };
  }

  if (f.conDif.length > 0) {
    const cuales = f.conDif.map(c => etiquetaConcepto(c, codigos)).join(', ');
    const sinCmp = f.sinComparar.length > 0
      ? ` Además hay ${f.sinComparar.length} concepto${f.sinComparar.length === 1 ? '' : 's'} con valor de un solo `
        + 'lado, que sale abajo con «—»: no se pudo comparar, así que su importe no está sumado en la '
        + 'diferencia de arriba.'
      : '';
    return {
      tone: 'error',
      title: `Quedan ${fmtNum(f.aRevisar)} para revisar en ${f.conDif.length} concepto${f.conDif.length === 1 ? '' : 's'}`,
      text: `Abrí el Tabulado en la columna de ${cuales} para este legajo y sumá sus liquidaciones del mes: `
        + `el control ya las suma, así que una diferencia acá es un valor distinto, no una paga de menos.`
        + (peor && f.conDif.length > 1 ? ` Arrancá por ${etiquetaConcepto(peor, codigos)}, que es la más grande.` : '')
        + sinCmp + yaExplicado,
    };
  }

  if (f.sinComparar.length > 0) {
    // Con el importe y de qué lado: es lo que le permite al analista buscarlo en
    // el archivo, y es plata que la diferencia de arriba NO incluye a propósito.
    const cuales = f.sinComparar.map(c => {
      const v = r.valores[c.key];
      const lado = v.tabVal !== null ? 'el Tabulado' : 'el Reporte de NR';
      const monto = v.tabVal !== null ? v.tabVal : v.nrVal;
      return `${etiquetaConcepto(c, codigos)} (${fmtNum(monto)} en ${lado}, nada del otro lado)`;
    }).join(', ');
    return {
      tone: 'warn',
      title: `${f.sinComparar.length} concepto${f.sinComparar.length === 1 ? '' : 's'} con valor de un solo lado`,
      text: `${cuales}. Ese importe NO entra en la diferencia de arriba: un concepto sin el otro lado no vale `
        + 'cero, no se sabe cuánto vale. O la columna no está mapeada en el Paso 2, o el concepto se liquidó '
        + 'de un solo lado — revisá el mapeo primero.'
        + yaExplicado,
    };
  }

  if (f.estado === 'margen') {
    return {
      tone: 'info',
      title: 'Todo queda dentro del monto de diferencia del cliente',
      text: 'Los conceptos de este legajo no coinciden exactamente pero ninguna diferencia llega al monto '
        + 'configurado en «Umbrales». No hay nada que corregir; si querés verlas, bajá el monto.',
    };
  }

  return {
    tone: 'ok',
    title: 'Cierra al centavo',
    text: (f.conceptos.length === 1
      ? 'El único concepto no remunerativo de este legajo coincide entre el Reporte de NR y el Tabulado. '
      : `Los ${f.conceptos.length} conceptos no remunerativos de este legajo coinciden entre el Reporte de `
        + 'NR y el Tabulado. ')
      + 'No hay nada para revisar acá.',
  };
}

function renderNrFichas(panel, { relevantRows, results }) {
  const codigos = results.codigos || {};
  const fichas = buildFichasNr(relevantRows, codigos);
  // El universo de `Marcas ▾`: los mismos conceptos que son columnas en la
  // planilla, así el desplegable de las dos solapas ofrece lo mismo.
  const conceptos = conceptosConValor(relevantRows);

  renderFichasPanel(panel, {
    fichas,
    unitLabel: 'legajos',
    estadoDe: f => f.estado,
    noAplica: NO_APLICA_NR,
    marcas: marcasNr(conceptos, codigos),
    ordenes: [
      { value: 'aRevisar', label: 'Mayor diferencia', compare: (a, b) => b.aRevisar - a.aRevisar },
      { value: 'conceptos', label: 'Más conceptos con diferencia', compare: (a, b) => b.conDif.length - a.conDif.length },
      { value: 'legajo', label: 'Legajo', compare: (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }) },
    ],
    getLabel: f => `${f.id}`,
    getAmount: f => f.aRevisar,
    amountLabel: 'Σ a revisar',
    onExport: (exportEl) => mountNrExportMenu(exportEl, { rows: relevantRows, results }),
  });
}

/** Los tres ítems del ⬇ Exportar ▾ de la solapa Fichas. Siempre los 19
 *  conceptos y todos los legajos evaluados: el filtro de pantalla recorta lo que
 *  se ve, no lo que se archiva. */
function mountNrExportMenu(exportEl, { rows, results }) {
  const csvHeaders = ['Legajo', '# Difs', ...NR_CONCEPTS.map(c => c.label)];
  const csvRows = () => rows.map(r => [
    r.legajo,
    NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length,
    ...NR_CONCEPTS.map(c => fmtNum(r.valores[c.key].ctrl)),
  ]);
  renderExportMenu(exportEl, {
    onExcel: () => exportNrToXlsx({ ...results, rows }),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `NR_Control_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
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
  // Mismo criterio que `renderNrReporteResults`: sólo importan los empleados
  // con algún valor NR distinto de cero — un concepto sin ninguna celda
  // cargada es normal (D-036) y no entra al reporte.
  const relevantRows = results.rows.filter(reporteRowHasValue);
  const conceptsWithValue = NR_CONCEPTS.filter(c => relevantRows.some(r => tieneValor(r[c.key])));
  const hayValores = relevantRows.length > 0;

  return {
    status:   hayValores ? 'info' : 'warning',
    headline: hayValores
      ? `Reporte de NR generado — ${relevantRows.length} empleado${relevantRows.length === 1 ? '' : 's'} con valores, listo para descargar.`
      : 'Ningún empleado tiene valores NR distintos de cero en este período — no hay nada para descargar.',
    insights: [],
    unit:            null,
    unitsTotal:      null,
    unitsWithDiff:   null,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote:     hayValores
      ? `${conceptsWithValue.length} de los ${NR_CONCEPTS.length} conceptos no remunerativos con algún valor.`
      : null,
    // No cruza dos archivos: no hay escala, puente, lados ni cortes que
    // dibujar. La declaración explícita es lo que el candado de CI reconoce
    // como migrado (specs/vista-estandar-resumen.md §4).
    resumen: resumenStats({ unit: null, rows: [], notApplicable: RESUMEN_BLOCKS }),
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
          ? `Armado directo desde el Tabulado, con ${conceptsWithValue.length} de los ${NR_CONCEPTS.length} conceptos no remunerativos con algún valor. El detalle completo está en la solapa «Planilla».`
          : null,
      });
      renderTiles(panel, [
        { label: 'Empleados con NR', value: relevantRows.length },
        { label: 'Sin valores NR', value: noNrCount, sub: 'no entran al reporte' },
        { label: 'Conceptos con valor', value: `${conceptsWithValue.length} / ${NR_CONCEPTS.length}` },
      ]);
    },
    planilla(panel) { renderNrReportePlanilla(panel, { relevantRows, conceptsWithValue, results }); },
  });
}

// ── La planilla del Reporte (§5) ─────────────────────────────────────────────
//
// Las columnas y su orden son las del archivo que se entrega. Lo que agrega la
// vista estándar es la banda y el sublabel: de dónde sale cada valor. Los 19
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

  // Exportar siempre incluye TODOS los empleados con valores NR y las 19
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
        + `El .xlsx exportado incluye las ${NR_CONCEPTS.length} columnas de conceptos en el layout estándar.`;
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

// XLSX "Controlar": Legajo · # Difs · 19 columnas con el valor del Reporte de
// NR · 19 con el del Tabulado · 19 de CTRL, y el CTRL va como FÓRMULA
// (`=<Tabulado>-<Reporte>`) apuntando a las dos celdas de la misma fila. El
// analista abre el .xlsx y ve el cruce, no un número ya masticado.
//
// El número de columna sale del contrato y no de constantes acá: si mañana se
// agrega una columna al principio, las fórmulas siguen apuntando bien.
//
// El contrato lee columnas planas (`row[c.key]`) y `runNr()` guarda cada
// concepto anidado en `valores[c.key]`: el aplanado vive en `nrControlarRows`.
/**
 * Las filas planas del modo Controlar, con el CTRL ya armado como fórmula.
 * Exportada para que `tests/nrExportFormulas.test.js` verifique a qué celdas
 * apunta cada resta sin tener que abrir un .xlsx.
 *
 * @param {object[]} rows      filas de `runNr()` (`valores[key] = { nrVal, tabVal, ctrl }`)
 * @param {object}   contract  `EXPORT_CONTRACTS.nr`
 */
export function nrControlarRows(rows, contract) {
  const colDe = key => colLetter(contract.columns.findIndex(c => c.key === key) + 1);
  const primeraFilaDatos = (contract.headerRows || 1) + 1;

  return rows.map((r, i) => {
    const filaExcel = primeraFilaDatos + i;
    const flat = { legajo: r.legajo, difs: NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length };
    for (const c of NR_CONCEPTS) {
      const { nrVal, tabVal, ctrl } = r.valores[c.key];
      flat[`nr_${c.key}`]  = nrVal;
      flat[`tab_${c.key}`] = tabVal;
      // Sin los dos lados no hay resta que mostrar: la celda queda vacía, no en
      // cero (null ≠ 0 — un 0,00 acá diría "cerró bien" sobre un dato que falta).
      flat[c.key] = ctrl === null
        ? null
        : { formula: `${colDe(`tab_${c.key}`)}${filaExcel}-${colDe(`nr_${c.key}`)}${filaExcel}`, result: ctrl };
    }
    return flat;
  });
}

/**
 * La fila de TOTAL del `.xlsx`, en negrita abajo del último legajo (pedido de
 * Willy, 2026-09-03) — misma cuenta que la fila de TOTAL de la pantalla.
 *
 * Los totales de las dos fuentes van como `SUM()` sobre su propia columna y el
 * del CTRL como la RESTA de esos dos totales, apuntando a las celdas de esta
 * misma fila: así el Excel deja rehacer la cuenta entera, igual que ya hace la
 * resta de cada legajo. Un concepto que no liquidó nadie de un lado no lleva
 * total del CTRL: la celda va vacía, no en cero (`null` no es `0`).
 *
 * Exportada para el test: es donde se decide a qué celdas apunta cada total.
 *
 * @param {object[]} flat      lo que devuelve `nrControlarRows()`
 * @param {object}   contract  `EXPORT_CONTRACTS.nr`
 */
export function nrControlarTotalRow(flat, contract) {
  const primeraFilaDatos = (contract.headerRows || 1) + 1;
  const ultimaFilaDatos  = primeraFilaDatos + flat.length - 1;
  const filaTotal        = ultimaFilaDatos + 1;
  const colDe = key => colLetter(contract.columns.findIndex(c => c.key === key) + 1);

  // El rótulo y el conteo de diferencias de toda la corrida. Sin filas no hay
  // rango que sumar, así que tampoco hay fila de TOTAL que escribir.
  if (flat.length === 0) return null;

  const total = { legajo: 'TOTAL', difs: flat.reduce((acc, f) => acc + (f.difs ?? 0), 0) };

  const suma = (key) => {
    const v = totalDeColumna(flat, key);
    if (v === null) return null;
    const col = colDe(key);
    return { formula: `SUM(${col}${primeraFilaDatos}:${col}${ultimaFilaDatos})`, result: v };
  };

  for (const c of NR_CONCEPTS) {
    const nrKey  = `nr_${c.key}`;
    const tabKey = `tab_${c.key}`;
    total[nrKey]  = suma(nrKey);
    total[tabKey] = suma(tabKey);
    const dif = totalCtrl(flat, c);
    total[c.key] = dif === null
      ? null
      : { formula: `${colDe(tabKey)}${filaTotal}-${colDe(nrKey)}${filaTotal}`, result: dif };
  }

  return total;
}

async function exportNrToXlsx(results) {
  await loadExcelJS();

  const { EXPORT_CONTRACTS } = await import('../exports/contracts.js');
  const contract = EXPORT_CONTRACTS.nr;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();
  const flat     = nrControlarRows(results.rows, contract);
  const totalRow = nrControlarTotalRow(flat, contract);
  writeGroupedContractSheet(wb, contract, flat, { ...(totalRow ? { totalRow } : {}) });
  await downloadWorkbook(wb, `NR_Control_${periodSuffix(results.period)}.xlsx`);
}

// XLSX "Generar Reporte": A(vacía) · B=ID_EMPLEADO · ... · I=ID_CATEGORIA · J-AB=19 conceptos
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

