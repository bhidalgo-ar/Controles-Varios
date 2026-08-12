// dates.js — Manejo de períodos (mes/año)
//
// En esta app, un "período" es siempre un string 'YYYY-MM', ej: '2026-05'.
// Ese formato permite ordenarlos fácilmente como texto ('2026-05' < '2026-06').

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Convierte '2026-05' en 'Mayo 2026' */
export function periodToLabel(period) {
  if (!period) return '';
  const [year, month] = period.split('-');
  return `${MESES[parseInt(month, 10) - 1]} ${year}`;
}

/** Devuelve el período del mes actual, ej: '2026-05' */
export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Devuelve el período del mes anterior. Ej: '2026-01' → '2025-12' */
export function previousPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** Devuelve el período del mes siguiente. Ej: '2025-12' → '2026-01' */
export function nextPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Sufijo de fecha para nombres de archivo exportados: 'YYYYMMDD'.
 *
 * En hora **local**, no UTC, y a propósito: con `toISOString()` un export
 * hecho a las 22:00 de Argentina salía fechado al día siguiente. Vivía
 * copiado en los 9 controles, con dos formatos distintos entre ellos
 * (8 en 'YYYYMMDD' UTC y Variaciones en 'DDMMYYYY' local).
 */
export function dateSuffix(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Sufijo de período para nombres de archivo: '2026-05' → '052026'.
 * Sin período, o con uno que no tenga la forma 'YYYY-MM', cae al sufijo del día.
 */
export function periodSuffix(period) {
  if (!period) return dateSuffix();
  const [year, month] = String(period).split('-');
  return (!year || !month) ? dateSuffix() : String(month).padStart(2, '0') + year;
}

/**
 * Devuelve una lista de los últimos N períodos para usar en un selector.
 * Cada elemento tiene { value: '2026-05', label: 'Mayo 2026' }
 */
export function periodOptions(count = 13) {
  const options = [];
  let period = currentPeriod();
  for (let i = 0; i < count; i++) {
    options.push({ value: period, label: periodToLabel(period) });
    period = previousPeriod(period);
  }
  return options;
}
