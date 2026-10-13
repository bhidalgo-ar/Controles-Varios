// rendimientoPanels.spec.js — Los dos paneles densos de Rendimiento (Fase 4, Paso 8)
//
// Pantallas 9 y 10 del rediseño: "Clasificación por cuenta contable" (vs
// Asiento) y "Agrupación de conceptos" (vs Tabulado). Los e2e que levantan la
// app entera necesitan Dexie/SheetJS del CDN y no corren en un sandbox sin red,
// así que el fixture monta los dos módulos solos con las librerías servidas
// desde `node_modules`.
//
// Lo que cubre es lo intocable de estas pantallas: el signo +/− de cada
// concepto (un clic lo invierte), el ✕ que lo saca del grupo y que "+ N más…"
// sea SÓLO colapso visual — plegar no puede cambiar lo que se va a ejecutar.
//
// Datos inventados, como manda el repo.

import { test, expect } from '@playwright/test';

const errores = [];
test.beforeEach(async ({ page }) => {
  errores.length = 0;
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto('/tests/e2e/fixtures/rendimientoPanels.html');
  await expect(page.locator('#out')).toHaveText('listo', { timeout: 20000 });
});

// ── Agrupación de conceptos (Rendimiento vs Tabulado) ────────────────────────

test('un clic en el signo del chip invierte si el concepto suma o resta', async ({ page }) => {
  const chip = page.locator('#grouping .concept-chip', { hasText: '1003' }).first();
  const signo = chip.locator('.concept-chip__sign');

  await expect(signo).toHaveText('+');
  await expect(signo).toHaveClass(/concept-chip__sign--plus/);

  await signo.click();

  // Lo que importa no es el color del chip: es el signo que viaja al control.
  expect(await page.evaluate(() => window.__signo('precio', '1003'))).toBe(-1);
  await expect(page.locator('#grouping .concept-chip', { hasText: '1003' }).first()
    .locator('.concept-chip__sign')).toHaveText('−');

  await page.locator('#grouping .concept-chip', { hasText: '1003' }).first()
    .locator('.concept-chip__sign').click();
  expect(await page.evaluate(() => window.__signo('precio', '1003'))).toBe(1);
  expect(errores).toEqual([]);
});

test('el ✕ saca el concepto del grupo', async ({ page }) => {
  const antes = await page.evaluate(() => window.__cuantos('precio'));
  await page.locator('#grouping .concept-chip', { hasText: '1003' }).first()
    .locator('.concept-chip__x').click();

  expect(await page.evaluate(() => window.__cuantos('precio'))).toBe(antes - 1);
  expect(await page.evaluate(() => window.__signo('precio', '1003'))).toBe(null);
  expect(errores).toEqual([]);
});

test('"+ N más…" pliega sin tocar la agrupación: los conceptos escondidos siguen adentro', async ({ page }) => {
  const precio = page.locator('#grouping .bucket', { hasText: 'Precio' }).first();
  // 18 conceptos, 10 visibles → el resto queda plegado.
  await expect(precio.locator('.concept-chip--more')).toHaveText('+ 8 más…');

  const cambiosAntes = await page.evaluate(() => window.__cambios);
  await precio.locator('.concept-chip--more').click();

  // Se ven los 18, y la agrupación no cambió: plegar es sólo visual.
  await expect(precio.locator('.concept-chip__sign')).toHaveCount(18);
  expect(await page.evaluate(() => window.__cambios)).toBe(cambiosAntes);
  expect(errores).toEqual([]);
});

test('el concepto que este Tabulado no trae se avisa y se queda en el grupo', async ({ page }) => {
  const chip = page.locator('#grouping .concept-chip', { hasText: '2000' }).first();
  await expect(chip).toHaveClass(/concept-chip--warn/);
  // Sigue contando como concepto del grupo — avisa, no borra (D-036).
  expect(await page.evaluate(() => window.__signo('precio', '2000'))).toBe(1);

  await expect(page.locator('#grouping .grouping-legend')).toContainText('no está en este Tabulado');
  expect(errores).toEqual([]);
});

test('ocultar los que no están deja sólo los conceptos que el Tabulado trae', async ({ page }) => {
  const precio = page.locator('#grouping .bucket', { hasText: 'Precio' }).first();
  await page.locator('#js-rtv-hide-notfound').check();

  // De los 18 de Precio, este Tabulado trae 1003, 1004 y 1017.
  await expect(precio.locator('.concept-chip__sign')).toHaveCount(3);
  // Esconderlos no los saca del grupo.
  expect(await page.evaluate(() => window.__cuantos('precio'))).toBe(18);
  expect(errores).toEqual([]);
});

// ── Copiar / pegar la configuración (para mandarla por ticket) ───────────────

/** Reemplaza el portapapeles por uno que guarda lo copiado (o que falla). */
async function portapapeles(page, { falla = false } = {}) {
  await page.evaluate((falla) => {
    window.__copiado = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (t) => { if (falla) throw new Error('sin permiso'); window.__copiado = t; } },
    });
  }, falla);
}

test('"Copiar configuración" copia la agrupación de la pantalla y "Pegar" la vuelve a aplicar', async ({ page }) => {
  await portapapeles(page);
  await expect(page.locator('#js-rtv-copy')).toBeVisible();
  await expect(page.locator('#js-rtv-paste')).toBeVisible();

  await page.locator('#js-rtv-copy').click();
  await expect(page.locator('.toast', { hasText: 'Configuración copiada' })).toBeVisible();
  const copiado = await page.evaluate(() => window.__copiado);
  const env = JSON.parse(copiado);
  expect(env.tipo).toBe('agrupacion-conceptos-rendimiento');
  expect(env.cliente).toBe('BANFIELD');
  expect(env.agrupacion).toEqual(await page.evaluate(() => window.__grouping));

  // La vuelta "corregida": 1003 pasa a restar en Precio.
  env.agrupacion.precio.find(e => e.code === '1003').sign = -1;
  const cambiosAntes = await page.evaluate(() => window.__cambios);
  await page.locator('#js-rtv-paste').click();
  await page.locator('#js-rtv-paste-text').fill(JSON.stringify(env, null, 2));
  await page.locator('#js-rtv-paste-apply').click();

  await expect(page.locator('.toast', { hasText: 'Configuración pegada' })).toBeVisible();
  await expect(page.locator('#js-rtv-paste-text')).toHaveCount(0);
  // Viaja por el mismo onChange que cualquier edición: es lo que se guarda al ejecutar.
  expect(await page.evaluate(() => window.__signo('precio', '1003'))).toBe(-1);
  expect(await page.evaluate(() => window.__cambios)).toBe(cambiosAntes + 1);
  await expect(page.locator('#grouping .concept-chip', { hasText: '1003' }).first()
    .locator('.concept-chip__sign')).toHaveText('−');
  expect(errores).toEqual([]);
});

test('un texto pegado que no es una configuración se rechaza en pantalla y no cambia nada', async ({ page }) => {
  const antes = await page.evaluate(() => JSON.stringify(window.__grouping));
  const cambiosAntes = await page.evaluate(() => window.__cambios);

  await page.locator('#js-rtv-paste').click();
  await page.locator('#js-rtv-paste-text').fill('{ "tipo": "agrupacion-conceptos-rendimiento", "agrup');
  await page.locator('#js-rtv-paste-apply').click();

  await expect(page.locator('#js-rtv-paste-error')).toContainText('no se puede leer');
  // Lo pegado sigue ahí para corregirlo, y la agrupación no se tocó.
  await expect(page.locator('#js-rtv-paste-text')).toHaveValue(/agrup$/);
  expect(await page.evaluate(() => JSON.stringify(window.__grouping))).toBe(antes);
  expect(await page.evaluate(() => window.__cambios)).toBe(cambiosAntes);
  expect(errores).toEqual([]);
});

test('si el portapapeles falla, el texto se muestra para copiarlo a mano', async ({ page }) => {
  await portapapeles(page, { falla: true });
  await page.locator('#js-rtv-copy').click();

  const area = page.locator('#js-rtv-copy-fallback');
  await expect(area).toBeVisible();
  expect(JSON.parse(await area.inputValue()).tipo).toBe('agrupacion-conceptos-rendimiento');
  await expect(page.locator('.toast', { hasText: 'Configuración copiada' })).toHaveCount(0);
  expect(errores).toEqual([]);
});

// ── Clasificación por cuenta contable (Rendimiento vs Asiento) ────────────────

test('cada clasificación dice cuántas filas de la Contabilidad matchea', async ({ page }) => {
  const precio = page.locator('#rva .field', { hasText: 'Precio' }).first();
  await expect(precio.locator('.field__badge')).toHaveText('✓ 1.240 filas');
  await expect(precio.locator('.col-hint')).toHaveText('ej.: SUELDOS AGO · SUELDOS JUL');

  const cargas = page.locator('#rva .field', { hasText: 'Cargas SS' }).first();
  await expect(cargas.locator('.field__badge')).toHaveText('⚠ sin match');

  // El aviso de arriba cuenta lo mismo que se ve abajo.
  await expect(page.locator('#rva .wizard-panel__warn')).toHaveText('⚠ 4 códigos sin match');
  expect(errores).toEqual([]);
});

test('el "revisá el código o dejalo" se dice una vez, no en los cuatro', async ({ page }) => {
  const largos = page.locator('#rva .field__help', { hasText: 'las filas sin clasificar salen aparte' });
  await expect(largos).toHaveCount(1);
  // Los demás lo dicen corto.
  await expect(page.locator('#rva .field__help', { hasText: 'No encontrado en la Contabilidad cargada.' }))
    .toHaveCount(3);
  expect(errores).toEqual([]);
});

test('"＋ Agregar clasificación…" suma un código a la clasificación elegida', async ({ page }) => {
  await page.locator('#rva [data-rva-add-open]').click();
  await page.locator('#rva [data-rva-add-cat]').selectOption('cargas');
  await page.locator('#rva [data-rva-add-code]').fill('5208099');
  await page.locator('#rva [data-rva-add-ok]').click();

  expect(await page.evaluate(() => window.__rva.cuentaCats.cargas))
    .toEqual(['5208005', '5208099']);
  await expect(page.locator('#rva [data-rva-codes="cargas"]')).toHaveValue('5208005, 5208099');
  expect(errores).toEqual([]);
});
