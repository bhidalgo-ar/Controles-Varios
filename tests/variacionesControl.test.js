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

import * as XLSX from './node_modules/xlsx/xlsx.mjs';
globalThis.XLSX = XLSX;   // los parsers usan el global XLSX (como en browser)

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const {
  runVariacionesSueldos,
  runVariacionesConceptos,
  summarizeVariacionesSueldos,
  gruposParaImprimir,
} = await import('./js/controls/variaciones.js');
const {
  isHtmlTabulado,
  parseHtmlTabulado,
  htmlTabuladoToObjects,
  extraerMetadata,
} = await import('./js/parsers/tabuladoHtml.js');
const {
  autoDetectTabMapping,
  detectHeaders: detectHeadersTabulado,
  parseTabuladoControl,
} = await import('./js/parsers/tabuladoControl.js');
const { nombreCoincideConMetadata } = await import('./js/parsers/tabuladoHtml.js');

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
assert('el Tabulado anterior es obligatorio (se suben siempre los dos)',
  sueldos.additionalFiles[0].optional === false && conceptos.additionalFiles[0].optional === false);
assert('el Tabulado anterior se comparte entre los dos controles (shared)',
  sueldos.additionalFiles[0].shared === true && conceptos.additionalFiles[0].shared === true);
assert('el label del archivo ya no dice "opcional"',
  !/opcional/i.test(sueldos.additionalFiles[0].label));
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
assert('la metadata conserva el tipo de liquidación completo, con el sufijo',
  meta.tipoLiquidacion === '2da Quincena c/ sobregiro');

// Un tipo que la app no sabe clasificar igual se muestra tal cual: quincena null
// pero tipoLiquidacion con el texto del archivo.
const metaMensual = extraerMetadata(
  `<span>EA: Empresa Demo S.A. | Periodo: 03/2025 - 03/2025 | Tipo: Mensual | </span>`
);
assert('un tipo sin quincena no rompe y conserva el texto',
  metaMensual.quincena === null && metaMensual.tipoLiquidacion === 'Mensual');

assert('la fila de encabezados desalineada corta con un error explicativo',
  (() => {
    // 4 columnas de datos pero la fila de <th> trae 3 → antes salía sin avisar.
    const roto = `<span>EA: X | Periodo: 03/2025 - 03/2025 | </span>`
      + `<table><tr><th>Legajo</th><th>Apellido y Nombre</th><th>Bruto</th></tr>`
      + `<tr><td>1</td><td>PEREZ JUAN</td><td>1.000,00</td><td>2.000,00</td></tr>`
      + `<tr><td>2</td><td>GOMEZ ANA</td><td>1.000,00</td><td>2.000,00</td></tr></table>`;
    try { parseHtmlTabulado(aBuffer(roto)); return false; }
    catch (e) { return /4 columnas de datos pero la fila de encabezados trae 3/.test(e.message); }
  })());

assert('el "cascarón" de un Excel guardado como página web se explica',
  (() => {
    const cascaron = `<html><head><x:WorksheetSource HRef="Tab.files/sheet001.htm"/></head>`
      + `<frameset rows="*,39"><frame src="Tab.files/sheet001.htm"></frameset></html>`;
    try { parseHtmlTabulado(aBuffer(cascaron)); return false; }
    catch (e) { return /guardado como página web/.test(e.message) && /\.files/.test(e.message); }
  })());

assert('parseHtmlTabulado informa el desfasaje de la fila TOTAL GENERAL',
  parsed.totalRowOffset === 2);

// Un código repetido en los encabezados: las DOS columnas tienen que sobrevivir
// para poder elegir cualquiera de las dos en el mapeo de conceptos.
// Dos filas de empleado a propósito: el ancho de la tabla se deduce de la
// cantidad de celdas más frecuente, y con una sola fila empata con la de
// TOTAL GENERAL (que tiene 2 celdas menos por el colspan).
const htmlDup = tabuladoHtmlDemo({
  conceptos: ['2517 - Premio de progreso', '2517 - Premio de progreso'],
  filas: [
    { legajo: '1', nombre: 'PEREZ JUAN', valores: [100, 200] },
    { legajo: '2', nombre: 'GOMEZ ANA',  valores: [300, 400] },
  ],
});
const objsDup = htmlTabuladoToObjects(parseHtmlTabulado(aBuffer(htmlDup)));
assert('un código repetido deja las dos columnas (la 2ª con sufijo __2)',
  objsDup[0]['2517 - Premio de progreso'] === '100,00'
  && objsDup[0]['2517 - Premio de progreso__2'] === '200,00');

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

// ── El mismo Tabulado exportado como Excel real (con preámbulo) ──────────────
//
// Si alguien abre el .xls y lo guarda desde Excel, el preámbulo deja de estar en
// un <span> y pasa a estar en celdas: los encabezados quedan en la fila 3, no en
// la 1. Sin detectarlo, `sheet_to_json` toma el texto del preámbulo como
// encabezados y el archivo entra mapeando cualquier cosa, sin ningún error.

const C2517_NOMBRE = '2517 - Premio de progreso';

function xlsxTabuladoConPreambulo() {
  const preambulo = 'EA: Empresa Demo S.A. | Usuario: test | Periodo: 03/2025 - 03/2025 | '
    + 'Tipo: 2da Quincena c/ sobregiro | LSD: Todos |';
  const aoa = [
    [preambulo],
    ['TOTAL GENERAL', null, null, 2000, 6000],       // ya sin colspan: Excel lo expandió
    ['Legajo', 'Apellido y Nombre', 'CUIL', 'Bruto', C2517_NOMBRE],
    [null, null, null, 'Imp', 'Imp'],
    ['1', 'PEREZ JUAN', '20-1234-5', 1000, 2000],
    ['2', 'GOMEZ ANA',  '20-6789-0', 1000, 4000],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Tabulado');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return buf;
}
const bufXlsx = xlsxTabuladoConPreambulo();

const detXlsx = detectHeadersTabulado(bufXlsx);
assert('el .xlsx con preámbulo detecta la fila de encabezados real',
  detXlsx.headers[0] === 'Legajo' && detXlsx.headers[4] === C2517_NOMBRE);
assert('el preámbulo NO se toma como encabezados',
  !detXlsx.headers.some(h => /^EA:/.test(h)));

const parsedXlsx = parseTabuladoControl(bufXlsx, autoDetectTabMapping(detXlsx.headers));
assert('el .xlsx con preámbulo lee sólo las filas de empleado (sin "Imp" ni TOTAL)',
  parsedXlsx.parsedRows.length === 2);
assert('el .xlsx con preámbulo saca el período y la quincena del propio archivo',
  parsedXlsx.parseMetadata.period === '2025-03' && parsedXlsx.parseMetadata.quincena === 2);
assert('el .xlsx con preámbulo saca la empresa y el tipo de liquidación',
  parsedXlsx.parseMetadata.empresa === 'Empresa Demo S.A.'
  && parsedXlsx.parseMetadata.tipoLiquidacion === '2da Quincena c/ sobregiro');
assert('en el .xlsx la fila TOTAL GENERAL NO está corrida (offset 0)',
  parsedXlsx.parseMetadata.totalRowOffset === 0);
assert('el total del concepto se lee bien con offset 0',
  parsedXlsx.parseMetadata.totalRow[4] === 6000);
assert('los importes del .xlsx quedan como número (los parsea igual el control)',
  parsedXlsx.parsedRows[0][C2517_NOMBRE] === 2000);

// Un Excel normal (encabezados en la fila 1) sigue por la rama de siempre.
const wbNormal = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbNormal, XLSX.utils.aoa_to_sheet([
  ['EMPLEADO', 'APELLIDO Y NOMBRE', 'PUESTO'],
  ['0870', 'PEREZ JUAN', 'OPERARIO'],
]), 'Hoja1');
const detNormal = detectHeadersTabulado(XLSX.write(wbNormal, { type: 'array', bookType: 'xlsx' }));
assert('un Tabulado de Excel normal no cambia de comportamiento',
  detNormal.headers[0] === 'EMPLEADO' && detNormal.headers.length === 3);

// ── Nombre del archivo vs. lo que declara adentro ────────────────────────────

assert('si el nombre del archivo coincide con el contenido, no hay aviso',
  nombreCoincideConMetadata('Tabulado 2da Q Marzo 2025.xls', { period: '2025-03', quincena: 2 }) === null);
assert('un mes distinto en el nombre sale como aviso',
  /marzo/.test(nombreCoincideConMetadata('Tabulado 2da Q Marzo 2025.xls', { period: '2025-04', quincena: 2 }) || ''));
assert('una quincena distinta en el nombre sale como aviso',
  /quincena/.test(nombreCoincideConMetadata('Tabulado 1ra Q Abril 2025.xls', { period: '2025-04', quincena: 2 }) || ''));
assert('un nombre sin mes ni quincena no inventa un aviso',
  nombreCoincideConMetadata('tabulado.xls', { period: '2025-04', quincena: 2 }) === null);

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

/**
 * Mapping del control. El período y la quincena de cada lado salen de la
 * metadata que declara cada archivo, no del selector de período de la app.
 * `columnas` es opcional: sin él, cada concepto se precarga por código.
 */
const metaDe = (period, quincena = 2, extra = {}) => ({
  period, quincena, tipoLiquidacion: `${quincena}da Quincena`, ...extra,
});
const mapa = ({ prev = '2025-03', act = '2025-04', qPrev = 2, qAct = 2, columnas = {}, config = null, metaExtra = {} } = {}) => ({
  tab: { empleadoColumn: 'Legajo', apellidoNombreColumn: 'Apellido y Nombre' },
  variaciones: {
    config,
    anterior: { meta: metaDe(prev, qPrev, metaExtra.anterior || {}), columnas: columnas.anterior || null },
    actual:   { meta: metaDe(act, qAct, metaExtra.actual || {}),     columnas: columnas.actual   || null },
  },
});

// Envoltorios: el control recibe (filasAnterior, filasActual, mapping) — acá se
// escriben en el orden "actual, anterior" que es como se leen los casos.
const runSueldos   = (act, prev, opts) => runVariacionesSueldos(prev, act, mapa(opts));
const runConceptos = (act, prev, opts) => runVariacionesConceptos(prev, act, mapa(opts));

// ── run(): sin diferencias ───────────────────────────────────────────────────

const iguales = [
  fila('1', 'PEREZ JUAN', { [C899]: '5.000,00' }),
  fila('2', 'GOMEZ ANA',  { [C899]: '6.000,00' }),
];
const rSinDif = runVariacionesSueldos(iguales, iguales, mapa());
assert('run() sin diferencias no devuelve error', !rSinDif.error);
assert('run() sin diferencias: status success', summarizeVariacionesSueldos(rSinDif).status === 'success');
assert('run() sin diferencias: unitsWithDiff en 0', summarizeVariacionesSueldos(rSinDif).unitsWithDiff === 0);
assert('guarda los dos períodos comparados',
  rSinDif.periodAnterior === '2025-03' && rSinDif.period === '2025-04');
assert('guarda la quincena de cada período',
  rSinDif.quincenaAnterior === 2 && rSinDif.quincena === 2);
assert('la etiqueta del headline lleva la quincena, no sólo el mes',
  summarizeVariacionesSueldos(rSinDif).headline.includes('2ª quincena de marzo 2025')
  && summarizeVariacionesSueldos(rSinDif).headline.includes('2ª quincena de abril 2025'));

// ── run(): una diferencia conocida ───────────────────────────────────────────

const actual = [
  fila('1', 'PEREZ JUAN', { [C899]: '5.500,00' }),   // +500
  fila('2', 'GOMEZ ANA',  { [C899]: '6.000,00' }),   // igual
];
const rDif = runVariacionesSueldos(iguales, actual, mapa());
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
const rMixto = runSueldos(actMixto, prevMixto);
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
const rConsol = runSueldos(actualDosLiq, [
  fila('1', 'PEREZ JUAN', { [C899]: '5.500,00' }),
  fila('2', 'GOMEZ ANA',  { [C899]: '6.000,00' }),
]);
assert('un legajo con dos liquidaciones se SUMA, no se duplica ni se pisa',
  rConsol.rows.length === 2);
assert('el legajo con dos liquidaciones no genera diferencia falsa',
  Math.abs(rConsol.rows.find(r => r.legajo === '1').valores.total.diff) < 0.01);
assert('sin diferencias tras consolidar: status success',
  summarizeVariacionesSueldos(rConsol).status === 'success');

// ── Legajo presente en un solo período ───────────────────────────────────────

const rAltaBaja = runSueldos([
  fila('1', 'PEREZ JUAN', { [C899]: '5.000,00' }),
  fila('3', 'LOPEZ LUIS', { [C899]: '4.000,00' }),   // alta del mes
], [
  fila('1', 'PEREZ JUAN', { [C899]: '5.000,00' }),
  fila('2', 'GOMEZ ANA',  { [C899]: '6.000,00' }),   // baja del mes
]);
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

const rConceptos = runConceptos([
  fila('1', 'PEREZ JUAN', { [C2517]: '5.000,00', [C2519]: '1.000,00' }),
], [
  fila('1', 'PEREZ JUAN', { [C2517]: '4.000,00', [C2519]: '1.000,00' }),
]);
assert('Variación Conceptos arma un grupo por concepto', rConceptos.grupos.length === 2);
assert('los grupos son 2517 y 2519',
  rConceptos.grupos.map(g => g.key).join(',') === '2517,2519');
assert('usa el nombre del concepto tal como figura en el Tabulado',
  rConceptos.grupos[0].nombreReal === C2517);
assert('2517 varió +1.000', Math.abs(rConceptos.rows[0].valores['2517'].diff - 1000) < 0.01);
assert('2519 no varió', Math.abs(rConceptos.rows[0].valores['2519'].diff) < 0.01);

// ── Concepto que no se liquidó en un período ──────────────────────────────────

const rFaltante = runConceptos([
  fila('1', 'PEREZ JUAN', { [C2517]: '5.000,00' }),        // sin 2519 este mes
], [
  fila('1', 'PEREZ JUAN', { [C2517]: '5.000,00', [C2519]: '2.000,00' }),
]);
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
const rEscala = runConceptos(actEscala, prevEscala);
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
  runSueldos(actEscala, prevEscala).grupos[0].escala === undefined
  || runSueldos(actEscala, prevEscala).grupos[0].escala === null);

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
const rNull = runConceptos(actNull, prevNull);
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
  typeof runSueldos([], iguales).error === 'string');
assert('run() sin el Tabulado del período anterior devuelve error',
  typeof runSueldos(iguales, []).error === 'string');
assert('el error de archivo faltante dice cuál falta',
  /período anterior/i.test(runSueldos(iguales, []).error));
assert('run() con el mismo período Y la misma quincena devuelve error',
  typeof runSueldos(iguales, iguales, { prev: '2025-04' }).error === 'string');
assert('summarize() de un error no rompe y da status error',
  summarizeVariacionesSueldos(runSueldos(iguales, [])).status === 'error');

const rSinLegajo = runSueldos([{ Foo: 'x' }], iguales);
assert('run() sin columna de legajo identificable devuelve error',
  typeof rSinLegajo.error === 'string');

// Mismo período pero distinta quincena: es una comparación válida (1ª vs 2ª del
// mismo mes) y las etiquetas tienen que distinguirlas.
const rMismaMes = runSueldos(actual, iguales, { prev: '2025-04', act: '2025-04', qPrev: 1, qAct: 2 });
assert('mismo período con distinta quincena SÍ se ejecuta', !rMismaMes.error);
assert('las etiquetas distinguen 1ª de 2ª quincena del mismo mes',
  summarizeVariacionesSueldos(rMismaMes).headline.includes('1ª quincena de abril 2025')
  && summarizeVariacionesSueldos(rMismaMes).headline.includes('2ª quincena de abril 2025'));

// ── Orden de los archivos: el más viejo siempre queda a la izquierda ──────────

// Se suben al revés (el de abril en el slot "anterior"). El control ordena por
// fecha, así que el reporte igual compara marzo → abril.
const rInvertido = runVariacionesSueldos(actual, iguales, {
  tab: { empleadoColumn: 'Legajo', apellidoNombreColumn: 'Apellido y Nombre' },
  variaciones: {
    anterior: { meta: metaDe('2025-04') },   // slot "anterior" con el archivo NUEVO
    actual:   { meta: metaDe('2025-03') },   // slot "actual" con el archivo VIEJO
  },
});
assert('subidos al revés, el más viejo queda igual a la izquierda',
  rInvertido.periodAnterior === '2025-03' && rInvertido.period === '2025-04');
assert('subidos al revés, la variación mantiene el signo correcto',
  Math.abs(rInvertido.rows.find(r => r.legajo === '1').valores.total.diff - 500) < 0.01);
assert('subidos al revés, sale el aviso de orden invertido',
  rInvertido.avisos.some(a => /inverso/i.test(a)));

// ── Tipo de liquidación ──────────────────────────────────────────────────────

assert('el tipo de liquidación de cada archivo llega al resultado',
  rSinDif.tipoLiquidacion === '2da Quincena' && rSinDif.tipoLiquidacionAnterior === '2da Quincena');
const rTipos = runSueldos(actual, iguales, {
  metaExtra: { anterior: { tipoLiquidacion: 'Mensual' }, actual: { tipoLiquidacion: '2da Quincena' } },
});
assert('comparar tipos de liquidación distintos sale como aviso',
  rTipos.avisos.some(a => /tipos de liquidación distintos/i.test(a)));

// ── Mapeo de conceptos confirmado por el analista ─────────────────────────────

// El código sugiere una columna, pero el analista apunta el concepto a OTRA:
// manda lo mapeado, no el código.
const prevMapeo = [fila('1', 'PEREZ JUAN', { [C2517]: '1.000,00', 'Otra columna': '7.000,00' })];
const actMapeo  = [fila('1', 'PEREZ JUAN', { [C2517]: '1.000,00', 'Otra columna': '9.000,00' })];
const rMapeado = runConceptos(actMapeo, prevMapeo, {
  columnas: { anterior: { '2517': 'Otra columna' }, actual: { '2517': 'Otra columna' } },
});
assert('el concepto usa la columna mapeada a mano, no la del código',
  Math.abs(rMapeado.rows[0].valores['2517'].diff - 2000) < 0.01);

// "No se liquidó en este período" = null explícito → 0,00 y aviso, sin romper.
const rNoLiq = runConceptos(actMapeo, prevMapeo, {
  columnas: { anterior: { '2517': null }, actual: { '2517': C2517 } },
});
assert('"no se liquidó" computa 0,00 y no rompe',
  !rNoLiq.error && rNoLiq.rows[0].valores['2517'].anterior === null);
assert('"no se liquidó" sale como concepto faltante',
  rNoLiq.faltantes.some(f => f.codigo === '2517' && f.enPrev === false));

// ── Validación contra la fila TOTAL GENERAL del archivo ──────────────────────

const filasTot = [
  fila('1', 'PEREZ JUAN', { [C2517]: '1.000,00' }),
  fila('2', 'GOMEZ ANA',  { [C2517]: '2.000,00' }),
];
const metaConTotal = (totalDeclarado) => ({
  // headers/totalRow como los devuelve el parser HTML: la fila TOTAL GENERAL
  // arranca 2 columnas corrida (colspan=3 en su primera celda).
  // La celda "TOTAL GENERAL" fusiona Legajo+Nombre+CUIL, así que el concepto
  // que en headers está en el índice 3 acá cae en el 1 (3 − offset).
  headers: ['Legajo', 'Apellido y Nombre', 'CUIL', C2517],
  totalRow: ['TOTAL GENERAL', totalDeclarado],
  totalRowOffset: 2,
});
const rTotalOk = runVariacionesConceptos(filasTot, filasTot, {
  tab: { empleadoColumn: 'Legajo' },
  variaciones: {
    anterior: { meta: { ...metaDe('2025-03'), ...metaConTotal('3.000,00') } },
    actual:   { meta: { ...metaDe('2025-04'), ...metaConTotal('3.000,00') } },
  },
});
assert('si el total calculado cierra contra TOTAL GENERAL no hay aviso',
  rTotalOk.totalesQueNoCierran.length === 0);

const rTotalMal = runVariacionesConceptos(filasTot, filasTot, {
  tab: { empleadoColumn: 'Legajo' },
  variaciones: {
    anterior: { meta: { ...metaDe('2025-03'), ...metaConTotal('9.999,00') } },
    actual:   { meta: { ...metaDe('2025-04'), ...metaConTotal('3.000,00') } },
  },
});
assert('un total que no cierra sale como aviso y la corrida termina igual',
  !rTotalMal.error && rTotalMal.totalesQueNoCierran.length === 1);
assert('el aviso de total trae el valor del archivo y el calculado',
  Math.abs(rTotalMal.totalesQueNoCierran[0].archivo - 9999) < 0.01
  && Math.abs(rTotalMal.totalesQueNoCierran[0].calculado - 3000) < 0.01);

// ── Conceptos configurables por cliente ──────────────────────────────────────

// Sin config, el control usa la semilla del módulo y da el mismo resultado de siempre.
assert('sin config, los conceptos son los de la semilla',
  runConceptos(actMapeo, prevMapeo).grupos.map(g => g.key).join(',') === '2517,2519');

// Con config, se compara lo que diga el cliente — incluida una columna SIN código.
const rConfig = runConceptos(actMapeo, prevMapeo, {
  config: { conceptos: [{ nombre: 'Otra columna', label: 'Una columna sin código' }] },
});
assert('la config del cliente manda sobre la semilla',
  rConfig.grupos.length === 1 && rConfig.grupos[0].label === 'Una columna sin código');
assert('se puede comparar una columna que no tiene código de concepto',
  Math.abs(rConfig.rows[0].valores['Otra columna'].diff - 2000) < 0.01);

// ── Columna confirmada que ya no está en el archivo (headers renombrados) ────
//
// El fast path de "lo confirmado por el analista" no puede confiar en el
// nombre de columna sin chequearlo contra el archivo actual: si dejó de
// existir (renombre, o el Tabulado se re-exportó distinto), usarla igual
// sería un 0,00 silencioso indistinguible de "no se liquidó" (CLAUDE.md §11.5).

const prevHuerfana = [fila('1', 'PEREZ JUAN', { [C2517]: '1.000,00' })];
const actHuerfana  = [fila('1', 'PEREZ JUAN', { [C2517]: '3.000,00' })];
const rHuerfana = runConceptos(actHuerfana, prevHuerfana, {
  columnas: { anterior: { '2517': 'Columna Vieja Que Ya No Existe' } },
});
assert('una columna confirmada que no está en el archivo no se usa como si existiera',
  !rHuerfana.error && rHuerfana.rows[0].valores['2517'].anterior === null);
assert('se informa aparte como huérfana (no como "no se liquidó" sin explicación)',
  rHuerfana.huerfanas.some(h => h.id === '2517' && h.lado === 'anterior' && h.col === 'Columna Vieja Que Ya No Existe'));
assert('la huérfana también cuenta como faltante (se computa 0,00 y sale aviso)',
  rHuerfana.faltantes.some(f => f.codigo === '2517' && f.enPrev === false));
assert('una columna confirmada que SÍ existe en el archivo no genera huérfanas',
  runConceptos(actMapeo, prevMapeo, {
    columnas: { anterior: { '2517': 'Otra columna' }, actual: { '2517': 'Otra columna' } },
  }).huerfanas.length === 0);

// ── Filtro de secciones fantasma en el PDF (gruposParaImprimir) ──────────────

const rConceptoAusenteEnLosDos = runConceptos([
  fila('1', 'PEREZ JUAN', { [C2517]: '5.000,00' }),   // 2519 no existe en ningún archivo
], [
  fila('1', 'PEREZ JUAN', { [C2517]: '4.000,00' }),
]);
assert('un concepto ausente en los dos archivos se marca faltante en los dos lados',
  rConceptoAusenteEnLosDos.faltantes.some(f => f.codigo === '2519' && f.enPrev === false && f.enAct === false));
const impresos = gruposParaImprimir(rConceptoAusenteEnLosDos.grupos, rConceptoAusenteEnLosDos.faltantes);
assert('el grupo sin ningún dato real no entra al PDF (saldría todo en 0,00)',
  !impresos.some(g => g.key === '2519'));
assert('el grupo con dato real sí entra al PDF', impresos.some(g => g.key === '2517'));

// Sueldos combina 2 entradas en 1 solo grupo: si SÓLO una de las dos no existe
// en ningún archivo (el caso de diseño real: "899999 - Jornales" nunca aparece
// en un Tabulado de mensualizados), el grupo sigue teniendo dato real por la
// otra entrada y no se omite del PDF.
const rSueldosParcial = runSueldos([
  fila('1', 'PEREZ JUAN', { [C1000]: '8.000,00' }),   // sólo mensualizados
], [
  fila('1', 'PEREZ JUAN', { [C1000]: '7.500,00' }),
]);
assert('899999 queda faltante en los dos lados (no existe en ningún Tabulado)',
  rSueldosParcial.faltantes.some(f => f.codigo === '899999' && !f.enPrev && !f.enAct));
assert('el grupo combinado de Sueldos SÍ entra al PDF porque 1000 tiene dato real',
  gruposParaImprimir(rSueldosParcial.grupos, rSueldosParcial.faltantes).length === 1);

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
