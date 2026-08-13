// moduleCycles.test.js — Ningún ciclo de import en js/ (Fase 4, D-048)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/moduleCycles.test.js
//
// **Los ciclos de import rompen SÓLO en el navegador** (D-045). Node los tolera,
// así que los otros 30 tests de la cadena pasan igual con un ciclo adentro; y los
// e2e que levantan la app entera —los únicos que lo agarrarían— necesitan Dexie
// del CDN y no corren en un sandbox sin red. O sea que hasta acá el único aviso
// posible era que la app no arrancara en la máquina de un analista.
//
// Este barrido es estático: arma el grafo de imports relativos de js/ y busca
// ciclos. No ejecuta nada, así que no necesita ni navegador ni red.
//
// Cómo se validó que sirve (un detector que siempre dice "todo bien" no prueba
// nada): se inyectó un ciclo real —un parser importando de vuelta a
// `fileUpload.js`— y se confirmó que lo reporta con la ruta completa
// `fileUpload.js → fileTypes.js → nrParser.js → fileUpload.js`.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve, relative } from 'path';

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const ROOT = process.cwd();

function jsFilesIn(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...jsFilesIn(p));
    else if (entry.endsWith('.js')) out.push(p);
  }
  return out;
}

/**
 * Grafo de imports relativos. Los bare specifiers (librerías por CDN) no entran:
 * no pueden formar un ciclo con código del repo.
 */
function buildGraph(files) {
  const graph = new Map();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const deps = [];
    for (const m of src.matchAll(/^\s*import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
      deps.push(resolve(dirname(file), m[1]));
    }
    graph.set(file, deps);
  }
  return graph;
}

/** Todos los ciclos alcanzables, como rutas completas. */
function findCycles(graph) {
  const cycles = [];
  const listo = new Set();
  function walk(node, stack) {
    if (listo.has(node)) return;
    const i = stack.indexOf(node);
    if (i !== -1) { cycles.push([...stack.slice(i), node]); return; }
    stack.push(node);
    for (const dep of (graph.get(node) || [])) walk(dep, stack);
    stack.pop();
    listo.add(node);
  }
  for (const file of graph.keys()) walk(file, []);
  return cycles;
}

const files = jsFilesIn(join(ROOT, 'js'));
const graph = buildGraph(files);
const cycles = findCycles(graph);
const fmt = c => c.map(p => relative(ROOT, p)).join(' → ');

assert(`el barrido recorrió los módulos de verdad (${files.length})`, files.length >= 50);
assert('hay imports relativos que seguir (si no, el barrido no prueba nada)',
  [...graph.values()].some(deps => deps.length > 0));
assert(`ningún ciclo de import en js/${cycles.length ? ':' : ''}`, cycles.length === 0);
for (const c of cycles) console.error('    ' + fmt(c));

// Todo import relativo tiene que resolver a un archivo que exista. Un typo en una
// ruta rompe en el navegador y en ningún otro lado — mismo problema, misma
// invisibilidad.
const rotos = [];
for (const [file, deps] of graph) {
  for (const dep of deps) {
    if (!files.includes(dep)) rotos.push(`${relative(ROOT, file)} → ${relative(ROOT, dep)}`);
  }
}
assert(`todo import relativo apunta a un archivo que existe${rotos.length ? ': ' + rotos.join(', ') : ''}`,
  rotos.length === 0);

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
