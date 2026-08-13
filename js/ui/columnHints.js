// columnHints.js — Qué trae la columna que el analista eligió, y si eso se
// parece a lo que ahí va.
//
// **El problema que resuelve.** Todo el trabajo del contrato de export
// (`specs/contrato-export.md`, Pasos 0-8) hace que una columna **vacía** grite:
// el gate no deja avanzar y el badge sale en amarillo. Una columna
// **equivocada** sigue pasando en verde — mapeada + obligatoria = satisfecha,
// aunque apunte al lugar errado. Y la mandatoriedad lo *empeora*, porque un
// `required` queda satisfecho por el valor equivocado. Ver
// `specs/muestra-y-aviso-de-columna.md` y `specs/auditoria-escalabilidad-2026-08.md`
// ("Lo único abierto").
//
// Dos primitivas, usadas por las DOS pantallas donde se elige una columna
// (el formulario de mapeo de `fileUpload.js` y el panel "Columnas del Tabulado"
// del Paso 2 en `controlsWizard.js`) y por la pantalla de resultados, que
// re-calcula los avisos de la corrida sin guardar nada nuevo:
//
//   1. `columnHintHtml()` — la muestra de 2 valores reales de esa columna.
//      Siempre visible (decisión de Willy, 2026-08-13): el caso más común es que
//      el analista NO toque nada, porque la app propone el mapeo sola, así que
//      una muestra que aparece sólo al abrir el desplegable no la ve nadie.
//   2. `checkColumnType()` — el aviso cuando el contenido no se parece al tipo
//      que declara el contrato. **Avisa, no traba** (D-036: un archivo raro del
//      cliente no puede dejar al analista sin salida, y la salida declarada
//      —el toggle ⊘— es para "no viene", no para "está mal").
//
// **Por qué `esc` viaja como parámetro.** El repo tiene 28 copias de
// `esc`/`escHtml`, una por módulo, y no hay una compartida. Sumar la 29ª acá
// sería empeorar un hotspot conocido, y crear `js/utils/html.js` está fuera del
// alcance de esta feature. Así que este módulo recibe el escapador de quien lo
// llama — el mismo patrón parametrizado de `consolidate.js` (`{ keyFn }`,
// `{ toNum }`), que es lo que D-042 aprendió a hacer bien. **Escapar no es
// opcional:** estos valores salen de un Excel de un tercero.

import { toNum } from '../utils/currency.js';

/** Cuántos valores se le muestran al analista. Dos alcanzan para reconocer una
 *  columna y no empujan el resto del formulario fuera de pantalla. */
const MAX_VALORES = 2;

/** Truncado de cada valor mostrado. Un nombre de centro de costo largo no puede
 *  romper la grilla de dos columnas del panel. */
const MAX_LARGO = 22;

/** Cuántas filas con dato se miran para decidir el aviso. */
const FILAS_A_MIRAR = 20;

/** Con menos de 2 valores con dato no se afirma nada: un archivo donde la
 *  columna trae un solo `"-"` no es evidencia de que la columna esté mal. */
const MIN_EVIDENCIA = 2;

// Rango de serial de Excel que puede ser una fecha de nómina: 1970-01-01
// (25569) a 2100-01-01 (73415). Es a propósito más angosto que el `n > 1 && n <
// 100000` de los `fmtDate` de los controles, que convierte cualquier número
// plausible en una fecha plausible — justamente el amplificador de este
// problema (queda anotado en ROADMAP.md como trabajo aparte: cambiarlo altera
// lo que sale en tres controles).
const SERIAL_MIN = 25569;
const SERIAL_MAX = 73415;

const RE_FECHA_TEXTO = /^\s*\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}\s*$/;

/**
 * Los primeros valores **con dato** de una columna, a partir de filas que son
 * objetos indexados por encabezado (`parsedRows` del Tabulado, ya parseado).
 *
 * Saltea vacíos en vez de cortar en el primero: una columna de indemnizaciones
 * tiene dato en 3 de 500 filas, y mostrar dos celdas vacías no dice nada.
 *
 * @param {object[]} rows
 * @param {string}   column  nombre del encabezado
 * @param {number}   [max]
 * @returns {any[]}
 */
export function columnValues(rows, column, max = FILAS_A_MIRAR) {
  if (!column || !Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (out.length >= max) break;
    const v = row?.[column];
    if (tieneDato(v)) out.push(v);
  }
  return out;
}

/**
 * Igual que `columnValues`, pero para la vista previa de la pantalla de carga,
 * que llega como filas de array (`any[][]`) alineadas con `headers` — el
 * archivo todavía no se parseó, así que no hay objetos por encabezado.
 *
 * @param {any[][]}  previewRows
 * @param {string[]} headers
 * @param {string}   column
 * @param {number}   [max]
 */
export function columnValuesFromMatrix(previewRows, headers, column, max = FILAS_A_MIRAR) {
  if (!column || !Array.isArray(previewRows) || !Array.isArray(headers)) return [];
  const idx = headers.indexOf(column);
  if (idx < 0) return [];
  const out = [];
  for (const row of previewRows) {
    if (out.length >= max) break;
    const v = Array.isArray(row) ? row[idx] : undefined;
    if (tieneDato(v)) out.push(v);
  }
  return out;
}

/**
 * ¿Este valor se parece a lo que el contrato declara para esa columna?
 *
 * `'txt'` acepta cualquier cosa a propósito: un importe **es** texto válido, así
 * que afirmar lo contrario sería un aviso que salta siempre. Un tipo que no
 * conocemos (o ninguno, porque la clave no alimenta ningún export declarado)
 * también acepta todo — el aviso no puede depender de una declaración que no
 * existe.
 *
 * @param {any} value
 * @param {'num'|'date'|'txt'|null|undefined} type
 */
export function looksLikeType(value, type) {
  if (type === 'num')  return toNum(value) !== null;
  if (type === 'date') return pareceFecha(value);
  return true;
}

/**
 * El aviso para una columna, o `null` si no hay nada que decir.
 *
 * **Conservador a propósito:** avisa sólo si NINGUNO de los valores mirados se
 * parece al tipo esperado. Un aviso que salta de más se ignora a la tercera vez
 * y deja de proteger — el mismo riesgo de fatiga que `specs/contrato-export.md`
 * anota para las omisiones declaradas. Lo que este criterio no puede ver
 * (importes en una columna donde va OTRO importe) es lo que ataja la muestra
 * visible, y es la razón por la que la muestra va primero.
 *
 * @param {any[]} values  valores con dato, de `columnValues`
 * @param {'num'|'date'|'txt'|null|undefined} expectedType
 * @returns {{ expected: string, mensaje: string }|null}
 */
export function checkColumnType(values, expectedType) {
  if (expectedType !== 'num' && expectedType !== 'date') return null;
  if (!Array.isArray(values) || values.length < MIN_EVIDENCIA) return null;
  if (values.some(v => looksLikeType(v, expectedType))) return null;

  return {
    expected: expectedType,
    mensaje: expectedType === 'num'
      ? 'Los valores de esta columna no parecen importes — revisá si es la columna correcta.'
      : 'Los valores de esta columna no parecen fechas — revisá si es la columna correcta.',
  };
}

/**
 * Un valor, como se le muestra al analista: fecha en `dd/mm/aaaa`, el resto tal
 * cual vino, truncado.
 */
export function formatSampleValue(value) {
  let s;
  if (value instanceof Date) {
    const d = String(value.getDate()).padStart(2, '0');
    const m = String(value.getMonth() + 1).padStart(2, '0');
    s = `${d}/${m}/${value.getFullYear()}`;
  } else {
    s = String(value ?? '').replace(/\s+/g, ' ').trim();
  }
  return s.length > MAX_LARGO ? `${s.slice(0, MAX_LARGO - 1)}…` : s;
}

/**
 * La muestra + el aviso de una columna, listos para pegar debajo de su
 * `<select>`. Devuelve `''` cuando no hay nada que mostrar (columna sin elegir,
 * columna declarada ausente con ⊘, archivo sin filas de muestra): una línea
 * vacía en 27 columnas es ruido, no información.
 *
 * @param {any[]}  values         valores con dato (de `columnValues`)
 * @param {string} [expectedType] el `type` del contrato para esa clave
 * @param {object} opts
 * @param {(s:any)=>string} opts.esc  el escapador de quien llama (ver arriba)
 */
export function columnHintHtml(values, expectedType, { esc }) {
  if (typeof esc !== 'function') throw new Error('columnHintHtml necesita un `esc`');
  if (!Array.isArray(values) || values.length === 0) return '';

  const muestra = values.slice(0, MAX_VALORES).map(formatSampleValue).filter(s => s !== '');
  const aviso   = checkColumnType(values, expectedType);

  const lineaMuestra = muestra.length
    ? `<div class="col-hint" data-col-hint-sample>ej.: ${muestra.map(v => esc(v)).join(' · ')}</div>`
    : '';
  const lineaAviso = aviso
    ? `<div class="col-hint col-hint--warn" data-col-hint-warn>⚠ ${esc(aviso.mensaje)}</div>`
    : '';

  return `${lineaMuestra}${lineaAviso}`;
}

function tieneDato(v) {
  if (v === null || v === undefined) return false;
  if (v instanceof Date) return true;
  return String(v).trim() !== '';
}

function pareceFecha(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === 'number') return value >= SERIAL_MIN && value <= SERIAL_MAX;
  const s = String(value ?? '').trim();
  if (s === '') return false;
  if (RE_FECHA_TEXTO.test(s)) return true;
  // Un serial que viajó como string (el Tabulado HTML devuelve todo string).
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) && n >= SERIAL_MIN && n <= SERIAL_MAX;
}
