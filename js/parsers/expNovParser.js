// expNovParser.js — Lector de la familia ExpNov (el importador de novedades de Axton)
//
// Cimiento N0a de la familia de Novedades (`specs/familia-novedades-axton.md`,
// D-070). Lee la planilla de novedades / importador `F2_Consolidada` de Axton:
// hoja `d  axFiles …ExpNov…`, una fila por empleado y una columna por concepto.
//
// **Todo por firma, nada por posición.** El relevamiento de los 7 clientes Axton
// dejó por escrito que acá no hay nada fijo: el bloque de identificación mide 3,
// 6, 8, 9 o 31 columnas (el primer concepto cae en D, E, F, G, I, J o AF), el
// bloque puede estar corrido una fila para abajo —con totales por concepto en la
// fila 1, no metadata—, y la fila de nombres en criollo puede no existir. Por eso
// el ancla es la **fila que contiene `Legajo` y `Apellido y Nombres`**, la fila de
// códigos es la que está pegada a ella (arriba o abajo, las dos variantes
// existen), y el primer concepto es la primera columna a su derecha que trae un
// código.
//
// Lo que este lector NO hace, a propósito:
//   · **No normaliza legajos.** Salen crudos, tal como los trae el archivo:
//     quién es el mismo empleado lo decide el control con `makeLegajoKey`, que
//     depende del cliente (D-038/D-042).
//   · **No deduce el período.** La fecha de la fila 1 puede ser la de la
//     plantilla original (POP: `09/08/2024` en archivos de 2026). El período lo
//     declara el analista (D-070).
//   · **No decide por el criollo.** El rótulo del concepto cambia entre archivos
//     del mismo cliente y del mismo mes (17 casos en Coelsa): el código es lo
//     único que identifica (D-039).
//   · **No convierte unidades.** Informa lo que declara la celda y listo (D-065).
//   · **No ignora nada en silencio.** Las columnas sin código salen listadas con
//     su rótulo y cuántas celdas cargadas tienen, y su contenido celda por celda
//     en `celdasSinCodigo` —para que quien las consuma pueda ofrecer resolver el
//     código y decir quién quedó afuera—; los valores que no se pueden leer, las
//     filas sin legajo y las hojas que no se leyeron salen como aviso.
//
/* global XLSX */
import { toNum } from '../utils/currency.js';

/** Firma del nombre de hoja: `HidalgoExpNov_1132_2`, `Hidalgo ExpNov_1251_`, … */
export const SHEET_EXPNOV_RE = /expnov/i;

// Hasta dónde se busca la fila de encabezados. El máximo relevado es la fila 3
// (SIASA y el F2 de Coelsa, todo corrido una fila); el margen es para un archivo
// con más preámbulo del visto.
const MAX_FILAS_PREAMBULO = 15;

// Un código de concepto de Axton es numérico (`1000`, `605705`). Los no numéricos
// existen (`SAL BAS` en Geopagos) pero no se dan por código solos: ver
// `resolverColumnas`.
const CODIGO_NUMERICO = /^\d{1,10}$/;

/**
 * Lee un archivo de la familia ExpNov.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 *   `parsedRows` es **una fila por celda cargada** —la unidad de este formato es
 *   la novedad, no el empleado—:
 *     `{ legajo, codigo, cantidad, importe, unidadDeclarada, fila, col, letraCol }`
 *   `legajo` viaja crudo; `cantidad`/`importe` son `null` cuando el archivo no
 *   los trae (`null` no es `0`); `unidadDeclarada` es `'cantidad_e_importe'`
 *   cuando la celda vino con la forma `cantidad$importe` y `'cantidad'` cuando
 *   vino un valor suelto.
 *   `parseMetadata` lleva las columnas (con y sin código), los empleados, la
 *   metadata del archivo y los avisos.
 * @throws {Error} con mensaje en español si el archivo no tiene la forma esperada
 */
export function parseExpNov(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('El archivo no tiene hojas.');
  }

  const avisos = [];
  const hoja   = elegirHoja(workbook, avisos);
  const { nombre: sheetName, rows, maxCol, ancla } = hoja;

  const { filaCodigos, filaCriollo } = resolverFilasDeEncabezado(rows, ancla, maxCol, sheetName);
  const filaDatos = Math.max(ancla.fila, filaCodigos) + 1;

  const { columnas, columnasSinCodigo, primerConcepto } =
    resolverColumnas(rows, filaCodigos, filaCriollo, ancla, maxCol, avisos);

  if (columnas.length === 0) {
    throw new Error(
      `No encontré ninguna columna de concepto en la hoja "${sheetName}". Se esperaba, a la derecha de `
      + `"Legajo" (columna ${letraCol(ancla.colLegajo)}), una fila con los códigos de concepto; `
      + `en la fila ${filaCodigos + 1} encontré: ${muestraDeFila(rows[filaCodigos], ancla.colLegajo + 1, maxCol)}.`
    );
  }

  // ── Datos ──────────────────────────────────────────────────────────────────
  const parsedRows   = [];
  const empleados    = [];
  const legajosVistos = new Set();
  const filasSinLegajo = [];
  const noParseables   = [];
  const celdasSinCodigo = [];

  for (let f = filaDatos; f < rows.length; f++) {
    const fila   = rows[f] || [];
    const legajo = textoCrudo(fila[ancla.colLegajo]);

    // Sin legajo no es una fila de empleado: filas de totales al pie, separadores
    // y las notas que el analista escribe abajo de la tabla. No se descartan en
    // silencio — se cuentan y salen como aviso.
    if (legajo === '') {
      if (fila.some((c, i) => i >= ancla.colLegajo && textoCrudo(c) !== '')) filasSinLegajo.push(f + 1);
      continue;
    }

    legajosVistos.add(legajo);
    empleados.push({
      fila: f + 1,
      legajo,
      apellidoNombre: ancla.colApellido === null ? null : textoCrudo(fila[ancla.colApellido]),
    });

    for (const col of columnas) {
      const v = parseValorCelda(fila[col.col]);
      if (v.vacia) continue;                    // celda vacía = no tiene esa novedad; NO es cero
      if (v.error) {
        noParseables.push({ fila: f + 1, letraCol: col.letra, codigo: col.codigo, texto: v.texto, motivo: v.error });
        continue;
      }
      col.celdasCargadas++;
      if (v.parcial) {
        noParseables.push({
          fila: f + 1, letraCol: col.letra, codigo: col.codigo, texto: v.texto,
          motivo: 'vino con la forma cantidad$importe pero una de las dos mitades no se pudo leer',
        });
      }
      parsedRows.push({
        legajo,
        codigo:          col.codigo,
        cantidad:        v.cantidad,
        importe:         v.importe,
        unidadDeclarada: v.unidadDeclarada,
        fila:            f + 1,
        col:             col.col,
        letraCol:        col.letra,
      });
    }

    // Una columna sin código no tiene concepto al que asignarle el valor, pero
    // lo que tiene escrito adentro no se descarta: viaja en `celdasSinCodigo`
    // con su rótulo. Es lo que le permite al control ofrecerle al analista
    // resolver el código contra el catálogo del cliente (D-039) sin volver a
    // abrir el archivo, y decir QUIÉN quedó afuera y no sólo cuántas celdas.
    for (const col of columnasSinCodigo) {
      const v = parseValorCelda(fila[col.col]);
      if (v.vacia) continue;                    // celda vacía = no tiene esa novedad; NO es cero
      col.celdasCargadas++;
      celdasSinCodigo.push({
        legajo,
        rotulo:          col.rotulo,
        cantidad:        v.cantidad ?? null,
        importe:         v.importe ?? null,
        unidadDeclarada: v.unidadDeclarada ?? null,
        texto:           v.texto ?? null,
        // Motivo cuando no es un número (`"Revisar que se aplique…"`): la
        // columna todavía no tiene código, así que no es un valor no parseable
        // de un concepto — se informa recién si el analista le asigna uno.
        noParseable:     v.error || null,
        fila:            f + 1,
        col:             col.col,
        letraCol:        col.letra,
      });
    }
  }

  if (empleados.length === 0) {
    throw new Error(
      `La hoja "${sheetName}" no tiene filas de empleado: se esperaba al menos una fila con legajo en la `
      + `columna ${letraCol(ancla.colLegajo)}, desde la fila ${filaDatos + 1}.`
    );
  }

  // ── Avisos ─────────────────────────────────────────────────────────────────
  const conCarga = columnasSinCodigo.filter(c => c.celdasCargadas > 0);
  if (conCarga.length > 0) {
    avisos.push(
      `${conCarga.length} ${conCarga.length === 1 ? 'columna sin código tiene' : 'columnas sin código tienen'} `
      + `datos cargados y no se pueden asignar a ningún concepto: `
      + conCarga.map(c => `${c.letra} "${c.rotulo || '(sin rótulo)'}" (${c.celdasCargadas})`).join(', ') + '.'
    );
  }
  if (filasSinLegajo.length > 0) {
    avisos.push(
      `${filasSinLegajo.length} ${filasSinLegajo.length === 1 ? 'fila con datos no tiene' : 'filas con datos no tienen'} `
      + `legajo y no se leyeron (fila ${filasSinLegajo.slice(0, 5).join(', ')}`
      + `${filasSinLegajo.length > 5 ? ', …' : ''}). Suelen ser totales al pie o notas del analista.`
    );
  }
  if (noParseables.length > 0) {
    avisos.push(
      `${noParseables.length} ${noParseables.length === 1 ? 'valor no se pudo leer' : 'valores no se pudieron leer'}: `
      + noParseables.slice(0, 5)
        .map(v => `fila ${v.fila}, columna ${v.letraCol}${v.codigo ? ` (${v.codigo})` : ''} — ${v.motivo}`)
        .join('; ') + (noParseables.length > 5 ? '; …' : '') + '.'
    );
  }

  const metaArchivo = leerMetadataArchivo(rows, Math.min(ancla.fila, filaCodigos));
  if (metaArchivo.fechaArchivo) {
    avisos.push(
      `La fila 1 trae la fecha ${metaArchivo.fechaArchivo}: es la del archivo o la de la plantilla original, `
      + 'no el período. El período lo declarás vos al cargar el archivo.'
    );
  }

  return {
    parsedRows,
    parseMetadata: {
      sheetName,
      totalRows:     parsedRows.length,
      uniqueLegajos: legajosVistos.size,
      conceptos:     [...new Set(columnas.map(c => c.codigo))],
      // El período NO sale del archivo: lo declara el analista (D-070).
      periodo: null,
      ...metaArchivo,
      columnas: columnas.map(({ col, letra, codigo, rotulo, celdasCargadas, duplicado, codigoNoNumerico }) =>
        ({ col, letra, codigo, rotulo, celdasCargadas, duplicado, codigoNoNumerico })),
      columnasSinCodigo: columnasSinCodigo.map(({ col, letra, rotulo, celdasCargadas }) =>
        ({ col, letra, rotulo, celdasCargadas })),
      // Los valores que traen esas columnas, celda por celda. Están acá y no en
      // `parsedRows` a propósito: `parsedRows` es lo que YA tiene concepto, y
      // mezclar las dos cosas haría que un total de novedades incluya en
      // silencio lo que todavía no se pudo asignar.
      celdasSinCodigo,
      empleados,
      noParseables,
      filasSinLegajo,
      bloqueIdentificacion: {
        hastaCol: primerConcepto - 1,
        letraHasta: letraCol(primerConcepto - 1),
        columnas: rangoDeColumnas(rows[ancla.fila], 0, primerConcepto - 1),
      },
      filaEncabezado:  ancla.fila + 1,
      filaCodigos:     filaCodigos + 1,
      filaCriollo:     filaCriollo === null ? null : filaCriollo + 1,
      primeraFilaDatos: filaDatos + 1,
      avisos,
      parsedAt: new Date().toISOString(),
    },
  };
}

/**
 * Separa el valor de una celda de concepto.
 *
 * El importador de Axton escribe `cantidad$importe` pegados en una celda
 * (`1$159811,7958`, hasta 12 decimales) — es el formato normal, no un error de
 * tipeo: se vio en Coelsa, Merz, Epiroc, Geopagos y SIASA. También existe el
 * valor suelto, que es una cantidad.
 *
 * Devuelve `{ vacia: true }` si no hay dato (que **no** es cero), `{ error }` si
 * hay algo escrito que no es un número, o `{ cantidad, importe, unidadDeclarada }`.
 */
export function parseValorCelda(v) {
  if (v === null || v === undefined) return { vacia: true };
  if (v instanceof Date) {
    const texto = isNaN(v) ? String(v) : v.toISOString().slice(0, 10);
    return { error: `es una fecha (${texto}), no una novedad`, texto };
  }
  if (typeof v === 'number') {
    return Number.isFinite(v)
      ? { cantidad: v, importe: null, unidadDeclarada: 'cantidad', texto: String(v) }
      : { error: 'no es un número', texto: String(v) };
  }
  const s = String(v).replace(/\u00a0/g, ' ').trim();
  if (s === '') return { vacia: true };

  if (s.includes('$')) {
    const corte    = s.indexOf('$');
    const izq      = s.slice(0, corte).trim();
    const der      = s.slice(corte + 1).trim();
    const cantidad = izq === '' ? null : toNum(izq);
    const importe  = der === '' ? null : toNum(der);
    if (cantidad === null && importe === null) {
      return { error: `no pude leer ni la cantidad ni el importe de "${s}"`, texto: s };
    }
    return {
      cantidad, importe, unidadDeclarada: 'cantidad_e_importe', texto: s,
      parcial: (izq !== '' && cantidad === null) || (der !== '' && importe === null),
    };
  }

  const n = toNum(s);
  if (n === null) return { error: `no es un número: "${s}"`, texto: s };
  return { cantidad: n, importe: null, unidadDeclarada: 'cantidad', texto: s };
}

/**
 * Vista previa del archivo, para la pantalla de confirmación de la carga
 * (`fixedFormat: false` en la ficha del tipo). No sirve el detector genérico:
 * la hoja del importador puede no ser la primera del libro —hay workbooks de
 * hasta 10 hojas, algunas ocultas— y la fila de encabezados no es la 1.
 *
 * Los encabezados que devuelve son los que el analista reconoce: el bloque de
 * identificación con su rótulo, y cada concepto como `código — rótulo`. Si el
 * archivo no tiene la forma esperada, no corta acá: devuelve la fila 1 de la
 * primera hoja y el error sale al parsear, con su mensaje completo.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ headers: string[], preview: Array<Array<*>> }}
 */
export function detectHeaders(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  try {
    const { nombre, rows, maxCol, ancla } = elegirHoja(workbook, []);
    const { filaCodigos, filaCriollo } = resolverFilasDeEncabezado(rows, ancla, maxCol, nombre);
    const { columnas, columnasSinCodigo, primerConcepto } =
      resolverColumnas(rows, filaCodigos, filaCriollo, ancla, maxCol, []);

    const porColumna = new Map();
    for (const c of columnas)          porColumna.set(c.col, c.rotulo ? `${c.codigo} — ${c.rotulo}` : c.codigo);
    for (const c of columnasSinCodigo) porColumna.set(c.col, c.rotulo ? `${c.rotulo} (sin código)` : '(sin código)');

    const headers = [];
    for (let c = 0; c <= maxCol; c++) {
      headers.push(c < primerConcepto
        ? textoCrudo((rows[ancla.fila] || [])[c])
        : (porColumna.get(c) || ''));
    }

    const filaDatos = Math.max(ancla.fila, filaCodigos) + 1;
    return { headers, preview: rows.slice(filaDatos, filaDatos + 3) };
  } catch {
    const sheet   = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) : [];
    return {
      headers: (rawRows[0] || []).map(h => textoCrudo(h)),
      preview: rawRows.slice(1, 4),
    };
  }
}

// ── Firma del archivo ────────────────────────────────────────────────────────

/**
 * La hoja a leer: la que matchea la firma `ExpNov` y tiene la fila de
 * encabezados. Si ninguna hoja matchea por nombre pero una tiene la fila, se lee
 * ésa y sale como aviso — el nombre de la hoja cambia por cliente y por versión
 * del export, la fila de encabezados no.
 */
function elegirHoja(workbook, avisos) {
  const porFirma = workbook.SheetNames.filter(n => SHEET_EXPNOV_RE.test(n));
  const orden    = [...porFirma, ...workbook.SheetNames.filter(n => !porFirma.includes(n))];

  for (const nombre of orden) {
    const sheet = workbook.Sheets[nombre];
    if (!sheet || !sheet['!ref']) continue;
    const rows   = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true });
    const maxCol = XLSX.utils.decode_range(sheet['!ref']).e.c;
    const ancla  = buscarAncla(rows, maxCol);
    if (!ancla) continue;

    if (!porFirma.includes(nombre)) {
      avisos.push(
        `Ninguna hoja se llama "…ExpNov…": leí "${nombre}", que es la que trae la fila con Legajo y `
        + 'Apellido y Nombres. Verificá que sea el archivo de novedades.'
      );
    }
    const noLeidas = workbook.SheetNames.filter(n => n !== nombre);
    if (noLeidas.length > 0) {
      avisos.push(
        `El archivo trae ${workbook.SheetNames.length} hojas y se leyó sólo "${nombre}". No se leyeron: `
        + noLeidas.map(n => `"${n}"${esOculta(workbook, n) ? ' (oculta)' : ''}`).join(', ') + '.'
      );
    }
    return { nombre, rows, maxCol, ancla };
  }

  throw new Error(
    'No encontré la fila de encabezados del importador de novedades: se esperaba una fila con "Legajo" y '
    + `"Apellido y Nombres" en alguna de las primeras ${MAX_FILAS_PREAMBULO} filas. `
    + `Hojas del archivo: ${workbook.SheetNames.map(n => `"${n}"`).join(', ')}.`
  );
}

function esOculta(workbook, nombre) {
  const ficha = workbook.Workbook?.Sheets?.find(s => s.name === nombre);
  return !!ficha && ficha.Hidden > 0;
}

/** La fila que contiene `Legajo` y `Apellido y Nombres`, y en qué columnas están. */
function buscarAncla(rows, maxCol) {
  for (let f = 0; f < Math.min(rows.length, MAX_FILAS_PREAMBULO); f++) {
    const fila = rows[f];
    if (!fila) continue;
    let colLegajo = null, colApellido = null;
    for (let c = 0; c <= maxCol; c++) {
      const k = normHeader(fila[c]);
      if (!k) continue;
      if (colLegajo === null && (k === 'legajo' || k === 'nro legajo' || k === 'nro. legajo' || k === 'n legajo')) colLegajo = c;
      if (colApellido === null && k.startsWith('apellido')) colApellido = c;
    }
    if (colLegajo !== null && colApellido !== null) return { fila: f, colLegajo, colApellido };
  }
  return null;
}

/**
 * Cuál de las filas pegadas al ancla trae los códigos y cuál el criollo.
 *
 * Las dos variantes existen en archivos reales: los rótulos de identificación
 * pueden estar en la misma fila que los códigos (criollo arriba) o en la fila de
 * criollo (códigos abajo). Se decide contando códigos numéricos a la derecha del
 * legajo, no por posición.
 */
function resolverFilasDeEncabezado(rows, ancla, maxCol, sheetName) {
  const desde = Math.max(ancla.colLegajo, ancla.colApellido) + 1;
  // La fila del ancla gana si trae aunque sea un código: si no, la primera fila
  // de datos —que es toda números— le ganaría por puntaje a la de encabezados en
  // los archivos que no tienen fila de criollo.
  const candidatas = [ancla.fila, ancla.fila + 1, ancla.fila - 1]
    .filter(f => f >= 0 && f < rows.length)
    .map(f => ({ f, puntaje: contarCodigos(rows[f], desde, maxCol) }));

  const mejor = candidatas[0].puntaje > 0
    ? candidatas[0]
    : candidatas.slice(1).reduce((a, b) => (b.puntaje > a.puntaje ? b : a), { f: ancla.fila, puntaje: 0 });
  if (mejor.puntaje === 0) {
    throw new Error(
      `No encontré la fila de códigos de concepto en la hoja "${sheetName}". Se esperaba, pegada a la fila `
      + `${ancla.fila + 1} (la de "Legajo" y "Apellido y Nombres"), una fila con los códigos; `
      + `a la derecha de la columna ${letraCol(desde - 1)} encontré: `
      + `${muestraDeFila(rows[ancla.fila], desde, maxCol)}.`
    );
  }

  const filaCodigos = mejor.f;
  // La de criollo es la de arriba, y sólo si trae rótulos de verdad: en Coelsa la
  // fila de arriba son totales por concepto (números), no nombres.
  const arriba = filaCodigos - 1;
  const hayCriollo = arriba >= 0 && arriba !== filaCodigos
    && tieneRotulos(rows[arriba], desde, maxCol);

  return { filaCodigos, filaCriollo: hayCriollo ? arriba : null };
}

/**
 * Las columnas de concepto, separadas en las que tienen código y las que no.
 *
 * El primer concepto es la primera columna a la derecha del legajo con un código
 * numérico — así se banca un bloque de identificación de 3 o de 31 columnas sin
 * asumir nada. De ahí a la derecha, todo es concepto: lo que no trae código sale
 * listado aparte, con su rótulo (D-070).
 */
function resolverColumnas(rows, filaCodigos, filaCriollo, ancla, maxCol, avisos) {
  const codigos = rows[filaCodigos] || [];
  const criollo = filaCriollo === null ? [] : (rows[filaCriollo] || []);
  const desde   = Math.max(ancla.colLegajo, ancla.colApellido) + 1;

  let primerConcepto = null;
  for (let c = desde; c <= maxCol; c++) {
    if (esCodigoNumerico(codigos[c])) { primerConcepto = c; break; }
  }
  if (primerConcepto === null) return { columnas: [], columnasSinCodigo: [], primerConcepto: desde };

  // El primer concepto puede no ser el primero con código numérico: a su
  // izquierda puede haber un código no numérico (`SAL BAS` en Geopagos) o una
  // columna sin código (`Licencia por ART` en SIASA). Cuando el archivo trae fila
  // de criollo propia, el bloque de identificación se reconoce porque ahí arriba
  // no dice nada: se estira hacia la izquierda mientras haya rótulo.
  if (filaCriollo !== null && filaCriollo !== ancla.fila) {
    while (primerConcepto > desde && textoCrudo(criollo[primerConcepto - 1]) !== '') primerConcepto--;
  }

  const columnas = [];
  const columnasSinCodigo = [];
  const vistos = new Map();

  for (let c = primerConcepto; c <= maxCol; c++) {
    const bruto  = textoCrudo(codigos[c]);
    const rotulo = textoCrudo(criollo[c]);
    const base   = { col: c, letra: letraCol(c), rotulo, celdasCargadas: 0 };

    if (bruto === '') { columnasSinCodigo.push(base); continue; }

    const numerico = esCodigoNumerico(codigos[c]);
    // Un código no numérico existe (`SAL BAS` en Geopagos), pero también existen
    // etiquetas que ocupan el lugar del código sin serlo (`Inicio`/`Fin`,
    // `Informar Cantidad`, `Suma total` en SIASA). Se distingue por dónde está el
    // rótulo: si el archivo trae fila de criollo y esta columna tiene su nombre
    // ahí arriba, lo de abajo es el código; si no, es una columna sin código. En
    // los dos casos el analista lo ve —aviso o listado—, nunca se resuelve en
    // silencio.
    if (!numerico && rotulo === '') { columnasSinCodigo.push({ ...base, rotulo: bruto }); continue; }

    const codigo = numerico ? codigoDe(codigos[c]) : bruto;
    if (!numerico) {
      avisos.push(
        `El código de la columna ${base.letra} ("${rotulo}") no es numérico: "${codigo}". `
        + 'Se lee tal cual; confirmalo contra el manual de conceptos del cliente.'
      );
    }

    const duplicado = vistos.has(codigo);
    if (duplicado) {
      avisos.push(
        `El código ${codigo} aparece en dos columnas: ${vistos.get(codigo)} y ${base.letra}. `
        + 'Las dos se leen y viajan por separado — revisá cuál corresponde antes de importar.'
      );
    } else {
      vistos.set(codigo, base.letra);
    }
    columnas.push({ ...base, codigo, duplicado, codigoNoNumerico: !numerico });
  }

  return { columnas, columnasSinCodigo, primerConcepto };
}

/**
 * La metadata de las filas de preámbulo: `Unidad Organizativa / nro / nombre /
 * Fecha` (POP, Red Bull, Coelsa F3) o `Empresa / nombre / Fecha` (Epiroc, Merz,
 * Geopagos). Puede no haber ninguna (en Coelsa la fila 1 son totales).
 */
function leerMetadataArchivo(rows, hastaFila) {
  const out = { unidadOrganizativa: null, empresa: null, fechaArchivo: null };
  for (let f = 0; f < hastaFila; f++) {
    const fila = rows[f] || [];
    for (let c = 0; c < fila.length; c++) {
      const k = normHeader(fila[c]);
      if (k !== 'unidad organizativa' && k !== 'empresa') continue;
      const restos = fila.slice(c + 1).map(textoCrudo).filter(v => v !== '');
      const fecha  = restos.find(esFecha) || null;
      const textos = restos.filter(v => !esFecha(v));
      if (k === 'unidad organizativa') {
        out.unidadOrganizativa = {
          numero: textos.find(v => /^\d+$/.test(v)) || null,
          nombre: textos.find(v => !/^\d+$/.test(v)) || null,
        };
      } else {
        out.empresa = textos.find(v => !/^\d+$/.test(v)) || null;
      }
      // La fecha se guarda como dato del archivo y nada más: no define el período.
      if (fecha && !out.fechaArchivo) out.fechaArchivo = fecha;
    }
  }
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Clave de comparación de encabezados: sin acentos, sin espacios duros, minúscula. */
function normHeader(v) {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * El texto de una celda, sin normalizar nada más que el espacio duro. Los legajos
 * salen de acá: crudos, porque quién es el mismo empleado lo decide el control
 * con `makeLegajoKey` (D-038).
 */
function textoCrudo(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
  return String(v).replace(/\u00a0/g, ' ').trim();
}

function esCodigoNumerico(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 && v < 1e10;
  return CODIGO_NUMERICO.test(textoCrudo(v));
}

function codigoDe(v) {
  return typeof v === 'number' ? String(Math.round(v)) : textoCrudo(v);
}

function contarCodigos(fila, desde, hasta) {
  if (!fila) return 0;
  let n = 0;
  for (let c = desde; c <= hasta; c++) if (esCodigoNumerico(fila[c])) n++;
  return n;
}

/** ¿La fila trae rótulos (texto) sobre las columnas de concepto? */
function tieneRotulos(fila, desde, hasta) {
  if (!fila) return false;
  for (let c = desde; c <= hasta; c++) {
    const t = textoCrudo(fila[c]);
    if (t !== '' && !esCodigoNumerico(fila[c]) && !/^-?[\d.,]+$/.test(t)) return true;
  }
  return false;
}

function esFecha(v) {
  return /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function letraCol(i) {
  return i < 0 ? '' : XLSX.utils.encode_col(i);
}

function rangoDeColumnas(fila, desde, hasta) {
  const out = [];
  for (let c = desde; c <= hasta; c++) out.push({ col: c, letra: letraCol(c), rotulo: textoCrudo(fila?.[c]) });
  return out;
}

/** Las primeras celdas con contenido de una fila, para que el error diga qué encontró. */
function muestraDeFila(fila, desde, hasta) {
  const vistas = [];
  for (let c = desde; c <= hasta && vistas.length < 8; c++) {
    const t = textoCrudo(fila?.[c]);
    if (t !== '') vistas.push(`${letraCol(c)}="${t}"`);
  }
  return vistas.length > 0 ? vistas.join(', ') : '(todo vacío)';
}
