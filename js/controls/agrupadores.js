// agrupadores.js — Control "Cruce por Agrupadores": Nómina Maestra vs Resumen
//
// Reimplementa como control del CONTROL_REGISTRY (T9 de PLAN_v2.md, D-008) el
// cruce que antes vivía en su propio wizard (`#/wizard/:clientId`, retirado).
// Reusa runMatching() (matching.js) y computeInsights() (insights.js) tal
// cual — sólo cambia dónde se invocan y dónde se guarda el resultado.
//
// A diferencia de los otros controles, no usa el Tabulado (`tabRequired: false`)
// sino la Nómina Maestra como primaryRows y un Resumen (Largo o Tabulado
// Horizontal — el que suba el analista) como segunda planilla, inyectada por
// el loop genérico de controlsWizard.js vía `mapping.resumenLargoRows` /
// `mapping.resumenTabuladoRows`. La selección de agrupadores y los umbrales
// no vienen de un archivo, así que controlsWizard.js los agrega a `mapping`
// con un caso puntual (mismo patrón que usa para `rvaConfig`).

import { runMatching } from '../matching.js';
import { computeInsights } from '../insights.js';
import { formatAmount, formatDiff, formatPct } from '../utils/currency.js';

export const DEFAULT_AGRUPADORES_CONFIG = {
  selectedGrouperIds: null, // null = "todos los agrupadores del cliente"
  thresholds: { absoluteAmount: 1, percentage: 0.1, flagMissing: true },
};

/**
 * @param {object[]} nominaRows - parsedRows de la Nómina Maestra (additionalFiles[0])
 * @param {object[]} _tabRows   - sin uso (el control no depende del Tabulado)
 * @param {object}   mapping    - trae resumenLargoRows/resumenTabuladoRows (inyectados
 *                                automáticamente por additionalFile) y grouperDefs/
 *                                grouperConceptsMap/agrupadoresConfig (inyectados por
 *                                el caso puntual de controlsWizard.js)
 */
export function runAgrupadores(nominaRows, _tabRows, mapping) {
  const resumenRows = mapping.resumenLargoRows?.length
    ? mapping.resumenLargoRows
    : (mapping.resumenTabuladoRows || []);
  const grouperDefs        = mapping.grouperDefs || [];
  const grouperConceptsMap = mapping.grouperConceptsMap || {};
  const thresholds = mapping.agrupadoresConfig?.thresholds || DEFAULT_AGRUPADORES_CONFIG.thresholds;

  if (!nominaRows?.length) return { error: 'No hay datos de la Nómina Maestra.' };
  if (!resumenRows.length) return { error: 'No hay datos del Resumen — cargá el formato Largo o el Tabulado Horizontal.' };
  if (!grouperDefs.length) return { error: 'No hay agrupadores seleccionados. Elegí al menos uno en "Agrupadores y umbrales".' };

  const resultsPorGrupo = runMatching(nominaRows, resumenRows, grouperConceptsMap, thresholds);
  const insights = computeInsights(resultsPorGrupo, grouperDefs, nominaRows, resumenRows);

  return { resultsPorGrupo, grouperDefs, ...insights };
}

export function summarizeAgrupadores(results) {
  if (results?.error) {
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null, diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const { byGrouper, missingInResumen, missingInNomina, topDifferences } = results;
  const unitsTotal      = byGrouper.reduce((s, g) => s + g.rowsTotal, 0);
  const unitsWithDiff   = byGrouper.reduce((s, g) => s + g.rowsWithDiff, 0);
  const diffTotalAmount = topDifferences.reduce((s, r) => s + Math.abs(r.diffAbs), 0);
  const worst           = topDifferences[0];
  const worstCase       = worst ? { label: `${worst.grouperName} — leg. ${worst.legajo}`, amount: worst.diffAbs } : null;
  const missingCount     = missingInResumen.length + missingInNomina.length;

  return {
    status: (unitsWithDiff > 0 || missingCount > 0) ? 'warning' : 'success',
    headline: `${byGrouper.length} agrupador${byGrouper.length === 1 ? '' : 'es'} · ${unitsTotal} legajo(s) evaluados`
      + (missingCount > 0 ? ` · ${missingCount} legajo(s) faltantes en alguno de los dos archivos` : ''),
    insights: byGrouper.map(g => ({
      type:  g.rowsWithDiff > 0 ? 'warning' : 'success',
      label: `diferencias en ${g.grouperName}`,
      value: g.rowsWithDiff,
    })),
    unit: 'legajo',
    unitsTotal,
    unitsWithDiff,
    diffTotalAmount,
    worstCase,
    contextNote: null,
  };
}

export function renderAgrupadoresResults(results, container) {
  if (results?.error) {
    container.innerHTML = `<div class="alert alert--danger" style="margin:0;">❌ ${esc(results.error)}</div>`;
    return;
  }

  const { byGrouper, missingInResumen, missingInNomina, topDifferences, resultsPorGrupo, grouperDefs } = results;

  container.innerHTML = `
    <div class="card" style="margin-bottom:var(--sp-5);">
      <div class="card__header"><h3 style="margin:0;">Totales por agrupador</h3></div>
      <div class="card__body" style="padding:0;overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Agrupador</th>
              <th style="text-align:right;">Total Nómina</th>
              <th style="text-align:right;">Total Resumen</th>
              <th style="text-align:right;">Diferencia $</th>
              <th style="text-align:right;">Diferencia %</th>
              <th style="text-align:center;">Filas c/diff</th>
            </tr>
          </thead>
          <tbody>
            ${byGrouper.map(g => `
              <tr class="${g.rowsWithDiff > 0 ? 'row--diff' : ''}">
                <td><strong>${esc(g.grouperName)}</strong></td>
                <td style="text-align:right;font-family:monospace;">$ ${formatAmount(g.totalNomina)}</td>
                <td style="text-align:right;font-family:monospace;">$ ${formatAmount(g.totalResumen)}</td>
                <td style="text-align:right;font-family:monospace;">${formatDiff(g.diffAbsolute)}</td>
                <td style="text-align:right;">${formatPct(g.diffPercentage)}</td>
                <td style="text-align:center;">
                  ${g.rowsWithDiff > 0
                    ? `<span class="badge badge--warning">${g.rowsWithDiff} / ${g.rowsTotal}</span>`
                    : `<span class="badge badge--success">0 / ${g.rowsTotal}</span>`}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    ${(missingInResumen.length || missingInNomina.length) ? `
      <div class="card" style="margin-bottom:var(--sp-5);">
        <div class="card__header"><h3 style="margin:0;">Legajos faltantes</h3></div>
        <div class="card__body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-6);">
            <div>
              <p class="font-semibold" style="margin-bottom:var(--sp-3);">En Nómina pero NO en Resumen (${missingInResumen.length})</p>
              ${missingInResumen.length
                ? `<div class="pill-group">${missingInResumen.map(l => `<span class="badge badge--warning">${esc(l)}</span>`).join('')}</div>`
                : `<p class="text-muted text-sm">Ninguno</p>`}
            </div>
            <div>
              <p class="font-semibold" style="margin-bottom:var(--sp-3);">En Resumen pero NO en Nómina (${missingInNomina.length})</p>
              ${missingInNomina.length
                ? `<div class="pill-group">${missingInNomina.map(l => `<span class="badge badge--danger">${esc(l)}</span>`).join('')}</div>`
                : `<p class="text-muted text-sm">Ninguno</p>`}
            </div>
          </div>
        </div>
      </div>
    ` : ''}

    ${topDifferences.length ? `
      <div class="card" style="margin-bottom:var(--sp-5);">
        <div class="card__header"><h3 style="margin:0;">Top ${topDifferences.length} diferencias más grandes</h3></div>
        <div class="card__body" style="padding:0;overflow-x:auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Legajo</th>
                <th>Apellido y Nombre</th>
                <th>Agrupador</th>
                <th style="text-align:right;">Nómina</th>
                <th style="text-align:right;">Resumen</th>
                <th style="text-align:right;">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              ${topDifferences.map(r => `
                <tr class="row--diff">
                  <td><code>${esc(r.legajo)}</code></td>
                  <td>${esc([r.apellido, r.nombre].filter(Boolean).join(', ') || '—')}</td>
                  <td><span class="badge badge--primary">${esc(r.grouperName || '')}</span></td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumNom)}</td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumRes)}</td>
                  <td style="text-align:right;font-family:monospace;">${formatDiff(r.diffAbs)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <h3 style="margin-bottom:var(--sp-4);">Detalle completo por agrupador</h3>
    ${(grouperDefs || []).map(g => renderGrouperDetail(g, resultsPorGrupo?.[g.id] || [])).join('')}
  `;
}

function renderGrouperDetail(grouper, rows) {
  const rowsWithDiff = rows.filter(r => r.tieneDiff);
  const rowsOk       = rows.filter(r => !r.tieneDiff);

  const SHOW_MAX = 100;
  const rowsToShow = rowsWithDiff.slice(0, SHOW_MAX);
  const extraDiffs = rowsWithDiff.length - rowsToShow.length;

  return `
    <div class="card" style="margin-bottom:var(--sp-4);">
      <div class="card__header">
        <h4 style="margin:0;">${esc(grouper.name)}</h4>
        <div style="display:flex;gap:var(--sp-2);">
          ${rowsWithDiff.length
            ? `<span class="badge badge--warning">${rowsWithDiff.length} con diferencia</span>`
            : `<span class="badge badge--success">Sin diferencias</span>`}
          <span class="badge badge--neutral">${rowsOk.length} OK</span>
        </div>
      </div>
      ${rows.length === 0 ? `<div class="card__body"><p class="text-muted">No hay datos para este agrupador.</p></div>` : `
        <div class="card__body" style="padding:0;overflow-x:auto;">
          <table class="data-table data-table--compact">
            <thead>
              <tr>
                <th>Legajo</th>
                <th>Apellido / Nombre</th>
                <th style="text-align:right;">Nómina</th>
                <th style="text-align:right;">Resumen</th>
                <th style="text-align:right;">Diferencia $</th>
                <th style="text-align:right;">Diferencia %</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${rowsToShow.map(r => `
                <tr class="row--diff">
                  <td><code>${esc(r.legajo)}</code></td>
                  <td>${esc([r.apellido, r.nombre].filter(Boolean).join(', ') || '—')}</td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumNom)}</td>
                  <td style="text-align:right;font-family:monospace;">$ ${formatAmount(r.sumRes)}</td>
                  <td style="text-align:right;font-family:monospace;">${formatDiff(r.diffAbs)}</td>
                  <td style="text-align:right;">${r.diffPct !== null ? formatPct(r.diffPct) : '—'}</td>
                  <td>
                    ${r.soloEnNomina  ? '<span class="badge badge--warning">Solo en nómina</span>'  : ''}
                    ${r.soloEnResumen ? '<span class="badge badge--danger">Solo en resumen</span>'   : ''}
                    ${!r.soloEnNomina && !r.soloEnResumen ? '<span class="badge badge--warning">Diferencia</span>' : ''}
                  </td>
                </tr>
              `).join('')}
              ${extraDiffs > 0 ? `
                <tr><td colspan="7" class="text-center text-muted text-sm" style="padding:var(--sp-3);">
                  ... y ${extraDiffs} fila(s) más con diferencia (limitado a ${SHOW_MAX} por rendimiento)
                </td></tr>
              ` : ''}
              ${rowsOk.length > 0 ? `
                <tr><td colspan="7" style="padding:var(--sp-2) var(--sp-4);background:var(--color-success-bg);">
                  <span class="text-sm text-success">✅ ${rowsOk.length} legajo(s) sin diferencias</span>
                </td></tr>
              ` : ''}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// ── Editor inline de "Agrupadores y umbrales" ────────────────────────────────
// Se monta en el paso Archivos de controlsWizard.js cuando el control está
// seleccionado (mismo patrón que renderRendVsAsientoConfigEditor).

export function renderAgrupadoresConfigEditor(container, opts = {}) {
  const {
    config = DEFAULT_AGRUPADORES_CONFIG,
    groupers = [],
    clientId,
    openByDefault = true,
    onChange = () => {},
  } = opts;

  const current = {
    selectedGrouperIds: config.selectedGrouperIds
      ? config.selectedGrouperIds.filter(id => groupers.some(g => g.id === id))
      : groupers.map(g => g.id),
    thresholds: { ...DEFAULT_AGRUPADORES_CONFIG.thresholds, ...(config.thresholds || {}) },
  };

  const noGroupers = groupers.length === 0;

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Agrupadores y umbrales
    </summary>
    <div style="margin-top:var(--sp-3);">
      ${noGroupers ? `
        <div class="alert alert--warning" style="margin:0 0 var(--sp-3);">
          ⚠️ Este cliente no tiene agrupadores configurados.
          <a href="#/client/${clientId}/groupers">Configurar ahora</a>
        </div>
      ` : `
        <p class="text-sm text-muted" style="margin:0 0 var(--sp-2);">Elegí qué agrupadores incluir en el cruce.</p>
        <div class="pill-group" id="js-agrup-pills" style="margin-bottom:var(--sp-4);">
          ${groupers.map(g => `
            <button type="button" class="pill ${current.selectedGrouperIds.includes(g.id) ? 'pill--active' : ''}"
                    data-grouper-id="${g.id}">${esc(g.name)}</button>
          `).join('')}
        </div>
      `}
      <div style="display:grid;grid-template-columns:auto auto;gap:var(--sp-3) var(--sp-6);align-items:center;max-width:400px;">
        <label class="text-sm">Diferencia en pesos mayor a</label>
        <div style="display:flex;align-items:center;gap:var(--sp-2);">
          <input type="number" class="form-input" id="js-agrup-threshold-abs" min="0" step="1"
                 value="${current.thresholds.absoluteAmount}" style="width:100px;"> <span class="text-sm">$</span>
        </div>
        <label class="text-sm">Diferencia porcentual mayor a</label>
        <div style="display:flex;align-items:center;gap:var(--sp-2);">
          <input type="number" class="form-input" id="js-agrup-threshold-pct" min="0" step="0.01"
                 value="${current.thresholds.percentage}" style="width:100px;"> <span class="text-sm">%</span>
        </div>
        <label class="text-sm">Marcar legajos que faltan</label>
        <input type="checkbox" id="js-agrup-flag-missing" ${current.thresholds.flagMissing ? 'checked' : ''}>
      </div>
    </div>
  `;

  editor.querySelectorAll('[data-grouper-id]').forEach(pill => {
    pill.addEventListener('click', () => {
      const id  = Number(pill.dataset.grouperId);
      const idx = current.selectedGrouperIds.indexOf(id);
      if (idx >= 0) current.selectedGrouperIds.splice(idx, 1);
      else          current.selectedGrouperIds.push(id);
      pill.classList.toggle('pill--active', current.selectedGrouperIds.includes(id));
      onChange({ ...current, selectedGrouperIds: [...current.selectedGrouperIds] });
    });
  });
  editor.querySelector('#js-agrup-threshold-abs').addEventListener('change', (e) => {
    current.thresholds.absoluteAmount = parseFloat(e.target.value) || 0;
    onChange({ ...current });
  });
  editor.querySelector('#js-agrup-threshold-pct').addEventListener('change', (e) => {
    current.thresholds.percentage = parseFloat(e.target.value) || 0;
    onChange({ ...current });
  });
  editor.querySelector('#js-agrup-flag-missing').addEventListener('change', (e) => {
    current.thresholds.flagMissing = e.target.checked;
    onChange({ ...current });
  });

  container.appendChild(editor);
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
