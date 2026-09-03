// uploadOmission.spec.js — El gate de OBLIGATORIA y el toggle ⊘ en la pantalla
// de carga de archivo, en un navegador real (D-041 punto 4,
// specs/obligatoria-gate-carga-archivo.md).
//
// Lo que este spec prueba y el unit (tests/uploadOmission.test.js) no puede:
// que el toggle existe y funciona EN LA MISMA SUPERFICIE que el gate. La regla
// de D-041 es que OBLIGATORIA no puede bloquear donde no está la vía de
// escape — un gate sin su ⊘ al lado rompe la carga de todo NR real, y eso
// sólo se ve montando el formulario de verdad.
//
// Mismo esquema que multiUpload.spec.js: el fixture sirve Dexie/SheetJS desde
// node_modules y monta initFileUploadStep solo, así corre sin red al CDN.

import { test, expect } from '@playwright/test';

/**
 * Cuántos conceptos NR declara la app. Se le pregunta a `NR_CONCEPTS` y no se
 * escribe el número acá: sumar un concepto (AJUSTE_NR, 2026-09-03) rompía este
 * spec sin que nada del gate ni del toggle hubiera cambiado.
 *
 * Se importa DENTRO del navegador y no arriba en el spec: `nr.js` arrastra
 * `exportMenu.js`, que se engancha a `document` al cargar, y en Node —donde
 * corre el spec— no hay `document`.
 */
const conceptosNr = (page) => page.evaluate(async () =>
  (await import('/js/controls/nr.js')).NR_CONCEPTS.length);

const errores = [];
test.beforeEach(async ({ page }) => { page.on('pageerror', e => errores.push(String(e))); });

/**
 * Espera a que el formulario haya TERMINADO de confirmar el mapeo, y devuelve el
 * último `onComplete`.
 *
 * No alcanza con esperar a que el nombre del archivo aparezca en `#host`: al
 * confirmar, `fileUpload.js` pinta primero la pantalla de "parseando" —que ya
 * lleva el nombre del archivo— y sólo después de un `await saveFileProfile()`
 * (una escritura en IndexedDB) llama a `onComplete`. O sea que el texto está en
 * pantalla mientras la escritura está en vuelo: el test seguía de largo y leía
 * `__completes` vacío. Pasaba igual porque el archivo son 3 filas y la escritura
 * termina en el mismo tick, y falló cuando el runner de CI se puso lento.
 *
 * Esperar la cantidad de `onComplete` es esperar lo que el assert de abajo
 * realmente necesita.
 */
async function esperarComplete(page, esperados) {
  await page.waitForFunction(n => window.__completes.length >= n, esperados, { timeout: 15000 });
  return page.evaluate(() => window.__completes.at(-1));
}

async function abrirFormulario(page, { detecta = false } = {}) {
  await page.goto('/tests/e2e/fixtures/uploadOmission.html');
  await expect(page.locator('#out')).toHaveText('listo', { timeout: 15000 });
  await page.evaluate(d => (d ? window.__detectaRein() : window.__mount()), detecta);
  await page.evaluate(() => window.__drop());
}

test('el gate bloquea, el ⊘ es la salida, y la omisión persiste en el perfil', async ({ page }) => {
  await abrirFormulario(page);

  // Formulario de mapeo: legajo (CLAVE, sin ⊘) + un concepto OBLIGATORIA por
  // cada NR, cada uno con su toggle.
  await expect(page.locator('#js-mapping-form')).toBeVisible();
  const CONCEPTOS_NR = await conceptosNr(page);
  await expect(page.locator('[data-fu-omit]')).toHaveCount(CONCEPTOS_NR);

  // Sin resolver los conceptos, el submit bloquea y el toast ofrece el ⊘.
  await page.selectOption('select[name="legajoColumn"]', 'LEGAJO');
  await page.click('#js-mapping-form button[type=submit]');
  const toast = page.locator('.toast').last();
  await expect(toast).toContainText('Falta completar');
  await expect(toast).toContainText('declaralas ausentes con ⊘');
  expect(await page.evaluate(() => window.__completes.length)).toBe(0);

  // Todos los conceptos declarados ⊘ → el gate pasa: que este cliente no
  // liquide NR también es resultado válido (D-036).
  for (const btn of await page.locator('[data-fu-omit]').all()) await btn.click();
  // El select de un omitido queda deshabilitado y el badge lo dice.
  await expect(page.locator('select[name="gratVacColumn"]')).toBeDisabled();
  await expect(page.locator('[data-fu-omit-group="gratVacColumn"] [data-fu-omit-badge]')).toBeVisible();

  await page.click('#js-mapping-form button[type=submit]');
  const { mapping } = await esperarComplete(page, 1);
  await expect(page.locator('#host')).toContainText('nr.xlsx');
  expect(mapping.legajoColumn).toBe('LEGAJO');
  expect(mapping.gratVacColumn).toBe('__omitido__');
  expect(Object.values(mapping).filter(v => v === '__omitido__').length).toBe(CONCEPTOS_NR);

  // Panel de remapeo: la omisión se dibuja (no se pierde en silencio) y
  // destildar sin elegir columna vuelve a bloquear, nombrando la salida.
  await page.click('#host details summary');
  await expect(page.locator('#host [data-fu-omit][aria-pressed="true"]')).toHaveCount(CONCEPTOS_NR);
  await page.click('[data-fu-omit-group="gratVacColumn"] [data-fu-omit]');
  await page.click('#js-remap-apply');
  await expect(page.locator('.toast').last()).toContainText('o declarala ausente con ⊘');
  await page.click('[data-fu-omit-group="gratVacColumn"] [data-fu-omit]');
  await page.click('#js-remap-apply');
  await esperarComplete(page, 2);
  await expect(page.locator('#host')).toContainText('nr.xlsx');

  // La vuelta entera: el perfil guardado precompleta el ⊘ en la próxima
  // carga, y como este archivo SÍ trae una columna que matchea una clave
  // omitida (REIN, vía autoDetect), el aviso aparece — la detección avisa
  // pero no pisa (decisión de Willy, 2026-08-13).
  await page.evaluate(() => { window.__completes = []; });
  await abrirFormulario(page, { detecta: true });
  await expect(page.locator('#js-mapping-form')).toBeVisible();
  await expect(page.locator('[data-fu-omit][aria-pressed="true"]')).toHaveCount(CONCEPTOS_NR);
  await expect(page.locator('select[name="reinHomeOficeColumn"]')).toBeDisabled();
  await expect(page.locator('[data-fu-omit-group="reinHomeOficeColumn"]')).toContainText('columna candidata');
  await expect(page.locator('select[name="reinHomeOficeColumn"]')).toHaveValue('');

  // Caso borde: el cliente empezó a liquidar ese concepto — la columna candidata
  // que el hint señaló de verdad está en el archivo. Destildar el ⊘ y elegirla
  // tiene que resolver el campo (no queda pegado en omitido para siempre) sin
  // tocar los demás, que siguen declarados ausentes.
  await page.click('[data-fu-omit-group="reinHomeOficeColumn"] [data-fu-omit]');
  await expect(page.locator('select[name="reinHomeOficeColumn"]')).toBeEnabled();
  await page.selectOption('select[name="reinHomeOficeColumn"]', 'REIN_HOME_OFICE');
  await page.click('#js-mapping-form button[type=submit]');
  const { mapping: mappingResuelto } = await esperarComplete(page, 1);
  await expect(page.locator('#host')).toContainText('nr.xlsx');
  expect(mappingResuelto.reinHomeOficeColumn).toBe('REIN_HOME_OFICE');
  expect(Object.values(mappingResuelto).filter(v => v === '__omitido__').length).toBe(CONCEPTOS_NR - 1);

  expect(errores).toEqual([]);
});

test('dark mode: el toggle y los badges se ven (regla de CLAUDE.md para UI)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await abrirFormulario(page);
  await expect(page.locator('#js-mapping-form')).toBeVisible();

  await page.locator('[data-fu-omit-group="gratVacColumn"] [data-fu-omit]').click();
  await expect(page.locator('[data-fu-omit-group="gratVacColumn"] [data-fu-omit-badge]')).toBeVisible();
  await expect(page.locator('[data-fu-omit-group="gratVacColumn"] [data-fu-omit-hint]')).toBeVisible();
  await page.screenshot({ path: 'test-results/upload-omision-dark.png', fullPage: true });

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('[data-fu-omit-group="gratVacColumn"] [data-fu-omit-badge]')).toBeVisible();
  await page.screenshot({ path: 'test-results/upload-omision-light.png', fullPage: true });

  expect(errores).toEqual([]);
});
