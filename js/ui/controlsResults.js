// controlsResults.js — Pantalla de resultados de un control run
//
// Dos solapas sobre la misma corrida:
//   Resumen — el hero de veredicto (icono de estado + título + KPIs) y una
//             tarjeta por control, errores primero. Responde "¿está bien?"
//             de un vistazo.
//   Detalle — las fichas desplegables de siempre, una por control, con la
//             tabla que arma cada control.
//
// El contexto del cliente, el veredicto en una línea y la acción primaria
// ("⬇ Exportar ▾") viven en la barra superior — ver js/ui/resultsHeader.js.
//
// El color de cada control sale de computeSemaforoStatus (js/controls/semaforo.js):
// acá se ordena y se pinta, no se decide. El orden "errores primero" es de
// presentación: no cambia ningún dato. Ver D-057.

import { getControlRun, updateControlRun, getClientByCode, getControlRunResults, getControlRunFiles, getControlRuns, getConfig } from '../db.js';
import { CONTROL_REGISTRY } from '../controls/registry.js';
import { computeSemaforoStatus, DEFAULT_SEMAFORO_THRESHOLD_PCT } from '../controls/semaforo.js';
import { countUniqueLegajos }  from '../controls/consolidate.js';
import { makeLegajoKey }       from '../utils/legajo.js';
import { periodToLabel }    from '../utils/dates.js';
import { formatAmount }     from '../utils/currency.js';
import { showToast }        from './toast.js';
import { renderHelpPopover, CONTROL_HELP } from './helpPopover.js';
import { mountResultsHeader, renderResultsTabs, runMetaLabel } from './resultsHeader.js';
import { buildRunExportItems, EXPORT_PRIVACY_NOTE } from './runExport.js';
import { columnWarningsOf } from './runWarnings.js';
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
  const backTarget = { label: '← Volver a los controles', href: `#/controls/${client?.id ?? ''}` };

  root.innerHTML = `
    <div id="js-results-tabs"></div>
    <div class="page-content">
      <div id="js-tab-resumen" class="results-column">
        <div id="js-hero"></div>
        <div id="js-column-warnings"></div>
        <div id="js-ctrl-cards" class="results-ctrl-cards"></div>
      </div>
      <div id="js-tab-detalle" hidden>
        <div id="js-control-sections"></div>
      </div>
    </div>
  `;

  const tabsEl     = root.querySelector('#js-results-tabs');
  const resumenEl  = root.querySelector('#js-tab-resumen');
  const detalleEl  = root.querySelector('#js-tab-detalle');
  const heroEl     = root.querySelector('#js-hero');
  const cardsEl    = root.querySelector('#js-ctrl-cards');
  const warningsEl = root.querySelector('#js-column-warnings');
  const sectionsEl = root.querySelector('#js-control-sections');

  // La barra superior la escribe esta pantalla entera al montar (setHeader
  // define la barra completa en cada llamada): el toggle Borrador/Definitivo
  // la vuelve a escribir, no re-renderiza el contenido.
  let isDefinitive = run.isDefinitive === true;
  let tabsCtl = null;
  function mountHeader(tier, verdictLine, exportItems) {
    mountResultsHeader({
      tier, cliente: client?.name ?? 'Cliente', periodo: periodLabel, verdictLine, back: backTarget,
      mountHelp: (el) => renderHelpPopover(el, CONTROL_HELP),
      exportItems,
      exportNote: exportItems?.length ? EXPORT_PRIVACY_NOTE : null,
      run: {
        createdAtLabel: createdAt,
        periodNote: run.notes || null,
        isQuickRun: false,
        isDefinitive,
        // Los que quedaron registrados AL EJECUTAR (aditivo 2). Un run guardado
        // antes de que el campo existiera no los trae y la sección sale vacía.
        warnings: run.warnings || [],
        onToggleDefinitive: async () => {
          const newValue = !isDefinitive;
          try {
            await updateControlRun(run.id, { isDefinitive: newValue });
            isDefinitive = newValue;
            mountHeader(tier, verdictLine, exportItems);
            tabsCtl?.setMeta(runMetaLabel({ createdAtLabel: createdAt, isQuickRun: false, isDefinitive }));
            showToast(newValue ? '✅ Marcado como definitivo' : '↩ Vuelto a borrador', 'success');
          } catch (err) {
            showToast(`Error: ${err.message}`, 'danger');
          }
        },
        onReconfigure: () => { window.location.hash = `#/controls/${client?.id ?? ''}`; },
        onRerun:       () => { window.location.hash = `#/controls/${client?.id ?? ''}`; },
      },
    });
  }

  if (resultsRows.length === 0) {
    mountHeader('info', 'Sin resultados guardados.');
    tabsEl.remove();
    resumenEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📭</div>
        <div class="empty-state__title">Sin resultados</div>
        <p class="empty-state__text">Este run no tiene resultados guardados.</p>
      </div>
    `;
    detalleEl.remove();
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

  // El modo de clave de legajo es del CLIENTE (D-038): no viaja en tab.mapping,
  // sale del registro que esta pantalla ya cargó.
  const { html: heroHtml, overallTier } =
    buildHeroHtml(controlSummaries, runFiles, thresholdPct, client?.legajoKeyMode);
  heroEl.innerHTML = heroHtml;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  cardsEl.innerHTML = buildCtrlCardsHtml(controlSummaries, prevTierByControlId, reduceMotion);

  warningsEl.innerHTML = buildColumnWarningsHtml(columnWarningsOf(runFiles));

  mountHeader(
    overallTier === 'info' ? 'info' : overallTier,
    buildContextLine(controlSummaries),
    buildRunExportItems({
      clienteName: client?.name ?? 'Cliente',
      clienteCode: client?.code ?? '',
      periodo: periodLabel,
      period: run.period,
      createdAtLabel: createdAt,
      estadoLabel: isDefinitive ? 'Definitivo' : 'Borrador',
      notes: run.notes || null,
      warnings: run.warnings || [],
      controles: controlSummaries.map(({ row, ctrl, summary, tier }) => ({
        controlId: row.controlId,
        label: ctrl.label,
        tier,
        unitLabel: summary.unit ? unitNames(summary.unit).many : null,
        unitsTotal: summary.unitsTotal ?? null,
        unitsWithDiff: summary.unitsWithDiff ?? null,
        diffTotalAmount: summary.diffTotalAmount ?? null,
        headline: summary.headline || '',
        results: row.results,
      })),
    }),
  );

  tabsCtl = renderResultsTabs(tabsEl, {
    tabs: [
      { id: 'resumen', label: 'Resumen', panel: resumenEl },
      { id: 'detalle', label: 'Detalle', panel: detalleEl },
    ],
    meta: runMetaLabel({ createdAtLabel: createdAt, isQuickRun: false, isDefinitive }),
  });

  // Una tarjeta colapsable por control (mismo orden que el resumen: errores primero)
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

  // "Ver detalle →" de una tarjeta del Resumen: cambia de solapa, abre la
  // ficha de ese control y la trae a la vista.
  cardsEl.querySelectorAll('[data-hero-detail]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.heroDetail;
      const card = sectionsEl.querySelector(`[data-control-id="${CSS.escape(id)}"]`);
      if (!card) return;
      tabsCtl.setActive('detalle');
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

// ── Avisos de columna de la corrida ─────────────────────────────────────────
//
// El aviso de "esta columna no trae lo que acá va" se ve al elegirla (ver
// js/ui/columnHints.js), pero si el analista lo pasa por alto y corre el control
// igual, sin esto no quedaba rastro: el que revisa después no tiene forma de
// saber que se corrió con una columna sospechosa. Decisión de Willy, 2026-08-13.
//
// **El cartel de esta pantalla se recalcula, no se guarda.** Cada archivo de la
// corrida ya tiene guardadas sus filas y su mapeo (`controlRunFiles`), así que el
// aviso sale de ahí: no hay una segunda copia que pueda desincronizarse del
// archivo con el que se corrió.
//
// **Lo que el recálculo no alcanza** son las columnas que se eligen en el Paso 2
// (los 18 conceptos NR del lado Tabulado, SUELDO / A_CTA_FUT_AUMEN /
// GTOS_PERSONALES / DTO_COCHERA y las 3 de fecha): NO están en el mapeo que la
// corrida guarda — `tabExtraConfig` viaja al control pero no al registro del
// archivo. Ésas ahora sí quedan registradas, pero por el otro camino: el run
// guarda sus avisos al ejecutar (`warnings`, ver js/ui/runWarnings.js) y se ven
// en "Detalles del run" y en el export.

// La función vive en `js/ui/runWarnings.js` desde que los avisos también se
// guardan con el run (aditivo 2): es el mismo criterio para el aviso que se
// recalcula acá y para el que se registra al ejecutar. Se re-exporta porque
// esta pantalla era su lugar original.
export { columnWarningsOf };

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

// ── Cómo se nombra en pantalla la unidad que verificó cada control ───────────
// `summary.unit` es el identificador interno de lo que cuentan `unitsTotal` /
// `unitsWithDiff` (ver la regla en CLAUDE.md); acá vive su nombre para el
// analista. Si sumás un control con una unidad nueva, agregala también acá:
// el resumen nombra la unidad, y nombrarla mal es peor que no nombrarla — un
// control por centro de costo mostraba "0 legajos verificados sin diferencias".
// `fem` es el género del sustantivo, para concordar "verificado/verificada".
const UNIT_NAMES = {
  legajo: { one: 'legajo',          many: 'legajos',           fem: false },
  cc:     { one: 'centro de costo', many: 'centros de costo',  fem: false },
  cuenta: { one: 'cuenta contable', many: 'cuentas contables', fem: true  },
  lista:  { one: 'listado',         many: 'listados',          fem: false },
};

// Corrida sin ninguna unidad medible (sólo modos "Generar Reporte"): no hay
// unidad que nombrar.
const UNIT_NAMES_FALLBACK = { one: 'unidad', many: 'unidades', fem: true };

function unitNames(unit) {
  if (!unit) return UNIT_NAMES_FALLBACK;
  // Unidad nueva sin etiqueta: mostramos el identificador crudo antes que
  // llamarla "legajos", que es lo que hacía este hero y era falso.
  return UNIT_NAMES[unit] || { one: String(unit), many: `${unit}s`, fem: false };
}

/** "24 centros de costo" · "1 legajo" (el nombre va escapado: entra a HTML). */
function fmtUnitCount(n, unit) {
  const names = unitNames(unit);
  return `${fmtInt(n)} ${esc(n === 1 ? names.one : names.many)}`;
}

/** Participio concordado con la unidad: "verificados" / "evaluada". */
function fmtParticipio(raiz, n, unit) {
  return `${raiz}${unitNames(unit).fem ? 'a' : 'o'}${n === 1 ? '' : 's'}`;
}

/** "23 legajos con diferencia (4,5%)" — el número que no puede mentir en verde. */
function fmtDiffCount(n, total, unit) {
  const pct = total > 0 ? (n / total) * 100 : 0;
  return `${fmtUnitCount(n, unit)} con diferencia (${fmtPct1(pct)}%)`;
}

// ── Unidades de la corrida: agrupadas, nunca sumadas entre sí ────────────────
// Un porcentaje que mezcle 100 legajos con 3 centros de costo no significa
// nada, así que el título del hero mide UNA unidad y la nombra. 'legajo' gana
// siempre que haya al menos un control por legajo (es la unidad de casi toda la
// batería y el significado que el número grande tuvo siempre); si no hay
// ninguno, gana la unidad con más controles, a igualdad la que más unidades
// verificó, y a igualdad el orden de esta lista. El resto de las unidades no
// desaparece: se enumeran en el subtítulo, cada una con su propio conteo.
const UNIT_ORDER = ['legajo', 'cc', 'cuenta', 'lista'];

const sumUnitsTotal    = ctrls => ctrls.reduce((s, c) => s + (c.summary.unitsTotal || 0), 0);
const sumUnitsWithDiff = ctrls => ctrls.reduce((s, c) => s + (c.summary.unitsWithDiff || 0), 0);

function groupSummariesByUnit(controlSummaries) {
  const byUnit = new Map();
  for (const c of controlSummaries) {
    if (!c.summary.unit || c.summary.unitsTotal == null) continue;
    const list = byUnit.get(c.summary.unit) || [];
    list.push(c);
    byUnit.set(c.summary.unit, list);
  }

  const rank = unit => {
    const i = UNIT_ORDER.indexOf(unit);
    return i < 0 ? UNIT_ORDER.length : i;
  };

  return [...byUnit.entries()]
    .map(([unit, ctrls]) => ({
      unit,
      ctrls,
      unitsTotal:    sumUnitsTotal(ctrls),
      unitsWithDiff: sumUnitsWithDiff(ctrls),
      // Cuántas unidades DISTINTAS vio la corrida, para el texto del subtítulo:
      // dos controles sobre los mismos 4 empleados son 4 legajos verificados en
      // 2 controles, no 8. El summary de cada control informa cuántas unidades
      // verificó, no cuáles, así que lo más cercano que se puede afirmar es el
      // mayor de los controles — el mismo criterio que el fallback del KPI
      // "Legajos cruzados". Si dos controles miraran empleados distintos, la
      // unión sería mayor, y no hay dato para saberlo: por eso el texto dice
      // "en N controles" y no promete una dotación.
      unitsMax: ctrls.reduce((max, c) => Math.max(max, c.summary.unitsTotal || 0), 0),
    }))
    .sort((a, b) => {
      if (a.unit === 'legajo' || b.unit === 'legajo') return a.unit === 'legajo' ? -1 : 1;
      if (b.ctrls.length !== a.ctrls.length) return b.ctrls.length - a.ctrls.length;
      if (b.unitsTotal !== a.unitsTotal) return b.unitsTotal - a.unitsTotal;
      return rank(a.unit) - rank(b.unit);
    });
}

// ── Hero del Resumen ────────────────────────────────────────────────────────
//
// Card centrada: icono circular de estado, el veredicto como título, el
// subtítulo en prosa (una frase por unidad verificada) y los KPIs. Lo que hay
// que ir a revisar —diferencias y Δ acumulada— sale en rojo.

export function buildHeroHtml(controlSummaries, runFiles, thresholdPct, legajoKeyMode) {
  // "Legajos cruzados": EMPLEADOS del Tabulado de esta corrida, no filas. El
  // Tabulado trae una fila por liquidación, así que `parseMetadata.totalRows`
  // (que sigue significando filas, y está bien que lo haga) contaba dos veces al
  // legajo con la mensual y la baja del mismo mes. Si el Tabulado no está o no
  // se puede contar, cae al mayor unitsTotal entre los controles por legajo —
  // que también son empleados, así que las dos ramas miden lo mismo.
  const tabFile = runFiles.find(f => f.fileType === 'tab_control');
  const legajoCtrls = controlSummaries.filter(c => c.summary.unit === 'legajo' && c.summary.unitsTotal != null);
  const empleadosTab = countUniqueLegajos(tabFile?.parsedRows, tabFile?.mapping?.empleadoColumn, {
    keyFn: makeLegajoKey(legajoKeyMode),
  });
  const totalLegajosCruzados = empleadosTab > 0
    ? empleadosTab
    : legajoCtrls.reduce((max, c) => Math.max(max, c.summary.unitsTotal), 0);

  // La unidad principal — una sola, la que elige groupSummariesByUnit (nunca
  // legajos sumados con centros de costo). Las demás no se mezclan acá pero se
  // enumeran en el subtítulo, y todas entran en el veredicto general.
  const unitGroups = groupSummariesByUnit(controlSummaries);
  const mainGroup  = unitGroups[0] || null;

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

  // ── Título: el veredicto en dos o tres palabras ────────────────────────────
  // Con diferencias, el título ES el número que hay que ir a mirar, nombrando
  // la unidad que se verificó ("23 legajos con diferencia", nunca "23 legajos"
  // en una corrida por centro de costo). Si el control terminó en error sin
  // diferencias que contar (falló el cruce), el título dice qué hacer.
  const nDiffMain = mainGroup?.unitsWithDiff || 0;
  const title = totalChecked === 0
    ? 'Sin controles de verificación en esta corrida'
    : overallTier === 'ok'
      ? 'Sin diferencias'
      : nDiffMain > 0
        ? `${fmtUnitCount(nDiffMain, mainGroup.unit)} con diferencia${nDiffMain === 1 ? '' : 's'}`
        : 'Revisar antes de cerrar el mes';

  const icon = { ok: '✓', warn: '!', error: '!', info: '·' }[overallTier];

  // ── Subtítulo en prosa ─────────────────────────────────────────────────────
  let subline;
  if (totalChecked === 0) {
    subline = 'Esta corrida sólo incluye controles de generación de reporte (sin cruce de diferencias).';
  } else if (overallTier === 'ok') {
    // Una frase por unidad verificada: "100 legajos verificados · 24 centros de
    // costo verificados, sin diferencias". Nunca un total que las sume, y nunca
    // el mismo empleado contado una vez por control: con dos controles sobre 4
    // empleados dice "4 legajos verificados en 2 controles", no "8 legajos".
    const unitBits = unitGroups.map(g => {
      const n = g.unitsMax;
      const frase = `${fmtUnitCount(n, g.unit)} ${fmtParticipio('verificad', n, g.unit)}`;
      return g.ctrls.length > 1 ? `${frase} en ${g.ctrls.length} controles` : frase;
    });
    subline = unitBits.length === 0 ? 'Sin diferencias.'
            : unitBits.length === 1 ? `${unitBits[0]} sin diferencias.`
            : `${unitBits.join(' · ')}, sin diferencias.`;
  } else {
    const bits = [];
    if (errorCount > 0) bits.push(`${errorCount} control${errorCount === 1 ? '' : 'es'} en rojo`);
    if (warnCount  > 0) bits.push(`${warnCount} control${warnCount === 1 ? '' : 'es'} en amarillo`);
    // Cada unidad con su propio conteo de diferencias y su porcentaje: así el
    // amarillo se explica aunque el título esté nombrando otra unidad.
    // El porcentaje se mide contra `unitsMax`, no contra la suma de los
    // unitsTotal de cada control: dos controles sobre la misma nómina son 514
    // empleados mirados dos veces, no 1026, y con el denominador inflado el
    // porcentaje sale a la mitad — el "semáforo miente en verde" de CLAUDE.md,
    // acá en el número. Es el mismo denominador que usa la frase de arriba
    // ("514 legajos verificados en 2 controles") y el que muestra la tarjeta
    // de cada control.
    const diffBits = unitGroups
      .filter(g => g.unitsWithDiff > 0)
      .map(g => fmtDiffCount(g.unitsWithDiff, g.unitsMax, g.unit));
    if (totalDiffAmount > 0) {
      diffBits.push(`dif. total <strong>$ ${formatAmount(totalDiffAmount)}</strong>`);
    }
    subline = `${bits.join(' y ')}.`
      + (diffBits.length > 0 ? `<br>${diffBits.join(' · ')}` : '');
  }

  // ── KPIs ───────────────────────────────────────────────────────────────────
  // Sólo los que esta corrida puede afirmar: sin Tabulado ni controles por
  // legajo no hay "legajos cruzados" que mostrar, y un 0 ahí se leería como
  // "cruzó cero empleados" (CLAUDE.md: null no es 0).
  const kpis = [];
  if (totalLegajosCruzados > 0) {
    kpis.push({ value: fmtInt(totalLegajosCruzados), label: 'Legajos cruzados' });
  }
  if (mainGroup) {
    kpis.push({
      value: fmtInt(mainGroup.unitsWithDiff),
      label: `${unitNames(mainGroup.unit).many} con diferencia`,
      diff: mainGroup.unitsWithDiff > 0,
    });
  }
  if (totalDiffAmount > 0) {
    kpis.push({ value: `$ ${formatAmount(totalDiffAmount)}`, label: 'Δ acumulada', diff: true });
  }
  if (totalChecked > 0) {
    kpis.push({ value: `${okCount}/${totalChecked}`, label: 'Controles en verde' });
  }

  const html = `
    <div class="results-hero results-hero--${overallTier}">
      <div class="results-hero__icon results-hero__icon--${TIER_DOT[overallTier]}" aria-hidden="true">${icon}</div>
      <h2 class="results-hero__title">${title}</h2>
      <p class="results-hero__subline">${subline}</p>
      <div class="results-hero__kpis">
        ${kpis.map(k => `
          <div class="results-hero__kpi">
            <span class="results-hero__kpi-value${k.diff ? ' results-hero__kpi-value--diff' : ''}">${esc(k.value)}</span>
            <span class="results-hero__kpi-label">${esc(k.label)}</span>
          </div>
        `).join('')}
      </div>
      ${mainGroup ? `
        <p class="results-hero__legend">verde 0% · amarillo ≤${thresholdPct}% · rojo &gt;${thresholdPct}% de ${esc(unitNames(mainGroup.unit).many)} c/dif</p>
      ` : ''}
    </div>
  `;

  return { html, overallTier };
}

// ── Tarjeta de resumen por control (errores primero — ya vienen ordenadas) ───
// A1/A4 — cascada de entrada (stagger capado a 6) + pulso de mejora respecto
// de la corrida anterior (ver getPrevTierByControlId).

export function buildCtrlCardsHtml(controlSummaries, prevTierByControlId, reduceMotion) {
  return controlSummaries
    .map((item, i) => buildCtrlCardHtml(item, i, prevTierByControlId, reduceMotion))
    .join('');
}

function buildCtrlCardHtml(item, index, prevTierByControlId, reduceMotion) {
  const { row, ctrl, summary, tier } = item;

  // A4 — ¿mejoró respecto de la corrida anterior para este cliente/período?
  const prevTier = prevTierByControlId?.[row.controlId];
  const improved = prevTier != null && TIER_RANK[tier] > TIER_RANK[prevTier];

  let animStyle = '';
  if (!reduceMotion) {
    // Si mejoró, re-entra con cardIn corto: refuerza "esto cambió" sin el
    // stagger de montaje.
    const delay = improved ? 0 : Math.min(index, 5) * 0.13;
    animStyle = `animation: cardIn 0.45s cubic-bezier(.4,0,.2,1) ${delay}s both;`;
  }
  const dotPulseClass = improved && tier === 'ok' ? ' status-dot--pulse-ok' : '';

  let metaHtml;
  let linkText;

  if (tier === 'info') {
    metaHtml = esc(summary.headline || 'Sin cruce de diferencias');
    linkText = 'Ver detalle →';
  } else {
    const names   = unitNames(summary.unit);
    const total   = summary.unitsTotal || 0;
    const nDiff   = summary.unitsWithDiff || 0;
    const hasDiff = nDiff > 0;

    const bits = [`${fmtUnitCount(total, summary.unit)} ${fmtParticipio('evaluad', total, summary.unit)}`];
    bits.push(hasDiff
      ? `<strong>${fmtDiffCount(nDiff, total, summary.unit)}</strong>`
      : '0 con diferencias');

    if (summary.diffTotalAmount > 0) bits.push(`Δ acumulada $ ${formatAmount(summary.diffTotalAmount)}`);
    const note = summary.contextNote
      || (summary.worstCase ? `mayor: ${summary.worstCase.label} ($ ${formatAmount(summary.worstCase.amount)})` : null)
      || summary.headline;
    if (note) bits.push(esc(note));

    metaHtml = bits.join(' · ');
    linkText = !hasDiff ? 'Ver detalle →'
             : nDiff === 1 ? 'Ver la diferencia →'
             : `Ver ${names.fem ? 'las' : 'los'} ${fmtInt(nDiff)} →`;
  }

  return `
    <div class="results-ctrl-card results-ctrl-card--${TIER_DOT[tier]}" style="${animStyle}">
      <span class="status-dot status-dot--${TIER_DOT[tier]}${dotPulseClass}" aria-hidden="true"></span>
      <div class="results-ctrl-card__body">
        <div class="results-ctrl-card__name">${esc(ctrl.label)}</div>
        <div class="results-ctrl-card__meta">${metaHtml}</div>
      </div>
      <button type="button" class="results-ctrl-card__link" data-hero-detail="${esc(row.controlId)}">${esc(linkText)}</button>
    </div>
  `;
}

// ── Línea de veredicto de la barra superior ──────────────────────────────────
// Condensa el estado de la corrida en una sola oración, al lado del cliente y
// el período — el Resumen de abajo sigue siendo la fuente completa del detalle.

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
