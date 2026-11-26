// neteoAsientoMarval.js — Neteo del asiento de Marval (modo Generar Reporte)
//
// Arma el asiento contable del mes desde la Contabilidad Desglosada de Meta4 y,
// cuando una misma cuenta tiene importe al Debe y al Haber con la misma
// dimensión (ID_CONTA) y el mismo centro de costo, deja UNA sola línea con la
// diferencia. Es el pedido de Marval; las reglas las decidió Guille el
// 26/11/2026 (D200 del proyecto de migraciones) y están en
// specs/neteo-asiento-marval.md.
//
// Las reglas, en criollo:
//   · se juntan las líneas de la misma cuenta + dimensión + centro de costo;
//     neto = Debe − Haber, al centavo; si da positivo va al Debe, si da
//     negativo al Haber (en positivo);
//   · NO se juntan las cuentas de pasivo (las que empiezan con el dígito de
//     pasivo del cliente, "2" en Marval) ni las líneas sin dimensión (ID_CONTA
//     vacío o "Null"): quedan una línea al Debe y otra al Haber, como en el
//     asiento de hoy;
//   · antes de armar nada se controla la regla de centros de costo: una
//     dimensión con legajo va a un solo centro, y una sin legajo que usa más de
//     un centro tiene que incluir el centro compartido ("13" en Marval). Si no se
//     cumple, el control FRENA y no deja descargar;
//   · si el detalle de Meta4 ya viene descuadrado (Debe ≠ Haber), se informa y
//     NO frena. Netear no puede cambiar esa diferencia: si la cambiara, frena.
//
// **Cuentas en centavos enteros.** Los importes se pasan a centavos (número
// entero) antes de sumar y restar, así 0,10 + 0,20 da 0,30 exacto y un neto
// que tiene que dar cero da cero, no 0,0000000001. Recién al final vuelven a
// pesos.
//
// **Nada del cliente cableado** (D-035): el dígito de pasivo y el centro
// compartido son configuración por cliente, editable en el Paso 2; los valores
// de acá son sólo los iniciales.

import { renderResumenDetalle, renderVerdict, renderTiles, renderIssues, renderChecks } from '../ui/resultBlocks.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { renderPlanillaPanel, NO_APLICA_REPORTE } from '../ui/planillaPanel.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum } from '../utils/currency.js';
import { periodToLabel, periodSuffix } from '../utils/dates.js';
import { EXPORT_CONTRACTS } from '../exports/contracts.js';
import { writeContractSheet } from '../exports/contractSheet.js';
import { resumenStats, RESUMEN_BLOCKS } from './resumenStats.js';

/** Valores iniciales de la configuración del cliente (semilla, no identidad: D-035). */
export const DEFAULT_NETEO_ASIENTO_CONFIG = {
  /** Con qué dígito empiezan las cuentas de pasivo en el plan de cuentas del cliente. */
  prefijoPasivo: '2',
  /** El centro de costo compartido de la regla de centros. */
  centroCompartido: '13',
};

// El legajo es el 7mo tramo de la dimensión (contando desde 0, la posición 6),
// separada por guiones. Cuando la línea no es de un empleado, ese tramo dice
// SIN_ASIGNAR.
const POSICION_LEGAJO = 6;
const SIN_LEGAJO = 'SIN_ASIGNAR';

// Lo que significa "esta línea no tiene dimensión".
const DIMENSION_VACIA = ['', 'null', 'none'];

// Formato contable de Excel con dos decimales y el guion en los ceros: el mismo
// que trae el asiento que hoy se arma a mano.
const FORMATO_CONTABLE = '_-* #,##0.00_-;\\-* #,##0.00_-;_-* "-"??_-;_-@_-';

const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

/** Pasa un importe a centavos enteros. Una celda vacía cuenta como cero. */
const aCentavos = (n) => (n === null || n === undefined ? 0 : Math.round(n * 100));
const aPesos = (c) => c / 100;

/**
 * ¿El importe trae más de dos decimales? Se mira el número tal como lo escribe
 * JavaScript (el más corto que lo representa), así un 0,29 de Excel no cuenta.
 */
function masDeDosDecimales(n) {
  if (n === null || n === undefined) return false;
  const t = String(Math.abs(n));
  if (t.includes('e')) return Math.round(n * 100) !== n * 100;
  return /\.\d{3,}/.test(t);
}

/**
 * El porqué de un importe que no se pudo leer: lo marca el lector ('texto' o
 * 'ambiguo'), y un valor que llegó como texto sin pasar por el lector cuenta
 * como 'texto'. `null` si el importe está bien (o la celda está vacía).
 */
function errorDeImporte(valor, errorDelLector) {
  if (errorDelLector) return errorDelLector;
  if (valor === null || valor === undefined) return null;
  return typeof valor === 'number' && Number.isFinite(valor) ? null : 'texto';
}

/** Una celda que en el archivo tiene que salir vacía: sólo espacios, o el texto "Null". */
function celdaVacia(v) {
  return v === null || v === undefined || DIMENSION_VACIA.includes(texto(v).toLowerCase());
}

/** ¿La línea no tiene dimensión? (ID_CONTA vacío o con el texto "Null"). */
export function sinDimension(dimension) {
  return DIMENSION_VACIA.includes(texto(dimension).toLowerCase());
}

/** El legajo de una dimensión (7mo tramo), o '' si no tiene o dice SIN_ASIGNAR. */
export function legajoDeDimension(dimension) {
  const tramos = texto(dimension).split('-');
  const legajo = tramos.length > POSICION_LEGAJO ? tramos[POSICION_LEGAJO].trim() : '';
  return legajo.toUpperCase() === SIN_LEGAJO ? '' : legajo;
}

/**
 * Config efectiva: lo guardado por el cliente reemplaza a la semilla. Un campo
 * que el cliente nunca guardó cae a la semilla.
 */
function resolveConfig(cfgIn) {
  const cfg = cfgIn || {};
  return {
    prefijoPasivo:    texto(cfg.prefijoPasivo    ?? DEFAULT_NETEO_ASIENTO_CONFIG.prefijoPasivo),
    centroCompartido: texto(cfg.centroCompartido ?? DEFAULT_NETEO_ASIENTO_CONFIG.centroCompartido),
  };
}

// ── run() ─────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} primaryRows - filas de la desglosada (js/parsers/contaNeteoParser.js)
 * @param {object[]} _tabRows    - sin uso (no pide Tabulado)
 * @param {object}   mapping     - { period, neteoAsientoConfig }
 */
export function runNeteoAsientoMarval(primaryRows, _tabRows, mapping = {}) {
  if (!primaryRows?.length) {
    return { error: 'No hay datos de la Contabilidad Desglosada. Subila en el Paso 2 antes de ejecutar.' };
  }

  const cfg = resolveConfig(mapping.neteoAsientoConfig);
  // Sin estos dos datos el control no sabe qué es pasivo ni contra qué centro
  // controlar: no se completan solos.
  if (!cfg.prefijoPasivo) {
    return {
      error: 'Falta indicar con qué dígito empiezan las cuentas de pasivo. Completalo en "Neteo del '
        + 'asiento" del Paso 2: sin ese dato no se sabe qué cuentas quedan sin netear.',
    };
  }
  if (!cfg.centroCompartido) {
    return {
      error: 'Falta indicar el centro de costo compartido de la regla de centros. Completalo en "Neteo del '
        + 'asiento" del Paso 2.',
    };
  }

  // 0. Importes que no se pudieron leer: no se suman como cero, se frena.
  const malos = new Map();   // 'DEBE|texto' → cantidad de filas
  let filasMasDecimales = 0;
  for (const r of primaryRows) {
    for (const [columna, valor, err] of [['DEBE', r.debe, r.debeError], ['HABER', r.haber, r.haberError]]) {
      const tipo = errorDeImporte(valor, err);
      if (tipo) malos.set(`${columna}|${tipo}`, (malos.get(`${columna}|${tipo}`) || 0) + 1);
    }
    if (masDeDosDecimales(r.debe) || masDeDosDecimales(r.haber)) filasMasDecimales++;
  }
  if (malos.size > 0) {
    return {
      period: mapping.period || '',
      config: cfg,
      filasDetalle: primaryRows.length,
      freno: {
        tipo: 'importes',
        problemas: [...malos.entries()].map(([k, filas]) => {
          const [columna, tipo] = k.split('|');
          return { columna, tipo, filas };
        }),
      },
      lineas: [],
    };
  }

  // 1. Suma Debe y Haber por cuenta + dimensión + centro de costo.
  const grupos = new Map();
  const centrosPorDimension = new Map();
  const nombreDeCuenta = new Map();   // el nombre de cada cuenta: el de su primera fila
  let totalDebeC = 0, totalHaberC = 0;

  for (const r of primaryRows) {
    const cuenta = texto(r.cuenta), dimension = texto(r.dimension), centro = texto(r.centro);
    const clave = JSON.stringify([cuenta, dimension, centro]);
    let g = grupos.get(clave);
    if (!g) {
      // Cuenta, dimensión, centro y nombre salen como vinieron en la primera
      // fila del grupo (un número sigue siendo número en el Excel).
      g = { cuenta, dimension, centro, raw: r, debeC: 0, haberC: 0, filas: 0 };
      grupos.set(clave, g);
    }
    const d = aCentavos(r.debe), h = aCentavos(r.haber);
    g.debeC += d; g.haberC += h; g.filas++;
    totalDebeC += d; totalHaberC += h;

    if (!nombreDeCuenta.has(cuenta)) nombreDeCuenta.set(cuenta, r.n_cuenta);
    if (!sinDimension(dimension)) {
      if (!centrosPorDimension.has(dimension)) centrosPorDimension.set(dimension, new Set());
      centrosPorDimension.get(dimension).add(centro);
    }
  }

  const diferenciaAntesC = totalDebeC - totalHaberC;
  const base = {
    period: mapping.period || '',
    config: cfg,
    filasDetalle: primaryRows.length,
    filasMasDecimales,
    totalDebeAntes: aPesos(totalDebeC),
    totalHaberAntes: aPesos(totalHaberC),
    diferenciaAntes: aPesos(diferenciaAntesC),
  };

  // 2. Regla de centros de costo: si no se cumple, no se arma nada.
  const reglaCentros = controlarCentros(centrosPorDimension, cfg.centroCompartido);
  if (reglaCentros.problemas.length > 0) {
    return {
      ...base,
      freno: { tipo: 'centros', problemas: reglaCentros.problemas },
      reglaCentros,
      lineas: [],
    };
  }

  // 3. Arma el asiento, en orden: cuenta, dimensión, centro.
  const esPasivo = (cuenta) => cuenta.startsWith(cfg.prefijoPasivo);
  const ordenados = [...grupos.values()].sort(compararGrupos);
  const lineas = [];

  for (const g of ordenados) {
    const comun = {
      cuenta_contab: g.raw.cuenta,
      n_cuenta_contable: nombreDeCuenta.get(g.cuenta),
      id_conta: g.raw.dimension,
      // Un centro que viene sólo con espacios y un nombre de centro "Null" salen
      // como celda vacía, como en el asiento de referencia. La dimensión "Null"
      // se deja como viene.
      id_centro_costo: celdaVacia(g.raw.centro) ? null : g.raw.centro,
      nombre2: celdaVacia(g.raw.nombre2) ? null : g.raw.nombre2,
      debe_antes: aPesos(g.debeC),
      haber_antes: aPesos(g.haberC),
      filas: g.filas,
      _cuenta: g.cuenta,
    };

    if (esPasivo(g.cuenta) || sinDimension(g.dimension)) {
      // No se netea: una línea por cada lado que tiene importe, primero el Debe.
      const motivo = esPasivo(g.cuenta) ? 'pasivo' : 'sin_dimension';
      if (g.debeC !== 0) lineas.push({ ...comun, tipo: 'abierta', motivo, debeC: g.debeC, haberC: 0 });
      if (g.haberC !== 0) lineas.push({ ...comun, tipo: 'abierta', motivo, debeC: 0, haberC: g.haberC });
      // Sin importe de ningún lado: queda una línea en cero, y se avisa.
      if (g.debeC === 0 && g.haberC === 0) lineas.push({ ...comun, tipo: 'abierta', motivo, debeC: 0, haberC: 0 });
      continue;
    }

    const netoC = g.debeC - g.haberC;
    lineas.push({
      ...comun,
      // "Se juntaron" sólo si había importe de los dos lados; si había de uno
      // solo, la línea queda igual que en el detalle.
      tipo: g.debeC !== 0 && g.haberC !== 0 ? 'junta' : 'una',
      motivo: null,
      debeC: netoC > 0 ? netoC : 0,
      haberC: netoC < 0 ? -netoC : 0,
    });
  }

  // La cuenta y su nombre se escriben sólo en la primera línea de cada cuenta.
  let cuentaAnterior = null;
  for (const l of lineas) {
    l.primeraDeCuenta = l._cuenta !== cuentaAnterior;
    cuentaAnterior = l._cuenta;
    l.debe = aPesos(l.debeC);
    l.haber = aPesos(l.haberC);
  }

  const totalDebeC2 = lineas.reduce((s, l) => s + l.debeC, 0);
  const totalHaberC2 = lineas.reduce((s, l) => s + l.haberC, 0);
  const diferenciaDespuesC = totalDebeC2 - totalHaberC2;

  // 4. Control interno: netear no puede cambiar la diferencia Debe − Haber.
  const freno = diferenciaDespuesC !== diferenciaAntesC
    ? { tipo: 'diferencia', antes: aPesos(diferenciaAntesC), despues: aPesos(diferenciaDespuesC) }
    : null;

  // 5. Que ninguna cuenta + dimensión neteada quede con una línea al Debe y otra
  //    al Haber (pasaría si la misma dimensión tiene dos centros). Las abiertas
  //    quedan así a propósito y no entran.
  const lados = new Map();
  for (const l of lineas) {
    if (l.tipo === 'abierta') continue;
    const k = JSON.stringify([l._cuenta, texto(l.id_conta)]);
    if (!lados.has(k)) lados.set(k, new Set());
    if (l.debeC !== 0) lados.get(k).add('D');
    if (l.haberC !== 0) lados.get(k).add('H');
  }
  const conDosLados = [...lados.values()].filter(s => s.size > 1).length;

  return {
    ...base,
    freno,
    reglaCentros,
    lineas: lineas.map(({ debeC, haberC, _cuenta, ...l }) => l),
    totalDebe: aPesos(totalDebeC2),
    totalHaber: aPesos(totalHaberC2),
    diferenciaDespues: aPesos(diferenciaDespuesC),
    juntas:   lineas.filter(l => l.tipo === 'junta').length,
    abiertas: lineas.filter(l => l.tipo === 'abierta').length,
    unaSola:  lineas.filter(l => l.tipo === 'una').length,
    enCero:   lineas.filter(l => l.debeC === 0 && l.haberC === 0).length,
    conDosLados,
  };
}

/**
 * Regla de centros de costo (criterio de Guille, 26/11/2026):
 *   · una dimensión CON legajo nunca tiene más de un centro de costo;
 *   · una dimensión SIN legajo con más de un centro tiene que tener el centro
 *     compartido entre ellos.
 */
export function controlarCentros(centrosPorDimension, centroCompartido) {
  const problemas = [];
  let conLegajo = 0, sinLegajoVarios = 0;
  const dimensiones = [...centrosPorDimension.keys()].sort();
  for (const dimension of dimensiones) {
    const centros = [...centrosPorDimension.get(dimension)].sort();
    const legajo = legajoDeDimension(dimension);
    if (legajo) conLegajo++;
    if (centros.length < 2) continue;
    if (legajo) {
      problemas.push({ dimension, centros, motivo: 'legajo' });
    } else {
      sinLegajoVarios++;
      if (!centros.includes(centroCompartido)) problemas.push({ dimension, centros, motivo: 'sin_compartido' });
    }
  }
  return { problemas, dimensiones: dimensiones.length, conLegajo, sinLegajoVarios, centroCompartido };
}

/** Orden del asiento: cuenta, después dimensión, después centro de costo. */
function compararGrupos(a, b) {
  return compararValor(a.cuenta, b.cuenta)
    || compararValor(a.dimension, b.dimension)
    || compararValor(a.centro, b.centro);
}

/** Compara como números si los dos lo son; si no, como texto. */
function compararValor(a, b) {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const na = Number(a), nb = Number(b);
    if (na !== nb) return na < nb ? -1 : 1;
    return 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

// ── summarize() ───────────────────────────────────────────────────────────────

/**
 * No compara dos archivos: arma uno. El semáforo queda en gris (sin unidad que
 * contar) salvo que un freno lo ponga en rojo.
 */
export function summarizeNeteoAsientoMarval(results) {
  const vacio = {
    unit: null, unitsTotal: null, unitsWithDiff: null,
    diffTotalAmount: null, worstCase: null, contextNote: null,
  };
  if (results.error) {
    return { status: 'error', headline: results.error, insights: [], ...vacio };
  }
  // No cruza dos archivos: no hay escala, puente, lados ni cortes que dibujar
  // en el tablero del Resumen. Se declara explícito (specs/vista-estandar-resumen.md §4).
  const resumen = resumenStats({ unit: null, rows: [], notApplicable: RESUMEN_BLOCKS });

  if (results.freno) {
    return { status: 'error', headline: tituloDelFreno(results), insights: [], ...vacio, resumen: resumen };
  }

  const insights = [];
  if (results.diferenciaAntes !== 0) {
    // La tarjeta dibuja primero `value` (en negrita) y después `label`.
    insights.push({ type: 'warning', value: 'Detalle de Meta4 descuadrado',
      label: `en ${fmtNum(Math.abs(results.diferenciaAntes))} (${results.diferenciaAntes > 0 ? 'Debe' : 'Haber'} mayor)` });
  }
  if (results.filasMasDecimales > 0) {
    insights.push({ type: 'warning', label: 'filas con importes de más de 2 decimales', value: results.filasMasDecimales });
  }
  if (results.enCero > 0) {
    insights.push({ type: 'warning', label: 'líneas que quedaron en cero', value: results.enCero });
  }
  return {
    status: insights.length ? 'warning' : 'info',
    headline: `${results.lineas.length} líneas de asiento · ${results.juntas} se juntaron · ${results.abiertas} quedaron abiertas`,
    insights,
    ...vacio,
    resumen: resumen,
  };
}

function tituloDelFreno(results) {
  const f = results.freno;
  if (f.tipo === 'importes') {
    const filas = f.problemas.reduce((s, p) => s + p.filas, 0);
    return `No se puede netear: ${filas} fila${filas === 1 ? '' : 's'} de la desglosada `
      + `tiene${filas === 1 ? '' : 'n'} en Debe o Haber algo que no se puede leer como importe.`;
  }
  if (f.tipo === 'centros') {
    return `No se puede netear: ${f.problemas.length} dimensión${f.problemas.length === 1 ? '' : 'es'} `
      + `no cumple${f.problemas.length === 1 ? '' : 'n'} la regla de centros de costo.`;
  }
  return 'No se puede descargar: al netear cambió la diferencia entre Debe y Haber.';
}

// ── Pantalla de resultados ────────────────────────────────────────────────────

export function renderNeteoAsientoMarvalResults(results, container) {
  if (results.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }
  const hayLineas = results.lineas.length > 0;
  renderResumenDetalle(container, {
    controlId: 'neteo_asiento_marval',
    conDiferencias: !!results.freno,
    resumen: (panel) => renderResumenTab(panel, results),
    // Con el freno de centros no se armó ninguna línea: no hay planilla que ver.
    planilla: hayLineas ? (panel) => renderDetalleTab(panel, results) : undefined,
  });
}

function renderResumenTab(panel, results) {
  const f = results.freno;
  const rc = results.reglaCentros;

  if (f?.tipo === 'importes') {
    renderVerdict(panel, {
      tone: 'error',
      title: tituloDelFreno(results),
      body: 'Un importe que no se puede leer no se suma como cero: revisá esas celdas en la desglosada '
        + '(o volvé a bajarla de Meta4) y cargala de nuevo.',
    });
    renderIssues(panel, {
      heading: 'Importes que no se pudieron leer',
      items: f.problemas.map(p => ({
        sev: 'hi',
        who: `Columna ${p.columna}`,
        what: p.tipo === 'ambiguo'
          ? `${p.filas} fila(s) con un número escrito como texto que se puede leer de dos formas (por ejemplo "1.234": mil doscientos treinta y cuatro o uno con 234).`
          : `${p.filas} fila(s) con un texto que no es un importe.`,
        why: 'Mientras esto no se corrija el asiento no se arma ni se puede descargar.',
      })),
    });
    return;
  }

  if (f?.tipo === 'centros') {
    renderVerdict(panel, {
      tone: 'error',
      title: tituloDelFreno(results),
      body: 'Una dimensión con legajo va a un solo centro, y una sin legajo que usa varios tiene que incluir '
        + `el ${esc(rc.centroCompartido)}. Corregilo en Meta4 y volvé a bajar la desglosada.`,
    });
    renderIssues(panel, {
      heading: 'Dimensiones que no cumplen la regla',
      items: f.problemas.map(p => ({
        sev: 'hi',
        who: p.dimension,
        what: p.motivo === 'legajo'
          ? `Tiene legajo y ${p.centros.length} centros de costo (${p.centros.map(c => c || '(vacío)').join(', ')}).`
          : `Sin legajo, con ${p.centros.length} centros y ninguno es el ${rc.centroCompartido} `
            + `(${p.centros.map(c => c || '(vacío)').join(', ')}).`,
        why: 'Mientras esto no se corrija el asiento no se arma ni se puede descargar.',
      })),
    });
    return;
  }

  if (f?.tipo === 'diferencia') {
    renderVerdict(panel, {
      tone: 'error',
      title: tituloDelFreno(results),
      body: `Antes de netear la diferencia era ${fmtNum(f.antes)} y después es ${fmtNum(f.despues)}. `
        + 'Esto no debería pasar nunca: no mandes el asiento y avisá a quien mantiene la herramienta.',
    });
  } else {
    renderVerdict(panel, {
      tone: results.diferenciaAntes !== 0 || results.enCero > 0 ? 'warn' : 'ok',
      title: 'Listo para descargar',
      body: [
        results.period ? periodToLabel(results.period) : null,
        'El asiento se neteó sin cambiar la diferencia entre Debe y Haber, y la regla de centros de costo se cumple.',
      ].filter(Boolean).join(' · '),
    });
  }

  renderTiles(panel, [
    { label: 'Filas del detalle', value: results.filasDetalle.toLocaleString('es-AR'), sub: 'de la desglosada' },
    { label: 'Líneas neteadas', value: results.lineas.length.toLocaleString('es-AR'), sub: 'las del asiento' },
    { label: 'Se juntaron', value: results.juntas.toLocaleString('es-AR'), sub: 'tenían Debe y Haber' },
    { label: 'Quedaron abiertas', value: results.abiertas.toLocaleString('es-AR'),
      sub: 'pasivo o sin dimensión' },
  ]);

  const items = [];
  if (results.filasMasDecimales > 0) {
    items.push({
      sev: 'mid', who: 'Importes con más de 2 decimales',
      what: `${results.filasMasDecimales} fila(s) de la desglosada traen un importe con más de 2 decimales.`,
      why: 'Se redondearon al centavo para netear. Revisá en Meta4 si el importe vino bien.',
    });
  }
  if (results.diferenciaAntes !== 0) {
    items.push({
      sev: 'mid', who: 'Descuadre del detalle de Meta4',
      what: `Debe y Haber del detalle difieren en ${fmtNum(results.diferenciaAntes)} `
        + `(Debe ${fmtNum(results.totalDebeAntes)} contra Haber ${fmtNum(results.totalHaberAntes)}).`,
      why: 'Viene así de Meta4: netear no lo crea ni lo arregla. Revisalo antes de mandar el asiento.',
    });
  }
  if (results.enCero > 0) {
    items.push({
      sev: 'mid', who: 'Líneas en cero',
      what: `${results.enCero} línea(s) quedaron en cero después de netear (salen con 0,00 en los dos lados).`,
      why: 'Están en la solapa Planilla. Confirmá si Marval las quiere en el asiento.',
    });
  }
  if (items.length) renderIssues(panel, { heading: 'Para revisar antes de mandarlo', items });

  renderChecks(panel, { heading: 'Chequeos de coherencia', items: [
    { ok: !f, label: 'Netear no cambió la diferencia Debe − Haber',
      detail: `antes ${fmtNum(results.diferenciaAntes)} · después ${fmtNum(results.diferenciaDespues)}` },
    { ok: true, label: 'Regla de centros de costo',
      detail: `${rc.conLegajo} dimensiones con legajo, ninguna con dos centros; ${rc.sinLegajoVarios} sin legajo `
        + `con más de un centro, todas con el ${rc.centroCompartido}` },
    { ok: results.conDosLados === 0,
      label: 'Ninguna cuenta y dimensión quedó con una línea al Debe y otra al Haber',
      detail: results.conDosLados === 0 ? 'sin casos (las abiertas no entran)' : `${results.conDosLados} caso(s)` },
  ] });
}

const QUE_PASO = {
  junta: 'Se juntó',
  una: 'Una sola línea',
  abierta: 'Quedó abierta',
};

function quePaso(l) {
  if (l.tipo === 'junta') {
    if (l.debe > 0) return 'Se juntó: neto al Debe';
    if (l.haber > 0) return 'Se juntó: neto al Haber';
    return 'Se juntó: neto cero';
  }
  if (l.tipo === 'abierta') return l.motivo === 'pasivo' ? 'Abierta: pasivo' : 'Abierta: sin dimensión';
  return QUE_PASO.una;
}

function renderDetalleTab(panel, results) {
  const puedeDescargar = !results.freno;
  const columns = [
    { key: 'cuenta_contab', label: 'Cuenta', band: 'Línea' },
    { key: 'n_cuenta_contable', label: 'Nombre de cuenta', band: 'Línea' },
    { key: 'id_conta', label: 'Dimensión', sub: 'ID_CONTA', band: 'Línea' },
    { key: 'id_centro_costo', label: 'Centro', band: 'Línea' },
    { key: 'nombre2', label: 'Nombre del centro', band: 'Línea', close: true },
    { key: 'debe_antes', label: 'Debe antes', sub: 'suma del detalle', num: true, band: 'Antes' },
    { key: 'haber_antes', label: 'Haber antes', sub: 'suma del detalle', num: true, band: 'Antes', close: true },
    { key: 'debe', label: 'Suma de DEBE', sub: 'lo que se asienta', num: true, band: 'Después' },
    { key: 'haber', label: 'Suma de HABER', sub: 'lo que se asienta', num: true, band: 'Después', close: true },
    { key: 'tipo', label: 'Qué pasó', band: 'Neteo', cell: l => esc(quePaso(l)) },
  ];

  renderPlanillaPanel(panel, {
    rows: results.lineas,
    columns,
    unitLabel: 'líneas',
    // Arma un archivo, no cruza dos: los chips de caso no aplican.
    estadoDe: () => null,
    noAplica: NO_APLICA_REPORTE,
    marcas: [
      { value: 'junta', label: 'Se juntaron', match: l => l.tipo === 'junta' },
      { value: 'abierta', label: 'Quedaron abiertas', match: l => l.tipo === 'abierta' },
      { value: 'una', label: 'Una sola línea', match: l => l.tipo === 'una' },
    ],
    getLabel: l => `${texto(l.cuenta_contab)} ${texto(l.n_cuenta_contable)} ${texto(l.id_conta)} ${texto(l.id_centro_costo)}`,
    searchLabel: 'Buscar cuenta, dimensión o centro',
    searchPlaceholder: 'Cuenta, dimensión o centro…',
    stickyCols: 2,
    col1Width: 96,
    onExport: puedeDescargar ? (exportEl) => mountExportMenu(exportEl, results) : undefined,
    emptyText: 'Ninguna línea quedó con los filtros puestos.',
    footnote: (shown) => `Mostrando ${shown.length} de ${results.lineas.length} líneas. `
      + (puedeDescargar
        ? 'En el Excel la cuenta y su nombre van sólo en la primera línea de cada cuenta, como el asiento de hoy.'
        : 'La descarga está deshabilitada: el control frenó (mirá el Resumen).'),
  });
}

function mountExportMenu(exportEl, results) {
  const { headers, filas, nombre } = filasDelArchivo(results);
  renderExportMenu(exportEl, {
    onExcel: () => exportAsientoNeteado(results),
    onCsv:   () => downloadCsv(headers, filas, `${nombre}.csv`),
    onCopy:  () => copyRowsToClipboard(headers, filas),
  });
}

/**
 * Las líneas como van en el archivo: la cuenta y su nombre sólo en la primera
 * línea de cada cuenta, como la tabla dinámica de hoy.
 */
export function lineasDelArchivo(results) {
  return results.lineas.map(l => ({
    cuenta_contab: l.primeraDeCuenta ? l.cuenta_contab : null,
    n_cuenta_contable: l.primeraDeCuenta ? l.n_cuenta_contable : null,
    id_conta: l.id_conta,
    id_centro_costo: l.id_centro_costo,
    nombre2: l.nombre2,
    debe: l.debe,
    haber: l.haber,
  }));
}

function filasDelArchivo(results) {
  const contrato = EXPORT_CONTRACTS.neteo_asiento_marval;
  const headers = contrato.columns.map(c => c.label);
  const filas = lineasDelArchivo(results).map(l => contrato.columns.map(c =>
    (c.type === 'num' ? fmtNum(l[c.key]) : texto(l[c.key]))));
  filas.push(['Total general', '', '', '', '', fmtNum(results.totalDebe), fmtNum(results.totalHaber)]);
  return { headers, filas, nombre: `Asiento_Neteado_${periodSuffix(results.period)}` };
}

/**
 * Escribe el asiento neteado en un libro de ExcelJS (sin descargarlo). Separado
 * de la descarga para poder probar el archivo fuera del navegador.
 */
export function escribirAsientoNeteado(wb, results) {
  const contrato = EXPORT_CONTRACTS.neteo_asiento_marval;
  const ws = writeContractSheet(wb, contrato, lineasDelArchivo(results), {
    totalRow: { cuenta_contab: 'Total general', debe: results.totalDebe, haber: results.totalHaber },
  });
  // Los importes con el formato contable del asiento de hoy (el guion en los ceros).
  const colNum = contrato.columns.map((c, i) => (c.type === 'num' ? i + 1 : null)).filter(Boolean);
  ws.eachRow?.((row, nro) => {
    if (nro === 1) return;
    for (const i of colNum) row.getCell(i).numFmt = FORMATO_CONTABLE;
  });
  return ws;
}

/** Descarga el asiento. Con un freno no descarga nada y devuelve `false`. */
export async function exportAsientoNeteado(results) {
  // Defensa: con un freno no se descarga, aunque alguien llegue a llamar esto.
  if (results.freno) return false;
  await loadExcelJS();
  const wb = new window.ExcelJS.Workbook();
  escribirAsientoNeteado(wb, results);
  await downloadWorkbook(wb, `Asiento_Neteado_${periodSuffix(results.period)}.xlsx`);
  return true;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
