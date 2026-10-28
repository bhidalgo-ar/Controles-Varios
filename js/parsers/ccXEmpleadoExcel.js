// ccXEmpleadoExcel.js — Parser del archivo CC x Empleado (override de centro de costo)
//
// Acepta dos formatos:
//
//   1. El de siempre — la primera hoja, con encabezados EMPLEADO, APELLIDO Y
//      NOMBRE, ID_CENTRO_COSTO, CENTRO_COSTO. Una fila por empleado con su CC
//      actualizado.
//   2. El listado de Marval tal cual lo manda ("Asignación de dimensiones y
//      rendimiento"): encabezados ID_EMPLEADO, FEC_ALTA_EMPLEADO, ID_CC_CONTA,
//      ID_CONTA, ID RENDIMIENTO, RENDIMIENTO, ID_EMPRESA en la fila 1, en TODAS
//      las hojas (trae "Activos" y "Bajas"). El área a la que va cada empleado
//      es RENDIMIENTO; el centro de la Contabilidad, ID_CC_CONTA. Las columnas
//      sin título (notas al costado) se ignoran.
//
// Uso: cuando el CC_NOMBRE de CONTA está desactualizado, o cuando un centro
// (Directores) no es un área sino gente repartida en varias, este archivo
// asigna el CC a partir del ID_EMPLEADO.
//
/* global XLSX */

const REQUIRED_HEADERS = ['EMPLEADO', 'CENTRO_COSTO'];
const MARVAL_HEADERS   = ['ID_EMPLEADO', 'ID_CC_CONTA', 'RENDIMIENTO'];

function norm(v) { return v == null ? '' : String(v).trim(); }

/** Los encabezados de la fila 1 de una hoja, sin los vacíos. */
function headersOf(sheet) {
  const first = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })[0] || [];
  return first.map(norm).filter(Boolean);
}

const esFormatoMarval = headers => MARVAL_HEADERS.every(h => headers.includes(h));

/**
 * Parsea el Excel de CC x Empleado.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 */
export function parseCcXEmpleado(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene hojas.');

  if (esFormatoMarval(headersOf(sheet))) return parseListadoMarval(workbook);

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  if (rawRows.length === 0) throw new Error('La hoja de CC x Empleado está vacía.');

  const headers = Object.keys(rawRows[0]);
  const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `Faltan columnas obligatorias en CC x Empleado: ${missing.join(', ')}. `
      + `Se espera EMPLEADO + CENTRO_COSTO, o el listado de asignación con `
      + `${MARVAL_HEADERS.join(', ')}. Encabezados encontrados: ${headers.join(', ')}`
    );
  }

  const parsedRows = [];
  for (const row of rawRows) {
    const empleado = norm(row['EMPLEADO']);
    const cc       = norm(row['CENTRO_COSTO']);
    if (!empleado || !cc) continue;
    parsedRows.push({
      id_empleado:     empleado,
      id_centro_costo: norm(row['ID_CENTRO_COSTO']),
      centro_costo:    cc,
    });
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      parsedAt:  new Date().toISOString(),
    },
  };
}

/**
 * El listado de Marval: todas las hojas que traen sus encabezados (una hoja
 * sin ellos —una de notas— se saltea). Si un legajo aparece en dos hojas
 * (Activos y Bajas), queda la última fila leída, igual que en el formato de
 * siempre, donde el control se queda con la última fila de cada legajo.
 */
function parseListadoMarval(workbook) {
  const parsedRows = [];
  const hojas = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet || !esFormatoMarval(headersOf(sheet))) continue;
    hojas.push(name);
    for (const row of XLSX.utils.sheet_to_json(sheet, { defval: null })) {
      const empleado = norm(row['ID_EMPLEADO']);
      const cc       = norm(row['RENDIMIENTO']);
      if (!empleado || !cc) continue;
      parsedRows.push({
        id_empleado:     empleado,
        id_centro_costo: norm(row['ID_CC_CONTA']),
        centro_costo:    cc,
      });
    }
  }
  if (parsedRows.length === 0) {
    throw new Error(`El listado de asignación no trae empleados con RENDIMIENTO en ninguna hoja (${hojas.join(', ')}).`);
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      formato:   'listado_asignacion',
      hojas,
      parsedAt:  new Date().toISOString(),
    },
  };
}
