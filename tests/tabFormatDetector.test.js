// tabFormatDetector.test.js — Las firmas de formato del Tabulado (pieza T)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/tabFormatDetector.test.js
//
// Este test es el criterio de detección escrito como assert: el formato se
// decide por la firma del ARCHIVO (nombre de hoja, preámbulo, subencabezados),
// nunca por el cliente ni por posición de columna. Las firmas salen de 6
// archivos reales de 4 clientes (07/2026); acá se reproducen con datos
// inventados — un export de cliente no entra al repo ni como fixture.

import * as XLSXmod from 'xlsx';
globalThis.XLSX = XLSXmod;

const { sniffContainer, classifyTabulado, detectTabFormat, compareLayouts } =
  await import('./js/parsers/tabFormatDetector.js');
const { autoDetectTabMapping } = await import('./js/parsers/tabuladoControl.js');

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
function xlsxDe(sheetName, aoa) {
  const wb = XLSXmod.utils.book_new();
  XLSXmod.utils.book_append_sheet(wb, XLSXmod.utils.aoa_to_sheet(aoa), sheetName);
  return XLSXmod.write(wb, { type: 'array', bookType: 'xlsx' });
}

// ── Meta4 horizontal (`tabulado_h`) ──────────────────────────────────────────
// Encabezados en fila 1, conceptos con el código pegado al nombre, totales al
// final SIN etiqueta (ficha vacía), no liquidado = 0 explícito.

const meta4h = xlsxDe('tabulado_h', [
  ['ID_EMPLEADO', 'FEC_PAGO', 'APPELIDO Y NOMBRE', 'CUIL', '1003-SUELDO', '401-DIAS_TRAB', 'NETO'],
  ['1', '2026-07-31', 'Sanguinetti', '(cuil inventado)', 100, 30, 100],
  ['2', '2026-07-31', 'Falcioni', '(cuil inventado)', 200, 30, 200],
  [null, null, null, null, null, null, null],
  [null, null, null, null, 300, 60, 300],
]);

{
  const r = detectTabFormat(meta4h);
  assert('tabulado_h → formato meta4_h', r.format === 'meta4_h');
  assert('tabulado_h → sistema Meta4', r.sistema === 'Meta4');
  assert('tabulado_h → la evidencia nombra la hoja', r.evidencia.some(e => e.includes('tabulado_h')));
}

// ── Axton completo (pares Cant/Imp) ──────────────────────────────────────────
// Hoja `Liquidaciones.<timestamp>`, subencabezado Cant/Imp, TOTAL GENERAL.

const axtonFull = xlsxDe('Liquidaciones.20260728.035742.6', [
  ['Legajo', 'Apellido y Nombre', 'CUIL', 'Bruto', null, '1000 - Sueldo Basico', null],
  [null, null, null, 'Cant', 'Imp', 'Cant', 'Imp'],
  ['1', 'Sanguinetti', '(cuil inventado)', 30, 100, 30, 100],
  ['TOTAL GENERAL', null, null, 30, 100, 30, 100],
]);

{
  const r = detectTabFormat(axtonFull);
  assert('Liquidaciones.<timestamp> con Cant/Imp → formato axton', r.format === 'axton');
  assert('axton → sistema Axton', r.sistema === 'Axton');
}

// ── Axton reducido a sólo importes (variante SIASA) ─────────────────────────
// Preámbulo EA en fila 1, TOTAL GENERAL duplicado arriba, subencabezado sólo
// Imp. Dos códigos distintos pueden compartir nombre ("Sueldo Basico"):
// por eso los conceptos se ubican por código, jamás por nombre.

const axtonImp = xlsxDe('Liquidaciones.20260730.114122.4', [
  ['EA: Empresa de Ejemplo | Usuario: u@ejemplo | Reporte: Resumen de Liquidacion | Periodo: 07/2026 - 07/2026 | Tipo: Mensual |'],
  ['TOTAL GENERAL', null, null, null, 300, 300],
  ['Legajo', 'Apellido y Nombre', 'CUIL', 'Recibo', '999 - Sueldo Basico', '1000 - Sueldo Basico'],
  [null, null, null, 'Imp', 'Imp', 'Imp'],
  ['1', 'Sanguinetti', '(cuil inventado)', null, 100, null],
  ['2', 'Falcioni', '(cuil inventado)', null, null, 200],
  ['TOTAL GENERAL', null, null, null, 300, 300],
]);

{
  const r = detectTabFormat(axtonImp);
  assert('Liquidaciones.<timestamp> sin ningún Cant → formato axton_imp', r.format === 'axton_imp');
  assert('axton_imp → sistema Axton', r.sistema === 'Axton');
}

// ── El campo `Reporte:` del preámbulo (N0b) ─────────────────────────────────
// Los tres exports de Axton arrancan igual —mismo preámbulo, columna Legajo— y lo
// único que los distingue es el campo `Reporte:`. Sin esa firma, el totalizador
// subido en el casillero del Tabulado se clasificaba como `axton_imp` y el error
// aparecía recién al leerlo, hablando de subencabezados que el archivo nunca tuvo.

{
  const r = detectTabFormat(axtonImp);
  assert('el detector devuelve el campo Reporte: del preámbulo',
    r.reporte === 'Resumen de Liquidacion');
}
{
  const r = detectTabFormat(axtonFull);
  assert('sin preámbulo (POP, Epiroc, Geopagos), reporte queda en null', r.reporte === null);
}

// El totalizador: formato largo, una fila por legajo × concepto × liquidación, sin
// subencabezados Cant/Imp. Se reconoce por el `Reporte:` y por el nombre de hoja.
const totalesPorReporte = xlsxDe('Hoja1', [
  ['EA: Empresa de Ejemplo | Reporte: Totales de Concepto | Periodo: 07/2026 - 07/2026 |'],
  ['----'],
  ['Legajo', 'Nro', 'Concepto', 'Cantidad', 'Importe'],
  ['1', '1000', 'Sueldo Basico', 30, 100],
]);

{
  const r = detectTabFormat(totalesPorReporte);
  assert('preámbulo con "Reporte: Totales de Concepto" → axton_tot', r.format === 'axton_tot');
  assert('axton_tot → sistema Axton', r.sistema === 'Axton');
  assert('…y la evidencia dice que no es el Tabulado',
    r.evidencia.some(e => e.includes('no el Tabulado')));
}
{
  const r = classifyTabulado({
    sheetName: 'totalesconcepto.20260731.101122.3',
    rows: [['Legajo', 'Nro', 'Concepto', 'Importe'], ['1', '1000', 'Sueldo Basico', 100]],
  });
  assert('hoja "totalesconcepto.*" → axton_tot aunque no haya preámbulo', r.format === 'axton_tot');
}
{
  // Un Tabulado normal NO se confunde con el totalizador: su Reporte: es otro.
  const r = classifyTabulado({
    sheetName: 'Liquidaciones.20260730.114122.4',
    rows: [['EA: Empresa | Reporte: Consulta de Liquidacion |'], ['Legajo'], [null, 'Imp']],
  });
  assert('"Reporte: Consulta de Liquidacion" sigue siendo Tabulado', r.format === 'axton_imp');
  assert('…y el reporte viaja tal cual', r.reporte === 'Consulta de Liquidacion');
}

// ── Marcadores internos, cuando el nombre de hoja no alcanza ─────────────────
// Un re-guardado puede cambiar marcas; el preámbulo EA o los encabezados de la
// fila 1 tienen que alcanzar para clasificar igual.

{
  const r = classifyTabulado({
    sheetName: 'Hoja1',
    rows: [['EA: Empresa | Reporte: Resumen de Liquidacion |'], ['TOTAL GENERAL'], ['Legajo', 'CUIL'], [null, 'Imp']],
  });
  assert('hoja renombrada + preámbulo EA → axton_imp', r.format === 'axton_imp');
}
{
  const r = classifyTabulado({
    sheetName: 'Hoja1',
    rows: [['ID_EMPLEADO', 'CUIL', '1003-SUELDO'], ['1', '(cuil inventado)', 100]],
  });
  assert('hoja renombrada + fila 1 con ID_EMPLEADO y código pegado → meta4_h', r.format === 'meta4_h');
}
{
  const r = classifyTabulado({ sheetName: 'Hoja1', rows: [['Nombre', 'Apellido'], ['Sanguinetti', 'Javier']] });
  assert('archivo sin ninguna firma → format null', r.format === null);
  assert('…y la evidencia dice qué se buscó', r.evidencia.some(e => e.includes('tabulado_h')));
}

// ── Cortes con error claro (nunca adivinar el formato) ───────────────────────

assertThrows('un Excel sin firma conocida corta y nombra las firmas buscadas',
  () => detectTabFormat(xlsxDe('Hoja1', [['Nombre', 'Apellido'], ['Sanguinetti', 'Javier']])),
  'No se reconoció el formato');

{
  // Firma OLE2: .xlsx cifrado con contraseña o .xls binario viejo.
  const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]).buffer;
  assert('sniffContainer reconoce OLE2', sniffContainer(ole2) === 'ole2');
  assertThrows('un archivo cifrado corta pidiendo la versión sin contraseña',
    () => detectTabFormat(ole2), 'contraseña');
}

{
  const htmlEA = new TextEncoder().encode('<span>EA: Empresa | Periodo: 07/2026</span><table><tr><td>Legajo</td></tr></table>').buffer;
  assert('sniffContainer reconoce HTML disfrazado', sniffContainer(htmlEA) === 'html');
  const r = detectTabFormat(htmlEA);
  assert('HTML con preámbulo EA → axton_imp', r.format === 'axton_imp');

  const htmlOtro = new TextEncoder().encode('<html><body><p>hola</p></body></html>').buffer;
  assertThrows('HTML sin preámbulo EA corta con error', () => detectTabFormat(htmlOtro), 'HTML');
}

// ── Comparación de layouts entre dos archivos ────────────────────────────────
// Que entren o salgan columnas es lo esperado cuando cambian los conceptos
// liquidados (POP 116→128 en el mismo mes): aviso, no error.

{
  const r = compareLayouts(
    ['ID_EMPLEADO', 'CUIL', '1003-SUELDO', '401-DIAS_TRAB'],
    ['ID_EMPLEADO', 'CUIL', '1003-SUELDO', '4430-UN_HORAS_50'],
  );
  assert('compareLayouts detecta la columna que entró', r.entraron.length === 1 && r.entraron[0] === '4430-UN_HORAS_50');
  assert('compareLayouts detecta la columna que salió', r.salieron.length === 1 && r.salieron[0] === '401-DIAS_TRAB');
  assert('compareLayouts cuenta las comunes', r.comunes === 3);
}

// ── Alias de ficha del Meta4 personalizado (Finadiet / POF) ──────────────────
// Mismo formato, distinta ficha por cliente: ID_EMPLEADO en vez de EMPLEADO y
// el typo literal APPELIDO. Si esto deja de matchear, el analista mapea a mano
// un archivo que la app sabía leer sola.

{
  const mapping = autoDetectTabMapping(['ID_EMPLEADO', 'FEC_PAGO', 'APPELIDO Y NOMBRE', 'CUIL', '1003-SUELDO']);
  assert('autoDetect resuelve ID_EMPLEADO como columna de empleado', mapping?.empleadoColumn === 'ID_EMPLEADO');
  assert('autoDetect resuelve el typo APPELIDO Y NOMBRE', mapping?.apellidoNombreColumn === 'APPELIDO Y NOMBRE');
  assert('autoDetect resuelve CUIL', mapping?.cuilColumn === 'CUIL');
}

console.log(`\n${ok} OK, ${fail} FAIL`);
if (fail > 0) process.exit(1);
