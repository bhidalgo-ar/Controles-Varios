// playwright.config.js — Config mínima para correr tests/e2e en CI.
// La app no tiene build step (ver CLAUDE.md); acá solo la servimos como
// archivos estáticos para que un navegador real la pueda cargar en CI.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false, // cada test parte de una IndexedDB nueva del navegador, pero corren contra el mismo server
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // Permite apuntar a un Chromium ya instalado (p.ej. en un sandbox de
    // desarrollo). En CI esta variable no está seteada y Playwright usa el
    // browser que instaló `playwright install`.
    // Ese Chromium de sandbox puede ser más nuevo que el que espera esta
    // versión de Playwright, que lo arranca con `--headless=old`: el binario ya
    // no tiene ese modo y ni abre. `headless: false` + `--headless=new` lo
    // levanta igual de headless, por la puerta que sí existe. En CI la variable
    // no está seteada y no cambia nada.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
          headless: false,
          args: ['--headless=new', '--no-sandbox'],
        }
      : {},
  },
  webServer: {
    command: 'python3 -m http.server 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
