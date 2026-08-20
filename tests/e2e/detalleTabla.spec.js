// detalleTabla.spec.js — La solapa Detalle de un control en un navegador real
// (rediseño, pantalla 7 de docs/rediseno/README.md; screenshots 03 y 19).
//
// Lo que fija, en orden de qué cuesta más caro si se rompe:
//   1. **El TOTAL de abajo es el de lo que se está mirando.** Hasta acá el
//      filtro sólo escondía filas: quedaba el total de los 514 legajos abajo de
//      una tabla que mostraba uno. Un número que no cierra con nada de lo que
//      se ve es peor que no mostrarlo.
//   2. El filtro "sólo con diferencia" arranca activo cuando hay diferencias, y
//      se dice por qué (si no, el analista cree que está viendo toda la tabla).
//   3. Δ como badge de error y la ausencia como badge warn: `null` no es 0, y
//      "no se pudo comparar" tiene que verse distinto de "dio cero".
//   4. El encabezado de dos niveles: cada grupo de columnas con su tinte, y la
//      2ª fila pegada DEBAJO de la 1ª (con las dos en top:0 se tapaban).
//
// Corre sobre un fixture (monta el render real del control con datos
// inventados, sin IndexedDB) — mismo patrón que gridHeaderContrast.spec.js.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/detalleTabla.html';

/** La fila de TOTAL, celda por celda. */
async function totalCells(page) {
  return page.locator('table.rb-grid tfoot tr').first().locator('td, th').allTextContents();
}

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.click('text=Detalle');
  await expect(page.locator('table.rb-grid')).toBeVisible();
});

test('el filtro arranca en "con diferencia" y lo explica', async ({ page }) => {
  // El control sigue decidiendo el filtro con su <select> de siempre.
  await expect(page.locator('.results-toolbar select')).toHaveValue('dif');

  const activo = page.locator('.results-chip--active');
  await expect(activo).toHaveText(/Sólo con diferencia/);
  // El tono del chip sale de su <option> (`data-tone`); sin declararlo, un
  // filtro de diferencias se pinta igual con el color de error.
  await expect(activo).toHaveClass(/results-chip--error/);
  await expect(page.locator('.results-toolbar__hint')).toContainText('arrancó activo');

  await expect(page.locator('table.rb-grid tbody tr')).toHaveCount(2);
});

test('el TOTAL de abajo muestra el total de la selección, no el global', async ({ page }) => {
  // Sin buscar: los dos legajos con diferencia (lo que el filtro dejó).
  let celdas = await totalCells(page);
  expect(celdas[0]).toContain('TOTAL');
  expect(celdas[1]).toBe('3.300.518,25');   // 1.800.000,00 + 1.500.518,25

  // Al buscar un legajo, el total baja a ese legajo — y la etiqueta lo dice.
  await page.locator('.table-search__input').fill('826');
  await page.locator('.table-search__input').press('Enter');
  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(1);

  celdas = await totalCells(page);
  expect(celdas[0]).toContain('TOTAL de la selección');
  expect(celdas[0]).toContain('1 legajo');
  expect(celdas[1]).toBe('1.800.000,00');
  expect(celdas[2]).toBe('1.785.000,00');
  expect(celdas[3]).toBe('-15.000,00');

  // Y al limpiar la búsqueda vuelve el total de las filas del filtro.
  await page.locator('.table-search__clear').click();
  celdas = await totalCells(page);
  expect(celdas[1]).toBe('3.300.518,25');
});

test('los KPIs cuentan filas y diferencias de la tabla que se está mirando', async ({ page }) => {
  await expect(page.locator('.results-toolbar__kpis')).toContainText('2 filas');
  await expect(page.locator('.results-kpi__badge--error')).toHaveText('2 con diferencias');

  await page.locator('.table-search__input').fill('826');
  await page.locator('.table-search__input').press('Enter');
  await expect(page.locator('.results-toolbar__kpis')).toContainText('1 de 2 filas');
});

test('Δ sale como badge de error, y lo que no se pudo comparar como aviso', async ({ page }) => {
  await expect(page.locator('.rb-diffbadge--error').first()).toHaveText('-15.000,00');

  // "Todos los evaluados" trae el legajo que está sólo en Brutos.
  await page.selectOption('.results-toolbar select', 'all');
  await expect(page.locator('table.rb-grid tbody tr')).toHaveCount(4);

  const sinComparar = page.locator('.rb-diffbadge--warn');
  await expect(sinComparar.first()).toHaveText('sin comparar');
  // Los dos conceptos del legajo sin par, y ningún otro: un 0,00 real no es esto.
  await expect(sinComparar).toHaveCount(2);
  await expect(page.locator('.rb-diffzero').first()).toHaveText('0,00');

  // Los chips siguen al select aunque el cambio no venga de un chip.
  await expect(page.locator('.results-chip--active')).toHaveText(/Todos los evaluados/);
});

test('el encabezado de dos niveles se pega escalonado y cada grupo tiene su tinte', async ({ page }) => {
  const grupos = page.locator('table.rb-grid thead tr:first-child th[colspan]');
  await expect(grupos).toHaveCount(2);
  await expect(grupos.nth(0)).toHaveClass(/rb-grid__grp--a/);
  await expect(grupos.nth(1)).toHaveClass(/rb-grid__grp--b/);

  // Los dos grupos se distinguen: celeste dim y navy dim, nunca el mismo color.
  const [fondoA, fondoB] = await grupos.evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor));
  expect(fondoA).not.toBe(fondoB);

  // La 2ª fila del encabezado se pega DEBAJO de la 1ª, no encima.
  const top2 = await page.locator('table.rb-grid thead tr:nth-child(2) th').first()
    .evaluate(el => getComputedStyle(el).top);
  expect(parseFloat(top2)).toBeGreaterThan(0);

  // El tinte alcanza a las celdas de datos del grupo (lo pinta el sistema, no
  // un hex inline de cada control).
  const celda = page.locator('table.rb-grid tbody tr').first().locator('td').nth(2);
  await expect(celda).toHaveClass(/rb-grid__grp--a/);
  expect(await celda.evaluate(el => el.style.background)).toBe('');
});

test('el buscador dice por qué se puede buscar', async ({ page }) => {
  await expect(page.locator('.table-search__input')).toHaveAttribute('placeholder', 'Buscá por legajo o nombre…');
});
