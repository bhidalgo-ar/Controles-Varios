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
// Se agregó "acumuladores_ganancias" (15º), segundo control sobre un archivo de
// Axton — ver specs/control-acumuladores-ganancias.md.
// Se agregó "finadiet_asiento" (16º), el asiento contable de remuneraciones de
// FINADIET — ver specs/finadiet-asiento-remuneraciones.md.
// Se agregó "pop_variaciones" (17º), la variación entre quincenas de OPmobility
// Pilar: el primero que cruza dos Tabulados de AXTON entre sí — ver
// specs/control-variacion-quincenas-pop.md.
// Se agregó "conta_desglosada" (18º), la Contabilidad Desglosada + Asiento de
// COTY: el primero que arma un asiento desde un Tabulado de AXTON — ver
// specs/conta-desglosada-asiento.md.
// Se agregó "control_netos" (19º), el Control de Netos de Sportline: el primero
// que reconstruye un recibo teórico en vez de cruzar dos archivos — ver
// specs/spec-control-netos.md.
assert('el registry tiene los 10 de siempre + agrupadores (T9) + acreditaciones (D-021) + las 2 de variaciones (D-023) + acumuladores ganancias + el asiento de FINADIET + la variación entre quincenas de POP + la contabilidad desglosada de COTY + el Control de Netos',
  controls.length === 19);

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

// ── group.primary — qué selecciona "Seleccionar todos" (D-040) ───────────────
// El botón del Paso 1 filtra por `!ctrl.group || ctrl.group.primary`. Antes
// infería la intención de `group.mode === 'Controlar'`, y como el registry
// tiene cinco modes distintos, un cliente cuyos controles no usan ese string
// —POF ('Sueldos'/'Conceptos'), Axton ('Generar Reporte')— se quedaba con el
// botón sin efecto. Estos asserts fallan si alguien agrega un grupo nuevo y se
// olvida de declarar cuál es su variante principal.
const groups = new Map();
for (const c of controls) {
  if (!c.group) continue;
  if (!groups.has(c.group.id)) groups.set(c.group.id, []);
  groups.get(c.group.id).push(c);
}

for (const [groupId, variants] of groups) {
  assert(`grupo "${groupId}": al menos una variante marcada primary`,
    variants.some(c => c.group.primary === true));
}

// Simula el filtro del botón sobre el registry entero.
const seleccionables = controls.filter(c => !c.group || c.group.primary);
const seleccionablesIds = new Set(seleccionables.map(c => c.id));

// Las variantes "Generar Reporte" de Brutos/GS Pers/NR quedan afuera: son el
// entregable, no el control, y el control gemelo ya está seleccionado.
for (const id of ['brutos_reporte', 'gs_pers_reporte', 'nr_reporte']) {
  assert(`"Seleccionar todos" NO incluye ${id} (es la variante entregable)`,
    !seleccionablesIds.has(id));
}

// Los que antes quedaban afuera por no llamarse 'Controlar'.
for (const id of ['variaciones_sueldos', 'variaciones_conceptos', 'acreditaciones_reporte']) {
  assert(`"Seleccionar todos" incluye ${id} (antes quedaba afuera)`,
    seleccionablesIds.has(id));
}

// Un control sin grupo (no tiene variantes) siempre entra.
const sinGrupo = controls.filter(c => !c.group);
assert('hay controles sin grupo y todos entran en "Seleccionar todos"',
  sinGrupo.length > 0 && sinGrupo.every(c => seleccionablesIds.has(c.id)));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
