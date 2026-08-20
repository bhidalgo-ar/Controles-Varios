// Contrato de Novedades vs Liquidación (N2 de specs/familia-novedades-axton.md,
// D-070), escrito como asserts ejecutables.
//
// Va por los parsers reales —expNovParser, tabAxtonReader y
// totalesConceptoParser— y no por filas fabricadas a mano: lo que se está
// fijando es el cruce sobre lo que esos lectores efectivamente emiten.
//
// TODOS los datos son inventados: legajos '1', '2', '3', '007', y los apellidos
// salen de la lista de jugadores de Banfield de CLAUDE.md. Un export de cliente
// no entra al repo ni como fixture.

globalThis.document = { addEventListener: () => {} };

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

import * as XLSXmod from 'xlsx';
globalThis.XLSX = XLSXmod;

const { parseExpNov } = await import('./js/parsers/expNovParser.js');
const { readTabAxton } = await import('./js/parsers/tabAxtonReader.js');
const { readTotalesConcepto } = await import('./js/parsers/totalesConceptoParser.js');
const {
  runNovedadesLiquidacion, summarizeNovedadesLiquidacion,
  claveConcepto, buildCrucePlano, DEFAULT_NOV_LIQ_CONFIG,
} = await import('./js/controls/novedadesLiquidacion.js');
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
const { computeSemaforoStatus } = await import('./js/controls/semaforo.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else { console.error('✗', desc); fail++; }
}

/** Arma un .xlsx en memoria a partir de filas crudas y el nombre de la hoja. */
function xlsxDe(sheetName, aoa) {
  const wb = XLSXmod.utils.book_new();
  XLSXmod.utils.book_append_sheet(wb, XLSXmod.utils.aoa_to_sheet(aoa), sheetName);
  return XLSXmod.write(wb, { type: 'array', bookType: 'xlsx' });
}

const HOJA_NOV = 'd  axFiles HidalgoExpNov_1132_2';
const HOJA_TAB = 'Liquidaciones.20260731.101122.3';
const HOJA_TOT = 'totalesconcepto.20260731.1011';

/** El importador de novedades: legajo, nombre y una columna por concepto. */
function importador(aoa) {
  return xlsxDe(HOJA_NOV, aoa);
}

/** El Tabulado de Axton con pares Cant/Imp. */
function tabuladoConCantidades(conceptos, filas, totalGeneral) {
  const enc = ['Legajo', 'Apellido y Nombres', 'Liquidacion'];
  const sub = ['', '', ''];
  for (const c of conceptos) { enc.push(c, ''); sub.push('Cant', 'Imp'); }
  enc.push('Neto', '');
  sub.push('Cant', 'Imp');
  return xlsxDe(HOJA_TAB, [enc, sub, ...filas, totalGeneral]);
}

/** El Tabulado de Axton en la variante sólo importes (SIASA). */
function tabuladoSoloImportes(conceptos, filas, totalGeneral) {
  const enc = ['Legajo', 'Apellido y Nombres'];
  const sub = ['', ''];
  for (const c of conceptos) { enc.push(c); sub.push('Imp'); }
  enc.push('Neto');
  sub.push('Imp');
  return xlsxDe(HOJA_TAB, [enc, sub, ...filas, totalGeneral]);
}

/** Corre el control como lo hace el wizard: cada archivo con sus Rows y su Meta. */
function correr({ nov, tab, tot = null, config = {}, legajoKeyMode, period = '2026-07' }) {
  const n = parseExpNov(nov);
  const t = readTabAxton(tab);
  const c = tot ? readTotalesConcepto(tot) : null;
  return runNovedadesLiquidacion(n.parsedRows, [], {
    period,
    legajoKeyMode,
    novLiqConfig: { ...DEFAULT_NOV_LIQ_CONFIG(), ...config },
    importador: {}, importadorRows: n.parsedRows, importadorMeta: n.parseMetadata,
    tabAxton: {}, tabAxtonRows: t.parsedRows, tabAxtonMeta: t.parseMetadata,
    ...(c ? { totalizador: {}, totalizadorRows: c.parsedRows, totalizadorMeta: c.parseMetadata } : {}),
  });
}

const filaDe = (res, legajo, codigo) =>
  res.filas.find(f => f.legajo === legajo && f.codigo === codigo);

// ── 1. La entrada del registry ───────────────────────────────────────────────
{
  const ctrl = CONTROL_REGISTRY.novedades_liquidacion;
  assert('el control está en el registry', !!ctrl);
  assert('es scope "sistema" de Axton',
    ctrl.scope === 'sistema' && ctrl.scopeMeta.sourceSystems.join(',') === 'axton');
  assert('no pide el Tabulado por el casillero principal: entra como archivo adicional',
    ctrl.tabRequired === false);
  assert('pide el importador de novedades como archivo primario',
    ctrl.additionalFiles[0].key === 'importador'
    && ctrl.additionalFiles[0].fileType === 'f2_cruce_file');
  assert('pide el Tabulado de Axton leído con el lector tolerante',
    ctrl.additionalFiles[1].key === 'tabAxton'
    && ctrl.additionalFiles[1].fileType === 'tab_axton_cruce_file');
  assert('pide el reporte de Totales de Concepto, y no como opcional',
    ctrl.additionalFiles[2].key === 'totalizador'
    && ctrl.additionalFiles[2].fileType === 'totales_concepto_cruce_file'
    && !ctrl.additionalFiles[2].optional);
  assert('es un control de "Controlar" con grupo propio, no una variante del generador',
    ctrl.group.id === 'novedades_liquidacion' && ctrl.group.mode === 'Controlar' && ctrl.group.primary === true);
  assert('su config viaja al run() como novLiqConfig',
    ctrl.config[0].mappingKey === 'novLiqConfig');
  assert('no declara ownTolerance: el importe mide con el monto de diferencia del cliente (D-069)',
    ctrl.ownTolerance === undefined);
  assert('el default de la config es una función que devuelve copia nueva',
    typeof ctrl.config[0].default === 'function'
    && ctrl.config[0].default() !== ctrl.config[0].default());
}

// ── 2. Caso base: la novedad se liquidó igual ────────────────────────────────
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1000', '1100'],
      ['1', 'Sanguinetti', '30$150000', '5$8000'],
      ['2', 'Falcioni', '30$120000', null],
    ]),
    tab: tabuladoConCantidades(
      ['1000 - Sueldo Basico', '1100 - Horas Extras'],
      [
        ['1', 'Sanguinetti', 'Mensual', 30, 150000, 5, 8000, 1, 158000],
        ['2', 'Falcioni', 'Mensual', 30, 120000, null, null, 1, 120000],
      ],
      ['TOTAL GENERAL', null, null, 60, 270000, 5, 8000, 2, 278000],
    ),
  });

  assert('no da error', !res.error);
  assert('cruzó los 3 pares que existen', res.summary.pares === 3);
  assert('los 3 coinciden', res.summary.coincide === 3 && res.summary.difiere === 0);
  assert('cuenta 2 legajos, no 3 filas de cruce', res.summary.legajos === 2);
  const s = summarizeNovedadesLiquidacion(res);
  assert('la unidad del semáforo es el legajo, en minúscula', s.unit === 'legajo');
  assert('unitsTotal son los legajos y unitsWithDiff cero',
    s.unitsTotal === 2 && s.unitsWithDiff === 0);
  assert('el semáforo sale verde por computeSemaforoStatus',
    computeSemaforoStatus(s.unitsWithDiff, s.unitsTotal) === 'ok');
  assert('el status crudo es success', s.status === 'success');
  assert('el contexto dice cuántas de cuántas se comparó',
    s.contextNote === 'se comparó 3 de 3 novedades');
}

// ── 3. Diferencia de importe y de cantidad, cada una por su lado ─────────────
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1000', '1100'],
      ['1', 'Sanguinetti', '30$150000', '5$8000'],
    ]),
    tab: tabuladoConCantidades(
      ['1000 - Sueldo Basico', '1100 - Horas Extras'],
      [['1', 'Sanguinetti', 'Mensual', 30, 149000, 8, 8000, 1, 157000]],
      ['TOTAL GENERAL', null, null, 30, 149000, 8, 8000, 1, 157000],
    ),
  });

  const sueldo = filaDe(res, '1', '1000');
  const extras = filaDe(res, '1', '1100');
  assert('la diferencia de importe es novedad menos liquidación', sueldo.difImporte === 1000);
  assert('el importe que difiere cae en la banda "difiere"', sueldo.banda === 'difiere');
  assert('la cantidad coincide y no ensucia la fila', sueldo.difCantidad === 0);
  assert('3 horas de diferencia caen en "difiere" aunque el importe cierre',
    extras.difCantidad === -3 && extras.difImporte === 0 && extras.banda === 'difiere');
  assert('el legajo se cuenta una sola vez aunque difieran dos conceptos',
    res.summary.legajosConDiferencia === 1);
  const s = summarizeNovedadesLiquidacion(res);
  assert('el importe total de diferencia sale del importe, no de la cantidad',
    Math.abs(s.diffTotalAmount - 1000) < 0.001);
  assert('el peor caso nombra legajo y concepto',
    s.worstCase && s.worstCase.label.includes('Legajo 1') && s.worstCase.label.includes('1000'));
}

// ── 4. Doble liquidación: el Tabulado se SUMA, no se pisa (D-042) ────────────
// El bug más caro del repo: un legajo con la mensual y la baja del mismo mes
// aparece dos veces en el Tabulado. Si la segunda fila pisa a la primera, salen
// diferencias falsas en todo empleado con doble paga.
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1000'],
      ['1', 'Sanguinetti', '45$225000'],
    ]),
    tab: tabuladoConCantidades(
      ['1000 - Sueldo Basico'],
      [
        ['1', 'Sanguinetti', 'Mensual', 30, 150000, 1, 150000],
        ['1', 'Sanguinetti', 'Baja', 15, 75000, 1, 75000],
      ],
      ['TOTAL GENERAL', null, null, 45, 225000, 2, 225000],
    ),
  });

  const f = filaDe(res, '1', '1000');
  assert('las dos liquidaciones del legajo se suman: 150000 + 75000',
    f.liqImporte === 225000 && f.liqCantidad === 45);
  assert('sumando, el par coincide (si se pisara daría 150000 y una diferencia falsa)',
    f.banda === 'coincide' && f.difImporte === 0);
  assert('la fila declara cuántas liquidaciones se sumaron', f.tabLiquidaciones === 2);
  assert('el legajo con doble paga se cuenta como UNO', res.summary.legajos === 1);
}

// ── 5. La clave de legajo es la del cliente (D-038) ──────────────────────────
{
  const nov = importador([
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['007', 'Albella', '30$150000'],
  ]);
  const tab = tabuladoConCantidades(
    ['1000 - Sueldo Basico'],
    [['7', 'Albella', 'Mensual', 30, 150000, 1, 150000]],
    ['TOTAL GENERAL', null, null, 30, 150000, 1, 150000],
  );

  const sinCeros = correr({ nov, tab });
  assert('por default "007" y "7" son el mismo empleado y el par coincide',
    sinCeros.summary.coincide === 1 && sinCeros.summary.sinContraparte === 0);

  const trim = correr({ nov, tab, legajoKeyMode: 'trim' });
  assert('con legajoKeyMode "trim" son dos empleados distintos',
    trim.summary.coincide === 0 && trim.summary.sinContraparte === 2);
  assert('y el del importador sale como novedad sin liquidar',
    trim.filas.some(f => f.legajo === '007' && f.lado === 'solo_novedad'));
  assert('y el de la liquidación sale como liquidado sin novedad',
    trim.filas.some(f => f.legajo === '7' && f.motivo === 'liquidado_sin_novedad'));
}

// ── 6. Tabulado sólo-importes: la cantidad no se compara ni se inventa ───────
// D-065: en la variante axton_imp las claves cant_<codigo> no existen. Una
// novedad en cantidad contra ese archivo es NO COMPARABLE, nunca una diferencia
// de 30 contra cero.
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1000', '1200'],
      ['1', 'Sanguinetti', '30$150000', 12],
    ]),
    tab: tabuladoSoloImportes(
      ['1000 - Sueldo Basico', '1200 - Adicional'],
      [['1', 'Sanguinetti', 150000, 3000, 153000]],
      ['TOTAL GENERAL', null, 150000, 3000, 153000],
    ),
  });

  assert('el control sabe que el Tabulado no trae cantidades', res.cantidadesEnTabulado === false);
  const sueldo = filaDe(res, '1', '1000');
  assert('el concepto con importe en los dos lados se compara por importe',
    sueldo.banda === 'coincide' && sueldo.difImporte === 0);
  assert('sin cantidad liquidada, la diferencia de cantidad es null y no cero',
    sueldo.difCantidad === null && sueldo.liqCantidad === null);
  assert('comparado por una sola medida, la fila se marca parcial', sueldo.parcial === true);
  const adicional = filaDe(res, '1', '1200');
  assert('la novedad que sólo trae cantidad sale NO COMPARABLE, no con diferencia',
    adicional.banda === 'no_comparable'
    && adicional.motivo === 'novedad_en_cantidad_y_tabulado_sin_cantidades');
  assert('y no produce una diferencia de 12 contra nada',
    adicional.difCantidad === null && adicional.difImporte === null);
  const s = summarizeNovedadesLiquidacion(res);
  assert('lo no comparable no cuenta como diferencia', s.unitsWithDiff === 0);
  assert('pero el contexto dice que no se comparó todo',
    s.contextNote === 'se comparó 1 de 2 novedades: 1 no comparables');
}

// ── 7. Sin contraparte: el totalizador distingue los motivos ─────────────────
// Hay conceptos liquidados que el Tabulado no muestra en columna propia
// (verificado en Red Bull, Epiroc y SIASA). El totalizador es lo que permite
// decir "se liquidó y el Tabulado no lo muestra" en vez de "no se liquidó".
{
  const nov = importador([
    ['Legajo', 'Apellido y Nombres', '1000', '520121', '9999'],
    ['1', 'Sanguinetti', '30$150000', '1$200000', '1$5000'],
  ]);
  const tab = tabuladoConCantidades(
    ['1000 - Sueldo Basico'],
    [['1', 'Sanguinetti', 'Mensual', 30, 150000, 1, 355000]],
    ['TOTAL GENERAL', null, null, 30, 150000, 1, 355000],
  );
  const tot = xlsxDe(HOJA_TOT, [
    ['EA: Empresa Inventada | Reporte: Totales de Concepto | Periodo: 07/2026 - 07/2026 |'],
    ['----'],
    ['Legajo', 'Nro', 'Concepto', 'Cantidad', 'Importe', 'Liquidacion'],
    ['1', '1000', 'Sueldo Basico', 30, 150000, 'Mensual'],
    ['1', '520121', 'Exento sin columna', 1, 200000, 'Mensual'],
  ]);

  const conTot = correr({ nov, tab, tot });
  const exento = filaDe(conTot, '1', '520121');
  assert('el concepto liquidado sin columna en el Tabulado se compara contra el totalizador',
    exento.banda === 'coincide' && exento.liqImporte === 200000);
  assert('y la fila declara de dónde salió el número',
    exento.liqImporteOrigen === 'totalizador');
  const inexistente = filaDe(conTot, '1', '9999');
  assert('el que no está en ninguno de los dos sale sin contraparte',
    inexistente.banda === 'sin_contraparte' && inexistente.lado === 'solo_novedad');
  assert('con el motivo que dice que el totalizador tampoco lo tiene',
    inexistente.motivo === 'tabulado_sin_columna_no_liquidado');
  assert('el resumen lista los conceptos sin columna en el Tabulado',
    conTot.summary.conceptosSinColumnaEnTabulado === 2);
  assert('y de cada uno dice si el totalizador lo trae',
    conTot.conceptosSinColumnaEnTabulado.find(c => c.codigo === '520121').liquidadoEnTotalizador === true
    && conTot.conceptosSinColumnaEnTabulado.find(c => c.codigo === '9999').liquidadoEnTotalizador === false);

  // ── 8. Sin el totalizador, el motivo es "no se puede determinar" ───────────
  const sinTot = correr({ nov, tab });
  assert('sin totalizador el concepto sin columna no se da por no liquidado',
    filaDe(sinTot, '1', '520121').motivo === 'no_determinable_sin_totalizador'
    && filaDe(sinTot, '1', '9999').motivo === 'no_determinable_sin_totalizador');
  assert('y el control lo avisa en pantalla',
    sinTot.avisos.some(a => a.includes('Totales de Concepto')));
  assert('el chequeo del totalizador queda declarado como no cargado',
    sinTot.totalizadorCargado === false);
}

// ── 9. Un concepto marcado "otra unidad" no produce diferencia (D-065) ──────
{
  const args = {
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1100'],
      ['1', 'Sanguinetti', '8$16000'],
    ]),
    tab: tabuladoConCantidades(
      ['1100 - Horas Extras'],
      [['1', 'Sanguinetti', 'Mensual', 1, 16000, 1, 16000]],
      ['TOTAL GENERAL', null, null, 1, 16000, 1, 16000],
    ),
  };

  const sinMarcar = correr(args);
  assert('sin marcarlo, 8 horas contra 1 día sale como diferencia',
    filaDe(sinMarcar, '1', '1100').banda === 'difiere');

  const marcado = correr({ ...args, config: { conceptosNoComparables: ['1100'] } });
  const f = filaDe(marcado, '1', '1100');
  assert('marcado como otra unidad, sale NO COMPARABLE aunque los números difieran',
    f.banda === 'no_comparable' && f.motivo === 'unidad_distinta_declarada');
  assert('y no se convierte nada: no hay diferencia calculada',
    f.difCantidad === null && f.difImporte === null);
  assert('lo no comparable NO cuenta como diferencia',
    marcado.summary.legajosConDiferencia === 0 && marcado.summary.difiere === 0);
  // Pero de este legajo era su única novedad: no quedó nada comparado, así que
  // sigue para revisar. Aprobar en verde algo que no se miró sería mentir.
  assert('y aun así el legajo queda para revisar, porque no se comparó nada de él',
    summarizeNovedadesLiquidacion(marcado).unitsWithDiff === 1);

  const esperado = correr({ ...args, config: { conceptosSinLiquidacion: ['1100'] } });
  assert('un concepto marcado "no llega a la liquidación" sigue comparándose si está liquidado',
    filaDe(esperado, '1', '1100').banda === 'difiere');
}

// ── 10. Columnas del importador sin código: sección propia, nunca en silencio ─
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1000', 'Lic. Paternidad'],
      [null, null, '1000', null],
      ['1', 'Sanguinetti', '30$150000', '2$4000'],
    ]),
    tab: tabuladoConCantidades(
      ['1000 - Sueldo Basico'],
      [['1', 'Sanguinetti', 'Mensual', 30, 150000, 1, 150000]],
      ['TOTAL GENERAL', null, null, 30, 150000, 1, 150000],
    ),
  });

  assert('la columna sin código sale listada aparte', res.columnasSinCodigo.length === 1);
  assert('con su rótulo y cuántas celdas tenía',
    res.columnasSinCodigo[0].rotulo === 'Lic. Paternidad' && res.columnasSinCodigo[0].celdas === 1);
  assert('sus celdas NO entran al cruce como coincidencia', res.summary.coincide === 1);
  assert('el resumen cuenta las celdas que quedaron afuera', res.summary.celdasSinCodigo === 1);
  assert('con una columna sin código el control no sale limpio',
    summarizeNovedadesLiquidacion(res).status === 'warning');
}

// ── 11. `null` no es `0` ─────────────────────────────────────────────────────
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1000', '1200'],
      ['1', 'Sanguinetti', '30$150000', 0],
    ]),
    tab: tabuladoConCantidades(
      ['1000 - Sueldo Basico', '1200 - Adicional'],
      [['1', 'Sanguinetti', 'Mensual', 30, 150000, null, null, 1, 150000]],
      ['TOTAL GENERAL', null, null, 30, 150000, null, null, 1, 150000],
    ),
  });

  const adicional = filaDe(res, '1', '1200');
  assert('el cero escrito en el importador SÍ es un dato', adicional.novCantidad === 0);
  assert('la celda vacía del Tabulado es null, no cero',
    adicional.liqCantidad === null && adicional.liqImporte === null);
  assert('un cero contra null no es "coincide en cero": es sin contraparte',
    adicional.banda === 'sin_contraparte' && adicional.motivo === 'no_liquidado');
}

// ── 12. Períodos distintos entre los archivos ────────────────────────────────
{
  const res = correr({
    period: '2026-08',
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1000'],
      ['1', 'Sanguinetti', '30$150000'],
    ]),
    tab: xlsxDe(HOJA_TAB, [
      ['EA: Empresa Inventada | Reporte: Resumen de Liquidacion | Periodo: 07/2026 - 07/2026 |'],
      ['Legajo', 'Apellido y Nombres', '1000 - Sueldo Basico', '', 'Neto', ''],
      ['', '', 'Cant', 'Imp', 'Cant', 'Imp'],
      ['1', 'Sanguinetti', 30, 150000, 1, 150000],
      ['TOTAL GENERAL', null, 30, 150000, 1, 150000],
    ]),
  });

  assert('el Tabulado declara su propio período', res.periodoTabulado === '2026-07');
  assert('cruzar julio contra la corrida de agosto se marca como período que no coincide',
    res.summary.periodosCoinciden === false);
  assert('y con eso el control no sale limpio aunque todo coincida',
    summarizeNovedadesLiquidacion(res).status === 'warning');
}

// ── 13. Un legajo del que no se pudo comparar NADA queda para revisar ────────
// No tener con qué comparar no es aprobar: verde ahí sería decir "está bien"
// sobre algo que nunca se miró (D-070).
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1000', '1200'],
      ['1', 'Sanguinetti', '30$150000', null],
      ['2', 'Falcioni', null, 12],
    ]),
    tab: tabuladoSoloImportes(
      ['1000 - Sueldo Basico', '1200 - Adicional'],
      [
        ['1', 'Sanguinetti', 150000, null, 150000],
        ['2', 'Falcioni', null, 3000, 3000],
      ],
      ['TOTAL GENERAL', null, 150000, 3000, 153000],
    ),
  });

  assert('del legajo con novedad en cantidad y Tabulado sin cantidades no se comparó nada',
    res.legajosSinNadaComparado.length === 1 && res.summary.legajosSinNadaComparado === 1);
  const s = summarizeNovedadesLiquidacion(res);
  assert('ese legajo entra al numerador del semáforo aunque no tenga diferencia',
    s.unitsWithDiff === 1 && s.unitsTotal === 2);
  assert('así el semáforo no sale verde sobre algo que no se miró',
    computeSemaforoStatus(s.unitsWithDiff, s.unitsTotal) !== 'ok');
}

// ── 14. El concepto duplicado en dos columnas del Tabulado se suma ───────────
// El lector emite la segunda columna como imp_<codigo>__2. Leyendo sólo la
// primera, el importe liquidado sale corto y TODA la nómina difiere por el mismo
// delta: perfectamente coherente y perfectamente falso.
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1600'],
      ['1', 'Sanguinetti', '2$5000'],
    ]),
    tab: tabuladoConCantidades(
      ['1600 - Adicional', '1600 - Adicional bis'],
      [['1', 'Sanguinetti', 'Mensual', 1, 3000, 1, 2000, 1, 5000]],
      ['TOTAL GENERAL', null, null, 1, 3000, 1, 2000, 1, 5000],
    ),
  });

  const f = filaDe(res, '1', '1600');
  assert('las dos columnas del mismo código se suman: 3000 + 2000',
    f.liqImporte === 5000 && f.liqCantidad === 2);
  assert('y el par coincide en vez de diferir por el delta de la segunda columna',
    f.banda === 'coincide');
}

// ── 15. La clave de concepto normaliza los ceros a la izquierda ──────────────
{
  assert('claveConcepto saca los ceros de un código numérico',
    claveConcepto('0100') === '100' && claveConcepto('100') === '100');
  assert('un código no numérico no se toca, sólo se pasa a mayúsculas',
    claveConcepto('sal bas') === 'SAL BAS');
  assert('un código vacío no es una clave', claveConcepto('') === '' && claveConcepto(null) === '');

  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', 'Sueldo'],
      [null, null, '0100'],
      ['1', 'Sanguinetti', '30$150000'],
    ]),
    tab: tabuladoConCantidades(
      ['100 - Sueldo Basico'],
      [['1', 'Sanguinetti', 'Mensual', 30, 150000, 1, 150000]],
      ['TOTAL GENERAL', null, null, 30, 150000, 1, 150000],
    ),
  });
  assert('"0100" del importador matchea con "100" del Tabulado',
    res.summary.coincide === 1 && res.summary.sinContraparte === 0);
}

// ── 16. Un concepto liquidado sin novedad cargada ───────────────────────────
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1000', '1100'],
      ['1', 'Sanguinetti', '30$150000', null],
      ['2', 'Falcioni', '30$120000', '4$6000'],
    ]),
    tab: tabuladoConCantidades(
      ['1000 - Sueldo Basico', '1100 - Horas Extras'],
      [
        ['1', 'Sanguinetti', 'Mensual', 30, 150000, 9, 12000, 1, 162000],
        ['2', 'Falcioni', 'Mensual', 30, 120000, 4, 6000, 1, 126000],
      ],
      ['TOTAL GENERAL', null, null, 60, 270000, 13, 18000, 2, 288000],
    ),
  });

  const f = filaDe(res, '1', '1100');
  assert('el concepto liquidado sin novedad sale sin contraparte del lado de la liquidación',
    f.banda === 'sin_contraparte' && f.lado === 'solo_liquidacion' && f.motivo === 'liquidado_sin_novedad');
  assert('con el importe liquidado a la vista', f.liqImporte === 12000 && f.novImporte === null);
  assert('y ese legajo queda para revisar', res.summary.legajosConDiferencia === 1);
}

// ── 17. El universo del cruce son los conceptos del importador ───────────────
// Si se recorriera la liquidación entera, el sueldo básico, los aportes y las
// contribuciones saldrían como miles de "sin contraparte" falsas.
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1100'],
      ['1', 'Sanguinetti', '5$8000'],
    ]),
    tab: tabuladoConCantidades(
      ['1000 - Sueldo Basico', '1100 - Horas Extras', '605130 - Obra Social'],
      [['1', 'Sanguinetti', 'Mensual', 30, 150000, 5, 8000, 1, 4700, 1, 153300]],
      ['TOTAL GENERAL', null, null, 30, 150000, 5, 8000, 1, 4700, 1, 153300],
    ),
  });

  assert('sólo se cruza el concepto que trajo el importador', res.summary.pares === 1);
  assert('el sueldo básico y la obra social liquidados no ensucian el resultado',
    res.summary.sinContraparte === 0 && res.summary.coincide === 1);
}

// ── 18. Ramas de error y forma del resultado ─────────────────────────────────
{
  const sinNovedades = runNovedadesLiquidacion([], [], {});
  assert('sin novedades cargadas devuelve un error en criollo, no una excepción',
    typeof sinNovedades.error === 'string' && sinNovedades.error.includes('importador de novedades'));
  const sumErr = summarizeNovedadesLiquidacion(sinNovedades);
  assert('el summarize de la rama de error deja el semáforo neutro',
    sumErr.unit === null && sumErr.unitsTotal === null && sumErr.unitsWithDiff === null);

  const n = parseExpNov(importador([
    ['Legajo', 'Apellido y Nombres', '1000'],
    ['1', 'Sanguinetti', '30$150000'],
  ]));
  const sinTab = runNovedadesLiquidacion(n.parsedRows, [], {
    importadorRows: n.parsedRows, importadorMeta: n.parseMetadata,
    tabAxtonRows: [], tabAxtonMeta: {},
  });
  assert('sin Tabulado devuelve un error que nombra el archivo que falta',
    typeof sinTab.error === 'string' && sinTab.error.includes('Tabulado'));
}

// ── 19. El resultado viaja a IndexedDB y al JSON de la corrida ───────────────
{
  const res = correr({
    nov: importador([
      ['Legajo', 'Apellido y Nombres', '1000'],
      ['1', 'Sanguinetti', '30$150000'],
    ]),
    tab: tabuladoConCantidades(
      ['1000 - Sueldo Basico'],
      [['1', 'Sanguinetti', 'Mensual', 30, 149000, 1, 149000]],
      ['TOTAL GENERAL', null, null, 30, 149000, 1, 149000],
    ),
  });

  const ida = JSON.parse(JSON.stringify(res));
  assert('el resultado sobrevive al JSON de la corrida sin perder el cruce',
    ida.filas.length === res.filas.length && ida.filas[0].difImporte === res.filas[0].difImporte);
  assert('no hay ningún Map ni Set en la raíz del resultado',
    Object.values(res).every(v => !(v instanceof Map) && !(v instanceof Set)));
  assert('ni adentro de las filas del cruce',
    res.filas.every(f => Object.values(f).every(v => !(v instanceof Map) && !(v instanceof Set))));

  const plano = buildCrucePlano(res);
  assert('el export lleva una fila por par del cruce', plano.rows.length === res.filas.length);
  assert('con la banda como primera columna, en criollo', plano.rows[0][0] === 'Con diferencia');
  assert('y el legajo y el código como texto',
    plano.headers[1] === 'Legajo' && plano.headers[3] === 'Codigo');
}

console.log(`\n${ok} OK, ${fail} FAIL`);
if (fail > 0) process.exit(1);
