// variacionesControl.test.js — Test de los controles "Variación Sueldos" y "Variación Conceptos"
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/variacionesControl.test.js
//
// Cubre las reglas de specs/reporte-variaciones-opmobility.md: el parseo del
// Tabulado que llega como HTML disfrazado de .xls, la comparación entre dos
// períodos, la consolidación por legajo y las ramas de error.
//
// Datos 100% inventados (legajos '1'/'2'/'3', apellidos Perez/Gomez/Lopez).

globalThis.document = { addEventListener: () => {} };

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const {
  runVariacionesSueldos,
  runVariacionesConceptos,
  summarizeVariacionesSueldos,
} = await import('./js/controls/variaciones.js');
const {
  isHtmlTabulado,
  parseHtmlTabulado,
  htmlTabuladoToObjects,
  extraerMetadata,
} = await import('./js/parsers/tabuladoHtml.js');
const { autoDetectTabMapping } = await import('./js/parsers/tabuladoControl.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── Registry ─────────────────────────────────────────────────────────────────

const sueldos   = CONTROL_REGISTRY.variaciones_sueldos;
const conceptos = CONTROL_REGISTRY.variaciones_conceptos;

assert('el registry tiene la entrada "variaciones_sueldos"', sueldos !== undefined);
assert('el registry tiene la entrada "variaciones_conceptos"', conceptos !== undefined);
assert('los dos usan el Tabulado como pivote (tabRequired)',
  sueldos.tabRequired === true && conceptos.tabRequired === true);
assert('additionalFiles[0] es el Tabulado del período anterior',
  sueldos.additionalFiles[0].key === 'tab_prev' && sueldos.additionalFiles[0].fileType === 'tab_prev_file');
assert('el Tabulado anterior es opcional (se puede reusar la corrida del mes anterior)',
  sueldos.additionalFiles[0].optional === true);
assert('el scope es de cliente, solo POF',
  sueldos.scope === 'cliente' && sueldos.scopeMeta.clients.length === 1 && sueldos.scopeMeta.clients[0] === 'POF');
assert('los dos comparten el mismo group.id', sueldos.group.id === conceptos.group.id);
assert('los dos tienen help con what y how',
  typeof sueldos.help?.what === 'string' && Array.isArray(conceptos.help?.how));

// ── Parser del Tabulado HTML ─────────────────────────────────────────────────

// Reproduce la forma real del export: <span> de encabezado con EA/Periodo/Tipo,
// fila TOTAL GENERAL con colspan=3 (2 celdas menos que las de empleado), fila de
// <th> con "CÓDIGO - Nombre" y una segunda fila de <th> con "Imp" repetido.
function tabuladoHtmlDemo({ periodo = '03/2025', conceptos: cols = ['899999 - BASE de Escala', '2517 - Premio de progreso'], filas = [] } = {}) {
  const th1 = `<tr class='rowConcepto'><th rowspan='2'>Legajo</th><th rowspan='2'>Apellido y Nombre</th>`
    + `<th rowspan='2'>CUIL</th><th colspan='1'>Bruto</th>`
    + cols.map(c => `<th colspan='1'>${c}</th>`).join('')
    + `</tr>`;
  const th2 = `<tr class='rowConcepto'>` + cols.map(() => '<th>Imp</th>').join('') + `</tr>`;
  // TOTAL GENERAL: colspan=3 fusiona Legajo+Nombre+CUIL → 2 celdas menos.
  const total = `<tr><td colspan='3'>TOTAL GENERAL</td><td>&nbsp;</td>`
    + cols.map((_, i) => `<td>${filas.reduce((s, f) => s + (f.valores[i] || 0), 0).toFixed(2).replace('.', ',')}</td>`).join('')
    + `</tr>`;
  const cuerpo = filas.map(f =>
    `<tr><td>${f.legajo}</td><td>${f.nombre}</td><td>20-1234-5</td><td>1.000,00</td>`
    + f.valores.map(v => `<td>${v === null ? '&nbsp;' : v.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>`).join('')
    + `</tr>`
  ).join('');

  return `<span style='font-family:Arial,color:#333'>EA: Empresa Demo S.A. | Usuario: test | `
    + `Periodo: ${periodo} - ${periodo} | Tipo: 2da Quincena c/ sobregiro | LSD: Todos | </span>\n`
    + `<table border='1'>${total}${th1}${th2}${cuerpo}</table>`;
}

function aBuffer(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes.buffer;
}

const htmlDemo = tabuladoHtmlDemo({
  filas: [
    { legajo: '1', nombre: 'PEREZ JUAN',  valores: [1000, 5000] },
    { legajo: '2', nombre: 'GOMEZ ANA',   valores: [2000, 7000] },
  ],
});
const bufDemo = aBuffer(htmlDemo);

assert('isHtmlTabulado reconoce el .xls que es HTML', isHtmlTabulado(bufDemo) === true);
assert('isHtmlTabulado NO marca un archivo binario cualquiera',
  isHtmlTabulado(aBuffer('PKbinario')) === false);

const parsed = parseHtmlTabulado(bufDemo);
assert('los headers se cortan en el ancho real de los datos (sin la fila de "Imp")',
  parsed.headers.length === 6 && !parsed.headers.includes('Imp'));
assert('el primer header es Legajo', parsed.headers[0] === 'Legajo');
assert('el header de concepto conserva "CÓDIGO - Nombre"',
  parsed.headers[4] === '899999 - BASE de Escala');
assert('se leen las 2 filas de empleado y no la de TOTAL GENERAL', parsed.rows.length === 2);
assert('la fila TOTAL GENERAL se devuelve aparte', parsed.totalRow !== null);
assert('TOTAL GENERAL no se usa como fila de datos',
  parsed.rows.every(r => !/TOTAL/i.test(r[0])));

const meta = extraerMetadata(htmlDemo);
assert('la metadata saca la razón social del encabezado', meta.empresa === 'Empresa Demo S.A.');
assert('la metadata saca el período en formato AAAA-MM', meta.period === '2025-03');
assert('la metadata saca la quincena', meta.quincena === 2);

const objs = htmlTabuladoToObjects(parsed);
assert('las filas se convierten a objetos con clave = nombre de columna',
  objs[0]['Legajo'] === '1' && objs[0]['Apellido y Nombre'] === 'PEREZ JUAN');
assert('los importes quedan como texto es-AR para que los parsee el control',
  objs[0]['899999 - BASE de Escala'] === '1.000,00');

assert('autoDetectTabMapping reconoce "Legajo" además de "EMPLEADO"',
  autoDetectTabMapping(parsed.headers)?.empleadoColumn === 'Legajo');
assert('autoDetectTabMapping sigue reconociendo el Tabulado de Meta4',
  autoDetectTabMapping(['EMPLEADO', 'APELLIDO Y NOMBRE', 'PUESTO'])?.empleadoColumn === 'EMPLEADO');
assert('autoDetectTabMapping devuelve null si no hay columna de empleado',
  autoDetectTabMapping(['FOO', 'BAR']) === null);

// ── Helpers para armar filas ya parseadas ────────────────────────────────────

const C899 = '899999 - BASE de Escala para Reporte Variaciones';
const C1000 = '1000 - Sueldo mensual';
const C2517 = '2517 - Premio de progreso';
const C2519 = '2519 - Premio productividad';

const fila = (legajo, nombre, valores) => ({
  'Legajo': legajo,
  'Apellido y Nombre': nombre,
  ...valores,
});

const MAP = { tab: { empleadoColumn: 'Legajo', apellidoNombreColumn: 'Apellido y Nombre' }, period: '2025-04' };
const conPrev = (rows, period = '2025-03') => ({ ...MAP, variacionesPrev: { period, rows } });

// ── run(): sin diferencias ───────────────────────────────────────────────────

const iguales = [
  fila('1', 'PEREZ JUAN', { [C899]: '5.000,00' }),
  fila('2', 'GOMEZ ANA',  { [C899]: '6.000,00' }),
];
const rSinDif = runVariacionesSueldos([], iguales, conPrev(iguales));
assert('run() sin diferencias no devuelve error', !rSinDif.error);
assert('run() sin diferencias: status success', summarizeVariacionesSueldos(rSinDif).status === 'success');
assert('run() sin diferencias: unitsWithDiff en 0', summarizeVariacionesSueldos(rSinDif).unitsWithDiff === 0);
assert('el período anterior sale de la corrida guardada', rSinDif.prevOrigen === 'corrida-anterior');
assert('guarda los dos períodos comparados',
  rSinDif.periodAnterior === '2025-03' && rSinDif.period === '2025-04');

// ── run(): una diferencia conocida ───────────────────────────────────────────

const actual = [
  fila('1', 'PEREZ JUAN', { [C899]: '5.500,00' }),   // +500
  fila('2', 'GOMEZ ANA',  { [C899]: '6.000,00' }),   // igual
];
const rDif = runVariacionesSueldos([], actual, conPrev(iguales));
const sDif = summarizeVariacionesSueldos(rDif);
assert('detecta la diferencia de un empleado', sDif.status === 'warning' && sDif.unitsWithDiff === 1);
const f1 = rDif.rows.find(r => r.legajo === '1');
assert('la variación $ es actual − anterior', Math.abs(f1.valores.total.diff - 500) < 0.01);
assert('la variación % se calcula sobre el período anterior',
  Math.abs(f1.valores.total.pct - 10) < 0.01);
assert('el empleado sin cambios queda en 0,00',
  Math.abs(rDif.rows.find(r => r.legajo === '2').valores.total.diff) < 0.01);

// ── Sueldos: 899999 + 1000 se suman en una sola columna ──────────────────────

const prevMixto = [
  fila('1', 'PEREZ JUAN', { [C899]: '5.000,00' }),                    // jornalizado
  fila('2', 'GOMEZ ANA',  { [C1000]: '8.000,00' }),                   // mensualizado
];
const actMixto = [
  fila('1', 'PEREZ JUAN', { [C899]: '5.000,00' }),
  fila('2', 'GOMEZ ANA',  { [C1000]: '9.000,00' }),
];
const rMixto = runVariacionesSueldos([], actMixto, conPrev(prevMixto));
assert('Sueldos suma 899999 y 1000 en la misma columna',
  Math.abs(rMixto.rows.find(r => r.legajo === '2').valores.total.diff - 1000) < 0.01);
assert('el empleado que liquida por el otro concepto no se ve afectado',
  Math.abs(rMixto.rows.find(r => r.legajo === '1').valores.total.diff) < 0.01);

// ── Consolidación por legajo (regression test) ────────────────────────────────

// El legajo '1' tiene DOS liquidaciones en el período actual: 3.000 + 2.500 = 5.500.
// Si no se consolidara, se compararía solo una de las dos y daría una diferencia falsa.
const actualDosLiq = [
  fila('1', 'PEREZ JUAN', { [C899]: '3.000,00' }),
  fila('1', 'PEREZ JUAN', { [C899]: '2.500,00' }),
  fila('2', 'GOMEZ ANA',  { [C899]: '6.000,00' }),
];
const rConsol = runVariacionesSueldos([], actualDosLiq, conPrev([
  fila('1', 'PEREZ JUAN', { [C899]: '5.500,00' }),
  fila('2', 'GOMEZ ANA',  { [C899]: '6.000,00' }),
]));
assert('un legajo con dos liquidaciones se SUMA, no se duplica ni se pisa',
  rConsol.rows.length === 2);
assert('el legajo con dos liquidaciones no genera diferencia falsa',
  Math.abs(rConsol.rows.find(r => r.legajo === '1').valores.total.diff) < 0.01);
assert('sin diferencias tras consolidar: status success',
  summarizeVariacionesSueldos(rConsol).status === 'success');

// ── Legajo presente en un solo período ───────────────────────────────────────

const rAltaBaja = runVariacionesSueldos([], [
  fila('1', 'PEREZ JUAN', { [C899]: '5.000,00' }),
  fila('3', 'LOPEZ LUIS', { [C899]: '4.000,00' }),   // alta del mes
], conPrev([
  fila('1', 'PEREZ JUAN', { [C899]: '5.000,00' }),
  fila('2', 'GOMEZ ANA',  { [C899]: '6.000,00' }),   // baja del mes
]));
assert('los legajos de los dos períodos entran en el reporte', rAltaBaja.rows.length === 3);
const alta = rAltaBaja.rows.find(r => r.legajo === '3');
assert('el alta del mes: anterior en 0 y presenteAnterior false',
  alta.presenteAnterior === false && alta.valores.total.anterior === null);
assert('el alta del mes no tiene variación % (sin base) → null', alta.valores.total.pct === null);
const baja = rAltaBaja.rows.find(r => r.legajo === '2');
assert('la baja del mes queda con actual en 0 y variación negativa',
  baja.presenteActual === false && Math.abs(baja.valores.total.diff + 6000) < 0.01);
assert('la baja del mes da -100%', Math.abs(baja.valores.total.pct + 100) < 0.01);

// ── Conceptos: una sección por concepto ──────────────────────────────────────

const rConceptos = runVariacionesConceptos([], [
  fila('1', 'PEREZ JUAN', { [C2517]: '5.000,00', [C2519]: '1.000,00' }),
], conPrev([
  fila('1', 'PEREZ JUAN', { [C2517]: '4.000,00', [C2519]: '1.000,00' }),
]));
assert('Variación Conceptos arma un grupo por concepto', rConceptos.grupos.length === 2);
assert('los grupos son 2517 y 2519',
  rConceptos.grupos.map(g => g.key).join(',') === '2517,2519');
assert('usa el nombre del concepto tal como figura en el Tabulado',
  rConceptos.grupos[0].nombreReal === C2517);
assert('2517 varió +1.000', Math.abs(rConceptos.rows[0].valores['2517'].diff - 1000) < 0.01);
assert('2519 no varió', Math.abs(rConceptos.rows[0].valores['2519'].diff) < 0.01);

// ── Concepto que no se liquidó en un período ──────────────────────────────────

const rFaltante = runVariacionesConceptos([], [
  fila('1', 'PEREZ JUAN', { [C2517]: '5.000,00' }),        // sin 2519 este mes
], conPrev([
  fila('1', 'PEREZ JUAN', { [C2517]: '5.000,00', [C2519]: '2.000,00' }),
]));
assert('un concepto no liquidado no es error', !rFaltante.error);
assert('el concepto ausente se reporta como faltante',
  rFaltante.faltantes.some(f => f.codigo === '2519' && f.enAct === false));
assert('el concepto ausente se computa en 0 y da variación negativa',
  Math.abs(rFaltante.rows[0].valores['2519'].diff + 2000) < 0.01);

// ── Detección de escalón, causas de ausencia y variación de Bruto ────────────
// Reproduce el hallazgo real de OPmobility: el premio de progreso no es un
// importe libre, es uno de un puñado de valores fijos (acá 0/5.000/7.000/10.000
// en vez de los 0/50%/70%/100% reales) — y una baja de escalón se puede
// explicar si el legajo tiene una licencia cargada ese mismo período.

const C1530 = '1530 - Lic. Enfermedad';

const prevEscala = [
  fila('1', 'PEREZ JUAN',   { [C2517]: '10.000,00', Bruto: '50.000,00' }),
  fila('2', 'GOMEZ ANA',    { [C2517]: '10.000,00', Bruto: '50.000,00' }),
  fila('3', 'LOPEZ LUIS',   { [C2517]: '10.000,00', Bruto: '50.000,00' }),
  fila('4', 'DIAZ MARIA',   { [C2517]: '5.000,00',  Bruto: '30.000,00' }),
  fila('5', 'RUIZ PEDRO',   { [C2517]: '0,00',      Bruto: '20.000,00' }),
  fila('6', 'TORRES SARA',  { [C2517]: '7.000,00',  Bruto: '40.000,00' }),
];
const actEscala = [
  fila('1', 'PEREZ JUAN',   { [C2517]: '10.000,00', Bruto: '50.000,00' }),                      // sin cambio (100%)
  fila('2', 'GOMEZ ANA',    { [C2517]: '7.000,00',  Bruto: '45.000,00' }),                       // bajó 100→70, sin causa
  fila('3', 'LOPEZ LUIS',   { [C2517]: '0,00', [C1530]: '5.000,00', Bruto: '35.000,00' }),       // bajó 100→0, con licencia
  fila('4', 'DIAZ MARIA',   { [C2517]: '5.000,00',  Bruto: '30.000,00' }),                       // sin cambio (50%)
  fila('5', 'RUIZ PEDRO',   { [C2517]: '0,00',      Bruto: '20.000,00' }),                       // sin cambio (0%)
  fila('6', 'TORRES SARA',  { [C2517]: '10.000,00', Bruto: '43.000,00' }),                       // subió 70→100
];
const rEscala = runVariacionesConceptos([], actEscala, conPrev(prevEscala));
const g2517 = rEscala.grupos.find(g => g.key === '2517');
assert('detecta la escala 0/5.000/7.000/10.000 en el concepto 2517',
  JSON.stringify(g2517.escala) === JSON.stringify([0, 5000, 7000, 10000]));

const leg2 = rEscala.rows.find(r => r.legajo === '2').valores['2517'];
assert('leg. 2: escalón 100% → 70%', leg2.escalonAnterior === 100 && leg2.escalonActual === 70);
assert('leg. 2 no tiene licencia cargada en el período actual',
  rEscala.rows.find(r => r.legajo === '2').ausenciaActual === 0);

const leg3 = rEscala.rows.find(r => r.legajo === '3').valores['2517'];
assert('leg. 3: escalón 100% → 0%', leg3.escalonAnterior === 100 && leg3.escalonActual === 0);
assert('leg. 3 tiene licencia cargada en el período actual: la baja se explica sola',
  rEscala.rows.find(r => r.legajo === '3').ausenciaActual === 5000);

const leg6 = rEscala.rows.find(r => r.legajo === '6').valores['2517'];
assert('leg. 6: escalón 70% → 100% (subió)', leg6.escalonAnterior === 70 && leg6.escalonActual === 100);

const g2519sinescala = rEscala.grupos.find(g => g.key === '2519');
assert('2519 no tiene suficientes datos para escala: queda en null', g2519sinescala.escala === null);

assert('la columna de Sueldos (suma de dos conceptos) nunca detecta escala',
  runVariacionesSueldos([], actEscala, conPrev(prevEscala)).grupos[0].escala === undefined
  || runVariacionesSueldos([], actEscala, conPrev(prevEscala)).grupos[0].escala === null);

// El Tabulado real no trae "0,00" explícito para un concepto no liquidado: la
// celda viene vacía y el parser la deja en null. Un legajo presente ese período
// sin ese concepto liquidó 0 del escalón — pero un alta/baja (no presente) no.
const prevNull = [
  ...prevEscala,
  fila('7', 'AGUIRRE OMAR', {}),   // sin 2517 en ninguno de los dos: escalón 0 → 0, no es caso
];
const actNull = [
  ...actEscala,
  fila('7', 'AGUIRRE OMAR', {}),
  fila('8', 'PAZ CARLOS', { [C2517]: '10.000,00', Bruto: '50.000,00' }),   // alta del mes
];
const rNull = runVariacionesConceptos([], actNull, conPrev(prevNull));
const leg7 = rNull.rows.find(r => r.legajo === '7').valores['2517'];
assert('un legajo presente sin el concepto liquidado es escalón 0% en los dos períodos',
  leg7.escalonAnterior === 0 && leg7.escalonActual === 0);
const leg8 = rNull.rows.find(r => r.legajo === '8').valores['2517'];
assert('el alta del mes no tiene escalón anterior (no estaba en el Tabulado, no es "0%") — '
  + 'así "casosDeEscalon" nunca lo toma como una baja de escalón',
  leg8.escalonAnterior === null && leg8.escalonActual === 100);

assert('el Bruto total se suma de la columna "Bruto" del Tabulado',
  Math.abs(rEscala.bruto.anterior - 240000) < 0.01 && Math.abs(rEscala.bruto.actual - 223000) < 0.01);
assert('la variación de Bruto es negativa (cayó)', rEscala.bruto.diff < 0);

// ── Ramas de error ───────────────────────────────────────────────────────────

assert('run() sin Tabulado actual devuelve error',
  typeof runVariacionesSueldos([], [], conPrev(iguales)).error === 'string');
assert('run() sin período anterior (ni archivo ni corrida) devuelve error',
  typeof runVariacionesSueldos([], iguales, { ...MAP }).error === 'string');
assert('run() con el mismo período en los dos lados devuelve error',
  typeof runVariacionesSueldos([], iguales, conPrev(iguales, '2025-04')).error === 'string');
assert('summarize() de un error no rompe y da status error',
  summarizeVariacionesSueldos(runVariacionesSueldos([], iguales, { ...MAP })).status === 'error');

const rSinLegajo = runVariacionesSueldos([], [{ Foo: 'x' }], conPrev(iguales));
assert('run() sin columna de legajo identificable devuelve error',
  typeof rSinLegajo.error === 'string');

// ── El archivo subido tiene prioridad sobre la corrida guardada ───────────────

const rArchivo = runVariacionesSueldos(iguales, actual, {
  ...conPrev([fila('1', 'PEREZ JUAN', { [C899]: '9.999,00' })]),
  variacionesPrevFilePeriod: '2025-03',
});
assert('si se sube el Tabulado anterior, se usa ese y no el guardado',
  rArchivo.prevOrigen === 'archivo'
  && Math.abs(rArchivo.rows.find(r => r.legajo === '1').valores.total.diff - 500) < 0.01);

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
