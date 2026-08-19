// cuentasRedefinicionParser.js — Reporte de Cuentas de Redefinición del cliente
//
// Es la tabla de equivalencias entre el **nombre** de la cuenta contable que
// escribe la liquidación de Axton y el **código** de cuenta del plan del
// cliente. Sin este archivo la Contabilidad Desglosada sale igual (las cuentas
// van por nombre), pero no se puede armar el asiento: el asiento se agrupa por
// código.
//
// Layout del export (confirmado contra el reporte real de COTY del 19/08/2026):
//   fila 0    título ("Reporte de Cuentas de Redefinición <cliente> <fecha>")
//   fila 1    vacía
//   fila 2    encabezados
//   fila 3+   una fila por (cuenta, centro de costo)
//
// El encabezado repite "Codigo" tres veces —una por cada cuenta que nombra la
// fila (a reemplazar, reemplazante, y la definitiva)—, así que la columna de
// código se busca como **la primera "Codigo" que viene después de "Nombre"**, y
// no por posición: la posición fija del prototipo (K/L) se rompe con una columna
// agregada al principio, el nombre no.

/* global XLSX */
import { isHtmlTabulado, decodeHtmlTabulado } from './tabuladoHtml.js';

const NOMBRE_HEADERS = ['nombre'];
const CODIGO_HEADERS = ['codigo'];
const CECO_HEADERS   = ['centro de costo', 'centro de costos', 'ceco'];

function normHeader(h) {
  return String(h ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Filas del archivo como matriz de texto, venga como .xlsx real o como HTML. */
function leerFilas(arrayBuffer) {
  if (isHtmlTabulado(arrayBuffer)) {
    const html = decodeHtmlTabulado(arrayBuffer);
    const filas = [];
    const reTr = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
    let m;
    while ((m = reTr.exec(html)) !== null) {
      const celdas = [];
      const reCelda = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]\s*>/gi;
      let c;
      while ((c = reCelda.exec(m[1])) !== null) {
        celdas.push(c[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/\u00a0/g, ' ').trim());
      }
      filas.push(celdas);
    }
    return filas;
  }

  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('El reporte de cuentas no tiene ninguna hoja para leer.');
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null, blankrows: true })
    .map(f => (Array.isArray(f) ? f.map(v => (v === null || v === undefined ? '' : String(v).trim())) : []));
}

/**
 * Parsea el reporte de cuentas.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 */
export function parseCuentasRedefinicion(arrayBuffer) {
  const filas = leerFilas(arrayBuffer);

  // Fila de encabezados: la primera que tenga "Nombre" y, después, un "Codigo".
  let idxHeader = -1, colNombre = -1, colCodigo = -1, colCeco = -1;
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i] || [];
    const nombre = fila.findIndex(c => NOMBRE_HEADERS.includes(normHeader(c)));
    if (nombre === -1) continue;
    const codigo = fila.findIndex((c, j) => j > nombre && CODIGO_HEADERS.includes(normHeader(c)));
    if (codigo === -1) continue;
    idxHeader = i;
    colNombre = nombre;
    colCodigo = codigo;
    colCeco   = fila.findIndex(c => CECO_HEADERS.includes(normHeader(c)));
    break;
  }

  if (idxHeader === -1) {
    throw new Error(
      'No se encontró el encabezado del reporte de cuentas: hace falta una columna "Nombre" y, '
      + 'a su derecha, una "Codigo". Verificá que sea el "Reporte de Cuentas de Redefinición" del cliente.'
    );
  }

  const parsedRows = [];
  const nombres = new Set();
  let filasIgnoradas = 0;

  for (let i = idxHeader + 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    const nombre = String(fila[colNombre] ?? '').trim();
    const codigo = String(fila[colCodigo] ?? '').trim();
    // Una cuenta es una fila con nombre y con código numérico. Lo demás son
    // filas de relleno o cuentas todavía sin código asignado en el plan: se
    // cuentan y se informan, no se descartan en silencio.
    if (!nombre || !/^\d+$/.test(codigo)) {
      if (nombre || codigo) filasIgnoradas++;
      continue;
    }
    parsedRows.push({
      nombre,
      codigo,
      centro_costo: colCeco === -1 ? null : (String(fila[colCeco] ?? '').trim() || null),
    });
    nombres.add(nombre.toLowerCase());
  }

  if (parsedRows.length === 0) {
    throw new Error(
      'El reporte de cuentas no trae ninguna cuenta con código numérico. Verificá que sea el archivo '
      + 'correcto y que la columna "Codigo" de la derecha esté completa.'
    );
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows:        parsedRows.length,
      cuentas:          parsedRows.length,
      nombresDistintos: nombres.size,
      filasIgnoradas,
      sinCentroCosto:   colCeco === -1,
    },
  };
}

/** Encabezados y muestra para la pantalla de confirmación. */
export function detectHeaders(arrayBuffer) {
  const filas = leerFilas(arrayBuffer);
  const idx = filas.findIndex(f => (f || []).some(c => NOMBRE_HEADERS.includes(normHeader(c))));
  const headers = idx === -1 ? (filas[0] || []) : filas[idx];
  return { headers, preview: filas.slice(idx + 1, idx + 4) };
}
