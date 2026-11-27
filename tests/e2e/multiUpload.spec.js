// multiUpload.spec.js — Las dos pantallas de carga multi-archivo (Fase 4, Paso 2)
//
// Son la única superficie de carga que NO tenía cobertura: los e2e que levantan
// la app entera necesitan Dexie/SheetJS del CDN y no corren en un sandbox sin
// red. Este fixture sirve las dos librerías desde `node_modules` y monta
// `initFileUploadStep` solo, así que corre en cualquier lado — y ejercita lo que
// el Paso 2 rewireó: que el flujo salga del `flow` declarado en la ficha y no de
// un `if` por nombre de archivo, y que los textos de la zona de drop salgan de
// `dropLabelFor`/`dropHintFor` (D-050: Acumuladores ya no tiene un `dropLabel`
// propio, cae al mismo fallback que CONTA).
//
// Datos inventados, como manda el repo: legajos '1'/'2', Sanguinetti/Falcioni.

import { test, expect } from '@playwright/test';

const errores = [];
test.beforeEach(async ({ page }) => { page.on('pageerror', e => errores.push(String(e))); });

test('CONTA: la pantalla multi-archivo sale de la ficha y concatena', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/multiUpload.html');
  await expect(page.locator('#out')).toHaveText('listo', { timeout: 15000 });
  await page.evaluate(() => window.__mount('conta_file'));

  expect(await page.evaluate(() => window.__dropText()))
    .toBe('Arrastrá la Contabilidad Desglosada o hacé clic para buscarla — .xlsx. Podés soltar varios meses juntos.');

  await page.evaluate(() => window.__drop('conta_file', ['abril.xlsx', 'mayo.xlsx']));
  const d = await page.evaluate(() => window.__completes.at(-1));
  expect(d.fileType).toBe('conta_file');            // sale del parámetro, ya no cableado
  expect(d.parsedRows.length).toBe(4);              // 2 archivos × 2 filas con CC (la de "Null" se descarta)
  expect(d.fileName).toContain('2 archivos');
  expect(await page.locator('#host').textContent()).toContain('sin CC descartadas');
  // El casillero cargado dice cuántos archivos se sumaron y deja quitar cada uno.
  await expect(page.locator('#host .dropzone__count')).toHaveText('2 archivos');
  await expect(page.locator('#host [data-multi-remove]')).toHaveCount(2);
  expect(errores).toEqual([]);
});

test('CONTA: quitar un archivo del casillero deja el otro cargado', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/multiUpload.html');
  await expect(page.locator('#out')).toHaveText('listo', { timeout: 15000 });
  await page.evaluate(() => window.__mount('conta_file'));
  await page.evaluate(() => window.__drop('conta_file', ['abril.xlsx', 'mayo.xlsx']));

  await page.locator('#host [data-multi-remove]').first().click();

  const d = await page.evaluate(() => window.__completes.at(-1));
  expect(d.parsedRows.length).toBe(2);
  expect(d.fileName).toBe('mayo.xlsx');
  // El ✕ no abre el selector de archivos: el casillero sigue mostrando el que quedó.
  await expect(page.locator('#host [data-multi-remove]')).toHaveCount(1);
  expect(errores).toEqual([]);
});

test('Acumuladores: pantalla propia, con período por archivo', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/multiUpload.html');
  await expect(page.locator('#out')).toHaveText('listo', { timeout: 15000 });
  await page.evaluate(() => window.__mount('acumuladores_file'));

  expect(await page.evaluate(() => window.__dropText()))
    .toBe('Acumuladores (export de Axton) — arrastrá uno o varios .xlsx (uno por mes), o hacé clic para elegir');

  await page.evaluate(() => window.__drop('acumuladores_file', ['repacumuladores.20260428.101010.xlsx']));
  const d = await page.evaluate(() => window.__completes.at(-1));
  expect(d.fileType).toBe('acumuladores_file');
  expect(d.parsedRows.length).toBe(2);
  expect(d.parsedRows[0]._period).toBe('2026-04');  // inferido del nombre
  await expect(page.locator('#host input[type=month]')).toHaveCount(1);
  expect(errores).toEqual([]);
});

// D-109: el Reporte de Rendimiento en la casilla multi de Rendimiento vs Asiento.
// Tiene columnas que mapear: el formulario sale una vez, con el primer archivo,
// y un archivo con otras columnas no se suma.
test('Rendimiento multi: un mapeo para todos y rechazo por columnas distintas', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/multiUpload.html');
  await expect(page.locator('#out')).toHaveText('listo', { timeout: 15000 });
  await page.evaluate(() => window.__mount('rend_file', 'multi'));

  const texto = await page.evaluate(() => window.__dropText());
  expect(texto).toContain('Arrastrá el Reporte de Rendimiento');
  expect(texto).not.toContain('meses');

  await page.evaluate(() => window.__drop('rend_file', [['rend_a.xlsx', 'REND_A'], ['rend_b.xlsx', 'REND_B']]));
  await expect(page.locator('#host #js-mapping-form')).toBeVisible();
  await page.locator('#host #js-mapping-form button[type=submit]').click();

  await expect(page.locator('#host .dropzone__count')).toHaveText('2 archivos');
  const d = await page.evaluate(() => window.__completes.at(-1));
  expect(d.parsedRows.length).toBe(3);                 // se concatenan; la suma por CC la hace el control
  expect(d.mapping.ccNameColumn).toBe('CENTRO COSTO');  // un solo mapeo para los dos
  expect(await page.locator('#host').textContent()).not.toContain('con CC');

  // "+ Sumar" con un archivo de otras columnas: no entra y se dice por qué.
  await page.evaluate(() => window.__drop('rend_file', [['rend_otro.xlsx', 'REND_OTRO']]));
  await expect(page.locator('#host [data-multi-rejected]')).toHaveCount(1);
  await expect(page.locator('#host [data-multi-rejected]')).toContainText('rend_otro.xlsx');
  await expect(page.locator('#host [data-multi-rejected]')).toContainText('PRECIO');
  await expect(page.locator('#host .dropzone__count')).toHaveText('2 archivos');
  expect(errores).toEqual([]);
});
