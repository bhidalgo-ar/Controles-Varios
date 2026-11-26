// neteoAsientoMarvalControl.test.js — Control "Neteo del asiento" (Marval)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/neteoAsientoMarvalControl.test.js
//
// DATOS FICTICIOS: las cuentas (5100001, 2100001…), las dimensiones
// (D1-D2-D3-D4-D5-D6-1001…), los centros y los importes son inventados. No hay
// ningún legajo, nombre ni importe de un cliente.
//
// Lo que fija, en orden de qué cuesta más caro si se rompe:
//   1. El neteo: misma cuenta + dimensión + centro → una línea con Debe − Haber,
//      positivo al Debe, negativo al Haber, cero en 0,00 y 0,00. Al centavo.
//   2. Lo que NO se netea: pasivo (por el dígito configurado) y sin dimensión
//      quedan con una línea por lado, primero el Debe.
//   3. La regla de centros frena: dimensión con legajo y dos centros; sin
//      legajo con varios centros y sin el compartido. Con el compartido
//      cambiado en la config, la regla mira el nuevo.
//   4. El orden (cuenta, dimensión, centro) y la cuenta escrita sólo en la
//      primera línea de cada cuenta en el archivo.
//   5. El lector encuentra la hoja por sus títulos y toma como NOMBRE2 la
//      segunda columna NOMBRE (la que sigue a ID_CENTRO_COSTO).

globalThis.document = { addEventListener: () => {} };

import * as XLSX from './node_modules/xlsx/xlsx.mjs';
globalThis.XLSX = XLSX;

const {
  runNeteoAsientoMarval, summarizeNeteoAsientoMarval, lineasDelArchivo, escribirAsientoNeteado,
  legajoDeDimension, sinDimension, DEFAULT_NETEO_ASIENTO_CONFIG, exportAsientoNeteado,
} = await import('./js/controls/neteoAsientoMarval.js');
const { parseContaNeteo, detectHeaders, leerImporte } = await import('./js/parsers/contaNeteoParser.js');
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { FILE_TYPES } = await import('./js/ui/fileTypes.js');
const { EXPORT_CONTRACTS, CON_WRITER } = await import('./js/exports/contracts.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// Una fila de la desglosada ya leída (ficticia).
const fila = (cuenta, dimension, centro, debe, haber, nombre2 = `CENTRO ${centro}`) => ({
  cuenta, n_cuenta: `CUENTA FICTICIA ${cuenta}`, dimension, centro, nombre2, debe, haber,
});
const DIM = (legajo) => `D1-D2-D3-D4-D5-D6-${legajo}`;
const run = (rows, cfg) => runNeteoAsientoMarval(rows, [], { period: '2026-11', neteoAsientoConfig: cfg ?? null });
const buscar = (res, cuenta) => res.lineas.filter(l => String(l.cuenta_contab) === String(cuenta));

// ── Registry, ficha y contrato ──────────────────────────────────────────────
{
  const e = CONTROL_REGISTRY.neteo_asiento_marval;
  assert('la entrada existe en el registry', !!e);
  assert('no pide Tabulado', e.tabRequired === false);
  assert('pide la desglosada como primer archivo', e.additionalFiles[0].key === 'conta_neteo'
    && e.additionalFiles[0].fileType === 'conta_neteo_file');
  assert('es sólo para Marval', e.scope === 'cliente' && e.scopeMeta.clients.join() === 'MARVAL');
  assert('modo Generar Reporte', e.group.mode === 'Generar Reporte');
  assert('la config viaja aunque sea null (cae a "2" y "13")',
    e.config[0].mappingValue({ neteoAsientoConfig: null }) === null && e.config[0].default() === null);
  assert('la ficha del tipo de archivo existe', !!FILE_TYPES.conta_neteo_file && FILE_TYPES.conta_neteo_file.autoDetect === null);
  assert('el contrato tiene las 7 columnas del asiento, en orden',
    EXPORT_CONTRACTS.neteo_asiento_marval.columns.map(c => c.label).join('|')
      === 'CUENTA_CONTAB|N_CUENTA_CONTABLE|ID_CONTA|ID_CENTRO_COSTO|NOMBRE2|Suma de DEBE|Suma de HABER');
  assert('el contrato sale por el writer', CON_WRITER.includes('neteo_asiento_marval'));
  assert('valores iniciales: pasivo "2", centro compartido "13"',
    DEFAULT_NETEO_ASIENTO_CONFIG.prefijoPasivo === '2' && DEFAULT_NETEO_ASIENTO_CONFIG.centroCompartido === '13');
}

// ── Ayudas ──────────────────────────────────────────────────────────────────
assert('legajo = 7mo tramo de la dimensión', legajoDeDimension(DIM('1001')) === '1001');
assert('SIN_ASIGNAR no es legajo', legajoDeDimension(DIM('SIN_ASIGNAR')) === '');
assert('dimensión corta: sin legajo', legajoDeDimension('D1-D2') === '');
assert('"Null" y vacío son sin dimensión', sinDimension('Null') && sinDimension('') && sinDimension(null) && sinDimension('  null '));
assert('una dimensión con texto no es "sin dimensión"', !sinDimension(DIM('1001')));

// ── El neteo ────────────────────────────────────────────────────────────────
const base = [
  // neto positivo → al Debe (dos filas al Debe para probar que suma)
  fila(5100001, DIM('1001'), 4, 600, null),
  fila(5100001, DIM('1001'), 4, 400, null),
  fila(5100001, DIM('1001'), 4, null, 250),
  // neto negativo → al Haber
  fila(5100002, DIM('1002'), 7, 100, null),
  fila(5100002, DIM('1002'), 7, null, 300),
  // neto cero → 0,00 y 0,00
  fila(5100003, DIM('1003'), 7, 0.1, null),
  fila(5100003, DIM('1003'), 7, 0.2, null),
  fila(5100003, DIM('1003'), 7, null, 0.3),
  // una sola línea: sólo Debe
  fila(5100004, DIM('SIN_ASIGNAR'), 13, 400, null),
  // pasivo CON dimensión: no se netea
  fila(2100001, DIM('1004'), 7, 50, null),
  fila(2100001, DIM('1004'), 7, null, 900),
  // sin dimensión ("Null"), cuenta que no es de pasivo: no se netea
  fila(1200001, 'Null', '   ', 80, null, 'Null'),
  fila(1200001, 'Null', '   ', null, 20, 'Null'),
  // sin dimensión (vacía)
  fila(1200002, '', '   ', 10, null),
  fila(1200002, '', '   ', null, 10),
];
const res = run(base);
assert('sin error ni freno', !res.error && !res.freno);

{
  const [l] = buscar(res, 5100001);
  assert('neto positivo: una línea, 750 al Debe y 0 al Haber', buscar(res, 5100001).length === 1 && l.debe === 750 && l.haber === 0);
  assert('…marcada "se juntaron", con el antes', l.tipo === 'junta' && l.debe_antes === 1000 && l.haber_antes === 250);
}
{
  const [l] = buscar(res, 5100002);
  assert('neto negativo: 0 al Debe y 200 al Haber', l.debe === 0 && l.haber === 200 && l.tipo === 'junta');
}
{
  const [l] = buscar(res, 5100003);
  assert('neto cero exacto al centavo (0,10 + 0,20 − 0,30): 0,00 y 0,00', l.debe === 0 && l.haber === 0);
  assert('…se cuenta en "líneas en cero"', res.enCero === 1);
}
{
  const ls = buscar(res, 5100004);
  assert('con importe de un solo lado: queda igual y es "una sola línea"', ls.length === 1 && ls[0].debe === 400 && ls[0].tipo === 'una');
}
{
  const ls = buscar(res, 2100001);
  assert('pasivo con dimensión: dos líneas, primero el Debe', ls.length === 2
    && ls[0].debe === 50 && ls[0].haber === 0 && ls[1].debe === 0 && ls[1].haber === 900);
  assert('…marcadas abiertas por pasivo', ls.every(l => l.tipo === 'abierta' && l.motivo === 'pasivo'));
}
{
  const ls = buscar(res, 1200001);
  assert('sin dimensión ("Null"): dos líneas, 80 al Debe y 20 al Haber', ls.length === 2
    && ls[0].debe === 80 && ls[1].haber === 20);
  assert('…abiertas por sin dimensión', ls.every(l => l.tipo === 'abierta' && l.motivo === 'sin_dimension'));
  const vacia = buscar(res, 1200002);
  assert('sin dimensión (vacía): tampoco se netea aunque dé cero', vacia.length === 2 && vacia[0].debe === 10 && vacia[1].haber === 10);
}
assert('totales: Debe y Haber del asiento', res.totalDebe === 750 + 400 + 50 + 80 + 10 && res.totalHaber === 200 + 900 + 20 + 10);
{
  // La diferencia del detalle se calcula acá, sobre las filas de entrada, sin
  // pasar por el control: el asiento neteado tiene que dejar la misma.
  const cent = (n) => Math.round((n || 0) * 100);
  const difDetalle = base.reduce((acc, f) => acc + cent(f.debe) - cent(f.haber), 0);
  assert('netear no cambió la diferencia Debe − Haber del detalle (calculada aparte)',
    cent(res.totalDebe) - cent(res.totalHaber) === difDetalle && difDetalle === 160 * 100);
}
assert('conteos: juntas, abiertas y una sola', res.juntas === 3 && res.abiertas === 6 && res.unaSola === 1);
assert('el summary publica resumen y no está en error', !!summarizeNeteoAsientoMarval(res).resumen
  && summarizeNeteoAsientoMarval(res).status !== 'error');

// Orden: cuenta, dimensión, centro — y la cuenta sólo en la primera línea en el archivo
{
  const cuentas = res.lineas.map(l => Number(l.cuenta_contab));
  assert('las líneas salen ordenadas por cuenta', cuentas.every((c, i) => i === 0 || cuentas[i - 1] <= c));
  const archivo = lineasDelArchivo(res);
  const i = res.lineas.findIndex(l => l.cuenta_contab === 2100001);
  assert('en el archivo, la segunda línea de una cuenta va sin cuenta ni nombre',
    archivo[i].cuenta_contab === 2100001 && archivo[i + 1].cuenta_contab === null && archivo[i + 1].n_cuenta_contable === null);
  assert('…pero con dimensión y centro', archivo[i + 1].id_conta === DIM('1004') && archivo[i + 1].id_centro_costo === 7);
}
{
  // Dimensiones sin legajo, para que una misma dimensión pueda ir a dos centros
  // (uno es el 13) sin que frene la regla de centros.
  const A = 'D1-D2-D3-D4-D5-DA-SIN_ASIGNAR', B = 'D1-D2-D3-D4-D5-DB-SIN_ASIGNAR';
  const r = run([
    fila(5100009, B, 13, 1, null), fila(5100009, A, 13, 1, null),
    fila(5100009, A, 4, 1, null), fila(5100008, B, 1, 1, null),
  ]);
  assert('orden dentro de la cuenta: dimensión y después centro (como número)',
    r.lineas.map(l => `${l.cuenta_contab}/${l.id_conta.split('-')[5]}/${l.id_centro_costo}`).join(' ')
      === '5100008/DB/1 5100009/DA/4 5100009/DA/13 5100009/DB/13');
}

// Descuadre del detalle: se informa y NO frena
{
  const r = run([fila(5100001, DIM('1001'), 4, 100, null), fila(5100001, DIM('1001'), 4, null, 102.37)]);
  const s = summarizeNeteoAsientoMarval(r);
  assert('descuadre del detalle: no frena', !r.freno && r.lineas.length === 1);
  assert('…se informa con el importe', r.diferenciaAntes === -2.37 && s.status === 'warning');
  const badge = s.insights.find(i => /descuadrado/.test(i.value));
  assert('…el aviso se lee en orden: "Detalle de Meta4 descuadrado en 2,37 (Haber mayor)"',
    !!badge && `${badge.value} ${badge.label}` === 'Detalle de Meta4 descuadrado en 2,37 (Haber mayor)');
}

// ── Prefijo de pasivo cambiado ─────────────────────────────────────────────
{
  const r = run(base, { prefijoPasivo: '1', centroCompartido: '13' });
  const pas = buscar(r, 2100001);
  assert('con pasivo "1": la 2100001 (con dimensión) ahora se netea', pas.length === 1 && pas[0].haber === 850 && pas[0].tipo === 'junta');
  const p1 = buscar(r, 1200001);
  assert('…y la 1200001 queda abierta (ahora por pasivo)', p1.length === 2 && p1.every(l => l.motivo === 'pasivo'));
}

// ── Regla de centros: frenos ────────────────────────────────────────────────
{
  const r = run([...base, fila(5100001, DIM('1001'), 9, 10, null)]);
  assert('dimensión con legajo y dos centros: frena', r.freno?.tipo === 'centros');
  assert('…lista la dimensión, el motivo y los centros', r.freno.problemas.length === 1
    && r.freno.problemas[0].dimension === DIM('1001') && r.freno.problemas[0].motivo === 'legajo'
    && r.freno.problemas[0].centros.join(',') === '4,9');
  assert('…no arma ninguna línea', r.lineas.length === 0);
  assert('…y el summary sale en error', summarizeNeteoAsientoMarval(r).status === 'error');
}
{
  const r = run([...base, fila(5100004, DIM('SIN_ASIGNAR'), 3, 5, null), fila(5100004, DIM('SIN_ASIGNAR'), 9, 5, null),
    // la del 13 se saca para que no esté el compartido
  ].filter(f => !(f.cuenta === 5100004 && f.centro === 13)));
  assert('dimensión sin legajo con varios centros y sin el 13: frena', r.freno?.tipo === 'centros'
    && r.freno.problemas[0].motivo === 'sin_compartido' && r.freno.problemas[0].centros.join(',') === '3,9');
}
{
  const r = run([...base, fila(5100004, DIM('SIN_ASIGNAR'), 3, 5, null)]);
  assert('sin legajo con varios centros que incluyen el 13: no frena', !r.freno && r.reglaCentros.sinLegajoVarios === 1);
}
{
  const filas = [fila(5100004, DIM('SIN_ASIGNAR'), 13, 5, null), fila(5100004, DIM('SIN_ASIGNAR'), 3, 5, null)];
  const r = run(filas, { prefijoPasivo: '2', centroCompartido: '3' });
  assert('centro compartido cambiado a "3": 13 + 3 no frena', !r.freno);
  const r2 = run([filas[0], fila(5100004, DIM('SIN_ASIGNAR'), 9, 5, null)], { prefijoPasivo: '2', centroCompartido: '3' });
  assert('…y 13 + 9 frena, porque falta el 3', r2.freno?.tipo === 'centros'
    && r2.freno.problemas[0].motivo === 'sin_compartido');
}
{
  const r = run([fila(1200001, 'Null', '7', 1, null), fila(1200001, 'Null', '8', 1, null)]);
  assert('las líneas sin dimensión no entran a la regla de centros', !r.freno);
}

// ── Errores ─────────────────────────────────────────────────────────────────
assert('sin filas: error', !!runNeteoAsientoMarval([], [], {}).error);
assert('dígito de pasivo vacío: error, no se completa solo', !!run(base, { prefijoPasivo: '', centroCompartido: '13' }).error);
assert('centro compartido vacío: error', !!run(base, { prefijoPasivo: '2', centroCompartido: ' ' }).error);
assert('un error sale en el summary como error', summarizeNeteoAsientoMarval(runNeteoAsientoMarval([], [], {})).status === 'error');

// ── El Excel: siete columnas y "Total general" (ExcelJS falso) ──────────────
{
  const hojas = [];
  const wb = { addWorksheet(name) {
    const ws = { name, rows: [], columns: null, views: null,
      addRow(values) {
        const cells = values.map(v => ({ value: v }));
        const row = { values, height: null, eachCell: (fn) => cells.forEach(fn),
          getCell: (i) => { while (cells.length < i) cells.push({ value: null }); return cells[i - 1]; } };
        ws.rows.push(row); return row;
      },
      eachRow(fn) { ws.rows.forEach((r, i) => fn(r, i + 1)); },
    };
    hojas.push(ws); return ws;
  } };
  escribirAsientoNeteado(wb, res);
  const ws = hojas[0];
  assert('una hoja con encabezado, una fila por línea y el total', ws.rows.length === res.lineas.length + 2);
  const total = ws.rows.at(-1).values;
  assert('última fila: "Total general" con los totales', total[0] === 'Total general' && total[5] === res.totalDebe && total[6] === res.totalHaber);
  assert('los importes llevan el formato contable con guion en los ceros',
    ws.rows[1].getCell(6).numFmt.includes('"-"') && ws.rows.at(-1).getCell(7).numFmt.includes('"-"'));
}

// ── El lector: hoja por títulos, segunda NOMBRE como NOMBRE2 ────────────────
{
  const wb = XLSX.utils.book_new();
  // Primera hoja: un asiento ya armado (no tiene que leerse).
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [], [], [], ['CUENTA_CONTAB', 'N_CUENTA_CONTABLE', 'ID_CONTA', 'ID_CENTRO_COSTO', 'NOMBRE2', 'Suma de DEBE', 'Suma de HABER'],
    [5100001, 'X', DIM('1001'), 4, 'Y', 1, 0],
  ]), 'Asiento ficticio');
  // Segunda hoja: la desglosada, con una columna vacía adelante y dos NOMBRE.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [null, 'FEC_PAGO', 'ID_EMPLEADO', 'NOMBRE', 'APELLIDO_1', 'ID_CONCEPTO', 'NOMBRE_LARGO', 'CUENTA_CONTAB', 'ID_CONTA',
      'ID_CENTRO_COSTO', 'NOMBRE', 'DEBE', 'HABER', 'N_CUENTA_CONTABLE', 'DEBE_HABER'],
    [null, 'x', '1', 'SANGUINETTI', 'JAVIER', 'C1', 'CONCEPTO FICTICIO', 5100001, DIM('1001'), 4, 'CENTRO FICTICIO', 1000, null, 'CUENTA FICTICIA', 'D'],
    [null, 'x', '1', 'SANGUINETTI', 'JAVIER', 'C2', 'CONCEPTO FICTICIO', 5100001, DIM('1001'), 4, 'CENTRO FICTICIO', null, 250, 'CUENTA FICTICIA', 'H'],
    [],
    [null, 'x', '2', 'FALCIONI', 'JULIO', 'C3', 'CONCEPTO FICTICIO', 2100001, 'Null', '   ', 'Null', null, 750, 'PASIVO FICTICIO', 'H'],
  ]), 'Desglosada ficticia');
  const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const { parsedRows, parseMetadata } = parseContaNeteo(ab);
  assert('el lector toma la hoja de la desglosada aunque no sea la primera', parseMetadata.sheetName === 'Desglosada ficticia');
  assert('lee todas las filas con cuenta, también las sin centro', parsedRows.length === 3 && parseMetadata.sinCuenta === 1);
  assert('NOMBRE2 es la NOMBRE que sigue a ID_CENTRO_COSTO, no la del empleado',
    parsedRows[0].nombre2 === 'CENTRO FICTICIO' && parsedRows[2].nombre2 === 'Null');
  assert('la cuenta queda como número y el importe vacío como null', parsedRows[0].cuenta === 5100001 && parsedRows[1].debe === null);
  assert('la vista previa muestra los títulos de la hoja que se lee', detectHeaders(ab).headers.includes('ID_CONTA'));
  const r = runNeteoAsientoMarval(parsedRows, [], {});
  assert('de punta a punta: 750 al Debe en la 5100001 y 750 al Haber en el pasivo',
    r.lineas.length === 2 && r.lineas[1].debe === 750 && r.lineas[0].haber === 750);

  const sinNombre = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(sinNombre, XLSX.utils.aoa_to_sheet([
    ['CUENTA_CONTAB', 'ID_CONTA', 'ID_CENTRO_COSTO', 'DEBE', 'HABER', 'N_CUENTA_CONTABLE'],
    [5100001, DIM('1001'), 4, 1, null, 'X'],
  ]), 'Hoja');
  let msg = '';
  try { parseContaNeteo(XLSX.write(sinNombre, { type: 'array', bookType: 'xlsx' })); } catch (e) { msg = e.message; }
  assert('sin la columna del nombre del centro: corta diciendo cuál falta', /NOMBRE/.test(msg) && /ID_CENTRO_COSTO/.test(msg));

  const otro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(otro, XLSX.utils.aoa_to_sheet([['LEGAJO', 'IMPORTE'], ['1', 10]]), 'Otra cosa');
  msg = '';
  try { parseContaNeteo(XLSX.write(otro, { type: 'array', bookType: 'xlsx' })); } catch (e) { msg = e.message; }
  assert('un archivo que no es la desglosada: corta con los títulos que esperaba', /CUENTA_CONTAB/.test(msg));

  // La hoja se reconoce (5 de los 6 títulos) pero le falta HABER: el error la nombra.
  const sinHaber = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(sinHaber, XLSX.utils.aoa_to_sheet([
    ['CUENTA_CONTAB', 'ID_CONTA', 'ID_CENTRO_COSTO', 'NOMBRE', 'DEBE', 'N_CUENTA_CONTABLE'],
    [5100001, DIM('1001'), 4, 'CENTRO FICTICIO', 1, 'X'],
  ]), 'Desglosada recortada');
  msg = '';
  try { parseContaNeteo(XLSX.write(sinHaber, { type: 'array', bookType: 'xlsx' })); } catch (e) { msg = e.message; }
  assert('hoja reconocible sin HABER: el error nombra la columna que falta',
    /le falta la columna HABER/.test(msg) && /Desglosada recortada/.test(msg));
  let msgPreview = '';
  try { detectHeaders(XLSX.write(sinHaber, { type: 'array', bookType: 'xlsx' })); } catch (e) { msgPreview = e.message; }
  assert('…lo mismo en la vista previa', /HABER/.test(msgPreview));

  // Importes escritos como texto, leídos por el lector de punta a punta.
  const textos = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(textos, XLSX.utils.aoa_to_sheet([
    ['CUENTA_CONTAB', 'N_CUENTA_CONTABLE', 'ID_CONTA', 'ID_CENTRO_COSTO', 'NOMBRE', 'DEBE', 'HABER'],
    [5100001, 'X', DIM('1001'), 4, 'C', '1.234,56', null],
    [5100001, 'X', DIM('1001'), 4, 'C', null, '234.56'],
  ]), 'Desglosada ficticia');
  const pt = parseContaNeteo(XLSX.write(textos, { type: 'array', bookType: 'xlsx' }));
  const rt = runNeteoAsientoMarval(pt.parsedRows, [], {});
  assert('importes escritos como texto ("1.234,56" y "234.56") se leen y netean bien',
    !rt.freno && rt.lineas.length === 1 && rt.lineas[0].debe === 1000);

  const malos = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(malos, XLSX.utils.aoa_to_sheet([
    ['CUENTA_CONTAB', 'N_CUENTA_CONTABLE', 'ID_CONTA', 'ID_CENTRO_COSTO', 'NOMBRE', 'DEBE', 'HABER'],
    [5100001, 'X', DIM('1001'), 4, 'C', 'abc', null],
    [5100001, 'X', DIM('1001'), 4, 'C', null, '1.234'],
    [5100001, 'X', DIM('1001'), 4, 'C', 10, ''],
  ]), 'Desglosada ficticia');
  const pm = parseContaNeteo(XLSX.write(malos, { type: 'array', bookType: 'xlsx' }));
  const rm = runNeteoAsientoMarval(pm.parsedRows, [], {});
  assert('desde el archivo: "abc" en DEBE y "1.234" en HABER frenan; la celda vacía no',
    rm.freno?.tipo === 'importes' && rm.freno.problemas.length === 2
    && rm.freno.problemas.some(p => p.columna === 'DEBE' && p.tipo === 'texto' && p.filas === 1)
    && rm.freno.problemas.some(p => p.columna === 'HABER' && p.tipo === 'ambiguo' && p.filas === 1));
}

// ── Importes que no se pueden leer: freno ───────────────────────────────────
assert('importe vacío vale como celda vacía', leerImporte('').valor === null && leerImporte('  ').error === null);
assert('"1.234,56" (argentino) se lee 1234,56', leerImporte('1.234,56').valor === 1234.56);
assert('"1234,56" se lee 1234,56', leerImporte('1234,56').valor === 1234.56);
assert('"1234.56" (plano) se lee 1234,56', leerImporte('1234.56').valor === 1234.56);
assert('"1.234.567" se lee 1234567', leerImporte('1.234.567').valor === 1234567);
assert('"1.234" es ambiguo', leerImporte('1.234').error === 'ambiguo' && leerImporte('1.234').valor === null);
assert('"abc" y "Null" no son importes', leerImporte('abc').error === 'texto' && leerImporte('Null').error === 'texto');
{
  const r = run([...base,
    { ...fila(5100001, DIM('1001'), 4, null, null), debeError: 'texto' },
    { ...fila(5100001, DIM('1001'), 4, null, null), debeError: 'texto' },
    { ...fila(5100002, DIM('1002'), 7, null, null), haberError: 'ambiguo' },
  ]);
  assert('un importe ilegible frena: no se arma ninguna línea', r.freno?.tipo === 'importes' && r.lineas.length === 0);
  const p = (col, tipo) => r.freno.problemas.find(x => x.columna === col && x.tipo === tipo)?.filas;
  assert('…informa cuántas filas y en qué columna', p('DEBE', 'texto') === 2 && p('HABER', 'ambiguo') === 1
    && r.freno.problemas.length === 2);
  assert('…y el summary sale en error', summarizeNeteoAsientoMarval(r).status === 'error');
  const r2 = run([fila(5100001, DIM('1001'), 4, 'abc', null)]);
  assert('un texto que llega sin pasar por el lector también frena', r2.freno?.tipo === 'importes');
}

// ── Más de 2 decimales: se avisa, no se cambia el redondeo ──────────────────
{
  const r = run([fila(5100001, DIM('1001'), 4, 10.005, null), fila(5100001, DIM('1001'), 4, null, 0.29),
    fila(5100002, DIM('1002'), 7, 3.1234, null)]);
  assert('cuenta las filas con más de 2 decimales (0,29 no cuenta)', r.filasMasDecimales === 2 && !r.freno);
  assert('…sale como aviso', summarizeNeteoAsientoMarval(r).insights.some(i => i.value === 2 && /decimales/.test(i.label)));
  assert('sin decimales de más, no hay aviso', res.filasMasDecimales === 0);
}

// ── Celdas vacías en las líneas sin dimensión ───────────────────────────────
{
  const ls = buscar(res, 1200001);
  assert('centro con sólo espacios y NOMBRE2 "Null" salen vacíos', ls.every(l => l.id_centro_costo === null && l.nombre2 === null));
  assert('…la dimensión "Null" se deja como viene', ls.every(l => l.id_conta === 'Null'));
  const archivo = lineasDelArchivo(res);
  const i = res.lineas.findIndex(l => l.cuenta_contab === 1200001);
  assert('…y así van al archivo', archivo[i].id_centro_costo === null && archivo[i].nombre2 === null && archivo[i].id_conta === 'Null');
  assert('un centro y un NOMBRE2 con datos no se tocan', buscar(res, 5100001)[0].id_centro_costo === 4
    && buscar(res, 5100001)[0].nombre2 === 'CENTRO 4');
}

// ── Con freno no se descarga ────────────────────────────────────────────────
{
  let workbooks = 0;
  globalThis.window = { ExcelJS: { Workbook: class { constructor() { workbooks++; } } } };
  const frenado = run([...base, fila(5100001, DIM('1001'), 9, 10, null)]);
  const salio = await exportAsientoNeteado(frenado);
  assert('con freno, exportar devuelve false y no arma ningún libro', salio === false && workbooks === 0);
  delete globalThis.window;
}

console.log(`\n${ok} ok · ${fail} fallas`);
if (fail > 0) process.exit(1);
