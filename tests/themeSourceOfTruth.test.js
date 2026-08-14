// themeSourceOfTruth.test.js — Un solo archivo decide colores por tema.
//
// La regla: `css/tokens.css` es el ÚNICO lugar donde un tema cambia algo. El
// resto de las hojas y los módulos de `js/` escriben `var(--token)` y nunca
// preguntan qué tema está activo. Sin esta regla escrita como assert, la
// deriva vuelve sola: alcanza con que alguien "arregle" un color puntual con un
// `#hex` o con un `[data-theme="oscuro"] .mi-componente { … }` para que ese
// componente quede fuera del sistema — se ve bien en el tema en el que lo
// probaron y mal en los otros dos.
//
// Esto ya pasó y por eso el test existe: los tokens del banner de privacidad y
// de los toasts vivían en `components.css` con su propio juego de cuatro reglas
// por tema, y las muestras del selector de tema y los anillos de foco estaban
// cableados en hex (el anillo, además, seguía siendo el celeste del tema claro
// cuando el analista estaba en Oscuro).
//
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/themeSourceOfTruth.test.js

import { readFileSync } from 'node:fs';

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle ? `\n    ${detalle}` : ''); fail++; }
}

// Saca comentarios `/* … */` para no marcar un hex que sólo está explicado en
// prosa (varios comentarios citan el valor viejo a propósito).
const sinComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Un color literal: #abc, #aabbcc, rgb(...), rgba(...), hsl(...).
const COLOR_LITERAL = /#[0-9A-Fa-f]{3,8}\b|\brgba?\(|\bhsla?\(/g;

const HOJAS_DE_COMPONENTES = ['css/base.css', 'css/components.css', 'css/results.css'];

// ── 1. Ninguna hoja que no sea tokens.css decide por tema ──────────────────
for (const archivo of HOJAS_DE_COMPONENTES) {
  const css = sinComentarios(readFileSync(archivo, 'utf8'));

  const bloquesDeTema = css.match(/\[data-theme[^\]]*\]/g) || [];
  assert(`${archivo} no tiene reglas por tema`,
    bloquesDeTema.length === 0,
    bloquesDeTema.join(', '));

  const preferencias = css.match(/prefers-color-scheme/g) || [];
  assert(`${archivo} no mira la preferencia de color del sistema`,
    preferencias.length === 0,
    `${preferencias.length} @media`);

  const literales = css.match(COLOR_LITERAL) || [];
  assert(`${archivo} no tiene colores literales — todo sale de un token`,
    literales.length === 0,
    literales.slice(0, 6).join(' · '));

  // El serif H&A es "sólo display y sólo en tema Intenso" (docs/rediseno).
  // Quien lo pide directo se saltea al tema: el KPI de las tarjetas de
  // resultados estaba cableado a --serif y salía serif también en Sobrio y en
  // Oscuro. El token que responde al tema es --font-display.
  assert(`${archivo} pide el serif por --font-display y no por --serif`,
    !css.includes('var(--serif)'));
}

// ── 2. tokens.css sí los tiene, y define los tres temas ────────────────────
const tokens = readFileSync('css/tokens.css', 'utf8');
for (const tema of ['sobrio', 'intenso', 'oscuro']) {
  assert(`tokens.css declara el tema ${tema}`, tokens.includes(`[data-theme="${tema}"]`));
}

// ── 3. Todo token tiene default en :root ───────────────────────────────────
// Un token que sólo existe adentro de un bloque de tema queda INDEFINIDO en el
// estado por default del navegador (sin `data-theme`, sin preferencia oscura) y
// el componente que lo use se dibuja sin ese color. Es lo que le pasó a los
// `--color-toast-*` y a los ocho `--color-group-*`, que además no los usaba
// nadie (ver tests/e2e/tokenDefaults.spec.js, que lo prueba en un navegador).
const sinCom = sinComentarios(tokens);
const bloqueRoot = sinCom.slice(sinCom.indexOf(':root'), sinCom.indexOf('@media'));
const declaradosEnRoot = new Set([...bloqueRoot.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
const todos = new Set([...sinCom.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
const sinDefault = [...todos].filter(t => !declaradosEnRoot.has(t));
assert('todo token de tokens.css tiene su valor claro en :root',
  sinDefault.length === 0,
  sinDefault.join(' · '));

const { readdirSync, statSync } = await import('node:fs');
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = `${dir}/${n}`;
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});

// ── 4. Ningún módulo de js/ pregunta por el tema ───────────────────────────
// El selector de tema (js/main.js) es el único que puede: es quien lo aplica.
for (const archivo of walk('js').filter(f => f !== 'js/main.js')) {
  const src = readFileSync(archivo, 'utf8');
  assert(`${archivo} no ramifica por tema`,
    !/data-theme|prefers-color-scheme|['"](?:intenso|sobrio|oscuro)['"]/.test(src));
}

// ── 5. Ningún hex cableado en los módulos que dibujan la app ───────────────
// Excepción declarada: js/controls/variaciones.js arma un documento HTML
// standalone para imprimir a PDF (el entregable que se le manda al cliente).
// Ese documento se abre en una ventana propia, sin las hojas de la app y sin
// tema: sus colores van literales a propósito y no responden al selector.
const DOCUMENTO_APARTE = 'js/controls/variaciones.js';
for (const archivo of walk('js')) {
  if (archivo === DOCUMENTO_APARTE) continue;
  const src = readFileSync(archivo, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  // '#/algo' son rutas del hash router, no colores.
  const hex = (src.match(/#[0-9A-Fa-f]{3,8}\b/g) || []);
  assert(`${archivo} no tiene colores cableados`, hex.length === 0, hex.join(' · '));
}

console.log(`\n${ok} ok, ${fail} fail`);
if (fail) process.exit(1);
