// asientoPianoControl.test.js — Núcleo de la Desglosada + Asiento de Piano (Axton)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/asientoPianoControl.test.js
//
// Datos 100% inventados: legajos '1'/'2'/'3'/'007'/'7'/'39', nombres de la lista
// de Banfield, códigos de concepto que no son de ningún cliente.
//
// Lo que fija, en orden de qué cuesta más caro si se rompe:
//   1. **Un legajo con dos liquidaciones SUMA, no pisa** — y '007' y '7' son el
//      mismo empleado con la clave por defecto (D-038/D-042).
//   2. El neteo DEBE − HABER por legajo + cuenta: provisión y reversión se
//      compensan, un neto negativo cambia de lado, un neto 0 sale como 0/0.
//   3. Un concepto sin imputación NO se manda a una cuenta inventada.
//   4. Pasivo sin función/depto, resultado con sus códigos, C COSTO con ceros.
//   5. Cuadre con tolerancia estructural y el descuadre exacto.
//   6. El plan de cuentas: fuera del plan y no usadas.

const {
  buildDesglosadaLines, buildAsiento, checkPlanDeCuentas, cCostoOf,
  PLAN_CUENTAS_SEED, LIABILITY_ACCOUNTS_SEED, FUNCION_CODES_SEED, DEPTO_CODES_SEED,
  LADO_DEBE, LADO_HABER,
} = await import('./js/controls/asientoPiano.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── Datos de prueba ──────────────────────────────────────────────────────────

/** Una fila del Tabulado de Axton como la devuelve el lector. */
function fila(legajo, nombre, imps, { funcion = 'Sales', depto = 'Pre-Sales', liq = 'Mensual' } = {}) {
  const row = { legajo, apellido_nombre: nombre, funcion, depto, liquidacion: liq };
  for (const [codigo, v] of Object.entries(imps)) row[`imp_${codigo}`] = v;
  return row;
}

const IMPUTACION = [
  { codigo: '1000', cuentaDebe: '521100', cuentaHaber: '213100' },   // sueldo
  { codigo: '2000', cuentaDebe: '521118', cuentaHaber: '213120' },   // provisión vacaciones
  { codigo: '2001', cuentaDebe: '213120', cuentaHaber: '521118' },   // reversión provisión
  { codigo: '3000', cuentaDebe: '213100', cuentaHaber: '214702' },   // retención Ganancias
];

const CFG = { legajoCol: 'legajo', imputacion: IMPUTACION, funcionCol: 'funcion', deptoCol: 'depto' };

const find = (rows, legajo, cuenta) => rows.filter(r => r.legajo === legajo && r.cuenta === cuenta);

// ── 1. Dos liquidaciones suman, no pisan ─────────────────────────────────────
{
  const tab = [
    fila('1', 'SANGUINETTI JAVIER', { 1000: 1000 }, { liq: 'Mensual' }),
    fila('1', 'SANGUINETTI JAVIER', { 1000: '500,50' }, { liq: 'Vacaciones', funcion: 'Finance', depto: 'Finance' }),
  ];
  const { lines, warnings } = buildDesglosadaLines(tab, CFG);
  assert('dos liquidaciones × (DEBE + HABER) = 4 líneas', lines.length === 4);
  assert('las líneas conservan su liquidación', lines.filter(l => l.liquidacion === 'Vacaciones').length === 2);
  assert('el importe es-AR se lee con toNum', lines.some(l => l.importe === 500.5));
  assert('sin avisos con todo imputado y con función/depto', warnings.length === 0);
  assert('función/depto salen de la ÚLTIMA liquidación',
    lines.every(l => l.funcion === 'Finance' && l.depto === 'Finance'));

  const a = buildAsiento(lines, {});
  const r521 = find(a.rows, '1', '521100');
  const r213 = find(a.rows, '1', '213100');
  assert('una sola fila por legajo + cuenta', r521.length === 1 && r213.length === 1);
  assert('521100 suma las dos liquidaciones al DEBE (1500,50)', r521[0].debe === 1500.5 && r521[0].haber === 0);
  assert('213100 suma las dos al HABER (1500,50)', r213[0].haber === 1500.5 && r213[0].debe === 0);
  assert('resultado con códigos de función/depto (Finance 73 / Finance 15)',
    r521[0].idFuncion === '73' && r521[0].nombreFuncion === 'Finance'
    && r521[0].idDepto === '15' && r521[0].nombreDepto === 'Finance');
  assert('pasivo con "00" / "Desconocido" / depto vacío',
    r213[0].idFuncion === '00' && r213[0].nombreFuncion === 'Desconocido'
    && r213[0].idDepto === '' && r213[0].nombreDepto === '');
  assert('nombre de cuenta del plan semilla', r521[0].nombreCuenta === 'Remuneraciones');
  assert('cuadra', a.cuadra === true && a.descuadre === 0 && a.totalDebe === 1500.5 && a.totalHaber === 1500.5);
}

// ── 2. '007' y '7' son el mismo empleado ─────────────────────────────────────
{
  const tab = [
    fila('007', 'FALCIONI JULIO CESAR', { 1000: 300 }),
    fila('7', 'FALCIONI JULIO CESAR', { 1000: 200 }, { liq: 'SAC' }),
  ];
  const { lines } = buildDesglosadaLines(tab, CFG);
  assert('las líneas llevan la clave del cliente ("7")', lines.every(l => l.legajo === '7'));
  const a = buildAsiento(lines, {});
  assert('una sola fila de asiento por cuenta para 007/7',
    a.rows.length === 2 && find(a.rows, '7', '521100').length === 1);
  assert('…con el total sumado (500)', find(a.rows, '7', '521100')[0].debe === 500);
  assert('C COSTO "0007"', find(a.rows, '7', '521100')[0].cCosto === '0007');

  const trim = buildDesglosadaLines(tab, { ...CFG, legajoKeyMode: 'trim' });
  const aTrim = buildAsiento(trim.lines, {});
  assert('con legajoKeyMode "trim" son dos empleados (4 filas)', aTrim.rows.length === 4);
}

// ── 3. Provisión y reversión del mismo empleado se netean ────────────────────
{
  const tab = [
    fila('2', 'FALCIONI JULIO CESAR', { 2000: 800 }),
    fila('2', 'FALCIONI JULIO CESAR', { 2001: 300 }, { liq: 'Ajuste' }),
  ];
  const { lines } = buildDesglosadaLines(tab, CFG);
  assert('provisión + reversión = 4 líneas en la desglosada', lines.length === 4);
  assert('provisión: 213120 HABER / 521118 DEBE',
    lines.some(l => l.codigo === '2000' && l.cuenta === '213120' && l.lado === LADO_HABER)
    && lines.some(l => l.codigo === '2000' && l.cuenta === '521118' && l.lado === LADO_DEBE));
  assert('reversión: 213120 DEBE / 521118 HABER',
    lines.some(l => l.codigo === '2001' && l.cuenta === '213120' && l.lado === LADO_DEBE)
    && lines.some(l => l.codigo === '2001' && l.cuenta === '521118' && l.lado === LADO_HABER));
  const a = buildAsiento(lines, {});
  const r521118 = find(a.rows, '2', '521118');
  const r213120 = find(a.rows, '2', '213120');
  assert('521118 neteado: DEBE 500 (800 − 300)', r521118.length === 1 && r521118[0].debe === 500 && r521118[0].haber === 0);
  assert('213120 neteado: HABER 500 (800 − 300)', r213120.length === 1 && r213120[0].haber === 500 && r213120[0].debe === 0);
}

// ── 4. Neto negativo en resultado → HABER; Ganancias negativa → DEBE 214702 ──
{
  const tab = [
    fila('3', 'ALBELLA GUSTAVO', { 1000: -250, 3000: -120 }),
  ];
  const { lines } = buildDesglosadaLines(tab, CFG);
  assert('el importe negativo se mantiene con su signo en la desglosada',
    lines.filter(l => l.codigo === '1000').every(l => l.importe === -250)
    && lines.filter(l => l.codigo === '3000').every(l => l.importe === -120));
  const a = buildAsiento(lines, {});
  const r521 = find(a.rows, '3', '521100')[0];
  assert('521100 con neto negativo sale al HABER (250)', r521.haber === 250 && r521.debe === 0);
  const r214 = find(a.rows, '3', '214702')[0];
  assert('retención de Ganancias negativa sale al DEBE de 214702 (120)', r214.debe === 120 && r214.haber === 0);
  const r213 = find(a.rows, '3', '213100')[0];
  assert('213100: −(−250) al DEBE y −120 al DEBE neteado → DEBE 130',
    r213.debe === 130 && r213.haber === 0);
  assert('cuadra con negativos', a.cuadra === true && a.totalDebe === 250 && a.totalHaber === 250);
}

// ── 5. Neto 0 se emite como 0/0 ──────────────────────────────────────────────
{
  const tab = [
    fila('1', 'SANGUINETTI JAVIER', { 2000: 400 }),
    fila('1', 'SANGUINETTI JAVIER', { 2001: 400 }, { liq: 'Ajuste' }),
  ];
  const a = buildAsiento(buildDesglosadaLines(tab, CFG).lines, {});
  const r = find(a.rows, '1', '521118');
  assert('neto 0 → la fila se emite', r.length === 1);
  assert('…con DEBE 0 y HABER 0 (sin -0)', r[0].debe === 0 && r[0].haber === 0 && !Object.is(r[0].haber, -0));
  assert('el pasivo también sale 0/0', find(a.rows, '1', '213120')[0].debe === 0);
}

// ── 6. C COSTO con ceros ─────────────────────────────────────────────────────
assert("C COSTO: '39' → '0039'", cCostoOf('39') === '0039');
assert("C COSTO: '12345' queda igual", cCostoOf('12345') === '12345');
assert("C COSTO: no numérico tal cual ('12-B')", cCostoOf('12-B') === '12-B');
{
  const a = buildAsiento(buildDesglosadaLines([fila('39', 'ALBELLA GUSTAVO', { 1000: 10 })], CFG).lines, {});
  assert("el asiento escribe '0039' para el legajo 39", a.rows.every(r => r.cCosto === '0039'));
}

// ── 7. Función/depto sin código y sin dato ───────────────────────────────────
{
  const tab = [fila('1', 'SANGUINETTI JAVIER', { 1000: 10 }, { funcion: 'Marketing', depto: '' })];
  const d = buildDesglosadaLines(tab, CFG);
  const w = d.warnings.find(x => x.type === 'sin_funcion_depto');
  assert('depto vacío → null y aviso por legajo', d.lines[0].depto === null && w && w.legajo === '1'
    && w.campos.length === 1 && w.campos[0] === 'depto');
  const a = buildAsiento(d.lines, {});
  const r = find(a.rows, '1', '521100')[0];
  assert('función sin código → id null, nombre se conserva', r.idFuncion === null && r.nombreFuncion === 'Marketing');
  assert('…y se puede avisar', a.warnings.some(x => x.type === 'funcion_sin_codigo' && x.nombre === 'Marketing'));
  assert('depto null → id null en resultado', r.idDepto === null && r.nombreDepto === null);

  const sinCols = buildDesglosadaLines(tab, { legajoCol: 'legajo', imputacion: IMPUTACION });
  const w2 = sinCols.warnings.find(x => x.type === 'sin_funcion_depto');
  assert('sin columnas configuradas → función y depto null con aviso',
    sinCols.lines.every(l => l.funcion === null && l.depto === null) && w2.campos.join() === 'funcion,depto');
}

// ── 8. Concepto sin imputación → aviso, ninguna línea inventada ──────────────
{
  const tab = [
    fila('1', 'SANGUINETTI JAVIER', { 1000: 100, 9999: 70, 8888: 0, 7777: null }),
    fila('2', 'FALCIONI JULIO CESAR', { 9999: '30,25' }),
  ];
  const { lines, warnings } = buildDesglosadaLines(tab, CFG);
  assert('ninguna línea del concepto sin imputación', lines.every(l => l.codigo !== '9999'));
  assert('sólo las 2 líneas del concepto imputado', lines.length === 2);
  const w = warnings.find(x => x.type === 'sin_imputacion' && x.codigo === '9999');
  assert('aviso con código, 2 legajos e importe total 100,25', w && w.legajos === 2 && w.importe === 100.25);
  assert('importe 0 y null no generan aviso ni línea',
    !warnings.some(x => x.codigo === '8888' || x.codigo === '7777'));

  const vacia = buildDesglosadaLines(tab, { ...CFG, imputacion: [...IMPUTACION, { codigo: '9999' }] });
  assert('una imputación sin ninguna cuenta cuenta como sin imputación',
    vacia.warnings.some(x => x.type === 'sin_imputacion' && x.codigo === '9999'));

  const dup = buildDesglosadaLines(tab, { ...CFG, imputacion: [...IMPUTACION, { codigo: '1000', cuentaDebe: '521142' }] });
  assert('código imputado dos veces → aviso y gana el primero',
    dup.warnings.some(x => x.type === 'imputacion_duplicada' && x.codigo === '1000')
    && dup.lines.every(l => l.cuenta !== '521142'));

  const colDup = buildDesglosadaLines([{ legajo: '1', funcion: 'Sales', depto: 'Pre-Sales', imp_1000: 5, imp_1000__2: 7 }], CFG);
  assert('una columna duplicada (imp_1000__2) se imputa con el código base',
    colDup.lines.filter(l => l.codigo === '1000').length === 4);
}

// ── 9. Cuadre y descuadre ────────────────────────────────────────────────────
{
  const lines = [
    { legajo: '1', cuenta: '521100', lado: LADO_DEBE, importe: 1000, funcion: 'Sales', depto: 'Pre-Sales' },
    { legajo: '1', cuenta: '213100', lado: LADO_HABER, importe: 1000, funcion: 'Sales', depto: 'Pre-Sales' },
    { legajo: '2', cuenta: '521101', lado: LADO_DEBE, importe: 333.33, funcion: 'G&A', depto: 'Human Resources' },
    { legajo: '2', cuenta: '213200', lado: LADO_HABER, importe: 333.33, funcion: 'G&A', depto: 'Human Resources' },
  ];
  const ok1 = buildAsiento(lines, {});
  assert('asiento que cuadra', ok1.cuadra === true && ok1.descuadre === 0 && ok1.totalDebe === 1333.33);
  assert('G&A → 69, Human Resources → 13',
    find(ok1.rows, '2', '521101')[0].idFuncion === '69' && find(ok1.rows, '2', '521101')[0].idDepto === '13');
  assert('orden por cuenta y después por C COSTO',
    ok1.rows.map(r => r.cuenta).join() === '213100,213200,521100,521101');

  const roto = buildAsiento([
    ...lines,
    { legajo: '3', cuenta: '521142', lado: LADO_DEBE, importe: 12.34, funcion: 'Sales', depto: 'Pre-Sales' },
  ], {});
  assert('asiento que no cuadra', roto.cuadra === false);
  assert('descuadre exacto 12,34', roto.descuadre === 12.34 && roto.totalDebe === 1345.67 && roto.totalHaber === 1333.33);

  const centavo = buildAsiento([
    { legajo: '1', cuenta: '521100', lado: LADO_DEBE, importe: 100.01, funcion: 'Sales', depto: 'Pre-Sales' },
    { legajo: '1', cuenta: '213100', lado: LADO_HABER, importe: 100, funcion: 'Sales', depto: 'Pre-Sales' },
  ], {});
  assert('un centavo de redondeo cuadra (tolerancia estructural)', centavo.cuadra === true && centavo.descuadre === 0.01);

  const orden = buildAsiento([
    { legajo: '10', cuenta: '521100', lado: LADO_DEBE, importe: 1, funcion: 'Sales', depto: 'Pre-Sales' },
    { legajo: '2', cuenta: '521100', lado: LADO_DEBE, importe: 1, funcion: 'Sales', depto: 'Pre-Sales' },
  ], {});
  assert('dentro de la cuenta, por C COSTO (0002 antes que 0010)', orden.rows.map(r => r.cCosto).join() === '0002,0010');

  const conLiab = buildAsiento(lines, { liabilityAccounts: new Set(['213100']) });
  assert('liabilityAccounts como Set: 213200 deja de ser pasivo',
    find(conLiab.rows, '2', '213200')[0].idFuncion === '69');
}

// ── 10. Plan de cuentas ──────────────────────────────────────────────────────
{
  const rows = [{ cuenta: '521100' }, { cuenta: '213100' }, { cuenta: '999999' }, { cuenta: '521100' }];
  const plan = [
    { cuenta: '213100', nombre: 'Remuneraciones a Pagar' },
    { cuenta: '521100', nombre: 'Remuneraciones' },
    { cuenta: '521142', nombre: 'Bono' },
    { cuenta: '114109', nombre: 'Adelantos al Personal' },
  ];
  const r = checkPlanDeCuentas(rows, plan);
  assert('fuera del plan: 999999', r.fueraDelPlan.length === 1 && r.fueraDelPlan[0] === '999999');
  assert('no usadas: 521142 y 114109', r.noUsadas.join() === '521142,114109');
}

// ── 11. Semillas ─────────────────────────────────────────────────────────────
assert('plan semilla: 12 cuentas', PLAN_CUENTAS_SEED.length === 12);
assert('pasivos semilla', LIABILITY_ACCOUNTS_SEED.join() === '213100,213110,213120,213200,214702');
assert('pasivos semilla están en el plan',
  LIABILITY_ACCOUNTS_SEED.every(c => PLAN_CUENTAS_SEED.some(p => p.cuenta === c)));
assert('funciones semilla: 6', Object.keys(FUNCION_CODES_SEED).length === 6);
assert('departamentos semilla: 9', Object.keys(DEPTO_CODES_SEED).length === 9);

// ── 12. Errores ──────────────────────────────────────────────────────────────
{
  const r = buildDesglosadaLines([fila('1', 'SANGUINETTI JAVIER', { 1000: 1 })], { imputacion: IMPUTACION });
  assert('sin columna de legajo → error en español, ninguna línea', typeof r.error === 'string' && r.lines.length === 0);
  const vacio = buildAsiento([], {});
  assert('asiento vacío: 0/0 y cuadra', vacio.rows.length === 0 && vacio.cuadra === true);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
