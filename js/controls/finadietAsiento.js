// finadietAsiento.js — Asiento de Remuneraciones de FINADIET (modo Generar Reporte)
//
// Control de generación, no de cruce: arma desde el excel mensual "FINADIET
// CONCEPTOS" (export de Meta4) el asiento contable de remuneraciones que Payroll
// le entrega a Contaduría del cliente. No compara nada contra el Tabulado —
// `tabRequired: false`, misma familia que `acreditaciones_reporte` y
// `acumuladores_ganancias`.
//
// Cada fila del archivo de origen es un movimiento completo: el mismo importe va
// al Debe de una cuenta y al Haber de otra. De ahí que el control **siempre**
// controle una cosa: que el asiento cierre (Debe = Haber). Si no cierra, o si
// una cuenta/centro no se pudo clasificar, el reporte no se puede mandar así, y
// eso es lo que pinta el semáforo (ver summarize).
//
// Consolidación: acá la unidad NO es el legajo, así que `js/controls/consolidate.js`
// no aplica — el archivo no trae legajo y dos filas del mismo empleado no se
// distinguen ni tienen por qué distinguirse. Se consolida por **cuenta contable**
// (cuenta final + centro para Resultado, categoría + cuenta para Patrimonial) y,
// en las dos solapas planas, por cuenta + concepto. Misma clase de excepción que
// `acreditaciones.js`, donde la unidad es la acreditación (D-021).
//
// Las tablas de cuentas, centros y categorías son SEMILLA (D-035): lo que manda
// es lo que el analista tenga guardado en `controlConfigs`
// (`finadiet_asiento_config`), editable en el Paso 2 del wizard. Una cuenta nueva
// del cliente se agrega desde la pantalla, no con un commit.
//
// Reglas completas en specs/finadiet-asiento-remuneraciones.md; por qué está acá
// y no como HTML standalone en reportes/, en D-046.

import { renderResumenDetalle, renderVerdict, renderTiles, renderIssues, renderChecks } from '../ui/resultBlocks.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { renderPlanillaPanel } from '../ui/planillaPanel.js';
import { renderFichasPanel } from '../ui/fichaList.js';
import { conciliarCuenta, tiraDeCuenta, detalleDeConceptos, contextoDeCuenta, rotuloDeSaldo, concordancia }
  from '../ui/fichaCuenta.js';
import { initTabs } from '../ui/tabs.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum } from '../utils/currency.js';
import { periodToLabel, periodSuffix } from '../utils/dates.js';
import { EXPORT_CONTRACTS } from '../exports/contracts.js';
import { writeContractSheet } from '../exports/contractSheet.js';
import { acumularConcepto, conceptosEnOrden } from './cuentaConceptos.js';

// Tolerancia de comparación de importes del proyecto (CLAUDE.md): los floats de
// Excel no dan igualdad exacta. Un centavo de descuadre en un asiento ES un
// descuadre — no se afloja este número "para que cierre".
const TOL = 0.01;

// El prefijo que llevan las cuentas Patrimoniales, en lugar del código de centro
// de costo: son las que se consolidan entre todos los centros.
const PREFIJO_PATRIMONIAL = '100';

/**
 * Plan de cuentas de FINADIET — código → { nombre, tipo, categoria? }.
 * `tipo: 'Resultado'` lleva prefijo de centro de costo; `'Patrimonial'` lleva
 * `PREFIJO_PATRIMONIAL` y se agrupa por `categoria` en la solapa ASIENTO.
 *
 * Semilla validada con Gaby Fukuhara sobre el archivo real de FINADIET
 * ("FINADIET Ctas cbles y centros de costo.xlsx", 12/08/2026). No se inventa
 * ninguna entrada por analogía: una cuenta que no está acá sale como aviso.
 */
export const FINADIET_CUENTAS_SEED = {
  '114318': { nombre: 'CRÉDITO COMPUTABLE IVA Créd Fisc IVA D° 814 (Cs. Soc)', tipo: 'Patrimonial', categoria: 'CRÉDITO COMPUTABLE IVA' },
  '213111': { nombre: 'SUELDOS A PAGAR SUELDOS A PAGAR', tipo: 'Patrimonial', categoria: 'SUELDOS A PAGAR' },
  '213121': { nombre: 'SUELDOS A PAGAR ADELANTO DE HABERES', tipo: 'Patrimonial', categoria: 'SUELDOS A PAGAR' },
  '213122': { nombre: 'SUELDOS A PAGAR ADELANTO DE VACACIONES', tipo: 'Patrimonial', categoria: 'SUELDOS A PAGAR' },
  '213123': { nombre: 'SUELDOS A PAGAR ADELANTO DE AGUINALDO', tipo: 'Patrimonial', categoria: 'SUELDOS A PAGAR' },
  '213211': { nombre: 'CARGAS SOCIALES A PAGAR  LEY 19032', tipo: 'Patrimonial', categoria: 'CARGAS SOCIALES A PAGAR' },
  '213212': { nombre: 'CARGAS SOCIALES A PAGAR  JUBILACION', tipo: 'Patrimonial', categoria: 'CARGAS SOCIALES A PAGAR' },
  '213213': { nombre: 'CARGAS SOCIALES A PAGAR  C.A.S.F.P.I.', tipo: 'Patrimonial', categoria: 'CARGAS SOCIALES A PAGAR' },
  '213214': { nombre: 'CARGAS SOCIALES A PAGAR  A.N.S.S.A.L.', tipo: 'Patrimonial', categoria: 'CARGAS SOCIALES A PAGAR' },
  '213215.1': { nombre: 'CARGAS SOCIALES A PAGAR  O.SOC. L.PASTEUR', tipo: 'Patrimonial', categoria: 'CARGAS SOCIALES A PAGAR' },
  '213215.2': { nombre: 'CARGAS SOCIALES A PAGAR  O.SOC. A.P.M.', tipo: 'Patrimonial', categoria: 'CARGAS SOCIALES A PAGAR' },
  '213215.5': { nombre: 'CARGAS SOCIALES A PAGAR  O.SOC. F.A.T.S.A.', tipo: 'Patrimonial', categoria: 'CARGAS SOCIALES A PAGAR' },
  '213215.6': { nombre: 'CARGAS SOCIALES A PAGAR  OTRAS OBRAS SOCIALES', tipo: 'Patrimonial', categoria: 'CARGAS SOCIALES A PAGAR' },
  '213216': { nombre: 'CARGAS SOCIALES A PAGAR  A.R.T. y SEG. VIDA COLECTIVO', tipo: 'Patrimonial', categoria: 'CARGAS SOCIALES A PAGAR' },
  '213221.1': { nombre: 'SINDICATOS A PAGAR A.T.S.A. BS. AS.', tipo: 'Patrimonial', categoria: 'SINDICATOS A PAGAR' },
  '213221.3': { nombre: 'SINDICATOS A PAGAR A.A.P.M. REP. ARG.', tipo: 'Patrimonial', categoria: 'SINDICATOS A PAGAR' },
  '213221.4': { nombre: 'SINDICATOS A PAGAR A.A.P.M. CORDOBA', tipo: 'Patrimonial', categoria: 'SINDICATOS A PAGAR' },
  '213221.5': { nombre: 'SINDICATOS A PAGAR A.A.P.M. ROSARIO', tipo: 'Patrimonial', categoria: 'SINDICATOS A PAGAR' },
  '213221.6': { nombre: 'SINDICATOS A PAGAR A.A.P.M. ENTRE R.', tipo: 'Patrimonial', categoria: 'SINDICATOS A PAGAR' },
  '213221.7': { nombre: 'SINDICATOS A PAGAR A.A.P.M. STA. FE', tipo: 'Patrimonial', categoria: 'SINDICATOS A PAGAR' },
  '213221.8': { nombre: 'SINDICATOS A PAGAR A.A.P.M. MENDOZA', tipo: 'Patrimonial', categoria: 'SINDICATOS A PAGAR' },
  '213231': { nombre: 'SINDICATOS A PAGAR ADICIONAL F.A.T.S.A.', tipo: 'Patrimonial', categoria: 'SINDICATOS A PAGAR' },
  '213232': { nombre: 'OBRA SOCIAL L. PASTEUR A PAGAR ADICIONALES L. PASTEUR RET', tipo: 'Patrimonial', categoria: 'OBRA SOCIAL LUIS PASTEUR A PAGAR' },
  '213233': { nombre: 'RETENCIONES JUDICIALES A PAGAR RETENC. POR ORD. JUDICIAL', tipo: 'Patrimonial', categoria: 'RETENCIONES JUDICIALES A PAGAR' },
  '214172': { nombre: 'RETENCIONES GANANCIAS A PAGAR', tipo: 'Patrimonial', categoria: 'RETENCIONES GANANCIAS A PAGAR' },
  '521101': { nombre: 'SUELDOS (INCLUYE REDONDEO)', tipo: 'Resultado' },
  '521101.1': { nombre: 'HORAS EXTRAS', tipo: 'Resultado' },
  '521101.2': { nombre: 'COMISIONES', tipo: 'Resultado' },
  '521102': { nombre: 'AGUINALDO', tipo: 'Resultado' },
  '521103': { nombre: 'VACACIONES', tipo: 'Resultado' },
  '521104': { nombre: 'GRATIFICACIONES', tipo: 'Resultado' },
  '521201': { nombre: 'CARGAS SOCIALES', tipo: 'Resultado' },
  '521202': { nombre: 'ASIGNACIONES FAMILIARES', tipo: 'Resultado' },
  '521203': { nombre: 'DIFERENCIAL OBRA SOCIAL', tipo: 'Resultado' },
  '521301': { nombre: 'INDEMNIZACIONES + PREAVISO', tipo: 'Resultado' },
  '521302': { nombre: 'VACACIONES NO GOZADAS', tipo: 'Resultado' },
  '521401': { nombre: 'SUBSIDIOS', tipo: 'Resultado' },
  '521402': { nombre: 'GUARDERIA', tipo: 'Resultado' },
};

/** Centro de costo (nombre tal como viene en el archivo) → código de prefijo. */
export const FINADIET_CENTROS_SEED = {
  'ADMINISTRACION': 400,
  'ADMINISTRACION SAN MARTIN': 401,
  'PRODUCCION - M.O.D.': 441,
  'PRODUCCION - M.O.I.': 442,
  'PRODUCCION - M.O.D. SAN MARTIN': 443,
  'PRODUCCION - M.O.I. SAN MARTIN': 444,
  'ESTUDIO E INVESTIGACION': 450,
  'DIRECCION DE ESTUDIO E INVEST.': 460,
  'PROMOCION METROPOLITANA': 501,
  'PROMOCION CENTRO': 502,
  'PROMOCION N.O.A.': 503,
  'PROMOCION CUYO': 504,
  'PROMOCION MEDICA BB': 506,
  'PROMOCION N.E.A.': 507,
  'PROMOCION ROSARIO': 508,
  'PROMOCION MDQ Y PCIA. BS.AS.': 509,
  'TRATAMIENTOS ESPECIALES': 520,
};

/**
 * Orden de los bloques de cuentas Patrimoniales en la solapa ASIENTO. Es el
 * orden con el que Contaduría de FINADIET lee el asiento — no alfabético.
 * Una categoría que aparezca y no esté acá se agrega al final, ordenada.
 */
export const FINADIET_ORDEN_CATEGORIAS = [
  'CRÉDITO COMPUTABLE IVA',
  'CARGAS SOCIALES A PAGAR',
  'SINDICATOS A PAGAR',
  'OBRA SOCIAL LUIS PASTEUR A PAGAR',
  'RETENCIONES JUDICIALES A PAGAR',
  'RETENCIONES GANANCIAS A PAGAR',
  'SUELDOS A PAGAR',
];

export const DEFAULT_FINADIET_ASIENTO_CONFIG = {
  cuentas:         { ...FINADIET_CUENTAS_SEED },
  centros:         { ...FINADIET_CENTROS_SEED },
  ordenCategorias: [...FINADIET_ORDEN_CATEGORIAS],
  // Fecha de emisión del asiento: la completa el analista en el Paso 2. No se
  // infiere del archivo ni se completa con hoy — es un dato del asiento, y una
  // fecha inventada en un comprobante contable no la detecta nadie.
  fechaEmision: null,
};

// ── run() ──────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} primaryRows - filas del excel "FINADIET CONCEPTOS" (ver
 *   js/parsers/finadietAsientoParser.js). Una fila = un movimiento completo.
 * @param {object[]} _tabRows - sin uso (tabRequired: false)
 * @param {object}   mapping  - { period, finadietAsientoConfig }
 */
export function runFinadietAsiento(primaryRows, _tabRows, mapping) {
  if (!primaryRows?.length) {
    return { error: 'No hay datos del archivo "FINADIET CONCEPTOS". Subilo en el Paso 2 antes de ejecutar.' };
  }

  const cfg = resolveConfig(mapping.finadietAsientoConfig);
  if (Object.keys(cfg.cuentas).length === 0) {
    return {
      error: 'La tabla de cuentas contables de FINADIET quedó vacía. Cargala en "Cuentas contables y '
        + 'centros de costo" del Paso 2 antes de ejecutar — sin ella no se puede clasificar ninguna cuenta.',
    };
  }
  const centrosPorClave = indexCentros(cfg.centros);

  // Acumuladores anidados (grupo → cuenta → importes). Anidados y no con una
  // clave compuesta a propósito: un nombre de cuenta o de concepto que traiga el
  // separador partiría la clave y mezclaría dos cuentas en una línea.
  const accResultado   = new Map();  // nombre de centro → cuenta final → importes
  const accPatrimonial = new Map();  // categoría        → cuenta final → importes
  const accPorCentro   = new Map();  // cuenta final     → concepto     → importes
  const accGral        = new Map();  // código de cuenta → concepto     → importes

  const cuentasSinClasificar = new Map();  // código → cantidad de lados
  const centrosSinClasificar = new Map();  // nombre → cantidad de lados
  let ladosSinCentro    = 0;  // cuenta de Resultado en una fila sin centro de costo
  let ladosClasificados = 0;

  for (const row of primaryRows) {
    for (const lado of ['debe', 'haber']) {
      const codigo = lado === 'debe' ? row.cuenta_debe : row.cuenta_haber;
      if (!codigo) continue;  // un movimiento puede traer un solo lado

      const ref = cfg.cuentas[codigo];
      if (!ref) { bumpCount(cuentasSinClasificar, codigo); continue; }

      const nombre = (lado === 'debe' ? row.cuenta_debe_nombre : row.cuenta_haber_nombre) || ref.nombre || '';

      let cuentaFinal;
      if (ref.tipo === 'Resultado') {
        // El prefijo de una cuenta de Resultado ES el código del centro de costo:
        // sin centro no hay cuenta final posible. Se cuenta y se avisa — no se
        // manda al asiento con un prefijo inventado, y tampoco se descarta la
        // fila entera, que dejaría afuera también su pata Patrimonial (que no
        // necesita centro para nada).
        if (!row.centro) { ladosSinCentro++; continue; }
        const centro = centrosPorClave.get(normKey(row.centro));
        if (!centro) { bumpCount(centrosSinClasificar, row.centro); continue; }
        cuentaFinal = `${centro.codigo}.${codigo}`;
        bumpAmount(accResultado, centro.nombre, cuentaFinal, lado, row.importe, nombre, row, { conceptos: true });
      } else {
        cuentaFinal = `${PREFIJO_PATRIMONIAL}.${codigo}`;
        const categoria = ref.categoria || `SIN CATEGORÍA ASIGNADA (${codigo})`;
        bumpAmount(accPatrimonial, categoria, cuentaFinal, lado, row.importe, nombre, row, { conceptos: true });
      }

      ladosClasificados++;
      const concepto = row.nro_concepto || row.concepto || '(sin concepto)';
      bumpAmount(accPorCentro, cuentaFinal, concepto, lado, row.importe, nombre, row);
      bumpAmount(accGral,      codigo,      concepto, lado, row.importe, nombre, row);
    }
  }

  // Cero lados clasificados = el archivo no tiene nada que este control pueda
  // interpretar (otro reporte, otro cliente, o la tabla de cuentas entera
  // desactualizada). Con el asiento vacío, Debe y Haber dan 0 y "cierran": ese es
  // el falso verde que D-043 mató en Brutos/GS Pers, y acá no puede pasar.
  if (ladosClasificados === 0) {
    const codigos = [...cuentasSinClasificar.keys()];
    return {
      error: 'Ninguna cuenta del archivo se pudo clasificar, así que no hay asiento para armar. '
        + (codigos.length
          ? `Los códigos de cuenta que trae el archivo (${codigos.slice(0, 8).join(', ')}`
            + `${codigos.length > 8 ? `, +${codigos.length - 8} más` : ''}) no están en la tabla de cuentas `
            + 'de FINADIET: revisá que sea el archivo del cliente correcto, o actualizá la tabla en el Paso 2.'
          : 'Revisá que sea el excel "FINADIET CONCEPTOS" del período.'),
    };
  }

  const asiento    = armarAsiento(accResultado, accPatrimonial, cfg, centrosPorClave);
  const diferencia = round2(asiento.totalDebe - asiento.totalHaber);

  return {
    period:       mapping.period || '',
    fechaEmision: cfg.fechaEmision || null,
    asiento,
    diferencia,
    cierra: Math.abs(diferencia) <= TOL,
    ctasPorCentro: armarPlana(accPorCentro),
    ctasGral:      armarPlana(accGral),
    sinClasificar: {
      cuentas: [...cuentasSinClasificar.entries()].map(([codigo, lados]) => ({ codigo, lados })),
      centros: [...centrosSinClasificar.entries()].map(([nombre, lados]) => ({ nombre, lados })),
    },
    ladosSinCentro,
    ladosClasificados,
    filasOrigen: primaryRows.length,
  };
}

/**
 * Config efectiva: lo que el cliente tenga guardado REEMPLAZA a la semilla, no se
 * mergea (D-035). Si se mergeara, una cuenta que el analista borró del editor
 * volvería a aparecer sola en la corrida siguiente, y el editor dejaría de decir
 * la verdad sobre qué tabla se está usando.
 */
function resolveConfig(cfgIn) {
  const cfg = cfgIn || {};
  return {
    cuentas:         cfg.cuentas         || { ...FINADIET_CUENTAS_SEED },
    centros:         cfg.centros         || { ...FINADIET_CENTROS_SEED },
    ordenCategorias: cfg.ordenCategorias || [...FINADIET_ORDEN_CATEGORIAS],
    fechaEmision:    cfg.fechaEmision ?? null,
  };
}

/**
 * Centro de costo por clave normalizada. El nombre viene de un excel del cliente:
 * 'Administración' y 'ADMINISTRACION' son el mismo centro, y compararlos crudos
 * lo deja como "centro sin clasificar" sin que haya nada mal en el archivo. Es el
 * `norm()` para texto de CLAUDE.md — nada que ver con la clave de legajo, que
 * este control no usa porque su unidad no es el empleado.
 */
function indexCentros(centros) {
  const map = new Map();
  for (const [nombre, codigo] of Object.entries(centros || {})) {
    map.set(normKey(nombre), { nombre, codigo });
  }
  return map;
}

function normKey(v) {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase()
    .replace(/\s+/g, ' ');
}

function bumpCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

/**
 * Suma `importe` al lado Debe/Haber de `grupo → clave`, creando lo que falte.
 *
 * Con `{ conceptos: true }` además va guardando QUÉ CONCEPTOS forman ese
 * importe: es lo que abre la ficha por cuenta. El desglose se acumula ADENTRO de
 * la entrada y no en una tabla aparte a propósito — una tabla aparte habría que
 * cruzarla contra el asiento por una clave armada dos veces, y el día que el
 * agrupamiento cambie de un lado y no del otro la ficha mostraría los conceptos
 * de otra cuenta sumando a un saldo que no es el suyo. Sumando en el mismo lugar
 * y en la misma pasada, el desglose no puede desalinearse del saldo que explica.
 */
function bumpAmount(map, grupo, clave, lado, importe, nombre, row = null, { conceptos = false } = {}) {
  if (!map.has(grupo)) map.set(grupo, new Map());
  const inner = map.get(grupo);
  let e = inner.get(clave);
  if (!e) {
    e = { debe: 0, haber: 0, nombre: nombre || '', nro: row?.nro_concepto || '', concepto: row?.concepto || '' };
    inner.set(clave, e);
  }
  e[lado] = round2(e[lado] + importe);
  if (!e.nombre && nombre) e.nombre = nombre;
  if (!e.concepto && row?.concepto) e.concepto = row.concepto;
  if (conceptos) bumpConcepto(e, lado, importe, row);
}

/** Un concepto de liquidación adentro de una cuenta del asiento (cuentaConceptos.js). */
function bumpConcepto(e, lado, importe, row) {
  if (!e.conceptos) e.conceptos = new Map();
  acumularConcepto(e.conceptos, {
    nro:      row?.nro_concepto,
    concepto: row?.concepto,
    debe:     lado === 'debe'  ? importe : 0,
    haber:    lado === 'haber' ? importe : 0,
  });
}

/**
 * Solapa ASIENTO: bloques de cuentas de Resultado por centro de costo (ordenados
 * por el código del centro) y después bloques de cuentas Patrimoniales por
 * categoría, en el orden de `cfg.ordenCategorias`.
 */
function armarAsiento(accResultado, accPatrimonial, cfg, centrosPorClave) {
  const codigoDeCentro = nombre => centrosPorClave.get(normKey(nombre))?.codigo ?? Number.MAX_SAFE_INTEGER;

  const porCentro = conLineas(accResultado);
  const bloques = [];
  for (const grupo of [...porCentro.keys()].sort((a, b) => codigoDeCentro(a) - codigoDeCentro(b))) {
    bloques.push({ tipo: 'centro', label: grupo, lineas: porCentro.get(grupo) });
  }

  const porCategoria = conLineas(accPatrimonial);
  const ordenadas = [
    ...cfg.ordenCategorias.filter(c => porCategoria.has(c)),
    ...[...porCategoria.keys()].filter(c => !cfg.ordenCategorias.includes(c)).sort(),
  ];
  for (const grupo of ordenadas) {
    bloques.push({ tipo: 'categoria', label: grupo, lineas: porCategoria.get(grupo) });
  }

  let totalDebe = 0, totalHaber = 0;
  for (const b of bloques) {
    for (const l of b.lineas) { totalDebe += l.debe; totalHaber += l.haber; }
  }
  return { bloques, totalDebe: round2(totalDebe), totalHaber: round2(totalHaber) };
}

/**
 * Map(grupo → Map(cuenta → importes)) → Map(grupo → [líneas ordenadas por código]).
 * Una cuenta que quedó en 0,00 de los dos lados no es una línea del asiento (pasa
 * cuando dos movimientos de la misma cuenta se cancelan entre sí), y un grupo que
 * se queda sin líneas no se emite.
 */
function conLineas(acc) {
  const out = new Map();
  for (const [grupo, inner] of acc) {
    const lineas = [];
    for (const [cuenta, v] of inner) {
      if (Math.abs(v.debe) <= TOL && Math.abs(v.haber) <= TOL) continue;
      lineas.push({ cuenta, nombre: v.nombre, debe: v.debe, haber: v.haber, conceptos: conceptosEnOrden(v.conceptos) });
    }
    if (lineas.length === 0) continue;
    lineas.sort((a, b) => compareCodigos(a.cuenta, b.cuenta));
    out.set(grupo, lineas);
  }
  return out;
}

/** Solapas planas: una fila por cuenta + concepto. */
function armarPlana(acc) {
  const rows = [];
  let totalDebe = 0, totalHaber = 0;

  for (const [cuenta, inner] of acc) {
    for (const v of inner.values()) {
      if (Math.abs(v.debe) <= TOL && Math.abs(v.haber) <= TOL) continue;
      rows.push({ cuenta, concepto: v.concepto || v.nombre, nro: v.nro, debe: v.debe, haber: v.haber });
      totalDebe += v.debe; totalHaber += v.haber;
    }
  }

  rows.sort((a, b) => {
    const c = compareCodigos(a.cuenta, b.cuenta);
    return c !== 0 ? c : String(a.nro).localeCompare(String(b.nro), 'es', { numeric: true });
  });

  return { rows, totalDebe: round2(totalDebe), totalHaber: round2(totalHaber) };
}

/**
 * Orden de códigos de cuenta por tramo numérico: '441.521101' antes que
 * '441.521101.1', y '100.213215.2' después de '100.213215.1'. Como texto,
 * '100.521101.10' saldría antes de '100.521101.2'.
 */
function compareCodigos(a, b) {
  const pa = String(a).split('.'), pb = String(b).split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const xa = pa[i], xb = pb[i];
    if (xa === undefined) return -1;
    if (xb === undefined) return 1;
    const na = Number(xa), nb = Number(xb);
    if (!isNaN(na) && !isNaN(nb)) { if (na !== nb) return na - nb; continue; }
    if (xa !== xb) return xa < xb ? -1 : 1;
  }
  return 0;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ── summarize() ────────────────────────────────────────────────────────────────

/**
 * La unidad del semáforo es la **línea de cuenta** del asiento. Un código de
 * cuenta o un centro sin clasificar cuenta como una unidad más: todavía no es una
 * línea del asiento, pero tiene que dejar de no serlo. Y si el asiento no cierra,
 * el reporte entero es sospechoso — se marcan todas las unidades, igual que hace
 * `summarizeAcreditacionesReporte` cuando no cierra contra el archivo de origen.
 */
export function summarizeFinadietAsiento(results) {
  if (results.error) {
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null,
      diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const lineas        = contarLineas(results.asiento);
  const sinClasificar = results.sinClasificar.cuentas.length + results.sinClasificar.centros.length;
  const unitsTotal    = lineas + sinClasificar;
  const unitsWithDiff = results.cierra ? sinClasificar : unitsTotal;

  const insights = [];
  if (!results.cierra) {
    insights.push({ type: 'warning', label: 'diferencia entre Debe y Haber', value: fmtNum(Math.abs(results.diferencia)) });
  }
  if (results.sinClasificar.cuentas.length > 0) {
    insights.push({ type: 'warning', label: 'cuentas sin clasificar', value: results.sinClasificar.cuentas.length });
  }
  if (results.sinClasificar.centros.length > 0) {
    insights.push({ type: 'warning', label: 'centros de costo sin clasificar', value: results.sinClasificar.centros.length });
  }
  if (results.ladosSinCentro > 0) {
    insights.push({ type: 'warning', label: 'cuentas de Resultado en filas sin centro de costo', value: results.ladosSinCentro });
  }

  return {
    status:   (results.cierra && unitsWithDiff === 0) ? 'success' : 'warning',
    headline: `${lineas} línea${lineas === 1 ? '' : 's'} de asiento · ${fmtNum(results.asiento.totalDebe)} al Debe`,
    insights,
    unit: 'cuenta',
    unitsTotal,
    unitsWithDiff,
    diffTotalAmount: Math.abs(results.diferencia),
    worstCase: null,
    contextNote: results.cierra
      ? 'el asiento cierra: Debe = Haber'
      : `Debe ${fmtNum(results.asiento.totalDebe)} contra Haber ${fmtNum(results.asiento.totalHaber)}`,
  };
}

function contarLineas(asiento) {
  return asiento.bloques.reduce((acc, b) => acc + b.lineas.length, 0);
}

// ── Pantalla de resultados ────────────────────────────────────────────────────

export function renderFinadietAsientoResults(results, container) {
  if (results.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }

  renderResumenDetalle(container, {
    controlId: 'finadiet_asiento',
    conDiferencias: !results.cierra
      || results.sinClasificar.cuentas.length > 0 || results.sinClasificar.centros.length > 0,
    resumen: (panel) => renderResumenTab(panel, results),
    fichas: (panel) => renderFichasTab(panel, results),
    planilla: (panel) => renderDetalleTab(panel, results),
  });
}

function renderResumenTab(panel, results) {
  const lineas = contarLineas(results.asiento);
  const { cuentas, centros } = results.sinClasificar;
  const hayPendientes = cuentas.length > 0 || centros.length > 0 || results.ladosSinCentro > 0;

  renderVerdict(panel, {
    tone:  !results.cierra ? 'error' : hayPendientes ? 'warn' : 'ok',
    title: !results.cierra
      ? `El asiento no cierra: Debe y Haber difieren en ${fmtNum(Math.abs(results.diferencia))}`
      : hayPendientes
        ? `El asiento cierra, pero quedó algo sin clasificar — revisalo antes de mandarlo`
        : `El asiento cierra: ${lineas} línea${lineas === 1 ? '' : 's'} y Debe = Haber`,
    body: [
      results.period ? periodToLabel(results.period) : null,
      results.fechaEmision ? `emisión ${fmtFecha(results.fechaEmision)}` : 'sin fecha de emisión cargada',
      `${results.filasOrigen} fila(s) en el archivo de origen`,
    ].filter(Boolean).join(' · '),
  });

  renderTiles(panel, [
    { label: 'Líneas del asiento', value: lineas },
    { label: 'Total Debe',  value: fmtNum(results.asiento.totalDebe) },
    { label: 'Total Haber', value: fmtNum(results.asiento.totalHaber) },
    { label: 'Diferencia',  value: fmtNum(results.diferencia),
      tone: results.cierra ? undefined : 'error',
      sub: results.cierra ? 'cierra' : 'no cierra' },
    { label: 'Sin clasificar', value: cuentas.length + centros.length,
      tone: (cuentas.length + centros.length) > 0 ? 'warn' : undefined,
      sub: 'cuentas + centros de costo' },
  ]);

  // Un problema por línea, con qué hacer: son los tres casos en los que el
  // asiento sale incompleto, y ninguno se puede resolver desde acá adivinando.
  const items = [];
  for (const c of cuentas) {
    items.push({
      sev: 'hi', who: `Cuenta ${c.codigo}`,
      what: `No está en la tabla de cuentas contables de FINADIET, así que su importe quedó afuera del asiento.`,
      why:  `Aparece en ${c.lados} movimiento(s). Agregala en "Cuentas contables y centros de costo" del Paso 2 `
        + 'indicando si es de Resultado o Patrimonial, y volvé a ejecutar.',
    });
  }
  for (const c of centros) {
    items.push({
      sev: 'hi', who: `Centro de costo ${c.nombre}`,
      what: 'No está en la tabla de centros de costo, así que las cuentas de Resultado de esas filas quedaron afuera.',
      why:  `Aparece en ${c.lados} movimiento(s). Agregalo con su código de prefijo en el Paso 2 y volvé a ejecutar.`,
    });
  }
  if (results.ladosSinCentro > 0) {
    items.push({
      sev: 'hi', who: 'Filas sin centro de costo',
      what: `${results.ladosSinCentro} cuenta(s) de Resultado vienen en filas que no traen centro de costo.`,
      why:  'El prefijo de una cuenta de Resultado ES el código del centro, así que esos importes no se pudieron '
        + 'asentar. Las cuentas Patrimoniales de esas mismas filas sí entraron (llevan prefijo '
        + `${PREFIJO_PATRIMONIAL} sin importar el centro). Revisá esas filas en el archivo de origen.`,
    });
  }

  if (items.length > 0) {
    renderIssues(panel, { heading: `Qué quedó afuera del asiento · ${items.length} caso(s)`, items });
  }

  renderChecks(panel, {
    heading: 'Chequeos de coherencia',
    items: [
      { label: 'El asiento cierra (Debe = Haber)',
        detail: results.cierra ? 'exacto' : fmtNum(results.diferencia), ok: results.cierra },
      { label: 'Cuentas contables reconocidas',
        detail: cuentas.length === 0 ? 'todas' : `${cuentas.length} sin clasificar`, ok: cuentas.length === 0 },
      { label: 'Centros de costo reconocidos',
        detail: centros.length === 0 ? 'todos' : `${centros.length} sin clasificar`, ok: centros.length === 0 },
      { label: 'Fecha de emisión cargada',
        detail: results.fechaEmision ? fmtFecha(results.fechaEmision) : 'falta completarla en el Paso 2',
        ok: !!results.fechaEmision },
    ],
  });
}

// ── Solapa Fichas — una por cuenta contable ───────────────────────────────────
//
// La unidad de este control es la CUENTA, no el empleado: el archivo de FINADIET
// no trae legajo, y dos filas del mismo empleado no se distinguen ni tienen por
// qué distinguirse (§4 de la spec del control). Así que la ficha por legajo no
// aplica — lo que sirve es abrir la cuenta y ver **qué conceptos la componen**,
// que es justo lo que hoy no se puede ver sin bajar el .xlsx y filtrar a mano.
//
// Además de las líneas del asiento entran como ficha las cuentas y los centros
// que quedaron SIN CLASIFICAR. Todavía no son una línea del asiento —y por eso
// el semáforo las cuenta como una unidad con diferencia—, pero tienen que dejar
// de no serlo: con su ficha, el analista las encuentra con el chip "Sin
// comparar" en vez de tener que volver al Resumen a buscarlas.

/**
 * El único estado que no aplica acá. **Este control cuadra al centavo contra sí
 * mismo** (Debe = Haber), no contra un umbral: no hay monto de diferencia del
 * cliente que aflojar. El chip va igual, en gris y con su 0, y lo dice en el
 * `title` — sacarlo movería los otros cuatro de lugar, que es justo lo que el
 * estándar viene a arreglar (§3).
 *
 * "Sin comparar" no está acá, al revés que en la Planilla: en las fichas SÍ
 * aplica, porque una cuenta que no está en la tabla del cliente es exactamente
 * "falta un lado".
 */
const NO_APLICA_FICHA_ASIENTO = {
  margen: 'el asiento cuadra al centavo contra sí mismo (Debe = Haber), no hay un umbral que medir',
};

/** Estado del caso → el gradiente del avatar (§4). */
const SEVERIDAD_POR_ESTADO = { conDif: 'error', sinComparar: 'warn', margen: 'info', centavo: 'ok' };

/**
 * En qué estado cerró una cuenta. Cuenta lo mismo que el semáforo
 * (`summarizeFinadietAsiento`), y eso no es una coincidencia que haya que
 * mantener a mano: si el asiento cierra, lo único con diferencia son las cuentas
 * y los centros sin clasificar; si no cierra, el entregable entero es sospechoso
 * y quedan marcadas todas. Está escrito como assert en
 * `tests/fichasCuentaContable.test.js`.
 *
 * @param {object} ficha - una de las que arma `fichasDeAsiento`
 * @param {{ cierra: boolean }} corrida
 * @returns {'conDif'|'centavo'|'sinComparar'}
 */
export function estadoDeCuentaAsiento(ficha, { cierra }) {
  if (ficha.sinClasificar) return 'sinComparar';
  // `cuadra === false` es un desglose que NO suma al saldo. Los conceptos se
  // acumulan en la misma pasada que el saldo, así que no puede pasar; se mira
  // igual, porque es el único lugar donde se vería si algún día se desalinean y
  // un desglose que no suma no puede salir en verde. `cuadra === null` es otra
  // cosa: una corrida vieja que no guardó el desglose. Eso no es una diferencia.
  if (ficha.conciliacion?.cuadra === false) return 'conDif';
  return cierra ? 'centavo' : 'conDif';
}

/**
 * Una ficha por línea del asiento, más una por cuenta y por centro sin
 * clasificar, **ya armadas** (tarjeta cerrada + cuerpo). Exportada así, entera,
 * porque es lo que hay que poder afirmar sin abrir un navegador: que los estados
 * cuentan lo mismo que el semáforo y que el desglose de cada cuenta suma exacto
 * su saldo. Si el test mirara una versión intermedia, probaría otra cosa que la
 * que se dibuja.
 */
export function fichasDeAsiento(results) {
  const fichas = [];

  for (const bloque of results.asiento.bloques) {
    for (const l of bloque.lineas) {
      fichas.push({
        id:      `${bloque.label} ⋮ ${l.cuenta}`,
        cuenta:  l.cuenta,
        nombre:  l.nombre || '',
        bloque:  { tipo: bloque.tipo, label: bloque.label },
        conciliacion: conciliarCuenta(l),
        conceptos:    l.conceptos || [],
        sinClasificar: null,
      });
    }
  }

  for (const c of results.sinClasificar.cuentas) {
    fichas.push({
      id: `cuenta sin clasificar ⋮ ${c.codigo}`,
      cuenta: c.codigo,
      nombre: 'No está en la tabla de cuentas contables',
      bloque: null,
      conciliacion: null,
      conceptos: [],
      sinClasificar: { tipo: 'cuenta', lados: c.lados },
    });
  }

  for (const c of results.sinClasificar.centros) {
    fichas.push({
      id: `centro sin clasificar ⋮ ${c.nombre}`,
      cuenta: c.nombre,
      nombre: 'Centro de costo que no está en la tabla',
      bloque: null,
      conciliacion: null,
      conceptos: [],
      sinClasificar: { tipo: 'centro', lados: c.lados },
    });
  }

  return fichas.map(f => fichaDeCuenta(f, results));
}

const MARCAS_ASIENTO = [
  { value: 'resultado',   label: 'Cuenta de resultado',
    match: f => f.bloque?.tipo === 'centro' },
  { value: 'patrimonial', label: 'Cuenta patrimonial',
    match: f => f.bloque?.tipo === 'categoria' },
  { value: 'dos_lados',   label: 'Con movimientos en los dos lados',
    match: f => !!f.conciliacion
      && Math.abs(f.conciliacion.debe) > TOL && Math.abs(f.conciliacion.haber) > TOL },
  { value: 'sin_asentar', label: 'Quedó afuera del asiento',
    match: f => !!f.sinClasificar },
];

function renderFichasTab(panel, results) {
  renderFichasPanel(panel, {
    fichas: fichasDeAsiento(results),
    unitLabel: 'cuentas',
    estadoDe: f => f.estado,
    noAplica: NO_APLICA_FICHA_ASIENTO,
    marcas: MARCAS_ASIENTO,
    ordenes: [
      { value: 'saldo',     label: 'Mayor saldo',
        compare: (a, b) => (b.conciliacion?.monto ?? -1) - (a.conciliacion?.monto ?? -1) },
      { value: 'cuenta',    label: 'Código de cuenta',
        compare: (a, b) => compareCodigos(a.cuenta, b.cuenta) },
      { value: 'conceptos', label: 'Más conceptos adentro',
        compare: (a, b) => b.conceptos.length - a.conceptos.length },
      { value: 'nombre',    label: 'Nombre de la cuenta',
        compare: (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es') },
    ],
    getLabel: f => `${f.cuenta} ${f.nombre} ${f.bloque?.label || ''}`,
    // La unidad de este control es la cuenta: el buscador no puede ofrecer
    // buscar por legajo, que en esta pantalla no existe.
    searchLabel: 'Buscar cuenta, concepto o centro de costo',
    searchPlaceholder: 'Código o nombre de cuenta…',
    getAmount: f => f.conciliacion?.monto ?? null,
    amountLabel: 'Σ saldo de las cuentas',
    onExport: (exportEl) => mountExportMenu(exportEl, results),
  });
}

/** El descriptor de la ficha: la tarjeta cerrada y lo que se dibuja al abrirla. */
function fichaDeCuenta(f, results) {
  const estado = estadoDeCuentaAsiento(f, results);
  const sev = SEVERIDAD_POR_ESTADO[estado] || 'info';
  const c = f.conciliacion;
  const badge = badgeDeCuenta(f, results);

  return {
    ...f,
    estado,
    unit: f.cuenta,
    severity: sev,
    name: f.nombre || '(sin nombre de cuenta)',
    tag: f.sinClasificar
      ? { text: f.sinClasificar.tipo === 'cuenta' ? 'cuenta sin clasificar' : 'centro sin clasificar' }
      : { text: f.bloque.label },
    badge,
    context: c
      ? contextoDeCuenta(c, fmtNum)
      : [`Aparece en ${f.sinClasificar.lados} movimiento${f.sinClasificar.lados === 1 ? '' : 's'}`,
         'No entró al asiento'],
    // La marca que ya dice lo mismo que el badge no se repite abajo: el badge es
    // la causa principal y la marca es "qué MÁS le pasa" — verlo dos veces en la
    // misma tarjeta no agrega nada. Sigue estando en "Marcas ▾" como filtro.
    marks: MARCAS_ASIENTO
      .filter(m => m.match(f) && m.label !== badge?.text)
      .map(m => ({ text: m.label, tone: m.value === 'sin_asentar' ? 'neutral' : 'info' })),
    amountLabel: c ? rotuloDeSaldo(c) : 'SIN ASENTAR',
    // `null` y no `0`: la cuenta sin clasificar no tiene un saldo que valga cero,
    // no tiene saldo. Sale como '—', que es lo que corresponde (CLAUDE.md).
    amount: c ? c.monto : null,
    amountTone: sev === 'error' ? 'error' : sev === 'warn' ? 'warn' : undefined,
    body: c ? {
      strip:  tiraDeCuenta(c),
      detail: detalleDeConceptos(f.conceptos, c),
      conclusion: conclusionDeCuenta(f, c, results),
    } : {
      strip: [
        { label: 'Movimientos en el archivo', value: String(f.sinClasificar.lados) },
        { label: f.sinClasificar.tipo === 'cuenta' ? 'Cuenta contable' : 'Centro de costo',
          value: 'sin clasificar', invert: true },
        { label: 'Asentado', value: 0, residuo: true },
      ],
      conclusion: conclusionSinClasificar(f),
    },
  };
}

/** La causa principal, en una línea. Sin causa no hay badge. */
function badgeDeCuenta(f, results) {
  if (f.sinClasificar) {
    return { text: 'Quedó afuera del asiento', tone: 'warn' };
  }
  if (f.conciliacion.cuadra === false) {
    return { text: 'Los conceptos no suman al saldo', tone: 'error' };
  }
  if (!results.cierra) {
    return {
      text: 'El asiento no cierra',
      title: `Debe ${fmtNum(results.asiento.totalDebe)} contra Haber ${fmtNum(results.asiento.totalHaber)}: `
        + 'mientras no cierre, todas las cuentas quedan en revisión.',
      tone: 'error',
    };
  }
  return undefined;
}

/** No un resumen: una instrucción. Qué mirar, descartando lo que ya se explicó. */
function conclusionDeCuenta(f, c, results) {
  if (c.cuadra === false) {
    return {
      tone: 'error',
      title: `El desglose de esta cuenta no suma al saldo: sobran ${fmtNum(c.residuo)}`,
      text: 'Los conceptos de la tabla de abajo se acumulan con el mismo importe que el saldo, así que esto no '
        + 'debería pasar nunca. No mandes el asiento: avisá que el desglose por concepto de esta cuenta quedó '
        + 'desalineado.',
    };
  }
  if (!results.cierra) {
    const { cuentas, centros } = results.sinClasificar;
    const pendientes = cuentas.length + centros.length + (results.ladosSinCentro > 0 ? 1 : 0);
    return {
      tone: 'error',
      title: `El asiento no cierra por ${fmtNum(Math.abs(results.diferencia))}`,
      text: (c.conDesglose
        ? `Esta cuenta cuadra: ${concordancia(c.cantidad).sujetoSuyo} ${concordancia(c.cantidad).suman} exacto su saldo. `
        : 'Esta corrida no guardó el desglose por concepto de la cuenta. ')
        + (pendientes > 0
          ? 'La diferencia viene de lo que quedó afuera — filtrá por el chip "Sin comparar" para verlo y '
            + 'resolvelo en el Paso 2 antes de mandar el asiento.'
          : 'No hay nada sin clasificar, así que la diferencia está en los importes del archivo de origen: '
            + 'revisalos antes de mandar el asiento.'),
    };
  }
  if (!c.conDesglose) {
    return {
      tone: 'warn',
      title: 'Esta corrida no guardó el desglose por concepto',
      text: 'El asiento cierra y esta cuenta está bien, pero la corrida se guardó antes de que la ficha '
        + 'mostrara qué conceptos forman cada cuenta, así que ese detalle no está. Volvé a ejecutar el control '
        + 'con el mismo archivo si querés verlo.',
    };
  }
  return {
    tone: 'ok',
    title: `Cuadra al centavo: ${fmtNum(c.monto)} al ${c.lado || 'saldo cero'}`,
    text: `${concordancia(c.cantidad).sujeto} de la tabla de abajo ${concordancia(c.cantidad).suman} `
      + 'exactamente el saldo de esta cuenta, y el asiento cierra. No hay nada para revisar acá.',
  };
}

function conclusionSinClasificar(f) {
  if (f.sinClasificar.tipo === 'cuenta') {
    return {
      tone: 'warn',
      title: `La cuenta ${f.cuenta} no está en la tabla de cuentas contables`,
      text: `Su importe quedó afuera del asiento en ${f.sinClasificar.lados} movimiento(s), así que el asiento `
        + 'no cierra por esa plata. Agregala en "Cuentas contables y centros de costo" del Paso 2, indicando '
        + 'si es de Resultado o Patrimonial, y volvé a ejecutar. No la mandes sin eso.',
    };
  }
  return {
    tone: 'warn',
    title: `El centro de costo "${f.cuenta}" no está en la tabla`,
    text: `Las cuentas de Resultado de ${f.sinClasificar.lados} movimiento(s) quedaron afuera del asiento: el `
      + 'prefijo de una cuenta de Resultado ES el código del centro, y sin código no hay cuenta final posible. '
      + `Las Patrimoniales de esas mismas filas sí entraron (llevan prefijo ${PREFIJO_PATRIMONIAL}). Agregá el `
      + 'centro con su código en el Paso 2 y volvé a ejecutar.',
  };
}

// ── Solapa Planilla ───────────────────────────────────────────────────────────
//
// Las tres solapas del archivo, cada una con la barra estándar completa (§3) y
// las columnas de importe en las dos bandas naturales de un asiento: DEBE y
// HABER. Antes eran un desplegable "Solapa" con una sola barra compartida.
//
// **Este control no compara contra un umbral**: el asiento cuadra al centavo
// contra sí mismo (Debe = Haber). Por eso el chip "Dentro del margen" va en gris
// y deshabilitado, con el motivo en su `title` — no oculto: sacarlo movería los
// demás de lugar, que es justo lo que el estándar viene a arreglar.

const NO_APLICA_ASIENTO = {
  margen: 'el asiento cuadra al centavo contra sí mismo (Debe = Haber), no hay un umbral que medir',
  sinComparar: 'las tres solapas salen del mismo archivo, así que no hay un lado que pueda faltar',
};

function renderDetalleTab(panel, results) {
  initTabs(panel, {
    tabs: [
      { id: 'asiento', label: 'ASIENTO', render: (p) => vistaAsiento(p, results) },
      { id: 'cc',      label: 'Ctas Cbles CENTRO COSTO',
        render: (p) => vistaPlana(p, results, results.ctasPorCentro,
          'Una fila por cuenta + concepto, con la cuenta llevando su prefijo de centro de costo.') },
      { id: 'gral',    label: 'Cuentas Contables GRAL',
        render: (p) => vistaPlana(p, results, results.ctasGral,
          'La misma tabla con el código de cuenta limpio, sin prefijo de centro de costo.') },
    ],
  });
}

/** Los tres del estándar, iguales en las tres solapas: el archivo es uno solo. */
function mountExportMenu(exportEl, results) {
  const csvHeaders = ['Código de cuenta', 'Concepto', 'Cód. concepto', 'Suma DEBE', 'Suma HABER'];
  const csvRows = () => results.ctasPorCentro.rows.map(r => [r.cuenta, r.concepto, r.nro, fmtNum(r.debe), fmtNum(r.haber)]);
  renderExportMenu(exportEl, {
    onExcel: () => exportFinadietAsientoToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `FINADIET_Asiento_Ctas_CC_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
}

function vistaAsiento(panel, results) {
  // El bloque (centro de costo o categoría patrimonial) pasa a ser UNA COLUMNA
  // en vez de una fila de título adentro del cuerpo: una fila de título se
  // separa de su bloque en cuanto se filtra o se pagina, y además así se puede
  // filtrar por bloque desde "Marcas ▾".
  const filas = [];
  for (const bloque of results.asiento.bloques) {
    for (const l of bloque.lineas) filas.push({ ...l, grupo: bloque.label });
  }

  const columns = [
    { key: 'grupo',  label: 'Bloque',   sub: 'centro de costo o categoría', band: 'Identificación' },
    { key: 'nombre', label: 'Concepto', band: 'Identificación',
      cell: f => esc(f.nombre || '—') },
    { key: 'cuenta', label: 'Cuenta',   sub: 'código contable', band: 'Identificación', close: true },
    { key: 'debe',  label: 'Debe',  sub: 'lo que se asienta', num: true, band: 'DEBE',  close: true,
      total: () => results.asiento.totalDebe },
    { key: 'haber', label: 'Haber', sub: 'lo que se asienta', num: true, band: 'HABER', close: true,
      total: () => results.asiento.totalHaber },
  ];

  renderPlanillaPanel(panel, {
    rows: filas,
    columns,
    unitLabel: 'líneas',
    estadoDe: () => (results.cierra ? 'centavo' : 'conDif'),
    noAplica: NO_APLICA_ASIENTO,
    marcas: results.asiento.bloques.map(b => ({
      value: b.label, label: b.label, match: f => f.grupo === b.label,
    })),
    getLabel: f => `${f.cuenta} ${f.nombre || ''}`,
    searchLabel: 'Buscar cuenta o concepto',
    searchPlaceholder: 'Cuenta o concepto…',
    // Un asiento se lee entero y son decenas de líneas, no cientos.
    pageSize: 500,
    // La 1ª y la 2ª columna no son las que conviene anclar acá (el bloque se
    // repite y el concepto es largo): la tabla entra a lo ancho sin congelar.
    stickyCols: 0,
    onExport: (exportEl) => mountExportMenu(exportEl, results),
    emptyText: 'Ninguna línea del asiento quedó con los filtros puestos.',
    footnote: (shown) => `Mostrando ${shown.length} de ${filas.length} línea${filas.length === 1 ? '' : 's'}. `
      + 'Las cuentas de Resultado van agrupadas por centro de costo; las Patrimoniales, consolidadas '
      + `entre todos los centros bajo su categoría, con prefijo ${PREFIJO_PATRIMONIAL}.`,
  });
}

function vistaPlana(panel, results, plana, nota) {
  const columns = [
    { key: 'cuenta',   label: 'Código de cuenta', band: 'Identificación' },
    { key: 'concepto', label: 'Concepto', band: 'Identificación', cell: r => esc(r.concepto || '—') },
    { key: 'nro',      label: 'Cód. concepto', sub: 'el del Tabulado', band: 'Identificación', close: true,
      cell: r => esc(r.nro || '—') },
    { key: 'debe',  label: 'Suma Debe',  sub: 'lo que se asienta', num: true, band: 'DEBE',  close: true,
      total: () => plana.totalDebe },
    { key: 'haber', label: 'Suma Haber', sub: 'lo que se asienta', num: true, band: 'HABER', close: true,
      total: () => plana.totalHaber },
  ];

  renderPlanillaPanel(panel, {
    rows: plana.rows,
    columns,
    unitLabel: 'cuentas',
    estadoDe: () => (results.cierra ? 'centavo' : 'conDif'),
    noAplica: NO_APLICA_ASIENTO,
    getLabel: r => `${r.cuenta} ${r.nro} ${r.concepto}`,
    searchLabel: 'Buscar cuenta o concepto',
    searchPlaceholder: 'Cuenta o concepto…',
    stickyCols: 0,
    onExport: (exportEl) => mountExportMenu(exportEl, results),
    emptyText: 'Ninguna cuenta quedó con los filtros puestos.',
    footnote: (shown) => `Mostrando ${shown.length} de ${plana.rows.length} fila${plana.rows.length === 1 ? '' : 's'}. ${nota}`,
  });
}

// ── Editor de configuración (Paso 2 del wizard) ───────────────────────────────
//
// La tabla de cuentas y centros se edita como texto pegable desde Excel (una
// línea por cuenta, columnas separadas por TAB o por punto y coma) porque así es
// como el dato llega: Gaby manda un excel y el analista lo pega. Un formulario
// fila por fila para 38 cuentas sería más clicks para el mismo resultado.
//
// Lo que se ve en el editor ES lo que se usa en la corrida: la config guardada
// reemplaza a la semilla, no se mergea (ver resolveConfig).

const TIPOS_VALIDOS = ['Resultado', 'Patrimonial'];

export function renderFinadietAsientoConfigEditor(container, opts = {}) {
  const { config = null, openByDefault = false, onChange = () => {} } = opts;
  const current = resolveConfig(config);

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Cuentas contables y centros de costo · fecha de emisión
    </summary>

    <div style="margin-top:var(--sp-3);display:flex;gap:var(--sp-4);flex-wrap:wrap;align-items:flex-end;">
      <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
        Fecha de emisión del asiento
        <input type="date" class="form-input" data-fa-fecha
          value="${esc(current.fechaEmision || '')}" style="padding:4px 8px;max-width:190px;">
      </label>
      <p class="text-muted" style="font-size:var(--text-sm);margin:0;max-width:520px;">
        El mes del asiento sale del período de la corrida. La fecha de emisión la ponés vos: no se infiere
        del archivo ni se completa con la de hoy.
      </p>
    </div>

    <div style="margin-top:var(--sp-4);">
      <label class="form-label" style="font-size:var(--text-sm);">
        Cuentas contables — una por línea: <code>código ⇥ nombre ⇥ Resultado|Patrimonial ⇥ categoría</code>
      </label>
      <textarea class="form-input" data-fa-cuentas rows="10"
        style="width:100%;font-family:var(--font-mono, monospace);font-size:var(--text-sm);"></textarea>
      <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-1) 0 0;" data-fa-cuentas-info></p>
    </div>

    <div style="margin-top:var(--sp-3);">
      <label class="form-label" style="font-size:var(--text-sm);">
        Centros de costo — una por línea: <code>nombre ⇥ código de prefijo</code>
      </label>
      <textarea class="form-input" data-fa-centros rows="6"
        style="width:100%;font-family:var(--font-mono, monospace);font-size:var(--text-sm);"></textarea>
      <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-1) 0 0;" data-fa-centros-info></p>
    </div>

    <p class="text-muted" style="font-size:var(--text-sm);margin-top:var(--sp-3);">
      Una cuenta o un centro que no esté en estas tablas <strong>no se clasifica sola</strong>: su importe
      queda afuera del asiento y sale listada en los resultados. La categoría sólo aplica a las cuentas
      Patrimoniales — es cómo se agrupan en la solapa ASIENTO.
      <button type="button" class="btn btn--ghost btn--sm" data-fa-reset style="margin-left:var(--sp-2);">
        ↺ Volver a la tabla original
      </button>
    </p>
  `;

  const cuentasEl     = editor.querySelector('[data-fa-cuentas]');
  const centrosEl     = editor.querySelector('[data-fa-centros]');
  const cuentasInfoEl = editor.querySelector('[data-fa-cuentas-info]');
  const centrosInfoEl = editor.querySelector('[data-fa-centros-info]');
  const fechaEl       = editor.querySelector('[data-fa-fecha]');

  const pintarTextareas = () => {
    cuentasEl.value = cuentasATexto(current.cuentas);
    centrosEl.value = centrosATexto(current.centros);
  };
  pintarTextareas();

  const emitir = () => onChange({
    cuentas:         { ...current.cuentas },
    centros:         { ...current.centros },
    ordenCategorias: [...current.ordenCategorias],
    fechaEmision:    current.fechaEmision,
  });

  // `avisar: false` al montar: pintar los contadores no es una edición del
  // analista. Si emitiera, la semilla quedaría materializada como config del
  // cliente con sólo abrir el Paso 2 — "sin configurar" y "configurado igual a
  // la semilla" dejarían de distinguirse, y una mejora futura de la semilla ya
  // no llegaría a ese cliente.
  const releerCuentas = ({ avisar = true } = {}) => {
    const { cuentas, errores } = textoACuentas(cuentasEl.value);
    // Un error de formato NO se completa con un default ni se ignora: se dice
    // qué línea está mal y la tabla anterior sigue en pie hasta que se arregle.
    if (errores.length > 0) {
      cuentasInfoEl.innerHTML = `<span style="color:var(--color-danger);">Sin aplicar — ${esc(errores[0])}`
        + `${errores.length > 1 ? ` (y ${errores.length - 1} línea(s) más con problemas)` : ''}.</span>`;
      return;
    }
    current.cuentas = cuentas;
    // Las categorías nuevas se agregan al final del orden conocido; las que
    // dejaron de existir se sacan. El orden de las que ya estaban no se toca.
    const presentes = [...new Set(Object.values(cuentas).map(c => c.categoria).filter(Boolean))];
    current.ordenCategorias = [
      ...current.ordenCategorias.filter(c => presentes.includes(c)),
      ...presentes.filter(c => !current.ordenCategorias.includes(c)),
    ];
    const resultado = Object.values(cuentas).filter(c => c.tipo === 'Resultado').length;
    cuentasInfoEl.textContent = `${Object.keys(cuentas).length} cuentas — ${resultado} de Resultado, `
      + `${Object.keys(cuentas).length - resultado} Patrimoniales en ${presentes.length} categoría(s).`;
    if (avisar) emitir();
  };

  const releerCentros = ({ avisar = true } = {}) => {
    const { centros, errores } = textoACentros(centrosEl.value);
    if (errores.length > 0) {
      centrosInfoEl.innerHTML = `<span style="color:var(--color-danger);">Sin aplicar — ${esc(errores[0])}`
        + `${errores.length > 1 ? ` (y ${errores.length - 1} línea(s) más con problemas)` : ''}.</span>`;
      return;
    }
    current.centros = centros;
    centrosInfoEl.textContent = `${Object.keys(centros).length} centros de costo.`;
    if (avisar) emitir();
  };

  // Los listeners reciben un Event: se envuelven para no pasarlo como opciones.
  cuentasEl.addEventListener('change', () => releerCuentas());
  centrosEl.addEventListener('change', () => releerCentros());
  fechaEl.addEventListener('change', (e) => {
    current.fechaEmision = e.target.value || null;
    emitir();
  });
  editor.querySelector('[data-fa-reset]').addEventListener('click', () => {
    current.cuentas         = { ...FINADIET_CUENTAS_SEED };
    current.centros         = { ...FINADIET_CENTROS_SEED };
    current.ordenCategorias = [...FINADIET_ORDEN_CATEGORIAS];
    pintarTextareas();
    releerCuentas();
    releerCentros();
  });

  // Los contadores se pintan de entrada, sin esperar una edición — y sin emitir.
  releerCuentas({ avisar: false });
  releerCentros({ avisar: false });

  container.appendChild(editor);
}

function cuentasATexto(cuentas) {
  return Object.entries(cuentas)
    .map(([codigo, c]) => [codigo, c.nombre, c.tipo, c.categoria || ''].join('\t'))
    .join('\n');
}

function centrosATexto(centros) {
  return Object.entries(centros).map(([nombre, codigo]) => `${nombre}\t${codigo}`).join('\n');
}

/** Texto pegado → tabla de cuentas. Devuelve también qué líneas no se entienden. */
export function textoACuentas(texto) {
  const cuentas = {};
  const errores = [];

  String(texto || '').split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const partes = linea.split(/\t|;/).map(p => p.trim());
    const [codigo, nombre, tipo, categoria] = partes;
    const nro = i + 1;

    if (!codigo)                      { errores.push(`línea ${nro}: falta el código de cuenta`); return; }
    if (cuentas[codigo])              { errores.push(`línea ${nro}: el código ${codigo} está repetido`); return; }
    if (!TIPOS_VALIDOS.includes(tipo)) {
      errores.push(`línea ${nro} (${codigo}): el tipo tiene que ser "Resultado" o "Patrimonial"`
        + `${tipo ? `, no "${tipo}"` : ' y está vacío'}`);
      return;
    }
    if (tipo === 'Patrimonial' && !categoria) {
      errores.push(`línea ${nro} (${codigo}): una cuenta Patrimonial necesita categoría `
        + '(es cómo se agrupa en la solapa ASIENTO)');
      return;
    }

    cuentas[codigo] = { nombre: nombre || codigo, tipo };
    if (tipo === 'Patrimonial') cuentas[codigo].categoria = categoria;
  });

  return { cuentas, errores };
}

/** Texto pegado → tabla de centros de costo. */
export function textoACentros(texto) {
  const centros = {};
  const errores = [];

  String(texto || '').split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const partes = linea.split(/\t|;/).map(p => p.trim());
    const nombre = partes[0];
    const codigo = Number(partes[1]);
    const nro = i + 1;

    if (!nombre)        { errores.push(`línea ${nro}: falta el nombre del centro de costo`); return; }
    if (centros[nombre]) { errores.push(`línea ${nro}: el centro "${nombre}" está repetido`); return; }
    if (!partes[1] || isNaN(codigo)) {
      errores.push(`línea ${nro} ("${nombre}"): el código de prefijo tiene que ser un número`);
      return;
    }
    centros[nombre] = codigo;
  });

  return { centros, errores };
}

// ── Export a Excel (3 solapas) ────────────────────────────────────────────────

/**
 * Arma el .xlsx que se le manda a Contaduría de FINADIET:
 *   1. ASIENTO — hoja a mano (encabezado con mes y fecha, un bloque por centro
 *      de costo y por categoría, TOTAL al pie). No es una tabla plana, así que no
 *      tiene contrato: ver la nota de `finadietAsientoPorCentro` en contracts.js.
 *   2. Ctas Cbles CENTRO COSTO — `writeContractSheet` sobre el contrato.
 *   3. Cuentas Contables GRAL — ídem, con el código de cuenta sin prefijo.
 */
export async function exportFinadietAsientoToXlsx(results) {
  await loadExcelJS();

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  escribirHojaAsiento(wb, results);

  // La fila TOTAL entra como una fila más (ver la nota del contrato): así
  // `writeContractSheet` sigue siendo el único que escribe filas de estas hojas.
  const conTotal = plana => [
    ...plana.rows,
    { cuenta: null, concepto: 'TOTAL', nro: null, debe: plana.totalDebe, haber: plana.totalHaber },
  ];
  writeContractSheet(wb, EXPORT_CONTRACTS.finadiet_asiento_cc,   conTotal(results.ctasPorCentro));
  writeContractSheet(wb, EXPORT_CONTRACTS.finadiet_asiento_gral, conTotal(results.ctasGral));

  await downloadWorkbook(wb, `FINADIET_Asiento_Remuneraciones_${periodSuffix(results.period)}.xlsx`);
}

function escribirHojaAsiento(wb, results) {
  const ws = wb.addWorksheet('ASIENTO');
  ws.columns = [{ width: 50 }, { width: 10 }, { width: 10 }, { width: 16 }, { width: 18 }, { width: 18 }];

  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const NUM_FMT = '#,##0.00';
  const GRAY_HDR = 'FFE8E8E8';
  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

  ws.addRows([[], [], [], []]);
  ws.addRow(['ASIENTO DE REMUNERACIONES']).getCell(1).font = { ...bold, size: 12 };
  ws.addRow(['MES:',   results.period ? periodToLabel(results.period).toUpperCase() : '']).getCell(1).font = bold;
  ws.addRow(['FECHA:', results.fechaEmision ? fmtFecha(results.fechaEmision) : '']).getCell(1).font = bold;
  ws.addRow([]);

  const hdr = ws.addRow(['CONCEPTO', '', '', 'CUENTA', 'DEBE', 'HABER']);
  hdr.height = 18;
  for (const c of [1, 4, 5, 6]) {
    const cell = hdr.getCell(c);
    cell.font = bold;
    cell.fill = solidFill(GRAY_HDR);
    cell.alignment = { horizontal: c === 1 ? 'left' : 'center', vertical: 'middle' };
  }

  for (const bloque of results.asiento.bloques) {
    const bRow = ws.addRow([bloque.label]);
    bRow.getCell(1).font = bold;
    for (const l of bloque.lineas) {
      const r = ws.addRow([l.nombre, '', '', l.cuenta, l.debe, l.haber]);
      r.getCell(1).font = base;
      r.getCell(4).font = base;
      for (const c of [5, 6]) {
        r.getCell(c).font = base;
        r.getCell(c).numFmt = NUM_FMT;
        r.getCell(c).alignment = { horizontal: 'right' };
      }
    }
  }

  const total = ws.addRow(['TOTAL', '', '', '', results.asiento.totalDebe, results.asiento.totalHaber]);
  total.getCell(1).font = bold;
  for (const c of [5, 6]) {
    total.getCell(c).font = bold;
    total.getCell(c).numFmt = NUM_FMT;
    total.getCell(c).alignment = { horizontal: 'right' };
  }

  return ws;
}

// ── Helpers de formato ────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. Cualquier otra forma se muestra tal cual. */
function fmtFecha(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
