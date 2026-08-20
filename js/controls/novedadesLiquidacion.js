// Novedades vs Liquidación (N2 de specs/familia-novedades-axton.md, D-070).
//
// Cruza el importador de novedades del período —el mismo que se subió a Axton,
// idealmente el que generó y validó N1— contra lo que efectivamente se liquidó:
// el Tabulado de Axton del período más el reporte "Totales de Concepto". La
// unidad del cruce es legajo + código de concepto, y se comparan cantidad E
// importe cuando los dos lados los traen.
//
// Cuatro reglas que este control no puede romper:
//
// 1. Consolidar por legajo, los TRES lados, con la MISMA clave. El Tabulado
//    trae una fila por liquidación (un legajo hasta 3 veces en POP) y el
//    totalizador una fila por legajo × concepto × liquidación. Si se pisa en vez
//    de sumar, salen diferencias falsas en todo empleado con doble paga: es el
//    bug más caro del repo, arreglado cuatro veces (D-042). La clave la define
//    el cliente y se resuelve una vez por corrida (D-038).
// 2. `null` no es `0`. Una celda vacía del Tabulado no es un cero liquidado, y
//    una columna que el archivo no trae no es una cantidad de cero. La
//    diferencia se calcula sólo si los dos lados son distintos de `null`.
// 3. Lo no comparable no bloquea ni aprueba: se informa con su motivo (D-070).
//    Nada se convierte de horas a días ni al revés (D-065).
// 4. El código de concepto se matchea por CÓDIGO, nunca por rótulo: el criollo
//    cambia entre dos archivos del mismo cliente y del mismo mes (D-039/D-070).
//
// Lo que este control NO hace:
//
// - No arma el importador ni lo controla contra la planilla del cliente: eso es
//   N1 (`novedadesImportador.js`). Acá el importador es el punto de partida.
// - No convierte unidades. Una novedad en horas contra una liquidación en días
//   sale como "no comparable" con el motivo escrito (D-065).
// - No recorre la liquidación entera: el universo del cruce son los conceptos
//   que trajo el importador. El sueldo básico, los aportes y las
//   contribuciones no son novedades, y meterlos daría miles de "sin
//   contraparte" falsas que entierran las que importan.
// - No infiere la cantidad a partir del importe cuando el Tabulado viene sólo
//   con importes: informa que no se pudo comparar.

import { groupRowsByLegajo, sumColumn, lastRow } from './consolidate.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { isDiff } from './tolerance.js';
import { diffStats } from './semaforo.js';
import { renderResumenDetalle, renderVerdict, renderTiles, renderIssues, renderChecks }
  from '../ui/resultBlocks.js';
import { createResultsToolbar, wireTableTools } from '../ui/tableTools.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { periodSuffix } from '../utils/dates.js';

/**
 * Config por cliente del control. Devuelve una copia nueva: el editor la muta
 * en el lugar.
 */
export const DEFAULT_NOV_LIQ_CONFIG = () => ({
  // Códigos de concepto que NO se comparan porque la novedad y la liquidación
  // están en unidades distintas (la novedad en horas, el Tabulado en días).
  // Salen como "no comparable" con el motivo declarado — nunca se convierte
  // (D-065).
  conceptosNoComparables: [],
  // Códigos de novedad que por diseño no llegan a la liquidación del mes
  // (informativos, provisiones que el cliente carga para su propio control).
  // Salen como "sin contraparte, esperado" y no cuentan al semáforo.
  conceptosSinLiquidacion: [],
});

// La cantidad no es plata: el monto de diferencia del cliente está en pesos, y
// con $ 100 tres horas de más desaparecerían detrás del umbral. El importe sí
// se mide con `isDiff()`, o sea con el monto que puso el analista (D-069).
const CANTIDAD_EPS = 0.01;

const BANDA_LABEL = {
  coincide:        'Coincide',
  difiere:         'Con diferencia',
  no_comparable:   'No comparable',
  sin_contraparte: 'Sin contraparte',
};

export const MOTIVO_LABEL = {
  // No comparable
  unidad_distinta_declarada:                'la novedad y la liquidación están en unidades distintas (marcado en el Paso 2)',
  novedad_en_cantidad_y_tabulado_sin_cantidades: 'la novedad vino en cantidad y el Tabulado no trae columnas de cantidad',
  liquidacion_sin_cantidad:                 'la novedad trae cantidad y la liquidación no informa cantidad para este concepto',
  liquidacion_sin_importe:                  'la novedad trae importe y la liquidación no informa importe para este concepto',
  sin_dimension_en_comun:                   'no hay una misma medida en los dos lados para comparar',
  // Sin contraparte
  sin_liquidacion_esperada:                 'marcado en el Paso 2 como concepto que no llega a la liquidación',
  legajo_sin_liquidacion:                   'el legajo no aparece en el Tabulado ni en el totalizador del período',
  // No dice "se liquidó en otros legajos": que el Tabulado traiga la columna no
  // prueba que alguien lo haya liquidado, y el control no lo chequea.
  no_liquidado:                             'el Tabulado trae columna para este concepto y este legajo no tiene valor: no se liquidó',
  tabulado_sin_columna_no_liquidado:        'el Tabulado no trae columna para este concepto y el totalizador tampoco lo tiene: no se liquidó',
  no_determinable_sin_totalizador:          'el Tabulado no trae columna para este concepto y sin el totalizador no se puede saber si se liquidó',
  liquidado_sin_novedad:                    'se liquidó y no hay novedad cargada para este concepto',
};

// La misma razón en corto, para la celda de la tabla: la frase larga de arriba no
// entra en una columna y se lee cortada. La larga queda en el Resumen, que es
// donde el analista lee el caso completo.
const MOTIVO_CORTO = {
  unidad_distinta_declarada:                'unidades distintas',
  novedad_en_cantidad_y_tabulado_sin_cantidades: 'Tabulado sin cantidades',
  liquidacion_sin_cantidad:                 'liquidación sin cantidad',
  liquidacion_sin_importe:                  'liquidación sin importe',
  sin_dimension_en_comun:                   'sin medida en común',
  sin_liquidacion_esperada:                 'esperado: no llega a la liquidación',
  legajo_sin_liquidacion:                   'legajo sin liquidación en el mes',
  no_liquidado:                             'no se liquidó',
  tabulado_sin_columna_no_liquidado:        'no se liquidó (ni en el totalizador)',
  no_determinable_sin_totalizador:          'falta el totalizador para saberlo',
  liquidado_sin_novedad:                    'liquidado sin novedad',
};

// ── Helpers de cálculo ───────────────────────────────────────────────────────

/** Suma que respeta `null`: si ninguna fila trajo dato, el total es `null`, no `0`. */
function sumaNullable(valores) {
  let total = null;
  for (const v of valores) {
    if (v === null || v === undefined) continue;
    total = (total ?? 0) + v;
  }
  return total;
}

/**
 * Clave con la que se cruza un código de concepto entre los tres archivos. El
 * ExpNov emite `'1000'` desde una celda numérica y `'0100'` desde una de texto;
 * el Tabulado emite el grupo de dígitos del encabezado tal cual. Sin
 * normalizar, un concepto entero cae en "sin contraparte" de un lado y en
 * "liquidado sin novedad" del otro: dos bandas llenas y ninguna diferencia
 * real. Los ceros a la izquierda se sacan sólo si el código es enteramente
 * numérico, igual criterio que la clave de legajo (D-038).
 */
export function claveConcepto(codigo) {
  const s = String(codigo ?? '').replace(/\u00a0/g, ' ').trim();
  if (!s) return '';
  // Los ceros se sacan con regex y no con Number(): un código largo perdería
  // precisión al pasar por float.
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s.toUpperCase();
}

// Un solo formateador para toda la pantalla. `toLocaleString` con opciones
// construye uno nuevo en cada llamada, y la tabla del Detalle tiene seis celdas
// numéricas por fila: medido sobre una nómina de 900 legajos, eso son 5,7
// segundos de navegador congelado contra 0,13 reusando el formateador.
const NUM_FMT = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Número para pantalla; `'—'` cuando no hay dato (que no es cero). */
function fmtNum(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return NUM_FMT.format(v);
}

// ── El cruce ─────────────────────────────────────────────────────────────────

/**
 * `primaryRows` son las novedades del importador (una fila por celda cargada,
 * las emite `parseExpNov`). El Tabulado de Axton y el totalizador llegan por
 * `mapping`, como todo archivo adicional: el wizard aplana `<key>Rows` y
 * `<key>Meta` por cada uno.
 */
export function runNovedadesLiquidacion(novRows, _tabRows, mapping = {}) {
  const cfg = { ...DEFAULT_NOV_LIQ_CONFIG(), ...(mapping.novLiqConfig || {}) };

  // La clave de legajo es del cliente y va IGUAL a los tres lados del cruce
  // (D-038/D-042). Una sola vez por corrida.
  const keyFn = makeLegajoKey(mapping.legajoKeyMode);

  const novMeta = mapping.importadorMeta || {};
  const tabMeta = mapping.tabAxtonMeta || {};
  const tabRows = mapping.tabAxtonRows || [];
  const totRows = mapping.totalizadorRows || null;
  const totMeta = mapping.totalizadorMeta || null;
  const totalizadorCargado = Array.isArray(totRows) && totRows.length > 0;

  const novedades = Array.isArray(novRows) ? novRows : [];
  const avisosControl = [];

  // ── Cortes tempranos: mensaje para el analista, no una excepción ───────────
  if (!novedades.length) {
    return {
      error: 'El importador de novedades no trae ninguna novedad cargada: todas las celdas de '
        + 'concepto están vacías, o ninguna columna tiene código de concepto. Revisá que el archivo '
        + 'sea el importador del período.',
    };
  }
  if (!tabRows.length) {
    return {
      error: 'El Tabulado de Axton no trae ninguna liquidación: no hay con qué comparar las '
        + 'novedades. Revisá que el archivo sea el Tabulado del mismo período.',
    };
  }

  // ── Lado 1: el importador ─────────────────────────────────────────────────
  const nombrePorLegajo = new Map();
  for (const e of (novMeta.empleados || [])) {
    const k = keyFn(e.legajo);
    if (k && !nombrePorLegajo.has(k)) nombrePorLegajo.set(k, e.apellidoNombre || '');
  }

  // Rótulo en criollo por código, para que la tabla se lea. Es sólo pantalla:
  // el cruce nunca mira el rótulo.
  const rotuloPorClave = new Map();
  for (const c of (novMeta.columnas || [])) {
    const k = claveConcepto(c.codigo);
    if (k && c.rotulo && !rotuloPorClave.has(k)) rotuloPorClave.set(k, c.rotulo);
  }

  const nov = new Map();               // clave legajo → Map(claveConcepto → valores)
  const literalPorClave = new Map();   // clave legajo → legajo tal como lo escribió el cliente
  const literalConceptoPorClave = new Map();
  const legajosEscritosDeVariasFormas = [];

  for (const [clave, group] of groupRowsByLegajo(novedades, 'legajo', { keyFn })) {
    const literales = [...new Set(group.map(r => String(r.legajo)))];
    if (literales.length > 1) {
      legajosEscritosDeVariasFormas.push({ clave, literales });
    }
    literalPorClave.set(clave, literales[0]);

    const porConcepto = new Map();
    for (const r of group) {
      const k = claveConcepto(r.codigo);
      if (!k) continue;
      if (!literalConceptoPorClave.has(k)) literalConceptoPorClave.set(k, String(r.codigo));
      if (!porConcepto.has(k)) porConcepto.set(k, { cantidad: null, importe: null, unidadDeclarada: null, celdas: 0, literales: new Set() });
      const acc = porConcepto.get(k);
      acc.cantidad = sumaNullable([acc.cantidad, r.cantidad]);
      acc.importe = sumaNullable([acc.importe, r.importe]);
      acc.unidadDeclarada = r.unidadDeclarada || acc.unidadDeclarada;
      acc.celdas += 1;
      acc.literales.add(String(r.codigo));
    }
    nov.set(clave, porConcepto);
  }

  // Dos códigos escritos distinto que colapsan en la misma clave dentro del
  // mismo archivo: se cruzan juntos y se avisa (no se calla, no se traba).
  const colapsados = new Set();
  for (const porConcepto of nov.values()) {
    for (const [k, v] of porConcepto) {
      if (v.literales.size > 1) colapsados.add(`${k}: ${[...v.literales].join(', ')}`);
    }
  }
  if (colapsados.size) {
    avisosControl.push(
      `En el importador, ${colapsados.size} código${colapsados.size === 1 ? '' : 's'} de concepto `
      + `aparece${colapsados.size === 1 ? '' : 'n'} escrito de más de una forma y se cruzó como uno solo `
      + `(${[...colapsados].slice(0, 5).join(' · ')}${colapsados.size > 5 ? ' …' : ''}).`
    );
  }
  if (legajosEscritosDeVariasFormas.length) {
    avisosControl.push(
      `${legajosEscritosDeVariasFormas.length} legajo${legajosEscritosDeVariasFormas.length === 1 ? '' : 's'} `
      + 'del importador está escrito de más de una forma y se consolidó como uno solo '
      + `(${legajosEscritosDeVariasFormas.slice(0, 5).map(l => l.literales.map(x => `"${x}"`).join(' / ')).join(' · ')}`
      + `${legajosEscritosDeVariasFormas.length > 5 ? ' …' : ''}).`
    );
  }

  // El universo del cruce: los conceptos del importador. Ver el comentario de
  // cabecera — recorrer la liquidación entera daría miles de filas falsas.
  const universo = [];
  const universoSet = new Set();
  for (const porConcepto of nov.values()) {
    for (const k of porConcepto.keys()) {
      if (!universoSet.has(k)) { universoSet.add(k); universo.push(k); }
    }
  }

  // ── Lado 2: el Tabulado de Axton ──────────────────────────────────────────
  // Un código repetido en dos columnas viaja como `<codigo>__2`: hay que sumar
  // TODAS las columnas del mismo código base o el importe liquidado sale corto
  // y toda la nómina difiere por el mismo delta.
  const cantidadesEnTabulado = tabMeta.cantidadesDisponibles === true;
  const colsPorConcepto = new Map();   // claveConcepto → { cant: [], imp: [], nombre }
  for (const c of (tabMeta.conceptos || [])) {
    const k = claveConcepto(c.codigoBase ?? c.codigo);
    if (!k) continue;
    if (!colsPorConcepto.has(k)) colsPorConcepto.set(k, { cant: [], imp: [], nombre: c.nombre || '' });
    const entry = colsPorConcepto.get(k);
    if (c.keyImp) entry.imp.push(c.keyImp);
    // Las columnas de cantidad se cargan sólo si el archivo las trae: en la
    // variante sólo-Imp la metadata igual publica el `keyCant` que tendría,
    // pero ninguna fila la tiene (D-065).
    if (cantidadesEnTabulado && c.keyCant) entry.cant.push(c.keyCant);
  }

  const tabPorLegajo = groupRowsByLegajo(tabRows, 'legajo', { keyFn });

  /** Suma la dimensión de un concepto para un legajo, sobre TODAS sus columnas. */
  function tabValor(clave, k, dim) {
    const group = tabPorLegajo.get(clave);
    if (!group) return null;
    const cols = colsPorConcepto.get(k);
    if (!cols) return null;
    let total = null;
    for (const col of cols[dim]) total = sumaNullable([total, sumColumn(group, col)]);
    return total;
  }

  // ── Lado 3: el totalizador ────────────────────────────────────────────────
  const cantidadesEnTotalizador = totalizadorCargado && totMeta?.cantidadDisponible === true;
  const tot = new Map();   // clave legajo → Map(claveConcepto → { cantidad, importe, filas })
  if (totalizadorCargado) {
    for (const [clave, group] of groupRowsByLegajo(totRows, 'legajo', { keyFn })) {
      const porConcepto = new Map();
      // El legajo tal como lo escribió el cliente, para la fila que sólo existe
      // en el totalizador. Va como propiedad del Map y no como una entrada más,
      // así no se confunde con un código de concepto.
      porConcepto.literalLegajo = String(group[0]?.legajo ?? clave);
      for (const r of group) {
        const k = claveConcepto(r.codigo);
        if (!k) continue;
        if (!porConcepto.has(k)) porConcepto.set(k, { cantidad: null, importe: null, filas: 0 });
        const acc = porConcepto.get(k);
        acc.importe = sumaNullable([acc.importe, r.importe]);
        // La clave `cantidad` no existe en la fila cuando el reporte no trae la
        // columna: no es 0 y no es null, la clave no está.
        if (cantidadesEnTotalizador) acc.cantidad = sumaNullable([acc.cantidad, r.cantidad ?? null]);
        acc.filas += 1;
      }
      tot.set(clave, porConcepto);
    }
  }

  // ── Los legajos del cruce ─────────────────────────────────────────────────
  // Los del importador, más los que aparecen liquidados con algún concepto del
  // universo sin tener novedad cargada (la banda "liquidado sin novedad").
  const legajos = [...nov.keys()];
  const enNov = new Set(legajos);
  for (const [clave, group] of tabPorLegajo) {
    if (enNov.has(clave)) continue;
    const tieneAlgo = universo.some(k => tabValor(clave, k, 'imp') !== null || tabValor(clave, k, 'cant') !== null);
    if (!tieneAlgo) continue;
    legajos.push(clave);
    enNov.add(clave);
    // El legajo tal como lo escribió el cliente y su nombre salen del Tabulado:
    // sin esto, la fila "liquidado sin novedad" sale con la clave normalizada
    // —sin los ceros a la izquierda— y sin nombre, y el analista no la encuentra
    // filtrando por el número que tiene en su archivo.
    const ficha = lastRow(group);
    if (ficha) {
      literalPorClave.set(clave, String(ficha.legajo ?? clave));
      if (ficha.apellido_nombre) nombrePorLegajo.set(clave, ficha.apellido_nombre);
    }
  }
  for (const [clave, porConcepto] of tot) {
    if (enNov.has(clave)) continue;
    const tieneAlgo = universo.some(k => porConcepto.has(k));
    if (!tieneAlgo) continue;
    legajos.push(clave);
    enNov.add(clave);
    if (!literalPorClave.has(clave)) literalPorClave.set(clave, porConcepto.literalLegajo || clave);
  }

  const noComparablesCfg = new Set((cfg.conceptosNoComparables || []).map(claveConcepto).filter(Boolean));
  const sinLiquidacionCfg = new Set((cfg.conceptosSinLiquidacion || []).map(claveConcepto).filter(Boolean));

  // ── El cruce, par por par ─────────────────────────────────────────────────
  const filas = [];
  const legajosConDif = new Set();
  const legajosNoComparables = new Set();
  const legajosConCruce = new Set();
  const legajosComparados = new Set();   // el legajo tuvo al menos un par realmente comparado
  const legajosConAlgoSinResolver = new Set();   // …y al menos un par que no se pudo comparar y no era esperado

  for (const clave of legajos) {
    const delNov = nov.get(clave);
    const delTot = tot.get(clave);
    const legajoEnLiquidacion = tabPorLegajo.has(clave) || (delTot !== undefined);

    for (const k of universo) {
      const n = delNov?.get(k) || null;
      const hayNov = !!n && (n.cantidad !== null || n.importe !== null);

      const tabCant = tabValor(clave, k, 'cant');
      const tabImp = tabValor(clave, k, 'imp');
      const t = delTot?.get(k) || null;
      const totCant = t ? (t.cantidad ?? null) : null;
      const totImp = t ? (t.importe ?? null) : null;

      // Precedencia por dimensión: el Tabulado primero, el totalizador después.
      // Se mira `!== null` y no truthiness: un cero explícito del Tabulado ES
      // dato y gana.
      const liqCant = tabCant !== null ? { v: tabCant, origen: 'tabulado' }
        : totCant !== null ? { v: totCant, origen: 'totalizador' }
          : { v: null, origen: null };
      const liqImp = tabImp !== null ? { v: tabImp, origen: 'tabulado' }
        : totImp !== null ? { v: totImp, origen: 'totalizador' }
          : { v: null, origen: null };
      const hayLiq = liqCant.v !== null || liqImp.v !== null;

      if (!hayNov && !hayLiq) continue;   // el par no existe: no se emite fila

      const fila = {
        legajo: literalPorClave.get(clave) || clave,
        clave,
        nombre: nombrePorLegajo.get(clave) || '',
        codigo: literalConceptoPorClave.get(k) || k,
        claveConcepto: k,
        rotulo: rotuloPorClave.get(k) || colsPorConcepto.get(k)?.nombre || '',
        novCantidad: n ? n.cantidad : null,
        novImporte: n ? n.importe : null,
        novUnidadDeclarada: n ? n.unidadDeclarada : null,
        novCeldas: n ? n.celdas : 0,
        liqCantidad: liqCant.v,
        liqCantidadOrigen: liqCant.origen,
        liqImporte: liqImp.v,
        liqImporteOrigen: liqImp.origen,
        tabLiquidaciones: tabPorLegajo.get(clave)?.length || 0,
        totFilas: t ? t.filas : 0,
        difCantidad: null,
        difImporte: null,
        banda: null,
        motivo: null,
        lado: null,
        parcial: false,
      };
      legajosConCruce.add(clave);

      if (hayNov && !hayLiq) {
        fila.banda = 'sin_contraparte';
        fila.lado = 'solo_novedad';
        fila.motivo = sinLiquidacionCfg.has(k) ? 'sin_liquidacion_esperada'
          : !legajoEnLiquidacion ? 'legajo_sin_liquidacion'
            : colsPorConcepto.has(k) ? 'no_liquidado'
              : totalizadorCargado ? 'tabulado_sin_columna_no_liquidado'
                : 'no_determinable_sin_totalizador';
        if (fila.motivo !== 'sin_liquidacion_esperada') {
          legajosConDif.add(clave);
          legajosConAlgoSinResolver.add(clave);
        }
        filas.push(fila);
        continue;
      }

      if (!hayNov && hayLiq) {
        fila.banda = 'sin_contraparte';
        fila.lado = 'solo_liquidacion';
        fila.motivo = 'liquidado_sin_novedad';
        legajosConDif.add(clave);
        legajosConAlgoSinResolver.add(clave);
        filas.push(fila);
        continue;
      }

      // Los dos lados traen algo. ¿Se pueden comparar?
      if (noComparablesCfg.has(k)) {
        fila.banda = 'no_comparable';
        fila.motivo = 'unidad_distinta_declarada';
        legajosNoComparables.add(clave);
        legajosConAlgoSinResolver.add(clave);
        filas.push(fila);
        continue;
      }

      const comparaCantidad = n.cantidad !== null && liqCant.v !== null;
      const comparaImporte = n.importe !== null && liqImp.v !== null;

      if (!comparaCantidad && !comparaImporte) {
        fila.banda = 'no_comparable';
        fila.motivo = (n.importe === null && !cantidadesEnTabulado && !cantidadesEnTotalizador)
          ? 'novedad_en_cantidad_y_tabulado_sin_cantidades'
          : (n.cantidad !== null && liqCant.v === null) ? 'liquidacion_sin_cantidad'
            : (n.importe !== null && liqImp.v === null) ? 'liquidacion_sin_importe'
              : 'sin_dimension_en_comun';
        legajosNoComparables.add(clave);
        legajosConAlgoSinResolver.add(clave);
        filas.push(fila);
        continue;
      }

      if (comparaCantidad) fila.difCantidad = n.cantidad - liqCant.v;
      if (comparaImporte) fila.difImporte = n.importe - liqImp.v;

      // El importe mide con el monto de diferencia del cliente (D-069); la
      // cantidad, al centésimo, porque no es plata.
      const difiereImporte = fila.difImporte !== null && isDiff(fila.difImporte);
      const difiereCantidad = fila.difCantidad !== null && Math.abs(fila.difCantidad) > CANTIDAD_EPS;
      fila.banda = (difiereImporte || difiereCantidad) ? 'difiere' : 'coincide';
      // Comparado por una sola medida existiendo la otra de un solo lado: no es
      // una aprobación completa, y la pantalla lo dice.
      fila.parcial = (comparaCantidad !== comparaImporte)
        && ((n.cantidad !== null) !== (liqCant.v !== null) || (n.importe !== null) !== (liqImp.v !== null));
      if (fila.banda === 'difiere') legajosConDif.add(clave);
      legajosComparados.add(clave);
      filas.push(fila);
    }
  }

  // Un legajo del que no se pudo comparar NADA no está aprobado: entra al
  // numerador del semáforo aunque no tenga ninguna diferencia. Verde ahí sería
  // decir "está bien" sobre algo que nunca se miró.
  //
  // Excepción: el legajo cuyas novedades son TODAS conceptos que el analista
  // declaró como "no llega a la liquidación". Ahí no hay nada que comparar por
  // decisión suya, no por un hueco del archivo, y meterlo al numerador pintaría
  // rojo toda la nómina por una columna informativa.
  const legajosSoloEsperados = new Set();
  for (const clave of legajosConCruce) {
    if (!legajosConAlgoSinResolver.has(clave)) legajosSoloEsperados.add(clave);
  }
  const legajosSinNadaComparado = [];
  for (const clave of legajosConCruce) {
    if (legajosComparados.has(clave)) continue;
    if (legajosSoloEsperados.has(clave)) continue;
    legajosSinNadaComparado.push(clave);
  }

  // ── Lo que no entró al cruce, con nombre ──────────────────────────────────
  const columnasSinCodigo = (novMeta.columnasSinCodigo || [])
    .filter(c => (c.celdasCargadas || 0) > 0)
    .map(c => ({ letra: c.letra, rotulo: c.rotulo || '', celdas: c.celdasCargadas || 0 }));
  const celdasSinCodigoTotal = columnasSinCodigo.reduce((a, c) => a + c.celdas, 0);

  // Conceptos del importador sin columna propia en el Tabulado: el universo del
  // motivo "el Tabulado no lo muestra". Con el totalizador cargado se puede
  // decir si igual se liquidaron.
  const conceptosSinColumnaEnTabulado = universo
    .filter(k => !colsPorConcepto.has(k))
    .map((k) => {
      let liquidado = null;
      if (totalizadorCargado) {
        liquidado = [...tot.values()].some(porConcepto => porConcepto.has(k));
      }
      return {
        codigo: literalConceptoPorClave.get(k) || k,
        rotulo: rotuloPorClave.get(k) || '',
        liquidadoEnTotalizador: liquidado,
      };
    });

  if (conceptosSinColumnaEnTabulado.length && !totalizadorCargado) {
    avisosControl.push(
      `${conceptosSinColumnaEnTabulado.length} concepto${conceptosSinColumnaEnTabulado.length === 1 ? '' : 's'} `
      + `del importador no tiene${conceptosSinColumnaEnTabulado.length === 1 ? '' : 'n'} columna propia en el Tabulado. `
      + 'Sin el reporte de Totales de Concepto no se puede saber si se liquidaron o si el Tabulado no los muestra.'
    );
  }

  const conceptosCruzados = new Set(filas.map(f => f.claveConcepto)).size;
  const difiere = filas.filter(f => f.banda === 'difiere');
  const stats = diffStats(difiere, [{ key: 'difImporte', get: f => f.difImporte }],
    (f) => `Legajo ${f.legajo} — concepto ${f.codigo}`);

  const cuenta = { coincide: 0, difiere: 0, no_comparable: 0, sin_contraparte: 0 };
  for (const f of filas) cuenta[f.banda] += 1;

  // El período que declara cada archivo. El importador nunca lo declara (la
  // fecha de su fila 1 puede ser la de la plantilla original), así que el
  // período lo pone el analista en el selector de la app.
  const periodoTabulado = tabMeta.periodo || null;
  const periodoTotalizador = totMeta?.periodo || null;

  const legajosParaRevisar = new Set([...legajosConDif, ...legajosSinNadaComparado]);

  return {
    period: mapping.period || '',
    periodoTabulado,
    periodoTotalizador,
    empresa: novMeta.empresa || tabMeta.empresa || null,
    unidadOrganizativa: novMeta.unidadOrganizativa || null,
    sheetNameImportador: novMeta.sheetName || null,
    sheetNameTabulado: tabMeta.sheetName || null,
    formatoTabulado: tabMeta.formato || null,

    cantidadesEnTabulado,
    cantidadesEnTotalizador,
    totalizadorCargado,
    conceptosSinColumnaEnTabulado,

    filas,
    columnasSinCodigo,
    celdasSinCodigoTotal,
    noParseables: (novMeta.noParseables || []).map(n => ({
      fila: n.fila, letraCol: n.letraCol, codigo: n.codigo, texto: n.texto, motivo: n.motivo,
    })),
    filasSinLegajoImportador: novMeta.filasSinLegajo || [],
    legajosEscritosDeVariasFormas,
    legajosSinNadaComparado,
    totalesQueNoCierran: tabMeta.totalesQueNoCierran || [],

    avisos: [
      ...(novMeta.avisos || []).map(a => `Importador: ${a}`),
      ...(tabMeta.avisos || []).map(a => `Tabulado: ${a}`),
      ...((totMeta?.avisos || []).map(a => `Totales de Concepto: ${a}`)),
      ...avisosControl,
    ],

    summary: {
      legajos: legajosConCruce.size,
      pares: filas.length,
      coincide: cuenta.coincide,
      difiere: cuenta.difiere,
      noComparable: cuenta.no_comparable,
      sinContraparte: cuenta.sin_contraparte,
      soloEnImportador: filas.filter(x => x.lado === 'solo_novedad').length,
      soloEnLiquidacion: filas.filter(x => x.lado === 'solo_liquidacion').length,
      paresComparados: cuenta.coincide + cuenta.difiere,
      parciales: filas.filter(f => f.parcial).length,
      legajosConDiferencia: legajosConDif.size,
      legajosSinNadaComparado: legajosSinNadaComparado.length,
      legajosParaRevisar: legajosParaRevisar.size,
      legajosNoComparables: legajosNoComparables.size,
      conceptosImportador: universo.length,
      conceptosCruzados,
      conceptosSinColumnaEnTabulado: conceptosSinColumnaEnTabulado.length,
      columnasSinCodigo: columnasSinCodigo.length,
      celdasSinCodigo: celdasSinCodigoTotal,
      difImporteTotal: stats.diffTotalAmount,
      difCantidadTotal: difiere.reduce((a, f) => a + Math.abs(f.difCantidad ?? 0), 0),
      cantidadesEnTabulado,
      totalizadorCargado,
      periodosCoinciden: periodosCoinciden(mapping.period || '', periodoTabulado, periodoTotalizador),
      worstCase: stats.worstCase,
    },
  };
}

/**
 * Los tres archivos tienen que ser del mismo mes: cruzar el Tabulado de julio
 * contra el importador de agosto da un resultado entero coherente y entero
 * equivocado. El importador no declara período (D-070), así que se comparan el
 * del selector con los que sí lo declaran.
 */
function periodosCoinciden(periodApp, periodoTabulado, periodoTotalizador) {
  const declarados = [periodoTabulado, periodoTotalizador].filter(Boolean);
  if (!declarados.length) return null;          // ningún archivo lo declara: no se puede chequear
  if (declarados.some(p => p !== declarados[0])) return false;
  if (!periodApp) return null;
  return declarados[0] === periodApp;
}

// ── Resumen para la tarjeta colapsada y el semáforo ──────────────────────────

export function summarizeNovedadesLiquidacion(results) {
  if (results?.error) {
    // 'error' y no 'warning': es lo único que cortocircuita el semáforo y hace
    // que las cuatro pantallas pinten el control en rojo con el texto del error.
    // Con 'warning' + unitsTotal null la tarjeta sale neutra y la corrida se lee
    // "1/1 controles en verde", mientras el checklist lo pinta rojo — el mismo
    // control de dos colores según dónde se lo mire.
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null,
      diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const s = results.summary;
  const insights = [];
  if (s.difiere > 0) insights.push({ type: 'warning', label: 'novedades con diferencia', value: s.difiere });
  if (s.sinContraparte > 0) insights.push({ type: 'warning', label: 'novedades sin contraparte', value: s.sinContraparte });
  if (s.noComparable > 0) insights.push({ type: 'info', label: 'novedades no comparables', value: s.noComparable });
  if (s.columnasSinCodigo > 0) insights.push({ type: 'warning', label: 'columnas sin código de concepto', value: s.columnasSinCodigo });
  if (s.conceptosSinColumnaEnTabulado > 0) insights.push({ type: 'info', label: 'conceptos sin columna en el Tabulado', value: s.conceptosSinColumnaEnTabulado });
  if (s.parciales > 0) insights.push({ type: 'info', label: 'comparadas por una sola medida', value: s.parciales });

  // La unidad es el legajo (nunca la fila del cruce, que es legajo × concepto e
  // inflaría el denominador diez veces). Al numerador entran los legajos con
  // diferencia o sin contraparte, MÁS los legajos de los que no se pudo
  // comparar nada: no tener con qué comparar no es aprobar (D-070).
  const unitsTotal = s.legajos;
  const unitsWithDiff = s.legajosParaRevisar;

  const limpio = unitsWithDiff === 0 && s.columnasSinCodigo === 0 && s.periodosCoinciden !== false;

  return {
    status: limpio ? 'success' : 'warning',
    headline: `${s.legajos} legajo${s.legajos === 1 ? '' : 's'} · ${s.pares} novedad${s.pares === 1 ? '' : 'es'} cruzada${s.pares === 1 ? '' : 's'} `
      + `· ${s.difiere} con diferencia`,
    insights,
    unit: 'legajo',
    unitsTotal,
    unitsWithDiff,
    diffTotalAmount: s.difImporteTotal,
    worstCase: s.worstCase,
    contextNote: `se comparó ${s.paresComparados} de ${s.pares} novedades`
      + (s.noComparable > 0 ? `: ${s.noComparable} no comparables` : '')
      + (s.sinContraparte > 0 ? `${s.noComparable > 0 ? ' y' : ':'} ${s.sinContraparte} sin contraparte` : ''),
  };
}

// ── Pantalla ─────────────────────────────────────────────────────────────────

export function renderNovedadesLiquidacionResults(results, container) {
  container.innerHTML = '';

  if (results?.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }

  renderResumenDetalle(container, {
    controlId: 'novedades_liquidacion',
    resumen: (panel) => renderResumen(results, panel),
    detalle: (panel) => renderDetalle(results, panel),
  });
}

function renderResumen(results, panel) {
  const s = results.summary;

  const tone = (s.difiere > 0 || s.sinContraparte > 0 || s.columnasSinCodigo > 0 || s.periodosCoinciden === false)
    ? 'warn'
    : (s.legajosSinNadaComparado > 0 ? 'warn' : 'ok');

  renderVerdict(panel, {
    tone,
    title: s.difiere === 0 && s.sinContraparte === 0
      ? `Las ${s.paresComparados} novedades comparadas coinciden con la liquidación`
      : `${s.difiere} novedad${s.difiere === 1 ? '' : 'es'} con diferencia y ${s.sinContraparte} sin contraparte`,
    body: `De las ${s.pares} novedades del importador que entraron al cruce se comparó ${s.paresComparados}. `
      + (s.noComparable > 0
        ? `${s.noComparable} no se pudieron comparar y salen listadas con el motivo: no bloquean el control, pero tampoco lo aprueban. `
        : '')
      + (s.legajosSinNadaComparado > 0
        ? `De ${s.legajosSinNadaComparado} legajo${s.legajosSinNadaComparado === 1 ? '' : 's'} no se pudo comparar nada, así que quedan para revisar. `
        : '')
      + (!results.totalizadorCargado
        ? 'Sin el reporte de Totales de Concepto, "sin contraparte" no distingue entre no liquidado y no mostrado por el Tabulado.'
        : ''),
  });

  renderTiles(panel, [
    { label: 'Legajos cruzados', value: String(s.legajos),
      sub: `${s.conceptosCruzados} conceptos · ${s.legajosParaRevisar} para revisar` },
    { label: 'Coinciden', value: String(s.coincide), sub: s.parciales > 0 ? `${s.parciales} por una sola medida` : 'cantidad e importe' },
    { label: 'Con diferencia', value: String(s.difiere), tone: s.difiere > 0 ? 'error' : undefined,
      sub: s.difImporteTotal ? `$ ${fmtNum(s.difImporteTotal)} en total` : 'sin diferencia de importe' },
    { label: 'No comparables', value: String(s.noComparable), tone: s.noComparable > 0 ? 'warn' : undefined,
      sub: results.cantidadesEnTabulado ? 'por unidad o por medida ausente' : 'el Tabulado vino sólo con importes' },
    { label: 'Sin contraparte', value: String(s.sinContraparte), tone: s.sinContraparte > 0 ? 'warn' : undefined,
      sub: `${s.soloEnImportador} pedida${s.soloEnImportador === 1 ? '' : 's'} y no liquidada${s.soloEnImportador === 1 ? '' : 's'}`
        + ` · ${s.soloEnLiquidacion} liquidada${s.soloEnLiquidacion === 1 ? '' : 's'} sin novedad` },
  ]);

  // Las columnas sin código van SIEMPRE en su propia sección: son novedades
  // enteras que no entraron al cruce (D-070).
  if (results.columnasSinCodigo.length) {
    renderIssues(panel, {
      heading: 'Columnas del importador sin código de concepto',
      items: results.columnasSinCodigo.map(c => ({
        sev: 'hi',
        who: c.rotulo ? c.rotulo : `Columna ${c.letra}`,
        sub: `columna ${c.letra}`,
        what: `${c.celdas} celda${c.celdas === 1 ? '' : 's'} con datos que no entraron al cruce`,
        why: 'sin código de concepto no hay contra qué cruzarla. Resolvela en el importador o en el Paso 2 del generador.',
      })),
    });
  }

  if (s.difiere > 0) {
    renderIssues(panel, {
      heading: 'Novedades que no coinciden con la liquidación',
      // El concepto va en `what` y no en `sub`: cuando un legajo tiene dos
      // novedades, renderIssues las agrupa por `who` y descarta el `sub` — y en
      // un control cuya unidad es legajo + concepto, quedarse sin el concepto
      // deja dos renglones de importes sin decir de qué son.
      items: results.filas.filter(f => f.banda === 'difiere').slice(0, 50).map(f => ({
        who: `Legajo ${f.legajo}${f.nombre ? ` — ${f.nombre}` : ''}`,
        what: `concepto ${f.codigo}${f.rotulo ? ` — ${f.rotulo}` : ''} · `
          + `novedad: cantidad ${fmtNum(f.novCantidad)} / importe ${fmtNum(f.novImporte)} · `
          + `liquidado: cantidad ${fmtNum(f.liqCantidad)} / importe ${fmtNum(f.liqImporte)}`,
        why: origenDetalle(f),
      })),
    });
  }

  const sinContraparte = results.filas.filter(f => f.banda === 'sin_contraparte');
  if (sinContraparte.length) {
    renderIssues(panel, {
      heading: 'Novedades sin contraparte',
      items: sinContraparte.slice(0, 50).map(f => ({
        sev: f.motivo === 'sin_liquidacion_esperada' ? 'minor' : (f.lado === 'solo_novedad' ? 'hi' : undefined),
        who: `Legajo ${f.legajo}${f.nombre ? ` — ${f.nombre}` : ''}`,
        what: `concepto ${f.codigo}${f.rotulo ? ` — ${f.rotulo}` : ''} · `
          + (f.lado === 'solo_novedad'
            ? `se pidió liquidar (cantidad ${fmtNum(f.novCantidad)} / importe ${fmtNum(f.novImporte)}) y no aparece en la liquidación`
            : `está liquidado (cantidad ${fmtNum(f.liqCantidad)} / importe ${fmtNum(f.liqImporte)}) y no hay novedad cargada`),
        why: MOTIVO_LABEL[f.motivo] || '',
      })),
    });
  }

  const noComparables = results.filas.filter(f => f.banda === 'no_comparable');
  if (noComparables.length) {
    renderIssues(panel, {
      heading: 'Novedades que no se pudieron comparar',
      items: agruparPorMotivo(noComparables).map(g => ({
        who: MOTIVO_LABEL[g.motivo] || g.motivo,
        what: `${g.filas.length} novedad${g.filas.length === 1 ? '' : 'es'} en ${g.legajos} legajo${g.legajos === 1 ? '' : 's'} `
          + `(conceptos ${g.conceptos.slice(0, 6).join(', ')}${g.conceptos.length > 6 ? ' …' : ''})`,
        why: 'no bloquea el control y tampoco lo aprueba: no se convierte nada de horas a días ni al revés.',
      })),
    });
  }

  if (results.conceptosSinColumnaEnTabulado.length) {
    renderIssues(panel, {
      heading: 'Conceptos del importador sin columna en el Tabulado',
      items: results.conceptosSinColumnaEnTabulado.map(c => ({
        sev: c.liquidadoEnTotalizador === null ? 'hi' : 'minor',
        who: `Concepto ${c.codigo}${c.rotulo ? ` — ${c.rotulo}` : ''}`,
        what: c.liquidadoEnTotalizador === true
          ? 'el Tabulado no lo muestra, pero el reporte de Totales de Concepto sí lo trae: se comparó contra el totalizador'
          : c.liquidadoEnTotalizador === false
            ? 'no está en el Tabulado ni en el reporte de Totales de Concepto: no se liquidó este mes'
            : 'el Tabulado no trae columna para este concepto y no se cargó el reporte de Totales de Concepto',
        why: c.liquidadoEnTotalizador === null
          ? 'cargá el reporte de Totales de Concepto para saber si se liquidó'
          : 'hay conceptos que se liquidan y el Tabulado no muestra en columna propia',
      })),
    });
  }

  renderChecks(panel, {
    heading: 'Chequeos del cruce',
    items: [
      {
        label: 'Los tres archivos son del mismo período',
        ok: s.periodosCoinciden !== false,
        detail: s.periodosCoinciden === null
          ? 'ningún archivo declara período: se usó el del selector de la app'
          : `período de la app ${results.period || '(sin declarar)'} · Tabulado ${results.periodoTabulado || '—'} · `
            + `Totales de Concepto ${results.periodoTotalizador || '—'}`,
      },
      {
        label: 'Todas las columnas del importador tienen código de concepto',
        ok: s.columnasSinCodigo === 0,
        detail: s.columnasSinCodigo === 0
          ? 'todas las columnas con datos entraron al cruce'
          : `${s.columnasSinCodigo} columnas con ${s.celdasSinCodigo} celdas quedaron afuera`,
      },
      {
        label: 'El Tabulado trae cantidades para comparar',
        ok: results.cantidadesEnTabulado,
        detail: results.cantidadesEnTabulado
          ? 'el export trae los pares Cant/Imp por concepto'
          : 'el export vino sólo con importes: las cantidades no se comparan y no se deducen del importe',
      },
      {
        label: 'Se cargó el reporte de Totales de Concepto',
        ok: results.totalizadorCargado,
        detail: results.totalizadorCargado
          ? 'permite distinguir "no se liquidó" de "el Tabulado no lo muestra"'
          : 'sin él, las novedades sin contraparte salen sin motivo cierto',
      },
      {
        label: 'De cada legajo se pudo comparar al menos una novedad',
        ok: s.legajosSinNadaComparado === 0,
        detail: s.legajosSinNadaComparado === 0
          ? `los ${s.legajos} legajos del cruce tienen al menos una novedad comparada`
          : `de ${s.legajosSinNadaComparado} legajos no se pudo comparar nada: quedan para revisar`,
      },
      ...(results.totalesQueNoCierran.length ? [{
        label: 'Los totales del Tabulado cierran contra su TOTAL GENERAL',
        ok: false,
        detail: `${results.totalesQueNoCierran.length} columnas no cierran: el export puede venir retocado a mano`,
      }] : []),
    ],
  });

  if (results.avisos.length) {
    renderIssues(panel, {
      heading: 'Avisos de la lectura de los archivos',
      items: results.avisos.map(a => ({ sev: 'minor', who: 'Aviso', what: a })),
    });
  }
}

function agruparPorMotivo(filas) {
  const porMotivo = new Map();
  for (const f of filas) {
    if (!porMotivo.has(f.motivo)) porMotivo.set(f.motivo, []);
    porMotivo.get(f.motivo).push(f);
  }
  return [...porMotivo].map(([motivo, fs]) => ({
    motivo,
    filas: fs,
    legajos: new Set(fs.map(f => f.clave)).size,
    conceptos: [...new Set(fs.map(f => f.codigo))],
  }));
}

// De qué archivo salió el número liquidado, en dos formas: la suelta para la
// celda de la tabla y la contraída para meterla en una frase. Con una sola forma
// la frase queda "sale de el Tabulado" en todas las filas de la banda que el
// analista abre primero.
const ORIGEN_SUELTO = {
  tabulado:    'el Tabulado',
  totalizador: 'el reporte de Totales de Concepto',
  ambos:       'el Tabulado y el reporte de Totales de Concepto',
  ninguno:     'la liquidación',
};
export const ORIGEN_EN_FRASE = {
  tabulado:    'del Tabulado',
  totalizador: 'del reporte de Totales de Concepto',
  ambos:       'del Tabulado y del reporte de Totales de Concepto',
  ninguno:     'de la liquidación',
};

function origenClave(f) {
  const origenes = new Set([f.liqCantidadOrigen, f.liqImporteOrigen].filter(Boolean));
  if (origenes.size === 0) return 'ninguno';
  if (origenes.size === 2) return 'ambos';
  return origenes.has('tabulado') ? 'tabulado' : 'totalizador';
}

function origenTexto(f) {
  return ORIGEN_SUELTO[origenClave(f)];
}

/**
 * De dónde salió el número liquidado y cuántas filas se sumaron para formarlo.
 * Las liquidaciones del Tabulado se nombran sólo si el número salió de ahí: con
 * el importe del totalizador, hablar de "las 3 liquidaciones del mes" manda al
 * analista a buscarlo al archivo equivocado.
 */
function origenDetalle(f) {
  const delTabulado = f.liqCantidadOrigen === 'tabulado' || f.liqImporteOrigen === 'tabulado';
  const delTotalizador = f.liqCantidadOrigen === 'totalizador' || f.liqImporteOrigen === 'totalizador';
  let texto = `el dato liquidado sale ${ORIGEN_EN_FRASE[origenClave(f)]}`;
  if (delTabulado && f.tabLiquidaciones > 1) {
    texto += `, sumando las ${f.tabLiquidaciones} liquidaciones del mes de este legajo`;
  }
  if (delTotalizador && f.totFilas > 1) {
    texto += `, sumando las ${f.totFilas} filas del reporte de Totales de Concepto`;
  }
  return texto;
}

const VISTAS = ['difiere', 'sin_contraparte', 'no_comparable', 'coincide'];

function renderDetalle(results, panel) {
  const s = results.summary;
  const conteo = {
    coincide: s.coincide, difiere: s.difiere,
    no_comparable: s.noComparable, sin_contraparte: s.sinContraparte,
  };

  const grupo = document.createElement('div');
  grupo.className = 'form-group';
  grupo.innerHTML = `
    <select class="form-select form-select--sm" data-nl-vista data-chips="1" aria-label="Banda del cruce">
      ${VISTAS.map(v => `<option value="${v}">${BANDA_LABEL[v]} (${conteo[v]})</option>`).join('')}
    </select>
  `;
  const vistaSel = grupo.querySelector('[data-nl-vista]');
  vistaSel.value = s.difiere > 0 ? 'difiere'
    : s.sinContraparte > 0 ? 'sin_contraparte'
      : s.noComparable > 0 ? 'no_comparable' : 'coincide';

  const { searchEl, exportEl } = createResultsToolbar(panel, { left: grupo });
  const plano = () => buildCrucePlano(results);
  renderExportMenu(exportEl, {
    onExcel: () => descargarCruce(results),
    onCsv: () => { const p = plano(); downloadCsv(p.headers, p.rows, nombreArchivo(results, 'csv')); },
    onCopy: () => { const p = plano(); copyRowsToClipboard(p.headers, p.rows); },
  });

  const host = document.createElement('div');
  panel.appendChild(host);

  const dibujar = (vista) => {
    const filas = results.filas.filter(f => f.banda === vista);
    if (!filas.length) {
      host.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(vacioTexto(vista))}</p>`;
      return;
    }
    host.innerHTML = tablaHtml(filas, vista);
    wireTableTools(host.querySelector('table'), {
      rows: filas,
      getLabel: f => `${f.legajo} — ${f.codigo}`,
      searchEl,
      stickyCols: 2,
    });
  };

  vistaSel.addEventListener('change', () => dibujar(vistaSel.value));
  dibujar(vistaSel.value);
}

function vacioTexto(vista) {
  if (vista === 'difiere') return 'Ninguna novedad comparada difiere de la liquidación.';
  if (vista === 'sin_contraparte') return 'Todas las novedades tienen contraparte en la liquidación, y no hay conceptos liquidados sin novedad.';
  if (vista === 'no_comparable') return 'Todas las novedades se pudieron comparar.';
  return 'Ninguna novedad coincidió — mirá las otras bandas.';
}

function tablaHtml(filas, vista) {
  const esCruce = vista === 'difiere' || vista === 'coincide';
  const cabecera = esCruce
    ? ['Legajo', 'Nombre', 'Concepto', 'Cant. novedad', 'Cant. liquidada', 'Δ cantidad',
      'Imp. novedad', 'Imp. liquidado', 'Δ importe', 'Origen']
    : vista === 'no_comparable'
      ? ['Legajo', 'Nombre', 'Concepto', 'Cant. novedad', 'Imp. novedad', 'Cant. liquidada', 'Imp. liquidado', 'Por qué no se comparó']
      : ['Legajo', 'Nombre', 'Concepto', 'Lado', 'Cant. novedad', 'Imp. novedad', 'Cant. liquidada', 'Imp. liquidado', 'Motivo'];

  const celdaNum = (v) => `<td style="text-align:right;">${esc(fmtNum(v))}</td>`;

  const cuerpo = filas.map((f) => {
    const base = `<td>${esc(f.legajo)}</td><td>${esc(f.nombre)}</td>`
      + `<td>${esc(f.codigo)}${f.rotulo ? ` <span class="text-muted">${esc(f.rotulo)}</span>` : ''}</td>`;
    if (esCruce) {
      return `<tr>${base}${celdaNum(f.novCantidad)}${celdaNum(f.liqCantidad)}${celdaNum(f.difCantidad)}`
        + `${celdaNum(f.novImporte)}${celdaNum(f.liqImporte)}${celdaNum(f.difImporte)}`
        + `<td>${esc(origenTexto(f))}${f.parcial ? ' <span class="text-muted">(una sola medida)</span>' : ''}</td></tr>`;
    }
    if (vista === 'no_comparable') {
      return `<tr>${base}${celdaNum(f.novCantidad)}${celdaNum(f.novImporte)}${celdaNum(f.liqCantidad)}${celdaNum(f.liqImporte)}`
        + `<td>${esc(MOTIVO_CORTO[f.motivo] || f.motivo || '')}</td></tr>`;
    }
    return `<tr>${base}<td>${esc(f.lado === 'solo_novedad' ? 'sólo en el importador' : 'sólo en la liquidación')}</td>`
      + `${celdaNum(f.novCantidad)}${celdaNum(f.novImporte)}${celdaNum(f.liqCantidad)}${celdaNum(f.liqImporte)}`
      + `<td>${esc(MOTIVO_CORTO[f.motivo] || f.motivo || '')}</td></tr>`;
  }).join('');

  return `
    <table class="data-table data-table--compact">
      <thead><tr>${cabecera.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>
    <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) 0;">
      «—» no es un cero: es que no hay dato de esa medida en ese lado. La diferencia es
      novedad menos liquidación, y del Tabulado se suman todas las liquidaciones del mes de cada legajo.
    </p>
  `;
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * El cruce completo, en una matriz. Lleva las CUATRO bandas y todos los
 * conceptos, sin importar qué banda esté mostrando la pantalla.
 */
export function buildCrucePlano(results) {
  const headers = ['Banda', 'Legajo', 'Nombre', 'Codigo', 'Concepto',
    'Cant. novedad', 'Cant. liquidada', 'Dif. cantidad',
    'Imp. novedad', 'Imp. liquidado', 'Dif. importe',
    'Origen cantidad', 'Origen importe', 'Liquidaciones del legajo', 'Motivo', 'Solo en'];
  const rows = (results.filas || []).map(f => [
    BANDA_LABEL[f.banda] || f.banda,
    f.legajo, f.nombre, f.codigo, f.rotulo,
    f.novCantidad, f.liqCantidad, f.difCantidad,
    f.novImporte, f.liqImporte, f.difImporte,
    f.liqCantidadOrigen, f.liqImporteOrigen, f.tabLiquidaciones,
    f.motivo ? (MOTIVO_LABEL[f.motivo] || f.motivo) : '',
    f.lado === 'solo_novedad' ? 'el importador' : f.lado === 'solo_liquidacion' ? 'la liquidación' : '',
  ]);
  return { headers, rows };
}

function nombreArchivo(results, ext) {
  return `NovedadesVsLiquidacion_${periodSuffix(results.period)}.${ext}`;
}

async function descargarCruce(results) {
  await loadExcelJS();
  const wb = new window.ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cruce');
  const { headers, rows } = buildCrucePlano(results);
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  // Legajo y código salen como texto: como número se pierden los ceros a la
  // izquierda y `'12-B'` deja de ser el legajo que el cliente escribió.
  ws.getColumn(2).numFmt = '@';
  ws.getColumn(4).numFmt = '@';
  downloadWorkbook(wb, nombreArchivo(results, 'xlsx'));
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
