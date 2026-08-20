// vistaEstandar.test.js — Las piezas compartidas de la vista estándar de
// resultados (specs/vista-estandar-resultados.md): los cinco chips de estado, la
// ficha y el descriptor de columnas de la planilla.
//
// Se testean acá y una sola vez porque las heredan los 21 controles: si la fila
// de chips deja de decir las mismas cinco palabras, o el TOTAL de la planilla
// deja de totalizar una columna, se rompe en las 21 pantallas a la vez y no hay
// forma de que alguien lo mire control por control.
//
// Los tres módulos tocan `document` al cargarse (resultBlocks engancha el Escape
// de la planilla ampliada), así que va un stub mínimo antes del import — mismo
// patrón que otros tests del repo. Lo que se prueba acá son las funciones PURAS:
// las que arman HTML. Lo que necesita un navegador de verdad (que el rótulo de
// banda quede pegado al scrollear, que el cuerpo de la ficha se dibuje al
// abrirla) se mira en pantalla, no acá.
//
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/vistaEstandar.test.js

globalThis.document = { addEventListener() {} };

const { rubroGridHtml } = await import('./js/ui/resultBlocks.js');
const { ESTADOS, estadoOptionsHtml, estadoInicial, estadoDeDiferencia } = await import('./js/ui/tableTools.js');
const { fichaCardHtml, fichaBodyHtml } = await import('./js/ui/fichaList.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle ? `\n    ${detalle}` : ''); fail++; }
}
function assertThrows(desc, fn, fragmento) {
  try { fn(); assert(desc, false, 'no tiró ningún error'); }
  catch (e) { assert(desc, String(e.message).includes(fragmento), e.message); }
}

// ══════════════════════════════════════════════════════════════════════
// 1. Los cinco chips de estado (§3)
// ══════════════════════════════════════════════════════════════════════

assert('son cinco estados, ni uno más',
  ESTADOS.length === 5);

assert('con esas palabras y en ese orden — se leen de peor a cerrado, y "Sin comparar" va último',
  ESTADOS.map(e => e.label).join(' · ')
    === 'Todos · Con diferencia · Dentro del margen · Al centavo · Sin comparar',
  ESTADOS.map(e => e.label).join(' · '));

assert('"Sin comparar" va en ámbar: no es un grado de cierre, es el resto (D-073)',
  ESTADOS.find(e => e.value === 'sinComparar').tone === 'warn');

assert('"Al centavo" en verde y "Con diferencia" en rojo',
  ESTADOS.find(e => e.value === 'centavo').tone === 'ok'
  && ESTADOS.find(e => e.value === 'conDif').tone === 'error');

const opciones = estadoOptionsHtml({
  counts: { conDif: 3, margen: 0, centavo: 12, sinComparar: 2 },
});

assert('los cinco estados salen siempre, aunque uno no tenga casos',
  (opciones.match(/<option /g) || []).length === 5);

assert('"Todos" suma los cuatro cuando no se lo pasan',
  opciones.includes('Todos (17)'), opciones);

assert('un estado sin casos se muestra igual, con su 0 y sin poder tocarse',
  /<option value="margen"[^>]*disabled[^>]*>Dentro del margen \(0\)<\/option>/.test(opciones), opciones);

assert('y su title dice que no hubo ninguno en esta corrida',
  /value="margen"[^>]*title="Ningún caso quedó en este estado en esta corrida/.test(opciones), opciones);

const conNoAplica = estadoOptionsHtml({
  counts: { conDif: 0, margen: 0, centavo: 5, sinComparar: 0 },
  noAplica: { margen: 'este control no cruza dos archivos' },
});
assert('cuando el estado NO APLICA al control, el title lo dice en vez de "no hubo ninguno"',
  /value="margen"[^>]*title="No aplica a este control: este control no cruza dos archivos\."/.test(conNoAplica),
  conNoAplica);

assert('cada opción declara su tono, que es de donde el chip saca el color',
  /value="sinComparar" data-tone="warn"/.test(opciones), opciones);

assert('arranca activo "Con diferencia" si hay alguno',
  estadoInicial({ conDif: 3, centavo: 10 }) === 'conDif');
assert('y "Todos" si no hay ninguno',
  estadoInicial({ conDif: 0, centavo: 10 }) === 'todos');

// En qué estado cae una diferencia — la definición del §3, en un solo lugar.
assert('`null` no es 0: sin un lado no se pudo comparar',
  estadoDeDiferencia(null, 100) === 'sinComparar');
assert('hasta un centavo es "Al centavo" (el redondeo de Meta4)',
  estadoDeDiferencia(0.01, 100) === 'centavo' && estadoDeDiferencia(0, 100) === 'centavo');
assert('arriba del centavo y hasta el monto del cliente es "Dentro del margen"',
  estadoDeDiferencia(50, 100) === 'margen' && estadoDeDiferencia(100, 100) === 'margen');
assert('arriba de ese monto es "Con diferencia", para los dos signos',
  estadoDeDiferencia(100.01, 100) === 'conDif' && estadoDeDiferencia(-250, 100) === 'conDif');

// ══════════════════════════════════════════════════════════════════════
// 2. La ficha (§4)
// ══════════════════════════════════════════════════════════════════════

const fichaOk = {
  id: '10',
  name: 'SANGUINETTI JAVIER',
  severity: 'error',
  tag: { text: 'Julio 2026' },
  badge: { text: 'La reconciliación no cierra', tone: 'error' },
  context: ['Con movimiento en el mes', '2 de 2 meses con doceava'],
  marks: [{ text: 'Doceava atípica', tone: 'info' }],
  amountLabel: 'SAC teórico',
  amount: 15291.67,
  amountTone: 'error',
  body: {
    strip: [
      { label: 'Suma de componentes', value: 200000 },
      { label: 'TOTAL en el crudo', value: 195000, invert: true },
      { label: 'Residuo', value: 5000, residuo: true },
    ],
    tables: [
      { title: 'Cómo debería ser', rows: [{ label: 'Bruto', code: '1100', value: 180000 }], foot: { label: 'TOTAL', value: 200000, tone: 'ink' } },
      { title: 'Cómo salió', rows: [{ label: 'TOTAL', code: '1100…1109', value: 195000 }], foot: { label: 'Residuo', value: 5000, tone: 'error' } },
    ],
    detail: {
      columns: [{ key: 'mes', label: 'Mes' }, { key: 'doceava', label: 'Doceava', num: true }],
      rows: [{ mes: 'Junio 2026', doceava: 8000, tone: 'pos' }, { mes: 'Julio 2026', doceava: -500, tone: 'neg' }],
      foot: { label: 'SAC teórico', value: 7500 },
    },
    conclusion: { tone: 'error', title: 'No cierra por 5.000,00', text: 'Mirá los acumuladores del legajo.' },
  },
};

const card = fichaCardHtml(fichaOk);

assert('la ficha es un <details>/<summary> nativo — funciona sin JS y lo encuentra el Ctrl+F',
  card.includes('<details class="ficha ficha--error"') && card.includes('<summary class="ficha__head">'));

assert('el avatar lleva el número de la unidad y el gradiente de su severidad',
  card.includes('ficha__avatar ficha__avatar--error') && card.includes('>10</span>'));

assert('la línea de identidad trae nombre, tag de contexto y el badge de la causa principal',
  card.includes('SANGUINETTI JAVIER') && card.includes('Julio 2026')
  && card.includes('La reconciliación no cierra'));

assert('la línea de contexto va separada por · ',
  card.includes('Con movimiento en el mes · 2 de 2 meses con doceava'));

assert('las marcas son el segundo eje y van en su propia línea, no entre los chips',
  card.includes('ficha__mark ficha__mark--info') && card.includes('Doceava atípica'));

assert('el importe va a la derecha con su rótulo y su caret',
  card.includes('ficha__amount-label') && card.includes('15.291,67') && card.includes('ficha__caret'));

assert('el CUERPO no se dibuja al pintar la lista — queda vacío hasta el primer despliegue',
  card.includes('<div class="ficha__body" data-ficha-body></div>')
  && !card.includes('Suma de componentes'));

const body = fichaBodyHtml(fichaOk.body, { id: fichaOk.id });

assert('la tira de conciliación es una cascada: la anteúltima invertida y el residuo en rojo',
  body.includes('ficha-strip__pill--invert') && body.includes('ficha-strip__pill--residuo'));

assert('las dos tablas van al lado, cada una con su pie de color',
  body.includes('ficha-tables') && body.includes('ficha-table__foot--ink')
  && body.includes('ficha-table__foot--error'));

assert('cada fila de las tablas lleva su código de concepto entre paréntesis',
  body.includes('(1100)'), body.slice(0, 400));

assert('el detalle pinta en verde lo que suma y en rojo lo que resta',
  body.includes('ficha-detail__row--pos') && body.includes('ficha-detail__row--neg'));

assert('la conclusión cierra la ficha con su caja de color',
  body.includes('ficha-conclusion--error') && body.includes('No cierra por 5.000,00'));

// Las dos partes obligatorias. Un default silencioso es un bug: una ficha a la
// que le falta la tira o la conclusión no se dibuja a medias, avisa dónde se
// programa.
assertThrows('sin tira de conciliación no se dibuja media ficha: avisa',
  () => fichaBodyHtml({ conclusion: { title: 'x' } }, { id: '10' }),
  'tira de conciliación');
assertThrows('sin conclusión tampoco — es la instrucción, no un resumen',
  () => fichaBodyHtml({ strip: [{ label: 'a', value: 1 }] }, { id: '10' }),
  'conclusión');
assertThrows('y sin cuerpo, menos',
  () => fichaBodyHtml(undefined, { id: '10' }),
  'cuerpo');

assert('las dos tablas son dos: una tercera no se dibuja',
  !fichaBodyHtml({ ...fichaOk.body, tables: [
    { title: 'Una', rows: [] }, { title: 'Dos', rows: [] }, { title: 'Tres', rows: [] },
  ] }).includes('Tres'));

assert('el detalle y las tablas son opcionales: con la tira y la conclusión alcanza',
  fichaBodyHtml({ strip: [{ label: 'Base', value: 10 }], conclusion: { title: 'Cierra' } })
    .includes('Cierra'));

// Los nombres vienen de un Excel de un tercero.
assert('todo lo que entra a la ficha se escapa',
  fichaCardHtml({ ...fichaOk, name: '<img src=x onerror=alert(1)>' })
    .includes('&lt;img src=x onerror=alert(1)&gt;'));

// ══════════════════════════════════════════════════════════════════════
// 3. La planilla: el descriptor de columnas (§5)
// ══════════════════════════════════════════════════════════════════════

const columnas = [
  { key: 'legajo', label: 'Legajo',            band: 'Identificación' },
  { key: 'nombre', label: 'Apellido y Nombre', band: 'Identificación' },
  { key: 'bruto',  label: 'Bruto',             band: 'Gravado del mes', sub: '1100', num: true },
  { key: 'sac2',   label: 'SAC 2da',           band: 'Gravado del mes', sub: '1109', num: true },
  { key: 'total',  label: 'TOTAL',             band: 'Gravado del mes', sub: '1100 + 1109', num: true, close: true },
  { key: 'jub',    label: 'Jubilación',        band: 'Retenciones',     sub: '1120', num: true },
];

const filas = [
  { legajo: '10', nombre: 'SANGUINETTI JAVIER', bruto: 1000,    sac2: null, total: 1000,    jub: 110 },
  { legajo: '11', nombre: 'ALBELLA GUSTAVO',    bruto: 2000.50, sac2: 500,  total: 2500.50, jub: 275.06 },
];

const grid = rubroGridHtml({ columns: columnas, rows: filas, unitLabel: 'legajos' });

assert('la fila de bandas agrupa las columnas, y la primera es Identificación',
  /<th colspan="2"[^>]*>Identificación<\/th>/.test(grid), grid.slice(0, 300));

assert('cada banda ocupa exactamente sus columnas',
  /<th colspan="3"[^>]*>Gravado del mes<\/th>/.test(grid)
  && /<th colspan="1"[^>]*>Retenciones<\/th>/.test(grid));

assert('cada título lleva su base de cálculo abajo — es lo que hace que la planilla se explique sola',
  grid.includes('<span class="rb-col__sub">1100 + 1109</span>'));

assert('la columna que cierra la banda se marca para pintarse distinta',
  grid.includes('rb-col--close'));

assert('el divisor va en la primera columna de cada banda que no es la primera',
  (grid.match(/rb-band--next/g) || []).length >= 2);

assert('ausencia de dato es "—", nunca 0,00 (`null` no es `0`)',
  grid.includes('<td class="rb-col--num">—</td>'), grid);

assert('la fila de TOTAL totaliza TODAS las columnas de importe, no sólo las de cierre',
  grid.includes('3.000,50')     // bruto
  && grid.includes('500,00')    // sac2, con una sola fila con valor
  && grid.includes('3.500,50')  // total
  && grid.includes('385,06'),   // jubilación
  grid.slice(grid.indexOf('<tfoot>')));

assert('el TOTAL dice en qué unidad cuenta — de ahí sale "TOTAL de la selección" al filtrar',
  grid.includes('<strong>TOTAL</strong> — 2 legajos'));

assert('y la pone en singular cuando queda una sola',
  rubroGridHtml({ columns: columnas, rows: [filas[0]], unitLabel: 'legajos' })
    .includes('— 1 legajo<'));

assert('la unidad la declara el control: no siempre es el legajo',
  rubroGridHtml({ columns: columnas, rows: [filas[0]], unitLabel: 'centros de costo' })
    .includes('— 1 centro de costo<'));

assert('el rótulo del TOTAL ocupa las columnas congeladas, así no pisa el primer importe',
  grid.includes('<td colspan="2">'));

assert('una columna que no se puede totalizar sale vacía, no en cero',
  rubroGridHtml({
    columns: [{ key: 'legajo', label: 'Legajo', band: 'Identificación' },
              { key: 'nombre', label: 'Nombre', band: 'Identificación' },
              { key: 'cc', label: 'Centro de costo', band: 'Contexto' }],
    rows: [{ legajo: '10', nombre: 'ERVITI WALTER', cc: 'ADM' }],
  }).includes('<td class="rb-band--next"></td>'));

assert('el control puede pintar su propia celda (un badge de diferencia, un pill)',
  rubroGridHtml({
    columns: [{ key: 'legajo', label: 'Legajo', band: 'Identificación' },
              { key: 'nombre', label: 'Nombre', band: 'Identificación' },
              { key: 'd', label: 'Δ', band: 'Control', num: true, cell: () => '<span class="rb-diffbadge">x</span>' }],
    rows: [{ legajo: '10', nombre: 'FALCIONI JULIO CESAR', d: 5 }],
  }).includes('<span class="rb-diffbadge">x</span>'));

assert('los nombres del Excel del cliente se escapan también acá',
  rubroGridHtml({
    columns: [{ key: 'legajo', label: 'Legajo', band: 'Identificación' },
              { key: 'nombre', label: 'Nombre', band: 'Identificación' }],
    rows: [{ legajo: '10', nombre: '<b>LUCCHETTI CRISTIAN</b>' }],
  }).includes('&lt;b&gt;LUCCHETTI CRISTIAN&lt;/b&gt;'));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
