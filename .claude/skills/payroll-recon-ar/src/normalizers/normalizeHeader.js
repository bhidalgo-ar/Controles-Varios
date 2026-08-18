/**
 * Normaliza un header de columna para matching robusto.
 * Resuelve ~80% de la variabilidad sin necesidad de fuzzy.
 *
 * "N° Legajo" → "legajo"
 * "Nro. Legajo" → "legajo"
 * "nro_legajo" → "legajo"
 * "Apellido y Nombre" → "apellido nombre"
 */
function normalizeHeader(h) {
  if (h == null) return '';
  return String(h)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')          // quitar acentos
    .toLowerCase()
    // Primero separadores a espacio (para que "nro_legajo" → "nro legajo" antes del stopword removal)
    .replace(/[_\-]+/g, ' ')
    // "n°" o "n º" completos, antes de la eliminación general de puntuación
    .replace(/\bn\s*[°º]/g, '')
    // Puntuación general a espacio
    .replace(/[°º#$%&()/:;,"'\\.\[\]{}+*?|<>=@!]/g, ' ')
    // Ahora sí, con espacios normalizados, quitar "nro", "numero"
    .replace(/\bnros?\b|\bnumeros?\b/g, ' ')
    // Stopwords conectores
    .replace(/\bde\b|\bdel\b|\bla\b|\bel\b|\by\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeHeader };
}
