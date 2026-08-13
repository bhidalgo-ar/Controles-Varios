// contracts.js — Fuente única de qué columnas exporta cada control y de qué
// clave de mapeo sale cada una. La obligatoriedad de un campo de ENTRADA se
// DERIVA de estos contratos (ver blocksProgress() acá abajo, consumido por
// js/ui/fileUpload.js, y pendingTabRequirements() en js/ui/controlsWizard.js)
// — no se declara dos veces.
//
// Ver specs/contrato-export.md para el porqué y el plan completo por pasos
// (D-041, D-043, D-045, D-046 y D-047 en DECISIONS.md).
//
// Dos reglas que no se deducen leyendo:
//   1. **El contrato es un PISO, nunca un techo** — puede agregar obligación
//      sobre el `required` de FIELD_DEFS, nunca sacarla (ver blocksProgress()).
//   2. Los contratos migrados a un writer declaran también su layout
//      (`width`/`groups`/`headerRows`); `acreditaciones_reporte` (el único que
//      queda con su .xlsx a mano — D-047) declara sólo semántica. Declarar
//      layout que nadie lee es una segunda fuente de verdad que se
//      desincroniza en silencio, y hay un assert en tests/exportContracts.test.js
//      que lo impide en los dos sentidos.

import { NR_CONCEPTS } from '../controls/nr.js';
import { COLS } from '../controls/rendVsTabu.js';

/** 'precio' → 'Precio', para armar las claves rPrecio/cPrecio/dPrecio. */
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Cuánto pesa una columna para quien recibe el archivo.
 *   CLAVE       — sin esto el archivo no sirve (ej. ID_EMPLEADO). El parser
 *                 mismo corta con error; NO admite omisión declarada.
 *   OBLIGATORIA — el destino la espera. Bloquea el avance, pero admite
 *                 omisión declarada y visible (ver js/exports/omissions.js,
 *                 Paso 2) para el cliente que genuinamente no tiene esa
 *                 columna — es la resolución de la tensión con D-036.
 *   OPCIONAL    — si no está, se informa en resultados y listo (D-036). No
 *                 bloquea nada.
 */
export const NECESSITY = {
  CLAVE:       'clave',
  OBLIGATORIA: 'obligatoria',
  OPCIONAL:    'opcional',
};

/**
 * Layout de la hoja cuando una columna OBLIGATORIA/OPCIONAL no se resolvió.
 *   'fijo' — el encabezado sale SIEMPRE, con la celda vacía (decisión de
 *            Willy, 2026-08-12: "que salga vacía"). Es la única política;
 *            no hay un layout 'variable' — se documenta el nombre para dejar
 *            explícito que fue una decisión y no un default.
 */
export const LAYOUT_FIJO = 'fijo';

// Las 2 claves que Willy pidió dejar como están el 2026-08-12 ("no lo sé,
// dejalo como está"): no se suben de OPCIONAL a OBLIGATORIA en ningún
// contrato, aunque el resto del análisis lo sugiera. Confirmarlo con Willy
// antes de subirlas — no antes.
const NO_TOCAR_TODAVIA = new Set(['apellidoNombreColumn', 'puestoColumn']);

// Colores compartidos por los 3 contratos "Controlar" (Paso 4b) — eran 3
// copias idénticas del mismo hex, una por control, antes de existir un lugar
// único de dónde salieran. `writeGroupedContractSheet` (js/exports/contractSheet.js)
// es quien los consume vía `contract.groups`.
const CYAN_HDR  = 'FFC7ECF6';
const CYAN_BG   = 'FFE6F8FB';
const LILAC_HDR = 'FFE6DCF4';
const LILAC_BG  = 'FFF4EFFA';
const GRAY_HDR  = 'FFE8E8E8';
const INDEM_HDR = 'FFD4EDDA';
const INDEM_BG  = 'FFEAF5EE';
const OTROS_HDR = 'FFFFE4CC';
const OTROS_BG  = 'FFFFEFE0';

/**
 * @typedef {object} ExportColumn
 * @property {string}   label      encabezado literal del archivo entregado
 * @property {string}   key        propiedad de la fila que devuelve run()
 * @property {string[]} from       claves de mapeo, en orden de precedencia
 *                                 (D-039) — [] si la columna es derivada
 *                                 (se calcula, no sale de ningún archivo)
 * @property {string}   necessity  uno de NECESSITY.*
 * @property {'txt'|'num'} type    cómo se formatea (alineación + `numFmt` en
 *                                 el xlsx). Obligatorio en toda columna — un
 *                                 contrato que se olvida declararlo es
 *                                 exactamente el default silencioso ("sale
 *                                 mal alineado y nada avisa") que este diseño
 *                                 existe para evitar; lo hace cumplir
 *                                 `tests/exportContracts.test.js`.
 * @property {number}  [width]    ancho de columna en el xlsx (unidades de
 *                                 Excel). Si falta, `writeContractSheet`/
 *                                 `writeGroupedContractSheet` caen a un default.
 * @property {string}  [group]    id de `contract.groups` — coloca la columna
 *                                 dentro de ese grupo (encabezado agrupado y/o
 *                                 fondo de dato compartido). Sin esto, la
 *                                 columna no pertenece a ningún grupo.
 * @property {boolean} [diffHighlight] esta columna es una diferencia: si el
 *                                 valor no es `null` y `|valor| > 0.01`, sale
 *                                 en negrita y rojo (sólo lo usa
 *                                 `writeGroupedContractSheet`).
 * @property {'left'|'center'|'right'} [dataAlign] override de la alineación
 *                                 horizontal en la fila de datos (default:
 *                                 'right' si `type:'num'`, si no ninguna).
 * @property {boolean} [numFmt]   `false` saca el formato moneda de una columna
 *                                 `type:'num'` (ej. NR "# Difs": es un conteo,
 *                                 no un importe).
 * @property {boolean} [spacer]   columna deliberadamente sin encabezado ni
 *                                 estilo — la columna A vacía heredada del
 *                                 layout de Meta4 en el Reporte NR. `label`
 *                                 puede quedar `''` sólo en estas columnas.
 */

/**
 * @typedef {object} ExportColumnGroup
 * @property {string} [label]     texto del encabezado agrupado (fila 1 cuando
 *                                 `headerRows:2`). Sin esto, el grupo sólo
 *                                 aporta color — no hay merge de encabezado
 *                                 (caso de NR, `headerRows:1`).
 * @property {string} headerColor ARGB del encabezado (fila agrupada, o cada
 *                                 columna individual si `headerRows:1`).
 * @property {string} [dataColor] ARGB de fondo en la fila de datos. Sin esto,
 *                                 la celda de datos queda sin relleno (ej. el
 *                                 grupo "Valores Tabulado" de Brutos/GS Pers).
 */

/**
 * @typedef {object} ExportContract
 * @property {string}        exportId
 * @property {string}        sheet
 * @property {'fijo'}        layout
 * @property {'payroll'|'finanzas'} audience  D-020: 'finanzas' no puede
 *                                            llevar columnas de dotación/HR.
 * @property {1|2}           [headerRows]  filas de encabezado — 1 (default) o
 *                                 2 (encabezado agrupado con merges, sólo lo
 *                                 usa `writeGroupedContractSheet`).
 * @property {Object<string,ExportColumnGroup>} [groups] grupos de columnas,
 *                                 sólo los consume `writeGroupedContractSheet`.
 * @property {ExportColumn[]} columns
 */

// ── Brutos ────────────────────────────────────────────────────────────────────

/** Modo Controlar: comparación fija de 9 columnas, sin `cols.has*` — ya se
 * comporta como layout:'fijo' por construcción (nombre/legajo siempre se
 * emiten, aunque nombre pueda venir vacío). Encabezado de dos filas —
 * migrado a `writeGroupedContractSheet` en el Paso 4b. */
const brutosControlar = {
  exportId: 'brutos', sheet: 'Control de Brutos', layout: LAYOUT_FIJO, audience: 'payroll',
  headerRows: 2,
  groups: {
    salBase: { label: 'Salario Base',    headerColor: CYAN_HDR,  dataColor: CYAN_BG },
    acfa:    { label: 'A Cta Fut Aumen', headerColor: LILAC_HDR, dataColor: LILAC_BG },
    tab:     { label: 'Valores Tabulado', headerColor: GRAY_HDR }, // sin dataColor: sin fondo en los datos
  },
  columns: [
    { label: 'Legajo',              key: 'legajo',         width: 12, from: ['legajoColumn'],         necessity: NECESSITY.CLAVE,       type: 'txt' },
    { label: 'Apellido y Nombre',   key: 'nombre',         width: 28, from: ['apellidoNombreColumn'], necessity: NECESSITY.OPCIONAL,    type: 'txt' },
    { label: 'SAL_BASE',            key: 'salBase',        width: 18, from: ['salBaseColumn'],        necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'salBase' },
    { label: 'CTRL SALARIO BASE',   key: 'ctrlSalBase',    width: 22, from: [],                       necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'salBase', diffHighlight: true },
    { label: 'A_CTA_FUT_AUMEN',     key: 'aCuFutAumen',    width: 20, from: ['aCuFutAumenColumn'],    necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'acfa' },
    { label: 'CTRL A_CTA_FUT_AUMEN', key: 'ctrlACuFutAumen', width: 24, from: [],                     necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'acfa', diffHighlight: true },
    { label: 'Legajo (Tab)',        key: 'legajo',         width: 12, from: ['empleadoColumn'],       necessity: NECESSITY.CLAVE,       type: 'txt', group: 'tab' },
    { label: 'SAL_BASE (Tab)',      key: 'tabValSal',      width: 18, from: ['tabSalBaseColumn'],     necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'tab' },
    { label: 'A_CTA_FUT (Tab)',     key: 'tabValAcu',      width: 18, from: ['tabACuFutAumenColumn'], necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'tab' },
  ],
};

/** Modo Generar Reporte: migrado a `writeContractSheet` (Paso 4a) — antes usaba
 * `cols.has*` y la columna DESAPARECÍA si la clave de origen no estaba mapeada
 * (10 columnas en vez de 11). Ahora layout:'fijo': el encabezado sale siempre,
 * la celda va vacía. Anchos = los que ya tenía el `.xlsx` a mano. */
const brutosReporte = {
  exportId: 'brutos_reporte', sheet: 'Reporte de Brutos', layout: LAYOUT_FIJO, audience: 'payroll',
  columns: [
    { label: 'FECHA_INI',      key: 'fecIni',      from: [],                                      necessity: NECESSITY.OBLIGATORIA, type: 'txt', width: 14 },
    { label: 'FECHA_FIN',      key: 'fecFin',      from: [],                                      necessity: NECESSITY.OBLIGATORIA, type: 'txt', width: 14 },
    { label: 'ID_EMPLEADO',    key: 'legajo',      from: ['empleadoColumn'],                       necessity: NECESSITY.CLAVE,       type: 'txt', width: 12 },
    { label: 'NOMBRE',         key: 'nombre',      from: ['tabNombreColumn', 'apellidoNombreColumn'], necessity: NECESSITY.OPCIONAL, type: 'txt', width: 22 },
    { label: 'APELLIDO_1',     key: 'apellido1',   from: ['tabApellido1Column'],                   necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 22 },
    { label: 'FECHA_ALTA',     key: 'fecAlta',     from: ['tabFecAltaColumn'],                     necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 14 },
    { label: 'FECHA_BAJA',     key: 'fecBaja',     from: ['tabFecBajaColumn'],                     necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 14 },
    { label: 'FEC_PAGO',       key: 'fecPago',     from: ['tabFecPagoColumn'],                     necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 14 },
    { label: 'SAL_BASE',       key: 'salBase',     from: ['tabSalBaseColumn'],                     necessity: NECESSITY.OBLIGATORIA, type: 'num', width: 18 },
    { label: 'A_CTA_FUT_AUMEN', key: 'aCuFutAumen', from: ['tabACuFutAumenColumn'],                necessity: NECESSITY.OBLIGATORIA, type: 'num', width: 20 },
    { label: 'N_PUESTO',       key: 'puesto',      from: ['puestoColumn'],                         necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 14 },
  ],
};

// ── GS Pers ───────────────────────────────────────────────────────────────────

/** Encabezado de dos filas — migrado a `writeGroupedContractSheet` en el Paso 4b. */
const gsPersControlar = {
  exportId: 'gs_pers', sheet: 'Control GS Pers', layout: LAYOUT_FIJO, audience: 'payroll',
  headerRows: 2,
  groups: {
    gtos: { label: 'GTOS_PERSONALES', headerColor: CYAN_HDR,  dataColor: CYAN_BG },
    dto:  { label: 'DTO_COCHERA',     headerColor: LILAC_HDR, dataColor: LILAC_BG },
    tab:  { label: 'Valores Tabulado', headerColor: GRAY_HDR },
  },
  columns: [
    { label: 'Legajo',               key: 'legajo',   width: 12, from: ['legajoColumn'],           necessity: NECESSITY.CLAVE,       type: 'txt' },
    { label: 'GTOS_PERSONALES',      key: 'gtos',     width: 20, from: ['gtosPersonalesColumn'],   necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'gtos' },
    { label: 'CTRL GTOS_PERSONALES', key: 'ctrlGtos', width: 24, from: [],                         necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'gtos', diffHighlight: true },
    { label: 'DTO_COCHERA',          key: 'dto',      width: 18, from: ['dtoCocheraColumn'],       necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'dto' },
    { label: 'CTRL DTO_COCHERA',     key: 'ctrlDto',  width: 22, from: [],                         necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'dto', diffHighlight: true },
    { label: 'Legajo',               key: 'legajo',   width: 12, from: ['empleadoColumn'],         necessity: NECESSITY.CLAVE,       type: 'txt', group: 'tab' },
    { label: 'GTOS_PERS (Tab)',      key: 'tabValGtos', width: 22, from: ['tabGtosPersonalesColumn'], necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'tab' },
    { label: 'DTO_COCHERA (Tab)',    key: 'tabValDto', width: 22, from: ['tabDtoCocheraColumn'],    necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'tab' },
  ],
};

/** Migrado a `writeContractSheet` (Paso 4a) — mismo motivo que Brutos. */
const gsPersReporte = {
  exportId: 'gs_pers_reporte', sheet: 'Reporte GS Pers', layout: LAYOUT_FIJO, audience: 'payroll',
  columns: [
    { label: 'FECHA_INI',         key: 'fecIni',    from: [],                                      necessity: NECESSITY.OBLIGATORIA, type: 'txt', width: 14 },
    { label: 'FECHA_FIN',         key: 'fecFin',    from: [],                                      necessity: NECESSITY.OBLIGATORIA, type: 'txt', width: 14 },
    { label: 'ID_EMPLEADO',       key: 'legajo',    from: ['empleadoColumn'],                       necessity: NECESSITY.CLAVE,       type: 'txt', width: 12 },
    { label: 'NOMBRE',            key: 'nombre',    from: ['tabNombreColumn', 'apellidoNombreColumn'], necessity: NECESSITY.OPCIONAL, type: 'txt', width: 22 },
    { label: 'APELLIDO_1',        key: 'apellido1', from: ['tabApellido1Column'],                   necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 22 },
    { label: 'FEC_PAG',           key: 'fecPago',   from: ['tabFecPagoColumn'],                     necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 14 },
    { label: 'FECHA_ALTA',        key: 'fecAlta',   from: ['tabFecAltaColumn'],                     necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 14 },
    { label: 'ID_CENTRO_COSTO',   key: 'idCC',      from: ['idCCColumn'],                           necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 16 },
    { label: 'GTOS_PERSONALES',   key: 'gtos',      from: ['tabGtosPersonalesColumn'],              necessity: NECESSITY.OBLIGATORIA, type: 'num', width: 18 },
    { label: 'DTO_COCHERA',       key: 'dto',       from: ['tabDtoCocheraColumn'],                  necessity: NECESSITY.OBLIGATORIA, type: 'num', width: 18 },
    { label: 'N_CENTRO_COSTO',    key: 'nCC',       from: ['ccColumn'],                             necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 22 },
  ],
};

// ── NR ────────────────────────────────────────────────────────────────────────
// Derivado de NR_CONCEPTS (js/controls/nr.js) — no se repite la lista de 18
// conceptos en un segundo lugar. Cada concepto se lee de DOS mapeos según el
// modo: el archivo NR (`nrKey`) en modo Controlar, el Tabulado (`tabKey`) en
// los dos modos.

const nrConceptColumn = (c, key, extra = {}) => ({
  label: c.label, key: c.key, from: [key], necessity: NECESSITY.OBLIGATORIA, type: 'num', ...extra,
});

// Grupos de color compartidos por los dos modos (Controlar y Reporte): cada
// concepto NR se pinta según `c.group` ('indem'/'otros'), tanto si la columna
// sale de nrKey (Controlar) como de tabKey (Reporte) — es el mismo concepto.
const NR_CONCEPT_GROUPS = {
  indem: { headerColor: INDEM_HDR, dataColor: INDEM_BG },
  otros: { headerColor: OTROS_HDR, dataColor: OTROS_BG },
};

/** Encabezado de una sola fila, coloreado por columna (sin merges) — migrado
 * a `writeGroupedContractSheet` en el Paso 4b. */
const nrControlar = {
  exportId: 'nr', sheet: 'Control NR', layout: LAYOUT_FIJO, audience: 'payroll',
  headerRows: 1,
  groups: NR_CONCEPT_GROUPS,
  columns: [
    { label: 'Legajo', key: 'legajo', width: 12, from: ['legajoColumn'], necessity: NECESSITY.CLAVE,       type: 'txt' },
    { label: '# Difs', key: 'difs',   width: 10, from: [],                necessity: NECESSITY.OBLIGATORIA, type: 'num',
      diffHighlight: true, dataAlign: 'center', numFmt: false },
    ...NR_CONCEPTS.map(c => ({ ...nrConceptColumn(c, c.nrKey, { diffHighlight: true }), width: 16, group: c.group })),
  ],
};

// NR Reporte ya emite las 18 columnas siempre (no tiene el bug de `cols.has*`
// que Brutos/GS Pers sí tenían) — no necesita el fix de comportamiento de
// Paso 4a. Mismo encabezado de una fila coloreado por grupo que NR Controlar,
// más una columna A vacía (separador heredado del layout de Meta4) y sin
// `diffHighlight` — es un reporte, no hay `ctrl` que resaltar. Migrado a
// `writeGroupedContractSheet` en el Paso 4b.
const nrReporte = {
  exportId: 'nr_reporte', sheet: 'Reporte NR', layout: LAYOUT_FIJO, audience: 'payroll',
  headerRows: 1,
  groups: NR_CONCEPT_GROUPS,
  columns: [
    { label: '', key: '__blank__', width: 4, from: [], necessity: NECESSITY.OPCIONAL, type: 'txt', spacer: true },
    { label: 'ID_EMPLEADO',     key: 'legajo',          width: 12, from: ['empleadoColumn'],  necessity: NECESSITY.CLAVE,    type: 'txt' },
    { label: 'NOMBRE',          key: 'nombre',          width: 22, from: ['tabNombreColumn', 'apellidoNombreColumn'], necessity: NECESSITY.OPCIONAL, type: 'txt' },
    { label: 'APELLIDO_1',      key: 'apellido1',       width: 22, from: ['tabApellido1Column'], necessity: NECESSITY.OPCIONAL, type: 'txt' },
    { label: 'FECHA_ALTA',      key: 'fecAlta',         width: 14, from: ['tabFecAltaColumn'],  necessity: NECESSITY.OPCIONAL, type: 'txt' },
    { label: 'FECHA_BAJA',      key: 'fecBaja',         width: 14, from: ['tabFecBajaColumn'],  necessity: NECESSITY.OPCIONAL, type: 'txt' },
    { label: 'FEC_PAGO',        key: 'fecPago',         width: 14, from: ['tabFecPagoColumn'],  necessity: NECESSITY.OPCIONAL, type: 'txt' },
    { label: 'ID_CENTRO_TRAB',  key: 'idCentroTrab',    width: 16, from: ['tabIdCentroTrabColumn'], necessity: NECESSITY.OPCIONAL, type: 'txt' },
    { label: 'ID_CATEGORIA',    key: 'idCategoria',     width: 16, from: ['tabIdCategoriaColumn'],  necessity: NECESSITY.OPCIONAL, type: 'txt' },
    ...NR_CONCEPTS.map(c => ({ ...nrConceptColumn(c, c.tabKey), width: 16, group: c.group })),
  ],
};

// ── Rendimiento (Paso 6) ─────────────────────────────────────────────────────
// Las tres pantallas de Rendimiento comparten las MISMAS 6 categorías, con las
// mismas etiquetas: se derivan de `COLS` (js/controls/rendVsTabu.js) en vez de
// repetirlas acá, igual que NR deriva sus 18 conceptos de `NR_CONCEPTS`.
//
// De qué columna del Reporte de Rendimiento sale cada categoría. Es
// conocimiento de contrato ("esta columna del export se alimenta de esta clave
// de mapeo"), por eso vive acá y no en el módulo del control.
const REND_CAT_KEY = {
  precio:   'precioColumn',
  estimulo: 'estimuloColumn',
  cargas:   'cargasColumn',
  provMes:  'provMesColumn',
  provCcss: 'provCcssColumn',
  total:    'costoTotalColumn',
};

// `precioColumn` y `ccNameColumn` son las dos únicas `required: true` de
// `FIELD_DEFS.rend_file`; el resto de las categorías son opcionales ahí y el
// contrato no las sube (subirlas a OBLIGATORIA no bloquearía nada hoy —ver
// `blocksProgress`— pero declararía una expectativa que el archivo real de
// varios clientes no cumple).
const rendCatNecessity = key =>
  key === 'precio' ? NECESSITY.OBLIGATORIA : NECESSITY.OPCIONAL;

// Rend vs Tabulado/Asiento/x EE migraron a `writeGroupedContractSheet` (ver
// "Lo que falta para migrar los writers del Paso 6" en specs/contrato-export.md
// — la fila de TOTAL y las filas atenuadas que les faltaban al writer ya están).
// Las 3 comparten las mismas 6 categorías (label + colores) de `COLS`, así que
// el grupo de cada categoría se arma una sola vez acá.
const REND_CAT_GROUPS = Object.fromEntries(
  COLS.map(c => [c.key, { label: c.label, headerColor: c.xlHdr, dataColor: c.xlBg }]),
);

/** Rend vs Tabulado: CC + 3 columnas por categoría (Rend · Tab · CTRL). */
const rendVsTabuControlar = {
  exportId: 'rend_vs_tabu', sheet: 'Rend vs Tabulado', layout: LAYOUT_FIJO, audience: 'payroll',
  headerRows: 2,
  groups: {
    // `meta` no tiene `label`: no se mergea nada en la fila 1 (CC/Centro de
    // Costo ya se mergean solos, verticalmente, por no tener grupo-con-label)
    // — sólo aporta el gris propio de Rendimiento (distinto del gris genérico
    // de `contractSheet.js`) para esas dos columnas.
    meta: { headerColor: 'FFE0E0E0' },
    ...REND_CAT_GROUPS,
  },
  columns: [
    { label: 'CC',              key: 'ccCode', width: 10, from: ['ccCodeColumn'], necessity: NECESSITY.OPCIONAL,    type: 'txt', group: 'meta' },
    { label: 'Centro de Costo', key: 'ccName', width: 30, from: ['ccNameColumn'], necessity: NECESSITY.OBLIGATORIA, type: 'txt', group: 'meta' },
    ...COLS.flatMap(c => [
      { label: 'Rend',            key: c.rKey, width: 18, from: [REND_CAT_KEY[c.key]], necessity: rendCatNecessity(c.key), type: 'num', group: c.key },
      // El lado Tabulado se calcula por CÓDIGO de concepto (js/controls/tabCodes.js),
      // no sale de una columna mapeada — por eso `from: []`.
      { label: 'Tab',             key: c.tKey, width: 18, from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num', group: c.key },
      { label: 'CTRL\nTab−Rend',  key: c.dKey, width: 18, from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num', group: c.key, diffHighlight: true },
    ]),
  ],
};

/** Rend vs Asiento: mismo molde, pero el 2º lado es CONTA (Contabilidad Desglosada). */
const rendVsAsientoControlar = {
  exportId: 'rend_vs_asiento', sheet: 'Resumen', layout: LAYOUT_FIJO, audience: 'payroll',
  headerRows: 2,
  groups: {
    meta: { headerColor: 'FFE0E0E0' },
    ...REND_CAT_GROUPS,
  },
  columns: [
    { label: 'Código CC',       key: 'ccCode', width: 10, from: ['ccCodeColumn'], necessity: NECESSITY.OPCIONAL,    type: 'txt', group: 'meta' },
    { label: 'Centro de Costo', key: 'ccName', width: 30, from: ['ccNameColumn'], necessity: NECESSITY.OBLIGATORIA, type: 'txt', group: 'meta' },
    // `rKey`/`dKey` son idénticos en los dos módulos; el del medio es el que
    // cambia (`tKey` en Rend vs Tabulado, `cKey` acá), así que se arma.
    // El sub-encabezado real del .xlsx lleva el período ("Rend abr26") — un
    // dato de la corrida, no del contrato — así que estos labels ('Rend'/
    // 'CONTA'/'CTRL…') son el default de `writeGroupedContractSheet` (CSV,
    // pantalla) y el módulo pasa `opts.headerLabel` para el .xlsx real.
    ...COLS.flatMap(c => [
      { label: 'Rend',             key: c.rKey,           width: 18, from: [REND_CAT_KEY[c.key]], necessity: rendCatNecessity(c.key), type: 'num', group: c.key },
      // CONTA se clasifica por CUENTA_CONTAB / ID_CONCEPTO según `rvaConfig`,
      // no por una columna mapeada (`FIELD_DEFS.conta_file` no declara ninguna).
      { label: 'CONTA',            key: `c${cap(c.key)}`, width: 18, from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num', group: c.key },
      { label: 'CTRL\nCONTA−Rend', key: c.dKey,           width: 18, from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num', group: c.key, diffHighlight: true },
    ]),
  ],
};

/** Rend x EE: una fila por legajo — Costo Total del reporte vs. el calculado del Tabulado. */
const rendXEeControlar = {
  exportId: 'rend_x_ee', sheet: 'Rendimiento x EE', layout: LAYOUT_FIJO, audience: 'payroll',
  headerRows: 1,
  groups: {
    meta:      { headerColor: 'FFE0E0E0' },                      // Legajo / Nombre / COSTO TOTAL (Reporte): sin fondo de dato
    precio:    REND_CAT_GROUPS.precio,
    estimulo:  REND_CAT_GROUPS.estimulo,
    cargas:    REND_CAT_GROUPS.cargas,
    provMes:   REND_CAT_GROUPS.provMes,
    provCcss:  REND_CAT_GROUPS.provCcss,
    calcTotal: { headerColor: 'FFDCDCDC', dataColor: 'FFF2F2F2' },
    dif:       { headerColor: 'FFA9D08E', dataColor: 'FFE2EFDA' },
  },
  columns: [
    { label: 'Legajo', key: 'legajo', width: 10, from: ['legajoColumn'],         necessity: NECESSITY.CLAVE,    type: 'txt', group: 'meta' },
    { label: 'Nombre', key: 'nombre', width: 30, from: ['apellidoNombreColumn'], necessity: NECESSITY.OPCIONAL, type: 'txt', group: 'meta' },
    { label: 'COSTO TOTAL (Reporte)', key: 'repTotal', width: 18, from: ['costoTotalColumn'], necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'meta' },
    // Las 5 categorías salen del Tabulado por código de concepto, igual que en
    // Rend vs Tabulado — ninguna sale de una columna mapeada.
    ...COLS.filter(c => c.key !== 'total').map(c => ({
      label: c.label, key: c.key, width: 18, from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num', group: c.key,
    })),
    { label: 'COSTO TOTAL (Calculado)',   key: 'calcTotal', width: 18, from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'calcTotal' },
    { label: 'Dif (Reporte − Calculado)', key: 'dif',       width: 18, from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num', group: 'dif', diffHighlight: true },
  ],
};

// ── EE x CATEG (Paso 6) ──────────────────────────────────────────────────────
// Dos hojas con el MISMO molde de 4 columnas; lo único que cambia es por qué
// campo agrupa (y de qué par de claves sale ese campo: una del Reporte de
// Categorías y otra del Tabulado). Migrado a `writeContractSheet` — el "Dif."
// y la fila TOTAL siguen siendo fórmulas (`=B2-C2`/`SUM(...)`, más auditable
// para el cliente que un valor cacheado a mano): el módulo las arma con el
// número de fila real y se las pasa al writer como `{ formula, result }`, que
// viaja tal cual a la celda igual que cualquier otro valor.
const catDistribucion = (exportId, sheet, label, from) => ({
  exportId, sheet, layout: LAYOUT_FIJO, audience: 'payroll',
  columns: [
    { label,                key: 'key',      width: 32, from,     necessity: NECESSITY.OBLIGATORIA, type: 'txt' },
    // Conteos de empleados, no importes: `numFmt:false` saca el formato
    // moneda que `writeContractSheet` pone por default a toda columna `num`
    // (mismo mecanismo que usa NR para su "# Difs").
    { label: 'Rep. Categ.', key: 'catCount', width: 14, from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num', numFmt: false },
    { label: 'Tabulado',    key: 'tabCount', width: 14, from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num', numFmt: false },
    { label: 'Dif.',        key: 'diff',     width: 10, from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num', numFmt: false, diffHighlight: true },
  ],
});

// ── Acreditaciones (Paso 6) ──────────────────────────────────────────────────
// **El primer contrato `audience: 'finanzas'`** (D-020) — los otros dos son las
// solapas planas del asiento de FINADIET, más abajo: este .xlsx lo recibe
// Finanzas/tesorería del cliente, no el equipo de Payroll, así que lleva sólo
// lo necesario para pagar. Que la lista de columnas esté acá y no repartida en
// el módulo es lo que hace que D-020 se pueda verificar como assert en vez de
// como comentario — ver `tests/exportContracts.test.js`.
//
// Es el layout de cada hoja de detalle (una por acreditación real). La hoja
// CONTROL que las lista y cierra contra el archivo de origen no se modela acá:
// es una hoja de cierre con fórmulas entre hojas, no una tabla de datos.
//
// **Se queda sin writer (D-047), a propósito.** De los 5 contratos que le
// faltaba migrar al Paso 6, este es el único que NO entra en `writeContractSheet`
// ni con la fila de TOTAL/filas atenuadas que el writer ganó para los otros 4:
// cada hoja de detalle no es "encabezado + N filas iguales" — lleva una fila de
// TÍTULO **antes** del encabezado (nombre de la lista + el total, para no bajar
// a buscarlo), y esa fila no tiene ningún lugar en el contrato. Sumar un
// "título opcional" al writer para un solo consumidor es la abstracción que
// CLAUDE.md pide no forzar. Además el archivo entero es multi-hoja calculado en
// runtime (CONTROL + una por acreditación, mismo problema que `variaciones`/
// `acumuladores` — ver "Los 2 que no se declaran, y por qué" más arriba) y sus
// totales cierran con fórmulas ENTRE hojas (`'Nombre lista'!D1`), no dentro de
// una. Se revisa si alguna vez el título deja de hacer falta (ej. si se cambia
// a total al pie, como el resto) — hasta entonces sigue con su .xlsx a mano.
const acreditacionesReporte = {
  exportId: 'acreditaciones_reporte', sheet: 'Detalle de acreditación',
  layout: LAYOUT_FIJO, audience: 'finanzas',
  columns: [
    { label: 'Legajo',             key: 'legajo', from: [], necessity: NECESSITY.CLAVE,       type: 'txt' },
    { label: 'Apellido y Nombre',  key: 'nombre', from: [], necessity: NECESSITY.OBLIGATORIA, type: 'txt' },
    { label: 'CUIT',               key: 'cuit',   from: [], necessity: NECESSITY.OBLIGATORIA, type: 'txt' },
    { label: 'Neto',               key: 'neto',   from: [], necessity: NECESSITY.OBLIGATORIA, type: 'num' },
    { label: 'Fecha Acreditacion', key: 'fecha',  from: [], necessity: NECESSITY.OBLIGATORIA, type: 'txt' },
    { label: 'Banco',              key: 'banco',  from: [], necessity: NECESSITY.OBLIGATORIA, type: 'txt' },
    { label: 'CBU',                key: 'cbu',    from: [], necessity: NECESSITY.OBLIGATORIA, type: 'txt' },
  ],
};

// ── FINADIET · Asiento de Remuneraciones ──────────────────────────────────────
//
// Las DOS solapas planas del asiento, sobre `writeContractSheet` desde que
// entraron (D-046) — mismo writer al que se migraron los otros 4 del Paso 6
// (D-047). La tercera
// solapa, ASIENTO, no tiene contrato a propósito: no es una tabla plana — lleva
// un encabezado con mes y fecha, una fila de título por centro de costo y por
// categoría, y un TOTAL al pie. `writeContractSheet` describe hojas de
// "encabezado + N filas iguales", y forzar esa forma acá sería más maquinaria de
// la que el caso necesita (el mismo criterio con el que el Paso 4b se dejó
// separado del 4a).
//
// `audience: 'finanzas'`: el archivo lo recibe Contaduría de FINADIET, no el
// equipo de Payroll. Por eso no lleva NADA de HR — ni legajo, ni nombre de
// empleado, ni dotación (D-020). Un asiento contable se lee por cuenta y por
// concepto de liquidación; el empleado no aparece en ningún lado, y esto es lo
// que lo hace cumplir en el único lugar que emite las columnas.
//
// La fila TOTAL viaja como una fila más de `rows` (con 'TOTAL' en la columna de
// concepto) y no como un `addRow` aparte: `writeContractSheet` es el único lugar
// que escribe filas de un export con contrato (D-043), así que el total entra
// por la misma puerta que el resto.

const finadietAsientoColumns = () => ([
  { label: 'Código de cuenta', key: 'cuenta',   from: [],                     necessity: NECESSITY.OBLIGATORIA, type: 'txt', width: 18 },
  { label: 'Concepto',         key: 'concepto', from: ['conceptoColumn'],     necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 45 },
  { label: 'Cód. concepto',    key: 'nro',      from: ['nroConceptoColumn'],  necessity: NECESSITY.OPCIONAL,    type: 'txt', width: 14 },
  { label: 'Suma DEBE',        key: 'debe',     from: [],                     necessity: NECESSITY.OBLIGATORIA, type: 'num', width: 18 },
  { label: 'Suma HABER',       key: 'haber',    from: [],                     necessity: NECESSITY.OBLIGATORIA, type: 'num', width: 18 },
]);

/** Cuenta CON prefijo de centro de costo (o `100.` si es Patrimonial). */
const finadietAsientoPorCentro = {
  exportId: 'finadiet_asiento_cc', sheet: 'Ctas Cbles CENTRO COSTO',
  layout: LAYOUT_FIJO, audience: 'finanzas',
  columns: finadietAsientoColumns(),
};

/** La misma tabla con el código de cuenta limpio, sin prefijo. */
const finadietAsientoGral = {
  exportId: 'finadiet_asiento_gral', sheet: 'Cuentas Contables GRAL',
  layout: LAYOUT_FIJO, audience: 'finanzas',
  columns: finadietAsientoColumns(),
};

export const EXPORT_CONTRACTS = {
  brutos:           brutosControlar,
  brutos_reporte:   brutosReporte,
  gs_pers:          gsPersControlar,
  gs_pers_reporte:  gsPersReporte,
  nr:               nrControlar,
  nr_reporte:       nrReporte,
  // Paso 6
  rend_vs_tabu:     rendVsTabuControlar,
  rend_vs_asiento:  rendVsAsientoControlar,
  rend_x_ee:        rendXEeControlar,
  cat_x_empleados_puesto: catDistribucion('cat_x_empleados_puesto', 'Por Puesto', 'Puesto', ['puestoColumn']),
  // `from` es sólo la clave del Reporte de Categorías: el Tabulado agrupa por
  // `ccColumn`, que ya está contratada como OPCIONAL por gs_pers_reporte y
  // tiene otra necesidad (opcional en el Tabulado, `required` en el Reporte).
  // Listar las dos bajo una sola `necessity` afirmaría de una lo que vale para
  // la otra.
  cat_x_empleados_cc:     catDistribucion('cat_x_empleados_cc', 'Por Centro de Costo', 'Centro de Costo', ['centroCostoColumn']),
  acreditaciones_reporte: acreditacionesReporte,
  // Asiento de FINADIET: los dos únicos del Paso 6 que ya salen por
  // `writeContractSheet`, así que declaran también su layout (D-046).
  finadiet_asiento_cc:    finadietAsientoPorCentro,
  finadiet_asiento_gral:  finadietAsientoGral,
};

/**
 * Columnas que un export `audience: 'finanzas'` puede llevar (D-020): lo
 * necesario para **pagar** o para **asentar**, y nada de HR. No es una lista de
 * deseos — es el assert de `tests/exportContracts.test.js`, así que agregar acá
 * una columna de dotación/conteo/alta-baja es una decisión explícita, no un
 * descuido.
 *
 * Los dos destinos que existen hoy piden columnas distintas y ninguno pide
 * atributos del empleado:
 *   - pagar (Acreditaciones → tesorería): legajo, nombre, CUIT, CBU, banco,
 *     importe y fecha.
 *   - asentar (asiento de FINADIET → Contaduría): cuenta, concepto y los dos
 *     lados del movimiento. Acá no aparece ni el legajo: un asiento se lee por
 *     cuenta contable, no por empleado.
 */
export const FINANZAS_ALLOWED_KEYS = new Set([
  // pagar
  'legajo', 'nombre', 'cuit', 'neto', 'fecha', 'banco', 'cbu',
  // asentar
  'cuenta', 'concepto', 'nro', 'debe', 'haber',
]);

/**
 * Todas las claves de mapeo que alguna columna de ALGÚN contrato consume,
 * junto con la necesidad más fuerte que le exige cualquier export que la use
 * (CLAVE > OBLIGATORIA > OPCIONAL) y el/los contrato(s) que la consumen.
 *
 * Es la base de `necessityOfField()` (fileUpload.js) y `pendingRequirements()`
 * (controlsWizard.js) — un campo no se marca a mano en dos lugares: se calcula
 * recorriendo los contratos una sola vez.
 */
export function fieldNecessityMap() {
  const rank = { [NECESSITY.CLAVE]: 3, [NECESSITY.OBLIGATORIA]: 2, [NECESSITY.OPCIONAL]: 1 };
  const map = new Map(); // key -> { necessity, contracts: Set<exportId> }

  for (const contract of Object.values(EXPORT_CONTRACTS)) {
    for (const col of contract.columns) {
      for (const key of col.from) {
        // Las 2 claves que Willy pidió no tocar todavía: nunca suben de
        // OPCIONAL, sin importar qué necesidad tenga la columna que las usa.
        const necessity = NO_TOCAR_TODAVIA.has(key) ? NECESSITY.OPCIONAL : col.necessity;
        const prev = map.get(key);
        if (!prev) {
          map.set(key, { necessity, contracts: new Set([contract.exportId]) });
        } else {
          prev.contracts.add(contract.exportId);
          if (rank[necessity] > rank[prev.necessity]) prev.necessity = necessity;
        }
      }
    }
  }
  return map;
}

/**
 * Necesidad de una clave de mapeo derivada de los contratos, o `null` si
 * ninguna columna de ningún contrato la usa (el campo no alimenta ningún
 * export declarado todavía — ver Paso 6, o es una precondición del parser que
 * ningún export consume, ver PARSER_PRECONDITIONS en fileUpload.js).
 */
export function necessityOfKey(key) {
  return fieldNecessityMap().get(key)?.necessity ?? null;
}

/**
 * Sentinel para "el analista declaró que este archivo no trae esta columna"
 * — la resolución de la tensión con D-036 (Paso 2 de specs/contrato-export.md,
 * mecanismo aprobado por Willy el 2026-08-12). Mismo patrón que `NO_LIQUIDADO`
 * de `js/ui/variacionesConceptMap.js`, pero como vocabulario propio: no es lo
 * mismo "no se liquidó este período" (variable mes a mes) que "este cliente
 * no tiene esta columna" (una propiedad del cliente, estable).
 *
 * Se guarda en el mismo lugar que un nombre de columna real
 * (`state.tabExtraConfig[key] = OMITIDO`) a propósito: así el resto del
 * código que hace `tm[key] ? … : null` ya trata la omisión como ausencia sin
 * ningún cambio — `row[OMITIDO]` no existe en ningún archivo real, así que
 * cae a `null` igual que si la clave nunca se hubiera completado. Sólo el
 * GATE y la UI necesitan distinguirlo explícitamente.
 */
export const OMITIDO = '__omitido__';

export function esOmitido(value) {
  return value === OMITIDO;
}

/**
 * ¿Esta clave de mapeo tiene que estar resuelta para poder avanzar, SIN vía
 * de escape?
 *
 * **El contrato es un piso, nunca un techo:** puede AGREGAR obligación sobre
 * el flag legado, nunca sacarla. Es lo que el diseño siempre quiso decir (el
 * test `tests/exportContracts.test.js` lo afirma desde el Paso 0: "el mapa
 * derivado no le baja la necesidad a nada que hoy ya bloquea"), pero el código
 * decía otra cosa: un `return false` en OPCIONAL le ganaba a `legacyRequired`.
 *
 * Eso era un bug real, no teórico. `fieldNecessityMap()` es plano por clave y
 * no por `(fileType, clave)` — una fragilidad que el Paso 0 documentó como "hoy
 * no hay colisión real". Sí la había: `puestoColumn` existe en DOS archivos con
 * necesidades opuestas (`tab_control` opcional, `cat_empleados` **required**), y
 * como el contrato de `brutos_reporte` la declara OPCIONAL desde el lado del
 * Tabulado, la Columna de Puesto del Reporte de Categorías dejó de bloquear:
 * se podía subir sin ella y EE x CATEG salteaba en silencio el chequeo de
 * discrepancias de Puesto y armaba la "Distribución por Puesto" con la columna
 * sin resolver. Justo el default silencioso que el Paso 1 había cerrado para
 * esos mismos 6 campos (ver el comentario del panel de remapeo en
 * `fileUpload.js`). Con el contrato como piso, la colisión deja de poder
 * producir un gate incorrecto: cada `legacyRequired` lo aporta el `FIELD_DEFS`
 * de SU propio fileType, que sí está scopeado.
 *
 * Sobre OBLIGATORIA: sigue sin bloquear por sí sola, y es a propósito. Los 18
 * conceptos de NR son OBLIGATORIA con `legacyRequired` en `false`; si
 * OBLIGATORIA bloqueara acá, ningún archivo de NR sin las 18 columnas se podría
 * subir, y ningún cliente las tiene. Marcar algo OBLIGATORIA declara la
 * expectativa; **bloquear sin la salida de "esto no lo trae" es peor que no
 * bloquear**. Esa salida (`OMITIDO`) hoy existe sólo en el panel del Paso 2, no
 * en el formulario de mapeo de archivo — hasta que exista ahí, OBLIGATORIA cae
 * al flag legado.
 *
 * @param {string} key
 * @param {boolean} [legacyRequired] — el `required` de FIELD_DEFS/TAB_*_FIELDS
 */
export function blocksProgress(key, legacyRequired = false) {
  if (necessityOfKey(key) === NECESSITY.CLAVE) return true;
  // OBLIGATORIA / OPCIONAL / no contratada: el flag legado manda. Un contrato
  // nunca desactiva un `required: true` que ya existía.
  return !!legacyRequired;
}
