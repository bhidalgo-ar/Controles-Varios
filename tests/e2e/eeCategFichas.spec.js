// eeCategFichas.spec.js — Las dos solapas que EE x CATEG suma a la vista
// estándar, en un navegador real: la **ficha por legajo** (§4 de
// specs/vista-estandar-resultados.md) y la matriz campo × legajo (**"Por
// campo"**, la nota del §8 para este control).
//
// Es el control distinto de los 21: no cruza importes, cruza CAMPOS de texto del
// reporte de Categorías contra el Tabulado. Lo que fija este archivo, en orden
// de qué cuesta más caro si se rompe:
//   1. **Un legajo, una ficha.** Hasta acá el detalle era una fila por campo que
//      no coincide: un legajo con tres campos mal aparecía tres veces y no se lo
//      podía ver entero.
//   2. **"Sin comparar" no se lee como cero.** El legajo que está en un archivo
//      y no en el otro no tiene 0 campos mal: no se sabe (D-073).
//   3. **La matriz contesta si el problema es de un empleado o de todos.** Un
//      campo que no coincide en 3 de 5 legajos no son 3 errores de carga.
//   4. Que la barra estándar siga siendo la misma en Fichas: los cinco chips,
//      con esas palabras, y el ⬇ Exportar ▾ último.
//
// Corre sobre el mismo fixture del lote Meta4 (datos inventados, jugadores de
// Banfield, sin IndexedDB ni wizard).

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/loteMeta4.html';

/** El panel de la solapa activa: las otras siguen en el DOM, ocultas. */
const panel = (page) => page.locator('.tabs__panel:not([hidden])');

async function abrir(page, solapa) {
  page.__errores = [];
  page.on('pageerror', e => page.__errores.push(String(e)));
  await page.goto(`${FIXTURE}?control=cat_x_empleados${solapa ? `&solapa=${encodeURIComponent(solapa)}` : ''}`);
  await expect(page.locator('[role="tab"]').first()).toBeVisible();
}

// ── Las solapas ─────────────────────────────────────────────────────────────

test('las cuatro solapas, con esos nombres y en ese orden', async ({ page }) => {
  await abrir(page);
  // Las tres del estándar más la matriz, que no es ninguna de las tres: no
  // lista casos ni totaliza importes, dice en qué campo falla más la nómina.
  await expect(page.locator('[role="tab"]')).toHaveText(
    ['Resumen', 'Fichas', 'Planilla', 'Por campo']);
  expect(page.__errores).toEqual([]);
});

test('con diferencias, la pantalla abre en Fichas', async ({ page }) => {
  await abrir(page);
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText('Fichas');
});

// ── La ficha ────────────────────────────────────────────────────────────────

test('hay una ficha por legajo, no una por campo que no coincide', async ({ page }) => {
  await abrir(page, 'fichas');
  await panel(page).locator('.results-chip', { hasText: 'Todos' }).click();
  // Cinco legajos con algo para revisar: cuatro con campos distintos —uno de
  // ellos con dos— y uno que está en un solo archivo.
  await expect(panel(page).locator('.ficha:visible')).toHaveCount(5);
});

test('la ficha cerrada dice el legajo, el nombre y cuántos campos no coinciden', async ({ page }) => {
  await abrir(page, 'fichas');
  const erviti = panel(page).locator('.ficha', { hasText: 'ERVITI WALTER' });
  await expect(erviti.locator('.ficha__avatar')).toHaveText('15');
  await expect(erviti.locator('.ficha__badge')).toHaveText('2 campos no coinciden');
  await expect(erviti.locator('.ficha__amount')).toHaveText('2');
  await expect(erviti.locator('.ficha__amount-label')).toHaveText('NO COINCIDEN');
});

test('abierta trae la tira de campos, el renglón por campo y la conclusión', async ({ page }) => {
  await abrir(page, 'fichas');
  const erviti = panel(page).locator('.ficha', { hasText: 'ERVITI WALTER' });
  await erviti.locator('summary').click();

  // La tira: 3 campos del cruce − 0 sin comparar = 3 comparados, − 1 que
  // coincide = 2 que no. La anteúltima invertida y el residuo en rojo.
  await expect(erviti.locator('.ficha-strip__pill')).toHaveCount(5);
  await expect(erviti.locator('.ficha-strip__pill--invert')).toContainText('Coinciden');
  await expect(erviti.locator('.ficha-strip__pill--residuo')).toContainText('No coinciden');
  await expect(erviti.locator('.ficha-strip__pill--residuo')).toContainText('2');

  // Un renglón por campo, con el valor de cada lado y el que difiere marcado.
  const filas = erviti.locator('.ficha-detail__grid tbody tr');
  await expect(filas).toHaveCount(3);
  await expect(erviti.locator('.ficha-detail__row--neg')).toHaveCount(2);
  await expect(erviti.locator('.ficha-detail__row--pos')).toHaveCount(1);
  await expect(filas.filter({ hasText: 'Departamento' })).toContainText('LEGALES');
  await expect(filas.filter({ hasText: 'Departamento' })).toContainText('FINANZAS');

  // Y la conclusión, que es lo que se va a hacer con eso.
  await expect(erviti.locator('.ficha-conclusion__title'))
    .toContainText('un campo de toda la nómina y uno de este empleado');
});

test('el legajo que está en un solo archivo no dice 0 campos mal: dice que no se sabe', async ({ page }) => {
  await abrir(page, 'fichas');
  await panel(page).locator('.results-chip', { hasText: 'Sin comparar' }).click();
  const silva = panel(page).locator('.ficha:visible');
  await expect(silva).toHaveCount(1);
  await expect(silva.locator('.ficha__amount')).toHaveText('—');
  await expect(silva.locator('.ficha__badge')).toHaveText('No está en el Tabulado');

  await silva.locator('summary').click();
  await expect(silva.locator('.ficha-strip__pill--residuo')).toContainText('—');
  await expect(silva.locator('.ficha-detail__grid tbody tr')).toHaveCount(3);
  await expect(silva.locator('.ficha-detail__row--pos')).toHaveCount(0);
});

// ── La barra, la misma de siempre ───────────────────────────────────────────

test('en Fichas están los cinco chips, con esas palabras y en ese orden', async ({ page }) => {
  await abrir(page, 'fichas');
  const chips = panel(page).locator('.results-toolbar .results-chip');
  await expect(chips).toHaveCount(5);
  const palabras = ['Todos', 'Con diferencia', 'Dentro del margen', 'Al centavo', 'Sin comparar'];
  for (const [i, palabra] of palabras.entries()) {
    await expect(chips.nth(i)).toContainText(palabra);
  }
});

test('los dos estados que no aplican salen igual, apagados y diciendo por qué', async ({ page }) => {
  await abrir(page, 'fichas');
  const centavo = panel(page).locator('.results-chip', { hasText: 'Al centavo' });
  await expect(centavo).toBeDisabled();
  await expect(centavo).toHaveAttribute('title', /No aplica a este control/);
});

test('el ⬇ Exportar ▾ también es lo último de la barra de Fichas', async ({ page }) => {
  await abrir(page, 'fichas');
  const ultimo = panel(page).locator('.results-toolbar .results-toolbar__right > *').last();
  await expect(ultimo.locator('.row-menu__trigger, button').first()).toContainText('Exportar');
});

// ── La matriz campo × legajo ────────────────────────────────────────────────

test('"Por campo" es una fila por campo, de peor a mejor, y sin fila de TOTAL', async ({ page }) => {
  await abrir(page, 'Por campo');
  const filas = panel(page).locator('table.rb-grid tbody tr');
  await expect(filas).toHaveCount(3);
  // El puesto no coincide en 3 de 5; el centro de costo y el departamento, en 1.
  await expect(filas.first()).toContainText('Puesto');
  await expect(filas.nth(2)).toContainText('Departamento');
  // Sumar "legajos comparados" de tres campos daría 15 sobre 6 empleados.
  await expect(panel(page).locator('table.rb-grid tfoot')).toHaveCount(0);
  expect(page.__errores).toEqual([]);
});

test('…y dice, campo por campo, si es una carga masiva o un caso puntual', async ({ page }) => {
  await abrir(page, 'Por campo');
  const filas = panel(page).locator('table.rb-grid tbody tr');
  await expect(filas.filter({ hasText: 'Puesto' })).toContainText('Parece una carga masiva');
  await expect(filas.filter({ hasText: 'Centro de costo' })).toContainText('Casos puntuales');
  // 3 de 5 legajos comparados, y el sexto no se pudo mirar.
  await expect(filas.filter({ hasText: 'Puesto' })).toContainText('60 %');
});
