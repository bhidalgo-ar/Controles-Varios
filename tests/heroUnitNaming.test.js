// heroUnitNaming.test.js — El hero de resultados nombra la unidad que realmente
// verificó cada control (no "legajos" para todo).
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/heroUnitNaming.test.js
//
// Datos 100% inventados: no hay ni un legajo ni un nombre real acá.
//
// Lo que este test fija, en orden de qué cuesta más caro si se rompe:
//   1. Un control por centro de costo sin diferencias NO dice "0 legajos
//      verificados": dice cuántos centros de costo verificó.
//   2. Ese mismo control con diferencias dice cuántos centros de costo tienen
//      diferencia (antes decía "0 legajos con diferencia").
//   3. El medidor mide la unidad que hay y la nombra. Con una corrida toda por
//      centro de costo NO puede marcar 100% mientras el cartel dice "revisar":
//      es el "semáforo miente en verde" de CLAUDE.md, en el número grande.
//   4. Unidades distintas NUNCA se suman en un mismo porcentaje: si la corrida
//      mezcla legajos y centros de costo, el medidor mide legajos y lo dice, y
//      el subtítulo enumera las dos unidades por separado.
//   5. Cada unidad concuerda en género y número ("1 cuenta contable verificada").
//   6. El conteo de "Legajos cruzados" no cambia (ese arreglo es otro).

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] };
globalThis.window   = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };

const { buildHeroHtml } = await import('./js/ui/controlsResults.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const THRESHOLD = 5;

/** Un item de controlSummaries como lo arma la pantalla de resultados. */
function mkCtrl(controlId, label, unit, unitsTotal, unitsWithDiff, tier, extra = {}) {
  return {
    row:  { controlId },
    ctrl: { label },
    tier,
    summary: {
      unit, unitsTotal, unitsWithDiff,
      status: tier === 'ok' ? 'ok' : tier,
      diffTotalAmount: 0,
      worstCase: null,
      contextNote: null,
      headline: null,
      ...extra,
    },
  };
}

// ── 1. Un control por centro de costo, corrido solo, sin diferencias ─────────
{
  const hero = buildHeroHtml(
    [mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc', 24, 0, 'ok')],
    [], THRESHOLD, {},
  );
  assert('sin diferencias: nombra los centros de costo, no legajos',
    hero.html.includes('24 centros de costo verificados sin diferencias'));
  assert('sin diferencias: no aparece la palabra "legajos verificados"',
    !hero.html.includes('legajos verificados'));
  assert('sin diferencias: no aparece un falso "0 legajos"',
    !hero.html.includes('0 legajo'));
}

// ── 2. El mismo control CON diferencias ──────────────────────────────────────
{
  const hero = buildHeroHtml(
    [mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc', 24, 3, 'warn', { diffTotalAmount: 1500 })],
    [], THRESHOLD, {},
  );
  assert('con diferencias: cuenta los centros de costo con diferencia',
    hero.html.includes('3 centros de costo con diferencia'));
  assert('con diferencias: no dice "0 legajos con diferencia"',
    !hero.html.includes('legajos con diferencia') && !hero.html.includes('legajo con diferencia'));
  assert('con diferencias: sigue mostrando la diferencia total en pesos',
    hero.html.includes('dif. total'));
}

// ── 3. Dos controles por centro de costo: el medidor no puede mentir en verde ─
{
  const hero = buildHeroHtml(
    [
      mkCtrl('rendVsTabu',   'Rendimiento vs Tabulado', 'cc', 24, 3, 'warn'),
      mkCtrl('rendVsAsiento', 'Rendimiento vs Asiento', 'cc', 16, 2, 'warn'),
    ],
    [], THRESHOLD, {},
  );
  assert('multi-control por CC: se renderiza el medidor', hero.hasGauge === true);
  assert('multi-control por CC: el medidor mide los centros de costo (35 de 40 OK)',
    Math.abs(hero.pctOk - 87.5) < 0.001);
  assert('multi-control por CC: el medidor NO marca 100%', hero.pctOk < 100);
  assert('multi-control por CC: el medidor dice qué unidad mide',
    hero.html.includes('centros de costo OK') && !hero.html.includes('legajos OK'));
  assert('multi-control por CC: suma las diferencias de los dos controles',
    hero.html.includes('5 centros de costo con diferencia'));
  assert('multi-control por CC: la leyenda del umbral también nombra la unidad',
    hero.html.includes('de centros de costo c/dif'));
}

// ── 4. Corrida mixta: legajos y centros de costo no se suman en un % ─────────
{
  const hero = buildHeroHtml(
    [
      mkCtrl('brutos',     'Brutos',                  'legajo', 100, 1, 'warn'),
      mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc',      24, 3, 'warn'),
    ],
    [], THRESHOLD, {},
  );
  assert('mixta: el medidor mide legajos (99 de 100 OK), sin mezclar con CC',
    Math.abs(hero.pctOk - 99) < 0.001);
  assert('mixta: el medidor dice "legajos OK"',
    hero.html.includes('legajos OK') && !hero.html.includes('centros de costo OK'));
  assert('mixta: el subtítulo enumera las dos unidades por separado',
    hero.html.includes('1 legajo con diferencia') && hero.html.includes('3 centros de costo con diferencia'));
  assert('mixta: no aparece un total de 4 unidades sumadas',
    !hero.html.includes('4 legajo') && !hero.html.includes('4 centros'));
}

// ── 4b. Mixta sin diferencias: cada unidad con su propio conteo ──────────────
{
  const hero = buildHeroHtml(
    [
      mkCtrl('brutos',     'Brutos',                  'legajo', 100, 0, 'ok'),
      mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc',      24, 0, 'ok'),
    ],
    [], THRESHOLD, {},
  );
  assert('mixta OK: enumera legajos y centros de costo, sin sumarlos',
    hero.html.includes('100 legajos verificados · 24 centros de costo verificados, sin diferencias.'));
  assert('mixta OK: el medidor queda en 100% legajos', hero.pctOk === 100);
}

// ── 5. Género y número de cada unidad ────────────────────────────────────────
{
  const cuentas = buildHeroHtml(
    [mkCtrl('finadietAsiento', 'Asiento de Remuneraciones', 'cuenta', 18, 0, 'ok')],
    [], THRESHOLD, {},
  );
  assert('cuentas contables: concuerda en femenino plural',
    cuentas.html.includes('18 cuentas contables verificadas sin diferencias'));

  const unaCuenta = buildHeroHtml(
    [mkCtrl('finadietAsiento', 'Asiento de Remuneraciones', 'cuenta', 1, 0, 'ok')],
    [], THRESHOLD, {},
  );
  assert('una sola cuenta: femenino singular',
    unaCuenta.html.includes('1 cuenta contable verificada sin diferencias'));

  const listas = buildHeroHtml(
    [mkCtrl('acreditaciones', 'Acreditaciones', 'lista', 6, 0, 'ok')],
    [], THRESHOLD, {},
  );
  assert('listados: masculino plural',
    listas.html.includes('6 listados verificados sin diferencias'));

  const unCc = buildHeroHtml(
    [mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc', 1, 0, 'ok')],
    [], THRESHOLD, {},
  );
  assert('un solo centro de costo: singular',
    unCc.html.includes('1 centro de costo verificado sin diferencias'));

  const unLegajo = buildHeroHtml(
    [mkCtrl('brutos', 'Brutos', 'legajo', 1, 0, 'ok')],
    [], THRESHOLD, {},
  );
  assert('un solo legajo: sigue diciendo "1 legajo verificado"',
    unLegajo.html.includes('1 legajo verificado sin diferencias'));
}

// ── 6. "Legajos cruzados" no se toca ─────────────────────────────────────────
{
  const hero = buildHeroHtml(
    [mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc', 24, 0, 'ok')],
    [{ fileType: 'tab_control', parseMetadata: { totalRows: 412 } }], THRESHOLD, {},
  );
  assert('el KPI "Legajos cruzados" sigue saliendo del Tabulado',
    hero.html.includes('412') && hero.html.includes('Legajos cruzados'));
}

// ── 7. Corrida sólo de generación de reporte: no inventa unidades ────────────
{
  const hero = buildHeroHtml(
    [
      mkCtrl('brutosReporte', 'Brutos — Generar Reporte', null, null, null, 'info'),
      mkCtrl('nrReporte',     'NR — Generar Reporte',     null, null, null, 'info'),
    ],
    [], THRESHOLD, {},
  );
  assert('sólo reportes: el subtítulo lo dice y no nombra legajos',
    hero.html.includes('sólo incluye controles de generación de reporte') && !hero.html.includes('legajo'));
  assert('sólo reportes: el medidor no se atribuye una unidad que no verificó',
    hero.html.includes('unidades OK'));
}

// ── 8. Una unidad nueva sin etiqueta no se disfraza de legajos ───────────────
{
  const hero = buildHeroHtml(
    [mkCtrl('futuro', 'Control futuro', 'sucursal', 7, 0, 'ok')],
    [], THRESHOLD, {},
  );
  assert('unidad sin etiqueta: usa su propio nombre, no "legajos"',
    hero.html.includes('7 sucursals verificados') && !hero.html.includes('legajos verificados'));
}

// ── 9. El nombre de la unidad se escapa antes de entrar al HTML ──────────────
{
  const hero = buildHeroHtml(
    [mkCtrl('raro', 'Control raro', '<img src=x>', 3, 0, 'ok')],
    [], THRESHOLD, {},
  );
  assert('el nombre de la unidad entra escapado al HTML',
    !hero.html.includes('<img src=x>') && hero.html.includes('&lt;img src=x&gt;'));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
