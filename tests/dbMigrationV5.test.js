// dbMigrationV5.test.js — Test de la migración de schema v4 → v5 (T5 de PLAN_v2.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/dbMigrationV5.test.js
//
// Arma una base "como si fuera" un navegador real que quedó en v4 (con las
// 3 claves viejas guardadas en fileProfiles), y corre el upgrade() real de
// db.js encima, para confirmar que cada control arranca con la misma
// configuración que tenía antes de migrar.

import 'fake-indexeddb/auto';
import Dexie from 'dexie';

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const DB_NAME = 'controles-nomina';

// 1) Simular una base v4 real: clients ya con `code`, y las 3 claves viejas
//    guardadas en fileProfiles (más una config real de mapeo de columnas,
//    que NO debe migrarse — sigue siendo mapeo de columnas de verdad).
const seedDb = new Dexie(DB_NAME);
seedDb.version(4).stores({
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
});
await seedDb.open();

const now = new Date().toISOString();
const marvalId = await seedDb.table('clients').add({ name: 'Marval', code: 'MARVAL', sourceSystem: 'meta4', active: true, attributes: {}, ccts: [], entityCount: 1, createdAt: now, updatedAt: now });

await seedDb.table('fileProfiles').add({ clientId: marvalId, fileType: 'brutos_tab_config', mapping: { SUELDO: 'COL_A' }, createdAt: now, updatedAt: now });
await seedDb.table('fileProfiles').add({ clientId: marvalId, fileType: 'rendvstabu_concept_grouping', mapping: { '1001': 'PRECIO' }, createdAt: now, updatedAt: now });
await seedDb.table('fileProfiles').add({ clientId: marvalId, fileType: 'rva_config', mapping: { cuentaContab: { '1': 'PRECIO' } }, createdAt: now, updatedAt: now });
// Mapeo de columnas real — no es una de las 3 claves, tiene que sobrevivir intacto.
await seedDb.table('fileProfiles').add({ clientId: marvalId, fileType: 'tabulado_control', mapping: { legajo: 'LEGAJO' }, createdAt: now, updatedAt: now });

// Config huérfana: un fileType legacy colgado de un clientId que no existe
// (simula un cliente borrado). No hay a quién migrársela.
await seedDb.table('fileProfiles').add({ clientId: 999999, fileType: 'rva_config', mapping: { foo: 'bar' }, createdAt: now, updatedAt: now });

seedDb.close();

// 2) Abrir con el db.js real (declara v1..v5) — Dexie corre el upgrade() solo.
globalThis.Dexie = Dexie;
const { getControlConfig, saveControlConfig, getConfig, db } = await import('./js/db.js');

const brutosCfg = await getControlConfig('MARVAL', 'brutos_tab_config');
assert('la config de Brutos migró con el mismo mapping', JSON.stringify(brutosCfg.params) === JSON.stringify({ SUELDO: 'COL_A' }));
assert('quedó con status activo por default', brutosCfg.status === 'activo');

const rendGroupingCfg = await getControlConfig('MARVAL', 'rendvstabu_concept_grouping');
assert('la config de Rend vs Tabu migró con el mismo mapping', JSON.stringify(rendGroupingCfg.params) === JSON.stringify({ '1001': 'PRECIO' }));

const rvaCfg = await getControlConfig('MARVAL', 'rva_config');
assert('la config de Rend vs Asiento migró con el mismo mapping', JSON.stringify(rvaCfg.params) === JSON.stringify({ cuentaContab: { '1': 'PRECIO' } }));

// 3) fileProfiles no se tocó — ni las 3 claves viejas (limpieza es tajada
//    aparte) ni, sobre todo, el mapeo de columnas real.
// Nota: se consulta por `clientCode` porque db.js hoy declara hasta v6 (T10),
// que saca `clientId` del índice de fileProfiles — ver dbMigrationV6.test.js.
const profiles = await db.table('fileProfiles').where('clientCode').equals('MARVAL').toArray();
assert('fileProfiles de Marval sigue con sus 4 filas (nada se borró)', profiles.length === 4);
const tabuladoProfile = profiles.find(p => p.fileType === 'tabulado_control');
assert('el mapeo de columnas real (no una de las 3 claves) sigue intacto', tabuladoProfile && tabuladoProfile.mapping.legajo === 'LEGAJO');

// 4) La config huérfana no se descartó en silencio: quedó anotada.
const orphaned = await getConfig('controlConfigsMigrationOrphaned');
assert('la config huérfana (cliente borrado) queda anotada, no perdida en silencio', orphaned?.some(o => o.clientId === 999999 && o.fileType === 'rva_config'));

// 5) saveControlConfig(): actualizar solo params preserva el status existente.
await saveControlConfig('MARVAL', 'brutos_tab_config', { status: 'forzado_activo', overrideReason: 'cliente pidió forzarlo' });
await saveControlConfig('MARVAL', 'brutos_tab_config', { params: { SUELDO: 'COL_B' } });
const brutosCfgAfter = await getControlConfig('MARVAL', 'brutos_tab_config');
assert('actualizar solo params no pisa el status ya seteado', brutosCfgAfter.status === 'forzado_activo');
assert('el overrideReason tampoco se pierde', brutosCfgAfter.overrideReason === 'cliente pidió forzarlo');
assert('el params sí se actualizó', brutosCfgAfter.params.SUELDO === 'COL_B');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
