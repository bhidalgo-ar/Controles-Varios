// fileTypes.js — La ficha de cada tipo de archivo que la app sabe leer.
//
// **Un tipo de archivo nuevo se agrega acá y en ningún otro lado.** Antes de
// este módulo, agregar uno tocaba ~12 puntos repartidos entre `fileUpload.js` y
// `controlsWizard.js` sin ningún guard entre ellos: el import del parser, una
// entrada en `FIELD_DEFS`, un `case` del `switch` de parseo, una entrada en el
// mapa de etiquetas, una rama del detector de encabezados, una rama de la línea
// de metadata… Olvidarse de una no rompe nada visible — el archivo sube igual y
// algo queda mal en silencio (el síntoma clásico: no muestra "N registros").
// Ver `specs/fase-4-registro-declarativo.md`.
//
// Cada entrada declara:
//   label          {string}    lo que ve el analista en la zona de drop
//   fields         {Array}     columnas a mapear — `[]` si el formato es fijo.
//                              El `required` de acá es el flag legado que
//                              `blocksProgress()` usa como piso (D-041/D-045).
//   parse          {function}  (arrayBuffer, mapping) → { parsedRows, parseMetadata, … }
//   detectHeaders  {function}  (arrayBuffer) → { headers, preview }
//   autoDetect     {function}  (headers, catalogRows) → mapping propuesto, o
//                              `null` si este tipo no tiene auto-detección.
//                              **Se declara siempre, aunque sea `null`**: sin
//                              eso queda `undefined`, indistinguible de haberlo
//                              olvidado, y el analista mapea a mano un archivo
//                              que la app sabía leer sola
//   meta           {function}  (parseMetadata) → HTML de la línea "N registros"
//   nameMapping    {boolean}   muestra el selector especial de apellido/nombre
//                              (una columna vs. dos) — sólo formatos con una
//                              fila por empleado
//   fixedFormat    {boolean}   se parsea derecho, sin formulario de mapeo
//   flow           {string}    cómo se sube: 'single' (default, un archivo por
//                              slot), 'multi' (N archivos que se concatenan) o
//                              'multi-periodo' (N archivos, cada uno con su mes)
//   dropLabel      {string}    override del texto de la zona de drop, sólo
//                              donde ya divergía de `label` (ver acumuladores)
//   dropHint       {string}    aclaración extra en la zona de drop
//   aliasOf        {string}    comparte la ficha de otro tipo (ver tab_prev_file)
//
// El Tabulado declara además `extraFieldGroups` y `conceptCodeToKey`: las
// columnas que se piden en el Paso 2 (no al subir el archivo) y sólo cuando
// algún control seleccionado las necesita. Ver el comentario en su ficha.
//
// **`fixedFormat` NO se deriva de `fields: []`, y es a propósito.**
// `acreditaciones_file` no declara ninguna columna a mapear y aun así pasa por
// la pantalla de confirmación (vista previa + "Confirmar y procesar"), porque el
// analista tiene que ver que subió el archivo correcto antes de procesarlo.
// Derivarlo le sacaría esa pantalla sin que nadie lo pidiera.

import { detectHeaders as detectHeadersXlsx, parseNominaMaestra } from '../parsers/nominaMaestra.js';
import { parseResumenLargo } from '../parsers/resumenLargoExcel.js';
import { parseResumenTabulado } from '../parsers/resumenTabuladoHorizontalExcel.js';
import { parseTabuladoControl, detectHeaders as detectHeadersTabulado, autoDetectTabMapping } from '../parsers/tabuladoControl.js';
import { parseCatEmpleados, autoDetectCatMapping } from '../parsers/catEmpleados.js';
import { parseBrutos, autoDetectBrutosMapping } from '../parsers/brutosParser.js';
import { parseGsPers, autoDetectGsPersMapping } from '../parsers/gsPersParser.js';
import { parseNr, autoDetectNrMapping } from '../parsers/nrParser.js';
import { parseRendimiento, autoDetectRendimientoMapping } from '../parsers/rendimientoParser.js';
import { parseCostoTotal, autoDetectCostoTotalMapping } from '../parsers/costoTotalParser.js';
import { parseConta } from '../parsers/contaExcel.js';
import { parseAcreditaciones } from '../parsers/acreditacionesParser.js';
import { parseAcumuladores } from '../parsers/acumuladoresParser.js';
import {
  parseFinadietAsiento,
  detectHeaders as detectHeadersFinadietAsiento,
  autoDetectFinadietAsientoMapping,
} from '../parsers/finadietAsientoParser.js';
import { parseCcXEmpleado } from '../parsers/ccXEmpleadoExcel.js';
import { parseConceptCatalog } from '../parsers/conceptCatalog.js';

// ── Líneas de metadata ───────────────────────────────────────────────────────
// Lo que se muestra al lado del nombre del archivo una vez cargado. Son tres
// moldes: la mayoría informa filas, los formatos por empleado informan legajos y
// conceptos, y dos tienen su propio detalle.

const metaRegistros = (m) => `${m?.totalRows ?? 0} registros`;

const metaLegajosConceptos = (m) =>
  `${m?.uniqueLegajos ?? 0} legajos · ${m?.detectedConcepts?.length ?? 0} conceptos`;

const metaCatEmpleados = (m) => {
  const filtradas = m?.filtradas ?? 0;
  return `${m?.activos ?? 0} activos de ${m?.total ?? 0} filas`
    + (filtradas > 0 ? ` &nbsp;·&nbsp; <span class="badge badge--warning">${filtradas} sumatorias excluidas</span>` : '');
};

const metaConceptCatalog = (m) =>
  `${m?.totalRows ?? 0} conceptos`
  + (m?.remu         ? ` · ${m.remu} remu`                   : '')
  + (m?.noRemu       ? ` · ${m.noRemu} no_remu`              : '')
  + (m?.aporte       ? ` · ${m.aporte} aportes`              : '')
  + (m?.contribucion ? ` · ${m.contribucion} contribuciones` : '');

// ── Las fichas ───────────────────────────────────────────────────────────────

export const FILE_TYPES = {
  nomina_maestra: {
    label: 'Nómina Maestra',
    parse: parseNominaMaestra,
    detectHeaders: detectHeadersXlsx,
    autoDetect: null,
    meta: metaLegajosConceptos,
    nameMapping: true,
    fields: [
      { key: 'legajoColumn',          label: 'Columna de Legajo',            required: true },
      { key: 'conceptColumnsStartAt', label: 'Primera columna de conceptos', required: true },
    ],
  },

  resumen_largo_excel: {
    label: 'Resumen Largo Excel',
    parse: parseResumenLargo,
    detectHeaders: detectHeadersXlsx,
    autoDetect: null,
    meta: metaLegajosConceptos,
    fields: [
      { key: 'legajoColumnLong',  label: 'Columna de Legajo',             required: true },
      { key: 'conceptCodeColumn', label: 'Columna de Código de concepto',  required: true },
      { key: 'importColumn',      label: 'Columna de Importe',             required: true },
    ],
  },

  resumen_tabulado_horizontal: {
    label: 'Resumen Tabulado Horizontal',
    parse: parseResumenTabulado,
    detectHeaders: detectHeadersXlsx,
    autoDetect: null,
    meta: metaLegajosConceptos,
    nameMapping: true,
    fields: [
      { key: 'legajoColumn',          label: 'Columna de Legajo',            required: true },
      { key: 'conceptColumnsStartAt', label: 'Primera columna de conceptos', required: true },
    ],
  },

  // El Tabulado de algunos clientes (OPmobility / Plastic Omnium Florida) llega
  // con extensión .xls pero es HTML — necesita el detector HTML-aware de
  // tabuladoControl.js. El detector plano de nominaMaestra.js no lo lee.
  tab_control: {
    label: 'Tabulado (Controles)',
    parse: parseTabuladoControl,
    detectHeaders: detectHeadersTabulado,
    autoDetect: autoDetectTabMapping,
    meta: metaRegistros,
    fields: [
      { key: 'empleadoColumn',        label: 'Columna de Empleado (ID)',           required: true  },
      { key: 'apellidoNombreColumn',  label: 'Columna de Apellido y Nombre',       required: false },
      { key: 'puestoColumn',          label: 'Columna de Puesto',                  required: false },
      { key: 'idCCColumn',            label: 'Columna de ID Centro de Costo',      required: false },
      { key: 'ccColumn',              label: 'Columna de Centro de Costo',         required: false },
      { key: 'deptoColumn',           label: 'Columna de Departamento/Unidad',     required: false },
      { key: 'cuilColumn',            label: 'Columna de CUIL',                    required: false },
    ],

  // ── Columnas del Tabulado que piden Brutos / GS Pers / NR ──────────────────
  //
  // Son columnas del MISMO archivo que `fields`, pero no se piden al subirlo:
  // se piden en el Paso 2, y sólo las que necesita algún control seleccionado —
  // no tiene sentido pedirle los 18 conceptos de NR a quien corre sólo Brutos.
  // Vivían en `controlsWizard.js` como cinco arrays sueltos; acá quedan junto al
  // resto de las columnas del Tabulado, que es lo que permite verificar que cada
  // `from` de un contrato de export apunte a un campo que existe de verdad.
  //
  // Cada grupo declara `requiredBy`: qué control lo pide, o `null` si va siempre.
  // Esa distinción no es cosmética — los dos consumidores usan conjuntos
  // distintos y así queda dicho en vez de quedar implícito:
  //   · el PANEL muestra los grupos activos MÁS los de `requiredBy: null`
  //   · el GATE de "no podés avanzar" mira SÓLO los grupos con `requiredBy`
  // Hoy da igual (los 5 campos compartidos son todos OPCIONAL en los contratos,
  // así que gatearlos sería un no-op), pero el día que uno suba a OBLIGATORIA la
  // diferencia importa, y este paso no es donde se decide eso.
  extraFieldGroups: [
    { id: 'brutos', requiredBy: 'brutos', fields: [
      { key: 'tabSalBaseColumn',     label: 'Sueldo — columna en Tabulado',          required: true },
      { key: 'tabACuFutAumenColumn', label: 'A_CTA_FUT_AUMEN — columna en Tabulado', required: true },
    ] },
    { id: 'gsPers', requiredBy: 'gsPers', fields: [
      { key: 'tabGtosPersonalesColumn', label: 'GTOS_PERSONALES — columna en Tabulado', required: true },
      { key: 'tabDtoCocheraColumn',     label: 'DTO_COCHERA — columna en Tabulado',      required: true },
    ] },
    { id: 'nrIndem', requiredBy: 'nr', header: 'Indemnizatorios', fields: [
      { key: 'tabIndemPreavisoColumn',  label: 'INDEM_PREAVISO — columna en Tabulado',  required: false },
      { key: 'tabSacPreavisoColumn',    label: 'SAC_PREAVISO — columna en Tabulado',    required: false },
      { key: 'tabIndemAntDespColumn',   label: 'INDEM_ANT_DESP — columna en Tabulado',  required: false },
      { key: 'tabIndemAntFalleColumn',  label: 'INDEM_ANT_FALLE — columna en Tabulado', required: false },
      { key: 'tabIndemIntegColumn',     label: 'INDEM_INTEG — columna en Tabulado',     required: false },
      { key: 'tabSacIndemIntegColumn',  label: 'SAC_INDEM_INTEG — columna en Tabulado', required: false },
      { key: 'tabIndmMaternidadColumn', label: 'INDM_MATERNIDAD — columna en Tabulado', required: false },
      { key: 'tabVacNoGozadasColumn',   label: 'VAC_NO_GOZADAS — columna en Tabulado',  required: false },
      { key: 'tabVacNoGozSacColumn',    label: 'VAC_NO_GOZ_SAC — columna en Tabulado',  required: false },
      { key: 'tabGratVacColumn',        label: 'GRAT_VAC — columna en Tabulado',        required: false },
      { key: 'tabGraVacnogSacColumn',   label: 'GRA_VACNOG_SAC — columna en Tabulado',  required: false },
      { key: 'tabIndemFuerMayColumn',   label: 'INDEM_FUER_MAY — columna en Tabulado',  required: false },
      { key: 'tabIndemEmbarazoColumn',  label: 'INDEM_EMBARAZO — columna en Tabulado',  required: false },
    ] },
    { id: 'nrOtros', requiredBy: 'nr', header: 'Otros NR', fields: [
      { key: 'tabReinHomeOficeColumn',  label: 'REIN_HOME_OFICE — columna en Tabulado', required: false },
      { key: 'tabGratExtraordColumn',   label: 'GRAT_EXTRAORD — columna en Tabulado',   required: false },
      { key: 'tabAsigPasColumn',        label: 'ASIG_PAS — columna en Tabulado',        required: false },
      { key: 'tabReintGuardColumn',     label: 'REINT_GUARD — columna en Tabulado',     required: false },
      { key: 'tabIncrementoStColumn',   label: 'INCREMENTO_ST — columna en Tabulado',   required: false },
    ] },
    { id: 'shared', requiredBy: null, fields: [
      { key: 'tabNombreColumn',      label: 'Columna NOMBRE',     required: false },
      { key: 'tabApellido1Column',   label: 'Columna APELLIDO_1', required: false },
      { key: 'tabFecAltaColumn',     label: 'Columna FECHA_ALTA', required: false },
      { key: 'tabFecBajaColumn',     label: 'Columna FECHA_BAJA', required: false },
      { key: 'tabFecPagoColumn',     label: 'Columna FEC_PAGO',   required: false },
    ] },
  ],

  // CODIGO del catálogo → clave del tabExtraConfig. Lo usa la auto-detección
  // del Paso 2 para resolver por código de concepto lo que el catálogo del
  // cliente no resolvió por nombre (D-039).
  conceptCodeToKey: {
    'SAL_BASE':        'tabSalBaseColumn',
    'A_CTA_FUT_AUMEN': 'tabACuFutAumenColumn',
    'GTOS_PERSONALES': 'tabGtosPersonalesColumn',
    'DTO_COCHERA':     'tabDtoCocheraColumn',
    'INDEM_PREAVISO':  'tabIndemPreavisoColumn',
    'SAC_PREAVISO':    'tabSacPreavisoColumn',
    'INDEM_ANT_DESP':  'tabIndemAntDespColumn',
    'INDEM_ANT_FALLE': 'tabIndemAntFalleColumn',
    'INDEM_INTEG':     'tabIndemIntegColumn',
    'SAC_INDEM_INTEG': 'tabSacIndemIntegColumn',
    'INDM_MATERNIDAD': 'tabIndmMaternidadColumn',
    'VAC_NO_GOZADAS':  'tabVacNoGozadasColumn',
    'VAC_NO_GOZ_SAC':  'tabVacNoGozSacColumn',
    'GRAT_VAC':        'tabGratVacColumn',
    'GRA_VACNOG_SAC':  'tabGraVacnogSacColumn',
    'INDEM_FUER_MAY':  'tabIndemFuerMayColumn',
    'INDEM_EMBARAZO':  'tabIndemEmbarazoColumn',
    'REIN_HOME_OFICE': 'tabReinHomeOficeColumn',
    'GRAT_EXTRAORD':   'tabGratExtraordColumn',
    'ASIG_PAS':        'tabAsigPasColumn',
    'REINT_GUARD':     'tabReintGuardColumn',
    'INCREMENTO_ST':   'tabIncrementoStColumn',
  },
  },

  cat_empleados: {
    label: 'Reporte de Categorías',
    parse: parseCatEmpleados,
    detectHeaders: detectHeadersXlsx,
    autoDetect: autoDetectCatMapping,
    meta: metaCatEmpleados,
    fields: [
      { key: 'idEmpColumn',           label: 'Columna de ID Empleado',             required: true  },
      { key: 'puestoColumn',          label: 'Columna de Puesto',                  required: true  },
      { key: 'idCenColumn',           label: 'Columna de ID Centro de Costo',      required: true  },
      { key: 'centroCostoColumn',     label: 'Columna de Centro de Costo',         required: true  },
      { key: 'departamentoColumn',    label: 'Columna de Departamento',            required: true  },
      { key: 'fBajaColumn',           label: 'Columna de Fecha de Baja (F. BAJA)', required: true  },
      { key: 'fAltaColumn',           label: 'Columna de Fecha de Alta (F. ALTA)', required: false },
      { key: 'apellidoColumn',        label: 'Columna de Apellido',                required: false },
      { key: 'nombreColumn',          label: 'Columna de Nombre',                  required: false },
      { key: 'cuilColumn',            label: 'Columna de CUIL',                    required: false },
      { key: 'idPueColumn',           label: 'Columna de ID Puesto',               required: false },
    ],
  },

  brutos_file: {
    label: 'Reporte de Brutos',
    parse: parseBrutos,
    detectHeaders: detectHeadersXlsx,
    autoDetect: autoDetectBrutosMapping,
    meta: metaRegistros,
    fields: [
      { key: 'legajoColumn',          label: 'Columna de Legajo',                  required: true  },
      { key: 'salBaseColumn',         label: 'Columna de SAL_BASE',                required: false },
      { key: 'aCuFutAumenColumn',     label: 'Columna de A_CTA_FUT_AUMEN',         required: false },
    ],
  },

  gs_pers_file: {
    label: 'Reporte de GS Pers (Gastos Personales y Cochera)',
    parse: parseGsPers,
    detectHeaders: detectHeadersXlsx,
    autoDetect: autoDetectGsPersMapping,
    meta: metaRegistros,
    fields: [
      { key: 'legajoColumn',          label: 'Columna de Legajo',                  required: true  },
      { key: 'gtosPersonalesColumn',  label: 'Columna de GTOS_PERSONALES',         required: false },
      { key: 'dtoCocheraColumn',      label: 'Columna de DTO_COCHERA',             required: false },
    ],
  },

  nr_file: {
    label: 'Reporte de NR (No Remunerativos)',
    parse: parseNr,
    detectHeaders: detectHeadersXlsx,
    autoDetect: autoDetectNrMapping,
    meta: metaRegistros,
    fields: [
      { key: 'legajoColumn',          label: 'Columna de Legajo',                  required: true  },
      { key: 'reinHomeOficeColumn',   label: 'Columna de REIN_HOME_OFICE',         required: false },
      { key: 'indemPreavisoColumn',   label: 'Columna de INDEM_PREAVISO',          required: false },
      { key: 'sacPreavisoColumn',     label: 'Columna de SAC_PREAVISO',            required: false },
      { key: 'indemAntDespColumn',    label: 'Columna de INDEM_ANT_DESP',          required: false },
      { key: 'indemAntFalleColumn',   label: 'Columna de INDEM_ANT_FALLE',         required: false },
      { key: 'indemIntegColumn',      label: 'Columna de INDEM_INTEG',             required: false },
      { key: 'sacIndemIntegColumn',   label: 'Columna de SAC_INDEM_INTEG',         required: false },
      { key: 'indmMaternidadColumn',  label: 'Columna de INDM_MATERNIDAD',         required: false },
      { key: 'vacNoGozadasColumn',    label: 'Columna de VAC_NO_GOZADAS',          required: false },
      { key: 'vacNoGozSacColumn',     label: 'Columna de VAC_NO_GOZ_SAC',          required: false },
      { key: 'gratVacColumn',         label: 'Columna de GRAT_VAC',                required: false },
      { key: 'graVacnogSacColumn',    label: 'Columna de GRA_VACNOG_SAC',          required: false },
      { key: 'indemFuerMayColumn',    label: 'Columna de INDEM_FUER_MAY',          required: false },
      { key: 'indemEmbarazoColumn',   label: 'Columna de INDEM_EMBARAZO',          required: false },
      { key: 'gratExtraordColumn',    label: 'Columna de GRAT_EXTRAORD',           required: false },
      { key: 'asigPasColumn',         label: 'Columna de ASIG_PAS',               required: false },
      { key: 'reintGuardColumn',      label: 'Columna de REINT_GUARD',             required: false },
      { key: 'incrementoStColumn',    label: 'Columna de INCREMENTO_ST',           required: false },
    ],
  },

  rend_file: {
    label: 'Reporte de Rendimiento',
    parse: parseRendimiento,
    detectHeaders: detectHeadersXlsx,
    autoDetect: autoDetectRendimientoMapping,
    meta: metaRegistros,
    fields: [
      { key: 'ccCodeColumn',     label: 'Columna de código CC (1ª col., sin encabezado)', required: false },
      { key: 'ccNameColumn',     label: 'Columna de Centro de Costo',                     required: true  },
      { key: 'precioColumn',     label: 'Columna de PRECIO',                               required: true  },
      { key: 'estimuloColumn',   label: 'Columna de ASIG. ESTÍMULO',                      required: false },
      { key: 'retirosColumn',    label: 'Columna de RETIROS',                              required: false },
      { key: 'cargasColumn',     label: 'Columna de CARGAS SOCIALES',                     required: false },
      { key: 'provMesColumn',    label: 'Columna de PROVISIÓN MES',                       required: false },
      { key: 'provCcssColumn',   label: 'Columna de PROV. CCSS MES',                      required: false },
      { key: 'costoTotalColumn', label: 'Columna de COSTO TOTAL',                         required: false },
    ],
  },

  costo_total_file: {
    label: 'Reporte de Costo Total (por empleado)',
    parse: parseCostoTotal,
    detectHeaders: detectHeadersXlsx,
    autoDetect: autoDetectCostoTotalMapping,
    meta: metaRegistros,
    fields: [
      { key: 'legajoColumn',     label: 'Columna de Legajo (ID Empleado)', required: true },
      { key: 'costoTotalColumn', label: 'Columna de COSTO TOTAL',          required: true },
    ],
  },

  // Catálogo de conceptos: formato fijo, no requiere mapeo de columnas.
  concept_catalog: {
    label: 'Catálogo de Conceptos',
    parse: parseConceptCatalog,
    detectHeaders: detectHeadersXlsx,
    autoDetect: null,
    meta: metaConceptCatalog,
    fixedFormat: true,
    fields: [],
  },

  // Contabilidad Desglosada (CONTA): formato fijo, encabezados constantes.
  // `flow: 'multi'` — se suben varios Excel del mismo formato en una sola
  // corrida, típicamente porque se juntan varios meses en el mismo control. El
  // flujo multi-archivo arma su propia línea por archivo ("N filas con CC") y su
  // propio `fileName` combinado, así que `meta` no lo lee nadie: queda en el
  // molde que le tocaba antes (ver el Paso 1) y no se le inventa uno nuevo para
  // un consumidor que no existe.
  conta_file: {
    label: 'Contabilidad Desglosada',
    parse: parseConta,
    detectHeaders: detectHeadersXlsx,
    autoDetect: null,
    meta: metaLegajosConceptos,
    flow: 'multi',
    fields: [],
  },

  // CC x Empleado: formato fijo, encabezados constantes.
  cc_x_ee_file: {
    label: 'CC x Empleado',
    parse: parseCcXEmpleado,
    detectHeaders: detectHeadersXlsx,
    autoDetect: null,
    meta: metaRegistros,
    fixedFormat: true,
    fields: [],
  },

  // Acreditaciones (export contacred de Axton): formato fijo, igual en todas las
  // cuentas de Axton. El parser resuelve las columnas por nombre y avisa cuáles
  // faltan si el archivo no es el esperado.
  // **Sin `fixedFormat`, a propósito:** no tiene columnas que mapear pero sí pasa
  // por la pantalla de vista previa + "Confirmar y procesar".
  acreditaciones_file: {
    label: 'Acreditaciones (export de Axton)',
    parse: parseAcreditaciones,
    detectHeaders: detectHeadersXlsx,
    autoDetect: null,
    meta: metaRegistros,
    fields: [],
  },

  // Acumuladores (export repacumuladores de Axton): formato fijo. Se sube un
  // crudo por cada mes de la ventana del SAC teórico (RG 4030: 2 meses ·
  // RG 4003: hasta 8), y cada archivo lleva su propio período — de ahí
  // `flow: 'multi-periodo'` y no `'multi'` a secas.
  //
  // `dropLabel` no es un capricho: la zona de drop ya decía "Acumuladores
  // (Axton)" mientras la etiqueta del tipo dice "Acumuladores (export de
  // Axton)". La divergencia es anterior a la ficha; se declara para preservarla
  // tal cual en un paso que es cero cambio de comportamiento, no para
  // bendecirla. Unificar los dos textos es una decisión de Willy, no un arreglo
  // que se cuela en un refactor.
  acumuladores_file: {
    label: 'Acumuladores (export de Axton)',
    dropLabel: 'Acumuladores (Axton)',
    dropHint: ' (uno por mes)',
    parse: parseAcumuladores,
    detectHeaders: detectHeadersXlsx,
    autoDetect: null,
    meta: metaRegistros,
    flow: 'multi-periodo',
    fields: [],
  },

  // Conceptos liquidados de FINADIET (excel "FINADIET CONCEPTOS" de Meta4). Las
  // 4 primeras son requeridas: sin los dos códigos de cuenta, el importe y el
  // centro de costo no hay asiento posible, y completarlas con nada sería
  // exactamente el default silencioso que CLAUDE.md prohíbe. Las otras 4 son
  // rótulos del entregable: si faltan, la celda sale vacía y se avisa.
  //
  // El excel abre con filas de título: con el detector plano, los desplegables
  // del mapeo listarían el texto del título en vez de las columnas.
  asiento_conceptos_file: {
    label: 'Conceptos liquidados de FINADIET (Meta4)',
    parse: parseFinadietAsiento,
    detectHeaders: detectHeadersFinadietAsiento,
    autoDetect: autoDetectFinadietAsientoMapping,
    meta: metaRegistros,
    fields: [
      { key: 'cuentaDebeColumn',        label: 'Columna de Código de cuenta Debe',   required: true  },
      { key: 'cuentaHaberColumn',       label: 'Columna de Código de cuenta Haber',  required: true  },
      { key: 'importeColumn',           label: 'Columna de Importe',                 required: true  },
      { key: 'centroColumn',            label: 'Columna de Centro de Costo',         required: true  },
      { key: 'cuentaDebeNombreColumn',  label: 'Columna de Nombre de cuenta Debe',   required: false },
      { key: 'cuentaHaberNombreColumn', label: 'Columna de Nombre de cuenta Haber',  required: false },
      { key: 'nroConceptoColumn',       label: 'Columna de Código de concepto',      required: false },
      { key: 'conceptoColumn',          label: 'Columna de Concepto',                required: false },
    ],
  },
};

// Tabulado del período anterior (control de Variaciones): es el MISMO archivo
// que el Tabulado del período actual, sólo que de otro mes. Comparte la ficha en
// vez de declarar una copia recortada — así el perfil de columnas que el cliente
// ya tiene guardado sirve para los dos slots, y una columna nueva del Tabulado
// no hay que acordarse de agregarla dos veces.
FILE_TYPES.tab_prev_file = {
  ...FILE_TYPES.tab_control,
  label: 'Tabulado del período anterior',
  aliasOf: 'tab_control',
};

// ── Accesos ──────────────────────────────────────────────────────────────────
// Todo lo que `fileUpload.js` necesita saber de un tipo de archivo sale de acá.
// Un tipo desconocido no se completa con un default: `parseFor` corta con un
// error que dice cuál era, y el resto degrada a algo visible (la etiqueta cae al
// id del tipo, los campos a lista vacía).

/** Campos de mapeo de un tipo, o `[]` si el formato es fijo o el tipo no existe. */
export function fieldsFor(fileType) {
  return FILE_TYPES[fileType]?.fields || [];
}

/** Lo que ve el analista en la zona de drop. */
export function fileTypeLabel(fileType) {
  return FILE_TYPES[fileType]?.label || fileType;
}

/** ¿Se parsea derecho, sin formulario de mapeo? (ver la nota de arriba) */
export function isFixedFormat(fileType) {
  return FILE_TYPES[fileType]?.fixedFormat === true;
}

/**
 * Cómo se sube este tipo: 'single' (un archivo por slot, el caso normal),
 * 'multi' (N archivos que se concatenan) o 'multi-periodo' (N archivos, cada
 * uno con su mes). Un tipo sin `flow` declarado es 'single' — el default es el
 * caso de 15 de los 17 tipos, y declararlo en cada ficha sería ruido.
 */
export function flowFor(fileType) {
  return FILE_TYPES[fileType]?.flow || 'single';
}

/**
 * Función de auto-detección de columnas, o `null` si este tipo no tiene.
 * Todas aceptan `(headers, catalogRows)`; las que no usan el catálogo ignoran
 * el segundo argumento, así que el llamador puede pasarlo siempre.
 */
export function autoDetectFor(fileType) {
  return FILE_TYPES[fileType]?.autoDetect || null;
}

/**
 * Grupos de columnas que se piden en el Paso 2, filtrados por qué controles
 * están seleccionados.
 *
 * @param {string} fileType
 * @param {Set<string>} activos  ids de `requiredBy` presentes en la corrida
 * @param {object} [opts]
 * @param {boolean} [opts.soloGateados]  sólo los grupos atados a un control
 *        (excluye los `requiredBy: null`). Es lo que mira el gate de avance;
 *        el panel los quiere todos. Ver la nota en la ficha de tab_control.
 */
export function extraFieldGroupsFor(fileType, activos, { soloGateados = false } = {}) {
  const groups = FILE_TYPES[fileType]?.extraFieldGroups || [];
  return groups.filter(g => (g.requiredBy
    ? activos.has(g.requiredBy)
    : !soloGateados));
}

/** CODIGO del catálogo → clave del tabExtraConfig, para la auto-detección. */
export function conceptCodeToKeyFor(fileType) {
  return FILE_TYPES[fileType]?.conceptCodeToKey || {};
}

/** Texto de la zona de drop. Cae a `label` salvo donde ya divergía. */
export function dropLabelFor(fileType) {
  return FILE_TYPES[fileType]?.dropLabel || fileTypeLabel(fileType);
}

/** Aclaración extra en la zona de drop ('' si no tiene). */
export function dropHintFor(fileType) {
  return FILE_TYPES[fileType]?.dropHint || '';
}

/** ¿Muestra el selector de apellido/nombre en una columna o en dos? */
export function hasNameMapping(fileType) {
  return FILE_TYPES[fileType]?.nameMapping === true;
}

/** La línea que acompaña al nombre del archivo ya cargado ("N registros"). */
export function metaLineFor(fileType, parseMetadata) {
  const meta = FILE_TYPES[fileType]?.meta;
  return meta ? meta(parseMetadata) : metaLegajosConceptos(parseMetadata);
}

export function detectHeadersFor(fileType, arrayBuffer) {
  const detect = FILE_TYPES[fileType]?.detectHeaders;
  if (!detect) throw new Error(`Tipo de archivo desconocido: "${fileType}".`);
  return detect(arrayBuffer);
}

export function parseFor(fileType, arrayBuffer, mapping) {
  const parse = FILE_TYPES[fileType]?.parse;
  if (!parse) throw new Error(`Tipo de archivo desconocido: "${fileType}".`);
  return parse(arrayBuffer, mapping);
}
