/**
 * Algoritmos de similitud de strings (zero-dependencies, ~3KB total).
 * Todos retornan valores en [0, 1] donde 1 = idéntico.
 */

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const curr = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      curr.push(Math.min(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost));
    }
    prev = curr;
  }
  return prev[b.length];
}

function levenshteinSimilarity(a, b) {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

/**
 * Jaro-Winkler: ideal para strings cortos con prefijo común.
 * Bonus Winkler (hasta 4 chars de prefijo) = 0.1 por char.
 * "Leg." vs "Legajo" → alta similitud por el bonus.
 */
function jaroWinkler(s1, s2, { prefixScale = 0.1, prefixMax = 4 } = {}) {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0, k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const m = matches;
  const jaro = (m / s1.length + m / s2.length + (m - transpositions / 2) / m) / 3;

  // Bonus Winkler por prefijo común
  let prefix = 0;
  const limit = Math.min(prefixMax, Math.min(s1.length, s2.length));
  for (let i = 0; i < limit; i++) {
    if (s1[i] === s2[i]) prefix++; else break;
  }

  return jaro + prefix * prefixScale * (1 - jaro);
}

/**
 * Dice coefficient sobre bigrams. Robusto a reordenamientos.
 * "Apellido y Nombre" vs "Nombre y Apellido" → alta similitud.
 */
function diceCoefficient(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = s => {
    const map = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      map.set(bg, (map.get(bg) || 0) + 1);
    }
    return map;
  };
  const ba = bigrams(a), bb = bigrams(b);
  let intersection = 0;
  for (const [k, v] of ba) {
    if (bb.has(k)) intersection += Math.min(v, bb.get(k));
  }
  return (2 * intersection) / (a.length + b.length - 2);
}

/**
 * Similitud combinada: 60% Jaro-Winkler + 40% Dice.
 * Buen default para matching de headers con abreviaturas y variantes de orden.
 */
function combinedSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 0.6 * jaroWinkler(a, b) + 0.4 * diceCoefficient(a, b);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    levenshtein, levenshteinSimilarity,
    jaroWinkler, diceCoefficient, combinedSimilarity
  };
}
