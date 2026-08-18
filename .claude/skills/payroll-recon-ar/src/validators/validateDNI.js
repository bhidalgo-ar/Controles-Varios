/**
 * Validación y normalización de DNI argentino.
 * Rangos oficiales (Disposición RENAPER 4678/2019):
 *   1 - 9.999.999       → LE/LC legacy (DNI de 7 dígitos, VÁLIDOS)
 *   10.000.000 - 59.999.999 → DNI unificado estándar
 *   60.000.000 - 69.999.999 → RESERVADO (CUIT/CUIL provisorios AFIP, NO son DNI físicos)
 *   70.000.000 - 89.999.999 → recién nacidos post septiembre 2023
 *   90.000.000 - 99.999.999 → extranjeros con residencia
 */

function normalizeDNI(v) {
  if (v == null) return "";
  return String(v).replace(/\D+/g, "").replace(/^0+(?=\d)/, "");
}

/**
 * @param {string|number} v
 * @param {object} opts
 * @param {boolean} opts.allowForeign - permite rango 90M-99M (default true)
 * @param {boolean} opts.allowLegacy7 - permite DNIs de 7 dígitos (default true)
 * @returns {{valid: boolean, reason: string|null, kind: string|null, normalized: string}}
 */
function validateDNI(v, { allowForeign = true, allowLegacy7 = true } = {}) {
  const s = normalizeDNI(v);
  if (!/^\d+$/.test(s)) {
    return { valid: false, reason: "non_digit", kind: null, normalized: s };
  }
  if (s.length < 6 || s.length > 8) {
    return { valid: false, reason: "length", kind: null, normalized: s };
  }
  const n = parseInt(s, 10);

  if (n >= 1 && n <= 9_999_999) {
    return {
      valid: allowLegacy7,
      reason: allowLegacy7 ? null : "legacy_disallowed",
      kind: "le_lc_legacy",
      normalized: s
    };
  }
  if (n >= 10_000_000 && n <= 59_999_999) {
    return { valid: true, reason: null, kind: "standard", normalized: s };
  }
  if (n >= 60_000_000 && n <= 69_999_999) {
    return {
      valid: false,
      reason: "reserved_range_60M",
      kind: "reserved",
      normalized: s
    };
  }
  if (n >= 70_000_000 && n <= 89_999_999) {
    return { valid: true, reason: null, kind: "post2023", normalized: s };
  }
  if (n >= 90_000_000 && n <= 99_999_999) {
    return {
      valid: allowForeign,
      reason: allowForeign ? null : "foreign_disallowed",
      kind: "foreign",
      normalized: s
    };
  }
  return { valid: false, reason: "out_of_range", kind: null, normalized: s };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeDNI, validateDNI };
}
