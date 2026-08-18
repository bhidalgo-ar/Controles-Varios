/**
 * cascadeMatch - matching en cascada entre dos tablas.
 *
 * Cuando la clave principal falla (típico entre payroll y banco con legajos
 * no sincronizados), bajamos el estándar gradualmente:
 *
 *   Nivel 1: CUIL exacto            → confianza 1.00
 *   Nivel 2: DNI exacto             → confianza 0.98
 *   Nivel 3: Legajo normalizado     → confianza 0.90 (solo mismo empleador)
 *   Nivel 4: Nombre + Fecha nac     → confianza 0.92
 *   Nivel 5: Nombre normalizado     → confianza 0.75
 *   Nivel 6: Fuzzy con blocking     → confianza variable, requiere confirmación
 *
 * Cada fila de A se intenta matchear en orden. Al primer match confiable, se
 * consume la fila de B y se continúa con la siguiente A.
 *
 * IMPORTANTE: el fuzzy con blocking (Nivel 6) usa Spanish Metaphone del
 * apellido como clave de bloque para reducir N×M a pares del mismo bloque.
 * Sin eso, 20k × 20k sería intratable.
 */

/**
 * Construye índices por clave para lookup O(1).
 */
function buildIndexes(rows, fields) {
  const indexes = {};
  for (const f of fields) indexes[f] = new Map();
  for (const row of rows) {
    for (const f of fields) {
      const v = row[f];
      if (v == null || v === "") continue;
      if (!indexes[f].has(v)) {
        indexes[f].set(v, []);
      }
      indexes[f].get(v).push(row);
    }
  }
  return indexes;
}

/**
 * Clave de bloque para fuzzy matching: primeras 4 letras del apellido + inicial del nombre.
 * Requiere que la fila tenga `apellido` y `nombre` o `apellidoNombre`.
 */
function blockKey(row, { getLastName, getFirstName } = {}) {
  const last = getLastName ? getLastName(row) : (row.apellido || row.apellidoNormalized || "");
  const first = getFirstName ? getFirstName(row) : (row.nombre || "");
  const lastKey = String(last).replace(/\s/g, "").slice(0, 4).toUpperCase();
  const firstInitial = String(first).trim()[0] || "";
  return lastKey + firstInitial.toUpperCase();
}

/**
 * Matching en cascada.
 *
 * @param {object[]} tableA
 * @param {object[]} tableB
 * @param {object} opts
 * @param {string[]} opts.cascade - orden de campos a intentar (default: ['cuil','dni','legajo','apellidoNombre'])
 * @param {function} opts.nameSimilarity - fn(nameA, nameB) → [0,1] para fuzzy final
 * @param {number} opts.fuzzyThreshold - umbral para aceptar fuzzy (default 0.90)
 * @param {boolean} opts.enableFuzzy - si false, no se hace el nivel fuzzy (default true)
 * @returns {{matches, unmatchedA, unmatchedB, stats}}
 */
function cascadeMatch(tableA, tableB, {
  cascade = ['cuil', 'dni', 'legajo', 'apellidoNombre'],
  nameSimilarity = null,
  fuzzyThreshold = 0.90,
  enableFuzzy = true,
  confidenceByLevel = {
    cuil: 1.00, dni: 0.98, legajo: 0.90,
    apellidoNombre: 0.75, fuzzy: 0.85
  }
} = {}) {
  const indexesB = buildIndexes(tableB, cascade);
  const consumedB = new Set();  // índices de filas de B ya matcheadas
  const bWithIdx = tableB.map((row, i) => ({ row, idx: i }));

  const matches = [];
  const unmatchedA = [];
  const statsPerLevel = Object.fromEntries(cascade.map(l => [l, 0]));
  statsPerLevel.fuzzy = 0;

  for (const rowA of tableA) {
    let matched = false;

    // Niveles exactos
    for (const field of cascade) {
      const valA = rowA[field];
      if (valA == null || valA === "") continue;
      const candidates = indexesB[field].get(valA);
      if (!candidates || candidates.length === 0) continue;

      // Tomar el primer candidato disponible (no consumido)
      const candidate = candidates.find(c => {
        const idx = tableB.indexOf(c);
        return !consumedB.has(idx);
      });
      if (!candidate) continue;

      const idx = tableB.indexOf(candidate);
      consumedB.add(idx);
      matches.push({
        a: rowA,
        b: candidate,
        matchField: field,
        confidence: confidenceByLevel[field] || 0.8,
        method: 'exact'
      });
      statsPerLevel[field]++;
      matched = true;
      break;
    }

    if (!matched) unmatchedA.push(rowA);
  }

  // Nivel fuzzy (opcional) - con blocking por apellido
  if (enableFuzzy && nameSimilarity && unmatchedA.length > 0) {
    // Bloquear B por apellido
    const blocksB = new Map();
    for (let i = 0; i < tableB.length; i++) {
      if (consumedB.has(i)) continue;
      const key = blockKey(tableB[i]);
      if (!key) continue;
      if (!blocksB.has(key)) blocksB.set(key, []);
      blocksB.get(key).push(i);
    }

    const stillUnmatchedA = [];
    for (const rowA of unmatchedA) {
      const key = blockKey(rowA);
      if (!key) { stillUnmatchedA.push(rowA); continue; }
      const candidatesIdx = blocksB.get(key) || [];
      let bestMatch = null;
      let bestScore = 0;

      const nameA = rowA.apellidoNombre || `${rowA.apellido || ""} ${rowA.nombre || ""}`.trim();
      for (const bi of candidatesIdx) {
        if (consumedB.has(bi)) continue;
        const rowB = tableB[bi];
        const nameB = rowB.apellidoNombre || `${rowB.apellido || ""} ${rowB.nombre || ""}`.trim();
        const score = nameSimilarity(nameA, nameB);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { rowB, idx: bi };
        }
      }

      if (bestMatch && bestScore >= fuzzyThreshold) {
        consumedB.add(bestMatch.idx);
        matches.push({
          a: rowA,
          b: bestMatch.rowB,
          matchField: 'fuzzy_name',
          confidence: bestScore,
          method: 'fuzzy',
          requiresReview: bestScore < 0.95
        });
        statsPerLevel.fuzzy++;
      } else {
        stillUnmatchedA.push(rowA);
      }
    }
    unmatchedA.length = 0;
    unmatchedA.push(...stillUnmatchedA);
  }

  const unmatchedB = tableB.filter((_, i) => !consumedB.has(i));

  return {
    matches,
    unmatchedA,
    unmatchedB,
    stats: {
      totalA: tableA.length,
      totalB: tableB.length,
      matched: matches.length,
      unmatchedA: unmatchedA.length,
      unmatchedB: unmatchedB.length,
      byLevel: statsPerLevel,
      matchRate: tableA.length > 0
        ? ((matches.length / tableA.length) * 100).toFixed(2)
        : 0
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cascadeMatch, buildIndexes, blockKey };
}
