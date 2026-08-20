// vistaEstandar.spec.js — La vista estándar de resultados en un navegador real
// (specs/vista-estandar-resultados.md), sobre el control piloto: Acumuladores
// Ganancias.
//
// Lo que fija, en orden de qué cuesta más caro si se rompe:
//   1. **Los cinco chips, con esas palabras y en ese orden**, en todos los
//      controles. Es literalmente lo que se pidió: que el analista reconozca la
//      pantalla sin leerla.
//   2. **El ⬇ Exportar ▾ último a la derecha, en las dos solapas.** Hasta acá la
//      solapa de fichas de este control no tenía exportar.
//   3. La solapa que abre: con diferencias, Fichas; si cerró, Planilla.
//   4. La ficha dibuja su cuerpo al abrirse y no antes (500 legajos = 500
//      cuerpos que nadie mira).
//   5. La planilla: bandas, base de cálculo, TOTAL por columna, y —lo que se
//      arregló en esta tanda— que las columnas congeladas y el rótulo de la
//      banda sigan visibles al scrollear a la derecha.
//
// Corre sobre un fixture (monta el run + el render reales con datos inventados,
// sin IndexedDB) — mismo patrón que detalleTabla.spec.js.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/vistaEstandar.html';

test.beforeEach(async ({ page }) => {
  page.__errores = [];
  page.on('pageerror', e => page.__errores.push(String(e)));
  await page.goto(FIXTURE);
  await expect(page.locator('.rb-verdict')).toBeVisible();
});

test('las tres solapas son Resumen · Fichas · Planilla, en ese orden', async ({ page }) => {
  await expect(page.locator('.tabs__list > [role="tab"]')).toHaveText(['Resumen', 'Fichas', 'Planilla']);
});

test('el control terminó con diferencias, así que abre en Fichas', async ({ page }) => {
  await expect(page.locator('[role="tab"][aria-selected="true"]').first()).toHaveText('Fichas');
});

test('los cinco chips de estado, con esas palabras y en ese orden', async ({ page }) => {
  const chips = page.locator('.results-chips .results-chip');
  await expect(chips).toHaveCount(5);
  for (const [i, palabra] of ['Todos', 'Con diferencia', 'Dentro del margen', 'Al centavo', 'Sin comparar'].entries()) {
    await expect(chips.nth(i)).toContainText(palabra);
  }

  // Arranca en "Con diferencia" porque hay uno, y se dice por qué.
  await expect(page.locator('.results-chip--active')).toContainText('Con diferencia');
  await expect(page.locator('.results-toolbar__hint')).toContainText('arrancó activo');
  await expect(page.locator('.ficha:visible')).toHaveCount(1);

  // El estado que no aplica a este control se muestra igual, en gris, sin poder
  // tocarse y diciendo por qué en el title.
  const margen = chips.nth(2);
  await expect(margen).toContainText('0');
  await expect(margen).toBeDisabled();
  await expect(margen).toHaveAttribute('title', /No aplica a este control/);
});

test('el chip filtra la lista y el KPI dice qué se está mirando', async ({ page }) => {
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  await expect(page.locator('.ficha:visible')).toHaveCount(5);
  await expect(page.locator('.results-toolbar__kpis')).toContainText('5 legajos');

  await page.locator('.results-chip', { hasText: 'Sin comparar' }).click();
  await expect(page.locator('.ficha:visible')).toHaveCount(2);
  await expect(page.locator('.results-toolbar__kpis')).toContainText('2 de 5 legajos');
  // Los chips son la piel de un <select> real, que es lo que sigue leyendo el control.
  await expect(page.locator('.results-toolbar select[data-chips="1"]')).toHaveValue('sinComparar');
});

test('la ficha dibuja su cuerpo al abrirla, no al pintar la lista', async ({ page }) => {
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  const ficha = page.locator('.ficha').first();
  await expect(ficha.locator('[data-ficha-body]')).toBeEmpty();

  await ficha.locator('summary').click();
  // La tira de conciliación y la conclusión son obligatorias: siempre están.
  await expect(ficha.locator('.ficha-strip__pill')).not.toHaveCount(0);
  await expect(ficha.locator('.ficha-conclusion')).toBeVisible();
  // Y el detalle explica de dónde sale el número grande de la tarjeta.
  await expect(ficha.locator('.ficha-detail')).toContainText('SAC teórico acumulado');
  expect(page.__errores).toEqual([]);
});

test('el ⬇ Exportar ▾ está último a la derecha, en Fichas y en Planilla', async ({ page }) => {
  await expect(page.locator('.results-toolbar__right .row-menu > button')).toHaveText('⬇ Exportar ▾');
  // Último: no hay ningún otro control a su derecha en la barra.
  await expect(page.locator('.results-toolbar__right > *:last-child')).toContainText('Exportar');

  await page.locator('[role="tab"]', { hasText: /^Planilla$/ }).click();
  await expect(page.locator('.tabs__panel:not([hidden]) .results-toolbar__right > *:last-child')).toContainText('Exportar');
});

test('la planilla agrupa en bandas, dice la base de cálculo y totaliza cada columna', async ({ page }) => {
  await page.locator('[role="tab"]', { hasText: /^Planilla$/ }).click();
  const tabla = page.locator('table.rb-grid').first();
  await expect(tabla).toBeVisible();

  // Fila 1: bandas. La primera es siempre Identificación y viaja con las
  // columnas congeladas.
  const bandas = tabla.locator('thead tr:first-child th');
  await expect(bandas.first()).toHaveText('Identificación');
  await expect(bandas.first()).toHaveAttribute('colspan', '2');

  // Fila 2: cada rubro con su base de cálculo abajo (el código del acumulador).
  await expect(tabla.locator('thead .rb-col__sub').first()).toHaveText('1100');

  // El TOTAL cuenta en la unidad del control y totaliza las columnas de importe.
  const total = tabla.locator('tfoot tr').first();
  await expect(total).toContainText('legajos');
  await expect(total.locator('td').nth(1)).toHaveText('2.250.000,00');
});

test('al scrollear a la derecha, las columnas congeladas y el rótulo de la banda siguen visibles', async ({ page }) => {
  await page.locator('[role="tab"]', { hasText: /^Planilla$/ }).click();
  const wrap = page.locator('.rb-grid-wrap').first();
  await expect(wrap).toBeVisible();
  await wrap.evaluate(el => { el.scrollLeft = 99999; });

  const pos = await wrap.evaluate(el => {
    const izq = el.getBoundingClientRect().left;
    const finCongeladas = el.querySelector('tbody tr td:nth-child(2)').getBoundingClientRect().right;
    const primeraColumna = el.querySelector('thead tr:nth-child(2) th').getBoundingClientRect().left;
    const rotulos = [...el.querySelectorAll('thead tr:first-child .rb-grid__band')]
      .map(s => s.getBoundingClientRect().left);
    return { izq, finCongeladas, primeraColumna, rotulos };
  });

  // La 1ª columna del encabezado sigue pegada a la izquierda (antes se iba con
  // el scroll y quedaba "Legajo" arriba de un importe).
  expect(Math.round(pos.primeraColumna - pos.izq)).toBeLessThanOrEqual(1);
  // Y ningún rótulo de banda quedó abajo de las columnas congeladas.
  expect(pos.rotulos.length).toBeGreaterThan(0);
  for (const left of pos.rotulos) expect(left).toBeGreaterThanOrEqual(pos.finCongeladas - 1);
});

test('la preferencia de solapa se guarda por control Y por estado', async ({ page }) => {
  await page.locator('[role="tab"]', { hasText: /^Planilla$/ }).click();
  const guardado = await page.evaluate(() => ({
    conDif: localStorage.getItem('viewPref:acumuladores_ganancias:conDif'),
    sinDif: localStorage.getItem('viewPref:acumuladores_ganancias:sinDif'),
  }));
  expect(JSON.parse(guardado.conDif).tab).toBe('planilla');
  // La preferencia del control que cerró no la tocó nadie: si se guardara sólo
  // por control, esta corrida acaba de pisar la regla "con diferencias abre en
  // Fichas" para siempre.
  expect(guardado.sinDif).toBe(null);
});
