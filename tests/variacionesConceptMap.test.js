// variacionesConceptMap.test.js — Panel "Conceptos a comparar" del control de Variaciones
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/variacionesConceptMap.test.js
//
// Cubre el gating del wizard (`sinResolverEnNinguno`) y el mapeo guardado por
// lado (`estadoInicial` + `precargar`) — ver el fix de code-review que angostó
// el gate de `js/ui/controlsWizard.js:canGoNext` para que sólo bloquee cuando
// un concepto no se resolvió en NINGUNO de los dos archivos, sin volver a abrir
// el bug original (Plastic Florida: Jornales/Mensuales mutuamente excluyentes).

globalThis.document = { addEventListener: () => {} };

const {
  conceptosDeControles,
  estadoInicial,
  sinResolverEnNinguno,
  precargar,
  NO_LIQUIDADO,
} = await import('./js/ui/variacionesConceptMap.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const grupos = conceptosDeControles(['variaciones_sueldos'], null);
assert('conceptosDeControles arma el grupo de Sueldos con la semilla (899999 + 1000)',
  grupos.length === 1 && grupos[0].entradas.map(e => e.codigo).sort().join(',') === '1000,899999');

// ── sinResolverEnNinguno: sólo bloquea cuando faltan los DOS lados ───────────

const HEADERS_MENSUALIZADOS = ['Legajo', '1000 - Sueldo mensual'];
const HEADERS_JORNALIZADOS  = ['Legajo', '899999 - BASE de Escala'];
const HEADERS_SIN_NINGUNO   = ['Legajo', 'Otra columna cualquiera'];

// Caso real del fix: anterior jornalizado, actual mensualizado — cada concepto
// resuelve de un solo lado. No tiene que bloquear.
const estadoDiseno = estadoInicial({
  grupos,
  headersAnterior: HEADERS_JORNALIZADOS,
  headersActual: HEADERS_MENSUALIZADOS,
  guardado: null,
});
assert('Jornales resuelve sólo en el archivo anterior (por diseño)',
  estadoDiseno.anterior['899999'] !== null && estadoDiseno.actual['899999'] === null);
assert('Mensuales resuelve sólo en el archivo actual (por diseño)',
  estadoDiseno.actual['1000'] !== null && estadoDiseno.anterior['1000'] === null);
assert('el caso de diseño (Jornales/Mensuales mutuamente excluyentes) NO bloquea',
  sinResolverEnNinguno(grupos, estadoDiseno).length === 0);

// Mapeo roto: ningún archivo trae ninguna de las dos columnas esperadas.
const estadoRoto = estadoInicial({
  grupos,
  headersAnterior: HEADERS_SIN_NINGUNO,
  headersActual: HEADERS_SIN_NINGUNO,
  guardado: null,
});
assert('un concepto sin resolver en los dos archivos SÍ bloquea',
  sinResolverEnNinguno(grupos, estadoRoto).length === 2);

// Confirmar "no se liquidó" en los dos lados cuenta como decisión — no bloquea,
// es la opción explícita para ese caso (ver docblock del módulo).
const estadoNoLiquidado = {
  anterior: { '899999': NO_LIQUIDADO, '1000': NO_LIQUIDADO },
  actual:   { '899999': NO_LIQUIDADO, '1000': NO_LIQUIDADO },
};
assert('"no se liquidó" confirmado en los dos lados no bloquea (es una decisión, no un default)',
  sinResolverEnNinguno(grupos, estadoNoLiquidado).length === 0);

// ── estadoInicial + precargar: el guardado es por lado, no aplanado ──────────

// El código de concepto '1000' está mapeado a columnas DISTINTAS entre el
// archivo anterior y el actual (caso de cliente que renumera/renombra) — si el
// guardado se aplanara, uno de los dos lados pisaría al otro.
const guardadoPorLado = {
  anterior: { '1000': 'Sueldo Básico Viejo' },
  actual:   { '1000': 'Sueldo Básico Nuevo' },
};
const estadoConGuardado = estadoInicial({
  grupos: conceptosDeControles(['variaciones_conceptos'], { conceptos: [{ codigo: '1000', label: 'Test' }] }),
  headersAnterior: ['Legajo', 'Sueldo Básico Viejo'],
  headersActual:   ['Legajo', 'Sueldo Básico Nuevo'],
  guardado: guardadoPorLado,
});
assert('el guardado de "anterior" no se pierde ni lo pisa "actual"',
  estadoConGuardado.anterior['1000'] === 'Sueldo Básico Viejo');
assert('el guardado de "actual" no se pierde ni lo pisa "anterior"',
  estadoConGuardado.actual['1000'] === 'Sueldo Básico Nuevo');

// precargar() por sí solo: guardado inválido para este archivo cae al fallback
// por código, no se cuelga con la columna vieja.
assert('precargar cae al fallback por código si el guardado ya no está en los headers',
  precargar(['Legajo', '1000 - Sueldo mensual'], { codigo: '1000', label: 'x' }, { '1000': 'Columna Que Ya No Existe' })
    === '1000 - Sueldo mensual');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
