// variaciones.js — Variación de conceptos liquidados entre dos períodos
//
// Único control del proyecto que cruza el Tabulado contra el Tabulado de OTRO
// período en lugar de contra un reporte del mismo período. **Se suben siempre
// los dos archivos**: no se reusa el Tabulado de una corrida anterior, porque
// no hay una regla cerrada de qué quincena compara contra cuál y adivinarla
// daba comparaciones mal armadas sin que nadie se enterara.
//
// El período y la quincena de cada archivo salen del propio archivo (`Periodo:`
// y `Tipo:` de su encabezado), nunca del selector de período de la app. El
// control ordena los dos por fecha: el más viejo queda siempre a la izquierda
// del reporte, sin importar en qué slot lo haya subido el analista.
//
// Dos reportes, con los mismos campos de salida y distinta agrupación de conceptos:
//   - Variación Sueldos:   899999 (jornales) + 1000 (mensuales) sumados en una columna.
//   - Variación Conceptos: 2517 y 2519, cada uno en su propia sección.
//
// Qué columna del Tabulado es cada concepto lo **confirma el analista** en el
// paso de archivos (ver js/ui/variacionesConceptMap.js). El código de concepto
// pasó a ser precarga, no identificador: si el cliente renumera o renombra un
// concepto se corrige desde la pantalla, sin tocar este archivo. Las constantes
// de abajo son la semilla de esa configuración, no la forma de leer la columna.
//
// Los códigos 1028 / 1029 que aparecen en documentos de referencia del cliente son
// de otro sistema de liquidación y no se usan como identificador (2517=1028, 2519=1029).
//
// Ver specs/reporte-variaciones-opmobility.md y D-022 / D-023 / D-026 en DECISIONS.md.

import { diffStats } from './semaforo.js';
import { isDiff } from './tolerance.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import {
  renderVerdict,
  renderTiles,
  renderIssues,
  renderResumenDetalle,
  mvClass, mvArrow, fmtSigned,
} from '../ui/resultBlocks.js';
import { renderPlanillaPanel } from '../ui/planillaPanel.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum, toNum } from '../utils/currency.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { groupRowsByLegajo, sumColumn } from './consolidate.js';
import { periodToLabel, periodSuffix } from '../utils/dates.js';
import { clavesUnicas } from '../parsers/tabuladoHtml.js';

/** Tolerancia de comparación de importes: medio centavo. */
const TOL = 0.01;

/** Tolerancia al validar un total contra la fila TOTAL GENERAL del archivo. */
const TOL_TOTAL = 0.05;

export const VARIACIONES_SUELDOS_CONCEPTS = [
  { codigo: '899999', label: 'Jornales' },
  { codigo: '1000',   label: 'Mensuales' },
];

export const VARIACIONES_CONCEPTOS_CONCEPTS = [
  { codigo: '2517', label: 'Premio de progreso' },
  { codigo: '2519', label: 'Premio productividad' },
];

// Códigos de licencia / ausencia / franco / permiso que puede traer el Tabulado.
// Se usan sólo para explicar una caída de escalón — si el empleado tiene algo
// cargado en alguno de estos conceptos en el período actual, la baja se explica
// sola y no entra en "legajos para poder explicar".
export const CODIGOS_AUSENCIA = [
  '1500', '1510', '1530', '1600', '1625', '1695', '1698', '1915', '1047', '1049',
];

/** Cantidad máxima de "escalones" para tratar una columna como discreta. */
const MAX_VALORES_ESCALA = 6;

// ── Helpers de datos ─────────────────────────────────────────────────────────

// Limpieza de texto. La clave de legajo NO sale de acá: sale de
// `makeLegajoKey(mapping.legajoKeyMode)` (D-038).
const norm = v => (v === null || v === undefined ? '' : String(v).trim());

/** Código del encabezado de concepto: "899999 - BASE de Escala…" → "899999". */
function codigoDeHeader(header) {
  const m = norm(header).match(/^(\d+)\s*-\s*/);
  return m ? m[1] : null;
}

/**
 * Mapea código de concepto → nombres de columna, a partir de las claves de las
 * filas. Se resuelve por lado (anterior y actual) porque el nombre del concepto
 * puede cambiar entre períodos, y porque la cantidad de columnas del Tabulado
 * varía según qué conceptos se liquidaron ese mes.
 *
 * Devuelve **todas** las columnas de cada código, no la primera: un Tabulado
 * puede traer el mismo concepto en dos columnas (desambiguadas con sufijo
 * `__2` por `clavesUnicas`) y quedarse con una descartaba la otra en silencio.
 * Esto es sólo precarga — la columna que se usa la confirma el analista.
 *
 * @returns {Record<string, string[]>}
 */
export function columnasPorCodigo(rows) {
  const out = {};
  for (const key of clavesDeFilas(rows)) {
    const cod = codigoDeHeader(key);
    if (cod === null) continue;
    (out[cod] ||= []).push(key);
  }
  return out;
}

/**
 * Identidad de una entrada de concepto. Las entradas se identifican por código
 * cuando lo tienen (`'2517'`) y por nombre de columna cuando no (`'Bruto'`),
 * para poder comparar también columnas que el Tabulado no numera.
 */
const entryId = e => e.codigo || e.nombre || e.label;

/**
 * Columna efectiva de cada entrada en un archivo.
 *
 * Precedencia: lo que confirmó el analista (incluido el `null` explícito de "no
 * se liquidó en este período") y, si no confirmó nada, la precarga por código o
 * por nombre exacto. El fallback importa: mantiene andando a quien llame al
 * control sin pasar por el paso de confirmación (tests, corridas guardadas).
 *
 * @param {Array}  entradas    conceptos declarados por la config
 * @param {object[]} rows      filas del archivo
 * @param {object|null} confirmadas  { [entryId]: nombreColumna | null }
 * @param {Array}  [huerfanas] si se pasa, se le agrega { id, col } por cada
 *   columna confirmada que ya no está en este archivo (headers renombrados,
 *   Tabulado sin el preámbulo que trimea distinto, etc.) — usarla como
 *   confirmada sería un 0,00 silencioso (CLAUDE.md §11.5): se trata como no
 *   resuelta y se informa aparte, sin confundirla con "no se liquidó".
 * @returns {Record<string, string|null>}
 */
function resolverColumnasDeEntradas(entradas, rows, confirmadas, huerfanas) {
  const porCodigo = columnasPorCodigo(rows);
  const claves = clavesDeFilas(rows);
  const out = {};
  for (const e of entradas) {
    const id = entryId(e);
    if (confirmadas && Object.prototype.hasOwnProperty.call(confirmadas, id)) {
      const col = confirmadas[id] || null;
      if (col && !claves.has(col)) {
        huerfanas?.push({ id, col });
        out[id] = null;
      } else {
        out[id] = col;
      }
      continue;
    }
    if (e.codigo && porCodigo[e.codigo]?.length) out[id] = porCodigo[e.codigo][0];
    else if (e.nombre && claves.has(e.nombre)) out[id] = e.nombre;
    else out[id] = null;
  }
  return out;
}

/** Columnas de las causas de ausencia (por código) presentes en un archivo. */
function resolverColumnasAusencia(codigos, rows) {
  const porCodigo = columnasPorCodigo(rows);
  return codigos.flatMap(cod => porCodigo[cod] || []);
}

/**
 * Etiqueta de un período con su quincena: "2ª quincena de marzo 2025".
 * Sin quincena declarada cae a "Marzo 2025".
 *
 * No se toca `periodToLabel` (js/utils/dates.js), que la usa el resto de la app
 * y devuelve sólo el mes.
 */
function periodQuincenaLabel(period, quincena) {
  if (!period) return 'Período sin identificar';
  const base = periodToLabel(period);
  return quincena ? `${quincena}ª quincena de ${base.toLowerCase()}` : base;
}

/**
 * Unión de las claves de todas las filas. No alcanza con mirar la primera: el
 * Tabulado real trae todas las columnas en todas las filas, pero las filas que
 * llegan de una corrida guardada pueden venir de un período con otras columnas.
 */
function clavesDeFilas(rows) {
  const keys = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) keys.add(k);
  }
  return keys;
}

/**
 * Nombre de la columna de legajo. Usa la del mapping si existe en el archivo;
 * si no, la detecta por nombre. Devuelve null si no hay ninguna: es un error de
 * verdad y el control lo tiene que reportar, no seguir con una columna que no existe.
 */
function resolverColumnaLegajo(rows, preferida) {
  const keys = clavesDeFilas(rows);
  if (preferida && keys.has(preferida)) return preferida;
  return [...keys].find(k => /^(legajo|empleado)$/i.test(norm(k))) || null;
}

function resolverColumnaNombre(rows, preferida) {
  const keys = clavesDeFilas(rows);
  if (preferida && keys.has(preferida)) return preferida;
  return [...keys].find(k => /^(apellido y nombre|apellido_nombre|nombre)$/i.test(norm(k))) || null;
}

/** Columna "Bruto" del Tabulado, si existe (para el veredicto del hero). */
function resolverColumnaBruto(rows) {
  const keys = clavesDeFilas(rows);
  return [...keys].find(k => /^bruto$/i.test(norm(k))) || null;
}

/**
 * Suma las entradas de un grupo para un legajo (Sueldos combina jornales +
 * mensuales en una sola columna del reporte; Conceptos tiene una entrada por grupo).
 */
function sumEntradas(group, columnas, entradas) {
  let total = null;
  for (const e of entradas) {
    const v = sumColumn(group, columnas[entryId(e)]);
    if (v !== null) total = (total ?? 0) + v;
  }
  return total;
}

/**
 * Detecta si un concepto se paga en "escalones" (un conjunto chico de valores
 * fijos, como el premio de progreso de OPmobility: 0 / 50% / 70% / 100% de una
 * base) en lugar de un importe libre. No hace falta configurarlo por cliente:
 * si los valores no-cero que toma la columna, juntando los dos períodos, son
 * pocos y se repiten mucho, es un escalón. Si toma un valor por empleado (un
 * importe libre como las horas o el bruto), no lo es.
 *
 * @returns {number[]|null} la escala ordenada ascendente (con 0 si aplica), o
 *   null si el concepto no se comporta como escalón.
 */
function detectarEscala(valores) {
  const noCero = valores.filter(v => v !== null && Math.abs(v) > TOL);
  if (noCero.length < 4) return null;
  const distintos = new Set(noCero.map(v => Math.round(v * 100)));
  if (distintos.size === 0 || distintos.size > MAX_VALORES_ESCALA) return null;
  // Tiene que repetirse: con un valor por observación no es una escala, es un importe libre.
  if (distintos.size >= noCero.length) return null;
  const escala = [...distintos].map(c => c / 100).sort((a, b) => a - b);
  // Un legajo presente ese período sin dato en este concepto (null) liquidó 0
  // del concepto — es el escalón más bajo, igual que un 0,00 explícito.
  if (valores.some(v => v === null || Math.abs(v) <= TOL)) escala.unshift(0);
  return escala;
}

/**
 * Ubicación de un valor dentro de una escala, como % del escalón más alto.
 * `null` cuenta como 0 (no liquidó el concepto ese período) cuando la escala
 * tiene un escalón 0 — nunca para un legajo que no está en el Tabulado ese
 * período, que se filtra antes de llegar acá con `presenteAnterior/Actual`.
 */
function escalonDe(valor, escala) {
  if (!escala || escala.length === 0) return null;
  const v = (valor === null && escala[0] === 0) ? 0 : valor;
  if (v === null) return null;
  const max = escala[escala.length - 1];
  if (max <= 0) return null;
  return Math.round((v / max) * 100);
}

/** Suma los conceptos de licencia/ausencia configurados para un legajo y período. */
function sumaAusencias(group, columnasAusencia) {
  let total = 0;
  for (const col of columnasAusencia) {
    const v = sumColumn(group, col);
    if (v !== null) total += v;
  }
  return total;
}

/**
 * Ordena los dos archivos cronológicamente: el más viejo primero.
 *
 * El analista puede equivocarse de slot, así que el orden del reporte lo decide
 * la fecha que declara cada archivo, no dónde se subió. Si no alcanza para
 * decidir (mismo período y alguna quincena sin declarar) se respeta el slot y
 * el llamador avisa.
 *
 * @returns {[object, object]} [anterior, actual]
 */
function ordenarCronologico(slotAnterior, slotActual) {
  const pa = slotAnterior.meta?.period || null;
  const pb = slotActual.meta?.period || null;
  if (pa && pb && pa !== pb) return pa < pb ? [slotAnterior, slotActual] : [slotActual, slotAnterior];

  const qa = slotAnterior.meta?.quincena ?? null;
  const qb = slotActual.meta?.quincena ?? null;
  if (qa && qb && qa !== qb) return qa < qb ? [slotAnterior, slotActual] : [slotActual, slotAnterior];

  return [slotAnterior, slotActual];
}

/**
 * Compara el total calculado de una columna contra el que trae la fila
 * TOTAL GENERAL del propio archivo.
 *
 * Existe para detectar un desalineamiento de columnas: si los encabezados se
 * corrieron, los números salen mal pero coherentes entre sí, y esta es la única
 * señal de que algo no cierra. Es un aviso — no bloquea la corrida ni va al PDF.
 *
 * @returns {{ archivo: number, calculado: number }|null} null si cierra o no se puede verificar
 */
function chequearTotalDelArchivo(meta, columna, calculado) {
  if (!meta?.totalRow || !meta?.headers || !columna) return null;
  const i = clavesUnicas(meta.headers).indexOf(columna);
  if (i < 0) return null;
  const j = i - (meta.totalRowOffset ?? 0);
  if (j < 0 || j >= meta.totalRow.length) return null;
  const archivo = toNum(meta.totalRow[j]);
  if (archivo === null) return null;
  return Math.abs(archivo - calculado) > TOL_TOTAL ? { archivo, calculado } : null;
}

// Qué movimiento entre los dos períodos cuenta como variación: el monto que el
// cliente puso en "Umbrales" (D-069). Es la columna "Modificación S/N" y lo que
// decide qué legajos entran a la lista. El resto de los TOL de este módulo son
// estructurales (detectar una escala, validar contra TOTAL GENERAL, saber si un
// concepto se liquidó) y siguen midiendo al centavo.
const isDif = v => isDiff(v);

/** Variación %: sin base en el período anterior no existe, se informa null → "s/base". */
function calcularPct(anterior, actual) {
  if (anterior === null || Math.abs(anterior) <= TOL) return null;
  return ((actual ?? 0) - anterior) / anterior * 100;
}

// En el PDF que va al cliente, un empleado sin el concepto liquidado ese período
// se muestra en 0,00 y no como "—" (así lo pide el documento base del reporte).
// En pantalla se mantiene "—", que es la convención del proyecto para "sin dato".
const fmtNum0 = v => fmtNum(v === null ? 0 : v);

const fmtPct = v => v === null
  ? 's/base'
  : (v > 0 ? '+' : '') + v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── run() ────────────────────────────────────────────────────────────────────

/**
 * Núcleo compartido por los dos reportes.
 *
 * @param {object[]} prevRowsFile filas del Tabulado subido en el slot "período anterior"
 * @param {object[]} tabRows      filas del Tabulado subido en el slot "período actual"
 * @param {object}   mapping      { tab, variaciones: { config?, anterior, actual } }
 * @param {object}   reporte      { id, titulo, conceptos, combinar, listaConfig }
 */
function runVariaciones(prevRowsFile, tabRows, mapping, reporte) {
  if (!tabRows || tabRows.length === 0) {
    return { error: 'Falta el Tabulado del período actual. Cargalo en el Paso 2.' };
  }
  if (!prevRowsFile || prevRowsFile.length === 0) {
    return {
      error: 'Falta el Tabulado del período anterior. Este control compara dos períodos, '
        + 'así que necesita los dos archivos. Subilo en el Paso 2 para continuar.',
    };
  }

  const cfg = mapping.variaciones || {};

  // Cada lado es el archivo tal como se subió, con la metadata que declara el
  // propio archivo. El orden del reporte lo decide la fecha, no el slot.
  const slotAnterior = { rows: prevRowsFile, meta: cfg.anterior?.meta || {}, columnas: cfg.anterior?.columnas || null };
  const slotActual   = { rows: tabRows,      meta: cfg.actual?.meta   || {}, columnas: cfg.actual?.columnas   || null };

  const mismoPeriodo = slotAnterior.meta.period && slotActual.meta.period
    && slotAnterior.meta.period === slotActual.meta.period;
  const quincenaAnterior = slotAnterior.meta.quincena ?? null;
  const quincenaActual   = slotActual.meta.quincena ?? null;

  if (mismoPeriodo && quincenaAnterior && quincenaActual && quincenaAnterior === quincenaActual) {
    return {
      error: `No se puede comparar: los dos tabulados son de la `
        + `${periodQuincenaLabel(slotActual.meta.period, quincenaActual)}. `
        + `Para ver la variación hacen falta dos períodos distintos. Revisá qué archivo subiste en cada slot.`,
    };
  }

  const avisos = [];
  if (mismoPeriodo && (!quincenaAnterior || !quincenaActual)) {
    avisos.push('Los dos tabulados son del mismo período y al menos uno no declara la quincena, '
      + 'así que no se pudo verificar que sean liquidaciones distintas. Se comparó en el orden en que se subieron.');
  }

  const [anterior, actual] = ordenarCronologico(slotAnterior, slotActual);
  const seSubieronAlReves = anterior === slotActual;
  if (seSubieronAlReves) {
    avisos.push('Los archivos se subieron en el orden inverso: el del slot "período actual" es el más viejo. '
      + 'El reporte igual los ordena por fecha — el más viejo queda a la izquierda.');
  }

  const prevRows = anterior.rows;
  const actRows  = actual.rows;

  const periodoAnterior = anterior.meta.period || null;
  const periodoActual   = actual.meta.period || null;

  const legPrev = resolverColumnaLegajo(prevRows, mapping.tab?.empleadoColumn);
  const legAct  = resolverColumnaLegajo(actRows, mapping.tab?.empleadoColumn);
  if (!legPrev || !legAct) {
    return { error: 'No se pudo identificar la columna de Legajo en el Tabulado. Revisá el mapeo de columnas.' };
  }
  const nomAct  = resolverColumnaNombre(actRows, mapping.tab?.apellidoNombreColumn);
  const nomPrev = resolverColumnaNombre(prevRows, mapping.tab?.apellidoNombreColumn);

  // Qué columna es cada concepto en cada archivo: lo confirmado por el analista,
  // con precarga por código como respaldo.
  const huerfanasPrev = [];
  const huerfanasAct  = [];
  const colsPrev = resolverColumnasDeEntradas(reporte.conceptos, prevRows, anterior.columnas, huerfanasPrev);
  const colsAct  = resolverColumnasDeEntradas(reporte.conceptos, actRows, actual.columnas, huerfanasAct);

  const codigosAusencia = cfg.config?.ausencias || CODIGOS_AUSENCIA;
  const ausenciaPrevCols = resolverColumnasAusencia(codigosAusencia, prevRows);
  const ausenciaActCols  = resolverColumnasAusencia(codigosAusencia, actRows);

  const keyFn = makeLegajoKey(mapping.legajoKeyMode);
  const gPrev = groupRowsByLegajo(prevRows, legPrev, { keyFn });
  const gAct  = groupRowsByLegajo(actRows, legAct, { keyFn });

  const legajos = Array.from(new Set([...gPrev.keys(), ...gAct.keys()]))
    .sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (isFinite(na) && isFinite(nb) && na !== nb) return na - nb;
      return a.localeCompare(b, 'es');
    });

  // Grupos de conceptos: uno solo (sumado) para Sueldos, uno por concepto para Conceptos.
  const grupos = reporte.combinar
    ? [{
        key: 'total',
        entradas: reporte.conceptos,
        label: reporte.titulo,
        nombreReal: null,
      }]
    : reporte.conceptos.map(c => ({
        key: entryId(c),
        entradas: [c],
        label: c.codigo ? `${c.codigo} - ${c.label}` : c.label,
        // Nombre tal como figura en el Tabulado, que es el que va al reporte.
        nombreReal: colsAct[entryId(c)] || colsPrev[entryId(c)] || null,
      }));

  const brutoPrevCol = resolverColumnaBruto(prevRows);
  const brutoActCol  = resolverColumnaBruto(actRows);

  const rows = legajos.map(legajo => {
    const grupoPrev = gPrev.get(legajo) || [];
    const grupoAct  = gAct.get(legajo) || [];
    const nombre = (grupoAct[0] && nomAct && norm(grupoAct[0][nomAct]))
      || (grupoPrev[0] && nomPrev && norm(grupoPrev[0][nomPrev]))
      || '(sin nombre)';

    const valores = {};
    for (const g of grupos) {
      const anterior = sumEntradas(grupoPrev, colsPrev, g.entradas);
      const actual   = sumEntradas(grupoAct, colsAct, g.entradas);
      const diff = (anterior === null && actual === null)
        ? null
        : (actual ?? 0) - (anterior ?? 0);
      valores[g.key] = { anterior, actual, diff, pct: calcularPct(anterior, actual ?? 0) };
    }

    return {
      legajo,
      nombre,
      valores,
      presenteAnterior: grupoPrev.length > 0,
      presenteActual:   grupoAct.length > 0,
      bruto: {
        anterior: sumColumn(grupoPrev, brutoPrevCol),
        actual:   sumColumn(grupoAct, brutoActCol),
      },
      // Cualquier licencia/ausencia/franco/permiso cargado ese período — sirve
      // para distinguir una baja que se explica sola de una que hay que preguntar.
      ausenciaAnterior: sumaAusencias(grupoPrev, ausenciaPrevCols),
      ausenciaActual:   sumaAusencias(grupoAct, ausenciaActCols),
    };
  });

  // Detección de "escalón" por grupo: sólo tiene sentido cuando el grupo es un
  // único concepto real del Tabulado (Variación Conceptos), no una suma de
  // conceptos distintos (Variación Sueldos combina jornales + mensuales, que
  // nunca comparten escala). Se detecta con los valores de los dos períodos
  // juntos para no perder escalones que sólo aparecen en uno de los dos.
  for (const g of grupos) {
    // Sólo cuentan los valores de períodos en los que el legajo estaba en el
    // Tabulado (presente): un null por alta/baja no es "liquidó 0", es "no
    // corresponde", y no tiene que contaminar la detección de la escala.
    g.escala = (g.entradas.length === 1)
      ? detectarEscala(rows.flatMap(r => [
          r.presenteAnterior ? r.valores[g.key].anterior : undefined,
          r.presenteActual   ? r.valores[g.key].actual   : undefined,
        ]).filter(v => v !== undefined))
      : null;
    if (g.escala) {
      for (const r of rows) {
        r.valores[g.key].escalonAnterior = r.presenteAnterior ? escalonDe(r.valores[g.key].anterior, g.escala) : null;
        r.valores[g.key].escalonActual   = r.presenteActual   ? escalonDe(r.valores[g.key].actual, g.escala)   : null;
      }
    }
  }

  // Conceptos que no se liquidaron en un período — porque no están en el archivo
  // o porque el analista marcó "no se liquidó en este período". Se computan en 0,
  // no es un error. Se informa como aviso en la pantalla de resultados.
  const faltantes = [];
  for (const c of reporte.conceptos) {
    const id = entryId(c);
    const enPrev = colsPrev[id] !== null && colsPrev[id] !== undefined;
    const enAct  = colsAct[id] !== null && colsAct[id] !== undefined;
    if (!enPrev || !enAct) {
      faltantes.push({ id, codigo: c.codigo || null, label: c.label, enPrev, enAct });
    }
  }

  // Columnas confirmadas por el analista en una corrida anterior que ya no
  // están en este archivo (headers renombrados, etc.) — se resolvieron como
  // "no encontrada" arriba (resolverColumnasDeEntradas), y acá se identifican
  // con su label para poder avisarlo por qué, no sólo que falta.
  const huerfanas = [
    ...huerfanasPrev.map(h => ({ ...h, lado: 'anterior' })),
    ...huerfanasAct.map(h => ({ ...h, lado: 'actual' })),
  ].map(h => {
    const c = reporte.conceptos.find(e => entryId(e) === h.id);
    return { ...h, label: c?.label ?? h.id, codigo: c?.codigo ?? null };
  });

  // Los totales calculados contra la fila TOTAL GENERAL de cada archivo.
  const totalesQueNoCierran = [];
  for (const g of grupos) {
    for (const e of g.entradas) {
      const id = entryId(e);
      for (const [lado, cols, meta, period, quincena] of [
        ['anterior', colsPrev, anterior.meta, periodoAnterior, anterior.meta.quincena],
        ['actual',   colsAct,  actual.meta,   periodoActual,   actual.meta.quincena],
      ]) {
        const col = cols[id];
        if (!col) continue;
        const calculado = rows.reduce((s, r) => {
          const grupoFilas = (lado === 'anterior' ? gPrev : gAct).get(r.legajo) || [];
          return s + (sumColumn(grupoFilas, col) ?? 0);
        }, 0);
        const desvio = chequearTotalDelArchivo(meta, col, calculado);
        if (desvio) {
          totalesQueNoCierran.push({ label: e.label, columna: col, lado, period, quincena, ...desvio });
        }
      }
    }
  }

  const brutoAnterior = brutoPrevCol ? rows.reduce((s, r) => s + (r.bruto.anterior ?? 0), 0) : null;
  const brutoActual   = brutoActCol  ? rows.reduce((s, r) => s + (r.bruto.actual ?? 0), 0) : null;

  const tipoAnterior = anterior.meta.tipoLiquidacion || null;
  const tipoActual   = actual.meta.tipoLiquidacion || null;
  if (tipoAnterior && tipoActual && tipoAnterior !== tipoActual) {
    avisos.push(`Los dos tabulados son de tipos de liquidación distintos — "${tipoAnterior}" contra `
      + `"${tipoActual}". Comparar tipos distintos casi siempre es un error de carga: revisá qué archivos subiste.`);
  }

  return {
    period: periodoActual,
    periodAnterior: periodoAnterior,
    quincena: actual.meta.quincena ?? null,
    quincenaAnterior: anterior.meta.quincena ?? null,
    tipoLiquidacion: tipoActual,
    tipoLiquidacionAnterior: tipoAnterior,
    empresa: actual.meta.empresa || anterior.meta.empresa || null,
    reporte: { id: reporte.id, titulo: reporte.titulo, combinar: reporte.combinar },
    grupos,
    rows,
    faltantes,
    huerfanas,
    totalesQueNoCierran,
    avisos,
    bruto: (brutoAnterior !== null && brutoActual !== null)
      ? { anterior: brutoAnterior, actual: brutoActual, diff: brutoActual - brutoAnterior, pct: calcularPct(brutoAnterior, brutoActual) }
      : null,
    summary: {
      total: rows.length,
      empleadosAnterior: gPrev.size,
      empleadosActual:   gAct.size,
    },
  };
}

/**
 * Conceptos declarados por un reporte: los de la configuración del cliente si
 * los hay, o la semilla de este módulo. Las entradas sin etiqueta se completan
 * con el código para que la salida nunca muestre una columna sin nombre.
 */
function conceptosDe(mapping, clave, semilla) {
  const desdeConfig = mapping.variaciones?.config?.[clave];
  const lista = Array.isArray(desdeConfig) && desdeConfig.length > 0 ? desdeConfig : semilla;
  return lista.map(c => ({ ...c, label: c.label || c.codigo || c.nombre || '(sin nombre)' }));
}

export function runVariacionesSueldos(primaryRows, tabRows, mapping) {
  return runVariaciones(primaryRows, tabRows, mapping, {
    id: 'variaciones_sueldos',
    titulo: 'Variación Sueldos',
    conceptos: conceptosDe(mapping, 'sueldos', VARIACIONES_SUELDOS_CONCEPTS),
    combinar: true,
  });
}

export function runVariacionesConceptos(primaryRows, tabRows, mapping) {
  return runVariaciones(primaryRows, tabRows, mapping, {
    id: 'variaciones_conceptos',
    titulo: 'Variación Conceptos',
    conceptos: conceptosDe(mapping, 'conceptos', VARIACIONES_CONCEPTOS_CONCEPTS),
    combinar: false,
  });
}

// ── summarize() ──────────────────────────────────────────────────────────────

/** Una fila es evaluable si tiene algún valor distinto de cero en algún grupo. */
function tieneValor(row, grupos) {
  return grupos.some(g => {
    const v = row.valores[g.key];
    return (v.anterior !== null && Math.abs(v.anterior) > TOL)
        || (v.actual !== null && Math.abs(v.actual) > TOL);
  });
}

function rowTieneDif(row, grupos) {
  return grupos.some(g => isDif(row.valores[g.key].diff));
}

// ── Escalón: casos para explicar y matriz de transición ────────────────────
// La variación en pesos de un concepto que se paga en escalones no dice nada
// por sí sola ("bajó $16.805,40" no significa nada; "pasó de 100% a 70%" sí).
// Esta sección reencuadra la variación como cambio de escalón y separa lo que
// se explica solo (hay una licencia/ausencia/franco cargado ese período) de
// lo que hay que preguntar.

/**
 * Empleados que bajaron de escalón en algún grupo, ordenados por la caída más
 * grande primero y con los que no tienen causa visible arriba de los que sí.
 */
function casosDeEscalon(relevantes, grupos) {
  const casos = [];
  for (const g of grupos) {
    if (!g.escala) continue;
    for (const r of relevantes) {
      const v = r.valores[g.key];
      if (v.escalonAnterior === null || v.escalonActual === null) continue;
      if (v.escalonActual >= v.escalonAnterior) continue;
      casos.push({ row: r, grupo: g, v, explicado: r.ausenciaActual > TOL });
    }
  }
  casos.sort((a, b) => {
    if (a.explicado !== b.explicado) return a.explicado ? 1 : -1;
    return (a.v.escalonActual - a.v.escalonAnterior) - (b.v.escalonActual - b.v.escalonAnterior);
  });
  return casos;
}

// El bruto total del período: sube, baja o no se movió, con el mismo monto que
// decide el resto de las variaciones.
const claseVar = diff => (isDif(diff) ? (diff > 0 ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-text-muted)');
const flechaVar = diff => (isDif(diff) ? (diff > 0 ? '▲' : '▼') : '–');

function summarizeVariaciones(results) {
  if (results?.error) {
    return { status: 'error', headline: results.error, insights: [] };
  }

  const { rows, grupos } = results;
  const relevantes = rows.filter(r => tieneValor(r, grupos));
  const conDif = relevantes.filter(r => rowTieneDif(r, grupos));

  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    relevantes,
    grupos.map(g => ({ key: g.key, get: row => row.valores[g.key].diff, label: g.label })),
    (row, field) => `${field.label} — leg. ${row.legajo}`
  );

  const etiquetaPeriodos = results.periodAnterior && results.period
    ? `${etiquetaAnterior(results)} vs ${etiquetaActual(results)}`
    : 'período anterior vs actual';

  return {
    status: conDif.length > 0 ? 'warning' : 'success',
    headline: `${relevantes.length} empleado${relevantes.length === 1 ? '' : 's'} · `
      + `${conDif.length} con variación · ${etiquetaPeriodos}`,
    insights: [
      { type: conDif.length > 0 ? 'warning' : 'info', label: 'Empleados con variación', value: conDif.length },
      { type: 'info', label: 'Empleados sin variación', value: relevantes.length - conDif.length },
    ],
    unit: 'legajo',
    unitsTotal: relevantes.length,
    unitsWithDiff,
    diffTotalAmount,
    worstCase,
    contextNote: results.tipoLiquidacion
      ? `liquidación: ${results.tipoLiquidacion}`
      : 'los dos períodos salen de los tabulados cargados',
  };
}

/** Etiquetas de los dos períodos comparados, con la quincena que declara cada archivo. */
const etiquetaAnterior = r => periodQuincenaLabel(r.periodAnterior, r.quincenaAnterior);
const etiquetaActual   = r => periodQuincenaLabel(r.period, r.quincena);

/**
 * Tipo de liquidación de los dos archivos, para mostrar en segundo plano debajo
 * del período. Si los dos coinciden va uno solo; si difieren van los dos (y
 * además sale el aviso, que eso casi siempre es un error de carga).
 */
function tipoLiquidacionLinea(results) {
  const a = results.tipoLiquidacionAnterior;
  const b = results.tipoLiquidacion;
  if (!a && !b) return '';
  if (a && b && a !== b) return `${a} · ${b}`;
  return b || a;
}

export const summarizeVariacionesSueldos   = summarizeVariaciones;
export const summarizeVariacionesConceptos = summarizeVariaciones;

// ── renderResults() ──────────────────────────────────────────────────────────

function renderVariacionesResults(results, container) {
  container.innerHTML = '';

  if (results?.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }

  const { rows, grupos } = results;
  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  // §11.1 — solo filas con valor real; nunca listar legajos en cero de punta a punta.
  const relevantes = rows.filter(r => tieneValor(r, grupos));
  const conDif     = relevantes.filter(r => rowTieneDif(r, grupos));
  const okCount    = relevantes.length - conDif.length;
  const sinValor   = rows.length - relevantes.length;

  const labelAnterior = etiquetaAnterior(results);
  const labelActual   = etiquetaActual(results);
  const casos = casosDeEscalon(relevantes, grupos);
  const sinCausa = casos.filter(c => !c.explicado);

  // ── Veredicto ─────────────────────────────────────────────────────────────
  // Va SIEMPRE afuera de las solapas, con `renderVerdict` del módulo compartido
  // (patrón de js/ui/resultBlocks.js, el mismo que usan los otros 10 controles).
  // Antes acá había un hero propio con los contadores, que repetía lo que ya
  // dicen la card de la pantalla de resultados y su fila de insights.
  const gruposConEscala = grupos.filter(g => g.escala);
  const verdictWarn = sinCausa.length > 0 || (gruposConEscala.length === 0 && conDif.length > 0);
  let tituloVeredicto;
  if (casos.length > 0) {
    tituloVeredicto = sinCausa.length > 0
      ? `${sinCausa.length} de ${casos.length} legajo${casos.length === 1 ? '' : 's'} que bajaron de escalón no tienen nada cargado que lo explique.`
      : `${casos.length} legajo${casos.length === 1 ? '' : 's'} bajaron de escalón, y todos se explican con una licencia, ausencia, franco o permiso.`;
  } else if (conDif.length > 0) {
    tituloVeredicto = `${conDif.length} de ${relevantes.length} empleados tuvieron variación en ${results.reporte.titulo}.`;
  } else {
    tituloVeredicto = `Los ${relevantes.length} empleados no tuvieron variación en ${results.reporte.titulo} entre los dos períodos.`;
  }

  const contexto = [
    `${esc(labelAnterior)} → ${esc(labelActual)}`,
    tipoLiquidacionLinea(results) ? esc(tipoLiquidacionLinea(results)) : null,
    sinValor > 0 ? `${sinValor} sin valores en ningún período (no se muestran)` : null,
  ].filter(Boolean).join(' · ');

  renderVerdict(container, {
    tone: verdictWarn ? 'warn' : 'ok',
    title: tituloVeredicto,
    body: contexto,
  });

  // ── Avisos ────────────────────────────────────────────────────────────────
  const avisos = (results.avisos || []).map(a => esc(a));
  for (const f of results.faltantes) {
    const donde = !f.enPrev && !f.enAct
      ? 'en ninguno de los dos períodos'
      : (!f.enPrev ? `en ${esc(labelAnterior)}` : `en ${esc(labelActual)}`);
    const nombre = f.codigo ? `<strong>${esc(f.codigo)}</strong> (${esc(f.label)})` : `<strong>${esc(f.label)}</strong>`;
    avisos.push(`El concepto ${nombre} no se liquidó ${donde} — se computa en 0,00.`);
  }
  for (const h of results.huerfanas || []) {
    const donde = h.lado === 'anterior' ? esc(labelAnterior) : esc(labelActual);
    const nombre = h.codigo ? `<strong>${esc(h.codigo)}</strong> (${esc(h.label)})` : `<strong>${esc(h.label)}</strong>`;
    avisos.push(`La columna que estaba confirmada para el concepto ${nombre} ya no está en el Tabulado de `
      + `${donde} ("${esc(h.col)}") — se computa en 0,00 hasta que se vuelva a confirmar en `
      + `"Conceptos a comparar".`);
  }
  for (const t of results.totalesQueNoCierran || []) {
    avisos.push(`El total de <strong>${esc(t.label)}</strong> en ${esc(periodQuincenaLabel(t.period, t.quincena))} `
      + `no cierra contra la fila TOTAL GENERAL del archivo: el archivo dice `
      + `<strong>${fmtNum(t.archivo)}</strong> y la suma de los empleados da <strong>${fmtNum(t.calculado)}</strong>. `
      + `No bloquea la corrida y no va al PDF.`);
  }
  if (results.summary.empleadosAnterior !== results.summary.empleadosActual) {
    avisos.push(`La dotación cambió entre períodos: ${results.summary.empleadosAnterior} empleados en `
      + `${esc(labelAnterior)} vs ${results.summary.empleadosActual} en ${esc(labelActual)}.`);
  }
  if (avisos.length > 0) {
    const box = document.createElement('div');
    box.style.cssText = 'margin:var(--sp-3) var(--sp-3) 0;padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-border);border-left:4px solid var(--color-warning);border-radius:var(--radius-md);background:var(--color-surface);font-size:var(--text-sm);';
    box.innerHTML = `<strong>Avisos del procesamiento</strong><ul style="margin:6px 0 0 18px;">`
      + avisos.map(a => `<li>${a}</li>`).join('') + `</ul>`;
    container.appendChild(box);
  }

  // ── Solapas Resumen · Planilla ────────────────────────────────────────────
  // El exportar ya no vive en una barra propia arriba de las solapas: va último
  // a la derecha de la barra estándar de la Planilla, como en los otros 20
  // controles (§3 de specs/vista-estandar-resultados.md). La salida a PDF es un
  // ítem más de ese mismo menú — un segundo botón de exportar al lado sería
  // justo lo que el estándar viene a sacar.
  const tabsHost = document.createElement('div');
  container.appendChild(tabsHost);

  renderResumenDetalle(tabsHost, {
    controlId: results.reporte.id,
    conDiferencias: conDif.length > 0,
    resumen: panelEl => renderPanel(panelEl, {
      results, relevantes, conDif, grupos, casos, sinCausa, labelAnterior, labelActual,
    }),
    planilla: panelEl => renderPlanilla(panelEl, {
      results, relevantes, conDif, grupos, casos, labelAnterior, labelActual,
    }),
  });
}

/** Los tres del estándar más la salida a PDF, que es propia de este reporte. */
function mountExportMenu(exportEl, { results, relevantes, grupos, labelAnterior, labelActual }) {
  const csvHeaders = ['Concepto', 'Legajo', 'Apellido y Nombre', labelAnterior, labelActual, 'Modificación', 'Variación $', 'Variación %'];
  const csvRows = () => grupos.flatMap(g =>
    relevantes.filter(r => isDif(r.valores[g.key].diff)).map(r => {
      const v = r.valores[g.key];
      return [g.nombreReal || g.label, r.legajo, r.nombre, v.anterior, v.actual, isDif(v.diff) ? 'S' : 'N', v.diff, v.pct];
    })
  );
  renderExportMenu(exportEl, {
    items: [
      { key: 'excel', label: '📊 Exportar a Excel (.xlsx)',
        action: () => exportVariacionesXlsx(results, relevantes) },
      { key: 'csv', label: '📄 Exportar CSV',
        action: () => downloadCsv(csvHeaders, csvRows(), `${nombreArchivo(results)}.csv`) },
      { key: 'copy', label: '📋 Copiar tabla',
        action: () => copyRowsToClipboard(csvHeaders, csvRows()) },
      { key: 'pdf', label: '🖨 Imprimir / PDF',
        desc: 'El reporte en A4 horizontal, para firmar o mandar.',
        action: () => imprimirVariaciones(results, relevantes) },
    ],
  });
}

// ── Solapa "Qué cambió y por qué" (Dirección A) ─────────────────────────────

function renderPanel(container, ctx) {
  const { results, relevantes, conDif, grupos, casos, sinCausa, labelAnterior, labelActual } = ctx;

  const dotacionIgual = results.summary.empleadosAnterior === results.summary.empleadosActual;
  const gruposConEscala = grupos.filter(g => g.escala);

  // El veredicto ya se dibujó afuera de las solapas (ver renderVariacionesResults).
  // Acá va lo que agrega contexto: los tiles, los casos a explicar y la matriz.

  // ── Tiles ───────────────────────────────────────────────────────────────
  // Los contadores de "empleados con / sin variación" NO van acá: ya están en
  // la fila de insights de la card (summarizeVariaciones → insights[]) justo
  // arriba. Estos tiles son sólo para lo que esa fila no dice.
  const tiles = [
    {
      label: 'Dotación',
      value: `${results.summary.empleadosActual}${!dotacionIgual ? ` <small style="font-size:.55em;color:var(--color-text-muted);">vs ${results.summary.empleadosAnterior}</small>` : ''}`,
      sub: dotacionIgual ? 'sin altas ni bajas entre los dos períodos' : 'cambió entre los dos períodos',
    },
  ];
  if (results.bruto) {
    tiles.push({
      label: 'Bruto de la liquidación',
      value: `<span style="color:${claseVar(results.bruto.diff)};">${flechaVar(results.bruto.diff)} ${fmtNum(Math.abs(results.bruto.diff))}</span>`,
      sub: `${fmtPct(results.bruto.pct)} · ${fmtNum(results.bruto.anterior)} → ${fmtNum(results.bruto.actual)}`,
    });
  }
  if (gruposConEscala.length > 0) {
    tiles.push({
      label: 'Bajaron de escalón',
      value: `${casos.length} <small style="font-size:.55em;color:var(--color-text-muted);">de ${relevantes.length}</small>`,
      tone: casos.length > 0 ? 'warn' : undefined,
      sub: `${casos.length - sinCausa.length} con causa · ${sinCausa.length} sin causa`,
    });
    tiles.push({
      label: 'Sin causa en el tabulado',
      value: `${sinCausa.length} <small style="font-size:.55em;color:var(--color-text-muted);">de ${casos.length || 0}</small>`,
      tone: sinCausa.length > 0 ? 'error' : undefined,
      sub: 'sin licencia, ausencia, franco ni permiso cargado',
    });
  }
  renderTiles(container, tiles);

  // ── Legajos para poder explicar ────────────────────────────────────────
  // `renderIssues` agrupa por legajo (`groupBy: 'who'`), así que un empleado que
  // bajó de escalón en dos conceptos sale en un solo bloque con las dos caídas.
  if (casos.length > 0) {
    const maxCasos = 10;
    renderIssues(container, {
      heading: `Legajos para poder explicar · ${casos.length} de ${relevantes.length}`,
      items: casos.slice(0, maxCasos).map(c => ({
        sev:  c.explicado ? 'lo' : 'hi',
        who:  c.row.nombre,
        sub:  `Legajo ${c.row.legajo}${grupos.length > 1 ? ` · ${c.grupo.nombreReal || c.grupo.label}` : ''}`,
        // `what` lleva los importes y `right` el escalón: el escalón es el
        // titular del caso ("pasó de 100% a 70%"), los pesos el respaldo.
        what: `${fmtNum(c.v.anterior)} → ${fmtNum(c.v.actual)} (${fmtNum(c.v.diff)})`,
        why:  c.explicado
          ? `Se explica: tiene ${fmtNum(c.row.ausenciaActual)} de licencia, ausencia, franco o permiso cargado en ${labelActual}.`
          : `Sin nada cargado en ${labelActual} que lo explique.`,
        right: `<span class="mv-dn">▼ ${c.v.escalonAnterior}% → ${c.v.escalonActual}%</span>`,
      })),
    });
    if (casos.length > maxCasos) {
      const mas = document.createElement('p');
      mas.className = 'text-muted';
      mas.style.cssText = 'font-size:var(--text-sm);margin:var(--sp-2) 0 0;';
      mas.textContent = `+${casos.length - maxCasos} más — ver la solapa «Detalle».`;
      container.appendChild(mas);
    }
  }

  // ── Matriz de transición por concepto con escala ───────────────────────
  for (const g of gruposConEscala) {
    const escalaDesc = [...g.escala].sort((a, b) => b - a).map(v => escalonDe(v, g.escala));
    const conteo = new Map(); // "de|a" -> n
    let max = 0;
    for (const r of relevantes) {
      const v = r.valores[g.key];
      if (v.escalonAnterior === null || v.escalonActual === null) continue;
      const key = `${v.escalonAnterior}|${v.escalonActual}`;
      const n = (conteo.get(key) || 0) + 1;
      conteo.set(key, n);
      if (n > max) max = n;
    }
    if (max === 0) continue;

    const sec = document.createElement('div');
    sec.style.cssText = 'margin:var(--sp-4) var(--sp-3) 0;padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);overflow-x:auto;';
    const titulo = grupos.length > 1 ? `Concepto ${esc(g.nombreReal || g.label)} — ` : '';
    let tabla = `<div style="font-size:var(--text-sm);font-weight:700;margin-bottom:var(--sp-2);">${titulo}Cómo se movieron los escalones</div>
      <table style="border-collapse:separate;border-spacing:3px;font-size:var(--text-sm);width:auto;">
        <thead><tr><th></th>${escalaDesc.map(p => `<th style="padding:2px 8px;font-size:var(--text-xs);color:var(--color-text-muted);">${p}%</th>`).join('')}</tr></thead>
        <tbody>`;
    for (const de of escalaDesc) {
      tabla += `<tr><th style="text-align:right;padding-right:8px;font-size:var(--text-xs);color:var(--color-text-muted);">${de}%</th>`;
      for (const a of escalaDesc) {
        const n = conteo.get(`${de}|${a}`) || 0;
        const t = n === 0 ? 0 : Math.sqrt(n / max);
        const bg = n === 0 ? 'transparent' : `color-mix(in srgb, var(--color-primary) ${Math.round(12 + t * 76)}%, var(--color-surface))`;
        // Cuando la celda ya está bastante teñida de celeste, el texto se da
        // vuelta. Sale del token y no de un '#fff' cableado: en Oscuro el
        // celeste es más claro y el blanco encima deja de leerse.
        const fg = t > 0.62 ? 'var(--on-celeste)' : 'inherit';
        const diag = de === a ? 'outline:2px solid var(--color-border);outline-offset:-1px;' : '';
        tabla += `<td style="width:52px;height:36px;text-align:center;border:1px solid var(--color-border);border-radius:var(--radius-sm);font-weight:700;font-variant-numeric:tabular-nums;background:${bg};color:${fg};${diag}" title="${n} legajo${n === 1 ? '' : 's'} de ${de}% a ${a}%">${n || '—'}</td>`;
      }
      tabla += `</tr>`;
    }
    tabla += `</tbody></table>`;
    sec.innerHTML = tabla;
    container.appendChild(sec);
  }
}

// ── Solapa "Planilla" (Dirección C) ─────────────────────────────────────────
//
// Una sola tabla ancha con **una banda por concepto**, en vez de una tabla
// apilada abajo de la otra por cada concepto. Es el §5 de la vista estándar y
// además resuelve lo que la pila no podía: comparar el mismo legajo entre
// conceptos sin scrollear de una tabla a la otra, y una fila de TOTAL que
// totaliza cada columna.
//
// El escalón sigue donde sirve —la matriz de transición y los casos para
// explicar, en el Resumen—; acá va sólo como una columna más de la banda
// (`70% → 50%`), que es lo que la planilla puede mostrar sin volverse otra cosa.

/** Una fila por legajo, con las columnas de todos los conceptos aplanadas. */
function filaPlana(r, grupos) {
  const o = { legajo: r.legajo, nombre: r.nombre, _row: r };
  for (const g of grupos) {
    const v = r.valores[g.key];
    o[`ant_${g.key}`] = v.anterior;
    o[`act_${g.key}`] = v.actual;
    o[`dif_${g.key}`] = v.diff;
    o[`pct_${g.key}`] = v.pct;
    o[`esc_${g.key}`] = (v.escalonAnterior === null || v.escalonAnterior === undefined)
      ? null
      : `${v.escalonAnterior}% → ${v.escalonActual}%`;
  }
  return o;
}

/**
 * En qué estado cerró un legajo. "Con diferencia" acá se lee "con variación": es
 * el mismo `isDif` con el que el control cuenta los empleados con variación y
 * con el que mide el semáforo, así que el chip y los tiles nunca se contradicen.
 *
 * El alta y la baja NO son un estado: un legajo que no estaba el mes pasado sí
 * tiene variación, y el control ya la cuenta. Van a "Marcas ▾", que es donde va
 * lo que le pasa al caso además de cómo cerró.
 */
function estadoDeVariacion(r, grupos) {
  const difs = grupos.map(g => r.valores[g.key].diff);
  if (difs.every(d => d === null || d === undefined)) return 'sinComparar';
  if (difs.some(d => isDif(d))) return 'conDif';
  const max = difs.reduce((m, d) => Math.max(m, Math.abs(d ?? 0)), 0);
  return max <= TOL ? 'centavo' : 'margen';
}

const NO_APLICA_VARIACION = {
  sinComparar: 'los dos períodos salen de un Tabulado, así que siempre hay los dos lados',
};

function renderPlanilla(container, ctx) {
  const { results, relevantes, grupos, casos, labelAnterior, labelActual } = ctx;

  // §11.1 — ocultar los conceptos que no tienen ninguna variación.
  const gruposConDif = grupos.filter(g => relevantes.some(r => isDif(r.valores[g.key].diff)));
  const gruposVisibles = gruposConDif.length > 0 ? gruposConDif : grupos;
  const ocultos = grupos.length - gruposVisibles.length;

  const rows = relevantes.map(r => filaPlana(r, gruposVisibles));

  const columns = [
    { key: 'legajo', label: 'Legajo',            band: 'Identificación' },
    { key: 'nombre', label: 'Apellido y Nombre', band: 'Identificación' },
    ...gruposVisibles.flatMap(g => {
      const banda = results.reporte.combinar ? results.reporte.titulo : (g.nombreReal || g.label);
      return [
        { key: `ant_${g.key}`, label: labelAnterior, sub: 'lo liquidado', num: true, band: banda },
        { key: `act_${g.key}`, label: labelActual,   sub: 'lo liquidado', num: true, band: banda },
        ...(g.escala ? [{ key: `esc_${g.key}`, label: 'Escalón', sub: 'anterior → actual', band: banda }] : []),
        // La variación NO es una diferencia contra otra fuente: es lo que este
        // reporte informa. Flecha + signo (nunca sólo color, D-daltonismo), no
        // badge de error — el rojo se reserva para lo que no cuadra.
        { key: `dif_${g.key}`, label: 'Variación', sub: 'actual − anterior',
          num: true, band: banda,
          cell: r => (r[`dif_${g.key}`] === null || r[`dif_${g.key}`] === undefined
            ? '—'
            : `<span class="${mvClass(r[`dif_${g.key}`])}">${mvArrow(r[`dif_${g.key}`])} ${esc(fmtSigned(r[`dif_${g.key}`]))}</span>`) },
        { key: `pct_${g.key}`, label: 'Variación %', sub: 'sobre el período anterior',
          num: true, band: banda, close: true, total: false,
          cell: r => esc(fmtPct(r[`pct_${g.key}`])) },
      ];
    }),
  ];

  // El segundo eje: hacia dónde se movió, y qué le pasó al legajo entre los dos
  // períodos. Los dos selects sueltos de antes ("solo aumentos / solo bajas" y
  // "solo con variación") viven ahora uno acá y el otro en los chips.
  const bajaronEscalon = new Set(casos.map(c => c.row));
  const sinCausaSet = new Set(casos.filter(c => !c.explicado).map(c => c.row));
  const marcas = [
    { value: 'up',   label: 'Sólo aumentos',
      match: r => gruposVisibles.some(g => isDif(r[`dif_${g.key}`]) && r[`dif_${g.key}`] > 0) },
    { value: 'dn',   label: 'Sólo bajas',
      match: r => gruposVisibles.some(g => isDif(r[`dif_${g.key}`]) && r[`dif_${g.key}`] < 0) },
    { value: 'alta', label: `No estaba en ${labelAnterior}`, match: r => !r._row.presenteAnterior },
    { value: 'baja', label: `No está en ${labelActual}`,     match: r => !r._row.presenteActual },
    ...(casos.length > 0 ? [
      { value: 'escalon',  label: 'Bajaron de escalón',        match: r => bajaronEscalon.has(r._row) },
      { value: 'sincausa', label: 'Bajaron sin causa cargada', match: r => sinCausaSet.has(r._row) },
    ] : []),
  ];

  renderPlanillaPanel(container, {
    rows,
    columns,
    unitLabel: 'legajos',
    estadoDe: r => estadoDeVariacion(r._row, gruposVisibles),
    noAplica: NO_APLICA_VARIACION,
    marcas,
    getLabel: r => (r.nombre ? `${r.legajo} — ${r.nombre}` : `${r.legajo}`),
    searchLabel: 'Buscar legajo o nombre',
    // Los encabezados de esta planilla ordenan porque las tablas que reemplaza
    // ya ordenaban: "quién subió más" es la lectura más frecuente del reporte.
    sortable: true,
    onExport: (exportEl) => mountExportMenu(exportEl, { results, relevantes, grupos, labelAnterior, labelActual }),
    emptyText: 'Ningún empleado quedó con los filtros puestos.',
    footnote: (shown) => `Mostrando ${shown.length} de ${rows.length} empleado${rows.length === 1 ? '' : 's'} `
      + `con valor en alguno de los dos períodos. Clickeá un encabezado para ordenar. `
      + `«—» es que ese período no trae el concepto para ese legajo, no un cero.`
      + (ocultos > 0 ? ` Se ocultan ${ocultos} concepto${ocultos === 1 ? '' : 's'} sin variación.` : ''),
  });
}

export const renderVariacionesSueldosResults   = renderVariacionesResults;
export const renderVariacionesConceptosResults = renderVariacionesResults;

// ── Export a Excel ───────────────────────────────────────────────────────────

function nombreArchivo(results) {
  const base = results.reporte.id === 'variaciones_sueldos' ? 'Variacion_Sueldos' : 'Variacion_Conceptos';
  return `${base}_${periodSuffix(results.periodAnterior)}_vs_${periodSuffix(results.period)}`;
}

async function exportVariacionesXlsx(results, relevantes) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const labelAnterior = etiquetaAnterior(results);
  const labelActual   = etiquetaActual(results);
  const tipo = tipoLiquidacionLinea(results);

  for (const g of results.grupos) {
    const nombreHoja = (results.reporte.combinar ? 'Variación' : g.key).slice(0, 31);
    const ws = wb.addWorksheet(nombreHoja);

    ws.addRow([results.reporte.titulo]).font = { bold: true, size: 13 };
    ws.addRow([g.nombreReal || g.label]).font = { bold: true };
    ws.addRow([`${labelAnterior} vs ${labelActual}${tipo ? ` — ${tipo}` : ''}`]);
    ws.addRow([]);

    const head = ws.addRow(['Legajo', 'Apellido y Nombre', labelAnterior, labelActual, 'Modificación', 'Variación $', 'Variación %']);
    head.font = { bold: true };

    for (const r of relevantes) {
      const v = r.valores[g.key];
      const fila = ws.addRow([
        r.legajo, r.nombre, v.anterior, v.actual,
        isDif(v.diff) ? 'S' : 'N',
        v.diff, v.pct === null ? 's/base' : v.pct / 100,
      ]);
      fila.getCell(3).numFmt = '#,##0.00';
      fila.getCell(4).numFmt = '#,##0.00';
      fila.getCell(5).alignment = { horizontal: 'center' };
      fila.getCell(6).numFmt = '#,##0.00';
      if (v.pct !== null) fila.getCell(7).numFmt = '0.00%';
    }

    const primeraFilaDatos = 6;
    const ultimaFilaDatos  = primeraFilaDatos + relevantes.length - 1;
    const total = ws.addRow([
      'TOTAL GENERAL', '',
      { formula: `SUM(C${primeraFilaDatos}:C${ultimaFilaDatos})` },
      { formula: `SUM(D${primeraFilaDatos}:D${ultimaFilaDatos})` },
      null,
      { formula: `SUM(F${primeraFilaDatos}:F${ultimaFilaDatos})` },
      null,
    ]);
    total.font = { bold: true };
    [3, 4, 6].forEach(c => { total.getCell(c).numFmt = '#,##0.00'; });

    ws.columns = [{ width: 10 }, { width: 34 }, { width: 18 }, { width: 18 }, { width: 13 }, { width: 16 }, { width: 12 }];
  }

  await downloadWorkbook(wb, `${nombreArchivo(results)}.xlsx`);
}

// ── Salida a PDF (A4 horizontal) ─────────────────────────────────────────────

/**
 * Grupos con al menos un dato real en algún período. Un grupo cuyas entradas
 * están TODAS en `faltantes` con enPrev y enAct en false no tiene nada real
 * para mostrar — su sección en el PDF saldría entera en 0,00 → 0,00 → "N",
 * indistinguible de un cero real verificado (el PDF no tiene dónde poner el
 * aviso por fila que sí se muestra en pantalla). Exportada para poder testear
 * el filtro sin depender de `window`.
 */
export function gruposParaImprimir(grupos, faltantes) {
  const sinDato = new Set((faltantes || [])
    .filter(f => !f.enPrev && !f.enAct)
    .map(f => f.id));
  return grupos.filter(g => !g.entradas.every(e => sinDato.has(entryId(e))));
}

/**
 * Abre una ventana con el documento del reporte listo para imprimir a PDF.
 * Es el entregable que se le manda al cliente: encabezado con la empresa, el
 * período comparado y la dotación, thead repetido en cada página y una sección
 * por concepto arrancando en página nueva.
 */
function imprimirVariaciones(results, relevantes) {
  const labelAnterior = etiquetaAnterior(results);
  const labelActual   = etiquetaActual(results);
  const tipo = tipoLiquidacionLinea(results);
  const empresa = results.empresa || 'OPmobility C-Power Argentina S.A.';

  const gruposImprimibles = gruposParaImprimir(results.grupos, results.faltantes);
  const omitidos = results.grupos.length - gruposImprimibles.length;

  const secciones = gruposImprimibles.length === 0
    ? `<p style="color:#8C837B;font-size:0.8rem;">Ningún concepto tiene datos en los dos períodos comparados.</p>`
    : gruposImprimibles.map((g, i) => {
    const totAnt = relevantes.reduce((s, r) => s + (r.valores[g.key].anterior ?? 0), 0);
    const totAct = relevantes.reduce((s, r) => s + (r.valores[g.key].actual ?? 0), 0);
    const totDif = totAct - totAnt;
    const filas = relevantes.map(r => {
      const v = r.valores[g.key];
      const cls = isDif(v.diff) ? (v.diff > 0 ? 'pos' : 'neg') : 'zero';
      return `<tr>
        <td class="c">${esc(r.legajo)}</td>
        <td>${esc(r.nombre)}</td>
        <td class="r">${fmtNum0(v.anterior)}</td>
        <td class="r">${fmtNum0(v.actual)}</td>
        <td class="c ${cls}">${isDif(v.diff) ? 'S' : 'N'}</td>
        <td class="r ${cls}">${fmtNum0(v.diff)}</td>
        <td class="r ${cls}">${fmtPct(v.pct)}</td>
      </tr>`;
    }).join('');

    return `
      <div class="sec ${i > 0 ? 'break' : ''}">
        ${results.reporte.combinar ? '' : `<h2>Concepto ${esc(g.nombreReal || g.label)}</h2>`}
        <table>
          <thead>
            <tr>
              <th class="c">Legajo</th><th>Apellido y Nombre</th>
              <th class="r">${esc(labelAnterior)}</th><th class="r">${esc(labelActual)}</th>
              <th class="c">Modificación</th>
              <th class="r">Variación $</th><th class="r">Variación %</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
          <tfoot>
            <tr>
              <td colspan="2">TOTAL GENERAL — ${relevantes.length} empleados</td>
              <td class="r">${fmtNum0(totAnt)}</td>
              <td class="r">${fmtNum0(totAct)}</td>
              <td class="c">—</td>
              <td class="r">${fmtNum0(totDif)}</td>
              <td class="r">${fmtPct(calcularPct(totAnt, totAct))}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<title>${esc(results.reporte.titulo)} — ${esc(labelAnterior)} vs ${esc(labelActual)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  body { font-family: 'Source Sans Pro', Arial, sans-serif; color: #15263D; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #00ACD4; padding-bottom: 10px; margin-bottom: 14px; }
  .head h1 { font-size: 1.15rem; margin: 2px 0 0; }
  .type { font-size: 0.66rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #007896; }
  .meta { font-size: 0.78rem; color: #4A6080; margin-top: 4px; }
  .meta.sub { font-size: 0.7rem; color: #8C837B; margin-top: 2px; }
  .badge { background: #00ACD4; color: #fff; font-size: 0.7rem; font-weight: 700;
           padding: 4px 12px; border-radius: 999px; white-space: nowrap; }
  .sec h2 { font-size: 0.98rem; margin: 16px 0 6px; }
  .sec.break { page-break-before: always; }
  table { width: 100%; border-collapse: collapse; font-size: 0.7rem; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; }
  th { background: #F7F9FB; color: #4A6080; text-align: left; padding: 6px 8px;
       border: 1px solid #E7E6E6; font-size: 0.6rem; text-transform: uppercase; letter-spacing: .06em; }
  td { padding: 4px 8px; border: 1px solid #EFEEEC; }
  tbody tr:nth-child(even) { background: #FAFCFE; }
  .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .c { text-align: center; }
  .pos { color: #177A50; } .neg { color: #C0420F; } .zero { color: #8C837B; }
  tfoot td { background: #F0F4F8; font-weight: 700; border: 1px solid #E7E6E6; }
  .foot { margin-top: 14px; font-size: 0.64rem; color: #8C837B; }
</style></head><body>
  <div class="head">
    <div>
      <div class="type">${esc(results.reporte.titulo)}</div>
      <h1>${esc(empresa)}</h1>
      <div class="meta">Período comparado: <strong>${esc(labelAnterior)} vs ${esc(labelActual)}</strong></div>
      ${tipo ? `<div class="meta sub">Liquidación: ${esc(tipo)}</div>` : ''}
    </div>
    <div class="badge">${relevantes.length} empleados</div>
  </div>
  ${secciones}
  ${omitidos > 0 ? `<div class="foot">
    ${omitidos} concepto${omitidos === 1 ? '' : 's'} sin datos en los dos períodos no `
      + `se incluye${omitidos === 1 ? '' : 'n'} en este reporte.
  </div>` : ''}
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana de impresión. Habilitá las ventanas emergentes para este sitio y volvé a intentar.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}
