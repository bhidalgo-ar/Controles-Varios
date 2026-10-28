// rendVsAsientoCcCode.test.js — Rendimiento vs Asiento: CC por código, provisiones
// SAC del Rendimiento y centros que se reparten persona por persona.
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/rendVsAsientoCcCode.test.js
//
// La Contabilidad Desglosada parte los centros en sub-centros con nombre propio
// ("Asesoramiento BAN" es el 04.01): por nombre ya no matchean con el
// Rendimiento, por código sí. Lo que este test fija:
//   - el match por código es por SEGMENTO, no por texto: el 1 no agarra el 10;
//   - el listado de CC x Empleado, con centros "por persona" declarados, pisa
//     SÓLO esos centros: pisar todo taparía diferencias reales;
//   - lo que no se pudo repartir no se completa con nada y sale como aviso;
//   - una config guardada antes de este cambio toma la semilla, y una que
//     guardó la lista vacía se respeta vacía (D-039).
//
// Datos inventados; nombres de la lista de Banfield (CLAUDE.md).

import * as XLSX from './node_modules/xlsx/xlsx.mjs';
globalThis.XLSX = XLSX;
// rendVsAsiento.js importa módulos de UI que se enganchan al `document` al cargar.
globalThis.document = { addEventListener: () => {} };

const { runRendVsAsiento, summarizeRendVsAsiento, resolveRvaConfig, ccCodeSegments, DEFAULT_RVA_CONFIG } =
  await import('./js/controls/rendVsAsiento.js');
const { autoDetectRendimientoMapping, nombrarColumnasSinTitulo } = await import('./js/parsers/rendimientoParser.js');
const { parseCcXEmpleado } = await import('./js/parsers/ccXEmpleadoExcel.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}
const casi = (a, b) => a !== null && a !== undefined && Math.abs(a - b) < 0.005;

// ── Armado ───────────────────────────────────────────────────────────────────

const REND = { ccCodeColumn: 'CC', ccNameColumn: 'Nombre CC', precioColumn: 'Precio' };
const rendFila = (cc, nombre, precio) => ({ CC: cc, 'Nombre CC': nombre, Precio: precio });

/** Una fila de CONTA de PRECIO (cuenta 5208001). */
const conta = (legajo, ccCode, ccNombre, debe, apellido = 'SANGUINETTI', nombre = 'JAVIER') => ({
  id_empleado: legajo, id_centro_costo: ccCode, cc_nombre: ccNombre,
  cuenta_contab: '5208001', n_cuenta_contable: 'REMUNERACIONES',
  id_concepto: '1003', nombre_largo: 'SUELDO', debe, haber: 0,
  apellido_1: apellido, nombre,
});

const BASE = {
  cuentaCats: { precio: ['5208001'], estimulo: [], cargas: [], provMes: [] },
  provCcssConcepts: [],
  ccRedirects: [],
};

const correr = (rendRows, contaRows, extra = {}) =>
  runRendVsAsiento(rendRows, [], { rend: REND, contaRows, ccXEeRows: [], ...extra });
const fila = (res, nombre) => res.rows.find(r => r.ccName === nombre);
const soloConta = (res, nombre) => res.ccsSoloEnConta.find(o => o.ccName === nombre);

// ── 1) Segmentos: ceros a la izquierda y prefijo por segmento ────────────────
{
  assert("ccCodeSegments: '04.01' → ['4','1']", JSON.stringify(ccCodeSegments('04.01')) === '["4","1"]');
  assert("ccCodeSegments: el número 3 → ['3']", JSON.stringify(ccCodeSegments(3)) === '["3"]');
  assert("ccCodeSegments: '00' → ['0'] (no queda vacío)", JSON.stringify(ccCodeSegments('00')) === '["0"]');
  assert('ccCodeSegments: sin código → null', ccCodeSegments('') === null && ccCodeSegments(null) === null);
}

// ── 2) '1' NO agarra '10' ni '13'; sí agarra '01.02' ─────────────────────────
{
  const res = correr(
    [rendFila('1', 'Uno', 300), rendFila('10', 'Diez', 50), rendFila('13', 'Trece', 70)],
    [
      conta('1', '1',     'Finanzas viejo', 100),
      conta('2', '01.02', 'Finanzas 003',   200, 'ALBELLA', 'GUSTAVO'),
      conta('3', '10',    'Diez',            50, 'FALCIONI', 'JULIO CESAR'),
      conta('4', '13',    'Trece',           70, 'SILVA', 'SANTIAGO'),
    ],
    { rvaConfig: { ...BASE, ccCodeMap: [{ code: '1', to: 'Uno' }], ccPorPersona: [] } },
  );
  assert("'1' junta el 1 y el 01.02 en «Uno» (100 + 200)", casi(fila(res, 'Uno').cPrecio, 300));
  assert("'1' no agarra el 10: «Diez» sigue con lo suyo", casi(fila(res, 'Diez').cPrecio, 50));
  assert("'1' no agarra el 13: «Trece» sigue con lo suyo", casi(fila(res, 'Trece').cPrecio, 70));
  assert('nada queda sólo en CONTA', res.ccsSoloEnConta.length === 0);
  const det = res.meta.detalle.find(d => d.idEmpleado === '2');
  assert('el detalle conserva el CC original de la fila traducida por código', det.ccOriginal === 'Finanzas 003');
}

// ── 3) '04' agarra '04.01', '4' y '004.8'; gana el más específico ────────────
{
  const contaRows = [
    conta('1', '04.01', 'Asesoramiento BAN', 100),
    conta('2', 4,       'Asesoramiento',     10, 'ALBELLA', 'GUSTAVO'),
    conta('3', '004.8', 'Asesoramiento MIN', 1, 'LUCCHETTI', 'CRISTIAN'),
    conta('4', '04.03', 'Asesoramiento FIS', 1000, 'ERVITI', 'WALTER'),
  ];
  const rend = [rendFila('32', 'Asesoramiento', 111), rendFila('33', 'Fiscal', 1000)];
  // La general va PRIMERO en la lista: el más específico gana igual, no por orden.
  const res = correr(rend, contaRows, { rvaConfig: { ...BASE,
    ccCodeMap: [{ code: '04', to: 'Asesoramiento' }, { code: '04.03', to: 'Fiscal' }], ccPorPersona: [] } });
  assert("'04' junta 04.01 + 4 + 004.8 (100 + 10 + 1)", casi(fila(res, 'Asesoramiento').cPrecio, 111));
  assert("'04.03 → Fiscal' le gana a '04 → Asesoramiento'", casi(fila(res, 'Fiscal').cPrecio, 1000));
  assert('sin diferencias y nada sólo en CONTA',
    res.rows.every(r => casi(r.dPrecio, 0)) && res.ccsSoloEnConta.length === 0);
}

// ── 4) Lo que no matchea ningún código no se completa: sale sólo en CONTA ───
{
  const res = correr([rendFila('32', 'Asesoramiento', 100)], [
    conta('1', '04.01', 'Asesoramiento BAN', 100),
    conta('2', '99',    'Centro Nuevo',      40, 'URZI', 'AGUSTIN'),
  ], { rvaConfig: { ...BASE, ccCodeMap: [{ code: '04', to: 'Asesoramiento' }], ccPorPersona: [] } });
  assert('el código sin entrada sale «sólo en CONTA» con su nombre', casi(soloConta(res, 'Centro Nuevo')?.cPrecio, 40));
}

// ── 5) Config guardada vieja: sin la clave → semilla; con [] → vacía ─────────
{
  const vieja = { ...BASE };   // como se guardaba antes: sin ccCodeMap ni ccPorPersona
  const r1 = resolveRvaConfig(vieja);
  assert('sin ccCodeMap guardado, toma la semilla', JSON.stringify(r1.ccCodeMap) === JSON.stringify(DEFAULT_RVA_CONFIG.ccCodeMap));
  assert("sin ccPorPersona guardado, toma la semilla (['13'])", JSON.stringify(r1.ccPorPersona) === '["13"]');
  const r2 = resolveRvaConfig({ ...BASE, ccCodeMap: [], ccPorPersona: [] });
  assert('ccCodeMap guardado como [] se respeta vacío', Array.isArray(r2.ccCodeMap) && r2.ccCodeMap.length === 0);
  assert('ccPorPersona guardado como [] se respeta vacío', Array.isArray(r2.ccPorPersona) && r2.ccPorPersona.length === 0);
  assert('resolver no toca la semilla (devuelve copia)', r1.ccCodeMap !== DEFAULT_RVA_CONFIG.ccCodeMap);

  const rows = [conta('1', '04.01', 'Asesoramiento BAN', 100)];
  const rend = [rendFila('32', 'Asesoramiento', 100)];
  const conVieja = correr(rend, rows, { rvaConfig: vieja });
  assert('corrida con config vieja: el 04.01 va a Asesoramiento por la semilla',
    casi(fila(conVieja, 'Asesoramiento').cPrecio, 100));
  const conVacia = correr(rend, rows, { rvaConfig: { ...BASE, ccCodeMap: [] } });
  assert('corrida con ccCodeMap []: el 04.01 queda por nombre, sólo en CONTA',
    fila(conVacia, 'Asesoramiento').cPrecio === null && casi(soloConta(conVacia, 'Asesoramiento BAN')?.cPrecio, 100));
  assert('la config aplicada que queda en el resultado trae las dos claves',
    Array.isArray(conVieja.meta.config.ccCodeMap) && Array.isArray(conVieja.meta.config.ccPorPersona));
}

// ── 6) ccPorPersona: el listado pisa SÓLO esos centros ──────────────────────
{
  // Legajo 1: director (centro 13), el listado lo manda a Servicios Legales.
  // Legajo 2: la Contabilidad lo tiene en Servicios Comunes (10) y el listado
  // en Servicios Legales — una diferencia real que tiene que seguir saltando.
  const contaRows = [
    conta('1', '13', 'Directores',        500),
    conta('2', '10', 'Servicios Comunes',  80, 'CVITANICH', 'DARIO'),
  ];
  const listado = [
    { id_empleado: '1', id_centro_costo: '13', centro_costo: 'Servicios Legales' },
    { id_empleado: '2', id_centro_costo: '10', centro_costo: 'Servicios Legales' },
  ];
  const rend = [rendFila('34', 'Servicios Legales', 580), rendFila('51', 'Servicios Comunes', 0)];
  const cfg = { ...BASE, ccCodeMap: [{ code: '10', to: 'Servicios Comunes' }], ccPorPersona: ['13'] };

  const res = correr(rend, contaRows, { ccXEeRows: listado, rvaConfig: cfg });
  assert('el director va al área del listado (Servicios Legales: 500)', casi(fila(res, 'Servicios Legales').cPrecio, 500));
  assert('el legajo del centro 10 NO se pisa: sigue en Servicios Comunes (80)', casi(fila(res, 'Servicios Comunes').cPrecio, 80));
  assert('la diferencia real sigue saltando (−80 / +80)',
    casi(fila(res, 'Servicios Legales').dPrecio, -80) && casi(fila(res, 'Servicios Comunes').dPrecio, 80));
  assert('Directores no queda sólo en CONTA y no hay avisos',
    res.ccsSoloEnConta.length === 0 && res.avisosReparto.length === 0 && res.summary.legajosSinRepartir === 0);
  assert('el detalle del director conserva «Directores» como CC original',
    res.meta.detalle.find(d => d.idEmpleado === '1').ccOriginal === 'Directores');

  // Con ccPorPersona vacío, el override es el de siempre: pisa todas las filas.
  const comoHoy = correr(rend, contaRows, { ccXEeRows: listado, rvaConfig: { ...cfg, ccPorPersona: [] } });
  assert('con ccPorPersona vacío el listado pisa todo (Servicios Legales: 580, cierra)',
    casi(fila(comoHoy, 'Servicios Legales').cPrecio, 580) && casi(fila(comoHoy, 'Servicios Legales').dPrecio, 0));
  assert('con ccPorPersona vacío no hay avisos de reparto', comoHoy.avisosReparto.length === 0);

  // La clave de legajo es la del cliente: '007' en el listado es el '7' de la CONTA.
  const ceros = correr([rendFila('34', 'Servicios Legales', 500)], [conta('7', '13', 'Directores', 500)], {
    ccXEeRows: [{ id_empleado: '007', id_centro_costo: '13', centro_costo: 'Servicios Legales' }], rvaConfig: cfg,
  });
  assert("'007' del listado reparte al legajo '7' de la CONTA", casi(fila(ceros, 'Servicios Legales').cPrecio, 500));
}

// ── 7) Legajo de un centro por persona que no está en el listado ────────────
{
  const res = correr([rendFila('34', 'Servicios Legales', 500)], [
    conta('1', '13', 'Directores', 500),
    conta('8', '13', 'Directores', 300, 'DATOLO', 'JESUS'),
    conta('8', '13', 'Directores',  20, 'DATOLO', 'JESUS'),
  ], {
    ccXEeRows: [{ id_empleado: '1', id_centro_costo: '13', centro_costo: 'Servicios Legales' }],
    rvaConfig: { ...BASE, ccCodeMap: [], ccPorPersona: ['13'] },
  });
  assert('el que está en el listado se reparte', casi(fila(res, 'Servicios Legales').cPrecio, 500));
  assert('el que no está queda visible: «Directores» sólo en CONTA (300 + 20)', casi(soloConta(res, 'Directores')?.cPrecio, 320));
  assert('un aviso, por 1 legajo (no por fila), motivo «fuera del listado»',
    res.avisosReparto.length === 1 && res.avisosReparto[0].legajos === 1
    && res.avisosReparto[0].motivo === 'fuera_del_listado' && res.summary.legajosSinRepartir === 1);
  assert('el aviso dice qué centro y qué hacer',
    res.avisosReparto[0].texto.includes('13') && res.avisosReparto[0].texto.includes('Directores')
    && res.avisosReparto[0].queHacer.includes('no figura en el listado'));
}

// ── 8) Sin listado y con filas del centro 13 → aviso ─────────────────────────
{
  const res = correr([rendFila('34', 'Servicios Legales', 0)], [
    conta('1', '13', 'Directores', 500),
    conta('8', '13', 'Directores', 300, 'DATOLO', 'JESUS'),
  ]);   // sin rvaConfig: la semilla, que reparte el 13 por persona
  assert('sin listado, Directores sale entero sólo en CONTA (800)', casi(soloConta(res, 'Directores')?.cPrecio, 800));
  assert('sin listado: un aviso por 2 legajos, motivo «sin listado»',
    res.avisosReparto.length === 1 && res.avisosReparto[0].legajos === 2 && res.avisosReparto[0].motivo === 'sin_listado');
  assert('el aviso pide subir el listado', res.avisosReparto[0].queHacer.includes('subilo'));
  const s = summarizeRendVsAsiento(res);
  assert('el semáforo sigue contando centros de costo', s.unit === 'cc' && s.unitsTotal === 1);
}

// ── 9) Filas sin código: exactamente como hoy (por nombre y redirects) ───────
{
  const res = correr([rendFila('34', 'Servicios Legales', 100)], [
    { ...conta('1', '', 'Finanzas', 100) },
  ], { rvaConfig: { ...BASE, ccRedirects: [{ from: 'Finanzas', to: 'Servicios Legales' }] } });
  assert('sin código, el redirect por nombre sigue andando', casi(fila(res, 'Servicios Legales').cPrecio, 100));
  assert('sin código no hay aviso de reparto', res.avisosReparto.length === 0);
}

// ── 10) Rendimiento: columnas SAC renombradas (y las de siempre) ─────────────
{
  const nuevos = nombrarColumnasSinTitulo(['', 'CENTRO COSTO', 'PRECIO', 'ASIGNACIÓN ESTIMULO', 'RETIROS',
    'CARGAS SOCIALES (Sin sac)', 'PROVISIÓN SAC MES', 'PROVISIÓN SAC CARGAS SOCIALES MES', 'COSTO TOTAL']);
  const m = autoDetectRendimientoMapping(nuevos);
  assert('PROVISIÓN SAC MES → provMesColumn', m.provMesColumn === 'PROVISIÓN SAC MES');
  assert('PROVISIÓN SAC CARGAS SOCIALES MES → provCcssColumn', m.provCcssColumn === 'PROVISIÓN SAC CARGAS SOCIALES MES');
  const sinTilde = autoDetectRendimientoMapping(['', 'CENTRO COSTO', 'PRECIO', 'Provision SAC Mes', 'Provision SAC Cargas Sociales Mes']);
  assert('sin tilde y en minúscula también', sinTilde.provMesColumn === 'Provision SAC Mes'
    && sinTilde.provCcssColumn === 'Provision SAC Cargas Sociales Mes');
  const viejos = autoDetectRendimientoMapping(['', 'CENTRO COSTO', 'PRECIO', 'PROVISIÓN MES', 'PROVISIÓN CARGAS SOCIALES MES']);
  assert('los nombres viejos siguen andando', viejos.provMesColumn === 'PROVISIÓN MES'
    && viejos.provCcssColumn === 'PROVISIÓN CARGAS SOCIALES MES');
}

// ── 11) CC x Empleado: el listado de asignación, en varias hojas ─────────────
const libro = (hojas) => {
  const wb = XLSX.utils.book_new();
  for (const [nombre, aoa] of hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nombre);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
};
{
  const H = ['ID_EMPLEADO', 'FEC_ALTA_EMPLEADO', 'ID_CC_CONTA', 'ID_CONTA', 'ID RENDIMIENTO', 'RENDIMIENTO', 'ID_EMPRESA'];
  const ab = libro([
    ['Activos', [
      [...H, null],
      [1, 40000, '13',    '-X-', 34, 'Servicios Legales', 1, 'nota al costado'],
      [2, 40100, '04.01', '-Y-', 32, 'Asesoramiento',     1],
    ]],
    ['Bajas', [
      H,
      [3, 39000, '3', '-Z-', 41, 'Administración', 1],
    ]],
  ]);
  const { parsedRows, parseMetadata } = parseCcXEmpleado(ab);
  assert('listado: lee las dos hojas (3 empleados)', parsedRows.length === 3);
  assert('listado: área = RENDIMIENTO, centro = ID_CC_CONTA',
    parsedRows[0].id_empleado === '1' && parsedRows[0].centro_costo === 'Servicios Legales' && parsedRows[0].id_centro_costo === '13');
  assert('listado: la hoja Bajas también entra', parsedRows[2].centro_costo === 'Administración');
  assert('listado: la metadata dice qué hojas leyó', JSON.stringify(parseMetadata.hojas) === '["Activos","Bajas"]');
}
{
  const ab = libro([['CC x Empleado', [
    ['EMPLEADO', 'APELLIDO Y NOMBRE', 'ID_CENTRO_COSTO', 'CENTRO_COSTO'],
    ['1', 'SANGUINETTI JAVIER', '0034', 'Servicios Legales'],
    ['2', 'ALBELLA GUSTAVO',    '',     ''],
  ]]]);
  const { parsedRows } = parseCcXEmpleado(ab);
  assert('formato de siempre: igual que antes (salta la fila sin CC)',
    parsedRows.length === 1 && parsedRows[0].id_empleado === '1'
    && parsedRows[0].id_centro_costo === '0034' && parsedRows[0].centro_costo === 'Servicios Legales');
}
{
  const ab = libro([['Hoja1', [['LEGAJO', 'AREA'], ['1', 'Servicios Legales']]]]);
  let msg = '';
  try { parseCcXEmpleado(ab); } catch (e) { msg = e.message; }
  assert('formato desconocido: error que dice qué esperaba y qué encontró',
    msg.includes('EMPLEADO') && msg.includes('ID_EMPLEADO') && msg.includes('LEGAJO, AREA'));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
