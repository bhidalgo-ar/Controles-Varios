// resultsResumen.spec.js — La solapa Resumen de Resultados en un navegador real:
// el TABLERO del run (docs/handoff-resumen-netos.md, pantallas 3a y 3b).
//
// Corre sobre un fixture y no sobre la app entera a propósito: el fixture monta
// el render real (tablero + barra superior + solapas) con datos inventados
// —jugadores de Banfield—, sin IndexedDB ni los CDN de index.html.
//
// Lo que fija, en orden de qué cuesta más caro si se rompe:
//   1. El veredicto y el contexto del cliente viven en la barra ÚNICA: si
//      alguien vuelve a montar una segunda franja propia, el "volver" y el
//      "Cliente · Período" se duplican.
//   2. El veredicto es una ACCIÓN en palabras y la escala se dibuja contra el
//      umbral REAL del semáforo — no contra un 2 % cableado.
//   3. El control en rojo va primero y con borde de error — es el orden de
//      presentación que hace que el analista mire lo que hay que mirar.
//   4. "Ver los N →" lleva a la solapa Detalle **con el filtro puesto** (si el
//      filtro no arranca, el analista cae en una tabla de 380 filas y tiene que
//      volver a buscar los 19 que venía a ver).
//   5. La banda rayada de "Sin identificar" está dibujada cuando la atribución
//      es parcial: un corte que se muestra completo sin serlo es peor que no
//      mostrarlo.
//   6. El menú de export avisa que el archivo lleva datos personales
//      (CLAUDE.md §Privacidad).

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/resultsResumen.html';

test('verde: el veredicto está en la barra única y dice que se puede liberar', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=verde`);

  // Contexto y veredicto, en la barra superior — no en una franja propia.
  const header = page.locator('.app-header');
  await expect(header.locator('.app-header__client')).toHaveText('Cliente Demo');
  await expect(header.locator('.results-header-ctx__verdict')).toContainText('1 de 1 control en verde');
  await expect(page.locator('.results-ctx-bar')).toHaveCount(0);

  // El veredicto es una ACCIÓN en palabras, no un número — y el círculo con "!"
  // del hero anterior ya no existe.
  await expect(page.locator('.rsm-verdict--ok')).toBeVisible();
  await expect(page.locator('.rsm-verdict__title')).toHaveText('Listo para liberar');
  await expect(page.locator('.results-hero__icon')).toHaveCount(0);
  await expect(page.locator('.rsm-verdict')).toContainText('514 legajos evaluados');
  await expect(page.locator('.rsm-verdict')).toContainText('Legajos cruzados');
  await expect(page.locator('.rsm-kpi__value').first()).toHaveText('514');

  // Con cero diferencias, el marcador de la escala está en 0 y los cortes no se
  // renderizan: no hay nada que cortar.
  await expect(page.locator('.rsm-scale__marker-value')).toHaveText('0,0%');
  await expect(page.locator('.rsm-cut')).toHaveCount(0);
});

test('rojo: el control con diferencias va primero, con borde de error', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=rojo`);

  await expect(page.locator('.rsm-verdict--error')).toBeVisible();
  await expect(page.locator('.rsm-verdict__title')).toHaveText('No liberar');

  const cards = page.locator('.results-ctrl-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Brutos');
  await expect(cards.nth(0)).toHaveClass(/results-ctrl-card--error/);
  await expect(cards.nth(0)).toContainText('23 de 514 legajos');
  await expect(cards.nth(0).locator('.results-ctrl-card__pct')).toHaveText('4,5 %');
  await expect(cards.nth(0).locator('.rsm-link')).toHaveText('Ver los 23 →');
  await expect(cards.nth(1)).toContainText('GS Pers');
});

test('3a: el tablero completo del run de un control, bloque por bloque', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=3a`);

  // 1 — el veredicto: la acción, y el múltiplo contra el umbral REAL (2 %).
  await expect(page.locator('.rsm-verdict__title')).toHaveText('No liberar la liquidación');
  await expect(page.locator('.rsm-verdict__subline')).toContainText('116 de 380 legajos con diferencia');
  await expect(page.locator('.rsm-verdict__subline')).toContainText('El corte de rojo es 2 %');
  await expect(page.locator('.rsm-verdict__subline')).toContainText('15 veces');
  await expect(page.locator('.rsm-scale__marker-value')).toHaveText('30,5%');
  // Los dos KPIs que el hero no tenía y son la primera pregunta del analista.
  await expect(page.locator('.rsm-verdict')).toContainText('Sin comparar');
  await expect(page.locator('.rsm-verdict')).toContainText('Tolerancia');

  // 2 — el puente cierra, y lo sin comparar se dice APARTE (D-086).
  const puente = page.locator('.rsm-card--bridge');
  await expect(puente).toContainText('Neto teórico');
  await expect(puente).toContainText('+ Sin explicar');
  await expect(puente).toContainText('Neto liquidado');
  await expect(puente.locator('.rsm-bridge__uncompared')).toContainText('sin neto liquidado');
  await expect(puente.locator('.rsm-prop__note')).toContainText('% del neto teórico del mes');

  // 2b — los dos lados, con el neto y el bruto al pie.
  const lados = page.locator('.rsm-card--sides');
  await expect(lados).toContainText('Pagamos de más');
  await expect(lados).toContainText('Pagamos de menos');
  await expect(lados).toContainText('Neto');
  await expect(lados).toContainText('Bruto');

  // 3 — los tres cortes, con la banda rayada de "Sin identificar".
  await expect(page.locator('.rsm-cut')).toHaveCount(3);
  await expect(page.locator('.rsm-cut__fill--unident')).toBeVisible();
  await expect(page.locator('.rsm-cut__row--unident')).toContainText('Sin identificar');

  // 4 y 5 — la evolución (6 barras: 5 períodos anteriores + el actual) y el top.
  await expect(page.locator('.rsm-history__bar')).toHaveCount(6);
  await expect(page.locator('.rsm-history__reading')).toContainText('Venía en 3,9 %');
  await expect(page.locator('.rsm-top__table tr')).toHaveCount(5);
  await expect(page.locator('.rsm-top__go .rsm-link').first()).toHaveText('ficha →');
});

test('3b: el veredicto se comprime, aparece la tira de semáforos y los verdes van juntos', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=3b`);

  await expect(page.locator('.rsm-verdict--compact')).toBeVisible();
  await expect(page.locator('.rsm-verdict__title')).toHaveText('No liberar');
  await expect(page.locator('.rsm-verdict__subline')).toContainText('3 controles en rojo bloquean el cierre');

  // La tira: un bloque por control, en el orden de severidad.
  await expect(page.locator('.rsm-strip__block')).toHaveCount(9);
  await expect(page.locator('.rsm-strip__block--error')).toHaveCount(3);
  await expect(page.locator('.rsm-strip__block--warn')).toHaveCount(2);
  await expect(page.locator('.rsm-strip__legend')).toHaveText('3 en rojo · 2 en amarillo · 4 en verde');

  // "Tocados por algún rojo" es una UNIÓN de claves, jamás una suma de conteos:
  // 116 + 44 + 31 = 191 sería más que los legajos que se cruzaron.
  const tocados = page.locator('.rsm-kpi', { hasText: 'tocados por algún rojo' });
  await expect(tocados).toBeVisible();
  const n = Number((await tocados.locator('.rsm-kpi__value').innerText()).replace(/\./g, ''));
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(191);

  // Los 4 verdes no ocupan una card cada uno: van en una sola, con su cierre.
  await expect(page.locator('.results-ctrl-card--group')).toContainText('4 controles en verde');
  await expect(page.locator('.results-ctrl-card--group')).toContainText('No hay nada que revisar acá');
  await expect(page.locator('.results-ctrl-card')).toHaveCount(6);

  // Los dos cortes que sólo existen cruzando controles.
  await expect(page.locator('.rsm-row--cross .rsm-card')).toHaveCount(2);
  await expect(page.locator('.rsm-repeated')).toContainText('de 9');
});

test('"Ver los N →" cambia a la solapa Detalle CON el filtro puesto', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=rojo`);

  await expect(page.locator('#js-tab-resumen')).toBeVisible();
  await page.locator('.results-ctrl-card').nth(0).locator('.rsm-link').click();

  await expect(page.locator('#js-tab-detalle')).toBeVisible();
  // El chip "Con diferencia" arranca activo, y el cartel dice por qué.
  const chipActivo = page.locator('.control-card .results-chip--active');
  await expect(chipActivo).toContainText('Con diferencia');
  await expect(page.locator('[data-prefilter-hint]')).toContainText('venías del Resumen');
});

test('las solapas Resumen / Detalle siguen cambiando a mano', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=verde`);

  await expect(page.locator('#js-tab-resumen')).toBeVisible();
  await expect(page.locator('#js-tab-detalle')).toBeHidden();

  await page.click('.results-tab:has-text("Detalle")');
  await expect(page.locator('#js-tab-detalle')).toBeVisible();
  await expect(page.locator('#js-tab-resumen')).toBeHidden();

  await page.click('.results-tab:has-text("Resumen")');
  await expect(page.locator('#js-tab-resumen')).toBeVisible();
});

test('"Detalles del run" lista los avisos con los que se corrió', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=rojo`);

  await page.click('.run-details > summary');
  const popover = page.locator('.run-details__popover');
  await expect(popover).toBeVisible();

  // Los estados del run siguen igual — el bloque de avisos se suma, no reemplaza.
  await expect(popover).toContainText('📝 Borrador');

  const avisos = popover.locator('.run-warnings');
  await expect(avisos.locator('.run-warnings__label')).toHaveText('2 avisos de esta corrida');
  await expect(avisos).toContainText('la sigla del nombre no coincide');
  await expect(avisos).toContainText('no parecen importes');
});

test('una corrida sin avisos lo dice (y una vieja, sin el campo, se lee igual)', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=verde`);

  await page.click('.run-details > summary');
  await expect(page.locator('.run-details__popover .run-warnings--empty'))
    .toHaveText('Sin avisos en esta corrida.');
});

test('la barra de herramientas del Detalle queda a la vista al scrollear', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=rojo`);
  await page.click('.results-tab:has-text("Detalle")');
  // …y dentro de la ficha del control, su propia solapa Planilla (la tabla).
  await page.click('.control-card .tabs__tab:has-text("Planilla")');

  const toolbar = page.locator('.results-toolbar--sticky');
  await expect(toolbar).toBeVisible();
  const antes = await toolbar.boundingBox();

  // Quien scrollea es .page-content (regla 1 del rediseño). La ficha del control
  // recorta con `overflow: clip`: con `hidden` sería un scroller intermedio y la
  // barra se anclaría ahí, o sea nunca.
  await page.locator('.page-content').evaluate(el => { el.scrollTop = 400; });
  await expect.poll(async () => (await toolbar.boundingBox()).y).toBeLessThanOrEqual(antes.y);
  await expect(toolbar).toBeInViewport();
  await expect(page.locator('.results-toolbar--sticky .btn')).toBeVisible();
});

test('el menú Exportar ofrece Excel y JSON, y avisa que lleva datos personales', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=rojo`);

  const menu = page.locator('.app-header__primary');
  const trigger = menu.locator('.btn--primary');
  await expect(trigger).toHaveText('⬇ Exportar ▾');
  await trigger.click();

  const panel = menu.locator('.row-menu__panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Excel (.xlsx)');
  await expect(panel).toContainText('JSON de la corrida');
  await expect(panel.locator('.export-menu__note')).toContainText('datos personales');

  // El listener de click-afuera que comparte con el menú "⋯" del home sigue vivo.
  await page.locator('.rsm-verdict__title').click();
  await expect(panel).toBeHidden();
});

// ── Lo que la barra ink de Intenso rompe si nadie lo mira ───────────────────
// Los dos casos salieron de recorrer las pantallas en los tres temas: la barra
// de Intenso es ink, y todo lo que se apoya en ella necesita tonos de fondo
// oscuro. Los tonos --ok-tx/--warn-tx/--error-tx están calculados para
// superficies claras.

test('Intenso: el veredicto sobre la barra ink usa el tono de barra, no el de superficie clara', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=rojo`);
  const verdict = page.locator('.results-header-ctx__verdict');
  await expect(verdict).toBeVisible();

  const colorEn = async (tema) => {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
    return verdict.evaluate((el) => getComputedStyle(el).color);
  };

  // En Sobrio la barra es blanca: el rojo oscuro de siempre.
  expect(await colorEn('sobrio')).toBe('rgb(192, 66, 15)');
  // En Intenso la barra es ink y ese rojo queda en 2,9:1 — tiene que aclararse
  // (así se ve en docs/rediseno/screenshots/21-detalle-23-intenso.png).
  expect(await colorEn('intenso')).not.toBe('rgb(192, 66, 15)');
});

test('Intenso: los botones del popover de "Detalles del run" no heredan el color de la barra', async ({ page }) => {
  // El popover cuelga del DOM de la barra pero se dibuja sobre una superficie
  // blanca. Con el color de la barra, "📌 Marcar como definitivo" quedaba en
  // #C7D5E4 sobre blanco: 1,5:1, invisible.
  await page.goto(`${FIXTURE}?caso=rojo`);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'intenso'));

  await page.locator('.run-details summary').click();
  const popover = page.locator('.run-details__popover');
  await expect(popover).toBeVisible();

  const boton = popover.locator('.btn--ghost').first();
  await expect(boton).toBeVisible();

  const { fg, bg } = await boton.evaluate((el) => {
    let node = el, bg = 'rgba(0, 0, 0, 0)';
    while (node) {
      const c = getComputedStyle(node).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)') { bg = c; break; }
      node = node.parentElement;
    }
    return { fg: getComputedStyle(el).color, bg };
  });

  const canal = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const [r, g, b] = canal(c).map(f);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(fg), l2 = lum(bg);
  const contraste = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  expect(contraste, `"${await boton.textContent()}" en ${fg} sobre ${bg}`).toBeGreaterThan(3);
});
