// viewPreference.js — Recuerda, por control (no por cliente ni corrida), qué
// solapa (Resumen/Fichas/Planilla) dejó abierta el analista la última vez, para
// reabrir ahí la próxima corrida de ese mismo control. Es una preferencia de
// quien está frente a la pantalla, no un dato de la corrida — vive en
// localStorage, no en controlConfigs ni IndexedDB.
//
// La preferencia se guarda por control Y POR ESTADO del control ('conDif' /
// 'sinDif'): la regla de la vista estándar es que un control que terminó con
// diferencias abre en Fichas y uno que cerró abre en Planilla (§2 de
// specs/vista-estandar-resultados.md). Con una sola clave por control, la
// primera vez que el analista cambia de solapa esa regla moría para siempre —
// quedaba "Planilla" guardado y el control siguiente que sí tenía diferencias
// abría igual en Planilla. Un control que no declara estado sigue usando la
// clave de siempre (`viewPref:<controlId>`).

const PREFIX = 'viewPref:';

/** `viewPref:brutos` · `viewPref:brutos:conDif` */
function keyFor(controlId, estado) {
  return PREFIX + controlId + (estado ? `:${estado}` : '');
}

/**
 * @param {string} controlId - id del registry
 * @param {'conDif'|'sinDif'} [estado] - cómo terminó el control en esta corrida
 * @returns {{ tab?: string }} vacío si nunca se guardó nada para esta clave.
 */
export function getViewPreference(controlId, estado) {
  if (!controlId) return {};
  try {
    const raw = localStorage.getItem(keyFor(controlId, estado));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {}; // localStorage puede fallar (modo privado, cuota) — no es crítico.
  }
}

export function setViewPreference(controlId, patch, estado) {
  if (!controlId) return;
  try {
    localStorage.setItem(
      keyFor(controlId, estado),
      JSON.stringify({ ...getViewPreference(controlId, estado), ...patch }),
    );
  } catch {
    // idem — perder la preferencia no puede tirar abajo la pantalla de resultados.
  }
}
