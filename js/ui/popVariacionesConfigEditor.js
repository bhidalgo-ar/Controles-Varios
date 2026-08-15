// popVariacionesConfigEditor.js — El panel del Paso 2 de Variación entre quincenas
//
// Una sola decisión: **qué código de concepto es el valor hora**. Está acá y no
// en el módulo del control porque es pantalla y no cálculo (mismo lugar que
// `rendVsAsientoConfigEditor.js` y los otros editores de config).
//
// Por qué es editable y no una constante: el código que trae el módulo es
// SEMILLA del cliente que todavía no configuró nada, no identidad (D-035/D-039).
// Si el cliente renumera el concepto, se arregla desde esta pantalla y no con un
// commit.
//
// El panel muestra, al lado del código, el encabezado que ese código matcheó en
// cada Tabulado cargado. Es el mismo criterio que la vista previa de un archivo:
// lo único que le confirma al analista que el código apunta a la columna que él
// cree, antes de ejecutar.

import { DEFAULT_POP_VARIACIONES_CONFIG } from '../controls/popVariaciones.js';

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {object}   [opts.config]         valor guardado del cliente
 * @param {boolean}  [opts.openByDefault]
 * @param {function} [opts.onChange]       recibe la config nueva completa
 * @param {object[]} [opts.rowsAnterior]   filas del Tabulado de la quincena anterior
 * @param {object[]} [opts.rowsActual]     filas del Tabulado de la quincena actual
 */
export function renderPopVariacionesConfigEditor(container, opts = {}) {
  const {
    config = DEFAULT_POP_VARIACIONES_CONFIG,
    openByDefault = false,
    onChange = () => {},
    rowsAnterior = [],
    rowsActual = [],
  } = opts;

  const current = { ...DEFAULT_POP_VARIACIONES_CONFIG, ...config };

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Concepto del valor hora
    </summary>
    <div style="margin-top:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:flex-start;">
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Código del concepto de horas normales</span>
        <input type="text" class="form-input form-input--sm" style="max-width:140px;"
               data-pop-var-code value="${esc(current.valorHoraCode)}" inputmode="numeric" autocomplete="off">
      </label>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:52ch;margin:0;">
        El valor hora de cada legajo se calcula como <strong>importe ÷ cantidad</strong> de este concepto,
        en cada una de las dos quincenas. Se busca por código, nunca por nombre.
        El legajo que no lo liquidó sale con «—», no con 0,00.
      </p>
      <div data-pop-var-match style="flex:1 1 260px;min-width:240px;"></div>
    </div>
  `;

  const input   = editor.querySelector('[data-pop-var-code]');
  const matchEl = editor.querySelector('[data-pop-var-match]');

  function pintarMatch() {
    const code = String(input.value || '').trim();
    matchEl.innerHTML = [
      ['Quincena anterior', rowsAnterior],
      ['Quincena actual',   rowsActual],
    ].map(([rotulo, rows]) => {
      if (!rows.length) {
        return linea(rotulo, 'sin archivo cargado todavía', false);
      }
      if (!code) return linea(rotulo, 'falta el código', true);
      const existe = Object.prototype.hasOwnProperty.call(rows[0], `cant_${code}`);
      return existe
        ? linea(rotulo, `concepto ${code} encontrado`, false, true)
        : linea(rotulo, `el concepto ${code} no está en este archivo`, true);
    }).join('');
  }

  input.addEventListener('input', () => {
    current.valorHoraCode = String(input.value || '').trim();
    pintarMatch();
    onChange({ ...current });
  });

  pintarMatch();
  container.appendChild(editor);
}

/** Un renglón del bloque de verificación: qué archivo y si el código matcheó. */
function linea(rotulo, texto, mal, ok = false) {
  const color = mal ? 'var(--color-danger)' : ok ? 'var(--color-success)' : 'var(--color-text-muted)';
  return `
    <div style="font-size:var(--text-sm);display:flex;gap:var(--sp-2);align-items:baseline;">
      <span style="color:${color};" aria-hidden="true">${mal ? '⚠' : ok ? '✓' : '·'}</span>
      <span><strong>${esc(rotulo)}:</strong> <span style="color:${color};">${esc(texto)}</span></span>
    </div>
  `;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
