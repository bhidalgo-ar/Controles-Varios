// loteMeta4.js — Los datos inventados con los que se miran, en un navegador
// real, las diez pantallas del lote Meta4/Marval de la vista estándar
// (Brutos, GS Pers, NR —los tres en sus dos modos—, Rendimiento vs Tabulado,
// Rendimiento x EE, Rendimiento vs Asiento y EE x CATEG).
//
// NO es una pantalla de la app: monta el `run()` real de cada control con datos
// inventados —jugadores de Banfield, como manda CLAUDE.md— y devuelve lo que su
// `render()` necesita. Sirve para dos cosas:
//   1. mirar las diez pantallas y sus tres temas sin IndexedDB, sin wizard y sin
//      un archivo de cliente en el repo;
//   2. leer de la tabla los números que muestra cada control (cuántos casos en
//      cada estado, el total de cada columna) ANTES y DESPUÉS de una migración
//      de la pantalla. Si un número se movió, la migración tiene un bug.
//
// Cada control trae a propósito un caso de cada estado: uno que cierra al
// centavo, uno con diferencia arriba del monto del cliente, uno adentro del
// margen y uno que no se puede comparar porque falta de un lado.

// Los `render*` se importan de su módulo y no del registry: el registry arrastra
// la base y los parsers, y este fixture tiene que poder abrirse sin nada de eso.
import { runBrutos, renderBrutosResults, runBrutosReporte, renderBrutosReporteResults } from '../../../js/controls/brutos.js';
import { runGsPers, renderGsPersResults, runGsPersReporte, renderGsPersReporteResults } from '../../../js/controls/gsPers.js';
import { runNr, renderNrResults, runNrReporte, renderNrReporteResults } from '../../../js/controls/nr.js';
import { runRendVsTabu, renderRendVsTabuResults } from '../../../js/controls/rendVsTabu.js';
import { runRendXEe, renderRendXEeResults } from '../../../js/controls/rendXEe.js';
import { runRendVsAsiento, renderRendVsAsientoResults } from '../../../js/controls/rendVsAsiento.js';
import { runCatXEmpleados, renderCatXEmpleadosResults } from '../../../js/controls/catXEmpleados.js';

const PERIODO = '2026-04';

// ── Tabulado ────────────────────────────────────────────────────────────────
// Una fila POR LIQUIDACIÓN, como sale de Meta4: el legajo 12 tiene dos (mensual
// y baja) y los dos lados se consolidan antes de comparar.

const TAB_COLS = {
  empleadoColumn:        'ID_EMPLEADO',
  apellidoNombreColumn:  'APELLIDO_NOMBRE',
  tabNombreColumn:       'NOMBRE',
  tabApellido1Column:    'APELLIDO_1',
  tabFecAltaColumn:      'FECHA_ALTA',
  tabFecBajaColumn:      'FECHA_BAJA',
  tabFecPagoColumn:      'FEC_PAGO',
  puestoColumn:          'N_PUESTO',
  idCCColumn:            'ID_CENTRO_COSTO',
  ccColumn:              'N_CENTRO_COSTO',
  deptoColumn:           'N_DEPARTAMENTO',
  tabSalBaseColumn:      '1003-SUELDO',
  tabACuFutAumenColumn:  '1017-A_CTA_FUT_AUMEN',
  tabGtosPersonalesColumn: '4899-GTOS_PERSONALES',
  tabDtoCocheraColumn:     '8805-DTO_COCHERA',
  tabVacNoGozadasColumn:   '4743-VAC_NO_GOZADAS',
  tabIndemPreavisoColumn:  '4750-INDEM_PREAVISO',
  tabGratExtraordColumn:   '4760-GRAT_EXTRAORD',
};

/** Una fila del Tabulado. Todo lo que no se pasa queda en cero o vacío. */
function tabRow(legajo, nombre, vals = {}) {
  return {
    ID_EMPLEADO: legajo,
    APELLIDO_NOMBRE: nombre,
    NOMBRE: nombre.split(' ').slice(1).join(' '),
    APELLIDO_1: nombre.split(' ')[0],
    FECHA_ALTA: '01/03/2019',
    FECHA_BAJA: '',
    FEC_PAGO: '30/04/2026',
    N_PUESTO: vals.puesto ?? 'ANALISTA',
    ID_CENTRO_COSTO: vals.ccCode ?? '11',
    N_CENTRO_COSTO: vals.cc ?? 'ADMINISTRACION',
    N_DEPARTAMENTO: vals.depto ?? 'SOPORTE',
    '1003-SUELDO': vals.sueldo ?? 0,
    '1017-A_CTA_FUT_AUMEN': vals.aCuFut ?? 0,
    '4899-GTOS_PERSONALES': vals.gtos ?? 0,
    '8805-DTO_COCHERA': vals.dto ?? 0,
    '4743-VAC_NO_GOZADAS': vals.vacNoGoz ?? 0,
    '4750-INDEM_PREAVISO': vals.preaviso ?? 0,
    '4760-GRAT_EXTRAORD': vals.gratExtra ?? 0,
    '1006-ASIG_ESTIMULO': vals.estimulo ?? 0,
    '6050-CARGAS_SS': vals.cargas ?? 0,
    '3670-PROV_MES': vals.provMes ?? 0,
    '3672-PROV_CCSS': vals.provCcss ?? 0,
  };
}

const TAB_ROWS = [
  // 10 — cierra al centavo en todo
  tabRow('10', 'SANGUINETTI JAVIER', {
    sueldo: 850000, aCuFut: 30000, gtos: 12000, dto: 4000,
    estimulo: 40000, cargas: 210000, provMes: 70000, provCcss: 18000,
  }),
  // 11 — diferencia grande de sueldo y de gastos personales
  tabRow('11', 'ALBELLA GUSTAVO', {
    sueldo: 935000, aCuFut: 30000, gtos: 20000, dto: 4000, preaviso: 480000,
    estimulo: 40000, cargas: 230000, provMes: 78000, provCcss: 19000,
    cc: 'PRODUCCION', ccCode: '22', puesto: 'OPERARIO',
  }),
  // 12 — dos liquidaciones en el mes (mensual + baja): se consolidan
  tabRow('12', 'FALCIONI JULIO CESAR', {
    sueldo: 600000, aCuFut: 20000, gtos: 6000, dto: 2000, vacNoGoz: 150000,
    estimulo: 25000, cargas: 150000, provMes: 50000, provCcss: 12000,
    cc: 'PRODUCCION', ccCode: '22', puesto: 'SUPERVISOR',
  }),
  tabRow('12', 'FALCIONI JULIO CESAR', {
    sueldo: 400000, aCuFut: 10000, gtos: 4000, dto: 1000, vacNoGoz: 90000,
    estimulo: 15000, cargas: 100000, provMes: 30000, provCcss: 8000,
    cc: 'PRODUCCION', ccCode: '22', puesto: 'SUPERVISOR',
  }),
  // 14 — diferencia chica: adentro del margen del cliente, no es un hallazgo
  tabRow('14', 'LUCCHETTI CRISTIAN', {
    sueldo: 705000, aCuFut: 15000, gtos: 9040, dto: 3000, gratExtra: 60000,
    estimulo: 30000, cargas: 175000, provMes: 58000, provCcss: 14000,
    cc: 'ADMINISTRACION', ccCode: '11', puesto: 'ANALISTA',
  }),
  // 15 — está en el Tabulado y no en el reporte del sistema
  tabRow('15', 'ERVITI WALTER', {
    sueldo: 780000, aCuFut: 25000, gtos: 11000, dto: 3500,
    estimulo: 35000, cargas: 195000, provMes: 64000, provCcss: 16000,
    cc: 'ADMINISTRACION', ccCode: '11', puesto: 'ANALISTA', depto: 'FINANZAS',
  }),
];

// ── Brutos ──────────────────────────────────────────────────────────────────

const BRUTOS_ROWS = [
  { Legajo: '10', SAL_BASE: 850000, A_CTA_FUT_AUMEN: 30000 },
  { Legajo: '11', SAL_BASE: 920000, A_CTA_FUT_AUMEN: 30000 },   // −15.000 de sueldo
  { Legajo: '12', SAL_BASE: 600000, A_CTA_FUT_AUMEN: 20000 },   // mensual
  { Legajo: '12', SAL_BASE: 400000, A_CTA_FUT_AUMEN: 10000 },   // baja: 1.000.000 en total
  { Legajo: '14', SAL_BASE: 704960, A_CTA_FUT_AUMEN: 15000 },   // 40 de diferencia: margen
  { Legajo: '13', SAL_BASE: 500000, A_CTA_FUT_AUMEN: 10000 },   // no está en el Tabulado
];

const BRUTOS_MAPPING = {
  period: PERIODO,
  brutos: { legajoColumn: 'Legajo', salBaseColumn: 'SAL_BASE', aCuFutAumenColumn: 'A_CTA_FUT_AUMEN' },
  tab: TAB_COLS,
};

// ── GS Pers ─────────────────────────────────────────────────────────────────

const GS_PERS_ROWS = [
  { Legajo: '10', GTOS_PERSONALES: 12000, DTO_COCHERA: 4000 },
  { Legajo: '11', GTOS_PERSONALES: 17500, DTO_COCHERA: 4000 },  // 2.500 de diferencia
  { Legajo: '12', GTOS_PERSONALES: 6000,  DTO_COCHERA: 2000 },
  { Legajo: '12', GTOS_PERSONALES: 4000,  DTO_COCHERA: 1000 },
  { Legajo: '14', GTOS_PERSONALES: 9000,  DTO_COCHERA: 3000 },  // 40 de diferencia: margen
  { Legajo: '13', GTOS_PERSONALES: 5000,  DTO_COCHERA: 1500 },  // no está en el Tabulado
];

const GS_PERS_MAPPING = {
  period: PERIODO,
  gs_pers: { legajoColumn: 'Legajo', gtosPersonalesColumn: 'GTOS_PERSONALES', dtoCocheraColumn: 'DTO_COCHERA' },
  tab: TAB_COLS,
};

// ── NR ──────────────────────────────────────────────────────────────────────

const NR_ROWS = [
  { Legajo: '11', INDEM_PREAVISO: 480000, VAC_NO_GOZADAS: 0,      GRAT_EXTRAORD: 0 },
  { Legajo: '12', INDEM_PREAVISO: 0,      VAC_NO_GOZADAS: 150000, GRAT_EXTRAORD: 0 },
  { Legajo: '12', INDEM_PREAVISO: 0,      VAC_NO_GOZADAS: 88000,  GRAT_EXTRAORD: 0 },  // 2.000 menos
  { Legajo: '14', INDEM_PREAVISO: 0,      VAC_NO_GOZADAS: 0,      GRAT_EXTRAORD: 59960 }, // margen
  { Legajo: '13', INDEM_PREAVISO: 220000, VAC_NO_GOZADAS: 0,      GRAT_EXTRAORD: 0 },  // no está en el Tabulado
];

const NR_MAPPING = {
  period: PERIODO,
  nr: {
    legajoColumn: 'Legajo',
    indemPreavisoColumn: 'INDEM_PREAVISO',
    vacNoGozadasColumn:  'VAC_NO_GOZADAS',
    gratExtraordColumn:  'GRAT_EXTRAORD',
  },
  tab: TAB_COLS,
};

// ── Rendimiento (vs Tabulado, x EE y vs Asiento) ────────────────────────────
//
// La agrupación de conceptos va explícita y con un concepto por categoría: el
// default del repo lista decenas de códigos y acá lo que importa es que se vea
// la pantalla, no reproducir el mapeo entero de Marval.

const CONCEPT_GROUPING = {
  precio:   [{ code: '1003', sign: 1 }],
  estimulo: [{ code: '1006', sign: 1 }],
  cargas:   [{ code: '6050', sign: 1 }],
  provMes:  [{ code: '3670', sign: 1 }],
  provCcss: [{ code: '3672', sign: 1 }],
};

const REND_COLS = {
  ccCodeColumn: 'CC', ccNameColumn: 'CENTRO DE COSTO',
  precioColumn: 'PRECIO', estimuloColumn: 'ESTIMULO', cargasColumn: 'CARGAS SS',
  provMesColumn: 'PROV MES', provCcssColumn: 'PROV CCSS MES',
};

// ADMINISTRACION: legajos 10, 14 y 15 · PRODUCCION: 11 y las dos filas del 12.
const REND_ROWS = [
  { CC: '11', 'CENTRO DE COSTO': 'ADMINISTRACION',
    PRECIO: 2335000, ESTIMULO: 105000, 'CARGAS SS': 580000, 'PROV MES': 192000, 'PROV CCSS MES': 48000 },
  { CC: '22', 'CENTRO DE COSTO': 'PRODUCCION',
    PRECIO: 1900000, ESTIMULO: 80000, 'CARGAS SS': 480000, 'PROV MES': 158000, 'PROV CCSS MES': 39000 },
  { CC: '33', 'CENTRO DE COSTO': 'DEPOSITO',
    PRECIO: 410000, ESTIMULO: 12000, 'CARGAS SS': 98000, 'PROV MES': 33000, 'PROV CCSS MES': 8000 },
];

const REND_MAPPING = {
  period: PERIODO, rend: REND_COLS, tab: TAB_COLS, conceptGrouping: CONCEPT_GROUPING,
};

const COSTO_TOTAL_ROWS = [
  { Legajo: '10', 'COSTO TOTAL': 1188000 },
  { Legajo: '11', 'COSTO TOTAL': 1290000 },   // diferencia grande contra el calculado
  { Legajo: '12', 'COSTO TOTAL': 1390000 },
  { Legajo: '14', 'COSTO TOTAL': 981960 },    // 40 de diferencia: margen
  { Legajo: '13', 'COSTO TOTAL': 640000 },    // no está en el Tabulado
];

const COSTO_TOTAL_MAPPING = {
  period: PERIODO,
  costoTotal: { legajoColumn: 'Legajo', costoTotalColumn: 'COSTO TOTAL' },
  tab: TAB_COLS, conceptGrouping: CONCEPT_GROUPING,
};

/** Una fila de la Contabilidad Desglosada. */
function contaRow(cc, legajo, cuenta, concepto, debe, haber = 0, nombreCuenta = '', nombreConcepto = '') {
  return {
    cc_nombre: cc, id_empleado: legajo,
    cuenta_contab: cuenta, n_cuenta_contable: nombreCuenta,
    id_concepto: concepto, nombre_largo: nombreConcepto,
    apellido_1: '', nombre: '',
    debe, haber,
  };
}

const CONTA_ROWS = [
  // ADMINISTRACION — cuadra contra el Rendimiento salvo por PRECIO
  contaRow('ADMINISTRACION', '10', '5208001', '1003', 2340000, 0, 'REMUNERACIONES', 'SUELDO'),
  contaRow('ADMINISTRACION', '10', '5208006', '1006', 105000, 0, 'ASIG. ESTIMULO', 'ESTIMULO'),
  contaRow('ADMINISTRACION', '10', '5208005', '6050', 580000, 0, 'CARGAS SOCIALES', 'CONTRIBUCIONES'),
  contaRow('ADMINISTRACION', '10', '5208007', '3670', 192000, 0, 'PROVISIONES', 'PROV SAC'),
  contaRow('ADMINISTRACION', '14', '5208003', '3672', 48000, 0, 'PROVISIONES CCSS', 'PROV CCSS SAC'),
  // PRODUCCION — cuadra al centavo
  contaRow('PRODUCCION', '11', '5208001', '1003', 1900000, 0, 'REMUNERACIONES', 'SUELDO'),
  contaRow('PRODUCCION', '11', '5208006', '1006', 80000, 0, 'ASIG. ESTIMULO', 'ESTIMULO'),
  contaRow('PRODUCCION', '12', '5208005', '6050', 480000, 0, 'CARGAS SOCIALES', 'CONTRIBUCIONES'),
  contaRow('PRODUCCION', '12', '5208007', '3670', 158000, 0, 'PROVISIONES', 'PROV SAC'),
  contaRow('PRODUCCION', '12', '5208003', '3672', 39000, 0, 'PROVISIONES CCSS', 'PROV CCSS SAC'),
  // Un CC que está en la CONTA y no en el Rendimiento
  contaRow('SERVICIOS GENERALES', '15', '5208001', '1003', 260000, 0, 'REMUNERACIONES', 'SUELDO'),
];

const RVA_MAPPING = {
  period: PERIODO, rend: REND_COLS, contaRows: CONTA_ROWS,
};

// ── EE x CATEG ──────────────────────────────────────────────────────────────

// El puesto se renombró en el sistema de RRHH y no en Meta4: no coincide en 3 de
// los 5 legajos que están en los dos archivos. Es lo que la solapa "Por campo"
// tiene que hacer visible de una — no son tres errores de carga, es el archivo.
// El centro de costo y el departamento, en cambio, fallan en un legajo cada uno:
// ésos sí son de ese empleado. El 15 tiene los dos casos a la vez.
const CAT_ROWS = [
  { ID: '10', APELLIDO: 'SANGUINETTI', NOMBRE: 'JAVIER',      PUESTO: 'ANALISTA SR', CC: 'ADMINISTRACION', DEPTO: 'SOPORTE',  'F. ALTA': '01/03/2019', 'F. BAJA': '' },
  { ID: '11', APELLIDO: 'ALBELLA',     NOMBRE: 'GUSTAVO',     PUESTO: 'OPERARIO',    CC: 'DEPOSITO',       DEPTO: 'SOPORTE',  'F. ALTA': '01/03/2019', 'F. BAJA': '' },
  { ID: '12', APELLIDO: 'FALCIONI',    NOMBRE: 'JULIO CESAR', PUESTO: 'SUPERVISOR',  CC: 'PRODUCCION',     DEPTO: 'SOPORTE',  'F. ALTA': '01/03/2019', 'F. BAJA': '' },
  { ID: '14', APELLIDO: 'LUCCHETTI',   NOMBRE: 'CRISTIAN',    PUESTO: 'ANALISTA SR', CC: 'ADMINISTRACION', DEPTO: 'SOPORTE',  'F. ALTA': '01/03/2019', 'F. BAJA': '' },
  { ID: '15', APELLIDO: 'ERVITI',      NOMBRE: 'WALTER',      PUESTO: 'ANALISTA SR', CC: 'ADMINISTRACION', DEPTO: 'LEGALES',  'F. ALTA': '01/03/2019', 'F. BAJA': '' },
  { ID: '16', APELLIDO: 'SILVA',       NOMBRE: 'SANTIAGO',    PUESTO: 'ANALISTA',    CC: 'ADMINISTRACION', DEPTO: 'SOPORTE',  'F. ALTA': '01/04/2026', 'F. BAJA': '' },
  { ID: '17', APELLIDO: 'DATOLO',      NOMBRE: 'JESUS',       PUESTO: 'OPERARIO',    CC: 'PRODUCCION',     DEPTO: 'SOPORTE',  'F. ALTA': '01/03/2019', 'F. BAJA': '15/03/2026' },
];

const CAT_MAPPING = {
  period: PERIODO,
  cat: {
    idEmpColumn: 'ID', apellidoColumn: 'APELLIDO', nombreColumn: 'NOMBRE',
    puestoColumn: 'PUESTO', centroCostoColumn: 'CC', departamentoColumn: 'DEPTO',
    fAltaColumn: 'F. ALTA', fBajaColumn: 'F. BAJA',
  },
  tab: TAB_COLS,
};

// ── Los diez controles ──────────────────────────────────────────────────────

export const CONTROLES = {
  brutos: { label: 'Brutos — Controlar',
    run: () => runBrutos(BRUTOS_ROWS, TAB_ROWS, BRUTOS_MAPPING), render: renderBrutosResults },
  brutos_reporte: { label: 'Brutos — Generar Reporte',
    run: () => runBrutosReporte([], TAB_ROWS, BRUTOS_MAPPING), render: renderBrutosReporteResults },
  gs_pers: { label: 'GS Pers — Controlar',
    run: () => runGsPers(GS_PERS_ROWS, TAB_ROWS, GS_PERS_MAPPING), render: renderGsPersResults },
  gs_pers_reporte: { label: 'GS Pers — Generar Reporte',
    run: () => runGsPersReporte([], TAB_ROWS, GS_PERS_MAPPING), render: renderGsPersReporteResults },
  nr: { label: 'Control NR — Controlar',
    run: () => runNr(NR_ROWS, TAB_ROWS, NR_MAPPING), render: renderNrResults },
  nr_reporte: { label: 'Control NR — Generar Reporte',
    run: () => runNrReporte([], TAB_ROWS, NR_MAPPING), render: renderNrReporteResults },
  rend_vs_tabu: { label: 'Rendimiento vs Tabulado',
    run: () => runRendVsTabu(REND_ROWS, TAB_ROWS, REND_MAPPING), render: renderRendVsTabuResults },
  rend_x_ee: { label: 'Rendimiento x EE',
    run: () => runRendXEe(COSTO_TOTAL_ROWS, TAB_ROWS, COSTO_TOTAL_MAPPING), render: renderRendXEeResults },
  rend_vs_asiento: { label: 'Rendimiento vs Asiento',
    run: () => runRendVsAsiento(REND_ROWS, [], RVA_MAPPING), render: renderRendVsAsientoResults },
  cat_x_empleados: { label: 'EE x CATEG',
    run: () => runCatXEmpleados(CAT_ROWS, TAB_ROWS, CAT_MAPPING), render: renderCatXEmpleadosResults },
};

/** El monto de diferencia del cliente con el que se mira el lote (D-069). */
export const TOLERANCIA = 100;
