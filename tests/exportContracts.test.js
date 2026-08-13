// exportContracts.test.js — Forma de EXPORT_CONTRACTS (Paso 0 de specs/contrato-export.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/exportContracts.test.js
//
// Este test no cambia comportamiento — valida que la fuente única declarada en
// js/exports/contracts.js tiene la forma correcta, y que ninguna clave que hoy
// ya bloquea el avance (required:true en FIELD_DEFS o en los TAB_*_FIELDS)
// quede con una necesidad más débil en el mapa derivado. Es el assert que
// reemplaza la verificación manual "¿el contrato cubre todo lo que ya
// bloqueaba?" — si alguien agrega un contrato nuevo y se olvida una clave que
// otro lugar del repo sigue exigiendo, esto falla.

globalThis.document = { addEventListener: () => {} };

// fileUpload.js (de donde sale FIELD_DEFS, ver el barrido de "piso, nunca
// techo" más abajo) arrastra js/db.js — necesita Dexie sobre una IndexedDB
// falsa, igual que tests/variacionesConceptMap.test.js.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { EXPORT_CONTRACTS, NECESSITY, fieldNecessityMap, necessityOfKey, blocksProgress, FINANZAS_ALLOWED_KEYS } =
  await import('./js/exports/contracts.js');

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

const CON_WRITER = [
  'brutos_reporte', 'gs_pers_reporte', 'brutos', 'gs_pers', 'nr', 'nr_reporte',
  // Las dos solapas planas del asiento de FINADIET nacieron sobre
  // `writeContractSheet` (D-046), así que entran acá desde el primer día.
  'finadiet_asiento_cc', 'finadiet_asiento_gral',
];
for (const exportId of CON_WRITER) {
  for (const col of EXPORT_CONTRACTS[exportId].columns) {
    assert(`${exportId}.${col.key}: tiene width (el writer lo necesita)`,
      typeof col.width === 'number' && col.width > 0);
  }
}

// Y al revés: los contratos del Paso 6 declaran semántica, no layout. Sus
// writers todavía arman el .xlsx a mano, así que un `width`/`groups`/
// `headerRows` acá no lo leería nadie — sería una segunda fuente de verdad
// desincronizada del archivo real. Este assert es el que impide que se cuele
// "de paso": el día que se migre uno de esos writers, entra a CON_WRITER y
// declara su layout, en el mismo PR.
for (const c of contracts) {
  if (CON_WRITER.includes(c.exportId)) continue;
  const conLayout = c.columns.filter(col =>
    col.width !== undefined || col.group !== undefined || col.diffHighlight !== undefined);
  assert(`${c.exportId}: sin writer todavía → no declara layout (${conLayout.length} columnas lo harían)`,
    conLayout.length === 0 && c.groups === undefined && c.headerRows === undefined);
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
// Derivado de `FIELD_DEFS` (el original en `js/ui/fileUpload.js`, no una copia
// acá): ninguna clave con `required: true` puede dejar de bloquear porque
// algún contrato la declare OPCIONAL. Este es el assert que faltaba — la
// versión a mano de más abajo cubría 6 claves elegidas al escribirla, y el caso
// que se escapó no estaba entre ellas.
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

const { FIELD_DEFS } = await import('./js/ui/fileUpload.js');

let requiredChecked = 0;
for (const [fileType, fields] of Object.entries(FIELD_DEFS)) {
  for (const f of fields) {
    if (!f.required) continue;
    requiredChecked++;
    assert(`${fileType}.${f.key}: sigue bloqueando (ningún contrato le baja la necesidad)`,
      blocksProgress(f.key, true) === true);
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

const YA_BLOQUEABAN_HOY = {
  empleadoColumn:          NECESSITY.CLAVE,
  legajoColumn:            NECESSITY.CLAVE,
  tabSalBaseColumn:        NECESSITY.OBLIGATORIA,
  tabACuFutAumenColumn:    NECESSITY.OBLIGATORIA,
  tabGtosPersonalesColumn: NECESSITY.OBLIGATORIA,
  tabDtoCocheraColumn:     NECESSITY.OBLIGATORIA,
};

const RANK = { [NECESSITY.CLAVE]: 3, [NECESSITY.OBLIGATORIA]: 2, [NECESSITY.OPCIONAL]: 1 };

for (const [key, minNecessity] of Object.entries(YA_BLOQUEABAN_HOY)) {
  const derived = necessityOfKey(key);
  assert(`${key}: el contrato la cubre (no queda undeclared)`, derived !== null);
  assert(`${key}: necesidad derivada (${derived}) >= la que ya bloqueaba (${minNecessity})`,
    derived !== null && RANK[derived] >= RANK[minNecessity]);
}

// ── Las 2 claves que Willy pidió no tocar (2026-08-12) ───────────────────────
// No suben de OPCIONAL sin importar cuántos contratos las referencien con una
// necesidad más fuerte.

assert('apellidoNombreColumn queda OPCIONAL (decisión de Willy, "dejalo como está")',
  necessityOfKey('apellidoNombreColumn') === NECESSITY.OPCIONAL);
assert('puestoColumn queda OPCIONAL (decisión de Willy, "dejalo como está")',
  necessityOfKey('puestoColumn') === NECESSITY.OPCIONAL);

// Confirmar que estas dos SÍ son consumidas por varios contratos — si no lo
// fueran, el assert de arriba no probaría nada (pasaría por vacuidad).
const map = fieldNecessityMap();
assert('apellidoNombreColumn está referenciada por más de un contrato (si no, el test de arriba no prueba nada)',
  (map.get('apellidoNombreColumn')?.contracts.size ?? 0) > 1);
assert('puestoColumn está referenciada por al menos un contrato',
  (map.get('puestoColumn')?.contracts.size ?? 0) > 0);

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
assert('un concepto NR (tabKey) sale OBLIGATORIA en el mapa derivado',
  necessityOfKey(indemPreaviso.tabKey) === NECESSITY.OBLIGATORIA);
assert('un concepto NR (nrKey, modo Controlar) sale OBLIGATORIA en el mapa derivado',
  necessityOfKey(indemPreaviso.nrKey) === NECESSITY.OBLIGATORIA);

// ── El mapa por clave asume que un mismo nombre de clave significa lo mismo
// en todos los contratos que lo usan ─────────────────────────────────────────
//
// `fieldNecessityMap()` es un mapa PLANO: junta la necesidad de una clave a
// través de TODOS los contratos, sin distinguir de qué tipo de archivo viene.
// Hoy es seguro porque `legajoColumn` de Brutos/GS Pers/NR y `empleadoColumn`
// del Tabulado son CLAVE en los tres lugares que los usan — pero si algún
// contrato nuevo (Paso 6) declarara la MISMA clave con una necesidad distinta,
// el mapa la resolvería mal: le prestaría la necesidad más fuerte de un
// archivo no relacionado, sobre-bloqueando un campo que no debería estarlo.
//
// **El Paso 6 hizo que esto dejara de ser hipotético.** Hay dos claves que
// existen en DOS fileTypes con necesidades legítimamente distintas:
//
//   puestoColumn     · tab_control: opcional   · cat_empleados: required
//   costoTotalColumn · rend_file:   opcional   · costo_total_file: required
//
// No es un error a corregir en los contratos: la misma columna es opcional en
// un archivo y obligatoria en otro, y con un mapa plano eso no se puede
// declarar sin mentir de un lado. La forma correcta es scopear el mapa por
// `(fileType, clave)` — sigue pendiente, ahora con dos casos concretos en vez
// de cero (ver specs/contrato-export.md).
//
// Lo que este assert protege mientras tanto es lo que SÍ puede producir un gate
// incorrecto. Después del arreglo de "piso, nunca techo", lo único que el
// contrato aporta al gate por sí solo es CLAVE (`blocksProgress`): una clave
// declarada CLAVE en un contrato y no-CLAVE en otro bloquearía la carga de un
// archivo que no la necesita. La divergencia OPCIONAL/OBLIGATORIA, en cambio,
// no puede: ninguna de las dos bloquea sola, y el `required: true` de cada
// fileType lo aporta `FIELD_DEFS` —que sí está scopeado— y ya no se puede
// apagar (ver el barrido de arriba).

{
  const porClave = new Map(); // key -> Map<exportId, necessity>
  for (const c of contracts) {
    for (const col of c.columns) {
      for (const key of col.from) {
        if (!porClave.has(key)) porClave.set(key, new Map());
        porClave.get(key).set(c.exportId, col.necessity);
      }
    }
  }

  const claveInconsistente = [];
  for (const [key, porContrato] of porClave) {
    const necesidades = [...porContrato.values()];
    const algunaClave = necesidades.some(n => n === NECESSITY.CLAVE);
    const todasClave  = necesidades.every(n => n === NECESSITY.CLAVE);
    if (algunaClave && !todasClave) claveInconsistente.push([key, [...porContrato.entries()]]);
  }

  assert('ninguna clave es CLAVE en un contrato y no-CLAVE en otro (lo único que puede dar un gate incorrecto)',
    claveInconsistente.length === 0);
  for (const [key, usos] of claveInconsistente) {
    console.error(`    ${key}: ${usos.map(([id, n]) => `${id}=${n}`).join(', ')}`);
  }

  // Las divergencias no-CLAVE que sí existen quedan a la vista en la salida del
  // test, para que se vean crecer: si esta lista se estira más allá de las dos
  // colisiones conocidas, es la señal de que el mapa scopeado dejó de poder
  // esperar.
  const divergentes = [...porClave].filter(([, m]) => new Set(m.values()).size > 1);
  assert(`las divergencias OPCIONAL/OBLIGATORIA conocidas siguen siendo 2 (hoy: ${divergentes.map(([k]) => k).join(', ') || 'ninguna'})`,
    divergentes.length === 2);
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
  blocksProgress('legajoColumn', false) === true);
assert('blocksProgress: OBLIGATORIA NO bloquea todavía si el flag legado es false — sin esto se rompe NR hoy',
  blocksProgress('reinHomeOficeColumn', false) === false);
assert('blocksProgress: OBLIGATORIA respeta el flag legado si YA bloqueaba (tabSalBaseColumn)',
  blocksProgress('tabSalBaseColumn', true) === true);
assert('blocksProgress: OPCIONAL no bloquea por sí sola (flag legado en false)',
  blocksProgress('apellidoNombreColumn', false) === false);
// Antes este assert afirmaba lo contrario ("OPCIONAL nunca bloquea, ni con el
// flag legado en true") y por eso el contrato podía APAGAR un `required: true`
// de otro fileType — es el bug de `puestoColumn` documentado en el barrido de
// arriba. El contrato suma obligación, nunca la saca.
assert('blocksProgress: OPCIONAL NO desactiva un required:true del fileType (piso, no techo)',
  blocksProgress('apellidoNombreColumn', true) === true);
assert('blocksProgress: una clave no contratada cae 100% al flag legado (true)',
  blocksProgress('idPueColumn', true) === true);
assert('blocksProgress: una clave no contratada cae 100% al flag legado (false)',
  blocksProgress('idPueColumn', false) === false);

// Ningún concepto NR bloquea todavía por esta vía — es la prueba negativa de
// que Paso 1, solo, no cambia nada para NR. El día que se agregue la omisión
// (Paso 2), estos deberían empezar a fallar acá y hay que actualizarlos junto
// con el mecanismo nuevo, no antes.
const { NR_CONCEPTS: nrConceptsParaGate } = await import('./js/controls/nr.js');
assert('ningún concepto NR bloquea todavía (Paso 1 no activa el gate; eso es Paso 2)',
  nrConceptsParaGate.every(c =>
    blocksProgress(c.nrKey, false) === false && blocksProgress(c.tabKey, false) === false));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
