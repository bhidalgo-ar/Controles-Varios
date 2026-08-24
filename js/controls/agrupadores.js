// agrupadores.js — Control "Cruce por Agrupadores": Nómina Maestra vs Resumen
//
// Reimplementa como control del CONTROL_REGISTRY (T9 de PLAN_v2.md, D-008) el
// cruce que antes vivía en su propio wizard (`#/wizard/:clientId`, retirado).
// Reusa runMatching() (matching.js) y computeInsights() (insights.js) tal
// cual — sólo cambia dónde se invocan y dónde se guarda el resultado.
//
// A diferencia de los otros controles, no usa el Tabulado (`tabRequired: false`)
// sino la Nómina Maestra como primaryRows y un Resumen (Largo o Tabulado
// Horizontal — el que suba el analista) como segunda planilla, inyectada por
// el loop genérico de controlsWizard.js vía `mapping.resumenLargoRows` /
// `mapping.resumenTabuladoRows`. La selección de agrupadores y los umbrales
// no vienen de un archivo, así que controlsWizard.js los agrega a `mapping`
// con un caso puntual (mismo patrón que usa para `rvaConfig`).

import { runMatching } from '../matching.js';
import { computeInsights } from '../insights.js';
import { resumenStats } from './resumenStats.js';
import { formatAmount, formatDiff, formatDiffText, formatPct, redondear } from '../utils/currency.js';
import {
  renderVerdict, renderTiles, renderChecks, renderIssues, renderResumenDetalle, diffBadgeHtml,
} from '../ui/resultBlocks.js';
import { renderPlanillaPanel } from '../ui/planillaPanel.js';
import { renderFichasPanel } from '../ui/fichaList.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';

export const DEFAULT_AGRUPADORES_CONFIG = {
  selectedGrouperIds: null, // null = "todos los agrupadores del cliente"
  thresholds: { absoluteAmount: 1, percentage: 0.1, flagMissing: true },
};

/**
 * @param {object[]} nominaRows - parsedRows de la Nómina Maestra (additionalFiles[0])
 * @param {object[]} _tabRows   - sin uso (el control no depende del Tabulado)
 * @param {object}   mapping    - trae resumenLargoRows/resumenTabuladoRows (inyectados
 *                                automáticamente por additionalFile) y grouperDefs/
 *                                grouperConceptsMap/agrupadoresConfig (inyectados por
 *                                el caso puntual de controlsWizard.js)
 */
export function runAgrupadores(nominaRows, _tabRows, mapping) {
  const resumenRows = mapping.resumenLargoRows?.length
    ? mapping.resumenLargoRows
    : (mapping.resumenTabuladoRows || []);
  const grouperDefs        = mapping.grouperDefs || [];
  const grouperConceptsMap = mapping.grouperConceptsMap || {};
  const thresholds = mapping.agrupadoresConfig?.thresholds || DEFAULT_AGRUPADORES_CONFIG.thresholds;

  if (!nominaRows?.length) return { error: 'No hay datos de la Nómina Maestra.' };
  if (!resumenRows.length) return { error: 'No hay datos del Resumen — cargá el formato Largo o el Tabulado Horizontal.' };
  if (!grouperDefs.length) return { error: 'No hay agrupadores seleccionados. Elegí al menos uno en "Agrupadores y umbrales".' };

  const resultsPorGrupo = runMatching(nominaRows, resumenRows, grouperConceptsMap, thresholds);
  const insights = computeInsights(resultsPorGrupo, grouperDefs, nominaRows, resumenRows);

  // Los umbrales viajan en el resultado: son la base de cálculo que la planilla
  // escribe abajo del título de cada columna de diferencia y que la ficha nombra
  // en su conclusión ("abajo del umbral de $ 1,00"). Una corrida vieja no
  // los trae y la pantalla cae en los del default (no se inventa otro número).
  return {
    resultsPorGrupo, grouperDefs, thresholds, ...insights,
    // El puente del Resumen: Nómina Maestra → Archivo Resumen → diferencia NETA
    // y TOTAL separadas (D-087), agregado sobre lo que ya calculó `computeInsights()`.
    bridge: bridgeDelRun(insights.byGrouper, resultsPorGrupo, grouperDefs),
  };
}

/**
 * El puente del Resumen. Nómina Maestra y Archivo Resumen son la suma de
 * `byGrouper` (cada agrupador, sobre TODOS los legajos del cruce — un legajo
 * que falta de un lado suma 0 de ese lado, igual que hace `runMatching()`).
 * La diferencia NETA es la resta simple de esos dos totales — puede compensar
 * un agrupador con otro. La diferencia TOTAL es `legajoStats().diffTotalAmount`,
 * la misma cuenta que ya suma el semáforo (D-087): no se vuelve a calcular acá,
 * se toma de la fuente única para que el puente y el KPI nunca digan cosas
 * distintas del mismo run.
 */
function bridgeDelRun(byGrouper, resultsPorGrupo, grouperDefs) {
  if (!byGrouper || byGrouper.length === 0) return null;
  const totalNomina  = redondear(byGrouper.reduce((s, g) => s + g.totalNomina, 0));
  const totalResumen = redondear(byGrouper.reduce((s, g) => s + g.totalResumen, 0));
  const neta = redondear(totalNomina - totalResumen);
  const { diffTotalAmount } = legajoStats({ resultsPorGrupo, grouperDefs });

  return {
    steps: [
      { label: 'Nómina Maestra',   amount: totalNomina,      tone: 'ink' },
      { label: 'Archivo Resumen',  amount: totalResumen,     tone: 'ink' },
      { label: 'Diferencia neta',  amount: neta,              tone: 'accent',
        note: 'Nómina menos Resumen — compensa un agrupador con otro' },
      { label: 'Diferencia total', amount: diffTotalAmount,  tone: 'error',
        note: 'la que suma el semáforo — no compensa entre agrupadores' },
    ],
  };
}

/**
 * Métricas agregadas por LEGAJO (no por agrupador). runMatching() evalúa el
 * mismo universo de legajos una vez por agrupador (ver matching.js:35,
 * `for (const legajo of todosLosLegajos)` dentro del loop de agrupadores) —
 * sumar rowsTotal/rowsWithDiff de cada agrupador multiplica por la cantidad
 * de agrupadores, y el semáforo termina midiendo el % equivocado (con 100
 * legajos y 10 agrupadores, unitsTotal salía 1000 en vez de 100). Recorre
 * resultsPorGrupo una sola vez y dedupe por legajo — un legajo con
 * diferencia en dos agrupadores cuenta una vez en unitsWithDiff, pero sus dos
 * montos se suman en diffTotalAmount (son discrepancias reales distintas).
 */
function legajoStats(results) {
  const legajosEvaluados = new Set();
  const legajosConDiff = new Set();
  let diffTotalAmount = 0;
  let worstCase = null;
  for (const [grouperId, filas] of Object.entries(results.resultsPorGrupo)) {
    // grouperId sale de Object.entries() y siempre es string, aunque g.id sea
    // number (el id autoincrement de Dexie en la tabla `groupers`, db.js) —
    // comparar sin convertir nunca matchea y el label cae siempre al id crudo.
    const grouperName = results.grouperDefs.find(g => String(g.id) === grouperId)?.name || grouperId;
    for (const f of filas) {
      legajosEvaluados.add(f.legajo);
      if (!f.tieneDiff) continue;
      legajosConDiff.add(f.legajo);
      const abs = Math.abs(f.diffAbs);
      diffTotalAmount += abs;
      if (!worstCase || abs > Math.abs(worstCase.amount)) {
        worstCase = { label: `${grouperName} — leg. ${f.legajo}`, amount: f.diffAbs };
      }
    }
  }
  return { unitsTotal: legajosEvaluados.size, unitsWithDiff: legajosConDiff.size, diffTotalAmount, worstCase };
}

export function summarizeAgrupadores(results) {
  if (results?.error) {
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null, diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const { byGrouper, missingInResumen, missingInNomina } = results;
  const { unitsTotal, unitsWithDiff, diffTotalAmount, worstCase } = legajoStats(results);
  const missingCount = missingInResumen.length + missingInNomina.length;

  return {
    status: (unitsWithDiff > 0 || missingCount > 0) ? 'warning' : 'success',
    headline: `${byGrouper.length} agrupador${byGrouper.length === 1 ? '' : 'es'} · ${unitsTotal} legajo(s) evaluados`
      + (missingCount > 0 ? ` · ${missingCount} legajo(s) faltantes en alguno de los dos archivos` : ''),
    insights: byGrouper.map(g => ({
      type:  g.rowsWithDiff > 0 ? 'warning' : 'success',
      label: `diferencias en ${g.grouperName}`,
      value: g.rowsWithDiff,
    })),
    unit: 'legajo',
    unitsTotal,
    unitsWithDiff,
    diffTotalAmount,
    worstCase,
    contextNote: null,
    resumen: resumenDelControl(results),
  };
}

/**
 * El sub-objeto que dibuja el tablero del Resumen (specs/vista-estandar-resumen.md
 * §3, `resumenStats.js`).
 *
 * **Los conteos y las claves van SIEMPRE en legajo, nunca en fila legajo ×
 * agrupador**: ese denominador inflado es el que ya hizo mentir en verde al
 * semáforo antes de `legajoStats()` (ver el comentario de esa función). Por
 * eso `rows`/`allRows` acá son las filas de `buildPlanillaRows()` — una por
 * legajo —, no `resultsPorGrupo`.
 *
 * **`diffSigned` queda PENDIENTE DE WILLY** (spec §7.6): ¿de más/de menos por
 * legajo con su diferencia NETA (un legajo compensado —un agrupador de más,
 * otro de menos— no aparecería en ningún lado), o por agrupador (el mismo
 * legajo aparecería en los dos lados)? Ninguna de las dos es "la cuenta", así
 * que no se inventa una: 'signed' y 'top' quedan `notApplicable` — 'top'
 * también, porque `topUnits` pinta el importe con el signo a la vista
 * (rojo/ámbar según sea "de más" o "de menos"), y la diferencia TOTAL de un
 * legajo (la suma en valor absoluto) no tiene ese signo sin la misma decisión
 * pendiente.
 *
 * `diffBuckets` y `byCause: agrupador` SÍ se cablean: los dos miden magnitud
 * (cuánto, no de qué lado), y la diferencia TOTAL de cada legajo —la misma
 * de D-087, la que suma el semáforo— es una magnitud sin ambigüedad.
 */
function resumenDelControl(results) {
  const defs = results.grouperDefs || [];

  const filas = buildPlanillaRows(results).map(r => {
    const porAgrupador = defs.map(g => ({ id: g.id, name: g.name, fila: r.porGrupo[g.id] || null }));
    const conDif = porAgrupador.filter(a => a.fila?.tieneDiff);
    const difTotal = conDif.reduce((acc, a) => acc + Math.abs(a.fila.diffAbs), 0);
    // El agrupador que más aporta a la diferencia TOTAL de este legajo — la
    // misma prioridad que usa `badgeDeLegajo()` para la ficha.
    const peor = conDif.reduce((m, a) => (!m || Math.abs(a.fila.diffAbs) > Math.abs(m.fila.diffAbs)) ? a : m, null);
    return { legajo: r.legajo, nombre: r.nombre, difTotal, peor };
  });

  const conDif = filas.filter(f => f.difTotal > 0);

  return resumenStats({
    unit: 'legajo',
    tolerance: results.thresholds?.absoluteAmount ?? null,
    rows: conDif,
    allRows: filas,
    // Magnitud, no signo (ver el JSDoc de arriba): la diferencia TOTAL de cada
    // legajo alimenta los tramos y el corte por causa sin decidir de qué lado
    // está.
    diff: (f) => f.difTotal,
    key: (f) => f.legajo,
    unitLabel: (f) => f.nombre,
    cause: (f) => (f.peor ? { key: String(f.peor.id), label: f.peor.name } : null),
    bridge: results.bridge || null,
    notApplicable: ['signed', 'group', 'top'],
  });
}

export function renderAgrupadoresResults(results, container) {
  if (results?.error) {
    container.innerHTML = `<div class="alert alert--danger" style="margin:0;">❌ ${esc(results.error)}</div>`;
    return;
  }

  const { byGrouper, missingInResumen, missingInNomina, topDifferences } = results;
  const { unitsTotal, unitsWithDiff } = legajoStats(results);
  const missingCount  = missingInResumen.length + missingInNomina.length;

  container.innerHTML = '';

  // Una ficha por LEGAJO — no por legajo × agrupador. Ver la nota de
  // `buildFichasAgrupadores()`.
  const fichas = buildFichasAgrupadores(results);

  renderResumenDetalle(container, {
    controlId: 'agrupadores',
    // Con diferencias lo primero que se ve es por qué falla (§2). El conteo no
    // se recalcula acá: sale del mismo `legajoStats()` que alimenta el semáforo.
    conDiferencias: unitsWithDiff > 0 || missingCount > 0,
    resumen(panel) {
      const tone = (unitsWithDiff === 0 && missingCount === 0) ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: tone === 'ok'
          ? 'Nómina Maestra y Resumen coinciden en todos los agrupadores.'
          : `${unitsWithDiff} legajo(s) con diferencia en algún agrupador${missingCount > 0 ? `, ${missingCount} faltante(s)` : ''}.`,
        body: `${byGrouper.length} agrupador${byGrouper.length === 1 ? '' : 'es'} · ${unitsTotal} legajo(s) evaluados.`,
      });

      renderTiles(panel, [
        { label: 'Agrupadores', value: byGrouper.length },
        { label: 'Legajos evaluados', value: unitsTotal },
        { label: 'Con diferencia', value: unitsWithDiff, tone: unitsWithDiff > 0 ? 'error' : 'ok' },
        { label: 'Legajos faltantes', value: missingCount, tone: missingCount > 0 ? 'error' : 'ok' },
      ]);

      renderChecks(panel, {
        heading: 'Totales por agrupador — Nómina vs Resumen',
        items: byGrouper.map(g => ({
          label: g.grouperName,
          ok: g.rowsWithDiff === 0,
          detail: `$ ${formatAmount(g.totalNomina)} vs $ ${formatAmount(g.totalResumen)}`
            // `detail` se escapa al render (resultBlocks.js): va texto plano, no
            // el `formatDiff` con <span> — el color del chip ya sale de `ok`.
            + (g.rowsWithDiff > 0 ? ` · ${formatDiffText(g.diffAbsolute)} (${g.rowsWithDiff}/${g.rowsTotal} legajos)` : ' · sin diferencia'),
        })),
      });

      if (topDifferences.length > 0) {
        const top = topDifferences.slice(0, 5);
        renderIssues(panel, {
          heading: `Casos para revisar · ${top.length} de ${topDifferences.length}`,
          items: top.map(r => ({
            who: [r.apellido, r.nombre].filter(Boolean).join(', ') || `Legajo ${r.legajo}`,
            sub: `Legajo ${r.legajo}`,
            what: `${r.grouperName}: Nómina $ ${formatAmount(r.sumNom)} vs Resumen $ ${formatAmount(r.sumRes)}`,
            right: formatDiff(r.diffAbs),
          })),
        });
      }
    },
    fichas(panel) { renderAgrupadoresFichas(panel, { fichas, results }); },
    planilla(panel) { renderAgrupadoresPlanilla(panel, results); },
  });
}

function buildPlanillaRows(results) {
  const { resultsPorGrupo, grouperDefs } = results;
  const porLegajo = new Map();

  for (const g of grouperDefs || []) {
    for (const f of (resultsPorGrupo?.[g.id] || [])) {
      let r = porLegajo.get(f.legajo);
      if (!r) {
        r = {
          legajo: f.legajo,
          nombre: [f.apellido, f.nombre].filter(Boolean).join(', ') || '—',
          // Que un legajo esté en un solo archivo es del legajo, no del
          // agrupador: runMatching lo repite igual en las filas de todos.
          soloEnNomina:  f.soloEnNomina,
          soloEnResumen: f.soloEnResumen,
          porGrupo: {},
        };
        porLegajo.set(f.legajo, r);
      }
      r.porGrupo[g.id] = f;
      // El lado que no tiene al legajo sale en `—`, no en 0,00: runMatching suma
      // 0 sobre una fila que no existe, y un 0 ahí se leería como "liquidó cero"
      // (`null` no es `0`). Sin el otro lado tampoco hay diferencia que mostrar:
      // eso es "sin comparar", que es justo el estado en el que cae el legajo.
      r[`nom_${g.id}`] = r.soloEnResumen ? null : f.sumNom;
      r[`res_${g.id}`] = r.soloEnNomina  ? null : f.sumRes;
      r[`dif_${g.id}`] = (r.soloEnNomina || r.soloEnResumen) ? null : f.diffAbs;
      r[`pct_${g.id}`] = (r.soloEnNomina || r.soloEnResumen) ? null : f.diffPct;
    }
  }

  return [...porLegajo.values()].sort((a, b) => {
    const na = parseInt(a.legajo, 10), nb = parseInt(b.legajo, 10);
    if (isFinite(na) && isFinite(nb) && na !== nb) return na - nb;
    return String(a.legajo).localeCompare(String(b.legajo), 'es');
  });
}

/** El redondeo de Excel: abajo de esto los dos archivos dicen lo mismo. */
const CENTAVO = 0.01;

/**
 * En qué estado cerró un legajo, con **la regla del propio control**: el monto,
 * el porcentaje y el marcado de faltantes que el analista puso en "Agrupadores y
 * umbrales" (D-069) ya están adentro de `tieneDiff` — los chips leen eso y no el
 * monto de diferencia del cliente, que acá no manda.
 */
export function estadoDeLegajo(r, grouperDefs) {
  if (r.soloEnNomina || r.soloEnResumen) return 'sinComparar';
  const filas = (grouperDefs || []).map(g => r.porGrupo[g.id]).filter(Boolean);
  if (filas.some(f => f.tieneDiff)) return 'conDif';
  const max = filas.reduce((m, f) => Math.max(m, Math.abs(f.diffAbs ?? 0)), 0);
  return max <= CENTAVO ? 'centavo' : 'margen';
}

/**
 * La celda de diferencia de un agrupador. El umbral de este control no es el
 * monto de diferencia del cliente sino el suyo —monto, porcentaje y "marcar los
 * que faltan", los tres juntos (D-069)—, y eso ya está resuelto en `tieneDiff`.
 * Se le pasa a la pieza como un `eps` que cae del lado que corresponde, para que
 * el badge rojo de la celda y el chip "Con diferencia" nunca cuenten distinto.
 */

/** Suma lo que hay; `null` si no hay ningún valor que sumar (`null` no es `0`). */
function sumOrNull(vals) {
  let acc = null;
  for (const v of vals) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    acc = (acc ?? 0) + v;
  }
  return acc === null ? null : redondear(acc);
}

const SEVERIDAD_DE_ESTADO = { conDif: 'error', sinComparar: 'warn', margen: 'info', centavo: 'ok' };

/** Las fichas del control, una por legajo, en el orden del legajo. */
export function buildFichasAgrupadores(results) {
  const defs = results.grouperDefs || [];
  return buildPlanillaRows(results).map(r => fichaDeLegajo(r, defs, results));
}

function fichaDeLegajo(r, defs, results) {
  const porAgrupador = defs.map(g => ({
    name: g.name,
    fila: r.porGrupo[g.id] || null,
    nom:  r[`nom_${g.id}`],
    res:  r[`res_${g.id}`],
    dif:  r[`dif_${g.id}`],
  }));

  const estado = estadoDeLegajo(r, defs);
  const conDif = porAgrupador.filter(a => a.fila?.tieneDiff);

  // El MISMO monto que este legajo le aporta a `diffTotalAmount` del semáforo:
  // la suma de las diferencias en valor absoluto de los agrupadores que superan
  // el umbral (dos agrupadores con +100 y −100 son dos discrepancias reales
  // distintas, no se cancelan). Sale de `fila.diffAbs` y no de la columna
  // `dif_`, que es `null` cuando el legajo está en un solo archivo.
  const difTotal = conDif.reduce((acc, a) => acc + Math.abs(a.fila.diffAbs), 0);

  // La suma sobre los agrupadores DEL CRUCE: si un concepto estuviera en dos
  // agrupadores cuenta en los dos, igual que en el cruce. El detalle de abajo
  // muestra agrupador por agrupador, así que el total siempre se puede auditar.
  const totalNom = sumOrNull(porAgrupador.map(a => a.nom));
  const totalRes = sumOrNull(porAgrupador.map(a => a.res));
  const neta = (totalNom === null || totalRes === null) ? null : redondear(totalNom - totalRes);

  const peor = conDif.reduce((m, a) => (!m || Math.abs(a.fila.diffAbs) > Math.abs(m.fila.diffAbs)) ? a : m, null);
  // La mayor diferencia que NO llegó al umbral: es lo que distingue, con la
  // ficha cerrada, a un legajo que cuadra al centavo de uno que quedó a 60
  // centavos — los dos suman 0,00 de diferencia contable.
  const mayor = porAgrupador.reduce((m, a) => Math.max(m, Math.abs(a.dif ?? 0)), 0);

  return {
    id: r.legajo,
    unit: r.legajo,
    name: r.nombre,
    estado,
    difTotal,
    severity: SEVERIDAD_DE_ESTADO[estado] || 'info',
    tag: { text: `${defs.length} agrupador${defs.length === 1 ? '' : 'es'}` },
    badge: badgeDeLegajo(r, peor),
    context: [
      r.soloEnNomina  ? 'Sólo en la Nómina Maestra'
        : r.soloEnResumen ? 'Sólo en el archivo Resumen'
        : conDif.length ? `${conDif.length} agrupador${conDif.length === 1 ? '' : 'es'} con diferencia`
        : estado === 'margen' ? `Todos cierran — la mayor diferencia, ${formatAmount(mayor)}, queda abajo del umbral`
        : 'Todos los agrupadores cierran al centavo',
    ],
    // El segundo eje: en qué agrupador no cierra. Son las mismas marcas del
    // desplegable `Marcas ▾` de la barra (§3), para que la pill de la ficha y el
    // filtro digan lo mismo.
    marks: conDif.map(a => ({ text: a.name, tone: 'info' })),
    amountLabel: 'Diferencia total',
    amount: difTotal,
    amountTone: estado === 'conDif' ? 'error' : estado === 'sinComparar' ? 'warn' : undefined,
    body: {
      // 1. La tira: de lo que dice la Nómina Maestra a lo que sobra. La
      //    diferencia NETA es la resta de los dos lados; la diferencia TOTAL es
      //    lo que suma el semáforo, que no compensa un agrupador con otro.
      strip: [
        { label: 'Nómina Maestra', value: totalNom },
        { label: 'Archivo Resumen', value: totalRes },
        { label: 'Diferencia neta', value: neta, invert: true },
        { label: 'Diferencia total', value: difTotal, residuo: difTotal > 0 },
      ],
      // 2. Sin las dos tablas de "cómo debería ser / cómo salió": los dos lados
      //    de este cruce son las columnas Nómina y Resumen del detalle de abajo,
      //    y repetirlos arriba sería la misma tabla dos veces.
      // 3. El detalle: un renglón por agrupador, que es lo que la ficha viene a
      //    resolver — el legajo entero de una, sin buscarlo en N tablas.
      detail: {
        title: 'Agrupador por agrupador — Nómina, Resumen y la diferencia',
        columns: [
          { key: 'agrupador', label: 'Agrupador' },
          { key: 'nom', label: 'Nómina',     num: true },
          { key: 'res', label: 'Resumen',    num: true },
          { key: 'dif', label: 'Diferencia', num: true },
        ],
        rows: porAgrupador.map(a => ({
          agrupador: a.name,
          nom: a.nom, res: a.res, dif: a.dif,
          // Rojo sólo donde hay una diferencia que mirar. Un legajo que está en
          // un solo archivo tiene `tieneDiff` en todos sus agrupadores (así lo
          // marca el cruce), pero no hay nada que comparar: pintarlos en rojo lo
          // haría leer como una diferencia y es "sin comparar" (D-073).
          tone: (a.dif !== null && a.fila?.tieneDiff) ? 'neg' : undefined,
        })),
        foot: { label: 'Diferencia neta — Nómina menos Resumen', value: neta },
      },
      // 4. La conclusión: qué mirar, no un resumen.
      conclusion: conclusionDeLegajo(r, { estado, conDif, difTotal, mayor, results }),
    },
  };
}

function badgeDeLegajo(r, peor) {
  if (r.soloEnNomina)  return { text: 'No está en el archivo Resumen', tone: 'warn' };
  if (r.soloEnResumen) return { text: 'No está en la Nómina Maestra', tone: 'warn' };
  if (peor) return { text: `Diferencia en ${peor.name}`, tone: 'error' };
  return undefined;
}

/** No un resumen: una instrucción. Descarta lo que ya quedó explicado. */
function conclusionDeLegajo(r, { estado, conDif, difTotal, mayor, results }) {
  const umbrales = results.thresholds || DEFAULT_AGRUPADORES_CONFIG.thresholds;

  if (r.soloEnNomina) {
    return {
      tone: 'warn',
      title: 'El legajo está en la Nómina Maestra y no en el archivo Resumen',
      text: 'No hay contra qué compararlo, así que no cierra ni deja de cerrar. Fijate si es un alta que el '
        + 'Resumen todavía no trae, o si el mismo empleado viene con otro número de legajo en uno de los dos '
        + 'archivos — eso último se arregla desde la pantalla del cliente, en cómo se compara el legajo.',
    };
  }
  if (r.soloEnResumen) {
    return {
      tone: 'warn',
      title: 'El legajo está en el archivo Resumen y no en la Nómina Maestra',
      text: 'No hay contra qué compararlo. Fijate si es una baja que la Nómina Maestra ya no trae, o si el '
        + 'mismo empleado viene con otro número de legajo en uno de los dos archivos.',
    };
  }
  if (estado === 'conDif') {
    const nombres = conDif.map(a => a.name).join(', ');
    return {
      tone: 'error',
      title: `${conDif.length} agrupador${conDif.length === 1 ? '' : 'es'} no cierra${conDif.length === 1 ? '' : 'n'}`
        + `: ${formatAmount(difTotal)} en total`,
      text: `Mirá los conceptos de ${nombres} para este legajo en los dos archivos: el cruce suma los mismos `
        + 'códigos de concepto de cada lado, así que la diferencia es un concepto que está en uno y no en el '
        + `otro, o que viene con otro importe. El resto de los agrupadores de este legajo ya cierran.`,
    };
  }
  if (estado === 'margen') {
    return {
      tone: 'info',
      title: `Cierra dentro del margen: la mayor diferencia es ${formatAmount(mayor)}`,
      text: `Está abajo del umbral de ${formatAmount(umbrales.absoluteAmount)} y del `
        + `${formatPct(umbrales.percentage)} que configuraste en "Agrupadores y umbrales", así que no cuenta `
        + 'como diferencia. No hay nada para revisar en este legajo, salvo que quieras bajar el umbral.',
    };
  }
  return {
    tone: 'ok',
    title: 'Cierra al centavo en todos los agrupadores',
    text: 'La Nómina Maestra y el Resumen dicen lo mismo. No hay nada para revisar en este legajo.',
  };
}

/**
 * La solapa Fichas: la barra compartida (los cinco chips de estado, el buscador,
 * `Marcas ▾` con los agrupadores, `Orden ▾`, el KPI de la selección y el
 * `⬇ Exportar ▾` último) más la lista de fichas.
 */
function renderAgrupadoresFichas(panel, { fichas, results }) {
  const defs = results.grouperDefs || [];
  const filas = buildPlanillaRows(results);

  const csvHeaders = ['Legajo', 'Apellido y Nombre', ...defs.flatMap(g => [
    `${g.name} — Nómina`, `${g.name} — Resumen`, `${g.name} — Diferencia`, `${g.name} — Diferencia %`,
  ])];
  const csvRows = () => filas.map(r => [r.legajo, r.nombre, ...defs.flatMap(g => [
    formatAmount(r[`nom_${g.id}`]), formatAmount(r[`res_${g.id}`]),
    formatAmount(r[`dif_${g.id}`]), formatPct(r[`pct_${g.id}`]),
  ])]);

  renderFichasPanel(panel, {
    fichas,
    unitLabel: 'legajos',
    estadoDe: f => f.estado,
    // El segundo eje de este control es EL AGRUPADOR (§3 de la spec): en qué
    // agrupador no cierra el legajo, que es otra pregunta que cómo cerró.
    marcas: defs.map(g => ({
      value: String(g.id),
      label: `Diferencia en ${g.name}`,
      match: f => f.marks.some(m => m.text === g.name),
    })),
    ordenes: [
      { value: 'dif',    label: 'Mayor diferencia', compare: (a, b) => b.difTotal - a.difTotal },
      { value: 'legajo', label: 'Legajo',
        compare: (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }) },
      { value: 'nombre', label: 'Nombre', compare: (a, b) => String(a.name).localeCompare(String(b.name), 'es') },
    ],
    getLabel: f => `${f.id} — ${f.name}`,
    getAmount: f => f.difTotal,
    amountLabel: 'Σ diferencia',
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onCsv:  () => downloadCsv(csvHeaders, csvRows(), 'Cruce_por_Agrupadores.csv'),
      onCopy: () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
  });
}

function celdaDiferencia(r, g, maxDif) {
  const f = r.porGrupo[g.id];
  if (!f || r.soloEnNomina || r.soloEnResumen) {
    return diffBadgeHtml(null, {
      absentLabel: r.soloEnNomina ? 'no está en el resumen' : 'no está en la nómina',
    });
  }
  return diffBadgeHtml(f.diffAbs, { eps: f.tieneDiff ? 0 : Infinity, max: maxDif });
}

/**
 * La planilla: **una fila por legajo**, con una banda por agrupador adentro.
 *
 * Antes eran N tablas, una por agrupador, con una fila por legajo en cada una —
 * o sea legajo × agrupador, ~1000 filas para ~100 empleados, y cada tabla
 * cortada en 100 filas "por rendimiento". Con una banda por agrupador el legajo
 * se lee entero de una, la fila de TOTAL cuenta legajos (que es la unidad que
 * declara el control) y no hay corte: lo que sobra lo pagina la barra.
 */
function renderAgrupadoresPlanilla(panel, results) {
  const { grouperDefs, thresholds } = results;
  const umbralAbs = thresholds?.absoluteAmount ?? DEFAULT_AGRUPADORES_CONFIG.thresholds.absoluteAmount;
  const umbralPct = thresholds?.percentage ?? DEFAULT_AGRUPADORES_CONFIG.thresholds.percentage;

  const rows = buildPlanillaRows(results);
  const maxDif = rows.reduce((m, r) => Math.max(m,
    ...(grouperDefs || []).map(g => Math.abs(r[`dif_${g.id}`] ?? 0))), 0);

  const columns = [
    { key: 'legajo', label: 'Legajo',            band: 'Identificación' },
    { key: 'nombre', label: 'Apellido y Nombre', band: 'Identificación' },
    ...(grouperDefs || []).flatMap(g => [
      { key: `nom_${g.id}`, label: 'Nómina',  sub: 'Nómina Maestra', num: true, band: g.name },
      { key: `res_${g.id}`, label: 'Resumen', sub: 'archivo Resumen', num: true, band: g.name },
      { key: `dif_${g.id}`, label: 'Diferencia', sub: `nómina − resumen · > ${formatAmount(umbralAbs)}`,
        num: true, band: g.name, mag: true,
        cell: r => celdaDiferencia(r, g, maxDif) },
      // El porcentaje no se totaliza: sumar porcentajes de legajos distintos no
      // da nada. La columna cierra la banda igual — es el segundo umbral.
      { key: `pct_${g.id}`, label: 'Diferencia %', sub: `sobre la nómina · > ${formatPct(umbralPct)}`,
        num: true, band: g.name, close: true, total: false,
        cell: r => esc(formatPct(r[`pct_${g.id}`])) },
    ]),
  ];

  const csvHeaders = ['Legajo', 'Apellido y Nombre', ...(grouperDefs || []).flatMap(g => [
    `${g.name} — Nómina`, `${g.name} — Resumen`, `${g.name} — Diferencia`, `${g.name} — Diferencia %`,
  ])];
  const csvRows = () => rows.map(r => [r.legajo, r.nombre, ...(grouperDefs || []).flatMap(g => [
    formatAmount(r[`nom_${g.id}`]), formatAmount(r[`res_${g.id}`]),
    formatAmount(r[`dif_${g.id}`]), formatPct(r[`pct_${g.id}`]),
  ])]);

  renderPlanillaPanel(panel, {
    rows,
    columns,
    unitLabel: 'legajos',
    estadoDe: r => estadoDeLegajo(r, grouperDefs),
    // El segundo eje de este control es EL AGRUPADOR (§3 de la spec): en qué
    // agrupador no cierra el legajo, que es otra pregunta que cómo cerró.
    marcas: (grouperDefs || []).map(g => ({
      value: String(g.id),
      label: `Diferencia en ${g.name}`,
      match: r => !!r.porGrupo[g.id]?.tieneDiff,
    })),
    getLabel: r => `${r.legajo} — ${r.nombre}`,
    searchLabel: 'Buscar legajo o nombre',
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onCsv:  () => downloadCsv(csvHeaders, csvRows(), 'Cruce_por_Agrupadores.csv'),
      onCopy: () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
    emptyText: 'Ningún legajo quedó en este estado.',
    footnote: (shown) => `Mostrando ${shown.length} de ${rows.length} legajo${rows.length === 1 ? '' : 's'}. `
      + `Una banda por agrupador; la diferencia es nómina menos resumen. `
      + `«—» es que ese agrupador no tiene ningún concepto liquidado, no un cero. `
      + `Un legajo que está en un solo archivo sale en «Sin comparar».`,
  });
}

// ── Editor inline de "Agrupadores y umbrales" ────────────────────────────────
// Se monta en el paso Archivos de controlsWizard.js cuando el control está
// seleccionado (mismo patrón que renderRendVsAsientoConfigEditor).

export function renderAgrupadoresConfigEditor(container, opts = {}) {
  const {
    config = DEFAULT_AGRUPADORES_CONFIG,
    groupers = [],
    clientId,
    openByDefault = true,
    onChange = () => {},
  } = opts;

  const current = {
    selectedGrouperIds: config.selectedGrouperIds
      ? config.selectedGrouperIds.filter(id => groupers.some(g => g.id === id))
      : groupers.map(g => g.id),
    thresholds: { ...DEFAULT_AGRUPADORES_CONFIG.thresholds, ...(config.thresholds || {}) },
  };

  const noGroupers = groupers.length === 0;

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Agrupadores y umbrales
    </summary>
    <div style="margin-top:var(--sp-3);">
      ${noGroupers ? `
        <div class="alert alert--warning" style="margin:0 0 var(--sp-3);">
          ⚠️ Este cliente no tiene agrupadores configurados.
          <a href="#/client/${clientId}/groupers">Configurar ahora</a>
        </div>
      ` : `
        <p class="text-sm text-muted" style="margin:0 0 var(--sp-2);">Elegí qué agrupadores incluir en el cruce.</p>
        <div class="pill-group" id="js-agrup-pills" style="margin-bottom:var(--sp-4);">
          ${groupers.map(g => `
            <button type="button" class="pill ${current.selectedGrouperIds.includes(g.id) ? 'pill--active' : ''}"
                    data-grouper-id="${g.id}">${esc(g.name)}</button>
          `).join('')}
        </div>
      `}
      <div style="display:grid;grid-template-columns:auto auto;gap:var(--sp-3) var(--sp-6);align-items:center;max-width:400px;">
        <label class="text-sm">Diferencia en pesos mayor a</label>
        <div style="display:flex;align-items:center;gap:var(--sp-2);">
          <input type="number" class="form-input" id="js-agrup-threshold-abs" min="0" step="1"
                 value="${current.thresholds.absoluteAmount}" style="width:100px;"> <span class="text-sm">$</span>
        </div>
        <label class="text-sm">Diferencia porcentual mayor a</label>
        <div style="display:flex;align-items:center;gap:var(--sp-2);">
          <input type="number" class="form-input" id="js-agrup-threshold-pct" min="0" step="0.01"
                 value="${current.thresholds.percentage}" style="width:100px;"> <span class="text-sm">%</span>
        </div>
        <label class="text-sm">Marcar legajos que faltan</label>
        <input type="checkbox" id="js-agrup-flag-missing" ${current.thresholds.flagMissing ? 'checked' : ''}>
      </div>
    </div>
  `;

  editor.querySelectorAll('[data-grouper-id]').forEach(pill => {
    pill.addEventListener('click', () => {
      const id  = Number(pill.dataset.grouperId);
      const idx = current.selectedGrouperIds.indexOf(id);
      if (idx >= 0) current.selectedGrouperIds.splice(idx, 1);
      else          current.selectedGrouperIds.push(id);
      pill.classList.toggle('pill--active', current.selectedGrouperIds.includes(id));
      onChange({ ...current, selectedGrouperIds: [...current.selectedGrouperIds] });
    });
  });
  editor.querySelector('#js-agrup-threshold-abs').addEventListener('change', (e) => {
    current.thresholds.absoluteAmount = parseFloat(e.target.value) || 0;
    onChange({ ...current });
  });
  editor.querySelector('#js-agrup-threshold-pct').addEventListener('change', (e) => {
    current.thresholds.percentage = parseFloat(e.target.value) || 0;
    onChange({ ...current });
  });
  editor.querySelector('#js-agrup-flag-missing').addEventListener('change', (e) => {
    current.thresholds.flagMissing = e.target.checked;
    onChange({ ...current });
  });

  container.appendChild(editor);
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
