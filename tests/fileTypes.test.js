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
  metaLineFor, detectHeadersFor, parseFor, flowFor, dropLabelFor, dropHintFor,
  autoDetectFor, extraFieldGroupsFor, conceptCodeToKeyFor,
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
  // `autoDetect` se declara SIEMPRE, aunque sea `null`. Dejarlo sin declarar lo
  // vuelve `undefined`, indistinguible de haberlo olvidado, y el analista mapea
  // a mano un archivo que la app sabía leer sola.
  assert(`${fileType}: declara autoDetect explícitamente (función o null)`,
    def.autoDetect === null || typeof def.autoDetect === 'function');

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

// ── La auto-detección de columnas ────────────────────────────────────────────
// Antes era un mapa `AUTO_DETECT` en controlsWizard.js, ocho imports más arriba.
// Un tipo que se olvidara de entrar ahí no rompía: simplemente el analista
// mapeaba a mano todas las columnas de un archivo que la app sabía leer sola.

const conAutoDetect = entries.filter(([, d]) => d.autoDetect).map(([ft]) => ft);
assert(`hay tipos con auto-detección (${conAutoDetect.length})`, conAutoDetect.length >= 8);
for (const ft of ['tab_control', 'cat_empleados', 'brutos_file', 'gs_pers_file',
                  'nr_file', 'rend_file', 'costo_total_file', 'asiento_conceptos_file']) {
  assert(`${ft}: propone columnas solo`, typeof autoDetectFor(ft) === 'function');
}
assert('el Tabulado anterior usa la misma auto-detección que el Tabulado (es el mismo archivo)',
  autoDetectFor('tab_prev_file') === autoDetectFor('tab_control'));
assert('un tipo sin auto-detección devuelve null, no undefined (el wizard lo distingue)',
  autoDetectFor('acreditaciones_file') === null);
assert('un tipo desconocido tampoco inventa una auto-detección',
  autoDetectFor('no_existe_file') === null);

// Todas aceptan `(headers, catalogRows)`; las que no usan el catálogo ignoran el
// segundo argumento. Es lo que deja al wizard pasarlo siempre, sin un caso
// especial para el Tabulado (que antes se llamaba sin catálogo).
for (const ft of conAutoDetect) {
  assert(`${ft}: su auto-detección tolera que le pasen el catálogo`, (() => {
    try { autoDetectFor(ft)([], []); return true; } catch { return false; }
  })());
}

// ── Qué archivos declaran hueco propio y redibujo del paso ───────────────────
// Eran tres `if` con controlId/fileType cableados en el wizard. Este assert fija
// exactamente cuáles son, así que sumar o sacar uno es una decisión visible.

const specsDeclarados = [];
for (const [controlId, ctrl] of Object.entries(CONTROL_REGISTRY)) {
  for (const f of (ctrl.additionalFiles || [])) {
    if (f.slot || f.rerenderOnLoad) specsDeclarados.push(`${controlId}.${f.key}`);
    if (f.slot) assert(`${controlId}.${f.key}: slot es un selector`, typeof f.slot === 'string' && f.slot.startsWith('#'));
    if (f.rerenderOnLoad) assert(`${controlId}.${f.key}: rerenderOnLoad es booleano`, f.rerenderOnLoad === true);
  }
}
assert(`redibujan el paso o tienen hueco propio exactamente los 3 de siempre (hoy: ${specsDeclarados.sort().join(', ')})`,
  specsDeclarados.sort().join(', ') === 'rend_vs_asiento.conta, variaciones_conceptos.tab_prev, variaciones_sueldos.tab_prev');

// El hueco del Tabulado anterior es el que existe en el layout de Variaciones.
// Si alguien renombra el id en el HTML y no acá, el archivo cae a la lista de
// abajo sin romperse — o sea, en silencio. Por eso se fija el valor.
for (const ctrl of Object.values(CONTROL_REGISTRY)) {
  const prev = (ctrl.additionalFiles || []).find(f => f.fileType === 'tab_prev_file');
  if (prev) assert(`${ctrl.id}: el Tabulado anterior apunta a su hueco de la grilla`,
    prev.slot === '#js-var-prev-upload');
}

// ── Las columnas del Tabulado que se piden en el Paso 2 ─────────────────────
// Eran cinco arrays sueltos en controlsWizard.js más un mapa de códigos. Se
// piden en el Paso 2 y no al subir el archivo, y sólo las que necesita algún
// control seleccionado: no tiene sentido pedirle los 18 conceptos de NR a quien
// corre sólo Brutos.

const TODOS = new Set(['brutos', 'gsPers', 'nr']);
const gruposDe = (activos, opts) => extraFieldGroupsFor('tab_control', activos, opts);
const camposDe = (activos, opts) => gruposDe(activos, opts).flatMap(g => g.fields);

assert('el Tabulado declara sus columnas del Paso 2', gruposDe(TODOS).length === 6);
assert('son 29 columnas en total', camposDe(TODOS).length === 29);
assert('el Tabulado anterior las comparte por referencia (es el mismo archivo)',
  FILE_TYPES.tab_prev_file.extraFieldGroups === FILE_TYPES.tab_control.extraFieldGroups);

// Mismas reglas de forma que `fields`: sin esto un campo nuevo entra sin
// `required` y deja de bloquear en silencio.
for (const g of gruposDe(TODOS)) {
  assert(`grupo ${g.id}: declara requiredBy explícitamente (id de control o null)`,
    g.requiredBy === null || typeof g.requiredBy === 'string');
  assert(`grupo ${g.id}: tiene campos`, Array.isArray(g.fields) && g.fields.length > 0);
  for (const f of g.fields) {
    assert(`${g.id}.${f.key}: tiene key y label`, !!f.key && !!f.label);
    assert(`${g.id}.${f.key}: declara required explícitamente`, typeof f.required === 'boolean');
  }
}

const todasLasClaves = camposDe(TODOS).map(f => f.key);
assert('ninguna columna del Paso 2 está declarada dos veces',
  new Set(todasLasClaves).size === todasLasClaves.length);
assert('ninguna choca con una columna que se pide al subir el archivo',
  todasLasClaves.every(k => !fieldsFor('tab_control').some(f => f.key === k)));

// Sólo lo que pide el control seleccionado, más los compartidos.
assert('con sólo Brutos: sus 2 columnas + las 5 compartidas',
  camposDe(new Set(['brutos'])).length === 7);
assert('con sólo NR: sus 18 conceptos + ID_CENTRO_TRAB/ID_CATEGORIA + las 5 compartidas',
  camposDe(new Set(['nr'])).length === 25);
assert('sin ningún control: sólo las 5 compartidas',
  camposDe(new Set()).length === 5);

// **El panel y el gate usan conjuntos DISTINTOS.** El panel muestra los
// compartidos; el gate de "no podés avanzar" no los mira. Hoy da igual (los 5
// son OPCIONAL en los contratos), pero el día que uno suba a OBLIGATORIA la
// diferencia importa — y este assert es el que la mantiene explícita en vez de
// que dependa de un `...TAB_SHARED_FIELDS` que alguien mueve de lugar.
assert('el gate NO mira las columnas compartidas',
  camposDe(TODOS, { soloGateados: true }).length === 24);
assert('…y el panel SÍ (los 5 de diferencia son exactamente los compartidos)',
  camposDe(TODOS).length - camposDe(TODOS, { soloGateados: true }).length === 5);
assert('sin ningún control seleccionado el gate no pide nada',
  camposDe(new Set(), { soloGateados: true }).length === 0);

// El orden es el de declaración: es lo que dibuja el panel de arriba a abajo.
assert('los grupos salen en el orden en que se muestran',
  gruposDe(TODOS).map(g => g.id).join(',') === 'brutos,gsPers,nrIndem,nrOtros,nrIdent,shared');
assert('sólo los tres grupos de NR llevan subtítulo',
  gruposDe(TODOS).filter(g => g.header).map(g => g.header).join(' · ') === 'Indemnizatorios · Otros NR · Identificación NR');

// El mapa de códigos: es lo que resuelve por código lo que el catálogo del
// cliente no resolvió por nombre (D-039).
const codeToKey = conceptCodeToKeyFor('tab_control');
assert('el mapa de códigos apunta sólo a columnas declaradas',
  Object.values(codeToKey).every(k => todasLasClaves.includes(k)));
assert('ningún código apunta a dos claves distintas',
  new Set(Object.values(codeToKey)).size === Object.values(codeToKey).length);
assert('un tipo sin columnas del Paso 2 devuelve vacío, no rompe',
  extraFieldGroupsFor('nr_file', TODOS).length === 0
  && Object.keys(conceptCodeToKeyFor('nr_file')).length === 0);

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

// ── Cómo se sube cada tipo (`flow`) ──────────────────────────────────────────
// Antes eran dos `if (fileType === '…')` al principio de initFileUploadStep.
// Un tipo multi-archivo que se olvidara de declararse caía al flujo de un
// archivo por slot: el analista subía UN mes donde el control espera N, y el
// control corría igual con datos incompletos.

const FLOWS_CON_PANTALLA = new Set(['single', 'multi', 'multi-periodo']);

for (const [fileType] of entries) {
  assert(`${fileType}: declara un flujo que la app sabe manejar (${flowFor(fileType)})`,
    FLOWS_CON_PANTALLA.has(flowFor(fileType)));
}

assert('CONTA se sube de a varios archivos', flowFor('conta_file') === 'multi');
assert('Acumuladores se sube de a varios, cada uno con su período',
  flowFor('acumuladores_file') === 'multi-periodo');
assert('el Tabulado es un archivo por slot', flowFor('tab_control') === 'single');
assert('un tipo sin flow declarado es "single" (el default de 15 de los 17)',
  flowFor('nr_file') === 'single' && FILE_TYPES.nr_file.flow === undefined);

// Los dos flujos multi son distintos entre sí a propósito: CONTA concatena y
// avisa duplicados, Acumuladores pide un mes por archivo. Si alguna vez quedan
// con el mismo flow, uno de los dos perdió su pantalla.
assert('los dos flujos multi NO son el mismo',
  flowFor('conta_file') !== flowFor('acumuladores_file'));

// ── Los textos de la zona de drop ────────────────────────────────────────────
// Hasta D-048 la zona de drop de Acumuladores decía "Acumuladores (Axton)"
// mientras la etiqueta del tipo decía "Acumuladores (export de Axton)" — una
// divergencia anterior a la ficha, preservada a propósito en un paso de cero
// cambio de comportamiento. D-050 las unificó sacando el `dropLabel` de la
// ficha: ahora cae al mismo fallback que ya usaba CONTA.

assert('la zona de drop de Acumuladores ya no diverge de la etiqueta del tipo',
  dropLabelFor('acumuladores_file') === fileTypeLabel('acumuladores_file'));
assert('Acumuladores aclara que va uno por mes',
  dropHintFor('acumuladores_file') === ' (uno por mes)');
assert('CONTA tampoco diverge: su zona de drop usa la etiqueta del tipo',
  dropLabelFor('conta_file') === 'Contabilidad Desglosada'
  && dropLabelFor('conta_file') === fileTypeLabel('conta_file'));
assert('CONTA no lleva aclaración extra', dropHintFor('conta_file') === '');

// Las dos líneas completas, armadas igual que en la pantalla.
const lineaDrop = ft => `${dropLabelFor(ft)} — arrastrá uno o varios .xlsx${dropHintFor(ft)}, o hacé clic para elegir`;
assert('la línea de CONTA sale idéntica a la de antes de la ficha',
  lineaDrop('conta_file') === 'Contabilidad Desglosada — arrastrá uno o varios .xlsx, o hacé clic para elegir');
assert('la línea de Acumuladores usa la etiqueta larga del tipo',
  lineaDrop('acumuladores_file') === 'Acumuladores (export de Axton) — arrastrá uno o varios .xlsx (uno por mes), o hacé clic para elegir');

// Un tipo desconocido no inventa un flujo multi: cae a 'single', que es el
// camino que sí sabe avisar que el tipo no existe (parseFor tira el error).
assert('un tipo desconocido cae a single, no a un flujo multi inventado',
  flowFor('no_existe_file') === 'single');

// ── El selector de apellido/nombre ───────────────────────────────────────────
// Sólo los formatos con una fila por empleado lo muestran.

assert('la Nómina Maestra ofrece el selector de apellido/nombre', hasNameMapping('nomina_maestra') === true);
assert('el Resumen Tabulado Horizontal lo ofrece', hasNameMapping('resumen_tabulado_horizontal') === true);
assert('el Tabulado NO lo ofrece (trae una fila por liquidación)', hasNameMapping('tab_control') === false);

// ── fileUpload.js no nombra ningún tipo de archivo ──────────────────────────
//
// Es el objetivo de la fase, escrito como assert: la pantalla de carga no sabe
// que existe "nr_file". Todo lo que necesita saber de un tipo se lo pregunta a
// la ficha. Si alguien vuelve a escribir un `if (fileType === '…')` o una lista
// propia allá, esto falla — que es exactamente el momento en que hay que
// frenarlo, no tres tipos de archivo después.

{
  const { readFileSync } = await import('fs');
  const src = readFileSync('./js/ui/fileUpload.js', 'utf8');
  const nombrados = Object.keys(FILE_TYPES).filter(ft => src.includes(`'${ft}'`) || src.includes(`"${ft}"`));
  assert(`fileUpload.js no menciona ningún fileType por nombre${nombrados.length ? ': ' + nombrados.join(', ') : ''}`,
    nombrados.length === 0);
  assert('…y tampoco declara su propia lista de campos',
    !/FIELD_DEFS\s*=/.test(src));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
