// popVariaciones.spec.js — La pantalla de resultados de "Variación entre
// quincenas" (POP · Axton) en un navegador real.
//
// Lo que se verifica acá y no en el test de unidad: que el Resumen y la Planilla
// se dibujen de verdad, que la marca de "sin dato" se lea distinta de un cero
// —que es la confusión que este control tiene que evitar— y que la pantalla se
// lea en los tres temas. Fixture con datos inventados.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/popVariaciones.html';

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => window.__listo);
});

test('el Resumen muestra el veredicto, las tarjetas y los chequeos de coherencia', async ({ page }) => {
  await expect(page.locator('.rb-verdict')).toBeVisible();
  // 6 tarjetas: legajos, con variación, sin variación, sin valor hora, altas/bajas, CBU.
  await expect(page.locator('.rb-tile')).toHaveCount(6);
  // Los chequeos de sumas contra TOTAL GENERAL y el orden de los dos archivos.
  const checks = page.locator('.rb-chk');
  expect(await checks.count()).toBeGreaterThanOrEqual(3);
  // El bloque de diferencias contra el reporte de Axton.
  await expect(page.locator('.rb-issues .rb-issue').first()).toBeVisible();
});

test('la Planilla lista los legajos y "—" no se lee como un cero', async ({ page }) => {
  await page.locator('[role="tab"]', { hasText: 'Planilla' }).click();
  const tabla = page.locator('table.data-table');
  await expect(tabla).toBeVisible();

  // La columna de valor hora del legajo que no liquidó el concepto: "—", no 0,00.
  const celdas = await tabla.locator('tbody td').allInnerTexts();
  expect(celdas).toContain('—');
  expect(celdas.filter(t => t.trim() === '0,00').length).toBe(0);

  // El encabezado de cada valor hora trae la quincena que salió del propio archivo.
  const heads = await tabla.locator('thead th').allInnerTexts();
  expect(heads.some(h => h.includes('1ª quinc. 07/2026'))).toBe(true);
  expect(heads.some(h => h.includes('2ª quinc. 07/2026'))).toBe(true);
});

test('"Marcas ▾" deja ver sólo los movimientos y el total sigue a la selección', async ({ page }) => {
  await page.locator('[role="tab"]', { hasText: 'Planilla' }).click();
  // Filas VISIBLES: el `Marcas ▾` de la planilla estándar oculta las que no
  // entran en la selección en vez de rehacer la tabla.
  const filas = page.locator('table.data-table tbody tr:visible');
  const todas = await filas.count();

  await page.selectOption('[data-marca-filter]', 'movs');
  const movs = await filas.count();
  expect(movs).toBeGreaterThan(0);
  expect(movs).toBeLessThan(todas);

  // El rótulo del pie nombra la unidad (D-058/D-060): "N legajos", no "N filas".
  await expect(page.locator('table.data-table tfoot')).toContainText('legajos');
});

// Los tres temas — la pantalla se recorre en los tres antes de darla por cerrada
// (D-059). Acá se verifica lo que un screenshot no puede afirmar solo: que el
// texto de las marcas S/N y de los "—" tenga contraste suficiente contra su
// fondo en cada tema.
for (const tema of ['sobrio', 'intenso', 'oscuro']) {
  test(`${tema}: las marcas S/N y los "—" de la planilla se leen`, async ({ page }) => {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);
    await page.locator('[role="tab"]', { hasText: 'Planilla' }).click();

    const contraste = await page.locator('table.data-table tbody .badge').first().evaluate((el) => {
      const lum = (c) => {
        const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map(v => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      // El fondo efectivo se COMPONE: la planilla tiñe la banda con un color
      // translúcido, y leer ese `rgba(21, 38, 61, 0.043)` como si fuera opaco
      // daba "texto negro sobre casi negro" — un contraste inventado. Se apilan
      // las capas hasta la primera opaca y se mezclan de abajo hacia arriba.
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
      let fondoRgb = capas[capas.length - 1];
      for (let i = capas.length - 2; i >= 0; i--) {
        const c = capas[i];
        fondoRgb = {
          r: c.r * c.a + fondoRgb.r * (1 - c.a),
          g: c.g * c.a + fondoRgb.g * (1 - c.a),
          b: c.b * c.a + fondoRgb.b * (1 - c.a),
          a: 1,
        };
      }
      const a = lum(getComputedStyle(el).color);
      const b = lum(`rgb(${fondoRgb.r}, ${fondoRgb.g}, ${fondoRgb.b})`);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });

    // 4,5:1 es AA para texto normal; estas marcas son chicas y en negrita.
    expect(contraste).toBeGreaterThanOrEqual(4.5);
  });
}
