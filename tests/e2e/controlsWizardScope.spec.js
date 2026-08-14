// controlsWizardScope.spec.js — Prueba de extremo a extremo de la
// segmentación de controles por cliente (ver specs/segmentacion-controles-por-cliente.md).
//
// Reemplaza la versión original de T4 (que confirmaba que nada cambiaba
// porque ningún control tenía scope real todavía). Ahora sí hay clasificación
// real: Marval ve los 10 controles de Meta4; un cliente nuevo no ve ninguno
// — "Cruce por Agrupadores" era el único control general, y desde 2026-08-14
// está `hidden` (Willy: pendiente hasta definir el archivo de Nómina Maestra
// estándar, ver js/controls/registry.js) — los demás ni siquiera aparecen
// (decisión de Guillermo: ocultar del todo, no una sección "Otros controles"
// colapsada).

import { test, expect } from '@playwright/test';

test('un cliente nuevo no ve ningún control — los que hay son de Marval o están pendientes', async ({ page }) => {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', 'Cliente Scope E2E');
  await page.click('#js-confirm-create');

  await page.locator('.home-table__row', { hasText: 'Cliente Scope E2E' }).locator('.js-run-btn').click();

  // Sin controles que ofrecer, el Paso 1 no llega a mostrarse: el aviso lo dice
  // directamente (ver renderStepControls en controlsWizard.js).
  await expect(page.locator('.alert', { hasText: 'Todavía no hay controles asignados' })).toBeVisible();
  await expect(page.locator('#js-control-rows')).toHaveCount(0);
});
