// rendVsAsientoDimension.test.js — Rendimiento vs Asiento: el legajo de la
// dimensión financiera (ID_CONTA) tiene que tener 3 dígitos.
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/rendVsAsientoDimension.test.js
//
// Marval arma la dimensión con el legajo en el 7mo tramo (separado por guiones).
// Lo que este test fija:
//   - una dimensión con un legajo de 3 dígitos no avisa;
//   - una con más o menos dígitos, o con letras, avisa una sola vez por
//     dimensión, con los legajos y la cantidad de filas;
//   - una dimensión vacía, "Null" o con SIN_ASIGNAR no tiene legajo y no avisa;
//   - el aviso no toca la comparación de importes ni el semáforo.
//
// Datos inventados: legajos 9001/9002/9003 y nombres de la lista de Banfield.

globalThis.document = { addEventListener: () => {} };

const { runRendVsAsiento, summarizeRendVsAsiento } = await import('./js/controls/rendVsAsiento.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const REND = {
  ccCodeColumn: 'CC', ccNameColumn: 'Nombre CC',
  precioColumn: 'Precio', cargasColumn: 'Cargas', provMesColumn: 'ProvMes', provCcssColumn: 'ProvCcss',
};
const CFG = {
  cuentaCats: { precio: ['5208001'], estimulo: [], cargas: [], provMes: [] },
  provCcssConcepts: [], ccRedirects: [],
  ccCodeMap: [{ code: '10', to: 'Servicios Comunes' }], ccPorPersona: [],
};
/** Dimensión con el legajo en el 7mo tramo. */
const DIM = (legajo) => `1-01-AR-02-03-04-${legajo}-00`;
const conta = (legajo, idConta, debe, apellido = 'SANGUINETTI') => ({
  id_empleado: legajo, id_centro_costo: '10', cc_nombre: 'Servicios Comunes', id_conta: idConta,
  cuenta_contab: '5208001', n_cuenta_contable: 'CUENTA', id_concepto: '1003', nombre_largo: 'CONCEPTO',
  debe, haber: 0, apellido_1: apellido, nombre: 'X',
});

const CONTA = [
  conta('9001', DIM('901'), 100),
  conta('9002', DIM('9002'), 200, 'ALBELLA'),
  conta('9002', DIM('9002'), 50,  'ALBELLA'),
  conta('9003', DIM('12'), 300, 'FALCIONI'),
  conta('9003', DIM('9A3'), 10, 'FALCIONI'),
  conta('',     DIM('SIN_ASIGNAR'), 40),
  conta('9001', 'Null', 5),
  conta('9001', '', 5),
  conta('9001', '1-01-AR', 5),
];
const REND_ROWS = [{ CC: '51', 'Nombre CC': 'Servicios Comunes', Precio: 715, Cargas: 0, ProvMes: 0, ProvCcss: 0 }];

const res = runRendVsAsiento(REND_ROWS, [], { rend: REND, contaRows: CONTA, ccXEeRows: [], rvaConfig: CFG });
const mal = res.dimensionesLegajoMal;
assert('tres dimensiones avisadas (4 dígitos, 2 dígitos, con letra)', mal.length === 3 && res.summary.dimensionesLegajoMal === 3);
assert('la de 3 dígitos no avisa', !mal.some(d => d.tramo === '901'));
const d4 = mal.find(d => d.tramo === '9002');
assert('la de 4 dígitos sale una vez, con su legajo y 2 filas',
  d4 && d4.dimension === DIM('9002') && d4.filas === 2 && d4.legajos.length === 1 && d4.legajos[0] === '9002');
assert('la de 2 dígitos y la que tiene una letra también avisan', mal.some(d => d.tramo === '12') && mal.some(d => d.tramo === '9A3'));
assert('vacía, Null, SIN_ASIGNAR o sin 7mo tramo no avisan',
  !mal.some(d => d.tramo === 'SIN_ASIGNAR' || d.dimension === 'Null' || d.dimension === '' || d.dimension === '1-01-AR'));

const sc = res.rows.find(r => r.ccName === 'Servicios Comunes');
assert('la comparación de importes no cambia: Servicios Comunes cierra en 715', Math.abs(sc.dTotal) < 0.005);
const sum = summarizeRendVsAsiento(res);
assert('el semáforo no cuenta el aviso: 0 centros con diferencia', sum.unitsWithDiff === 0 && sum.status === 'success');

const limpio = runRendVsAsiento(REND_ROWS, [], {
  rend: REND, contaRows: [conta('9001', DIM('901'), 715)], ccXEeRows: [], rvaConfig: CFG,
});
assert('con todas las dimensiones bien no hay aviso', limpio.dimensionesLegajoMal.length === 0 && limpio.summary.dimensionesLegajoMal === 0);

console.log(`\n${ok} ✓ · ${fail} ✗`);
if (fail) process.exit(1);
