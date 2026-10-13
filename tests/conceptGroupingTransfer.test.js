// conceptGroupingTransfer.test.js — "Copiar configuración" / "Pegar configuración"
// del editor de agrupación de conceptos de Rendimiento.
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/conceptGroupingTransfer.test.js
//
// El analista copia la agrupación como texto, la manda por ticket y pega la
// vuelta. Lo que este test fija:
//   1. Lo que se copia se puede pegar tal cual y da la misma agrupación.
//   2. Un texto roto o con otra forma se rechaza con un error que dice qué se
//      esperaba y qué se encontró — y no devuelve ninguna agrupación a medias.

// rendVsTabu.js (de donde sale la forma de la agrupación) importa módulos de UI
// que registran un listener a nivel de módulo: necesitan un `document` mínimo.
globalThis.document = { addEventListener: () => {} };

const { DEFAULT_CONCEPT_CONFIG } = await import('./js/controls/rendVsTabu.js');
const {
  serializeConceptGrouping, parseConceptGroupingTransfer, GROUPING_TRANSFER_TYPE,
} = await import('./js/ui/conceptGroupingTransfer.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle !== undefined ? `\n    ${JSON.stringify(detalle)}` : ''); fail++; }
}

const NOW = new Date('2026-10-13T15:00:00Z');
const AGRUPACION = {
  precio:   [{ code: '1003', sign: 1 }, { code: '1004', sign: 1 }],
  estimulo: [],
  cargas:   [{ code: '6050', sign: 1 }, { code: '6110', sign: -1 }],
  provMes:  [{ code: '3670', sign: 1 }],
  provCcss: [{ code: '7289', sign: -1 }],
};

/** El envoltorio válido, para romperlo de a una cosa por vez. */
const valido = () => JSON.parse(serializeConceptGrouping(AGRUPACION, { clientCode: 'BANFIELD', now: NOW }));
const pegar = (obj) => parseConceptGroupingTransfer(typeof obj === 'string' ? obj : JSON.stringify(obj));

// ── 1) Ida y vuelta ──────────────────────────────────────────────────────────
{
  const texto = serializeConceptGrouping(AGRUPACION, { clientCode: 'BANFIELD', now: NOW });
  const env = JSON.parse(texto);
  assert('el texto copiado se identifica: tipo, versión, cliente y fecha',
    env.tipo === GROUPING_TRANSFER_TYPE && env.version === 1
    && env.cliente === 'BANFIELD' && env.copiado === NOW.toISOString(), env);
  assert('es legible: un concepto por renglón',
    texto.includes('{ "code": "1003", "sign": 1 }') && texto.includes('{ "code": "6110", "sign": -1 }'), texto);
  assert('no lleva nada más que la agrupación y el envoltorio',
    Object.keys(env).sort().join(',') === 'agrupacion,cliente,copiado,tipo,version', Object.keys(env));

  const res = parseConceptGroupingTransfer(texto);
  assert('lo copiado se pega sin errores', res.ok === true, res);
  assert('y da la misma agrupación', JSON.stringify(res.grouping) === JSON.stringify(AGRUPACION), res.grouping);
  assert('y dice de qué cliente salió', res.clientCode === 'BANFIELD', res.clientCode);
}

{
  const res = parseConceptGroupingTransfer(serializeConceptGrouping(DEFAULT_CONCEPT_CONFIG));
  assert('la agrupación predeterminada también va y vuelve igual',
    res.ok && JSON.stringify(res.grouping) === JSON.stringify(DEFAULT_CONCEPT_CONFIG));
  assert('sin cliente a mano, el texto dice cliente null y se pega igual', res.ok && res.clientCode === null);
}

{
  // Una agrupación guardada con una categoría de menos se copia con la lista
  // vacía: lo que se copia siempre se puede volver a pegar.
  const res = parseConceptGroupingTransfer(serializeConceptGrouping({ precio: [{ code: '1003', sign: 1 }] }));
  assert('una agrupación incompleta se copia con las cinco categorías',
    res.ok && res.grouping.cargas.length === 0 && res.grouping.precio.length === 1, res);
}

{
  // Si alguien editó el texto a mano y le sacó las comillas al código.
  const env = valido();
  env.agrupacion.precio = [{ code: 1003, sign: 1 }];
  const res = pegar(env);
  assert('un código escrito como número se acepta y queda como texto',
    res.ok && res.grouping.precio[0].code === '1003', res);
}

// ── 2) Lo que se rechaza ─────────────────────────────────────────────────────
const rechaza = (desc, entrada, patron) => {
  const res = pegar(entrada);
  assert(desc, res.ok === false && !('grouping' in res) && patron.test(res.error), res);
};

rechaza('vacío → pide pegar el texto', '   ', /No hay nada pegado/);
rechaza('JSON roto (cortado al copiar) → dice que no se puede leer',
  serializeConceptGrouping(AGRUPACION).slice(0, 80), /no se puede leer/);
rechaza('una lista suelta → se esperaba la configuración, se encontró una lista',
  [{ code: '1003', sign: 1 }], /se encontró una lista/);
rechaza('sin "tipo" → no es una agrupación de Rendimiento',
  (() => { const e = valido(); delete e.tipo; return e; })(), /no dice de qué tipo es/);
rechaza('otro "tipo" → lo nombra',
  { ...valido(), tipo: 'agrupadores' }, /"agrupadores"/);
rechaza('sin "agrupacion" → la pide',
  (() => { const e = valido(); delete e.agrupacion; return e; })(), /Falta la agrupación/);
rechaza('una categoría que no existe → la nombra y lista las válidas',
  (() => { const e = valido(); e.agrupacion.retiros = []; return e; })(), /retiros.*Se esperaban sólo: precio/);
rechaza('falta una categoría → la nombra',
  (() => { const e = valido(); delete e.agrupacion.provCcss; return e; })(), /falta la categoría provCcss/);
rechaza('una categoría que no es lista',
  (() => { const e = valido(); e.agrupacion.cargas = { code: '6050', sign: 1 }; return e; })(),
  /En "cargas" se esperaba una lista.*un objeto/);
rechaza('un código con letras',
  (() => { const e = valido(); e.agrupacion.precio[1].code = 'SUELDO'; return e; })(),
  /"precio", el concepto 2.*"SUELDO"/);
rechaza('un signo que no es 1 ni -1',
  (() => { const e = valido(); e.agrupacion.cargas[0].sign = 2; return e; })(),
  /6050.*1 \(suma\) o -1 \(resta\).*el valor 2/);
rechaza('un concepto sin signo',
  (() => { const e = valido(); delete e.agrupacion.provMes[0].sign; return e; })(),
  /no tiene signo/);
rechaza('el mismo código dos veces en una categoría (se sumaría dos veces)',
  (() => { const e = valido(); e.agrupacion.precio.push({ code: '1003', sign: 1 }); return e; })(),
  /1003 aparece dos veces/);

// Un error en la última categoría no deja aplicada ninguna de las anteriores.
{
  const e = valido();
  e.agrupacion.provCcss[0].sign = 0;
  const res = pegar(e);
  assert('un error en cualquier lugar no devuelve una agrupación a medias',
    res.ok === false && res.grouping === undefined, res);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
