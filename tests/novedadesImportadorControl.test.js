// novedadesImportadorControl.test.js — El generador de importador de novedades (N1, D-070)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/novedadesImportadorControl.test.js
//
// Lo que este test fija, en orden de qué cuesta más caro si se rompe:
//   1. **Consolidación por legajo**: la planilla puede traer el mismo empleado
//      en dos filas y el importador tiene que SUMAR, no pisar. Es el bug más
//      caro del repo (D-042), y acá además el archivo generado se sube a Axton.
//   2. **Celda vacía ≠ 0**: lo que no está cargado no viaja al importador.
//   3. **El criollo no decide solo** (D-039): una columna sin código no entra
//      con un código adivinado — queda afuera con su motivo hasta que el
//      analista lo confirma en el Paso 2.
//   4. **Ida y vuelta**: el F2 que genera la app lo tiene que poder volver a
//      leer el propio lector ExpNov, con los mismos valores. Es el chequeo que
//      reemplaza, mientras no haya un F2 real en la máquina, a comparar contra
//      el archivo del cliente.
//
// Los datos son inventados —un export de cliente no entra al repo ni como
// fixture—; lo que se reproduce es la FORMA del archivo.

globalThis.document = { addEventListener: () => {} };

import * as XLSXmod from 'xlsx';
globalThis.XLSX = XLSXmod;

const { parseExpNov } = await import('./js/parsers/expNovParser.js');
const {
  runNovedadesImportador, summarizeNovedadesImportador,
  buildF2Aoa, celdaF2, normalizarRotulo, DEFAULT_NOVEDADES_CONFIG,
} = await import('./js/controls/novedadesImportador.js');
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { sugerirCodigo } = await import('./js/ui/novedadesImportadorConfigEditor.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

/** Arma un .xlsx en memoria a partir de filas crudas. */
function xlsxDe(aoa, sheetName = 'd  axFiles HidalgoExpNov_1132_2') {
  const wb = XLSXmod.utils.book_new();
  XLSXmod.utils.book_append_sheet(wb, XLSXmod.utils.aoa_to_sheet(aoa), sheetName);
  return XLSXmod.write(wb, { type: 'array', bookType: 'xlsx' });
}

/** Corre el control sobre una planilla, como lo hace el wizard. */
function correr(aoa, { config = {}, legajoKeyMode, period = '2026-07' } = {}) {
  const { parsedRows, parseMetadata } = parseExpNov(xlsxDe(aoa));
  return runNovedadesImportador(parsedRows, [], {
    period,
    legajoKeyMode,
    novedadesMeta: parseMetadata,
    novedadesConfig: { ...DEFAULT_NOVEDADES_CONFIG(), ...config },
  });
}

// ── 1. La entrada del registry ────────────────────────────────────────────────

{
  const ctrl = CONTROL_REGISTRY.novedades_importador;
  assert('el control está en el registry', !!ctrl);
  assert('no pide el Tabulado: arma un archivo, no cruza dos', ctrl.tabRequired === false);
  assert('pide la planilla de novedades como archivo primario',
    ctrl.additionalFiles[0].key === 'novedades'
    && ctrl.additionalFiles[0].fileType === 'novedades_axton_file');
  assert('es una variante "Generar Reporte" de su grupo',
    ctrl.group.id === 'novedades_importador' && ctrl.group.mode === 'Generar Reporte' && ctrl.group.primary === true);
  assert('ofrece el importador ya armado como archivo opcional para controlar lo generado',
    ctrl.additionalFiles[1].key === 'f2Armado'
    && ctrl.additionalFiles[1].fileType === 'f2_armado_file'
    && ctrl.additionalFiles[1].optional === true);
  assert('declara que no mide con el monto de diferencia del cliente: cierra al centavo (D-069)',
    typeof ctrl.ownTolerance?.note === 'string');
  assert('su config viaja al run() como novedadesConfig',
    ctrl.config[0].mappingKey === 'novedadesConfig');
}

// ── 2. Caso base: la planilla entra al importador ─────────────────────────────

const base = [
  ['Unidad Organizativa', '1132', 'PLANTA NORTE', '09/08/2024'],
  [null, null, null, 'Sueldo Basico', 'Horas Extras 50%', 'Premio'],
  ['Legajo', 'Apellido y Nombres', 'CUIL', '1000', '1100', '2500'],
  ['1', 'Perez', '(inventado)', '1$159811,7958', 8, null],
  ['2', 'Gomez', '(inventado)', '1$400', null, 0],
];

{
  const r = correr(base);
  assert('arma una fila por legajo', r.filas.length === 2);
  assert('la unidad organizativa sale del archivo cuando el archivo la trae',
    r.uo.nro === '1132' && r.uo.nombre === 'PLANTA NORTE' && r.uo.origen === 'archivo');
  assert('el nombre del empleado viaja al importador (lo recibe el analista, no Finanzas)',
    r.filas[0].nombre === 'Perez');
  assert('separa cantidad e importe de la celda cantidad$importe',
    r.filas[0].valores.get('1000').cantidad === 1
    && Math.abs(r.filas[0].valores.get('1000').importe - 159811.7958) < 0.00001);
  assert('una cantidad suelta viaja sin importe (no se le inventa uno)',
    r.filas[0].valores.get('1100').cantidad === 8 && r.filas[0].valores.get('1100').importe === null);
  assert('la celda vacía NO viaja al importador (no es cero)',
    r.filas[0].valores.has('2500') === false);
  assert('un cero escrito SÍ viaja: hay dato y vale cero',
    r.filas[1].valores.get('2500').cantidad === 0);
  assert('los totales por concepto salen por código',
    r.conceptos.find(c => c.codigo === '1000').legajos === 2
    && Math.abs(r.conceptos.find(c => c.codigo === '1000').importeTotal - 160211.7958) < 0.00001);
  assert('el importador cuadra contra la planilla leída',
    r.summary.cuadraImporte === true && r.summary.cuadraCantidad === true);
  assert('nada quedó afuera', r.afuera.length === 0);

  const s = summarizeNovedadesImportador(r);
  assert('el semáforo cuenta legajos, no filas de cálculo',
    s.unit === 'legajo' && s.unitsTotal === 2 && s.unitsWithDiff === 0);
  assert('sin nada afuera, la tarjeta sale en verde', s.status === 'success');
}

// ── 3. Un legajo con dos filas: se SUMA, no se pisa ──────────────────────────

{
  const r = correr([
    ['Unidad Organizativa', '1132', 'PLANTA NORTE'],
    ['Legajo', 'Apellido y Nombres', '1000', '1100'],
    ['1', 'Perez', '1$500', 4],
    ['1', 'Perez', '2$300,50', 3],
    ['2', 'Gomez', '1$100', null],
  ]);
  assert('el legajo repetido queda como un solo empleado', r.filas.length === 2);
  assert('las cantidades del legajo repetido se suman',
    r.filas[0].valores.get('1000').cantidad === 3 && r.filas[0].valores.get('1100').cantidad === 7);
  assert('los importes del legajo repetido se suman, no se pisan',
    Math.abs(r.filas[0].valores.get('1000').importe - 800.50) < 0.001);
  assert('avisa cuántos legajos venían repetidos', r.summary.legajosConsolidados === 1);
  assert('el importe total no se duplica ni se pierde',
    Math.abs(r.summary.importeTotal - 900.50) < 0.001);
}

// ── 4. `'007'` y `'7'` son el mismo empleado según el cliente (D-038) ─────────

{
  const planilla = [
    ['Unidad Organizativa', '1132', 'PLANTA NORTE'],
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['007', 'Perez', '1$500'],
    ['7', 'Perez', '1$300'],
  ];
  const conDefault = correr(planilla);
  assert('con la clave por default son el mismo empleado y se suman',
    conDefault.filas.length === 1 && Math.abs(conDefault.summary.importeTotal - 800) < 0.001);
  assert('avisa que el mismo legajo viene escrito de dos formas',
    conDefault.avisos.some(a => a.includes('formas distintas')));

  const literal = correr(planilla, { legajoKeyMode: 'trim' });
  assert('con la clave literal del cliente son dos empleados distintos',
    literal.filas.length === 2);
}

// ── 5. Columna sin código: no entra con un código adivinado (D-039) ──────────

const conSinCodigo = [
  ['Unidad Organizativa', '1132', 'PLANTA NORTE'],
  [null, null, 'Sueldo Basico', 'Horas Extras 50%', 'Observaciones'],
  ['Legajo', 'Apellido y Nombres', '1000', null, null],
  ['1', 'Perez', '1$500', 6, 'revisar con la analista'],
  ['2', 'Gomez', '1$300', 2, null],
];

{
  const r = correr(conSinCodigo);
  assert('la columna sin código no entra al importador',
    r.conceptos.length === 1 && r.conceptos[0].codigo === '1000');
  assert('sale listada como "quedó afuera", con el motivo y cuántas celdas',
    r.afuera.filter(a => a.motivo === 'columna_sin_codigo').length === 2
    && r.afuera.some(a => a.rotulo === 'Horas Extras 50%' && a.celdas === 2));
  assert('los legajos afectados por una columna sin código se cuentan',
    r.summary.legajosConAfuera === 2);
  assert('la tarjeta no sale en verde con algo afuera',
    summarizeNovedadesImportador(r).status === 'warning');

  // El analista confirma el código en el Paso 2 → recién ahí entra.
  const conMapeo = correr(conSinCodigo, {
    config: { codigoPorRotulo: { 'HORAS EXTRAS 50%': '1100' } },
  });
  assert('con el código confirmado en el Paso 2, la columna entra al importador',
    conMapeo.conceptos.some(c => c.codigo === '1100' && c.origen === 'catalogo')
    && conMapeo.filas[0].valores.get('1100').cantidad === 6);
  assert('el mapeo se resuelve por rótulo, no por letra de columna',
    normalizarRotulo(' horas   extras 50% ') === 'HORAS EXTRAS 50%');
  assert('con una columna resuelta, la otra sigue siendo la única que quedó afuera',
    conMapeo.afuera.length === 1 && conMapeo.afuera[0].rotulo === 'Observaciones');

  // Si el analista le asigna código a la columna de notas, el texto que tiene
  // adentro pasa a ser un valor de un concepto que no se pudo leer: sale con su
  // motivo, no como 0,00.
  const notasConCodigo = correr(conSinCodigo, {
    config: { codigoPorRotulo: { 'HORAS EXTRAS 50%': '1100', OBSERVACIONES: '9999' } },
  });
  assert('un valor que no es número en una columna ya resuelta queda afuera con su motivo',
    notasConCodigo.afuera.length === 1
    && notasConCodigo.afuera[0].motivo === 'valor_no_parseable'
    && notasConCodigo.afuera[0].codigo === '9999'
    && notasConCodigo.afuera[0].legajo === '1');
  assert('ese valor no entra al importador como cero',
    !notasConCodigo.filas.find(f => f.legajo === '1').valores.has('9999'));

  // La columna de notas se deja afuera a propósito.
  const conExcluida = correr(conSinCodigo, {
    config: { codigoPorRotulo: { 'HORAS EXTRAS 50%': '1100' }, rotulosExcluidos: ['Observaciones'] },
  });
  assert('la columna excluida a propósito no sale como problema',
    conExcluida.afuera.length === 0
    && conExcluida.columnasExcluidas.length === 1
    && conExcluida.columnasExcluidas[0].rotulo === 'Observaciones');
  assert('sin nada afuera y con la UO del archivo, la tarjeta sale en verde',
    summarizeNovedadesImportador(conExcluida).status === 'success');
}

// ── 6. Fila con datos y sin legajo (el total al pie del analista) ─────────────

{
  const r = correr([
    ['Unidad Organizativa', '1132', 'PLANTA NORTE'],
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['1', 'Perez', '1$500'],
    [null, 'TOTAL', '1$500'],
  ]);
  assert('la fila sin legajo no entra al importador', r.filas.length === 1);
  assert('la fila sin legajo sale listada, no descartada en silencio',
    r.afuera.some(a => a.motivo === 'fila_sin_legajo' && a.fila === 4));
}

// ── 7. La unidad organizativa: del archivo, del analista, o de nadie ─────────

{
  const sinUo = [
    ['Empresa', 'MERZ ARGENTINA', '01/07/2026'],
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['1', 'Perez', '1$500'],
  ];
  const r = correr(sinUo);
  assert('cuando el archivo declara Empresa y no UO, se informa como tal',
    r.uo.etiqueta === 'Empresa' && r.uo.nombre === 'MERZ ARGENTINA');

  const soloLegajo = correr([
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['1', 'Perez', '1$500'],
  ]);
  assert('sin unidad organizativa en ningún lado, el importador se arma pero lo avisa',
    soloLegajo.uo.origen === 'sin_declarar'
    && summarizeNovedadesImportador(soloLegajo).status === 'warning'
    && summarizeNovedadesImportador(soloLegajo).insights.some(i => i.label.includes('unidad organizativa')));

  const declarada = correr(soloLegajo === null ? [] : [
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['1', 'Perez', '1$500'],
  ], { config: { uoNro: '4', uoNombre: 'AGUAS Y GASEOSAS' } });
  assert('la UO que carga el analista en el Paso 2 gana',
    declarada.uo.origen === 'analista' && declarada.uo.nombre === 'AGUAS Y GASEOSAS');
}

// ── 8. El formato de celda del importador ────────────────────────────────────

{
  assert('cantidad e importe salen pegados con $, con coma decimal',
    celdaF2({ cantidad: 1, importe: 159811.7958 }) === '1$159811,7958');
  assert('una cantidad sola sale como número, no como texto',
    celdaF2({ cantidad: 8, importe: null }) === 8);
  assert('sin cantidad ni importe no hay celda: no viaja un cero',
    celdaF2({ cantidad: null, importe: null }) === null);
  assert('un cero escrito sale como cero',
    celdaF2({ cantidad: 0, importe: null }) === 0);
  assert('un importe sin cantidad conserva la forma que trajo el archivo',
    celdaF2({ cantidad: null, importe: 500 }) === '$500');
}

// ── 9. Ida y vuelta: el F2 generado lo vuelve a leer el lector ExpNov ────────

{
  const r = correr(base);
  const aoa = buildF2Aoa(r, { fecha: '20/08/2026' });

  assert('el F2 lleva la metadata de la UO en la fila 1',
    aoa[0][0] === 'Unidad Organizativa' && aoa[0][1] === '1132' && aoa[0][2] === 'PLANTA NORTE');
  assert('el encabezado del F2 son Legajo, Apellido y Nombres y un código por concepto',
    aoa[1][0] === 'Legajo' && aoa[1][1] === 'Apellido y Nombres'
    && aoa[1].slice(2).join(',') === '1000,1100,2500');
  assert('el F2 NO lleva fila de nombres en criollo: los de SIASA y Merz traen sólo códigos',
    aoa[2][0] === '1');
  assert('la celda que no tenía novedad sale vacía en el F2, no en cero',
    aoa[2][4] === null && aoa[3][4] === 0);
  assert('el F2 tiene una fila por legajo', aoa.length === 4);
  assert('el legajo sale al F2 tal como lo escribió el cliente, sin normalizar',
    aoa[2][0] === '1');

  // Y ahora la vuelta: el lector tiene que sacar los mismos valores.
  const { parsedRows: leidas } = parseExpNov(xlsxDe(aoa, 'HidalgoExpNov_1132_2'));
  const deUno = leidas.filter(x => x.legajo === '1');
  assert('el lector vuelve a leer el importador generado',
    leidas.length === r.summary.celdasEnF2);
  assert('el importe sobrevive el ida y vuelta con todos sus decimales',
    Math.abs(deUno.find(x => x.codigo === '1000').importe - 159811.7958) < 0.00001);
  assert('la cantidad suelta sobrevive como cantidad, sin importe inventado',
    deUno.find(x => x.codigo === '1100').cantidad === 8
    && deUno.find(x => x.codigo === '1100').importe === null);
  assert('la celda vacía sigue vacía después del ida y vuelta',
    deUno.some(x => x.codigo === '2500') === false);
}

// ── 10. Contra el importador ya armado (el caso de Aguas y Gaseosas) ─────────

{
  const planilla = [
    ['Unidad Organizativa', '4', 'AGUAS Y GASEOSAS'],
    ['Legajo', 'Apellido y Nombres', '1000', '1100'],
    ['1', 'Perez', '1$500', 4],
    ['2', 'Gomez', '1$300', null],
    ['3', 'Lopez', '1$200', null],
  ];
  // El importador que se subió a mano: al legajo 3 no llegó (el caso real de
  // SIASA 07/2026), el 1 tiene otro importe, y al 2 alguien le agregó un
  // concepto que la planilla del cliente no traía.
  const armado = [
    ['Unidad Organizativa', '4', 'AGUAS Y GASEOSAS'],
    ['Legajo', 'Apellido y Nombres', '1000', '1100', '2500'],
    ['1', 'Perez', '1$450', 4, null],
    ['2', 'Gomez', '1$300', null, '1$100'],
  ];

  const { parsedRows, parseMetadata } = parseExpNov(xlsxDe(planilla));
  const { parsedRows: filasArmado }   = parseExpNov(xlsxDe(armado));
  const r = runNovedadesImportador(parsedRows, [], {
    period: '2026-07',
    novedadesMeta: parseMetadata,
    novedadesConfig: DEFAULT_NOVEDADES_CONFIG(),
    f2ArmadoRows: filasArmado,
  });

  assert('el legajo que está en la planilla y NO llegó al importador sale marcado, no escondido',
    r.contra.soloGenerado.some(x => x.legajo === '3' && x.codigo === '1000'));
  assert('lo que está en el importador armado y no en la planilla también sale',
    r.contra.soloArmado.some(x => x.legajo === '2' && x.codigo === '2500'));
  assert('el importe que difiere sale con los dos números',
    r.contra.difiere.some(x => x.legajo === '1' && x.codigo === '1000'
      && x.importeGenerado === 500 && x.importeArmado === 450));
  assert('lo que coincide no se cuenta como diferencia',
    r.contra.coincide.some(x => x.legajo === '1' && x.codigo === '1100'));
  assert('los legajos a revisar son una unión, no una suma',
    r.summary.legajosParaRevisar === 3);
  assert('el semáforo cuenta esos legajos',
    summarizeNovedadesImportador(r).unitsWithDiff === 3
    && summarizeNovedadesImportador(r).unitsTotal === 3);

  // Sin el archivo opcional no hay comparación — y eso no es "todo coincide".
  const sinArmado = correr(planilla);
  assert('sin el importador armado, el control genera y no compara nada',
    sinArmado.contra === null && sinArmado.summary.contraDifiere === null);
}

// ── 11. La consolidación también del lado del importador ya armado ───────────

{
  const planilla = [
    ['Unidad Organizativa', '4', 'AGUAS Y GASEOSAS'],
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['2', 'Perez', '2$800'],
  ];
  // El mismo legajo en dos filas del lado del archivo armado: se SUMA, no se
  // pisa. Con la última pisando a la anterior, este caso daría una diferencia
  // de $ 500 que no existe.
  const armado = [
    ['Unidad Organizativa', '4', 'AGUAS Y GASEOSAS'],
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['2', 'Perez', '1$500'],
    ['2', 'Perez', '1$300'],
  ];
  const { parsedRows, parseMetadata } = parseExpNov(xlsxDe(planilla));
  const { parsedRows: filasArmado }   = parseExpNov(xlsxDe(armado));
  const r = runNovedadesImportador(parsedRows, [], {
    novedadesMeta: parseMetadata, novedadesConfig: DEFAULT_NOVEDADES_CONFIG(),
    f2ArmadoRows: filasArmado,
  });
  assert('el legajo repetido del importador armado se suma antes de comparar',
    r.contra.difiere.length === 0 && r.contra.coincide.length === 1);

  // Una diferencia de centavos entre dos importadores del mismo mes es un error
  // de armado: no la tapa ningún umbral.
  const porCentavos = [
    ['Unidad Organizativa', '4', 'AGUAS Y GASEOSAS'],
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['2', 'Perez', '2$799,50'],
  ];
  const c = parseExpNov(xlsxDe(porCentavos));
  const r2 = runNovedadesImportador(parsedRows, [], {
    novedadesMeta: parseMetadata, novedadesConfig: DEFAULT_NOVEDADES_CONFIG(),
    f2ArmadoRows: c.parsedRows,
  });
  assert('una diferencia de centavos contra el importador armado no se tapa',
    r2.contra.difiere.length === 1);
}

// ── 12. Las ramas de error y la sugerencia del catálogo ──────────────────────

{
  const vacia = runNovedadesImportador([], [], { novedadesMeta: {}, novedadesConfig: {} });
  assert('sin ninguna novedad cargada, el control lo dice en español y no arma nada',
    typeof vacia.error === 'string' && vacia.error.includes('novedad'));
  assert('el error sale como aviso en la tarjeta, no como excepción',
    summarizeNovedadesImportador(vacia).status === 'warning'
    && summarizeNovedadesImportador(vacia).unit === null);

  const catalogo = [
    { codigo: '1100', descripcion: 'Horas Extras 50%', alias: ['HS EXTRAS 50'] },
    { codigo: '4899', descripcion: 'Cochera imponible', alias: [] },
  ];
  assert('el catálogo del cliente sugiere el código por rótulo exacto',
    sugerirCodigo('horas extras 50%', catalogo)?.codigo === '1100');
  assert('la sugerencia también mira los alias del catálogo',
    sugerirCodigo('Hs Extras 50', catalogo)?.codigo === '1100');
  assert('un match parcial NO sugiere nada: "COCHERA" agarra el concepto equivocado',
    sugerirCodigo('Cochera', catalogo) === null);
}

console.log(`\n${ok} OK, ${fail} FAIL`);
if (fail > 0) process.exit(1);
