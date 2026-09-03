// nrExportFormulas.test.js — El .xlsx del Control NR tiene que dejar ver el
// cruce: los dos lados en columnas propias y el CTRL como una fórmula que
// apunta a esas dos celdas. Antes salía sólo la diferencia como número plano y
// no había forma de rehacer la cuenta desde el Excel.
//
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/nrExportFormulas.test.js
//
// Datos 100% inventados (legajos '1'/'2'/'3').

globalThis.document = { addEventListener: () => {} };

const { nrControlarRows, nrControlarTotalRow, NR_CONCEPTS } = await import('./js/controls/nr.js');
const { EXPORT_CONTRACTS } = await import('./js/exports/contracts.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const contract = EXPORT_CONTRACTS.nr;
const keys = contract.columns.map(c => c.key);
const colNum = key => keys.indexOf(key) + 1;

// ── El contrato: tres bloques, sin conceptos inventados ─────────────────────

assert('el contrato trae Legajo + # Difs + los tres bloques de conceptos',
  contract.columns.length === 2 + NR_CONCEPTS.length * 3);
assert('los conceptos están en los tres bloques, con la clave de cada uno',
  NR_CONCEPTS.every(c => keys.includes(`nr_${c.key}`) && keys.includes(`tab_${c.key}`) && keys.includes(c.key)));
assert('no hay claves repetidas (una clave repetida haría que dos columnas lean la misma celda)',
  new Set(keys).size === keys.length);
assert('el bloque del Reporte de NR viene antes que el del Tabulado, y el CTRL al final',
  NR_CONCEPTS.every(c => colNum(`nr_${c.key}`) < colNum(`tab_${c.key}`)
                      && colNum(`tab_${c.key}`) < colNum(c.key)));
assert('sólo el bloque CTRL se resalta en rojo cuando hay diferencia',
  contract.columns.filter(x => x.diffHighlight).length === NR_CONCEPTS.length + 1); // + "# Difs"

// ── Las fórmulas ────────────────────────────────────────────────────────────

const concepto = NR_CONCEPTS[1]; // INDEM_PREAVISO
const otro     = NR_CONCEPTS[0]; // REIN_HOME_OFICE

const filaDe = (legajo, { nrVal, tabVal }) => ({
  legajo,
  valores: Object.fromEntries(NR_CONCEPTS.map(c => {
    const nv = c.key === concepto.key ? nrVal  : null;
    const tv = c.key === concepto.key ? tabVal : null;
    return [c.key, { nrVal: nv, tabVal: tv, ctrl: (nv !== null && tv !== null) ? tv - nv : null }];
  })),
});

const flat = nrControlarRows([
  filaDe('1', { nrVal: 1000, tabVal: 1250 }),   // fila 3 del Excel — con diferencia
  filaDe('2', { nrVal: 800,  tabVal: 800 }),    // fila 4 — cierra
  filaDe('3', { nrVal: null, tabVal: 500 }),    // fila 5 — sólo el Tabulado
], contract);

const letra = n => { let s = '', k = n; while (k > 0) { const r = (k - 1) % 26; s = String.fromCharCode(65 + r) + s; k = Math.floor((k - 1) / 26); } return s; };
const esperada = (c, fila) => `${letra(colNum(`tab_${c.key}`))}${fila}-${letra(colNum(`nr_${c.key}`))}${fila}`;

assert('los datos arrancan en la fila 3 (dos filas de encabezado)',
  flat[0][concepto.key].formula === esperada(concepto, 3));
assert('la segunda fila de datos apunta a la fila 4, no a la 3',
  flat[1][concepto.key].formula === esperada(concepto, 4));
assert('la fórmula es Tabulado − Reporte, en ese orden (un signo al revés invierte todas las diferencias)',
  flat[0][concepto.key].formula.startsWith(`${letra(colNum(`tab_${concepto.key}`))}3-`)
  && flat[0][concepto.key].result > 0); // el Tabulado trajo 1250 contra 1000 del Reporte
assert('el resultado cacheado coincide con lo que da la fórmula',
  flat[0][concepto.key].result === 250);
assert('los dos lados salen en su propia celda, tal como vinieron de cada archivo',
  flat[0][`nr_${concepto.key}`] === 1000 && flat[0][`tab_${concepto.key}`] === 1250);

assert('un concepto que cierra igual también lleva fórmula (result 0), no una celda vacía',
  flat[1][concepto.key].formula === esperada(concepto, 4) && flat[1][concepto.key].result === 0);

// null ≠ 0: si falta un lado no hay resta, y la celda NO puede decir 0,00.
assert('con un solo lado no hay fórmula: la celda del CTRL queda vacía',
  flat[2][concepto.key] === null);
assert('…y el lado que sí vino se sigue viendo',
  flat[2][`nr_${concepto.key}`] === null && flat[2][`tab_${concepto.key}`] === 500);
assert('un concepto sin datos de ningún lado tampoco inventa un cero',
  flat[0][otro.key] === null && flat[0][`nr_${otro.key}`] === null && flat[0][`tab_${otro.key}`] === null);

assert('# Difs cuenta los conceptos con diferencia de esa fila',
  flat[0].difs === 1 && flat[1].difs === 0 && flat[2].difs === 0);

// ── La fila de TOTAL, abajo del último legajo ───────────────────────────────
// Tres filas de datos (3, 4 y 5) ⇒ el TOTAL es la fila 6.

const total = nrControlarTotalRow(flat, contract);

assert('el TOTAL se rotula en la columna del legajo',
  total.legajo === 'TOTAL');
assert('# Difs del TOTAL suma las diferencias de toda la corrida',
  total.difs === 1);
assert('el total de cada fuente es un SUM() sobre su propia columna, de la 1ª a la última fila de datos',
  total[`nr_${concepto.key}`].formula
    === `SUM(${letra(colNum(`nr_${concepto.key}`))}3:${letra(colNum(`nr_${concepto.key}`))}5)`
  && total[`tab_${concepto.key}`].formula
    === `SUM(${letra(colNum(`tab_${concepto.key}`))}3:${letra(colNum(`tab_${concepto.key}`))}5)`);
assert('…y el resultado cacheado es la suma de lo que trajo cada archivo',
  total[`nr_${concepto.key}`].result === 1800 && total[`tab_${concepto.key}`].result === 2550);
assert('el total del CTRL es la RESTA DE LOS TOTALES, apuntando a las dos celdas de la fila del TOTAL',
  total[concepto.key].formula
    === `${letra(colNum(`tab_${concepto.key}`))}6-${letra(colNum(`nr_${concepto.key}`))}6`
  && total[concepto.key].result === 750);
assert('un concepto que nadie liquidó no inventa un total en cero: la celda va vacía',
  total[otro.key] === null
  && total[`nr_${otro.key}`] === null && total[`tab_${otro.key}`] === null);
assert('sin filas de datos no hay fila de TOTAL que escribir (un SUM sobre un rango vacío no es un total)',
  nrControlarTotalRow([], contract) === null);

// AJUSTE_NR (4418) — el concepto que se sumó el 2026-09-03. Va al final de la
// lista para no correr de lugar las columnas que Meta4 ya emite en orden fijo.
const ajuste = NR_CONCEPTS[NR_CONCEPTS.length - 1];
assert('AJUSTE_NR es el último concepto de la lista, en los tres bloques',
  ajuste.label === 'AJUSTE_NR'
  && keys.includes('nr_ajusteNr') && keys.includes('tab_ajusteNr') && keys.includes('ajusteNr'));
assert('AJUSTE_NR se cruza contra las dos columnas mapeadas, una por archivo',
  ajuste.nrKey === 'ajusteNrColumn' && ajuste.tabKey === 'tabAjusteNrColumn');

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
