// controlsWizard.js — Wizard de ejecución de controles para un cliente
//
// Flujo de 3 pasos:
//   0. Seleccionar controles a ejecutar
//   1. Cargar archivos (Tabulado si hace falta + archivos adicionales de cada control)
//   2. Configurar período, ejecutar y ver resultados (inline, sin navegar)

import {
  getClient,
  createControlRun,
  updateControlRun,
  saveControlRunFile,
  saveControlRunResults,
  getControlConfig,
  saveControlConfig,
  getClientCatalog,
  saveClientCatalog,
  getConfig,
  getGroupers,
  getGrouperConcepts,
  getControlConfigsForClient,
  getRunFileFromPeriod,
} from '../db.js';
import { CATALOGO_SEED } from '../data/catalogoSeed.js';
import { initFileUploadStep, matchLevel, matchSelectStyle, matchBadge } from './fileUpload.js';
import { renderTabuladoAnalysis } from './tabuladoAnalysis.js';
import { CONTROL_REGISTRY }        from '../controls/registry.js';
import { controlAppliesToClient, filterControlsForClient, controlOrigin } from '../controls/scope.js';
import { computeSemaforoStatus, DEFAULT_SEMAFORO_THRESHOLD_PCT } from '../controls/semaforo.js';
import { autoDetectTabMapping }    from '../parsers/tabuladoControl.js';
import { autoDetectCatMapping }    from '../parsers/catEmpleados.js';
import { autoDetectBrutosMapping } from '../parsers/brutosParser.js';
import { autoDetectGsPersMapping } from '../parsers/gsPersParser.js';
import { autoDetectNrMapping }          from '../parsers/nrParser.js';
import { autoDetectRendimientoMapping } from '../parsers/rendimientoParser.js';
import { autoDetectCostoTotalMapping }  from '../parsers/costoTotalParser.js';
import { buildParserMapping }           from '../parsers/conceptMatcher.js';
import { currentPeriod, periodOptions, previousPeriod, periodToLabel } from '../utils/dates.js';
import { renderConceptGroupingEditor }     from './rendVsTabuConceptEditor.js';
import { renderRendVsAsientoConfigEditor, DEFAULT_RVA_CONFIG } from '../controls/rendVsAsiento.js';
import { renderAgrupadoresConfigEditor, DEFAULT_AGRUPADORES_CONFIG } from '../controls/agrupadores.js';
import { renderAcreditacionesConfigEditor, DEFAULT_ACREDITACIONES_CONFIG } from '../controls/acreditaciones.js';
import { renderAcumuladoresConfigEditor, DEFAULT_ACUMULADORES_CONFIG } from '../controls/acumuladoresGanancias.js';
import { showToast, showConfirm }          from './toast.js';
import { renderHelpPopover, CONTROL_HELP }  from './helpPopover.js';

// ── Caché de sesión del Tabulado ─────────────────────────────────────────────
// Evita re-subir el Tabulado entre runs mientras la página esté activa.
// Expira a las 2 horas con aviso 1 minuto antes.

const TAB_SESSION_TTL_MS  = 2 * 60 * 60 * 1000; // 2 horas
const TAB_SESSION_WARN_MS = 60 * 1000;            // aviso 1 min antes de expirar

let _tabSessionCache = null;   // { data, clientId }
let _tabSessionTimer = null;

function setTabSessionCache(data, clientId) {
  clearTabSessionCache();
  _tabSessionCache = { data: { ...data }, clientId };
  _tabSessionTimer = setTimeout(() => {
    showToast('⏳ El Tabulado en memoria expira en 1 minuto y será eliminado por seguridad.', 'warning');
    setTimeout(clearTabSessionCache, TAB_SESSION_WARN_MS);
  }, TAB_SESSION_TTL_MS - TAB_SESSION_WARN_MS);
}

function clearTabSessionCache() {
  if (_tabSessionTimer) { clearTimeout(_tabSessionTimer); _tabSessionTimer = null; }
  _tabSessionCache = null;
}

// Mapa: fileType → función de auto-detección de columnas
const AUTO_DETECT = {
  tab_control:   autoDetectTabMapping,
  cat_empleados: autoDetectCatMapping,
  brutos_file:   autoDetectBrutosMapping,
  gs_pers_file:  autoDetectGsPersMapping,
  nr_file:           autoDetectNrMapping,
  rend_file:         autoDetectRendimientoMapping,
  costo_total_file:  autoDetectCostoTotalMapping,
  // El Tabulado del período anterior es el mismo archivo que el Tabulado.
  tab_prev_file:     autoDetectTabMapping,
};

// IDs de controles agrupados (para validación y detección de grupos seleccionados)
const BRUTOS_IDS  = ['brutos', 'brutos_reporte'];
const GS_PERS_IDS = ['gs_pers', 'gs_pers_reporte'];
const NR_IDS      = ['nr', 'nr_reporte'];
const ACREDITACIONES_IDS = ['acreditaciones_reporte'];
const ACUMULADORES_IDS   = ['acumuladores_ganancias'];
const VARIACIONES_IDS    = ['variaciones_sueldos', 'variaciones_conceptos'];

// Controles que usan la agrupación de conceptos de Rend vs Tabulado
const REND_GROUPING_IDS = ['rend_vs_tabu', 'rend_x_ee'];

export async function renderControlsWizard(root, clientId) {
  const client = await getClient(clientId);
  if (!client) {
    root.innerHTML = `
      <div class="page-content">
        <div class="alert alert--danger">
          Cliente no encontrado. <a href="#/">← Volver</a>
        </div>
      </div>
    `;
    return;
  }

  const [savedBrutosConfig, savedCatalog, savedRendGrouping, savedRvaConfig, savedAgrupadoresConfig, savedAcreditacionesConfig, savedAcumuladoresConfig, groupers, allControlConfigs] = await Promise.all([
    getControlConfig(client.code, 'brutos_tab_config'),
    getClientCatalog(client.code),
    getControlConfig(client.code, 'rendvstabu_concept_grouping'),
    getControlConfig(client.code, 'rva_config'),
    getControlConfig(client.code, 'agrupadores_config'),
    getControlConfig(client.code, 'acreditaciones_config'),
    getControlConfig(client.code, 'acumuladores_config'),
    getGroupers(client.code),
    getControlConfigsForClient(client.code),
  ]);

  // controlConfigs por controlId — se usa para resolver qué controles aplican a
  // este cliente: un `forzado_activo`/`forzado_no_aplica` cargado desde #/admin
  // gana sobre el scope declarado en el registry (ver js/controls/scope.js).
  const controlConfigsByControlId = new Map(
    (allControlConfigs || []).map(cfg => [cfg.controlId, cfg])
  );

  // Pre-cargar tabulado desde caché de sesión si existe y es del mismo cliente
  const cachedTab = (_tabSessionCache?.clientId === Number(clientId))
    ? _tabSessionCache.data
    : null;

  const state = {
    step:             0,
    clientId:         Number(clientId),
    client,
    tab:              cachedTab,
    catalog:          savedCatalog || null,  // { rows, fileName, parseMetadata } | null
    selectedControls: [],
    controlFiles:     {},
    period:           currentPeriod(),
    notes:            '',
    // tabExtraConfig: columnas adicionales del Tabulado para Brutos y GS Pers
    // (se persiste en controlConfigs bajo controlId 'brutos_tab_config' —
    // compartida entre Brutos/GS Pers/NR por compatibilidad histórica).
    tabExtraConfig:            savedBrutosConfig?.params || {},
    tabExtraConfigAutoDetected: false,
    rendVsTabuGrouping:        savedRendGrouping?.params || null,
    // Config del Control 6 (Rendimiento vs Asiento): clasificación CUENTA_CONTAB,
    // conceptos PROV CCSS y redirects de CC. Editable por el usuario en el paso Archivos.
    rvaConfig:                 savedRvaConfig?.params || JSON.parse(JSON.stringify(DEFAULT_RVA_CONFIG)),
    // Agrupadores del cliente + config de "Cruce por Agrupadores" (selección + umbrales,
    // ver agrupadores.js). Se cargan siempre (no sólo si el control está seleccionado),
    // mismo criterio que rvaConfig arriba.
    groupers:                  groupers || [],
    agrupadoresConfig:         savedAgrupadoresConfig?.params || JSON.parse(JSON.stringify(DEFAULT_AGRUPADORES_CONFIG)),
    // Config del reporte de Acreditaciones (Axton): corte por empresa.
    acreditacionesConfig:      savedAcreditacionesConfig?.params || { ...DEFAULT_ACREDITACIONES_CONFIG },
    // Config del reporte de Acumuladores Ganancias (Axton): régimen RG4003/RG4030 + códigos de acumulador.
    acumuladoresConfig:        savedAcumuladoresConfig?.params || JSON.parse(JSON.stringify(DEFAULT_ACUMULADORES_CONFIG)),
    controlConfigsByControlId,

    originFilter:              null,       // label del chip de origen activo en Paso 1 (null = "Todos")
    controlQuery:              '',         // texto del buscador de controles en Paso 1
    lastRunId:                 null,       // runId del último execute exitoso (null si quickRun)
    lastRunResults:            null,       // { [controlId]: results } del último execute exitoso
    lastRunIsDefinitive:       false,      // si el último run está marcado como definitivo
    quickRun:                  false,      // si está marcado, no se guarda nada (modo prueba)
  };

  root.innerHTML = `
    <div class="page-content" style="padding-bottom:80px;">
      <div class="page-actions">
        <div class="page-actions__title">
          <a href="#/" class="btn btn--ghost btn--sm">← Inicio</a>
          <h2 style="margin:0 0 0 var(--sp-3);">Controles — ${esc(client.name)}</h2>
          <span id="js-control-help"></span>
        </div>
      </div>
      <div class="wizard-steps" id="js-wizard-steps" style="margin:var(--sp-3) 0;"></div>
      <div class="card">
        <div class="card__body" id="js-step-content" style="padding:var(--sp-5);"></div>
      </div>
      <div id="js-wizard-nav" style="
        position:sticky;bottom:0;z-index:20;
        display:flex;justify-content:space-between;align-items:center;
        margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);
        background:var(--color-surface);
        border:1px solid var(--color-border);border-radius:var(--radius-md);
        box-shadow:var(--shadow-md);
      "></div>
    </div>
  `;

  // Ayuda "cómo ejecutar un control" — vive en el header, así queda visible en
  // los 3 pasos (el header no se re-renderiza al cambiar de paso).
  renderHelpPopover(root.querySelector('#js-control-help'), CONTROL_HELP);

  render(root, state);
}

// ── Render central ────────────────────────────────────────────────────────────

function render(root, state) {
  // Indicadores de paso
  root.querySelector('#js-wizard-steps').innerHTML = buildStepDots(state.step);

  // Contenido del paso — envuelto en div para animación fade-in
  const content = root.querySelector('#js-step-content');
  content.innerHTML = '';
  const fadeWrap = document.createElement('div');
  fadeWrap.className = 'wizard-step-fade';
  content.appendChild(fadeWrap);
  switch (state.step) {
    case 0: renderStepControls(fadeWrap, state, root); break;
    case 1: renderStepFiles(fadeWrap, state, root);    break;
    case 2: renderStepExecute(fadeWrap, state, root);  break;
  }

  // Botones de navegación
  renderWizardNav(root, state);

  // Atajos de teclado: ← → para moverse entre pasos
  if (state._navController) state._navController.abort();
  state._navController = new AbortController();
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' && canGoNext(state) && state.step < 2) {
      state.step++;
      render(root, state);
    } else if (e.key === 'ArrowLeft' && state.step > 0) {
      if (state.step === 2) state.lastRunResults = null;
      state.step--;
      render(root, state);
    }
  }, { signal: state._navController.signal });
}

function buildStepDots(current) {
  const labels = ['Controles', 'Archivos', 'Ejecutar'];
  return labels.map((lbl, i) => {
    const isDone   = i < current;
    const isActive = i === current;
    const stepClass = isDone ? 'wizard-step--done' : isActive ? 'wizard-step--active' : '';
    const step = `
      <div class="wizard-step ${stepClass}">
        <div class="wizard-step__bubble">${isDone ? '✓' : i + 1}</div>
        <div class="wizard-step__label">${lbl}</div>
      </div>`;
    const connector = i < labels.length - 1
      ? `<div class="wizard-step__connector ${isDone ? 'wizard-step__connector--done' : ''}"></div>`
      : '';
    return step + connector;
  }).join('');
}

function renderWizardNav(root, state) {
  const nav = root.querySelector('#js-wizard-nav');
  const isFirst = state.step === 0;
  const isLast  = state.step === 2;
  const canNext = canGoNext(state);

  // En step 2 con resultados ya mostrados, el prev dice "Reconfigurar"
  const prevLabel = (state.step === 2 && state.lastRunResults) ? '← Reconfigurar' : '← Anterior';
  const hint = !canNext && !isLast ? nextStepHint(state) : '';

  nav.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--sp-3);">
      ${!isFirst
        ? `<button class="btn btn--ghost btn--sm" id="js-prev-btn">${prevLabel}</button>`
        : ''}
      ${!isLast ? `
        <span class="text-muted" style="font-size:11px;display:none;" id="js-kbd-hint">
          <kbd style="padding:1px 5px;border:1px solid var(--color-border);border-radius:3px;background:var(--color-surface);font-family:monospace;font-size:10px;">←</kbd>
          <kbd style="padding:1px 5px;border:1px solid var(--color-border);border-radius:3px;background:var(--color-surface);font-family:monospace;font-size:10px;">→</kbd>
          navegar
        </span>
      ` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:var(--sp-3);">
      ${hint ? `<span class="text-sm text-muted" style="font-style:italic;">${hint}</span>` : ''}
      ${!isLast
        ? `<button class="btn btn--primary" id="js-next-btn" ${canNext ? '' : 'disabled'}>
             Siguiente →
           </button>`
        : ''}
    </div>
  `;

  // Mostrar hint de teclado solo en pantallas anchas (>720px) para no quitar espacio en móvil
  const kbdHint = nav.querySelector('#js-kbd-hint');
  if (kbdHint && window.innerWidth > 720) kbdHint.style.display = 'inline';

  nav.querySelector('#js-prev-btn')?.addEventListener('click', () => {
    // Volver desde resultados → limpiar para forzar nueva ejecución
    if (state.step === 2) state.lastRunResults = null;
    state.step--;
    render(root, state);
  });
  nav.querySelector('#js-next-btn')?.addEventListener('click', () => {
    if (canGoNext(state)) { state.step++; render(root, state); }
  });
}

function nextStepHint(state) {
  switch (state.step) {
    case 0: return 'Seleccioná al menos un control para continuar';
    case 1: return 'Completá los archivos y columnas requeridas';
    default: return '';
  }
}

function canGoNext(state) {
  switch (state.step) {
    case 0:
      return state.selectedControls.length > 0;

    case 1: {
      // Tabulado: requerido si algún control seleccionado lo necesita
      const anyTabRequired = state.selectedControls.some(id => CONTROL_REGISTRY[id]?.tabRequired !== false);
      if (anyTabRequired && state.tab === null) return false;

      // Todos los archivos adicionales no-opcionales deben estar cargados
      const allFiles = state.selectedControls.every(id => {
        const ctrl = CONTROL_REGISTRY[id];
        if (!ctrl) return false;
        return ctrl.additionalFiles.every(f => f.optional || state.controlFiles[id]?.[f.key] != null);
      });
      if (!allFiles) return false;

      const cfg = state.tabExtraConfig;
      const hasBrutos = state.selectedControls.some(id => BRUTOS_IDS.includes(id));
      if (hasBrutos) {
        if (!cfg.tabSalBaseColumn || !cfg.tabACuFutAumenColumn) return false;
      }
      const hasGsPers = state.selectedControls.some(id => GS_PERS_IDS.includes(id));
      if (hasGsPers) {
        if (!cfg.tabGtosPersonalesColumn || !cfg.tabDtoCocheraColumn) return false;
      }

      // Agrupadores: el Resumen puede venir en 2 formatos, ambos declarados como
      // additionalFiles opcionales (ver registry.js) — se exige que llegue al menos uno.
      if (state.selectedControls.includes('agrupadores')) {
        const files = state.controlFiles.agrupadores || {};
        if (!files.resumenLargo && !files.resumenTabulado) return false;
      }

      return true;
    }

    default: return false;
  }
}

// ── Paso 0: Seleccionar controles ─────────────────────────────────────────────

// Construye la sección colapsable "¿Qué hace cada control?" del paso 1.
// Sólo describe los controles que este cliente puede ejecutar — no tiene
// sentido explicarle a un cliente Axton cómo bajar un reporte de M4.
function buildHelpSection(state) {
  const allControls = filterControlsForClient(
    Object.values(CONTROL_REGISTRY), state.client, state.controlConfigsByControlId
  );

  const cards = allControls
    .filter(c => c.help)
    .map(c => {
      const stepsHtml = c.help.how.map((step) =>
        `<li style="margin-bottom:var(--sp-1);">${esc(step)}</li>`
      ).join('');
      return `
        <div style="
          padding: var(--sp-4);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-bg);
          min-width: 200px;
          flex: 1 1 220px;
        ">
          <p style="margin:0 0 var(--sp-2);font-weight:var(--fw-semibold);font-size:var(--text-sm);">
            ${esc(c.label)}
          </p>
          <p style="margin:0 0 var(--sp-3);font-size:var(--text-sm);color:var(--color-wordmark);">
            ${esc(c.help.what)}
          </p>
          <ol style="margin:0;padding-left:var(--sp-5);font-size:var(--text-sm);">
            ${stepsHtml}
          </ol>
        </div>
      `;
    }).join('');

  return `
    <details style="margin-bottom:var(--sp-5);">
      <summary style="
        cursor:pointer;
        font-size:var(--text-sm);
        font-weight:var(--fw-semibold);
        color:var(--color-primary);
        list-style:none;
        display:flex;
        align-items:center;
        gap:var(--sp-2);
        user-select:none;
        margin-bottom:var(--sp-1);
      ">
        <span class="js-help-arrow">▸</span> ¿Qué hace cada control?
      </summary>
      <div style="
        display:flex;
        flex-wrap:wrap;
        gap:var(--sp-3);
        margin-top:var(--sp-4);
        padding:var(--sp-4);
        background:var(--color-surface);
        border:1px solid var(--color-border);
        border-radius:var(--radius-md);
      ">
        ${cards}
      </div>
    </details>
  `;
}

// Lista plana de controles seleccionables para este cliente. Un control con
// modos (Brutos, GS Pers, NR) aporta una fila por modo — el nombre de grupo
// (`group.label`) queda como título y el modo (Controlar/Generar Reporte)
// como badge, en vez del pill-con-expansión que tenía el diseño anterior.
function computeSelectableUnits(state) {
  return Object.values(CONTROL_REGISTRY)
    .filter(ctrl => controlAppliesToClient(ctrl, state.client, state.controlConfigsByControlId.get(ctrl.id)))
    .map(ctrl => ({
      ctrl,
      name:   ctrl.group ? ctrl.group.label : ctrl.label,
      mode:   ctrl.group ? ctrl.group.mode  : null,
      origin: controlOrigin(ctrl, state.client),
    }));
}

// Chips de archivos que un control va a pedir en el Paso 2 — mismo criterio
// que arma esa pantalla (Tabulado si tabRequired, + un chip por additionalFile).
function unitFileChipsHtml(ctrl) {
  const chips = [];
  if (ctrl.tabRequired !== false) {
    chips.push('<span class="control-recap-pill">Tabulado</span>');
  }
  for (const f of ctrl.additionalFiles) {
    // f.label ya incluye "(opcional)" en los additionalFiles que lo son (ver registry.js)
    chips.push(`<span class="control-recap-pill control-recap-pill--muted">${esc(f.label)}</span>`);
  }
  return chips.join('');
}

function renderStepControls(container, state, root) {
  // Sólo los controles que aplican a este cliente. Los que no aplican no se
  // muestran de ninguna forma (decisión de Guillermo, 2026-07-31): la vía para
  // ejecutar uno que el scope excluye es forzarlo desde #/admin con motivo.
  const units = computeSelectableUnits(state);

  // Chips de filtro por origen — sólo los orígenes que efectivamente tiene
  // este cliente (con 1 control general nunca va a aparecer un chip "Meta4").
  const originCounts = new Map();  // label del origen → { tier, count }
  for (const u of units) {
    if (!originCounts.has(u.origin.label)) originCounts.set(u.origin.label, { tier: u.origin.tier, count: 0 });
    originCounts.get(u.origin.label).count++;
  }

  const query = state.controlQuery.trim().toLowerCase();
  const visibleUnits = units.filter(u => {
    if (state.originFilter && u.origin.label !== state.originFilter) return false;
    if (query) {
      const haystack = `${u.name} ${u.mode || ''} ${u.ctrl.description}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const filterChipsHtml = [
    `<button class="ctrl-filter ${!state.originFilter ? 'is-active' : ''}" data-origin-filter="">
       Todos <b>${units.length}</b>
     </button>`,
    ...[...originCounts.entries()].map(([label, { count }]) => `
       <button class="ctrl-filter ${state.originFilter === label ? 'is-active' : ''}" data-origin-filter="${esc(label)}">
         ${esc(label)} <b>${count}</b>
       </button>`),
  ].join('');

  const rowsHtml = visibleUnits.map(u => {
    const isOn = state.selectedControls.includes(u.ctrl.id);
    return `
      <button type="button" class="ctrl-row ${isOn ? 'ctrl-row--active' : ''}"
              data-ctrl="${esc(u.ctrl.id)}" aria-pressed="${isOn}" title="${esc(u.ctrl.description)}">
        <span class="ctrl-row__box" aria-hidden="true">✓</span>
        <span class="ctrl-row__main">
          <span class="ctrl-row__name">
            ${esc(u.name)}
            ${u.mode ? `<span class="ctrl-row__mode">${esc(u.mode)}</span>` : ''}
            <span class="origin-badge origin-badge--${u.origin.tier}">${esc(u.origin.label)}</span>
          </span>
          <span class="ctrl-row__desc">${esc(u.ctrl.description)}</span>
        </span>
        <span class="ctrl-row__files">${unitFileChipsHtml(u.ctrl)}</span>
      </button>`;
  }).join('');

  const selectedUnits = units.filter(u => state.selectedControls.includes(u.ctrl.id));
  const asideSelectedHtml = selectedUnits.length
    ? selectedUnits.map(u => `<span class="control-recap-pill">✓ ${esc(u.name)}${u.mode ? ' · ' + esc(u.mode) : ''}</span>`).join('')
    : '<span class="text-sm text-muted">Ningún control seleccionado.</span>';
  const asideFilesHtml = selectedUnits.length
    ? (selectedUnits.map(u => unitFileChipsHtml(u.ctrl)).join('') || '<span class="text-sm text-muted">Ninguno.</span>')
    : '<span class="text-sm text-muted">—</span>';

  container.innerHTML = `
    <h3 style="margin:0 0 var(--sp-1);">Paso 1 — Controles a ejecutar</h3>
    <p class="text-muted" style="margin:0 0 var(--sp-2);font-size:var(--text-sm);">
      Seleccioná los controles que querés ejecutar. En el siguiente paso se pedirán los archivos necesarios.
    </p>
    ${infoBubble('¿Qué es un control?', `
      <p style="margin:0 0 var(--sp-3);font-weight:var(--fw-semibold);">¿Qué es un control?</p>
      <p style="margin:0 0 var(--sp-3);">
        Cada control es un cruce automático entre el Tabulado y otro archivo del cliente
        (o entre filas del propio Tabulado). El sistema marca las diferencias por empleado
        y devuelve un Excel con el detalle.
      </p>
      <p style="margin:0 0 var(--sp-2);font-weight:var(--fw-semibold);">Ejemplos</p>
      <ul style="margin:0;padding-left:var(--sp-5);line-height:1.6;">
        <li><strong>Brutos:</strong> compara el sueldo del Tabulado con el del reporte de Brutos.</li>
        <li><strong>Rendimiento vs Tabulado:</strong> compara los conceptos del Tabulado con el reporte de Rendimiento por centro de costo.</li>
        <li><strong>Rendimiento vs Asiento:</strong> cruza el Rendimiento contra la Contabilidad Desglosada (no usa Tabulado).</li>
      </ul>
    `)}

    ${buildHelpSection(state)}

    ${units.length ? `
      <div class="ctrl-toolbar">
        ${filterChipsHtml}
        <input type="search" class="ctrl-search" id="js-ctrl-search"
               placeholder="Buscar control…" value="${esc(state.controlQuery)}" aria-label="Buscar control">
        <span style="margin-left:auto;display:flex;gap:var(--sp-2);">
          <button class="btn btn--secondary btn--sm" id="js-select-all-ctrls">✓ Seleccionar todos</button>
          <button class="btn btn--ghost btn--sm" id="js-clear-ctrls">✕ Limpiar</button>
        </span>
      </div>

      <div class="wizard-onepane" style="margin-bottom:var(--sp-3);">
        <div class="wizard-onepane__main">
          <div class="ctrl-rows" id="js-control-rows">
            ${rowsHtml || '<div class="ctrl-rows__empty">Ningún control coincide con la búsqueda.</div>'}
          </div>
        </div>
        <div class="wizard-onepane__side">
          <div>
            <span class="wizard-section-label">Vas a ejecutar (${selectedUnits.length})</span>
            <div class="control-recap-pills">${asideSelectedHtml}</div>
          </div>
          <div>
            <span class="wizard-section-label">Archivos que te van a pedir</span>
            <div class="control-recap-pills">${asideFilesHtml}</div>
            <p class="wizard-section-hint" style="margin-top:var(--sp-2);">Se cargan en el paso siguiente.</p>
          </div>
        </div>
      </div>
    ` : `
      <div class="alert alert--info" style="margin:0;">
        Todavía no hay controles asignados a <strong>${esc(state.client.name)}</strong>.
        <br>
        Los controles se asignan por cliente o por sistema de origen. Si este cliente
        debería poder ejecutar alguno, se habilita desde el modo admin
        (<a href="#/admin">#/admin</a> → Configuración de controles → "Forzado activo").
      </div>
    `}
  `;

  // Chips de filtro por origen
  container.querySelectorAll('[data-origin-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.originFilter = btn.dataset.originFilter || null;
      renderStepControls(container, state, root);
    });
  });

  // Buscador — re-render controlado, con foco y cursor restaurados
  container.querySelector('#js-ctrl-search')?.addEventListener('input', (e) => {
    state.controlQuery = e.target.value;
    renderStepControls(container, state, root);
    const input = container.querySelector('#js-ctrl-search');
    if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  });

  // Botón "Seleccionar todos": selecciona las variantes "Controlar" de los
  // controles que aplican a este cliente (ignora el filtro/búsqueda activos).
  container.querySelector('#js-select-all-ctrls')?.addEventListener('click', () => {
    const allControlarIds = units
      .filter(u => !u.ctrl.group || u.ctrl.group.mode === 'Controlar')
      .map(u => u.ctrl.id);
    state.selectedControls = [...allControlarIds];
    state.controlFiles = {};
    for (const id of allControlarIds) state.controlFiles[id] = {};
    renderStepControls(container, state, root);
    renderWizardNav(root, state);
  });

  // Botón "Limpiar selección"
  container.querySelector('#js-clear-ctrls')?.addEventListener('click', () => {
    state.selectedControls = [];
    state.controlFiles = {};
    renderStepControls(container, state, root);
    renderWizardNav(root, state);
  });

  // Click en una fila: activa/desactiva ese control
  container.querySelectorAll('[data-ctrl]').forEach(row => {
    row.addEventListener('click', () => {
      const id  = row.dataset.ctrl;
      const idx = state.selectedControls.indexOf(id);
      if (idx >= 0) {
        state.selectedControls.splice(idx, 1);
        delete state.controlFiles[id];
      } else {
        state.selectedControls.push(id);
        state.controlFiles[id] = {};
      }
      renderStepControls(container, state, root);
      renderWizardNav(root, state);
    });
  });
}

// ── Paso 1: Cargar todos los archivos ─────────────────────────────────────────

// Panel lateral del paso Archivos: recap de los controles elegidos en el paso
// anterior (de sólo lectura acá) + vista previa de "Umbrales". Los umbrales
// todavía son fijos (no configurables) — ver README del rediseño.
function buildWizardSidebarHtml(state) {
  const selectedLabels = state.selectedControls
    .map(id => CONTROL_REGISTRY[id]?.label)
    .filter(Boolean);
  const pillsHtml = selectedLabels.length
    ? selectedLabels.map(l => `<span class="control-recap-pill">✓ ${esc(l)}</span>`).join('')
    : '<span class="text-sm text-muted">Ningún control seleccionado.</span>';

  return `
    <div>
      <span class="wizard-section-label">Controles a ejecutar</span>
      <div class="control-recap-pills">${pillsHtml}</div>
      <p class="wizard-section-hint" style="margin-top:var(--sp-2);">Elegidos en el paso anterior — usá "← Anterior" para cambiarlos.</p>
    </div>
    <div>
      <span class="wizard-section-label">Umbrales</span>
      <div class="threshold-grid">
        <div>
          <span class="threshold-field__label">Dif. absoluta &gt;</span>
          <div class="threshold-field__value">$ 1,00</div>
        </div>
        <div>
          <span class="threshold-field__label">Dif. porcentual &gt;</span>
          <div class="threshold-field__value">0,1 %</div>
        </div>
      </div>
      <div class="threshold-checkbox-static">
        <span class="threshold-checkbox-static__box">✓</span>
        Marcar legajos presentes en un archivo y ausentes en el otro
      </div>
      <p class="threshold-note">Vista previa — todavía no se pueden editar estos valores desde acá.</p>
    </div>
  `;
}

function renderStepFiles(container, state, root) {
  const anyTabRequired = state.selectedControls.some(
    id => CONTROL_REGISTRY[id]?.tabRequired !== false
  );

  const catMeta = state.catalog?.parseMetadata;
  const catSummary = state.catalog
    ? `✅ <strong>${esc(state.catalog.fileName)}</strong> — ${catMeta?.totalRows ?? 0} conceptos cargados`
    : `📂 Sin catálogo cargado — se usará el catálogo estándar (${CATALOGO_SEED.length} conceptos).`;

  container.innerHTML = `
    <h3 style="margin:0 0 var(--sp-1);">Paso 2 — Archivos</h3>
    <p class="text-muted" style="margin:0 0 var(--sp-4);font-size:var(--text-sm);">
      Cargá los archivos necesarios para los controles seleccionados.
    </p>

    <div class="wizard-onepane">
      <div class="wizard-onepane__files">
        ${anyTabRequired ? `
          <details style="margin-bottom:var(--sp-3);" ${state.catalog ? '' : 'open'}>
            <summary style="
              cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);
              color:var(--color-primary);list-style:none;display:flex;align-items:center;
              gap:var(--sp-2);user-select:none;margin-bottom:var(--sp-1);
            ">
              <span>▸</span> Catálogo de Conceptos (opcional)
            </summary>
            <div style="margin-top:var(--sp-2);padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
              <p class="text-sm text-muted" style="margin:0 0 var(--sp-2);">
                El catálogo define qué columnas del Tabulado corresponden a cada concepto. Si no cargás uno, se usa el catálogo estándar.
              </p>
              <div id="js-catalog-status" style="margin-bottom:var(--sp-2);">
                <div class="alert ${state.catalog ? 'alert--success' : 'alert--info'}" style="margin:0;padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">
                  ${catSummary}
                </div>
              </div>
              <div id="js-catalog-upload" style="${state.catalog ? 'display:none' : ''}"></div>
              ${state.catalog ? `<button class="btn btn--ghost btn--sm" id="js-catalog-replace">↺ Reemplazar catálogo</button>` : ''}
            </div>
          </details>

          <div id="js-tab-upload"></div>
          <div id="js-tab-analysis"></div>
        ` : ''}

        <div id="js-control-files"></div>
      </div>
      <div class="wizard-onepane__side">
        ${buildWizardSidebarHtml(state)}
      </div>
    </div>
  `;

  // ── Tabulado + catálogo ──────────────────────────────────────────────────────
  if (anyTabRequired) {
    const catalogUploadEl = container.querySelector('#js-catalog-upload');
    const analysisEl      = container.querySelector('#js-tab-analysis');
    const catalogRows     = state.catalog?.rows || CATALOGO_SEED;

    if (catalogUploadEl) {
      initFileUploadStep(catalogUploadEl, {
        clientCode:  state.client.code,
        fileType:    'concept_catalog',
        existingData: null,
        onComplete:  async (data) => {
          state.catalog = { rows: data.rows, fileName: data.fileName, parseMetadata: data.parseMetadata };
          await saveClientCatalog(state.client.code, state.catalog);
          renderStepFiles(container, state, root);
        },
      });
    }

    container.querySelector('#js-catalog-replace')?.addEventListener('click', async () => {
      if (!await showConfirm('¿Reemplazar el catálogo guardado? Se perderá el catálogo actual.')) return;
      const statusEl = container.querySelector('#js-catalog-status');
      const uploadEl = container.querySelector('#js-catalog-upload');
      statusEl.innerHTML = '<div class="alert alert--info" style="margin:0;">Cargá el nuevo catálogo:</div>';
      uploadEl.style.display = '';
      container.querySelector('#js-catalog-replace')?.remove();
      initFileUploadStep(uploadEl, {
        clientCode:  state.client.code,
        fileType:    'concept_catalog',
        existingData: null,
        onComplete:  async (data) => {
          state.catalog = { rows: data.rows, fileName: data.fileName, parseMetadata: data.parseMetadata };
          await saveClientCatalog(state.client.code, state.catalog);
          renderStepFiles(container, state, root);
        },
      });
    });

    if (state.tab) {
      renderTabuladoAnalysis(analysisEl, state.tab, catalogRows, state.selectedControls);
    }

    initFileUploadStep(container.querySelector('#js-tab-upload'), {
      clientCode:  state.client.code,
      fileType:    'tab_control',
      existingData: state.tab,
      autoDetect:  AUTO_DETECT.tab_control,
      onComplete:  (data) => {
        const prev = state.tab;
        state.tab = data;
        setTabSessionCache(data, state.clientId);
        renderWizardNav(root, state);
        renderTabuladoAnalysis(analysisEl, state.tab, catalogRows, state.selectedControls);
        // Tabulado nuevo (no re-entrante) → re-renderizar el step completo para que el
        // panel "Columnas del Tabulado" (Brutos/GS Pers/NR) recalcule tabHeaders con las
        // columnas ya disponibles. Sin esto, ese panel quedaba armado con tabHeaders=[]
        // (calculado antes de que existiera el Tabulado) y sus selects nunca mostraban
        // ninguna columna para elegir. Guard de identidad: renderAlreadyLoaded llama a
        // onComplete de forma sincrónica al re-mostrar un archivo ya cargado — sin este
        // chequeo, el re-render volvería a dispararlo y entraría en bucle infinito.
        if (prev !== data) {
          renderStepFiles(container, state, root);
        }
      },
    });
  }

  // ── Archivos adicionales por control ────────────────────────────────────────
  const filesArea = container.querySelector('#js-control-files');

  for (const controlId of state.selectedControls) {
    const ctrl = CONTROL_REGISTRY[controlId];
    if (!ctrl) continue;

    for (const fileSpec of ctrl.additionalFiles) {
      const wrapper = document.createElement('div');
      wrapper.style.marginBottom = 'var(--sp-3)';
      wrapper.innerHTML = `
        <h4 style="margin:0 0 var(--sp-2);font-size:var(--text-base);">
          ${esc(ctrl.label)} — ${esc(fileSpec.label)}
        </h4>
      `;
      const uploadDiv = document.createElement('div');
      wrapper.appendChild(uploadDiv);
      filesArea.appendChild(wrapper);

      const baseDetect = AUTO_DETECT[fileSpec.fileType];
      const catalogRows = state.catalog?.rows || CATALOGO_SEED;
      const autoDetect = baseDetect
        ? (headers) => baseDetect(headers, catalogRows)
        : null;

      initFileUploadStep(uploadDiv, {
        clientCode:  state.client.code,
        fileType:    fileSpec.fileType,
        existingData: state.controlFiles[controlId]?.[fileSpec.key] || null,
        autoDetect,
        onComplete:  (data) => {
          if (!state.controlFiles[controlId]) state.controlFiles[controlId] = {};
          const prev = state.controlFiles[controlId][fileSpec.key];
          state.controlFiles[controlId][fileSpec.key] = data;
          renderWizardNav(root, state);
          // CONTA recién cargado → re-renderizar el step para que el editor de
          // rend_vs_asiento muestre los nombres de cuentas/conceptos al lado de cada código.
          // Guard de identidad: renderAlreadyLoaded llama a onComplete de forma sincrónica
          // al re-mostrar un archivo ya cargado. Sin este chequeo, el re-render volvería a
          // inicializar la carga de CONTA y dispararía onComplete otra vez → bucle re-entrante
          // que rompía/ocultaba el panel de mapeo. Solo re-renderizamos si la CONTA es nueva.
          if (controlId === 'rend_vs_asiento' && fileSpec.key === 'conta' && prev !== data) {
            renderStepFiles(container, state, root);
          }
        },
      });
    }

    // Editor de configuración de Rendimiento vs Asiento (visible junto a sus archivos)
    if (controlId === 'rend_vs_asiento') {
      const mapWrapper = document.createElement('div');
      mapWrapper.style.marginBottom = 'var(--sp-3)';
      filesArea.appendChild(mapWrapper);

      // Construir lookups a partir del CONTA si está cargado
      const contaData = state.controlFiles[controlId]?.conta;
      const accountNames = {};
      const conceptNames = {};
      for (const r of (contaData?.parsedRows || [])) {
        const cc = String(r.cuenta_contab || '').trim();
        const cn = String(r.n_cuenta_contable || '').trim();
        if (cc && cn && !accountNames[cc]) accountNames[cc] = cn;
        const co = String(r.id_concepto || '').trim();
        const nl = String(r.nombre_largo || '').trim();
        if (co && nl && !conceptNames[co]) conceptNames[co] = nl;
      }

      renderRendVsAsientoConfigEditor(mapWrapper, {
        config:       state.rvaConfig,
        accountNames,
        conceptNames,
        openByDefault: true,
        onChange:     (newConfig) => { state.rvaConfig = newConfig; },
      });
    }

    // Opciones del reporte de Acreditaciones (corte por empresa)
    if (ACREDITACIONES_IDS.includes(controlId)) {
      const cfgWrapper = document.createElement('div');
      cfgWrapper.style.marginBottom = 'var(--sp-3)';
      filesArea.appendChild(cfgWrapper);

      renderAcreditacionesConfigEditor(cfgWrapper, {
        config:        state.acreditacionesConfig,
        openByDefault: false,
        onChange:      (newConfig) => { state.acreditacionesConfig = newConfig; },
      });
    }

    // Opciones del reporte de Acumuladores Ganancias (régimen + códigos de acumulador)
    if (ACUMULADORES_IDS.includes(controlId)) {
      const cfgWrapper = document.createElement('div');
      cfgWrapper.style.marginBottom = 'var(--sp-3)';
      filesArea.appendChild(cfgWrapper);

      renderAcumuladoresConfigEditor(cfgWrapper, {
        config:        state.acumuladoresConfig,
        openByDefault: true,
        onChange:      (newConfig) => { state.acumuladoresConfig = newConfig; },
      });
    }

    // Editor de "Agrupadores y umbrales" del Cruce por Agrupadores
    if (controlId === 'agrupadores') {
      const cfgWrapper = document.createElement('div');
      cfgWrapper.style.marginBottom = 'var(--sp-3)';
      filesArea.appendChild(cfgWrapper);

      renderAgrupadoresConfigEditor(cfgWrapper, {
        config:        state.agrupadoresConfig,
        groupers:      state.groupers,
        clientId:      state.clientId,
        openByDefault: true,
        onChange:      (newConfig) => { state.agrupadoresConfig = newConfig; renderWizardNav(root, state); },
      });
    }
  }

  // ── Panel de configuración de columnas del Tabulado ─────────────────────────
  const hasBrutos    = state.selectedControls.some(id => BRUTOS_IDS.includes(id));
  const hasGsPers    = state.selectedControls.some(id => GS_PERS_IDS.includes(id));
  const hasNr        = state.selectedControls.some(id => NR_IDS.includes(id));
  const hasRendGrouping = state.selectedControls.some(id => REND_GROUPING_IDS.includes(id));

  if (hasBrutos || hasGsPers || hasNr) {
    renderTabExtraConfig(filesArea, state, root, { hasBrutos, hasGsPers, hasNr });
  }

  if (hasRendGrouping && state.tab?.parsedRows?.length > 0) {
    const editorDiv = document.createElement('div');
    filesArea.appendChild(editorDiv);
    renderConceptGroupingEditor(
      editorDiv,
      state.tab.parsedRows,
      state.rendVsTabuGrouping,
      (newGrouping) => { state.rendVsTabuGrouping = newGrouping; }
    );
  }
}

// ── Configuración de columnas del Tabulado para Brutos / GS Pers ────────────

const TAB_SHARED_FIELDS = [
  { key: 'tabNombreColumn',      label: 'Columna NOMBRE',     required: false },
  { key: 'tabApellido1Column',   label: 'Columna APELLIDO_1', required: false },
  { key: 'tabFecAltaColumn',     label: 'Columna FECHA_ALTA', required: false },
  { key: 'tabFecBajaColumn',     label: 'Columna FECHA_BAJA', required: false },
  { key: 'tabFecPagoColumn',     label: 'Columna FEC_PAGO',   required: false },
];

const TAB_BRUTOS_FIELDS = [
  { key: 'tabSalBaseColumn',     label: 'Sueldo — columna en Tabulado',          required: true },
  { key: 'tabACuFutAumenColumn', label: 'A_CTA_FUT_AUMEN — columna en Tabulado', required: true },
];

const TAB_GS_PERS_FIELDS = [
  { key: 'tabGtosPersonalesColumn', label: 'GTOS_PERSONALES — columna en Tabulado', required: true },
  { key: 'tabDtoCocheraColumn',     label: 'DTO_COCHERA — columna en Tabulado',      required: true },
];

const TAB_NR_INDEM_FIELDS = [
  { key: 'tabIndemPreavisoColumn',  label: 'INDEM_PREAVISO — columna en Tabulado',  required: false },
  { key: 'tabSacPreavisoColumn',    label: 'SAC_PREAVISO — columna en Tabulado',    required: false },
  { key: 'tabIndemAntDespColumn',   label: 'INDEM_ANT_DESP — columna en Tabulado',  required: false },
  { key: 'tabIndemAntFalleColumn',  label: 'INDEM_ANT_FALLE — columna en Tabulado', required: false },
  { key: 'tabIndemIntegColumn',     label: 'INDEM_INTEG — columna en Tabulado',     required: false },
  { key: 'tabSacIndemIntegColumn',  label: 'SAC_INDEM_INTEG — columna en Tabulado', required: false },
  { key: 'tabIndmMaternidadColumn', label: 'INDM_MATERNIDAD — columna en Tabulado', required: false },
  { key: 'tabVacNoGozadasColumn',   label: 'VAC_NO_GOZADAS — columna en Tabulado',  required: false },
  { key: 'tabVacNoGozSacColumn',    label: 'VAC_NO_GOZ_SAC — columna en Tabulado',  required: false },
  { key: 'tabGratVacColumn',        label: 'GRAT_VAC — columna en Tabulado',        required: false },
  { key: 'tabGraVacnogSacColumn',   label: 'GRA_VACNOG_SAC — columna en Tabulado',  required: false },
  { key: 'tabIndemFuerMayColumn',   label: 'INDEM_FUER_MAY — columna en Tabulado',  required: false },
  { key: 'tabIndemEmbarazoColumn',  label: 'INDEM_EMBARAZO — columna en Tabulado',  required: false },
];

const TAB_NR_OTROS_FIELDS = [
  { key: 'tabReinHomeOficeColumn',  label: 'REIN_HOME_OFICE — columna en Tabulado', required: false },
  { key: 'tabGratExtraordColumn',   label: 'GRAT_EXTRAORD — columna en Tabulado',   required: false },
  { key: 'tabAsigPasColumn',        label: 'ASIG_PAS — columna en Tabulado',        required: false },
  { key: 'tabReintGuardColumn',     label: 'REINT_GUARD — columna en Tabulado',     required: false },
  { key: 'tabIncrementoStColumn',   label: 'INCREMENTO_ST — columna en Tabulado',   required: false },
];

// Mapa CODIGO del catálogo → clave del tabExtraConfig (con prefijo "tab")
const TAB_EXTRA_CODIGO_TO_KEY = {
  'SAL_BASE':        'tabSalBaseColumn',
  'A_CTA_FUT_AUMEN': 'tabACuFutAumenColumn',
  'GTOS_PERSONALES': 'tabGtosPersonalesColumn',
  'DTO_COCHERA':     'tabDtoCocheraColumn',
  'INDEM_PREAVISO':  'tabIndemPreavisoColumn',
  'SAC_PREAVISO':    'tabSacPreavisoColumn',
  'INDEM_ANT_DESP':  'tabIndemAntDespColumn',
  'INDEM_ANT_FALLE': 'tabIndemAntFalleColumn',
  'INDEM_INTEG':     'tabIndemIntegColumn',
  'SAC_INDEM_INTEG': 'tabSacIndemIntegColumn',
  'INDM_MATERNIDAD': 'tabIndmMaternidadColumn',
  'VAC_NO_GOZADAS':  'tabVacNoGozadasColumn',
  'VAC_NO_GOZ_SAC':  'tabVacNoGozSacColumn',
  'GRAT_VAC':        'tabGratVacColumn',
  'GRA_VACNOG_SAC':  'tabGraVacnogSacColumn',
  'INDEM_FUER_MAY':  'tabIndemFuerMayColumn',
  'INDEM_EMBARAZO':  'tabIndemEmbarazoColumn',
  'REIN_HOME_OFICE': 'tabReinHomeOficeColumn',
  'GRAT_EXTRAORD':   'tabGratExtraordColumn',
  'ASIG_PAS':        'tabAsigPasColumn',
  'REINT_GUARD':     'tabReintGuardColumn',
  'INCREMENTO_ST':   'tabIncrementoStColumn',
};

function autoDetectTabExtraConfig(tabHeaders, catalogRows) {
  const catalog = catalogRows || CATALOGO_SEED;
  const lc = h => String(h).toLowerCase();
  const find = (...kws) => tabHeaders.find(h => kws.some(kw => lc(h).includes(lc(kw)))) || '';

  const nombre   = find('nombre');
  const apellido = find('apellido');
  const idCentroTrab = find('id_centro_trab', 'centro_trab');
  const idCategoria  = find('id_categoria', 'categoria');

  const conceptMapping = buildParserMapping(tabHeaders, catalog, TAB_EXTRA_CODIGO_TO_KEY);

  return {
    ...conceptMapping,
    tabNombreColumn:      (nombre && nombre !== apellido) ? nombre : '',
    tabApellido1Column:   (apellido && apellido !== nombre) ? apellido : '',
    tabFecAltaColumn:     find('fecha_alta', 'fec_alta', 'f_alta', 'alta'),
    tabFecBajaColumn:     find('fecha_baja', 'fec_baja', 'f_baja', 'baja'),
    tabFecPagoColumn:     find('fec_pago', 'fecha_pago', 'pago'),
    tabIdCentroTrabColumn: idCentroTrab,
    tabIdCategoriaColumn:  idCategoria,
  };
}

function renderTabExtraConfig(container, state, root, { hasBrutos, hasGsPers, hasNr }) {
  const tabHeaders = state.tab?.parsedRows?.length > 0
    ? Object.keys(state.tab.parsedRows[0])
    : [];

  const catalogRows = state.catalog?.rows || CATALOGO_SEED;

  if (tabHeaders.length > 0) {
    const detected = autoDetectTabExtraConfig(tabHeaders, catalogRows);
    let anyNew = false;
    for (const [k, v] of Object.entries(detected)) {
      if (v && !state.tabExtraConfig[k]) {
        state.tabExtraConfig[k] = v;
        anyNew = true;
      }
    }
    if (anyNew) state.tabExtraConfigAutoDetected = true;
  }

  const hasSavedConfig = Object.values(state.tabExtraConfig).some(Boolean);
  const autoDetected   = state.tabExtraConfigAutoDetected;

  const fields = [
    ...(hasBrutos ? TAB_BRUTOS_FIELDS  : []),
    ...(hasGsPers ? TAB_GS_PERS_FIELDS : []),
    ...(hasNr ? [
      { groupHeader: 'Indemnizatorios' },
      ...TAB_NR_INDEM_FIELDS,
      { groupHeader: 'Otros NR' },
      ...TAB_NR_OTROS_FIELDS,
    ] : []),
    ...TAB_SHARED_FIELDS,
  ];

  const parts = [
    hasBrutos && 'Brutos',
    hasGsPers && 'GS Pers',
    hasNr     && 'Control NR',
  ].filter(Boolean);
  const headerTitle = parts.join(' / ');

  const opts = (selected = '') =>
    ['', ...tabHeaders]
      .map(h => `<option value="${esc(h)}" ${h === selected ? 'selected' : ''}>${esc(h) || '— Sin asignar —'}</option>`)
      .join('');

  const panel = document.createElement('div');
  panel.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';
  panel.innerHTML = `
    <h4 style="margin:0 0 var(--sp-1);font-size:var(--text-base);">Columnas del Tabulado — ${esc(headerTitle)}</h4>
    ${autoDetected
      ? `<p class="text-sm" style="margin:0 0 var(--sp-2);color:var(--color-match-exact);">🤖 Se detectaron las columnas automáticamente — verificá que sean correctas.</p>`
      : `<p class="text-muted" style="margin:0 0 var(--sp-3);font-size:var(--text-sm);">Indicá qué columna del Tabulado corresponde a cada campo. FECHA_INI y FECHA_FIN se calculan del período.</p>`
    }
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--sp-3);">
      ${fields.map(f => {
        if (f.groupHeader) {
          return `
            <div style="grid-column:1/-1;margin-top:var(--sp-2);padding-bottom:var(--sp-1);border-bottom:1px solid var(--color-border);">
              <span style="font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-wordmark);">${esc(f.groupHeader)}</span>
            </div>
          `;
        }
        const val   = state.tabExtraConfig[f.key] || '';
        const level = matchLevel(val, { autoDetected, hasSavedMapping: hasSavedConfig });
        const style = matchSelectStyle(level);
        const badge = matchBadge(level);
        return `
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label ${f.required ? 'form-label--required' : ''}">
              ${esc(f.label)}${badge}
            </label>
            <select class="form-select" data-tab-extra-key="${esc(f.key)}"${style ? ` style="${style}"` : ''}>
              ${opts(val)}
            </select>
          </div>
        `;
      }).join('')}
    </div>
  `;

  panel.querySelectorAll('[data-tab-extra-key]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const k = sel.dataset.tabExtraKey;
      if (sel.value) state.tabExtraConfig[k] = sel.value;
      else delete state.tabExtraConfig[k];
      renderWizardNav(root, state);
      // Guardar inmediatamente para no perder la config si no se ejecuta el control
      if (Object.keys(state.tabExtraConfig).length > 0) {
        await saveControlConfig(state.client.code, 'brutos_tab_config', { params: state.tabExtraConfig }).catch(() => {});
      }
    });
  });

  container.appendChild(panel);
}

// ── Paso 2: Configurar período y ejecutar ────────────────────────────────────

function renderStepExecute(container, state, root) {
  // Modo resultados: ya se ejecutó, mostrar inline
  if (state.lastRunResults) {
    renderInlineResults(container, state, root);
    return;
  }

  // Modo pre-ejecución
  const periods  = periodOptions(13);
  const ctrlList = state.selectedControls
    .map(id => CONTROL_REGISTRY[id]?.label || id)
    .join(', ');

  const filesInfo = state.selectedControls.flatMap(id => {
    const ctrl = CONTROL_REGISTRY[id];
    if (!ctrl) return [];
    return ctrl.additionalFiles.map(f => {
      const fd = state.controlFiles[id]?.[f.key];
      if (!fd) return `<strong>${esc(f.label)}:</strong> —`;
      const count = fd.parseMetadata?.activos ?? fd.parseMetadata?.totalRows ?? '?';
      return `<strong>${esc(f.label)}:</strong> ${esc(fd.fileName)} (${count} registros)`;
    });
  }).join('<br>');

  container.innerHTML = `
    <h3 style="margin:0 0 var(--sp-3);">Paso 3 — Período y ejecución</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-3);margin-bottom:var(--sp-3);max-width:680px;">
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label form-label--required">Período</label>
        <select class="form-select" id="js-period-select">
          ${periods.map(p =>
            `<option value="${esc(p.value)}" ${p.value === state.period ? 'selected' : ''}>${esc(p.label)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Notas (opcional)</label>
        <input type="text" class="form-input" id="js-notes-input"
               value="${esc(state.notes)}"
               placeholder="Observaciones del analista...">
      </div>
    </div>
    <div class="alert alert--info" style="margin-bottom:var(--sp-3);">
      <strong>Cliente:</strong> ${esc(state.client.name)}<br>
      <strong>Controles:</strong> ${esc(ctrlList)}<br>
      <strong>Tabulado:</strong> ${esc(state.tab?.fileName || '—')} (${state.tab?.parseMetadata?.totalRows ?? 0} registros)<br>
      ${filesInfo}
    </div>

    <label style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-3);cursor:pointer;padding:var(--sp-2) var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);max-width:680px;">
      <input type="checkbox" id="js-quick-run" ${state.quickRun ? 'checked' : ''}>
      <div>
        <strong>⚡ Ejecución rápida</strong> — no guarda nada en el historial
        <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Útil para probar mapeos o configuraciones sin que este run aparezca después en el checklist o en la lista de runs.</p>
      </div>
    </label>

    <button class="btn btn--primary btn--lg btn--pill" id="js-execute-btn">${esc(executeCtaLabel(state))}</button>
    <p class="text-sm text-muted" style="text-align:center;margin-top:var(--sp-2);">Sin salir de esta pantalla</p>
    <div id="js-execute-status" style="margin-top:var(--sp-5);"></div>
  `;

  container.querySelector('#js-period-select').addEventListener('change', e => {
    state.period = e.target.value;
  });
  container.querySelector('#js-notes-input').addEventListener('input', e => {
    state.notes = e.target.value;
  });
  container.querySelector('#js-quick-run').addEventListener('change', e => {
    state.quickRun = e.target.checked;
  });
  container.querySelector('#js-execute-btn').addEventListener('click', () => {
    container.querySelector('#js-execute-btn').disabled = true;
    executeControls(state, container.querySelector('#js-execute-status'), container, root);
  });
}

function renderInlineResults(container, state, root) {
  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--sp-3);">
      <div>
        <h3 style="margin:0 0 var(--sp-1);">${esc(state.client.name)} — Controles ${esc(state.period)}</h3>
        <p class="text-muted" style="margin:0;font-size:var(--text-sm);">Ejecutado el ${new Date().toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</p>
      </div>
      <button class="btn btn--ghost btn--sm" id="js-rerun-btn">↺ Ejecutar de nuevo</button>
    </div>

    <div id="js-status-banner" style="margin-bottom:var(--sp-4);"></div>
    <div id="js-inline-results"></div>
  `;

  renderStatusBanner(container.querySelector('#js-status-banner'), state);

  const resultsContainer = container.querySelector('#js-inline-results');

  // Cascada A1: errores primero (orden calculado al ejecutar, ver executeControls),
  // stagger capado a 6 tarjetas — de la 7ma en adelante entran todas juntas.
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const order = state.lastRunTierOrder?.length ? state.lastRunTierOrder : state.selectedControls;

  order.forEach((controlId, i) => {
    const ctrl = CONTROL_REGISTRY[controlId];
    if (!ctrl || !state.lastRunResults[controlId]) return;

    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = 'var(--sp-5)';
    if (!reduceMotion) {
      wrapper.classList.add('anim-card-in');
      wrapper.style.animationDelay = `${Math.min(i, 5) * 0.13}s`;
    }
    resultsContainer.appendChild(wrapper);
    ctrl.renderResults(state.lastRunResults[controlId], wrapper);
  });

  container.querySelector('#js-rerun-btn').addEventListener('click', () => {
    state.lastRunResults = null;
    state.lastRunId = null;
    state.lastRunIsDefinitive = false;
    renderStepExecute(container, state, root);
    renderWizardNav(root, state);
  });
}

/**
 * Banner de estado del run (Quick / Borrador / Definitivo) con toggle.
 */
function renderStatusBanner(bannerEl, state) {
  if (!bannerEl) return;

  // Modo Quick: no se guardó nada
  if (state.lastRunId == null) {
    bannerEl.innerHTML = `
      <div style="padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);display:flex;align-items:center;gap:var(--sp-3);">
        <span style="font-size:1.4em;">⚡</span>
        <div style="flex:1;">
          <strong>Ejecución rápida</strong> — este run no se guardó.
          <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Los resultados están sólo en pantalla. Si cerrás la página se pierden.</p>
        </div>
      </div>
    `;
    return;
  }

  // Modo guardado: Borrador o Definitivo
  const isDef = state.lastRunIsDefinitive === true;
  const icon  = isDef ? '✅' : '📝';
  const title = isDef ? 'Definitivo' : 'Borrador';
  const desc  = isDef
    ? 'Este run aparece en el checklist mensual.'
    : 'Este run no aparece en el checklist hasta que lo marques como definitivo.';
  const btnLabel = isDef ? '↩ Volver a borrador' : '📌 Marcar como definitivo';
  const borderCol = isDef ? 'var(--color-match-exact, #00a651)' : 'var(--color-border)';
  const bgCol = isDef ? 'rgba(0,166,81,0.06)' : 'var(--color-surface)';

  bannerEl.innerHTML = `
    <div style="padding:var(--sp-3) var(--sp-4);border:1px solid ${borderCol};border-radius:var(--radius-md);background:${bgCol};display:flex;align-items:center;gap:var(--sp-3);">
      <span style="font-size:1.4em;">${icon}</span>
      <div style="flex:1;">
        <strong>${title}</strong>
        <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">${desc}</p>
      </div>
      <button class="btn ${isDef ? 'btn--ghost' : 'btn--primary'} btn--sm" id="js-toggle-definitive">${btnLabel}</button>
    </div>
  `;

  bannerEl.querySelector('#js-toggle-definitive').addEventListener('click', async () => {
    const newValue = !state.lastRunIsDefinitive;
    try {
      await updateControlRun(state.lastRunId, { isDefinitive: newValue });
      state.lastRunIsDefinitive = newValue;
      renderStatusBanner(bannerEl, state);
      showToast(newValue ? '✅ Marcado como definitivo' : '↩ Vuelto a borrador', 'success');
    } catch (err) {
      showToast(`Error: ${err.message}`, 'danger');
    }
  });
}

// ── Ejecución ─────────────────────────────────────────────────────────────────

// A1 — Procesamiento de la corrida: barra de progreso + checklist de 3 pasos
// atados a hitos reales del pipeline (lectura → cruce → umbrales), no a un
// timer fake. Ver design_handoff_rediseno_controles/README.md §Animaciones.
const EXEC_BAR_WIDTHS = ['6%', '38%', '70%', '100%'];
const EXEC_TIER_RANK  = { error: 0, warn: 1, ok: 2, info: 3 };

async function executeControls(state, statusEl, container, root) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => (reduceMotion ? Promise.resolve() : new Promise(r => setTimeout(r, ms)));

  const quickRun = state.quickRun === true;
  const tab = state.tab;
  const nCtrl = state.selectedControls.length;
  const totalLegajos = tab?.parseMetadata?.totalRows ?? null;

  const uniqueFileNames = [...new Set([tab?.fileName, ...state.selectedControls.flatMap(id => {
    const ctrl = CONTROL_REGISTRY[id];
    return ctrl ? ctrl.additionalFiles.map(f => state.controlFiles[id]?.[f.key]?.fileName) : [];
  })].filter(Boolean))];

  // thresholdPct sólo afecta el texto del paso 3 — se completa después de la
  // primera pintura para que la barra aparezca al instante del clic (sin await antes).
  let thresholdPct = DEFAULT_SEMAFORO_THRESHOLD_PCT;

  const execSteps = [
    {
      label: `Leyendo ${uniqueFileNames.length} archivo${uniqueFileNames.length === 1 ? '' : 's'} Excel`,
      note: uniqueFileNames.join(' · ') || '—',
    },
    {
      label: totalLegajos ? `Cruzando ${totalLegajos.toLocaleString('es-AR')} legajos` : 'Cruzando legajos',
      note: `${nCtrl} control${nCtrl === 1 ? '' : 'es'}`,
    },
    {
      label: 'Aplicando umbrales y semáforos',
      get note() { return `verde 0% · amarillo ≤${thresholdPct}% · rojo >${thresholdPct}%`; },
    },
  ];

  let stepsDone = 0; // cantidad de pasos del checklist ya completados (0..3)

  function renderProgress() {
    statusEl.innerHTML = `
      <div class="exec-progress"><div class="exec-progress__fill" style="width:${EXEC_BAR_WIDTHS[stepsDone]};"></div></div>
      <div class="exec-steps">
        ${execSteps.map((s, i) => {
          const done   = stepsDone > i;
          const active = stepsDone === i;
          return `
            <div class="exec-step">
              <span class="exec-step__dot ${done ? 'exec-step__dot--done' : active ? 'exec-step__dot--active' : ''}">${done ? '✓' : ''}</span>
              <span class="exec-step__label ${done || active ? 'exec-step__label--done' : ''}">${esc(s.label)}</span>
              <span class="exec-step__note">${esc(s.note)}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderProgress();

  try {
    thresholdPct = (await getConfig('semaforoThresholdPct')) ?? DEFAULT_SEMAFORO_THRESHOLD_PCT;

    // ── Paso 1 · Leyendo archivos ────────────────────────────────────────────
    // Las preferencias del usuario (mapeos de columnas) se guardan siempre,
    // sean borrador o quick — son configuración que el usuario reusa.
    const needsTabExtra = state.selectedControls.some(id =>
      BRUTOS_IDS.includes(id) || GS_PERS_IDS.includes(id) || NR_IDS.includes(id)
    );
    if (needsTabExtra && Object.keys(state.tabExtraConfig).length > 0) {
      await saveControlConfig(state.client.code, 'brutos_tab_config', { params: state.tabExtraConfig });
    }
    if (state.selectedControls.some(id => REND_GROUPING_IDS.includes(id)) && state.rendVsTabuGrouping) {
      await saveControlConfig(state.client.code, 'rendvstabu_concept_grouping', { params: state.rendVsTabuGrouping });
    }
    if (state.selectedControls.includes('rend_vs_asiento') && state.rvaConfig) {
      await saveControlConfig(state.client.code, 'rva_config', { params: state.rvaConfig });
    }
    if (state.selectedControls.includes('agrupadores') && state.agrupadoresConfig) {
      await saveControlConfig(state.client.code, 'agrupadores_config', { params: state.agrupadoresConfig });
    }
    if (state.selectedControls.some(id => ACREDITACIONES_IDS.includes(id)) && state.acreditacionesConfig) {
      await saveControlConfig(state.client.code, 'acreditaciones_config', { params: state.acreditacionesConfig });
    }
    if (state.selectedControls.some(id => ACUMULADORES_IDS.includes(id)) && state.acumuladoresConfig) {
      await saveControlConfig(state.client.code, 'acumuladores_config', { params: state.acumuladoresConfig });
    }

    // El run en sí se crea sólo si NO es quickRun
    let runId = null;
    if (!quickRun) {
      runId = await createControlRun(
        state.client.code, state.period, state.selectedControls, state.notes
      );
      if (tab) {
        await saveControlRunFile(
          runId, 'tab_control', tab.fileName, tab.parsedRows, tab.parseMetadata, tab.mapping
        );
      }
      for (const controlId of state.selectedControls) {
        const ctrl = CONTROL_REGISTRY[controlId];
        if (!ctrl) continue;
        for (const fileSpec of ctrl.additionalFiles) {
          const fileData = state.controlFiles[controlId]?.[fileSpec.key];
          if (fileData) {
            await saveControlRunFile(
              runId, fileSpec.fileType,
              fileData.fileName, fileData.parsedRows, fileData.parseMetadata, fileData.mapping
            );
          }
        }
      }
    }

    stepsDone = 1; renderProgress(); await wait(220);

    // ── Paso 2 · Cruzando legajos ────────────────────────────────────────────
    const runResults = {};

    for (const controlId of state.selectedControls) {
      const ctrl = CONTROL_REGISTRY[controlId];
      if (!ctrl) continue;

      const mapping = {
        tab:    { ...(tab?.mapping || {}), ...state.tabExtraConfig },
        period: state.period,
      };
      if ((REND_GROUPING_IDS.includes(controlId) || controlId === 'rend_vs_asiento') && state.rendVsTabuGrouping) {
        mapping.conceptGrouping = state.rendVsTabuGrouping;
      }
      if (controlId === 'rend_vs_asiento' && state.rvaConfig) {
        mapping.rvaConfig = state.rvaConfig;
      }
      if (ACREDITACIONES_IDS.includes(controlId)) {
        mapping.acreditacionesConfig = state.acreditacionesConfig || { ...DEFAULT_ACREDITACIONES_CONFIG };
      }
      if (ACUMULADORES_IDS.includes(controlId)) {
        mapping.acumuladoresConfig = state.acumuladoresConfig || { ...DEFAULT_ACUMULADORES_CONFIG };
      }
      if (controlId === 'agrupadores') {
        const cfg           = state.agrupadoresConfig || {};
        const allGroupers   = state.groupers || [];
        const selectedIds   = cfg.selectedGrouperIds ?? allGroupers.map(g => g.id);
        const grouperDefs   = allGroupers.filter(g => selectedIds.includes(g.id));
        const grouperConceptsMap = {};
        for (const g of grouperDefs) {
          const concepts = await getGrouperConcepts(g.id);
          grouperConceptsMap[g.id] = concepts.map(c => c.conceptCode);
        }
        mapping.grouperDefs        = grouperDefs;
        mapping.grouperConceptsMap = grouperConceptsMap;
        mapping.agrupadoresConfig  = cfg;
      }
      for (const fileSpec of ctrl.additionalFiles) {
        const fileData = state.controlFiles[controlId]?.[fileSpec.key];
        if (fileData) {
          mapping[fileSpec.key]         = fileData.mapping || {};
          mapping[`${fileSpec.key}Rows`] = fileData.parsedRows || [];
        }
      }

      // Variaciones compara el Tabulado del período actual contra el del período
      // anterior. Si ese Tabulado ya quedó cargado en la corrida del mes anterior
      // del mismo cliente, se reusa y el analista no tiene que volver a subirlo;
      // si no está, el control pide el archivo (additionalFiles) y avisa.
      if (VARIACIONES_IDS.includes(controlId)) {
        const subido = state.controlFiles[controlId]?.tab_prev;
        if (subido?.parsedRows?.length) {
          // El propio archivo dice a qué período corresponde (encabezado del Tabulado).
          mapping.variacionesPrevFilePeriod = subido.parseMetadata?.period || null;
        } else {
          const prevPeriod = previousPeriod(state.period);
          const prevFile   = await getRunFileFromPeriod(state.client?.code, prevPeriod, 'tab_control');
          if (prevFile) {
            mapping.variacionesPrev = { period: prevPeriod, rows: prevFile.parsedRows };
          }
        }
      }

      const tabRows     = tab?.parsedRows || [];
      const primaryKey  = ctrl.additionalFiles[0]?.key;
      const primaryRows = state.controlFiles[controlId]?.[primaryKey]?.parsedRows || [];

      runResults[controlId] = ctrl.run(primaryRows, tabRows, mapping);
    }

    stepsDone = 2; renderProgress(); await wait(220);

    // ── Paso 3 · Aplicando umbrales y semáforos ──────────────────────────────
    // Calcula el tier (error/warn/ok) de cada control para ordenar la cascada
    // de tarjetas errores-primero (ver renderInlineResults) y persiste resultados.
    const tierOrder = state.selectedControls
      .map(controlId => {
        const ctrl = CONTROL_REGISTRY[controlId];
        const summary = ctrl?.summarize ? ctrl.summarize(runResults[controlId]) : null;
        const tier = !summary ? 'info'
          : summary.status === 'error' ? 'error'
          : summary.unitsTotal == null ? 'info'
          : computeSemaforoStatus(summary.unitsWithDiff, summary.unitsTotal, thresholdPct);
        return { controlId, tier };
      })
      .sort((a, b) => EXEC_TIER_RANK[a.tier] - EXEC_TIER_RANK[b.tier])
      .map(t => t.controlId);

    if (!quickRun) {
      for (const controlId of state.selectedControls) {
        if (runResults[controlId] !== undefined) {
          await saveControlRunResults(runId, controlId, runResults[controlId]);
        }
      }
    }

    stepsDone = 3; renderProgress(); await wait(180);

    // Al terminar, navegar al hero de resultados 1b (gauge + semáforo + cascada
    // errores-primero, animaciones A2/A3/A4). Ver handoff §Interactions: "mostrar
    // progreso... navegar al hero 1b al terminar".
    // Sólo posible con run guardado (el hero lee todo de la DB por runId).
    if (runId != null) {
      window.location.hash = `#/control-results/${runId}`;
      return;
    }

    // Ejecución rápida: no hay run persistido para navegar, así que mostramos los
    // resultados inline (cascada errores-primero) y el banner avisa que no se guardó.
    state.lastRunId            = runId;
    state.lastRunResults       = runResults;
    state.lastRunIsDefinitive  = false;
    state.lastRunTierOrder     = tierOrder;
    renderInlineResults(container, state, root);
    renderWizardNav(root, state);

  } catch (err) {
    console.error('[controlsWizard] Error al ejecutar:', err);
    statusEl.innerHTML = `
      <div class="alert alert--danger" style="margin-bottom:0;">
        ❌ Error al ejecutar los controles: ${esc(err.message)}
      </div>
    `;
    const execBtn = statusEl.parentElement?.querySelector('#js-execute-btn');
    if (execBtn) execBtn.disabled = false;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// El botón de ejecutar dice exactamente qué va a pasar (cuántos controles,
// sobre cuántos legajos) — se recalcula en vivo según la selección.
function executeCtaLabel(state) {
  const n = state.selectedControls.length;
  const nCtrlTxt = `${n} control${n === 1 ? '' : 'es'}`;
  const totalLegajos = state.tab?.parseMetadata?.totalRows;
  return totalLegajos
    ? `▶ Ejecutar ${nCtrlTxt} sobre ${totalLegajos.toLocaleString('es-AR')} legajos`
    : `▶ Ejecutar ${nCtrlTxt}`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function infoBubble(label, contentHtml, { mb = 3 } = {}) {
  return `
    <details style="margin-bottom:var(--sp-${mb});">
      <summary style="
        cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:var(--sp-2);
        padding:var(--sp-1) var(--sp-3);font-size:var(--text-sm);font-weight:var(--fw-semibold);
        color:var(--color-primary);background:var(--color-surface);
        border:1px solid var(--color-border);border-radius:var(--radius-full);
        user-select:none;transition:background var(--transition);
      ">
        <span style="
          display:inline-flex;align-items:center;justify-content:center;
          width:18px;height:18px;border-radius:50%;
          background:var(--color-primary);color:var(--color-white);
          font-size:11px;font-weight:var(--fw-bold);
        ">i</span>
        ${esc(label)}
      </summary>
      <div style="
        margin-top:var(--sp-2);padding:var(--sp-4);
        background:var(--color-surface);
        border:1px solid var(--color-border);border-radius:var(--radius-md);
        box-shadow:var(--shadow-md);font-size:var(--text-sm);
        color:var(--color-text);
      ">
        ${contentHtml}
      </div>
    </details>
  `;
}
