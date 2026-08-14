// runWarnings.test.js — Los avisos de la corrida (aditivo 2 del rediseño)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/runWarnings.test.js
//
// Dos cosas que sólo se ven cuando ya es tarde, y por eso están acá como
// assert:
//
//   1. Qué frase queda registrada de cada aviso de "avisa, no traba" (D-036):
//      el que revisa la corrida un mes después lee esto y nada más.
//   2. Que el campo `warnings` del run sea **aditivo de verdad**: una corrida
//      creada como siempre (sin pasar avisos) tiene que seguir guardándose, y
//      una vieja —sin el campo— tiene que seguir leyéndose.

// El aviso de columna sale del tipo declarado en js/exports/contracts.js, que
// arrastra los controles y con ellos módulos de UI que se enganchan al
// `document` al cargar — mismo stub que tests/exportContracts.test.js.
globalThis.document = { addEventListener: () => {} };

import 'fake-indexeddb/auto';
import Dexie from 'dexie';

globalThis.Dexie = Dexie;

const { collectRunWarnings, columnWarningsOf } = await import('./js/ui/runWarnings.js');
const { createControlRun, getControlRun, getControlRuns, createClient, db } = await import('./js/db.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── Qué avisos se registran ──────────────────────────────────────────────────

// Un Tabulado donde la columna elegida para SUELDO trae texto, no importes.
const tabRows = [
  { 'ID_EMPLEADO': '1', '1003-SUELDO': 'MENSUAL', 'APELLIDO_NOMBRE': 'Perez' },
  { 'ID_EMPLEADO': '2', '1003-SUELDO': 'JORNAL',  'APELLIDO_NOMBRE': 'Gomez' },
];

const avisosColumna = columnWarningsOf([
  { fileType: 'tab_control', parsedRows: tabRows, mapping: { tabSalBaseColumn: '1003-SUELDO' } },
]);
assert('la columna con texto donde van importes sale como aviso', avisosColumna.length === 1);
assert('el aviso dice de qué columna habla', avisosColumna[0]?.columna === '1003-SUELDO');

const conSigla = collectRunWarnings([
  { fileType: 'brutos', fileName: 'listado_final.xlsx', siglaMismatch: true },
]);
assert('el archivo con sigla que no coincide queda registrado', conSigla.length === 1);
assert('el aviso de sigla nombra el tipo de archivo y dice que se usó igual',
  /sigla del nombre no coincide/.test(conSigla[0]) && /criterio/.test(conSigla[0]));

const completo = collectRunWarnings([
  { fileType: 'brutos', fileName: 'listado_final.xlsx', siglaMismatch: true },
  { fileType: 'tab_control', parsedRows: tabRows, mapping: { tabSalBaseColumn: '1003-SUELDO' } },
]);
assert('los dos tipos de aviso conviven, el del archivo primero', completo.length === 2
  && /sigla/.test(completo[0]) && /1003-SUELDO/.test(completo[1]));

// El Tabulado entra dos veces (el archivo y las columnas del Paso 2, que viajan
// aparte en tabExtraConfig): el mismo aviso no se cuenta dos veces.
const duplicado = collectRunWarnings([
  { fileType: 'tab_control', parsedRows: tabRows, mapping: { tabSalBaseColumn: '1003-SUELDO' } },
  { fileType: 'tab_control', parsedRows: tabRows, mapping: { tabSalBaseColumn: '1003-SUELDO' } },
]);
assert('un aviso repetido se dice una sola vez', duplicado.length === 1);

assert('sin nada raro no hay avisos que inventar', collectRunWarnings([
  { fileType: 'tab_control', fileName: 'TAB.xlsx', siglaMismatch: false, parsedRows: tabRows, mapping: { apellidoNombreColumn: 'APELLIDO_NOMBRE' } },
]).length === 0);
assert('sin archivos no rompe', collectRunWarnings(undefined).length === 0);

// Una columna declarada ausente (⊘) o una clave que no es columna no son avisos.
assert('una clave de mapeo que no es una columna del archivo no genera aviso',
  columnWarningsOf([{ fileType: 'tab_control', parsedRows: tabRows, mapping: { period: '2026-08' } }]).length === 0);

// ── El campo `warnings` del run ──────────────────────────────────────────────

const clientId = await createClient('Cliente Demo', 'CUIT 20-12345678-9');

const runConAvisos = await createControlRun(clientId, '2026-08', ['brutos'], '', completo);
assert('el run guarda los avisos con los que se corrió',
  (await getControlRun(runConAvisos)).warnings?.length === 2);

const runSinAvisos = await createControlRun(clientId, '2026-07', ['brutos'], 'sin avisos');
assert('crear un run como siempre (sin pasar avisos) sigue funcionando',
  Array.isArray((await getControlRun(runSinAvisos)).warnings)
  && (await getControlRun(runSinAvisos)).warnings.length === 0);

const runBasura = await createControlRun(clientId, '2026-05', ['brutos'], '', ['   ', null, 'un aviso']);
assert('no se guardan avisos vacíos ni basura', (await getControlRun(runBasura)).warnings.length === 1);

// Un run guardado ANTES de que el campo existiera: la pantalla lo lee como
// "sin avisos", no se rompe.
const idViejo = await db.controlRuns.add({
  clientCode: clientId, period: '2026-04', selectedControls: ['brutos'], notes: '',
  isDefinitive: false, createdAt: '2026-04-30T10:00:00.000Z', updatedAt: '2026-04-30T10:00:00.000Z',
});
const viejo = await getControlRun(idViejo);
assert('un run viejo no tiene el campo y se sigue leyendo', viejo.warnings === undefined);
assert('un run viejo se muestra como "sin avisos"', (viejo.warnings || []).length === 0);
assert('los runs del cliente se listan igual que antes', (await getControlRuns(clientId)).length === 4);

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
