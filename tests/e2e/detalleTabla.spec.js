// detalleTabla.spec.js — La solapa Planilla de un control en un navegador real
// (rediseño, pantalla 7 de docs/rediseno/README.md; screenshots 03 y 19), sobre
// Brutos. Los cinco chips y el orden de la barra se miran en las diez pantallas
// del lote en loteMeta4.spec.js; acá se miran los NÚMEROS de una: el TOTAL de la
// selección, los KPIs y los badges, con importes concretos.
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
  await page.click('text=Planilla');
  await expect(page.locator('table.rb-grid')).toBeVisible();
});

test('el filtro arranca en "con diferencia" y lo explica', async ({ page }) => {
  // Los chips son la piel de un <select> real, que sigue siendo el único control
  // que ve el teclado y el lector de pantalla.
  await expect(page.locator('.results-toolbar select[data-chips]')).toHaveValue('conDif');

  const activo = page.locator('.results-chip--active');
  await expect(activo).toHaveText(/Con diferencia/);
  await expect(activo).toHaveClass(/results-chip--dif/);
  await expect(page.locator('.results-toolbar__hint')).toContainText('arrancó activo');

  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(2);
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
  // Cuatro legajos evaluados, dos con diferencia: el chip arranca en "Con
  // diferencia", así que se están mirando 2 de 4.
  await expect(page.locator('.results-toolbar__kpis')).toContainText('2 de 4 filas');
  await expect(page.locator('.results-kpi__badge--error')).toHaveText('2 con diferencias');

  await page.locator('.table-search__input').fill('826');
  await page.locator('.table-search__input').press('Enter');
  await expect(page.locator('.results-toolbar__kpis')).toContainText('1 de 4 filas');
});

test('Δ sale como badge de error, y lo que no se pudo comparar como aviso', async ({ page }) => {
  await expect(page.locator('.rb-diffbadge--error').first()).toHaveText('-15.000,00');

  // "Todos" trae el legajo que está sólo en Brutos.
  await page.selectOption('.results-toolbar select[data-chips]', 'todos');
  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(4);

  const sinComparar = page.locator('.rb-diffbadge--warn');
  await expect(sinComparar.first()).toHaveText('sin comparar');
  // Los dos conceptos del legajo sin par, y ningún otro: un 0,00 real no es esto.
  await expect(sinComparar).toHaveCount(2);
  await expect(page.locator('.rb-diffzero').first()).toHaveText('0,00');

  // Los chips siguen al select aunque el cambio no venga de un chip.
  await expect(page.locator('.results-chip--active')).toHaveText(/Todos/);
});

test('el encabezado de dos niveles se pega escalonado y cada grupo tiene su tinte', async ({ page }) => {
  // Tres bandas: Identificación (las dos columnas congeladas) y una por concepto.
  const bandas = page.locator('table.rb-grid thead tr.rb-rubro__bands th');
  await expect(bandas).toHaveCount(3);
  await expect(bandas.nth(1)).toHaveClass(/rb-grid__grp--a/);
  await expect(bandas.nth(2)).toHaveClass(/rb-grid__grp--b/);

  // La FILA DE BANDAS va entera sobre el mismo fondo oscuro (§5): lo que
  // distingue a un grupo del otro es el tinte de sus columnas, no el rótulo.
  const fondosBanda = await bandas.evaluateAll(
    els => [...new Set(els.map(el => getComputedStyle(el).backgroundColor))]);
  expect(fondosBanda).toHaveLength(1);

  // Y los dos grupos sí se distinguen en la fila de columnas: celeste dim y navy
  // dim, nunca el mismo color.
  const cols = page.locator('table.rb-grid thead tr:last-child th');
  const [fondoA, fondoB] = await Promise.all([
    cols.nth(2).evaluate(el => getComputedStyle(el).backgroundColor),
    cols.nth(5).evaluate(el => getComputedStyle(el).backgroundColor),
  ]);
  expect(fondoA).not.toBe(fondoB);

  // La 2ª fila del encabezado se pega DEBAJO de la 1ª, no encima.
  const top2 = await cols.first().evaluate(el => getComputedStyle(el).top);
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
