// servir-local.mjs — Levanta la app SIN internet, para poder abrirla en un
// navegador desde una sesión remota (el contenedor no llega a los CDN).
//
// Para usar la app en tu máquina no hace falta esto: alcanza con
// `python3 -m http.server 4173` (ver README). Esto existe para verificar un
// cambio en la app real —abrirla, correr un control, bajar el .xlsx y mirarlo—
// cuando el entorno no tiene salida a internet.
//
// Qué hace: sirve la carpeta del proyecto y, al pedir index.html, reemplaza las
// dos librerías que vienen por CDN (SheetJS y Dexie) por las copias que ya
// están en node_modules, y saca el <link> de Google Fonts. ExcelJS no se pide
// desde index.html sino recién al exportar, así que esa hay que interceptarla
// desde el navegador (ver el ejemplo de Playwright abajo).
//
//   npm run servir:local            # http://localhost:4173
//   npm run servir:local -- 4174    # otro puerto
//
// Desde Playwright, para que el .xlsx se pueda bajar:
//
//   await page.route('**' + '/exceljs*.js', route => route.fulfill({
//     contentType: 'text/javascript',
//     body: fs.readFileSync('node_modules/exceljs/dist/exceljs.min.js', 'utf8'),
//   }));
//
// `APP_ROOT` sirve para apuntar a otra copia del repo (por ejemplo un
// `git worktree` de un commit anterior) y comparar el archivo de antes contra
// el de después en dos puertos a la vez.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.env.APP_ROOT || process.cwd());
const PORT = Number(process.argv[2] || 4173);

const VENDOR = {
  '/vendor/xlsx.full.min.js': 'node_modules/xlsx/dist/xlsx.full.min.js',
  '/vendor/dexie.min.js':     'node_modules/dexie/dist/dexie.min.js',
  '/vendor/exceljs.min.js':   'node_modules/exceljs/dist/exceljs.min.js',
};

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  if (VENDOR[url]) {
    const lib = path.join(ROOT, VENDOR[url]);
    if (!fs.existsSync(lib)) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`Falta ${VENDOR[url]} — corré "npm install" antes.`);
    }
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(fs.readFileSync(lib));
  }

  const rel = url === '/' ? 'index.html' : url.replace(/^\//, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`No existe: ${rel}`);
  }

  let body = fs.readFileSync(file);
  if (rel === 'index.html') {
    body = String(body)
      .replace(/https:\/\/cdn\.sheetjs\.com\/[^"]+/, '/vendor/xlsx.full.min.js')
      .replace(/https:\/\/unpkg\.com\/dexie[^"]+/, '/vendor/dexie.min.js')
      .replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g, '');
  }

  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
}).listen(PORT, () => {
  console.log(`Controles Nómina servido en http://localhost:${PORT} (desde ${ROOT})`);
});
