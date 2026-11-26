// contaNeteoParser.js — Lector de la Contabilidad Desglosada de Meta4 para el
// Neteo del asiento (Marval). Ver specs/neteo-asiento-marval.md.
//
// Es el MISMO Excel que lee `contaExcel.js` (el de Rendimiento vs Asiento), pero
// leído para otra cosa, y por eso tiene su propio lector en vez de una opción en
// aquél:
//   · el asiento necesita TODAS las filas con cuenta. `contaExcel.js` descarta
//     las que vienen sin nombre de centro de costo (las provisiones y las
//     cuentas de pasivo de Marval vienen así) — para el asiento son la mitad de
//     las líneas;
//   · el nombre del centro de costo (la columna NOMBRE2 del asiento) es la
//     SEGUNDA columna titulada "NOMBRE" de la desglosada, la que sigue a
//     ID_CENTRO_COSTO. La primera "NOMBRE" es el nombre del empleado y acá no se
//     lee;
//   · la hoja se busca por sus títulos de columna y no por su nombre ni por su
//     posición: el libro de Marval trae además una hoja con el asiento armado.
//
// No interpreta nada de contabilidad: ubica la hoja y la fila de títulos, lee
// las columnas por su nombre y deja cada valor como vino. Qué se netea y qué no
// es lógica del control (js/controls/neteoAsientoMarval.js).
//
/* global XLSX */

// Las columnas que el asiento necesita, por su título exacto en la desglosada.
const TITULOS = {
  cuenta:   'CUENTA_CONTAB',
  nCuenta:  'N_CUENTA_CONTABLE',
  dimension: 'ID_CONTA',
  centro:   'ID_CENTRO_COSTO',
  debe:     'DEBE',
  haber:    'HABER',
};
// El nombre del centro de costo: la primera columna "NOMBRE" a la derecha de
// ID_CENTRO_COSTO.
const TITULO_NOMBRE_CENTRO = 'NOMBRE';

// Hasta qué fila se busca la de títulos. En el archivo real es la primera; se
// dan unas filas de margen por si el export trae un título arriba.
const MAX_PREAMBULO = 10;

const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

// Con cuántos de los seis títulos una hoja ya se reconoce como la desglosada.
// Con menos, se informa que no es la desglosada; con éstos o más, se dice qué
// columna falta.
const MIN_TITULOS_RECONOCIBLE = 4;

/**
 * Lee un importe de Debe o Haber. Devuelve `{ valor, error }`:
 *   · celda vacía → valor `null`, sin error (el control la suma como cero);
 *   · número → ese número;
 *   · texto con formato argentino ("1.234,56", "1234,56") o plano ("1234.56")
 *     → el número que dice;
 *   · texto con un solo punto y tres dígitos detrás ("1.234") → error
 *     'ambiguo': puede ser mil doscientos treinta y cuatro o uno con 234;
 *   · cualquier otro texto ("abc", "Null") → error 'texto'.
 * Un importe mal leído no se completa con cero: el control frena.
 */
export function leerImporte(v) {
  if (v === null || v === undefined) return { valor: null, error: null };
  if (typeof v === 'number') return Number.isFinite(v) ? { valor: v, error: null } : { valor: null, error: 'texto' };
  const s = String(v).replace(/\u00a0/g, ' ').trim();
  if (s === '') return { valor: null, error: null };
  const signo = s.startsWith('-') ? -1 : 1;
  const cuerpo = s.replace(/^[-+]/, '');
  // Un solo punto con exactamente tres dígitos detrás y sin coma: no se sabe si
  // es separador de miles o decimal.
  if (/^\d{1,3}\.\d{3}$/.test(cuerpo)) return { valor: null, error: 'ambiguo' };
  // Argentino: miles con punto (en grupos de tres) y decimales con coma.
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cuerpo) || /^\d+,\d+$/.test(cuerpo)) {
    return { valor: signo * Number(cuerpo.replace(/\./g, '').replace(',', '.')), error: null };
  }
  // Plano: dígitos con o sin punto decimal.
  if (/^\d+(\.\d+)?$/.test(cuerpo)) return { valor: signo * Number(cuerpo), error: null };
  return { valor: null, error: 'texto' };
}

/**
 * Busca en una fila las columnas que hacen falta. Devuelve sus posiciones, o
 * `null` si a la fila le falta alguna de las seis básicas.
 */
function columnasDeLaFila(fila) {
  const titulos = (fila || []).map(t => texto(t).toUpperCase());
  const col = {};
  const faltan = [];
  for (const [clave, titulo] of Object.entries(TITULOS)) {
    const i = titulos.indexOf(titulo);
    if (i === -1) faltan.push(titulo);
    col[clave] = i;
  }
  if (faltan.length) return { incompleta: true, faltan };
  // El nombre del centro: la "NOMBRE" que sigue a ID_CENTRO_COSTO (puede no
  // estar; eso se informa más abajo con un error claro).
  col.nombreCentro = titulos.findIndex((t, i) => i > col.centro && t === TITULO_NOMBRE_CENTRO);
  return col;
}

/**
 * Recorre las hojas del libro y devuelve la primera que tiene, en sus primeras
 * filas, los títulos de la desglosada.
 */
function ubicarDesglosada(workbook) {
  let casi = null;   // la hoja que más se parece a la desglosada, si le falta algo
  for (const nombreHoja of workbook.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(workbook.Sheets[nombreHoja], { header: 1, defval: null });
    for (let f = 0; f < Math.min(MAX_PREAMBULO, filas.length); f++) {
      const col = columnasDeLaFila(filas[f]);
      if (!col.incompleta) return { nombreHoja, filas, filaTitulos: f, col };
      const encontrados = Object.keys(TITULOS).length - col.faltan.length;
      if (encontrados >= MIN_TITULOS_RECONOCIBLE && (!casi || col.faltan.length < casi.faltan.length)) {
        casi = { nombreHoja, faltan: col.faltan };
      }
    }
  }
  return casi ? { casi } : null;
}

function errorSinDesglosada(workbook, casi) {
  if (casi) {
    return new Error(
      `La hoja «${casi.nombreHoja}» parece la Contabilidad Desglosada, pero le falta`
      + `${casi.faltan.length === 1 ? ' la columna' : 'n las columnas'} ${casi.faltan.join(', ')}. `
      + 'Sin eso no se puede armar el asiento: volvé a bajar la desglosada completa de Meta4.',
    );
  }
  return new Error(
    'No encontré la Contabilidad Desglosada en este archivo: ninguna hoja tiene en sus primeras filas '
    + `los títulos ${Object.values(TITULOS).join(', ')}. `
    + `Hojas del archivo: ${workbook.SheetNames.join(', ') || '(ninguna)'}. `
    + 'Bajá de Meta4 la desglosada del período y subila tal cual.',
  );
}

/**
 * Para la vista previa del Paso 2: los títulos de la hoja que se va a leer, no
 * los de la primera hoja del libro.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], preview: any[][] }}
 */
export function detectHeaders(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const hallada = ubicarDesglosada(workbook);
  if (!hallada || hallada.casi) throw errorSinDesglosada(workbook, hallada?.casi);
  const { filas, filaTitulos } = hallada;
  return {
    headers: (filas[filaTitulos] || []).map(texto),
    preview: filas.slice(filaTitulos + 1, filaTitulos + 4),
  };
}

/**
 * Lee la desglosada. Una fila de salida por cada fila con cuenta contable; las
 * filas vacías o sin cuenta (separadores, renglones en blanco al final) se
 * saltean y se cuentan.
 *
 * Los valores de cuenta, dimensión, centro y nombres quedan como vinieron (un
 * número sigue siendo número, un texto sigue siendo texto): así salen después
 * en el asiento. Debe y Haber se leen como número (ver `leerImporte`); una celda
 * vacía queda en `null` (el control la suma como cero, igual que la tabla
 * dinámica de hoy) y un texto que no es importe queda marcado para que el
 * control frene.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 */
export function parseContaNeteo(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const hallada = ubicarDesglosada(workbook);
  if (!hallada || hallada.casi) throw errorSinDesglosada(workbook, hallada?.casi);
  const { nombreHoja, filas, filaTitulos, col } = hallada;

  if (col.nombreCentro === -1) {
    throw new Error(
      `En la hoja «${nombreHoja}» no está la columna con el nombre del centro de costo: se esperaba una `
      + 'columna titulada NOMBRE a la derecha de ID_CENTRO_COSTO. Sin ella el asiento no puede llevar '
      + 'la columna NOMBRE2. Revisá que la desglosada se haya bajado completa.',
    );
  }

  const parsedRows = [];
  let sinCuenta = 0;
  const cuentas = new Set();

  for (let f = filaTitulos + 1; f < filas.length; f++) {
    const fila = filas[f] || [];
    const cuenta = fila[col.cuenta];
    // Sin cuenta no hay línea de asiento: es un renglón vacío o un separador.
    if (texto(cuenta) === '') { sinCuenta++; continue; }
    cuentas.add(texto(cuenta));
    const debe = leerImporte(fila[col.debe]);
    const haber = leerImporte(fila[col.haber]);
    parsedRows.push({
      cuenta,
      n_cuenta:  fila[col.nCuenta],
      dimension: fila[col.dimension],
      centro:    fila[col.centro],
      nombre2:   fila[col.nombreCentro],
      debe:      debe.valor,
      haber:     haber.valor,
      // Si el importe no se pudo leer, el porqué ('texto' o 'ambiguo'): el
      // control frena con esto, no lo suma como cero.
      debeError:  debe.error,
      haberError: haber.error,
    });
  }

  if (parsedRows.length === 0) {
    throw new Error(`La hoja «${nombreHoja}» tiene los títulos de la desglosada pero ninguna fila con cuenta contable.`);
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows: parsedRows.length,
      sinCuenta,
      cuentas: cuentas.size,
      sheetName: nombreHoja,
      parsedAt: new Date().toISOString(),
    },
  };
}
