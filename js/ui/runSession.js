// runSession.js — La configuración de la última corrida, en memoria.
//
// Al ejecutar, el wizard navega a la pantalla de resultados (#/control-results/N)
// y su `state` se pierde: volver a entrar al wizard lo arma de cero, en el Paso 0
// y sin los archivos cargados. Esto guarda lo que el analista eligió y subió
// (controles, archivos, período, notas) para que "Volver a la configuración"
// lo deje en el Paso 2 como estaba, sin volver a subir nada.
//
// Vive sólo en memoria, igual que la caché del Tabulado: no se escribe en
// IndexedDB y se pierde al recargar la página.

let _last = null;   // { clientId, runId, selectedControls, controlFiles, period, notes }

export function saveRunSession({ clientId, runId, selectedControls, controlFiles, period, notes }) {
  _last = {
    clientId: Number(clientId),
    runId:    Number(runId),
    selectedControls: [...(selectedControls || [])],
    controlFiles:     { ...(controlFiles || {}) },
    period, notes,
  };
}

/** La configuración de esa corrida, si todavía está en memoria. */
export function getRunSession(clientId, runId) {
  if (!_last) return null;
  return (_last.clientId === Number(clientId) && _last.runId === Number(runId)) ? _last : null;
}
