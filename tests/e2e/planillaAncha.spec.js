// planillaAncha.spec.js — Las tres reglas de una planilla más ancha que la
// pantalla (D-060). Nacieron de un caso real: en Acumuladores Ganancias la fila
// de TOTAL mostraba "0,0036.857.323,85" —dos importes pegados que se leían como
// uno— y no había forma de saber que quedaban columnas afuera de la vista.
//
// Se prueba en un navegador real porque las tres son de layout: cuánto ancho le
// da el navegador a cada columna, qué celda queda fija al scrollear, y si el
// contenido entra o no. Ninguna se puede afirmar leyendo el código.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/planillaAncha.html';

/** El ancho REAL del texto de una celda (no el de una fuente adivinada). */
const anchoDelTexto = `(cell) => {
  const r = document.createRange();
  r.selectNodeContents(cell);
  return r.getBoundingClientRect().width;
}`;

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => window.__listo);
  await page.waitForTimeout(150); // el ResizeObserver que reserva el ancho
});

test('cada columna reserva el ancho que su total necesita, y ningún total se derrama', async ({ page }) => {
  // El bug original: un total suma 308 legajos y tiene tres dígitos más que
  // cualquier importe de la tabla. Si la columna se dimensiona sólo por las
  // filas de datos, el total —alineado a la derecha— se derrama sobre la columna
  // de al lado y los dos números se leen pegados.
  //
  // Se comprueba la GARANTÍA, no el síntoma: que cada columna de importes tenga
  // reservado al menos el ancho que su total necesita. Si en cambio se buscara
  // el derrame en pantalla, el test pasaría o fallaría según el largo de los
  // nombres de la muestra —que empujan las columnas— y no según el arreglo.
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(200); // el ResizeObserver vuelve a reservar el ancho

  const columnas = await page.evaluate(`(() => {
    const anchoDelTexto = ${anchoDelTexto};
    const t = document.querySelector('table.rb-grid');
    const cabeceras = [...t.tHead.rows[0].cells];
    const out = [];
    let col = 0;
    for (const cell of t.tFoot.rows[0].cells) {
      const span = cell.colSpan || 1;
      const th = span === 1 ? cabeceras[col] : null;
      col += span;
      if (!th) continue;
      const cs = getComputedStyle(cell);
      const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      out.push({
        total: cell.textContent.trim(),
        necesita: Math.ceil(anchoDelTexto(cell) + pad),
        reservado: Math.round(parseFloat(th.style.minWidth) || 0),
        // el derrame en pantalla, que nunca puede pasar
        disponible: cell.clientWidth - pad,
        textoSolo: anchoDelTexto(cell),
      });
    }
    return out;
  })()`);

  expect(columnas.length).toBeGreaterThan(5);
  for (const c of columnas) {
    // 1px de tolerancia: el navegador redondea el ancho del texto.
    expect(c.reservado, `columna del total ${c.total}`).toBeGreaterThanOrEqual(c.necesita - 1);
    expect(c.textoSolo, `el total ${c.total} se derrama sobre la columna de al lado`)
      .toBeLessThanOrEqual(c.disponible + 0.5);
  }
});

test('la planilla es más ancha que la vista, y el botón "Ampliar" lo ofrece', async ({ page }) => {
  const falta = await page.evaluate(() => {
    const w = document.querySelector('.rb-grid-wrap');
    return w.scrollWidth - w.clientWidth;
  });
  expect(falta).toBeGreaterThan(0);

  // Sin ancho de sobra, el botón está: es lo único que avisa que se puede ver
  // la planilla entera sin pelear con el scroll.
  const boton = page.locator('.js-rb-expand');
  await expect(boton).toBeVisible();
  await expect(boton).toHaveAttribute('aria-pressed', 'false');

  await boton.click();
  await expect(boton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.rb-grid-wrap--full')).toHaveCount(1);
  // Ampliada muestra MÁS que antes: es todo el sentido del botón.
  const anchoAmpliado = await page.evaluate(() => document.querySelector('.rb-grid-wrap').clientWidth);
  expect(anchoAmpliado).toBeGreaterThan(1180);

  await page.keyboard.press('Escape');
  await expect(page.locator('.rb-grid-wrap--full')).toHaveCount(0);
  await expect(boton).toHaveAttribute('aria-pressed', 'false');
});

test('en la fila de TOTAL, el primer importe NO queda clavado al scrollear', async ({ page }) => {
  // El rótulo "TOTAL — 308 legajos" ocupa las dos columnas fijas (colspan=2), así
  // que la 2ª celda de esa fila es el primer IMPORTE y no la 2ª columna. Fijarlo
  // lo dejaba montado encima de los importes que pasaban por debajo.
  const posiciones = await page.evaluate(() => {
    const t = document.querySelector('table.rb-grid');
    const foot = t.tFoot.rows[0];
    const primerImporte = [...foot.cells].find(c => (c.colSpan || 1) === 1);
    return { left: getComputedStyle(primerImporte).left, texto: primerImporte.textContent.trim() };
  });
  expect(posiciones.left).toBe('auto');

  // Y con la planilla scrolleada a la derecha, ese importe viaja con su columna
  // en vez de quedarse quieto encima de las otras.
  const antes = await page.evaluate(() => {
    const t = document.querySelector('table.rb-grid');
    const c = [...t.tFoot.rows[0].cells].find(x => (x.colSpan || 1) === 1);
    return c.getBoundingClientRect().left;
  });
  await page.evaluate(() => {
    const w = document.querySelector('.rb-grid-wrap');
    w.scrollLeft = w.scrollWidth;
  });
  await page.waitForTimeout(120);
  const despues = await page.evaluate(() => {
    const t = document.querySelector('table.rb-grid');
    const c = [...t.tFoot.rows[0].cells].find(x => (x.colSpan || 1) === 1);
    return c.getBoundingClientRect().left;
  });
  expect(despues).toBeLessThan(antes);
});

test('el rótulo de la fila de TOTAL sí queda fijo, y dice la unidad al filtrar', async ({ page }) => {
  const rotulo = page.locator('table.rb-grid tfoot td[colspan]').first();
  await expect(rotulo).toHaveText(/TOTAL — 308 legajos/);
  expect(await rotulo.evaluate(el => getComputedStyle(el).position)).toBe('sticky');

  // Filtrado a un legajo: el TOTAL pasa a ser el de la selección y nombra la
  // unidad ("1 legajo"), no un genérico "1 fila".
  await page.fill('.table-search__input', '1 — SANGUINETTI');
  await page.locator('.table-search__option').first().click();
  await expect(rotulo).toHaveText(/TOTAL de la selección — 1 legajo/);
});
