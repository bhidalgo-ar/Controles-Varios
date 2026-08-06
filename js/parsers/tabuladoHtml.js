// tabuladoHtml.js — Soporte para el Tabulado que llega como .xls pero es HTML
//
// Algunos sistemas de liquidación (el de OPmobility / Plastic Omnium Florida, por
// ejemplo) exportan el Tabulado con extensión .xls cuando en realidad el contenido
// es una tabla HTML. SheetJS no lo reconoce: lo lee como texto plano y lo parte por
// las comas de los atributos `style=`, así que la primera "columna" termina siendo
// el <span> del encabezado y el archivo queda inservible.
//
// Este módulo detecta ese formato y lo parsea a la misma forma que devuelve SheetJS
// (headers + filas de celdas), para que el resto de la app lo trate como cualquier
// otro Tabulado y el mapeo por nombre de columna siga funcionando igual.
//
// Va con expresiones regulares y no con DOMParser a propósito: así el mismo código
// corre en el navegador y en los tests de Node, que no tienen DOM.

const NBSP = / /g;

// Cantidad mínima de celdas para considerar que una fila es de datos. Un Tabulado
// siempre trae al menos Legajo + Nombre + CUIL + un concepto. No hace falta un
// umbral alto: el ancho se decide por frecuencia, y las filas de empleado son
// siempre muchas más que la de TOTAL GENERAL (que además tiene 2 celdas menos).
const MIN_DATA_CELLS = 4;

/**
 * ¿El archivo es HTML disfrazado de Excel?
 * Se mira solo el arranque del contenido, que es donde está el <span> o la <table>.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {boolean}
 */
export function isHtmlTabulado(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer).subarray(0, 4096);
  const inicio = new TextDecoder('latin1').decode(bytes);
  return /<\s*(table|tr|span|html)\b/i.test(inicio);
}

/**
 * Decodifica el contenido. El export no declara charset y viene en Windows-1252;
 * si el archivo resulta ser UTF-8 válido se respeta.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {string}
 */
export function decodeHtmlTabulado(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(bytes);
}

/** Saca tags y entidades de una celda y normaliza los espacios duros. */
function textoDeCelda(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(NBSP, ' ').trim();
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function celdas(filaHtml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\s*>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(filaHtml)) !== null) out.push(textoDeCelda(m[1]));
  return out;
}

/**
 * Parsea el Tabulado HTML.
 *
 * Detalles del formato que resuelve:
 * - Los encabezados están en <th> con el formato "CÓDIGO - Nombre del concepto",
 *   más una segunda fila de <th> con "Imp" repetido que no corresponde a ninguna
 *   columna de datos: se corta la lista de headers en el ancho real de las filas.
 * - La cantidad de columnas varía entre períodos según qué conceptos se liquidaron,
 *   así que el ancho se deduce de las propias filas (el más frecuente).
 * - La fila "TOTAL GENERAL" tiene colspan=3 en su primera celda (fusiona
 *   Legajo+Nombre+CUIL), por lo que sus índices están corridos 2 columnas respecto
 *   de las filas de empleado. Se devuelve aparte y NO se usa para mapear columnas.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], rows: string[][], totalRow: string[]|null, meta: object }}
 */
export function parseHtmlTabulado(arrayBuffer) {
  const html = decodeHtmlTabulado(arrayBuffer);

  const filas = [];
  const reTr = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  let m;
  while ((m = reTr.exec(html)) !== null) filas.push(m[1]);

  if (filas.length === 0) {
    throw new Error('El archivo no tiene ninguna fila de tabla (<tr>). Verificá que sea el Tabulado exportado por el sistema de liquidación.');
  }

  // Ancho real de una fila de datos = la cantidad de celdas más frecuente.
  const conteo = new Map();
  for (const fila of filas) {
    const n = (fila.match(/<td\b/gi) || []).length;
    if (n >= MIN_DATA_CELLS) conteo.set(n, (conteo.get(n) || 0) + 1);
  }
  let ancho = 0, maxFrec = 0;
  for (const [n, frec] of conteo) {
    if (frec > maxFrec) { maxFrec = frec; ancho = n; }
  }
  if (!ancho) {
    throw new Error('No se pudo determinar la estructura de columnas del Tabulado.');
  }

  // Headers: todos los <th> del archivo, cortados al ancho real de los datos.
  // Lo que sobra es la segunda fila de encabezado ("Imp" repetido).
  const th = [];
  for (const fila of filas) th.push(...celdas(fila, 'th'));
  const headers = th.slice(0, ancho);
  if (headers.length < ancho) {
    throw new Error(`El Tabulado tiene ${ancho} columnas de datos pero solo ${headers.length} encabezados. Verificá el archivo.`);
  }

  const rows = [];
  let totalRow = null;
  for (const fila of filas) {
    const tds = celdas(fila, 'td');
    if (tds.length === ancho - 2 && /TOTAL\s+GENERAL/i.test(tds[0] || '')) {
      totalRow = tds;
      continue;
    }
    if (tds.length !== ancho) continue;
    if (!/^\d+$/.test(tds[0] || '')) continue;   // descarta separadores y subtotales
    rows.push(tds);
  }

  return { headers, rows, totalRow, meta: extraerMetadata(html) };
}

/**
 * Saca del encabezado del propio archivo la razón social, el período y la quincena.
 * El texto es del estilo:
 *   "EA: OPmobility C-Power Argentina S.A. | Usuario: … | Periodo: 03/2025 - 03/2025 |
 *    … | Tipo: 2da Quincena c/ sobregiro | …"
 *
 * @param {string} html
 * @returns {{ empresa: string|null, period: string|null, quincena: number|null }}
 */
export function extraerMetadata(html) {
  const texto = decodeEntities(html.slice(0, 8192).replace(/<[^>]*>/g, ' ')).replace(NBSP, ' ');

  const mEmpresa  = texto.match(/EA:\s*([^|]+?)\s*\|/i);
  const mPeriodo  = texto.match(/periodo:?\s*(\d{2})\/(\d{4})/i);
  const mQuincena = texto.match(/tipo:\s*(1ra|1era|2da)\s*quincena/i);

  return {
    empresa:  mEmpresa ? mEmpresa[1].trim() : null,
    // Formato de período de la app: 'AAAA-MM' (ver js/utils/dates.js).
    period:   mPeriodo ? `${mPeriodo[2]}-${mPeriodo[1]}` : null,
    quincena: mQuincena ? (mQuincena[1].toLowerCase().startsWith('1') ? 1 : 2) : null,
  };
}

/**
 * Convierte las filas a objetos con clave = nombre de encabezado, igual que hace
 * `XLSX.utils.sheet_to_json`. Los encabezados repetidos se desambiguan con sufijo
 * (`__2`, `__3`) para no perder columnas.
 *
 * @param {{ headers: string[], rows: string[][] }} parsed
 * @returns {object[]}
 */
export function htmlTabuladoToObjects({ headers, rows }) {
  const claves = [];
  const vistas = new Map();
  for (const h of headers) {
    const base = h || '(sin nombre)';
    const n = (vistas.get(base) || 0) + 1;
    vistas.set(base, n);
    claves.push(n === 1 ? base : `${base}__${n}`);
  }

  return rows.map(celdasFila => {
    const obj = {};
    claves.forEach((clave, i) => {
      const v = celdasFila[i];
      obj[clave] = v === undefined || v === '' ? null : v;
    });
    return obj;
  });
}
