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

const { EXPORT_CONTRACTS, NECESSITY, fieldNecessityMap, necessityOfKey, blocksProgress } =
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

for (const exportId of ['brutos_reporte', 'gs_pers_reporte', 'brutos', 'gs_pers', 'nr', 'nr_reporte',
  'finadiet_asiento_cc', 'finadiet_asiento_gral']) {
  for (const col of EXPORT_CONTRACTS[exportId].columns) {
    assert(`${exportId}.${col.key}: tiene width (el writer lo necesita)`,
      typeof col.width === 'number' && col.width > 0);
  }
}

// ── D-020: un contrato 'finanzas' no lleva atributos de HR ───────────────────
//
// Antes de que existiera el primer contrato 'finanzas' esto era un assert de
// "todavía no hay ninguno". Ya hay (las dos solapas planas del asiento de
// FINADIET, que recibe Contaduría del cliente), así que lo que se hace cumplir
// es la regla real: a Finanzas va lo necesario para pagar o para asentar
// (legajo, nombre, CUIT, CBU, importe, fecha, cuenta, concepto) y NUNCA los
// atributos del empleado — puesto, categoría, centro de trabajo, altas y bajas,
// dotación. En muchos clientes Finanzas no tiene acceso a eso.

const ATRIBUTOS_HR = [
  'puesto', 'categoria', 'centrotrab', 'idcentro', 'fecalta', 'fecbaja',
  'depto', 'dotacion', 'antiguedad', 'convenio',
];
const esAtributoHR = (col) => {
  const candidatos = [col.key, ...col.from].map(s => String(s).toLowerCase());
  return ATRIBUTOS_HR.some(hr => candidatos.some(c => c.includes(hr)));
};

const contratosFinanzas = contracts.filter(c => c.audience === 'finanzas');
assert('hay al menos un contrato audience:\'finanzas\' (si no, el assert de abajo no prueba nada)',
  contratosFinanzas.length > 0);
for (const c of contratosFinanzas) {
  for (const col of c.columns) {
    assert(`${c.exportId}.${col.key}: no es un atributo de HR (D-020)`, !esAtributoHR(col));
  }
}

// ── El mapa derivado no le baja la necesidad a nada que hoy ya bloquea ───────
//
// Campos con required:true HOY (leídos a mano de FIELD_DEFS/TAB_*_FIELDS al
// escribir este test — si cambian ahí sin actualizar acá, es la señal de que
// hace falta un contrato nuevo, no de que este test esté desactualizado):
//   FIELD_DEFS.tab_control.empleadoColumn, .brutos_file.legajoColumn,
//   .gs_pers_file.legajoColumn, .nr_file.legajoColumn (todos CLAVE hoy),
//   TAB_BRUTOS_FIELDS (tabSalBaseColumn, tabACuFutAumenColumn) y
//   TAB_GS_PERS_FIELDS (tabGtosPersonalesColumn, tabDtoCocheraColumn).

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
// Mientras el esquema siga siendo un mapa plano (no `{ fileType, key }`), este
// assert es lo que impide que ese caso entre en silencio: si dos contratos
// alguna vez piden necesidades distintas para la misma clave, falla ACÁ y no
// en producción. Ver specs/contrato-export.md — es una simplificación
// deliberada del diseño, no un descuido.

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

  const colisiones = [];
  for (const [key, porContrato] of porClave) {
    const necesidades = new Set(porContrato.values());
    if (necesidades.size > 1) colisiones.push([key, [...porContrato.entries()]]);
  }

  assert('ninguna clave de mapeo pide necesidades DISTINTAS en contratos distintos',
    colisiones.length === 0);
  if (colisiones.length > 0) {
    for (const [key, usos] of colisiones) {
      console.error(`    ${key}: ${usos.map(([id, n]) => `${id}=${n}`).join(', ')}`);
    }
  }
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
assert('blocksProgress: OPCIONAL nunca bloquea, ni con el flag legado en true',
  blocksProgress('apellidoNombreColumn', true) === false);
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
