// consolidate.js — Consolidación por legajo. El molde único de los cruces.
//
// **Por qué existe este módulo** (el bug más caro del repo, D-042): el Tabulado
// trae una fila **por liquidación**, no por empleado. Un legajo con la mensual y
// la baja del mismo mes aparece dos veces, y el reporte informa el total sumado.
// Si se pisa en vez de sumar, salen diferencias falsas en todos los empleados
// con doble paga. Ese bug se arregló **cuatro veces por separado** (Brutos
// `bba8958`, NR `b2f8bef`, GS Pers el 2026-08-11, GS Pers modo Reporte el
// 2026-08-12) porque el helper estaba copiado cuatro veces con cuatro nombres.
//
// La regla está escrita como test ejecutable en `tests/consolidate.test.js` y
// `tests/gsPersControl.test.js`. Antes de escribir un cruce nuevo: importá de
// acá, no copies.
//
// Los dos helpers están **parametrizados** a propósito. Una versión sin
// parámetros rompía a Variaciones, que necesita su propia lectura de importes
// (hoy la de `toNum` compartido) y su propia clave de legajo por cliente.

import { toNum as defaultToNum } from '../utils/currency.js';
import { makeLegajoKey } from '../utils/legajo.js';

/**
 * Agrupa filas por legajo preservando el orden de aparición — tanto de los
 * legajos como de las liquidaciones dentro de cada uno, porque varios controles
 * toman la **última** liquidación del grupo para los datos de ficha (nombre,
 * centro de costo, fecha de pago).
 *
 * `keyFn` decide si `'007'` y `'7'` son el mismo empleado. Pasale **la misma**
 * función a los dos lados del cruce (armala con `makeLegajoKey(mode)` una vez
 * por corrida): si un lado agrupa con un criterio y el otro busca con otro, el
 * control informa faltantes que no faltan.
 *
 * @returns {Map<string, object[]>} legajo → filas de ese legajo.
 */
export function groupRowsByLegajo(rows, legajoColumn, { keyFn = makeLegajoKey() } = {}) {
  const groups = new Map();
  if (!Array.isArray(rows) || !legajoColumn) return groups;
  for (const row of rows) {
    const id = keyFn(row[legajoColumn]);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

/**
 * Suma un mismo concepto a través de las liquidaciones de un legajo.
 *
 * Devuelve `null` —no `0`— si la columna no está mapeada o si ninguna
 * liquidación trajo dato: `null` es "no hay con qué comparar" y `0` es "se
 * liquidó y dio cero". Un `0` en lugar de `null` es un default silencioso, que
 * es un bug (CLAUDE.md).
 *
 * @param {object[]} group  filas de un legajo (una por liquidación)
 * @param {string}   col    nombre de la columna a sumar
 * @param {object}  [opts]
 * @param {Function} [opts.toNum]  lectura de importe (default: la compartida)
 */
export function sumColumn(group, col, { toNum = defaultToNum } = {}) {
  if (!col || !Array.isArray(group)) return null;
  let total = null;
  for (const row of group) {
    const v = toNum(row[col]);
    total = (total === null && v === null) ? null : (total ?? 0) + (v ?? 0);
  }
  return total;
}

/**
 * La última liquidación del grupo — de donde salen los datos de ficha del
 * empleado (nombre, centro de costo, fecha de pago), que no se suman.
 */
export function lastRow(group) {
  return Array.isArray(group) && group.length ? group[group.length - 1] : null;
}
