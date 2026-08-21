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
import { resumenStats } from './resumenStats.js';
import {
  renderVerdict, renderTiles, renderIssues, renderChecks,
  diffCellHtml, diffBadgeHtml,
} from '../ui/resultBlocks.js';
import { initTabs } from '../ui/tabs.js';
import { getViewPreference, setViewPreference } from '../ui/viewPreference.js';
import { createResultsToolbar, wireTableTools, initSearchCombobox } from '../ui/tableTools.js';
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
  // Puestos a los que no se les retiene seguridad social. Los directores no
  // están en relación de dependencia: la liquidación no les retiene nada, pero
  // el Tabulado igual les declara las alícuotas 11 / 3 / 2,55 / 0,45 en las
  // columnas de porcentaje, así que sin esta lista el control les descontaba un
  // 17% que nadie les descontó. Se compara contra la columna PUESTO, sin
  // distinguir mayúsculas. El criterio es el puesto y NO la obra social en
  // cero: hay empleados con la obra social en cero que aportan normal y cierran
  // (Willy, 2026-08-20).
  puestosSinAportes: ['Director'],
  // Jubilados que siguen trabajando, CONFIRMADOS por el analista en el Paso 2.
  // Aportan jubilación y nada más: ni ley 19.032 (ya son beneficiarios), ni obra
  // social, ni ANSSAL. El Tabulado igual les declara las cuatro alícuotas, y no
  // trae ninguna columna que diga que están jubilados: el control **sospecha**
  // el perfil —le retuvieron sólo jubilación teniendo las cuatro declaradas— lo
  // muestra en el Paso 2, y recién cuando el analista lo tilda deja de
  // calcularles esos tres aportes. Se guarda por casillero de Tabulado porque
  // las tres empresas numeran sus legajos por su cuenta (Willy, 2026-08-20).
  jubilados: { tab: [], tab2: [], tab3: [] },
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
  // Ojo con los códigos de UNIDADES: el Tabulado trae, para varios conceptos,
  // una columna con la cantidad (`1064-UN_ADIC_MES`, `4450-U_DIAS_FERIADOS`) y
  // otra con el importe (`1062-ADIC_ART30`, `4453-DIAS_FERIADOS`). Los dos
  // primeros estaban en esta lista y sumaban su cantidad como si fueran pesos:
  // "2,00" de haberes en 263 legajos de 05/2026, que es exactamente la clase de
  // número mal pero coherente que no detecta nadie (CLAUDE.md). Van sólo los
  // importes; si un código nuevo resuelve a una columna de unidades, el control
  // avisa en vez de sumarla.
  remuOtros:        ['4096', '3553', '4743', '3556', '4100', '4105', '1062',
                     '4110', '4115', '4120', '4124', '4125', '4126', '4127',
                     '4135', '4060', '4089', '4091', '4093', '4099', '4101',
                     '1004', '1012', '1013', '1076', '1215', '1690',
                     '2311', '2998', '3515', '4453', '4486'],
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

/**
 * ¿Esta columna del Tabulado es de unidades y no de pesos?
 *
 * El archivo lo dice en el nombre: `1064-UN_ADIC_MES` es la cantidad y
 * `1062-ADIC_ART30` el importe del mismo concepto. Sumar la cantidad como si
 * fueran pesos da un número mal pero coherente, que es el que no detecta nadie.
 */
const esColumnaDeUnidades = (col) => /^\d+[-_](UN|U)_/i.test(String(col));

/** Suma los códigos de una familia dentro de un grupo de liquidaciones. */
function sumCodes(group, codes, colByCode) {
  let total = null;
  for (const code of codes || []) {
    const col = colByCode[code];
    if (!col || esColumnaDeUnidades(col)) continue;
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
/**
 * ¿Este legajo tiene el perfil de un jubilado que sigue trabajando?
 *
 * El Tabulado no trae ninguna columna que lo diga, pero la liquidación lo deja
 * ver: le retuvieron jubilación y **nada más** —ni ley 19.032, ni obra social,
 * ni ANSSAL— teniendo las cuatro alícuotas declaradas en sus columnas de
 * porcentaje. Es una sospecha, no un hecho: la confirma el analista con un tilde
 * en el Paso 2. Estimarlo por la edad que se deduce del CUIL sería numerología
 * (Willy, 2026-08-20).
 */
export function perfilJubilado(group, colByCode, cfg) {
  const c = cfg.codigos;
  const declara = (codes) => (maxCodes(group, codes, colByCode) ?? 0) > 0;
  const retuvo  = (codes) => Math.abs(sumCodes(group, codes, colByCode) ?? 0) > REDONDEO_EPS;

  if (!declara(c.porcJubilacion) || !retuvo(c.apJubilacion)) return false;
  const declaraOtros = declara(c.porcLey19032) || declara(c.porcObraSocial) || declara(c.porcAnssal);
  const retuvoOtros  = retuvo(c.apLey19032)  || retuvo(c.apObraSocial)  || retuvo(c.apAnssal);
  return declaraOtros && !retuvoOtros;
}

/**
 * Los legajos con perfil de jubilado de un Tabulado, para ofrecerlos en el Paso 2.
 *
 * La usan la pantalla —para pintar la lista con el tilde— y el control, que
 * vuelve a evaluar el perfil sobre lo que se cargó. Una sola función para las
 * dos cosas: con la detección duplicada, el analista tilda una lista y el
 * control mira otra.
 */
export function detectarPerfilJubilado(rows, { legajoColumn, keyFn, config } = {}) {
  if (!rows?.length || !legajoColumn) return [];
  const cfg = { ...DEFAULT_NETOS_CONFIG(), ...(config || {}) };
  cfg.codigos = { ...DEFAULT_CONCEPT_CODES, ...(config?.codigos || {}) };
  const colByCode = buildColByCode(rows[0]);
  const nombreCol = Object.keys(rows[0] || {})
    .find(h => /APE?LL?IDO/i.test(norm(h)));
  const out = [];
  for (const [legajo, group] of groupRowsByLegajo(rows, legajoColumn, { keyFn: keyFn || makeLegajoKey() })) {
    if (!perfilJubilado(group, colByCode, cfg)) continue;
    const ficha = lastRow(group);
    out.push({
      legajo,
      nombre: nombreCol ? norm(ficha?.[nombreCol]) : '',
      puesto: norm(ficha?.PUESTO),
    });
  }
  return out;
}

function tasasDelLegajo(group, colByCode, cfg, { aplicaAcuerdo, sinAportes, jubilado }) {
  const c = cfg.codigos;
  const t = cfg.tasas;
  const gremial = (codes, fb) => tasaDelLegajo(group, codes, colByCode, aplicaAcuerdo ? fb : 0);
  // Al puesto sin aportes no se le retiene seguridad social, diga lo que diga la
  // columna del porcentaje: el director tiene declarado el 11 / 3 / 2,55 / 0,45
  // y la liquidación no le retiene nada. Lo gremial sí sale del archivo — si
  // declara una cuota, es un dato de ese empleado.
  const aporte = (codes, fb) => sinAportes ? 0 : tasaDelLegajo(group, codes, colByCode, fb);
  // Al jubilado confirmado le queda sólo la jubilación: ya es beneficiario de la
  // ley 19.032 y su obra social es la del PAMI, así que esos tres no se le
  // retienen aunque el Tabulado los declare.
  const deJubilado = (codes, fb) => jubilado ? 0 : aporte(codes, fb);
  return {
    jubilacion: aporte(c.porcJubilacion, t.jubilacion),
    ley19032:   deJubilado(c.porcLey19032,   t.ley19032),
    obraSocial: deJubilado(c.porcObraSocial, t.obraSocial),
    anssal:     deJubilado(c.porcAnssal,     t.anssal),
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
function reciboTeorico(group, colByCode, cfg, { obraSocial, aplicaAcuerdo, sinAportes, jubilado }) {
  const c = cfg.codigos;
  const t = cfg.tasas;
  const tasas = tasasDelLegajo(group, colByCode, cfg, { aplicaAcuerdo, sinAportes, jubilado });
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
    { key: 'tab',  label: empresaLabels.tab || 'Empresa 1', rows: tabRows || [],
      nameCol: mapping?.tab?.apellidoNombreColumn },
    { key: 'tab2', label: empresaLabels.tab2 || 'Empresa 2', rows: mapping?.tab2Rows || [],
      nameCol: mapping?.tab2?.apellidoNombreColumn },
    { key: 'tab3', label: empresaLabels.tab3 || 'Empresa 3', rows: mapping?.tab3Rows || [],
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

  // Los jubilados que el analista confirmó, por casillero de Tabulado. Se
  // normalizan con la MISMA clave de legajo que el resto del cruce: guardados a
  // mano como '007' y comparados contra '7', el tilde no tendría efecto.
  const jubiladosDe = (slot) => new Set(
    ((cfg.jubilados || {})[slot] || []).map(v => keyFn(v)));

  // Los puestos a los que no se les retiene seguridad social (los directores).
  const PUESTO_HEADERS = ['PUESTO'];
  const puestosSinAportes = (cfg.puestosSinAportes || []).map(p => norm(p).toUpperCase());
  const esSinAportes = (valor) => puestosSinAportes.includes(norm(valor).toUpperCase());

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
    const prevPuestoCol = prevHeaders.find(h => PUESTO_HEADERS.includes(norm(h).toUpperCase()));
    for (const [legajo, group] of groupRowsByLegajo(prevRows, legajoCol, { keyFn })) {
      const fichaPrev = lastRow(group);
      const t = reciboTeorico(group, prevColByCode, cfg, {
        obraSocial:    prevOsCol ? norm(fichaPrev?.[prevOsCol]) : '',
        aplicaAcuerdo: prevConvCol ? mismoConvenio(fichaPrev?.[prevConvCol]) : true,
        sinAportes:    prevPuestoCol ? esSinAportes(fichaPrev?.[prevPuestoCol]) : false,
        jubilado:      jubiladosDe('tab').has(legajo),
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
    // Un código de importe que cae en una columna de unidades sumaría cantidades
    // como si fueran pesos. El Tabulado marca esas columnas con el prefijo `UN_`
    // o `U_` después del código, así que se puede avisar en vez de sumarlas.
    for (const familia of ['remuOtros', 'noRemuOtros', 'noRemuSinAporte', 'noRemuAcuerdo', 'devolverAlNeto']) {
      for (const code of c[familia] || []) {
        const col = colByCode[code];
        if (col && esColumnaDeUnidades(col)) {
          avisos.push(`${empresa.label}: el concepto ${col} está declarado como importe pero la `
            + 'columna es de unidades (cantidad, no pesos). No se sumó al recibo: revisá el código '
            + 'en la configuración del control.');
        }
      }
    }

    const catCol = headers.find(h => norm(h).toUpperCase() === 'CATEGORIA');
    const osCol  = headers.find(h => norm(h).toUpperCase() === 'OBRA_SOCIAL');
    const convCol = headers.find(h => CONVENIO_HEADERS.includes(norm(h).toUpperCase()));
    const puestoCol = headers.find(h => PUESTO_HEADERS.includes(norm(h).toUpperCase()));
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
      const puesto     = puestoCol ? norm(ficha?.[puestoCol]) : '';
      const aplicaAcuerdo = convCol ? mismoConvenio(convenio) : true;
      const sinAportes    = puestoCol ? esSinAportes(puesto) : false;
      // La sospecha la calcula el control; el efecto lo habilita el tilde del
      // Paso 2. Sin confirmar, el legajo sale con diferencia y con el motivo a
      // la vista: el control no se corrige solo con lo que la liquidación hizo.
      const perfilJub  = perfilJubilado(group, colByCode, cfg);
      const jubilado   = jubiladosDe(empresa.key).has(legajo);

      // ── El recibo teórico ──────────────────────────────────────────────────
      const teo = reciboTeorico(group, colByCode, cfg,
        { obraSocial, aplicaAcuerdo, sinAportes, jubilado });
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
      // Qué descuentos se sumaron de vuelta, uno por uno: el analista tiene que
      // poder ver que el anticipo que le falta al neto es el que él cargó.
      const devueltoDetalle = (c.devolverAlNeto || []).map(code => {
        const col = colByCode[code];
        if (!col || esColumnaDeUnidades(col)) return null;
        const v = sumColumn(group, col);
        if (v === null || Math.abs(v) <= REDONDEO_EPS) return null;
        return { code, label: CODE_LABELS[code] || String(col).replace(/^\d+[-_]/, ''), importe: v };
      }).filter(Boolean);
      const netoAjustado = netoLiquidado === null ? null : netoLiquidado + devuelto;

      // El excedente del tope no aportó, así que sube el neto en esa proporción.
      const efectoTope = excedenteExtra * teo.tasaAportes;
      // Los no remunerativos sin aportes entran enteros: no se les descuenta
      // nada, y cobrarles el 2,5% gremial dejaba ese 2,5% como diferencia.
      const explicado  = remuExtra * (1 - tasaRemu) + noRemuExtra * (1 - tasaNoRemu)
                       + noRemuSinAporteLiq + efectoTope;

      const residuo = netoAjustado === null ? null : netoAjustado - netoTeorico - explicado;
      // El neto que este legajo TENDRÍA que haber cobrado con lo que pasó en el
      // mes: es el que se compara de verdad contra el liquidado, y el que hace
      // legible la cascada (teórico → conceptos del mes → esperado → liquidado).
      const netoEsperado = netoTeorico + explicado;
      const cascada = cascadaDelMes(group, colByCode, cfg, {
        tasaRemu, tasaNoRemu, tasaAportes: teo.tasaAportes,
        antiguedadLiq, antiguedadTeo, presentismoLiq, presentismoTeo,
        noRemuAcdoLiq, noRemuTeo, excedenteExtra,
      });

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

      const row = {
        legajo, nombre, empresa: empresa.label, categoria, obraSocial, afiliado,
        convenio, aplicaAcuerdo, puesto, sinAportes, tasas: teo.tasas, noRemuSinAporteLiq,
        perfilJubilado: perfilJub, jubilado,
        netoTeoricoPrev, variacionMes,
        aniosAntiguedad: aniosAnt,
        base, sueldoLiq,
        antiguedadTeo, antiguedadLiq,
        presentismoTeo, presentismoLiq,
        remuTeo, remuLiquidado, noRemuTeo, noRemuLiquidado,
        retencionesTeo, netoTeorico,
        netoLiquidado, devuelto, netoAjustado,
        explicado, residuo, netoEsperado, cascada, devueltoDetalle,
        excedenteTope, efectoTope,
        baseJubLiquidada,
        escalaEsperada: escala ? escala.categoria : null,
        escalaMatch,
        escalaOk: !escala ? null : escalaMatch !== null,
        detalle: detalleDeExtras(group, colByCode, cfg.codigos),
      };
      // Las marcas se calculan sobre la fila ya armada: son una lectura de lo
      // que quedó, no un dato más que haya que ir a buscar al Tabulado.
      row.marcas = marcasDelLegajo(row, cfg);
      rows.push(row);
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
    // El modo de clave de legajo del cliente (D-038), guardado con los
    // resultados: el `summarize` publica las claves de las unidades con
    // diferencia para los cortes cruzados del Resumen, y ahí la clave tiene
    // que ser la MISMA que usan los otros controles del run.
    legajoKeyMode: mapping?.legajoKeyMode ?? null,
    // El puente del Resumen: Neto teórico → + Explicado por el mes → + Sin
    // explicar → Neto liquidado. Se agrega ACÁ, en el run(), desde los mismos
    // `netoTeorico` / `explicado` / `residuo` por legajo que ya se calcularon —
    // el tablero no recalcula nada.
    bridge: bridgeDelRun(rows),
  };
}

/**
 * El puente del Resumen, agregado sobre las filas del run.
 *
 * **Sólo entran los legajos comparables** (los que tienen neto liquidado). El
 * legajo sin neto no se resta contra nada: se informa aparte, con su importe y
 * su lado, que es la regla de D-086 aplicada acá. Con esos legajos adentro, los
 * cuatro pasos no cerrarían y el analista descarta la pantalla entera.
 *
 * Los cuatro pasos cierran al centavo porque por legajo vale, por construcción:
 *   netoAjustado = netoTeorico + explicado + residuo
 * El tercer paso va con el **signo** (la suma de los residuos, no de sus valores
 * absolutos): es lo que hace que el puente cierre contra la fila TOTAL de la
 * Planilla. El bruto —los dos signos sumados— lo dice el bloque "Para qué lado",
 * que es donde significa algo.
 */
function bridgeDelRun(rows) {
  const comparables = rows.filter(r => r.residuo !== null);
  if (comparables.length === 0) return null;

  const suma = (get) => comparables.reduce((s, r) => s + (get(r) || 0), 0);
  const teorico   = suma(r => r.netoTeorico);
  const explicado = suma(r => r.explicado);
  const residuo   = suma(r => r.residuo);
  const liquidado = suma(r => r.netoAjustado);

  const sinComparar = rows.filter(r => r.residuo === null);
  const pctSinExplicar = teorico !== 0 ? (Math.abs(residuo) / Math.abs(teorico)) * 100 : null;

  return {
    steps: [
      { label: 'Neto teórico',            amount: teorico,   note: 'remun + no rem − ret',              tone: 'ink' },
      { label: '+ Explicado por el mes',  amount: explicado, note: 'licencias, altas, ajustes del mes', tone: 'accent' },
      { label: '+ Sin explicar',          amount: residuo,   note: 'neto de los dos signos',            tone: 'error' },
      { label: 'Neto liquidado',          amount: liquidado, note: 'lo que se pagó',                    tone: 'ink' },
    ],
    proportion: {
      parts: [
        { tone: 'neutral', amount: Math.abs(teorico),   label: 'Neto teórico' },
        { tone: 'accent',  amount: Math.abs(explicado), label: 'Explicado por el mes' },
        { tone: 'error',   amount: Math.abs(residuo),   label: 'Sin explicar' },
      ],
      note: pctSinExplicar === null
        ? null
        : `Lo sin explicar es el ${pctSinExplicar.toLocaleString('es-AR', {
            minimumFractionDigits: 2, maximumFractionDigits: 2,
          })} % del neto teórico del mes.`,
    },
    uncompared: sinComparar.length === 0 ? null : {
      label: sinComparar.length === 1
        ? '1 legajo sin neto liquidado, por'
        : `${sinComparar.length} legajos sin neto liquidado, por`,
      amount: sinComparar.reduce((s, r) => s + (r.netoTeorico || 0), 0),
    },
  };
}

/** Los conceptos del mes que explican la diferencia, con nombre y código. */
function detalleDeExtras(group, colByCode, codigos) {
  const out = [];
  for (const tipo of ['remuOtros', 'noRemuOtros', 'noRemuSinAporte']) {
    for (const code of codigos[tipo] || []) {
      const col = colByCode[code];
      if (!col || esColumnaDeUnidades(col)) continue;
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

/**
 * La cascada del residuo, renglón por renglón.
 *
 * El control ya sabía CUÁNTO explicaban los conceptos del mes; esto dice de
 * dónde sale cada peso de ese número. Cada renglón lleva su importe liquidado,
 * la alícuota que le corresponde y el efecto que tiene sobre el neto —lo que
 * queda después de los aportes—, que es lo único comparable contra el neto.
 *
 * **La suma de los efectos es, al centavo, `explicado`.** Es lo que hace que la
 * pantalla se pueda leer de arriba abajo y cierre: si el desglose no suma lo
 * mismo que el número que usa el cruce, el analista descarta la pantalla entera.
 * Está escrito como assert en `tests/controlNetosControl.test.js`.
 */
function cascadaDelMes(group, colByCode, cfg, ctx) {
  const { tasaRemu, tasaNoRemu, antiguedadLiq, antiguedadTeo, presentismoLiq,
          presentismoTeo, noRemuAcdoLiq, noRemuTeo, excedenteExtra, tasaAportes } = ctx;
  const c = cfg.codigos;
  const out = [];

  const push = (label, code, tipo, importe, tasa, efecto) => {
    if (Math.abs(importe) <= REDONDEO_EPS && Math.abs(efecto) <= REDONDEO_EPS) return;
    out.push({ label, code, tipo, importe, tasa, efecto });
  };

  const porFamilia = (familia, tipo, tasa) => {
    for (const code of c[familia] || []) {
      const col = colByCode[code];
      if (!col || esColumnaDeUnidades(col)) continue;
      const v = sumColumn(group, col);
      if (v === null) continue;
      push(CODE_LABELS[code] || String(col).replace(/^\d+[-_]/, ''), code, tipo, v, tasa, v * (1 - tasa));
    }
  };

  porFamilia('remuOtros',       'Remunerativo',                 tasaRemu);
  porFamilia('noRemuOtros',     'No remunerativo',              tasaNoRemu);
  porFamilia('noRemuSinAporte', 'No remunerativo sin aportes',  0);

  // Lo que el recibo teórico daba por sentado y el mes movió: una licencia baja
  // el sueldo y con él la antigüedad y el presentismo. Sin estos tres renglones
  // la cuenta no cierra y el analista no puede ver por qué.
  const difAnt  = antiguedadLiq  - antiguedadTeo;
  const difPres = presentismoLiq - presentismoTeo;
  const difNr   = noRemuAcdoLiq  - noRemuTeo;
  push(difAnt < 0 ? 'Antigüedad no liquidada este mes' : 'Antigüedad liquidada por encima del teórico',
    c.antiguedad?.[0], 'Remunerativo', difAnt, tasaRemu, difAnt * (1 - tasaRemu));
  push(difPres < 0 ? 'Presentismo no liquidado este mes' : 'Presentismo liquidado por encima del teórico',
    c.presentismo?.[0], 'Remunerativo', difPres, tasaRemu, difPres * (1 - tasaRemu));
  push(difNr < 0 ? 'Acuerdo no remunerativo no liquidado este mes'
                 : 'Acuerdo no remunerativo liquidado por encima del teórico',
    null, 'No remunerativo', difNr, tasaNoRemu, difNr * (1 - tasaNoRemu));

  // El excedente del tope no aportó, así que sube el neto en esa proporción.
  push('Excedente del tope de aportes', null, 'Sin aportes por el tope',
    excedenteExtra, tasaAportes, excedenteExtra * tasaAportes);

  return out;
}

/** Las marcas de la ficha: lo que hay que saber del legajo antes de mirar los números. */
function marcasDelLegajo(r, cfg) {
  const m = [];
  if (r.residuo === null)   m.push({ label: 'Sin neto liquidado',        tone: 'warn' });
  if (r.escalaOk === false) m.push({ label: 'Básico fuera de escala',    tone: 'error' });
  if (r.escalaOk === true)  m.push({ label: `Básico en escala (${r.escalaMatch})`, tone: 'neutral' });
  if (r.excedenteTope > REDONDEO_EPS) m.push({ label: 'Topeó aportes',   tone: 'info' });
  if (!r.aplicaAcuerdo)     m.push({ label: `Fuera del convenio de ${cfg.convenio}`, tone: 'info' });
  if (r.sinAportes)         m.push({ label: 'Sin aportes por su puesto', tone: 'info' });
  if (r.jubilado)           m.push({ label: 'Jubilado confirmado',       tone: 'info' });
  if (r.perfilJubilado && !r.jubilado) m.push({ label: 'Perfil de jubilado sin confirmar', tone: 'warn' });
  if (r.afiliado)           m.push({ label: `Afiliado ${fmt(r.tasas.afiliado)} %`, tone: 'info' });
  const n = r.cascada.length;
  m.push(n === 0
    ? { label: 'Sin conceptos del mes', tone: 'muted' }
    : { label: `${n} ${n === 1 ? 'concepto' : 'conceptos'} del mes`, tone: 'info' });
  if (r.netoTeoricoPrev === null) m.push({ label: 'Sin mes anterior cargado', tone: 'muted' });
  return m;
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
    unitsUncompared: sinComparar,
    diffTotalAmount,
    worstCase,
    contextNote: `Tolerancia ${fmt(tol)}`,
    resumen: resumenDelControl(results, tol),
  };
}

// ── El sub-objeto que dibuja el tablero del Resumen ─────────────────────────
//
// `resumenStats` agrupa y suma; **quién tiene diferencia ya lo decidió acá**, con
// la tolerancia de este control: las filas que le pasamos son las que
// `diffStats` cuenta en `unitsWithDiff`, ni una más.

/**
 * El rubro causante de un legajo con diferencia.
 *
 * **Sólo lo que el control PUEDE afirmar.** El residuo es, por definición, lo
 * que los conceptos del mes no explican: no se puede descomponer en rubros a
 * partir de la cascada —la cascada es justamente lo EXPLICADO, y atribuirle la
 * diferencia diría lo contrario de lo que pasó—. Lo que sí es una causa son las
 * marcas que el propio control detecta y que mueven el neto teórico: un básico
 * que no es el de la escala, un tope de aportes que la liquidación aplicó y el
 * control no, un perfil de jubilado sin confirmar. El resto va entero a "Sin
 * identificar", con su banda rayada, y se abre a mano en Fichas.
 *
 * El orden es de más determinante a menos: un legajo con el básico fuera de
 * escala tiene ahí su causa, aunque además haya topeado.
 */
function rubroCausante(r, results) {
  if (r.escalaOk === false) {
    return { key: 'escala', label: 'Básico fuera de escala', base: 'escala del convenio' };
  }
  if (results.topeUsado === null && r.excedenteTope > REDONDEO_EPS) {
    return { key: 'tope', label: 'Tope de aportes sin declarar', base: 'base imponible' };
  }
  if (r.perfilJubilado && !r.jubilado) {
    return { key: 'jubilado', label: 'Perfil de jubilado sin confirmar', base: 'tasas de aportes' };
  }
  return null;
}

function resumenDelControl(results, tol) {
  const rows = results.rows;
  const conDif = rows.filter(r => r.residuo !== null && Math.abs(r.residuo) > tol);

  // La clave de unidad para los cortes cruzados de 3b. Con más de un Tabulado, el
  // número de legajo NO alcanza: cada razón social los numera por su cuenta y el
  // mismo número puede ser dos empleados distintos (el mismo cuidado que ya toma
  // el cruce dentro de `runControlNetos`). Con un solo Tabulado la clave es la
  // del cliente, pelada, así los otros controles del run la reconocen.
  const legajoKey = makeLegajoKey(results.legajoKeyMode);
  const variasEmpresas = (results.empresas || []).length > 1;
  const keyOf = (r) => (variasEmpresas ? `${r.empresa}|${legajoKey(r.legajo)}` : legajoKey(r.legajo));

  return resumenStats({
    unit: 'legajo',
    tolerance: tol,
    rows: conDif,
    allRows: rows,
    diff: (r) => r.residuo,
    key: keyOf,
    unitLabel: (r) => r.nombre,
    // Una empresa por Tabulado (1 a 3). Con una sola, `resumenStats` devuelve el
    // corte igual y el tablero muestra una barra al 100 %: es cierto y no
    // estorba, pero el bloque sólo aporta cuando hay más de una.
    group: variasEmpresas ? { empresa: (r) => r.empresa } : null,
    cause: (r) => rubroCausante(r, results),
    top: (r) => ({
      legajo: r.legajo,
      nombre: r.nombre,
      empresa: variasEmpresas ? r.empresa : null,
      rubro: rubroCausante(r, results)?.label ?? null,
    }),
    bridge: results.bridge || null,
    sideLabels: {
      over:  { label: 'Pagamos de más',  note: 'plata que hay que recuperar' },
      under: { label: 'Pagamos de menos', note: 'reclamo del empleado si no se corrige' },
    },
  });
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
  // Tres solapas —Resumen · Fichas · Planilla— con esos nombres, que son los de
  // la vista estándar de toda la app (`specs/vista-estandar-resultados.md`,
  // D-074). Abre en **Fichas si el control terminó con diferencias** —lo primero
  // que se ve es por qué falla— y en **Planilla si cerró**, donde lo que sirve es
  // comparar y totalizar. La preferencia del analista pisa ese default pero se
  // guarda por control Y POR ESTADO: con una sola clave, la primera vez que
  // alguien cambia de solapa la regla de arriba deja de aplicar para siempre.
  const tol = results.tolerancia;
  const conDif = results.rows.some(r => r.residuo !== null && Math.abs(r.residuo) > tol);
  const prefKey = `control_netos:${conDif ? 'conDif' : 'sinDif'}`;
  const guardada = getViewPreference(prefKey).tab;
  const activeId = ['resumen', 'fichas', 'planilla'].includes(guardada)
    ? guardada
    : (conDif ? 'fichas' : 'planilla');
  initTabs(container, {
    tabs: [
      { id: 'resumen',  label: 'Resumen',  render: (host) => renderResumen(results, host) },
      { id: 'fichas',   label: 'Fichas',   render: (host) => renderFichas(results, host) },
      { id: 'planilla', label: 'Planilla', render: (host) => renderRubro(results, host) },
    ],
    activeId,
    onChange(id) { setViewPreference(prefKey, { tab: id }); },
  });
}

// ── Las categorías de un legajo ──────────────────────────────────────────────
//
// Las mismas para las dos vistas: los chips de filtro, el conteo de cada uno y
// el color del avatar de la ficha salen de acá. Con la lista duplicada en cada
// vista, el chip "Sin explicar 116" de una solapa y el de la otra empezaban a
// contar distinto.

// Los CINCO estados de la vista estándar, con las palabras y el orden exactos:
// son los mismos en los 21 controles, y se leen de peor a cerrado. "Sin
// comparar" va último y no es un grado de cierre, es el resto — nunca se lee
// como aprobado (D-073). Lo que le pasa ADEMÁS al legajo (fuera de escala,
// topeó aportes) no entra acá: eso es una marca, no un estado, y va al
// desplegable "Marcas ▾" (D-074, §3).
const CATEGORIAS = [
  { id: 'todos',       label: 'Todos',             test: () => true },
  { id: 'diferencia',  label: 'Con diferencia',    test: (r, tol) => r.residuo !== null && Math.abs(r.residuo) > tol },
  { id: 'margen',      label: 'Dentro del margen', test: (r, tol) => r.residuo !== null && Math.abs(r.residuo) > REDONDEO_EPS && Math.abs(r.residuo) <= tol },
  { id: 'exacto',      label: 'Al centavo',        test: (r) => r.residuo !== null && Math.abs(r.residuo) <= REDONDEO_EPS },
  { id: 'sinComparar', label: 'Sin comparar',      test: (r) => r.residuo === null },
];

// Las marcas del control: el segundo eje. El estado dice CÓMO CERRÓ el legajo;
// la marca, QUÉ MÁS le pasa. Van en su propio desplegable y no en la fila de
// chips, que tiene que decir lo mismo en las 21 pantallas (D-074, §3).
const MARCAS_FILTRO = [
  { id: 'escala',   label: 'Básico fuera de escala',        test: (r) => r.escalaOk === false },
  { id: 'tope',     label: 'Topeó aportes',                 test: (r) => r.excedenteTope > REDONDEO_EPS },
  { id: 'vacaciones', label: 'Vacaciones en el mes',        test: (r) => (r.cascada || []).some(x => VACACIONES_CODES.includes(x.code)) },
  { id: 'jubilado', label: 'Perfil de jubilado sin confirmar', test: (r) => r.perfilJubilado && !r.jubilado },
  { id: 'fueraConv', label: 'Fuera del convenio',           test: (r) => r.aplicaAcuerdo === false },
  { id: 'sinPrev',  label: 'Sin mes anterior cargado',      test: (r) => r.netoTeoricoPrev === null },
];

/** Los conceptos que hacen que un legajo tenga "vacaciones en el mes". */
const VACACIONES_CODES = ['3553', '4743', '3556', '4556', '4557', '4558', '4559'];

/**
 * El `<select>` de estado, ya con los conteos de esta corrida.
 *
 * **Los cinco estados se muestran siempre**, incluso en cero: sacar el que no
 * tiene casos movería los demás de lugar, que es justo lo que la vista estándar
 * viene a arreglar. El que está en cero queda deshabilitado y su `title` dice
 * que en esta corrida no hubo ninguno. Arranca en "Con diferencia" si hay alguno
 * —errores primero— y en "Todos" si el control cerró limpio.
 *
 * `data-chips` es la marca explícita de que ESTE select se dibuja como chips.
 * Sin ella se queda desplegable, tenga las opciones que tenga: qué se chipifica
 * se declara y no se adivina (D-074, §3).
 */
function selectDeEstado(rows, tol) {
  const sel = document.createElement('select');
  sel.className = 'form-select';
  sel.dataset.chips = '1';
  const conteos = CATEGORIAS.map(c => ({ ...c, n: rows.filter(r => c.test(r, tol)).length }));
  sel.innerHTML = conteos.map(c => `
    <option value="${esc(c.id)}"${c.n === 0 ? ' disabled title="Ningún legajo en este estado en esta corrida"' : ''}>
      ${esc(c.label)} (${c.n})
    </option>`).join('');
  sel.value = conteos.find(c => c.id === 'diferencia').n > 0 ? 'diferencia' : 'todos';
  return sel;
}

/** El desplegable "Marcas ▾": las marcas con casos en esta corrida. */
function selectDeMarcas(rows) {
  const disponibles = MARCAS_FILTRO
    .map(m => ({ ...m, n: rows.filter(r => m.test(r)).length }))
    .filter(m => m.n > 0);
  if (disponibles.length === 0) return null;
  const sel = document.createElement('select');
  sel.className = 'form-select';
  // Desplegable por diseño: las marcas son el otro eje y no van a la fila de
  // chips, que tiene que decir lo mismo en las 21 pantallas (D-074, §3). No
  // lleva `data-chips`, y con eso alcanza.
  sel.setAttribute('aria-label', 'Filtrar por marca del legajo');
  sel.innerHTML = `<option value="">Marcas: todas</option>`
    + disponibles.map(m => `<option value="${esc(m.id)}">${esc(m.label)} (${m.n})</option>`).join('');
  return sel;
}

const testDeMarca = (id) => MARCAS_FILTRO.find(m => m.id === id)?.test || (() => true);

const testDeCategoria = (id) => CATEGORIAS.find(c => c.id === id)?.test || (() => true);

function renderResumen(results, host) {
  const tol  = results.tolerancia;
  const rows = results.rows;
  const conDif = rows.filter(r => r.residuo !== null && Math.abs(r.residuo) > tol);
  const fueraEscala = rows.filter(r => r.escalaOk === false);
  const topearon = rows.filter(r => r.excedenteTope > REDONDEO_EPS);
  const movidos = rows.filter(r => r.variacionMes !== null && Math.abs(r.variacionMes) > tol);
  const fueraConvenio  = rows.filter(r => r.aplicaAcuerdo === false);
  const sinTasasPropias = rows.filter(r => r.tasas?.delArchivo === false);
  const sinAportes      = rows.filter(r => r.sinAportes === true);
  const jubConfirmados  = rows.filter(r => r.jubilado === true);
  const jubSinConfirmar = rows.filter(r => r.perfilJubilado === true && r.jubilado !== true);

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
            + `Los conceptos del mes explican ${fmt(r.explicado)}.`
            + (r.perfilJubilado && !r.jubilado
                ? ' Tiene perfil de jubilado que sigue trabajando: le retuvieron sólo jubilación '
                  + 'teniendo las cuatro alícuotas declaradas. Si lo es, tildalo en el Paso 2.'
                : ''),
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
    { label: 'Puestos sin aportes', ok: true,
      detail: (results.config.puestosSinAportes || []).length === 0
        ? 'No hay ningún puesto declarado sin aportes: a todos se les calcula la seguridad social.'
        : `A ${sinAportes.length} ${sinAportes.length === 1 ? 'empleado' : 'empleados'} no se les `
          + 'calculó jubilación, ley 19.032, obra social ni ANSSAL, por su puesto ('
          + `${results.config.puestosSinAportes.join(', ')}).` },
    { label: 'Jubilados que siguen trabajando',
      ok: jubSinConfirmar.length === 0,
      detail: jubSinConfirmar.length === 0
        ? (jubConfirmados.length === 0
            ? 'Ningún legajo tiene el perfil: a todos les retuvieron los aportes que declaran.'
            : `${jubConfirmados.length} confirmados en el Paso 2: se les calcula jubilación y nada más.`)
        : `${jubSinConfirmar.length} ${jubSinConfirmar.length === 1 ? 'legajo tiene' : 'legajos tienen'} `
          + 'el perfil (les retuvieron sólo jubilación teniendo las cuatro alícuotas declaradas) y '
          + 'todavía no están confirmados. Tildalos en el Paso 2 y volvé a ejecutar: hasta entonces '
          + 'salen con diferencia, porque el control les calcula los cuatro aportes.' },
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

// ── Vista Fichas — una tarjeta por legajo ────────────────────────────────────
//
// Es la vista de entrada del Detalle. La planilla de 12 columnas dejaba el
// "por qué" de cada legajo en una sola línea de texto, que con cientos de
// legajos no se lee ni se compara: acá cada legajo abre y muestra su recibo
// teórico, lo que se liquidó, y la cascada del residuo concepto por concepto
// (importe → aportes → efecto real en el neto). El patrón —`<details>` nativo,
// lista paginada, buscador— es el de Acumuladores de Ganancias.

function renderFichas(results, host) {
  const tol  = results.tolerancia;
  // Una corrida guardada ANTES de que el control publicara el desglose no tiene
  // cascada, marcas ni alícuotas por legajo: la app re-dibuja los resultados
  // desde la base cuando el analista vuelve a abrir una corrida vieja, y sin
  // esto la pantalla se caía. Se completa con lo que sí se puede afirmar —una
  // lista vacía no es un cero inventado— y se dice que hay que volver a
  // ejecutar para ver el detalle.
  const vieja = results.rows.some(r => !Array.isArray(r.cascada));
  const rows = results.rows.map(r => ({
    ...r,
    cascada: Array.isArray(r.cascada) ? r.cascada : [],
    marcas:  Array.isArray(r.marcas)  ? r.marcas  : [],
    devueltoDetalle: Array.isArray(r.devueltoDetalle) ? r.devueltoDetalle : [],
    netoEsperado: r.netoEsperado ?? (r.netoTeorico + (r.explicado ?? 0)),
    tasas: r.tasas ?? { ...results.config.tasas, afiliado: 0, cec: 0, amecys: 0, delArchivo: false },
  }));

  if (vieja) {
    const aviso = document.createElement('p');
    aviso.className = 'netos-nota text-muted';
    aviso.textContent = 'Esta corrida se guardó antes de que el control desarmara la diferencia '
      + 'concepto por concepto, así que las fichas no traen ese detalle. Volvé a ejecutar el control '
      + 'con los mismos archivos para verlo.';
    host.appendChild(aviso);
  }

  const estadoSel = selectDeEstado(rows, tol);
  const marcaSel  = selectDeMarcas(rows);
  const ordenSel  = document.createElement('select');
  ordenSel.className = 'form-select';
  ordenSel.innerHTML = `
    <option value="residuo">Mayor sin explicar</option>
    <option value="legajo">Legajo</option>
    <option value="nombre">Nombre</option>
    <option value="empresa">Empresa</option>
  `;

  const { searchEl, exportEl, kpisEl } = createResultsToolbar(host,
    { left: marcaSel ? [estadoSel, marcaSel] : estadoSel });
  const ordenWrap = document.createElement('label');
  ordenWrap.className = 'netos-orden';
  ordenWrap.append(document.createTextNode('Orden '), ordenSel);
  kpisEl.appendChild(ordenWrap);
  const sumaEl = document.createElement('span');
  sumaEl.className = 'results-kpi__badge results-kpi__badge--error';
  kpisEl.appendChild(sumaEl);
  renderExportMenu(exportEl, {
    onExcel: () => exportExcel(results),
    onCsv:   () => exportCsv(results),
    onCopy:  () => copiarAlPortapapeles(results),
  });

  const listHost = document.createElement('div');
  listHost.className = 'netos-fichas';
  host.appendChild(listHost);

  const pieHost = document.createElement('div');
  pieHost.className = 'netos-fichas__pie';
  host.appendChild(pieHost);

  // El buscador se monta UNA vez sobre la lista completa —así el desplegable
  // ofrece cualquier legajo, no sólo los del filtro activo— y escribe su
  // selección en el mismo lugar que el filtro de estado.
  let porBusqueda = null;
  const estado = { pagina: 1 };
  const PAGE = 50;

  function visibles() {
    const test = testDeCategoria(estadoSel.value);
    let out = rows.filter(r => test(r, tol));
    if (marcaSel?.value) out = out.filter(testDeMarca(marcaSel.value));
    if (porBusqueda) out = out.filter(r => porBusqueda.has(r));
    const orden = ordenSel.value;
    return out.slice().sort((a, b) => {
      if (orden === 'residuo') return Math.abs(b.residuo ?? 0) - Math.abs(a.residuo ?? 0);
      if (orden === 'nombre')  return String(a.nombre).localeCompare(String(b.nombre));
      if (orden === 'empresa') return String(a.empresa).localeCompare(String(b.empresa))
        || String(a.legajo).localeCompare(String(b.legajo), undefined, { numeric: true });
      return String(a.legajo).localeCompare(String(b.legajo), undefined, { numeric: true });
    });
  }

  function pintar() {
    const shown = visibles();
    const enPantalla = shown.slice(0, estado.pagina * PAGE);

    // La suma sigue la SELECCIÓN, no la página: con 50 fichas a la vista, el
    // total de las 116 filtradas es el número que el analista está mirando.
    sumaEl.textContent = `Σ sin explicar ${fmt(shown.reduce((a, r) => a + Math.abs(r.residuo ?? 0), 0))}`;

    listHost.innerHTML = enPantalla.length === 0
      ? '<p class="text-muted" style="padding:var(--sp-4);">Ningún legajo en esta categoría.</p>'
      : enPantalla.map(r => fichaHtml(r, tol)).join('');

    const faltan = shown.length - enPantalla.length;
    pieHost.innerHTML = `
      ${faltan > 0 ? `<button type="button" class="btn btn--ghost btn--sm js-mas">Mostrar ${Math.min(PAGE, faltan)} más</button>` : ''}
      <span class="text-muted">${enPantalla.length} de ${shown.length} ficha${shown.length === 1 ? '' : 's'}</span>
    `;
    pieHost.querySelector('.js-mas')?.addEventListener('click', () => { estado.pagina++; pintar(); });
  }

  // El cuerpo de cada ficha se arma al abrirla y no antes: con cientos de
  // legajos, pintar de entrada las tres tablas de cada uno cuesta segundos de
  // pantalla en blanco para algo que el analista abre de a uno.
  listHost.addEventListener('toggle', (e) => {
    const det = e.target.closest?.('.netos-ficha');
    if (!det || !det.open || det.dataset.pintada === '1') return;
    const r = rows.find(x => `${x.empresa}|${x.legajo}` === det.dataset.legajoKey);
    if (!r) return;
    det.querySelector('.netos-ficha__body').innerHTML = fichaBodyHtml(r, tol, results);
    det.dataset.pintada = '1';
  }, true);

  for (const el of [estadoSel, marcaSel, ordenSel].filter(Boolean)) {
    el.addEventListener('change', () => { estado.pagina = 1; pintar(); });
  }

  initSearchCombobox(searchEl, {
    rows,
    // El combobox trabaja con elementos del DOM; acá la "fila" de cada legajo
    // es su ficha, que puede no estar pintada todavía. Se le pasa un elemento
    // testigo por legajo y se traduce su selección a filas de datos.
    trEls: rows.map(r => {
      const el = document.createElement('span');
      el.dataset.legajoKey = `${r.empresa}|${r.legajo}`;
      return el;
    }),
    getLabel: r => `${r.legajo} ${r.nombre} — ${r.empresa}`,
    pagination: {
      setFilter(matchSet) {
        if (!matchSet) { porBusqueda = null; }
        else {
          const claves = new Set([...matchSet].map(el => el.dataset.legajoKey));
          porBusqueda = new Set(rows.filter(r => claves.has(`${r.empresa}|${r.legajo}`)));
        }
        estado.pagina = 1;
        pintar();
      },
    },
  });

  pintar();
}

/** La ficha cerrada: identidad, marcas y el importe sin explicar. */
function fichaHtml(r, tol) {
  const abs = Math.abs(r.residuo ?? 0);
  const sev = r.residuo === null ? 'warn' : abs > tol ? 'error' : 'ok';
  const importe = r.residuo === null
    ? '<span class="netos-ficha__sin">sin comparar</span>'
    : `<span class="netos-ficha__monto netos-ficha__monto--${sev}">${r.residuo > 0 ? '+' : ''}${fmt(r.residuo)}</span>`;

  return `
    <details class="netos-ficha" data-legajo-key="${esc(`${r.empresa}|${r.legajo}`)}">
      <summary class="netos-ficha__head">
        <span class="netos-ficha__avatar netos-ficha__avatar--${sev}">${esc(r.legajo)}</span>
        <span class="netos-ficha__id">
          <span class="netos-ficha__l1">
            <strong class="netos-ficha__nombre">${esc(r.nombre || '(sin nombre)')}</strong>
            <span class="netos-ficha__empresa">${esc(r.empresa)}</span>
            ${r.marcas.filter(m => m.tone === 'error' || m.tone === 'warn')
              .map(m => `<span class="netos-tag netos-tag--${m.tone}">${esc(m.label)}</span>`).join('')}
          </span>
          <span class="netos-ficha__l2">
            ${r.categoria ? `Cat. <b>${esc(r.categoria)}</b>` : ''}
            ${r.aniosAntiguedad ? `<span class="netos-sep">·</span> ${esc(r.aniosAntiguedad)} ${r.aniosAntiguedad === 1 ? 'año' : 'años'} de antigüedad` : ''}
            ${r.obraSocial ? `<span class="netos-sep">·</span> OS ${esc(r.obraSocial)}` : ''}
            ${r.convenio ? `<span class="netos-sep">·</span> ${esc(r.convenio)}` : ''}
          </span>
          <span class="netos-ficha__l3">
            ${r.marcas.filter(m => m.tone !== 'error' && m.tone !== 'warn')
              .map(m => `<span class="netos-pill netos-pill--${m.tone}">${esc(m.label)}</span>`).join('')}
          </span>
        </span>
        <span class="netos-ficha__right">
          <span class="netos-ficha__label">sin explicar</span>
          ${importe}
        </span>
        <span class="netos-caret" aria-hidden="true">▶</span>
      </summary>
      <div class="netos-ficha__body"></div>
    </details>
  `;
}

/** El cuerpo de la ficha: la cascada del residuo, en el orden en que se lee. */
function fichaBodyHtml(r, tol, results) {
  const cfg = results.config;
  const tira = [
    { label: 'Neto teórico',            valor: fmt(r.netoTeorico) },
    { label: 'Explicado por el mes',    valor: fmt(r.explicado) },
    { label: 'Neto esperado',           valor: fmt(r.netoEsperado) },
    { label: 'Neto liquidado ajustado', valor: fmt(r.netoAjustado), tone: 'dark' },
    { label: 'Sin explicar',            valor: r.residuo === null ? 'sin comparar' : fmt(r.residuo), tone: 'error' },
  ];

  const teorico = [
    ['Sueldo + a cuenta de futuros aumentos', '1003 + 1017', r.base],
    [`Antigüedad ${r.aniosAntiguedad} ${r.aniosAntiguedad === 1 ? 'año' : 'años'} × ${fmt(cfg.antiguedadPorAnio)} %`, null, r.antiguedadTeo],
    [`Presentismo ${fmt(cfg.presentismo)} %`, null, r.presentismoTeo],
    ['Remunerativo', null, r.remuTeo, 'sub'],
    ['No remunerativo del acuerdo', null, r.noRemuTeo],
    [`Retenciones ${fmt(r.tasas.jubilacion + r.tasas.ley19032 + r.tasas.obraSocial + r.tasas.anssal)} % + gremiales`, null, -r.retencionesTeo],
  ];

  const liquidado = [
    ['Neto a pagar del recibo', null, r.netoLiquidado],
    ...r.devueltoDetalle.map(d => [`+ ${d.label}`, d.code, d.importe]),
    ['Neto liquidado ajustado', null, r.netoAjustado, 'sub'],
    ['Neto esperado', 'teórico + conceptos del mes', r.netoEsperado],
    ['Base de aportes', r.excedenteTope > REDONDEO_EPS ? 'topeó este mes' : 'sin tope este mes', r.remuLiquidado - r.excedenteTope],
  ];

  const fila = ([label, sub, valor, cls]) => `
    <tr${cls ? ` class="netos-t__row--${cls}"` : ''}>
      <th scope="row">${esc(label)}${sub ? ` <span class="netos-t__code">(${esc(sub)})</span>` : ''}</th>
      <td class="num">${valor === null || valor === undefined ? '—' : fmt(valor)}</td>
    </tr>`;

  const prev = r.netoTeoricoPrev === null
    ? '<tr><th scope="row">Neto teórico del mes anterior</th><td class="num netos-t__ausente">sin Tabulado cargado</td></tr>'
    : fila(['Neto teórico del mes anterior', null, r.netoTeoricoPrev]);

  return `
    <div class="netos-tira">
      ${tira.map(p => `
        <span class="netos-tira__p${p.tone ? ` netos-tira__p--${p.tone}` : ''}">
          <span class="netos-tira__l">${esc(p.label)}:</span>
          <b>${esc(p.valor)}</b>
        </span>`).join('')}
    </div>

    <div class="netos-cols">
      <div class="netos-col">
        <div class="rb-section-h">Recibo teórico del mes</div>
        <table class="netos-t">
          <tbody>${teorico.map(fila).join('')}</tbody>
          <tfoot><tr><th scope="row">Neto teórico</th><td class="num">${fmt(r.netoTeorico)}</td></tr></tfoot>
        </table>
      </div>
      <div class="netos-col">
        <div class="rb-section-h">Lo que se liquidó</div>
        <table class="netos-t">
          <tbody>${liquidado.map(fila).join('')}${prev}</tbody>
          <tfoot class="netos-t__foot--dif"><tr><th scope="row">Sin explicar</th>
            <td class="num">${r.residuo === null ? 'sin comparar' : fmt(r.residuo)}</td></tr></tfoot>
        </table>
      </div>
    </div>

    ${r.cascada.length === 0 ? '' : `
    <div class="rb-section-h">Conceptos del mes y su efecto en el neto</div>
    <table class="netos-t netos-t--cascada">
      <thead><tr>
        <th>Concepto</th><th>Tipo</th><th class="num">Importe</th>
        <th class="num">Aportes</th><th class="num">Efecto en el neto</th>
      </tr></thead>
      <tbody>
        ${r.cascada.map(x => `
          <tr class="netos-t__row--${x.efecto >= 0 ? 'pos' : 'neg'}">
            <th scope="row">${esc(x.label)}${x.code ? ` <span class="netos-t__code">(${esc(x.code)})</span>` : ''}</th>
            <td>${esc(x.tipo)}</td>
            <td class="num">${x.importe > 0 ? '+' : ''}${fmt(x.importe)}</td>
            <td class="num">${fmt(x.tasa * 100)} %</td>
            <td class="num"><b>${x.efecto > 0 ? '+' : ''}${fmt(x.efecto)}</b></td>
          </tr>`).join('')}
      </tbody>
      <tfoot><tr>
        <th scope="row" colspan="2">Explicado por el mes</th>
        <td class="num">${fmt(r.cascada.reduce((a, x) => a + x.importe, 0))}</td>
        <td></td>
        <td class="num">${fmt(r.explicado)}</td>
      </tr></tfoot>
    </table>`}

    ${conclusionHtml(r, tol)}
  `;
}

/**
 * La conclusión de la ficha: qué mirar, descartando lo ya explicado.
 *
 * Es la única parte de la pantalla que no es un número: le dice al analista
 * dónde seguir. Sin esto la ficha explica muy bien una diferencia y lo deja
 * igual de solo que antes para resolverla.
 */
function conclusionHtml(r, tol) {
  if (r.residuo === null) {
    return `<div class="netos-conclusion netos-conclusion--warn">
      <span aria-hidden="true">⚠</span>
      <span>Este legajo no tiene neto liquidado en el Tabulado, así que no hay contra qué comparar el
      recibo teórico. Revisá si corresponde que esté en la nómina de este mes.</span>
    </div>`;
  }
  if (Math.abs(r.residuo) <= tol) {
    return `<div class="netos-conclusion netos-conclusion--ok">
      <span aria-hidden="true">✓</span>
      <span>El neto liquidado coincide con el recibo teórico una vez descontados los conceptos del
      mes${Math.abs(r.residuo) > REDONDEO_EPS ? `, con ${fmt(Math.abs(r.residuo))} de diferencia por el redondeo de cada concepto` : ''}.
      No hay nada que revisar.</span>
    </div>`;
  }

  const pistas = [];
  if (r.perfilJubilado && !r.jubilado) {
    pistas.push('tiene perfil de jubilado que sigue trabajando (le retuvieron sólo jubilación '
      + 'teniendo las cuatro alícuotas declaradas): si lo es, tildalo en el Paso 2');
  }
  if (r.escalaOk === false) {
    pistas.push('su básico no coincide con ninguna columna de la escala de la categoría '
      + `"${r.categoria}", así que la diferencia puede venir de ahí`);
  }
  if (r.excedenteTope > REDONDEO_EPS) {
    pistas.push(`superó el tope de la base de aportes en ${fmt(r.excedenteTope)}, verificá que el `
      + 'tope cargado sea el del mes');
  }
  if (pistas.length === 0) {
    pistas.push('los conceptos del mes ya están descontados, así que la diferencia no viene de ahí: '
      + 'revisá el a cuenta de futuros aumentos y las alícuotas de retención de este legajo');
  }

  // La primera pista arranca la oración, así que va en mayúscula: se arma con
  // fragmentos y sin esto la frase queda "de la tolerancia de 100,00. los
  // conceptos del mes…".
  const frase = pistas.join('; ');
  return `<div class="netos-conclusion netos-conclusion--error">
    <span aria-hidden="true">⚠</span>
    <span>Quedan <b>${fmt(Math.abs(r.residuo))}</b> arriba de la tolerancia de ${fmt(tol)}.
    ${esc(frase.charAt(0).toUpperCase() + frase.slice(1))}.</span>
  </div>`;
}

// ── Vista "Totales por rubro" — la planilla, ordenada en bandas ──────────────
//
// Los mismos rubros de siempre, agrupados en tres bandas que se leen de
// izquierda a derecha: cómo se arma el neto teórico → qué se liquidó → qué
// queda sin explicar. Cada rubro dice abajo del título su base de cálculo, y la
// fila de TOTAL cierra por columna: eso es lo que hace que la vista sirva para
// comparar entre legajos, que es lo que la ficha no puede hacer.

export const BANDAS = [
  { label: 'Identificación',    cols: 2 },
  { label: 'Recibo teórico',    cols: 7 },
  { label: 'Lo que se liquidó', cols: 3 },
  { label: 'Conciliación',      cols: 2 },
];

/** Las 14 columnas de la planilla, con la base de cálculo de cada rubro. */
export const RUBROS = [
  { key: 'legajo',         label: 'Legajo',               num: false },
  { key: 'nombre',         label: 'Empleado',             num: false, empresa: true },
  { key: 'base',           label: 'Sueldo + AFA',         sub: '1003 + 1017',           num: true },
  { key: 'antiguedadTeo',  label: 'Antigüedad',           sub: '1 % por año',           num: true },
  { key: 'presentismoTeo', label: 'Presentismo',          sub: '8,33 %',                num: true },
  { key: 'remuTeo',        label: 'Remunerativo',         sub: 'base de aportes',       num: true },
  { key: 'noRemuTeo',      label: 'No remunerativo',      sub: 'acuerdo, c/ antig.',    num: true },
  { key: 'retencionesTeo', label: 'Retenciones',          sub: 'aportes + gremiales',   num: true },
  { key: 'netoTeorico',    label: 'Neto teórico',         sub: 'remun + no rem − ret',  num: true, cierre: true },
  { key: 'netoLiquidado',  label: 'Neto del recibo',      sub: 'Tabulado',              num: true },
  { key: 'devuelto',       label: 'Ajustes',              sub: 'anticipos + ganancias', num: true },
  { key: 'netoAjustado',   label: 'Neto ajustado',        sub: 'lo comparable',         num: true, cierre: true },
  { key: 'explicado',      label: 'Explicado por el mes', sub: 'efecto en el neto',     num: true },
  { key: 'residuo',        label: 'Sin explicar',         sub: null,                    num: true, dif: true },
];

function renderRubro(results, host) {
  const tol  = results.tolerancia;
  const rows = results.rows;

  const estadoSel = selectDeEstado(rows, tol);
  const marcaSel  = selectDeMarcas(rows);
  const { searchEl, exportEl, kpisEl } = createResultsToolbar(host,
    { left: marcaSel ? [estadoSel, marcaSel] : estadoSel });
  const filasEl = document.createElement('span');
  filasEl.className = 'results-kpi';
  kpisEl.appendChild(filasEl);
  renderExportMenu(exportEl, {
    onExcel: () => exportExcel(results),
    onCsv:   () => exportCsv(results),
    onCopy:  () => copiarAlPortapapeles(results),
  });

  const tableHost = document.createElement('div');
  host.appendChild(tableHost);

  const nota = document.createElement('p');
  nota.className = 'netos-nota text-muted';
  nota.textContent = 'Los mismos rubros de siempre, en tres bandas que se leen de izquierda a '
    + 'derecha: cómo se arma el neto teórico, qué se liquidó, y qué queda sin explicar. Legajo y '
    + 'empleado quedan fijos y la fila de TOTAL cierra por columna. El detalle largo de cada legajo '
    + 'vive en Fichas: acá se compara entre legajos y se totaliza.';
  host.appendChild(nota);

  const maxDiff = rows.reduce((m, r) => Math.max(m, Math.abs(r.residuo ?? 0)), 0);

  const draw = () => {
    const test  = testDeCategoria(estadoSel.value);
    const marca = marcaSel?.value ? testDeMarca(marcaSel.value) : () => true;
    const shown = rows.filter(r => test(r, tol) && marca(r));
    filasEl.innerHTML = `<strong>${shown.length}</strong> fila${shown.length === 1 ? '' : 's'}`;
    tableHost.innerHTML = shown.length === 0
      ? '<p class="text-muted">Ningún legajo en esta categoría.</p>'
      : tablaRubroHtml(shown, maxDiff, tol);
    const table = tableHost.querySelector('table');
    if (!table) return;
    wireTableTools(table, {
      rows: shown,
      getLabel: r => `${r.legajo} ${r.nombre} — ${r.empresa}`,
      searchEl,
      // enhanceGrid sólo sabe fijar 0, 1 o 2 columnas (css/components.css no
      // define un tercer nivel): legajo + empleado quedan fijas y el resto
      // scrollea — no es un límite de esta tabla en particular.
      stickyCols: 2,
    });
  };

  for (const el of [estadoSel, marcaSel].filter(Boolean)) el.addEventListener('change', draw);
  draw();
}

function tablaRubroHtml(rows, maxDiff, tol) {
  // El rótulo de cada banda va dentro de un `<span>` sticky: al scrollear a la
  // derecha, sin eso se mete abajo de las dos columnas congeladas y desaparece
  // —y la banda ES la idea de esta vista.
  const bandas = BANDAS.map((b, i) => `
    <th colspan="${b.cols}" class="netos-banda${i === 0 ? ' netos-banda--id' : ''}">
      <span class="netos-banda__l">${esc(b.label)}</span>
    </th>`).join('');

  // La base de cálculo va debajo del título de cada rubro de importe. Legajo y
  // Empleado no tienen base: un sublabel ahí es ruido, no ayuda.
  const rubros = RUBROS.map(c => {
    const sub = c.dif ? `tolerancia ${fmt(tol)}` : c.sub;
    return `
    <th class="${c.num ? 'num ' : ''}${c.cierre ? 'netos-cierre ' : ''}${c.dif ? 'netos-dif-h' : ''}">
      ${esc(c.label)}
      ${sub ? `<span class="netos-sub">${esc(sub)}</span>` : ''}
    </th>`;
  }).join('');

  const celda = (r, c) => {
    if (c.dif) return diffCellHtml(r.residuo, { max: maxDiff, eps: tol, absentLabel: 'sin comparar' });
    if (!c.num) {
      return `<td>${esc(r[c.key])}${c.empresa ? ` <span class="netos-ficha__empresa">${esc(r.empresa)}</span>` : ''}</td>`;
    }
    return `<td class="num${c.cierre ? ' netos-cierre' : ''}">${r[c.key] === null ? '—' : fmt(r[c.key])}</td>`;
  };

  const body = rows.map(r => `<tr>${RUBROS.map(c => celda(r, c)).join('')}</tr>`).join('');

  // Se totaliza TODA columna de importe, no sólo las de cierre: es lo que hace
  // que la vista se llame "por rubro" — el analista compara el total de
  // antigüedad del mes contra el del mes pasado, no sólo el del neto.
  const totales = RUBROS.slice(2).map(c => {
    const suma = rows.reduce((a, r) => a + (r[c.key] ?? 0), 0);
    if (c.dif) return `<td class="num netos-dif-h">${fmt(suma)}</td>`;
    return `<td class="num${c.cierre ? ' netos-cierre' : ''}">${fmt(suma)}</td>`;
  }).join('');

  return `
    <table class="data-table data-table--compact netos-rubro">
      <thead>
        <tr>${bandas}</tr>
        <tr>${rubros}</tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="2">TOTAL — ${rows.length} legajos</td>${totales}</tr></tfoot>
    </table>
  `;
}

// ── Export ───────────────────────────────────────────────────────────────────
//
// Las tres salidas llevan todos los legajos y todas las columnas, sin importar
// el filtro de pantalla. Este archivo lo mira el analista de Payroll, no
// Finanzas: por eso lleva la reconstrucción completa (D-020 no aplica).

const EXPORT_HEADERS = [
  'Legajo', 'Nombre', 'Empresa', 'Convenio', 'Aplica el acuerdo', 'Categoría', 'Puesto',
  'Años antigüedad', 'Alícuotas', 'Sueldo + AFA',
  'Remunerativo teórico', 'No remun. teórico', 'Retenciones teóricas', 'Neto teórico',
  'Neto liquidado', 'Devuelto al neto', 'Neto liquidado ajustado',
  'Explicado por el mes', 'Sin explicar', 'Excedente del tope', 'Básico en escala',
  'Neto teórico mes anterior', 'Movió vs. mes anterior',
];

const exportRows = (results) => results.rows.map(r => ([
  r.legajo, r.nombre, r.empresa, r.convenio, r.aplicaAcuerdo ? 'sí' : 'no',
  r.categoria, r.puesto, r.aniosAntiguedad,
  r.sinAportes ? 'sin aportes por su puesto'
               : r.jubilado ? 'jubilado confirmado: sólo jubilación'
               : r.perfilJubilado ? 'perfil de jubilado sin confirmar'
               : r.tasas.delArchivo ? 'del Tabulado' : 'del Paso 2', r.base,
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
