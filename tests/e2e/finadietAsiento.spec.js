// finadietAsiento.spec.js — Prueba de extremo a extremo de la herramienta
// standalone `reportes/finadiet-asiento-remuneraciones.html` (ver
// specs/finadiet-asiento-remuneraciones.md). No pasa por la app ni por
// IndexedDB: es un HTML suelto que arma el asiento contable de FINADIET a
// partir del excel mensual "FINADIET CONCEPTOS".
//
// Datos 100% inventados (no son datos reales de FINADIET) — cubren:
// - una cuenta de Resultado con dos conceptos en el mismo centro de costo
//   (se consolidan en una sola línea de la solapa ASIENTO, D-consolidación)
// - dos centros de costo distintos (agrupación de la solapa ASIENTO)
// - una cuenta contable sin clasificar y un centro de costo sin clasificar
//   (deben excluirse del cálculo y avisar, no inventar clasificación)
// - una fila con cuenta Debe == Haber y otra con ambos códigos vacíos
//   (exclusión silenciosa, sin aviso)
// - texto malicioso en dos columnas que llegan crudas del Excel del cliente,
//   para confirmar que se escapan al pintarlas (nunca ejecutan HTML/JS)

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as XLSX from '../../node_modules/xlsx/xlsx.mjs';

const XSS_PAYLOAD = '<img src=x onerror="window.__xssFired=true">';

/** Fila del excel FINADIET CONCEPTOS: sólo llenamos las columnas que usa la herramienta. */
function conceptoRow({ centro, importe, nro, concepto, cdNombre, cd, chNombre, ch }) {
  const r = new Array(35).fill(null);
  r[11] = centro; r[25] = importe; r[22] = nro; r[23] = concepto;
  r[31] = cdNombre; r[32] = cd; r[33] = chNombre; r[34] = ch;
  return r;
}

const aoa = [
  ['header0'], ['header1'], ['header2'], // filas 1-3 descartadas; los datos arrancan en la fila 4
  conceptoRow({
    centro: 'ADMINISTRACION', importe: 100000, nro: '1010', concepto: 'Sueldo Básico',
    cdNombre: 'SUELDOS (INCLUYE REDONDEO) ' + XSS_PAYLOAD, cd: '521101',
    chNombre: 'SUELDOS A PAGAR', ch: '213111',
  }),
  conceptoRow({
    centro: 'ADMINISTRACION', importe: 5000, nro: '1011', concepto: 'Horas Extras ' + XSS_PAYLOAD,
    cdNombre: 'HORAS EXTRAS', cd: '521101.1', chNombre: 'SUELDOS A PAGAR', ch: '213111',
  }),
  conceptoRow({
    centro: 'PRODUCCION - M.O.D.', importe: 20000, nro: '1010', concepto: 'Sueldo Básico Planta',
    cdNombre: 'SUELDOS (INCLUYE REDONDEO)', cd: '521101', chNombre: 'CARGAS SOCIALES A PAGAR', ch: '213211',
  }),
  // cuenta Debe sin clasificar (código inventado) — se excluye ese lado y no cierra el asiento
  conceptoRow({
    centro: 'ADMINISTRACION', importe: 777, nro: '9999', concepto: 'Concepto raro',
    cdNombre: 'CUENTA INVENTADA', cd: '999999', chNombre: 'SUELDOS A PAGAR', ch: '213111',
  }),
  // centro de costo sin clasificar (nombre inventado)
  conceptoRow({
    centro: 'CENTRO_INVENTADO', importe: 555, nro: '9998', concepto: 'Concepto centro raro',
    cdNombre: 'SUELDOS (INCLUYE REDONDEO)', cd: '521101', chNombre: 'SUELDOS A PAGAR', ch: '213111',
  }),
  // excluida sin aviso: cuenta Debe == cuenta Haber (concepto base/informativo de Meta4)
  conceptoRow({
    centro: 'ADMINISTRACION', importe: 12345, nro: '9000', concepto: 'BASEEXT',
    cdNombre: 'BASE', cd: '888888', chNombre: 'BASE', ch: '888888',
  }),
  // excluida sin aviso: ambos códigos vacíos
  conceptoRow({
    centro: 'ADMINISTRACION', importe: 1, nro: '9001', concepto: 'Vacia',
    cdNombre: null, cd: null, chNombre: null, ch: null,
  }),
];

function buildXlsxBuffer(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CONCEPTOS');
  return Buffer.from(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
}

const conceptosBuffer = buildXlsxBuffer(aoa);

test('Asiento de Remuneraciones FINADIET: procesa, avisa lo no clasificado y exporta 3 solapas', async ({ page }, testInfo) => {
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });

  await page.goto('/reportes/finadiet-asiento-remuneraciones.html');

  await page.fill('#inMes', 'JULIO 2026');
  await page.fill('#inFecha', '2026-08-01');
  await page.locator('#fileInput').setInputFiles({
    name: 'FINADIET CONCEPTOS.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: conceptosBuffer,
  });
  await page.click('#btnProcesar');
  await expect(page.locator('#results')).toBeVisible();

  // ── KPIs: Debe = 125.000 (sólo Resultado matcheado), Haber = 126.332
  // (Patrimonial matcheado, incluye las dos filas con lado Debe descartado) ──
  await expect(page.locator('#kpiDebe')).toContainText('125.000,00');
  await expect(page.locator('#kpiHaber')).toContainText('126.332,00');
  await expect(page.locator('#kpiDif')).toContainText('1.332,00');
  await expect(page.locator('#kpiDif')).toHaveClass(/c-error/);
  await expect(page.locator('#kpiExcl')).toHaveText('2'); // BASEEXT (iguales) + fila vacía

  // ── Avisos: no cierra, y lista la cuenta y el centro sin clasificar ──
  await expect(page.locator('#warnBanner')).toContainText('no cierra');
  await expect(page.locator('#errBanner')).toContainText('999999');
  await expect(page.locator('#errBanner')).toContainText('CENTRO_INVENTADO');

  // ── Solapa ASIENTO: dos conceptos de la cuenta 521101 en ADMINISTRACION se
  // consolidan en una sola línea de la cuenta 400.521101 ──────────────────
  const t1Rows = page.locator('#tablaBody tr');
  await expect(t1Rows.filter({ hasText: 'ADMINISTRACION' })).toBeVisible();
  await expect(t1Rows.filter({ hasText: '400.521101' }).first()).toContainText('100.000,00');
  await expect(t1Rows.filter({ hasText: '441.521101' })).toContainText('20.000,00');

  // ── El nombre de cuenta con payload no ejecuta nada y se ve como texto ──
  const cdRow = t1Rows.filter({ hasText: '400.521101' }).first();
  await expect(cdRow).toContainText('<img src=x');
  expect(await cdRow.locator('img').count()).toBe(0);

  // ── Solapa "Ctas Cbles CENTRO COSTO": el concepto con payload también se
  // escapa (viene de la columna Concepto, no de Cuenta Debe/Haber) ──
  await page.click('.tabbtn[data-tab="t2"]');
  const t2Rows = page.locator('#tablaBody tr');
  const horasExtrasRow = t2Rows.filter({ hasText: '400.521101.1' });
  await expect(horasExtrasRow).toContainText('<img src=x');
  expect(await horasExtrasRow.locator('img').count()).toBe(0);

  expect(dialogs).toEqual([]);
  expect(await page.evaluate(() => window.__xssFired)).toBeUndefined();

  // ── Exportar el excel final y verificar las 3 solapas ──
  const downloadPromise = page.waitForEvent('download');
  await page.click('#btnExport');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('FINADIET_Asiento_Remuneraciones_JULIO_2026.xlsx');

  const exportPath = testInfo.outputPath('asiento-descargado.xlsx');
  await download.saveAs(exportPath);
  const wb = XLSX.read(readFileSync(exportPath));
  expect(wb.SheetNames).toEqual(['ASIENTO', 'Ctas Cbles CENTRO COSTO', 'Cuentas Contables GRAL']);

  const asientoAoa = XLSX.utils.sheet_to_json(wb.Sheets['ASIENTO'], { header: 1, raw: true, defval: null });
  const totalRow = asientoAoa.find((r) => r && r[0] === 'TOTAL');
  expect(totalRow[4]).toBeCloseTo(125000, 2);
  expect(totalRow[5]).toBeCloseTo(126332, 2);

  const generalAoa = XLSX.utils.sheet_to_json(wb.Sheets['Cuentas Contables GRAL'], { header: 1, raw: true, defval: null });
  // en "Cuentas Contables GRAL" la cuenta va sin prefijo de centro de costo / "100"
  expect(generalAoa.some((r) => r[0] === '521101')).toBe(true);
  expect(generalAoa.some((r) => r[0] === '213111')).toBe(true);
});
