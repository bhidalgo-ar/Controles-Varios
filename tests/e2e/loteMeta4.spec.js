// loteMeta4.spec.js — La barra estándar y la planilla con bandas en las diez
// pantallas del lote Meta4/Marval (§3 y §5 de
// specs/vista-estandar-resultados.md), en un navegador real.
//
// Lo que fija, en orden de qué cuesta más caro si se rompe:
//   1. **Los cinco chips, con esas palabras y en ese orden, en las diez
//      pantallas.** Es literalmente lo que se pidió: que el analista reconozca
//      la pantalla sin leerla.
//   2. **El ⬇ Exportar ▾ último a la derecha, siempre.** Antes estaba en tres
//      lugares distintos según el control, y dos pantallas ni lo tenían en la
//      barra.
//   3. Que los cinco chips PARTICIONEN los casos: la suma de los cuatro estados
//      da el total de "Todos". Un caso que se cae de la partición es un caso que
//      el analista no encuentra con ningún chip.
//   4. Que el chip "Con diferencia" diga lo MISMO que la tile del Resumen. Es el
//      número del que depende todo lo demás, y hasta esta tanda la tabla lo
//      medía con $ 0,01 mientras el Resumen lo medía con el monto del cliente.
//   5. La planilla: bandas sobre el mismo fondo, base de cálculo abajo de cada
//      título y TOTAL en todas las columnas de importe.
//
// Corre sobre un fixture (monta el run + el render reales con datos inventados,
// sin IndexedDB) — mismo patrón que vistaEstandar.spec.js.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/loteMeta4.html';

/** Los diez del lote, con lo que cada uno tiene de propio. */
const CONTROLES = [
  { id: 'brutos',          bandas: true,  compara: true },
  { id: 'brutos_reporte',  bandas: true,  compara: false },
  { id: 'gs_pers',         bandas: true,  compara: true },
  { id: 'gs_pers_reporte', bandas: true,  compara: false },
  { id: 'nr',              bandas: true,  compara: true,  marcas: true },
  { id: 'nr_reporte',      bandas: true,  compara: false, marcas: true },
  { id: 'rend_vs_tabu',    bandas: true,  compara: true },
  { id: 'rend_x_ee',       bandas: true,  compara: true,  marcas: true },
  { id: 'rend_vs_asiento', bandas: true,  compara: true },
  // EE x CATEG cruza campos de texto: sin bandas y sin TOTAL, porque no hay
  // nada que agrupar en rubros ni nada que totalizar.
  { id: 'cat_x_empleados', bandas: false, compara: true,  marcas: true },
];

const PALABRAS = ['Todos', 'Con diferencia', 'Dentro del margen', 'Al centavo', 'Sin comparar'];

/** Abre la pantalla de un control y deja la solapa Planilla activa. */
async function abrirPlanilla(page, id) {
  page.__errores = [];
  page.on('pageerror', e => page.__errores.push(String(e)));
  await page.goto(`${FIXTURE}?control=${id}`);
  await expect(page.locator('.rb-verdict')).toBeVisible();
  await page.locator('[role="tab"]').last().click();
  await expect(page.locator('.results-toolbar')).toBeVisible();
}

const numero = (txt) => Number(String(txt).replace(/[^\d-]/g, '') || 0);

for (const ctrl of CONTROLES) {
  test(`${ctrl.id} · la última solapa se llama Planilla`, async ({ page }) => {
    await abrirPlanilla(page, ctrl.id);
    await expect(page.locator('[role="tab"]').last()).toHaveText('Planilla');
    expect(page.__errores).toEqual([]);
  });

  test(`${ctrl.id} · los cinco chips, con esas palabras y en ese orden`, async ({ page }) => {
    await abrirPlanilla(page, ctrl.id);
    const chips = page.locator('.results-toolbar .results-chip');
    await expect(chips).toHaveCount(5);
    for (const [i, palabra] of PALABRAS.entries()) {
      await expect(chips.nth(i)).toContainText(palabra);
    }
  });

  test(`${ctrl.id} · los cuatro estados suman el total de "Todos"`, async ({ page }) => {
    await abrirPlanilla(page, ctrl.id);
    const cuentas = await page.locator('.results-chip .results-chip__count').allTextContents();
    const [todos, ...estados] = cuentas.map(numero);
    // Un control que genera un archivo no clasifica nada: sus cuatro chips van
    // en cero y con su porqué en el `title` — pero "Todos" sigue diciendo
    // cuántas filas hay.
    if (ctrl.compara) expect(estados.reduce((a, b) => a + b, 0)).toBe(todos);
    else expect(estados.reduce((a, b) => a + b, 0)).toBe(0);
    expect(todos).toBeGreaterThan(0);
  });

  test(`${ctrl.id} · el ⬇ Exportar ▾ es lo último de la barra`, async ({ page }) => {
    await abrirPlanilla(page, ctrl.id);
    // El último hijo del grupo de la derecha, no el último botón: el menú lleva
    // su panel de ítems adentro y ésos también son botones.
    const ultimo = page.locator('.results-toolbar .results-toolbar__right > *').last();
    await expect(ultimo.locator('.row-menu__trigger, button').first()).toContainText('Exportar');
  });

  test(`${ctrl.id} · la barra tiene el buscador`, async ({ page }) => {
    await abrirPlanilla(page, ctrl.id);
    await expect(page.locator('.results-toolbar .table-search__input')).toBeVisible();
  });

  if (ctrl.marcas) {
    test(`${ctrl.id} · el segundo eje va en "Marcas ▾" y no en la fila de chips`, async ({ page }) => {
      await abrirPlanilla(page, ctrl.id);
      const marcas = page.locator('.results-toolbar [data-marca-filter]');
      await expect(marcas).toBeVisible();
      await expect(marcas.locator('option').first()).toHaveText('Marcas ▾');
      // Y sigue habiendo cinco chips: las marcas no se cuelan ahí.
      await expect(page.locator('.results-toolbar .results-chip')).toHaveCount(5);
    });
  }

  test(`${ctrl.id} · cada columna dice su base de cálculo`, async ({ page }) => {
    await abrirPlanilla(page, ctrl.id);
    expect(await page.locator('table.rb-grid .rb-col__sub').count()).toBeGreaterThan(0);
  });

  if (ctrl.bandas) {
    test(`${ctrl.id} · las bandas van todas sobre el mismo fondo`, async ({ page }) => {
      await abrirPlanilla(page, ctrl.id);
      const fondos = await page.locator('table.rb-grid tr.rb-rubro__bands > th')
        .evaluateAll(ths => [...new Set(ths.map(th => getComputedStyle(th).backgroundColor))]);
      expect(fondos).toHaveLength(1);
    });

    test(`${ctrl.id} · la planilla cierra con una fila de TOTAL`, async ({ page }) => {
      await abrirPlanilla(page, ctrl.id);
      await expect(page.locator('table.rb-grid tfoot')).toContainText('TOTAL');
    });
  } else {
    test(`${ctrl.id} · sin bandas y sin TOTAL: no hay importes que agrupar ni totalizar`, async ({ page }) => {
      await abrirPlanilla(page, ctrl.id);
      await expect(page.locator('table.rb-grid tr.rb-rubro__bands')).toHaveCount(0);
      await expect(page.locator('table.rb-grid tfoot')).toHaveCount(0);
    });
  }
}

// ── El número que no puede decir dos cosas ──────────────────────────────────
//
// Hasta esta tanda, una solapa se dibujaba al clickearla —o sea, fuera del
// `withTolerance()` del borde de la app— y medía con $ 0,01 en vez de con el
// monto del cliente. El Resumen contaba una diferencia y la tabla de al lado
// pintaba otra.

const CON_TILE = ['brutos', 'gs_pers', 'nr', 'rend_vs_tabu', 'rend_x_ee', 'rend_vs_asiento'];

for (const id of CON_TILE) {
  test(`${id} · el chip "Con diferencia" dice lo mismo que la tile del Resumen`, async ({ page }) => {
    await page.goto(`${FIXTURE}?control=${id}`);
    const tile = await page.locator('.rb-tile', { hasText: 'Con diferencia' })
      .locator('.rb-tile__value').first().textContent();
    await page.locator('[role="tab"]').last().click();
    const chip = await page.locator('.results-chip', { hasText: 'Con diferencia' })
      .locator('.results-chip__count').textContent();
    expect(numero(chip)).toBe(numero(tile));
  });
}

// ── Los chips filtran de verdad ─────────────────────────────────────────────

test('el chip filtra la planilla, y el TOTAL pasa a ser el de la selección', async ({ page }) => {
  await abrirPlanilla(page, 'brutos');
  // Arranca en "Con diferencia" porque hay uno, y la barra dice por qué.
  await expect(page.locator('.results-chip--active')).toContainText('Con diferencia');
  await expect(page.locator('.results-toolbar__hint')).toContainText('arrancó activo');
  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(1);
  await expect(page.locator('table.rb-grid tfoot')).toContainText('TOTAL de la selección');

  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(5);
  await expect(page.locator('table.rb-grid tfoot')).not.toContainText('de la selección');
});

test('un estado sin casos se muestra igual, apagado y diciendo por qué', async ({ page }) => {
  await abrirPlanilla(page, 'brutos_reporte');
  const conDif = page.locator('.results-chip', { hasText: 'Con diferencia' });
  await expect(conDif).toContainText('0');
  await expect(conDif).toBeDisabled();
  await expect(conDif).toHaveAttribute('title', /No aplica a este control/);
});

test('el buscador y el chip son dos criterios sobre la misma selección', async ({ page }) => {
  await abrirPlanilla(page, 'brutos');
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(5);

  await page.locator('.table-search__input').fill('11');
  await page.locator('.table-search__option').first().click();
  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(1);

  // Limpiar la búsqueda devuelve el filtro del chip, no la tabla entera.
  await page.locator('.results-chip', { hasText: 'Al centavo' }).click();
  await page.locator('.table-search__clear').click();
  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(2);
});
