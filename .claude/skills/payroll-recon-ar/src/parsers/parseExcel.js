/**
 * parseExcel - lector robusto de .xls/.xlsx/.xlsb con SheetJS.
 *
 * Resuelve los dos problemas clásicos de exports de payroll AR:
 *   1. Headers que no están en la fila 1 (sistemas tipo Bejerman/Tango
 *      ponen título, período y filtros en las primeras 3-5 filas).
 *   2. Pérdida de leading zeros en CUIT/DNI/CBU si se parsea como número.
 *
 * DEPENDENCIA: XLSX global (desde xlsx.full.min.js). En worker, cargar con
 * importScripts('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js').
 *
 * Uso:
 *   const { rows, meta } = parseExcelBuffer(arrayBuffer, { skipRows: 3 });
 *   // rows = [{ "CUIL": "20-12345678-9", "Legajo": "00234", ... }, ...]
 */

/**
 * Detecta la fila de header escaneando las primeras N filas.
 * Heurística: la fila con más celdas no vacías, todas tipo string,
 * short average length, y con datos en la siguiente fila, es el header.
 */
function detectHeaderRow(aoa, { scanRows = 20, minCols = 3 } = {}) {
  let best = { idx: 0, score: -1 };
  const limit = Math.min(scanRows, aoa.length);
  for (let i = 0; i < limit; i++) {
    const row = aoa[i] || [];
    const nonEmpty = row.filter(c => c != null && String(c).trim() !== "");
    if (nonEmpty.length < minCols) continue;

    const allStrings = nonEmpty.every(c => typeof c === "string");
    const avgLen = nonEmpty.reduce((s, c) => s + String(c).length, 0) / nonEmpty.length;
    const shortAvg = avgLen < 40;

    const nextRow = aoa[i + 1] || [];
    const nextNonEmpty = nextRow.filter(c => c != null && c !== "");
    const nextHasData = nextNonEmpty.length >= minCols;

    // Penalizar duplicados en la fila (headers no suelen repetir texto)
    const unique = new Set(nonEmpty.map(c => String(c).trim().toLowerCase())).size;
    const uniqueRatio = unique / nonEmpty.length;

    let score =
      nonEmpty.length * 1.0 +
      (allStrings ? 5 : 0) +
      (shortAvg ? 2 : 0) +
      (nextHasData ? 4 : 0) +
      (uniqueRatio === 1 ? 3 : 0);

    if (score > best.score) best = { idx: i, score };
  }
  return best.idx;
}

/**
 * Parsea un ArrayBuffer de Excel y devuelve filas como objetos.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {object} opts
 * @param {string|number} opts.sheet - nombre o índice de la hoja (default: primera)
 * @param {number|null} opts.skipRows - filas a saltar antes del header (null = auto-detect)
 * @param {number} opts.scanRows - cuántas filas escanear para auto-detectar header
 * @param {boolean} opts.dense - usar modo denso de SheetJS (mejor memoria con archivos grandes)
 * @returns {{rows: object[], meta: object}}
 */
function parseExcelBuffer(arrayBuffer, {
  sheet = 0,
  skipRows = null,
  scanRows = 20,
  dense = true
} = {}) {
  if (typeof XLSX === 'undefined') {
    throw new Error('XLSX no está disponible. Cargar xlsx.full.min.js antes.');
  }

  const wb = XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: true,  // devuelve Date en lugar de serial
    dense: dense,
    cellNF: false,
    cellText: false
  });

  const sheetName = typeof sheet === 'number'
    ? wb.SheetNames[sheet]
    : (wb.SheetNames.includes(sheet) ? sheet : wb.SheetNames[0]);

  if (!sheetName) {
    throw new Error('El archivo Excel no contiene hojas.');
  }
  const ws = wb.Sheets[sheetName];

  // Primero leer como array-of-arrays para detectar header
  const aoa = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,       // CRÍTICO: preserva formato textual
    defval: "",
    blankrows: false
  });

  if (aoa.length === 0) {
    return { rows: [], meta: { sheetName, totalSheets: wb.SheetNames.length, headerRow: 0, headers: [] } };
  }

  const headerIdx = skipRows != null
    ? skipRows
    : detectHeaderRow(aoa, { scanRows });

  const headers = (aoa[headerIdx] || []).map(h => String(h == null ? "" : h).trim());
  const dataRows = aoa.slice(headerIdx + 1);

  const rows = [];
  for (const rowArr of dataRows) {
    // Skip filas completamente vacías
    if (!rowArr.some(c => c != null && String(c).trim() !== "")) continue;
    const obj = {};
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (!h) continue;  // ignorar columnas sin header
      obj[h] = rowArr[i] != null ? rowArr[i] : "";
    }
    rows.push(obj);
  }

  return {
    rows,
    meta: {
      sheetName,
      totalSheets: wb.SheetNames.length,
      allSheets: wb.SheetNames,
      headerRow: headerIdx,
      headers,
      totalRows: rows.length,
      hasMergedCells: !!(ws['!merges'] && ws['!merges'].length > 0),
      mergedCount: (ws['!merges'] || []).length
    }
  };
}

/**
 * Lista las hojas de un workbook sin parsearlas completamente.
 * Útil para dejar al usuario elegir qué hoja procesar.
 */
function listExcelSheets(arrayBuffer) {
  if (typeof XLSX === 'undefined') {
    throw new Error('XLSX no está disponible.');
  }
  const wb = XLSX.read(arrayBuffer, { type: "array", bookSheets: true });
  return wb.SheetNames;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseExcelBuffer, listExcelSheets, detectHeaderRow };
}
