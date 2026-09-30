// saldoVacaciones.spec.js — La pantalla de resultados del Saldo de vacaciones (COTY)
//
// Fixture con datos inventados (tests/e2e/fixtures/saldoVacaciones.html). Lo que
// se mira acá es lo que no se afirma leyendo el código: que el Resumen cuente los
// legajos de cada archivo y liste los avisos, que la Planilla muestre una fila
// por legajo en el orden del archivo y deje las celdas sin dato vacías (no en
// cero), que la barra sea la estándar y que no haya ningún error en consola.
// El .xlsx que se descarga se prueba en tests/saldoVacacionesControl.test.js.

import { test, expect } from '@playwright/test';

async function abrir(page) {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e.message)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/favicon/.test(m.location()?.url || '')) return;
    errores.push(m.text());
  });
  await page.goto('/tests/e2e/fixtures/saldoVacaciones.html');
  return errores;
}

test('el Resumen cuenta los legajos de cada archivo y lista los avisos', async ({ page }) => {
  const errores = await abrir(page);

  await expect(page.locator('.rb-verdict').first()).toContainText('Saldo de vacaciones Septiembre 2026: 5 legajos');
  const tiles = page.locator('.rb-tile');
  await expect(tiles).toHaveCount(5);
  await expect(tiles.nth(0)).toContainText('5');
  await expect(tiles.nth(2)).toContainText('Sólo en Vacaciones');
  await expect(tiles.nth(3)).toContainText('Sólo en Liquidaciones');

  const issues = page.locator('.rb-issue');
  await expect(issues).toHaveCount(3);
  await expect(page.locator('.rb-issues')).toContainText('Altas del mes');
  await expect(page.locator('.rb-issues')).toContainText('Bajas');
  await expect(page.locator('.rb-issues')).toContainText('Sin provisión en Liquidaciones');

  // Los cuatro chequeos contra el TOTAL GENERAL dan bien.
  await expect(page.locator('.rb-checks')).toContainText('800172');
  await expect(page.locator('.rb-checks')).toContainText('503310');
  expect(errores).toEqual([]);
});

test('la Planilla: una fila por legajo en orden, y lo que no existe queda vacío', async ({ page }) => {
  const errores = await abrir(page);
  await page.locator('[role="tab"]', { hasText: 'Planilla' }).first().click();

  const tabla = page.locator('table.rb-rubro:visible').first();
  await expect(tabla).toBeVisible();
  const filas = tabla.locator('tbody tr');
  await expect(filas).toHaveCount(5);

  const legajos = await filas.locator('td:first-child').allInnerTexts();
  expect(legajos.map(t => t.trim())).toEqual(['1', '2', '3', '4', '7']);

  // El legajo que sólo está en Liquidaciones no tiene alta, días ni saldo: "—", no 0,00.
  const soloLiq = filas.nth(2);
  await expect(soloLiq).toContainText('URZI AGUSTIN');
  await expect(soloLiq).toContainText('Baja: criterio a definir. No figura en el reporte de Vacaciones');
  const celdas = (await soloLiq.locator('td').allInnerTexts()).map(t => t.trim());
  expect(celdas[2]).toBe('—');   // FECHA_ALTA
  expect(celdas[4]).toBe('—');   // Saldo_vacaciones
  expect(celdas[6]).toBe('—');   // VAC_A_DIC

  // El que tiene dos filas en Liquidaciones sale sumado: 12,50 de saldo y 1.500,00 de provisión.
  await expect(filas.first()).toContainText('12,50');
  await expect(filas.first()).toContainText('1.500,00');

  await expect(tabla.locator('tfoot')).toContainText('5 legajos');
  expect(errores).toEqual([]);
});

test('la barra es la estándar y el ⬇ Exportar ▾ va último', async ({ page }) => {
  await abrir(page);
  await page.locator('[role="tab"]', { hasText: 'Planilla' }).first().click();

  const chips = page.locator('.results-chip:visible');
  await expect(chips).toHaveCount(5);
  const derecha = page.locator('.results-toolbar__right:visible').first();
  await expect(derecha.locator('> *').last()).toContainText('Exportar');

  await derecha.getByRole('button', { name: /Exportar/ }).click();
  await expect(page.locator('.row-menu__panel:visible')).toContainText('Saldo de vacaciones (.xlsx)');
  await expect(page.locator('.row-menu__panel:visible')).toContainText('Saldo vac 09-2026.xlsx');
});

for (const tema of ['sobrio', 'intenso', 'oscuro']) {
  test(`${tema}: el veredicto y la planilla se dibujan`, async ({ page }) => {
    const errores = await abrir(page);
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);
    await expect(page.locator('.rb-verdict').first()).toBeVisible();
    await page.locator('[role="tab"]', { hasText: 'Planilla' }).first().click();
    await expect(page.locator('table.rb-rubro:visible').first()).toBeVisible();
    expect(errores).toEqual([]);
  });
}
