// finadietAsientoParser.js — Parser del excel "FINADIET CONCEPTOS" (export de Meta4)
//
// Formato esperado:
//   Hoja: la primera del workbook.
//   Unas filas de título, después la fila de encabezados, después los datos.
//   Cada fila de datos es un movimiento contable COMPLETO: el mismo importe va al
//   Debe de una cuenta y al Haber de otra (dos columnas de código, no una).
//
// El parser no interpreta nada de contabilidad: ubica la fila de encabezados,
// resuelve columnas, normaliza tipos y descarta lo que no es un movimiento. Qué
// cuenta es de Resultado, qué centro de costo lleva prefijo y cómo se agrupa el
// asiento es lógica del control — ver js/controls/finadietAsiento.js y
// specs/finadiet-asiento-remuneraciones.md.
//
// Las columnas se leen por NOMBRE de encabezado, nunca por posición: el reporte
// de Meta4 cambia de ancho entre versiones y una columna insertada corre todas
// las de la derecha — leer "la columna 25 porque ahí estaba el importe" produce
// un asiento coherente y mal, que es el peor resultado posible (CLAUDE.md). El
// nombre lo confirma el analista en el Paso 2 y eso siempre gana (D-039);
// `autoDetectFinadietAsientoMapping` sólo pre-completa por alias de encabezado.
//
/* global XLSX */
import { toNum } from '../utils/currency.js';

// Alias de encabezado por clave de mapeo (se comparan sin acentos, sin espacios
// duros y sin distinguir mayúsculas). Es semilla de la auto-detección: si el
// archivo trae otro nombre, el analista elige la columna en el Paso 2.
const ALIASES = {
  centroColumn:      ['Centro de Costo', 'Centro Costo', 'CentroCosto', 'C. Costo', 'Cto Costo'],
  importeColumn:     ['Importe', 'Monto', 'Importe Transaccion', 'Importe Transacción'],
  cuentaDebeColumn:  ['Codigo Debe', 'Código Debe', 'Cod. Debe', 'Cta Debe', 'Cuenta Debe Codigo', 'Cuenta Debe Código'],
  cuentaHaberColumn: ['Codigo Haber', 'Código Haber', 'Cod. Haber', 'Cta Haber', 'Cuenta Haber Codigo', 'Cuenta Haber Código'],
  cuentaDebeNombreColumn:  ['Cuenta Debe', 'Nombre Cuenta Debe', 'Cuenta Contable Debe', 'Descripcion Debe', 'Descripción Debe'],
  cuentaHaberNombreColumn: ['Cuenta Haber', 'Nombre Cuenta Haber', 'Cuenta Contable Haber', 'Descripcion Haber', 'Descripción Haber'],
  nroConceptoColumn: ['Nro', 'Nro Concepto', 'Nro. Concepto', 'Cod. Concepto', 'Codigo Concepto', 'Código Concepto'],
  conceptoColumn:    ['Concepto', 'Nombre Concepto', 'Descripcion Concepto', 'Descripción Concepto'],
};

// Sin estas cuatro no hay asiento: los dos códigos de cuenta, el importe, y el
// centro de costo (que define el prefijo de las cuentas de Resultado).
const REQUERIDAS = ['cuentaDebeColumn', 'cuentaHaberColumn', 'importeColumn', 'centroColumn'];

// Hasta dónde buscar la fila de encabezados. El preámbulo real son 3 filas; se
// dan 10 de margen por si el export cambia de título.
const MAX_PREAMBULO = 10;

// Mínimo de celdas con texto para que una fila pueda ser la de encabezados. El
// encabezado real trae más de 30 y las filas de título 1 o 2, así que 3 alcanza
// para distinguirlos — y deja pasar un archivo recortado a mano, que sigue
// siendo un archivo válido si trae las columnas que el mapeo pide.
const MIN_CELDAS_ENCABEZADO = 3;

/**
 * Encabezados del archivo, con la fila de encabezados ubicada por contenido (no
 * es la primera: arriba hay filas de título). Reemplaza al `detectHeaders`
 * plano de nominaMaestra.js para este tipo de archivo — con el plano, los
 * desplegables del Paso 2 listarían el texto del título en vez de las columnas.
 *
 * @returns {{ headers: string[], preview: any[][] }}
 */
export function detectHeaders(arrayBuffer) {
  const rawRows = leerFilas(arrayBuffer);
  const headerIdx = findHeaderRow(rawRows);
  if (headerIdx === -1) {
    throw new Error(
      'No se encontró la fila de encabezados. Se esperaba, en las primeras '
      + `${MAX_PREAMBULO} filas, una con al menos ${MIN_CELDAS_ENCABEZADO} nombres de columna `
      + '(el excel "FINADIET CONCEPTOS" de Meta4 abre con unas filas de título).'
    );
  }
  return {
    headers: normHeaders(rawRows[headerIdx]),
    preview: rawRows.slice(headerIdx + 1, headerIdx + 4),
  };
}

/**
 * Pre-completa el mapeo por alias de encabezado. Devuelve `null` —no un objeto
 * vacío— si no reconoce ninguna de las columnas requeridas: el wizard usa ese
 * `null` para pedir el mapeo a mano.
 *
 * @param {string[]} headers
 */
export function autoDetectFinadietAsientoMapping(headers) {
  const porClave = hdrIndex(headers);

  const mapping = {};
  for (const [key, aliases] of Object.entries(ALIASES)) {
    const encontrado = aliases.map(a => porClave.get(hdrKey(a))).find(h => h !== undefined);
    if (encontrado !== undefined) mapping[key] = encontrado;
  }

  return REQUERIDAS.some(k => mapping[k]) ? mapping : null;
}

/**
 * Parsea el excel "FINADIET CONCEPTOS" con el mapeo ya definido.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {object} mapping - claves de ALIASES → nombre de columna del archivo
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 * @throws {Error} con mensaje en español si falta un mapeo o el archivo no tiene la forma esperada
 */
export function parseFinadietAsiento(arrayBuffer, mapping = {}) {
  const sinMapear = REQUERIDAS.filter(k => !mapping[k]);
  if (sinMapear.length > 0) {
    throw new Error(
      `Falta indicar qué columna del archivo es: ${sinMapear.map(etiqueta).join(', ')}. `
      + 'Completalo en el mapeo de columnas y volvé a confirmar.'
    );
  }

  const rawRows = leerFilas(arrayBuffer);
  const headerIdx = findHeaderRow(rawRows);
  if (headerIdx === -1) {
    throw new Error('No se encontró la fila de encabezados del archivo "FINADIET CONCEPTOS".');
  }

  const headers   = normHeaders(rawRows[headerIdx]);
  const porColumna = colIndex(headers);
  const idx = {};
  for (const key of Object.keys(ALIASES)) {
    if (!mapping[key]) continue;
    const i = porColumna.get(hdrKey(mapping[key]));
    if (i === undefined) {
      // Pasa cuando el mapeo viene del perfil guardado de una sesión anterior y
      // el archivo de este mes cambió el nombre de esa columna. Cortar con el
      // nombre viejo y el listado real es lo único que deja arreglarlo.
      if (REQUERIDAS.includes(key)) {
        throw new Error(
          `La columna "${mapping[key]}" (${etiqueta(key)}) no está en este archivo. `
          + `Encabezados encontrados: ${headers.filter(Boolean).join(' | ')}.`
        );
      }
      continue;
    }
    idx[key] = i;
  }

  const parsedRows = [];
  let descartadasIguales = 0;    // Debe == Haber: conceptos base/informativos de Meta4
  let descartadasSinCodigo = 0;  // ninguno de los dos códigos de cuenta
  let descartadasSinImporte = 0; // con código de cuenta pero sin importe legible

  for (const raw of rawRows.slice(headerIdx + 1)) {
    if (!raw) continue;
    const cell = key => (idx[key] === undefined ? null : raw[idx[key]]);

    const cuentaDebe  = normCode(cell('cuentaDebeColumn'));
    const cuentaHaber = normCode(cell('cuentaHaberColumn'));
    const centro      = normText(cell('centroColumn'));
    const importeRaw  = cell('importeColumn');

    // Fila vacía o de separación: no aporta ni cuenta como descarte.
    const vacia = !cuentaDebe && !cuentaHaber && !centro
      && (importeRaw === null || importeRaw === undefined || String(importeRaw).trim() === '');
    if (vacia) continue;

    if (!cuentaDebe && !cuentaHaber) { descartadasSinCodigo++; continue; }
    if (cuentaDebe && cuentaHaber && cuentaDebe === cuentaHaber) { descartadasIguales++; continue; }

    // `toNum`, no `parseFloat`: el importe puede venir como número ya parseado
    // por SheetJS o como texto es-AR, y `parseFloat('1.234,56')` devuelve 1.234
    // — un importe mil veces más chico que no rompe nada y nadie detecta. `null`
    // (celda vacía o ilegible) NO es 0: la fila se descarta y se cuenta.
    const importe = toNum(importeRaw);
    if (importe === null) { descartadasSinImporte++; continue; }

    parsedRows.push({
      centro,
      importe,
      cuenta_debe:         cuentaDebe,
      cuenta_debe_nombre:  normText(cell('cuentaDebeNombreColumn')),
      cuenta_haber:        cuentaHaber,
      cuenta_haber_nombre: normText(cell('cuentaHaberNombreColumn')),
      nro_concepto:        normText(cell('nroConceptoColumn')),
      concepto:            normText(cell('conceptoColumn')),
    });
  }

  if (parsedRows.length === 0) {
    throw new Error(
      'El archivo no tiene ninguna fila con código de cuenta e importe. Se leyeron '
      + `${Math.max(0, rawRows.length - headerIdx - 1)} fila(s) de datos y se descartaron todas `
      + `(${descartadasSinCodigo} sin código de cuenta, ${descartadasIguales} con Debe = Haber, `
      + `${descartadasSinImporte} sin importe). Revisá que sea el excel "FINADIET CONCEPTOS" del período.`
    );
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      headerRowIndex: headerIdx,
      descartadasIguales,
      descartadasSinCodigo,
      descartadasSinImporte,
      parsedAt: new Date().toISOString(),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function leerFilas(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene hojas.');
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (rawRows.length === 0) throw new Error('La primera hoja del archivo está vacía.');
  return rawRows;
}

/**
 * Índice de la fila de encabezados: la que más celdas con texto tiene entre las
 * primeras `MAX_PREAMBULO`, con un mínimo de `MIN_CELDAS_ENCABEZADO`. Se mide
 * densidad y no un nombre puntual a propósito: si se buscara "Importe", un
 * archivo que renombre esa columna dejaría al parser sin poder ubicar ni la fila
 * de encabezados, y el analista no tendría de dónde elegir en el Paso 2. La
 * densidad no depende de ningún nombre — el encabezado real trae más de 30
 * celdas y las filas de título, 1 o 2.
 */
function findHeaderRow(rawRows) {
  const limit = Math.min(rawRows.length, MAX_PREAMBULO);
  let best = -1, bestCount = 0;
  for (let i = 0; i < limit; i++) {
    const count = (rawRows[i] || []).filter(c => String(c ?? '').trim() !== '').length;
    if (count > bestCount) { best = i; bestCount = count; }
  }
  return bestCount >= MIN_CELDAS_ENCABEZADO ? best : -1;
}

function normHeaders(row) {
  return (row || []).map(h => (h !== null && h !== undefined ? String(h).trim() : ''));
}

/** Encabezado normalizado → nombre exacto tal como está en el archivo. */
function hdrIndex(headers) {
  const map = new Map();
  headers.forEach(h => {
    const k = hdrKey(h);
    if (k && !map.has(k)) map.set(k, h);
  });
  return map;
}

/** Encabezado normalizado → índice de esa columna en la fila. */
function colIndex(headers) {
  const map = new Map();
  headers.forEach((h, i) => {
    const k = hdrKey(h);
    if (k && !map.has(k)) map.set(k, i);
  });
  return map;
}

/** Clave de comparación de encabezados: sin acentos, sin espacios duros, minúscula. */
function hdrKey(v) {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.:]+$/, '');
}

function etiqueta(key) {
  return {
    centroColumn:      'Centro de Costo',
    importeColumn:     'Importe',
    cuentaDebeColumn:  'Código de cuenta Debe',
    cuentaHaberColumn: 'Código de cuenta Haber',
  }[key] || ALIASES[key]?.[0] || key;
}

function normText(v) {
  return v == null ? '' : String(v).replace(/\u00a0/g, ' ').trim();
}

/**
 * Código de cuenta contable como string estable. Las subcuentas vienen con un
 * decimal ('213215.1') y SheetJS las entrega como número: `String()` da
 * '213215.1' y '213111' respectivamente, que es la forma con la que se busca en
 * la tabla de cuentas — venga la celda como texto o como número.
 */
function normCode(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(v);
  return String(v).replace(/\u00a0/g, '').trim();
}
