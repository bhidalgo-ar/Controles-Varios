// textFormatters.js — Funciones comunes de normalización y formateo de texto/números

export function norm(v) {
  return v != null ? String(v).trim() : '';
}

export function toNum(v) {
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
