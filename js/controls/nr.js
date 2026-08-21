// nr.js — Control No Remunerativos (Control NR)
import { diffStats } from './semaforo.js';
import { isDiff } from './tolerance.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { createResultsToolbar, wireTableTools, estadoDeDiferencia } from '../ui/tableTools.js';
import { renderFichasPanel } from '../ui/fichaList.js';
import { codeOfColumn } from './tabCodes.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum, toNum } from '../utils/currency.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { groupRowsByLegajo, sumColumn, lastRow } from './consolidate.js';
import { writeGroupedContractSheet } from '../exports/contractSheet.js';
import { periodSuffix } from '../utils/dates.js';
import {
  renderVerdict, renderTiles, renderIssues, renderResumenDetalle, diffCellHtml,
  mvClass, mvArrow, fmtSigned,
} from '../ui/resultBlocks.js';
//
// Modo 1 — "Controlar": cruza los 18 conceptos NR del Reporte de M4
//   contra las columnas configuradas en el Tabulado.
//
// Modo 2 — "Generar Reporte": genera el Reporte de NR directamente desde
//   el Tabulado. Layout: A(vacía) | B=ID_EMPLEADO | C=NOMBRE | D=APELLIDO_1
//   | E=FECHA_ALTA | F=FECHA_BAJA | G=FEC_PAGO | H=ID_CENTRO_TRAB
//   | I=ID_CATEGORIA | J-AA = 18 conceptos en orden.

// ── Definición de conceptos NR ────────────────────────────────────────────────
// Orden = orden de columnas en el XLSX de salida.
// tabKey = clave en tabExtraConfig | nrKey = clave en mapping del archivo NR
// group: 'indem' = Indemnizatorios (verde) | 'otros' = Otros NR (naranja)

// Exportado para que js/exports/contracts.js derive la lista de columnas del
// Reporte NR de ACÁ, en vez de mantener una segunda copia de los 18 conceptos.
export const NR_CONCEPTS = [
  { key: 'reinHomeOfice',  label: 'REIN_HOME_OFICE',  tabKey: 'tabReinHomeOficeColumn',  nrKey: 'reinHomeOficeColumn',  group: 'otros' },
  { key: 'indemPreaviso',  label: 'INDEM_PREAVISO',   tabKey: 'tabIndemPreavisoColumn',  nrKey: 'indemPreavisoColumn',  group: 'indem' },
  { key: 'sacPreaviso',    label: 'SAC_PREAVISO',     tabKey: 'tabSacPreavisoColumn',    nrKey: 'sacPreavisoColumn',    group: 'indem' },
  { key: 'indemAntDesp',   label: 'INDEM_ANT_DESP',   tabKey: 'tabIndemAntDespColumn',   nrKey: 'indemAntDespColumn',   group: 'indem' },
  { key: 'indemAntFalle',  label: 'INDEM_ANT_FALLE',  tabKey: 'tabIndemAntFalleColumn',  nrKey: 'indemAntFalleColumn',  group: 'indem' },
  { key: 'indemInteg',     label: 'INDEM_INTEG',      tabKey: 'tabIndemIntegColumn',     nrKey: 'indemIntegColumn',     group: 'indem' },
  { key: 'sacIndemInteg',  label: 'SAC_INDEM_INTEG',  tabKey: 'tabSacIndemIntegColumn',  nrKey: 'sacIndemIntegColumn',  group: 'indem' },
  { key: 'indmMaternidad', label: 'INDM_MATERNIDAD',  tabKey: 'tabIndmMaternidadColumn', nrKey: 'indmMaternidadColumn', group: 'indem' },
  { key: 'vacNoGozadas',   label: 'VAC_NO_GOZADAS',   tabKey: 'tabVacNoGozadasColumn',   nrKey: 'vacNoGozadasColumn',   group: 'indem' },
  { key: 'vacNoGozSac',    label: 'VAC_NO_GOZ_SAC',   tabKey: 'tabVacNoGozSacColumn',    nrKey: 'vacNoGozSacColumn',    group: 'indem' },
  { key: 'gratVac',        label: 'GRAT_VAC',         tabKey: 'tabGratVacColumn',        nrKey: 'gratVacColumn',        group: 'indem' },
  { key: 'graVacnogSac',   label: 'GRA_VACNOG_SAC',   tabKey: 'tabGraVacnogSacColumn',   nrKey: 'graVacnogSacColumn',   group: 'indem' },
  { key: 'indemFuerMay',   label: 'INDEM_FUER_MAY',   tabKey: 'tabIndemFuerMayColumn',   nrKey: 'indemFuerMayColumn',   group: 'indem' },
  { key: 'indemEmbarazo',  label: 'INDEM_EMBARAZO',   tabKey: 'tabIndemEmbarazoColumn',  nrKey: 'indemEmbarazoColumn',  group: 'indem' },
  { key: 'gratExtraord',   label: 'GRAT_EXTRAORD',    tabKey: 'tabGratExtraordColumn',   nrKey: 'gratExtraordColumn',   group: 'otros' },
  { key: 'asigPas',        label: 'ASIG_PAS',         tabKey: 'tabAsigPasColumn',        nrKey: 'asigPasColumn',        group: 'otros' },
  { key: 'reintGuard',     label: 'REINT_GUARD',      tabKey: 'tabReintGuardColumn',     nrKey: 'reintGuardColumn',     group: 'otros' },
  { key: 'incrementoSt',   label: 'INCREMENTO_ST',    tabKey: 'tabIncrementoStColumn',   nrKey: 'incrementoStColumn',   group: 'otros' },
];

// NOTA: contracts.js importa `NR_CONCEPTS` de ESTE archivo — un `import`
// estático de `contracts.js` acá arriba arma un ciclo de módulos donde,
// según qué archivo cargue primero, `contracts.js` puede intentar leer
// `NR_CONCEPTS` antes de que este módulo termine de definirlo (confirmado:
// rompía en el navegador aunque los tests de Node, con otro orden de carga,
// no lo agarraban). Las dos funciones de export de acá abajo importan
// `contracts.js` con `import()` dinámico en vez de un `import` estático — para
// cuando esa promesa resuelve (el analista ya clickeó "Exportar"), toda la
// app terminó de cargar y el ciclo ya no es un problema.

// ── Modo 1: Controlar ─────────────────────────────────────────────────────────

export function summarizeNr(results) {
  const s = results.summary;

  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    results.rows,
    NR_CONCEPTS.map(c => ({ key: c.key, get: row => row.valores[c.key]?.ctrl ?? null, label: c.label })),
    (row, field) => `${field.label} — leg. ${row.legajo}`
  );

  // Concepto NR más afectado (el que aparece en más legajos con diferencia) —
  // más útil acá que "el peor caso individual" porque hay 18 conceptos posibles.
  const conceptCounts = NR_CONCEPTS
    .map(c => ({ label: c.label, count: results.rows.filter(r => isDif(r.valores[c.key].ctrl)).length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);
  const contextNote = conceptCounts.length
    ? `concepto más afectado: ${conceptCounts[0].label}${conceptCounts.length > 1 ? ` (+${conceptCounts.length - 1} más)` : ''}`
    : '18 conceptos NR verificados';

  return {
    status:   s.conDif > 0 ? 'warning' : 'success',
    headline: `${s.total} registros · ${s.sinTabData} sin datos en Tabulado`,
    insights: [
      {
        type:  s.conDif > 0 ? 'warning' : 'success',
        label: 'empleados con al menos una diferencia NR',
        value: s.conDif,
      },
    ],
    unit: 'legajo',
    unitsTotal: s.total,
    unitsWithDiff,
    diffTotalAmount,
    worstCase,
    contextNote,
  };
}

export function runNr(nrRows, tabRows, mapping) {
  const nm = mapping.nr;
  const tm = mapping.tab;

  // Un legajo puede tener varias liquidaciones (pagas) en el mismo mes, tanto
  // en el Tabulado como en el Reporte de NR (ej: mensual + baja). Verificado
  // contra archivos reales de 04-2026: un legajo con 9 pagas trae 9 filas en
  // los DOS archivos. Meta4 informa el total sumado, así que se consolidan
  // ambos lados por legajo antes de comparar (ver ./consolidate.js).
  const keyFn = makeLegajoKey(mapping.legajoKeyMode);

  // Índice del Tabulado: legajo → { [conceptKey]: total sumado entre pagas }
  const tabByLegajo = new Map();
  for (const [id, group] of groupRowsByLegajo(tabRows, tm.empleadoColumn, { keyFn })) {
    const vals = {};
    for (const c of NR_CONCEPTS) {
      vals[c.key] = sumColumn(group, tm[c.tabKey]);
    }
    tabByLegajo.set(id, vals);
  }

  // Reporte de NR: una fila por legajo, sumando sus liquidaciones.
  const rows = [...groupRowsByLegajo(nrRows, nm.legajoColumn, { keyFn }).entries()].map(([legajo, group]) => {
    const tabVals = tabByLegajo.get(legajo) ?? null;

    const valores = {};
    for (const c of NR_CONCEPTS) {
      const nrVal  = sumColumn(group, nm[c.nrKey]);
      const tabVal = tabVals ? tabVals[c.key] : null;
      const ctrl   = (tabVal !== null && nrVal !== null) ? tabVal - nrVal : null;
      valores[c.key] = { nrVal, tabVal, ctrl };
    }

    return { legajo, valores, sinTabData: !tabVals };
  });

  // El CÓDIGO de concepto de cada columna del Tabulado que alimentó el cruce.
  // No entra en ningún cálculo: es para que la pantalla pueda NOMBRAR cada
  // concepto por su código, que es lo único estable —el rótulo lo renombra el
  // cliente sin avisar, y el Tabulado real trae `'4899-COCHERA_IG'` y
  // `'8805-DTO_COCHERA'` a la vez (D-039). Sale de la columna que el analista
  // confirmó en el Paso 2, así que es el código de ESTE cliente y no una
  // semilla; si el encabezado no declara ninguno queda `null`, nunca uno
  // inventado por parecido.
  const codigos = {};
  for (const c of NR_CONCEPTS) codigos[c.key] = codeOfColumn(tm[c.tabKey]);

  const conDif     = rows.filter(r =>
    Object.values(r.valores).some(v => isDiff(v.ctrl))
  ).length;
  const sinTabData = rows.filter(r => r.sinTabData).length;

  return {
    summary: { total: rows.length, conDif, sinTabData },
    rows,
    codigos,
    period: mapping.period || '',
  };
}

// "Tiene valor real" es otra pregunta que "difiere", así que el monto de
// diferencia del cliente no entra acá (D-069): con el monto en $ 100 una
// indemnización de $ 50 dejaría de existir para el control en vez de salir
// como diferencia.
const VALOR_REAL_EPS = 0.01;
const tieneValor = v => v !== null && Math.abs(v) > VALOR_REAL_EPS;

/** ¿Este concepto tiene algún valor real en alguna de las dos fuentes? */
function hasValor(v) {
  return tieneValor(v.nrVal) || tieneValor(v.tabVal);
}

// Un empleado es "relevante" si tiene algún valor NR (Tab o reporte) distinto de cero.
// Filtra el ruido de legajos que no cobran ningún concepto no remunerativo.
function hasAnyNrValue(r) {
  return Object.values(r.valores).some(hasValor);
}

// Qué cuenta como diferencia: el monto que el cliente puso en "Umbrales" (D-069).
const isDif = v => isDiff(v);

// Colores por grupo (compartidos entre tabla y export)
const INDEM_BG  = 'rgba(56,142,60,0.08)';
const INDEM_HDR = 'rgba(56,142,60,0.18)';
const OTROS_BG  = 'rgba(245,124,0,0.08)';
const OTROS_HDR = 'rgba(245,124,0,0.18)';

export function renderNrResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const rowDiffConcepts = r => NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl));
  const rowHasDiff = r => rowDiffConcepts(r).length > 0;
  const rowDiffAmount = r => rowDiffConcepts(r).reduce((s, c) => s + Math.abs(r.valores[c.key].ctrl), 0);

  // Empleados con algún valor NR (los "evaluables"); dentro de ellos, los que tienen diferencia.
  const relevantRows = rows.filter(hasAnyNrValue);
  const diffRows     = relevantRows.filter(rowHasDiff);
  const okCount      = relevantRows.length - diffRows.length;
  const noNrCount    = rows.length - relevantRows.length;
  const totalDiffAmount = diffRows.reduce((s, r) => s + rowDiffAmount(r), 0);

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'nr',
    // Con diferencias lo primero que se ve es POR QUÉ falla (§2): abre en Fichas.
    conDiferencias: diffRows.length > 0,
    resumen(panel) {
      const tone = diffRows.length === 0 ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: diffRows.length === 0
          ? 'Todos los empleados con valores NR coinciden con el Tabulado.'
          : `${diffRows.length} de ${relevantRows.length} empleados con NR tienen alguna diferencia.`,
        body: diffRows.length === 0
          ? `${relevantRows.length} empleado${relevantRows.length === 1 ? '' : 's'} con valores no remunerativos, verificados contra el Tabulado sin diferencias.`
          : `Diferencia total de <strong>${fmtNum(totalDiffAmount)}</strong> entre los 18 conceptos no remunerativos. El detalle completo está en la solapa «Detalle».`,
      });

      renderTiles(panel, [
        { label: 'Empleados con NR', value: relevantRows.length,
          sub: noNrCount > 0 ? `${noNrCount} sin valores NR (no se muestran)` : 'del total del Tabulado' },
        { label: 'Sin diferencia', value: okCount, tone: 'ok' },
        { label: 'Con diferencia', value: diffRows.length, tone: diffRows.length > 0 ? 'error' : 'ok' },
        { label: 'Diferencia total', value: fmtNum(totalDiffAmount), tone: diffRows.length > 0 ? 'error' : 'ok' },
      ]);

      if (diffRows.length > 0) {
        const top = [...diffRows].sort((a, b) => rowDiffAmount(b) - rowDiffAmount(a)).slice(0, 5);
        renderIssues(panel, {
          heading: `Casos para revisar · ${top.length} de ${diffRows.length}`,
          items: top.map(r => {
            const concepts = rowDiffConcepts(r).sort((a, b) => Math.abs(r.valores[b.key].ctrl) - Math.abs(r.valores[a.key].ctrl));
            const worst = concepts[0];
            const worstVal = r.valores[worst.key].ctrl;
            const rest = concepts.length - 1;
            return {
              sev: concepts.length > 1 ? 'hi' : 'lo',
              who: `Legajo ${r.legajo}`,
              what: `${worst.label}: diferencia de ${fmtNum(Math.abs(worstVal))}`,
              why: rest > 0 ? `y ${rest} concepto${rest === 1 ? '' : 's'} más con diferencia (Tab − NR).` : 'Tab − NR.',
              right: `<span class="${mvClass(worstVal)}">${mvArrow(worstVal)} ${fmtSigned(worstVal)}</span>`,
            };
          }),
        });
      }
    },
    fichas(panel) { renderNrFichas(panel, { relevantRows, results }); },
    detalle(panel) { renderNrDetalle(panel, { relevantRows, diffRows, results }); },
  });
}

function renderNrDetalle(container, { relevantRows, diffRows, results }) {
  if (relevantRows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Ningún empleado tiene valor real en los 18 conceptos NR.</p>`;
    return;
  }

  // Cuando no hay ninguna diferencia igual se muestra la tabla de evaluados: es
  // el respaldo de que el control se corrió y cerró. Antes acá se salía con el
  // cartel de OK y sin toolbar, y eso se llevaba puesto el exportable — que es
  // justo lo que el analista archiva cuando todo coincide.
  if (diffRows.length === 0) {
    const ok = document.createElement('div');
    ok.style.cssText = 'display:flex;align-items:center;gap:var(--sp-2);margin:var(--sp-3);padding:var(--sp-4);border:1px solid var(--color-border);border-left:4px solid var(--color-success);border-radius:var(--radius-md);background:var(--color-surface);';
    ok.innerHTML = `
      <span style="font-size:var(--text-xl);color:var(--color-success);">✓</span>
      <span>Todos los empleados con valores NR coinciden con el Tabulado. No hay diferencias para revisar.</span>
    `;
    container.appendChild(ok);
  }

  // ── Toolbar: alcance + filtro por concepto + buscador (izq) + exportar (der) ─
  // Mismo molde que Brutos y GS Pers: con cero diferencias el alcance arranca en
  // "Todos los evaluados", que es lo único que hay para mirar.
  const scopeSel = document.createElement('select');
  scopeSel.className = 'form-select form-select--sm';
  scopeSel.dataset.nrScopeFilter = '';
  // El filtro de estado es lo que se dibuja como chips (§3 de
  // specs/vista-estandar-resultados.md) — se declara, no se adivina.
  scopeSel.dataset.chips = '1';
  scopeSel.innerHTML = `
    <option value="dif">Sólo con diferencia (${diffRows.length})</option>
    <option value="all">Todos los evaluados (${relevantRows.length})</option>
  `;
  if (diffRows.length === 0) scopeSel.value = 'all';

  const conceptSel = document.createElement('select');
  conceptSel.className = 'form-select form-select--sm';
  conceptSel.dataset.nrConceptFilter = '';

  const filterGroup = document.createElement('div');
  filterGroup.className = 'form-group';
  filterGroup.style.cssText = 'margin-bottom:0;min-width:240px;display:flex;gap:var(--sp-2);flex-wrap:wrap;';
  const scopeWrap = document.createElement('div');
  scopeWrap.innerHTML = `<label class="form-label" style="font-size:var(--text-sm);">Alcance</label>`;
  scopeWrap.appendChild(scopeSel);
  const conceptWrap = document.createElement('div');
  conceptWrap.innerHTML = `<label class="form-label" style="font-size:var(--text-sm);">Filtrar por concepto</label>`;
  conceptWrap.appendChild(conceptSel);
  filterGroup.append(scopeWrap, conceptWrap);

  const { searchEl, exportEl } = createResultsToolbar(container, { left: filterGroup });

  /** Filas del alcance elegido — de acá salen la tabla y el export. */
  const scopeRows = () => (scopeSel.value === 'dif' ? diffRows : relevantRows);

  /**
   * Conceptos que el alcance actual tiene sentido mostrar: con diferencia
   * cuando se miran las diferencias, con algún valor cuando se miran todos
   * (si no, la tabla de un control que cerró en cero saldría sin columnas).
   */
  const conceptsInScope = () => scopeSel.value === 'dif'
    ? NR_CONCEPTS.filter(c => diffRows.some(r => isDif(r.valores[c.key].ctrl)))
    : NR_CONCEPTS.filter(c => relevantRows.some(r => {
        const v = r.valores[c.key];
        return tieneValor(v.nrVal) || tieneValor(v.tabVal);
      }));

  function renderConceptOptions() {
    const inScope = conceptsInScope();
    const label = scopeSel.value === 'dif' ? 'con diferencia' : 'con algún valor';
    conceptSel.innerHTML = `
      <option value="all">Todos los conceptos ${label} (${inScope.length})</option>
      ${inScope.map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('')}
    `;
  }

  // Exportar sigue al alcance, no al filtro de concepto: con diferencias el
  // default es "sólo con diferencia" (lo que exportaba antes), y con el control
  // en cero exporta los evaluados en vez de un archivo vacío. Siempre con los 18
  // conceptos completos, igual que exportNrToXlsx.
  const csvHeaders = ['Legajo', '# Difs', ...NR_CONCEPTS.map(c => c.label)];
  const csvRows = () => scopeRows().map(r => {
    const difs = NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length;
    return [r.legajo, difs, ...NR_CONCEPTS.map(c => fmtNum(r.valores[c.key].ctrl))];
  });

  renderExportMenu(exportEl, {
    onExcel: () => exportNrToXlsx({ ...results, rows: scopeRows() }),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `NR_Control_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });

  // ── Tabla (se re-renderiza al cambiar el filtro de concepto) ───────────────
  const cellBg = c => c.group === 'indem' ? INDEM_BG : OTROS_BG;
  const tableHost = document.createElement('div');
  container.appendChild(tableHost);

  function renderTable(selectedKey) {
    const inScope = conceptsInScope();
    const base = scopeRows();

    // Filas: las del alcance, o sólo las que tienen algo en el concepto elegido.
    const shownRows = selectedKey === 'all'
      ? base
      : base.filter(r => scopeSel.value === 'dif'
          ? isDif(r.valores[selectedKey].ctrl)
          : hasValor(r.valores[selectedKey]));

    // Columnas: las del alcance (oculta las que no tienen nada), o sólo la elegida.
    const shownConcepts = selectedKey === 'all'
      ? inScope
      : NR_CONCEPTS.filter(c => c.key === selectedKey);

    const hiddenCols = NR_CONCEPTS.length - shownConcepts.length;
    const maxAbs = Math.max(1, ...shownRows.flatMap(r => shownConcepts.map(c => Math.abs(r.valores[c.key].ctrl ?? 0))));
    const totals = {};
    for (const c of shownConcepts) totals[c.key] = shownRows.reduce((s, r) => s + (r.valores[c.key].ctrl ?? 0), 0);

    tableHost.innerHTML = `
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>Legajo</th>
            <th style="text-align:center;"># Difs</th>
            ${shownConcepts.map(c => {
              const bg = c.group === 'indem' ? INDEM_HDR : OTROS_HDR;
              return `<th style="background:${bg};font-size:0.72em;white-space:nowrap;">${esc(c.label)}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${shownRows.map(r => {
            const difs = NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length;
            return `
              <tr>
                <td>${esc(r.legajo)}</td>
                <td style="text-align:center;font-weight:700;${difs > 0 ? 'color:var(--color-danger);' : 'color:var(--color-success);'}">${difs}</td>
                ${shownConcepts.map(c => diffCellHtml(r.valores[c.key].ctrl, { max: maxAbs, background: cellBg(c) })).join('')}
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>TOTAL</strong></td>
            ${shownConcepts.map(c => diffCellHtml(totals[c.key], { background: c.group === 'indem' ? INDEM_HDR : OTROS_HDR })).join('')}
          </tr>
        </tfoot>
      </table>
      <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
        Mostrando ${shownRows.length} empleado${shownRows.length === 1 ? '' : 's'}
        ${scopeSel.value === 'dif' ? 'con diferencia' : 'evaluado' + (shownRows.length === 1 ? '' : 's')}.
        Valores: Tab − NR.
        ${hiddenCols > 0 ? `Se ocultan ${hiddenCols} concepto${hiddenCols === 1 ? '' : 's'} ${scopeSel.value === 'dif' ? 'sin diferencias' : 'sin valores'}.` : ''}
        Exportá el .xlsx para ver los valores originales de cada fuente.
      </p>
    `;

    // Paginación (tablas de cientos de legajos) + buscador por legajo — se
    // re-inicializan porque el <tbody> se recrea entero en cada filtro.
    wireTableTools(tableHost.querySelector('table'), {
      rows: shownRows,
      getLabel: r => `${r.legajo}`,
      searchEl,
      label: 'Buscar legajo',
      stickyCols: 1,
    });
  }

  conceptSel.addEventListener('change', (e) => renderTable(e.target.value));
  scopeSel.addEventListener('change', () => {
    // Cambiar el alcance cambia qué conceptos tienen sentido, así que la lista se
    // rearma y el filtro de concepto vuelve a "todos" en vez de quedar apuntando
    // a uno que ya no está en la lista.
    renderConceptOptions();
    renderTable('all');
  });

  renderConceptOptions();
  renderTable('all');
}


// ══════════════════════════════════════════════════════════════════════════════
// La solapa Fichas (§4 de specs/vista-estandar-resultados.md)
// ══════════════════════════════════════════════════════════════════════════════
//
// La planilla compara 18 columnas entre cientos de legajos; la ficha abre UN
// legajo y dice por qué no cierra. Hasta acá la fila de un legajo decía
// "# Difs: 3" y nada más: cuáles de los 18 conceptos, de qué lado, y por cuánto
// había que ir a buscarlo al .xlsx exportado.
//
// La ficha no recalcula nada. Los dos lados de cada concepto y su diferencia ya
// los publica `runNr()` en `valores[key] = { nrVal, tabVal, ctrl }`; acá se
// suman los conceptos de ESE legajo y se les pone nombre, código y una
// instrucción.

/** Los conceptos que este legajo tiene con valor real en alguna de las dos fuentes. */
function conceptosDeLegajo(r) {
  return NR_CONCEPTS.filter(c => hasValor(r.valores[c.key]));
}

/** Suma que respeta `null`: sin ningún dato el total es `null`, no `0`. */
function sumaONull(valores) {
  let total = null;
  for (const v of valores) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    total = (total ?? 0) + v;
  }
  return total;
}

/**
 * En qué estado cerró un legajo, para los cinco chips. Gana el peor de sus
 * conceptos, y **sólo se miran los conceptos que ese legajo liquidó**: los otros
 * vienen en `null` porque no se liquidaron, y contarlos dejaría a toda la nómina
 * en "Sin comparar" — que es otra cosa que "el concepto está de un solo lado",
 * que sí es un sin comparar de verdad.
 *
 * "Sin comparar" pesa más que "Dentro del margen" a propósito: un concepto que
 * no se pudo comparar preocupa más que uno que cerró, y nunca se lee como
 * aprobado (D-073).
 */
const ORDEN_ESTADO_NR = ['conDif', 'sinComparar', 'margen', 'centavo'];

function estadoDeFichaNr(conceptos, r) {
  let peor = null;
  for (const c of conceptos) {
    const e = estadoDeDiferencia(r.valores[c.key].ctrl);
    if (peor === null || ORDEN_ESTADO_NR.indexOf(e) < ORDEN_ESTADO_NR.indexOf(peor)) peor = e;
  }
  return peor ?? 'sinComparar';
}

const SEVERIDAD_NR = { conDif: 'error', sinComparar: 'warn', margen: 'info', centavo: 'ok' };

/**
 * El segundo eje del filtro: **qué conceptos liquidó** este legajo. Son los 18 y
 * van en `Marcas ▾`, nunca en la fila de chips: 18 chips no son un filtro, son
 * una pared, y la fila de chips dice siempre lo mismo en las 21 pantallas (§3).
 *
 * La misma lista alimenta las pills de cada tarjeta, así que el desplegable y la
 * ficha nombran exactamente lo mismo.
 */
function marcasNr(conceptos, codigos) {
  return conceptos.map(c => ({
    value: c.key,
    label: etiquetaConcepto(c, codigos),
    match: (f) => f.conceptos.some(x => x.key === c.key),
  }));
}

/** El concepto nombrado por su CÓDIGO y su rótulo. Sin código, sólo el rótulo:
 *  un código inventado por parecido manda a mirar la columna equivocada. */
function etiquetaConcepto(c, codigos) {
  const cod = codigos?.[c.key] || null;
  return cod ? `${cod} · ${c.label}` : c.label;
}

/** Cuántas pills de concepto entran en una tarjeta antes de que sean una pared. */
const MAX_PILLS_NR = 6;

const NO_APLICA_NR = {};

/** Los descriptores de ficha del control: uno por legajo con algún valor NR.
 *  Exportada para el test: es donde se decide qué dice cada tarjeta. */
export function buildFichasNr(relevantRows, codigos) {
  return relevantRows.map(r => {
    const conceptos = conceptosDeLegajo(r);
    const conDif = conceptos.filter(c => isDif(r.valores[c.key].ctrl));
    const sinComparar = conceptos.filter(c => r.valores[c.key].ctrl === null);

    const sumNr  = sumaONull(conceptos.map(c => r.valores[c.key].nrVal));
    const sumTab = sumaONull(conceptos.map(c => r.valores[c.key].tabVal));
    // **La diferencia se suma sólo sobre lo COMPARABLE, no como resta de los dos
    // totales.** Con la resta, un concepto que trae valor de un solo lado se
    // cuenta como si el otro lado valiera cero: un legajo con 7.000,00 en un
    // concepto que el Tabulado no informa salía con "−7.000,00 de diferencia",
    // que es exactamente lo que `null` no es (CLAUDE.md). Los dos totales de
    // arriba siguen siendo los de cada archivo —eso es lo que el analista
    // compara—, y lo que quedó afuera se dice en la línea de contexto, en la
    // tabla con "—" y en la conclusión.
    const difComparada = sumaONull(conceptos.map(c => r.valores[c.key].ctrl));
    // Lo que hay para revisar es la suma de las diferencias EN VALOR ABSOLUTO de
    // los conceptos que las tienen — el mismo número que el tile "Diferencia
    // total" del Resumen totaliza. No es el neto: un legajo con +12.000 en un
    // concepto y −12.000 en otro tiene neto cero y dos conceptos mal, y ése es
    // justo el caso que la ficha existe para mostrar.
    const aRevisar = conDif.reduce((s, c) => s + Math.abs(r.valores[c.key].ctrl), 0);

    const base = { id: r.legajo, row: r, conceptos, conDif, sinComparar, sumNr, sumTab, difComparada, aRevisar };
    base.estado = estadoDeFichaNr(conceptos, r);
    return { ...base, ...presentacionNr(base, codigos) };
  });
}

/** Lo que se ve: la tarjeta cerrada arriba y el cuerpo que se dibuja al abrir. */
function presentacionNr(f, codigos) {
  const { row: r, conceptos, conDif, sinComparar } = f;
  const sev = SEVERIDAD_NR[f.estado] || 'info';
  const nIndem = conceptos.filter(c => c.group === 'indem').length;

  // El peor concepto: es el que da el badge, o sea la causa principal.
  const peor = [...conDif].sort((a, b) =>
    Math.abs(r.valores[b.key].ctrl) - Math.abs(r.valores[a.key].ctrl))[0] || null;

  return {
    unit: r.legajo,
    severity: sev,
    name: `Legajo ${r.legajo}`,
    tag: { text: nIndem === conceptos.length ? 'Indemnizatorios' : nIndem > 0 ? 'Indem. + otros NR' : 'Otros NR' },
    badge: badgeNr(f, peor, codigos),
    context: [
      `${conceptos.length} de ${NR_CONCEPTS.length} conceptos con valor`,
      conDif.length > 0
        ? `${conDif.length} con diferencia`
        : sinComparar.length > 0 ? 'ninguna diferencia comparable' : 'todos coinciden',
      sinComparar.length > 0 ? `${sinComparar.length} de un solo lado` : null,
    ],
    marks: pillsNr(f, codigos),
    amountLabel: 'A revisar',
    amount: f.aRevisar,
    amountTone: sev === 'error' ? 'error' : sev === 'warn' ? 'warn' : undefined,
    body: {
      // 1. La tira: el total del reporte de NR contra el total del Tabulado, y
      //    qué conceptos explican la diferencia. Las dos primeras pastillas son
      //    los dos lados tal como los trae cada archivo; la tercera es la
      //    diferencia de lo que SÍ se pudo comparar (no la resta de las dos de
      //    arriba: ver `difComparada`); la cuarta, lo que hay que ir a mirar (por
      //    qué son dos números distintos, ver `aRevisar`).
      strip: [
        { label: 'Reporte NR', value: f.sumNr },
        { label: 'Tabulado', value: f.sumTab },
        { label: 'Diferencia comparada', value: f.difComparada, invert: true },
        {
          label: conDif.length > 0
            ? `A revisar · ${conDif.length} de ${conceptos.length} concepto${conceptos.length === 1 ? '' : 's'}`
            : 'A revisar',
          value: f.aRevisar,
          residuo: conDif.length > 0,
        },
      ],
      // 2. El detalle: un renglón por concepto de este legajo, con su CÓDIGO,
      //    los dos lados y la diferencia. Verde suave lo que el Tabulado tiene
      //    de más, rojo suave lo que tiene de menos.
      detail: {
        title: 'Concepto por concepto — los dos lados y la diferencia',
        columns: [
          { key: 'concepto', label: 'Concepto' },
          { key: 'tab', label: 'Tabulado', num: true },
          { key: 'nr', label: 'Reporte NR', num: true },
          { key: 'dif', label: 'Tab − NR', num: true },
        ],
        rows: ordenarConceptos(conceptos, r).map(c => {
          const v = r.valores[c.key];
          return {
            concepto: etiquetaConcepto(c, codigos),
            tab: v.tabVal, nr: v.nrVal, dif: v.ctrl,
            tone: v.ctrl === null || Math.abs(v.ctrl) <= CENTAVO_NR
              ? undefined : (v.ctrl > 0 ? 'pos' : 'neg'),
          };
        }),
        foot: { label: 'Diferencia comparada', value: f.difComparada, key: 'dif' },
      },
      // 3. La conclusión: qué mirar, descontando lo que ya está explicado.
      conclusion: conclusionNr(f, peor, codigos),
    },
  };
}

/** El redondeo de Meta4, el piso de todo el repo: abajo de esto no hay color. */
const CENTAVO_NR = 0.01;

/** Peor primero: la diferencia más grande arriba, después lo que no se pudo
 *  comparar, y al final lo que cerró. */
function ordenarConceptos(conceptos, r) {
  const rango = (c) => {
    const d = r.valores[c.key].ctrl;
    if (d === null) return 1;
    return isDif(d) ? 0 : 2;
  };
  return [...conceptos].sort((a, b) => {
    const ra = rango(a), rb = rango(b);
    if (ra !== rb) return ra - rb;
    return Math.abs(r.valores[b.key].ctrl ?? 0) - Math.abs(r.valores[a.key].ctrl ?? 0);
  });
}

/** La causa principal, en una línea. */
function badgeNr(f, peor, codigos) {
  const r = f.row;
  if (peor) {
    const v = r.valores[peor.key].ctrl;
    return {
      text: `${etiquetaConcepto(peor, codigos)} ${fmtSigned(v)}`,
      title: `El Tabulado tiene ${v > 0 ? 'de más' : 'de menos'} que el Reporte NR en este concepto.`,
      tone: 'error',
    };
  }
  if (r.sinTabData) {
    return { text: 'No está en el Tabulado', tone: 'warn' };
  }
  if (f.sinComparar.length > 0) {
    return {
      text: `${f.sinComparar.length} concepto${f.sinComparar.length === 1 ? '' : 's'} de un solo lado`,
      tone: 'warn',
    };
  }
  if (f.estado === 'margen') {
    return { text: 'Dentro del monto de diferencia', tone: 'info' };
  }
  return { text: 'Coincide al centavo', tone: 'ok' };
}

/**
 * Las pills de la tarjeta: los conceptos que este legajo liquidó, los mismos que
 * el desplegable `Marcas ▾`. En celeste el que tiene diferencia, en gris el que
 * cerró. Con más de MAX_PILLS_NR la línea deja de ser una marca y pasa a ser una
 * pared: se cortan y se dice cuántas quedaron afuera.
 */
function pillsNr(f, codigos) {
  const r = f.row;
  const orden = ordenarConceptos(f.conceptos, r);
  const pills = orden.slice(0, MAX_PILLS_NR).map(c => ({
    text: etiquetaConcepto(c, codigos),
    tone: isDif(r.valores[c.key].ctrl) || r.valores[c.key].ctrl === null ? 'info' : 'neutral',
  }));
  const resto = orden.length - pills.length;
  if (resto > 0) pills.push({ text: `+${resto} más`, tone: 'neutral', title: orden.slice(MAX_PILLS_NR).map(c => etiquetaConcepto(c, codigos)).join(' · ') });
  return pills;
}

/** No un resumen del importe que ya se ve arriba: una instrucción, descontando
 *  lo que la ficha ya explicó. */
function conclusionNr(f, peor, codigos) {
  const r = f.row;
  const cerraron = f.conceptos.length - f.conDif.length - f.sinComparar.length;
  const yaExplicado = cerraron === 0 ? ''
    : cerraron === 1
      ? ' El otro concepto de este legajo ya cierra: no hace falta mirarlo.'
      : ` Los otros ${cerraron} conceptos de este legajo ya cierran: no hace falta mirarlos.`;

  if (r.sinTabData) {
    return {
      tone: 'warn',
      title: 'Este legajo informa NR y no aparece en el Tabulado',
      text: 'El Reporte de NR trae valores para este legajo y el Tabulado del período no lo tiene en ninguna '
        + 'liquidación. Confirmá que los dos archivos sean del mismo mes y de la misma empresa antes de '
        + 'tocar el reporte: si el Tabulado es el correcto, el legajo está de más en el Reporte de NR.',
    };
  }

  if (f.conDif.length > 0) {
    const cuales = f.conDif.map(c => etiquetaConcepto(c, codigos)).join(', ');
    const sinCmp = f.sinComparar.length > 0
      ? ` Además hay ${f.sinComparar.length} concepto${f.sinComparar.length === 1 ? '' : 's'} con valor de un solo `
        + 'lado, que sale abajo con «—»: no se pudo comparar, así que su importe no está sumado en la '
        + 'diferencia de arriba.'
      : '';
    return {
      tone: 'error',
      title: `Quedan ${fmtNum(f.aRevisar)} para revisar en ${f.conDif.length} concepto${f.conDif.length === 1 ? '' : 's'}`,
      text: `Abrí el Tabulado en la columna de ${cuales} para este legajo y sumá sus liquidaciones del mes: `
        + `el control ya las suma, así que una diferencia acá es un valor distinto, no una paga de menos.`
        + (peor && f.conDif.length > 1 ? ` Arrancá por ${etiquetaConcepto(peor, codigos)}, que es la más grande.` : '')
        + sinCmp + yaExplicado,
    };
  }

  if (f.sinComparar.length > 0) {
    // Con el importe y de qué lado: es lo que le permite al analista buscarlo en
    // el archivo, y es plata que la diferencia de arriba NO incluye a propósito.
    const cuales = f.sinComparar.map(c => {
      const v = r.valores[c.key];
      const lado = v.tabVal !== null ? 'el Tabulado' : 'el Reporte de NR';
      const monto = v.tabVal !== null ? v.tabVal : v.nrVal;
      return `${etiquetaConcepto(c, codigos)} (${fmtNum(monto)} en ${lado}, nada del otro lado)`;
    }).join(', ');
    return {
      tone: 'warn',
      title: `${f.sinComparar.length} concepto${f.sinComparar.length === 1 ? '' : 's'} con valor de un solo lado`,
      text: `${cuales}. Ese importe NO entra en la diferencia de arriba: un concepto sin el otro lado no vale `
        + 'cero, no se sabe cuánto vale. O la columna no está mapeada en el Paso 2, o el concepto se liquidó '
        + 'de un solo lado — revisá el mapeo primero.'
        + yaExplicado,
    };
  }

  if (f.estado === 'margen') {
    return {
      tone: 'info',
      title: 'Todo queda dentro del monto de diferencia del cliente',
      text: 'Los conceptos de este legajo no coinciden exactamente pero ninguna diferencia llega al monto '
        + 'configurado en «Umbrales». No hay nada que corregir; si querés verlas, bajá el monto.',
    };
  }

  return {
    tone: 'ok',
    title: 'Cierra al centavo',
    text: (f.conceptos.length === 1
      ? 'El único concepto no remunerativo de este legajo coincide entre el Reporte de NR y el Tabulado. '
      : `Los ${f.conceptos.length} conceptos no remunerativos de este legajo coinciden entre el Reporte de `
        + 'NR y el Tabulado. ')
      + 'No hay nada para revisar acá.',
  };
}

function renderNrFichas(panel, { relevantRows, results }) {
  const codigos = results.codigos || {};
  const fichas = buildFichasNr(relevantRows, codigos);
  const conceptos = conceptosConValorNr(relevantRows);

  renderFichasPanel(panel, {
    fichas,
    unitLabel: 'legajos',
    estadoDe: f => f.estado,
    noAplica: NO_APLICA_NR,
    marcas: marcasNr(conceptos, codigos),
    ordenes: [
      { value: 'aRevisar', label: 'Mayor diferencia', compare: (a, b) => b.aRevisar - a.aRevisar },
      { value: 'conceptos', label: 'Más conceptos con diferencia', compare: (a, b) => b.conDif.length - a.conDif.length },
      { value: 'legajo', label: 'Legajo', compare: (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }) },
    ],
    getLabel: f => `${f.id}`,
    getAmount: f => f.aRevisar,
    amountLabel: 'Σ a revisar',
    onExport: (exportEl) => mountNrExportMenu(exportEl, { rows: relevantRows, results }),
  });
}

/** Los conceptos con algún valor real en la corrida — el universo de `Marcas ▾`. */
function conceptosConValorNr(rows) {
  return NR_CONCEPTS.filter(c => rows.some(r => hasValor(r.valores[c.key])));
}

/** Los tres ítems del ⬇ Exportar ▾ de la solapa Fichas. Siempre los 18
 *  conceptos y todos los legajos evaluados: el filtro de pantalla recorta lo que
 *  se ve, no lo que se archiva. */
function mountNrExportMenu(exportEl, { rows, results }) {
  const csvHeaders = ['Legajo', '# Difs', ...NR_CONCEPTS.map(c => c.label)];
  const csvRows = () => rows.map(r => [
    r.legajo,
    NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length,
    ...NR_CONCEPTS.map(c => fmtNum(r.valores[c.key].ctrl)),
  ]);
  renderExportMenu(exportEl, {
    onExcel: () => exportNrToXlsx({ ...results, rows }),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `NR_Control_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
}

// ── Modo 2: Generar Reporte ───────────────────────────────────────────────────

export function runNrReporte(_primaryRows, tabRows, mapping) {
  const tm = mapping.tab;

  const nombreCol    = tm.tabNombreColumn    || null;
  const apellido1Col = tm.tabApellido1Column || null;

  // Consolidar por legajo: los importes de cada concepto se suman entre todas
  // las liquidaciones del mes; los datos de referencia (nombre, fechas) se
  // toman de la última liquidación (igual que runBrutosReporte).
  const keyFn = makeLegajoKey(mapping.legajoKeyMode);
  const rows = [...groupRowsByLegajo(tabRows, tm.empleadoColumn, { keyFn }).entries()].map(([legajo, group]) => {
    const last = lastRow(group);
    const base = {
      legajo,
      nombre:       nombreCol    ? norm(last[nombreCol])    : null,
      apellido1:    apellido1Col ? norm(last[apellido1Col]) : null,
      fecAlta:      tm.tabFecAltaColumn     ? fmtDate(last[tm.tabFecAltaColumn])     : null,
      fecBaja:      tm.tabFecBajaColumn     ? fmtDate(last[tm.tabFecBajaColumn])     : null,
      fecPago:      tm.tabFecPagoColumn     ? fmtDate(last[tm.tabFecPagoColumn])     : null,
      idCentroTrab: tm.tabIdCentroTrabColumn ? norm(last[tm.tabIdCentroTrabColumn]) : null,
      idCategoria:  tm.tabIdCategoriaColumn  ? norm(last[tm.tabIdCategoriaColumn])  : null,
    };
    for (const c of NR_CONCEPTS) {
      base[c.key] = sumColumn(group, tm[c.tabKey]);
    }
    return base;
  });

  return {
    summary: { total: rows.length },
    rows,
    period: mapping.period || '',
  };
}

export function summarizeNrReporte(results) {
  return {
    status:   'info',
    headline: `${results.summary.total} registros — Reporte de NR generado del Tabulado`,
    insights: [],
    unit:            null,
    unitsTotal:      null,
    unitsWithDiff:   null,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote:     null,
  };
}

// En "Generar Reporte" cada fila trae los conceptos como r[c.key] (número o null).
function reporteRowHasValue(r) {
  return NR_CONCEPTS.some(c => tieneValor(r[c.key]));
}

export function renderNrReporteResults(results, container) {
  const { rows } = results;

  if (rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  // Sólo empleados con algún valor NR distinto de cero.
  const relevantRows = rows.filter(reporteRowHasValue);
  const noNrCount    = rows.length - relevantRows.length;
  const conceptsWithValue = NR_CONCEPTS.filter(c =>
    relevantRows.some(r => tieneValor(r[c.key]))
  );

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'nr_reporte',
    resumen(panel) {
      renderVerdict(panel, {
        tone: relevantRows.length > 0 ? 'info' : 'warn',
        title: relevantRows.length > 0
          ? `Reporte de NR generado — ${relevantRows.length} empleado${relevantRows.length === 1 ? '' : 's'} con valores.`
          : 'Ningún empleado tiene valores NR distintos de cero en este período.',
        body: relevantRows.length > 0
          ? `Armado directo desde el Tabulado, con ${conceptsWithValue.length} de los 18 conceptos no remunerativos con algún valor. El detalle completo está en la solapa «Detalle».`
          : null,
      });
      renderTiles(panel, [
        { label: 'Empleados con NR', value: relevantRows.length },
        { label: 'Sin valores NR', value: noNrCount, sub: 'no entran al reporte' },
        { label: 'Conceptos con valor', value: `${conceptsWithValue.length} / 18` },
      ]);
    },
    detalle(panel) { renderNrReporteDetalle(panel, { relevantRows, conceptsWithValue, results }); },
  });
}

function renderNrReporteDetalle(container, { relevantRows, conceptsWithValue, results }) {
  const fmtTxt = v => v === null ? '—' : esc(String(v));

  if (relevantRows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Ningún empleado tiene valores NR distintos de cero en este período.</p>`;
    return;
  }

  const filteredResults = { ...results, rows: relevantRows };

  // ── Toolbar: filtro por concepto + buscador (izquierda) + exportar (derecha) ─
  const filterGroup = document.createElement('div');
  filterGroup.className = 'form-group';
  filterGroup.style.cssText = 'margin-bottom:0;min-width:240px;';
  filterGroup.innerHTML = `
    <label class="form-label" style="font-size:var(--text-sm);">Filtrar por concepto</label>
    <select class="form-select form-select--sm" data-nr-concept-filter>
      <option value="all">Todos los conceptos con valor (${conceptsWithValue.length})</option>
      ${conceptsWithValue.map(c =>
        `<option value="${esc(c.key)}">${esc(c.label)}</option>`
      ).join('')}
    </select>
  `;

  const { searchEl, exportEl } = createResultsToolbar(container, { left: filterGroup });

  // Exportar siempre incluye TODOS los empleados con valores NR y las 18
  // columnas de conceptos completas (igual que exportNrReporteToXlsx) — el
  // filtro de concepto de arriba sólo recorta lo que se ve en pantalla.
  const csvHeaders = ['ID_EMPLEADO', 'NOMBRE', 'APELLIDO_1', 'FECHA_ALTA', 'FECHA_BAJA', 'FEC_PAGO', 'ID_CENTRO_TRAB', 'ID_CATEGORIA', ...NR_CONCEPTS.map(c => c.label)];
  const csvRows = () => relevantRows.map(r => [
    r.legajo, r.nombre ?? '', r.apellido1 ?? '', r.fecAlta ?? '', r.fecBaja ?? '', r.fecPago ?? '', r.idCentroTrab ?? '', r.idCategoria ?? '',
    ...NR_CONCEPTS.map(c => fmtNum(r[c.key])),
  ]);

  renderExportMenu(exportEl, {
    onExcel: () => exportNrReporteToXlsx(filteredResults),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `NR_Reporte_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });

  // ── Tabla (re-render al cambiar el filtro) ────────────────────────────────
  const tableHost = document.createElement('div');
  container.appendChild(tableHost);

  function renderTable(selectedKey) {
    const shownRows = selectedKey === 'all'
      ? relevantRows
      : relevantRows.filter(r => tieneValor(r[selectedKey]));

    const shownConcepts = selectedKey === 'all'
      ? conceptsWithValue
      : NR_CONCEPTS.filter(c => c.key === selectedKey);

    const hiddenCols = NR_CONCEPTS.length - shownConcepts.length;

    tableHost.innerHTML = `
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>ID_EMPLEADO</th>
            <th>NOMBRE</th>
            <th>APELLIDO_1</th>
            <th>FECHA_ALTA</th>
            <th>FECHA_BAJA</th>
            <th>FEC_PAGO</th>
            <th>ID_CENTRO_TRAB</th>
            <th>ID_CATEGORIA</th>
            ${shownConcepts.map(c => {
              const bg = c.group === 'indem' ? INDEM_HDR : OTROS_HDR;
              return `<th style="background:${bg};font-size:0.72em;white-space:nowrap;">${esc(c.label)}</th>`;
            }).join('')}
          </tr>
        </thead>
        <tbody>
          ${shownRows.map(r => `
            <tr>
              <td>${fmtTxt(r.legajo)}</td>
              <td>${fmtTxt(r.nombre)}</td>
              <td>${fmtTxt(r.apellido1)}</td>
              <td>${fmtTxt(r.fecAlta)}</td>
              <td>${fmtTxt(r.fecBaja)}</td>
              <td>${fmtTxt(r.fecPago)}</td>
              <td>${fmtTxt(r.idCentroTrab)}</td>
              <td>${fmtTxt(r.idCategoria)}</td>
              ${shownConcepts.map(c => {
                const bg = c.group === 'indem' ? INDEM_BG : OTROS_BG;
                return `<td style="text-align:right;background:${bg};">${fmtNum(r[c.key])}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
        Mostrando ${shownRows.length} empleado${shownRows.length === 1 ? '' : 's'}.
        ${hiddenCols > 0 ? `Se ocultan ${hiddenCols} concepto${hiddenCols === 1 ? '' : 's'} sin valores.` : ''}
        El .xlsx exportado incluye las 18 columnas de conceptos en el layout estándar.
      </p>
    `;

    // Paginación (tablas de cientos de legajos) + buscador por legajo/nombre —
    // se re-inicializan porque el <tbody> se recrea entero en cada filtro.
    wireTableTools(tableHost.querySelector('table'), {
      rows: shownRows,
      getLabel: r => r.nombre ? `${r.legajo} — ${r.nombre}` : `${r.legajo}`,
      searchEl,
      stickyCols: 2,
    });
  }

  filterGroup.querySelector('[data-nr-concept-filter]')
    .addEventListener('change', (e) => renderTable(e.target.value));
  renderTable('all');
}

// ── Exports a Excel ───────────────────────────────────────────────────────────

// XLSX "Controlar": Legajo + 18 columnas CTRL (Tab − NR), coloreadas por grupo
async function exportNrToXlsx(results) {
  await loadExcelJS();

  // El contrato lee columnas planas (`row[c.key]`); `runNr()` guarda cada
  // concepto anidado en `valores[c.key].ctrl` — se aplana acá, una sola vez,
  // en vez de que el writer conozca esa forma.
  const flatRows = results.rows.map(r => {
    const flat = { legajo: r.legajo, difs: NR_CONCEPTS.filter(c => isDif(r.valores[c.key].ctrl)).length };
    for (const c of NR_CONCEPTS) flat[c.key] = r.valores[c.key].ctrl;
    return flat;
  });

  const { EXPORT_CONTRACTS } = await import('../exports/contracts.js');
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();
  writeGroupedContractSheet(wb, EXPORT_CONTRACTS.nr, flatRows);
  await downloadWorkbook(wb, `NR_Control_${periodSuffix(results.period)}.xlsx`);
}

// XLSX "Generar Reporte": A(vacía) · B=ID_EMPLEADO · ... · I=ID_CATEGORIA · J-AA=18 conceptos
async function exportNrReporteToXlsx(results) {
  await loadExcelJS();
  const { EXPORT_CONTRACTS } = await import('../exports/contracts.js');
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();
  writeGroupedContractSheet(wb, EXPORT_CONTRACTS.nr_reporte, results.rows);
  await downloadWorkbook(wb, `NR_Reporte_${periodSuffix(results.period)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Limpieza de texto (nombre, centro de costo). La clave de legajo NO sale de
// acá: sale de `makeLegajoKey(mapping.legajoKeyMode)` (D-038).
function norm(v) { return v != null ? String(v).trim() : ''; }

function fmtDate(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!isNaN(n) && n > 1 && n < 100000 && String(v).trim() !== '') {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  }
  const s = String(v).trim();
  return s === '' ? null : s;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
