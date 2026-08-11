// catXEmpleadosControl.test.js — Test del control "EE x CATEG"
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/catXEmpleadosControl.test.js
//
// Cubre summary.tabTotal/summary.diff: el Tabulado trae una fila por
// liquidación, no por empleado — un legajo con doble liquidación en el mes
// contaba dos veces (tabRows.length) en vez de una (tabByEmp.size), dando un
// "−1" permanente aunque el control diga que todo coincide.
//
// Datos 100% inventados (legajos '1'/'2', apellidos Perez/Gomez).

globalThis.document = { addEventListener: () => {} };

const { runCatXEmpleados, summarizeCatXEmpleados } = await import('./js/controls/catXEmpleados.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const mapping = {
  cat: { idEmpColumn: 'Legajo', apellidoColumn: 'Apellido', nombreColumn: 'Nombre', fBajaColumn: 'F_BAJA' },
  tab: { empleadoColumn: 'Legajo', apellidoNombreColumn: 'Apellido y Nombre' },
};

// ── Caso base: 1 fila del Tabulado por empleado, todo coincide ──────────────

const catBase = [
  { Legajo: '1', Apellido: 'Perez', Nombre: 'Juan' },
  { Legajo: '2', Apellido: 'Gomez', Nombre: 'Ana' },
];
const tabBase = [
  { Legajo: '1', 'Apellido y Nombre': 'Perez Juan' },
  { Legajo: '2', 'Apellido y Nombre': 'Gomez Ana' },
];
const rBase = runCatXEmpleados(catBase, tabBase, mapping);
assert('caso base: tabTotal cuenta 2 empleados', rBase.summary.tabTotal === 2);
assert('caso base: diff es 0 (coinciden)', rBase.summary.diff === 0);
assert('caso base: summarize da status success', summarizeCatXEmpleados(rBase).status === 'success');

// ── El bug real: un legajo con DOS liquidaciones en el Tabulado ─────────────
//
// 2 empleados en Rep. Categ., 2 empleados reales en el Tabulado — pero el
// legajo 1 tiene dos filas (dos liquidaciones el mismo mes). Antes del fix,
// tabTotal contaba 3 (filas crudas) y diff salía en −1 aunque los dos
// archivos coincidan en cantidad de EMPLEADOS.

const tabDoble = [
  { Legajo: '1', 'Apellido y Nombre': 'Perez Juan' },
  { Legajo: '1', 'Apellido y Nombre': 'Perez Juan' },   // segunda liquidación del mismo legajo
  { Legajo: '2', 'Apellido y Nombre': 'Gomez Ana' },
];
const rDoble = runCatXEmpleados(catBase, tabDoble, mapping);
assert('con doble liquidación del mismo legajo, tabTotal sigue contando 2 empleados (no 3 filas)',
  rDoble.summary.tabTotal === 2);
assert('con doble liquidación, diff es 0 — no "−1" con todo coincidiendo',
  rDoble.summary.diff === 0);
assert('summarize() da success, no un headline con diferencia neta falsa',
  summarizeCatXEmpleados(rDoble).status === 'success');

// ── Diferencia real: falta un empleado de verdad en el Tabulado ─────────────

const tabFaltante = [
  { Legajo: '1', 'Apellido y Nombre': 'Perez Juan' },
];
const rFaltante = runCatXEmpleados(catBase, tabFaltante, mapping);
assert('diferencia real (falta legajo 2 en el Tabulado): diff es +1',
  rFaltante.summary.diff === 1);
assert('el legajo faltante se lista en missingInTab',
  rFaltante.missingInTab.some(m => m.id === '2'));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
