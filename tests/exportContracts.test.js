// exportContracts.test.js — Forma de EXPORT_CONTRACTS (Paso 0 de specs/contrato-export.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/exportContracts.test.js
//
// Este test no cambia comportamiento — valida que la fuente única declarada en
// js/exports/contracts.js tiene la forma correcta, y que ninguna clave que hoy
// ya bloquea el avance (required:true en la ficha de su tipo de archivo)
// quede con una necesidad más débil en el mapa derivado. Es el assert que
// reemplaza la verificación manual "¿el contrato cubre todo lo que ya
// bloqueaba?" — si alguien agrega un contrato nuevo y se olvida una clave que
// otro lugar del repo sigue exigiendo, esto falla.

globalThis.document = { addEventListener: () => {} };

// Los contratos arrastran js/controls/nr.js y rendVsTabu.js, que a su vez
// arrastran js/db.js — necesita Dexie sobre una IndexedDB falsa, igual que
// tests/variacionesConceptMap.test.js.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { EXPORT_CONTRACTS, NECESSITY, fieldNecessityMap, necessityOfKey, blocksProgress, FINANZAS_ALLOWED_KEYS,
        CON_WRITER, SIN_WRITER_POR_DISENO } =
  await import('./js/exports/contracts.js');

// Las columnas de entrada las declara la ficha de cada tipo de archivo
// (Fase 4). El barrido de "piso, nunca techo" las lee del original, que es lo
// único que hace que valga para los 17 tipos sin una segunda lista a mano.
const { FILE_TYPES } = await import('./js/ui/fileTypes.js');

/** Todas las columnas que declara un tipo: las del alta más las del Paso 2. */
function columnasDe(fileType) {
  const def = FILE_TYPES[fileType];
  return [...def.fields, ...(def.extraFieldGroups || []).flatMap(g => g.fields)];
}

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const VALID_NECESSITY = new Set(Object.values(NECESSITY));
const contracts = Object.values(EXPORT_CONTRACTS);

assert('hay al menos 6 contratos declarados (Paso 0: Brutos, GS Pers, NR × 2 modos)',
  contracts.length >= 6);

// ── Forma de cada contrato ────────────────────────────────────────────────────

for (const c of contracts) {
  assert(`${c.exportId}: tiene exportId`, typeof c.exportId === 'string' && c.exportId.length > 0);
  assert(`${c.exportId}: tiene sheet`, typeof c.sheet === 'string' && c.sheet.length > 0);
  assert(`${c.exportId}: layout es 'fijo'`, c.layout === 'fijo');
  assert(`${c.exportId}: audience es 'payroll' o 'finanzas'`,
    c.audience === 'payroll' || c.audience === 'finanzas');
  assert(`${c.exportId}: columns es un array no vacío`,
    Array.isArray(c.columns) && c.columns.length > 0);

  for (const col of c.columns) {
    // `spacer` es la única excepción a "toda columna tiene label": la columna
    // A vacía de NR Reporte, heredada del layout de Meta4 (D-041/Paso 4b).
    assert(`${c.exportId}.${col.key}: tiene label${col.spacer ? ' (spacer, vacío a propósito)' : ''}`,
      col.spacer ? col.label === '' : (typeof col.label === 'string' && col.label.length > 0));
    assert(`${c.exportId}.${col.key}: tiene key`, typeof col.key === 'string' && col.key.length > 0);
    assert(`${c.exportId}.${col.key}: from es array`, Array.isArray(col.from));
    assert(`${c.exportId}.${col.key}: necessity es uno de NECESSITY.*`,
      VALID_NECESSITY.has(col.necessity));
    // `type` es obligatorio en TODA columna, aunque no todos los contratos
    // tengan hoy un consumidor de `writeContractSheet` (Paso 4a) — si no se
    // hace cumplir para los 6 contratos por igual, un contrato nuevo se
    // olvida declararlo, `writeContractSheet` no tiene con qué alinear la
    // celda, y sale mal sin que nada avise (exactamente el default silencioso
    // que este diseño existe para evitar).
    assert(`${c.exportId}.${col.key}: type es 'txt' o 'num'`,
      col.type === 'txt' || col.type === 'num');
  }
}

// ── `width` — sólo donde hay un consumidor real (Pasos 4a y 4b) ──────────────
// Los 6 contratos migrados a `writeContractSheet`/`writeGroupedContractSheet`
// declaran `width` en sus columnas — el resto (Paso 6, todavía sin migrar)
// no lo necesita hasta que tenga un consumidor real.

// `CON_WRITER`/`SIN_WRITER_POR_DISENO` viven en `contracts.js` y no acá (D-051):
// los lee también `tests/exportSinWriterConformidad.test.js`, y el motivo de una
// excepción es una declaración sobre el export, no un detalle de este test.

for (const exportId of CON_WRITER) {
  for (const col of EXPORT_CONTRACTS[exportId].columns) {
    assert(`${exportId}.${col.key}: tiene width (el writer lo necesita)`,
      typeof col.width === 'number' && col.width > 0);
  }
}

// ── Los dos grupos PARTICIONAN los contratos ─────────────────────────────────
// Ni uno de los dos lados puede quedar implícito: sin esto, un contrato nuevo
// sin writer no se distingue de una excepción deliberada.

for (const exportId of [...CON_WRITER, ...Object.keys(SIN_WRITER_POR_DISENO)]) {
  assert(`${exportId}: el exportId listado existe en EXPORT_CONTRACTS`,
    EXPORT_CONTRACTS[exportId] !== undefined);
}
for (const exportId of CON_WRITER) {
  assert(`${exportId}: no está en los dos grupos a la vez`,
    SIN_WRITER_POR_DISENO[exportId] === undefined);
}
for (const c of contracts) {
  assert(`${c.exportId}: declara si pasa por el writer o si va a mano a propósito`,
    CON_WRITER.includes(c.exportId) || SIN_WRITER_POR_DISENO[c.exportId] !== undefined);
}
for (const [exportId, motivo] of Object.entries(SIN_WRITER_POR_DISENO)) {
  // Un motivo vacío o de dos palabras convierte la lista en un opt-out cómodo,
  // que es exactamente lo que reemplazó.
  assert(`${exportId}: la excepción trae un motivo escrito, no un flag`,
    typeof motivo === 'string' && motivo.length >= 60);
}

// Y al revés que `width`: el que va a mano declara semántica, no layout. Un
// `width`/`groups`/`headerRows` acá no lo leería nadie — sería una segunda
// fuente de verdad desincronizada del archivo real (el layout de esas hojas
// vive en su módulo, que es el que lo escribe). Este assert es el que impide
// que se cuele "de paso": el día que uno migre, pasa a CON_WRITER y declara su
// layout, en el mismo PR.
for (const c of contracts) {
  if (CON_WRITER.includes(c.exportId)) continue;
  const conLayout = c.columns.filter(col =>
    col.width !== undefined || col.group !== undefined || col.diffHighlight !== undefined);
  assert(`${c.exportId}: va a mano por diseño → no declara layout (${conLayout.length} columnas lo harían)`,
    conLayout.length === 0 && c.groups === undefined && c.headerRows === undefined);
}

// `sheetNaming: 'runtime'` — `sheet` describe la FORMA de la hoja y no un
// nombre que aparezca en el archivo (Acreditaciones: una hoja por acreditación,
// `01 SUELDOS 30-04`). Sólo tiene sentido en los que van a mano:
// `writeContractSheet` usa `contract.sheet` como nombre literal, así que ahí un
// `sheetNaming:'runtime'` sería una contradicción.
for (const c of contracts) {
  assert(`${c.exportId}: sheetNaming es 'runtime' o no está declarado`,
    c.sheetNaming === undefined || c.sheetNaming === 'runtime');
  if (c.sheetNaming === 'runtime') {
    assert(`${c.exportId}: sheetNaming:'runtime' sólo en los que van a mano (el writer usa sheet literal)`,
      !CON_WRITER.includes(c.exportId));
  }
}

// ── D-020: lo que va a Finanzas no lleva información de HR ───────────────────
// Hoy hay tres `audience: 'finanzas'`: Acreditaciones (lo recibe tesorería del
// cliente) y las dos solapas planas del asiento de FINADIET (las recibe
// Contaduría). En muchos clientes Finanzas no tiene acceso a
// dotación/altas/bajas/atributos del empleado. Con la lista de columnas
// declarada en el contrato, D-020 deja de ser un comentario y pasa a ser esto:
// agregar una columna de HR a cualquiera de esos exports rompe el test.
//
// El assert es sobre `FINANZAS_ALLOWED_KEYS`, que es una allow-list: una columna
// nueva en un export de Finanzas no pasa hasta que alguien la agregue ahí a
// mano. No se cuenta cuántos contratos son — ese número va a seguir creciendo y
// el conteo no prueba nada; lo que importa es que haya al menos uno para que el
// barrido de abajo no pase por vacuidad.

const finanzas = contracts.filter(c => c.audience === 'finanzas');
assert('hay al menos un contrato audience:\'finanzas\' (si no, el barrido de abajo no prueba nada)',
  finanzas.length > 0);
for (const c of finanzas) {
  for (const col of c.columns) {
    assert(`D-020 · ${c.exportId}.${col.key}: es una columna de pago, no de HR`,
      FINANZAS_ALLOWED_KEYS.has(col.key));
  }
  // El conteo de empleados y las alertas se ven en pantalla, nunca en el .xlsx
  // (lo dice el pie de la tabla de resultados) — el assert lo hace cumplir.
  assert(`D-020 · ${c.exportId}: ninguna columna de conteo/dotación`,
    !c.columns.some(col => /count|dotacion|dotación|alta|baja|alert/i.test(`${col.key} ${col.label}`)));
}

// ── Un contrato es un PISO, nunca un techo ───────────────────────────────────
//
// Derivado de la ficha de cada tipo (`js/ui/fileTypes.js`, el original y no una
// copia acá): ninguna clave con `required: true` puede dejar de bloquear porque
// algún contrato la declare OPCIONAL. Este es el assert que faltaba — la
// versión a mano de más abajo cubría 6 claves elegidas al escribirla, y el caso
// que se escapó no estaba entre ellas. Ahora recorre también las 27 columnas
// del Paso 2, que antes vivían fuera de FIELD_DEFS y no las miraba nadie.
//
// El caso real: `puestoColumn` existe en DOS fileTypes con necesidades
// opuestas (`tab_control` opcional · `cat_empleados` **required**), y
// `fieldNecessityMap()` es plano por clave, no por `(fileType, clave)`. El
// contrato de `brutos_reporte` la declara OPCIONAL desde el lado del Tabulado,
// y eso apagaba el gate de la Columna de Puesto del Reporte de Categorías:
// se podía subir sin ella, y EE x CATEG salteaba en silencio el chequeo de
// discrepancias de Puesto y armaba la distribución con la columna sin resolver.
// Recorrer TODOS los fileTypes en vez de 6 claves elegidas a mano es lo que lo
// agarra, y lo que va a agarrar la próxima colisión cuando entre otro contrato
// (el asiento de FINADIET ya sumó un fileType más, D-046).

let requiredChecked = 0;
for (const fileType of Object.keys(FILE_TYPES)) {
  for (const f of columnasDe(fileType)) {
    if (!f.required) continue;
    requiredChecked++;
    assert(`${fileType}.${f.key}: sigue bloqueando (ningún contrato le baja la necesidad)`,
      blocksProgress(fileType, f.key, true) === true);
  }
}
assert('el barrido recorrió los required:true de verdad (si no, los asserts de arriba pasan por vacuidad)',
  requiredChecked >= 20);

// ── El mapa derivado cubre lo que ya bloqueaba (coverage, no fuerza) ─────────
//
// Estas 6 además tienen que estar DECLARADAS en algún contrato — que sigan
// bloqueando ya lo garantiza el barrido de arriba; esto verifica que el
// contrato las conoce, que es lo que hace que su necesidad se derive en vez de
// depender del flag legado.

const YA_BLOQUEABAN_HOY = [
  ['tab_control',  'empleadoColumn',          NECESSITY.CLAVE],
  ['brutos_file',  'legajoColumn',            NECESSITY.CLAVE],
  ['gs_pers_file', 'legajoColumn',            NECESSITY.CLAVE],
  ['nr_file',      'legajoColumn',            NECESSITY.CLAVE],
  ['tab_control',  'tabSalBaseColumn',        NECESSITY.OBLIGATORIA],
  ['tab_control',  'tabACuFutAumenColumn',    NECESSITY.OBLIGATORIA],
  ['tab_control',  'tabGtosPersonalesColumn', NECESSITY.OBLIGATORIA],
  ['tab_control',  'tabDtoCocheraColumn',     NECESSITY.OBLIGATORIA],
];

const RANK = { [NECESSITY.CLAVE]: 3, [NECESSITY.OBLIGATORIA]: 2, [NECESSITY.OPCIONAL]: 1 };

for (const [fileType, key, minNecessity] of YA_BLOQUEABAN_HOY) {
  const derived = necessityOfKey(fileType, key);
  assert(`${fileType}.${key}: el contrato la cubre (no queda undeclared)`, derived !== null);
  assert(`${fileType}.${key}: necesidad derivada (${derived}) >= la que ya bloqueaba (${minNecessity})`,
    derived !== null && RANK[derived] >= RANK[minNecessity]);
}

// ── Las 2 claves que Willy pidió no tocar (2026-08-12) ───────────────────────
// No suben de OPCIONAL sin importar cuántos contratos las referencien con una
// necesidad más fuerte.

// Se aplican POR CLAVE y no por (archivo, clave), a propósito: Willy pidió
// dejarlas como están, y scopearlas ahora las subiría en algún archivo — que es
// justo lo que no se pidió. `cat_empleados.puestoColumn` sigue bloqueando igual,
// pero por su `required: true` (piso, nunca techo), no por el contrato.
assert('tab_control.apellidoNombreColumn queda OPCIONAL (decisión de Willy, "dejalo como está")',
  necessityOfKey('tab_control', 'apellidoNombreColumn') === NECESSITY.OPCIONAL);
assert('tab_control.puestoColumn queda OPCIONAL (decisión de Willy)',
  necessityOfKey('tab_control', 'puestoColumn') === NECESSITY.OPCIONAL);
assert('cat_empleados.puestoColumn también queda OPCIONAL en el contrato…',
  necessityOfKey('cat_empleados', 'puestoColumn') === NECESSITY.OPCIONAL);
assert('…pero sigue bloqueando por su required:true (es el bug de D-045, ahora por dos vías)',
  blocksProgress('cat_empleados', 'puestoColumn', true) === true);

// Confirmar que estas dos SÍ son consumidas por varios contratos — si no lo
// fueran, el assert de arriba no probaría nada (pasaría por vacuidad).
const map = fieldNecessityMap();
const usos = (fileType, key) => map.get(`${fileType}::${key}`)?.contracts.size ?? 0;
assert('tab_control.apellidoNombreColumn está referenciada por más de un contrato (si no, el test de arriba no prueba nada)',
  usos('tab_control', 'apellidoNombreColumn') > 1);
assert('puestoColumn está referenciada desde los DOS archivos (es la colisión de D-045)',
  usos('tab_control', 'puestoColumn') > 0 && usos('cat_empleados', 'puestoColumn') > 0);

// ── Los 18 conceptos de NR están en el contrato, derivados de NR_CONCEPTS ────
// (no una segunda lista copiada a mano)

const { NR_CONCEPTS } = await import('./js/controls/nr.js');
const nrReporteKeys = new Set(EXPORT_CONTRACTS.nr_reporte.columns.map(c => c.key));
assert('los 18 conceptos de NR_CONCEPTS están todos en el contrato del Reporte',
  NR_CONCEPTS.every(c => nrReporteKeys.has(c.key)));
assert('el contrato de NR Reporte no tiene más conceptos que NR_CONCEPTS (nada inventado)',
  NR_CONCEPTS.length === nrReporteKeys.size - 9); // spacer + 8 campos fijos + 18 conceptos

// necessityOfKey de un concepto NR debe salir OBLIGATORIA por el lado tabKey
// (nr_reporte) — el punto entero del Paso 2 es que esto pase a gatear.
const indemPreaviso = NR_CONCEPTS.find(c => c.key === 'indemPreaviso');
assert('un concepto NR sale OBLIGATORIA desde el Tabulado (modo Reporte)',
  necessityOfKey('tab_control', indemPreaviso.tabKey) === NECESSITY.OBLIGATORIA);
assert('…y desde el archivo de NR (modo Controlar)',
  necessityOfKey('nr_file', indemPreaviso.nrKey) === NECESSITY.OBLIGATORIA);

// ── El mapa está scopeado a (archivo, clave): ya no hay colisiones ──────────
//
// D-041 documentó el mapa plano como "fragilidad, hoy no hay colisión real". El
// Paso 6 del contrato de export encontró DOS colisiones legítimas y este assert
// las contaba: `puestoColumn` (opcional en el Tabulado, required en el Reporte
// de Categorías) y `costoTotalColumn` (opcional en Rendimiento, required en el
// Reporte de Costo Total). No eran un error en los contratos — la misma columna
// pesa distinto en archivos distintos, y con un mapa plano eso no se puede
// declarar sin mentir de un lado.
//
// La Fase 4 lo arregla en la raíz: cada columna declara `fromFile`, y el mapa se
// arma por `${fileType}::${key}`. Las dos claves siguen existiendo en dos
// archivos, pero ahora cada una tiene su propia entrada, así que **no hay
// ninguna divergencia que contar**. Este assert pasó de "son exactamente 2" a
// "son cero", que es lo que cierra el pendiente de fondo de D-041.

{
  const porClave = new Map(); // `${fileType}::${key}` -> Map<exportId, necessity>
  for (const c of contracts) {
    for (const col of c.columns) {
      for (const key of col.from) {
        const scoped = `${col.fromFile}::${key}`;
        if (!porClave.has(scoped)) porClave.set(scoped, new Map());
        porClave.get(scoped).set(c.exportId, col.necessity);
      }
    }
  }

  const divergentes = [...porClave].filter(([, m]) => new Set(m.values()).size > 1);
  assert(`no hay ninguna divergencia de necesidad (hoy: ${divergentes.map(([k]) => k).join(', ') || 'ninguna'})`,
    divergentes.length === 0);
  for (const [k, m] of divergentes) {
    console.error(`    ${k}: ${[...m.entries()].map(([id, n]) => `${id}=${n}`).join(', ')}`);
  }

  // Y la prueba de que el scopeo no lo logró borrando información: las dos
  // claves que colisionaban siguen usándose desde los dos archivos, cada una
  // con su necesidad. Sin esto, el assert de cero divergencias pasaría igual si
  // alguien borrara un contrato.
  const enDosArchivos = k => new Set(
    [...porClave.keys()].filter(sk => sk.endsWith(`::${k}`)).map(sk => sk.split('::')[0])
  );
  assert('puestoColumn sigue viniendo de dos archivos distintos',
    enDosArchivos('puestoColumn').size === 2);
  assert('costoTotalColumn también',
    enDosArchivos('costoTotalColumn').size === 2);
  assert('costoTotalColumn del Reporte de Costo Total es OBLIGATORIA, no la OPCIONAL de Rendimiento',
    necessityOfKey('costo_total_file', 'costoTotalColumn') === NECESSITY.OBLIGATORIA
    && necessityOfKey('rend_file', 'costoTotalColumn') === NECESSITY.OPCIONAL);
}

// ── Todo (archivo, clave) que un contrato consume, existe en su ficha ───────
//
// El guard que el scopeo habilita y que antes era imposible: con el mapa plano,
// una clave mal tipeada en un contrato quedaba como una entrada más y nadie se
// enteraba. Ahora se puede cruzar contra las columnas que el tipo declara.

{
  const huerfanas = [];
  let cruzadas = 0;
  for (const c of contracts) {
    for (const col of c.columns) {
      for (const key of col.from) {
        cruzadas++;
        assert(`${c.exportId}.${col.key}: declara de qué archivo sale`,
          typeof col.fromFile === 'string' && FILE_TYPES[col.fromFile] !== undefined);
        if (!columnasDe(col.fromFile).some(f => f.key === key)) {
          huerfanas.push(`${c.exportId}.${col.key} → ${col.fromFile}.${key}`);
        }
      }
    }
  }
  assert('el barrido cruzó claves de verdad (si no, pasa por vacuidad)', cruzadas >= 60);
  assert(`toda clave de un contrato existe en la ficha de su archivo${huerfanas.length ? ': ' + huerfanas.join(', ') : ''}`,
    huerfanas.length === 0);
}

// ── blocksProgress: Paso 1 — SIN cambio de comportamiento todavía ────────────
//
// Sólo CLAVE bloquea fuerte. OBLIGATORIA NO bloquea todavía aunque el contrato
// ya la declare así: bloquearla sin la omisión declarada (Paso 2, no existe
// aún) rompería HOY la carga de cualquier archivo de NR al que le falte un
// concepto — y ningún cliente tiene los 18. Marcar algo OBLIGATORIA es
// declarar la expectativa; hacerla cumplir sin salida es peor que no
// cumplirla. Este bloque es el que evita que alguien "complete" el Paso 2 a
// medias activando el bloqueo antes de la omisión.

assert('blocksProgress: CLAVE bloquea siempre, sin importar el flag legado',
  blocksProgress('brutos_file', 'legajoColumn', false) === true);
assert('blocksProgress: OBLIGATORIA NO bloquea todavía si el flag legado es false — sin esto se rompe NR hoy',
  blocksProgress('nr_file', 'reinHomeOficeColumn', false) === false);
assert('blocksProgress: OBLIGATORIA respeta el flag legado si YA bloqueaba (tabSalBaseColumn)',
  blocksProgress('tab_control', 'tabSalBaseColumn', true) === true);
assert('blocksProgress: OPCIONAL no bloquea por sí sola (flag legado en false)',
  blocksProgress('tab_control', 'apellidoNombreColumn', false) === false);
// Antes este assert afirmaba lo contrario ("OPCIONAL nunca bloquea, ni con el
// flag legado en true") y por eso el contrato podía APAGAR un `required: true`
// de otro fileType — es el bug de `puestoColumn` documentado en el barrido de
// arriba. El contrato suma obligación, nunca la saca.
assert('blocksProgress: OPCIONAL NO desactiva un required:true del fileType (piso, no techo)',
  blocksProgress('tab_control', 'apellidoNombreColumn', true) === true);
assert('blocksProgress: una clave no contratada cae 100% al flag legado (true)',
  blocksProgress('cat_empleados', 'idPueColumn', true) === true);
assert('blocksProgress: una clave no contratada cae 100% al flag legado (false)',
  blocksProgress('cat_empleados', 'idPueColumn', false) === false);
// Lo que el scopeo agrega: la MISMA clave en otro archivo ya no se contagia la
// necesidad. `legajoColumn` es CLAVE en Brutos/GS Pers/NR/Costo Total porque
// esos contratos lo declaran; en un archivo que no lo declara, no.
assert('blocksProgress: una clave CLAVE en un archivo no bloquea sola en otro que no la contrata',
  blocksProgress('nomina_maestra', 'legajoColumn', false) === false);
assert('…y ese mismo campo sigue bloqueando por su required:true',
  blocksProgress('nomina_maestra', 'legajoColumn', true) === true);

// Ningún concepto NR bloquea todavía por esta vía — es la prueba negativa de
// que Paso 1, solo, no cambia nada para NR. El día que se agregue la omisión
// (Paso 2), estos deberían empezar a fallar acá y hay que actualizarlos junto
// con el mecanismo nuevo, no antes.
const { NR_CONCEPTS: nrConceptsParaGate } = await import('./js/controls/nr.js');
assert('ningún concepto NR bloquea todavía (Paso 1 no activa el gate; eso es Paso 2)',
  nrConceptsParaGate.every(c =>
    blocksProgress('nr_file', c.nrKey, false) === false
    && blocksProgress('tab_control', c.tabKey, false) === false));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
