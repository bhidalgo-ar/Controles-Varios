// fichasCuentaContable.test.js — La ficha por CUENTA CONTABLE de los dos
// controles cuya unidad no es el empleado: el Asiento de Remuneraciones
// (`finadiet_asiento`) y la Contabilidad Desglosada + Asiento
// (`conta_desglosada`). Tanda 7 de specs/vista-estandar-resultados.md.
//
// Lo que este test fija, en orden de qué cuesta más caro si se rompe:
//
//   1. **El desglose por concepto suma EXACTAMENTE el saldo de su cuenta.** Es
//      la única promesa que hace la ficha abierta, y es la que no se detecta
//      mirando los totales: si el desglose se desalinea del saldo, los totales
//      del asiento siguen cerrando y la pantalla muestra conceptos que no
//      explican el número que dice explicar.
//   2. **Los chips cuentan lo mismo que el semáforo.** Un chip que cuenta
//      distinto de `unitsWithDiff` es una pantalla que se contradice con la
//      tarjeta del control y con el checklist.
//   3. **Una cuenta sin código es "Sin comparar", nunca "Al centavo"** (D-073):
//      no hay diferencia de importe, falta el otro archivo. En ámbar no se lee
//      como aprobada.
//   4. **"Dentro del margen" no aplica** a estos dos controles y sale igual, en
//      gris con su 0 y con el motivo en el `title` — no oculto (§3).
//   5. El desglose se agrupa por **código** de concepto y no por nombre, y no
//      esconde el concepto que quedó en cero de los dos lados.
//
// Datos 100% inventados: cuentas, centros y códigos que no son de ningún
// cliente, y legajos '1'/'2'. Ni un legajo ni un nombre real acá.
//
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/fichasCuentaContable.test.js

globalThis.document = { addEventListener() {} };

const { conciliarCuenta, tiraDeCuenta, detalleDeConceptos, contextoDeCuenta, rotuloDeSaldo, concordancia, CENTAVO }
  = await import('./js/ui/fichaCuenta.js');
const { acumularConcepto, conceptosEnOrden } = await import('./js/controls/cuentaConceptos.js');
const { fichaBodyHtml, fichaCardHtml } = await import('./js/ui/fichaList.js');
const { runFinadietAsiento, summarizeFinadietAsiento, fichasDeAsiento, estadoDeCuentaAsiento }
  = await import('./js/controls/finadietAsiento.js');
const { runContaDesglosada, summarizeContaDesglosada, fichasDeCuentas, estadoDeCuentaConta }
  = await import('./js/controls/contaDesglosada.js');
const { ESTADOS_DE_CASO } = await import('./js/ui/tableTools.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle ? `\n    ${detalle}` : ''); fail++; }
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ══════════════════════════════════════════════════════════════════════
// 1. conciliarCuenta — el saldo, de qué lado queda, y qué no se explica
// ══════════════════════════════════════════════════════════════════════

{
  const c = conciliarCuenta({
    debe: 1000, haber: 0,
    conceptos: [
      { nro: '100', concepto: 'Sueldo',    debe: 800, haber: 0 },
      { nro: '110', concepto: 'Antiguedad', debe: 200, haber: 0 },
    ],
  });
  assert('el saldo va firmado DEBE − HABER', c.saldo === 1000);
  assert('…y dice de qué lado queda', c.lado === 'DEBE');
  assert('el monto es el saldo en positivo (el número grande de la ficha)', c.monto === 1000);
  assert('los conceptos suman al DEBE lo mismo que la cuenta', c.conceptosDebe === 1000);
  assert('no queda nada sin explicar', c.residuo === 0 && c.cuadra === true);
  assert('cuenta cuántos conceptos la componen', c.cantidad === 2);
  assert('el rótulo del importe grande nombra el lado', rotuloDeSaldo(c) === 'SALDO AL DEBE');
  assert('…y cada control puede llamarlo como lo llama su .xlsx',
    rotuloDeSaldo(c, 'NETO') === 'NETO AL DEBE');
}

{
  const c = conciliarCuenta({
    debe: 0, haber: 5000,
    conceptos: [{ nro: '9000', concepto: 'Neto a pagar', debe: 0, haber: 5000 }],
  });
  assert('una cuenta a pagar queda del lado del HABER', c.lado === 'HABER' && c.saldo === -5000);
  assert('…y su monto sigue siendo positivo', c.monto === 5000);
}

{
  // Un movimiento que entró y salió por la misma cuenta: se cancela sola.
  const c = conciliarCuenta({
    debe: 300, haber: 300,
    conceptos: [
      { nro: '100', concepto: 'Ajuste', debe: 300, haber: 0 },
      { nro: '200', concepto: 'Contra-ajuste', debe: 0, haber: 300 },
    ],
  });
  assert('la cuenta que se cancela sola no tiene lado', c.lado === null && c.monto === 0);
  assert('…y sus conceptos igual la explican', c.cuadra === true);
}

{
  // El caso que este cálculo existe para agarrar: un desglose que NO suma.
  const c = conciliarCuenta({
    debe: 1000, haber: 0,
    conceptos: [{ nro: '100', concepto: 'Sueldo', debe: 700, haber: 0 }],
  });
  assert('un desglose que no suma al saldo no cuadra', c.cuadra === false);
  assert('…y dice cuánto falta', c.residuo === -300);
  assert('la tira lo marca como residuo en rojo',
    tiraDeCuenta(c).at(-1).residuo === true);
  assert('…y la tira de una cuenta que cuadra no lo marca',
    tiraDeCuenta(conciliarCuenta({ debe: 1, haber: 0, conceptos: [{ debe: 1, haber: 0 }] })).at(-1).residuo === false);
}

{
  const c = conciliarCuenta({ debe: 100.004, haber: 100, conceptos: [{ debe: 100, haber: 100 }] });
  assert('el redondeo de Excel no rompe el cuadre (tolerancia de un centavo)',
    c.cuadra === true && CENTAVO === 0.01);
}

// La tira y el contexto son obligatorios en la ficha: si uno de los dos dejara
// de tener la forma que fichaList espera, la ficha tiraría al abrirse.
{
  const c = conciliarCuenta({ debe: 10, haber: 0, conceptos: [{ nro: '1', concepto: 'X', debe: 10, haber: 0 }] });
  const html = fichaBodyHtml({
    strip: tiraDeCuenta(c),
    detail: detalleDeConceptos([{ nro: '1', concepto: 'X', debe: 10, haber: 0 }], c),
    conclusion: { tone: 'ok', title: 'Cuadra', text: 'Nada para revisar.' },
  }, { id: 'test' });
  assert('la tira y el detalle de una cuenta arman un cuerpo de ficha válido',
    html.includes('ficha-strip') && html.includes('ficha-detail'));
  assert('el detalle muestra el CÓDIGO de cada concepto', html.includes('Cód.'));
  assert('…y el efecto de cada concepto sobre el saldo', html.includes('Efecto en el saldo'));
  const ctx = contextoDeCuenta(c, n => String(n));
  assert('la ficha cerrada muestra su DEBE y su HABER sin abrirla',
    ctx[0] === 'DEBE 10' && ctx[1] === 'HABER 0');
  assert('…y si cuadra', ctx[2] === '1 concepto que suma exacto');
}

assert('una cuenta sin desglose no dibuja una tabla vacía',
  detalleDeConceptos([], conciliarCuenta({})) === undefined);

// La concordancia de singular y plural: escrita a mano en cada mensaje sale
// "sus 1 concepto suman exacto", y esto se lee todos los meses.
{
  const uno = conciliarCuenta({ debe: 1, haber: 0, conceptos: [{ debe: 1, haber: 0 }] });
  const tres = conciliarCuenta({ debe: 3, haber: 0, conceptos: [{ debe: 1 }, { debe: 1 }, { debe: 1 }] });
  assert('la tira dice "Concepto que la compone" en singular',
    tiraDeCuenta(uno)[0].label === 'Concepto que la compone');
  assert('…y "Conceptos que la componen" en plural',
    tiraDeCuenta(tres)[0].label === 'Conceptos que la componen');
  assert('el contexto concuerda el verbo en singular',
    contextoDeCuenta(uno, String)[2] === '1 concepto que suma exacto');
  assert('…y en plural', contextoDeCuenta(tres, String)[2] === '3 conceptos que suman exacto');
  assert('concordancia() da el sujeto y el verbo para armar una conclusión',
    concordancia(1).sujeto === 'El único concepto' && concordancia(1).suman === 'suma'
      && concordancia(4).sujeto === 'Los 4 conceptos' && concordancia(4).suman === 'suman');
  assert('…y el sujeto para el medio de una frase',
    concordancia(1).sujetoSuyo === 'su único concepto' && concordancia(2).sujetoSuyo === 'sus 2 conceptos');
}

// ══════════════════════════════════════════════════════════════════════
// 2. cuentaConceptos — se agrupa por CÓDIGO, no por nombre
// ══════════════════════════════════════════════════════════════════════

{
  const map = new Map();
  // El mismo concepto escrito con dos grafías: es UNA línea del desglose.
  acumularConcepto(map, { nro: '100', concepto: 'Vacaciones', debe: 100, haber: 0 });
  acumularConcepto(map, { nro: '100', concepto: 'VACACIONES', debe: 50,  haber: 0 });
  acumularConcepto(map, { nro: '20',  concepto: 'Sueldo',     debe: 900, haber: 0 });
  const lista = conceptosEnOrden(map);

  assert('dos grafías del mismo código son un solo concepto', lista.length === 2);
  assert('…y sus importes se suman, no se pisan',
    lista.find(c => c.nro === '100').debe === 150);
  assert('el orden es por código, numérico (20 antes que 100)',
    lista[0].nro === '20' && lista[1].nro === '100');
  assert('el nombre lo pone la primera fila que lo trae',
    lista.find(c => c.nro === '100').concepto === 'Vacaciones');
}

{
  const map = new Map();
  acumularConcepto(map, { nro: '',  concepto: 'Sin código', debe: 10, haber: 0 });
  acumularConcepto(map, { nro: '5', concepto: 'Con código', debe: 20, haber: 0 });
  acumularConcepto(map, {},         );
  const lista = conceptosEnOrden(map);
  assert('sin código se cae al nombre, y sin ninguno de los dos queda "(sin concepto)"',
    lista.length === 3 && lista.some(c => c.concepto === null));
  assert('lo que no tiene código va al final: es lo que hay que resolver',
    lista[0].nro === '5' && lista[1].nro === null && lista[2].nro === null);
}

{
  const map = new Map();
  // Un concepto que entró y salió por la misma cuenta queda en 0,00 de los dos
  // lados. NO se esconde: si se escondiera, el desglose dejaría de sumar al
  // saldo justo cuando hay algo raro que mirar.
  acumularConcepto(map, { nro: '7', concepto: 'Ida y vuelta', debe: 400, haber: 0 });
  acumularConcepto(map, { nro: '7', concepto: 'Ida y vuelta', debe: 0,   haber: 400 });
  const lista = conceptosEnOrden(map);
  assert('el concepto que quedó en cero de los dos lados sigue en el desglose',
    lista.length === 1 && lista[0].debe === 400 && lista[0].haber === 400);
}

// ══════════════════════════════════════════════════════════════════════
// 3. Asiento de Remuneraciones — la ficha por cuenta
// ══════════════════════════════════════════════════════════════════════
//
// Dos centros de costo de la semilla del cliente y tres conceptos, todos con
// cuenta y centro conocidos: el asiento cierra al centavo.

const mov = ({ centro, importe, debe = '', haber = '', nro, concepto }) => ({
  centro, importe,
  cuenta_debe: debe, cuenta_debe_nombre: '',
  cuenta_haber: haber, cuenta_haber_nombre: '',
  nro_concepto: nro, concepto,
});

const FILAS_FINADIET = [
  mov({ centro: 'ADMINISTRACION',      importe: 100000, debe: '521101', haber: '213111', nro: '1010', concepto: 'Sueldo' }),
  mov({ centro: 'ADMINISTRACION',      importe:  18000, debe: '521201', haber: '213212', nro: '1120', concepto: 'Jubilacion' }),
  mov({ centro: 'PRODUCCION - M.O.D.', importe: 240000, debe: '521101', haber: '213111', nro: '1010', concepto: 'Sueldo' }),
  mov({ centro: 'PRODUCCION - M.O.D.', importe:  12000, debe: '521101', haber: '213111', nro: '1130', concepto: 'Horas extras' }),
];

{
  const r = runFinadietAsiento(FILAS_FINADIET, [], { period: '2026-07', finadietAsientoConfig: null });
  const s = summarizeFinadietAsiento(r);
  const fichas = fichasDeAsiento(r);

  assert('el asiento del caso inventado cierra', r.cierra === true);

  // ── La promesa de la ficha abierta ─────────────────────────────────
  const desalineadas = fichas.filter(f => f.conciliacion && !f.conciliacion.cuadra);
  assert('el desglose por concepto de CADA cuenta suma exactamente su saldo',
    desalineadas.length === 0,
    desalineadas.map(f => `${f.cuenta}: residuo ${f.conciliacion.residuo}`).join(' · '));

  // Y el mismo cheque desde el otro lado: sumando los conceptos a mano.
  const aMano = fichas.filter(f => f.conciliacion).every((f) => {
    const d = round2(f.conceptos.reduce((a, c) => a + c.debe, 0));
    const h = round2(f.conceptos.reduce((a, c) => a + c.haber, 0));
    return d === f.conciliacion.debe && h === f.conciliacion.haber;
  });
  assert('…sumado a mano, lado por lado, da lo mismo', aMano);

  // ── Los chips cuentan lo mismo que el semáforo ─────────────────────
  assert('hay una ficha por unidad que cuenta el semáforo',
    fichas.length === s.unitsTotal, `fichas ${fichas.length} · unitsTotal ${s.unitsTotal}`);
  const conDif = fichas.filter(f => f.estado !== 'centavo' && f.estado !== 'margen').length;
  assert('…y las que no cerraron son las que el semáforo cuenta con diferencia',
    conDif === s.unitsWithDiff, `fichas ${conDif} · unitsWithDiff ${s.unitsWithDiff}`);
  assert('el asiento cierra y no hay nada sin clasificar: todas Al centavo',
    fichas.every(f => f.estado === 'centavo'));
  assert('la unidad que declara el semáforo sigue siendo la cuenta', s.unit === 'cuenta');

  // ── La tarjeta cerrada: número y nombre de la cuenta ───────────────
  const sueldos = fichas.find(f => f.cuenta === '400.521101');
  assert('la cuenta lleva el prefijo del centro de costo', !!sueldos);
  assert('el avatar de la ficha es el NÚMERO de la cuenta', sueldos.unit === '400.521101');
  assert('…y la línea de identidad, su nombre', sueldos.name === 'SUELDOS (INCLUYE REDONDEO)');
  assert('la ficha cerrada muestra su DEBE', sueldos.context[0].startsWith('DEBE'));
  assert('…su HABER', sueldos.context[1].startsWith('HABER'));
  assert('…y que cuadra', /concepto que suma exacto|conceptos que suman exacto/.test(sueldos.context[2]));
  assert('el importe grande es el saldo, del lado que corresponde',
    sueldos.amount === 100000 && sueldos.amountLabel === 'SALDO AL DEBE');
  assert('la ficha que cuadra no lleva badge de causa', sueldos.badge === undefined);

  // El bloque patrimonial consolida entre centros: 100.213111 junta los tres
  // movimientos de sueldos de los dos centros de costo.
  const aPagar = fichas.find(f => f.cuenta === '100.213111');
  assert('la cuenta patrimonial consolida entre todos los centros',
    aPagar.conciliacion.haber === 352000);
  assert('…y adentro se ven sus dos conceptos, con su código',
    aPagar.conceptos.length === 2
      && aPagar.conceptos.map(c => c.nro).join(',') === '1010,1130');
  assert('el sueldo de los dos centros suma en un solo concepto',
    aPagar.conceptos.find(c => c.nro === '1010').haber === 340000);
  assert('la patrimonial queda del lado del HABER', aPagar.amountLabel === 'SALDO AL HABER');

  // ── El cuerpo se dibuja sin tirar ──────────────────────────────────
  let error = null;
  for (const f of fichas) {
    try { fichaCardHtml(f); fichaBodyHtml(f.body, { id: f.id }); }
    catch (e) { error = `${f.id}: ${e.message}`; break; }
  }
  assert('todas las fichas arman tarjeta y cuerpo (tira y conclusión incluidas)', error === null, error);

  assert('ninguna ficha inventa un estado que la barra no sepa dibujar',
    fichas.every(f => ESTADOS_DE_CASO.includes(f.estado)));
}

{
  // Una cuenta que no está en la tabla del cliente y un centro que tampoco:
  // los dos entran como ficha, en "Sin comparar", y el asiento deja de cerrar.
  const filas = [
    ...FILAS_FINADIET,
    mov({ centro: 'ADMINISTRACION', importe: 7000, debe: '999999', haber: '213111', nro: '1400', concepto: 'Inventado' }),
    mov({ centro: 'DEPOSITO NUEVO', importe: 3000, debe: '521101', haber: '213111', nro: '1010', concepto: 'Sueldo' }),
  ];
  const r = runFinadietAsiento(filas, [], { period: '2026-07', finadietAsientoConfig: null });
  const s = summarizeFinadietAsiento(r);
  const fichas = fichasDeAsiento(r);

  assert('con una cuenta y un centro sin clasificar el asiento NO cierra', r.cierra === false);

  const sinComparar = fichas.filter(f => f.estado === 'sinComparar');
  assert('la cuenta que no está en la tabla entra como ficha',
    sinComparar.some(f => f.cuenta === '999999'));
  assert('…y el centro que no está en la tabla, también',
    sinComparar.some(f => f.cuenta === 'DEPOSITO NUEVO'));
  assert('las dos van en "Sin comparar", nunca en "Al centavo" (D-073)',
    sinComparar.length === 2 && !fichas.some(f => f.cuenta === '999999' && f.estado === 'centavo'));
  assert('la ficha de lo que quedó afuera no tiene saldo: sale "—", no 0,00',
    sinComparar.every(f => f.amount === null && f.amountLabel === 'SIN ASENTAR'));
  assert('…y su conclusión dice qué hacer en el Paso 2',
    sinComparar.every(f => /Paso 2/.test(f.body.conclusion.text)));

  assert('sigue habiendo una ficha por unidad del semáforo',
    fichas.length === s.unitsTotal, `fichas ${fichas.length} · unitsTotal ${s.unitsTotal}`);
  const conDif = fichas.filter(f => f.estado !== 'centavo' && f.estado !== 'margen').length;
  assert('el asiento no cierra: TODAS quedan marcadas, igual que el semáforo',
    conDif === s.unitsWithDiff && conDif === fichas.length);
  assert('la cuenta que sí cuadra lo dice, y la conclusión manda a mirar lo que quedó afuera',
    fichas.some(f => f.conciliacion?.cuadra && /Sin comparar/.test(f.body.conclusion.text)));

  let error = null;
  for (const f of fichas) {
    try { fichaCardHtml(f); fichaBodyHtml(f.body, { id: f.id }); }
    catch (e) { error = `${f.id}: ${e.message}`; break; }
  }
  assert('las fichas de lo que quedó afuera también arman cuerpo válido', error === null, error);
}

assert('estadoDeCuentaAsiento: lo sin clasificar es Sin comparar aunque el asiento cierre',
  estadoDeCuentaAsiento({ sinClasificar: { tipo: 'cuenta', lados: 1 } }, { cierra: true }) === 'sinComparar');
assert('estadoDeCuentaAsiento: un desglose que no suma es Con diferencia aunque el asiento cierre',
  estadoDeCuentaAsiento({ conciliacion: { cuadra: false } }, { cierra: true }) === 'conDif');

// ══════════════════════════════════════════════════════════════════════
// 4. Contabilidad Desglosada — la ficha por cuenta
// ══════════════════════════════════════════════════════════════════════

const fila = ({ legajo, nro, concepto, importe, ceco = '10', debe = '', haber = '', liq = 'Mensual' }) => ({
  legajo, centro_costo: ceco, ingreso: '01/03/2020',
  nro_concepto: nro, concepto, importe,
  cuenta_debe: debe, cuenta_haber: haber, liquidacion: liq,
});

const FILAS_CONTA = [
  fila({ legajo: '1', nro: '100', concepto: 'Sueldo',      importe: '1.000,00', debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
  fila({ legajo: '1', nro: '110', concepto: 'Antiguedad',  importe: '200,00',   debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
  fila({ legajo: '2', nro: '100', concepto: 'Sueldo',      importe: '800,00',   debe: 'Sueldos Ventas', haber: 'Sueldos a pagar' }),
  fila({ legajo: '2', nro: '300', concepto: 'Jubilacion',  importe: '-88,00',   debe: 'Sueldos a pagar', haber: 'Jubilacion a pagar' }),
];

/** Reporte de Cuentas de Redefinición del cliente, como lo devuelve su parser. */
const CUENTAS_REF = [
  { nombre: 'Sueldos Ventas',     centro_costo: '10', codigo: '710100100' },
  { nombre: 'Sueldos a pagar',    centro_costo: '',   codigo: '215100100' },
  { nombre: 'Jubilacion a pagar', centro_costo: '',   codigo: '215100200' },
];

const MAPPING_CONTA = { period: '2026-05', legajoKeyMode: 'sin_ceros', contaDesglosadaConfig: null };

{
  const r = runContaDesglosada(FILAS_CONTA, [], { ...MAPPING_CONTA, cuentas_refRows: CUENTAS_REF });
  const s = summarizeContaDesglosada(r);
  const fichas = fichasDeCuentas(r);

  assert('la desglosada del caso inventado cierra', r.cierra === true);
  assert('…y el asiento se armó', !!r.asiento);

  const desalineadas = fichas.filter(f => !f.conciliacion.cuadra);
  assert('el desglose por concepto de CADA cuenta del asiento suma exactamente su saldo',
    desalineadas.length === 0,
    desalineadas.map(f => `${f.cuenta}: residuo ${f.conciliacion.residuo}`).join(' · '));

  // El cruce con el neteo que el control ya calcula para el .xlsx: son la misma
  // cuenta hecha por dos caminos, así que tienen que dar igual.
  assert('el saldo de la ficha es el mismo NETO que el control escribe en el .xlsx',
    fichas.every(f => f.conciliacion.monto === round2((f.neto_debe || 0) + (f.neto_haber || 0))));

  assert('hay una ficha por línea del asiento',
    fichas.length === r.asiento.filas.length);
  assert('el avatar es el NÚMERO de la cuenta y la identidad su nombre',
    fichas.every(f => f.unit === f.numero && f.name === f.cuenta));

  const ventas = fichas.find(f => f.numero === '710100100');
  assert('la cuenta de resultado va con su centro de costo', ventas.centro_costo === '10');
  assert('…y adentro están sus dos conceptos, cada uno con su código',
    ventas.conceptos.map(c => c.nro).join(',') === '100,110');
  assert('el sueldo de los dos legajos suma en un solo concepto',
    ventas.conceptos.find(c => c.nro === '100').debe === 1800);
  assert('el importe grande se llama NETO, como la columna del .xlsx',
    ventas.amountLabel === 'NETO AL DEBE' && ventas.amount === 2000);
  assert('la cuenta patrimonial se rotula consolidada, sin centro de costo',
    fichas.find(f => f.numero === '215100100').tag.text === 'patrimonial · consolidada');
  assert('la cuenta del neto a pagar sale marcada como tal',
    fichas.find(f => f.numero === '215100100').marks.some(m => /neto a pagar/i.test(m.text)));
  assert('el neto por legajo entra al desglose con el código de concepto configurado (9000)',
    fichas.find(f => f.numero === '215100100').conceptos.some(c => c.nro === '9000'));

  assert('todo cierra y todas las cuentas tienen código: todas Al centavo',
    fichas.every(f => f.estado === 'centavo'));
  assert('el semáforo tampoco ve nada con diferencia', s.unitsWithDiff === 0);
  assert('la unidad que declara el semáforo sigue siendo la cuenta', s.unit === 'cuenta');

  let error = null;
  for (const f of fichas) {
    try { fichaCardHtml(f); fichaBodyHtml(f.body, { id: f.id }); }
    catch (e) { error = `${f.id}: ${e.message}`; break; }
  }
  assert('todas las fichas arman tarjeta y cuerpo', error === null, error);
  assert('ninguna ficha inventa un estado que la barra no sepa dibujar',
    fichas.every(f => ESTADOS_DE_CASO.includes(f.estado)));
}

{
  // Falta una cuenta en el reporte del cliente: la línea suma al asiento igual
  // (el balance no se maquilla) y su ficha sale en "Sin comparar".
  const refIncompleto = CUENTAS_REF.filter(c => c.nombre !== 'Jubilacion a pagar');
  const r = runContaDesglosada(FILAS_CONTA, [], { ...MAPPING_CONTA, cuentas_refRows: refIncompleto });
  const s = summarizeContaDesglosada(r);
  const fichas = fichasDeCuentas(r);

  assert('el asiento sigue cerrando aunque falte un código',
    r.asiento.cierraBruto && r.asiento.cierraNeteado);
  const sin = fichas.filter(f => f.sinCodigo);
  assert('la cuenta sin código tiene su ficha', sin.length === 1);
  assert('…y va en "Sin comparar", no en "Con diferencia" ni en "Al centavo" (D-073)',
    sin[0].estado === 'sinComparar');
  assert('su avatar dice que le falta el número', sin[0].unit === 'sin cód.');
  assert('…su badge dice por qué', /Sin código/.test(sin[0].badge.text));
  assert('…y su conclusión manda a cargarla en el Paso 2, sin inventar el código',
    /Paso 2/.test(sin[0].body.conclusion.text) && /no se inventa/.test(sin[0].body.conclusion.text));
  assert('la cuenta sin código igual muestra su desglose por concepto',
    sin[0].conceptos.length > 0 && sin[0].conciliacion.cuadra);

  const conDif = fichas.filter(f => f.estado !== 'centavo' && f.estado !== 'margen').length;
  assert('lo único marcado es la cuenta sin código, igual que el semáforo',
    conDif === s.unitsWithDiff && conDif === 1);
}

{
  // Sin el Reporte de Cuentas no hay asiento: la unidad pasa a ser la cuenta
  // distinta de la desglosada, que es la que cuenta el semáforo.
  const r = runContaDesglosada(FILAS_CONTA, [], MAPPING_CONTA);
  const s = summarizeContaDesglosada(r);
  const fichas = fichasDeCuentas(r);

  assert('sin el reporte de cuentas el asiento no se arma', r.asiento === null);
  assert('hay una ficha por cuenta distinta de la desglosada, igual que el semáforo',
    fichas.length === r.cuentasDistintas && fichas.length === s.unitsTotal);
  assert('las cuentas no tienen número todavía', fichas.every(f => f.numero === null));
  assert('el importe grande vuelve a llamarse SALDO: todavía no hay neteo que asentar',
    fichas.every(f => f.amountLabel.startsWith('SALDO')));
  assert('el desglose por concepto suma exacto igual que con asiento',
    fichas.every(f => f.conciliacion.cuadra));
  assert('la conclusión dice que falta subir el Reporte de Cuentas',
    fichas.every(f => /Reporte de Cuentas/.test(f.body.conclusion.text)));
  assert('los chips no dicen que falta un lado cuando el semáforo no lo cuenta',
    fichas.filter(f => f.estado !== 'centavo').length === s.unitsWithDiff);

  let error = null;
  for (const f of fichas) {
    try { fichaCardHtml(f); fichaBodyHtml(f.body, { id: f.id }); }
    catch (e) { error = `${f.id}: ${e.message}`; break; }
  }
  assert('las fichas de la desglosada sin asiento arman cuerpo válido', error === null, error);
}

{
  // El asiento no cierra: el entregable entero queda en revisión, y las fichas
  // dicen lo mismo que el semáforo. Se fuerza con un lado excluido a mano.
  const filas = [
    ...FILAS_CONTA,
    fila({ legajo: '1', nro: '400', concepto: 'Presentismo', importe: '500,00',
           debe: 'Sueldos Ventas', haber: 'Nada al asiento' }),
  ];
  const r = runContaDesglosada(filas, [], { ...MAPPING_CONTA, cuentas_refRows: CUENTAS_REF });
  const s = summarizeContaDesglosada(r);
  const fichas = fichasDeCuentas(r);

  assert('con un lado excluido a mano la desglosada no cierra', r.cierra === false);
  assert('todas las cuentas quedan en revisión, ninguna Al centavo',
    fichas.every(f => f.estado !== 'centavo'));
  const conDif = fichas.filter(f => f.estado !== 'centavo' && f.estado !== 'margen').length;
  assert('…y son las mismas que cuenta el semáforo con diferencia',
    conDif === s.unitsWithDiff);
  assert('la conclusión de una cuenta que cuadra manda a mirar el Resumen',
    fichas.some(f => f.conciliacion.cuadra && /Resumen/.test(f.body.conclusion.text)));
}

assert('estadoDeCuentaConta: la cuenta sin código es Sin comparar aunque todo cierre',
  estadoDeCuentaConta({ sinCodigo: true, conciliacion: { cuadra: true } }, { cierraTodo: true }) === 'sinComparar');
assert('estadoDeCuentaConta: un desglose que no suma es Con diferencia aunque todo cierre',
  estadoDeCuentaConta({ sinCodigo: false, conciliacion: { cuadra: false } }, { cierraTodo: true }) === 'conDif');

// ══════════════════════════════════════════════════════════════════════
// 5. "Dentro del margen" no aplica, y sale igual (§3)
// ══════════════════════════════════════════════════════════════════════
//
// Los dos controles cuadran al centavo contra sí mismos: no hay monto de
// diferencia del cliente que aflojar. El chip no se oculta —sacarlo movería los
// otros cuatro de lugar— así que ninguna ficha puede caer en ese estado.

{
  const rF = runFinadietAsiento(FILAS_FINADIET, [], { period: '2026-07', finadietAsientoConfig: null });
  const rC = runContaDesglosada(FILAS_CONTA, [], { ...MAPPING_CONTA, cuentas_refRows: CUENTAS_REF });
  assert('ninguna ficha del Asiento de Remuneraciones cae en "Dentro del margen"',
    fichasDeAsiento(rF).every(f => f.estado !== 'margen'));
  assert('ninguna ficha de la Contabilidad Desglosada, tampoco',
    fichasDeCuentas(rC).every(f => f.estado !== 'margen'));
}

// Que el chip salga en gris con su motivo lo verifica tests/e2e/fichasCuenta.spec.js
// en un navegador: acá se fija que ninguna ficha lo pueda encender.

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
