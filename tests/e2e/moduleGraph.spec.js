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
  // 8 con autoDetect propio + tab_prev_file, tab_empresa2_file, tab_empresa3_file
  // y tab_netos_prev_file, que lo heredan por `...FILE_TYPES.tab_control`: son el
  // MISMO archivo (otra empresa, u otro mes) y tienen que auto-detectar la
  // columna de legajo igual que el Tabulado principal.
  expect(r.conAutoDetect).toBe(12);
  // Misma lista que fija `tests/fileTypes.test.js`: los 2 de pop_variaciones se
  // sumaron con el control de Variación entre quincenas (su panel del Paso 2
  // depende de qué Tabulados estén cargados).
  // El de `novedades_importador` se sumó con el generador de importador de
  // novedades: cargar la planilla cambia lo que ofrece su panel de conceptos.
  expect(r.specs).toEqual([
    'novedades_importador.novedades',
    'pop_variaciones.tab_act', 'pop_variaciones.tab_prev',
    'rend_vs_asiento.conta', 'variaciones_conceptos.tab_prev', 'variaciones_sueldos.tab_prev',
  ]);
});
