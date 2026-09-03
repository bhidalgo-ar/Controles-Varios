// uploadOmission.test.js — El gate de OBLIGATORIA en la carga de archivo y su
// vía de escape, la omisión declarada (toggle ⊘) — D-041 punto 4, activado en
// specs/obligatoria-gate-carga-archivo.md.
//
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/uploadOmission.test.js
//
// La regla que este archivo documenta como assert: un campo que algún contrato
// de export marca OBLIGATORIA bloquea el submit del mapeo (formulario de carga
// y panel de remapeo, fileUpload.js), y la única salida es declarar la columna
// ausente con ⊘ — que cuenta como resuelta para el gate y como ausencia real
// (null, no cero) para el control. Bloquear sin esa salida es peor que no
// bloquear: ningún cliente tiene los 18 conceptos de NR.

globalThis.document = { addEventListener: () => {} };

// fileUpload.js arrastra js/db.js — necesita Dexie sobre una IndexedDB falsa,
// igual que tests/exportContracts.test.js.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { puedeOmitirse, pendingUploadRequirements } = await import('./js/ui/fileUpload.js');
const { OMITIDO, NECESSITY, necessityOfKey } = await import('./js/exports/contracts.js');
const { FILE_TYPES, fieldsFor } = await import('./js/ui/fileTypes.js');
const { NR_CONCEPTS } = await import('./js/controls/nr.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── El conjunto exacto que pasó a bloquear con la activación ────────────────
//
// OBLIGATORIA por contrato y sin `required` legado: son los únicos campos cuyo
// comportamiento cambió al activar el gate, y todos ofrecen el ⊘. Si este
// assert falla porque apareció uno nuevo, no es un error del test: es un campo
// que empezó a bloquear la carga — verificar que su formulario ofrezca el
// toggle antes de agregarlo a la lista (el mismo chequeo que la spec pide
// consultar si el campo no está en el formulario: bloquearía sin salida).
const ESPERADOS = new Set([
  ...NR_CONCEPTS.map(c => `nr_file.${c.nrKey}`),
  'brutos_file.salBaseColumn',
  'brutos_file.aCuFutAumenColumn',
  'gs_pers_file.gtosPersonalesColumn',
  'gs_pers_file.dtoCocheraColumn',
]);

const flips = [];
for (const [fileType, def] of Object.entries(FILE_TYPES)) {
  for (const f of (def.fields || [])) {
    if (!f.required && necessityOfKey(fileType, f.key) === NECESSITY.OBLIGATORIA) {
      flips.push(`${fileType}.${f.key}`);
    }
  }
}
assert(`los campos que bloquean-con-salida son exactamente los ${ESPERADOS.size} esperados (18 NR + 2 Brutos + 2 GS Pers)`,
  flips.length === ESPERADOS.size && flips.every(k => ESPERADOS.has(k)));
assert('todo campo que bloquea-con-salida ofrece el toggle ⊘ (puedeOmitirse)',
  flips.every(k => {
    const [ft, key] = k.split('.');
    const field = fieldsFor(ft).find(f => f.key === key);
    return field && puedeOmitirse(ft, field);
  }));

// ── puedeOmitirse: el ⊘ sólo aparece donde corresponde ───────────────────────

const nrFields     = fieldsFor('nr_file');
const nrLegajo     = nrFields.find(f => f.key === 'legajoColumn');
const nrConcepto   = nrFields.find(f => f.key === 'reinHomeOficeColumn');
assert('un concepto NR ofrece ⊘ (OBLIGATORIA sin required legado)',
  puedeOmitirse('nr_file', nrConcepto) === true);
assert('legajoColumn NO ofrece ⊘ (CLAVE: sin esto el parser ni puede leer el archivo)',
  puedeOmitirse('nr_file', nrLegajo) === false);

// centroCostoColumn de cat_empleados es OBLIGATORIA por contrato Y required
// legado — sigue bloqueando duro, sin salida: darle el ⊘ le sacaría una
// obligación que ya existía (piso, nunca techo, D-045).
const catCC = fieldsFor('cat_empleados').find(f => f.key === 'centroCostoColumn');
assert('un required legado NO ofrece ⊘ aunque el contrato lo declare OBLIGATORIA',
  catCC && necessityOfKey('cat_empleados', 'centroCostoColumn') === NECESSITY.OBLIGATORIA
  && puedeOmitirse('cat_empleados', catCC) === false);

const rendEstimulo = fieldsFor('rend_file').find(f => f.key === 'estimuloColumn');
assert('un campo OPCIONAL no ofrece ⊘ (no bloquea, declararlo ausente no cambia nada)',
  puedeOmitirse('rend_file', rendEstimulo) === false);

// ── pendingUploadRequirements: el gate del submit ────────────────────────────

const pendVacio = pendingUploadRequirements('nr_file', nrFields, {});
assert('NR sin nada mapeado: bloquean legajo + todos los conceptos',
  pendVacio.length === 1 + NR_CONCEPTS.length);

// El caso que la activación NO puede romper: un NR al que le faltan conceptos
// se sube declarándolos ausentes. OMITIDO cuenta como resuelto.
const mappingConOmision = { legajoColumn: 'LEGAJO' };
for (const c of NR_CONCEPTS) mappingConOmision[c.nrKey] = OMITIDO;
mappingConOmision.reinHomeOficeColumn = 'REIN_HOME_OFICE'; // uno real, el resto ⊘
assert('NR con legajo + 1 concepto mapeado + 17 declarados ⊘: el gate pasa',
  pendingUploadRequirements('nr_file', nrFields, mappingConOmision).length === 0);

const soloOmisiones = { legajoColumn: 'LEGAJO' };
for (const c of NR_CONCEPTS) soloOmisiones[c.nrKey] = OMITIDO;
assert('NR con los 18 declarados ⊘: el gate pasa (que no haya NR es resultado válido, D-036)',
  pendingUploadRequirements('nr_file', nrFields, soloOmisiones).length === 0);

const sinUno = { ...soloOmisiones };
delete sinUno.gratVacColumn;
const pendSinUno = pendingUploadRequirements('nr_file', nrFields, sinUno);
assert('con un concepto sin resolver (ni columna ni ⊘), el gate lo nombra',
  pendSinUno.length === 1 && pendSinUno[0].key === 'gratVacColumn');

// Un OMITIDO donde el campo no admite ⊘ NO cuenta como resuelto. La UI nunca
// lo escribe (el toggle no se ofrece), así que sólo puede venir de un perfil
// corrupto o editado a mano — y si contara, el parser recibiría una "columna"
// que ninguna fila trae y seguiría de largo con 0 filas: el default silencioso
// exacto que el gate existe para cortar.
const legajoOmitido = { ...soloOmisiones, legajoColumn: OMITIDO };
const pendLegajo = pendingUploadRequirements('nr_file', nrFields, legajoOmitido);
assert('un OMITIDO colado en una CLAVE no pasa el gate',
  pendLegajo.length === 1 && pendLegajo[0].key === 'legajoColumn');

// Brutos y GS Pers: mismos dos movimientos, con sus 2 campos cada uno.
const brutosFields = fieldsFor('brutos_file');
assert('Brutos sin nada mapeado: bloquean legajo + SAL_BASE + A_CTA_FUT_AUMEN',
  pendingUploadRequirements('brutos_file', brutosFields, {}).length === 3);
assert('Brutos con legajo + SAL_BASE y A_CTA_FUT_AUMEN declarados ⊘: el gate pasa',
  pendingUploadRequirements('brutos_file', brutosFields,
    { legajoColumn: 'LEGAJO', salBaseColumn: OMITIDO, aCuFutAumenColumn: OMITIDO }).length === 0);

const gsPersFields = fieldsFor('gs_pers_file');
assert('GS Pers con legajo + una columna real + la otra ⊘: el gate pasa',
  pendingUploadRequirements('gs_pers_file', gsPersFields,
    { legajoColumn: 'LEGAJO', gtosPersonalesColumn: 'GTOS_PERSONALES', dtoCocheraColumn: OMITIDO }).length === 0);

// ── OMITIDO se computa como ausencia, no como cero ───────────────────────────
// El mismo assert que tests/tabExtraOmission.test.js hace para el Paso 2,
// del lado archivo: la clave omitida es truthy pero row[OMITIDO] no existe en
// ninguna fila real, así que consolidar por ella da null (sin dato), no 0.
const { sumColumn } = await import('./js/controls/consolidate.js');
const filas = [{ LEGAJO: '1', REIN_HOME_OFICE: '1.234,56' }];
assert('sumColumn sobre una clave OMITIDO da null (sin dato), no 0',
  sumColumn(filas, OMITIDO) === null);
assert('…y sobre la columna real de esas mismas filas sigue sumando',
  sumColumn(filas, 'REIN_HOME_OFICE') === 1234.56);

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
