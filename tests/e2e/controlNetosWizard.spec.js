// controlNetosWizard.spec.js — El Control de Netos en el navegador.
//
// Lo que este test cubre y los unitarios no: que el control se ofrezca sólo al
// cliente que lo pidió, y que sus tres casilleros de archivo se rotulen distinto
// (los tres Tabulados se distinguen por la etiqueta del TIPO — si compartieran
// uno, los tres dirían lo mismo y el analista no sabría cuál es cuál).

import { test, expect } from '@playwright/test';

/**
 * Crea un cliente con un `code` fijo.
 *
 * El campo del código vive dentro del desplegable "Más datos del cliente", que
 * arranca cerrado: hay que abrirlo antes de escribir. Un `fill()` sobre un campo
 * oculto no falla — **espera** hasta agotar el timeout del test, así que sin este
 * click el test no falla por lo que mide, se cuelga.
 */
async function crearCliente(page, nombre, code) {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', nombre);
  await page.locator('details', { has: page.locator('#js-client-code') }).locator('summary').click();
  await page.fill('#js-client-code', code);
  await page.click('#js-confirm-create');
  await expect(page.locator('.home-table__row', { hasText: nombre })).toBeVisible();
}

test('el Control de Netos se ofrece a Sportline y no a otro cliente', async ({ page }) => {
  await crearCliente(page, 'Sportline E2E', 'SPORTLINE');
  await page.locator('.home-table__row', { hasText: 'Sportline E2E' }).locator('.js-run-btn').click();
  await expect(page.locator('#js-control-rows [data-ctrl="control_netos"]')).toBeVisible();

  await crearCliente(page, 'Otro Cliente E2E', 'OTROE2E');
  await page.locator('.home-table__row', { hasText: 'Otro Cliente E2E' }).locator('.js-run-btn').click();
  await expect(page.locator('#js-control-rows [data-ctrl="control_netos"]')).toHaveCount(0);
});

test('los tres casilleros de Tabulado se distinguen entre sí', async ({ page }) => {
  await crearCliente(page, 'Sportline Slots E2E', 'SPORTLINE');
  await page.locator('.home-table__row', { hasText: 'Sportline Slots E2E' }).locator('.js-run-btn').click();

  // El aparte "Archivos que te va a pedir" del Paso 1 ya lista los casilleros del
  // control seleccionado: alcanza para verificar que los tres Tabulados se
  // rotulan distinto, sin depender de cómo esté armado el Paso 2.
  await page.locator('#js-control-rows [data-ctrl="control_netos"]').click();

  const side = page.locator('.control-recap-pills');
  await expect(side).toContainText('Escala salarial del convenio de Comercio');
  await expect(side).toContainText('segunda empresa');
  await expect(side).toContainText('tercera empresa');
});
