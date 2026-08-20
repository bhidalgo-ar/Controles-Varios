// tabAxtonReader.test.js — El lector del Tabulado de Axton y el totalizador (N0b)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/tabAxtonReader.test.js
//
// Cada caso de acá es una firma de archivo real, relevada en los 7 clientes Axton
// de julio 2026 (`specs/familia-novedades-axton.md`, "El lado liquidación"):
// preámbulo de 0, 1 o 2 filas; pares Cant/Imp (POP, Epiroc) o sólo-Imp (los otros
// cinco); `TOTAL GENERAL` una vez o duplicado arriba y abajo; una fila por
// liquidación con un legajo hasta 3 veces; filas agregadas a mano DEBAJO del
// TOTAL GENERAL (Geopagos); espacios duros U+00A0 en los encabezados (POP, Coelsa);
// dos códigos con el mismo rótulo (SIASA `999`/`1000`); y un código que agrupa
// varios conceptos en el totalizador (SIASA `605130`).
//
// Los datos son inventados —un export de cliente no entra al repo ni como fixture—:
// lo que se reproduce es la FORMA del archivo, no su contenido. Los nombres salen de
// la lista de jugadores de Banfield de CLAUDE.md § Privacidad, que es lo que hace que
// un dato de prueba se distinga de uno real de un solo vistazo.
//
// El assert más importante del archivo es el de la consolidación por legajo: el
// lector emite una fila por liquidación y **el que consolida es el control**, con
// `js/controls/consolidate.js` y la clave del cliente. Pisar en vez de sumar es el
// bug más caro del repo (D-042) y ya se arregló cuatro veces por separado.

import * as XLSXmod from 'xlsx';
globalThis.XLSX = XLSXmod;

const { readTabAxton, layoutTabAxton } = await import('./js/parsers/tabAxtonReader.js');
const { readTotalesConcepto } = await import('./js/parsers/totalesConceptoParser.js');
const { groupRowsByLegajo, sumColumn } = await import('./js/controls/consolidate.js');
const { makeLegajoKey } = await import('./js/utils/legajo.js');

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

const NBSP = ' ';

// ── POP / Epiroc: sin preámbulo, pares Cant/Imp, una fila por liquidación ─────
// Encabezados en la fila 1, subencabezados en la 2, datos desde la 3. El primer
// legajo tiene TRES liquidaciones en el mismo período (mensual + dos quincenas):
// es el caso que hace falso todo cruce que pise en vez de sumar.
// El encabezado "Centro de Costo" viene con espacio duro, como en el archivo real.

const pop = xlsxDe('Liquidaciones.20260728.035742.6', [
  ['Legajo', 'Apellido y Nombre', `Centro${NBSP}de Costo`, 'Ingreso', 'Bruto', null,
    '1000 - Sueldo Basico', null, '1100 - Horas Extras 50%', null, 'TOTAL -', null, 'LSD', 'liquidacion'],
  [null, null, null, null, 'Cant', 'Imp', 'Cant', 'Imp', 'Cant', 'Imp', 'Cant', 'Imp', null, null],
  ['1', 'Sanguinetti', 'PLANTA', '01/03/2020', 30, 105000, 30, 100000, 5, 5000, null, null, 'S', 'Mensual 07-2026'],
  ['1', 'Sanguinetti', 'PLANTA', '01/03/2020', 15, 50000, 15, 50000, null, null, null, null, 'S', '1ra Quincena 07-2026'],
  ['1', 'Sanguinetti', 'PLANTA', '01/03/2020', 15, 50000, 15, 50000, 0, 0, null, null, 'S', '2da Quincena 07-2026'],
  ['12-B', 'Falcioni', 'ADM', '15/06/2021', 30, 200000, 30, 200000, null, null, null, null, 'S', 'Mensual 07-2026'],
  ['TOTAL GENERAL', null, null, null, 90, 405000, 90, 400000, 5, 5000, null, null, null, null],
]);

{
  const { parsedRows, parseMetadata: m } = readTabAxton(pop);

  assert('sin preámbulo, los encabezados están en la fila 1',
    m.filasPreambulo === 0 && m.filaEncabezado === 1 && m.filaSubencabezado === 2 && m.primeraFilaDatos === 3);
  assert('con pares Cant/Imp → variante axton', m.formato === 'axton');
  assert('…y las cantidades están disponibles', m.cantidadesDisponibles === true);

  assert('ubica los dos conceptos por código, no por posición',
    m.conceptos.map(c => c.codigo).join(',') === '1000,1100');
  assert('el concepto arranca en la columna G sin que nadie se lo diga',
    m.conceptos[0].letra === 'G' && m.conceptos[1].letra === 'I');
  assert('el nombre del concepto viaja al lado del código',
    m.conceptos[1].nombre === 'Horas Extras 50%');

  // U+00A0: el encabezado real trae espacio duro y si no se normaliza, la ficha
  // sale sin centro de costo y nadie se entera.
  assert('resuelve "Centro de Costo" con espacio duro U+00A0',
    parsedRows[0].centro_costo === 'PLANTA');
  assert('normaliza la fecha de ingreso a AAAA-MM-DD', parsedRows[0].ingreso === '2020-03-01');

  assert('emite una fila por LIQUIDACIÓN, no por empleado', m.totalRows === 4 && parsedRows.length === 4);
  assert('cuenta empleados distintos, no filas', m.uniqueLegajos === 2);
  assert('detecta el legajo con más de una liquidación',
    m.legajosConVariasLiquidaciones === 1 && m.maxLiquidacionesPorLegajo === 3);
  assert('lista las liquidaciones del período', m.liquidaciones.length === 3);
  assert('avisa que hay legajos con varias liquidaciones',
    m.avisos.some(a => a.includes('más de una liquidación')));

  // Un legajo con guion no es un legajo inválido: `parseInt` colapsaría '12-B' y
  // '12-C' en 12, que es un match falso (D-038).
  assert('un legajo no numérico ("12-B") se lee como empleado',
    parsedRows.some(r => r.legajo === '12-B'));

  // La fila TOTAL GENERAL no es un empleado: no viaja en parsedRows.
  assert('la fila TOTAL GENERAL no viaja entre los empleados',
    parsedRows.every(r => r.esTotalGeneral === false && r.legajo !== 'TOTAL GENERAL'));
  assert('el TOTAL GENERAL queda en la metadata, para validar sumas',
    m.totalGeneral?.imp_1000 === 400000 && m.totalGeneralFilas.length === 1);
  assert('las sumas cierran contra el TOTAL GENERAL del archivo', m.totalesQueNoCierran.length === 0);

  // Celda vacía ≠ 0: la vacía es "no se liquidó" y viaja como null; el cero
  // explícito es "se liquidó y dio cero".
  const q1 = parsedRows.find(r => r.liquidacion === '1ra Quincena 07-2026');
  const q2 = parsedRows.find(r => r.liquidacion === '2da Quincena 07-2026');
  assert('la celda vacía de un concepto viaja como null, no como 0', q1.imp_1100 === null);
  assert('el cero explícito viaja como 0, no como null', q2.imp_1100 === 0);

  // Lo que no es concepto no se lee como concepto.
  assert('"TOTAL -" y "LSD" no son conceptos',
    !m.conceptos.some(c => /TOTAL|LSD/.test(c.label)) &&
    m.columnasIgnoradas.map(c => c.rotulo).join(',') === 'TOTAL -,LSD');
  assert('el par Bruto se lee como totalizador, no como concepto',
    m.totalizadores.some(t => t.key === 'bruto') && parsedRows[0].bruto_imp === 105000);
  assert('no queda ninguna columna de valor sin clasificar', m.columnasSinClasificar.length === 0);

  // ── La regla que se rompió cuatro veces (D-042) ────────────────────────────
  // El lector NO consolida: consolidar es del control, con el molde compartido y
  // la clave de legajo del cliente. Estos tres asserts son el contrato.
  const keyFn  = makeLegajoKey();
  const grupos = groupRowsByLegajo(parsedRows, 'legajo', { keyFn });
  assert('groupRowsByLegajo junta las 3 liquidaciones del mismo legajo',
    grupos.size === 2 && grupos.get('1').length === 3);
  assert('sumColumn suma el concepto entre liquidaciones, no lo pisa',
    sumColumn(grupos.get('1'), 'imp_1000') === 200000);
  assert('consolidado, el total por concepto reproduce el TOTAL GENERAL del archivo',
    [...grupos.values()].reduce((t, g) => t + sumColumn(g, 'imp_1000'), 0) === m.totalGeneral.imp_1000);
  assert('una celda vacía en el medio no arrastra el total a null: 5000 + (vacía) + 0 = 5000',
    sumColumn(grupos.get('1'), 'imp_1100') === 5000);
}

// ── SIASA: preámbulo de 1 fila, TOTAL GENERAL duplicado, sólo importes ───────
// El TOTAL GENERAL de arriba está por encima de la fila de encabezados, así que
// vive dentro del preámbulo. Y los dos códigos `999` y `1000` se llaman igual
// ("Sueldo Basico"): matchear por nombre agarraría el equivocado (D-039).

const siasa = xlsxDe('Liquidaciones.20260730.114122.4', [
  ['EA: Empresa de Ejemplo | Usuario: u@ejemplo | Reporte: Resumen de Liquidacion | Periodo: 07/2026 - 07/2026 | Tipo: Mensual |'],
  ['TOTAL GENERAL', null, null, 300, 200],
  ['Legajo', 'Apellido y Nombre', 'Recibo', '999 - Sueldo Basico', '1000 - Sueldo Basico'],
  [null, null, null, 'Imp', 'Imp'],
  ['1', 'Sanguinetti', 'R1', 100, null],
  ['007', 'Falcioni', 'R2', 200, null],
  ['2', 'Albella', 'R3', null, 200],
  ['TOTAL GENERAL', null, null, 300, 200],
]);

{
  const { parsedRows, parseMetadata: m } = readTabAxton(siasa);

  assert('el preámbulo de 1 fila (más el TOTAL GENERAL de arriba) no corre nada de lugar',
    m.filasPreambulo === 2 && m.filaEncabezado === 3 && m.primeraFilaDatos === 5);
  assert('sin ninguna columna Cant → variante axton_imp', m.formato === 'axton_imp');
  assert('lee el campo Reporte: del preámbulo', m.reporte === 'Resumen de Liquidacion');
  assert('lee el período y la empresa del preámbulo',
    m.periodo === '2026-07' && m.empresa === 'Empresa de Ejemplo');

  // D-065: la cantidad ausente NUNCA se completa por inferencia. La clave no
  // existe —no vale null— para que nadie la confunda con "vino vacía".
  assert('declara que el archivo no trae cantidades', m.cantidadesDisponibles === false);
  assert('la clave cant_<codigo> NO existe cuando el archivo no trae la columna',
    !('cant_999' in parsedRows[0]) && ('imp_999' in parsedRows[0]));
  assert('avisa que hay que pedir el export con cantidades y que el control sale INCIERTO',
    m.avisos.some(a => a.includes('sólo con importes') && a.includes('INCIERTO')));

  assert('dos códigos con el mismo rótulo se leen por separado',
    m.conceptos.map(c => c.codigo).join(',') === '999,1000' &&
    m.conceptos[0].nombre === m.conceptos[1].nombre);
  assert('el legajo de la fila de Sanguinetti tiene sólo el concepto 999',
    parsedRows[0].imp_999 === 100 && parsedRows[0].imp_1000 === null);

  assert('reconoce el TOTAL GENERAL duplicado arriba y abajo',
    m.totalGeneralDuplicado === true && m.totalGeneralFilas.join(',') === '2,8');
  assert('las sumas cierran contra el TOTAL GENERAL', m.totalesQueNoCierran.length === 0);
  assert('"Recibo" es ficha, no un concepto sin código',
    m.conceptos.length === 2 && m.columnasSinClasificar.length === 0);

  // El legajo sale crudo: '007' no se toca acá. Quién es el mismo empleado lo
  // decide el control con la clave del cliente (D-038).
  assert('el legajo viaja crudo, sin normalizar', parsedRows[1].legajo === '007');
  assert('con la clave default, 007 y 7 serían el mismo empleado — pero acá son tres legajos',
    m.uniqueLegajos === 3);
}

// ── Coelsa / Geopagos: preámbulo de 2 filas, basura alrededor ────────────────
// Filas agregadas a mano DEBAJO del TOTAL GENERAL (con fórmulas), una fila con
// datos y sin legajo, una columna con importes y sin código, y el mismo código en
// dos columnas.

const coelsa = xlsxDe('Liquidaciones.20260731.090011.1', [
  ['EA: Otra Empresa | Reporte: Consulta de Liquidacion | Periodo: 07/2026 - 07/2026 |'],
  ['----'],
  ['Legajo', 'Apellido y Nombre', 'Centro de Costo',
    '1000 - Sueldo Basico', '1000 - Sueldo Basico (ajuste)', 'Ayuda especial', 'liquidacion'],
  [null, null, null, 'Imp', 'Imp', 'Imp', null],
  ['1', 'Sanguinetti', 'ADM', 100, 50, 25, 'Mensual 07-2026'],
  [null, null, null, 7, null, null, null],
  ['TOTAL GENERAL', null, null, 100, 50, 25, null],
  [null, 'Total calculado a mano', null, 100, null, null, null],
]);

{
  const { parsedRows, parseMetadata: m } = readTabAxton(coelsa);

  assert('el preámbulo de 2 filas se saltea por firma, no por posición',
    m.filasPreambulo === 2 && m.filaEncabezado === 3 && m.primeraFilaDatos === 5);
  assert('lee el Reporte: cuando es "Consulta de Liquidacion"', m.reporte === 'Consulta de Liquidacion');

  // Lo de abajo del TOTAL GENERAL no son datos: son los cálculos que el analista
  // agrega al pie. Leerlos como empleados metería importes inventados al cruce.
  assert('la fila de abajo del TOTAL GENERAL no entra como dato',
    m.totalRows === 1 && m.filasPostTotal.join(',') === '8');
  assert('…y sale como aviso, no en silencio',
    m.avisos.some(a => a.includes('debajo del TOTAL GENERAL')));

  assert('la fila con datos y sin legajo se cuenta y se informa',
    m.filasSinLegajo.join(',') === '6' && m.avisos.some(a => a.includes('no tiene') && a.includes('legajo')));

  // Un código repetido en dos columnas no se pisa: la segunda viaja aparte.
  assert('el código repetido en dos columnas se lee como <codigo>__2',
    m.conceptos.map(c => c.codigo).join(',') === '1000,1000__2');
  assert('…con las dos letras de columna en el aviso',
    m.avisos.some(a => a.includes('1000__2') && a.includes('D') && a.includes('E')));
  assert('los dos importes del código repetido viajan por separado',
    parsedRows[0].imp_1000 === 100 && parsedRows[0].imp_1000__2 === 50);

  // Una columna con importes y sin código no se ignora ni se adivina por nombre.
  assert('la columna con importes y sin código se lista aparte',
    m.columnasSinClasificar.length === 1 &&
    m.columnasSinClasificar[0].letra === 'F' &&
    m.columnasSinClasificar[0].rotulo === 'Ayuda especial');
  assert('…y sale como aviso con su rótulo',
    m.avisos.some(a => a.includes('Ayuda especial') && a.includes('no se pudo atribuir')));
}

// ── TOTAL GENERAL duplicado DEBAJO de los encabezados ───────────────────────
// La variante duplicada puede traer la copia de arriba dentro del preámbulo (caso
// SIASA, más arriba) o pegada debajo de los subencabezados. Si el lector tomara la
// PRIMERA copia como cierre del archivo, todo lo de abajo —o sea la nómina
// entera— saldría descartado como "fila agregada a mano" y el archivo se leería
// sin un solo empleado.

{
  const totalArribaYAbajo = xlsxDe('Liquidaciones.20260731.090011.9', [
    ['Legajo', '1000 - Sueldo Basico', null],
    [null, 'Cant', 'Imp'],
    ['TOTAL GENERAL', 60, 300],
    ['1', 30, 100],
    ['2', 30, 200],
    ['TOTAL GENERAL', 60, 300],
  ]);
  const { parsedRows, parseMetadata: m } = readTabAxton(totalArribaYAbajo);
  assert('con el TOTAL GENERAL duplicado debajo de los encabezados, la nómina se lee igual',
    m.totalRows === 2 && parsedRows.map(r => r.legajo).join(',') === '1,2');
  assert('…se reconocen las dos copias y ninguna fila queda como post-total',
    m.totalGeneralFilas.join(',') === '3,6' && m.filasPostTotal.length === 0);
  assert('…y las sumas cierran contra el TOTAL GENERAL', m.totalesQueNoCierran.length === 0);
}

// ── La suma que no cierra: aviso, no error ──────────────────────────────────
// El export puede venir retocado a mano (D-065) y el resto del archivo sigue
// sirviendo. Lo que no puede pasar es que no se note.

{
  const editado = xlsxDe('Liquidaciones.20260731.090011.2', [
    ['Legajo', '1000 - Sueldo Basico', null],
    [null, 'Cant', 'Imp'],
    ['1', 30, 100],
    ['TOTAL GENERAL', 30, 999],
  ]);
  const { parseMetadata: m } = readTabAxton(editado);
  assert('un concepto cuya suma no cierra se informa, y el archivo se lee igual',
    m.totalesQueNoCierran.length === 1 &&
    m.totalesQueNoCierran[0].sumado === 100 &&
    m.totalesQueNoCierran[0].archivo === 999);
  assert('…y el aviso dice qué columna y los dos números',
    m.avisos.some(a => a.includes('no cierra') && a.includes('999')));
}

// ── Importes es-AR, CBU y hoja renombrada ───────────────────────────────────
// El export re-guardado desde Excel pierde el nombre de hoja de Axton y puede
// traer los importes como texto "1.234,56". El CBU lleva ceros a la izquierda:
// leído como número pasaría a notación científica y se perdería.
//
// El CBU inventado de acá tiene 18 dígitos, no los 22 de uno real, a propósito:
// el chequeo de datos sensibles frena cualquier cadena de 22 dígitos seguidos
// (`scripts/check-datos-sensibles.mjs`) y tiene razón en frenarla. Lo que se
// prueba —que un número largo con ceros adelante sobreviva como texto— es lo
// mismo con 18 que con 22.

{
  const CBU_INVENTADO = '000000000000000001';

  const reguardado = xlsxDe('Hoja1', [
    ['Legajo', 'CBU', '1000 - Sueldo Basico', null],
    [null, null, 'Cant', 'Imp'],
    ['1', CBU_INVENTADO, 30, '1.234,56'],
  ], [['Tcs', [[null]]]]);

  const { parsedRows, parseMetadata: m } = readTabAxton(reguardado);
  assert('un importe es-AR ("1.234,56") se lee como 1234.56', parsedRows[0].imp_1000 === 1234.56);
  assert('el CBU se conserva como texto, con sus ceros a la izquierda',
    parsedRows[0].cbu === CBU_INVENTADO);
  assert('avisa que la hoja no tiene el nombre de Axton',
    m.avisos.some(a => a.includes('Ninguna hoja se llama')));
  assert('avisa qué hojas del archivo no se leyeron',
    m.avisos.some(a => a.includes('no se leyeron') || a.includes('se leyó sólo')));
  assert('avisa cuando no hay fila TOTAL GENERAL para validar',
    m.avisos.some(a => a.includes('No encontré la fila TOTAL GENERAL')));
  assert('avisa cuando falta la columna "liquidacion", que es la que dice de qué paga es cada fila',
    m.avisos.some(a => a.includes('no trae la columna "liquidacion"')) &&
    m.fichaFaltante.includes('liquidacion'));
}

// ── layoutTabAxton: la estructura, sin leer datos ───────────────────────────

{
  const l = layoutTabAxton({
    sheetName: 'Liquidaciones.20260728.035742.6',
    maxCol: 3,
    rows: [
      ['EA: X | Reporte: Resumen de Liquidacion |'],
      ['Legajo', 'Apellido y Nombre', '1000 - Sueldo Basico', null],
      [null, null, 'Cant', 'Imp'],
      ['1', 'Sanguinetti', 30, 100],
    ],
  });
  assert('layoutTabAxton resuelve la fila de encabezados y la variante',
    l.filaEncabezado === 1 && l.filaSub === 2 && l.variante === 'axton');
  assert('layoutTabAxton resuelve el par Cant/Imp del concepto',
    l.conceptos[0].idxCant === 2 && l.conceptos[0].idxImp === 3);
}

// ── Cortes con error claro (nunca adivinar) ─────────────────────────────────

assertThrows('sin fila de encabezados corta y dice qué columna se buscó',
  () => readTabAxton(xlsxDe('Hoja1', [['Nombre', 'Apellido'], ['Sanguinetti', 'Javier']])),
  'Legajo');

assertThrows('sin subencabezados Cant/Imp corta, en vez de adivinar si es cantidad o importe',
  () => readTabAxton(xlsxDe('Liquidaciones.20260728.035742.6', [
    ['Legajo', '1000 - Sueldo Basico'],
    ['1', 100],
  ])),
  'subencabezados');

assertThrows('sin ninguna columna de concepto corta y muestra la forma esperada',
  () => readTabAxton(xlsxDe('Liquidaciones.20260728.035742.6', [
    ['Legajo', 'Apellido y Nombre', 'Bruto', null],
    [null, null, 'Cant', 'Imp'],
    ['1', 'Sanguinetti', 30, 100],
  ])),
  '1000 - Sueldo Basico');

assertThrows('sin filas de empleado corta y dice desde qué fila se buscaron',
  () => readTabAxton(xlsxDe('Liquidaciones.20260728.035742.6', [
    ['Legajo', '1000 - Sueldo Basico', null],
    [null, 'Cant', 'Imp'],
    ['TOTAL GENERAL', 30, 100],
  ])),
  'ninguna fila de empleado');

// El totalizador subido en el casillero del Tabulado: se reconoce por el campo
// `Reporte:` y se explica, en vez de morir más adelante hablando de columnas.
assertThrows('el "Totales de Concepto" subido como Tabulado corta explicando qué archivo es',
  () => readTabAxton(xlsxDe('Liquidaciones.20260731.101122.3', [
    ['EA: Empresa | Reporte: Totales de Concepto | Periodo: 07/2026 - 07/2026 |'],
    ['Legajo', 'Nro', 'Concepto', 'Importe'],
    ['1', '1000', 'Sueldo Basico', 100],
  ])),
  'Totales de Concepto');

// ── El totalizador como fuente complementaria del cruce ─────────────────────
// Existe porque el Tabulado NO trae todos los conceptos liquidados: en Red Bull un
// concepto está sumado dentro de la columna Exento sin columna propia, en Epiroc
// dos códigos y en SIASA siete aparecen sólo acá. Sin este lector, N2 no puede
// distinguir "no se liquidó" de "el Tabulado no lo muestra".

const totalizador = xlsxDe('totalesconcepto.20260731.1011', [
  ['EA: Empresa de Ejemplo | Reporte: Totales de Concepto | Periodo: 07/2026 - 07/2026 |'],
  ['----'],
  ['Legajo', 'Centro de Costo', 'Nro', 'Concepto', 'Cantidad', 'Importe', 'Liquidacion'],
  ['1', 'ADM', '1000', 'Sueldo Basico', 30, 100, 'Mensual 07-2026'],
  ['1', 'ADM', '605130', 'Obra Social A', null, 10, 'Mensual 07-2026'],
  ['2', 'ADM', '605130', 'Obra Social B', null, 20, 'Mensual 07-2026'],
  ['TOTAL', null, null, null, null, 130, null],
  ['3', 'ADM', null, 'Concepto sin numero', null, 5, null],
]);

{
  const { parsedRows, parseMetadata: m } = readTotalesConcepto(totalizador);

  assert('lee el totalizador aunque NO traiga las cuentas contables',
    parsedRows.length === 3 && m.totalRows === 3);
  assert('prefiere la hoja "totalesconcepto.*"', m.sheetName === 'totalesconcepto.20260731.1011');
  assert('la unidad es legajo × concepto × liquidación',
    parsedRows[0].legajo === '1' && parsedRows[0].codigo === '1000' &&
    parsedRows[0].cantidad === 30 && parsedRows[0].importe === 100);
  assert('la cantidad vacía es null, no 0', parsedRows[1].cantidad === null);
  assert('declara que el reporte trae cantidades', m.cantidadDisponible === true);
  assert('el legajo viaja crudo y el período sale del preámbulo',
    parsedRows[2].legajo === '2' && m.periodo === '2026-07');

  assert('la fila de totales del propio export no es un movimiento',
    m.filasIgnoradas.join(',') === '7');
  assert('la fila sin número de concepto se cuenta y se informa',
    m.filasSinCodigo.join(',') === '8' && m.avisos.some(a => a.includes('número de concepto')));
  assert('los números de fila de los avisos son los del archivo, no del array filtrado',
    parsedRows[0].fila === 4);

  // Un código puede colapsar varios conceptos reales (SIASA: 605130 = 10 obras
  // sociales). No es un error, pero el analista tiene que saberlo antes de leer
  // una diferencia por concepto.
  assert('detecta el código que agrupa más de un rótulo',
    m.codigosConVariosRotulos.length === 1 && m.codigosConVariosRotulos[0].codigo === '605130');
  assert('…y lo avisa', m.avisos.some(a => a.includes('605130') && a.includes('más de un concepto')));
}

{
  // Sin columna Cantidad: se lee igual, se avisa, y la clave no existe (D-065).
  const soloImportes = xlsxDe('totalesconcepto.20260731.1012', [
    ['EA: Empresa | Reporte: Totales de Concepto | Periodo: 07/2026 - 07/2026 |'],
    ['Legajo', 'Nro', 'Concepto', 'Importe'],
    ['1', '1000', 'Sueldo Basico', 100],
  ]);
  const { parsedRows, parseMetadata: m } = readTotalesConcepto(soloImportes);
  assert('sin columna Cantidad el totalizador se lee igual', parsedRows.length === 1);
  assert('…la clave cantidad NO existe, no vale 0', !('cantidad' in parsedRows[0]));
  assert('…y avisa que del totalizador sólo se pueden comparar importes',
    m.cantidadDisponible === false && m.avisos.some(a => a.includes('sólo se pueden comparar importes')));
}

assertThrows('un totalizador sin la columna Importe corta nombrándola',
  () => readTotalesConcepto(xlsxDe('totalesconcepto.20260731.1013', [
    ['Legajo', 'Nro', 'Concepto'],
    ['1', '1000', 'Sueldo Basico'],
  ])),
  'Importe');

console.log(`\n${ok} OK, ${fail} FAIL`);
if (fail > 0) process.exit(1);
