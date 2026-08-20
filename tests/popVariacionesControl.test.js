// popVariacionesControl.test.js — Control "Variación entre quincenas" (POP · Axton)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/popVariacionesControl.test.js
//
// Lo que asegura, en orden de qué duele más si se rompe:
//   1. **Consolidación por legajo de los DOS Tabulados** (D-042): un legajo con
//      dos liquidaciones en la misma quincena suma horas e importe ANTES de
//      dividir. Si se pisara, el valor hora de todo empleado con doble paga
//      saldría calculado sobre una sola de sus pagas.
//   2. `null` ≠ 0: sin el concepto liquidado el valor hora es `—`, no 0,00, y
//      no cuenta como "sin variación".
//   3. Alta y Baja salen de las FECHAS, no de la presencia en un archivo — el
//      caso real que el prototipo marcaba como baja inexistente.
//   4. El control contra el reporte de Axton: qué cuenta como diferencia,
//      incluido el "0 vs —" que Axton completa con cero.
//   5. Cada rama de `{ error }`, y la entrada del registry.
//
// Datos 100% inventados (legajos '1'/'2'/'3', apellidos Sanguinetti/Falcioni/Lucchetti).

globalThis.document = { addEventListener: () => {} };

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { runPopVariaciones, summarizePopVariaciones, DEFAULT_POP_VARIACIONES_CONFIG } =
  await import('./js/controls/popVariaciones.js');
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// ── Moldes de fila, como los devuelve el parser del Tabulado de Axton ─────────
// `cant_1010` / `imp_1010` son el par Cant/Imp del concepto; `neto_imp` es el
// importe del par Neto. Las claves `ingreso` / `egreso` existen porque el
// archivo trae esas columnas — cuando no las trae, el parser NO las emite, y en
// eso se apoya el caso de "columna que no está" de más abajo.
const LIQ_1RA = '1er Quincena c/sobregiro Julio 2026 (1era Quincena 07-2026) - (v)';
const LIQ_2DA = '2da Quincena c/ sobregiro Julio 2026 (2da Quincena 07-2026) - (v)';

function fila({ legajo, nombre = 'Sanguinetti Javier', cant = null, imp = null, neto = null,
                cbu = '0170099220000012345678', ingreso = '2015-09-01', egreso = null, liq = LIQ_2DA }) {
  return {
    esTotalGeneral: false, legajo, apellido_nombre: nombre, cuil: '20111111112',
    ingreso, egreso, cbu, banco: 'Banco', centro_costo: 'CC1', liquidacion: liq,
    cant_1010: cant, imp_1010: imp, neto_cant: null, neto_imp: neto,
  };
}
function totalGeneral({ cant, imp }) {
  return { esTotalGeneral: true, legajo: null, cant_1010: cant, imp_1010: imp, neto_imp: null };
}

const mappingBase = { legajoKeyMode: 'sin_ceros', period: '2026-07' };
const correr = (prev, act, extra = {}) => runPopVariaciones(prev, [], {
  ...mappingBase, tab_actRows: act, ...extra,
});

// ── 1. Coincidencia total ────────────────────────────────────────────────────

{
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, neto: 500000, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000, neto: 600000 })];
  const r = correr(prev, act);
  const f = r.rows[0];
  assert('valor hora = importe ÷ cantidad en cada quincena',
    Math.abs(f.vhAnterior - 1000) < 0.01 && Math.abs(f.vhActual - 1000) < 0.01);
  assert('mismo valor hora en las dos quincenas → MOD = N y variación 0',
    f.mod === 'N' && f.dif === 0 && f.pct === 0);
  assert('el Neto informado es el de la quincena ACTUAL', f.neto === 600000);
  assert('el CBU igual en las dos quincenas → MOD CBU = N', f.modCbu === 'N');
  assert('la quincena y el período salen del propio archivo, no del mapping',
    r.periodos.anterior.corta === '1ª quinc. 07/2026' && r.periodos.actual.corta === '2ª quinc. 07/2026');
  assert('sin el reporte de Axton el status es info y no compara nada',
    summarizePopVariaciones(r).status === 'info' && summarizePopVariaciones(r).unitsTotal === null);
}

// ── 2. Variación de valor hora ───────────────────────────────────────────────

{
  const prev = [fila({ legajo: '1', cant: 100, imp: 100000, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 100, imp: 110000 })];
  const r = correr(prev, act);
  const f = r.rows[0];
  assert('valor hora que sube → MOD = S y variación = actual − anterior',
    f.mod === 'S' && Math.abs(f.dif - 100) < 0.01);
  assert('el porcentaje se calcula sobre el valor hora anterior', Math.abs(f.pct - 10) < 0.01);
  assert('el resumen cuenta 1 legajo con variación', r.summary.conVariacion === 1);
}

// ── 3. Consolidación: un legajo con DOS liquidaciones en la misma quincena ────
//
// El bug más caro del repo (D-042). El Tabulado trae una fila por liquidación:
// este legajo cobró 40 hs por 40.000 en una y 50 hs por 50.000 en la otra. El
// valor hora es (40.000+50.000) ÷ (40+50) = 1.000. Si la última pisara a la
// primera, saldría 50.000 ÷ 50 = 1.000 igual… así que el caso se arma con
// valores hora distintos por liquidación, donde pisar SÍ cambia el resultado:
// 30 hs a 1.000 + 60 hs a 1.150 → consolidado 1.100, pisando 1.150.

{
  const prev = [fila({ legajo: '1', cant: 90, imp: 99000, liq: LIQ_1RA })];
  const act  = [
    fila({ legajo: '1', cant: 30, imp: 30000, neto: 200000 }),   // liquidación mensual
    fila({ legajo: '1', cant: 60, imp: 69000, neto: 300000 }),   // segunda paga del mismo legajo
  ];
  const r = correr(prev, act);
  const f = r.rows[0];
  assert('las horas y el importe se SUMAN entre liquidaciones antes de dividir (1.100, no 1.150)',
    Math.abs(f.vhActual - 1100) < 0.01);
  assert('el neto también se suma entre liquidaciones (200.000 + 300.000)', f.neto === 500000);
  assert('con las dos pagas sumadas el valor hora no varía contra la quincena anterior', f.mod === 'N');
  assert('el legajo cuenta UNA vez, no una por liquidación', r.rows.length === 1 && r.summary.total === 1);
}

// ── 4. `null` no es 0: sin concepto liquidado no hay valor hora ───────────────

{
  const prev = [fila({ legajo: '1', cant: null, imp: null, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000 })];
  const r = correr(prev, act);
  const f = r.rows[0];
  assert('sin el concepto liquidado el valor hora es null (se muestra «—»), no 0',
    f.vhAnterior === null);
  assert('sin los dos valores hora no hay MOD ni variación: nada se completa con 0,00',
    f.mod === '—' && f.dif === null && f.pct === null);
  assert('el legajo sin valor hora no cuenta como "sin variación"',
    r.summary.sinVariacion === 0 && r.summary.sinValorHora === 1);
}

{
  const prev = [fila({ legajo: '1', cant: 0, imp: 0, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000 })];
  assert('con 0 horas liquidadas tampoco hay valor hora (no se divide por cero)',
    correr(prev, act).rows[0].vhAnterior === null);
}

// ── 5. Alta y Baja salen de las FECHAS, no de la presencia ───────────────────
//
// El caso real de julio 2026: un legajo liquidó sólo en la 1ª quincena y no
// tiene fecha de egreso. Por presencia sería "Baja = S" y Axton no lo marca ni
// alta ni baja: no se fue, no liquidó horas.

{
  const prev = [
    fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA }),
    fila({ legajo: '2', cant: 80, imp: 80000, liq: LIQ_1RA, nombre: 'Falcioni Julio' }),
  ];
  const act = [fila({ legajo: '1', cant: 80, imp: 80000 })];
  const r = correr(prev, act);
  const soloEnAnterior = r.rows.find(x => x.legajo === '2');
  assert('un legajo que liquidó sólo en la quincena anterior y sin fecha de egreso NO es baja',
    soloEnAnterior.baja === 'N' && soloEnAnterior.alta === 'N');
  assert('…y queda listado como "sólo en una quincena"',
    soloEnAnterior.soloEn === 'anterior' && r.summary.soloAnterior === 1);
  assert('sigue apareciendo en el reporte (con valor hora sólo de la quincena que liquidó)',
    soloEnAnterior.vhAnterior !== null && soloEnAnterior.vhActual === null);
}

{
  // Ingreso y egreso DENTRO de la 2ª quincena de julio (16 al 31).
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA })];
  const act  = [
    fila({ legajo: '1', cant: 80, imp: 80000, egreso: '2026-07-20' }),
    fila({ legajo: '3', cant: 40, imp: 40000, nombre: 'Lucchetti Ema', ingreso: '2026-07-18' }),
  ];
  const r = correr(prev, act);
  assert('egreso dentro de la quincena actual → Baja = S',
    r.rows.find(x => x.legajo === '1').baja === 'S');
  assert('ingreso dentro de la quincena actual → Alta = S',
    r.rows.find(x => x.legajo === '3').alta === 'S');
  assert('el resumen cuenta la alta y la baja', r.summary.altas === 1 && r.summary.bajas === 1);
}

{
  // Ingreso en la 1ª quincena del mismo mes: NO es alta de la 2ª.
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA, ingreso: '2026-07-03' })];
  const act  = [fila({ legajo: '1', cant: 80, imp: 80000, ingreso: '2026-07-03' })];
  assert('un ingreso de la 1ª quincena no es alta de la 2ª (el rango es 16 al 31)',
    correr(prev, act).rows[0].alta === 'N');
}

{
  // El archivo sin la columna Egreso: la clave no viene en la fila.
  const sinEgreso = (o) => { const f = fila(o); delete f.egreso; return f; };
  const prev = [sinEgreso({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA })];
  const act  = [sinEgreso({ legajo: '1', cant: 80, imp: 80000 })];
  const f = correr(prev, act).rows[0];
  assert('si el Tabulado no trae la columna de egreso, Baja sale «—» y no «N»', f.baja === '—');
}

// ── 6. MOD CBU ───────────────────────────────────────────────────────────────

{
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, cbu: '0170099220000011111111', liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 80, imp: 80000, cbu: '0170099220000022222222' })];
  assert('CBU distinto entre quincenas → MOD CBU = S', correr(prev, act).rows[0].modCbu === 'S');
}
{
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, cbu: '', liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 80, imp: 80000 })];
  assert('CBU vacío en un lado → MOD CBU «—», no «N»', correr(prev, act).rows[0].modCbu === '—');
}

// ── 7. Sumas contra la fila TOTAL GENERAL ────────────────────────────────────

{
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA }), totalGeneral({ cant: 80, imp: 80000 })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000 }), totalGeneral({ cant: 90, imp: 90000 })];
  const r = correr(prev, act);
  assert('la fila TOTAL GENERAL no cuenta como un legajo más', r.summary.total === 1);
  assert('el chequeo de sumas contra el archivo da OK cuando cierra',
    r.checks.filter(c => c.label.startsWith('Concepto 1010 cierra')).every(c => c.ok));
}
{
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA }), totalGeneral({ cant: 80, imp: 99999 })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000 }), totalGeneral({ cant: 90, imp: 90000 })];
  const r = correr(prev, act);
  assert('si la suma calculada no coincide con TOTAL GENERAL, el chequeo sale en rojo',
    r.checks.some(c => c.label.includes('(anterior)') && !c.ok));
}

// ── 8. Los dos archivos en orden invertido / de la misma quincena ─────────────

{
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_2DA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000, liq: LIQ_1RA })];
  const r = correr(prev, act);
  assert('archivos en orden invertido: avisa y NO traba',
    !r.error && r.checks.some(c => c.label === 'Orden de los dos Tabulados' && !c.ok));
}
{
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_2DA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000, liq: LIQ_2DA })];
  const r = correr(prev, act);
  assert('los dos archivos de la misma quincena: avisa y NO traba',
    !r.error && r.checks.some(c => c.label === 'Orden de los dos Tabulados' && !c.ok));
}

// ── 9. El control contra el reporte de variaciones de Axton ──────────────────

const axtonRow = (o) => ({
  legajo: '1', apellido_nombre: 'Sanguinetti Javier', vh_anterior: 1000, vh_actual: 1000,
  mod: 'N', variacion: null, pct_variacion: null, mod_cbu: 'N',
  puesto_anterior: 'M100', puesto_actual: 'M100', mod_puesto: 'N',
  alta: 'N', baja: 'N', neto: 600000, ...o,
});

{
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000, neto: 600000 })];
  const r = correr(prev, act, { variacRows: [axtonRow({})] });
  const s = summarizePopVariaciones(r);
  assert('coincidencia total contra Axton: status success y 0 diferencias',
    s.status === 'success' && r.control.difs.length === 0 && r.control.comparados === 1);
  assert('la unidad del semáforo es el legajo comparado',
    s.unit === 'legajo' && s.unitsTotal === 1 && s.unitsWithDiff === 0);
}

{
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000, neto: 600000 })];
  // Axton informa el valor hora redondeado a 2 decimales: 1.000,004 no es una
  // diferencia (tolerancia 0,02) y el neto redondeado a entero tampoco (± 1).
  const r = correr(prev, act, { variacRows: [axtonRow({ vh_actual: 1000.004, neto: 600000.4 })] });
  assert('el redondeo de Axton (2 decimales en VH, entero en Neto) no es una diferencia',
    r.control.difs.length === 0);
}

{
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000, neto: 600000 })];
  const r = correr(prev, act, { variacRows: [axtonRow({ vh_actual: 1200, mod: 'S', neto: 700000 })] });
  const s = summarizePopVariaciones(r);
  assert('valor hora, MOD y Neto distintos: 3 campos con diferencia en un legajo',
    r.control.difs.length === 1 && r.control.difs[0].campos.length === 3);
  assert('con diferencias el status es warning y el legajo cuenta una vez',
    s.status === 'warning' && s.unitsWithDiff === 1);
}

{
  // Lo que Axton completa con 0 donde el Tabulado no trae neto: es una
  // diferencia a propósito ("0,00 vs —"), no un cero silencioso.
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000, neto: null })];
  const r = correr(prev, act, { variacRows: [axtonRow({ neto: 0 })] });
  const dif = r.control.difs[0]?.campos.find(c => c.campo === 'Neto');
  assert('Axton en 0 y el Tabulado sin dato SÍ es diferencia, y se muestra "0,00 vs —"',
    !!dif && dif.generado === '—');
}

{
  // El `-` de Axton (columna que no corresponde) llega como null del parser y
  // no se lee como 'N'.
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000, neto: 600000 })];
  const r = correr(prev, act, { variacRows: [axtonRow({ baja: null })] });
  const dif = r.control.difs[0]?.campos.find(c => c.campo === 'Baja');
  assert('el guión de Axton se compara como «—» y difiere de un «N» generado',
    !!dif && dif.axton === '—' && dif.generado === 'N');
}

{
  // Legajos en un solo lado: se listan, no se comparan.
  const prev = [fila({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '1', cant: 90, imp: 90000, neto: 600000 })];
  const r = correr(prev, act, { variacRows: [axtonRow({}), axtonRow({ legajo: '9' })] });
  assert('un legajo que está en el reporte de Axton y no en los Tabulados se lista aparte',
    r.control.soloAxton.length === 1 && r.control.comparados === 1);
}

{
  // '007' y '7' son el mismo empleado con la clave por default del cliente.
  const prev = [fila({ legajo: '007', cant: 80, imp: 80000, liq: LIQ_1RA })];
  const act  = [fila({ legajo: '7',   cant: 80, imp: 80000, neto: 600000 })];
  const r = correr(prev, act, { variacRows: [axtonRow({ legajo: '0007' })] });
  assert('los ceros a la izquierda no parten un legajo en dos ni en el cruce ni contra Axton',
    r.rows.length === 1 && r.control.comparados === 1 && r.control.soloAxton.length === 0);
}

// ── 10. Las ramas de error ───────────────────────────────────────────────────

{
  const act = [fila({ legajo: '1', cant: 90, imp: 90000 })];
  assert('sin el Tabulado de la quincena anterior: error de negocio, no excepción',
    /anterior/i.test(correr([], act).error || ''));
  assert('sin el Tabulado de la quincena actual: error de negocio',
    /actual/i.test(correr(act, []).error || ''));
  assert('sin código de concepto: error que dice dónde completarlo',
    /Concepto del valor hora/.test(correr(act, act, { popVariacionesConfig: { valorHoraCode: '' } }).error || ''));
  const rSinConcepto = correr(act, act, { popVariacionesConfig: { valorHoraCode: '9999' } });
  assert('con un código que no está en los archivos: error que nombra el código',
    /9999/.test(rSinConcepto.error || ''));
  assert('un error de negocio se resume como status error, sin unidad que contar',
    summarizePopVariaciones(rSinConcepto).status === 'error'
    && summarizePopVariaciones(rSinConcepto).unitsTotal === null);
}

// ── 11. El código de concepto es configurable por cliente (D-035/D-039) ──────

{
  const fila2000 = (o) => {
    const f = fila(o);
    f.cant_2000 = f.cant_1010; f.imp_2000 = f.imp_1010;
    delete f.cant_1010; delete f.imp_1010;
    return f;
  };
  const prev = [fila2000({ legajo: '1', cant: 80, imp: 80000, liq: LIQ_1RA })];
  const act  = [fila2000({ legajo: '1', cant: 90, imp: 90000 })];
  const r = correr(prev, act, { popVariacionesConfig: { valorHoraCode: '2000' } });
  assert('el valor hora se puede derivar de otro código si el cliente renumeró',
    !r.error && Math.abs(r.rows[0].vhActual - 1000) < 0.01 && r.conceptCode === '2000');
  assert('la semilla del módulo sigue siendo 1010', DEFAULT_POP_VARIACIONES_CONFIG.valorHoraCode === '1010');
}

// ── 12. La entrada del registry ──────────────────────────────────────────────

{
  const c = CONTROL_REGISTRY.pop_variaciones;
  assert('el control está en el registry', !!c);
  assert('no usa el Tabulado como pivote', c.tabRequired === false);
  assert('el primer archivo es el Tabulado de la quincena anterior',
    c.additionalFiles[0].key === 'tab_prev' && c.additionalFiles[0].fileType === 'tab_axton_prev_file');
  assert('el segundo es el Tabulado de la quincena actual',
    c.additionalFiles[1].key === 'tab_act' && c.additionalFiles[1].fileType === 'tab_axton_file');
  assert('el reporte de Axton es el tercero y es opcional',
    c.additionalFiles[2].key === 'variac' && c.additionalFiles[2].optional === true);
  assert('se ofrece sólo a POP', c.scope === 'cliente' && c.scopeMeta.clients.join() === 'POP');
  assert('la config del concepto le llega al control por mappingKey',
    c.config[0].mappingKey === 'popVariacionesConfig');
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
