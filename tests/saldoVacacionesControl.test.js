// saldoVacacionesControl.test.js — Saldo de vacaciones (COTY, Generar Reporte)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/saldoVacacionesControl.test.js
//
// Datos 100% inventados: legajos '1'/'2'/'3'/'4'/'007' y nombres de la lista de
// jugadores de Banfield de CLAUDE.md. Ni un archivo ni un nombre real acá.
//
// Lo que este test fija, en orden de qué cuesta más caro si se rompe:
//   1. **Un legajo con dos filas en Liquidaciones SUMA, no pisa** — y '007' y '7'
//      son el mismo empleado (los dos archivos con la MISMA clave, D-038/D-042).
//   2. `null` no es `0`: el legajo que sólo está en Liquidaciones sale con el
//      alta, los días y el saldo VACÍOS (y explicado), no en cero; lo único que
//      sale en 0 es la baja de quien no tiene el concepto 503310.
//   3. Alta del mes, baja (con 503310, con egreso, o sólo en Liquidaciones) y
//      "sin provisión": cada una con su observación.
//   4. La suma de Liquidaciones contra el TOTAL GENERAL CORTA con un error que
//      dice qué no cierra — un número coherente y mal no lo detecta nadie.
//   5. El período sale del TEXTO de la liquidación, y si no hay o hay más de uno
//      no se adivina.
//   6. Los dos formatos de entrada (HTML disfrazado de .xls y .xlsx real, con
//      celdas combinadas) dan la misma lectura.
//   7. El .xlsx: títulos en E..J (amarillo, con el doble espacio literal),
//      encabezados en la fila 2, datos desde la 3 sin fila de total, formatos
//      numéricos y hoja Notas sin nombres de personas.

globalThis.document = { addEventListener: () => {} };

import * as XLSXmod from 'xlsx';
globalThis.XLSX = XLSXmod;
import ExcelJS from 'exceljs';

const {
  parseVacaciones, parseLiquidacionesVac, periodoDeLiquidacion,
  detectHeadersVacaciones, detectHeadersLiquidaciones,
} = await import('./js/parsers/saldoVacacionesParser.js');
const { runSaldoVacaciones, summarizeSaldoVacaciones, armarLibroSaldoVac, DEFAULT_SALDO_VAC_CONFIG }
  = await import('./js/controls/saldoVacaciones.js');
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { filterControlsForClient } = await import('./js/controls/scope.js');
const { FILE_TYPES } = await import('./js/ui/fileTypes.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle !== undefined ? `\n    ${JSON.stringify(detalle)}` : ''); fail++; }
}
const cerca = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.005;

// ── Fixtures: las dos tablas HTML, como las baja Axton ───────────────────────

const enc = (html) => new TextEncoder().encode(html).buffer;
const td = (v) => `<td style='font-family:Arial;'>${v === '' || v === null ? '&nbsp;' : v}</td>`;
const th = (v, attrs = '') => `<th${attrs}>${v}</th>`;

function htmlVacaciones(filas) {
  const cab = ['Legajo', 'Apellido y Nombre', 'Cliente', 'Ingreso', 'Egreso', 'Año', 'Dias', 'Gozados', 'No Gozados', 'Saldo',
    'Convenio', 'Detalle', 'CentrodeCosto', 'Cargo', 'SectorInterno', 'Periodo', 'Desde', 'Hasta', 'Dias', 'Liquidacion', 'Linea'];
  return `<table><tr>${cab.map(h => th(h)).join('')}</tr>\n`
    + filas.map(f => `<tr>${td(f.legajo)}${td(f.nombre)}${td('EMPRESA DE PRUEBA')}${td(f.ingreso ?? '')}${td(f.egreso ?? '')}${td('2026')}`
      + `${td(f.dias ?? '')}${td(f.gozados ?? '')}${td('')}${td('')}${td('')}${td('')}${td('')}${td('')}${td('')}`
      + `${td('2026')}${td('')}${td('')}${td('99')}${td('')}${td('')}</tr>`).join('\n')
    + '</table>';
}

// "TOTAL GENERAL" con colspan=3 arriba y abajo, encabezado de dos filas con
// colspan/rowspan, importes en formato argentino.
function htmlLiquidaciones(filas, total, { conceptoBaja = '503310 - Vac. no gozadas 2026' } = {}) {
  const fila = (f) => `<tr>${td(f.legajo)}${td(f.nombre)}${td('SIN CUIL')}${td('30/09/2026')}${td('')}${td('0')}`
    + `${td(f.pc ?? '')}${td(f.pi ?? '')}${td(f.bc ?? '')}${td(f.bi ?? '')}${td('')}${td('')}${td('')}${td(f.liq)}</tr>`;
  const tot = `<tr><td colspan='3'>TOTAL GENERAL</td>${td('')}${td('125')}${td('')}${td(total.pc)}${td(total.pi)}${td(total.bc)}${td(total.bi)}${td('')}${td('')}${td('')}${td('')}</tr>`;
  return `<table>${tot}\n<tr>${['Legajo', 'Apellido y Nombre', 'CUIL', 'F.R.P.', 'Recibo', 'Mov.'].map(h => th(h, " rowspan='2'")).join('')}`
    + `${th('800172 - Provision Vacaciones', " colspan='2'")}${th(conceptoBaja, " colspan='2'")}${th('TOTAL - ', " colspan='2'")}`
    + `${th('LSD', " rowspan='2'")}${th('liquidacion', " rowspan='2'")}</tr>\n`
    + `<tr>${['Cant', 'Imp', 'Cant', 'Imp', 'Cant', 'Imp'].map(h => th(h)).join('')}</tr>\n`
    + filas.map(fila).join('\n') + `\n${tot}</table>`;
}

const LIQ_PROV = 'x Provisiones Septiembre 2026 (Provisiones 09-2026)  - (v)';
const LIQ_BAJA = 'Liq. Final c/sueldo Septiembre 2026 (Bajas 09-2026)  - (c)';

// Cinco situaciones en un mismo mes:
//   '1'   SANGUINETTI: dos filas en Liquidaciones (hay que SUMARLAS); 1.500,00 + 500,00 de provisión
//   '007' ALBELLA: en Vacaciones como '007' y en Liquidaciones como '7'; ingresó en septiembre (alta)
//   '2'   FALCIONI: con egreso y con 503310 (baja)
//   '3'   URZI: sólo en Liquidaciones, con 503310 y sin 800172
//   '4'   CARRANZA: sólo en Vacaciones (sin provisión)
const vacRows = () => [
  { legajo: '0001', nombre: 'SANGUINETTI,JAVIER', ingreso: '01/03/2015', dias: '35', gozados: '5' },
  { legajo: '007', nombre: 'ALBELLA,GUSTAVO', ingreso: '15/09/2026', dias: '12', gozados: '0' },
  { legajo: '2', nombre: 'FALCIONI,JULIO CESAR', ingreso: '10/02/2010', egreso: '10/09/2026', dias: '28', gozados: '3,5' },
  { legajo: '4', nombre: 'CARRANZA,JULIAN', ingreso: '02/05/2019', dias: '20', gozados: '0' },
];
const liqRows = () => [
  { legajo: '1', nombre: 'SANGUINETTI JAVIER', pc: '10,50', pi: '1.000,00', liq: LIQ_PROV },
  { legajo: '0001', nombre: 'SANGUINETTI JAVIER', pc: '2,00', pi: '500,00', liq: LIQ_BAJA },
  { legajo: '7', nombre: 'ALBELLA GUSTAVO', pc: '1,50', pi: '123.456,78', liq: LIQ_PROV },
  { legajo: '2', nombre: 'FALCIONI JULIO CESAR', pc: '8,00', pi: '800,00', bc: '5,25', bi: '2.500,50', liq: LIQ_BAJA },
  { legajo: '3', nombre: 'URZI AGUSTIN', bc: '1,00', bi: '300,00', liq: LIQ_BAJA },
];
const TOTAL = { pc: '22,00', pi: '125.756,78', bc: '6,25', bi: '2.800,50' };

function correr({ vac = vacRows(), liq = liqRows(), total = TOTAL, mapping = {}, conceptoBaja } = {}) {
  const v = parseVacaciones(enc(htmlVacaciones(vac)));
  const l = parseLiquidacionesVac(enc(htmlLiquidaciones(liq, total, { conceptoBaja })));
  return runSaldoVacaciones(v.parsedRows, [], {
    legajoKeyMode: 'sin_ceros',
    liquidacionesRows: l.parsedRows, liquidacionesMeta: l.parseMetadata,
    vacacionesFileName: 'Vacaciones.prueba.xls', liquidacionesFileName: 'Liquidaciones.prueba.xls',
    ...mapping,
  });
}
const de = (r, legajo) => r.filas.find(f => f.legajo === legajo);

// ── 1. El parser lee la tabla HTML ───────────────────────────────────────────

const pv = parseVacaciones(enc(htmlVacaciones(vacRows())));
assert('Vacaciones: una fila por legajo, con los ceros como vienen', pv.parsedRows.length === 4 && pv.parsedRows[0].legajo === '0001');
assert('Vacaciones: Dias es la PRIMERA columna "Dias" (35) y no la del período (99)', pv.parsedRows[0].dias === 35);
assert('Vacaciones: "3,5" gozados se lee como número', pv.parsedRows[2].gozados === 3.5);
assert('Vacaciones: egreso vacío queda vacío, no inventa fecha', pv.parsedRows[0].egreso === '' && pv.parsedRows[2].egreso === '10/09/2026');
assert('Vacaciones: informa cuántos legajos leyó', pv.parseMetadata.uniqueLegajos === 4 && pv.parseMetadata.formato === 'html');
assert('Vacaciones: la vista previa muestra los encabezados leídos',
  detectHeadersVacaciones(enc(htmlVacaciones(vacRows()))).headers.includes('Gozados'));

let errorParser = null;
try { parseVacaciones(enc(htmlVacaciones(vacRows()).replace('>Gozados<', '>Usados<'))); } catch (e) { errorParser = e.message; }
assert('Vacaciones: un encabezado que falta corta diciendo qué se esperaba y qué hay',
  errorParser && errorParser.includes('"Gozados"') && errorParser.includes('"Usados"'), errorParser);

const pl = parseLiquidacionesVac(enc(htmlLiquidaciones(liqRows(), TOTAL)));
assert('Liquidaciones: lee las filas de datos y NO la fila TOTAL GENERAL', pl.parsedRows.length === 5);
assert('Liquidaciones: los dos conceptos salen con su encabezado completo (sin "TOTAL -")',
  pl.parseMetadata.conceptos.join('|') === '800172 - Provision Vacaciones|503310 - Vac. no gozadas 2026');
assert('Liquidaciones: importe argentino "123.456,78" se lee como número',
  pl.parsedRows[2].valores['800172 - Provision Vacaciones'].imp === 123456.78);
assert('Liquidaciones: celda vacía es null, no 0',
  pl.parsedRows[0].valores['503310 - Vac. no gozadas 2026'].cant === null);
const t0 = pl.parseMetadata.totales;
assert('Liquidaciones: lee las dos filas TOTAL GENERAL con el colspan expandido (no corridas 2 columnas)',
  t0.length === 2 && t0[0]['800172 - Provision Vacaciones'].cant === 22 && t0[1]['503310 - Vac. no gozadas 2026'].imp === 2800.5, t0);
assert('Liquidaciones: el período sale del texto de la liquidación', pl.parseMetadata.periodos.join() === '2026-09');

let errorLiq = null;
try { parseLiquidacionesVac(enc(htmlLiquidaciones(liqRows(), TOTAL).replace('>liquidacion<', '>observaciones<'))); } catch (e) { errorLiq = e.message; }
assert('Liquidaciones: sin la columna "liquidacion" corta diciendo qué falta y qué trae',
  errorLiq && errorLiq.includes('"liquidacion"') && errorLiq.includes('"observaciones"'), errorLiq);

let errorSinTotal = null;
try { parseLiquidacionesVac(enc(htmlLiquidaciones(liqRows(), TOTAL).replace(/TOTAL GENERAL/g, 'SUBTOTAL'))); } catch (e) { errorSinTotal = e.message; }
assert('Liquidaciones: sin fila TOTAL GENERAL no hay cómo comprobar la lectura y corta',
  errorSinTotal && errorSinTotal.includes('TOTAL GENERAL'), errorSinTotal);

assert('la vista previa de Liquidaciones nombra las columnas Cant/Imp de cada concepto',
  detectHeadersLiquidaciones(enc(htmlLiquidaciones(liqRows(), TOTAL))).headers.includes('800172 - Provision Vacaciones (Imp)'));

// ── 2. El período, desde el texto ────────────────────────────────────────────

assert('período: "(Provisiones 09-2026)" → 2026-09', periodoDeLiquidacion(LIQ_PROV) === '2026-09');
assert('período: "(Bajas 09-2026)" → 2026-09', periodoDeLiquidacion(LIQ_BAJA) === '2026-09');
assert('período: sin paréntesis con MM-AAAA no se adivina', periodoDeLiquidacion('x Provisiones Septiembre 2026') === null);
assert('período: mes inexistente no se acepta', periodoDeLiquidacion('(Bajas 13-2026)') === null);

// ── 3. run(): consolidación, legajo, null vs 0, alta, baja ───────────────────

const r = correr();
assert('corre sin error', !r.error, r.error);
assert('período 2026-09, hoja y archivo con su nombre',
  r.period === '2026-09' && r.sheetName === 'Vac_Liq_Septiembre_2026' && r.fileName === 'Saldo vac 09-2026.xlsx');
assert('universo: la unión de los dos archivos, orden ascendente numérico',
  r.filas.map(f => f.legajo).join() === '1,2,3,4,7', r.filas.map(f => f.legajo));

const f1 = de(r, 1);
assert('SUMA dos filas del mismo legajo: saldo 10,50 + 2,00 = 12,50 (no pisa con la última)', f1.saldo === 12.5, f1);
assert('SUMA dos filas del mismo legajo: provisión 1.000,00 + 500,00 = 1.500,00', f1.prov === 1500, f1);
assert('«0001» y «1» son el mismo legajo: el legajo sale como número sin ceros', f1.legajo === 1 && r.conteos.liquidaciones === 4);
assert('el nombre sale de Vacaciones con espacio tras la coma', f1.nombre === 'SANGUINETTI, JAVIER', f1.nombre);
assert('días y gozados salen de Vacaciones; alta = Ingreso', f1.dias === 35 && f1.gozados === 5 && f1.ingreso === '2015-03-01');
assert('sin 503310: Vac_Proporcionales y 3553 salen en 0 (lo define el pedido)', f1.bajaDias === 0 && f1.bajaImporte === 0);
assert('legajo sin observaciones: celda vacía (null)', f1.obs === null);

const f7 = de(r, 7);
assert('«007» de Vacaciones y «7» de Liquidaciones son el mismo empleado: datos de los dos archivos',
  f7 && f7.saldo === 1.5 && f7.prov === 123456.78 && f7.dias === 12 && f7.nombre === 'ALBELLA, GUSTAVO', f7);
assert('alta del mes: Ingreso dentro del mes → observación y marca',
  f7.obs === 'Alta del mes: se tomó la provisión de Axton; criterio a revisar.' && f7.marcas.includes('alta'), f7.obs);

const f2 = de(r, 2);
assert('baja con 503310 y egreso: observación "Baja: criterio a definir."', f2.obs === 'Baja: criterio a definir.', f2.obs);
assert('baja: los días del 503310 tal cual y la 3553 en 0 (si es baja, 3553 = 0)', f2.bajaDias === 5.25 && f2.bajaImporte === 0 && f2.egreso === '2026-09-10', f2);
assert('baja: el importe del 503310 no se pierde, alimenta el chequeo contra TOTAL GENERAL', f2.importeNoGozadas === 2500.5, f2);
assert('baja: conserva su provisión 800172 (8,00 / 800,00)', f2.saldo === 8 && f2.prov === 800);

const f3 = de(r, 3);
assert('legajo sólo en Liquidaciones: alta, días, gozados y saldo VACÍOS (null, no 0)',
  f3.ingreso === null && f3.egreso === null && f3.dias === null && f3.gozados === null && f3.saldo === null && f3.prov === null, f3);
assert('legajo sólo en Liquidaciones: el nombre de Liquidaciones tal cual, y su 503310', f3.nombre === 'URZI AGUSTIN' && f3.bajaDias === 1 && f3.bajaImporte === 0 && f3.importeNoGozadas === 300);
assert('legajo sólo en Liquidaciones: la observación explica qué falta',
  f3.obs === 'Baja: criterio a definir. No figura en el reporte de Vacaciones (sin alta, días ni saldo); sin provisión 800172 en Liquidaciones.', f3.obs);

const f4 = de(r, 4);
assert('legajo sólo en Vacaciones: sin provisión → saldo y provisión VACÍOS (null) y su observación',
  f4.saldo === null && f4.prov === null && f4.dias === 20 && f4.obs === 'Sin provisión en Liquidaciones.', f4);
assert('legajo sólo en Vacaciones: la baja sale en 0', f4.bajaDias === 0 && f4.bajaImporte === 0);

assert('conteos: en ambos, sólo en uno',
  r.conteos.vacaciones === 4 && r.conteos.ambos === 3 && r.conteos.soloVacaciones === 1 && r.conteos.soloLiquidaciones === 1 && r.conteos.total === 5, r.conteos);
assert('avisos: una alta, dos bajas, un sin provisión',
  r.avisos.altas.length === 1 && r.avisos.bajas.length === 2 && r.avisos.sinProvision.length === 1, r.avisos);
assert('los totales de las filas cierran con el TOTAL GENERAL',
  cerca(r.totales.provImp, 125756.78) && cerca(r.totales.provCant, 22) && cerca(r.totales.bajaImp, 2800.5) && cerca(r.totales.bajaCant, 6.25), r.totales);
assert('nombres de los archivos de origen viajan al resultado', r.origen.vacaciones === 'Vacaciones.prueba.xls');

// La clave del cliente manda: con «007» ≠ «7» son dos empleados distintos.
const rTrim = correr({ mapping: { legajoKeyMode: 'trim' } });
assert('con la clave "tal cual viene", «007» y «7» NO son el mismo legajo (y «0001» ≠ «1»)',
  !rTrim.error && rTrim.conteos.total === 7, rTrim.conteos);

// ── 4. Las validaciones que cortan ───────────────────────────────────────────

const rMalo = correr({ total: { ...TOTAL, pi: '999.999,99' } });
assert('la suma que no cierra con el TOTAL GENERAL corta con error legible',
  rMalo.error && rMalo.error.includes('TOTAL GENERAL') && rMalo.error.includes('800172') && rMalo.error.includes('importe'), rMalo.error);
assert('si corta, no devuelve filas', !rMalo.filas);
const rMaloBaja = correr({ total: { ...TOTAL, bc: '7,25' } });
assert('también valida el 503310 (cantidad)', rMaloBaja.error && rMaloBaja.error.includes('503310') && rMaloBaja.error.includes('cantidad'), rMaloBaja.error);
const rTolerancia = correr({ total: { ...TOTAL, bi: '2.800,51' } });
assert('la tolerancia es de 0,01: un centavo de diferencia todavía pasa', !rTolerancia.error, rTolerancia.error);
const rSobrepasa = correr({ total: { ...TOTAL, bi: '2.800,52' } });
assert('y dos centavos cortan', !!rSobrepasa.error);

const rSinConcepto = correr({ conceptoBaja: '999999 - Otro concepto' });
assert('un concepto que no está en los encabezados corta diciendo cuál falta y cuáles trae',
  rSinConcepto.error && rSinConcepto.error.includes('"503310"') && rSinConcepto.error.includes('999999 - Otro concepto'), rSinConcepto.error);
const rCodigoEditado = correr({ conceptoBaja: '999999 - Otro concepto', mapping: { saldoVacacionesConfig: { codigoBaja: '999999' } } });
assert('el código es semilla: mapping.saldoVacacionesConfig lo pisa', !rCodigoEditado.error, rCodigoEditado.error);
assert('las semillas son 800172 y 503310', DEFAULT_SALDO_VAC_CONFIG.codigoProvision === '800172' && DEFAULT_SALDO_VAC_CONFIG.codigoBaja === '503310');

const rMezcla = correr({ liq: liqRows().map((f, i) => (i === 4 ? { ...f, liq: 'Liq. Final (Bajas 10-2026)' } : f)) });
assert('dos períodos en Liquidaciones: error, no adivina', rMezcla.error && rMezcla.error.includes('mezcla períodos'), rMezcla.error);
const rSinPeriodo = correr({ liq: liqRows().map(f => ({ ...f, liq: 'Provisiones de Septiembre' })) });
assert('sin período en el texto: error, no lo deduce del nombre del mes', rSinPeriodo.error && rSinPeriodo.error.includes('período'), rSinPeriodo.error);

const rRepetido = correr({ vac: [...vacRows(), { legajo: '4', nombre: 'CARRANZA,JULIAN', ingreso: '02/05/2019', dias: '20', gozados: '0' }] });
assert('un legajo dos veces en Vacaciones (aunque sea «4» y «4») corta: no elige una fila en silencio',
  rRepetido.error && rRepetido.error.includes('aparece 2 veces'), rRepetido.error);
const rRepetidoCeros = correr({ vac: [...vacRows(), { legajo: '04', nombre: 'CARRANZA,JULIAN', ingreso: '02/05/2019', dias: '20', gozados: '0' }] });
assert('«04» y «4» son el mismo legajo también en Vacaciones', rRepetidoCeros.error && rRepetidoCeros.error.includes('aparece 2 veces'), rRepetidoCeros.error);

const rFecha = correr({ vac: vacRows().map((f, i) => (i === 0 ? { ...f, ingreso: '2015-03-01' } : f)) });
assert('una fecha que no es dd/mm/aaaa corta diciendo cuál', rFecha.error && rFecha.error.includes('2015-03-01'), rFecha.error);

const rAviso = correr({ mapping: { period: '2026-08' } });
assert('si el período elegido en la app no es el de los archivos, avisa (y usa el de los archivos)',
  !rAviso.error && rAviso.period === '2026-09' && rAviso.avisos.generales.some(g => g.includes('08-2026') && g.includes('09-2026')), rAviso.avisos);

const rSin = runSaldoVacaciones([], [], { liquidacionesRows: [] });
assert('sin archivos: error que dice qué subir', rSin.error && rSin.error.includes('Vacaciones'), rSin);

// ── 5. .xlsx real, con celdas combinadas ─────────────────────────────────────

async function xlsxLiquidaciones() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Liquidaciones');
  ws.addRow(['TOTAL GENERAL', 'TOTAL GENERAL', 'TOTAL GENERAL', null, 125, null, 22, 125756.78, 6.25, 2800.5, 28.25, 128557.28]);
  ws.addRow(['Legajo', 'Apellido y Nombre', 'CUIL', 'F.R.P.', 'Recibo', 'Mov.', '800172 - Provision Vacaciones', '800172 - Provision Vacaciones',
    '503310 - Vac. no gozadas 2026', '503310 - Vac. no gozadas 2026', 'TOTAL -', 'TOTAL -', 'LSD', 'liquidacion']);
  ws.addRow(['Legajo', 'Apellido y Nombre', 'CUIL', 'F.R.P.', 'Recibo', 'Mov.', 'Cant', 'Imp', 'Cant', 'Imp', 'Cant', 'Imp', 'LSD', 'liquidacion']);
  const num = (s) => (s ? Number(s.replace(/\./g, '').replace(',', '.')) : null);
  for (const f of liqRows()) {
    ws.addRow([Number(f.legajo), f.nombre, 'SIN CUIL', new Date(Date.UTC(2026, 8, 30)), null, 0,
      num(f.pc), num(f.pi), num(f.bc), num(f.bi), null, null, null, f.liq]);
  }
  ws.addRow(['TOTAL GENERAL', 'TOTAL GENERAL', 'TOTAL GENERAL', null, 125, null, 22, 125756.78, 6.25, 2800.5, 28.25, 128557.28]);
  for (const rango of ['F2:F3', 'G2:H2', 'I2:J2', 'K2:L2', 'A2:A3', 'B2:B3', 'C2:C3', 'D2:D3', 'E2:E3', 'M2:M3', 'N2:N3', 'A1:C1', `A${ws.rowCount}:C${ws.rowCount}`]) {
    ws.mergeCells(rango);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer()).buffer;
}
const plX = parseLiquidacionesVac(await xlsxLiquidaciones());
assert('.xlsx real: mismo resultado que el HTML (filas, conceptos, totales, período)',
  plX.parseMetadata.formato === 'xlsx' && plX.parsedRows.length === 5
  && plX.parseMetadata.conceptos.join('|') === pl.parseMetadata.conceptos.join('|')
  && plX.parseMetadata.totales.length === 2 && plX.parseMetadata.totales[0]['503310 - Vac. no gozadas 2026'].imp === 2800.5
  && plX.parseMetadata.periodos.join() === '2026-09', plX.parseMetadata);
assert('.xlsx real: el legajo numérico llega como texto', plX.parsedRows[0].legajo === '1');
const rX = runSaldoVacaciones(pv.parsedRows, [], {
  legajoKeyMode: 'sin_ceros', liquidacionesRows: plX.parsedRows, liquidacionesMeta: plX.parseMetadata,
});
assert('.xlsx real: genera las mismas filas que con el HTML',
  !rX.error && JSON.stringify(rX.filas) === JSON.stringify(r.filas), rX.error);

// ── 6. El .xlsx que se descarga ──────────────────────────────────────────────

const wbOut = armarLibroSaldoVac(ExcelJS, r);
const buf = await wbOut.xlsx.writeBuffer();
const leido = new ExcelJS.Workbook();
await leido.xlsx.load(buf);
const ws = leido.worksheets[0];
const celda = (a) => ws.getCell(a);

assert('dos hojas: Vac_Liq_<Mes>_<AAAA> y Notas', leido.worksheets.map(w => w.name).join() === 'Vac_Liq_Septiembre_2026,Notas');
assert('fila 1: los títulos van en E..J, con el doble espacio literal de "en el  mes"',
  celda('E1').value === 'Saldo acumulado al mes' && celda('F1').value === 'Valor de la Provision del mes'
  && celda('G1').value === 'Dias de Vac que corresponden' && celda('H1').value === 'Dias de Vac Liquidadas en el  mes'
  && celda('I1').value === 'Dias de Vac en la baja' && celda('J1').value === 'Concepto 3553'
  && celda('A1').value === null && celda('K1').value === null);
assert('fila 1: amarillo en E..J y sólo ahí',
  ['E', 'F', 'G', 'H', 'I', 'J'].every(c => celda(`${c}1`).fill?.fgColor?.argb === 'FFFFFF00')
  && !celda('D1').fill?.fgColor?.argb && !celda('K1').fill?.fgColor?.argb);
assert('fila 2: los encabezados del modelo',
  ['Legajo', 'NOMBRE', 'FECHA_ALTA', 'Fecha_baja', 'Saldo_vacaciones', 'Prov_vac', 'VAC_A_DIC', 'Vac_Liq_en_el_MES',
    'Vac_Proporcionales_(Baja)', '3553_Vacaciones', 'Observaciones'].every((h, i) => ws.getRow(2).getCell(i + 1).value === h));
assert('datos desde la fila 3, una por legajo, SIN fila de total', ws.rowCount === 2 + r.filas.length && celda('A3').value === 1);
assert('Legajo es número; NOMBRE es texto', typeof celda('A3').value === 'number' && celda('B3').value === 'SANGUINETTI, JAVIER');
assert('FECHA_ALTA es una fecha real de Excel con el formato de fecha', celda('C3').value instanceof Date
  && celda('C3').value.toISOString().slice(0, 10) === '2015-03-01' && celda('C3').numFmt === 'mm-dd-yy', celda('C3').numFmt);
assert('Fecha_baja vacía queda sin valor; con dato es fecha con el mismo formato',
  celda('D3').value === null && celda('D4').value instanceof Date && celda('D4').numFmt === 'mm-dd-yy');
assert('Saldo_vacaciones con formato 0.00; Prov_vac y 3553 con #,##0.00',
  celda('E3').numFmt === '0.00' && celda('F3').numFmt === '#,##0.00' && celda('J3').numFmt === '#,##0.00');
assert('VAC_A_DIC, Vac_Liq y Vac_Proporcionales van sin formato (General)',
  !celda('G3').numFmt && !celda('H3').numFmt && !celda('I3').numFmt);
assert('los valores son números, no fórmulas', typeof celda('F3').value === 'number' && celda('F3').value === 1500 && typeof celda('J3').value === 'number');
assert('un dato que no existe queda VACÍO, no 0 (legajo sólo en Liquidaciones: alta, VAC_A_DIC, Saldo)',
  celda('C5').value === null && celda('E5').value === null && celda('F5').value === null && celda('G5').value === null && celda('H5').value === null);
assert('y lo que el pedido define en 0, sale en 0 (baja sin 503310)', celda('I3').value === 0 && celda('J3').value === 0);
assert('anchos de columna del modelo', [6.33203125, 25.5546875, 11.44140625, 11.109375, 23.109375, 26.88671875, 28.109375, 31.109375,
  25.33203125, 16.33203125, 45].every((w, i) => Math.abs(ws.getColumn(i + 1).width - w) < 1e-6));
assert('fuente del modelo (Aptos Narrow 11)', celda('B3').font?.name === 'Aptos Narrow' && celda('B3').font?.size === 11);
assert('observaciones en la última columna', celda('K6').value === 'Sin provisión en Liquidaciones.');

const notas = leido.worksheets[1];
const textoNotas = []; notas.eachRow(rw => textoNotas.push(`${rw.getCell(1).value ?? ''} | ${rw.getCell(2).value ?? ''}`));
const todo = textoNotas.join('\n');
assert('Notas: nombra los archivos de origen', todo.includes('Vacaciones.prueba.xls') && todo.includes('Liquidaciones.prueba.xls'));
assert('Notas: una línea por cada columna del mapeo',
  ['Legajo', 'NOMBRE', 'FECHA_ALTA', 'Fecha_baja', 'Saldo_vacaciones', 'Prov_vac', 'VAC_A_DIC', 'Vac_Liq_en_el_MES',
    'Vac_Proporcionales_(Baja)', '3553_Vacaciones'].every(c => textoNotas.some(l => l.startsWith(`${c} |`))));
assert('Notas: los dos pendientes (altas del mes y bajas)', todo.includes('1. Altas del mes') && todo.includes('2. Bajas'));
assert('Notas: sin nombres de personas',
  !/SANGUINETTI|ALBELLA|FALCIONI|URZI|CARRANZA/.test(todo));
assert('Notas: anchos 32 y 90', notas.getColumn(1).width === 32 && notas.getColumn(2).width === 90);

// ── 7. summarize y registry ──────────────────────────────────────────────────

const s = summarizeSaldoVacaciones(r);
assert('summarize: genera un archivo, no cruza: status info, sin unidad', s.status === 'info' && s.unit === null && s.unitsTotal === null);
assert('summarize: publica `resumen` con la declaración explícita de qué no aplica', !!s.resumen && s.resumen.unit === null);
assert('summarize: los avisos (altas, bajas, sin provisión) salen como insights', s.insights.length === 3, s.insights);
assert('summarize: un error se propaga como error', summarizeSaldoVacaciones({ error: 'x' }).status === 'error');

const reg = CONTROL_REGISTRY.saldo_vacaciones;
assert('registry: existe, sin Tabulado, con los dos archivos en orden (el primero es el primario)',
  reg && reg.tabRequired === false && reg.additionalFiles.map(f => f.key).join() === 'vacaciones,liquidaciones'
  && reg.additionalFiles[0].fileType === 'vacaciones_axton_file' && reg.additionalFiles[1].fileType === 'liquidaciones_vac_file');
assert('registry: es un "Generar Reporte" de su propio grupo',
  reg.group.mode === 'Generar Reporte' && reg.group.id === 'saldo_vacaciones' && reg.group.primary === true);
assert('registry: scope "cliente", sólo COTY', reg.scope === 'cliente' && reg.scopeMeta.clients.join() === 'COTY');
const coty = { code: 'COTY', sourceSystem: 'axton', ccts: [], attributes: {} };
const otroAxton = { code: 'OTRO', sourceSystem: 'axton', ccts: [], attributes: {} };
assert('se le ofrece a COTY', filterControlsForClient(Object.values(CONTROL_REGISTRY), coty).some(c => c.id === 'saldo_vacaciones'));
assert('no se le ofrece a otro cliente de Axton',
  !filterControlsForClient(Object.values(CONTROL_REGISTRY), otroAxton).some(c => c.id === 'saldo_vacaciones'));
assert('fichas de los dos tipos de archivo declaradas, con sigla y sin columnas que mapear',
  ['vacaciones_axton_file', 'liquidaciones_vac_file'].every(ft => FILE_TYPES[ft] && FILE_TYPES[ft].fields.length === 0
    && FILE_TYPES[ft].autoDetect === null && FILE_TYPES[ft].siglas.length > 0));
assert('la ficha de Liquidaciones informa el período que leyó',
  FILE_TYPES.liquidaciones_vac_file.meta(pl.parseMetadata).includes('09/2026'));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
