// paso2Dropzone.spec.js — El ciclo completo de un casillero de archivo y el
// bloque de ayuda por campo del Paso 2 (docs/rediseno, pantalla 4).
//
// Lo que este spec prueba y ningún unit puede: que los cinco estados del
// casillero sean el MISMO casillero (vacío → arrastrando → procesando → aviso de
// sigla → cargado), que el aviso de sigla no bloquee nada —las dos salidas
// terminan con el analista pudiendo seguir— y que el aviso sobreviva a la
// confirmación del mapeo, que es donde se perdería sin quererlo.

import { test, expect } from '@playwright/test';

const errores = [];
test.beforeEach(async ({ page }) => { page.on('pageerror', e => errores.push(String(e))); });
test.afterEach(() => { expect(errores).toEqual([]); });

async function abrirFixture(page) {
  await page.goto('/tests/e2e/fixtures/paso2Dropzone.html');
  await expect(page.locator('#out')).toHaveText('listo', { timeout: 15000 });
}

test('el casillero vacío dice qué archivo va y que es obligatorio', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountDrop());

  const dz = page.locator('#js-drop-zone');
  await expect(dz).toHaveClass(/dropzone--empty/);
  await expect(dz).toContainText('Arrastrá el Reporte de Brutos');
  await expect(dz).toContainText('o hacé clic para buscarlo');
  await expect(dz.locator('[data-dz-tag]')).toHaveText('OBLIGATORIO');
});

test('un nombre sin la sigla avisa y ofrece las dos salidas — ninguna traba', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountDrop());
  await page.evaluate(() => window.__drop('Liquidacion agosto FINAL v2.xlsx'));

  const aviso = page.locator('[data-dz-sigla-warning]');
  await expect(aviso).toContainText('No parece un Reporte de Brutos');
  await expect(aviso).toContainText('Liquidacion agosto FINAL v2.xlsx');

  // Salida 1: elegir otro archivo — vuelve al casillero vacío, no a un callejón.
  await page.locator('#js-sigla-other').click();
  await expect(page.locator('#js-drop-zone')).toHaveClass(/dropzone--empty/);

  // Salida 2: usarlo igual — sigue derecho al mapeo de columnas.
  await page.evaluate(() => window.__drop('Liquidacion agosto FINAL v2.xlsx'));
  await page.locator('#js-sigla-keep').click();
  await expect(page.locator('#js-mapping-form')).toBeVisible();
});

test('el aviso de sigla sigue visible después de confirmar el mapeo', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountDrop());
  await page.evaluate(() => window.__drop('Liquidacion agosto FINAL v2.xlsx'));
  await page.locator('#js-sigla-keep').click();
  await page.locator('#js-mapping-form button[type=submit]').click();

  // Estado cargado: nombre del archivo en mono, cuántas filas trajo, y el aviso
  // que el analista decidió ignorar — que no se lo lleva la confirmación.
  const cargado = page.locator('.dropzone--loaded');
  await expect(cargado).toContainText('Reporte de Brutos');
  await expect(cargado.locator('.dropzone__file')).toHaveText('Liquidacion agosto FINAL v2.xlsx');
  await expect(cargado).toContainText('registros');
  await expect(cargado.locator('.dropzone__warnchip')).toHaveText('sigla no coincide');
  await expect(cargado.locator('#js-replace-btn')).toHaveText('Cambiar');
});

test('un nombre con la sigla no avisa nada', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountDrop());
  await page.evaluate(() => window.__drop('Cliente_Brutos_2026-08.xlsx'));

  await expect(page.locator('[data-dz-sigla-warning]')).toHaveCount(0);
  await expect(page.locator('#js-mapping-form')).toBeVisible();

  await page.locator('#js-mapping-form button[type=submit]').click();
  await expect(page.locator('.dropzone--loaded')).toBeVisible();
  await expect(page.locator('.dropzone__warnchip')).toHaveCount(0);
});

test('"Cambiar" devuelve el casillero al estado vacío', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountDrop());
  await page.evaluate(() => window.__drop('Cliente_Brutos_2026-08.xlsx'));
  await page.locator('#js-mapping-form button[type=submit]').click();
  await page.locator('#js-replace-btn').click();

  await expect(page.locator('#js-drop-zone')).toHaveClass(/dropzone--empty/);
});

test('cada campo se presenta en criollo, con su código y de dónde salió el valor', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountCampos());

  const sueldo = page.locator('[data-fu-field-group="tabSalBaseColumn"]');
  await expect(sueldo.locator('.field__label')).toHaveText('Sueldo básico');
  await expect(sueldo.locator('.field__code')).toHaveText('SAL_BASE');
  await expect(sueldo.locator('.field__badge')).toHaveText('auto ✓');
  // La muestra de valores reales sigue saliendo de columnHints.js, sin tocarla.
  await expect(sueldo.locator('[data-col-hint-sample]')).toContainText('1.500.000,00');

  // El campo pendiente no esconde la explicación detrás del "?": la baja a la
  // vista, y nombra la salida declarada (⊘).
  const aCuenta = page.locator('[data-fu-field-group="tabACuFutAumenColumn"]');
  await expect(aCuenta.locator('.field__label')).toHaveText('A cuenta de futuros aumentos');
  await expect(aCuenta.locator('.field__badge')).toHaveText('⚠ sin asignar');
  await expect(aCuenta.locator('.field__help')).toContainText('⊘');
  await expect(aCuenta.locator('select option').first()).toHaveText('Elegí la columna del Tabulado…');

  // Una columna OPCIONAL vacía no se pinta de amarillo: no hay nada que ir a
  // resolver ahí, y el amarillo tiene que significar siempre lo mismo.
  await expect(page.locator('[data-fu-field-group="tabNombreColumn"] .field__badge')).toHaveCount(0);

  // Cuenta TODAS las columnas del panel, no sólo las que bloquean: es el estado
  // del mapeo, no un semáforo.
  await expect(page.locator('[data-tab-extra-count]')).toHaveText('2 de 7 listas');
});

test('el "?" abre la explicación larga y Escape la cierra', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountCampos());

  const aCuenta = page.locator('[data-fu-field-group="tabACuFutAumenColumn"]');
  const panel   = aCuenta.locator('.help-popover__panel');
  await expect(panel).toBeHidden();

  await aCuenta.locator('.help-popover__btn').click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('aumento paritario');

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('declarar la columna ausente con ⊘ la cuenta como resuelta, y se puede deshacer', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountCampos());

  const aCuenta = page.locator('[data-fu-field-group="tabACuFutAumenColumn"]');
  await aCuenta.locator('button[data-tab-extra-omit]').first().click();

  const omitida = page.locator('[data-fu-field-group="tabACuFutAumenColumn"]');
  await expect(omitida.locator('.field__badge')).toHaveText('⊘ no viene');
  await expect(omitida.locator('select')).toBeDisabled();
  await expect(page.locator('[data-tab-extra-count]')).toHaveText('3 de 7 listas');

  // El estado vacío siempre con salida: "Deshacer" vuelve a dejarla pendiente.
  await omitida.locator('button.ctrl-link[data-tab-extra-omit]').click();
  await expect(page.locator('[data-fu-field-group="tabACuFutAumenColumn"] .field__badge'))
    .toHaveText('⚠ sin asignar');
  await expect(page.locator('[data-tab-extra-count]')).toHaveText('2 de 7 listas');
});

test('elegir una columna actualiza el badge y el contador', async ({ page }) => {
  await abrirFixture(page);
  await page.evaluate(() => window.__mountCampos());

  await page.locator('[data-fu-field-group="tabACuFutAumenColumn"] select')
    .selectOption('FEC_PAGO');

  await expect(page.locator('[data-tab-extra-count]')).toHaveText('3 de 7 listas');
  await expect(page.locator('[data-fu-field-group="tabACuFutAumenColumn"] .field__badge'))
    .toHaveText('auto ✓');
  // Resuelta: la explicación de "qué pasa si falta" ya no tiene por qué estar.
  await expect(page.locator('[data-fu-field-group="tabACuFutAumenColumn"] .field__help'))
    .toHaveCount(0);
});
