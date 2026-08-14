// runWarnings.js — Los avisos de una corrida, en una sola frase cada uno.
//
// Son los dos avisos de "avisa, no traba" (D-036) que el analista vio en el
// Paso 2 y decidió pasar por alto:
//
//   1. El nombre del archivo no trae la sigla del reporte (`siglaMismatch`).
//   2. El contenido de una columna elegida no se parece a lo que ahí va
//      (`checkColumnType`, ver js/ui/columnHints.js).
//
// Hasta acá se veían al elegir y se recalculaban en la pantalla de resultados
// (`columnWarningsOf`), pero el de la sigla no quedaba en ningún lado y los
// avisos de las columnas del Paso 2 (las de `tabExtraConfig`) tampoco: el que
// revisaba la corrida después no tenía forma de saber que se corrió con un
// archivo o una columna sospechosa.
//
// **Por eso los avisos viajan con el run** (`warnings: string[]`, aditivo 2 del
// rediseño): se arman ACÁ al ejecutar, con lo que el analista tenía en pantalla
// en ese momento, y se guardan tal cual. Los runs viejos no tienen el campo y
// eso es un resultado válido: la sección sale vacía, no rota.

import { columnValues, checkColumnType } from './columnHints.js';
import { typeOfKey } from '../exports/contracts.js';
import { fileTypeLabel } from './fileTypes.js';

/**
 * Los avisos de tipo de todas las columnas mapeadas de un conjunto de archivos.
 *
 * Sólo mira las claves cuyo valor es una columna que **existe** entre los
 * encabezados de las filas: eso deja afuera, sin necesidad de saber nada de cada
 * parser, tanto las omisiones declaradas (⊘) como las claves de mapeo que no son
 * columnas (períodos, configs, filas de otro archivo).
 *
 * @param {{fileType: string, parsedRows: object[], mapping: object}[]} files
 * @returns {{fileType: string, columna: string, mensaje: string}[]}
 */
export function columnWarningsOf(files) {
  const out = [];
  for (const f of (files || [])) {
    const rows = f?.parsedRows;
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const encabezados = new Set(Object.keys(rows[0]));
    for (const [key, col] of Object.entries(f.mapping || {})) {
      if (typeof col !== 'string' || !encabezados.has(col)) continue;
      const aviso = checkColumnType(columnValues(rows, col), typeOfKey(f.fileType, key));
      if (aviso) out.push({ fileType: f.fileType, columna: col, mensaje: aviso.mensaje });
    }
  }
  return out;
}

/**
 * Los avisos de la corrida, ya redactados para mostrarse tal cual en el popover
 * "Detalles del run" y en el export. Una frase por aviso, sin HTML: lo que se
 * guarda es texto y quien lo pinta lo escapa.
 *
 * @param {{fileType: string, fileName?: string, siglaMismatch?: boolean,
 *          parsedRows?: object[], mapping?: object}[]} files
 * @returns {string[]}
 */
export function collectRunWarnings(files) {
  const avisos = [];

  // Primero los del archivo entero, después los de cada columna: el orden en
  // que el analista los vio en el Paso 2.
  for (const f of (files || [])) {
    if (f?.siglaMismatch) {
      avisos.push(`${fileTypeLabel(f.fileType)}: la sigla del nombre no coincide — lo usaste bajo tu criterio.`);
    }
  }
  for (const a of columnWarningsOf(files)) {
    avisos.push(`«${a.columna}» en ${fileTypeLabel(a.fileType)}: ${a.mensaje}`);
  }

  // El mismo Tabulado puede entrar dos veces (el archivo y sus columnas del
  // Paso 2 viajan por separado): un aviso repetido no dice nada nuevo.
  return [...new Set(avisos)];
}
