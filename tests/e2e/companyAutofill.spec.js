// companyAutofill.spec.js — Prueba de extremo a extremo del ajuste del
// 2026-07-30: escribir el nombre de una compañía conocida en el alta de
// cliente completa el resto de los datos automáticamente.
//
// Usa el seed real que hoy vive en la raíz del repo (hya-controles-config.seed.json,
// D-010) como fuente de compañías conocidas — es el mismo archivo que sirve
// tryLoadKnownCompanies() en producción. Cuando ese archivo se mude a
// SharePoint (D-010), este test hay que revisitarlo.

import { test, expect } from '@playwright/test';

test('escribir el nombre de una compañía conocida completa el resto de los campos', async ({ page }) => {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();

  await page.fill('#js-client-name', 'Siasa Logística');
  // El autocompletado dispara con el evento "input" — forzarlo por si el
  // fill no lo emite en todos los navegadores.
  await page.dispatchEvent('#js-client-name', 'input');

  await expect(page.locator('.toast--info')).toBeVisible();
  const detailsIsOpen = await page.locator('#js-create-client-form details').evaluate(el => el.open);
  expect(detailsIsOpen).toBe(true);

  await expect(page.locator('#js-client-code')).toHaveValue('SIASA');
  await expect(page.locator('#js-client-source-system')).toHaveValue('axton');
  await expect(page.locator('#js-client-team')).toHaveValue('EQ_CANDELA');
  await expect(page.locator('#js-client-consultant')).toHaveValue('Celeste');
  await expect(page.locator('#js-client-pays')).toHaveValue('130');

  const selectedCcts = await page.locator('#js-client-ccts').evaluate(
    (el) => Array.from(el.selectedOptions).map(o => o.value)
  );
  expect(selectedCcts.sort()).toEqual(['Camioneros', 'Carga y Descarga'].sort());

  await page.click('#js-confirm-create');
  const row = page.locator('.home-table__row', { hasText: 'Siasa Logística' });
  await expect(row).toContainText('Axton');
  await expect(row).toContainText('EQ_CANDELA');
});

test('un nombre que no coincide con ninguna compañía conocida no completa nada', async ({ page }) => {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();

  await page.fill('#js-client-name', 'Empresa Que No Existe En Ningún Lado SA');
  await page.click('#js-create-client-form details summary');
  await expect(page.locator('#js-client-code')).toHaveValue('');
  await expect(page.locator('#js-client-team')).toHaveValue('');

  await page.click('#js-confirm-create');
  await expect(page.locator('.home-table__row', { hasText: 'Empresa Que No Existe En Ningún Lado SA' })).toBeVisible();
});
