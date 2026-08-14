// resultsResumen.spec.js — La solapa Resumen de Resultados en un navegador real
// (rediseño, pantalla 6 de docs/rediseno/README.md).
//
// Corre sobre un fixture y no sobre la app entera a propósito: el fixture monta
// el render real (hero + tarjetas + barra superior + solapas) con datos
// inventados, sin IndexedDB ni los CDN de index.html.
//
// Lo que fija, en orden de qué cuesta más caro si se rompe:
//   1. El veredicto y el contexto del cliente viven en la barra ÚNICA: si
//      alguien vuelve a montar una segunda franja propia, el "volver" y el
//      "Cliente · Período" se duplican.
//   2. El control en rojo va primero y con borde de error — es el orden de
//      presentación que hace que el analista mire lo que hay que mirar.
//   3. "Ver detalle →" lleva a la solapa Detalle (si no, el link no lleva a
//      ningún lado y el Resumen es una pantalla muerta).
//   4. El menú de export avisa que el archivo lleva datos personales
//      (CLAUDE.md §Privacidad).

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/resultsResumen.html';

test('verde: el veredicto está en la barra única y el hero dice "Sin diferencias"', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=verde`);

  // Contexto y veredicto, en la barra superior — no en una franja propia.
  const header = page.locator('.app-header');
  await expect(header.locator('.app-header__client')).toHaveText('Cliente Demo');
  await expect(header.locator('.results-header-ctx__verdict')).toContainText('1 de 1 control en verde');
  await expect(page.locator('.results-ctx-bar')).toHaveCount(0);

  // Hero: icono de estado, título y KPIs.
  await expect(page.locator('.results-hero__icon--ok')).toBeVisible();
  await expect(page.locator('.results-hero__title')).toHaveText('Sin diferencias');
  await expect(page.locator('.results-hero__kpi-value').first()).toHaveText('514');
  await expect(page.locator('.results-hero')).toContainText('Legajos cruzados');
  await expect(page.locator('.results-hero')).toContainText('Controles en verde');

  // Una tarjeta por control, con su dot y su acción.
  const card = page.locator('.results-ctrl-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('514 legajos evaluados');
  await expect(card.locator('.results-ctrl-card__link')).toHaveText('Ver detalle →');
});

test('rojo: el control con diferencias va primero, con borde de error', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=rojo`);

  await expect(page.locator('.results-hero__icon--error')).toBeVisible();
  await expect(page.locator('.results-hero__title')).toHaveText('23 legajos con diferencias');

  // El KPI de diferencias sale en rojo, no en celeste.
  const diffKpi = page.locator('.results-hero__kpi-value--diff').first();
  await expect(diffKpi).toHaveText('23');

  const cards = page.locator('.results-ctrl-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Brutos');
  await expect(cards.nth(0)).toHaveClass(/results-ctrl-card--error/);
  await expect(cards.nth(0)).toContainText('23 legajos con diferencia (4,5%)');
  await expect(cards.nth(0).locator('.results-ctrl-card__link')).toHaveText('Ver los 23 →');
  await expect(cards.nth(1)).toContainText('GS Pers');
});

test('"Ver detalle →" cambia a la solapa Detalle', async ({ page }) => {
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
  // …y dentro de la ficha del control, su propia solapa Detalle (la tabla).
  await page.click('.control-card .tabs__tab:has-text("Detalle")');

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
  await page.locator('.results-hero__title').click();
  await expect(panel).toBeHidden();
});
