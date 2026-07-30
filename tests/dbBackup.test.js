// dbBackup.test.js — Tests de exportDbBackup()/importDbBackup() (T1 de PLAN_v2.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/dbBackup.test.js
//
// Usa Dexie real (la misma librería que carga la app) sobre una IndexedDB
// simulada en memoria (fake-indexeddb), así que ejercita el código real de
// db.js, no una reimplementación de su lógica.

import 'fake-indexeddb/auto';
import Dexie from 'dexie';

globalThis.Dexie = Dexie;

const { exportDbBackup, importDbBackup, createClient, getClients, createControlRun, getControlRuns, db } =
  await import('./js/db.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// Un cliente con dos corridas guardadas, como tendría un analista real.
const clientId = await createClient('Cliente Demo', 'CUIT 20-12345678-9');
await createControlRun(clientId, '2026-06', ['brutos', 'nr'], 'corrida de prueba');
await createControlRun(clientId, '2026-07', ['brutos'], '');

assert('hay 1 cliente antes de exportar', (await getClients()).length === 1);
assert('hay 2 corridas antes de exportar', (await getControlRuns(clientId)).length === 2);

// Exportar
const backup = await exportDbBackup();
assert('el backup tiene el tipo esperado', backup.kind === 'controles-nomina-backup');
assert('el backup guarda la versión de schema vigente', backup.schemaVersion === db.verno);
assert('el backup incluye el cliente', backup.tables.clients.length === 1);
assert('el backup incluye las 2 corridas', backup.tables.controlRuns.length === 2);

// Simular que se guardó algo más encima (lo que reemplazaría un import real)
await createClient('Cliente que no debería sobrevivir al import');
assert('ahora hay 2 clientes (el real + el de prueba)', (await getClients()).length === 2);

// Importar debe reemplazar todo por lo que había en el backup
await importDbBackup(backup);
const clientsAfter = await getClients();
const runsAfter = await getControlRuns(clientId);
assert('después de importar hay 1 solo cliente', clientsAfter.length === 1);
assert('el cliente restaurado es el correcto', clientsAfter[0].name === 'Cliente Demo');
assert('las 2 corridas siguen intactas después de importar', runsAfter.length === 2);
assert('las notas de la corrida se preservaron', runsAfter.some(r => r.notes === 'corrida de prueba'));

// Un archivo que no es un backup válido se rechaza con un error claro
{
  let threw = null;
  try { await importDbBackup({ foo: 'bar' }); }
  catch (e) { threw = e; }
  assert('importDbBackup rechaza un archivo inválido', threw !== null && /respaldo válido/.test(threw.message));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
