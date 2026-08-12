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

const { writeContractSheet, contractColDefs } = await import('./js/exports/contractSheet.js');
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
  constructor(name) { this.name = name; this.rows = []; this._columns = null; this.views = null; }
  set columns(defs) { this._columns = defs; }
  get columns() { return this._columns; }
  addRow(values) { const r = new FakeRow(values); this.rows.push(r); return r; }
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

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
