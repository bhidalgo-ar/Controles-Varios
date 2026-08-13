// resultsHeader.js — Cabecera compartida de la pantalla de resultados (1C).
//
// Con la barra superior única (54px) el "volver" y el "Cliente · Período" con
// su semáforo se mudaron a los slots de esa barra (setHeader), y acá queda la
// barra de veredicto: la línea de resumen y el popover "Detalles del run"
// (fecha, banner Ejecución rápida/Borrador/Definitivo, Reconfigurar, Ejecutar
// de nuevo). Las dos son zonas fijas: la que scrollea es la de abajo.
//
// Usada por controlsResults.js (run guardado) y controlsWizard.js (run rápido
// del paso 3) — mismo componente en los dos casos (ver spec §1).

import { setHeader } from './appHeader.js';

const TIER_DOT = { error: 'error', warn: 'warn', ok: 'ok', info: 'neutral' };

/**
 * @param {HTMLElement} container - se reemplaza su contenido
 * @param {object} opts
 * @param {'ok'|'warn'|'error'|'info'} [opts.tier]
 * @param {string} opts.cliente - nombre del cliente (va a la barra superior)
 * @param {string} opts.periodo - período ya formateado ("Agosto 2026")
 * @param {string} opts.verdictLine
 * @param {{label: string, href?: string, onClick?: () => void}} [opts.back]
 * @param {object} [opts.run] - ver renderRunPopover
 */
export function renderResultsContextBar(container, { tier = 'info', cliente, periodo, verdictLine, back, run } = {}) {
  // Volver y "Cliente · Período" (con el dot del semáforo) van a la barra
  // superior; el semáforo lo sigue decidiendo quien llama, acá sólo se pinta.
  setHeader({
    back,
    context: { name: cliente, meta: periodo, tone: TIER_DOT[tier] || 'neutral' },
  });

  container.className = 'results-ctx-bar';
  container.innerHTML = `
    ${verdictLine ? `<span class="results-ctx-bar__verdict">${esc(verdictLine)}</span>` : ''}
    <span class="results-ctx-bar__help"></span>
    <span class="results-ctx-bar__spacer"></span>
    ${run ? `
      <details class="results-ctx-bar__details">
        <summary class="btn btn--ghost btn--sm">Detalles del run</summary>
        <div class="results-ctx-bar__popover" id="js-run-popover"></div>
      </details>
    ` : ''}
  `;

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
