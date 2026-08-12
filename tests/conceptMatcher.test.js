// conceptMatcher.test.js — Resolución de encabezado → concepto del catálogo
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/conceptMatcher.test.js
//
// Cubre el binding cruzado que encontró la auditoría de campos-vs-export
// (2026-08-12): `buildParserMapping` no llevaba registro de qué encabezado ya
// había asignado, así que dos conceptos podían quedar apuntando a la MISMA
// columna. Es la peor forma del problema, porque no produce un vacío que algún
// aviso pueda detectar: produce un número mal.
//
// El caso real: INDEM_INTEG es el único de los 18 conceptos NR con `alias: []`,
// así que su único token de búsqueda es el código crudo. Como
// 'sacindeminteg'.includes('indeminteg') es true, el paso "contains" le entregaba
// la columna de SAC_INDEM_INTEG cuando el archivo traía esa y no INDEM_INTEG.
//
// `matchHeadersToCatalog` ya tenía el Set de encabezados usados; esta función no.
//
// Datos inventados; los códigos de concepto son los reales del catálogo semilla.

globalThis.document = { addEventListener: () => {} };

const { buildParserMapping, findHeaderForConcept } = await import('./js/parsers/conceptMatcher.js');
const { CATALOGO_SEED } = await import('./js/data/catalogoSeed.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const CLAVES_NR = {
  'INDEM_INTEG':     'indemIntegColumn',
  'SAC_INDEM_INTEG': 'sacIndemIntegColumn',
  'INDEM_PREAVISO':  'indemPreavisoColumn',
};

// Precondición del bug: INDEM_INTEG no tiene alias en el catálogo. Si algún día
// se le agrega uno, este test sigue siendo válido pero deja de ser el caso real.
const indemInteg = CATALOGO_SEED.find(c => c.codigo === 'INDEM_INTEG');
assert('INDEM_INTEG existe en el catálogo semilla', !!indemInteg);

// ── El bug: el archivo trae SAC_INDEM_INTEG y NO trae INDEM_INTEG ────────────

{
  const headers = ['LEGAJO', 'SAC_INDEM_INTEG', 'INDEM_PREAVISO'];
  const m = buildParserMapping(headers, CATALOGO_SEED, CLAVES_NR);

  assert('NO reproduce el bug viejo: los dos conceptos NO comparten columna',
    !(m.indemIntegColumn && m.indemIntegColumn === m.sacIndemIntegColumn));
  assert('el match exacto gana: SAC_INDEM_INTEG queda en su propia clave',
    m.sacIndemIntegColumn === 'SAC_INDEM_INTEG');
  assert('INDEM_INTEG queda sin mapear, que es el resultado honesto',
    m.indemIntegColumn === undefined);
  assert('el concepto no involucrado no se ve afectado',
    m.indemPreavisoColumn === 'INDEM_PREAVISO');
}

// ── No rompe el caso normal: el archivo trae las dos columnas ───────────────

{
  const m = buildParserMapping(['LEGAJO', 'INDEM_INTEG', 'SAC_INDEM_INTEG'], CATALOGO_SEED, CLAVES_NR);
  assert('con las dos columnas presentes, cada concepto va a la suya',
    m.indemIntegColumn === 'INDEM_INTEG' && m.sacIndemIntegColumn === 'SAC_INDEM_INTEG');
}

// El orden de los encabezados en el archivo no puede cambiar el resultado.
{
  const m = buildParserMapping(['LEGAJO', 'SAC_INDEM_INTEG', 'INDEM_INTEG'], CATALOGO_SEED, CLAVES_NR);
  assert('el resultado no depende del orden de las columnas del archivo',
    m.indemIntegColumn === 'INDEM_INTEG' && m.sacIndemIntegColumn === 'SAC_INDEM_INTEG');
}

// ── El paso "contains" sigue sirviendo para lo que existe ────────────────────
// Es la razón por la que el paso existe: el Tabulado de un cliente puede traer
// el encabezado con palabras de más. Eso tiene que seguir matcheando.

{
  const m = buildParserMapping(['LEGAJO', 'Indem Integracion Mes Desp'], CATALOGO_SEED,
    { 'INDEM_INTEG': 'indemIntegColumn' });
  assert('un encabezado con palabras de más sigue matcheando por "contains"',
    m.indemIntegColumn === 'Indem Integracion Mes Desp');
}

// ── Ninguna columna se asigna dos veces, con el catálogo completo ────────────
// El assert de regresión general: no importa qué conceptos entren, un encabezado
// no puede salir asignado a dos claves distintas.

{
  const CLAVES_TODAS = Object.fromEntries(
    CATALOGO_SEED.map((c, i) => [c.codigo, `col${i}`])
  );
  const headers = ['LEGAJO', 'SAC_INDEM_INTEG', 'SAC_PREAVISO', 'VAC_NO_GOZ_SAC',
                   'GRA_VACNOG_SAC', 'INDEM_ANT_DESP', 'A_CTA_FUT_AUMEN'];
  const m = buildParserMapping(headers, CATALOGO_SEED, CLAVES_TODAS);
  const asignados = Object.values(m);
  assert('con el catálogo completo, ningún encabezado se asigna a dos conceptos',
    asignados.length === new Set(asignados).size);
  assert('y todo lo asignado es un encabezado real del archivo',
    asignados.every(h => headers.includes(h)));
}

// ── findHeaderForConcept: contrato de las estrategias ────────────────────────
// buildParserMapping decide la precedencia según `strategy`, así que el valor
// que devuelve es parte del contrato y no un detalle interno.

{
  const c = { codigo: 'SAL_BASE', alias: ['SUELDO'] };
  assert('match por código exacto reporta strategy "exact"',
    findHeaderForConcept(c, ['SAL_BASE'])?.strategy === 'exact');
  assert('match por alias reporta strategy "alias"',
    findHeaderForConcept(c, ['SUELDO'])?.strategy === 'alias');
  assert('match por substring reporta strategy "contains"',
    findHeaderForConcept(c, ['Sueldo Bruto Mensual'])?.strategy === 'contains');
  assert('sin ningún match devuelve null',
    findHeaderForConcept(c, ['OTRA_COSA_CUALQUIERA']) === null);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
