// acumuladoresParser.js — Parser del export `repacumuladores` de Axton
//
// Formato esperado (fijo — igual en todas las cuentas de Axton):
//   Fila 1: encabezados. Fila 2+: datos. Una fila por legajo × acumulador
//   (columna `Operacion` = 'SUMA') o por legajo × acumulador × liquidación
//   (columna `Operacion` vacía, valores del mes propio del archivo).
//
// El parser no interpreta nada: sólo normaliza nombres de columna y tipos. Qué
// es "SUMA" vs "mes", cómo se consolida por legajo y cómo se arma el SAC
// teórico es lógica del control — ver js/controls/acumuladoresGanancias.js y
// specs/control-acumuladores-ganancias.md.
//
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

// Espacio duro (algunas celdas del export lo traen en vez de un espacio normal).
const NBSP = String.fromCharCode(160);

// Columna → alias aceptados. El primero es el nombre canónico del export.
const COLUMNS = {
  legajo:         ['Legajo', 'Nro Legajo', 'Nro. Legajo'],
  apellidoNombre: ['Apellido y Nombre', 'Apellido Y Nombre', 'Empleado'],
  cuil:           ['CUIL', 'CUIT'],
  ingreso:        ['Ingreso', 'Fecha Ingreso', 'Fecha de Ingreso'],
  egreso:         ['Egreso', 'Fecha Egreso', 'Fecha de Egreso'],
  nro:            ['Nro', 'Nro.', 'Numero'],
  acumulador:     ['Acumulador'],
  operacion:      ['Operacion'],
  valor:          ['Valor'],
  empresa:        ['Empresa'],
};

// Sin estas columnas el reporte no se puede armar.
const REQUIRED = ['legajo', 'nro', 'valor'];

/**
 * Parsea el export de Acumuladores (repacumuladores) de Axton.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 * @throws {Error} con mensaje en español si el archivo está vacío o le faltan columnas
 */
export function parseAcumuladores(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene hojas.');

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (rawRows.length === 0) throw new Error('La hoja de Acumuladores esta vacia.');

  const headers = (rawRows[0] || []).map(h => (h !== null ? String(h).trim() : ''));
  const colIdx  = resolveColumns(headers);

  const missing = REQUIRED.filter(field => colIdx[field] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias en el archivo de Acumuladores: `
      + `${missing.map(k => COLUMNS[k][0]).join(', ')}. `
      + `Encabezados encontrados: ${headers.filter(Boolean).join(', ')}`
    );
  }

  const parsedRows = [];

  for (const raw of rawRows.slice(1)) {
    if (!raw) continue;
    const cell = field => (colIdx[field] === undefined ? null : raw[colIdx[field]]);

    // Sin legajo valido no es una fila de datos.
    const legajo = norm(cell('legajo'));
    if (!legajo || !/\d/.test(legajo)) continue;

    // Sin codigo de acumulador no se puede matchear la fila a ningun concepto.
    const nro = toNum(cell('nro'));
    if (nro === null) continue;

    parsedRows.push({
      legajo,
      apellido_nombre: norm(cell('apellidoNombre')),
      cuil:            norm(cell('cuil')),
      ingreso:         toIsoDate(cell('ingreso')),
      egreso:          toIsoDate(cell('egreso')),
      nro,
      acumulador:      norm(cell('acumulador')),
      operacion:       normOperacion(cell('operacion')),
      valor:           toNum(cell('valor')),
      empresa:         norm(cell('empresa')),
    });
  }

  if (parsedRows.length === 0) {
    throw new Error('El archivo de Acumuladores no tiene filas con legajo y codigo de acumulador.');
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      parsedAt:  new Date().toISOString(),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveColumns(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    const k = hdrKey(h);
    if (!k) return;
    for (const [field, aliases] of Object.entries(COLUMNS)) {
      if (idx[field] !== undefined) continue;
      if (aliases.some(a => hdrKey(a) === k)) idx[field] = i;
    }
  });
  return idx;
}

// Clave de comparacion de encabezados: sin acentos, sin espacios duros, minuscula.
function hdrKey(v) {
  return stripDiacritics(String(v ?? '').split(NBSP).join(' '))
    .trim().toLowerCase()
    .replace(/\s+/g, ' ');
}

function norm(v) {
  return v == null ? '' : String(v).split(NBSP).join(' ').trim();
}

// Quita acentos normalizando a NFD y descartando todo lo no-ASCII (marcas
// combinantes incluidas) — evita depender de rangos unicode escritos a mano.
function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[^\x00-\x7F]/g, '');
}

// 'SUMA' (con variantes de acentuacion/mayusculas) -> 'SUMA'; vacia -> ''.
function normOperacion(v) {
  return norm(v).toUpperCase().startsWith('SUMA') ? 'SUMA' : '';
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).split(NBSP).join('').trim();
  if (s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/**
 * Normaliza una fecha de Excel a 'YYYY-MM-DD'.
 * Acepta Date, serial de Excel y string. Devuelve null si no hay fecha.
 */
function toIsoDate(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;

  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);

  const n = Number(v);
  if (!isNaN(n) && n > 1 && n < 100000) {
    return new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }

  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  return null;
}
