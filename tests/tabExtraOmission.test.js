// tabExtraOmission.test.js — Gate derivado + omisión declarada (Paso 2 de
// specs/contrato-export.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/tabExtraOmission.test.js
//
// Antes, canGoNext tenía una lista de 4 claves cableada a mano (Brutos y GS
// Pers); los 18 conceptos de NR no tenían ningún gate — nadie escribió la
// tercera rama. `pendingTabRequirements()` deriva de la necesidad que
// declara EXPORT_CONTRACTS en vez de enumerar, así que un control nuevo con
// contrato queda gateado el día que se agrega.
//
// El punto crítico de este test es el que casi se rompe al escribirlo: una
// clave OBLIGATORIA sin la omisión declarada (OMITIDO) bloquearía la carga de
// cualquier archivo de NR al que le falte un concepto — y ningún cliente
// tiene los 18. Por eso la omisión tiene que "contar como resuelto" en el
// mismo gate que hace obligatorio el campo, no ser un mecanismo aparte.

globalThis.document = { addEventListener: () => {} };

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { pendingTabRequirements, shouldAutoFillTabValue } = await import('./js/ui/controlsWizard.js');
const { OMITIDO, esOmitido } = await import('./js/exports/contracts.js');
const { NR_CONCEPTS } = await import('./js/controls/nr.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── El caso que había que arreglar: los conceptos de NR ahora bloquean ───────

{
  const cfgVacio = {};
  const pend = pendingTabRequirements(cfgVacio, { hasBrutos: false, hasGsPers: false, hasNr: true });
  assert('con NR seleccionado y la config vacía, todos sus conceptos quedan pendientes',
    pend.length === NR_CONCEPTS.length);
  assert('todos los pendientes son los tabKey de NR_CONCEPTS',
    pend.every(f => NR_CONCEPTS.some(c => c.tabKey === f.key)));
}

// Sin NR seleccionado, sus conceptos no cuentan — el panel de Brutos no tiene
// que bloquear por columnas de un control que ni se corrió.
{
  const pend = pendingTabRequirements({}, { hasBrutos: true, hasGsPers: false, hasNr: false });
  assert('sin NR seleccionado, ningún concepto NR aparece entre los pendientes',
    pend.every(f => !NR_CONCEPTS.some(c => c.tabKey === f.key)));
  assert('con Brutos seleccionado y config vacía, sus 2 columnas quedan pendientes',
    pend.length === 2);
}

// ── La omisión declarada cuenta como resuelto — SIN esto, Paso 2 rompe NR ───

{
  const cfgConOmisiones = {};
  for (const c of NR_CONCEPTS) cfgConOmisiones[c.tabKey] = OMITIDO;
  const pend = pendingTabRequirements(cfgConOmisiones, { hasBrutos: false, hasGsPers: false, hasNr: true });
  assert('con los 18 conceptos declarados OMITIDO, no queda ninguno pendiente',
    pend.length === 0);
}

// Caso mixto: algunos mapeados, algunos omitidos, ninguno sin resolver.
{
  const cfg = {};
  NR_CONCEPTS.forEach((c, i) => {
    cfg[c.tabKey] = i % 2 === 0 ? `COLUMNA_${i}` : OMITIDO;
  });
  const pend = pendingTabRequirements(cfg, { hasBrutos: false, hasGsPers: false, hasNr: true });
  assert('mapeado real + omitido cubren los 18, ninguno queda pendiente',
    pend.length === 0);
}

// Uno solo sin resolver (ni mapeado ni omitido) sí bloquea — la omisión no es
// "todo o nada", es por columna.
{
  const cfg = {};
  NR_CONCEPTS.forEach(c => { cfg[c.tabKey] = OMITIDO; });
  delete cfg[NR_CONCEPTS[0].tabKey]; // uno queda sin resolver
  const pend = pendingTabRequirements(cfg, { hasBrutos: false, hasGsPers: false, hasNr: true });
  assert('un solo concepto sin resolver entre 18 omitidos sigue bloqueando',
    pend.length === 1 && pend[0].key === NR_CONCEPTS[0].tabKey);
}

// ── shouldAutoFillTabValue: la omisión NO es un valor obsoleto ───────────────
//
// El bug que se evitó antes de commitear: si la auto-detección tratara una
// omisión declarada como "obsoleta", la próxima vez que corriera y encontrara
// cualquier columna con un nombre parecido, la pisaría en silencio — el
// analista perdería su propia decisión sin haber tocado nada.

const HEADERS = ['LEGAJO', 'INDEM_PREAVISO'];

assert('un valor OMITIDO nunca se auto-completa, aunque parezca "obsoleto"',
  shouldAutoFillTabValue(OMITIDO, HEADERS) === false);
assert('un campo vacío SÍ se puede auto-completar',
  shouldAutoFillTabValue('', HEADERS) === true);
assert('un campo sin valor (undefined) SÍ se puede auto-completar',
  shouldAutoFillTabValue(undefined, HEADERS) === true);
assert('un valor obsoleto (no OMITIDO) SÍ se puede reparar',
  shouldAutoFillTabValue('COLUMNA_VIEJA', HEADERS) === true);
assert('un valor vigente NO se toca',
  shouldAutoFillTabValue('INDEM_PREAVISO', HEADERS) === false);

// ── esOmitido / OMITIDO: contrato básico del sentinel ────────────────────────

assert('esOmitido reconoce el sentinel', esOmitido(OMITIDO) === true);
assert('esOmitido no confunde un nombre de columna real con el sentinel',
  esOmitido('INDEM_PREAVISO') === false);
assert('esOmitido no confunde vacío con el sentinel', esOmitido('') === false);
assert('esOmitido no confunde undefined con el sentinel', esOmitido(undefined) === false);

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
