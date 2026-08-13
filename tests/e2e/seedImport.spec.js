// seedImport.spec.js — Prueba de extremo a extremo de T3 (import del seed).
// El seed de prueba se arma en memoria y se escribe a un archivo temporal
// (el seed real vive fuera del repo, ver DECISIONS.md D-010 — no hay
// ejemplo commiteado, D-012).

import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

function testSeed(overrides = {}) {
  return {
    schemaVersion: 1,
    configVersion: 1,
    updatedAt: '2026-07-30',
    updatedBy: 'test',
    sourceSystems: [{ id: 'meta4', label: 'Meta4' }, { id: 'axton', label: 'Axton' }],
    teams: [{ code: 'EQ_TEST', lead: 'Alguien' }],
    consultants: [{ name: 'Alguien' }],
    clients: [
      { code: 'ACME', name: 'Acme Demo SA', team: 'EQ_TEST', consultant: 'Alguien', complexity: 2, pays: 50, ccts: ['Comercio'], entityCount: 1, sourceSystem: 'meta4', active: true, attributes: {} },
      { code: 'DEMOCORP', name: 'Demo Corp SRL', team: 'EQ_TEST', consultant: 'Alguien', complexity: 3, pays: 200, ccts: ['Camioneros'], entityCount: 2, sourceSystem: 'axton', active: true, attributes: { paymentUsd: true } },
    ],
    controlConfigs: [],
    catalogs: [],
    ...overrides,
  };
}

async function writeTestSeed(testInfo, overrides = {}) {
  const path = testInfo.outputPath('test-seed.json');
  await writeFile(path, JSON.stringify(testSeed(overrides)));
  return path;
}

test('importar un seed de prueba crea los clientes y muestra la versión', async ({ page }, testInfo) => {
  const seedPath = await writeTestSeed(testInfo);

  await page.goto('/');
  await expect(page.locator('#js-seed-version')).toHaveText('Sin seed importado');

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('#js-data-menu-btn');
  await page.click('#js-seed-import-btn');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(seedPath);

  await expect(page.locator('.modal__footer')).toBeVisible();
  await page.click('#js-confirm-ok');

  await expect(page.locator('.home-table__row')).toHaveCount(2);
  await expect(page.locator('.home-table__row', { hasText: 'Acme Demo SA' })).toBeVisible();
  await expect(page.locator('.home-table__row', { hasText: 'Demo Corp SRL' })).toContainText('Axton');
  await expect(page.locator('#js-seed-version')).toContainText('Seed v1');
});

test('importar el mismo seed dos veces no duplica clientes', async ({ page }, testInfo) => {
  const seedPath = await writeTestSeed(testInfo);

  await page.goto('/');

  for (let i = 0; i < 2; i++) {
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('#js-data-menu-btn');
    await page.click('#js-seed-import-btn');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(seedPath);
    await expect(page.locator('.modal__footer')).toBeVisible();
    await page.click('#js-confirm-ok');
    // El aviso del import anterior sigue en pantalla (dura 4,5 s y las dos
    // importaciones pasan mucho más rápido), así que se busca el de ESTA
    // vuelta: la primera crea los 2 clientes y la segunda no crea ninguno.
    const esperado = i === 0 ? '2 clientes nuevos' : '0 clientes nuevos';
    await expect(page.locator('.toast--success').filter({ hasText: esperado })).toBeVisible();
  }

  await expect(page.locator('.home-table__row')).toHaveCount(2);
});
