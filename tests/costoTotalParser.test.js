// costoTotalParser.test.js — Tests unitarios del parser de Reporte de Costo Total (M4)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/costoTotalParser.test.js
// (o adaptar a <script type="module"> en browser, cargando XLSX por CDN)
//
// Nota: los fixtures se generan en memoria con datos inventados/anonimizados.
// Nunca incluir datos personales reales de empleados en estos tests.

import * as XLSX from './node_modules/xlsx/xlsx.mjs';
globalThis.XLSX = XLSX; // el parser usa el global XLSX (como en browser)

import {
  autoDetectCostoTotalMapping, parseCostoTotal, detectHeadersCostoTotal,
} from './js/parsers/costoTotalParser.js';

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

/** Arma un ArrayBuffer .xlsx a partir de un array de arrays (fila 1 = encabezados). */
function buildXlsx(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

// ── autoDetectCostoTotalMapping ───────────────────────────────────────────────

// Encabezados típicos del reporte real: ID_EMPLEADO + COSTO TOTAL
{
  const m = autoDetectCostoTotalMapping(['ID_EMPLEADO', 'NOMBRE', 'COSTO TOTAL']);
  assert('auto-detección ID_EMPLEADO + COSTO TOTAL → mapping no null', m !== null);
  assert('  legajoColumn = ID_EMPLEADO', m && m.legajoColumn === 'ID_EMPLEADO');
  assert('  costoTotalColumn = COSTO TOTAL', m && m.costoTotalColumn === 'COSTO TOTAL');
}

// Variante LEGAJO + case-insensitive en costo
{
  const m = autoDetectCostoTotalMapping(['Legajo', 'Apellido', 'Costo Total']);
  assert('auto-detección Legajo + Costo Total (case-insensitive)', m !== null);
  assert('  legajoColumn = Legajo', m && m.legajoColumn === 'Legajo');
  assert('  costoTotalColumn = Costo Total', m && m.costoTotalColumn === 'Costo Total');
}

// Fallback por "includes": encabezados no exactos pero que contienen LEGAJO / COSTO
{
  const m = autoDetectCostoTotalMapping(['Nro de Legajo', 'Costo Mensual Total']);
  assert('auto-detección por contains (Nro de Legajo / Costo Mensual Total)', m !== null
    && m.legajoColumn === 'Nro de Legajo'
    && m.costoTotalColumn === 'Costo Mensual Total');
}

// Encabezados vacíos se normalizan a __EMPTY / __EMPTY_n y no rompen
{
  const m = autoDetectCostoTotalMapping(['', 'EMPLEADO', '', 'COSTO TOTAL']);
  assert('encabezados vacíos no rompen la detección', m !== null
    && m.legajoColumn === 'EMPLEADO'
    && m.costoTotalColumn === 'COSTO TOTAL');
}

// Auto-detección fallida → null
{
  assert('sin columna de costo → null',
    autoDetectCostoTotalMapping(['LEGAJO', 'FECHA', 'IMPORTE']) === null);
  assert('sin columna de legajo → null',
    autoDetectCostoTotalMapping(['SECTOR', 'COSTO TOTAL']) === null);
  assert('encabezados irrelevantes → null',
    autoDetectCostoTotalMapping(['FECHA', 'CONCEPTO', 'IMPORTE']) === null);
  assert('array vacío → null',
    autoDetectCostoTotalMapping([]) === null);
}

// ── parseCostoTotal ───────────────────────────────────────────────────────────

const MAPPING = { legajoColumn: 'ID_EMPLEADO', costoTotalColumn: 'COSTO TOTAL' };

// Datos inventados con la misma estructura que el reporte real (sin datos personales)
const FIXTURE = buildXlsx([
  ['ID_EMPLEADO', 'NOMBRE',          'COSTO TOTAL'],
  [1001,          'EMPLEADO PRUEBA A', 1500000.5],
  [1002,          'EMPLEADO PRUEBA B', 2300000],
  [null,          '',                  999],          // fila sin legajo → excluir
  ['',            'FILA VACIA',        123],          // legajo vacío → excluir
  ['Total general', null,              3800000.5],    // subtotal → excluir
]);

{
  const { parsedRows, parseMetadata } = parseCostoTotal(FIXTURE, MAPPING);
  assert('parseo: excluye filas sin legajo y "Total general" (quedan 2)', parsedRows.length === 2);
  assert('  metadata.totalRows = 2', parseMetadata.totalRows === 2);
  assert('  fila 1: legajo 1001 con costo 1500000.5',
    String(parsedRows[0]['ID_EMPLEADO']) === '1001' && parsedRows[0]['COSTO TOTAL'] === 1500000.5);
  assert('  fila 2: legajo 1002 con costo 2300000',
    String(parsedRows[1]['ID_EMPLEADO']) === '1002' && parsedRows[1]['COSTO TOTAL'] === 2300000);
  assert('  metadata.parsedAt es ISO string', typeof parseMetadata.parsedAt === 'string'
    && !isNaN(Date.parse(parseMetadata.parsedAt)));
}

// "total" en minúsculas también se excluye (startsWith case-insensitive)
{
  const buf = buildXlsx([
    ['ID_EMPLEADO', 'COSTO TOTAL'],
    [1001, 100],
    ['total Sector A', 100],
  ]);
  const { parsedRows } = parseCostoTotal(buf, MAPPING);
  assert('parseo: excluye "total ..." en minúsculas', parsedRows.length === 1);
}

// Archivo vacío (solo encabezados, sin filas de datos) → error
{
  let threw = null;
  try { parseCostoTotal(buildXlsx([['ID_EMPLEADO', 'COSTO TOTAL']]), MAPPING); }
  catch (e) { threw = e; }
  assert('archivo sin filas de datos → lanza error "vacío"',
    threw !== null && /vac/i.test(threw.message));
}

// Mapping sin columna de legajo → error
{
  let threw = null;
  try { parseCostoTotal(FIXTURE, { legajoColumn: null, costoTotalColumn: 'COSTO TOTAL' }); }
  catch (e) { threw = e; }
  assert('mapping sin legajoColumn → lanza error de configuración',
    threw !== null && /legajo/i.test(threw.message));
}

// ── La primera columna sin título (el legajo, como baja el reporte de M4) ────
// El Paso 2 la tiene que poder ofrecer, la auto-detección la tiene que tomar si
// ningún título dice "legajo", y el parser la tiene que nombrar IGUAL que el
// Paso 2 — si no, la columna elegida no se encuentra al leer las filas.

/** Arma un .xlsx con la celda A1 escrita pero vacía (no sólo ausente). */
function buildXlsxConA1Vacia(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws.A1 = { t: 's', v: '' };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

const SIN_TITULO_AOA = [
  [null,  'APELLIDO Y NOMBRE DEL EMPLEADO', 'COSTO TOTAL'],
  ['1',   'SANGUINETTI JAVIER',             1500000.5],
  ['2',   'ALBELLA GUSTAVO',                2300000],
  ['Total general', null,                   3800000.5],
];

for (const [desc, buf] of [
  ['celda A1 ausente', buildXlsx(SIN_TITULO_AOA)],
  ['celda A1 escrita vacía', buildXlsxConA1Vacia(SIN_TITULO_AOA)],
]) {
  const { headers } = detectHeadersCostoTotal(buf);
  assert(`Paso 2 (${desc}): la primera columna sin título se ofrece como __EMPTY`,
    headers[0] === '__EMPTY' && headers[2] === 'COSTO TOTAL');

  const m = autoDetectCostoTotalMapping(headers);
  assert(`auto-detección (${desc}): toma la primera columna sin título como legajo`,
    m !== null && m.legajoColumn === '__EMPTY' && m.costoTotalColumn === 'COSTO TOTAL');

  const { parsedRows } = parseCostoTotal(buf, m);
  assert(`parseo (${desc}): la columna elegida en el Paso 2 se encuentra al leer (2 legajos)`,
    parsedRows.length === 2
    && String(parsedRows[0].__EMPTY) === '1' && parsedRows[0]['COSTO TOTAL'] === 1500000.5
    && String(parsedRows[1].__EMPTY) === '2' && parsedRows[1]['COSTO TOTAL'] === 2300000);
}

// La primera columna sin título le gana a un título que sólo CONTIENE
// "EMPLEADO": ése es el nombre, no el legajo.
{
  const m = autoDetectCostoTotalMapping(['', 'APELLIDO Y NOMBRE DEL EMPLEADO', 'COSTO TOTAL']);
  assert('auto-detección: con 1ª col. sin título, no elige "…DEL EMPLEADO" como legajo',
    m !== null && m.legajoColumn === '__EMPTY');
}

// Un título conocido sigue mandando sobre la columna sin título.
{
  const m = autoDetectCostoTotalMapping(['', 'ID_EMPLEADO', 'COSTO TOTAL']);
  assert('auto-detección: un título conocido (ID_EMPLEADO) le gana a la 1ª col. sin título',
    m !== null && m.legajoColumn === 'ID_EMPLEADO');
}

// Los encabezados que ya vienen nombrados por el Paso 2 dan el mismo resultado.
{
  const m = autoDetectCostoTotalMapping(['__EMPTY', 'NOMBRE', 'COSTO TOTAL']);
  assert('auto-detección: encabezados ya nombrados (__EMPTY) → mismo legajo',
    m !== null && m.legajoColumn === '__EMPTY');
}

// Sin columna sin título adelante, la búsqueda por contenido sigue igual.
{
  const m = autoDetectCostoTotalMapping(['NOMBRE', '', 'COSTO TOTAL']);
  assert('auto-detección: una columna sin título que NO es la primera no se toma como legajo',
    m === null);
}

// ── Resultado ─────────────────────────────────────────────────────────────────
console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
