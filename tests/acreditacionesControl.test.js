// acreditacionesControl.test.js — Test del control "Acreditaciones — Generar Reporte"
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/acreditacionesControl.test.js
//
// Cubre las reglas de specs/control-acreditaciones-axton.md: qué filas entran,
// la agrupación por (tipo, fecha) mergeando listados, la herencia de fecha por
// Listado (ancla principal) y por liquidación cruda (fallback sin Listado), la
// unificación de alertas por grupo pendiente y la asignación manual de fecha
// con regeneración del reporte (D-022).
//
// Y la ficha de la vista estándar (§4 de specs/vista-estandar-resultados.md):
// una por LISTA de acreditación, nunca por legajo (D-021), con todo lo de HR
// —conteo de empleados, bancos, alertas— en pantalla y nada de eso en el .xlsx
// que recibe Finanzas del cliente (D-020).

// registry.js importa (transitivamente) módulos de UI que registran un listener
// a nivel de módulo — necesitan un `document` mínimo fuera del navegador.
globalThis.document = { addEventListener: () => {} };

const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const {
  normalizeLiqType,
  assignAcreditacionesDate,
  unassignAcreditacionesDate,
  buildAcreditacionesFichas,
} = await import('./js/controls/acreditaciones.js');
const { fichaBodyHtml } = await import('./js/ui/fichaList.js');
const { EXPORT_CONTRACTS } = await import('./js/exports/contracts.js');

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
// Reproduce en chico dos casos reales distintos:
//   A) el archivo de julio de POP: un anticipo sin Listado ni fecha, cuya
//      liquidación cruda tiene VARIAS fechas en el mes → SIN ASIGNAR por
//      fallback de liquidación (no hay Listado que ancle).
//   B) el archivo de agosto de POP: un Listado completo (13 empleados) sin
//      NINGUNA fecha conocida → un solo grupo pendiente por Listado, con una
//      sola alerta en vez de 13, y asignable a mano (D-022).

const CBU1 = '0720000000000000000001';
const CBU2 = '0720000000000000000002';
const CBU3 = '0170000000000000000003';
const CBU4 = '0720000000000000000099';

const ANTICIPO = 'Anticipo de sueldo (De carga) Julio 2026 (Anticipos 07-2026) (C)';
const VACAC    = 'Anticipo vacaciones Julio 2026 (Anticipo vacaciones 07-2026) (C)';
const QUINC1   = '1er Quincena c/sobregiro Julio 2026 (1era Quincena 07-2026) (C)';
const PROVIS   = 'z PLASTIC - Provisiones (ene-abril-julio-Oct) Julio 2026 (C)';

const row = (o) => ({
  legajo: '1', apellido_nombre: 'SANGUINETTI JAVIER', cuit: '20-11111111-1',
  cliente: 'CLIENTE DEMO SA', uo_cliente: 'Mensualizados',
  liquidacion: ANTICIPO, neto: null, listado: '', descripcion: '',
  fecha_acreditacion: null, banco: 'BANCO DEMO', cbu: CBU1, empresa: 'CLIENTE DEMO SA',
  ...o,
});

const acredRows = [
  // Lista 1 — anticipos del 02-07, dos listados del mismo pago
  row({ legajo: '1', apellido_nombre: 'SANGUINETTI JAVIER',  cbu: CBU1, neto: 1000, listado: '900', fecha_acreditacion: '2026-07-02' }),
  row({ legajo: '2', apellido_nombre: 'FALCIONI JULIO',   cbu: CBU2, neto: 2000, listado: '901', fecha_acreditacion: '2026-07-02' }),
  // Lista 2 — vacaciones, mismo listado 900 pero otra liquidación
  row({ legajo: '3', apellido_nombre: 'LUCCHETTI CRISTIAN', cbu: CBU3, neto: 500, listado: '900', fecha_acreditacion: '2026-07-02', liquidacion: VACAC }),
  // Lista 3 — 1era quincena del 16-07: una fila con listado y otra sin nada más que el importe
  row({ legajo: '1', apellido_nombre: 'SANGUINETTI JAVIER',  cbu: CBU1, neto: 3000, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 }),
  row({ legajo: '2', apellido_nombre: 'FALCIONI JULIO',   cbu: CBU2, neto: 4000, listado: '',    fecha_acreditacion: null,         liquidacion: QUINC1 }),
  // En el listado de pago sin importe → entra a la lista, con alerta
  row({ legajo: '3', apellido_nombre: 'LUCCHETTI CRISTIAN', cbu: CBU3, neto: null, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 }),
  // Caso A: anticipo sin listado ni fecha, con OTRA fecha de anticipos en el mes → SIN ASIGNAR
  row({ legajo: '3', apellido_nombre: 'LUCCHETTI CRISTIAN', cbu: CBU3, neto: 700, listado: '', fecha_acreditacion: null }),
  row({ legajo: '2', apellido_nombre: 'FALCIONI JULIO',   cbu: CBU2, neto: 1500, listado: '902', fecha_acreditacion: '2026-07-21' }),
  // Caso B: Listado 950 completo (2 filas) sin ninguna fecha conocida
  row({ legajo: '4', apellido_nombre: 'DATOLO SOL',    cbu: CBU4, neto: 800,  listado: '950', fecha_acreditacion: null }),
  row({ legajo: '2', apellido_nombre: 'FALCIONI JULIO',   cbu: CBU2, neto: 900,  listado: '950', fecha_acreditacion: null }),
  // Provisiones: sin importe y sin listado → se descarta
  row({ legajo: '1', apellido_nombre: 'SANGUINETTI JAVIER',  cbu: CBU1, liquidacion: PROVIS }),
];

const results = ctrl.run(acredRows, [], { period: '2026-07' });

// ── Qué filas entran ─────────────────────────────────────────────────────────

assert('descarta la fila de provisiones (sin importe y sin listado)', results.summary.descartadas === 1);
assert('las 10 filas restantes entran al reporte', results.summary.acreditaciones === 10);

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
assert('lista 3: la fila sin listado ni fecha heredó la fecha por Listado (910 → única fecha)', l3.total === 7000);
assert('las listas quedan ordenadas por fecha y después por tipo',
  results.listas.map(l => `${l.fecha}/${l.code}`).join(' ')
    === '2026-07-02/A 2026-07-02/AV 2026-07-16/1Q 2026-07-21/A');

// Un legajo con dos acreditaciones en el mes NO se consolida: cada acreditación
// es una fila de su propia lista (a diferencia del resto de los controles, la
// unidad acá es la acreditación, no el empleado-mes).
const legajo1Rows = results.listas.flatMap(l => l.rows).filter(r => r.legajo === '1');
assert('un legajo con dos acreditaciones aparece una vez en cada lista, sin sumarse',
  legajo1Rows.length === 2 && legajo1Rows.map(r => r.neto).sort((a, b) => a - b).join(',') === '1000,3000');

// ── Grupos pendientes: uno por Listado/liquidación, no uno por fila ──────────

assert('hay 2 grupos pendientes: el anticipo sin listado (caso A) y el listado 950 (caso B)',
  results.sinAsignar.length === 2);

const casoA = results.sinAsignar.find(g => !g.listado);
assert('caso A (sin listado): fallback por liquidación cruda, 1 empleado, 700', casoA?.count === 1 && casoA.total === 700);
assert('caso A usa la clave "Q:<liquidación>" (no hay Listado que ancle)', casoA.key.startsWith('Q:'));

const casoB = results.sinAsignar.find(g => g.listado === '950');
assert('caso B (listado 950 completo sin fecha): AGRUPA los 2 empleados en 1 solo grupo',
  casoB?.count === 2 && casoB.total === 1700);
assert('caso B usa la clave "L:950"', casoB.key === 'L:950');

assert('SIN ASIGNAR no entra en las listas numeradas',
  results.listas.every(l => l.rows.every(r => r.neto !== 700 && r.neto !== 800 && r.neto !== 900)));

// La alerta es UNA por grupo pendiente, no una por empleado — esto es lo que
// D-022 vino a corregir (antes, el listado 950 hubiera generado 2 alertas
// idénticas en vez de 1 que dice "2 empleados").
const pendingAlerts = results.alerts.filter(a => a.tipo === 'sin_asignar');
assert('hay exactamente 2 alertas "sin_asignar" (una por grupo, no una por empleado)',
  pendingAlerts.length === 2);
assert('la alerta del listado 950 dice "2 empleados"',
  pendingAlerts.some(a => a.nombre === '2 empleados' && a.neto === 1700));

// ── Cierre contra el archivo de origen ───────────────────────────────────────

assert('el total del archivo incluye todas las filas con importe', results.summary.totalOrigen === 14400);
assert('total acreditado en listas + sin asignar = total del archivo',
  results.summary.totalAcreditado + results.summary.sinAsignarTotal === results.summary.totalOrigen);
assert('la diferencia del cierre da cero', results.summary.diferencia === 0);

// ── Asignación manual de fecha (D-022) ────────────────────────────────────────

// El listado 950 es tipo "A" (Anticipos de sueldo) — asignarle la fecha de la
// lista 1 (A, 02-07) lo mergea ahí. Asignarle la fecha de la lista 3 (que es
// otro tipo, 1Q) NO lo mergearía — la clave de agrupación es (tipo, fecha), no
// sólo la fecha.
const withDate = assignAcreditacionesDate(results, casoB.key, '2026-07-02');
assert('al asignar 02-07 al listado 950, se une a la lista existente de ese tipo+fecha (A)',
  withDate.listas.length === 4 && withDate.listas.find(l => l.n === 1).count === 4);
assert('el listado 950 queda registrado en los "listados" de la lista fusionada',
  withDate.listas.find(l => l.n === 1).listados.includes('950'));
assert('sólo queda pendiente el caso A después de asignar el caso B',
  withDate.sinAsignar.length === 1 && withDate.sinAsignar[0].key === casoA.key);
assert('el cierre sigue dando cero después de la asignación', withDate.summary.diferencia === 0);
assert('la asignación queda registrada en _cfg.dateOverrides',
  withDate._cfg.dateOverrides[casoB.key] === '2026-07-02');

// Asignar una fecha NUEVA (no existente) forma una lista propia en vez de mergear.
const withNewDate = assignAcreditacionesDate(results, casoB.key, '2026-07-25');
assert('asignar una fecha sin lista existente crea una lista nueva',
  withNewDate.listas.length === 5 && withNewDate.listas.some(l => l.fecha === '2026-07-25' && l.count === 2));

// Deshacer una asignación devuelve el grupo a sinAsignar.
const undone = unassignAcreditacionesDate(withDate, casoB.key);
assert('deshacer la asignación devuelve 2 grupos pendientes de nuevo', undone.sinAsignar.length === 2);
assert('deshacer no deja rastro en dateOverrides', !(casoB.key in (undone._cfg.dateOverrides || {})));

// La regeneración es idempotente sobre las filas originales: encadenar varias
// asignaciones no acumula estado espurio ni duplica filas.
const chained = assignAcreditacionesDate(
  assignAcreditacionesDate(results, casoB.key, '2026-07-02'),
  casoA.key, '2026-07-02'
);
assert('encadenar dos asignaciones no duplica acreditaciones', chained.summary.acreditaciones === 10);
assert('encadenar dos asignaciones no rompe el cierre', chained.summary.diferencia === 0);
assert('con las dos asignadas no queda ningún grupo pendiente', chained.sinAsignar.length === 0);

// ── Alertas de integridad (sin relación con la fecha) ────────────────────────

const alertTypes = new Set(results.alerts.map(a => a.tipo));
assert('marca la fila en listado de pago sin importe', alertTypes.has('sin_importe'));
assert('no inventa alertas de CBU sobre datos válidos',
  !alertTypes.has('cbu_invalido') && !alertTypes.has('cbu_compartido'));

const conCbuMalo = ctrl.run(
  [...acredRows, row({ legajo: '5', apellido_nombre: 'SILVA SANTIAGO', cbu: '123', neto: 100, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 })],
  [], { period: '2026-07' }
);
assert('detecta CBU con largo distinto de 22',
  conCbuMalo.alerts.some(a => a.tipo === 'cbu_invalido' && a.legajo === '5'));

const conCbuCompartido = ctrl.run(
  [...acredRows, row({ legajo: '6', apellido_nombre: 'SILVA SANTIAGO', cbu: CBU1, neto: 100, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 })],
  [], { period: '2026-07' }
);
assert('detecta CBU compartido entre dos legajos',
  conCbuCompartido.alerts.some(a => a.tipo === 'cbu_compartido' && a.legajo === '6'));

const conDuplicado = ctrl.run(
  [...acredRows, row({ legajo: '1', apellido_nombre: 'SANGUINETTI JAVIER', cbu: CBU1, neto: 1000, listado: '900', fecha_acreditacion: '2026-07-02' })],
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
assert('unitsTotal suma listas formadas + grupos pendientes', summary.unitsTotal === results.summary.listas + results.summary.pendingGroups);
assert('cuenta las listas con alerta + los grupos pendientes', summary.unitsWithDiff === results.summary.listasConAlerta + 2);
assert('el estado es warning porque hay grupos pendientes', summary.status === 'warning');

const limpio = ctrl.run(
  [
    row({ legajo: '1', neto: 1000, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 }),
    row({ legajo: '2', apellido_nombre: 'FALCIONI JULIO', cbu: CBU2, neto: 2000, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 }),
  ],
  [], { period: '2026-07' }
);
const summaryLimpio = ctrl.summarize(limpio);
assert('un mes sin alertas ni pendientes cierra en success', summaryLimpio.status === 'success');
assert('un mes sin alertas no marca ninguna unidad', summaryLimpio.unitsWithDiff === 0);

// ── Corte por empresa ────────────────────────────────────────────────────────

const dosEmpresas = [
  row({ legajo: '1', neto: 1000, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1, empresa: 'EMPRESA UNO' }),
  row({ legajo: '2', apellido_nombre: 'FALCIONI JULIO', cbu: CBU2, neto: 2000, listado: '911', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1, empresa: 'EMPRESA DOS' }),
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

// ── La ficha, una por LISTA de acreditación (§4 de la vista estándar) ────────
//
// Lo que se prueba acá es que la ficha NO se convierta en una ficha por legajo
// "para que quede igual a las otras": la unidad de este control es la
// acreditación y no el empleado-mes (D-021), y es la única excepción conocida a
// la regla de consolidar por legajo. Y que la pantalla pueda mostrar cuántos
// empleados tiene cada lista sin que eso se filtre al .xlsx que recibe Finanzas
// del cliente (D-020).

const fichas = buildAcreditacionesFichas(results);

assert('hay una ficha por lista de acreditación, no una por empleado (D-021)',
  fichas.length === results.summary.listas && fichas.length === 4);

// El legajo 1 tiene DOS acreditaciones en el mes (anticipo + 1era quincena) y
// hay 3 legajos distintos entre las listas: si la ficha fuera por legajo habría
// 3 tarjetas, y consolidar los importes sería el bug.
const legajosDistintos = new Set(results.listas.flatMap(l => l.rows).map(r => r.legajo));
assert('la ficha no consolida por legajo: 4 listas sobre 3 legajos distintos',
  legajosDistintos.size === 3 && fichas.length === 4);
assert('el avatar de la ficha es el número de lista, no un legajo',
  fichas.map(f => f.unit).join(',') === '1,2,3,4');
assert('las acreditaciones de las fichas suman las de las listas, sin sumarse entre sí',
  fichas.reduce((a, f) => a + f.lista.count, 0) === results.listas.reduce((a, l) => a + l.count, 0));

// ── La tarjeta cerrada: lista, empresa, liquidación, fecha, empleados y total ─

const f1 = fichas[0];   // lista 1 — anticipos del 02-07, 2 acreditaciones, sin alertas
assert('cerrada: la liquidación va con su código', f1.name === 'A — Anticipos de sueldo');
assert('cerrada: la empresa va en el tag, aunque el archivo tenga una sola',
  f1.tag.text === 'CLIENTE DEMO SA');
assert('cerrada: la fecha de acreditación va en la línea de contexto',
  f1.context.includes('Acreditan el 02/07/2026'));
assert('cerrada: cuántos empleados tiene la lista', f1.context.includes('2 acreditaciones'));
assert('cerrada: los listados que entraron a la lista', f1.context.includes('Listado 900 + 901'));
assert('cerrada: qué hoja del .xlsx es', f1.context.some(c => c.includes('01 A 02-07')));
assert('cerrada: el importe grande es el total de la lista',
  f1.amount === 3000 && f1.amountLabel === 'Total de la lista');
assert('una lista sin alertas sale en verde y sin badge de causa',
  f1.severity === 'ok' && f1.badge === undefined && f1.marks.length === 0);

const f3 = fichas[2];   // lista 3 — 1era quincena del 16-07, con una fila sin importe
assert('una lista con alertas sale en ámbar', f3.severity === 'warn');
assert('el badge dice cuántas hay para revisar', f3.badge.text === '1 para revisar');
assert('las marcas dicen de qué tipo son las alertas', f3.marks[0].text === 'Sin importe: 1');

// ── La tarjeta abierta ──────────────────────────────────────────────────────

assert('la tira arranca en cuántas hay en el listado de pago y termina en el total',
  f1.body.strip[0].label === 'En el listado de pago' && f1.body.strip[0].value === '2'
  && f1.body.strip.at(-1).label === 'Total que va al banco'
  && f1.body.strip.at(-1).value === 3000 && f1.body.strip.at(-1).invert === true);

assert('la fila sin importe se descuenta en la tira: 3 en el listado, 1 sin importe, 2 se acreditan',
  f3.body.strip.map(p => `${p.label}=${p.value}`).slice(0, 3).join(' ')
    === 'En el listado de pago=3 − Sin importe=1 Se acreditan=2',
  f3.body.strip.map(p => `${p.label}=${p.value}`).join(' '));
assert('lo que queda para revisar va al final de la tira, en rojo',
  f3.body.strip.at(-1).label === 'Para revisar' && f3.body.strip.at(-1).residuo === true);

const banco1 = f1.body.tables[0];
assert('la primera tabla es el desglose por banco', banco1.title.includes('por banco'));
assert('el desglose por banco suma el total de la lista',
  banco1.rows.reduce((a, r) => a + r.value, 0) === f1.lista.total
  && banco1.foot.value === f1.lista.total);
assert('una lista limpia no dibuja la tabla de alertas', f1.body.tables.length === 1);
assert('una lista con alertas sí la dibuja, y dice cuántas acreditaciones quedaron marcadas',
  f3.body.tables.length === 2 && f3.body.tables[1].foot.value === '1 de 3');

assert('una lista limpia no dibuja el detalle línea por línea', f1.body.detail === undefined);
assert('el detalle nombra el legajo y por qué quedó marcado',
  f3.body.detail.rows.length === 1
  && f3.body.detail.rows[0].legajo === '3'
  && f3.body.detail.rows[0].alerta === 'Sin importe');
assert('el detalle cierra con el neto de las acreditaciones marcadas (la sin importe suma 0)',
  f3.body.detail.foot.value === 0);

assert('la conclusión de una lista limpia dice que está para mandar',
  f1.body.conclusion.tone === 'ok' && f1.body.conclusion.title === 'La lista está para mandar');
assert('la conclusión de una lista con alertas es una instrucción, no un resumen',
  f3.body.conclusion.tone === 'warn'
  && f3.body.conclusion.text.startsWith('Antes de mandarla al banco, resolvé:')
  && f3.body.conclusion.text.includes('en el listado de pago sin importe: el banco no les va a acreditar nada')
  && f3.body.conclusion.text.includes('La tabla de acá arriba dice en qué legajo está cada una.'));

// Las dos obligatorias del §4 (tira y conclusión) las verifica la pieza
// compartida: si una ficha de este control no las declara, fichaBodyHtml tira.
for (const f of fichas) fichaBodyHtml(f.body, { id: f.id });
assert('todas las fichas pasan la validación de la pieza compartida (tira + conclusión)', true);

// ── El cuadre global manda sobre las listas ─────────────────────────────────
//
// Si el reporte no cierra contra el archivo de Axton, el reporte entero es
// sospechoso y ninguna lista se manda: es el mismo criterio con el que se cuenta
// el semáforo (summarizeAcreditacionesReporte).

const noCierra = {
  ...results,
  summary: { ...results.summary, diferencia: -50, totalOrigen: results.summary.totalOrigen + 50 },
};
const fichasNoCierra = buildAcreditacionesFichas(noCierra);
assert('si el cuadre global no da, TODAS las listas salen en rojo',
  fichasNoCierra.every(f => f.severity === 'error' && f.badge.text === 'El reporte no cierra'));
assert('y la tira termina en la diferencia del reporte, en rojo',
  fichasNoCierra[0].body.strip.at(-1).label === 'Diferencia del reporte'
  && fichasNoCierra[0].body.strip.at(-1).residuo === true);
assert('la conclusión manda a resolver el cuadre antes que la lista',
  fichasNoCierra[0].body.conclusion.tone === 'error'
  && fichasNoCierra[0].body.conclusion.text.includes('Resolvé el cuadre primero.'));

// ── Ningún conteo cambia ────────────────────────────────────────────────────

assert('las fichas marcadas son las mismas listas que cuenta el semáforo',
  fichas.filter(f => f.severity !== 'ok').length === results.summary.listasConAlerta);

const summaryDespues = ctrl.summarize(results);
assert('armar las fichas no mueve ningún conteo del semáforo (la función es pura)',
  summaryDespues.unitsTotal === summary.unitsTotal
  && summaryDespues.unitsWithDiff === summary.unitsWithDiff
  && results.listas.reduce((a, l) => a + l.count, 0) === 7);

// ── D-020: lo que la ficha muestra NO se filtra al archivo ──────────────────

assert('la ficha muestra conteo de empleados, bancos y alertas por lista…',
  f3.body.tables.length === 2 && f3.body.detail.rows.length === 1
  && f1.context.includes('2 acreditaciones'));
assert('…y el .xlsx que recibe Finanzas sigue con sus 7 columnas de pago y nada más (D-020)',
  EXPORT_CONTRACTS.acreditaciones_reporte.columns.map(c => c.key).join(',')
    === 'legajo,nombre,cuit,neto,fecha,banco,cbu');

// ── Casos de error ───────────────────────────────────────────────────────────

assert('run() sin filas devuelve error', typeof ctrl.run([], [], { period: '2026-07' }).error === 'string');
assert('run() con todas las filas de provisiones devuelve error',
  typeof ctrl.run([row({ liquidacion: PROVIS })], [], { period: '2026-07' }).error === 'string');
assert('summarize() de un error no rompe',
  ctrl.summarize(ctrl.run([], [], { period: '2026-07' })).status === 'warning');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
