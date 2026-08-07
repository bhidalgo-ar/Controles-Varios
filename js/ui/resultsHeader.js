// resultsHeader.js — Cabecera compartida de la pantalla de resultados (1C).
//
// Reemplaza el stack viejo (app-header 68px + page-actions + wizard-steps +
// card-header + banner de estado) por dos barras sticky de 88px en total:
//   1. app-header comprimido a 44px (misma barra global de siempre, sólo con
//      la clase `.app-header--compact` — ver setCompactHeader).
//   2. esta barra de contexto (~46px): volver, status-dot + cliente·período +
//      una línea de veredicto, y el popover "Detalles del run" (fecha, banner
//      Ejecución rápida/Borrador/Definitivo, Reconfigurar, Ejecutar de nuevo).
//
// Usada por controlsResults.js (run guardado) y controlsWizard.js (run rápido
// del paso 3) — mismo componente en los dos casos (ver spec §1).

const TIER_DOT = { error: 'error', warn: 'warn', ok: 'ok', info: 'neutral' };

/** Comprime/restaura el app-header global (68px → 44px). Ver css/base.css. */
export function setCompactHeader(active) {
  document.querySelector('.app-header')?.classList.toggle('app-header--compact', Boolean(active));
}

/**
 * @param {HTMLElement} container - se reemplaza su contenido
 * @param {object} opts
 * @param {'ok'|'warn'|'error'|'info'} [opts.tier]
 * @param {string} opts.clientePeriodo
 * @param {string} opts.verdictLine
 * @param {{label: string, href?: string, onClick?: () => void}} [opts.back]
 * @param {object} [opts.run] - ver renderRunPopover
 */
export function renderResultsContextBar(container, { tier = 'info', clientePeriodo, verdictLine, back, run } = {}) {
  setCompactHeader(true);

  container.className = 'results-ctx-bar';
  container.innerHTML = `
    <span class="results-ctx-bar__back"></span>
    <span class="status-dot status-dot--${TIER_DOT[tier] || 'neutral'}" aria-hidden="true"></span>
    <strong class="results-ctx-bar__name">${esc(clientePeriodo)}</strong>
    ${verdictLine ? `<span class="results-ctx-bar__verdict">${esc(verdictLine)}</span>` : ''}
    <span class="results-ctx-bar__spacer"></span>
    ${run ? `
      <details class="results-ctx-bar__details">
        <summary class="btn btn--ghost btn--sm">Detalles del run</summary>
        <div class="results-ctx-bar__popover" id="js-run-popover"></div>
      </details>
    ` : ''}
  `;

  const backSlot = container.querySelector('.results-ctx-bar__back');
  if (back) {
    if (back.href) {
      backSlot.innerHTML = `<a href="${esc(back.href)}" class="btn btn--ghost btn--sm">${esc(back.label)}</a>`;
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost btn--sm';
      btn.textContent = back.label;
      btn.addEventListener('click', back.onClick);
      backSlot.appendChild(btn);
    }
  }

  if (run) renderRunPopover(container.querySelector('#js-run-popover'), run);
}

/**
 * @param {object} run
 * @param {string} [run.createdAtLabel]
 * @param {string} [run.periodNote]
 * @param {boolean} run.isQuickRun
 * @param {boolean} [run.isDefinitive]
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

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
