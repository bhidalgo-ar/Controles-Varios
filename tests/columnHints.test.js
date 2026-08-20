// columnHints.test.js — La muestra de valores y el aviso de tipo de una columna
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/columnHints.test.js
//
// Lo que este test protege, y por qué cada caso está acá:
//   - La muestra **saltea celdas vacías** en vez de cortar en la primera: una
//     columna de indemnizaciones tiene dato en 3 de 500 filas, y mostrar dos
//     celdas vacías no dice nada.
//   - El aviso es **conservador**: salta sólo si NINGUNO de los valores se parece
//     al tipo esperado. Un aviso que salta de más se ignora a la tercera vez y
//     deja de proteger (mismo riesgo de fatiga que specs/contrato-export.md anota
//     para las omisiones declaradas).
//   - `'txt'` **nunca** avisa: un importe es texto válido, así que lo contrario
//     sería un aviso permanente en la mitad de las columnas.
//   - Todo valor sale **escapado**: viene de un Excel de un tercero.

const {
  columnValues, columnValuesFromMatrix, formatSampleValue,
  looksLikeType, checkColumnType, columnHintHtml,
} = await import('./js/ui/columnHints.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── columnValues: filas como objetos (el Tabulado ya parseado) ────────────────

{
  const rows = [
    { 'LEG': '1', '3913-INDEM_ANT_DESP': '' },
    { 'LEG': '2', '3913-INDEM_ANT_DESP': null },
    { 'LEG': '3', '3913-INDEM_ANT_DESP': '   ' },
    { 'LEG': '4', '3913-INDEM_ANT_DESP': '1.234,56' },
    { 'LEG': '5', '3913-INDEM_ANT_DESP': '890,00' },
    { 'LEG': '6', '3913-INDEM_ANT_DESP': '77' },
  ];
  const vals = columnValues(rows, '3913-INDEM_ANT_DESP');
  assert('saltea vacíos, null y espacios: agarra los 3 con dato',
    vals.length === 3 && vals[0] === '1.234,56' && vals[2] === '77');

  assert('respeta el máximo de filas a mirar',
    columnValues(rows, 'LEG', 2).length === 2);

  assert('el cero ES dato (0 no es "vacío" — CLAUDE.md)',
    columnValues([{ c: 0 }, { c: 0 }], 'c').length === 2);

  assert('columna sin elegir devuelve vacío', columnValues(rows, '').length === 0);
  assert('columna que no existe en las filas devuelve vacío',
    columnValues(rows, 'NO_EXISTE').length === 0);
  assert('filas que no son array devuelven vacío', columnValues(null, 'LEG').length === 0);
  assert('sin ninguna fila con dato devuelve vacío',
    columnValues([{ c: '' }, { c: null }], 'c').length === 0);
}

// ── columnValuesFromMatrix: la vista previa de la pantalla de carga ───────────

{
  const headers = ['LEGAJO', 'FEC_PAGO', 'IMPORTE'];
  const preview = [
    ['1', '', '1.000,00'],
    ['2', '15/03/2026', '2.000,00'],
    ['3', '28/03/2026', ''],
  ];
  const fechas = columnValuesFromMatrix(preview, headers, 'FEC_PAGO');
  assert('lee la columna por su posición en los encabezados',
    fechas.length === 2 && fechas[0] === '15/03/2026' && fechas[1] === '28/03/2026');

  assert('una columna que no está en los encabezados devuelve vacío',
    columnValuesFromMatrix(preview, headers, 'OTRA').length === 0);
  assert('sin vista previa devuelve vacío',
    columnValuesFromMatrix(undefined, headers, 'FEC_PAGO').length === 0);
}

// ── formatSampleValue ────────────────────────────────────────────────────────

{
  assert('una fecha real se muestra dd/mm/aaaa',
    formatSampleValue(new Date(2026, 2, 15)) === '15/03/2026');
  assert('un valor largo se trunca con …',
    formatSampleValue('ADMINISTRACION Y FINANZAS CORPORATIVO').endsWith('…') &&
    formatSampleValue('ADMINISTRACION Y FINANZAS CORPORATIVO').length === 22);
  assert('los espacios de más se colapsan',
    formatSampleValue('  SANGUINETTI    JAVIER  ') === 'SANGUINETTI JAVIER');
  assert('un número pasa tal cual', formatSampleValue(1234.56) === '1234.56');
}

// ── looksLikeType ────────────────────────────────────────────────────────────

{
  assert("'num': un importe es-AR se reconoce", looksLikeType('1.234,56', 'num'));
  assert("'num': un número ya parseado se reconoce", looksLikeType(1234.56, 'num'));
  assert("'num': un nombre no", !looksLikeType('SANGUINETTI JAVIER', 'num'));
  assert("'date': dd/mm/aaaa se reconoce", looksLikeType('15/03/2026', 'date'));
  assert("'date': aaaa-mm-dd se reconoce", looksLikeType('2026-03-15', 'date'));
  assert("'date': un serial de Excel dentro del rango se reconoce", looksLikeType(46142, 'date'));
  assert("'date': un serial que viajó como string también (Tabulado HTML)",
    looksLikeType('46142', 'date'));
  assert("'date': un importe chico NO parece fecha", !looksLikeType(1234.56, 'date'));
  assert("'date': un texto NO parece fecha", !looksLikeType('CONTADO', 'date'));
  assert("'txt' acepta cualquier cosa", looksLikeType('1.234,56', 'txt') && looksLikeType('X', 'txt'));
  assert('sin tipo declarado acepta cualquier cosa', looksLikeType('X', null));
}

// ── checkColumnType: el aviso ────────────────────────────────────────────────

{
  assert("'num' con importes: no avisa",
    checkColumnType(['1.234,56', '890,00'], 'num') === null);

  const avisoNum = checkColumnType(['SANGUINETTI JAVIER', 'FALCIONI JULIO'], 'num');
  assert("'num' con nombres: avisa", avisoNum !== null);
  assert('…y el mensaje habla de importes, no de tipos de dato',
    avisoNum.mensaje.includes('importes') && !avisoNum.mensaje.includes('num'));

  const avisoFecha = checkColumnType(['1.234,56', '890,00'], 'date');
  assert("'date' con importes: avisa (el caso que motivó la feature)", avisoFecha !== null);
  assert('…y el mensaje habla de fechas', avisoFecha.mensaje.includes('fechas'));

  assert("'date' con fechas: no avisa",
    checkColumnType(['15/03/2026', '28/03/2026'], 'date') === null);

  assert('conservador: con UN valor que sí parece, no avisa',
    checkColumnType(['SANGUINETTI', 'FALCIONI', '1.234,56'], 'num') === null);

  assert("'txt' nunca avisa",
    checkColumnType(['1.234,56', '890,00'], 'txt') === null);
  assert('sin tipo declarado nunca avisa',
    checkColumnType(['SANGUINETTI', 'FALCIONI'], null) === null);

  assert('con UN SOLO valor con dato no se afirma nada (poca evidencia)',
    checkColumnType(['SANGUINETTI JAVIER'], 'num') === null);
  assert('sin ningún valor con dato no se afirma nada',
    checkColumnType([], 'num') === null);
  assert('valores que no son array: no avisa',
    checkColumnType(undefined, 'num') === null);
}

// ── columnHintHtml ───────────────────────────────────────────────────────────

{
  const html = columnHintHtml(['15/03/2026', '28/03/2026', '02/04/2026'], 'date', { esc });
  assert('la muestra sale con el prefijo "ej.:"', html.includes('ej.:'));
  assert('muestra 2 valores, no los 3', html.includes('15/03/2026') && html.includes('28/03/2026') &&
    !html.includes('02/04/2026'));
  assert('los separa con ·', html.includes(' · '));
  assert('sin aviso no dibuja la línea de aviso', !html.includes('col-hint--warn'));

  const conAviso = columnHintHtml(['1.234,56', '890,00'], 'date', { esc });
  assert('con aviso dibuja la línea de aviso', conAviso.includes('col-hint--warn') && conAviso.includes('⚠'));
  assert('…y sigue mostrando la muestra (el analista necesita ver QUÉ eligió)',
    conAviso.includes('1.234,56'));

  assert('sin valores no dibuja nada (una línea vacía en 27 columnas es ruido)',
    columnHintHtml([], 'num', { esc }) === '');
  assert('valores que no son array: no dibuja nada',
    columnHintHtml(null, 'num', { esc }) === '');

  const peligroso = columnHintHtml(['SANGUINETTI & <b>FALCIONI</b>', 'A "B"'], 'txt', { esc });
  assert('escapa & y las etiquetas HTML',
    peligroso.includes('&amp;') && peligroso.includes('&lt;b&gt;') && !peligroso.includes('<b>'));
  assert('escapa la comilla doble', peligroso.includes('&quot;'));

  let tiro = false;
  try { columnHintHtml(['x', 'y'], 'txt', {}); } catch { tiro = true; }
  assert('sin `esc` corta con error en vez de emitir HTML sin escapar', tiro);
}

// ── columnWarningsOf: el aviso, anotado en los resultados de la corrida ──────
// Se recalcula de lo que la corrida ya guarda (filas + mapeo de cada archivo),
// así que no hay una segunda copia que pueda desincronizarse. Los stubs son los
// mismos que usa tests/exportContracts.test.js: la pantalla de resultados
// arrastra js/db.js, que necesita Dexie sobre una IndexedDB falsa.

globalThis.document = { addEventListener: () => {} };
await import('fake-indexeddb/auto');
const Dexie = (await import('dexie')).default;
globalThis.Dexie = Dexie;

const { columnWarningsOf } = await import('./js/ui/controlsResults.js');

{
  // El Tabulado guarda sus filas con los encabezados originales, así que la
  // columna elegida se puede volver a leer tal cual.
  const tabFile = {
    fileType: 'tab_control',
    mapping: { empleadoColumn: 'LEGAJO', tabFecPagoColumn: 'FORMA_PAGO' },
    parsedRows: [
      { LEGAJO: '1', FORMA_PAGO: 'TRANSFERENCIA', 'FEC_PAGO': '15/03/2026' },
      { LEGAJO: '2', FORMA_PAGO: 'CHEQUE',        'FEC_PAGO': '15/03/2026' },
    ],
  };
  const avisos = columnWarningsOf([tabFile]);
  assert('avisa por la columna de fecha mapeada a FORMA_PAGO',
    avisos.length === 1 && avisos[0].columna === 'FORMA_PAGO');
  assert('…y dice de qué archivo es', avisos[0].fileType === 'tab_control');

  const bien = columnWarningsOf([{
    ...tabFile,
    mapping: { empleadoColumn: 'LEGAJO', tabFecPagoColumn: 'FEC_PAGO' },
  }]);
  assert('con la columna correcta no avisa nada', bien.length === 0);
}

{
  // Una clave de mapeo cuyo valor no es una columna del archivo (omisión ⊘,
  // período, config) se saltea sin necesidad de saber nada de cada parser.
  const avisos = columnWarningsOf([{
    fileType: 'nr_file',
    mapping: { legajoColumn: 'LEGAJO', indemPreavisoColumn: '__omitido__', period: '2026-03' },
    parsedRows: [{ LEGAJO: '1' }, { LEGAJO: '2' }],
  }]);
  assert('una omisión declarada (⊘) no genera aviso', avisos.length === 0);
}

{
  assert('sin archivos no avisa', columnWarningsOf([]).length === 0);
  assert('un archivo sin filas no avisa',
    columnWarningsOf([{ fileType: 'nr_file', mapping: { legajoColumn: 'LEG' }, parsedRows: [] }]).length === 0);
  assert('runFiles undefined no explota', columnWarningsOf(undefined).length === 0);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
