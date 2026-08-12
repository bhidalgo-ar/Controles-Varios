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

// ── Solapas Resumen / Detalle ────────────────────────────────────────────────
// El veredicto va SIEMPRE afuera (arriba), visible sin clickear nada. Estas
// dos solapas son para lo que sigue: el resumen (tiles/casos/chequeos) y el
// detalle (la tabla completa con buscador, paginación y export).

/**
 * @param {string} [controlId] - id del registry (ver `js/controls/registry.js`).
 *   Con esto, la solapa que el analista dejó abierta la última vez para ESTE
 *   control se recuerda entre sesiones (`viewPreference.js`) y es la que abre
 *   por default en la próxima corrida — a menos que el propio control fuerce
 *   `activeId` (ej. acreditaciones.js, que necesita mantener la solapa activa
 *   entre sus propios re-renders dentro de la misma corrida).
 */
export function renderResumenDetalle(container, { resumen, detalle, detalleLabel = 'Detalle', activeId, onChange, controlId }) {
  return initTabs(container, {
    tabs: [
      { id: 'resumen', label: 'Resumen', render: resumen },
      { id: 'detalle', label: detalleLabel, render: detalle },
    ],
    activeId: activeId ?? getViewPreference(controlId).tab,
    onChange(id) {
      setViewPreference(controlId, { tab: id });
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

  if (stickyCols >= 2) {
    tableEl.style.setProperty('--rb-stick1-width', `${col1Width}px`);
  }
  return wrap;
}

/** Barra de magnitud para poner DENTRO de una celda `.rb-magcell` — de un vistazo, quién se dispara. */
export function magnitudeBarHtml(value, max) {
  if (!max || !Number.isFinite(value) || value === 0) return '';
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  return `<span class="rb-magbar" aria-hidden="true" style="width:${pct.toFixed(1)}%"></span>`;
}

/**
 * Celda `<td>` de diferencia lista para usar: signo+flecha (nunca sólo color)
 * + barra de magnitud opcional. Reemplaza el patrón repetido
 * `<td style="...">${fmt(v)}</td>` + `diffStyle(v)` de cada control.
 *
 * @param {number|null} value
 * @param {{ max?: number, decimals?: number, eps?: number, background?: string }} [opts]
 */
export function diffCellHtml(value, { max = 0, decimals = 2, eps = 0.01, background = '' } = {}) {
  const bg = background ? `background:${background};` : '';
  if (value === null || value === undefined) {
    return `<td class="rb-magcell" style="text-align:right;${bg}">—</td>`;
  }
  const hasDiff = Math.abs(value) > eps;
  const bar = hasDiff ? magnitudeBarHtml(value, max) : '';
  return `<td class="rb-magcell ${mvClass(value, eps)}" style="text-align:right;${bg}${hasDiff ? 'font-weight:700;' : ''}">${fmtSigned(value, { decimals, eps })}${bar}</td>`;
}
