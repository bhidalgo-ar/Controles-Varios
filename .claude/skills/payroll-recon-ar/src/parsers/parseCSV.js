/**
 * parseCSV - lector robusto de CSV/TXT con PapaParse.
 *
 * El gotcha #1 en Argentina es el encoding: sistemas legacy (Bejerman viejo,
 * SIJP, exports custom) emiten CSV en windows-1252/ISO-8859-1. Leerlo como
 * UTF-8 corrompe tildes y ñ.
 *
 * La estrategia es:
 *   1. Leer bytes.
 *   2. Detectar encoding (BOM, fatal UTF-8 decode).
 *   3. Decodificar a string.
 *   4. Detectar delimitador con preview (Papa.parse { preview: 10 }).
 *   5. Parsear completo con dynamicTyping: false.
 *
 * DEPENDENCIA: Papa global (desde papaparse.min.js).
 *
 * Uso:
 *   const { rows, meta } = await parseCSVBuffer(arrayBuffer);
 *   // rows = [{ "CUIL": "20-12345678-9", ... }, ...]
 *   // meta.encoding = "utf-8" | "utf-8-bom" | "windows-1252"
 *   // meta.delimiter = ";" | "," | "\t" | "|"
 */

/**
 * Decodifica bytes detectando encoding.
 * Estrategia: BOM UTF-8 → UTF-8 estricto → fallback windows-1252.
 */
function decodeWithFallback(bytes) {
  // BOM UTF-8: EF BB BF
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return {
      text: new TextDecoder("utf-8").decode(bytes),
      encoding: "utf-8-bom"
    };
  }
  // BOM UTF-16 LE/BE
  if (bytes.length >= 2) {
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return {
        text: new TextDecoder("utf-16le").decode(bytes),
        encoding: "utf-16le-bom"
      };
    }
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return {
        text: new TextDecoder("utf-16be").decode(bytes),
        encoding: "utf-16be-bom"
      };
    }
  }
  // Intentar UTF-8 estricto
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8"
    };
  } catch {
    // Fallback a windows-1252 (superset de ISO-8859-1, común en Argentina)
    return {
      text: new TextDecoder("windows-1252").decode(bytes),
      encoding: "windows-1252"
    };
  }
}

/**
 * Detecta si las primeras filas parecen metadata (título, período, etc)
 * antes del header real. Similar a parseExcel pero para texto ya parseado.
 */
function detectCSVHeaderRow(parsedRows, { scanRows = 10, minCols = 3 } = {}) {
  let best = { idx: 0, score: -1 };
  const limit = Math.min(scanRows, parsedRows.length);
  for (let i = 0; i < limit; i++) {
    const row = parsedRows[i] || [];
    const nonEmpty = row.filter(c => c != null && String(c).trim() !== "");
    if (nonEmpty.length < minCols) continue;
    const avgLen = nonEmpty.reduce((s, c) => s + String(c).length, 0) / nonEmpty.length;
    const shortAvg = avgLen < 40;
    const nextRow = parsedRows[i + 1] || [];
    const nextHasData = nextRow.filter(c => c != null && c !== "").length >= minCols;
    const unique = new Set(nonEmpty.map(c => String(c).trim().toLowerCase())).size;
    const uniqueRatio = unique / nonEmpty.length;

    let score =
      nonEmpty.length * 1.0 +
      (shortAvg ? 3 : 0) +
      (nextHasData ? 4 : 0) +
      (uniqueRatio === 1 ? 3 : 0);

    if (score > best.score) best = { idx: i, score };
  }
  return best.idx;
}

/**
 * Parsea un ArrayBuffer de CSV/TXT con detección automática de encoding y delimiter.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {object} opts
 * @param {string|null} opts.forceEncoding - forzar encoding (ej: "windows-1252")
 * @param {string|null} opts.forceDelimiter - forzar delimiter (";", ",", "\t", "|")
 * @param {number|null} opts.skipRows - filas a saltar antes del header (null = auto-detect)
 * @returns {Promise<{rows: object[], meta: object}>}
 */
function parseCSVBuffer(arrayBuffer, {
  forceEncoding = null,
  forceDelimiter = null,
  skipRows = null,
  scanRows = 10
} = {}) {
  return new Promise((resolve, reject) => {
    if (typeof Papa === 'undefined') {
      return reject(new Error('Papa no está disponible. Cargar papaparse.min.js antes.'));
    }

    const bytes = new Uint8Array(arrayBuffer);
    let text, encoding;

    if (forceEncoding) {
      try {
        text = new TextDecoder(forceEncoding).decode(bytes);
        encoding = forceEncoding;
      } catch (e) {
        return reject(new Error(`No se pudo decodificar como ${forceEncoding}: ${e.message}`));
      }
    } else {
      const decoded = decodeWithFallback(bytes);
      text = decoded.text;
      encoding = decoded.encoding;
    }

    // Preview para detectar delimiter y header row
    const previewResult = Papa.parse(text, {
      preview: Math.max(scanRows, 10),
      skipEmptyLines: false,  // queremos ver filas en blanco para header detection
      delimiter: forceDelimiter || "",  // "" = auto-detect
      header: false
    });

    const delimiter = forceDelimiter || previewResult.meta.delimiter || ",";
    const headerIdx = skipRows != null
      ? skipRows
      : detectCSVHeaderRow(previewResult.data, { scanRows });

    // Si hay filas antes del header, saltar esas líneas del texto crudo
    let effectiveText = text;
    if (headerIdx > 0) {
      // Contar newlines para saltar. Papa maneja \r\n y \n.
      const lines = text.split(/\r?\n/);
      effectiveText = lines.slice(headerIdx).join("\n");
    }

    // Parseo completo
    Papa.parse(effectiveText, {
      delimiter,
      header: true,
      dynamicTyping: false,           // CRÍTICO: no convertir "01234" a 1234
      skipEmptyLines: "greedy",       // salta filas con todas las celdas vacías
      transformHeader: h => String(h).trim(),
      complete: (result) => {
        resolve({
          rows: result.data,
          meta: {
            encoding,
            delimiter,
            headerRow: headerIdx,
            headers: result.meta.fields || [],
            totalRows: result.data.length,
            errors: result.errors || [],
            aborted: result.meta.aborted || false,
            truncated: result.meta.truncated || false
          }
        });
      },
      error: reject
    });
  });
}

/**
 * Parsea un File/Blob directamente (preferible para archivos muy grandes).
 * PapaParse lee chunks y streamea. En worker, usar parseCSVBuffer en su lugar.
 */
function parseCSVFile(file, opts = {}) {
  return file.arrayBuffer().then(ab => parseCSVBuffer(ab, opts));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseCSVBuffer, parseCSVFile,
    decodeWithFallback, detectCSVHeaderRow
  };
}
