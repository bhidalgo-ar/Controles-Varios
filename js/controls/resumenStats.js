// resumenStats.js — El sub-objeto `summary.resumen` que alimenta el tablero del
// Resumen del run (specs/vista-estandar-resumen.md §3, docs/handoff-resumen-netos.md).
//
// El tablero se escribe UNA vez (js/ui/controlsResults.js) y consume
// `controlSummaries[]`. "Bajarlo a los 21 controles" no es tocar 21 pantallas:
// es que cada `summarize` publique acá los cortes que el tablero dibuja.
//
// ── La regla que ordena todo este módulo ────────────────────────────────────
// **Esta pieza agrupa y suma; NUNCA decide quién tiene diferencia.** Eso ya lo
// decidió el control con su tolerancia, y el control entrega las filas ya
// filtradas (`rows`) más el universo que evaluó (`allRows`, sólo para el
// denominador de cada grupo). Si este módulo volviera a comparar contra una
// tolerancia, el tablero podría contar distinto que la tarjeta del checklist
// del mismo run — el "semáforo miente en verde" de CLAUDE.md, en otro lugar.
//
// ── null no es 0 ────────────────────────────────────────────────────────────
// Un corte que el control no puede llenar sale `null` y el tablero omite el
// bloque entero. Un corte que el control declara NO APLICABLE sale también
// `null`, pero su nombre queda listado en `notApplicable`: así se distingue
// "este control no tiene lados" de "alguien se olvidó de cablear los lados", y
// el candado de CI puede reconocer al control como migrado (spec §8).
//
// ── Lo que este módulo escapa, y por qué acá ────────────────────────────────
// `topUnits` lleva nombre y empresa, que vienen de un Excel de un tercero. Se
// escapan ACÁ, una sola vez, y el tablero los inserta tal cual: con el escape
// repartido entre el helper y la pantalla, un `&` de un apellido salía como
// `&amp;amp;`. Está escrito como assert en tests/resumenStats.test.js.

/** Los cortes que un control puede declarar como no aplicables. */
export const RESUMEN_BLOCKS = ['signed', 'buckets', 'group', 'cause', 'top', 'keys', 'bridge'];

/** La escalera de magnitud del handoff. El corte más chico lo pone la tolerancia. */
const DEFAULT_BUCKET_EDGES = [10_000, 100_000, 500_000];

const esc = (str) => String(str ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Arma `summary.resumen`.
 *
 * @param {object} spec
 * @param {string|null} spec.unit             la unidad EN LA QUE ESTÁN LOS CONTEOS ('legajo', 'cc', 'cuenta', 'lista')
 * @param {number} [spec.tolerance]           el monto con el que el control decidió (arranca el corte más chico)
 * @param {object[]} spec.rows                las filas CON DIFERENCIA — ya las eligió el control
 * @param {object[]} [spec.allRows]           el universo evaluado; sólo para el denominador de cada grupo
 * @param {(row:object)=>number|null} [spec.diff]   la diferencia de la fila, CON SIGNO
 * @param {(row:object)=>string|null} [spec.key]    la clave de unidad ya normalizada (makeLegajoKey) para crossControl
 * @param {(row:object)=>string|null} [spec.unitLabel]  cómo se llama esa unidad en pantalla (va escapado)
 * @param {{over?:{label?:string,note?:string}, under?:{label?:string,note?:string}}} [spec.sideLabels]
 *        cómo se leen los dos lados en ESTE control ("Pagamos de más" / "subieron"). Sin esto salen
 *        "De más" y "De menos", que es lo único cierto para cualquier control.
 * @param {Record<string,(row:object)=>string|null>} [spec.group]  un corte por atributo agrupable (hoy: empresa)
 * @param {(row:object)=>({key:string,label?:string,code?:string|null,base?:string|null}|null)} [spec.cause]
 * @param {(row:object)=>object} [spec.top]   los campos de la tabla "Por dónde empezar"
 * @param {object|null} [spec.bridge]         el puente: lo aporta el `run()` del control
 * @param {number[]} [spec.bucketEdges]       override de la escalera de magnitud
 * @param {string[]} [spec.notApplicable]     los bloques que este control declara que NO aplican
 * @returns {object} el sub-objeto `resumen`
 */
export function resumenStats(spec = {}) {
  const {
    unit = null,
    tolerance = null,
    rows = [],
    allRows = null,
    diff = null,
    key = null,
    unitLabel = null,
    sideLabels = null,
    group = null,
    cause = null,
    top = null,
    bridge = null,
    bucketEdges = DEFAULT_BUCKET_EDGES,
    notApplicable = [],
  } = spec;

  const declared = new Set(notApplicable);
  for (const b of declared) {
    if (!RESUMEN_BLOCKS.includes(b)) {
      throw new Error(`resumenStats: "${b}" no es un bloque del tablero. Los bloques son: ${RESUMEN_BLOCKS.join(', ')}.`);
    }
  }
  const aplica = (block) => !declared.has(block);

  const diffRows = Array.isArray(rows) ? rows : [];
  const universe = Array.isArray(allRows) ? allRows : diffRows;

  // La diferencia de cada fila, una sola vez: la piden los lados, los cortes de
  // magnitud, el corte por causa y el top.
  const signedOf = new Map();
  if (diff && aplica('signed')) {
    for (const row of diffRows) {
      const v = diff(row);
      if (isNum(v)) signedOf.set(row, v);
    }
  }
  const amountOf = (row) => {
    const v = signedOf.get(row);
    return isNum(v) ? Math.abs(v) : 0;
  };

  // El corte por causa y su resto se calculan de una sola pasada: son dos
  // salidas de la MISMA atribución, y separarlas en dos recorridos es lo que
  // hace que un día dejen de sumar lo mismo.
  const causes = aplica('cause')
    ? buildCauses(diffRows, cause, amountOf)
    : { byCause: null, unidentified: null };

  return {
    unit,
    tolerance: isNum(tolerance) ? tolerance : null,
    diffSigned:        aplica('signed')  ? buildSigned(diffRows, signedOf, sideLabels)              : null,
    diffBuckets:       aplica('buckets') ? buildBuckets(diffRows, signedOf, tolerance, bucketEdges) : null,
    byGroup:           aplica('group')   ? buildGroups(diffRows, universe, group, amountOf)         : null,
    byCause:           causes.byCause,
    unidentifiedCause: causes.unidentified,
    topUnits:          aplica('top')     ? buildTop(diffRows, top, signedOf)                        : null,
    unitKeys:          aplica('keys')    ? buildKeys(diffRows, key, unitLabel, group, signedOf)     : null,
    bridge:            aplica('bridge')  ? (bridge || null)                                         : null,
    notApplicable: [...declared],
  };
}

// ── Para qué lado ────────────────────────────────────────────────────────────
// `de más − de menos = neto` y `de más + de menos = bruto`: el neto es lo que el
// analista informa, el bruto el trabajo que tiene por delante. Escrito como
// assert en tests/resumenStats.test.js.

function buildSigned(rows, signedOf, sideLabels) {
  if (signedOf.size === 0) return null;
  const over  = { amount: 0, units: 0, label: sideLabels?.over?.label  || 'De más',  note: sideLabels?.over?.note  || null };
  const under = { amount: 0, units: 0, label: sideLabels?.under?.label || 'De menos', note: sideLabels?.under?.note || null };
  for (const row of rows) {
    const v = signedOf.get(row);
    if (!isNum(v) || v === 0) continue;
    const side = v > 0 ? over : under;
    side.amount += Math.abs(v);
    side.units += 1;
  }
  if (over.units === 0 && under.units === 0) return null;
  // Un lado sin casos sale `null`, no en cero: el tablero omite la fila entera
  // en vez de dibujar una barra vacía que se lee como "acá también hay algo".
  return { over: over.units > 0 ? over : null, under: under.units > 0 ? under : null };
}

// ── Qué tan grande es cada una ───────────────────────────────────────────────
// El corte más chico ARRANCA EN LA TOLERANCIA DEL CONTROL, no en un número
// fijo: con un cliente que mide a partir de $ 100, un tramo "0,01 – 10.000"
// promete casos que el control ya descartó.

function buildBuckets(rows, signedOf, tolerance, edges) {
  if (signedOf.size === 0) return null;
  const floor = isNum(tolerance) && tolerance > 0 ? tolerance : 0;
  const cuts = [floor, ...edges.filter(e => e > floor)];

  const buckets = cuts.map((min, i) => ({
    min,
    max: i + 1 < cuts.length ? cuts[i + 1] : null,
    units: 0,
    amount: 0,
  }));

  for (const row of rows) {
    const v = signedOf.get(row);
    if (!isNum(v)) continue;
    const abs = Math.abs(v);
    // El último tramo se queda con todo lo que supera el corte más alto.
    let i = buckets.length - 1;
    while (i > 0 && abs < buckets[i].min) i--;
    buckets[i].units += 1;
    buckets[i].amount += abs;
  }

  // Un tramo vacío no se dibuja: la card muestra dónde ESTÁ la plata.
  const conCasos = buckets.filter(b => b.units > 0);
  return conCasos.length > 0 ? conCasos.reverse() : null;
}

// ── En qué empresa ───────────────────────────────────────────────────────────
// El % de cada grupo se mide contra SU PROPIO total, no contra el del run: con
// el denominador del run, una empresa de 20 empleados con 5 diferencias sale en
// 1,5 % sobre 340 y el tablero la pinta en verde.

function buildGroups(rows, universe, group, amountOf) {
  if (!group) return null;
  const out = {};
  for (const [dim, getKey] of Object.entries(group)) {
    if (typeof getKey !== 'function') continue;

    const totals = new Map();
    for (const row of universe) {
      const k = getKey(row);
      if (k === null || k === undefined || k === '') continue;
      totals.set(String(k), (totals.get(String(k)) || 0) + 1);
    }

    const acc = new Map();
    for (const row of rows) {
      const k = getKey(row);
      if (k === null || k === undefined || k === '') continue;
      const kk = String(k);
      const cur = acc.get(kk) || { key: kk, units: 0, amount: 0 };
      cur.units += 1;
      cur.amount += amountOf(row);
      acc.set(kk, cur);
    }
    if (acc.size === 0) continue;

    out[dim] = [...acc.values()]
      .map(g => ({ ...g, key: esc(g.key), unitsTotal: totals.get(g.key) ?? null }))
      .sort((a, b) => b.amount - a.amount || b.units - a.units);
  }
  return Object.keys(out).length > 0 ? out : null;
}

// ── Qué rubro la causa ───────────────────────────────────────────────────────
// **Parcial por diseño.** Lo que el control no puede atribuir va entero a
// `unidentifiedCause` — nunca repartido entre los rubros ni escondido. El
// tablero dibuja esa parte con la banda rayada, y ese par (corte + banda) es lo
// que impide que un corte incompleto se lea como completo: el default
// silencioso de CLAUDE.md, aplicado a un gráfico.

function buildCauses(rows, cause, amountOf) {
  if (!cause) return { byCause: null, unidentified: null };

  const acc = new Map();
  const unidentified = { units: 0, amount: 0 };

  for (const row of rows) {
    const c = cause(row);
    if (!c || c.key === null || c.key === undefined || c.key === '') {
      unidentified.units += 1;
      unidentified.amount += amountOf(row);
      continue;
    }
    const k = String(c.key);
    const cur = acc.get(k) || {
      key: k,
      label: esc(c.label ?? k),
      code: c.code ?? null,
      base: c.base ?? null,
      units: 0,
      amount: 0,
    };
    cur.units += 1;
    cur.amount += amountOf(row);
    acc.set(k, cur);
  }

  return {
    byCause: acc.size > 0
      ? [...acc.values()].sort((a, b) => b.amount - a.amount || b.units - a.units)
      : null,
    unidentified: unidentified.units > 0 ? unidentified : null,
  };
}

// ── Por dónde empezar ────────────────────────────────────────────────────────
// Los 5 de mayor |diferencia|, con el signo a la vista: el orden es por tamaño
// del problema, no por lado.

function buildTop(rows, top, signedOf) {
  if (!top || signedOf.size === 0) return null;
  const out = rows
    .filter(r => isNum(signedOf.get(r)))
    .sort((a, b) => Math.abs(signedOf.get(b)) - Math.abs(signedOf.get(a)))
    .slice(0, 5)
    .map(row => {
      const t = top(row) || {};
      return {
        legajo: t.legajo == null ? null : esc(t.legajo),
        nombre: t.nombre == null ? null : esc(t.nombre),
        empresa: t.empresa == null ? null : esc(t.empresa),
        rubro: t.rubro == null ? null : esc(t.rubro),
        amount: signedOf.get(row),
      };
    });
  return out.length > 0 ? out : null;
}

// ── Las claves de unidad para los cortes cruzados de 3b ──────────────────────
// `touchedByRed` y "legajos que aparecen en varios controles" son UNIONES de
// claves, jamás sumas de conteos. Sin claves, esos dos bloques se omiten para
// ese run — no se aproximan sumando (riesgo 3 del handoff).

function buildKeys(rows, key, unitLabel, group, signedOf) {
  if (!key) return null;
  // El grupo que viaja con cada clave es el PRIMERO que el control declaró (hoy
  // siempre `empresa`): es lo que le permite al corte cruzado de 3b armar la
  // unión exacta por empresa en vez de sumar conteos de varios controles.
  const getGroup = group ? Object.values(group).find(fn => typeof fn === 'function') : null;

  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const k = key(row);
    if (k === null || k === undefined || k === '') continue;
    const kk = String(k);
    if (seen.has(kk)) continue;
    seen.add(kk);
    const label = unitLabel ? unitLabel(row) : null;
    const g = getGroup ? getGroup(row) : null;
    out.push({
      key: kk,
      label: label == null || label === '' ? null : esc(label),
      amount: isNum(signedOf.get(row)) ? signedOf.get(row) : null,
      group: g == null || g === '' ? null : esc(g),
    });
  }
  return out.length > 0 ? out : null;
}
