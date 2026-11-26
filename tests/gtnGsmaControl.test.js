// gtnGsmaControl.test.js — GTN GSMA desde Tabulado Axton (specs/gtn-gsma-axton.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/gtnGsmaControl.test.js
//
// Datos inventados: legajos '1', '2'…, nombres de la lista de Banfield de
// CLAUDE.md, importes redondos. Ningún archivo de cliente entra acá.
//
// Lo que fija este test, en el orden del brief:
//   1. la entrada del registry (archivos, alcance, tolerancia, gate);
//   2. coincidencia total → sin diferencia; una diferencia conocida → unitsWithDiff > 0;
//   3. un legajo con DOS liquidaciones suma, no pisa (el bug más caro del repo);
//   4. un concepto sin asignar frena (gate y `run()`), y la falta del tipo de cambio también;
//   5. ER Net Paid faltante → aviso y `null`, nunca 0;
//   6. el cruce por nombre: único, ninguno, dos candidatos, homónimo en el GTN,
//      palabra de más;
//   7. el parser del GTN anterior leyendo un GTN generado por el propio layout
//      (ida y vuelta, columnas por título con Recognition Award corrida) y uno
//      con el layout de Meta4;
//   8. el layout: encabezados, fórmulas, vacíos y ceros, cuadro y tipo de cambio.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

globalThis.document = { addEventListener: () => {} };
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };
globalThis.XLSX = require('xlsx');
const ExcelJS = require('exceljs');

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { runGtnGsma, summarizeGtnGsma, cruzarPorNombre, gtnParaExcel, GTN_NET_TOLERANCE } =
  await import('./js/controls/gtnGsma.js');
const { DEFAULT_GTN_GSMA_CONFIG, motivosGtnGsma, asignar, FUERA_DEL_GTN, resolverConceptos, columnasNoConceptoGtn } =
  await import('./js/controls/gtnGsmaConfig.js');
const { buildGtnGsmaWorkbook, gtnFileName, EXCHANGE_RATE_CELL, GTN_COLUMNS } =
  await import('./js/exports/gtnGsmaLayout.js');
const { parseGtnGsma, readTabuladoAxtonGtn, ERROR_XLS_WEB_AXTON } = await import('./js/parsers/gtnGsmaParser.js');
const { FILE_TYPES } = await import('./js/ui/fileTypes.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle !== undefined ? `\n    ${JSON.stringify(detalle)}` : ''); fail++; }
}
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6;

// ── Fixture: un Tabulado de Axton inventado ──────────────────────────────────
// Los mismos códigos que el Tabulado real, con importes redondos. Por empleado:
// Gross = 1000 + 1498 + 503815; deducciones = 605110 + 605130 + 605120 + 609996;
// Net = Gross − deducciones = 605203 (ER Net Paid).

const CODIGOS = ['1000', '1498', '503815', '605110', '605130', '605120', '609996', '605203', '880011', '880023'];
const NOMBRES = {
  '1000': 'Sueldo Basico', '1498': 'Pago Variable', '503815': 'Compensacion Teletrabajo',
  '605110': 'JUBILACION', '605130': 'OBRA SOCIAL', '605120': 'INSSJ Y P', '609996': 'IMPUESTO A LAS GANANCIAS',
  '605203': 'ER Net Paid', '880011': 'Contribucion Jubilacion', '880023': 'Diferencia Plan Prepaga',
  '2804': 'SAC 1er Semestre',
};

function conceptosDe(codigos) {
  return codigos.map((codigo, i) => ({
    codigo, codigoBase: codigo, duplicado: false, nombre: NOMBRES[codigo] || `Concepto ${codigo}`,
    label: `${codigo} - ${NOMBRES[codigo] || codigo}`, letra: `X${i}`, keyCant: `cant_${codigo}`, keyImp: `imp_${codigo}`,
  }));
}

/** Una liquidación con sueldo `s`: deducciones fijas y ER Net Paid que cierra (salvo `erDelta`). */
function liq(legajo, nombre, s, { erDelta = 0, sinEr = false, extra = {} } = {}) {
  const row = {
    legajo, apellido_nombre: nombre,
    imp_1000: s, imp_1498: 100, imp_503815: 50,
    imp_605110: s * 0.11, imp_605130: s * 0.03, imp_605120: s * 0.03, imp_609996: 20,
    imp_880011: s * 0.18, imp_880023: 10,
    ...extra,
  };
  if (!sinEr) {
    const gross = s + 100 + 50 + (extra.imp_2804 || 0);
    const ded = s * 0.11 + s * 0.03 + s * 0.03 + 20;
    row.imp_605203 = gross - ded + erDelta;
  }
  return row;
}

function metaDe(rows, codigos = CODIGOS) {
  const conceptos = conceptosDe(codigos);
  const totalGeneral = {};
  for (const c of conceptos) totalGeneral[c.keyImp] = rows.reduce((s, r) => s + (r[c.keyImp] ?? 0), 0);
  return { conceptos, totalGeneral, periodo: '2026-11', columnasSinClasificar: [] };
}

const GTN_PREV = [
  { fila: 9,  employeeNumber: 4011, nombre: 'SANGUINETTI JAVIER', costCentre: 'CC-1', locationCode: 'AR-BA', usdAnual: 133000, usdValor: null, usdOrigen: 'formula' },
  { fila: 10, employeeNumber: 4012, nombre: 'ALBELLA GUSTAVO',    costCentre: 'CC-2', locationCode: 'AR-BA', usdAnual: 66500,  usdValor: null, usdOrigen: 'formula' },
];

function correr(rows, { prev = GTN_PREV, config = DEFAULT_GTN_GSMA_CONFIG(), tipoCambio = 1050, meta = metaDe(rows) } = {}) {
  return runGtnGsma(rows, [], {
    tabAxtonMeta: meta,
    gtnPrevRows: prev,
    gtnPrevMeta: { periodo: '2026-10', origen: 'meta4', avisos: [] },
    gtnConfig: config,
    gtnTipoCambio: tipoCambio,
    legajoKeyMode: undefined,
    period: '2026-11',
  });
}

// ── 1. Registry ──────────────────────────────────────────────────────────────

const ctrl = CONTROL_REGISTRY.gtn_gsma;
assert('el registry tiene gtn_gsma', !!ctrl);
assert('es "Generar Reporte" con grupo propio y primary', ctrl.group.id === 'gtn_gsma' && ctrl.group.mode === 'Generar Reporte' && ctrl.group.primary === true);
assert('sólo para GSMA', ctrl.scope === 'cliente' && ctrl.scopeMeta.clients.join() === 'GSMA');
assert('no pide el Tabulado del casillero estándar', ctrl.tabRequired === false);
assert('additionalFiles[0] es el Tabulado de Axton (es el primaryRows de run)', ctrl.additionalFiles[0].key === 'tabAxton'
  && ctrl.additionalFiles[0].fileType === 'tab_axton_gtn_file' && ctrl.additionalFiles[0].rerenderOnLoad === true);
assert('additionalFiles[1] es el GTN del mes anterior', ctrl.additionalFiles[1].key === 'gtnPrev'
  && ctrl.additionalFiles[1].fileType === 'gtn_gsma_prev_file');
assert('las dos fichas existen en FILE_TYPES', !!FILE_TYPES.tab_axton_gtn_file && !!FILE_TYPES.gtn_gsma_prev_file);
assert('tolerancia propia, estructural, de 0,01', ctrl.ownTolerance?.from?.({}) === 0.01 && GTN_NET_TOLERANCE === 0.01);
assert('declara blockers (el gate del Paso 2)', typeof ctrl.blockers === 'function');
assert('help en criollo con what y how', typeof ctrl.help.what === 'string' && ctrl.help.how.length >= 3);
const cfgTc = ctrl.config.find(c => c.key === 'gtn_gsma_tipo_cambio');
assert('el tipo de cambio es perRun (no se guarda) y empieza vacío', cfgTc?.perRun === true && cfgTc.default() === null);
assert('default() de las asignaciones es una copia nueva', DEFAULT_GTN_GSMA_CONFIG() !== DEFAULT_GTN_GSMA_CONFIG()
  && JSON.stringify(DEFAULT_GTN_GSMA_CONFIG()) === JSON.stringify(DEFAULT_GTN_GSMA_CONFIG()));
assert('las semillas son las 18 + 2 de la spec, ni una más',
  Object.keys(DEFAULT_GTN_GSMA_CONFIG().asignaciones).length === 20);
assert('los códigos del Manual NO se siembran (2804, 2252, 2487 salen sin asignar)',
  ['2804', '2252', '2487'].every(c => !DEFAULT_GTN_GSMA_CONFIG().asignaciones[c]));

// ── 2. Coincidencia total y una diferencia conocida ──────────────────────────

const rowsOk = [liq('1', 'SANGUINETTI JAVIER', 1000), liq('2', 'ALBELLA GUSTAVO', 500)];
const rOk = correr(rowsOk);
const sOk = summarizeGtnGsma(rOk);
assert('coincidencia total: sin error', !rOk.error, rOk.error);
assert('coincidencia total: 2 empleados, ninguno con diferencia', sOk.unitsTotal === 2 && sOk.unitsWithDiff === 0);
assert('coincidencia total: status success', sOk.status === 'success');
assert('unit en minúscula', sOk.unit === 'legajo');
assert('publica resumen con la unidad', sOk.resumen?.unit === 'legajo');
const e1 = rOk.empleados[0];
assert('Gross Pay = 1000 + 1498 + 503815', near(e1.grossPay, 1000 + 100 + 50));
assert('Net Pay = Gross − deducciones y cierra con ER Net Paid', near(e1.netPay, e1.erNetPaid) && near(e1.diferencia, 0));
assert('880011 va a Social Security (20,4%)', near(e1.valores.ssEmployer, 180));
assert('880023 va fuera del GTN (no suma en ninguna columna)',
  rOk.conceptos.find(c => c.codigo === '880023').columna === FUERA_DEL_GTN
  && !Object.values(e1.valores).some(v => near(v, 10)));
assert('Days not worked sin código asignado es null, no 0', e1.valores.daysNotWorked === null);
assert('nombre de archivo 5_AAAA_MM_GSMA_Argentina_GTN.xlsx', rOk.fileName === '5_2026_11_GSMA_Argentina_GTN.xlsx'
  && gtnFileName('2026-01') === '5_2026_01_GSMA_Argentina_GTN.xlsx');

const rDif = correr([liq('1', 'SANGUINETTI JAVIER', 1000), liq('2', 'ALBELLA GUSTAVO', 500, { erDelta: -100 })]);
const sDif = summarizeGtnGsma(rDif);
assert('una diferencia conocida → unitsWithDiff 1', sDif.unitsWithDiff === 1 && sDif.status === 'warning');
assert('la diferencia es Net Pay − ER Net Paid, con signo', near(rDif.empleados[1].diferencia, 100));
assert('el total de diferencia es el del empleado', near(rDif.totales.diferencia, 100));

// ── 3. Dos liquidaciones del mismo legajo suman, no pisan ────────────────────

const rDoble = correr([
  liq('1', 'SANGUINETTI JAVIER', 1000),
  liq('2', 'ALBELLA GUSTAVO', 500),
  // La segunda liquidación del mismo empleado, con el legajo escrito con ceros:
  // con la clave del cliente es el MISMO empleado.
  liq('002', 'ALBELLA GUSTAVO', 300),
]);
const albella = rDoble.empleados.find(e => e.nombre === 'ALBELLA GUSTAVO');
assert('dos liquidaciones: un solo empleado en el GTN', rDoble.empleados.length === 2);
assert('dos liquidaciones: Monthly Salary suma 500 + 300', near(albella.valores.monthlySalary, 800));
assert('dos liquidaciones: el neto sumado cierra con el ER Net Paid sumado', near(albella.diferencia, 0));
assert('dos liquidaciones: se cuenta como consolidado', rDoble.conteos.consolidados === 1 && albella.liquidaciones === 2);

// ── 4. Concepto sin asignar y tipo de cambio: frenan ─────────────────────────

const rowsSac = [liq('1', 'SANGUINETTI JAVIER', 1000, { extra: { imp_2804: 500 } }), liq('2', 'ALBELLA GUSTAVO', 500)];
const metaSac = metaDe(rowsSac, [...CODIGOS, '2804']);
const motivos = motivosGtnGsma({ tabMeta: metaSac, config: DEFAULT_GTN_GSMA_CONFIG(), tipoCambio: 1050 });
assert('gate: un concepto sin asignar es un motivo, con su código', motivos.length === 1
  && motivos[0].kind === 'concepto' && motivos[0].detail === '2804');
assert('gate: el registry lo devuelve desde el state del wizard', ctrl.blockers({
  controlFiles: { gtn_gsma: { tabAxton: { parseMetadata: metaSac } } },
  gtnGsmaConfig: DEFAULT_GTN_GSMA_CONFIG(), gtnGsmaTipoCambio: 1050,
}).length === 1);
const rSac = correr(rowsSac, { meta: metaSac });
assert('run(): concepto sin asignar → { error } que nombra el código', typeof rSac.error === 'string' && rSac.error.includes('2804'));
assert('run(): el error se resume en rojo', summarizeGtnGsma(rSac).status === 'error');
const cfgSac = asignar(DEFAULT_GTN_GSMA_CONFIG(), '2804', 'thirteenthSalary', { fecha: '2026-11-25' });
const rSacOk = correr(rowsSac, { meta: metaSac, config: cfgSac });
assert('asignado por el analista: corre y suma en 13th salary', !rSacOk.error
  && near(rSacOk.empleados[0].valores.thirteenthSalary, 500));
assert('…con el estado y la fecha', rSacOk.conceptos.find(c => c.codigo === '2804').estado === 'analista'
  && rSacOk.conceptos.find(c => c.codigo === '2804').fecha === '2026-11-25');
assert('…y el neto incluye el 13th salary', near(rSacOk.empleados[0].diferencia, 0));
const cfgCambio = asignar(DEFAULT_GTN_GSMA_CONFIG(), '1000', 'bonus', { fecha: '2026-11-25' });
assert('cambiar una semilla la pasa a "asignado por el analista"',
  resolverConceptos(conceptosDe(['1000']), cfgCambio)[0].estado === 'analista');
assert('la sugerencia del Manual se muestra y no se aplica',
  resolverConceptos(conceptosDe(['2804']), DEFAULT_GTN_GSMA_CONFIG())[0].sugerencia === 'thirteenthSalary'
  && resolverConceptos(conceptosDe(['2804']), DEFAULT_GTN_GSMA_CONFIG())[0].estado === 'sin_asignar');

const motivosTc = motivosGtnGsma({ tabMeta: metaDe(rowsOk), config: DEFAULT_GTN_GSMA_CONFIG(), tipoCambio: null });
assert('gate: sin tipo de cambio es un motivo', motivosTc.length === 1 && motivosTc[0].kind === 'dato');
assert('gate: tipo de cambio 0 o texto no valen', motivosGtnGsma({ tabMeta: metaDe(rowsOk), config: null, tipoCambio: '0' }).length === 1
  && motivosGtnGsma({ tabMeta: metaDe(rowsOk), config: null, tipoCambio: 'abc' }).length === 1);
assert('gate: "1.050,00" vale', motivosGtnGsma({ tabMeta: metaDe(rowsOk), config: null, tipoCambio: '1.050,00' }).length === 0);
assert('run(): sin tipo de cambio → { error }', typeof correr(rowsOk, { tipoCambio: null }).error === 'string');
assert('gate: sin Tabulado cargado no inventa motivos de conceptos',
  motivosGtnGsma({ tabMeta: null, config: null, tipoCambio: 1 }).length === 0);

// ── 5. ER Net Paid faltante: aviso, no 0 ─────────────────────────────────────

const rSinEr = correr([liq('1', 'SANGUINETTI JAVIER', 1000), liq('2', 'ALBELLA GUSTAVO', 500, { sinEr: true })]);
const sinEr = rSinEr.empleados[1];
assert('ER Net Paid faltante queda null', sinEr.erNetPaid === null && sinEr.diferencia === null);
assert('…no cuenta como diferencia ni como 0', summarizeGtnGsma(rSinEr).unitsWithDiff === 0);
assert('…sale como aviso', rSinEr.avisos.some(a => a.tipo === 'sinErNetPaid' && a.who === 'ALBELLA GUSTAVO'));
assert('…y su celda va marcada', sinEr.marcas.some(m => m.col === 'erNetPaid'));

// ── 6. Cruce por nombre ──────────────────────────────────────────────────────

const ax = (nombres) => nombres.map(nombre => ({ nombre }));
const gp = (nombres) => nombres.map(nombre => ({ nombre }));
{
  const { match, prevEstado } = cruzarPorNombre(gp(['Sanguinetti Javier']), ax(['SANGUINETTI JAVIER']));
  assert('cruce: único, sin importar mayúsculas', match.get(0) === 0 && prevEstado[0].tipo === 'cruzo');
}
{
  const { match } = cruzarPorNombre(gp(['ERVITI WALTER']), ax(['WALTER ERVÍTI']));
  assert('cruce: sin tildes y en cualquier orden', match.get(0) === 0);
}
{
  const { match } = cruzarPorNombre(gp(['SILVA SANTIAGO']), ax(['SILVA SANTIAGO MARTIN']));
  assert('cruce: Axton puede traer una palabra más (todas las del GTN están)', match.get(0) === 0);
}
{
  const { match, prevEstado } = cruzarPorNombre(gp(['DATOLO JESUS']), ax(['URZI AGUSTIN']));
  assert('cruce: ninguno → el del GTN "no vino" y el de Axton queda sin cruzar', match.size === 0 && prevEstado[0].tipo === 'no_vino');
}
{
  const { match, prevEstado } = cruzarPorNombre(gp(['RODRIGUEZ']), ax(['RODRIGUEZ JAMES', 'RODRIGUEZ JUAN']));
  assert('cruce: dos candidatos → no se cruza, se listan', match.size === 0 && prevEstado[0].tipo === 'varios'
    && prevEstado[0].candidatos.length === 2);
}
{
  const { match, prevEstado } = cruzarPorNombre(gp(['PALACIO RODRIGO', 'PALACIO RODRIGO']), ax(['PALACIO RODRIGO']));
  assert('cruce: homónimo en el GTN → no se cruza ninguna, se listan las dos', match.size === 0
    && prevEstado.every(e => e.tipo === 'homonimo'));
}
{
  const { match, prevEstado, parecidos } = cruzarPorNombre(gp(['FALCIONI JULIO CESAR']), ax(['FALCIONI JULIO']));
  assert('cruce: el GTN trae una palabra de más → NO cruza', match.size === 0 && prevEstado[0].tipo === 'no_vino');
  assert('…pero queda anotado como parecido, para mostrarlo', parecidos.get(0) === 0);
}
{
  const { match, prevEstado } = cruzarPorNombre(gp(['CVITANICH', 'CVITANICH DARIO']), ax(['CVITANICH DARIO']));
  assert('cruce: dos filas del GTN que piden al mismo de Axton → conflicto, ninguna cruza', match.size === 0
    && prevEstado.every(e => e.tipo === 'conflicto'));
}

// El cruce dentro de run(): un nuevo, uno que no vino, uno con palabra de más.
const prevMix = [
  ...GTN_PREV,
  { fila: 11, employeeNumber: 4013, nombre: 'DATOLO JESUS', costCentre: 'CC-3', locationCode: 'AR-BA', usdAnual: 13300, usdValor: null, usdOrigen: 'formula' },
  { fila: 12, employeeNumber: 4014, nombre: 'FALCIONI JULIO CESAR', costCentre: 'CC-3', locationCode: 'AR-BA', usdAnual: 13300, usdValor: null, usdOrigen: 'formula' },
];
const rMix = correr([
  liq('1', 'SANGUINETTI JAVIER', 1000), liq('2', 'ALBELLA GUSTAVO', 500),
  liq('3', 'PALACIO RODRIGO', 400), liq('4', 'FALCIONI JULIO', 300),
], { prev: prevMix });
assert('run(): los que cruzan van primero, en el orden del GTN anterior',
  rMix.empleados.slice(0, 2).map(e => e.employeeNumber).join() === '4011,4012');
const palacio = rMix.empleados.find(e => e.nombreAxton === 'PALACIO RODRIGO');
assert('run(): el nuevo queda sin Employee Number, con sus 4 celdas marcadas', palacio.employeeNumber === null
  && ['employeeNumber', 'costCentre', 'locationCode', 'monthlySalaryUsd'].every(k => palacio.marcas.some(m => m.col === k)));
assert('run(): aviso de empleado nuevo', rMix.avisos.some(a => a.tipo === 'nuevo' && a.who === 'PALACIO RODRIGO'));
assert('run(): aviso del que no vino', rMix.avisos.some(a => a.tipo === 'noVino' && a.who === 'DATOLO JESUS'));
assert('run(): la palabra de más sale como "no cruzó" con el nombre del GTN',
  rMix.avisos.some(a => a.tipo === 'noCruzo' && a.who === 'FALCIONI JULIO' && a.why.includes('FALCIONI JULIO CESAR')));
assert('run(): el GTN anterior con palabra de más no se lista además como "no vino"',
  !rMix.cruce.some(c => c.resultado === 'noVino' && c.gtn === 'FALCIONI JULIO CESAR'));
assert('run(): el cruce se muestra completo (4 de Axton + 1 que no vino)', rMix.cruce.length === 5);
assert('run(): los avisos no cambian el semáforo', summarizeGtnGsma(rMix).unitsWithDiff === 0);

// Recognition Award con importe: aviso y celda marcada.
const cfgRA = asignar(DEFAULT_GTN_GSMA_CONFIG(), '2487', 'recognitionAward', { fecha: '2026-11-25' });
const rowsRA = [liq('1', 'SANGUINETTI JAVIER', 1000, { extra: { imp_2487: 70 } }), liq('2', 'ALBELLA GUSTAVO', 500)];
rowsRA[0].imp_605203 += 70;
const rRA = correr(rowsRA, { meta: metaDe(rowsRA, [...CODIGOS, '2487']), config: cfgRA });
assert('Recognition Award con importe → aviso y celda marcada', rRA.avisos.some(a => a.tipo === 'recognitionAward')
  && rRA.empleados[0].marcas.some(m => m.col === 'recognitionAward'));
assert('…y entra en el Gross Pay', near(rRA.empleados[0].diferencia, 0));

// ── 7 y 8. El layout y el parser, ida y vuelta ───────────────────────────────

const gtnObj = gtnParaExcel(rMix);
const wb = buildGtnGsmaWorkbook(ExcelJS, gtnObj);
const ws = wb.worksheets[0];
const val = (addr) => ws.getCell(addr).value;
const formula = (addr) => ws.getCell(addr).formula;
const n = gtnObj.filas.length;          // 4
const tot = 9 + n;                       // 13
const det = tot + 3;                     // 16

assert('layout: hoja GSMA y recálculo completo al abrir', ws.name === 'GSMA' && wb.calcProperties.fullCalcOnLoad === true);
assert('layout: A1 "Gross to Net", A2 "GSMA", B2 la fecha del período', val('A1') === 'Gross to Net' && val('A2') === 'GSMA'
  && val('B2') instanceof Date && val('B2').getUTCMonth() === 10 && ws.getCell('B2').numFmt === 'mmm-yy');
assert('layout: rótulos de bloque B3 / X3 / AI3', val('B3') === 'Employee Information' && val('X3') === 'Employee Deductions'
  && val('AI3') === 'Employer Costs');
assert('layout: Recognition Award en M4, entre Referral Bonus y Bonus', val('L4') === 'Referral Bonus'
  && val('M4') === 'Recognition Award' && val('N4') === 'Bonus');
assert('layout: Recognition Award con D0159 / 200360 / ARS', val('M6') === 'D0159' && val('M7') === 200360 && val('M8') === 'ARS');
assert('layout: los encabezados literales, con sus espacios', val('F4') === 'Monthly Salary ' && val('P4') === '13th salary '
  && val('AH4') === 'Net Pay on Payslips          ARS 0,00' && val('AL4') === 'Fixed Accident Insurance              ');
assert('layout: la columna sin título a la derecha de Income Tax no tiene celda', val('AB4') === null && val('AD4') === ' ');
assert('layout: Local Language en W5..Z5 corridos a X5..AA5', val('X5') === 'Jubilacion' && val('AA5') === 'Impuesto a las ganancias');
assert('layout: 42 columnas, la última TOTAL COST', GTN_COLUMNS.length === 42 && val('AP4') === 'TOTAL COST');
assert('layout: fórmulas de la fila 9', formula('W9') === 'SUM(F9:V9)' && formula('AE9') === 'SUM(X9:AD9)'
  && formula('AF9') === 'W9-AE9' && formula('AH9') === '+AF9-AG9' && formula('AO9') === 'SUM(AI9:AN9)'
  && formula('AP9') === 'W9+AO9');
assert('layout: sueldo USD como fórmula anual/13.3', formula('E9') === '133000/13.3');
assert('layout: las fórmulas siguen a la fila (última de empleados)', formula(`W${tot - 1}`) === `SUM(F${tot - 1}:V${tot - 1})`);
assert('layout: totales con SUM según la cantidad de empleados', formula(`E${tot}`) === `SUM(E9:E${tot - 1})`
  && formula(`AP${tot}`) === `SUM(AP9:AP${tot - 1})`);
assert('layout: Referral Bonus y Recognition Award en 0, Commission vacío', val('L9') === 0 && val('M9') === 0 && val('K9') === null);
assert('layout: Days not worked vacío, Director Allowance en 0', val('G9') === null && val('S9') === 0);
assert('layout: las tres de descuento sin título/misc en 0', val('AB9') === 0 && val('AC9') === 0 && val('AD9') === 0);
assert('layout: ER Pension vacío', val('AN9') === null);
assert(`layout: el tipo de cambio en ${EXCHANGE_RATE_CELL}`, EXCHANGE_RATE_CELL === 'BB4' && val('BB4') === 1050 && val('AW4') === 'Exchange Rate');
assert('layout: cuadro — Net Payments, USD y Statutory', formula('BB3') === `+AF${tot}` && formula('BB5') === '+BB3/BB4'
  && formula('BB9') === 'BB5' && formula('BB10') === 'BB6+BB7');
assert('layout: cuadro — Social Security Payments con la detracción',
  formula('BB6') === `+X${tot}+Y${tot}+Z${tot}+AI${tot}+AJ${tot}+AK${tot}+AL${tot}+AM${tot}+Z${det}`);
assert('layout: cuadro — Withholding Tax', formula('BB7') === `+AA${tot}+AB${tot}`);
assert('layout: detracción 3 filas debajo de los totales', val(`X${det}`) === 'Detracción art. 23 Ley 27.541' && val(`Z${det}`) === -2040);
const nuevaFila = 9 + rMix.empleados.findIndex(e => e.nombreAxton === 'PALACIO RODRIGO');
assert('layout: el empleado nuevo va en amarillo con comentario', ws.getCell(`A${nuevaFila}`).fill?.fgColor?.argb === 'FFFFFF00'
  && typeof ws.getCell(`A${nuevaFila}`).note === 'string');
assert('layout: el resultado cacheado de Net Pay es el del control', near(ws.getCell('AF9').result, rMix.empleados[0].netPay));

// ER Net Paid faltante: la celda va vacía (no 0) y en amarillo.
const wbSinEr = buildGtnGsmaWorkbook(ExcelJS, gtnParaExcel(rSinEr));
assert('layout: ER Net Paid faltante queda vacío y en amarillo', wbSinEr.worksheets[0].getCell('AG10').value === null
  && wbSinEr.worksheets[0].getCell('AG10').fill?.fgColor?.argb === 'FFFFFF00');

// Ida y vuelta: el GTN que genera la app es el "GTN anterior" del mes siguiente.
const buf = await wb.xlsx.writeBuffer();
const leido = parseGtnGsma(new Uint8Array(buf));
assert('parser: lee el GTN generado (origen app, por título con Recognition Award corrida)',
  leido.parseMetadata.origen === 'app' && leido.parsedRows.length === n);
assert('parser: período desde B2', leido.parseMetadata.periodo === '2026-11');
assert('parser: filas de encabezado, primer empleado y totales', leido.parseMetadata.filaEncabezado === 4
  && leido.parseMetadata.primeraFilaEmpleado === 9 && leido.parseMetadata.filaTotales === tot);
assert('parser: Employee Number y sueldo anual desde la fórmula', leido.parsedRows[0].employeeNumber === 4011
  && leido.parsedRows[0].usdAnual === 133000 && leido.parsedRows[0].usdOrigen === 'formula');
assert('parser: el nuevo vuelve sin Employee Number ni sueldo USD', leido.parsedRows.some(p => p.nombre === 'PALACIO RODRIGO'
  && p.employeeNumber === null && p.usdOrigen === null));

// Un GTN con el layout de Meta4 (sin Recognition Award), armado a mano.
async function gtnMeta4({ sinEmployeeNumber = false, sinCostCentre = false, usdSuelto = false } = {}) {
  const w = new ExcelJS.Workbook();
  const s = w.addWorksheet('GSMA');
  s.getCell('A1').value = 'Gross to Net';
  s.getCell('A2').value = 'GSMA';
  s.getCell('B2').value = new Date(Date.UTC(2026, 9, 1));
  s.getCell('B2').numFmt = 'mmm-yy';
  const heads = [sinEmployeeNumber ? 'Employee Nr' : 'Employee Number', 'Employee Name', sinCostCentre ? 'CC' : 'Cost Centre',
    'Location Code', 'Monthly Salary in USD', 'Monthly Salary ', 'Days not worked', 'Variable Pay', 'Excedencia',
    'Referral Fee', 'Commission', 'Referral Bonus', 'Bonus'];
  heads.forEach((h, i) => { s.getRow(4).getCell(i + 1).value = h; });
  s.getCell('A5').value = 'Local Language ';
  s.getCell('A6').value = 'Element Code';
  s.getCell('A7').value = 'GL Account';
  s.getCell('A8').value = 'Currency';
  s.getCell('A9').value = 4011; s.getCell('B9').value = 'SANGUINETTI JAVIER'; s.getCell('C9').value = 'CC-1'; s.getCell('D9').value = 'AR-BA';
  s.getCell('E9').value = usdSuelto ? 10000 : { formula: '133000/13.3', result: 10000 };
  s.getCell('F9').value = 1000;
  s.getCell('A10').value = 4012; s.getCell('B10').value = 'ALBELLA GUSTAVO'; s.getCell('C10').value = 'CC-2'; s.getCell('D10').value = 'AR-BA';
  s.getCell('E10').value = { formula: '66500/13.3', result: 5000 };
  s.getCell('F10').value = 500;
  s.getCell('E11').value = { formula: 'SUM(E9:E10)', result: 15000 };
  s.getCell('F11').value = { formula: 'SUM(F9:F10)', result: 1500 };
  return new Uint8Array(await w.xlsx.writeBuffer());
}
const m4 = parseGtnGsma(await gtnMeta4());
assert('parser: lee el layout de Meta4 (origen meta4, 2 empleados, totales en la 11)', m4.parseMetadata.origen === 'meta4'
  && m4.parsedRows.length === 2 && m4.parseMetadata.filaTotales === 11 && m4.parseMetadata.periodo === '2026-10');
const m4Suelto = parseGtnGsma(await gtnMeta4({ usdSuelto: true }));
assert('parser: sueldo USD sin fórmula → se lee el valor y se marca', m4Suelto.parsedRows[0].usdOrigen === 'valor'
  && m4Suelto.parsedRows[0].usdValor === 10000 && m4Suelto.parseMetadata.usdSinFormula === 1);
let errEN = null;
try { parseGtnGsma(await gtnMeta4({ sinEmployeeNumber: true })); } catch (e) { errEN = e.message; }
assert('parser: sin "Employee Number" corta con un mensaje que lo nombra', /Employee Number/.test(errEN || ''));
let errCC = null;
try { parseGtnGsma(await gtnMeta4({ sinCostCentre: true })); } catch (e) { errCC = e.message; }
assert('parser: sin la columna Cost Centre corta y la nombra', /Cost Centre/.test(errCC || ''));

// El .xls que exporta Axton (página web sin datos) corta con el mensaje de la spec.
const web = new TextEncoder().encode('<html xmlns:v="urn:schemas-microsoft-com:vml"><frameset rows="*,39"><frame src="x.files/sheet001.htm"></frameset></html>');
let errWeb = null;
try { readTabuladoAxtonGtn(web); } catch (e) { errWeb = e.message; }
assert('Tabulado: el .xls web de Axton corta con "Abrilo en Excel y guardalo como .xlsx"', errWeb === ERROR_XLS_WEB_AXTON);
let errWebGtn = null;
try { parseGtnGsma(web); } catch (e) { errWebGtn = e.message; }
assert('GTN anterior: una página web sin datos también corta con un mensaje claro', /página web/.test(errWebGtn || ''));

// ── Auditoría 1: columnas con forma de concepto sin «código - nombre» ───────

{
  const meta = metaDe(rowsOk);
  const conColumna = (cols) => ({ ...meta, columnasNoConcepto: cols });
  const sinGuion = { letra: 'Z', rotulo: '880027 Contribucion AFIP', sub: 'Imp', tipo: 'sinClasificar', celdasConImporte: 2, importe: 50 };
  const rayaLarga = { letra: 'Z', rotulo: '880027 – Contribucion AFIP', sub: 'Imp', tipo: 'sinClasificar', celdasConImporte: 2, importe: 50 };
  const desconocida = { letra: 'AA', rotulo: 'Ajuste manual', sub: 'Imp', tipo: 'sinClasificar', celdasConImporte: 1, importe: 10 };
  const salFamConPlata = { letra: 'I', rotulo: 'Salario Familiar', sub: 'Imp', tipo: 'sinClasificar', celdasConImporte: 1, importe: 300 };
  const salFamVacia = { ...salFamConPlata, celdasConImporte: 0, importe: 0 };
  const totalMenos = { letra: 'AF', rotulo: 'TOTAL -', sub: null, tipo: 'ignorada', celdasConImporte: 2, importe: 900 };

  for (const [nombre, col] of [['sin guion', sinGuion], ['con raya larga', rayaLarga]]) {
    const m = motivosGtnGsma({ tabMeta: conColumna([col]), config: DEFAULT_GTN_GSMA_CONFIG(), tipoCambio: 1050 });
    assert(`gate: columna ${nombre} que empieza con un código frena, nombrando la columna`,
      m.length === 1 && m[0].kind === 'concepto' && m[0].detail.includes('880027'));
    const r = correr(rowsOk, { meta: conColumna([col]) });
    assert(`run(): columna ${nombre} → { error } (no sale un GTN sin ese importe)`,
      typeof r.error === 'string' && r.error.includes('880027') && /código - nombre/.test(r.error));
  }
  const empiezaConCodigoVacia = { ...sinGuion, celdasConImporte: 0, importe: 0 };
  assert('una columna que empieza con un código frena aunque venga vacía', columnasNoConceptoGtn(conColumna([empiezaConCodigoVacia])).frenan.length === 1);
  assert('una columna desconocida con importes frena', columnasNoConceptoGtn(conColumna([desconocida])).frenan.length === 1);
  assert('una columna desconocida sin dato del lector (con subencabezado de importe) frena',
    columnasNoConceptoGtn({ columnasSinClasificar: [{ letra: 'AA', rotulo: 'Ajuste manual', sub: 'Imp' }] }).frenan.length === 1);
  assert('TOTAL - con importes no frena ni avisa (es del export)', (() => {
    const x = columnasNoConceptoGtn(conColumna([totalMenos])); return x.frenan.length === 0 && x.avisan.length === 0;
  })());
  const rSf = correr(rowsOk, { meta: conColumna([salFamConPlata]) });
  assert('Salario Familiar con importe: no frena, sale como aviso', !rSf.error
    && rSf.avisos.some(a => a.tipo === 'noConcepto' && a.what.includes('Salario Familiar')));
  assert('…y su chequeo de lectura no sale en verde', rSf.tabLectura.noConceptoConImporte.length === 1);
  const rSfv = correr(rowsOk, { meta: conColumna([salFamVacia]) });
  assert('Salario Familiar vacía (lo de todos los meses): ni frena ni avisa', !rSfv.error
    && !rSfv.avisos.some(a => a.tipo === 'noConcepto') && rSfv.tabLectura.noConceptoOk.length === 1);

  // El lector del GTN cuenta los importes de esas columnas en un Tabulado de verdad.
  const aoa = [
    ['Legajo', 'Apellido y Nombre', '1000 - Sueldo Basico', '880027 Contribucion AFIP', 'Salario Familiar'],
    [null, null, 'Imp', 'Imp', 'Imp'],
    ['1', 'SANGUINETTI JAVIER', 1000, 25, null],
    ['2', 'ALBELLA GUSTAVO', 500, 25, null],
    ['TOTAL GENERAL', null, 1500, 50, null],
  ];
  const wbT = globalThis.XLSX.utils.book_new();
  globalThis.XLSX.utils.book_append_sheet(wbT, globalThis.XLSX.utils.aoa_to_sheet(aoa), 'Liquidaciones.20261130.120000.1');
  const bufT = globalThis.XLSX.write(wbT, { type: 'array', bookType: 'xlsx' });
  const leidoT = readTabuladoAxtonGtn(bufT);
  const colZ = leidoT.parseMetadata.columnasNoConcepto.find(c => c.rotulo.startsWith('880027'));
  const colSf = leidoT.parseMetadata.columnasNoConcepto.find(c => c.rotulo === 'Salario Familiar');
  assert('lector: cuenta los importes de la columna sin guion (2 celdas, 50)', colZ?.celdasConImporte === 2 && colZ.importe === 50);
  assert('lector: Salario Familiar vacía cuenta 0 (no el TOTAL GENERAL)', colSf?.celdasConImporte === 0);
  assert('lector + gate: ese Tabulado frena por la columna sin guion',
    motivosGtnGsma({ tabMeta: leidoT.parseMetadata, config: DEFAULT_GTN_GSMA_CONFIG(), tipoCambio: 1 })
      .some(m => m.detail.includes('880027')));
}

// ── Auditoría 3: el titular no dice "cierra en los N" si falta alguno ───────

{
  const s = summarizeGtnGsma(rSinEr);
  assert('summarize: con un empleado sin ER Net Paid el titular lo cuenta aparte',
    s.headline.includes('1 de 2') && s.headline.includes('1 sin comparar') && !s.headline.includes('en los 2'));
  assert('summarize: y no sale success', s.status === 'warning');
  const sDif2 = summarizeGtnGsma(correr([liq('1', 'SANGUINETTI JAVIER', 1000, { erDelta: 5 }), liq('2', 'ALBELLA GUSTAVO', 500, { sinEr: true })]));
  assert('summarize: cierran, no cierran y sin comparar, los tres', sDif2.headline.includes('0 de 2')
    && sDif2.headline.includes('1 no cierra') && sDif2.headline.includes('1 sin comparar'));
}

// ── Auditoría 4: avisos del lector y TOTAL GENERAL ──────────────────────────

{
  const meta = { ...metaDe(rowsOk), avisos: [
    'El archivo trae 2 hojas y se leyó sólo "Liquidaciones.20261130.120000.1". No se leyeron: "Hoja2".',
    '1 fila con datos no tiene legajo y no se leyeron (fila 9).',
    'El Tabulado vino sólo con importes: no trae columnas "Cant", así que …',
    '1 columna con importes no se pudo atribuir a ningún concepto: I "Salario Familiar". …',
  ] };
  const r = correr(rowsOk, { meta });
  const textos = r.avisos.map(a => a.what).join(' | ');
  assert('run(): propaga los avisos del lector (hojas no leídas, filas sin legajo)',
    textos.includes('se leyó sólo') && textos.includes('no tiene legajo'));
  assert('run(): no propaga "sólo importes" ni el de columnas no atribuibles (los dice con más precisión)',
    !textos.includes('sólo con importes') && !textos.includes('no se pudo atribuir'));
  const sinTg = correr(rowsOk, { meta: { ...metaDe(rowsOk), totalGeneral: null } });
  assert('run(): sin TOTAL GENERAL → aviso, y el chequeo no queda en verde',
    sinTg.avisos.some(a => a.tipo === 'totalGeneral' && /TOTAL GENERAL/.test(a.what)) && sinTg.tabLectura.totalGeneral === false);
}

// ── Auditoría 5: la fila GL Account en formato General ──────────────────────

assert('layout: GL Account en formato General (se ve 200100, no 200.100,00)',
  ws.getCell('F7').numFmt === 'General' && ws.getCell('M7').numFmt === 'General' && val('F7') === 200100);

// ── Auditoría 6: la palabra de más no se resuelve por orden ─────────────────

{
  const a1 = cruzarPorNombre(gp(['FALCIONI JULIO CESAR', 'FALCIONI JULIO ALBERTO']), ax(['FALCIONI JULIO']));
  const a2 = cruzarPorNombre(gp(['FALCIONI JULIO ALBERTO', 'FALCIONI JULIO CESAR']), ax(['FALCIONI JULIO']));
  assert('cruce: dos filas del GTN con palabra de más hacia el mismo empleado → las dos "no cruzó, varios"',
    a1.prevEstado.every(e => e.tipo === 'parecidoVarios') && a1.parecidos.size === 0 && a1.match.size === 0);
  assert('…en cualquier orden', a2.prevEstado.every(e => e.tipo === 'parecidoVarios') && a2.parecidos.size === 0);
  assert('…y el empleado de Axton queda marcado con las dos filas', a1.parecidoAmbiguo.get(0)?.length === 2);

  const b = cruzarPorNombre(gp(['SILVA SANTIAGO MARTIN']), ax(['SILVA SANTIAGO', 'SILVA MARTIN']));
  assert('cruce: un GTN con palabra de más que contiene a dos de Axton → "no cruzó, varios candidatos"',
    b.prevEstado[0].tipo === 'parecidoVarios' && b.prevEstado[0].parecidos.length === 2 && b.parecidos.size === 0);

  const prevA = [
    { fila: 9, employeeNumber: 4021, nombre: 'FALCIONI JULIO CESAR', costCentre: 'CC-1', locationCode: 'AR-BA', usdAnual: 13300, usdValor: null, usdOrigen: 'formula' },
    { fila: 10, employeeNumber: 4022, nombre: 'FALCIONI JULIO ALBERTO', costCentre: 'CC-1', locationCode: 'AR-BA', usdAnual: 13300, usdValor: null, usdOrigen: 'formula' },
  ];
  const rA = correr([liq('1', 'FALCIONI JULIO', 1000)], { prev: prevA });
  assert('run(): las dos filas del GTN salen "no cruzó (varios candidatos)", ninguna "no vino"',
    rA.cruce.filter(c => c.resultado === 'parecidoVarios').length === 2 && !rA.cruce.some(c => c.resultado === 'noVino'));
  assert('run(): el empleado de Axton queda como nuevo, sin Employee Number', rA.cruce.some(c => c.resultado === 'nuevo'
    && c.axton === 'FALCIONI JULIO') && rA.empleados[0].employeeNumber === null);
  const rB = correr([liq('1', 'SILVA SANTIAGO', 1000), liq('2', 'SILVA MARTIN', 500)],
    { prev: [{ ...prevA[0], nombre: 'SILVA SANTIAGO MARTIN' }] });
  assert('run(): el GTN con dos candidatos sale "no cruzó (varios)", no "no vino"',
    rB.cruce.some(c => c.resultado === 'parecidoVarios' && c.gtn === 'SILVA SANTIAGO MARTIN')
    && !rB.cruce.some(c => c.resultado === 'noVino'));
}

// ── Auditoría 7: una columna guardada que ya no existe frena ─────────────────

{
  const cfgVieja = { asignaciones: { ...DEFAULT_GTN_GSMA_CONFIG().asignaciones,
    '1000': { columna: 'columnaQueYaNoExiste', origen: 'analista', fecha: '2026-10-01' } } };
  const r = resolverConceptos(conceptosDe(['1000']), cfgVieja)[0];
  assert('asignación guardada a una columna que ya no existe → sin asignar, aunque 1000 sea semilla', r.estado === 'sin_asignar');
  const m = motivosGtnGsma({ tabMeta: metaDe(rowsOk), config: cfgVieja, tipoCambio: 1050 });
  assert('…y frena', m.some(x => x.kind === 'concepto' && x.detail.includes('1000')));
}

// ── Auditoría 8: '007' y '7', y las ramas de { error } ──────────────────────

{
  const r = correr([liq('007', 'SANGUINETTI JAVIER', 1000), liq('7', 'SANGUINETTI JAVIER', 200), liq('2', 'ALBELLA GUSTAVO', 500)]);
  const san = r.empleados.find(e => e.nombre === 'SANGUINETTI JAVIER');
  assert("'007' y '7' con la clave default son un empleado y se suman", r.empleados.length === 2
    && near(san.valores.monthlySalary, 1200) && san.liquidaciones === 2 && near(san.diferencia, 0));
  const base = { tabAxtonMeta: metaDe(rowsOk), gtnPrevRows: GTN_PREV, gtnPrevMeta: {}, gtnConfig: DEFAULT_GTN_GSMA_CONFIG(), gtnTipoCambio: 1050 };
  assert('run(): sin Tabulado → { error }', /Tabulado/.test(runGtnGsma([], [], base).error || ''));
  assert('run(): Tabulado sin conceptos → { error }',
    /conceptos/.test(runGtnGsma(rowsOk, [], { ...base, tabAxtonMeta: { conceptos: [] } }).error || ''));
  assert('run(): sin GTN anterior → { error }', /GTN del mes anterior/.test(runGtnGsma(rowsOk, [], { ...base, gtnPrevRows: [] }).error || ''));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
