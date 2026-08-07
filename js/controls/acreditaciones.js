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

import { renderExportMenu } from '../ui/exportMenu.js';
import { initShowMorePagination, initSearchCombobox } from '../ui/tableTools.js';
import { renderVerdict, renderTiles, renderIssues, renderResumenDetalle, enhanceGrid } from '../ui/resultBlocks.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { periodToLabel } from '../utils/dates.js';

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

  return {
    summary: {
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
    },
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
  const cierraOk = Math.abs(s.diferencia) <= 0.01;

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
  };
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

export function renderAcreditacionesReporteResults(results, container) {
  if (results.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }

  // Se recuerda la solapa activa entre draws: asignar/deshacer una fecha
  // manual (D-022) reconstruye toda la pantalla, y no tiene sentido devolver
  // al analista al Resumen si estaba trabajando en el Detalle.
  let activeTabId = 'resumen';

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

    const cierraOk = Math.abs(s.diferencia) <= 0.01;
    const listasOk = listas.length - s.listasConAlerta;

    container.innerHTML = '';

    renderResumenDetalle(container, {
      activeId: activeTabId,
      onChange(id) { activeTabId = id; },
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
      detalle(panel) { drawDetalle(res, panel); },
    });
  }

  function drawDetalle(res, container) {
    const { listas, sinAsignar: pendingGroups } = res;

    // ── Grupos pendientes: asignar fecha a mano ─────────────────────────────
    if (pendingGroups.length > 0) renderPendingBox(res, pendingGroups, container, draw);

    // ── Fechas asignadas a mano en este run (con "deshacer") ────────────────
    const overrides = res._cfg?.dateOverrides || {};
    if (Object.keys(overrides).length > 0) renderOverridesBox(res, overrides, container, draw);

    // ── Toolbar: filtro por tipo + buscador + exportar ──────────────────────
    const typesPresent = [...new Map(listas.map(l => [l.code, l])).values()]
      .sort((a, b) => a.order - b.order);

    const toolbar = document.createElement('div');
    toolbar.className = 'results-toolbar';

    const leftGroup = document.createElement('div');
    leftGroup.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--sp-3);align-items:flex-end;';

    const filterGroup = document.createElement('div');
    filterGroup.className = 'form-group';
    filterGroup.style.cssText = 'margin-bottom:0;min-width:240px;';
    filterGroup.innerHTML = `
      <label class="form-label" style="font-size:var(--text-sm);">Filtrar por tipo de liquidación</label>
      <select class="form-select form-select--sm" data-acred-type-filter>
        <option value="all">Todos los tipos (${typesPresent.length})</option>
        ${typesPresent.map(t => `<option value="${esc(t.code)}">${esc(t.label)}</option>`).join('')}
      </select>
    `;

    const searchEl = document.createElement('div');
    leftGroup.appendChild(filterGroup);
    leftGroup.appendChild(searchEl);

    const exportEl = document.createElement('div');
    toolbar.appendChild(leftGroup);
    toolbar.appendChild(exportEl);
    container.appendChild(toolbar);

    if (listas.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-muted';
      p.style.padding = 'var(--sp-4)';
      p.textContent = 'Todavía no hay ninguna lista formada: asigná una fecha a los grupos pendientes de arriba.';
      container.appendChild(p);
      return;
    }

    // El export siempre incluye TODAS las listas, sin importar el filtro de
    // pantalla. El .xlsx es el entregable del control (el reporte en sí).
    const csvHeaders = ['Lista', ...(res.splitByEmpresa ? ['Empresa'] : []), 'Liquidación', 'Fecha de acred', 'Fecha de paga', 'Listado', 'Total'];
    const csvRows = () => listas.map(l => [
      l.n,
      ...(res.splitByEmpresa ? [l.empresa] : []),
      l.label, fmtDate(l.fecha), fmtDate(l.fecha), l.listados.join(' + '), fmtNum(l.total),
    ]);

    renderExportMenu(exportEl, {
      onExcel: () => exportAcreditacionesToXlsx(res),
      onCsv:   () => downloadCsv(csvHeaders, csvRows(), `Acreditaciones_${periodSuffix(res.period)}.csv`),
      onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
    });

    // ── Tabla de listas ────────────────────────────────────────────────────
    const tableHost = document.createElement('div');
    container.appendChild(tableHost);

    function renderTable(selectedCode) {
      const shown = selectedCode === 'all' ? listas : listas.filter(l => l.code === selectedCode);
      // Columnas que no aportan nada no se muestran (CLAUDE.md §11.1).
      const showEmpresa = res.splitByEmpresa;
      const showAlerts  = shown.some(l => l.alerts > 0);

      tableHost.innerHTML = `
        <table class="data-table data-table--compact">
          <thead>
            <tr>
              <th style="text-align:center;">Lista</th>
              ${showEmpresa ? '<th>Empresa</th>' : ''}
              <th>Liquidación</th>
              <th>Fecha de acreditación</th>
              <th>Listado</th>
              <th style="text-align:right;">Empleados</th>
              <th style="text-align:right;">Total</th>
              ${showAlerts ? '<th style="text-align:center;">Alertas</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${shown.map(l => `
              <tr>
                <td style="text-align:center;font-weight:600;">${l.n}</td>
                ${showEmpresa ? `<td>${esc(l.empresa)}</td>` : ''}
                <td><span class="badge">${esc(l.code)}</span> ${esc(l.label)}</td>
                <td>${esc(fmtDate(l.fecha))}</td>
                <td style="font-size:0.85em;color:var(--color-text-muted);">${esc(l.listados.join(' + ')) || '—'}</td>
                <td style="text-align:right;">${l.count}</td>
                <td style="text-align:right;font-weight:600;">${fmtNum(l.total)}</td>
                ${showAlerts ? `<td style="text-align:center;${l.alerts > 0 ? 'color:var(--color-danger);font-weight:700;' : ''}">${l.alerts || '—'}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
          Mostrando ${shown.length} de ${listas.length} lista${listas.length === 1 ? '' : 's'}.
          Cada lista es una hoja del .xlsx.
          ${res.splitByEmpresa ? `Las listas se parten por empresa (${res.empresas.length} empresas en el archivo).` : ''}
          El conteo de empleados y las alertas se ven acá: el .xlsx que va a Finanzas no los incluye.
        </p>
      `;

      const tbodyEl = tableHost.querySelector('tbody');
      const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
      initSearchCombobox(searchEl, {
        rows: shown,
        trEls: pagination.dataRows,
        getLabel: l => `${l.n} — ${l.label} ${fmtDate(l.fecha)}`,
        label: 'Buscar lista',
        pagination,
      });
      enhanceGrid(tableHost.querySelector('table'), { stickyCols: 1 });
    }

    filterGroup.querySelector('[data-acred-type-filter]')
      .addEventListener('change', (e) => renderTable(e.target.value));
    renderTable('all');

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

  const tbodyEl = tableHost.querySelector('tbody');
  const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
  initSearchCombobox(searchEl, {
    rows: results.alerts,
    trEls: pagination.dataRows,
    getLabel: a => `${a.legajo} — ${a.nombre}`,
    pagination,
  });
  enhanceGrid(tableHost.querySelector('table'), { stickyCols: 1 });
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
 * Arma el .xlsx: hoja CONTROL + una hoja por lista (+ SIN ASIGNAR si queda
 * algún grupo sin fecha resuelta).
 *
 * Lo que NO va acá, a propósito (D-020): conteo de empleados, bloque de
 * excepciones, alertas de integridad y cortes por banco. Este archivo lo recibe
 * Finanzas del cliente, que no necesariamente ve información de HR.
 *
 * Se exporta (a diferencia de los export* del resto de los controles, que son
 * privados de su módulo) porque acá el .xlsx no es un anexo de la pantalla: es
 * el entregable del control, y así se puede verificar sin pasar por el DOM.
 */
export async function exportAcreditacionesToXlsx(results) {
  await loadExcelJS();

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

    const hdrRow = ws.addRow(['Legajo', 'Apellido y Nombre', 'CUIT', 'Neto', 'Fecha Acreditacion', 'Banco', 'CBU']);
    hdrRow.height = 18;
    for (let c = 1; c <= 7; c++) {
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
      for (let c = 1; c <= 7; c++) dr.getCell(c).font = { ...base };
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
      ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 7 } };
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
    { danger: Math.abs(s.diferencia) > 0.01 }
  );

  ctrl.views = [{ state: 'frozen', ySplit: hdrRow.number }];

  await downloadWorkbook(wb, `Acreditaciones_${periodSuffix(results.period)}.xlsx`);
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

const fmtNum = v => v === null || v === undefined
  ? '—'
  : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

function dateSuffix() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function periodSuffix(period) {
  if (!period) return dateSuffix();
  const [year, month] = period.split('-');
  return (!year || !month) ? dateSuffix() : String(month).padStart(2, '0') + year;
}
