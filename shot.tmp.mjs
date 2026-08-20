import { chromium } from '@playwright/test';
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errores = [];
for (const tema of ['sobrio', 'intenso', 'oscuro']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errores.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errores.push(m.text()); });
  await page.goto('http://localhost:8765/tests/e2e/fixtures/vistaEstandar.html');
  await page.waitForSelector('.rb-verdict', { timeout: 10000 });
  await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), tema);

  await page.locator('[role="tab"]', { hasText: /^Fichas$/ }).first().click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/m-fichas-default-${tema}.png`, fullPage: true });
  await page.locator('.results-chip', { hasText: 'Todos' }).first().click();
  await page.locator('.ficha').first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/m-fichas-${tema}.png`, fullPage: true });

  await page.locator('[role="tab"]', { hasText: /^Planilla$/ }).first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/m-planilla-${tema}.png`, fullPage: true });
  await page.locator('[role="tab"]', { hasText: 'DATOS' }).first().click();
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.querySelectorAll('.rb-grid-wrap').forEach(w => w.scrollLeft = 99999); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/m-planilla-scroll-${tema}.png` });
  await page.close();
}
console.log('ERRORES:', JSON.stringify(errores));
await browser.close();
