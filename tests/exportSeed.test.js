// exportSeed.test.js — Test de buildSeedExport() (T6 de PLAN_v2.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/exportSeed.test.js
//
// Confirma que lo que arma el modo admin para exportar tiene exactamente el
// shape que importSeed.js (T3) sabe leer — no un formato paralelo — y que
// un re-import de ese mismo archivo no rompe nada (ni duplica clientes ni
// pierde corridas ya guardadas).

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { createClient, createControlRun, getControlRuns, getClientByCode, saveControlConfig, getControlConfig } = await import('./js/db.js');
const { applySeed, SEED_SCHEMA_VERSION } = await import('./js/seed/importSeed.js');
const { buildSeedExport } = await import('./js/seed/exportSeed.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// 1) Un cliente con datos completos + una config de control guardada.
const acmeId = await createClient('Acme Demo SA', '', {
  code: 'ACME', sourceSystem: 'meta4', team: 'EQ_TEST', consultant: 'Alguien',
  ccts: ['Comercio'], pays: 50, attributes: { pluriempleo: true },
});
await saveControlConfig('ACME', 'brutos', { status: 'activo', params: { SUELDO: 'COL_A' } });
await createControlRun(acmeId, '2026-06', ['brutos'], 'corrida real de ACME');

const seed = await buildSeedExport('willy');

assert('el seed exportado usa el mismo schemaVersion que espera el import', seed.schemaVersion === SEED_SCHEMA_VERSION);
assert('configVersion arranca en 1 cuando nunca se importó nada antes', seed.configVersion === 1);
assert('trae el cliente con sus datos', seed.clients.some(c => c.code === 'ACME' && c.team === 'EQ_TEST' && c.consultant === 'Alguien' && c.pays === 50));
assert('trae los atributos del cliente', seed.clients.find(c => c.code === 'ACME').attributes.pluriempleo === true);
assert('trae la config de control guardada', seed.controlConfigs.some(c => c.clientCode === 'ACME' && c.controlId === 'brutos' && c.params.SUELDO === 'COL_A'));

// 2) Editar algo (como haría un admin) y volver a exportar: configVersion avanza.
await applySeed(seed); // simula que este mismo navegador ya "cargó" un seed antes
const acmeBefore = await getClientByCode('ACME');
await createClient('Cliente Nuevo Desde Admin', '', { code: 'NUEVO', sourceSystem: 'axton' });

const seed2 = await buildSeedExport('willy');
assert('configVersion avanza respecto del último seed cargado', seed2.configVersion === seed.configVersion + 1);
assert('el segundo export ya incluye el cliente agregado después del primero', seed2.clients.some(c => c.code === 'NUEVO'));

// 3) Re-importar el export (como haría el segundo navegador) no duplica
//    clientes ni pierde la corrida real ya guardada.
const result = await applySeed(seed2);
assert('re-importar el propio export no crea clientes de más (upsert por code)', result.created.length === 0 && result.updated.length >= 1);

const runsAfter = await getControlRuns(acmeId);
assert('la corrida real de ACME sigue intacta después del roundtrip', runsAfter.length === 1 && runsAfter[0].notes === 'corrida real de ACME');

const acmeCfgAfter = await getControlConfig('ACME', 'brutos');
assert('la config de control de ACME sigue intacta después del roundtrip', acmeCfgAfter.params.SUELDO === 'COL_A');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
