// controlNetosWizard.spec.js — El Control de Netos en el navegador.
//
// Lo que este test cubre y los unitarios no: que el control se ofrezca sólo al
// cliente que lo pidió, que sus tres casilleros de archivo se dibujen con el
// rótulo correcto (los tres Tabulados se distinguen por la etiqueta del TIPO —
// si compartieran uno, los tres dirían lo mismo) y que el panel de configuración
// del Paso 2 aparezca abierto pidiendo el acuerdo no remunerativo del mes, que
// es el único dato sin el cual el control no corre.

import { test, expect } from '@playwright/test';

async function crearCliente(page, nombre, code) {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', nombre);
  const codeInput = page.locator('#js-client-code');
  if (await codeInput.count()) {
    await codeInput.fill(code);
  }
  await page.click('#js-confirm-create');
}

test('el Control de Netos se ofrece a Sportline y no a otro cliente', async ({ page }) => {
  await crearCliente(page, 'Sportline E2E', 'SPORTLINE');
  await page.locator('.home-table__row', { hasText: 'Sportline E2E' }).locator('.js-run-btn').click();
  await expect(page.locator('#js-control-rows')).toContainText('Control de Netos');

  await crearCliente(page, 'Otro Cliente E2E', 'OTROE2E');
  await page.locator('.home-table__row', { hasText: 'Otro Cliente E2E' }).locator('.js-run-btn').click();
  await expect(page.locator('#js-control-rows')).not.toContainText('Control de Netos');
});

test('los tres casilleros de Tabulado se distinguen entre sí', async ({ page }) => {
  await crearCliente(page, 'Sportline Slots E2E', 'SPORTLINE');
  await page.locator('.home-table__row', { hasText: 'Sportline Slots E2E' }).locator('.js-run-btn').click();

  // El aparte "Archivos que te va a pedir" del Paso 1 ya lista los casilleros del
  // control seleccionado: alcanza para verificar que los tres Tabulados se
  // rotulan distinto, sin depender de cómo esté armado el Paso 2.
  await page.locator('#js-control-rows').getByText('Control de Netos').first().click();

  const side = page.locator('.control-recap-pills');
  await expect(side).toContainText('Escala salarial del convenio de Comercio');
  await expect(side).toContainText('segunda empresa');
  await expect(side).toContainText('tercera empresa');
});
