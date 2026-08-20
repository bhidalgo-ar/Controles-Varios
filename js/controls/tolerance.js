// tolerance.js — El monto de diferencia con el que mide TODA la app (D-069)
//
// "De acá para abajo no me interesa." Ese número lo pone el analista una vez
// por cliente y vale para los 19 controles; hasta el 2026-08-19 el panel
// "Umbrales" lo mostraba escrito a mano ($ 1,00) y ningún control lo leía —
// cada uno traía su `0.01` cableado, así que la pantalla prometía un filtro
// que no existía.
//
// ── Cómo se resuelve, en orden ───────────────────────────────────────────────
//   1. La tolerancia propia del control, si el registry declara `ownTolerance`
//      (hoy Control de Netos y Cruce por Agrupadores, que ya la tienen editable
//      en su propio panel del Paso 2).
//   2. `clients.diffTolerance` — el monto del cliente, editable en el panel
//      "Umbrales" del wizard.
//   3. `DEFAULT_DIFF_TOLERANCE` ($ 0,01) — el margen de redondeo de Excel, que
//      es el mínimo posible: los floats de una planilla no dan igualdad exacta,
//      así que por debajo de un centavo el filtro deja de significar algo.
//
// ── Por qué hay un valor "de la corrida" en el módulo y no un parámetro ──────
// Decidir "esto es una diferencia" pasa en ~50 lugares repartidos por
// `js/controls/`: contadores del resumen, celdas pintadas, filtros de la tabla.
// Pasarlo por parámetro a los 50 obliga a cada control NUEVO a acordarse de
// enchufarlo, y un control que se olvida no falla: mide con otro número y nadie
// se entera. Con el valor acá, los helpers compartidos —`diffStats`,
// `diffCellHtml`, `isDiff`— ya salen midiendo con el monto correcto y un
// control nuevo lo hereda sin escribir una línea.
//
// Quien lo fija es siempre el borde de la app, en dos lugares y con
// `withTolerance()` (que restaura el anterior al salir): la corrida
// (`controlsWizard`) y el re-render de una corrida guardada (pantalla de
// resultados, checklist y lista de clientes, vía `summarizeWithTolerance`).
// Ningún control lo escribe.
//
// ── Lo que este monto NO toca ────────────────────────────────────────────────
// Sólo decide qué es diferencia **de cara al analista**. Las tolerancias
// estructurales quedan donde están y con su número: que un asiento cuadre
// DEBE contra HABER, que la suma calculada dé la fila TOTAL GENERAL, o que un
// valor hora coincida con el que Axton informa redondeado a 2 decimales. Ésas
// no son preferencia de nadie — son la forma del archivo — y subirlas a $ 100
// taparía un archivo mal leído.

import { toNum } from '../utils/currency.js';

/** El margen de redondeo de Excel. Es también el mínimo aceptado. */
export const DEFAULT_DIFF_TOLERANCE = 0.01;

let current = DEFAULT_DIFF_TOLERANCE;

/**
 * Normaliza lo que venga de la pantalla, del cliente o de un run viejo.
 * Un valor no numérico, negativo o por debajo del centavo cae al default: un
 * umbral en 0 marcaría como diferencia el ruido decimal de la planilla.
 */
export function normalizeTolerance(value) {
  const n = toNum(value);
  if (n === null || !Number.isFinite(n)) return DEFAULT_DIFF_TOLERANCE;
  return Math.max(DEFAULT_DIFF_TOLERANCE, Math.abs(n));
}

/** El monto con el que se está midiendo ahora mismo. */
export function currentTolerance() {
  return current;
}

/**
 * Corre `fn` midiendo con `value` y deja el valor anterior como estaba, pase lo
 * que pase adentro. Es la ÚNICA forma de cambiarlo: sin el restore, un control
 * que tira una excepción a mitad de camino le deja su tolerancia puesta al
 * siguiente, y el de al lado sale medido con un número que no es el suyo.
 */
export function withTolerance(value, fn) {
  const prev = current;
  current = normalizeTolerance(value);
  try {
    return fn();
  } finally {
    current = prev;
  }
}

/**
 * ¿Este número es una diferencia? La pregunta que hacen los controles.
 *
 * `null`/`undefined` NO son diferencia: significan "no hay dato" (la columna no
 * está mapeada, o ninguna liquidación trajo valor), que es distinto de "hay
 * dato y vale cero". Ver el gotcha de `null` vs `0` en CLAUDE.md.
 *
 * @param {number|null|undefined} value
 * @param {number} [tol] tolerancia explícita; sin ella, la de la corrida
 */
export function isDiff(value, tol) {
  if (value === null || value === undefined) return false;
  const n = typeof value === 'number' ? value : toNum(value);
  if (n === null || !Number.isFinite(n)) return false;
  return Math.abs(n) > (tol === undefined ? current : normalizeTolerance(tol));
}

/** El monto del cliente (`clients.diffTolerance`), o el default si no puso nada. */
export function resolveClientTolerance(client) {
  return normalizeTolerance(client?.diffTolerance);
}

/**
 * Con qué monto se midió una corrida ya guardada. Lo estampa el wizard en los
 * resultados de cada control al ejecutar, así una corrida vieja se vuelve a
 * abrir con los mismos números que el día que se miró — cambiar el monto del
 * cliente hoy no reescribe lo que ya se revisó y se cerró (decisión de Willy,
 * 2026-08-19).
 *
 * Un run guardado antes de que el campo existiera no lo trae y cae al default,
 * que es exactamente con lo que se midió entonces.
 */
export function toleranceOfResults(results) {
  return normalizeTolerance(results?.diffTolerance);
}

/**
 * Deja escrito en los resultados con qué monto se midieron. No pisa uno ya
 * puesto (un control podría estamparlo por su cuenta) y no toca resultados que
 * no sean un objeto propio — hay `run()` que devuelven arrays.
 */
export function stampTolerance(results, tol) {
  if (!results || typeof results !== 'object' || Array.isArray(results)) return results;
  if (results.diffTolerance === undefined) results.diffTolerance = normalizeTolerance(tol);
  return results;
}

/**
 * La tolerancia con la que hay que medir ESTE control en ESTA corrida: la
 * propia del control si la declara en el registry, si no la del cliente.
 *
 * `ownTolerance.from(mapping)` puede devolver `null`/`undefined` (el control
 * tiene panel propio pero el analista no cargó nada): ahí manda la del cliente.
 */
export function resolveControlTolerance(ctrl, mapping, clientTolerance) {
  const propia = ctrl?.ownTolerance?.from?.(mapping);
  const n = toNum(propia);
  return normalizeTolerance(n === null ? clientTolerance : n);
}

/**
 * `summarize()` de un control sobre resultados guardados, midiendo con el monto
 * de esa corrida. Lo usan las CUATRO pantallas que pintan el semáforo del mismo
 * control (corrida, resultados, checklist y lista de clientes): con una que
 * llame a `ctrl.summarize()` pelado, el mismo control sale de distinto color
 * según dónde se lo mire.
 */
export function summarizeWithTolerance(ctrl, results) {
  if (!ctrl?.summarize) return null;
  return withTolerance(toleranceOfResults(results), () => ctrl.summarize(results));
}

/** Igual que `summarizeWithTolerance`, para el detalle en pantalla. */
export function renderResultsWithTolerance(ctrl, results, container) {
  if (!ctrl?.renderResults) return undefined;
  return withTolerance(toleranceOfResults(results), () => ctrl.renderResults(results, container));
}

/**
 * El monto formateado para pantalla: "$ 100,00". Vive acá y no en cada panel
 * para que el número que el analista lee sea el mismo objeto que el que mide.
 */
export function formatTolerance(value) {
  return `$ ${normalizeTolerance(value).toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}
