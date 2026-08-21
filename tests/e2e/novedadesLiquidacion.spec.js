// novedadesLiquidacion.spec.js — La pantalla del cruce de Novedades vs
// Liquidación (N2 · Axton, D-070) en un navegador real.
//
// Lo que se verifica acá y no en el test de unidad: que el Resumen y la Planilla
// se dibujen de verdad, que las cuatro bandas del cruce se puedan recorrer desde
// los cinco chips de estado, que lo no comparable se lea con su motivo y NO como
// un cero —que es lo único que evita que el analista lea "0,00" donde no hubo
// comparación—, y que todo se lea en los tres temas. Fixture con datos inventados.
//
// **Este cruce tiene diferencias, así que abre en Fichas** (§2 de
// specs/vista-estandar-resultados.md): lo primero que se ve es por qué falla. Los
// tests que miran el Resumen o la Planilla abren su solapa primero, y buscan
// adentro del panel activo — la solapa Fichas tiene su propia fila de cinco chips
// y queda en el DOM aunque esté oculta. La solapa Fichas tiene su propio test en
// tests/e2e/fichasLegajoConcepto.spec.js.


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

test('la Planilla trae las dos medidas, la diferencia y de dónde sale el número', async ({ page }) => {
  await solapa(page, 'Planilla');

  const thead = page.locator('table.data-table thead');
  await expect(thead).toContainText('Δ importe');
  await expect(thead).toContainText('Δ cantidad');
  await expect(thead).toContainText('De dónde sale');
  // Las bandas del §5: lo pedido, lo liquidado y la diferencia, en el 1er nivel.
  await expect(thead).toContainText('Novedad');
  await expect(thead).toContainText('Liquidación');
  await expect(thead).toContainText('Diferencia');
  expect(page.__errores).toEqual([]);
});

test('las cuatro bandas del cruce se recorren con los cinco chips de estado', async ({ page }) => {
  // Los chips se buscan adentro del panel de la Planilla: la solapa Fichas tiene
  // su propia fila de cinco y queda en el DOM aunque esté oculta.
  const panel = await solapa(page, 'Planilla');

  // Los cinco del estándar, con esas palabras y en ese orden (§3).
  const chips = panel.locator('.results-chip');
  await expect(chips).toHaveCount(5);
  expect((await chips.allInnerTexts()).map(t => t.trim().split(/\s+/).slice(0, -1).join(' ')))
    .toEqual(['Todos', 'Con diferencia', 'Dentro del margen', 'Al centavo', 'Sin comparar']);


  // "Sin comparar" junta lo no comparable y lo que no tiene contraparte: el
  // motivo se lee en la columna de contexto, y la diferencia NO sale en cero.
  await chips.filter({ hasText: 'Sin comparar' }).click();
  await expect(page.locator('table.data-table tbody')).toContainText('unidades distintas');
  const difs = await page.locator('table.data-table tbody .rb-diffbadge--warn').allInnerTexts();
  expect(difs.length).toBeGreaterThan(0);
  expect(difs.every(t => t.trim() !== '0,00')).toBe(true);

  // "Con diferencia" son las que el control marcó como `difiere`.
  await chips.filter({ hasText: 'Con diferencia' }).click();
  // Filas VISIBLES: la planilla estándar dibuja la tabla una sola vez y el chip
  // oculta lo que no entra en la selección, así que contar `tr` del DOM cuenta
  // también las escondidas. Es el mismo idioma que usan el resto de los specs
  // de la vista estándar (`loteMeta4`, `vistaEstandarLote`).
  const filas = await page.locator('table.data-table tbody tr:visible').count();
  const difieren = await page.evaluate(() =>
    window.__results.filas.filter(f => f.banda === 'difiere').length);
  expect(filas).toBe(difieren);
  expect(page.__errores).toEqual([]);
});

test('"Marcas ▾" separa lo que sólo está de un lado', async ({ page }) => {
  const panel = await solapa(page, 'Planilla');
  await panel.locator('.results-chip', { hasText: 'Todos' }).click();

  await panel.locator('[data-marca-filter]').selectOption('solo_novedad');
  const filas = await panel.locator('table.data-table tbody tr:visible').count();
  const esperadas = await page.evaluate(() =>
    window.__results.filas.filter(f => f.lado === 'solo_novedad').length);
  expect(filas).toBe(esperadas);
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
        // El fondo efectivo se COMPONE: la planilla tiñe la banda con un color
        // translúcido, y leerlo como si fuera opaco da un contraste inventado.
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
      // 4,5:1 es AA para texto normal.
      expect(contraste).toBeGreaterThanOrEqual(4.5);
    }

    // Los cinco chips de estado: que estén pintados en el tema.
    const panelPlanilla = await solapa(page, 'Planilla');
    await expect(panelPlanilla.locator('.results-chip')).toHaveCount(5);
  });
}
