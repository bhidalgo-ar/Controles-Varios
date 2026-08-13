// moduleGraph.spec.js — El grafo de módulos levanta en un navegador (Fase 4, Paso 3)
//
// Los ciclos de import rompen SÓLO en el navegador (D-045): Node los tolera y
// los tests unitarios pasan igual. Los e2e que levantarían la app entera
// necesitan Dexie/SheetJS del CDN, así que en un sandbox sin red no corren — o
// sea que justo la verificación que hace falta es la que falta.
//
// Este fixture importa `controlsWizard.js`, que arrastra el grafo más grande de
// la app (registry → los 15 controles → parsers → exports), sirviendo Dexie
// desde node_modules. Si alguien cierra un ciclo, esto falla acá y no en la
// máquina de un analista.

import { test, expect } from '@playwright/test';
test('el wizard y la ficha cargan juntos en un navegador real, sin ciclo de módulos', async ({ page }) => {
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.goto('/tests/e2e/fixtures/moduleGraph.html');
  await expect(page.locator('#out')).not.toHaveText('—', { timeout: 20000 });
  const r = JSON.parse(await page.locator('#out').textContent());
  console.log('RESULTADO:', JSON.stringify(r));
  expect(errores).toEqual([]);
  expect(r.ok).toBe(true);
  expect(r.wizardCargo).toBe(true);
  expect(r.autoDetectTabPrev).toBe(true);
  expect(r.conAutoDetect).toBe(9);
  expect(r.specs).toEqual(['rend_vs_asiento.conta','variaciones_conceptos.tab_prev','variaciones_sueldos.tab_prev']);
});
