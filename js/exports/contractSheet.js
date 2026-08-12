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

/**
 * Escribe una hoja `contract.sheet` en `wb` con TODAS las columnas de
 * `contract.columns`, siempre, en ese orden — layout:'fijo': si `row[key]` es
 * `null` (la clave no estaba mapeada, o esa fila no tenía dato), la celda
 * queda vacía; la columna nunca se saca entera.
 *
 * @param {object} wb        `new window.ExcelJS.Workbook()`
 * @param {import('./contracts.js').ExportContract} contract
 * @param {object[]} rows    filas devueltas por `run()` — se leen por `col.key`
 * @returns {object} la worksheet creada, por si el llamador necesita algo más
 *                    (ej. una hoja adicional en el mismo workbook)
 */
export function writeContractSheet(wb, contract, rows) {
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

  for (const row of rows) {
    const dr = ws.addRow(contract.columns.map(c => row[c.key] ?? null));
    contract.columns.forEach((c, i) => {
      const cell = dr.getCell(i + 1);
      cell.font = { name: 'Calibri', size: 10 };
      if (c.type === 'num') {
        cell.numFmt    = NUM_FMT;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { vertical: 'middle' };
      }
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

const DIFF_COLOR = 'FFCC0000';

/**
 * @param {object} wb
 * @param {import('./contracts.js').ExportContract} contract - con `groups`
 *   y, opcionalmente, `headerRows: 2` (default 1)
 * @param {object[]} rows
 * @returns {object} la worksheet creada
 */
export function writeGroupedContractSheet(wb, contract, rows) {
  const ws = wb.addWorksheet(contract.sheet);
  const cols = contract.columns;
  const groups = contract.groups || {};
  const headerRows = contract.headerRows || 1;

  ws.columns = cols.map(c => ({ width: c.width || DEFAULT_WIDTH }));

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };

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
        for (let k = start; k < end; k++) r2Values[k] = cols[k].label;
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
    const hdr = ws.addRow(cols.map(c => c.label));
    hdr.height = 20;
    cols.forEach((c, idx) => {
      if (c.label === '') return;
      const g = c.group ? groups[c.group] : null;
      styleColHeader(hdr.getCell(idx + 1), g?.headerColor || HEADER_FILL, true);
    });
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  }

  const numFmt = '#,##0.00';
  for (const row of rows) {
    const values = cols.map(c => row[c.key] ?? null);
    const dr = ws.addRow(values);
    cols.forEach((c, idx) => {
      if (c.label === '') return; // columna separadora: sin estilo, igual que el original
      const cell = dr.getCell(idx + 1);
      const g = c.group ? groups[c.group] : null;
      if (g?.dataColor) cell.fill = solidFill(g.dataColor);

      if (c.type === 'num' && c.numFmt !== false) cell.numFmt = numFmt;
      if (c.type === 'num' || c.dataAlign) {
        cell.alignment = { horizontal: c.dataAlign || 'right', vertical: 'middle' };
      }

      const v = values[idx];
      const flagged = c.diffHighlight && v !== null && Math.abs(v) > 0.01;
      cell.font = flagged ? { ...bold, color: { argb: DIFF_COLOR } } : { ...base };
    });
  }

  return ws;
}
