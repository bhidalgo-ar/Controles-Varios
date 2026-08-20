// catXEmpleados.js — Lógica y render del Control "EE x CATEG" (Empleados por Categoría)
//
// El reporte de Categorías trae TODA la nómina (activos + bajas). El control
// separa unos de otros con la columna F. BAJA y NO marca como faltantes a los
// empleados que figuran en el Tabulado pero ya son bajas en el reporte.
//
// Valida:
//   1. Diferencias de cantidad: activos en Rep. Categ. vs Tabulado
//   2. Activos en Rep. Categ. que no están en Tabulado (con F. Alta)
//   3. Empleados en Tabulado que no están en Rep. Categ. (ni activos ni bajas)
//   4. Discrepancias de campo (PUESTO, CC, DEPTO) en empleados coincidentes
//   5. Distribución por PUESTO — con detalle de empleados cuando hay diferencia
//   6. Distribución por CC — ídem

import { renderExportMenu } from '../ui/exportMenu.js';
import { renderPlanillaPanel } from '../ui/planillaPanel.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { periodSuffix } from '../utils/dates.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { renderVerdict, renderTiles, renderResumenDetalle } from '../ui/resultBlocks.js';

/**
 * Resumen del control para la tarjeta colapsada en la pantalla de resultados.
 * Devuelve { status, headline, insights[] }.
 */
export function summarizeCatXEmpleados(results) {
  const s = results.summary;
  const hasDiff = s.missingInTabCount > 0
    || s.missingInCatCount > 0
    || s.fieldDiscrepancyCount > 0;
  const sign = s.diff > 0 ? '+' : '';

  // Este control no cruza montos en $ — es de conteo/coincidencia de empleados
  // y campos (puesto/CC/depto). "Unidad" = legajo; unitsTotal toma el universo
  // del Tabulado (referencia común a todos los controles de esta app).
  const unitsWithDiff = s.missingInTabCount + s.missingInCatCount + s.fieldDiscrepancyCount;
  const contextNote = unitsWithDiff > 0
    ? `${s.missingInTabCount} sin Tabulado · ${s.missingInCatCount} sin Rep. Categ. · ${s.fieldDiscrepancyCount} discrepancias de campo`
    : 'Empleados y campos (puesto/CC/depto) verificados';

  return {
    status: hasDiff ? 'warning' : 'success',
    headline: `EE x CATEG activos: ${s.catActivos} · Tabulado: ${s.tabTotal} · Diferencia neta: ${sign}${s.diff}`,
    insights: [
      {
        type:  s.missingInTabCount > 0 ? 'warning' : 'success',
        label: 'En Rep. Categ., faltan en Tabulado',
        value: s.missingInTabCount,
      },
      {
        type:  s.missingInCatCount > 0 ? 'warning' : 'success',
        label: 'En Tabulado, faltan en Rep. Categ.',
        value: s.missingInCatCount,
      },
      {
        type:  s.fieldDiscrepancyCount > 0 ? 'warning' : 'success',
        label: 'Discrepancias de campo',
        value: s.fieldDiscrepancyCount,
      },
    ],
    unit:            'legajo',
    unitsTotal:      s.tabTotal,
    unitsWithDiff,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote,
  };
}

export function runCatXEmpleados(catAllRows, tabRows, mapping) {
  const cm = mapping.cat;
  const tm = mapping.tab;

  // Clave de comparación de legajo para este cliente (D-038). Antes era un
  // `normId` local con `parseInt`, que además de ignorar los ceros a la
  // izquierda colapsaba `'12-B'` y `'12-C'` en el mismo `12` — un match falso,
  // no un match más flexible.
  const normId = makeLegajoKey(mapping.legajoKeyMode);

  // Partir el reporte en activos y bajas usando F. BAJA.
  const fBajaCol = cm.fBajaColumn;
  const esBaja = (row) => {
    if (!fBajaCol) return false;
    const v = row[fBajaCol];
    return !(v === null || v === undefined || String(v).trim() === '');
  };
  const catActivos = catAllRows.filter(r => !esBaja(r));
  const catBajaIds = new Set(
    catAllRows.filter(esBaja).map(r => normId(r[cm.idEmpColumn]))
  );

  const catByEmp = new Map(catActivos.map(r => [normId(r[cm.idEmpColumn]), r]));
  const tabByEmp = new Map(tabRows.map(r => [normId(r[tm.empleadoColumn]), r]));

  // ── 1. Empleados faltantes ─────────────────────────────────────────────────

  const missingInTab = [];
  for (const [, r] of catByEmp) {
    if (!tabByEmp.has(normId(r[cm.idEmpColumn]))) {
      missingInTab.push({
        id:      norm(r[cm.idEmpColumn]),   // display: valor original (con ceros)
        apellido: norm(r[cm.apellidoColumn]),
        nombre:   norm(r[cm.nombreColumn]),
        fAlta:    cm.fAltaColumn ? fmtDate(r[cm.fAltaColumn]) : '',
      });
    }
  }

  const missingInCat = [];
  for (const [, r] of tabByEmp) {
    // Si el empleado existe en Rep. Categ. como baja, no es un error: el
    // Tabulado todavía lo lista pero el reporte ya lo dio de baja.
    const tid = normId(r[tm.empleadoColumn]);
    if (!catByEmp.has(tid) && !catBajaIds.has(tid)) {
      missingInCat.push({
        id:              norm(r[tm.empleadoColumn]),  // display: valor original
        apellidoNombre:  norm(r[tm.apellidoNombreColumn]),
      });
    }
  }

  // ── 2. Discrepancias de campo en empleados coincidentes ────────────────────

  const fieldDiscrepancies = [];
  for (const [nid, catRow] of catByEmp) {
    const tabRow = tabByEmp.get(nid);
    if (!tabRow) continue;

    const diffs = [];
    if (cm.puestoColumn && tm.puestoColumn) {
      const cv = norm(catRow[cm.puestoColumn]), tv = norm(tabRow[tm.puestoColumn]);
      if (cv !== tv) diffs.push({ field: 'PUESTO', cat: cv, tab: tv });
    }
    if (cm.centroCostoColumn && tm.ccColumn) {
      const cv = norm(catRow[cm.centroCostoColumn]), tv = norm(tabRow[tm.ccColumn]);
      if (cv !== tv) diffs.push({ field: 'CENTRO_COSTO', cat: cv, tab: tv });
    }
    if (cm.departamentoColumn && tm.deptoColumn) {
      const cv = norm(catRow[cm.departamentoColumn]), tv = norm(tabRow[tm.deptoColumn]);
      if (cv !== tv) diffs.push({ field: 'DEPTO', cat: cv, tab: tv });
    }
    if (diffs.length) {
      fieldDiscrepancies.push({
        id:      norm(catRow[cm.idEmpColumn]),  // display: valor original
        apellido: norm(catRow[cm.apellidoColumn]),
        nombre:   norm(catRow[cm.nombreColumn]),
        diffs,
      });
    }
  }

  // ── 3. Distribuciones con detalle de empleados por grupo ───────────────────
  // Las distribuciones agrupan SOLO empleados activos en Rep. Categ. y
  // empleados del Tabulado que no son bajas en el reporte. Las bajas se
  // excluyen para no inflar el lado Tabulado con gente que ya no está activa.

  const tabRowsForDist = tabRows.filter(r => !catBajaIds.has(normId(r[tm.empleadoColumn])));

  const dedupeCAT = cm.cuilColumn || cm.idEmpColumn;
  const dedupeTAB = tm.cuilColumn || tm.empleadoColumn;

  const catDispFn = r => ({
    id:     norm(r[cm.idEmpColumn]),
    nombre: [norm(r[cm.apellidoColumn]), norm(r[cm.nombreColumn])].filter(Boolean).join(' '),
  });
  const tabDispFn = r => ({
    id:     norm(r[tm.empleadoColumn]),
    nombre: norm(r[tm.apellidoNombreColumn]) || norm(r[tm.empleadoColumn]),
  });

  const byPuesto = mergeAggregations(
    groupByKey(catActivos,     cm.puestoColumn, dedupeCAT, catDispFn, normId),
    groupByKey(tabRowsForDist, tm.puestoColumn, dedupeTAB, tabDispFn, normId)
  );

  const byCC = mergeAggregations(
    groupByKey(catActivos,     cm.centroCostoColumn, dedupeCAT, catDispFn, normId),
    groupByKey(tabRowsForDist, tm.ccColumn,           dedupeTAB, tabDispFn, normId)
  );

  return {
    summary: {
      catActivos:            catActivos.length,
      catBajas:              catBajaIds.size,
      // tabByEmp.size, no tabRows.length: el Tabulado trae una fila por
      // liquidación, no por empleado (un legajo con doble liquidación en el
      // mes contaba dos veces) — el resto del archivo ya dedupea por empleado
      // (tabByEmp arriba), acá se había quedado con el conteo crudo.
      tabTotal:              tabByEmp.size,
      diff:                  catActivos.length - tabByEmp.size,
      missingInTabCount:     missingInTab.length,
      missingInCatCount:     missingInCat.length,
      fieldDiscrepancyCount: fieldDiscrepancies.length,
    },
    missingInTab,
    missingInCat,
    fieldDiscrepancies,
    byPuesto,
    byCC,
    period: mapping.period || '',
  };
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderCatXEmpleadosResults(results, container) {
  const { summary } = results;
  const totalDiffs = summary.missingInTabCount + summary.missingInCatCount + summary.fieldDiscrepancyCount;

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'cat_x_empleados',
    resumen(panel) {
      const tone = totalDiffs === 0 ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: totalDiffs === 0
          ? 'El Rep. Categ. y el Tabulado coinciden en empleados y campos.'
          : `${totalDiffs} diferencia${totalDiffs === 1 ? '' : 's'} entre Rep. Categ. y Tabulado.`,
        body: `${summary.catActivos} activos en Rep. Categ. · ${summary.tabTotal} en Tabulado`
          + (summary.catBajas > 0 ? ` · ${summary.catBajas} bajas excluidas` : '') + '.',
      });
      const diffSign = summary.diff > 0 ? '+' : '';
      renderTiles(panel, [
        { label: 'Activos en Rep. Categ.', value: summary.catActivos },
        { label: 'En Tabulado', value: summary.tabTotal, sub: summary.diff !== 0 ? `${diffSign}${summary.diff} vs Rep. Categ.` : 'diferencia neta 0' },
        { label: 'Sin Tabulado', value: summary.missingInTabCount, tone: summary.missingInTabCount > 0 ? 'error' : 'ok' },
        { label: 'Sin Rep. Categ.', value: summary.missingInCatCount, tone: summary.missingInCatCount > 0 ? 'error' : 'ok' },
        { label: 'Discrepancias de campo', value: summary.fieldDiscrepancyCount, tone: summary.fieldDiscrepancyCount > 0 ? 'error' : 'ok' },
      ]);
    },
    planilla(panel) { renderCatXEmpleadosPlanilla(panel, results); },
  });
}

// ── La planilla (§5 de specs/vista-estandar-resultados.md) ───────────────────
//
// **Sin bandas y sin TOTAL**, y no por olvido: este control no compara importes
// sino campos de texto (puesto, centro de costo, departamento) y la presencia de
// cada empleado en cada archivo. No hay nada que agrupar en rubros ni nada que
// totalizar — una fila de TOTAL acá sería un número inventado.
//
// Las tres listas que antes eran tres tablas separadas —cada una con su propio
// buscador— ahora son una sola planilla con una fila por caso y una columna que
// dice qué le pasa. Es lo que permite que haya UNA barra: un buscador que
// encuentra un legajo esté en la lista que esté, un solo ⬇ Exportar ▾, y los
// cinco chips diciendo cuántos casos son de cada tipo.
//
// Qué significa cada chip en un control que no compara importes:
//   Con diferencia → el empleado está en los dos archivos y un campo no coincide
//   Sin comparar   → el empleado está en uno solo de los dos: no hay con qué
//                    comparar sus campos (§3 — "falta un lado")
//   Al centavo / Dentro del margen → no aplican: acá un campo coincide o no
//                    coincide, no hay un monto que tolerar

const NO_APLICA_CAT = {
  margen:  'compara campos de texto (puesto, centro de costo, departamento) y no importes, '
    + 'así que no hay un monto de diferencia que tolerar',
  centavo: 'compara campos de texto y no importes: un campo coincide o no coincide. '
    + 'Los empleados que coinciden en todo no se listan',
};

const CASO = {
  sinTab: 'No está en el Tabulado',
  sinCat: 'No está en Rep. Categ. activos',
  campo:  'Un campo no coincide',
};

/** Una fila por caso: las tres listas de diferencias, en una sola planilla. */
function casosDeCruce({ missingInTab, missingInCat, fieldDiscrepancies }) {
  return [
    ...missingInTab.map(r => ({
      caso: CASO.sinTab,
      id: r.id,
      empleado: [r.apellido, r.nombre].filter(Boolean).join(' '),
      campo: null, valorCat: null, valorTab: null,
      fAlta: r.fAlta || null,
      estado: 'sinComparar',
    })),
    ...missingInCat.map(r => ({
      caso: CASO.sinCat,
      id: r.id,
      empleado: r.apellidoNombre,
      campo: null, valorCat: null, valorTab: null, fAlta: null,
      estado: 'sinComparar',
    })),
    // Una fila por (empleado, campo con diferencia): es la unidad que el
    // analista revisa, y es también la que se aplanaba antes en su tabla.
    ...fieldDiscrepancies.flatMap(e => e.diffs.map(d => ({
      caso: CASO.campo,
      id: e.id,
      empleado: [e.apellido, e.nombre].filter(Boolean).join(' '),
      campo: d.field, valorCat: d.cat, valorTab: d.tab, fAlta: null,
      estado: 'conDif',
    }))),
  ];
}

function renderCatXEmpleadosPlanilla(container, results) {
  const { byPuesto, byCC } = results;
  const casos = casosDeCruce(results);
  const conFAlta = casos.some(c => c.fAlta);

  const columns = [
    // Sin sublabel: la columna del legajo va congelada y mide 74 px, así que
    // cualquier base de cálculo se corta con puntos suspensivos.
    { key: 'id',       label: 'Legajo' },
    { key: 'empleado', label: 'Empleado', sub: 'del Rep. Categ. o del Tabulado' },
    { key: 'caso',     label: 'Qué pasa', sub: 'el cruce por legajo' },
    ...(conFAlta ? [{ key: 'fAlta', label: 'F. Alta', sub: 'del Rep. Categ.' }] : []),
    { key: 'campo',    label: 'Campo',    sub: 'el que no coincide' },
    { key: 'valorCat', label: 'Valor en Rep. Categ.', sub: 'tal cual figura en el archivo' },
    { key: 'valorTab', label: 'Valor en Tabulado',    sub: 'tal cual figura en el archivo' },
  ];

  // El segundo eje: de qué tipo es el caso y —cuando es un campo— cuál.
  const campos = [...new Set(casos.map(c => c.campo).filter(Boolean))];
  const marcas = [
    { value: 'sinTab', label: CASO.sinTab, match: c => c.caso === CASO.sinTab },
    { value: 'sinCat', label: CASO.sinCat, match: c => c.caso === CASO.sinCat },
    ...campos.map(f => ({ value: `campo:${f}`, label: f, match: c => c.campo === f })),
  ];

  // El .xlsx trae las dos distribuciones (Puesto/CC) en hojas separadas; el CSV
  // y el copiar las aplanan en una sola tabla. No incluyen las listas de
  // diferencias de arriba, que son de revisión en pantalla y no del entregable.
  const csvHeaders = ['Agrupador', 'Valor', 'Rep. Categ.', 'Tabulado', 'Dif.'];
  const csvRows = () => [
    ...byPuesto.map(r => ['Puesto', r.key, r.catCount, r.tabCount, r.diff]),
    ...byCC.map(r => ['Centro de Costo', r.key, r.catCount, r.tabCount, r.diff]),
  ];
  const montarExport = (exportEl) => renderExportMenu(exportEl, {
    onExcel: () => exportCatXEmpleadosToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `EE_x_CATEG_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });

  // Sin ni un caso no hay planilla —ni chips, ni buscador, que no filtrarían
  // nada— pero sí hay distribuciones y hay que poder exportar igual.
  if (casos.length === 0) {
    const barra = document.createElement('div');
    barra.className = 'results-toolbar';
    barra.style.justifyContent = 'flex-end';
    container.appendChild(barra);
    montarExport(barra);

    const ok = document.createElement('p');
    ok.className = 'text-muted';
    ok.style.cssText = 'padding:var(--sp-4);';
    ok.textContent = 'El Rep. Categ. y el Tabulado coinciden en empleados y campos: '
      + 'no hay ningún caso para revisar.';
    container.appendChild(ok);
    renderDistribuciones(container, { byPuesto, byCC });
    return;
  }

  renderPlanillaPanel(container, {
    columns,
    rows: casos,
    unitLabel: 'casos',
    bands: false,
    totals: false,
    estadoDe: c => c.estado,
    noAplica: NO_APLICA_CAT,
    marcas,
    getLabel: c => `${c.id} — ${c.empleado}${c.campo ? ` — ${c.campo}` : ''}`,
    searchLabel: 'Buscar empleado',
    searchPlaceholder: 'Legajo o nombre…',
    stickyCols: 2,
    afterTable: (host) => renderDistribuciones(host, { byPuesto, byCC }),
    onExport: montarExport,
  });
}

// ── Las dos distribuciones (por puesto y por centro de costo) ────────────────
// No son parte de la planilla: son dos agregados de pocas filas que se leen
// aparte, y por eso conservan su propio "sólo con diferencia / todos".

function renderDistribuciones(host, { byPuesto, byCC }) {
  const sec = document.createElement('div');
  sec.innerHTML = distSection(byPuesto, 'Puesto', 'Distribución por Puesto', 'puesto')
    + distSection(byCC, 'Centro de Costo', 'Distribución por Centro de Costo', 'cc');
  host.appendChild(sec);
  wireDistToggle(sec, 'puesto', byPuesto, 'Puesto');
  wireDistToggle(sec, 'cc', byCC, 'Centro de Costo');
}

const SUM_STYLE = [
  'cursor:pointer', 'list-style:none', 'display:flex', 'align-items:center',
  'gap:var(--sp-2)', 'padding:var(--sp-2) 0', 'font-weight:600',
  'color:var(--color-primary)', 'font-size:var(--text-base)',
  'border-bottom:1px solid var(--color-border)', 'margin-bottom:var(--sp-3)',
].join(';');

function distRow(r) {
  if (r.diff === 0) {
    return `
      <tr>
        <td>${esc(r.key)}</td>
        <td style="text-align:right;">${r.catCount}</td>
        <td style="text-align:right;">${r.tabCount}</td>
        <td style="text-align:right;">—</td>
      </tr>
    `;
  }

  const soloEn = (titulo, lista) => lista.length === 0 ? '' : `
    <div style="margin-top:var(--sp-2);">
      <strong style="font-size:var(--text-sm);">${esc(titulo)} (${lista.length}):</strong>
      <table class="data-table data-table--compact" style="margin-top:var(--sp-1);">
        <thead><tr><th>Legajo</th><th>Empleado</th></tr></thead>
        <tbody>
          ${lista.map(e => `<tr><td>${esc(e.id)}</td><td>${esc(e.nombre)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  return `
    <tr style="background:var(--color-warning-bg);">
      <td>
        <details>
          <summary style="cursor:pointer;">${esc(r.key)}</summary>
          <div style="padding:var(--sp-2) var(--sp-3) var(--sp-3);">
            ${soloEn('Solo en Rep. Categ.', r.onlyInCat)}
            ${soloEn('Solo en Tabulado', r.onlyInTab)}
          </div>
        </details>
      </td>
      <td style="text-align:right;">${r.catCount}</td>
      <td style="text-align:right;">${r.tabCount}</td>
      <td style="text-align:right;font-weight:600;color:var(--color-danger);">${r.diff > 0 ? '+' : ''}${r.diff}</td>
    </tr>
  `;
}

function distTable(rows, labelCol) {
  return `
    <div style="overflow-x:auto;">
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>${esc(labelCol)}</th>
            <th style="text-align:right;">Rep. Categ.</th>
            <th style="text-align:right;">Tabulado</th>
            <th style="text-align:right;">Dif.</th>
          </tr>
        </thead>
        <tbody>${rows.map(distRow).join('')}</tbody>
      </table>
    </div>
  `;
}

/**
 * Por default sólo se muestran las filas con diferencia — el resto coincide 1:1
 * y listarlas no aporta nada. Un desplegable deja ver el universo completo.
 * **No lleva `data-chips`**: la fila de chips es la de los cinco estados y nada
 * más, en las 21 pantallas (§3).
 */
function distSection(allRows, labelCol, title, key) {
  if (allRows.length === 0) return '';
  const conDif = allRows.filter(r => r.diff !== 0);
  const okCount = allRows.length - conDif.length;
  const iniciales = conDif.length > 0 ? conDif : allRows;
  const toggle = conDif.length > 0 && okCount > 0 ? `
    <div style="margin-bottom:var(--sp-2);">
      <select class="form-select form-select--sm" data-dist-toggle="${key}" aria-label="${esc(title)}">
        <option value="dif">Sólo con diferencia (${conDif.length})</option>
        <option value="all">Todos (${allRows.length})</option>
      </select>
    </div>` : '';
  return `
    <div style="margin-bottom:var(--sp-6);">
      <details open>
        <summary style="${SUM_STYLE}">${esc(`${title} (${allRows.length}${okCount > 0 ? ` · ${okCount} sin diferencia` : ''})`)}</summary>
        ${toggle}<div data-dist-body="${key}">${distTable(iniciales, labelCol)}</div>
      </details>
    </div>
  `;
}

function wireDistToggle(root, key, allRows, labelCol) {
  const sel = root.querySelector(`[data-dist-toggle="${key}"]`);
  const body = root.querySelector(`[data-dist-body="${key}"]`);
  if (!sel || !body) return;
  const conDif = allRows.filter(r => r.diff !== 0);
  sel.addEventListener('change', () => {
    body.innerHTML = distTable(sel.value === 'dif' ? conDif : allRows, labelCol);
  });
}

// ── Export a Excel ────────────────────────────────────────────────────────────

// Migrado a `writeContractSheet` (specs/contrato-export.md, "Lo que falta para
// migrar los writers del Paso 6" — D-047). `contracts.js` no importa nada de
// este archivo (no hay ciclo posible), pero se usa `import()` dinámico igual
// que el resto de los exports del Paso 6, por prolijidad.
async function exportCatXEmpleadosToXlsx(results) {
  await loadExcelJS();
  const { byPuesto, byCC } = results;
  const { EXPORT_CONTRACTS } = await import('../exports/contracts.js');
  const { writeContractSheet, numericValue } = await import('../exports/contractSheet.js');

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  // ── Hojas: Distribuciones (Puesto y CC) ────────────────────────────────────
  addDistributionSheet(wb, EXPORT_CONTRACTS.cat_x_empleados_puesto, 'Puesto',          byPuesto, writeContractSheet, numericValue);
  addDistributionSheet(wb, EXPORT_CONTRACTS.cat_x_empleados_cc,     'Centro de Costo', byCC,     writeContractSheet, numericValue);

  await downloadWorkbook(wb, `EE_x_CATEG_${periodSuffix(results.period)}.xlsx`);
}

/**
 * "Dif." y la fila de TOTAL siguen siendo fórmulas de Excel (`=B2-C2`,
 * `SUM(...)`) — más auditables para el cliente que un valor cacheado a mano
 * (D-047). El número de fila se deriva de la posición (1 encabezado + `i`),
 * no de `ws.addRow` a mano, porque `writeContractSheet` es quien escribe las
 * filas ahora.
 */
function addDistributionSheet(wb, contract, labelCol, rows, writeContractSheet, numericValue) {
  const HDR_BG = 'FFE8E8E8';
  const dataRows = rows.map((r, i) => {
    const rn = 2 + i; // fila 1 = encabezado
    return { key: r.key, catCount: r.catCount, tabCount: r.tabCount,
      diff: { formula: `B${rn}-C${rn}`, result: r.diff } };
  });

  let totalRow = null;
  if (rows.length > 0) {
    const first = 2;
    const last  = 1 + rows.length;
    const tn    = 2 + rows.length;
    totalRow = {
      key: 'TOTAL',
      catCount: { formula: `SUM(B${first}:B${last})`, result: rows.reduce((s, r) => s + r.catCount, 0) },
      tabCount: { formula: `SUM(C${first}:C${last})`, result: rows.reduce((s, r) => s + r.tabCount, 0) },
      diff:     { formula: `B${tn}-C${tn}`,           result: rows.reduce((s, r) => s + r.diff, 0) },
    };
  }

  const ws = writeContractSheet(wb, contract, dataRows, {
    totalRow,
    highlightIf: r => numericValue(r.diff) !== 0,
    highlightColor: 'FFFFF4E5',
  });

  // Detalle de diferencias debajo — no es una tabla de contrato (filas
  // variables, sin `key` fijo), sigue armándose a mano sobre la misma hoja.
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const styleHeader = (row) => {
    row.height = 20;
    row.eachCell(cell => {
      cell.font      = bold;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill      = solidFill(HDR_BG);
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
    });
  };

  const hasDetail = rows.some(r => r.onlyInCat.length > 0 || r.onlyInTab.length > 0);
  if (!hasDetail) return;

  ws.addRow([]);
  const titleRow = ws.addRow(['Detalle de diferencias']);
  titleRow.getCell(1).font = bold;

  const detailHdr = ws.addRow([labelCol, 'Origen', 'ID', 'Empleado']);
  styleHeader(detailHdr);

  for (const r of rows) {
    if (r.diff === 0) continue;
    for (const e of r.onlyInCat) {
      const dr = ws.addRow([r.key, 'Solo en Rep. Categ.', e.id, e.nombre]);
      dr.eachCell(cell => { cell.font = base; });
    }
    for (const e of r.onlyInTab) {
      const dr = ws.addRow([r.key, 'Solo en Tabulado', e.id, e.nombre]);
      dr.eachCell(cell => { cell.font = base; });
    }
  }
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Agrupa filas por groupCol, indexando por idCol → displayFn(row).
 *  `keyOf` es la clave de legajo del cliente (D-038) y se usa para deduplicar. */
function groupByKey(rows, groupCol, idCol, displayFn, keyOf) {
  const map = new Map();
  if (!groupCol || !idCol) return map;
  for (const r of rows) {
    const key = norm(r[groupCol]) || '(sin valor)';
    if (!map.has(key)) map.set(key, new Map());
    const id = keyOf(r[idCol]);
    if (id) map.get(key).set(id, displayFn(r));
  }
  return map;
}

/** Fusiona dos Maps en array { key, catCount, tabCount, diff, onlyInCat, onlyInTab } */
function mergeAggregations(catGroupMap, tabGroupMap) {
  const keys = new Set([...catGroupMap.keys(), ...tabGroupMap.keys()]);
  return [...keys].sort().map(key => {
    const catMap = catGroupMap.get(key) ?? new Map();
    const tabMap = tabGroupMap.get(key) ?? new Map();
    const diff   = catMap.size - tabMap.size;
    const onlyInCat = diff !== 0
      ? [...catMap.entries()].filter(([id]) => !tabMap.has(id)).map(([, d]) => d)
      : [];
    const onlyInTab = diff !== 0
      ? [...tabMap.entries()].filter(([id]) => !catMap.has(id)).map(([, d]) => d)
      : [];
    return { key, catCount: catMap.size, tabCount: tabMap.size, diff, onlyInCat, onlyInTab };
  });
}

/** Formatea fechas: acepta serial de Excel (número) o string */
function fmtDate(val) {
  if (val == null || String(val).trim() === '') return '';
  if (typeof val === 'number' && val > 1000) {
    const d = new Date(Math.round((val - 25569) * 86400000));
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return String(val).trim();
}

function norm(v) { return v != null ? String(v).trim() : ''; }

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
