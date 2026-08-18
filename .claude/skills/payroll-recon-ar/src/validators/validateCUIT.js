/**
 * Validación y normalización de CUIT/CUIL argentino.
 * Algoritmo módulo 11 con multiplicadores [5,4,3,2,7,6,5,4,3,2].
 *
 * Uso:
 *   validateCUIT("20-12345678-9") → { valid: true, normalized: "20123456789" }
 *   validateCUIT("20-12345678-0") → { valid: false, reason: "checksum" }
 *   formatCUIT("20123456789") → "20-12345678-9"
 *   dniFromCUIT("20123456789") → "12345678"
 */

const CUIT_MULT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const CUIT_PREFIJOS = new Set([
  "20", "23", "24", "25", "26", "27",  // personas humanas
  "30", "33", "34"                      // personas jurídicas
]);

function normalizeCUIT(v) {
  if (v == null) return "";
  return String(v).replace(/\D+/g, "");
}

function formatCUIT(v, sep = "-") {
  const s = normalizeCUIT(v);
  if (s.length !== 11) return s;
  return `${s.slice(0, 2)}${sep}${s.slice(2, 10)}${sep}${s.slice(10)}`;
}

function computeCUITCheckDigit(tenDigits) {
  if (!/^\d{10}$/.test(tenDigits)) return null;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(tenDigits[i], 10) * CUIT_MULT[i];
  }
  const r = sum % 11;
  if (r === 0) return 0;
  if (r === 1) return 10;  // overflow - AFIP reprefija el CUIT
  return 11 - r;
}

/**
 * Valida un CUIT/CUIL.
 * @param {string|number} v
 * @param {object} opts
 * @param {boolean} opts.strictPrefix - rechaza prefijos no estándar (default true)
 * @param {boolean} opts.acceptDv9OnOverflow - cuando resto=1, acepta dv=9 como convención legacy (default true)
 * @returns {{valid: boolean, reason: string|null, normalized: string}}
 */
function validateCUIT(v, { strictPrefix = true, acceptDv9OnOverflow = true } = {}) {
  const s = normalizeCUIT(v);
  if (s.length !== 11) return { valid: false, reason: "length", normalized: s };
  if (strictPrefix && !CUIT_PREFIJOS.has(s.slice(0, 2))) {
    return { valid: false, reason: "prefix", normalized: s };
  }
  const given = parseInt(s[10], 10);
  const dv = computeCUITCheckDigit(s.slice(0, 10));
  if (dv === 10) {
    if (acceptDv9OnOverflow && given === 9) {
      return { valid: true, reason: null, normalized: s };
    }
    return { valid: false, reason: "checksum_overflow", normalized: s };
  }
  if (given !== dv) return { valid: false, reason: "checksum", normalized: s };
  return { valid: true, reason: null, normalized: s };
}

/**
 * Extrae el DNI del CUIT (dígitos 3-10).
 * NOTA: solo es confiable para prefijos de personas humanas (20/23/24/25/26/27).
 */
function dniFromCUIT(v) {
  const s = normalizeCUIT(v);
  if (s.length !== 11) return null;
  return s.slice(2, 10).replace(/^0+(?=\d)/, "");
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeCUIT, formatCUIT, computeCUITCheckDigit,
    validateCUIT, dniFromCUIT, CUIT_PREFIJOS
  };
}
