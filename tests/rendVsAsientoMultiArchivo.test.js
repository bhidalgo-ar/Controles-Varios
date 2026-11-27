// rendVsAsientoMultiArchivo.test.js — Rendimiento vs Asiento con el Reporte de
// Rendimiento partido en varios archivos del mismo mes (D-109).
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/rendVsAsientoMultiArchivo.test.js
//
// Lo que este test fija:
//   - un CC que está en dos archivos sale en UN renglón, con la suma, y se
//     compara una sola vez contra el total de CONTA (sin diferencias falsas);
//   - `null` no es `0`: una categoría que un archivo no trae y el otro sí suma
//     el valor; si ningún archivo la trae, queda `null`;
//   - un archivo con otras columnas se rechaza (no se suma con el mapeo del primero);
//   - juntar archivos concatena y avisa filas idénticas entre archivos distintos;
//   - la casilla multi es del slot de Rendimiento vs Asiento: Rendimiento vs
//     Tabulado sigue pidiendo un solo archivo.
//
// Datos inventados; nombres de la lista de Banfield (CLAUDE.md). CC inventados.

import * as XLSX from './node_modules/xlsx/xlsx.mjs';
globalThis.XLSX = XLSX;
// rendVsAsiento.js y el registry importan módulos de UI que se enganchan al
// `document` al cargar.
globalThis.document = { addEventListener: () => {} };

const { runRendVsAsiento, summarizeRendVsAsiento, consolidateRendByCC } =
  await import('./js/controls/rendVsAsiento.js');
const { parseRendimiento, detectHeadersRendimiento, autoDetectRendimientoMapping } =
  await import('./js/parsers/rendimientoParser.js');
const { mergeParsedFiles, headersMismatch } = await import('./js/parsers/mergeFiles.js');
const { mergeContaFiles } = await import('./js/parsers/contaExcel.js');
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { flowFor, multiCopyFor, mergeFor } = await import('./js/ui/fileTypes.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}
const casi = (a, b) => a !== null && a !== undefined && Math.abs(a - b) < 0.005;

// ── Armado ───────────────────────────────────────────────────────────────────

const REND = {
  ccCodeColumn: 'CC', ccNameColumn: 'Nombre CC',
  precioColumn: 'Precio', estimuloColumn: 'Estimulo', cargasColumn: 'Cargas',
};
const rendFila = (cc, nombre, precio, estimulo = null, cargas = null) =>
  ({ CC: cc, 'Nombre CC': nombre, Precio: precio, Estimulo: estimulo, Cargas: cargas });

/** Una fila de CONTA en la cuenta pedida (5208001 = PRECIO, 5208002 = ESTÍMULO). */
const conta = (legajo, ccNombre, debe, cuenta = '5208001', apellido = 'SANGUINETTI') => ({
  id_empleado: legajo, id_centro_costo: '', cc_nombre: ccNombre,
  cuenta_contab: cuenta, n_cuenta_contable: 'REMUNERACIONES',
  id_concepto: '1003', nombre_largo: 'SUELDO', debe, haber: 0,
  apellido_1: apellido, nombre: '',
});

const CONFIG = {
  cuentaCats: { precio: ['5208001'], estimulo: ['5208002'], cargas: [], provMes: [] },
  provCcssConcepts: [],
  ccRedirects: [],
};

const correr = (rendRows, contaRows) =>
  runRendVsAsiento(rendRows, [], { rend: REND, contaRows, ccXEeRows: [], rvaConfig: CONFIG });

// ── 1) Un CC en dos archivos: un renglón, la suma, diferencia 0 ─────────────
{
  // Archivo 1 (empresa A) y archivo 2 (empresa B), concatenados como los
  // devuelve la casilla multi. "Asesoramiento" está en los dos.
  const archivoA = [rendFila('10', 'Asesoramiento', 1000), rendFila('20', 'Administracion', 500)];
  const archivoB = [rendFila('10', 'Asesoramiento', 2500), rendFila('30', 'Sistemas', 700)];
  const rendRows = [...archivoA, ...archivoB];

  const contaRows = [
    conta('1', 'Asesoramiento', 1000, '5208001', 'SANGUINETTI'),
    conta('2', 'Asesoramiento', 2500, '5208001', 'ALBELLA'),
    conta('3', 'Administracion', 500, '5208001', 'FALCIONI'),
    conta('4', 'Sistemas', 700, '5208001', 'SILVA'),
  ];
  const res = correr(rendRows, contaRows);
  const filasAse = res.rows.filter(r => r.ccName === 'Asesoramiento');

  assert('el CC repetido sale en un solo renglón', filasAse.length === 1);
  assert('ese renglón trae la suma de los dos archivos (1.000 + 2.500)', casi(filasAse[0]?.rPrecio, 3500));
  assert('contra CONTA no da diferencia', casi(filasAse[0]?.dPrecio, 0) && casi(filasAse[0]?.dTotal, 0));
  assert('hay un renglón por CC (3), no por fila (4)', res.rows.length === 3);
  assert('ningún CC sale con diferencia', res.summary.difTotal === 0 && res.summary.difPrecio === 0);
  assert('el semáforo cuenta 3 centros de costo', summarizeRendVsAsiento(res).unitsTotal === 3);
  assert('el puente del Resumen cierra: Total Rendimiento = Total CONTA',
    casi(res.bridge.steps[0].amount, 4700));
}

// ── 2) Antes de consolidar, el mismo caso daba diferencias falsas ────────────
// (lo que este cambio evita: cada fila comparada contra el total del CC).
{
  const rendRows = [rendFila('10', 'Asesoramiento', 1000), rendFila('10', 'Asesoramiento', 2500)];
  const res = correr(rendRows, [conta('1', 'Asesoramiento', 3500)]);
  assert('dos filas del mismo CC no se comparan cada una contra el total',
    res.rows.length === 1 && casi(res.rows[0].dPrecio, 0));
}

// ── 3) null ≠ 0 al sumar ─────────────────────────────────────────────────────
{
  const g = consolidateRendByCC([
    rendFila('10', 'Asesoramiento', 1000, null, null),   // archivo A: sin estímulo ni cargas
    rendFila('10', 'Asesoramiento', 2500, 300, null),    // archivo B: con estímulo, sin cargas
  ], REND);
  assert('un solo grupo', g.length === 1);
  assert('categoría null en un archivo y valor en otro → suma el valor (300)', casi(g[0].estimulo, 300));
  assert('categoría null en todos los archivos → null, no 0', g[0].cargas === null);
  assert('una columna sin mapear también queda null', g[0].provMes === null && g[0].provCcss === null);

  const conCero = consolidateRendByCC([
    rendFila('10', 'Asesoramiento', 1000, 0),
    rendFila('10', 'Asesoramiento', 2500, null),
  ], REND);
  assert('un 0 informado es dato: la suma es 0, no null', conCero[0].estimulo === 0);

  // Sin estímulo en el Rendimiento, el estímulo de CONTA no se compara (no hay dato de un lado).
  const res = correr(
    [rendFila('10', 'Asesoramiento', 1000), rendFila('10', 'Asesoramiento', 2500)],
    [conta('1', 'Asesoramiento', 3500), conta('1', 'Asesoramiento', 50, '5208002')],
  );
  assert('estímulo sin dato en el Rendimiento: la diferencia es null, no -50', res.rows[0].dEstimulo === null);
}

// ── 4) Código y nombre del CC: el primero no vacío; los "total" se saltean ──
{
  const g = consolidateRendByCC([
    rendFila('', 'Asesoramiento', 100),
    rendFila('0010', '  asesoramiento ', 200),      // misma clave normalizada
    rendFila('', 'Total general', 300),
    rendFila('', '', 5),
  ], REND);
  assert('el nombre normalizado agrupa (mayúsculas y espacios)', g.length === 1);
  assert('ccCode: el primero no vacío', g[0].ccCode === '0010');
  assert('ccName: el del primer archivo', g[0].ccName === 'Asesoramiento');
  assert('las filas "total" y las vacías no suman', casi(g[0].precio, 300));
}

// ── 5) Encabezados: iguales se aceptan, distintos se rechazan ───────────────
{
  const ref = ['', 'CENTRO COSTO', 'PRECIO', 'CARGAS SOCIALES'];
  assert('mismos encabezados → sin diferencia', headersMismatch(ref, [...ref]) === null);
  assert('espacios de los costados no cuentan', headersMismatch(ref, ['', ' CENTRO COSTO', 'PRECIO ', 'CARGAS SOCIALES']) === null);
  assert('columnas vacías al final no cuentan', headersMismatch(ref, [...ref, '', '']) === null);
  const otroOrden = headersMismatch(ref, ['', 'CENTRO COSTO', 'CARGAS SOCIALES', 'PRECIO']);
  assert('otro orden → se rechaza y dice la columna y qué se esperaba',
    otroOrden?.position === 3 && otroOrden.expected === 'PRECIO' && otroOrden.found === 'CARGAS SOCIALES');
  const falta = headersMismatch(ref, ['', 'CENTRO COSTO', 'PRECIO']);
  assert('una columna de menos → se rechaza', falta?.position === 4 && falta.found === '');
  const sobra = headersMismatch(ref, [...ref, 'RETIROS']);
  assert('una columna de más → se rechaza', sobra?.position === 5 && sobra.expected === '');
}

// ── 6) De punta a punta con dos Excel en memoria ─────────────────────────────
{
  const ENC = ['', 'CENTRO COSTO', 'PRECIO', 'ASIGNACIÓN ESTIMULO', 'CARGAS SOCIALES'];
  const xlsx = (aoa) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Hoja1');
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  };
  const abA = xlsx([ENC, ['10', 'Asesoramiento', 1000, null, 200], ['20', 'Administracion', 500, 50, 100], ['', 'Total general', 1500, 50, 300]]);
  const abB = xlsx([ENC, ['10', 'Asesoramiento', 2500, 80, null], ['30', 'Sistemas', 700, null, null]]);
  const abOtro = xlsx([['', 'CENTRO COSTO', 'COSTO TOTAL', 'PRECIO'], ['10', 'Asesoramiento', 1, 2]]);

  const hA = detectHeadersRendimiento(abA).headers;
  const hB = detectHeadersRendimiento(abB).headers;
  const hOtro = detectHeadersRendimiento(abOtro).headers;
  assert('dos reportes del mismo formato: encabezados iguales', headersMismatch(hA, hB) === null);
  assert('un reporte con otras columnas: se rechaza', headersMismatch(hA, hOtro) !== null);

  const mapping = autoDetectRendimientoMapping(hA);
  const entries = [
    { fileName: 'rend_empresa_a.xlsx', ...parseRendimiento(abA, mapping) },
    { fileName: 'rend_empresa_b.xlsx', ...parseRendimiento(abB, mapping) },
  ];
  const merged = mergeParsedFiles(entries);
  assert('las filas se concatenan (2 + 2, sin el total)', merged.parsedRows.length === 4);
  assert('sin filas repetidas entre archivos', merged.parseMetadata.duplicates.length === 0);

  const res = runRendVsAsiento(merged.parsedRows, [], {
    rend: mapping, ccXEeRows: [], rvaConfig: {
      ...CONFIG, cuentaCats: { precio: ['5208001'], estimulo: ['5208002'], cargas: ['5208005'], provMes: [] },
    },
    contaRows: [
      conta('1', 'Asesoramiento', 3500), conta('1', 'Asesoramiento', 80, '5208002'),
      conta('1', 'Asesoramiento', 200, '5208005'),
      conta('2', 'Administracion', 500), conta('2', 'Administracion', 50, '5208002'),
      conta('2', 'Administracion', 100, '5208005'),
      conta('3', 'Sistemas', 700),
    ],
  });
  const ase = res.rows.filter(r => r.ccName === 'Asesoramiento');
  assert('de punta a punta: un renglón para el CC de los dos archivos', ase.length === 1);
  assert('de punta a punta: PRECIO 3.500, ESTÍMULO 80, CARGAS 200',
    casi(ase[0].rPrecio, 3500) && casi(ase[0].rEstimulo, 80) && casi(ase[0].rCargas, 200));
  assert('de punta a punta: código CC del primer archivo', ase[0].ccCode === '10');
  assert('de punta a punta: ningún CC con diferencia', res.summary.difTotal === 0);
}

// ── 7) Juntar: el mismo archivo subido dos veces se avisa ────────────────────
{
  const filas = [rendFila('10', 'Asesoramiento', 1000), rendFila('20', 'Administracion', 500)];
  const m = mergeParsedFiles([
    { fileName: 'a.xlsx', parsedRows: filas },
    { fileName: 'b.xlsx', parsedRows: filas.map(f => ({ ...f })) },
  ]);
  assert('repetido: las filas se concatenan igual (4)', m.parsedRows.length === 4);
  assert('repetido: se avisa en el segundo archivo, con cuántas filas',
    m.parseMetadata.duplicates.length === 1 && m.parseMetadata.duplicates[0].fileName === 'b.xlsx'
    && m.parseMetadata.duplicates[0].count === 2);
  assert('repetido: metadata por archivo', m.parseMetadata.files.length === 2 && m.parseMetadata.totalRows === 4);

  const mismo = mergeParsedFiles([{ fileName: 'a.xlsx', parsedRows: [filas[0], { ...filas[0] }] }]);
  assert('una fila repetida dentro del mismo archivo no es duplicado', mismo.parseMetadata.duplicates.length === 0);

  // CONTA sigue sumando sus descartadas sobre el merge genérico.
  const c = mergeContaFiles([
    { fileName: 'abril.xlsx', parsedRows: [{ x: 1 }], parseMetadata: { totalRows: 1, descartadasSinCC: 2 } },
    { fileName: 'mayo.xlsx',  parsedRows: [{ x: 2 }], parseMetadata: { totalRows: 1, descartadasSinCC: 3 } },
  ]);
  assert('CONTA: descartadas sin CC combinadas (2 + 3)', c.parseMetadata.descartadasSinCC === 5
    && c.parseMetadata.files[1].descartadasSinCC === 3);
}

// ── 8) La casilla multi es del slot, no del tipo de archivo ──────────────────
{
  const slotDe = id => CONTROL_REGISTRY[id].additionalFiles.find(f => f.fileType === 'rend_file');
  const asiento = slotDe('rend_vs_asiento');
  const tabu    = slotDe('rend_vs_tabu');
  assert('Rendimiento vs Asiento pide el Rendimiento en casilla multi',
    flowFor(asiento.fileType, asiento.flow) === 'multi');
  assert('Rendimiento vs Tabulado lo sigue pidiendo de a uno',
    flowFor(tabu.fileType, tabu.flow) === 'single');
  assert('la ficha del Rendimiento sigue siendo de un archivo por slot', flowFor('rend_file') === 'single');
  assert('CONTA sigue siendo multi por ficha', flowFor('conta_file') === 'multi');

  const rc = multiCopyFor('rend_file');
  assert('la casilla de Rendimiento no habla de meses ni de "con CC" de CONTA',
    !/mes(es)? juntos/.test(rc.hint) && !rc.rowsLabel(2).includes('con CC') && !rc.dupHint.includes('período'));
  assert('la de CONTA conserva sus textos', multiCopyFor('conta_file').rowsLabel(1) === '1 fila con CC');
  assert('CONTA junta con su propio merge; Rendimiento con el genérico',
    mergeFor('conta_file') === mergeContaFiles && mergeFor('rend_file') === null);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
