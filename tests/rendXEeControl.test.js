// rendXEeControl.test.js — Control: Rendimiento x EE con el Tabulado de la otra empresa
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/rendXEeControl.test.js
//
// El Reporte de Costo Total trae a la gente de las dos empresas del cliente
// juntas; el Tabulado de cada empresa viene aparte. Este test fija:
//   1. Con los dos Tabulados, cada uno se lee con SU columna de legajo y SUS
//      columnas de concepto (el segundo trae otro orden y otros nombres de
//      columna), y todo se suma por legajo con la MISMA clave del cliente que
//      usa el reporte ('007' y '7' son el mismo empleado).
//   2. Un legajo con dos liquidaciones se suma, no se pisa.
//   3. Con un solo Tabulado el control corre igual y AVISA —en el resumen y en
//      los resultados— que los legajos de la otra empresa quedan sin comparar
//      (D-036).
//
// Datos 100% inventados: legajos '1'…'4' y jugadores de Banfield.

// rendXEe.js importa (transitivamente) módulos de UI que registran un listener
// a nivel de módulo — necesitan un `document` mínimo para importarse fuera del
// navegador. No se ejercita nada de esos módulos acá.
globalThis.document = { addEventListener: () => {} };

const { runRendXEe, summarizeRendXEe } = await import('./js/controls/rendXEe.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle !== undefined ? `\n    ${JSON.stringify(detalle)}` : ''); fail++; }
}
const casi = (a, b, eps = 0.01) => a !== null && Math.abs(a - b) <= eps;

const GROUPING = {
  precio:   [{ code: '1003', sign: 1 }],
  estimulo: [],
  cargas:   [{ code: '6050', sign: 1 }, { code: '6110', sign: -1 }],
  provMes:  [],
  provCcss: [],
};

// Empresa A: el Tabulado principal del wizard.
const TAB_A = [
  { ID_EMPLEADO: '007', APELLIDO_NOMBRE: 'SANGUINETTI JAVIER', '1003-SUELDO': 500000, '6050-CARGA': 100000, '6110-DTO': 10000 },
  // Segunda liquidación del mismo legajo en el mes: se suma.
  { ID_EMPLEADO: '7',   APELLIDO_NOMBRE: 'SANGUINETTI JAVIER', '1003-SUELDO': 50000,  '6050-CARGA': 0,      '6110-DTO': 0 },
  { ID_EMPLEADO: '2',   APELLIDO_NOMBRE: 'ALBELLA GUSTAVO',    '1003-SUELDO': 300000, '6050-CARGA': 60000,  '6110-DTO': 0 },
];

// Empresa B: otro archivo, con OTRA columna de legajo y las columnas de
// concepto en otro orden (y con otro nombre después del código).
const TAB_B = [
  { '6110_DTO_X': 5000, LEG: '0003', NOMBRE: 'FALCIONI JULIO CESAR', '6050_CARGAS': 80000, '1003_SUELDO_B': 400000 },
  { '6110_DTO_X': 0,    LEG: '4',    NOMBRE: 'SILVA SANTIAGO',       '6050_CARGAS': 20000, '1003_SUELDO_B': 100000 },
];

const REPORTE = [
  { Legajo: '7',   CostoTotal: 640000 },   // 550.000 + 100.000 − 10.000 = 640.000 → cierra
  { Legajo: '002', CostoTotal: 360000 },   // 300.000 + 60.000 = 360.000 → cierra
  { Legajo: '3',   CostoTotal: 475000 },   // 400.000 + 80.000 − 5.000 = 475.000 → cierra
  { Legajo: '4',   CostoTotal: 125000 },   // 100.000 + 20.000 = 120.000 → 5.000 de diferencia
];

const baseMapping = () => ({
  costoTotal: { legajoColumn: 'Legajo', costoTotalColumn: 'CostoTotal' },
  tab:  { empleadoColumn: 'ID_EMPLEADO', apellidoNombreColumn: 'APELLIDO_NOMBRE' },
  conceptGrouping: GROUPING,
  // Sin `legajoKeyMode`: el default del cliente ('007' y '7' son el mismo).
});

// ── 1) Los dos Tabulados ─────────────────────────────────────────────────────
{
  const mapping = {
    ...baseMapping(),
    tab2: { empleadoColumn: 'LEG', apellidoNombreColumn: 'NOMBRE' },
    tab2Rows: TAB_B,
  };
  const res = runRendXEe(REPORTE, TAB_A, mapping);
  const fila = (leg) => res.rows.find(r => r.legajo === leg);

  assert('entran los dos Tabulados', res.tabulados === 2, res.tabulados);
  assert('ningún legajo del reporte queda sin Tabulado', res.summary.sinTabData === 0, res.summary);
  assert('ningún legajo de los Tabulados queda fuera del reporte', res.summary.soloEnTab === 0, res.summary);
  assert('4 legajos en total (las dos empresas)', res.summary.total === 4, res.summary);

  assert("legajo '7' del reporte junta '007' y '7' del Tabulado A: las dos liquidaciones se suman (640.000)",
    casi(fila('7')?.calcTotal, 640000) && casi(fila('7')?.precio, 550000), fila('7'));
  assert("legajo '002' del reporte matchea '2' del Tabulado A",
    casi(fila('002')?.calcTotal, 360000) && fila('002')?.dif === 0, fila('002'));
  assert("legajo '3' del reporte matchea '0003' del Tabulado B, leído con SUS columnas (475.000)",
    casi(fila('3')?.calcTotal, 475000) && casi(fila('3')?.cargas, 75000), fila('3'));
  assert('el nombre del Tabulado B sale de su propia columna de nombre',
    fila('3')?.nombre === 'FALCIONI JULIO CESAR', fila('3'));
  assert('legajo 4 (Tabulado B): 5.000 de diferencia, Reporte − Calculado',
    casi(fila('4')?.dif, 5000), fila('4'));
  assert('una sola diferencia en todo el cruce', res.summary.conDif === 1, res.summary);

  const s = summarizeRendXEe(res);
  assert('con los dos Tabulados no hay nota de aviso en la tarjeta', s.contextNote === null, s.contextNote);
  assert('el resumen informa que entraron 2 Tabulados',
    s.insights.some(i => i.value === 2 && /Tabulados cruzados/.test(i.label) && i.type === 'info'), s.insights);
  assert('sin avisos', res.avisos.length === 0, res.avisos);
  assert('el puente del tablero no lleva nota de Tabulado faltante',
    res.bridge.steps[0].note === undefined, res.bridge.steps[0]);
}

// ── 2) Un solo Tabulado: corre igual y avisa ─────────────────────────────────
{
  const res = runRendXEe(REPORTE, TAB_A, baseMapping());
  assert('con un solo Tabulado el control corre', Array.isArray(res.rows) && res.rows.length === 4);
  assert('entra 1 Tabulado', res.tabulados === 1, res.tabulados);
  assert('los 2 legajos de la otra empresa salen sin datos en Tabulado (no como diferencia)',
    res.summary.sinTabData === 2 && res.summary.conDif === 0, res.summary);

  const s = summarizeRendXEe(res);
  assert('la tarjeta lo avisa en su nota', /un solo Tabulado/.test(s.contextNote || ''), s.contextNote);
  assert('el resumen trae un aviso de 1 Tabulado, en amarillo',
    s.insights.some(i => i.value === 1 && i.type === 'warning' && /otra empresa/.test(i.label)), s.insights);
  assert('el tablero del Resumen lo dice en el Total Calculado del puente',
    /un solo Tabulado/.test(s.resumen.bridge.steps[0].note || ''), s.resumen.bridge.steps[0]);
}

// ── 3) La clave de legajo es la del cliente, en los dos Tabulados ────────────
{
  const mapping = {
    ...baseMapping(),
    legajoKeyMode: 'trim',
    tab2: { empleadoColumn: 'LEG', apellidoNombreColumn: 'NOMBRE' },
    tab2Rows: TAB_B,
  };
  const res = runRendXEe(REPORTE, TAB_A, mapping);
  // Con 'trim', '0003' (Tabulado B) y '3' (reporte) son empleados distintos.
  assert("con clave 'tal cual', '0003' del Tabulado B no matchea '3' del reporte",
    res.rows.some(r => r.legajo === '3' && r.sinTabData)
    && res.rows.some(r => r.legajo === '0003' && r.soloEnTab), res.rows.map(r => [r.legajo, r.sinTabData, r.soloEnTab]));
}

// ── 4) Un Tabulado sin columna de legajo no se usa en silencio ───────────────
{
  const mapping = { ...baseMapping(), tab2: {}, tab2Rows: TAB_B };
  const res = runRendXEe(REPORTE, TAB_A, mapping);
  assert('el Tabulado de la otra empresa sin columna de legajo queda afuera y se avisa',
    res.tabulados === 1 && res.avisos.some(a => /otra empresa/.test(a) && /legajo/.test(a)), res.avisos);
}

// ── 5) Una corrida guardada antes del segundo casillero no afirma nada ───────
{
  const res = runRendXEe(REPORTE, TAB_A, baseMapping());
  delete res.tabulados;
  const s = summarizeRendXEe(res);
  assert('sin el dato de Tabulados no hay insight ni nota sobre eso',
    s.contextNote === null && !s.insights.some(i => /Tabulado cruzado/.test(i.label)), s.insights);
}

// ── 6) RETIROS: la gente que sólo cobra retiro / apoyo financiero ────────────
// Con el Tabulado de la 03 de Marval (10-2026) el Costo Total del reporte es
// 9200-APOYO_FINAN + 9205-RETIRO. Ninguno está en la agrupación compartida:
// sin la columna RETIROS el control sumaba 0,00 y daba el Costo Total entero
// como diferencia.
{
  const TAB_RETIRO = [
    { LEG: '5', NOMBRE: 'LUCCHETTI CRISTIAN', '9200-APOYO_FINAN': 0,      '9205-RETIRO': 1000000, '8802-GTOS_PERSONAL': 7000 },
    { LEG: '6', NOMBRE: 'ERVITI WALTER',      '9200-APOYO_FINAN': 250000, '9205-RETIRO': 800000,  '8802-GTOS_PERSONAL': 0 },
  ];
  const reporte = [...REPORTE, { Legajo: '5', CostoTotal: 1000000 }, { Legajo: '6', CostoTotal: 1050000 }];
  const mapping = { ...baseMapping(), tab2: { empleadoColumn: 'LEG', apellidoNombreColumn: 'NOMBRE' }, tab2Rows: TAB_RETIRO };
  const res = runRendXEe(reporte, TAB_A, mapping);
  const fila = (leg) => res.rows.find(r => r.legajo === leg);

  assert('RETIROS suma 9200 + 9205', casi(fila('6').retiros, 1050000), fila('6'));
  assert('RETIROS entra en el Costo Total calculado y cierra contra el reporte',
    casi(fila('5').calcTotal, 1000000) && casi(fila('5').dif, 0) && casi(fila('6').dif, 0),
    [fila('5'), fila('6')]);
  assert('un concepto fuera de la agrupación (8802) no suma', casi(fila('5').precio, 0), fila('5'));
  assert('los legajos de la otra empresa sin retiro tienen RETIROS en 0, no null',
    fila('7').retiros === 0, fila('7'));
  assert('la leyenda conoce los conceptos de RETIROS',
    res.meta.conceptConfig.retiros.map(e => e.code).join() === '9200,9205'
    && res.meta.colByCode['9205'] === '9205-RETIRO', res.meta);
  assert('con conceptos hallados no hay aviso de "ningún concepto"',
    !res.avisos.some(a => /ningún concepto/.test(a)), res.avisos);
}

// ── 6 bis) Un código de RETIROS que la agrupación ya tiene no se cuenta dos veces
{
  const TAB_RETIRO = [{ LEG: '5', NOMBRE: 'LUCCHETTI CRISTIAN', '9200-APOYO_FINAN': 200, '9205-RETIRO': 1000 }];
  const grouping = { ...GROUPING, precio: [...GROUPING.precio, { code: '9205', sign: 1 }] };
  const mapping = { ...baseMapping(), conceptGrouping: grouping,
    tab2: { empleadoColumn: 'LEG', apellidoNombreColumn: 'NOMBRE' }, tab2Rows: TAB_RETIRO };
  const res = runRendXEe([{ Legajo: '5', CostoTotal: 1200 }], [], mapping);
  const f = res.rows.find(r => r.legajo === '5');
  assert('9205 ya en PRECIO: va sólo a PRECIO, y RETIROS se queda con 9200',
    casi(f.precio, 1000) && casi(f.retiros, 200) && casi(f.dif, 0), f);
}

// ── 7) Un Tabulado sin ningún concepto de la agrupación se avisa ─────────────
{
  const TAB_SIN = [{ LEG: '3', NOMBRE: 'FALCIONI JULIO CESAR', '7777-OTRO': 400000 }];
  const mapping = { ...baseMapping(), tab2: { empleadoColumn: 'LEG', apellidoNombreColumn: 'NOMBRE' }, tab2Rows: TAB_SIN };
  const res = runRendXEe(REPORTE, TAB_A, mapping);
  assert('se avisa que el Tabulado de la otra empresa no trae ningún concepto',
    res.avisos.some(a => /otra empresa/.test(a) && /ningún concepto/.test(a)), res.avisos);
  assert('el Tabulado principal, que sí trae conceptos, no se avisa',
    !res.avisos.some(a => a.startsWith('En el Tabulado no')), res.avisos);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
