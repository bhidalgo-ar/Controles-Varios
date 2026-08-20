// viewPreference.test.js — Preferencia de vista por control (Fase 3, "tablas y
// vistas de resultados"): qué solapa (Resumen/Detalle) dejó abierta el analista
// la última vez para ESE control, para reabrir ahí la próxima corrida.
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/viewPreference.test.js

// Node no tiene localStorage — stub mínimo en memoria, alcanza para probar el
// round-trip de get/set (mismo patrón que otros tests stubean `document`).
const store = new Map();
globalThis.localStorage = {
  getItem(k)    { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
};

const { getViewPreference, setViewPreference } = await import('./js/ui/viewPreference.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

assert('un control sin preferencia guardada devuelve {} (no null, no undefined)',
  JSON.stringify(getViewPreference('nunca_configurado')) === '{}');

setViewPreference('brutos', { tab: 'detalle' });
assert('después de guardar, se lee la misma solapa',
  getViewPreference('brutos').tab === 'detalle');

setViewPreference('brutos', { tab: 'resumen' });
assert('guardar de nuevo pisa el valor anterior (no lo acumula)',
  getViewPreference('brutos').tab === 'resumen');

assert('la preferencia de un control no se mezcla con la de otro',
  getViewPreference('nr').tab === undefined);

setViewPreference('nr', { tab: 'detalle' });
assert('dos controles guardan su preferencia por separado',
  getViewPreference('brutos').tab === 'resumen' && getViewPreference('nr').tab === 'detalle');

setViewPreference('gs_pers', { otraCosa: 'x' });
setViewPreference('gs_pers', { tab: 'detalle' });
assert('setViewPreference hace merge — no pisa otras claves ya guardadas para el mismo control',
  getViewPreference('gs_pers').otraCosa === 'x' && getViewPreference('gs_pers').tab === 'detalle');

// ── Por control Y POR ESTADO (vista estándar, §2) ──────────────────────────
// La regla es "con diferencias abre en Fichas, si cerró abre en Planilla". Con
// una sola clave por control, la primera vez que el analista cambia de solapa
// esa regla moría para siempre: quedaba 'planilla' guardado y el control que la
// corrida siguiente SÍ tenía diferencias abría igual en Planilla.
setViewPreference('acumuladores_ganancias', { tab: 'planilla' }, 'sinDif');
assert('la preferencia se guarda por estado del control',
  getViewPreference('acumuladores_ganancias', 'sinDif').tab === 'planilla');

assert('y no se mezcla con la del otro estado del mismo control',
  getViewPreference('acumuladores_ganancias', 'conDif').tab === undefined);

setViewPreference('acumuladores_ganancias', { tab: 'fichas' }, 'conDif');
assert('los dos estados conviven',
  getViewPreference('acumuladores_ganancias', 'conDif').tab === 'fichas'
  && getViewPreference('acumuladores_ganancias', 'sinDif').tab === 'planilla');

assert('un control que no declara estado sigue usando la clave de siempre',
  getViewPreference('acumuladores_ganancias').tab === undefined
  && getViewPreference('brutos').tab === 'resumen');

assert('sin controlId no rompe (no hay control todavía, ej. una pantalla que no declaró id)',
  JSON.stringify(getViewPreference(undefined)) === '{}');
setViewPreference(undefined, { tab: 'detalle' }); // no debe tirar

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
