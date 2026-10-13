// costoTotalParser.js — Parser del Reporte de Costo Total por empleado (M4)
//
// Columnas clave: ID Empleado (Legajo) y COSTO TOTAL.
// Es el reporte de Rendimiento bajado a nivel de empleado: una fila por legajo.
// Igual que el de Rendimiento por CC, trae el dato que identifica la fila (acá
// el legajo) en la primera columna, que suele venir SIN título.
/* global XLSX */
import { detectHeaders } from './nominaMaestra.js';
import { nombrarColumnasSinTitulo } from './rendimientoParser.js';
export { detectHeaders };

/**
 * Los encabezados del Reporte de Costo Total, con las columnas SIN título
 * nombradas como las nombra el parser ('__EMPTY', '__EMPTY_1'…). Con el título
 * vacío, el Paso 2 no podía ofrecer la primera columna —se confundía con "sin
 * elegir"— y el legajo quedaba sin asignar. Mismo arreglo que el Reporte de
 * Rendimiento (`detectHeadersRendimiento`).
 */
export function detectHeadersCostoTotal(arrayBuffer) {
  const { headers, preview } = detectHeaders(arrayBuffer);
  return { headers: nombrarColumnasSinTitulo(headers), preview };
}

// Variantes de encabezado conocidas (uppercase) para cada campo
const LEGAJO_VARIANTS = ['ID_EMPLEADO', 'ID EMPLEADO', 'LEGAJO', 'EMPLEADO', 'ID'];
const COSTO_VARIANTS  = ['COSTO TOTAL', 'COSTO_TOTAL', 'COSTOTOTAL'];

/** Una columna sin título, ya nombrada como la nombra el parser. */
const esSinTitulo = h => /^__EMPTY(_\d+)?$/.test(String(h ?? ''));

/**
 * Auto-detección de columnas del Reporte de Costo Total.
 * @param {string[]} headers — resultado de detectHeaders(), '' para celdas vacías
 *   (o ya nombradas por `detectHeadersCostoTotal`: la cuenta da lo mismo)
 */
export function autoDetectCostoTotalMapping(headers) {
  // detectHeaders() devuelve '' para celdas vacías; el parser nombra esas mismas
  // posiciones '__EMPTY', '__EMPTY_1'…
  const normalizedHeaders = nombrarColumnasSinTitulo(headers);

  const uc = h => String(h ?? '').trim().toUpperCase();
  const mapping = {};

  // El legajo, en este orden: un título conocido; si no hay, la primera columna
  // cuando viene sin título (así baja el reporte de M4); y recién al final un
  // título que CONTENGA "LEGAJO" o "EMPLEADO". La búsqueda por contenido va
  // última porque agarra cualquier cosa que nombre al empleado —un "NOMBRE
  // EMPLEADO" le gana a la columna del legajo si va antes.
  mapping.legajoColumn =
    normalizedHeaders.find(h => LEGAJO_VARIANTS.includes(uc(h)))
    || (esSinTitulo(normalizedHeaders[0]) ? normalizedHeaders[0] : null)
    || normalizedHeaders.find(h => uc(h).includes('LEGAJO') || uc(h).includes('EMPLEADO'))
    || null;

  mapping.costoTotalColumn =
    normalizedHeaders.find(h => COSTO_VARIANTS.includes(uc(h)))
    || normalizedHeaders.find(h => uc(h).includes('COSTO'))
    || null;

  if (!mapping.legajoColumn || !mapping.costoTotalColumn) return null;
  return mapping;
}

/**
 * Parsea el Reporte de Costo Total por empleado.
 * Excluye filas sin legajo y filas de subtotales ("Total general…").
 */
export function parseCostoTotal(arrayBuffer, mapping) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  // Los nombres de columna salen de la misma cuenta que usa el Paso 2
  // (`nombrarColumnasSinTitulo`), y no de `sheet_to_json` a secas: si la celda
  // del título existe pero está vacía, SheetJS nombra la columna `''` en vez de
  // `__EMPTY`, y el legajo elegido en el Paso 2 no se encontraba.
  const encabezados = (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })[0] || [])
    .map(h => (h !== null ? String(h).trim() : ''));
  // Los datos arrancan en la fila siguiente a la de títulos, contada desde
  // donde empieza el área usada de la hoja y no desde la fila 1: si la hoja
  // trae filas vacías arriba, `range: 1` metía la fila de títulos como dato.
  const filaTitulos = XLSX.utils.decode_range(sheet['!ref'] || 'A1').s.r;
  const rawRows  = XLSX.utils.sheet_to_json(sheet, {
    header: nombrarColumnasSinTitulo(encabezados), range: filaTitulos + 1, defval: null,
  });

  if (rawRows.length === 0) throw new Error('El archivo está vacío o no tiene filas de datos.');

  const legajoCol = mapping.legajoColumn;
  if (!legajoCol) throw new Error('No se configuró la columna de Legajo.');

  const parsedRows = rawRows.filter(row => {
    const legajo = String(row[legajoCol] ?? '').trim();
    if (!legajo) return false;
    if (legajo.toLowerCase().startsWith('total')) return false;
    return true;
  });

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      parsedAt:  new Date().toISOString(),
    },
  };
}
