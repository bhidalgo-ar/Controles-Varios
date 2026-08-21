// fichasAgrupadorCc.spec.js — Las dos fichas de la tanda 5 de
// specs/vista-estandar-resultados.md en un navegador real: la del Cruce por
// Agrupadores (una tarjeta por LEGAJO, con sus agrupadores adentro) y la de
// Rendimiento vs Tabulado (una tarjeta por CENTRO DE COSTO).
//
// Lo que fija, en orden de qué cuesta más caro si se rompe:
//   1. **Una ficha por unidad, no por fila de cálculo.** Agrupadores cruza
//      legajo × agrupador: dieciocho filas para seis empleados. Si la lista
//      volviera a tener una tarjeta por fila, el analista no puede ver a un
//      empleado entero y el conteo del semáforo se infla.
//   2. **Los cinco chips, con esas palabras y en ese orden**, y el
//      `⬇ Exportar ▾` último a la derecha — igual que en los otros 20 controles.
//   3. La anatomía de la ficha abierta: tira de conciliación, tabla de detalle
//      con el código del concepto o el nombre del agrupador, y conclusión.
//   4. El cuerpo se dibuja al abrir la ficha y no antes.
//
// Corre sobre dos fixtures que montan el `run()` y el `render()` reales de cada
// control con datos inventados, sin IndexedDB — mismo patrón que
// vistaEstandar.spec.js.

import { test, expect } from '@playwright/test';

const CHIPS = ['Todos', 'Con diferencia', 'Dentro del margen', 'Al centavo', 'Sin comparar'];

function conErrores(page) {
  page.__errores = [];
  page.on('pageerror', e => page.__errores.push(String(e)));
}

// ══════════════════════════════════════════════════════════════════════
// Cruce por Agrupadores — la ficha por LEGAJO
// ══════════════════════════════════════════════════════════════════════

test.describe('Cruce por Agrupadores — ficha por legajo', () => {
  test.beforeEach(async ({ page }) => {
    conErrores(page);
    await page.goto('/tests/e2e/fixtures/fichaAgrupadores.html');
    await expect(page.locator('.tabs__list')).toBeVisible();
  });

  test('la solapa Fichas existe y el control abre ahí porque terminó con diferencias', async ({ page }) => {
    await expect(page.locator('.tabs__list > [role="tab"]').nth(1)).toHaveText('Fichas');
    await expect(page.locator('[role="tab"][aria-selected="true"]').first()).toHaveText('Fichas');
  });

  test('hay una ficha por LEGAJO, no una por legajo × agrupador', async ({ page }) => {
    // Seis legajos y tres agrupadores: dieciocho filas de cruce en el resultado.
    const filas = await page.evaluate(() =>
      Object.values(window.__results.resultsPorGrupo).reduce((n, f) => n + f.length, 0));
    expect(filas).toBe(18);

    await page.locator('.results-chip', { hasText: 'Todos' }).click();
    await expect(page.locator('.fichas-list > .ficha')).toHaveCount(6);

    // Y es la misma unidad que cuenta el semáforo.
    expect(await page.evaluate(() => window.__summary.unitsTotal)).toBe(6);
    expect(await page.evaluate(() => window.__summary.unit)).toBe('legajo');
  });

  test('los cinco chips, con esas palabras y en ese orden, y el exportar último', async ({ page }) => {
    const chips = page.locator('.results-chips .results-chip');
    await expect(chips).toHaveCount(5);
    for (const [i, palabra] of CHIPS.entries()) await expect(chips.nth(i)).toContainText(palabra);

    await expect(page.locator('.results-toolbar__right > *').last()).toContainText('Exportar');
  });

  test('el legajo que no está en el otro archivo cae en "Sin comparar" y lo dice', async ({ page }) => {
    await page.locator('.results-chip', { hasText: 'Sin comparar' }).click();
    const fichas = page.locator('.fichas-list > .ficha:visible');
    await expect(fichas).toHaveCount(2);
    await expect(fichas.first().locator('.ficha__badge')).toContainText('No está en');
  });

  test('la ficha abierta trae la tira, un renglón por agrupador y la conclusión', async ({ page }) => {
    const ficha = page.locator('.ficha', { has: page.locator('.ficha__avatar', { hasText: /^2$/ }) }).first();

    // El cuerpo se dibuja al abrir, no al pintar la lista.
    await expect(ficha.locator('.ficha-strip')).toHaveCount(0);
    await ficha.locator('summary').click();

    await expect(ficha.locator('.ficha-strip__pill').first()).toContainText('Nómina Maestra');
    await expect(ficha.locator('.ficha-strip__pill--residuo')).toBeVisible();

    // Un renglón por agrupador, con nómina, resumen y diferencia.
    await expect(ficha.locator('.ficha-detail__grid thead th')).toHaveText(
      ['Agrupador', 'Nómina', 'Resumen', 'Diferencia']);
    await expect(ficha.locator('.ficha-detail__grid tbody tr')).toHaveCount(3);
    await expect(ficha.locator('.ficha-detail__grid tbody tr').first()).toContainText('Sueldo');

    await expect(ficha.locator('.ficha-conclusion__title')).toContainText('no cierra');
    expect(page.__errores).toEqual([]);
  });

  test('"Orden ▾" reordena de verdad la lista de fichas', async ({ page }) => {
    await page.locator('.results-chip', { hasText: 'Todos' }).click();
    const avatares = page.locator('.fichas-list > .ficha .ficha__avatar');

    // Arranca por "Mayor diferencia": el legajo que sólo está en la Nómina
    // ($ 1.790) va primero, no el legajo 1.
    await expect(avatares.first()).toHaveText('3');

    await page.locator('[data-ficha-orden]').selectOption('legajo');
    await expect(avatares.first()).toHaveText('1');

    await page.locator('[data-ficha-orden]').selectOption('nombre');
    await expect(page.locator('.fichas-list > .ficha .ficha__name').first()).toHaveText('—');
  });

  test('"Marcas ▾" trae los agrupadores y filtra la lista', async ({ page }) => {
    const marcas = page.locator('[data-ficha-marca]');
    await expect(marcas.locator('option').first()).toHaveText('Marcas ▾');
    await expect(marcas.locator('option', { hasText: 'Diferencia en Sueldo' })).toHaveCount(1);

    // Los tres legajos que no cierran en Sueldo: el que tiene $ 100 de
    // diferencia y los dos que están en un solo archivo.
    await page.locator('.results-chip', { hasText: 'Todos' }).click();
    await marcas.selectOption('1');
    await expect(page.locator('.fichas-list > .ficha:visible')).toHaveCount(3);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Rendimiento vs Tabulado — la ficha por CENTRO DE COSTO
// ══════════════════════════════════════════════════════════════════════

test.describe('Rendimiento vs Tabulado — ficha por centro de costo', () => {
  test.beforeEach(async ({ page }) => {
    conErrores(page);
    await page.goto('/tests/e2e/fixtures/fichaRendVsTabu.html');
    await expect(page.locator('.tabs__list')).toBeVisible();
  });

  test('hay una ficha por centro de costo, la unidad que declara el control', async ({ page }) => {
    expect(await page.evaluate(() => window.__summary.unit)).toBe('cc');
    await page.locator('.results-chip', { hasText: 'Todos' }).click();
    await expect(page.locator('.fichas-list > .ficha')).toHaveCount(4);
    await expect(page.locator('.results-kpi').first()).toContainText('centros de costo');
  });

  test('el buscador pregunta por lo que la lista tiene: centro de costo, no legajo', async ({ page }) => {
    await expect(page.locator('.table-search__input')).toHaveAttribute('placeholder', 'Código o nombre de CC…');
  });

  test('el nombre del centro de costo va en la línea de identidad y el código en el avatar', async ({ page }) => {
    await page.locator('.results-chip', { hasText: 'Todos' }).click();
    const primera = page.locator('.fichas-list > .ficha').first();
    await expect(primera.locator('.ficha__avatar')).toHaveText('0011');
    await expect(primera.locator('.ficha__name')).toHaveText('Administracion');
  });

  test('los cinco chips, y cada estado con su caso', async ({ page }) => {
    const chips = page.locator('.results-chips .results-chip');
    await expect(chips).toHaveCount(5);
    for (const [i, palabra] of CHIPS.entries()) await expect(chips.nth(i)).toContainText(palabra);
    // Los cuatro estados tienen un caso cada uno: ninguno queda deshabilitado.
    for (const i of [1, 2, 3, 4]) await expect(chips.nth(i)).toBeEnabled();
  });

  test('la ficha abierta abre el Tabulado concepto por concepto, con su código', async ({ page }) => {
    const ficha = page.locator('.fichas-list > .ficha').first();
    await ficha.locator('summary').click();

    const izquierda = ficha.locator('.ficha-table').first();
    await expect(izquierda.locator('.ficha-table__title')).toContainText('concepto por concepto');
    await expect(izquierda.locator('.ficha-table__code').first()).toContainText('1003');

    // El concepto configurado que no está en el Tabulado sale en `—`, no en 0,00.
    const noHallado = izquierda.locator('tr', { hasText: 'no hallado' });
    await expect(noHallado).toContainText('9999');
    await expect(noHallado.locator('.ficha-table__num')).toHaveText('—');
  });

  test('…y el detalle compara categoría por categoría con la diferencia al lado', async ({ page }) => {
    const ficha = page.locator('.fichas-list > .ficha').first();
    await ficha.locator('summary').click();

    await expect(ficha.locator('.ficha-detail__grid thead th')).toHaveText(
      ['Concepto', 'Rendimiento', 'Tabulado', 'Diferencia']);
    await expect(ficha.locator('.ficha-detail__grid tbody tr')).toHaveCount(5);
    await expect(ficha.locator('.ficha-detail__row--neg')).toHaveCount(1);
    await expect(ficha.locator('.ficha-detail__row--neg')).toContainText('PRECIO');

    await expect(ficha.locator('.ficha-conclusion__title')).toContainText('PRECIO');
    expect(page.__errores).toEqual([]);
  });

  test('el centro de costo que no está en el Tabulado no muestra 0,00 sino `—`', async ({ page }) => {
    await page.locator('.results-chip', { hasText: 'Sin comparar' }).click();
    const ficha = page.locator('.fichas-list > .ficha:visible');
    await expect(ficha).toHaveCount(1);
    await expect(ficha.locator('.ficha__avatar')).toHaveText('0099');
    await expect(ficha.locator('.ficha__amount')).toHaveText('—');
  });
});
