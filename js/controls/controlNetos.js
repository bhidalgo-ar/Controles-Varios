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
//                 + (remunerativo + no remunerativo) × (sindicato + FAECYS)
//                 + no remunerativo × 3%  ← sólo si la obra social es la que lo cobra
//                 + (remunerativo + no remunerativo) × 2%  ← sólo si está afiliado
//   neto teórico  = remunerativo + no remunerativo − retenciones
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
//     reconocerlo: es un descuento fijo de ese empleado, no un error.
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
    // Segundo 2% del afiliado al sindicato (retención voluntaria).
    afiliadoExtra: 2,
  },
  // Obra social que cobra aporte sobre lo no remunerativo. Se compara como texto.
  obraSocialConAporteNoRemu: '126205',
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
  afiliadoPorc:     ['678'],   // 678-AFILIADO_PORC (porcentaje, no importe)

  // Aportes liquidados, para contrastar contra los teóricos.
  apJubilacion:     ['6005'],  // 6005-TOT_JUB
  apLey19032:       ['6018'],  // 6018-TOT_LEY19032
  apObraSocial:     ['6030'],  // 6030-OBRA_SOCIAL
  apAnssal:         ['6039'],  // 6039-AP_ANSSAL
  apSindicato:      ['8522'],  // 8522-C_SINDIC_VOL
  apFaecys:         ['8536'],  // 8536-FAECYS
  apAfiliadoExtra:  ['8520'],  // 8520-RET_VOL

  // Descuentos que no hacen al neto acordado: se suman de vuelta.
  // Confirmados por Willy el 2026-08-19 — los sindicales NO van acá.
  devolverAlNeto:   ['8500', '5010', '8530', '8540', '8820', '6031'],
  //                 anticipo, ganancias, ret. alimentaria, ret. judicial,
  //                 descuento de préstamo, imp. adicional de obra social

  // No remunerativos del acuerdo (los que el recibo teórico ya contempla).
  noRemuAcuerdo:    ['4566', '4567', '4568', '4569', '4612', '4613', '4614', '4615'],

  // Resto de los no remunerativos del mes.
  noRemuOtros:      ['4556', '4557', '4558', '4559', '4660', '4661', '4658',
                     '4604', '4410', '4483', '4484', '3022', '3025', '1684'],

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
  // Van rotuladas por casillero y no por nombre de archivo: el wizard le pasa a
  // `run()` el mapeo de cada archivo adicional, no cómo se llamaba.
  const empresas = [
    { label: 'Tabulado 1', rows: tabRows || [] },
    { label: 'Tabulado 2', rows: mapping?.tab2Rows || [] },
    { label: 'Tabulado 3', rows: mapping?.tab3Rows || [] },
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
  const tasaAportes = pct(t.jubilacion) + pct(t.ley19032) + pct(t.obraSocial) + pct(t.anssal);
  const tasaGremial = pct(t.sindicato) + pct(t.faecys);

  // Escala por categoría: clave normalizada → { categoria, basicos }
  const escalaByCat = new Map();
  for (const e of escalaRows || []) {
    if (e?.categoriaKey) escalaByCat.set(e.categoriaKey, e);
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

    for (const [legajo, group] of groupRowsByLegajo(empresa.rows, legajoCol, { keyFn })) {
      const ficha = lastRow(group);

      const base   = sum0(group, c.sueldo, colByCode) + sum0(group, c.aCuentaFutAumen, colByCode);
      const anios  = sumCodes(group, c.aniosAntiguedad, colByCode);
      const netoLiquidado = sumColumn(group, netoCol);

      // Un legajo sin neto ni base no es un empleado de este control (fila de
      // totales, separador): no se cuenta ni se informa como diferencia.
      if (netoLiquidado === null && base === 0) continue;

      const obraSocial = osCol ? norm(ficha?.[osCol]) : '';
      const categoria  = catCol ? norm(ficha?.[catCol]) : '';
      const afiliado   = (sumCodes(group, c.afiliadoPorc, colByCode) ?? 0) > 0;

      // ── El recibo teórico ──────────────────────────────────────────────────
      const aniosAnt      = anios ?? 0;
      const antiguedadTeo = base * pct(cfg.antiguedadPorAnio) * aniosAnt;
      const presentismoTeo = (base + antiguedadTeo) * pct(cfg.presentismo);
      const remuTeo       = base + antiguedadTeo + presentismoTeo;

      const nrBase   = toNum(cfg.noRemuAcuerdo) ?? 0;
      const nrAnt    = nrBase * pct(cfg.antiguedadPorAnio) * aniosAnt;
      const noRemuTeo = nrBase + nrAnt + (nrBase + nrAnt) * pct(cfg.presentismo);

      // ── Lo liquidado ───────────────────────────────────────────────────────
      const antiguedadLiq  = sum0(group, c.antiguedad, colByCode);
      const presentismoLiq = sum0(group, c.presentismo, colByCode);
      const remuOtrosLiq   = sum0(group, c.remuOtros, colByCode);
      const noRemuAcdoLiq  = sum0(group, c.noRemuAcuerdo, colByCode);
      const noRemuOtrosLiq = sum0(group, c.noRemuOtros, colByCode);

      const remuLiquidado   = base + antiguedadLiq + presentismoLiq + remuOtrosLiq;
      const noRemuLiquidado = noRemuAcdoLiq + noRemuOtrosLiq;

      const apJub = sumCodes(group, c.apJubilacion, colByCode);
      const baseJubLiquidada = apJub === null || pct(t.jubilacion) === 0
        ? null
        : apJub / pct(t.jubilacion);

      // ── Lo que el recibo teórico no contempla ──────────────────────────────
      const remuExtra   = (antiguedadLiq - antiguedadTeo)
                        + (presentismoLiq - presentismoTeo)
                        + remuOtrosLiq;
      const noRemuExtra = (noRemuAcdoLiq - noRemuTeo) + noRemuOtrosLiq;

      const aportaOsNoRemu = obraSocial === norm(cfg.obraSocialConAporteNoRemu);
      const tasaNoRemu = tasaGremial
        + (aportaOsNoRemu ? pct(t.obraSocialNoRemu) : 0)
        + (afiliado ? pct(t.afiliadoExtra) : 0);
      const tasaRemu = tasaAportes + tasaGremial + (afiliado ? pct(t.afiliadoExtra) : 0);

      // ── Tope de la base imponible ──────────────────────────────────────────
      const tope = toNum(cfg.topeBaseImponible);
      const baseImponibleTeo  = tope === null ? remuTeo : Math.min(remuTeo, tope);
      const baseImponibleReal = tope === null ? remuLiquidado : Math.min(remuLiquidado, tope);
      const excedenteTope     = remuLiquidado - baseImponibleReal;
      // Sólo la parte del excedente que aportan los conceptos del mes: la que ya
      // supera el tope en el recibo teórico está descontada dentro de
      // `retencionesTeo`, y contarla de nuevo acá la restaría dos veces.
      const excedenteExtra    = excedenteTope - (remuTeo - baseImponibleTeo);

      const retencionesTeo = baseImponibleTeo * tasaAportes
        + (remuTeo + noRemuTeo) * tasaGremial
        + (aportaOsNoRemu ? noRemuTeo * pct(t.obraSocialNoRemu) : 0)
        + (afiliado ? (remuTeo + noRemuTeo) * pct(t.afiliadoExtra) : 0);

      const netoTeorico = remuTeo + noRemuTeo - retencionesTeo;

      // ── El cruce ───────────────────────────────────────────────────────────
      const devuelto = sum0(group, c.devolverAlNeto, colByCode);
      const netoAjustado = netoLiquidado === null ? null : netoLiquidado + devuelto;

      // El excedente del tope no aportó, así que sube el neto en esa proporción.
      const efectoTope = excedenteExtra * tasaAportes;
      const explicado  = remuExtra * (1 - tasaRemu) + noRemuExtra * (1 - tasaNoRemu) + efectoTope;

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
          if (Math.abs(valor - sueldoLiq) <= 0.01) { escalaMatch = col; break; }
        }
      }

      rows.push({
        legajo, empresa: empresa.label, categoria, obraSocial, afiliado,
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

  return {
    rows,
    avisos,
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
  for (const tipo of ['remuOtros', 'noRemuOtros']) {
    for (const code of codigos[tipo] || []) {
      const col = colByCode[code];
      if (!col) continue;
      const v = sumColumn(group, col);
      if (v === null || Math.abs(v) <= 0.01) continue;
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

  const insights = [];
  insights.push(`${rows.length} legajos controlados en ${results.empresas.length} `
    + `${results.empresas.length === 1 ? 'empresa' : 'empresas'}.`);
  insights.push(results.topeUsado === null
    ? 'Sin tope de aportes declarado.'
    : `Tope de aportes usado: ${fmt(results.topeUsado)}.`);
  if (fueraEscala > 0) insights.push(`${fueraEscala} con el básico fuera de la escala del convenio.`);
  if (sinComparar > 0) insights.push(`${sinComparar} sin neto para comparar.`);
  for (const a of results.avisos) insights.push(a);

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
  const topearon = rows.filter(r => r.excedenteTope > 0.01);

  renderVerdict(host, {
    tone: conDif.length === 0 && fueraEscala.length === 0 ? 'success' : 'warning',
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
      sub: results.empresas.join(' · ') },
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
          severity: 'warning',
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
        severity: 'warning',
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
      detail: `${fmt(results.config.noRemuAcuerdo)} por legajo, más antigüedad y presentismo.` },
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
  { key: 'empresa',         label: 'Empresa',           num: false },
  { key: 'base',            label: 'Sueldo + AFA',      num: true  },
  { key: 'remuTeo',         label: 'Remunerativo teórico',   num: true },
  { key: 'noRemuTeo',       label: 'No remun. teórico', num: true  },
  { key: 'netoTeorico',     label: 'Neto teórico',      num: true  },
  { key: 'netoAjustado',    label: 'Neto liquidado ajustado', num: true },
  { key: 'explicado',       label: 'Explicado por el mes',    num: true },
];

function renderDetalle(results, host) {
  const tol = results.tolerancia;

  const filterSel = document.createElement('select');
  filterSel.className = 'form-select';
  filterSel.innerHTML = `
    <option value="dif">Sólo con diferencia</option>
    <option value="todos">Todos los legajos</option>
  `;

  const { searchEl, exportEl } = createResultsToolbar(host, { left: filterSel });
  const tableHost = document.createElement('div');
  host.appendChild(tableHost);

  const conDif = results.rows.filter(r => r.residuo !== null && Math.abs(r.residuo) > tol);
  filterSel.value = conDif.length > 0 ? 'dif' : 'todos';

  const maxDiff = results.rows.reduce((m, r) => Math.max(m, Math.abs(r.residuo ?? 0)), 0);

  const draw = () => {
    const shown = filterSel.value === 'dif' ? conDif : results.rows;
    tableHost.innerHTML = shown.length === 0
      ? '<p class="text-muted">Sin legajos con diferencia.</p>'
      : tableHtml(shown, maxDiff);
    const table = tableHost.querySelector('table');
    if (!table) return;
    wireTableTools(table, {
      rows: shown,
      getLabel: r => `${r.legajo} — ${r.empresa}`,
      searchEl,
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

function tableHtml(rows, maxDiff) {
  const head = COLUMNS.map(c => `<th${c.num ? ' class="num"' : ''}>${esc(c.label)}</th>`).join('')
    + '<th class="num">Sin explicar</th><th>Conceptos del mes</th>';

  const body = rows.map(r => {
    const cells = COLUMNS.map(c => c.num
      ? `<td class="num">${fmt(r[c.key])}</td>`
      : `<td>${esc(r[c.key])}</td>`).join('');
    const conceptos = r.detalle.length === 0
      ? '<span class="text-muted">—</span>'
      : r.detalle.map(d => `${esc(d.label)} <span class="text-muted">(${esc(d.code)})</span> ${fmt(d.importe)}`)
          .join('<br>');
    return `<tr>${cells}${diffCellHtml(r.residuo, { max: maxDiff, absentLabel: 'sin comparar' })}`
      + `<td>${conceptos}</td></tr>`;
  }).join('');

  const totales = COLUMNS.map((c, i) => {
    if (i < 2) return '';
    const sum = rows.reduce((a, r) => a + (r[c.key] ?? 0), 0);
    return `<td class="num">${fmt(sum)}</td>`;
  }).join('');

  return `
    <table class="data-table data-table--compact">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td colspan="2">TOTAL — ${rows.length} legajos</td>${totales}<td></td><td></td></tr></tfoot>
    </table>
  `;
}

// ── Export ───────────────────────────────────────────────────────────────────
//
// Las tres salidas llevan todos los legajos y todas las columnas, sin importar
// el filtro de pantalla. Este archivo lo mira el analista de Payroll, no
// Finanzas: por eso lleva la reconstrucción completa (D-020 no aplica).

const EXPORT_HEADERS = [
  'Legajo', 'Empresa', 'Categoría', 'Años antigüedad', 'Sueldo + AFA',
  'Remunerativo teórico', 'No remun. teórico', 'Retenciones teóricas', 'Neto teórico',
  'Neto liquidado', 'Devuelto al neto', 'Neto liquidado ajustado',
  'Explicado por el mes', 'Sin explicar', 'Excedente del tope', 'Básico en escala',
];

const exportRows = (results) => results.rows.map(r => ([
  r.legajo, r.empresa, r.categoria, r.aniosAntiguedad, r.base,
  r.remuTeo, r.noRemuTeo, r.retencionesTeo, r.netoTeorico,
  r.netoLiquidado, r.devuelto, r.netoAjustado,
  r.explicado, r.residuo, r.excedenteTope,
  r.escalaOk === null ? 'sin categoría en la escala' : r.escalaOk ? r.escalaMatch : 'fuera de escala',
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
