// brutosControl.test.js — Test del control "Brutos" (modo Controlar y Generar
// Reporte). No existía un test dedicado para este control.
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/brutosControl.test.js
//
// Cubre:
//   1. Consolidación por legajo en los DOS lados (D-042) — Brutos consolidaba
//      el Tabulado pero recorría el reporte fila por fila hasta la Fase 1.
//   2. El falso verde de Paso 5 (specs/contrato-export.md, D-041): si
//      `salBaseColumn`/`aCuFutAumenColumn` no están mapeados en el archivo de
//      Brutos, "0 diferencias" no es un resultado limpio — es que no se pudo
//      comparar nada.
//   3. Que el modo "Generar Reporte" usa el contrato compartido (Paso 4a):
//      las 11 columnas salen siempre, layout:'fijo'.
//
// Datos 100% inventados (legajos '1'/'2'/'3', apellidos Perez/Gomez).

globalThis.document = { addEventListener: () => {} };

const {
  runBrutos, summarizeBrutos, runBrutosReporte, summarizeBrutosReporte,
} = await import('./js/controls/brutos.js');
const { EXPORT_CONTRACTS } = await import('./js/exports/contracts.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const mapping = {
  brutos: { legajoColumn: 'Legajo', salBaseColumn: 'SAL_BASE', aCuFutAumenColumn: 'A_CTA_FUT_AUMEN' },
  tab: { empleadoColumn: 'Legajo', tabSalBaseColumn: 'SAL_BASE_TAB', tabACuFutAumenColumn: 'ACFA_TAB' },
};

// ── 1. Consolidación por legajo, los DOS lados ───────────────────────────────

const brutosDosFilas = [
  { Legajo: '1', SAL_BASE: '600', A_CTA_FUT_AUMEN: '0' },  // mensual
  { Legajo: '1', SAL_BASE: '400', A_CTA_FUT_AUMEN: '0' },  // baja
  { Legajo: '2', SAL_BASE: '300', A_CTA_FUT_AUMEN: '0' },  // una sola
];
const tabConsolidado = [
  { Legajo: '1', SAL_BASE_TAB: '1000', ACFA_TAB: '0' },
  { Legajo: '2', SAL_BASE_TAB: '300',  ACFA_TAB: '0' },
];

const rCons = runBrutos(brutosDosFilas, tabConsolidado, mapping);
assert('el reporte con dos filas del mismo legajo sale consolidado en una',
  rCons.rows.length === 2);
const leg1 = rCons.rows.find(r => r.legajo === '1');
assert('SAL_BASE se suma (600+400=1000), no se pisa', Math.abs(leg1.salBase - 1000) < 0.01);
assert('contra el Tabulado (1000) no queda diferencia', Math.abs(leg1.ctrlSalBase) < 0.01);

// ── 2. El falso verde de Paso 5 (D-041) ──────────────────────────────────────

const mappingSinSalBase = {
  brutos: { legajoColumn: 'Legajo', salBaseColumn: '', aCuFutAumenColumn: '' }, // sin mapear
  tab: { empleadoColumn: 'Legajo', tabSalBaseColumn: 'SAL_BASE_TAB', tabACuFutAumenColumn: 'ACFA_TAB' },
};
const brutosSinMapear = [
  { Legajo: '1', SAL_BASE: '999', A_CTA_FUT_AUMEN: '999' }, // el archivo SÍ trae datos...
  { Legajo: '2', SAL_BASE: '999', A_CTA_FUT_AUMEN: '999' },
];
const tabConSueldosReales = [
  // ...pero al no estar mapeada la columna, nunca se leen. El Tabulado SÍ
  // tiene sueldos reales — sin distinguir "evaluado" de "algún valor en
  // cualquiera de los dos lados", esto se leía como "todo verificado, sin
  // diferencias".
  { Legajo: '1', SAL_BASE_TAB: '850000', ACFA_TAB: '30000' },
  { Legajo: '2', SAL_BASE_TAB: '920000', ACFA_TAB: '30000' },
];

const rNada = runBrutos(brutosSinMapear, tabConSueldosReales, mappingSinSalBase);
const sNada = summarizeBrutos(rNada);

assert('con las columnas sin mapear, ctrlSalBase/ctrlACuFutAumen son null en TODAS las filas',
  rNada.rows.every(r => r.ctrlSalBase === null && r.ctrlACuFutAumen === null));
assert('unitsEvaluated es 0 pese a que hay 2 legajos con sueldos reales en el Tabulado',
  sNada.unitsEvaluated === 0 && sNada.unitsTotal === 2);
assert('status pasa a "error" — no "success": un control que verificó CERO legajos no es un resultado limpio',
  sNada.status === 'error');
assert('el headline avisa que nada se pudo comparar',
  sNada.headline.includes('ninguno se pudo comparar'));
assert('el contextNote pide revisar el mapeo, no dice "verificados"',
  !sNada.contextNote.includes('verificados') && sNada.contextNote.includes('mapeo'));
assert('los dos insights avisan "sin datos para comparar"',
  sNada.insights.every(i => i.type === 'warning' && i.label.includes('sin datos para comparar')));

// Caso de control: con datos reales y coincidentes, sigue en 'success'.
const rOk = runBrutos(
  [{ Legajo: '1', SAL_BASE: '850000', A_CTA_FUT_AUMEN: '30000' }],
  [{ Legajo: '1', SAL_BASE_TAB: '850000', ACFA_TAB: '30000' }],
  mapping
);
const sOk = summarizeBrutos(rOk);
assert('con datos reales y coincidentes: unitsEvaluated === unitsTotal y status "success"',
  sOk.unitsEvaluated === sOk.unitsTotal && sOk.status === 'success');

// Cobertura parcial: SAL_BASE mapeado y limpio, A_CTA_FUT_AUMEN no — no debe
// forzar 'error' completo.
const mappingParcial = {
  brutos: { legajoColumn: 'Legajo', salBaseColumn: 'SAL_BASE', aCuFutAumenColumn: '' },
  tab: { empleadoColumn: 'Legajo', tabSalBaseColumn: 'SAL_BASE_TAB', tabACuFutAumenColumn: 'ACFA_TAB' },
};
const rParcial = runBrutos(
  [{ Legajo: '1', SAL_BASE: '850000', A_CTA_FUT_AUMEN: '999' }],
  [{ Legajo: '1', SAL_BASE_TAB: '850000', ACFA_TAB: '999' }],
  mappingParcial
);
const sParcial = summarizeBrutos(rParcial);
assert('cobertura parcial: unitsEvaluated > 0 (SAL_BASE sí se comparó)', sParcial.unitsEvaluated > 0);
assert('cobertura parcial: NO fuerza error completo', sParcial.status !== 'error');

// ── 3. Generar Reporte usa el contrato compartido (Paso 4a) ─────────────────

const mappingReporte = {
  tab: {
    empleadoColumn: 'Legajo',
    tabSalBaseColumn: 'SAL_BASE_TAB',
    // tabACuFutAumenColumn y el resto quedan sin mapear a propósito.
  },
  period: '2026-04',
};
const tabReporte = [
  { Legajo: '1', SAL_BASE_TAB: '850000' },
  { Legajo: '2', SAL_BASE_TAB: '920000' },
];
const rRep = runBrutosReporte(null, tabReporte, mappingReporte);

assert('Generar Reporte: una fila por legajo', rRep.rows.length === 2);
assert('Generar Reporte: summarizeBrutosReporte no tira semáforo (no hay 2ª fuente)',
  summarizeBrutosReporte(rRep).unit === null);

const contract = EXPORT_CONTRACTS.brutos_reporte;
assert('el contrato de Brutos Reporte tiene 11 columnas',
  contract.columns.length === 11);
assert('cada row de runBrutosReporte tiene TODAS las keys del contrato, aunque no estén mapeadas',
  rRep.rows.every(r => contract.columns.every(c => c.key in r)));
assert('la columna aCuFutAumen (no mapeada en este ejemplo) queda null, no desaparece',
  rRep.rows.every(r => r.aCuFutAumen === null));
assert('la columna salBase (sí mapeada) trae el dato real',
  rRep.rows.find(r => r.legajo === '1').salBase === 850000);

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
