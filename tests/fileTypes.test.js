// fileTypes.test.js — La ficha de cada tipo de archivo (Fase 4, Paso 1)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/fileTypes.test.js
//
// Este test es el guard que antes no existía. Agregar un tipo de archivo tocaba
// ~12 puntos repartidos entre `fileUpload.js` y `controlsWizard.js`, y olvidarse
// de uno no rompía nada visible: el archivo subía igual y algo quedaba mal en
// silencio. Acá se afirma que toda ficha está completa y que todo tipo que algún
// control pide de verdad existe.

globalThis.document = { addEventListener: () => {} };

// fileUpload.js arrastra js/db.js — necesita Dexie sobre una IndexedDB falsa,
// igual que tests/exportContracts.test.js.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const {
  FILE_TYPES, fieldsFor, fileTypeLabel, isFixedFormat, hasNameMapping,
  metaLineFor, detectHeadersFor, parseFor,
} = await import('./js/ui/fileTypes.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const entries = Object.entries(FILE_TYPES);

assert('hay al menos 16 tipos de archivo declarados', entries.length >= 16);

// ── Forma de cada ficha ──────────────────────────────────────────────────────
// Lo que el módulo garantiza a quien la consuma. Una ficha a medias es
// exactamente el default silencioso que este registro existe para evitar.

for (const [fileType, def] of entries) {
  assert(`${fileType}: tiene label no vacío`,
    typeof def.label === 'string' && def.label.length > 0);
  assert(`${fileType}: declara parse`, typeof def.parse === 'function');
  assert(`${fileType}: declara detectHeaders`, typeof def.detectHeaders === 'function');
  assert(`${fileType}: declara meta`, typeof def.meta === 'function');
  assert(`${fileType}: fields es un array`, Array.isArray(def.fields));

  for (const f of def.fields) {
    assert(`${fileType}.${f.key}: tiene key`, typeof f.key === 'string' && f.key.length > 0);
    assert(`${fileType}.${f.key}: tiene label`, typeof f.label === 'string' && f.label.length > 0);
    // `required` es el flag legado que `blocksProgress()` usa como PISO
    // (D-041/D-045). Dejarlo sin declarar lo vuelve `undefined` → falsy → el
    // campo deja de bloquear, en silencio.
    assert(`${fileType}.${f.key}: declara required explícitamente`,
      typeof f.required === 'boolean');
  }

  // Ninguna ficha puede repetir una clave: el mapeo se arma por `f.key`, así que
  // la segunda pisaría a la primera sin que nada avise.
  const keys = def.fields.map(f => f.key);
  assert(`${fileType}: no repite claves de mapeo`, new Set(keys).size === keys.length);
}

// ── `fixedFormat` NO se deriva de `fields: []` ───────────────────────────────
// Es la trampa de este refactor y por eso está escrita como assert. Cuatro tipos
// no declaran ninguna columna a mapear; sólo DOS se parsean derecho. Los otros
// dos pasan igual por la pantalla de vista previa + "Confirmar y procesar", que
// es lo único que le muestra al analista que subió el archivo correcto. Derivar
// `fixedFormat` de `fields.length === 0` se la sacaría sin que nadie lo pidiera.

const sinCampos = entries.filter(([, d]) => d.fields.length === 0).map(([ft]) => ft);
const fijos     = entries.filter(([, d]) => d.fixedFormat === true).map(([ft]) => ft);

assert(`hay tipos sin campos que NO son de formato fijo (hoy: ${sinCampos.join(', ')})`,
  sinCampos.length > fijos.length);
assert('concept_catalog se parsea derecho', isFixedFormat('concept_catalog') === true);
assert('cc_x_ee_file se parsea derecho', isFixedFormat('cc_x_ee_file') === true);
assert('acreditaciones_file NO se parsea derecho, aunque no tenga campos',
  fieldsFor('acreditaciones_file').length === 0 && isFixedFormat('acreditaciones_file') === false);

// ── El alias del Tabulado del período anterior ───────────────────────────────
// Comparte la ficha por REFERENCIA, no por copia: una columna nueva del Tabulado
// tiene que aparecer en los dos slots sin que nadie se acuerde de agregarla dos
// veces (es el archivo del mismo mes anterior, no otro formato).

assert('tab_prev_file declara de quién es alias', FILE_TYPES.tab_prev_file.aliasOf === 'tab_control');
assert('tab_prev_file comparte los campos del Tabulado, por referencia',
  fieldsFor('tab_prev_file') === fieldsFor('tab_control'));
assert('tab_prev_file tiene su propia etiqueta (el analista distingue los dos slots)',
  fileTypeLabel('tab_prev_file') !== fileTypeLabel('tab_control'));
assert('tab_prev_file usa el detector HTML-aware del Tabulado, no el plano',
  FILE_TYPES.tab_prev_file.detectHeaders === FILE_TYPES.tab_control.detectHeaders);

// ── Todo tipo que un control pide de verdad, existe ──────────────────────────
// El guard que faltaba: una entrada del registry con un `fileType` mal escrito
// (o un tipo que se renombró de un lado y no del otro) hoy sube el archivo y
// falla recién al parsear.

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');

const pedidosPorControles = new Set();
for (const ctrl of Object.values(CONTROL_REGISTRY)) {
  for (const f of (ctrl.additionalFiles || [])) pedidosPorControles.add(f.fileType);
}
// El Tabulado y el catálogo no son `additionalFiles` de nadie — los pide el
// wizard directamente, así que se suman a mano o el barrido no los cubre.
pedidosPorControles.add('tab_control');
pedidosPorControles.add('concept_catalog');

assert('el barrido recorrió tipos de verdad (si no, los asserts de abajo pasan por vacuidad)',
  pedidosPorControles.size >= 10);
for (const fileType of pedidosPorControles) {
  assert(`${fileType}: lo pide un control y está declarado en FILE_TYPES`,
    FILE_TYPES[fileType] !== undefined);
}

// Y al revés: una ficha que ya no la pide nadie es peso muerto que igual hay que
// mantener. No es un error —un tipo puede entrar antes que su control— pero se
// muestra para que se vea.
const huerfanos = entries.map(([ft]) => ft).filter(ft => !pedidosPorControles.has(ft));
console.log(`  (tipos declarados que ningún control pide hoy: ${huerfanos.join(', ') || 'ninguno'})`);

// ── Las líneas de metadata ───────────────────────────────────────────────────
// Antes eran una cadena de 11 `||`: el tipo que no figuraba caía al molde de
// "N legajos · N conceptos" sin que nada avisara. Estos asserts fijan el molde
// que le toca a cada uno.

assert('el Tabulado informa registros',
  metaLineFor('tab_control', { totalRows: 42 }) === '42 registros');
assert('la Nómina Maestra informa legajos y conceptos',
  metaLineFor('nomina_maestra', { uniqueLegajos: 7, detectedConcepts: ['a', 'b'] }) === '7 legajos · 2 conceptos');
assert('el Reporte de Categorías informa activos sobre el total',
  metaLineFor('cat_empleados', { activos: 90, total: 100 }) === '90 activos de 100 filas');
assert('el Reporte de Categorías avisa las sumatorias excluidas',
  metaLineFor('cat_empleados', { activos: 90, total: 100, filtradas: 3 }).includes('3 sumatorias excluidas'));
assert('el catálogo informa conceptos, no registros',
  metaLineFor('concept_catalog', { totalRows: 500 }) === '500 conceptos');
assert('el catálogo desglosa por tipo cuando el parser lo trae',
  metaLineFor('concept_catalog', { totalRows: 500, remu: 100, aporte: 20 }) === '500 conceptos · 100 remu · 20 aportes');
// Sin metadata no rompe ni inventa: informa cero. Un archivo que parsea 0 filas
// es un resultado válido que hay que poder ver (D-036).
assert('sin parseMetadata informa cero, no rompe',
  metaLineFor('tab_control', undefined) === '0 registros');
assert('sin parseMetadata informa cero, no rompe (legajos)',
  metaLineFor('nomina_maestra', null) === '0 legajos · 0 conceptos');

// ── Un tipo desconocido no se completa con un default silencioso ─────────────
// Leer y parsear cortan con un error que dice cuál era el tipo. Lo que sí
// degrada a algo visible es la etiqueta (cae al id) y los campos (lista vacía):
// ahí un throw dejaría la pantalla en blanco sin explicar nada.

assert('parsear un tipo desconocido tira un error que lo nombra', (() => {
  try { parseFor('no_existe_file', new ArrayBuffer(0), {}); return false; }
  catch (e) { return e.message.includes('no_existe_file'); }
})());
assert('detectar encabezados de un tipo desconocido tira un error que lo nombra', (() => {
  try { detectHeadersFor('no_existe_file', new ArrayBuffer(0)); return false; }
  catch (e) { return e.message.includes('no_existe_file'); }
})());
assert('la etiqueta de un tipo desconocido cae al id, no rompe la pantalla',
  fileTypeLabel('no_existe_file') === 'no_existe_file');
assert('los campos de un tipo desconocido son lista vacía',
  Array.isArray(fieldsFor('no_existe_file')) && fieldsFor('no_existe_file').length === 0);
assert('un tipo desconocido no es de formato fijo ni tiene mapeo de nombre',
  isFixedFormat('no_existe_file') === false && hasNameMapping('no_existe_file') === false);

// ── El selector de apellido/nombre ───────────────────────────────────────────
// Sólo los formatos con una fila por empleado lo muestran.

assert('la Nómina Maestra ofrece el selector de apellido/nombre', hasNameMapping('nomina_maestra') === true);
assert('el Resumen Tabulado Horizontal lo ofrece', hasNameMapping('resumen_tabulado_horizontal') === true);
assert('el Tabulado NO lo ofrece (trae una fila por liquidación)', hasNameMapping('tab_control') === false);

// ── fileUpload.js deriva de la ficha, no tiene su propia lista ───────────────
// Es lo que hace que agregar un tipo toque un solo archivo. Si alguien vuelve a
// escribir un FIELD_DEFS a mano allá, esto falla.

const { FIELD_DEFS } = await import('./js/ui/fileUpload.js');

assert('FIELD_DEFS tiene exactamente los mismos tipos que FILE_TYPES',
  Object.keys(FIELD_DEFS).length === entries.length
  && Object.keys(FIELD_DEFS).every(ft => FILE_TYPES[ft] !== undefined));
assert('FIELD_DEFS entrega los mismos campos que la ficha, sin copiarlos',
  Object.keys(FIELD_DEFS).every(ft => FIELD_DEFS[ft] === FILE_TYPES[ft].fields));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
