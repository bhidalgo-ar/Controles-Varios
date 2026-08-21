// rendVsTabu.js — Control 5: Rendimiento vs Tabulado (RendvsTabu)
import { diffStats } from './semaforo.js';
import { isDiff } from './tolerance.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { createResultsToolbar, wireTableTools, estadoDeDiferencia } from '../ui/tableTools.js';
import { renderFichasPanel } from '../ui/fichaList.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { buildColByCode } from './tabCodes.js';
import { formatAmount as fmt, diffOrNull, toNum } from '../utils/currency.js';
import { periodSuffix, periodToLabel } from '../utils/dates.js';
import {
  renderVerdict, renderTiles, renderIssues, renderResumenDetalle, diffCellHtml,
  mvClass, mvArrow, fmtSigned,
} from '../ui/resultBlocks.js';
//
// Compara el Reporte de Rendimiento de M4 (por CC) contra el Tabulado.
// Calcula PRECIO, ASIG. ESTÍMULO, CARGAS SS, PROV. MES, PROV. CCSS MES
// directamente de las columnas individuales del Tabulado (ej: "1003-SUELDO"),
// usando los conceptos definidos en "Detalles de conceptos".

// ── Conceptos del Tabulado por categoría ─────────────────────────────────────
// sign: +1 suma, -1 resta
// Fuente: pestaña "Detalles de conceptos" del archivo de referencia.

export const DEFAULT_CONCEPT_CONFIG = {
  precio: [
    { code: '1153', sign: 1 }, { code: '2000', sign: 1 }, { code: '2996', sign: 1 },
    { code: '3025', sign: 1 }, { code: '3999', sign: 1 }, { code: '4897', sign: 1 },
    { code: '8505', sign: 1 }, { code: '8508', sign: 1 }, { code: '5800', sign: 1 },
    { code: '1003', sign: 1 }, { code: '1004', sign: 1 }, { code: '1163', sign: 1 },
    { code: '1017', sign: 1 }, { code: '4092', sign: 1 }, { code: '4110', sign: 1 },
    { code: '4091', sign: 1 }, { code: '4130', sign: 1 }, { code: '4473', sign: 1 },
  ],
  estimulo: [
    { code: '1006', sign: 1 }, { code: '1009', sign: 1 },
  ],
  cargas: [
    { code: '6050', sign:  1 }, { code: '6093', sign:  1 }, { code: '6100', sign:  1 },
    { code: '6110', sign: -1 }, { code: '6120', sign:  1 }, { code: '6130', sign: -1 },
    { code: '6134', sign:  1 }, { code: '6145', sign:  1 }, { code: '7015', sign:  1 },
  ],
  provMes: [
    { code: '3670', sign:  1 }, { code: '3674', sign:  1 }, { code: '3570', sign:  1 },
    { code: '3574', sign: -1 }, { code: '7291', sign:  1 }, { code: '7290', sign: -1 },
  ],
  provCcss: [
    { code: '3672', sign:  1 }, { code: '3676', sign:  1 }, { code: '3572', sign:  1 },
    { code: '3576', sign: -1 }, { code: '7292', sign:  1 }, { code: '7289', sign: -1 },
  ],
};

// ── Definición de columnas de comparación ────────────────────────────────────

// Exportado para que js/exports/contracts.js derive de ACÁ las columnas de los
// contratos de Rend vs Tabulado / Rend vs Asiento / Rend x EE (las tres usan
// las mismas 6 categorías con las mismas etiquetas), en vez de mantener una
// cuarta copia de la lista. Ojo con el ciclo de módulos: contracts.js importa
// este archivo, así que este archivo NO puede importar contracts.js con un
// `import` estático — si alguna vez lo necesita, usar `import()` dinámico
// adentro de la función, como hace nr.js (ver la nota de D-041 ahí).
export const COLS = [
  { key: 'precio',   label: 'PRECIO',          rKey: 'rPrecio',   tKey: 'tPrecio',   dKey: 'dPrecio',
    hdr: 'rgba(0,112,192,0.22)',  bg: 'rgba(0,112,192,0.08)',  xlHdr: 'FFCCE0F5', xlBg: 'FFF0F6FD' },
  { key: 'estimulo', label: 'ASIG. ESTÍMULO',  rKey: 'rEstimulo', tKey: 'tEstimulo', dKey: 'dEstimulo',
    hdr: 'rgba(0,156,64,0.22)',   bg: 'rgba(0,156,64,0.08)',   xlHdr: 'FFC9EDD8', xlBg: 'FFEDF9F2' },
  { key: 'cargas',   label: 'CARGAS SS',       rKey: 'rCargas',   tKey: 'tCargas',   dKey: 'dCargas',
    hdr: 'rgba(192,0,0,0.22)',    bg: 'rgba(192,0,0,0.08)',    xlHdr: 'FFF5CCCC', xlBg: 'FFFCEAEA' },
  { key: 'provMes',  label: 'PROV. MES',       rKey: 'rProvMes',  tKey: 'tProvMes',  dKey: 'dProvMes',
    hdr: 'rgba(0,176,240,0.22)',  bg: 'rgba(0,176,240,0.08)',  xlHdr: 'FFC7EDF9', xlBg: 'FFEAF7FD' },
  { key: 'provCcss', label: 'PROV. CCSS MES',  rKey: 'rProvCcss', tKey: 'tProvCcss', dKey: 'dProvCcss',
    hdr: 'rgba(0,70,127,0.22)',   bg: 'rgba(0,70,127,0.08)',   xlHdr: 'FFCCDDED', xlBg: 'FFEAF2F8' },
  { key: 'total',    label: 'COSTO TOTAL',     rKey: 'rTotal',    tKey: 'tTotal',    dKey: 'dTotal',
    hdr: 'rgba(64,64,64,0.18)',   bg: 'rgba(64,64,64,0.07)',   xlHdr: 'FFDCDCDC', xlBg: 'FFF2F2F2' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(v) { return v != null ? String(v).trim() : ''; }


function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Normaliza código de CC: quita ceros iniciales → "0011" y "11" se comparan igual
function normCCCode(v) {
  const s = String(v ?? '').trim().replace(/^0+/, '');
  return s || null;
}

// Sin acentos: el nombre de CC es el camino de matching cuando el cliente no
// mapea el código, y "Administración" tiene que matchear contra "Administracion".
// Igual que `normCCName` de rendVsAsiento.js, su gemelo.
function normCCName(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    || null;
}

// Qué cuenta como diferencia sale del monto del cliente (D-069): lo pone el
// analista en el panel "Umbrales" y vale para los 19 controles.
const hasDiff = d => Number.isFinite(d) && isDiff(d);


// ── summarize ─────────────────────────────────────────────────────────────────

export function summarizeRendVsTabu(results) {
  const s      = results.summary;
  const anyDiff = COLS.some(c => s[`dif${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}`] > 0);

  // Unidad de cruce = centro de costo (CC), no legajo. Se usan sólo las 5
  // categorías componentes (no COSTO TOTAL, que es la suma de esas 5) para no
  // contar dos veces la misma diferencia al sumar el monto total en juego.
  const amountFields = COLS
    .filter(c => c.key !== 'total')
    .map(c => ({ key: c.dKey, get: r => r[c.dKey] }));
  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    results.rows, amountFields, row => row.ccName || row.ccCode
  );

  return {
    status:   anyDiff ? 'warning' : 'success',
    headline: `${s.total} centros de costo · ${s.sinTabData} sin datos en Tabulado`,
    insights: COLS.map(c => {
      const k = `dif${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}`;
      return {
        type:  s[k] > 0 ? 'warning' : 'success',
        label: `diferencias ${c.label}`,
        value: s[k],
      };
    }),
    unit: 'cc',
    unitsTotal: s.total,
    unitsWithDiff,
    diffTotalAmount,
    worstCase,
    contextNote: null,
  };
}

// ── runRendVsTabu ─────────────────────────────────────────────────────────────

export function runRendVsTabu(rendRows, tabRows, mapping) {
  const rm = mapping.rend;
  const tm = mapping.tab;

  // Usar agrupación personalizada si fue configurada, si no los defaults
  const conceptConfig = mapping.conceptGrouping || DEFAULT_CONCEPT_CONFIG;

  // Construir mapa código → columna desde los headers del Tabulado
  const sampleRow  = tabRows[0] || {};
  const colByCode  = buildColByCode(sampleRow);

  // Para cada categoría, resolver qué columnas del Tabulado corresponden
  const catCols = {};
  for (const [catKey, entries] of Object.entries(conceptConfig)) {
    catCols[catKey] = entries
      .map(e => ({ col: colByCode[e.code] || null, sign: e.sign, code: e.code }))
      .filter(e => e.col !== null);
  }

  // Columnas CC del Tabulado (del mapping estándar del tabulado)
  const tabCcCodeCol = tm.idCCColumn || null;
  const tabCcNameCol = tm.ccColumn   || null;

  // ── Agrupar Tabulado por CC ────────────────────────────────────────────────
  const tabGroups = new Map();  // mapKey → bucket de sumas

  for (const row of tabRows) {
    const rawCode = tabCcCodeCol ? norm(row[tabCcCodeCol]) : '';
    const rawName = tabCcNameCol ? norm(row[tabCcNameCol]) : '';
    const codeKey = normCCCode(rawCode);
    const nameKey = normCCName(rawName);
    const mapKey  = codeKey || nameKey;
    if (!mapKey) continue;

    if (!tabGroups.has(mapKey)) {
      tabGroups.set(mapKey, {
        codeKey, nameKey,
        precio: 0, estimulo: 0, cargas: 0, provMes: 0, provCcss: 0,
        // Lo mismo que las cinco categorías, pero abierto concepto por concepto:
        // es lo que hace que la diferencia de un centro de costo se pueda
        // descomponer en la ficha ("de dónde salen los $X de CARGAS SS"). No es
        // otra cuenta — es la MISMA suma, guardada antes de acumularse en la
        // categoría. La clave lleva la categoría adelante porque un mismo código
        // puede estar configurado en dos categorías distintas.
        byCode: {},
      });
    }
    const g = tabGroups.get(mapKey);

    for (const catKey of ['precio', 'estimulo', 'cargas', 'provMes', 'provCcss']) {
      for (const { col, sign, code } of (catCols[catKey] || [])) {
        const aporte = (toNum(row[col]) ?? 0) * sign;
        g[catKey] += aporte;
        const k = `${catKey}|${code}`;
        g.byCode[k] = (g.byCode[k] ?? 0) + aporte;
      }
    }
  }

  // COSTO TOTAL por grupo = suma de categorías (sin retiros)
  for (const g of tabGroups.values()) {
    g.total = g.precio + g.estimulo + g.cargas + g.provMes + g.provCcss;
  }

  // Índice secundario por nombre (fallback en el matching)
  const tabByName = new Map();
  for (const [, data] of tabGroups) {
    if (data.nameKey && !tabByName.has(data.nameKey)) tabByName.set(data.nameKey, data);
  }

  // ── Cruzar con Rendimiento ─────────────────────────────────────────────────
  const rows = [];

  for (const rRow of rendRows) {
    const ccCode = norm(rRow[rm.ccCodeColumn]);
    const ccName = norm(rRow[rm.ccNameColumn]);
    if (!ccName && !ccCode) continue;
    if (ccName.toLowerCase().startsWith('total')) continue;

    const rPrecio   = toNum(rRow[rm.precioColumn]);
    const rEstimulo = toNum(rRow[rm.estimuloColumn]);
    const rCargas   = toNum(rRow[rm.cargasColumn]);
    const rProvMes  = toNum(rRow[rm.provMesColumn]);
    const rProvCcss = toNum(rRow[rm.provCcssColumn]);
    const rTotal    = (rPrecio ?? 0) + (rEstimulo ?? 0) + (rCargas ?? 0) + (rProvMes ?? 0) + (rProvCcss ?? 0);

    // Matching: código primero, nombre como fallback
    const codeKey = normCCCode(ccCode);
    const nameKey = normCCName(ccName);
    const tab = (codeKey && tabGroups.get(codeKey))
             || (nameKey && tabByName.get(nameKey))
             || null;

    rows.push({
      ccCode, ccName,
      rPrecio, rEstimulo, rCargas, rProvMes, rProvCcss, rTotal,
      tPrecio:   tab ? tab.precio   : null,
      tEstimulo: tab ? tab.estimulo : null,
      tCargas:   tab ? tab.cargas   : null,
      tProvMes:  tab ? tab.provMes  : null,
      tProvCcss: tab ? tab.provCcss : null,
      tTotal:    tab ? tab.total    : null,
      dPrecio:   diffOrNull(tab?.precio, rPrecio),
      dEstimulo: diffOrNull(tab?.estimulo, rEstimulo),
      dCargas:   diffOrNull(tab?.cargas, rCargas),
      dProvMes:  diffOrNull(tab?.provMes, rProvMes),
      dProvCcss: diffOrNull(tab?.provCcss, rProvCcss),
      dTotal:    diffOrNull(tab?.total, rTotal),
      // El Tabulado abierto concepto por concepto, para la ficha del CC. Un CC
      // que no está en el Tabulado no tiene ninguno: `null`, no `{}`.
      tByCode:   tab ? tab.byCode : null,
      sinTabData: tab === null,
    });
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const summary = {
    total:       rows.length,
    sinTabData:  rows.filter(r => r.sinTabData).length,
    difPrecio:   rows.filter(r => hasDiff(r.dPrecio)).length,
    difEstimulo: rows.filter(r => hasDiff(r.dEstimulo)).length,
    difCargas:   rows.filter(r => hasDiff(r.dCargas)).length,
    difProvMes:  rows.filter(r => hasDiff(r.dProvMes)).length,
    difProvCcss: rows.filter(r => hasDiff(r.dProvCcss)).length,
    difTotal:    rows.filter(r => hasDiff(r.dTotal)).length,
  };

  return { summary, rows, period: mapping.period || '', meta: { conceptConfig, colByCode } };
}

// ── renderRendVsTabuResults ───────────────────────────────────────────────────

export function renderRendVsTabuResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const totalsAll = {};
  for (const c of COLS) totalsAll[c.dKey] = rows.reduce((s, r) => s + (r[c.dKey] ?? 0), 0);
  const componentCols = COLS.filter(c => c.key !== 'total');
  const ccsWithDiff = rows.filter(r => componentCols.some(c => hasDiff(r[c.dKey])));
  const okCount = rows.length - ccsWithDiff.length;
  const sinTabCount = rows.filter(r => r.sinTabData).length;

  container.innerHTML = '';

  // Una ficha por CENTRO DE COSTO — la unidad que declara el control (`unit:
  // 'cc'`), no el legajo.
  const fichas = buildFichasRendVsTabu(results);

  renderResumenDetalle(container, {
    controlId: 'rend_vs_tabu',
    // Con diferencias lo primero que se ve es por qué falla (§2). El conteo es
    // el mismo `ccsWithDiff` del veredicto: acá no se recuenta nada.
    conDiferencias: ccsWithDiff.length > 0,
    resumen(panel) {
      const tone = ccsWithDiff.length === 0 ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: ccsWithDiff.length === 0
          ? 'Rendimiento y Tabulado coinciden en todos los centros de costo.'
          : `${ccsWithDiff.length} de ${rows.length} centros de costo tienen diferencia.`,
        body: ccsWithDiff.length === 0
          ? `${rows.length} centro${rows.length === 1 ? '' : 's'} de costo verificados, sin diferencias.`
          : `Diferencia total de <strong>${fmt(totalsAll.dTotal)}</strong> en COSTO TOTAL (Tab − Rend). El detalle completo está en la solapa «Detalle».`,
      });

      renderTiles(panel, [
        { label: 'Centros de costo', value: rows.length,
          sub: sinTabCount > 0 ? `${sinTabCount} sin datos en Tabulado` : 'todos con datos en Tabulado' },
        { label: 'Sin diferencia', value: okCount, tone: 'ok' },
        { label: 'Con diferencia', value: ccsWithDiff.length, tone: ccsWithDiff.length > 0 ? 'error' : 'ok' },
        { label: 'Dif. COSTO TOTAL', value: fmt(totalsAll.dTotal), tone: hasDiff(totalsAll.dTotal) ? 'error' : 'ok' },
      ]);

      if (ccsWithDiff.length > 0) {
        const top = [...ccsWithDiff].sort((a, b) => Math.abs(b.dTotal ?? 0) - Math.abs(a.dTotal ?? 0)).slice(0, 5);
        renderIssues(panel, {
          heading: `Casos para revisar · ${top.length} de ${ccsWithDiff.length}`,
          items: top.map(r => {
            const diffCols = componentCols.filter(c => hasDiff(r[c.dKey]))
              .sort((a, b) => Math.abs(r[b.dKey]) - Math.abs(r[a.dKey]));
            const worst = diffCols[0];
            const rest = diffCols.length - 1;
            return {
              sev: diffCols.length > 1 ? 'hi' : 'lo',
              who: r.ccName || `CC ${r.ccCode}`,
              sub: r.ccName ? `CC ${r.ccCode}` : null,
              what: `${worst.label}: diferencia de ${fmt(Math.abs(r[worst.dKey]))}`,
              why: rest > 0 ? `y ${rest} columna${rest === 1 ? '' : 's'} más con diferencia (Tab − Rend).` : 'Tab − Rend.',
              right: `<span class="${mvClass(r[worst.dKey])}">${mvArrow(r[worst.dKey])} ${fmtSigned(r[worst.dKey])}</span>`,
            };
          }),
        });
      }
    },
    fichas(panel) { renderRendVsTabuFichas(panel, { fichas, results }); },
    detalle(panel) { renderRendVsTabuDetalle(panel, { rows, results }); },
  });
}

// ── La ficha por CENTRO DE COSTO (§4 de specs/vista-estandar-resultados.md) ──
//
// La unidad de este control es el CC y no el legajo: el Reporte de Rendimiento
// informa por centro de costo, y el Tabulado se agrupa por CC para poder
// cruzarlo. Así que la línea de identidad de la ficha lleva el NOMBRE DEL CENTRO
// DE COSTO, donde en los controles por legajo va el nombre del empleado.
//
// Las dos tablas de arriba no son simétricas, y es a propósito: el Tabulado se
// puede abrir concepto por concepto (de ahí sale cada peso, con su código) y el
// Reporte de Rendimiento no — informa las cinco categorías ya sumadas y nada
// más. Repetir las cinco categorías de los dos lados no agregaría nada; la
// comparación categoría por categoría, con la diferencia al lado, está en la
// tabla de detalle de abajo.
//
// Acá no se recalcula nada: los importes y las diferencias son los mismos
// `r*`/`t*`/`d*` que ya calculó `runRendVsTabu()`, y el desglose por concepto es
// la misma suma guardada antes de acumularse en la categoría.

/** El redondeo de Meta4: abajo de esto los dos archivos dicen lo mismo. */
const CENTAVO = 0.01;

const COMPONENT_COLS = COLS.filter(c => c.key !== 'total');
const COL_TOTAL = COLS[COLS.length - 1];

const SEVERIDAD_DE_ESTADO = { conDif: 'error', sinComparar: 'warn', margen: 'info', centavo: 'ok' };

/**
 * En qué estado cerró un centro de costo: gana el peor de sus CINCO categorías
 * componentes. COSTO TOTAL queda afuera porque es la suma de esas cinco y
 * contaría dos veces la misma diferencia — el mismo criterio que usa
 * `summarizeRendVsTabu()` para el monto en juego.
 *
 * (Cuando entre la barra estándar del lote Meta4 esto es `estadoDeFila()` de
 * `tableTools.js`, que hace exactamente esto para cualquier control que compare
 * varias columnas por fila.)
 */
function estadoDeCentroDeCosto(r) {
  const orden = ['conDif', 'sinComparar', 'margen', 'centavo'];
  let peor = null;
  for (const c of COMPONENT_COLS) {
    const e = estadoDeDiferencia(r[c.dKey]);
    if (peor === null || orden.indexOf(e) < orden.indexOf(peor)) peor = e;
  }
  return peor ?? 'sinComparar';
}

/** La mayor de las cinco diferencias, en valor absoluto. */
function mayorDiferencia(r) {
  return COMPONENT_COLS.reduce((m, c) => Math.max(m, Math.abs(r[c.dKey] ?? 0)), 0);
}

/** '1003-SUELDO' → 'SUELDO'. El código va aparte, entre paréntesis. */
function nombreDeConcepto(header, code) {
  const s = String(header ?? '').trim();
  const sinCodigo = s.replace(/^\d+[-_]\s*/, '');
  return sinCodigo || `Concepto ${code}`;
}

/** Las fichas del control, una por centro de costo, en el orden del Rendimiento. */
export function buildFichasRendVsTabu(results) {
  return (results.rows || []).map(r => fichaDeCentroDeCosto(r, results));
}

function fichaDeCentroDeCosto(r, results) {
  const estado = estadoDeCentroDeCosto(r);
  const conDif = COMPONENT_COLS.filter(c => hasDiff(r[c.dKey]));
  const fuera = hasDiff(r.dTotal);
  const peor = conDif.reduce((m, c) => (!m || Math.abs(r[c.dKey]) > Math.abs(r[m.dKey])) ? c : m, null);
  const periodo = periodToLabel(results.period);

  return {
    id: r.ccCode || r.ccName,
    unit: r.ccCode || '—',
    name: r.ccName || `Centro de costo ${r.ccCode}`,
    estado,
    severity: SEVERIDAD_DE_ESTADO[estado] || 'info',
    tag: periodo ? { text: periodo } : undefined,
    badge: r.sinTabData
      ? { text: 'Sin datos en el Tabulado', tone: 'warn' }
      : peor ? { text: `Diferencia en ${peor.label}`, tone: 'error' } : undefined,
    context: [
      r.sinTabData
        ? 'El centro de costo no aparece en el Tabulado'
        : conDif.length
          ? `${conDif.length} de ${COMPONENT_COLS.length} categorías con diferencia`
          : estado === 'margen'
            ? `Cierran las cinco — la mayor diferencia, ${fmt(mayorDiferencia(r))}, queda abajo del monto del cliente`
            : 'Las cinco categorías cierran al centavo',
    ],
    // El segundo eje: en qué categoría no cierra. Las mismas marcas del
    // desplegable `Marcas ▾` de la barra (§3).
    marks: conDif.map(c => ({ text: c.label, tone: 'info' })),
    amountLabel: 'Diferencia COSTO TOTAL',
    amount: r.dTotal,
    amountTone: fuera ? 'error' : r.sinTabData ? 'warn' : undefined,
    body: {
      // 1. La tira: de lo que dice el Tabulado a lo que sobra contra el Reporte.
      strip: [
        { label: 'COSTO TOTAL del Tabulado', value: r.tTotal },
        { label: 'COSTO TOTAL del Rendimiento', value: r.rTotal },
        { label: 'Diferencia — Tab menos Rend', value: r.dTotal, invert: !fuera, residuo: fuera },
      ],
      // 2. Las dos tablas: a la izquierda cómo debería ser (el Tabulado, que es
      //    la liquidación, abierto concepto por concepto), a la derecha cómo
      //    salió (lo que informó el Reporte de Rendimiento).
      // Cada tabla cierra en un pie de color: el teórico en oscuro y el residuo
      // en rojo (§4). Los dos totales ya están arriba, en la tira.
      tables: [
        tablaDeConceptos(r, results),
        {
          title: 'Cómo salió — el Reporte de Rendimiento',
          rows: COMPONENT_COLS.map(c => ({ label: c.label, value: r[c.rKey] })),
          foot: { label: 'Diferencia — Tab menos Rend', value: r.dTotal, tone: fuera ? 'error' : 'ink' },
        },
      ],
      // 3. El detalle: un renglón por concepto del reporte, con lo que dice cada
      //    archivo y la resta. Es la comparación que hace el control.
      detail: {
        title: 'Categoría por categoría — Rendimiento, Tabulado y la diferencia',
        columns: [
          { key: 'categoria', label: 'Concepto' },
          { key: 'rend',      label: 'Rendimiento', num: true },
          { key: 'tab',       label: 'Tabulado',    num: true },
          { key: 'dif',       label: 'Diferencia',  num: true },
        ],
        rows: COMPONENT_COLS.map(c => ({
          categoria: c.label,
          rend: r[c.rKey],
          tab:  r[c.tKey],
          dif:  r[c.dKey],
          tone: hasDiff(r[c.dKey]) ? 'neg' : undefined,
        })),
        foot: { label: `Diferencia de ${COL_TOTAL.label} — la suma de las cinco`, value: r.dTotal },
      },
      // 4. La conclusión: qué mirar, no un resumen.
      conclusion: conclusionDeCentroDeCosto(r, { conDif, peor, results }),
    },
  };
}

/**
 * La tabla de la izquierda: el Tabulado de este CC, concepto por concepto y con
 * su código. Se listan los conceptos que aportan algo y los que el control no
 * pudo resolver — un concepto configurado cuya columna no está en el Tabulado no
 * se completa con 0,00 en silencio, sale en `—` y se dice cuántos son.
 */
function tablaDeConceptos(r, results) {
  const { conceptConfig, colByCode } = results.meta || {};
  const foot = { label: 'COSTO TOTAL del Tabulado', value: r.tTotal, tone: 'ink' };

  if (r.sinTabData || !conceptConfig || !colByCode) {
    return {
      title: 'Cómo debería ser — el Tabulado, concepto por concepto',
      rows: [{ label: r.sinTabData
        ? 'Este centro de costo no aparece en el Tabulado'
        : 'La corrida no guardó qué conceptos componen cada categoría', value: null }],
      foot,
    };
  }

  const rows = [];
  let enCero = 0;
  for (const c of COMPONENT_COLS) {
    for (const e of (conceptConfig[c.key] || [])) {
      const header = colByCode[e.code];
      // Un concepto configurado que no está en el Tabulado: `—`, no 0,00.
      if (!header) {
        rows.push({ label: `${c.label} · concepto no hallado en el Tabulado`, code: e.code, value: null });
        continue;
      }
      const valor = r.tByCode?.[`${c.key}|${e.code}`] ?? null;
      if (valor === null || valor === 0) { enCero++; continue; }
      rows.push({ label: `${nombreDeConcepto(header, e.code)}${e.sign === -1 ? ' (resta)' : ''}`, code: e.code, value: valor });
    }
  }
  if (enCero > 0) {
    rows.push({ label: `Otros ${enCero} concepto${enCero === 1 ? '' : 's'} configurado${enCero === 1 ? '' : 's'}, sin importe en este centro de costo`, value: 0 });
  }
  if (rows.length === 0) rows.push({ label: 'Ningún concepto configurado para este control', value: null });

  return { title: 'Cómo debería ser — el Tabulado, concepto por concepto', rows, foot };
}

/** No un resumen: una instrucción. Descarta lo que ya quedó explicado. */
function conclusionDeCentroDeCosto(r, { conDif, peor, results }) {
  if (r.sinTabData) {
    return {
      tone: 'warn',
      title: 'El centro de costo no está en el Tabulado',
      text: 'No hay contra qué comparar lo que informa el Reporte de Rendimiento, así que no cierra ni deja '
        + 'de cerrar. Fijate si el código de centro de costo viene distinto en los dos archivos, o si en el '
        + 'Paso 2 quedó sin mapear la columna de centro de costo del Tabulado.',
    };
  }
  if (conDif.length > 0) {
    const nombres = conDif.map(c => c.label).join(', ');
    return {
      tone: 'error',
      title: `${conDif.length} categoría${conDif.length === 1 ? '' : 's'} no cierra${conDif.length === 1 ? '' : 'n'}`
        + ` — la mayor es ${peor.label}, ${fmt(Math.abs(r[peor.dKey]))}`,
      text: `Mirá los conceptos de ${nombres} en la tabla de arriba: el Tabulado los suma uno por uno y el `
        + 'Reporte de Rendimiento informa el total ya armado, así que la diferencia es un concepto que el '
        + 'reporte no está tomando, o que quedó fuera de la agrupación en "Detalles de conceptos". '
        + `${COMPONENT_COLS.length - conDif.length} de las ${COMPONENT_COLS.length} categorías ya cierran.`,
    };
  }
  const mayor = mayorDiferencia(r);
  if (mayor > CENTAVO) {
    return {
      tone: 'info',
      title: `Cierra dentro del margen: la mayor diferencia es ${fmt(mayor)}`,
      text: 'Está abajo del monto de diferencia que configuraste para este cliente, así que no cuenta como '
        + 'diferencia. No hay nada para revisar en este centro de costo.',
    };
  }
  return {
    tone: 'ok',
    title: 'Cierra al centavo en las cinco categorías',
    text: 'El Reporte de Rendimiento y el Tabulado dicen lo mismo. No hay nada para revisar en este centro '
      + 'de costo.',
  };
}

/**
 * La solapa Fichas: la barra compartida (los cinco chips de estado, el buscador,
 * `Marcas ▾` con las categorías, `Orden ▾`, el KPI de la selección y el
 * `⬇ Exportar ▾` último) más la lista de fichas.
 */
function renderRendVsTabuFichas(panel, { fichas, results }) {
  const { rows } = results;
  const csvHeaders = ['CC', 'Centro de Costo', ...COLS.flatMap(c => [`${c.label} (Rend)`, `${c.label} (Tab)`, `${c.label} (CTRL)`])];
  const csvRows = () => rows.map(r => [r.ccCode, r.ccName, ...COLS.flatMap(c => [fmt(r[c.rKey]), fmt(r[c.tKey]), fmt(r[c.dKey])])]);

  renderFichasPanel(panel, {
    fichas,
    unitLabel: 'centros de costo',
    estadoDe: f => f.estado,
    // El segundo eje de este control es LA CATEGORÍA (§3 de la spec): en cuál de
    // las cinco no cierra el centro de costo, que es otra pregunta que cómo cerró.
    marcas: COMPONENT_COLS.map(c => ({
      value: c.key,
      label: `Diferencia en ${c.label}`,
      match: f => f.marks.some(m => m.text === c.label),
    })),
    ordenes: [
      { value: 'dif',    label: 'Mayor diferencia',
        compare: (a, b) => Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0) },
      { value: 'cc',     label: 'Centro de costo',
        compare: (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }) },
      { value: 'nombre', label: 'Nombre', compare: (a, b) => String(a.name).localeCompare(String(b.name), 'es') },
    ],
    getLabel: f => `${f.id} — ${f.name}`,
    searchLabel: 'Buscar centro de costo',
    searchPlaceholder: 'Código o nombre de CC…',
    getAmount: f => f.amount,
    amountLabel: 'Σ diferencia COSTO TOTAL',
    onExport: (exportEl) => renderExportMenu(exportEl, {
      onExcel: () => exportRendVsTabuToXlsx(results),
      onCsv:   () => downloadCsv(csvHeaders, csvRows(), `RendVsTabulado_${periodSuffix(results.period)}.csv`),
      onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
    }),
  });
}

function renderRendVsTabuDetalle(container, { rows, results }) {
  // Acumuladores para fila de totales
  const totals = {};
  for (const c of COLS) {
    totals[c.rKey] = 0;
    totals[c.tKey] = 0;
  }
  for (const r of rows) {
    for (const c of COLS) {
      totals[c.rKey] += r[c.rKey] ?? 0;
      totals[c.tKey] += r[c.tKey] ?? 0;
    }
  }

  // §11.1 — de las 5 columnas componentes, ocultar las que no tienen ninguna
  // diferencia en ningún CC (COSTO TOTAL siempre se muestra: es el agregado).
  // Si no hay ninguna diferencia en absoluto, se muestran todas — no tiene
  // sentido "ocultar todo".
  const componentCols = COLS.filter(c => c.key !== 'total');
  const componentsWithDiff = componentCols.filter(c => rows.some(r => hasDiff(r[c.dKey])));
  const visibleComponents = componentsWithDiff.length > 0 ? componentsWithDiff : componentCols;
  const hiddenCount = componentCols.length - visibleComponents.length;
  const cols = [...visibleComponents, COLS[COLS.length - 1]]; // + COSTO TOTAL al final, siempre

  // ── Encabezados ───────────────────────────────────────────────────────────
  const { conceptConfig: cc, colByCode: cbc } = results.meta || {};
  const hdr1 = cols.map(c => {
    if (c.key === 'total' || !cc || !cbc) {
      return `<th colspan="3" style="text-align:center;background:${c.hdr};">${esc(c.label)}</th>`;
    }
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
    return `<th colspan="3" style="text-align:center;background:${c.hdr};">${esc(c.label)}${conceptDetail}</th>`;
  }).join('');

  const hdr2 = cols.map(c => `
    <th style="text-align:right;background:${c.hdr};">Rend</th>
    <th style="text-align:right;background:${c.hdr};">Tab</th>
    <th style="text-align:right;background:${c.hdr};"><strong>CTRL</strong><br>
      <small style="font-weight:400;white-space:nowrap;">Tab−Rend</small></th>
  `).join('');

  const maxAbsDiff = Math.max(1, ...rows.flatMap(r => cols.map(c => Math.abs(r[c.dKey] ?? 0))));

  // ── Filas de datos ─────────────────────────────────────────────────────────
  const dataRows = rows.map(r => {
    const cells = cols.map(c => `
      <td style="text-align:right;background:${c.bg};">${fmt(r[c.rKey])}</td>
      <td style="text-align:right;background:${c.bg};">${fmt(r[c.tKey])}</td>
      ${diffCellHtml(r[c.dKey], { max: maxAbsDiff, background: c.bg })}
    `).join('');
    const rowStyle = r.sinTabData ? ' style="opacity:0.55;"' : '';
    return `
      <tr${rowStyle}>
        <td style="white-space:nowrap;font-family:monospace;">${esc(r.ccCode)}</td>
        <td style="white-space:nowrap;">${esc(r.ccName)}</td>
        ${cells}
      </tr>
    `;
  }).join('');

  // ── Fila de totales ────────────────────────────────────────────────────────
  const totRow = cols.map(c => {
    const d = totals[c.tKey] - totals[c.rKey];
    return `
      <td style="text-align:right;background:${c.hdr};font-weight:600;">${fmt(totals[c.rKey])}</td>
      <td style="text-align:right;background:${c.hdr};font-weight:600;">${fmt(totals[c.tKey])}</td>
      ${diffCellHtml(d, { background: c.hdr })}
    `;
  }).join('');

  // Barra: buscador (izquierda) + menú de exportar (derecha)
  const { searchEl, exportEl } = createResultsToolbar(container);

  if (hiddenCount > 0) {
    const note = document.createElement('p');
    note.className = 'text-muted';
    note.style.cssText = 'font-size:var(--text-sm);padding:0 var(--sp-3);';
    note.textContent = `Se ocultan ${hiddenCount} columna${hiddenCount === 1 ? '' : 's'} sin ninguna diferencia. El .xlsx exportado incluye las 6.`;
    container.appendChild(note);
  }

  const tableWrap = document.createElement('div');
  tableWrap.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th rowspan="2" style="white-space:nowrap;">CC</th>
          <th rowspan="2">Centro de Costo</th>
          ${hdr1}
        </tr>
        <tr>
          ${hdr2}
        </tr>
      </thead>
      <tbody>
        ${dataRows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="font-weight:600;white-space:nowrap;">TOTAL GENERAL</td>
          ${totRow}
        </tr>
      </tfoot>
    </table>
  `;
  container.appendChild(tableWrap);

  // Paginación (clientes con muchos CC) + buscador por código/nombre de CC
  wireTableTools(tableWrap.querySelector('table'), {
    rows,
    getLabel: r => `${r.ccCode} — ${r.ccName}`,
    searchEl,
    label: 'Buscar centro de costo',
    placeholder: 'Código o nombre de CC…',
    stickyCols: 2, col1Width: 100,
  });

  const csvHeaders = ['CC', 'Centro de Costo', ...COLS.flatMap(c => [`${c.label} (Rend)`, `${c.label} (Tab)`, `${c.label} (CTRL)`])];
  const csvRows = () => rows.map(r => [r.ccCode, r.ccName, ...COLS.flatMap(c => [fmt(r[c.rKey]), fmt(r[c.tKey]), fmt(r[c.dKey])])]);

  renderExportMenu(exportEl, {
    onExcel: () => exportRendVsTabuToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `RendVsTabulado_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
}

// ── Excel export ──────────────────────────────────────────────────────────────
//
// Migrado a `writeGroupedContractSheet` (specs/contrato-export.md, "Lo que
// falta para migrar los writers del Paso 6" — D-047). `contracts.js` importa
// `COLS` de ESTE archivo, así que un `import` estático de `contracts.js` acá
// arma un ciclo que rompe sólo en el navegador (D-041): se usa `import()`
// dinámico, recién al exportar.

async function exportRendVsTabuToXlsx(results) {
  await loadExcelJS();
  const { rows } = results;
  const { EXPORT_CONTRACTS } = await import('../exports/contracts.js');
  const { writeGroupedContractSheet } = await import('../exports/contractSheet.js');

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const totals = {};
  for (const c of COLS) { totals[c.rKey] = 0; totals[c.tKey] = 0; }
  for (const r of rows) {
    for (const c of COLS) {
      totals[c.rKey] += r[c.rKey] ?? 0;
      totals[c.tKey] += r[c.tKey] ?? 0;
    }
  }
  const totalRow = { ccCode: 'TOTAL GENERAL', ccName: '' };
  for (const c of COLS) {
    totalRow[c.rKey] = totals[c.rKey];
    totalRow[c.tKey] = totals[c.tKey];
    totalRow[c.dKey] = totals[c.tKey] - totals[c.rKey];
  }

  writeGroupedContractSheet(wb, EXPORT_CONTRACTS.rend_vs_tabu, rows, {
    totalRow,
    dimIf: r => r.sinTabData,
  });

  await downloadWorkbook(wb, `RendVsTabulado_${periodSuffix(results.period)}.xlsx`);
}
