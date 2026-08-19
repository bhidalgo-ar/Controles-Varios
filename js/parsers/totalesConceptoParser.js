// totalesConceptoParser.js — Tabulado "Totales de Concepto" de Axton (formato largo)
//
// NO es ninguno de los dos Tabulados que ya lee el repo:
//   · `tabuladoControl.js` lee el Tabulado de Meta4 — una columna por concepto.
//   · `tabAxtonParser.js`  lee el Tabulado de Axton  — un par Cant/Imp por concepto.
//   · éste lee el reporte "Totales de Concepto" de Axton, que es **largo**: una
//     fila por legajo × concepto × liquidación, y las cuentas contables del
//     concepto en dos columnas (Cuenta Debe / Cuenta Haber).
//
// Es el archivo de origen de la Contabilidad Desglosada (ver
// `js/controls/contaDesglosada.js`). Baja en dos formatos y los dos se aceptan:
//   · **.xls que es HTML** (el caso normal: un export de ~23 MB con extensión
//     .xls y una <table> adentro);
//   · **.xlsx real**, cuando el analista lo vuelve a guardar desde Excel.
//
// **Todo sale por nombre de encabezado, nada por posición.** El prototipo del
// que viene este control leía por índice fijo (Legajo=0, Importe=25, AF=31…) y
// ya había tenido que parchear la fecha de ingreso, que en un export cae en la
// columna 14 y en otro en la 15. Con los encabezados —que el archivo trae
// siempre— ese problema no existe: si Axton agrega una columna, las demás se
// siguen encontrando solas.
//
// El encabezado viene en **dos filas**: la de arriba tiene las columnas de
// ficha con `rowspan=2` y una celda con `colspan=6` para el período, y la de
// abajo los seis subencabezados de ese grupo (Cantidad / Importe / Cant.
// Facturable / Imp. Facturable / Dif. Cant. / Dif. Imp.). Aplanar las dos es
// justamente lo que `tabuladoHtml.js` no hace —corta en la primera fila de
// <th>—, y de ahí que este parser lea la tabla por su cuenta en vez de
// reusar `parseHtmlTabulado`.

/* global XLSX */
import { isHtmlTabulado, decodeHtmlTabulado, extraerMetadata } from './tabuladoHtml.js';
import { legajoKey } from '../utils/legajo.js';

// Columna → cómo la nombra el export. El primero es el nombre canónico de Axton;
// los alias existen para el mismo reporte exportado con acento o sin él.
const COLUMNS = {
  legajo:      ['Legajo', 'Nro Legajo'],
  centroCosto: ['Centro de Costo', 'Centro de costo'],
  ingreso:     ['Ingreso', 'Fecha Ingreso'],
  nroConcepto: ['Nro', 'Nro Concepto'],
  concepto:    ['Concepto'],
  importe:     ['Importe'],
  cuentaDebe:  ['Cuenta Debe'],
  cuentaHaber: ['Cuenta Haber'],
  liquidacion: ['Liquidacion', 'Liquidación'],
};

// Columna → clave de la fila que sale del parser.
const ROW_KEYS = {
  legajo:      'legajo',
  centroCosto: 'centro_costo',
  ingreso:     'ingreso',
  nroConcepto: 'nro_concepto',
  concepto:    'concepto',
  importe:     'importe',
  cuentaDebe:  'cuenta_debe',
  cuentaHaber: 'cuenta_haber',
  liquidacion: 'liquidacion',
};

// Sin estas seis no hay desglosada posible: el importe y las dos cuentas SON el
// movimiento contable, y el legajo, el número y el nombre del concepto son lo
// que hace auditable cada línea. Lo demás (centro de costo, ingreso,
// liquidación) sale como aviso y lo informa el control (D-036).
const REQUIRED = ['legajo', 'nroConcepto', 'concepto', 'importe', 'cuentaDebe', 'cuentaHaber'];

// Mínimo de celdas para que una fila pueda ser de datos: el umbral sólo descarta
// filas de relleno del export. Es bajo a propósito — qué columnas hacen falta se
// valida después **por nombre**, así que un umbral alto no agregaría seguridad y
// sí rechazaría un reporte angosto (uno exportado con menos columnas) con el
// error equivocado: "no se pudo determinar la estructura" en vez de "falta la
// columna Cuenta Haber".
const MIN_DATA_CELLS = 4;

/** Normaliza un encabezado para compararlo: sin acentos, sin espacios duros, en minúscula. */
function normHeader(h) {
  return String(h ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function textoDeCelda(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\u00a0/g, ' ').trim();
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Celdas de una fila HTML, con sus colspan/rowspan (que es lo que hay que aplanar). */
function celdasConSpans(filaHtml, tag) {
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}\\s*>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(filaHtml)) !== null) {
    const attrs = m[1] || '';
    const num = (nombre) => {
      const a = attrs.match(new RegExp(`${nombre}\\s*=\\s*['"]?(\\d+)`, 'i'));
      return a ? Number(a[1]) : 1;
    };
    out.push({ texto: textoDeCelda(m[2]), colspan: num('colspan'), rowspan: num('rowspan') });
  }
  return out;
}

/**
 * Aplana las dos filas de encabezado a una lista de nombres, una por columna de
 * datos. Una celda con `colspan` consume tantos subencabezados de la fila de
 * abajo; una con `rowspan >= 2` se nombra sola.
 *
 * @param {{texto:string,colspan:number,rowspan:number}[]} fila1
 * @param {{texto:string}[]} fila2  subencabezados (puede venir vacía)
 * @returns {string[]}
 */
function aplanarEncabezados(fila1, fila2) {
  const subs = [...fila2];
  const headers = [];
  for (const celda of fila1) {
    if (celda.colspan > 1) {
      // Grupo de columnas: cada una se llama como su subencabezado. Si la fila de
      // abajo no alcanza, la columna queda con el nombre del grupo más su número,
      // que es peor pero no miente sobre cuál es.
      for (let i = 0; i < celda.colspan; i++) {
        const sub = subs.shift();
        headers.push(sub && sub.texto ? sub.texto : `${celda.texto} ${i + 1}`);
      }
    } else if (celda.rowspan >= 2 || subs.length === 0) {
      headers.push(celda.texto);
    } else {
      const sub = subs.shift();
      headers.push(sub && sub.texto ? sub.texto : celda.texto);
    }
  }
  return headers;
}

/** Lee la tabla del export HTML: encabezados aplanados + filas de celdas. */
function leerTablaHtml(arrayBuffer) {
  const html = decodeHtmlTabulado(arrayBuffer);

  const filas = [];
  const reTr = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  let m;
  while ((m = reTr.exec(html)) !== null) filas.push(m[1]);

  if (filas.length === 0) {
    throw new Error(
      'El archivo no tiene ninguna fila de tabla. Verificá que sea el reporte "Totales de Concepto" '
      + 'que se baja de Axton, y que se haya descargado completo.'
    );
  }

  // Ancho real de una fila de datos = la cantidad de celdas más frecuente. Se
  // deduce de las filas y no de los encabezados: es lo que permite después
  // validar que el encabezado aplanado mida exactamente lo mismo.
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
    throw new Error('No se pudo determinar la estructura de columnas del reporte "Totales de Concepto".');
  }

  const filasTh = filas.filter(f => /<th\b/i.test(f));
  if (filasTh.length === 0) {
    throw new Error(
      'El reporte no tiene fila de encabezados. Verificá que sea el archivo exportado por Axton '
      + 'y que no se haya editado.'
    );
  }
  const headers = aplanarEncabezados(
    celdasConSpans(filasTh[0], 'th'),
    filasTh[1] ? celdasConSpans(filasTh[1], 'th') : []
  );

  const rows = [];
  for (const fila of filas) {
    if (/<th\b/i.test(fila)) continue;
    const tds = celdasConSpans(fila, 'td').map(c => c.texto);
    if (tds.length !== ancho) continue;
    rows.push(tds);
  }

  return { headers, rows, ancho, meta: extraerMetadata(html), formato: 'html' };
}

/** Lee la tabla del .xlsx real: mismo resultado que la rama HTML. */
function leerTablaXlsx(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El archivo no tiene ninguna hoja para leer.');

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null, blankrows: true });

  const idxLegajo = aoa.findIndex(fila =>
    Array.isArray(fila) && fila.some(c => COLUMNS.legajo.some(n => normHeader(c) === normHeader(n)))
  );
  if (idxLegajo === -1) {
    throw new Error(
      'No se encontró la fila de encabezados: ninguna fila tiene una columna "Legajo". '
      + 'Verificá que sea el reporte "Totales de Concepto" de Axton.'
    );
  }

  const ancho = Math.max(...aoa.map(f => (Array.isArray(f) ? f.length : 0)));
  const filaTitulos = aoa[idxLegajo] || [];
  // La fila de abajo es de subencabezados —y no la primera de datos— sólo si su
  // celda de Legajo está vacía: en una fila de datos el legajo siempre viene, y
  // en el encabezado esa celda está combinada con la de arriba.
  const posibleSub = aoa[idxLegajo + 1] || [];
  const colLegajo = filaTitulos.findIndex(c => COLUMNS.legajo.some(n => normHeader(c) === normHeader(n)));
  const haySubfila = !String(posibleSub[colLegajo] ?? '').trim();
  const subfila = haySubfila ? posibleSub : [];

  const headers = [];
  for (let c = 0; c < ancho; c++) {
    // El subencabezado gana cuando existe: en un grupo con celdas combinadas la
    // fila de arriba trae el nombre del grupo ("05/2026") sólo en la primera
    // columna, y el nombre real de cada columna está abajo.
    const sub = String(subfila[c] ?? '').trim();
    headers.push(sub || String(filaTitulos[c] ?? '').trim());
  }

  const primeraDatos = idxLegajo + (haySubfila ? 2 : 1);
  const rows = aoa.slice(primeraDatos)
    .filter(f => Array.isArray(f))
    .map(f => Array.from({ length: ancho }, (_, c) => (f[c] === null || f[c] === undefined ? '' : f[c])));

  // El preámbulo del reporte ("EA: … | Periodo: 05/2026 …") vive en las filas de
  // arriba del encabezado: se junta todo y se lee igual que en la rama HTML.
  const preambulo = aoa.slice(0, idxLegajo).flat().filter(Boolean).join(' | ');

  return { headers, rows, ancho, meta: extraerMetadata(preambulo), formato: 'xlsx' };
}

/**
 * Encabezados y muestra para la pantalla de confirmación del archivo.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], preview: Array<Array<string>> }}
 */
export function detectHeaders(arrayBuffer) {
  const { headers, rows } = isHtmlTabulado(arrayBuffer) ? leerTablaHtml(arrayBuffer) : leerTablaXlsx(arrayBuffer);
  return { headers, preview: rows.slice(0, 3) };
}

/**
 * Parsea el reporte "Totales de Concepto".
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 */
export function parseTotalesConcepto(arrayBuffer) {
  const { headers, rows, ancho, meta, formato } = isHtmlTabulado(arrayBuffer)
    ? leerTablaHtml(arrayBuffer)
    : leerTablaXlsx(arrayBuffer);

  // Columna → índice, por nombre de encabezado. Se resuelve una vez.
  const idx = {};
  for (const [col, nombres] of Object.entries(COLUMNS)) {
    for (const nombre of nombres) {
      const i = headers.findIndex(h => normHeader(h) === normHeader(nombre));
      if (i >= 0) { idx[col] = i; break; }
    }
  }

  const faltantes = REQUIRED.filter(col => idx[col] === undefined);
  if (faltantes.length) {
    const esperadas = faltantes.map(col => `"${COLUMNS[col][0]}"`).join(', ');
    throw new Error(
      `Al reporte le faltan columnas que la Contabilidad Desglosada necesita: ${esperadas}. `
      + `El archivo trae ${headers.length} columnas (${headers.slice(0, 8).map(h => h || '(sin nombre)').join(', ')}…). `
      + 'Verificá que sea el reporte "Totales de Concepto" de Axton, con las columnas contables incluidas.'
    );
  }

  // El encabezado tiene que medir lo mismo que las filas: si mide distinto, no
  // hay forma de saber qué columna es cada cosa, y las cuentas contables —que
  // están al final— son justo las que se corren. Antes de esta validación un
  // archivo así salía con números coherentes y mal.
  if (headers.length !== ancho) {
    throw new Error(
      `El reporte tiene ${ancho} columnas de datos pero su encabezado describe ${headers.length}. `
      + 'No se puede saber qué columna es cada una. Verificá que el archivo no esté editado.'
    );
  }

  const opcionalesFaltantes = ['centroCosto', 'ingreso', 'liquidacion']
    .filter(col => idx[col] === undefined)
    .map(col => COLUMNS[col][0]);

  const parsedRows = [];
  const legajos = new Set();
  let filasIgnoradas = 0;

  for (const celdas of rows) {
    const legajo = String(celdas[idx.legajo] ?? '').trim();
    // Una fila sin legajo, o una de totales del propio export, no es un
    // movimiento: se cuenta y se informa, nunca se descarta en silencio.
    if (!legajo || /^total/i.test(legajo)) { filasIgnoradas++; continue; }

    const row = {};
    for (const [col, key] of Object.entries(ROW_KEYS)) {
      row[key] = idx[col] === undefined ? null : (celdas[idx[col]] ?? null);
    }
    row.legajo = legajo;
    parsedRows.push(row);
    legajos.add(legajoKey(legajo));
  }

  if (parsedRows.length === 0) {
    throw new Error(
      'El reporte no trae ninguna fila con legajo, así que no hay movimientos para desglosar. '
      + 'Verificá que sea el "Totales de Concepto" del período y que se haya descargado completo.'
    );
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows:     parsedRows.length,
      uniqueLegajos: legajos.size,
      formato,
      periodo:        meta?.period || null,
      periodoTexto:   meta?.period ? `${meta.period.split('-')[1]}/${meta.period.split('-')[0]}` : null,
      empresa:        meta?.empresa || null,
      liquidacion:    meta?.liquidacion || null,
      filasIgnoradas,
      opcionalesFaltantes,
      headers,
    },
  };
}
