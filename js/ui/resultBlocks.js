// resultBlocks.js — Bloques compartidos de la pantalla de resultados de un
// control: veredicto, tiles, casos para revisar, chequeos de coherencia, y los
// helpers de signo/flecha + "planilla con superpoderes" (sticky + magnitud).
//
// Antes cada control armaba su propio hero con `style.cssText` a mano (nr.js,
// variaciones.js, acreditaciones.js, brutos.js, rendXEe.js, catXEmpleados.js —
// cada uno con su propia variante). Este módulo saca el patrón común a un solo
// lugar. Ver DECISIONS.md — rediseño de resultados por control (2026-08).
//
// Patrón de pantalla que arma cada control con estas piezas:
//   veredicto (siempre visible, afuera de las solapas)
//   └── solapa "Resumen": tiles + casos para revisar + chequeos
//   └── solapa "Detalle": la tabla completa (buscador + paginación + export)

import { initTabs } from './tabs.js';
import { getViewPreference, setViewPreference } from './viewPreference.js';
import { currentTolerance, withTolerance } from '../controls/tolerance.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Signo + flecha compartidos ──────────────────────────────────────────────
// La variación nunca se codifica sólo por color (verde/rojo no alcanza para
// daltonismo) — siempre va acompañada de una flecha y un signo.

/** @returns {'up'|'dn'|'eq'} */
export function mvDir(diff, eps = 0.01) {
  if (diff === null || diff === undefined || !Number.isFinite(diff)) return 'eq';
  return diff > eps ? 'up' : diff < -eps ? 'dn' : 'eq';
}

export function mvArrow(diff, eps = 0.01) {
  const d = mvDir(diff, eps);
  return d === 'up' ? '▲' : d === 'dn' ? '▼' : '–';
}

/** Clase CSS de color para el signo — nunca es la única señal (siempre va con mvArrow). */
export function mvClass(diff, eps = 0.01) {
  return `mv-${mvDir(diff, eps)}`;
}

/** Número con signo explícito ("+1.234,56" / "−832,10" / "—" si no hay dato). */
export function fmtSigned(v, { decimals = 2, eps = 0.01 } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const sign = v > eps ? '+' : '';
  return sign + v.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ── Veredicto ────────────────────────────────────────────────────────────────
// tone: 'ok' | 'warn' | 'error' | 'info'

const VERDICT_ICON = { ok: '✓', warn: '⚠', error: '⚠', info: 'ℹ' };

/**
 * @param {HTMLElement} container
 * @param {{ tone?: 'ok'|'warn'|'error'|'info', title: string, body?: string, icon?: string }} opts
 *   `body` admite HTML simple (para <strong> en cifras) — el llamador es responsable de escapar
 *   cualquier dato de usuario que interpole ahí adentro.
 */
export function renderVerdict(container, { tone = 'info', title, body, icon } = {}) {
  const el = document.createElement('div');
  el.className = `rb-verdict rb-verdict--${tone}`;
  el.innerHTML = `
    <div class="rb-verdict__icon" aria-hidden="true">${icon || VERDICT_ICON[tone] || 'ℹ'}</div>
    <div class="rb-verdict__body">
      <h3>${esc(title)}</h3>
      ${body ? `<p>${body}</p>` : ''}
    </div>
  `;
  container.appendChild(el);
  return el;
}

// ── Tiles ────────────────────────────────────────────────────────────────────
// tiles: [{ label, value, tone?: 'ok'|'warn'|'error', sub? }] — value/sub admiten HTML simple.

export function renderTiles(container, tiles) {
  const el = document.createElement('div');
  el.className = 'rb-tiles';
  el.innerHTML = tiles.map(t => `
    <div class="rb-tile">
      <div class="rb-tile__label">${esc(t.label)}</div>
      <div class="rb-tile__value${t.tone ? ` rb-tile__value--${t.tone}` : ''}">${t.value}</div>
      ${t.sub ? `<div class="rb-tile__sub">${t.sub}</div>` : ''}
    </div>
  `).join('');
  container.appendChild(el);
  return el;
}

function sectionHeading(container, heading) {
  if (!heading) return;
  const h = document.createElement('div');
  h.className = 'rb-section-h';
  h.textContent = heading;
  container.appendChild(h);
}

// ── Casos para revisar ──────────────────────────────────────────────────────
// items: [{ sev?: 'hi'|'lo'|'minor', who, sub?, what, why?, right? }] — `right`
// admite HTML (p.ej. un mv-arrow). Los `sev:'minor'` no van acá — se filtran
// antes con renderMinorObservations() (calidad de dato, no una diferencia).
//
// groupBy (default 'who'): items que comparten el valor de ese campo se
// funden en un solo bloque — una barra de severidad, el `who` con la cantidad
// de observaciones, y los `what`/`why` de cada una apilados adentro. Con un
// item por `who` (el caso de casi todos los controles) esto no cambia nada
// visualmente respecto de antes.

export function renderIssues(container, { heading, items, groupBy = 'who' } = {}) {
  sectionHeading(container, heading);
  const el = document.createElement('div');
  el.className = 'rb-issues';

  const groups = [];
  const byKey = new Map();
  for (const i of items) {
    const key = i[groupBy];
    if (!byKey.has(key)) {
      const g = { key, sub: i.sub, rows: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    byKey.get(key).rows.push(i);
  }

  el.innerHTML = groups.map(g => {
    const hi = g.rows.some(i => i.sev === 'hi');
    const single = g.rows.length === 1;
    return `
      <div class="rb-issue">
        <div class="rb-issue__sev${hi ? ' rb-issue__sev--hi' : ''}"></div>
        <div class="rb-issue__who">${esc(g.key)}${single
          ? (g.sub ? `<small>${esc(g.sub)}</small>` : '')
          : `<small>${g.rows.length} observaciones</small>`}</div>
        <div class="rb-issue__body">
          ${g.rows.map(i => `
            <div class="rb-issue__what">${esc(i.what)}</div>
            ${i.why ? `<div class="rb-issue__why">${esc(i.why)}</div>` : ''}
          `).join('')}
        </div>
        ${single && g.rows[0].right !== undefined ? `<div class="rb-issue__right">${g.rows[0].right}</div>` : ''}
      </div>
    `;
  }).join('');
  container.appendChild(el);
  return el;
}

// ── Observaciones menores ───────────────────────────────────────────────────
// Los issues con sev:'minor' (calidad del dato de origen, no una diferencia a
// revisar — ej. "no trae CUIL") van en un <details> colapsado, agrupados por
// texto de `what`: un renglón por texto distinto, con la cantidad de unidades
// afectadas y — al abrir — la lista de quiénes.
// items: [{ who, sub?, what, why? }] (mismo shape que renderIssues, sin sev)

export function renderMinorObservations(container, items) {
  if (!items?.length) return null;
  sectionHeading(container, 'Observaciones menores');

  const groups = new Map(); // what → { why, whos: [{who, sub}] }
  for (const i of items) {
    if (!groups.has(i.what)) groups.set(i.what, { why: i.why, whos: [] });
    groups.get(i.what).whos.push({ who: i.who, sub: i.sub });
  }

  const el = document.createElement('div');
  el.className = 'rb-minor';
  el.innerHTML = [...groups.entries()].map(([what, g]) => `
    <details class="rb-minor-group">
      <summary>
        <span class="rb-minor-group__icon" aria-hidden="true">i</span>
        <span class="rb-minor-group__title">${esc(what)}</span>
        <span class="rb-minor-group__count">${g.whos.length} ${g.whos.length === 1 ? 'legajo' : 'legajos'}</span>
        ${g.why ? `<span class="rb-minor-group__why">${esc(g.why)}</span>` : ''}
        <span class="rb-minor-group__link">Ver detalle</span>
      </summary>
      <div class="rb-minor-group__list">
        ${g.whos.map(w => `
          <div class="rb-minor-group__item">${esc(w.who)}${w.sub ? ` <span class="rb-minor-group__item-sub">${esc(w.sub)}</span>` : ''}</div>
        `).join('')}
      </div>
    </details>
  `).join('');
  container.appendChild(el);
  return el;
}

// ── Chequeos de coherencia ──────────────────────────────────────────────────
// Se verifican siempre; se muestran discretos si dan bien y en amarillo si no.
// items: [{ label, detail?, ok }]
//
// OJO: `detail` va en TEXTO PLANO — se escapa acá abajo. Es al revés que el
// `right` de renderIssues(), que se inserta crudo. Mandar `formatDiff()` (que
// devuelve un <span>) a un `detail` no pinta nada: el analista termina viendo
// la etiqueta escrita como texto en la tarjeta. Para eso está `formatDiffText()`
// en js/utils/currency.js — el color del chip ya sale de `ok`.

export function renderChecks(container, { heading, items } = {}) {
  sectionHeading(container, heading);
  const el = document.createElement('div');
  el.className = 'rb-checks';
  el.innerHTML = items.map(c => `
    <span class="rb-chk${c.ok ? '' : ' rb-chk--bad'}">
      <span class="rb-chk__dot" aria-hidden="true"></span>
      <b>${esc(c.label)}</b>
      ${c.detail ? `<span class="rb-chk__detail">${esc(c.detail)}</span>` : ''}
    </span>
  `).join('');
  container.appendChild(el);
  return el;
}

// ── Solapas Resumen · Fichas · Planilla ──────────────────────────────────────
// El veredicto va SIEMPRE afuera (arriba), visible sin clickear nada. Las
// solapas son para lo que sigue: el resumen (tiles/casos/chequeos), las fichas
// (una tarjeta desplegable por unidad, donde se entiende POR QUÉ no cierra) y
// la planilla (la tabla ancha, donde se compara entre casos y se totaliza).
//
// Son las mismas tres, con los mismos nombres y en el mismo orden, en todos los
// controles (§2 de specs/vista-estandar-resultados.md). Un control sin fichas
// muestra dos — nunca un tercer nombre para lo mismo.

/** 'conDif' / 'sinDif' — con qué clave se guarda la preferencia de solapa. */
function estadoKey(conDiferencias) {
  if (conDiferencias === undefined || conDiferencias === null) return undefined;
  return conDiferencias ? 'conDif' : 'sinDif';
}

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {(panel: HTMLElement) => void} opts.resumen
 * @param {(panel: HTMLElement) => void} [opts.fichas] - la solapa Fichas (§4).
 *   Sin esto la pantalla muestra dos solapas, no tres.
 * @param {(panel: HTMLElement) => void} [opts.planilla] - la planilla con bandas (§5).
 * @param {(panel: HTMLElement) => void} [opts.detalle] - el nombre viejo de la
 *   última solapa, para los controles que todavía no migraron.
 * @param {string} [opts.detalleLabel='Detalle'] - rótulo de `detalle` (con
 *   `planilla` el rótulo es siempre "Planilla": es la palabra del estándar).
 * @param {{ id: string, label: string, render: (panel: HTMLElement) => void }[]} [opts.extraTabs]
 *   Una solapa MÁS, después de la Planilla. **No es la puerta para que cada
 *   control invente las suyas**: las tres del §2 son las mismas en los 21, y acá
 *   sólo entra la vista que la spec le reconoce por nombre a un control en el
 *   mapa del §8 — hoy la única es la matriz campo × legajo de EE x CATEG
 *   ("Por campo"), que contesta algo que ni la ficha ni la planilla contestan:
 *   si un campo falla en un legajo o en toda la nómina.
 * @param {boolean} [opts.conDiferencias] - cómo terminó el control en esta
 *   corrida. Decide qué solapa abre la primera vez (con diferencias, Fichas;
 *   si cerró, Planilla) y con qué clave se guarda la preferencia del analista.
 * @param {string} [opts.controlId] - id del registry (ver `js/controls/registry.js`).
 *   Con esto, la solapa que el analista dejó abierta la última vez para ESTE
 *   control y ESTE estado se recuerda entre sesiones (`viewPreference.js`) y es
 *   la que abre por default en la próxima corrida — a menos que el propio
 *   control fuerce `activeId` (ej. acreditaciones.js, que necesita mantener la
 *   solapa activa entre sus propios re-renders dentro de la misma corrida).
 */
export function renderResumenDetalle(container, {
  resumen, fichas, planilla, detalle, detalleLabel = 'Detalle', extraTabs = [],
  activeId, onChange, controlId, conDiferencias,
}) {
  // **Con qué monto de diferencia se dibuja cada solapa.** El borde de la app
  // envuelve el render en `withTolerance()` (D-069), pero una solapa se dibuja
  // recién cuando el analista la clickea — o sea, ya fuera de ese envoltorio, con
  // el monto de vuelta en el centavo del default. Resultado: el Resumen contaba
  // las diferencias con el monto del cliente y la tabla de al lado las pintaba de
  // rojo con $ 0,01, así que la misma pantalla decía dos cosas distintas del
  // mismo legajo (verificado con un legajo de $ 40 de diferencia y el monto del
  // cliente en $ 100: la tile decía "sin diferencia" y la celda salía en rojo).
  // Se captura acá el monto de la corrida y se vuelve a poner al dibujar cada
  // solapa, que es lo único que hace falta para que toda la pantalla mida igual.
  const tol = currentTolerance();
  const conMonto = (fn) => (panel) => withTolerance(tol, () => fn(panel));

  const tabs = [{ id: 'resumen', label: 'Resumen', render: conMonto(resumen) }];
  if (fichas) tabs.push({ id: 'fichas', label: 'Fichas', render: conMonto(fichas) });
  if (planilla) tabs.push({ id: 'planilla', label: 'Planilla', render: conMonto(planilla) });
  else if (detalle) tabs.push({ id: 'detalle', label: detalleLabel, render: conMonto(detalle) });
  for (const t of extraTabs) tabs.push({ id: t.id, label: t.label, render: conMonto(t.render) });

  const estado = estadoKey(conDiferencias);
  // Con diferencias lo primero que se ve es por qué falla; si cerró, la planilla
  // que totaliza. La preferencia guardada pisa el default, pero sólo la de ESTE
  // estado (ver viewPreference.js).
  const porDefecto = estado === undefined ? undefined
    : (conDiferencias ? 'fichas' : 'planilla');

  return initTabs(container, {
    tabs,
    activeId: activeId ?? getViewPreference(controlId, estado).tab ?? porDefecto,
    onChange(id) {
      setViewPreference(controlId, { tab: id }, estado);
      onChange?.(id);
    },
  });
}

// ── Planilla con superpoderes ────────────────────────────────────────────────
// Sticky header + footer (dentro de un scroll acotado) y sticky de las
// primeras 1-2 columnas — vía clases CSS, no vía estilos por celda, para que
// sobreviva a un control que reconstruye el <tbody> al ordenar/filtrar
// (ej. rendVsAsiento.js). Sólo mide en JS el ancho de la 1ª columna, que es
// lo único que no se puede resolver con CSS puro cuando hay 2 columnas fijas.
//
// Envuelve la tabla en su propio contenedor de scroll (creándolo si hace
// falta) — así un `<p>` al pie, fuera de la tabla, nunca queda atrapado
// adentro del recuadro que hace scroll.
//
// El ancho de la 1ª columna fija es un valor DECLARADO (`col1Width`), no
// medido en runtime — antes se medía en un rAF después del primer layout, y
// si el <tbody> se reconstruía (búsqueda, orden, resize) el valor quedaba
// viejo y se abría una franja entre las dos columnas fijas. Con un ancho fijo
// vía CSS var (`--rb-stick1-width`) el 2º sticky siempre calza, sin medir.
//
// @param {HTMLTableElement} tableEl
// @param {{ stickyCols?: 0|1|2, col1Width?: number }} [opts]
//   stickyCols: 0 = sólo sticky de header/footer, sin columnas fijas
//     (usar cuando la 1ª/2ª columna real de la tabla no es la que conviene anclar, ej. fechas primero)
//   col1Width: ancho en px de la 1ª columna cuando stickyCols=2 (default 74 — legajo)
// @returns {HTMLElement} el wrapper con el scroll acotado
export function enhanceGrid(tableEl, { stickyCols = 1, col1Width = 74 } = {}) {
  let wrap = tableEl.parentElement;
  if (!wrap || !wrap.classList.contains('rb-grid-wrap')) {
    wrap = document.createElement('div');
    wrap.className = 'rb-grid-wrap';
    tableEl.replaceWith(wrap);
    wrap.appendChild(tableEl);
  }
  tableEl.classList.add('rb-grid');
  tableEl.classList.toggle('rb-grid--stick2', stickyCols >= 2);
  tableEl.classList.toggle('rb-grid--stick1', stickyCols === 1);
  // Cuántas columnas quedan fijas, para las piezas que lo necesitan después del
  // primer layout (el rótulo de banda, que no puede meterse abajo de ellas).
  tableEl.dataset.stickyCols = String(stickyCols);

  if (stickyCols >= 2) {
    tableEl.style.setProperty('--rb-stick1-width', `${col1Width}px`);
  }

  enhanceGroupedHead(tableEl, stickyCols);
  reserveTotalsWidth(tableEl);
  enhanceWidthEscape(wrap);
  return wrap;
}

// ── El ancho que necesita la fila de TOTAL ───────────────────────────────────
//
// Un total suma cientos de legajos, así que tiene DOS O TRES DÍGITOS MÁS que
// cualquier importe de la tabla ("36.857.323,85" por legajo → "28.777.461.315,60"
// de total). Cuando la planilla es más ancha que la pantalla, el navegador reparte
// el ancho mirando el encabezado y las filas de datos y le da a la columna lo que
// necesita el importe de UN legajo: el total, que está alineado a la derecha, se
// dibuja entonces más ancho que su columna y se derrama sobre la de al lado. Así
// se veía "0,00" seguido de "36.857.323,85" como si fuera un solo número — el
// síntoma que reportó Willy en Acumuladores (D-060).
//
// No se puede pedir en CSS: `min-width: max-content` en una celda de tabla lo
// ignora el navegador (verificado), y un `min-width` fijo en px sería un número
// inventado que sobra en las columnas cortas. Así que se mide el texto que la
// fila de TOTAL ya tiene puesto —13 mediciones, una por columna, una sola vez— y
// se reserva ese ancho como piso.
//
// No hace falta recalcularlo cuando el analista filtra: `initSelectionTotals`
// reemplaza los totales por los de la selección, que son MÁS CORTOS que el total
// general, así que el piso que reservamos sigue alcanzando.
//
// El piso se escribe en la celda del ENCABEZADO de esa columna, no en la del pie:
// cuando la planilla no entra a lo ancho, el navegador no mira las celdas del
// `<tfoot>` para repartir el ancho (verificado — un `min-width` en el pie no mueve
// nada) y sí respeta el del encabezado, que además es la fila que ningún control
// reconstruye al ordenar o filtrar.
function reserveTotalsWidth(tableEl) {
  const footRow = tableEl.tFoot?.rows?.[0];
  const headRows = [...(tableEl.tHead?.rows || [])];
  if (!footRow || headRows.length === 0) return;

  const headByCol = headCellsByColumn(headRows);
  const range = document.createRange();

  let col = 0;
  for (const cell of footRow.cells) {
    const span = cell.colSpan || 1;
    const target = span === 1 ? headByCol[col] : null;
    col += span;
    // El rótulo ("TOTAL — 514 legajos") ocupa las columnas fijas y no es un
    // importe; y un encabezado que agrupa varias columnas no representa a una
    // sola, así que reservarle ancho no diría de cuál.
    if (!target || (target.colSpan || 1) > 1) continue;

    range.selectNodeContents(cell);
    const textWidth = range.getBoundingClientRect().width;
    // Ficha colapsada (ancho 0): todavía no hay nada que medir. Lo reintenta el
    // observer de enhanceWidthEscape cuando la tabla se muestre.
    if (textWidth <= 0) continue;

    const cs = getComputedStyle(target);
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const floor = Math.ceil(textWidth + pad);
    // Nunca se baja un piso ya puesto: si el encabezado necesita más que el
    // total, manda el encabezado.
    if (floor > (parseFloat(target.style.minWidth) || 0)) {
      target.style.minWidth = `${floor}px`;
    }
  }
  range.detach?.();
}

/**
 * Qué celda del encabezado representa a cada columna: la de la última fila que
 * la ocupa (con encabezado de dos niveles, la de abajo — salvo que la de arriba
 * baje con `rowspan`). Mismo recorrido que `paintColumnGroups`.
 */
function headCellsByColumn(headRows) {
  const byCol = [];
  const spannedCols = new Set();

  let col = 0;
  for (const th of headRows[0].cells) {
    const span = th.colSpan || 1;
    for (let k = 0; k < span; k++) {
      byCol[col + k] = th;
      if ((th.rowSpan || 1) > 1) spannedCols.add(col + k);
    }
    col += span;
  }

  for (const row of headRows.slice(1)) {
    let c = 0;
    for (const th of row.cells) {
      while (spannedCols.has(c)) c++;
      const span = th.colSpan || 1;
      for (let k = 0; k < span; k++) byCol[c + k] = th;
      c += span;
    }
  }
  return byCol;
}

// ── "Ampliar": la salida para la planilla que ni así entra ───────────────────
//
// El Detalle ya usa el ancho de la ventana (`.page-content--wide`, D-060), y con
// eso la mayoría de las planillas entran completas. Las más anchas —Acumuladores
// con 13 columnas, rendVsAsiento— siguen sin entrar en una notebook, y para esas
// va este botón: agranda la planilla a toda la pantalla, sin sacar al analista de
// la corrida (al cerrar vuelve a donde estaba, con el filtro y el orden puestos).
//
// El botón aparece SÓLO si de verdad falta ancho: mostrarlo en una tabla que ya
// se ve entera es ofrecer una solución a un problema que el analista no tiene.
// Se re-evalúa con un ResizeObserver porque la tabla puede montarse dentro de una
// ficha colapsada (ancho 0) o cambiar de ancho al abrirse otra solapa.

const escapeWired = new WeakSet();

// Cuál planilla está ampliada ahora, y cómo cerrarla. Es UNA sola en toda la app:
// hay 19 planillas y algunos controles rebobinan su tabla al ordenar (crean un
// wrap nuevo), así que el Escape se escucha una vez acá y no una vez por tabla —
// si no, cada re-render dejaba un listener más colgado del documento.
let openFull = null;

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !openFull) return;
  e.preventDefault();
  openFull();
});

function enhanceWidthEscape(wrap) {
  if (escapeWired.has(wrap)) return;
  escapeWired.add(wrap);

  const bar = document.createElement('div');
  bar.className = 'rb-grid-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" class="btn btn--ghost btn--sm js-rb-expand" aria-pressed="false">
      <span aria-hidden="true">⤢</span> Ampliar
    </button>
  `;
  wrap.insertAdjacentElement('beforebegin', bar);

  const btn = bar.querySelector('.js-rb-expand');
  let full = false;

  const setFull = (value) => {
    // Una sola ampliada por vez: si había otra abierta, se cierra primero.
    if (value && openFull && openFull !== close) openFull();

    full = value;
    wrap.classList.toggle('rb-grid-wrap--full', full);
    document.body.classList.toggle('has-rb-grid-full', full);
    btn.setAttribute('aria-pressed', String(full));
    btn.innerHTML = full
      ? '<span aria-hidden="true">✕</span> Salir de pantalla completa'
      : '<span aria-hidden="true">⤢</span> Ampliar';
    openFull = full ? close : null;
    // Ampliada siempre se ofrece el camino de vuelta, aunque ya entre toda.
    if (full) { bar.hidden = false; btn.focus(); }
    else refresh();
  };

  const close = () => setFull(false);

  const refresh = () => {
    // Con la ficha colapsada el ancho es 0 y no hay nada que medir todavía: la
    // reserva de ancho de los totales se hace acá, cuando la tabla se muestra.
    const grid = wrap.querySelector('table.rb-grid');
    if (wrap.clientWidth > 0 && grid) { reserveTotalsWidth(grid); syncBandInset(grid); }
    if (full) return;
    const falta = wrap.clientWidth > 0 && wrap.scrollWidth > wrap.clientWidth + 1;
    bar.hidden = !falta;
  };

  btn.addEventListener('click', () => setFull(!full));

  refresh();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refresh).observe(wrap);
}

// ── Encabezado de dos niveles: grupos tintados y sticky escalonado ──────────
//
// Varios controles arman el encabezado en dos filas: la de arriba agrupa
// ("Salario Base", "A Cta Fut Aumen") y la de abajo son las columnas del grupo.
// Con las dos filas en `top:0` la segunda tapaba a la primera al scrollear, y el
// tinte de cada grupo lo elegía cada control con un hex inline — el mismo
// concepto salía celeste en un control y lila en otro.
//
// Se resuelve acá, sobre la tabla ya pintada: la 2ª fila se pega debajo de la 1ª
// (`--rb-thead-h1`, medido de la fila real porque su alto depende del texto), y
// cada grupo recibe una clase de tinte alternado (celeste dim / navy dim) que
// alcanza a su encabezado y a sus celdas. El `background` inline del control se
// borra en esas celdas: si no, ganaría por especificidad y el tinte del sistema
// no se vería.

const observedHeads = new WeakSet();

function enhanceGroupedHead(tableEl, stickyCols = 1) {
  const headRows = [...(tableEl.tHead?.rows || [])];
  tableEl.classList.toggle('rb-grid--2lvl', headRows.length >= 2);
  if (headRows.length < 2) return;

  syncHeadRowHeight(tableEl, headRows[0]);
  paintColumnGroups(tableEl, headRows, stickyCols);
  syncBandInset(tableEl);
}

// ── El rótulo de la banda tiene que quedar visible al scrollear ──────────────
//
// La banda ("Salario Base", "Retenciones del mes") ES la idea de esta vista: es
// lo que hace que 13 columnas se lean como tres grupos. Pero el `<th>` de la
// banda es ancho y su rótulo está centrado adentro, así que al scrollear a la
// derecha el rótulo se va con la banda: se mete abajo de las columnas
// congeladas —que están fijas y lo tapan— y desaparece justo cuando el analista
// más lo necesita, porque ya no ve el encabezado de la izquierda.
//
// Se arregla acá, en la pieza, y lo heredan los controles que ya usan bandas:
// el rótulo se envuelve en un `<span>` sticky, anclado a la derecha de las
// columnas fijas (`--rb-band-inset`). El span está contenido por su propia
// celda, así que nunca se escapa de su banda — se corre hasta el borde de la
// banda y ahí sale de la vista, que es lo correcto: esa banda ya no se ve.
//
// El rótulo de la PRIMERA banda no se envuelve: viaja con las columnas
// congeladas (§5), o sea que su celda ya está fija y su rótulo con ella.

/** Ancho real de las columnas congeladas — el ancla del rótulo de banda. */
function syncBandInset(tableEl) {
  const stickyCols = Number(tableEl.dataset.stickyCols ?? 1);
  if (!stickyCols) { tableEl.style.setProperty('--rb-band-inset', '0px'); return; }

  const row = tableEl.tBodies[0]?.rows[0];
  if (!row) return;
  let w = 0;
  for (let i = 0; i < stickyCols && i < row.cells.length; i++) w += row.cells[i].offsetWidth;
  // Ancho 0 = la tabla todavía no se dibujó (ficha colapsada, solapa oculta):
  // lo reintenta el observer de enhanceWidthEscape cuando se muestre.
  if (w > 0) tableEl.style.setProperty('--rb-band-inset', `${Math.round(w)}px`);
}

/** Envuelve el rótulo de una banda para poder fijarlo. Idempotente. */
function wrapBandLabel(th) {
  if (!th || th.querySelector(':scope > .rb-grid__band')) return;
  const span = document.createElement('span');
  span.className = 'rb-grid__band';
  while (th.firstChild) span.appendChild(th.firstChild);
  th.appendChild(span);
}

/** El alto real de la 1ª fila del encabezado, para que la 2ª se pegue abajo. */
function syncHeadRowHeight(tableEl, headRow) {
  const apply = () => {
    const h = headRow.offsetHeight;
    // Sin alto todavía (la ficha del control está colapsada): se deja el default
    // del CSS y el observer lo corrige cuando la tabla se muestre.
    if (h > 0) tableEl.style.setProperty('--rb-thead-h1', `${h}px`);
  };
  apply();
  if (typeof ResizeObserver !== 'undefined' && !observedHeads.has(headRow)) {
    observedHeads.add(headRow);
    new ResizeObserver(apply).observe(headRow);
  }
}

/** Tinte alternado por grupo, del encabezado hasta la fila de totales. */
function paintColumnGroups(tableEl, headRows, stickyCols = 1) {
  // Columna donde arranca cada celda de la 1ª fila; las que abarcan las dos
  // filas (rowspan) ocupan su columna también en la 2ª.
  const ranges = [];
  const spannedCols = new Set();
  let col = 0;
  // La banda que ocupa las columnas congeladas ("Identificación") NO entra en la
  // alternancia: su fondo lo decide la regla de sticky, así que gastarle un
  // turno de tinte dejaba a la primera banda de verdad con el tono de fondo y a
  // la segunda con el celeste — al revés de como se lee.
  for (const th of headRows[0].cells) {
    const span = th.colSpan || 1;
    if ((th.rowSpan || 1) > 1) for (let k = 0; k < span; k++) spannedCols.add(col + k);
    if (span > 1 && col >= stickyCols) {
      ranges.push({ from: col, to: col + span - 1, cls: `rb-grid__grp--${ranges.length % 2 === 0 ? 'a' : 'b'}`, th });
    }
    col += span;
  }
  if (ranges.length === 0) return;

  // Las celdas de la 2ª fila caen en las columnas que la 1ª no ocupó con rowspan.
  const row2 = [];
  let c2 = 0;
  for (const th of headRows[1].cells) {
    while (spannedCols.has(c2)) c2++;
    const span = th.colSpan || 1;
    for (let k = 0; k < span; k++) row2[c2 + k] = th;
    c2 += span;
  }

  const bodyRows = [...tableEl.tBodies].flatMap(b => [...b.rows]).concat([...(tableEl.tFoot?.rows || [])]);

  for (const { from, to, cls, th } of ranges) {
    tint(th, cls);
    // La 1ª banda ocupa las columnas fijas: su celda ya está anclada.
    if (from >= stickyCols) wrapBandLabel(th);
    for (let i = from; i <= to; i++) tint(row2[i], cls);
    for (const tr of bodyRows) {
      const byCol = [];
      let c = 0;
      for (const cell of tr.cells) {
        const span = cell.colSpan || 1;
        for (let k = 0; k < span; k++) byCol[c + k] = cell;
        c += span;
      }
      for (let i = from; i <= to; i++) tint(byCol[i], cls);
    }
  }
}

function tint(cell, cls) {
  if (!cell || cell.classList.contains(cls)) return;
  cell.classList.remove('rb-grid__grp--a', 'rb-grid__grp--b');
  cell.classList.add(cls);
  cell.style.background = '';
}

/** Barra de magnitud para poner DENTRO de una celda `.rb-magcell` — de un vistazo, quién se dispara. */
export function magnitudeBarHtml(value, max) {
  if (!max || !Number.isFinite(value) || value === 0) return '';
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  return `<span class="rb-magbar" aria-hidden="true" style="width:${pct.toFixed(1)}%"></span>`;
}

/**
 * El contenido de una celda Δ: la diferencia como badge de error (pantalla 7 del
 * rediseño), el 0,00 en discreto, y la ausencia como badge warn.
 *
 * `null` NO es `0` (CLAUDE.md): no se pudo comparar porque falta un lado, y eso
 * es lo que dice el badge — antes salía un "—" mudo que se confundía con "dio
 * cero". `absentLabel` deja que el control diga de qué lado falta
 * ("ausente en Tab"); sin eso, se dice lo único que se sabe.
 *
 * @param {number|null} value
 * Sin `eps` explícito mide con el monto de diferencia de la corrida (D-069):
 * lo que queda por debajo se pinta como "sin diferencia", no como hallazgo.
 *
 * @param {{ max?: number, decimals?: number, eps?: number, absentLabel?: string }} [opts]
 */
export function diffBadgeHtml(value, { max = 0, decimals = 2, eps = currentTolerance(), absentLabel } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return `<span class="rb-diffbadge rb-diffbadge--warn">${esc(absentLabel || 'sin comparar')}</span>`;
  }
  const hasDiff = Math.abs(value) > eps;
  if (!hasDiff) return `<span class="rb-diffzero">${fmtSigned(value, { decimals, eps })}</span>`;
  return `<span class="rb-diffbadge rb-diffbadge--error">${fmtSigned(value, { decimals, eps })}</span>${magnitudeBarHtml(value, max)}`;
}

/**
 * Celda `<td>` de diferencia lista para usar: signo+flecha (nunca sólo color)
 * + barra de magnitud opcional. Reemplaza el patrón repetido
 * `<td style="...">${fmt(v)}</td>` + `diffStyle(v)` de cada control.
 *
 * @param {number|null} value
 * @param {{ max?: number, decimals?: number, eps?: number, background?: string, absentLabel?: string }} [opts]
 */
export function diffCellHtml(value, { max = 0, decimals = 2, eps = currentTolerance(), background = '', absentLabel } = {}) {
  const bg = background ? `background:${background};` : '';
  const cls = (value === null || value === undefined) ? '' : ` ${mvClass(value, eps)}`;
  return `<td class="rb-magcell${cls}" style="text-align:right;${bg}">${diffBadgeHtml(value, { max, decimals, eps, absentLabel })}</td>`;
}

// ── La planilla del estándar: bandas, base de cálculo y TOTAL ────────────────
//
// El §5 de specs/vista-estandar-resultados.md, como una pieza: 19 de los 21
// controles muestran la misma tabla ancha —rubros agrupados en bandas, la base
// de cálculo abajo de cada título, las dos primeras columnas congeladas y una
// fila de TOTAL— y hasta acá cada uno la escribía a mano, con su propio HTML y
// sus propios tintes. Acá el control declara SUS COLUMNAS y nada más.
//
// Descriptor de columna:
//   key    — propiedad de la fila
//   label  — título de la columna (la 2ª fila del encabezado)
//   sub    — la base de cálculo, abajo del título en chico y gris: '1100',
//            '1003 + 1017', '8,33 %'. Es lo que hace que la planilla se explique
//            sola, y por eso va en la pieza y no como un comentario del control.
//   num    — es un importe: a la derecha, cifras de ancho fijo, y entra al TOTAL
//   band   — a qué banda pertenece (la 1ª fila del encabezado). La primera es
//            siempre 'Identificación' y viaja con las columnas congeladas.
//   close  — cierra la banda: negrita sobre un gris más marcado
//   diff   — la columna ES una diferencia. Implica `num`, y la celda se dibuja
//            con el badge del estándar: rojo arriba del monto de diferencia del
//            cliente, gris cuando cerró, y ámbar "sin comparar" cuando falta un
//            lado (`null` no es `0`). La barra de magnitud se escala sola contra
//            la diferencia más grande de la planilla — antes cada control
//            calculaba ese máximo a mano y con su propio criterio.
//   absentLabel — qué dice el badge ámbar de esa columna ("ausente en Tab")
//   cell   — (row) => HTML de la celda, para lo que no es un importe pelado (un
//            pill de estado, un enlace). Con esto el control sigue decidiendo
//            cómo se ve su número; la pieza decide dónde va.
//   total  — `false` para no totalizar una columna numérica, o (rows) => número
//            para un total que no es la suma. **Ojo con las columnas de
//            diferencia**: varios controles muestran ahí la RESTA DE LOS TOTALES
//            (Σ Tab − Σ Reporte), que no es lo mismo que la suma de la columna
//            cuando algún legajo no se pudo comparar — ese es el número que la
//            tile del Resumen también muestra, así que se declara con `total`.
//
// **Ausencia de dato es `—`, nunca `0,00`** (`null` no es `0`, CLAUDE.md).

/** Las bandas, en orden, con el rango de columnas de cada una. */
function bandsOf(columns) {
  const bands = [];
  columns.forEach((c, i) => {
    const band = c.band ?? '';
    const last = bands[bands.length - 1];
    if (last && last.band === band) { last.to = i; last.cols.push(c); }
    else bands.push({ band, from: i, to: i, cols: [c] });
  });
  return bands;
}

/** ` class="…"` de una celda, o nada si no le corresponde ninguna clase. */
function colClass(col, extra = '') {
  const cls = [
    (col.num || col.diff) ? 'rb-col--num' : '',
    col.close ? 'rb-col--close' : '',
    // `rb-magcell` no es decorativa: posiciona la barra de magnitud, y es de
    // donde `initSelectionTotals`/`initToolbarKpis` deducen que esta planilla
    // compara algo (el KPI "N con diferencias" sale de ahí).
    col.diff ? 'rb-magcell' : '',
    extra,
  ].filter(Boolean).join(' ');
  return cls ? ` class="${cls}"` : '';
}

/** El total de una columna: la suma de lo que hay, `null` si no hay nada que sumar. */
function columnTotal(col, rows) {
  if (typeof col.total === 'function') return col.total(rows);
  if (col.total === false || !(col.num || col.diff)) return null;
  let acc = null;
  for (const r of rows) {
    const v = r[col.key];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    acc = (acc ?? 0) + v;
  }
  return acc;
}

/**
 * El HTML de la planilla. Función pura (se testea sin navegador); quien la monta
 * en el DOM y le pone los superpoderes es `renderRubroGrid()`.
 *
 * @param {object} opts
 * @param {object[]} opts.columns - los descriptores de arriba
 * @param {object[]} opts.rows
 * @param {string} [opts.unitLabel='legajos'] - la unidad que cuenta la fila de
 *   TOTAL. Es la que declara el control en `unit` (legajo, centro de costo,
 *   cuenta, lista) — de acá sale "TOTAL de la selección — 1 legajo" al filtrar.
 * @param {boolean} [opts.totals=true]
 * @param {boolean} [opts.bands=true] - `false` para una planilla sin bandas: la
 *   que no agrupa nada porque no compara importes (EE x CATEG cruza campos de
 *   texto). Sin esto saldría una franja oscura vacía arriba del encabezado.
 */
export function rubroGridHtml({ columns, rows, unitLabel = 'legajos', totals = true, stickyCols = 2, bands: conBandas = true }) {
  const bands = conBandas ? bandsOf(columns) : [];
  const bandRow = bands.map((b, i) => `
    <th colspan="${b.cols.length}"${b.cols.length > 1 ? ' style="text-align:center;"' : ''}${i > 0 ? ' class="rb-band--next"' : ''}>${esc(b.band)}</th>
  `).join('');

  const headRow = columns.map((c, i) => {
    const startsBand = bands.some(b => b.from === i && b.from > 0);
    // Las columnas congeladas viven en la 2ª fila (la 1ª es la de bandas), así
    // que se marcan para que el CSS las pueda fijar: la regla por posición sólo
    // alcanza a la primera fila del encabezado (ver css/components.css).
    const congelada = i < stickyCols ? ` rb-grid__stick-${i + 1}` : '';
    return `
      <th${colClass(c, (startsBand ? 'rb-band--next' : '') + congelada)}>
        <span class="rb-col__label">${esc(c.label)}</span>
        ${c.sub ? `<span class="rb-col__sub">${esc(c.sub)}</span>` : ''}
      </th>
    `;
  }).join('');

  // La barra de magnitud de TODAS las columnas de diferencia se escala contra la
  // misma referencia: la diferencia más grande de la planilla. Con una escala por
  // columna, una diferencia de $ 40 en una columna chica dibujaba la misma barra
  // que una de $ 400.000 en otra.
  const maxDiff = Math.max(0, ...columns.filter(c => c.diff).flatMap(
    c => rows.map(r => Math.abs(Number.isFinite(r[c.key]) ? r[c.key] : 0))));

  const bodyRows = rows.map(r => `
    <tr>
      ${columns.map((c, i) => {
        const startsBand = bands.some(b => b.from === i && b.from > 0);
        const v = r[c.key];
        const extra = [
          startsBand ? 'rb-band--next' : '',
          c.diff && v !== null && v !== undefined ? mvClass(v) : '',
        ].filter(Boolean).join(' ');
        const cls = colClass(c, extra);
        if (typeof c.cell === 'function') return `<td${cls}>${c.cell(r)}</td>`;
        if (c.diff) return `<td${cls}>${diffBadgeHtml(v, { max: maxDiff, ...(c.absentLabel ? { absentLabel: c.absentLabel } : {}) })}</td>`;
        return `<td${cls}>${c.num ? esc(fmtAmountOrDash(v)) : esc(v ?? '—')}</td>`;
      }).join('')}
    </tr>
  `).join('');

  // El rótulo del TOTAL ocupa la banda de identificación entera (las columnas
  // congeladas): es donde el analista lo busca, y es de donde sale la unidad
  // cuando pasa a ser el total de la selección (ver selectionLabelHtml).
  // Sin bandas no hay una "banda de identificación" que le preste su ancho al
  // rótulo del TOTAL: lo ocupan las columnas congeladas, que es donde el
  // analista lo busca igual.
  const labelSpan = conBandas ? (bands[0]?.cols.length || 1) : Math.max(1, stickyCols);
  const totalCells = columns.slice(labelSpan).map((c, k) => {
    const i = labelSpan + k;
    const startsBand = bands.some(b => b.from === i && b.from > 0);
    const cls = colClass(c, startsBand ? 'rb-band--next' : '');
    const v = columnTotal(c, rows);
    if (v === null) return `<td${cls}></td>`;
    // El total de una diferencia va con su signo: "−484.960,00" y "+15.040,00"
    // dicen cosas distintas. (El badge sale sin cápsula en el pie — lo apaga el
    // CSS: la fila entera ya está destacada.)
    return `<td${cls}>${c.diff ? diffBadgeHtml(v) : esc(fmtAmountOrDash(v))}</td>`;
  }).join('');

  const unidad = rows.length === 1 ? singularUnit(unitLabel) : unitLabel;

  return `
    <table class="data-table data-table--compact rb-rubro">
      <thead>
        ${conBandas ? `<tr class="rb-rubro__bands">${bandRow}</tr>` : ''}
        <tr>${headRow}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      ${totals ? `<tfoot>
        <tr>
          <td class="rb-total__label" colspan="${labelSpan}"><strong>TOTAL</strong> — ${rows.length} ${esc(unidad)}</td>
          ${totalCells}
        </tr>
      </tfoot>` : ''}
    </table>
  `;
}

/** Importe con cifras de ancho fijo; ausencia de dato es `—`, nunca `0,00`. */
function fmtAmountOrDash(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 'legajos' → 'legajo' · 'centros de costo' → 'centro de costo'. */
function singularUnit(unitLabel) {
  const [primera, ...resto] = String(unitLabel).split(' ');
  return primera.endsWith('s') ? [primera.slice(0, -1), ...resto].join(' ') : unitLabel;
}

/**
 * Monta la planilla en el DOM y le pone los superpoderes de `enhanceGrid()`
 * (sticky, columnas fijas, rótulo de banda anclado, ancho de la fila de TOTAL).
 * El buscador, la paginación y el TOTAL de la selección los engancha el control
 * con `wireTableTools()` sobre la tabla que devuelve.
 *
 * @returns {{ tableEl: HTMLTableElement, wrap: HTMLElement }}
 */
export function renderRubroGrid(host, { columns, rows, unitLabel, totals = true, stickyCols = 2, col1Width, bands = true } = {}) {
  const holder = document.createElement('div');
  holder.innerHTML = rubroGridHtml({ columns, rows, unitLabel, totals, stickyCols, bands });
  const tableEl = holder.querySelector('table');
  host.appendChild(tableEl);
  const wrap = enhanceGrid(tableEl, { stickyCols, ...(col1Width !== undefined ? { col1Width } : {}) });
  return { tableEl, wrap };
}
