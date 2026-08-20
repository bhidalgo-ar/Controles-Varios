// tolerance.test.js — El monto de diferencia, de punta a punta (D-069)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/tolerance.test.js
//
// Lo que este archivo defiende: que el número que el analista escribe en el
// panel "Umbrales" REALMENTE filtre. Hasta el 2026-08-19 ese panel mostraba
// "$ 1,00" escritos a mano y ningún control los leía — la pantalla prometía un
// filtro que no existía, y eso no se notaba porque nada fallaba.
//
// Cubre:
//   1. Cómo se normaliza el monto (el piso de $ 0,01, el formato es-AR).
//   2. `isDiff` — `null` no es `0`, y la tolerancia manda.
//   3. `withTolerance` deja el valor anterior como estaba, incluso si adentro
//      explota: sin eso, un control que tira excepción le deja su monto puesto
//      al siguiente de la corrida.
//   4. Que los DOS helpers compartidos —`diffStats` (el semáforo) y
//      `diffCellHtml` (la celda Δ)— midan con ese monto sin que el control
//      tenga que pedirlo. Es lo que hace que un control NUEVO lo herede.
//   5. Un control real de punta a punta (Brutos): con el monto en $ 100, una
//      diferencia de $ 50 deja de contar.
//   6. Que una corrida guardada se relea con el monto con el que se corrió.
//   7. Que ningún módulo de `js/controls/` vuelva a cablear un `0,01` suelto
//      para decidir si algo es diferencia. Ese es el barrido que impide que el
//      próximo control nazca con el bug de nuevo.
//
// Datos 100% inventados (legajos '1'/'2', apellidos Sanguinetti/Falcioni).

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

globalThis.document = { addEventListener: () => {} };

const {
  DEFAULT_DIFF_TOLERANCE, normalizeTolerance, currentTolerance, withTolerance,
  isDiff, resolveClientTolerance, resolveControlTolerance, toleranceOfResults,
  stampTolerance, summarizeWithTolerance, formatTolerance,
} = await import('./js/controls/tolerance.js');
const { diffStats } = await import('./js/controls/semaforo.js');
const { diffBadgeHtml } = await import('./js/ui/resultBlocks.js');
const { runBrutos, summarizeBrutos } = await import('./js/controls/brutos.js');
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── 1. Normalización del monto ───────────────────────────────────────────────

assert('el default es el centavo (el redondeo de Excel)', DEFAULT_DIFF_TOLERANCE === 0.01);
assert('sin valor → default', normalizeTolerance(null) === 0.01 && normalizeTolerance(undefined) === 0.01);
assert('texto que no es número → default (no 0: un 0 marcaría todo)', normalizeTolerance('abc') === 0.01);
assert('vacío → default', normalizeTolerance('') === 0.01);
assert('cero → sube al piso de $ 0,01', normalizeTolerance(0) === 0.01);
assert('menos del centavo → sube al piso', normalizeTolerance(0.001) === 0.01);
assert('negativo → se toma en positivo', normalizeTolerance(-100) === 100);
assert('número tal cual', normalizeTolerance(100) === 100);
assert('formato es-AR con miles: "1.500,50"', normalizeTolerance('1.500,50') === 1500.5);
assert('formato es-AR con signo pesos: "$ 250,00"', normalizeTolerance('$ 250,00') === 250);
assert('se muestra en pesos es-AR', formatTolerance(1500.5) === '$ 1.500,50');

// ── 2. isDiff — `null` no es `0` ─────────────────────────────────────────────

assert('null NO es diferencia (no hay dato, distinto de "hay dato y vale 0")', isDiff(null, 1) === false);
assert('undefined tampoco', isDiff(undefined, 1) === false);
assert('0 con dato no es diferencia', isDiff(0, 1) === false);
assert('por debajo del monto no es diferencia', isDiff(50, 100) === false);
assert('exactamente el monto NO es diferencia (el corte es estricto)', isDiff(100, 100) === false);
assert('por encima del monto sí', isDiff(100.01, 100) === true);
assert('el signo no importa', isDiff(-150, 100) === true);

// ── 3. withTolerance restaura, pase lo que pase ──────────────────────────────

assert('arranca en el default', currentTolerance() === 0.01);
withTolerance(500, () => {
  assert('adentro mide con el monto pedido', currentTolerance() === 500);
  withTolerance(10, () => assert('anidado: manda el de adentro', currentTolerance() === 10));
  assert('al salir del anidado vuelve el de afuera', currentTolerance() === 500);
});
assert('al salir vuelve al default', currentTolerance() === 0.01);

try {
  withTolerance(999, () => { throw new Error('un control que explota a mitad de camino'); });
} catch { /* esperado */ }
assert('si el control explota adentro, el monto igual se restaura', currentTolerance() === 0.01);

assert('isDiff sin monto explícito usa el de la corrida',
  withTolerance(100, () => isDiff(50)) === false && withTolerance(100, () => isDiff(150)) === true);

// ── 4. Los dos helpers compartidos lo heredan solos ──────────────────────────
// Esto es lo que hace que un control NUEVO mida bien sin escribir una línea:
// usa `diffStats` para su resumen y `diffCellHtml` para su tabla, y ya está.

const filas = [
  { legajo: '1', dif: 50 },    // ruido: por debajo de $ 100
  { legajo: '2', dif: 150 },   // hallazgo
  { legajo: '3', dif: null },  // sin dato: nunca cuenta
];
const campos = [{ key: 'dif', get: r => r.dif }];
const label  = r => `Legajo ${r.legajo}`;

const alCentavo = diffStats(filas, campos, label);
assert('con el default, las dos filas con dato cuentan', alCentavo.unitsWithDiff === 2);

const conMonto = withTolerance(100, () => diffStats(filas, campos, label));
assert('con el monto en $ 100, sólo cuenta la de $ 150', conMonto.unitsWithDiff === 1);
assert('el total en pesos tampoco suma lo que quedó adentro del margen', conMonto.diffTotalAmount === 150);
assert('el peor caso es el que quedó', conMonto.worstCase?.label === 'Legajo 2');

const campoConSuyo = [{ key: 'dif', get: r => r.dif, threshold: 0.01 }];
assert('un campo con threshold propio lo sigue mandando (no se lo pisa)',
  withTolerance(100, () => diffStats(filas, campoConSuyo, label)).unitsWithDiff === 2);

assert('la celda Δ pinta $ 50 como hallazgo con el default',
  diffBadgeHtml(50).includes('rb-diffbadge--error'));
assert('con el monto en $ 100, esa misma celda sale como "sin diferencia"',
  withTolerance(100, () => diffBadgeHtml(50)).includes('rb-diffzero'));
assert('y $ 150 sigue saliendo como hallazgo',
  withTolerance(100, () => diffBadgeHtml(150)).includes('rb-diffbadge--error'));

// ── 5. Un control real, de punta a punta ─────────────────────────────────────
// Brutos: el reporte contra el Tabulado. Legajo '1' difiere $ 50, legajo '2'
// difiere $ 500. Con el monto en $ 100 el primero deja de ser un hallazgo.

const mappingBrutos = {
  brutos: { legajoColumn: 'Legajo', salBaseColumn: 'SAL_BASE', aCuFutAumenColumn: 'A_CTA_FUT_AUMEN' },
  tab:    { empleadoColumn: 'Legajo', tabSalBaseColumn: 'SAL_BASE_TAB', tabACuFutAumenColumn: 'ACFA_TAB' },
};
const brutosRows = [
  { Legajo: '1', SAL_BASE: '1000', A_CTA_FUT_AUMEN: '0' },
  { Legajo: '2', SAL_BASE: '2000', A_CTA_FUT_AUMEN: '0' },
];
const tabRows = [
  { Legajo: '1', SAL_BASE_TAB: '1050', ACFA_TAB: '0' },   // dif 50
  { Legajo: '2', SAL_BASE_TAB: '2500', ACFA_TAB: '0' },   // dif 500
];

const resBrutos = runBrutos(brutosRows, tabRows, mappingBrutos);
assert('al centavo, Brutos ve dos legajos con diferencia',
  summarizeBrutos(resBrutos).unitsWithDiff === 2);
assert('con el monto en $ 100, ve uno solo',
  withTolerance(100, () => summarizeBrutos(resBrutos)).unitsWithDiff === 1);
assert('con el monto en $ 1.000, ninguno',
  withTolerance(1000, () => summarizeBrutos(resBrutos)).unitsWithDiff === 0);
assert('el contador propio del control (conDifSalario) también lo respeta',
  withTolerance(100, () => runBrutos(brutosRows, tabRows, mappingBrutos)).summary.conDifSalario === 1);

// El monto NO puede hacer desaparecer al empleado de la comparación: un sueldo
// de $ 50 sigue siendo un sueldo liquidado, sólo que sin diferencia.
const chicos = runBrutos(
  [{ Legajo: '1', SAL_BASE: '50', A_CTA_FUT_AUMEN: '0' }],
  [{ Legajo: '1', SAL_BASE_TAB: '50', ACFA_TAB: '0' }],
  mappingBrutos,
);
assert('un sueldo menor al monto sigue contando como legajo evaluado',
  withTolerance(1000, () => summarizeBrutos(chicos)).unitsTotal === 1);

// ── 6. Una corrida guardada se relee con SU monto ────────────────────────────

const guardado = stampTolerance(runBrutos(brutosRows, tabRows, mappingBrutos), 100);
assert('el monto queda estampado en los resultados', guardado.diffTolerance === 100);
assert('estampar no pisa uno ya puesto', stampTolerance(guardado, 5).diffTolerance === 100);
assert('un array de resultados no se rompe al estamparlo', Array.isArray(stampTolerance([], 100)));

const ctrlBrutos = CONTROL_REGISTRY.brutos;
assert('summarizeWithTolerance saca el monto de los propios resultados',
  summarizeWithTolerance(ctrlBrutos, guardado).unitsWithDiff === 1);
assert('y no deja el monto puesto para el control siguiente', currentTolerance() === 0.01);

const viejo = runBrutos(brutosRows, tabRows, mappingBrutos);   // sin diffTolerance
assert('una corrida vieja (sin el campo) se lee al centavo, como se midió entonces',
  toleranceOfResults(viejo) === 0.01 && summarizeWithTolerance(ctrlBrutos, viejo).unitsWithDiff === 2);

// ── 7. Resolución: control > cliente > default ───────────────────────────────

assert('cliente sin monto → default', resolveClientTolerance({ name: 'Sanguinetti SA' }) === 0.01);
assert('cliente con monto → el suyo', resolveClientTolerance({ diffTolerance: 250 }) === 250);

const ctrlSinPropio = { id: 'x' };
assert('un control sin ownTolerance hereda el del cliente',
  resolveControlTolerance(ctrlSinPropio, {}, 250) === 250);

const ctrlConPropio = { id: 'y', ownTolerance: { from: m => m?.cfg?.tol, note: 'n' } };
assert('un control con el suyo cargado, manda el suyo',
  resolveControlTolerance(ctrlConPropio, { cfg: { tol: 30 } }, 250) === 30);
assert('con el suyo vacío, vuelve el del cliente',
  resolveControlTolerance(ctrlConPropio, {}, 250) === 250);

const ctrlSoloNota = { id: 'z', ownTolerance: { note: 'no compara importes' } };
assert('un ownTolerance sólo-nota no rompe la resolución',
  resolveControlTolerance(ctrlSoloNota, {}, 250) === 250);

for (const [id, ctrl] of Object.entries(CONTROL_REGISTRY)) {
  if (!ctrl.ownTolerance) continue;
  assert(`${id}: su ownTolerance explica en criollo por qué no usa el monto del cliente`,
    typeof ctrl.ownTolerance.note === 'string' && ctrl.ownTolerance.note.length > 10);
  assert(`${id}: si declara from, es una función`,
    ctrl.ownTolerance.from === undefined || typeof ctrl.ownTolerance.from === 'function');
}

// ── 8. Que no vuelva a nacer un control con el 0,01 cableado ─────────────────
//
// El bug original no era un cálculo mal hecho: era ~47 `0,01` sueltos repartidos
// por `js/controls/`, cada uno decidiendo por su cuenta qué es una diferencia.
// Un `0.01` con nombre está bien (es una tolerancia estructural declarada y
// explicada: cuadrar un asiento, validar contra TOTAL GENERAL, saber si un
// concepto se liquidó); uno suelto adentro de una comparación, no.

const CONTROLS_DIR = 'js/controls';
const sueltos = [];
for (const file of readdirSync(CONTROLS_DIR).filter(f => f.endsWith('.js'))) {
  const src = readFileSync(join(CONTROLS_DIR, file), 'utf8');
  src.split('\n').forEach((line, i) => {
    const codigo = line.replace(/\/\/.*$/, '');            // los comentarios no cuentan
    if (/^\s*const\s+[A-Z_0-9]+\s*=\s*[\d.]+\s*;/.test(codigo)) return;  // constante con nombre
    if (/[<>]=?\s*0\.0+[1-9]/.test(codigo)) sueltos.push(`${file}:${i + 1} — ${line.trim()}`);
  });
}
if (sueltos.length) sueltos.forEach(s => console.error('   ', s));
assert('ningún control decide "es diferencia" con un 0,01 suelto (usan isDiff o una constante con nombre)',
  sueltos.length === 0);

console.log(`\n${ok} ok, ${fail} fail`);
if (fail > 0) process.exit(1);
