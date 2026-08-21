// legajosCruzados.test.js — El KPI "Legajos cruzados" cuenta EMPLEADOS, no filas
// del Tabulado.
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/legajosCruzados.test.js
//
// Datos 100% inventados: legajos '1'/'2'/'3' y apellidos Sanguinetti/Falcioni.
//
// Lo que este test fija, en orden de qué cuesta más caro si se rompe:
//   1. El legajo con mensual + baja en el mismo mes cuenta UNA vez. Es el bug
//      más caro del repo (CLAUDE.md): el Tabulado trae una fila por liquidación,
//      no por empleado, y el KPI mostraba el largo crudo de parsedRows.
//   2. Las dos ramas del KPI dan el MISMO número para el mismo archivo. Antes
//      una contaba filas del Tabulado (5) y la otra empleados del reporte (4):
//      el mismo dato daba dos números según qué archivos trajera la corrida.
//   3. La clave de legajo es la del cliente (D-038): '007' y '7' son el mismo
//      empleado en modo sin_ceros y dos empleados en modo trim.
//   4. Una fila sin legajo no cuenta como un empleado más.
//   5. parseMetadata.totalRows sigue significando FILAS — el parser no cambió y
//      el KPI ya no lo usa.

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] };
globalThis.window   = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };

const { buildHeroHtml } = await import('./js/ui/controlsResults.js');
const { countUniqueLegajos } = await import('./js/controls/consolidate.js');
const { makeLegajoKey, LEGAJO_KEY_MODES } = await import('./js/utils/legajo.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// Un Tabulado de 5 filas y 4 empleados: el legajo '2' tuvo la mensual y la baja
// en el mismo mes, así que aparece dos veces. Es el archivo del caso reportado.
const TAB_ROWS = [
  { LEGAJO: '1', APELLIDO: 'Sanguinetti', LIQUIDACION: 'Mensual' },
  { LEGAJO: '2', APELLIDO: 'Falcioni', LIQUIDACION: 'Mensual' },
  { LEGAJO: '2', APELLIDO: 'Falcioni', LIQUIDACION: 'Baja'    },
  { LEGAJO: '3', APELLIDO: 'Lucchetti', LIQUIDACION: 'Mensual' },
  { LEGAJO: '4', APELLIDO: 'Datolo',  LIQUIDACION: 'Mensual' },
];

const tabFile = {
  fileType: 'tab_control',
  fileName: 'tabulado.xlsx',
  mapping: { empleadoColumn: 'LEGAJO' },
  parsedRows: TAB_ROWS,
  parseMetadata: { totalRows: TAB_ROWS.length }, // 5 filas: sigue siendo filas
};

/** Un control por legajo que cruzó los 4 empleados, sin diferencias. */
const brutosOk = {
  row:  { controlId: 'brutos' },
  ctrl: { label: 'Brutos' },
  tier: 'ok',
  summary: {
    unit: 'legajo', unitsTotal: 4, unitsWithDiff: 0, status: 'ok',
    diffTotalAmount: 0, worstCase: null, contextNote: null, headline: null,
  },
};

/** El número que quedó en el KPI "Legajos cruzados" del tablero del Resumen. */
function kpiLegajosCruzados(html) {
  const m = html.match(/rsm-kpi__value[^>]*>([^<]+)<\/span>\s*<span class="rsm-kpi__label">Legajos cruzados/);
  return m ? m[1].trim() : null;
}

// ── 1. El legajo con doble liquidación cuenta una sola vez ───────────────────
{
  const hero = buildHeroHtml([brutosOk], [tabFile], 5);
  assert('el Tabulado de 5 filas y 4 empleados muestra 4, no 5',
    kpiLegajosCruzados(hero.html) === '4');
  assert('el 5 crudo de parsedRows.length no llega a la pantalla',
    kpiLegajosCruzados(hero.html) !== '5');
}

// ── 2. Las dos ramas del KPI dan el mismo número ─────────────────────────────
// Era la prueba de que el número estaba mal: con Tabulado 5, sin Tabulado 4.
{
  const conTab = buildHeroHtml([brutosOk], [tabFile], 5);
  const sinTab = buildHeroHtml([brutosOk], [],        5);
  assert('con Tabulado y sin Tabulado dan el MISMO número para el mismo dato',
    kpiLegajosCruzados(conTab.html) === kpiLegajosCruzados(sinTab.html));
  assert('y ese número es 4', kpiLegajosCruzados(sinTab.html) === '4');
}

// ── 3. La clave de legajo es la del cliente (D-038) ──────────────────────────
{
  const rowsConCeros = [{ LEGAJO: '007' }, { LEGAJO: '7' }, { LEGAJO: '8' }];
  const tabCeros = { ...tabFile, parsedRows: rowsConCeros, parseMetadata: { totalRows: 3 } };

  const sinCeros = buildHeroHtml([brutosOk], [tabCeros], 5, LEGAJO_KEY_MODES.SIN_CEROS);
  assert('modo sin_ceros: «007» y «7» son el mismo empleado → 2',
    kpiLegajosCruzados(sinCeros.html) === '2');

  const trim = buildHeroHtml([brutosOk], [tabCeros], 5, LEGAJO_KEY_MODES.TRIM);
  assert('modo trim: «007» y «7» son empleados distintos → 3',
    kpiLegajosCruzados(trim.html) === '3');

  const porDefecto = buildHeroHtml([brutosOk], [tabCeros], 5);
  assert('sin modo configurado: gana el default del repo (sin_ceros)',
    kpiLegajosCruzados(porDefecto.html) === '2');

  assert('nunca se colapsa «12-B» con «12-C» (el parseInt descartado de D-038)',
    countUniqueLegajos([{ L: '12-B' }, { L: '12-C' }], 'L') === 2);
}

// ── 4. Filas sin legajo no inventan empleados ────────────────────────────────
{
  const rowsHuecos = [{ LEGAJO: '1' }, { LEGAJO: '' }, { LEGAJO: null }, { LEGAJO: '  ' }, { LEGAJO: '2' }];
  const tabHuecos = { ...tabFile, parsedRows: rowsHuecos, parseMetadata: { totalRows: 5 } };
  const hero = buildHeroHtml([brutosOk], [tabHuecos], 5);
  assert('las filas sin legajo no cuentan como empleados',
    kpiLegajosCruzados(hero.html) === '2');
}

// ── 5. Sin columna de empleado mapeada no se muestra un 0 inventado ──────────
{
  const tabSinCol = { ...tabFile, mapping: {} };
  const hero = buildHeroHtml([brutosOk], [tabSinCol], 5);
  assert('sin columna de empleado: cae al fallback (4), no muestra 0',
    kpiLegajosCruzados(hero.html) === '4');

  const tabSinRows = { ...tabFile, parsedRows: undefined };
  const heroSinRows = buildHeroHtml([brutosOk], [tabSinRows], 5);
  assert('sin filas guardadas: cae al fallback (4), no muestra 0',
    kpiLegajosCruzados(heroSinRows.html) === '4');
}

// ── 6. El helper compartido, directo ─────────────────────────────────────────
{
  assert('countUniqueLegajos cuenta empleados, no filas',
    countUniqueLegajos(TAB_ROWS, 'LEGAJO') === 4);
  assert('countUniqueLegajos con la misma keyFn que los cruces',
    countUniqueLegajos(TAB_ROWS, 'LEGAJO', { keyFn: makeLegajoKey(LEGAJO_KEY_MODES.TRIM) }) === 4);
  assert('sin filas devuelve 0', countUniqueLegajos(undefined, 'LEGAJO') === 0);
  assert('sin columna devuelve 0', countUniqueLegajos(TAB_ROWS, null) === 0);
  assert('el largo crudo de las filas era 5 (o sea: el bug existía)',
    TAB_ROWS.length === 5 && countUniqueLegajos(TAB_ROWS, 'LEGAJO') === 4);
}

// ── 6b. El wizard dice el MISMO número que el hero ───────────────────────────
// Sin esto el analista ve 5 al ejecutar y 4 al mirar el resultado del mismo
// archivo, y no hay nada en pantalla que le explique el cambio.
{
  const { executeCtaLabel } = await import('./js/ui/controlsWizard.js');

  const state = {
    selectedControls: ['brutos', 'nr', 'gsPers'],
    client: { legajoKeyMode: LEGAJO_KEY_MODES.SIN_CEROS },
    tab: { parsedRows: TAB_ROWS, mapping: { empleadoColumn: 'LEGAJO' }, parseMetadata: { totalRows: 5 } },
  };
  assert('el botón de ejecutar dice "sobre 4 legajos", no 5',
    executeCtaLabel(state) === '▶ Ejecutar 3 controles sobre 4 legajos');

  const hero = buildHeroHtml([brutosOk], [tabFile], 5, LEGAJO_KEY_MODES.SIN_CEROS);
  assert('el wizard y el hero coinciden para el mismo archivo',
    executeCtaLabel(state).includes(kpiLegajosCruzados(hero.html)));

  const sinTab = { ...state, tab: null };
  assert('sin Tabulado el botón omite el número en vez de decir 0',
    executeCtaLabel(sinTab) === '▶ Ejecutar 3 controles');

  const sinColumna = { ...state, tab: { ...state.tab, mapping: {} } };
  assert('sin columna de empleado mapeada tampoco aparece un 0 inventado',
    executeCtaLabel(sinColumna) === '▶ Ejecutar 3 controles');
}

// ── 7. parseMetadata.totalRows sigue significando filas ──────────────────────
{
  assert('el dato del parser no cambió de significado: 5 filas',
    tabFile.parseMetadata.totalRows === 5);
  const hero = buildHeroHtml([brutosOk], [tabFile], 5);
  assert('...y el KPI ya no lo usa', kpiLegajosCruzados(hero.html) === '4');
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
