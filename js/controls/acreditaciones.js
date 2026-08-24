// acreditaciones.js — Control Acreditaciones (Axton)
//
// Modo 1 — "Generar Reporte": arma el reporte de acreditaciones del mes desde el
//   export `contacred` de Axton. Una hoja por acreditación real (tipo de
//   liquidación × fecha de acreditación) más una hoja CONTROL que las lista con
//   su total y cierra contra el total del archivo de origen.
//
// Modo 2 — "Controlar": pendiente (cruce contra el Tabulado).
//
// Las reglas de agrupación, herencia de fecha, normalización de tipos y
// asignación manual de fecha están documentadas en
// specs/control-acreditaciones-axton.md — se reconstruyeron contra archivos
// reales y cierran al centavo.
//
// El .xlsx generado va a Finanzas del cliente: NO lleva información de HR
// (dotación, conteos de empleados, altas/bajas). Eso vive sólo en esta pantalla.
// Ver D-020 en DECISIONS.md.

import { EXPORT_CONTRACTS } from '../exports/contracts.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { wireTableTools } from '../ui/tableTools.js';
import { renderVerdict, renderTiles, renderIssues, renderResumenDetalle } from '../ui/resultBlocks.js';
import { renderPlanillaPanel } from '../ui/planillaPanel.js';
import { renderFichasPanel } from '../ui/fichaList.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum } from '../utils/currency.js';
import { periodToLabel, periodSuffix } from '../utils/dates.js';
import { resumenStats } from './resumenStats.js';

/**
 * Las columnas de cada hoja de detalle, en orden, tomadas del contrato — la
 * única lista de columnas de este export (D-051). No se copian acá: si alguien
 * suma una columna, la suma en `js/exports/contracts.js` y ahí la ataja el
 * assert de D-020 (`FINANZAS_ALLOWED_KEYS`), que es el punto.
 */
const DETALLE_COLUMNS = EXPORT_CONTRACTS.acreditaciones_reporte.columns;

// El reporte tiene que cerrar EXACTO contra el archivo de origen: lo que se
// acredita es lo que el banco va a pagar, y un peso que sobra o falta es el
// reporte mal armado, no una diferencia que el analista pueda tolerar. Por eso
// este cuadre no usa el monto de diferencia del cliente (D-069) y mide siempre
// al centavo.
const CIERRE_EPS = 0.01;

export const DEFAULT_ACREDITACIONES_CONFIG = {
  // Cuando el archivo trae más de una Empresa, ¿las listas se parten por empresa?
  // Con una sola empresa (el caso de POP) el flag no tiene efecto.
  splitByEmpresa: true,
  // Fechas asignadas a mano por el analista para listados/liquidaciones que el
  // archivo de Axton no trae con fecha resoluble — ver D-022. Clave = anchorKey
  // ('L:<listado>' o 'Q:<liquidación cruda>'), valor = 'YYYY-MM-DD'.
  dateOverrides: {},
};

// ── Tipos de liquidación ──────────────────────────────────────────────────────
// El orden del array es el orden de matcheo (AV antes que A: "Anticipo de
// vacaciones" también contiene "anticipo"). `order` es el orden de las listas
// dentro de una misma fecha de acreditación.
//
// La lista no es cerrada: los tipos de cada cuenta de Axton salen del propio
// archivo. Lo que no matchea ningún patrón cae en buildFallbackType(), nunca se
// descarta por no reconocerse.

const LIQ_TYPES = [
  { code: 'AV',  label: 'Anticipo de vacaciones', order: 20, test: /anticipo.*vacacion/i },
  { code: 'A',   label: 'Anticipos de sueldo',    order: 10, test: /anticipo/i },
  { code: '1Q',  label: '1era Quincena',          order: 30, test: /(1er|1ra|1era|primera)[a-z]*\s*quincena/i },
  { code: '2Q',  label: '2da Quincena',           order: 40, test: /(2da|2do|2nda|segunda)[a-z]*\s*quincena/i },
  { code: 'SAC', label: 'SAC',                    order: 60, test: /\bsac\b|aguinaldo/i },
  { code: 'LF',  label: 'Liquidación Final',      order: 80, test: /liq\w*\.?\s*final|liquidacion\s*final|\bbajas?\b/i },
  { code: 'M',   label: 'Mensual',                order: 50, test: /mensual/i },
  { code: 'B',   label: 'Bono',                   order: 70, test: /\bbono|gratificac/i },
];

const MESES_RE = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/gi;

/**
 * Limpia el texto crudo de la liquidación de Axton para usarlo como etiqueta.
 * 'Anticipo de sueldo (De carga) Julio 2026 (Anticipos 07-2026 -) (C)'
 *   → 'Anticipo de sueldo'
 */
function cleanLiqLabel(raw) {
  return String(raw || '')
    .replace(/\([^)]*\)/g, ' ')       // paréntesis: '(De carga)', '(Anticipos 07-2026)', '(C)'
    .replace(MESES_RE, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/[\s-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tipo para un texto que no matchea ningún patrón conocido. */
function buildFallbackType(raw) {
  const label = cleanLiqLabel(raw) || String(raw || '').trim() || 'Sin liquidación';
  const code  = label
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') || 'X';
  return { code, label, order: 90 };
}

/**
 * Normaliza el texto de liquidación de Axton a { code, label, order }.
 * @param {string} raw
 */
export function normalizeLiqType(raw) {
  const s = String(raw || '');
  for (const t of LIQ_TYPES) {
    if (t.test.test(s)) return { code: t.code, label: t.label, order: t.order };
  }
  return buildFallbackType(s);
}

// ── Modo 1: Generar Reporte ───────────────────────────────────────────────────

/**
 * @param {object[]} acredRows - parsedRows del export de Acreditaciones (additionalFiles[0])
 * @param {object[]} _tabRows  - sin uso (el control no depende del Tabulado)
 * @param {object}   mapping   - { period, acreditacionesConfig }
 */
export function runAcreditacionesReporte(acredRows, _tabRows, mapping) {
  if (!acredRows?.length) return { error: 'No hay datos del archivo de Acreditaciones.' };

  const cfg = { ...DEFAULT_ACREDITACIONES_CONFIG, ...(mapping.acreditacionesConfig || {}) };

  // Una fila entra al reporte si tiene Listado o Neto. Las que no tienen ninguno
  // de los dos son liquidaciones que no acreditan (provisiones) — ruido del export.
  const acred = acredRows.filter(r => r.listado !== '' || r.neto !== null);
  const descartadas = acredRows.length - acred.length;

  if (acred.length === 0) {
    return { error: 'El archivo no tiene ninguna acreditación: todas las filas están sin importe y sin listado.' };
  }

  // Filas tipadas con su fecha NATIVA (tal como vino en el archivo, puede ser
  // null). flagRowAlerts corre sobre esa fecha nativa — la resolución de fecha
  // (herencia o asignación manual) es un paso posterior y no debe afectar la
  // detección de duplicados/CBU, que mira el dato tal como llegó.
  const rows = buildTypedRows(acred);
  flagRowAlerts(rows);

  // totalOrigen: suma de Neto de TODAS las filas del archivo (incluidas las
  // descartadas), tal como lo informa Axton. Es el ancla independiente del
  // reporte — ver buildReport().
  const totalOrigen = round2(acredRows.reduce((acc, r) => acc + (r.neto ?? 0), 0));
  const cliente = acredRows.find(r => r.cliente)?.cliente || acred.find(r => r.empresa)?.empresa || '';

  const report = buildReport(rows, cfg, descartadas, totalOrigen, mapping.period || '');
  return { ...report, cliente };
}

function buildTypedRows(acred) {
  return acred.map(r => ({
    legajo:  r.legajo,
    nombre:  r.apellido_nombre,
    cuit:    r.cuit,
    neto:    r.neto,
    fecha:   r.fecha_acreditacion,   // nativa — null si Axton no la trajo
    banco:   r.banco,
    cbu:     r.cbu,
    listado: r.listado,
    liqRaw:  r.liquidacion,
    empresa: r.empresa,
    uo:      r.uo_cliente,
    tipo:    normalizeLiqType(r.liquidacion),
    alerts:  [],
  }));
}

/**
 * Clave de anclaje para una fila sin fecha resuelta: el Listado si lo tiene
 * (es la unidad real del banco — el mismo número siempre comparte fecha), o el
 * texto crudo de la liquidación si no (fallback para filas sin Listado). Se usa
 * tanto para la herencia automática como para las asignaciones manuales.
 */
function anchorKeyOf(row) {
  return row.listado ? `L:${row.listado}` : `Q:${row.liqRaw}`;
}

/** Etiqueta legible de un anchorKey, para mostrarlo en la UI sin guardar estado aparte. */
function describeAnchorKey(key) {
  if (key.startsWith('L:')) return `Listado ${key.slice(2)}`;
  return `Liquidación "${cleanLiqLabel(key.slice(2))}"`;
}

/**
 * Arma listas, grupos pendientes, cierre, bancos y alertas a partir de las filas
 * ya tipadas (con sus alertas de integridad ya calculadas). Es una función pura
 * de (rows, cfg) — no muta `rows` — así se puede volver a llamar con otro
 * `dateOverrides` cada vez que el analista asigna una fecha a mano, sin perder
 * ni duplicar nada. Ver assignAcreditacionesDate().
 */
function buildReport(rows, cfg, descartadas, totalOrigen, period) {
  const dateOverrides = cfg.dateOverrides || {};

  // Fechas conocidas por Listado — el ancla principal. Un Listado es un envío
  // real al banco: si algún empleado de ese Listado tiene fecha, todos la
  // comparten. Fallback (sólo para filas sin Listado): fechas conocidas por el
  // texto crudo de la liquidación, igual que antes de D-022.
  const datesByListado = new Map();
  const datesByLiqRaw  = new Map();
  for (const r of rows) {
    if (!r.fecha) continue;
    if (r.listado) {
      if (!datesByListado.has(r.listado)) datesByListado.set(r.listado, new Set());
      datesByListado.get(r.listado).add(r.fecha);
    }
    if (!datesByLiqRaw.has(r.liqRaw)) datesByLiqRaw.set(r.liqRaw, new Set());
    datesByLiqRaw.get(r.liqRaw).add(r.fecha);
  }

  // Resuelve la fecha de cada fila sin mutar el objeto original.
  const resolved = [];               // [{ row, fecha }]
  const pendingRowsByKey = new Map();

  for (const row of rows) {
    if (row.fecha) { resolved.push({ row, fecha: row.fecha }); continue; }

    const key = anchorKeyOf(row);
    if (dateOverrides[key]) { resolved.push({ row, fecha: dateOverrides[key] }); continue; }

    if (row.listado) {
      const dates = datesByListado.get(row.listado);
      if (dates && dates.size === 1) { resolved.push({ row, fecha: [...dates][0] }); continue; }
    } else {
      const dates = datesByLiqRaw.get(row.liqRaw);
      if (dates && dates.size === 1) { resolved.push({ row, fecha: [...dates][0] }); continue; }
    }

    if (!pendingRowsByKey.has(key)) pendingRowsByKey.set(key, []);
    pendingRowsByKey.get(key).push(row);
  }

  // ── Grupos pendientes: TODOS los empleados de ese Listado (o liquidación,
  // si no hay Listado) están sin fecha resoluble. Una alerta por grupo, no una
  // por empleado — y una fecha para asignar, no catorce (D-022).
  const pendingGroups = [...pendingRowsByKey.entries()]
    .map(([key, groupRows]) => {
      const first = groupRows[0];
      return {
        key,
        listado: first.listado || '',
        liqRaw:  first.liqRaw,
        tipo:    first.tipo,
        rows:    [...groupRows].sort(byNombre),
        count:   groupRows.length,
        total:   sumNeto(groupRows),
      };
    })
    .sort((a, b) => a.tipo.order - b.tipo.order || (a.listado || a.liqRaw).localeCompare(b.listado || b.liqRaw));

  // ── Agrupación en listas: (tipo, fecha) [+ empresa] ────────────────────────
  const empresas = [...new Set(rows.map(r => r.empresa).filter(Boolean))].sort();
  const splitByEmpresa = cfg.splitByEmpresa && empresas.length > 1;

  const groups = new Map();
  for (const { row, fecha } of resolved) {
    const key = [row.tipo.code, fecha, splitByEmpresa ? row.empresa : ''].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        code: row.tipo.code, label: row.tipo.label, order: row.tipo.order,
        fecha, empresa: splitByEmpresa ? row.empresa : '', rows: [],
      });
    }
    // Clon con la fecha ya resuelta: cada fila de una lista necesita su propia
    // fecha (para el .xlsx), aunque haya llegado por herencia o asignación
    // manual — `row` original queda intacto para poder recalcular después.
    groups.get(key).rows.push({ ...row, fecha });
  }

  const listas = [...groups.values()]
    .sort((a, b) =>
      a.fecha.localeCompare(b.fecha)
      || a.order - b.order
      || a.code.localeCompare(b.code)
      || a.empresa.localeCompare(b.empresa)
    )
    .map((g, i) => ({
      ...g,
      n:        i + 1,
      rows:     [...g.rows].sort(byNombre),
      listados: [...new Set(g.rows.map(r => r.listado).filter(Boolean))].sort(),
      total:    sumNeto(g.rows),
      count:    g.rows.length,
      alerts:   g.rows.filter(r => r.alerts.length > 0).length,
    }));

  // ── Cierre contra el origen ────────────────────────────────────────────────
  const totalAcreditado = round2(listas.reduce((acc, l) => acc + l.total, 0));
  const sinAsignarTotal = round2(pendingGroups.reduce((acc, g) => acc + g.total, 0));
  const diferencia      = round2(totalAcreditado + sinAsignarTotal - totalOrigen);

  // ── Cortes que se muestran en la app (no van al .xlsx) ─────────────────────
  const bancoMap = new Map();
  for (const r of rows) {
    const banco = r.banco || '(sin banco)';
    if (!bancoMap.has(banco)) bancoMap.set(banco, { banco, count: 0, total: 0 });
    const b = bancoMap.get(banco);
    b.count++;
    b.total += r.neto ?? 0;
  }
  const bancos = [...bancoMap.values()]
    .map(b => ({ ...b, total: round2(b.total) }))
    .sort((a, b) => b.total - a.total);

  // ── Alertas para la pantalla: una por fila con problema de integridad, más
  // UNA por grupo pendiente (no una por cada empleado del grupo) ─────────────
  const rowAlerts = [
    ...listas.flatMap(l => l.rows.map(r => ({ r, lista: listaLabel(l) }))),
    ...pendingGroups.flatMap(g => g.rows.map(r => ({ r, lista: 'SIN ASIGNAR' }))),
  ]
    .filter(({ r }) => r.alerts.length > 0)
    .flatMap(({ r, lista }) => r.alerts.map(a => ({
      tipo: a.tipo, detalle: a.detalle, legajo: r.legajo, nombre: r.nombre, lista, neto: r.neto,
    })));

  const pendingAlerts = pendingGroups.map(g => ({
    tipo:    'sin_asignar',
    detalle: `${g.listado ? `Listado ${g.listado}` : 'Sin listado'} — "${cleanLiqLabel(g.liqRaw)}" — ningún empleado de este grupo tiene fecha de acreditación. Asignala manualmente para poder exportar.`,
    legajo:  '—',
    nombre:  `${g.count} empleado${g.count === 1 ? '' : 's'}`,
    lista:   'SIN ASIGNAR',
    neto:    g.total,
  }));

  const summary = {
    listas:          listas.length,
    pendingGroups:   pendingGroups.length,
    acreditaciones:  rows.length,
    descartadas,
    totalAcreditado,
    sinAsignarTotal,
    totalOrigen,
    diferencia,
    listasConAlerta: listas.filter(l => l.alerts > 0).length,
    bancos:          bancos.length,
  };

  return {
    summary,
    // El puente del Resumen: Total liquidación → Diferencia → Total
    // acreditado. Se agrega ACÁ, con los mismos números del cierre — el
    // tablero no recalcula nada.
    bridge: bridgeDeAcreditaciones(summary),
    listas,
    sinAsignar: pendingGroups,
    bancos,
    alerts: [...rowAlerts, ...pendingAlerts],
    empresas,
    splitByEmpresa,
    period,
    // Estado interno para poder regenerar el reporte con otras fechas
    // asignadas a mano sin volver a parsear el archivo — ver
    // assignAcreditacionesDate() / unassignAcreditacionesDate().
    _rows:        rows,
    _descartadas: descartadas,
    _totalOrigen: totalOrigen,
    _cfg:         cfg,
  };
}

/**
 * Sólo entran al puente los listados YA asignados a una lista (D-086): lo que
 * quedó "SIN ASIGNAR" se informa aparte, con su importe, y no se resta contra
 * nada — la misma regla que Netos aplicó para el legajo sin neto. Con eso, el
 * puente cierra exacto: Total liquidación (ya asignado) + Diferencia = Total
 * acreditado, y `Diferencia` es el mismo número que el chequeo de cierre del
 * control (`summary.diferencia`).
 */
function bridgeDeAcreditaciones(s) {
  const totalLiquidacion = round2(s.totalOrigen - s.sinAsignarTotal);
  return {
    title: 'De dónde sale la diferencia',
    steps: [
      { label: 'Total liquidación', amount: totalLiquidacion, tone: 'ink' },
      { label: 'Diferencia',        amount: s.diferencia,
        tone: Math.abs(s.diferencia) <= CIERRE_EPS ? 'ink' : 'error' },
      { label: 'Total acreditado',  amount: s.totalAcreditado, tone: 'ink' },
    ],
    uncompared: s.pendingGroups === 0 ? null : {
      label: s.pendingGroups === 1
        ? '1 listado sin fecha de acreditación, por'
        : `${s.pendingGroups} listados sin fecha de acreditación, por`,
      amount: s.sinAsignarTotal,
    },
  };
}

/**
 * Asigna a mano la fecha de acreditación de un grupo pendiente (identificado
 * por su `key`, ver anchorKeyOf/describeAnchorKey) y regenera el reporte
 * completo con esa fecha aplicada. El grupo se mergea con la lista existente
 * de su mismo tipo+fecha si hay una, o forma una lista nueva si no.
 *
 * @param {object} results - resultado de runAcreditacionesReporte (o de una
 *   asignación anterior — encadenable)
 * @param {string} groupKey - `pendingGroup.key`
 * @param {string} isoDate  - 'YYYY-MM-DD'
 */
export function assignAcreditacionesDate(results, groupKey, isoDate) {
  const dateOverrides = { ...(results._cfg?.dateOverrides || {}), [groupKey]: isoDate };
  return regenerateAcreditaciones(results, dateOverrides);
}

/** Deshace una asignación manual (el grupo vuelve a SIN ASIGNAR). */
export function unassignAcreditacionesDate(results, groupKey) {
  const dateOverrides = { ...(results._cfg?.dateOverrides || {}) };
  delete dateOverrides[groupKey];
  return regenerateAcreditaciones(results, dateOverrides);
}

function regenerateAcreditaciones(results, dateOverrides) {
  const cfg    = { ...(results._cfg || DEFAULT_ACREDITACIONES_CONFIG), dateOverrides };
  const report = buildReport(results._rows, cfg, results._descartadas, results._totalOrigen, results.period);
  return { ...report, cliente: results.cliente };
}

/**
 * Marca las alertas de integridad fila por fila (mutando row.alerts).
 * Ninguna de estas alertas va al .xlsx: se muestran en la app.
 */
function flagRowAlerts(rows) {
  // Duplicado exacto: mismo legajo, importe, fecha y tipo más de una vez.
  const dupKey = r => [r.legajo, r.neto, r.fecha, r.tipo.code].join('|');
  const dupCount = new Map();
  for (const r of rows) {
    if (r.neto === null) continue;
    dupCount.set(dupKey(r), (dupCount.get(dupKey(r)) || 0) + 1);
  }

  // CBU usado por más de un legajo.
  const legajosByCbu = new Map();
  for (const r of rows) {
    if (!r.cbu) continue;
    if (!legajosByCbu.has(r.cbu)) legajosByCbu.set(r.cbu, new Set());
    legajosByCbu.get(r.cbu).add(r.legajo);
  }

  for (const r of rows) {
    if (r.neto === null) {
      r.alerts.push({ tipo: 'sin_importe', detalle: 'En el listado de pago sin importe' });
    } else if (r.neto <= 0) {
      r.alerts.push({ tipo: 'neto_no_positivo', detalle: 'Importe menor o igual a cero' });
    }

    if (r.neto !== null && dupCount.get(dupKey(r)) > 1) {
      r.alerts.push({ tipo: 'duplicado', detalle: 'Acreditación repetida (mismo legajo, importe, fecha y liquidación)' });
    }

    if (!r.cbu) {
      r.alerts.push({ tipo: 'cbu_invalido', detalle: 'Sin CBU' });
    } else if (!/^\d{22}$/.test(r.cbu)) {
      r.alerts.push({ tipo: 'cbu_invalido', detalle: `CBU con ${r.cbu.length} caracteres (se esperan 22 dígitos)` });
    } else {
      const otros = [...(legajosByCbu.get(r.cbu) || [])].filter(l => l !== r.legajo);
      if (otros.length > 0) {
        r.alerts.push({ tipo: 'cbu_compartido', detalle: `CBU compartido con el legajo ${otros.join(', ')}` });
      }
    }
  }
}

export function summarizeAcreditacionesReporte(results) {
  if (results.error) {
    return {
      status: 'warning', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null,
      diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const s = results.summary;
  const cierraOk = Math.abs(s.diferencia) <= CIERRE_EPS;

  // "Unidad" del semáforo = la lista de acreditación. Un grupo pendiente (sin
  // fecha resoluble) cuenta como una unidad más — todavía no es una lista, pero
  // tiene que dejar de estarlo. Si el cierre contra el archivo de origen no da
  // cero, el reporte entero es sospechoso: se marcan todas las unidades.
  const unitsTotal    = s.listas + s.pendingGroups;
  const unitsWithDiff = cierraOk
    ? s.listasConAlerta + s.pendingGroups
    : unitsTotal;

  const insights = [];
  if (!cierraOk) {
    insights.push({ type: 'warning', label: 'diferencia contra el total del archivo de Axton', value: fmtNum(s.diferencia) });
  }
  if (s.pendingGroups > 0) {
    insights.push({ type: 'warning', label: 'listados sin fecha de acreditación', value: s.pendingGroups });
  }
  if (s.listasConAlerta > 0) {
    insights.push({ type: 'warning', label: 'listas con alguna alerta', value: s.listasConAlerta });
  }

  return {
    status:   (cierraOk && unitsWithDiff === 0) ? 'success' : 'warning',
    headline: `${s.listas} acreditación${s.listas === 1 ? '' : 'es'} · ${fmtNum(s.totalAcreditado)} acreditado`,
    insights,
    unit: 'lista',
    unitsTotal,
    unitsWithDiff,
    diffTotalAmount: Math.abs(s.diferencia),
    worstCase: null,
    contextNote: cierraOk
      ? `cierra exacto contra el total del archivo de Axton (${fmtNum(s.totalOrigen)})`
      : `el total del archivo de Axton es ${fmtNum(s.totalOrigen)}`,
    resumen: resumenDeAcreditaciones(results, cierraOk),
  };
}

/**
 * El banco de un grupo de filas (una lista o un grupo pendiente), sólo si es
 * el MISMO para todas: una lista no se arma por banco, así que puede juntar
 * empleados de varios. Atribuirle uno solo inventaría un dato — un grupo
 * mixto va a "Sin identificar" (la banda rayada de resumenStats.js), que es
 * justo lo que corresponde cuando la atribución es parcial.
 */
function bancoDeGrupo(rows) {
  const bancos = new Set(rows.map(r => r.banco).filter(Boolean));
  return bancos.size === 1 ? [...bancos][0] : null;
}

/** Misma idea que `bancoDeGrupo`, para la empresa de un grupo pendiente. */
function empresaDeGrupo(rows) {
  const empresas = new Set(rows.map(r => r.empresa).filter(Boolean));
  return empresas.size === 1 ? [...empresas][0] : null;
}

/**
 * El sub-objeto del tablero del Resumen (resumenStats.js). La unidad es la
 * LISTA (D-021): junto a las listas ya armadas entran los grupos "SIN
 * ASIGNAR", que cuentan como una unidad más con diferencia — el mismo
 * criterio que ya usa `estadoDeLista`/el semáforo, reusado acá para que este
 * corte nunca cuente distinto.
 *
 * **`diffSigned` sólo lo tiene el grupo pendiente** (lo que todavía no se
 * acreditó, plata "de menos" con signo negativo). Una lista con alertas de
 * integridad (CBU inválido, duplicado, importe ≤ 0) no tiene un importe de
 * diferencia propio — la alerta es de calidad de dato, no de cuadre — así que
 * no se le inventa un signo (§4 de la spec: "si un control guarda sólo el
 * valor absoluto, el bloque se omite para esa unidad").
 *
 * Nada de esto toca el .xlsx que recibe Finanzas: es sólo lo que pinta esta
 * pantalla (D-020).
 */
function resumenDeAcreditaciones(results, cierraOk) {
  const unidades = [
    ...results.listas.map(l => ({
      tipo: 'lista', label: listaLabel(l), rows: l.rows, empresa: l.empresa || null,
      total: l.total, conDif: estadoDeLista(l, cierraOk) === 'conDif',
    })),
    ...results.sinAsignar.map(g => ({
      tipo: 'pendiente', label: describeAnchorKey(g.key), rows: g.rows, empresa: null,
      total: g.total, conDif: true,
    })),
  ];
  const conDif = unidades.filter(u => u.conDif);

  const causaDe = (u) => {
    const banco = bancoDeGrupo(u.rows);
    return banco ? { key: banco, label: banco } : null;
  };
  const empresaDe = (u) => (u.tipo === 'lista' ? u.empresa : empresaDeGrupo(u.rows));

  return resumenStats({
    unit: 'lista',
    tolerance: CIERRE_EPS,
    rows: conDif,
    allRows: unidades,
    diff: (u) => (u.tipo === 'pendiente' ? -u.total : null),
    unitLabel: (u) => u.label,
    group: results.splitByEmpresa ? { empresa: empresaDe } : null,
    cause: causaDe,
    top: (u) => ({ legajo: null, nombre: u.label, empresa: empresaDe(u), rubro: causaDe(u)?.label ?? null }),
    bridge: results.bridge || null,
    // No hay clave de legajo que ofrecerle a los cortes cruzados de 3b: la
    // unidad acá es la lista, y no entra a "legajos repetidos" (§4 de la
    // spec) — no se inventa una equivalencia.
    notApplicable: ['keys'],
    sideLabels: {
      under: { label: 'Sin asignar', note: 'liquidado pero todavía sin fecha de acreditación' },
    },
  });
}

// ── Pantalla de resultados ────────────────────────────────────────────────────

const ALERT_LABEL = {
  sin_importe:      'Sin importe',
  neto_no_positivo: 'Importe ≤ 0',
  duplicado:        'Duplicado',
  cbu_invalido:     'CBU inválido',
  cbu_compartido:   'CBU compartido',
  sin_asignar:      'Sin asignar',
};

/**
 * En qué estado cerró una lista, con la MISMA regla en las dos solapas.
 *
 * Este reporte cierra AL CENTAVO contra el archivo de origen: es plata que el
 * banco va a acreditar, así que no hay margen que medir (D-069). Si el cuadre
 * global no da, el reporte entero es sospechoso y todas las listas salen
 * marcadas — el mismo criterio con el que se cuenta el semáforo.
 */
function estadoDeLista(lista, cierraOk) {
  return (!cierraOk || lista.alerts > 0) ? 'conDif' : 'centavo';
}

const NO_APLICA_ACRED = {
  margen: 'el reporte cierra al centavo contra el archivo de Axton: es plata que el banco va a acreditar',
  sinComparar: 'todas las listas salen del mismo archivo, así que no falta un lado',
};

/** Los tipos de liquidación que aparecen en esta corrida, en el orden de la tabla. */
function tiposDeLasListas(listas) {
  return [...new Map(listas.map(l => [l.code, l])).values()]
    .sort((a, b) => a.order - b.order);
}

/**
 * El `⬇ Exportar ▾` de las dos solapas: el mismo menú, con los mismos tres
 * ítems y en el mismo lugar (último de la barra). El export siempre incluye
 * TODAS las listas, sin importar el filtro de pantalla: el .xlsx es el
 * entregable del control (el reporte en sí), no una foto de lo que se ve.
 */
function mountExportMenu(exportEl, res) {
  const headers = ['Lista', ...(res.splitByEmpresa ? ['Empresa'] : []), 'Liquidación', 'Fecha de acred', 'Fecha de paga', 'Listado', 'Total'];
  const rows = () => res.listas.map(l => [
    l.n,
    ...(res.splitByEmpresa ? [l.empresa] : []),
    l.label, fmtDate(l.fecha), fmtDate(l.fecha), l.listados.join(' + '), fmtNum(l.total),
  ]);
  return renderExportMenu(exportEl, {
    onExcel: () => exportAcreditacionesToXlsx(res),
    onCsv:   () => downloadCsv(headers, rows(), `Acreditaciones_${periodSuffix(res.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(headers, rows()),
  });
}

/** El desglose por banco de UNA lista: es lo que tesorería mira antes de mandarla. */
function bancosDeLista(lista) {
  const porBanco = new Map();
  for (const r of lista.rows) {
    const banco = r.banco || '(sin banco)';
    if (!porBanco.has(banco)) porBanco.set(banco, { banco, count: 0, total: 0 });
    const b = porBanco.get(banco);
    b.count++;
    b.total += r.neto ?? 0;
  }
  return [...porBanco.values()]
    .map(b => ({ ...b, total: round2(b.total) }))
    .sort((a, b) => b.total - a.total || a.banco.localeCompare(b.banco, 'es'));
}

/**
 * Las alertas de UNA lista, contadas por tipo. Ojo con la diferencia: `lista.alerts`
 * cuenta ACREDITACIONES marcadas (una fila con CBU inválido y sin importe cuenta
 * una sola vez) y esto cuenta ALERTAS (esa misma fila aporta dos). Las dos cosas
 * se muestran, cada una con su rótulo, para que ningún número quede sin explicar.
 */
function alertasPorTipo(lista) {
  const porTipo = new Map();
  for (const r of lista.rows) {
    for (const a of r.alerts) porTipo.set(a.tipo, (porTipo.get(a.tipo) || 0) + 1);
  }
  return [...porTipo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Qué hacer con cada tipo de alerta, en criollo: es lo que va en la conclusión. */
const ALERT_QUE_MIRAR = {
  sin_importe:      n => `${n} en el listado de pago sin importe: el banco no les va a acreditar nada`,
  neto_no_positivo: n => `${n} con importe menor o igual a cero`,
  duplicado:        n => `${n} repetida${n === 1 ? '' : 's'} (mismo legajo, importe, fecha y liquidación)`,
  cbu_invalido:     n => `${n} con el CBU vacío o con menos de 22 dígitos: el banco rechaza la transferencia`,
  cbu_compartido:   n => `${n} con el CBU compartido con otro legajo`,
};

/**
 * Una ficha por LISTA de acreditación — la unidad de este control es la
 * acreditación y no el empleado-mes (D-021).
 *
 * Todo lo que se ve acá —cuántos empleados tiene la lista, el desglose por
 * banco, las alertas fila por fila— es información que la PANTALLA muestra
 * porque la mira el analista de H&A. El .xlsx que recibe Finanzas del cliente
 * no la lleva y esta función no lo toca: no agrega ni una columna al export
 * (D-020).
 *
 * Es pura —no toca el DOM— para poder probarla con node.
 *
 * @param {object} res - resultado de runAcreditacionesReporte()
 * @returns {object[]} descriptores de `renderFichasPanel()`, más `lista` y
 *   `searchLabel` para ordenar, filtrar y buscar sin volver a buscar la lista.
 */
export function buildAcreditacionesFichas(res) {
  const s = res.summary;
  const cierraOk = Math.abs(s.diferencia) <= CIERRE_EPS;
  // Con una sola empresa en el archivo el corte no se aplica y `l.empresa`
  // queda vacío — pero la empresa igual se sabe, y la ficha la tiene que decir.
  const empresaUnica = res.empresas.length === 1 ? res.empresas[0] : '';

  return res.listas.map(lista => {
    const empresa    = lista.empresa || empresaUnica;
    const bancos     = bancosDeLista(lista);
    const porTipo    = alertasPorTipo(lista);
    const conAlerta  = lista.rows.filter(r => r.alerts.length > 0);
    const sinImporte = lista.rows.filter(r => r.neto === null).length;
    const seAcreditan = lista.count - sinImporte;
    const severity = !cierraOk ? 'error' : (lista.alerts > 0 ? 'warn' : 'ok');

    return {
      id:   lista.n,
      unit: lista.n,
      severity,
      name: `${lista.code} — ${lista.label}`,
      ...(empresa ? { tag: { text: empresa } } : {}),
      badge: !cierraOk
        ? { text: 'El reporte no cierra', tone: 'error' }
        : (lista.alerts > 0
            ? { text: `${lista.alerts} para revisar`, tone: 'warn' }
            : undefined),
      context: [
        `Acreditan el ${fmtDate(lista.fecha)}`,
        `${lista.count} ${lista.count === 1 ? 'acreditación' : 'acreditaciones'}`,
        lista.listados.length ? `Listado ${lista.listados.join(' + ')}` : 'Sin listado',
        `Hoja "${listaLabel(lista)}" del .xlsx`,
      ],
      // El segundo eje: qué MÁS le pasa a la lista. El estado ya dijo cómo cerró.
      marks: porTipo.map(([tipo, n]) => ({
        text: `${ALERT_LABEL[tipo] || tipo}: ${n}`, tone: 'info',
      })),
      amountLabel: 'Total de la lista',
      amount: lista.total,
      amountTone: severity === 'error' ? 'error' : (severity === 'warn' ? 'warn' : undefined),
      body: {
        // 1. La tira: del listado de pago a lo que sale por el banco. Es la
        //    cascada que produce el número grande de la ficha.
        strip: [
          { label: 'En el listado de pago', value: `${lista.count}` },
          ...(sinImporte > 0 ? [{ label: '− Sin importe', value: `${sinImporte}` }] : []),
          { label: 'Se acreditan', value: `${seAcreditan}` },
          { label: 'Total que va al banco', value: lista.total, invert: true },
          ...(lista.alerts > 0
            ? [{ label: 'Para revisar', value: `${lista.alerts} de ${lista.count}`, residuo: true }] : []),
          ...(!cierraOk
            ? [{ label: 'Diferencia del reporte', value: s.diferencia, residuo: true }] : []),
        ],
        // 2. Las dos tablas: a la izquierda cómo sale la plata, a la derecha qué
        //    la frena. La de bancos va siempre — es el corte que mira tesorería.
        tables: [
          {
            title: 'Cómo se acredita — desglose por banco',
            rows: bancos.map(b => ({ label: b.banco, code: `${b.count}`, value: b.total })),
            foot: { label: 'TOTAL de la lista', value: lista.total, tone: 'ink' },
          },
          ...(porTipo.length > 0 ? [{
            title: 'Qué la frena — alertas de esta lista',
            rows: porTipo.map(([tipo, n]) => ({ label: ALERT_LABEL[tipo] || tipo, value: `${n}` })),
            foot: { label: 'Acreditaciones marcadas', value: `${lista.alerts} de ${lista.count}`, tone: 'error' },
          }] : []),
        ],
        // 3. El detalle: qué fila de la lista está marcada y por qué.
        detail: conAlerta.length > 0 ? {
          title: 'Fila por fila, lo que hay que resolver antes de mandarla',
          columns: [
            { key: 'legajo',  label: 'Legajo' },
            { key: 'nombre',  label: 'Apellido y Nombre' },
            { key: 'alerta',  label: 'Alerta' },
            { key: 'detalle', label: 'Detalle' },
            { key: 'neto',    label: 'Neto', num: true },
          ],
          rows: conAlerta.flatMap(r => r.alerts.map(a => ({
            legajo:  r.legajo,
            nombre:  r.nombre,
            alerta:  ALERT_LABEL[a.tipo] || a.tipo,
            detalle: a.detalle,
            neto:    r.neto,
            tone:    'neg',
          }))),
          foot: { label: 'Neto de las acreditaciones marcadas', value: sumNeto(conAlerta) },
        } : undefined,
        // 4. La conclusión: qué mirar, no un resumen del importe que ya se ve arriba.
        conclusion: conclusionDeLista(lista, { cierraOk, s, porTipo }),
      },
      lista,
      searchLabel: [
        lista.n, lista.code, lista.label, fmtDate(lista.fecha),
        lista.listados.join(' '), empresa,
      ].filter(Boolean).join(' '),
    };
  });
}

/** No un resumen: una instrucción. Qué queda por resolver y qué mirar. */
function conclusionDeLista(lista, { cierraOk, s, porTipo }) {
  if (!cierraOk) {
    return {
      tone: 'error',
      title: `El reporte no cierra contra el archivo de Axton por ${fmtNum(s.diferencia)}`,
      text: `Listas ${fmtNum(s.totalAcreditado)} + sin asignar ${fmtNum(s.sinAsignarTotal)} `
        + `contra ${fmtNum(s.totalOrigen)} que informa el archivo. Mientras esa diferencia no dé cero `
        + 'no se manda ninguna lista: lo que falta o sobra puede estar en ésta. Resolvé el cuadre primero.',
    };
  }
  if (porTipo.length > 0) {
    const partes = porTipo.map(([tipo, n]) => (ALERT_QUE_MIRAR[tipo] || (k => `${k} de tipo ${tipo}`))(n));
    return {
      tone: 'warn',
      title: `${lista.alerts} de ${lista.count} acreditaciones de esta lista quedaron marcadas`,
      text: `Antes de mandarla al banco, resolvé: ${partes.join('; ')}. `
        + 'La tabla de acá arriba dice en qué legajo está cada una. Nada de esto va al .xlsx que recibe Finanzas.',
    };
  }
  return {
    tone: 'ok',
    title: 'La lista está para mandar',
    text: `${lista.count} ${lista.count === 1 ? 'acreditación' : 'acreditaciones'} por ${fmtNum(lista.total)}, `
      + `con fecha ${fmtDate(lista.fecha)}. Ninguna quedó marcada y el reporte cierra exacto contra el archivo `
      + 'de Axton: no hay nada que revisar en esta lista.',
  };
}

export function renderAcreditacionesReporteResults(results, container) {
  if (results.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }

  // Se recuerda la solapa activa entre draws: asignar/deshacer una fecha manual
  // (D-022) reconstruye toda la pantalla, y no tiene sentido devolver al
  // analista al Resumen si estaba trabajando en la Planilla. En el PRIMER draw
  // se deja decidir a la pieza compartida (la preferencia guardada de este
  // control y este estado, o el default del §2); recién cuando el analista
  // cambia de solapa se fija acá.
  let activeTabId = null;

  // draw() reconstruye toda la pantalla a partir de `res`. Se vuelve a llamar
  // cada vez que el analista asigna o deshace una fecha manual (D-022) — así el
  // botón "Exportar" siempre referencia el resultado más reciente, sin volver
  // a pasar por el wizard.
  function draw(res) {
    const { listas, sinAsignar: pendingGroups, summary: s } = res;

    if (listas.length === 0 && pendingGroups.length === 0) {
      container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
      return;
    }

    const cierraOk = Math.abs(s.diferencia) <= CIERRE_EPS;
    const listasOk = listas.length - s.listasConAlerta;

    container.innerHTML = '';

    // Los grupos sin fecha y las fechas asignadas a mano van ARRIBA de las tres
    // solapas, no adentro de una: mientras un grupo esté pendiente el .xlsx no
    // se puede exportar, y con la vista estándar la pantalla abre en Fichas
    // cuando hay diferencias — que es justo cuando hay grupos pendientes. Si el
    // aviso viviera adentro de la Planilla, el analista abriría en una solapa
    // que no le muestra lo único que puede hacer.
    if (pendingGroups.length > 0) renderPendingBox(res, pendingGroups, container, draw);
    const overrides = res._cfg?.dateOverrides || {};
    if (Object.keys(overrides).length > 0) renderOverridesBox(res, overrides, container, draw);

    // Las solapas van en su propio host: initTabs() vacía el contenedor que
    // recibe, y los dos avisos de arriba tienen que sobrevivir a eso.
    const tabsHost = document.createElement('div');
    container.appendChild(tabsHost);

    renderResumenDetalle(tabsHost, {
      ...(activeTabId ? { activeId: activeTabId } : {}),
      onChange(id) { activeTabId = id; },
      controlId: 'acreditaciones_reporte',
      conDiferencias: !cierraOk || s.listasConAlerta > 0 || pendingGroups.length > 0,
      resumen(panel) {
        renderVerdict(panel, {
          tone: cierraOk ? 'ok' : 'error',
          title: cierraOk
            ? `El reporte cierra exacto contra el archivo de Axton: ${fmtNum(s.totalOrigen)}.`
            : 'El reporte no cierra contra el archivo de Axton.',
          body: cierraOk
            ? (pendingGroups.length > 0
                ? `${fmtNum(s.totalAcreditado)} en listas + ${fmtNum(s.sinAsignarTotal)} sin asignar.`
                : null)
            : `Listas ${fmtNum(s.totalAcreditado)} + sin asignar ${fmtNum(s.sinAsignarTotal)} − archivo ${fmtNum(s.totalOrigen)} = <strong>${fmtNum(s.diferencia)}</strong>.`,
        });

        renderTiles(panel, [
          { label: 'Acreditaciones', value: s.acreditaciones, sub: fmtNum(s.totalAcreditado) },
          { label: 'Listas sin alertas', value: listasOk, tone: 'ok' },
          { label: 'Listas con alertas', value: s.listasConAlerta, tone: s.listasConAlerta > 0 ? 'error' : 'ok' },
          ...(pendingGroups.length > 0 ? [{ label: 'Grupos sin fecha', value: pendingGroups.length, tone: 'warn' }] : []),
          ...(s.descartadas > 0 ? [{ label: 'Filas descartadas', value: s.descartadas, sub: 'sin importe ni listado' }] : []),
        ]);

        if (res.alerts.length > 0) {
          const top = res.alerts.slice(0, 5);
          renderIssues(panel, {
            heading: `Casos para revisar · ${top.length} de ${res.alerts.length}`,
            items: top.map(a => ({
              who: a.nombre || `Legajo ${a.legajo}`,
              sub: a.nombre ? `Legajo ${a.legajo} · ${a.lista}` : a.lista,
              what: ALERT_LABEL[a.tipo] || a.tipo,
              why: a.detalle,
              right: fmtNum(a.neto),
            })),
          });
        }
      },
      fichas(panel) { drawFichas(res, panel); },
      planilla(panel) { drawDetalle(res, panel); },
    });
  }

  /**
   * Solapa Fichas — una tarjeta por LISTA de acreditación (§4 de
   * specs/vista-estandar-resultados.md).
   *
   * La unidad de este control es la acreditación, no el empleado-mes (D-021):
   * un legajo con anticipo + quincena + mensual está en tres listas distintas y
   * consolidarlo sería el bug, no lo contrario. Es la única excepción conocida a
   * la regla de consolidar por legajo, y por eso la ficha NO es por legajo.
   */
  function drawFichas(res, panel) {
    if (res.listas.length === 0) {
      panel.innerHTML = '<p class="text-muted" style="padding:var(--sp-4);">'
        + 'Todavía no hay ninguna lista formada: asigná una fecha a los grupos pendientes de arriba.</p>';
      return;
    }

    const cierraOk = Math.abs(res.summary.diferencia) <= CIERRE_EPS;
    const fichas = buildAcreditacionesFichas(res);
    const tiposPresentes = tiposDeLasListas(res.listas);

    renderFichasPanel(panel, {
      fichas,
      unitLabel: 'listas',
      estadoDe: f => estadoDeLista(f.lista, cierraOk),
      noAplica: NO_APLICA_ACRED,
      // El mismo segundo eje que la Planilla: el tipo de liquidación. Que las
      // dos solapas filtren igual es la mitad del punto de la vista estándar —
      // el analista pone un filtro, cambia de solapa y sigue viendo lo mismo.
      marcas: tiposPresentes.map(t => ({
        value: t.code, label: `${t.code} — ${t.label}`, match: f => f.lista.code === t.code,
      })),
      ordenes: [
        { value: 'lista',   label: 'Número de lista',       compare: (a, b) => a.lista.n - b.lista.n },
        { value: 'total',   label: 'Mayor total',           compare: (a, b) => b.lista.total - a.lista.total },
        { value: 'alertas', label: 'Más para revisar',      compare: (a, b) => b.lista.alerts - a.lista.alerts || a.lista.n - b.lista.n },
        { value: 'fecha',   label: 'Fecha de acreditación', compare: (a, b) => a.lista.fecha.localeCompare(b.lista.fecha) || a.lista.n - b.lista.n },
      ],
      getLabel: f => f.searchLabel,
      // La unidad acá es la lista, no el legajo: el buscador tiene que pedir lo
      // que la ficha efectivamente tiene. Mismo texto que la Planilla.
      searchLabel: 'Buscar lista',
      searchPlaceholder: 'Número de lista, liquidación, fecha o listado…',
      getAmount: f => f.lista.total,
      amountLabel: 'Σ acreditado',
      onExport: (exportEl) => mountExportMenu(exportEl, res),
    });
  }

  function drawDetalle(res, container) {
    const { listas } = res;

    // ── La planilla de listas, con la barra estándar ────────────────────────
    // La unidad es la LISTA de acreditación, no el empleado (D-021): una lista
    // es una hoja del .xlsx y una acreditación del banco. El conteo de empleados
    // y las alertas se ven acá porque esta pantalla la mira el analista; el
    // .xlsx que va a Finanzas no los lleva (D-020).
    if (listas.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-muted';
      p.style.padding = 'var(--sp-4)';
      p.textContent = 'Todavía no hay ninguna lista formada: asigná una fecha a los grupos pendientes de arriba.';
      container.appendChild(p);
      return;
    }

    const cierraOk    = Math.abs(res.summary.diferencia) <= CIERRE_EPS;
    const totalEmpl   = listas.reduce((a, l) => a + l.count, 0);
    const totalAlerts = listas.reduce((a, l) => a + l.alerts, 0);
    const tiposPresentes = tiposDeLasListas(listas);

    const columns = [
      { key: 'n', label: 'Lista', sub: 'una hoja del .xlsx', band: 'Identificación' },
      ...(res.splitByEmpresa ? [{ key: 'empresa', label: 'Empresa', band: 'Identificación' }] : []),
      { key: 'label', label: 'Liquidación', sub: 'tipo de liquidación', band: 'Acreditación',
        cell: l => `<span class="badge">${esc(l.code)}</span> ${esc(l.label)}` },
      { key: 'fecha', label: 'Fecha de acreditación', sub: 'la que va al banco', band: 'Acreditación',
        cell: l => esc(fmtDate(l.fecha)) },
      { key: 'listados', label: 'Listado', sub: 'los que entraron a la lista', band: 'Acreditación', close: true,
        cell: l => `<span class="text-muted">${esc(l.listados.join(' + ')) || '—'}</span>` },
      // Empleados y alertas son CUENTAS, no importes: no se totalizan con dos
      // decimales en el pie — el total de las dos va en la nota, en criollo.
      { key: 'count', label: 'Empleados', sub: 'acreditaciones de la lista', num: true, total: false,
        band: 'Totales', cell: l => esc(String(l.count)) },
      { key: 'total', label: 'Total', sub: 'lo que acredita el banco', num: true, band: 'Totales', close: true },
      ...(totalAlerts > 0 ? [{ key: 'alerts', label: 'Alertas', sub: 'para revisar antes de mandar',
        num: true, total: false, band: 'Totales',
        cell: l => (l.alerts > 0
          ? `<span class="rb-diffbadge rb-diffbadge--error">${l.alerts}</span>`
          : '<span class="rb-diffzero">—</span>') }] : []),
    ];

    renderPlanillaPanel(container, {
      rows: listas,
      columns,
      unitLabel: 'listas',
      estadoDe: l => estadoDeLista(l, cierraOk),
      noAplica: NO_APLICA_ACRED,
      marcas: tiposPresentes.map(t => ({
        value: t.code, label: `${t.code} — ${t.label}`, match: l => l.code === t.code,
      })),
      getLabel: l => `${l.n} — ${l.label} ${fmtDate(l.fecha)}`,
      searchLabel: 'Buscar lista',
      searchPlaceholder: 'Número de lista, liquidación o fecha…',
      stickyCols: 1,
      onExport: (exportEl) => mountExportMenu(exportEl, res),
      emptyText: 'Ninguna lista quedó con los filtros puestos.',
      footnote: (shown) => `Mostrando ${shown.length} de ${listas.length} lista${listas.length === 1 ? '' : 's'}. `
        + `Cada lista es una hoja del .xlsx, y suman ${totalEmpl} ${totalEmpl === 1 ? 'acreditación' : 'acreditaciones'}`
        + (totalAlerts > 0 ? ` y ${totalAlerts} alerta${totalAlerts === 1 ? '' : 's'}` : '')
        + '. '
        + (res.splitByEmpresa ? `Las listas se parten por empresa (${res.empresas.length} empresas en el archivo). ` : '')
        + 'El conteo de empleados y las alertas se ven acá: el .xlsx que va a Finanzas no los incluye.',
    });

    // ── Bancos (corte para tesorería) ───────────────────────────────────────
    const bancosBox = document.createElement('details');
    bancosBox.style.cssText = 'margin:var(--sp-3);padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';
    bancosBox.innerHTML = `
      <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);">
        Acreditaciones por banco (${res.bancos.length})
      </summary>
      <div style="overflow-x:auto;margin-top:var(--sp-3);">
        <table class="data-table data-table--compact">
          <thead>
            <tr><th>Banco</th><th style="text-align:right;">Acreditaciones</th><th style="text-align:right;">Total</th></tr>
          </thead>
          <tbody>
            ${res.bancos.map(b => `
              <tr>
                <td>${esc(b.banco)}</td>
                <td style="text-align:right;">${b.count}</td>
                <td style="text-align:right;">${fmtNum(b.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    container.appendChild(bancosBox);

    // ── Alertas (sólo si hay) ────────────────────────────────────────────────
    if (res.alerts.length > 0) renderAlertsTable(res, container);
  }

  draw(results);
}

/** Sección "grupos pendientes": una fila por Listado/liquidación sin fecha resoluble, con input de fecha + botón Asignar. */
function renderPendingBox(res, pendingGroups, container, draw) {
  const box = document.createElement('div');
  box.style.cssText = 'margin:var(--sp-3);padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-warning);border-radius:var(--radius-md);background:var(--color-surface);';

  box.innerHTML = `
    <div style="font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-warning-text,var(--color-text));margin-bottom:var(--sp-2);">
      ⚠ ${pendingGroups.length} grupo${pendingGroups.length === 1 ? '' : 's'} sin fecha de acreditación — asignala para poder exportarl${pendingGroups.length === 1 ? 'o' : 'os'}
    </div>
    <div style="overflow-x:auto;">
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>Listado</th>
            <th>Liquidación</th>
            <th style="text-align:right;">Empleados</th>
            <th style="text-align:right;">Total</th>
            <th>Fecha de acreditación</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${pendingGroups.map(g => `
            <tr>
              <td>${esc(g.listado || '(sin listado)')}</td>
              <td><span class="badge">${esc(g.tipo.code)}</span> ${esc(g.tipo.label)}</td>
              <td style="text-align:right;">${g.count}</td>
              <td style="text-align:right;font-weight:600;">${fmtNum(g.total)}</td>
              <td><input type="date" class="form-input" style="width:auto;padding:var(--sp-1) var(--sp-2);" data-pending-date data-key="${esc(g.key)}"></td>
              <td><button type="button" class="btn btn--primary btn--sm" data-pending-apply data-key="${esc(g.key)}">Asignar</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-2) 0 0;">
      Ningún empleado de estos grupos tiene fecha de acreditación en el archivo de Axton.
      Al asignarla, el grupo se une a la lista existente de esa fecha o forma una lista nueva.
    </p>
  `;

  container.appendChild(box);

  box.querySelectorAll('[data-pending-apply]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const input = box.querySelector(`[data-pending-date][data-key="${cssEsc(key)}"]`);
      if (!input.value) { input.focus(); return; }
      draw(assignAcreditacionesDate(res, key, input.value));
    });
  });
}

/** Lista de fechas asignadas a mano en este run, con "deshacer" por cada una. */
function renderOverridesBox(res, overrides, container, draw) {
  const box = document.createElement('div');
  box.style.cssText = 'margin:var(--sp-3);padding:var(--sp-2) var(--sp-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);font-size:var(--text-sm);';

  box.innerHTML = `
    <span class="text-muted">Fechas asignadas a mano en este run:</span>
    <ul style="margin:var(--sp-1) 0 0;padding-left:var(--sp-4);">
      ${Object.entries(overrides).map(([key, date]) => `
        <li>
          ${esc(describeAnchorKey(key))} → <strong>${esc(fmtDate(date))}</strong>
          <button type="button" class="btn btn--ghost btn--sm" data-undo-key="${esc(key)}" style="margin-left:var(--sp-2);">Deshacer</button>
        </li>
      `).join('')}
    </ul>
  `;

  container.appendChild(box);

  box.querySelectorAll('[data-undo-key]').forEach(btn => {
    btn.addEventListener('click', () => {
      draw(unassignAcreditacionesDate(res, btn.dataset.undoKey));
    });
  });
}

function renderAlertsTable(results, container) {
  const box = document.createElement('div');
  box.style.cssText = 'margin:var(--sp-3);';

  const searchEl = document.createElement('div');
  const header = document.createElement('div');
  header.className = 'results-toolbar';
  header.innerHTML = `
    <div style="font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-wordmark);">
      ${results.alerts.length} alerta${results.alerts.length === 1 ? '' : 's'} para revisar
    </div>
  `;
  header.appendChild(searchEl);

  const tableHost = document.createElement('div');
  tableHost.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr><th>Legajo</th><th>Apellido y Nombre</th><th>Lista</th><th>Alerta</th><th>Detalle</th><th style="text-align:right;">Neto</th></tr>
      </thead>
      <tbody>
        ${results.alerts.map(a => `
          <tr>
            <td>${esc(a.legajo)}</td>
            <td>${esc(a.nombre)}</td>
            <td style="font-size:0.85em;">${esc(a.lista)}</td>
            <td><span class="badge badge--warning">${esc(ALERT_LABEL[a.tipo] || a.tipo)}</span></td>
            <td style="font-size:0.85em;color:var(--color-text-muted);">${esc(a.detalle)}</td>
            <td style="text-align:right;">${fmtNum(a.neto)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  box.appendChild(header);
  box.appendChild(tableHost);
  container.appendChild(box);

  wireTableTools(tableHost.querySelector('table'), {
    rows: results.alerts,
    getLabel: a => `${a.legajo} — ${a.nombre}`,
    searchEl,
    stickyCols: 1,
  });
}

// ── Editor de configuración (Paso 2 del wizard) ───────────────────────────────

/**
 * Toggle de corte por empresa. Se muestra siempre: el archivo puede no estar
 * cargado todavía cuando se renderiza el paso.
 */
export function renderAcreditacionesConfigEditor(container, opts = {}) {
  const {
    config = DEFAULT_ACREDITACIONES_CONFIG,
    openByDefault = true,
    onChange = () => {},
  } = opts;

  const current = { ...DEFAULT_ACREDITACIONES_CONFIG, ...config };

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Opciones del reporte
    </summary>
    <label style="display:flex;align-items:flex-start;gap:var(--sp-2);margin-top:var(--sp-3);cursor:pointer;">
      <input type="checkbox" data-acred-split ${current.splitByEmpresa ? 'checked' : ''}>
      <span style="font-size:var(--text-sm);">
        Separar las listas por empresa
        <span class="text-muted" style="display:block;font-size:var(--text-sm);">
          Sólo tiene efecto si el archivo trae más de una empresa. Con una sola, las listas van juntas.
        </span>
      </span>
    </label>
  `;

  editor.querySelector('[data-acred-split]').addEventListener('change', (e) => {
    current.splitByEmpresa = e.target.checked;
    onChange({ ...current });
  });

  container.appendChild(editor);
}

// ── Export a Excel — el entregable del control ────────────────────────────────

/**
 * Arma el .xlsx y lo descarga: hoja CONTROL + una hoja por lista (+ SIN ASIGNAR
 * si queda algún grupo sin fecha resuelta).
 *
 * Lo que NO va acá, a propósito (D-020): conteo de empleados, bloque de
 * excepciones, alertas de integridad y cortes por banco. Este archivo lo recibe
 * Finanzas del cliente, que no necesariamente ve información de HR.
 *
 * Se exporta (a diferencia de los export* del resto de los controles, que son
 * privados de su módulo) porque acá el .xlsx no es un anexo de la pantalla: es
 * el entregable del control.
 */
export async function exportAcreditacionesToXlsx(results) {
  await loadExcelJS();
  const wb = buildAcreditacionesWorkbook(results);
  await downloadWorkbook(wb, `Acreditaciones_${periodSuffix(results.period)}.xlsx`);
}

/**
 * El workbook, sin descargarlo — separado de `exportAcreditacionesToXlsx` para
 * que el test de conformidad pueda inspeccionar las celdas sin DOM ni Blob
 * (`tests/exportSinWriterConformidad.test.js`). Este export es uno de los que
 * arma su `.xlsx` **a mano**, por diseño y no por deuda (D-051): la separación
 * es lo que hace que "a mano" siga siendo verificable contra su contrato.
 *
 * Sólo necesita `window.ExcelJS` ya cargado — llamalo después de `loadExcelJS()`.
 */
export function buildAcreditacionesWorkbook(results) {
  const { listas, sinAsignar: pendingGroups, summary: s } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();
  // Las celdas del cierre y los totales se escriben como fórmulas sin valor
  // cacheado: sin esto, un visor que no recalcula al abrir las muestra vacías.
  wb.calcProperties.fullCalcOnLoad = true;

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const GRAY_HDR = 'FFE8E8E8';
  const NUM_FMT  = '#,##0.00';
  const DATE_FMT = 'dd/mm/yyyy';

  const ctrl = wb.addWorksheet('CONTROL');
  const detailSheets = [];   // { lista, sheetName, totalRef }

  // ── Hojas de detalle ──────────────────────────────────────────────────────
  const addDetailSheet = (name, title, rows) => {
    const ws = wb.addWorksheet(sanitizeSheetName(name));
    ws.columns = [
      { width: 10 },  // A Legajo
      { width: 34 },  // B Apellido y Nombre
      { width: 16 },  // C CUIT
      { width: 16 },  // D Neto
      { width: 18 },  // E Fecha Acreditacion
      { width: 14 },  // F Banco
      { width: 26 },  // G CBU
    ];

    const firstDataRow = 3;
    const lastDataRow  = firstDataRow + rows.length - 1;
    const sumFormula   = rows.length > 0 ? `SUM(D${firstDataRow}:D${lastDataRow})` : '0';

    // Fila 1: título + total arriba, para no tener que bajar 200 filas.
    const titleRow = ws.addRow([title, null, 'Total', { formula: sumFormula }]);
    titleRow.getCell(1).font = { ...bold, size: 11 };
    titleRow.getCell(3).font = { ...bold };
    titleRow.getCell(3).alignment = { horizontal: 'right' };
    titleRow.getCell(4).font   = { ...bold };
    titleRow.getCell(4).numFmt = NUM_FMT;

    // Las etiquetas salen del contrato, no de una copia a mano: es la mitad
    // "semántica" que sí se comparte aunque el layout de esta hoja no entre en
    // `writeContractSheet` (D-051). Los anchos, formatos y la fila de título de
    // arriba son la mitad "layout", y esos sí viven acá.
    const hdrRow = ws.addRow(DETALLE_COLUMNS.map(c => c.label));
    hdrRow.height = 18;
    for (let c = 1; c <= DETALLE_COLUMNS.length; c++) {
      const cell = hdrRow.getCell(c);
      cell.font      = { ...bold };
      cell.fill      = solidFill(GRAY_HDR);
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
    }

    for (const r of rows) {
      const dr = ws.addRow([
        toNumOrText(r.legajo),
        r.nombre,
        r.cuit,
        r.neto,
        r.fecha ? excelSerial(r.fecha) : null,
        r.banco,
        r.cbu,
      ]);
      for (let c = 1; c <= DETALLE_COLUMNS.length; c++) dr.getCell(c).font = { ...base };
      // CUIT y CBU como texto: el CBU tiene 22 dígitos y ceros a la izquierda,
      // como número Excel lo pasa a notación científica y se pierde.
      dr.getCell(3).numFmt = '@';
      dr.getCell(7).numFmt = '@';
      dr.getCell(4).numFmt = NUM_FMT;
      dr.getCell(4).alignment = { horizontal: 'right' };
      dr.getCell(5).numFmt = DATE_FMT;
      dr.getCell(5).alignment = { horizontal: 'center' };
    }

    ws.addRow([]);
    const totalRow = ws.addRow(['TOTAL', null, null, { formula: sumFormula }]);
    totalRow.getCell(1).font = { ...bold };
    totalRow.getCell(4).font = { ...bold };
    totalRow.getCell(4).numFmt = NUM_FMT;

    ws.views = [{ state: 'frozen', ySplit: 2 }];
    if (rows.length > 0) {
      ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: DETALLE_COLUMNS.length } };
    }

    return { sheetName: ws.name, totalRef: `'${ws.name}'!D1` };
  };

  for (const l of listas) {
    const name  = `${String(l.n).padStart(2, '0')} ${l.code} ${fmtDateShort(l.fecha)}`;
    const title = [results.cliente, l.label, fmtDate(l.fecha), l.empresa]
      .filter(Boolean).join(' · ');
    detailSheets.push({ lista: l, ...addDetailSheet(name, title, l.rows) });
  }

  const pendingRows = pendingGroups.flatMap(g => g.rows);
  const sinAsignarSheet = pendingRows.length > 0
    ? addDetailSheet(
        'SIN ASIGNAR',
        `${results.cliente} · Sin fecha de acreditación asignable · ${periodToLabel(results.period)}`,
        [...pendingRows].sort(byNombre)
      )
    : null;

  // ── Hoja CONTROL ──────────────────────────────────────────────────────────
  const cols = results.splitByEmpresa
    ? ['Lista', 'Empresa', 'Liquidación', 'Fecha de acred', 'Fecha de paga', 'Listado', 'Total']
    : ['Lista', 'Liquidación', 'Fecha de acred', 'Fecha de paga', 'Listado', 'Total'];
  const totalCol       = cols.length;                  // el Total es la última columna
  const totalColLetter = colLetter(totalCol);

  ctrl.columns = results.splitByEmpresa
    ? [{ width: 8 }, { width: 24 }, { width: 26 }, { width: 16 }, { width: 16 }, { width: 20 }, { width: 18 }]
    : [{ width: 8 }, { width: 26 }, { width: 16 }, { width: 16 }, { width: 20 }, { width: 18 }];

  ctrl.addRow(['Control acreditaciones']).getCell(1).font = { ...bold, size: 14 };
  ctrl.addRow([results.cliente]).getCell(1).font = { ...bold, size: 11 };
  ctrl.addRow([]);
  ctrl.addRow([periodToLabel(results.period)]).getCell(1).font = { ...bold };

  const hdrRow = ctrl.addRow(cols);
  hdrRow.height = 18;
  cols.forEach((_, i) => {
    const cell = hdrRow.getCell(i + 1);
    cell.font      = { ...bold };
    cell.fill      = solidFill(GRAY_HDR);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
  });

  const firstListaRow = hdrRow.number + 1;
  for (const d of detailSheets) {
    const l = d.lista;
    const values = results.splitByEmpresa
      ? [l.n, l.empresa, l.label, excelSerial(l.fecha), excelSerial(l.fecha), l.listados.join(' + '), { formula: d.totalRef }]
      : [l.n, l.label, excelSerial(l.fecha), excelSerial(l.fecha), l.listados.join(' + '), { formula: d.totalRef }];
    const dr = ctrl.addRow(values);
    for (let c = 1; c <= cols.length; c++) dr.getCell(c).font = { ...base };
    dr.getCell(1).alignment = { horizontal: 'center' };
    const fechaCols = results.splitByEmpresa ? [4, 5] : [3, 4];
    for (const c of fechaCols) {
      dr.getCell(c).numFmt = DATE_FMT;
      dr.getCell(c).alignment = { horizontal: 'center' };
    }
    dr.getCell(totalCol).numFmt = NUM_FMT;
  }
  const lastListaRow = firstListaRow + detailSheets.length - 1;

  ctrl.addRow([]);

  // ── Cierre: todo con fórmulas, salvo el total del archivo de origen ───────
  // El "Total archivo Axton" es un literal a propósito: es el ancla contra la
  // que se valida el reporte. Si fuera una fórmula sobre nuestras propias
  // hojas, la diferencia daría cero siempre y no probaría nada.
  const addCierreRow = (label, value, opts2 = {}) => {
    const values = new Array(cols.length).fill(null);
    values[0] = label;
    values[totalCol - 1] = value;
    const r = ctrl.addRow(values);
    r.getCell(1).font = opts2.strong ? { ...bold, size: 11 } : { ...bold };
    const cell = r.getCell(totalCol);
    cell.numFmt = NUM_FMT;
    cell.font   = opts2.danger
      ? { ...bold, color: { argb: 'FFCC0000' } }
      : (opts2.strong ? { ...bold, size: 11 } : { ...bold });
    return r;
  };

  const totalRow = addCierreRow(
    'TOTAL ACREDITADO',
    detailSheets.length > 0
      ? { formula: `SUM(${totalColLetter}${firstListaRow}:${totalColLetter}${lastListaRow})` }
      : 0,
    { strong: true }
  );

  const sinAsignarRow = sinAsignarSheet
    ? addCierreRow('Sin asignar', { formula: sinAsignarSheet.totalRef }, { danger: true })
    : null;

  const origenRow = addCierreRow('Total archivo Axton', s.totalOrigen);

  const parts = [`${totalColLetter}${totalRow.number}`];
  if (sinAsignarRow) parts.push(`${totalColLetter}${sinAsignarRow.number}`);
  addCierreRow(
    'Diferencia',
    { formula: `${parts.join('+')}-${totalColLetter}${origenRow.number}` },
    { danger: Math.abs(s.diferencia) > CIERRE_EPS }
  );

  ctrl.views = [{ state: 'frozen', ySplit: hdrRow.number }];

  return wb;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function byNombre(a, b) {
  return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
}

function sumNeto(rows) {
  return round2(rows.reduce((acc, r) => acc + (r.neto ?? 0), 0));
}

function listaLabel(l) {
  return `${String(l.n).padStart(2, '0')} ${l.code} ${fmtDateShort(l.fecha)}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA' */
function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** 'YYYY-MM-DD' → 'DD-MM' (para el nombre de la pestaña) */
function fmtDateShort(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}-${m}`;
}

/**
 * 'YYYY-MM-DD' → serial de Excel. Se escribe el serial y no un Date para que la
 * fecha no se corra un día según la zona horaria del navegador.
 */
function excelSerial(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000) + 25569;
}

// El legajo es numérico en Axton, pero si alguna cuenta lo trae alfanumérico se
// escribe como texto en vez de romper la celda.
function toNumOrText(v) {
  const n = Number(v);
  return (v !== '' && !isNaN(n)) ? n : String(v ?? '');
}

// Excel no acepta : \ / ? * [ ] en el nombre de una hoja, ni más de 31 caracteres.
// La comilla simple se saca porque rompería las fórmulas que referencian la hoja.
function sanitizeSheetName(name) {
  return String(name).replace(/[:\\/?*[\]']/g, '-').slice(0, 31).trim();
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Escapa un valor para usarlo dentro de un selector CSS attribute ([data-x="…"]) —
// las claves de grupo (`L:18336`, `Q:Anticipo de sueldo…`) pueden traer comillas
// o caracteres especiales si el texto crudo de Axton los trae.
function cssEsc(str) {
  return window.CSS?.escape ? CSS.escape(str) : String(str).replace(/["\\]/g, '\\$&');
}
