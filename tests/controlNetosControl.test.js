// controlNetosControl.test.js — Test del Control de Netos (Sportline)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/controlNetosControl.test.js
//
// El control rearma el recibo teórico de cada legajo y verifica que el neto
// liquidado coincida una vez descontados los conceptos del mes. Lo que se
// afirma acá es lo que salió de verificar el armado manual contra la
// liquidación real de 05/2026, donde 5 de 22 legajos no cerraban:
//
//   · el 2% extra del afiliado al sindicato entra en el recibo teórico;
//   · el tope de la base de aportes también, y sin él esos legajos dan diferencia;
//   · consolidar por legajo las liquidaciones múltiples (el bug de D-042);
//   · el acuerdo no remunerativo del mes no se asume cero: bloquea con un error.
//
// Datos 100% inventados (legajos '1'/'2', importes redondos elegidos para que la
// cuenta se pueda seguir a mano).

globalThis.document = { addEventListener: () => {} };

const { runControlNetos, summarizeControlNetos, DEFAULT_NETOS_CONFIG } =
  await import('./js/controls/controlNetos.js');
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { categoriaKey } = await import('./js/parsers/escalaComercioParser.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── Punto de integración ─────────────────────────────────────────────────────

const entry = CONTROL_REGISTRY.control_netos;
assert('el control está en el registry', !!entry);
assert('pide el Tabulado como archivo pivote', entry.tabRequired === true);
assert('el primer archivo adicional es la escala del convenio',
  entry.additionalFiles[0].key === 'escala'
  && entry.additionalFiles[0].fileType === 'escala_comercio_file');
assert('los Tabulados 2 y 3 son opcionales',
  entry.additionalFiles[1].optional === true && entry.additionalFiles[2].optional === true);
assert('se ofrece sólo a Sportline',
  entry.scope === 'cliente' && entry.scopeMeta.clients.includes('SPORTLINE'));
assert('la config declara mappingKey (si no, el control nunca la ve)',
  entry.config[0].mappingKey === 'netosConfig');

// El panel lateral muestra unos "Umbrales" que hoy ningún control lee. Este
// control mide con su propia tolerancia, así que apaga ese bloque y dice de
// dónde sale el número — sin esto la pantalla muestra "$ 1,00" al lado de un
// control configurado en otra cifra, y no hay forma de saber cuál mandó.
assert('declara que mide con su propia tolerancia, para apagar el panel de Umbrales',
  typeof entry.ownThresholdNote === 'string' && entry.ownThresholdNote.length > 0);
assert('esa nota dice dónde se edita la tolerancia',
  entry.ownThresholdNote.includes('tolerancia'));

// ── Armado de un caso ────────────────────────────────────────────────────────
//
// Un legajo con 10 años de antigüedad, básico 1.000.000 y AFA 200.000:
//   base         = 1.200.000
//   antigüedad   = 1.200.000 × 1% × 10        = 120.000
//   presentismo  = 1.320.000 × 8,33%          = 109.956
//   remunerativo = 1.429.956
//   NR acuerdo   = 100.000 + 10.000 + 9.163   = 119.163
//   retenciones  = 1.429.956 × 17% + 1.549.119 × 2,5% = 243.092,52 + 38.727,98 = 281.820,49
//   neto teórico = 1.429.956 + 119.163 − 281.820,49 = 1.267.298,51

const CFG = { noRemuAcuerdo: 120000, topeBaseImponible: null, tolerancia: 1 };

const escalaRows = [
  { codCategoria: 1, categoria: 'Vendedor B', categoriaKey: categoriaKey('Vendedor B'),
    basicos: { 'Basico mayo': 1000000, 'Basico abril': 980000 } },
];

const mapping = {
  tab: { empleadoColumn: 'ID_EMPLEADO', apellidoNombreColumn: 'APELLIDO Y NOMBRE' },
  netosConfig: CFG,
};

/** Una fila de Tabulado con los importes que se le pasen. */
function fila(legajo, extra = {}) {
  return {
    ID_EMPLEADO: legajo,
    'APELLIDO Y NOMBRE': 'Perez Juan',
    CATEGORIA: 'Vendedor B',
    OBRA_SOCIAL: '3009',
    '1003-SUELDO': 1000000,
    '1017-A_CTA_FUT_AUMEN': 200000,
    '1050-ANIOS_ANTI': 10,
    '3513-COMP_ANTIGUEDAD': 120000,
    '1011-PRESENTISMO': 109956,
    '678-AFILIADO_PORC': 0,
    '4567-INCRE_ADO_ABR26_NO': 100000,
    '4569-RECOM_ADO_ABR26_NO': 20000,
    '4615-ANT_ADO_NOS_ADIC': 12000,
    '4613-PRES_ADO_NOS_ADIC': 10995.60,
    '6005-TOT_JUB': 157295.16,
    '8536-FAECYS': 7745.60,
    '8520-RET_VOL': 0,
    NETO: 0,
    ...extra,
  };
}

// El neto que le corresponde a esa estructura, calculado con las mismas tasas.
const BASE_CFG = DEFAULT_NETOS_CONFIG();
const T = BASE_CFG.tasas;
const p = (v) => v / 100;
const PRES = p(BASE_CFG.presentismo);
const REMU_TEO   = 1200000 + 120000 + (1320000 * PRES);
const NR_TEO     = 120000 + 12000 + (132000 * PRES);
const TASA_AP    = p(T.jubilacion) + p(T.ley19032) + p(T.obraSocial) + p(T.anssal);
const TASA_GREM  = p(T.sindicato) + p(T.faecys);
const NETO_TEO   = REMU_TEO + NR_TEO
  - (REMU_TEO * TASA_AP + (REMU_TEO + NR_TEO) * TASA_GREM);

// ── Coincidencia total → sin diferencias ─────────────────────────────────────

const rOk = runControlNetos(escalaRows, [fila('1', { NETO: NETO_TEO })], mapping);
assert('coincidencia total: un legajo controlado', rOk.rows.length === 1);
assert('coincidencia total: residuo en cero', Math.abs(rOk.rows[0].residuo) < 0.01);
assert('coincidencia total: summarize da success', summarizeControlNetos(rOk).status === 'success');
// La tarjeta colapsada pinta cada insight como `{ type, label, value }`: un
// string suelto sale en pantalla como "undefined undefined".
const insightsOk = summarizeControlNetos(rOk).insights;
assert('los insights tienen la forma que pinta la tarjeta (type/label/value)',
  insightsOk.length > 0 && insightsOk.every(i =>
    typeof i === 'object' && typeof i.type === 'string'
    && typeof i.label === 'string' && i.value !== undefined));

assert('coincidencia total: el semáforo cuenta en legajos',
  summarizeControlNetos(rOk).unit === 'legajo' && summarizeControlNetos(rOk).unitsTotal === 1);
assert('coincidencia total: el básico coincide con la escala del convenio',
  rOk.rows[0].escalaOk === true && rOk.rows[0].escalaMatch === 'Basico mayo');

// ── Una diferencia conocida → sale marcada ───────────────────────────────────

const rDif = runControlNetos(escalaRows, [fila('1', { NETO: NETO_TEO - 5000 })], mapping);
assert('diferencia de 5.000: queda sin explicar', Math.abs(rDif.rows[0].residuo + 5000) < 0.01);
assert('diferencia de 5.000: unitsWithDiff > 0', summarizeControlNetos(rDif).unitsWithDiff === 1);

// ── El 2% extra del afiliado al sindicato ────────────────────────────────────
//
// Al afiliado se le retiene dos veces el 2% sobre la misma base: una como cuota
// sindical (que el modelo ya contemplaba) y otra como retención voluntaria (que
// no). Sin reconocerla, el neto liquidado da más bajo que el teórico por
// exactamente ese importe — que es lo que le pasaba a 4 de los 22 legajos reales.

const extra2Pct  = (REMU_TEO + NR_TEO) * p(T.afiliadoExtra);
const netoAfil   = NETO_TEO - extra2Pct;
const rAfiliado  = runControlNetos(escalaRows, [fila('1', {
  '678-AFILIADO_PORC': 2,
  '8520-RET_VOL': extra2Pct,
  NETO: netoAfil,
})], mapping);
assert('afiliado: el 2% extra entra en el recibo teórico y el legajo cierra',
  Math.abs(rAfiliado.rows[0].residuo) < 0.01);
assert('afiliado: el neto teórico baja en ese 2%',
  Math.abs(rAfiliado.rows[0].netoTeorico - netoAfil) < 0.01);

// ── El tope de la base de aportes ────────────────────────────────────────────
//
// Con la base remunerativa por encima del tope, los cuatro aportes se calculan
// sobre el tope y no sobre el total; sindicato y FAECYS no topean. El excedente
// no aportó, así que el neto liquidado queda MÁS ALTO que el teórico sin tope.

const TOPE = 1300000;
const excedente = REMU_TEO - TOPE;
const netoConTope = NETO_TEO + excedente * TASA_AP;

const filaTopeada = fila('1', { NETO: netoConTope, '6005-TOT_JUB': TOPE * p(T.jubilacion) });
const rSinTope = runControlNetos(escalaRows, [filaTopeada], mapping);
assert('sin declarar el tope: el legajo da diferencia',
  Math.abs(rSinTope.rows[0].residuo) > 1);
assert('sin declarar el tope: se detecta del archivo y se avisa',
  rSinTope.avisos.some(a => a.includes('tope')));

const rConTope = runControlNetos(escalaRows, [filaTopeada],
  { ...mapping, netosConfig: { ...CFG, topeBaseImponible: TOPE } });
assert('con el tope declarado: el legajo cierra',
  Math.abs(rConTope.rows[0].residuo) < 0.01);
assert('con el tope declarado: se informa cuál se usó', rConTope.topeUsado === TOPE);

// ── Un legajo con DOS liquidaciones (mensual + baja) ─────────────────────────
//
// El Tabulado trae una fila por liquidación, no por empleado. Sin consolidar,
// la última liquidación pisa a la anterior y sale una diferencia falsa. Es el
// bug que ya se arregló cuatro veces por separado (D-042).

const rDoble = runControlNetos(escalaRows, [
  { ...fila('1'), '1003-SUELDO': 600000, '1017-A_CTA_FUT_AUMEN': 120000,
    '3513-COMP_ANTIGUEDAD': 72000, '1011-PRESENTISMO': 109956 * 0.6, NETO: NETO_TEO * 0.6 },
  { ...fila('1'), '1003-SUELDO': 400000, '1017-A_CTA_FUT_AUMEN': 80000,
    '3513-COMP_ANTIGUEDAD': 48000, '1011-PRESENTISMO': 109956 * 0.4,
    '4567-INCRE_ADO_ABR26_NO': 0, '4569-RECOM_ADO_ABR26_NO': 0,
    '4615-ANT_ADO_NOS_ADIC': 0, '4613-PRES_ADO_NOS_ADIC': 0,
    NETO: NETO_TEO * 0.4 },
], mapping);
assert('dos liquidaciones: se cuentan como UN legajo', rDoble.rows.length === 1);
assert('dos liquidaciones: la base se suma, no se pisa',
  Math.abs(rDoble.rows[0].base - 1200000) < 0.01);
assert('dos liquidaciones: el neto liquidado se suma',
  Math.abs(rDoble.rows[0].netoLiquidado - NETO_TEO) < 0.01);
assert('dos liquidaciones: el legajo cierra igual que con una sola',
  Math.abs(rDoble.rows[0].residuo) < 0.01);

// ── Descuentos que se devuelven al neto ──────────────────────────────────────
//
// Anticipo, ganancias, retención alimentaria, retención judicial, préstamo e
// impuesto adicional de obra social no hacen al neto acordado: se suman de
// vuelta. Los sindicales no (confirmado por Willy, 2026-08-19).

const rDevuelve = runControlNetos(escalaRows, [fila('1', {
  '8500-ANTICIPO': 300000,
  '5010-IMPUESTO': 50000,
  '8540-RET_JUDIC': 20000,
  NETO: NETO_TEO - 370000,
})], mapping);
assert('anticipo, ganancias y retención judicial vuelven al neto',
  Math.abs(rDevuelve.rows[0].residuo) < 0.01);
assert('el importe devuelto se informa', Math.abs(rDevuelve.rows[0].devuelto - 370000) < 0.01);

// ── Conceptos del mes que explican la diferencia ─────────────────────────────
//
// Un plus feriado remunerativo sube el neto en lo que queda después de aportes.
// El control tiene que reconocerlo sin que nadie lo declare en una lista de
// "conceptos perdonados": alcanza con que esté liquidado.

const feriado = 20000;
const presentismoDelFeriado = feriado * PRES;
const rFeriado = runControlNetos(escalaRows, [fila('1', {
  '4096-DTO_FERIADO': feriado,
  '1011-PRESENTISMO': 109956 + presentismoDelFeriado,
  NETO: NETO_TEO + (feriado + presentismoDelFeriado) * (1 - TASA_AP - TASA_GREM),
})], mapping);
assert('un feriado del mes queda explicado, no marcado',
  Math.abs(rFeriado.rows[0].residuo) < 0.01);
assert('el feriado aparece en el detalle con su código',
  rFeriado.rows[0].detalle.some(d => d.code === '4096' && Math.abs(d.importe - feriado) < 0.01));

// ── Básico fuera de la escala del convenio ───────────────────────────────────

const rEscala = runControlNetos(escalaRows, [fila('1', {
  '1003-SUELDO': 999999, NETO: NETO_TEO,
})], mapping);
assert('un básico que no está en ninguna columna de la escala se marca',
  rEscala.rows[0].escalaOk === false);
assert('el básico fuera de escala baja el status a warning',
  summarizeControlNetos(rEscala).status === 'warning');

// ── Ramas de error ───────────────────────────────────────────────────────────

const rSinNr = runControlNetos(escalaRows, [fila('1')], { tab: { empleadoColumn: 'ID_EMPLEADO' } });
assert('sin el acuerdo no remunerativo del mes: corta con un error, no asume cero',
  !!rSinNr.error && rSinNr.error.includes('no remunerativo'));
assert('ese error llega a la tarjeta como status error',
  summarizeControlNetos(rSinNr).status === 'error');

const rSinTab = runControlNetos(escalaRows, [], mapping);
assert('sin Tabulado: corta con un error', !!rSinTab.error);

const rSinLegajo = runControlNetos(escalaRows, [fila('1')], { netosConfig: CFG, tab: {} });
assert('sin columna de legajo: corta con un error', !!rSinLegajo.error);

// ── Avisos que no pueden faltar ──────────────────────────────────────────────

assert('avisa cuántas empresas del grupo se controlaron',
  rOk.avisos.some(a => a.includes('Se controló 1 empresa de las 3')));
assert('avisa si no llegó la escala',
  runControlNetos([], [fila('1', { NETO: NETO_TEO })], mapping)
    .avisos.some(a => a.includes('escala salarial')));

// ── El Tabulado del mes anterior (opcional, por ahora informativo) ───────────
//
// Cuando se sube, se calcula el MISMO recibo teórico sobre el mes pasado y se
// informa cuánto se movió el neto de acuerdo. Todavía no marca diferencia ni
// pinta el semáforo: falta definir cuánto movimiento es normal (cumplir un año
// de antigüedad lo mueve de forma legítima).

const rSinPrev = runControlNetos(escalaRows, [fila('1', { NETO: NETO_TEO })], mapping);
assert('sin el mes anterior: la variación es null, no cero',
  rSinPrev.rows[0].variacionMes === null && rSinPrev.rows[0].netoTeoricoPrev === null);
assert('sin el mes anterior: se avisa que no se comparó',
  rSinPrev.avisos.some(a => a.includes('mes anterior')));

// El mes pasado el mismo legajo tenía un año menos de antigüedad.
const prevRows = [fila('1', { '1050-ANIOS_ANTI': 9, NETO: NETO_TEO })];
const rConPrev = runControlNetos(escalaRows, [fila('1', { NETO: NETO_TEO })],
  { ...mapping, tab_prevRows: prevRows });
assert('con el mes anterior: se informa que lo tiene', rConPrev.tienePrev === true);
assert('con el mes anterior: la variación se calcula y no es cero',
  rConPrev.rows[0].variacionMes !== null && rConPrev.rows[0].variacionMes > 0);
assert('con el mes anterior: el neto teórico del mes pasado queda a la vista',
  rConPrev.rows[0].netoTeoricoPrev !== null
  && rConPrev.rows[0].netoTeoricoPrev < rConPrev.rows[0].netoTeorico);
assert('con el mes anterior: la variación NO cuenta como diferencia todavía',
  summarizeControlNetos(rConPrev).unitsWithDiff === 0
  && summarizeControlNetos(rConPrev).status === 'success');

// Un alta del mes no estaba el mes pasado: no hay con qué comparar, y eso es
// `null`, nunca cero.
const rAlta = runControlNetos(escalaRows, [fila('2', { NETO: NETO_TEO })],
  { ...mapping, tab_prevRows: prevRows });
assert('un legajo que no estaba el mes pasado: variación null, no cero',
  rAlta.rows[0].variacionMes === null);

// ── Legajo presente de un solo lado ──────────────────────────────────────────
//
// Un legajo del Tabulado cuya categoría no está en la escala se controla igual:
// el neto no depende de la escala, sólo la verificación del básico.

const rSinCat = runControlNetos(escalaRows, [fila('2', {
  CATEGORIA: 'Maestranza A', NETO: NETO_TEO,
})], mapping);
assert('categoría ausente de la escala: el neto se controla igual',
  Math.abs(rSinCat.rows[0].residuo) < 0.01);
assert('categoría ausente de la escala: no se marca como fuera de escala',
  rSinCat.rows[0].escalaOk === null);

// ── El nombre del empleado se lee del propio Tabulado ────────────────────────
//
// Willy: en el detalle del run no aparecía el nombre. La columna la trae el
// Tabulado (APELLIDO Y NOMBRE, o su typo APPELIDO en Finadiet/POF) y ya la
// mapea el Paso 1 — el control sólo tenía que usarla.

assert('el nombre sale de la columna que el analista mapeó',
  rOk.rows[0].nombre === 'Perez Juan');

const rSinMapeoNombre = runControlNetos(escalaRows, [fila('1', { NETO: NETO_TEO })],
  { tab: { empleadoColumn: 'ID_EMPLEADO' }, netosConfig: CFG });
assert('sin columna de nombre mapeada: vacío, no undefined ni un error',
  rSinMapeoNombre.rows[0].nombre === '');

// ── El nombre de la empresa lo pone el analista ──────────────────────────────
//
// Willy: "la empresa está tomando cualquier valor" — porque el Tabulado no
// trae una columna que diga de qué razón social es. Sin nombre cargado, cae a
// "Empresa 1" y no a un rótulo que no identifica a nadie ("Tabulado 1").

const rSinNombreEmpresa = runControlNetos(escalaRows, [fila('1', { NETO: NETO_TEO })], mapping);
assert('sin nombre de empresa cargado: cae a "Empresa 1", no a "Tabulado 1"',
  rSinNombreEmpresa.rows[0].empresa === 'Empresa 1');

const rConNombreEmpresa = runControlNetos(escalaRows, [fila('1', { NETO: NETO_TEO })],
  { ...mapping, netosConfig: { ...CFG, empresaLabels: { tab: 'IFSA' } } });
assert('con el nombre cargado: se usa tal cual',
  rConNombreEmpresa.rows[0].empresa === 'IFSA');

// ── La tolerancia del analista, no un margen fijo de $0,01 ───────────────────
//
// Willy pidió tres categorías: exacto al centavo, dentro del margen, y
// diferencia mayor. La pantalla las arma con `categoriaDe()`, que no se
// exporta — se prueba acá mirando cómo cae un residuo de prueba en las tres
// franjas, con la misma regla que usa `tableHtml()`.

function categoriaDe(residuo, tol) {
  if (residuo === null) return null;
  const abs = Math.abs(residuo);
  if (abs <= 0.01) return 'exacto';
  if (abs <= tol) return 'margen';
  return 'diferencia';
}
assert('residuo 0,00 con tolerancia 100: exacto', categoriaDe(0, 100) === 'exacto');
assert('residuo 0,79 con tolerancia 100: dentro del margen', categoriaDe(0.79, 100) === 'margen');
assert('residuo 150 con tolerancia 100: diferencia mayor', categoriaDe(150, 100) === 'diferencia');
assert('sin neto para comparar: ninguna de las tres', categoriaDe(null, 100) === null);

console.log(`\n${ok} ok, ${fail} fail`);
if (fail > 0) process.exit(1);
