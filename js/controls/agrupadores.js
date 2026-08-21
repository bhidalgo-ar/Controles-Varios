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
import { formatAmount, formatDiff, formatDiffText, formatPct, redondear } from '../utils/currency.js';
import {
  renderVerdict, renderTiles, renderChecks, renderIssues, renderResumenDetalle, enhanceGrid,
} from '../ui/resultBlocks.js';
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

  // Los umbrales viajan en el resultado: son la base de cálculo que la ficha
  // nombra en la conclusión ("abajo del umbral de $ 1,00"). Una corrida vieja no
  // los trae y la pantalla cae en los del default (no se inventa otro número).
  return { resultsPorGrupo, grouperDefs, thresholds, ...insights };
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
  };
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
    detalle(panel) { renderAgrupadoresDetalle(panel, results); },
  });
}

// ── La ficha por LEGAJO (§4 de specs/vista-estandar-resultados.md) ───────────
//
// Es el control que más gana con la ficha. El cruce evalúa el mismo universo de
// legajos una vez por agrupador, así que la tabla plana tiene una fila por
// legajo × agrupador —~1000 filas para ~100 empleados— y un empleado no se
// puede leer entero: hay que buscarlo en N tablas distintas. La ficha invierte
// eso: una tarjeta por legajo, con sus agrupadores adentro.
//
// **La ficha se cuenta como un legajo, y acá no se recalcula nada.** Este
// control ya pagó una vez el error de contar en la unidad equivocada: con 100
// empleados y 10 agrupadores `unitsTotal` salía 1000, y con el denominador
// inflado el umbral del semáforo no se cruza nunca (miente en verde). Los
// conteos y el monto siguen saliendo de `legajoStats()`, que no se toca; la
// lista de fichas es el mismo agrupado por legajo, y la suma de la diferencia
// de todas las fichas da exactamente el `diffTotalAmount` del semáforo.

/**
 * Una fila por LEGAJO, con sus agrupadores adentro (`porGrupo`) y las columnas
 * `nom_`/`res_`/`dif_`/`pct_` de cada uno. Es la forma que necesitan tanto la
 * ficha como la planilla con una banda por agrupador.
 */
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

function renderAgrupadoresDetalle(container, results) {
  const { missingInResumen, missingInNomina, topDifferences, resultsPorGrupo, grouperDefs } = results;

  container.innerHTML = `
    ${(missingInResumen.length || missingInNomina.length) ? `
      <div class="card" style="margin-bottom:var(--sp-5);">
        <div class="card__header"><h3 style="margin:0;">Legajos faltantes</h3></div>
        <div class="card__body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-6);">
            <div>
              <p class="font-semibold" style="margin-bottom:var(--sp-3);">En Nómina pero NO en Resumen (${missingInResumen.length})</p>
              ${missingInResumen.length
                ? `<div class="pill-group">${missingInResumen.map(l => `<span class="badge badge--warning">${esc(l)}</span>`).join('')}</div>`
                : `<p class="text-muted text-sm">Ninguno</p>`}
            </div>
            <div>
              <p class="font-semibold" style="margin-bottom:var(--sp-3);">En Resumen pero NO en Nómina (${missingInNomina.length})</p>
              ${missingInNomina.length
                ? `<div class="pill-group">${missingInNomina.map(l => `<span class="badge badge--danger">${esc(l)}</span>`).join('')}</div>`
                : `<p class="text-muted text-sm">Ninguno</p>`}
            </div>
          </div>
        </div>
      </div>
    ` : ''}

    ${topDifferences.length ? `
      <div class="card" style="margin-bottom:var(--sp-5);">
        <div class="card__header"><h3 style="margin:0;">Top ${topDifferences.length} diferencias más grandes</h3></div>
        <div class="card__body" style="padding:0;overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Legajo</th>
                <th>Apellido y Nombre</th>
                <th>Agrupador</th>
                <th style="text-align:right;">Nómina</th>
                <th style="text-align:right;">Resumen</th>
                <th style="text-align:right;">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              ${topDifferences.map(r => `
                <tr class="row--diff">
                  <td><code>${esc(r.legajo)}</code></td>
                  <td>${esc([r.apellido, r.nombre].filter(Boolean).join(', ') || '—')}</td>
                  <td><span class="badge badge--primary">${esc(r.grouperName || '')}</span></td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumNom)}</td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumRes)}</td>
                  <td style="text-align:right;font-family:monospace;">${formatDiff(r.diffAbs)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <h3 style="margin-bottom:var(--sp-4);">Detalle completo por agrupador</h3>
    ${(grouperDefs || []).map(g => renderGrouperDetail(g, resultsPorGrupo?.[g.id] || [])).join('')}
  `;

  // Sticky Legajo en cada tabla de detalle por agrupador.
  container.querySelectorAll('.card table.data-table').forEach(t => enhanceGrid(t, { stickyCols: 1 }));
}

function renderGrouperDetail(grouper, rows) {
  const rowsWithDiff = rows.filter(r => r.tieneDiff);
  const rowsOk       = rows.filter(r => !r.tieneDiff);

  const SHOW_MAX = 100;
  const rowsToShow = rowsWithDiff.slice(0, SHOW_MAX);
  const extraDiffs = rowsWithDiff.length - rowsToShow.length;

  return `
    <div class="card" style="margin-bottom:var(--sp-4);">
      <div class="card__header">
        <h4 style="margin:0;">${esc(grouper.name)}</h4>
        <div style="display:flex;gap:var(--sp-2);">
          ${rowsWithDiff.length
            ? `<span class="badge badge--warning">${rowsWithDiff.length} con diferencia</span>`
            : `<span class="badge badge--success">Sin diferencias</span>`}
          <span class="badge badge--neutral">${rowsOk.length} OK</span>
        </div>
      </div>
      ${rows.length === 0 ? `<div class="card__body"><p class="text-muted">No hay datos para este agrupador.</p></div>` : `
        <div class="card__body" style="padding:0;overflow-x:auto;">
          <table class="data-table data-table--compact">
            <thead>
              <tr>
                <th>Legajo</th>
                <th>Apellido / Nombre</th>
                <th style="text-align:right;">Nómina</th>
                <th style="text-align:right;">Resumen</th>
                <th style="text-align:right;">Diferencia $</th>
                <th style="text-align:right;">Diferencia %</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rowsToShow.map(r => `
                <tr class="row--diff">
                  <td><code>${esc(r.legajo)}</code></td>
                  <td>${esc([r.apellido, r.nombre].filter(Boolean).join(', ') || '—')}</td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumNom)}</td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumRes)}</td>
                  <td style="text-align:right;font-family:monospace;">${formatDiff(r.diffAbs)}</td>
                  <td style="text-align:right;">${r.diffPct !== null ? formatPct(r.diffPct) : '—'}</td>
                  <td>
                    ${r.soloEnNomina  ? '<span class="badge badge--warning">Solo en nómina</span>'  : ''}
                    ${r.soloEnResumen ? '<span class="badge badge--danger">Solo en resumen</span>'   : ''}
                    ${!r.soloEnNomina && !r.soloEnResumen ? '<span class="badge badge--warning">Diferencia</span>' : ''}
                  </td>
                </tr>
              `).join('')}
              ${extraDiffs > 0 ? `
                <tr><td colspan="7" class="text-center text-muted text-sm" style="padding:var(--sp-3);">
                  ... y ${extraDiffs} fila(s) más con diferencia (limitado a ${SHOW_MAX} por rendimiento)
                </td></tr>
              ` : ''}
              ${rowsOk.length > 0 ? `
                <tr><td colspan="7" style="padding:var(--sp-2) var(--sp-4);background:var(--color-success-bg);">
                  <span class="text-sm text-success">✅ ${rowsOk.length} legajo(s) sin diferencias</span>
                </td></tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
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
