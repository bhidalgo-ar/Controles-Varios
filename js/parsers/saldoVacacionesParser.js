// saldoVacacionesParser.js — Los dos archivos de Axton del "Saldo de vacaciones" (COTY)
//
//   · **Vacaciones** — el reporte de vacaciones: una fila por legajo con el
//     ingreso, el egreso, los días que corresponden y los gozados.
//   · **Liquidaciones** — los totales por concepto de la liquidación: un par
//     Cant/Imp por concepto, una fila por legajo × liquidación, y una fila
//     "TOTAL GENERAL" (arriba, y en el .xlsx también al final).
//
// Los dos bajan de Axton como **.xls que por dentro es una tabla HTML** (latin-1)
// y el segundo a veces como .xlsx real (septiembre de 2026): se aceptan los dos
// formatos. Las dos ramas terminan en la misma grilla de celdas (`aoa`) y todo lo
// demás —encabezados, filas de datos, TOTAL GENERAL— se lee una sola vez sobre
// esa grilla, así que HTML y .xlsx no pueden divergir.
//
// **Todo sale por nombre de encabezado, nada por posición.** Y el encabezado de
// Liquidaciones viene en dos filas con `colspan`/`rowspan` (el concepto ocupa dos
// columnas, "Cant" e "Imp"): la grilla los expande, como hace la tabla de verdad.
// La fila TOTAL GENERAL del HTML también trae un `colspan` (fusiona Legajo,
// Nombre y CUIL), que se expande igual — sin eso sus importes quedan corridos
// dos columnas.
//
// Las columnas de concepto **no se interpretan acá**: el parser devuelve todas
// las que trae el archivo, con su encabezado completo ("800172 - Provision
// Vacaciones"). Cuál es el de la provisión y cuál el de la baja lo decide el
// control por código (D-035/D-039); así una renumeración del cliente no toca
// este archivo.

/* global XLSX */
import { isHtmlTabulado, decodeHtmlTabulado, textoDeCelda } from './tabuladoHtml.js';
import { legajoKey } from '../utils/legajo.js';
import { toNum } from '../utils/currency.js';

/** Encabezado sin acentos ni espacios duros, en minúscula: para compararlo. */
function normHeader(h) {
  return String(h ?? '')
    .replace(/ /g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** El texto de una celda de la grilla, venga de HTML (string) o de .xlsx (número). */
function texto(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/ /g, ' ').trim();
}

// ── La grilla: de HTML y de .xlsx al mismo arreglo de filas ──────────────────

/**
 * Tabla HTML → grilla rectangular, con `colspan` y `rowspan` expandidos (la celda
 * combinada repite su texto en todas las posiciones que ocupa).
 */
function htmlAGrilla(arrayBuffer) {
  const html = decodeHtmlTabulado(arrayBuffer);
  const filas = [];
  const reTr = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  let m;
  while ((m = reTr.exec(html)) !== null) filas.push(m[1]);
  if (filas.length === 0) {
    throw new Error(
      'El archivo no tiene ninguna fila de tabla. Verificá que sea el reporte que se baja de Axton '
      + 'y que se haya descargado completo.'
    );
  }

  const grilla = [];
  const ocupado = [];   // ocupado[r][c] = true si un rowspan de arriba ya tomó esa posición
  filas.forEach((filaHtml, r) => {
    grilla[r] = grilla[r] || [];
    ocupado[r] = ocupado[r] || [];
    let c = 0;
    const reCelda = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
    let mc;
    while ((mc = reCelda.exec(filaHtml)) !== null) {
      while (ocupado[r][c]) c++;
      const span = (nombre) => {
        const a = mc[2].match(new RegExp(`${nombre}\\s*=\\s*['"]?(\\d+)`, 'i'));
        return a ? Math.max(1, Number(a[1])) : 1;
      };
      const colspan = span('colspan');
      const rowspan = span('rowspan');
      const valor = textoDeCelda(mc[3]);
      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          grilla[r + dr] = grilla[r + dr] || [];
          ocupado[r + dr] = ocupado[r + dr] || [];
          grilla[r + dr][c + dc] = valor;
          ocupado[r + dr][c + dc] = true;
        }
      }
      c += colspan;
    }
  });
  return grilla.map(f => Array.from(f || [], v => (v === undefined ? '' : v)));
}

/**
 * .xlsx real → la misma grilla. Las celdas combinadas se expanden (SheetJS deja
 * el valor sólo en la esquina). Los números quedan como números y las fechas
 * como serie, sin formatear: es el parser quien decide qué hacer con cada una.
 */
function xlsxAGrilla(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El archivo no tiene ninguna hoja para leer.');

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
  const rango = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 } };
  for (const mg of (ws['!merges'] || [])) {
    const valor = aoa[mg.s.r - rango.s.r]?.[mg.s.c - rango.s.c];
    if (valor === null || valor === undefined) continue;
    for (let r = mg.s.r; r <= mg.e.r; r++) {
      for (let c = mg.s.c; c <= mg.e.c; c++) {
        const fila = aoa[r - rango.s.r];
        if (fila) fila[c - rango.s.c] = valor;
      }
    }
  }
  return aoa.map(f => (Array.isArray(f) ? f : []));
}

function leerGrilla(arrayBuffer) {
  return isHtmlTabulado(arrayBuffer)
    ? { grilla: htmlAGrilla(arrayBuffer), formato: 'html' }
    : { grilla: xlsxAGrilla(arrayBuffer), formato: 'xlsx' };
}

/** La fila de encabezados: la primera que tiene una celda "Legajo". */
function filaDeEncabezados(grilla, queArchivo) {
  const idx = grilla.findIndex(f => f.some(c => normHeader(c) === 'legajo'));
  if (idx === -1) {
    throw new Error(
      `No se encontró la fila de encabezados del ${queArchivo}: se esperaba una columna "Legajo" y `
      + 'ninguna fila la tiene. Verificá que sea el reporte que se baja de Axton y que no esté editado.'
    );
  }
  return idx;
}

const listar = (cabeceras) => cabeceras.filter(h => texto(h) !== '').map(h => `"${texto(h)}"`).join(', ') || '(ninguno)';

// ── Fechas e importes ────────────────────────────────────────────────────────

/** Una fecha de Axton siempre sale como 'dd/mm/aaaa' (también la serie de un .xlsx). */
function fechaATexto(v) {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  }
  return texto(v);
}

/**
 * Un número que tiene que ser número. Vacío es `null` (no hay dato), pero un
 * texto que no se puede leer corta: devolver `null` ahí sería perder el dato en
 * silencio.
 */
function numeroObligatorio(v, cual, fila) {
  const t = texto(v);
  if (t === '') return null;
  const n = toNum(v);
  if (n === null) {
    throw new Error(`No se pudo leer el número "${t}" de la columna ${cual} (fila ${fila} del archivo).`);
  }
  return n;
}

// ── Vacaciones ───────────────────────────────────────────────────────────────

/** Columnas del reporte de Vacaciones que se leen, por nombre de encabezado. */
const VAC_COLUMNAS = {
  legajo:  { titulo: 'Legajo',            nombres: ['legajo'] },
  nombre:  { titulo: 'Apellido y Nombre', nombres: ['apellido y nombre'] },
  ingreso: { titulo: 'Ingreso',           nombres: ['ingreso'] },
  egreso:  { titulo: 'Egreso',            nombres: ['egreso'] },
  // "Dias" está dos veces en el export (los días que corresponden y, más a la
  // derecha, los del período): se usa la PRIMERA.
  dias:    { titulo: 'Dias',              nombres: ['dias'] },
  gozados: { titulo: 'Gozados',           nombres: ['gozados'] },
};

function leerVacaciones(arrayBuffer) {
  const { grilla, formato } = leerGrilla(arrayBuffer);
  const idxEnc = filaDeEncabezados(grilla, 'reporte de Vacaciones');
  const encabezados = grilla[idxEnc];

  const col = {};
  for (const [clave, def] of Object.entries(VAC_COLUMNAS)) {
    const i = encabezados.findIndex(h => def.nombres.includes(normHeader(h)));
    if (i >= 0) col[clave] = i;
  }
  const faltan = Object.entries(VAC_COLUMNAS).filter(([k]) => col[k] === undefined).map(([, d]) => `"${d.titulo}"`);
  if (faltan.length) {
    throw new Error(
      `Al reporte de Vacaciones le faltan columnas: se esperaba ${faltan.join(', ')} y el archivo trae `
      + `${listar(encabezados)}. Verificá que sea el reporte de vacaciones de Axton.`
    );
  }

  const parsedRows = [];
  const claves = new Set();
  let filasIgnoradas = 0;
  grilla.slice(idxEnc + 1).forEach((celdas, i) => {
    const nroFila = idxEnc + 2 + i;
    const legajo = texto(celdas[col.legajo]);
    if (!legajo || /^total/i.test(legajo)) { filasIgnoradas++; return; }
    if (formato === 'html' && celdas.length !== encabezados.length) {
      throw new Error(
        `La fila ${nroFila} del reporte de Vacaciones tiene ${celdas.length} columnas y el encabezado `
        + `${encabezados.length}: no se puede saber qué columna es cada una. Verificá que el archivo no esté editado.`
      );
    }
    parsedRows.push({
      legajo,
      nombre:  texto(celdas[col.nombre]),
      ingreso: fechaATexto(celdas[col.ingreso]),
      egreso:  fechaATexto(celdas[col.egreso]),
      dias:    numeroObligatorio(celdas[col.dias], 'Dias', nroFila),
      gozados: numeroObligatorio(celdas[col.gozados], 'Gozados', nroFila),
      fila: nroFila,
    });
    claves.add(legajoKey(legajo));
  });

  if (parsedRows.length === 0) {
    throw new Error(
      'El reporte de Vacaciones no trae ninguna fila con legajo. Verificá que sea el reporte del período '
      + 'y que se haya descargado completo.'
    );
  }

  return { parsedRows, encabezados, formato, filasIgnoradas, legajos: claves.size };
}

export function parseVacaciones(arrayBuffer) {
  const r = leerVacaciones(arrayBuffer);
  return {
    parsedRows: r.parsedRows,
    parseMetadata: {
      totalRows: r.parsedRows.length,
      uniqueLegajos: r.legajos,
      formato: r.formato,
      filasIgnoradas: r.filasIgnoradas,
    },
  };
}

export function detectHeadersVacaciones(arrayBuffer) {
  const r = leerVacaciones(arrayBuffer);
  return {
    headers: r.encabezados.map(texto),
    preview: r.parsedRows.slice(0, 3).map(f => [f.legajo, f.nombre, f.ingreso, f.egreso, f.dias, f.gozados]),
  };
}

// ── Liquidaciones ────────────────────────────────────────────────────────────

/**
 * El período que declara el texto de la columna `liquidacion`: el "MM-AAAA" del
 * paréntesis, p. ej. "x Provisiones Septiembre 2026 (Provisiones 09-2026)  - (v)"
 * → '2026-09'. `null` si no hay (o el mes no existe): no se adivina por el
 * nombre del mes ni por la fecha de la fila.
 */
export function periodoDeLiquidacion(textoLiquidacion) {
  const m = /\(\s*[^()]*?(\d{2})-(\d{4})\s*\)/.exec(String(textoLiquidacion ?? ''));
  if (!m) return null;
  const mes = Number(m[1]);
  return mes >= 1 && mes <= 12 ? `${m[2]}-${m[1]}` : null;
}

function leerLiquidaciones(arrayBuffer) {
  const { grilla, formato } = leerGrilla(arrayBuffer);
  const idxEnc = filaDeEncabezados(grilla, 'reporte de Liquidaciones');
  const enc = grilla[idxEnc];
  const sub = grilla[idxEnc + 1] || [];

  const colLegajo = enc.findIndex(h => normHeader(h) === 'legajo');
  const colNombre = enc.findIndex(h => normHeader(h) === 'apellido y nombre');
  const colLiq    = enc.findIndex(h => normHeader(h) === 'liquidacion');

  // Cada concepto ocupa dos columnas: "Cant" e "Imp" en la fila de abajo. El
  // "TOTAL -" del final es la suma de todos y no es un concepto.
  const conceptos = [];
  for (let c = 0; c < enc.length - 1; c++) {
    if (normHeader(sub[c]) === 'cant' && normHeader(sub[c + 1]) === 'imp'
        && !/^total\b/.test(normHeader(enc[c]))) {
      const header = texto(enc[c]);
      if (conceptos.some(k => k.header === header)) {
        throw new Error(`El concepto "${header}" aparece dos veces en los encabezados de Liquidaciones: no se sabe cuál usar.`);
      }
      conceptos.push({ header, colCant: c, colImp: c + 1 });
    }
  }

  const faltan = [];
  if (colLegajo < 0) faltan.push('"Legajo"');
  if (colNombre < 0) faltan.push('"Apellido y Nombre"');
  if (colLiq < 0)    faltan.push('"liquidacion"');
  if (conceptos.length === 0) faltan.push('al menos un concepto con sus columnas "Cant" e "Imp"');
  if (faltan.length) {
    throw new Error(
      `Al reporte de Liquidaciones le falta: ${faltan.join(', ')}. El archivo trae ${listar(enc)}`
      + (sub.length ? ` (y debajo ${listar(sub)})` : '')
      + '. Verificá que sea el reporte de totales por concepto de la liquidación, de Axton.'
    );
  }

  const valoresDe = (celdas) => Object.fromEntries(conceptos.map(k => [k.header, {
    cant: celdas[k.colCant], imp: celdas[k.colImp],
  }]));

  const parsedRows = [];
  const totales = [];
  const claves = new Set();
  let filasIgnoradas = 0;

  grilla.forEach((celdas, r) => {
    // Las dos filas del encabezado no son datos; la TOTAL GENERAL sí se lee, esté
    // arriba del encabezado (el .xlsx, y el HTML al principio) o abajo de todo.
    if (r === idxEnc || r === idxEnc + 1) return;
    const nroFila = r + 1;
    const legajo = texto(celdas[colLegajo]);

    if (/^total\s+general/i.test(legajo)) {
      const v = valoresDe(celdas);
      totales.push(Object.fromEntries(conceptos.map(k => [k.header, {
        cant: numeroObligatorio(v[k.header].cant, `${k.header} (Cant) del TOTAL GENERAL`, nroFila),
        imp:  numeroObligatorio(v[k.header].imp, `${k.header} (Imp) del TOTAL GENERAL`, nroFila),
      }])));
      return;
    }
    if (r < idxEnc || !legajo || /^total/i.test(legajo)) { if (r > idxEnc) filasIgnoradas++; return; }

    if (formato === 'html' && celdas.length !== enc.length) {
      throw new Error(
        `La fila ${nroFila} del reporte de Liquidaciones tiene ${celdas.length} columnas y el encabezado `
        + `${enc.length}: no se puede saber qué concepto es cada una. Verificá que el archivo no esté editado.`
      );
    }
    const v = valoresDe(celdas);
    parsedRows.push({
      legajo,
      nombre: texto(celdas[colNombre]),
      liquidacion: texto(celdas[colLiq]),
      valores: Object.fromEntries(conceptos.map(k => [k.header, {
        cant: numeroObligatorio(v[k.header].cant, `${k.header} (Cant)`, nroFila),
        imp:  numeroObligatorio(v[k.header].imp, `${k.header} (Imp)`, nroFila),
      }])),
      fila: nroFila,
    });
    claves.add(legajoKey(legajo));
  });

  if (parsedRows.length === 0) {
    throw new Error(
      'El reporte de Liquidaciones no trae ninguna fila con legajo. Verificá que sea el reporte del período '
      + 'y que se haya descargado completo.'
    );
  }
  if (totales.length === 0) {
    throw new Error(
      'El reporte de Liquidaciones no trae la fila "TOTAL GENERAL", así que no hay con qué comprobar que se '
      + 'leyó completo. Verificá que el archivo no esté cortado ni editado.'
    );
  }

  return { parsedRows, totales, conceptos: conceptos.map(k => k.header), enc, sub, formato, filasIgnoradas, legajos: claves.size };
}

export function parseLiquidacionesVac(arrayBuffer) {
  const r = leerLiquidaciones(arrayBuffer);
  const periodos = [...new Set(r.parsedRows.map(f => periodoDeLiquidacion(f.liquidacion)).filter(Boolean))].sort();
  return {
    parsedRows: r.parsedRows,
    parseMetadata: {
      totalRows: r.parsedRows.length,
      uniqueLegajos: r.legajos,
      formato: r.formato,
      filasIgnoradas: r.filasIgnoradas,
      conceptos: r.conceptos,
      totales: r.totales,
      periodos,
    },
  };
}

export function detectHeadersLiquidaciones(arrayBuffer) {
  const r = leerLiquidaciones(arrayBuffer);
  return {
    headers: r.enc.map((h, c) => {
      const s = texto(r.sub[c]);
      return s && normHeader(s) !== normHeader(h) ? `${texto(h)} (${s})` : texto(h);
    }),
    preview: r.parsedRows.slice(0, 3).map(f => [f.legajo, f.nombre, f.liquidacion]),
  };
}
