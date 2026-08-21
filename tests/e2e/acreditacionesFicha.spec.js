// acreditacionesFicha.spec.js — La ficha de Acreditaciones en un navegador real
// (§4 de specs/vista-estandar-resultados.md, fila de Acreditaciones del §8).
//
// Lo que fija, en orden de qué cuesta más caro si se rompe:
//   1. **La ficha es por LISTA de acreditación, no por legajo.** La unidad de
//      este control es la acreditación y no el empleado-mes (D-021), y es la
//      única excepción conocida a la regla de consolidar por legajo. En el
//      fixture hay un legajo que acredita en las tres listas: si alguien
//      "normaliza" la ficha a una por legajo, este test se cae.
//   2. **Lo de HR se ve en pantalla y no en el archivo** (D-020): la ficha dice
//      cuántas acreditaciones tiene la lista, el desglose por banco y qué
//      legajo está marcado; el .xlsx que recibe Finanzas del cliente no lleva
//      nada de eso, y la propia ficha lo dice.
//   3. El aviso de un grupo sin fecha se ve desde LAS TRES solapas: bloquea el
//      export, y la pantalla abre en Fichas justo cuando hay uno.
//   4. Las tres solapas, los cinco chips y el ⬇ Exportar ▾ último — lo mismo
//      que en los otros 20 controles.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/acreditacionesFicha.html';

test.beforeEach(async ({ page }) => {
  page.__errores = [];
  page.on('pageerror', e => page.__errores.push(String(e)));
  await page.goto(FIXTURE);
  await expect(page.locator('.tabs__list')).toBeVisible();
});

test('las tres solapas son Resumen · Fichas · Planilla, y abre en Fichas porque hay diferencias', async ({ page }) => {
  await expect(page.locator('.tabs__list > [role="tab"]')).toHaveText(['Resumen', 'Fichas', 'Planilla']);
  await expect(page.locator('[role="tab"][aria-selected="true"]').first()).toHaveText('Fichas');
});

test('los cinco chips, con esas palabras y en ese orden, contando LISTAS', async ({ page }) => {
  const chips = page.locator('.results-chips .results-chip');
  await expect(chips).toHaveCount(5);
  for (const [i, palabra] of ['Todos', 'Con diferencia', 'Dentro del margen', 'Al centavo', 'Sin comparar'].entries()) {
    await expect(chips.nth(i)).toContainText(palabra);
  }
  // 3 listas: una con alertas, dos limpias. El grupo sin fecha todavía no es una
  // lista — se cuenta arriba, en el aviso, y en el semáforo.
  await expect(chips.nth(0)).toContainText('3');
  await expect(chips.nth(1)).toContainText('1');
  await expect(chips.nth(3)).toContainText('2');

  // Los dos estados que no aplican a este control salen igual, en gris y con su 0.
  await expect(chips.nth(2)).toBeDisabled();
  await expect(chips.nth(2)).toHaveAttribute('title', /No aplica a este control/);
  await expect(chips.nth(4)).toBeDisabled();
});

test('una ficha por lista de acreditación, no una por legajo (D-021)', async ({ page }) => {
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  await expect(page.locator('.ficha:visible')).toHaveCount(3);

  // El avatar lleva el NÚMERO DE LISTA. El legajo 1 acredita en las tres listas:
  // con una ficha por legajo habría una sola tarjeta para él y los importes
  // sumados, que es exactamente el bug que D-021 prohíbe.
  await expect(page.locator('.ficha__avatar')).toHaveText(['1', '2', '3']);
  await expect(page.locator('.ficha__name')).toHaveText([
    'A — Anticipos de sueldo', '1Q — 1era Quincena', '2Q — 2da Quincena',
  ]);
  await expect(page.locator('.ficha').first().locator('.ficha__amount')).toHaveText('3.000,00');
});

test('cerrada: la lista, su empresa, la liquidación, la fecha, cuántos empleados y el total', async ({ page }) => {
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  const ficha = page.locator('.ficha').first();
  await expect(ficha.locator('.ficha__tag')).toHaveText('CLIENTE DEMO SA');
  await expect(ficha.locator('.ficha__ctx')).toContainText('Acreditan el 02/07/2026');
  await expect(ficha.locator('.ficha__ctx')).toContainText('2 acreditaciones');
  await expect(ficha.locator('.ficha__ctx')).toContainText('Listado 900 + 901');
  await expect(ficha.locator('.ficha__amount-label')).toHaveText('Total de la lista');
});

test('abierta: el cuerpo se dibuja recién al desplegarla, con banco, alertas y qué la frena', async ({ page }) => {
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  const ficha = page.locator('.ficha').nth(1);   // la lista con alertas
  await expect(ficha.locator('[data-ficha-body]')).toBeEmpty();

  await ficha.locator('summary').click();

  // La tira: del listado de pago a lo que sale por el banco.
  await expect(ficha.locator('.ficha-strip__pill')).toHaveCount(5);
  await expect(ficha.locator('.ficha-strip__pill--invert')).toContainText('8.500,00');
  await expect(ficha.locator('.ficha-strip__pill--residuo')).toContainText('2 de 4');

  // El desglose por banco cierra contra el total de la lista.
  const banco = ficha.locator('.ficha-table').first();
  await expect(banco).toContainText('desglose por banco');
  await expect(banco.locator('tbody tr')).toHaveCount(2);
  await expect(banco.locator('tfoot')).toContainText('8.500,00');

  // Las alertas de ESA lista, y fila por fila qué hay que resolver.
  await expect(ficha.locator('.ficha-table').nth(1)).toContainText('alertas de esta lista');
  await expect(ficha.locator('.ficha-detail tbody tr')).toHaveCount(2);
  await expect(ficha.locator('.ficha-detail')).toContainText('CVITANICH DARIO');

  // La conclusión es una instrucción, y recuerda el límite de D-020.
  await expect(ficha.locator('.ficha-conclusion')).toContainText('Antes de mandarla al banco, resolvé');
  await expect(ficha.locator('.ficha-conclusion')).toContainText('Nada de esto va al .xlsx que recibe Finanzas');

  expect(page.__errores).toEqual([]);
});

test('una lista limpia abre con la tira, el banco y una conclusión en verde, sin tabla de alertas', async ({ page }) => {
  await page.locator('.results-chip', { hasText: 'Al centavo' }).click();
  const ficha = page.locator('.ficha:visible').first();
  await ficha.locator('summary').click();

  await expect(ficha.locator('.ficha-table')).toHaveCount(1);
  await expect(ficha.locator('.ficha-detail')).toHaveCount(0);
  await expect(ficha.locator('.ficha-conclusion--ok')).toContainText('La lista está para mandar');
  await expect(ficha.locator('.ficha-strip__pill--residuo')).toHaveCount(0);
});

test('el aviso del grupo sin fecha se ve desde las tres solapas: bloquea el export', async ({ page }) => {
  const aviso = page.locator('[data-pending-apply]');
  for (const solapa of ['Resumen', 'Fichas', 'Planilla']) {
    await page.locator('[role="tab"]', { hasText: new RegExp(`^${solapa}$`) }).click();
    await expect(aviso).toBeVisible();
  }
});

test('el ⬇ Exportar ▾ está último a la derecha, en Fichas y en Planilla', async ({ page }) => {
  await expect(page.locator('.results-toolbar__right > *:last-child')).toContainText('⬇ Exportar ▾');
  await page.locator('[role="tab"]', { hasText: /^Planilla$/ }).click();
  await expect(page.locator('.tabs__panel:not([hidden]) .results-toolbar__right > *:last-child'))
    .toContainText('⬇ Exportar ▾');
});

test('el "Orden ▾" es de Fichas y no aparece en la Planilla', async ({ page }) => {
  await expect(page.locator('[data-ficha-orden]')).toBeVisible();
  await page.locator('[role="tab"]', { hasText: /^Planilla$/ }).click();
  await expect(page.locator('[data-ficha-orden]:visible')).toHaveCount(0);
});

test('ordenar por total pone la lista más grande arriba, sin cambiar cuántas hay', async ({ page }) => {
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  await page.locator('select[data-ficha-orden]').selectOption('total');
  await expect(page.locator('.ficha:visible')).toHaveCount(3);
  await expect(page.locator('.ficha:visible').first().locator('.ficha__amount')).toHaveText('11.000,00');
});

test('el semáforo cuenta en listas y no lo movió la vista nueva', async ({ page }) => {
  const summary = await page.evaluate(() => window.__summary);
  expect(summary.unit).toBe('lista');
  // 3 listas + 1 grupo pendiente; con diferencia: la lista con alertas + el grupo.
  expect(summary.unitsTotal).toBe(4);
  expect(summary.unitsWithDiff).toBe(2);
});

test('asignar la fecha a mano regenera las fichas y no saca al analista de la solapa (D-025)', async ({ page }) => {
  await expect(page.locator('[role="tab"][aria-selected="true"]').first()).toHaveText('Fichas');

  // El grupo pendiente es del mismo tipo (A) que la lista 1: al darle su fecha
  // se une a ella en vez de formar una lista nueva.
  await page.locator('[data-pending-date]').fill('2026-07-02');
  await page.locator('[data-pending-apply]').click();

  await expect(page.locator('[role="tab"][aria-selected="true"]').first()).toHaveText('Fichas');
  await expect(page.locator('[data-pending-apply]')).toHaveCount(0);
  await expect(page.locator('[data-undo-key]')).toHaveCount(1);

  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  await expect(page.locator('.ficha:visible')).toHaveCount(3);
  const primera = page.locator('.ficha').first();
  await expect(primera.locator('.ficha__ctx')).toContainText('4 acreditaciones');
  await expect(primera.locator('.ficha__ctx')).toContainText('Listado 900 + 901 + 950');
  await expect(primera.locator('.ficha__amount')).toHaveText('4.700,00');

  expect(page.__errores).toEqual([]);
});
