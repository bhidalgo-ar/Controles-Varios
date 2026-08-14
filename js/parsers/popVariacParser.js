// popVariacParser.js — Parser del reporte de variaciones que exporta Axton
//
// Es el archivo CONTRA el que se controla lo que genera el control de Variación
// entre quincenas (`js/controls/popVariaciones.js`): mismo período, armado por
// Axton. No se cruza contra el Tabulado — se cruza contra el reporte generado.
//
// Formato (.xlsx real):
//   fila 1  encabezados
//   fila 2+ datos, una fila por legajo
//   puede cerrar con una fila vacía
//
// **Las 14 columnas se resuelven por POSICIÓN**, no por nombre, y es a propósito:
// dos pares de columnas tienen encabezados que no identifican nada — los dos
// períodos vienen como una fecha suelta (el mismo serial en las dos cuando la
// comparación es dentro del mismo mes) y las dos de Puesto se llaman igual
// ("Puesto 07/2026"). Además el archivo real trae "% Varicación", con el typo:
// buscar por nombre ahí es más frágil que contar columnas.
//
//   0 Legajo · 1 Apellido y Nombre · 2 valor hora quincena anterior
//   3 valor hora quincena actual · 4 MOD · 5 Variación · 6 % Varicación
//   7 MOD CBU · 8 Puesto anterior · 9 Puesto actual · 10 MOD Puesto
//   11 Alta · 12 Baja · 13 Neto
//
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

const COLS = 14;

/**
 * Parsea el reporte de variaciones de Axton.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 * @throws {Error} con mensaje en español si el archivo no tiene la forma esperada
 */
export function parseVariacAxton(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene hojas.');

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (rawRows.length < 2) throw new Error('El reporte de variaciones de Axton está vacío.');

  const headers = (rawRows[0] || []).map(norm);
  if (!/^legajo$/i.test(headers[0] || '')) {
    throw new Error(
      'La primera columna del archivo no es "Legajo": no parece el reporte de variaciones de Axton. '
      + `Encabezado encontrado: "${headers[0] || '(vacío)'}".`
    );
  }
  if (headers.length < COLS) {
    throw new Error(
      `El reporte de variaciones de Axton trae ${headers.length} columnas y se esperaban ${COLS} `
      + '(Legajo, Apellido y Nombre, los dos períodos, MOD, Variación, %, MOD CBU, los dos Puestos, '
      + 'MOD Puesto, Alta, Baja y Neto).'
    );
  }

  const avisos = [];
  // Las columnas se leen por posición, pero las 4 que SÍ tienen un encabezado
  // estable se verifican: si el layout cambió, sale como aviso en vez de
  // comparar campos corridos en silencio.
  const esperados = { 4: 'MOD', 7: 'MOD CBU', 10: 'MOD Puesto', 11: 'Alta', 12: 'Baja', 13: 'Neto' };
  for (const [i, esperado] of Object.entries(esperados)) {
    const real = headers[i] || '(vacío)';
    if (hdrKey(real) !== hdrKey(esperado)) {
      avisos.push(`La columna ${Number(i) + 1} del reporte de Axton dice "${real}" y se esperaba "${esperado}": `
        + 'revisá que el archivo tenga el layout de siempre.');
    }
  }

  const parsedRows = [];
  for (const raw of rawRows.slice(1)) {
    if (!raw) continue;
    const legajo = norm(raw[0]);
    if (legajo === '') continue;                 // la fila vacía del cierre
    if (!/^\d+$/.test(legajo)) continue;         // cualquier fila de leyenda
    parsedRows.push({
      legajo,
      apellido_nombre: norm(raw[1]),
      vh_anterior:     toNum(raw[2]),
      vh_actual:       toNum(raw[3]),
      mod:             flag(raw[4]),
      variacion:       toNum(raw[5]),
      pct_variacion:   toNum(raw[6]),
      mod_cbu:         flag(raw[7]),
      puesto_anterior: norm(raw[8]),
      puesto_actual:   norm(raw[9]),
      mod_puesto:      flag(raw[10]),
      alta:            flag(raw[11]),
      baja:            flag(raw[12]),
      neto:            toNum(raw[13]),
    });
  }

  if (parsedRows.length === 0) {
    throw new Error('El reporte de variaciones de Axton no tiene filas con legajo.');
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      // Los dos encabezados de período, tal como los escribió Axton. Se
      // informan, no se usan para decidir nada: el período de la comparación
      // sale de los Tabulados.
      periodoAnterior: fmtHeaderPeriod(rawRows[0]?.[2]),
      periodoActual:   fmtHeaderPeriod(rawRows[0]?.[3]),
      avisos,
      parsedAt: new Date().toISOString(),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Los S/N del reporte de Axton. El guión (`-`) es "no corresponde" y viaja como
 * `null`, no como `'N'`: son dos respuestas distintas y el control las compara
 * distinto.
 */
function flag(v) {
  const s = norm(v).toUpperCase();
  if (s === '' || s === '-') return null;
  return s;
}

function norm(v) {
  return v == null ? '' : String(v).replace(/\u00a0/g, ' ').trim();
}

function hdrKey(v) {
  return norm(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\u00a0/g, '').trim();
  if (s === '' || s === '-') return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

/** El encabezado de período de Axton llega como serial de Excel: 46204 → '07/2026'. */
function fmtHeaderPeriod(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  if (isNaN(n) || n <= 1 || n >= 100000) return String(v).trim();
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}
