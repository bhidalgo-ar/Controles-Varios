// checklistHeaderContrast.spec.js — La pantalla "Estado de controles"
// (js/ui/checklistView.js) pinta sus dos tablas con `.data-table`, no con
// `table.rb-grid`: el fix de #108/#110 (table.rb-grid thead th) no la
// alcanza. Sus <th> ponen background:var(--color-bg-subtle) sin poner color,
// así que heredaban el color:white de `.data-table thead` — texto blanco
// sobre gris claro, ilegible en modo claro (mismo bug que #108, acá sin
// arreglar hasta ahora).

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/checklistHeader.html';

function parseColor(c) {
  const n = c.match(/[\d.]+/g).map(Number);
  return [n[0], n[1], n[2], n[3] ?? 1];
}

function flatten(fg, bg) {
  const [r1, g1, b1, a] = parseColor(fg);
  const [r2, g2, b2]    = parseColor(bg);
  return `rgb(${r1 * a + r2 * (1 - a)}, ${g1 * a + g2 * (1 - a)}, ${b1 * a + b2 * (1 - a)})`;
}

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

async function headerColors(page, selector) {
  const raw = await page.evaluate((sel) => {
    const th = document.querySelector(sel);
    const capas = [];
    for (let el = th; el; el = el.parentElement) {
      const c = getComputedStyle(el).backgroundColor;
      if (!c || c === 'rgba(0, 0, 0, 0)') continue;
      capas.push(c);
      if (!/rgba\(.*,\s*0?\.\d+\)$/.test(c)) break;
    }
    return { texto: th.textContent.trim(), color: getComputedStyle(th).color, capas };
  }, selector);

  const fondo = [...raw.capas].reverse().reduce((acc, capa) => flatten(capa, acc), 'rgb(255, 255, 255)');
  return { texto: raw.texto, color: raw.color, fondo };
}

for (const colorScheme of ['light', 'dark']) {
  test.describe(`tema ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('el encabezado de la grilla mensual se lee', async ({ page }) => {
      await page.goto(FIXTURE);
      const periodo = await headerColors(page, 'table.data-table thead th');
      expect(periodo.texto).toBe('Período');
      expect(contrastRatio(periodo.color, periodo.fondo),
        `"Período": ${periodo.color} sobre ${periodo.fondo}`).toBeGreaterThanOrEqual(4.5);
    });

    test('el encabezado de "Borradores pendientes" se lee', async ({ page }) => {
      await page.goto(FIXTURE);
      const th = await headerColors(page, 'details th');
      expect(th.texto).toBe('Período');
      expect(contrastRatio(th.color, th.fondo),
        `"Período" (borradores): ${th.color} sobre ${th.fondo}`).toBeGreaterThanOrEqual(4.5);
    });
  });
}
