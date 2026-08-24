// resumenContract.test.js — El candado: ningún control se queda afuera del
// tablero del Resumen sin que alguien lo declare.
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/resumenContract.test.js
//
// El pedido de Willy sobre este frente fue "que esto no haya que acordarse de
// ponerlo" (§8 de specs/vista-estandar-resumen.md). Tres candados: el tablero es
// del run y un control nuevo entra gratis; la receta de
// .claude/skills/nuevo-control/ lo pide como 6º punto de integración; y este
// test, que recorre el CONTROL_REGISTRY y **falla si un `summarize` no publica
// el sub-objeto `resumen`** — aunque sea la declaración explícita de qué no
// aplica (`notApplicable`).
//
// Mismo patrón que scripts/check-datos-sensibles.mjs: si alguien se olvida, el
// PR sale en rojo y no depende de que nadie se acuerde.
//
// **La lista de excepciones se achica y no crece.** Arrancó con los 20 controles
// que la tanda 1 no migró; cada tanda saca los suyos. Cuando quede vacía, el
// test pasa a proteger a los controles FUTUROS. Agregar una entrada acá es
// declarar deuda: sólo vale con el motivo escrito.

import { readFileSync, readdirSync } from 'node:fs';

globalThis.document = { addEventListener: () => {} };
globalThis.window   = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle ? `\n    ${detalle}` : ''); fail++; }
}

// ── Los que todavía no publican `resumen`, con su tanda ─────────────────────
// El orden es el del §6 de la spec. Cada tanda borra su bloque.
const PENDIENTES = {
  // Tanda 2 — cruce Meta4/Marval — migrada el 2026-08-22 (brutos, gs_pers, nr,
  // rend_vs_tabu, rend_x_ee, rend_vs_asiento).
  // Tanda 3 — Axton / temporales — migrada el 2026-08-22 (agrupadores,
  // novedades_liquidacion, variaciones_sueldos, variaciones_conceptos,
  // pop_variaciones).
  // Tanda 4 — los que generan archivo
  brutos_reporte:         'tanda 4',
  gs_pers_reporte:        'tanda 4',
  nr_reporte:             'tanda 4',
  novedades_importador:   'tanda 4',
  // Tanda 5 — contables + acreditaciones
  finadiet_asiento:       'tanda 5',
  conta_desglosada:       'tanda 5',
  acreditaciones_reporte: 'tanda 5',
  // Tanda 6 — los dos sin cruce de importes
  cat_x_empleados:        'tanda 6',
  acumuladores_ganancias: 'tanda 6',
};

// ── Dónde está escrito cada `summarize` ─────────────────────────────────────
// El registry apunta a funciones con nombre (`summarizeBrutos`), así que el
// cuerpo se encuentra por ese nombre. Se recorta de `function NAME(` hasta la
// siguiente función de nivel superior: un módulo define varios summarize (Brutos
// y Brutos — Generar Reporte viven en el mismo archivo) y hay que mirar el de
// cada uno, no el del vecino. Sin `export` en el patrón a propósito: Variaciones
// define uno solo y lo re-exporta dos veces (`export const summarizeVariacionesSueldos
// = summarizeVariaciones`), y con `export function` ese cuerpo no se encontraba.
const cuerpos = new Map();
for (const file of readdirSync('js/controls').filter(f => f.endsWith('.js'))) {
  const src = readFileSync(`js/controls/${file}`, 'utf8');
  const re = /^(?:export )?function (\w+)\s*\(/gm;
  let m;
  const marcas = [];
  while ((m = re.exec(src)) !== null) marcas.push({ name: m[1], at: m.index });
  marcas.forEach((mk, i) => {
    const hasta = i + 1 < marcas.length ? marcas[i + 1].at : src.length;
    cuerpos.set(mk.name, { file, body: src.slice(mk.at, hasta) });
  });
}

const PUBLICA_RESUMEN = /\bresumen\s*:/;

const conSummarize = Object.entries(CONTROL_REGISTRY).filter(([, e]) => typeof e.summarize === 'function');
assert(`el registry trae ${conSummarize.length} controles con summarize`, conSummarize.length >= 21);

const migrados = [];
const faltan = [];
for (const [id, entry] of conSummarize) {
  const fn = cuerpos.get(entry.summarize.name);
  if (!fn) {
    // Un summarize que no se puede encontrar por nombre no se puede verificar, y
    // "no se pudo verificar" no es "está bien".
    assert(`${id}: el summarize (${entry.summarize.name}) se encuentra en js/controls/`, false);
    continue;
  }
  (PUBLICA_RESUMEN.test(fn.body) ? migrados : faltan).push(id);
}

for (const id of faltan) {
  assert(`${id}: no publica summary.resumen — declarado pendiente (${PENDIENTES[id] || '???'})`,
    PENDIENTES[id] !== undefined,
    'Si es un control nuevo: declaralo con resumenStats() (6º punto de integración de '
    + '.claude/skills/nuevo-control/). Si de verdad no aplica ningún bloque, publicá '
    + '`resumen` con notApplicable — la declaración explícita también cuenta como migrado.');
}

// Una excepción que ya no hace falta también rompe: la lista tiene que achicarse
// sola cuando una tanda migra su lote, sin que nadie se acuerde de limpiarla.
for (const id of Object.keys(PENDIENTES)) {
  assert(`${id}: sigue en la lista de pendientes y todavía no publica resumen`,
    faltan.includes(id),
    migrados.includes(id)
      ? `Ya publica summary.resumen: sacalo de PENDIENTES en este test.`
      : `No existe en el registry con summarize: sacalo de PENDIENTES.`);
}

assert(`${migrados.length} de ${conSummarize.length} controles publican summary.resumen`,
  migrados.length > 0, migrados.join(', '));
assert('el piloto de la tanda 1 (Control de Netos) está migrado',
  migrados.includes('control_netos'));

// ── El 6º punto de integración está escrito en la receta ────────────────────
// El candado blando: todo control nuevo nace por esa skill, así que si el punto
// no está ahí, el control nace sin declarar el resumen y el rojo de arriba lo
// agarra recién en el PR.
{
  const receta = readFileSync('.claude/skills/nuevo-control/SKILL.md', 'utf8');
  assert('la receta de nuevo-control pide declarar summary.resumen',
    receta.includes('resumenStats'));
  assert('...y nombra este test como el candado que lo verifica',
    receta.includes('resumenContract'));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
