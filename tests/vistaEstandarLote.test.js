// vistaEstandarLote.test.js — En qué estado cerró cada fila, en los controles
// del lote Axton/general (tanda 3 de specs/vista-estandar-resultados.md).
//
// Los cinco chips de la barra son los mismos en las 21 pantallas, pero **quién
// cae en cuál lo decide cada control**, y ahí es donde se puede mentir sin que
// se note: un chip que cuenta distinto de lo que cuenta el semáforo, o un
// "Al centavo" puesto sobre algo que nunca se comparó (D-073). Estas reglas son
// las tres que más fácil se rompen, así que se escriben como assert.
//
// Lo que necesita un navegador (que la barra se dibuje, que los chips filtren,
// que la planilla agrupe en bandas) se mira en tests/e2e/vistaEstandarLote.spec.js.
//
// Datos 100% inventados. Correr desde la raíz del proyecto:
//   node --input-type=module < tests/vistaEstandarLote.test.js

globalThis.document = { addEventListener: () => {} };

const { estadoDeLegajo } = await import('./js/controls/agrupadores.js');
const { estadoDeNovedad } = await import('./js/controls/novedadesLiquidacion.js');
const { estadoDePop } = await import('./js/controls/popVariaciones.js');
const { ESTADOS_DE_CASO } = await import('./js/ui/tableTools.js');

let ok = 0, fail = 0;
function assert(desc, val, detalle) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc, detalle ? `\n    ${detalle}` : ''); fail++; }
}

// ══════════════════════════════════════════════════════════════════════
// 1. Agrupadores — los chips leen el umbral PROPIO del control (D-069)
// ══════════════════════════════════════════════════════════════════════
//
// El monto, el porcentaje y "marcar los que faltan" se editan juntos en el panel
// del Paso 2 y ya están resueltos en `tieneDiff`. El chip "Con diferencia" tiene
// que leer eso y no el monto de diferencia del cliente, que acá no manda.

const GRUPOS = [{ id: 1, name: 'Sueldo' }, { id: 2, name: 'Cargas sociales' }];

/** Un legajo de la planilla de Agrupadores, con una fila de cruce por agrupador. */
const legajo = (porGrupo, extra = {}) => ({
  legajo: '1', nombre: 'SANGUINETTI, JAVIER',
  soloEnNomina: false, soloEnResumen: false,
  porGrupo, ...extra,
});
const cruce = (diffAbs, tieneDiff) => ({ diffAbs, tieneDiff });

assert('coincide exacto en los dos agrupadores → Al centavo',
  estadoDeLegajo(legajo({ 1: cruce(0, false), 2: cruce(0, false) }), GRUPOS) === 'centavo');

assert('0,004 de diferencia (el redondeo de Excel) sigue siendo Al centavo',
  estadoDeLegajo(legajo({ 1: cruce(0.004, false), 2: cruce(0, false) }), GRUPOS) === 'centavo');

assert('$ 0,60 abajo del umbral del cliente → Dentro del margen, no Con diferencia',
  estadoDeLegajo(legajo({ 1: cruce(0.6, false), 2: cruce(0, false) }), GRUPOS) === 'margen');

assert('el agrupador que el control marcó (`tieneDiff`) manda: Con diferencia',
  estadoDeLegajo(legajo({ 1: cruce(0, false), 2: cruce(150, true) }), GRUPOS) === 'conDif');

// El umbral porcentual dispara con un monto chiquito: el chip lo tiene que
// respetar igual, porque es la regla que el analista configuró.
assert('un monto chico que rompe el umbral PORCENTUAL también es Con diferencia',
  estadoDeLegajo(legajo({ 1: cruce(0.4, true), 2: cruce(0, false) }), GRUPOS) === 'conDif');

assert('el legajo que está sólo en la Nómina no se aprueba ni se acusa: Sin comparar',
  estadoDeLegajo(legajo({ 1: cruce(1500, true), 2: cruce(200, true) }, { soloEnNomina: true }), GRUPOS)
    === 'sinComparar');

assert('…y el que está sólo en el Resumen, igual',
  estadoDeLegajo(legajo({ 1: cruce(-900, true) }, { soloEnResumen: true }), GRUPOS) === 'sinComparar');

// ══════════════════════════════════════════════════════════════════════
// 2. Novedades vs Liquidación — las cuatro bandas del cruce → los cinco chips
// ══════════════════════════════════════════════════════════════════════

const novedad = (o) => ({ difCantidad: 0, difImporte: 0, ...o });

assert('la banda "difiere" es Con diferencia',
  estadoDeNovedad(novedad({ banda: 'difiere', difImporte: 2000 })) === 'conDif');

assert('la que coincide al centavo es Al centavo',
  estadoDeNovedad(novedad({ banda: 'coincide' })) === 'centavo');

assert('la que coincide pero quedó abajo del monto del cliente es Dentro del margen',
  estadoDeNovedad(novedad({ banda: 'coincide', difImporte: 45 })) === 'margen');

assert('una diferencia de cantidad de 0,5 tampoco es "al centavo"',
  estadoDeNovedad(novedad({ banda: 'coincide', difCantidad: 0.5 })) === 'margen');

assert('lo no comparable es Sin comparar, nunca aprobado (D-070/D-073)',
  estadoDeNovedad(novedad({ banda: 'no_comparable', difImporte: null, difCantidad: null })) === 'sinComparar');

assert('lo que no tiene contraparte también es Sin comparar',
  estadoDeNovedad(novedad({ banda: 'sin_contraparte', difImporte: null, difCantidad: null })) === 'sinComparar');

// ══════════════════════════════════════════════════════════════════════
// 3. POP — sin el reporte de Axton no se comparó nada
// ══════════════════════════════════════════════════════════════════════
//
// Este control genera un reporte y, si el analista carga el de Axton, lo cotEja
// contra él. La variación de valor hora NO es un estado: es lo que el reporte
// informa. Sin ese archivo, todas las filas salen en "Sin comparar" — que es la
// verdad, y es lo único que impide leer "generado" como "controlado".

const conCtrl = { control: {}, conDifAxton: new Set(['7']), soloGenerado: new Set(['9']) };
const sinCtrl = { control: null, conDifAxton: new Set(), soloGenerado: new Set() };

assert('sin el reporte de Axton, un legajo con variación igual sale Sin comparar',
  estadoDePop({ legajo: '3', mod: 'S' }, sinCtrl) === 'sinComparar');

assert('con el reporte cargado, el legajo que difiere es Con diferencia',
  estadoDePop({ legajo: '7' }, conCtrl) === 'conDif');

assert('el que coincide campo a campo es Al centavo',
  estadoDePop({ legajo: '1' }, conCtrl) === 'centavo');

assert('el que está en los Tabulados y no en el reporte de Axton es Sin comparar',
  estadoDePop({ legajo: '9' }, conCtrl) === 'sinComparar');

// ══════════════════════════════════════════════════════════════════════
// 4. Los tres controles hablan el mismo idioma
// ══════════════════════════════════════════════════════════════════════

const devueltos = [
  estadoDeLegajo(legajo({ 1: cruce(0, false) }), GRUPOS),
  estadoDeNovedad(novedad({ banda: 'difiere', difImporte: 1 })),
  estadoDePop({ legajo: '1' }, conCtrl),
];
assert('ningún control inventa un estado que la barra no sepa dibujar',
  devueltos.every(e => ESTADOS_DE_CASO.includes(e)),
  devueltos.join(' · '));

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
