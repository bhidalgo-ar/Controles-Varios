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
import { necessityOfKey, typeOfKey, NECESSITY, OMITIDO, esOmitido } from '../exports/contracts.js';
import { columnValues, columnHintHtml } from './columnHints.js';
import { initFileUploadStep, matchLevel, matchSelectStyle, matchBadge, wireColumnHints } from './fileUpload.js';
import { autoDetectFor, extraFieldGroupsFor, conceptCodeToKeyFor } from './fileTypes.js';
import { renderTabuladoAnalysis } from './tabuladoAnalysis.js';
import { CONTROL_REGISTRY }        from '../controls/registry.js';
import { controlAppliesToClient, controlOrigin } from '../controls/scope.js';
import { computeSemaforoStatus, DEFAULT_SEMAFORO_THRESHOLD_PCT } from '../controls/semaforo.js';
import { buildParserMapping }           from '../parsers/conceptMatcher.js';
import { TAB_CODE_SEEDS, buildColByCode } from '../controls/tabCodes.js';
import { DEFAULT_LEGAJO_KEY_MODE, makeLegajoKey } from '../utils/legajo.js';
import { countUniqueLegajos }          from '../controls/consolidate.js';
import { currentPeriod, periodOptions, previousPeriod, periodToLabel } from '../utils/dates.js';
import { renderConceptGroupingEditor }     from './rendVsTabuConceptEditor.js';
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
import { renderResultsContextBar } from './resultsHeader.js';
import { setHeader }               from './appHeader.js';

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

// IDs de controles agrupados (para validación y detección de grupos seleccionados)
const BRUTOS_IDS  = ['brutos', 'brutos_reporte'];
const GS_PERS_IDS = ['gs_pers', 'gs_pers_reporte'];
const NR_IDS      = ['nr', 'nr_reporte'];
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

// Quiénes muestran el editor de agrupación de conceptos. No sale de la
// declaración de config porque Rend vs Asiento también la declara —pero
// `readOnly`, para leerla sin editarla— y este panel es sólo de los dos que sí
// la editan.
const REND_GROUPING_IDS = ['rend_vs_tabu', 'rend_x_ee'];

// Resuelve un objeto de promesas por clave — el mismo `Promise.all` que hoy,
// pero sin la fragilidad de destructurar un array por posición: acá desalinear
// una entrada no puede meter la config de un control en el state de otro sin
// ningún error, porque el resultado se lee por nombre y no por índice.
async function promiseAllByKey(promisesByKey) {
  const keys = Object.keys(promisesByKey);
  const values = await Promise.all(keys.map(k => promisesByKey[k]));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}


// ── Config por control, declarada en el registry ─────────────────────────────
// Cada control declara su `config` (ver el encabezado de registry.js) y de ahí
// salen los cinco momentos de su ciclo de vida: cargar, inicializar el state,
// mostrar el editor, guardar y viajar a `run()`. Antes cada config estaba
// cableada en esos cinco lugares más el import y una constante de ids, sin nada
// que ligara los siete: agregar una y olvidarse del `mapping` daba un control
// corriendo con su default sin que nada avisara.

/** Todas las configs declaradas, deduplicadas por `key`. */
function allDeclaredConfigs() {
  const porClave = new Map();
  for (const ctrl of Object.values(CONTROL_REGISTRY)) {
    for (const cfg of (ctrl.config || [])) {
      if (!porClave.has(cfg.key)) porClave.set(cfg.key, cfg);
    }
  }
  return [...porClave.values()];
}

/** Las configs que declaran los controles seleccionados, deduplicadas. */
function selectedConfigs(state, { soloEditables = false } = {}) {
  const vistas = new Set();
  const out = [];
  for (const controlId of state.selectedControls) {
    for (const cfg of (CONTROL_REGISTRY[controlId]?.config || [])) {
      if (soloEditables && cfg.readOnly) continue;
      if (vistas.has(cfg.key)) continue;
      vistas.add(cfg.key);
      out.push(cfg);
    }
  }
  return out;
}

/**
 * ¿Vale la pena persistir este valor?
 *
 * Un objeto vacío no: es "el analista no configuró nada", y guardarlo le crea al
 * cliente una config que dice lo mismo que no tenerla. Es lo que hacía el
 * chequeo `Object.keys(state.tabExtraConfig).length > 0` — el único de los siete
 * bloques que lo tenía, porque es el único cuyo default es `{}`.
 */
function valeGuardar(value) {
  if (!value) return false;
  return typeof value !== 'object' || Object.keys(value).length > 0;
}

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

  // Carga por clave, no por posición: un `Promise.all` de 11 promesas
  // destructurado por orden no tiene ningún guard entre la lista y los nombres
  // — desalinear una entrada mete la config de un control en el state de otro
  // sin ningún error (Fase 4, Paso 0 del plan de escalabilidad).
  // Las 9 configs declaradas se cargan siempre, no sólo las de los controles
  // seleccionados: el Paso 0 todavía no eligió nada cuando esto corre.
  const declaradas = allDeclaredConfigs();
  const loaded = await promiseAllByKey({
    savedCatalog:      getClientCatalog(client.code),
    groupers:          getGroupers(client.code),
    allControlConfigs: getControlConfigsForClient(client.code),
    ...Object.fromEntries(declaradas.map(cfg => [cfg.key, getControlConfig(client.code, cfg.key)])),
  });
  const { savedCatalog, groupers, allControlConfigs } = loaded;

  // `||` y no `??`, igual que antes: una config guardada como `null` cae al
  // default en vez de quedar en null.
  const configState = Object.fromEntries(
    declaradas.map(cfg => [cfg.stateKey, loaded[cfg.key]?.params || cfg.default()])
  );

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
    tabExtraConfigAutoDetected: false,
    // Config del Control 6 (Rendimiento vs Asiento): clasificación CUENTA_CONTAB,
    // conceptos PROV CCSS y redirects de CC. Editable por el usuario en el paso Archivos.
    // Agrupadores del cliente + config de "Cruce por Agrupadores" (selección + umbrales,
    // ver agrupadores.js). Se cargan siempre (no sólo si el control está seleccionado),
    // mismo criterio que rvaConfig arriba.
    groupers:                  groupers || [],
    // Config del reporte de Acreditaciones (Axton): corte por empresa.
    // Config del reporte de Acumuladores Ganancias (Axton): régimen RG4003/RG4030 + códigos de acumulador.
    // Config del asiento de FINADIET: plan de cuentas, centros de costo y fecha
    // de emisión. Sin config guardada cae a la semilla del módulo (D-035); en
    // cuanto el analista toque el editor, lo guardado reemplaza a la semilla.
    // Config del control de Variaciones (POF): qué conceptos compara cada reporte
    // y qué códigos cuentan como causa de ausencia. Sin config guardada, el
    // control cae a la semilla de variaciones.js. La UI para editar la lista
    // todavía no existe — ver ROADMAP.md.
    // Mapeo confirmado de concepto → columna, por archivo. Lo llena el panel
    // "Conceptos a comparar" del Paso 2 (ver variacionesConceptMap.js).
    variacionesMap:            null,
    // Lo confirmado en corridas anteriores, que precarga ese panel. Vive en
    // `controlConfigs` y no sólo en `state`: el state se arma de cero en cada
    // entrada al wizard, así que antes salir y volver a entrar lo perdía y el
    // analista reconfirmaba concepto por concepto, en los dos Tabulados, todos
    // los meses. Al estar en `controlConfigs` viaja además en el seed (D-035).
    controlConfigsByControlId,

    // Las 9 configs declaradas por los controles (ver registry.js)
    ...configState,

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

// Shell del wizard (título + card + nav) — se remonta cada vez que se vuelve
// de la pantalla de resultados (1C, sin este shell) a un paso normal. El
// "volver", el cliente·período, los pasos y "Siguiente" ya no viven acá: van a
// los slots de la barra superior (ver syncWizardHeader). Ver render().
function mountWizardShell(root, client) {
  root.innerHTML = `
    <!-- Poco padding abajo a propósito: el nav queda sticky contra el borde de
         esta zona, que ahora es la que scrollea — todo lo que se le sume acá lo
         despega del piso de la pantalla. -->
    <div class="page-content" style="padding-bottom:var(--sp-3);">
      <div class="page-actions">
        <div class="page-actions__title">
          <h2 style="margin:0;">Controles — ${esc(client.name)}</h2>
          <span id="js-control-help"></span>
        </div>
      </div>
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

  // Ayuda "cómo ejecutar un control" — al lado del título, visible en los 3
  // pasos (este bloque no se re-renderiza al cambiar de paso).
  renderHelpPopover(root.querySelector('#js-control-help'), CONTROL_HELP);
}

const WIZARD_STEP_LABELS = ['Controles', 'Archivos', 'Ejecutar'];

/**
 * Deja la barra superior mostrando en qué está la corrida: volver, cliente ·
 * período, los 3 pasos y la primaria "Siguiente →" con su hint de qué falta.
 *
 * La primaria está acá y no al pie porque el botón de avance no puede quedar
 * fuera de vista (regla 1 del rediseño): la barra no scrollea nunca. Se
 * re-sincroniza en cada renderWizardNav — o sea también cuando cambia un
 * select del Paso 2 y `canGoNext` pasa a ser verdadero.
 */
function syncWizardHeader(root, state) {
  const isLast  = state.step === 2;
  const canNext = canGoNext(state);
  const hint    = !canNext && !isLast ? nextStepHint(state) : '';

  setHeader({
    back: { label: '← Inicio', href: '#/' },
    context: state.client?.name
      ? { name: state.client.name, meta: state.period ? periodToLabel(state.period) : '' }
      : null,
    steps: { labels: WIZARD_STEP_LABELS, current: state.step },
    hint: hint ? { text: hint, tone: 'warn' } : null,
    primary: isLast ? null : {
      id: 'js-next-btn',
      label: 'Siguiente →',
      disabled: !canNext,
      onClick: () => {
        if (canGoNext(state)) { state.step++; render(root, state); }
      },
    },
  });
}

// ── Render central ────────────────────────────────────────────────────────────

function render(root, state) {
  const showResultsPage = state.step === 2 && !!state.lastRunResults;

  // Pantalla de resultados (1C): barra de veredicto + contenido, sin el shell
  // del wizard (título/card/nav) — mismo criterio que controlsResults.js. La
  // barra superior la reescribe renderResultsContextBar.
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

function renderWizardNav(root, state) {
  // "Siguiente →" y el hint de qué falta viven en la barra superior desde el
  // rediseño; acá abajo queda sólo el "← Anterior" y el atajo de teclado.
  syncWizardHeader(root, state);

  const nav = root.querySelector('#js-wizard-nav');
  if (!nav) return;
  const isFirst = state.step === 0;
  const isLast  = state.step === 2;

  nav.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--sp-3);">
      ${!isFirst
        ? `<button class="btn btn--ghost btn--sm" id="js-prev-btn">← Anterior</button>`
        : ''}
      ${!isLast ? `
        <span class="text-muted" style="font-size:11px;display:none;" id="js-kbd-hint">
          <kbd style="padding:1px 5px;border:1px solid var(--color-border);border-radius:3px;background:var(--color-surface);font-family:monospace;font-size:10px;">←</kbd>
          <kbd style="padding:1px 5px;border:1px solid var(--color-border);border-radius:3px;background:var(--color-surface);font-family:monospace;font-size:10px;">→</kbd>
          navegar
        </span>
      ` : ''}
    </div>
  `;

  // En el Paso 1 no queda nada al pie: una barra vacía con sombra es ruido.
  nav.style.display = isFirst ? 'none' : 'flex';

  // Mostrar hint de teclado solo en pantallas anchas (>720px) para no quitar espacio en móvil
  const kbdHint = nav.querySelector('#js-kbd-hint');
  if (kbdHint && window.innerWidth > 720) kbdHint.style.display = 'inline';

  nav.querySelector('#js-prev-btn')?.addEventListener('click', () => {
    // Volver desde resultados → limpiar para forzar nueva ejecución
    if (state.step === 2) state.lastRunResults = null;
    state.step--;
    render(root, state);
  });
}

function nextStepHint(state) {
  switch (state.step) {
    case 0: return 'Seleccioná al menos un control para continuar';
    case 1: {
      // Si lo único que falta es una columna del Tabulado, nombrarla —
      // "Completá los archivos y columnas requeridas" no le dice al analista
      // adónde ir cuando ya cargó todo.
      const hasBrutos = state.selectedControls.some(id => BRUTOS_IDS.includes(id));
      const hasGsPers = state.selectedControls.some(id => GS_PERS_IDS.includes(id));
      const hasNr     = state.selectedControls.some(id => NR_IDS.includes(id));
      const pendientes = pendingTabRequirements(state.tabExtraConfig, { hasBrutos, hasGsPers, hasNr });
      if (pendientes.length > 0) {
        return pendientes.length === 1
          ? `Falta la columna "${pendientes[0].label}" — o declarala ausente con ⊘`
          : `Faltan ${pendientes.length} columnas del Tabulado — o declaralas ausentes con ⊘`;
      }
      return 'Completá los archivos y columnas requeridas';
    }
    default: return '';
  }
}

/**
 * Qué grupos de columnas del Tabulado pide esta corrida, según qué controles
 * estén seleccionados. Los ids son los `requiredBy` de la ficha.
 */
function activeExtraGroups({ hasBrutos, hasGsPers, hasNr }) {
  return new Set([
    hasBrutos && 'brutos',
    hasGsPers && 'gsPers',
    hasNr     && 'nr',
  ].filter(Boolean));
}

/**
 * Campos de "Columnas del Tabulado" (los declara la ficha de `tab_control` en
 * js/ui/fileTypes.js) que siguen sin resolver: la clave del contrato exige
 * CLAVE u OBLIGATORIA, y `cfg[key]` está vacío. Un valor `OMITIDO` cuenta como
 * resuelto — es la vía de escape para el cliente que genuinamente no tiene esa
 * columna (D-036).
 *
 * `soloGateados`: el gate mira sólo los grupos atados a un control, no los 5
 * campos compartidos. Ver la nota de `extraFieldGroups` en la ficha.
 */
export function pendingTabRequirements(cfg, { hasBrutos, hasGsPers, hasNr }) {
  const fields = extraFieldGroupsFor('tab_control', activeExtraGroups({ hasBrutos, hasGsPers, hasNr }), { soloGateados: true })
    .flatMap(g => g.fields);
  return fields.filter(f => {
    const necessity = necessityOfKey('tab_control', f.key);
    const bloquea = necessity === NECESSITY.CLAVE || necessity === NECESSITY.OBLIGATORIA;
    return bloquea && !cfg[f.key];
  });
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

      // Columnas del Tabulado (Brutos/GS Pers/NR): antes una lista de 4 claves
      // cableada a mano — sin la tercera rama para NR, sus 18 conceptos nunca
      // tuvieron ningún gate (D-041, ver specs/contrato-export.md, Paso 2).
      // Ahora deriva de la necesidad que el contrato de export declara para
      // cada clave: bloquea CLAVE/OBLIGATORIA sin resolver, y "resolver"
      // incluye declarar la omisión (OMITIDO) — sin esa vía de escape, un
      // cliente sin alguno de los 18 conceptos no podría subir NR.
      const hasBrutos = state.selectedControls.some(id => BRUTOS_IDS.includes(id));
      const hasGsPers = state.selectedControls.some(id => GS_PERS_IDS.includes(id));
      const hasNrForGate = state.selectedControls.some(id => NR_IDS.includes(id));
      if (pendingTabRequirements(state.tabExtraConfig, { hasBrutos, hasGsPers, hasNr: hasNrForGate }).length > 0) {
        return false;
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

// Archivos que un control va a pedir en el Paso 2 — mismo criterio que arma esa
// pantalla (Tabulado si tabRequired, + uno por additionalFile). Devuelve la
// lista, no HTML: la usan las badges de la card y el panel lateral, que las
// muestra deduplicadas entre los controles elegidos.
function unitFiles(ctrl) {
  const files = [];
  if (ctrl.tabRequired !== false) {
    files.push({ label: 'Tabulado', optional: false });
  }
  for (const f of ctrl.additionalFiles) {
    // f.label ya incluye "(opcional)" en los additionalFiles que lo son (ver registry.js)
    files.push({ label: f.label, optional: !!f.optional });
  }
  return files;
}

// Badges de archivos a la derecha de la card: los requeridos en celeste, los
// opcionales apagados. El contenido sale del registry — acá sólo se pinta.
function unitFileBadgesHtml(ctrl) {
  return unitFiles(ctrl).map(f => `
    <span class="ctrl-row__file ${f.optional ? 'ctrl-row__file--optional' : ''}">${esc(f.label)}</span>
  `).join('');
}

// Escapa `text` y envuelve en <mark> cada tramo que coincide con la búsqueda,
// para que el analista vea por qué una card quedó en la lista. `query` ya viene
// en minúscula y sin espacios de borde (lo normaliza renderStepControls).
function highlightMatch(text, query) {
  const str = String(text ?? '');
  if (!query) return esc(str);

  const hay = str.toLowerCase();
  let out = '';
  let from = 0;
  for (let at = hay.indexOf(query); at !== -1; at = hay.indexOf(query, from)) {
    out += esc(str.slice(from, at)) + `<mark class="ctrl-mark">${esc(str.slice(at, at + query.length))}</mark>`;
    from = at + query.length;
  }
  return out + esc(str.slice(from));
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
  // Mismo filtrado que antes, en dos pasos para poder decir cuántos esconde la
  // búsqueda (el chip de origen no cuenta como "oculto por la búsqueda").
  const inOriginFilter = units.filter(u => !state.originFilter || u.origin.label === state.originFilter);
  const visibleUnits = inOriginFilter.filter(u => {
    if (query) {
      const haystack = `${u.name} ${u.mode || ''} ${u.ctrl.description}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  const hiddenByQuery = inOriginFilter.length - visibleUnits.length;

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
              data-ctrl="${esc(u.ctrl.id)}" aria-pressed="${isOn}">
        <span class="ctrl-row__box" aria-hidden="true">✓</span>
        <span class="ctrl-row__main">
          <span class="ctrl-row__name">
            <span class="ctrl-row__label">${highlightMatch(u.name, query)}</span>
            ${u.mode ? `<span class="ctrl-row__mode">${highlightMatch(u.mode, query)}</span>` : ''}
            <span class="origin-badge origin-badge--${u.origin.tier}">${esc(u.origin.label)}</span>
          </span>
          <span class="ctrl-row__desc">${highlightMatch(u.ctrl.description, query)}</span>
        </span>
        <span class="ctrl-row__files">${unitFileBadgesHtml(u.ctrl)}</span>
      </button>`;
  }).join('');

  // Estado vacío y aviso de ocultos: los dos con salida (link que borra la
  // búsqueda) — un estado sin salida deja al analista mirando una lista vacía
  // sin saber que el filtro es lo que la vació.
  const emptyHtml = query
    ? `<div class="ctrl-rows__empty">
         Ningún control coincide con «${esc(state.controlQuery.trim())}»
         <span class="ctrl-rows__empty-hint">
           Revisá el nombre o <button type="button" class="ctrl-link" id="js-ctrl-search-reset-empty">borrá la búsqueda</button>
           ${inOriginFilter.length === 1 ? 'para ver el único disponible.' : `para ver los ${inOriginFilter.length} disponibles.`}
         </span>
       </div>`
    : `<div class="ctrl-rows__empty">Ningún control coincide con el filtro.</div>`;

  const hiddenNoteHtml = hiddenByQuery > 0 && visibleUnits.length
    ? `<p class="ctrl-hidden-note">
         ${hiddenByQuery === 1 ? '1 control oculto' : `${hiddenByQuery} controles ocultos`} por la búsqueda —
         <button type="button" class="ctrl-link" id="js-ctrl-search-reset">borrala</button>
         para ver los ${inOriginFilter.length}.
       </p>`
    : '';

  const selectedUnits = units.filter(u => state.selectedControls.includes(u.ctrl.id));
  const asideSelectedHtml = selectedUnits.length
    ? `<ul class="run-list">
         ${selectedUnits.map(u => `
           <li class="run-list__item">${esc(u.name)}${u.mode ? ' · ' + esc(u.mode) : ''}</li>
         `).join('')}
       </ul>`
    : '<p class="wizard-section-hint">Todavía nada — marcá un control de la lista para armar la corrida.</p>';

  // Un mismo archivo lo piden varios controles (el Tabulado, casi todos): en el
  // panel va una sola vez, que es lo que el analista va a cargar.
  const asideFiles = [];
  for (const u of selectedUnits) {
    for (const f of unitFiles(u.ctrl)) {
      if (!asideFiles.some(x => x.label === f.label)) asideFiles.push(f);
    }
  }
  const asideFilesHtml = asideFiles.length
    ? asideFiles.map(f => `
        <span class="ctrl-row__file ${f.optional ? 'ctrl-row__file--optional' : ''}">${esc(f.label)}</span>
      `).join('')
    : '<span class="text-sm text-muted">—</span>';

  container.innerHTML = `
    <h3 class="wizard-step-title">Elegí los controles a correr</h3>
    <p class="text-muted" style="margin:0 0 var(--sp-4);font-size:var(--text-sm);">
      Marcá uno o más. Los archivos que necesita cada uno se cargan en el paso siguiente.
    </p>

    ${units.length ? `
      <div class="ctrl-toolbar">
        ${filterChipsHtml}
        <span class="ctrl-toolbar__end">
          ${query ? `<span class="ctrl-toolbar__count">${visibleUnits.length} de ${inOriginFilter.length} controles</span>` : ''}
          <span class="ctrl-search-box ${query ? 'is-filled' : ''}">
            <svg class="ctrl-search-box__icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
              <line x1="10.4" y1="10.4" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></line>
            </svg>
            <input type="search" class="ctrl-search" id="js-ctrl-search"
                   placeholder="Buscá un control por nombre…" value="${esc(state.controlQuery)}"
                   aria-label="Buscá un control por nombre">
            ${query ? `<button type="button" class="ctrl-search-box__clear" id="js-ctrl-search-clear"
                               aria-label="Borrar la búsqueda">✕</button>` : ''}
          </span>
          <button class="btn btn--ghost btn--sm" id="js-select-all-ctrls">✓ Todos</button>
          <button class="btn btn--ghost btn--sm" id="js-clear-ctrls">✕ Limpiar</button>
        </span>
      </div>

      <div class="wizard-onepane" style="margin-bottom:var(--sp-3);">
        <div class="wizard-onepane__main">
          <div class="ctrl-rows" id="js-control-rows">
            ${rowsHtml || emptyHtml}
          </div>
          ${hiddenNoteHtml}
        </div>
        <div class="wizard-onepane__side">
          <div>
            <span class="wizard-section-label">Vas a ejecutar (${selectedUnits.length})</span>
            ${asideSelectedHtml}
          </div>
          <div>
            <span class="wizard-section-label">Archivos que te va a pedir</span>
            <div class="control-recap-pills">${asideFilesHtml}</div>
            ${asideFiles.length ? '<p class="wizard-section-hint" style="margin-top:var(--sp-2);">Se cargan en el paso siguiente.</p>' : ''}
          </div>
          <div class="ctrl-help">
            <span id="js-step1-help"></span>
            <button type="button" class="ctrl-help__label" id="js-step1-help-label">¿Qué hace cada control?</button>
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

  // Salidas de los estados de búsqueda: la ✕ del campo, el link del aviso de
  // ocultos y el del estado vacío hacen todos lo mismo — vaciar la búsqueda.
  const clearQuery = () => {
    state.controlQuery = '';
    renderStepControls(container, state, root);
    container.querySelector('#js-ctrl-search')?.focus();
  };
  container.querySelector('#js-ctrl-search-clear')?.addEventListener('click', clearQuery);
  container.querySelector('#js-ctrl-search-reset')?.addEventListener('click', clearQuery);
  container.querySelector('#js-ctrl-search-reset-empty')?.addEventListener('click', clearQuery);

  // Botón "Seleccionar todos": selecciona la variante principal de cada control
  // que aplica a este cliente (ignora el filtro/búsqueda activos). Qué variante
  // es la principal lo declara el registry con `group.primary` — antes se
  // infería de `group.mode === 'Controlar'`, que dejaba afuera a POF y a
  // Acreditaciones y hacía que el botón no seleccionara nada (D-040).
  container.querySelector('#js-select-all-ctrls')?.addEventListener('click', () => {
    const allControlarIds = units
      .filter(u => !u.ctrl.group || u.ctrl.group.primary)
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

  // "¿Qué hace cada control?" — la única ayuda global de la pantalla, detrás del
  // "?" (mismo popover que el home y resultados). El texto de al lado abre lo
  // mismo que el botón: es el blanco grande de click.
  const helpSlot = container.querySelector('#js-step1-help');
  if (helpSlot) {
    renderHelpPopover(helpSlot, CONTROL_HELP);
    container.querySelector('#js-step1-help-label')?.addEventListener('click', (e) => {
      e.stopPropagation();
      helpSlot.querySelector('.help-popover__btn')?.click();
    });
  }
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
      autoDetect:  (headers) => autoDetectFor('tab_control')(headers, catalogRows),
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

      // Un archivo puede declarar un hueco propio en el layout del paso
      // (`fileSpec.slot`) — el Tabulado anterior lo hace, en la grilla de 2
      // columnas de arriba. Si ese hueco no está en pantalla (el layout de
      // Variaciones no se renderizó), cae a la lista de abajo como cualquier
      // otro, que es exactamente lo que hacía el chequeo de `esVariaciones`.
      const slotPropio = fileSpec.slot ? container.querySelector(fileSpec.slot) : null;

      let uploadDiv;
      if (slotPropio) {
        uploadDiv = slotPropio;
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

      // Qué función propone las columnas la declara la ficha del tipo de
      // archivo, no un mapa acá. Las que no usan el catálogo del cliente
      // ignoran el segundo argumento, así que se pasa siempre.
      const baseDetect  = autoDetectFor(fileSpec.fileType);
      const catalogRows = state.catalog?.rows || CATALOGO_SEED;
      const autoDetect  = baseDetect
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
          // Hay archivos que, al cargarse, cambian lo que OTRO panel del mismo
          // paso puede ofrecer: CONTA le da al editor de rend_vs_asiento los
          // nombres de cuenta y concepto, y el Tabulado anterior le da al panel
          // de conceptos los encabezados contra los que mapear. Lo declara el
          // registry (`rerenderOnLoad`) en vez de dos `if` por controlId acá.
          //
          // El guard de identidad NO es opcional: renderAlreadyLoaded llama a
          // onComplete de forma sincrónica al re-mostrar un archivo ya cargado,
          // así que sin `prev !== data` el redibujo vuelve a montar la carga,
          // dispara onComplete otra vez y entra en bucle re-entrante — rompía y
          // escondía el panel de mapeo.
          if (fileSpec.rerenderOnLoad && prev !== data) {
            renderStepFiles(container, state, root);
          }
        },
      });
    }

    // El panel de conceptos de Variaciones se monta una sola vez, fuera del loop
    // (lo comparten los dos controles). Ver más abajo.

    // Editores de config del control, declarados en el registry. Eran cinco
    // bloques idénticos salvo por el nombre de la función y el del state.
    for (const cfg of (ctrl.config || [])) {
      if (!cfg.editor) continue;
      const cfgWrapper = document.createElement('div');
      cfgWrapper.style.marginBottom = 'var(--sp-3)';
      filesArea.appendChild(cfgWrapper);

      cfg.editor(cfgWrapper, {
        config:        state[cfg.stateKey],
        openByDefault: typeof cfg.openByDefault === 'function'
          ? cfg.openByDefault(state)
          : !!cfg.openByDefault,
        ...(cfg.editorProps ? cfg.editorProps(state) : {}),
        onChange: (newConfig) => {
          state[cfg.stateKey] = newConfig;
          // Sólo el de Agrupadores cambia si se puede avanzar (elige qué
          // agrupadores entran, y se exige al menos uno).
          if (cfg.affectsNav) renderWizardNav(root, state);
        },
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
          // A IndexedDB en el momento: el `state` se descarta al salir del
          // wizard, así que sin esto "se recuerda para la próxima corrida" no
          // pasaba de ser un comentario.
          saveControlConfig(state.client.code, 'variaciones_concept_map', {
            params: state.variacionesMapGuardado,
          }).catch(() => {
            showToast('No se pudo guardar el mapeo de conceptos. Vas a tener que confirmarlo de nuevo la próxima corrida.', 'warning');
          });
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

function autoDetectTabExtraConfig(tabHeaders, catalogRows) {
  const catalog = catalogRows || CATALOGO_SEED;
  const lc = h => String(h).toLowerCase();
  const find = (...kws) => tabHeaders.find(h => kws.some(kw => lc(h).includes(lc(kw)))) || '';

  const nombre   = find('nombre');
  const apellido = find('apellido');
  const idCentroTrab = find('id_centro_trab', 'centro_trab');
  const idCategoria  = find('id_categoria', 'categoria');

  const conceptMapping = buildParserMapping(tabHeaders, catalog, conceptCodeToKeyFor('tab_control'));

  // Lo que el catálogo del cliente no pudo resolver por nombre, se intenta por
  // **código** de concepto (D-039): el nombre del encabezado lo renombra el
  // cliente, el código es estable. Va después del catálogo y no antes porque el
  // catálogo es dato del cliente y los códigos son sólo semilla — así esto no
  // cambia nada de lo que ya resolvía bien, y sólo completa lo que quedaba vacío.
  //
  // Es lo que le faltaba a GS Pers y a NR: hasta acá el único con fallback era
  // Brutos, y encima el suyo era letra muerta contra un Tabulado real, porque
  // buscaba una columna llamada `'1003'` cuando Meta4 la exporta
  // `'1003-SUELDO'`. `buildColByCode` cubre los dos formatos.
  const colByCode = buildColByCode(tabHeaders);
  for (const [key, code] of Object.entries(TAB_CODE_SEEDS)) {
    if (!conceptMapping[key] && colByCode[code]) conceptMapping[key] = colByCode[code];
  }

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

/**
 * ¿`value` es un valor guardado de una carga ANTERIOR que ya no está entre
 * los encabezados de ESTE Tabulado (renumeración del cliente, otro layout)?
 *
 * Sin `tabHeaders` (todavía no se cargó ningún Tabulado en esta sesión) nunca
 * es obsoleto — no hay contra qué comparar, y tratarlo como obsoleto vaciaría
 * cualquier config guardada antes de que el archivo termine de cargar.
 */
export function isStaleTabValue(value, tabHeaders) {
  return !!value && tabHeaders.length > 0 && !tabHeaders.includes(value);
}

/**
 * ¿La auto-detección puede completar/reparar este campo?
 *
 * Sí cuando está vacío, o cuando tiene un valor obsoleto (`isStaleTabValue`).
 * NUNCA cuando ya está declarado `OMITIDO` — es una decisión del analista, no
 * un artefacto de una carga anterior, y si se tratara como obsoleta, la
 * próxima auto-detección que encontrara cualquier columna parecida la
 * pisaría en silencio, sin que el analista la haya vuelto a tocar.
 */
export function shouldAutoFillTabValue(actual, tabHeaders) {
  if (esOmitido(actual)) return false;
  return !actual || isStaleTabValue(actual, tabHeaders);
}

// Exportada para el fixture de `tests/e2e/columnHints.spec.js`: el panel es una
// de las dos superficies donde se elige una columna, y la muestra de valores hay
// que verla montada en un navegador real (el unit no puede). Nada más la usa
// desde afuera — el wizard la llama desde el paso 2, unas líneas más arriba.
export function renderTabExtraConfig(container, state, root, { hasBrutos, hasGsPers, hasNr }) {
  const tabHeaders = state.tab?.parsedRows?.length > 0
    ? Object.keys(state.tab.parsedRows[0])
    : [];

  const catalogRows = state.catalog?.rows || CATALOGO_SEED;

  if (tabHeaders.length > 0) {
    const detected = autoDetectTabExtraConfig(tabHeaders, catalogRows);
    let anyNew = false;
    for (const [k, v] of Object.entries(detected)) {
      const actual = state.tabExtraConfig[k];
      if (v && shouldAutoFillTabValue(actual, tabHeaders)) {
        state.tabExtraConfig[k] = v;
        anyNew = true;
      }
    }
    if (anyNew) state.tabExtraConfigAutoDetected = true;
  }

  const hasSavedConfig = Object.values(state.tabExtraConfig).some(Boolean);
  const autoDetected   = state.tabExtraConfigAutoDetected;

  // El orden y los subtítulos salen de la ficha: los grupos vienen en orden de
  // declaración (Brutos · GS Pers · Indemnizatorios · Otros NR · Identificación
  // NR · compartidos) y el que trae `header` inserta su subtítulo de ancho
  // completo.
  const fields = extraFieldGroupsFor('tab_control', activeExtraGroups({ hasBrutos, hasGsPers, hasNr }))
    .flatMap(g => (g.header ? [{ groupHeader: g.header }, ...g.fields] : g.fields));

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

  // La muestra de valores reales de la columna elegida, más el aviso si su
  // contenido no se parece a lo que el contrato espera ahí. El tipo sale de
  // `typeOfKey()` y no de una lista propia de este panel — es el mismo criterio
  // que ya usa `necessityOfKey()` unas líneas más abajo. Sin Tabulado cargado
  // devuelve '' solo, porque no hay valores de dónde sacar la muestra.
  const hintFor = (key, col) =>
    columnHintHtml(
      columnValues(state.tab?.parsedRows, col),
      typeOfKey('tab_control', key),
      { esc },
    );

  // Reemplaza el panel anterior en vez de apilar uno nuevo — la función se
  // vuelve a llamar a sí misma después de tocar el toggle ⊘, para que el
  // badge y el estado del <select> se actualicen sin esperar al próximo
  // re-render completo del paso (mismo problema que resolvía re-llamar a
  // renderConceptMap en variacionesConceptMap.js).
  container.querySelector('[data-tab-extra-panel]')?.remove();

  const panel = document.createElement('div');
  panel.dataset.tabExtraPanel = '';
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
        // Un valor guardado que ya no está entre los encabezados de ESTE
        // Tabulado (renumeración, otro layout) se trata como si no estuviera
        // asignado: el <select> ya lo dibuja en "— Sin asignar —" (`opts()`
        // no encuentra `option` que matchear y el navegador cae a la
        // primera), pero antes el badge seguía diciendo "✓ auto" o "↺ sesión
        // anterior" en verde — el badge afirmaba lo contrario de lo que se
        // veía en pantalla. Tratarlo como vacío hace que salga "⚠ sin
        // asignar", que es lo que hay que corregir.
        const rawVal   = state.tabExtraConfig[f.key] || '';
        const omitido  = esOmitido(rawVal);
        const val      = (!omitido && isStaleTabValue(rawVal, tabHeaders)) ? '' : rawVal;
        const level    = matchLevel(omitido ? '' : val, { autoDetected, hasSavedMapping: hasSavedConfig });
        const style    = matchSelectStyle(level);
        const badge    = matchBadge(level);
        // Sólo OBLIGATORIA ofrece la vía de escape — CLAVE no admite omisión
        // (sin esto el archivo no sirve) y OPCIONAL no bloquea, así que
        // declararlo ausente no cambiaría nada. Hoy ningún campo de este
        // panel es CLAVE, pero el check queda explícito para cuando lo sea.
        const necessity  = necessityOfKey('tab_control', f.key);
        const puedeOmitir = necessity === NECESSITY.OBLIGATORIA;
        const esBloqueante = necessity === NECESSITY.CLAVE || necessity === NECESSITY.OBLIGATORIA;
        return `
          <div class="form-group" style="margin-bottom:0;" data-fu-field-group="${esc(f.key)}">
            <label class="form-label ${esBloqueante ? 'form-label--required' : ''}">
              ${esc(f.label)}${omitido ? ' <span style="color:var(--color-text-muted);font-size:0.8em;">⊘ declarada ausente</span>' : badge}
            </label>
            <div style="display:flex;gap:var(--sp-2);align-items:center;">
              <select class="form-select" data-tab-extra-key="${esc(f.key)}"${omitido ? ' disabled' : ''}
                style="${style}${omitido ? 'opacity:0.6;' : ''}">
                ${opts(omitido ? '' : val)}
              </select>
              ${puedeOmitir ? `
                <button type="button" class="btn btn--sm ${omitido ? 'btn--primary' : 'btn--ghost'}"
                  data-tab-extra-omit="${esc(f.key)}" aria-pressed="${omitido}"
                  title="Declarar que este archivo no trae esta columna">⊘</button>
              ` : ''}
            </div>
            ${omitido ? `<div class="text-muted" style="font-size:var(--text-xs);margin-top:2px;">No se resuelve — se computa como sin dato, no como cero.</div>` : ''}
            <div data-fu-col-hint>${omitido ? '' : hintFor(f.key, val)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  const guardarConfig = async () => {
    renderWizardNav(root, state);
    // Guardar inmediatamente para no perder la config si no se ejecuta el control
    if (Object.keys(state.tabExtraConfig).length > 0) {
      await saveControlConfig(state.client.code, 'brutos_tab_config', { params: state.tabExtraConfig }).catch(() => {});
    }
  };

  panel.querySelectorAll('[data-tab-extra-key]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const k = sel.dataset.tabExtraKey;
      if (sel.value) state.tabExtraConfig[k] = sel.value;
      else delete state.tabExtraConfig[k];
      await guardarConfig();
    });
  });

  // La muestra de valores se rehace al cambiar de columna. Es el mismo helper
  // de las dos superficies de carga (`fileUpload.js`), con el mismo contrato de
  // markup — así el cableado vive en un solo lugar y no en tres.
  wireColumnHints(panel, hintFor);

  panel.querySelectorAll('[data-tab-extra-omit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const k = btn.dataset.tabExtraOmit;
      if (esOmitido(state.tabExtraConfig[k])) delete state.tabExtraConfig[k];
      else state.tabExtraConfig[k] = OMITIDO;
      await guardarConfig();
      // Re-renderiza el panel entero para que el <select> deshabilitado/
      // habilitado y el badge "⊘ declarada ausente" se vean sin esperar al
      // próximo re-render completo del paso.
      renderTabExtraConfig(container, state, root, { hasBrutos, hasGsPers, hasNr });
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
    cliente: state.client.name,
    periodo: periodToLabel(state.period),
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
  const totalLegajos = tabEmpleadosCount(state);

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
    // Se guarda lo que declaró algún control seleccionado, salvo lo `readOnly`
    // (la agrupación de conceptos vista desde Rend vs Asiento, y las dos de
    // Variaciones, que guarda su propio panel al confirmar).
    for (const cfg of selectedConfigs(state, { soloEditables: true })) {
      const value = state[cfg.stateKey];
      if (valeGuardar(value)) {
        await saveControlConfig(state.client.code, cfg.key, { params: value });
      }
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
        // Cómo se decide si dos legajos son el mismo empleado, para ESTE cliente
        // (D-038). Se resuelve una vez por corrida y viaja en el mapping para
        // que los dos lados de cada cruce usen la misma clave — con criterios
        // distintos por lado, el control informa faltantes que no faltan.
        legajoKeyMode: state.client?.legajoKeyMode || DEFAULT_LEGAJO_KEY_MODE,
      };
      // Lo que cada control declaró que necesita ver en `run()`. Una config sin
      // `mappingKey` no viaja: es la que se arma a mano más abajo (el merge de
      // `mapping.tab`, el compuesto de Variaciones).
      for (const cfg of (ctrl.config || [])) {
        if (!cfg.mappingKey) continue;
        // Con `mappingValue` la config viaja SIEMPRE, incluso como `null` — es
        // el caso del asiento de FINADIET, donde `null` significa "nunca se
        // configuró" y el `run()` lo distingue de una config igual a la semilla
        // (D-035). Sin `mappingValue`, viaja sólo si tiene valor: es el caso de
        // la agrupación de conceptos y de rvaConfig, que sin configurar no le
        // dicen nada al control.
        if (cfg.mappingValue) {
          mapping[cfg.mappingKey] = cfg.mappingValue(state);
        } else if (state[cfg.stateKey]) {
          mapping[cfg.mappingKey] = state[cfg.stateKey];
        }
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
        // `agrupadoresConfig` ya lo puso el loop de arriba desde la declaración;
        // acá sólo quedan los dos que hay que ir a buscar a la base.
        mapping.grouperDefs        = grouperDefs;
        mapping.grouperConceptsMap = grouperConceptsMap;
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

// ── Cuántos EMPLEADOS trae el Tabulado cargado ───────────────────────────────
// No es `parseMetadata.totalRows`: eso son filas, y el Tabulado trae una fila
// por liquidación, así que el legajo con la mensual y la baja del mismo mes se
// contaba dos veces. Los textos del wizard y el KPI "Legajos cruzados" del hero
// tienen que dar el MISMO número para el mismo archivo.
//
// El resultado se cachea por objeto `tab` en un WeakMap y no dentro del propio
// objeto, porque `state.tab` se guarda tal cual en la base (`saveControlRunFile`)
// y no queremos sumarle campos calculados. El botón se re-renderiza con cada
// cambio de selección y el Tabulado puede traer miles de filas.
const tabEmpleadosCache = new WeakMap();

function tabEmpleadosCount(state) {
  const tab = state.tab;
  if (!tab) return null;
  if (tabEmpleadosCache.has(tab)) return tabEmpleadosCache.get(tab);

  const n = countUniqueLegajos(tab.parsedRows, tab.mapping?.empleadoColumn, {
    keyFn: makeLegajoKey(state.client?.legajoKeyMode || DEFAULT_LEGAJO_KEY_MODE),
  });
  // Sin filas o sin columna de empleado mapeada no hay empleados que contar:
  // devolvemos null y el texto omite el número en vez de afirmar "0 legajos".
  const result = n > 0 ? n : null;
  tabEmpleadosCache.set(tab, result);
  return result;
}

// El botón de ejecutar dice exactamente qué va a pasar (cuántos controles,
// sobre cuántos legajos) — se recalcula en vivo según la selección.
export function executeCtaLabel(state) {
  const n = state.selectedControls.length;
  const nCtrlTxt = `${n} control${n === 1 ? '' : 'es'}`;
  const totalLegajos = tabEmpleadosCount(state);
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
