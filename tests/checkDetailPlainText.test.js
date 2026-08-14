// checkDetailPlainText.test.js — El `detail` de un chequeo va en texto plano.
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/checkDetailPlainText.test.js
//
// `renderChecks` (js/ui/resultBlocks.js) escapa el `detail` antes de meterlo al
// HTML, como manda CLAUDE.md. `renderIssues`, en cambio, inserta el `right`
// crudo a propósito, para poder pintar el importe. Son dos slots con contratos
// distintos y es fácil confundirlos: Agrupadores mandaba `formatDiff()` — que
// devuelve un `<span>` — al `detail`, y el analista veía en pantalla
//   "Sueldo $ 3.000,00 vs $ 2.900,00 · <span class="text-success">+$ 100,00</span>"
// con la etiqueta escrita como texto, en vez del importe.
//
// Acá se fija el contrato de los dos formateadores.

const { formatDiff, formatDiffText, formatAmount } = await import('./js/utils/currency.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else     { console.error('✗', desc); fail++; }
}

// ── formatDiffText: lo que va a un slot que se escapa ────────────────────────
assert('formatDiffText no trae NINGUNA etiqueta HTML',
  !/[<>]/.test(formatDiffText(100)) && !/[<>]/.test(formatDiffText(-100)) && !/[<>]/.test(formatDiffText(0)));

assert('una diferencia positiva lleva el signo +', formatDiffText(100) === '+$ 100,00');
assert('una diferencia negativa lleva el signo -', formatDiffText(-500.5) === '-$ 500,50');
assert('el cero no lleva signo', formatDiffText(0) === '$ 0,00');
assert('usa el formato de moneda argentina (miles con punto, decimales con coma)',
  formatDiffText(1234.5) === `+$ ${formatAmount(1234.5)}` && formatDiffText(1234.5) === '+$ 1.234,50');

// ── formatDiff: lo que va a un slot que inserta crudo ────────────────────────
assert('formatDiff sigue devolviendo el <span> con color', formatDiff(100) === '<span class="text-success">+$ 100,00</span>');
assert('una diferencia negativa va en rojo', formatDiff(-500.5) === '<span class="text-danger">-$ 500,50</span>');
assert('el cero va en verde, como antes', formatDiff(0) === '<span class="text-success">$ 0,00</span>');
assert('formatDiff es formatDiffText envuelto: el número es el mismo en los dos',
  formatDiff(1234.5).includes(formatDiffText(1234.5)));

// ── El detail que arma Agrupadores no puede llevar etiquetas ─────────────────
// Se reconstruye igual que en js/controls/agrupadores.js (renderChecks).
const g = { grouperName: 'Sueldo', totalNomina: 3000, totalResumen: 2900, diffAbsolute: 100, rowsWithDiff: 1, rowsTotal: 2 };
const detail = `$ ${formatAmount(g.totalNomina)} vs $ ${formatAmount(g.totalResumen)}`
  + (g.rowsWithDiff > 0 ? ` · ${formatDiffText(g.diffAbsolute)} (${g.rowsWithDiff}/${g.rowsTotal} legajos)` : ' · sin diferencia');

assert('el chip de "Totales por agrupador" no tiene etiquetas HTML', !/[<>]/.test(detail));
assert('el chip dice el importe de la diferencia', detail === '$ 3.000,00 vs $ 2.900,00 · +$ 100,00 (1/2 legajos)');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
