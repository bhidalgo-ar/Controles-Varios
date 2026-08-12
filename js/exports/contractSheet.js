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
