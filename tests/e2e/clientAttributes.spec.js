// clientAttributes.spec.js — Prueba de extremo a extremo de T2 (code y
// atributos de cliente). Crea un cliente con los campos nuevos del
// formulario y verifica que la lista los muestre.

import { test, expect } from '@playwright/test';

test('crear un cliente con sistema de origen, equipo y CCTs los muestra en la lista', async ({ page }) => {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();

  await page.fill('#js-client-name', 'Cliente Axton E2E');
  await page.click('#js-create-client-form details summary'); // despliega "Más datos del cliente"
  await page.selectOption('#js-client-source-system', 'axton');
  await page.fill('#js-client-team', 'EQ_CANDELA');
  await page.fill('#js-client-ccts', 'Comercio, Camioneros');
  await page.fill('#js-client-pays', '120');
  await page.check('#js-client-attr-pluriempleo');
  await page.click('#js-confirm-create');

  const row = page.locator('.home-table__row', { hasText: 'Cliente Axton E2E' });
  await expect(row).toContainText('Axton');
  await expect(row).toContainText('EQ_CANDELA');
  await expect(row).toContainText('Comercio');
});

test('dos clientes con el mismo nombre no chocan (quedan como filas separadas)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', 'Cliente Duplicado');
  await page.click('#js-confirm-create');
  await expect(page.locator('.home-table__row')).toHaveCount(1);

  await page.click('#js-new-client-btn');
  await page.fill('#js-client-name', 'Cliente Duplicado');
  await page.click('#js-confirm-create');
  await expect(page.locator('.home-table__row')).toHaveCount(2);
});
