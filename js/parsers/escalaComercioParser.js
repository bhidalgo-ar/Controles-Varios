// escalaComercioParser.js — Parser de la escala salarial del convenio de Comercio
//
// Es la planilla que el estudio mantiene con el básico de convenio por categoría,
// una columna por mes (la pestaña se llama "ESCALA COM" en el archivo de Sportline).
// La usa el Control de Netos para verificar que el básico liquidado sea el que le
// corresponde a la categoría del empleado.
//
// Formato esperado:
//   Fila 1: encabezados — código de categoría, nombre de categoría, y una columna
//           por mes con el básico. El encabezado del mes es texto libre del estudio
//           ("1002 Basico mayo 2026"), así que **no se interpreta el mes**: se
//           guarda el encabezado tal cual y el control informa contra cuál coincidió.
//   Fila 2+: una fila por categoría.
//
// Por qué no se elige "la columna del mes": el analista tendría que acertarla y un
// error ahí compara contra la escala equivocada sin que nada avise. El control
// prueba el básico contra TODAS las columnas de mes e informa cuál matcheó — si un
// legajo matchea con un mes distinto al del resto, eso mismo es el hallazgo.
//
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

// Alias aceptados para las dos columnas de identificación. El resto de las
// columnas numéricas se toman como escalas mensuales.
const COD_CAT_ALIASES   = ['cod cat', 'codigo categoria', 'código categoría', 'cod categoria', 'codigo', 'código'];
const CATEGORIA_ALIASES = ['categoria', 'categoría', 'descripcion', 'descripción'];

const normalize = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toLowerCase();

/** Clave de comparación de una categoría: sin acentos, sin dobles espacios, en minúscula. */
export function categoriaKey(value) {
  return normalize(value);
}

/**
 * Parsea la escala salarial del convenio.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 * @throws {Error} con mensaje en español si el archivo no tiene la forma esperada
 */
export function parseEscalaComercio(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });

  // La escala puede venir en un libro con varias pestañas (la de Sportline trae
  // además el cálculo de sueldos y los tabulados). Se busca la que tenga las dos
  // columnas de identificación; si ninguna las tiene, se corta diciendo qué se
  // esperaba, en vez de leer la primera hoja y mapear cualquier cosa.
  let sheet = null;
  let sheetName = '';
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null });
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0]).map(normalize);
    if (headers.some(h => CATEGORIA_ALIASES.includes(h))) {
      sheet = workbook.Sheets[name];
      sheetName = name;
      break;
    }
  }

  if (!sheet) {
    throw new Error(
      'No encontré la escala salarial en este archivo. Se esperaba una hoja con una columna '
      + `"Categoria" y una columna por mes con el básico. Hojas encontradas: ${workbook.SheetNames.join(', ')}.`
    );
  }

  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const fileHeaders = Object.keys(rawRows[0]);

  const codCatHeader    = fileHeaders.find(h => COD_CAT_ALIASES.includes(normalize(h))) || null;
  const categoriaHeader = fileHeaders.find(h => CATEGORIA_ALIASES.includes(normalize(h)));

  // Las columnas de escala son todas las que no son de identificación y traen
  // al menos un número. Un encabezado vacío no cuenta: sheet_to_json le pone
  // "__EMPTY" y una columna sin nombre no se puede informar después.
  const escalaHeaders = fileHeaders.filter(h => {
    if (h === codCatHeader || h === categoriaHeader) return false;
    if (/^__EMPTY/.test(h)) return false;
    return rawRows.some(r => typeof r[h] === 'number' && r[h] > 0);
  });

  if (escalaHeaders.length === 0) {
    throw new Error(
      'La escala no tiene ninguna columna de básicos. Se esperaba al menos una columna con '
      + `importes por categoría (ej. "1002 Basico mayo 2026"). Columnas encontradas: ${fileHeaders.join(', ')}.`
    );
  }

  const parsedRows = [];
  for (const raw of rawRows) {
    const categoria = raw[categoriaHeader];
    if (categoria === null || categoria === undefined || String(categoria).trim() === '') continue;

    const basicos = {};
    for (const h of escalaHeaders) {
      const v = raw[h];
      if (typeof v === 'number' && v > 0) basicos[h] = v;
    }
    if (Object.keys(basicos).length === 0) continue;

    parsedRows.push({
      codCategoria: codCatHeader ? raw[codCatHeader] : null,
      categoria:    String(categoria).trim(),
      categoriaKey: categoriaKey(categoria),
      basicos,
    });
  }

  if (parsedRows.length === 0) {
    throw new Error(
      `La hoja "${sheetName}" no tiene ninguna categoría con básico. Se esperaba una fila por `
      + 'categoría del convenio con su básico del mes.'
    );
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows:     parsedRows.length,
      sheetName,
      escalaColumns: escalaHeaders,
    },
  };
}
