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

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { saveControlConfig, getControlConfig } = await import('./js/db.js');

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

// ── El mapeo confirmado sobrevive a salir y volver a entrar al wizard ────────
// El `state` del wizard se arma de cero en cada entrada, así que guardarlo sólo
// ahí no lo recordaba: el analista reconfirmaba concepto por concepto, en los
// dos Tabulados, todos los meses. Ahora va a `controlConfigs` bajo el controlId
// 'variaciones_concept_map' — la misma tabla que viaja en el seed (D-035).
{
  const CODE = 'TESTPOF';
  const gruposPersist = conceptosDeControles(['variaciones_conceptos'],
    { conceptos: [{ codigo: '1000', label: 'Test' }] });

  const confirmado = {
    anterior: { '1000': 'Sueldo Básico Viejo' },
    actual:   { '1000': 'Sueldo Básico Nuevo' },
  };
  await saveControlConfig(CODE, 'variaciones_concept_map', { params: confirmado });

  // Segunda entrada al wizard: `state` nuevo, precargado desde controlConfigs.
  const recuperado = await getControlConfig(CODE, 'variaciones_concept_map');
  assert('el mapeo de conceptos se persiste en controlConfigs',
    recuperado?.params != null);

  const estadoTrasVolver = estadoInicial({
    grupos: gruposPersist,
    headersAnterior: ['Legajo', 'Sueldo Básico Viejo'],
    headersActual:   ['Legajo', 'Sueldo Básico Nuevo'],
    guardado: recuperado?.params || null,
  });
  assert('al volver a entrar al wizard, "anterior" sigue precargado',
    estadoTrasVolver.anterior['1000'] === 'Sueldo Básico Viejo');
  assert('al volver a entrar al wizard, "actual" sigue precargado',
    estadoTrasVolver.actual['1000'] === 'Sueldo Básico Nuevo');

  // El guard de D-035 vale igual después del round-trip por IndexedDB: los dos
  // lados van separados y ninguno pisa al otro.
  assert('el round-trip por IndexedDB no aplana los dos lados en un solo dict',
    recuperado.params.anterior['1000'] !== recuperado.params.actual['1000']);

  // La config es por cliente: otro cliente no hereda el mapeo.
  const deOtroCliente = await getControlConfig('OTROPOF', 'variaciones_concept_map');
  assert('el mapeo no se filtra a otro cliente', !deOtroCliente);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
