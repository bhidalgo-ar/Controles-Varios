// dbMigrationV6.test.js — Test de la migración de schema v5 → v6 (T10 de PLAN_v2.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/dbMigrationV6.test.js
//
// Arma una base "como si fuera" un navegador real que quedó en v5 (con
// `groupers`/`fileProfiles`/`sessions`/`controlRuns`/`clientCatalogs` todavía
// indexadas por `clientId`), y corre el upgrade() real de db.js encima para
// confirmar que las 5 tablas quedan accesibles por `clientCode` sin perder
// ningún dato, y que lo huérfano (cliente ya borrado) queda anotado, no
// descartado en silencio — mismo criterio que dbMigrationV4/V5.test.js.

import 'fake-indexeddb/auto';
import Dexie from 'dexie';

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const DB_NAME = 'controles-nomina';

// 1) Simular una base v5 real, con el mismo schema que db.js declaraba antes de T10.
const seedDb = new Dexie(DB_NAME);
seedDb.version(5).stores({
  clients:           '++id, &code, name, sourceSystem, active, team',
  groupers:          '++id, clientId, name',
  grouperConcepts:   '++id, grouperId, conceptCode, [grouperId+conceptCode]',
  fileProfiles:      '++id, clientId, fileType, [clientId+fileType]',
  sessions:          '++id, clientId, period, isDefinitive, [clientId+period]',
  sessionFiles:      '++id, sessionId, fileType',
  sessionResults:    '++id, sessionId',
  appConfig:         'key',
  controlRuns:       '++id, clientId, period, isDefinitive, createdAt, [clientId+period]',
  controlRunFiles:   '++id, controlRunId, fileType, [controlRunId+fileType]',
  controlRunResults: '++id, controlRunId, controlId, [controlRunId+controlId]',
  clientCatalogs:    'clientId',
  controlConfigs:    '[clientCode+controlId], clientCode, controlId, status',
});
await seedDb.open();

const now = new Date().toISOString();
const marvalId = await seedDb.table('clients').add({
  name: 'Marval', code: 'MARVAL', sourceSystem: 'meta4', active: true,
  attributes: {}, ccts: [], entityCount: 1, createdAt: now, updatedAt: now,
});

const grouperId = await seedDb.table('groupers').add({ clientId: marvalId, name: 'Sueldos', color: '', createdAt: now, updatedAt: now });
await seedDb.table('grouperConcepts').add({ grouperId, conceptCode: '1001', conceptLabel: 'Sueldo básico' });
await seedDb.table('fileProfiles').add({ clientId: marvalId, fileType: 'tab_control', mapping: { legajo: 'LEGAJO' }, createdAt: now, updatedAt: now });
const sessionId = await seedDb.table('sessions').add({ clientId: marvalId, period: '2026-06', isDefinitive: true, createdAt: now, updatedAt: now });
await seedDb.table('sessionResults').add({ sessionId, totalDiffs: 0, computedAt: now });
const runId = await seedDb.table('controlRuns').add({ clientId: marvalId, period: '2026-06', selectedControls: ['brutos'], notes: 'corrida real', isDefinitive: true, createdAt: now, updatedAt: now });
await seedDb.table('controlRunResults').add({ controlRunId: runId, controlId: 'brutos', results: { ok: true }, computedAt: now });
await seedDb.table('clientCatalogs').put({ clientId: marvalId, rows: [{ code: '1001', label: 'Sueldo básico' }], fileName: 'catalogo.xlsx', parseMetadata: {}, createdAt: now, updatedAt: now });

// Datos huérfanos: colgados de un clientId que no existe (cliente borrado).
// No hay a quién migrárselos — tienen que quedar anotados, no perdidos.
await seedDb.table('groupers').add({ clientId: 999999, name: 'Huérfano', color: '', createdAt: now, updatedAt: now });

seedDb.close();

// 2) Abrir con el db.js real (declara v1..v6) — Dexie corre el upgrade() solo.
globalThis.Dexie = Dexie;
const {
  getGroupers, getGrouperConcepts, getFileProfile, getControlRuns, getClientCatalog,
  getConfig, createClient, deleteClient, createGrouper, db,
} = await import('./js/db.js');

// 3) Las 5 tablas quedan accesibles por clientCode, con el dato intacto.
const groupers = await getGroupers('MARVAL');
assert('el grouper de Marval sigue ahí, ahora por clientCode', groupers.length === 1 && groupers[0].name === 'Sueldos');
assert('el grouper conserva su id (FK de grouperConcepts no se tocó)', groupers[0].id === grouperId);

const concepts = await getGrouperConcepts(groupers[0].id);
assert('los conceptos del grouper de Marval siguen intactos', concepts.length === 1 && concepts[0].conceptCode === '1001');

const profile = await getFileProfile('MARVAL', 'tab_control');
assert('el mapeo de columnas de Marval sigue intacto', profile && profile.mapping.legajo === 'LEGAJO');

const sessionsRaw = await db.table('sessions').where('clientCode').equals('MARVAL').toArray();
assert('la sesión de Marval sigue ahí, ahora por clientCode', sessionsRaw.length === 1 && sessionsRaw[0].period === '2026-06');

const runs = await getControlRuns('MARVAL');
assert('la corrida de Marval sigue ahí con sus notas', runs.length === 1 && runs[0].notes === 'corrida real');

const catalog = await getClientCatalog('MARVAL');
assert('el catálogo de Marval sigue ahí, ahora resoluble por clientCode', catalog && catalog.rows.length === 1 && catalog.rows[0].code === '1001');

// 4) Ya no se puede consultar por clientId — el índice viejo se sacó a propósito.
let clientIdQueryFailed = false;
try {
  await db.table('groupers').where('clientId').equals(marvalId).toArray();
} catch (e) {
  clientIdQueryFailed = true;
}
assert('groupers ya no está indexado por clientId (T10 completó la migración)', clientIdQueryFailed);

// 5) Lo huérfano no se perdió en silencio: quedó anotado.
const orphaned = await getConfig('clientCodeMigrationOrphaned');
assert(
  'el grouper huérfano (cliente borrado) queda anotado, no perdido en silencio',
  orphaned?.some(o => o.table === 'groupers' && o.clientId === 999999)
);
const orphanedGrouperStillHasNoCode = (await db.table('groupers').toArray())
  .find(g => g.name === 'Huérfano')?.clientCode === undefined;
assert('el grouper huérfano no recibió un clientCode inventado', orphanedGrouperStillHasNoCode);

// 6) Clientes/grupos creados después de migrar quedan bien formados (sin clientId).
const nuevoId = await createClient('Cliente Nuevo T10');
const nuevoGrouperId = await createGrouper('CLIENTE_NUEVO_T10', 'Otro agrupador');
const nuevoGrouper = await db.table('groupers').get(nuevoGrouperId);
assert('un grouper nuevo se guarda con clientCode y sin clientId', nuevoGrouper.clientCode === 'CLIENTE_NUEVO_T10' && nuevoGrouper.clientId === undefined);

// 7) deleteClient() sigue borrando en cascada, ahora resolviendo por clientCode.
await deleteClient(nuevoId);
const afterDelete = await getGroupers('CLIENTE_NUEVO_T10');
assert('deleteClient() borra los groupers del cliente (cascada por clientCode)', afterDelete.length === 0);

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
