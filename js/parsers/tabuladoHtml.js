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

// Desfasaje de la fila TOTAL GENERAL respecto de las filas de empleado: su
// primera celda tiene colspan=3 (fusiona Legajo+Nombre+CUIL), así que ocupa 2
// celdas menos. Para leer el total de un concepto:
//   totalRow[indiceDelEncabezado - totalRowOffset]
// En la rama de Excel real el offset es 0 — Excel expande el colspan en celdas.
const TOTAL_ROW_OFFSET = 2;

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
 * ¿El archivo es el "cascarón" que genera Excel al guardar como *página web*?
 * Ese formato es un <frameset> que apunta a una carpeta `<nombre>.files/` con
 * los datos reales; el .xls que se sube no tiene ninguna fila. Se detecta para
 * poder explicarlo, porque el error genérico de "0 encabezados" no le dice
 * nada al analista.
 *
 * @param {string} html
 * @returns {boolean}
 */
function esCascaronDeExcel(html) {
  return /<\s*frameset\b/i.test(html) || /x:WorksheetSource/i.test(html);
}

const ERROR_CASCARON =
  'Este archivo es el índice de un Excel guardado como página web y no tiene datos: ' +
  'las filas quedaron en una carpeta aparte (la que termina en ".files") que no se subió. ' +
  'Subí el .xls original que descargaste del sistema de liquidación.';

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
 *   Ese desfasaje se informa en `totalRowOffset` para que quien la consuma no
 *   tenga que repetir el número mágico.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], rows: string[][], totalRow: string[]|null, totalRowOffset: number, meta: object }}
 */
export function parseHtmlTabulado(arrayBuffer) {
  const html = decodeHtmlTabulado(arrayBuffer);

  if (esCascaronDeExcel(html)) throw new Error(ERROR_CASCARON);

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

  // Headers: la PRIMERA fila que trae <th>. Debajo viene una segunda fila de
  // encabezado ("Imp" repetido) que no corresponde a ninguna columna de datos.
  //
  // Antes se aplanaban todos los <th> del archivo y se cortaba en `ancho`. Eso
  // daba el mismo resultado mientras la primera fila midiera exactamente el
  // ancho de los datos, pero si medía distinto (un colspan que cambia, una
  // columna de más) los encabezados se corrían y el reporte salía con números
  // mal SIN tirar ningún error: sólo fallaba si faltaban, no si sobraban.
  // Ahora el ancho de esa fila se valida explícitamente.
  const filaHeaders = filas.find(f => /<th\b/i.test(f));
  if (filaHeaders === undefined) {
    throw new Error('El Tabulado no tiene fila de encabezados (<th>). Verificá que sea el archivo exportado por el sistema de liquidación.');
  }
  const headers = celdas(filaHeaders, 'th');
  if (headers.length !== ancho) {
    throw new Error(
      `El Tabulado tiene ${ancho} columnas de datos pero la fila de encabezados trae ${headers.length}. ` +
      'No se puede saber qué columna es cada concepto. Verificá que el archivo no esté editado.'
    );
  }

  const rows = [];
  let totalRow = null;
  for (const fila of filas) {
    const tds = celdas(fila, 'td');
    if (tds.length === ancho - TOTAL_ROW_OFFSET && /TOTAL\s+GENERAL/i.test(tds[0] || '')) {
      totalRow = tds;
      continue;
    }
    if (tds.length !== ancho) continue;
    if (!/^\d+$/.test(tds[0] || '')) continue;   // descarta separadores y subtotales
    rows.push(tds);
  }

  return { headers, rows, totalRow, totalRowOffset: TOTAL_ROW_OFFSET, meta: extraerMetadata(html) };
}

/**
 * Saca del encabezado del propio archivo la razón social, el período, la quincena
 * y el tipo de liquidación. El texto es del estilo:
 *   "EA: OPmobility C-Power Argentina S.A. | Usuario: … | Liquidacion: Todas |
 *    Periodo: 03/2025 - 03/2025 | … | Tipo: 2da Quincena c/ sobregiro | …"
 *
 * `quincena` es el número derivado (1|2|null) y sirve para ordenar los dos
 * archivos que compara el control de Variaciones. `tipoLiquidacion` es el texto
 * crudo del campo `Tipo:` — se conserva entero ("2da Quincena c/ sobregiro", no
 * sólo "2da") porque es lo que se muestra en pantalla y en el PDF, y porque un
 * tipo que no sabemos clasificar igual tiene que poder mostrarse tal cual.
 *
 * Acepta texto plano además de HTML: la rama de Excel real (`tabuladoControl.js`)
 * le pasa el contenido de la celda de metadata, que ya viene sin tags.
 *
 * @param {string} html
 * @returns {{ empresa: string|null, period: string|null, quincena: number|null,
 *             tipoLiquidacion: string|null, liquidacion: string|null }}
 */
export function extraerMetadata(html) {
  const texto = decodeEntities(html.slice(0, 8192).replace(/<[^>]*>/g, ' ')).replace(NBSP, ' ');

  const mEmpresa     = texto.match(/EA:\s*([^|]+?)\s*\|/i);
  const mPeriodo     = texto.match(/periodo:?\s*(\d{2})\/(\d{4})/i);
  const mTipo        = texto.match(/tipo:\s*([^|]+?)\s*(?:\||$)/i);
  const mLiquidacion = texto.match(/liquidacion:\s*([^|]+?)\s*\|/i);

  const tipoLiquidacion = mTipo ? mTipo[1].trim() : null;
  const mQuincena = tipoLiquidacion
    ? tipoLiquidacion.match(/^\s*(1ra|1era|2da)\s*quincena/i)
    : null;

  return {
    empresa:  mEmpresa ? mEmpresa[1].trim() : null,
    // Formato de período de la app: 'AAAA-MM' (ver js/utils/dates.js).
    period:   mPeriodo ? `${mPeriodo[2]}-${mPeriodo[1]}` : null,
    quincena: mQuincena ? (mQuincena[1].toLowerCase().startsWith('1') ? 1 : 2) : null,
    tipoLiquidacion,
    liquidacion: mLiquidacion ? mLiquidacion[1].trim() : null,
  };
}

const MESES_NOMBRE = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * ¿El nombre del archivo dice lo mismo que declara su contenido?
 *
 * El analista elige qué subir en cada slot mirando el nombre del archivo, y el
 * nombre puede mentir: se renombró, se editó, o se subió el del mes pasado sin
 * darse cuenta. El período real sale siempre del contenido — esto es sólo un
 * aviso para que se note el desfasaje.
 *
 * Es deliberadamente conservador: si el nombre no menciona ningún mes ni
 * quincena, no hay nada que contrastar y devuelve `null`.
 *
 * @param {string} fileName
 * @param {{ period: string|null, quincena: number|null }} meta
 * @returns {string|null} Motivo de la incongruencia, o null si coincide / no se puede saber.
 */
export function nombreCoincideConMetadata(fileName, meta) {
  if (!fileName || !meta) return null;
  const nombre = String(fileName).toLowerCase();

  if (meta.period) {
    const mesReal = MESES_NOMBRE[Number(meta.period.split('-')[1]) - 1];
    const mesEnNombre = MESES_NOMBRE.find(m => nombre.includes(m));
    if (mesEnNombre && mesReal && mesEnNombre !== mesReal) {
      return `el nombre dice "${mesEnNombre}" pero el contenido es de ${mesReal}`;
    }
  }

  if (meta.quincena) {
    const qEnNombre = /\b(1ra|1era)\b/.test(nombre) ? 1 : /\b2da\b/.test(nombre) ? 2 : null;
    if (qEnNombre && qEnNombre !== meta.quincena) {
      return `el nombre sugiere ${qEnNombre}ª quincena pero el contenido declara ${meta.quincena}ª`;
    }
  }

  return null;
}

/**
 * Claves de objeto a partir de los encabezados, desambiguando los repetidos con
 * sufijo (`__2`, `__3`) para no perder columnas. Un Tabulado puede traer dos
 * veces el mismo concepto y las dos columnas tienen que sobrevivir: el mapeo de
 * conceptos las ofrece como opciones distintas.
 *
 * @param {string[]} headers
 * @returns {string[]}
 */
export function clavesUnicas(headers) {
  const claves = [];
  const vistas = new Map();
  for (const h of headers) {
    const base = h || '(sin nombre)';
    const n = (vistas.get(base) || 0) + 1;
    vistas.set(base, n);
    claves.push(n === 1 ? base : `${base}__${n}`);
  }
  return claves;
}

/**
 * Convierte las filas a objetos con clave = nombre de encabezado, igual que hace
 * `XLSX.utils.sheet_to_json`.
 *
 * @param {{ headers: string[], rows: string[][] }} parsed
 * @returns {object[]}
 */
export function htmlTabuladoToObjects({ headers, rows }) {
  const claves = clavesUnicas(headers);

  return rows.map(celdasFila => {
    const obj = {};
    claves.forEach((clave, i) => {
      const v = celdasFila[i];
      obj[clave] = v === undefined || v === '' ? null : v;
    });
    return obj;
  });
}
