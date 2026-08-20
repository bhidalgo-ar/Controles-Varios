// expNovParser.test.js — El lector de la familia ExpNov (N0a, D-070)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/expNovParser.test.js
//
// Cada caso de acá salió del relevamiento de los 7 clientes Axton
// (specs/familia-novedades-axton.md): el bloque de identificación que mide 3, 6,
// 8, 9 o 31 columnas, el bloque corrido una fila, la fila de criollo que puede no
// existir, el `cantidad$importe` con 4 decimales, las columnas sin código CON
// datos cargados, los códigos repetidos en dos columnas y los no numéricos.
// Los datos son inventados —un export de cliente no entra al repo ni como
// fixture—; lo que se reproduce es la FORMA del archivo, no su contenido.

import * as XLSXmod from 'xlsx';
globalThis.XLSX = XLSXmod;

const { parseExpNov, parseValorCelda } = await import('./js/parsers/expNovParser.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}
function assertThrows(desc, fn, contiene) {
  try { fn(); console.error('✗', desc, '(no cortó)'); fail++; }
  catch (e) {
    if (!contiene || String(e.message).includes(contiene)) { console.log('✓', desc); ok++; }
    else { console.error('✗', desc, `(el error no menciona "${contiene}": ${e.message})`); fail++; }
  }
}

/** Arma un .xlsx en memoria a partir de filas crudas y el nombre de la hoja. */
function xlsxDe(sheetName, aoa, extra = []) {
  const wb = XLSXmod.utils.book_new();
  XLSXmod.utils.book_append_sheet(wb, XLSXmod.utils.aoa_to_sheet(aoa), sheetName);
  for (const [nombre, filas] of extra) {
    XLSXmod.utils.book_append_sheet(wb, XLSXmod.utils.aoa_to_sheet(filas), nombre);
  }
  return XLSXmod.write(wb, { type: 'array', bookType: 'xlsx' });
}

/** Relleno de columnas de identificación, para correr el primer concepto. */
const relleno = (n) => Array.from({ length: n }, () => null);

// ── Caso base: criollo arriba, códigos en la fila de encabezados, primer concepto en G ──

const base = xlsxDe('d  axFiles HidalgoExpNov_1132_2', [
  ['Unidad Organizativa', '1132', 'PLANTA NORTE', '09/08/2024'],
  [null, null, null, null, null, null, 'Sueldo Basico', 'Horas Extras 50%', 'Premio'],
  ['Legajo', 'Apellido y Nombres', 'CUIL', 'Sector', 'Categoria', 'Ingreso', '1000', '1100', '2500'],
  ['1', 'Perez', '(cuil inventado)', 'A', 'B', '2020-01-01', '1$159811,7958', 8, null],
  ['2', 'Gomez', '(cuil inventado)', 'A', 'B', '2021-01-01', null, null, 0],
]);

{
  const { parsedRows, parseMetadata: m } = parseExpNov(base);

  assert('el primer concepto cae en G sin que nadie se lo diga',
    m.columnas[0].letra === 'G' && m.columnas[0].codigo === '1000');
  assert('lee las tres columnas de concepto', m.columnas.length === 3);
  assert('el rótulo en criollo viaja al costado del código',
    m.columnas[1].rotulo === 'Horas Extras 50%' && m.columnas[1].codigo === '1100');
  assert('reconoce la fila de encabezados, la de códigos y la de criollo',
    m.filaEncabezado === 3 && m.filaCodigos === 3 && m.filaCriollo === 2);
  assert('los datos arrancan en la fila 4', m.primeraFilaDatos === 4);

  // cantidad$importe con muchos decimales: se separa, y el importe conserva los decimales.
  const c = parsedRows.find(r => r.legajo === '1' && r.codigo === '1000');
  assert('separa cantidad$importe', c.cantidad === 1 && Math.abs(c.importe - 159811.7958) < 1e-9);
  assert('la celda cantidad$importe declara las dos unidades', c.unidadDeclarada === 'cantidad_e_importe');

  // Valor suelto: es una cantidad, y el importe queda en null (null no es 0).
  const hs = parsedRows.find(r => r.legajo === '1' && r.codigo === '1100');
  assert('el valor suelto se lee como cantidad', hs.cantidad === 8 && hs.importe === null);
  assert('el valor suelto declara cantidad', hs.unidadDeclarada === 'cantidad');

  // Celda vacía ≠ 0: la vacía no emite nada, el cero sí.
  assert('la celda vacía no emite novedad',
    !parsedRows.some(r => r.legajo === '2' && r.codigo === '1000'));
  assert('el cero explícito SÍ emite novedad',
    parsedRows.find(r => r.legajo === '2' && r.codigo === '2500')?.cantidad === 0);
  assert('el legajo sin ninguna novedad igual aparece como empleado',
    m.empleados.some(e => e.legajo === '2'));

  // El período no sale del archivo, aunque la fila 1 traiga una fecha.
  assert('el período queda en null: lo declara el analista', m.periodo === null);
  assert('la fecha de la fila 1 se guarda como dato del archivo', m.fechaArchivo === '09/08/2024');
  assert('avisa que esa fecha no es el período',
    m.avisos.some(a => a.includes('no el período')));
  assert('lee la unidad organizativa',
    m.unidadOrganizativa?.numero === '1132' && m.unidadOrganizativa?.nombre === 'PLANTA NORTE');
  assert('el legajo viaja crudo, sin normalizar', parsedRows.every(r => typeof r.legajo === 'string'));
}

// ── Bloque de identificación de 9 columnas: el primer concepto cae en J ───────

{
  const enJ = xlsxDe('Hidalgo ExpNov_1251_', [
    ['Empresa', 'MERZ SA', '31/07/2026'],
    [...relleno(9), 'Spot Bonus'],
    ['Legajo', 'Apellido y Nombres', 'CUIL', 'Sector', 'Cargo', 'Convenio', 'Categoria', 'Ingreso', 'CBU', '2500'],
    ['7', 'Perez', null, null, null, null, null, null, null, '1$50000'],
  ]);
  const { parsedRows, parseMetadata: m } = parseExpNov(enJ);
  assert('bloque de 9 columnas → primer concepto en J', m.columnas[0].letra === 'J');
  assert('bloque de 9 columnas → el bloque de identificación llega hasta I',
    m.bloqueIdentificacion.letraHasta === 'I');
  assert('bloque de 9 columnas → lee la novedad', parsedRows[0].importe === 50000);
  assert('lee la empresa cuando la fila 1 no trae unidad organizativa', m.empresa === 'MERZ SA');
}

// ── Bloque de 31 columnas: el primer concepto cae en AF ───────────────────────

{
  const idFila = ['Legajo', 'Apellido y Nombres', ...relleno(29)];
  const enAF = xlsxDe('HidalgoExpNov_1', [
    [...idFila.map(() => null)],
    [...relleno(31), 'Presentismo'],
    [...idFila, '605705'],
    ['10', 'Perez', ...relleno(29), 3],
  ]);
  const { parsedRows, parseMetadata: m } = parseExpNov(enAF);
  assert('bloque de 31 columnas → primer concepto en AF', m.columnas[0].letra === 'AF');
  assert('bloque de 31 columnas → lee la novedad', parsedRows[0].cantidad === 3);
}

// ── Bloque corrido una fila, con totales por concepto en la fila 1 ───────────
// (F2 de Coelsa y de SIASA: criollo en 2, códigos en 3, datos desde la 4, y la
// fila 1 son totales — no metadata.)

{
  const corrido = xlsxDe('d  axFiles Hidalgo ExpNov_1', [
    [null, null, null, null, 900, 12],
    [null, null, null, null, 'Sueldo Basico', 'Dias Trabajados'],
    ['Legajo', 'Apellido y Nombres', 'CUIL', 'Sector', '1000', '401'],
    ['1', 'Perez', null, null, '1$500', 12],
    ['2', 'Gomez', null, null, '1$400', null],
  ]);
  const { parsedRows, parseMetadata: m } = parseExpNov(corrido);
  assert('bloque corrido → encabezados en la fila 3, datos desde la 4',
    m.filaEncabezado === 3 && m.primeraFilaDatos === 4);
  assert('bloque corrido → la fila 1 de totales no se confunde con la de códigos',
    m.filaCodigos === 3 && m.filaCriollo === 2);
  assert('bloque corrido → primer concepto en E', m.columnas[0].letra === 'E');
  assert('bloque corrido → lee las dos novedades del primer legajo',
    parsedRows.filter(r => r.legajo === '1').length === 2);
}

// ── Sin fila de criollo (F2 de SIASA y de Merz, "FUERA DE CONVENIO" de Red Bull) ──

{
  const sinCriollo = xlsxDe('HidalgoExpNov_2', [
    ['Legajo', 'Apellido y Nombres', '1000', '1100'],
    ['1', 'Perez', '1$500', 4],
  ]);
  const { parsedRows, parseMetadata: m } = parseExpNov(sinCriollo);
  assert('sin fila de criollo → no inventa una', m.filaCriollo === null);
  assert('sin fila de criollo → el rótulo queda vacío, no se completa con nada',
    m.columnas.every(c => c.rotulo === ''));
  assert('sin fila de criollo → lee igual las novedades', parsedRows.length === 2);
}

// ── Rótulos de identificación en la fila de criollo, códigos en la de abajo ──

{
  const codigosAbajo = xlsxDe('HidalgoExpNov_3', [
    ['Legajo', 'Apellido y Nombres', 'Sueldo Basico', 'Premio'],
    [null, null, '1000', '2500'],
    ['1', 'Perez', '1$500', null],
  ]);
  const { parsedRows, parseMetadata: m } = parseExpNov(codigosAbajo);
  assert('códigos en la fila de abajo → los encuentra igual',
    m.filaCodigos === 2 && m.columnas[0].codigo === '1000');
  assert('códigos en la fila de abajo → el criollo sale de la fila del ancla',
    m.columnas[0].rotulo === 'Sueldo Basico');
  assert('códigos en la fila de abajo → los datos arrancan en la 3',
    m.primeraFilaDatos === 3 && parsedRows.length === 1);
}

// ── Columna sin código, con datos cargados (Coelsa, SIASA, Merz) ─────────────

{
  const sinCodigo = xlsxDe('HidalgoExpNov_4', [
    [null, null, 'Sueldo Basico', 'Lic. Paternidad', 'Observaciones'],
    ['Legajo', 'Apellido y Nombres', '1000', null, null],
    ['1', 'Perez', '1$500', 2, 'revisar'],
    ['2', 'Gomez', '1$400', null, null],
  ]);
  const { parseMetadata: m } = parseExpNov(sinCodigo);
  assert('la columna sin código se lista aparte', m.columnasSinCodigo.length === 2);
  assert('la columna sin código viaja con su rótulo',
    m.columnasSinCodigo[0].rotulo === 'Lic. Paternidad' && m.columnasSinCodigo[0].letra === 'D');
  assert('cuenta cuántas celdas cargadas tiene la columna sin código',
    m.columnasSinCodigo[0].celdasCargadas === 1 && m.columnasSinCodigo[1].celdasCargadas === 1);
  assert('avisa que hay columnas sin código con datos',
    m.avisos.some(a => a.includes('columnas sin código') && a.includes('Lic. Paternidad')));
  assert('la columna sin código no se cuela como concepto',
    m.columnas.length === 1 && m.columnas[0].codigo === '1000');
}

// ── Columna sin código a la IZQUIERDA del primer concepto con código ─────────
// ("Licencia por ART" en SIASA: si el bloque de identificación se cortara en el
// primer código numérico, esta columna se leería como parte de la ficha y sus
// datos desaparecerían.)

{
  const aLaIzquierda = xlsxDe('HidalgoExpNov_4b', [
    [null, null, 'Licencia por ART', 'Sueldo Basico'],
    ['Legajo', 'Apellido y Nombres', null, '1000'],
    ['1', 'Perez', 5, '1$500'],
  ]);
  const { parseMetadata: m } = parseExpNov(aLaIzquierda);
  assert('la columna sin código a la izquierda del primer código no se pierde en la ficha',
    m.columnasSinCodigo.length === 1 && m.columnasSinCodigo[0].rotulo === 'Licencia por ART');
  assert('sus celdas cargadas se cuentan', m.columnasSinCodigo[0].celdasCargadas === 1);
  assert('el bloque de identificación llega hasta B', m.bloqueIdentificacion.letraHasta === 'B');
}

// ── Etiqueta en el lugar del código, sin criollo arriba (SIASA) ───────────────

{
  const etiquetas = xlsxDe('HidalgoExpNov_5', [
    ['Legajo', 'Apellido y Nombres', '1000', 'Informar Cantidad', 'Suma total'],
    ['1', 'Perez', '1$500', 3, 500],
  ]);
  const { parseMetadata: m } = parseExpNov(etiquetas);
  assert('"Informar Cantidad" y "Suma total" no se leen como códigos',
    m.columnas.length === 1 && m.columnasSinCodigo.length === 2);
  assert('la etiqueta queda como rótulo de la columna sin código',
    m.columnasSinCodigo.map(c => c.rotulo).join('|') === 'Informar Cantidad|Suma total');
}

// ── Código no numérico con rótulo en criollo: SAL BAS (Geopagos) ──────────────

{
  const salBas = xlsxDe('HidalgoExpNov_6', [
    [null, null, 'Sueldo Basico', 'Horas Extras'],
    ['Legajo', 'Apellido y Nombres', 'SAL BAS', '1100'],
    ['1', 'Perez', '1$500', 4],
  ]);
  const { parsedRows, parseMetadata: m } = parseExpNov(salBas);
  assert('SAL BAS se lee como código, tal cual viene',
    m.columnas.some(c => c.codigo === 'SAL BAS' && c.codigoNoNumerico === true));
  assert('SAL BAS emite su novedad',
    parsedRows.find(r => r.codigo === 'SAL BAS')?.importe === 500);
  assert('avisa que el código no es numérico',
    m.avisos.some(a => a.includes('no es numérico') && a.includes('SAL BAS')));
}

// ── Código duplicado en dos columnas (605705 en POP, 1530 en Epiroc, 1600 en Merz) ──

{
  const duplicado = xlsxDe('HidalgoExpNov_7', [
    [null, null, 'Premio', 'Premio (SOLO PLASTIC)'],
    ['Legajo', 'Apellido y Nombres', '605705', '605705'],
    ['1', 'Perez', '1$500', '1$300'],
  ]);
  const { parsedRows, parseMetadata: m } = parseExpNov(duplicado);
  assert('el código duplicado sale como aviso con las dos columnas',
    m.avisos.some(a => a.includes('605705') && a.includes('C') && a.includes('D')));
  assert('las dos columnas duplicadas se leen, no se pisa una con la otra',
    parsedRows.filter(r => r.codigo === '605705').length === 2);
  assert('la segunda columna queda marcada como duplicada',
    m.columnas[1].duplicado === true && m.columnas[0].duplicado === false);
  assert('cada celda dice de qué columna salió',
    parsedRows.map(r => r.letraCol).join('|') === 'C|D');
}

// ── Filas sin legajo (totales al pie) y valores que no se pueden leer ─────────

{
  const basura = xlsxDe('HidalgoExpNov_8', [
    [null, null, 'Sueldo Basico'],
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['1', 'Perez', '1$500'],
    ['2', 'Gomez', 'revisar con RRHH'],
    [null, 'TOTAL', 500],
  ]);
  const { parsedRows, parseMetadata: m } = parseExpNov(basura);
  assert('la fila de totales al pie no se lee como empleado', m.uniqueLegajos === 2);
  assert('avisa por la fila sin legajo',
    m.filasSinLegajo.length === 1 && m.avisos.some(a => a.includes('no tiene legajo') || a.includes('no tienen legajo')));
  assert('el valor que no es número no se emite como novedad', parsedRows.length === 1);
  assert('el valor no parseable sale listado con su fila y su columna',
    m.noParseables.length === 1 && m.noParseables[0].fila === 4 && m.noParseables[0].letraCol === 'C');
  assert('el valor no parseable sale como aviso',
    m.avisos.some(a => a.includes('no se pudo leer') || a.includes('no se pudieron leer')));
}

// ── Hojas que no se leyeron (workbooks de hasta 10 hojas, algunas ocultas) ────

{
  const varias = xlsxDe('d  axFiles HidalgoExpNov_1132_2', [
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['1', 'Perez', '1$500'],
  ], [['OS', [['nada']]], ['Tcs', [[null]]]]);
  const { parseMetadata: m } = parseExpNov(varias);
  assert('avisa qué hojas no se leyeron',
    m.avisos.some(a => a.includes('se leyeron') && a.includes('OS') && a.includes('Tcs')));
  assert('lee la hoja que matchea la firma ExpNov', m.sheetName.includes('ExpNov'));
}

// ── Errores: qué se esperaba y qué se encontró ───────────────────────────────

{
  const sinAncla = xlsxDe('Hoja1', [['Nombre', 'Importe'], ['Perez', 100]]);
  assertThrows('sin fila de Legajo/Apellido corta', () => parseExpNov(sinAncla), 'Apellido y Nombres');

  const sinCodigos = xlsxDe('HidalgoExpNov_9', [
    ['Legajo', 'Apellido y Nombres', 'Observaciones'],
    ['1', 'Perez', 'nada'],
  ]);
  assertThrows('sin fila de códigos corta y dice qué encontró',
    () => parseExpNov(sinCodigos), 'fila de códigos');

  const sinDatos = xlsxDe('HidalgoExpNov_10', [
    [null, null, 'Sueldo Basico'],
    ['Legajo', 'Apellido y Nombres', '1000'],
  ]);
  assertThrows('sin filas de empleado corta', () => parseExpNov(sinDatos), 'filas de empleado');
}

// ── parseValorCelda, el separador de cantidad$importe ────────────────────────

{
  assert('vacío no es cero', parseValorCelda(null).vacia === true && parseValorCelda('  ').vacia === true);
  assert('cero es dato', parseValorCelda(0).cantidad === 0);
  assert('12 decimales sobreviven',
    Math.abs(parseValorCelda('1$159811,795812345').importe - 159811.795812345) < 1e-9);
  assert('el importe en formato es-AR se lee bien',
    parseValorCelda('2$1.234,56').cantidad === 2 && parseValorCelda('2$1.234,56').importe === 1234.56);
  assert('cantidad vacía en la forma cantidad$importe queda en null, no en 0',
    parseValorCelda('$500').cantidad === null && parseValorCelda('$500').importe === 500);
  assert('la mitad ilegible se marca como parcial',
    parseValorCelda('ab$500').parcial === true);
  assert('texto suelto no es número', !!parseValorCelda('revisar').error);
  assert('una fecha en una columna de concepto no se lee como cantidad',
    !!parseValorCelda(new Date('2026-07-31')).error);
}

console.log(`\n${ok} OK, ${fail} FAIL`);
if (fail > 0) process.exit(1);
