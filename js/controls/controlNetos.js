// controlNetos.js — Control de Netos (Sportline: IFSA / FGRP / RLF)
//
// Qué controla
// ────────────
// El cliente pide un **neto acordado** por empleado. Para llegar a ese neto, el
// estudio ajusta a mano el A CUENTA DE FUTUROS AUMENTOS (AFA) con un "buscar
// objetivo" de Excel. Si una alícuota de retención se pone mal, se llega a un
// bruto y a un neto equivocados y nadie lo ve hasta que sale al cliente.
//
// Este control **reconstruye el recibo teórico** de cada legajo a partir de la
// estructura salarial del mes y lo compara contra lo que efectivamente se
// liquidó. Lo que sobra de esa comparación se desarma en los conceptos del mes
// que la explican (feriados, vacaciones, adicionales); lo que queda sin explicar
// por encima de la tolerancia es el hallazgo.
//
// El recibo teórico, línea por línea
// ──────────────────────────────────
//   base          = SUELDO + A_CTA_FUT_AUMEN
//   antigüedad    = base × 1% × años de antigüedad
//   presentismo   = (base + antigüedad) × 8,33%
//   no remunerativo del acuerdo = NR × (1 + 1% × años) × 1,0833
//   retenciones   = base imponible × (jubilación + ley 19032 + obra social + ANSSAL)
//                 + (remunerativo + no remunerativo) × (sindicato + FAECYS
//                                                       + CEC + AMECYS + afiliado)
//                 + no remunerativo × 3%  ← sólo si la obra social es la que lo cobra
//   neto teórico  = remunerativo + no remunerativo − retenciones
//
// **Las alícuotas salen del Tabulado, empleado por empleado.** El archivo trae
// una columna de porcentaje por cada aporte (610 jubilación, 612 ley 19.032, 616
// obra social, 632 ANSSAL, 676 sindicato, 623 FAECYS, 669 CEC, 677 AMECYS, 678
// retención del afiliado) y ahí está declarado quién aporta qué: hay empleados
// con el 1% de AMECYS, otros con el 1% del CEC —que se liquida bajo el código
// 8538— y otros sin obra social, que aportan sólo jubilación. Las alícuotas del
// Paso 2 quedan como respaldo para cuando el archivo no traiga la columna. Si la
// columna está y dice 0, manda el 0: "no aporta" es un dato (Willy, 2026-08-20).
//
// **El acuerdo es del convenio.** Los adicionales del acuerdo —antigüedad,
// presentismo y el no remunerativo de paritaria— y el aporte sindical valen sólo
// para los empleados del convenio que firmó ese acuerdo (`cfg.convenio`, la
// columna CONVENIO del Tabulado). Al de fuera de convenio el control lo sigue
// mirando, pero su recibo teórico es sueldo + AFA menos sus propios aportes: sin
// acuerdo, sin adicionales y sin descuento sindical (Willy, 2026-08-20).
//
// Dos cosas que no estaban en el armado manual y que salieron de verificarlo
// contra la liquidación real de 05/2026 (22 legajos de IFSA), donde 5 no
// cerraban:
//
//   · **El 2% del afiliado.** Al empleado con AFILIADO_PORC = 2 se le retiene
//     dos veces el 2% sobre la misma base: una como cuota sindical y otra como
//     retención voluntaria. La segunda no estaba en el modelo, así que a esos 4
//     legajos el neto liquidado les daba más bajo que el teórico por exactamente
//     ese importe. Willy confirmó (2026-08-19) que el control tiene que
//     reconocerlo: es un descuento fijo de ese empleado, no un error. La
//     alícuota es la de esa misma columna, no un porcentaje del Paso 2: es el
//     único lugar que dice quién está afiliado.
//
//   · **El tope de la base imponible.** Los cuatro aportes de arriba se calculan
//     hasta un tope; sindicato y FAECYS no lo tienen. El legajo que lo superó (le
//     alcanzó el tope por el plus vacacional) aportó 17% menos sobre el excedente
//     y el neto le quedó *más alto* que el teórico, por 12.219,53 = 71.879,63 × 17%.
//     El tope se muestra siempre en pantalla y el analista puede cambiarlo y
//     volver a ejecutar (pedido de Willy, 2026-08-19).
//
// Nada de esto está cableado: las alícuotas, el tope, el no remunerativo del mes
// y los códigos de concepto son configuración del cliente (D-035/D-039), con
// semilla confirmada contra el Tabulado real. Una renumeración del cliente se
// arregla desde el Paso 2, no con un commit.

import { groupRowsByLegajo, sumColumn, lastRow } from './consolidate.js';
import { buildColByCode } from './tabCodes.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { toNum } from '../utils/currency.js';
import { categoriaKey } from '../parsers/escalaComercioParser.js';
import { diffStats } from './semaforo.js';
import {
  renderResumenDetalle, renderVerdict, renderTiles, renderIssues, renderChecks,
  diffCellHtml,
} from '../ui/resultBlocks.js';
import { createResultsToolbar, wireTableTools } from '../ui/tableTools.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { loadExcelJS, downloadCsv, downloadBlob } from '../utils/exportData.js';

// El redondeo de Meta4: el piso de todo el repo. No es "el monto de diferencia"
// del cliente (D-069) —ese lo tiene este control aparte, editable en su panel—
// sino el centavo con el que se decide si un básico coincide con la escala, si
// un concepto se liquidó, y si un legajo cerró exacto o quedó en la zona gris.
const REDONDEO_EPS = 0.01;

// ── Configuración por defecto ────────────────────────────────────────────────
//
// Semilla, no identidad. Confirmada contra el Tabulado real de IFSA de 05/2026
// que trajo Willy: los códigos existen en ese archivo y los importes cierran al
// centavo. Para el cliente que ya configuró lo suyo, gana su configuración.

export const DEFAULT_NETOS_CONFIG = () => ({
  // Alícuotas en porcentaje, tal como se leen en el recibo.
  tasas: {
    jubilacion:  11,
    ley19032:     3,
    obraSocial:   2.55,
    anssal:       0.45,
    sindicato:    2,
    faecys:       0.5,
    // Aporte extra sobre lo NO remunerativo, sólo para la obra social de abajo.
    obraSocialNoRemu: 3,
    // El segundo 2% del afiliado al sindicato NO está acá: es la alícuota que
    // el Tabulado declara empleado por empleado en 678-AFILIADO_PORC, y sin esa
    // columna no hay forma de saber QUIÉN está afiliado — un porcentaje suelto
    // acá se lo cobraría a toda la nómina.
  },
  // Obra social que cobra aporte sobre lo no remunerativo. Se compara como texto.
  obraSocialConAporteNoRemu: '126205',
  // Convenio al que pertenece el acuerdo: sus adicionales y su descuento sindical
  // valen sólo para estos empleados. Se compara contra la columna CONVENIO del
  // Tabulado, sin distinguir mayúsculas. Semilla, no identidad (D-035).
  convenio: 'Comercio',
  antiguedadPorAnio: 1,      // % por año
  presentismo:       8.33,   // %
  // Tope de la base imponible de los cuatro aportes. `null` = no se aplica tope
  // y el control avisa si detecta que la liquidación sí lo aplicó.
  topeBaseImponible: null,
  // Suma de los acuerdos no remunerativos del mes (paritaria). `null` = no está
  // declarado y el control no puede correr: se pide, no se asume cero.
  noRemuAcuerdo: null,
  // Tolerancia en pesos por legajo.
  tolerancia: 1,
  // Nombre de cada razón social, uno por casillero de Tabulado. Ninguno de los
  // tres Tabulados trae una columna "EMPRESA" que lo diga, así que sin esto la
  // pantalla mostraba "Tabulado 1/2/3" — un rótulo que no identifica a nadie
  // (Willy, 2026-08-20). `''` = todavía no lo cargó; el control cae al mismo
  // "Empresa N" mientras tanto.
  empresaLabels: { tab: '', tab2: '', tab3: '' },
  codigos: { ...DEFAULT_CONCEPT_CODES },
});

// Códigos de concepto del Tabulado. Un código puede ser una lista: el Tabulado
// de Sportline duplica cada concepto no remunerativo en dos códigos —uno para
// quien aporta obra social sobre lo NR y otro para quien no— y los dos suman
// para el mismo renglón del recibo.
export const DEFAULT_CONCEPT_CODES = {
  sueldo:           ['1003'],  // 1003-SUELDO
  aCuentaFutAumen:  ['1017'],  // 1017-A_CTA_FUT_AUMEN
  aniosAntiguedad:  ['1050'],  // 1050-ANIOS_ANTI (años, no importe)
  antiguedad:       ['3513'],  // 3513-COMP_ANTIGUEDAD
  presentismo:      ['1011'],  // 1011-PRESENTISMO

  // Alícuotas que el Tabulado declara para CADA empleado (porcentaje, no
  // importe). Ganan sobre las del Paso 2: el archivo sabe quién aporta qué.
  porcJubilacion:   ['610'],   // 610-PORC_JUBILACION
  porcLey19032:     ['612'],   // 612-PORC_LEY_19032
  porcObraSocial:   ['616'],   // 616-PORC_OBR_SOCIAL
  porcAnssal:       ['632'],   // 632-ANSSAL_PORC
  porcSindicato:    ['676'],   // 676-SINDICAT_PORC
  porcFaecys:       ['623'],   // 623-PORC_FAECYS
  porcCec:          ['669'],   // 669-APORTE_CEC_PORC   (se liquida en 8538)
  porcAmecys:       ['677'],   // 677-APO_CUOT_AMECYS   (se liquida en 8559)
  afiliadoPorc:     ['678'],   // 678-AFILIADO_PORC     (se liquida en 8520)

  // Aportes liquidados, para contrastar contra los teóricos.
  apJubilacion:     ['6005'],  // 6005-TOT_JUB
  apLey19032:       ['6018'],  // 6018-TOT_LEY19032
  apObraSocial:     ['6030'],  // 6030-OBRA_SOCIAL
  apAnssal:         ['6039'],  // 6039-AP_ANSSAL
  apSindicato:      ['8522'],  // 8522-C_SINDIC_VOL
  apFaecys:         ['8536'],  // 8536-FAECYS
  apAfiliadoExtra:  ['8520'],  // 8520-RET_VOL
  apCec:            ['8538'],  // 8538-FAECYS_VAC  (el nombre engaña: es el CEC)
  apAmecys:         ['8559'],  // 8559-CTA_SOC_AMECYS

  // Descuentos que no hacen al neto acordado: se suman de vuelta.
  // Confirmados por Willy el 2026-08-19 — los sindicales NO van acá.
  devolverAlNeto:   ['8500', '5010', '8530', '8540', '8820', '6031'],
  //                 anticipo, ganancias, ret. alimentaria, ret. judicial,
  //                 descuento de préstamo, imp. adicional de obra social

  // No remunerativos del acuerdo (los que el recibo teórico ya contempla).
  noRemuAcuerdo:    ['4566', '4567', '4568', '4569', '4612', '4613', '4614', '4615'],

  // Resto de los no remunerativos del mes.
  noRemuOtros:      ['4556', '4557', '4558', '4559', '4660', '4661', '4658',
                     '4604', '4410', '4483', '4484', '3022', '3025'],

  // No remunerativos que NO aportan nada: suman al neto enteros. Estaban en
  // `noRemuOtros`, donde el control les cobraba el 2,5% gremial que la
  // liquidación no les cobra: en 109 legajos de 05/2026 la diferencia sin
  // explicar era exactamente ese 2,5% (Willy confirmó el criterio, 2026-08-20).
  noRemuSinAporte:  ['1684'],

  // Haberes remunerativos del mes que el recibo teórico no contempla.
  remuOtros:        ['4096', '3553', '4743', '3556', '4100', '4105', '1062',
                     '4110', '4115', '4120', '4124', '4125', '4126', '4127',
                     '4135', '4060', '4089', '4091', '4093', '4099', '4101',
                     '1004', '1012', '1013', '1064', '1076', '1215', '1690',
                     '2311', '2998', '3515', '4453', '4486', '4450'],
};

// Nombre en criollo de cada renglón, para la pantalla.
const CODE_LABELS = {
  '4096': 'Plus feriados',      '3553': 'Vacaciones',
  '4743': 'Descuento vacaciones', '3556': 'Plus vacacional',
  '4100': 'Examen',             '4105': 'Descuento examen',
  '1062': 'Adicional del mes',  '4556': 'Vacaciones no remunerativas',
  '4557': 'Desc. vacaciones no rem.', '4558': 'Vacaciones no rem. (sin obra social)',
  '4559': 'Desc. vacaciones no rem. (sin obra social)',
  '4660': 'Adicional del mes no rem.', '4661': 'Adicional del mes no rem. (sin obra social)',
  '1684': 'Anticipo de incentivo (sin aportes)',
};

// La columna del neto no tiene código de concepto: viene con su nombre.
const NETO_HEADERS = ['NETO', 'NETO A PAGAR', 'NETO_A_PAGAR'];

const norm = (s) => String(s ?? '').trim();
const pct  = (v) => (toNum(v) ?? 0) / 100;

/** Suma los códigos de una familia dentro de un grupo de liquidaciones. */
function sumCodes(group, codes, colByCode) {
  let total = null;
  for (const code of codes || []) {
    const col = colByCode[code];
    if (!col) continue;
    const v = sumColumn(group, col);
    if (v === null) continue;
    total = (total ?? 0) + v;
  }
  return total;
}

/** Igual que `sumCodes` pero devuelve 0 en vez de `null` — para totalizar. */
const sum0 = (group, codes, colByCode) => sumCodes(group, codes, colByCode) ?? 0;

/**
 * El valor MÁS ALTO de los códigos de una familia dentro del grupo de
 * liquidaciones, o `null` si ninguna columna está en el archivo.
 *
 * Para lo que NO es un importe —una alícuota, los años de antigüedad— sumar es
 * el error: el Tabulado trae una fila por liquidación (CLAUDE.md) y el legajo
 * con la mensual y la baja del mismo mes declara su 11% de jubilación en las
 * dos filas. Sumadas darían 22% y un neto teórico disparatado. El dato es el
 * mismo en cada fila, así que el máximo es el dato.
 */
function maxCodes(group, codes, colByCode) {
  let max = null;
  for (const code of codes || []) {
    const col = colByCode[code];
    if (!col) continue;
    for (const row of group) {
      const v = toNum(row?.[col]);
      if (v === null) continue;
      if (max === null || v > max) max = v;
    }
  }
  return max;
}

/**
 * La alícuota de un aporte para ESTE legajo.
 *
 * Manda el archivo: si el Tabulado trae la columna del porcentaje, ése es el
 * dato del empleado —incluso cuando dice 0, que significa "no aporta" y no
 * "falta el dato" (CLAUDE.md: `null` no es `0`)—. El valor del Paso 2 es el
 * respaldo para el Tabulado que no traiga la columna.
 */
function tasaDelLegajo(group, codes, colByCode, fallback) {
  const v = maxCodes(group, codes, colByCode);
  return v === null ? (toNum(fallback) ?? 0) : v;
}

/**
 * Las alícuotas con las que se arma el recibo de un legajo, ya resueltas.
 *
 * `aplicaAcuerdo` sólo cambia el respaldo de las gremiales: al empleado de
 * fuera de convenio no se le cobra sindicato porque el acuerdo no es suyo, así
 * que cuando el archivo no declara la alícuota el respaldo es 0 y no el 2% del
 * Paso 2. Si el archivo SÍ la declara, manda el archivo igual que para todos.
 */
function tasasDelLegajo(group, colByCode, cfg, { aplicaAcuerdo }) {
  const c = cfg.codigos;
  const t = cfg.tasas;
  const gremial = (codes, fb) => tasaDelLegajo(group, codes, colByCode, aplicaAcuerdo ? fb : 0);
  return {
    jubilacion: tasaDelLegajo(group, c.porcJubilacion, colByCode, t.jubilacion),
    ley19032:   tasaDelLegajo(group, c.porcLey19032,   colByCode, t.ley19032),
    obraSocial: tasaDelLegajo(group, c.porcObraSocial, colByCode, t.obraSocial),
    anssal:     tasaDelLegajo(group, c.porcAnssal,     colByCode, t.anssal),
    sindicato:  gremial(c.porcSindicato, t.sindicato),
    faecys:     gremial(c.porcFaecys,    t.faecys),
    cec:        gremial(c.porcCec,       0),
    amecys:     gremial(c.porcAmecys,    0),
    afiliado:   gremial(c.afiliadoPorc,  0),
    // De dónde salieron: para poder decirlo en pantalla en vez de que el
    // analista tenga que adivinar si el control usó el archivo o su config.
    delArchivo: maxCodes(group, c.porcJubilacion, colByCode) !== null,
  };
}

/**
 * El neto teórico de un legajo, a partir de su estructura salarial.
 *
 * Se usa dos veces: para el mes que se controla y —cuando el analista sube el
 * Tabulado del mes anterior— para ese otro mes, y así poder decir si el neto de
 * acuerdo se movió de un mes al otro. Por eso está afuera del recorrido: la
 * cuenta tiene que ser **la misma** de los dos lados, o la comparación entre
 * meses mide la diferencia entre dos fórmulas y no entre dos liquidaciones.
 */
function reciboTeorico(group, colByCode, cfg, { obraSocial, aplicaAcuerdo }) {
  const c = cfg.codigos;
  const t = cfg.tasas;
  const tasas = tasasDelLegajo(group, colByCode, cfg, { aplicaAcuerdo });
  const tasaAportes = pct(tasas.jubilacion) + pct(tasas.ley19032)
                    + pct(tasas.obraSocial) + pct(tasas.anssal);
  const tasaGremial = pct(tasas.sindicato) + pct(tasas.faecys)
                    + pct(tasas.cec) + pct(tasas.amecys) + pct(tasas.afiliado);

  const base   = sum0(group, c.sueldo, colByCode) + sum0(group, c.aCuentaFutAumen, colByCode);
  const anios  = maxCodes(group, c.aniosAntiguedad, colByCode) ?? 0;

  // Antigüedad, presentismo y el no remunerativo son del acuerdo del convenio:
  // el de fuera de convenio no los cobra, y dárselos le inflaba el recibo
  // teórico —hasta un 39% de antigüedad— y lo sacaba con diferencia siempre.
  const antiguedad  = aplicaAcuerdo ? base * pct(cfg.antiguedadPorAnio) * anios : 0;
  const presentismo = aplicaAcuerdo ? (base + antiguedad) * pct(cfg.presentismo) : 0;
  const remu        = base + antiguedad + presentismo;

  const nrBase = aplicaAcuerdo ? (toNum(cfg.noRemuAcuerdo) ?? 0) : 0;
  const nrAnt  = nrBase * pct(cfg.antiguedadPorAnio) * anios;
  const noRemu = nrBase + nrAnt + (nrBase + nrAnt) * pct(cfg.presentismo);

  const tope = toNum(cfg.topeBaseImponible);
  const baseImponible = tope === null ? remu : Math.min(remu, tope);
  const aportaOsNoRemu = obraSocial === norm(cfg.obraSocialConAporteNoRemu);

  const retenciones = baseImponible * tasaAportes
    + (remu + noRemu) * tasaGremial
    + (aportaOsNoRemu ? noRemu * pct(t.obraSocialNoRemu) : 0);

  return {
    base, anios, antiguedad, presentismo, remu, noRemu,
    baseImponible, retenciones, aportaOsNoRemu, tasas, tasaAportes, tasaGremial,
    neto: remu + noRemu - retenciones,
  };
}

/**
 * Detecta el tope de la base imponible mirando los aportes liquidados.
 *
 * Si a un legajo le retuvieron jubilación sobre una base menor que sus haberes
 * remunerativos, esa base es el tope. Se toma el valor más alto de los
 * detectados: es el techo, y los que no llegan no lo revelan.
 *
 * Devuelve `null` si nadie topeó — que no es lo mismo que "no hay tope": es que
 * este mes no afectó a nadie, y entonces tampoco hace falta.
 */
function detectTope(rows) {
  let tope = null;
  for (const r of rows) {
    if (r.baseJubLiquidada === null || r.remuLiquidado === null) continue;
    if (r.baseJubLiquidada >= r.remuLiquidado - 1) continue;
    if (tope === null || r.baseJubLiquidada > tope) tope = r.baseJubLiquidada;
  }
  return tope === null ? null : Math.round(tope * 100) / 100;
}

/**
 * Ejecuta el control.
 *
 * @param {object[]} escalaRows  filas de la escala salarial del convenio
 * @param {object[]} tabRows     filas del Tabulado (la primera empresa)
 * @param {object}   mapping
 * @returns {object} resultados, o `{ error }` si no se puede correr
 */
export function runControlNetos(escalaRows, tabRows, mapping) {
  const cfg = { ...DEFAULT_NETOS_CONFIG(), ...(mapping?.netosConfig || {}) };
  cfg.tasas   = { ...DEFAULT_NETOS_CONFIG().tasas, ...(mapping?.netosConfig?.tasas || {}) };
  cfg.codigos = { ...DEFAULT_CONCEPT_CODES, ...(mapping?.netosConfig?.codigos || {}) };

  // Los Tabulados de las otras empresas del grupo entran por su propio casillero
  // y se controlan en la misma corrida. Se consolida por legajo DENTRO de cada
  // empresa y no entre empresas: las tres numeran los legajos por su cuenta, así
  // que el mismo número puede ser dos empleados distintos.
  //
  // El nombre de cada empresa lo pone el analista en la configuración —el
  // Tabulado de cada razón social no trae una columna "EMPRESA" que lo diga— y
  // se usa tal cual, o "Empresa N" si todavía no lo cargó. `nameCol` es la
  // columna de apellido y nombre QUE ESE ARCHIVO mapeó al subirse: cada
  // Tabulado tiene su propio mapeo, así que no se puede asumir el de la
  // primera empresa para las otras dos.
  const empresaLabels = cfg.empresaLabels || {};
  const empresas = [
    { label: empresaLabels.tab || 'Empresa 1', rows: tabRows || [],
      nameCol: mapping?.tab?.apellidoNombreColumn },
    { label: empresaLabels.tab2 || 'Empresa 2', rows: mapping?.tab2Rows || [],
      nameCol: mapping?.tab2?.apellidoNombreColumn },
    { label: empresaLabels.tab3 || 'Empresa 3', rows: mapping?.tab3Rows || [],
      nameCol: mapping?.tab3?.apellidoNombreColumn },
  ].filter(e => e.rows.length > 0);

  if (empresas.length === 0) {
    return { error: 'No llegó ninguna fila del Tabulado. Cargá al menos un Tabulado para correr el control.' };
  }

  const legajoCol = mapping?.tab?.empleadoColumn;
  if (!legajoCol) {
    return { error: 'No está indicada la columna de legajo del Tabulado. Confirmala al cargar el archivo.' };
  }

  if (cfg.noRemuAcuerdo === null || cfg.noRemuAcuerdo === undefined) {
    return {
      error: 'Falta declarar el acuerdo no remunerativo del mes (la suma de los conceptos de paritaria '
        + 'que cobran todos). Cargalo en la configuración del control, en el Paso 2 — sin ese dato el '
        + 'neto teórico no se puede calcular y no se asume cero.',
    };
  }

  const keyFn = makeLegajoKey(mapping?.legajoKeyMode);
  const t = cfg.tasas;

  // Quién está en el convenio del acuerdo. La columna la trae el Tabulado; si no
  // la trae, no se adivina: se avisa y se los trata a todos como del convenio,
  // que es lo que el control hacía antes de conocer el dato.
  const CONVENIO_HEADERS = ['CONVENIO'];
  const mismoConvenio = (valor) =>
    norm(valor).toUpperCase() === norm(cfg.convenio).toUpperCase();

  // Escala por categoría: clave normalizada → { categoria, basicos }
  const escalaByCat = new Map();
  for (const e of escalaRows || []) {
    if (e?.categoriaKey) escalaByCat.set(e.categoriaKey, e);
  }

  // ── El mes anterior, si el analista lo subió ────────────────────────────────
  //
  // Es opcional y por ahora **informativo**: se calcula el mismo recibo teórico
  // sobre el Tabulado del mes pasado y se muestra cuánto se movió el neto de
  // acuerdo. Todavía NO marca diferencia ni pinta el semáforo — falta que Willy
  // defina cuánto movimiento es normal (la antigüedad que cumple un año mueve el
  // neto de forma legítima, y es él quien lo justifica hoy a mano en su planilla).
  // Lo que este casillero permite ya mismo es tener el dato a la vista, que es lo
  // que detecta un AFA mal ajustado después de una paritaria.
  const prevRows = mapping?.tab_prevRows || [];
  const netoPrevPorLegajo = new Map();
  if (prevRows.length > 0) {
    const prevColByCode = buildColByCode(prevRows[0]);
    const prevHeaders   = Object.keys(prevRows[0] || {});
    const prevOsCol     = prevHeaders.find(h => norm(h).toUpperCase() === 'OBRA_SOCIAL');
    const prevConvCol   = prevHeaders.find(h => CONVENIO_HEADERS.includes(norm(h).toUpperCase()));
    for (const [legajo, group] of groupRowsByLegajo(prevRows, legajoCol, { keyFn })) {
      const fichaPrev = lastRow(group);
      const t = reciboTeorico(group, prevColByCode, cfg, {
        obraSocial:    prevOsCol ? norm(fichaPrev?.[prevOsCol]) : '',
        aplicaAcuerdo: prevConvCol ? mismoConvenio(fichaPrev?.[prevConvCol]) : true,
      });
      netoPrevPorLegajo.set(legajo, t.neto);
    }
  }

  const rows = [];
  const avisos = [];

  // Cuántos Tabulados entraron de verdad. Sin esto, una corrida con un solo
  // archivo se lee igual que una con los tres y "sin diferencias" pasaría por
  // "revisé a todos" (D-036).
  if (empresas.length < 3) {
    avisos.push(
      `${empresas.length === 1 ? 'Se controló 1 empresa' : `Se controlaron ${empresas.length} empresas`}`
      + ` de las 3 del grupo (${empresas.map(e => e.label).join(', ')}).`
      + ' Los legajos de las otras no se miraron.'
    );
  }

  if ((escalaRows || []).length === 0) {
    avisos.push('No llegó la escala salarial del convenio: no se pudo verificar que el básico '
      + 'liquidado sea el de la categoría de cada empleado.');
  }

  for (const empresa of empresas) {
    const colByCode = buildColByCode(empresa.rows[0]);
    const c = cfg.codigos;

    // La columna del neto se resuelve por nombre: no tiene código de concepto.
    const headers = Object.keys(empresa.rows[0] || {});
    const netoCol = headers.find(h => NETO_HEADERS.includes(norm(h).toUpperCase()));
    if (!netoCol) {
      avisos.push(`${empresa.label}: no encontré la columna del neto liquidado (se busca "NETO"). `
        + 'Los legajos de esta empresa quedaron sin controlar.');
      continue;
    }
    const catCol = headers.find(h => norm(h).toUpperCase() === 'CATEGORIA');
    const osCol  = headers.find(h => norm(h).toUpperCase() === 'OBRA_SOCIAL');
    const convCol = headers.find(h => CONVENIO_HEADERS.includes(norm(h).toUpperCase()));
    if (!convCol) {
      avisos.push(`${empresa.label}: el Tabulado no trae la columna CONVENIO, así que no se pudo `
        + `distinguir quién está fuera del convenio de ${cfg.convenio}. Se les calculó el recibo `
        + 'con el acuerdo y los adicionales de todos, que a un fuera de convenio le da diferencia.');
    }

    for (const [legajo, group] of groupRowsByLegajo(empresa.rows, legajoCol, { keyFn })) {
      const ficha  = lastRow(group);
      const nombre = empresa.nameCol ? norm(ficha?.[empresa.nameCol]) : '';

      const base   = sum0(group, c.sueldo, colByCode) + sum0(group, c.aCuentaFutAumen, colByCode);
      const netoLiquidado = sumColumn(group, netoCol);

      // Un legajo sin neto ni base no es un empleado de este control (fila de
      // totales, separador): no se cuenta ni se informa como diferencia.
      if (netoLiquidado === null && base === 0) continue;

      const obraSocial = osCol ? norm(ficha?.[osCol]) : '';
      const categoria  = catCol ? norm(ficha?.[catCol]) : '';
      const convenio   = convCol ? norm(ficha?.[convCol]) : '';
      const aplicaAcuerdo = convCol ? mismoConvenio(convenio) : true;

      // ── El recibo teórico ──────────────────────────────────────────────────
      const teo = reciboTeorico(group, colByCode, cfg, { obraSocial, aplicaAcuerdo });
      const afiliado       = teo.tasas.afiliado > 0;
      const aniosAnt       = teo.anios;
      const antiguedadTeo  = teo.antiguedad;
      const presentismoTeo = teo.presentismo;
      const remuTeo        = teo.remu;
      const noRemuTeo      = teo.noRemu;

      // ── Lo liquidado ───────────────────────────────────────────────────────
      const antiguedadLiq  = sum0(group, c.antiguedad, colByCode);
      const presentismoLiq = sum0(group, c.presentismo, colByCode);
      const remuOtrosLiq   = sum0(group, c.remuOtros, colByCode);
      const noRemuAcdoLiq  = sum0(group, c.noRemuAcuerdo, colByCode);
      const noRemuOtrosLiq = sum0(group, c.noRemuOtros, colByCode);
      const noRemuSinAporteLiq = sum0(group, c.noRemuSinAporte, colByCode);

      const remuLiquidado   = base + antiguedadLiq + presentismoLiq + remuOtrosLiq;
      const noRemuLiquidado = noRemuAcdoLiq + noRemuOtrosLiq + noRemuSinAporteLiq;

      const apJub = sumCodes(group, c.apJubilacion, colByCode);
      const baseJubLiquidada = apJub === null || pct(teo.tasas.jubilacion) === 0
        ? null
        : apJub / pct(teo.tasas.jubilacion);

      // ── Lo que el recibo teórico no contempla ──────────────────────────────
      const remuExtra   = (antiguedadLiq - antiguedadTeo)
                        + (presentismoLiq - presentismoTeo)
                        + remuOtrosLiq;
      const noRemuExtra = (noRemuAcdoLiq - noRemuTeo) + noRemuOtrosLiq;

      // Las mismas alícuotas con las que se armó el recibo teórico de ESTE
      // legajo: con las del Paso 2 acá, un empleado sin obra social o con el 1%
      // de AMECYS quedaba explicado con la tasa de otro.
      const aportaOsNoRemu = teo.aportaOsNoRemu;
      const tasaNoRemu = teo.tasaGremial + (aportaOsNoRemu ? pct(t.obraSocialNoRemu) : 0);
      const tasaRemu   = teo.tasaAportes + teo.tasaGremial;

      // ── Tope de la base imponible ──────────────────────────────────────────
      const tope = toNum(cfg.topeBaseImponible);
      const baseImponibleTeo  = teo.baseImponible;
      const baseImponibleReal = tope === null ? remuLiquidado : Math.min(remuLiquidado, tope);
      const excedenteTope     = remuLiquidado - baseImponibleReal;
      // Sólo la parte del excedente que aportan los conceptos del mes: la que ya
      // supera el tope en el recibo teórico está descontada dentro de
      // `retencionesTeo`, y contarla de nuevo acá la restaría dos veces.
      const excedenteExtra    = excedenteTope - (remuTeo - baseImponibleTeo);

      const retencionesTeo = teo.retenciones;
      const netoTeorico    = teo.neto;

      // ── El cruce ───────────────────────────────────────────────────────────
      const devuelto = sum0(group, c.devolverAlNeto, colByCode);
      const netoAjustado = netoLiquidado === null ? null : netoLiquidado + devuelto;

      // El excedente del tope no aportó, así que sube el neto en esa proporción.
      const efectoTope = excedenteExtra * teo.tasaAportes;
      // Los no remunerativos sin aportes entran enteros: no se les descuenta
      // nada, y cobrarles el 2,5% gremial dejaba ese 2,5% como diferencia.
      const explicado  = remuExtra * (1 - tasaRemu) + noRemuExtra * (1 - tasaNoRemu)
                       + noRemuSinAporteLiq + efectoTope;

      const residuo = netoAjustado === null ? null : netoAjustado - netoTeorico - explicado;

      // Verificación de la escala: el básico liquidado tiene que ser el de la
      // categoría. Se prueba contra todas las columnas de la escala y se informa
      // con cuál coincidió — elegir "la del mes" a mano compara contra la escala
      // equivocada sin que nada avise.
      const sueldoLiq = sum0(group, c.sueldo, colByCode);
      const escala    = escalaByCat.get(categoriaKey(categoria)) || null;
      let escalaMatch = null;
      if (escala) {
        for (const [col, valor] of Object.entries(escala.basicos)) {
          if (Math.abs(valor - sueldoLiq) <= REDONDEO_EPS) { escalaMatch = col; break; }
        }
      }

      // Cuánto se movió el neto de acuerdo respecto del mes pasado. `null` = no se
      // subió el mes anterior, o ese legajo no estaba en él (un alta): las dos
      // cosas son «no hay con qué comparar», nunca cero.
      const netoTeoricoPrev = netoPrevPorLegajo.has(legajo) ? netoPrevPorLegajo.get(legajo) : null;
      const variacionMes    = netoTeoricoPrev === null ? null : netoTeorico - netoTeoricoPrev;

      rows.push({
        legajo, nombre, empresa: empresa.label, categoria, obraSocial, afiliado,
        convenio, aplicaAcuerdo, tasas: teo.tasas, noRemuSinAporteLiq,
        netoTeoricoPrev, variacionMes,
        aniosAntiguedad: aniosAnt,
        base, sueldoLiq,
        antiguedadTeo, antiguedadLiq,
        presentismoTeo, presentismoLiq,
        remuTeo, remuLiquidado, noRemuTeo, noRemuLiquidado,
        retencionesTeo, netoTeorico,
        netoLiquidado, devuelto, netoAjustado,
        explicado, residuo,
        excedenteTope, efectoTope,
        baseJubLiquidada,
        escalaEsperada: escala ? escala.categoria : null,
        escalaMatch,
        escalaOk: !escala ? null : escalaMatch !== null,
        detalle: detalleDeExtras(group, colByCode, cfg.codigos),
      });
    }
  }

  // El tope detectado del propio archivo, para mostrarlo siempre. Si el analista
  // ya declaró uno, se informan los dos: el que se usó y el que el archivo sugiere.
  const topeDetectado = detectTope(rows);
  const topeUsado     = toNum(cfg.topeBaseImponible);

  if (topeUsado === null && topeDetectado !== null) {
    avisos.push(
      `La liquidación aplicó un tope a la base de aportes (${fmt(topeDetectado)}) y el control corrió `
      + 'sin tope, así que esos legajos van a mostrar diferencia. Cargá el tope en la configuración '
      + 'del control y volvé a ejecutar.'
    );
  }

  if (prevRows.length === 0) {
    avisos.push('No se cargó el Tabulado del mes anterior, así que no se comparó si el neto de '
      + 'acuerdo de cada legajo se movió respecto del mes pasado.');
  }

  return {
    rows,
    avisos,
    tienePrev: prevRows.length > 0,
    empresas: empresas.map(e => e.label),
    config: cfg,
    topeUsado,
    topeDetectado,
    tolerancia: toNum(cfg.tolerancia) ?? 1,
    period: mapping?.period || null,
  };
}

/** Los conceptos del mes que explican la diferencia, con nombre y código. */
function detalleDeExtras(group, colByCode, codigos) {
  const out = [];
  for (const tipo of ['remuOtros', 'noRemuOtros', 'noRemuSinAporte']) {
    for (const code of codigos[tipo] || []) {
      const col = colByCode[code];
      if (!col) continue;
      const v = sumColumn(group, col);
      if (v === null || Math.abs(v) <= REDONDEO_EPS) continue;
      out.push({
        code,
        label: CODE_LABELS[code] || String(col).replace(/^\d+[-_]/, ''),
        importe: v,
        remunerativo: tipo === 'remuOtros',
      });
    }
  }
  return out;
}

// ── Resumen para la tarjeta ──────────────────────────────────────────────────

export function summarizeControlNetos(results) {
  if (!results || results.error) {
    return { status: 'error', headline: results?.error || 'El control no pudo ejecutarse.', insights: [], unit: null };
  }

  const tol  = results.tolerancia;
  const rows = results.rows;
  const { unitsWithDiff, diffTotalAmount, worstCase } = diffStats(
    rows,
    [{ key: 'residuo', get: r => r.residuo, threshold: tol }],
    (r) => `Legajo ${r.legajo}`,
  );

  const sinComparar = rows.filter(r => r.residuo === null).length;
  const fueraEscala = rows.filter(r => r.escalaOk === false).length;

  // La tarjeta colapsada pinta badges, no frases: cada insight es
  // `{ type, label, value }` y un string suelto sale como "undefined undefined".
  // Lo que necesita prosa (el tope usado, las empresas que faltaron, el mes
  // anterior) va a los chequeos de la pantalla de resultados, que tienen lugar.
  const insights = [
    { type: unitsWithDiff > 0 ? 'warning' : 'success',
      label: unitsWithDiff === 1 ? 'legajo con diferencia sin explicar'
                                 : 'legajos con diferencia sin explicar',
      value: unitsWithDiff },
    { type: 'info',
      label: rows.length === 1 ? 'legajo controlado' : 'legajos controlados',
      value: rows.length },
  ];
  if (fueraEscala > 0) {
    insights.push({ type: 'warning',
      label: fueraEscala === 1 ? 'con el básico fuera de escala' : 'con el básico fuera de escala',
      value: fueraEscala });
  }
  if (sinComparar > 0) {
    insights.push({ type: 'warning', label: 'sin neto para comparar', value: sinComparar });
  }

  const status = unitsWithDiff === 0 && fueraEscala === 0 ? 'success' : 'warning';

  return {
    status,
    headline: unitsWithDiff === 0
      ? `Los ${rows.length} netos cierran contra el recibo teórico.`
      : `${unitsWithDiff} de ${rows.length} legajos con diferencia sin explicar.`,
    insights,
    unit: 'legajo',
    unitsTotal: rows.length,
    unitsWithDiff,
    diffTotalAmount,
    worstCase,
    contextNote: `Tolerancia ${fmt(tol)}`,
  };
}

// ── Pantalla de resultados ───────────────────────────────────────────────────

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmt(v) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function renderControlNetosResults(results, container) {
  if (!results || results.error) {
    container.innerHTML = `<div class="alert alert--danger">${esc(results?.error || 'El control no pudo ejecutarse.')}</div>`;
    return;
  }
  if (results.rows.length === 0) {
    container.innerHTML = '<p class="text-muted">Sin datos.</p>';
    return;
  }
  renderResumenDetalle(container, {
    resumen: (host) => renderResumen(results, host),
    detalle: (host) => renderDetalle(results, host),
    controlId: 'control_netos',
  });
}

function renderResumen(results, host) {
  const tol  = results.tolerancia;
  const rows = results.rows;
  const conDif = rows.filter(r => r.residuo !== null && Math.abs(r.residuo) > tol);
  const fueraEscala = rows.filter(r => r.escalaOk === false);
  const topearon = rows.filter(r => r.excedenteTope > REDONDEO_EPS);
  const movidos = rows.filter(r => r.variacionMes !== null && Math.abs(r.variacionMes) > tol);
  const fueraConvenio  = rows.filter(r => r.aplicaAcuerdo === false);
  const sinTasasPropias = rows.filter(r => r.tasas?.delArchivo === false);

  renderVerdict(host, {
    tone: conDif.length === 0 && fueraEscala.length === 0 ? 'ok' : 'warn',
    title: conDif.length === 0
      ? `Los ${rows.length} netos cierran`
      : `${conDif.length} ${conDif.length === 1 ? 'legajo' : 'legajos'} con diferencia sin explicar`,
    body: conDif.length === 0
      ? 'El neto liquidado de cada legajo coincide con el recibo teórico una vez descontados los '
        + 'conceptos del mes. No hay nada que revisar.'
      : 'En estos legajos, la diferencia entre el neto liquidado y el teórico no queda explicada por '
        + 'los conceptos del mes. Mirá el detalle de cada uno abajo.',
  });

  renderTiles(host, [
    { label: 'Legajos controlados', value: String(rows.length),
      sub: results.empresas.join(' · ')
        + (fueraConvenio.length > 0 ? ` · ${fueraConvenio.length} fuera de convenio` : '') },
    { label: 'Con diferencia', value: String(conDif.length),
      sub: `tolerancia ${fmt(tol)}` },
    { label: 'Tope de aportes usado',
      value: results.topeUsado === null ? 'sin tope' : fmt(results.topeUsado),
      sub: results.topeDetectado === null
        ? 'ningún legajo llegó al tope este mes'
        : `${topearon.length} ${topearon.length === 1 ? 'legajo lo superó' : 'legajos lo superaron'}`
          + ` · el archivo sugiere ${fmt(results.topeDetectado)}` },
    { label: 'Básico fuera de escala', value: String(fueraEscala.length),
      sub: fueraEscala.length === 0 ? 'todos coinciden con el convenio' : 'revisá la categoría' },
    { label: 'Neto movido vs. mes anterior',
      value: results.tienePrev ? String(movidos.length) : '—',
      sub: results.tienePrev
        ? (movidos.length === 0
            ? 'ninguno cambió de un mes al otro'
            : 'todavía informativo: no marca diferencia')
        : 'cargá el Tabulado del mes anterior para verlo' },
  ]);

  if (conDif.length > 0) {
    renderIssues(host, {
      heading: 'Legajos para revisar',
      items: conDif
        .slice()
        .sort((a, b) => Math.abs(b.residuo) - Math.abs(a.residuo))
        .map(r => ({
          who: `Legajo ${r.legajo}`,
          what: `Quedan ${fmt(r.residuo)} sin explicar`,
          why: `Neto liquidado ajustado ${fmt(r.netoAjustado)} contra teórico ${fmt(r.netoTeorico)}. `
            + `Los conceptos del mes explican ${fmt(r.explicado)}.`,
          sev: 'hi',
        })),
    });
  }

  if (fueraEscala.length > 0) {
    renderIssues(host, {
      heading: 'Básico distinto al de la escala del convenio',
      items: fueraEscala.map(r => ({
        who: `Legajo ${r.legajo}`,
        what: `Sueldo liquidado ${fmt(r.sueldoLiq)}`,
        why: `La categoría "${r.categoria}" no tiene ese básico en ninguna columna de la escala.`,
        sev: 'hi',
      })),
    });
  }

  if (movidos.length > 0) {
    renderIssues(host, {
      heading: 'El neto de acuerdo se movió respecto del mes anterior',
      items: movidos
        .slice()
        .sort((a, b) => Math.abs(b.variacionMes) - Math.abs(a.variacionMes))
        .map(r => ({
          who: `Legajo ${r.legajo}`,
          what: `${r.variacionMes > 0 ? '+' : ''}${fmt(r.variacionMes)}`,
          why: `De ${fmt(r.netoTeoricoPrev)} a ${fmt(r.netoTeorico)}. Cumplir un año de antigüedad `
            + 'lo mueve de forma legítima; un a cuenta de futuros aumentos mal ajustado tras una '
            + 'paritaria, no. Por ahora esto se informa y no cuenta como diferencia.',
          sev: 'lo',
        })),
    });
  }

  const checks = [
    { label: 'Tope de aportes',
      ok: results.topeUsado !== null || results.topeDetectado === null,
      detail: results.topeUsado !== null
        ? `Se usó ${fmt(results.topeUsado)}. Para cambiarlo, editalo en la configuración del control (Paso 2) y volvé a ejecutar.`
        : results.topeDetectado === null
          ? 'Ningún legajo llegó al tope este mes, así que no afecta el resultado.'
          : `La liquidación aplicó ${fmt(results.topeDetectado)} y el control corrió sin tope.` },
    { label: 'Acuerdo no remunerativo del mes', ok: true,
      detail: `${fmt(results.config.noRemuAcuerdo)} por legajo, más antigüedad y presentismo. `
        + `Se aplicó a los ${fueraConvenio.length === 0 ? '' : `${results.rows.length - fueraConvenio.length} `}`
        + `empleados del convenio de ${results.config.convenio}`
        + (fueraConvenio.length === 0
            ? '.'
            : `; los otros ${fueraConvenio.length} quedaron con su sueldo y sus propios aportes, `
              + 'sin acuerdo, sin adicionales y sin descuento sindical.') },
    { label: 'Alícuotas de retención',
      ok: sinTasasPropias.length === 0,
      detail: sinTasasPropias.length === 0
        ? 'Se leyeron del Tabulado, una por empleado: así entran el 1% de AMECYS, el del CEC y '
          + 'los que no tienen obra social.'
        : `${results.rows.length - sinTasasPropias.length} legajos usaron las alícuotas del propio `
          + `Tabulado y ${sinTasasPropias.length} las del Paso 2, porque su archivo no trae las `
          + 'columnas de porcentaje.' },
    { label: 'Comparación con el mes anterior',
      ok: results.tienePrev,
      detail: results.tienePrev
        ? `${movidos.length} ${movidos.length === 1 ? 'legajo movió' : 'legajos movieron'} su neto de `
          + 'acuerdo respecto del mes pasado. Se informa y todavía no cuenta como diferencia.'
        : 'No se cargó el Tabulado del mes anterior (es opcional).' },
    { label: 'Escala del convenio',
      ok: fueraEscala.length === 0,
      detail: fueraEscala.length === 0
        ? 'Todos los básicos coinciden con la escala de su categoría.'
        : `${fueraEscala.length} sin coincidencia.` },
  ];
  for (const a of results.avisos) checks.push({ label: 'Aviso', ok: false, detail: a });
  renderChecks(host, { heading: 'Chequeos', items: checks });
}

const COLUMNS = [
  { key: 'legajo',          label: 'Legajo',            num: false },
  { key: 'nombre',          label: 'Nombre',            num: false },
  { key: 'empresa',         label: 'Empresa',           num: false },
  { key: 'convenio',        label: 'Convenio',          num: false },
  { key: 'base',            label: 'Sueldo + AFA',      num: true  },
  { key: 'remuTeo',         label: 'Remunerativo teórico',   num: true },
  { key: 'noRemuTeo',       label: 'No remun. teórico', num: true  },
  { key: 'netoTeorico',     label: 'Neto teórico',      num: true  },
  { key: 'netoAjustado',    label: 'Neto liquidado ajustado', num: true },
  { key: 'explicado',       label: 'Explicado por el mes',    num: true },
  { key: 'variacionMes',    label: 'Movió vs. mes anterior',  num: true },
];

// Las tres categorías que separan un legajo "cerrado" de uno para mirar.
// $0,01 es el piso de todo el repo (redondeo de Meta4, CLAUDE.md); por encima
// de eso y hasta la tolerancia del control es la zona gris que el analista
// decidió tolerar a propósito; por encima de la tolerancia es lo que hay que
// revisar. Un legajo sin neto liquidado (`residuo === null`) no entra en
// ninguna de las tres: no se pudo comparar, no es que cerró.
function categoriaDe(residuo, tol) {
  if (residuo === null) return null;
  const abs = Math.abs(residuo);
  if (abs <= REDONDEO_EPS) return 'exacto';
  if (abs <= tol) return 'margen';
  return 'diferencia';
}

function renderDetalle(results, host) {
  const tol = results.tolerancia;
  const porCategoria = results.rows.reduce((acc, r) => {
    const cat = categoriaDe(r.residuo, tol);
    if (cat) acc[cat].push(r);
    return acc;
  }, { exacto: [], margen: [], diferencia: [] });

  const filterSel = document.createElement('select');
  filterSel.className = 'form-select';
  filterSel.innerHTML = `
    <option value="todos">Todos los legajos</option>
    <option value="exacto">Coinciden al centavo</option>
    <option value="margen">Dentro del margen (hasta ${fmt(tol)})</option>
    <option value="diferencia">Diferencia mayor al margen</option>
  `;

  const { searchEl, exportEl } = createResultsToolbar(host, { left: filterSel });
  const tableHost = document.createElement('div');
  host.appendChild(tableHost);

  // Arranca mostrando lo que hay que mirar; si no hay nada fuera de margen,
  // no tiene sentido abrir en una lista vacía.
  filterSel.value = porCategoria.diferencia.length > 0 ? 'diferencia' : 'todos';

  const maxDiff = results.rows.reduce((m, r) => Math.max(m, Math.abs(r.residuo ?? 0)), 0);

  const draw = () => {
    const shown = filterSel.value === 'todos' ? results.rows : porCategoria[filterSel.value];
    tableHost.innerHTML = shown.length === 0
      ? '<p class="text-muted">Ningún legajo en esta categoría.</p>'
      : tableHtml(shown, maxDiff, tol);
    const table = tableHost.querySelector('table');
    if (!table) return;
    wireTableTools(table, {
      rows: shown,
      getLabel: r => `${r.legajo} ${r.nombre} — ${r.empresa}`,
      searchEl,
      // enhanceGrid sólo sabe fijar 0, 1 o 2 columnas (css/components.css no
      // define un tercer nivel): legajo + nombre quedan fijas, empresa
      // scrollea con el resto — no es un límite de esta tabla en particular.
      stickyCols: 2,
    });
  };

  filterSel.addEventListener('change', draw);
  draw();

  renderExportMenu(exportEl, {
    onExcel: () => exportExcel(results),
    onCsv:   () => exportCsv(results),
    onCopy:  () => copiarAlPortapapeles(results),
  });
}

function tableHtml(rows, maxDiff, tol) {
  const head = COLUMNS.map(c => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')
    + '<th class="num">Sin explicar</th><th>Conceptos del mes</th>';

  const body = rows.map(r => {
    const cells = COLUMNS.map(c => c.num
      ? `<td class="num">${fmt(r[c.key])}</td>`
      : `<td>${esc(r[c.key])}</td>`).join('');
    // En una sola línea: con un renglón por concepto, un legajo con tres
    // conceptos estira TODAS las filas de la planilla y la vuelve inmirable.
    // La planilla ya scrollea para el costado, que es donde sobra lugar.
    const conceptos = r.detalle.length === 0
      ? '<span class="text-muted">—</span>'
      : r.detalle.map(d => `${esc(d.label)} <span class="text-muted">(${esc(d.code)})</span> ${fmt(d.importe)}`)
          .join(' <span class="text-muted">·</span> ');
    // `eps: tol` es lo que hace que esta celda —y el "N con diferencias" de la
    // barra, que cuenta las celdas que salen en rojo acá— respete la
    // tolerancia que el analista configuró y no el margen de $0,01 por
    // defecto: sin esto, un legajo dentro del margen igual salía marcado.
    return `<tr>${cells}${diffCellHtml(r.residuo, { max: maxDiff, eps: tol, absentLabel: 'sin comparar' })}`
      + `<td>${conceptos}</td></tr>`;
  }).join('');

  // Las tres primeras columnas las cubre el `colspan` del rótulo TOTAL; de ahí
  // en adelante, cada columna suma o queda vacía según sea de importe o de
  // texto. Con el índice cableado, agregar una columna de texto (Convenio)
  // corría todos los totales una celda a la izquierda.
  const totales = COLUMNS.slice(3).map(c => c.num
    ? `<td class="num">${fmt(rows.reduce((a, r) => a + (r[c.key] ?? 0), 0))}</td>`
    : '<td></td>').join('');

  return `
    <table class="data-table data-table--compact">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="3">TOTAL — ${rows.length} legajos</td>${totales}<td></td><td></td></tr></tfoot>
    </table>
  `;
}

// ── Export ───────────────────────────────────────────────────────────────────
//
// Las tres salidas llevan todos los legajos y todas las columnas, sin importar
// el filtro de pantalla. Este archivo lo mira el analista de Payroll, no
// Finanzas: por eso lleva la reconstrucción completa (D-020 no aplica).

const EXPORT_HEADERS = [
  'Legajo', 'Nombre', 'Empresa', 'Convenio', 'Aplica el acuerdo', 'Categoría',
  'Años antigüedad', 'Alícuotas', 'Sueldo + AFA',
  'Remunerativo teórico', 'No remun. teórico', 'Retenciones teóricas', 'Neto teórico',
  'Neto liquidado', 'Devuelto al neto', 'Neto liquidado ajustado',
  'Explicado por el mes', 'Sin explicar', 'Excedente del tope', 'Básico en escala',
  'Neto teórico mes anterior', 'Movió vs. mes anterior',
];

const exportRows = (results) => results.rows.map(r => ([
  r.legajo, r.nombre, r.empresa, r.convenio, r.aplicaAcuerdo ? 'sí' : 'no',
  r.categoria, r.aniosAntiguedad, r.tasas.delArchivo ? 'del Tabulado' : 'del Paso 2', r.base,
  r.remuTeo, r.noRemuTeo, r.retencionesTeo, r.netoTeorico,
  r.netoLiquidado, r.devuelto, r.netoAjustado,
  r.explicado, r.residuo, r.excedenteTope,
  r.escalaOk === null ? 'sin categoría en la escala' : r.escalaOk ? r.escalaMatch : 'fuera de escala',
  r.netoTeoricoPrev, r.variacionMes,
]));

function fileName(results, ext) {
  const p = results.period ? `_${String(results.period).replace(/[^\w-]/g, '')}` : '';
  return `ControlNetos${p}.${ext}`;
}

async function exportExcel(results) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Control de Netos');
  ws.addRow(EXPORT_HEADERS);
  for (const r of exportRows(results)) ws.addRow(r);
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName(results, 'xlsx'),
  );
}

function exportCsv(results) {
  downloadCsv(EXPORT_HEADERS, exportRows(results), fileName(results, 'csv'));
}

async function copiarAlPortapapeles(results) {
  const txt = [EXPORT_HEADERS.join('\t'), ...exportRows(results).map(r => r.join('\t'))].join('\n');
  await navigator.clipboard.writeText(txt);
}
