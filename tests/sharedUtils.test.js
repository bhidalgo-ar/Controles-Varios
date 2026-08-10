// sharedUtils.test.js — Contrato de las utilidades compartidas.
//
// Estas funciones las usan todos los controles: un cambio de semántica acá se
// propaga a la batería completa. El test fija el contrato que los controles
// asumían cuando cada uno tenía su copia local.
//
// Cubre además que los módulos de control efectivamente parseen: al importar
// utilidades compartidas y dejar la copia local, el módulo tira SyntaxError y
// la app entera no arranca.

import assert from 'node:assert/strict';

globalThis.document = { addEventListener: () => {} };

const { norm, toNum, esc, fmtNum } = await import('./js/utils/textFormatters.js');
const { groupRowsByLegajo, sumColumn, sumTabColumn } = await import('./js/utils/dataAggregation.js');

// ── toNum: sin dato es null, nunca 0 ─────────────────────────────────────────
// Un default silencioso a 0 hace que el control compare contra el Tabulado un
// valor que el archivo no informó, y saque una diferencia fantasma.
assert.equal(toNum(''), null, 'celda vacía debe ser null, no 0');
assert.equal(toNum('   '), null, 'celda con espacios debe ser null, no 0');
assert.equal(toNum(null), null, 'null debe ser null, no 0');
assert.equal(toNum(undefined), null, 'undefined debe ser null, no 0');
assert.equal(toNum('no es un número'), null);
assert.equal(toNum(0), 0, 'un cero informado sí es 0');
assert.equal(toNum('0'), 0);
assert.equal(toNum('1234.56'), 1234.56);
assert.equal(toNum(-500), -500);

// ── norm ─────────────────────────────────────────────────────────────────────
assert.equal(norm('  1234  '), '1234');
assert.equal(norm(null), '');
assert.equal(norm(undefined), '');
assert.equal(norm(0), '0', 'legajo 0 no debe colapsar a string vacío');

// ── esc ──────────────────────────────────────────────────────────────────────
assert.equal(esc('<script>'), '&lt;script&gt;');
assert.equal(esc('a & b'), 'a &amp; b');
assert.equal(esc('dice "hola"'), 'dice &quot;hola&quot;');
assert.equal(esc(null), '');

// ── fmtNum: es-AR, dos decimales, guión para null ───────────────────────────
assert.equal(fmtNum(null), '—');
assert.ok(fmtNum(1234.5).includes(','), 'es-AR usa coma decimal');
assert.equal(fmtNum(0), '0,00');

// ── groupRowsByLegajo: preserva orden, saltea legajo vacío ───────────────────
const rows = [
  { LEG: '100', IMP: 10 },
  { LEG: '200', IMP: 20 },
  { LEG: '100', IMP: 5 },   // segunda liquidación del mismo legajo
  { LEG: '',    IMP: 99 },  // sin legajo: se ignora
];
const groups = groupRowsByLegajo(rows, 'LEG');
assert.deepEqual([...groups.keys()], ['100', '200'], 'orden de aparición y sin vacíos');
assert.equal(groups.get('100').length, 2, 'consolida las dos liquidaciones');

// ── sumColumn: suma entre liquidaciones, null si nadie informa ───────────────
assert.equal(sumColumn(groups.get('100'), 'IMP'), 15, 'suma las dos pagas del mes');
assert.equal(sumColumn(groups.get('100'), 'NO_EXISTE'), null, 'columna ausente es null');
assert.equal(sumColumn(groups.get('100'), null), null, 'columna sin mapear es null');
assert.equal(
  sumColumn([{ IMP: '' }, { IMP: null }], 'IMP'), null,
  'si ninguna liquidación informa, el total es null y no 0'
);
assert.equal(
  sumColumn([{ IMP: '' }, { IMP: 30 }], 'IMP'), 30,
  'una vacía y una con dato suma la que tiene dato'
);

// ── sumTabColumn: fallback por código, string o numérico ─────────────────────
assert.equal(
  sumTabColumn([{ SAL: 100 }], 'SAL', '1003'), 100,
  'con columna mapeada usa la columna'
);
assert.equal(
  sumTabColumn([{ '1003': 700 }], null, '1003'), 700,
  'sin mapeo cae al código como clave string'
);
assert.equal(
  sumTabColumn([{ 1003: 700 }], null, '1003'), 700,
  'sin mapeo cae al código como clave numérica (SheetJS puede leer el header así)'
);
assert.equal(sumTabColumn([{ SAL: 100 }], null, null), null);

// ── Los módulos de control parsean ───────────────────────────────────────────
// Importar una utilidad compartida y dejar además la copia local tira
// "Identifier 'x' has already been declared" y rompe la app completa.
for (const mod of ['nr', 'brutos', 'gsPers']) {
  await import(`./js/controls/${mod}.js`);
}
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
assert.ok(CONTROL_REGISTRY.nr && CONTROL_REGISTRY.brutos && CONTROL_REGISTRY.gs_pers);

console.log('sharedUtils.test.js OK');
