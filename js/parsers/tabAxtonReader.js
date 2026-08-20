// tabAxtonReader.js — Lector robusto del Tabulado de Axton (cimiento N0b)
//
// Extiende la pieza T (`specs/lector-tabulado-formatos.md`, D-065): el detector
// `tabFormatDetector.js` dice QUÉ formato es un Tabulado; esto lo lee. La fuente
// del criterio es el relevamiento de los 7 clientes Axton de julio 2026
// (`specs/familia-novedades-axton.md`, sección "El lado liquidación", D-070), que
// dejó por escrito que del archivo real no hay **nada** fijo:
//
//   · el preámbulo mide 0 filas (POP, Epiroc, Geopagos), 1 (Merz, SIASA) o 2
//     (Red Bull, Coelsa) — y ahí vive el campo `Reporte:`, que distingue el
//     Resumen de Liquidacion del Totales de Concepto;
//   · los conceptos vienen como par `Cant`/`Imp` (POP, Epiroc) o **sólo `Imp`**
//     (los otros cinco);
//   · `TOTAL GENERAL` aparece una vez (al cierre) o duplicado arriba y abajo;
//   · hay filas agregadas **a mano debajo** del `TOTAL GENERAL`, con fórmulas
//     (Geopagos);
//   · los encabezados traen espacios duros U+00A0 (`Centro de Costo`, POP y Coelsa);
//   · el ancho cambia entre dos versiones del mismo mes (Merz 23→24 columnas,
//     SIASA 85→83, Coelsa 16→15 de identificación).
//
// Por eso acá **nada se resuelve por posición**: la fila de encabezados es la que
// trae la columna de legajo, los subencabezados son la fila pegada abajo, la ficha
// sale por nombre y los conceptos por **código** — el encabezado de Axton es
// `1000 - Sueldo Basico` (espacio, guion, espacio) y el nombre no identifica nada:
// en SIASA conviven `999` y `1000`, los dos rotulados "Sueldo Basico" (D-039).
//
// Lo que este lector NO hace, a propósito:
//   · **No consolida por legajo.** Emite una fila por LIQUIDACIÓN, tal como viene
//     el archivo — un legajo aparece hasta 3 veces en POP. Consolidar es del
//     control, con el molde compartido de `js/controls/consolidate.js` y la clave
//     del cliente (`makeLegajoKey`): es el bug más caro del repo (D-042), y la
//     regla está escrita como assert en `tests/tabAxtonReader.test.js`.
//   · **No normaliza legajos.** Salen crudos; quién es el mismo empleado lo decide
//     el control (D-038).
//   · **No infiere una cantidad ausente.** En la variante sólo-Imp las claves
//     `cant_<codigo>` **no existen** —no valen `null`— y el lector avisa que hay
//     que pedir el export con cantidades: un número inferido y coherente es peor
//     que un hueco declarado (D-065).
//   · **No convierte unidades** (D-065) ni decide qué concepto le importa a nadie:
//     emite todos los que encuentra.
//   · **No ignora nada en silencio.** Las columnas de valor que no se pueden
//     atribuir a un concepto, las filas de abajo del TOTAL GENERAL, las filas sin
//     legajo y los conceptos cuya suma no cierra contra el archivo salen como
//     aviso (D-070).
//
// **No reemplaza a `tabAxtonParser.js`** todavía (D-072): ése lee el Tabulado de
// Axton en su forma estricta (encabezados en la fila 1, pares Cant/Imp
// obligatorios) y lo consume hoy el control de Variación entre quincenas de POP.
// Que ese parser pase a delegar acá es deuda declarada — se hace aparte, con sus
// tests, para no cambiar de paso el resultado de un control que ya está en
// producción. Mientras conviven, **cualquier firma nueva se agrega acá**, no al
// parser estricto.
//
/* global XLSX */
import { toNum } from '../utils/currency.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { extraerMetadata } from './tabuladoHtml.js';

/** Firma del nombre de hoja de Axton: `Liquidaciones.20260728.035742.6`. */
export const HOJA_AXTON_RE = /^Liquidaciones\.\d{8}\.\d{6}\.\d+$/;

// Hasta dónde se busca la fila de encabezados. El máximo relevado es la fila 3
// (preámbulo de 2 filas en Red Bull y Coelsa); el margen es para un archivo con
// más preámbulo del visto, o con el TOTAL GENERAL de arriba adentro del preámbulo.
const MAX_FILAS_PREAMBULO = 12;

// El encabezado de un concepto de Axton: `1000 - Sueldo Basico`. Se acepta con y
// sin espacios alrededor del guion, porque el export se re-guarda desde Excel y
// ahí los espacios se van. El **código** es lo único que identifica.
const CONCEPTO_RE = /^(\d{1,10})\s*-\s*(.+)$/;

// Columnas de ficha → alias aceptados. El primero es el nombre canónico del export
// de Axton. Se comparan sin acentos, sin espacios duros y sin distinguir mayúsculas.
const COLUMNS = {
  legajo:         ['Legajo', 'Nro Legajo', 'Nro. Legajo', 'N Legajo'],
  apellidoNombre: ['Apellido y Nombre', 'Apellido y Nombres', 'Empleado'],
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

// Columna de ficha → nombre de la clave en la fila que sale del lector.
const ROW_KEYS = {
  legajo:         'legajo',
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

// Fechas de ficha: se normalizan a 'YYYY-MM-DD'. El resto sale como texto.
const FECHAS = new Set(['ingreso', 'egreso']);

// Los grupos Cant/Imp que NO son un concepto: totalizadores de la liquidación.
const TOTALIZADORES = {
  bruto:       ['Bruto', 'Total Bruto'],
  retenciones: ['Retenciones', 'Total Descuento', 'Descuentos'],
  exento:      ['Exento', 'Exentos'],
  neto:        ['Neto', 'Total Neto'],
};

// Encabezados conocidos que no son ni ficha ni concepto ni totalizador: el par de
// cierre de la fila y la marca del Libro de Sueldos Digital. Se listan en la
// metadata para que se vea que se los salteó a propósito (D-065, "qué NO es un
// concepto"), pero no generan aviso: son parte normal del export.
const NO_CONCEPTOS = ['TOTAL -', 'TOTAL', 'LSD'];

// Tolerancia de la validación de sumas contra el `TOTAL GENERAL` del archivo. No
// es la tolerancia del cliente (`clients.diffTolerance`, D-069): eso mide una
// diferencia de negocio, esto mide si leímos bien el archivo. Los floats de Excel
// no dan igualdad exacta (CLAUDE.md).
const TOL_TOTALES = 0.01;

/**
 * Lee un Tabulado de Axton (.xlsx real).
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ parsedRows: object[], parseMetadata: object }}
 *   `parsedRows` es **una fila por liquidación** (no por empleado): la ficha con
 *   las claves de `ROW_KEYS` que el archivo trae, los totalizadores como
 *   `<nombre>_cant` / `<nombre>_imp` y cada concepto como `cant_<codigo>` /
 *   `imp_<codigo>`. Una columna que el archivo no trae **no se emite como clave
 *   vacía**: así el control distingue "la columna no está" de "la celda vino
 *   vacía", que es la diferencia entre "no sé" y "no hubo".
 *   La fila `TOTAL GENERAL` **no** viaja en `parsedRows` —para que ningún cruce la
 *   tome por un empleado— sino en `parseMetadata.totalGeneral`.
 * @throws {Error} con mensaje en español si el archivo no tiene la forma esperada
 */
export function readTabAxton(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('El archivo no tiene hojas.');
  }

  const avisos = [];
  const { nombre: sheetName, rows, maxCol } = elegirHoja(workbook, avisos);
  const layout = layoutTabAxton({ sheetName, rows, maxCol });

  const { filaEncabezado, filaSub, variante, preambulo, colIdx, conceptos, totalizadores } = layout;
  // La clave de legajo del CLIENTE (`clients.legajoKeyMode`, D-038) la resuelve el
  // control, no el lector. Acá se usa el default sólo para el conteo informativo
  // de "cuántos empleados distintos y cuántos con más de una liquidación" — el
  // cruce vuelve a agrupar con la clave del cliente y con `consolidate.js`.
  const keyFn = makeLegajoKey();

  // ── Filas de datos ─────────────────────────────────────────────────────────
  const parsedRows       = [];
  const filasSinLegajo   = [];
  const filasPostTotal   = [];
  const totalGeneralFilas = [];
  const legajosVistos    = new Map();   // clave → cuántas liquidaciones
  const liquidaciones    = new Set();
  let   totalGeneral     = null;

  // El TOTAL GENERAL de arriba vive DENTRO del preámbulo (verificado: en la
  // variante duplicada la primera copia está por encima de la fila de
  // encabezados). Se lee igual, porque sus celdas están alineadas con las
  // columnas, y sirve para validar las sumas cuando el de abajo no está.
  for (let f = 0; f < filaEncabezado; f++) {
    if (!esFilaTotalGeneral(rows[f], maxCol)) continue;
    totalGeneralFilas.push(f + 1);
    totalGeneral = armarFila(rows[f], f, layout, { esTotalGeneral: true });
  }

  // Cuál es el ÚLTIMO TOTAL GENERAL de la zona de datos, en una pasada previa.
  // No alcanza con "el primero que aparezca": en la variante duplicada la copia de
  // arriba puede caer debajo de los encabezados en vez de dentro del preámbulo, y
  // ahí tomar la primera como cierre tiraría la nómina entera a la basura.
  let ultimoTotal = -1;
  for (let f = filaSub + 1; f < rows.length; f++) {
    if (esFilaTotalGeneral(rows[f], maxCol)) ultimoTotal = f;
  }

  for (let f = filaSub + 1; f < rows.length; f++) {
    const fila = rows[f] || [];
    if (!filaConAlgo(fila, maxCol)) continue;

    if (esFilaTotalGeneral(fila, maxCol)) {
      totalGeneralFilas.push(f + 1);
      totalGeneral = armarFila(fila, f, layout, { esTotalGeneral: true });
      continue;
    }

    // Todo lo que viene DESPUÉS del último TOTAL GENERAL no son datos del sistema:
    // son las filas que el analista agrega a mano al pie, con fórmulas (Geopagos).
    // Se cuentan y salen como aviso — leerlas como empleados metería importes
    // inventados en el cruce.
    if (ultimoTotal >= 0 && f > ultimoTotal) { filasPostTotal.push(f + 1); continue; }

    const legajo = texto(fila[colIdx.legajo]);
    if (legajo === '') { filasSinLegajo.push(f + 1); continue; }

    const row = armarFila(fila, f, layout, { esTotalGeneral: false });
    parsedRows.push(row);

    const clave = keyFn(legajo);
    if (clave) legajosVistos.set(clave, (legajosVistos.get(clave) || 0) + 1);
    if (row.liquidacion) liquidaciones.add(row.liquidacion);
  }

  if (parsedRows.length === 0) {
    throw new Error(
      `El Tabulado no trae ninguna fila de empleado: se esperaba al menos una fila con legajo en la columna `
      + `${letraCol(colIdx.legajo)} ("${COLUMNS.legajo[0]}"), desde la fila ${filaSub + 2}.`
    );
  }

  // ── Avisos ────────────────────────────────────────────────────────────────
  if (variante === 'axton_imp') {
    avisos.push(
      'El Tabulado vino sólo con importes: no trae columnas "Cant", así que las cantidades liquidadas no '
      + 'están en el archivo. Pedí el export con cantidades — no se deducen del importe. El control que las '
      + 'necesite va a salir INCIERTO, no aprobado.'
    );
  }

  for (const c of conceptos.filter(c => c.duplicado)) {
    avisos.push(
      `El concepto ${c.codigoBase} aparece en más de una columna del Tabulado (${c.letraPrimera} y ${c.letra}): `
      + `la segunda se lee como ${c.codigo} y viaja por separado. Revisá cuál corresponde antes de cruzar.`
    );
  }

  if (layout.columnasSinClasificar.length > 0) {
    avisos.push(
      `${layout.columnasSinClasificar.length} ${layout.columnasSinClasificar.length === 1
        ? 'columna con importes no se pudo atribuir a ningún concepto'
        : 'columnas con importes no se pudieron atribuir a ningún concepto'}: `
      + layout.columnasSinClasificar.map(c => `${c.letra} "${c.rotulo || '(sin encabezado)'}"`).join(', ')
      + '. No entraron al cruce; si son conceptos, el encabezado tiene que traer el código.'
    );
  }

  if (filasPostTotal.length > 0) {
    avisos.push(
      `${filasPostTotal.length} ${filasPostTotal.length === 1 ? 'fila está' : 'filas están'} debajo del `
      + `TOTAL GENERAL y no se leyeron (fila ${filasPostTotal.slice(0, 5).join(', ')}`
      + `${filasPostTotal.length > 5 ? ', …' : ''}). Suelen ser cálculos agregados a mano al pie del export.`
    );
  }

  if (filasSinLegajo.length > 0) {
    avisos.push(
      `${filasSinLegajo.length} ${filasSinLegajo.length === 1 ? 'fila con datos no tiene' : 'filas con datos no tienen'} `
      + `legajo y no se leyeron (fila ${filasSinLegajo.slice(0, 5).join(', ')}`
      + `${filasSinLegajo.length > 5 ? ', …' : ''}).`
    );
  }

  // La columna `liquidacion` es la que dice de qué paga es cada fila. Sin ella el
  // archivo se lee igual —los importes están— pero no se puede decir cuál de las
  // liquidaciones del mes trajo cada uno, y eso el analista tiene que saberlo antes
  // de leer una diferencia (D-036: que un dato no exista es resultado válido, lo
  // que no puede es pasar en silencio).
  if (colIdx.liquidacion === undefined) {
    avisos.push(
      'El Tabulado no trae la columna "liquidacion": los importes se leen igual, pero no se puede saber de '
      + 'qué liquidación del período es cada fila.'
    );
  }

  const conVarias = [...legajosVistos.values()].filter(n => n > 1).length;
  const maxPorLegajo = legajosVistos.size ? Math.max(...legajosVistos.values()) : 0;
  if (conVarias > 0) {
    avisos.push(
      `${conVarias} ${conVarias === 1 ? 'legajo tiene' : 'legajos tienen'} más de una liquidación en el `
      + `período (hasta ${maxPorLegajo}): el Tabulado trae una fila por liquidación y los importes se suman `
      + 'entre ellas.'
    );
  }

  if (totalGeneralFilas.length === 0) {
    avisos.push('No encontré la fila TOTAL GENERAL: no se pudieron validar las sumas contra el archivo.');
  }

  const totalesQueNoCierran = validarTotales(parsedRows, totalGeneral, conceptos, totalizadores);
  if (totalesQueNoCierran.length > 0) {
    avisos.push(
      `${totalesQueNoCierran.length} ${totalesQueNoCierran.length === 1 ? 'columna no cierra' : 'columnas no cierran'} `
      + `contra el TOTAL GENERAL del archivo: `
      + totalesQueNoCierran.slice(0, 5).map(t => `${t.label} (leído ${t.sumado}, archivo ${t.archivo})`).join('; ')
      + `${totalesQueNoCierran.length > 5 ? '; …' : ''}. `
      + 'Puede ser una fila editada a mano o una columna que no se leyó completa.'
    );
  }

  return {
    parsedRows,
    parseMetadata: {
      sheetName,
      formato:  variante,
      sistema:  'Axton',
      // Que el archivo traiga cantidades o no es la decisión que después hace
      // salir INCIERTO al control (D-065): viaja explícita, no se deduce de si
      // alguna clave `cant_` existe.
      cantidadesDisponibles: variante === 'axton',
      reporte:         preambulo.reporte,
      empresa:         preambulo.empresa,
      periodo:         preambulo.periodo,
      tipoLiquidacion: preambulo.tipoLiquidacion,
      filasPreambulo:  filaEncabezado,
      filaEncabezado:  filaEncabezado + 1,
      filaSubencabezado: filaSub + 1,
      primeraFilaDatos:  filaSub + 2,
      totalRows:      parsedRows.length,
      uniqueLegajos:  legajosVistos.size,
      legajosConVariasLiquidaciones: conVarias,
      maxLiquidacionesPorLegajo:     maxPorLegajo,
      liquidaciones:  [...liquidaciones],
      conceptos: conceptos.map(({ codigo, codigoBase, nombre, label, letra, keyCant, keyImp, duplicado }) =>
        ({ codigo, codigoBase, nombre, label, letra, keyCant, keyImp, duplicado })),
      totalizadores: totalizadores.map(({ key, label, keyCant, keyImp }) => ({ key, label, keyCant, keyImp })),
      fichaPresente:  Object.keys(colIdx),
      fichaFaltante:  Object.keys(COLUMNS).filter(f => colIdx[f] === undefined),
      columnasSinClasificar: layout.columnasSinClasificar,
      columnasIgnoradas:     layout.columnasIgnoradas,
      totalGeneral,
      totalGeneralFilas,
      totalGeneralDuplicado: totalGeneralFilas.length > 1,
      totalesQueNoCierran,
      filasPostTotal,
      filasSinLegajo,
      avisos,
      parsedAt: new Date().toISOString(),
    },
  };
}

/**
 * Resuelve la estructura del archivo sin leer una sola fila de datos: dónde está
 * el encabezado, cuál es la variante y qué es cada columna. Pura y exportada a
 * propósito — es la parte que documenta las firmas y la que se testea sola.
 *
 * @param {{ sheetName?: string, rows: any[][], maxCol: number }} input
 * @returns {{ filaEncabezado: number, filaSub: number, variante: 'axton'|'axton_imp',
 *             preambulo: object, colIdx: object, conceptos: object[], totalizadores: object[],
 *             columnasSinClasificar: object[], columnasIgnoradas: object[] }}
 *   Los índices de fila son 0-based (los 1-based, los de la pantalla, salen en
 *   `parseMetadata`).
 * @throws {Error} con mensaje en español si no se reconoce la estructura
 */
export function layoutTabAxton({ sheetName, rows, maxCol }) {
  const hoja = sheetName || '(sin nombre)';
  const ancho = maxCol ?? Math.max(0, ...(rows || []).map(f => (Array.isArray(f) ? f.length - 1 : 0)));

  const filaEncabezado = buscarFilaEncabezado(rows, ancho);
  if (filaEncabezado === null) {
    throw new Error(
      `No encontré la fila de encabezados del Tabulado en la hoja "${hoja}": se esperaba, en alguna de las `
      + `primeras ${MAX_FILAS_PREAMBULO} filas, una columna "${COLUMNS.legajo[0]}". `
      + `En la fila 1 encontré: ${muestraDeFila(rows?.[0], 0, ancho)}. `
      + 'Verificá que sea el Tabulado exportado por Axton y que no se le hayan borrado los encabezados.'
    );
  }

  // El campo `Reporte:` del preámbulo es lo que distingue los tres exports de
  // Axton que empiezan igual: el "Resumen de Liquidacion" y la "Consulta de
  // Liquidacion" son este Tabulado; el "Totales de Concepto" es OTRO archivo, con
  // otro lector. Los dos traen columna Legajo, así que sin este chequeo el
  // totalizador subido en el casillero del Tabulado moría más adelante con un
  // error sobre los subencabezados, que no le dice al analista qué hacer.
  const preambulo = leerPreambulo(rows, filaEncabezado);
  if (preambulo.reporte && /totales?\s+de\s+concepto/i.test(preambulo.reporte)) {
    throw new Error(
      `Este archivo es el reporte "${preambulo.reporte}" de Axton, no el Tabulado de la liquidación. `
      + 'El "Totales de Concepto" se sube en su propio casillero — sirve como fuente complementaria, porque '
      + 'trae conceptos que el Tabulado no muestra, pero no reemplaza al Tabulado.'
    );
  }

  const headers = (rows[filaEncabezado] || []).map(texto);
  const filaSub = filaEncabezado + 1;
  const subs    = (rows[filaSub] || []).map(texto);

  // La fila de subencabezados es lo que distingue las dos variantes de Axton, y
  // también lo que dice qué columna es cantidad y qué columna es importe. Sin
  // ella no se puede saber si una columna suelta de concepto trae días o pesos:
  // cortar es preferible a elegir uno de los dos y salir con números coherentes
  // y mal (CLAUDE.md, "un default silencioso es un bug").
  const hayCant = subs.some(esCant);
  const hayImp  = subs.some(esImp);
  if (!hayCant && !hayImp) {
    throw new Error(
      `La fila ${filaSub + 1} del Tabulado no trae los subencabezados "Cant" / "Imp", así que no se puede `
      + 'saber si cada columna de concepto es una cantidad o un importe. '
      + `En esa fila encontré: ${muestraDeFila(rows[filaSub], 0, ancho)}. `
      + '¿Es el Tabulado de Axton? El de Meta4 se sube con el tipo "Tabulado (Controles)".'
    );
  }
  const variante = hayCant ? 'axton' : 'axton_imp';

  const colIdx = resolverFicha(headers);
  if (colIdx.legajo === undefined) {
    // No debería pasar —la fila se eligió por tener legajo— pero si el alias que
    // matcheó no es el mismo que resuelve la ficha, mejor decirlo que seguir.
    throw new Error(`No pude ubicar la columna de legajo en la fila ${filaEncabezado + 1} del Tabulado.`);
  }

  const { conceptos, totalizadores, columnasSinClasificar, columnasIgnoradas } =
    resolverColumnasDeValor(headers, subs, colIdx, ancho);

  if (conceptos.length === 0) {
    throw new Error(
      `No encontré ninguna columna de concepto en la hoja "${hoja}". Se esperaban encabezados con la forma `
      + `"1000 - Sueldo Basico" (código, guion, nombre) en la fila ${filaEncabezado + 1}; `
      + `encontré: ${muestraDeFila(rows[filaEncabezado], 0, ancho)}.`
    );
  }

  return { filaEncabezado, filaSub, variante, preambulo, colIdx, conceptos, totalizadores, columnasSinClasificar, columnasIgnoradas };
}

// ── Firma del archivo ────────────────────────────────────────────────────────

/**
 * La hoja a leer: la que matchea la firma `Liquidaciones.AAAAMMDD.HHMMSS.n` y
 * tiene fila de encabezados. Si ninguna matchea por nombre pero una tiene la
 * fila, se lee ésa y sale como aviso — el nombre de hoja cambia cuando el
 * analista re-guarda el archivo desde Excel; la fila de encabezados no.
 */
function elegirHoja(workbook, avisos) {
  const porFirma = workbook.SheetNames.filter(n => HOJA_AXTON_RE.test(n));
  const orden    = [...porFirma, ...workbook.SheetNames.filter(n => !porFirma.includes(n))];

  for (const nombre of orden) {
    const sheet = workbook.Sheets[nombre];
    if (!sheet || !sheet['!ref']) continue;
    const rows   = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: true });
    const maxCol = XLSX.utils.decode_range(sheet['!ref']).e.c;
    if (buscarFilaEncabezado(rows, maxCol) === null) continue;

    if (!porFirma.includes(nombre)) {
      avisos.push(
        `Ninguna hoja se llama "Liquidaciones.AAAAMMDD.HHMMSS.n": leí "${nombre}", que es la que trae la fila `
        + 'de encabezados con la columna Legajo. Verificá que sea el Tabulado del período.'
      );
    }
    const noLeidas = workbook.SheetNames.filter(n => n !== nombre);
    if (noLeidas.length > 0) {
      avisos.push(
        `El archivo trae ${workbook.SheetNames.length} hojas y se leyó sólo "${nombre}". No se leyeron: `
        + noLeidas.map(n => `"${n}"`).join(', ') + '.'
      );
    }
    return { nombre, rows, maxCol };
  }

  throw new Error(
    'No encontré la fila de encabezados del Tabulado en ninguna hoja del archivo: se esperaba una columna '
    + `"${COLUMNS.legajo[0]}" en alguna de las primeras ${MAX_FILAS_PREAMBULO} filas. `
    + `Hojas del archivo: ${workbook.SheetNames.map(n => `"${n}"`).join(', ')}.`
  );
}

/**
 * La primera fila que trae la columna de legajo. Es el ancla de todo: por encima
 * está el preámbulo (0, 1 o 2 filas según cliente, más el TOTAL GENERAL de
 * arriba en la variante duplicada) y por debajo los subencabezados.
 *
 * Una fila de datos no puede confundirse con ésta: el legajo de un empleado es un
 * número o un código, nunca la palabra "Legajo".
 */
function buscarFilaEncabezado(rows, maxCol) {
  if (!Array.isArray(rows)) return null;
  for (let f = 0; f < Math.min(rows.length, MAX_FILAS_PREAMBULO); f++) {
    const fila = rows[f];
    if (!Array.isArray(fila)) continue;
    for (let c = 0; c <= maxCol; c++) {
      if (COLUMNS.legajo.some(a => hdrKey(a) === hdrKey(fila[c]))) return f;
    }
  }
  return null;
}

/** Columna de ficha → índice, por nombre de encabezado. El primer alias que matchea gana. */
function resolverFicha(headers) {
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

/**
 * Qué es cada columna de valor: concepto, totalizador, no-concepto conocido o
 * columna que no se pudo atribuir.
 *
 * Se clasifica columna por columna y **por encabezado**, no por posición: así el
 * bloque de identificación puede medir 12, 15, 16 o 31 columnas sin que nada
 * cambie acá. En la variante con pares, el nombre del concepto está en la columna
 * `Cant` y la de al lado (`Imp`, encabezado vacío por la celda combinada) es su
 * importe; en la variante sólo-Imp hay una sola columna por concepto.
 */
function resolverColumnasDeValor(headers, subs, colIdx, maxCol) {
  const fichaCols = new Set(Object.values(colIdx));
  const conceptos = [];
  const totalizadores = [];
  const columnasSinClasificar = [];
  const columnasIgnoradas = [];
  const vistos = new Map();

  for (let c = 0; c <= maxCol; c++) {
    if (fichaCols.has(c)) continue;

    const label = headers[c] || '';
    const sub   = subs[c] || '';

    // Segunda mitad de un par: encabezado vacío (celda combinada con la de al
    // lado) y subencabezado `Imp` detrás de un `Cant`. Ya la tomó su concepto.
    if (label === '' && esImp(sub) && esCant(subs[c - 1] || '')) continue;
    if (label === '' && sub === '') continue;
    if (label === '') {
      columnasSinClasificar.push({ col: c, letra: letraCol(c), rotulo: '', sub });
      continue;
    }

    if (NO_CONCEPTOS.some(n => hdrKey(n) === hdrKey(label))) {
      columnasIgnoradas.push({ col: c, letra: letraCol(c), rotulo: label });
      continue;
    }

    const totKey = Object.entries(TOTALIZADORES)
      .find(([, aliases]) => aliases.some(a => hdrKey(a) === hdrKey(label)))?.[0];
    if (totKey) {
      totalizadores.push({ key: totKey, label, letra: letraCol(c), ...parDeColumnas(c, subs),
        keyCant: `${totKey}_cant`, keyImp: `${totKey}_imp` });
      continue;
    }

    const m = label.match(CONCEPTO_RE);
    if (!m) {
      // Sin código no hay concepto: matchear por nombre agarra el equivocado
      // (`4899-COCHERA_IG` vs `8805-DTO_COCHERA`) y en SIASA hay dos códigos con
      // el mismo rótulo. Si la columna trae valores, sale como aviso; si es una
      // columna de ficha que no conocemos, se lista y listo.
      if (esCant(sub) || esImp(sub)) columnasSinClasificar.push({ col: c, letra: letraCol(c), rotulo: label, sub });
      else                           columnasIgnoradas.push({ col: c, letra: letraCol(c), rotulo: label });
      continue;
    }

    const par = parDeColumnas(c, subs);
    if (par.idxImp === null && par.idxCant === null) {
      // Encabezado de concepto sin subencabezado: no se sabe si es cantidad o
      // importe. No se elige uno — se informa.
      columnasSinClasificar.push({ col: c, letra: letraCol(c), rotulo: label, sub });
      continue;
    }

    const codigoBase = m[1];
    // Un código repetido en dos columnas no se pisa en silencio: la segunda queda
    // como `<codigo>__2` y sale como aviso, con las dos letras de columna. Pasa en
    // el importador (605705, 1530, 1600) y puede pasar en el Tabulado.
    const previas  = vistos.get(codigoBase) || [];
    const duplicado = previas.length > 0;
    const codigo   = duplicado ? `${codigoBase}__${previas.length + 1}` : codigoBase;
    vistos.set(codigoBase, [...previas, letraCol(c)]);

    conceptos.push({
      codigo, codigoBase, duplicado,
      letraPrimera: previas[0] ?? null,
      nombre: m[2].trim(),
      label,
      letra: letraCol(c),
      ...par,
      keyCant: `cant_${codigo}`,
      keyImp:  `imp_${codigo}`,
    });
  }

  return { conceptos, totalizadores, columnasSinClasificar, columnasIgnoradas };
}

/**
 * Las columnas de cantidad y de importe de un grupo que arranca en `c`.
 * `idxCant` queda en `null` en la variante sólo-Imp: la cantidad **no está en el
 * archivo** y no se infiere (D-065).
 */
function parDeColumnas(c, subs) {
  const sub = subs[c] || '';
  if (esCant(sub)) return { idxCant: c, idxImp: esImp(subs[c + 1] || '') ? c + 1 : null };
  if (esImp(sub))  return { idxCant: null, idxImp: c };
  return { idxCant: null, idxImp: null };
}

// ── Filas ────────────────────────────────────────────────────────────────────

/**
 * Una fila del archivo → una fila del lector.
 *
 * **Una columna que el archivo no trae no se emite como clave vacía**: se omite.
 * Así el control distingue "la columna no está en el archivo" (la clave no existe
 * → no se puede afirmar nada) de "la celda vino vacía" (la clave existe y vale
 * `null` → hay dato y dice que no hay). Es la diferencia entre informar "no sé si
 * se liquidó" y "no se liquidó": con una clave vacía siempre, las dos se leen
 * igual y una de las dos miente.
 */
function armarFila(fila, f, layout, { esTotalGeneral }) {
  const { colIdx, conceptos, totalizadores } = layout;
  const row = { fila: f + 1, esTotalGeneral };

  for (const [field, key] of Object.entries(ROW_KEYS)) {
    if (colIdx[field] === undefined) continue;
    const v = fila[colIdx[field]];
    row[key] = field === 'legajo' ? (esTotalGeneral ? null : texto(v))
      : FECHAS.has(field)         ? aIso(v)
      : field === 'cbu'           ? texto(v).replace(/\s+/g, '')   // 22 dígitos: texto, o se va a notación científica
      : texto(v);
  }

  for (const grupo of [...totalizadores, ...conceptos]) {
    // La celda vacía de un concepto es "no se liquidó", que no es cero: viaja
    // como `null`. La clave `cant_` sólo existe si el archivo trae la columna.
    if (grupo.idxCant !== null) row[grupo.keyCant] = toNum(fila[grupo.idxCant]);
    if (grupo.idxImp  !== null) row[grupo.keyImp]  = toNum(fila[grupo.idxImp]);
  }

  return row;
}

/** ¿La fila es el `TOTAL GENERAL`? Puede estar en cualquier columna, y con U+00A0. */
function esFilaTotalGeneral(fila, maxCol) {
  if (!Array.isArray(fila)) return false;
  for (let c = 0; c <= maxCol; c++) {
    if (hdrKey(fila[c]) === 'total general') return true;
  }
  return false;
}

function filaConAlgo(fila, maxCol) {
  if (!Array.isArray(fila)) return false;
  for (let c = 0; c <= maxCol; c++) if (texto(fila[c]) !== '') return true;
  return false;
}

/**
 * Los conceptos y totalizadores cuya suma leída no coincide con la fila
 * `TOTAL GENERAL` del propio archivo. Es la validación de que leímos bien: un
 * número mal pero coherente no lo detecta nadie (CLAUDE.md). Sale como aviso y no
 * como error — el export puede venir retocado a mano y el resto del archivo sigue
 * sirviendo (D-065); lo que no puede pasar es que no se note.
 */
function validarTotales(parsedRows, totalGeneral, conceptos, totalizadores) {
  if (!totalGeneral) return [];
  const fuera = [];
  for (const grupo of [...totalizadores, ...conceptos]) {
    for (const key of [grupo.keyCant, grupo.keyImp]) {
      const archivo = totalGeneral[key];
      if (!Number.isFinite(archivo)) continue;   // el TOTAL GENERAL no trae esa celda
      let sumado = 0;
      for (const row of parsedRows) sumado += row[key] ?? 0;
      const diferencia = sumado - archivo;
      if (Math.abs(diferencia) > TOL_TOTALES) {
        fuera.push({
          key, label: grupo.label,
          codigo: grupo.codigo ?? null,
          sumado: redondeo2(sumado), archivo: redondeo2(archivo), diferencia: redondeo2(diferencia),
        });
      }
    }
  }
  return fuera;
}

/**
 * El preámbulo: `EA: <empresa> | Usuario: … | Reporte: … | Periodo: MM/AAAA … | Tipo: …`.
 *
 * `Reporte:` es lo que distingue el "Resumen de Liquidacion" del "Consulta de
 * Liquidacion" y del "Totales de Concepto" — que es otro archivo, con otro lector
 * (`totalesConceptoParser.js`). Puede no haber preámbulo: en POP, Epiroc y
 * Geopagos los encabezados están en la fila 1 y entonces todo esto queda en `null`.
 */
function leerPreambulo(rows, filaEncabezado) {
  const crudo = rows.slice(0, filaEncabezado).flat().map(v => (v == null ? '' : String(v)))
    .filter(Boolean).join(' | ').replace(/\u00a0/g, ' ');
  const meta = extraerMetadata(crudo);
  const mReporte = crudo.match(/reporte:\s*([^|]+?)\s*(?:\||$)/i);
  return {
    reporte: mReporte ? mReporte[1].trim() : null,
    empresa: meta.empresa,
    periodo: meta.period,
    tipoLiquidacion: meta.tipoLiquidacion,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Clave de comparación de encabezados: sin acentos, sin espacios duros, minúscula. */
function hdrKey(v) {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
}

/** El texto de una celda, sin normalizar más que el espacio duro. Los legajos salen de acá: crudos. */
function texto(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
  return String(v).replace(/\u00a0/g, ' ').trim();
}

const esCant = s => /^cant\.?$/i.test(String(s).replace(/\u00a0/g, ' ').trim());
const esImp  = s => /^imp\.?$/i.test(String(s).replace(/\u00a0/g, ' ').trim());

function redondeo2(n) {
  return Math.round(n * 100) / 100;
}

/** Normaliza una fecha a 'YYYY-MM-DD' en UTC, o `null`. Acepta Date, serial de Excel y string. */
function aIso(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);

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

function letraCol(i) {
  return i === null || i === undefined || i < 0 ? '' : XLSX.utils.encode_col(i);
}

/** Muestra legible de una fila, para los mensajes de error. */
function muestraDeFila(fila, desde, hasta) {
  if (!Array.isArray(fila)) return '(fila vacía)';
  const vals = [];
  for (let c = desde; c <= hasta && vals.length < 8; c++) {
    const t = texto(fila[c]);
    if (t !== '') vals.push(`${letraCol(c)}="${t}"`);
  }
  return vals.length ? vals.join(', ') : '(fila vacía)';
}
