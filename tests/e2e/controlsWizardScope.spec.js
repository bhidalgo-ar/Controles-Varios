// controlsWizardScope.spec.js — Prueba de extremo a extremo de T4
// (appliesWhen/scope en el wizard de controles).
//
// Hoy ningún control real está restringido a un atributo puntual (T4 solo
// agrega el mecanismo, sin inventarle ataduras a los controles existentes
// — ver specs/plan-v2-t0-t6.md). Esta prueba confirma eso: el paso 1 del
// wizard sigue mostrando los mismos controles de siempre para cualquier
// cliente, y no aparece la sección "Otros controles".

import { test, expect } from '@playwright/test';

test('el paso 1 del wizard muestra todos los controles y no separa "otros" (nada restringe hoy)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', 'Cliente Wizard E2E');
  await page.click('#js-confirm-create');

  await page.locator('.home-table__row', { hasText: 'Cliente Wizard E2E' }).locator('.js-run-btn').click();
  await expect(page.locator('h3', { hasText: 'Paso 1 — Controles a ejecutar' })).toBeVisible();

  // Los controles standalone y los grupos (con su pill principal) siguen ahí.
  await expect(page.locator('#js-control-pills')).toContainText('EE x CATEG');
  await expect(page.locator('#js-control-pills')).toContainText('Brutos');
  await expect(page.locator('#js-control-pills')).toContainText('GS Pers');
  await expect(page.locator('#js-control-pills')).toContainText('Control NR');
  await expect(page.locator('#js-control-pills')).toContainText('Rendimiento vs Tabulado');
  await expect(page.locator('#js-control-pills')).toContainText('Rendimiento vs Asiento');
  await expect(page.locator('#js-control-pills')).toContainText('Rendimiento x EE');

  // Sin ningún control restringido hoy, no debería aparecer la sección "Otros".
  await expect(page.locator('summary', { hasText: 'Otros controles' })).toHaveCount(0);

  // Seleccionar un control standalone sigue funcionando igual que antes.
  await page.click('#js-control-pills button[data-ctrl="cat_x_empleados"]');
  await expect(page.locator('#js-control-pills button[data-ctrl="cat_x_empleados"]')).toHaveClass(/pill--active/);
});
