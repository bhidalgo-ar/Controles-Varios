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
import { toNum } from '../utils/currency.js';

// Columna → cómo la nombra el export. El primero es el nombre canónico de Axton;
// los alias existen para el mismo reporte exportado con acento o sin él.
const COLUMNS = {
  legajo:      ['Legajo', 'Nro Legajo'],
  centroCosto: ['Centro de Costo', 'Centro de costo'],
  ingreso:     ['Ingreso', 'Fecha Ingreso'],
  nroConcepto: ['Nro', 'Nro Concepto'],
  concepto:    ['Concepto'],
  importe:     ['Importe'],
  // `cantidad` la usa sólo `readTotalesConcepto` (el lector de N2): la
  // Contabilidad Desglosada emite por `ROW_KEYS` y no la incluye, así que
  // sumarla acá no cambia lo que sale de `parseTotalesConcepto`.
  cantidad:    ['Cantidad', 'Cant', 'Cant.'],
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

  // `filasArchivo` lleva el número de fila real de cada fila de datos (el índice
  // del `<tr>`, 1-based), para que un aviso pueda decir "fila 812" y el analista
  // la encuentre. Sin esto, el índice dentro del array ya filtrado no coincide con
  // ninguna fila del archivo y el aviso manda a mirar donde no está.
  const rows = [];
  const filasArchivo = [];
  filas.forEach((fila, i) => {
    if (/<th\b/i.test(fila)) return;
    const tds = celdasConSpans(fila, 'td').map(c => c.texto);
    if (tds.length !== ancho) return;
    rows.push(tds);
    filasArchivo.push(i + 1);
  });

  return { headers, rows, ancho, filasArchivo, meta: extraerMetadata(html), formato: 'html', sheetName: null };
}

/**
 * Lee la tabla del .xlsx real: mismo resultado que la rama HTML.
 *
 * `preferSheet` es la firma del nombre de hoja a buscar primero. Sin ella se lee
 * la primera hoja, que es lo que hace la Contabilidad Desglosada desde que se
 * construyó: el default no cambia.
 */
function leerTablaXlsx(arrayBuffer, { preferSheet = null } = {}) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const nombre = (preferSheet && wb.SheetNames.find(n => preferSheet.test(n))) || wb.SheetNames[0];
  const ws = wb.Sheets[nombre];
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
  const rows = [];
  const filasArchivo = [];
  aoa.slice(primeraDatos).forEach((f, i) => {
    if (!Array.isArray(f)) return;
    rows.push(Array.from({ length: ancho }, (_, c) => (f[c] === null || f[c] === undefined ? '' : f[c])));
    filasArchivo.push(primeraDatos + i + 1);
  });

  // El preámbulo del reporte ("EA: … | Periodo: 05/2026 …") vive en las filas de
  // arriba del encabezado: se junta todo y se lee igual que en la rama HTML.
  const preambulo = aoa.slice(0, idxLegajo).flat().filter(Boolean).join(' | ');

  return { headers, rows, ancho, filasArchivo, meta: extraerMetadata(preambulo), formato: 'xlsx', sheetName: nombre };
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
 * La misma vista previa, pero mirando la MISMA hoja que va a leer
 * `readTotalesConcepto`: la que matchea `totalesconcepto.*`, no la primera del
 * libro. Con un libro de varias hojas, el `detectHeaders` de arriba lee la
 * primera y eso rompe de dos maneras — si esa hoja no tiene columna "Legajo" la
 * carga corta con un error y el analista no puede subir un archivo que el lector
 * lee perfecto; y si la tiene, la pantalla de confirmación le muestra los
 * encabezados de otra hoja, que es justo lo único que esa pantalla existe para
 * confirmar.
 *
 * `detectHeaders` queda como está: lo usa la ficha de la Contabilidad
 * Desglosada, cuyo parser también lee la primera hoja.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], preview: Array<Array<string>> }}
 */
export function detectHeadersCruce(arrayBuffer) {
  const { headers, rows } = isHtmlTabulado(arrayBuffer)
    ? leerTablaHtml(arrayBuffer)
    : leerTablaXlsx(arrayBuffer, { preferSheet: HOJA_TOTALES_CONCEPTO_RE });
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

// ── El totalizador como fuente complementaria del cruce (N0b / N2) ───────────

/** Firma del nombre de hoja del reporte: `totalesconcepto.20260731.101122.3`. */
export const HOJA_TOTALES_CONCEPTO_RE = /^totalesconcepto/i;

// Lo mínimo para poder cruzar por legajo + código: quién, qué concepto y cuánto.
// **Las dos cuentas contables NO están acá** a propósito: el export que se baja
// para el cruce de novedades puede venir sin ellas, y exigirlas rechazaría un
// archivo que sirve perfectamente para lo que N2 necesita. La Contabilidad
// Desglosada sigue exigiéndolas por su cuenta (`REQUIRED`), porque ahí el
// movimiento contable *es* el entregable.
const REQUIRED_CRUCE = ['legajo', 'nroConcepto', 'importe'];

/**
 * Lee el reporte "Totales de Concepto" como **fuente complementaria del cruce**.
 *
 * Existe porque **el Tabulado no trae todos los conceptos liquidados**, verificado
 * contra archivos reales de julio 2026 (`specs/familia-novedades-axton.md`): en Red
 * Bull un concepto de $200.000,94 está sumado dentro de la columna Exento sin
 * columna propia; en Epiroc dos códigos y en SIASA siete aparecen sólo en el
 * totalizador. Sin este lector, el control N2 no puede distinguir "no se liquidó"
 * de "el Tabulado no lo muestra", y las dos cosas se verían iguales.
 *
 * Comparte con `parseTotalesConcepto` la lectura de la tabla (las dos ramas, HTML
 * y .xlsx real) y se diferencia sólo en qué columnas exige y qué devuelve: acá la
 * unidad es **legajo × concepto × liquidación** con su cantidad y su importe, sin
 * las cuentas contables.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 *   Cada fila: `{ legajo, codigo, concepto, cantidad, importe, liquidacion,
 *   centroCosto, fila }`. El legajo viaja **crudo** (agrupar es del control, con
 *   `makeLegajoKey`); `cantidad` e `importe` son `null` cuando la celda vino vacía
 *   —`null` no es `0`— y la clave `cantidad` **no existe** si el reporte no trae
 *   la columna, para que nadie la confunda con un cero (D-065).
 * @throws {Error} con mensaje en español si el archivo no tiene la forma esperada
 */
export function readTotalesConcepto(arrayBuffer) {
  const { headers, rows, ancho, filasArchivo, meta, formato, sheetName } = isHtmlTabulado(arrayBuffer)
    ? leerTablaHtml(arrayBuffer)
    : leerTablaXlsx(arrayBuffer, { preferSheet: HOJA_TOTALES_CONCEPTO_RE });

  const idx = {};
  for (const [col, nombres] of Object.entries(COLUMNS)) {
    for (const nombre of nombres) {
      const i = headers.findIndex(h => normHeader(h) === normHeader(nombre));
      if (i >= 0) { idx[col] = i; break; }
    }
  }

  const faltantes = REQUIRED_CRUCE.filter(col => idx[col] === undefined);
  if (faltantes.length) {
    throw new Error(
      `Al reporte "Totales de Concepto" le faltan columnas que el cruce necesita: `
      + `${faltantes.map(col => `"${COLUMNS[col][0]}"`).join(', ')}. `
      + `El archivo trae ${headers.length} columnas (${headers.slice(0, 8).map(h => h || '(sin nombre)').join(', ')}…). `
      + 'Verificá que sea el reporte del período exportado por Axton.'
    );
  }

  // El encabezado tiene que medir lo mismo que las filas: si mide distinto, no hay
  // forma de saber qué columna es cada cosa y el importe sale de la columna de al
  // lado — un número coherente y mal, que no detecta nadie (CLAUDE.md).
  if (headers.length !== ancho) {
    throw new Error(
      `El reporte tiene ${ancho} columnas de datos pero su encabezado describe ${headers.length}. `
      + 'No se puede saber qué columna es cada una. Verificá que el archivo no esté editado.'
    );
  }

  const avisos = [];
  const parsedRows = [];
  const legajos = new Set();
  const rotulosPorCodigo = new Map();
  const liquidaciones = new Set();
  const filasIgnoradas = [];
  const filasSinCodigo = [];

  rows.forEach((celdas, i) => {
    const nroFila = filasArchivo[i];
    const legajo = String(celdas[idx.legajo] ?? '').replace(/\u00a0/g, ' ').trim();
    // Una fila sin legajo, o una de totales del propio export, no es un
    // movimiento: se cuenta y se informa, nunca se descarta en silencio.
    if (!legajo || /^total/i.test(legajo)) { filasIgnoradas.push(nroFila); return; }

    const codigo = String(celdas[idx.nroConcepto] ?? '').replace(/\u00a0/g, ' ').trim();
    const concepto = idx.concepto === undefined ? null
      : String(celdas[idx.concepto] ?? '').replace(/\u00a0/g, ' ').trim() || null;
    // Sin código no se puede cruzar: el rótulo no identifica nada (17 códigos con
    // rótulo distinto entre dos archivos del mismo cliente y mes — D-039/D-070).
    if (!codigo) { filasSinCodigo.push(nroFila); return; }

    const row = {
      legajo, codigo, concepto,
      importe: toNum(celdas[idx.importe]),
      liquidacion: idx.liquidacion === undefined ? null : (celdas[idx.liquidacion] ?? null),
      centroCosto: idx.centroCosto === undefined ? null : (celdas[idx.centroCosto] ?? null),
      fila: nroFila,
    };
    // La clave `cantidad` sólo existe si el reporte trae la columna: así el
    // control distingue "no está en el archivo" de "vino vacía" (D-065).
    if (idx.cantidad !== undefined) row.cantidad = toNum(celdas[idx.cantidad]);

    parsedRows.push(row);
    legajos.add(legajoKey(legajo));
    if (row.liquidacion) liquidaciones.add(String(row.liquidacion).trim());
    if (!rotulosPorCodigo.has(codigo)) rotulosPorCodigo.set(codigo, new Set());
    if (concepto) rotulosPorCodigo.get(codigo).add(concepto);
  });

  if (parsedRows.length === 0) {
    throw new Error(
      'El reporte "Totales de Concepto" no trae ninguna fila con legajo y código de concepto, así que no hay '
      + 'nada que cruzar. Verificá que sea el reporte del período y que se haya descargado completo.'
    );
  }

  if (idx.cantidad === undefined) {
    avisos.push(
      'El reporte no trae columna "Cantidad": del totalizador sólo se pueden comparar importes. '
      + 'Las cantidades no se deducen del importe.'
    );
  }
  if (filasSinCodigo.length > 0) {
    avisos.push(
      `${filasSinCodigo.length} ${filasSinCodigo.length === 1 ? 'fila no tiene' : 'filas no tienen'} `
      + `número de concepto y no se leyeron (fila ${filasSinCodigo.slice(0, 5).join(', ')}`
      + `${filasSinCodigo.length > 5 ? ', …' : ''}). Sin código no se puede cruzar contra el Tabulado.`
    );
  }
  // Un código puede colapsar varios conceptos reales: en SIASA `605130` son 10
  // obras sociales y `2250` tiene 4 rótulos. No es un error del archivo, pero el
  // analista tiene que saberlo antes de leer una diferencia por concepto.
  const codigosConVariosRotulos = [...rotulosPorCodigo.entries()]
    .filter(([, rotulos]) => rotulos.size > 1)
    .map(([codigo, rotulos]) => ({ codigo, rotulos: [...rotulos] }));
  if (codigosConVariosRotulos.length > 0) {
    avisos.push(
      `${codigosConVariosRotulos.length} ${codigosConVariosRotulos.length === 1 ? 'código agrupa' : 'códigos agrupan'} `
      + 'más de un concepto en el totalizador: '
      + codigosConVariosRotulos.slice(0, 5).map(c => `${c.codigo} (${c.rotulos.length} rótulos)`).join(', ')
      + `${codigosConVariosRotulos.length > 5 ? ', …' : ''}. El cruce los compara juntos, por código.`
    );
  }

  return {
    parsedRows,
    parseMetadata: {
      formato,
      sheetName,
      totalRows:     parsedRows.length,
      uniqueLegajos: legajos.size,
      cantidadDisponible: idx.cantidad !== undefined,
      conceptos: [...rotulosPorCodigo.keys()],
      codigosConVariosRotulos,
      liquidaciones: [...liquidaciones],
      periodo:      meta?.period || null,
      empresa:      meta?.empresa || null,
      filasIgnoradas,
      filasSinCodigo,
      headers,
      avisos,
      parsedAt: new Date().toISOString(),
    },
  };
}
