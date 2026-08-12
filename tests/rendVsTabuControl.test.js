// rendVsTabuControl.test.js — Control 5: Rendimiento vs Tabulado
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/rendVsTabuControl.test.js
//
// Cubre el bug de severidad alta de la Fase 0 de la auditoría de escalabilidad
// (specs/auditoria-escalabilidad-2026-08.md #1): un centro de costo del
// Rendimiento que no aparece en el Tabulado producía `NaN` en vez de `null`, y
// como `Math.abs(NaN) > 0.01` es `false`, el control se pintaba en VERDE
// diciendo que todo cerraba. La tabla de Detalle disimulaba el bug (filtra con
// `Number.isFinite`) mientras el hero publicaba "Diferencia total de NaN".
//
// Cubre además el matching por nombre de CC sin acentos, que en este control
// es el camino principal cuando el cliente no mapea el código de CC — y que
// estaba sólo en su gemelo rendVsAsiento.js.
//
// rendVsTabu.js importa (transitivamente) módulos de UI que registran un
// listener a nivel de módulo — necesitan un `document` mínimo para importarse
// fuera del navegador. No se ejercita nada de esos módulos acá.
globalThis.document = { addEventListener: () => {} };

const { runRendVsTabu, summarizeRendVsTabu } = await import('./js/controls/rendVsTabu.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// Mapping mínimo: sólo PRECIO tiene conceptos, para que las cuentas se sigan
// a mano. '1003' es una columna real del Tabulado en el config por defecto.
const MAPPING = {
  rend: {
    ccCodeColumn:  'CC',
    ccNameColumn:  'Nombre CC',
    precioColumn:  'Precio',
    estimuloColumn: 'Estimulo',
    cargasColumn:  'Cargas',
    provMesColumn: 'ProvMes',
    provCcssColumn: 'ProvCcss',
  },
  tab: { idCCColumn: 'ID_CC', ccColumn: 'N_CC' },
  conceptGrouping: {
    precio:   [{ code: '1003', sign: 1 }],
    estimulo: [],
    cargas:   [],
    provMes:  [],
    provCcss: [],
  },
};

const fila = (over = {}) => ({
  CC: '', 'Nombre CC': '', Precio: 0, Estimulo: 0, Cargas: 0, ProvMes: 0, ProvCcss: 0, ...over,
});

// ── 1) CC del Rendimiento que no existe en el Tabulado ───────────────────────
// El caso que producía NaN: `tab` es null y el optional chaining entrega
// `undefined`, que no es `null` y pasaba el guard viejo (`!==  null`).
{
  const rend = [
    fila({ CC: '0011', 'Nombre CC': 'Administracion', Precio: 1000 }),
    fila({ CC: '0099', 'Nombre CC': 'CC Fantasma',    Precio:  500 }),
  ];
  const tab = [
    { ID_CC: '11', N_CC: 'Administracion', '1003-SUELDO': 1000 },
  ];

  const res = runRendVsTabu(rend, tab, MAPPING);
  const fantasma = res.rows.find(r => r.ccCode === '0099');

  assert('el CC sin datos en el Tabulado se marca sinTabData', fantasma.sinTabData === true);

  const dKeys = ['dPrecio', 'dEstimulo', 'dCargas', 'dProvMes', 'dProvCcss', 'dTotal'];
  assert('NO reproduce el bug viejo: ninguna diferencia sale NaN',
    dKeys.every(k => !Number.isNaN(fantasma[k])));
  assert('un CC sin contraparte da diferencia null (no hay dato, no es un cero verificado)',
    dKeys.every(k => fantasma[k] === null));

  // El síntoma publicado: el total del hero se calcula con `?? 0`, que no cubre
  // NaN. Con `null` sí lo cubre, así que el número que se imprime es real.
  const totalDTotal = res.rows.reduce((s, r) => s + (r.dTotal ?? 0), 0);
  assert('el total de diferencias del hero es un número finito',
    Number.isFinite(totalDTotal) && totalDTotal === 0);

  // Y el semáforo: con NaN, `unitsWithDiff` daba 0 y el tile salía VERDE.
  const summary = summarizeRendVsTabu(res);
  assert('el resumen cuenta 2 centros de costo (unit: cc)',
    summary.unit === 'cc' && summary.unitsTotal === 2);
  assert('el resumen informa el CC sin datos en el Tabulado',
    summary.headline.includes('1 sin datos'));
  assert('diffTotalAmount es finito', Number.isFinite(summary.diffTotalAmount));
}

// ── 2) Una diferencia real se detecta y se cuenta ────────────────────────────
{
  const rend = [fila({ CC: '0011', 'Nombre CC': 'Administracion', Precio: 900 })];
  const tab  = [{ ID_CC: '11', N_CC: 'Administracion', '1003-SUELDO': 1000 }];

  const res = runRendVsTabu(rend, tab, MAPPING);
  assert('la diferencia se calcula Tab − Rend', res.rows[0].dPrecio === 100);
  assert('el summary la cuenta como diferencia de PRECIO', res.summary.difPrecio === 1);

  const summary = summarizeRendVsTabu(res);
  assert('el semáforo ve 1 de 1 CC con diferencia',
    summary.unitsWithDiff === 1 && summary.unitsTotal === 1);
}

// ── 3) Matching por nombre cuando el cliente no mapea el código de CC ────────
// El Tabulado escribe "Administración" con tilde y el Rendimiento no (o al
// revés). Su gemelo rendVsAsiento.js ya normalizaba acentos; este no.
{
  const rend = [fila({ CC: '', 'Nombre CC': 'Administracion', Precio: 1000 })];
  const tab  = [{ ID_CC: '', N_CC: 'Administración', '1003-SUELDO': 1000 }];

  const res = runRendVsTabu(rend, tab, MAPPING);
  assert('"Administración" matchea contra "Administracion" (acentos normalizados)',
    res.rows[0].sinTabData === false && res.rows[0].dPrecio === 0);
}

// ── 4) Consolidación: dos filas del Tabulado del mismo CC se SUMAN ───────────
// El Tabulado trae una fila por liquidación. Acá la unidad es el CC y no el
// legajo, pero la regla es la misma: sumar, no pisar (ver CLAUDE.md).
{
  const rend = [fila({ CC: '0011', 'Nombre CC': 'Administracion', Precio: 1500 })];
  const tab  = [
    { ID_CC: '11', N_CC: 'Administracion', '1003-SUELDO': 1000 },
    { ID_CC: '11', N_CC: 'Administracion', '1003-SUELDO':  500 },
  ];

  const res = runRendVsTabu(rend, tab, MAPPING);
  assert('las dos liquidaciones del mismo CC se suman (1000 + 500), no se pisan',
    res.rows[0].tPrecio === 1500 && res.rows[0].dPrecio === 0);
}

// ── 5) La fila "TOTAL GENERAL" del Rendimiento no entra al cruce ─────────────
{
  const rend = [
    fila({ CC: '0011', 'Nombre CC': 'Administracion', Precio: 1000 }),
    fila({ CC: '',     'Nombre CC': 'TOTAL GENERAL',  Precio: 1000 }),
  ];
  const tab = [{ ID_CC: '11', N_CC: 'Administracion', '1003-SUELDO': 1000 }];

  const res = runRendVsTabu(rend, tab, MAPPING);
  assert('la fila de totales no se cuenta como un centro de costo más',
    res.rows.length === 1 && res.summary.total === 1);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
