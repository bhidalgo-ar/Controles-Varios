// acreditacionesParser.js — Parser del export de Acreditaciones de Axton (contacred)
//
// Formato esperado (fijo — igual en todas las cuentas de Axton):
//   Hoja: la primera del workbook (ej: "contacred.20260804.033924.513").
//   Fila 1: separador ("----"). Fila 2: encabezados. Fila 3+: datos.
//   Última fila: "TOTAL GENERAL" (se descarta, no tiene legajo).
//   Una fila por legajo × liquidación.
//
// El parser no interpreta nada: sólo normaliza nombres de columna, tipos y el
// CBU (que viene con un espacio duro adelante). Qué filas son acreditaciones
// reales y cómo se agrupan en listas es lógica del control — ver
// js/controls/acreditaciones.js y specs/control-acreditaciones-axton.md.
//
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

// Columna → alias aceptados. El primero es el nombre canónico del export.
// Se comparan sin acentos, sin espacios de más y sin distinguir mayúsculas,
// para aguantar variantes menores entre cuentas de Axton.
const COLUMNS = {
  legajo:             ['Legajo', 'Nro Legajo', 'Nro. Legajo'],
  apellidoNombre:     ['Apellido y Nombre', 'Apellido Y Nombre', 'Empleado'],
  cuit:               ['CUIT', 'CUIL'],
  cliente:            ['Cliente'],
  uoCliente:          ['U.O. Cliente', 'UO Cliente'],
  liquidacion:        ['Liquidacion', 'Liquidación'],
  neto:               ['Neto', 'Neto a Pagar'],
  listado:            ['Listado', 'Nro Listado'],
  descripcion:        ['Descripcion', 'Descripción'],
  fechaAcreditacion:  ['Fecha Acreditacion', 'Fecha Acreditación', 'Fecha de Acreditacion'],
  banco:              ['Banco'],
  cbu:                ['CBU'],
  empresa:            ['Empresa'],
};

// Sin estas columnas el reporte no se puede armar.
const REQUIRED = ['legajo', 'liquidacion', 'neto', 'listado', 'fechaAcreditacion'];

/**
 * Parsea el export de Acreditaciones de Axton.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 * @throws {Error} con mensaje en español si el archivo está vacío o le faltan columnas
 */
export function parseAcreditaciones(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene hojas.');

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (rawRows.length === 0) throw new Error('La hoja de Acreditaciones está vacía.');

  const headerIdx = findHeaderRow(rawRows);
  if (headerIdx === -1) {
    throw new Error(
      'No se encontró la fila de encabezados del export de Acreditaciones. '
      + 'Se esperaba una fila con las columnas Legajo y Neto en las primeras 10 filas.'
    );
  }

  const headers = (rawRows[headerIdx] || []).map(h => (h !== null ? String(h).trim() : ''));
  const colIdx  = resolveColumns(headers);

  const missing = REQUIRED.filter(field => colIdx[field] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias en el archivo de Acreditaciones: `
      + `${missing.map(k => COLUMNS[k][0]).join(', ')}. `
      + `Encabezados encontrados: ${headers.filter(Boolean).join(', ')}`
    );
  }

  const parsedRows = [];
  let totalOrigen  = 0;   // suma de Neto de todas las filas, para el cierre del reporte

  for (const raw of rawRows.slice(headerIdx + 1)) {
    if (!raw) continue;
    const cell = field => (colIdx[field] === undefined ? null : raw[colIdx[field]]);

    // Sin legajo válido no es una fila de datos: separadores y "TOTAL GENERAL".
    const legajo = norm(cell('legajo'));
    if (!legajo || !/\d/.test(legajo)) continue;

    const neto = toNum(cell('neto'));
    if (neto !== null) totalOrigen += neto;

    parsedRows.push({
      legajo,
      apellido_nombre:     norm(cell('apellidoNombre')),
      cuit:                norm(cell('cuit')),
      cliente:             norm(cell('cliente')),
      uo_cliente:          norm(cell('uoCliente')),
      liquidacion:         norm(cell('liquidacion')),
      neto,
      listado:             norm(cell('listado')),
      descripcion:         norm(cell('descripcion')),
      fecha_acreditacion:  toIsoDate(cell('fechaAcreditacion')),
      banco:               norm(cell('banco')),
      cbu:                 normCbu(cell('cbu')),
      empresa:             norm(cell('empresa')),
    });
  }

  if (parsedRows.length === 0) {
    throw new Error('El archivo de Acreditaciones no tiene filas con legajo.');
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows:   parsedRows.length,
      // Ancla del cierre: el total del archivo tal como lo informa Axton, antes
      // de que el control descarte una sola fila.
      totalOrigen: round2(totalOrigen),
      parsedAt:    new Date().toISOString(),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// La fila de encabezados no es la primera: el export abre con un separador.
function findHeaderRow(rawRows) {
  const limit = Math.min(rawRows.length, 10);
  for (let i = 0; i < limit; i++) {
    const cells = (rawRows[i] || []).map(c => hdrKey(c));
    if (cells.includes('legajo') && cells.includes('neto')) return i;
  }
  return -1;
}

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

// Clave de comparación de encabezados: sin acentos, sin espacios duros, minúscula.
function hdrKey(v) {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase()
    .replace(/\s+/g, ' ');
}

function norm(v) {
  return v == null ? '' : String(v).replace(/\u00a0/g, ' ').trim();
}

// El CBU del export viene con un espacio duro adelante y son 22 dígitos: se
// conserva como string (con ceros a la izquierda), nunca como número.
function normCbu(v) {
  return norm(v).replace(/\s+/g, '');
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\u00a0/g, '').trim();
  if (s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

/**
 * Normaliza una fecha de Excel a 'YYYY-MM-DD'.
 * Acepta Date, serial de Excel y string. Devuelve null si no hay fecha.
 * Se usa UTC en todos los casos para que el resultado no dependa de la zona
 * horaria del navegador.
 */
function toIsoDate(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;

  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);

  const n = Number(v);
  if (!isNaN(n) && n > 1 && n < 100000) {
    return new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }

  const s = String(v).trim();
  // 'YYYY-MM-DD' o 'YYYY-MM-DD hh:mm:ss'
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // 'DD/MM/YYYY' o 'DD-MM-YYYY'
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  }
  return null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
