// dbMigrationV4.test.js — Test de la migración de schema v3 → v4 (T2 de PLAN_v2.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/dbMigrationV4.test.js
//
// Arma una base "como si fuera" un navegador real que quedó en v3 (antes de
// que existiera `code`), con clientes cuyo nombre colisiona en el slug y con
// datos colgando de un cliente (grouper, sesión, corrida, catálogo) — y
// corre el upgrade() real de db.js encima, para confirmar que nada de eso
// se pierde ni cambia de dueño.

import 'fake-indexeddb/auto';
import Dexie from 'dexie';

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const DB_NAME = 'controles-nomina';

// 1) Simular una base v3 real, con el mismo schema que db.js declaraba antes de T2.
const seedDb = new Dexie(DB_NAME);
seedDb.version(3).stores({
  clients:           '++id, name, createdAt',
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
});
await seedDb.open();

const now = new Date().toISOString();
const marvalId = await seedDb.table('clients').add({ name: 'Marval', notes: '', createdAt: now, updatedAt: now });
// Dos clientes que van a colisionar en el slug (mismo nombre, distinto acento/mayúsculas)
const cafeAId = await seedDb.table('clients').add({ name: 'Café del Norte', notes: '', createdAt: now, updatedAt: now });
const cafeBId = await seedDb.table('clients').add({ name: 'CAFE DEL NORTE', notes: '', createdAt: now, updatedAt: now });

// Historial real colgando de Marval — esto es lo que NO se puede perder
const grouperId = await seedDb.table('groupers').add({ clientId: marvalId, name: 'Sueldos', color: '', createdAt: now, updatedAt: now });
await seedDb.table('grouperConcepts').add({ grouperId, conceptCode: '1001', conceptLabel: 'Sueldo básico' });
const sessionId = await seedDb.table('sessions').add({ clientId: marvalId, period: '2026-06', isDefinitive: true, createdAt: now, updatedAt: now });
await seedDb.table('sessionResults').add({ sessionId, totalDiffs: 0, computedAt: now });
const runId = await seedDb.table('controlRuns').add({ clientId: marvalId, period: '2026-06', selectedControls: ['brutos'], notes: 'corrida real', isDefinitive: true, createdAt: now, updatedAt: now });
await seedDb.table('controlRunResults').add({ controlRunId: runId, controlId: 'brutos', results: { ok: true }, computedAt: now });
await seedDb.table('clientCatalogs').put({ clientId: marvalId, rows: [{ code: '1001', label: 'Sueldo básico' }], fileName: 'catalogo.xlsx', parseMetadata: {}, createdAt: now, updatedAt: now });

seedDb.close();

// 2) Abrir con el db.js real (declara v1..v4) — Dexie corre el upgrade() solo.
globalThis.Dexie = Dexie;
const { getClients, getClientByCode, createClient, db } = await import('./js/db.js');

const clients = await getClients();
assert('siguen los 3 clientes después de migrar', clients.length === 3);

const marval = clients.find(c => c.id === marvalId);
assert('Marval tiene un code', marval.code === 'MARVAL');
assert('Marval quedó con sourceSystem meta4 por default', marval.sourceSystem === 'meta4');
assert('Marval quedó activo por default', marval.active === true);
assert('Marval tiene attributes/ccts/entityCount por default', JSON.stringify(marval.attributes) === '{}' && marval.ccts.length === 0 && marval.entityCount === 1);

const cafeA = clients.find(c => c.id === cafeAId);
const cafeB = clients.find(c => c.id === cafeBId);
assert('los dos "Café del Norte" tienen codes distintos (colisión resuelta)', cafeA.code !== cafeB.code);
assert('uno de los dos quedó con el code base CAFE_DEL_NORTE', [cafeA.code, cafeB.code].includes('CAFE_DEL_NORTE'));
assert('el otro quedó con un sufijo numérico', [cafeA.code, cafeB.code].some(c => /CAFE_DEL_NORTE_\d+/.test(c)));

assert('getClientByCode encuentra a Marval por code', (await getClientByCode('MARVAL'))?.id === marvalId);

// 3) Nada del historial de Marval se perdió ni cambió de dueño.
// Nota: db.js hoy declara hasta v6 (T10), que migra estas 3 tablas de
// `clientId` a `clientCode` — por eso se consulta acá por `clientCode` (ya no
// está indexado por `clientId`, ver dbMigrationV6.test.js para el detalle de
// esa migración puntual). Lo que este test verifica (T2) sigue intacto: el
// dato sobrevive completo, sin cambiar de dueño, a través de toda la cadena.
const groupers = await db.table('groupers').where('clientCode').equals(marval.code).toArray();
assert('el grouper de Marval sigue ahí', groupers.length === 1 && groupers[0].name === 'Sueldos');

const sessions = await db.table('sessions').where('clientCode').equals(marval.code).toArray();
assert('la sesión de Marval sigue ahí', sessions.length === 1 && sessions[0].period === '2026-06');

const runs = await db.table('controlRuns').where('clientCode').equals(marval.code).toArray();
assert('la corrida de Marval sigue ahí con sus notas', runs.length === 1 && runs[0].notes === 'corrida real');

const catalog = await db.table('clientCatalogs').get(marvalId);
assert('el catálogo de Marval sigue ahí', catalog && catalog.rows.length === 1);

// 4) Clientes nuevos, creados después de migrar, también quedan bien formados
const dupId = await createClient('Marval'); // mismo nombre que uno ya migrado
const dup = (await getClients()).find(c => c.id === dupId);
assert('un cliente nuevo con nombre repetido no choca de code con el existente', dup.code !== marval.code);

const manualId = await createClient('Cliente con código manual', '', { code: 'raro-con espacios!' });
const manual = (await getClients()).find(c => c.id === manualId);
assert('un code manual con espacios/símbolos se normaliza igual que uno automático', manual.code === 'RARO_CON_ESPACIOS');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
