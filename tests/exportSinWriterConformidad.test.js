// exportSinWriterConformidad.test.js — Los exports que arman su .xlsx A MANO
// emiten exactamente las columnas de su contrato (D-049).
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/exportSinWriterConformidad.test.js
//
// **Por qué existe.** `EXPORT_CONTRACTS` es la fuente única de qué columnas
// lleva cada archivo generado, y `writeContractSheet` la hace cumplir por
// construcción: itera `contract.columns`, así que no hay forma de emitir una
// columna que el contrato no declara. Los exports de `SIN_WRITER_POR_DISENO` no
// pasan por ahí — la forma de su hoja no es la que el writer describe — y sin
// este test su contrato sería una declaración sin nadie que la haga cumplir.
//
// Lo que se rompía en silencio hasta acá, y es el motivo real del test: el
// assert de D-020 (`FINANZAS_ALLOWED_KEYS` en `tests/exportContracts.test.js`)
// prueba que la LISTA de columnas del contrato no tenga información de HR. Sobre
// un export escrito a mano eso no prueba nada sobre el ARCHIVO: alguien podía
// agregar una columna de fecha de alta o de dotación directo en el módulo, el
// dato salía a Finanzas del cliente y los 1291 asserts seguían en verde.
//
// No usa ExcelJS real (se carga por CDN, no es dependencia de npm) — igual que
// `tests/contractSheet.test.js`, un fake mínimo alcanza porque lo que se prueba
// es QUÉ celdas se escriben, no el motor de Excel.
//
// **Cómo se validó que sirve** (un test que siempre dice "todo bien" no prueba
// nada), con las dos regresiones que dice atajar:
//   1. una 8ª columna agregada a mano al `addRow` de las filas de detalle de
//      `acreditaciones.js` (el caso D-020: un dato de HR que se cuela sin pasar
//      por el contrato) → falla con "2 fila(s) escriben hasta 8 valores";
//   2. el encabezado vuelto a cablear a mano con una etiqueta cambiada
//      ('Neto Depositado') → falla con el diff completo emitidas vs. contrato.

globalThis.document = { addEventListener: () => {} };

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── Fake mínimo de ExcelJS ───────────────────────────────────────────────────
// Además de lo que implementa el fake de `contractSheet.test.js`, un writer a
// mano usa cosas que el writer no: `row.number` (las fórmulas de cierre lo
// necesitan para armar los rangos), `autoFilter`, y `getCell()` más allá de los
// valores pasados a `addRow` (ExcelJS crea la celda al pedirla).

class FakeCell {
  constructor(value = null) {
    this.value = value;
    this.font = null; this.alignment = null; this.numFmt = null;
    this.fill = null; this.border = null;
  }
}
class FakeRow {
  constructor(values, number) {
    // `written` es la longitud del array que pasó por `addRow` — NO crece con
    // `getCell()`. Es lo que distingue "escribió una columna más" de "pidió una
    // celda para estilarla", y sin esa distinción el assert de ancho no sirve.
    this.written = values.length;
    this.cells = values.map(v => new FakeCell(v));
    this.number = number;
    this.height = null;
  }
  getCell(i) {
    while (this.cells.length < i) this.cells.push(new FakeCell());
    return this.cells[i - 1];
  }
  eachCell(fn) { this.cells.forEach(fn); }
  get values() { return this.cells.slice(0, this.written).map(c => c.value); }
}
class FakeWorksheet {
  constructor(name) {
    this.name = name; this.rows = [];
    this._columns = null; this.views = null; this.autoFilter = null; this.merges = [];
  }
  set columns(defs) { this._columns = defs; }
  get columns() { return this._columns; }
  addRow(values) { const r = new FakeRow(values, this.rows.length + 1); this.rows.push(r); return r; }
  mergeCells(...a) { this.merges.push(a); }
}
class FakeWorkbook {
  constructor() { this.worksheets = []; this.calcProperties = {}; this.creator = null; this.created = null; }
  addWorksheet(name) { const ws = new FakeWorksheet(name); this.worksheets.push(ws); return ws; }
}
globalThis.window = { ExcelJS: { Workbook: FakeWorkbook } };

const { EXPORT_CONTRACTS, SIN_WRITER_POR_DISENO } = await import('./js/exports/contracts.js');
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { buildAcreditacionesWorkbook } = await import('./js/controls/acreditaciones.js');

// ── Datos de prueba (inventados, sin datos de empleados reales) ──────────────
// Mismo fixture que `tests/acreditacionesControl.test.js`: 4 listas más un grupo
// SIN ASIGNAR, que es el caso que agrega una hoja extra al workbook.

const CBU1 = '0720369388000032749018';
const CBU2 = '0720514988000001436736';
const CBU3 = '0170005340000038839937';

const ANTICIPO = 'Anticipo de sueldo (De carga) Julio 2026 (Anticipos 07-2026) (C)';
const QUINC1   = '1er Quincena c/sobregiro Julio 2026 (1era Quincena 07-2026) (C)';

const row = (o) => ({
  legajo: '1', apellido_nombre: 'PEREZ JUAN', cuit: '20-11111111-1',
  cliente: 'CLIENTE DEMO SA', uo_cliente: 'Mensualizados',
  liquidacion: ANTICIPO, neto: null, listado: '', descripcion: '',
  fecha_acreditacion: null, banco: 'BANCO DEMO', cbu: CBU1, empresa: 'CLIENTE DEMO SA',
  ...o,
});

const acredRows = [
  row({ legajo: '1', apellido_nombre: 'PEREZ JUAN',  cbu: CBU1, neto: 1000, listado: '900', fecha_acreditacion: '2026-07-02' }),
  row({ legajo: '2', apellido_nombre: 'GOMEZ ANA',   cbu: CBU2, neto: 2000, listado: '901', fecha_acreditacion: '2026-07-02' }),
  row({ legajo: '1', apellido_nombre: 'PEREZ JUAN',  cbu: CBU1, neto: 3000, listado: '910', fecha_acreditacion: '2026-07-16', liquidacion: QUINC1 }),
  // Sin listado ni fecha, con otra fecha de anticipos en el mes → SIN ASIGNAR
  row({ legajo: '3', apellido_nombre: 'LOPEZ LUCAS', cbu: CBU3, neto: 700,  listado: '',    fecha_acreditacion: null }),
  row({ legajo: '2', apellido_nombre: 'GOMEZ ANA',   cbu: CBU2, neto: 1500, listado: '902', fecha_acreditacion: '2026-07-21' }),
];

const acredResults = CONTROL_REGISTRY.acreditaciones_reporte.run(acredRows, [], { period: '2026-07' });

// ── Los casos ────────────────────────────────────────────────────────────────
//
// Uno por export de `SIN_WRITER_POR_DISENO`. Declarar un caso es lo que el
// contrato pide a cambio de la excepción: sin esto, "va a mano" significaría
// "nadie verifica lo que sale".
//
//   hojasDelContrato  — las hojas cuyo encabezado tiene que ser `contract.columns`
//   hojasSinContrato  — las que el contrato no modela, NOMBRADAS a propósito: si
//                       aparece una hoja nueva que no está en ninguno de los dos
//                       lados, el test la reporta en vez de ignorarla
//   filaEncabezado    — 1-based. Si es > 1 es porque hay algo antes (el título de
//                       Acreditaciones), y eso mismo es el motivo de la excepción

const CASOS = [
  {
    exportId: 'acreditaciones_reporte',
    label: 'Acreditaciones (Axton)',
    build: () => buildAcreditacionesWorkbook(acredResults),
    hojasSinContrato: ['CONTROL'],
    hojasDelContrato: wb => wb.worksheets.filter(ws => ws.name !== 'CONTROL'),
    filaEncabezado: 2,
  },
];

// Todo export declarado como excepción tiene su caso acá. Es el assert que
// impide sumar una excepción y no verificarla.
for (const exportId of Object.keys(SIN_WRITER_POR_DISENO)) {
  assert(`${exportId}: la excepción tiene su caso de conformidad`,
    CASOS.some(c => c.exportId === exportId));
}
assert('hay al menos un caso (si no, todo lo de abajo pasa por vacuidad)', CASOS.length > 0);

// ── El barrido ───────────────────────────────────────────────────────────────

for (const caso of CASOS) {
  const contract = EXPORT_CONTRACTS[caso.exportId];
  const labels = contract.columns.map(c => c.label);
  const n = contract.columns.length;

  assert(`${caso.label}: el exportId existe en EXPORT_CONTRACTS`, contract !== undefined);

  const wb = caso.build();
  const hojas = caso.hojasDelContrato(wb);

  assert(`${caso.label}: el workbook trae hojas del contrato (si no, no se prueba nada)`,
    hojas.length > 0);

  // Ninguna hoja queda fuera de la clasificación: una hoja nueva a mano tiene
  // que declararse como del contrato o como no modelada, nunca colarse.
  const clasificadas = new Set([...hojas.map(ws => ws.name), ...caso.hojasSinContrato]);
  const sinClasificar = wb.worksheets.filter(ws => !clasificadas.has(ws.name)).map(ws => ws.name);
  assert(`${caso.label}: toda hoja del workbook está clasificada${sinClasificar.length ? ` (sobra: ${sinClasificar.join(', ')})` : ''}`,
    sinClasificar.length === 0);

  for (const ws of hojas) {
    const hdr = ws.rows[caso.filaEncabezado - 1];

    assert(`${caso.label} · "${ws.name}": tiene fila de encabezado en la fila ${caso.filaEncabezado}`,
      hdr !== undefined);
    if (!hdr) continue;

    const emitidas = hdr.values;
    assert(`${caso.label} · "${ws.name}": el encabezado es exactamente las ${n} columnas del contrato, en orden`
      + (emitidas.join('|') === labels.join('|') ? '' : ` — emite [${emitidas.join(', ')}], el contrato declara [${labels.join(', ')}]`),
      emitidas.length === n && emitidas.join('|') === labels.join('|'));

    // El assert que ataja lo que a D-020 se le escapa: una columna agregada a
    // mano en las filas de datos, sin tocar el contrato ni el encabezado.
    const anchas = ws.rows.filter(r => r.written > n);
    assert(`${caso.label} · "${ws.name}": ninguna fila escribe más allá de la columna ${n}`
      + (anchas.length ? ` — ${anchas.length} fila(s) escriben hasta ${Math.max(...anchas.map(r => r.written))} valores` : ''),
      anchas.length === 0);

    // Si la fila del encabezado no es la 1, lo que hay antes es lo que dejó a
    // este export afuera del writer. Que siga estando es parte de la excepción:
    // el día que desaparezca, el motivo caducó y corresponde migrar.
    if (caso.filaEncabezado > 1) {
      const antes = ws.rows.slice(0, caso.filaEncabezado - 1);
      assert(`${caso.label} · "${ws.name}": sigue habiendo ${caso.filaEncabezado - 1} fila(s) antes del encabezado (el motivo de la excepción)`,
        antes.length === caso.filaEncabezado - 1
        && antes.some(r => r.values.some(v => v !== null && v !== undefined)));
    }
  }
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
