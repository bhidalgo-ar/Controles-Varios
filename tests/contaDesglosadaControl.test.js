// contaDesglosadaControl.test.js — Control "Contabilidad Desglosada + Asiento"
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/contaDesglosadaControl.test.js
//
// Datos 100% inventados: legajos '1'/'2'/'007'/'7', y nombres de cuenta y códigos
// que no son de ningún cliente. Ni un legajo ni un nombre real acá.
//
// Lo que este test fija, en orden de qué cuesta más caro si se rompe:
//   1. **Un legajo con dos liquidaciones SUMA su neto, no lo pisa** — y '007' y
//      '7' son el mismo empleado si el cliente lo declaró así (D-038/D-042). Con
//      el neto pisado el asiento sigue cerrando, mal, que es la clase de error
//      que nadie detecta.
//   2. Las 6 reglas del desdoblamiento: dos lados, exclusión de "Nada al
//      asiento", anulación cuando las dos cuentas son la misma, neto por
//      empleado, negativo que cambia de lado, y el importe que conserva su signo.
//   3. El cruce nombre → código en sus cuatro variantes (patrimonial por nombre,
//      código único, ambiguo por centro de costo, comodín) y la excepción del
//      analista por encima de todas.
//   4. Una cuenta sin código NO se inventa: la línea suma al balance y sale
//      listada (y el semáforo la cuenta como unidad con diferencia).
//   5. El encabezado de dos filas del reporte se aplana bien — si se corriera una
//      columna, las cuentas contables (que están al final) saldrían cruzadas y el
//      archivo cerraría igual.
//   6. Un reporte al que le falta una columna contable corta con un error que
//      dice cuál, en vez de generar una desglosada incompleta.

globalThis.document = { addEventListener: () => {} };

import * as XLSX from './node_modules/xlsx/xlsx.mjs';
globalThis.XLSX = XLSX; // el parser usa el global XLSX (como en browser)

// El wizard —de donde sale el texto del renglón del archivo opcional— arrastra
// `js/db.js`, que instancia Dexie al importarse (mismo arranque que
// tests/controlConfigRegistry.test.js).
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const {
  runContaDesglosada,
  summarizeContaDesglosada,
  DEFAULT_CONTA_DESGLOSADA_CONFIG,
} = await import('./js/controls/contaDesglosada.js');

const { parseTotalesConcepto, detectHeaders } = await import('./js/parsers/totalesConceptoParser.js');
const { parseCuentasRedefinicion } = await import('./js/parsers/cuentasRedefinicionParser.js');
const { textoAExcepciones } = await import('./js/ui/contaDesglosadaConfigEditor.js');
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { DEFAULT_SIN_ARCHIVO } = await import('./js/ui/controlsWizard.js');
const { EXPORT_CONTRACTS } = await import('./js/exports/contracts.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── Datos de prueba ──────────────────────────────────────────────────────────

/** Una fila del reporte "Totales de Concepto", como la devuelve el parser. */
function fila({ legajo, nro, concepto, importe, ceco = '10', debe = '', haber = '', liq = 'Mensual' }) {
  return {
    legajo,
    centro_costo: ceco,
    ingreso: '01/03/2020',
    nro_concepto: nro,
    concepto,
    importe,
    cuenta_debe: debe,
    cuenta_haber: haber,
    liquidacion: liq,
  };
}

const MAPPING = { period: '2026-05', legajoKeyMode: 'sin_ceros', contaDesglosadaConfig: null };

// ── 1. Las 6 reglas del desdoblamiento ───────────────────────────────────────
{
  const rows = [
    // Regla 1: los dos lados → dos líneas.
    fila({ legajo: '1', nro: '100', concepto: 'Sueldo', importe: '1.000,00',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
    // Regla 2: un lado dice "Nada al asiento" → sólo la otra línea. En el
    // archivo real un concepto trae las dos cuentas o ninguna; acá el caso está
    // armado a mano para probar la exclusión, y por eso el balance de este
    // bloque queda descuadrado a propósito (ver el bloque 1b).
    fila({ legajo: '1', nro: '200', concepto: 'Presentismo', importe: '100,00',
           debe: 'Sueldos Ventas', haber: 'Nada al asiento' }),
    // Regla 3: las dos cuentas son la misma (aunque escritas distinto) → la fila entera se anula.
    fila({ legajo: '1', nro: '300', concepto: 'Ajuste interno', importe: '50,00',
           debe: 'Sueldos Ventas', haber: 'SUELDOS VENTAS' }),
    // Ninguna cuenta: el concepto no va al asiento.
    fila({ legajo: '1', nro: '400', concepto: 'Informativo', importe: '9,00' }),
    // Regla 5: importe negativo → cambia de lado, monto positivo.
    fila({ legajo: '1', nro: '500', concepto: 'Devolución', importe: '-30,00',
           debe: 'Descuentos varios', haber: 'Sueldos a pagar' }),
  ];

  const r = runContaDesglosada(rows, [], MAPPING);

  assert('regla 1: la fila con dos cuentas genera una línea al DEBE y otra al HABER',
    r.lineas.filter(l => l.nro === '100').length === 1
    && r.lineas.find(l => l.nro === '100').debe_haber === 'DEBE');
  assert('regla 4: la cuenta del neto no se lista línea por línea',
    !r.lineas.some(l => l.nro === '100' && l.cuenta === 'Sueldos a pagar'));
  assert('regla 2: el lado que dice "Nada al asiento" no genera línea',
    r.lineas.filter(l => l.nro === '200').length === 1);
  assert('regla 3: las dos cuentas iguales anulan la fila entera',
    r.lineas.filter(l => l.nro === '300').length === 0 && r.filasAnuladas === 1);
  assert('una fila sin ninguna cuenta no genera línea y se cuenta',
    r.lineas.filter(l => l.nro === '400').length === 0 && r.filasSinCuenta === 1);

  const devolucion = r.lineas.find(l => l.nro === '500');
  assert('regla 5: el importe negativo cambia de lado (iba al DEBE, va al HABER)',
    devolucion.debe_haber === 'HABER' && devolucion.haber === 30);
  assert('regla 5: …con el monto en positivo y el Importe conservando el signo',
    devolucion.debe === null && devolucion.importe === -30);

  // Neto del legajo: HABER 1.000 − DEBE 30 (el negativo invirtió su lado) = 970.
  const neto = r.lineas.filter(l => l.concepto === DEFAULT_CONTA_DESGLOSADA_CONFIG.conceptoNeto);
  assert('regla 4: se emite UNA línea de neto por legajo, con el Nro configurado',
    neto.length === 1 && neto[0].nro === '9000');
  assert('regla 4: el neto es HABER − DEBE de la cuenta de sueldos a pagar',
    neto[0].haber === 970 && neto[0].debe === null);
  // El movimiento de un solo lado deja la desglosada descuadrada — y eso ES el
  // resultado correcto: en el asiento falta la contrapartida de esos 100.
  assert('un movimiento con un solo lado descuadra la desglosada, y el control lo dice',
    !r.cierra && r.diferencia === 100);
  const s = summarizeContaDesglosada(r);
  assert('…y el descuadre sale como aviso, no como corrida en verde',
    s.status === 'warning' && s.insights.some(i => i.label.includes('no cierra')));
}

// ── 1b. Con todos los movimientos completos, la desglosada cierra ────────────
{
  const rows = [
    fila({ legajo: '1', nro: '100', concepto: 'Sueldo', importe: '1.000,00',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
    fila({ legajo: '1', nro: '500', concepto: 'Devolución', importe: '-30,00',
           debe: 'Descuentos varios', haber: 'Sueldos a pagar' }),
    fila({ legajo: '2', nro: '100', concepto: 'Sueldo', importe: '2.000,00', ceco: '20',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
  ];
  const r = runContaDesglosada(rows, [], MAPPING);
  assert('la desglosada cierra: DEBE = HABER', r.cierra && r.diferencia === 0);
  // DEBE: 1.000 + 2.000 de los dos sueldos. HABER: 30 de la devolución (que
  // cambió de lado por venir en negativo) + los dos netos, 970 y 2.000.
  assert('…y el total es el de los movimientos, con el neto de cada legajo incluido',
    r.totalDebe === 3000 && r.totalHaber === 3000);
  assert('el saldo de la cuenta de sueldos a pagar es la suma de los netos emitidos',
    r.saldoNeto === 2970 && r.legajosConNeto === 2);
}

// ── 2. Un legajo con dos liquidaciones: SUMA, no pisa ────────────────────────
// El bug más caro del repo (D-042), acá en la línea de neto: el reporte trae una
// fila por liquidación, y un legajo con la mensual y la de provisiones toca la
// cuenta de sueldos a pagar dos veces.
{
  const rows = [
    fila({ legajo: '2', nro: '100', concepto: 'Sueldo', importe: '800,00',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar', liq: 'Mensual' }),
    fila({ legajo: '2', nro: '100', concepto: 'Sueldo', importe: '200,00',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar', liq: 'Provisiones' }),
  ];
  const r = runContaDesglosada(rows, [], MAPPING);
  const neto = r.lineas.filter(l => l.nro === '9000');

  assert('dos liquidaciones del mismo legajo dan UNA sola línea de neto', neto.length === 1);
  assert('…y su importe es la SUMA de las dos, no la última', neto[0].haber === 1000);
  assert('las líneas de detalle sí salen las dos (una por liquidación)',
    r.lineas.filter(l => l.cuenta === 'Sueldos Ventas').length === 2);
  assert('el balance cierra con las dos liquidaciones', r.cierra);
}

// ── 3. La clave de legajo del cliente decide si es el mismo empleado ─────────
{
  const rows = [
    fila({ legajo: '007', nro: '100', concepto: 'Sueldo', importe: '500,00',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
    fila({ legajo: '7', nro: '100', concepto: 'Sueldo', importe: '300,00',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
  ];

  const sinCeros = runContaDesglosada(rows, [], { ...MAPPING, legajoKeyMode: 'sin_ceros' });
  assert("modo sin_ceros: '007' y '7' son el mismo empleado → una línea de neto de 800",
    sinCeros.lineas.filter(l => l.nro === '9000').length === 1
    && sinCeros.lineas.find(l => l.nro === '9000').haber === 800);

  const trim = runContaDesglosada(rows, [], { ...MAPPING, legajoKeyMode: 'trim' });
  assert("modo trim: son dos empleados distintos → dos líneas de neto",
    trim.lineas.filter(l => l.nro === '9000').length === 2);
  assert('las dos formas cierran igual', sinCeros.cierra && trim.cierra
    && sinCeros.totalDebe === trim.totalDebe);
}

// ── 4. Importe vacío: no se completa con 0 en silencio ───────────────────────
{
  const rows = [
    fila({ legajo: '1', nro: '100', concepto: 'Sueldo', importe: '',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
  ];
  const r = runContaDesglosada(rows, [], MAPPING);
  assert('una línea con cuenta pero sin importe se emite con el importe vacío, no en 0',
    r.lineas[0].importe === null && r.lineas[0].debe === null);
  assert('…y se cuenta para avisarlo en resultados', r.filasSinImporte === 1);
  const s = summarizeContaDesglosada(r);
  assert('…y el aviso llega al resumen del control',
    s.insights.some(i => i.label.includes('sin importe')));
}

// ── 5. El cruce nombre → código, en sus cuatro variantes ─────────────────────
{
  const cuentasRef = [
    // Patrimonial: todos los códigos de este nombre empiezan con 1 o 2 → cruza
    // sólo por nombre, y el nombre oficial unifica las variantes de mayúsculas.
    { nombre: 'Sueldos a pagar', codigo: '215100100', centro_costo: '10' },
    { nombre: 'Sueldos a pagar', codigo: '215100100', centro_costo: '20' },
    // Código único para el nombre → cruza por nombre.
    { nombre: 'Descuentos varios', codigo: '115200100', centro_costo: null },
    // Nombre ambiguo → cruza por nombre + centro de costo.
    { nombre: 'Sueldos Ventas', codigo: '710100110', centro_costo: '10' },
    { nombre: 'Sueldos Ventas', codigo: '710100120', centro_costo: '20' },
    // Nombre ambiguo con un comodín (centro vacío).
    { nombre: 'Cargas sociales', codigo: '710100130', centro_costo: '10' },
    { nombre: 'Cargas sociales', codigo: '710100139', centro_costo: null },
  ];

  const rows = [
    fila({ legajo: '1', nro: '100', concepto: 'Sueldo', importe: '1.000,00', ceco: '10',
           debe: 'SUELDOS VENTAS', haber: 'Sueldos a pagar' }),
    fila({ legajo: '2', nro: '100', concepto: 'Sueldo', importe: '2.000,00', ceco: '20',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
    fila({ legajo: '2', nro: '110', concepto: 'Cargas', importe: '300,00', ceco: '99',
           debe: 'Cargas sociales', haber: 'Cargas sociales a pagar' }),
    fila({ legajo: '2', nro: '120', concepto: 'Descuento', importe: '80,00', ceco: '20',
           debe: 'Sueldos a pagar', haber: 'Descuentos varios' }),
  ];

  const r = runContaDesglosada(rows, [], { ...MAPPING, cuentas_refRows: cuentasRef });
  const a = r.asiento;
  const porCodigo = (codigo) => a.filas.filter(f => f.nro === codigo);

  assert('cruce por nombre + centro de costo: el mismo nombre en dos centros da dos códigos',
    porCodigo('710100110').length === 1 && porCodigo('710100120').length === 1);
  assert('el nombre de la cuenta matchea sin importar mayúsculas',
    porCodigo('710100110')[0].debe === 1000);
  assert('comodín: el centro 99 no está en la referencia y toma el código de centro vacío',
    porCodigo('710100139').length === 1 && porCodigo('710100139')[0].debe === 300);
  assert('código único para el nombre: cruza por nombre solo',
    porCodigo('115200100').length === 1);

  const patrimonial = porCodigo('215100100');
  assert('patrimonial (código 2x): una sola línea, sin centro de costo',
    patrimonial.length === 1 && patrimonial[0].centro_costo === '0');
  assert('…y con el nombre oficial del reporte de cuentas',
    patrimonial[0].cuenta === 'Sueldos a pagar');

  assert('una cuenta que no está en la referencia queda sin código y se lista',
    a.sinCodigo.length === 1 && a.sinCodigo[0].cuenta === 'Cargas sociales a pagar');
  assert('…pero su importe igual suma al asiento (el balance no se maquilla)',
    a.cierraBruto && a.totalDebe === a.totalHaber);
  assert('el asiento también cierra neteado', a.cierraNeteado);

  // Neteo de la línea patrimonial: HABER (los netos de los dos legajos + el
  // descuento del legajo 2 al DEBE) compensado contra el DEBE.
  const netoPatrimonial = patrimonial[0].neto_haber - patrimonial[0].neto_debe;
  assert('el neteo de una línea es HABER − DEBE',
    Math.round((netoPatrimonial - (patrimonial[0].haber - patrimonial[0].debe)) * 100) === 0);

  const s = summarizeContaDesglosada(r);
  assert('la unidad del semáforo es la cuenta contable', s.unit === 'cuenta');
  assert('la cuenta sin código cuenta como unidad con diferencia, aunque el asiento cierre',
    s.unitsWithDiff === 1 && s.unitsTotal === a.filas.length + 1);
  assert('el control no sale en verde con una cuenta sin resolver', s.status === 'warning');
}

// ── 6. La excepción del analista gana sobre la referencia ────────────────────
{
  const cuentasRef = [
    { nombre: 'Sueldos Ventas', codigo: '710100110', centro_costo: '10' },
    { nombre: 'Sueldos a pagar', codigo: '215100100', centro_costo: null },
  ];
  const rows = [
    fila({ legajo: '1', nro: '100', concepto: 'Sueldo', importe: '1.000,00', ceco: '10',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
  ];

  const { excepciones, errores } = textoAExcepciones('Sueldos Ventas\t10\t999999999');
  assert('el editor lee una excepción con su centro de costo', errores.length === 0 && excepciones.length === 1);

  const r = runContaDesglosada(rows, [], {
    ...MAPPING,
    cuentas_refRows: cuentasRef,
    contaDesglosadaConfig: { ...DEFAULT_CONTA_DESGLOSADA_CONFIG, excepciones },
  });
  assert('la excepción configurada gana sobre el reporte de cuentas',
    r.asiento.filas.some(f => f.nro === '999999999')
    && !r.asiento.filas.some(f => f.nro === '710100110'));

  const comodin = textoAExcepciones('Sueldos Ventas\t*\t888888888');
  const r2 = runContaDesglosada(rows, [], {
    ...MAPPING,
    cuentas_refRows: cuentasRef,
    contaDesglosadaConfig: { ...DEFAULT_CONTA_DESGLOSADA_CONFIG, excepciones: comodin.excepciones },
  });
  assert('una excepción con centro "*" vale para cualquier centro de costo',
    r2.asiento.filas.some(f => f.nro === '888888888'));

  assert('la semilla de excepciones viene vacía: no se inventa ningún código',
    DEFAULT_CONTA_DESGLOSADA_CONFIG.excepciones.length === 0);
}

// ── 7. Sin el reporte de cuentas: la desglosada sale, el asiento no ──────────
{
  const rows = [
    fila({ legajo: '1', nro: '100', concepto: 'Sueldo', importe: '1.000,00',
           debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
  ];
  const r = runContaDesglosada(rows, [], MAPPING);
  assert('sin reporte de cuentas la desglosada se genera igual', r.lineas.length === 2 && r.cierra);
  assert('…y el asiento queda explícitamente sin armar', r.asiento === null);
  const s = summarizeContaDesglosada(r);
  assert('…y el resumen lo dice en vez de mostrar un asiento vacío',
    s.status === 'warning' && s.insights.some(i => i.label.includes('asiento sin armar')));
}

// ── 8. Las ramas de error ────────────────────────────────────────────────────
{
  assert('sin archivo: error en español, no una excepción',
    runContaDesglosada([], [], MAPPING).error?.includes('Totales de Concepto'));

  const r = runContaDesglosada(
    [fila({ legajo: '1', nro: '100', concepto: 'Informativo', importe: '10,00' })],
    [], MAPPING);
  assert('un reporte sin ninguna cuenta contable corta con error, no con una desglosada vacía',
    !!r.error && r.error.includes('Cuenta Debe'));

  const sinCuentaNeto = runContaDesglosada(
    [fila({ legajo: '1', nro: '100', concepto: 'Sueldo', importe: '10,00', debe: 'X', haber: 'Y' })],
    [], { ...MAPPING, contaDesglosadaConfig: { ...DEFAULT_CONTA_DESGLOSADA_CONFIG, cuentaNeto: '' } });
  assert('sin la cuenta del neto configurada no se ejecuta: se pide',
    !!sinCuentaNeto.error && sinCuentaNeto.error.includes('neto a pagar'));

  const s = summarizeContaDesglosada({ error: 'algo' });
  assert('un error no declara unidades (el semáforo cortocircuita en error)',
    s.status === 'error' && s.unit === null && s.unitsTotal === null);
}

// ── 9. El parser: el encabezado de dos filas se aplana bien ──────────────────
// Es lo que decide qué columna es cada cosa. Si se corriera una, las cuentas
// contables —que están al final— saldrían cruzadas y el archivo cerraría igual.
{
  const encabezado = (cols) => cols.map(c => `<th rowspan='2'>${c}</th>`).join('');
  const filaDatos = (celdas) => `<tr>${celdas.map(c => `<td>${c}</td>`).join('')}</tr>`;

  const html = `<span>EA: Cliente Inventado S.A. | Periodo: 05/2026 - 05/2026 | Tipo: Mensual</span>
    <table><tr>${encabezado(['Legajo', 'Centro de Costo', 'Ingreso', 'Nro', 'Concepto'])}`
    + `<th colspan='2'>05/2026</th>`
    + `${encabezado(['Cuenta Debe', 'Cuenta Haber', 'Liquidacion'])}</tr>`
    + `<tr><th>Cantidad</th><th>Importe</th></tr>`
    + filaDatos(['1', '10', '01/03/2020', '100', 'Sueldo', '1', '1.000,00', 'Sueldos Ventas', 'Sueldos a pagar', 'Mensual'])
    + filaDatos(['2', '20', '01/04/2021', '100', 'Sueldo', '1', '2.000,00', 'Sueldos Ventas', 'Sueldos a pagar', 'Mensual'])
    + `</table>`;

  const ab = new TextEncoder().encode(html).buffer;
  const { headers } = detectHeaders(ab);
  assert('el grupo de columnas del período se aplana con los subencabezados',
    headers.length === 10 && headers[5] === 'Cantidad' && headers[6] === 'Importe');
  assert('…y las columnas de después del grupo no se corren',
    headers[7] === 'Cuenta Debe' && headers[8] === 'Cuenta Haber');

  const { parsedRows, parseMetadata } = parseTotalesConcepto(ab);
  assert('las filas salen con la columna de importe correcta, no la de cantidad',
    parsedRows.length === 2 && parsedRows[0].importe === '1.000,00');
  assert('el período sale del propio archivo', parseMetadata.periodo === '2026-05');
  assert('la metadata cuenta legajos, no filas', parseMetadata.uniqueLegajos === 2);

  // El mismo reporte, guardado como .xlsx real: el subencabezado gana igual.
  const aoa = [
    ['EA: Cliente Inventado S.A. | Periodo: 05/2026 - 05/2026'],
    [],
    ['Legajo', 'Centro de Costo', 'Ingreso', 'Nro', 'Concepto', '05/2026', null, 'Cuenta Debe', 'Cuenta Haber', 'Liquidacion'],
    [null, null, null, null, null, 'Cantidad', 'Importe', null, null, null],
    ['1', '10', '01/03/2020', '100', 'Sueldo', '1', '1000', 'Sueldos Ventas', 'Sueldos a pagar', 'Mensual'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Hoja1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const xlsx = parseTotalesConcepto(buf);
  assert('el .xlsx real se lee con el mismo criterio de encabezados',
    xlsx.parsedRows.length === 1 && xlsx.parsedRows[0].importe === '1000'
    && xlsx.parsedRows[0].cuenta_haber === 'Sueldos a pagar');
  assert('…y también saca el período del preámbulo', xlsx.parseMetadata.periodo === '2026-05');
}

// ── 10. El parser corta cuando falta una columna contable ────────────────────
{
  const html = `<table><tr><th>Legajo</th><th>Nro</th><th>Concepto</th><th>Importe</th><th>Cuenta Debe</th></tr>`
    + `<tr><td>1</td><td>100</td><td>Sueldo</td><td>1.000,00</td><td>Sueldos Ventas</td></tr></table>`;
  let error = null;
  try { parseTotalesConcepto(new TextEncoder().encode(html).buffer); }
  catch (e) { error = e.message; }
  assert('falta "Cuenta Haber": corta con un error que la nombra',
    !!error && error.includes('Cuenta Haber'));
}

// ── 11. El parser del reporte de cuentas ─────────────────────────────────────
{
  const aoa = [
    ['Reporte de Cuentas de Redefinición Cliente Inventado 19/08/2026'],
    [],
    ['EA', 'Cargo', 'Centro de costo', 'Cuenta a Reemplazar', 'Codigo', 'Nombre', 'Codigo'],
    ['Cliente', '', '10', 'SUELDOS VIEJO', '5.1.1', 'Sueldos Ventas', '710100110'],
    ['Cliente', '', '', 'SIN CODIGO TODAVIA', '', 'Cuenta sin código', ''],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Plan');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const { parsedRows, parseMetadata } = parseCuentasRedefinicion(buf);

  assert('el código se busca a la derecha de "Nombre", no en una posición fija',
    parsedRows.length === 1 && parsedRows[0].codigo === '710100110');
  assert('…y se lee el centro de costo de la fila', parsedRows[0].centro_costo === '10');
  assert('una cuenta sin código todavía no se inventa: se cuenta y se informa',
    parseMetadata.filasIgnoradas === 1);
}

// ── 12. El control está cableado en el registry ──────────────────────────────
{
  const ctrl = CONTROL_REGISTRY.conta_desglosada;
  assert('el control existe en el registry', !!ctrl);
  assert('no pide el Tabulado como archivo pivote', ctrl.tabRequired === false);
  assert('el primer archivo adicional es el "Totales de Concepto"',
    ctrl.additionalFiles[0].key === 'totales_concepto'
    && ctrl.additionalFiles[0].fileType === 'totales_concepto_file');
  assert('el reporte de cuentas es opcional (la desglosada sale sin él)',
    ctrl.additionalFiles[1].optional === true);
  assert('declara su config con editor y con mappingKey (si no, el control nunca la ve)',
    ctrl.config[0].mappingKey === 'contaDesglosadaConfig' && typeof ctrl.config[0].editor === 'function');
  assert('se ofrece sólo a COTY por ahora (D-015)',
    ctrl.scope === 'cliente' && ctrl.scopeMeta.clients.includes('COTY'));
  assert('es una variante "Generar Reporte"', ctrl.group.mode === 'Generar Reporte');

  // El renglón del archivo opcional en el Paso 2 tiene que decir QUÉ se pierde
  // sin él. Con la frase genérica ("el control corre igual sin este archivo")
  // la pantalla afirma algo falso: sin el reporte de cuentas no hay asiento, y
  // el analista se entera recién al ver los resultados, con el entregable a la
  // mitad. Fue exactamente lo que pasó la primera vez que se corrió de verdad.
  const sinArchivo = DEFAULT_SIN_ARCHIVO[ctrl.additionalFiles[1].fileType];
  assert('el renglón del reporte de cuentas dice qué se pierde sin él', !!sinArchivo);
  assert('…y nombra el asiento, que es lo que no se arma', /asiento/i.test(sinArchivo || ''));

  for (const id of ['conta_desglosada', 'conta_desglosada_codigo', 'conta_asiento']) {
    assert(`${id}: tiene contrato de export`, !!EXPORT_CONTRACTS[id]);
  }
  assert('la desglosada son 10 columnas', EXPORT_CONTRACTS.conta_desglosada.columns.length === 10);
  assert('la desglosada con código son 11', EXPORT_CONTRACTS.conta_desglosada_codigo.columns.length === 11);
  assert('el asiento son 7', EXPORT_CONTRACTS.conta_asiento.columns.length === 7);
  assert('el asiento va a Contaduría del cliente y no lleva legajo (D-020)',
    EXPORT_CONTRACTS.conta_asiento.audience === 'finanzas'
    && !EXPORT_CONTRACTS.conta_asiento.columns.some(c => c.key === 'legajo'));
  assert('la desglosada es papel de trabajo del analista (lleva legajo e ingreso)',
    EXPORT_CONTRACTS.conta_desglosada.audience === 'payroll');
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
