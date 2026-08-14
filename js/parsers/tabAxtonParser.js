// tabAxtonParser.js — Parser del Tabulado de Axton exportado como .xlsx real
//
// NO es el Tabulado de `tabuladoControl.js`: ése es el export de Meta4, que
// llega como HTML disfrazado de .xls y trae una sola columna por concepto. El de
// Axton es un .xlsx de verdad y trae **un par de columnas por concepto**:
//
//   fila 1  encabezados — el nombre está en la PRIMERA del par, la segunda vacía
//   fila 2  subencabezados: `Cant` / `Imp` en cada par
//   fila 3+ datos, una fila por LIQUIDACIÓN (no por empleado)
//   última  TOTAL GENERAL, alineada con las columnas — sólo para validar sumas
//
// La cantidad de columnas cambia entre quincenas según qué se liquidó (116 en la
// 1ª de julio 2026 de POP, 128 en la 2ª), así que **nada se resuelve por
// posición**: las columnas de ficha salen por nombre y los conceptos por código.
//
// Lo que este parser NO hace, a propósito:
//   · **No consolida por legajo.** Emite una fila por liquidación, tal como
//     viene el archivo; consolidar es del control, con el molde compartido de
//     `js/controls/consolidate.js` (D-042).
//   · **No sabe qué concepto le importa a nadie.** Emite TODOS los pares que
//     encuentra como `cant_<codigo>` / `imp_<codigo>`. Qué código es el valor
//     hora lo decide el control, con el código que confirmó el analista (D-039).
//   · **No interpreta el período.** Lo deja en la columna `liquidacion` de cada
//     fila, que es de donde sale (el texto trae "(2da Quincena 07-2026)").
//
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';

// Columnas de ficha → alias aceptados. El primero es el nombre canónico del
// export de Axton. Se comparan sin acentos, sin espacios duros y sin distinguir
// mayúsculas: los encabezados de Axton traen NBSP en vez de espacio en varias.
const COLUMNS = {
  legajo:         ['Legajo', 'Nro Legajo', 'Nro. Legajo'],
  apellidoNombre: ['Apellido y Nombre', 'Empleado'],
  cuil:           ['CUIL', 'CUIT'],
  ingreso:        ['Ingreso', 'Fecha Ingreso', 'F. Ingreso'],
  egreso:         ['Egreso', 'Fecha Egreso', 'F. Egreso'],
  convenio:       ['Convenio'],
  categoria:      ['Categoría', 'Categoria'],
  cargo:          ['Cargo'],
  centroCosto:    ['Centro de Costo'],
  sectorInterno:  ['Sector Interno'],
  uniNegocio:     ['Uni. Negocio'],
  banco:          ['Banco'],
  cbu:            ['CBU'],
  recibo:         ['Recibo'],
  mov:            ['Mov.', 'Mov'],
  liquidacion:    ['liquidacion', 'liquidación'],
};

// Columna de ficha → nombre de la clave en la fila que sale del parser.
// `legajo` no está: lo escribe el loop aparte, porque la fila TOTAL GENERAL lo
// lleva en `null` a propósito.
const ROW_KEYS = {
  apellidoNombre: 'apellido_nombre',
  cuil:           'cuil',
  ingreso:        'ingreso',
  egreso:         'egreso',
  convenio:       'convenio',
  categoria:      'categoria',
  cargo:          'cargo',
  centroCosto:    'centro_costo',
  sectorInterno:  'sector_interno',
  uniNegocio:     'uni_negocio',
  banco:          'banco',
  cbu:            'cbu',
  recibo:         'recibo',
  mov:            'mov',
  liquidacion:    'liquidacion',
};

// Sin la columna de legajo no hay filas de empleado que leer: es lo único que
// corta. Todo lo demás sale como aviso y lo resuelve o lo informa el control
// (D-036).
const REQUIRED = ['legajo'];

// Los pares Cant/Imp que no son un concepto: totalizadores de la liquidación.
// `TOTAL -` es el par de cierre de la fila, que no se usa para nada.
const TOTALIZADORES = {
  bruto:       ['Bruto'],
  retenciones: ['Retenciones'],
  exento:      ['Exento'],
  neto:        ['Neto'],
};

/**
 * Parsea el Tabulado de Axton (.xlsx).
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 *   Cada fila lleva las columnas de ficha, los 4 totalizadores como
 *   `<nombre>_cant` / `<nombre>_imp`, y cada concepto como `cant_<codigo>` /
 *   `imp_<codigo>`. La fila TOTAL GENERAL viaja con `esTotalGeneral: true` y
 *   `legajo: null` — así queda disponible para validar sumas y a la vez la
 *   descartan `groupRowsByLegajo` y cualquier cruce por legajo.
 * @throws {Error} con mensaje en español si no se puede leer o no es el archivo
 */
export function parseTabAxton(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no tiene hojas.');

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  if (rawRows.length < 3) {
    throw new Error(
      'El Tabulado de Axton tiene menos de 3 filas: se esperaban los encabezados en la fila 1, '
      + 'los subencabezados Cant/Imp en la fila 2 y los datos desde la fila 3.'
    );
  }

  const headers = (rawRows[0] || []).map(norm);
  const subs    = (rawRows[1] || []).map(norm);

  const colIdx  = resolveColumns(headers);
  const missing = REQUIRED.filter(f => colIdx[f] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Falta la columna "${COLUMNS[missing[0]][0]}" en la fila 1 del Tabulado. `
      + `Encabezados encontrados: ${headers.filter(Boolean).slice(0, 12).join(', ')}…`
    );
  }

  // La fila 2 es la que distingue este formato del Tabulado de Meta4: sin
  // Cant/Imp, las columnas de concepto no se pueden leer en pares y el archivo
  // subido es otro. Cortar acá es preferible a leer la mitad de cada concepto.
  if (!subs.some(s => /^cant$/i.test(s))) {
    throw new Error(
      'La fila 2 no trae los subencabezados Cant / Imp. ¿Es el Tabulado de Axton exportado como .xlsx? '
      + 'El Tabulado de Meta4 se sube con el tipo "Tabulado (Controles)".'
    );
  }

  const avisos = [];
  const { conceptos, totalizadores } = resolvePairs(headers, subs, avisos);

  for (const [field, def] of Object.entries(COLUMNS)) {
    if (colIdx[field] === undefined && ['apellidoNombre', 'cbu', 'ingreso', 'egreso', 'liquidacion'].includes(field)) {
      avisos.push(`No encontré la columna "${def[0]}" en el Tabulado.`);
    }
  }

  // Fecha de ficha → cómo se lee. Lo que no está acá se lee como texto.
  const FECHAS = new Set(['ingreso', 'egreso']);

  const parsedRows = [];
  const legajos    = new Set();
  let totalGeneral = null;

  for (const raw of rawRows.slice(2)) {
    if (!raw) continue;
    const cell   = field => (colIdx[field] === undefined ? null : raw[colIdx[field]]);
    const legajo = norm(cell('legajo'));

    // La fila TOTAL GENERAL viaja como fila aparte, sin legajo: el control la
    // usa para validar sus sumas contra el archivo y ningún cruce la agrupa.
    const esTotal = /^total\s+general$/i.test(legajo);
    // Sin legajo numérico no es una fila de empleado: separadores y subtotales.
    if (!esTotal && !/^\d+$/.test(legajo)) continue;
    if (!esTotal) legajos.add(legajo.replace(/^0+/, '') || '0');

    // **Una columna que el archivo no trae no se emite como clave vacía**: se
    // omite. Así el control distingue "la columna no está en el archivo" (la
    // clave no existe → no se puede afirmar nada) de "la celda vino vacía" (la
    // clave existe y vale `null`/`''` → hay dato y dice que no hay). Es la
    // diferencia entre informar "no sé si hubo bajas" y "no hubo bajas": con
    // una clave vacía siempre, las dos se leen igual y una de las dos miente.
    const row = { esTotalGeneral: esTotal, legajo: esTotal ? null : legajo };
    for (const [field, rowKey] of Object.entries(ROW_KEYS)) {
      if (colIdx[field] === undefined) continue;
      const raw2 = raw[colIdx[field]];
      row[rowKey] = FECHAS.has(field) ? toIsoDate(raw2)
        : field === 'cbu'             ? normCbu(raw2)
        : norm(raw2);
    }
    // Los pares se emiten SIEMPRE, con `null` donde la celda está vacía: la
    // celda vacía es "no se liquidó", que no es cero (CLAUDE.md).
    for (const t of totalizadores) {
      row[`${t.key}_cant`] = toNum(raw[t.idx]);
      row[`${t.key}_imp`]  = toNum(raw[t.idx + 1]);
    }
    for (const c of conceptos) {
      row[c.keyCant] = toNum(raw[c.idx]);
      row[c.keyImp]  = toNum(raw[c.idx + 1]);
    }

    if (esTotal) totalGeneral = row;
    else parsedRows.push(row);
  }

  if (parsedRows.length === 0) {
    throw new Error(
      'El Tabulado no tiene filas de empleado (una fila con legajo numérico en la columna Legajo, desde la fila 3).'
    );
  }
  if (!totalGeneral) {
    avisos.push('No encontré la fila TOTAL GENERAL: no se pueden validar las sumas contra el archivo.');
  } else {
    parsedRows.push(totalGeneral);
  }

  // El período es dato de cada fila (columna `liquidacion`) y no metadata: el
  // control lo lee de ahí. Acá se copia sólo para la línea que ve el analista
  // al lado del nombre del archivo cargado.
  const periodo = parsedRows.find(r => !r.esTotalGeneral && r.liquidacion)?.liquidacion || null;
  if (!periodo) avisos.push('No pude leer el período: la columna "liquidacion" del Tabulado vino vacía.');

  return {
    parsedRows,
    parseMetadata: {
      // La fila TOTAL GENERAL no es un registro: no entra en el conteo que ve
      // el analista, aunque viaje en `parsedRows`.
      totalRows:     parsedRows.filter(r => !r.esTotalGeneral).length,
      uniqueLegajos: legajos.size,
      conceptos:     conceptos.length,
      periodo,
      sheetName:     workbook.SheetNames[0],
      avisos,
      parsedAt:      new Date().toISOString(),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Los pares Cant/Imp del archivo, separados en conceptos y totalizadores.
 *
 * Un par es una columna con `Cant` en la fila 2; la de al lado (`Imp`) es su
 * importe. El encabezado de un concepto es `"<código> - <nombre>"`, y el código
 * es lo único que identifica: el nombre cambia entre clientes y entre meses
 * (`'4899-COCHERA_IG'` y `'8805-DTO_COCHERA'` matchean los dos por "COCHERA").
 */
function resolvePairs(headers, subs, avisos) {
  const conceptos = [];
  const totalizadores = [];
  const vistos = new Set();

  for (let i = 0; i < headers.length; i++) {
    if (!/^cant$/i.test(subs[i] || '')) continue;
    const label = headers[i];
    if (!label) continue;

    const totKey = Object.entries(TOTALIZADORES)
      .find(([, aliases]) => aliases.some(a => hdrKey(a) === hdrKey(label)))?.[0];
    if (totKey) { totalizadores.push({ key: totKey, label, idx: i }); continue; }

    const m = label.match(/^(\d+)\s*-\s*(.*)$/);
    if (!m) continue;  // `TOTAL -` y cualquier otro par sin código: no es concepto
    let code = m[1];
    // Un código repetido en dos columnas no se pisa en silencio: la segunda
    // queda como `<codigo>__2` y sale como aviso, para que el analista vea que
    // el archivo trae el concepto dos veces.
    if (vistos.has(code)) {
      avisos.push(`El concepto ${code} aparece en más de una columna del Tabulado; la segunda se lee como ${code}__2.`);
      code = `${code}__2`;
    }
    vistos.add(code);
    conceptos.push({ code, label, nombre: m[2].trim(), idx: i, keyCant: `cant_${code}`, keyImp: `imp_${code}` });
  }

  return { conceptos, totalizadores };
}

function resolveColumns(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    const k = hdrKey(h);
    if (!k) return;
    for (const [field, aliases] of Object.entries(COLUMNS)) {
      if (idx[field] !== undefined) continue;
      if (aliases.some(a => hdrKey(a) === k)) idx[field] = i;
    }
  });
  return idx;
}

/** Clave de comparación de encabezados: sin acentos, sin espacios duros, minúscula. */
function hdrKey(v) {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase()
    .replace(/\s+/g, ' ');
}

function norm(v) {
  return v == null ? '' : String(v).replace(/\u00a0/g, ' ').trim();
}

// El CBU son 22 dígitos con ceros a la izquierda: se conserva como string. Como
// número de Excel pasaría a notación científica y se perdería.
function normCbu(v) {
  return norm(v).replace(/\s+/g, '');
}

// Importe de una celda del .xlsx: SheetJS ya devuelve número, así que sólo hace
// falta distinguir vacío (`null`, que no es 0) de número.
function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\u00a0/g, '').trim();
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return isNaN(n) ? null : n;
}

/**
 * Normaliza una fecha a 'YYYY-MM-DD', o `null` si la celda no trae fecha.
 * Acepta Date, serial de Excel y string. Todo en UTC, para que no dependa de la
 * zona horaria del navegador del analista.
 */
function toIsoDate(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);

  const n = Number(v);
  if (!isNaN(n) && n > 1 && n < 100000) {
    return new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`;
  return null;
}
