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
import { summarizeWithTolerance, renderResultsWithTolerance } from '../controls/tolerance.js';
import { countUniqueLegajos }  from '../controls/consolidate.js';
import { makeLegajoKey }       from '../utils/legajo.js';
import { periodToLabel, periodToShortLabel } from '../utils/dates.js';
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
    <div class="page-content" id="js-results-page">
      <div id="js-tab-resumen" class="results-column">
        <div id="js-column-warnings"></div>
        <div id="js-hero"></div>
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
  const warningsEl = root.querySelector('#js-column-warnings');
  const sectionsEl = root.querySelector('#js-control-sections');

  // La barra superior la escribe esta pantalla entera al montar (setHeader
  // define la barra completa en cada llamada): el toggle Borrador/Definitivo
  // la vuelve a escribir, no re-renderiza el contenido.
  let isDefinitive = run.isDefinitive === true;
  let tabsCtl = null;
  function mountHeader(tier, verdictLine, exportItems) {
    lastHeaderArgs = [tier, verdictLine, exportItems];
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
        onToggleDefinitive: () => toggleDefinitive(tier, verdictLine, exportItems),
        onReconfigure: () => { window.location.hash = `#/controls/${client?.id ?? ''}`; },
        onRerun:       () => { window.location.hash = `#/controls/${client?.id ?? ''}`; },
      },
    });
  }

  // "Marcar como revisado" está en dos lugares —la barra superior y el
  // veredicto del tablero— y es UN solo toggle: con dos implementaciones, una
  // de las dos se olvidaba de repintar y los botones decían cosas distintas del
  // mismo run.
  let lastHeaderArgs = null;
  async function toggleDefinitive(tier, verdictLine, exportItems) {
    const newValue = !isDefinitive;
    try {
      await updateControlRun(run.id, { isDefinitive: newValue });
      isDefinitive = newValue;
      mountHeader(tier, verdictLine, exportItems);
      paintBoard();
      tabsCtl?.setMeta(runMetaLabel({ createdAtLabel: createdAt, isQuickRun: false, isDefinitive }));
      showToast(newValue ? '✅ Marcado como definitivo' : '↩ Vuelto a borrador', 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'danger');
    }
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
      // Con el monto de diferencia con el que se corrió, no con el que el
      // cliente tenga hoy (D-069): una corrida ya revisada no cambia de
      // resultado sola. `summarizeWithTolerance` lo saca de los propios
      // resultados guardados.
      const summary = ctrl.summarize
        ? summarizeWithTolerance(ctrl, row.results)
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

  // La evolución mes a mes: las corridas de los períodos ANTERIORES del mismo
  // cliente, con el tier recalculado. Es el patrón de getPrevTierByControlId
  // cambiando el filtro de período (ver el comentario de la función).
  const historyByControlId = await getHistoryByControlId(run, thresholdPct);

  // El aviso de columnas va ARRIBA del veredicto: es un aviso sobre la validez
  // del run entero, no de un bloque del tablero.
  warningsEl.innerHTML = buildColumnWarningsHtml(columnWarningsOf(runFiles));

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // El modo de clave de legajo es del CLIENTE (D-038): no viaja en tab.mapping,
  // sale del registro que esta pantalla ya cargó.
  //
  // El tablero se vuelve a pintar cuando cambia el estado del run (el label del
  // botón "Marcar como revisado" vive adentro), así que el render es una función
  // y no una asignación suelta.
  let overallTier = 'info';
  function paintBoard() {
    const board = buildHeroHtml(controlSummaries, runFiles, thresholdPct, client?.legajoKeyMode, {
      prevTierByControlId, historyByControlId, reduceMotion,
      period: run.period, isDefinitive,
    });
    overallTier = board.overallTier;
    heroEl.innerHTML = board.html;
  }
  paintBoard();

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

  // El Detalle usa el ancho de la ventana y el Resumen mantiene el tope de
  // 1280px (D-060): las planillas necesitan el ancho, el texto no lo quiere.
  const pageEl = root.querySelector('#js-results-page');
  const applyWidth = (tabId) => pageEl.classList.toggle('page-content--wide', tabId === 'detalle');

  tabsCtl = renderResultsTabs(tabsEl, {
    tabs: [
      { id: 'resumen', label: 'Resumen', panel: resumenEl },
      { id: 'detalle', label: 'Detalle', panel: detalleEl },
    ],
    meta: runMetaLabel({ createdAtLabel: createdAt, isQuickRun: false, isDefinitive }),
    onChange: applyWidth,
  });
  applyWidth('resumen');

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
    renderResultsWithTolerance(ctrl, row.results, detailEl);

    initCtrlToggle(card);
  }

  // Las acciones del tablero, por DELEGACIÓN: el tablero se vuelve a pintar
  // cuando cambia el estado del run, y un listener colgado de cada botón se
  // perdería en ese repintado.
  heroEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-hero-definitive]')) {
      if (lastHeaderArgs) toggleDefinitive(...lastHeaderArgs);
      return;
    }

    const btn = e.target.closest('[data-hero-detail]');
    if (!btn) return;
    const id = btn.dataset.heroDetail;
    const card = sectionsEl.querySelector(`[data-control-id="${CSS.escape(id)}"]`);
    if (!card) return;

    tabsCtl.setActive('detalle');
    openCtrlToggle(card);
    applyDetailPrefilter(card, {
      tab:       btn.dataset.heroTab || null,
      prefilter: btn.dataset.heroPrefilter || null,
      search:    btn.dataset.heroSearch || null,
    });
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const summary = summarizeWithTolerance(ctrl, row.results);
    const tier = summary.status === 'error'
      ? 'error'
      : summary.unitsTotal == null
        ? 'info'
        : computeSemaforoStatus(summary.unitsWithDiff, summary.unitsTotal, thresholdPct);
    prevTierByControlId[row.controlId] = tier;
  }
  return prevTierByControlId;
}

// ── La evolución mes a mes: los períodos ANTERIORES del mismo control ───────
//
// Mismo patrón que getPrevTierByControlId, cambiando el filtro: en vez de las
// corridas hermanas del MISMO período, las de los períodos anteriores. Tres
// cuidados que el bloque no perdona:
//
//   1. De cada período se toma la corrida **DEFINITIVA** (o la última si
//      ninguna está marcada): comparar contra un borrador a medio revisar
//      dibuja una historia que nadie firmó. (Es la pendiente 3 del §7 de la
//      spec: arranca en definitiva, como asume el handoff.)
//   2. Se compara el **porcentaje**, no la cantidad: la dotación cambia mes a
//      mes y 40 diferencias sobre 200 empleados no son las mismas que sobre 800.
//   3. Un período sin corrida de ese control **se omite** — no se dibuja en
//      cero, que se leería como "ese mes cerró limpio".

/** Cuántos períodos anteriores entran al gráfico (más el actual: 6 barras). */
const HISTORY_PERIODS = 5;

async function getHistoryByControlId(run, thresholdPct) {
  if (!run?.period) return {};
  const siblingRuns = await getControlRuns(run.clientCode);

  // La corrida que representa a cada período anterior: gana la definitiva; entre
  // dos definitivas (o dos borradores), la más reciente.
  const porPeriodo = new Map();
  for (const r of siblingRuns) {
    if (!r.period || r.period >= run.period) continue;
    const actual = porPeriodo.get(r.period);
    if (!actual) { porPeriodo.set(r.period, r); continue; }
    const mejor = (a, b) => {
      if (!!a.isDefinitive !== !!b.isDefinitive) return a.isDefinitive ? a : b;
      return (a.createdAt || '') >= (b.createdAt || '') ? a : b;
    };
    porPeriodo.set(r.period, mejor(actual, r));
  }

  const periodos = [...porPeriodo.keys()].sort().slice(-HISTORY_PERIODS);
  const out = {};
  for (const period of periodos) {
    const prevRun = porPeriodo.get(period);
    const rows = await getControlRunResults(prevRun.id);
    for (const row of rows) {
      const ctrl = CONTROL_REGISTRY[row.controlId];
      if (!ctrl?.summarize) continue;
      const summary = summarizeWithTolerance(ctrl, row.results);
      // Sin unidades que contar no hay porcentaje que dibujar: ese período se
      // omite para ese control (no entra en cero).
      if (summary?.status === 'error' || summary?.unitsTotal == null || !summary.unitsTotal) continue;
      const pctDiff = ((summary.unitsWithDiff || 0) / summary.unitsTotal) * 100;
      const tier = computeSemaforoStatus(summary.unitsWithDiff, summary.unitsTotal, thresholdPct);
      (out[row.controlId] ||= []).push({ period, pctDiff, tier });
    }
  }
  return out;
}

// ── Del Resumen al Detalle, con el filtro puesto ────────────────────────────
//
// Cuando el analista llega al Detalle desde un corte del tablero, el Detalle
// tiene que arrancar mostrando ESE recorte — si no, va del "19 legajos arriba de
// 500.000" a una tabla de 380 filas y tiene que volver a buscarlos.
//
// La mecánica es la que ya existe y no se toca ninguna pantalla de control: el
// `<select>` de estado sigue siendo el único control real (los chips son su
// piel, ver js/ui/tableTools.js), así que alcanza con escribirle `value` y
// disparar `change`. Y el buscador filtra al ELEGIR una opción, así que se le
// escribe el valor y se le manda el Enter que ya sabe manejar.
//
// El hint dice de dónde viene el filtro, con la misma mecánica del que ya pone
// `createResultsToolbar()` cuando un control arranca filtrado por su cuenta.

/** La intención del pre-filtro → los valores con los que la escribe cada control. */
const PREFILTER_VALUES = {
  conDif: ['conDif', 'diferencia'],
};

export function applyDetailPrefilter(card, { tab = null, prefilter = null, search = null } = {}) {
  // La solapa de adentro de la ficha del control (Resumen · Fichas · Planilla).
  // El id lo arma initTabs como `${uid}-tab-${id}`, así que se pide por sufijo:
  // el control que no tenga esa solapa simplemente no matchea y queda como está.
  if (tab) card.querySelector(`[role="tab"][id$="-tab-${tab}"]`)?.click();

  let aplicado = false;
  if (prefilter) aplicado = applyEstadoChip(card, prefilter) || aplicado;
  if (search)    aplicado = applySearch(card, search)        || aplicado;
  if (aplicado)  showPrefilterHint(card);
}

/**
 * El chip de estado del Detalle, puesto en el valor que pide el corte.
 *
 * Se busca SÓLO en el panel visible: `initTabs` deja los paneles ya renderizados
 * en el DOM (ocultos), así que un select encontrado en cualquier parte de la
 * ficha puede ser el de una solapa que el analista no está viendo — y filtrar
 * una tabla invisible es peor que no filtrar.
 *
 * Si el panel que está abierto no tiene filtro de estado, se prueban las otras
 * solapas: la planilla de varios controles se renderiza recién al activarla, así
 * que el select todavía no existe cuando el analista llega desde el Resumen.
 */
function applyEstadoChip(card, prefilter) {
  // El valor del chip no es el mismo en todos los controles: la vista estándar
  // usa `conDif` (js/ui/tableTools.js) y Netos, que tiene su propio select, usa
  // `diferencia`. Se pide la INTENCIÓN y se resuelve contra las opciones que ese
  // control realmente tiene — con el valor cableado, el pre-filtro funcionaba en
  // un control y en los otros no hacía nada, en silencio.
  const candidatos = PREFILTER_VALUES[prefilter] || [prefilter];
  const visible = () => card.querySelector('.tabs__panel:not([hidden]) select[data-chips="1"]')
    // El control sin solapas internas monta su barra directo en la ficha.
    || (card.querySelector('.tabs__panel') ? null : card.querySelector('select[data-chips="1"]'));

  let sel = visible();
  if (!sel) {
    for (const t of card.querySelectorAll('[role="tab"]')) {
      if (t.getAttribute('aria-selected') === 'true') continue;
      t.click();
      sel = visible();
      if (sel) break;
    }
  }
  if (!sel) return false;

  const opt = [...sel.options].find(o => candidatos.includes(o.value) && !o.disabled);
  if (!opt) return false;
  if (sel.value !== opt.value) {
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true;
}

/**
 * El buscador del Detalle con el legajo (o la empresa) ya escrito.
 *
 * `initSearchCombobox` filtra al ELEGIR una opción de su lista, así que se le
 * escribe el valor y se le manda el Enter que ya sabe manejar: con una sola
 * coincidencia la elige, y con varias deja la lista abierta — que es exactamente
 * lo que hace falta cuando el corte no identifica una fila sola.
 */
function applySearch(card, search) {
  const input = card.querySelector('.tabs__panel:not([hidden]) .table-search__input')
    || card.querySelector('.table-search__input');
  if (!input) return false;
  input.value = search;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return true;
}

function showPrefilterHint(card) {
  const right = card.querySelector('.tabs__panel:not([hidden]) .results-toolbar__right')
    || card.querySelector('.results-toolbar__right');
  if (!right || right.querySelector('[data-prefilter-hint]')) return;
  const hint = document.createElement('span');
  hint.className = 'results-toolbar__hint';
  hint.dataset.prefilterHint = '1';
  hint.textContent = 'Este filtro arrancó activo porque venías del Resumen.';
  right.prepend(hint);

  // Se va solo en cuanto el analista toca cualquier filtro: a partir de ahí el
  // recorte es el suyo y el cartel mentiría.
  const quitar = () => hint.remove();
  card.querySelectorAll('select, .results-chip, .table-search__clear')
    .forEach(el => el.addEventListener('click', quitar, { once: true }));
  card.querySelectorAll('select').forEach(el => el.addEventListener('change', quitar, { once: true }));
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
export const UNIT_NAMES = {
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

// ── El tablero del Resumen del run ──────────────────────────────────────────
//
// Reemplaza al hero (círculo con `!` + título + 4 KPIs que repetían el mismo
// dato). Contesta tres preguntas en este orden — es el orden del handoff
// (docs/handoff-resumen-netos.md) y el que ordena la pantalla:
//
//   1. ¿Se puede liberar la liquidación?  → el veredicto EN PALABRAS y la
//      escala de severidad dibujada contra el umbral real del semáforo.
//   2. ¿Cuánta plata es?                  → el puente y para qué lado.
//   3. ¿Qué reviso primero?               → los tres cortes, la evolución mes a
//      mes y los que concentran la plata.
//
// Dos layouts según CUÁNTOS CONTROLES trajo el run:
//   3a — un control: el veredicto en grande y el tablero completo de ese control.
//   3b — varios: el veredicto comprimido con la tira de semáforos, la grilla de
//        una tarjeta por control, y dos cortes que sólo existen cruzando controles.
//
// ── Las reglas que este archivo no puede romper ─────────────────────────────
//   · El color y el corte de la escala salen de `computeSemaforoStatus()` +
//     `semaforoThresholdPct`, NUNCA de `summary.status` ni de un 2 % escrito.
//     Cuatro pantallas pintan el estado del mismo control: con el status crudo,
//     el mismo run sale de distinto color según dónde se lo mire.
//   · No se suman `unitsTotal` entre controles (`groupSummariesByUnit`/
//     `unitsMax` siguen mandando), y `touchedByRed` es una UNIÓN de claves de
//     legajo, jamás una suma de conteos.
//   · `null` no es `0`: cada bloque, barra y KPI sin dato se omite ENTERO.
//   · Todo el copy de unidad pasa por `unitNames()`/`fmtUnitCount()` — un run
//     por centro de costo no dice "legajos".
//   · Las conclusiones en caja son SÓLO las aritméticas (concentración,
//     comparación con el mes anterior). Las de diagnóstico ("parece un
//     parámetro que no se aplicó") no se generan todavía: las define Willy
//     sobre casos reales (§7.5 de specs/vista-estandar-resumen.md).
//
// Las barras son `div`s con `width:%`. No hay SVG, ni canvas, ni librería de
// gráficos — la misma decisión que el resto del repo.

/**
 * @param {object[]} controlSummaries  `{ row, ctrl, summary, tier }`, ya ordenados
 * @param {object[]} runFiles          los archivos de la corrida (para "Legajos cruzados")
 * @param {number} thresholdPct        el corte del semáforo de este cliente
 * @param {string} [legajoKeyMode]     la clave de legajo del cliente (D-038)
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.prevTierByControlId]  el tier de la corrida anterior (A4)
 * @param {Record<string,object[]>} [opts.historyByControlId] `[{period, pctDiff, tier}]` de los períodos anteriores
 * @param {boolean} [opts.reduceMotion]
 * @param {string} [opts.period]       el período de ESTE run, para la última barra de la evolución
 * @param {boolean} [opts.isDefinitive] si el run ya está marcado como definitivo (el label del toggle)
 * @returns {{ html: string, overallTier: 'ok'|'warn'|'error'|'info' }}
 */
export function buildHeroHtml(controlSummaries, runFiles, thresholdPct, legajoKeyMode, opts = {}) {
  const {
    prevTierByControlId = {},
    historyByControlId = {},
    reduceMotion = true,
    period = null,
    isDefinitive = false,
  } = opts;

  // "Legajos cruzados": EMPLEADOS del Tabulado de esta corrida, no filas. El
  // Tabulado trae una fila por liquidación, así que `parseMetadata.totalRows`
  // (que sigue significando filas, y está bien que lo haga) contaba dos veces al
  // legajo con la mensual y la baja del mismo mes. Si el Tabulado no está o no
  // se puede contar, cae al mayor unitsTotal entre los controles por legajo —
  // que también son empleados, así que las dos ramas miden lo mismo.
  const tabFile = (runFiles || []).find(f => f.fileType === 'tab_control');
  const legajoCtrls = controlSummaries.filter(c => c.summary.unit === 'legajo' && c.summary.unitsTotal != null);
  const empleadosTab = countUniqueLegajos(tabFile?.parsedRows, tabFile?.mapping?.empleadoColumn, {
    keyFn: makeLegajoKey(legajoKeyMode),
  });
  const totalLegajosCruzados = empleadosTab > 0
    ? empleadosTab
    : legajoCtrls.reduce((max, c) => Math.max(max, c.summary.unitsTotal), 0);

  // La unidad principal — una sola, la que elige groupSummariesByUnit (nunca
  // legajos sumados con centros de costo). Las demás no se mezclan acá pero
  // entran igual en el veredicto general.
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

  const ctx = {
    controlSummaries, thresholdPct, unitGroups, mainGroup, totalLegajosCruzados,
    okCount, warnCount, errorCount, totalChecked, overallTier, totalDiffAmount,
    prevTierByControlId, historyByControlId, reduceMotion, period, isDefinitive,
  };

  const html = controlSummaries.length > 1 ? buildBoard3b(ctx) : buildBoard3a(ctx);
  return { html, overallTier };
}

// ── El veredicto: la acción en palabras ─────────────────────────────────────
// No es un número: es qué hacer con la liquidación. El número está en la escala
// y en los KPIs, que es donde se puede leer contra algo.

const VERDICT_TITLE_3A = {
  error: 'No liberar la liquidación',
  warn:  'Liberar con reparos',
  ok:    'Listo para liberar',
  info:  'Sin controles de verificación',
};
const VERDICT_TITLE_3B = {
  error: 'No liberar',
  warn:  'Liberar con reparos',
  ok:    'Listo para liberar',
  info:  'Sin controles de verificación',
};

/** El porcentaje de unidades con diferencia de la unidad principal del run. */
function mainPctDiff(mainGroup) {
  if (!mainGroup || !mainGroup.unitsMax) return null;
  return (mainGroup.unitsWithDiff / mainGroup.unitsMax) * 100;
}

/**
 * El eje de la escala: de 0 al mayor entre el porcentaje del run y el doble del
 * umbral, redondeado hacia arriba a un número que se pueda rotular (múltiplos
 * de 5 cuando ya pasó de 10). Sin el piso de `thresholdPct * 2` un run en 0,3 %
 * dibujaría el umbral fuera de la barra.
 */
function scaleAxisMax(pctDiff, thresholdPct) {
  const raw = Math.max(pctDiff || 0, (thresholdPct || 0) * 2, 1);
  return raw > 10 ? Math.ceil(raw / 5) * 5 : Math.ceil(raw);
}

/**
 * La escala de severidad. Tres zonas y un marcador.
 *
 * El verde es el punto 0 —`computeSemaforoStatus` sólo da 'ok' con CERO
 * unidades con diferencia—, así que como zona no tiene ancho: se dibuja con el
 * ancho de un paso del umbral para que se vea, y el marcador descuenta ese
 * corrimiento para caer en la zona que le toca. El amarillo va de 0 al umbral y
 * el rojo es todo lo que sigue: los mismos cortes que pinta el semáforo, sin un
 * 2 % escrito en ningún lado.
 */
function buildScaleHtml(mainGroup, thresholdPct) {
  const pctDiff = mainPctDiff(mainGroup);
  if (pctDiff === null) return '';

  const axisMax = scaleAxisMax(pctDiff, thresholdPct);
  const step    = Math.min(thresholdPct, axisMax / 3);
  const greenW  = (step / axisMax) * 100;
  const warnW   = (step / axisMax) * 100;
  const errorW  = Math.max(0, 100 - greenW - warnW);
  const markerAt = Math.min(100, ((step + Math.min(pctDiff, axisMax - step)) / axisMax) * 100);
  const names = unitNames(mainGroup.unit);

  return `
    <div class="rsm-scale">
      <div class="rsm-scale__label">${esc(`${names.many} con diferencia sobre el total evaluado`)}</div>
      <div class="rsm-scale__bar">
        <div class="rsm-scale__zone rsm-scale__zone--ok"    style="width:${fmtPct2(greenW)}%;"></div>
        <div class="rsm-scale__zone rsm-scale__zone--warn"  style="width:${fmtPct2(warnW)}%;"></div>
        <div class="rsm-scale__zone rsm-scale__zone--error" style="width:${fmtPct2(errorW)}%;"></div>
        <div class="rsm-scale__marker" style="left:${fmtPct2(markerAt)}%;">
          <span class="rsm-scale__marker-value">${fmtPct1(pctDiff)}%</span>
        </div>
      </div>
      <div class="rsm-scale__legend">
        <span class="rsm-scale__key rsm-scale__key--ok">0 % verde</span>
        <span class="rsm-scale__key rsm-scale__key--warn">≤ ${fmtThreshold(thresholdPct)} % amarillo</span>
        <span class="rsm-scale__key rsm-scale__key--error">&gt; ${fmtThreshold(thresholdPct)} % rojo →</span>
      </div>
    </div>
  `;
}

/**
 * Los KPIs del veredicto: los de siempre más "Sin comparar" y "Tolerancia", que
 * son la primera pregunta del analista y hoy no estaban. **Un KPI sin dato no
 * se muestra** — un 0 ahí se lee como "cruzó cero empleados".
 */
function verdictKpis(ctx, { compact = false } = {}) {
  const { mainGroup, totalLegajosCruzados, totalDiffAmount, okCount, totalChecked, controlSummaries } = ctx;
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

  // "Sin comparar": lo que quedó de un solo lado del cruce. Es un dato nuevo y
  // opcional — el control que no lo publica no muestra el KPI.
  const uncompared = controlSummaries.reduce((acc, c) => {
    const n = c.summary.unitsUncompared;
    return typeof n === 'number' ? (acc || 0) + n : acc;
  }, null);
  if (uncompared !== null && uncompared > 0) {
    kpis.push({ value: fmtInt(uncompared), label: 'Sin comparar' });
  }

  // "Tolerancia": el monto con el que se midió. Sólo si TODOS los controles del
  // run midieron con el mismo: dos tolerancias distintas en un KPI único serían
  // un número que no aplica a nada.
  const tols = new Set(controlSummaries
    .map(c => c.summary.resumen?.tolerance)
    .filter(t => typeof t === 'number'));
  if (tols.size === 1) {
    kpis.push({ value: `$ ${formatAmount([...tols][0])}`, label: 'Tolerancia' });
  }

  // En un run de un control, "N/1 en verde" repite el veredicto de al lado.
  if (!compact && totalChecked > 1) {
    kpis.push({ value: `${okCount}/${totalChecked}`, label: 'Controles en verde' });
  }

  return kpis;
}

function kpisHtml(kpis) {
  if (kpis.length === 0) return '';
  return `
    <div class="rsm-kpis">
      ${kpis.map(k => `
        <div class="rsm-kpi">
          <span class="rsm-kpi__value${k.diff ? ' rsm-kpi__value--diff' : ''}">${esc(k.value)}</span>
          <span class="rsm-kpi__label">${esc(k.label)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

/** Las dos acciones del veredicto: ir al Detalle y marcar como revisado. */
function verdictActionsHtml(ctx) {
  const { mainGroup, controlSummaries } = ctx;
  const nDiff = mainGroup?.unitsWithDiff || 0;
  const only  = controlSummaries.length === 1 ? controlSummaries[0] : null;

  const detailLabel = nDiff > 0
    ? `Ver ${fmtUnitCount(nDiff, mainGroup.unit)} →`
    : 'Ver el detalle →';

  // El handler es el `[data-hero-detail]` que ya existe: cambia de solapa, abre
  // la ficha del control y la trae a la vista. En un run de varios controles no
  // hay una ficha sola que abrir, así que el botón se omite y cada tarjeta de la
  // grilla tiene el suyo.
  const detailBtn = only
    ? `<button type="button" class="rsm-btn rsm-btn--primary"
               data-hero-detail="${esc(only.row.controlId)}"
               ${nDiff > 0 ? 'data-hero-prefilter="conDif"' : ''}>${esc(detailLabel)}</button>`
    : '';

  return `
    <div class="rsm-verdict__actions">
      ${detailBtn}
      <button type="button" class="rsm-btn rsm-btn--ghost" data-hero-definitive>${
        ctx.isDefinitive ? 'Volver a borrador' : 'Marcar como revisado'
      }</button>
    </div>
  `;
}

// ── 2. "De dónde sale la diferencia": el puente ─────────────────────────────
//
// La FORMA del puente es por familia de control y la declara el `run()`:
//   · dos totales cruzados (Brutos, GS Pers, NR — con la regla de D-086)
//   · anterior → variación → actual (los tres de variaciones)
//   · DEBE → HABER → descuadre (los dos contables)
//   · conteos (EE x CATEG, Novedades)
//   · y el de cuatro pasos del diseño, que es el de Netos.
//
// Acá no se calcula ninguno: se dibuja el que el control publicó en
// `summary.resumen.bridge`. **El puente no resta dos totales cuando un lado
// puede faltar** (D-086): lo que quedó sin comparar se dice APARTE, con su
// importe y su lado, y no se mete en la diferencia.

const BRIDGE_TONES = new Set(['ink', 'accent', 'error', 'warn', 'neutral']);
const bridgeTone = (tone) => (BRIDGE_TONES.has(tone) ? tone : 'ink');

function buildBridgeHtml(bridge) {
  if (!bridge || !Array.isArray(bridge.steps) || bridge.steps.length === 0) return '';

  const steps = bridge.steps.filter(s => s && typeof s.amount === 'number' && Number.isFinite(s.amount));
  if (steps.length === 0) return '';

  const counts = bridge.kind === 'counts';
  const value  = (n) => (counts ? fmtInt(n) : `$ ${formatAmount(n)}`);

  return `
    <section class="rsm-card rsm-card--bridge">
      <h3 class="rsm-card__title">${esc(bridge.title || 'De dónde sale la diferencia')}</h3>
      <div class="rsm-bridge">
        ${steps.map(s => `
          <div class="rsm-bridge__step rsm-bridge__step--${esc(bridgeTone(s.tone))}">
            <span class="rsm-bridge__label">${esc(s.label)}</span>
            <span class="rsm-bridge__amount">${esc(value(s.amount))}</span>
            ${s.note ? `<span class="rsm-bridge__note">${esc(s.note)}</span>` : ''}
          </div>
        `).join('')}
      </div>
      ${buildProportionHtml(bridge.proportion, counts)}
      ${bridge.uncompared ? `
        <p class="rsm-bridge__uncompared">
          <strong>${esc(bridge.uncompared.label)}</strong>
          ${esc(value(bridge.uncompared.amount))}
          — queda fuera de la diferencia porque sólo lo trae un archivo.
        </p>
      ` : ''}
    </section>
  `;
}

/**
 * La barra de proporción: lo que pone la cifra en escala (8,4 M sobre 402 M).
 * Los tramos vienen del control, con su tono; el rótulo también, porque cada
 * familia de puente mide lo suyo contra lo suyo.
 */
function buildProportionHtml(prop, counts) {
  if (!prop || !Array.isArray(prop.parts)) return '';
  const parts = prop.parts.filter(p => p && typeof p.amount === 'number' && Math.abs(p.amount) > 0);
  if (parts.length === 0) return '';
  const total = parts.reduce((s, p) => s + Math.abs(p.amount), 0);
  if (total <= 0) return '';

  return `
    <div class="rsm-prop">
      <div class="rsm-prop__bar">
        ${parts.map(p => `
          <div class="rsm-prop__seg rsm-prop__seg--${esc(bridgeTone(p.tone))}"
               style="width:${fmtPct2((Math.abs(p.amount) / total) * 100)}%;"
               ${p.label ? `title="${esc(`${p.label}: ${counts ? fmtInt(p.amount) : `$ ${formatAmount(p.amount)}`}`)}"` : ''}></div>
        `).join('')}
      </div>
      ${prop.note ? `<p class="rsm-prop__note">${esc(prop.note)}</p>` : ''}
    </div>
  `;
}

// ── 2b. "Para qué lado" ─────────────────────────────────────────────────────
// El neto es lo que el analista informa; el bruto, el trabajo que tiene por
// delante. Los dos van al pie, y la distinción importa: son dos números
// distintos del mismo par de lados.

function buildSidesHtml(diffSigned, unit) {
  if (!diffSigned) return '';
  const { over, under } = diffSigned;
  if (!over && !under) return '';

  const max = Math.max(over?.amount || 0, under?.amount || 0);
  if (max <= 0) return '';

  const row = (side, fallbackLabel, tone) => {
    if (!side || !side.units) return '';
    return `
      <div class="rsm-side">
        <div class="rsm-side__head">
          <span class="rsm-side__label">${esc(side.label || fallbackLabel)}</span>
          <span class="rsm-side__amount">$ ${formatAmount(side.amount)}</span>
        </div>
        <div class="rsm-side__track">
          <div class="rsm-side__fill rsm-side__fill--${esc(tone)}" style="width:${fmtPct2((side.amount / max) * 100)}%;"></div>
        </div>
        <div class="rsm-side__note">
          ${esc(fmtUnitCount(side.units, unit))}${side.note ? esc(` · ${side.note}`) : ''}
        </div>
      </div>
    `;
  };

  const neto  = (over?.amount || 0) - (under?.amount || 0);
  const bruto = (over?.amount || 0) + (under?.amount || 0);

  return `
    <section class="rsm-card rsm-card--sides">
      <h3 class="rsm-card__title">Para qué lado</h3>
      ${row(over,  'De más',  'error')}
      ${row(under, 'De menos', 'warn')}
      <div class="rsm-side__foot">
        <div><span class="rsm-side__foot-label">Neto</span><span class="rsm-side__foot-value">$ ${formatAmount(neto)}</span></div>
        <div><span class="rsm-side__foot-label">Bruto</span><span class="rsm-side__foot-value">$ ${formatAmount(bruto)}</span></div>
      </div>
    </section>
  `;
}

// ── 3. Los tres cortes ──────────────────────────────────────────────────────
// Las barras se escalan POR PLATA, no por cantidad de unidades: la pregunta que
// contestan es "dónde está el importe", y 60 diferencias de $ 200 no son el
// problema de la corrida. La conclusión en caja es la mitad del valor de cada
// card — y es siempre aritmética (§7.5 de la spec).

/** El rótulo de un tramo de magnitud: "≥ 500.000" · "100.000 – 500.000". */
function bucketLabel(b) {
  if (b.max === null || b.max === undefined) return `≥ ${formatAmount(b.min)}`;
  return `${formatAmount(b.min)} – ${formatAmount(b.max)}`;
}

function buildBucketsCardHtml(buckets, unit, controlId) {
  if (!Array.isArray(buckets) || buckets.length === 0) return '';
  const maxAmount = buckets.reduce((m, b) => Math.max(m, b.amount), 0);
  const totalUnits  = buckets.reduce((s, b) => s + b.units, 0);
  const totalAmount = buckets.reduce((s, b) => s + b.amount, 0);
  if (maxAmount <= 0) return '';

  // La concentración, que es aritmética: los tramos más grandes que hacen falta
  // para llegar al 80 % de la plata. Si con eso ya entraron todos los casos, la
  // frase no dice nada y no se escribe.
  let acumUnits = 0, acumAmount = 0, cortes = 0;
  for (const b of buckets) {
    cortes++;
    acumUnits += b.units;
    acumAmount += b.amount;
    if (acumAmount >= totalAmount * 0.8) break;
  }
  const concentra = cortes < buckets.length && acumUnits < totalUnits
    ? `${esc(fmtUnitCount(acumUnits, unit))} (${fmtPct1((acumUnits / totalUnits) * 100)} % de los casos) `
      + `concentran el ${fmtPct1((acumAmount / totalAmount) * 100)} % de la plata. Empezá por esos.`
    : null;

  return `
    <section class="rsm-card rsm-cut">
      <h3 class="rsm-card__title">Qué tan grande es cada una</h3>
      ${buckets.map(b => `
        <div class="rsm-cut__row" ${controlId ? `data-hero-detail="${esc(controlId)}" data-hero-prefilter="conDif" role="button" tabindex="0"` : ''}>
          <div class="rsm-cut__head">
            <span class="rsm-cut__label">${esc(bucketLabel(b))}</span>
            <span class="rsm-cut__value">${esc(fmtUnitCount(b.units, unit))} · ${formatAmount(b.amount)}</span>
          </div>
          <div class="rsm-cut__track">
            <div class="rsm-cut__fill" style="width:${fmtPct2((b.amount / maxAmount) * 100)}%;"></div>
          </div>
        </div>
      `).join('')}
      ${concentra ? `<p class="rsm-cut__conclusion">${concentra}</p>` : ''}
    </section>
  `;
}

function buildGroupCardHtml(groups, unit, thresholdPct, controlId) {
  if (!Array.isArray(groups) || groups.length === 0) return '';
  const maxAmount = groups.reduce((m, g) => Math.max(m, g.amount), 0);
  if (maxAmount <= 0) return '';

  const enRojo = groups.filter(g => g.unitsTotal
    && computeSemaforoStatus(g.units, g.unitsTotal, thresholdPct) === 'error').length;

  return `
    <section class="rsm-card rsm-cut">
      <h3 class="rsm-card__title">En qué empresa</h3>
      ${groups.map(g => {
        const tier = g.unitsTotal ? computeSemaforoStatus(g.units, g.unitsTotal, thresholdPct) : null;
        const pct  = g.unitsTotal ? (g.units / g.unitsTotal) * 100 : null;
        return `
        <div class="rsm-cut__row" ${controlId ? `data-hero-detail="${esc(controlId)}" data-hero-search="${g.key}" role="button" tabindex="0"` : ''}>
          <div class="rsm-cut__head">
            <span class="rsm-cut__label rsm-cut__label--strong">${g.key}</span>
            ${pct === null ? '' : `<span class="rsm-cut__value rsm-cut__value--${esc(tier)}">${fmtPct1(pct)} %</span>`}
          </div>
          <div class="rsm-cut__track">
            <div class="rsm-cut__fill" style="width:${fmtPct2((g.amount / maxAmount) * 100)}%;"></div>
          </div>
          <div class="rsm-cut__sub">
            ${g.unitsTotal ? esc(`${fmtInt(g.units)} de ${fmtUnitCount(g.unitsTotal, unit)}`) : esc(fmtUnitCount(g.units, unit))}
            · ${formatAmount(g.amount)}
          </div>
        </div>`;
      }).join('')}
      ${enRojo > 0 ? `
        <p class="rsm-cut__conclusion">
          ${enRojo === groups.length && groups.length > 1
            ? `Las ${fmtInt(enRojo)} están arriba del corte de rojo (${fmtThreshold(thresholdPct)} %).`
            : `${fmtInt(enRojo)} de ${fmtInt(groups.length)} arriba del corte de rojo (${fmtThreshold(thresholdPct)} %).`}
        </p>
      ` : ''}
    </section>
  `;
}

/**
 * El corte por causa. La banda rayada de "Sin identificar" **no es opcional**
 * cuando la atribución es parcial: un corte que se muestra como si fuera
 * completo sin serlo es el default silencioso de CLAUDE.md, dibujado.
 *
 * Si el control no pudo atribuir NINGUNA causa, la card se reduciría a una sola
 * fila "Sin identificar" y no se renderiza: mejor dos cortes que tres con uno
 * vacío (riesgo 1 del handoff).
 */
function buildCauseCardHtml(byCause, unidentified, unit, controlId) {
  const causes = Array.isArray(byCause) ? byCause : [];
  if (causes.length === 0) return '';

  const rows = [
    ...causes.map(c => ({ ...c, unidentified: false })),
    ...(unidentified ? [{
      key: 'sin-identificar', label: 'Sin identificar', base: null, code: null,
      units: unidentified.units, amount: unidentified.amount, unidentified: true,
    }] : []),
  ];
  const maxAmount = rows.reduce((m, r) => Math.max(m, r.amount), 0);
  if (maxAmount <= 0) return '';

  const conCausa = causes.reduce((s, c) => s + c.units, 0);
  const total    = conCausa + (unidentified?.units || 0);

  return `
    <section class="rsm-card rsm-cut">
      <h3 class="rsm-card__title">Qué rubro la causa</h3>
      ${rows.map(r => `
        <div class="rsm-cut__row${r.unidentified ? ' rsm-cut__row--unident' : ''}"
             ${controlId && !r.unidentified ? `data-hero-detail="${esc(controlId)}" data-hero-prefilter="conDif" role="button" tabindex="0"` : ''}>
          <div class="rsm-cut__head">
            <span class="rsm-cut__label">${r.label}${r.base ? ` <span class="rsm-cut__base">(${esc(r.base)})</span>` : ''}</span>
            <span class="rsm-cut__value">${esc(fmtUnitCount(r.units, unit))} · ${formatAmount(r.amount)}</span>
          </div>
          <div class="rsm-cut__track">
            <div class="rsm-cut__fill${r.unidentified ? ' rsm-cut__fill--unident' : ''}"
                 style="width:${fmtPct2((r.amount / maxAmount) * 100)}%;"></div>
          </div>
        </div>
      `).join('')}
      ${unidentified ? `
        <p class="rsm-cut__conclusion">
          El motor le pone rubro a ${fmtInt(conCausa)} de ${esc(fmtUnitCount(total, unit))}.
          ${esc(`${fmtInt(unidentified.units)} ${unidentified.units === 1 ? 'queda' : 'quedan'}`)} para abrir a mano en Fichas.
        </p>
      ` : ''}
    </section>
  `;
}

// ── 4. "Cómo venía este control" ────────────────────────────────────────────
// Un período por barra, escaladas al mayor, con el umbral punteado. Se compara
// el PORCENTAJE, no la cantidad: la dotación cambia mes a mes y 40 diferencias
// sobre 200 empleados no son las mismas que sobre 800. Un período sin corrida
// **se omite** — no se dibuja en cero, que se leería como "ese mes cerró".
// Sin historia, la card no se renderiza (no una card vacía).

function buildHistoryCardHtml(history, thresholdPct) {
  const points = (history || []).filter(p => p && typeof p.pctDiff === 'number' && Number.isFinite(p.pctDiff));
  if (points.length < 2) return '';

  const max = Math.max(...points.map(p => p.pctDiff), thresholdPct, 1);
  const lastIdx = points.length - 1;
  const actual = points[lastIdx];
  const previo = points[lastIdx - 1];

  // La lectura del bloque, aritmética: de cuánto venía y en cuánto está. El
  // diagnóstico ("parece un parámetro que no se aplicó") lo define Willy sobre
  // casos reales — §7.5 de la spec.
  const subio = actual.pctDiff > previo.pctDiff;
  const lectura = Math.abs(actual.pctDiff - previo.pctDiff) < 0.05
    ? `Venía en ${fmtPct1(previo.pctDiff)} % y sigue igual.`
    : `Venía en ${fmtPct1(previo.pctDiff)} % y ${subio ? 'subió' : 'bajó'} a ${fmtPct1(actual.pctDiff)} %.`;

  return `
    <section class="rsm-card rsm-history">
      <h3 class="rsm-card__title">Cómo venía este control</h3>
      <div class="rsm-history__plot">
        <div class="rsm-history__threshold" style="bottom:${fmtPct2((thresholdPct / max) * 100)}%;">
          <span class="rsm-history__threshold-label">${fmtThreshold(thresholdPct)} %</span>
        </div>
        ${points.map((p, i) => `
          <div class="rsm-history__col">
            <span class="rsm-history__value${i === lastIdx ? ' rsm-history__value--now' : ''}">${fmtPct1(p.pctDiff)}</span>
            <div class="rsm-history__bar rsm-history__bar--${esc(p.tier || 'info')}"
                 style="height:${fmtPct2(Math.max((p.pctDiff / max) * 100, p.pctDiff > 0 ? 3 : 0))}%;"></div>
          </div>
        `).join('')}
      </div>
      <div class="rsm-history__months">
        ${points.map(p => `<span>${esc(periodToShortLabel(p.period))}</span>`).join('')}
      </div>
      <p class="rsm-history__reading">${esc(lectura)}</p>
    </section>
  `;
}

// ── 5. "Por dónde empezar" ──────────────────────────────────────────────────
// Los 5 de mayor |diferencia|, con el signo a la vista, y el link a la ficha de
// cada uno. Nombre y empresa YA VIENEN ESCAPADOS de resumenStats (vienen de un
// Excel de un tercero y se escapan una sola vez, en el helper).

function buildTopUnitsCardHtml(topUnits, unit, controlId, nDiff) {
  if (!Array.isArray(topUnits) || topUnits.length === 0) return '';

  return `
    <section class="rsm-card rsm-top">
      <div class="rsm-card__head">
        <h3 class="rsm-card__title">Por dónde empezar</h3>
        ${controlId && nDiff > 0 ? `
          <button type="button" class="rsm-link" data-hero-detail="${esc(controlId)}" data-hero-prefilter="conDif">
            ${esc(`Ver ${fmtInt(nDiff)} →`)}
          </button>
        ` : ''}
      </div>
      <table class="rsm-top__table">
        <tbody>
          ${topUnits.map(u => `
            <tr>
              <td class="rsm-top__legajo">${u.legajo ?? ''}</td>
              <td class="rsm-top__name">
                ${u.nombre ?? ''}
                ${u.empresa ? `<span class="rsm-top__tag">${u.empresa}</span>` : ''}
              </td>
              <td class="rsm-top__rubro">${u.rubro
                ? u.rubro
                : '<span class="rsm-top__rubro--none">sin identificar</span>'}</td>
              <td class="rsm-top__amount rsm-top__amount--${u.amount < 0 ? 'under' : 'over'}">
                ${u.amount < 0 ? '−' : ''}${formatAmount(Math.abs(u.amount))}
              </td>
              <td class="rsm-top__go">
                ${controlId && u.legajo ? `
                  <button type="button" class="rsm-link" data-hero-detail="${esc(controlId)}"
                          data-hero-tab="fichas" data-hero-search="${u.legajo}">ficha →</button>
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </section>
  `;
}

// ── 3a · el run de un solo control ──────────────────────────────────────────

function buildBoard3a(ctx) {
  const { controlSummaries, mainGroup, thresholdPct, overallTier, totalChecked, historyByControlId, period } = ctx;
  const only = controlSummaries[0] || null;
  const resumen = only?.summary?.resumen || null;
  const unit = only?.summary?.unit ?? mainGroup?.unit ?? null;
  const nDiff = only?.summary?.unitsWithDiff || 0;

  const history = buildHistorySeries(only, historyByControlId, period, thresholdPct);

  const cuts = [
    buildBucketsCardHtml(resumen?.diffBuckets, unit, only?.row?.controlId),
    buildGroupCardHtml(resumen?.byGroup?.empresa, unit, thresholdPct, only?.row?.controlId),
    buildCauseCardHtml(resumen?.byCause, resumen?.unidentifiedCause, unit, only?.row?.controlId),
  ].filter(Boolean);

  const bridge = buildBridgeHtml(resumen?.bridge);
  const sides  = buildSidesHtml(resumen?.diffSigned, unit);
  const historyCard = buildHistoryCardHtml(history, thresholdPct);
  const topCard = buildTopUnitsCardHtml(resumen?.topUnits, unit, only?.row?.controlId, nDiff);

  return `
    <div class="rsm-board rsm-board--single">
      <section class="rsm-verdict rsm-verdict--${esc(overallTier)}">
        <div class="rsm-verdict__main">
          <p class="rsm-verdict__eyebrow">${esc(verdictEyebrow(totalChecked, controlSummaries.length))}</p>
          <h2 class="rsm-verdict__title">${esc(VERDICT_TITLE_3A[overallTier])}</h2>
          <p class="rsm-verdict__subline">${verdict3aSubline(ctx)}</p>
          ${verdictActionsHtml(ctx)}
        </div>
        <div class="rsm-verdict__aside">
          ${buildScaleHtml(mainGroup, thresholdPct)}
          ${kpisHtml(verdictKpis(ctx, { compact: true }))}
        </div>
      </section>
      ${bridge || sides ? `<div class="rsm-row rsm-row--money">${bridge}${sides}</div>` : ''}
      ${cuts.length ? `<div class="rsm-row rsm-row--cuts rsm-row--cuts-${cuts.length}">${cuts.join('')}</div>` : ''}
      ${historyCard || topCard ? `<div class="rsm-row rsm-row--tail">${historyCard}${topCard}</div>` : ''}
    </div>
  `;
}

/** "VEREDICTO · 1 CONTROL EJECUTADO" — el conteo de controles va siempre. */
function verdictEyebrow(totalChecked, totalControls) {
  const n = totalControls;
  return `Veredicto · ${fmtInt(n)} ${n === 1 ? 'control ejecutado' : 'controles ejecutados'}`;
}

/**
 * La bajada de 3a: el conteo de la unidad principal y la comparación contra el
 * umbral. El múltiplo (`pctDiff / thresholdPct`) se muestra sólo si es ≥ 2 y
 * redondeado a entero: abajo de eso "está 1 vez arriba" no dice nada.
 */
function verdict3aSubline(ctx) {
  const { mainGroup, thresholdPct, overallTier, totalChecked, controlSummaries } = ctx;
  if (totalChecked === 0) {
    return 'Esta corrida sólo incluye controles de generación de reporte (sin cruce de diferencias).';
  }
  if (!mainGroup) {
    // El control terminó en error sin unidades que contar (falló el cruce).
    return esc(controlSummaries[0]?.summary?.headline || 'El control no pudo completar el cruce.');
  }

  const total = mainGroup.unitsMax;
  const nDiff = mainGroup.unitsWithDiff;
  const pct   = mainPctDiff(mainGroup);

  if (overallTier === 'ok') {
    return `${esc(fmtUnitCount(total, mainGroup.unit))} `
      + `${esc(fmtParticipio('evaluad', total, mainGroup.unit))}: ninguna diferencia arriba de la tolerancia.`;
  }

  const veces = thresholdPct > 0 ? Math.round(pct / thresholdPct) : null;
  const contraUmbral = veces !== null && veces >= 2
    ? ` El corte de rojo es ${fmtThreshold(thresholdPct)} % de los ${esc(unitNames(mainGroup.unit).many)}: `
      + `este run está <strong>${fmtInt(veces)} veces</strong> arriba.`
    : ` El corte de rojo es ${fmtThreshold(thresholdPct)} % de los ${esc(unitNames(mainGroup.unit).many)}.`;

  return `<strong>${fmtInt(nDiff)}</strong> de <strong>${fmtInt(total)}</strong> `
    + `${esc(unitNames(mainGroup.unit).many)} con diferencia (<strong>${fmtPct1(pct)} %</strong>).`
    + contraUmbral;
}

/**
 * La serie de la evolución: los períodos anteriores que la pantalla ya levantó,
 * más el punto de ESTE run al final. El punto actual se calcula igual que los
 * otros —`unitsWithDiff / unitsTotal`— para que las 6 barras midan lo mismo.
 */
function buildHistorySeries(item, historyByControlId, period, thresholdPct) {
  if (!item) return [];
  const prev = historyByControlId?.[item.row.controlId] || [];
  const total = item.summary.unitsTotal;
  if (total == null || !total) return prev;
  const pctDiff = ((item.summary.unitsWithDiff || 0) / total) * 100;
  return [...prev, { period: period || null, pctDiff, tier: item.tier }];
}

// ── 3b · el run de varios controles ─────────────────────────────────────────

function buildBoard3b(ctx) {
  const { controlSummaries, mainGroup, thresholdPct, overallTier, totalChecked,
          errorCount, warnCount, okCount, prevTierByControlId, historyByControlId,
          reduceMotion, period, totalDiffAmount, totalLegajosCruzados } = ctx;

  const cross = computeCrossControl(controlSummaries, mainGroup?.unit ?? null, thresholdPct);

  // Los KPIs del run: la unidad principal, los tocados por algún rojo (una
  // UNIÓN de claves, jamás una suma de conteos) y la Δ acumulada. El del medio
  // se omite si algún summarize no expone las claves de sus unidades con
  // diferencia — no se aproxima sumando (riesgo 3 del handoff).
  const kpis = [];
  if (totalLegajosCruzados > 0) kpis.push({ value: fmtInt(totalLegajosCruzados), label: 'Legajos cruzados' });
  if (cross.touchedByRed !== null) {
    kpis.push({
      value: fmtInt(cross.touchedByRed),
      label: `${unitNames(mainGroup?.unit).many} tocados por algún rojo`,
      diff: cross.touchedByRed > 0,
    });
  } else if (mainGroup) {
    // Sin claves de unidad no hay unión que calcular, y el número no se
    // aproxima sumando: se muestra el que la pantalla ya sabía decir —las
    // unidades con diferencia de la unidad principal, contra `unitsMax` y nunca
    // contra la suma de los universos de cada control.
    kpis.push({
      value: fmtInt(mainGroup.unitsWithDiff),
      label: `${unitNames(mainGroup.unit).many} con diferencia`,
      diff: mainGroup.unitsWithDiff > 0,
    });
  }
  if (totalDiffAmount > 0) kpis.push({ value: `$ ${formatAmount(totalDiffAmount)}`, label: 'Δ acumulada', diff: true });

  const crossCuts = [
    buildCrossGroupCardHtml(cross.byGroup, mainGroup?.unit ?? null, thresholdPct, controlSummaries.length),
    buildRepeatedUnitsCardHtml(cross.repeatedUnits, mainGroup?.unit ?? null, totalChecked),
  ].filter(Boolean);

  return `
    <div class="rsm-board rsm-board--multi">
      <section class="rsm-verdict rsm-verdict--${esc(overallTier)} rsm-verdict--compact">
        <div class="rsm-verdict__main">
          <p class="rsm-verdict__eyebrow">${esc(verdictEyebrow(totalChecked, controlSummaries.length))}</p>
          <h2 class="rsm-verdict__title rsm-verdict__title--compact">${esc(VERDICT_TITLE_3B[overallTier])}</h2>
          <p class="rsm-verdict__subline">${esc(verdict3bSubline(errorCount, warnCount, okCount, totalChecked))}</p>
        </div>
        <div class="rsm-verdict__strip">
          ${buildSemaforoStripHtml(controlSummaries)}
          <p class="rsm-strip__legend">${esc(semaforoLegend(errorCount, warnCount, okCount))}</p>
        </div>
        <div class="rsm-verdict__aside rsm-verdict__aside--compact">
          ${kpisHtml(kpis)}
          ${verdictActionsHtml(ctx)}
        </div>
      </section>
      <div class="rsm-grid">
        ${buildCtrlCardsHtml(controlSummaries, prevTierByControlId, reduceMotion, { historyByControlId, period, thresholdPct, grid: true })}
      </div>
      ${crossCuts.length ? `<div class="rsm-row rsm-row--cross">${crossCuts.join('')}</div>` : ''}
    </div>
  `;
}

/** "3 controles en rojo bloquean el cierre. Los 2 amarillos se pueden liberar con nota." */
function verdict3bSubline(errorCount, warnCount, okCount, totalChecked) {
  if (totalChecked === 0) {
    return 'Esta corrida sólo incluye controles de generación de reporte (sin cruce de diferencias).';
  }
  if (errorCount === 0 && warnCount === 0) {
    return `Los ${fmtInt(okCount)} controles cerraron sin diferencias arriba de la tolerancia.`;
  }
  const bits = [];
  if (errorCount > 0) {
    bits.push(`${fmtInt(errorCount)} ${errorCount === 1 ? 'control en rojo bloquea' : 'controles en rojo bloquean'} el cierre.`);
  }
  if (warnCount > 0) {
    bits.push(`${errorCount > 0 ? 'Los' : ''} ${fmtInt(warnCount)} ${warnCount === 1 ? 'amarillo se puede' : 'amarillos se pueden'} liberar con nota.`.trim());
  }
  return bits.join(' ');
}

/**
 * La tira de semáforos: un bloque por control, en el orden de severidad que ya
 * traen las tarjetas. A 10+ controles la tira sigue funcionando (los bloques se
 * angostan); el que no entra es el texto, no la tira.
 */
function buildSemaforoStripHtml(controlSummaries) {
  return `
    <div class="rsm-strip" role="img" aria-label="${esc(controlSummaries.map(c => `${c.ctrl.label}: ${TIER_WORD[c.tier]}`).join(' · '))}">
      ${controlSummaries.map(c => `
        <span class="rsm-strip__block rsm-strip__block--${esc(TIER_DOT[c.tier])}"
              title="${esc(`${c.ctrl.label} — ${TIER_WORD[c.tier]}`)}"></span>
      `).join('')}
    </div>
  `;
}

const TIER_WORD = { error: 'rojo', warn: 'amarillo', ok: 'verde', info: 'sin cruce' };

function semaforoLegend(errorCount, warnCount, okCount) {
  const bits = [];
  if (errorCount > 0) bits.push(`${fmtInt(errorCount)} en rojo`);
  if (warnCount  > 0) bits.push(`${fmtInt(warnCount)} en amarillo`);
  if (okCount    > 0) bits.push(`${fmtInt(okCount)} en verde`);
  return bits.join(' · ');
}

// ── Los dos cortes que sólo existen cruzando controles ──────────────────────
//
// `touchedByRed` y "las unidades que aparecen en varios controles" se calculan
// sobre las CLAVES que cada summarize publica en `resumen.unitKeys` — la clave
// del cliente (`makeLegajoKey`), no `trim`. Son uniones de conjuntos: sumar
// conteos contaría cinco veces al mismo legajo y diría que media nómina está en
// juego cuando son 40 empleados.
//
// Sólo entran los controles de la MISMA unidad que el run: un legajo y una
// cuenta contable no son la misma cosa y no hay equivalencia que inventar.

function computeCrossControl(controlSummaries, mainUnit, thresholdPct) {
  const empty = { touchedByRed: null, byGroup: null, repeatedUnits: null };
  if (!mainUnit) return empty;

  const sameUnit = controlSummaries.filter(c => c.summary.unit === mainUnit);
  // Si algún control de la unidad tiene diferencias pero no publica claves, el
  // conjunto queda incompleto y los dos bloques se omiten: mejor sin KPI que
  // con un KPI que miente por abajo.
  const faltanClaves = sameUnit.some(c => (c.summary.unitsWithDiff || 0) > 0 && !c.summary.resumen?.unitKeys);
  if (faltanClaves) return empty;

  const conClaves = sameUnit.filter(c => Array.isArray(c.summary.resumen?.unitKeys));
  if (conClaves.length === 0) return empty;

  // La unión de claves de los controles EN ROJO.
  const rojos = new Set();
  for (const c of conClaves) {
    if (c.tier !== 'error') continue;
    for (const u of c.summary.resumen.unitKeys) rojos.add(u.key);
  }

  // Cuántos controles toca cada clave, con su nombre y su importe acumulado.
  const porClave = new Map();
  for (const c of conClaves) {
    for (const u of c.summary.resumen.unitKeys) {
      const cur = porClave.get(u.key) || { key: u.key, label: null, controls: 0, amount: 0 };
      cur.controls += 1;
      cur.amount += Math.abs(u.amount || 0);
      if (!cur.label && u.label) cur.label = u.label;
      porClave.set(u.key, cur);
    }
  }
  const repeatedUnits = [...porClave.values()]
    .filter(u => u.controls >= 2)
    .sort((a, b) => b.controls - a.controls || b.amount - a.amount)
    .slice(0, 8);

  // El corte por grupo cruzando controles: la unión de claves por grupo (exacta)
  // sobre el total de ese grupo. El total se toma del control que evaluó el
  // universo más grande de ese grupo — nunca la suma entre controles.
  const keysPorGrupo = new Map();
  const totalPorGrupo = new Map();
  for (const c of conClaves) {
    if (c.tier !== 'error') continue;
    for (const u of c.summary.resumen.unitKeys) {
      if (!u.group) continue;
      const set = keysPorGrupo.get(u.group) || new Set();
      set.add(u.key);
      keysPorGrupo.set(u.group, set);
    }
    for (const g of c.summary.resumen?.byGroup?.empresa || []) {
      if (g.unitsTotal == null) continue;
      totalPorGrupo.set(g.key, Math.max(totalPorGrupo.get(g.key) || 0, g.unitsTotal));
    }
  }
  const byGroup = keysPorGrupo.size > 0
    ? [...keysPorGrupo.entries()]
        .map(([key, set]) => ({
          key,
          units: set.size,
          unitsTotal: totalPorGrupo.get(key) ?? null,
          amount: [...set].reduce((s, k) => s + (porClave.get(k)?.amount || 0), 0),
        }))
        .sort((a, b) => b.units - a.units || b.amount - a.amount)
    : null;

  return {
    touchedByRed: rojos.size,
    byGroup,
    repeatedUnits: repeatedUnits.length > 0 ? repeatedUnits : null,
  };
}

function buildCrossGroupCardHtml(groups, unit, thresholdPct, nControls) {
  if (!Array.isArray(groups) || groups.length === 0) return '';
  const maxUnits = groups.reduce((m, g) => Math.max(m, g.units), 0);
  if (maxUnits <= 0) return '';

  return `
    <section class="rsm-card rsm-cut">
      <h3 class="rsm-card__title">${esc(`Cruzando los ${fmtInt(nControls)} controles · dónde se concentra`)}</h3>
      ${groups.map(g => {
        const tier = g.unitsTotal ? computeSemaforoStatus(g.units, g.unitsTotal, thresholdPct) : null;
        const pct  = g.unitsTotal ? (g.units / g.unitsTotal) * 100 : null;
        return `
        <div class="rsm-cut__row">
          <div class="rsm-cut__head">
            <span class="rsm-cut__label rsm-cut__label--strong">${g.key}</span>
            ${pct === null ? '' : `<span class="rsm-cut__value rsm-cut__value--${esc(tier)}">${fmtPct1(pct)} %</span>`}
          </div>
          <div class="rsm-cut__track">
            <div class="rsm-cut__fill" style="width:${fmtPct2((g.units / maxUnits) * 100)}%;"></div>
          </div>
          <div class="rsm-cut__sub">
            ${g.unitsTotal
              ? esc(`${fmtInt(g.units)} de ${fmtUnitCount(g.unitsTotal, unit)} tocados por algún rojo`)
              : esc(`${fmtUnitCount(g.units, unit)} tocados por algún rojo`)}
            · ${formatAmount(g.amount)}
          </div>
        </div>`;
      }).join('')}
    </section>
  `;
}

function buildRepeatedUnitsCardHtml(units, unit, totalChecked) {
  if (!Array.isArray(units) || units.length === 0) return '';
  const names = unitNames(unit);

  return `
    <section class="rsm-card rsm-repeated">
      <h3 class="rsm-card__title">${esc(`${names.many[0].toUpperCase()}${names.many.slice(1)} que aparecen en varios controles`)}</h3>
      <table class="rsm-top__table">
        <tbody>
          ${units.map(u => `
            <tr>
              <td class="rsm-top__legajo">${esc(u.key)}</td>
              <td class="rsm-top__name">${u.label ?? ''}</td>
              <td class="rsm-repeated__badge-cell">
                <span class="rsm-badge rsm-badge--${u.controls >= 3 ? 'error' : 'warn'}">
                  ${esc(`${fmtInt(u.controls)} de ${fmtInt(totalChecked)}`)}
                </span>
              </td>
              <td class="rsm-top__amount rsm-top__amount--over">${formatAmount(u.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="rsm-cut__conclusion">
        ${esc(`Un ${names.one} en varios controles suele ser un dato de ${names.one} mal cargado, no un error distinto por control.`)}
      </p>
    </section>
  `;
}

// ── La grilla de 3b: una tarjeta por control ─────────────────────────────────
//
// Todo control del registry entra a la grilla GRATIS: le alcanza con
// `unitsTotal`/`unitsWithDiff`, que ya son obligatorios. El %, la sparkline y el
// "venía en" se suman cuando hay con qué; sin historia, la sparkline se omite.
//
// **Los verdes no ocupan una card cada uno**: van agrupados en una sola card. Con
// 9 controles eso son 6 cards en vez de 9, y el ojo va sólo a lo que falla.
//
// A1/A4 — la cascada de entrada (stagger capado a 6) y el pulso de mejora
// respecto de la corrida anterior siguen aplicando (ver getPrevTierByControlId).

export function buildCtrlCardsHtml(controlSummaries, prevTierByControlId, reduceMotion, opts = {}) {
  const { historyByControlId = {}, period = null, thresholdPct = DEFAULT_SEMAFORO_THRESHOLD_PCT } = opts;

  const verdes = controlSummaries.filter(c => c.tier === 'ok');
  const resto  = controlSummaries.filter(c => c.tier !== 'ok');

  // Con un solo verde no hay nada que agrupar: la card de grupo tendría una
  // línea y ocuparía lo mismo que la tarjeta.
  const agrupar = verdes.length > 1;
  const cards = (agrupar ? resto : controlSummaries)
    .map((item, i) => buildCtrlCardHtml(item, i, prevTierByControlId, reduceMotion, {
      historyByControlId, period, thresholdPct,
    }));

  if (agrupar) cards.push(buildGreenGroupCardHtml(verdes, cards.length, reduceMotion));
  return cards.join('');
}

function buildCtrlCardHtml(item, index, prevTierByControlId, reduceMotion, opts = {}) {
  const { row, ctrl, summary, tier } = item;
  const { historyByControlId = {}, period = null, thresholdPct } = opts;

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

  const total = summary.unitsTotal || 0;
  const nDiff = summary.unitsWithDiff || 0;
  const hasUnits = summary.unitsTotal != null && total > 0;
  const pct = hasUnits ? (nDiff / total) * 100 : null;

  // Fila 2 — el criterio y el conteo de ESTE control, con SU unidad: en un run
  // mixto la tarjeta del control por centro de costo no puede decir "legajos"
  // sólo porque el veredicto mida legajos.
  let metaHtml;
  if (tier === 'info') {
    metaHtml = esc(summary.headline || 'Sin cruce de diferencias');
  } else {
    const bits = [];
    bits.push(nDiff > 0
      ? `<strong>${esc(`${fmtInt(nDiff)} de ${fmtUnitCount(total, summary.unit)}`)}</strong>`
      : esc(`${fmtUnitCount(total, summary.unit)} ${fmtParticipio('evaluad', total, summary.unit)}, sin diferencias`));
    if (summary.diffTotalAmount > 0) bits.push(formatAmount(summary.diffTotalAmount));
    const note = summary.contextNote
      || (summary.worstCase ? `mayor: ${summary.worstCase.label} ($ ${formatAmount(summary.worstCase.amount)})` : null)
      || summary.headline;
    if (note) bits.push(esc(note));
    metaHtml = bits.join(' · ');
  }

  const names = unitNames(summary.unit);
  const linkText = tier === 'info' ? 'Ver detalle →'
                 : nDiff === 0 ? 'Ver detalle →'
                 : nDiff === 1 ? 'Ver la diferencia →'
                 : `Ver ${names.fem ? 'las' : 'los'} ${fmtInt(nDiff)} →`;

  const history = buildHistorySeries(item, historyByControlId, period, thresholdPct);
  const trend = trendLabel(history);

  return `
    <div class="results-ctrl-card results-ctrl-card--${TIER_DOT[tier]}" style="${animStyle}">
      <div class="results-ctrl-card__row">
        <span class="status-dot status-dot--${TIER_DOT[tier]}${dotPulseClass}" aria-hidden="true"></span>
        <div class="results-ctrl-card__name">${esc(ctrl.label)}</div>
        ${pct === null ? '' : `<span class="results-ctrl-card__pct results-ctrl-card__pct--${TIER_DOT[tier]}">${fmtPct1(pct)} %</span>`}
      </div>
      <div class="results-ctrl-card__meta">${metaHtml}</div>
      ${buildSparklineHtml(history, tier)}
      <div class="results-ctrl-card__foot">
        <span class="results-ctrl-card__trend">${esc(trend)}</span>
        <button type="button" class="rsm-link" data-hero-detail="${esc(row.controlId)}"
                ${nDiff > 0 ? 'data-hero-prefilter="conDif"' : ''}>${esc(linkText)}</button>
      </div>
    </div>
  `;
}

/** "venía en 4,2 %" · "estable" · "" cuando no hay corrida anterior de ese control. */
function trendLabel(history) {
  if (!Array.isArray(history) || history.length < 2) return '';
  const actual = history[history.length - 1];
  const previo = history[history.length - 2];
  if (Math.abs(actual.pctDiff - previo.pctDiff) < 0.05) return 'estable';
  return `venía en ${fmtPct1(previo.pctDiff)} %`;
}

/** La sparkline de la tarjeta: las históricas en gris y la actual en su tier. */
function buildSparklineHtml(history, tier) {
  const points = (history || []).filter(p => p && typeof p.pctDiff === 'number' && Number.isFinite(p.pctDiff));
  if (points.length < 2) return '';
  const max = Math.max(...points.map(p => p.pctDiff), 1);
  const lastIdx = points.length - 1;

  return `
    <div class="results-ctrl-card__spark" aria-hidden="true">
      ${points.map((p, i) => `
        <span class="results-ctrl-card__spark-bar${i === lastIdx ? ` results-ctrl-card__spark-bar--${TIER_DOT[tier]}` : ''}"
              style="height:${fmtPct2(Math.max((p.pctDiff / max) * 100, p.pctDiff > 0 ? 20 : 5))}%;"></span>
      `).join('')}
    </div>
  `;
}

/**
 * Los verdes, en una sola card. El cierre no es decorativo: dice explícitamente
 * que acá no hay nada que revisar, que es lo que el analista necesita leer para
 * no abrirlos uno por uno.
 */
function buildGreenGroupCardHtml(verdes, index, reduceMotion) {
  const animStyle = reduceMotion ? ''
    : `animation: cardIn 0.45s cubic-bezier(.4,0,.2,1) ${Math.min(index, 5) * 0.13}s both;`;

  return `
    <div class="results-ctrl-card results-ctrl-card--group" style="${animStyle}">
      <div class="results-ctrl-card__row">
        <span class="status-dot status-dot--ok" aria-hidden="true"></span>
        <div class="results-ctrl-card__name">${esc(`${fmtInt(verdes.length)} controles en verde`)}</div>
      </div>
      <ul class="results-ctrl-card__list">
        ${verdes.map(c => `
          <li>
            <span class="status-dot status-dot--ok status-dot--sm" aria-hidden="true"></span>
            <span class="results-ctrl-card__list-name">${esc(c.ctrl.label)}</span>
            <span class="results-ctrl-card__list-count">${esc(
              c.summary.unitsTotal == null
                ? '—'
                : `0 de ${fmtInt(c.summary.unitsTotal)}`
            )}</span>
            <button type="button" class="rsm-link" data-hero-detail="${esc(c.row.controlId)}">ver →</button>
          </li>
        `).join('')}
      </ul>
      <p class="results-ctrl-card__group-note">
        Ninguna diferencia arriba de la tolerancia. No hay nada que revisar acá.
      </p>
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

/**
 * El ancho de una barra, en porcentaje, con punto decimal: entra a un
 * `style="width:N%"` y ahí la coma decimal de es-AR rompe la regla (el
 * navegador la descarta y la barra queda en 0). Los números que LEE el analista
 * siguen saliendo por `fmtPct1`.
 */
/**
 * El umbral del semáforo tal como lo escribió el analista: "2 %", no "2,0 %".
 * Es el número que él puso en el panel Umbrales, y con un decimal de más deja
 * de reconocerlo como suyo.
 */
function fmtThreshold(n) {
  const v = Number.isFinite(n) ? n : 0;
  return Number.isInteger(v) ? String(v) : fmtPct1(v);
}

function fmtPct2(n) {
  const v = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
  return v.toFixed(2);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
