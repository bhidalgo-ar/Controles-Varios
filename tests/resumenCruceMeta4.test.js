// resumenCruceMeta4.test.js — Tanda 2 de specs/vista-estandar-resumen.md: los
// seis controles del checklist de Marval publican `summary.resumen` (brutos,
// gs_pers, nr, rend_vs_tabu, rend_x_ee, rend_vs_asiento).
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/resumenCruceMeta4.test.js
//
// Datos 100% inventados: legajos '1'/'2'/'3' y jugadores de Banfield donde el
// control trae nombre (Brutos, Rendimiento x EE); importes redondos para que
// la cuenta se pueda seguir a mano.
//
// Lo que este test fija, en orden de qué cuesta más caro si se rompe:
//   1. El signo de la resta se conserva en `diffSigned` — nunca el valor
//      absoluto (§4 de la spec: "el signo queda por verificar módulo por
//      módulo").
//   2. El puente respeta D-086: el total de cada archivo queda TAL CUAL, la
//      diferencia comparada suma sólo los pares con los dos lados, y lo que
//      quedó de un solo lado se informa aparte con su importe y su lado — Total
//      archivo A + Diferencia comparada − Sin comparar = Total archivo B.
//   3. `byCause` abre por concepto (Brutos, GS Pers) o por banda (NR) o por
//      categoría (Rendimiento vs Tabulado/Asiento) — nunca junta dos conceptos
//      en una sola causa.
//   4. Ninguno de los seis trae `byGroup` (no hay empresa): sale `null` y
//      declarado en `notApplicable`, no ausente por accidente.
//   5. Rendimiento vs Tabulado y Rendimiento vs Asiento —los dos con unidad
//      'cc' de este lote— arman la MISMA clave para el mismo centro de costo,
//      así el corte cruzado de 3b los puede unir.
//   6. El candado de CI (tests/resumenContract.test.js) ya no lista a estos
//      seis como pendientes — se corre aparte, esto sólo prueba el contenido.

globalThis.document = { addEventListener: () => {} };

const { runBrutos, summarizeBrutos } = await import('./js/controls/brutos.js');
const { runGsPers, summarizeGsPers } = await import('./js/controls/gsPers.js');
const { runNr, summarizeNr } = await import('./js/controls/nr.js');
const { runRendVsTabu, summarizeRendVsTabu } = await import('./js/controls/rendVsTabu.js');
const { runRendXEe, summarizeRendXEe } = await import('./js/controls/rendXEe.js');
const { runRendVsAsiento, summarizeRendVsAsiento } = await import('./js/controls/rendVsAsiento.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle !== undefined ? `\n    ${JSON.stringify(detalle)}` : ''); fail++; }
}
const casi = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// ═══════════════════════════════════════════════════════════════════════════
// 1. Brutos — Controlar
// ═══════════════════════════════════════════════════════════════════════════
{
  const mapping = {
    brutos: { legajoColumn: 'Legajo', salBaseColumn: 'SAL_BASE', aCuFutAumenColumn: 'A_CTA_FUT_AUMEN' },
    tab: {
      empleadoColumn: 'Legajo', apellidoNombreColumn: 'NOMBRE',
      tabSalBaseColumn: 'SAL_BASE_TAB', tabACuFutAumenColumn: 'ACFA_TAB',
    },
  };
  const brutosRows = [
    { Legajo: '1', SAL_BASE: '700000', A_CTA_FUT_AUMEN: '50000' },
    { Legajo: '2', SAL_BASE: '300000', A_CTA_FUT_AUMEN: '0' },
    // El legajo 3 tiene SAL_BASE en los dos archivos (cierra) pero
    // A_CTA_FUT_AUMEN en blanco del lado de Brutos: un concepto de un solo lado
    // DENTRO de un legajo que sí está en los dos archivos — D-086.
    { Legajo: '3', SAL_BASE: '150000', A_CTA_FUT_AUMEN: '' },
  ];
  const tabRows = [
    { Legajo: '1', NOMBRE: 'SANGUINETTI JAVIER', SAL_BASE_TAB: '1000000', ACFA_TAB: '20000' },
    { Legajo: '2', NOMBRE: 'ALBELLA GUSTAVO',    SAL_BASE_TAB: '300000',  ACFA_TAB: '0' },
    { Legajo: '3', NOMBRE: 'FALCIONI JULIO CESAR', SAL_BASE_TAB: '150000', ACFA_TAB: '40000' },
  ];

  const res = runBrutos(brutosRows, tabRows, mapping);
  const r = summarizeBrutos(res).resumen;

  // ── El signo ──
  assert('Brutos: de más (SAL_BASE) 1 legajo por 300.000',
    r.diffSigned.over.units === 1 && casi(r.diffSigned.over.amount, 300000));
  assert('Brutos: de menos (A_CTA_FUT_AUMEN) 1 legajo por 30.000 — el signo de la resta, no el absoluto',
    r.diffSigned.under.units === 1 && casi(r.diffSigned.under.amount, 30000));

  // ── byCause: los 2 conceptos, cada uno con su propia plata ──
  const salCause = r.byCause.find(c => c.key === 'SAL_BASE');
  const acuCause = r.byCause.find(c => c.key === 'A_CTA_FUT_AUMEN');
  assert('Brutos byCause: SAL_BASE y A_CTA_FUT_AUMEN por separado, no un solo rubro',
    r.byCause.length === 2 && casi(salCause.amount, 300000) && casi(acuCause.amount, 30000));

  // ── unitKeys: un legajo con dos conceptos con diferencia cuenta UNA vez ──
  assert('Brutos unitKeys: el legajo 1 aparece una sola vez aunque tenga 2 conceptos con diferencia',
    r.unitKeys.length === 1);
  assert('Brutos: el nombre viaja en topUnits (Banfield)',
    r.topUnits.some(u => u.nombre === 'SANGUINETTI JAVIER'));

  // ── byGroup: ninguno de los seis trae empresa ──
  assert('Brutos: byGroup null y declarado en notApplicable', r.byGroup === null && r.notApplicable.includes('group'));

  // ── El puente (D-086) ──
  assert('Brutos bridge: Total Tabulado = 1.510.000 (tal cual)',
    casi(r.bridge.steps[0].amount, 1510000));
  assert('Brutos bridge: Diferencia comparada = 270.000 (300.000 − 30.000; el legajo 3 cierra en 0 en SAL_BASE)',
    casi(r.bridge.steps[1].amount, 270000));
  assert('Brutos bridge: Total Reporte = 1.200.000 (tal cual)',
    casi(r.bridge.steps[2].amount, 1200000));
  assert('Brutos bridge: A_CTA_FUT_AUMEN del legajo 3 sólo en el Tabulado, por 40.000',
    r.bridge.uncompared.label.includes('1 sólo en el Tabulado') && casi(r.bridge.uncompared.amount, 40000));
  assert('Brutos bridge cierra: Total Tab − Total Reporte − Sin comparar = Diferencia comparada',
    casi(r.bridge.steps[0].amount - r.bridge.steps[2].amount - r.bridge.uncompared.amount, r.bridge.steps[1].amount));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. GS Pers — Controlar (no trae nombre)
// ═══════════════════════════════════════════════════════════════════════════
{
  const mapping = {
    gs_pers: { legajoColumn: 'Legajo', gtosPersonalesColumn: 'GTOS_PERSONALES', dtoCocheraColumn: 'DTO_COCHERA' },
    tab: { empleadoColumn: 'Legajo', tabGtosPersonalesColumn: 'GTOS_TAB', tabDtoCocheraColumn: 'DTO_TAB' },
  };
  const gsRows = [
    { Legajo: '1', GTOS_PERSONALES: '50000', DTO_COCHERA: '10000' },
    // El legajo 2 tiene GTOS_PERSONALES en los dos archivos (cierra) pero
    // DTO_COCHERA en blanco del lado de GS Pers: D-086 dentro de un legajo que
    // sí está en los dos archivos.
    { Legajo: '2', GTOS_PERSONALES: '20000', DTO_COCHERA: '' },
  ];
  const tabRows = [
    { Legajo: '1', GTOS_TAB: '80000', DTO_TAB: '10000' },
    { Legajo: '2', GTOS_TAB: '20000', DTO_TAB: '15000' },
  ];

  const res = runGsPers(gsRows, tabRows, mapping);
  const r = summarizeGsPers(res).resumen;

  assert('GS Pers: sin nombre, topUnits sale con nombre null (no inventa uno)',
    r.topUnits.every(u => u.nombre === null));
  assert('GS Pers byCause: sólo GTOS_PERSONALES tiene diferencia (DTO_COCHERA cierra en 0 donde se pudo comparar)',
    r.byCause.length === 1 && r.byCause[0].key === 'GTOS_PERSONALES' && casi(r.byCause[0].amount, 30000));
  assert('GS Pers: byGroup null (sin empresa)', r.byGroup === null && r.notApplicable.includes('group'));
  assert('GS Pers bridge: Total Tabulado = 125.000 (tal cual)', casi(r.bridge.steps[0].amount, 125000));
  assert('GS Pers bridge: Diferencia comparada = 30.000 (sólo GTOS_PERSONALES; DTO_COCHERA del legajo 2 no entra)',
    casi(r.bridge.steps[1].amount, 30000));
  assert('GS Pers bridge: Total Reporte = 80.000 (tal cual)', casi(r.bridge.steps[2].amount, 80000));
  assert('GS Pers bridge: DTO_COCHERA del legajo 2 sólo en el Tabulado, por 15.000',
    r.bridge.uncompared.label.includes('1 sólo en el Tabulado') && casi(r.bridge.uncompared.amount, 15000));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Control NR — el caso que motivó D-086
// ═══════════════════════════════════════════════════════════════════════════
{
  const mapping = {
    nr: {
      legajoColumn: 'Legajo',
      reinHomeOficeColumn: 'REIN_HO_NR', indemPreavisoColumn: 'INDEM_PRE_NR', sacPreavisoColumn: 'SAC_PRE_NR',
    },
    tab: {
      empleadoColumn: 'Legajo',
      tabReinHomeOficeColumn: 'REIN_HO_TAB', tabIndemPreavisoColumn: 'INDEM_PRE_TAB', tabSacPreavisoColumn: 'SAC_PRE_TAB',
    },
  };
  const nrRows = [
    { Legajo: '1', REIN_HO_NR: '100000', INDEM_PRE_NR: '50000' },
    // SAC_PRE_NR no viene en el Reporte de NR para este legajo.
  ];
  const tabRows = [
    { Legajo: '1', REIN_HO_TAB: '130000', INDEM_PRE_TAB: '20000', SAC_PRE_TAB: '40000' },
  ];

  const res = runNr(nrRows, tabRows, mapping);
  const r = summarizeNr(res).resumen;

  assert('NR: de más (REIN_HOME_OFICE, banda Otros NR) 30.000, con el signo de la resta',
    r.diffSigned.over.units === 1 && casi(r.diffSigned.over.amount, 30000));
  assert('NR: de menos (INDEM_PREAVISO, banda Indemnizatorios) 30.000',
    r.diffSigned.under.units === 1 && casi(r.diffSigned.under.amount, 30000));

  // byCause arranca por BANDA (§7.7), no por los 18 conceptos.
  const otros = r.byCause.find(c => c.label === 'Otros NR');
  const indem = r.byCause.find(c => c.label === 'Indemnizatorios');
  assert('NR byCause: arranca por banda (Indemnizatorios / Otros NR), no por concepto',
    r.byCause.length === 2 && otros && indem && casi(otros.amount, 30000) && casi(indem.amount, 30000));

  // El caso que motivó D-086: SAC_PREAVISO sólo tiene dato en el Tabulado.
  assert('NR bridge: Total Tabulado = 190.000 (130.000+20.000+40.000, tal cual)',
    casi(r.bridge.steps[0].amount, 190000));
  assert('NR bridge: Diferencia comparada = 0 (30.000 − 30.000, SAC_PREAVISO no entra)',
    casi(r.bridge.steps[1].amount, 0));
  assert('NR bridge: Total Reporte NR = 150.000 (100.000+50.000, tal cual)',
    casi(r.bridge.steps[2].amount, 150000));
  assert('NR bridge: SAC_PREAVISO (40.000, sólo Tabulado) se informa aparte — no resta contra cero',
    r.bridge.uncompared.label.includes('sólo en el Tabulado') && casi(r.bridge.uncompared.amount, 40000));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Rendimiento vs Tabulado y 5. Rendimiento vs Asiento — el mismo CC,
//    la MISMA clave para el corte cruzado de 3b (el run del checklist de
//    Marval es el primer 3b real con este lote).
// ═══════════════════════════════════════════════════════════════════════════

const MAPPING_RVT = {
  rend: {
    ccCodeColumn: 'CC', ccNameColumn: 'Nombre CC',
    precioColumn: 'Precio', estimuloColumn: 'Estimulo', cargasColumn: 'Cargas',
    provMesColumn: 'ProvMes', provCcssColumn: 'ProvCcss',
  },
  tab: { idCCColumn: 'ID_CC', ccColumn: 'N_CC' },
  conceptGrouping: {
    precio: [{ code: '1003', sign: 1 }], estimulo: [],
    cargas: [{ code: '6050', sign: 1 }], provMes: [], provCcss: [],
  },
};

let rvtResumen, rvaResumen;

{
  const rendRows = [
    { CC: '0011', 'Nombre CC': 'Administración', Precio: 400000, Cargas: 50000 },
    { CC: '0099', 'Nombre CC': 'CC Fantasma',     Precio: 10000 }, // sin contraparte en el Tabulado
  ];
  const tabRows = [
    { ID_CC: '11', N_CC: 'Administración', '1003-SUELDO': 500000, '6050-CARGA': 20000 },
  ];

  const res = runRendVsTabu(rendRows, tabRows, MAPPING_RVT);
  const r = summarizeRendVsTabu(res).resumen;
  rvtResumen = r;

  assert('Rend vs Tabulado: unidad "cc" — verificá en pantalla que el tablero diga "centros de costo"',
    r.unit === 'cc');
  assert('Rend vs Tabulado: de más (PRECIO) 100.000, de menos (CARGAS SS) 30.000 — el signo de la resta',
    r.diffSigned.over.units === 1 && casi(r.diffSigned.over.amount, 100000)
    && r.diffSigned.under.units === 1 && casi(r.diffSigned.under.amount, 30000));
  assert('Rend vs Tabulado byCause: PRECIO y CARGAS SS por separado (las 5 categorías, nunca COSTO TOTAL)',
    r.byCause.length === 2 && r.byCause.every(c => c.key !== 'total'));
  assert('Rend vs Tabulado: byGroup null (sin empresa)', r.byGroup === null);

  assert('Rend vs Tabulado bridge: Total Rendimiento = 460.000 (450.000 + 10.000, tal cual)',
    casi(r.bridge.steps[0].amount, 460000));
  assert('Rend vs Tabulado bridge: Diferencia comparada = 70.000 (100.000 − 30.000, sólo el CC comparable)',
    casi(r.bridge.steps[1].amount, 70000));
  assert('Rend vs Tabulado bridge: Total Tabulado = 520.000 (el CC Fantasma no aporta: no está en el Tabulado)',
    casi(r.bridge.steps[2].amount, 520000));
  assert('Rend vs Tabulado bridge: "CC Fantasma" sin Tabulado, por 10.000',
    r.bridge.uncompared.label.includes('1 centro de costo sin datos en el Tabulado') && casi(r.bridge.uncompared.amount, 10000));
}

{
  const rendRows = [
    // Mismo CC que en Rend vs Tabulado, escrito SIN tilde a propósito: la clave
    // del corte cruzado tiene que ser la misma igual (normCCName saca acentos).
    { CC: '0011', 'Nombre CC': 'Administracion', Precio: 400000, Cargas: 20000 },
  ];
  const contaRows = [
    { id_empleado: '1', cc_nombre: 'Administración', cuenta_contab: '5001', n_cuenta_contable: 'Sueldos',
      debe: 480000, haber: 0, apellido_1: 'SANGUINETTI', nombre: 'JAVIER' },
    { id_empleado: '1', cc_nombre: 'Administración', cuenta_contab: '5002', n_cuenta_contable: 'Cargas Soc.',
      debe: 25000, haber: 0, apellido_1: 'SANGUINETTI', nombre: 'JAVIER' },
    // Un CC que sólo existe en la CONTA, sin contraparte en el Rendimiento.
    { id_empleado: '2', cc_nombre: 'Deposito', cuenta_contab: '5001', n_cuenta_contable: 'Sueldos',
      debe: 15000, haber: 0, apellido_1: 'ALBELLA', nombre: 'GUSTAVO' },
  ];
  const mapping = {
    rend: MAPPING_RVT.rend,
    contaRows, ccXEeRows: [],
    rvaConfig: { cuentaCats: { precio: ['5001'], estimulo: [], cargas: ['5002'], provMes: [] }, provCcssConcepts: [], ccRedirects: [] },
  };

  const res = runRendVsAsiento(rendRows, [], mapping);
  const r = summarizeRendVsAsiento(res).resumen;
  rvaResumen = r;

  assert('Rend vs Asiento: unidad "cc"', r.unit === 'cc');
  assert('Rend vs Asiento byCause: PRECIO (80.000) y CARGAS SS (5.000), CONTA − Rend',
    r.byCause.length === 2 && casi(r.byCause.find(c => c.key === 'precio').amount, 80000)
    && casi(r.byCause.find(c => c.key === 'cargas').amount, 5000));

  assert('Rend vs Asiento bridge: Total Rendimiento = 420.000',
    casi(r.bridge.steps[0].amount, 420000));
  assert('Rend vs Asiento bridge: Diferencia comparada = 85.000 (505.000 − 420.000)',
    casi(r.bridge.steps[1].amount, 85000));
  assert('Rend vs Asiento bridge: Total CONTA = 520.000 (505.000 de Administración + 15.000 de Depósito, tal cual)',
    casi(r.bridge.steps[2].amount, 520000));
  assert('Rend vs Asiento bridge: "Depósito" sólo en la CONTA, por 15.000',
    r.bridge.uncompared.label.includes('1 sólo en la CONTA') && casi(r.bridge.uncompared.amount, 15000));

  // ── El primer 3b real: la MISMA clave para "Administración"/"Administracion" ──
  const keyRvt = rvtResumen.unitKeys.find(u => u.label === 'Administración')?.key;
  const keyRva = r.unitKeys.find(u => u.label === 'Administracion')?.key;
  assert('El corte cruzado de 3b: Rend vs Tabulado y Rend vs Asiento arman la MISMA clave para el mismo CC (con o sin tilde)',
    !!keyRvt && keyRvt === keyRva, { keyRvt, keyRva });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Rendimiento x EE — un solo importe, sin byCause
// ═══════════════════════════════════════════════════════════════════════════
{
  const mapping = {
    costoTotal: { legajoColumn: 'Legajo', costoTotalColumn: 'CostoTotal' },
    tab: { empleadoColumn: 'Legajo', apellidoNombreColumn: 'Nombre' },
    conceptGrouping: {
      precio: [{ code: '1003', sign: 1 }], estimulo: [],
      cargas: [{ code: '6050', sign: 1 }], provMes: [], provCcss: [],
    },
  };
  const tabRows = [
    { Legajo: '1', Nombre: 'ERVITI WALTER', '1003-SUELDO': 500000, '6050-CARGA': 20000 },
    { Legajo: '3', Nombre: 'RODRIGUEZ JAMES', '1003-SUELDO': 90000 }, // sólo en el Tabulado
  ];
  const ctRows = [
    { Legajo: '1', CostoTotal: 600000 },
    { Legajo: '2', CostoTotal: 75000 }, // sólo en el Reporte
  ];

  const res = runRendXEe(ctRows, tabRows, mapping);
  const r = summarizeRendXEe(res).resumen;

  assert('Rend x EE: un solo importe — byCause no aplica y queda declarado',
    r.byCause === null && r.notApplicable.includes('cause'));
  assert('Rend x EE: de más (Reporte − Calculado) 80.000, con nombre de Banfield',
    r.diffSigned.over.units === 1 && casi(r.diffSigned.over.amount, 80000)
    && r.topUnits.some(u => u.nombre === 'ERVITI WALTER'));

  assert('Rend x EE bridge: Total Calculado = 610.000 (520.000 + 90.000, tal cual)',
    casi(r.bridge.steps[0].amount, 610000));
  assert('Rend x EE bridge: Diferencia comparada = 80.000 (sólo el legajo 1, que tiene los dos lados)',
    casi(r.bridge.steps[1].amount, 80000));
  assert('Rend x EE bridge: Total Reporte = 675.000 (600.000 + 75.000, tal cual)',
    casi(r.bridge.steps[2].amount, 675000));
  assert('Rend x EE bridge: legajo 2 sólo en el Reporte y legajo 3 sólo en el Tabulado, por 165.000',
    r.bridge.uncompared.label.includes('sólo en el Reporte') && r.bridge.uncompared.label.includes('sólo en el Tabulado')
    && casi(r.bridge.uncompared.amount, 165000));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
