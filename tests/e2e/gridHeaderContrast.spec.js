// gridHeaderContrast.spec.js — La capa visual de una tabla de resultados, en un
// navegador real y en los dos temas.
//
// Cubre dos cosas que se descubrieron juntas el 2026-08-12, las dos en el
// control NR pero las dos compartidas:
//
//   1. **El encabezado de las grids era ilegible en modo claro.** `.data-table
//      thead` pone texto blanco; `table.rb-grid thead th` le pisaba el fondo con
//      `--color-bg-subtle`, que en claro es #ECEEF0 → blanco sobre gris claro. En
//      oscuro ese token es #181E22 y se leía bien, y como el equipo usa oscuro
//      estuvo así sin que nadie lo viera. Alcanzaba a los 15 lugares que llaman
//      a `enhanceGrid()`, no sólo a NR.
//   2. **Un control que cierra sin diferencias perdía el exportable.** La solapa
//      «Detalle» de NR salía con el cartel de OK y sin toolbar, justo cuando el
//      analista quiere bajarse el archivo que respalda que el control cerró.
//
// Se testea sobre un fixture y no sobre la app entera a propósito: el fixture
// monta el render real del control con datos inventados, sin IndexedDB ni los
// CDN de index.html, así que la verificación es del CSS y del render y no del
// camino completo de carga de archivos (eso ya lo cubren los otros e2e).

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/nrDetalle.html';

/** `rgb()`/`rgba()` → `[r, g, b, a]`. */
function parseColor(c) {
  const n = c.match(/[\d.]+/g).map(Number);
  return [n[0], n[1], n[2], n[3] ?? 1];
}

/**
 * Compone un color sobre otro. Hace falta porque los controles pintan las
 * columnas con tintes translúcidos (`rgba(56,142,60,0.18)`): medir contraste
 * contra el tinte crudo, sin componerlo sobre el fondo del encabezado, da un
 * número que no es el que ve nadie.
 */
function flatten(fg, bg) {
  const [r1, g1, b1, a] = parseColor(fg);
  const [r2, g2, b2]    = parseColor(bg);
  return `rgb(${r1 * a + r2 * (1 - a)}, ${g1 * a + g2 * (1 - a)}, ${b1 * a + b2 * (1 - a)})`;
}

/** Contraste WCAG entre dos colores opacos. 4.5:1 es el mínimo para texto normal. */
function contrastRatio(colorA, colorB) {
  const lum = (c) => {
    const [r, g, b] = parseColor(c).slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(colorA), b = lum(colorB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Color de texto y fondo efectivo de un `th` de la fila de COLUMNAS del
 * encabezado (sube por el árbol hasta el primer fondo opaco).
 *
 * Es la ÚLTIMA fila del `<thead>`: en la planilla del estándar arriba va la fila
 * de bandas, que se pinta aparte y sobre fondo oscuro (§5).
 */
async function headerColors(page, nth) {
  const raw = await page.evaluate((i) => {
    const th = document.querySelectorAll('table.rb-grid thead tr:last-child th')[i];
    // Todas las capas de fondo, de la celda hacia arriba, hasta la primera opaca.
    const capas = [];
    for (let el = th; el; el = el.parentElement) {
      const c = getComputedStyle(el).backgroundColor;
      if (!c || c === 'rgba(0, 0, 0, 0)') continue;
      capas.push(c);
      if (!/rgba\(.*,\s*0?\.\d+\)$/.test(c)) break;
    }
    return { texto: th.textContent.trim(), color: getComputedStyle(th).color, capas };
  }, nth);

  const fondo = [...raw.capas].reverse().reduce((acc, capa) => flatten(capa, acc), 'rgb(255, 255, 255)');
  return { texto: raw.texto, color: raw.color, fondo };
}

for (const colorScheme of ['light', 'dark']) {
  // `test.use()` va DENTRO del describe: al nivel del archivo, dos llamadas en un
  // for no scopean por iteración — gana la última y los dos casos corren con el
  // mismo tema (así este test "pasaba" midiendo oscuro dos veces).
  test.describe(`tema ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('el encabezado de la tabla de resultados se lee', async ({ page }) => {
      await page.goto(`${FIXTURE}?caso=dif`);
      await page.click('text=Planilla');
      await expect(page.locator('table.rb-grid')).toBeVisible();

      // La 1ª columna es la sticky: es la que quedaba blanco sobre blanco.
      const legajo = await headerColors(page, 0);
      expect(legajo.texto).toBe('Legajo');
      expect(contrastRatio(legajo.color, legajo.fondo),
        `"Legajo": ${legajo.color} sobre ${legajo.fondo}`).toBeGreaterThanOrEqual(4.5);

      // Una columna de concepto: las pinta el sistema con un tinte translúcido,
      // que sólo se lee como tinte sobre un encabezado neutro.
      const concepto = await headerColors(page, 2);
      expect(contrastRatio(concepto.color, concepto.fondo),
        `"${concepto.texto}": ${concepto.color} sobre ${concepto.fondo}`).toBeGreaterThanOrEqual(4.5);
    });
  });
}

test('un control sin diferencias sigue teniendo exportable y tabla de evaluados', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=ok`);
  await page.click('text=Planilla');

  // El cartel de "todo coincide" sigue estando: es la respuesta a "¿cerró?".
  await expect(page.getByText('No hay diferencias para revisar')).toBeVisible();

  // …y además el exportable, que es lo que el analista archiva.
  await expect(page.getByRole('button', { name: /Exportar/i })).toBeVisible();

  // Con cero diferencias el filtro de estado arranca en "Todos": es lo único que
  // hay para mirar, y es lo que se exporta (si no, el .xlsx saldría vacío).
  await expect(page.locator('.results-toolbar select[data-chips]')).toHaveValue('todos');
  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(2);
});

test('un control con diferencias arranca mostrando sólo las diferencias', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=dif`);
  await page.click('text=Planilla');

  await expect(page.locator('.results-toolbar select[data-chips]')).toHaveValue('conDif');
  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(1);

  // Los chips no re-dibujan la tabla: esconden filas. Por eso las dos siguen en
  // el DOM y el TOTAL puede pasar a ser el de la selección.
  await expect(page.locator('table.rb-grid tbody tr')).toHaveCount(2);

  // Pasar a "Todos" trae los evaluados sin diferencia.
  await page.selectOption('.results-toolbar select[data-chips]', 'todos');
  await expect(page.locator('table.rb-grid tbody tr:visible')).toHaveCount(2);
});
