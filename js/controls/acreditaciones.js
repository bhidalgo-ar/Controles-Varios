// acreditaciones.js — Control Acreditaciones (Axton)
//
// Modo 1 — "Generar Reporte": arma el reporte de acreditaciones del mes desde el
//   export `contacred` de Axton. Una hoja por acreditación real (tipo de
//   liquidación × fecha de acreditación) más una hoja CONTROL que las lista con
//   su total y cierra contra el total del archivo de origen.
//
// Modo 2 — "Controlar": pendiente (cruce contra el Tabulado).
//
// Las reglas de agrupación, herencia de fecha y normalización de tipos están
// documentadas en specs/control-acreditaciones-axton.md — se reconstruyeron
// contra el archivo que el equipo armaba a mano y cierran al centavo.
//
// El .xlsx generado va a Finanzas del cliente: NO lleva información de HR
// (dotación, conteos de empleados, altas/bajas). Eso vive sólo en esta pantalla.
// Ver D-020 en DECISIONS.md.

import { renderExportMenu } from '../ui/exportMenu.js';
import { initShowMorePagination, initSearchCombobox } from '../ui/tableTools.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { periodToLabel } from '../utils/dates.js';

export const DEFAULT_ACREDITACIONES_CONFIG = {
  // Cuando el archivo trae más de una Empresa, ¿las listas se parten por empresa?
  // Con una sola empresa (el caso de POP) el flag no tiene efecto.
  splitByEmpresa: true,
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
  const acred     = acredRows.filter(r => r.listado !== '' || r.neto !== null);
  const descartadas = acredRows.length - acred.length;

  if (acred.length === 0) {
    return { error: 'El archivo no tiene ninguna acreditación: todas las filas están sin importe y sin listado.' };
  }

  // Fechas conocidas por liquidación cruda, para heredarlas en las filas que no
  // la traen. Sólo se hereda cuando la liquidación tiene UNA sola fecha: si tiene
  // varias (los anticipos se pagan en varias fechas del mes), la fila queda sin
  // asignar y la resuelve el analista — no se adivina.
  const datesByLiq = new Map();
  for (const r of acred) {
    if (!r.fecha_acreditacion) continue;
    if (!datesByLiq.has(r.liquidacion)) datesByLiq.set(r.liquidacion, new Set());
    datesByLiq.get(r.liquidacion).add(r.fecha_acreditacion);
  }
  const inheritedDate = (liq) => {
    const dates = datesByLiq.get(liq);
    return dates && dates.size === 1 ? [...dates][0] : null;
  };

  const empresas = [...new Set(acred.map(r => r.empresa).filter(Boolean))].sort();
  const splitByEmpresa = cfg.splitByEmpresa && empresas.length > 1;

  // Filas del reporte, ya tipadas y con la fecha resuelta.
  const rows = acred.map(r => {
    const tipo  = normalizeLiqType(r.liquidacion);
    const fecha = r.fecha_acreditacion || inheritedDate(r.liquidacion);
    return {
      legajo:   r.legajo,
      nombre:   r.apellido_nombre,
      cuit:     r.cuit,
      neto:     r.neto,
      fecha,
      banco:    r.banco,
      cbu:      r.cbu,
      listado:  r.listado,
      liqRaw:   r.liquidacion,
      empresa:  r.empresa,
      uo:       r.uo_cliente,
      tipo,
      alerts:   [],
    };
  });

  flagRowAlerts(rows);

  // ── Agrupación en listas: (tipo, fecha) [+ empresa] ────────────────────────
  const groups = new Map();
  const unassignedRows = [];

  for (const row of rows) {
    if (!row.fecha) { unassignedRows.push(row); continue; }
    const key = [row.tipo.code, row.fecha, splitByEmpresa ? row.empresa : ''].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        code:    row.tipo.code,
        label:   row.tipo.label,
        order:   row.tipo.order,
        fecha:   row.fecha,
        empresa: splitByEmpresa ? row.empresa : '',
        rows:    [],
      });
    }
    groups.get(key).rows.push(row);
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

  const sinAsignar = unassignedRows.length > 0
    ? {
        rows:  [...unassignedRows].sort(byNombre),
        total: sumNeto(unassignedRows),
        count: unassignedRows.length,
      }
    : null;

  // ── Cierre contra el origen ────────────────────────────────────────────────
  // totalOrigen viene del parser (suma de Neto de TODAS las filas del archivo,
  // antes de descartar ninguna). Es el ancla independiente del reporte.
  const totalAcreditado = round2(listas.reduce((acc, l) => acc + l.total, 0));
  const sinAsignarTotal = sinAsignar ? sinAsignar.total : 0;
  const totalOrigen     = round2(acredRows.reduce((acc, r) => acc + (r.neto ?? 0), 0));
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

  const listaLabelOf = new Map();
  for (const l of listas) for (const r of l.rows) listaLabelOf.set(r, listaLabel(l));

  const alerts = [
    ...rows
      .filter(r => r.alerts.length > 0)
      .flatMap(r => r.alerts.map(a => ({
        tipo:    a.tipo,
        detalle: a.detalle,
        legajo:  r.legajo,
        nombre:  r.nombre,
        lista:   listaLabelOf.get(r) || 'SIN ASIGNAR',
        neto:    r.neto,
      }))),
    ...(sinAsignar ? sinAsignar.rows.map(r => ({
      tipo:    'sin_asignar',
      detalle: `Sin fecha de acreditación — la liquidación "${cleanLiqLabel(r.liqRaw)}" tiene varias fechas en el mes`,
      legajo:  r.legajo,
      nombre:  r.nombre,
      lista:   'SIN ASIGNAR',
      neto:    r.neto,
    })) : []),
  ];

  return {
    summary: {
      listas:          listas.length,
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
    sinAsignar,
    bancos,
    alerts,
    cliente:  acredRows.find(r => r.cliente)?.cliente || acred.find(r => r.empresa)?.empresa || '',
    empresas,
    splitByEmpresa,
    period:   mapping.period || '',
  };
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

  // "Unidad" del semáforo = la lista de acreditación. Si el cierre contra el
  // archivo de origen no da cero, el reporte entero es sospechoso: se marcan
  // todas las listas para que el semáforo quede en rojo, no sólo las que tienen
  // una alerta puntual.
  const unitsWithDiff = cierraOk
    ? s.listasConAlerta + (results.sinAsignar ? 1 : 0)
    : s.listas;

  const insights = [];
  if (!cierraOk) {
    insights.push({ type: 'warning', label: 'diferencia contra el total del archivo de Axton', value: fmtNum(s.diferencia) });
  }
  if (results.sinAsignar) {
    insights.push({ type: 'warning', label: 'acreditaciones sin fecha asignable', value: results.sinAsignar.count });
  }
  if (s.listasConAlerta > 0) {
    insights.push({ type: 'warning', label: 'listas con alguna alerta', value: s.listasConAlerta });
  }

  return {
    status:   (cierraOk && unitsWithDiff === 0) ? 'success' : 'warning',
    headline: `${s.listas} acreditación${s.listas === 1 ? '' : 'es'} · ${fmtNum(s.totalAcreditado)} acreditado`,
    insights,
    unit: 'lista',
    unitsTotal: s.listas,
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

  const { listas, summary: s } = results;

  if (listas.length === 0 && !results.sinAsignar) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const cierraOk    = Math.abs(s.diferencia) <= 0.01;
  const listasOk    = listas.length - s.listasConAlerta;

  container.innerHTML = '';

  // ── Hero: listas sin alerta vs con alerta ─────────────────────────────────
  const hero = document.createElement('div');
  hero.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-5);padding:var(--sp-3) var(--sp-4);margin:var(--sp-3) var(--sp-3) 0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);';
  hero.innerHTML = `
    <div style="display:flex;align-items:baseline;gap:8px;">
      <span style="font-size:1.8em;font-weight:700;color:var(--color-success);">${listasOk}</span>
      <span style="font-size:var(--text-sm);color:var(--color-text-muted);">lista${listasOk === 1 ? '' : 's'} sin alertas</span>
    </div>
    <div style="display:flex;align-items:baseline;gap:8px;">
      <span style="font-size:1.8em;font-weight:700;color:${s.listasConAlerta > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'};">${s.listasConAlerta}</span>
      <span style="font-size:var(--text-sm);color:var(--color-text-muted);">con alertas</span>
    </div>
    <div style="margin-left:auto;font-size:var(--text-sm);color:var(--color-text-muted);text-align:right;">
      ${s.acreditaciones} acreditacion${s.acreditaciones === 1 ? '' : 'es'} · ${fmtNum(s.totalAcreditado)}
      ${s.descartadas > 0 ? `<br>${s.descartadas} fila${s.descartadas === 1 ? '' : 's'} sin importe ni listado (descartadas)` : ''}
    </div>
  `;
  container.appendChild(hero);

  // ── Cierre contra el archivo de Axton ─────────────────────────────────────
  const cierre = document.createElement('div');
  const cierreColor = cierraOk ? 'var(--color-success)' : 'var(--color-danger)';
  cierre.style.cssText = `display:flex;align-items:center;gap:var(--sp-2);margin:var(--sp-3);padding:var(--sp-4);border:1px solid var(--color-border);border-left:4px solid ${cierreColor};border-radius:var(--radius-md);background:var(--color-surface);`;
  cierre.innerHTML = cierraOk
    ? `<span style="font-size:var(--text-xl);color:var(--color-success);">✓</span>
       <span>El reporte cierra exacto contra el archivo de Axton: ${fmtNum(s.totalOrigen)}
       ${results.sinAsignar ? ` (${fmtNum(s.totalAcreditado)} en listas + ${fmtNum(s.sinAsignarTotal)} sin asignar)` : ''}.</span>`
    : `<span style="font-size:var(--text-xl);color:var(--color-danger);">⚠</span>
       <span><strong>El reporte no cierra contra el archivo de Axton.</strong>
       Listas ${fmtNum(s.totalAcreditado)} + sin asignar ${fmtNum(s.sinAsignarTotal)}
       − archivo ${fmtNum(s.totalOrigen)} = <strong style="color:var(--color-danger);">${fmtNum(s.diferencia)}</strong>.</span>`;
  container.appendChild(cierre);

  // ── Toolbar: filtro por tipo + buscador + exportar ────────────────────────
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

  // El export siempre incluye TODAS las listas, sin importar el filtro de
  // pantalla. El .xlsx es el entregable del control (el reporte en sí).
  const csvHeaders = ['Lista', ...(results.splitByEmpresa ? ['Empresa'] : []), 'Liquidación', 'Fecha de acred', 'Fecha de paga', 'Listado', 'Total'];
  const csvRows = () => listas.map(l => [
    l.n,
    ...(results.splitByEmpresa ? [l.empresa] : []),
    l.label, fmtDate(l.fecha), fmtDate(l.fecha), l.listados.join(' + '), fmtNum(l.total),
  ]);

  renderExportMenu(exportEl, {
    onExcel: () => exportAcreditacionesToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `Acreditaciones_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });

  // ── Tabla de listas ──────────────────────────────────────────────────────
  const tableHost = document.createElement('div');
  container.appendChild(tableHost);

  function renderTable(selectedCode) {
    const shown = selectedCode === 'all' ? listas : listas.filter(l => l.code === selectedCode);
    // Columnas que no aportan nada no se muestran (CLAUDE.md §11.1).
    const showEmpresa = results.splitByEmpresa;
    const showAlerts  = shown.some(l => l.alerts > 0);

    tableHost.style.overflowX = 'auto';
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
          ${results.sinAsignar && selectedCode === 'all' ? `
            <tr>
              <td style="text-align:center;color:var(--color-danger);font-weight:700;">—</td>
              ${showEmpresa ? '<td>—</td>' : ''}
              <td colspan="3" style="color:var(--color-danger);">SIN ASIGNAR — sin fecha de acreditación resoluble</td>
              <td style="text-align:right;">${results.sinAsignar.count}</td>
              <td style="text-align:right;font-weight:600;">${fmtNum(results.sinAsignar.total)}</td>
              ${showAlerts ? `<td style="text-align:center;color:var(--color-danger);font-weight:700;">${results.sinAsignar.count}</td>` : ''}
            </tr>` : ''}
        </tbody>
      </table>
      <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
        Mostrando ${shown.length} de ${listas.length} lista${listas.length === 1 ? '' : 's'}.
        Cada lista es una hoja del .xlsx.
        ${results.splitByEmpresa ? `Las listas se parten por empresa (${results.empresas.length} empresas en el archivo).` : ''}
        El conteo de empleados y las alertas se ven acá: el .xlsx que va a Finanzas no los incluye.
      </p>
    `;

    const tbodyEl = tableHost.querySelector('tbody');
    const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
    initSearchCombobox(searchEl, {
      rows: shown,
      // slice: la fila de SIN ASIGNAR va al final del tbody y no es una lista
      // numerada — queda fuera del buscador.
      trEls: pagination.dataRows.slice(0, shown.length),
      getLabel: l => `${l.n} — ${l.label} ${fmtDate(l.fecha)}`,
      label: 'Buscar lista',
      pagination,
    });
  }

  filterGroup.querySelector('[data-acred-type-filter]')
    .addEventListener('change', (e) => renderTable(e.target.value));
  renderTable('all');

  // ── Bancos (corte para tesorería) ────────────────────────────────────────
  const bancosBox = document.createElement('details');
  bancosBox.style.cssText = 'margin:var(--sp-3);padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';
  bancosBox.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);">
      Acreditaciones por banco (${results.bancos.length})
    </summary>
    <div style="overflow-x:auto;margin-top:var(--sp-3);">
      <table class="data-table data-table--compact">
        <thead>
          <tr><th>Banco</th><th style="text-align:right;">Acreditaciones</th><th style="text-align:right;">Total</th></tr>
        </thead>
        <tbody>
          ${results.bancos.map(b => `
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
  if (results.alerts.length > 0) renderAlertsTable(results, container);
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
  tableHost.style.overflowX = 'auto';
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
 * Arma el .xlsx: hoja CONTROL + una hoja por lista (+ SIN ASIGNAR si hay).
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

  const { listas, sinAsignar, summary: s } = results;

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

  const sinAsignarSheet = sinAsignar
    ? addDetailSheet(
        'SIN ASIGNAR',
        `${results.cliente} · Sin fecha de acreditación asignable · ${periodToLabel(results.period)}`,
        sinAsignar.rows
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

function dateSuffix() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function periodSuffix(period) {
  if (!period) return dateSuffix();
  const [year, month] = period.split('-');
  return (!year || !month) ? dateSuffix() : String(month).padStart(2, '0') + year;
}
