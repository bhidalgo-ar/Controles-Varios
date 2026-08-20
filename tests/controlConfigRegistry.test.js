// controlConfigRegistry.test.js — La config por control, declarada (Fase 4, Paso 6)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/controlConfigRegistry.test.js
//
// Cada config de control estaba cableada en SIETE lugares de controlsWizard.js:
// el import, la carga, el state, una constante de ids, el editor del Paso 2, el
// guardado al ejecutar y el `mapping` que ve `run()`. Nada ligaba los siete —
// agregar una config y olvidarse del `mapping` daba un control corriendo con su
// default sin que nada avisara, y el resultado sale coherente y mal, que es la
// clase de error que nadie detecta.
//
// Ahora se declaran en el registry y el wizard deriva los cinco momentos. Este
// test es el guard: una declaración incompleta se ve acá.

globalThis.document = { addEventListener: () => {} };

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const conConfig = Object.entries(CONTROL_REGISTRY).filter(([, c]) => (c.config || []).length > 0);
const todas = conConfig.flatMap(([id, c]) => c.config.map(cfg => ({ ...cfg, controlId: id })));
const porClave = new Map();
for (const cfg of todas) {
  if (!porClave.has(cfg.key)) porClave.set(cfg.key, []);
  porClave.get(cfg.key).push(cfg);
}

assert(`hay controles con config declarada (${conConfig.length})`, conConfig.length >= 10);
// La 13ª es `novedades_importador_config`, del generador de importador de
// novedades (D-070): el mapeo rótulo → código y la unidad organizativa.
// La 14ª es `novedades_liquidacion_config`, del cruce de novedades contra la
// liquidación (D-070): los conceptos que no se comparan por unidad distinta y los
// que no llegan a la liquidación.
assert(`son 14 claves distintas de controlConfigs (hoy: ${[...porClave.keys()].sort().join(', ')})`,
  porClave.size === 14);

// ── Forma de cada declaración ───────────────────────────────────────────────

for (const cfg of todas) {
  const n = `${cfg.controlId}.${cfg.key}`;
  assert(`${n}: tiene key`, typeof cfg.key === 'string' && cfg.key.length > 0);
  assert(`${n}: tiene stateKey`, typeof cfg.stateKey === 'string' && cfg.stateKey.length > 0);
  assert(`${n}: declara default() como función`, typeof cfg.default === 'function');
  if (cfg.editor)       assert(`${n}: editor es una función`, typeof cfg.editor === 'function');
  if (cfg.editorProps)  assert(`${n}: editorProps es una función`, typeof cfg.editorProps === 'function');
  if (cfg.mappingValue) assert(`${n}: mappingValue es una función`, typeof cfg.mappingValue === 'function');
  if (cfg.mappingKey)   assert(`${n}: mappingKey es un string`, typeof cfg.mappingKey === 'string');
  // Un editor sin `mappingKey` es una config que el analista puede tocar y que
  // el control nunca ve — el default silencioso más caro de este mecanismo.
  if (cfg.editor) assert(`${n}: si tiene editor, la config le llega al control`, !!cfg.mappingKey);
}

// `default()` devuelve una COPIA nueva cada vez. Si devolviera una referencia
// compartida, dos clientes en la misma sesión editarían el mismo objeto: el
// editor muta la config en el lugar.
for (const cfg of todas) {
  const a = cfg.default(), b = cfg.default();
  if (a && typeof a === 'object') {
    assert(`${cfg.controlId}.${cfg.key}: default() no devuelve una referencia compartida`, a !== b);
    assert(`${cfg.controlId}.${cfg.key}: …pero sí el mismo valor`, JSON.stringify(a) === JSON.stringify(b));
  }
}

// ── Una clave compartida se declara igual en todos lados ────────────────────
// Brutos/GS Pers/NR comparten las columnas del Tabulado, y Rend vs Tabulado /
// Rend x EE / Rend vs Asiento comparten la agrupación de conceptos. Si dos
// entradas de la misma clave discreparan en `stateKey` o en `default`, el
// wizard cargaría una y el control leería la otra.

for (const [key, decls] of porClave) {
  if (decls.length < 2) continue;
  const stateKeys = new Set(decls.map(d => d.stateKey));
  assert(`${key}: la comparten ${decls.length} controles y todos usan el mismo stateKey`,
    stateKeys.size === 1);
  const defaults = new Set(decls.map(d => JSON.stringify(d.default())));
  assert(`${key}: …y el mismo default`, defaults.size === 1);
  const mappingKeys = new Set(decls.map(d => d.mappingKey ?? null));
  assert(`${key}: …y el mismo mappingKey`, mappingKeys.size === 1);
}

// ── `readOnly`: quién guarda y quién sólo lee ───────────────────────────────
// La agrupación de conceptos la editan y persisten Rend vs Tabulado y Rend x
// EE; Rend vs Asiento la usa. Sin `readOnly`, correr sólo Rend vs Asiento
// persistiría una agrupación que su pantalla nunca mostró.

const grouping = porClave.get('rendvstabu_concept_grouping');
assert('la agrupación de conceptos la declaran 3 controles', grouping.length === 3);
assert('…y sólo Rend vs Asiento la tiene readOnly',
  grouping.filter(d => d.readOnly).map(d => d.controlId).join(',') === 'rend_vs_asiento');

// Las dos de Variaciones también: `variaciones_config` no tiene editor todavía,
// y el mapeo de conceptos lo guarda su propio panel cuando el analista
// confirma. Guardarlas al ejecutar sería escribir lo mismo por otra vía.
for (const key of ['variaciones_config', 'variaciones_concept_map']) {
  assert(`${key}: es readOnly (la guarda su panel, no el ejecutar)`,
    porClave.get(key).every(d => d.readOnly === true));
}

// Toda config con editor tiene que ser guardable: un panel que el analista toca
// y no se persiste le hace reconfigurar todos los meses.
for (const cfg of todas) {
  if (!cfg.editor) continue;
  assert(`${cfg.controlId}.${cfg.key}: tiene editor, así que NO puede ser readOnly`, !cfg.readOnly);
}

// ── El `mapping` que ve run(), por control ──────────────────────────────────
// Es lo que este paso no puede cambiar: un control que recibe otra config
// devuelve un número coherente y equivocado. Se fija acá control por control.

const st = {
  rendVsTabuGrouping:    { grupos: ['x'] },
  rvaConfig:             { cuentaCats: {} },
  agrupadoresConfig:     { selectedGrouperIds: [1] },
  acreditacionesConfig:  { splitByEmpresa: true },
  acumuladoresConfig:    { regimen: 'RG4030' },
  finadietAsientoConfig: { fechaEmision: '2026-04-30' },
  tabExtraConfig:        { tabSalBaseColumn: 'SUELDO' },
  variacionesConfig:     null,
  variacionesMapGuardado: null,
};

function mappingDe(controlId, state) {
  const m = {};
  for (const cfg of (CONTROL_REGISTRY[controlId]?.config || [])) {
    if (!cfg.mappingKey) continue;
    if (cfg.mappingValue) m[cfg.mappingKey] = cfg.mappingValue(state);
    else if (state[cfg.stateKey]) m[cfg.mappingKey] = state[cfg.stateKey];
  }
  return m;
}

const ESPERADO = {
  brutos:                 [],
  nr_reporte:             [],
  rend_vs_tabu:           ['conceptGrouping'],
  rend_x_ee:              ['conceptGrouping'],
  rend_vs_asiento:        ['conceptGrouping', 'rvaConfig'],
  agrupadores:            ['agrupadoresConfig'],
  acreditaciones_reporte: ['acreditacionesConfig'],
  acumuladores_ganancias: ['acumuladoresConfig'],
  finadiet_asiento:       ['finadietAsientoConfig'],
  variaciones_sueldos:    [],
};
for (const [controlId, claves] of Object.entries(ESPERADO)) {
  assert(`${controlId}: run() recibe exactamente [${claves.join(', ') || '—'}]`,
    Object.keys(mappingDe(controlId, st)).sort().join(',') === [...claves].sort().join(','));
}

// Las columnas del Tabulado NO viajan por `mappingKey`: se mergean dentro de
// `mapping.tab` junto al mapeo del propio archivo. Si algún día alguien les
// pone un mappingKey, llegarían por dos vías con formas distintas.
assert('las columnas del Tabulado no declaran mappingKey (se mergean en mapping.tab)',
  porClave.get('brutos_tab_config').every(d => !d.mappingKey));

// El asiento de FINADIET viaja SIEMPRE, incluso sin configurar: su `run()`
// distingue `null` ("nunca se configuró", cae a la semilla) de una config igual
// a la semilla (D-035). Es la única con esa necesidad, y por eso es la única
// donde `mappingValue` devuelve algo con el state vacío.
const sinConfigurar = { ...st, finadietAsientoConfig: null, rendVsTabuGrouping: null };
assert('finadiet_asiento recibe la config aunque sea null (el run() lo distingue)',
  'finadietAsientoConfig' in mappingDe('finadiet_asiento', sinConfigurar)
  && mappingDe('finadiet_asiento', sinConfigurar).finadietAsientoConfig === null);
assert('la agrupación de conceptos sin configurar NO viaja (no le dice nada al control)',
  !('conceptGrouping' in mappingDe('rend_vs_tabu', sinConfigurar)));

// ── Toda config declarada tiene un control que la use ───────────────────────
// Una clave huérfana se carga en cada entrada al wizard y no la lee nadie.

const { CONTROL_REGISTRY: reg } = { CONTROL_REGISTRY };
for (const [key, decls] of porClave) {
  assert(`${key}: la declara al menos un control que existe en el registry`,
    decls.every(d => reg[d.controlId] !== undefined));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
