// fichasLegajoConcepto.spec.js — La solapa Fichas en los tres controles donde la
// unidad es el legajo y adentro hay varios conceptos (§4 y §8 de
// specs/vista-estandar-resultados.md, tanda 4): Control NR, Novedades vs
// Liquidación y Variación Conceptos.
//
// Lo que se prueba acá y no en el test unitario es lo que sólo se puede afirmar
// con un navegador de verdad:
//   1. Que las tres pantallas muestren la MISMA barra: los cinco chips con esas
//      palabras y en ese orden, el buscador, Marcas ▾, Orden ▾ y el KPI.
//   2. Que el cuerpo de la ficha se dibuje al ABRIRLA y no al pintar la lista.
//   3. Que el control con diferencias abra en Fichas (§2).
//   4. Que la tabla de detalle no derrame scroll horizontal a la página: en
//      Novedades son ocho columnas (cantidad e importe de los dos lados).
//   5. Que no haya un solo hex escrito a mano: todo se lee en los tres temas.
//
// Corre sobre fixtures que montan el run() + el render reales con datos
// inventados, sin IndexedDB — mismo patrón que vistaEstandar.spec.js.

import { test, expect } from '@playwright/test';

const PANTALLAS = [
  { nombre: 'Control NR', url: '/tests/e2e/fixtures/nrFichas.html', fichasConDif: 2 },
  { nombre: 'Novedades vs Liquidación', url: '/tests/e2e/fixtures/novedadesLiquidacion.html', fichasConDif: 2 },
  { nombre: 'Variación Conceptos', url: '/tests/e2e/fixtures/variacionesConceptosFichas.html', fichasConDif: 4 },
];

const CHIPS = ['Todos', 'Con diferencia', 'Dentro del margen', 'Al centavo', 'Sin comparar'];

/** Abre la pantalla y deja la solapa Fichas activa, sin errores de consola. */
async function abrirFichas(page, url) {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto(url);
  await expect(page.locator('[role="tab"]', { hasText: 'Fichas' })).toHaveCount(1);
  await page.locator('[role="tab"]', { hasText: 'Fichas' }).click();
  await expect(page.locator('.fichas-list')).toBeVisible();
  return errores;
}

for (const p of PANTALLAS) {
  test(`${p.nombre}: los cinco chips de estado, con esas palabras y en ese orden`, async ({ page }) => {
    await abrirFichas(page, p.url);
    const chips = page.locator('.results-chips .results-chip');
    await expect(chips).toHaveCount(5);
    for (const [i, palabra] of CHIPS.entries()) {
      await expect(chips.nth(i)).toContainText(palabra);
    }
    // Arranca en "Con diferencia" porque hay alguno, y la barra dice por qué.
    await expect(page.locator('.results-chip--active')).toContainText('Con diferencia');
    await expect(page.locator('.results-toolbar__hint')).toBeVisible();
    await expect(page.locator('.ficha:visible')).toHaveCount(p.fichasConDif);
  });

  test(`${p.nombre}: la barra lleva buscador, Marcas ▾, Orden ▾ y el KPI de la selección`, async ({ page }) => {
    await abrirFichas(page, p.url);
    await expect(page.locator('.results-toolbar input[type="search"], .results-toolbar input[role="combobox"]'))
      .toHaveCount(1);
    await expect(page.locator('.results-toolbar [data-marca-filter]'))
      .toHaveCount(1);
    await expect(page.locator('.results-toolbar [data-ficha-orden]')).toHaveCount(1);
    await expect(page.locator('.results-toolbar__kpis')).not.toBeEmpty();
  });

  test(`${p.nombre}: la ficha dibuja su cuerpo al abrirla, no al pintar la lista`, async ({ page }) => {
    await abrirFichas(page, p.url);
    const primera = page.locator('.ficha:visible').first();
    await expect(primera.locator('[data-ficha-body]')).toBeEmpty();
    await primera.locator('summary').click();
    // La tira y la conclusión son obligatorias (§4).
    await expect(primera.locator('.ficha-strip__pill').first()).toBeVisible();
    await expect(primera.locator('.ficha-conclusion__title')).toBeVisible();
    await expect(primera.locator('.ficha-conclusion__text')).not.toBeEmpty();
  });

  test(`${p.nombre}: la cascada cierra en un residuo y la anteúltima va invertida`, async ({ page }) => {
    await abrirFichas(page, p.url);
    const primera = page.locator('.ficha:visible').first();
    await primera.locator('summary').click();
    await expect(primera.locator('.ficha-strip__pill--invert')).toHaveCount(1);
    await expect(primera.locator('.ficha-strip__pill--residuo').first()).toBeVisible();
  });

  test(`${p.nombre}: cada renglón del detalle nombra el concepto por su código`, async ({ page }) => {
    await abrirFichas(page, p.url);
    const primera = page.locator('.ficha:visible').first();
    await primera.locator('summary').click();
    const filas = primera.locator('.ficha-detail__grid tbody tr');
    expect(await filas.count()).toBeGreaterThan(0);
    for (let i = 0; i < await filas.count(); i++) {
      // El código va adelante: el Tabulado trae '4899-COCHERA_IG' y
      // '8805-DTO_COCHERA', y matchear por nombre agarra el equivocado.
      await expect(filas.nth(i).locator('td').first()).toHaveText(/^\d/);
    }
    // Verde suave lo que suma, rojo suave lo que resta.
    expect(await primera.locator('.ficha-detail__row--pos, .ficha-detail__row--neg').count())
      .toBeGreaterThan(0);
  });

  test(`${p.nombre}: el detalle scrollea adentro de la tarjeta, la página no`, async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await abrirFichas(page, p.url);
    const primera = page.locator('.ficha:visible').first();
    await primera.locator('summary').click();
    await expect(primera.locator('.ficha-detail')).toBeVisible();
    const derrama = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(derrama).toBe(false);
  });

  test(`${p.nombre}: se lee en los tres temas y sin un hex escrito a mano`, async ({ page }) => {
    const errores = await abrirFichas(page, p.url);
    for (const tema of ['claro', 'intenso', 'oscuro']) {
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, tema);
      const primera = page.locator('.ficha:visible').first();
      if (!(await primera.evaluate(el => el.open))) await primera.locator('summary').click();
      // El texto de la conclusión y el fondo de la tarjeta tienen que seguir
      // siendo distintos: es lo que se rompe cuando un módulo escribe un hex.
      const [fg, bg] = await primera.locator('.ficha-conclusion__title').evaluate(el => {
        const cs = getComputedStyle(el);
        return [cs.color, getComputedStyle(el.closest('.ficha-conclusion')).backgroundColor];
      });
      expect(fg, `${tema}: el título de la conclusión no puede quedar del color del fondo`).not.toBe(bg);
    }
    expect(errores).toEqual([]);
  });
}

test('Control NR: el legajo con un concepto de un solo lado no muestra una diferencia falsa', async ({ page }) => {
  // El caso que hacía mentir a la ficha: restar los dos totales cuenta el lado
  // que falta como un cero, y `null` no es `0` (CLAUDE.md). El legajo 11 trae
  // 7.000,00 en un concepto que el Tabulado no informa.
  await abrirFichas(page, '/tests/e2e/fixtures/nrFichas.html');
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  const ficha = page.locator('.ficha[data-ficha-id="11"]');
  await ficha.locator('summary').click();
  const pastillas = ficha.locator('.ficha-strip__pill');
  await expect(pastillas.filter({ hasText: 'REPORTE NR' })).toContainText('38.500,00');
  await expect(pastillas.filter({ hasText: 'DIFERENCIA COMPARADA' })).toContainText('0,00');
  await expect(ficha.locator('.ficha-conclusion__text'))
    .toContainText('NO entra en la diferencia de arriba');
});

test('Novedades vs Liquidación: el legajo del que no se comparó nada no queda aprobado (D-073)', async ({ page }) => {
  await abrirFichas(page, '/tests/e2e/fixtures/novedadesLiquidacion.html');
  await page.locator('.results-chip', { hasText: 'Sin comparar' }).click();
  const fichas = page.locator('.ficha:visible');
  expect(await fichas.count()).toBeGreaterThan(0);
  // Ninguna de las que caen en "Sin comparar" puede estar pintada de verde.
  expect(await fichas.locator('.ficha__avatar--ok').count()).toBe(0);
  // Y el motivo se lee, no queda detrás de un guión.
  const primera = fichas.first();
  await primera.locator('summary').click();
  await expect(primera.locator('.ficha-detail__grid tbody tr').first())
    .toContainText(/No comparable|Sin contraparte/);
});

test('Variación Conceptos: la caída de escalón se lee como escalón y no como pesos', async ({ page }) => {
  await abrirFichas(page, '/tests/e2e/fixtures/variacionesConceptosFichas.html');
  const ficha = page.locator('.ficha[data-ficha-id="1"]');
  await expect(ficha.locator('.ficha__badge')).toContainText('100 % → 70 %');
  await expect(ficha.locator('.ficha__mark')).toContainText('Bajó de escalón sin causa visible');
  await ficha.locator('summary').click();
  await expect(ficha.locator('.ficha-detail__grid tbody tr').first()).toContainText('100 % → 70 %');
  await expect(ficha.locator('.ficha-conclusion__text')).toContainText('preguntale al cliente');
});

test('Variación Sueldos no lleva ficha: su fila ya dice anterior, actual y variación (§8)', async ({ page }) => {
  // El mismo módulo dibuja los dos reportes; sólo Variación Conceptos tiene
  // varios conceptos adentro de un legajo.
  await page.goto('/tests/e2e/fixtures/variacionesConceptosFichas.html');
  const combinado = await page.evaluate(() => window.__results.reporte.combinar);
  expect(combinado).toBe(false);
});
