// contaDesglosada.js — Contabilidad Desglosada + Asiento (modo Generar Reporte)
//
// Control de generación, no de cruce: convierte el reporte "Totales de Concepto"
// de Axton (una fila por legajo × concepto × liquidación) en los dos
// entregables contables del mes, y controla lo único que se puede controlar sin
// otro archivo contra el que cruzar — que el asiento **cierre**.
//
//   1. **Contabilidad Desglosada** — una línea por cada lado del movimiento
//      (DEBE con la cuenta de "Cuenta Debe", HABER con la de "Cuenta Haber"),
//      10 columnas. Es el papel de trabajo del analista y el drill-down del
//      asiento: cada peso del asiento se puede rastrear hasta el legajo y el
//      concepto que lo generó.
//   2. **Asiento Contable** — la desglosada agrupada por código de cuenta, con
//      el neteo Debe/Haber de cada línea. Necesita el "Reporte de Cuentas de
//      Redefinición" del cliente, que es de donde sale el código de cada cuenta.
//      Sin ese archivo la desglosada se genera igual y el asiento se informa
//      como no armado (nunca se completa con códigos inventados).
//   3. **Desglosada con Código** — la desglosada completa, sin agrupar, con la
//      columna de código agregada. Es la que permite auditar el asiento línea
//      por línea.
//
// Viene de un prototipo HTML que el equipo armó en Claude Chat
// (`docs/traspaso-controles-equipo.md`); las reglas están verificadas contra los
// dos archivos reales de COTY del período 05/2026 — ver
// `specs/conta-desglosada-asiento.md` y D-066.
//
// **Consolidación por legajo**: acá la unidad del entregable es la línea
// contable, no el empleado, así que la desglosada emite TODAS las líneas de
// TODAS las liquidaciones de un legajo (un legajo con la mensual y la de
// provisiones aparece en las dos). Donde el legajo sí es la unidad es el "Neto a
// pagar", que se acumula por empleado: eso va con `groupRowsByLegajo` y la clave
// del cliente (D-038/D-042), no con un `trim` a mano — si no, un cliente que
// rellena con ceros («007» y «7») emitiría dos filas de neto para el mismo
// empleado y el asiento seguiría cerrando, mal.
//
// **Nada del cliente cableado.** El nombre de la cuenta de neto, el código del
// concepto de neto y la tabla de excepciones nombre→código son configuración por
// cliente (`controlConfigs`, D-035), editables en el Paso 2. La tabla de
// excepciones nace **vacía** a propósito: el prototipo traía dos cableadas
// («SAC» del centro 60 y «Sindicato FUVA a pagar») que no se disparan en el
// período verificado —el SAC de COTY liquida en los centros 656, 70 y 104, y
// cada uno lo resuelve el propio reporte de cuentas—, así que sembrarlas sería
// inventar un código por analogía (D-039). Una cuenta que no se pueda resolver
// sale como aviso, no con un código puesto por default.

import { renderResumenDetalle, renderVerdict, renderTiles, renderIssues, renderChecks } from '../ui/resultBlocks.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { renderPlanillaPanel } from '../ui/planillaPanel.js';
import { renderFichasPanel } from '../ui/fichaList.js';
import { conciliarCuenta, tiraDeCuenta, detalleDeConceptos, contextoDeCuenta, rotuloDeSaldo, concordancia }
  from '../ui/fichaCuenta.js';
import { acumularConcepto, conceptosEnOrden } from './cuentaConceptos.js';
import { initTabs } from '../ui/tabs.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum, toNum } from '../utils/currency.js';
import { periodToLabel, periodSuffix } from '../utils/dates.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { groupRowsByLegajo } from './consolidate.js';
import { EXPORT_CONTRACTS } from '../exports/contracts.js';
import { writeContractSheet } from '../exports/contractSheet.js';

// Tolerancia de comparación de importes del proyecto (CLAUDE.md). Un centavo de
// descuadre en un asiento ES un descuadre: este número no se afloja para que
// cierre.
const TOL = 0.01;

// Lo que escribe Axton en la columna de cuenta cuando el concepto no va al
// asiento. `nan`/`none` son de exports viejos y no aparecen en el archivo
// verificado; se siguen reconociendo porque cuestan una línea y su ausencia
// costaría un movimiento mal contabilizado.
const CUENTAS_NULAS = ['', 'nan', 'none'];
const CUENTA_SIN_ASIENTO = 'nada al asiento';

/**
 * Semilla de la configuración del control. Es SEMILLA, no identidad (D-035): lo
 * que manda es lo que el analista tenga guardado por cliente.
 */
export const DEFAULT_CONTA_DESGLOSADA_CONFIG = {
  /** La cuenta que no se lista línea por línea: se netea por legajo. */
  cuentaNeto: 'Sueldos a pagar',
  /** Código y nombre del concepto de la fila de neto que se emite en su lugar. */
  nroConceptoNeto: '9000',
  conceptoNeto: 'Neto a pagar',
  /**
   * Excepciones nombre de cuenta → código, para lo que el reporte de cuentas del
   * cliente no resuelve. `centroCosto: null` = vale para cualquier centro.
   * Nace vacía: ver el comentario del encabezado.
   */
  excepciones: [],
};

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** ¿Esta celda de cuenta significa "este concepto no va al asiento"? */
function cuentaNula(valor) {
  const n = norm(valor);
  return CUENTAS_NULAS.includes(n) || n.includes(CUENTA_SIN_ASIENTO);
}

/**
 * Config efectiva: lo guardado REEMPLAZA a la semilla, no se mergea (D-035). Si
 * se mergeara, una excepción que el analista borró volvería sola en la corrida
 * siguiente y el editor dejaría de decir la verdad sobre qué se está usando.
 */
function resolveConfig(cfgIn) {
  const cfg = cfgIn || {};
  return {
    cuentaNeto:      cfg.cuentaNeto      ?? DEFAULT_CONTA_DESGLOSADA_CONFIG.cuentaNeto,
    nroConceptoNeto: cfg.nroConceptoNeto ?? DEFAULT_CONTA_DESGLOSADA_CONFIG.nroConceptoNeto,
    conceptoNeto:    cfg.conceptoNeto    ?? DEFAULT_CONTA_DESGLOSADA_CONFIG.conceptoNeto,
    excepciones:     Array.isArray(cfg.excepciones) ? cfg.excepciones : [],
  };
}

// ── run() ─────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} primaryRows - filas del reporte "Totales de Concepto"
 *   (ver js/parsers/totalesConceptoParser.js). Una fila = un concepto liquidado
 *   de un legajo en una liquidación.
 * @param {object[]} _tabRows - sin uso (tabRequired: false)
 * @param {object}   mapping  - { period, legajoKeyMode, contaDesglosadaConfig,
 *                                cuentas_refRows }
 */
export function runContaDesglosada(primaryRows, _tabRows, mapping) {
  if (!primaryRows?.length) {
    return {
      error: 'No hay datos del reporte "Totales de Concepto". Subilo en el Paso 2 antes de ejecutar.',
    };
  }

  const cfg = resolveConfig(mapping.contaDesglosadaConfig);
  if (!norm(cfg.cuentaNeto)) {
    return {
      error: 'Falta indicar cuál es la cuenta del neto a pagar (la que se netea por empleado en vez de '
        + 'listarse línea por línea). Completala en "Contabilidad Desglosada" del Paso 2 — sin ella el '
        + 'asiento saldría con una línea por cada concepto que toca esa cuenta.',
    };
  }

  const keyFn = makeLegajoKey(mapping.legajoKeyMode);
  const desglosada = armarDesglosada(primaryRows, cfg, keyFn);

  if (desglosada.lineas.length === 0) {
    return {
      error: 'Ninguna fila del reporte tiene cuenta contable, así que no hay nada que desglosar. '
        + 'Verificá que el "Totales de Concepto" se haya bajado con las columnas "Cuenta Debe" y '
        + '"Cuenta Haber" completas.',
    };
  }

  const cuentasRef = mapping.cuentas_refRows || [];
  const asiento = cuentasRef.length ? armarAsiento(desglosada.lineas, cuentasRef, cfg) : null;

  return {
    period: mapping.period || '',
    // El nombre de la cuenta de neto viaja al resultado porque la pantalla lo
    // muestra: es del cliente, no del control, y puede no ser "Sueldos a pagar".
    cuentaNeto: cfg.cuentaNeto,
    ...desglosada,
    asiento,
    filasOrigen: primaryRows.length,
  };
}

// ── Paso 1: la desglosada ─────────────────────────────────────────────────────

/**
 * Las 6 reglas del desdoblamiento, en el orden en que se aplican a cada fila:
 *   1. **Desdoblamiento** — hasta dos líneas: DEBE con la cuenta de "Cuenta
 *      Debe", HABER con la de "Cuenta Haber", mismo importe.
 *   2. **Exclusión** — el lado cuya cuenta está vacía o dice "Nada al asiento"
 *      no genera línea.
 *   3. **Anulación** — si las dos cuentas son la misma, la fila entera se
 *      descarta: el movimiento entra y sale de la misma cuenta.
 *   4. **Neto a pagar** — la cuenta de neto no se lista: se acumula por legajo
 *      respetando el signo y se emite UNA línea por empleado.
 *   5. **Negativos** — un importe negativo invierte el lado (lo que iba al DEBE
 *      va al HABER) con el monto en positivo; la columna Importe conserva el
 *      signo original, que es lo que permite reconocer la fila en el origen.
 *   6. **Formato** — la fecha de ingreso y el centro de costo salen tal cual
 *      vienen del reporte.
 */
function armarDesglosada(rows, cfg, keyFn) {
  const cuentaNeto = norm(cfg.cuentaNeto);
  const lineas = [];
  const cuentas = new Set();

  let filasAnuladas = 0;      // regla 3: las dos cuentas iguales
  let filasSinCuenta = 0;     // regla 2, los dos lados
  let filasSinImporte = 0;    // la fila tiene cuenta contable pero el importe vino vacío

  for (const row of rows) {
    const af = row.cuenta_debe;
    const ag = row.cuenta_haber;

    if (!cuentaNula(af) && !cuentaNula(ag) && norm(af) === norm(ag)) { filasAnuladas++; continue; }

    const lados = [];
    if (!cuentaNula(af)) lados.push(['DEBE', af]);
    if (!cuentaNula(ag)) lados.push(['HABER', ag]);
    if (lados.length === 0) { filasSinCuenta++; continue; }

    const importe = toNum(row.importe);
    if (importe === null) filasSinImporte++;

    for (const [lado, cuenta] of lados) {
      if (norm(cuenta) === cuentaNeto) continue;  // regla 4: se netea aparte
      // Regla 5: el negativo cambia de lado y va en positivo.
      const ladoFinal = (importe !== null && importe < 0)
        ? (lado === 'DEBE' ? 'HABER' : 'DEBE')
        : lado;
      const monto = importe === null ? null : Math.abs(importe);
      lineas.push({
        legajo:       row.legajo,
        ingreso:      row.ingreso ?? null,
        nro:          row.nro_concepto ?? null,
        concepto:     row.concepto ?? null,
        importe,
        centro_costo: row.centro_costo ?? null,
        cuenta:       String(cuenta).trim(),
        debe_haber:   ladoFinal,
        debe:         ladoFinal === 'DEBE'  ? monto : null,
        haber:        ladoFinal === 'HABER' ? monto : null,
      });
      // El set cuenta cuentas DISTINTAS, así que la clave va normalizada: la
      // liquidación escribe la misma cuenta con mayúsculas distintas.
      cuentas.add(norm(cuenta));
    }
  }

  const netos = armarNetos(rows, cfg, keyFn);
  // Las líneas de neto van al final, como en el armado que el equipo verificó
  // contra el sistema del cliente: el archivo se lee por legajo (el reporte ya
  // viene ordenado así) y las de neto son el cierre de la planilla.
  lineas.push(...netos.lineas);
  if (netos.lineas.length) cuentas.add(norm(cfg.cuentaNeto));

  const totalDebe  = round2(lineas.reduce((a, l) => a + (l.debe  || 0), 0));
  const totalHaber = round2(lineas.reduce((a, l) => a + (l.haber || 0), 0));
  const diferencia = round2(totalDebe - totalHaber);

  return {
    lineas,
    totalDebe,
    totalHaber,
    diferencia,
    cierra: Math.abs(diferencia) <= TOL,
    cuentasDistintas: cuentas.size,
    filasAnuladas,
    filasSinCuenta,
    filasSinImporte,
    ...netos.stats,
  };
}

/**
 * La línea de "Neto a pagar" de cada legajo: `neto = HABER − DEBE` acumulado a
 * través de TODAS sus liquidaciones. Si el neto es positivo va al HABER (se le
 * debe al empleado); si es negativo, al DEBE con el monto en positivo.
 *
 * Se agrupa con `groupRowsByLegajo` y la clave del cliente (D-042): con un
 * `trim` a mano, un cliente que rellena legajos con ceros emitiría dos líneas
 * de neto para el mismo empleado.
 */
function armarNetos(rows, cfg, keyFn) {
  const cuentaNeto = norm(cfg.cuentaNeto);
  const lineas = [];
  let legajosMultiCeco = 0;

  for (const [, group] of groupRowsByLegajo(rows, 'legajo', { keyFn })) {
    let debe = 0, haber = 0, tocada = false;
    const cecos = new Set();
    let ficha = null;

    for (const row of group) {
      // Regla 3: una fila con la misma cuenta en los dos lados se anula entera,
      // también para el neto — si no, el mismo importe entraría al acumulador
      // por un lado sin salir por el otro.
      const af = row.cuenta_debe, ag = row.cuenta_haber;
      if (!cuentaNula(af) && !cuentaNula(ag) && norm(af) === norm(ag)) continue;

      const importe = toNum(row.importe) ?? 0;
      for (const [lado, cuenta] of [['DEBE', af], ['HABER', ag]]) {
        if (cuentaNula(cuenta) || norm(cuenta) !== cuentaNeto) continue;
        if (lado === 'DEBE') debe += importe; else haber += importe;
        tocada = true;
        if (!ficha) ficha = row;                  // ingreso y centro de costo: el primero del legajo
        if (row.centro_costo) cecos.add(String(row.centro_costo).trim());
      }
    }

    if (!tocada) continue;
    if (cecos.size > 1) legajosMultiCeco++;

    const neto = round2(haber - debe);
    const lado = neto >= 0 ? 'HABER' : 'DEBE';
    lineas.push({
      legajo:       ficha?.legajo ?? null,
      ingreso:      ficha?.ingreso ?? null,
      nro:          cfg.nroConceptoNeto,
      concepto:     cfg.conceptoNeto,
      importe:      neto,
      centro_costo: ficha?.centro_costo ?? null,
      cuenta:       String(cfg.cuentaNeto).trim(),
      debe_haber:   lado,
      debe:         lado === 'DEBE'  ? Math.abs(neto) : null,
      haber:        lado === 'HABER' ? neto : null,
    });
  }

  const saldoNeto = round2(lineas.reduce((a, l) => a + (l.haber || 0) - (l.debe || 0), 0));

  return {
    lineas,
    stats: {
      legajosConNeto: lineas.length,
      saldoNeto,
      legajosMultiCeco,
    },
  };
}

// ── Paso 2: el asiento ────────────────────────────────────────────────────────

/**
 * Índice del reporte de cuentas del cliente: nombre de cuenta → centro de costo
 * → código. El nombre es la clave porque es lo único que la liquidación de Axton
 * escribe en las columnas de cuenta.
 */
function indexarCuentas(cuentasRef) {
  const porNombre = new Map();     // norm(nombre) → Map(centro de costo → código)
  const nombreOficial = new Map(); // norm(nombre) → el nombre tal como lo escribe el cliente
  let empates = 0;                 // mismo nombre + centro con dos códigos distintos

  for (const ref of cuentasRef) {
    const nombre = String(ref.nombre ?? '').trim();
    const codigo = String(ref.codigo ?? '').trim();
    if (!nombre || !codigo) continue;
    const clave = norm(nombre);
    const ceco = String(ref.centro_costo ?? '').trim();
    if (!porNombre.has(clave)) porNombre.set(clave, new Map());
    const previo = porNombre.get(clave).get(ceco);
    if (previo !== undefined && previo !== codigo) empates++;
    porNombre.get(clave).set(ceco, codigo);
    nombreOficial.set(clave, nombre);
  }

  return { porNombre, nombreOficial, empates };
}

/**
 * Código de una cuenta, en este orden:
 *   1. Una **excepción** configurada por el analista (con su centro de costo, o
 *      para cualquier centro).
 *   2. Cuentas **patrimoniales** (código que empieza con 1 o 2): cruzan sólo por
 *      nombre. Se reconocen porque TODOS los códigos de ese nombre empiezan con
 *      1 o 2 — no se declaran en ningún lado.
 *   3. Nombre con un único código: cruza por nombre.
 *   4. Nombre con varios códigos: cruza por nombre + centro de costo. Si el
 *      reporte trae ese nombre con el centro vacío, ese código es el comodín.
 *
 * Devuelve `null` cuando no se puede resolver: la línea igual suma al asiento y
 * sale listada como "sin código", nunca con uno inventado.
 */
function buscarCodigo(cuenta, centroCosto, { porNombre }, excepciones) {
  const clave = norm(cuenta);
  const ceco = String(centroCosto ?? '').trim();

  for (const exc of excepciones) {
    if (norm(exc.nombre) !== clave) continue;
    const excCeco = exc.centroCosto === null || exc.centroCosto === undefined
      ? null
      : String(exc.centroCosto).trim();
    if (excCeco === null || excCeco === '' || excCeco === ceco) return String(exc.codigo).trim();
  }

  const porCeco = porNombre.get(clave);
  if (!porCeco) return null;

  const codigos = [...porCeco.values()];
  if (codigos.every(c => /^[12]/.test(c))) return codigos[0];
  if (new Set(codigos).size === 1) return codigos[0];
  if (porCeco.has(ceco)) return porCeco.get(ceco);
  if (porCeco.has('')) return porCeco.get('');
  return null;
}

/** ¿Es una cuenta patrimonial (código 1x/2x)? Van consolidadas, sin centro de costo. */
const esPatrimonial = (codigo) => /^[12]/.test(String(codigo || ''));

/**
 * Arma el asiento a partir de las líneas de la desglosada.
 *
 * Dos formas de agrupar, según lo que representa la cuenta:
 *   · **Patrimoniales** (1x/2x) — una sola línea por código, sin centro de
 *     costo (va en 0) y con el nombre oficial del reporte de cuentas, que es lo
 *     que unifica las variantes de mayúsculas con las que las escribe la
 *     liquidación.
 *   · **Las demás** (resultado: 6x/7x…) — agrupadas por código + nombre +
 *     centro de costo, porque el gasto se imputa a su centro.
 */
function armarAsiento(lineas, cuentasRef, cfg) {
  const index = indexarCuentas(cuentasRef);
  const grupos = new Map();
  const sinCodigo = new Map();
  const conCodigo = [];

  for (const l of lineas) {
    const codigo = buscarCodigo(l.cuenta, l.centro_costo, index, cfg.excepciones);
    conCodigo.push({ ...l, codigo: codigo || null });

    if (!codigo) {
      const clave = `${l.cuenta} ⋮ ${l.centro_costo ?? ''}`;
      const previo = sinCodigo.get(clave)
        || { cuenta: l.cuenta, centro_costo: l.centro_costo ?? null, lineas: 0, debe: 0, haber: 0 };
      previo.lineas++;
      previo.debe  += l.debe  || 0;
      previo.haber += l.haber || 0;
      sinCodigo.set(clave, previo);
    }

    const patrimonial = esPatrimonial(codigo);
    const nombre = patrimonial
      ? (index.nombreOficial.get(norm(l.cuenta)) || l.cuenta)
      : l.cuenta;
    const ceco = patrimonial ? '0' : String(l.centro_costo ?? '').trim();
    const clave = patrimonial ? `P⋮${codigo}` : `R⋮${codigo || ''}⋮${norm(nombre)}⋮${ceco}`;

    const g = grupos.get(clave)
      || { nro: codigo || null, cuenta: nombre, centro_costo: ceco, debe: 0, haber: 0, conceptos: new Map() };
    g.debe  += l.debe  || 0;
    g.haber += l.haber || 0;
    // El desglose por concepto se acumula en la MISMA pasada que el saldo (ver
    // cuentaConceptos.js): es lo que abre la ficha por cuenta, y sumando acá no
    // puede desalinearse del saldo que dice explicar.
    acumularConcepto(g.conceptos, l);
    grupos.set(clave, g);
  }

  const filas = [...grupos.values()]
    .map((g) => {
      // Neteo de la línea: lo que queda después de compensar los dos lados. Es
      // lo que se asienta; el bruto queda para controlar que nada se perdió.
      const neto = round2(g.haber - g.debe);
      return {
        ...g,
        debe:  round2(g.debe),
        haber: round2(g.haber),
        conceptos: conceptosEnOrden(g.conceptos),
        neto_debe:  neto < 0 ? Math.abs(neto) : 0,
        neto_haber: neto > 0 ? neto : 0,
      };
    })
    .sort(compararFilas);

  const suma = (k) => round2(filas.reduce((a, f) => a + (f[k] || 0), 0));
  const totalDebe = suma('debe');
  const totalHaber = suma('haber');
  const totalNetoDebe = suma('neto_debe');
  const totalNetoHaber = suma('neto_haber');

  return {
    filas,
    desglosadaConCodigo: conCodigo,
    totalDebe,
    totalHaber,
    totalNetoDebe,
    totalNetoHaber,
    diferenciaBruta:  round2(totalDebe - totalHaber),
    diferenciaNeteada: round2(totalNetoDebe - totalNetoHaber),
    cierraBruto:   Math.abs(round2(totalDebe - totalHaber)) <= TOL,
    cierraNeteado: Math.abs(round2(totalNetoDebe - totalNetoHaber)) <= TOL,
    cuentasPatrimoniales: new Set(filas.filter(f => esPatrimonial(f.nro)).map(f => f.nro)).size,
    sinCodigo: [...sinCodigo.values()],
    lineasSinCodigo: conCodigo.filter(l => !l.codigo).length,
    empatesReferencia: index.empates,
    cuentasReferencia: cuentasRef.length,
  };
}

/** Orden del asiento: por código de cuenta y después por centro de costo. */
function compararFilas(a, b) {
  const codigo = compararTexto(a.nro, b.nro);
  return codigo !== 0 ? codigo : compararTexto(a.centro_costo, b.centro_costo);
}

/** Compara dos valores como números si los dos lo son, y como texto si no. */
function compararTexto(a, b) {
  const sa = String(a ?? ''), sb = String(b ?? '');
  // Lo que no tiene código va al final: es lo que hay que resolver, no lo que
  // se lee primero.
  if (!sa && sb) return 1;
  if (sa && !sb) return -1;
  if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) {
    const na = Number(sa), nb = Number(sb);
    if (na !== nb) return na < nb ? -1 : 1;
    return 0;
  }
  return sa.localeCompare(sb, 'es');
}

// ── summarize() ───────────────────────────────────────────────────────────────

/**
 * La unidad del semáforo es la **cuenta contable**: la línea del asiento cuando
 * el asiento se pudo armar, y la cuenta distinta de la desglosada cuando no (sin
 * el reporte de cuentas del cliente no hay líneas de asiento que contar).
 *
 * Una cuenta que quedó sin código cuenta como una unidad más con diferencia:
 * todavía no es una línea del asiento, pero tiene que dejar de no serlo. Y si el
 * asiento no cierra, el entregable entero es sospechoso y se marcan todas.
 */
export function summarizeContaDesglosada(results) {
  if (results.error) {
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null,
      diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const a = results.asiento;
  const cierraTodo = results.cierra && (!a || (a.cierraBruto && a.cierraNeteado));
  const sinCodigo  = a ? a.sinCodigo.length : 0;

  const unitsTotal = a ? a.filas.length + sinCodigo : results.cuentasDistintas;
  const unitsWithDiff = cierraTodo ? sinCodigo : unitsTotal;

  const insights = [];
  if (!results.cierra) {
    insights.push({ type: 'warning', label: 'la desglosada no cierra, diferencia', value: fmtNum(Math.abs(results.diferencia)) });
  }
  if (!a) {
    insights.push({ type: 'warning', label: 'asiento sin armar', value: 'falta el reporte de cuentas' });
  } else {
    if (!a.cierraBruto) {
      insights.push({ type: 'warning', label: 'el asiento no cierra en bruto, diferencia', value: fmtNum(Math.abs(a.diferenciaBruta)) });
    }
    if (!a.cierraNeteado) {
      insights.push({ type: 'warning', label: 'el asiento no cierra neteado, diferencia', value: fmtNum(Math.abs(a.diferenciaNeteada)) });
    }
    if (sinCodigo > 0) {
      insights.push({ type: 'warning', label: 'cuentas sin código', value: sinCodigo });
    }
    if (a.empatesReferencia > 0) {
      insights.push({ type: 'warning', label: 'cuentas con dos códigos en el reporte del cliente', value: a.empatesReferencia });
    }
  }
  if (results.filasSinImporte > 0) {
    insights.push({ type: 'warning', label: 'filas con cuenta contable pero sin importe', value: results.filasSinImporte });
  }
  if (results.legajosMultiCeco > 0) {
    insights.push({ type: 'warning', label: 'legajos que netean en más de un centro de costo', value: results.legajosMultiCeco });
  }

  const headline = a
    ? `${a.filas.length} línea${a.filas.length === 1 ? '' : 's'} de asiento · ${fmtNum(a.totalNetoDebe)} neteado al DEBE`
    : `${results.lineas.length} línea${results.lineas.length === 1 ? '' : 's'} de desglosada · ${fmtNum(results.totalDebe)} al DEBE`;

  return {
    status: (cierraTodo && sinCodigo === 0 && a) ? 'success' : 'warning',
    headline,
    insights,
    unit: 'cuenta',
    unitsTotal,
    unitsWithDiff,
    diffTotalAmount: Math.abs(results.diferencia) + (a ? Math.abs(a.diferenciaNeteada) : 0),
    worstCase: null,
    contextNote: cierraTodo
      ? (a ? 'la desglosada y el asiento cierran: DEBE = HABER' : 'la desglosada cierra: DEBE = HABER')
      : `DEBE ${fmtNum(results.totalDebe)} contra HABER ${fmtNum(results.totalHaber)}`,
  };
}

// ── Pantalla de resultados ────────────────────────────────────────────────────

export function renderContaDesglosadaResults(results, container) {
  if (results.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }

  renderResumenDetalle(container, {
    controlId: 'conta_desglosada',
    conDiferencias: !(results.cierra
      && (!results.asiento || (results.asiento.cierraBruto && results.asiento.cierraNeteado
        && results.asiento.sinCodigo.length === 0))),
    resumen: (panel) => renderResumenTab(panel, results),
    fichas: (panel) => renderFichasTab(panel, results),
    planilla: (panel) => renderDetalleTab(panel, results),
  });
}

function renderResumenTab(panel, results) {
  const a = results.asiento;
  const sinCodigo = a ? a.sinCodigo.length : 0;
  const cierraTodo = results.cierra && (!a || (a.cierraBruto && a.cierraNeteado));

  renderVerdict(panel, {
    tone: !cierraTodo ? 'error' : (!a || sinCodigo > 0) ? 'warn' : 'ok',
    title: !cierraTodo
      ? `No cierra: DEBE y HABER difieren en ${fmtNum(Math.abs(a && !a.cierraNeteado ? a.diferenciaNeteada : results.diferencia))}`
      : !a
        ? 'La desglosada cierra, pero el asiento no se armó: falta el reporte de cuentas del cliente'
        : sinCodigo > 0
          ? `El asiento cierra, pero ${sinCodigo} cuenta${sinCodigo === 1 ? '' : 's'} quedó sin código — revisalo antes de mandarlo`
          : `Todo cierra: ${a.filas.length} línea${a.filas.length === 1 ? '' : 's'} de asiento y DEBE = HABER`,
    body: [
      results.period ? periodToLabel(results.period) : null,
      `${results.filasOrigen} fila(s) en el "Totales de Concepto"`,
      `saldo de ${esc(String(results.cuentaNeto))}: ${fmtNum(results.saldoNeto)} en ${results.legajosConNeto} legajo(s)`,
    ].filter(Boolean).join(' · '),
  });

  // Cinco tiles como máximo: son de ancho fijo y un importe de mil millones en
  // la tipografía de KPI no entra en menos de eso. Lo que no entra acá está en
  // los chequeos de coherencia, con los dos lados de cada comparación.
  const tiles = [
    { label: 'Líneas de la desglosada', value: results.lineas.length,
      sub: `${results.legajosConNeto} legajo(s) con neto` },
    { label: 'Total DEBE', value: fmtNum(results.totalDebe),
      sub: `HABER ${fmtNum(results.totalHaber)}` },
    { label: 'Diferencia', value: fmtNum(results.diferencia),
      tone: results.cierra ? undefined : 'error',
      sub: results.cierra ? 'cierra' : 'no cierra' },
  ];
  if (a) {
    tiles.push(
      { label: 'Líneas del asiento', value: a.filas.length,
        sub: `neteado ${fmtNum(a.totalNetoDebe)}`,
        tone: a.cierraNeteado ? undefined : 'error' },
      { label: 'Cuentas sin código', value: sinCodigo,
        tone: sinCodigo > 0 ? 'warn' : undefined,
        sub: sinCodigo > 0 ? 'no se pudieron resolver' : 'todas resueltas' },
    );
  } else {
    tiles.push({ label: 'Cuentas distintas', value: results.cuentasDistintas,
      sub: 'sin agrupar en asiento' });
  }
  renderTiles(panel, tiles);

  // Un problema por línea, con qué hacer. Ninguno se resuelve desde acá
  // adivinando: o falta un archivo, o falta una equivalencia del cliente.
  const items = [];
  if (!a) {
    items.push({
      sev: 'hi', who: 'Asiento contable',
      what: 'No se armó porque no se subió el "Reporte de Cuentas de Redefinición" del cliente.',
      why: 'El código de cada cuenta sale de ese archivo. Subilo en el Paso 2 y volvé a ejecutar; '
        + 'la Contabilidad Desglosada ya se puede descargar igual.',
    });
  }
  for (const c of (a?.sinCodigo || [])) {
    items.push({
      sev: 'hi', who: `Cuenta "${c.cuenta}"${c.centro_costo ? ` · centro ${c.centro_costo}` : ''}`,
      what: 'No está en el reporte de cuentas del cliente, así que la línea del asiento sale sin código.',
      why: `Son ${c.lineas} línea(s) por ${fmtNum(c.debe + c.haber)}. Si el cliente ya le asignó código, `
        + 'pedile el reporte de cuentas actualizado; si es una excepción, cargala en '
        + '"Contabilidad Desglosada" del Paso 2 y volvé a ejecutar.',
    });
  }
  if (results.filasSinImporte > 0) {
    items.push({
      sev: 'mid', who: 'Filas sin importe',
      what: `${results.filasSinImporte} fila(s) del reporte traen cuenta contable pero el importe vacío.`,
      why: 'Esas líneas salen en la desglosada con la celda de importe en blanco y no suman al asiento. '
        + 'Verificá en Axton si el concepto se liquidó en cero o si el export quedó incompleto.',
    });
  }
  if (results.legajosMultiCeco > 0) {
    items.push({
      sev: 'mid', who: 'Neto a pagar en dos centros de costo',
      what: `${results.legajosMultiCeco} legajo(s) netean en más de un centro de costo.`,
      why: 'El importe del neto está bien (suma todas las liquidaciones), pero la línea muestra el centro '
        + 'de costo de la primera. Revisá si contabilidad necesita el neto partido por centro.',
    });
  }
  if (a?.empatesReferencia > 0) {
    items.push({
      sev: 'mid', who: 'Reporte de cuentas del cliente',
      what: `${a.empatesReferencia} cuenta(s) aparecen con el mismo nombre y centro de costo pero dos códigos distintos.`,
      why: 'Se usó el último que trae el archivo. Confirmá con el cliente cuál corresponde.',
    });
  }
  if (items.length) renderIssues(panel, { heading: 'Para revisar antes de mandarlo', items });

  const checks = [
    { ok: results.cierra, label: 'La Contabilidad Desglosada cierra (DEBE = HABER)',
      detail: `${fmtNum(results.totalDebe)} contra ${fmtNum(results.totalHaber)}` },
  ];
  if (a) {
    checks.push(
      { ok: a.cierraBruto, label: 'El asiento cierra en bruto',
        detail: `${fmtNum(a.totalDebe)} contra ${fmtNum(a.totalHaber)}` },
      { ok: a.cierraNeteado, label: 'El asiento cierra neteado',
        detail: `${fmtNum(a.totalNetoDebe)} contra ${fmtNum(a.totalNetoHaber)}` },
      { ok: a.lineasSinCodigo === 0, label: 'Todas las líneas tienen código de cuenta',
        detail: a.lineasSinCodigo === 0
          ? `${a.cuentasReferencia} cuentas en el reporte del cliente`
          : `${a.lineasSinCodigo} línea(s) sin código` },
    );
  }
  renderChecks(panel, { heading: 'Chequeos de coherencia', items: checks });
}

// ── Solapa Fichas — una por cuenta contable ───────────────────────────────────
//
// La unidad de este control es la CUENTA, no el empleado: un asiento se lee por
// cuenta contable (D-020/D-066). Así que la ficha por legajo no aplica — lo que
// sirve es abrir la cuenta y ver **qué conceptos la componen**, que es justo lo
// que hoy no se puede ver sin bajar el .xlsx y filtrar a mano.
//
// **Lo que la ficha muestra y el archivo no lleva.** La desglosada trae legajo y
// fecha de ingreso porque es papel de trabajo del analista, y está pendiente que
// Willy confirme si ese archivo sale del estudio (D-066 §4, §8 de la spec del
// control). Esta ficha **no agrega ni un dato del empleado a ningún archivo**: es
// pantalla, la ve el analista, y su desglose es por CONCEPTO —código y nombre de
// concepto, que son configuración, no información de HR—. Los tres `.xlsx` y el
// CSV salen exactamente con las columnas que ya tenían.

/**
 * El único estado que no aplica acá. **Este control cuadra al centavo contra sí
 * mismo** (DEBE = HABER), no contra un umbral: no hay monto de diferencia del
 * cliente que aflojar. El chip va igual, en gris y con su 0, y lo dice en el
 * `title` — sacarlo movería los otros cuatro de lugar (§3).
 */
const NO_APLICA_FICHA_CONTA = {
  margen: 'la desglosada y el asiento cuadran al centavo contra sí mismos (DEBE = HABER), '
    + 'no hay un umbral que medir',
};

/** Estado del caso → el gradiente del avatar (§4). */
const SEVERIDAD_POR_ESTADO = { conDif: 'error', sinComparar: 'warn', margen: 'info', centavo: 'ok' };

/**
 * En qué estado cerró una cuenta.
 *
 * **Una cuenta sin código es "Sin comparar", no "Con diferencia".** No hay
 * ninguna diferencia de importe: la línea suma al asiento igual, y de hecho el
 * balance cierra. Lo que falta es el **otro archivo** — el nombre de esa cuenta
 * no está en el Reporte de Cuentas del cliente—, que es literalmente la
 * definición del chip. Y en ámbar nunca se lee como aprobada (D-073), que es lo
 * que importa: es lo que hay que resolver en el Paso 2 antes de mandar el
 * asiento.
 *
 * @param {object} ficha - una de las que arma `fichasDeCuentas`
 * @param {{ cierraTodo: boolean }} corrida
 * @returns {'conDif'|'centavo'|'sinComparar'}
 */
export function estadoDeCuentaConta(ficha, { cierraTodo }) {
  if (ficha.sinCodigo) return 'sinComparar';
  // `cuadra === false` es un desglose que NO suma al saldo. Los conceptos se
  // acumulan en la misma pasada que el saldo, así que no puede pasar; se mira
  // igual, porque es el único lugar donde se vería si algún día se desalinean y
  // un desglose que no suma no puede salir en verde. `cuadra === null` es otra
  // cosa: una corrida vieja que no guardó el desglose. Eso no es una diferencia.
  if (ficha.conciliacion.cuadra === false) return 'conDif';
  return cierraTodo ? 'centavo' : 'conDif';
}

/**
 * Una ficha por cuenta. Con el Reporte de Cuentas cargado, la unidad es la línea
 * del asiento (que ya viene agrupada por código + nombre + centro de costo). Sin
 * él no hay asiento, así que la unidad es **la cuenta distinta de la
 * desglosada** — la misma que cuenta el semáforo (`cuentasDistintas`), para que
 * los chips no digan un número y el semáforo otro.
 *
 * Las devuelve **ya armadas** (tarjeta cerrada + cuerpo), porque eso es lo que
 * hay que poder afirmar sin abrir un navegador: que las fichas cuentan lo mismo
 * que el semáforo y que el desglose de cada cuenta suma exactamente su saldo. Si
 * el test mirara una versión intermedia, probaría otra cosa que la que se dibuja.
 */
export function fichasDeCuentas(results) {
  const a = results.asiento;
  const cierraTodo = results.cierra && (!a || (a.cierraBruto && a.cierraNeteado));
  return cuentasDeLaCorrida(results).map(f => fichaDeCuenta(f, results, cierraTodo));
}

/** Las cuentas de la corrida, antes de vestirlas de ficha. */
function cuentasDeLaCorrida(results) {
  const a = results.asiento;

  if (a) {
    return a.filas.map(f => ({
      id:           `${f.nro || 'sin código'} · ${f.cuenta} · CC ${f.centro_costo || '—'}`,
      numero:       f.nro,
      cuenta:       f.cuenta,
      centro_costo: f.centro_costo,
      sinCodigo:    !f.nro,
      esNeto:       norm(f.cuenta) === norm(results.cuentaNeto),
      conceptos:    f.conceptos || [],
      conciliacion: conciliarCuenta(f),
      // El neteo que el control ya calculó, para poder mostrarlo con la misma
      // palabra que usa el .xlsx (NETO DEBE / NETO HABER).
      neto_debe:  f.neto_debe,
      neto_haber: f.neto_haber,
      conAsiento: true,
    }));
  }

  // Sin el Reporte de Cuentas: se agrupan las líneas de la desglosada por
  // cuenta, con la MISMA clave normalizada con la que el control cuenta las
  // cuentas distintas (la liquidación escribe el mismo nombre con mayúsculas
  // distintas, y dos grafías no son dos cuentas).
  const porCuenta = new Map();
  for (const l of results.lineas) {
    const clave = norm(l.cuenta);
    let g = porCuenta.get(clave);
    if (!g) {
      g = { cuenta: String(l.cuenta ?? '').trim(), debe: 0, haber: 0, conceptos: new Map() };
      porCuenta.set(clave, g);
    }
    g.debe  += l.debe  || 0;
    g.haber += l.haber || 0;
    acumularConcepto(g.conceptos, l);
  }

  return [...porCuenta.values()].map(g => {
    const cuenta = { debe: round2(g.debe), haber: round2(g.haber), conceptos: conceptosEnOrden(g.conceptos) };
    return {
      id:           `desglosada · ${g.cuenta}`,
      numero:       null,
      cuenta:       g.cuenta,
      centro_costo: null,
      // Sin el Reporte de Cuentas ninguna cuenta tiene código, y el semáforo no
      // cuenta eso como una unidad con diferencia (avisa aparte que el asiento
      // no se armó). Marcarlas todas "Sin comparar" haría que los chips
      // contaran distinto del semáforo, que es justo lo que no puede pasar.
      sinCodigo:    false,
      esNeto:       norm(g.cuenta) === norm(results.cuentaNeto),
      conceptos:    cuenta.conceptos,
      conciliacion: conciliarCuenta(cuenta),
      neto_debe:  null,
      neto_haber: null,
      conAsiento: false,
    };
  });
}

const MARCAS_CONTA = [
  { value: 'patrimonial', label: 'Cuenta patrimonial (código 1x/2x)',
    match: f => esPatrimonial(f.numero) },
  { value: 'neto',        label: 'La cuenta del neto a pagar',
    match: f => f.esNeto },
  { value: 'dos_lados',   label: 'Con movimientos en los dos lados',
    match: f => Math.abs(f.conciliacion.debe) > TOL && Math.abs(f.conciliacion.haber) > TOL },
  { value: 'sin_codigo',  label: 'Sin código de cuenta',
    match: f => f.sinCodigo },
];

function renderFichasTab(panel, results) {
  renderFichasPanel(panel, {
    fichas: fichasDeCuentas(results),
    unitLabel: 'cuentas contables',
    estadoDe: f => f.estado,
    noAplica: NO_APLICA_FICHA_CONTA,
    marcas: MARCAS_CONTA,
    ordenes: [
      { value: 'saldo',     label: 'Mayor saldo',
        compare: (a, b) => b.conciliacion.monto - a.conciliacion.monto },
      { value: 'codigo',    label: 'Código de cuenta',
        compare: (a, b) => compararTexto(a.numero, b.numero)
          || compararTexto(a.centro_costo, b.centro_costo) },
      { value: 'conceptos', label: 'Más conceptos adentro',
        compare: (a, b) => b.conceptos.length - a.conceptos.length },
      { value: 'nombre',    label: 'Nombre de la cuenta',
        compare: (a, b) => String(a.cuenta).localeCompare(String(b.cuenta), 'es') },
    ],
    getLabel: f => `${f.numero || ''} ${f.cuenta} ${f.centro_costo || ''}`,
    // La unidad de este control es la cuenta: el buscador no puede ofrecer
    // buscar por legajo, que en esta pantalla no existe.
    searchLabel: 'Buscar cuenta o centro de costo',
    searchPlaceholder: 'Código o nombre de cuenta…',
    getAmount: f => f.conciliacion.monto,
    amountLabel: 'Σ saldo de las cuentas',
    onExport: (exportEl) => mountExportMenu(exportEl, results, results.asiento ? 'asiento' : 'desglosada'),
  });
}

/** El descriptor de la ficha: la tarjeta cerrada y lo que se dibuja al abrirla. */
function fichaDeCuenta(f, results, cierraTodo) {
  const estado = estadoDeCuentaConta(f, { cierraTodo });
  const sev = SEVERIDAD_POR_ESTADO[estado] || 'info';
  const c = f.conciliacion;
  const patrimonial = esPatrimonial(f.numero);
  const badge = badgeDeCuenta(f, results, cierraTodo);

  return {
    ...f,
    estado,
    // El avatar lleva el NÚMERO de la cuenta, que es lo que identifica la unidad
    // de este control. El nombre va en la línea de identidad, al lado.
    unit: f.numero || 'sin cód.',
    severity: sev,
    name: f.cuenta || '(sin nombre de cuenta)',
    // Sin asiento la cuenta todavía no está agrupada por centro de costo (la
    // desglosada las trae de varios), así que decir "CC —" sería decir que no
    // tiene centro, que no es lo que pasa.
    tag: {
      text: !f.conAsiento ? 'cuenta de la desglosada'
        : patrimonial ? 'patrimonial · consolidada'
          : `CC ${f.centro_costo || '—'}`,
    },
    badge,
    context: contextoDeCuenta(c, fmtNum),
    // La marca que ya dice lo mismo que el badge no se repite abajo: el badge es
    // la causa principal y la marca es "qué MÁS le pasa" — verlo dos veces en la
    // misma tarjeta no agrega nada. Sigue estando en "Marcas ▾" como filtro.
    marks: MARCAS_CONTA
      .filter(m => m.match(f) && m.label !== badge?.text)
      .map(m => ({ text: m.label, tone: m.value === 'sin_codigo' ? 'neutral' : 'info' })),
    // Con asiento el número grande es el NETO, que es lo que se asienta y lo que
    // el .xlsx llama así; sin asiento todavía es el saldo bruto de la cuenta.
    amountLabel: rotuloDeSaldo(c, f.conAsiento ? 'NETO' : 'SALDO'),
    amount: c.monto,
    amountTone: sev === 'error' ? 'error' : sev === 'warn' ? 'warn' : undefined,
    body: {
      strip:  tiraDeCuenta(c),
      detail: detalleDeConceptos(f.conceptos, c),
      conclusion: conclusionDeCuenta(f, c, results, cierraTodo),
    },
  };
}

/** La causa principal, en una línea. Sin causa no hay badge. */
function badgeDeCuenta(f, results, cierraTodo) {
  if (f.conciliacion.cuadra === false) return { text: 'Los conceptos no suman al saldo', tone: 'error' };
  if (f.sinCodigo) return { text: 'Sin código de cuenta', tone: 'warn' };
  if (!cierraTodo) {
    return {
      text: 'El asiento no cierra',
      title: 'Mientras el asiento no cierre, todas las cuentas quedan en revisión.',
      tone: 'error',
    };
  }
  if (!f.conAsiento) return { text: 'El asiento no se armó', tone: 'warn' };
  return undefined;
}

/** No un resumen: una instrucción. Qué mirar, descartando lo que ya se explicó. */
function conclusionDeCuenta(f, c, results, cierraTodo) {
  if (c.cuadra === false) {
    return {
      tone: 'error',
      title: `El desglose de esta cuenta no suma al saldo: sobran ${fmtNum(c.residuo)}`,
      text: 'Los conceptos de la tabla de abajo se acumulan con el mismo importe que el saldo, así que esto no '
        + 'debería pasar nunca. No mandes el asiento: avisá que el desglose por concepto de esta cuenta quedó '
        + 'desalineado.',
    };
  }
  if (!cierraTodo) {
    const dif = results.asiento && !results.asiento.cierraNeteado
      ? results.asiento.diferenciaNeteada : results.diferencia;
    return {
      tone: 'error',
      title: `El asiento no cierra por ${fmtNum(Math.abs(dif))}`,
      text: (c.conDesglose
        ? `Esta cuenta cuadra: ${concordancia(c.cantidad).sujetoSuyo} ${concordancia(c.cantidad).suman} exacto `
          + 'su saldo, así que la diferencia no sale de acá. '
        : 'Esta corrida no guardó el desglose por concepto de la cuenta. ')
        + 'Mirá el Resumen: dice si el descuadre es de la desglosada o del asiento neteado. No mandes el '
        + 'archivo hasta que cierre.',
    };
  }
  if (f.sinCodigo) {
    return {
      tone: 'warn',
      title: `La cuenta "${f.cuenta}" no tiene código`,
      text: 'Su nombre no está en el Reporte de Cuentas del cliente, así que la línea suma al asiento pero sale '
        + 'sin número de cuenta — y Contaduría no la puede cargar. Cargala como excepción en "Contabilidad '
        + 'Desglosada" del Paso 2 (nombre ⇥ centro de costo ⇥ código, con * para cualquier centro) y volvé a '
        + 'ejecutar. El código no se inventa por analogía: confirmalo con el cliente.',
    };
  }
  if (!f.conAsiento) {
    return {
      tone: 'warn',
      title: 'Esta cuenta cuadra, pero todavía no tiene número',
      text: `${concordancia(c.cantidad).sujeto} de abajo ${concordancia(c.cantidad).suman} exacto el saldo de `
        + 'la cuenta. Lo que falta es el Reporte de Cuentas de Redefinición del cliente: sin él no se puede '
        + 'armar el asiento, y sin asiento no hay nada que mandarle a Contaduría. Subilo en el Paso 2.',
    };
  }
  if (!c.conDesglose) {
    return {
      tone: 'warn',
      title: 'Esta corrida no guardó el desglose por concepto',
      text: 'El asiento cierra y esta cuenta está bien, pero la corrida se guardó antes de que la ficha '
        + 'mostrara qué conceptos forman cada cuenta, así que ese detalle no está. Volvé a ejecutar el control '
        + 'con los mismos archivos si querés verlo.',
    };
  }
  return {
    tone: 'ok',
    title: `Cuadra al centavo: ${fmtNum(c.monto)} al ${c.lado || 'saldo cero'}`,
    text: `${concordancia(c.cantidad).sujeto} de la tabla de abajo ${concordancia(c.cantidad).suman} `
      + 'exactamente el saldo de esta cuenta, y el asiento cierra. No hay nada para revisar acá.',
  };
}

// Las tres tablas de la Planilla son los tres archivos que se descargan: lo que
// se ve en pantalla es lo que sale en el .xlsx, sin una segunda lista de
// columnas. Cada una con la barra estándar completa (§3) y las columnas de
// importe agrupadas en las dos bandas naturales de un asiento: DEBE y HABER.
//
// **Este control no compara contra un umbral**: la desglosada y el asiento
// cuadran al centavo contra sí mismos. Por eso el chip "Dentro del margen" va en
// gris y deshabilitado, con el motivo en su `title` — no oculto.

const NO_APLICA_CONTA = {
  margen: 'la desglosada y el asiento cuadran al centavo contra sí mismos (DEBE = HABER), no hay un umbral que medir',
};

function renderDetalleTab(panel, results) {
  const cierraTodo = results.cierra
    && (!results.asiento || (results.asiento.cierraBruto && results.asiento.cierraNeteado));

  const tabs = [];
  if (results.asiento) {
    tabs.push({ id: 'asiento', label: 'Asiento Contable',
      render: (p) => vistaAsiento(p, results, cierraTodo) });
  }
  tabs.push({ id: 'desglosada', label: 'Contabilidad Desglosada',
    render: (p) => vistaDesglosada(p, results, results.lineas, false, cierraTodo,
      'Una línea por cada lado del movimiento. El "Neto a pagar" de cada legajo va al final: es la '
      + 'cuenta de sueldos a pagar neteada por empleado.') });
  if (results.asiento) {
    tabs.push({ id: 'codigo', label: 'Desglosada con Código',
      render: (p) => vistaDesglosada(p, results, results.asiento.desglosadaConCodigo, true, cierraTodo,
        'La desglosada completa con el código de cuenta de cada línea: es la que permite auditar el '
        + 'asiento línea por línea.') });
  }

  initTabs(panel, { tabs });
}

/** El mismo menú en las tres tablas: los tres archivos más lo que está en pantalla. */
function mountExportMenu(exportEl, results, vistaId) {
  const items = [
    { key: 'desglosada', label: '📊 Contabilidad Desglosada (.xlsx)',
      desc: 'Una línea por cada lado del movimiento, con legajo y concepto.',
      action: () => exportDesglosadaToXlsx(results) },
  ];
  if (results.asiento) {
    items.push(
      { key: 'asiento', label: '📊 Asiento Contable (.xlsx)',
        desc: 'Agrupado por cuenta y centro de costo, con el neteo de cada línea.',
        action: () => exportAsientoToXlsx(results) },
      { key: 'codigo', label: '📊 Desglosada con Código (.xlsx)',
        desc: 'La desglosada completa, sin agrupar, con el código de cada cuenta.',
        action: () => exportConCodigoToXlsx(results) },
    );
  }
  items.push(
    { key: 'csv', label: '📄 Exportar CSV de lo que estás viendo',
      desc: 'La tabla de esta pantalla, tal como está.',
      action: () => filasDeVista(results, vistaId).csv() },
    { key: 'copy', label: '📋 Copiar la tabla de esta pantalla',
      desc: 'Se pega directo en Excel, respetando las columnas.',
      action: () => filasDeVista(results, vistaId).copiar() },
  );

  renderExportMenu(exportEl, {
    items,
    note: 'La Contabilidad Desglosada lleva legajo y fecha de ingreso: es papel de trabajo del analista.',
  });
}

function vistaAsiento(panel, results, cierraTodo) {
  const a = results.asiento;

  // Las columnas se agrupan por LADO del asiento y no por bruto/neteado: DEBE y
  // HABER son las dos bandas naturales, y adentro de cada una va primero el
  // bruto y después lo que se asienta. El .xlsx mantiene su propio orden
  // (DEBE · HABER · NETO DEBE · NETO HABER), que es el layout del entregable.
  const columns = [
    { key: 'nro',    label: 'Nro Cuenta', sub: 'código contable', band: 'Identificación',
      cell: f => esc(f.nro || 'sin código') },
    { key: 'cuenta', label: 'Nombre de cuenta', band: 'Identificación' },
    { key: 'centro_costo', label: 'Centro de costo', band: 'Identificación', close: true,
      cell: f => esc(f.centro_costo || '—') },
    { key: 'debe',      label: 'DEBE',      sub: 'bruto',              num: true, band: 'DEBE' },
    { key: 'neto_debe', label: 'NETO DEBE', sub: 'lo que se asienta',  num: true, band: 'DEBE', close: true },
    { key: 'haber',      label: 'HABER',      sub: 'bruto',             num: true, band: 'HABER' },
    { key: 'neto_haber', label: 'NETO HABER', sub: 'lo que se asienta', num: true, band: 'HABER', close: true },
  ];

  renderPlanillaPanel(panel, {
    rows: a.filas,
    columns,
    unitLabel: 'cuentas contables',
    // Una cuenta sin código todavía no es una línea del asiento, y así la cuenta
    // el semáforo: sale marcada aunque el asiento cuadre. Va como "Sin comparar"
    // y no como "Con diferencia" porque no hay ninguna diferencia de importe —
    // lo que falta es el otro archivo, el Reporte de Cuentas del cliente— y en
    // ámbar nunca se lee como aprobada (D-073). Es el mismo criterio que la
    // solapa Fichas (`estadoDeCuentaConta`): las dos solapas del mismo control no
    // pueden clasificar la misma cuenta distinto.
    estadoDe: f => (!f.nro ? 'sinComparar' : !cierraTodo ? 'conDif' : 'centavo'),
    noAplica: NO_APLICA_CONTA,
    marcas: [{ value: 'sin_codigo', label: 'Sin código de cuenta', match: f => !f.nro }],
    getLabel: f => `${f.nro || ''} ${f.cuenta}`,
    searchLabel: 'Buscar cuenta',
    searchPlaceholder: 'Código o nombre de cuenta…',
    stickyCols: 2,
    // El código de cuenta del cliente tiene 9 dígitos: con el ancho de columna
    // fija por default (pensado para un legajo) sale cortado.
    col1Width: 112,
    onExport: (exportEl) => mountExportMenu(exportEl, results, 'asiento'),
    emptyText: 'Ninguna cuenta quedó con los filtros puestos.',
    footnote: (shown) => `Mostrando ${shown.length} de ${a.filas.length} cuenta${a.filas.length === 1 ? '' : 's'} contables. `
      + 'Las cuentas patrimoniales (código 1x/2x) van consolidadas en una línea, sin centro de costo; '
      + 'las de resultado, agrupadas por cuenta y centro. El neteo es lo que se asienta.',
  });
}

function vistaDesglosada(panel, results, lineas, conCodigo, cierraTodo, nota) {
  const columns = [
    { key: 'legajo',  label: 'Legajo',  band: 'Identificación' },
    { key: 'ingreso', label: 'Ingreso', sub: 'fecha de ingreso', band: 'Identificación', close: true,
      cell: l => esc(l.ingreso || '—') },

    { key: 'nro',      label: 'Nro',      sub: 'código de concepto', band: 'Concepto',
      cell: l => esc(l.nro || '—') },
    { key: 'concepto', label: 'Concepto', band: 'Concepto', cell: l => esc(l.concepto || '—') },
    { key: 'importe',  label: 'Importe',  sub: 'lo liquidado', num: true, band: 'Concepto', close: true },

    { key: 'centro_costo', label: 'Centro de Costo', band: 'Imputación',
      cell: l => esc(l.centro_costo || '—') },
    { key: 'cuenta', label: 'Cuenta', band: 'Imputación' },
    ...(conCodigo ? [{ key: 'codigo', label: 'Código', sub: 'el de la cuenta', band: 'Imputación',
      cell: l => esc(l.codigo || 'sin código') }] : []),
    { key: 'debe_haber', label: 'D/H', sub: 'de qué lado va', band: 'Imputación', close: true },

    { key: 'debe',  label: 'DEBE',  sub: 'lo que se asienta', num: true, band: 'DEBE',  close: true },
    { key: 'haber', label: 'HABER', sub: 'lo que se asienta', num: true, band: 'HABER', close: true },
  ];

  renderPlanillaPanel(panel, {
    rows: lineas,
    columns,
    unitLabel: 'líneas',
    estadoDe: l => (conCodigo && !l.codigo ? 'sinComparar' : !cierraTodo ? 'conDif' : 'centavo'),
    noAplica: NO_APLICA_CONTA,
    marcas: [
      { value: 'debe',  label: 'Sólo el DEBE',  match: l => l.debe_haber === 'DEBE' },
      { value: 'haber', label: 'Sólo el HABER', match: l => l.debe_haber === 'HABER' },
      ...(conCodigo ? [{ value: 'sin_codigo', label: 'Sin código de cuenta', match: l => !l.codigo }] : []),
    ],
    getLabel: l => `${l.legajo} ${l.concepto || ''} ${l.cuenta}`,
    searchLabel: 'Buscar legajo, concepto o cuenta',
    searchPlaceholder: 'Legajo, concepto o cuenta…',
    stickyCols: 2,
    onExport: (exportEl) => mountExportMenu(exportEl, results, conCodigo ? 'codigo' : 'desglosada'),
    emptyText: 'Ninguna línea quedó con los filtros puestos.',
    footnote: (shown) => `Mostrando ${shown.length} de ${lineas.length} línea${lineas.length === 1 ? '' : 's'}. ${nota}`,
  });
}

// ── Los tres archivos ─────────────────────────────────────────────────────────

async function exportDesglosadaToXlsx(results) {
  await loadExcelJS();
  const wb = new window.ExcelJS.Workbook();
  writeContractSheet(wb, EXPORT_CONTRACTS.conta_desglosada, results.lineas, {
    totalRow: { legajo: 'TOTAL', debe: results.totalDebe, haber: results.totalHaber },
  });
  await downloadWorkbook(wb, `Contabilidad_Desglosada_${periodSuffix(results.period)}.xlsx`);
}

async function exportConCodigoToXlsx(results) {
  await loadExcelJS();
  const wb = new window.ExcelJS.Workbook();
  writeContractSheet(wb, EXPORT_CONTRACTS.conta_desglosada_codigo, results.asiento.desglosadaConCodigo, {
    totalRow: { legajo: 'TOTAL', debe: results.totalDebe, haber: results.totalHaber },
  });
  await downloadWorkbook(wb, `Contabilidad_Desglosada_con_Codigo_${periodSuffix(results.period)}.xlsx`);
}

async function exportAsientoToXlsx(results) {
  await loadExcelJS();
  const a = results.asiento;
  const wb = new window.ExcelJS.Workbook();
  writeContractSheet(wb, EXPORT_CONTRACTS.conta_asiento, a.filas, {
    totalRow: {
      nro: 'TOTAL', debe: a.totalDebe, haber: a.totalHaber,
      neto_debe: a.totalNetoDebe, neto_haber: a.totalNetoHaber,
    },
  });
  await downloadWorkbook(wb, `Asiento_Contable_${periodSuffix(results.period)}.xlsx`);
}

/**
 * Encabezados y filas de la vista que está en pantalla, para el CSV y para
 * copiar. Los dos salen de la misma lista: si divergen, uno de los dos miente.
 */
function filasDeVista(results, vistaId) {
  const suf = periodSuffix(results.period);
  let headers, rows, nombre;

  if (vistaId === 'asiento') {
    headers = ['Nro Cuenta', 'Nombre de cuenta', 'Centro de costo', 'DEBE', 'HABER', 'NETO DEBE', 'NETO HABER'];
    rows = results.asiento.filas.map(f => [f.nro, f.cuenta, f.centro_costo,
      fmtNum(f.debe), fmtNum(f.haber), fmtNum(f.neto_debe), fmtNum(f.neto_haber)]);
    nombre = `Asiento_Contable_${suf}.csv`;
  } else {
    const conCodigo = vistaId === 'codigo';
    const lineas = conCodigo ? results.asiento.desglosadaConCodigo : results.lineas;
    headers = ['Legajo', 'Ingreso', 'Nro', 'Concepto', 'Importe', 'Centro de Costo', 'Cuenta',
      ...(conCodigo ? ['Código'] : []), 'DEBE_HABER', 'DEBE', 'HABER'];
    rows = lineas.map(l => [l.legajo, l.ingreso, l.nro, l.concepto,
      l.importe === null ? '' : fmtNum(l.importe), l.centro_costo, l.cuenta,
      ...(conCodigo ? [l.codigo || ''] : []), l.debe_haber,
      l.debe === null ? '' : fmtNum(l.debe), l.haber === null ? '' : fmtNum(l.haber)]);
    nombre = `${conCodigo ? 'Contabilidad_Desglosada_con_Codigo' : 'Contabilidad_Desglosada'}_${suf}.csv`;
  }

  return {
    csv:     () => downloadCsv(headers, rows, nombre),
    copiar:  () => copyRowsToClipboard(headers, rows),
  };
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
