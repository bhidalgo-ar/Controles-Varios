// acreditacionesControl.test.js — Test del control "Acreditaciones — Generar Reporte"
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/acreditacionesControl.test.js
//
// Cubre las reglas de specs/control-acreditaciones-axton.md: qué filas entran,
// la agrupación por (tipo, fecha) mergeando listados, la herencia de fecha, el
// cierre contra el total del archivo y las alertas de integridad.

// registry.js importa (transitivamente) módulos de UI que registran un listener
// a nivel de módulo — necesitan un `document` mínimo fuera del navegador.
globalThis.document = { addEventListener: () => {} };

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { normalizeLiqType } = await import('./js/controls/acreditaciones.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const ctrl = CONTROL_REGISTRY.acreditaciones_reporte;

// ── Registry ─────────────────────────────────────────────────────────────────

assert('el registry tiene la entrada "acreditaciones_reporte"', ctrl !== undefined);
assert('additionalFiles[0] es el archivo de Acreditaciones (primaryRows)',
  ctrl.additionalFiles[0].key === 'acreditaciones');
assert('el fileType del archivo es acreditaciones_file',
  ctrl.additionalFiles[0].fileType === 'acreditaciones_file');
assert('tabRequired es false (no usa el Tabulado)', ctrl.tabRequired === false);
assert('el scope es de sistema, para clientes Axton',
  ctrl.scope === 'sistema' && ctrl.scopeMeta.sourceSystems.includes('axton'));
assert('tiene help con what y how', typeof ctrl.help?.what === 'string' && Array.isArray(ctrl.help?.how));

// ── Normalización de tipos de liquidación ────────────────────────────────────

const t = raw => normalizeLiqType(raw);
assert('"Anticipo de sueldo (De carga) Julio 2026 (Anticipos 07-2026 -) (C)" → A',
  t('Anticipo de sueldo (De carga) Julio 2026 (Anticipos 07-2026 -) (C)').code === 'A');
assert('"Anticipo vacaciones Julio 2026 (Anticipo vacaciones 07-2026) (C)" → AV (no A)',
  t('Anticipo vacaciones Julio 2026 (Anticipo vacaciones 07-2026) (C)').code === 'AV');
assert('"1er Quincena c/sobregiro Julio 2026 (1era Quincena 07-2026) (C)" → 1Q',
  t('1er Quincena c/sobregiro Julio 2026 (1era Quincena 07-2026) (C)').code === '1Q');
assert('"2da Quincena c/ sobregiro Julio 2026 (2da Quincena 07-2026) (C)" → 2Q',
  t('2da Quincena c/ sobregiro Julio 2026 (2da Quincena 07-2026) (C)').code === '2Q');
assert('"Mensual c/sobregiro Julio 2026 (Mensuales 07-2026) (C)" → M',
  t('Mensual c/sobregiro Julio 2026 (Mensuales 07-2026) (C)').code === 'M');
assert('"Liq. Final c/sueldo Julio 2026 (Bajas 07-2026) (C)" → LF (el "sueldo" no lo hace anticipo)',
  t('Liq. Final c/sueldo Julio 2026 (Bajas 07-2026) (C)').code === 'LF');
assert('"SAC Julio 2026 (SAC 07-2026) (C)" → SAC', t('SAC Julio 2026 (SAC 07-2026) (C)').code === 'SAC');
assert('"Bono extraordinario Julio 2026 (C)" → B', t('Bono extraordinario Julio 2026 (C)').code === 'B');
assert('un tipo desconocido no se descarta: cae en fallback con etiqueta limpia',
  t('Reintegro especial Julio 2026 (Reintegros 07-2026) (C)').label === 'Reintegro especial');
assert('el orden de los anticipos es anterior al de las quincenas', t('Anticipo de sueldo').order < t('1er Quincena').order);
assert('el orden de la liquidación final es el último de los conocidos',
  t('Liq. Final').order > t('Mensual c/sobregiro').order);

// ── Datos de prueba (inventados, sin datos reales de empleados) ──────────────
//
// Reproduce en chico la forma del export de Axton de un mes:
//   · anticipos del 02-07 en dos listados distintos (rio + otros) → una sola lista
//   · el listado 900 tiene dos liquidaciones (anticipo de sueldo y vacaciones) → dos listas
//   · la 1era quincena del 16-07 con una fila sin listado ni fecha → hereda la fecha
//   · un anticipo sin listado ni fecha → SIN ASIGNAR (los anticipos tienen varias fechas)
//   · una fila en el listado de pago sin importe → entra igual, con alerta
//   · una fila de provisiones (sin importe y sin listado) → se descarta

const CBU1 = '0720369388000032749018';
const CBU2 = '0720514988000001436736';
const CBU3 = '0170005340000038839937';

const ANTICIPO = 'Anticipo de sueldo (De carga) Julio 2026 (Anticipos 07-2026) (C)';
const VACAC    = 'Anticipo vacaciones Julio 2026 (Anticipo vacaciones 07-2026) (C)';
const QUINC1   = '1er Quincena c/sobregiro Julio 2026 (1era Quincena 07-2026) (C)';
const PROVIS   = 'z PLASTIC - Provisiones (ene-abril-julio-Oct) Julio 2026 (C)';

const row = (o) => ({
  legajo: '1', apellido_nombre: 'PEREZ JUAN', cuit: '20-11111111-1',
  cliente: 'CLIENTE DEMO SA', uo_cliente: 'Mensualizados',
  liquidacion: ANTICIPO, neto: null, listado: '', descripcion: '',
  fecha_acreditacion: null, banco: 'BANCO DEMO', cbu: CBU1, empresa: 'CLIENTE DEMO SA',
  ...o,
});

const acredRows = [
  // Lista 1 — anticipos del 02-07, dos listados del mismo pago
  row({ legajo: '1', apellido_nombre: 'PEREZ JUAN',  cbu: CBU1, neto: 1000, listado: '900', fecha_acreditacion: '2026-07-02' }),
  row({ legajo: '2', apellido_nombre: 'GOMEZ ANA',   cbu: CBU2, neto: 2000, listado: '901', fecha_acreditacion: '2026-07-02' }),
  // Lista 2 — vacaciones, mismo listado 900 pero otra liquidación
  row({ legajo: '3', apellido_nombre: 'LOPEZ LUCAS', cbu: CBU3, neto: 500, listado: '900', fecha_acreditacion: '2026-07-02', liquidacion: VACAC }),
  // Lista 3 — 1era quincena del 16-07: una fila con listado y otra sin nada más que el importe
  row({ legajo: '1', apellido_nombre: 'PEREZ JUAN',  cbu: CBU1, neto: 3000, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 }),
  row({ legajo: '2', apellido_nombre: 'GOMEZ ANA',   cbu: CBU2, neto: 4000, listado: '',    fecha_acreditacion: null,         liquidacion: QUINC1 }),
  // En el listado de pago sin importe → entra a la lista, con alerta
  row({ legajo: '3', apellido_nombre: 'LOPEZ LUCAS', cbu: CBU3, neto: null, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 }),
  // Anticipo sin listado ni fecha: la liquidación tiene varias fechas → SIN ASIGNAR
  row({ legajo: '3', apellido_nombre: 'LOPEZ LUCAS', cbu: CBU3, neto: 700, listado: '', fecha_acreditacion: null }),
  // Segunda fecha de anticipos (hace que la herencia de fecha sea ambigua)
  row({ legajo: '2', apellido_nombre: 'GOMEZ ANA',   cbu: CBU2, neto: 1500, listado: '902', fecha_acreditacion: '2026-07-21' }),
  // Provisiones: sin importe y sin listado → se descarta
  row({ legajo: '1', apellido_nombre: 'PEREZ JUAN',  cbu: CBU1, liquidacion: PROVIS }),
];

const results = ctrl.run(acredRows, [], { period: '2026-07' });

// ── Qué filas entran ─────────────────────────────────────────────────────────

assert('descarta la fila de provisiones (sin importe y sin listado)', results.summary.descartadas === 1);
assert('las 8 filas restantes entran al reporte', results.summary.acreditaciones === 8);

// ── Agrupación ───────────────────────────────────────────────────────────────

assert('arma 4 listas numeradas', results.summary.listas === 4);

const l1 = results.listas[0];
assert('lista 1: anticipos del 02-07', l1.n === 1 && l1.code === 'A' && l1.fecha === '2026-07-02');
assert('lista 1: mergea los dos listados del mismo pago (900 + 901)',
  l1.listados.join('+') === '900+901' && l1.count === 2);
assert('lista 1: el total suma las dos acreditaciones', l1.total === 3000);

const l2 = results.listas[1];
assert('lista 2: el listado 900 se parte por liquidación (vacaciones aparte)',
  l2.code === 'AV' && l2.fecha === '2026-07-02' && l2.total === 500);

const l3 = results.listas[2];
assert('lista 3: 1era quincena del 16-07 con las 3 filas (incluida la sin importe)',
  l3.code === '1Q' && l3.fecha === '2026-07-16' && l3.count === 3);
assert('lista 3: la fila sin listado ni fecha heredó la fecha de su liquidación', l3.total === 7000);
assert('las listas quedan ordenadas por fecha y después por tipo',
  results.listas.map(l => `${l.fecha}/${l.code}`).join(' ')
    === '2026-07-02/A 2026-07-02/AV 2026-07-16/1Q 2026-07-21/A');

// Un legajo con dos acreditaciones en el mes NO se consolida: cada acreditación
// es una fila de su propia lista (a diferencia del resto de los controles, la
// unidad acá es la acreditación, no el empleado-mes).
const legajo1Rows = results.listas.flatMap(l => l.rows).filter(r => r.legajo === '1');
assert('un legajo con dos acreditaciones aparece una vez en cada lista, sin sumarse',
  legajo1Rows.length === 2 && legajo1Rows.map(r => r.neto).sort((a, b) => a - b).join(',') === '1000,3000');

// ── Sin asignar ──────────────────────────────────────────────────────────────

assert('el anticipo sin fecha resoluble va a SIN ASIGNAR',
  results.sinAsignar?.count === 1 && results.sinAsignar.total === 700);
assert('SIN ASIGNAR no entra en las listas numeradas',
  results.listas.every(l => l.rows.every(r => r.neto !== 700)));

// ── Cierre contra el archivo de origen ───────────────────────────────────────

assert('el total del archivo incluye todas las filas con importe', results.summary.totalOrigen === 12700);
assert('total acreditado en listas + sin asignar = total del archivo',
  results.summary.totalAcreditado + results.summary.sinAsignarTotal === results.summary.totalOrigen);
assert('la diferencia del cierre da cero', results.summary.diferencia === 0);

// ── Alertas ──────────────────────────────────────────────────────────────────

const alertTypes = new Set(results.alerts.map(a => a.tipo));
assert('marca la fila en listado de pago sin importe', alertTypes.has('sin_importe'));
assert('marca la fila sin fecha asignable', alertTypes.has('sin_asignar'));
assert('no inventa alertas de CBU sobre datos válidos',
  !alertTypes.has('cbu_invalido') && !alertTypes.has('cbu_compartido'));

const conCbuMalo = ctrl.run(
  [...acredRows, row({ legajo: '4', apellido_nombre: 'DIAZ SOL', cbu: '123', neto: 100, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 })],
  [], { period: '2026-07' }
);
assert('detecta CBU con largo distinto de 22',
  conCbuMalo.alerts.some(a => a.tipo === 'cbu_invalido' && a.legajo === '4'));

const conCbuCompartido = ctrl.run(
  [...acredRows, row({ legajo: '5', apellido_nombre: 'RUIZ MARA', cbu: CBU1, neto: 100, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 })],
  [], { period: '2026-07' }
);
assert('detecta CBU compartido entre dos legajos',
  conCbuCompartido.alerts.some(a => a.tipo === 'cbu_compartido' && a.legajo === '5'));

const conDuplicado = ctrl.run(
  [...acredRows, row({ legajo: '1', apellido_nombre: 'PEREZ JUAN', cbu: CBU1, neto: 1000, listado: '900', fecha_acreditacion: '2026-07-02' })],
  [], { period: '2026-07' }
);
assert('detecta la acreditación duplicada (mismo legajo, importe, fecha y liquidación)',
  conDuplicado.alerts.some(a => a.tipo === 'duplicado' && a.legajo === '1'));

const conNegativo = ctrl.run(
  [row({ legajo: '1', neto: -50, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 })],
  [], { period: '2026-07' }
);
assert('detecta importe menor o igual a cero',
  conNegativo.alerts.some(a => a.tipo === 'neto_no_positivo'));

// ── Semáforo ─────────────────────────────────────────────────────────────────

const summary = ctrl.summarize(results);
assert('la unidad del semáforo es la lista', summary.unit === 'lista');
assert('cuenta las listas con alerta + la de sin asignar', summary.unitsWithDiff === 2);
assert('el estado es warning porque hay alertas y filas sin asignar', summary.status === 'warning');

const limpio = ctrl.run(
  [
    row({ legajo: '1', neto: 1000, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 }),
    row({ legajo: '2', apellido_nombre: 'GOMEZ ANA', cbu: CBU2, neto: 2000, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 }),
  ],
  [], { period: '2026-07' }
);
const summaryLimpio = ctrl.summarize(limpio);
assert('un mes sin alertas cierra en success', summaryLimpio.status === 'success');
assert('un mes sin alertas no marca ninguna lista', summaryLimpio.unitsWithDiff === 0);

// ── Corte por empresa ────────────────────────────────────────────────────────

const dosEmpresas = [
  row({ legajo: '1', neto: 1000, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1, empresa: 'EMPRESA UNO' }),
  row({ legajo: '2', apellido_nombre: 'GOMEZ ANA', cbu: CBU2, neto: 2000, listado: '911', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1, empresa: 'EMPRESA DOS' }),
];

const partido = ctrl.run(dosEmpresas, [], { period: '2026-07', acreditacionesConfig: { splitByEmpresa: true } });
assert('con splitByEmpresa y dos empresas, las listas se parten',
  partido.splitByEmpresa === true && partido.summary.listas === 2);

const junto = ctrl.run(dosEmpresas, [], { period: '2026-07', acreditacionesConfig: { splitByEmpresa: false } });
assert('sin splitByEmpresa, las dos empresas van en la misma lista',
  junto.splitByEmpresa === false && junto.summary.listas === 1 && junto.listas[0].count === 2);

const unaEmpresa = ctrl.run(
  [row({ legajo: '1', neto: 1000, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 })],
  [], { period: '2026-07', acreditacionesConfig: { splitByEmpresa: true } }
);
assert('con una sola empresa el corte por empresa no tiene efecto', unaEmpresa.splitByEmpresa === false);

// ── Casos de error ───────────────────────────────────────────────────────────

assert('run() sin filas devuelve error', typeof ctrl.run([], [], { period: '2026-07' }).error === 'string');
assert('run() con todas las filas de provisiones devuelve error',
  typeof ctrl.run([row({ liquidacion: PROVIS })], [], { period: '2026-07' }).error === 'string');
assert('summarize() de un error no rompe',
  ctrl.summarize(ctrl.run([], [], { period: '2026-07' })).status === 'warning');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
