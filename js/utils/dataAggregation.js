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

export function sumTabColumn(group, col, fallbackCode) {
  if (col) {
    return sumColumn(group, col);
  }
  if (fallbackCode) {
    return sumColumn(group, fallbackCode);
  }
  return null;
}
