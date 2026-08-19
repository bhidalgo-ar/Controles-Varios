// exportSeed.js — Export del seed actualizado desde el modo admin (T6)
//
// Arma el mismo shape que importSeed.js sabe leer (mismo schemaVersion,
// mismos campos) a partir de lo que hay en la base local: clientes,
// controlConfigs, y los catálogos (sourceSystems/teams/consultants) que ya
// se guardaron acá al importar un seed anterior. No inventa un formato
// paralelo — ver guardrail de T6 en specs/plan-v2-t0-t6.md.

import { getClients, getControlConfigsForClient, getConfig } from '../db.js';
import { normalizeTolerance } from '../controls/tolerance.js';
import { DEFAULT_LEGAJO_KEY_MODE } from '../utils/legajo.js';
import { SEED_SCHEMA_VERSION } from './importSeed.js';

/**
 * @param {string} updatedBy  quién exporta (para dejarlo en el archivo)
 * @returns {object} seed con la misma forma que applySeed() espera
 */
export async function buildSeedExport(updatedBy = 'admin') {
  const [clients, sourceSystems, teams, consultants, loadedMeta] = await Promise.all([
    getClients(),
    getConfig('seedSourceSystems'),
    getConfig('seedTeams'),
    getConfig('seedConsultants'),
    getConfig('seedMeta'),
  ]);

  const seedClients = clients.filter(c => c.code).map(c => ({
    code:         c.code,
    name:         c.name,
    team:         c.team || '',
    consultant:   c.consultant || '',
    pays:         c.pays ?? null,
    ccts:         c.ccts || [],
    entityCount:  c.entityCount || 1,
    sourceSystem: c.sourceSystem || 'meta4',
    // Cómo se compara el legajo en este cliente (D-038): viaja en el seed para
    // que la decisión se tome una vez y valga para todo el equipo, no una vez
    // por navegador.
    legajoKeyMode: c.legajoKeyMode || DEFAULT_LEGAJO_KEY_MODE,
    // De cuánto para arriba una diferencia es una diferencia (D-069). Viaja por
    // la misma razón que el modo de legajo: se decide una vez con el cliente y
    // vale para todo el equipo, no una vez por navegador.
    diffTolerance: normalizeTolerance(c.diffTolerance),
    active:       c.active !== undefined ? c.active : true,
    attributes:   c.attributes || {},
  }));

  const controlConfigs = [];
  for (const c of clients) {
    if (!c.code) continue;
    const configs = await getControlConfigsForClient(c.code);
    for (const cfg of configs) {
      controlConfigs.push({
        clientCode:     cfg.clientCode,
        controlId:      cfg.controlId,
        status:         cfg.status,
        overrideReason: cfg.overrideReason ?? null,
        params:         cfg.params || {},
      });
    }
  }

  return {
    schemaVersion: SEED_SCHEMA_VERSION,
    configVersion: (loadedMeta?.configVersion || 0) + 1,
    updatedAt:     new Date().toISOString().slice(0, 10),
    updatedBy,
    sourceSystems: sourceSystems || [],
    teams:         teams || [],
    consultants:   consultants || [],
    clients:       seedClients,
    controlConfigs,
    catalogs:      [],
  };
}
