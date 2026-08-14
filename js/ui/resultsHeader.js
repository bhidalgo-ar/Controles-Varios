// resultsHeader.js — La cabecera de la pantalla de resultados (pantalla 6 del
// rediseño).
//
// Ya no hay una barra propia de veredicto: todo lo que era la
// `.results-ctx-bar` se fundió con la barra superior única de 54px. Lo que
// esta pantalla cuelga de sus slots (`setHeader`, ver js/ui/appHeader.js):
//
//   volver · ● Cliente · Período · línea de veredicto      "Detalles del run" · ⬇ Exportar ▾
//
// Abajo de la barra queda una zona fija propia con las solapas
// Resumen / Detalle y, a la derecha, cuándo se ejecutó el run y en qué estado
// quedó (`renderResultsTabs`).
//
// Usada por controlsResults.js (run guardado) y controlsWizard.js (run rápido
// del paso 3) — mismo componente en los dos casos (ver spec §1).
//
// El semáforo lo sigue decidiendo quien llama (`computeSemaforoStatus`): acá
// sólo se pinta el color que ese tier ya definió. Ver D-057.

import { setHeader } from './appHeader.js';
import { renderExportMenu } from './exportMenu.js';

const TIER_DOT = { error: 'error', warn: 'warn', ok: 'ok', info: 'neutral' };

/**
 * Llena la barra superior con el contexto y las acciones de la pantalla de
 * resultados. No renderiza nada fuera del header.
 *
 * @param {object} opts
 * @param {'ok'|'warn'|'error'|'info'} [opts.tier]
 * @param {string} opts.cliente - nombre del cliente
 * @param {string} opts.periodo - período ya formateado ("Agosto 2026")
 * @param {string} opts.verdictLine - el veredicto en una línea
 * @param {{label: string, href?: string, onClick?: () => void}} [opts.back]
 * @param {object} [opts.run] - ver renderRunPopover
 * @param {object[]} [opts.exportItems] - ítems del menú "⬇ Exportar ▾" (ver exportMenu.js)
 * @param {string} [opts.exportNote] - recordatorio bajo el menú (privacidad)
 * @param {(el: HTMLElement) => void} [opts.mountHelp] - monta el "?" de ayuda del contexto
 */
export function mountResultsHeader({
  tier = 'info', cliente, periodo, verdictLine, back, run,
  exportItems, exportNote, mountHelp,
} = {}) {
  setHeader({
    back,
    context: buildContextNode({ tier, cliente, periodo, verdictLine, mountHelp }),
    tools: run ? buildRunDetailsNode(run) : null,
    primary: exportItems?.length ? buildExportNode(exportItems, exportNote) : null,
  });
}

/**
 * La zona fija con las solapas Resumen / Detalle. El contenido de cada solapa
 * lo renderiza la pantalla en su propio contenedor (queda en el área que
 * scrollea): acá sólo se muestran y se ocultan.
 *
 * @param {HTMLElement} container - se reemplaza su contenido
 * @param {object} opts
 * @param {{id: string, label: string, panel: HTMLElement}[]} opts.tabs
 * @param {string} [opts.activeId] - default: la primera
 * @param {string} [opts.meta] - texto de la derecha ("Ejecutado el … · Borrador")
 * @param {(id: string) => void} [opts.onChange]
 * @returns {{ setActive(id: string): void, setMeta(text: string): void }}
 */
export function renderResultsTabs(container, { tabs = [], activeId, meta, onChange = () => {} } = {}) {
  let active = tabs.some(t => t.id === activeId) ? activeId : tabs[0]?.id;

  container.className = 'results-tabsbar';
  container.innerHTML = `
    <div class="results-tabsbar__list" role="tablist" aria-label="Vistas del resultado">
      ${tabs.map(t => `
        <button type="button" class="results-tab" role="tab"
          data-tab="${esc(t.id)}" aria-selected="false" tabindex="-1">${esc(t.label)}</button>
      `).join('')}
    </div>
    <span class="results-tabsbar__meta"></span>
  `;

  const btns = new Map(
    tabs.map(t => [t.id, container.querySelector(`[data-tab="${CSS.escape(t.id)}"]`)]),
  );
  const metaEl = container.querySelector('.results-tabsbar__meta');

  function paint() {
    for (const t of tabs) {
      const isActive = t.id === active;
      const btn = btns.get(t.id);
      btn.classList.toggle('results-tab--active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      btn.tabIndex = isActive ? 0 : -1;
      if (t.panel) t.panel.hidden = !isActive;
    }
  }

  function setActive(id) {
    if (!btns.has(id) || id === active) return;
    active = id;
    paint();
    onChange(id);
  }

  for (const t of tabs) btns.get(t.id).addEventListener('click', () => setActive(t.id));

  container.querySelector('.results-tabsbar__list').addEventListener('keydown', (e) => {
    const ids = tabs.map(t => t.id);
    const idx = ids.indexOf(active);
    let next = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % ids.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    if (next === null) return;
    e.preventDefault();
    setActive(ids[next]);
    btns.get(ids[next]).focus();
  });

  const setMeta = (text) => { metaEl.textContent = text || ''; };
  setMeta(meta);
  paint();

  return { setActive, setMeta };
}

// ── Piezas que van a los slots de la barra ──────────────────────────────────

function buildContextNode({ tier, cliente, periodo, verdictLine, mountHelp }) {
  const el = document.createElement('div');
  el.className = 'results-header-ctx';
  const dotTone = TIER_DOT[tier] || 'neutral';
  // Pulso suave sólo en verde: en amarillo o rojo lo que importa es el número,
  // no el movimiento (README del rediseño, §Interacciones).
  const pulse = tier === 'ok' ? ' status-dot--pulse' : '';
  el.innerHTML = `
    <span class="status-dot status-dot--${dotTone}${pulse}" aria-hidden="true"></span>
    <span class="app-header__client" title="${esc(cliente)}">${esc(cliente)}</span>
    ${periodo ? `<span class="app-header__meta">· ${esc(periodo)}</span>` : ''}
    ${verdictLine ? `<span class="results-header-ctx__verdict results-header-ctx__verdict--${esc(tier)}">${esc(verdictLine)}</span>` : ''}
    <span class="results-header-ctx__help"></span>
  `;
  if (mountHelp) mountHelp(el.querySelector('.results-header-ctx__help'));
  return el;
}

function buildExportNode(items, note) {
  const el = document.createElement('div');
  renderExportMenu(el, { items, note });
  return el;
}

function buildRunDetailsNode(run) {
  const el = document.createElement('details');
  el.className = 'run-details';
  el.innerHTML = `
    <summary class="btn btn--ghost btn--sm">Detalles del run</summary>
    <div class="run-details__popover"></div>
  `;
  renderRunPopover(el.querySelector('.run-details__popover'), run);
  return el;
}

/**
 * @param {object} run
 * @param {string} [run.createdAtLabel]
 * @param {string} [run.periodNote]
 * @param {boolean} run.isQuickRun
 * @param {boolean} [run.isDefinitive]
 * @param {string[]} [run.warnings] - los avisos que quedaron registrados al
 *   ejecutar (ver js/ui/runWarnings.js). Un run guardado antes de que el campo
 *   existiera no los trae: la sección sale vacía, no rota.
 * @param {() => void} [run.onToggleDefinitive] - sólo si !isQuickRun
 * @param {() => void} [run.onReconfigure]
 * @param {() => void} [run.onRerun]
 */
function renderRunPopover(el, run) {
  if (!el) return;
  const { isQuickRun, isDefinitive, createdAtLabel, periodNote } = run;
  const statusTone = isQuickRun ? 'quick' : isDefinitive ? 'def' : 'draft';
  const statusHtml = isQuickRun
    ? `<strong>⚡ Ejecución rápida</strong> — este run no se guardó. Si cerrás la página se pierde.`
    : isDefinitive
      ? `<strong>✅ Definitivo</strong> — este run aparece en el checklist mensual.`
      : `<strong>📝 Borrador</strong> — no aparece en el checklist hasta que lo marques como definitivo.`;

  el.innerHTML = `
    <div class="results-popover__label">Detalles del run</div>
    ${(createdAtLabel || periodNote) ? `
      <div class="results-popover__meta">
        ${createdAtLabel ? `<div>Ejecutado el ${esc(createdAtLabel)}</div>` : ''}
        ${periodNote ? `<div>${esc(periodNote)}</div>` : ''}
      </div>
    ` : ''}
    <div class="results-popover__status results-popover__status--${statusTone}">${statusHtml}</div>
    ${runWarningsHtml(run.warnings)}
    <div class="results-popover__actions">
      ${!isQuickRun && run.onToggleDefinitive ? `
        <button type="button" class="btn btn--ghost btn--sm" data-run-toggle-def>
          ${isDefinitive ? '↩ Volver a borrador' : '📌 Marcar como definitivo'}
        </button>
      ` : ''}
      ${run.onReconfigure ? `<button type="button" class="btn btn--ghost btn--sm" data-run-reconfigure>← Reconfigurar</button>` : ''}
      ${run.onRerun ? `<button type="button" class="btn btn--secondary btn--sm" data-run-rerun>↺ Ejecutar de nuevo</button>` : ''}
    </div>
  `;

  el.querySelector('[data-run-toggle-def]')?.addEventListener('click', run.onToggleDefinitive);
  el.querySelector('[data-run-reconfigure]')?.addEventListener('click', run.onReconfigure);
  el.querySelector('[data-run-rerun]')?.addEventListener('click', run.onRerun);
}

/**
 * "N avisos de esta corrida" — los avisos de "avisa, no traba" (D-036) que el
 * analista pasó por alto en el Paso 2 y que quedaron guardados con el run.
 *
 * Sin avisos NO se omite la sección: "esta corrida no tuvo avisos" es un dato,
 * y un espacio en blanco se lee igual que "todavía no lo miré". Los runs
 * viejos, que no tienen el campo, caen en la misma línea.
 */
function runWarningsHtml(warnings) {
  const items = Array.isArray(warnings) ? warnings.filter(Boolean) : [];
  if (items.length === 0) {
    return `<div class="run-warnings run-warnings--empty">Sin avisos en esta corrida.</div>`;
  }
  return `
    <div class="run-warnings">
      <div class="run-warnings__label">${items.length} aviso${items.length === 1 ? '' : 's'} de esta corrida</div>
      <ul class="run-warnings__list">
        ${items.map(w => `<li>⚠ ${esc(w)}</li>`).join('')}
      </ul>
    </div>
  `;
}

/** "Ejecutado el 13/08/2026 14:02 · Borrador" — el meta de la barra de solapas. */
export function runMetaLabel({ createdAtLabel, isQuickRun, isDefinitive }) {
  const estado = isQuickRun ? '⚡ Ejecución rápida' : isDefinitive ? 'Definitivo' : 'Borrador';
  return createdAtLabel ? `Ejecutado el ${createdAtLabel} · ${estado}` : estado;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
