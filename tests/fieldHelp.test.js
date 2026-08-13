// fieldHelp.test.js — La tabla de nombres en criollo del Paso 2
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/fieldHelp.test.js
//
// El guard que este test pone es contra la deriva: la tabla vive aparte de la
// ficha (`js/ui/fieldHelp.js` vs. `js/ui/fileTypes.js`) porque el nombre en
// criollo es presentación y la clave es contrato. Aparte quiere decir que se
// pueden separar — un campo nuevo en el Tabulado se ve con su código y nadie se
// entera hasta que un analista pregunta qué es. Acá se entera CI.
//
// Lo que NO se afirma: que toda clave tenga nombre en criollo. Cuatro no lo
// tienen a propósito (no sabemos qué nombran) y se muestran con su código, que
// es lo que se veía antes de este módulo. Un nombre inventado por analogía sería
// peor que el código: se lee como si alguien lo hubiera confirmado.

globalThis.document = { addEventListener: () => {} };

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { TAB_FIELD_LABELS, tabFieldParts, necessityHelp, fieldBadgeHtml } =
  await import('./js/ui/fieldHelp.js');
const { FILE_TYPES, conceptCodeToKeyFor } = await import('./js/ui/fileTypes.js');
const { NECESSITY } = await import('./js/exports/contracts.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// Todas las claves que el panel del Paso 2 puede llegar a mostrar.
const clavesDelPanel = (FILE_TYPES.tab_control.extraFieldGroups || [])
  .flatMap(g => g.fields)
  .map(f => f.key);

// ── Cobertura ────────────────────────────────────────────────────────────────

for (const key of clavesDelPanel) {
  assert(`${key}: está en la tabla de presentación`, !!TAB_FIELD_LABELS[key]);
  assert(`${key}: declara su código técnico`,
    typeof TAB_FIELD_LABELS[key]?.code === 'string' && TAB_FIELD_LABELS[key].code !== '');
}

// Al revés: la tabla no puede tener entradas de claves que ya no existen — una
// clave renombrada dejaría el nombre viejo colgado y nada lo mostraría nunca.
for (const key of Object.keys(TAB_FIELD_LABELS)) {
  assert(`${key}: la clave todavía existe en la ficha del Tabulado`,
    clavesDelPanel.includes(key));
}

// ── El código es el mismo que usa la auto-detección ──────────────────────────
// Mostrar en mono un código que la app no conoce sería mentirle al analista, que
// lo va a ir a buscar al archivo.

const codeByKey = Object.fromEntries(
  Object.entries(conceptCodeToKeyFor('tab_control')).map(([code, key]) => [key, code])
);
for (const [key, code] of Object.entries(codeByKey)) {
  assert(`${key}: el código que se muestra es el del catálogo (${code})`,
    TAB_FIELD_LABELS[key]?.code === code);
}

// ── Cómo se arma lo que se ve ────────────────────────────────────────────────

{
  const p = tabFieldParts('tabSalBaseColumn', {});
  assert('un campo con nombre criollo muestra nombre + código',
    p.name === 'Sueldo básico' && p.code === 'SAL_BASE');
}
{
  // Sin nombre criollo el código pasa a ser el nombre — y NO se repite al lado.
  const p = tabFieldParts('tabAsigPasColumn', {});
  assert('un campo sin nombre criollo se muestra con su código, una sola vez',
    p.name === 'ASIG_PAS' && p.code === '');
}
{
  const p = tabFieldParts('clave_que_no_existe', { fallbackLabel: 'Columna de algo' });
  assert('una clave desconocida cae al label de la ficha, no desaparece',
    p.name === 'Columna de algo');
  assert('…y una sin label ni código igual muestra algo',
    tabFieldParts('otra_clave_rara', {}).name === 'otra_clave_rara');
}

// ── La explicación de qué pasa si falta ──────────────────────────────────────
// Sale de la necesidad y no de un texto por campo: si se escribiera a mano,
// podría decir algo distinto de lo que el gate hace de verdad.

assert('una OBLIGATORIA nombra la salida declarada (⊘)',
  necessityHelp(NECESSITY.OBLIGATORIA).includes('⊘'));
assert('una OPCIONAL dice que el control corre igual',
  /corre igual/.test(necessityHelp(NECESSITY.OPCIONAL)));
assert('una CLAVE dice que no hay forma de saltearla',
  /no se puede leer/.test(necessityHelp(NECESSITY.CLAVE)));

// ── Badges de origen ─────────────────────────────────────────────────────────
// El ⊘ gana sobre el nivel del pre-completado: es una decisión del analista, no
// un estado de la auto-detección. Sin esto, un campo declarado ausente podía
// salir "auto ✓" en verde, afirmando lo contrario de lo que muestra.

assert('auto ✓ para lo que propuso la app',      fieldBadgeHtml('exact', {}).includes('auto ✓'));
assert('↺ sesión anterior para el perfil guardado', fieldBadgeHtml('saved', {}).includes('sesión anterior'));
assert('⚠ sin asignar para lo que falta',        fieldBadgeHtml('warn', {}).includes('sin asignar'));
assert('⊘ no viene le gana a cualquier nivel',
  fieldBadgeHtml('exact', { omitido: true }).includes('no viene'));
assert('sin nada que decir no se pinta ningún badge', fieldBadgeHtml('none', {}) === '');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
