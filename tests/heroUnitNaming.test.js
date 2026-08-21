// heroUnitNaming.test.js — El Resumen de resultados nombra la unidad que
// realmente verificó cada control (no "legajos" para todo).
//
// El hero (círculo + título + 4 KPIs) es hoy el TABLERO del Resumen del run
// (docs/handoff-resumen-netos.md): el copy cambió entero, las reglas son las
// mismas. Un run de un control se dibuja con el layout 3a y uno de varios con
// el 3b, donde el conteo por unidad vive en la tarjeta de cada control — que es
// justo donde no se pueden mezclar dos unidades.
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
//   3. El número grande mide la unidad que hay y la nombra, con su porcentaje.
//      Con una corrida toda por centro de costo NO puede decir "sin diferencias"
//      ni mostrar 0%: es el "semáforo miente en verde" de CLAUDE.md, en el
//      título del veredicto. (Antes lo pintaba un gauge con un % OK; el
//      rediseño lo dice en palabras, la regla es la misma.)
//   4. Unidades distintas NUNCA se suman en un mismo porcentaje: si la corrida
//      mezcla legajos y centros de costo, el medidor mide legajos y lo dice, y
//      el subtítulo enumera las dos unidades por separado.
//   5. Cada unidad concuerda en género y número ("1 cuenta contable verificada").
//   6. El conteo de "Legajos cruzados" no cambia (ese arreglo es otro).
//   7. La tarjeta de cada control nombra SU unidad, aunque el hero mida otra.

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] };
globalThis.window   = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };

const { buildHeroHtml, buildCtrlCardsHtml } = await import('./js/ui/controlsResults.js');
const { UNIT_NAMES } = await import('./js/ui/controlsResults.js');
const { RUN_UNITS }  = await import('./js/ui/controlsWizard.js');

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
    [], THRESHOLD,
  );
  assert('sin diferencias: nombra los centros de costo, no legajos',
    hero.html.includes('24 centros de costo evaluados: ninguna diferencia arriba de la tolerancia'));
  assert('sin diferencias: no aparece la palabra "legajos"',
    !hero.html.includes('legajos'));
  assert('sin diferencias: no aparece un falso "0 legajos"',
    !hero.html.includes('0 legajo'));
}

// ── 2. El mismo control CON diferencias ──────────────────────────────────────
{
  const hero = buildHeroHtml(
    [mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc', 24, 3, 'warn', { diffTotalAmount: 1500 })],
    [], THRESHOLD,
  );
  assert('con diferencias: cuenta los centros de costo con diferencia',
    hero.html.includes('<strong>3</strong> de <strong>24</strong> centros de costo con diferencia')
    && hero.html.includes('>Ver 3 centros de costo →</button>'));
  assert('con diferencias: no dice "0 legajos con diferencia"',
    !hero.html.includes('legajos con diferencia') && !hero.html.includes('legajo con diferencia'));
  assert('con diferencias: sigue mostrando la diferencia total en pesos',
    hero.html.includes('Δ acumulada') && hero.html.includes('$ 1.500,00'));
}

// ── 3. Dos controles por centro de costo: el veredicto no miente en verde ────
{
  const hero = buildHeroHtml(
    [
      mkCtrl('rendVsTabu',   'Rendimiento vs Tabulado', 'cc', 24, 3, 'warn'),
      mkCtrl('rendVsAsiento', 'Rendimiento vs Asiento', 'cc', 16, 2, 'warn'),
    ],
    [], THRESHOLD,
  );
  assert('multi-control por CC: el KPI del run cuenta los CC con diferencia, no legajos',
    hero.html.includes('centros de costo con diferencia</span>'));
  assert('multi-control por CC: NO dice que se puede liberar sin más',
    !hero.html.includes('Listo para liberar'));
  // 5 sobre 24 (el control más grande), no sobre 24+16: sumar los universos de
  // los dos controles cuenta dos veces al mismo CC y parte el porcentaje al medio.
  // 5 sobre 24 (el control más grande), no sobre 24+16: sumar los universos de
  // los dos controles cuenta dos veces al mismo CC y parte el porcentaje al medio.
  assert('multi-control por CC: suma las diferencias de los dos controles sobre el mayor universo',
    hero.html.includes('>5<') && hero.html.includes('centros de costo con diferencia</span>'));
  assert('multi-control por CC: el % es el de los CC (5 de 24), no 0',
    !hero.html.includes('(0,0%)'));
  assert('multi-control por CC: cada tarjeta cuenta SU universo, sin mezclarlos',
    hero.html.includes('3 de 24 centros de costo') && hero.html.includes('2 de 16 centros de costo'));
}

// ── 4. Corrida mixta: legajos y centros de costo no se suman en un % ─────────
{
  const hero = buildHeroHtml(
    [
      mkCtrl('brutos',     'Brutos',                  'legajo', 100, 1, 'warn'),
      mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc',      24, 3, 'warn'),
    ],
    [], THRESHOLD,
  );
  assert('mixta: el KPI del run mide legajos, sin mezclar con los CC',
    hero.html.includes('legajos con diferencia</span>'));
  assert('mixta: el KPI nombra los legajos, no los centros de costo',
    hero.html.includes('legajos con diferencia</span>')
    && !hero.html.includes('centros de costo con diferencia</span>'));
  assert('mixta: cada tarjeta enumera SU unidad por separado',
    hero.html.includes('1 de 1 legajo') === false
    && hero.html.includes('1 de 100 legajos') && hero.html.includes('3 de 24 centros de costo'));
  // 1 legajo + 3 CC no son "4 unidades": cada tarjeta cuenta lo suyo contra su
  // propio universo y en ningún lado aparece una suma de las dos unidades.
  assert('mixta: no aparece un total de 4 unidades sumadas',
    !hero.html.includes('4 legajo')
    && !hero.html.includes('4 de 124')
    && !hero.html.includes('>4<'));
}

// ── 4b. Mixta sin diferencias: cada unidad con su propio conteo ──────────────
{
  const hero = buildHeroHtml(
    [
      mkCtrl('brutos',     'Brutos',                  'legajo', 100, 0, 'ok'),
      mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc',      24, 0, 'ok'),
    ],
    [], THRESHOLD,
  );
  // Los verdes van agrupados en una sola card, con su propio universo cada uno:
  // "0 de 100" y "0 de 24", nunca "0 de 124".
  assert('mixta OK: enumera los dos controles con su propio universo, sin sumarlos',
    hero.html.includes('>0 de 100<') && hero.html.includes('>0 de 24<')
    && !hero.html.includes('124'));
  assert('mixta OK: el título es el veredicto en palabras, sin porcentajes inventados',
    hero.html.includes('Listo para liberar</h2>'));
}

// ── 4c. Varios controles sobre los MISMOS empleados no los cuentan dos veces ──
// Decisión de Willy (2026-08-13): "4 legajos verificados en 2 controles".
{
  const hero = buildHeroHtml(
    [
      mkCtrl('brutos', 'Brutos',   'legajo', 4, 0, 'ok'),
      mkCtrl('nr',     'No Remun.', 'legajo', 4, 0, 'ok'),
    ],
    [], THRESHOLD,
  );
  assert('dos controles sobre 4 empleados: cada tarjeta dice 0 de 4',
    hero.html.split('0 de 4').length - 1 === 2);
  assert('dos controles sobre 4 empleados: NO dice "8 legajos"',
    !hero.html.includes('8 legajo'));
}

// ── 4d. Un solo control no arrastra el "en N controles" ──────────────────────
{
  const hero = buildHeroHtml(
    [
      mkCtrl('brutos',     'Brutos',                  'legajo', 4, 0, 'ok'),
      mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc',    24, 0, 'ok'),
    ],
    [], THRESHOLD,
  );
  assert('una unidad con un solo control: cada tarjeta con su propio universo',
    hero.html.includes('>0 de 4<') && hero.html.includes('>0 de 24<')
    && !hero.html.includes('>0 de 28<'));
}

// ── 4e. Tres controles por legajo, uno con menos empleados que los otros ─────
// El summary informa cuántas unidades verificó cada control, no cuáles: lo más
// que se puede afirmar es el mayor. Sumar contaría el mismo empleado 3 veces.
{
  const hero = buildHeroHtml(
    [
      mkCtrl('brutos',     'Brutos',      'legajo', 100, 0, 'ok'),
      mkCtrl('nr',         'No Remun.',   'legajo',  40, 0, 'ok'),
      mkCtrl('variaciones', 'Variaciones', 'legajo', 100, 0, 'ok'),
    ],
    [], THRESHOLD,
  );
  assert('tres controles: el KPI de legajos cruzados toma el mayor (100), no la suma (240)',
    hero.html.includes('>100<') && !hero.html.includes('240'));
}

// ── 5. Género y número de cada unidad ────────────────────────────────────────
{
  const cuentas = buildHeroHtml(
    [mkCtrl('finadietAsiento', 'Asiento de Remuneraciones', 'cuenta', 18, 0, 'ok')],
    [], THRESHOLD,
  );
  assert('cuentas contables: concuerda en femenino plural',
    cuentas.html.includes('18 cuentas contables evaluadas: ninguna diferencia'));

  const unaCuenta = buildHeroHtml(
    [mkCtrl('finadietAsiento', 'Asiento de Remuneraciones', 'cuenta', 1, 0, 'ok')],
    [], THRESHOLD,
  );
  assert('una sola cuenta: femenino singular',
    unaCuenta.html.includes('1 cuenta contable evaluada: ninguna diferencia'));

  const listas = buildHeroHtml(
    [mkCtrl('acreditaciones', 'Acreditaciones', 'lista', 6, 0, 'ok')],
    [], THRESHOLD,
  );
  assert('listados: masculino plural',
    listas.html.includes('6 listados evaluados: ninguna diferencia'));

  const unCc = buildHeroHtml(
    [mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc', 1, 0, 'ok')],
    [], THRESHOLD,
  );
  assert('un solo centro de costo: singular',
    unCc.html.includes('1 centro de costo evaluado: ninguna diferencia'));

  const unLegajo = buildHeroHtml(
    [mkCtrl('brutos', 'Brutos', 'legajo', 1, 0, 'ok')],
    [], THRESHOLD,
  );
  assert('un solo legajo: sigue diciendo "1 legajo evaluado"',
    unLegajo.html.includes('1 legajo evaluado: ninguna diferencia'));
}

// ── 6. "Legajos cruzados" sigue saliendo del Tabulado ────────────────────────
// (cuántos empleados cuenta es lo que fija tests/legajosCruzados.test.js)
{
  const tabFile = {
    fileType: 'tab_control',
    mapping: { empleadoColumn: 'LEGAJO' },
    parsedRows: [{ LEGAJO: '1' }, { LEGAJO: '2' }, { LEGAJO: '3' }],
    parseMetadata: { totalRows: 3 },
  };
  const hero = buildHeroHtml(
    [mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc', 24, 0, 'ok')],
    [tabFile], THRESHOLD,
  );
  assert('el KPI "Legajos cruzados" sigue saliendo del Tabulado',
    hero.html.includes('>3</span>') && hero.html.includes('Legajos cruzados'));
}

// ── 7. Corrida sólo de generación de reporte: no inventa unidades ────────────
{
  const hero = buildHeroHtml(
    [
      mkCtrl('brutosReporte', 'Brutos — Generar Reporte', null, null, null, 'info'),
      mkCtrl('nrReporte',     'NR — Generar Reporte',     null, null, null, 'info'),
    ],
    [], THRESHOLD,
  );
  assert('sólo reportes: la bajada lo dice y no nombra legajos',
    hero.html.includes('sólo incluye controles de generación de reporte') && !hero.html.includes('legajo'));
  // Sin unidad verificada no hay KPI de diferencias ni leyenda de umbral: el
  // veredicto no se atribuye una unidad que no verificó.
  assert('sólo reportes: no aparece un conteo de unidades ni la escala de severidad',
    !hero.html.includes('con diferencia') && !hero.html.includes('rsm-scale'));
}

// ── 8. Una unidad nueva sin etiqueta no se disfraza de legajos ───────────────
{
  const hero = buildHeroHtml(
    [mkCtrl('futuro', 'Control futuro', 'sucursal', 7, 0, 'ok')],
    [], THRESHOLD,
  );
  assert('unidad sin etiqueta: usa su propio nombre, no "legajos"',
    hero.html.includes('7 sucursals evaluados') && !hero.html.includes('legajos'));
}

// ── 9. El nombre de la unidad se escapa antes de entrar al HTML ──────────────
{
  const hero = buildHeroHtml(
    [mkCtrl('raro', 'Control raro', '<img src=x>', 3, 0, 'ok')],
    [], THRESHOLD,
  );
  assert('el nombre de la unidad entra escapado al HTML',
    !hero.html.includes('<img src=x>') && hero.html.includes('&lt;img src=x&gt;'));
}

// ── 10. La tarjeta de cada control nombra su propia unidad ──────────────────
// El hero mide UNA unidad (la principal de la corrida); cada tarjeta habla de
// la suya, así que en una corrida mixta la del control por CC no puede decir
// "legajos" sólo porque el hero mida legajos.
{
  const cards = buildCtrlCardsHtml(
    [
      mkCtrl('brutos',     'Brutos',                  'legajo', 100, 1, 'warn', { diffTotalAmount: 2500 }),
      mkCtrl('rendVsTabu', 'Rendimiento vs Tabulado', 'cc',      24, 3, 'warn'),
      mkCtrl('finadiet',   'Asiento de Remuneraciones', 'cuenta', 18, 0, 'ok'),
      mkCtrl('brutosRep',  'Brutos — Generar Reporte', null, null, null, 'info', { headline: 'Reporte generado' }),
    ],
    {}, true,
  );
  assert('tarjeta por legajo: cuenta legajos evaluados y con diferencia',
    cards.includes('1 de 100 legajos') && cards.includes('1,0 %'));
  assert('tarjeta por CC: cuenta centros de costo, no legajos',
    cards.includes('3 de 24 centros de costo') && cards.includes('12,5 %'));
  assert('tarjeta femenina: concuerda ("18 cuentas contables evaluadas")',
    cards.includes('18 cuentas contables evaluadas'));
  assert('tarjeta sin diferencias: el link va al detalle, no a un conteo',
    cards.includes('Ver detalle →'));
  assert('tarjeta con diferencias: el link ofrece ir a las diferencias',
    cards.includes('Ver la diferencia →') && cards.includes('Ver los 3 →'));
  assert('tarjeta de Generar Reporte: no inventa unidades',
    cards.includes('Reporte generado'));
}


// ── Las dos tablas de nombres de unidad cubren lo mismo ─────────────────────
// `UNIT_NAMES` (pantalla de resultados) y `RUN_UNITS` (tarjeta del Paso 3, la
// última pantalla antes de ver los resultados) nombran la MISMA cosa en dos
// lugares. Cuando una se queda atrás, esa pantalla llama "unidades" a la unidad
// del control: le pasó a `cuenta` —el asiento de FINADIET y la Contabilidad
// Desglosada— que mostraba "273 unidades cruzados".
{
  const enResultados = Object.keys(UNIT_NAMES).sort();
  const enLaCorrida  = Object.keys(RUN_UNITS).sort();
  assert(`las dos tablas de unidades declaran las mismas (${enResultados.join(', ')})`,
    enResultados.join(',') === enLaCorrida.join(','));
  for (const unit of enResultados) {
    assert(`${unit}: las dos tablas concuerdan en género`,
      UNIT_NAMES[unit].fem === RUN_UNITS[unit].fem);
    assert(`${unit}: las dos tablas usan el mismo plural`,
      UNIT_NAMES[unit].many === RUN_UNITS[unit].many);
  }
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
