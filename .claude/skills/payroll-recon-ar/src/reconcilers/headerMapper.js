/**
 * Header Mapper - mapea headers de archivo a nombres canónicos del schema.
 * Cascada: exact match → synonym match → fuzzy match → manual.
 *
 * Requiere: normalizeHeader, CANONICAL_SCHEMA, combinedSimilarity.
 */

/**
 * @param {string[]} fileHeaders - headers tal como vienen del archivo
 * @param {object} schema - CANONICAL_SCHEMA
 * @param {object} opts
 * @param {number} opts.autoThreshold - score ≥ este valor → auto-match silencioso (default 0.9)
 * @param {number} opts.suggestThreshold - score ≥ este valor → sugerencia para confirmar (default 0.6)
 * @param {function} opts.normalizeHeader - función de normalización
 * @param {function} opts.similarity - función de similitud (a, b) → [0,1]
 * @returns {{mappings: object[], unmapped: string[], ambiguous: object[]}}
 */
function mapHeaders(fileHeaders, schema, {
  autoThreshold = 0.9,
  suggestThreshold = 0.6,
  normalizeHeader,
  similarity
} = {}) {
  const mappings = [];
  const unmapped = [];
  const ambiguous = [];

  // Preparar índice de sinónimos canónicos
  const synonymIndex = [];
  for (const [canonicalKey, def] of Object.entries(schema)) {
    for (const syn of (def.synonyms || [])) {
      synonymIndex.push({
        canonical: canonicalKey,
        synonym: syn,
        normalized: normalizeHeader(syn)
      });
    }
  }

  for (const rawHeader of fileHeaders) {
    const normalized = normalizeHeader(rawHeader);
    if (!normalized) {
      unmapped.push(rawHeader);
      continue;
    }

    // 1. Exact match contra sinónimos normalizados
    const exact = synonymIndex.find(s => s.normalized === normalized);
    if (exact) {
      mappings.push({
        fileHeader: rawHeader,
        canonical: exact.canonical,
        score: 1.0,
        method: "exact",
        matched: exact.synonym
      });
      continue;
    }

    // 2. Fuzzy match - encontrar mejor candidato por canonical
    const scores = new Map();  // canonical → best score
    for (const syn of synonymIndex) {
      const sim = similarity(normalized, syn.normalized);
      const prev = scores.get(syn.canonical);
      if (!prev || sim > prev.score) {
        scores.set(syn.canonical, { score: sim, matched: syn.synonym });
      }
    }

    const ranked = [...scores.entries()]
      .map(([canonical, v]) => ({ canonical, ...v }))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const second = ranked[1];

    if (best && best.score >= autoThreshold) {
      // Auto-match pero chequear ambigüedad (segundo muy cercano)
      if (second && (best.score - second.score) < 0.05) {
        ambiguous.push({
          fileHeader: rawHeader,
          candidates: ranked.slice(0, 3),
          reason: "close_scores"
        });
      } else {
        mappings.push({
          fileHeader: rawHeader,
          canonical: best.canonical,
          score: best.score,
          method: "fuzzy_auto",
          matched: best.matched
        });
      }
    } else if (best && best.score >= suggestThreshold) {
      ambiguous.push({
        fileHeader: rawHeader,
        candidates: ranked.slice(0, 3),
        reason: "below_auto"
      });
    } else {
      unmapped.push(rawHeader);
    }
  }

  return { mappings, unmapped, ambiguous };
}

/**
 * Aplica el resultado de mapHeaders a una fila, renombrando las claves.
 * Mantiene las columnas no mapeadas con prefijo "__extra_".
 */
function applyMapping(row, mappingResult) {
  const out = {};
  for (const m of mappingResult.mappings) {
    if (m.fileHeader in row) {
      out[m.canonical] = row[m.fileHeader];
    }
  }
  for (const h of mappingResult.unmapped) {
    if (h in row) out[`__extra_${h}`] = row[h];
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { mapHeaders, applyMapping };
}
