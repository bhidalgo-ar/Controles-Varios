// novedadesImportador.spec.js — La pantalla del generador de importador de
// novedades (N1 · Axton, D-070) en un navegador real.
//
// Lo que se verifica acá y no en el test de unidad: que el Resumen y el Detalle
// se dibujen de verdad, que la celda `cantidad$importe` se vea en pantalla tal
// como va a salir al archivo —es lo único que le confirma al analista qué va a
// subir a Axton—, que lo que quedó afuera se lea con su motivo, y que todo se lea
// en los tres temas. Fixture con datos inventados.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/novedadesImportador.html';

test.beforeEach(async ({ page }) => {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  page.__errores = errores;
  await page.goto(FIXTURE);
  await page.waitForFunction(() => window.__listo);
});

test('el Resumen muestra el veredicto, las tarjetas, lo que quedó afuera y los chequeos', async ({ page }) => {
  await expect(page.locator('.rb-verdict')).toBeVisible();
  // 5 tarjetas: legajos, conceptos, novedades que entran, quedó afuera, y la de
  // la comparación contra el importador ya armado.
  await expect(page.locator('.rb-tile')).toHaveCount(5);

  // Lo que quedó afuera sale con su motivo, no como un conteo suelto.
  const issues = page.locator('.rb-issues .rb-issue');
  expect(await issues.count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.rb-issues').first()).toContainText('sin código');

  // Los chequeos de armado: cuadre de importes, de cantidades, columnas con
  // concepto, unidad organizativa y comparación contra el armado.
  expect(await page.locator('.rb-chk').count()).toBeGreaterThanOrEqual(5);

  // El botón de descarga del importador está en el Resumen: es el entregable.
  await expect(page.locator('[data-f2-download]')).toBeVisible();
  await expect(page.locator('[data-f2-download]')).toContainText('F2');
  expect(page.__errores).toEqual([]);
});

test('el Detalle muestra el importador tal como va a salir, con el formato cantidad$importe', async ({ page }) => {
  await page.locator('[role="tab"]', { hasText: 'Detalle' }).click();
  const tabla = page.locator('table.data-table');
  await expect(tabla).toBeVisible();

  const celdas = await tabla.locator('tbody td').allInnerTexts();
  // La celda del importador: cantidad y importe pegados con $, coma decimal.
  expect(celdas.some(t => /^\d+\$[\d.,]+$/.test(t.trim()))).toBe(true);
  // Una cantidad suelta sale como número, sin un importe inventado al lado.
  expect(celdas.some(t => /^\d+$/.test(t.trim()))).toBe(true);
  // La celda vacía queda vacía: no viaja un 0,00 al importador.
  expect(celdas.filter(t => t.trim() === '0,00').length).toBe(0);
});

test('las cuatro vistas del Detalle se dibujan, incluida la del importador ya armado', async ({ page }) => {
  await page.locator('[role="tab"]', { hasText: 'Detalle' }).click();

  for (const vista of ['totales', 'afuera', 'contra', 'f2']) {
    await page.selectOption('[data-nov-vista]', vista);
    await expect(page.locator('table.data-table')).toBeVisible();
  }

  // La vista "Contra el F2 armado" nombra las bandas y el legajo que no llegó.
  await page.selectOption('[data-nov-vista]', 'contra');
  await expect(page.locator('table.data-table')).toContainText('Sólo en la planilla del cliente');

  // Y la de totales cierra con su fila de TOTAL nombrando la unidad (D-058/D-060).
  await page.selectOption('[data-nov-vista]', 'totales');
  await expect(page.locator('table.data-table tfoot')).toContainText('conceptos');
  expect(page.__errores).toEqual([]);
});

// Los tres temas — la pantalla se recorre en los tres antes de darla por cerrada
// (D-059). Acá se verifica lo que un screenshot no puede afirmar solo: que el
// veredicto y el caso de lo que quedó afuera —el texto que el analista tiene que
// poder leer antes de subir el archivo— tengan contraste suficiente contra su
// fondo en cada tema, y que el botón de descarga quede pintado. El `__why` de
// abajo va en `--t3` a 11,5 px: ese par es del sistema de diseño, lo comparten
// las listas de casos de todos los controles y se mide donde se define.
for (const tema of ['sobrio', 'intenso', 'oscuro']) {
  test(`${tema}: el veredicto y los casos de lo que quedó afuera se leen`, async ({ page }) => {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);

    for (const sel of ['.rb-verdict h3', '.rb-issue__what', '.rb-issue__who']) {
      const contraste = await page.locator(sel).first().evaluate((el) => {
        const lum = (c) => {
          const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        let fondo = 'rgb(255, 255, 255)';
        for (let n = el; n; n = n.parentElement) {
          const bg = getComputedStyle(n).backgroundColor;
          if (bg && !bg.startsWith('rgba(0, 0, 0, 0)')) { fondo = bg; break; }
        }
        const a = lum(getComputedStyle(el).color), b = lum(fondo);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      // 4,5:1 es AA para texto normal.
      expect(contraste).toBeGreaterThanOrEqual(4.5);
    }

    // El botón de descarga: que esté pintado en el tema (no transparente sobre
    // transparente). El par de colores de `.btn--primary` es del sistema de
    // diseño y se mide donde se define, no acá.
    const bg = await page.locator('[data-f2-download]').evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg.startsWith('rgba(0, 0, 0, 0)')).toBe(false);
  });
}
