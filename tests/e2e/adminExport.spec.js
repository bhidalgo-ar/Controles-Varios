// adminExport.spec.js — Prueba de extremo a extremo de T6 (modo admin + export
// del seed). Simula DOS navegadores distintos (dos BrowserContext de
// Playwright, con storage totalmente separado):
//
//   Navegador A: importa el seed de prueba, entra a modo admin, cambia el
//   sistema de origen de ACME (Meta4 → Axton) y exporta el seed actualizado.
//
//   Navegador B: ya tiene el seed de prueba importado (con ACME en Meta4) Y
//   un cliente propio creado a mano (que no viene de ningún seed). Importa
//   el archivo exportado por A y confirma dos cosas: el cambio de A llegó
//   (ACME ahora figura como Axton), y su cliente local no se perdió.
//
// La contraseña de abajo es la que se generó al implementar T6 (Guillermo
// no llegó a elegir una propia) — puede rotarla cambiando el hash en
// js/ui/adminView.js.
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const ADMIN_PASSWORD = 'KjZiorNwZ8hyfS';

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
      { code: 'ACME', name: 'Acme Demo SA', team: 'EQ_TEST', consultant: 'Alguien', pays: 50, ccts: ['Comercio'], entityCount: 1, sourceSystem: 'meta4', active: true, attributes: {} },
    ],
    controlConfigs: [],
    catalogs: [],
  };
}

async function importSeedFile(page, path) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('#js-seed-import-btn');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(path);
  await expect(page.locator('.modal__footer')).toBeVisible();
  await page.click('#js-confirm-ok');
  await expect(page.locator('.toast--success')).toBeVisible();
}

test('editar y exportar desde admin en un navegador llega a otro sin perder sus datos locales', async ({ page, browser }, testInfo) => {
  const seedPath = testInfo.outputPath('test-seed.json');
  await writeFile(seedPath, JSON.stringify(testSeed()));

  // ── Navegador A ──────────────────────────────────────────────────────────
  await page.goto('/');
  await importSeedFile(page, seedPath);
  await expect(page.locator('.home-table__row', { hasText: 'Acme Demo SA' })).toContainText('M4');

  await page.goto('/#/admin');
  await page.fill('#js-admin-password', ADMIN_PASSWORD);
  await page.click('#js-admin-password-form button[type="submit"]');
  await expect(page.locator('#js-admin-client-select')).toBeVisible();

  await page.selectOption('#js-admin-client-select', { label: 'Acme Demo SA (ACME)' });
  await page.selectOption('#js-admin-source-system', 'axton');
  await page.click('#js-admin-save-client-btn');
  await expect(page.locator('.toast--success')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.click('#js-admin-export-btn');
  const download = await downloadPromise;
  const exportedPath = testInfo.outputPath('exported-seed.json');
  await download.saveAs(exportedPath);

  // ── Navegador B (storage completamente separado) ────────────────────────
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();

  await pageB.goto('/');
  await importSeedFile(pageB, seedPath);
  await expect(pageB.locator('.home-table__row', { hasText: 'Acme Demo SA' })).toContainText('M4');

  // Dato propio de este navegador, que ningún seed trae — tiene que sobrevivir.
  await pageB.click('#js-new-client-btn');
  await pageB.fill('#js-client-name', 'Cliente Local De B');
  await pageB.click('#js-confirm-create');
  await expect(pageB.locator('.home-table__row', { hasText: 'Cliente Local De B' })).toBeVisible();

  await importSeedFile(pageB, exportedPath);

  await expect(pageB.locator('.home-table__row', { hasText: 'Acme Demo SA' })).toContainText('Axton');
  await expect(pageB.locator('.home-table__row', { hasText: 'Cliente Local De B' })).toBeVisible();
  await expect(pageB.locator('.home-table__row')).toHaveCount(2);

  await contextB.close();
});

test('una contraseña incorrecta no entra al modo admin', async ({ page }) => {
  await page.goto('/#/admin');
  await page.fill('#js-admin-password', 'contraseña-incorrecta');
  await page.click('#js-admin-password-form button[type="submit"]');
  await expect(page.locator('.toast--danger')).toBeVisible();
  await expect(page.locator('#js-admin-client-select')).not.toBeVisible();
});
