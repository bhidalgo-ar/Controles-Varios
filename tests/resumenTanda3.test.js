// resumenTanda3.test.js — El sub-objeto `summary.resumen` de la tanda 3 de
// specs/vista-estandar-resumen.md: agrupadores, novedades_liquidacion,
// variaciones_sueldos, variaciones_conceptos, pop_variaciones.
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/resumenTanda3.test.js
//
// Datos 100% inventados: legajos cortos y jugadores de Banfield (CLAUDE.md).
// Esta tanda no cambia ningún cálculo ni conteo existente — eso ya lo prueban
// agrupadoresControl.test.js, novedadesLiquidacionControl.test.js,
// variacionesControl.test.js y popVariacionesControl.test.js, que siguen en
// verde. Lo que se prueba acá es el `resumen` nuevo: el puente cierra, el
// signo dice lo que pasó y no lo contrario, y lo que no se puede atribuir cae
// en "Sin identificar" en vez de inventarse una causa.

globalThis.document = { addEventListener: () => {} };
globalThis.window   = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle ? `\n    ${JSON.stringify(detalle)}` : ''); fail++; }
}
const casi = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// ══════════════════════════════════════════════════════════════════════════
// Cruce por Agrupadores — el puente separa la NETA de la TOTAL (D-087)
// ══════════════════════════════════════════════════════════════════════════
{
  const { runAgrupadores, summarizeAgrupadores } = await import('./js/controls/agrupadores.js');

  const nomina = [
    { legajo: '1', apellido: 'SANGUINETTI', nombre: 'JAVIER', '100': 500000, '200': 100000 },
    { legajo: '2', apellido: 'ALBELLA',     nombre: 'GUSTAVO', '100': 400000, '200': 50000 },
    { legajo: '3', apellido: 'ERVITI',      nombre: 'WALTER', '100': 300000, '200': 30000 },
  ];
  // Legajo 1: agrupador 200 de menos en la Nómina (compensa contra el de más
  // del legajo 2 en otro agrupador — la NETA del run compensa, la TOTAL no).
  const resumen = [
    { legajo: '1', apellido: 'SANGUINETTI', nombre: 'JAVIER', '100': 500000, '200': 130000 },
    { legajo: '2', apellido: 'ALBELLA',     nombre: 'GUSTAVO', '100': 350000, '200': 50000 },
    { legajo: '3', apellido: 'ERVITI',      nombre: 'WALTER', '100': 300000, '200': 30000 },
  ];
  const grouperDefs = [{ id: 1, name: 'Remunerativo' }, { id: 2, name: 'No remunerativo' }];
  const grouperConceptsMap = { 1: ['100'], 2: ['200'] };
  const mapping = {
    resumenTabuladoRows: resumen, grouperDefs, grouperConceptsMap,
    agrupadoresConfig: { thresholds: { absoluteAmount: 1, percentage: 0.1, flagMissing: true } },
  };

  const results = runAgrupadores(nomina, null, mapping);
  assert('agrupadores: run() no da error', !results.error, results.error);
  const sum = summarizeAgrupadores(results);
  const r = sum.resumen;

  const b = r.bridge.steps;
  assert('agrupadores: el puente tiene Nómina, Resumen, neta y total',
    b.length === 4 && b[0].label === 'Nómina Maestra' && b[3].label === 'Diferencia total');
  assert('agrupadores: Nómina − Resumen = neta',
    casi(b[0].amount - b[1].amount, b[2].amount));
  assert('agrupadores: la diferencia TOTAL del puente es la misma que suma el semáforo',
    casi(b[3].amount, sum.diffTotalAmount));
  assert('agrupadores: la neta y la total NO son la misma (una compensa, la otra no)',
    Math.abs(b[2].amount) !== Math.abs(b[3].amount));

  assert('agrupadores: diffSigned queda omitido (PENDIENTE DE WILLY, §7.6)',
    r.diffSigned === null && r.notApplicable.includes('signed'));
  assert('agrupadores: byCause agrupa por AGRUPADOR, con importe real (no en 0)',
    r.byCause.length === 2 && r.byCause.every(c => c.amount > 0));
  assert('agrupadores: los conteos de byCause están en legajos, nunca en filas legajo × agrupador',
    r.byCause.reduce((s, c) => s + c.units, 0) <= sum.unitsWithDiff);
  assert('agrupadores: las claves de unidad son por legajo (2 legajos con diferencia)',
    r.unitKeys.length === sum.unitsWithDiff);
}

// ══════════════════════════════════════════════════════════════════════════
// Novedades vs Liquidación — Pedido → Diferencia comparada → Liquidado
// ══════════════════════════════════════════════════════════════════════════
{
  const { runNovedadesLiquidacion, summarizeNovedadesLiquidacion } = await import('./js/controls/novedadesLiquidacion.js');

  const novRows = [
    { legajo: '1', codigo: '1000', importe: 1000, cantidad: null, unidadDeclarada: null },
    { legajo: '2', codigo: '1000', importe: 500,  cantidad: null, unidadDeclarada: null },
    // Legajo 3 pide un concepto que no tiene columna en el Tabulado y no hay
    // totalizador: no se puede comparar nada — cuenta para revisar (D-073).
    { legajo: '3', codigo: '2000', importe: 200,  cantidad: null, unidadDeclarada: null },
  ];
  const tabRows = [
    { legajo: '1', imp_1000: 1200 },   // liquidó MÁS de lo pedido
    { legajo: '2', imp_1000: 500 },    // coincide
  ];
  const novMeta = {
    empleados: [
      { legajo: '1', apellidoNombre: 'FALCIONI JULIO CESAR' },
      { legajo: '2', apellidoNombre: 'SILVA SANTIAGO' },
      { legajo: '3', apellidoNombre: 'LUCCHETTI CRISTIAN' },
    ],
    columnas: [{ codigo: '1000', rotulo: 'Concepto 1000' }, { codigo: '2000', rotulo: 'Concepto 2000' }],
    columnasSinCodigo: [], noParseables: [], filasSinLegajo: [], avisos: [],
    unidadOrganizativa: 'UO Norte',
  };
  const tabMeta = { conceptos: [{ codigoBase: '1000', keyImp: 'imp_1000', nombre: 'Concepto 1000' }], cantidadesDisponibles: false, avisos: [] };
  const mapping = { importadorMeta: novMeta, tabAxtonMeta: tabMeta, tabAxtonRows: tabRows, novLiqConfig: {}, period: '2026-08' };

  const results = runNovedadesLiquidacion(novRows, null, mapping);
  assert('novedades_liquidacion: run() no da error', !results.error, results.error);
  const sum = summarizeNovedadesLiquidacion(results);
  const r = sum.resumen;

  assert('novedades_liquidacion: el legajo sin nada comparado cuenta para revisar, no aprobado (D-073)',
    sum.unitsWithDiff === 2);
  assert('novedades_liquidacion: ese legajo va a unidentifiedCause, no a un concepto inventado',
    r.unidentifiedCause !== null && r.unidentifiedCause.units === 1);
  assert('novedades_liquidacion: el que sí tiene diferencia de importe cae en byCause: concepto',
    r.byCause.length === 1 && r.byCause[0].key === '1000');
  assert('novedades_liquidacion: liquidó de MÁS de lo pedido → "under", con la etiqueta que dice eso',
    r.diffSigned.under && r.diffSigned.under.label === 'Liquidado de más' && casi(r.diffSigned.under.amount, 200));
  assert('novedades_liquidacion: el puente es de conteos, con las 4 bandas en la proporción',
    r.bridge.kind === 'counts' && r.bridge.proportion.parts.length === 4);
  assert('novedades_liquidacion: byGroup por UO, con la UO del importador',
    r.byGroup.uo[0].key === 'UO Norte');
}

// ══════════════════════════════════════════════════════════════════════════
// Variación Sueldos y Variación Conceptos — puente temporal, "subieron/bajaron"
// ══════════════════════════════════════════════════════════════════════════
{
  const { runVariacionesSueldos, summarizeVariacionesSueldos, runVariacionesConceptos, summarizeVariacionesConceptos } =
    await import('./js/controls/variaciones.js');

  const mapping = { variaciones: {}, legajoKeyMode: null };

  // Sueldos: combina Jornales (899999) + Mensuales (1000) en una sola columna,
  // pero byCause tiene que decir CUÁL de los dos se movió.
  const prevSueldos = [
    { LEGAJO: '1', NOMBRE: 'ERVITI WALTER',   '899999 - JORNALES': 100000, '1000 - MENSUAL': 0 },
    { LEGAJO: '2', NOMBRE: 'RODRIGUEZ JAMES', '899999 - JORNALES': 0,      '1000 - MENSUAL': 200000 },
  ];
  const actSueldos = [
    { LEGAJO: '1', NOMBRE: 'ERVITI WALTER',   '899999 - JORNALES': 120000, '1000 - MENSUAL': 0 },
    { LEGAJO: '2', NOMBRE: 'RODRIGUEZ JAMES', '899999 - JORNALES': 0,      '1000 - MENSUAL': 190000 },
  ];
  const rSueldos = runVariacionesSueldos(prevSueldos, actSueldos, mapping);
  assert('variaciones_sueldos: run() no da error', !rSueldos.error, rSueldos.error);
  const sSueldos = summarizeVariacionesSueldos(rSueldos);
  const resSueldos = sSueldos.resumen;

  const bs = resSueldos.bridge.steps;
  assert('variaciones_sueldos: el puente es Anterior → Variación → Actual',
    bs[0].label === 'Período anterior' && bs[1].label === 'Variación' && bs[2].label === 'Período actual');
  assert('variaciones_sueldos: el puente cierra (actual − anterior = variación)',
    casi(bs[2].amount - bs[0].amount, bs[1].amount));
  assert('variaciones_sueldos: subió → "Subieron"; bajó → "Bajaron"',
    resSueldos.diffSigned.over.label === 'Subieron' && resSueldos.diffSigned.under.label === 'Bajaron');
  assert('variaciones_sueldos: byCause distingue Jornales de Mensuales aunque valores venga sumado',
    resSueldos.byCause.some(c => c.label === 'Jornales') && resSueldos.byCause.some(c => c.label === 'Mensuales'));

  // Conceptos: 2517 y 2519 cada uno en su columna — un legajo con los dos
  // moviéndose netea, el otro sólo mueve uno.
  const prevConceptos = [
    { LEGAJO: '1', NOMBRE: 'ERVITI WALTER',   '2517 - PREMIO PROGRESO': 5000, '2519 - PREMIO PRODUCTIVIDAD': 3000 },
    { LEGAJO: '2', NOMBRE: 'RODRIGUEZ JAMES', '2517 - PREMIO PROGRESO': 4000, '2519 - PREMIO PRODUCTIVIDAD': 3000 },
  ];
  const actConceptos = [
    { LEGAJO: '1', NOMBRE: 'ERVITI WALTER',   '2517 - PREMIO PROGRESO': 5000, '2519 - PREMIO PRODUCTIVIDAD': 3500 },
    { LEGAJO: '2', NOMBRE: 'RODRIGUEZ JAMES', '2517 - PREMIO PROGRESO': 3000, '2519 - PREMIO PRODUCTIVIDAD': 3000 },
  ];
  const rConceptos = runVariacionesConceptos(prevConceptos, actConceptos, mapping);
  assert('variaciones_conceptos: run() no da error', !rConceptos.error, rConceptos.error);
  const sConceptos = summarizeVariacionesConceptos(rConceptos);
  const resConceptos = sConceptos.resumen;

  const bc = resConceptos.bridge.steps;
  assert('variaciones_conceptos: el puente también cierra',
    casi(bc[2].amount - bc[0].amount, bc[1].amount));
  assert('variaciones_conceptos: byCause: concepto — el que más movió, por legajo',
    resConceptos.byCause.some(c => c.key === '2519') && resConceptos.byCause.some(c => c.key === '2517'));
  assert('variaciones_conceptos: no se inventa el corte por empresa',
    resConceptos.byGroup === null && resConceptos.notApplicable.includes('group'));
}

// ══════════════════════════════════════════════════════════════════════════
// Variación entre quincenas (POP) — sin Axton no hay resumen; con Axton, el
// puente es de conteos y no se inventa un signo de plata (D-081)
// ══════════════════════════════════════════════════════════════════════════
{
  const { runPopVariaciones, summarizePopVariaciones } = await import('./js/controls/popVariaciones.js');

  const prevRows = [
    { legajo: '1', apellido_nombre: 'CVITANICH DARIO', cant_1010: 100, imp_1010: 100000, neto_imp: 300000 },
    { legajo: '2', apellido_nombre: 'DATOLO JESUS',     cant_1010: 100, imp_1010: 100000, neto_imp: 280000 },
  ];
  const actRows = [
    { legajo: '1', apellido_nombre: 'CVITANICH DARIO', cant_1010: 100, imp_1010: 110000, neto_imp: 305000 },
    { legajo: '2', apellido_nombre: 'DATOLO JESUS',     cant_1010: 100, imp_1010: 100000, neto_imp: 280000 },
  ];

  // Sin el reporte de Axton: "Generar Reporte" — no hay semáforo, no hay resumen.
  const sinAxton = runPopVariaciones(prevRows, null, { tab_actRows: actRows, popVariacionesConfig: { valorHoraCode: '1010' } });
  assert('pop_variaciones: run() sin Axton no da error', !sinAxton.error, sinAxton.error);
  const sumSinAxton = summarizePopVariaciones(sinAxton);
  assert('pop_variaciones: sin el reporte de Axton, resumen es null (nada que cruzar)',
    sumSinAxton.unit === null && sumSinAxton.resumen === null);

  // Con Axton: un legajo cierra, el otro no (CBU sin dato en el generado vs
  // 'N' en Axton — se informa como diferencia, no se tapa).
  const variacRows = [
    { legajo: '1', vh_anterior: 1000, vh_actual: 1100, mod: 'S', mod_cbu: 'N', alta: 'N', baja: 'N', neto: 305000, cbu: 'N' },
    { legajo: '2', vh_anterior: 1000, vh_actual: 1000, mod: 'N', mod_cbu: 'N', alta: 'N', baja: 'N', neto: 280000, cbu: 'N' },
  ];
  const conAxton = runPopVariaciones(prevRows, null, {
    tab_actRows: actRows, variacRows, popVariacionesConfig: { valorHoraCode: '1010' },
  });
  assert('pop_variaciones: run() con Axton no da error', !conAxton.error, conAxton.error);
  const sumConAxton = summarizePopVariaciones(conAxton);
  const r = sumConAxton.resumen;

  assert('pop_variaciones: el puente es de conteos (comparados/con diferencia/coinciden)',
    r.bridge.kind === 'counts' && r.bridge.steps.length === 3
    && r.bridge.steps[0].amount === sumConAxton.unitsTotal
    && r.bridge.steps[1].amount === sumConAxton.unitsWithDiff);
  assert('pop_variaciones: no se inventa un signo de plata — signed/buckets/group/cause/top quedan notApplicable',
    ['signed', 'buckets', 'group', 'cause', 'top'].every(b => r.notApplicable.includes(b)));
  assert('pop_variaciones: el valor hora no entra a ningún cálculo del resumen (D-081)',
    r.diffSigned === null && r.diffBuckets === null);
  assert('pop_variaciones: las claves de unidad SÍ viajan, para el cruce entre controles',
    Array.isArray(r.unitKeys) && r.unitKeys.length === sumConAxton.unitsWithDiff);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
