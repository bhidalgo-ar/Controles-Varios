// appHeader.js — Los slots de la barra superior única (54px).
//
// La barra vive en index.html y es siempre la misma; lo que cambia es lo que
// cada pantalla cuelga de sus huecos al montarse:
//
//   volver · Cliente · Período · pasos del wizard · hint · acción primaria
//
// Reemplaza al stack viejo (app-header de 68px + `page-actions` + `wizard-steps`
// sueltos en cada pantalla). Acá SÓLO se mueve DOM: los handlers siguen siendo
// los de cada vista, que se pasan como `onClick`.
//
// Por qué no vive en main.js (donde lo pide el handoff del rediseño): main.js
// importa a todas las vistas, así que si las vistas importaran de main.js
// quedaría un ciclo de imports — y un ciclo rompe la app en el navegador y en
// ningún otro lado (D-048, tests/moduleCycles.test.js). main.js re-exporta
// `setHeader` para que la API se pida desde un solo lugar.

const SLOT_IDS = {
  // El id viejo de la navegación contextual se mantiene: es el slot de "volver"
  // y los e2e y las vistas lo siguen conociendo por ese nombre.
  back:    'js-header-nav',
  context: 'js-header-context',
  steps:   'js-header-steps',
  hint:    'js-header-hint',
  tools:   'js-header-tools',
  primary: 'js-header-primary',
};

/**
 * Llena la barra superior. Cada llamada define la barra ENTERA: lo que no se
 * pasa queda vacío. Es a propósito — cada pantalla declara su barra completa
 * al montar y no hereda restos de la pantalla anterior.
 *
 * @param {object}   [opts]
 * @param {object}   [opts.back]    - `{ label, href }` o `{ label, onClick }` (+ `id` opcional)
 * @param {object|string|Node} [opts.context] - `'Texto'`, `{ name, meta, tone }` (tone pinta el
 *   semáforo) o un elemento ya armado por la pantalla (ej. el selector de mes del inicio)
 * @param {object}   [opts.steps]   - `{ labels: string[], current: number }` (0-based)
 * @param {object|string} [opts.hint] - `'Texto'` o `{ text, tone: 'muted'|'warn' }`
 * @param {Node|Node[]} [opts.tools] - controles secundarios de la pantalla, a la izquierda de la
 *   primaria (ej. el menú "Datos ▾" del inicio). La pantalla los arma y les cuelga sus handlers.
 * @param {object}   [opts.primary] - `{ label, href|onClick, disabled, id, title, variant }`
 *   (`variant: 'secondary'` para cuando la acción de la pantalla no es la de más peso)
 */
export function setHeader({ back, context, steps, hint, tools, primary } = {}) {
  renderBack(slot('back'), back);
  renderContext(slot('context'), context);
  renderSteps(slot('steps'), steps);
  renderHint(slot('hint'), hint);
  renderNodes(slot('tools'), tools);
  renderPrimary(slot('primary'), primary);

  // El divisor separa la identidad de lo que trae la pantalla: en el inicio,
  // que no trae nada, una rayita suelta al lado del pill es ruido.
  const divider = document.querySelector('.app-header__divider');
  if (divider) divider.hidden = !(back || context || steps);
}

/** Deja la barra sin nada propio de una pantalla. La llama el router. */
export function clearHeader() {
  setHeader();
}

// El fixture de columnHints monta un pedazo de pantalla sin la barra: sin este
// guard, cualquier vista que la use tira "Cannot set properties of null".
function slot(key) {
  return document.getElementById(SLOT_IDS[key]);
}

function renderBack(el, back) {
  if (!el) return;
  el.innerHTML = '';
  if (!back) return;
  el.appendChild(buildButton({ ...back, className: 'btn btn--ghost btn--sm' }));
}

function renderContext(el, context) {
  if (!el) return;
  // Una pantalla puede traer su propio control de contexto en vez de texto: el
  // inicio cuelga acá el selector de mes, que ya viene con sus handlers puestos.
  if (context instanceof Node) { renderNodes(el, context); return; }
  const data = typeof context === 'string' ? { name: context } : context;
  if (!data || !data.name) { el.innerHTML = ''; return; }
  el.innerHTML = `
    ${data.tone ? `<span class="status-dot status-dot--${esc(data.tone)}" aria-hidden="true"></span>` : ''}
    <span class="app-header__client" title="${esc(data.name)}">${esc(data.name)}</span>
    ${data.meta ? `<span class="app-header__meta">· ${esc(data.meta)}</span>` : ''}
  `;
}

function renderSteps(el, steps) {
  if (!el) return;
  if (!steps || !Array.isArray(steps.labels) || steps.labels.length === 0) {
    el.innerHTML = '';
    return;
  }
  const { labels, current } = steps;
  el.innerHTML = `
    <div class="header-steps" role="list" aria-label="Pasos del control">
      ${labels.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        const mod = done ? ' header-step--done' : active ? ' header-step--active' : '';
        const connector = i < labels.length - 1
          ? `<span class="header-step__connector${done ? ' header-step__connector--done' : ''}"></span>`
          : '';
        return `
          <div class="header-step${mod}" role="listitem"${active ? ' aria-current="step"' : ''}>
            <span class="header-step__bubble">${done ? '✓' : i + 1}</span>
            <span class="header-step__label">${esc(label)}</span>
          </div>${connector}`;
      }).join('')}
    </div>
  `;
}

function renderHint(el, hint) {
  if (!el) return;
  const data = typeof hint === 'string' ? { text: hint } : hint;
  if (!data || !data.text) { el.innerHTML = ''; return; }
  const tone = data.tone === 'warn' ? ' gate-hint--warn' : '';
  el.innerHTML = `<span class="gate-hint${tone}">${esc(data.text)}</span>`;
}

function renderPrimary(el, primary) {
  if (!el) return;
  el.innerHTML = '';
  if (!primary) return;
  const variant = primary.variant === 'secondary' ? 'btn--secondary' : 'btn--primary';
  el.appendChild(buildButton({ ...primary, className: `btn ${variant} btn--sm` }));
}

/** Cuelga elementos ya armados por la pantalla, sin tocarles nada. */
function renderNodes(el, nodes) {
  if (!el) return;
  el.innerHTML = '';
  if (!nodes) return;
  (Array.isArray(nodes) ? nodes : [nodes]).forEach(node => { if (node) el.appendChild(node); });
}

/**
 * Un link si trae `href`, un botón si trae `onClick`. El `id` es opcional y lo
 * usan las pantallas que ya tenían uno (`js-next-btn`, `js-back-btn`): el
 * botón se mudó de lugar, pero se sigue llamando igual.
 */
function buildButton({ label, href, onClick, disabled, id, title, className }) {
  const el = document.createElement(href && !disabled ? 'a' : 'button');
  el.className = className;
  el.textContent = label ?? '';
  if (id)    el.id = id;
  if (title) el.title = title;
  if (el.tagName === 'A') {
    el.href = href;
  } else {
    el.type = 'button';
    if (disabled) el.disabled = true;
    // Con `href` y `disabled` a la vez cae acá: botón muerto, no un link que
    // navega igual (la primaria atenuada nunca desaparece — regla 2).
    if (onClick && !disabled) el.addEventListener('click', onClick);
  }
  return el;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
