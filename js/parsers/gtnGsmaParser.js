// gtnGsmaParser.js — Los dos lectores del GTN de GSMA (specs/gtn-gsma-axton.md §2).
//
// 1. **El GTN del mes anterior** (`parseGtnGsma`): el `.xls` BIFF8 que armaba
//    Meta4 o el `.xlsx` que generó la app el mes anterior. De ahí salen los datos
//    del empleado que el Tabulado de Axton no trae: Employee Number, Cost Centre,
//    Location Code y el sueldo anual en USD (el número de la fórmula
//    `=<anual>/13.3`).
//
//    Las columnas se buscan **por título, nunca por letra**: el de Meta4 no tiene
//    Recognition Award y el generado sí, así que todo lo que está a la derecha de
//    Referral Bonus corre una columna entre los dos. La fila de encabezados es la
//    que trae "Employee Number" en la columna A. Los empleados van desde la fila
//    siguiente a "Currency" hasta la anterior a la de totales — la primera fila
//    cuyo sueldo es un `SUM(`. Si algo de eso no está, corta: un GTN leído a
//    medias da Employee Numbers corridos de empleado, y eso no lo ve nadie.
//
// 2. **El Tabulado de Axton** (`readTabuladoAxtonGtn`): el mismo lector tolerante
//    de N2 (`readTabAxton`, D-072), con un único agregado — reconocer el `.xls`
//    que exporta Axton (una página web con marcos, sin los datos adentro) y
//    decir qué hacer, en vez del error genérico de "no encontré encabezados".
//
// Lo que NO hace: no cruza nada ni decide nada. El cruce por nombre y los avisos
// son del control (js/controls/gtnGsma.js).

/* global XLSX */
import { readTabAxton } from './tabAxtonReader.js';
import { toNum } from '../utils/currency.js';
import { USD_DIVISOR } from '../exports/gtnGsmaLayout.js';

/** El mensaje que pide la spec cuando llega el .xls web de Axton. */
export const ERROR_XLS_WEB_AXTON =
  'Este archivo es la página web que exporta Axton y no trae los datos. Abrilo en Excel y guardalo como .xlsx.';

/** El mismo caso, para el casillero del GTN anterior. */
const ERROR_XLS_WEB_GTN =
  'Este archivo es una página web guardada como .xls y no trae los datos. Abrilo en Excel y guardalo como .xlsx.';

// Hasta dónde se busca la fila "Employee Number" (en Meta4 es la 4).
const MAX_FILAS_ENCABEZADO = 30;

// Las columnas que el control necesita del GTN anterior, por título normalizado.
const COLUMNAS = {
  employeeNumber: 'employee number',
  employeeName:   'employee name',
  costCentre:     'cost centre',
  locationCode:   'location code',
  usd:            'monthly salary in usd',
};

/** Título de columna comparable: sin espacios de más, sin mayúsculas. */
const normTitulo = (v) => String(v ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

// La fórmula del sueldo en USD: `120000/13.3` (SheetJS la da sin el `=`).
// Se acepta un `+` adelante y la coma como separador del 13,3.
const USD_FORMULA_RE = new RegExp(
  `^=?\\+?\\s*(-?\\d+(?:\\.\\d+)?)\\s*/\\s*${String(USD_DIVISOR).replace('.', '[.,]')}\\s*$`
);

// ── ¿Es la página web que exporta Axton? ─────────────────────────────────────

/**
 * El `.xls` que exporta Axton es un HTML: o el "cascarón" de Excel guardado como
 * página web (un `<frameset>` que apunta a una carpeta aparte con los datos), o
 * una página sin ninguna tabla adentro. Un HTML CON filas de tabla no entra acá:
 * ése lo lee SheetJS como cualquier hoja.
 */
export function esPaginaWebSinDatos(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const n = Math.min(bytes.length, 65536);
  let head = '';
  for (let i = 0; i < n; i++) head += String.fromCharCode(bytes[i]);
  const html = head.toLowerCase();
  const esHtml = /^\s*(﻿)?\s*</.test(html)
    && (html.includes('<html') || html.includes('<!doctype') || html.includes('xmlns:v=')
      || html.includes('<frameset') || html.includes('x:worksheetsource'));
  if (!esHtml) return false;
  return html.includes('<frameset') || html.includes('x:worksheetsource') || !html.includes('<td');
}

// ── El Tabulado de Axton ─────────────────────────────────────────────────────

/**
 * `readTabAxton` con el corte del .xls web de Axton antes de intentar leerlo, y
 * un dato más que el GTN necesita y el lector no da: **si las columnas que no
 * son conceptos traen importes**. El lector separa a un costado lo que no puede
 * atribuir a un código (`columnasSinClasificar`) y lo que saltea por ser parte
 * del export (`columnasIgnoradas`), pero no dice si tienen plata adentro. Para
 * el GTN eso es la diferencia entre "Salario Familiar vacío, como siempre" y "un
 * concepto `880027 Contribucion…` sin el guion, que el GTN perdería sin que nada
 * lo frene". Lo decide `columnasNoConceptoGtn()` (js/controls/gtnGsmaConfig.js).
 */
export function readTabuladoAxtonGtn(arrayBuffer) {
  if (esPaginaWebSinDatos(arrayBuffer)) throw new Error(ERROR_XLS_WEB_AXTON);
  const leido = readTabAxton(arrayBuffer);
  const m = leido.parseMetadata;
  m.columnasNoConcepto = contarImportesNoConcepto(arrayBuffer, m);
  return leido;
}

/**
 * Por cada columna que el lector dejó afuera de los conceptos: cuántas celdas de
 * empleado traen un importe distinto de cero, y cuánto suman. Mira sólo las
 * filas que el lector leyó como empleados (ni el TOTAL GENERAL, ni lo de abajo
 * del total, ni las filas sin legajo, que ya salen como aviso propio).
 */
function contarImportesNoConcepto(arrayBuffer, m) {
  const columnas = [
    ...(m.columnasSinClasificar || []).map(c => ({ ...c, tipo: 'sinClasificar' })),
    ...(m.columnasIgnoradas || []).map(c => ({ ...c, tipo: 'ignorada' })),
  ];
  if (columnas.length === 0) return [];
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = workbook.Sheets[m.sheetName];
  const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true }) : [];
  const fuera = new Set([...(m.totalGeneralFilas || []), ...(m.filasPostTotal || []), ...(m.filasSinLegajo || [])]);
  return columnas.map(c => {
    let celdasConImporte = 0;
    let importe = 0;
    for (let f = (m.primeraFilaDatos || 1) - 1; f < rows.length; f++) {
      if (fuera.has(f + 1)) continue;
      const v = rows[f]?.[c.col];
      // En una columna ignorada (sin subencabezado Cant/Imp) sólo cuenta un número
      // de verdad: un texto con dígitos ("12/2026") no es un importe.
      const n = typeof v === 'number' ? v : (c.tipo === 'sinClasificar' && typeof v === 'string' ? toNum(v) : null);
      if (n !== null && n !== 0) { celdasConImporte++; importe += n; }
    }
    return { letra: c.letra, rotulo: c.rotulo || '', sub: c.sub || null, tipo: c.tipo, celdasConImporte, importe };
  });
}

/** La vista previa del casillero del Tabulado, con el mismo corte. */
export function detectHeadersTabuladoAxtonGtn(arrayBuffer) {
  if (esPaginaWebSinDatos(arrayBuffer)) throw new Error(ERROR_XLS_WEB_AXTON);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headers = (rawRows[0] || []).map(h => (h !== null ? String(h).trim() : ''));
  return { headers, preview: rawRows.slice(1, 4) };
}

// ── El GTN del mes anterior ──────────────────────────────────────────────────

function leerHoja(arrayBuffer) {
  if (esPaginaWebSinDatos(arrayBuffer)) throw new Error(ERROR_XLS_WEB_GTN);
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellFormula: true, cellDates: false, cellNF: true });
  if (!workbook.SheetNames?.length) throw new Error('El archivo no tiene hojas.');

  // La hoja se llama GSMA en Meta4 y en el generado; si se renombró, sirve
  // cualquiera que tenga "Employee Number" en la columna A.
  const orden = [
    ...workbook.SheetNames.filter(n => n.trim().toUpperCase() === 'GSMA'),
    ...workbook.SheetNames.filter(n => n.trim().toUpperCase() !== 'GSMA'),
  ];
  for (const nombre of orden) {
    const ws = workbook.Sheets[nombre];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const cell = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];
    for (let r = range.s.r; r <= Math.min(range.e.r, MAX_FILAS_ENCABEZADO); r++) {
      if (normTitulo(cell(r, 0)?.v) === COLUMNAS.employeeNumber) {
        return { nombre, ws, range, cell, filaEncabezado: r, hojas: workbook.SheetNames };
      }
    }
  }
  throw new Error(
    'No encontré "Employee Number" en la columna A del GTN anterior (se buscó en las primeras '
    + `${MAX_FILAS_ENCABEZADO} filas de las hojas ${workbook.SheetNames.map(n => `"${n}"`).join(', ')}). `
    + '¿Es el GTN de GSMA del mes anterior?'
  );
}

/** El período del GTN: la fecha de la fila 2 (B2, formato mmm-yy). `null` si no la trae. */
function leerPeriodo(cell, filaEncabezado) {
  for (let r = 0; r < filaEncabezado; r++) {
    for (let c = 0; c < 4; c++) {
      const x = cell(r, c);
      if (!x) continue;
      if (x.t === 'd' && x.v instanceof Date) {
        return `${x.v.getUTCFullYear()}-${String(x.v.getUTCMonth() + 1).padStart(2, '0')}`;
      }
      if (x.t === 'n' && /[my]/i.test(String(x.z || '')) && XLSX.SSF?.parse_date_code) {
        const d = XLSX.SSF.parse_date_code(x.v);
        if (d?.y && d?.m) return `${d.y}-${String(d.m).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

const textoCelda = (x) => {
  if (!x || x.v === undefined || x.v === null) return '';
  return String(x.v).replace(/ /g, ' ').trim();
};

/**
 * Lee el GTN del mes anterior.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 *   Una fila por empleado: `{ fila, employeeNumber, nombre, costCentre,
 *   locationCode, usdAnual, usdValor, usdOrigen }`. `usdOrigen` es 'formula'
 *   (vino `=<anual>/13.3`), 'valor' (vino un número suelto) o `null` (vacío).
 * @throws {Error} con mensaje en español si el archivo no tiene la forma esperada
 */
export function parseGtnGsma(arrayBuffer) {
  const { nombre: sheetName, range, cell, filaEncabezado, hojas } = leerHoja(arrayBuffer);

  // ── Columnas por título ────────────────────────────────────────────────────
  const titulos = new Map(); // título normalizado → índice (el primero que aparece)
  for (let c = range.s.c; c <= range.e.c; c++) {
    const t = normTitulo(cell(filaEncabezado, c)?.v);
    if (t && !titulos.has(t)) titulos.set(t, c);
  }
  const col = {};
  const faltan = [];
  for (const [key, titulo] of Object.entries(COLUMNAS)) {
    if (titulos.has(titulo)) col[key] = titulos.get(titulo);
    else faltan.push(titulo);
  }
  if (faltan.length > 0) {
    throw new Error(
      `Al GTN anterior le falta${faltan.length === 1 ? ' la columna' : 'n las columnas'} `
      + faltan.map(t => `"${t.replace(/\b\w/g, ch => ch.toUpperCase())}"`).join(', ')
      + ` en la fila ${filaEncabezado + 1} (la de "Employee Number"). Se buscan por título, así que no importa en qué columna estén.`
    );
  }
  const colMonthly = titulos.get('monthly salary');
  const traeRecognitionAward = titulos.has('recognition award');

  // ── Desde dónde y hasta dónde van los empleados ────────────────────────────
  let filaCurrency = null;
  for (let r = filaEncabezado + 1; r <= Math.min(range.e.r, filaEncabezado + 10); r++) {
    if (normTitulo(cell(r, 0)?.v) === 'currency') { filaCurrency = r; break; }
  }
  if (filaCurrency === null) {
    throw new Error(
      `No encontré la fila "Currency" en la columna A del GTN anterior, debajo de los encabezados (fila ${filaEncabezado + 1}). `
      + 'Los empleados empiezan en la fila siguiente a esa: sin ella no se puede saber dónde arrancan.'
    );
  }

  const esSuma = (x) => /^\+?\s*SUM\(/i.test(String(x?.f || ''));
  let filaTotales = null;
  for (let r = filaCurrency + 1; r <= range.e.r; r++) {
    if (esSuma(cell(r, col.usd)) || (colMonthly !== undefined && esSuma(cell(r, colMonthly)))) { filaTotales = r; break; }
  }
  if (filaTotales === null) {
    throw new Error(
      'No encontré la fila de totales del GTN anterior (la primera cuyo sueldo es una fórmula SUM). '
      + 'Sin ella no se puede saber dónde terminan los empleados.'
    );
  }

  // ── Empleados ──────────────────────────────────────────────────────────────
  const parsedRows = [];
  const avisos = [];
  const filasSinNombre = [];
  for (let r = filaCurrency + 1; r < filaTotales; r++) {
    const nombre = textoCelda(cell(r, col.employeeName));
    const numero = cell(r, col.employeeNumber);
    const usdCell = cell(r, col.usd);
    const tieneAlgo = nombre !== '' || textoCelda(numero) !== '' || (usdCell && (usdCell.f || usdCell.v !== undefined));
    if (!tieneAlgo) continue;
    if (nombre === '') { filasSinNombre.push(r + 1); }

    let usdAnual = null, usdValor = null, usdOrigen = null;
    const m = usdCell?.f ? String(usdCell.f).replace(/\s/g, '').match(USD_FORMULA_RE) : null;
    if (m) {
      usdAnual = Number(m[1]);
      usdOrigen = 'formula';
    } else if (usdCell && (usdCell.v !== undefined && usdCell.v !== null && String(usdCell.v).trim() !== '')) {
      const v = toNum(usdCell.v);
      if (v !== null) { usdValor = v; usdOrigen = 'valor'; }
    }

    const numeroValor = numero?.v === undefined || numero?.v === null || String(numero.v).trim() === ''
      ? null
      : (typeof numero.v === 'number' ? numero.v : String(numero.v).trim());

    parsedRows.push({
      fila: r + 1,
      employeeNumber: numeroValor,
      nombre,
      costCentre: textoCelda(cell(r, col.costCentre)) || null,
      locationCode: textoCelda(cell(r, col.locationCode)) || null,
      usdAnual,
      usdValor,
      usdOrigen,
    });
  }

  if (parsedRows.length === 0) {
    throw new Error(
      `El GTN anterior no trae ningún empleado entre la fila ${filaCurrency + 2} (la siguiente a "Currency") `
      + `y la ${filaTotales} (la anterior a los totales).`
    );
  }
  if (filasSinNombre.length > 0) {
    avisos.push(
      `${filasSinNombre.length === 1 ? 'Una fila' : `${filasSinNombre.length} filas`} del GTN anterior con datos `
      + `no ${filasSinNombre.length === 1 ? 'tiene' : 'tienen'} nombre (fila ${filasSinNombre.join(', ')}): no se `
      + 'pueden cruzar por nombre con el Tabulado.'
    );
  }
  if (hojas.length > 1) {
    avisos.push(`El archivo trae ${hojas.length} hojas y se leyó sólo "${sheetName}".`);
  }

  return {
    parsedRows,
    parseMetadata: {
      sheetName,
      periodo: leerPeriodo(cell, filaEncabezado),
      // Si trae Recognition Award, es el GTN que generó la app; si no, el de Meta4.
      origen: traeRecognitionAward ? 'app' : 'meta4',
      filaEncabezado: filaEncabezado + 1,
      primeraFilaEmpleado: filaCurrency + 2,
      filaTotales: filaTotales + 1,
      totalRows: parsedRows.length,
      usdSinFormula: parsedRows.filter(p => p.usdOrigen !== 'formula').length,
      avisos,
      parsedAt: new Date().toISOString(),
    },
  };
}

/** La vista previa del casillero del GTN: los encabezados de la fila "Employee Number". */
export function detectHeadersGtnGsma(arrayBuffer) {
  const { ws, filaEncabezado } = leerHoja(arrayBuffer);
  const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, range: filaEncabezado });
  const headers = (rawRows[0] || []).map(h => (h !== null ? String(h).trim() : ''));
  return { headers, preview: rawRows.slice(5, 8) };
}
