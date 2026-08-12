// gsPersControl.test.js — Test del control "GS Pers" (modo Controlar)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/gsPersControl.test.js
//
// Cubre la consolidación por legajo de liquidaciones múltiples en el Tabulado
// (ej: mensual + baja en el mismo mes) — el mismo fix que ya tienen Brutos y
// NR (ver groupTabRowsByLegajo/sumColumn), que GS Pers no tenía: sin esto, la
// última liquidación pisaba a las anteriores y daba una diferencia falsa.
//
// Datos 100% inventados (legajos '1'/'2', apellidos Perez/Gomez).

globalThis.document = { addEventListener: () => {} };

const { runGsPers, summarizeGsPers, runGsPersReporte } = await import('./js/controls/gsPers.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const mapping = {
  gs_pers: { legajoColumn: 'Legajo', gtosPersonalesColumn: 'GTOS_PERSONALES', dtoCocheraColumn: 'DTO_COCHERA' },
  tab: { empleadoColumn: 'Legajo', tabGtosPersonalesColumn: 'GTOS_PERS_TAB', tabDtoCocheraColumn: 'DTO_COCHERA_TAB' },
};

// ── Sin liquidaciones múltiples: comportamiento de siempre ──────────────────

const gsSimple = [
  { Legajo: '1', GTOS_PERSONALES: '1000', DTO_COCHERA: '200' },
];
const tabSimple = [
  { Legajo: '1', GTOS_PERS_TAB: '1000', DTO_COCHERA_TAB: '200' },
];
const rSimple = runGsPers(gsSimple, tabSimple, mapping);
assert('sin diferencias: ctrlGtos y ctrlDto en 0',
  Math.abs(rSimple.rows[0].ctrlGtos) < 0.01 && Math.abs(rSimple.rows[0].ctrlDto) < 0.01);
assert('sin diferencias: summarize da status success', summarizeGsPers(rSimple).status === 'success');

// ── Legajo con DOS liquidaciones en el Tabulado (el bug real) ────────────────
//
// El reporte de GS Pers informa el TOTAL del mes (600); el Tabulado trae dos
// liquidaciones separadas (mensual 600 + baja 400 correspondiente a otro
// concepto, ej. vacaciones no gozadas). Si no se consolida, sólo se ve la
// última liquidación (400) contra el reporte (600) → diferencia falsa de 200.
// Consolidando, el Tabulado suma 1000 contra el reporte (600) → diferencia
// real de 400, que es la que hay que revisar.

const gsDoble = [
  { Legajo: '1', GTOS_PERSONALES: '600', DTO_COCHERA: '0' },
];
const tabDoble = [
  { Legajo: '1', GTOS_PERS_TAB: '600', DTO_COCHERA_TAB: '0' },   // liquidación mensual
  { Legajo: '1', GTOS_PERS_TAB: '400', DTO_COCHERA_TAB: '0' },   // liquidación de baja
];
const rDoble = runGsPers(gsDoble, tabDoble, mapping);
const filaDoble = rDoble.rows.find(r => r.legajo === '1');
assert('el Tabulado con dos liquidaciones se SUMA (600+400=1000), no se pisa',
  Math.abs(filaDoble.tabValGtos - 1000) < 0.01);
assert('la diferencia contra el reporte (600) es real: 1000 − 600 = 400',
  Math.abs(filaDoble.ctrlGtos - 400) < 0.01);

// Regression test explícito del bug: ANTES del fix, tabValGtos hubiera
// quedado en 400 (sólo la última liquidación) y ctrlGtos en −200.
assert('NO reproduce el bug viejo (tabValGtos !== 400, ctrlGtos !== -200)',
  filaDoble.tabValGtos !== 400 && Math.abs(filaDoble.ctrlGtos - -200) > 0.01);

// ── Legajo con múltiples liquidaciones en AMBAS columnas ─────────────────────

const gsAmbas = [
  { Legajo: '2', GTOS_PERSONALES: '500', DTO_COCHERA: '150' },
];
const tabAmbas = [
  { Legajo: '2', GTOS_PERS_TAB: '300', DTO_COCHERA_TAB: '100' },
  { Legajo: '2', GTOS_PERS_TAB: '200', DTO_COCHERA_TAB: '50' },
];
const rAmbas = runGsPers(gsAmbas, tabAmbas, mapping);
const filaAmbas = rAmbas.rows.find(r => r.legajo === '2');
assert('GTOS_PERSONALES se consolida en las dos columnas del Tabulado',
  Math.abs(filaAmbas.tabValGtos - 500) < 0.01 && Math.abs(filaAmbas.ctrlGtos) < 0.01);
assert('DTO_COCHERA se consolida en las dos columnas del Tabulado',
  Math.abs(filaAmbas.tabValDto - 150) < 0.01 && Math.abs(filaAmbas.ctrlDto) < 0.01);

// ── Legajo sin ninguna liquidación en el Tabulado: sigue en null (no 0) ──────

const rSinTab = runGsPers(
  [{ Legajo: '3', GTOS_PERSONALES: '100', DTO_COCHERA: '0' }],
  [],
  mapping
);
const filaSinTab = rSinTab.rows.find(r => r.legajo === '3');
assert('sin ninguna liquidación en el Tabulado, tabValGtos queda null (no 0)',
  filaSinTab.tabValGtos === null && filaSinTab.ctrlGtos === null);
assert('summary.sinTabData cuenta ese legajo', rSinTab.summary.sinTabData === 1);

// ── Modo "Generar Reporte": la MISMA regla de consolidación ──────────────────
//
// Cuarta aparición del mismo bug (Brutos `bba8958`, NR `b2f8bef`, GS Pers modo
// Controlar el 2026-08-11, y acá el modo Generar Reporte). `runGsPersReporte`
// hacía `tabRows.filter().map()`, o sea una fila de salida POR LIQUIDACIÓN,
// mientras sus dos hermanos (`runBrutosReporte`, `runNrReporte`) y su propio
// gemelo `runGsPers` sí agrupan por legajo.
//
// El .xlsx que sale de acá es un entregable que replica un reporte de Meta4, y
// Meta4 informa el total del mes por empleado: sin consolidar, todo legajo con
// doble paga sale dos veces y con los importes partidos.

const mappingReporte = {
  tab: {
    empleadoColumn:           'Legajo',
    apellidoNombreColumn:     'Nombre',
    tabGtosPersonalesColumn:  'GTOS_PERS_TAB',
    tabDtoCocheraColumn:      'DTO_COCHERA_TAB',
  },
  period: '2026-08',
};

const tabReporte = [
  { Legajo: '1', Nombre: 'Perez',  GTOS_PERS_TAB: '600', DTO_COCHERA_TAB: '100' }, // mensual
  { Legajo: '1', Nombre: 'Perez',  GTOS_PERS_TAB: '400', DTO_COCHERA_TAB:  '50' }, // baja
  { Legajo: '2', Nombre: 'Gomez',  GTOS_PERS_TAB: '300', DTO_COCHERA_TAB:   '0' }, // una sola
];
const rRep = runGsPersReporte(null, tabReporte, mappingReporte);

assert('Reporte: un legajo con dos liquidaciones sale UNA sola vez',
  rRep.rows.length === 2);
assert('Reporte: summary.total cuenta empleados, no filas del Tabulado',
  rRep.summary.total === 2);

const repLeg1 = rRep.rows.find(r => r.legajo === '1');
assert('Reporte: GTOS_PERSONALES se suma (600 + 400 = 1000), no se pisa',
  Math.abs(repLeg1.gtos - 1000) < 0.01);
assert('Reporte: DTO_COCHERA se suma (100 + 50 = 150), no se pisa',
  Math.abs(repLeg1.dto - 150) < 0.01);

// NO reproduce el bug viejo: con `.map()` por fila, el legajo 1 salía dos veces
// y `gtos` valía 600 en una fila y 400 en la otra.
assert('NO reproduce el bug viejo: rows.length !== 3 y gtos !== 400',
  rRep.rows.length !== 3 && repLeg1.gtos !== 400);

const repLeg2 = rRep.rows.find(r => r.legajo === '2');
assert('Reporte: el legajo con una sola liquidación no cambia',
  Math.abs(repLeg2.gtos - 300) < 0.01 && Math.abs(repLeg2.dto) < 0.01);
assert('Reporte: los datos de referencia se conservan', repLeg1.nombre === 'Perez');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
