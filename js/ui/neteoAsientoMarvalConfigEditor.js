// neteoAsientoMarvalConfigEditor.js — Panel del Paso 2 del Neteo del asiento
//
// Dos datos que son del cliente y no del control, así que se editan acá y no se
// cambian con un commit (D-035):
//   · con qué dígito empiezan las cuentas de pasivo (las que no se netean).
//     Valor inicial "2", que es una lectura del plan de cuentas de Marval y no
//     una regla dura (comentario de Guille en la spec);
//   · el centro de costo compartido de la regla de centros. Valor inicial "13".
//
// Vive en js/ui/ y no en el módulo del control porque es pantalla, no cálculo.

import { DEFAULT_NETEO_ASIENTO_CONFIG } from '../controls/neteoAsientoMarval.js';

export function renderNeteoAsientoMarvalConfigEditor(container, opts = {}) {
  const { config = null, openByDefault = false, onChange = () => {} } = opts;
  const current = {
    prefijoPasivo:    config?.prefijoPasivo    ?? DEFAULT_NETEO_ASIENTO_CONFIG.prefijoPasivo,
    centroCompartido: config?.centroCompartido ?? DEFAULT_NETEO_ASIENTO_CONFIG.centroCompartido,
  };

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Neteo del asiento · cuentas de pasivo y centro compartido
    </summary>

    <div style="margin-top:var(--sp-3);display:flex;gap:var(--sp-4);flex-wrap:wrap;align-items:flex-end;">
      <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
        Las cuentas de pasivo empiezan con
        <input type="text" class="form-input" data-na-pasivo
          value="${esc(current.prefijoPasivo)}" style="padding:4px 8px;max-width:120px;">
      </label>
      <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
        Centro de costo compartido
        <input type="text" class="form-input" data-na-centro
          value="${esc(current.centroCompartido)}" style="padding:4px 8px;max-width:120px;">
      </label>
    </div>
    <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-2) 0 0;max-width:640px;">
      Las cuentas de pasivo (retenciones, cargas a depositar, provisiones) no se netean: quedan con una
      línea al Debe y otra al Haber. El centro compartido es el que tiene que aparecer cuando una dimensión
      sin legajo usa más de un centro de costo; si no aparece, el control frena.
      <button type="button" class="btn btn--ghost btn--sm" data-na-reset style="margin-left:var(--sp-2);">
        ↺ Volver a los valores originales
      </button>
    </p>
    <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-1) 0 0;" data-na-info></p>
  `;

  const pasivoEl = editor.querySelector('[data-na-pasivo]');
  const centroEl = editor.querySelector('[data-na-centro]');
  const infoEl   = editor.querySelector('[data-na-info]');

  // Un campo vacío no se completa solo: se avisa y el control no corre hasta
  // que se cargue (su run() devuelve el error con qué hacer).
  const avisarVacios = () => {
    const faltan = [];
    if (!current.prefijoPasivo) faltan.push('el dígito de las cuentas de pasivo');
    if (!current.centroCompartido) faltan.push('el centro compartido');
    infoEl.innerHTML = faltan.length
      ? `<span style="color:var(--color-danger);">Falta ${esc(faltan.join(' y '))}: sin eso el control no corre.</span>`
      : '';
  };

  const emitir = () => {
    avisarVacios();
    onChange({ prefijoPasivo: current.prefijoPasivo, centroCompartido: current.centroCompartido });
  };

  pasivoEl.addEventListener('change', () => { current.prefijoPasivo = pasivoEl.value.trim(); emitir(); });
  centroEl.addEventListener('change', () => { current.centroCompartido = centroEl.value.trim(); emitir(); });
  editor.querySelector('[data-na-reset]').addEventListener('click', () => {
    current.prefijoPasivo    = DEFAULT_NETEO_ASIENTO_CONFIG.prefijoPasivo;
    current.centroCompartido = DEFAULT_NETEO_ASIENTO_CONFIG.centroCompartido;
    pasivoEl.value = current.prefijoPasivo;
    centroEl.value = current.centroCompartido;
    emitir();
  });

  // Al montar sólo se pinta el aviso, no se emite: abrir el Paso 2 no es una
  // edición del analista (si emitiera, la semilla quedaría guardada como
  // configuración del cliente).
  avisarVacios();
  container.appendChild(editor);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
