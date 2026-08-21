// catXEmpleadosControl.test.js — Test del control "EE x CATEG"
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/catXEmpleadosControl.test.js
//
// Cubre summary.tabTotal/summary.diff: el Tabulado trae una fila por
// liquidación, no por empleado — un legajo con doble liquidación en el mes
// contaba dos veces (tabRows.length) en vez de una (tabByEmp.size), dando un
// "−1" permanente aunque el control diga que todo coincide.
//
// Datos 100% inventados (legajos '1'/'2', apellidos Sanguinetti/Falcioni).

globalThis.document = { addEventListener: () => {} };

const { runCatXEmpleados, summarizeCatXEmpleados, buildFichasCatXEmpleados } = await import('./js/controls/catXEmpleados.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle ? `\n    ${detalle}` : ''); fail++; }
}

const mapping = {
  cat: { idEmpColumn: 'Legajo', apellidoColumn: 'Apellido', nombreColumn: 'Nombre', fBajaColumn: 'F_BAJA' },
  tab: { empleadoColumn: 'Legajo', apellidoNombreColumn: 'Apellido y Nombre' },
};

// ── Caso base: 1 fila del Tabulado por empleado, todo coincide ──────────────

const catBase = [
  { Legajo: '1', Apellido: 'Sanguinetti', Nombre: 'Javier' },
  { Legajo: '2', Apellido: 'Falcioni', Nombre: 'Julio' },
];
const tabBase = [
  { Legajo: '1', 'Apellido y Nombre': 'Sanguinetti Javier' },
  { Legajo: '2', 'Apellido y Nombre': 'Falcioni Julio' },
];
const rBase = runCatXEmpleados(catBase, tabBase, mapping);
assert('caso base: tabTotal cuenta 2 empleados', rBase.summary.tabTotal === 2);
assert('caso base: diff es 0 (coinciden)', rBase.summary.diff === 0);
assert('caso base: summarize da status success', summarizeCatXEmpleados(rBase).status === 'success');

// ── El bug real: un legajo con DOS liquidaciones en el Tabulado ─────────────
//
// 2 empleados en Rep. Categ., 2 empleados reales en el Tabulado — pero el
// legajo 1 tiene dos filas (dos liquidaciones el mismo mes). Antes del fix,
// tabTotal contaba 3 (filas crudas) y diff salía en −1 aunque los dos
// archivos coincidan en cantidad de EMPLEADOS.

const tabDoble = [
  { Legajo: '1', 'Apellido y Nombre': 'Sanguinetti Javier' },
  { Legajo: '1', 'Apellido y Nombre': 'Sanguinetti Javier' },   // segunda liquidación del mismo legajo
  { Legajo: '2', 'Apellido y Nombre': 'Falcioni Julio' },
];
const rDoble = runCatXEmpleados(catBase, tabDoble, mapping);
assert('con doble liquidación del mismo legajo, tabTotal sigue contando 2 empleados (no 3 filas)',
  rDoble.summary.tabTotal === 2);
assert('con doble liquidación, diff es 0 — no "−1" con todo coincidiendo',
  rDoble.summary.diff === 0);
assert('summarize() da success, no un headline con diferencia neta falsa',
  summarizeCatXEmpleados(rDoble).status === 'success');

// ── Diferencia real: falta un empleado de verdad en el Tabulado ─────────────

const tabFaltante = [
  { Legajo: '1', 'Apellido y Nombre': 'Sanguinetti Javier' },
];
const rFaltante = runCatXEmpleados(catBase, tabFaltante, mapping);
assert('diferencia real (falta legajo 2 en el Tabulado): diff es +1',
  rFaltante.summary.diff === 1);
assert('el legajo faltante se lista en missingInTab',
  rFaltante.missingInTab.some(m => m.id === '2'));

// ══════════════════════════════════════════════════════════════════════
// La ficha por legajo y la matriz campo × legajo
// ══════════════════════════════════════════════════════════════════════
//
// Lo que fija: que un legajo con varios campos mal salga UNA vez y no una por
// campo, que "sin comparar" no se lea nunca como cero, y que la matriz sepa
// distinguir un campo que falla en toda la nómina de uno que falla en dos
// legajos — que es la pregunta que la solapa "Por campo" viene a contestar.
//
// Datos inventados: legajos '1' a '6' y jugadores de Banfield.

const mappingCampos = {
  cat: {
    idEmpColumn: 'Legajo', apellidoColumn: 'Apellido', nombreColumn: 'Nombre',
    puestoColumn: 'Puesto', centroCostoColumn: 'CC', departamentoColumn: 'Depto',
    fBajaColumn: 'F_BAJA',
  },
  tab: {
    empleadoColumn: 'Legajo', apellidoNombreColumn: 'Apellido y Nombre',
    puestoColumn: 'Puesto', ccColumn: 'CC', deptoColumn: 'Depto',
  },
};

const PLANTEL = [
  ['1', 'Sanguinetti', 'Javier'],
  ['2', 'Albella',     'Gustavo'],
  ['3', 'Falcioni',    'Julio Cesar'],
  ['4', 'Silva',       'Santiago'],
  ['5', 'Lucchetti',   'Cristian'],
  ['6', 'Erviti',      'Walter'],
];

// El centro de costo se renombró en el sistema y NO en el Tabulado: no coincide
// en 5 de 6 legajos — eso es una carga masiva. El puesto, en cambio, falla en
// dos, y uno de esos dos es el único campo que ese legajo tiene mal: ahí sí hay
// que ir a mirar al empleado.
const catCampos = PLANTEL.map(([id, ap, no], i) => ({
  Legajo: id, Apellido: ap, Nombre: no,
  Puesto: (i === 0 || i === 3) ? 'SUPERVISOR' : 'ANALISTA',
  CC: i === 0 ? 'ADMINISTRACION' : 'ADMINISTRACION CENTRAL',
  Depto: 'SOPORTE',
  F_BAJA: '',
}));
const tabCampos = PLANTEL.map(([id, ap, no]) => ({
  Legajo: id, 'Apellido y Nombre': `${ap} ${no}`,
  Puesto: 'ANALISTA', CC: 'ADMINISTRACION', Depto: 'SOPORTE',
}));

const rCampos = runCatXEmpleados(catCampos, tabCampos, mappingCampos);

assert('un legajo con dos campos distintos aparece UNA vez, con sus dos diffs',
  rCampos.fieldDiscrepancies.filter(e => e.id === '4').length === 1
  && rCampos.fieldDiscrepancies.find(e => e.id === '4').diffs.length === 2);

assert('la ficha guarda TODOS los campos, no sólo los que difieren',
  rCampos.fieldDiscrepancies.find(e => e.id === '4').campos.length === 3);

assert('y cada campo dice si coincide o difiere',
  rCampos.fieldDiscrepancies.find(e => e.id === '4').campos
    .filter(c => c.estado === 'coincide').length === 1);

const porCampo = new Map(rCampos.byField.map(f => [f.key, f]));

assert('la matriz cuenta, por campo, en cuántos legajos no coincide',
  porCampo.get('CENTRO_COSTO').difieren === 5
  && porCampo.get('PUESTO').difieren === 2
  && porCampo.get('DEPTO').difieren === 0);

assert('…y en cuántos sí, sobre los legajos que están en los dos archivos',
  porCampo.get('CENTRO_COSTO').comparados === 6
  && porCampo.get('CENTRO_COSTO').coinciden === 1);

assert('el campo que falla en casi toda la nómina se marca como carga masiva',
  porCampo.get('CENTRO_COSTO').masivo === true);

assert('…y el que falla en dos, no: un cliente chico no convierte dos casos en una carga masiva',
  porCampo.get('PUESTO').masivo === false);

assert('la matriz sale ordenada de peor a mejor',
  rCampos.byField.map(f => f.key).join(',') === 'CENTRO_COSTO,PUESTO,DEPTO',
  rCampos.byField.map(f => `${f.key}:${f.difieren}`).join(' '));

// ── Un campo que no se puede comparar no se completa con "coincide" ─────────

const sinDepto = {
  cat: { ...mappingCampos.cat, departamentoColumn: null },
  tab: mappingCampos.tab,
};
const rSinDepto = runCatXEmpleados(catCampos, tabCampos, sinDepto);
const deptoSin = rSinDepto.byField.find(f => f.key === 'DEPTO');

assert('un campo sin columna de un lado sale como no comparable, no como coincidente',
  deptoSin.comparable === false && deptoSin.comparados === 0 && deptoSin.coinciden === 0);

assert('…y sus legajos quedan todos en "sin comparar"',
  deptoSin.sinComparar === rSinDepto.universo);

// ── Las fichas ─────────────────────────────────────────────────────────────

const fichas = buildFichasCatXEmpleados(rCampos);

assert('hay una ficha por legajo con algo para revisar, no una por campo',
  fichas.length === rCampos.fieldDiscrepancies.length
    + rCampos.missingInTab.length + rCampos.missingInCat.length);

const f4 = fichas.find(f => f.id === '4');
assert('la ficha cerrada dice el legajo, el nombre y cuántos campos no coinciden',
  f4.id === '4' && f4.name === 'Silva Santiago' && f4.amount === '2'
  && f4.badge.text === '2 campos no coinciden', JSON.stringify({ id: f4.id, name: f4.name, amount: f4.amount }));

assert('la tira de conciliación es el conteo de campos, y cierra: 3 − 0 − 1 = 2',
  f4.body.strip.map(p => p.value).join(',') === '3,0,3,1,2',
  f4.body.strip.map(p => `${p.label}=${p.value}`).join(' · '));

assert('la última pastilla antes del residuo va invertida y el residuo es lo que no coincide',
  f4.body.strip[3].invert === true && f4.body.strip[4].residuo === true);

assert('abierta trae un renglón por campo con el valor de cada lado',
  f4.body.detail.rows.length === 3
  && f4.body.detail.rows.some(r => r.campo === 'Puesto' && r.cat === 'SUPERVISOR' && r.tab === 'ANALISTA'));

assert('y el renglón que difiere queda marcado, el que coincide no',
  f4.body.detail.rows.find(r => r.campo === 'Departamento').tone === 'pos'
  && f4.body.detail.rows.find(r => r.campo === 'Puesto').tone === 'neg');

assert('la conclusión distingue el campo de toda la nómina del de este empleado',
  /toda la nómina y uno de este empleado/.test(f4.body.conclusion.title),
  f4.body.conclusion.title);

// El legajo 1 tiene mal SÓLO el puesto, que falla en dos legajos de seis.
const f1 = fichas.find(f => f.id === '1');
assert('el legajo cuyo único campo distinto casi no falla en el resto dice que es de ese empleado',
  /^Es de este empleado/.test(f1.body.conclusion.title), f1.body.conclusion.title);

// El legajo 2 tiene mal SÓLO el centro de costo, que falla en cinco de seis.
const f2 = fichas.find(f => f.id === '2');
assert('…y el que sólo tiene mal el campo que falla en toda la nómina dice que NO es de ese empleado',
  /^No parece de este empleado/.test(f2.body.conclusion.title), f2.body.conclusion.title);

assert('ese legajo lleva la marca de carga masiva, que es el segundo eje del filtro',
  f2.masivo === true && f2.marks.some(m => /carga masiva/.test(m.text)));

assert('y el que es puntual no la lleva',
  f1.masivo === false && f1.marks.length === 0);

// ── El legajo que está en un solo archivo ──────────────────────────────────

const rAusente = runCatXEmpleados(catCampos, tabCampos.slice(0, 5), mappingCampos);
const fAusente = buildFichasCatXEmpleados(rAusente).find(f => f.id === '6');

assert('el legajo que está en un archivo y no en el otro tiene su ficha',
  Boolean(fAusente) && fAusente.estado === 'sinComparar');

assert('y su "no coinciden" es "—", nunca 0: no se pudo saber, no se lee como aprobado',
  fAusente.amount === null && fAusente.difieren === null
  && fAusente.body.strip[4].value === '—', JSON.stringify(fAusente.body.strip));

assert('sus tres campos quedan sin comparar, con el valor del lado que sí lo tiene',
  fAusente.body.detail.rows.every(r => r.estado === 'Sin comparar')
  && fAusente.body.detail.rows.find(r => r.campo === 'Puesto').tab === '—');

// ── Una corrida vieja, guardada en la base antes de esta versión ───────────
//
// Las corridas se guardan y se vuelven a dibujar tal cual. Una guardada antes
// sólo tiene los campos que NO coincidían: con eso no se puede armar la ficha
// sin inventar los que sí coincidían, así que no se arma ninguna (y la pantalla
// no ofrece esas dos solapas).

const corridaVieja = {
  summary: { catActivos: 2, tabTotal: 2, missingInTabCount: 0, missingInCatCount: 0, fieldDiscrepancyCount: 1 },
  missingInTab: [], missingInCat: [],
  fieldDiscrepancies: [{ id: '1', apellido: 'Sanguinetti', nombre: 'Javier',
    diffs: [{ field: 'PUESTO', cat: 'ANALISTA', tab: 'ANALISTA SR' }] }],
};
assert('una corrida guardada antes de esta versión no rompe la pantalla: no arma fichas',
  buildFichasCatXEmpleados(corridaVieja).length === 0);

// ── El semáforo no lo toca nada de esto ────────────────────────────────────

const sCampos = summarizeCatXEmpleados(rCampos);
assert('la unidad del semáforo sigue siendo el legajo',
  sCampos.unit === 'legajo');

assert('y unitsWithDiff sigue contando legajos, no campos ni filas de la planilla',
  sCampos.unitsWithDiff === rCampos.summary.missingInTabCount
    + rCampos.summary.missingInCatCount + rCampos.summary.fieldDiscrepancyCount
  && sCampos.unitsWithDiff === 6,
  String(sCampos.unitsWithDiff));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
