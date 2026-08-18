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
  extraerMetadata,
  clavesUnicas,
} from './tabuladoHtml.js';

// Columnas estándar del Tabulado (nombre exacto → clave de mapping).
// Cada clave admite varios nombres posibles: el Tabulado de Meta4 los trae en
// mayúsculas con guión bajo, y el de los sistemas que exportan HTML (OPmobility)
// los trae en formato título ("Legajo", "Apellido y Nombre").
const TAB_STD_COLS = {
  empleadoColumn:       ['EMPLEADO', 'LEGAJO', 'ID_EMPLEADO'],
  // 'APPELIDO' con doble P es literal del export Meta4 de Finadiet y POF — el
  // typo viene del sistema y matchearlo es más barato que explicárselo al
  // analista cada mes. No "corregirlo".
  apellidoNombreColumn: ['APELLIDO Y NOMBRE', 'APPELIDO Y NOMBRE'],
  puestoColumn:         ['PUESTO'],
  idCCColumn:           ['ID_CENTRO_COSTO'],
  ccColumn:             ['CENTRO_COSTO'],
  deptoColumn:          ['DEPTO(UNIDAD)'],
  cuilColumn:           ['CUIL'],
};

const TAB_REQUIRED_KEYS = ['empleadoColumn'];

// ── Tabulado exportado como Excel real, con preámbulo ────────────────────────
//
// El mismo Tabulado que OPmobility exporta como HTML puede llegar como .xlsx:
// alcanza con que alguien lo abra en Excel y lo guarde. Ahí el archivo deja de
// tener el preámbulo en un <span> y pasa a tenerlo en celdas, con esta forma:
//
//   fila 0   "EA: … | Periodo: 03/2025 … | Tipo: 2da Quincena c/ sobregiro | …"
//   fila 1   TOTAL GENERAL …
//   fila 2   Legajo | Apellido y Nombre | CUIL | … | 2517 - Premio de progreso | …
//   fila 3   (vacío) | … | Imp | Imp | …
//   fila 4+  datos
//
// `sheet_to_json` usa la primera fila como encabezados, así que sin esto el
// archivo entra y mapea cualquier cosa — el "encabezado" pasa a ser el texto
// del preámbulo. El camino nuevo se activa SOLO cuando la primera fila no
// parece de encabezados, así los otros 11 controles (Excel normal, encabezados
// en la fila 1) siguen por la rama de siempre.

const TAB_PRIMERA_COLUMNA = /^(legajo|empleado|id_empleado)$/i;

// Hasta dónde buscar la fila de encabezados. El preámbulo real son 2 filas;
// el margen cubre variantes sin obligar a recorrer un archivo entero.
const MAX_FILAS_PREAMBULO = 10;

function hojaTabulado(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  return workbook.Sheets[workbook.SheetNames[0]];
}

/** Filas crudas de la hoja como array de arrays. Números como números (ver `toNum` del control). */
function filasDeHoja(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

/** Índice de la fila de encabezados. 0 = la primera fila ya lo es (caso normal). */
function ubicarFilaEncabezados(aoa) {
  const limite = Math.min(aoa.length, MAX_FILAS_PREAMBULO);
  for (let i = 0; i < limite; i++) {
    const primera = aoa[i]?.[0];
    if (primera != null && TAB_PRIMERA_COLUMNA.test(String(primera).trim())) return i;
  }
  return 0;
}

const esTotalGeneral = fila => /TOTAL\s+GENERAL/i.test(String(fila?.[0] ?? ''));

/** ¿Es la fila de "Imp" que va debajo de los encabezados? Sin legajo y con texto repetido. */
const esFilaImp = fila => (fila?.[0] == null || String(fila[0]).trim() === '')
  && fila.some(c => c != null && String(c).trim() !== '');

/**
 * Lee un Tabulado en Excel con preámbulo: encabezados, filas de datos, la fila
 * TOTAL GENERAL y la metadata del propio archivo.
 */
function leerTabuladoConPreambulo(aoa, headerRowIdx) {
  const headers = (aoa[headerRowIdx] || []).map(h => (h !== null && h !== undefined ? String(h).trim() : ''));

  const rows = [];
  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const fila = aoa[i];
    if (!fila || esTotalGeneral(fila) || esFilaImp(fila)) continue;
    if (fila[0] === null || fila[0] === undefined || String(fila[0]).trim() === '') continue;
    rows.push(fila);
  }

  // El preámbulo entero (todo lo que está antes de los encabezados) se le pasa
  // a `extraerMetadata`, que ya sabe leer "EA: … | Periodo: … | Tipo: …".
  const preambulo = aoa.slice(0, headerRowIdx)
    .flat()
    .filter(c => c !== null && c !== undefined)
    .join(' | ');

  return {
    headers,
    rows,
    // A diferencia del HTML, acá Excel ya expandió el colspan=3 de la primera
    // celda en celdas reales, así que los índices NO están corridos.
    totalRow: aoa.find(esTotalGeneral) || null,
    totalRowOffset: 0,
    meta: extraerMetadata(preambulo),
  };
}

/**
 * Devuelve los encabezados del Tabulado, sea un Excel real o HTML disfrazado
 * de .xls (ver `tabuladoHtml.js`).
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], preview: any[][] }}
 */
export function detectHeaders(arrayBuffer) {
  if (isHtmlTabulado(arrayBuffer)) {
    const { headers, rows } = parseHtmlTabulado(arrayBuffer);
    return { headers, preview: rows.slice(0, 3) };
  }

  const aoa = filasDeHoja(hojaTabulado(arrayBuffer));
  const headerRowIdx = ubicarFilaEncabezados(aoa);
  if (headerRowIdx === 0) return detectHeadersXlsx(arrayBuffer);

  const { headers, rows } = leerTabuladoConPreambulo(aoa, headerRowIdx);
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

  const sheet = hojaTabulado(arrayBuffer);

  const aoa = filasDeHoja(sheet);
  const headerRowIdx = ubicarFilaEncabezados(aoa);
  if (headerRowIdx > 0) return parseTabuladoControlXlsxConPreambulo(aoa, headerRowIdx, mapping);

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
 * Rama del Tabulado en Excel real con preámbulo (ver el bloque de arriba).
 * Devuelve la misma forma que las otras dos ramas, con la metadata que el
 * archivo trae en sus primeras filas.
 */
function parseTabuladoControlXlsxConPreambulo(aoa, headerRowIdx, mapping) {
  const empCol = mapping.empleadoColumn;
  if (!empCol) throw new Error('No se configuró la columna de Empleado.');

  const parsed = leerTabuladoConPreambulo(aoa, headerRowIdx);
  const claves = clavesUnicas(parsed.headers);

  const parsedRows = parsed.rows.map(fila => {
    const obj = {};
    claves.forEach((clave, i) => {
      const v = fila[i];
      obj[clave] = v === undefined || v === '' ? null : v;
    });
    return obj;
  }).filter(row => {
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
      format:    'xlsx-preambulo',
      empresa:   parsed.meta.empresa,
      period:    parsed.meta.period,
      quincena:  parsed.meta.quincena,
      tipoLiquidacion: parsed.meta.tipoLiquidacion,
      liquidacion:     parsed.meta.liquidacion,
      totalRow:        parsed.totalRow,
      totalRowOffset:  parsed.totalRowOffset,
      headers:         parsed.headers,
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
      tipoLiquidacion: parsed.meta.tipoLiquidacion,
      liquidacion:     parsed.meta.liquidacion,
      totalRow:        parsed.totalRow,
      totalRowOffset:  parsed.totalRowOffset,
      headers:         parsed.headers,
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
