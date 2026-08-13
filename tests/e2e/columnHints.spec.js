// columnHints.spec.js — La muestra de valores y el aviso de tipo, montados en un
// navegador real (specs/muestra-y-aviso-de-columna.md).
//
// Lo que este spec prueba y el unit (tests/columnHints.test.js) no puede: que la
// muestra aparece **sin hacer nada** en las dos superficies donde se elige una
// columna, que se rehace al cambiar de columna, y que el aviso se lee en los dos
// temas (con el hex fuera de los módulos, un token mal definido sólo se ve así —
// mismo motivo que tests/e2e/tokenDefaults.spec.js).

import { test, expect } from '@playwright/test';

const errores = [];
test.beforeEach(async ({ page }) => { page.on('pageerror', e => errores.push(String(e))); });
test.afterEach(() => { expect(errores).toEqual([]); });

async function abrirFixture(page) {
  await page.goto('/tests/e2e/fixtures/columnHints.html');
  await expect(page.locator('#out')).toHaveText('listo', { timeout: 15000 });
}

test('pantalla de carga: la muestra se ve sola y se rehace al cambiar de columna', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountUpload());
  await page.evaluate(() => window.__drop());

  await expect(page.locator('#js-mapping-form')).toBeVisible();

  // REIN_HOME_OFICE viene pre-completada por la auto-detección: la muestra tiene
  // que estar ahí sin que el analista toque nada — es el caso más común, porque
  // la app propone el mapeo sola.
  const grupoRein = page.locator('[data-fu-field-group="reinHomeOficeColumn"]');
  await expect(grupoRein.locator('[data-col-hint-sample]')).toContainText('ej.:');
  await expect(grupoRein.locator('[data-col-hint-sample]')).toContainText('1.234,56');
  await expect(grupoRein.locator('[data-col-hint-warn]')).toHaveCount(0);

  // Mapeada a una columna de texto, la misma clave (que el contrato declara
  // importe) avisa. Y la muestra cambia: si siguiera mostrando los valores de la
  // columna anterior, sería peor que no mostrar nada.
  await grupoRein.locator('select').selectOption('FORMA_PAGO');
  await expect(grupoRein.locator('[data-col-hint-warn]')).toContainText('no parecen importes');
  await expect(grupoRein.locator('[data-col-hint-sample]')).toContainText('TRANSFERENCIA');
  await expect(grupoRein.locator('[data-col-hint-sample]')).not.toContainText('1.234,56');

  // Y al volver a la columna correcta, el aviso se va.
  await grupoRein.locator('select').selectOption('REIN_HOME_OFICE');
  await expect(grupoRein.locator('[data-col-hint-warn]')).toHaveCount(0);
});

test('pantalla de carga: declarar la columna ausente (⊘) se lleva la muestra', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountUpload());
  await page.evaluate(() => window.__drop());

  const grupoRein = page.locator('[data-fu-field-group="reinHomeOficeColumn"]');
  await expect(grupoRein.locator('[data-col-hint-sample]')).toHaveCount(1);
  await grupoRein.locator('[data-fu-omit]').click();
  await expect(grupoRein.locator('[data-col-hint-sample]')).toHaveCount(0);
});

test('Paso 2: la muestra y el aviso salen en el panel "Columnas del Tabulado"', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountPaso2());

  // SUELDO bien mapeada: muestra sin aviso.
  const grupoSueldo = page.locator('[data-fu-field-group="tabSalBaseColumn"]');
  await expect(grupoSueldo.locator('[data-col-hint-sample]')).toContainText('1.500.000,00');
  await expect(grupoSueldo.locator('[data-col-hint-warn]')).toHaveCount(0);

  // FEC_PAGO mapeada a FORMA_PAGO: el caso que motivó la feature — el contrato
  // declara fecha y la columna trae texto.
  const grupoFecha = page.locator('[data-fu-field-group="tabFecPagoColumn"]');
  await expect(grupoFecha.locator('[data-col-hint-warn]')).toContainText('no parecen fechas');

  // Al elegir la columna de fechas de verdad, el aviso se va y la muestra cambia.
  await grupoFecha.locator('select').selectOption('FEC_PAGO');
  await expect(grupoFecha.locator('[data-col-hint-warn]')).toHaveCount(0);
  await expect(grupoFecha.locator('[data-col-hint-sample]')).toContainText('15/03/2026');
});

test('el aviso se lee en los dos temas', async ({ page }) => {
  await abrirFixture(page);

  for (const tema of ['light', 'dark']) {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);
    await page.evaluate(() => window.__mountPaso2());

    const aviso = page.locator('[data-fu-field-group="tabFecPagoColumn"] [data-col-hint-warn]');
    await expect(aviso).toBeVisible();

    // El color sale de un token, así que tiene que resolver a algo — un token sin
    // default en `:root` devuelve '' y el texto queda del color heredado, que fue
    // exactamente el bug de la Fase 2 (6 tokens sin default, tokenDefaults.spec.js).
    const { color, fondo } = await aviso.evaluate(el => {
      const cs = getComputedStyle(el);
      return { color: cs.color, fondo: getComputedStyle(document.body).backgroundColor };
    });
    expect(color, `tema ${tema}: el aviso tiene color propio`).toMatch(/^rgba?\(/);
    expect(color, `tema ${tema}: el aviso no queda del color del fondo`).not.toBe(fondo);
  }
});
