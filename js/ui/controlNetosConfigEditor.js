// controlNetosConfigEditor.js — El panel del Paso 2 del Control de Netos
//
// Está acá y no en el módulo del control porque es pantalla y no cálculo (mismo
// lugar que `rendVsAsientoConfigEditor.js` y los otros editores de config).
//
// Tres decisiones del mes, en orden de cuánto mueven el resultado:
//
//   1. **El acuerdo no remunerativo.** Lo que cobran todos por paritaria. No
//      tiene semilla: cambia todos los meses, y si se asumiera cero el neto
//      teórico saldría bajo para toda la nómina sin que nada avise. Sin este
//      dato el control no corre — es el único campo que bloquea.
//
//   2. **El tope de la base imponible.** Willy pidió que se muestre siempre y
//      que se pueda cambiar y volver a ejecutar (2026-08-19). El panel propone el
//      tope que el propio archivo delata —al empleado que lo superó le
//      retuvieron sobre una base menor que sus haberes— pero no lo aplica solo:
//      el número oficial lo pone el analista.
//
//   3. **Las alícuotas de retención.** Vienen con la semilla del convenio de
//      Comercio, confirmada contra la liquidación real. Se muestran porque son
//      exactamente lo que el control existe para detectar: una alícuota mal
//      puesta llega a un bruto y a un neto equivocados sin que nadie lo vea.

import { DEFAULT_NETOS_CONFIG } from '../controls/controlNetos.js';

const TASA_LABELS = {
  jubilacion:       'Jubilación',
  ley19032:         'Ley 19.032',
  obraSocial:       'Obra social',
  anssal:           'ANSSAL',
  sindicato:        'Sindicato',
  faecys:           'FAECYS',
  obraSocialNoRemu: 'Obra social sobre lo no remunerativo',
  afiliadoExtra:    'Retención del afiliado (2° 2%)',
};

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {object}   [opts.config]         valor guardado del cliente
 * @param {boolean}  [opts.openByDefault]
 * @param {function} [opts.onChange]       recibe la config nueva completa
 * @param {object[]} [opts.tabRows]        filas del Tabulado, para sugerir el tope
 */
export function renderControlNetosConfigEditor(container, opts = {}) {
  const {
    config = {},
    openByDefault = false,
    onChange = () => {},
    tabRows = [],
  } = opts;

  const base = DEFAULT_NETOS_CONFIG();
  const current = {
    ...base,
    ...config,
    tasas:   { ...base.tasas,   ...(config.tasas   || {}) },
    codigos: { ...base.codigos, ...(config.codigos || {}) },
  };

  const sugerido = sugerirTope(tabRows, current);

  const editor = document.createElement('details');
  if (openByDefault || current.noRemuAcuerdo === null) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Datos del mes y alícuotas de retención
    </summary>

    <div style="margin-top:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:flex-start;">
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Acuerdo no remunerativo del mes</span>
        <input type="text" class="form-input form-input--sm" style="max-width:160px;"
               data-netos-nr inputmode="decimal" autocomplete="off"
               value="${esc(current.noRemuAcuerdo ?? '')}" placeholder="ej. 120000">
      </label>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:52ch;margin:var(--sp-4) 0 0;">
        La suma de los conceptos de paritaria que cobran todos, antes de antigüedad y presentismo.
        <strong>Sin este dato el control no corre</strong>: asumirlo en cero daría un neto teórico bajo
        para toda la nómina.
      </p>
    </div>

    <div style="margin-top:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:flex-start;">
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Tope de la base de aportes</span>
        <input type="text" class="form-input form-input--sm" style="max-width:160px;"
               data-netos-tope inputmode="decimal" autocomplete="off"
               value="${esc(current.topeBaseImponible ?? '')}" placeholder="sin tope">
      </label>
      <div data-netos-tope-hint style="flex:1 1 280px;min-width:260px;margin-top:var(--sp-4);"></div>
    </div>

    <div style="margin-top:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:flex-start;">
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Tolerancia por legajo</span>
        <input type="text" class="form-input form-input--sm" style="max-width:120px;"
               data-netos-tol inputmode="decimal" autocomplete="off"
               value="${esc(current.tolerancia ?? 1)}">
      </label>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:52ch;margin:var(--sp-4) 0 0;">
        Cuánto puede quedar sin explicar antes de marcar el legajo. Meta4 redondea cada concepto
        a dos decimales, así que unos centavos de diferencia son redondeo y no un error.
      </p>
    </div>

    <details style="margin-top:var(--sp-3);">
      <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--color-primary);">
        ▸ Alícuotas de retención (%)
      </summary>
      <div data-netos-tasas style="margin-top:var(--sp-2);display:flex;flex-wrap:wrap;gap:var(--sp-3);"></div>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:60ch;margin-top:var(--sp-2);">
        Vienen con los valores del convenio de Comercio. La obra social que además cobra sobre lo
        no remunerativo es la <strong>${esc(current.obraSocialConAporteNoRemu)}</strong>; al resto no
        se le aplica ese porcentaje.
      </p>
    </details>
  `;

  const nrEl    = editor.querySelector('[data-netos-nr]');
  const topeEl  = editor.querySelector('[data-netos-tope]');
  const tolEl   = editor.querySelector('[data-netos-tol]');
  const hintEl  = editor.querySelector('[data-netos-tope-hint]');
  const tasasEl = editor.querySelector('[data-netos-tasas]');

  tasasEl.innerHTML = Object.keys(TASA_LABELS).map(k => `
    <label style="display:block;">
      <span class="form-label" style="font-size:var(--text-sm);">${esc(TASA_LABELS[k])}</span>
      <input type="text" class="form-input form-input--sm" style="max-width:90px;"
             data-netos-tasa="${esc(k)}" inputmode="decimal" autocomplete="off"
             value="${esc(current.tasas[k])}">
    </label>
  `).join('');

  function pintarHint() {
    const declarado = num(topeEl.value);
    if (sugerido === null) {
      hintEl.innerHTML = linea('Ningún legajo llegó al tope en este archivo, así que este mes no afecta el resultado.', 'muted');
      return;
    }
    if (declarado === null) {
      hintEl.innerHTML = linea(
        `La liquidación aplicó un tope de ${fmt(sugerido)}. Cargalo acá para que el control lo use.`, 'warn');
      return;
    }
    hintEl.innerHTML = Math.abs(declarado - sugerido) <= 1
      ? linea(`Coincide con el tope que aplicó la liquidación (${fmt(sugerido)}).`, 'ok')
      : linea(`Ojo: la liquidación aplicó ${fmt(sugerido)} y acá está cargado ${fmt(declarado)}.`, 'warn');
  }

  const emitir = () => {
    current.noRemuAcuerdo     = num(nrEl.value);
    current.topeBaseImponible = num(topeEl.value);
    current.tolerancia        = num(tolEl.value) ?? 1;
    for (const el of tasasEl.querySelectorAll('[data-netos-tasa]')) {
      current.tasas[el.dataset.netosTasa] = num(el.value) ?? 0;
    }
    pintarHint();
    onChange({ ...current, tasas: { ...current.tasas }, codigos: { ...current.codigos } });
  };

  for (const el of [nrEl, topeEl, tolEl]) el.addEventListener('input', emitir);
  tasasEl.addEventListener('input', emitir);

  pintarHint();
  container.appendChild(editor);
}

/**
 * El tope que delata el propio Tabulado: si a alguien le retuvieron jubilación
 * sobre una base menor que sus haberes remunerativos, esa base es el techo.
 *
 * Se calcula acá y no en el control porque es una ayuda de pantalla —el control
 * lo recalcula por su cuenta sobre lo que efectivamente corrió—, y porque el
 * panel tiene que poder mostrarlo antes de ejecutar.
 */
function sugerirTope(tabRows, cfg) {
  if (!Array.isArray(tabRows) || tabRows.length === 0) return null;

  const colByCode = {};
  for (const col of Object.keys(tabRows[0])) {
    const m = String(col).trim().match(/^(\d+)[-_]/);
    if (m && !colByCode[m[1]]) colByCode[m[1]] = col;
  }

  const tasaJub = (cfg.tasas.jubilacion ?? 0) / 100;
  if (!tasaJub) return null;

  const jubCol = colByCode[(cfg.codigos.apJubilacion || [])[0]];
  if (!jubCol) return null;

  // Los haberes remunerativos de la fila, con los mismos códigos que usa el
  // control. No hace falta que sea exacto: alcanza con detectar que la base
  // sobre la que se retuvo quedó por debajo.
  const remuCodes = [
    ...(cfg.codigos.sueldo || []), ...(cfg.codigos.aCuentaFutAumen || []),
    ...(cfg.codigos.antiguedad || []), ...(cfg.codigos.presentismo || []),
    ...(cfg.codigos.remuOtros || []),
  ];

  let tope = null;
  for (const row of tabRows) {
    const jub = num(row[jubCol]);
    if (jub === null || jub === 0) continue;
    const baseRetenida = jub / tasaJub;
    const remu = remuCodes.reduce((a, c) => {
      const col = colByCode[c];
      return a + (col ? (num(row[col]) ?? 0) : 0);
    }, 0);
    if (baseRetenida >= remu - 1) continue;
    if (tope === null || baseRetenida > tope) tope = baseRetenida;
  }
  return tope === null ? null : Math.round(tope * 100) / 100;
}

/** Lee un número del formulario. `''` es "no declarado" (`null`), no cero. */
function num(value) {
  const s = String(value ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function fmt(v) {
  return Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function linea(texto, tono) {
  const color = tono === 'warn' ? 'var(--color-danger)'
    : tono === 'ok' ? 'var(--color-success)' : 'var(--color-text-muted)';
  const icono = tono === 'warn' ? '⚠' : tono === 'ok' ? '✓' : '·';
  return `
    <div style="font-size:var(--text-sm);display:flex;gap:var(--sp-2);align-items:baseline;">
      <span style="color:${color};" aria-hidden="true">${icono}</span>
      <span style="color:${color};">${esc(texto)}</span>
    </div>
  `;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
