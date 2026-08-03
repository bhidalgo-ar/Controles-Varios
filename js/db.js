// db.js — La base de datos local de la app
//
// Usamos Dexie.js, que es una capa amigable sobre IndexedDB.
// IndexedDB es como el "cajón de archivos" del navegador: guarda datos
// aunque el usuario cierre la pestaña o apague la computadora.
//
// Dexie (cargado desde el CDN en index.html) está disponible como variable global.
/* global Dexie */

const db = new Dexie('controles-nomina');

// Acá definimos las "tablas" de la base de datos y qué campos se pueden buscar.
// El '++id' significa que el id se genera automáticamente (1, 2, 3...).
db.version(1).stores({
  clients:         '++id, name, createdAt',
  groupers:        '++id, clientId, name',
  grouperConcepts: '++id, grouperId, conceptCode, [grouperId+conceptCode]',
  fileProfiles:    '++id, clientId, fileType, [clientId+fileType]',
  sessions:        '++id, clientId, period, isDefinitive, [clientId+period]',
  sessionFiles:    '++id, sessionId, fileType',
  sessionResults:  '++id, sessionId',
  appConfig:       'key',
});

// v2 — agrega las tablas del sistema de controles
db.version(2).stores({
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
});

// v3 — agrega tabla de Catálogo de Conceptos por cliente
db.version(3).stores({
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
  clientCatalogs:    'clientId',  // uno por cliente, clientId es la clave primaria
});

// v4 — agrega `code` como identidad estable de cliente (D-004), en paralelo a
// `++id` (que sigue siendo la clave primaria interna — migración aditiva,
// ver PLAN_v2.md §1 / DECISIONS.md D-011). El resto de las tablas no cambia:
// `clientId` sigue siendo la FK que usan groupers/sessions/controlRuns/etc.
db.version(4).stores({
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
}).upgrade(tx => {
  // Backfill: a cada cliente existente le asignamos un code único (slug del
  // name, con sufijo numérico si dos clientes generan el mismo slug) y los
  // defaults del resto de los campos nuevos. No toca ninguna otra tabla.
  const usedCodes = new Set();
  return tx.table('clients').toCollection().modify(client => {
    const base = slugifyClientCode(client.name);
    let code = base;
    let n = 2;
    while (usedCodes.has(code)) { code = `${base}_${n}`; n++; }
    usedCodes.add(code);

    client.code          = code;
    client.sourceSystem   = client.sourceSystem || 'meta4';
    client.active         = client.active !== undefined ? client.active : true;
    client.attributes     = client.attributes || {};
    client.ccts           = client.ccts || [];
    client.entityCount    = client.entityCount || 1;
  });
});

// v5 — agrega controlConfigs: config de controles por cliente, separada de
// fileProfiles (que vuelve a ser solo mapeo de columnas — ARCHITECTURE.md
// §4). Migra las 3 claves que hoy viven mal en fileProfiles
// ('brutos_tab_config', 'rendvstabu_concept_grouping', 'rva_config',
// compartidas entre varios controles — ver controlsWizard.js) resolviendo
// clientId → clientCode. No borra fileProfiles: sigue existiendo para
// mapeo de columnas real, y las 3 claves viejas quedan sin usarse (cleanup
// posterior, no bloquea T5 — ver specs/plan-v2-t0-t6.md).
const LEGACY_CONTROL_CONFIG_KEYS = ['brutos_tab_config', 'rendvstabu_concept_grouping', 'rva_config'];

db.version(5).stores({
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
}).upgrade(async tx => {
  const clients  = await tx.table('clients').toArray();
  const byId     = new Map(clients.map(c => [c.id, c]));
  const profiles = await tx.table('fileProfiles').where('fileType').anyOf(LEGACY_CONTROL_CONFIG_KEYS).toArray();

  const orphaned = [];
  for (const p of profiles) {
    const client = byId.get(p.clientId);
    if (!client || !client.code) {
      // Cliente borrado, o sin code por algún motivo — no hay a quién
      // migrarle esta config. No se descarta en silencio: queda anotado
      // en appConfig (ver abajo) para que se pueda revisar si hace falta.
      orphaned.push({ clientId: p.clientId, fileType: p.fileType });
      continue;
    }
    await tx.table('controlConfigs').put({
      clientCode: client.code,
      controlId: p.fileType,
      status: 'activo',
      overrideReason: null,
      params: p.mapping,
    });
  }
  if (orphaned.length) {
    await tx.table('appConfig').put({ key: 'controlConfigsMigrationOrphaned', value: orphaned });
  }
});

// v6 — cierre de la migración a `clientCode` (T10, opcional, ver PLAN_v2.md
// §T10 / DECISIONS.md D-011 y D-015). Las FK de `groupers`, `fileProfiles`,
// `sessions` y `controlRuns` pasan de `clientId` a `clientCode`: se agrega
// `clientCode` como índice nuevo y se saca `clientId` del índice (Dexie no
// permite dejar de indexar un campo "a medias" — o está en la lista de
// índices de `stores()` o no lo está). El campo `clientId` sigue presente en
// los objetos ya guardados (Dexie no borra datos al sacar un índice), pero
// ninguna escritura nueva lo llena ni ninguna consulta lo usa.
//
// `clientCatalogs` es la excepción: hoy su primary key ES `clientId` (no hay
// `++id`), y Dexie no soporta cambiar la primary key de una tabla existente
// (`UpgradeError: Not yet support for changing primary key` — confirmado
// probándolo antes de escribir esta migración). Se agrega `clientCode` como
// índice secundario y la tabla sigue usando `clientId` como primary key por
// dentro; `getClientCatalog`/`saveClientCatalog`/`deleteClientCatalog` siguen
// hablando en `clientCode` hacia afuera, resolviendo el `clientId` real sólo
// para la operación de bajo nivel.
db.version(6).stores({
  clients:           '++id, &code, name, sourceSystem, active, team',
  groupers:          '++id, clientCode, name',
  grouperConcepts:   '++id, grouperId, conceptCode, [grouperId+conceptCode]',
  fileProfiles:      '++id, clientCode, fileType, [clientCode+fileType]',
  sessions:          '++id, clientCode, period, isDefinitive, [clientCode+period]',
  sessionFiles:      '++id, sessionId, fileType',
  sessionResults:    '++id, sessionId',
  appConfig:         'key',
  controlRuns:       '++id, clientCode, period, isDefinitive, createdAt, [clientCode+period]',
  controlRunFiles:   '++id, controlRunId, fileType, [controlRunId+fileType]',
  controlRunResults: '++id, controlRunId, controlId, [controlRunId+controlId]',
  clientCatalogs:    'clientId, clientCode',
  controlConfigs:    '[clientCode+controlId], clientCode, controlId, status',
}).upgrade(async tx => {
  const clients = await tx.table('clients').toArray();
  const byId    = new Map(clients.map(c => [c.id, c]));
  const orphaned = [];

  // Resuelve clientId → code; si el cliente ya no existe (o quedó sin code
  // por algún motivo), no se descarta en silencio — se anota para revisar,
  // mismo criterio que usó la migración de v5.
  const resolveCode = (clientId, table) => {
    const client = byId.get(clientId);
    if (client?.code) return client.code;
    orphaned.push({ table, clientId });
    return null;
  };

  await tx.table('groupers').toCollection().modify(row => {
    const code = resolveCode(row.clientId, 'groupers');
    if (code) row.clientCode = code;
  });
  await tx.table('fileProfiles').toCollection().modify(row => {
    const code = resolveCode(row.clientId, 'fileProfiles');
    if (code) row.clientCode = code;
  });
  await tx.table('sessions').toCollection().modify(row => {
    const code = resolveCode(row.clientId, 'sessions');
    if (code) row.clientCode = code;
  });
  await tx.table('controlRuns').toCollection().modify(row => {
    const code = resolveCode(row.clientId, 'controlRuns');
    if (code) row.clientCode = code;
  });
  await tx.table('clientCatalogs').toCollection().modify(row => {
    const code = resolveCode(row.clientId, 'clientCatalogs');
    if (code) row.clientCode = code;
  });

  if (orphaned.length) {
    await tx.table('appConfig').put({ key: 'clientCodeMigrationOrphaned', value: orphaned });
  }
});

// Convierte un nombre de cliente en un `code` legible (MAYÚSCULAS, sin
// acentos, sin espacios). Usado tanto por el backfill de arriba como por
// createClient() para clientes nuevos.
function slugifyClientCode(name) {
  const slug = String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // saca acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'CLIENTE';
}

// Encuentra un `code` libre a partir de uno candidato, contra la tabla real
// (a diferencia del backfill de la migración, esto corre en vivo).
async function uniqueClientCode(candidate) {
  let code = candidate;
  let n = 2;
  while (await db.clients.where('code').equals(code).count()) {
    code = `${candidate}_${n}`;
    n++;
  }
  return code;
}

// ── CLIENTES ────────────────────────────────────────────────────────────

export async function getClients() {
  return db.clients.orderBy('name').toArray();
}

export async function getClient(id) {
  return db.clients.get(Number(id));
}

export async function getClientByCode(code) {
  return db.clients.where('code').equals(code).first();
}

// Resuelve un cliente por `id` numérico (uso interno existente, ej. rutas
// `#/controls/:clientId`) o por `code` (uso nuevo, ej. el seed). Acepta
// ambos porque conviven durante toda la migración aditiva (ver T2 en
// specs/plan-v2-t0-t6.md).
export async function resolveClient(codeOrId) {
  if (codeOrId === null || codeOrId === undefined) return undefined;
  if (typeof codeOrId === 'number' || /^\d+$/.test(String(codeOrId))) {
    return getClient(codeOrId);
  }
  return getClientByCode(String(codeOrId));
}

export async function createClient(name, notes = '', extra = {}) {
  const now = new Date().toISOString();
  const trimmedName = name.trim();
  const code = await uniqueClientCode(slugifyClientCode(extra.code?.trim() || trimmedName));
  return db.clients.add({
    name: trimmedName,
    notes,
    code,
    sourceSystem: extra.sourceSystem || 'meta4',
    team:         extra.team || '',
    consultant:   extra.consultant || '',
    ccts:         extra.ccts || [],
    pays:         extra.pays ?? null,
    entityCount:  extra.entityCount || 1,
    active:       true,
    attributes:   extra.attributes || {},
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateClient(id, changes) {
  return db.clients.update(Number(id), { ...changes, updatedAt: new Date().toISOString() });
}

export async function deleteClient(id) {
  const cid = Number(id);
  const client = await db.clients.get(cid);
  const code = client?.code;
  // Borramos en cascada: primero los hijos, después el padre
  await db.transaction('rw',
    [db.clients, db.groupers, db.grouperConcepts, db.fileProfiles, db.clientCatalogs,
     db.sessions, db.sessionFiles, db.sessionResults],
    async () => {
      if (code) {
        const grouperIds = (await db.groupers.where('clientCode').equals(code).toArray()).map(g => g.id);
        if (grouperIds.length) await db.grouperConcepts.where('grouperId').anyOf(grouperIds).delete();
        await db.groupers.where('clientCode').equals(code).delete();
        await db.fileProfiles.where('clientCode').equals(code).delete();
        const sessionIds = (await db.sessions.where('clientCode').equals(code).toArray()).map(s => s.id);
        if (sessionIds.length) {
          await db.sessionFiles.where('sessionId').anyOf(sessionIds).delete();
          await db.sessionResults.where('sessionId').anyOf(sessionIds).delete();
        }
        await db.sessions.where('clientCode').equals(code).delete();
      }
      // clientCatalogs sigue indexado por clientId (su primary key real —
      // Dexie no permite cambiarla, ver el comentario en db.version(6)).
      await db.clientCatalogs.delete(cid);
      await db.clients.delete(cid);
    }
  );
}

// ── AGRUPADORES ─────────────────────────────────────────────────────────

export async function getGroupers(clientCode) {
  return db.groupers.where('clientCode').equals(clientCode).sortBy('name');
}

export async function createGrouper(clientCode, name, color = '') {
  const now = new Date().toISOString();
  return db.groupers.add({ clientCode, name: name.trim(), color, createdAt: now, updatedAt: now });
}

export async function updateGrouper(id, changes) {
  return db.groupers.update(Number(id), { ...changes, updatedAt: new Date().toISOString() });
}

export async function deleteGrouper(id) {
  const gid = Number(id);
  await db.transaction('rw', [db.groupers, db.grouperConcepts], async () => {
    await db.grouperConcepts.where('grouperId').equals(gid).delete();
    await db.groupers.delete(gid);
  });
}

// ── CONCEPTOS DE AGRUPADOR ──────────────────────────────────────────────

export async function getGrouperConcepts(grouperId) {
  return db.grouperConcepts.where('grouperId').equals(Number(grouperId)).toArray();
}

export async function addConceptToGrouper(grouperId, conceptCode, conceptLabel = '') {
  const gid = Number(grouperId);
  const code = String(conceptCode).trim();
  // Si ya existe ese código en este agrupador, no lo duplicamos
  const exists = await db.grouperConcepts
    .where('[grouperId+conceptCode]').equals([gid, code]).first();
  if (exists) return exists.id;
  return db.grouperConcepts.add({ grouperId: gid, conceptCode: code, conceptLabel });
}

export async function removeConceptFromGrouper(grouperId, conceptCode) {
  return db.grouperConcepts
    .where('[grouperId+conceptCode]').equals([Number(grouperId), String(conceptCode)]).delete();
}

// ── PERFILES DE ARCHIVO ─────────────────────────────────────────────────
// Un "perfil" es el mapeo de columnas que el usuario configuró la primera vez
// que cargó ese tipo de archivo para ese cliente. Se reutiliza automáticamente.

export async function getFileProfile(clientCode, fileType) {
  return db.fileProfiles
    .where('[clientCode+fileType]').equals([clientCode, fileType]).first();
}

export async function saveFileProfile(clientCode, fileType, mapping) {
  const now = new Date().toISOString();
  const existing = await getFileProfile(clientCode, fileType);
  if (existing) {
    return db.fileProfiles.update(existing.id, { mapping, updatedAt: now });
  }
  return db.fileProfiles.add({ clientCode, fileType, mapping, createdAt: now, updatedAt: now });
}

// ── CATÁLOGO DE CONCEPTOS POR CLIENTE ───────────────────────────────────
// Cada cliente puede tener su propio catálogo de conceptos (códigos, descripciones,
// clasificaciones y alias). Si no lo cargó, los parsers caen al CATALOGO_SEED.

export async function getClientCatalog(clientCode) {
  return db.clientCatalogs.where('clientCode').equals(clientCode).first();
}

// clientCatalogs sigue usando `clientId` como primary key real por dentro
// (Dexie no permite cambiar la primary key de una tabla existente — ver el
// comentario en db.version(6)). Se resuelve acá para que nada fuera de este
// archivo tenga que saberlo.
export async function saveClientCatalog(clientCode, data) {
  const client = await getClientByCode(clientCode);
  if (!client) throw new Error(`Cliente "${clientCode}" no encontrado.`);
  const now = new Date().toISOString();
  const existing = await getClientCatalog(clientCode);
  const record = {
    clientId:   client.id,
    clientCode,
    rows:       data.rows,
    fileName:   data.fileName,
    parseMetadata: data.parseMetadata,
    createdAt:  existing?.createdAt || now,
    updatedAt:  now,
  };
  return db.clientCatalogs.put(record);
}

export async function deleteClientCatalog(clientCode) {
  const client = await getClientByCode(clientCode);
  if (!client) return;
  return db.clientCatalogs.delete(client.id);
}

// ── SESIONES ─────────────────────────────────────────────────────────────

export async function getSessions(clientCode) {
  const rows = await db.sessions.where('clientCode').equals(clientCode).toArray();
  return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getSession(id) {
  return db.sessions.get(Number(id));
}

export async function createSession(data) {
  const now = new Date().toISOString();
  return db.sessions.add({ ...data, createdAt: now, updatedAt: now });
}

export async function updateSession(id, changes) {
  return db.sessions.update(Number(id), { ...changes, updatedAt: new Date().toISOString() });
}

export async function getDefinitiveSession(clientCode, period) {
  return db.sessions
    .where('[clientCode+period]').equals([clientCode, period])
    .filter(s => s.isDefinitive === true).first();
}

// ── ARCHIVOS DE SESIÓN ──────────────────────────────────────────────────

export async function saveSessionFile(sessionId, fileType, originalFileName, parsedRows, parseMetadata) {
  const sid = Number(sessionId);
  const existing = await db.sessionFiles
    .where('sessionId').equals(sid).filter(f => f.fileType === fileType).first();
  const data = { sessionId: sid, fileType, originalFileName, parsedRows, parseMetadata };
  if (existing) {
    await db.sessionFiles.update(existing.id, data);
    return existing.id;
  }
  return db.sessionFiles.add(data);
}

export async function getSessionFiles(sessionId) {
  return db.sessionFiles.where('sessionId').equals(Number(sessionId)).toArray();
}

// ── RESULTADOS DE SESIÓN ────────────────────────────────────────────────

export async function saveSessionResults(sessionId, results) {
  const sid = Number(sessionId);
  const existing = await db.sessionResults.where('sessionId').equals(sid).first();
  const data = { sessionId: sid, ...results, computedAt: new Date().toISOString() };
  if (existing) {
    await db.sessionResults.update(existing.id, data);
    return existing.id;
  }
  return db.sessionResults.add(data);
}

export async function getSessionResults(sessionId) {
  return db.sessionResults.where('sessionId').equals(Number(sessionId)).first();
}

// ── CONFIGURACIÓN GENERAL ───────────────────────────────────────────────

export async function getConfig(key) {
  const row = await db.appConfig.get(key);
  return row ? row.value : null;
}

export async function setConfig(key, value) {
  return db.appConfig.put({ key, value });
}

// ── CONTROL RUNS ────────────────────────────────────────────────────────────
// Un "control run" es una ejecución de uno o más controles para un cliente/período.

export async function createControlRun(clientCode, period, selectedControls, notes = '') {
  const now = new Date().toISOString();
  return db.controlRuns.add({
    clientCode, period, selectedControls, notes,
    isDefinitive: false, createdAt: now, updatedAt: now,
  });
}

export async function getControlRuns(clientCode) {
  const rows = await db.controlRuns.where('clientCode').equals(clientCode).toArray();
  return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function getControlRun(id) {
  return db.controlRuns.get(Number(id));
}

export async function updateControlRun(id, changes) {
  return db.controlRuns.update(Number(id), { ...changes, updatedAt: new Date().toISOString() });
}

// ── ARCHIVOS DE CONTROL RUN ─────────────────────────────────────────────────

export async function saveControlRunFile(controlRunId, fileType, fileName, parsedRows, parseMetadata, mapping) {
  const rid = Number(controlRunId);
  const existing = await db.controlRunFiles
    .where('[controlRunId+fileType]').equals([rid, fileType]).first();
  const data = { controlRunId: rid, fileType, fileName, parsedRows, parseMetadata, mapping };
  if (existing) {
    await db.controlRunFiles.update(existing.id, data);
    return existing.id;
  }
  return db.controlRunFiles.add(data);
}

export async function getControlRunFiles(controlRunId) {
  return db.controlRunFiles.where('controlRunId').equals(Number(controlRunId)).toArray();
}

// ── RESULTADOS DE CONTROL RUN ───────────────────────────────────────────────

export async function saveControlRunResults(controlRunId, controlId, results) {
  const rid = Number(controlRunId);
  const existing = await db.controlRunResults
    .where('[controlRunId+controlId]').equals([rid, controlId]).first();
  const data = { controlRunId: rid, controlId, results, computedAt: new Date().toISOString() };
  if (existing) {
    await db.controlRunResults.update(existing.id, data);
    return existing.id;
  }
  return db.controlRunResults.add(data);
}

export async function getControlRunResults(controlRunId) {
  return db.controlRunResults.where('controlRunId').equals(Number(controlRunId)).toArray();
}

// ── CONFIGURACIÓN DE CONTROLES (por cliente) ────────────────────────────────
// Config de un control para un cliente puntual — clave [clientCode+controlId].
// Reemplaza el uso de fileProfiles para esto (que vuelve a ser solo mapeo de
// columnas). status default 'activo': si algo guarda params, es porque el
// control está configurado y en uso; el resto de los status (no_aplica,
// forzado_*) se manejan desde el modo admin (T6), no desde acá.

export async function getControlConfig(clientCode, controlId) {
  return db.controlConfigs.get([clientCode, controlId]);
}

export async function getControlConfigsForClient(clientCode) {
  return db.controlConfigs.where('clientCode').equals(clientCode).toArray();
}

export async function saveControlConfig(clientCode, controlId, changes) {
  const existing = await getControlConfig(clientCode, controlId);
  const data = {
    clientCode,
    controlId,
    status:         existing?.status ?? 'activo',
    overrideReason: existing?.overrideReason ?? null,
    params:         existing?.params ?? {},
    ...changes,
  };
  return db.controlConfigs.put(data);
}

// ── RESPALDO COMPLETO (export/import de toda la base) ───────────────────
// Volcado plano de todas las tablas de la versión de Dexie vigente. Sirve
// como red de seguridad antes de correr una migración de schema (upgrade()),
// y como forma de mover el historial local de un navegador a otro.
// Importar es todo-o-nada: reemplaza la base completa, no fusiona.

export async function exportDbBackup() {
  const tables = {};
  for (const table of db.tables) {
    tables[table.name] = await table.toArray();
  }
  return {
    kind: 'controles-nomina-backup',
    schemaVersion: db.verno,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export async function importDbBackup(backup) {
  if (!backup || backup.kind !== 'controles-nomina-backup' || !backup.tables) {
    throw new Error('El archivo no es un respaldo válido de Controles Nómina.');
  }
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const rows = backup.tables[table.name];
      if (rows && rows.length) await table.bulkAdd(rows);
    }
  });
}

export { db };
