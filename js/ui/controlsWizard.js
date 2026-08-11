// controlsWizard.js — Wizard de ejecución de controles para un cliente
//
// Flujo de 3 pasos:
//   0. Seleccionar controles a ejecutar
//   1. Cargar archivos (Tabulado si hace falta + archivos adicionales de cada control)
//   2. Configurar período, ejecutar y ver resultados (inline, sin navegar)

import {
  getClient,
  createControlRun,
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
import {
  VARIACIONES_IDS,
  hayVariaciones,
  conceptosDeControles,
  estadoInicial as estadoInicialConceptos,
  sinResolverEnNinguno,
  aColumnasDelControl,
  renderConceptMap,
} from './variacionesConceptMap.js';
import { nombreCoincideConMetadata } from '../parsers/tabuladoHtml.js';
import { showToast, showConfirm }          from './toast.js';
import { renderHelpPopover, CONTROL_HELP }  from './helpPopover.js';
import { renderResultsContextBar, setCompactHeader } from './resultsHeader.js';

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
// VARIACIONES_IDS se importa de ./variacionesConceptMap.js — lo comparten el
// wizard y el panel de mapeo de conceptos.

/**
 * Metadata que el propio Tabulado declara en su encabezado (período, quincena,
 * tipo de liquidación, empresa) más lo que hace falta para validar los totales.
 * Es lo que el control de Variaciones usa para ordenar los dos archivos.
 */
function metadataDeTabulado(fileData) {
  const m = fileData?.parseMetadata || {};
  return {
    period:          m.period ?? null,
    quincena:        m.quincena ?? null,
    tipoLiquidacion: m.tipoLiquidacion ?? null,
    empresa:         m.empresa ?? null,
    headers:         m.headers ?? null,
    totalRow:        m.totalRow ?? null,
    totalRowOffset:  m.totalRowOffset ?? 0,
  };
}

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

  const [savedBrutosConfig, savedCatalog, savedRendGrouping, savedRvaConfig, savedAgrupadoresConfig, savedAcreditacionesConfig, savedAcumuladoresConfig, savedVariacionesConfig, groupers, allControlConfigs] = await Promise.all([
    getControlConfig(client.code, 'brutos_tab_config'),
    getClientCatalog(client.code),
    getControlConfig(client.code, 'rendvstabu_concept_grouping'),
    getControlConfig(client.code, 'rva_config'),
    getControlConfig(client.code, 'agrupadores_config'),
    getControlConfig(client.code, 'acreditaciones_config'),
    getControlConfig(client.code, 'acumuladores_config'),
    getControlConfig(client.code, 'variaciones_config'),
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
    // Config del control de Variaciones (POF): qué conceptos compara cada reporte
    // y qué códigos cuentan como causa de ausencia. Sin config guardada, el
    // control cae a la semilla de variaciones.js. La UI para editar la lista
    // todavía no existe — ver ROADMAP.md.
    variacionesConfig:         savedVariacionesConfig?.params || null,
    // Mapeo confirmado de concepto → columna, por archivo. Lo llena el panel
    // "Conceptos a comparar" del Paso 2 (ver variacionesConceptMap.js).
    variacionesMap:            null,
    controlConfigsByControlId,

    originFilter:              null,       // label del chip de origen activo en Paso 1 (null = "Todos")
    controlQuery:              '',         // texto del buscador de controles en Paso 1
    lastRunId:                 null,       // runId del último execute exitoso (null si quickRun)
    lastRunResults:            null,       // { [controlId]: results } del último execute exitoso
    lastRunIsDefinitive:       false,      // si el último run está marcado como definitivo
    quickRun:                  false,      // si está marcado, no se guarda nada (modo prueba)
  };

  mountWizardShell(root, client);
  render(root, state);
}

// Shell del wizard (page-actions + wizard-steps + card + nav) — se remonta
// cada vez que se vuelve de la pantalla de resultados (1C, sólo 2 barras
// sticky, sin este shell) a un paso normal. Ver render().
function mountWizardShell(root, client) {
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
  root.dataset.wizardView = 'steps';

  // Ayuda "cómo ejecutar un control" — vive en el header, así queda visible en
  // los 3 pasos (el header no se re-renderiza al cambiar de paso).
  renderHelpPopover(root.querySelector('#js-control-help'), CONTROL_HELP);
}

// ── Render central ────────────────────────────────────────────────────────────

function render(root, state) {
  const showResultsPage = state.step === 2 && !!state.lastRunResults;

  // Cabecera comprimida (1C): sólo en el paso 3 con resultados ya mostrados
  // (siempre un run rápido — ver executeControls, que navega a #/control-results
  // apenas hay runId). Cualquier otro paso usa el app-header normal.
  setCompactHeader(showResultsPage);

  // Pantalla de resultados (1C): dos barras sticky, sin el shell del wizard
  // (page-actions/wizard-steps/card/nav) — mismo criterio que controlsResults.js.
  if (showResultsPage) {
    if (root.dataset.wizardView !== 'results') {
      root.innerHTML = `
        <div id="js-results-ctx-bar"></div>
        <div class="page-content"><div id="js-inline-results-page"></div></div>
      `;
      root.dataset.wizardView = 'results';
    }
    renderInlineResults(root.querySelector('#js-inline-results-page'), state, root);
    return;
  }

  // Volviendo de la pantalla de resultados a un paso normal: remontar el shell.
  if (root.dataset.wizardView === 'results') {
    mountWizardShell(root, state.client);
  }

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

  // Con resultados ya mostrados, render() muestra la cabecera 1C en vez de
  // este nav — este bloque sólo corre en modo pre-ejecución (ver showResultsPage).
  const prevLabel = '← Anterior';
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

      // Variaciones: bloquea sólo si un concepto no se resolvió en NINGUNO de
      // los dos Tabulados. Que falte de un solo lado es legítimo por diseño
      // (p. ej. "Jornales" nunca va a aparecer en un Tabulado de
      // mensualizados) y no es una decisión pendiente — se computa 0,00 y sale
      // como aviso en resultados. Pero si no se resolvió en los dos lados a la
      // vez, sí es una decisión pendiente (o un mapeo roto) y no puede pasar
      // en silencio: ver `sinResolverEnNinguno`.
      if (hayVariaciones(state.selectedControls)) {
        if (!state.variacionesMap) return false;
        const grupos = conceptosDeControles(state.selectedControls, state.variacionesConfig);
        if (sinResolverEnNinguno(grupos, state.variacionesMap).length > 0) return false;
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
// Implementa Opción C: descripción truncada a 2 líneas + botón "Ver más".
function buildHelpSection(state) {
  const allControls = filterControlsForClient(
    Object.values(CONTROL_REGISTRY), state.client, state.controlConfigsByControlId
  );

  const cards = allControls
    .filter(c => c.help)
    .map((c, idx) => {
      const descId = `help-desc-${idx}`;
      const toggleId = `help-toggle-${idx}`;
      return `
        <div style="
          padding: var(--sp-2) var(--sp-3);
          border-left: 3px solid var(--color-primary);
          background: var(--color-surface);
          border-radius: var(--radius-sm);
        ">
          <p style="margin:0 0 var(--sp-1);font-weight:var(--fw-semibold);font-size:var(--text-xs);">
            ${esc(c.label)}
          </p>
          <p id="${descId}" style="
            margin:0;
            font-size:var(--text-xs);
            color:var(--color-wordmark);
            line-height:1.4;
            overflow:hidden;
            display:-webkit-box;
            -webkit-line-clamp:2;
            -webkit-box-orient:vertical;
            word-break:break-word;
          ">
            ${esc(c.help.what)}
          </p>
          <button id="${toggleId}" type="button" style="
            background:none;
            border:none;
            color:var(--color-primary);
            cursor:pointer;
            font-size:var(--text-xs);
            font-weight:var(--fw-semibold);
            padding:var(--sp-1) 0 0;
            display:none;
          " onclick="toggleHelpDesc('${descId}', '${toggleId}')">
            Ver más ▼
          </button>
        </div>
      `;
    }).join('');

  return `
    <details style="margin-bottom:0;">
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
        margin-bottom:var(--sp-2);
      ">
        <span class="js-help-arrow">▸</span> ¿Qué hace cada control?
      </summary>
      <div style="
        display:flex;
        flex-direction:column;
        gap:var(--sp-3);
        margin-top:var(--sp-2);
      ">
        ${cards}
      </div>
    </details>
  `;
}

// Toggle para expandir/contraer descripción truncada en la sección de ayuda
function toggleHelpDesc(descId, toggleId) {
  const desc = document.getElementById(descId);
  const btn = document.getElementById(toggleId);
  if (!desc || !btn) return;

  const isExpanded = desc.style.webkitLineClamp === 'unset';
  if (isExpanded) {
    desc.style.webkitLineClamp = '2';
    btn.textContent = 'Ver más ▼';
  } else {
    desc.style.webkitLineClamp = 'unset';
    btn.textContent = 'Ver menos ▲';
  }
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
          <div style="margin-top:var(--sp-5);border-top:1px solid var(--color-border);padding-top:var(--sp-4);">
            ${buildHelpSection(state)}
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

  // Detectar si las descripciones de ayuda están siendo truncadas y mostrar botón
  // "Ver más" solo en esos casos
  container.querySelectorAll('[id^="help-desc-"]').forEach(desc => {
    setTimeout(() => {
      const isTruncated = desc.scrollHeight > desc.clientHeight;
      const toggleBtn = document.getElementById(desc.id.replace('help-desc-', 'help-toggle-'));
      if (toggleBtn) {
        toggleBtn.style.display = isTruncated ? 'block' : 'none';
      }
    }, 0);
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

  // Variaciones compara dos Tabulados: los dos slots van lado a lado, siempre
  // anterior → actual, y el Catálogo de Conceptos no aplica (sirve para
  // matchear conceptos por nombre contra un catálogo; acá el mapeo es directo,
  // archivo por archivo, en el panel "Conceptos a comparar").
  const esVariaciones = hayVariaciones(state.selectedControls);
  const mostrarCatalogo = anyTabRequired && !esVariaciones;

  container.innerHTML = `
    <h3 style="margin:0 0 var(--sp-1);">Paso 2 — Archivos</h3>
    <p class="text-muted" style="margin:0 0 var(--sp-4);font-size:var(--text-sm);">
      ${esVariaciones
        ? 'Cargá los dos Tabulados. El período y la quincena de cada uno salen del propio archivo.'
        : 'Cargá los archivos necesarios para los controles seleccionados.'}
    </p>

    <div class="wizard-onepane">
      <div class="wizard-onepane__files">
        ${mostrarCatalogo ? `
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
        ` : ''}

        ${esVariaciones ? `
          <div class="varfiles">
            <div class="varfiles__slot">
              <h4>Tabulado del período anterior</h4>
              <div id="js-var-prev-upload"></div>
              <div id="js-var-prev-meta"></div>
            </div>
            <div class="varfiles__slot">
              <h4>Tabulado del período actual</h4>
              <div id="js-tab-upload"></div>
              <div id="js-var-act-meta"></div>
            </div>
          </div>
          <div id="js-tab-analysis"></div>
          <div id="js-var-conceptmap" style="margin-bottom:var(--sp-3);"></div>
        ` : (anyTabRequired ? `
          <div id="js-tab-upload"></div>
          <div id="js-tab-analysis"></div>
        ` : '')}

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

  // Un `fileSpec` con `shared: true` se pide UNA sola vez aunque lo declaren
  // varios controles seleccionados: es literalmente el mismo archivo (el
  // Tabulado del período anterior que comparten los dos controles de
  // Variaciones). El resultado se espeja en cada control, así el resto del
  // wizard —`canGoNext`, el armado del mapping, la persistencia— no cambia.
  const compartidosMontados = new Set();

  for (const controlId of state.selectedControls) {
    const ctrl = CONTROL_REGISTRY[controlId];
    if (!ctrl) continue;

    for (const fileSpec of ctrl.additionalFiles) {
      if (fileSpec.shared) {
        if (compartidosMontados.has(fileSpec.fileType)) continue;
        compartidosMontados.add(fileSpec.fileType);
      }

      // El Tabulado del período anterior tiene su propio hueco en la grilla de
      // 2 columnas, arriba; el resto de los archivos va en la lista de abajo.
      const slotVariaciones = esVariaciones && fileSpec.fileType === 'tab_prev_file'
        ? container.querySelector('#js-var-prev-upload')
        : null;

      let uploadDiv;
      if (slotVariaciones) {
        uploadDiv = slotVariaciones;
      } else {
        const wrapper = document.createElement('div');
        wrapper.style.marginBottom = 'var(--sp-3)';
        wrapper.innerHTML = `
          <h4 style="margin:0 0 var(--sp-2);font-size:var(--text-base);">
            ${esc(ctrl.label)} — ${esc(fileSpec.label)}
          </h4>
        `;
        uploadDiv = document.createElement('div');
        wrapper.appendChild(uploadDiv);
        filesArea.appendChild(wrapper);
      }

      const baseDetect = AUTO_DETECT[fileSpec.fileType];
      const catalogRows = state.catalog?.rows || CATALOGO_SEED;
      const autoDetect = baseDetect
        ? (headers) => baseDetect(headers, catalogRows)
        : null;

      // Controles que comparten este archivo — se les espeja el resultado.
      const destinos = fileSpec.shared
        ? state.selectedControls.filter(id =>
            (CONTROL_REGISTRY[id]?.additionalFiles || []).some(f => f.fileType === fileSpec.fileType && f.shared))
        : [controlId];

      initFileUploadStep(uploadDiv, {
        clientCode:  state.client.code,
        fileType:    fileSpec.fileType,
        existingData: state.controlFiles[controlId]?.[fileSpec.key] || null,
        autoDetect,
        onComplete:  (data) => {
          const prev = state.controlFiles[controlId]?.[fileSpec.key];
          for (const destino of destinos) {
            if (!state.controlFiles[destino]) state.controlFiles[destino] = {};
            state.controlFiles[destino][fileSpec.key] = data;
          }
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
          // El Tabulado anterior recién cargado cambia los encabezados que ofrece
          // el panel de conceptos — hay que rearmarlo con los del archivo nuevo.
          if (esVariaciones && fileSpec.fileType === 'tab_prev_file' && prev !== data) {
            renderStepFiles(container, state, root);
          }
        },
      });
    }

    // El panel de conceptos de Variaciones se monta una sola vez, fuera del loop
    // (lo comparten los dos controles). Ver más abajo.

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

  // ── Variaciones: metadata de cada archivo + panel de conceptos ──────────────
  if (esVariaciones) {
    const prevData = state.controlFiles[state.selectedControls.find(id => VARIACIONES_IDS.includes(id))]?.tab_prev;
    renderMetadataTabulado(container.querySelector('#js-var-prev-meta'), prevData);
    renderMetadataTabulado(container.querySelector('#js-var-act-meta'), state.tab);

    const mapHost = container.querySelector('#js-var-conceptmap');
    const headersAnterior = prevData?.headers || [];
    const headersActual   = state.tab?.headers || [];

    if (mapHost && headersAnterior.length > 0 && headersActual.length > 0) {
      const grupos = conceptosDeControles(state.selectedControls, state.variacionesConfig);
      // El estado se rearma cuando cambian los archivos (otros encabezados), pero
      // se conserva lo ya confirmado como precarga — así cambiar un archivo no
      // obliga a volver a mapear todo.
      state.variacionesMap = estadoInicialConceptos({
        grupos,
        headersAnterior,
        headersActual,
        guardado: state.variacionesMapGuardado || null,
      });
      renderConceptMap(mapHost, {
        grupos,
        anterior: { headers: headersAnterior, label: 'Período anterior' },
        actual:   { headers: headersActual,   label: 'Período actual' },
        estado:   state.variacionesMap,
        onChange: () => {
          // Lo confirmado se recuerda para la próxima corrida del cliente, por
          // lado — no aplanar: la columna de un concepto puede ser distinta
          // entre archivo anterior y actual (cliente que renumera), y
          // aplanarlos en un solo dict hace que "actual" pise a "anterior".
          state.variacionesMapGuardado = {
            anterior: { ...state.variacionesMap.anterior },
            actual:   { ...state.variacionesMap.actual },
          };
          renderWizardNav(root, state);
        },
      });
    } else if (mapHost) {
      mapHost.innerHTML = `<p class="text-muted" style="font-size:var(--text-sm);">
        Cargá los dos Tabulados para confirmar qué columna es cada concepto.
      </p>`;
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

  // Este render recalculó estado que `canGoNext` mira (variacionesMap del
  // panel de conceptos, tabExtraConfig auto-detectado): redibujar la nav para
  // que "Siguiente" no quede pintado con el valor que tenía antes de este
  // render. Los `renderWizardNav` de más arriba (al completar cada archivo)
  // quedan igual — redibujar de más es inofensivo, no hay riesgo de
  // recursión (renderWizardNav sólo lee `state` y escribe `#js-wizard-nav`).
  renderWizardNav(root, state);
}

/**
 * Ficha de lo que declara un Tabulado en su propio encabezado — período,
 * quincena y tipo de liquidación — más el aviso si el nombre del archivo no
 * coincide con eso. El analista elige qué subir mirando el nombre, y el nombre
 * puede mentir: es la única forma de que se note antes de correr el control.
 */
function renderMetadataTabulado(host, fileData) {
  if (!host) return;
  if (!fileData) { host.innerHTML = ''; return; }

  const meta = fileData.parseMetadata || {};
  if (!meta.period && !meta.tipoLiquidacion) { host.innerHTML = ''; return; }

  const etiqueta = meta.period
    ? (meta.quincena
        ? `${meta.quincena}ª quincena de ${periodToLabel(meta.period).toLowerCase()}`
        : periodToLabel(meta.period))
    : 'Período sin identificar';

  const desfasaje = nombreCoincideConMetadata(fileData.fileName, meta);

  host.innerHTML = `
    <div style="margin-top:var(--sp-2);font-size:var(--text-sm);">
      <div style="font-weight:var(--fw-semibold);">${esc(etiqueta)}</div>
      ${meta.tipoLiquidacion
        ? `<div class="text-muted">${esc(meta.tipoLiquidacion)}</div>`
        : ''}
    </div>
    ${desfasaje ? `
      <div class="varfiles__mismatch">
        <strong>El nombre del archivo no coincide con lo que declara adentro</strong> — ${esc(desfasaje)}.
        Verificá que sea el archivo correcto.
      </div>` : ''}
  `;
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
  // render() intercepta el caso "ya se ejecutó" antes de llegar acá (ver
  // showResultsPage) — este paso sólo se renderiza en modo pre-ejecución.
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
  container.innerHTML = `<div id="js-inline-results"></div>`;

  const tiers = Object.values(state.lastRunTierByControlId || {});
  const overallTier = tiers.length === 0 ? 'info'
    : tiers.includes('error') ? 'error'
    : tiers.includes('warn')  ? 'warn'
    : tiers.every(t => t === 'info') ? 'info'
    : 'ok';
  const checked = tiers.filter(t => t !== 'info');
  const verdictLine = checked.length === 0
    ? 'Esta corrida sólo incluye controles de generación de reporte.'
    : checked.every(t => t === 'ok')
      ? `${checked.length} de ${checked.length} control${checked.length === 1 ? '' : 'es'} en verde — sin diferencias.`
      : ['error', 'warn', 'ok'].map(t => {
          const n = checked.filter(x => x === t).length;
          return n > 0 ? `${n} en ${t === 'error' ? 'rojo' : t === 'warn' ? 'amarillo' : 'verde'}` : null;
        }).filter(Boolean).join(' · ') + '.';

  const ctxBarEl = root.querySelector('#js-results-ctx-bar');
  renderResultsContextBar(ctxBarEl, {
    tier: overallTier,
    clientePeriodo: `${state.client.name} · ${periodToLabel(state.period)}`,
    verdictLine,
    back: { label: '← Volver a los controles', onClick: () => { state.step = 0; render(root, state); } },
    run: {
      createdAtLabel: new Date().toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      isQuickRun: true,
      onReconfigure: () => { state.step = 1; render(root, state); },
      onRerun: () => {
        state.lastRunResults = null;
        state.lastRunId = null;
        state.lastRunIsDefinitive = false;
        render(root, state);
      },
    },
  });

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

      // Variaciones compara dos Tabulados que se suben los dos, siempre: el
      // período y la quincena salen del encabezado de cada archivo, nunca del
      // selector de período de la app. Antes se reusaba el Tabulado de la
      // corrida del mes anterior, pero sin una regla cerrada de qué quincena
      // compara contra cuál eso armaba comparaciones mal sin avisar (ver D-026).
      if (VARIACIONES_IDS.includes(controlId)) {
        const prev = state.controlFiles[controlId]?.tab_prev;
        mapping.variaciones = {
          config:   state.variacionesConfig || null,
          anterior: {
            meta:     metadataDeTabulado(prev),
            columnas: aColumnasDelControl(state.variacionesMap?.anterior),
          },
          actual: {
            meta:     metadataDeTabulado(tab),
            columnas: aColumnasDelControl(state.variacionesMap?.actual),
          },
        };
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
    const tierByControlId = state.selectedControls
      .map(controlId => {
        const ctrl = CONTROL_REGISTRY[controlId];
        const summary = ctrl?.summarize ? ctrl.summarize(runResults[controlId]) : null;
        const tier = !summary ? 'info'
          : summary.status === 'error' ? 'error'
          : summary.unitsTotal == null ? 'info'
          : computeSemaforoStatus(summary.unitsWithDiff, summary.unitsTotal, thresholdPct);
        return { controlId, tier };
      });
    const tierOrder = tierByControlId
      .slice()
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
    // resultados inline (cascada errores-primero) bajo la cabecera 1C — el
    // popover "Detalles del run" avisa que no se guardó.
    state.lastRunId            = runId;
    state.lastRunResults       = runResults;
    state.lastRunIsDefinitive  = false;
    state.lastRunTierOrder     = tierOrder;
    state.lastRunTierByControlId = Object.fromEntries(tierByControlId.map(t => [t.controlId, t.tier]));
    render(root, state);

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
