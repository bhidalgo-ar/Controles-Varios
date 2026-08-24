// finadietAsientoControl.test.js — Control "Asiento de Remuneraciones" de FINADIET
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/finadietAsientoControl.test.js
//
// Datos 100% inventados. Las cuentas y centros que se usan son los de la semilla
// del módulo (que es una tabla contable del cliente, no datos de empleados); los
// importes y los conceptos son de mentira.
//
// Lo que este test fija, en orden de qué cuesta más caro si se rompe:
//   1. Un archivo del que no se puede clasificar NADA no sale "cierra" en verde
//      (el falso verde de D-043, acá aplicado al asiento).
//   2. Una fila sin centro de costo NO pierde su pata Patrimonial: el centro sólo
//      hace falta para las cuentas de Resultado.
//   3. Dos movimientos de la misma cuenta+centro se SUMAN, no se pisan — y el
//      centro matchea aunque venga con otra grafía ('Administración').
//   4. Una cuenta o un centro que no está en la tabla no se inventa: queda afuera,
//      se lista, y el descuadre resultante se informa.
//   5. La config del cliente REEMPLAZA a la semilla (D-035): lo que se ve en el
//      editor del Paso 2 es lo que corre.

globalThis.document = { addEventListener: () => {} };

import * as XLSX from './node_modules/xlsx/xlsx.mjs';
globalThis.XLSX = XLSX; // el parser usa el global XLSX (como en browser)

const {
  runFinadietAsiento,
  summarizeFinadietAsiento,
  textoACuentas,
  textoACentros,
  FINADIET_CUENTAS_SEED,
} = await import('./js/controls/finadietAsiento.js');

const { autoDetectFinadietAsientoMapping, parseFinadietAsiento } =
  await import('./js/parsers/finadietAsientoParser.js');

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { EXPORT_CONTRACTS } = await import('./js/exports/contracts.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fila ya parseada del excel de conceptos. */
function mov({ centro = 'ADMINISTRACION', importe, debe = null, haber = null, nro = '1010', concepto = 'Sueldo' }) {
  return {
    centro, importe,
    cuenta_debe: debe || '', cuenta_debe_nombre: '',
    cuenta_haber: haber || '', cuenta_haber_nombre: '',
    nro_concepto: nro, concepto,
  };
}

const run = (rows, config = null, period = '2026-07') =>
  runFinadietAsiento(rows, [], { period, finadietAsientoConfig: config });

const lineaDe = (results, cuenta) => results.asiento.bloques
  .flatMap(b => b.lineas.map(l => ({ ...l, grupo: b.label })))
  .find(l => l.cuenta === cuenta);

// ── 1 · Integración con el registry ───────────────────────────────────────────

const ctrl = CONTROL_REGISTRY.finadiet_asiento;
assert('el control está en el registry', !!ctrl);
assert('es de FINADIET y de nadie más',
  ctrl.scope === 'cliente' && ctrl.scopeMeta.clients.length === 1 && ctrl.scopeMeta.clients[0] === 'FINADIET');
assert('no pide el Tabulado (es un control de generación)', ctrl.tabRequired === false);
assert('pide un solo archivo, el de conceptos',
  ctrl.additionalFiles.length === 1
  && ctrl.additionalFiles[0].key === 'asiento_conceptos'
  && ctrl.additionalFiles[0].fileType === 'asiento_conceptos_file');
assert('tiene help con qué y cómo', !!ctrl.help?.what && Array.isArray(ctrl.help?.how) && ctrl.help.how.length > 0);
assert('entra en "Seleccionar todos" como variante primaria', ctrl.group?.primary === true);

// ── 2 · El asiento que cierra ─────────────────────────────────────────────────
// Un movimiento simple: sueldo al Debe de una cuenta de Resultado, mismo importe
// al Haber de una Patrimonial.

{
  const r = run([
    mov({ importe: 100000, debe: '521101', haber: '213111' }),
  ]);

  assert('cierra con un movimiento simple', r.cierra === true && r.diferencia === 0);
  assert('la cuenta de Resultado lleva el prefijo del centro (400)', !!lineaDe(r, '400.521101'));
  assert('la Patrimonial lleva prefijo 100, sin importar el centro', !!lineaDe(r, '100.213111'));
  assert('la Patrimonial se agrupa por su categoría', lineaDe(r, '100.213111').grupo === 'SUELDOS A PAGAR');
  assert('la de Resultado se agrupa por nombre de centro', lineaDe(r, '400.521101').grupo === 'ADMINISTRACION');

  const s = summarizeFinadietAsiento(r);
  assert('summarize: success cuando cierra y no falta nada', s.status === 'success');
  assert('summarize: la unidad es la cuenta', s.unit === 'cuenta');
  assert('summarize: unitsTotal cuenta las líneas del asiento', s.unitsTotal === 2);
  assert('summarize: sin unidades con diferencia', s.unitsWithDiff === 0);
  assert('summarize: con el asiento cerrado no hay lado — diffSigned es null, no cero',
    s.resumen.diffSigned === null);
}

// ── 3 · Consolidación por cuenta + centro (y grafías del centro) ──────────────

{
  const r = run([
    mov({ importe: 100000, debe: '521101', haber: '213111' }),
    mov({ importe: 1000,   debe: '521101', haber: '213111', nro: '1012', concepto: 'Ajuste' }),
    mov({ importe: 500,    debe: '521101', haber: '213111', centro: 'Administración' }),
  ]);

  assert('dos movimientos de la misma cuenta+centro se SUMAN, no se pisan',
    lineaDe(r, '400.521101').debe === 101500);
  assert('el centro matchea con otra grafía (acentos y mayúsculas)',
    r.asiento.bloques.filter(b => b.tipo === 'centro').length === 1);
  assert('la Patrimonial acumula los tres movimientos', lineaDe(r, '100.213111').haber === 101500);
  assert('sigue cerrando después de consolidar', r.cierra === true);
}

// ── 4 · Patrimoniales consolidadas entre centros de costo ────────────────────

{
  const r = run([
    mov({ importe: 100, debe: '521101', haber: '213111', centro: 'ADMINISTRACION' }),
    mov({ importe: 200, debe: '521101', haber: '213111', centro: 'PRODUCCION - M.O.D.' }),
  ]);

  assert('cada centro tiene su propia línea de Resultado',
    lineaDe(r, '400.521101').debe === 100 && lineaDe(r, '441.521101').debe === 200);
  assert('la Patrimonial es UNA línea con los dos centros sumados',
    lineaDe(r, '100.213111').haber === 300);
  assert('los bloques de centro salen ordenados por código de centro',
    r.asiento.bloques[0].label === 'ADMINISTRACION' && r.asiento.bloques[1].label === 'PRODUCCION - M.O.D.');
}

// ── 5 · Fila sin centro de costo: la pata Patrimonial NO se pierde ───────────
// El prefijo de una cuenta de Resultado ES el código del centro, así que sin
// centro esa pata no se puede asentar. La Patrimonial no necesita centro para
// nada: descartar la fila entera (como hacía la herramienta standalone) le saca
// al asiento un importe que sí correspondía.

{
  const r = run([mov({ importe: 777, debe: '521101', haber: '213111', centro: '' })]);

  assert('la pata Patrimonial de una fila sin centro entra al asiento',
    lineaDe(r, '100.213111')?.haber === 777);
  assert('la pata de Resultado no entra y se cuenta', r.ladosSinCentro === 1);
  assert('no aparece ninguna cuenta de Resultado sin prefijo real',
    !r.asiento.bloques.some(b => b.lineas.some(l => l.cuenta.startsWith('undefined')
      || l.cuenta.startsWith('null') || l.cuenta.startsWith('.'))));
  assert('el asiento no cierra y eso se informa', r.cierra === false);
  assert('summarize lo saca como insight',
    summarizeFinadietAsiento(r).insights.some(i => i.label.includes('sin centro de costo')));
}

// ── 6 · Nada se clasifica solo: cuenta y centro desconocidos ─────────────────

{
  const r = run([
    mov({ importe: 100, debe: '521101',  haber: '213111' }),
    mov({ importe: 333, debe: '999999',  haber: '213111', nro: '9999', concepto: 'Cuenta rara' }),
    mov({ importe: 555, debe: '521101',  haber: '213111', centro: 'CENTRO_QUE_NO_EXISTE' }),
  ]);

  assert('la cuenta desconocida se lista con su código',
    r.sinClasificar.cuentas.length === 1 && r.sinClasificar.cuentas[0].codigo === '999999');
  assert('el centro desconocido se lista con su nombre',
    r.sinClasificar.centros.length === 1 && r.sinClasificar.centros[0].nombre === 'CENTRO_QUE_NO_EXISTE');
  assert('la cuenta desconocida NO se inventa como línea del asiento',
    !r.asiento.bloques.some(b => b.lineas.some(l => l.cuenta.includes('999999'))));
  assert('la pata que SÍ resolvió de esas filas entra igual (por eso el asiento no cierra)',
    lineaDe(r, '100.213111').haber === 988 && r.cierra === false);

  const s = summarizeFinadietAsiento(r);
  assert('summarize: warning, no success', s.status === 'warning');
  assert('summarize: lo sin clasificar suma a unitsTotal y a unitsWithDiff',
    s.unitsTotal === 4 && s.unitsWithDiff === 4);
}

// ── 7 · El falso verde: un archivo del que no se clasifica NADA ──────────────
// Con el asiento vacío, Debe y Haber dan 0 y "cierran". Ese es el falso verde que
// D-043 mató en Brutos/GS Pers: acá tiene que ser un error, no un ✓ verde.

{
  const r = run([
    mov({ importe: 100, debe: '111111', haber: '222222' }),
    mov({ importe: 200, debe: '333333', haber: '444444' }),
  ]);

  assert('un archivo sin ninguna cuenta clasificable devuelve error, no un asiento vacío', !!r.error);
  assert('el error nombra los códigos que no reconoció', r.error.includes('111111'));
  assert('summarize de ese error es status error (rojo en las 4 pantallas)',
    summarizeFinadietAsiento(r).status === 'error');
  assert('sin archivo también corta con error', !!run([]).error);
}

// ── 8 · Tolerancia: un centavo de descuadre ES un descuadre ─────────────────

{
  const r = run([
    mov({ importe: 100.00, debe: '521101', haber: null }),
    mov({ importe: 99.98,  debe: null,     haber: '213111' }),
  ]);
  assert('2 centavos de diferencia NO cierran', r.cierra === false && r.diferencia === 0.02);

  // El signo del tablero del Resumen (§4 de specs/vista-estandar-resumen.md): el
  // saldo de CADA cuenta cae del lado que le toca. Acá 521101 quedó sólo con
  // Debe y 213111 sólo con Haber, así que uno va a cada lado con su importe.
  const sd = summarizeFinadietAsiento(r).resumen.diffSigned;
  assert('diffSigned: la cuenta con Debe solo cae en "Debe > Haber" con su importe',
    sd.over.label === 'Debe > Haber' && sd.over.units === 1 && sd.over.amount === 100);
  assert('diffSigned: la cuenta con Haber solo cae en "Haber > Debe" con su importe',
    sd.under.label === 'Haber > Debe' && sd.under.units === 1 && sd.under.amount === 99.98);

  // Y el espejo: dando vuelta los importes, se dan vuelta los lados. Es lo que
  // prueba que el signo se lee del saldo de cada cuenta y no está cableado.
  const espejo = summarizeFinadietAsiento(run([
    mov({ importe: 99.98,  debe: '521101', haber: null }),
    mov({ importe: 100.00, debe: null,     haber: '213111' }),
  ])).resumen.diffSigned;
  assert('diffSigned: el caso espejo intercambia los importes entre los dos lados',
    espejo.over.amount === 99.98 && espejo.under.amount === 100);

  const r2 = run([
    mov({ importe: 100.00, debe: '521101', haber: null }),
    mov({ importe: 100.00, debe: null,     haber: '213111' }),
  ]);
  assert('un movimiento de un solo lado se asienta igual', r2.cierra === true);
}

// ── 9 · La config del cliente reemplaza a la semilla (D-035) ─────────────────

{
  const config = {
    cuentas: {
      '900001': { nombre: 'CUENTA NUEVA DEL CLIENTE', tipo: 'Resultado' },
      '900002': { nombre: 'OTRA A PAGAR', tipo: 'Patrimonial', categoria: 'NUEVA CATEGORÍA' },
    },
    centros: { 'DEPOSITO': 999 },
    ordenCategorias: ['NUEVA CATEGORÍA'],
    fechaEmision: '2026-08-01',
  };
  const r = run([mov({ importe: 50, debe: '900001', haber: '900002', centro: 'DEPOSITO' })], config);

  assert('una cuenta que sólo existe en la config del cliente se clasifica', r.cierra === true);
  assert('usa el centro de la config del cliente', !!lineaDe(r, '999.900001'));
  assert('usa la categoría de la config del cliente', lineaDe(r, '100.900002').grupo === 'NUEVA CATEGORÍA');
  assert('la fecha de emisión viaja al resultado', r.fechaEmision === '2026-08-01');

  // Con config guardada, la semilla ya NO aplica: una cuenta de la semilla que el
  // cliente sacó de su tabla tiene que quedar sin clasificar, no resucitar.
  const r2 = run([mov({ importe: 50, debe: '521101', haber: '900002', centro: 'DEPOSITO' })], config);
  assert('una cuenta de la semilla que no está en la config del cliente NO se usa',
    r2.sinClasificar.cuentas.some(c => c.codigo === '521101'));

  assert('sin config, la semilla sigue siendo la que corre',
    !!run([mov({ importe: 50, debe: '521101', haber: '213111' })]).cierra);
  assert('una tabla de cuentas vacía corta con error en vez de asentar nada',
    !!run([mov({ importe: 50, debe: '521101', haber: '213111' })], { cuentas: {} }).error);
}

// ── 10 · Solapas planas: una fila por cuenta + concepto ─────────────────────

{
  const r = run([
    mov({ importe: 100, debe: '521101', haber: '213111', nro: '1010', concepto: 'Sueldo' }),
    mov({ importe: 40,  debe: '521101', haber: '213111', nro: '1011', concepto: 'Horas Extras' }),
    mov({ importe: 60,  debe: '521101', haber: '213111', nro: '1010', concepto: 'Sueldo' }),
  ]);

  const cc = r.ctasPorCentro.rows.filter(x => x.cuenta === '400.521101');
  assert('dos conceptos de la misma cuenta van en filas separadas', cc.length === 2);
  assert('el mismo concepto repetido se consolida en una fila',
    cc.find(x => x.nro === '1010').debe === 160);
  assert('la solapa GRAL lleva el código de cuenta sin prefijo',
    r.ctasGral.rows.some(x => x.cuenta === '521101') && !r.ctasGral.rows.some(x => x.cuenta === '400.521101'));
  assert('los totales de las dos solapas planas coinciden',
    r.ctasPorCentro.totalDebe === r.ctasGral.totalDebe
    && r.ctasPorCentro.totalHaber === r.ctasGral.totalHaber);
  assert('el total de las solapas planas coincide con el del asiento',
    r.ctasPorCentro.totalDebe === r.asiento.totalDebe);
}

// ── 11 · Contratos de export (D-020: a Finanzas no van atributos de HR) ─────

for (const exportId of ['finadiet_asiento_cc', 'finadiet_asiento_gral']) {
  const c = EXPORT_CONTRACTS[exportId];
  assert(`${exportId}: existe el contrato`, !!c);
  assert(`${exportId}: audience finanzas (lo recibe Contaduría del cliente)`, c.audience === 'finanzas');
  assert(`${exportId}: ninguna columna es de un empleado`,
    !c.columns.some(col => /legajo|nombre|apellido|cuil|puesto/i.test(col.key)));
  assert(`${exportId}: las columnas de importe son num`,
    c.columns.filter(col => col.key === 'debe' || col.key === 'haber').every(col => col.type === 'num'));
}

// ── 12 · Editor de la tabla: nada se completa con un default silencioso ─────

{
  const { cuentas, errores } = textoACuentas(
    '521101\tSUELDOS\tResultado\n213111\tSUELDOS A PAGAR\tPatrimonial\tSUELDOS A PAGAR'
  );
  assert('el editor lee una tabla bien formada', Object.keys(cuentas).length === 2 && errores.length === 0);
  assert('lee el tipo y la categoría', cuentas['213111'].categoria === 'SUELDOS A PAGAR');

  assert('un tipo que no es Resultado/Patrimonial no se adivina: es error de línea',
    textoACuentas('999\tX\tOtroTipo').errores.length === 1);
  assert('una Patrimonial sin categoría es error de línea (no queda sin agrupar)',
    textoACuentas('999\tX\tPatrimonial').errores.length === 1);
  assert('un código repetido es error de línea',
    textoACuentas('999\tX\tResultado\n999\tY\tResultado').errores.length === 1);
  assert('una línea sin código es error de línea',
    textoACuentas('\tX\tResultado').errores.length === 1);
  assert('las líneas vacías se ignoran sin protestar',
    textoACuentas('\n\n521101\tX\tResultado\n\n').errores.length === 0);
  assert('acepta punto y coma además de TAB',
    Object.keys(textoACuentas('521101;SUELDOS;Resultado').cuentas).length === 1);

  assert('el editor de centros exige código numérico',
    textoACentros('ADMINISTRACION\tx').errores.length === 1);
  assert('el editor de centros lee nombre y código',
    textoACentros('ADMINISTRACION\t400').centros['ADMINISTRACION'] === 400);
  assert('un centro repetido es error de línea',
    textoACentros('A\t1\nA\t2').errores.length === 1);
}

// ── 13 · Parser: columnas por nombre, importes es-AR, filas descartadas ────

/** Arma el .xlsx con 3 filas de título arriba, como el export real de Meta4. */
function buildConceptosXlsx(headers, dataRows) {
  const aoa = [
    ['FINADIET S.A.'],
    ['CONCEPTOS LIQUIDADOS'],
    [],
    headers,
    ...dataRows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CONCEPTOS');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

{
  const headers = ['Centro de Costo', 'Nro', 'Concepto', 'Importe', 'Cuenta Debe', 'Código Debe', 'Cuenta Haber', 'Código Haber'];
  const buffer = buildConceptosXlsx(headers, [
    ['ADMINISTRACION', '1010', 'Sueldo',   '1.234,56', 'SUELDOS', '521101', 'SUELDOS A PAGAR', '213111'],
    ['ADMINISTRACION', '9000', 'BASEEXT',  '99999',    'BASE',    '888888', 'BASE',            '888888'],
    ['ADMINISTRACION', '9001', 'Vacía',    '',         '',        '',       '',                ''],
    ['ADMINISTRACION', '9002', 'Sin imp.', '',         'SUELDOS', '521101', 'SUELDOS A PAGAR', '213111'],
  ]);

  const mapping = autoDetectFinadietAsientoMapping(headers);
  assert('la auto-detección resuelve las 4 columnas requeridas',
    !!mapping && !!mapping.importeColumn && !!mapping.cuentaDebeColumn
    && !!mapping.cuentaHaberColumn && !!mapping.centroColumn);

  const { parsedRows, parseMetadata } = parseFinadietAsiento(buffer, mapping);
  assert('la fila de encabezados se ubica aunque no sea la primera', parseMetadata.headerRowIndex === 3);
  assert('queda una sola fila de movimiento real', parsedRows.length === 1);
  assert('el importe en texto es-AR se lee como 1234,56, no como 1,234',
    parsedRows[0].importe === 1234.56);
  assert('la fila con Debe == Haber se descarta y se cuenta', parseMetadata.descartadasIguales === 1);
  assert('la fila con los dos códigos vacíos se descarta y se cuenta', parseMetadata.descartadasSinCodigo === 1);
  assert('una fila con cuenta pero sin importe se descarta y se cuenta (null no es 0)',
    parseMetadata.descartadasSinImporte === 1);

  // El asiento armado sobre lo parseado cierra: es el camino completo del control.
  const r = run(parsedRows);
  assert('el asiento del archivo parseado cierra', r.cierra === true);
  assert('y usa el importe es-AR bien leído', r.asiento.totalDebe === 1234.56);
}

{
  // Sin mapeo no se adivina la columna: corta con un mensaje que dice qué falta.
  const headers = ['Centro de Costo', 'Importe', 'Código Debe', 'Código Haber'];
  const buffer = buildConceptosXlsx(headers, [['ADMINISTRACION', 1, '521101', '213111']]);
  let msg = '';
  try { parseFinadietAsiento(buffer, { importeColumn: 'Importe' }); } catch (e) { msg = e.message; }
  assert('sin mapeo completo, el parser corta diciendo qué columna falta',
    msg.includes('Código de cuenta Debe') && msg.includes('Centro de Costo'));

  // Un nombre de columna que no está en el archivo (perfil viejo) también corta,
  // listando los encabezados reales.
  msg = '';
  try {
    parseFinadietAsiento(buffer, {
      importeColumn: 'Importe Viejo', cuentaDebeColumn: 'Código Debe',
      cuentaHaberColumn: 'Código Haber', centroColumn: 'Centro de Costo',
    });
  } catch (e) { msg = e.message; }
  assert('una columna mapeada que ya no existe corta y lista los encabezados reales',
    msg.includes('Importe Viejo') && msg.includes('Centro de Costo'));

  // Un archivo que no es este reporte: nada de "0 filas y todo en orden".
  const otro = buildConceptosXlsx(['A', 'B', 'C', 'D', 'E'], [[1, 2, 3, 4, 5]]);
  msg = '';
  try { parseFinadietAsiento(otro, autoDetectFinadietAsientoMapping(['A', 'B', 'C', 'D', 'E']) || {}); }
  catch (e) { msg = e.message; }
  assert('un excel que no es el reporte de conceptos corta con error', msg.length > 0);
}

// ── 14 · La semilla es una tabla contable, no datos de empleados ────────────

assert('la semilla de cuentas tiene las 38 cuentas validadas con Gaby',
  Object.keys(FINADIET_CUENTAS_SEED).length === 38);
assert('toda cuenta Patrimonial de la semilla tiene categoría (si no, se agruparía sola)',
  Object.values(FINADIET_CUENTAS_SEED)
    .filter(c => c.tipo === 'Patrimonial')
    .every(c => !!c.categoria));
assert('toda cuenta de la semilla declara un tipo válido',
  Object.values(FINADIET_CUENTAS_SEED).every(c => c.tipo === 'Resultado' || c.tipo === 'Patrimonial'));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
