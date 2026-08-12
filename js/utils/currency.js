// currency.js — Todo lo relacionado con números y moneda
//
// Los Excels argentinos usan punto como separador de miles y coma como decimal:
//   "50.000,75" significa cincuenta mil con 75 centavos.
// JavaScript usa el sistema anglosajón: punto decimal, sin puntos de miles.
// Esta utilidad traduce entre los dos mundos.

/**
 * Convierte un valor del Excel a número JavaScript.
 * Acepta: número JS, string "50.000,75", string "50000.75", null, undefined.
 */
export function parseAmount(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return redondear(value);

  const str = String(value).trim();
  if (!str) return 0;

  // Eliminar puntos de miles y convertir coma decimal a punto
  const normalizado = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(normalizado);
  return isNaN(num) ? 0 : redondear(num);
}

/**
 * Convierte una celda a número **para comparar**, o `null` si no hay dato.
 *
 * `null` no es `0` (ver CLAUDE.md): `null` = la celda está vacía o no es un
 * número, `0` = hay dato y vale cero. Por eso esto no es `parseAmount`, que
 * devuelve `0` para una celda vacía — sirve para sumar totales, no para decidir
 * si un concepto se liquidó.
 *
 * Reemplaza las 7 copias que había en los módulos de control (D-042). Las 6
 * copias naive hacían `Number(v)`, que da `null` para `"1.234,56"`; la de
 * `variaciones.js` era el único parser es-AR completo, pero adoptarla a ciegas
 * rompía al revés: con SheetJS la celda de un .xlsx real llega ya como número,
 * y `"1234.56"` leído como es-AR daría `123456`. Así que el criterio **no es
 * elegir un bando**, es distinguir los dos casos:
 *
 *   - `1234.56` (number, viene de SheetJS)        → 1234.56, sin tocar
 *   - `"1.234,56"` (string es-AR, Tabulado HTML)  → 1234.56
 *   - `"1.234"`    (miles es-AR, grupos de 3)     → 1234
 *   - `"1234.56"`  (string con punto decimal)     → 1234.56
 *   - `"(1.234,56)"` / `"-1.234,56"`              → -1234.56
 *   - `""`, `"-"`, `"Null"`, `"abc"`, `undefined` → null
 *
 * Cuando aparecen los dos separadores, el **último** es el decimal y el otro es
 * de miles — así `"1.234,56"` y `"1,234.56"` dan lo mismo sin adivinar locale.
 * Con un solo punto, se lee como separador de miles sólo si forma grupos de tres
 * exactos (`1.234`, `12.345.678`); si no, es decimal (`1234.56`, `1.5`).
 */
export function toNum(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean' || value instanceof Date) return null;

  // Espacio duro (U+00A0): los exports HTML de Meta4 lo usan como separador de miles.
  let s = String(value).replace(/ /g, ' ').trim();
  if (s === '' || s === '-') return null;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1).trim(); }
  if (s.startsWith('-'))      { negativo = true; s = s.slice(1).trim(); }
  else if (s.startsWith('+')) { s = s.slice(1).trim(); }

  s = s.replace(/[^\d.,]/g, ''); // saca "$", espacios de miles, "ARS", etc.
  if (!/\d/.test(s)) return null;

  const ultimaComa  = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  if (ultimaComa !== -1 && ultimoPunto !== -1) {
    s = ultimaComa > ultimoPunto
      ? s.replace(/\./g, '').replace(',', '.')  // es-AR: "1.234,56"
      : s.replace(/,/g, '');                    // en-US: "1,234.56"
  } else if (ultimaComa !== -1) {
    // Una sola coma es decimal ("1.234,56" ya salió arriba); varias sólo pueden
    // ser separadores de miles, porque no hay número con dos decimales.
    s = (s.match(/,/g).length === 1) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/** Redondea a 2 decimales (evita errores de coma flotante como 0.1+0.2=0.30000000004) */
export function redondear(num) {
  return Math.round(num * 100) / 100;
}

/**
 * Diferencia entre dos importes, o `null` si a alguno de los dos le falta el dato.
 *
 * `null` no es `0`: un lado sin dato no se compara contra nada (ver CLAUDE.md).
 * El guard es `Number.isFinite` y no `!= null` a propósito — con `!== null` un
 * `undefined` (típico de un optional chaining sobre un match que no existió) se
 * colaba y devolvía `NaN`, que después `Math.abs(NaN) > 0.01` reporta como "sin
 * diferencia" y pinta el control en verde.
 */
export function diffOrNull(a, b) {
  return (Number.isFinite(a) && Number.isFinite(b)) ? a - b : null;
}

/** Formatea un número como moneda argentina: 50000.75 → "50.000,75" */
export function formatAmount(value, decimales = 2) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(value);
}

/** Formatea una diferencia con signo y color: +1.234,50 en verde, -500,00 en rojo */
export function formatDiff(value) {
  if (value === 0) return '<span class="text-success">$ 0,00</span>';
  const fmt = formatAmount(Math.abs(value));
  if (value > 0) return `<span class="text-success">+$ ${fmt}</span>`;
  return `<span class="text-danger">-$ ${fmt}</span>`;
}

/** Formatea un porcentaje con signo: +1,23% o -0,45% */
export function formatPct(value) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}
