/**
 * Normaliza nombres y apellidos argentinos.
 * CRÍTICO: protege la ñ antes de NFD (sino queda convertida a "n").
 * Preserva guiones (apellidos compuestos) y apóstrofes (D'Angelo).
 */
function normalizeName(str) {
  if (str == null) return "";
  return String(str)
    .replace(/ñ/g, "\u0001").replace(/Ñ/g, "\u0002")           // proteger ñ/Ñ
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")          // quitar acentos
    .replace(/\u0001/g, "ñ").replace(/\u0002/g, "Ñ")           // restaurar ñ/Ñ
    .toUpperCase()
    .replace(/[^A-ZÑ'\- ]+/g, " ")                             // solo letras, ñ, apostrofe, guion, espacio
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parsea "APELLIDO, NOMBRE" vs "NOMBRE APELLIDO".
 * Con coma: formato inequívoco "APELLIDO, NOMBRE" (convención ANSES/F931).
 * Sin coma: asume "NOMBRE APELLIDO" (último token = apellido).
 */
function splitFullName(str) {
  if (str == null) return { apellido: "", nombre: "" };
  const raw = String(str);
  // IMPORTANTE: detectar la coma en el string original, antes de normalizar
  // (normalizeName la elimina junto con otra puntuación).
  if (raw.includes(",")) {
    const parts = raw.split(",");
    const apellido = normalizeName(parts[0]);
    const nombre = normalizeName(parts.slice(1).join(","));
    return { apellido, nombre };
  }
  const n = normalizeName(raw);
  if (!n) return { apellido: "", nombre: "" };
  const tokens = n.split(" ");
  if (tokens.length === 1) return { apellido: tokens[0], nombre: "" };
  // Heurística: último token = apellido, resto = nombre.
  // Nota: en nombres compuestos argentinos ("María del Carmen García López")
  // esta heurística falla; en esos casos es mejor pedir columnas separadas.
  return {
    apellido: tokens[tokens.length - 1],
    nombre: tokens.slice(0, -1).join(" ")
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeName, splitFullName };
}
