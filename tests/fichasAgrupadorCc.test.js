// fichasAgrupadorCc.test.js — Las fichas de los dos controles cuya unidad NO es
// "un legajo con sus conceptos": el Cruce por Agrupadores (una ficha por LEGAJO,
// con sus agrupadores adentro) y Rendimiento vs Tabulado (una ficha por CENTRO
// DE COSTO). Tanda 5 de specs/vista-estandar-resultados.md, §4 y §8.
//
// Lo que se prueba acá es lo que NO se ve mirando la pantalla:
//
//   1. Que la ficha se cuente en la unidad que declara el control. Agrupadores ya
//      pagó una vez el error de contar en la unidad equivocada: el cruce evalúa
//      el mismo legajo una vez por agrupador, así que contar filas da legajo ×
//      agrupador —1000 sobre 100 empleados— y con el denominador inflado el
//      umbral del semáforo no se cruza nunca: miente en verde.
//   2. Que la migración no haya movido ningún número: la suma de la diferencia
//      de todas las fichas tiene que dar exactamente el `diffTotalAmount` que ya
//      publicaba el semáforo, y la cantidad de fichas el `unitsTotal`.
//   3. Que `null` no sea `0`: el lado que no tiene al caso sale en `—`.
//   4. Que la ficha esté completa: la tira de conciliación y la conclusión son
//      obligatorias (`fichaBodyHtml` tira si falta alguna), así que dibujar el
//      cuerpo de todas las fichas es el chequeo.
//
// Datos 100 % inventados, jugadores de Banfield (CLAUDE.md).
//
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/fichasAgrupadorCc.test.js

// Los módulos de control importan (transitivamente) UI que engancha un listener
// a nivel de módulo — necesitan un `document` mínimo fuera del navegador.
globalThis.document = { addEventListener: () => {} };

const { runAgrupadores, summarizeAgrupadores, buildFichasAgrupadores, estadoDeLegajo } =
  await import('./js/controls/agrupadores.js');
const { runRendVsTabu, summarizeRendVsTabu, buildFichasRendVsTabu } =
  await import('./js/controls/rendVsTabu.js');
const { fichaCardHtml, fichaBodyHtml } = await import('./js/ui/fichaList.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle ? `\n    ${detalle}` : ''); fail++; }
}

const cerca = (a, b) => Math.abs(a - b) < 0.005;

// ══════════════════════════════════════════════════════════════════════
// 1. Cruce por Agrupadores — una ficha por LEGAJO
// ══════════════════════════════════════════════════════════════════════
//
// Seis legajos y dos agrupadores: doce filas de cruce, seis fichas.
//   1 — coincide exacto en los dos agrupadores        → Al centavo
//   2 — $ 100 de diferencia en Sueldo                 → Con diferencia
//   3 — sólo está en la Nómina                        → Sin comparar
//   4 — 0,004 de diferencia (el redondeo de Excel)    → Al centavo
//   5 — $ 0,60 de diferencia, abajo del umbral de $ 1 → Dentro del margen
//   6 — sólo está en el Resumen                       → Sin comparar

const nominaRows = [
  { legajo: '1', apellido: 'SANGUINETTI', nombre: 'JAVIER',      '100': 1000,     '200': 500 },
  { legajo: '2', apellido: 'FALCIONI',    nombre: 'JULIO CESAR', '100': 2000,     '200': 300 },
  { legajo: '3', apellido: 'DATOLO',      nombre: 'JESUS',       '100': 1500,     '200': 200 },
  { legajo: '4', apellido: 'ERVITI',      nombre: 'WALTER',      '100': 1800.004, '200': 250 },
  { legajo: '5', apellido: 'SILVA',       nombre: 'SANTIAGO',    '100': 1700.60,  '200': 400 },
];
const resumenLargoRows = [
  { legajo: '1', '100': 1000, '200': 500 },
  { legajo: '2', '100': 1900, '200': 300 },
  { legajo: '4', '100': 1800, '200': 250 },
  { legajo: '5', '100': 1700, '200': 400 },
  { legajo: '6', '100': 900,  '200': 150 },
];
const GROUPERS = [{ id: 1, name: 'Sueldo' }, { id: 2, name: 'Cargas sociales' }];

const agrup = runAgrupadores(nominaRows, [], {
  resumenLargoRows,
  grouperDefs: GROUPERS,
  grouperConceptsMap: { 1: ['100'], 2: ['200'] },
  agrupadoresConfig: { thresholds: { absoluteAmount: 1, percentage: 0.1, flagMissing: true } },
});
const agrupSum = summarizeAgrupadores(agrup);
const fichasAgrup = buildFichasAgrupadores(agrup);
const porLegajo = Object.fromEntries(fichasAgrup.map(f => [f.id, f]));

assert('el cruce evaluó doce filas (seis legajos × dos agrupadores)',
  Object.values(agrup.resultsPorGrupo).reduce((n, filas) => n + filas.length, 0) === 12);

assert('…y hay SEIS fichas, no doce: la ficha se cuenta como un legajo',
  fichasAgrup.length === 6, `salieron ${fichasAgrup.length}`);

assert('la cantidad de fichas es el mismo `unitsTotal` que ya contaba el semáforo',
  fichasAgrup.length === agrupSum.unitsTotal);

assert('la suma de la diferencia de las fichas da el `diffTotalAmount` del semáforo — no se movió ningún número',
  cerca(fichasAgrup.reduce((acc, f) => acc + f.difTotal, 0), agrupSum.diffTotalAmount),
  `fichas ${fichasAgrup.reduce((acc, f) => acc + f.difTotal, 0)} vs semáforo ${agrupSum.diffTotalAmount}`);

assert('los legajos que le aportan monto al semáforo son los mismos que `unitsWithDiff`',
  fichasAgrup.filter(f => f.difTotal > 0).length === agrupSum.unitsWithDiff);

assert('el legajo que coincide exacto cae en "Al centavo"', porLegajo['1'].estado === 'centavo');
assert('el legajo con $ 100 de diferencia cae en "Con diferencia"', porLegajo['2'].estado === 'conDif');
assert('el legajo con 0,004 de diferencia cae en "Al centavo" — es el redondeo de Excel',
  porLegajo['4'].estado === 'centavo');
assert('el legajo con $ 0,60, abajo del umbral de $ 1, cae en "Dentro del margen"',
  porLegajo['5'].estado === 'margen');

assert('el legajo que está en un solo archivo cae en "Sin comparar", nunca en un grado de cierre (D-073)',
  porLegajo['3'].estado === 'sinComparar' && porLegajo['6'].estado === 'sinComparar');

assert('…y su ficha lo dice en el badge, no lo esconde',
  porLegajo['3'].badge.text === 'No está en el archivo Resumen'
  && porLegajo['6'].badge.text === 'No está en la Nómina Maestra');

{
  const filas = porLegajo['3'].body.detail.rows;
  assert('el lado que no tiene al legajo sale en `—` y no en 0,00 (`null` no es `0`)',
    filas.every(f => f.res === null && f.dif === null) && filas.every(f => f.nom !== null));
  assert('…y el `—` llega hasta el HTML dibujado',
    fichaBodyHtml(porLegajo['3'].body, { id: '3' }).includes('—'));
}

assert('el detalle del legajo que está en un solo archivo no pinta ninguna fila en rojo: no hay nada que comparar',
  porLegajo['3'].body.detail.rows.every(f => f.tone === undefined));

assert('el detalle es un renglón por agrupador, con Nómina, Resumen y la diferencia',
  porLegajo['2'].body.detail.rows.length === GROUPERS.length
  && porLegajo['2'].body.detail.columns.map(c => c.label).join('|') === 'Agrupador|Nómina|Resumen|Diferencia');

assert('las marcas de la ficha son los agrupadores en los que no cierra — el segundo eje (§3)',
  porLegajo['2'].marks.map(m => m.text).join(',') === 'Sueldo'
  && porLegajo['1'].marks.length === 0);

assert('la tira arranca en la Nómina Maestra y termina en la diferencia total',
  porLegajo['2'].body.strip[0].label === 'Nómina Maestra'
  && porLegajo['2'].body.strip[porLegajo['2'].body.strip.length - 1].label === 'Diferencia total');

assert('la conclusión del legajo con diferencia nombra el agrupador que hay que mirar',
  porLegajo['2'].body.conclusion.text.includes('Sueldo'));

assert('la del que cierra dentro del margen nombra el umbral configurado, no un número inventado',
  porLegajo['5'].body.conclusion.title.includes('0,60')
  && porLegajo['5'].body.conclusion.text.includes('1,00'));

assert('`estadoDeLegajo` es la regla del propio control: el umbral que puso el analista, no el del cliente',
  estadoDeLegajo({ soloEnNomina: false, soloEnResumen: false, porGrupo: { 1: { tieneDiff: true, diffAbs: 0.5 } } },
    [{ id: 1 }]) === 'conDif');

// ══════════════════════════════════════════════════════════════════════
// 2. Rendimiento vs Tabulado — una ficha por CENTRO DE COSTO
// ══════════════════════════════════════════════════════════════════════

const MAPPING = {
  rend: {
    ccCodeColumn: 'CC', ccNameColumn: 'Nombre CC', precioColumn: 'Precio',
    estimuloColumn: 'Estimulo', cargasColumn: 'Cargas', provMesColumn: 'ProvMes', provCcssColumn: 'ProvCcss',
  },
  tab: { idCCColumn: 'ID_CC', ccColumn: 'N_CC' },
  // '9999' está configurado a propósito y NO existe como columna del Tabulado:
  // un concepto que no se puede resolver no se completa con 0,00 en silencio.
  conceptGrouping: {
    precio:   [{ code: '1003', sign: 1 }, { code: '1017', sign: 1 }, { code: '9999', sign: 1 }],
    estimulo: [{ code: '1006', sign: 1 }],
    cargas:   [{ code: '6050', sign: 1 }, { code: '6110', sign: -1 }],
    provMes:  [],
    provCcss: [],
  },
  period: '2026-05',
};
const filaRend = (over = {}) => ({
  CC: '', 'Nombre CC': '', Precio: 0, Estimulo: 0, Cargas: 0, ProvMes: 0, ProvCcss: 0, ...over,
});

const rendRows = [
  // Administración: el Tabulado suma 1600 en PRECIO y el reporte informa 1500.
  filaRend({ CC: '0011', 'Nombre CC': 'Administracion', Precio: 1500, Estimulo: 200, Cargas: 900 }),
  // Producción: cierra al centavo.
  filaRend({ CC: '0022', 'Nombre CC': 'Produccion', Precio: 1000 }),
  // Depósito: no está en el Tabulado.
  filaRend({ CC: '0099', 'Nombre CC': 'Deposito', Precio: 500 }),
];
const tabRows = [
  { ID_CC: '11', N_CC: 'Administracion',
    '1003-SUELDO': 1000, '1017-PRESENTISMO': 600, '1006-ESTIMULO': 200,
    '6050-CONTRIBUCIONES': 1000, '6110-RETENCION': 100 },
  { ID_CC: '22', N_CC: 'Produccion',
    '1003-SUELDO': 1000, '1017-PRESENTISMO': 0, '1006-ESTIMULO': 0,
    '6050-CONTRIBUCIONES': 0, '6110-RETENCION': 0 },
];

const rvt = runRendVsTabu(rendRows, tabRows, MAPPING);
const rvtSum = summarizeRendVsTabu(rvt);
const fichasCc = buildFichasRendVsTabu(rvt);
const porCc = Object.fromEntries(fichasCc.map(f => [f.id, f]));

assert('hay una ficha por centro de costo, la unidad que declara el control (`unit: cc`)',
  rvtSum.unit === 'cc' && fichasCc.length === rvtSum.unitsTotal && fichasCc.length === 3);

assert('el NOMBRE del centro de costo va en la línea de identidad y el código en el avatar',
  porCc['0011'].name === 'Administracion' && porCc['0011'].unit === '0011');

assert('el importe grande de la ficha es la diferencia de COSTO TOTAL que ya calculaba el control',
  porCc['0011'].amount === rvt.rows.find(r => r.ccCode === '0011').dTotal);

assert('el centro de costo sin datos en el Tabulado cae en "Sin comparar" y su importe es `—`',
  porCc['0099'].estado === 'sinComparar' && porCc['0099'].amount === null);

assert('el que cierra al centavo no arrastra el estado del que no cierra',
  porCc['0022'].estado === 'centavo' && porCc['0011'].estado === 'conDif');

{
  // La descomposición tiene que dar el mismo número que la categoría: es la
  // MISMA suma, guardada antes de acumularse.
  const conceptos = porCc['0011'].body.tables[0].rows.filter(r => Number.isFinite(r.value));
  const suma = conceptos.reduce((acc, r) => acc + r.value, 0);
  assert('la tabla de la izquierda abre el Tabulado concepto por concepto y suma su COSTO TOTAL',
    cerca(suma, rvt.rows.find(r => r.ccCode === '0011').tTotal),
    `conceptos ${suma} vs tTotal ${rvt.rows.find(r => r.ccCode === '0011').tTotal}`);

  assert('…y cada renglón lleva el código del concepto',
    conceptos.every(r => r.code) && conceptos.some(r => r.code === '1003'));

  assert('el concepto que resta lo dice en el renglón, no sólo en el signo del importe',
    conceptos.find(r => r.code === '6110').label.includes('resta')
    && conceptos.find(r => r.code === '6110').value === -100);

  const noHallado = porCc['0011'].body.tables[0].rows.find(r => r.code === '9999');
  assert('un concepto configurado cuya columna no está en el Tabulado sale en `—`, no en 0,00',
    noHallado && noHallado.value === null && noHallado.label.includes('no hallado'));
}

assert('la tabla del Tabulado cierra en oscuro y la del Rendimiento en el residuo, en rojo (§4)',
  porCc['0011'].body.tables[0].foot.tone === 'ink'
  && porCc['0011'].body.tables[1].foot.value === porCc['0011'].amount
  && porCc['0011'].body.tables[1].foot.tone === 'error');

assert('el detalle es un renglón por concepto con Rendimiento, Tabulado y la diferencia',
  porCc['0011'].body.detail.columns.map(c => c.label).join('|') === 'Concepto|Rendimiento|Tabulado|Diferencia'
  && porCc['0011'].body.detail.rows.length === 5);

assert('…y marca en rojo sólo la categoría que no cierra',
  porCc['0011'].body.detail.rows.filter(r => r.tone === 'neg').map(r => r.categoria).join(',') === 'PRECIO');

assert('las marcas son las categorías en las que no cierra — el segundo eje (§3)',
  porCc['0011'].marks.map(m => m.text).join(',') === 'PRECIO'
  && porCc['0022'].marks.length === 0);

assert('la conclusión dice qué mirar y nombra la categoría, no resume',
  porCc['0011'].body.conclusion.text.includes('PRECIO')
  && porCc['0099'].body.conclusion.title.includes('no está en el Tabulado'));

// ══════════════════════════════════════════════════════════════════════
// 3. Las dos, contra el molde de la pieza compartida
// ══════════════════════════════════════════════════════════════════════
//
// `fichaBodyHtml` tira si falta la tira de conciliación o la conclusión, así que
// dibujar el cuerpo de TODAS las fichas prueba que ninguna quedó a medias.

for (const [control, fichas] of [['Agrupadores', fichasAgrup], ['Rendimiento vs Tabulado', fichasCc]]) {
  let error = null;
  try {
    for (const f of fichas) { fichaCardHtml(f); fichaBodyHtml(f.body, { id: f.id }); }
  } catch (e) { error = e.message; }
  assert(`${control}: las ${fichas.length} fichas se dibujan enteras — tira y conclusión incluidas`,
    error === null, error);
}

{
  // Los nombres vienen de un Excel de un tercero: `esc()` sobre todo lo que
  // entra a un template literal (CLAUDE.md).
  const conHtml = runAgrupadores(
    [{ legajo: '7', apellido: '<b>LUCCHETTI</b>', nombre: 'CRISTIAN', '100': 10 }],
    [],
    {
      resumenLargoRows: [{ legajo: '7', '100': 10 }],
      grouperDefs: [{ id: 1, name: '<i>Sueldo</i>' }],
      grouperConceptsMap: { 1: ['100'] },
      agrupadoresConfig: { thresholds: { absoluteAmount: 1, percentage: 0.1, flagMissing: true } },
    });
  const html = fichaCardHtml(buildFichasAgrupadores(conHtml)[0]);
  assert('el nombre que viene del Excel del cliente se escapa en la tarjeta',
    html.includes('&lt;b&gt;LUCCHETTI&lt;/b&gt;') && !html.includes('<b>LUCCHETTI'));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
