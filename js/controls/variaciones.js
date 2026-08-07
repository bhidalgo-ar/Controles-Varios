// variaciones.js — Variación de conceptos liquidados entre dos períodos
//
// Único control del proyecto que cruza el Tabulado contra el Tabulado de OTRO
// período (mes anterior vs mes actual) en lugar de contra un reporte del mismo
// período. El período anterior lo resuelve el wizard: reusa el Tabulado ya
// cargado en una corrida anterior del cliente (IndexedDB) y, si no está, pide el
// archivo como archivo adicional.
//
// Dos reportes, con los mismos campos de salida y distinta agrupación de conceptos:
//   - Variación Sueldos:   899999 (jornales) + 1000 (mensuales) sumados en una columna.
//   - Variación Conceptos: 2517 y 2519, cada uno en su propia sección.
//
// Los códigos 1028 / 1029 que aparecen en documentos de referencia del cliente son
// de otro sistema de liquidación y no se usan como identificador (2517=1028, 2519=1029).
//
// Ver specs/reporte-variaciones-opmobility.md y D-022 / D-023 en DECISIONS.md.

import { diffStats } from './semaforo.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { initShowMorePagination, initSearchCombobox } from '../ui/tableTools.js';
import { initTabs } from '../ui/tabs.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { periodToLabel } from '../utils/dates.js';

/** Tolerancia de comparación de importes: medio centavo. */
const TOL = 0.01;

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
// sola y no entra en "legajos para poder explicar". No es exhaustivo: son los
// códigos que aparecieron en los dos tabulados de muestra de OPmobility.
const CODIGOS_AUSENCIA = ['1500', '1510', '1530', '1625', '1915', '1698', '1047', '1049'];

/** Cantidad máxima de "escalones" para tratar una columna como discreta. */
const MAX_VALORES_ESCALA = 6;

// ── Helpers de datos ─────────────────────────────────────────────────────────

const norm = v => (v === null || v === undefined ? '' : String(v).trim());

/** Parsea un importe en formato es-AR ("1.234,56", "(1.234,56)", "-1.234,56"). */
function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/ /g, ' ').trim();
  if (s === '' || s === '-') return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  s = s.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

/** Código del encabezado de concepto: "899999 - BASE de Escala…" → "899999". */
function codigoDeHeader(header) {
  const m = norm(header).match(/^(\d+)\s*-\s*/);
  return m ? m[1] : null;
}

/**
 * Mapea código de concepto → nombre de columna, a partir de las claves de las
 * filas. Se resuelve por lado (anterior y actual) porque el nombre del concepto
 * puede cambiar entre períodos, y porque la cantidad de columnas del Tabulado
 * varía según qué conceptos se liquidaron ese mes.
 */
function columnasPorCodigo(rows) {
  const out = {};
  for (const key of clavesDeFilas(rows)) {
    const cod = codigoDeHeader(key);
    if (cod !== null && out[cod] === undefined) out[cod] = key;
  }
  return out;
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

// Agrupa filas por legajo preservando el orden de aparición. Un legajo puede
// tener más de una liquidación en el mismo período (mensual + baja, quincena +
// sobregiro) y el importe del concepto es la suma de todas.
function groupRowsByLegajo(rows, legajoColumn) {
  const groups = new Map();
  for (const row of rows) {
    const id = norm(row[legajoColumn]);
    if (!id) continue;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

// Suma un concepto a través de las liquidaciones de un legajo.
// null = la columna no existe o ninguna liquidación tiene dato; 0 = hay dato y es cero.
function sumColumn(group, col) {
  if (!col) return null;
  let total = null;
  for (const row of group) {
    const v = toNum(row[col]);
    total = (total === null && v === null) ? null : (total ?? 0) + (v ?? 0);
  }
  return total;
}

/** Suma varios conceptos de un mismo legajo (para el reporte de Sueldos). */
function sumConceptos(group, columnas, codigos) {
  let total = null;
  for (const cod of codigos) {
    const v = sumColumn(group, columnas[cod]);
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

/** Suma los conceptos de licencia/ausencia conocidos para un legajo y período. */
function sumaAusencias(group, columnas) {
  let total = 0;
  for (const cod of CODIGOS_AUSENCIA) {
    const v = sumColumn(group, columnas[cod]);
    if (v !== null) total += v;
  }
  return total;
}

const isDif = v => v !== null && Math.abs(v) > TOL;

const fmtNum = v => v === null
  ? '—'
  : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
 * @param {object[]} prevRowsFile filas del Tabulado anterior subido como archivo adicional
 * @param {object[]} tabRows      filas del Tabulado del período actual
 * @param {object}   mapping      { tab, period, variacionesPrev? }
 * @param {object}   reporte      { id, titulo, conceptos, combinar }
 */
function runVariaciones(prevRowsFile, tabRows, mapping, reporte) {
  if (!tabRows || tabRows.length === 0) {
    return { error: 'Falta el Tabulado del período actual. Cargalo en el Paso 2.' };
  }

  // El período anterior sale del archivo subido o de una corrida anterior del cliente.
  const prevGuardado = mapping.variacionesPrev || null;
  const prevRows = (prevRowsFile && prevRowsFile.length > 0)
    ? prevRowsFile
    : (prevGuardado?.rows || []);

  if (prevRows.length === 0) {
    return {
      error: 'No hay Tabulado del período anterior para comparar. Corré primero el control en el período '
        + 'anterior, o cargá ese Tabulado en el Paso 2 ("Tabulado del período anterior").',
    };
  }

  const periodoActual   = mapping.period || null;
  const periodoAnterior = (prevRowsFile && prevRowsFile.length > 0)
    ? (mapping.variacionesPrevFilePeriod || null)
    : (prevGuardado?.period || null);

  if (periodoActual && periodoAnterior && periodoActual === periodoAnterior) {
    return {
      error: `El Tabulado del período anterior corresponde al mismo período que el actual `
        + `(${periodToLabel(periodoActual)}). Verificá los archivos.`,
    };
  }

  const legPrev = resolverColumnaLegajo(prevRows, mapping.tab?.empleadoColumn);
  const legAct  = resolverColumnaLegajo(tabRows, mapping.tab?.empleadoColumn);
  if (!legPrev || !legAct) {
    return { error: 'No se pudo identificar la columna de Legajo en el Tabulado. Revisá el mapeo de columnas.' };
  }
  const nomAct  = resolverColumnaNombre(tabRows, mapping.tab?.apellidoNombreColumn);
  const nomPrev = resolverColumnaNombre(prevRows, mapping.tab?.apellidoNombreColumn);

  const colsPrev = columnasPorCodigo(prevRows);
  const colsAct  = columnasPorCodigo(tabRows);

  const gPrev = groupRowsByLegajo(prevRows, legPrev);
  const gAct  = groupRowsByLegajo(tabRows, legAct);

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
        codigos: reporte.conceptos.map(c => c.codigo),
        label: reporte.titulo,
        nombreReal: null,
      }]
    : reporte.conceptos.map(c => ({
        key: c.codigo,
        codigos: [c.codigo],
        label: `${c.codigo} - ${c.label}`,
        // Nombre tal como figura en el Tabulado, que es el que va al reporte.
        nombreReal: colsAct[c.codigo] || colsPrev[c.codigo] || null,
      }));

  const brutoPrevCol = resolverColumnaBruto(prevRows);
  const brutoActCol  = resolverColumnaBruto(tabRows);

  const rows = legajos.map(legajo => {
    const grupoPrev = gPrev.get(legajo) || [];
    const grupoAct  = gAct.get(legajo) || [];
    const nombre = (grupoAct[0] && nomAct && norm(grupoAct[0][nomAct]))
      || (grupoPrev[0] && nomPrev && norm(grupoPrev[0][nomPrev]))
      || '(sin nombre)';

    const valores = {};
    for (const g of grupos) {
      const anterior = sumConceptos(grupoPrev, colsPrev, g.codigos);
      const actual   = sumConceptos(grupoAct, colsAct, g.codigos);
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
      ausenciaAnterior: sumaAusencias(grupoPrev, colsPrev),
      ausenciaActual:   sumaAusencias(grupoAct, colsAct),
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
    g.escala = (g.codigos.length === 1)
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

  // Conceptos configurados que no se liquidaron en un período: se computan en 0,
  // no es un error. Se informa como aviso en la pantalla de resultados.
  const faltantes = [];
  for (const c of reporte.conceptos) {
    const enPrev = colsPrev[c.codigo] !== undefined;
    const enAct  = colsAct[c.codigo] !== undefined;
    if (!enPrev || !enAct) {
      faltantes.push({ codigo: c.codigo, label: c.label, enPrev, enAct });
    }
  }

  const brutoAnterior = brutoPrevCol ? rows.reduce((s, r) => s + (r.bruto.anterior ?? 0), 0) : null;
  const brutoActual   = brutoActCol  ? rows.reduce((s, r) => s + (r.bruto.actual ?? 0), 0) : null;

  return {
    period: periodoActual,
    periodAnterior: periodoAnterior,
    prevOrigen: (prevRowsFile && prevRowsFile.length > 0) ? 'archivo' : 'corrida-anterior',
    reporte: { id: reporte.id, titulo: reporte.titulo, combinar: reporte.combinar },
    grupos,
    rows,
    faltantes,
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

export function runVariacionesSueldos(primaryRows, tabRows, mapping) {
  return runVariaciones(primaryRows, tabRows, mapping, {
    id: 'variaciones_sueldos',
    titulo: 'Variación Sueldos',
    conceptos: VARIACIONES_SUELDOS_CONCEPTS,
    combinar: true,
  });
}

export function runVariacionesConceptos(primaryRows, tabRows, mapping) {
  return runVariaciones(primaryRows, tabRows, mapping, {
    id: 'variaciones_conceptos',
    titulo: 'Variación Conceptos',
    conceptos: VARIACIONES_CONCEPTOS_CONCEPTS,
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

const claseVar = diff => (diff > TOL ? 'var(--color-success)' : (diff < -TOL ? 'var(--color-danger)' : 'var(--color-text-muted)'));
const flechaVar = diff => (diff > TOL ? '▲' : (diff < -TOL ? '▼' : '–'));

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
    ? `${periodToLabel(results.periodAnterior)} vs ${periodToLabel(results.period)}`
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
    contextNote: results.prevOrigen === 'corrida-anterior'
      ? `período anterior tomado de la corrida de ${periodToLabel(results.periodAnterior)}`
      : 'período anterior tomado del archivo cargado',
  };
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

  const labelAnterior = results.periodAnterior ? periodToLabel(results.periodAnterior) : 'Período anterior';
  const labelActual   = results.period ? periodToLabel(results.period) : 'Período actual';
  const casos = casosDeEscalon(relevantes, grupos);
  const sinCausa = casos.filter(c => !c.explicado);

  // ── Hero: sin variación vs con variación ──────────────────────────────────
  const hero = document.createElement('div');
  hero.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-5);padding:var(--sp-3) var(--sp-4);margin:var(--sp-3) var(--sp-3) 0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);';
  hero.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:8px;">
      <span style="font-size:1.8em;font-weight:700;color:var(--color-success);">${okCount}</span>
      <span style="font-size:var(--text-sm);color:var(--color-text-muted);">sin variación</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;">
      <span style="font-size:1.8em;font-weight:700;color:${conDif.length > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'};">${conDif.length}</span>
      <span style="font-size:var(--text-sm);color:var(--color-text-muted);">con variación</span>
    </div>
    <div style="margin-left:auto;font-size:var(--text-sm);color:var(--color-text-muted);text-align:right;">
      ${esc(labelAnterior)} → ${esc(labelActual)}
      ${sinValor > 0 ? `<br>${sinValor} sin valores en ningún período (no se muestran)` : ''}
    </div>
  `;
  container.appendChild(hero);

  // ── Avisos ────────────────────────────────────────────────────────────────
  const avisos = [];
  if (results.prevOrigen === 'corrida-anterior') {
    avisos.push(`El período anterior se tomó del Tabulado ya cargado en la corrida de ${esc(labelAnterior)}.`);
  }
  for (const f of results.faltantes) {
    const donde = !f.enPrev && !f.enAct
      ? 'en ninguno de los dos períodos'
      : (!f.enPrev ? `en ${esc(labelAnterior)}` : `en ${esc(labelActual)}`);
    avisos.push(`El concepto <strong>${esc(f.codigo)}</strong> (${esc(f.label)}) no se liquidó ${donde} — se computa en 0,00.`);
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

  // ── Toolbar (export + PDF, disponibles sin importar la solapa activa) ─────
  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  toolbar.style.cssText = 'display:flex;justify-content:flex-end;';
  const right = document.createElement('div');
  right.style.cssText = 'display:flex;align-items:center;gap:var(--sp-2);';
  toolbar.appendChild(right);
  container.appendChild(toolbar);

  const csvHeaders = ['Concepto', 'Legajo', 'Apellido y Nombre', labelAnterior, labelActual, 'Variación $', 'Variación %'];
  const csvRows = () => grupos.flatMap(g =>
    relevantes.filter(r => isDif(r.valores[g.key].diff)).map(r => {
      const v = r.valores[g.key];
      return [g.nombreReal || g.label, r.legajo, r.nombre, v.anterior, v.actual, v.diff, v.pct];
    })
  );
  renderExportMenu(right, {
    onExcel: () => exportVariacionesXlsx(results, relevantes),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `${nombreArchivo(results)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
  const btnPdf = document.createElement('button');
  btnPdf.type = 'button';
  btnPdf.className = 'btn btn--sm';
  btnPdf.textContent = '🖨 Imprimir / PDF';
  btnPdf.addEventListener('click', () => imprimirVariaciones(results, relevantes));
  right.insertBefore(btnPdf, right.firstChild);

  // ── Solapas: "Qué cambió y por qué" (por defecto) y "Detalle" ─────────────
  const tabsHost = document.createElement('div');
  container.appendChild(tabsHost);

  initTabs(tabsHost, {
    activeId: 'panel',
    tabs: [
      {
        id: 'panel',
        label: 'Qué cambió y por qué',
        render: panelEl => renderPanel(panelEl, {
          results, relevantes, conDif, grupos, casos, sinCausa, labelAnterior, labelActual,
        }),
      },
      {
        id: 'detalle',
        label: 'Detalle',
        render: panelEl => renderDetalle(panelEl, {
          results, relevantes, conDif, grupos, labelAnterior, labelActual,
        }),
      },
    ],
  });
}

// ── Solapa "Qué cambió y por qué" (Dirección A) ─────────────────────────────

function renderPanel(container, ctx) {
  const { results, relevantes, conDif, grupos, casos, sinCausa, labelAnterior, labelActual } = ctx;

  const dotacionIgual = results.summary.empleadosAnterior === results.summary.empleadosActual;
  const gruposConEscala = grupos.filter(g => g.escala);

  // ── Veredicto ───────────────────────────────────────────────────────────
  // El titular es siempre sobre lo que encontró ESTE reporte (sus propios
  // conceptos), nunca sobre el Bruto total del Tabulado — el Bruto puede caer
  // por conceptos que este reporte ni mira, y usarlo de titular en, por
  // ejemplo, Variación Sueldos, sería atribuirle un hallazgo que no es suyo.
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
  const verdict = document.createElement('div');
  verdict.style.cssText = `display:flex;align-items:flex-start;gap:var(--sp-4);padding:var(--sp-4);margin:var(--sp-3) var(--sp-3) 0;border-radius:var(--radius-md);background:${verdictWarn ? 'var(--color-warning-bg)' : 'var(--color-success-bg)'};`;
  verdict.innerHTML = `
    <span style="font-size:1.4em;flex-shrink:0;">${verdictWarn ? '⚠' : '✓'}</span>
    <div>
      <div style="font-weight:700;font-size:var(--text-md);">${esc(tituloVeredicto)}</div>
      <div style="font-size:var(--text-sm);color:var(--color-text-muted);margin-top:2px;">
        ${esc(labelAnterior)} → ${esc(labelActual)}
        ${results.bruto ? ` · Bruto del Tabulado: ${fmtPct(results.bruto.pct)} (${fmtNum(results.bruto.anterior)} → ${fmtNum(results.bruto.actual)})` : ''}
        ${!dotacionIgual ? ` · la dotación cambió entre períodos` : ''}
      </div>
    </div>`;
  container.appendChild(verdict);

  // ── Tiles ───────────────────────────────────────────────────────────────
  const tiles = document.createElement('div');
  tiles.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin:var(--sp-3) var(--sp-3) 0;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;background:var(--color-surface);';
  const tile = (label, valueHtml, sub) => `
    <div style="padding:var(--sp-3) var(--sp-4);border-right:1px solid var(--color-border);">
      <div style="font-size:var(--text-xs);font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--color-text-muted);margin-bottom:4px;">${esc(label)}</div>
      <div style="font-size:1.6em;font-weight:600;font-variant-numeric:tabular-nums;">${valueHtml}</div>
      ${sub ? `<div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:2px;">${esc(sub)}</div>` : ''}
    </div>`;
  let tilesHtml = tile('Dotación',
    `${results.summary.empleadosActual}${!dotacionIgual ? ` <small style="font-size:.55em;color:var(--color-text-muted);">vs ${results.summary.empleadosAnterior}</small>` : ''}`,
    dotacionIgual ? 'sin altas ni bajas entre los dos períodos' : 'cambió entre los dos períodos');
  if (results.bruto) {
    tilesHtml += tile('Bruto de la liquidación',
      `<span style="color:${claseVar(results.bruto.diff)};">${flechaVar(results.bruto.diff)} ${fmtNum(Math.abs(results.bruto.diff))}</span>`,
      `${fmtPct(results.bruto.pct)} · ${fmtNum(results.bruto.anterior)} → ${fmtNum(results.bruto.actual)}`);
  }
  if (gruposConEscala.length > 0) {
    tilesHtml += tile('Bajaron de escalón',
      `<span style="color:${casos.length > 0 ? 'var(--color-warning)' : 'var(--color-text-muted)'};">${casos.length}</span> <small style="font-size:.55em;color:var(--color-text-muted);">de ${relevantes.length}</small>`,
      `${casos.length - sinCausa.length} con causa · ${sinCausa.length} sin causa`);
    tilesHtml += tile('Sin causa en el tabulado',
      `<span style="color:${sinCausa.length > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'};">${sinCausa.length}</span> <small style="font-size:.55em;color:var(--color-text-muted);">de ${casos.length || 0}</small>`,
      'sin licencia, ausencia, franco ni permiso cargado');
  }
  tiles.innerHTML = tilesHtml;
  container.appendChild(tiles);

  // ── Legajos para poder explicar ────────────────────────────────────────
  if (casos.length > 0) {
    const maxCasos = 10;
    const visibles = casos.slice(0, maxCasos);
    const sec = document.createElement('div');
    sec.style.cssText = 'margin:var(--sp-4) var(--sp-3) 0;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);overflow:hidden;';
    sec.innerHTML = `
      <div style="padding:var(--sp-2) var(--sp-4);font-size:var(--text-xs);font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--color-text-muted);background:var(--color-bg-subtle);border-bottom:1px solid var(--color-border);">
        Legajos para poder explicar · ${casos.length} de ${relevantes.length}
      </div>
      ${visibles.map(c => {
        const stripe = c.explicado ? 'var(--color-warning)' : 'var(--color-danger)';
        const causaTxt = c.explicado
          ? `Se explica: tiene ${fmtNum(c.row.ausenciaActual)} de licencia, ausencia, franco o permiso cargado en ${esc(labelActual)}.`
          : `Sin nada cargado en ${esc(labelActual)} que lo explique.`;
        return `
        <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-2) var(--sp-4);border-bottom:1px solid var(--color-border);border-left:3px solid ${stripe};font-size:var(--text-sm);">
          <div style="min-width:200px;">
            <strong>${esc(c.row.nombre)}</strong>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted);">Legajo ${esc(c.row.legajo)}${grupos.length > 1 ? ` · ${esc(c.grupo.nombreReal || c.grupo.label)}` : ''}</div>
          </div>
          <div style="flex:1;color:var(--color-text-muted);">${esc(causaTxt)}</div>
          <div style="font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--color-danger);">
            ▼ ${c.v.escalonAnterior}% → ${c.v.escalonActual}%
          </div>
        </div>`;
      }).join('')}
      ${casos.length > maxCasos ? `<div style="padding:var(--sp-2) var(--sp-4);font-size:var(--text-sm);color:var(--color-text-muted);">+${casos.length - maxCasos} más — ver solapa «Detalle».</div>` : ''}
    `;
    container.appendChild(sec);
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
      <table style="border-collapse:separate;border-spacing:3px;font-size:var(--text-sm);">
        <thead><tr><th></th>${escalaDesc.map(p => `<th style="padding:2px 8px;font-size:var(--text-xs);color:var(--color-text-muted);">${p}%</th>`).join('')}</tr></thead>
        <tbody>`;
    for (const de of escalaDesc) {
      tabla += `<tr><th style="text-align:right;padding-right:8px;font-size:var(--text-xs);color:var(--color-text-muted);">${de}%</th>`;
      for (const a of escalaDesc) {
        const n = conteo.get(`${de}|${a}`) || 0;
        const t = n === 0 ? 0 : Math.sqrt(n / max);
        const bg = n === 0 ? 'transparent' : `color-mix(in srgb, var(--color-primary) ${Math.round(12 + t * 76)}%, var(--color-surface))`;
        const fg = t > 0.62 ? '#fff' : 'inherit';
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

// ── Solapa "Detalle" (Dirección C) ──────────────────────────────────────────

function renderDetalle(container, ctx) {
  const { results, relevantes, conDif, grupos, labelAnterior, labelActual } = ctx;

  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  const sel = document.createElement('select');
  sel.className = 'form-select form-select--sm';
  sel.innerHTML = `
    <option value="dif">Solo con variación (${conDif.length})</option>
    <option value="all">Todos los empleados (${relevantes.length})</option>
  `;
  if (conDif.length === 0) sel.value = 'all';
  toolbar.appendChild(sel);
  container.appendChild(toolbar);

  const tableHost = document.createElement('div');
  container.appendChild(tableHost);

  // §11.1 — ocultar los grupos de concepto que no tienen ninguna variación.
  const gruposConDif = grupos.filter(g => relevantes.some(r => isDif(r.valores[g.key].diff)));
  const gruposVisibles = gruposConDif.length > 0 ? gruposConDif : grupos;
  const ocultos = grupos.length - gruposVisibles.length;

  function filas() {
    return sel.value === 'dif' ? conDif : relevantes;
  }

  function renderTabla() {
    const visibles = filas();
    // Cada sección se queda con sus propias filas para poder inicializar su
    // paginación y su buscador por separado (Variación Conceptos son dos tablas).
    const filasPorGrupo = new Map();

    const secciones = gruposVisibles.map(g => {
      const filasGrupo = visibles.filter(r =>
        sel.value === 'all' || isDif(r.valores[g.key].diff)
      );
      filasPorGrupo.set(g.key, filasGrupo);
      const totAnt = filasGrupo.reduce((s, r) => s + (r.valores[g.key].anterior ?? 0), 0);
      const totAct = filasGrupo.reduce((s, r) => s + (r.valores[g.key].actual ?? 0), 0);
      const totDif = totAct - totAnt;

      const titulo = results.reporte.combinar
        ? ''
        : `<h4 style="margin:var(--sp-4) var(--sp-3) var(--sp-2);font-size:var(--text-md);">
             Concepto ${esc(g.nombreReal || g.label)}
           </h4>`;

      const cuerpo = filasGrupo.map(r => {
        const v = r.valores[g.key];
        const color = isDif(v.diff)
          ? (v.diff > 0 ? 'var(--color-success)' : 'var(--color-danger)')
          : 'var(--color-text-muted)';
        const escalonCol = g.escala
          ? `<td style="text-align:center;white-space:nowrap;">${v.escalonAnterior === null ? '—' : `${v.escalonAnterior}% → ${v.escalonActual}%`}</td>`
          : '';
        return `<tr>
          <td>${esc(r.legajo)}</td>
          <td>${esc(r.nombre)}</td>
          ${escalonCol}
          <td style="text-align:right;">${fmtNum(v.anterior)}</td>
          <td style="text-align:right;">${fmtNum(v.actual)}</td>
          <td style="text-align:right;color:${color};">${fmtNum(v.diff)}</td>
          <td style="text-align:right;color:${color};">${fmtPct(v.pct)}</td>
        </tr>`;
      }).join('');

      return `
        ${titulo}
        <div data-search-host="${esc(g.key)}" style="padding:0 var(--sp-3) var(--sp-2);"></div>
        <table class="data-table data-table--compact" data-grupo="${esc(g.key)}">
          <thead>
            <tr>
              <th>Legajo</th>
              <th>Apellido y Nombre</th>
              ${g.escala ? '<th style="text-align:center;">Escalón</th>' : ''}
              <th style="text-align:right;">${esc(labelAnterior)}</th>
              <th style="text-align:right;">${esc(labelActual)}</th>
              <th style="text-align:right;">Variación $</th>
              <th style="text-align:right;">Variación %</th>
            </tr>
          </thead>
          <tbody>${cuerpo}</tbody>
          <tfoot>
            <tr>
              <!-- Con el filtro en "solo con variación" el pie suma las filas mostradas,
                   no toda la dotación: se dice explícitamente para no confundirlo con el
                   TOTAL GENERAL del reporte (que sí es sobre todos los empleados). -->
              <td colspan="${g.escala ? 3 : 2}"><strong>${sel.value === 'dif' ? 'TOTAL de las filas mostradas' : 'TOTAL GENERAL'}</strong> — ${filasGrupo.length} empleado${filasGrupo.length === 1 ? '' : 's'}</td>
              <td style="text-align:right;"><strong>${fmtNum(totAnt)}</strong></td>
              <td style="text-align:right;"><strong>${fmtNum(totAct)}</strong></td>
              <td style="text-align:right;"><strong>${fmtNum(totDif)}</strong></td>
              <td style="text-align:right;"><strong>${fmtPct(calcularPct(totAnt, totAct))}</strong></td>
            </tr>
          </tfoot>
        </table>`;
    }).join('');

    tableHost.innerHTML = secciones
      + (ocultos > 0
        ? `<p class="text-muted" style="padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">
             ${ocultos} concepto${ocultos === 1 ? '' : 's'} sin variación (no se muestran).
           </p>`
        : '');

    // Paginación + buscador se re-inicializan en cada render del tbody.
    for (const g of gruposVisibles) {
      const tbody = tableHost.querySelector(`table[data-grupo="${g.key}"] tbody`);
      const host  = tableHost.querySelector(`[data-search-host="${g.key}"]`);
      if (!tbody || !host) continue;
      const pagination = initShowMorePagination(tbody, { pageSize: 50 });
      initSearchCombobox(host, {
        rows: filasPorGrupo.get(g.key) || [],
        trEls: pagination.dataRows,
        getLabel: r => (r.nombre ? `${r.legajo} — ${r.nombre}` : `${r.legajo}`),
        pagination,
      });
    }
  }

  sel.addEventListener('change', renderTabla);
  renderTabla();
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
  const labelAnterior = results.periodAnterior ? periodToLabel(results.periodAnterior) : 'Período anterior';
  const labelActual   = results.period ? periodToLabel(results.period) : 'Período actual';

  for (const g of results.grupos) {
    const nombreHoja = (results.reporte.combinar ? 'Variación' : g.key).slice(0, 31);
    const ws = wb.addWorksheet(nombreHoja);

    ws.addRow([results.reporte.titulo]).font = { bold: true, size: 13 };
    ws.addRow([g.nombreReal || g.label]).font = { bold: true };
    ws.addRow([`${labelAnterior} vs ${labelActual}`]);
    ws.addRow([]);

    const head = ws.addRow(['Legajo', 'Apellido y Nombre', labelAnterior, labelActual, 'Variación $', 'Variación %']);
    head.font = { bold: true };

    for (const r of relevantes) {
      const v = r.valores[g.key];
      const fila = ws.addRow([r.legajo, r.nombre, v.anterior, v.actual, v.diff, v.pct === null ? 's/base' : v.pct / 100]);
      fila.getCell(3).numFmt = '#,##0.00';
      fila.getCell(4).numFmt = '#,##0.00';
      fila.getCell(5).numFmt = '#,##0.00';
      if (v.pct !== null) fila.getCell(6).numFmt = '0.00%';
    }

    const primeraFilaDatos = 6;
    const ultimaFilaDatos  = primeraFilaDatos + relevantes.length - 1;
    const total = ws.addRow([
      'TOTAL GENERAL', '',
      { formula: `SUM(C${primeraFilaDatos}:C${ultimaFilaDatos})` },
      { formula: `SUM(D${primeraFilaDatos}:D${ultimaFilaDatos})` },
      { formula: `SUM(E${primeraFilaDatos}:E${ultimaFilaDatos})` },
      null,
    ]);
    total.font = { bold: true };
    [3, 4, 5].forEach(c => { total.getCell(c).numFmt = '#,##0.00'; });

    ws.columns = [{ width: 10 }, { width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 12 }];
  }

  await downloadWorkbook(wb, `${nombreArchivo(results)}.xlsx`);
}

// ── Salida a PDF (A4 horizontal) ─────────────────────────────────────────────

/**
 * Abre una ventana con el documento del reporte listo para imprimir a PDF.
 * Es el entregable que se le manda al cliente: encabezado con la empresa, el
 * período comparado y la dotación, thead repetido en cada página y una sección
 * por concepto arrancando en página nueva.
 */
function imprimirVariaciones(results, relevantes) {
  const labelAnterior = results.periodAnterior ? periodToLabel(results.periodAnterior) : 'Período anterior';
  const labelActual   = results.period ? periodToLabel(results.period) : 'Período actual';
  const empresa = results.empresa || 'OPmobility C-Power Argentina S.A.';

  const secciones = results.grupos.map((g, i) => {
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
              <th class="r">Variación $</th><th class="r">Variación %</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
          <tfoot>
            <tr>
              <td colspan="2">TOTAL GENERAL — ${relevantes.length} empleados</td>
              <td class="r">${fmtNum0(totAnt)}</td>
              <td class="r">${fmtNum0(totAct)}</td>
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
    </div>
    <div class="badge">${relevantes.length} empleados</div>
  </div>
  ${secciones}
  <div class="foot">
    Fuente: Tabulado de conceptos liquidados — ${esc(labelAnterior)} y ${esc(labelActual)}.
    Comparación por legajo; un empleado sin el concepto liquidado en un período se computa como 0,00.
    <br>Hidalgo &amp; Asociados · info_ar@bhidalgo.com.ar · +54 11 2284 2031 — documento con datos confidenciales de nómina.
  </div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    alert('El navegador bloqueó la ventana de impresión. Habilitá las ventanas emergentes para este sitio y volvé a intentar.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
}

function periodSuffix(period) {
  if (!period) return dateSuffix();
  const [year, month] = String(period).split('-');
  return (!year || !month) ? dateSuffix() : String(month).padStart(2, '0') + year;
}

function dateSuffix() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
}
