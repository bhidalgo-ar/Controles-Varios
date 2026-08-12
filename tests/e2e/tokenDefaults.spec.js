// tokenDefaults.spec.js — Los tokens propios de components.css tienen que
// resolver SIEMPRE, incluido el estado por default del navegador.
//
// `--color-banner-text`, los 4 `--color-toast-*` y `--color-warning-bg-hover`
// sólo tenían valor dentro de `@media (prefers-color-scheme: dark)`,
// `[data-theme="dark"]` y `[data-theme="light"]` — nunca en un `:root` base,
// a diferencia de TODO lo demás en `css/tokens.css` (que siempre define el
// claro en `:root` y recién después overridea el oscuro). En el estado por
// default (Playwright sin `colorScheme` forzado, sin `data-theme` en el
// documento) ninguna de las tres reglas aplica, así que la variable queda
// **indefinida** — confirmado en un navegador real con
// `getComputedStyle(:root).getPropertyValue(...)` devolviendo `''`.
//
// No se rompía nada visible porque cada usuario del token tenía un fallback
// `var(--token, #hex)` que tapaba el hueco — pero eso es letra muerta en los
// otros 3 estados y la ÚNICA razón de que esto funcionara en el 4°. El fix
// real (D-041... no, Fase 2 del plan de escalabilidad) es un `:root` con el
// default, igual que tokens.css hace para todo lo demás — no un fallback por
// cada `var()` que usa el token.
//
// Test sobre un fixture (banner + los 4 toasts, sin IndexedDB) — mismo patrón
// que gridHeaderContrast.spec.js y brutosGsPersEvaluados.spec.js.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/tokenDefaults.html';

// Playwright con `colorScheme` sin especificar simula 'no preference' — el
// estado que ninguna de las 3 reglas de tema cubre. Es el caso que hay que
// probar, así que NO se usa `test.use({ colorScheme })` acá a propósito.

test('el token de --color-banner-text resuelve en el estado por default (sin data-theme, sin preferencia de sistema)', async ({ page }) => {
  await page.goto(FIXTURE);
  const value = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-banner-text').trim());
  expect(value, 'si esto está vacío, el token no tiene default en :root').not.toBe('');
});

test('el banner de privacidad se lee en el estado por default', async ({ page }) => {
  await page.goto(FIXTURE);
  const banner = page.locator('.privacy-banner__text');
  await expect(banner).toBeVisible();
  const { color, bg } = await banner.evaluate((el) => {
    const cs = getComputedStyle(el);
    let bgEl = el;
    let bg = 'rgba(0, 0, 0, 0)';
    while (bgEl) {
      const c = getComputedStyle(bgEl).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)') { bg = c; break; }
      bgEl = bgEl.parentElement;
    }
    return { color: cs.color, bg };
  });
  expect(color, 'color de texto del banner').not.toBe('rgba(0, 0, 0, 0)');
  expect(bg, 'fondo detrás del banner').not.toBe('rgba(0, 0, 0, 0)');
});

test('los 4 toasts tienen color de texto propio en el estado por default (no heredan transparente)', async ({ page }) => {
  await page.goto(FIXTURE);
  for (const variant of ['success', 'danger', 'warning', 'info']) {
    const toast = page.locator(`.toast--${variant}`);
    await expect(toast).toBeVisible();
    const color = await toast.evaluate((el) => getComputedStyle(el).color);
    expect(color, `.toast--${variant}`).not.toBe('rgba(0, 0, 0, 0)');
  }
});
