/**
 * Normalización de legajos, importes, fechas y códigos argentinos.
 */

/**
 * Normaliza un legajo. Preserva original para mostrar al usuario.
 * @param {*} v
 * @param {object} opts
 * @param {boolean} opts.stripLeadingZeros - quitar ceros a la izquierda (default true)
 * @param {boolean} opts.keepPrefix - preservar prefijos tipo "EMP-" (default true, importante si conviven empresas)
 * @param {number} opts.minLength - padear con ceros a la izquierda hasta esta longitud (default 0 = no padear)
 */
function normalizeLegajo(v, { stripLeadingZeros = true, keepPrefix = true, minLength = 0 } = {}) {
  if (v == null) return { original: "", normalized: "" };
  const original = String(v).trim();
  let s = original.toUpperCase();

  if (!keepPrefix) {
    s = s.replace(/[^\d]/g, "");
  } else {
    // Preservar prefijos alfabéticos tipo "EMP-123", quitar solo separadores
    s = s.replace(/[\s_\.]+/g, "");
  }

  if (stripLeadingZeros) {
    // Solo quitar ceros del componente numérico final
    s = s.replace(/^0+(?=\d)/, "").replace(/([A-Z\-]+)0+(?=\d)/, "$1");
  }

  if (minLength > 0 && /^\d+$/.test(s)) {
    s = s.padStart(minLength, "0");
  }

  return { original, normalized: s };
}

/**
 * Parsea importe en formato AR "1.234.567,89" → 1234567.89
 * También soporta formato US "1,234,567.89" si se especifica.
 */
function normalizeAmount(v, { locale = "ar" } = {}) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/\s/g, "").replace(/[$ARS]/gi, "");
  const negative = /^-/.test(s) || /\(.*\)/.test(s);
  s = s.replace(/[()]/g, "").replace(/^-/, "");
  if (locale === "ar") {
    // "1.234.567,89" → "1234567.89"
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // "1,234,567.89" → "1234567.89"
    s = s.replace(/,/g, "");
  }
  const n = Number(s);
  if (isNaN(n)) return null;
  return negative ? -n : n;
}

/**
 * Normaliza códigos (centro de costo, concepto).
 * Uppercase, trim, padding opcional con ceros a la izquierda.
 */
function normalizeCode(v, { padLength = 0 } = {}) {
  if (v == null) return "";
  let s = String(v).trim().toUpperCase().replace(/\s+/g, "");
  if (padLength > 0 && /^\d+$/.test(s)) {
    s = s.padStart(padLength, "0");
  }
  return s;
}

/**
 * Normaliza fechas en formato AR DD/MM/YYYY a ISO YYYY-MM-DD.
 * Soporta también DD-MM-YYYY, DD/MM/YY, ISO, serial Excel (si ya viene como Date).
 */
function normalizeDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // ISO ya correcto
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY o DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = parseInt(y, 10) < 50 ? "20" + y : "19" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeLegajo, normalizeAmount, normalizeCode, normalizeDate };
}
