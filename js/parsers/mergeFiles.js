// mergeFiles.js — Juntar varios archivos del mismo tipo subidos en una casilla
//
// La casilla multi-archivo (`flow: 'multi'`, D-018 y D-109) parsea cada archivo
// por separado y después los junta acá: concatena las filas y avisa si dos
// archivos distintos traen filas idénticas — señal de que el mismo archivo se
// subió dos veces. Juntar no suma nada: sumar lo que corresponda (por CC, por
// legajo) es trabajo del control, que es el que sabe cuál es su unidad.

/**
 * Concatena varios archivos ya parseados y detecta filas idénticas repetidas
 * entre archivos distintos (una fila repetida dentro del mismo archivo no
 * cuenta: puede ser legítima).
 *
 * @param {Array<{ fileName: string, parsedRows: object[], parseMetadata?: object }>} entries
 * @returns {{ parsedRows: object[], parseMetadata: { totalRows: number, files: object[],
 *            duplicates: Array<{ fileName: string, count: number }>, parsedAt: string } }}
 */
export function mergeParsedFiles(entries) {
  const firstFileOf = new Map();    // firma de fila → nombre del primer archivo donde apareció
  const dupCountByFile = new Map(); // nombre de archivo → filas que repite de OTRO archivo
  const parsedRows = [];
  const files = [];
  let totalRows = 0;

  for (const entry of entries) {
    let dupInThisFile = 0;
    for (const row of entry.parsedRows) {
      const sig = JSON.stringify(row);
      const firstFile = firstFileOf.get(sig);
      if (firstFile === undefined) {
        firstFileOf.set(sig, entry.fileName);
      } else if (firstFile !== entry.fileName) {
        dupInThisFile++;
      }
      parsedRows.push(row);
    }
    if (dupInThisFile > 0) dupCountByFile.set(entry.fileName, dupInThisFile);

    const fileTotalRows = entry.parseMetadata?.totalRows ?? entry.parsedRows.length;
    totalRows += fileTotalRows;
    files.push({ fileName: entry.fileName, totalRows: fileTotalRows });
  }

  return {
    parsedRows,
    parseMetadata: {
      totalRows,
      files,
      duplicates: [...dupCountByFile.entries()].map(([fileName, count]) => ({ fileName, count })),
      parsedAt: new Date().toISOString(),
    },
  };
}

/**
 * ¿Este archivo trae las mismas columnas, en el mismo orden, que el primero?
 * La configuración de columnas del Paso 2 se hace una vez y vale para todos los
 * archivos de la casilla: con un archivo de otro formato, la columna elegida
 * puede no existir o ser otra, y el importe saldría vacío o cambiado sin que
 * nadie lo note. Por eso un archivo distinto no se suma: se rechaza.
 *
 * Compara los títulos tal como los lee el Paso 2 (sin espacios de los costados).
 * Las columnas vacías del final no cuentan: SheetJS a veces las lee y a veces no.
 *
 * @param {string[]} reference  encabezados del primer archivo
 * @param {string[]} candidate  encabezados del archivo nuevo
 * @returns {null | { position: number, expected: string, found: string }}
 *   `null` si coinciden; si no, la primera columna que difiere (1 = la primera).
 */
export function headersMismatch(reference, candidate) {
  const clean = hs => {
    const out = (hs || []).map(h => (h == null ? '' : String(h).trim()));
    while (out.length && (out[out.length - 1] === '' || /^__EMPTY(_\d+)?$/.test(out[out.length - 1]))) out.pop();
    return out;
  };
  const ref = clean(reference);
  const cand = clean(candidate);
  const n = Math.max(ref.length, cand.length);
  for (let i = 0; i < n; i++) {
    if (ref[i] !== cand[i]) {
      return { position: i + 1, expected: ref[i] ?? '', found: cand[i] ?? '' };
    }
  }
  return null;
}
