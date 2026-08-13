// contractSheet.js — Escribe una hoja de Excel a partir de un EXPORT_CONTRACTS
// (Paso 4a de specs/contrato-export.md).
//
// Antes cada export "Generar Reporte" armaba su propio `colDefs` a mano, DOS
// veces (una para la tabla de pantalla, otra para el `.xlsx` — ya divergidas:
// el `width` sólo existía en la segunda) y las columnas usaban `cols.has*`
// para DESAPARECER cuando la clave de origen no estaba mapeada. Con
// `layout: 'fijo'` (decisión de Willy, 2026-08-12: "que salga vacía") esa
// desaparición dejó de ser la política: el encabezado sale siempre, la celda
// va en blanco si no hay dato.
//
// `writeContractSheet` es el único lugar que hace `ws.addRow` para un export
// con contrato: no hay forma de emitir una columna que el contrato no
// declara, ni de omitir una que sí — la obligatoriedad del Paso 2 y la forma
// del archivo salen de la MISMA fuente. `contractColDefs` da la misma lista en
// la forma que ya esperan la tabla de pantalla y el CSV, así que tampoco ahí
// queda una copia a mano.

const HEADER_FILL   = 'FFE8E8E8';
const BORDER_COLOR  = 'FFB0B0B0';
const NUM_FMT       = '#,##0.00';
const DEFAULT_WIDTH = 14;
const DIFF_COLOR    = 'FFCC0000';

// Un valor de celda puede ser un número plano o `{ formula, result }` (SUM(...),
// =B2-C2 — EE x CATEG y Rend vs Asiento, más auditable para el cliente que un
// valor cacheado a mano). ExcelJS ya sabe escribir los dos por igual porque
// `row[c.key]` se pasa tal cual a `addRow`; lo único que necesita desenvolverse
// acá es el NÚMERO, para decidir si `diffHighlight`/la fila de TOTAL pintan
// rojo. Exportada porque el módulo que arma `opts.highlightIf`/`opts.dimIf`
// necesita el mismo desenvuelto — ver `catXEmpleados.js`.
export const numericValue = v => (v !== null && typeof v === 'object') ? v.result : v;

/**
 * Escribe una hoja `contract.sheet` en `wb` con TODAS las columnas de
 * `contract.columns`, siempre, en ese orden — layout:'fijo': si `row[key]` es
 * `null` (la clave no estaba mapeada, o esa fila no tenía dato), la celda
 * queda vacía; la columna nunca se saca entera.
 *
 * @param {object} wb        `new window.ExcelJS.Workbook()`
 * @param {import('./contracts.js').ExportContract} contract
 * @param {object[]} rows    filas devueltas por `run()` — se leen por `col.key`
 * @param {object} [opts]
 * @param {object}   [opts.totalRow]    fila de TOTAL — mismo shape que un `row`
 *                                      (leída por `col.key`), escrita al final
 *                                      con estilo propio (negrita, borde
 *                                      superior en las columnas numéricas,
 *                                      rojo si una columna `diffHighlight`
 *                                      supera 0.01). Sin esto, no hay fila de
 *                                      TOTAL — no todos los exports la llevan.
 * @param {function} [opts.highlightIf] `(row) => boolean` — si da `true`, esa
 *                                      fila de datos (nunca el TOTAL) se pinta
 *                                      entera con `opts.highlightColor` (ej.
 *                                      EE x CATEG resalta la fila completa de
 *                                      un Puesto/CC con diferencia, no sólo la
 *                                      celda de la diferencia).
 * @param {string}   [opts.highlightColor] ARGB del fondo de `highlightIf`.
 * @returns {object} la worksheet creada, por si el llamador necesita algo más
 *                    (ej. una hoja adicional en el mismo workbook, o seguir
 *                    agregando filas a mano después del TOTAL)
 */
export function writeContractSheet(wb, contract, rows, opts = {}) {
  const ws = wb.addWorksheet(contract.sheet);
  ws.columns = contract.columns.map(c => ({ width: c.width || DEFAULT_WIDTH }));

  const hdr = ws.addRow(contract.columns.map(c => c.label));
  hdr.height = 20;
  hdr.eachCell(cell => {
    cell.font      = { name: 'Calibri', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border    = { bottom: { style: 'medium', color: { argb: BORDER_COLOR } } };
  });

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  const styleDataCell = (cell, c, rawValue, { bold = false } = {}) => {
    cell.font = { name: 'Calibri', size: 10, bold };
    if (c.type === 'num') {
      if (c.numFmt !== false) cell.numFmt = NUM_FMT;
      cell.alignment = { horizontal: c.dataAlign || 'right', vertical: 'middle' };
    } else if (c.dataAlign) {
      cell.alignment = { horizontal: c.dataAlign, vertical: 'middle' };
    } else {
      cell.alignment = { vertical: 'middle' };
    }
    if (c.diffHighlight) {
      const num = numericValue(rawValue);
      if (num !== null && num !== undefined && Math.abs(num) > 0.01) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: DIFF_COLOR } };
      }
    }
  };

  for (const row of rows) {
    const values = contract.columns.map(c => row[c.key] ?? null);
    const dr = ws.addRow(values);
    contract.columns.forEach((c, i) => styleDataCell(dr.getCell(i + 1), c, values[i]));

    if (opts.highlightIf && opts.highlightIf(row) && opts.highlightColor) {
      const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.highlightColor } };
      dr.eachCell(cell => { cell.fill = fill; });
    }
  }

  if (opts.totalRow) {
    const values = contract.columns.map(c => opts.totalRow[c.key] ?? null);
    const tr = ws.addRow(values);
    contract.columns.forEach((c, i) => {
      const cell = tr.getCell(i + 1);
      styleDataCell(cell, c, values[i], { bold: true });
      if (c.type === 'num') cell.border = { top: { style: 'medium', color: { argb: BORDER_COLOR } } };
    });
  }

  return ws;
}

/**
 * `contract.columns` en la forma `{ label, key, type }` que ya esperan la
 * tabla de pantalla (`<th>`/`<td>`) y `renderExportMenu` (CSV/copiar) — mismo
 * array que `writeContractSheet`, sin mantener una tercera copia a mano.
 */
export function contractColDefs(contract) {
  return contract.columns.map(({ label, key, type }) => ({ label, key, type }));
}

// ── writeGroupedContractSheet (Paso 4b) ─────────────────────────────────────
//
// Variante de `writeContractSheet` para los exports "Controlar" de
// Brutos/GS Pers/NR (+ NR Reporte): encabezado agrupado por color (con o sin
// merge de dos filas) y resaltado condicional (negrita+rojo) en las columnas
// de diferencia. Antes cada uno tenía sus ~80 líneas de ExcelJS a mano,
// idénticas en estructura y sólo distintas en colores/agrupación — eso es lo
// que ahora vive en `contract.groups`/`contract.headerRows` (ver contracts.js).
//
// No reemplaza a `writeContractSheet`: los exports "Generar Reporte" (Paso 4a)
// no tienen grupos ni columnas de diferencia, y agregarles esta maquinaria
// sería más parámetros de los que necesitan.

/**
 * @param {object} wb
 * @param {import('./contracts.js').ExportContract} contract - con `groups`
 *   y, opcionalmente, `headerRows: 2` (default 1)
 * @param {object[]} rows
 * @param {object} [opts]
 * @param {object}   [opts.totalRow]  fila de TOTAL, mismo shape que un `row` —
 *                                    ver el jsdoc de `writeContractSheet`. En
 *                                    `headerRows:1` toma el fondo de grupo (o
 *                                    el gris por default) igual que el
 *                                    encabezado; en `headerRows:2` sólo las
 *                                    columnas agrupadas llevan fondo — las
 *                                    sueltas (ej. "CC"/"Centro de Costo") van
 *                                    en negrita sin fondo, igual que las 3
 *                                    hojas de Rendimiento de las que sale esto.
 * @param {function} [opts.dimIf]    `(row) => boolean` — atenúa esa fila de
 *                                    datos a gris (Rend x EE/Rend vs Tabulado/
 *                                    Rend vs Asiento: legajos o CC sin dato de
 *                                    un lado del cruce). Se aplica DESPUÉS del
 *                                    resto del estilo de la fila (incluido
 *                                    `diffHighlight`), así que gana el gris —
 *                                    mismo orden que los 3 originales a mano.
 * @param {function} [opts.headerLabel] `(col) => string` — texto del
 *                                    encabezado individual de una columna
 *                                    (fila 2 en `headerRows:2`, la única fila
 *                                    en `headerRows:1`), en vez de `col.label`.
 *                                    Sólo lo necesita Rend vs Asiento, cuyo
 *                                    sub-encabezado lleva el período ("Rend
 *                                    abr26") — un dato de la corrida, no del
 *                                    contrato. Default: `col.label`.
 * @returns {object} la worksheet creada
 */
export function writeGroupedContractSheet(wb, contract, rows, opts = {}) {
  const ws = wb.addWorksheet(contract.sheet);
  const cols = contract.columns;
  const groups = contract.groups || {};
  const headerRows = contract.headerRows || 1;

  ws.columns = cols.map(c => ({ width: c.width || DEFAULT_WIDTH }));

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const labelOf = c => (opts.headerLabel ? opts.headerLabel(c) : c.label);

  // Encabezado de grupo (fila agrupada, o la única fila cuando headerRows:1):
  // borde fino, sin wrapText — mismo molde que `styleGrp` en los 3 originales.
  const styleGroupHeader = (cell, bg) => {
    cell.font      = { ...bold };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill      = solidFill(bg);
    cell.border    = { bottom: { style: 'thin', color: { argb: BORDER_COLOR } } };
  };
  // Encabezado de columna individual (2ª fila de un grupo con label): borde
  // medio, wrapText — mismo molde que `styleCol` en los 3 originales.
  const styleColHeader = (cell, bg, isBold) => {
    cell.font      = isBold ? { ...bold } : { ...base };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill      = solidFill(bg);
    cell.border    = { bottom: { style: 'medium', color: { argb: BORDER_COLOR } } };
  };

  // Tramos contiguos de columnas que comparten el mismo `group` CON label —
  // esas se mergean horizontalmente en la fila 1. Todo lo demás (sin grupo, o
  // grupo sin label — caso NR) es un "tramo" de 1 sola columna.
  const runs = [];
  {
    let i = 0;
    while (i < cols.length) {
      const g = cols[i].group ? groups[cols[i].group] : null;
      if (g?.label) {
        let j = i;
        while (j < cols.length && cols[j].group === cols[i].group) j++;
        runs.push({ start: i, end: j, group: g });
        i = j;
      } else {
        runs.push({ start: i, end: i + 1, group: g });
        i++;
      }
    }
  }

  if (headerRows === 2) {
    // Fila 1: label del grupo en la 1ª columna del tramo (o el label propio si
    // el tramo es de 1 sola columna sin grupo-con-label); el resto del tramo,
    // vacío. Fila 2: el label individual de cada columna, sólo en tramos
    // agrupados (en un tramo de 1 columna, la fila 2 queda vacía porque esa
    // columna se mergea verticalmente con la fila 1).
    const r1Values = new Array(cols.length).fill(null);
    const r2Values = new Array(cols.length).fill(null);
    for (const { start, end, group } of runs) {
      if (group?.label) {
        r1Values[start] = group.label;
        for (let k = start; k < end; k++) r2Values[k] = labelOf(cols[k]);
      } else {
        r1Values[start] = cols[start].label;
      }
    }
    const r1 = ws.addRow(r1Values);
    const r2 = ws.addRow(r2Values);
    r1.height = 22;
    r2.height = 20;

    for (const { start, end, group } of runs) {
      if (group?.label) {
        ws.mergeCells(1, start + 1, 1, end); // horizontal, sólo fila 1
        styleGroupHeader(r1.getCell(start + 1), group.headerColor);
        for (let k = start; k < end; k++) {
          styleColHeader(r2.getCell(k + 1), group.headerColor, !!cols[k].diffHighlight);
        }
      } else {
        ws.mergeCells(1, start + 1, 2, start + 1); // vertical, 1 columna
        styleGroupHeader(r1.getCell(start + 1), group?.headerColor || HEADER_FILL);
      }
    }
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
  } else {
    // Una sola fila: cada columna lleva su propio color de grupo (si tiene),
    // sin merges. La columna "vacía" (label === '') queda sin estilo, igual
    // que en NR Reporte (columna A separadora, heredada del layout Meta4).
    const hdr = ws.addRow(cols.map(c => labelOf(c)));
    hdr.height = 20;
    cols.forEach((c, idx) => {
      if (c.label === '') return;
      const g = c.group ? groups[c.group] : null;
      styleColHeader(hdr.getCell(idx + 1), g?.headerColor || HEADER_FILL, true);
    });
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  }

  const numFmt = '#,##0.00';

  const styleDataCell = (cell, c, rawValue, group) => {
    if (group?.dataColor) cell.fill = solidFill(group.dataColor);
    if (c.type === 'num' && c.numFmt !== false) cell.numFmt = numFmt;
    if (c.type === 'num' || c.dataAlign) {
      cell.alignment = { horizontal: c.dataAlign || 'right', vertical: 'middle' };
    }
    const num = numericValue(rawValue);
    const flagged = c.diffHighlight && num !== null && num !== undefined && Math.abs(num) > 0.01;
    cell.font = flagged ? { ...bold, color: { argb: DIFF_COLOR } } : { ...base };
  };

  for (const row of rows) {
    const values = cols.map(c => row[c.key] ?? null);
    const dr = ws.addRow(values);
    cols.forEach((c, idx) => {
      if (c.label === '') return; // columna separadora: sin estilo, igual que el original
      styleDataCell(dr.getCell(idx + 1), c, values[idx], c.group ? groups[c.group] : null);
    });

    // `dimIf` (legajos/CC sin dato de un lado del cruce) va DESPUÉS del resto
    // del estilo — el gris gana incluso sobre `diffHighlight`, igual que los 3
    // originales a mano (`if (r.sinTabData) dr.eachCell(...)`).
    if (opts.dimIf && opts.dimIf(row)) {
      dr.eachCell(cell => { cell.font = { ...cell.font, color: { argb: 'FF999999' } }; });
    }
  }

  if (opts.totalRow) {
    const values = cols.map(c => opts.totalRow[c.key] ?? null);
    const tr = ws.addRow(values);
    cols.forEach((c, idx) => {
      if (c.label === '' && c.spacer) return;
      const cell = tr.getCell(idx + 1);
      const g = c.group ? groups[c.group] : null;
      styleDataCell(cell, c, values[idx], g);
      cell.font = { ...cell.font, bold: true };
      // headerRows:1 (ej. Rend x EE) pinta TODA la fila de TOTAL, agrupada o
      // no — igual que su encabezado. headerRows:2 (ej. Rend vs Tabulado) sólo
      // pinta las columnas de un grupo CON label (una categoría real); las
      // sueltas o con un grupo "sólo color" (`meta`, sin label — CC/Centro de
      // Costo) quedan en negrita sin fondo, igual que en los 3 originales a mano.
      const fillColor = headerRows === 1 ? (g?.headerColor || HEADER_FILL) : (g?.label ? g.headerColor : null);
      if (fillColor) {
        cell.fill   = solidFill(fillColor);
        cell.border = { top: { style: 'medium', color: { argb: BORDER_COLOR } } };
      }
    });
  }

  return ws;
}
