// seedImport.spec.js — Prueba de extremo a extremo de T3 (import del seed).
// Usa config/hya-controles-config.example.json (2 clientes ficticios,
// committeado a propósito como referencia — el seed real vive fuera del
// repo, ver DECISIONS.md D-010) como archivo a importar.

import { test, expect } from '@playwright/test';

const EXAMPLE_SEED_PATH = 'config/hya-controles-config.example.json';

test('importar el seed de ejemplo crea los clientes y muestra la versión', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#js-seed-version')).toHaveText('Sin seed importado');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('#js-seed-import-btn');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(EXAMPLE_SEED_PATH);

  await expect(page.locator('.modal__footer')).toBeVisible();
  await page.click('#js-confirm-ok');

  await expect(page.locator('.home-table__row')).toHaveCount(2);
  await expect(page.locator('.home-table__row', { hasText: 'Acme Demo SA' })).toBeVisible();
  await expect(page.locator('.home-table__row', { hasText: 'Demo Corp SRL' })).toContainText('Axton');
  await expect(page.locator('#js-seed-version')).toContainText('Seed v1');
});

test('importar el mismo seed dos veces no duplica clientes', async ({ page }) => {
  await page.goto('/');

  for (let i = 0; i < 2; i++) {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#js-seed-import-btn');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(EXAMPLE_SEED_PATH);
    await expect(page.locator('.modal__footer')).toBeVisible();
    await page.click('#js-confirm-ok');
    await expect(page.locator('.toast--success')).toBeVisible();
  }

  await expect(page.locator('.home-table__row')).toHaveCount(2);
});
