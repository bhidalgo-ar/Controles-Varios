// textFormatters.js — Funciones comunes de normalización y formateo de texto/números

export function norm(v) {
  return v != null ? String(v).trim() : '';
}

// Convierte a número. Devuelve null — nunca 0 — cuando no hay dato: celda vacía,
// null o undefined. La distinción importa: null = "el archivo no informa nada acá"
// y no se compara; 0 = "informa cero" y sí se compara. Colapsar null a 0 genera
// diferencias fantasma contra el Tabulado (CLAUDE.md §11.5).
export function toNum(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtNum(v) {
  return v === null
    ? '—'
    : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
