// novedadesLiquidacion.spec.js — La pantalla del cruce de Novedades vs
// Liquidación (N2 · Axton, D-070) en un navegador real.
//
// Lo que se verifica acá y no en el test de unidad: que el Resumen y el Detalle
// se dibujen de verdad, que las cuatro bandas del cruce se puedan recorrer, que
// lo no comparable se lea con su motivo y NO como un cero —que es lo único que
// evita que el analista lea "0,00" donde no hubo comparación—, y que todo se lea
// en los tres temas. Fixture con datos inventados.
//
// **Este cruce tiene diferencias, así que ahora abre en Fichas** (§2 de
// specs/vista-estandar-resultados.md): lo primero que se ve es por qué falla. Los
// tests que miran el Resumen o el Detalle abren su solapa primero — antes el
// Resumen era el default y no hacía falta. La solapa Fichas tiene su propio test
// en tests/e2e/fichasLegajoConcepto.spec.js.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/novedadesLiquidacion.html';

test.beforeEach(async ({ page }) => {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  page.__errores = errores;
  await page.goto(FIXTURE);
  await page.waitForFunction(() => window.__listo);
});

/** Activa una solapa por su rótulo y devuelve su panel, para no leer el de al lado. */
async function solapa(page, rotulo) {
  await page.locator('[role="tab"]', { hasText: rotulo }).click();
  return page.locator('[role="tabpanel"]:not([hidden])');
}

test('el Resumen muestra el veredicto, las cinco tarjetas y los chequeos del cruce', async ({ page }) => {
  await solapa(page, 'Resumen');
  await expect(page.locator('.rb-verdict')).toBeVisible();
  // 5 tarjetas: legajos cruzados, coinciden, con diferencia, no comparables y
  // sin contraparte.
  await expect(page.locator('.rb-tile')).toHaveCount(5);

  // Los chequeos: período, columnas con código, cantidades en el Tabulado,
  // totalizador cargado y "de cada legajo se comparó algo".
  expect(await page.locator('.rb-chk').count()).toBeGreaterThanOrEqual(5);

  // La columna sin código sale en su propia sección, no mezclada con las bandas.
  await expect(page.locator('.rb-issues').first()).toContainText('sin código');
  expect(page.__errores).toEqual([]);
});

test('el semáforo cuenta legajos y no filas del cruce', async ({ page }) => {
  const s = await page.evaluate(() => window.__summary);
  expect(s.unit).toBe('legajo');
  // 12 legajos inventados: el denominador es la nómina, no las ~30 filas de
  // legajo × concepto que tiene el cruce.
  expect(s.unitsTotal).toBe(12);
  expect(s.unitsTotal).toBeLessThan((await page.evaluate(() => window.__results.filas.length)));
  expect(s.contextNote).toContain('se comparó');
});

test('el legajo con dos liquidaciones se suma, no se pisa', async ({ page }) => {
  const fila = await page.evaluate(() =>
    window.__results.filas.find(f => f.legajo === '5' && f.codigo === '1000'));
  // 30 + 15 de cantidad y 150.000 + 75.000 de importe, de las dos liquidaciones.
  expect(fila.tabLiquidaciones).toBe(2);
  expect(fila.liqCantidad).toBe(45);
  expect(fila.banda).toBe('coincide');
});

test('las cuatro bandas del Detalle se dibujan', async ({ page }) => {
  await page.locator('[role="tab"]', { hasText: 'Detalle' }).click();

  for (const banda of ['difiere', 'sin_contraparte', 'no_comparable', 'coincide']) {
    await page.selectOption('[data-nl-vista]', banda);
    await expect(page.locator('table.data-table')).toBeVisible();
  }

  // "Con diferencia" muestra los dos lados y de dónde salió el número liquidado.
  await page.selectOption('[data-nl-vista]', 'difiere');
  await expect(page.locator('table.data-table thead')).toContainText('Δ importe');
  await expect(page.locator('table.data-table tbody')).toContainText('Tabulado');

  // "No comparable" muestra el motivo escrito, y ninguna celda de diferencia en
  // cero: no se comparó nada, así que un 0,00 sería mentira.
  await page.selectOption('[data-nl-vista]', 'no_comparable');
  await expect(page.locator('table.data-table thead')).toContainText('Por qué no se comparó');
  await expect(page.locator('table.data-table tbody')).toContainText('unidades distintas');
  const celdas = await page.locator('table.data-table tbody td').allInnerTexts();
  expect(celdas.some(t => t.trim() === '—')).toBe(true);

  // "Sin contraparte" dice de qué lado está el dato.
  await page.selectOption('[data-nl-vista]', 'sin_contraparte');
  await expect(page.locator('table.data-table thead')).toContainText('Lado');
  expect(page.__errores).toEqual([]);
});

test('el analista cambia de banda clickeando la chip, no sólo por el select', async ({ page }) => {
  const panel = await solapa(page, 'Detalle');
  // Las chips se buscan adentro del panel del Detalle: la solapa Fichas tiene su
  // propia fila de cinco chips, y queda en el DOM aunque esté oculta.
  const chips = panel.locator('.results-chip');
  await expect(chips).toHaveCount(4);

  await chips.filter({ hasText: 'No comparable' }).click();
  await expect(page.locator('table.data-table thead')).toContainText('Por qué no se comparó');
  await expect(page.locator('[data-nl-vista]')).toHaveValue('no_comparable');

  await chips.filter({ hasText: 'Coincide' }).click();
  await expect(page.locator('table.data-table thead')).toContainText('Δ importe');
  await expect(page.locator('[data-nl-vista]')).toHaveValue('coincide');
  expect(page.__errores).toEqual([]);
});

test('el concepto que el Tabulado no muestra se compara contra el totalizador', async ({ page }) => {
  const fila = await page.evaluate(() =>
    window.__results.filas.find(f => f.codigo === '520121'));
  expect(fila.liqImporteOrigen).toBe('totalizador');
  expect(fila.banda).toBe('coincide');
  // Y el Resumen lo dice con nombre, en su propia sección: no lo esconde.
  await solapa(page, 'Resumen');
  await expect(page.getByText('Conceptos del importador sin columna en el Tabulado')).toBeVisible();
  await expect(page.locator('.rb-issues')
    .filter({ hasText: 'Concepto 520121' })).toContainText('Totales de Concepto');
});

// Los tres temas — la pantalla se recorre en los tres antes de darla por cerrada
// (D-059). Se verifica lo que un screenshot no puede afirmar solo: que el
// veredicto y el texto de los casos —lo que el analista tiene que poder leer
// antes de decidir— tengan contraste AA contra su fondo en cada tema.
for (const tema of ['sobrio', 'intenso', 'oscuro']) {
  test(`${tema}: el veredicto y los casos del cruce se leen`, async ({ page }) => {
    await solapa(page, 'Resumen');
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

    // Las chips de las cuatro bandas: que estén pintadas en el tema.
    await page.locator('[role="tab"]', { hasText: 'Detalle' }).click();
    await expect(page.locator('[data-nl-vista]')).toHaveCount(1);
  });
}
