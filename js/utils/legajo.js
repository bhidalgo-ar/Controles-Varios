// legajo.js — Cómo se decide si dos legajos son el mismo empleado.
//
// Convivían tres criterios distintos en el repo (D-038): `norm()` con sólo
// `trim` en nr/brutos/gsPers/variaciones/rendVsAsiento, `normId()` con
// `replace(/^0+/,'')` en rendXEe.js, y otro `normId()` con `parseInt` en
// catXEmpleados.js. Con tres criterios, el mismo cruce daba empleados
// "faltantes" de un solo lado según qué control lo mirara.
//
// El estándar es **por cliente** (`clients.legajoKeyMode`, editable desde
// #/admin y distribuido en el seed) porque cómo rellena los legajos es una
// característica del archivo del cliente, no del control. El default global
// existe sólo para el cliente que todavía no configuró nada.
//
// El `parseInt` de catXEmpleados no se conserva como opción a propósito:
// colapsaba `'12-B'` y `'12-C'` en `12`, que es un match falso, no un match
// más flexible.

export const LEGAJO_KEY_MODES = {
  /** `'007'` y `'7'` son el MISMO empleado (default — decisión de Willy, 2026-08-12). */
  SIN_CEROS: 'sin_ceros',
  /** El legajo tal cual viene, sólo sin espacios: `'007'` y `'7'` son DISTINTOS. */
  TRIM: 'trim',
};

export const DEFAULT_LEGAJO_KEY_MODE = LEGAJO_KEY_MODES.SIN_CEROS;

/** Texto para la pantalla de configuración del cliente. */
export const LEGAJO_KEY_MODE_LABELS = {
  [LEGAJO_KEY_MODES.SIN_CEROS]: 'Ignorar ceros a la izquierda — «007» y «7» son el mismo empleado',
  [LEGAJO_KEY_MODES.TRIM]:      'Tal cual viene en el archivo — «007» y «7» son empleados distintos',
};

export function isValidLegajoKeyMode(mode) {
  return Object.values(LEGAJO_KEY_MODES).includes(mode);
}

/**
 * Clave de comparación de un legajo. Devuelve `''` cuando no hay dato — quien
 * agrupa descarta esas filas en vez de inventar un legajo vacío.
 *
 * En modo `sin_ceros` sólo se tocan los legajos **enteramente numéricos**: un
 * legajo con letras o guiones (`'0A12'`, `'12-B'`) se compara tal cual, porque
 * ahí los ceros pueden ser parte del identificador y no relleno.
 */
export function legajoKey(value, mode = DEFAULT_LEGAJO_KEY_MODE) {
  const s = value === null || value === undefined ? '' : String(value).trim();
  if (s === '') return '';
  if (mode !== LEGAJO_KEY_MODES.SIN_CEROS) return s;
  if (!/^\d+$/.test(s)) return s;
  return s.replace(/^0+/, '') || '0';
}

/**
 * Devuelve la función de clave ya fijada en un modo, para pasarla como `keyFn`
 * a `groupRowsByLegajo` y usar **la misma** en los dos lados de un cruce: si un
 * lado agrupa con un criterio y el otro busca con otro, los legajos no matchean
 * y el control informa faltantes que no faltan.
 */
export function makeLegajoKey(mode = DEFAULT_LEGAJO_KEY_MODE) {
  const resolved = isValidLegajoKeyMode(mode) ? mode : DEFAULT_LEGAJO_KEY_MODE;
  return value => legajoKey(value, resolved);
}
