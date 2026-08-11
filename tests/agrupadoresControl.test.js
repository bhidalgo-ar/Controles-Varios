// agrupadoresControl.test.js — Test del control "Cruce por Agrupadores" (T9 de PLAN_v2.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/agrupadoresControl.test.js
//
// Verifica que CONTROL_REGISTRY.agrupadores.run(...) — invocado como lo haría
// controlsWizard.js — dé exactamente el mismo resultado que llamar a
// runMatching() directamente con los mismos datos (ver specs/plan-v2-t9-t10.md,
// T9: "el cruce, corrido desde el control nuevo, da el mismo resultado que
// daba runMatching() desde el wizard viejo").

// registry.js importa (transitivamente) módulos de UI que registran un
// listener a nivel de módulo — necesitan un `document` mínimo fuera del
// navegador (mismo shim que controlsRegistryScope.test.js).
globalThis.document = { addEventListener: () => {} };

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { runMatching } = await import('./js/matching.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const ctrl = CONTROL_REGISTRY.agrupadores;
assert('el registry tiene la entrada "agrupadores"', ctrl !== undefined);
assert('additionalFiles[0] es la Nómina Maestra (primaryRows)', ctrl.additionalFiles[0].key === 'nomina');
assert('tabRequired es false (no usa el Tabulado)', ctrl.tabRequired === false);

// ── Datos de prueba (inventados, sin datos reales de empleados) ──────────────

const nominaRows = [
  { legajo: '1', apellido: 'Perez', nombre: 'Juan', '100': 1000, '200': 500 },
  { legajo: '2', apellido: 'Gomez', nombre: 'Ana',  '100': 2000, '200': 300 },
  { legajo: '3', apellido: 'Diaz',  nombre: 'Lucas', '100': 1500, '200': 200 },
];

const resumenLargoRows = [
  { legajo: '1', '100': 1000, '200': 500 },
  { legajo: '2', '100': 1900, '200': 300 }, // diferencia de $100 en el concepto 100
  // legajo 3 falta en el resumen a propósito (soloEnNomina)
];

const grouperDefs = [
  { id: 1, name: 'Sueldo' },
  { id: 2, name: 'Cargas' },
];
const grouperConceptsMap = { 1: ['100'], 2: ['200'] };
const thresholds = { absoluteAmount: 1, percentage: 0.1, flagMissing: true };

// ── run() vía el registry, igual que lo arma controlsWizard.js ──────────────

const results = ctrl.run(nominaRows, [], {
  resumenLargoRows,
  grouperDefs,
  grouperConceptsMap,
  agrupadoresConfig: { thresholds },
});

assert('run() no devuelve error con datos completos', !results.error);

const expected = runMatching(nominaRows, resumenLargoRows, grouperConceptsMap, thresholds);
assert(
  'resultsPorGrupo del control === runMatching() invocado directamente',
  JSON.stringify(results.resultsPorGrupo) === JSON.stringify(expected)
);

assert('detecta la diferencia de $100 en el agrupador Sueldo',
  results.resultsPorGrupo[1].find(r => r.legajo === '2')?.tieneDiff === true);
assert('el legajo 3 (solo en nómina) queda marcado',
  results.resultsPorGrupo[1].find(r => r.legajo === '3')?.soloEnNomina === true);

// ── summarize() ───────────────────────────────────────────────────────────────

const summary = ctrl.summarize(results);
assert('summarize(): status = warning (hay diferencias)', summary.status === 'warning');
assert('summarize(): unitsTotal es un número', typeof summary.unitsTotal === 'number' && summary.unitsTotal > 0);
assert('summarize(): unitsWithDiff > 0', summary.unitsWithDiff > 0);

// ── Regresión: unitsTotal es legajo×agrupador, no legajos distintos ──────────
//
// runMatching() evalúa el mismo universo de legajos una vez POR agrupador
// (matching.js:35): con 3 legajos (unión nómina/resumen) y 2 agrupadores,
// suma ingenua da 6. unitsTotal tiene que ser 3 — la cantidad de legajos
// evaluados, no legajos×agrupadores — porque unit: 'legajo' así lo declara y
// es lo que compara el semáforo contra unitsWithDiff.
assert('unitsTotal cuenta legajos distintos (3), no legajo×agrupador (6)',
  summary.unitsTotal === 3);
// Legajo 2 (diferencia real de $100 en Sueldo) y legajo 3 (soloEnNomina, que
// flagMissing marca como diferencia en los dos agrupadores) — pero cada uno
// cuenta UNA sola vez, no una vez por agrupador donde aparece.
assert('unitsWithDiff cuenta legajos distintos con al menos una diferencia (legajos 2 y 3)',
  summary.unitsWithDiff === 2);

// ── Regresión: diffTotalAmount no queda topeado por el top-10 de insights ───
//
// Con 15 legajos con $100 de diferencia cada uno en un solo agrupador, el
// total real es $1.500 — no $1.000 (10 × $100), que es lo que daba sumar
// sobre topDifferences (ya recortado a los 10 más grandes en insights.js).
const nomina15 = Array.from({ length: 15 }, (_, i) => ({ legajo: String(i + 1), '100': 1000 }));
const resumen15 = Array.from({ length: 15 }, (_, i) => ({ legajo: String(i + 1), '100': 900 })); // −100 cada uno
const results15 = ctrl.run(nomina15, [], {
  resumenLargoRows: resumen15,
  grouperDefs: [{ id: 1, name: 'Sueldo' }],
  grouperConceptsMap: { 1: ['100'] },
  agrupadoresConfig: { thresholds },
});
const summary15 = ctrl.summarize(results15);
assert('con 15 diferencias de $100, diffTotalAmount es $1.500 (no $1.000, topeado en 10)',
  Math.abs(summary15.diffTotalAmount - 1500) < 0.01);
assert('con 15 legajos y un solo agrupador, unitsTotal es 15 (no 15×1 por casualidad — ver caso con 2 agrupadores arriba)',
  summary15.unitsTotal === 15 && summary15.unitsWithDiff === 15);

// ── Resumen Tabulado Horizontal (el otro formato posible) ────────────────────

const resumenTabuladoRows = [
  { legajo: '1', '100': 1000, '200': 500 },
  { legajo: '2', '100': 2000, '200': 300 },
  { legajo: '3', '100': 1500, '200': 200 },
];
const resultsTab = ctrl.run(nominaRows, [], {
  resumenTabuladoRows,
  grouperDefs,
  grouperConceptsMap,
  agrupadoresConfig: { thresholds },
});
assert('run() también funciona con resumenTabuladoRows (sin resumenLargoRows)', !resultsTab.error);
assert('sin diferencias cuando nómina y resumen tabulado coinciden',
  ctrl.summarize(resultsTab).status === 'success');

// ── Casos de error ────────────────────────────────────────────────────────────

const noNomina = ctrl.run([], [], { resumenLargoRows, grouperDefs, grouperConceptsMap });
assert('run() sin nómina devuelve error', typeof noNomina.error === 'string');

const noResumen = ctrl.run(nominaRows, [], { grouperDefs, grouperConceptsMap });
assert('run() sin resumen devuelve error', typeof noResumen.error === 'string');

const noGroupers = ctrl.run(nominaRows, [], { resumenLargoRows, grouperDefs: [], grouperConceptsMap: {} });
assert('run() sin agrupadores seleccionados devuelve error', typeof noGroupers.error === 'string');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
