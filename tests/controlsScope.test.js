// controlsScope.test.js — Segmentación de controles por cliente/sistema
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/controlsScope.test.js
//
// Ver specs/segmentacion-controles-por-cliente.md. Confirma que:
//   - Marval (MARVAL, meta4) ve los 11 controles.
//   - Un cliente nuevo cualquiera (meta4 o axton) ve sólo "agrupadores".
//   - scope 'sistema' aplica por sourceSystem, no por cliente puntual.
//   - el override de admin (controlConfigs.status) gana por sobre el scope.

globalThis.document = { addEventListener: () => {} };

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { controlAppliesToClient, filterControlsForClient, scopeMatchesClient, scopeLabel } =
  await import('./js/controls/scope.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const allControls = Object.values(CONTROL_REGISTRY);
const marval  = { code: 'MARVAL',  sourceSystem: 'meta4', ccts: [], attributes: {} };
const nuevoM4 = { code: 'NUEVOM4', sourceSystem: 'meta4', ccts: [], attributes: {} };
const nuevoAx = { code: 'NUEVOAX', sourceSystem: 'axton', ccts: [], attributes: {} };

// ── Clasificación actual (decisión de Guillermo, 2026-07-31) ────────────────

assert('Marval ve los 11 controles',
  filterControlsForClient(allControls, marval).length === 11);

assert('un cliente Meta4 nuevo ve sólo "agrupadores"',
  filterControlsForClient(allControls, nuevoM4).map(c => c.id).join(',') === 'agrupadores');

assert('un cliente Axton nuevo ve sólo "agrupadores"',
  filterControlsForClient(allControls, nuevoAx).map(c => c.id).join(',') === 'agrupadores');

assert('los 10 controles de Marval son scope "cliente"',
  allControls.filter(c => c.id !== 'agrupadores').every(c => c.scope === 'cliente'));

assert('agrupadores es scope "general"',
  CONTROL_REGISTRY.agrupadores.scope === 'general');

// ── scope 'sistema' (mecanismo, sin ningún control real usándolo todavía) ──

const controlDeSistema = { id: 'x', scope: 'sistema', scopeMeta: { sourceSystems: ['meta4'] } };
assert('scope sistema: aplica a un cliente meta4', scopeMatchesClient(controlDeSistema, nuevoM4) === true);
assert('scope sistema: no aplica a un cliente axton', scopeMatchesClient(controlDeSistema, nuevoAx) === false);

// ── scope 'convenio' (mecanismo, idem) ──────────────────────────────────────

const controlDeConvenio = { id: 'y', scope: 'convenio', scopeMeta: { ccts: ['Comercio'] } };
const clienteComercio = { code: 'X', sourceSystem: 'meta4', ccts: ['Comercio', 'UOM'] };
const clienteOtroCct  = { code: 'Y', sourceSystem: 'meta4', ccts: ['UOM'] };
assert('scope convenio: aplica si el cliente tiene el CCT', scopeMatchesClient(controlDeConvenio, clienteComercio) === true);
assert('scope convenio: no aplica si no tiene el CCT', scopeMatchesClient(controlDeConvenio, clienteOtroCct) === false);

// ── El override de admin gana sobre el scope ────────────────────────────────

const brutos = CONTROL_REGISTRY.brutos; // scope 'cliente', sólo MARVAL

assert('sin override: Brutos no aplica a un cliente nuevo',
  controlAppliesToClient(brutos, nuevoM4, undefined) === false);

assert('forzado_activo: Brutos SÍ aplica a un cliente nuevo aunque el scope lo excluya',
  controlAppliesToClient(brutos, nuevoM4, { status: 'forzado_activo' }) === true);

assert('forzado_no_aplica: Agrupadores NO aplica a Marval aunque el scope lo incluya',
  controlAppliesToClient(CONTROL_REGISTRY.agrupadores, marval, { status: 'forzado_no_aplica' }) === false);

assert('no_aplica: excluye igual que forzado_no_aplica',
  controlAppliesToClient(CONTROL_REGISTRY.agrupadores, marval, { status: 'no_aplica' }) === false);

assert('status "activo" no altera la resolución por scope (Brutos sigue sin aplicar a un cliente nuevo)',
  controlAppliesToClient(brutos, nuevoM4, { status: 'activo' }) === false);

// ── scopeLabel (columna informativa de #/admin) ─────────────────────────────

assert('scopeLabel de un control general', scopeLabel(CONTROL_REGISTRY.agrupadores) === 'Todos los clientes');
assert('scopeLabel de un control de cliente incluye MARVAL', scopeLabel(brutos).includes('MARVAL'));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
