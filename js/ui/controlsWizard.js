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
  deleteClientCatalog,
  getConfig,
  updateControlRun,
  getGroupers,
  getGrouperConcepts,
  getControlConfigsForClient,
} from '../db.js';
import { CATALOGO_SEED } from '../data/catalogoSeed.js';
import { necessityOfKey, typeOfKey, NECESSITY, OMITIDO, esOmitido } from '../exports/contracts.js';
import { columnValues, columnHintHtml } from './columnHints.js';
import { initFileUploadStep, matchLevel, matchSelectStyle, wireColumnHints } from './fileUpload.js';
import { autoDetectFor, extraFieldGroupsFor, conceptCodeToKeyFor, fileTypeLabel, flowFor } from './fileTypes.js';
import { tabFieldParts, necessityHelp, fieldBadgeHtml } from './fieldHelp.js';
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
import { mountResultsHeader }      from './resultsHeader.js';
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

  // Pantalla de resultados (1C): sólo el contenido, sin el shell del wizard
  // (título/card/nav) — mismo criterio que controlsResults.js. El contexto, el
  // veredicto y el "Detalles del run" van a la barra superior
  // (mountResultsHeader), que ya no tiene una segunda franja propia.
  if (showResultsPage) {
    if (root.dataset.wizardView !== 'results') {
      root.innerHTML = `
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
      // Compacto y al lado de la primaria atenuada (regla 2): "Falta: 1 archivo
      // · 1 columna". Cuál archivo y cuál columna lo dice el checklist del panel
      // lateral, que sale de la MISMA lista — en la barra no entra el detalle y
      // un hint largo empuja a la primaria fuera de lugar.
      const { faltan } = step2Checklist(state);
      const partes = [
        faltan.archivo  && `${faltan.archivo} ${faltan.archivo === 1 ? 'archivo' : 'archivos'}`,
        faltan.columna  && `${faltan.columna} ${faltan.columna === 1 ? 'columna' : 'columnas'}`,
        faltan.concepto && `${faltan.concepto} ${faltan.concepto === 1 ? 'concepto' : 'conceptos'}`,
      ].filter(Boolean);
      return partes.length
        ? `Falta: ${partes.join(' · ')}`
        : 'Completá los archivos y columnas requeridas';
    }
    default: return '';
  }
}

/**
 * Qué le falta a la corrida para poder ejecutarse, como lista.
 *
 * La consumen las dos superficies que lo cuentan —el checklist "Para ejecutar
 * te falta" del panel lateral y el hint de la barra superior— justamente para
 * que no puedan decir cosas distintas.
 *
 * **No decide nada:** quien habilita "Siguiente →" sigue siendo `canGoNext`, y
 * esta lista es su espejo en palabras. Si alguna vez discrepan, la que manda es
 * `canGoNext`.
 *
 * @returns {{ items: Array, faltan: { archivo: number, columna: number, concepto: number } }}
 */
function step2Checklist(state) {
  const items  = [];
  const faltan = { archivo: 0, columna: 0, concepto: 0 };
  const push = (item) => {
    items.push(item);
    if (item.tone !== 'done') faltan[item.kind]++;
  };

  const anyTabRequired = state.selectedControls.some(id => CONTROL_REGISTRY[id]?.tabRequired !== false);
  if (anyTabRequired) {
    push({
      kind: 'archivo',
      tone: state.tab ? 'done' : 'pending',
      label: state.tab ? 'Tabulado cargado' : 'Tabulado',
    });
  }

  // Un archivo `shared` lo piden varios controles pero se carga una sola vez:
  // en la lista va una sola vez, igual que en la pantalla.
  const vistos = new Set();
  for (const controlId of state.selectedControls) {
    const ctrl = CONTROL_REGISTRY[controlId];
    if (!ctrl) continue;

    // Agrupadores pide "uno de los dos formatos de Resumen" (ver canGoNext): los
    // dos están declarados `optional` pero juntos no lo son, así que van como un
    // solo renglón y no bajan a la zona de lo opcional.
    if (CONTROLES_CON_OPCIONAL_GATEADO.includes(controlId)) {
      const files = state.controlFiles[controlId] || {};
      const listo = !!(files.resumenLargo || files.resumenTabulado);
      push({
        kind:  'archivo',
        tone:  listo ? 'done' : 'pending',
        label: listo ? 'Resumen cargado' : 'Resumen (Largo o Tabulado)',
      });
    }

    for (const fileSpec of ctrl.additionalFiles) {
      if (fileSpec.optional) continue;
      const clave = fileSpec.shared ? `shared:${fileSpec.fileType}` : `${controlId}:${fileSpec.key}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      const cargado = state.controlFiles[controlId]?.[fileSpec.key] != null;
      const nombre  = fileTypeLabel(fileSpec.fileType);
      push({
        kind:  'archivo',
        tone:  cargado ? 'done' : 'pending',
        label: cargado ? `${nombre} cargado` : nombre,
      });
    }
  }

  const pendientes = pendingTabRequirements(state.tabExtraConfig, {
    hasBrutos: state.selectedControls.some(id => BRUTOS_IDS.includes(id)),
    hasGsPers: state.selectedControls.some(id => GS_PERS_IDS.includes(id)),
    hasNr:     state.selectedControls.some(id => NR_IDS.includes(id)),
  });
  if (pendientes.length > 0) {
    items.push({
      kind:  'columna',
      tone:  'warn',
      label: pendientes.length === 1 ? '1 columna sin asignar' : `${pendientes.length} columnas sin asignar`,
      // El nombre en criollo, que es el que se lee en la grilla de campos.
      detail: pendientes.map(f => tabFieldParts(f.key, { fallbackLabel: f.label }).name).join(' · '),
    });
    faltan.columna += pendientes.length;
  }

  // Sin mapeo todavía no hay nada que contar: el mapeo se arma recién cuando
  // están los dos Tabulados, y esos ya están en la lista como archivos.
  if (hayVariaciones(state.selectedControls) && state.variacionesMap) {
    const grupos = conceptosDeControles(state.selectedControls, state.variacionesConfig);
    const sinResolver = sinResolverEnNinguno(grupos, state.variacionesMap);
    if (sinResolver.length > 0) {
      items.push({
        kind:  'concepto',
        tone:  'warn',
        label: sinResolver.length === 1
          ? '1 concepto sin resolver en ningún Tabulado'
          : `${sinResolver.length} conceptos sin resolver en ningún Tabulado`,
      });
      faltan.concepto += sinResolver.length;
    }
  }

  return { items, faltan };
}

// Controles cuyos archivos `optional` no son opcionales entre sí: el gate exige
// al menos uno (ver el caso de Agrupadores en `canGoNext`). Sus casilleros se
// quedan arriba, con los obligatorios — mandarlos a la zona de lo opcional
// diría que se pueden saltear, que es lo contrario de lo que pasa.
const CONTROLES_CON_OPCIONAL_GATEADO = ['agrupadores'];

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

  // "Para ejecutar te falta": el detalle de lo que el hint de la barra resume en
  // "Falta: 1 archivo · 1 columna". Sale de la misma lista, así los dos no
  // pueden decir cosas distintas. Cuando no falta nada, lo dice.
  const { items } = step2Checklist(state);
  const marcas = { done: '✓', pending: '○', warn: '⚠' };
  const checklistHtml = items.length
    ? `<div class="side-checklist">
         ${items.map(i => `
           <div class="side-checklist__item side-checklist__item--${esc(i.tone)}">
             <span class="side-checklist__mark" aria-hidden="true">${marcas[i.tone] || '○'}</span>
             <span>
               ${esc(i.label)}
               ${i.detail ? `<span class="side-checklist__detail">${esc(i.detail)}</span>` : ''}
             </span>
           </div>`).join('')}
       </div>`
    : '<p class="wizard-section-hint" style="margin:0;">Estos controles no piden archivos.</p>';
  const todoListo = items.every(i => i.tone === 'done');

  return `
    <div>
      <span class="wizard-section-label">${selectedLabels.length === 1 ? 'Control a ejecutar' : 'Controles a ejecutar'}</span>
      <div class="control-recap-pills">${pillsHtml}</div>
      <p class="wizard-section-hint" style="margin-top:var(--sp-2);">Elegidos en el paso anterior — usá "← Anterior" para cambiarlos.</p>
    </div>
    <div>
      <span class="wizard-section-label">${todoListo ? 'Todo listo para ejecutar' : 'Para ejecutar te falta'}</span>
      ${checklistHtml}
    </div>
    ${thresholdsSectionHtml()}
  `;
}

/**
 * La sección "Umbrales" del panel lateral. La comparten el paso de archivos y
 * la pantalla de la corrida: con qué números se está midiendo tiene que decir
 * lo mismo antes y durante la ejecución.
 */
function thresholdsSectionHtml() {
  return `
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

/**
 * Qué se pierde si un archivo opcional no se carga. Es lo que reemplaza al
 * "(opcional)" de antes: el analista no tiene por qué saber qué le aporta un
 * archivo que nunca cargó, y "opcional" no se lo dice.
 *
 * Un tipo que no esté acá cae a la frase genérica — que sigue siendo verdad,
 * sólo que menos útil. Inventarle un detalle sería peor.
 */
const DEFAULT_SIN_ARCHIVO = {
  cc_x_ee_file: 'Sin él, el centro de costo de cada empleado sale del asiento contable.',
};

/**
 * El renglón dashed de un archivo opcional, al final de la pantalla (regla 4).
 * Devuelve el hueco donde montar la carga: oculto hasta que lo pidan si el
 * archivo no está, visible si ya se cargó.
 */
function mountOptionalRow(zona, fileSpec, { cargado }) {
  if (!zona) return document.createElement('div');

  // Ya cargado: manda el casillero verde, sin la chapa de "opcional" encima.
  if (cargado) {
    const host = document.createElement('div');
    host.style.marginTop = 'var(--sp-3)';
    zona.appendChild(host);
    return host;
  }

  const row = document.createElement('div');
  row.className = 'optional-row';
  row.innerHTML = `
    <span class="optional-row__icon" aria-hidden="true">▤</span>
    <span class="optional-row__title">${esc(fileTypeLabel(fileSpec.fileType))}</span>
    <span class="optional-row__tag">opcional</span>
    <span class="optional-row__default">
      ${esc(DEFAULT_SIN_ARCHIVO[fileSpec.fileType] || 'El control corre igual sin este archivo.')}
    </span>
    <button type="button" class="ctrl-link" data-optional-open>Cargarlo (.xlsx)</button>
    <div class="optional-row__host" data-optional-host hidden></div>
  `;
  zona.appendChild(row);

  const host  = row.querySelector('[data-optional-host]');
  const abrir = row.querySelector('[data-optional-open]');
  abrir.addEventListener('click', () => {
    host.hidden = false;
    abrir.hidden = true;
  });
  return host;
}

function renderStepFiles(container, state, root) {
  const anyTabRequired = state.selectedControls.some(
    id => CONTROL_REGISTRY[id]?.tabRequired !== false
  );

  // El default, dicho (regla 5): "(opcional)" no le dice al analista qué va a
  // pasar si no lo carga, y lo que va a pasar es que se usa el estándar.
  const catMeta = state.catalog?.parseMetadata;
  const catSummary = state.catalog
    ? `<span class="optional-row__file">${esc(state.catalog.fileName)}</span> — ${catMeta?.totalRows ?? 0} conceptos propios.`
    : `Usando el estándar (${CATALOGO_SEED.length} conceptos).`;

  // Variaciones compara dos Tabulados: los dos slots van lado a lado, siempre
  // anterior → actual, y el Catálogo de Conceptos no aplica (sirve para
  // matchear conceptos por nombre contra un catálogo; acá el mapeo es directo,
  // archivo por archivo, en el panel "Conceptos a comparar").
  const esVariaciones = hayVariaciones(state.selectedControls);
  const mostrarCatalogo = anyTabRequired && !esVariaciones;

  // Obligatorio arriba, opcional abajo (regla 4): los casilleros de los archivos
  // que la corrida necesita abren la pantalla en grilla de 2 columnas, y el
  // Catálogo de Conceptos —que tiene un default y casi nunca se toca— baja a un
  // renglón dashed al final, con su default dicho en palabras.
  container.innerHTML = `
    <h3 class="wizard-step-title">Cargá los archivos del control</h3>
    <p class="text-muted" style="margin:0 0 var(--sp-4);font-size:var(--text-sm);">
      ${esVariaciones
        ? 'Cargá los dos Tabulados. El período y la quincena de cada uno salen del propio archivo.'
        : 'Se reconocen por la sigla en el nombre — si no la trae, te avisa y podés usarlo igual.'}
    </p>

    <div class="wizard-onepane">
      <div class="wizard-onepane__files">
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
          <div class="dz-grid" id="js-file-dropzones"></div>
          <div id="js-tab-analysis"></div>
          <div id="js-var-conceptmap" style="margin-bottom:var(--sp-3);"></div>
        ` : `
          <div class="dz-grid" id="js-file-dropzones">
            ${anyTabRequired ? '<div class="dz-grid__slot" id="js-tab-upload"></div>' : ''}
          </div>
          <div id="js-tab-analysis"></div>
        `}

        <div id="js-control-files"></div>

        <div id="js-optional-files"></div>
        ${mostrarCatalogo ? `
          <div class="optional-row" id="js-catalog-row">
            <span class="optional-row__icon" aria-hidden="true">▤</span>
            <span class="optional-row__title">Catálogo de conceptos</span>
            <span class="optional-row__tag">opcional</span>
            <span class="optional-row__default" id="js-catalog-status">${catSummary}</span>
            ${state.catalog
              ? `<button type="button" class="ctrl-link" id="js-catalog-open">Cambiarlo</button>
                 <button type="button" class="ctrl-link" id="js-catalog-replace">Volver al estándar (${CATALOGO_SEED.length})</button>`
              : `<button type="button" class="ctrl-link" id="js-catalog-open">Subir uno propio (.xlsx)</button>`}
            <div class="optional-row__host" id="js-catalog-upload" hidden></div>
          </div>
        ` : ''}
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

    // El renglón opcional no monta la zona de carga hasta que se la piden: el
    // caso normal es no tocarlo, y una zona de drop abierta ahí abajo compite
    // con los casilleros de arriba, que son los que hay que cargar.
    const abrirCatalogo = () => {
      catalogUploadEl.hidden = false;
      container.querySelector('#js-catalog-open')?.remove();
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
    };

    container.querySelector('#js-catalog-open')?.addEventListener('click', abrirCatalogo);

    // Estado vacío con salida (regla 5): del catálogo propio siempre se puede
    // volver al estándar, y el link dice a qué se vuelve.
    container.querySelector('#js-catalog-replace')?.addEventListener('click', async () => {
      if (!await showConfirm(`¿Volver al catálogo estándar? Se borra el catálogo propio de este cliente y se usan los ${CATALOGO_SEED.length} conceptos estándar.`)) return;
      try {
        await deleteClientCatalog(state.client.code);
      } catch {
        // Si no se pudo borrar, la pantalla NO puede decir que se borró: el
        // catálogo propio sigue guardado y se va a volver a usar en la próxima
        // corrida.
        showToast('No se pudo borrar el catálogo guardado — seguís usando el propio.', 'danger');
        return;
      }
      state.catalog = null;
      renderStepFiles(container, state, root);
    });

    if (state.tab) {
      renderTabuladoAnalysis(analysisEl, state.tab, catalogRows, state.selectedControls);
    }

    initFileUploadStep(container.querySelector('#js-tab-upload'), {
      clientCode:  state.client.code,
      fileType:    'tab_control',
      existingData: state.tab,
      required:    true,
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
  // `filesArea` queda para lo que NO es un casillero de archivo (los editores de
  // config de cada control). Los casilleros van arriba, en la grilla de 2
  // columnas; los opcionales, abajo, como renglón dashed.
  const filesArea    = container.querySelector('#js-control-files');
  const dropzonesEl  = container.querySelector('#js-file-dropzones');
  const opcionalesEl = container.querySelector('#js-optional-files');

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
      // Variaciones no se renderizó), cae a la grilla de casilleros como
      // cualquier otro, que es exactamente lo que hacía el chequeo de
      // `esVariaciones`.
      const slotPropio = fileSpec.slot ? container.querySelector(fileSpec.slot) : null;

      // Opcional de verdad (nadie lo gatea) → abajo, no arriba: cargado o no,
      // el lugar es el mismo, así no salta de sitio al cargarlo.
      const esOpcionalSuelto = fileSpec.optional
        && !CONTROLES_CON_OPCIONAL_GATEADO.includes(controlId);

      let uploadDiv;
      if (slotPropio) {
        uploadDiv = slotPropio;
      } else if (esOpcionalSuelto) {
        uploadDiv = mountOptionalRow(opcionalesEl, fileSpec, {
          cargado: !!state.controlFiles[controlId]?.[fileSpec.key],
        });
      } else {
        const slot = document.createElement('div');
        // Los flujos multi-archivo traen su propia lista adentro: a media
        // grilla quedan ilegibles.
        slot.className = flowFor(fileSpec.fileType) === 'single'
          ? 'dz-grid__slot'
          : 'dz-grid__slot dz-grid__slot--wide';
        dropzonesEl.appendChild(slot);
        uploadDiv = slot;
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
        // El tag "OBLIGATORIO" es sólo para los de arriba. Lo opcional ya lo
        // dice su renglón dashed, y los dos formatos de Resumen de Agrupadores
        // no son ni una cosa ni la otra (el gate pide uno de los dos, lo
        // explica el checklist del panel): sin tag antes que con uno que miente.
        required:    fileSpec.optional ? undefined : true,
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

  // El option vacío dice qué hacer (regla 5). El value sigue siendo '': "sin
  // elegir" no cambió de significado para el gate ni para el mapeo.
  const opts = (selected = '') =>
    ['', ...tabHeaders]
      .map(h => `<option value="${esc(h)}" ${h === selected ? 'selected' : ''}>${esc(h) || 'Elegí la columna del Tabulado…'}</option>`)
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

  // Cada campo, ya resuelto: qué se ve, de dónde salió el valor y si está
  // pendiente. Se calcula antes de pintar porque el contador del encabezado
  // ("5 de 6 listas") cuenta lo mismo que se dibuja abajo.
  const resueltos = fields
    .filter(f => !f.groupHeader)
    .map(f => {
      // Un valor guardado que ya no está entre los encabezados de ESTE
      // Tabulado (renumeración, otro layout) se trata como si no estuviera
      // asignado: el <select> ya lo dibuja en el placeholder (`opts()` no
      // encuentra `option` que matchear y el navegador cae a la primera),
      // pero antes el badge seguía diciendo "auto ✓" o "↺ sesión anterior" en
      // verde — el badge afirmaba lo contrario de lo que se veía en pantalla.
      // Tratarlo como vacío hace que salga "⚠ sin asignar", que es lo que hay
      // que corregir.
      const rawVal  = state.tabExtraConfig[f.key] || '';
      const omitido = esOmitido(rawVal);
      const val     = (!omitido && isStaleTabValue(rawVal, tabHeaders)) ? '' : rawVal;
      // Sólo OBLIGATORIA ofrece la vía de escape — CLAVE no admite omisión
      // (sin esto el archivo no sirve) y OPCIONAL no bloquea, así que
      // declararlo ausente no cambiaría nada. Hoy ningún campo de este panel
      // es CLAVE, pero el check queda explícito para cuando lo sea.
      const necessity = necessityOfKey('tab_control', f.key);
      return {
        f, val, omitido, necessity,
        level:        matchLevel(omitido ? '' : val, { autoDetected, hasSavedMapping: hasSavedConfig }),
        puedeOmitir:  necessity === NECESSITY.OBLIGATORIA,
        esBloqueante: necessity === NECESSITY.CLAVE || necessity === NECESSITY.OBLIGATORIA,
        // "Lista" = resuelta: tiene columna, o el analista declaró que el
        // archivo no la trae. Las dos son decisiones tomadas.
        lista:        !!val || omitido,
      };
    });
  const listas = resueltos.filter(r => r.lista).length;
  const porKey = new Map(resueltos.map(r => [r.f.key, r]));

  const panel = document.createElement('div');
  panel.dataset.tabExtraPanel = '';
  panel.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-4);border:1px solid var(--color-border);border-radius:12px;background:var(--color-surface);';
  panel.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:var(--sp-3);margin-bottom:var(--sp-1);">
      <h4 class="wizard-step-title" style="font-size:15px;flex:1;">¿Qué columna del Tabulado corresponde a cada campo?</h4>
      <span class="field-count" data-tab-extra-count>${listas} de ${resueltos.length} listas</span>
    </div>
    <p class="text-muted" style="margin:0 0 var(--sp-3);font-size:var(--text-sm);">
      ${autoDetected
        ? 'La app propone sola las que reconoce — revisá sobre todo las marcadas en amarillo.'
        : `Indicá qué columna del Tabulado corresponde a cada campo (${esc(headerTitle)}). FECHA_INI y FECHA_FIN se calculan del período.`}
    </p>
    <div class="field-grid">
      ${fields.map(f => {
        if (f.groupHeader) {
          return `
            <div class="field-grid__header">
              <span class="wizard-section-label" style="margin-bottom:0;">${esc(f.groupHeader)}</span>
            </div>
          `;
        }
        const r = porKey.get(f.key);
        const { name, code, help } = tabFieldParts(f.key, { fallbackLabel: f.label });
        // El amarillo es para lo que hay que ir a resolver. Una columna OPCIONAL
        // vacía no lo es —el control corre igual— y pintarla igual que las que
        // sí bloquean es el aviso que salta de más: a la tercera vez ya no se
        // mira ninguno. El badge y el <select> usan el MISMO nivel, o el campo
        // diría dos cosas distintas de sí mismo.
        const nivel = (r.omitido || (!r.lista && !r.esBloqueante)) ? 'none' : r.level;
        const style = matchSelectStyle(nivel);
        // La explicación de qué pasa si se queda sin columna sale de la
        // necesidad que declara el contrato — no de un texto por campo, que
        // podría decir algo distinto de lo que el gate hace de verdad.
        const queEs   = necessityHelp(r.necessity);
        const ayuda   = help ? `${help} ${queEs}` : queEs;
        // Pendiente = bloquea y no está resuelto. Ahí la explicación no se
        // esconde detrás del "?": baja a la vista (regla 3).
        const pendiente = r.esBloqueante && !r.lista;
        return `
          <div class="field" data-fu-field-group="${esc(f.key)}">
            <div class="field__head">
              <span class="field__label">${esc(name)}</span>
              ${code ? `<span class="field__code">${esc(code)}</span>` : ''}
              ${r.esBloqueante ? '<span class="field__req" title="Obligatoria para este control" aria-label="obligatoria">*</span>' : ''}
              ${help ? `<span data-field-help="${esc(f.key)}"></span>` : ''}
              <span class="field__spacer"></span>
              ${fieldBadgeHtml(nivel, { omitido: r.omitido })}
            </div>
            <div class="field__row">
              <select class="form-select" data-tab-extra-key="${esc(f.key)}"${r.omitido ? ' disabled' : ''}
                style="${style}${r.omitido ? 'opacity:0.6;' : ''}">
                ${r.omitido
                  ? '<option value="">Declarada ausente en este archivo</option>'
                  : opts(r.val)}
              </select>
              ${r.puedeOmitir ? `
                <button type="button" class="btn btn--sm ${r.omitido ? 'btn--primary' : 'btn--ghost'}"
                  data-tab-extra-omit="${esc(f.key)}" aria-pressed="${r.omitido}"
                  title="Declarar que este archivo no trae esta columna">⊘</button>
              ` : ''}
            </div>
            ${r.omitido
              ? `<div class="field__help field__help--muted">
                   Marcaste que este Tabulado no la trae — se computa como sin dato, no como cero.
                   <button type="button" class="ctrl-link" data-tab-extra-omit="${esc(f.key)}">Deshacer</button>
                 </div>`
              : (pendiente ? `<div class="field__help">${esc(ayuda)}</div>` : '')}
            <div data-fu-col-hint>${r.omitido ? '' : hintFor(f.key, r.val)}</div>
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
      const estaba = !!state.tabExtraConfig[k];
      if (sel.value) state.tabExtraConfig[k] = sel.value;
      else delete state.tabExtraConfig[k];
      await guardarConfig();
      // Pasar de "sin asignar" a asignada (o al revés) cambia el badge, el
      // contador "X de Y listas" y si la explicación baja a la vista: se
      // redibuja el panel para que las tres cosas digan lo mismo que el
      // <select>. Cambiar de una columna a otra no cambia ninguna, así que ahí
      // no se redibuja nada — el analista no pierde el foco por gusto.
      if (estaba !== !!sel.value) {
        renderTabExtraConfig(container, state, root, { hasBrutos, hasGsPers, hasNr });
      }
    });
  });

  // El "?" de cada campo: la explicación larga vive detrás de él (regla 3) y no
  // en un `title`, que en un touchpad no se ve nunca. Se reusa el popover que ya
  // está en el header y en el Paso 1 — con su Escape, su click-afuera y su aria.
  panel.querySelectorAll('[data-field-help]').forEach(host => {
    const key = host.dataset.fieldHelp;
    const { name, code, help } = tabFieldParts(key, {});
    const necessity = necessityOfKey('tab_control', key);
    renderHelpPopover(host, {
      label: code ? `${name} · ${code}` : name,
      bodyHtml: `
        <p style="margin:0 0 var(--sp-2);">${esc(help)}</p>
        <p class="help-popover__note" style="margin:0;">${esc(necessityHelp(necessity))}</p>
      `,
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
    // La corrida se apodera de la pantalla: el formulario desaparece y en su
    // lugar queda el progreso, con "Cancelar" como única acción (regla 2).
    executeControls(state, container, root);
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

  mountResultsHeader({
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

const EXEC_TIER_RANK  = { error: 0, warn: 1, ok: 2, info: 3 };

/**
 * La corrida en vivo: una barra general + una tarjeta por control (terminado /
 * corriendo / en cola) y, al final, la runbar con el resumen y "Ver resultados".
 *
 * **La barra dice sólo lo que el motor sabe.** Los controles corren uno detrás
 * del otro y cada `run()` es sincrónico: adentro de un control no hay progreso
 * que informar, así que la barra mide *controles terminados sobre el total* —
 * el único avance real— y la tarjeta del que está corriendo muestra un spinner
 * sin porcentaje. Un porcentaje inventado dentro del control se leería como
 * información y no lo sería.
 *
 * Entre control y control se cede el hilo (`yieldToPaint`) por dos razones: sin
 * eso el navegador no llega a pintar el cambio de estado de las tarjetas, y el
 * clic en "Cancelar" no se procesaría hasta que terminara todo.
 */
async function executeControls(state, container, root) {
  const quickRun = state.quickRun === true;
  const tab = state.tab;
  const totalLegajos = tabEmpleadosCount(state);

  // Ceder el hilo para que el navegador pinte y para que el clic en "Cancelar"
  // llegue a procesarse. `setTimeout` y no `requestAnimationFrame`: con la
  // pestaña en segundo plano rAF no dispara y la corrida quedaría colgada.
  const yieldToPaint = () => new Promise(r => setTimeout(r, 0));

  const units = state.selectedControls
    .map(id => ({ id, ctrl: CONTROL_REGISTRY[id] }))
    .filter(u => u.ctrl)
    .map(u => ({
      id: u.id, ctrl: u.ctrl, label: u.ctrl.label || u.id,
      status: 'queued', ms: null, tier: null, summary: null,
    }));

  const ui = {
    units,
    phase:        'prep',   // prep → running → done | cancelled | error
    filesUsed:    runFilesUsed(state),
    totalLegajos,
    thresholdPct: DEFAULT_SEMAFORO_THRESHOLD_PCT,
    elapsedMs:    null,
    cancelRequested: false,
    errorMessage: null,
    onCancel: () => {
      // El control que ya está corriendo no se puede interrumpir a mitad de
      // camino: la corrida se corta cuando ése termine, y se dice.
      ui.cancelRequested = true;
      paint();
    },
    onRerun: () => executeControls(state, container, root),
  };
  const paint = () => renderRunScreen(container, state, ui, root);

  // Mientras corre, las flechas ← → no cambian de paso: el wizard se movería
  // abajo de la corrida. Se vuelven a enganchar en el próximo render().
  state._navController?.abort();

  const t0 = performance.now();
  paint();

  try {
    ui.thresholdPct = (await getConfig('semaforoThresholdPct')) ?? DEFAULT_SEMAFORO_THRESHOLD_PCT;
    const thresholdPct = ui.thresholdPct;

    // ── Preparación · configs y archivos de la corrida ───────────────────────
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

    // ── Los controles, uno por uno ───────────────────────────────────────────
    const runResults = {};
    ui.phase = 'running';
    paint();
    await yieldToPaint();

    for (const u of units) {
      if (ui.cancelRequested) break;

      const controlId = u.id;
      const ctrl      = u.ctrl;

      u.status = 'running';
      paint();
      await yieldToPaint();
      const tCtrl = performance.now();

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

      // El semáforo de la tarjeta sale del MISMO cálculo que ordena la cascada
      // de resultados (computeSemaforoStatus sobre la unidad declarada) — no de
      // `summary.status`, que marca amarillo con una sola diferencia.
      u.summary = ctrl.summarize ? ctrl.summarize(runResults[controlId]) : null;
      u.tier = !u.summary ? 'info'
        : u.summary.status === 'error' ? 'error'
        : u.summary.unitsTotal == null ? 'info'
        : computeSemaforoStatus(u.summary.unitsWithDiff, u.summary.unitsTotal, thresholdPct);
      u.ms     = performance.now() - tCtrl;
      u.status = 'done';
      paint();
    }

    // ── Cancelada: lo que ya se calculó no se guarda ─────────────────────────
    // El run creado arriba queda con sus archivos pero sin resultados, y lo dice
    // en sus notas: media corrida guardada como si fuera una corrida es la clase
    // de número que después nadie revisa.
    if (ui.cancelRequested) {
      if (runId != null) {
        const nota = 'Corrida cancelada por el analista — sin resultados guardados.';
        await updateControlRun(runId, { notes: state.notes ? `${state.notes} · ${nota}` : nota });
      }
      ui.phase = 'cancelled';
      ui.elapsedMs = performance.now() - t0;
      paint();
      return;
    }

    // ── Guardado de resultados ───────────────────────────────────────────────
    if (!quickRun) {
      for (const u of units) {
        if (runResults[u.id] !== undefined) {
          await saveControlRunResults(runId, u.id, runResults[u.id]);
        }
      }
    }

    // Errores primero: el orden de la cascada de resultados y el de las tarjetas
    // de la corrida terminada salen de la misma lista.
    const tierOrder = units
      .slice()
      .sort((a, b) => EXEC_TIER_RANK[a.tier] - EXEC_TIER_RANK[b.tier])
      .map(u => u.id);

    // La corrida no navega sola: termina en la runbar ("Corrida completa en X s")
    // y el analista entra a los resultados cuando quiere — el resumen de la
    // corrida es la última pantalla donde se lee qué tardó y qué salió en rojo.
    ui.phase     = 'done';
    ui.elapsedMs = performance.now() - t0;
    ui.onSeeResults = () => {
      if (runId != null) {
        window.location.hash = `#/control-results/${runId}`;
        return;
      }
      // Ejecución rápida: no hay run persistido para navegar, así que mostramos
      // los resultados inline (cascada errores-primero) bajo la cabecera 1C — el
      // popover "Detalles del run" avisa que no se guardó.
      state.lastRunId              = runId;
      state.lastRunResults         = runResults;
      state.lastRunIsDefinitive    = false;
      state.lastRunTierOrder       = tierOrder;
      state.lastRunTierByControlId = Object.fromEntries(units.map(u => [u.id, u.tier]));
      render(root, state);
    };
    paint();

  } catch (err) {
    console.error('[controlsWizard] Error al ejecutar:', err);
    ui.phase        = 'error';
    ui.elapsedMs    = performance.now() - t0;
    ui.errorMessage = err.message;
    paint();
  }
}

// ── Pantalla de la corrida ────────────────────────────────────────────────────

/**
 * Los archivos con los que se está corriendo, sin repetir: el mismo Tabulado lo
 * usan todos los controles y un reporte puede estar compartido entre dos.
 */
function runFilesUsed(state) {
  const files = [];
  const push = (label, fileData) => {
    if (!fileData?.fileName) return;
    if (files.some(f => f.fileName === fileData.fileName)) return;
    files.push({
      label,
      fileName: fileData.fileName,
      rows: fileData.parseMetadata?.totalRows ?? null,
    });
  };

  push('Tabulado', state.tab);
  for (const id of state.selectedControls) {
    const ctrl = CONTROL_REGISTRY[id];
    if (!ctrl) continue;
    for (const f of ctrl.additionalFiles) push(f.label, state.controlFiles[id]?.[f.key]);
  }
  return files;
}

const RUN_UNIT_PLURAL = { legajo: 'legajos', cc: 'centros de costo', lista: 'listas' };

function formatSeconds(ms) {
  // Un control chico corre en milisegundos y "0,0 s" se lee como si no hubiera
  // corrido. Se dice que fue menos de una décima, que es lo que pasó.
  if (ms < 100) return 'menos de 0,1 s';
  return `${(ms / 1000).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

/** Lo que la tarjeta de un control terminado dice del resultado, en una pill. */
function runCardBadge(u) {
  if (!u.summary || u.summary.unitsTotal == null) return null;
  if (u.summary.status === 'error') return { tone: 'error', text: 'no se pudo completar' };
  const n = u.summary.unitsWithDiff || 0;
  if (n === 0) return { tone: 'ok', text: 'sin diferencias' };
  const unidad = RUN_UNIT_PLURAL[u.summary.unit] || `${u.summary.unit || 'unidad'}s`;
  return {
    tone: u.tier === 'error' ? 'error' : 'warn',
    text: `${n.toLocaleString('es-AR')} ${n === 1 ? (u.summary.unit || 'unidad') : unidad} con diferencia`,
  };
}

function renderRunScreen(container, state, ui, root) {
  const total    = ui.units.length;
  const doneList = ui.units.filter(u => u.status === 'done');
  const done     = doneList.length;
  const terminada = ui.phase === 'done' || ui.phase === 'cancelled' || ui.phase === 'error';

  // Errores primero cuando terminó; mientras corre, el orden de ejecución (que
  // es el que el analista está mirando avanzar).
  const cards = terminada
    ? ui.units.slice().sort((a, b) => EXEC_TIER_RANK[a.tier ?? 'info'] - EXEC_TIER_RANK[b.tier ?? 'info'])
    : ui.units;

  const titulo = ui.phase === 'cancelled' ? 'Corrida cancelada'
    : ui.phase === 'error' ? 'La corrida se cortó por un error'
    : ui.phase === 'done'  ? 'Listo'
    : 'Ejecutando los controles…';

  container.innerHTML = `
    <h3 class="wizard-step-title">${esc(titulo)}</h3>
    <p class="text-muted" style="margin:0 0 var(--sp-4);font-size:var(--text-sm);">
      ${terminada
        ? 'Todo corrió en tu navegador — los datos de los empleados no salieron de acá.'
        : 'Todo corre en tu navegador — no cierres la pestaña hasta que termine.'}
    </p>

    <div class="wizard-onepane">
      <div class="wizard-onepane__main">
        <div id="js-run-bar"></div>
        <div class="exec-progress ${!terminada && done === 0 ? 'exec-progress--indeterminate' : ''}"
             role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"
             aria-label="Controles terminados">
          <div class="exec-progress__fill" style="width:${total ? Math.round((done / total) * 100) : 0}%;"></div>
        </div>
        <div class="run-cards">
          ${cards.map(u => runCardHtml(u, ui)).join('')}
        </div>
      </div>
      <div class="wizard-onepane__side">
        <div>
          <span class="wizard-section-label">Esta corrida</span>
          <p class="run-side__line">${esc(state.client.name)} · ${esc(periodToLabel(state.period))}</p>
          <p class="run-side__line run-side__line--muted">
            ${total} control${total === 1 ? '' : 'es'} · ${ui.filesUsed.length} archivo${ui.filesUsed.length === 1 ? '' : 's'}
          </p>
        </div>
        <div>
          <span class="wizard-section-label">Archivos usados</span>
          ${ui.filesUsed.length
            ? ui.filesUsed.map(f => `
                <p class="run-side__line" title="${esc(f.fileName)}">
                  ${esc(f.label)}${f.rows != null ? ` · ${f.rows.toLocaleString('es-AR')} filas` : ''}
                </p>`).join('')
            : '<p class="run-side__line run-side__line--muted">Estos controles no piden archivos.</p>'}
        </div>
        ${thresholdsSectionHtml()}
      </div>
    </div>
  `;

  // El "← Anterior" del pie se va mientras dura la corrida: el paso no puede
  // cambiar abajo de un control que está corriendo. Vuelve solo en el próximo
  // render() (al volver a los archivos o al salir a resultados).
  const nav = root?.querySelector('#js-wizard-nav');
  if (nav) nav.style.display = 'none';

  renderRunBar(container.querySelector('#js-run-bar'), state, ui, root, { done, total });
  syncRunHeader(state, ui, { done, total });
}

function runCardHtml(u, ui) {
  if (u.status === 'done') {
    const badge  = runCardBadge(u);
    const cruzados = u.summary?.unitsTotal != null
      ? `${u.summary.unitsTotal.toLocaleString('es-AR')} ${RUN_UNIT_PLURAL[u.summary.unit] || 'unidades'} cruzados · `
      : '';
    return `
      <div class="run-card run-card--done">
        <span class="run-card__mark" aria-hidden="true">✓</span>
        <div class="run-card__body">
          <div class="run-card__title">${esc(u.label)}</div>
          <span class="run-card__meta">${esc(cruzados)}terminado en ${esc(formatSeconds(u.ms ?? 0))}</span>
        </div>
        ${badge ? `<span class="run-card__badge run-card__badge--${esc(badge.tone)}">${esc(badge.text)}</span>` : ''}
      </div>`;
  }

  if (u.status === 'running') {
    // Sin porcentaje a propósito: adentro de un control el motor no reporta
    // avance, y un número que no sale de ningún lado se lee como si saliera.
    const detalle = ui.totalLegajos && u.ctrl.tabRequired !== false
      ? `Cruzando ${ui.totalLegajos.toLocaleString('es-AR')} legajos contra el Tabulado…`
      : 'Procesando…';
    return `
      <div class="run-card run-card--running">
        <span class="run-card__spinner" aria-hidden="true"></span>
        <div class="run-card__body">
          <div class="run-card__title">${esc(u.label)}</div>
          <span class="run-card__meta">${esc(detalle)}</span>
          <div class="run-card__bar"><div class="run-card__bar-fill"></div></div>
        </div>
      </div>`;
  }

  const nota = ui.cancelRequested ? 'Cancelado — no se ejecutó' : 'En cola';
  return `
    <div class="run-card run-card--queued">
      <span class="run-card__mark" aria-hidden="true">${ui.units.indexOf(u) + 1}</span>
      <div class="run-card__body">
        <div class="run-card__title">${esc(u.label)}</div>
        <span class="run-card__meta">${esc(nota)}</span>
      </div>
    </div>`;
}

/**
 * La runbar del final: cuánto tardó, cómo salió (rojo primero) y la salida a
 * los resultados. Mientras la corrida avanza no hay runbar.
 */
function renderRunBar(el, state, ui, root, { done, total }) {
  if (!el) return;
  if (ui.phase !== 'done' && ui.phase !== 'cancelled' && ui.phase !== 'error') {
    el.innerHTML = '';
    return;
  }

  const volver = () => { state.lastRunResults = null; state.step = 1; render(root, state); };

  if (ui.phase === 'error') {
    el.innerHTML = `
      <div class="runbar runbar--error">
        <span class="runbar__mark runbar__mark--error" aria-hidden="true">!</span>
        <div class="runbar__body">
          <div class="runbar__title">La corrida se cortó por un error</div>
          <span class="runbar__meta runbar__meta--error">${esc(ui.errorMessage || 'Error desconocido')}</span>
        </div>
        <div class="runbar__actions">
          <button type="button" class="btn btn--secondary btn--sm" id="js-run-back">← Volver a los archivos</button>
        </div>
      </div>`;
    el.querySelector('#js-run-back').addEventListener('click', volver);
    return;
  }

  if (ui.phase === 'cancelled') {
    el.innerHTML = `
      <div class="runbar runbar--warn">
        <span class="runbar__mark runbar__mark--warn" aria-hidden="true">⏹</span>
        <div class="runbar__body">
          <div class="runbar__title">Corrida cancelada a los ${esc(formatSeconds(ui.elapsedMs ?? 0))}</div>
          <span class="runbar__meta">
            ${done} de ${total} control${total === 1 ? '' : 'es'} habían terminado — no se guardó ningún resultado.
          </span>
        </div>
        <div class="runbar__actions">
          <button type="button" class="btn btn--secondary btn--sm" id="js-run-back">← Volver a los archivos</button>
          <button type="button" class="btn btn--primary btn--sm" id="js-run-rerun">↺ Ejecutar de nuevo</button>
        </div>
      </div>`;
    el.querySelector('#js-run-back').addEventListener('click', volver);
    el.querySelector('#js-run-rerun').addEventListener('click', () => ui.onRerun?.());
    return;
  }

  // Terminada: el veredicto en una línea, con lo rojo adelante.
  const conteos = ['error', 'warn', 'ok'].map(t => ({
    t, n: ui.units.filter(u => u.tier === t).length,
  })).filter(x => x.n > 0);
  const soloReportes = ui.units.every(u => u.tier === 'info');
  const partes = conteos.map(({ t, n }) => {
    const color = t === 'error' ? 'rojo' : t === 'warn' ? 'amarillo' : 'verde';
    const txt = `${n} control${n === 1 ? '' : 'es'} en ${color}`;
    return t === 'error'
      ? `<strong class="runbar__meta--error">${esc(txt)}</strong>`
      : esc(txt);
  });
  const nInfo = ui.units.filter(u => u.tier === 'info').length;
  if (nInfo > 0 && !soloReportes) partes.push(esc(`${nInfo} de generación de reporte`));

  el.innerHTML = `
    <div class="runbar runbar--ok">
      <span class="runbar__mark runbar__mark--ok" aria-hidden="true">✓</span>
      <div class="runbar__body">
        <div class="runbar__title">Corrida completa en ${esc(formatSeconds(ui.elapsedMs ?? 0))}</div>
        <span class="runbar__meta">
          ${soloReportes
            ? 'Esta corrida sólo incluye controles de generación de reporte.'
            : partes.join(' · ')}
        </span>
      </div>
      <div class="runbar__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="js-run-rerun">↺ Ejecutar de nuevo</button>
        <button type="button" class="btn btn--primary btn--sm" id="js-run-results">Ver resultados →</button>
      </div>
    </div>`;
  el.querySelector('#js-run-results').addEventListener('click', () => ui.onSeeResults?.());
  el.querySelector('#js-run-rerun').addEventListener('click', () => ui.onRerun?.());
}

/**
 * La barra superior durante la corrida: los pasos, en qué control va y una sola
 * acción — "Cancelar" mientras corre, "Ver resultados →" cuando terminó. Sin
 * "volver": el paso no puede cambiar abajo de una corrida en curso.
 */
function syncRunHeader(state, ui, { done, total }) {
  const corriendo = ui.phase === 'prep' || ui.phase === 'running';
  const hintTexto = ui.cancelRequested && corriendo
    ? 'Cancelando al terminar el control en curso…'
    : corriendo
      ? (ui.phase === 'prep'
          ? 'Preparando la corrida…'
          : `Corriendo ${Math.min(done + 1, total)} de ${total}…`)
      : '';

  setHeader({
    back: corriendo ? null : { label: '← Inicio', href: '#/' },
    context: state.client?.name
      ? { name: state.client.name, meta: state.period ? periodToLabel(state.period) : '' }
      : null,
    steps: { labels: WIZARD_STEP_LABELS, current: 2 },
    hint: hintTexto ? { text: hintTexto } : null,
    primary: corriendo
      ? {
          id: 'js-run-cancel',
          label: 'Cancelar',
          variant: 'secondary',
          disabled: ui.cancelRequested,
          onClick: ui.onCancel,
        }
      : ui.phase === 'done'
        ? { id: 'js-run-results-header', label: 'Ver resultados →', onClick: () => ui.onSeeResults?.() }
        : null,
  });
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
