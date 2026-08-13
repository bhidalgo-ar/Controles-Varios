// clientAttributes.spec.js — Prueba de extremo a extremo de T2 (code y
// atributos de cliente) + del ajuste del 2026-07-30 (equipo/consultor/CCTs
// salen de un <select> con lo ya cargado, no de texto libre — así las
// respuestas quedan encerradas a lo que ya se conoce).
//
// Para que haya algo cargado de dónde elegir, primero se importa un seed de
// prueba armado en memoria (no hay ejemplo commiteado — D-012): trae el
// equipo EQ_TEST, el consultor "Alguien" y el CCT Comercio.

import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

function testSeed() {
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
    ],
    controlConfigs: [],
    catalogs: [],
  };
}

async function importTestSeed(page, testInfo) {
  const seedPath = testInfo.outputPath('test-seed.json');
  await writeFile(seedPath, JSON.stringify(testSeed()));

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('#js-data-menu-btn');
  await page.click('#js-seed-import-btn');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(seedPath);
  await expect(page.locator('.modal__footer')).toBeVisible();
  await page.click('#js-confirm-ok');
  await expect(page.locator('.toast--success')).toBeVisible();
}

test('el equipo/consultor/CCTs del alta de cliente salen de lo ya cargado (seed), no de texto libre', async ({ page }, testInfo) => {
  await page.goto('/');
  await importTestSeed(page, testInfo);

  await page.click('#js-new-client-btn');
  await page.fill('#js-client-name', 'Cliente Axton E2E');
  await page.click('#js-create-client-form details summary'); // despliega "Más datos del cliente"
  await page.selectOption('#js-client-source-system', 'axton');
  await page.selectOption('#js-client-team', 'EQ_TEST');
  await page.selectOption('#js-client-consultant', 'Alguien');
  await page.selectOption('#js-client-ccts', ['Comercio']);
  await page.fill('#js-client-pays', '120');
  await page.check('#js-client-attr-pluriempleo');
  await page.click('#js-confirm-create');

  const row = page.locator('.home-table__row', { hasText: 'Cliente Axton E2E' });
  await expect(row).toContainText('Axton');
  await expect(row).toContainText('EQ_TEST');
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
