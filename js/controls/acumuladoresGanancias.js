// acumuladoresGanancias.js — Control Acumuladores Ganancias (Axton)
//
// Control de generación (no de cruce): arma, desde los crudos `repacumuladores`
// de Axton, el archivo mensual de acumuladores de Ganancias que hoy el analista
// arma a mano con dos tablas dinámicas encadenadas y un VLOOKUP por mes. No hay
// nada contra qué comparar (status 'info', sin semáforo ni hero de diferencias).
//
// Entrada múltiple: el analista sube un crudo por cada mes que entra en el
// cálculo del SAC teórico (RG 4030: 2 meses · RG 4003: hasta 8). Cada archivo
// llega ya tageado con su período (`_period`, 'YYYY-MM') por el multi-upload de
// js/ui/fileUpload.js (initAcumuladoresMultiUpload, modelo de CONTA) — este
// módulo no sabe nada de archivos individuales, sólo de filas con `_period`.
//
// Reglas de cálculo completas en specs/control-acumuladores-ganancias.md.

import { initTabs } from '../ui/tabs.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { initShowMorePagination, initSearchCombobox } from '../ui/tableTools.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { periodToLabel } from '../utils/dates.js';

// ── Códigos de acumulador (Nro) ───────────────────────────────────────────────
// Matcheo por Nro, no por texto: el origen mezcla acentuación
// ('Retencion' vs 'Retención', 'teorico' sin tilde). El texto es sólo fallback/rótulo.
export const ACUMULADORES = {
  brutoGanancias:     1100,  // Bruto para ganancias
  noRemGravado:       1101,  // No Remunerativo gravado por IIGG
  retribNoHabituales: 1107,  // Retribuciones no habituales
  sacPrimera:         1108,  // SAC primera cuota
  sacSegunda:         1109,  // SAC segunda cuota
  jubilacion:         1120,  // Retención sobre bruto - jubilación
  sindicato:          1121,  // Retencion sobre bruto - sindicato
  obraSocial:         1122,  // Retención sobre bruto - obra social
  excluyeSac:         1137,  // Excluye del SAC teorico
  retenciones:        1150,  // Retenciones efectuadas (= Impuesto a las Ganancias)
};

export const DEFAULT_ACUMULADORES_CONFIG = {
  regimen: 'RG4030',            // 'RG4003' (año calendario) | 'RG4030' (semestral)
  codigos: { ...ACUMULADORES },  // override por cliente, si otra cuenta Axton numera distinto
};

const ACCUM_FIELDS = [
  { key: 'brutoGanancias',     label: 'Bruto para ganancias (1100)' },
  { key: 'noRemGravado',       label: 'No Rem. gravado IIGG (1101)' },
  { key: 'retribNoHabituales', label: 'Retribuciones no habituales (1107)' },
  { key: 'sacPrimera',         label: 'SAC primera cuota (1108)' },
  { key: 'sacSegunda',         label: 'SAC segunda cuota (1109)' },
  { key: 'jubilacion',         label: 'Retención jubilación (1120)' },
  { key: 'sindicato',          label: 'Retención sindicato (1121)' },
  { key: 'obraSocial',         label: 'Retención obra social (1122)' },
  { key: 'excluyeSac',         label: 'Excluye del SAC teórico (1137)' },
  { key: 'retenciones',        label: 'Retenciones efectuadas (1150)' },
];

// Columnas de la hoja/solapa MM-AAAA (mes de proceso + SAC teórico acumulado)
const MES_CONCEPTS = [
  { key: 'brutoGanancias', label: 'Bruto para ganancias' },
  { key: 'retribNoHabit',  label: 'Retribuciones no habituales' },
  { key: 'noRemGravado',   label: 'No Rem. gravado IIGG' },
  { key: 'sacSegunda',     label: 'SAC segunda cuota' },
  { key: 'excluyeSac',     label: 'Excluye del SAC teórico' },
  { key: 'retJubilacion',  label: 'Ret. jubilación' },
  { key: 'retObraSocial',  label: 'Ret. obra social' },
  { key: 'retSindicato',   label: 'Ret. sindicato' },
  { key: 'retenciones',    label: 'Retenciones efectuadas' },
  { key: 'sacTeorico',     label: 'SAC TEÓRICO' },
];

// Columnas de la hoja/solapa DATOS (acumulado del año, del crudo más nuevo)
const DATOS_CONCEPTS = [
  { key: 'brutoGanancias', label: 'Bruto para ganancias' },
  { key: 'excluyeSac',     label: 'Excluye del SAC teórico' },
  { key: 'noRemGravado',   label: 'No Rem. gravado IIGG' },
  { key: 'retribNoHabit',  label: 'Retribuciones no habituales' },
  { key: 'sacPrimera',     label: 'SAC primera cuota' },
  { key: 'sacSegunda',     label: 'SAC segunda cuota' },
  { key: 'total',          label: 'TOTAL' },
  { key: 'retJubilacion',  label: 'Jubilación' },
  { key: 'retObraSocial',  label: 'Obra social' },
  { key: 'retSindicato',   label: 'Sindicato' },
  { key: 'impuesto',       label: 'IMPUESTO' },
];

// Conceptos que definen si un legajo "tuvo movimiento" en el mes de proceso
// (todos los de MES_CONCEPTS salvo el SAC teórico, que es acumulado de la ventana).
const MOVEMENT_KEYS = MES_CONCEPTS.filter(c => c.key !== 'sacTeorico').map(c => c.key);

// ── run() ──────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} primaryRows - filas de TODOS los crudos subidos, cada una
 *   tageada con `_period` ('YYYY-MM') por initAcumuladoresMultiUpload.
 * @param {object[]} _tabRows - sin uso (tabRequired: false)
 * @param {object}   mapping  - { period, acumuladoresConfig }
 */
export function runAcumuladoresGanancias(primaryRows, _tabRows, mapping) {
  if (!primaryRows?.length) {
    return { error: 'No hay datos de Acumuladores. Subí al menos un crudo repacumuladores de Axton.' };
  }

  const cfgIn = mapping.acumuladoresConfig || {};
  const cfg = {
    ...DEFAULT_ACUMULADORES_CONFIG,
    ...cfgIn,
    codigos: { ...ACUMULADORES, ...(cfgIn.codigos || {}) },
  };
  const CODES = cfg.codigos;

  // Agrupar filas por período (un período = un crudo subido).
  const byPeriod = new Map();
  const sinPeriodo = new Set();
  for (const r of primaryRows) {
    if (!r._period) { sinPeriodo.add(r._fileName || '(archivo sin nombre)'); continue; }
    if (!byPeriod.has(r._period)) byPeriod.set(r._period, []);
    byPeriod.get(r._period).push(r);
  }
  if (sinPeriodo.size > 0) {
    return {
      error: `Falta asignar el período a ${sinPeriodo.size} archivo(s) de Acumuladores `
        + `(${[...sinPeriodo].join(', ')}). Volvé al Paso 2 y completalo antes de ejecutar.`,
    };
  }
  if (byPeriod.size === 0) {
    return { error: 'No hay datos de Acumuladores con período asignado.' };
  }

  const periods    = [...byPeriod.keys()].sort();
  const mesProceso = periods[periods.length - 1];

  // Por archivo: consolidar por legajo (SUMA = acumulado a mes anterior, mes =
  // valores propios del mes, sumando todas las liquidaciones del legajo).
  const perFile = new Map();
  for (const [period, rows] of byPeriod) perFile.set(period, consolidateFile(rows, CODES));

  const alerts = validateWindow(periods, mesProceso, cfg.regimen);

  // ── Tabla MM-AAAA: valores del mes de proceso + SAC teórico acumulado ───────
  const mesData    = perFile.get(mesProceso);
  const mesRows = [...mesData.porLegajo.entries()].map(([legajo, entry]) => {
    const val = key => entry.mes[CODES[key]] ?? null;

    const row = {
      legajo,
      nombre:          entry.nombre,
      brutoGanancias:  val('brutoGanancias'),
      retribNoHabit:   val('retribNoHabituales'),
      noRemGravado:    val('noRemGravado'),
      sacSegunda:      val('sacSegunda'),
      excluyeSac:      val('excluyeSac'),
      retJubilacion:   val('jubilacion'),
      retObraSocial:   val('obraSocial'),
      retSindicato:    val('sindicato'),
      retenciones:     val('retenciones'),
    };
    return row;
  });

  // SAC teórico = suma de las doceavas de TODOS los meses subidos, por legajo.
  const sacTeoricoPorLegajo = new Map();
  for (const [, data] of perFile) {
    for (const [legajo, entry] of data.porLegajo) {
      const doceava = calcDoceava(entry.mes, CODES);
      if (doceava === null) continue;
      sacTeoricoPorLegajo.set(legajo, round2((sacTeoricoPorLegajo.get(legajo) ?? 0) + doceava));
    }
  }
  for (const row of mesRows) row.sacTeorico = sacTeoricoPorLegajo.get(row.legajo) ?? null;

  // ── Tabla DATOS: acumulado del año, SOLO del crudo más nuevo (SUMA + sus
  // propias filas de mes) — no se suman los crudos entre sí. ─────────────────
  const datosRows = [...mesData.porLegajo.entries()].map(([legajo, entry]) => {
    const val = key => {
      const nro = CODES[key];
      const s = entry.suma[nro];
      const m = entry.mes[nro];
      if (s === undefined && m === undefined) return null;
      return round2((s ?? 0) + (m ?? 0));
    };

    const brutoGanancias = val('brutoGanancias');
    const noRemGravado   = val('noRemGravado');
    const retribNoHabit  = val('retribNoHabituales');
    const sacPrimera     = val('sacPrimera');
    const sacSegunda     = val('sacSegunda');

    return {
      legajo,
      nombre:         entry.nombre,
      brutoGanancias,
      excluyeSac:     val('excluyeSac'),
      noRemGravado,
      retribNoHabit,
      sacPrimera,
      sacSegunda,
      // TOTAL = 1100 + 1101 + 1107 + 1108 + 1109 — sin 1137 (Excluye del SAC teórico).
      total:          round2(sumOrNull([brutoGanancias, noRemGravado, retribNoHabit, sacPrimera, sacSegunda])),
      retJubilacion:  val('jubilacion'),
      retObraSocial:  val('obraSocial'),
      retSindicato:   val('sindicato'),
      impuesto:       val('retenciones'),
    };
  });

  return {
    mes:       { rows: mesRows },
    datos:     { rows: datosRows },
    period:    mapping.period || mesProceso,
    mesProceso,
    periods,
    regimen:   cfg.regimen,
    alerts,
  };
}

/** Consolida las filas de un crudo por legajo: { suma: {nro: total}, mes: {nro: total}, nombre }. */
function consolidateFile(rows) {
  const porLegajo = new Map();
  for (const r of rows) {
    if (!porLegajo.has(r.legajo)) porLegajo.set(r.legajo, { suma: {}, mes: {}, nombre: '' });
    const entry = porLegajo.get(r.legajo);
    if (!entry.nombre && r.apellido_nombre) entry.nombre = r.apellido_nombre;

    if (r.valor === null) continue;  // sin valor: no aporta ni marca el concepto como presente
    const bucket = r.operacion === 'SUMA' ? entry.suma : entry.mes;
    bucket[r.nro] = (bucket[r.nro] ?? 0) + r.valor;
  }
  return { porLegajo };
}

/**
 * Doceava parte del mes sobre los valores propios (no SUMA):
 *   (Bruto + Retrib.NoHabit + NoRemGravado + SAC2da − Excluye − Jub − ObraSoc − Sindicato) / 12
 * SAC primera cuota y Retenciones no entran (ver spec). Si el legajo no tiene
 * NINGÚN valor ese mes (no liquidó), la doceava es null — se excluye del acumulado,
 * no se cuenta como cero.
 */
function calcDoceava(mesBucket, CODES) {
  const keys = ['brutoGanancias', 'retribNoHabituales', 'noRemGravado', 'sacSegunda', 'excluyeSac', 'jubilacion', 'obraSocial', 'sindicato'];
  const hasAny = keys.some(k => mesBucket[CODES[k]] !== undefined);
  if (!hasAny) return null;

  const g = k => mesBucket[CODES[k]] ?? 0;
  const total = g('brutoGanancias') + g('retribNoHabituales') + g('noRemGravado') + g('sacSegunda')
    - g('excluyeSac') - g('jubilacion') - g('obraSocial') - g('sindicato');
  return round2(total / 12);
}

/**
 * RG 4003 = enero → mes de proceso. RG 4030 = inicio del semestre (ene o jul) →
 * mes de proceso. Valida, no recorta: sólo avisa si falta o sobra un crudo.
 */
function validateWindow(periods, mesProceso, regimen) {
  const [y, m] = mesProceso.split('-').map(Number);
  const startMonth = regimen === 'RG4003' ? 1 : (m <= 6 ? 1 : 7);

  const expected = [];
  for (let mm = startMonth; mm <= m; mm++) expected.push(`${y}-${String(mm).padStart(2, '0')}`);

  const have    = new Set(periods);
  const missing = expected.filter(p => !have.has(p));
  const extra   = periods.filter(p => !expected.includes(p));

  const regimenLabel = regimen === 'RG4003' ? 'RG 4003' : 'RG 4030';
  const alerts = [];
  if (missing.length > 0) {
    alerts.push({
      type: 'warning',
      text: `Faltan crudos de ${missing.length} mes(es) para ${regimenLabel}: ${missing.map(periodToLabel).join(', ')}.`,
    });
  }
  if (extra.length > 0) {
    alerts.push({
      type: 'warning',
      text: `Hay ${extra.length} archivo(s) fuera de la ventana esperada de ${regimenLabel}: ${extra.map(periodToLabel).join(', ')}.`,
    });
  }
  return alerts;
}

function hasMovement(row) {
  return MOVEMENT_KEYS.some(k => row[k] !== null && Math.abs(row[k]) > 0.01);
}

function isVal(v) {
  return v !== null && Math.abs(v) > 0.01;
}

function sumOrNull(values) {
  if (values.every(v => v === null)) return null;
  return values.reduce((acc, v) => acc + (v ?? 0), 0);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ── summarize() ────────────────────────────────────────────────────────────────

export function summarizeAcumuladoresGanancias(results) {
  if (results.error) {
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null,
      diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const totalLegajos  = results.datos.rows.length;
  const conMovimiento = results.mes.rows.filter(hasMovement).length;
  const regimenLabel  = results.regimen === 'RG4003' ? 'RG 4003' : 'RG 4030';

  return {
    status:   'info',
    headline: `${totalLegajos} legajos · ${conMovimiento} con movimiento en ${periodToLabel(results.mesProceso)} · ${regimenLabel}`,
    insights: results.alerts.length
      ? [{ type: 'warning', label: 'alertas de ventana de meses', value: results.alerts.length }]
      : [],
    unit: null, unitsTotal: null, unitsWithDiff: null,
    diffTotalAmount: null, worstCase: null, contextNote: null,
  };
}

// ── Pantalla de resultados ────────────────────────────────────────────────────

const fmtNum = v => v === null
  ? '—'
  : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function renderAcumuladoresResults(results, container) {
  if (results.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }

  const { mes, datos, alerts, mesProceso, periods, regimen } = results;

  if (datos.rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const mesConMov   = mes.rows.filter(hasMovement);
  const sinMovCount = mes.rows.length - mesConMov.length;
  const sacTeoricoTotal = mes.rows.reduce((acc, r) => acc + (r.sacTeorico ?? 0), 0);
  const regimenLabel = regimen === 'RG4003' ? 'RG 4003' : 'RG 4030';

  container.innerHTML = '';

  // ── Tira de KPIs ───────────────────────────────────────────────────────────
  const kpis = document.createElement('div');
  kpis.className = 'hero-kpis';
  kpis.style.cssText = 'grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin:var(--sp-3) var(--sp-3) 0;';
  kpis.innerHTML = `
    <div class="hero-kpi">
      <span class="hero-kpi__value">${datos.rows.length}</span>
      <span class="hero-kpi__label">Legajos</span>
    </div>
    <div class="hero-kpi">
      <span class="hero-kpi__value">${sinMovCount}</span>
      <span class="hero-kpi__label">Sin movimiento en el mes</span>
    </div>
    <div class="hero-kpi">
      <span class="hero-kpi__value" style="font-size:18px;">${fmtNum(sacTeoricoTotal)}</span>
      <span class="hero-kpi__label">SAC teórico total</span>
    </div>
    <div class="hero-kpi">
      <span class="hero-kpi__value">${periods.length}</span>
      <span class="hero-kpi__label">Meses en ventana · ${esc(regimenLabel)}</span>
    </div>
  `;
  container.appendChild(kpis);

  // ── Alertas de la validación de ventana ────────────────────────────────────
  if (alerts.length > 0) {
    const box = document.createElement('div');
    box.style.cssText = 'margin:var(--sp-3);padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-warning);border-radius:var(--radius-md);background:var(--color-surface);';
    box.innerHTML = alerts.map(a => `<div style="font-size:var(--text-sm);">⚠ ${esc(a.text)}</div>`).join('');
    container.appendChild(box);
  }

  // ── Solapas MM-AAAA / DATOS ────────────────────────────────────────────────
  const tabsHost = document.createElement('div');
  container.appendChild(tabsHost);

  initTabs(tabsHost, {
    tabs: [
      { id: 'mes',   label: periodToLabel(mesProceso), render: (panel) => renderConceptTable(panel, {
          rows: mesConMov, concepts: MES_CONCEPTS,
          emptyMessage: 'Ningún legajo tiene movimiento en este período.',
          footnote: `Mostrando ${mesConMov.length} legajo${mesConMov.length === 1 ? '' : 's'} con movimiento en el mes.`
            + (sinMovCount > 0 ? ` El .xlsx incluye además los ${sinMovCount} legajo${sinMovCount === 1 ? '' : 's'} sin movimiento, en cero.` : ''),
        }) },
      { id: 'datos', label: 'DATOS (acumulado)', render: (panel) => renderConceptTable(panel, {
          rows: datos.rows, concepts: DATOS_CONCEPTS,
          emptyMessage: 'Sin datos acumulados.',
          footnote: `Mostrando ${datos.rows.length} legajo${datos.rows.length === 1 ? '' : 's'}. Acumulado del año, del crudo más nuevo.`,
        }) },
    ],
  });

  // ── Export único (arma el .xlsx con ambas hojas) ──────────────────────────
  const exportBar = document.createElement('div');
  exportBar.className = 'results-toolbar';
  exportBar.style.justifyContent = 'flex-end';
  container.appendChild(exportBar);

  const csvHeaders = ['Legajo', 'Apellido y Nombre', ...MES_CONCEPTS.map(c => c.label)];
  const csvRows = () => mesConMov.map(r => [r.legajo, r.nombre, ...MES_CONCEPTS.map(c => fmtNum(r[c.key]))]);

  renderExportMenu(exportBar, {
    onExcel: () => exportAcumuladoresToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `Acumuladores_Ganancias_${mesProceso}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
}

/** Tabla genérica (compartida por las dos solapas): oculta columnas sin valor real, pagina, busca, totaliza. */
function renderConceptTable(panel, { rows, concepts, emptyMessage, footnote }) {
  if (rows.length === 0) {
    panel.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(emptyMessage)}</p>`;
    return;
  }

  const shownConcepts = concepts.filter(c => rows.some(r => isVal(r[c.key])));
  const hiddenCols = concepts.length - shownConcepts.length;

  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  const searchEl = document.createElement('div');
  toolbar.appendChild(searchEl);
  panel.appendChild(toolbar);

  const tableHost = document.createElement('div');
  tableHost.style.overflowX = 'auto';
  panel.appendChild(tableHost);

  const totals = {};
  for (const c of shownConcepts) totals[c.key] = rows.reduce((acc, r) => acc + (r[c.key] ?? 0), 0);

  tableHost.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th>Legajo</th>
          <th>Apellido y Nombre</th>
          ${shownConcepts.map(c => `<th style="text-align:right;white-space:nowrap;">${esc(c.label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${esc(r.legajo)}</td>
            <td>${esc(r.nombre)}</td>
            ${shownConcepts.map(c => `<td style="text-align:right;">${fmtNum(r[c.key])}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
      <tbody>
        <tr style="font-weight:700;border-top:2px solid var(--color-border);">
          <td colspan="2">TOTAL</td>
          ${shownConcepts.map(c => `<td style="text-align:right;">${fmtNum(totals[c.key])}</td>`).join('')}
        </tr>
      </tbody>
    </table>
    <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
      ${esc(footnote)}
      ${hiddenCols > 0 ? ` Se ocultan ${hiddenCols} concepto${hiddenCols === 1 ? '' : 's'} sin valores.` : ''}
    </p>
  `;

  // Sólo el primer <tbody> (filas de datos) — el segundo es la fila de TOTAL,
  // que queda fuera de paginación y búsqueda (mismo patrón que rendXEe.js).
  const tbodyEl = tableHost.querySelector('tbody');
  const pagination = initShowMorePagination(tbodyEl, { pageSize: 50 });
  initSearchCombobox(searchEl, {
    rows, trEls: pagination.dataRows,
    getLabel: r => `${r.legajo} — ${r.nombre}`,
    pagination,
  });
}

// ── Export a Excel ─────────────────────────────────────────────────────────────

/** 'YYYY-MM' → 'MM-YYYY' (nombre de hoja/archivo, ej. '07-2026'). */
function toMesAnio(period) {
  const [y, m] = period.split('-');
  return `${m}-${y}`;
}

export async function exportAcumuladoresToXlsx(results) {
  await loadExcelJS();
  const { mes, datos, mesProceso } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const GRAY_HDR = 'FFE8E8E8';
  const NUM_FMT  = '#,##0.00';

  const addSheet = (name, concepts, rows) => {
    const ws = wb.addWorksheet(sanitizeSheetName(name));
    ws.columns = [{ width: 10 }, { width: 30 }, ...concepts.map(() => ({ width: 18 }))];

    const hdrRow = ws.addRow(['Legajo', 'Apellido y Nombre', ...concepts.map(c => c.label)]);
    hdrRow.height = 20;
    for (let c = 1; c <= 2 + concepts.length; c++) {
      const cell = hdrRow.getCell(c);
      cell.font      = { ...bold };
      cell.fill      = solidFill(GRAY_HDR);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
    }

    for (const r of rows) {
      const dr = ws.addRow([toNumOrText(r.legajo), r.nombre, ...concepts.map(c => r[c.key] ?? 0)]);
      dr.getCell(1).font = { ...base };
      dr.getCell(2).font = { ...base };
      concepts.forEach((c, i) => {
        const cell = dr.getCell(3 + i);
        cell.font      = { ...base };
        cell.numFmt    = NUM_FMT;
        cell.alignment = { horizontal: 'right' };
      });
    }

    if (rows.length > 0) {
      const totalRow = ws.addRow([null, 'TOTAL', ...concepts.map(c => round2(rows.reduce((acc, r) => acc + (r[c.key] ?? 0), 0)))]);
      totalRow.getCell(2).font = { ...bold };
      concepts.forEach((c, i) => {
        const cell = totalRow.getCell(3 + i);
        cell.font   = { ...bold };
        cell.numFmt = NUM_FMT;
        cell.alignment = { horizontal: 'right' };
      });
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 2 + concepts.length } };
    }
    return ws;
  };

  addSheet(toMesAnio(mesProceso), MES_CONCEPTS, mes.rows);
  addSheet('DATOS', DATOS_CONCEPTS, datos.rows);

  await downloadWorkbook(wb, `Acumuladores_Ganancias_${toMesAnio(mesProceso)}.xlsx`);
}

// El legajo es numérico en Axton, pero si viene alfanumérico se escribe como texto.
function toNumOrText(v) {
  const n = Number(v);
  return (v !== '' && !isNaN(n)) ? n : String(v ?? '');
}

// Excel no acepta : \ / ? * [ ] en el nombre de una hoja, ni más de 31 caracteres.
function sanitizeSheetName(name) {
  return String(name).replace(/[:\\/?*[\]']/g, '-').slice(0, 31).trim();
}

// ── Editor de configuración (Paso 2 del wizard) ───────────────────────────────

export function renderAcumuladoresConfigEditor(container, opts = {}) {
  const { config = DEFAULT_ACUMULADORES_CONFIG, openByDefault = true, onChange = () => {} } = opts;
  const current = {
    ...DEFAULT_ACUMULADORES_CONFIG,
    ...config,
    codigos: { ...ACUMULADORES, ...(config.codigos || {}) },
  };

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Régimen y códigos de acumulador
    </summary>
    <div style="margin-top:var(--sp-3);display:flex;gap:var(--sp-5);flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;">
        <input type="radio" name="acum-regimen" value="RG4030" ${current.regimen === 'RG4030' ? 'checked' : ''}>
        <span style="font-size:var(--text-sm);">RG 4030 (semestral)</span>
      </label>
      <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;">
        <input type="radio" name="acum-regimen" value="RG4003" ${current.regimen === 'RG4003' ? 'checked' : ''}>
        <span style="font-size:var(--text-sm);">RG 4003 (año calendario)</span>
      </label>
    </div>
    <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-2) 0 0;">
      Define qué ventana de meses valida la app contra los archivos subidos (no recorta nada: sólo avisa si falta o sobra un mes).
    </p>
    <details style="margin-top:var(--sp-3);">
      <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--color-text-muted);">▸ Códigos de acumulador (avanzado)</summary>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--sp-2);margin-top:var(--sp-2);">
        ${ACCUM_FIELDS.map(f => `
          <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
            ${esc(f.label)}
            <input type="number" class="form-input" data-acum-code="${f.key}" value="${current.codigos[f.key]}" style="padding:4px 8px;">
          </label>
        `).join('')}
      </div>
    </details>
  `;

  editor.querySelectorAll('input[name="acum-regimen"]').forEach(r => {
    r.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      current.regimen = e.target.value;
      onChange({ ...current, codigos: { ...current.codigos } });
    });
  });

  editor.querySelectorAll('[data-acum-code]').forEach(input => {
    input.addEventListener('change', (e) => {
      const key = e.target.dataset.acumCode;
      const n = Number(e.target.value);
      if (!isNaN(n)) current.codigos = { ...current.codigos, [key]: n };
      onChange({ ...current, codigos: { ...current.codigos } });
    });
  });

  container.appendChild(editor);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
