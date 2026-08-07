// pinGate.js — Freno operativo por PIN (NO es autenticación real).
//
// Un PIN único de la app, guardado en localStorage del navegador, que evita
// que cualquiera toque valores sensibles "sin querer" (topes regulatorios,
// umbrales). No hay backend, no hay usuarios, no hay verificación de
// identidad: cualquiera que abra las devtools puede leer o saltear el PIN.
// Documentar siempre así frente al usuario — nunca venderlo como seguridad.

const STORAGE_KEY = 'hya-controles-pin-gate';

function getStoredPin() {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function setStoredPin(pin) {
  try {
    if (pin) localStorage.setItem(STORAGE_KEY, pin);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* localStorage no disponible: el gate simplemente no persiste */ }
}

/**
 * Renderiza un bloque protegido por PIN dentro de `container`. Si no hay PIN
 * configurado todavía, el contenido queda visible y ofrece "Configurar PIN".
 * Si hay PIN configurado, pide ingresarlo antes de mostrar el contenido.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {(host: HTMLElement) => void} opts.render - arma el contenido protegido dentro de `host`
 * @param {string} [opts.label='Configuración avanzada']
 */
export function renderPinGatedSection(container, { render, label = 'Configuración avanzada' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'pin-gate';
  container.appendChild(wrap);

  function showUnlocked() {
    wrap.innerHTML = '';
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:var(--sp-2);margin-bottom:var(--sp-2);';
    header.innerHTML = `
      <span class="text-muted" style="font-size:var(--text-sm);">🔓 ${esc(label)} — desbloqueado</span>
    `;
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'btn btn--ghost btn--sm';
    lockBtn.textContent = 'Bloquear';
    lockBtn.addEventListener('click', showLocked);
    header.appendChild(lockBtn);
    wrap.appendChild(header);

    const host = document.createElement('div');
    wrap.appendChild(host);
    render(host);
  }

  function showLocked() {
    const hasPin = !!getStoredPin();
    wrap.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--sp-2);flex-wrap:wrap;">
        <span style="font-size:var(--text-sm);">🔒 ${esc(label)}</span>
        <input type="password" class="form-input" placeholder="${hasPin ? 'PIN' : 'Elegí un PIN'}"
          style="max-width:120px;padding:4px 8px;" data-pin-input>
        <button type="button" class="btn btn--ghost btn--sm" data-pin-submit>
          ${hasPin ? 'Desbloquear' : 'Configurar PIN'}
        </button>
        <span class="text-muted" data-pin-error style="font-size:var(--text-sm);color:var(--color-error);"></span>
      </div>
      <p class="text-muted" style="font-size:var(--text-sm);margin-top:var(--sp-2);">
        Este PIN es sólo un freno operativo (se guarda en este navegador, no es una contraseña de verdad) —
        no reemplaza ningún control de acceso real.
      </p>
    `;

    const input  = wrap.querySelector('[data-pin-input]');
    const submit = wrap.querySelector('[data-pin-submit]');
    const errorEl = wrap.querySelector('[data-pin-error]');

    function attempt() {
      const value = input.value.trim();
      if (!value) return;
      const stored = getStoredPin();
      if (!stored) {
        setStoredPin(value);
        showUnlocked();
        return;
      }
      if (value === stored) {
        showUnlocked();
      } else {
        errorEl.textContent = 'PIN incorrecto.';
        input.value = '';
        input.focus();
      }
    }

    submit.addEventListener('click', attempt);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attempt(); });
  }

  showLocked();
}

/** Cambia (o borra) el PIN configurado — para un botón "Cambiar PIN" si hace falta a futuro. */
export function resetPin() {
  setStoredPin(null);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
