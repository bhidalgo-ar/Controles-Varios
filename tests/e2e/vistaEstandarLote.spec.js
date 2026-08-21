// vistaEstandarLote.spec.js — La barra estándar y la planilla con bandas en las
// NUEVE pantallas del lote Axton/general (tanda 3 de
// specs/vista-estandar-resultados.md).
//
// Lo que se verifica acá es exactamente lo que se pidió y no se puede afirmar
// leyendo el código: que las nueve pantallas muestren **los mismos cinco chips,
// con las mismas palabras y en el mismo orden**, que el `⬇ Exportar ▾` esté
// siempre último a la derecha de la barra, que la planilla agrupe las columnas
// en bandas con su base de cálculo abajo del título, y que todo eso se lea en
// los tres temas. Nueve fixtures con datos inventados.
//
// Los conteos de cada control se prueban en su test de unidad; acá sólo se mira
// la pantalla.

import { test, expect } from '@playwright/test';

const CHIPS = ['Todos', 'Con diferencia', 'Dentro del margen', 'Al centavo', 'Sin comparar'];

/**
 * Las nueve entradas del lote. `sub` es la sub-solapa de la Planilla que hay que
 * abrir en los controles que tienen más de una tabla (el mismo patrón que
 * Acumuladores, el piloto).
 */
const PANTALLAS = [
  { id: 'agrupadores',           fixture: 'agrupadores.html' },
  { id: 'variaciones_sueldos',   fixture: 'variaciones.html' },
  { id: 'variaciones_conceptos', fixture: 'variaciones.html?reporte=conceptos' },
  { id: 'pop_variaciones',       fixture: 'popVariaciones.html' },
  { id: 'acreditaciones',        fixture: 'acreditaciones.html' },
  { id: 'novedades_importador',  fixture: 'novedadesImportador.html', sub: 'Lo que entra al importador' },
  { id: 'novedades_liquidacion', fixture: 'novedadesLiquidacion.html' },
  { id: 'finadiet_asiento',      fixture: 'finadietAsiento.html', sub: 'ASIENTO' },
  { id: 'conta_desglosada',      fixture: 'contaDesglosada.html', sub: 'Asiento Contable' },
];

/** Abre la Planilla (y su sub-solapa, si tiene) de una pantalla del lote. */
async function abrirPlanilla(page, { fixture, sub }) {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e.message)));
  // El navegador pide `/favicon.ico` en cada fixture y el server estático
  // responde 404: es ruido del entorno de test, no un error de la pantalla.
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/favicon/.test(m.location()?.url || '')) return;
    errores.push(m.text());
  });
  await page.goto(`/tests/e2e/fixtures/${fixture}`);
  await page.locator('[role="tab"]', { hasText: 'Planilla' }).first().click();
  if (sub) await page.locator('[role="tab"]').filter({ hasText: sub }).click();
  return errores;
}

for (const pantalla of PANTALLAS) {
  test(`${pantalla.id}: los cinco chips, con esas palabras y en ese orden`, async ({ page }) => {
    const errores = await abrirPlanilla(page, pantalla);

    const chips = page.locator('.results-chip:visible');
    await expect(chips).toHaveCount(5);
    // El texto de cada chip es "Palabra" + su conteo: se compara sin el número.
    const palabras = (await chips.allInnerTexts())
      .map(t => t.trim().split(/\s+/).slice(0, -1).join(' '));
    expect(palabras).toEqual(CHIPS);

    // Un chip sin casos se muestra igual, en gris y sin poder tocarse (§3).
    for (const chip of await chips.all()) {
      const texto = (await chip.innerText()).trim();
      const cero = /\b0$/.test(texto);
      expect(await chip.isDisabled()).toBe(cero && !texto.startsWith('Todos'));
    }
    expect(errores).toEqual([]);
  });

  test(`${pantalla.id}: el ⬇ Exportar ▾ es lo último de la barra`, async ({ page }) => {
    await abrirPlanilla(page, pantalla);
    const derecha = page.locator('.results-toolbar__right:visible').first();
    await expect(derecha.locator('> *').last()).toContainText('Exportar');
  });

  test(`${pantalla.id}: la planilla agrupa en bandas y dice la base de cálculo`, async ({ page }) => {
    await abrirPlanilla(page, pantalla);
    const tabla = page.locator('table.rb-rubro:visible').first();
    await expect(tabla).toBeVisible();

    // Encabezado de dos filas: la 1ª son las bandas, la 2ª los rubros.
    const bandas = tabla.locator('thead tr.rb-rubro__bands th');
    expect(await bandas.count()).toBeGreaterThanOrEqual(2);
    await expect(bandas.first()).toContainText('Identificación');

    // Al menos una columna dice su base de cálculo abajo del título (§5).
    expect(await tabla.locator('thead .rb-col__sub').count()).toBeGreaterThan(0);
  });
}

// El TOTAL por columna: sólo en las pantallas cuya planilla totaliza importes
// (la del importador no lo hace a propósito — su celda es `cantidad$importe`,
// que no es un importe que se pueda sumar).
const CON_TOTAL = PANTALLAS.filter(p => p.id !== 'novedades_importador');

for (const pantalla of CON_TOTAL) {
  test(`${pantalla.id}: la fila de TOTAL cierra por columna y nombra su unidad`, async ({ page }) => {
    await abrirPlanilla(page, pantalla);
    const pie = page.locator('table.rb-rubro:visible tfoot').first();
    await expect(pie).toContainText('TOTAL');
    // "TOTAL — 6 legajos": la unidad la declara el control, nunca "filas".
    expect((await pie.innerText()).trim()).not.toMatch(/TOTAL[^—]*—\s*\d+\s*filas/);
  });
}

// Los tres temas — nada de hex en los módulos, y la pantalla se recorre en los
// tres antes de darla por cerrada (D-059). Acá se verifica lo que un screenshot
// no puede afirmar solo: que el rótulo de una banda tenga contraste suficiente
// contra el fondo que le toca en cada tema.
for (const tema of ['sobrio', 'intenso', 'oscuro']) {
  test(`${tema}: los rótulos de banda de las nueve planillas se leen`, async ({ page }) => {
    for (const pantalla of PANTALLAS) {
      await abrirPlanilla(page, pantalla);
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);

      const contraste = await page.locator('table.rb-rubro:visible thead tr.rb-rubro__bands th').last()
        .evaluate((el) => {
          const lum = (c) => {
            const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r + 0.7152 * g + 0.0722 * b;
          };
          // El fondo se COMPONE: las bandas se tiñen con un color translúcido, y
          // leerlo como si fuera opaco da un contraste que no existe.
          const rgba = (c) => {
            const n = (c.match(/[\d.]+/g) || []).map(Number);
            return { r: n[0] || 0, g: n[1] || 0, b: n[2] || 0, a: n[3] === undefined ? 1 : n[3] };
          };
          const capas = [];
          for (let n = el; n; n = n.parentElement) {
            const c = rgba(getComputedStyle(n).backgroundColor);
            if (c.a === 0) continue;
            capas.push(c);
            if (c.a === 1) break;
          }
          if (!capas.length || capas[capas.length - 1].a < 1) capas.push({ r: 255, g: 255, b: 255, a: 1 });
          let fondo = capas[capas.length - 1];
          for (let i = capas.length - 2; i >= 0; i--) {
            const c = capas[i];
            fondo = {
              r: c.r * c.a + fondo.r * (1 - c.a),
              g: c.g * c.a + fondo.g * (1 - c.a),
              b: c.b * c.a + fondo.b * (1 - c.a),
              a: 1,
            };
          }
          const a = lum(getComputedStyle(el).color);
          const b = lum(`rgb(${fondo.r}, ${fondo.g}, ${fondo.b})`);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });

      // 3:1 es AA para texto grande; el rótulo de banda va en mayúsculas y bold.
      expect(contraste, `${pantalla.id} en ${tema}`).toBeGreaterThanOrEqual(3);
    }
  });
}

// ── La planilla larga: el buscador y los chips tienen que alcanzar lo que está
//    fuera de la primera página ──────────────────────────────────────────────
//
// Con 120 filas la tabla arranca paginada en 50. Hasta acá la página se contaba
// sobre el índice ORIGINAL de la fila, así que buscar un legajo de la fila 119
// no mostraba nada —y el botón "Mostrar todas" se ocultaba, así que tampoco
// había salida—. Es la pieza compartida, así que lo heredan los 21 controles.

test('la planilla larga arranca paginada y el chip encuentra la fila 119', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/planillaLarga.html');
  await page.waitForFunction(() => window.__listo);

  // La fila del botón "Mostrar todas" vive dentro del <tbody>: no es un dato.
  const visibles = page.locator('table.rb-rubro tbody tr:visible:not(.table-show-more-row)');
  // Arranca filtrada en "Con diferencia" porque hay una (§3): esa fila es la
  // 119 de 120, y tiene que verse igual.
  await expect(page.locator('.results-chip--active')).toContainText('Con diferencia');
  await expect(visibles).toHaveCount(1);
  await expect(visibles.first()).toContainText('119');

  // "Todos" vuelve a la página de 50, con el botón para ver el resto.
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  await expect(visibles).toHaveCount(50);
  await expect(page.locator('.js-show-more')).toBeVisible();
  await page.locator('.js-show-more').click();
  await expect(visibles).toHaveCount(120);
});

test('el buscador encuentra un legajo que quedó fuera de la primera página', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/planillaLarga.html');
  await page.waitForFunction(() => window.__listo);
  await page.locator('.results-chip', { hasText: 'Todos' }).click();

  await page.fill('.table-search__input', 'CARRANZA 96');
  await page.locator('.table-search__option').first().click();

  // La fila del botón "Mostrar todas" vive dentro del <tbody>: no es un dato.
  const visibles = page.locator('table.rb-rubro tbody tr:visible:not(.table-show-more-row)');
  await expect(visibles).toHaveCount(1);
  await expect(visibles.first()).toContainText('96');
  // Y el pie pasa a decir que está mostrando la SELECCIÓN, no el total general.
  await expect(page.locator('table.rb-rubro tfoot')).toContainText('TOTAL de la selección');
});

// ── El buscador y el chip son dos criterios sobre la MISMA selección ─────────
//
// Este es el punto de comportamiento que cambió al unificar las dos piezas de la
// Planilla que las tandas 2 y 3 habían escrito por separado (D-088). La de la
// tanda 3 re-dibujaba la tabla en cada filtro, y `initSearchCombobox()` reescribe
// el buscador entero cada vez que se lo monta: en estas nueve pantallas, tocar un
// chip le borraba al analista lo que había tipeado. La pieza unificada dibuja la
// tabla UNA vez y el chip oculta filas, así que los dos criterios se cruzan — que
// es lo que ya hacían las diez pantallas de la tanda 2.
//
// **Queda escrito como test porque es un criterio, no un detalle**: si Willy
// prefiere que el chip limpie la búsqueda, este test se cae y ahí se decide.

test('en la planilla larga, tocar un chip NO borra lo que está buscado', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/planillaLarga.html');
  await page.waitForFunction(() => window.__listo);
  await page.locator('.results-chip', { hasText: 'Todos' }).click();

  const input = page.locator('.table-search__input');
  await input.fill('CARRANZA 96');
  await page.locator('.table-search__option').first().click();
  const buscado = await input.inputValue();
  expect(buscado).toContain('96');

  // Al tocar otro chip, el texto sigue en el buscador: la tabla no se rehace.
  await page.locator('.results-chip', { hasText: 'Al centavo' }).click();
  await expect(input).toHaveValue(buscado);

  // Y volviendo a "Todos" la fila buscada sigue siendo la única: el buscador
  // nunca dejó de filtrar, así que limpiar el chip no trae la tabla entera.
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  const visibles = page.locator('table.rb-rubro tbody tr:visible:not(.table-show-more-row)');
  await expect(visibles).toHaveCount(1);
  await expect(visibles.first()).toContainText('96');
});

// ── El orden por encabezado de la planilla de Variaciones ────────────────────
//
// Es la única de las diecinueve planillas que ordena clickeando el encabezado, y
// se conservó a propósito: las tablas que reemplazó ya ordenaban, y "quién subió
// más" es la lectura más frecuente del reporte (D-081). El `Orden ▾` del estándar
// es de la solapa Fichas y de ninguna otra, así que esto no se sumó donde no
// estaba.
//
// Al unificar las dos piezas de la Planilla (D-088) esto se reescribió: la de la
// tanda 3 ordenaba re-dibujando la tabla, y la unificada **mueve las filas que ya
// están** —y reordena en el mismo movimiento la lista que miran el buscador, la
// paginación y el TOTAL— para no cortarles el hilo. Por eso se prueba acá.

test('en Variaciones, clickear el encabezado ordena la planilla y el buscador sigue vivo', async ({ page }) => {
  await abrirPlanilla(page, { fixture: 'variaciones.html' });

  const legajos = () => page.locator('table.rb-rubro tbody tr:visible td:first-child');
  await page.locator('.results-chip', { hasText: 'Todos' }).click();
  const antes = await legajos().allInnerTexts();
  expect(antes.length).toBeGreaterThan(2);

  // La columna de variación: primer click descendente en los importes.
  const th = page.locator('table.rb-rubro thead tr').nth(1).locator('th', { hasText: 'Variación' }).first();
  await th.click();
  const desc = await legajos().allInnerTexts();
  expect(desc).not.toEqual(antes);
  await expect(th).toHaveAttribute('aria-sort', 'descending');

  // El segundo click invierte, y da exactamente el orden de vuelta.
  await th.click();
  await expect(th).toHaveAttribute('aria-sort', 'ascending');
  const asc = await legajos().allInnerTexts();
  expect(asc).toEqual([...desc].reverse());

  // Y con la tabla reordenada el buscador sigue apuntando a las filas de verdad:
  // si el reorden le hubiera cortado el hilo, no encontraría ninguna.
  const legajo = asc[asc.length - 1].trim();
  await page.fill('.table-search__input', legajo);
  await page.locator('.table-search__option').first().click();
  const visibles = await legajos().allInnerTexts();
  expect(visibles.map(t => t.trim())).toEqual([legajo]);
});
