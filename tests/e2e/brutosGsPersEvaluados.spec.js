// brutosGsPersEvaluados.spec.js — El falso verde de Paso 5 (D-041), en un
// navegador real.
//
// Brutos y GS Pers consolidaban el Tabulado (Fase 1) pero, hasta esta ronda,
// la pantalla de resultados confundía dos cosas: "algún valor real en
// CUALQUIERA de los dos lados" (`relevantRows`, ya existía) con "los DOS lados
// tenían dato" (`unitsEvaluated`, nuevo). Si el archivo de Brutos/GS Pers
// nunca tuvo su columna mapeada pero el Tabulado sí tiene datos reales, el
// tile "Sin diferencia" contaba esos legajos como verificados — "0
// diferencias" leído como "todo bien" cuando en realidad no se comparó nada.
//
// Se testea sobre el fixture `brutosResults.html` (monta el render real del
// control con datos inventados, sin IndexedDB) — mismo patrón que
// `gridHeaderContrast.spec.js` para NR.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/brutosResults.html';

test('con las columnas del archivo sin mapear, "Sin diferencia" NO cuenta los legajos sin comparar', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=nada`);

  await expect(page.getByText('No se pudo comparar ningún legajo')).toBeVisible();

  const tiles = page.locator('.rb-tile');
  await expect(tiles.nth(0)).toContainText('Legajos evaluados');
  await expect(tiles.nth(0)).toContainText('0');
  await expect(tiles.nth(0)).toContainText('con dato de un solo lado');

  // El bug: antes de este fix, este tile decía "2" (relevantRows.length),
  // aunque el archivo nunca aportó ni un valor comparable.
  await expect(tiles.nth(1)).toContainText('Sin diferencia');
  await expect(tiles.nth(1)).toContainText('0');

  await expect(tiles.nth(3)).toContainText('sin datos para comparar');
  await expect(tiles.nth(4)).toContainText('sin datos para comparar');
});

test('con datos reales y coincidentes, los tiles siguen mostrando los legajos verificados', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=ok`);

  await expect(page.getByText('coinciden con el Tabulado en todos los legajos')).toBeVisible();

  const tiles = page.locator('.rb-tile');
  await expect(tiles.nth(0)).toContainText('Legajos evaluados');
  await expect(tiles.nth(0)).toContainText('2');
  await expect(tiles.nth(1)).toContainText('Sin diferencia');
  await expect(tiles.nth(1)).toContainText('2');
});
