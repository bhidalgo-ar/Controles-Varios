// viewPreference.js — Recuerda, por control (no por cliente ni corrida), qué
// solapa (Resumen/Detalle) dejó abierta el analista la última vez, para
// reabrir ahí la próxima corrida de ese mismo control. Es una preferencia de
// quien está frente a la pantalla, no un dato de la corrida — vive en
// localStorage, no en controlConfigs ni IndexedDB.

const PREFIX = 'viewPref:';

/** @returns {{ tab?: string }} vacío si nunca se guardó nada para este control. */
export function getViewPreference(controlId) {
  if (!controlId) return {};
  try {
    const raw = localStorage.getItem(PREFIX + controlId);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {}; // localStorage puede fallar (modo privado, cuota) — no es crítico.
  }
}

export function setViewPreference(controlId, patch) {
  if (!controlId) return;
  try {
    localStorage.setItem(PREFIX + controlId, JSON.stringify({ ...getViewPreference(controlId), ...patch }));
  } catch {
    // idem — perder la preferencia no puede tirar abajo la pantalla de resultados.
  }
}
