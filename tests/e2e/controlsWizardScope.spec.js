// controlsWizardScope.spec.js — Prueba de extremo a extremo de la
// segmentación de controles por cliente (ver specs/segmentacion-controles-por-cliente.md).
//
// Reemplaza la versión original de T4 (que confirmaba que nada cambiaba
// porque ningún control tenía scope real todavía). Ahora sí hay clasificación
// real: Marval ve los 11 controles; un cliente nuevo ve sólo "Cruce por
// Agrupadores" — los demás ni siquiera aparecen (decisión de Guillermo:
// ocultar del todo, no una sección "Otros controles" colapsada).

import { test, expect } from '@playwright/test';

test('un cliente nuevo sólo ve "Cruce por Agrupadores" — el resto son controles de Marval', async ({ page }) => {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', 'Cliente Scope E2E');
  await page.click('#js-confirm-create');

  await page.locator('.home-table__row', { hasText: 'Cliente Scope E2E' }).locator('.js-run-btn').click();
  await expect(page.locator('h3', { hasText: 'Elegí los controles a correr' })).toBeVisible();

  await expect(page.locator('#js-control-rows')).toContainText('Cruce por Agrupadores');
  await expect(page.locator('#js-control-rows button[data-ctrl="cat_x_empleados"]')).toHaveCount(0);
  await expect(page.locator('#js-control-rows button[data-ctrl="brutos"]')).toHaveCount(0);
  await expect(page.locator('#js-control-rows')).not.toContainText('Rendimiento vs Asiento');

  // Ya no existe la sección "Otros controles" (T4 la introdujo; esta tajada la retira).
  await expect(page.locator('summary', { hasText: 'Otros controles' })).toHaveCount(0);

  // La fila del único control disponible sigue funcionando igual que antes.
  await page.click('#js-control-rows button[data-ctrl="agrupadores"]');
  await expect(page.locator('#js-control-rows button[data-ctrl="agrupadores"]')).toHaveClass(/ctrl-row--active/);
});
