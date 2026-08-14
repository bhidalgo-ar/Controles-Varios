// paso1Controles.spec.js — Los estados del Paso 1 (rediseño, pantalla 3 del
// handoff): la card de control con sus badges de archivos, la búsqueda con la
// coincidencia resaltada, el estado "sin resultados" con salida y el panel
// lateral "Vas a ejecutar".
//
// Un cliente nuevo veía un solo control ("Cruce por Agrupadores"), así que acá se
// probaba lo que se podía probar con uno: el resto de los estados (N ocultos por
// la búsqueda) vive en clientes con varios controles.
//
// PAUSADO (2026-08-14, Willy): "Cruce por Agrupadores" era el único control
// general y quedó `hidden` (pendiente hasta definir el archivo de Nómina
// Maestra estándar, ver js/controls/registry.js). Un cliente nuevo ya no ve
// ningún control, así que esta prueba no tiene sobre qué correr. Reactivar
// cuando el control se muestre de nuevo, o reescribir contra otro fixture
// (ej. un cliente Axton, que sí ve un control por scope de sistema).

import { test, expect } from '@playwright/test';

test.skip('Paso 1: card con badges de archivos, panel lateral y búsqueda con salida', async ({ page }) => {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', 'Cliente Paso1 E2E');
  await page.click('#js-confirm-create');

  await page.locator('.home-table__row', { hasText: 'Cliente Paso1 E2E' }).locator('.js-run-btn').click();
  await expect(page.locator('h3', { hasText: 'Elegí los controles a correr' })).toBeVisible();

  const card = page.locator('#js-control-rows button[data-ctrl="agrupadores"]');

  // Los archivos que va a pedir salen del registry: obligatorio + opcionales.
  await expect(card.locator('.ctrl-row__file', { hasText: 'Nómina Maestra' })).toBeVisible();
  await expect(card.locator('.ctrl-row__file--optional')).toHaveCount(2);
  // Descripción completa, sin truncar
  await expect(card.locator('.ctrl-row__desc')).toContainText('marcando las diferencias por legajo');

  // Sin selección el panel lateral lo dice y no muestra archivos.
  await expect(page.locator('.wizard-onepane__side')).toContainText('Vas a ejecutar (0)');
  await expect(page.locator('.wizard-onepane__side')).toContainText('Todavía nada');

  await card.click();
  await expect(card).toHaveClass(/ctrl-row--active/);
  await expect(page.locator('.wizard-onepane__side')).toContainText('Vas a ejecutar (1)');
  await expect(page.locator('.run-list__item')).toContainText('Cruce por Agrupadores');
  await expect(page.locator('.wizard-onepane__side .ctrl-row__file', { hasText: 'Nómina Maestra' })).toBeVisible();

  // Búsqueda que coincide: la parte que matchea queda resaltada.
  await page.fill('#js-ctrl-search', 'agrup');
  await expect(page.locator('#js-control-rows mark').first()).toBeVisible();

  // Búsqueda sin resultados: el estado vacío explica y ofrece la salida.
  await page.fill('#js-ctrl-search', 'brutox');
  await expect(page.locator('.ctrl-rows__empty')).toContainText('Ningún control coincide con «brutox»');
  await page.click('#js-ctrl-search-reset-empty');
  await expect(card).toBeVisible();

  // La ✕ del campo hace lo mismo.
  await page.fill('#js-ctrl-search', 'brutox');
  await page.click('#js-ctrl-search-clear');
  await expect(card).toBeVisible();
  await expect(page.locator('#js-ctrl-search')).toHaveValue('');
});
