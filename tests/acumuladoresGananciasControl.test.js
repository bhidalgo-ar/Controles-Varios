// acumuladoresGananciasControl.test.js — Test del control "Acumuladores Ganancias" (Axton)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/acumuladoresGananciasControl.test.js
//
// Cubre las reglas de specs/control-acumuladores-ganancias.md: consolidación por
// legajo de las filas de mes (regresión del caso real de POP: dos liquidaciones
// del mismo acumulador se suman, no se duplican), la doceava parte (excluye SAC
// primera cuota y Retenciones, resta Excluye/jubilación/obra social/sindicato),
// el SAC teórico como suma de las doceavas de todos los meses subidos, la hoja
// DATOS armada SOLO con el crudo más nuevo (sin sumar crudos entre sí), el TOTAL
// de DATOS sin "Excluye del SAC teórico", la distinción null (sin dato) vs 0
// (dato real) y la validación de ventana RG 4003 / RG 4030.

// registry.js importa (transitivamente) módulos de UI que registran listeners a
// nivel de módulo — necesitan un `document` mínimo fuera del navegador.
globalThis.document = { addEventListener: () => {} };

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const ctrl = CONTROL_REGISTRY.acumuladores_ganancias;

// ── Registry ─────────────────────────────────────────────────────────────────

assert('el registry tiene la entrada "acumuladores_ganancias"', ctrl !== undefined);
assert('additionalFiles[0] es el archivo de Acumuladores (primaryRows)',
  ctrl.additionalFiles[0].key === 'acumuladores');
assert('el fileType del archivo es acumuladores_file',
  ctrl.additionalFiles[0].fileType === 'acumuladores_file');
assert('tabRequired es false (no usa el Tabulado)', ctrl.tabRequired === false);
assert('el scope es de sistema, para clientes Axton',
  ctrl.scope === 'sistema' && ctrl.scopeMeta.sourceSystems.includes('axton'));
assert('tiene help con what y how', typeof ctrl.help?.what === 'string' && Array.isArray(ctrl.help?.how));

// ── Datos de prueba (inventados) ──────────────────────────────────────────────
//
// Ventana RG 4030 procesando agosto: julio (07) + agosto (08), 2 crudos.
//   Legajo 1: caso "normal" — SUMA + mes en ambos meses.
//   Legajo 2: regresión de consolidación — DOS liquidaciones del mismo
//     acumulador (1100) en el mes de agosto, deben sumarse (no duplicarse).
//   Legajo 3: "sin movimiento en el mes" — tiene SUMA en agosto (está activo,
//     acumula) pero ninguna fila de mes ese período; sólo aporta doceava de julio.

function mkRow(period, legajo, nombre, nro, operacion, valor) {
  return {
    legajo, apellido_nombre: nombre, cuil: '', ingreso: null, egreso: null,
    nro, acumulador: '', operacion, valor, empresa: '',
    _period: period, _fileName: `repacumuladores.${period.replace('-', '')}01.000000.xlsx`,
  };
}

const rows = [
  // ── Legajo 1 ─────────────────────────────────────────────────────────────
  mkRow('2026-07', '1', 'SANGUINETTI JAVIER', 1100, '', 100000),
  mkRow('2026-07', '1', 'SANGUINETTI JAVIER', 1109, '', 5000),
  mkRow('2026-07', '1', 'SANGUINETTI JAVIER', 1120, '', 10000),
  mkRow('2026-07', '1', 'SANGUINETTI JAVIER', 1122, '', 3000),
  mkRow('2026-07', '1', 'SANGUINETTI JAVIER', 1121, '', 2000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1100, '', 110000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1120, '', 11000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1122, '', 3300),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1121, '', 2200),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1100, 'SUMA', 600000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1108, 'SUMA', 50000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1109, 'SUMA', 20000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1101, 'SUMA', 1000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1107, 'SUMA', 500),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1120, 'SUMA', 60000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1122, 'SUMA', 18000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1121, 'SUMA', 12000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1150, 'SUMA', 25000),
  mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1137, 'SUMA', 5000),

  // ── Legajo 2 — regresión de consolidación (dos liquidaciones, mismo nro) ──
  mkRow('2026-07', '2', 'FALCIONI JULIO', 1100, '', 50000),
  mkRow('2026-07', '2', 'FALCIONI JULIO', 1109, '', 2000),
  mkRow('2026-07', '2', 'FALCIONI JULIO', 1120, '', 5000),
  mkRow('2026-07', '2', 'FALCIONI JULIO', 1122, '', 1500),
  mkRow('2026-07', '2', 'FALCIONI JULIO', 1121, '', 1000),
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1100, '', 30000),   // liquidación 1
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1100, '', 20000),   // liquidación 2 — debe sumarse
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1120, '', 6000),
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1122, '', 1800),
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1121, '', 1200),
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1100, 'SUMA', 300000),
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1108, 'SUMA', 25000),
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1109, 'SUMA', 10000),
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1120, 'SUMA', 30000),
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1122, 'SUMA', 9000),
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1121, 'SUMA', 6000),
  mkRow('2026-08', '2', 'FALCIONI JULIO', 1150, 'SUMA', 12000),

  // ── Legajo 3 — sin movimiento en agosto (sólo SUMA ese mes) ───────────────
  mkRow('2026-07', '3', 'LUCCHETTI CRISTIAN', 1100, '', 80000),
  mkRow('2026-07', '3', 'LUCCHETTI CRISTIAN', 1120, '', 8000),
  mkRow('2026-07', '3', 'LUCCHETTI CRISTIAN', 1122, '', 2400),
  mkRow('2026-07', '3', 'LUCCHETTI CRISTIAN', 1121, '', 1600),
  mkRow('2026-08', '3', 'LUCCHETTI CRISTIAN', 1100, 'SUMA', 200000),
  mkRow('2026-08', '3', 'LUCCHETTI CRISTIAN', 1120, 'SUMA', 20000),
  mkRow('2026-08', '3', 'LUCCHETTI CRISTIAN', 1122, 'SUMA', 6000),
  mkRow('2026-08', '3', 'LUCCHETTI CRISTIAN', 1121, 'SUMA', 4000),
];

const results = ctrl.run(rows, [], { period: '2026-08' });

// ── Universo de legajos ──────────────────────────────────────────────────────

assert('run() no devuelve error con datos válidos', !results.error);
assert('el mes de proceso es el más nuevo (agosto)', results.mesProceso === '2026-08');
assert('la ventana detectada es julio + agosto', results.periods.join(',') === '2026-07,2026-08');
assert('DATOS tiene los 3 legajos', results.datos.rows.length === 3);
assert('MM-AAAA también lista los 3 (incluido el sin movimiento)', results.mes.rows.length === 3);

// ── Consolidación por legajo (regresión legajo 2) ────────────────────────────

const mes2 = results.mes.rows.find(r => r.legajo === '2');
assert('legajo 2: las dos liquidaciones de agosto se SUMAN (30000+20000=50000), no se duplican',
  mes2.brutoGanancias === 50000);

// ── Doceava parte (excluye SAC 1ra y Retenciones) ────────────────────────────

const mes1 = results.mes.rows.find(r => r.legajo === '1');
// doceava jul = (100000+5000-10000-3000-2000)/12 = 7500
// doceava ago = (110000-11000-3300-2200)/12 = 7791.666... = 7791.67
assert('legajo 1: SAC teórico = suma de las doceavas de julio (7500) y agosto (7791.67)',
  Math.abs(mes1.sacTeorico - 15291.67) < 0.01);

const mes2Full = results.mes.rows.find(r => r.legajo === '2');
// doceava jul = (50000+2000-5000-1500-1000)/12 = 3708.333 = 3708.33
// doceava ago = (50000-6000-1800-1200)/12 = 3416.666 = 3416.67
assert('legajo 2: SAC teórico = 3708.33 + 3416.67 = 7125.00',
  Math.abs(mes2Full.sacTeorico - 7125) < 0.01);

// ── "Sin movimiento en el mes" (legajo 3) ─────────────────────────────────────

const mes3 = results.mes.rows.find(r => r.legajo === '3');
assert('legajo 3 aparece en MM-AAAA con todos los conceptos del mes en null (sin movimiento)',
  mes3.brutoGanancias === null && mes3.retJubilacion === null);
assert('legajo 3: SAC teórico sólo cuenta la doceava de julio (5666.67) — agosto se excluye, no cuenta como cero',
  Math.abs(mes3.sacTeorico - 5666.67) < 0.01);

// ── DATOS: SOLO el crudo más nuevo, sin sumar crudos entre sí ────────────────

const datos1 = results.datos.rows.find(r => r.legajo === '1');
assert('DATOS legajo 1: bruto = SUMA(600000) + mes de agosto (110000) = 710000 — julio no se suma',
  datos1.brutoGanancias === 710000);
assert('DATOS legajo 1: TOTAL no incluye "Excluye del SAC teórico" (5000 quedan afuera)',
  datos1.total === 781500 && datos1.excluyeSac === 5000);
assert('DATOS legajo 1: jubilación/obra social/sindicato = SUMA + mes de agosto',
  datos1.retJubilacion === 71000 && datos1.retObraSocial === 21300 && datos1.retSindicato === 14200);
assert('DATOS legajo 1: IMPUESTO = Retenciones efectuadas acumuladas', datos1.impuesto === 25000);

const datos2 = results.datos.rows.find(r => r.legajo === '2');
assert('DATOS legajo 2: un acumulador ausente en SUMA y en mes da null, no 0',
  datos2.noRemGravado === null && datos2.retribNoHabit === null);
assert('DATOS legajo 2: TOTAL trata los ausentes (null) como 0 en la suma', datos2.total === 385000);

const datos3 = results.datos.rows.find(r => r.legajo === '3');
assert('DATOS legajo 3: sale del SUMA de agosto aunque no haya movimiento de mes', datos3.brutoGanancias === 200000);
assert('DATOS legajo 3: IMPUESTO ausente en todo el crudo da null', datos3.impuesto === null);

// ── Validación de ventana ─────────────────────────────────────────────────────

assert('con RG 4030 y julio+agosto presentes, no hay alertas de ventana', results.alerts.length === 0);

const rg4003 = ctrl.run(rows, [], { period: '2026-08', acumuladoresConfig: { regimen: 'RG4003' } });
assert('con RG 4003 (enero→agosto) faltan 6 meses: hay alerta', rg4003.alerts.some(a => /Faltan crudos/.test(a.text)));

const soloAgosto = ctrl.run(rows.filter(r => r._period === '2026-08'), [], { period: '2026-08' });
assert('con RG 4030 y sólo agosto subido, falta julio: hay alerta',
  soloAgosto.alerts.some(a => /Faltan crudos/.test(a.text)));

const conExtra = ctrl.run(
  [...rows, mkRow('2026-01', '1', 'SANGUINETTI JAVIER', 1100, '', 1000)],
  [], { period: '2026-08' }
);
assert('un archivo de enero fuera de la ventana RG 4030 (jul-ago) genera alerta de "fuera de la ventana"',
  conExtra.alerts.some(a => /fuera de la ventana/.test(a.text)));

// ── Override de códigos de acumulador ─────────────────────────────────────────

const rowsCodigoCustom = [
  mkRow('2026-08', '9', 'SILVA SANTIAGO', 9999, 'SUMA', 12345),
];
const conOverride = ctrl.run(rowsCodigoCustom, [], {
  period: '2026-08',
  acumuladoresConfig: { codigos: { brutoGanancias: 9999 } },
});
assert('con un código de Bruto para ganancias sobrescrito (9999), lo toma para DATOS',
  conOverride.datos.rows[0].brutoGanancias === 12345);

// ── Casos de error ────────────────────────────────────────────────────────────

assert('run() sin filas devuelve error', typeof ctrl.run([], [], { period: '2026-08' }).error === 'string');

const sinPeriodo = [{ ...mkRow('2026-08', '1', 'SANGUINETTI JAVIER', 1100, '', 1000), _period: null }];
assert('una fila sin período asignado devuelve error pidiendo completarlo',
  /per.odo/.test(ctrl.run(sinPeriodo, [], { period: '2026-08' }).error));

// ── summarize() ────────────────────────────────────────────────────────────────

const summary = ctrl.summarize(results);
assert('summarize() de un control de generación no tiene semáforo (status "info")', summary.status === 'info');
assert('summarize() no calcula unitsTotal/unitsWithDiff (no hay cruce)',
  summary.unit === null && summary.unitsTotal === null && summary.unitsWithDiff === null);

const summaryError = ctrl.summarize(ctrl.run([], [], { period: '2026-08' }));
assert('summarize() de un error devuelve status "error"', summaryError.status === 'error');

// ── Fase 1 — chequeos de pantalla (nunca tocan el .xlsx) ──────────────────────

assert('results.checks existe y trae reconciliation/issues/coherenceChecks',
  results.checks && Array.isArray(results.checks.issues) && Array.isArray(results.checks.coherenceChecks));
assert('con datos consistentes, la reconciliación cierra 100%',
  results.checks.reconciliation.ok === results.checks.reconciliation.total
  && results.checks.reconciliation.total === results.datos.rows.length);
assert('CUIL: legajo 1/2/3 (mkRow sin CUIL) salen como "casos para revisar"',
  results.checks.issues.filter(i => i.type === 'cuil').length === 3);
assert('legajo 3 (sin movimiento en agosto) sale como caso "sinMovimiento"',
  results.checks.issues.some(i => i.type === 'sinMovimiento' && i.legajo === '3'));
assert('legajo 1 y 2 (con movimiento) no salen como "sinMovimiento"',
  !results.checks.issues.some(i => i.type === 'sinMovimiento' && (i.legajo === '1' || i.legajo === '2')));

// CUIL presente para un legajo → no debe aparecer como caso "cuil".
const rowsConCuil = rows.map(r => r.legajo === '1' ? { ...r, cuil: '20-11111111-1' } : r);
const resultsConCuil = ctrl.run(rowsConCuil, [], { period: '2026-08' });
assert('con CUIL presente en TODAS las filas del legajo 1, no sale como caso "cuil"',
  !resultsConCuil.checks.issues.some(i => i.type === 'cuil' && i.legajo === '1'));

// ── SAC teórico: el chequeo central de este reporte ───────────────────────────
// Ver D-033: los chequeos de tope previsional y de tributación de Ganancias
// están replegados detrás de EXTRAS_GANANCIAS_HABILITADOS (apagado), así que no
// se testean acá. El foco es el SAC teórico.

assert('el chequeo de coherencia "SAC teórico calculado" va primero',
  results.checks.coherenceChecks[0]?.label === 'SAC teórico calculado');
assert('sacStats cuenta cuántos legajos tienen SAC teórico',
  results.checks.sacStats.total === results.mes.rows.length
  && results.checks.sacStats.calculados === 3);
assert('con los 3 legajos calculados, el chequeo del SAC teórico está ok',
  results.checks.coherenceChecks[0].ok === true
  && results.checks.coherenceChecks[0].detail === '3/3');

// No se pudo calcular: legajo 20 sólo tiene SUMA en agosto, ninguna fila de mes
// en ningún crudo → no hay doceava de dónde sacar el SAC teórico.
const rowsSinDoceava = [...rows, mkRow('2026-08', '20', 'SOLO SUMA', 1100, 'SUMA', 900000)];
const resultsSinDoceava = ctrl.run(rowsSinDoceava, [], { period: '2026-08' });
assert('un legajo sin ninguna fila de mes sale como "sacNoCalculado"',
  resultsSinDoceava.checks.issues.some(i => i.type === 'sacNoCalculado' && i.legajo === '20'));
assert('su SAC teórico queda en null (no en cero)',
  resultsSinDoceava.mes.rows.find(r => r.legajo === '20').sacTeorico === null);
assert('"sacNoCalculado" baja el contador del chequeo de coherencia',
  resultsSinDoceava.checks.coherenceChecks[0].ok === false
  && resultsSinDoceava.checks.coherenceChecks[0].detail === '3/4');

// Parcial: legajo 21 sólo liquidó en julio, le falta la doceava de un mes de la
// ventana. Se usa una ventana de 3 meses para que el mes faltante no sea el de
// proceso (ese caso ya lo cubre "sinMovimiento" y no se duplica).
const rowsParcial = [
  mkRow('2026-06', '21', 'ALTA TARDIA', 1100, '', 120000),
  mkRow('2026-08', '21', 'ALTA TARDIA', 1100, '', 120000),
  mkRow('2026-08', '21', 'ALTA TARDIA', 1100, 'SUMA', 240000),
  mkRow('2026-06', '22', 'COMPLETO', 1100, '', 100000),
  mkRow('2026-07', '22', 'COMPLETO', 1100, '', 100000),
  mkRow('2026-08', '22', 'COMPLETO', 1100, '', 100000),
  mkRow('2026-08', '22', 'COMPLETO', 1100, 'SUMA', 300000),
];
const resultsParcial = ctrl.run(rowsParcial, [], { period: '2026-08', acumuladoresConfig: { regimen: 'RG4003' } });
assert('un legajo sin doceava en un mes intermedio de la ventana sale como "sacParcial"',
  resultsParcial.checks.issues.some(i => i.type === 'sacParcial' && i.legajo === '21'));
assert('el aviso dice con cuántos meses de la ventana se armó',
  resultsParcial.checks.issues.some(i => i.type === 'sacParcial' && /2 de 3 meses/.test(i.what)));
assert('el legajo que liquidó todos los meses no sale como "sacParcial"',
  !resultsParcial.checks.issues.some(i => i.type === 'sacParcial' && i.legajo === '22'));

// Negativo: las deducciones del mes superan al gravado.
const rowsNegativo = [
  mkRow('2026-08', '30', 'NEGATIVO', 1100, '', 10000),
  mkRow('2026-08', '30', 'NEGATIVO', 1120, '', 50000),
  mkRow('2026-08', '30', 'NEGATIVO', 1100, 'SUMA', 10000),
];
const resultsNegativo = ctrl.run(rowsNegativo, [], { period: '2026-08' });
assert('un SAC teórico negativo sale como caso "sacNegativo"',
  resultsNegativo.checks.issues.some(i => i.type === 'sacNegativo' && i.legajo === '30'));

// Doceava atípica: un mes que se sale de la línea de los otros del mismo legajo.
const rowsAtipica = [
  mkRow('2026-07', '40', 'RETROACTIVO', 1100, '', 100000),
  mkRow('2026-08', '40', 'RETROACTIVO', 1100, '', 900000),
  mkRow('2026-08', '40', 'RETROACTIVO', 1100, 'SUMA', 1000000),
  mkRow('2026-07', '41', 'PAREJO', 1100, '', 100000),
  mkRow('2026-08', '41', 'PAREJO', 1100, '', 110000),
  mkRow('2026-08', '41', 'PAREJO', 1100, 'SUMA', 210000),
];
const resultsAtipica = ctrl.run(rowsAtipica, [], { period: '2026-08' });
assert('una doceava muy distinta de las otras del mismo legajo sale como "doceavaAtipica"',
  resultsAtipica.checks.issues.some(i => i.type === 'doceavaAtipica' && i.legajo === '40'));
assert('un legajo con doceavas parejas no sale como "doceavaAtipica"',
  !resultsAtipica.checks.issues.some(i => i.type === 'doceavaAtipica' && i.legajo === '41'));
assert('sale un solo aviso de doceava atípica por legajo',
  resultsAtipica.checks.issues.filter(i => i.type === 'doceavaAtipica' && i.legajo === '40').length === 1);

// Un solo caso de SAC teórico por legajo: el más grave gana.
assert('un legajo sin SAC teórico no acumula además el aviso de "parcial"',
  !resultsSinDoceava.checks.issues.some(i => i.type === 'sacParcial' && i.legajo === '20'));

// ── Extras replegados (D-033): no deben aparecer con el flag apagado ─────────
const resultsConTope = ctrl.run(rows, [], {
  period: '2026-08',
  acumuladoresConfig: { topeBaseImponible: 90000 },
});
assert('con los extras apagados, cargar una base imponible no genera casos de "tope"',
  !resultsConTope.checks.issues.some(i => i.type === 'tope'));
assert('con los extras apagados, no hay chequeos de coherencia de topes',
  !resultsConTope.checks.coherenceChecks.some(c => /bajo el tope/.test(c.label)));

const rowsPatron = [...rows, mkRow('2026-08', '10', 'ALTO SIN IMPUESTO', 1100, 'SUMA', 2000000)];
const resultsPatron = ctrl.run(rowsPatron, [], { period: '2026-08' });
assert('con los extras apagados, no se reportan casos de "fueraDePatron"',
  !resultsPatron.checks.issues.some(i => i.type === 'fueraDePatron'));

// ── on/off por chequeo ─────────────────────────────────────────────────────────
const resultsSinChecks = ctrl.run(rows, [], {
  period: '2026-08',
  acumuladoresConfig: { checksEnabled: { reconciliacion: false, cuil: false, sinMovimiento: false, sacTeorico: false } },
});
assert('con todos los chequeos apagados, no hay issues ni coherenceChecks',
  resultsSinChecks.checks.issues.length === 0 && resultsSinChecks.checks.coherenceChecks.length === 0);

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
