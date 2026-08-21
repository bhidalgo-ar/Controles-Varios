// fichasCuenta.spec.js — La ficha por CUENTA CONTABLE en un navegador real, en
// los dos controles cuya unidad no es el empleado: el Asiento de Remuneraciones
// (`finadiet_asiento`) y la Contabilidad Desglosada + Asiento
// (`conta_desglosada`). Tanda 7 de specs/vista-estandar-resultados.md.
//
// Lo que fija, en orden de qué cuesta más caro si se rompe:
//   1. **La ficha cerrada dice el número y el nombre de la cuenta, su DEBE, su
//      HABER y si cuadra** — los cuatro, sin abrirla. Es lo que se pidió.
//   2. **Abierta muestra qué conceptos la componen, con su código, y cómo suman
//      hasta el saldo.** Es lo que hoy no se puede ver sin exportar a Excel y
//      filtrar a mano; si el desglose no aparece, la ficha no sirve para nada.
//   3. **El chip "Dentro del margen" sale en gris, con su motivo, y no oculto**:
//      estos dos controles cuadran al centavo, no contra un umbral, y la fila de
//      chips es la misma en las 21 pantallas (§3).
//   4. Las tres solapas, con los mismos nombres y en el mismo orden, y el
//      `⬇ Exportar ▾` último a la derecha también en la solapa Fichas.
//   5. Que se lea en los tres temas (sobrio, intenso, oscuro).
//
// Corre sobre fixtures que montan el run + el render reales con datos
// inventados, sin IndexedDB — mismo patrón que vistaEstandar.spec.js.

import { test, expect } from '@playwright/test';

const CHIPS = ['Todos', 'Con diferencia', 'Dentro del margen', 'Al centavo', 'Sin comparar'];

const PANTALLAS = [
  {
    id: 'finadiet_asiento',
    fixture: 'fichaCuentaAsiento.html?sinclasificar=1',
    // Con la cuenta y el centro sin clasificar el asiento no cierra, así que la
    // pantalla abre en Fichas (§2) y hay casos en dos estados distintos.
    abreEn: 'Fichas',
    // El código de cuenta lleva el prefijo del centro de costo.
    unaCuenta: '400.521101',
    unRotulo: /SALDO AL (DEBE|HABER)/,
  },
  {
    id: 'conta_desglosada',
    fixture: 'fichaCuentaConta.html',
    // El asiento cierra pero una cuenta quedó sin código: también abre en Fichas.
    abreEn: 'Fichas',
    unaCuenta: '710100110',
    unRotulo: /NETO AL (DEBE|HABER)/,
  },
];

/** Abre un fixture y devuelve los errores de consola/página que junte. */
async function abrir(page, fixture) {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e.message)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // El server estático responde 404 al /favicon.ico de cada fixture: es ruido
    // del entorno de test, no un error de la pantalla.
    if (/favicon/.test(m.location()?.url || '')) return;
    errores.push(m.text());
  });
  await page.goto(`/tests/e2e/fixtures/${fixture}`);
  // El panel del Resumen se dibuja al abrir su solapa, no al montar la pantalla:
  // lo que hay que esperar es la fila de solapas.
  await expect(page.locator('.tabs__list').first()).toBeVisible();
  return errores;
}

/** Abre la solapa Fichas (por si la preferencia guardada abrió otra). */
async function abrirFichas(page, fixture) {
  const errores = await abrir(page, fixture);
  await page.locator('[role="tab"]', { hasText: 'Fichas' }).first().click();
  await expect(page.locator('.ficha').first()).toBeVisible();
  return errores;
}

for (const p of PANTALLAS) {
  test(`${p.id}: las tres solapas son Resumen · Fichas · Planilla`, async ({ page }) => {
    const errores = await abrir(page, p.fixture);
    const nombres = await page.locator('.tabs__list').first().locator('> [role="tab"]').allInnerTexts();
    expect(nombres.map(t => t.trim())).toEqual(['Resumen', 'Fichas', 'Planilla']);
    expect(errores).toEqual([]);
  });

  test(`${p.id}: hay diferencias, así que abre en ${p.abreEn}`, async ({ page }) => {
    await abrir(page, p.fixture);
    await expect(page.locator('.tabs__list').first()
      .locator('[role="tab"][aria-selected="true"]')).toHaveText(p.abreEn);
  });

  test(`${p.id}: la ficha cerrada dice número, nombre, DEBE, HABER y si cuadra`, async ({ page }) => {
    const errores = await abrirFichas(page, p.fixture);

    const ficha = page.locator('.ficha', { has: page.locator(`.ficha__avatar:text-is("${p.unaCuenta}")`) });
    await expect(ficha).toHaveCount(1);

    // 1. El NÚMERO de la cuenta, en el avatar.
    await expect(ficha.locator('.ficha__avatar')).toHaveText(p.unaCuenta);
    // 2. El NOMBRE de la cuenta, en la línea de identidad.
    await expect(ficha.locator('.ficha__name')).not.toBeEmpty();
    // 3 y 4. Su DEBE, su HABER y si cuadra: la línea de contexto, en gris.
    const ctx = await ficha.locator('.ficha__ctx').innerText();
    expect(ctx).toMatch(/DEBE\s/);
    expect(ctx).toMatch(/HABER\s/);
    expect(ctx).toMatch(/concepto que suma exacto|conceptos que suman exacto|no suman al saldo/);
    // Y el importe grande, con el rótulo que usa el .xlsx de ese control.
    await expect(ficha.locator('.ficha__amount-label')).toHaveText(p.unRotulo);
    await expect(ficha.locator('.ficha__amount')).not.toBeEmpty();

    expect(errores).toEqual([]);
  });

  test(`${p.id}: abierta muestra los conceptos con su código y cómo suman`, async ({ page }) => {
    const errores = await abrirFichas(page, p.fixture);
    const ficha = page.locator('.ficha', { has: page.locator(`.ficha__avatar:text-is("${p.unaCuenta}")`) });

    // El cuerpo se dibuja al primer despliegue, no al pintar la lista.
    await expect(ficha.locator('[data-ficha-body]')).toBeEmpty();
    await ficha.locator('summary').click();

    // La tira de conciliación: de los conceptos al saldo de la cuenta.
    const tira = ficha.locator('.ficha-strip');
    await expect(tira).toBeVisible();
    await expect(tira).toContainText('Suman al DEBE');
    await expect(tira).toContainText('Suman al HABER');
    await expect(tira).toContainText('Saldo de la cuenta');
    await expect(tira).toContainText('Sin explicar');
    // La última pastilla antes del residuo va invertida (§4).
    await expect(tira.locator('.ficha-strip__pill--invert')).toHaveCount(1);
    // La cuenta cuadra, así que el residuo NO sale en rojo.
    await expect(tira.locator('.ficha-strip__pill--residuo')).toHaveCount(0);

    // El desglose: una fila por concepto, con su código.
    const detalle = ficha.locator('.ficha-detail');
    await expect(detalle).toBeVisible();
    await expect(detalle.locator('thead')).toContainText('Cód.');
    await expect(detalle.locator('thead')).toContainText('Efecto en el saldo');
    const filas = detalle.locator('tbody tr');
    expect(await filas.count()).toBeGreaterThan(0);
    // Cada fila trae un código de concepto (no '—').
    await expect(filas.first().locator('td').first()).not.toHaveText('—');
    // Y el pie dice cuánto explican los conceptos.
    await expect(detalle.locator('tfoot')).toContainText('Suma de los conceptos');

    // La conclusión es obligatoria y es una instrucción, no un resumen.
    await expect(ficha.locator('.ficha-conclusion')).toBeVisible();
    await expect(ficha.locator('.ficha-conclusion__title')).not.toBeEmpty();

    expect(errores).toEqual([]);
  });

  test(`${p.id}: los cinco chips, y "Dentro del margen" en gris con su motivo`, async ({ page }) => {
    await abrirFichas(page, p.fixture);

    const chips = page.locator('.results-toolbar:visible .results-chip');
    await expect(chips).toHaveCount(5);
    const palabras = (await chips.allInnerTexts())
      .map(t => t.trim().split(/\s+/).slice(0, -1).join(' '));
    expect(palabras).toEqual(CHIPS);

    // El que no aplica va DESHABILITADO y con el motivo en el title — no oculto:
    // sacarlo movería los otros cuatro de lugar (§3).
    const margen = chips.nth(2);
    await expect(margen).toContainText('Dentro del margen');
    await expect(margen).toContainText('0');
    expect(await margen.isDisabled()).toBe(true);
    expect(await margen.getAttribute('title')).toMatch(/No aplica a este control/);
    expect(await margen.getAttribute('title')).toMatch(/al centavo/);
  });

  test(`${p.id}: el ⬇ Exportar ▾ es lo último de la barra también en Fichas`, async ({ page }) => {
    await abrirFichas(page, p.fixture);
    const derecha = page.locator('.results-toolbar:visible .results-toolbar__right').first();
    await expect(derecha.locator('> *').last()).toContainText('Exportar');
  });

  test(`${p.id}: el Orden ▾ reordena la lista sin romperla`, async ({ page }) => {
    const errores = await abrirFichas(page, p.fixture);
    const orden = page.locator('.results-toolbar:visible [data-ficha-orden]');
    await expect(orden).toBeVisible();
    const antes = await page.locator('.ficha:visible .ficha__avatar').allInnerTexts();
    await orden.selectOption('nombre');
    const despues = await page.locator('.ficha:visible .ficha__avatar').allInnerTexts();
    expect(despues.length).toBe(antes.length);
    expect(despues.slice().sort()).toEqual(antes.slice().sort());
    expect(errores).toEqual([]);
  });
}

// ── El chip "Sin comparar": lo que quedó afuera se encuentra desde la barra ───

test('finadiet_asiento: la cuenta y el centro sin clasificar están en "Sin comparar"', async ({ page }) => {
  await abrirFichas(page, 'fichaCuentaAsiento.html?sinclasificar=1');

  await page.locator('.results-chip', { hasText: 'Sin comparar' }).click();
  const fichas = page.locator('.ficha:visible');
  await expect(fichas).toHaveCount(2);

  const textos = await fichas.allInnerTexts();
  expect(textos.join(' ')).toContain('999999');
  expect(textos.join(' ')).toContain('DEPOSITO NUEVO');
  // No tienen saldo: sale '—', nunca 0,00.
  for (const f of await fichas.all()) {
    await expect(f.locator('.ficha__amount')).toHaveText('—');
    await expect(f.locator('.ficha__amount-label')).toHaveText('SIN ASENTAR');
  }

  // Y su ficha dice qué hacer, no sólo qué pasó.
  await fichas.first().locator('summary').click();
  await expect(fichas.first().locator('.ficha-conclusion__text')).toContainText('Paso 2');
});

test('conta_desglosada: la cuenta sin código está en "Sin comparar", nunca aprobada', async ({ page }) => {
  await abrirFichas(page, 'fichaCuentaConta.html');

  await page.locator('.results-chip', { hasText: 'Sin comparar' }).click();
  const fichas = page.locator('.ficha:visible');
  await expect(fichas).toHaveCount(1);
  await expect(fichas.first().locator('.ficha__avatar')).toHaveText('sin cód.');
  await expect(fichas.first().locator('.ficha__name')).toContainText('Cargas sociales a pagar');

  // Sigue mostrando su desglose: la línea suma al asiento, lo que falta es el código.
  await fichas.first().locator('summary').click();
  await expect(fichas.first().locator('.ficha-detail tbody tr')).not.toHaveCount(0);
  await expect(fichas.first().locator('.ficha-conclusion__text')).toContainText('Paso 2');
});

test('conta_desglosada: sin el Reporte de Cuentas la ficha lo dice y no inventa un número', async ({ page }) => {
  const errores = await abrirFichas(page, 'fichaCuentaConta.html?sincuentas=1');

  const fichas = page.locator('.ficha:visible');
  expect(await fichas.count()).toBeGreaterThan(0);
  for (const f of await fichas.all()) {
    await expect(f.locator('.ficha__avatar')).toHaveText('sin cód.');
    await expect(f.locator('.ficha__amount-label')).toHaveText(/SALDO/);
  }
  await fichas.first().locator('summary').click();
  await expect(fichas.first().locator('.ficha-conclusion__text')).toContainText('Reporte de Cuentas');
  expect(errores).toEqual([]);
});

// ── Los tres temas ───────────────────────────────────────────────────────────
//
// Nada de hex en los módulos, y la pantalla se recorre en los tres antes de
// darla por cerrada (D-059). Acá se verifica lo que un screenshot no puede
// afirmar solo: que el importe grande de la ficha y el pie del desglose tengan
// contraste suficiente contra el fondo que les toca en cada tema.

/** Contraste de un elemento contra el fondo COMPUESTO de sus capas. */
const CONTRASTE = (el) => {
  const lum = (c) => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
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
  let fondo = capas[capas.length - 1];
  for (let i = capas.length - 2; i >= 0; i--) {
    const c = capas[i];
    fondo = {
      r: c.r * c.a + fondo.r * (1 - c.a),
      g: c.g * c.a + fondo.g * (1 - c.a),
      b: c.b * c.a + fondo.b * (1 - c.a),
      a: 1,
    };
  }
  const a = lum(getComputedStyle(el).color);
  const b = lum(`rgb(${fondo.r}, ${fondo.g}, ${fondo.b})`);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

for (const tema of ['sobrio', 'intenso', 'oscuro']) {
  test(`${tema}: la ficha por cuenta se lee en las dos pantallas`, async ({ page }) => {
    for (const p of PANTALLAS) {
      await abrirFichas(page, p.fixture);
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);

      const ficha = page.locator('.ficha', { has: page.locator(`.ficha__avatar:text-is("${p.unaCuenta}")`) });
      await ficha.locator('summary').click();

      // El importe grande es lo primero que se mira: 4,5:1 (AA de texto normal).
      expect(await ficha.locator('.ficha__amount').evaluate(CONTRASTE),
        `${p.id} · importe en ${tema}`).toBeGreaterThanOrEqual(4.5);
      // El pie del desglose va sobre fondo oscuro invertido: 3:1 (AA grande).
      expect(await ficha.locator('.ficha-detail tfoot td').first().evaluate(CONTRASTE),
        `${p.id} · pie del desglose en ${tema}`).toBeGreaterThanOrEqual(3);
      // Y la pastilla invertida de la tira, que es la del saldo.
      expect(await ficha.locator('.ficha-strip__pill--invert .ficha-strip__value').evaluate(CONTRASTE),
        `${p.id} · saldo de la tira en ${tema}`).toBeGreaterThanOrEqual(3);
    }
  });
}
