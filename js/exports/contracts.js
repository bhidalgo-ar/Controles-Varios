// contracts.js — Fuente única de qué columnas exporta cada control y de qué
// clave de mapeo sale cada una. La obligatoriedad de un campo de ENTRADA se
// DERIVA de estos contratos (ver necessityOfField en js/ui/fileUpload.js y
// pendingRequirements en js/ui/controlsWizard.js) — no se declara dos veces.
//
// Ver specs/contrato-export.md para el porqué y el plan completo por pasos.
// Este archivo es el Paso 0: declara los contratos SIN cambiar comportamiento
// todavía. `layout` recién se usa a partir del Paso 4 (writeContractSheet).

import { NR_CONCEPTS } from '../controls/nr.js';

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

/**
 * @typedef {object} ExportColumn
 * @property {string}   label      encabezado literal del archivo entregado
 * @property {string}   key        propiedad de la fila que devuelve run()
 * @property {string[]} from       claves de mapeo, en orden de precedencia
 *                                 (D-039) — [] si la columna es derivada
 *                                 (se calcula, no sale de ningún archivo)
 * @property {string}   necessity  uno de NECESSITY.*
 */

/**
 * @typedef {object} ExportContract
 * @property {string}        exportId
 * @property {string}        sheet
 * @property {'fijo'}        layout
 * @property {'payroll'|'finanzas'} audience  D-020: 'finanzas' no puede
 *                                            llevar columnas de dotación/HR.
 * @property {ExportColumn[]} columns
 */

// ── Brutos ────────────────────────────────────────────────────────────────────

/** Modo Controlar: comparación fija de 9 columnas, sin `cols.has*` — ya se
 * comporta como layout:'fijo' por construcción (nombre/legajo siempre se
 * emiten, aunque nombre pueda venir vacío). */
const brutosControlar = {
  exportId: 'brutos', sheet: 'Control de Brutos', layout: LAYOUT_FIJO, audience: 'payroll',
  columns: [
    { label: 'Legajo',              key: 'legajo',         from: ['legajoColumn'],         necessity: NECESSITY.CLAVE },
    { label: 'Apellido y Nombre',   key: 'nombre',         from: ['apellidoNombreColumn'], necessity: NECESSITY.OPCIONAL },
    { label: 'SAL_BASE',            key: 'salBase',        from: ['salBaseColumn'],        necessity: NECESSITY.OBLIGATORIA },
    { label: 'CTRL SALARIO BASE',   key: 'ctrlSalBase',    from: [],                       necessity: NECESSITY.OBLIGATORIA },
    { label: 'A_CTA_FUT_AUMEN',     key: 'aCuFutAumen',    from: ['aCuFutAumenColumn'],    necessity: NECESSITY.OBLIGATORIA },
    { label: 'CTRL A_CTA_FUT_AUMEN', key: 'ctrlACuFutAumen', from: [],                     necessity: NECESSITY.OBLIGATORIA },
    { label: 'Legajo (Tab)',        key: 'legajo',         from: ['empleadoColumn'],       necessity: NECESSITY.CLAVE },
    { label: 'SAL_BASE (Tab)',      key: 'tabValSal',      from: ['tabSalBaseColumn'],     necessity: NECESSITY.OBLIGATORIA },
    { label: 'A_CTA_FUT (Tab)',     key: 'tabValAcu',      from: ['tabACuFutAumenColumn'], necessity: NECESSITY.OBLIGATORIA },
  ],
};

/** Modo Generar Reporte: hoy usa `cols.has*` — la columna DESAPARECE si la
 * clave de origen no está mapeada (10 columnas en vez de 11). Paso 4a migra
 * esto a layout:'fijo' (encabezado siempre, celda vacía). */
const brutosReporte = {
  exportId: 'brutos_reporte', sheet: 'Reporte de Brutos', layout: LAYOUT_FIJO, audience: 'payroll',
  columns: [
    { label: 'FECHA_INI',      key: 'fecIni',      from: [],                                      necessity: NECESSITY.OBLIGATORIA },
    { label: 'FECHA_FIN',      key: 'fecFin',      from: [],                                      necessity: NECESSITY.OBLIGATORIA },
    { label: 'ID_EMPLEADO',    key: 'legajo',      from: ['empleadoColumn'],                       necessity: NECESSITY.CLAVE },
    { label: 'NOMBRE',         key: 'nombre',      from: ['tabNombreColumn', 'apellidoNombreColumn'], necessity: NECESSITY.OPCIONAL },
    { label: 'APELLIDO_1',     key: 'apellido1',   from: ['tabApellido1Column'],                   necessity: NECESSITY.OPCIONAL },
    { label: 'FECHA_ALTA',     key: 'fecAlta',     from: ['tabFecAltaColumn'],                     necessity: NECESSITY.OPCIONAL },
    { label: 'FECHA_BAJA',     key: 'fecBaja',     from: ['tabFecBajaColumn'],                     necessity: NECESSITY.OPCIONAL },
    { label: 'FEC_PAGO',       key: 'fecPago',     from: ['tabFecPagoColumn'],                     necessity: NECESSITY.OPCIONAL },
    { label: 'SAL_BASE',       key: 'salBase',     from: ['tabSalBaseColumn'],                     necessity: NECESSITY.OBLIGATORIA },
    { label: 'A_CTA_FUT_AUMEN', key: 'aCuFutAumen', from: ['tabACuFutAumenColumn'],                necessity: NECESSITY.OBLIGATORIA },
    { label: 'N_PUESTO',       key: 'puesto',      from: ['puestoColumn'],                         necessity: NECESSITY.OPCIONAL },
  ],
};

// ── GS Pers ───────────────────────────────────────────────────────────────────

const gsPersControlar = {
  exportId: 'gs_pers', sheet: 'Control GS Pers', layout: LAYOUT_FIJO, audience: 'payroll',
  columns: [
    { label: 'Legajo',               key: 'legajo',   from: ['legajoColumn'],           necessity: NECESSITY.CLAVE },
    { label: 'GTOS_PERSONALES',      key: 'gtos',     from: ['gtosPersonalesColumn'],   necessity: NECESSITY.OBLIGATORIA },
    { label: 'CTRL GTOS_PERSONALES', key: 'ctrlGtos', from: [],                         necessity: NECESSITY.OBLIGATORIA },
    { label: 'DTO_COCHERA',          key: 'dto',      from: ['dtoCocheraColumn'],       necessity: NECESSITY.OBLIGATORIA },
    { label: 'CTRL DTO_COCHERA',     key: 'ctrlDto',  from: [],                         necessity: NECESSITY.OBLIGATORIA },
    { label: 'GTOS_PERSONALES (Tab)', key: 'tabValGtos', from: ['tabGtosPersonalesColumn'], necessity: NECESSITY.OBLIGATORIA },
    { label: 'DTO_COCHERA (Tab)',    key: 'tabValDto', from: ['tabDtoCocheraColumn'],    necessity: NECESSITY.OBLIGATORIA },
  ],
};

const gsPersReporte = {
  exportId: 'gs_pers_reporte', sheet: 'Reporte GS Pers', layout: LAYOUT_FIJO, audience: 'payroll',
  columns: [
    { label: 'FECHA_INI',         key: 'fecIni',    from: [],                                      necessity: NECESSITY.OBLIGATORIA },
    { label: 'FECHA_FIN',         key: 'fecFin',    from: [],                                      necessity: NECESSITY.OBLIGATORIA },
    { label: 'ID_EMPLEADO',       key: 'legajo',    from: ['empleadoColumn'],                       necessity: NECESSITY.CLAVE },
    { label: 'NOMBRE',            key: 'nombre',    from: ['tabNombreColumn', 'apellidoNombreColumn'], necessity: NECESSITY.OPCIONAL },
    { label: 'APELLIDO_1',        key: 'apellido1', from: ['tabApellido1Column'],                   necessity: NECESSITY.OPCIONAL },
    { label: 'FEC_PAG',           key: 'fecPago',   from: ['tabFecPagoColumn'],                     necessity: NECESSITY.OPCIONAL },
    { label: 'FECHA_ALTA',        key: 'fecAlta',   from: ['tabFecAltaColumn'],                     necessity: NECESSITY.OPCIONAL },
    { label: 'ID_CENTRO_COSTO',   key: 'idCC',      from: ['idCCColumn'],                           necessity: NECESSITY.OPCIONAL },
    { label: 'GTOS_PERSONALES',   key: 'gtos',      from: ['tabGtosPersonalesColumn'],              necessity: NECESSITY.OBLIGATORIA },
    { label: 'DTO_COCHERA',       key: 'dto',       from: ['tabDtoCocheraColumn'],                  necessity: NECESSITY.OBLIGATORIA },
    { label: 'N_CENTRO_COSTO',    key: 'nCC',       from: ['ccColumn'],                             necessity: NECESSITY.OPCIONAL },
  ],
};

// ── NR ────────────────────────────────────────────────────────────────────────
// Derivado de NR_CONCEPTS (js/controls/nr.js) — no se repite la lista de 18
// conceptos en un segundo lugar. Cada concepto se lee de DOS mapeos según el
// modo: el archivo NR (`nrKey`) en modo Controlar, el Tabulado (`tabKey`) en
// los dos modos.

const nrConceptColumn = (c, key) => ({
  label: c.label, key: c.key, from: [key], necessity: NECESSITY.OBLIGATORIA,
});

const nrControlar = {
  exportId: 'nr', sheet: 'Control NR', layout: LAYOUT_FIJO, audience: 'payroll',
  columns: [
    { label: 'Legajo', key: 'legajo', from: ['legajoColumn'], necessity: NECESSITY.CLAVE },
    { label: '# Difs', key: 'difs',   from: [],                necessity: NECESSITY.OBLIGATORIA },
    ...NR_CONCEPTS.map(c => nrConceptColumn(c, c.nrKey)),
  ],
};

const nrReporte = {
  exportId: 'nr_reporte', sheet: 'Reporte NR', layout: LAYOUT_FIJO, audience: 'payroll',
  columns: [
    { label: 'ID_EMPLEADO',     key: 'legajo',          from: ['empleadoColumn'],  necessity: NECESSITY.CLAVE },
    { label: 'NOMBRE',          key: 'nombre',          from: ['tabNombreColumn', 'apellidoNombreColumn'], necessity: NECESSITY.OPCIONAL },
    { label: 'APELLIDO_1',      key: 'apellido1',       from: ['tabApellido1Column'], necessity: NECESSITY.OPCIONAL },
    { label: 'FECHA_ALTA',      key: 'fecAlta',         from: ['tabFecAltaColumn'],  necessity: NECESSITY.OPCIONAL },
    { label: 'FECHA_BAJA',      key: 'fecBaja',         from: ['tabFecBajaColumn'],  necessity: NECESSITY.OPCIONAL },
    { label: 'FEC_PAGO',        key: 'fecPago',         from: ['tabFecPagoColumn'],  necessity: NECESSITY.OPCIONAL },
    { label: 'ID_CENTRO_TRAB',  key: 'idCentroTrab',    from: ['tabIdCentroTrabColumn'], necessity: NECESSITY.OPCIONAL },
    { label: 'ID_CATEGORIA',    key: 'idCategoria',     from: ['tabIdCategoriaColumn'],  necessity: NECESSITY.OPCIONAL },
    ...NR_CONCEPTS.map(c => nrConceptColumn(c, c.tabKey)),
  ],
};

export const EXPORT_CONTRACTS = {
  brutos:           brutosControlar,
  brutos_reporte:   brutosReporte,
  gs_pers:          gsPersControlar,
  gs_pers_reporte:  gsPersReporte,
  nr:               nrControlar,
  nr_reporte:       nrReporte,
};

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
 * ¿Esta clave de mapeo tiene que estar resuelta para poder avanzar, SIN vía
 * de escape?
 *
 * A propósito **sólo bloquea fuerte en CLAVE**, no en OBLIGATORIA. Bloquear
 * OBLIGATORIA sin la omisión declarada (Paso 2 de specs/contrato-export.md,
 * todavía no existe) rompería la carga hoy mismo: los 18 conceptos de NR son
 * OBLIGATORIA en el contrato y `legacyRequired` es `false` en los 18 — si
 * OBLIGATORIA bloqueara ya, ningún archivo de NR que no tenga las 18 columnas
 * se podría subir, y ningún cliente tiene las 18. Marcar algo OBLIGATORIA
 * declara la expectativa; **bloquear sin la salida de "esto no lo trae" es
 * peor que no bloquear**, así que hasta que exista esa salida, OBLIGATORIA
 * cae al flag legado (sin cambio de comportamiento) y sólo CLAVE es duro.
 *
 * Para una clave que todavía no está en ningún contrato (los controles del
 * Paso 6: rend_file, cat_empleados, costo_total_file, acreditaciones,
 * variaciones, acumuladores) también cae al flag legado.
 *
 * @param {string} key
 * @param {boolean} [legacyRequired] — el `required` de FIELD_DEFS/TAB_*_FIELDS
 */
export function blocksProgress(key, legacyRequired = false) {
  const necessity = necessityOfKey(key);
  if (necessity === NECESSITY.CLAVE)    return true;
  if (necessity === NECESSITY.OPCIONAL) return false;
  // OBLIGATORIA (o clave no contratada todavía): sin cambio hasta el Paso 2.
  return !!legacyRequired;
}
