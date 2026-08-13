// themePicker.spec.js — El selector de tema de la barra superior.
//
// Cubre las tres reglas que se rompen en silencio: que los tres temas se
// apliquen y se guarden, que la clave vieja de localStorage (`light`/`dark`,
// la que dejó el toggle 🌙) se migre a `sobrio`/`oscuro` sin que el analista
// tenga que hacer nada, y que el tema Intenso salga SÓLO de variables — si
// alguien lo resuelve con una regla por tema, el color de la barra deja de
// seguir al token y este test lo marca.

import { test, expect } from '@playwright/test';

const TEMAS = ['sobrio', 'intenso', 'oscuro'];

async function temaAplicado(page) {
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

test('elegir un tema lo aplica, lo tilda en el menú y lo deja guardado', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#js-theme-toggle')).toBeVisible();

  for (const tema of TEMAS) {
    await page.click('#js-theme-toggle');
    await expect(page.locator('#js-theme-panel')).toBeVisible();

    await page.click(`[data-theme-value="${tema}"]`);
    expect(await temaAplicado(page)).toBe(tema);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(tema);
    // Elegir cierra el menú
    await expect(page.locator('#js-theme-panel')).toBeHidden();

    // …y al volver a abrirlo, el elegido es el que está tildado
    await page.click('#js-theme-toggle');
    await expect(page.locator(`[data-theme-value="${tema}"]`)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('#js-theme-panel')).toBeHidden();
  }

  // Y sobrevive a la recarga (lo aplica el script del <head>, sin parpadeo)
  await page.reload();
  expect(await temaAplicado(page)).toBe('oscuro');
});

test('la clave vieja del toggle 🌙 se migra: light→sobrio y dark→oscuro', async ({ page }) => {
  for (const [viejo, nuevo] of [['light', 'sobrio'], ['dark', 'oscuro']]) {
    await page.goto('/');
    await page.evaluate((v) => localStorage.setItem('theme', v), viejo);
    await page.reload();

    expect(await temaAplicado(page)).toBe(nuevo);
    await expect(page.locator(`[data-theme-value="${nuevo}"]`)).toHaveAttribute('aria-checked', 'true');
    // La migración queda escrita: el valor viejo no vuelve a leerse nunca más
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(nuevo);
  }
});

test('Intenso sale sólo de variables: la barra y sus tokens cambian sin reglas por tema', async ({ page }) => {
  await page.goto('/');
  const barra = page.locator('.app-header');

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'sobrio'));
  expect(await barra.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'intenso'));
  expect(await barra.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(21, 38, 61)');

  // Los tokens nuevos resuelven en los tres temas — uno sin default en un tema
  // devuelve '' y el componente que lo use queda sin estilo (tokenDefaults.spec.js).
  for (const tema of TEMAS) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
    const vacios = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return ['--primary-disabled', '--table-head-border', '--popover-shadow', '--card-border', '--font-display']
        .filter((t) => cs.getPropertyValue(t).trim() === '');
    });
    expect(vacios, `tokens sin valor en el tema ${tema}`).toEqual([]);
  }
});

test('la app ya no tiene footer institucional, pero el banner de privacidad sigue', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-footer')).toHaveCount(0);
  await expect(page.locator('#js-privacy-banner')).toBeVisible();
});
