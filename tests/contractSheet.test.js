// contractSheet.test.js — writeContractSheet / contractColDefs (Paso 4a de
// specs/contrato-export.md). Correr desde la raíz del proyecto:
//   node --input-type=module < tests/contractSheet.test.js
//
// No usa ExcelJS real (se carga por CDN en el navegador, no es una dependencia
// de npm) — un fake mínimo alcanza porque lo que hay que probar es QUÉ celdas
// escribe `writeContractSheet`, no el motor de Excel. El fake implementa sólo
// lo que `writeContractSheet` llama: `addWorksheet`, `addRow`/`getCell`,
// `columns=`, `views=`.

globalThis.document = { addEventListener: () => {} };

const { writeContractSheet, writeGroupedContractSheet, contractColDefs } = await import('./js/exports/contractSheet.js');
const { EXPORT_CONTRACTS } = await import('./js/exports/contracts.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── Fake mínimo de ExcelJS ───────────────────────────────────────────────────

class FakeCell {
  constructor() { this.value = null; this.font = null; this.alignment = null; this.numFmt = null; this.fill = null; this.border = null; }
}
class FakeRow {
  constructor(values) {
    this.cells = values.map(v => { const c = new FakeCell(); c.value = v; return c; });
    this.height = null;
  }
  getCell(i) { return this.cells[i - 1]; }
  eachCell(fn) { this.cells.forEach(fn); }
}
class FakeWorksheet {
  constructor(name) { this.name = name; this.rows = []; this._columns = null; this.views = null; this.merges = []; }
  set columns(defs) { this._columns = defs; }
  get columns() { return this._columns; }
  addRow(values) { const r = new FakeRow(values); this.rows.push(r); return r; }
  mergeCells(r1, c1, r2, c2) { this.merges.push([r1, c1, r2, c2]); }
}
class FakeWorkbook {
  constructor() { this.worksheets = []; }
  addWorksheet(name) { const ws = new FakeWorksheet(name); this.worksheets.push(ws); return ws; }
}

// ── writeContractSheet ───────────────────────────────────────────────────────

const contract = EXPORT_CONTRACTS.gs_pers_reporte;
const rows = [
  { fecIni: '1/4/2026', fecFin: '30/4/2026', legajo: '1', nombre: 'Perez', apellido1: null,
    fecPago: null, fecAlta: null, idCC: null, gtos: 1000, dto: null, nCC: null },
  { fecIni: '1/4/2026', fecFin: '30/4/2026', legajo: '2', nombre: null, apellido1: null,
    fecPago: null, fecAlta: null, idCC: null, gtos: 0, dto: 200.5, nCC: null },
];

const wb = new FakeWorkbook();
const ws = writeContractSheet(wb, contract, rows);

assert('crea la hoja con el nombre del contrato', ws.name === 'Reporte GS Pers');
assert('devuelve la misma worksheet que quedó en el workbook', wb.worksheets[0] === ws);

assert('ws.columns tiene tantas entradas como columnas del contrato',
  ws.columns.length === contract.columns.length);
assert('los anchos son los declarados en el contrato (no un default silencioso)',
  ws.columns.every((c, i) => c.width === contract.columns[i].width));

assert('la primera fila es el encabezado, con las 11 etiquetas en orden',
  ws.rows[0].cells.map(c => c.value).join('|') === contract.columns.map(c => c.label).join('|'));
assert('el encabezado sale en negrita', ws.rows[0].cells[0].font.bold === true);
assert('el encabezado tiene el fondo gris estándar',
  ws.rows[0].cells[0].fill.fgColor.argb === 'FFE8E8E8');

assert('hay una fila de datos por cada row (2 filas + 1 header = 3)',
  ws.rows.length === rows.length + 1);

// layout:'fijo' — la celda de una columna sin dato queda vacía (null), la
// columna NUNCA se saca. `apellido1` no viene mapeado en ningún row de arriba.
const apellido1Idx = contract.columns.findIndex(c => c.key === 'apellido1');
assert('la columna "sin dato en ningún row" SIGUE estando (layout fijo, D-041)',
  apellido1Idx !== -1 && ws.rows[0].cells[apellido1Idx].value === 'APELLIDO_1');
assert('...y la celda de esa columna en cada fila de datos es null, no se saca la columna',
  ws.rows[1].cells[apellido1Idx].value === null && ws.rows[2].cells[apellido1Idx].value === null);

// Los valores de cada fila salen en el mismo orden que `contract.columns`, leídos por `key`.
const legajoIdx = contract.columns.findIndex(c => c.key === 'legajo');
const gtosIdx    = contract.columns.findIndex(c => c.key === 'gtos');
const dtoIdx     = contract.columns.findIndex(c => c.key === 'dto');
assert('fila 1: legajo en su columna', ws.rows[1].cells[legajoIdx].value === '1');
assert('fila 1: gtos=1000 en su columna', ws.rows[1].cells[gtosIdx].value === 1000);
assert('fila 1: dto=null (no viene) en su columna', ws.rows[1].cells[dtoIdx].value === null);
assert('fila 2: gtos=0 (verificado cero, no null) se escribe tal cual — no es lo mismo que "sin dato"',
  ws.rows[2].cells[gtosIdx].value === 0);
assert('fila 2: dto=200.5 en su columna', ws.rows[2].cells[dtoIdx].value === 200.5);

// Formato num vs txt — alineación y numFmt correctos por tipo.
assert('columna num: numFmt de moneda', ws.rows[1].cells[gtosIdx].numFmt === '#,##0.00');
assert('columna num: alineada a la derecha', ws.rows[1].cells[gtosIdx].alignment.horizontal === 'right');
assert('columna txt: sin numFmt', ws.rows[1].cells[legajoIdx].numFmt === null);
assert('columna txt: sin alineación horizontal forzada', ws.rows[1].cells[legajoIdx].alignment.horizontal === undefined);

assert('congela la fila de encabezado (frozen ySplit:1)',
  ws.views[0].ySplit === 1 && ws.views[0].xSplit === 0);

// Un contrato sin `width` en alguna columna cae al default en vez de romper
// (writeContractSheet no depende de que 4a/4b ya migraron TODOS los contratos).
const wsSinWidth = writeContractSheet(new FakeWorkbook(), {
  sheet: 'X', columns: [{ label: 'A', key: 'a', type: 'txt' }],
}, [{ a: 'x' }]);
assert('columna sin width declarado usa el default (no queda undefined)',
  typeof wsSinWidth.columns[0].width === 'number');

// ── contractColDefs ──────────────────────────────────────────────────────────

const colDefs = contractColDefs(contract);
assert('contractColDefs tiene tantas entradas como columnas del contrato',
  colDefs.length === contract.columns.length);
assert('cada entrada tiene exactamente label/key/type (lo que usan pantalla y CSV)',
  colDefs.every(c => Object.keys(c).sort().join(',') === 'key,label,type'));
assert('el orden es el mismo que en el contrato (pantalla, CSV y xlsx no pueden divergir)',
  colDefs.map(c => c.key).join('|') === contract.columns.map(c => c.key).join('|'));

// ── writeGroupedContractSheet (Paso 4b) ─────────────────────────────────────
// Un contrato sintético con las 3 formas reales que hay que cubrir: una
// columna sin grupo (Legajo), un grupo con label que se mergea en 2 filas
// (Importe) y una columna de diferencia (CTRL) que se resalta en rojo si
// |valor| > 0.01.

const syntheticContract = {
  sheet: 'Test', headerRows: 2, layout: 'fijo', audience: 'payroll',
  groups: {
    imp: { label: 'Importe', headerColor: 'FFAAAAAA', dataColor: 'FFCCCCCC' },
  },
  columns: [
    { label: 'Legajo', key: 'legajo', width: 10, from: [], necessity: 'clave', type: 'txt' },
    { label: 'VALOR',  key: 'valor',  width: 10, from: [], necessity: 'obligatoria', type: 'num', group: 'imp' },
    { label: 'CTRL',   key: 'ctrl',   width: 10, from: [], necessity: 'obligatoria', type: 'num', group: 'imp', diffHighlight: true },
  ],
};

const wbG = new FakeWorkbook();
const wsG = writeGroupedContractSheet(wbG, syntheticContract, [
  { legajo: '1', valor: 100, ctrl: 0 },      // sin diferencia
  { legajo: '2', valor: 100, ctrl: 50.5 },   // con diferencia → rojo/negrita
]);

assert('headerRows:2 escribe 2 filas de encabezado + 1 por row (2+2=4)',
  wsG.rows.length === 4);
assert('fila 1: la columna sin grupo lleva su propio label (se va a mergear vertical)',
  wsG.rows[0].cells[0].value === 'Legajo');
assert('fila 1: el grupo "Importe" sólo escribe el label en la 1ª columna del tramo',
  wsG.rows[0].cells[1].value === 'Importe' && wsG.rows[0].cells[2].value === null);
assert('fila 2: la columna sin grupo queda vacía (va mergeada con la fila 1)',
  wsG.rows[1].cells[0].value === null);
assert('fila 2: el grupo escribe el label de CADA columna individual',
  wsG.rows[1].cells[1].value === 'VALOR' && wsG.rows[1].cells[2].value === 'CTRL');

assert('mergea "Legajo" verticalmente (fila1:fila2, 1 columna)',
  wsG.merges.some(([r1, c1, r2, c2]) => r1 === 1 && c1 === 1 && r2 === 2 && c2 === 1));
assert('mergea "Importe" horizontalmente en la fila 1 (columnas 2 y 3)',
  wsG.merges.some(([r1, c1, r2, c2]) => r1 === 1 && c1 === 2 && r2 === 1 && c2 === 3));

assert('el encabezado agrupado usa el color del grupo',
  wsG.rows[0].cells[1].fill.fgColor.argb === 'FFAAAAAA');
assert('la fila 2 de VALOR (no es diff) no sale en negrita',
  wsG.rows[1].cells[1].font.bold !== true);
assert('la fila 2 de CTRL (es diff) SÍ sale en negrita — se resalta el nombre, no sólo el dato',
  wsG.rows[1].cells[2].font.bold === true);

assert('dato sin diferencia (ctrl=0): fuente base, no roja',
  wsG.rows[2].cells[2].font.color === undefined);
assert('dato con diferencia (ctrl=50.5): negrita y roja',
  wsG.rows[3].cells[2].font.bold === true && wsG.rows[3].cells[2].font.color.argb === 'FFCC0000');
assert('el fondo de dato del grupo se aplica a las DOS columnas del grupo (valor y ctrl)',
  wsG.rows[2].cells[1].fill.fgColor.argb === 'FFCCCCCC' && wsG.rows[2].cells[2].fill.fgColor.argb === 'FFCCCCCC');
assert('la columna sin grupo no lleva fondo de dato',
  wsG.rows[2].cells[0].fill === null);

// ── headerRows:1 (NR): sin merges, color por columna, siempre en negrita ────

const syntheticFlatContract = {
  sheet: 'Test flat', headerRows: 1, layout: 'fijo', audience: 'payroll',
  groups: { a: { headerColor: 'FF111111', dataColor: 'FF222222' } },
  columns: [
    { label: 'ID', key: 'id', width: 8, from: [], necessity: 'clave', type: 'txt' },
    { label: 'CONCEPTO', key: 'c', width: 8, from: [], necessity: 'obligatoria', type: 'num', group: 'a', diffHighlight: true },
  ],
};
const wsFlat = writeGroupedContractSheet(new FakeWorkbook(), syntheticFlatContract, [{ id: 'x', c: 5 }]);
assert('headerRows:1 no genera ningún merge', wsFlat.merges.length === 0);
assert('headerRows:1 escribe una sola fila de encabezado + 1 por row (1+1=2)',
  wsFlat.rows.length === 2);
assert('el encabezado de headerRows:1 SIEMPRE es bold, tenga o no diffHighlight',
  wsFlat.rows[0].cells[0].font.bold === true && wsFlat.rows[0].cells[1].font.bold === true);
assert('una columna sin grupo declarado cae al color por default',
  wsFlat.rows[0].cells[0].fill.fgColor.argb !== undefined);

// ── columna `spacer`: sin estilo, ni en el encabezado ni en el dato ──────────

const spacerContract = {
  sheet: 'Test spacer', headerRows: 1, layout: 'fijo', audience: 'payroll',
  columns: [
    { label: '', key: '__blank__', width: 4, from: [], necessity: 'opcional', type: 'txt', spacer: true },
    { label: 'X', key: 'x', width: 8, from: [], necessity: 'clave', type: 'txt' },
  ],
};
const wsSpacer = writeGroupedContractSheet(new FakeWorkbook(), spacerContract, [{ x: 'y' }]);
assert('la columna spacer no lleva ningún estilo en el encabezado', wsSpacer.rows[0].cells[0].fill === null);
assert('la columna spacer no lleva ningún estilo en el dato', wsSpacer.rows[1].cells[0].fill === null);
assert('...pero la columna X sí (no se saltea todo por tener un spacer al lado)',
  wsSpacer.rows[0].cells[1].fill !== null);

// ── Los 3 contratos reales migrados (Paso 4b) se pueden escribir sin explotar ─

for (const exportId of ['brutos', 'gs_pers', 'nr', 'nr_reporte']) {
  const c = EXPORT_CONTRACTS[exportId];
  const emptyRow = Object.fromEntries(c.columns.map(col => [col.key, col.type === 'num' ? 0 : '']));
  let threw = false;
  let ws;
  try {
    ws = writeGroupedContractSheet(new FakeWorkbook(), c, [emptyRow]);
  } catch {
    threw = true;
  }
  assert(`${exportId}: writeGroupedContractSheet no explota con una fila vacía`, !threw);
  assert(`${exportId}: escribe ${c.headerRows === 2 ? 2 : 1} fila(s) de encabezado + 1 de dato`,
    ws && ws.rows.length === (c.headerRows === 2 ? 2 : 1) + 1);
}

// Merges EXACTOS de los contratos reales — no sólo el mecanismo genérico de
// arriba. Reproducen los `ws.mergeCells('A1:A2')` etc. que estaban a mano en
// cada `export*ToXlsx` antes del Paso 4b; si un contrato desalinea un `group`
// (ej. una columna que se cuela entre dos del mismo grupo), esto lo agarra.

const hasMerge = (ws, r1, c1, r2, c2) => ws.merges.some(m => m.join(',') === [r1, c1, r2, c2].join(','));

const wsBrutos = writeGroupedContractSheet(new FakeWorkbook(), EXPORT_CONTRACTS.brutos, []);
assert('Brutos: A1:A2 (Legajo)',                hasMerge(wsBrutos, 1, 1, 2, 1));
assert('Brutos: B1:B2 (Apellido y Nombre)',     hasMerge(wsBrutos, 1, 2, 2, 2));
assert('Brutos: C1:D1 (Salario Base)',          hasMerge(wsBrutos, 1, 3, 1, 4));
assert('Brutos: E1:F1 (A Cta Fut Aumen)',       hasMerge(wsBrutos, 1, 5, 1, 6));
assert('Brutos: G1:I1 (Valores Tabulado)',      hasMerge(wsBrutos, 1, 7, 1, 9));
assert('Brutos: exactamente 5 merges (ni uno de más ni de menos)', wsBrutos.merges.length === 5);

const wsGsPers = writeGroupedContractSheet(new FakeWorkbook(), EXPORT_CONTRACTS.gs_pers, []);
assert('GS Pers: A1:A2 (Legajo)',               hasMerge(wsGsPers, 1, 1, 2, 1));
assert('GS Pers: B1:C1 (GTOS_PERSONALES)',      hasMerge(wsGsPers, 1, 2, 1, 3));
assert('GS Pers: D1:E1 (DTO_COCHERA)',          hasMerge(wsGsPers, 1, 4, 1, 5));
assert('GS Pers: F1:H1 (Valores Tabulado)',     hasMerge(wsGsPers, 1, 6, 1, 8));
assert('GS Pers: exactamente 4 merges',         wsGsPers.merges.length === 4);

const wsNr = writeGroupedContractSheet(new FakeWorkbook(), EXPORT_CONTRACTS.nr, []);
assert('NR Controlar: headerRows:1, cero merges (color por columna, sin agrupar filas)',
  wsNr.merges.length === 0);
assert('NR Controlar: Legajo y # Difs (sin grupo) comparten el mismo color default',
  wsNr.rows[0].cells[0].fill.fgColor.argb === wsNr.rows[0].cells[1].fill.fgColor.argb);
{
  const firstIndem = EXPORT_CONTRACTS.nr.columns.findIndex(c => c.group === 'indem');
  const firstOtros = EXPORT_CONTRACTS.nr.columns.findIndex(c => c.group === 'otros');
  assert('NR Controlar: un concepto "indem" y uno "otros" tienen colores de header distintos',
    wsNr.rows[0].cells[firstIndem].fill.fgColor.argb !== wsNr.rows[0].cells[firstOtros].fill.fgColor.argb);
}

const wsNrReporte = writeGroupedContractSheet(new FakeWorkbook(), EXPORT_CONTRACTS.nr_reporte, []);
assert('NR Reporte: headerRows:1, cero merges', wsNrReporte.merges.length === 0);
assert('NR Reporte: la columna spacer (A) sigue sin ningún estilo con el contrato real',
  wsNrReporte.rows[0].cells[0].fill === null && wsNrReporte.rows[0].cells[0].font === null);

// `NECESSITY.CLAVE` se usa como string literal arriba ('clave'/'obligatoria'/'opcional')
// a propósito: probar que `writeGroupedContractSheet` no lee `necessity` en absoluto
// (es de `blocksProgress`, no del layout del xlsx) — si esto rompiera, sería una
// señal de que el writer empezó a mezclar las dos responsabilidades.

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
