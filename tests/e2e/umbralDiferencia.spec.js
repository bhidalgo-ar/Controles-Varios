// umbralDiferencia.spec.js — El monto de diferencia en el navegador (D-069).
//
// Lo que cubre y los unitarios no: que el número que el analista escribe en el
// panel "Umbrales" se guarde en el cliente y siga ahí en la próxima corrida.
// Hasta el 2026-08-19 ese panel mostraba un "$ 1,00" escrito a mano que no se
// podía editar y que ningún control leía.
//
// Datos 100% inventados.

import { test, expect } from '@playwright/test';

async function crearCliente(page, nombre, code) {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', nombre);
  await page.locator('details', { has: page.locator('#js-client-code') }).locator('summary').click();
  await page.fill('#js-client-code', code);
  await page.click('#js-confirm-create');
  await expect(page.locator('.home-table__row', { hasText: nombre })).toBeVisible();
}

async function irAlPasoDeArchivos(page, nombre) {
  await page.locator('.home-table__row', { hasText: nombre }).locator('.js-run-btn').click();
  await page.locator('#js-control-rows [data-ctrl="control_netos"]').click();
  await page.locator('#js-next-btn').click();
  await expect(page.locator('#js-diff-tolerance')).toBeVisible();
}

test('el monto de diferencia se edita en el panel y queda guardado en el cliente', async ({ page }) => {
  await crearCliente(page, 'Umbral E2E', 'SPORTLINE');
  await irAlPasoDeArchivos(page, 'Umbral E2E');

  const campo = page.locator('#js-diff-tolerance');
  await expect(campo).toHaveValue('0,01');
  await expect(page.locator('.wizard-onepane__side')).toContainText('Diferencia a partir de');
  await expect(page.locator('.wizard-onepane__side'))
    .toContainText('no se marca ni se cuenta, en ninguno de los controles');

  // El Control de Netos mide con el suyo: el panel lo dice, con el número.
  await expect(page.locator('.wizard-onepane__side')).toContainText('Control de Netos');
  await expect(page.locator('.wizard-onepane__side')).toContainText('mide con el suyo');

  await campo.fill('100');
  await campo.blur();
  await expect(page.locator('.toast')).toContainText('$ 100,00');

  // Vuelve a entrar al wizard desde cero: el monto quedó en el cliente.
  await page.goto('/');
  await irAlPasoDeArchivos(page, 'Umbral E2E');
  await expect(page.locator('#js-diff-tolerance')).toHaveValue('100,00');
});

test('un monto inválido no apaga los avisos: vuelve al piso de $ 0,01', async ({ page }) => {
  await crearCliente(page, 'Umbral Cero E2E', 'SPORTLINE');
  await irAlPasoDeArchivos(page, 'Umbral Cero E2E');

  const campo = page.locator('#js-diff-tolerance');
  await campo.fill('0');
  await campo.blur();
  await expect(campo).toHaveValue('0,01');

  await campo.fill('cualquier cosa');
  await campo.blur();
  await expect(campo).toHaveValue('0,01');
});
