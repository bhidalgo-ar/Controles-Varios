// importSeed.js — Import del seed de configuración (T3 de PLAN_v2.md)
//
// El seed es un JSON con la cartera de clientes de H&A, distribuido por
// fuera del repo (SharePoint — ver DECISIONS.md D-010). Acá vive la lógica
// para: validar que el schema sea compatible, avisar si el seed es más
// viejo que el que ya está cargado, y aplicar el merge sin tocar nunca el
// historial local (controlRuns / controlRunFiles / controlRunResults /
// clientCatalogs — ver ARCHITECTURE.md §6).

import { getClients, createClient, updateClient, getConfig, setConfig } from '../db.js';

export const SEED_SCHEMA_VERSION = 1;

const SEED_META_KEY = 'seedMeta';

/**
 * Intenta cargar el seed desde `./config/hya-controles-config.json` en
 * silencio (útil el día que la app se sirva desde infraestructura propia
 * de H&A — ver ARCHITECTURE.md §6). En GitHub Pages este archivo no existe
 * a propósito (el seed real no se versiona, D-010), así que esto falla
 * siempre hoy — y eso está bien: no se muestra ningún error, se cae al
 * import manual.
 */
export async function tryAutoLoadSeed(url = './config/hya-controles-config.json') {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Metadata del último seed aplicado (o null si nunca se importó ninguno). */
export async function getLoadedSeedMeta() {
  return getConfig(SEED_META_KEY);
}

/**
 * Chequea un seed contra lo que ya está cargado, sin tocar la base.
 * @returns {{ compatible: boolean, reason?: string, olderThanLoaded: boolean,
 *             loadedConfigVersion: number|null, seedConfigVersion: number, clientCount: number }}
 */
export function inspectSeed(seed, loadedMeta) {
  if (!seed || typeof seed !== 'object' || !Array.isArray(seed.clients)) {
    return { compatible: false, reason: 'El archivo no tiene la forma de un seed de Controles Nómina.', olderThanLoaded: false, loadedConfigVersion: loadedMeta?.configVersion ?? null, seedConfigVersion: null, clientCount: 0 };
  }
  if (seed.schemaVersion !== SEED_SCHEMA_VERSION) {
    return {
      compatible: false,
      reason: `Este seed usa schemaVersion ${seed.schemaVersion}, pero esta versión de la app solo entiende schemaVersion ${SEED_SCHEMA_VERSION}.`,
      olderThanLoaded: false,
      loadedConfigVersion: loadedMeta?.configVersion ?? null,
      seedConfigVersion: seed.schemaVersion,
      clientCount: seed.clients.length,
    };
  }
  const olderThanLoaded = !!loadedMeta && typeof seed.configVersion === 'number' && seed.configVersion < loadedMeta.configVersion;
  return {
    compatible: true,
    olderThanLoaded,
    loadedConfigVersion: loadedMeta?.configVersion ?? null,
    seedConfigVersion: seed.configVersion,
    clientCount: seed.clients.length,
  };
}

/**
 * Aplica el seed: upsert de clients/sourceSystems/teams por `code`.
 * Nunca toca controlRuns/controlRunFiles/controlRunResults/clientCatalogs —
 * el historial local de corridas sobrevive siempre a un import.
 *
 * No procesa todavía `controlConfigs` ni `catalogs` del seed (T5/T6).
 *
 * @returns {{ created: string[], updated: string[], nameConflicts: {code:string, localName:string, seedName:string}[] }}
 */
export async function applySeed(seed) {
  const existing = await getClients();
  const byCode = new Map(existing.filter(c => c.code).map(c => [c.code, c]));

  const created = [];
  const updated = [];
  const nameConflicts = [];

  for (const sc of seed.clients) {
    const local = byCode.get(sc.code);
    const attrs = {
      sourceSystem: sc.sourceSystem,
      team: sc.team || '',
      consultant: sc.consultant || '',
      ccts: sc.ccts || [],
      pays: sc.pays ?? null,
      entityCount: sc.entityCount || 1,
      active: sc.active !== undefined ? sc.active : true,
      attributes: sc.attributes || {},
    };

    if (!local) {
      await createClient(sc.name, '', { code: sc.code, ...attrs });
      created.push(sc.code);
      continue;
    }

    // Un `code` que ya existe local con un `name` distinto es un conflicto de
    // datos real (no un tema de versión) — se avisa, no se pisa en silencio
    // el nombre a favor de ninguno de los dos lados (ver T3 en
    // specs/plan-v2-t0-t6.md, sección Autonomía).
    if (local.name !== sc.name) {
      nameConflicts.push({ code: sc.code, localName: local.name, seedName: sc.name });
    }

    await updateClient(local.id, attrs);
    updated.push(sc.code);
  }

  await setConfig(SEED_META_KEY, {
    schemaVersion: seed.schemaVersion,
    configVersion: seed.configVersion,
    updatedAt: seed.updatedAt || null,
    updatedBy: seed.updatedBy || null,
    importedAt: new Date().toISOString(),
  });
  if (Array.isArray(seed.sourceSystems)) await setConfig('seedSourceSystems', seed.sourceSystems);
  if (Array.isArray(seed.teams))         await setConfig('seedTeams', seed.teams);

  return { created, updated, nameConflicts };
}
