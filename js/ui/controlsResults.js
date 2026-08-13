// controlsResults.js — Pantalla de resultados de un control run
//
// Arriba: un hero-veredicto (gauge + badge + KPIs + lista de controles
// ordenada errores-primero) que responde "¿está bien?" de un vistazo.
// Abajo: las tarjetas de detalle existentes, una por control, colapsadas.

import { getControlRun, updateControlRun, getClientByCode, getControlRunResults, getControlRunFiles, getControlRuns, getConfig } from '../db.js';
import { CONTROL_REGISTRY } from '../controls/registry.js';
import { computeSemaforoStatus, DEFAULT_SEMAFORO_THRESHOLD_PCT } from '../controls/semaforo.js';
import { periodToLabel }    from '../utils/dates.js';
import { formatAmount }     from '../utils/currency.js';
import { showToast }        from './toast.js';
import { renderHelpPopover, CONTROL_HELP } from './helpPopover.js';
import { renderResultsContextBar } from './resultsHeader.js';
import { columnValues, checkColumnType } from './columnHints.js';
import { typeOfKey } from '../exports/contracts.js';
import { fileTypeLabel } from './fileTypes.js';

const TIER_RANK = { error: 0, warn: 1, ok: 2, info: 3 };
const TIER_DOT  = { error: 'error', warn: 'warn', ok: 'ok', info: 'neutral' };

export async function renderControlsResults(root, runId) {
  const run = await getControlRun(Number(runId));
  if (!run) {
    root.innerHTML = `
      <div class="page-content">
        <div class="alert alert--danger">
          No se encontró el control #${Number(runId)}. <a href="#/">← Inicio</a>
        </div>
      </div>
    `;
    return;
  }

  const [client, resultsRows, runFiles, thresholdPctCfg] = await Promise.all([
    getClientByCode(run.clientCode),
    getControlRunResults(runId),
    getControlRunFiles(runId),
    getConfig('semaforoThresholdPct'),
  ]);
  const thresholdPct = thresholdPctCfg ?? DEFAULT_SEMAFORO_THRESHOLD_PCT;

  const periodLabel = periodToLabel(run.period);
  const createdAt   = run.createdAt
    ? new Date(run.createdAt).toLocaleString('es-AR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '';
  const clientePeriodo = `${client?.name ?? 'Cliente'} · ${periodLabel}`;
  const backTarget = { label: '← Volver a los controles', href: `#/controls/${client?.id ?? ''}` };

  root.innerHTML = `
    <div id="js-results-ctx-bar"></div>
    <div class="page-content">
      <div id="js-hero"></div>
      <div id="js-column-warnings"></div>
      <div id="js-control-sections"></div>
    </div>
  `;

  const ctxBarEl   = root.querySelector('#js-results-ctx-bar');
  const heroEl     = root.querySelector('#js-hero');
  const warningsEl = root.querySelector('#js-column-warnings');
  const sectionsEl = root.querySelector('#js-control-sections');

  // Cabecera 1C: barra de contexto sticky (ver js/ui/resultsHeader.js) — el
  // toggle Borrador/Definitivo re-renderiza sólo esta barra, no la pantalla.
  let isDefinitive = run.isDefinitive === true;
  function mountCtxBar(tier, verdictLine) {
    renderResultsContextBar(ctxBarEl, {
      tier, clientePeriodo, verdictLine, back: backTarget,
      run: {
        createdAtLabel: createdAt,
        periodNote: run.notes || null,
        isQuickRun: false,
        isDefinitive,
        onToggleDefinitive: async () => {
          const newValue = !isDefinitive;
          try {
            await updateControlRun(run.id, { isDefinitive: newValue });
            isDefinitive = newValue;
            mountCtxBar(tier, verdictLine);
            showToast(newValue ? '✅ Marcado como definitivo' : '↩ Vuelto a borrador', 'success');
          } catch (err) {
            showToast(`Error: ${err.message}`, 'danger');
          }
        },
        onReconfigure: () => { window.location.hash = `#/controls/${client?.id ?? ''}`; },
        onRerun:       () => { window.location.hash = `#/controls/${client?.id ?? ''}`; },
      },
    });
    const nameEl = ctxBarEl.querySelector('.results-ctx-bar__name');
    if (nameEl) {
      const helpSlot = document.createElement('span');
      nameEl.insertAdjacentElement('afterend', helpSlot);
      renderHelpPopover(helpSlot, CONTROL_HELP);
    }
  }

  if (resultsRows.length === 0) {
    mountCtxBar('info', 'Sin resultados guardados.');
    sectionsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📭</div>
        <div class="empty-state__title">Sin resultados</div>
        <p class="empty-state__text">Este run no tiene resultados guardados.</p>
      </div>
    `;
    return;
  }

  // Un resumen por control — se calcula una sola vez y alimenta tanto el hero
  // como las tarjetas de detalle de abajo (mismo criterio de color en las dos).
  const controlSummaries = resultsRows
    .map(row => {
      const ctrl = CONTROL_REGISTRY[row.controlId];
      if (!ctrl) return null;
      const summary = ctrl.summarize
        ? ctrl.summarize(row.results)
        : { status: 'info', headline: '', insights: [] };
      const tier = summary.status === 'error'
        ? 'error'
        : summary.unitsTotal == null
          ? 'info'
          : computeSemaforoStatus(summary.unitsWithDiff, summary.unitsTotal, thresholdPct);
      return { row, ctrl, summary, tier };
    })
    .filter(Boolean)
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);

  // A4 — tier de cada control en la corrida inmediatamente anterior (mismo
  // cliente/período), para detectar mejoras (rojo→amarillo/verde) y aplicar
  // el pulso de "esto se arregló". Sin corrida previa, no hay pulso.
  const prevTierByControlId = await getPrevTierByControlId(run, thresholdPct);

  const { html: heroHtml, pctOk, overallTier, hasGauge } = buildHeroHtml(controlSummaries, runFiles, thresholdPct, prevTierByControlId);
  heroEl.innerHTML = heroHtml;
  if (hasGauge) animateHeroGauge(heroEl, pctOk, overallTier);

  warningsEl.innerHTML = buildColumnWarningsHtml(columnWarningsOf(runFiles));

  mountCtxBar(overallTier === 'info' ? 'info' : overallTier, buildContextLine(controlSummaries));

  // Una tarjeta colapsable por control (mismo orden que el hero: errores primero)
  for (const item of controlSummaries) {
    const { row, ctrl, summary, tier } = item;

    const nDiff = summary.unitsWithDiff || 0;
    const diffLabel = nDiff > 1  ? `Ver las ${fmtInt(nDiff)} diferencias`
                    : nDiff === 1 ? 'Ver la diferencia'
                    : 'Ver detalle';
    const diffLabelClosed = `${diffLabel} ▾`;
    const diffLabelOpen = nDiff > 1  ? 'Ocultar diferencias ▴'
                        : nDiff === 1 ? 'Ocultar la diferencia ▴'
                        : 'Ocultar detalle ▴';

    const card = document.createElement('div');
    card.className = `control-card control-card--tier-${tier}`;
    card.dataset.controlId = row.controlId;
    card.innerHTML = `
      <div class="control-card__summary" role="button" tabindex="0" aria-expanded="false"
           data-ctrl-toggle data-label-closed="${esc(diffLabelClosed)}" data-label-open="${esc(diffLabelOpen)}">
        <div class="control-card__row">
          <span class="status-dot status-dot--${TIER_DOT[tier]}" aria-hidden="true"></span>
          <h3 class="control-card__name">${esc(ctrl.label)}</h3>
          <span class="control-card__headline">${esc(summary.headline)}</span>
          <span class="control-card__expand">
            <span class="control-card__expand-text">${esc(diffLabelClosed)}</span>
          </span>
        </div>
        ${summary.insights?.length ? `
          <div class="control-card__insights">
            ${summary.insights.map(i => `
              <span class="badge badge--${esc(i.type)}">
                <strong style="margin-right:4px;">${esc(String(i.value))}</strong>${esc(i.label)}
              </span>
            `).join('')}
          </div>
        ` : ''}
      </div>
      <div class="ctrl-detail-grid">
        <div class="ctrl-detail-grid__inner">
          <div class="control-card__detail" id="js-ctrl-${esc(row.controlId)}"></div>
        </div>
      </div>
    `;
    sectionsEl.appendChild(card);

    const detailEl = card.querySelector(`#js-ctrl-${CSS.escape(row.controlId)}`);
    ctrl.renderResults(row.results, detailEl);

    initCtrlToggle(card);
  }

  // "Ir al detalle →" / "Detalle" del hero: abre y hace scroll a la tarjeta de abajo
  heroEl.querySelectorAll('[data-hero-detail]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.heroDetail;
      const card = sectionsEl.querySelector(`[data-control-id="${CSS.escape(id)}"]`);
      if (!card) return;
      openCtrlToggle(card);
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ── A3 — fila de diferencias expandible (grid 0fr⇄1fr, sin medir en JS) ─────

function initCtrlToggle(card) {
  const toggle = card.querySelector('[data-ctrl-toggle]');
  const grid = card.querySelector('.ctrl-detail-grid');
  if (!toggle || !grid) return;

  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    grid.classList.toggle('is-open', open);
    const textEl = toggle.querySelector('.control-card__expand-text');
    if (textEl) textEl.textContent = open ? toggle.dataset.labelOpen : toggle.dataset.labelClosed;
  };

  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    }
  });
}

function openCtrlToggle(card) {
  const toggle = card.querySelector('[data-ctrl-toggle]');
  const grid = card.querySelector('.ctrl-detail-grid');
  if (!toggle || !grid) return;
  toggle.setAttribute('aria-expanded', 'true');
  grid.classList.add('is-open');
  const textEl = toggle.querySelector('.control-card__expand-text');
  if (textEl) textEl.textContent = toggle.dataset.labelOpen;
}

// ── A4 — tier de cada control en la corrida previa (mismo cliente/período) ──

async function getPrevTierByControlId(run, thresholdPct) {
  const siblingRuns = await getControlRuns(run.clientCode);
  const samePeriod = siblingRuns
    .filter(r => r.period === run.period)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const idx = samePeriod.findIndex(r => r.id === run.id);
  if (idx <= 0) return {};
  const prevRun = samePeriod[idx - 1];

  const prevResultsRows = await getControlRunResults(prevRun.id);
  const prevTierByControlId = {};
  for (const row of prevResultsRows) {
    const ctrl = CONTROL_REGISTRY[row.controlId];
    if (!ctrl?.summarize) continue;
    const summary = ctrl.summarize(row.results);
    const tier = summary.status === 'error'
      ? 'error'
      : summary.unitsTotal == null
        ? 'info'
        : computeSemaforoStatus(summary.unitsWithDiff, summary.unitsTotal, thresholdPct);
    prevTierByControlId[row.controlId] = tier;
  }
  return prevTierByControlId;
}

// ── A2 — Gauge SVG: constantes compartidas con animateHeroGauge ─────────────
const GAUGE_R = 82;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_R;

// ── Avisos de columna de la corrida ─────────────────────────────────────────
//
// El aviso de "esta columna no trae lo que acá va" se ve al elegirla (ver
// js/ui/columnHints.js), pero si el analista lo pasa por alto y corre el control
// igual, sin esto no quedaba rastro: el que revisa después no tiene forma de
// saber que se corrió con una columna sospechosa. Decisión de Willy, 2026-08-13.
//
// **Se recalcula, no se guarda.** Cada archivo de la corrida ya tiene guardadas
// sus filas y su mapeo (`controlRunFiles`), así que el aviso sale de ahí: no hay
// una segunda copia que pueda desincronizarse del archivo con el que se corrió,
// y no cambia el esquema de la base.
//
// **Límite conocido, y no es un olvido:** las columnas que se eligen en el Paso 2
// (los 18 conceptos NR del lado Tabulado, SUELDO / A_CTA_FUT_AUMEN /
// GTOS_PERSONALES / DTO_COCHERA y las 3 de fecha) NO están en el mapeo que la
// corrida guarda — `tabExtraConfig` viaja al control pero no al registro del
// archivo. Su aviso se ve en pantalla al elegirlas; para que se repita acá hace
// falta que la corrida guarde el mapeo del Tabulado ya mergeado, que es una
// decisión sobre qué se persiste y no se toma de paso (anotado en ROADMAP.md).

/**
 * Los avisos de tipo de todas las columnas mapeadas de una corrida.
 *
 * Sólo mira las claves cuyo valor es una columna que **existe** entre los
 * encabezados de las filas guardadas: eso deja afuera, sin necesidad de saber
 * nada de cada parser, tanto las omisiones declaradas (⊘) como las claves de
 * mapeo que no son columnas (períodos, configs, filas de otro archivo).
 */
export function columnWarningsOf(runFiles) {
  const out = [];
  for (const f of (runFiles || [])) {
    const rows = f?.parsedRows;
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const encabezados = new Set(Object.keys(rows[0]));
    for (const [key, col] of Object.entries(f.mapping || {})) {
      if (typeof col !== 'string' || !encabezados.has(col)) continue;
      const aviso = checkColumnType(columnValues(rows, col), typeOfKey(f.fileType, key));
      if (aviso) out.push({ fileType: f.fileType, columna: col, mensaje: aviso.mensaje });
    }
  }
  return out;
}

function buildColumnWarningsHtml(avisos) {
  if (!avisos.length) return '';
  return `
    <div class="alert alert--warning" style="margin-bottom:var(--sp-4);">
      <div>
        <strong>Revisá el mapeo de ${avisos.length === 1 ? 'una columna' : `${avisos.length} columnas`}.</strong>
        Este control se corrió igual, pero el contenido de estas columnas no se parece a lo que ahí va:
        <ul style="margin:var(--sp-2) 0 0;padding-left:var(--sp-4);">
          ${avisos.map(a => `<li>«${esc(a.columna)}» en ${esc(fileTypeLabel(a.fileType))} — ${esc(a.mensaje)}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

// ── Hero de resultados ──────────────────────────────────────────────────────

function buildHeroHtml(controlSummaries, runFiles, thresholdPct, prevTierByControlId) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // "Legajos cruzados": tamaño del Tabulado de esta corrida si está disponible;
  // si no (ej. corrida sin Tabulado), el mayor unitsTotal entre controles por legajo.
  const tabFile = runFiles.find(f => f.fileType === 'tab_control');
  const legajoCtrls = controlSummaries.filter(c => c.summary.unit === 'legajo' && c.summary.unitsTotal != null);
  const totalLegajosCruzados = tabFile?.parseMetadata?.totalRows
    ?? legajoCtrls.reduce((max, c) => Math.max(max, c.summary.unitsTotal), 0);

  // % OK del gauge — sólo entre controles cuya unidad es "legajo" (los de CC,
  // como Rendimiento vs Tabulado/Asiento, usan otra unidad y no se mezclan acá;
  // igual entran en la lista de la derecha y en el veredicto general).
  const totalLegajoUnits    = legajoCtrls.reduce((sum, c) => sum + c.summary.unitsTotal, 0);
  const totalLegajoWithDiff = legajoCtrls.reduce((sum, c) => sum + (c.summary.unitsWithDiff || 0), 0);
  const pctOk = totalLegajoUnits > 0 ? Math.max(0, 100 - (totalLegajoWithDiff / totalLegajoUnits) * 100) : 100;

  // Controles "de verificación" (excluye los modos "Generar Reporte", que no cruzan nada)
  const checkedControls = controlSummaries.filter(c => c.tier !== 'info');
  const okCount    = checkedControls.filter(c => c.tier === 'ok').length;
  const errorCount = checkedControls.filter(c => c.tier === 'error').length;
  const warnCount  = checkedControls.filter(c => c.tier === 'warn').length;
  const totalChecked = checkedControls.length;

  const overallTier = totalChecked === 0
    ? 'info'
    : errorCount > 0 ? 'error'
    : warnCount  > 0 ? 'warn'
    : 'ok';

  const totalDiffAmount = controlSummaries.reduce((sum, c) => sum + (c.summary.diffTotalAmount || 0), 0);

  // ── Gauge SVG (A2 — arco y número animan juntos vía rAF, ver animateHeroGauge) ──
  const ringClass = overallTier === 'error' ? 'hero-gauge__ring-fill--error'
                  : overallTier === 'warn'  ? 'hero-gauge__ring-fill--warn'
                  : 'hero-gauge__ring-fill--ok';
  // Renderizamos SIEMPRE el valor final: así el gauge muestra el número correcto
  // aunque la animación no llegue a correr (pestaña en segundo plano, JS lento,
  // reduced-motion). animateHeroGauge, si puede animar, resetea a 0 y sube.
  const finalFillLen = (pctOk / 100) * GAUGE_CIRC;

  const gaugeSvg = `
    <svg width="190" height="190" viewBox="0 0 190 190">
      <circle class="hero-gauge__ring-bg" cx="95" cy="95" r="${GAUGE_R}"></circle>
      <circle class="hero-gauge__ring-fill ${ringClass}" data-gauge-fill cx="95" cy="95" r="${GAUGE_R}"
        stroke-dasharray="${finalFillLen.toFixed(1)} ${GAUGE_CIRC.toFixed(1)}"></circle>
    </svg>
  `;

  // ── Badge + subtítulo de veredicto ───────────────────────────────────────────
  const badgeCopy = {
    error: 'Revisar antes de cerrar el mes',
    warn:  'Diferencias menores — revisar',
    ok:    'Todo en orden — listo para marcar definitivo',
    info:  'Sin controles de verificación en esta corrida',
  }[overallTier];

  let subline;
  if (totalChecked === 0) {
    subline = 'Esta corrida sólo incluye controles de generación de reporte (sin cruce de diferencias).';
  } else if (overallTier === 'ok') {
    subline = `${fmtInt(totalLegajoUnits)} legajo${totalLegajoUnits === 1 ? '' : 's'} verificado${totalLegajoUnits === 1 ? '' : 's'} sin diferencias.`;
  } else {
    const bits = [];
    if (errorCount > 0) bits.push(`${errorCount} control${errorCount === 1 ? '' : 'es'} en rojo`);
    if (warnCount  > 0) bits.push(`${warnCount} control${warnCount === 1 ? '' : 'es'} en amarillo`);
    subline = `${bits.join(' y ')}.<br>${fmtInt(totalLegajoWithDiff)} legajo${totalLegajoWithDiff === 1 ? '' : 's'} con diferencia`
      + (totalDiffAmount > 0 ? ` · dif. total <strong>$ ${formatAmount(totalDiffAmount)}</strong>` : '');
  }

  // ── Corrida de un solo control: banda compacta, sin gauge ──────────────────
  // El gauge resume VARIOS controles en un número; con uno solo, ese número es
  // el del propio control y ya lo dicen la barra de contexto ("1 de 1 control
  // en verde") y la card de abajo. La columna de la derecha tampoco aporta:
  // sería una fila que repite lo que dice la card que está justo debajo.
  // Se conservan las piezas que sí agregan algo y que ya venían decididas: el
  // badge de veredicto (con la acción "listo para marcar definitivo"), su
  // subtítulo en prosa, y el KPI de legajos cruzados.
  if (controlSummaries.length === 1) {
    return {
      html: `
        <div class="hero-verdict hero-verdict--compact">
          <span class="hero-verdict__badge hero-verdict__badge--${overallTier === 'info' ? 'ok' : overallTier}">
            <span class="status-dot status-dot--${TIER_DOT[overallTier]}"></span>
            ${esc(badgeCopy)}
          </span>
          <p class="hero-verdict__subline">${subline}</p>
          <div class="hero-verdict__compact-kpi">
            <span class="hero-kpi__value">${fmtInt(totalLegajosCruzados)}</span>
            <span class="hero-kpi__label">Legajos cruzados</span>
          </div>
        </div>
      `,
      pctOk,
      overallTier,
      hasGauge: false,
    };
  }

  // ── Filas por control (errores primero — ya vienen ordenadas) ──────────────
  // A1/A4 — cascada de entrada (stagger errores-primero, capado a 6) + pulso
  // de mejora respecto de la corrida anterior (ver getPrevTierByControlId).
  const rowsHtml = controlSummaries
    .map((item, i) => buildCtrlRowHtml(item, i, prevTierByControlId, reduceMotion))
    .join('');

  const html = `
    <div class="hero-verdict">
      <div class="hero-verdict__gauge-col">
        <div class="hero-gauge">
          ${gaugeSvg}
          <div class="hero-gauge__center">
            <span class="hero-gauge__pct" data-gauge-pct>${fmtPct1(pctOk)}%</span>
            <span class="hero-gauge__label">legajos OK</span>
          </div>
        </div>
        <div style="text-align:center;">
          <span class="hero-verdict__badge hero-verdict__badge--${overallTier === 'info' ? 'ok' : overallTier}">
            <span class="status-dot status-dot--${TIER_DOT[overallTier]}"></span>
            ${esc(badgeCopy)}
          </span>
          <p class="hero-verdict__subline">${subline}</p>
        </div>
        <div class="hero-kpis">
          <div class="hero-kpi">
            <span class="hero-kpi__value">${fmtInt(totalLegajosCruzados)}</span>
            <span class="hero-kpi__label">Legajos cruzados</span>
          </div>
          <div class="hero-kpi">
            <span class="hero-kpi__value ${okCount === totalChecked && totalChecked > 0 ? 'hero-kpi__value--ok' : ''}">${okCount} / ${totalChecked}</span>
            <span class="hero-kpi__label">Controles en verde</span>
          </div>
        </div>
      </div>
      <div class="hero-verdict__list-col">
        <div class="hero-ctrl-header">
          <span class="hero-ctrl-header__label">Controles · errores primero</span>
          <span class="hero-ctrl-header__legend">verde 0% · amarillo ≤${thresholdPct}% · rojo &gt;${thresholdPct}% de legajos c/dif</span>
        </div>
        <div class="hero-ctrl-rows">
          ${rowsHtml}
        </div>
      </div>
    </div>
  `;

  return { html, pctOk, overallTier, hasGauge: true };
}

function buildCtrlRowHtml(item, index, prevTierByControlId, reduceMotion) {
  const { row, ctrl, summary, tier } = item;
  const rowClass = tier === 'error' ? 'hero-ctrl-row--error'
                 : tier === 'warn'  ? 'hero-ctrl-row--warn'
                 : tier === 'info'  ? 'hero-ctrl-row--neutral'
                 : 'hero-ctrl-row--ok';

  // A4 — ¿mejoró respecto de la corrida anterior para este cliente/período?
  const prevTier = prevTierByControlId?.[row.controlId];
  const improved = prevTier != null && TIER_RANK[tier] > TIER_RANK[prevTier];

  let animStyle = '';
  if (!reduceMotion) {
    if (improved) {
      // Re-entra con cardIn corto: refuerza "esto cambió" sin el stagger de montaje.
      animStyle = `animation: cardIn 0.4s cubic-bezier(.4,0,.2,1) both;`;
    } else {
      const delay = Math.min(index, 5) * 0.13;
      animStyle = `animation: cardIn 0.45s cubic-bezier(.4,0,.2,1) ${delay}s both;`;
    }
  }
  const dotPulseClass = improved && tier === 'ok' ? 'status-dot--pulse-ok' : '';

  let countText = '';
  let contextText;
  let linkText;

  if (tier === 'info') {
    contextText = summary.headline || 'Sin cruce de diferencias';
    linkText = 'Detalle';
  } else {
    const isCc = summary.unit === 'cc';
    const unitLabel = isCc ? 'CC' : (summary.unitsWithDiff === 1 ? 'legajo' : 'legajos');
    const hasDiff = summary.unitsWithDiff > 0;

    if (hasDiff) {
      const pct = summary.unitsTotal > 0 ? (summary.unitsWithDiff / summary.unitsTotal) * 100 : 0;
      countText = `${summary.unitsWithDiff} ${unitLabel} · ${fmtPct1(pct)}%`;
    } else {
      countText = summary.unit === 'cc'
        ? `${summary.unitsTotal}/${summary.unitsTotal} CC OK`
        : '0 diferencias';
    }

    const amountText = summary.diffTotalAmount != null && summary.diffTotalAmount > 0
      ? `$ ${formatAmount(summary.diffTotalAmount)}`
      : null;
    const note = summary.contextNote
      || (summary.worstCase ? `mayor: ${summary.worstCase.label} ($ ${formatAmount(summary.worstCase.amount)})` : null);

    contextText = hasDiff
      ? [amountText, note].filter(Boolean).join(' · ')
      : `${fmtInt(summary.unitsTotal)} ${summary.unit === 'cc' ? 'centros de costo' : 'legajos'} verificados`;

    linkText = hasDiff ? 'Ir al detalle →' : 'Detalle';
  }

  return `
    <div class="hero-ctrl-row ${rowClass}" style="${animStyle}">
      <span class="status-dot status-dot--${TIER_DOT[tier]} ${dotPulseClass}"></span>
      <strong class="hero-ctrl-row__name">${esc(ctrl.label)}</strong>
      ${countText ? `<span class="hero-ctrl-row__count">${esc(countText)}</span>` : ''}
      <span class="hero-ctrl-row__context">${esc(contextText)}</span>
      <button type="button" class="hero-ctrl-row__link" data-hero-detail="${esc(row.controlId)}">${esc(linkText)}</button>
    </div>
  `;
}

// ── A2 — Entrada del veredicto: arco + número avanzan juntos vía rAF ────────
// El hero ya renderiza el valor final (ver buildHeroHtml). Si podemos animar,
// reseteamos a 0 y subimos hasta ese valor cuadro a cuadro. Si no (reduced-motion
// o pestaña en segundo plano, donde rAF no dispara), lo dejamos en el valor final.
function animateHeroGauge(heroEl, pctOk, overallTier) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (document.hidden) return; // rAF no corre en pestañas ocultas: dejamos el valor final ya dibujado

  const fillEl = heroEl.querySelector('[data-gauge-fill]');
  const pctEl  = heroEl.querySelector('[data-gauge-pct]');
  if (!fillEl || !pctEl) return;

  const t0 = performance.now();
  const DUR = 1400;

  function tick(now) {
    const p = Math.min(1, (now - t0) / DUR);
    const e = 1 - Math.pow(1 - p, 3); // ease-out cúbico
    const current = pctOk * e;
    fillEl.setAttribute('stroke-dasharray', `${(current / 100 * GAUGE_CIRC).toFixed(1)} ${GAUGE_CIRC.toFixed(1)}`);
    pctEl.textContent = `${fmtPct1(current)}%`;
    if (p < 1) requestAnimationFrame(tick);
  }

  // Arrancamos desde 0 (el valor final ya está en el DOM como fallback seguro).
  fillEl.setAttribute('stroke-dasharray', `0.0 ${GAUGE_CIRC.toFixed(1)}`);
  pctEl.textContent = '0,0%';
  requestAnimationFrame(tick);
}

// ── Línea de veredicto de la barra de contexto ───────────────────────────────
// Condensa lo que antes mostraba el banner Borrador/Definitivo + el resumen
// del hero en una sola oración — el hero de abajo (Opción B, sin tocar) sigue
// siendo la fuente completa del detalle.

function buildContextLine(controlSummaries) {
  const checked = controlSummaries.filter(c => c.tier !== 'info');
  if (checked.length === 0) return 'Esta corrida sólo incluye controles de generación de reporte.';

  const okCount    = checked.filter(c => c.tier === 'ok').length;
  const warnCount  = checked.filter(c => c.tier === 'warn').length;
  const errorCount = checked.filter(c => c.tier === 'error').length;

  if (errorCount === 0 && warnCount === 0) {
    return `${okCount} de ${checked.length} control${checked.length === 1 ? '' : 'es'} en verde — sin diferencias.`;
  }
  const bits = [];
  if (errorCount > 0) bits.push(`${errorCount} en rojo`);
  if (warnCount  > 0) bits.push(`${warnCount} en amarillo`);
  if (okCount    > 0) bits.push(`${okCount} en verde`);
  return `${bits.join(' · ')}.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtInt(n) {
  return Math.round(n || 0).toLocaleString('es-AR');
}

function fmtPct1(n) {
  return (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
