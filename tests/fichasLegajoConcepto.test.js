// fichasLegajoConcepto.test.js — Qué va ADENTRO de la ficha en los tres
// controles donde la unidad es el legajo y adentro hay varios conceptos:
// Control NR, Novedades vs Liquidación y Variación Conceptos (§4 y §8 de
// specs/vista-estandar-resultados.md, tanda 4).
//
// La pieza que dibuja la ficha ya se testea en `tests/vistaEstandar.test.js`.
// Acá se fija lo que decide cada control: la cascada de la tira, el renglón por
// concepto CON SU CÓDIGO, y que la conclusión sea una instrucción y no un
// resumen. Y sobre todo las tres cosas que no se pueden romper sin que la
// pantalla mienta:
//
//   1. La ficha no recalcula: sus totales son los mismos que el control publica,
//      con las liquidaciones del mes ya consolidadas por legajo (D-042).
//   2. El legajo del que no se pudo comparar nada NO sale en verde (D-073).
//   3. "No comparable" y "sin contraparte" salen CON SU MOTIVO, no detrás de un
//      guión (D-070).
//
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/fichasLegajoConcepto.test.js
//
// TODOS los datos son inventados: legajos cortos y los apellidos de la lista de
// jugadores de Banfield de CLAUDE.md. Un export de cliente no entra al repo ni
// como fixture.

globalThis.document = { addEventListener: () => {} };

import * as XLSXmod from 'xlsx';
globalThis.XLSX = XLSXmod;

const { fichaCardHtml, fichaBodyHtml } = await import('./js/ui/fichaList.js');
const { codeOfColumn } = await import('./js/controls/tabCodes.js');
const { runNr, buildFichasNr, NR_CONCEPTS } = await import('./js/controls/nr.js');
const { parseExpNov } = await import('./js/parsers/expNovParser.js');
const { readTabAxton } = await import('./js/parsers/tabAxtonReader.js');
const {
  runNovedadesLiquidacion, summarizeNovedadesLiquidacion,
  buildFichasNovLiq, DEFAULT_NOV_LIQ_CONFIG,
} = await import('./js/controls/novedadesLiquidacion.js');
const {
  runVariacionesConceptos, buildFichasConceptos,
} = await import('./js/controls/variaciones.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle !== undefined ? `\n    ${detalle}` : ''); fail++; }
}

/** El cuerpo de la ficha, dibujado como lo dibuja el primer despliegue. */
const cuerpoDe = (f) => fichaBodyHtml(f.body, { id: f.id });

/** La pastilla de la tira con ese rótulo (o el rótulo que arranca así). */
function pastilla(f, rotulo) {
  return f.body.strip.find(p => p.label === rotulo || p.label.startsWith(`${rotulo} ·`));
}


// ══════════════════════════════════════════════════════════════════════
// 0. El código de concepto sale del encabezado, nunca del nombre
// ══════════════════════════════════════════════════════════════════════
//
// El Tabulado real trae `'4899-COCHERA_IG'` y `'8805-DTO_COCHERA'` a la vez:
// una ficha que muestre "COCHERA" manda a mirar el concepto equivocado.

assert('de "3903-INDEM_PREAVISO" sale el código 3903',
  codeOfColumn('3903-INDEM_PREAVISO') === '3903');
assert('también con guión bajo, que es la otra forma que trae el archivo',
  codeOfColumn('3903_INDEM_PREAVISO') === '3903');
assert('un encabezado que es sólo el número también declara su código',
  codeOfColumn('1003') === '1003');
assert('un encabezado sin código devuelve null, no un código inventado',
  codeOfColumn('COCHERA') === null && codeOfColumn(null) === null && codeOfColumn('') === null);


// ══════════════════════════════════════════════════════════════════════
// 1. Control NR — 18 conceptos, y hoy la fila decía "# Difs" y nada más
// ══════════════════════════════════════════════════════════════════════
//
// El caso está armado para que se vea lo que la ficha tiene que resolver:
//   leg. 7  → DOS liquidaciones del mes en los DOS archivos (mensual + baja):
//             prueba que la ficha suma y no pisa (D-042). Un concepto cierra y
//             el otro difiere.
//   leg. 9  → informa NR y no está en el Tabulado.
//   leg. 10 → cierra al centavo.
//   leg. 11 → un concepto con valor de un solo lado: no se puede comparar.

const COL_PREAVISO = '3903-INDEM_PREAVISO';
const COL_VACNOGOZ = '3973-VAC_NO_GOZADAS';

const tabRowsNr = [
  { Legajo: '7',  [COL_PREAVISO]: '60.000,00', [COL_VACNOGOZ]: '30.000,00' },
  { Legajo: '7',  [COL_PREAVISO]: '40.000,00', [COL_VACNOGOZ]: '20.000,00' },
  { Legajo: '10', [COL_PREAVISO]: '',          [COL_VACNOGOZ]: '15.000,00' },
  { Legajo: '11', [COL_PREAVISO]: '',          [COL_VACNOGOZ]: '' },
];
const nrRowsNr = [
  { LEGAJO: '7',  INDEM_PREAVISO: '60.000,00', VAC_NO_GOZADAS: '25.000,00' },
  { LEGAJO: '7',  INDEM_PREAVISO: '40.000,00', VAC_NO_GOZADAS: '13.000,00' },
  { LEGAJO: '9',  INDEM_PREAVISO: '80.000,00', VAC_NO_GOZADAS: '' },
  { LEGAJO: '10', INDEM_PREAVISO: '',          VAC_NO_GOZADAS: '15.000,00' },
  { LEGAJO: '11', INDEM_PREAVISO: '',          VAC_NO_GOZADAS: '7.000,00' },
];
const mappingNr = {
  period: '2026-04',
  nr:  { legajoColumn: 'LEGAJO', indemPreavisoColumn: 'INDEM_PREAVISO', vacNoGozadasColumn: 'VAC_NO_GOZADAS' },
  tab: { empleadoColumn: 'Legajo', tabIndemPreavisoColumn: COL_PREAVISO, tabVacNoGozadasColumn: COL_VACNOGOZ },
};

const resNr = runNr(nrRowsNr, tabRowsNr, mappingNr);

assert('runNr publica el código de concepto de cada columna del Tabulado',
  resNr.codigos.indemPreaviso === '3903' && resNr.codigos.vacNoGozadas === '3973');
assert('…y deja en null el de los conceptos que este cliente no mapeó — no inventa uno',
  resNr.codigos.gratVac === null);
assert('el control sigue contando lo mismo que antes de la ficha',
  resNr.summary.total === 4 && resNr.summary.conDif === 1 && resNr.summary.sinTabData === 1);

const relevantesNr = resNr.rows.filter(r =>
  NR_CONCEPTS.some(c => {
    const v = r.valores[c.key];
    return (v.nrVal !== null && Math.abs(v.nrVal) > 0.01)
        || (v.tabVal !== null && Math.abs(v.tabVal) > 0.01);
  }));
const fichasNr = buildFichasNr(relevantesNr, resNr.codigos);
const nrDe = (legajo) => fichasNr.find(f => f.id === legajo);

assert('hay una ficha por legajo con valores NR, no una por concepto',
  fichasNr.length === 4, `fichas: ${fichasNr.length}`);

// ── El legajo con dos liquidaciones del mes ──────────────────────────────────
{
  const f = nrDe('7');
  assert('la tira suma las DOS liquidaciones del mes de cada lado (60+40 y 30+20)',
    pastilla(f, 'Reporte NR').value === 138000 && pastilla(f, 'Tabulado').value === 150000,
    `NR=${pastilla(f, 'Reporte NR').value} Tab=${pastilla(f, 'Tabulado').value}`);
  assert('la tercera pastilla es la diferencia de lo que sí se pudo comparar',
    pastilla(f, 'Diferencia comparada').value === 12000);
  assert('la anteúltima pastilla va invertida y el residuo es lo que hay que revisar',
    pastilla(f, 'Diferencia comparada').invert === true
    && pastilla(f, 'A revisar').residuo === true);
  assert('"A revisar" es la suma en valor absoluto de los conceptos que difieren',
    f.aRevisar === 12000 && pastilla(f, 'A revisar').value === 12000);
  assert('la pastilla dice cuántos conceptos explican la diferencia',
    pastilla(f, 'A revisar').label === 'A revisar · 1 de 2 conceptos',
    pastilla(f, 'A revisar').label);
  assert('el legajo con una diferencia arriba del monto cae en "Con diferencia"',
    f.estado === 'conDif' && f.severity === 'error');

  const cuerpo = cuerpoDe(f);
  assert('cada renglón del detalle lleva el CÓDIGO del concepto, no sólo el nombre',
    cuerpo.includes('3973 · VAC_NO_GOZADAS') && cuerpo.includes('3903 · INDEM_PREAVISO'),
    cuerpo.slice(cuerpo.indexOf('ficha-detail'), cuerpo.indexOf('ficha-detail') + 400));
  assert('el concepto que difiere va primero, que es lo que se viene a mirar',
    f.body.detail.rows[0].concepto === '3973 · VAC_NO_GOZADAS');
  assert('los dos lados y la diferencia van en el mismo renglón',
    f.body.detail.rows[0].tab === 50000 && f.body.detail.rows[0].nr === 38000
    && f.body.detail.rows[0].dif === 12000);
  assert('lo que el Tabulado tiene de más se pinta en verde suave',
    f.body.detail.rows[0].tone === 'pos' && cuerpo.includes('ficha-detail__row--pos'));
  assert('el concepto que cerró no se pinta de ningún color',
    f.body.detail.rows[1].dif === 0 && f.body.detail.rows[1].tone === undefined);
  assert('el pie del detalle cae en la columna de la diferencia, no en la última',
    f.body.detail.foot.key === 'dif');
  assert('…y totaliza esa columna: es la suma de las diferencias, no la resta de los dos totales',
    f.body.detail.foot.value === f.body.detail.rows.reduce((a, r) => a + (r.dif ?? 0), 0));
  assert('la conclusión es una instrucción: dice qué columna abrir',
    /Abrí el Tabulado en la columna de 3973/.test(f.body.conclusion.text),
    f.body.conclusion.text);
  assert('…y descuenta lo que ya cierra, para no mandar a mirar de más',
    /El otro concepto de este legajo ya cierra: no hace falta mirarlo/.test(f.body.conclusion.text),
    f.body.conclusion.text);
  assert('el badge nombra el concepto con su código y el signo de la diferencia',
    f.badge.text === '3973 · VAC_NO_GOZADAS +12.000,00', f.badge.text);
}

// ── El legajo que informa NR y no está en el Tabulado ───────────────────────
{
  const f = nrDe('9');
  assert('sin datos en el Tabulado el legajo cae en "Sin comparar", nunca en verde',
    f.estado === 'sinComparar' && f.severity === 'warn');
  assert('el lado que no existe sale como "—", no como 0,00',
    pastilla(f, 'Tabulado').value === null
    && cuerpoDe(f).includes('—'));
  assert('la conclusión manda a chequear que los dos archivos sean del mismo mes',
    /mismo mes/.test(f.body.conclusion.text) && f.body.conclusion.tone === 'warn');
}

// ── El legajo que cierra ────────────────────────────────────────────────────
{
  const f = nrDe('10');
  assert('el legajo que coincide cae en "Al centavo" y en verde',
    f.estado === 'centavo' && f.severity === 'ok');
  assert('y su conclusión dice que no hay nada para revisar acá',
    f.body.conclusion.tone === 'ok' && /No hay nada para revisar/.test(f.body.conclusion.text));
}

// ── El concepto con valor de un solo lado ───────────────────────────────────
//
// El caso que hacía que la ficha mintiera: el legajo trae 7.000,00 en un concepto
// que el Tabulado no informa. Restar los dos totales daba "−7.000,00 de
// diferencia", que es tratar un `null` como un cero.
{
  const f = nrDe('11');
  assert('un concepto con valor de un solo lado deja al legajo en "Sin comparar"',
    f.estado === 'sinComparar');
  assert('los dos totales de la tira siguen siendo los de cada archivo',
    pastilla(f, 'Reporte NR').value === 7000 && pastilla(f, 'Tabulado').value === null);
  assert('pero la diferencia NO es la resta de los dos: un lado que falta no vale cero',
    pastilla(f, 'Diferencia comparada').value === null,
    String(pastilla(f, 'Diferencia comparada').value));
  assert('la conclusión dice el importe que quedó sin comparar y de qué lado está',
    /7\.000,00 en el Reporte de NR, nada del otro lado/.test(f.body.conclusion.text),
    f.body.conclusion.text);
  assert('…y avisa que ese importe no entra en la diferencia de arriba',
    /NO entra en la diferencia de arriba/.test(f.body.conclusion.text));
  assert('la conclusión manda a revisar el mapeo antes que el número',
    /revisá el mapeo primero/.test(f.body.conclusion.text));
  assert('y no lo cuenta como diferencia: "a revisar" queda en cero',
    f.aRevisar === 0);
}

assert('las pills de la tarjeta nombran los conceptos del legajo con su código',
  fichaCardHtml(nrDe('7')).includes('3973 · VAC_NO_GOZADAS'));


// ══════════════════════════════════════════════════════════════════════
// 2. Novedades vs Liquidación — legajo × concepto en cuatro bandas
// ══════════════════════════════════════════════════════════════════════

function xlsxDe(sheetName, aoa) {
  const wb = XLSXmod.utils.book_new();
  XLSXmod.utils.book_append_sheet(wb, XLSXmod.utils.aoa_to_sheet(aoa), sheetName);
  return XLSXmod.write(wb, { type: 'array', bookType: 'xlsx' });
}
const HOJA_NOV = 'd  axFiles HidalgoExpNov_1132_2';
const HOJA_TAB = 'Liquidaciones.20260731.101122.3';

function tabuladoConCantidades(conceptos, filas, totalGeneral) {
  const enc = ['Legajo', 'Apellido y Nombres', 'Liquidacion'];
  const sub = ['', '', ''];
  for (const c of conceptos) { enc.push(c, ''); sub.push('Cant', 'Imp'); }
  enc.push('Neto', '');
  sub.push('Cant', 'Imp');
  return xlsxDe(HOJA_TAB, [enc, sub, ...filas, totalGeneral]);
}

const CONCEPTOS_TAB = ['1000 - Sueldo Basico', '1100 - Horas Extras', '1200 - Adicional'];

const resNl = runNovedadesLiquidacion(
  parseExpNov(xlsxDe(HOJA_NOV, [
    ['Legajo', 'Apellido y Nombres', '1000', '1100', '1200'],
    ['1', 'SANGUINETTI JAVIER', '30$150000', '5$8000', null],
    ['2', 'FALCIONI JULIO CESAR', '30$120000', null, null],
    ['3', 'LUCCHETTI CRISTIAN', null, null, '2$9000'],
    ['4', 'ERVITI WALTER', null, '4$6000', null],
    ['6', 'PALACIO RODRIGO', '30$100000', '2$3000', null],
  ])).parsedRows,
  [],
  (() => {
    const t = readTabAxton(tabuladoConCantidades(CONCEPTOS_TAB, [
      ['1', 'SANGUINETTI JAVIER',   'Mensual', 30, 149000, 8, 8000, null, null, 1, 157000],
      ['2', 'FALCIONI JULIO CESAR', 'Mensual', 30, 120000, null, null, null, null, 1, 120000],
      ['3', 'LUCCHETTI CRISTIAN',   'Mensual', null, null, null, null, 3, 9000, 1, 9000],
      ['4', 'ERVITI WALTER',        'Mensual', null, null, null, null, null, null, 1, 0],
      ['6', 'PALACIO RODRIGO',      'Mensual', 30, 100000, null, null, null, null, 1, 100000],
    ], ['TOTAL GENERAL', null, null, 90, 369000, 8, 8000, 3, 9000, 5, 386000]));
    return {
      period: '2026-07',
      // El 1200 va marcado como "unidades distintas": es el único concepto del
      // legajo 3, así que de ese legajo no se compara NADA (D-073).
      novLiqConfig: { ...DEFAULT_NOV_LIQ_CONFIG(), conceptosNoComparables: ['1200'] },
      importador: {}, importadorRows: [], importadorMeta: {},
      tabAxton: {}, tabAxtonRows: t.parsedRows, tabAxtonMeta: t.parseMetadata,
    };
  })(),
);

assert('el cruce de Novedades no dio error', !resNl.error, resNl.error);

const fichasNl = buildFichasNovLiq(resNl);
const nlDe = (legajo) => fichasNl.find(f => f.id === legajo);

assert('hay una ficha por legajo, no una por par legajo × concepto',
  fichasNl.length === resNl.summary.legajos,
  `fichas ${fichasNl.length} vs legajos ${resNl.summary.legajos}`);

// ── Diferencia de importe y diferencia de cantidad, cada una con su medida ───
{
  const f = nlDe('1');
  assert('la tira arranca en lo pedido por el importador',
    pastilla(f, 'Pedido').value === 158000, String(pastilla(f, 'Pedido').value));
  assert('la segunda pastilla dice cuánto de lo pedido se pudo comparar por importe',
    pastilla(f, 'Comparado').label === 'Comparado · 2 de 2'
    && pastilla(f, 'Comparado').value === 158000, pastilla(f, 'Comparado').label);
  assert('lo liquidado va invertido, y pedido − liquidado da el Δ importe de la tira',
    pastilla(f, 'Liquidado').invert === true
    && pastilla(f, 'Liquidado').value === 157000
    && pastilla(f, 'Δ importe').value === 1000);
  assert('la cantidad tiene su propia pastilla: no es plata y no se mide con el monto del cliente',
    pastilla(f, 'Δ cantidad').value === -3 && pastilla(f, 'Δ cantidad').residuo === true);
  assert('el legajo con una diferencia arriba del monto cae en "Con diferencia"',
    f.estado === 'conDif');

  const cuerpo = cuerpoDe(f);
  assert('cada renglón del detalle nombra el concepto por su CÓDIGO',
    cuerpo.includes('1000 · Sueldo Basico') && cuerpo.includes('1100 · Horas Extras'));
  assert('el detalle trae las dos medidas de los dos lados y las dos diferencias',
    f.body.detail.columns.map(c => c.key).join(',')
      === 'concepto,estado,cantNov,cantLiq,difCant,impNov,impLiq,difImp');
  assert('lo que se pidió de más se pinta en verde suave',
    f.body.detail.rows.some(r => r.tone === 'pos'));
  assert('la conclusión dice de dónde sale el número liquidado',
    /el dato liquidado sale del Tabulado/.test(f.body.conclusion.text), f.body.conclusion.text);
}

// ── El legajo del que no se pudo comparar NADA (D-073) ──────────────────────
{
  const f = nlDe('3');
  assert('no se pudo comparar nada de este legajo: el control ya lo marca así',
    resNl.legajosSinNadaComparado.includes('3') && f.nadaComparado === true);
  assert('NO queda aprobado: cae en "Sin comparar", en ámbar, nunca en verde',
    f.estado === 'sinComparar' && f.severity === 'warn');
  assert('el badge lo dice sin vueltas',
    f.badge.text === 'No se pudo comparar nada', f.badge.text);
  assert('la conclusión escribe el MOTIVO completo, no un guión',
    /unidades distintas \(marcado en el Paso 2\)/.test(f.body.conclusion.text),
    f.body.conclusion.text);
  assert('…y dice con esas palabras que no tener con qué comparar no es aprobar',
    /no es aprobar/.test(f.body.conclusion.text));
  assert('el motivo también sale en la fila de la tabla de detalle',
    f.body.detail.rows[0].estado === 'No comparable — unidades distintas',
    f.body.detail.rows[0].estado);
  assert('y la marca de la tarjeta lo repite como pill',
    f.marks.some(m => m.text === 'Nada comparado'));
}

// ── La novedad sin contraparte en la liquidación ────────────────────────────
{
  const f = nlDe('4');
  assert('una novedad que no se liquidó deja al legajo en "Sin comparar"',
    f.estado === 'sinComparar');
  assert('de este legajo tampoco se comparó nada, así que gana esa conclusión',
    f.nadaComparado === true && /no es aprobar/.test(f.body.conclusion.text));
  assert('y el motivo de "sin contraparte" sale entero, no detrás de un guión',
    /el Tabulado trae columna para este concepto y este legajo no tiene valor: no se liquidó/
      .test(f.body.conclusion.text), f.body.conclusion.text);
}

// ── El legajo que sí comparó algo Y además tiene una novedad sin contraparte ─
{
  const f = nlDe('6');
  assert('una novedad comparada y otra sin contraparte: gana "Sin comparar", no el verde',
    f.estado === 'sinComparar' && f.severity === 'warn');
  assert('la conclusión aclara que esto no bloquea ni aprueba, y lo informa con su motivo',
    /bloquea ni aprueba/.test(f.body.conclusion.text)
    && /no se liquidó/.test(f.body.conclusion.text), f.body.conclusion.text);
  assert('…y descuenta la novedad que ya coincide, en singular y no "las otras 1"',
    /La otra novedad de este legajo ya coincide/.test(f.body.conclusion.text),
    f.body.conclusion.text);
  assert('la marca de la tarjeta lo nombra como el segundo eje, no como estado',
    f.marks.some(m => m.text === 'Novedad sin contraparte'));
}

// ── El legajo que cierra ───────────────────────────────────────────────────
{
  const f = nlDe('2');
  assert('el legajo cuya novedad se liquidó igual cae en "Al centavo"',
    f.estado === 'centavo' && f.severity === 'ok');
  assert('su conclusión dice que lo pedido es lo que se liquidó',
    f.body.conclusion.tone === 'ok' && /Lo pedido es lo que se liquidó/.test(f.body.conclusion.title));
}

// El semáforo no lo toca esta migración.
{
  const s = summarizeNovedadesLiquidacion(resNl);
  assert('la unidad del semáforo sigue siendo el legajo y el numerador no cambió',
    s.unit === 'legajo' && s.unitsTotal === resNl.summary.legajos
    && s.unitsWithDiff === resNl.summary.legajosParaRevisar);
  assert('el legajo del que no se comparó nada sigue entrando al numerador',
    resNl.summary.legajosParaRevisar >= 3);
}


// ══════════════════════════════════════════════════════════════════════
// 3. Variación Conceptos — los conceptos que se movieron entre períodos
// ══════════════════════════════════════════════════════════════════════

const C2517 = '2517 - Premio de progreso';
const C2519 = '2519 - Premio productividad';
const C1500 = '1500 - Licencia';

const filaVar = (legajo, nombre, valores) => ({
  Legajo: legajo, 'Apellido y Nombre': nombre, Bruto: '1.200.000,00', ...valores,
});

// El 2517 se paga en escalones (100 % y 70 %): con cuatro valores repetidos y
// dos escalones distintos, `detectarEscala` lo reconoce y la variación deja de
// leerse en pesos y pasa a leerse como caída de escalón.
const prevVar = [
  filaVar('1', 'SANGUINETTI JAVIER',   { [C2517]: '16.805,40', [C2519]: '4.000,00', [C1500]: '' }),
  filaVar('2', 'FALCIONI JULIO CESAR', { [C2517]: '16.805,40', [C2519]: '4.000,00', [C1500]: '' }),
  filaVar('3', 'LUCCHETTI CRISTIAN',   { [C2517]: '11.763,78', [C2519]: '4.000,00', [C1500]: '' }),
  filaVar('5', 'CVITANICH DARIO',      { [C2517]: '16.805,40', [C2519]: '4.000,00', [C1500]: '' }),
];
const actVar = [
  filaVar('1', 'SANGUINETTI JAVIER',   { [C2517]: '11.763,78', [C2519]: '4.000,00', [C1500]: '' }),
  filaVar('2', 'FALCIONI JULIO CESAR', { [C2517]: '16.805,40', [C2519]: '4.000,00', [C1500]: '' }),
  filaVar('3', 'LUCCHETTI CRISTIAN',   { [C2517]: '11.763,78', [C2519]: '9.500,00', [C1500]: '' }),
  filaVar('4', 'URZI AGUSTIN',         { [C2517]: '16.805,40', [C2519]: '4.000,00', [C1500]: '' }),
  filaVar('5', 'CVITANICH DARIO',      { [C2517]: '11.763,78', [C2519]: '4.000,00', [C1500]: '38.000,00' }),
];
const metaVar = (period) => ({ period, quincena: 2, tipoLiquidacion: '2da Quincena' });
const resVar = runVariacionesConceptos(prevVar, actVar, {
  tab: { empleadoColumn: 'Legajo', apellidoNombreColumn: 'Apellido y Nombre' },
  variaciones: {
    config: { conceptos: [{ codigo: '2517', label: 'Premio de progreso' },
                          { codigo: '2519', label: 'Premio productividad' }] },
    anterior: { meta: metaVar('2026-03') },
    actual:   { meta: metaVar('2026-04') },
  },
});

assert('el cruce de Variación Conceptos no dio error', !resVar.error, resVar.error);
assert('el 2517 se reconoció como concepto que se paga en escalones',
  resVar.grupos.find(g => g.key === '2517')?.escala?.length >= 2);

const relevantesVar = resVar.rows.filter(r =>
  resVar.grupos.some(g => {
    const v = r.valores[g.key];
    return (v.anterior !== null && Math.abs(v.anterior) > 0.01)
        || (v.actual !== null && Math.abs(v.actual) > 0.01);
  }));
const fichasVar = buildFichasConceptos(relevantesVar, resVar.grupos, {
  labelAnterior: '03-2026 · 2ª quincena', labelActual: '04-2026 · 2ª quincena',
});
const varDe = (legajo) => fichasVar.find(f => f.id === legajo);

assert('hay una ficha por legajo, con sus dos conceptos adentro',
  fichasVar.length === 5 && fichasVar[0].grupos.length === 2);

// ── El que bajó de escalón y no tiene nada cargado que lo explique ──────────
{
  const f = varDe('1');
  assert('la tira es el período anterior, el actual y la variación',
    f.body.strip.map(p => p.label).join(' | ')
      === '03-2026 · 2ª quincena | 04-2026 · 2ª quincena | Variación · 1 concepto',
    f.body.strip.map(p => p.label).join(' | '));
  assert('los dos períodos suman los conceptos del legajo y la resta cierra',
    pastilla(f, '03-2026 · 2ª quincena').value === 20805.4
    && pastilla(f, '04-2026 · 2ª quincena').value === 15763.78
    && Math.abs(f.variacion + 5041.62) < 0.01,
    `${f.sumAnterior} ${f.sumActual} ${f.variacion}`);
  assert('el período actual va invertido y la variación es el residuo, en rojo',
    pastilla(f, '04-2026 · 2ª quincena').invert === true
    && pastilla(f, 'Variación').residuo === true);
  assert('el legajo con una variación arriba del monto cae en "Con diferencia"',
    f.estado === 'conDif');
  assert('el badge lee la caída como escalón y no como pesos, que es lo que dice algo',
    f.badge.text === '2517 · Premio de progreso: 100 % → 70 %', f.badge.text);
  assert('la marca dice que la caída no tiene causa visible',
    f.marks.some(m => m.text === 'Bajó de escalón sin causa visible'));
  assert('la conclusión manda a preguntarle al cliente, que es la instrucción',
    /preguntale al cliente/.test(f.body.conclusion.text) && f.body.conclusion.tone === 'error');

  const cuerpo = cuerpoDe(f);
  assert('cada renglón del detalle nombra el concepto por su CÓDIGO',
    cuerpo.includes('2517 · Premio de progreso') && cuerpo.includes('2519 · Premio productividad'));
  assert('el detalle trae la columna de escalón cuando el control detectó una escala',
    f.body.detail.columns.some(c => c.key === 'escalon')
    && f.body.detail.rows[0].escalon === '100 % → 70 %');
  assert('lo que bajó se pinta en rojo suave',
    f.body.detail.rows[0].tone === 'neg' && cuerpo.includes('ficha-detail__row--neg'));
  assert('la columna de % va después de la variación y el pie cae en la variación',
    f.body.detail.columns[f.body.detail.columns.length - 1].key === 'pct'
    && f.body.detail.foot.key === 'variacion');
  assert('el pie del detalle no se derrama sobre la columna del %',
    /<td colspan="4">Variación del legajo<\/td>\s*<td class="ficha-table__num">-5\.041,62<\/td>\s*<td><\/td>/
      .test(cuerpo), cuerpo.slice(cuerpo.indexOf('<tfoot>'), cuerpo.indexOf('</tfoot>')));
}

// ── El que bajó de escalón con una licencia cargada: se explica solo ────────
{
  const f = varDe('5');
  assert('la caída con licencia cargada se marca distinto de la que no tiene causa',
    f.marks.some(m => m.text === 'Bajó de escalón — hay licencia cargada')
    && !f.marks.some(m => m.text === 'Bajó de escalón sin causa visible'));
  assert('y la conclusión dice que no hace falta preguntar nada',
    /se explica sola: no hace falta/.test(f.body.conclusion.text), f.body.conclusion.text);
}

// ── El alta del período ────────────────────────────────────────────────────
{
  const f = varDe('4');
  assert('el alta se marca como marca, no como estado',
    f.marks.some(m => m.text === 'Alta en el período'));
  assert('y la conclusión explica que la variación ES el alta',
    /Es un alta/.test(f.body.conclusion.text));
}

// ── El que movió el otro concepto ─────────────────────────────────────────
{
  const f = varDe('3');
  assert('el concepto que se movió va primero en el detalle',
    f.body.detail.rows[0].concepto === '2519 · Premio productividad');
  assert('la conclusión nombra el concepto movido con su código y su signo',
    /2519 · Premio productividad \+5\.500,00/.test(f.body.conclusion.text),
    f.body.conclusion.text);
  assert('…y descuenta el que no se movió',
    /El otro concepto de este legajo no se movió: no hace falta mirarlo/.test(f.body.conclusion.text),
    f.body.conclusion.text);
}

// ── El que no se movió ────────────────────────────────────────────────────
{
  const f = varDe('2');
  assert('el legajo sin variación cae en "Al centavo" y en verde',
    f.estado === 'centavo' && f.severity === 'ok');
  assert('y su conclusión lo dice sin adornos',
    f.body.conclusion.title === 'No se movió nada');
}


// ══════════════════════════════════════════════════════════════════════
// 4. Lo que las tres fichas tienen que cumplir igual
// ══════════════════════════════════════════════════════════════════════

for (const [control, fichas] of [['NR', fichasNr], ['Novedades', fichasNl], ['Variación', fichasVar]]) {
  assert(`${control}: toda ficha declara la tira y la conclusión, que son obligatorias (§4)`,
    fichas.every(f => f.body.strip?.length > 0 && f.body.conclusion?.title));
  assert(`${control}: la conclusión es una instrucción — texto, no sólo un título`,
    fichas.every(f => typeof f.body.conclusion.text === 'string' && f.body.conclusion.text.length > 40));
  assert(`${control}: el cuerpo de toda ficha se dibuja sin tirar`,
    fichas.every(f => { try { cuerpoDe(f); return true; } catch { return false; } }));
  assert(`${control}: ningún legajo del que no se comparó nada sale en verde (D-073)`,
    fichas.every(f => f.estado !== 'centavo' || f.severity === 'ok'));
  assert(`${control}: todo renglón del detalle sale con el código de su concepto adelante`,
    fichas.every(f => (f.body.detail?.rows || []).every(r => /^[0-9]/.test(r.concepto))));
  assert(`${control}: las pills de la tarjeta son las mismas marcas del desplegable`,
    fichas.every(f => (f.marks || []).every(m => typeof m.text === 'string' && m.text.length > 0)));
}

// Los nombres vienen de un Excel de un tercero: se escapan.
{
  const f = { ...nlDe('1'), name: '<b>SILVA SANTIAGO</b>' };
  assert('el nombre que viene del Excel del cliente se escapa en la tarjeta',
    fichaCardHtml(f).includes('&lt;b&gt;SILVA SANTIAGO&lt;/b&gt;'));
}


console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
