// importSeed.test.js — Tests de inspectSeed()/applySeed() (T3 de PLAN_v2.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/importSeed.test.js

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { createClient, createControlRun, getControlRuns, getClientByCode } = await import('./js/db.js');
const { inspectSeed, applySeed, getLoadedSeedMeta, SEED_SCHEMA_VERSION } = await import('./js/seed/importSeed.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

function baseSeed(overrides = {}) {
  return {
    schemaVersion: SEED_SCHEMA_VERSION,
    configVersion: 1,
    updatedAt: '2026-07-30',
    updatedBy: 'gesposito',
    sourceSystems: [{ id: 'meta4', label: 'Meta4' }, { id: 'axton', label: 'Axton' }],
    teams: [{ code: 'EQ_TEST', lead: 'Alguien' }],
    clients: [
      { code: 'ACME', name: 'Acme Demo SA', team: 'EQ_TEST', consultant: 'Ana', complexity: 2, pays: 50, ccts: ['Comercio'], entityCount: 1, sourceSystem: 'meta4', active: true, attributes: { pluriempleo: false } },
      { code: 'DEMOCORP', name: 'Demo Corp SRL', team: 'EQ_TEST', consultant: 'Bruno', complexity: 3, pays: 200, ccts: ['Camioneros'], entityCount: 2, sourceSystem: 'axton', active: true, attributes: { paymentUsd: true } },
    ],
    controlConfigs: [],
    catalogs: [],
    ...overrides,
  };
}

// 1) Seed con schemaVersion incompatible se rechaza, con motivo claro
{
  const inspection = inspectSeed(baseSeed({ schemaVersion: 999 }), null);
  assert('schemaVersion incompatible → compatible=false', inspection.compatible === false);
  assert('schemaVersion incompatible → da un motivo', /schemaVersion/.test(inspection.reason));
}

// 2) Un archivo que no tiene forma de seed también se rechaza
{
  const inspection = inspectSeed({ foo: 'bar' }, null);
  assert('archivo sin forma de seed → compatible=false', inspection.compatible === false);
}

// 3) Primer import: crea los clientes del seed
{
  const seed = baseSeed();
  const inspection = inspectSeed(seed, await getLoadedSeedMeta());
  assert('seed válido y primero → compatible=true', inspection.compatible === true);
  assert('primer import → no hay "loaded" previo', inspection.olderThanLoaded === false);

  const result = await applySeed(seed);
  assert('crea los 2 clientes del seed', result.created.length === 2 && result.updated.length === 0);
  assert('sin conflictos de nombre en el primer import', result.nameConflicts.length === 0);

  const acme = await getClientByCode('ACME');
  assert('ACME quedó con los datos del seed', acme.team === 'EQ_TEST' && acme.pays === 50 && acme.sourceSystem === 'meta4');

  const meta = await getLoadedSeedMeta();
  assert('getLoadedSeedMeta refleja el seed recién importado', meta.configVersion === 1);
}

// 4) Historial real de un cliente sobrevive a un re-import (nunca se toca controlRuns)
{
  const acme = await getClientByCode('ACME');
  await createControlRun(acme.id, '2026-06', ['brutos'], 'corrida real de ACME');

  const seedV2 = baseSeed({ configVersion: 2 });
  seedV2.clients[0].pays = 55; // Willy actualizó la dotación
  const result = await applySeed(seedV2);
  assert('el segundo import actualiza en vez de duplicar', result.created.length === 0 && result.updated.length === 2);

  const acmeAfter = await getClientByCode('ACME');
  assert('el campo actualizado del seed se aplicó', acmeAfter.pays === 55);
  assert('sigue siendo el mismo cliente (mismo id)', acmeAfter.id === acme.id);

  const runs = await getControlRuns(acme.id);
  assert('la corrida real de ACME no se perdió con el re-import', runs.length === 1 && runs[0].notes === 'corrida real de ACME');
}

// 5) Un seed más viejo que el ya cargado se marca, no se rechaza
{
  const olderSeed = baseSeed({ configVersion: 1 }); // ya estamos en v2 local
  const inspection = inspectSeed(olderSeed, await getLoadedSeedMeta());
  assert('seed más viejo → sigue siendo compatible', inspection.compatible === true);
  assert('seed más viejo → olderThanLoaded=true', inspection.olderThanLoaded === true);
}

// 6) Un code que ya existe local con un name distinto se marca como conflicto,
//    y el nombre local NO se pisa en silencio
{
  await createClient('Un Nombre Cualquiera', '', { code: 'CONFLICTIVO' });
  const seedConflict = baseSeed({ configVersion: 3 });
  seedConflict.clients.push({ code: 'CONFLICTIVO', name: 'Nombre Distinto Del Seed', team: '', consultant: '', complexity: 1, pays: 10, ccts: [], entityCount: 1, sourceSystem: 'meta4', active: true, attributes: {} });

  const result = await applySeed(seedConflict);
  assert('el conflicto de nombre se reporta', result.nameConflicts.some(c => c.code === 'CONFLICTIVO'));

  const local = await getClientByCode('CONFLICTIVO');
  assert('el nombre local no se pisó en silencio', local.name === 'Un Nombre Cualquiera');
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
