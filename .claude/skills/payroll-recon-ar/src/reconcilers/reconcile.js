/**
 * Reconcile - compara dos tablas por clave primaria.
 * Retorna 4 buckets estándar (estilo Beyond Compare / daff / csvdiff):
 *   - onlyInA, onlyInB, matchedEqual, matchedDiff
 * Performance: O(N+M) con Map. 20k × 20k filas < 50ms.
 */

/**
 * @param {object[]} tableA - filas normalizadas (ya pasaron por adapter)
 * @param {object[]} tableB
 * @param {object} opts
 * @param {string} opts.keyField - nombre del campo clave (ej: "cuil")
 * @param {string[]} opts.compareFields - campos a comparar para detectar diffs
 * @param {object} opts.normalizers - { fieldName: fn(value) → normalized }
 * @returns {{onlyInA, onlyInB, matchedEqual, matchedDiff, duplicates, stats}}
 */
function reconcile(tableA, tableB, {
  keyField = 'cuil',
  compareFields = null,
  normalizers = {}
} = {}) {
  const idxA = new Map();
  const idxB = new Map();
  const dupA = [];
  const dupB = [];

  for (const row of tableA) {
    const k = row[keyField];
    if (k == null || k === "") continue;
    if (idxA.has(k)) {
      dupA.push({ key: k, row });
    } else {
      idxA.set(k, row);
    }
  }
  for (const row of tableB) {
    const k = row[keyField];
    if (k == null || k === "") continue;
    if (idxB.has(k)) {
      dupB.push({ key: k, row });
    } else {
      idxB.set(k, row);
    }
  }

  const fields = compareFields || [...new Set([
    ...Object.keys(tableA[0] || {}),
    ...Object.keys(tableB[0] || {})
  ])].filter(f => !f.startsWith('__') && f !== keyField);

  const onlyInA = [], onlyInB = [], matchedEqual = [], matchedDiff = [];

  for (const [key, rowA] of idxA) {
    const rowB = idxB.get(key);
    if (!rowB) { onlyInA.push(rowA); continue; }

    const diffs = [];
    for (const f of fields) {
      const norm = normalizers[f] || (x => x);
      const va = norm(rowA[f]);
      const vb = norm(rowB[f]);
      const bothEmpty = (va == null || va === "") && (vb == null || vb === "");
      if (bothEmpty) continue;
      if (va !== vb) {
        diffs.push({ field: f, a: rowA[f], b: rowB[f] });
      }
    }
    if (diffs.length === 0) {
      matchedEqual.push({ key, a: rowA, b: rowB });
    } else {
      matchedDiff.push({ key, a: rowA, b: rowB, diffs });
    }
  }

  for (const [key, rowB] of idxB) {
    if (!idxA.has(key)) onlyInB.push(rowB);
  }

  const stats = {
    totalA: tableA.length,
    totalB: tableB.length,
    uniqueA: idxA.size,
    uniqueB: idxB.size,
    matchedEqual: matchedEqual.length,
    matchedDiff: matchedDiff.length,
    onlyInA: onlyInA.length,
    onlyInB: onlyInB.length,
    duplicatesA: dupA.length,
    duplicatesB: dupB.length,
    matchRate: idxA.size > 0
      ? ((matchedEqual.length + matchedDiff.length) / idxA.size * 100).toFixed(2)
      : 0
  };

  return {
    onlyInA, onlyInB, matchedEqual, matchedDiff,
    duplicates: { A: dupA, B: dupB },
    stats
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { reconcile };
}
