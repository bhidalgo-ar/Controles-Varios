// consolidate.test.js — Los fundamentos de cálculo de la Fase 1 (D-042).
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/consolidate.test.js
//
// Tres reglas que antes vivían copiadas en 7 y 4 lugares respectivamente, y que
// por eso divergieron:
//   1. `toNum` — leer un importe distinguiendo el string es-AR del número que ya
//      viene parseado, sin elegir un bando (lo que trababa la Fase 1).
//   2. `legajoKey` — si `'007'` y `'7'` son el mismo empleado (D-038).
//   3. `groupRowsByLegajo`/`sumColumn` — consolidar liquidaciones múltiples.
//
// Datos 100% inventados (legajos '1'/'2', apellidos Sanguinetti/Falcioni).

const { toNum, diffOrNull } = await import('./js/utils/currency.js');
const { legajoKey, makeLegajoKey, LEGAJO_KEY_MODES, DEFAULT_LEGAJO_KEY_MODE, isValidLegajoKeyMode } =
  await import('./js/utils/legajo.js');
const { groupRowsByLegajo, sumColumn, lastRow } = await import('./js/controls/consolidate.js');
const { buildColByCode, resolveTabColumn, TAB_CODE_SEEDS } = await import('./js/controls/tabCodes.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── 1. toNum ─────────────────────────────────────────────────────────────────
// El caso que hacía imposible unificar "hacia el más común": los dos formatos
// tienen que convivir, porque llegan de dos fuentes distintas (SheetJS entrega
// números; el Tabulado HTML entrega strings es-AR).

assert('number pasa sin tocar (SheetJS ya parseó la celda)', toNum(1234.56) === 1234.56);
assert('string es-AR con miles y decimales: "1.234,56" → 1234.56', toNum('1.234,56') === 1234.56);
assert('string con punto decimal: "1234.56" → 1234.56 (NO 123456)', toNum('1234.56') === 1234.56);
assert('miles es-AR sin decimales: "1.234" → 1234', toNum('1.234') === 1234);
assert('miles es-AR largo: "12.345.678" → 12345678', toNum('12.345.678') === 12345678);
assert('decimal solo: "1.5" → 1.5 (no son grupos de tres)', toNum('1.5') === 1.5);
assert('coma decimal sola: "1234,56" → 1234.56', toNum('1234,56') === 1234.56);
assert('formato en-US: "1,234.56" → 1234.56 (el último separador es el decimal)', toNum('1,234.56') === 1234.56);
assert('miles con comas: "1,234,567" → 1234567', toNum('1,234,567') === 1234567);
assert('negativo entre paréntesis: "(1.234,56)" → -1234.56', toNum('(1.234,56)') === -1234.56);
assert('negativo con signo: "-1.234,56" → -1234.56', toNum('-1.234,56') === -1234.56);
assert('con símbolo de moneda: "$ 1.234,56" → 1234.56', toNum('$ 1.234,56') === 1234.56);
assert('con espacio duro de miles (export HTML de Meta4)', toNum('1 234,56') === 1234.56);
assert('cero es cero, no null', toNum('0') === 0 && toNum(0) === 0);

assert('celda vacía → null, no 0', toNum('') === null);
assert('null → null', toNum(null) === null);
assert('undefined → null', toNum(undefined) === null);
assert('guión solo → null', toNum('-') === null);
assert('texto → null', toNum('abc') === null);
assert('el "Null" literal del reporte de M4 → null', toNum('Null') === null);
assert('NaN → null', toNum(NaN) === null);
assert('Infinity → null', toNum(Infinity) === null);
assert('booleano → null (no 1/0: un true no es un importe)', toNum(true) === null);
assert('Date → null (una fecha no es un importe)', toNum(new Date(2026, 3, 25)) === null);

assert('null no se compara contra nada: diffOrNull(null, 0) === null', diffOrNull(toNum(''), 0) === null);
assert('0 sí se compara: diffOrNull(0, 0) === 0', diffOrNull(toNum('0'), 0) === 0);

// ── 2. legajoKey ─────────────────────────────────────────────────────────────

assert('el default global ignora ceros a la izquierda (decisión de Willy, 2026-08-12)',
  DEFAULT_LEGAJO_KEY_MODE === LEGAJO_KEY_MODES.SIN_CEROS);
assert('por default "007" y "7" son el MISMO empleado',
  legajoKey('007') === legajoKey('7'));
assert('en modo trim "007" y "7" son empleados DISTINTOS',
  legajoKey('007', LEGAJO_KEY_MODES.TRIM) !== legajoKey('7', LEGAJO_KEY_MODES.TRIM));
assert('trim siempre: " 7 " → "7" en los dos modos',
  legajoKey(' 7 ') === '7' && legajoKey(' 7 ', LEGAJO_KEY_MODES.TRIM) === '7');
assert('legajo numérico de Excel (number) funciona igual que su string',
  legajoKey(7076) === legajoKey('7076'));
assert('el legajo "0" no se vacía al sacarle los ceros', legajoKey('0') === '0');
assert('sin dato → "" (quien agrupa descarta la fila)',
  legajoKey('') === '' && legajoKey(null) === '' && legajoKey(undefined) === '');
assert('un legajo con letras no se toca: "0A12" queda "0A12"', legajoKey('0A12') === '0A12');
assert('"12-B" y "12-C" NO colapsan (lo que hacía el parseInt de catXEmpleados)',
  legajoKey('12-B') !== legajoKey('12-C'));
assert('un modo inválido cae al default en vez de romper el cruce',
  makeLegajoKey('cualquiera')('007') === '7');
assert('isValidLegajoKeyMode filtra basura',
  isValidLegajoKeyMode('sin_ceros') && !isValidLegajoKeyMode('nope'));

// ── 3. groupRowsByLegajo / sumColumn ─────────────────────────────────────────

const tabRows = [
  { Legajo: '1', SUELDO: '1.000,50', NOMBRE: 'Sanguinetti' },   // liquidación mensual
  { Legajo: '1', SUELDO: '500,25',   NOMBRE: 'Sanguinetti' },   // liquidación de baja
  { Legajo: '2', SUELDO: '0',        NOMBRE: 'Falcioni' },
  { Legajo: '',  SUELDO: '999',      NOMBRE: 'sin legajo' },
];

const groups = groupRowsByLegajo(tabRows, 'Legajo');
assert('agrupa por legajo: 2 legajos de 4 filas', groups.size === 2);
assert('el legajo con doble paga junta sus 2 liquidaciones', groups.get('1').length === 2);
assert('descarta las filas sin legajo en vez de inventar uno vacío', !groups.has(''));
assert('preserva el orden de aparición de los legajos',
  [...groups.keys()].join(',') === '1,2');

assert('SUMA las liquidaciones del legajo, no las pisa (el bug más caro del repo)',
  Math.abs(sumColumn(groups.get('1'), 'SUELDO') - 1500.75) < 0.01);
assert('un legajo con una sola liquidación devuelve su valor', sumColumn(groups.get('2'), 'SUELDO') === 0);
assert('columna sin mapear → null, no 0', sumColumn(groups.get('1'), null) === null);
assert('columna que ninguna liquidación trajo → null, no 0',
  sumColumn(groups.get('1'), 'NO_EXISTE') === null);
assert('un valor real entre celdas vacías igual suma',
  sumColumn([{ C: '' }, { C: '100' }, { C: null }], 'C') === 100);
assert('todas las celdas vacías → null (no hay dato, no es cero verificado)',
  sumColumn([{ C: '' }, { C: null }], 'C') === null);
assert('lastRow devuelve la última liquidación (de ahí salen los datos de ficha)',
  lastRow(groups.get('1')).SUELDO === '500,25');
assert('lastRow de un grupo vacío no explota', lastRow([]) === null);

assert('sin filas devuelve un Map vacío, no explota',
  groupRowsByLegajo(null, 'Legajo').size === 0 && groupRowsByLegajo([], 'Legajo').size === 0);
assert('sin columna de legajo devuelve un Map vacío',
  groupRowsByLegajo(tabRows, null).size === 0);

// La misma clave a los dos lados del cruce: el Tabulado trae el legajo con ceros
// y el reporte sin ellos, y aun así tienen que matchear.
const keyFn   = makeLegajoKey(DEFAULT_LEGAJO_KEY_MODE);
const gTab    = groupRowsByLegajo([{ L: '007', V: '100' }], 'L', { keyFn });
const gReport = groupRowsByLegajo([{ L: '7',   V: '100' }], 'L', { keyFn });
assert('"007" en el Tabulado matchea con "7" en el reporte usando la misma keyFn',
  [...gTab.keys()][0] === [...gReport.keys()][0]);

// `toNum` parametrizable: un control con su propia lectura de importes sigue
// pudiendo usar el módulo compartido (es lo que necesitaba Variaciones).
assert('toNum se puede reemplazar por control',
  sumColumn([{ C: 'x' }, { C: 'x' }], 'C', { toNum: () => 10 }) === 20);

// ── 4. tabCodes ──────────────────────────────────────────────────────────────

const sampleTabRow = {
  'EMPLEADO': 7076,
  '1003-SUELDO': 100,
  '1017-A_CTA_FUT_AUMEN': 0,
  '4899-COCHERA_IG': 111,
  '8802-GTOS_PERSONAL': 222,
  '8805-DTO_COCHERA': 333,
  '3903-INDEM_PREAVISO': 0,
  '1163': 5,
};

const byCode = buildColByCode(sampleTabRow);
assert('extrae el código del encabezado "1003-SUELDO"', byCode['1003'] === '1003-SUELDO');
assert('soporta el encabezado numérico exacto "1163"', byCode['1163'] === '1163');
assert('no inventa códigos para encabezados de texto', byCode['EMPLEADO'] === undefined);
assert('encabezados sin código no entran al mapa', Object.keys(byCode).length === 7);

assert('resuelve GTOS_PERSONALES por código 8802',
  resolveTabColumn(sampleTabRow, 'tabGtosPersonalesColumn', null) === '8802-GTOS_PERSONAL');
assert('resuelve DTO_COCHERA por 8805 y NO agarra 4899-COCHERA_IG',
  resolveTabColumn(sampleTabRow, 'tabDtoCocheraColumn', null) === '8805-DTO_COCHERA');
assert('lo confirmado por el analista gana sobre la semilla (D-039)',
  resolveTabColumn(sampleTabRow, 'tabDtoCocheraColumn', 'MI_COLUMNA') === 'MI_COLUMNA');
assert('una clave sin semilla no se resuelve sola: null, y el Paso 2 la pide',
  resolveTabColumn(sampleTabRow, 'tabAsigPasColumn', null) === null);
assert('una semilla que no está en el archivo del mes → null, nunca 0,00',
  resolveTabColumn({ 'EMPLEADO': 1 }, 'tabSalBaseColumn', null) === null);
assert('las semillas de Brutos son las que ya estaban cableadas (1003/1017)',
  TAB_CODE_SEEDS.tabSalBaseColumn === '1003' && TAB_CODE_SEEDS.tabACuFutAumenColumn === '1017');
assert('los 8 conceptos NR no liquidados en el Tabulado de muestra quedan sin semilla',
  ['tabIndemAntFalleColumn', 'tabIndmMaternidadColumn', 'tabGratVacColumn', 'tabGraVacnogSacColumn',
   'tabIndemFuerMayColumn', 'tabIndemEmbarazoColumn', 'tabAsigPasColumn', 'tabIncrementoStColumn']
    .every(k => TAB_CODE_SEEDS[k] === undefined));

// ── 5. La opción del cliente se aplica sola en los controles ─────────────────
// Lo que Willy pidió: elegir una vez cómo se toma el legajo y que se despliegue
// en cada entregable y vista del cliente, sin tocar control por control. El modo
// viaja en `mapping.legajoKeyMode` (lo pone el wizard desde `clients`), así que
// este test vale como contrato para cualquier control nuevo.

globalThis.document = { addEventListener: () => {} };
const { runGsPers } = await import('./js/controls/gsPers.js');

const mapGs = {
  gs_pers: { legajoColumn: 'Legajo', gtosPersonalesColumn: 'GTOS', dtoCocheraColumn: 'DTO' },
  tab:     { empleadoColumn: 'Legajo', tabGtosPersonalesColumn: 'GTOS_TAB', tabDtoCocheraColumn: 'DTO_TAB' },
};
// El reporte trae el legajo sin ceros y el Tabulado con ceros — el mismo empleado.
const gsRows  = [{ Legajo: '7',   GTOS: '1000', DTO: '0' }];
const tabDesp = [{ Legajo: '007', GTOS_TAB: '1000', DTO_TAB: '0' }];

const conCeros = runGsPers(gsRows, tabDesp, { ...mapGs, legajoKeyMode: LEGAJO_KEY_MODES.SIN_CEROS });
assert('con el default del cliente, "7" del reporte cruza contra "007" del Tabulado',
  conCeros.rows[0].tabValGtos === 1000 && conCeros.summary.sinTabData === 0);

const conTrim = runGsPers(gsRows, tabDesp, { ...mapGs, legajoKeyMode: LEGAJO_KEY_MODES.TRIM });
assert('con el cliente en modo trim, el mismo archivo da el legajo sin datos en Tabulado',
  conTrim.rows[0].tabValGtos === null && conTrim.summary.sinTabData === 1);

assert('un cliente sin la opción configurada usa el default, no rompe el cruce',
  runGsPers(gsRows, tabDesp, mapGs).rows[0].tabValGtos === 1000);

// El reporte de GS Pers también se consolida: con dos filas del mismo legajo,
// el control saca UNA fila con la suma, no dos comparando contra el total.
const gsDosFilas = [
  { Legajo: '7', GTOS: '600', DTO: '0' },
  { Legajo: '7', GTOS: '400', DTO: '0' },
];
const rDos = runGsPers(gsDosFilas, tabDesp, mapGs);
assert('dos filas del mismo legajo en el reporte salen consolidadas en una',
  rDos.rows.length === 1 && rDos.rows[0].gtos === 1000);
assert('y contra el Tabulado (1000) no inventa diferencia',
  Math.abs(rDos.rows[0].ctrlGtos) < 0.01);

console.log(`\n${ok} ok, ${fail} fail`);
if (fail > 0) process.exit(1);
