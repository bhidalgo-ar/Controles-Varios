// resumenStats.test.js — El sub-objeto `summary.resumen` que dibuja el tablero
// del Resumen del run (specs/vista-estandar-resumen.md, docs/handoff-resumen-netos.md).
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/resumenStats.test.js
//
// Datos 100% inventados: legajos '1'/'2'/'3', jugadores de Banfield e importes
// redondos elegidos para que la cuenta se pueda seguir a mano.
//
// Lo que este test fija, en orden de qué cuesta más caro si se rompe:
//   1. El puente CIERRA: los cuatro pasos de Netos dan exacto contra la fila
//      TOTAL de la Planilla, y sólo sobre los legajos comparables (D-086).
//   2. `de más − de menos = neto` y `de más + de menos = bruto`.
//   3. Con `unidentifiedCause` presente, la banda rayada ESTÁ en el HTML: un
//      corte que se muestra completo sin serlo es el default silencioso.
//   4. El corte más chico de magnitud arranca en la TOLERANCIA del control.
//   5. Cada grupo se mide contra SU propio total, no contra el del run.
//   6. El helper NUNCA decide quién tiene diferencia: recibe las filas ya
//      elegidas por el control.
//   7. Nombre y empresa entran escapados (vienen de un Excel de un tercero).
//   8. Un bloque declarado "no aplica" queda declarado, no ausente por accidente.

globalThis.document = { addEventListener: () => {} };
globalThis.window   = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };

// La pantalla de resultados cuelga de js/db.js (Dexie): el tablero se prueba
// contra el render real, así que hace falta el IndexedDB de mentira.
await import('fake-indexeddb/auto');
globalThis.Dexie = (await import('dexie')).default;

const { resumenStats, RESUMEN_BLOCKS } = await import('./js/controls/resumenStats.js');
const { runControlNetos, summarizeControlNetos, DEFAULT_NETOS_CONFIG } =
  await import('./js/controls/controlNetos.js');
const { categoriaKey } = await import('./js/parsers/escalaComercioParser.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle ? `\n    ${detalle}` : ''); fail++; }
}
const casi = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// ══════════════════════════════════════════════════════════════════════════
// 1. El helper, directo
// ══════════════════════════════════════════════════════════════════════════

// Cuatro filas con diferencia, ya elegidas por "el control": dos de más, dos de
// menos, en tramos distintos de magnitud.
const FILAS = [
  { legajo: '1', nombre: 'SANGUINETTI JAVIER', empresa: 'BNF', dif:  700000, rubro: 'escala' },
  { legajo: '2', nombre: 'ALBELLA GUSTAVO',    empresa: 'BNF', dif:  250000, rubro: 'escala' },
  { legajo: '3', nombre: 'ERVITI WALTER',      empresa: 'TAL', dif:  -50000, rubro: null },
  { legajo: '4', nombre: 'SILVA SANTIAGO',     empresa: 'TAL', dif:   -5000, rubro: null },
];
// El universo: las cuatro más dos que cerraron.
const TODAS = [
  ...FILAS,
  { legajo: '5', nombre: 'DATOLO JESUS',   empresa: 'BNF', dif: 0, rubro: null },
  { legajo: '6', nombre: 'URZI AGUSTIN',   empresa: 'TAL', dif: 0, rubro: null },
];

const RUBROS_TEST = { escala: { key: 'escala', label: 'Básico fuera de escala', base: 'escala del convenio' } };

const r = resumenStats({
  unit: 'legajo',
  tolerance: 100,
  rows: FILAS,
  allRows: TODAS,
  diff: (f) => f.dif,
  key: (f) => f.legajo,
  unitLabel: (f) => f.nombre,
  group: { empresa: (f) => f.empresa },
  cause: (f) => RUBROS_TEST[f.rubro] || null,
  top: (f) => ({ legajo: f.legajo, nombre: f.nombre, empresa: f.empresa, rubro: RUBROS_TEST[f.rubro]?.label ?? null }),
  sideLabels: {
    over:  { label: 'Pagamos de más',   note: 'plata que hay que recuperar' },
    under: { label: 'Pagamos de menos', note: 'reclamo del empleado si no se corrige' },
  },
});

// ── 2. Los dos lados, y las dos cuentas que salen de ellos ──────────────────
assert('de más: 2 legajos por 950.000', r.diffSigned.over.units === 2 && casi(r.diffSigned.over.amount, 950000));
assert('de menos: 2 legajos por 55.000', r.diffSigned.under.units === 2 && casi(r.diffSigned.under.amount, 55000));
assert('de más − de menos = neto (895.000)',
  casi(r.diffSigned.over.amount - r.diffSigned.under.amount, 895000));
assert('de más + de menos = bruto (1.005.000)',
  casi(r.diffSigned.over.amount + r.diffSigned.under.amount, 1005000));
assert('los lados llevan las palabras del control, no un default genérico',
  r.diffSigned.over.label === 'Pagamos de más' && r.diffSigned.under.note.includes('reclamo'));

// ── 4. Los cortes de magnitud arrancan en la tolerancia ─────────────────────
assert('el corte más chico arranca en la tolerancia del control (100), no en 0,01',
  r.diffBuckets[r.diffBuckets.length - 1].min === 100);
assert('los tramos van de mayor a menor', r.diffBuckets[0].min >= r.diffBuckets[1].min);
assert('el tramo más alto se queda con todo lo que lo supera (≥ 500.000: 1 caso)',
  r.diffBuckets[0].min === 500000 && r.diffBuckets[0].max === null && r.diffBuckets[0].units === 1);
assert('cada caso cae en un solo tramo (4 en total)',
  r.diffBuckets.reduce((s, b) => s + b.units, 0) === 4);
assert('un tramo sin casos no se dibuja', r.diffBuckets.every(b => b.units > 0));
{
  // Con una tolerancia por arriba de un corte, ese corte desaparece: prometer un
  // tramo "0,01 – 10.000" con el cliente midiendo a partir de $ 50.000 es
  // ofrecer casos que el control ya descartó.
  const alta = resumenStats({ unit: 'legajo', tolerance: 50000, rows: FILAS, diff: (f) => f.dif });
  assert('tolerancia 50.000: no queda ningún tramo por debajo de eso',
    alta.diffBuckets.every(b => b.min >= 50000));
}

// ── 5. Cada grupo contra su propio total ────────────────────────────────────
const bnf = r.byGroup.empresa.find(g => g.key === 'BNF');
const tal = r.byGroup.empresa.find(g => g.key === 'TAL');
assert('BNF: 2 con diferencia sobre SU total de 3', bnf.units === 2 && bnf.unitsTotal === 3);
assert('TAL: 2 con diferencia sobre SU total de 3', tal.units === 2 && tal.unitsTotal === 3);
assert('ningún grupo se mide contra el total del run (6)',
  r.byGroup.empresa.every(g => g.unitsTotal !== 6));
assert('los grupos vienen ordenados por plata', bnf.amount > tal.amount);

// ── 3. La causa es PARCIAL, y se dice ───────────────────────────────────────
assert('byCause junta los 2 con rubro identificado',
  r.byCause.length === 1 && r.byCause[0].units === 2 && casi(r.byCause[0].amount, 950000));
assert('la causa lleva su base de cálculo', r.byCause[0].base === 'escala del convenio');
assert('los 2 que no se pueden atribuir van ENTEROS a unidentifiedCause',
  r.unidentifiedCause.units === 2 && casi(r.unidentifiedCause.amount, 55000));
assert('lo no atribuible no se reparte entre los rubros',
  casi(r.byCause.reduce((s, c) => s + c.amount, 0) + r.unidentifiedCause.amount, 1005000));

// ── Por dónde empezar ───────────────────────────────────────────────────────
assert('topUnits ordena por |diferencia|, con el signo a la vista',
  r.topUnits[0].legajo === '1' && r.topUnits[0].amount === 700000
  && r.topUnits[r.topUnits.length - 1].amount === -5000);
assert('topUnits corta en 5', r.topUnits.length <= 5);

// ── Las claves para los cortes cruzados de 3b ───────────────────────────────
assert('unitKeys trae clave, nombre, importe y grupo',
  r.unitKeys.length === 4
  && r.unitKeys[0].key === '1'
  && r.unitKeys[0].label === 'SANGUINETTI JAVIER'
  && r.unitKeys[0].amount === 700000
  && r.unitKeys[0].group === 'BNF');

// ── 6. El helper no decide quién tiene diferencia ───────────────────────────
{
  // Le pasamos una sola fila como "con diferencia" aunque el universo tenga 6 y
  // varias estén arriba de la tolerancia: el helper cuenta lo que le dieron.
  const unaSola = resumenStats({
    unit: 'legajo', tolerance: 100, rows: [FILAS[0]], allRows: TODAS, diff: (f) => f.dif,
  });
  assert('el helper agrupa y suma, nunca vuelve a decidir con la tolerancia',
    unaSola.diffSigned.over.units === 1 && !unaSola.diffSigned.under);
}

// ── 7. Nombre y empresa entran escapados, una sola vez ─────────────────────
{
  const raro = resumenStats({
    unit: 'legajo', tolerance: 1,
    rows: [{ legajo: '9', nombre: '<img src=x>', empresa: 'A & B', dif: 500 }],
    diff: (f) => f.dif,
    key: (f) => f.legajo,
    unitLabel: (f) => f.nombre,
    group: { empresa: (f) => f.empresa },
    top: (f) => ({ legajo: f.legajo, nombre: f.nombre, empresa: f.empresa, rubro: null }),
  });
  assert('el nombre del Excel entra escapado', raro.topUnits[0].nombre === '&lt;img src=x&gt;');
  assert('la empresa también', raro.topUnits[0].empresa === 'A &amp; B');
  assert('la clave del corte por grupo también', raro.byGroup.empresa[0].key === 'A &amp; B');
  assert('no queda un doble escape', !raro.topUnits[0].empresa.includes('&amp;amp;'));
}

// ── 8. Un bloque que no aplica queda DECLARADO ──────────────────────────────
{
  const sinCruce = resumenStats({
    unit: null,
    rows: [],
    notApplicable: ['signed', 'buckets', 'group', 'cause', 'top', 'keys'],
    bridge: { steps: [{ label: 'Registros del archivo', amount: 512, note: 'lo que se generó' }], kind: 'counts' },
  });
  assert('los bloques declarados salen en notApplicable', sinCruce.notApplicable.length === 6);
  assert('y sus campos salen null, no vacíos por accidente',
    sinCruce.diffSigned === null && sinCruce.byCause === null && sinCruce.topUnits === null);
  assert('el bloque que SÍ aplica sigue estando', sinCruce.bridge.steps.length === 1);
  let tiro = false;
  try { resumenStats({ rows: [], notApplicable: ['inventado'] }); } catch { tiro = true; }
  assert('un bloque inexistente en notApplicable corta con error, no se ignora', tiro);
  assert('los bloques declarables están enumerados', RESUMEN_BLOCKS.includes('cause'));
}

// ── null no es 0 ────────────────────────────────────────────────────────────
{
  const sinDiff = resumenStats({ unit: 'legajo', tolerance: 1, rows: FILAS });
  assert('sin la función de diferencia, los lados y los tramos salen null (no en cero)',
    sinDiff.diffSigned === null && sinDiff.diffBuckets === null);
  const vacio = resumenStats({ unit: 'legajo', tolerance: 1, rows: [], allRows: TODAS, diff: (f) => f.dif });
  assert('sin filas con diferencia, ningún bloque sale en cero',
    vacio.diffSigned === null && vacio.byGroup === null && vacio.topUnits === null && vacio.unitKeys === null);
}

// ══════════════════════════════════════════════════════════════════════════
// 1. El puente de Netos cierra contra la fila TOTAL de la Planilla
// ══════════════════════════════════════════════════════════════════════════

const CFG = { noRemuAcuerdo: 120000, topeBaseImponible: null, tolerancia: 100 };
const escalaRows = [
  { codCategoria: 1, categoria: 'Vendedor B', categoriaKey: categoriaKey('Vendedor B'),
    basicos: { 'Basico mayo': 1000000 } },
];
const mapping = {
  tab: { empleadoColumn: 'ID_EMPLEADO', apellidoNombreColumn: 'APELLIDO Y NOMBRE' },
  netosConfig: CFG,
};

function fila(legajo, nombre, extra = {}) {
  const f = {
    ID_EMPLEADO: legajo,
    'APELLIDO Y NOMBRE': nombre,
    CATEGORIA: 'Vendedor B',
    OBRA_SOCIAL: '3009',
    '1003-SUELDO': 1000000,
    '1017-A_CTA_FUT_AUMEN': 200000,
    '1050-ANIOS_ANTI': 10,
    '3513-COMP_ANTIGUEDAD': 120000,
    '1011-PRESENTISMO': 109956,
    '678-AFILIADO_PORC': 0,
    '4567-INCRE_ADO_ABR26_NO': 100000,
    '4569-RECOM_ADO_ABR26_NO': 20000,
    '4615-ANT_ADO_NOS_ADIC': 12000,
    '4613-PRES_ADO_NOS_ADIC': 10995.60,
    '6005-TOT_JUB': 157295.16,
    '8536-FAECYS': 7745.60,
    '8520-RET_VOL': 0,
    NETO: 0,
    ...extra,
  };
  // `undefined` en la columna del neto = la celda vacía del Tabulado, que es lo
  // que hace que el legajo quede "sin comparar" (y no en cero).
  if (f.NETO === undefined) delete f.NETO;
  return f;
}

const BASE_CFG = DEFAULT_NETOS_CONFIG();
const T = BASE_CFG.tasas;
const p = (v) => v / 100;
const PRES = p(BASE_CFG.presentismo);
const REMU_TEO = 1200000 + 120000 + (1320000 * PRES);
const NR_TEO   = 120000 + 12000 + (132000 * PRES);
const TASA_AP   = p(T.jubilacion) + p(T.ley19032) + p(T.obraSocial) + p(T.anssal);
const TASA_GREM = p(T.sindicato) + p(T.faecys);
const NETO_TEO = REMU_TEO + NR_TEO - (REMU_TEO * TASA_AP + (REMU_TEO + NR_TEO) * TASA_GREM);

// Tres legajos: uno pagado 30.000 de más, uno 8.000 de menos, y uno SIN neto
// liquidado (el que no se puede comparar y no entra al puente).
const run = runControlNetos(escalaRows, [
  fila('1', 'SANGUINETTI JAVIER', { NETO: NETO_TEO + 30000 }),
  fila('2', 'ALBELLA GUSTAVO',    { NETO: NETO_TEO - 8000 }),
  fila('3', 'FALCIONI JULIO CESAR', { NETO: undefined }),
], mapping);

assert('el run trae los 3 legajos', run.rows.length === 3);
const sinNeto = run.rows.filter(x => x.residuo === null);
assert('el legajo sin neto liquidado queda sin residuo (no en cero)', sinNeto.length === 1);

// La fila TOTAL de la Planilla suma TODA columna de importe sobre las filas
// mostradas. El puente suma lo mismo, pero sólo sobre lo comparable (D-086).
const comparables = run.rows.filter(x => x.residuo !== null);
const totalPlanilla = (key) => comparables.reduce((s, x) => s + (x[key] || 0), 0);

const steps = run.bridge.steps;
assert('el puente tiene los cuatro pasos del diseño', steps.length === 4);
assert('paso 1 = TOTAL de Neto teórico de la Planilla', casi(steps[0].amount, totalPlanilla('netoTeorico')));
assert('paso 2 = TOTAL de Explicado por el mes',        casi(steps[1].amount, totalPlanilla('explicado')));
assert('paso 3 = TOTAL de Sin explicar',                casi(steps[2].amount, totalPlanilla('residuo')));
assert('paso 4 = TOTAL de Neto ajustado (lo comparable)', casi(steps[3].amount, totalPlanilla('netoAjustado')));
assert('EL PUENTE CIERRA: teórico + explicado + sin explicar = liquidado',
  casi(steps[0].amount + steps[1].amount + steps[2].amount, steps[3].amount),
  `${steps[0].amount} + ${steps[1].amount} + ${steps[2].amount} ≠ ${steps[3].amount}`);
assert('el paso 3 va con SIGNO (30.000 − 8.000 = 22.000), no con los dos valores absolutos',
  casi(steps[2].amount, 22000));
assert('el legajo sin neto no se resta contra nada: se informa aparte (D-086)',
  run.bridge.uncompared && run.bridge.uncompared.amount > 0
  && run.bridge.uncompared.label.includes('sin neto liquidado'));
assert('la barra de proporción dice qué % del teórico es lo sin explicar',
  run.bridge.proportion.note.includes('% del neto teórico'));

// ── El resumen que publica el summarize de Netos ────────────────────────────
const sum = summarizeControlNetos(run);
assert('el summarize publica el sub-objeto resumen', !!sum.resumen);
assert('el resumen declara la unidad y la tolerancia con la que se midió',
  sum.resumen.unit === 'legajo' && sum.resumen.tolerance === 100);
assert('los dos lados salen del residuo con signo',
  sum.resumen.diffSigned.over.units === 1 && casi(sum.resumen.diffSigned.over.amount, 30000)
  && sum.resumen.diffSigned.under.units === 1 && casi(sum.resumen.diffSigned.under.amount, 8000));
assert('el KPI "Sin comparar" cuenta el legajo sin neto', sum.unitsUncompared === 1);
assert('con un solo Tabulado no se inventa el corte por empresa', sum.resumen.byGroup === null);
assert('las claves de unidad son la clave del cliente, no el número crudo',
  sum.resumen.unitKeys.length === 2 && sum.resumen.unitKeys.every(u => typeof u.key === 'string'));
assert('los legajos sin rubro identificable van a "Sin identificar", no a un rubro inventado',
  sum.resumen.byCause === null && sum.resumen.unidentifiedCause.units === 2);
assert('el puente que publica el summarize es el que armó el run', sum.resumen.bridge === run.bridge);

// ── 3. La banda rayada, en el HTML ──────────────────────────────────────────
// Un run con causa parcial: la banda rayada de "Sin identificar" tiene que estar
// dibujada. Sin ella, el corte se lee como completo — el default silencioso.
{
  const { buildHeroHtml } = await import('./js/ui/controlsResults.js');

  const conCausaParcial = resumenStats({
    unit: 'legajo', tolerance: 100, rows: FILAS, allRows: TODAS,
    diff: (f) => f.dif,
    cause: (f) => RUBROS_TEST[f.rubro] || null,
  });
  const item = {
    row: { controlId: 'control_netos' },
    ctrl: { label: 'Control de Netos' },
    tier: 'error',
    summary: {
      unit: 'legajo', unitsTotal: 6, unitsWithDiff: 4, status: 'warning',
      diffTotalAmount: 1005000, worstCase: null, contextNote: null, headline: '',
      resumen: conCausaParcial,
    },
  };
  const html = buildHeroHtml([item], [], 2).html;
  assert('con unidentifiedCause presente, la banda rayada está dibujada',
    html.includes('rsm-cut__fill--unident'));
  assert('y la card lo dice en palabras', html.includes('El motor le pone rubro a 2 de 4 legajos'));

  // Sin ninguna causa identificada la card NO se dibuja: mejor dos cortes que
  // tres con uno vacío (riesgo 1 del handoff).
  const sinNingunaCausa = resumenStats({
    unit: 'legajo', tolerance: 100, rows: FILAS, allRows: TODAS,
    diff: (f) => f.dif, cause: () => null,
  });
  const html2 = buildHeroHtml([{ ...item, summary: { ...item.summary, resumen: sinNingunaCausa } }], [], 2).html;
  assert('sin ninguna causa atribuida, la card por causa no se renderiza',
    !html2.includes('Qué rubro la causa'));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
