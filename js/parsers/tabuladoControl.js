// tabuladoControl.js — Parser del Tabulado estandarizado para el contexto de Controles
//
// A diferencia del parser de Nómina Maestra (que extrae conceptos monetarios),
// este parser extrae solo las columnas de dimensión del empleado:
//   EMPLEADO, APELLIDO Y NOMBRE, PUESTO, ID_CENTRO_COSTO, CENTRO_COSTO, DEPTO(UNIDAD), CUIL
//
/* global XLSX */
import { detectHeaders as detectHeadersXlsx } from './nominaMaestra.js';
import {
  isHtmlTabulado,
  parseHtmlTabulado,
  htmlTabuladoToObjects,
} from './tabuladoHtml.js';

// Columnas estándar del Tabulado (nombre exacto → clave de mapping).
// Cada clave admite varios nombres posibles: el Tabulado de Meta4 los trae en
// mayúsculas con guión bajo, y el de los sistemas que exportan HTML (OPmobility)
// los trae en formato título ("Legajo", "Apellido y Nombre").
const TAB_STD_COLS = {
  empleadoColumn:       ['EMPLEADO', 'LEGAJO'],
  apellidoNombreColumn: ['APELLIDO Y NOMBRE'],
  puestoColumn:         ['PUESTO'],
  idCCColumn:           ['ID_CENTRO_COSTO'],
  ccColumn:             ['CENTRO_COSTO'],
  deptoColumn:          ['DEPTO(UNIDAD)'],
  cuilColumn:           ['CUIL'],
};

const TAB_REQUIRED_KEYS = ['empleadoColumn'];

/**
 * Devuelve los encabezados del Tabulado, sea un Excel real o HTML disfrazado
 * de .xls (ver `tabuladoHtml.js`).
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], preview: any[][] }}
 */
export function detectHeaders(arrayBuffer) {
  if (!isHtmlTabulado(arrayBuffer)) return detectHeadersXlsx(arrayBuffer);
  const { headers, rows } = parseHtmlTabulado(arrayBuffer);
  return { headers, preview: rows.slice(0, 3) };
}

/**
 * Intenta detectar automáticamente el mapping a partir de los encabezados.
 * Retorna el mapping si la columna de empleado se encontró, null si no.
 *
 * @param {string[]} headers
 * @returns {object|null}
 */
export function autoDetectTabMapping(headers) {
  const mapping = {};
  for (const [key, nombres] of Object.entries(TAB_STD_COLS)) {
    for (const colName of nombres) {
      const idx = headers.findIndex(h =>
        h === colName || String(h).trim().toLowerCase() === colName.toLowerCase()
      );
      if (idx >= 0) { mapping[key] = headers[idx]; break; }
    }
  }
  const allRequired = TAB_REQUIRED_KEYS.every(k => mapping[k]);
  return allRequired ? mapping : null;
}

/**
 * Parsea el Tabulado y retorna las columnas de dimensión de empleado.
 * No extrae conceptos monetarios.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {object} mapping - { empleadoColumn, apellidoNombreColumn?, puestoColumn?, ... }
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 */
export function parseTabuladoControl(arrayBuffer, mapping) {
  if (isHtmlTabulado(arrayBuffer)) return parseTabuladoControlHtml(arrayBuffer, mapping);

  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Sin header:1 → usa primera fila como claves de los objetos
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

  if (rawRows.length === 0) throw new Error('El archivo está vacío o no tiene filas de datos.');

  const empCol = mapping.empleadoColumn;
  if (!empCol) throw new Error('No se configuró la columna de Empleado.');

  // IDs como "0870" pueden venir como número 870 con formato "0000". Recuperamos
  // el texto formateado de Excel para preservar los ceros a la izquierda.
  preserveFormattedTextColumn(sheet, rawRows, empCol);

  // Solo incluir filas que tengan un ID de empleado válido
  const parsedRows = rawRows.filter(row => {
    const emp = row[empCol];
    return emp !== null && emp !== undefined && String(emp).trim() !== '';
  });

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      parsedAt:  new Date().toISOString(),
    },
  };
}

/**
 * Rama del Tabulado que llega como HTML disfrazado de .xls.
 * Devuelve la misma forma que la rama de Excel, más la metadata que el propio
 * archivo trae en su encabezado (razón social, período y quincena) — la usa el
 * control de Variaciones para saber a qué período corresponde el archivo.
 */
function parseTabuladoControlHtml(arrayBuffer, mapping) {
  const parsed = parseHtmlTabulado(arrayBuffer);
  const empCol = mapping.empleadoColumn;
  if (!empCol) throw new Error('No se configuró la columna de Empleado.');

  const rows = htmlTabuladoToObjects(parsed);
  const parsedRows = rows.filter(row => {
    const emp = row[empCol];
    return emp !== null && emp !== undefined && String(emp).trim() !== '';
  });

  if (parsedRows.length === 0) {
    throw new Error('El archivo está vacío o no tiene filas de datos.');
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      parsedAt:  new Date().toISOString(),
      format:    'html',
      empresa:   parsed.meta.empresa,
      period:    parsed.meta.period,
      quincena:  parsed.meta.quincena,
      totalRow:  parsed.totalRow,
      headers:   parsed.headers,
    },
  };
}

/**
 * Recupera el texto formateado de Excel (cell.w) para una columna numérica.
 * Útil cuando el ID está guardado como número (870) pero formateado con ceros
 * a la izquierda ("0000" → "0870"). Sin este paso, sheet_to_json devuelve 870
 * y se pierde el cero adelante necesario para hacer match contra el reporte.
 */
function preserveFormattedTextColumn(sheet, rawRows, columnName) {
  if (!columnName || !sheet['!ref']) return;
  const range = XLSX.utils.decode_range(sheet['!ref']);

  let colIdx = -1;
  for (let c = range.s.c; c <= range.e.c; c++) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c })];
    if (headerCell && String(headerCell.v).trim() === columnName) {
      colIdx = c;
      break;
    }
  }
  if (colIdx < 0) return;

  const map = new Map();
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c: colIdx })];
    if (cell && cell.t === 'n' && cell.w && cell.w !== String(cell.v)) {
      map.set(String(cell.v), cell.w);
    }
  }
  if (map.size === 0) return;

  for (const row of rawRows) {
    const v = row[columnName];
    if (typeof v === 'number') {
      const key = String(v);
      if (map.has(key)) row[columnName] = map.get(key);
    }
  }
}
