/**
 * parsePDF - extracción de texto y reconstrucción de tablas desde PDF.
 *
 * PDF.js devuelve items con coordenadas (x, y en puntos), NO estructura
 * tabular. La reconstrucción se hace clusterizando Y para filas y X para
 * columnas con tolerancias configurables.
 *
 * LÍMITE CONOCIDO: PDFs escaneados devuelven items: []. Para eso hace falta
 * OCR (Tesseract.js) - no está incluido acá.
 *
 * DEPENDENCIA: pdfjsLib global. En el template se carga como:
 *   import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs';
 *   pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs';
 *
 * O en worker clásico (no ESM), usar la versión UMD v3.11 como fallback:
 *   importScripts('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
 *
 * Uso:
 *   const { pages, rows, meta } = await parsePDFBuffer(ab);
 *   // rows = filas tabulares reconstruidas (array of arrays)
 *   // pages = texto por página
 */

/**
 * Extrae items con coordenadas de todas las páginas.
 */
async function extractItemsByPage(arrayBuffer, pdfjsLib) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const items = textContent.items.map(it => ({
      text: it.str,
      x: it.transform[4],
      y: it.transform[5],
      width: it.width,
      height: it.height,
      fontName: it.fontName
    })).filter(it => it.text && it.text.trim() !== "");
    pages.push({ pageNum: p, items, width: viewport.width, height: viewport.height });
  }
  return { numPages: pdf.numPages, pages };
}

/**
 * Agrupa items de una página en filas por tolerancia Y.
 * Items con Y similar (dentro de tolY puntos) se consideran misma fila.
 */
function clusterRows(items, { tolY = 3 } = {}) {
  if (!items.length) return [];
  // Sort por Y descendente (PDF origin es bottom-left), luego X ascendente
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let currentRow = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= tolY) {
      currentRow.push(item);
    } else {
      currentRow.sort((a, b) => a.x - b.x);
      rows.push(currentRow);
      currentRow = [item];
      currentY = item.y;
    }
  }
  currentRow.sort((a, b) => a.x - b.x);
  rows.push(currentRow);
  return rows;
}

/**
 * Detecta posiciones X de columnas agrupando todos los items de todas las
 * filas por cluster de X con tolerancia.
 *
 * Estrategia: tomar los X de inicio de cada item, clusterizar con tolX.
 * Cada cluster representa una columna.
 */
function detectColumns(rows, { tolX = 10, minFreq = 2 } = {}) {
  const allX = [];
  for (const row of rows) {
    for (const item of row) allX.push(item.x);
  }
  allX.sort((a, b) => a - b);

  const clusters = [];
  for (const x of allX) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.center <= tolX) {
      last.points.push(x);
      last.center = last.points.reduce((s, p) => s + p, 0) / last.points.length;
    } else {
      clusters.push({ center: x, points: [x] });
    }
  }
  // Filtrar clusters con poca frecuencia (probablemente ruido)
  return clusters
    .filter(c => c.points.length >= minFreq)
    .map(c => c.center)
    .sort((a, b) => a - b);
}

/**
 * Asigna cada item de una fila a su columna más cercana.
 * Items en la misma columna se concatenan con espacio.
 */
function assignItemsToColumns(row, columnXs, { tolX = 15 } = {}) {
  const cells = new Array(columnXs.length).fill(null).map(() => []);
  for (const item of row) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < columnXs.length; i++) {
      const d = Math.abs(item.x - columnXs[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestDist <= tolX * 3) {  // permitir bastante margen
      cells[bestIdx].push(item.text);
    }
  }
  return cells.map(cell => cell.join(" ").trim());
}

/**
 * Reconstruye una tabla desde items de PDF con heurística de clustering.
 */
function reconstructTable(items, { tolY = 3, tolX = 10 } = {}) {
  const rows = clusterRows(items, { tolY });
  if (rows.length < 2) return { headers: [], rows: [] };

  const columnXs = detectColumns(rows, { tolX });
  if (columnXs.length < 2) {
    // No parece tabla - devolver como texto
    return {
      headers: [],
      rows: rows.map(r => [r.map(it => it.text).join(" ")])
    };
  }

  const tableRows = rows.map(r => assignItemsToColumns(r, columnXs, { tolX }));

  // Primera fila no vacía = header candidato
  const headerIdx = tableRows.findIndex(r => r.some(c => c !== ""));
  const headers = headerIdx >= 0 ? tableRows[headerIdx] : [];
  const dataRows = headerIdx >= 0 ? tableRows.slice(headerIdx + 1) : tableRows;

  return { headers, rows: dataRows.filter(r => r.some(c => c !== "")) };
}

/**
 * Parsea un ArrayBuffer de PDF y reconstruye tablas.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {object} opts
 * @param {object} opts.pdfjsLib - referencia a la librería pdfjs cargada
 * @param {number} opts.tolY - tolerancia Y para agrupar filas (default 3 pt)
 * @param {number} opts.tolX - tolerancia X para clusterizar columnas (default 10 pt)
 * @param {boolean} opts.mergePages - si true, combina todas las páginas en una tabla (asumiendo headers repetidos)
 * @returns {Promise<{rows: object[], pages: object[], meta: object}>}
 */
async function parsePDFBuffer(arrayBuffer, {
  pdfjsLib = null,
  tolY = 3,
  tolX = 10,
  mergePages = true
} = {}) {
  const lib = pdfjsLib || (typeof window !== 'undefined' ? window.pdfjsLib : null);
  if (!lib) {
    throw new Error('pdfjsLib no está disponible. Pasarla como opts.pdfjsLib o cargarla globalmente.');
  }

  const { numPages, pages } = await extractItemsByPage(arrayBuffer, lib);

  const isScanned = pages.every(p => p.items.length === 0);
  if (isScanned) {
    return {
      rows: [],
      pages: pages.map(p => ({ pageNum: p.pageNum, text: "", rows: [] })),
      meta: {
        numPages,
        isScanned: true,
        warning: 'PDF parece ser escaneado (no tiene texto embebido). Hace falta OCR con Tesseract.'
      }
    };
  }

  const pageTables = pages.map(p => {
    const table = reconstructTable(p.items, { tolY, tolX });
    const text = p.items
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map(it => it.text)
      .join(" ");
    return { pageNum: p.pageNum, text, ...table };
  });

  let combinedRows = [];
  let combinedHeaders = [];
  if (mergePages && pageTables.length > 0) {
    combinedHeaders = pageTables[0].headers;
    for (const pt of pageTables) {
      // Si los headers de esta página coinciden con los primeros, skip su header
      const sameHeader = combinedHeaders.length && pt.headers.length &&
        pt.headers.join('|').toLowerCase() === combinedHeaders.join('|').toLowerCase();
      const dataStart = sameHeader ? 0 : 0;
      combinedRows = combinedRows.concat(pt.rows.slice(dataStart));
    }
  } else {
    combinedHeaders = pageTables[0]?.headers || [];
    combinedRows = pageTables.flatMap(pt => pt.rows);
  }

  // Convertir a objetos si hay headers
  let rowsAsObjects = [];
  if (combinedHeaders.length > 0) {
    rowsAsObjects = combinedRows.map(arr => {
      const obj = {};
      for (let i = 0; i < combinedHeaders.length; i++) {
        const h = combinedHeaders[i];
        if (h) obj[h] = arr[i] != null ? arr[i] : "";
      }
      return obj;
    });
  }

  return {
    rows: rowsAsObjects,
    rowsAsArrays: combinedRows,
    pages: pageTables,
    meta: {
      numPages,
      isScanned: false,
      headers: combinedHeaders,
      totalRows: rowsAsObjects.length,
      warning: combinedHeaders.length === 0
        ? 'No se detectó estructura tabular clara. Revisar rowsAsArrays manualmente.'
        : null
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parsePDFBuffer, extractItemsByPage,
    clusterRows, detectColumns, reconstructTable
  };
}
