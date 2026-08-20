// controlNetosDetalle.spec.js — Las dos vistas nuevas del Detalle del Control de
// Netos en un navegador real.
//
// Lo que este test cubre y los unitarios no: que la ficha ABRA y muestre la
// cascada del residuo, que la planilla por rubro tenga sus bandas alineadas con
// las columnas, y que los dos renglones invertidos (el pie de la ficha, la fila
// de bandas) se lean en los dos temas — el fondo invertido es el que se rompía
// en oscuro, donde `--ink` es un color claro.

import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/e2e/fixtures/netosDetalle.html';

test('el Detalle abre en Fichas y la ficha muestra la cascada del residuo', async ({ page }) => {
  await page.goto(FIXTURE);

  // Los nombres y el orden son los de la vista estándar de toda la app (D-074).
  await expect(page.locator('.tabs__tab')).toHaveText(['Resumen', 'Fichas', 'Planilla']);
  // Con diferencias abre en Fichas: lo primero que se ve es por qué falla.
  await expect(page.locator('.tabs__tab--active')).toHaveText('Fichas');

  // Los cinco estados, con las palabras exactas y en ese orden, siempre.
  await expect(page.locator('.results-chip')).toHaveText([
    /Todos/, /Con diferencia/, /Dentro del margen/, /Al centavo/, /Sin comparar/,
  ]);
  // Arranca filtrado en "Con diferencia": errores primero, y se dice por qué.
  await expect(page.locator('.results-chip--active')).toContainText('Con diferencia');
  await expect(page.locator('.results-toolbar__hint')).toBeVisible();
  // Lo que le pasa ADEMÁS al legajo no es un chip: es una marca, y va aparte.
  await expect(page.locator('.results-chips')).not.toContainText('fuera de escala');
  await expect(page.locator('select[aria-label="Filtrar por marca del legajo"]')).toBeVisible();

  const ficha = page.locator('.netos-ficha').first();
  await expect(ficha.locator('.netos-ficha__monto')).toContainText('250.000,00');
  // Cerrada no pinta el cuerpo: con cientos de legajos, armar las tres tablas
  // de cada uno de entrada cuesta segundos de pantalla en blanco.
  await expect(ficha.locator('.netos-t')).toHaveCount(0);

  await ficha.locator('summary').click();
  await expect(ficha.locator('.netos-t--cascada tbody tr')).toHaveCount(3);
  await expect(ficha.locator('.netos-tira__p')).toHaveCount(5);
  await expect(ficha.locator('.netos-conclusion')).toContainText('arriba de la tolerancia');
  // El concepto sin aportes entra entero: 0 % de aportes y el efecto = importe.
  const sinAporte = ficha.locator('.netos-t--cascada tbody tr', { hasText: '1684' });
  await expect(sinAporte).toContainText('0,00 %');
  await expect(sinAporte).toContainText('+8.300,00');
});

test('la ficha sin neto liquidado dice "sin comparar" y no un cero', async ({ page }) => {
  await page.goto(FIXTURE);
  await page.locator('.results-chip', { hasText: 'Sin comparar' }).click();

  const ficha = page.locator('.netos-ficha').first();
  await expect(ficha.locator('.netos-ficha__sin')).toHaveText('sin comparar');
  await ficha.locator('summary').click();
  await expect(ficha.locator('.netos-conclusion')).toContainText('no tiene neto liquidado');
});

test('la planilla tiene las bandas alineadas con sus columnas', async ({ page }) => {
  await page.goto(FIXTURE);
  await page.locator('.tabs__tab', { hasText: 'Planilla' }).click();

  const bandas = page.locator('.netos-banda');
  await expect(bandas).toHaveText([/Identificación/, /Recibo teórico/, /Lo que se liquidó/, /Conciliación/]);

  // La suma de los colspan de las bandas tiene que dar las columnas de la
  // segunda fila: si alguien agrega un rubro y se olvida la banda, el
  // encabezado sale corrido sobre los datos y no hay forma de verlo en el código.
  const suma = await bandas.evaluateAll(els => els.reduce((a, el) => a + el.colSpan, 0));
  await expect(page.locator('.netos-rubro thead tr:nth-child(2) th')).toHaveCount(suma);

  await expect(page.locator('.netos-rubro tfoot')).toContainText('TOTAL —');
  await expect(page.locator('.netos-nota')).toContainText('tres bandas');
});

test('una corrida vieja, guardada sin el desglose, se dibuja igual y lo dice', async ({ page }) => {
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.goto(`${FIXTURE}?caso=vieja`);

  await expect(page.locator('.netos-ficha').first()).toBeVisible();
  await expect(page.locator('.netos-nota')).toContainText('Volvé a ejecutar');
  await page.locator('.netos-ficha').first().locator('summary').click();
  // Sin cascada no se dibuja la tabla de conceptos, pero la ficha abre y las
  // dos tablas del recibo siguen estando: los campos viejos alcanzan para eso.
  await expect(page.locator('.netos-t--cascada')).toHaveCount(0);
  await expect(page.locator('.netos-ficha').first().locator('.netos-t')).toHaveCount(2);
  expect(errores).toEqual([]);
});

test('un estado sin casos se muestra igual, apagado y sin poder tocarse', async ({ page }) => {
  await page.goto(`${FIXTURE}?caso=cierra`);
  // El fixture ?caso=cierra deja a todos al centavo: los otros tres estados
  // quedan en cero y tienen que seguir estando, en su mismo lugar.
  await expect(page.locator('.results-chip')).toHaveCount(5);
  const vacio = page.locator('.results-chip', { hasText: 'Sin comparar' });
  await expect(vacio).toBeDisabled();
  await expect(vacio).toContainText('0');
  // Sin diferencias, la que abre es Planilla y no Fichas.
  await expect(page.locator('.tabs__tab--active')).toHaveText('Planilla');
});

for (const tema of ['claro', 'oscuro']) {
  test(`los renglones invertidos se leen en tema ${tema}`, async ({ page }) => {
    await page.goto(FIXTURE);
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);

    await page.locator('.netos-ficha').first().locator('summary').click();
    const pie = page.locator('.netos-t tfoot td').first();
    const { fondo, texto } = await pie.evaluate(el => {
      const s = getComputedStyle(el);
      return { fondo: s.backgroundColor, texto: s.color };
    });
    // El pie de la tabla es el número más importante de la ficha: fondo y texto
    // no pueden ser el mismo color. En oscuro `--ink` es CLARO —lo usan como
    // texto fuerte— así que "fondo ink + texto blanco" daba blanco sobre blanco.
    expect(fondo).not.toBe(texto);
    const luz = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b; };
    expect(Math.abs(luz(fondo) - luz(texto))).toBeGreaterThan(90);
  });
}
