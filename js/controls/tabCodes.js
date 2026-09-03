// tabCodes.js — Resolver una columna del Tabulado por código de concepto.
//
// El encabezado del Tabulado de Meta4 viene como `"1003-SUELDO"`: código,
// guión, nombre. El nombre lo renombra el cliente sin avisar; el código es
// estable. Por eso la búsqueda es **por código**, nunca por nombre.
//
// Que sea por código no es un detalle: el Tabulado real de Marval trae
// `"4899-COCHERA_IG"` y `"8805-DTO_COCHERA"`. Buscar "COCHERA" por nombre
// engancha la primera y compara el descuento de cochera contra el impuesto a
// las ganancias de la cochera — un número mal, no un vacío, que es la forma más
// silenciosa del error (mismo mecanismo que el bug de `conceptMatcher`).
//
// El orden de resolución es el de D-039 y lo aplica `resolveTabColumn()`:
//   (1) lo que el analista confirmó en el Paso 2 (`controlConfigs`) — siempre gana;
//   (2) búsqueda por código en los encabezados del archivo del mes;
//   (3) recién ahí, nada: si no se puede resolver, se informa y se pide. Nunca 0,00.

/**
 * Mapa código → nombre de columna, a partir de los encabezados de una fila.
 * Soporta `"1003-SUELDO"` / `"1003_SUELDO"` (extrae `"1003"`) y el nombre
 * numérico exacto `"1003"`. Con dos encabezados del mismo código gana el
 * primero, que es el orden del archivo.
 *
 * Reemplaza las copias que tenían `rendXEe.js` y `rendVsTabu.js` (D-042).
 */
export function buildColByCode(sampleRowOrHeaders) {
  const colByCode = {};
  if (!sampleRowOrHeaders) return colByCode;
  const headers = Array.isArray(sampleRowOrHeaders)
    ? sampleRowOrHeaders
    : Object.keys(sampleRowOrHeaders);
  for (const col of headers) {
    const s = String(col).trim();
    const m = s.match(/^(\d+)[-_]/);
    if (m) {
      if (!colByCode[m[1]]) colByCode[m[1]] = col;
    } else if (/^\d+$/.test(s)) {
      if (!colByCode[s]) colByCode[s] = col;
    }
  }
  return colByCode;
}

/**
 * El CÓDIGO de concepto que declara un encabezado del Tabulado: de
 * `"3903-INDEM_PREAVISO"` sale `"3903"`, y de un encabezado que es sólo el
 * número, ese número. Devuelve `null` cuando el encabezado no declara ninguno
 * —o cuando no hay encabezado— y `null` acá significa "no se sabe", nunca un
 * código inventado por parecido.
 *
 * Es la vuelta de `buildColByCode()`: ahí se busca la columna de un código, acá
 * se pregunta qué código tiene una columna que ya se resolvió. Sirve para
 * NOMBRAR un concepto en pantalla por su código —el Tabulado trae
 * `"4899-COCHERA_IG"` y `"8805-DTO_COCHERA"`, y una ficha que muestre sólo
 * "COCHERA" manda a mirar el concepto equivocado.
 *
 * @param {string?} header nombre de columna del Tabulado
 * @returns {string|null}
 */
export function codeOfColumn(header) {
  const s = String(header ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d+)[-_]/);
  if (m) return m[1];
  return /^\d+$/.test(s) ? s : null;
}

/**
 * Códigos **semilla** de las columnas del Tabulado que alimentan un control.
 *
 * Son semilla, no identidad (D-035/D-039): sirven para el cliente que todavía
 * no configuró nada. Una renumeración se arregla desde la pantalla del Paso 2,
 * que siempre gana sobre esto, y no con un commit.
 *
 * Confirmados el 2026-08-12 contra un Tabulado real de Marval (04-2026, 101
 * columnas) que trajo Willy — no se infirieron por simetría, que es lo que D-039
 * prohíbe explícitamente. Los 8 conceptos NR que **no** aparecen en ese archivo
 * quedan sin semilla a propósito: no se liquidaron ese mes, así que no hay con
 * qué confirmar su código. Esos siguen pidiéndose explícitamente en el Paso 2,
 * que es el comportamiento correcto (D-036).
 */
export const TAB_CODE_SEEDS = {
  // Reporte de Brutos — ya estaban cableados en brutos.js, acá se confirman.
  tabSalBaseColumn:         '1003', // 1003-SUELDO
  tabACuFutAumenColumn:     '1017', // 1017-A_CTA_FUT_AUMEN
  // Gastos personales y descuento de cochera.
  tabGtosPersonalesColumn:  '8802', // 8802-GTOS_PERSONAL
  tabDtoCocheraColumn:      '8805', // 8805-DTO_COCHERA (¡no 4899-COCHERA_IG!)
  // No Remunerativos — 11 de los 19 conceptos.
  tabReinHomeOficeColumn:   '3025', // 3025-REIN_HOME_OFICE
  tabIndemPreavisoColumn:   '3903', // 3903-INDEM_PREAVISO
  tabSacPreavisoColumn:     '3905', // 3905-SAC_PREAVISO
  tabIndemAntDespColumn:    '3913', // 3913-INDEM_ANT_DESP
  tabIndemIntegColumn:      '3943', // 3943-INDEM_INTEG
  tabSacIndemIntegColumn:   '3945', // 3945-SAC_INDEM_INTEG
  tabVacNoGozadasColumn:    '3973', // 3973-VAC_NO_GOZADAS
  tabVacNoGozSacColumn:     '3974', // 3974-VAC_NO_GOZ_SAC
  tabGratExtraordColumn:    '1203', // 1203-GRAT_EXTRAORD
  tabReintGuardColumn:      '4897', // 4897-REINT_GUARD
  // Lo trajo Willy el 2026-09-03 al pedir el concepto: sale de la numeración
  // del cliente, no de una analogía con otro código.
  tabAjusteNrColumn:        '4418', // 4418-AJUSTE_NR
  // Sin semilla, a propósito (no liquidados en el Tabulado de muestra):
  //   tabIndemAntFalleColumn, tabIndmMaternidadColumn, tabGratVacColumn,
  //   tabGraVacnogSacColumn, tabIndemFuerMayColumn, tabIndemEmbarazoColumn,
  //   tabAsigPasColumn, tabIncrementoStColumn.
};

/**
 * Resuelve el nombre de columna del Tabulado para una clave de mapeo, en el
 * orden de D-039. Devuelve `null` si no se puede resolver — y `null` significa
 * "informalo y pedilo", nunca "vale cero".
 *
 * @param {object}  sampleRow   una fila del Tabulado (para leer sus encabezados)
 * @param {string}  key         clave de mapeo, ej. `'tabDtoCocheraColumn'`
 * @param {string?} configured  lo confirmado por el analista en el Paso 2
 * @param {object} [opts]
 * @param {object} [opts.colByCode]  mapa ya construido, para no rearmarlo por concepto
 */
export function resolveTabColumn(sampleRow, key, configured, { colByCode } = {}) {
  // (1) Lo confirmado gana, siempre y sin mirar si el código existe: si el
  // analista eligió una columna, esa es la columna. Que el valor guardado siga
  // existiendo en el archivo del mes lo valida `isStaleTabValue()` en el wizard.
  if (configured) return configured;

  // (2) Búsqueda por código.
  const code = TAB_CODE_SEEDS[key];
  if (!code) return null;
  const byCode = colByCode || buildColByCode(sampleRow);
  return byCode[code] || null;
}
