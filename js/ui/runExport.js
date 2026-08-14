// runExport.js — Los dos ítems del menú "⬇ Exportar ▾" de la pantalla de
// resultados (la acción primaria de esa pantalla, en la barra superior).
//
// Qué exporta cada uno, y por qué son dos y no uno:
//
//   📊 Excel — el VEREDICTO de la corrida: una fila por control con cuántas
//      unidades verificó, cuántas tienen diferencia y por cuánta plata. Es lo
//      que se adjunta en un mail para decir "esto dio el mes". El detalle
//      completo de cada control (legajo por legajo) se sigue exportando desde
//      la tabla de ese control, en la solapa Detalle: cada control arma su
//      hoja con su propio contrato de export (js/exports/contracts.js) y esa
//      es la única fuente de esa hoja.
//
//   { } JSON — la corrida entera tal cual quedó guardada, para archivarla o
//      pasársela a otro analista. **Lleva datos de empleados**: por eso el
//      menú muestra el recordatorio de confidencialidad al pie (CLAUDE.md
//      §Privacidad).
//
// No calcula nada: recibe el veredicto ya resuelto por la pantalla (el tier
// sale de computeSemaforoStatus, que no se toca) y lo escribe.

import { loadExcelJS, downloadWorkbook, downloadBlob } from '../utils/exportData.js';

export const EXPORT_PRIVACY_NOTE =
  '⚠ El export contiene datos personales — tratalo como información confidencial.';

const TIER_LABEL = { ok: 'Verde', warn: 'Amarillo', error: 'Rojo', info: 'Sin cruce' };

const HEADER_FILL = 'FFE8E8E8';
const DIFF_COLOR  = 'FFCC0000';

/**
 * @param {object} run
 * @param {string} run.clienteName
 * @param {string} run.clienteCode
 * @param {string} run.periodo        - "Agosto 2026"
 * @param {string} run.period         - "2026-08" (para el nombre del archivo)
 * @param {string} [run.createdAtLabel]
 * @param {string} [run.estadoLabel]  - "Borrador" / "Definitivo" / "Ejecución rápida"
 * @param {string} [run.notes]
 * @param {string[]} [run.warnings] - los avisos registrados al ejecutar (ver
 *   js/ui/runWarnings.js). Van al export porque el archivo que se manda por mail
 *   tiene que decir con qué se corrió, no sólo qué dio.
 * @param {object[]} run.controles - uno por control, ya con el veredicto resuelto:
 *   `{ controlId, label, tier, unitLabel, unitsTotal, unitsWithDiff, diffTotalAmount,
 *      headline, results }`
 * @returns {object[]} ítems para renderExportMenu({ items })
 */
export function buildRunExportItems(run) {
  return [
    {
      key: 'excel',
      label: '📊 Excel (.xlsx)',
      desc: 'El veredicto de la corrida, una fila por control',
      action: () => exportRunSummaryXlsx(run),
    },
    {
      key: 'json',
      label: '{ } JSON de la corrida',
      desc: 'Todo lo que se guardó, para archivar o pasarle a otro analista',
      action: () => exportRunJson(run),
    },
  ];
}

/** "Marval_2026-08" — base común de los dos nombres de archivo. */
function fileBase(run) {
  const code = String(run.clienteCode || run.clienteName || 'corrida').replace(/[^\w-]+/g, '_');
  const per  = String(run.period || '').replace(/[^\w-]+/g, '_');
  return per ? `${code}_${per}` : code;
}

async function exportRunSummaryXlsx(run) {
  await loadExcelJS();
  const wb = new window.ExcelJS.Workbook();
  const ws = wb.addWorksheet('Resumen de la corrida');

  ws.columns = [
    { width: 34 }, { width: 12 }, { width: 20 }, { width: 13 },
    { width: 16 }, { width: 10 }, { width: 18 }, { width: 46 },
  ];

  // Encabezado del run: de qué cliente, de qué período y en qué estado quedó.
  const meta = [
    ['Cliente',  run.clienteName || ''],
    ['Período',  run.periodo || ''],
    ['Ejecutado', run.createdAtLabel || ''],
    ['Estado',   run.estadoLabel || ''],
  ];
  if (run.notes) meta.push(['Nota', run.notes]);
  for (const [label, value] of meta) {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = { name: 'Calibri', size: 10, bold: true };
    r.getCell(2).font = { name: 'Calibri', size: 10 };
  }
  ws.addRow([]);

  const headers = [
    'Control', 'Estado', 'Unidad verificada', 'Evaluados',
    'Con diferencia', '%', 'Δ acumulada ($)', 'Detalle',
  ];
  const hdr = ws.addRow(headers);
  hdr.height = 20;
  hdr.eachCell(cell => {
    cell.font      = { name: 'Calibri', size: 10, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });

  for (const c of run.controles) {
    // `null` (no `0`) cuando el control no cruza nada: una celda vacía dice
    // "acá no hay dato", un 0 diría "verificó cero" (CLAUDE.md §null no es 0).
    const pct = c.unitsTotal > 0 ? (c.unitsWithDiff / c.unitsTotal) * 100 : null;
    const row = ws.addRow([
      c.label,
      TIER_LABEL[c.tier] || c.tier,
      c.unitLabel ?? '',
      c.unitsTotal ?? null,
      c.unitsWithDiff ?? null,
      pct,
      c.diffTotalAmount || null,
      c.headline || '',
    ]);
    row.eachCell(cell => { cell.font = { name: 'Calibri', size: 10 }; });
    row.getCell(6).numFmt = '0.0"%"';
    row.getCell(7).numFmt = '#,##0.00';
    if (c.tier === 'error' || c.tier === 'warn') {
      for (const i of [2, 5, 6, 7]) {
        row.getCell(i).font = { name: 'Calibri', size: 10, bold: true, color: { argb: DIFF_COLOR } };
      }
    }
  }

  // Los avisos de la corrida, abajo de la tabla: con qué se corrió, no sólo qué
  // dio. Sin avisos también se dice — un bloque ausente no distingue "no hubo"
  // de "no se miró".
  const avisos = (run.warnings || []).filter(Boolean);
  ws.addRow([]);
  const avisosHdr = ws.addRow([
    avisos.length === 0 ? 'Avisos de la corrida' : `Avisos de la corrida (${avisos.length})`,
  ]);
  avisosHdr.getCell(1).font = { name: 'Calibri', size: 10, bold: true };
  if (avisos.length === 0) {
    ws.addRow(['Sin avisos.']).getCell(1).font = { name: 'Calibri', size: 10 };
  } else {
    for (const w of avisos) {
      const r = ws.addRow([w]);
      r.getCell(1).font = { name: 'Calibri', size: 10 };
      r.getCell(1).alignment = { wrapText: true };
    }
  }

  await downloadWorkbook(wb, `Corrida_${fileBase(run)}.xlsx`);
}

function exportRunJson(run) {
  const payload = {
    app: 'Controles Nómina',
    exportadoEl: new Date().toISOString(),
    cliente: { code: run.clienteCode ?? null, nombre: run.clienteName ?? null },
    periodo: { valor: run.period ?? null, etiqueta: run.periodo ?? null },
    corrida: {
      ejecutadaEl: run.createdAtLabel ?? null,
      estado:      run.estadoLabel ?? null,
      nota:        run.notes ?? null,
      avisos:      (run.warnings || []).filter(Boolean),
    },
    controles: run.controles.map(c => ({
      controlId:       c.controlId,
      label:           c.label,
      estado:          TIER_LABEL[c.tier] || c.tier,
      unidad:          c.unitLabel ?? null,
      evaluados:       c.unitsTotal ?? null,
      conDiferencia:   c.unitsWithDiff ?? null,
      diferenciaTotal: c.diffTotalAmount ?? null,
      resultados:      c.results ?? null,
    })),
  };

  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
    `Corrida_${fileBase(run)}.json`,
  );
}
