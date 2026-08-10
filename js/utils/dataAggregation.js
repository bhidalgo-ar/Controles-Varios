// dataAggregation.js — Funciones comunes de agrupación y consolidación de datos

import { norm, toNum } from './textFormatters.js';

export function groupRowsByLegajo(rows, legajoColumn) {
  const groups = new Map();
  for (const row of rows) {
    const id = norm(row[legajoColumn]);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

export function sumColumn(group, col) {
  if (!col) return null;
  let total = null;
  for (const row of group) {
    const v = toNum(row[col]);
    total = (total === null && v === null) ? null : (total ?? 0) + (v ?? 0);
  }
  return total;
}

// Igual que sumColumn, pero con fallback por código de concepto cuando el usuario
// no mapeó la columna. El código puede venir como clave string ('1003') o numérica
// (1003) según cómo SheetJS haya leído la fila de encabezados — se prueban las dos.
export function sumTabColumn(group, col, fallbackCode) {
  if (col) return sumColumn(group, col);
  if (!fallbackCode) return null;

  let total = null;
  for (const row of group) {
    const v = toNum(row[fallbackCode]) ?? toNum(row[Number(fallbackCode)]);
    total = (total === null && v === null) ? null : (total ?? 0) + (v ?? 0);
  }
  return total;
}
