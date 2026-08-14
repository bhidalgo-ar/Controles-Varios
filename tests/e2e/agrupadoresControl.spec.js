// agrupadoresControl.spec.js — Prueba de extremo a extremo del control
// "Cruce por Agrupadores" (T9 de PLAN_v2.md — reemplaza el viejo wizard
// #/wizard/:clientId, retirado).
//
// Flujo: crear cliente → configurar un agrupador → desde #/controls/:clientId
// seleccionar "Cruce por Agrupadores" → cargar Nómina Maestra + Resumen (formato
// Largo) → ejecutar → ver el resultado en #/control-results/:runId.

import { test, expect } from '@playwright/test';
import * as XLSX from '../../node_modules/xlsx/xlsx.mjs';

/** Arma un ArrayBuffer .xlsx (Buffer para Playwright) a partir de un array de arrays. */
function buildXlsxBuffer(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1');
  return Buffer.from(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }));
}

// Nómina: legajo 2 tiene $2000 en el concepto 100; el Resumen trae $1900 → diferencia de $100.
const nominaBuffer = buildXlsxBuffer([
  ['Legajo', '100', '200'],
  ['1', 1000, 500],
  ['2', 2000, 300],
]);

const resumenBuffer = buildXlsxBuffer([
  ['Legajo', 'Concepto', 'Importe'],
  ['1', '100', 1000],
  ['1', '200', 500],
  ['2', '100', 1900],
  ['2', '200', 300],
]);

test('Cruce por Agrupadores: configurar un agrupador, cargar Nómina + Resumen y ejecutar', async ({ page }) => {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', 'Cliente Agrupadores E2E');
  await page.click('#js-confirm-create');

  const row = page.locator('.home-table__row', { hasText: 'Cliente Agrupadores E2E' });

  // ── Configurar un agrupador con el concepto 100 ────────────────────────────
  await row.locator('.js-menu-btn').click();
  await row.locator('.js-groupers-btn').click();
  await expect(page.locator('h2', { hasText: 'Agrupadores' })).toBeVisible();

  await page.click('#js-new-grouper-btn');
  await page.fill('#js-grouper-name', 'Sueldo');
  await page.click('.modal__footer #js-confirm');

  const grouperCard = page.locator('.card[data-grouper-id]');
  await grouperCard.locator('.js-concept-input').fill('100');
  await grouperCard.locator('.js-add-concept-btn').click();
  await expect(grouperCard).toContainText('100');

  // ── Volver al inicio y abrir el wizard de controles ────────────────────────
  await page.click('#js-back-btn');
  await row.locator('.js-run-btn').click();
  await expect(page.locator('h3', { hasText: 'Elegí los controles a correr' })).toBeVisible();

  await page.click('#js-control-rows button[data-ctrl="agrupadores"]');
  await page.click('#js-next-btn');
  await expect(page.locator('h3', { hasText: 'Cargá los archivos del control' })).toBeVisible();

  // ── Cargar Nómina Maestra ───────────────────────────────────────────────────
  // Cada archivo es un casillero de la grilla de arriba, y se reconoce por el
  // nombre del tipo que muestra adentro — antes lo anunciaba un <h4> aparte.
  const nominaSection = page.locator('.dz-grid__slot').filter({ hasText: 'Nómina Maestra' });
  await nominaSection.locator('input[type="file"]').setInputFiles({
    name: 'nomina.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: nominaBuffer,
  });
  await nominaSection.locator('select[name="legajoColumn"]').selectOption('Legajo');
  await nominaSection.locator('select[name="conceptColumnsStartAt"]').selectOption('100');
  await nominaSection.locator('button[type="submit"]').click();
  await expect(nominaSection).toContainText('nomina.xlsx');

  // ── Cargar Resumen (formato Largo) ─────────────────────────────────────────
  const resumenSection = page.locator('.dz-grid__slot').filter({ hasText: 'Resumen Largo Excel' });
  await resumenSection.locator('input[type="file"]').setInputFiles({
    name: 'resumen.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: resumenBuffer,
  });
  await resumenSection.locator('select[name="legajoColumnLong"]').selectOption('Legajo');
  await resumenSection.locator('select[name="conceptCodeColumn"]').selectOption('Concepto');
  await resumenSection.locator('select[name="importColumn"]').selectOption('Importe');
  await resumenSection.locator('button[type="submit"]').click();
  await expect(resumenSection).toContainText('resumen.xlsx');

  // El agrupador "Sueldo" viene seleccionado por default (todos los agrupadores del cliente).
  await expect(page.locator('#js-agrup-pills button', { hasText: 'Sueldo' })).toHaveClass(/pill--active/);

  // ── Ejecutar ────────────────────────────────────────────────────────────────
  await page.click('#js-next-btn');
  await expect(page.locator('h3', { hasText: 'Paso 3 — Período y ejecución' })).toBeVisible();
  await page.click('#js-execute-btn');

  // La corrida termina en la runbar y no navega sola: la tarjeta del control
  // queda en verde con su duración y "Ver resultados →" abre los resultados.
  await expect(page.locator('.run-card--done', { hasText: 'Cruce por Agrupadores' })).toBeVisible();
  await expect(page.locator('.runbar__title')).toContainText('Corrida completa en');
  await page.click('#js-run-results');

  await page.waitForURL(/#\/control-results\/\d+/);

  // Resultados abre en la solapa Resumen; las fichas por control viven en Detalle.
  await expect(page.locator('.results-ctrl-card', { hasText: 'Cruce por Agrupadores' })).toBeVisible();
  await page.click('.results-tab:has-text("Detalle")');

  const card = page.locator('.control-card[data-control-id="agrupadores"]');
  await expect(card).toBeVisible();
  await expect(card.locator('.control-card__name')).toHaveText('Cruce por Agrupadores');

  await card.locator('[data-ctrl-toggle]').click();
  await expect(card).toContainText('Totales por agrupador');
  await expect(card).toContainText('Sueldo');
  // La diferencia de $100 en el legajo 2 tiene que verse reflejada en el detalle.
  await expect(card).toContainText('100,00');
});
