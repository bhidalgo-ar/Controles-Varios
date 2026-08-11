// backup.spec.js — Prueba de extremo a extremo de T1 (respaldo local).
// Abre la app en un navegador real (Chromium), crea un cliente, exporta el
// respaldo, borra el cliente, lo restaura, y verifica que vuelve igual.
// Corre en CI vía `npm run test:e2e` (ver playwright.config.js).

import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('exportar e importar el respaldo preserva los clientes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#js-new-client-btn')).toBeVisible();

  // Crear un cliente
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', 'Cliente E2E');
  await page.fill('#js-client-notes', 'Creado por el test de extremo a extremo');
  await page.click('#js-confirm-create');
  await expect(page.locator('.home-table__row')).toContainText('Cliente E2E');

  // Exportar el respaldo
  const downloadPromise = page.waitForEvent('download');
  await page.click('#js-backup-export-btn');
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  // Borrar el cliente de verdad (simula haber perdido los datos). "Ocultar"
  // por sí solo no alcanza: a propósito no borra nada — el borrado real vive
  // detrás del panel "Clientes ocultos" y pide tipear el nombre para confirmar.
  await page.click('.js-menu-btn');
  await page.click('.js-hide-btn');
  await page.click('#js-confirm-ok');

  await page.click('#js-hidden-clients-btn');
  await page.click('.js-hard-delete-btn');
  await page.fill('#js-confirm-typed', 'Cliente E2E');
  await page.click('#js-confirm-ok');
  await page.click('#js-close-hidden-modal');
  await expect(page.locator('#js-first-client-btn')).toBeVisible();

  // Restaurar el respaldo
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('#js-backup-import-btn');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(backupPath);

  // Confirmar el diálogo de advertencia ("esto reemplaza todos los datos...")
  await expect(page.locator('.modal__footer')).toBeVisible();
  await page.click('#js-confirm-ok');

  // La app recarga sola después de restaurar
  await page.waitForLoadState('load');
  await expect(page.locator('.home-table__row')).toContainText('Cliente E2E', { timeout: 10000 });
});

test('restaurar un archivo que no es un respaldo válido muestra un error y no borra nada', async ({ page }) => {
  await page.goto('/');
  await page.locator('#js-first-client-btn, #js-new-client-btn').first().click();
  await page.fill('#js-client-name', 'Cliente Intacto');
  await page.click('#js-confirm-create');
  await expect(page.locator('.home-table__row')).toContainText('Cliente Intacto');

  const bogusPath = test.info().outputPath('no-es-un-respaldo.json');
  await writeFile(bogusPath, JSON.stringify({ hola: 'no soy un respaldo' }));

  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click('#js-backup-import-btn');
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(bogusPath);
  await page.click('#js-confirm-ok');

  await expect(page.locator('.toast--danger')).toBeVisible();
  // El cliente original sigue ahí: el intento fallido no dejó la base a medio reemplazar.
  await expect(page.locator('.home-table__row')).toContainText('Cliente Intacto');
});
