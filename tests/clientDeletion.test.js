// clientDeletion.test.js — Test de hideClient()/unhideClient()/deleteClient()
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/clientDeletion.test.js
//
// Cubre la auditoría de escalabilidad: deleteClient() no borraba
// controlRuns/controlRunFiles/controlRunResults/controlConfigs — los datos
// de empleados de un cliente "borrado" sobrevivían y podían reaparecerle a
// un cliente nuevo que reusara el mismo `code` (uniqueClientCode sólo evita
// colisión contra clientes que siguen en la tabla `clients`). El fix: el
// borrado del día a día pasa a ser hideClient() (reversible, no toca datos,
// reserva el code para siempre) y deleteClient() queda como acción aparte,
// irreversible, con la cascada completa.

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const {
  createClient, getClient, getClients, getInactiveClients, hideClient, unhideClient, deleteClient,
  createControlRun, saveControlRunFile, saveControlRunResults, saveControlConfig,
  getControlRuns, getControlRunFiles, getControlRunResults, getControlConfig,
  createGrouper, getGroupers,
} = await import('./js/db.js');

// ── Fixture: un cliente con datos en las 4 tablas que faltaban en la cascada ─

const clientId = await createClient('Cliente Test Borrado');
const client = await getClient(clientId);
const code = client.code;

const runId = await createControlRun(code, '2026-06', ['brutos'], 'corrida real');
await saveControlRunFile(runId, 'tab_control', 'tabulado.xlsx', [{ Legajo: '1', Nombre: 'Sanguinetti Javier' }], {}, {});
await saveControlRunResults(runId, 'brutos', { ok: true, rows: [{ legajo: '1' }] });
await saveControlConfig(code, 'brutos', { params: { salBaseCode: '1003' } });
await createGrouper(code, 'Sueldos');

assert('fixture: la corrida quedó guardada', (await getControlRuns(code)).length === 1);
assert('fixture: el archivo de la corrida quedó guardado', (await getControlRunFiles(runId)).length === 1);
assert('fixture: los resultados de la corrida quedaron guardados', (await getControlRunResults(runId)).length === 1);
assert('fixture: la config del control quedó guardada', (await getControlConfig(code, 'brutos'))?.params?.salBaseCode === '1003');

// ── hideClient(): reversible, no toca ninguna de las 4 tablas ───────────────

await hideClient(clientId);
const afterHide = await getClient(clientId);
assert('hideClient() marca el cliente inactivo', afterHide.active === false);
assert('hideClient() NO borra la corrida', (await getControlRuns(code)).length === 1);
assert('hideClient() NO borra el archivo de la corrida', (await getControlRunFiles(runId)).length === 1);
assert('hideClient() NO borra los resultados de la corrida', (await getControlRunResults(runId)).length === 1);
assert('hideClient() NO borra la config del control', (await getControlConfig(code, 'brutos')) !== undefined);
assert('hideClient() NO borra los agrupadores', (await getGroupers(code)).length === 1);

assert('un cliente oculto no aparece en getClients()', !(await getClients()).some(c => c.id === clientId));
assert('un cliente oculto SÍ aparece en getInactiveClients()', (await getInactiveClients()).some(c => c.id === clientId));

// El code sigue reservado — un cliente nuevo con el mismo nombre no puede
// terminar heredando (por code duplicado) las corridas del oculto.
const clientId2 = await createClient('Cliente Test Borrado');
const client2 = await getClient(clientId2);
assert('un cliente nuevo con el mismo nombre que uno oculto NO reusa su code',
  client2.code !== code);
assert('el cliente nuevo no ve la corrida del cliente oculto (codes distintos)',
  (await getControlRuns(client2.code)).length === 0);

// ── unhideClient(): vuelve a aparecer, con todo intacto ─────────────────────

await unhideClient(clientId);
assert('unhideClient() vuelve a marcar el cliente activo', (await getClient(clientId)).active === true);
assert('un cliente reactivado vuelve a aparecer en getClients()', (await getClients()).some(c => c.id === clientId));
assert('un cliente reactivado ya no aparece en getInactiveClients()', !(await getInactiveClients()).some(c => c.id === clientId));
assert('la corrida sigue intacta después de reactivar', (await getControlRuns(code)).length === 1);

// ── deleteClient(): cascada COMPLETA, incluidas las 4 tablas que faltaban ───

await deleteClient(clientId);
assert('deleteClient() borra la corrida (controlRuns)', (await getControlRuns(code)).length === 0);
assert('deleteClient() borra los archivos de la corrida (controlRunFiles)', (await getControlRunFiles(runId)).length === 0);
assert('deleteClient() borra los resultados de la corrida (controlRunResults)', (await getControlRunResults(runId)).length === 0);
assert('deleteClient() borra la config del control (controlConfigs)', (await getControlConfig(code, 'brutos')) === undefined);
assert('deleteClient() borra los agrupadores (ya lo hacía)', (await getGroupers(code)).length === 0);
assert('deleteClient() borra al cliente mismo', await getClient(clientId) === undefined);

// Después de un borrado DEFINITIVO (no oculto), el code sí queda libre —
// a diferencia de hideClient(), acá la fila de `clients` ya no existe.
const clientId3 = await createClient('Cliente Test Borrado');
const client3 = await getClient(clientId3);
assert('después de deleteClient() (definitivo), un cliente nuevo con el mismo nombre SÍ puede reusar el code',
  client3.code === code);

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
