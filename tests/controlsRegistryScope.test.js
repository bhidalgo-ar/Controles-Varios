// controlsRegistryScope.test.js — Test de scope/scopeMeta/appliesWhen (T4 de PLAN_v2.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/controlsRegistryScope.test.js
//
// Cubre la forma de cada entrada del registry (scope/scopeMeta/appliesWhen
// existen y tienen el tipo correcto) y que appliesWhen en sí — el predicado
// fino sobre atributos del cliente — sigue siendo un no-op en los 11
// controles. La clasificación real por scope (quién ve qué control) se
// prueba aparte en tests/controlsScope.test.js — ver
// specs/segmentacion-controles-por-cliente.md.
//
// registry.js importa (transitivamente) módulos de UI que registran un
// listener a nivel de módulo (ej. exportMenu.js) — necesitan un `document`
// mínimo para poder importarse fuera del navegador. No se ejercita nada de
// esos módulos acá, solo hace falta que el import no reviente.
globalThis.document = { addEventListener: () => {} };

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const controls = Object.values(CONTROL_REGISTRY);
// T9: se agregó "agrupadores" (11º control, el viejo cruce por agrupadores
// reimplementado como control del registry — ver specs/plan-v2-t9-t10.md).
// D-021: se agregó "acreditaciones_reporte" (12º), el primer control sobre un
// archivo de Axton — ver specs/control-acreditaciones-axton.md.
// D-023: se agregaron "variaciones_sueldos" y "variaciones_conceptos" (13º y 14º),
// los primeros que cruzan el Tabulado contra el Tabulado de otro período — ver
// specs/reporte-variaciones-opmobility.md.
assert('el registry tiene los 10 de siempre + agrupadores (T9) + acreditaciones (D-021) + las 2 de variaciones (D-023)',
  controls.length === 14);

for (const c of controls) {
  assert(`${c.id}: tiene scope`, typeof c.scope === 'string');
  assert(`${c.id}: tiene scopeMeta (objeto)`, typeof c.scopeMeta === 'object' && c.scopeMeta !== null);
  assert(`${c.id}: appliesWhen es función`, typeof c.appliesWhen === 'function');
}

// Comportamiento a preservar: para un cliente sin atributos especiales, los
// 10 controles siguen aplicando exactamente igual que antes de T4.
const clienteSinAtributos = { code: 'GENERICO', attributes: {} };
for (const c of controls) {
  assert(`${c.id}: aplica a un cliente sin atributos especiales (default no-op)`, c.appliesWhen(clienteSinAtributos) === true);
}

// Ningún control real quedó atado todavía a pluriempleo/paymentUsd/holding —
// son ejemplos de predicado documentados para cuando exista un control real
// que los necesite (ver ARCHITECTURE.md §4), no ataduras inventadas hoy.
const clienteConTodosLosAtributos = { code: 'CON_TODO', attributes: { pluriempleo: true, paymentUsd: true, holding: true, retroactividad: true } };
for (const c of controls) {
  assert(`${c.id}: sigue aplicando igual aunque el cliente tenga todos los atributos activados`, c.appliesWhen(clienteConTodosLosAtributos) === true);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
