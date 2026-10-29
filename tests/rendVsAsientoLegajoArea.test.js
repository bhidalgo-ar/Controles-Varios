// rendVsAsientoLegajoArea.test.js — Rendimiento vs Asiento: legajos que el
// Rendimiento pone en otra área (D-103).
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/rendVsAsientoLegajoArea.test.js
//
// Un legajo que el asiento imputa en un área y el Rendimiento cuenta en otra
// salta cada mes como diferencia, aunque no sea un error. La regla lleva sus
// filas de la Contabilidad al área del Rendimiento ANTES de comparar, así su
// importe se sigue controlando. Lo que este test fija:
//   - las filas movidas cierran en el área destino y salen del área de origen;
//   - dentro de un centro que se reparte por persona (Directores) manda el
//     listado de CC x Empleado, no la regla;
//   - la regla que este mes no hizo falta se avisa, con su motivo;
//   - una config guardada antes de este cambio toma la semilla vacía;
//   - el legajo se compara con la clave del cliente ('09001' = '9001').
//
// Datos inventados: legajos 9001/9002 (evidentemente ficticios) y nombres de
// la lista de Banfield (CLAUDE.md).

globalThis.document = { addEventListener: () => {} };

const { runRendVsAsiento, summarizeRendVsAsiento, resolveRvaConfig, DEFAULT_RVA_CONFIG } =
  await import('./js/controls/rendVsAsiento.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}
const casi = (a, b) => a !== null && a !== undefined && Math.abs(a - b) < 0.005;

// ── Armado ───────────────────────────────────────────────────────────────────

const REND = {
  ccCodeColumn: 'CC', ccNameColumn: 'Nombre CC',
  precioColumn: 'Precio', cargasColumn: 'Cargas', provMesColumn: 'ProvMes', provCcssColumn: 'ProvCcss',
};
const rendFila = (cc, nombre, precio, cargas = 0, provMes = 0, provCcss = 0) =>
  ({ CC: cc, 'Nombre CC': nombre, Precio: precio, Cargas: cargas, ProvMes: provMes, ProvCcss: provCcss });

/** Una fila de CONTA con su cuenta (o concepto) y su importe al debe. */
const conta = (legajo, ccCode, ccNombre, cuenta, debe, { concepto = '1003', apellido = 'SANGUINETTI', nombre = 'JAVIER' } = {}) => ({
  id_empleado: legajo, id_centro_costo: ccCode, cc_nombre: ccNombre,
  cuenta_contab: cuenta, n_cuenta_contable: 'CUENTA', id_concepto: concepto, nombre_largo: 'CONCEPTO',
  debe, haber: 0, apellido_1: apellido, nombre,
});

const BASE = {
  cuentaCats: { precio: ['5208001'], estimulo: [], cargas: ['5208005'], provMes: ['5208007'] },
  provCcssConcepts: ['3572'],
  ccRedirects: [],
  ccCodeMap: [{ code: '10', to: 'Servicios Comunes' }, { code: '11', to: 'Servicios Legales' }],
  ccPorPersona: ['13'],
};

const correr = (rendRows, contaRows, extra = {}) =>
  runRendVsAsiento(rendRows, [], { rend: REND, contaRows, ccXEeRows: [], ...extra });
const fila = (res, nombre) => res.rows.find(r => r.ccName === nombre);

// El legajo 9001 está en el asiento en Servicios Comunes (10) y el Rendimiento
// lo cuenta en Servicios Legales. El 9002 está bien en Servicios Comunes.
const CONTA_CASO = [
  conta('9001', '10', 'Servicios Comunes', '5208001', 1000),
  conta('9001', '10', 'Servicios Comunes', '5208005',  300),
  conta('9001', '10', 'Servicios Comunes', '5208007',  100),
  conta('9001', '10', 'Servicios Comunes', '5208005',   40, { concepto: '3572' }),
  conta('9002', '10', 'Servicios Comunes', '5208001',  500, { apellido: 'ALBELLA', nombre: 'GUSTAVO' }),
  conta('9003', '11', 'Servicios Legales', '5208001', 2000, { apellido: 'FALCIONI', nombre: 'JULIO CESAR' }),
];
const REND_CASO = [
  rendFila('34', 'Servicios Legales', 3000, 300, 100, 40),
  rendFila('51', 'Servicios Comunes',  500,   0,   0,  0),
];

// ── 1) Sin la regla, la diferencia salta; con la regla, cierra ───────────────
{
  const sin = correr(REND_CASO, CONTA_CASO, { rvaConfig: BASE });
  assert('sin la regla: Servicios Legales con diferencia en Precio (−1000)', casi(fila(sin, 'Servicios Legales').dPrecio, -1000));
  assert('sin la regla: no hay legajos movidos ni avisos', sin.movidosPorLegajo.length === 0 && sin.legajosSinUso.length === 0);

  const cfg = { ...BASE, legajoAreas: [{ legajo: '9001', to: 'Servicios Legales', motivo: 'lo pidió el cliente' }] };
  const res = correr(REND_CASO, CONTA_CASO, { rvaConfig: cfg });
  const sl = fila(res, 'Servicios Legales');
  const sc = fila(res, 'Servicios Comunes');
  assert('con la regla: Servicios Legales cierra en Precio (3000)', casi(sl.cPrecio, 3000) && casi(sl.dPrecio, 0));
  assert('con la regla: Servicios Legales cierra en Cargas, Prov. mes y Prov. CCSS',
    casi(sl.dCargas, 0) && casi(sl.dProvMes, 0) && casi(sl.dProvCcss, 0) && casi(sl.dTotal, 0));
  assert('con la regla: Servicios Comunes se queda con lo suyo (500) y cierra', casi(sc.cPrecio, 500) && casi(sc.dTotal, 0));

  assert('un legajo movido en el resultado', res.movidosPorLegajo.length === 1 && res.summary.legajosMovidos === 1);
  const m = res.movidosPorLegajo[0];
  assert('el movido trae legajo, nombre de la CONTA, destino y motivo',
    m.legajo === '9001' && m.nombre === 'SANGUINETTI, JAVIER' && m.to === 'Servicios Legales' && m.motivo === 'lo pidió el cliente');
  assert('el movido trae el centro del asiento con nombre y código',
    m.centros.length === 1 && m.centros[0].codigo === '10' && m.centros[0].nombre === 'Servicios Comunes');
  assert('importes movidos por categoría (Precio 1000, Cargas 300, Prov. mes 100, Prov. CCSS 40)',
    casi(m.importes.precio, 1000) && casi(m.importes.cargas, 300) && casi(m.importes.provMes, 100)
    && casi(m.importes.provCcss, 40) && casi(m.importes.estimulo, 0));
  assert('total movido 1440', casi(m.total, 1440));

  const mov = res.meta.movimientosPorArea;
  assert('Planilla: Servicios Legales recibe 1 legajo por 1440',
    mov['servicios legales'].entran.length === 1 && casi(mov['servicios legales'].entran[0].total, 1440));
  assert('Planilla: Servicios Comunes pierde 1 legajo',
    mov['servicios comunes'].salen.length === 1 && mov['servicios comunes'].salen[0].legajo === '9001');

  const det = res.meta.detalle.filter(d => d.idEmpleado === '9001');
  assert('detalle: las filas movidas se comparan en Servicios Legales y conservan su centro original',
    det.length === 4 && det.every(d => d.ccRendimiento === 'Servicios Legales' && d.movidoPorLegajo
      && d.ccOriginal === 'Servicios Comunes' && d.ccCodigoOriginal === '10'));
  assert('detalle: las filas de otros legajos no llevan la marca',
    res.meta.detalle.filter(d => d.idEmpleado !== '9001').every(d => !d.movidoPorLegajo));

  const s = summarizeRendVsAsiento(res);
  assert('el aviso no cuenta como diferencia: el semáforo ve 0 centros con diferencia', s.unitsWithDiff === 0);
}

// ── 2) Gana sobre la tabla por código y sobre los redirects por nombre ──────
{
  const cfg = {
    ...BASE,
    ccRedirects: [{ from: 'Servicios Legales', to: 'Servicios Comunes' }],
    legajoAreas: [{ legajo: '9001', to: 'Servicios Legales', motivo: '' }],
  };
  // Sin código: la fila iría por nombre ("Marketing"); la regla la lleva igual.
  const res = correr([rendFila('34', 'Servicios Legales', 1000), rendFila('70', 'Marketing', 0)],
    [conta('9001', '', 'Marketing', '5208001', 1000)], { rvaConfig: cfg });
  assert('sin código de centro, la regla lleva la fila al destino', casi(fila(res, 'Servicios Legales').cPrecio, 1000));
  assert('lo movido no pasa por los redirects por nombre', fila(res, 'Marketing').cPrecio === null && res.ccsSoloEnConta.length === 0);
}

// ── 3) Dentro de un centro por persona (Directores) manda el listado ────────
{
  const cfg = { ...BASE, legajoAreas: [{ legajo: '9001', to: 'Servicios Legales', motivo: '' }] };
  const contaRows = [
    conta('9001', '13', 'Directores',        '5208001', 700),
    conta('9001', '10', 'Servicios Comunes', '5208001', 100),
  ];
  const listado = [{ id_empleado: '9001', id_centro_costo: '13', centro_costo: 'Servicios Comunes' }];
  const res = correr([rendFila('34', 'Servicios Legales', 100), rendFila('51', 'Servicios Comunes', 700)],
    contaRows, { rvaConfig: cfg, ccXEeRows: listado });
  assert('la fila de Directores va donde dice el listado (Servicios Comunes: 700)', casi(fila(res, 'Servicios Comunes').cPrecio, 700));
  assert('la fila del centro 10 la mueve la regla (Servicios Legales: 100)', casi(fila(res, 'Servicios Legales').cPrecio, 100));
  assert('lo movido es sólo la fila de fuera de Directores', casi(res.movidosPorLegajo[0].total, 100));

  // Sin listado: la fila de Directores no se reparte y la regla no la toca.
  const sinListado = correr([rendFila('34', 'Servicios Legales', 0)],
    [conta('9001', '13', 'Directores', '5208001', 700)], { rvaConfig: cfg });
  assert('sin listado, la regla no se lleva la fila de Directores (sigue sólo en CONTA)',
    casi(sinListado.ccsSoloEnConta.find(o => o.ccName === 'Directores')?.cPrecio, 700)
    && fila(sinListado, 'Servicios Legales').cPrecio === null);
  assert('…y la regla queda sin uso, con motivo «por persona»',
    sinListado.legajosSinUso.length === 1 && sinListado.legajosSinUso[0].causa === 'por_persona');
}

// ── 4) Regla sin uso: no aparece / ya viene en el destino ───────────────────
{
  const cfg = { ...BASE, legajoAreas: [
    { legajo: '9009', to: 'Servicios Legales', motivo: 'motivo A' },
    { legajo: '9003', to: 'Servicios Legales', motivo: 'motivo B' },
  ] };
  const res = correr(REND_CASO, CONTA_CASO, { rvaConfig: cfg });
  const porLegajo = Object.fromEntries(res.legajosSinUso.map(s => [s.legajo, s]));
  assert('dos reglas sin uso', res.legajosSinUso.length === 2 && res.summary.legajosSinUso === 2);
  assert('9009: no aparece en la Contabilidad',
    porLegajo['9009'].causa === 'sin_filas' && porLegajo['9009'].texto.includes('no aparece en la Contabilidad'));
  assert('9003: ya viene en el área destino',
    porLegajo['9003'].causa === 'ya_en_destino' && porLegajo['9003'].texto.includes('ya viene en el área destino'));
  assert('el texto dice «está configurado pero este mes no hizo falta moverlo»',
    res.legajosSinUso.every(s => s.texto.includes('está configurado pero este mes no hizo falta moverlo')));
  assert('el motivo cargado viaja con el aviso', porLegajo['9009'].motivo === 'motivo A');
  assert('ninguna de las dos mueve nada', res.movidosPorLegajo.length === 0);
}

// ── 5) Config guardada sin la clave → semilla vacía ─────────────────────────
{
  assert('la semilla de legajoAreas es []', Array.isArray(DEFAULT_RVA_CONFIG.legajoAreas) && DEFAULT_RVA_CONFIG.legajoAreas.length === 0);
  const vieja = { ...BASE };   // como se guardaba antes: sin legajoAreas
  const r1 = resolveRvaConfig(vieja);
  assert('sin legajoAreas guardado, toma []', Array.isArray(r1.legajoAreas) && r1.legajoAreas.length === 0);
  assert('resolver no devuelve la misma lista de la semilla', r1.legajoAreas !== DEFAULT_RVA_CONFIG.legajoAreas);
  const guardada = [{ legajo: '9001', to: 'Servicios Legales', motivo: '' }];
  const r2 = resolveRvaConfig({ ...BASE, legajoAreas: guardada });
  assert('con legajoAreas guardado, se respeta', r2.legajoAreas === guardada);
  const res = correr(REND_CASO, CONTA_CASO, { rvaConfig: vieja });
  assert('corrida con config vieja: no mueve nada y la config aplicada trae la clave',
    res.movidosPorLegajo.length === 0 && Array.isArray(res.meta.config.legajoAreas));
}

// ── 6) Legajo con ceros a la izquierda ──────────────────────────────────────
{
  const cfg = { ...BASE, legajoAreas: [{ legajo: '09001', to: 'Servicios Legales', motivo: '' }] };
  const res = correr(REND_CASO, CONTA_CASO, { rvaConfig: cfg });
  assert("'09001' en la config mueve al legajo '9001' de la CONTA",
    res.movidosPorLegajo.length === 1 && casi(fila(res, 'Servicios Legales').dTotal, 0));

  const contaConCeros = CONTA_CASO.map(r => r.id_empleado === '9001' ? { ...r, id_empleado: '009001' } : r);
  const res2 = correr(REND_CASO, contaConCeros, { rvaConfig: { ...BASE, legajoAreas: [{ legajo: '9001', to: 'Servicios Legales' }] } });
  assert("'9001' en la config mueve al legajo '009001' de la CONTA", casi(fila(res2, 'Servicios Legales').dTotal, 0));

  // Con la clave "tal cual" del cliente, '09001' y '9001' son distintos.
  const trim = correr(REND_CASO, CONTA_CASO, { rvaConfig: cfg, legajoKeyMode: 'trim' });
  assert("con la clave «tal cual», '09001' no mueve al '9001' (queda sin uso)",
    trim.movidosPorLegajo.length === 0 && trim.legajosSinUso[0]?.causa === 'sin_filas');
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
