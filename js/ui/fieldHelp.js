// fieldHelp.js — Cómo se presenta un campo del Paso 2 (regla 3 del rediseño, D-055).
//
// El panel "Columnas del Tabulado" pide hasta 29 columnas, y hasta acá cada una
// se presentaba con el `label` de su ficha: `'A_CTA_FUT_AUMEN — columna en
// Tabulado'`. Ese texto es el código del concepto, no su nombre: el analista que
// no lo tiene memorizado no puede decidir qué columna elegir sin ir a preguntar.
//
// Este módulo agrega el nombre en criollo **sin renombrar ninguna clave
// interna**: `tabACuFutAumenColumn` sigue siendo `tabACuFutAumenColumn` en el
// state, en el perfil guardado y en los contratos de export. Lo único que cambia
// es lo que se lee en pantalla — nombre en criollo arriba, código técnico en
// mono al lado (para el que sí lo tiene memorizado, y para poder buscarlo en el
// archivo) y, detrás de un "?", la explicación larga.
//
// **Es una tabla y no una derivación a propósito.** Nada en el código sabe que
// `INDEM_ANT_DESP` es "Indemnización por antigüedad (despido)": es conocimiento
// de nómina, y adivinarlo con reglas de texto daría nombres plausibles y
// equivocados. Lo que no está en la tabla cae al código, que es exactamente lo
// que se veía antes — un campo sin nombre criollo se ve peor, pero nunca miente.
// `tests/fieldHelp.test.js` es el guard de que la tabla cubra las claves que el
// panel muestra de verdad.

import { NECESSITY } from '../exports/contracts.js';

/**
 * Nombre en criollo y explicación larga de cada columna del Tabulado que pide
 * el Paso 2. La clave es la del `extraFieldGroups` de la ficha `tab_control`.
 *
 *   name — cómo lo diría un analista. Sin el código adentro: el código va al
 *          lado, en mono, y repetirlo acá lo deja dos veces en la misma línea.
 *   help — la explicación larga del "?" — sólo donde agrega algo que no se
 *          deduce del nombre (dónde suele venir en el archivo, con qué se
 *          confunde). Un popover que repite el nombre es ruido.
 *
 * Las cuatro claves sin `name` —ASIG_PAS, REINT_GUARD, INCREMENTO_ST y
 * GRA_VACNOG_SAC— están así porque no sabemos qué nombran exactamente y un
 * nombre inventado por analogía es peor que el código: se ven con su código,
 * igual que antes de este módulo. Cuando Willy los confirme, se agregan acá y
 * nada más.
 */
export const TAB_FIELD_LABELS = {
  // ── Brutos ────────────────────────────────────────────────────────────────
  tabSalBaseColumn: {
    code: 'SAL_BASE',
    name: 'Sueldo básico',
    help: 'El sueldo básico del mes, antes de adicionales. En el Tabulado suele venir como «Sueldo Mensual» o «Sueldo Básico».',
  },
  tabACuFutAumenColumn: {
    code: 'A_CTA_FUT_AUMEN',
    name: 'A cuenta de futuros aumentos',
    help: 'El adelanto que la empresa paga a cuenta del próximo aumento paritario. En el Tabulado suele venir como «A Cta Fut Aumen» o «Anticipo Paritaria».',
  },

  // ── GS Pers ───────────────────────────────────────────────────────────────
  tabGtosPersonalesColumn: {
    code: 'GTOS_PERSONALES',
    name: 'Gastos personales',
    help: 'Los gastos personales que se le descuentan al empleado. Es lo que se compara contra el Reporte de GS Pers.',
  },
  tabDtoCocheraColumn: {
    code: 'DTO_COCHERA',
    name: 'Descuento de cochera',
    help: 'Ojo con este: en el mismo Tabulado conviven «COCHERA_IG» y «DTO_COCHERA», y son conceptos distintos. Elegí la columna por su código, no por el nombre.',
  },

  // ── Indemnizatorios (NR) ──────────────────────────────────────────────────
  tabIndemPreavisoColumn:  { code: 'INDEM_PREAVISO',  name: 'Indemnización por preaviso' },
  tabSacPreavisoColumn:    { code: 'SAC_PREAVISO',    name: 'SAC sobre preaviso' },
  tabIndemAntDespColumn:   { code: 'INDEM_ANT_DESP',  name: 'Indemnización por antigüedad (despido)' },
  tabIndemAntFalleColumn:  { code: 'INDEM_ANT_FALLE', name: 'Indemnización por antigüedad (fallecimiento)' },
  tabIndemIntegColumn:     { code: 'INDEM_INTEG',     name: 'Integración del mes de despido' },
  tabSacIndemIntegColumn:  { code: 'SAC_INDEM_INTEG', name: 'SAC sobre la integración' },
  tabIndmMaternidadColumn: { code: 'INDM_MATERNIDAD', name: 'Indemnización por maternidad' },
  tabVacNoGozadasColumn:   { code: 'VAC_NO_GOZADAS',  name: 'Vacaciones no gozadas' },
  tabVacNoGozSacColumn:    { code: 'VAC_NO_GOZ_SAC',  name: 'SAC sobre vacaciones no gozadas' },
  tabGratVacColumn:        { code: 'GRAT_VAC',        name: 'Gratificación por vacaciones' },
  tabGraVacnogSacColumn:   { code: 'GRA_VACNOG_SAC' },
  tabIndemFuerMayColumn:   { code: 'INDEM_FUER_MAY',  name: 'Indemnización por fuerza mayor' },
  tabIndemEmbarazoColumn:  { code: 'INDEM_EMBARAZO',  name: 'Indemnización por embarazo' },

  // ── Otros NR ──────────────────────────────────────────────────────────────
  tabReinHomeOficeColumn: {
    code: 'REIN_HOME_OFICE',
    name: 'Reintegro de home office',
    help: 'El reintegro de gastos por trabajar desde casa. Va como no remunerativo, así que sale en el Reporte de NR y no en el de Brutos.',
  },
  tabGratExtraordColumn:  { code: 'GRAT_EXTRAORD',  name: 'Gratificación extraordinaria' },
  tabAsigPasColumn:       { code: 'ASIG_PAS' },
  tabReintGuardColumn:    { code: 'REINT_GUARD' },
  tabIncrementoStColumn:  { code: 'INCREMENTO_ST' },
  tabAjusteNrColumn:      { code: 'AJUSTE_NR', name: 'Ajuste de no remunerativos' },

  // ── Identificación (NR) ───────────────────────────────────────────────────
  tabIdCentroTrabColumn: {
    code: 'ID_CENTRO_TRAB',
    name: 'ID del centro de trabajo',
    help: 'El código del centro de trabajo del empleado. Sale en el Reporte de NR como dato del legajo — no es un importe.',
  },
  tabIdCategoriaColumn: {
    code: 'ID_CATEGORIA',
    name: 'ID de categoría',
    help: 'El código de la categoría del convenio del empleado. Sale en el Reporte de NR como dato del legajo — no es un importe.',
  },

  // ── Compartidas (van siempre) ─────────────────────────────────────────────
  tabNombreColumn:    { code: 'NOMBRE',      name: 'Nombre' },
  tabApellido1Column: { code: 'APELLIDO_1',  name: 'Apellido' },
  tabFecAltaColumn:   { code: 'FECHA_ALTA',  name: 'Fecha de alta' },
  tabFecBajaColumn: {
    code: 'FECHA_BAJA',
    name: 'Fecha de baja',
    help: 'La fecha en que el empleado se dio de baja. Que venga vacía en casi todas las filas es lo normal: sólo la traen los legajos que se fueron en el período.',
  },
  tabFecPagoColumn:   { code: 'FEC_PAGO',    name: 'Fecha de pago' },
};

/**
 * Cómo se muestra un campo: nombre en criollo (o el código, si no hay), código
 * técnico y explicación larga.
 *
 * @param {string} key                clave interna (`tabSalBaseColumn`)
 * @param {object} [opts]
 * @param {string} [opts.fallbackLabel] el `label` de la ficha, por si la clave
 *        no está en la tabla NI trae código — el campo se ve, no desaparece.
 * @returns {{ name: string, code: string, help: string }}
 */
export function tabFieldParts(key, { fallbackLabel = '' } = {}) {
  const entry = TAB_FIELD_LABELS[key] || {};
  const code  = entry.code || '';
  return {
    name: entry.name || code || fallbackLabel || key,
    // Con nombre criollo el código va al lado; sin él, el nombre YA es el
    // código y repetirlo lo dejaría dos veces en la misma línea.
    code: entry.name ? code : '',
    help: entry.help || '',
  };
}

/**
 * Qué pasa si este campo se queda sin columna, dicho en una línea. Se genera de
 * la necesidad que declara el contrato de export — no se escribe a mano por
 * campo, porque entonces cada uno podría decir algo distinto de lo que el gate
 * hace de verdad.
 *
 * Es el texto que baja a la vista (regla 3: "cuando el campo está pendiente, la
 * explicación baja a texto visible") y el cierre del popover del "?".
 */
export function necessityHelp(necessity) {
  if (necessity === NECESSITY.CLAVE) {
    return 'Sin esta columna el archivo no se puede leer: no hay forma de saltearla.';
  }
  if (necessity === NECESSITY.OBLIGATORIA) {
    return 'Es obligatoria para este control: sin ella no se puede comparar contra el reporte. Si tu Tabulado no la trae, marcala con ⊘ «no viene».';
  }
  return 'Si el Tabulado no la trae, el control corre igual y ese dato sale vacío.';
}

/**
 * El badge de origen del valor del campo (regla 3): de dónde salió lo que está
 * elegido, o que no hay nada elegido.
 *
 *   'exact' → auto ✓            lo propuso la app en esta corrida
 *   'saved' → ↺ sesión anterior venía del perfil guardado del cliente
 *   'warn'  → ⚠ sin asignar     hay que elegirlo (o declararlo ausente)
 *   omitido → ⊘ no viene        el analista declaró que el archivo no la trae
 *
 * `omitido` gana sobre el nivel: es una decisión del analista y no un estado
 * del pre-completado.
 */
export function fieldBadgeHtml(level, { omitido = false } = {}) {
  if (omitido) return '<span class="field__badge field__badge--omit">⊘ no viene</span>';
  if (level === 'exact') return '<span class="field__badge field__badge--auto">auto ✓</span>';
  if (level === 'saved') return '<span class="field__badge field__badge--saved">↺ sesión anterior</span>';
  if (level === 'warn')  return '<span class="field__badge field__badge--warn">⚠ sin asignar</span>';
  return '';
}
