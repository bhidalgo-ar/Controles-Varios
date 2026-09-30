// saldoVacaciones.js — Saldo de vacaciones (COTY, modo Generar Reporte)
//
// Control de generación, no de cruce: toma los dos archivos de Axton tal cual se
// bajan —el reporte de **Vacaciones** y los **Liquidaciones** (totales por
// concepto)— y arma el "Saldo vac MM-AAAA.xlsx" que hasta ahora se armaba a
// mano: una fila por legajo con el saldo y la provisión de vacaciones del mes,
// los días que corresponden y los gozados, y lo que pasó en las bajas.
//
// Las reglas están verificadas contra datos reales de agosto y septiembre de
// 2026 (ver `specs/saldo-vacaciones-coty.md`); nada de lo que sale del archivo
// se recalcula:
//   · Saldo_vacaciones = la CANTIDAD del concepto de provisión (800172), tal
//     cual la informa Axton — no se rehace Días × mes / 12.
//   · Prov_vac = el IMPORTE de ese mismo concepto.
//   · Vac_Proporcionales_(Baja) / 3553_Vacaciones = cantidad / importe del
//     concepto de vacaciones no gozadas (503310), o 0 si el legajo no lo tiene.
//   · VAC_A_DIC = "Dias" y Vac_Liq_en_el_MES = "Gozados", del reporte de
//     Vacaciones.
//
// **Consolidar por legajo, los dos lados.** Liquidaciones trae una fila por
// legajo × liquidación (la de provisiones y la de la baja del mismo mes): se
// SUMA con `consolidate.js`, y los dos archivos se cruzan con la **misma** clave
// de legajo del cliente (D-038/D-042), así «0656» y «656» son el mismo empleado.
//
// **`null` no es `0`.** Un dato que no existe en ninguna de las dos fuentes (el
// alta, los días y el saldo de un legajo que sólo está en Liquidaciones) sale
// VACÍO en el Excel y se explica en Observaciones. Lo único que sale en 0 es lo
// que el pedido define así: las dos columnas de la baja de un legajo sin 503310.
//
// **Los códigos de concepto son semilla** (D-035/D-039): 800172 y 503310 viven
// sólo en `DEFAULT_SALDO_VAC_CONFIG`, se buscan como prefijo del encabezado y
// `mapping.saldoVacacionesConfig` los pisa si algún día se guarda una
// configuración del cliente. Todavía no hay pantalla para editarlos (no es un
// pedido de COTY): una renumeración hoy se arregla con ese commit, no desde el
// Paso 2.

import { renderResumenDetalle, renderVerdict, renderTiles, renderIssues, renderChecks } from '../ui/resultBlocks.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { renderPlanillaPanel, NO_APLICA_REPORTE } from '../ui/planillaPanel.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum, toNum } from '../utils/currency.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { groupRowsByLegajo, sumColumn } from './consolidate.js';
import { resumenStats } from './resumenStats.js';
import { periodoDeLiquidacion } from '../parsers/saldoVacacionesParser.js';

/** Semilla de los códigos de concepto de Liquidaciones. Es semilla, no identidad (D-035). */
export const DEFAULT_SALDO_VAC_CONFIG = {
  /** Provisión de vacaciones: su cantidad es el saldo y su importe la provisión del mes. */
  codigoProvision: '800172',
  /** Vacaciones no gozadas (la baja): días proporcionales e importe. */
  codigoBaja: '503310',
};

// Validar una suma contra el TOTAL GENERAL del archivo es una tolerancia
// ESTRUCTURAL (no el monto de diferencia del cliente, D-069): mide si el archivo
// se leyó completo, y subirla taparía un archivo mal leído.
const TOL_TOTAL = 0.01;
// Un centavo justo (2.800,50 contra 2.800,51) da 0,0100000000002 en coma flotante.
const EPS_FLOAT = 1e-9;

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Lo que el pedido fija para el .xlsx: encabezados literales (incluido el doble
// espacio de "en el  mes"), tal cual los tiene el modelo aprobado.
const TITULOS_FILA_1 = {
  saldo:      'Saldo acumulado al mes',
  prov:       'Valor de la Provision del mes',
  dias:       'Dias de Vac que corresponden',
  gozados:    'Dias de Vac Liquidadas en el  mes',
  bajaDias:   'Dias de Vac en la baja',
  bajaImporte: 'Concepto 3553',
};
const COLUMNAS = [
  { key: 'legajo',      label: 'Legajo' },
  { key: 'nombre',      label: 'NOMBRE' },
  { key: 'ingreso',     label: 'FECHA_ALTA' },
  { key: 'egreso',      label: 'Fecha_baja' },
  { key: 'saldo',       label: 'Saldo_vacaciones' },
  { key: 'prov',        label: 'Prov_vac' },
  { key: 'dias',        label: 'VAC_A_DIC' },
  { key: 'gozados',     label: 'Vac_Liq_en_el_MES' },
  { key: 'bajaDias',    label: 'Vac_Proporcionales_(Baja)' },
  { key: 'bajaImporte', label: '3553_Vacaciones' },
  { key: 'obs',         label: 'Observaciones' },
];

class ErrorDeNegocio extends Error {}

function resolveConfig(cfgIn) {
  const cfg = cfgIn || {};
  return {
    codigoProvision: String(cfg.codigoProvision ?? DEFAULT_SALDO_VAC_CONFIG.codigoProvision).trim(),
    codigoBaja:      String(cfg.codigoBaja      ?? DEFAULT_SALDO_VAC_CONFIG.codigoBaja).trim(),
  };
}

/** El encabezado que arranca con el código, sin confundir 80017 con 800172. */
function buscarConcepto(headers, codigo) {
  return (headers || []).find(h => {
    const t = String(h).trim();
    return t.startsWith(codigo) && !/[0-9A-Za-z]/.test(t.charAt(codigo.length) || ' ');
  }) || null;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** 'dd/mm/aaaa' → 'AAAA-MM-DD' (o `null` si viene vacía). Una fecha ilegible corta. */
function fechaISO(txt, columna, legajo) {
  const t = String(txt ?? '').trim();
  if (!t) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const d = m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null;
  if (!d || d.getUTCDate() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1) {
    throw new ErrorDeNegocio(
      `En el reporte de Vacaciones, la fecha de ${columna} "${t}" del legajo ${legajo} no tiene el formato `
      + 'dd/mm/aaaa. No se puede armar el reporte con una fecha que no se entiende.'
    );
  }
  return d.toISOString().slice(0, 10);
}

/** "Apellido,Nombre" → "Apellido, Nombre": el formato del modelo. */
const conEspacioTrasLaComa = (s) => String(s ?? '').replace(/,\s*/, ', ');

// ── run() ─────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} primaryRows - filas del reporte de Vacaciones
 *   (js/parsers/saldoVacacionesParser.js): una por legajo.
 * @param {object[]} _tabRows - sin uso (tabRequired: false)
 * @param {object}   mapping  - { period, legajoKeyMode, saldoVacacionesConfig,
 *                                liquidacionesRows, liquidacionesMeta,
 *                                liquidacionesFileName, vacacionesFileName }
 */
export function runSaldoVacaciones(primaryRows, _tabRows, mapping) {
  try {
    return armarSaldoVacaciones(primaryRows, mapping || {});
  } catch (e) {
    if (e instanceof ErrorDeNegocio) return { error: e.message };
    throw e;
  }
}

function armarSaldoVacaciones(vacRows, mapping) {
  const liqRows = mapping.liquidacionesRows || [];
  const liqMeta = mapping.liquidacionesMeta || {};

  if (!vacRows?.length) {
    throw new ErrorDeNegocio('No hay datos del reporte de Vacaciones. Subilo en el Paso 2 antes de ejecutar.');
  }
  if (!liqRows.length) {
    throw new ErrorDeNegocio('No hay datos del reporte de Liquidaciones. Subilo en el Paso 2 antes de ejecutar.');
  }

  // ── Los conceptos, por código ──────────────────────────────────────────────
  const cfg = resolveConfig(mapping.saldoVacacionesConfig);
  const hProv = buscarConcepto(liqMeta.conceptos, cfg.codigoProvision);
  const hBaja = buscarConcepto(liqMeta.conceptos, cfg.codigoBaja);
  const faltan = [
    hProv ? null : cfg.codigoProvision,
    hBaja ? null : cfg.codigoBaja,
  ].filter(Boolean);
  if (faltan.length) {
    throw new ErrorDeNegocio(
      `En el reporte de Liquidaciones no hay ninguna columna de concepto que empiece con ${faltan.map(c => `"${c}"`).join(' ni ')}. `
      + `El archivo trae estos conceptos: ${(liqMeta.conceptos || []).map(c => `"${c}"`).join(', ') || '(ninguno)'}. `
      + 'Verificá que sea el reporte de la liquidación de provisiones y bajas del período.'
    );
  }

  // Filas planas: una por liquidación, con los cuatro valores que se usan.
  const liq = liqRows.map(r => ({
    legajo: r.legajo, nombre: r.nombre, liquidacion: r.liquidacion,
    provCant: toNum(r.valores?.[hProv]?.cant), provImp: toNum(r.valores?.[hProv]?.imp),
    bajaCant: toNum(r.valores?.[hBaja]?.cant), bajaImp: toNum(r.valores?.[hBaja]?.imp),
  }));

  // ── El archivo se leyó completo: la suma cierra con el TOTAL GENERAL ───────
  validarContraTotalGeneral(liq, liqMeta.totales, { hProv, hBaja });

  // ── El período sale del texto de la liquidación ────────────────────────────
  const periodos = new Map();
  let sinPeriodo = 0;
  for (const r of liq) {
    const p = periodoDeLiquidacion(r.liquidacion);
    if (p) periodos.set(p, (periodos.get(p) || 0) + 1); else sinPeriodo++;
  }
  if (periodos.size === 0) {
    throw new ErrorDeNegocio(
      'No se pudo determinar el período: la columna "liquidacion" del reporte de Liquidaciones no trae un texto '
      + 'como "(Provisiones 09-2026)". No se adivina el mes por el nombre del archivo ni por la fecha.'
    );
  }
  if (periodos.size > 1) {
    throw new ErrorDeNegocio(
      `El reporte de Liquidaciones mezcla períodos (${[...periodos.keys()].sort().map(p => p.split('-').reverse().join('-')).join(', ')}). `
      + 'Bajalo de nuevo con un solo período.'
    );
  }
  const period = [...periodos.keys()][0];
  const [anioTxt, mesTxt] = period.split('-');
  const anio = Number(anioTxt);
  const mes = Number(mesTxt);

  const avisosGenerales = [];
  if (sinPeriodo > 0) {
    avisosGenerales.push(
      `${sinPeriodo} fila${sinPeriodo === 1 ? '' : 's'} de Liquidaciones no dice${sinPeriodo === 1 ? '' : 'n'} su período `
      + `en la columna "liquidacion"; el período ${mesTxt}-${anioTxt} sale de las demás.`
    );
  }
  if (mapping.period && mapping.period !== period) {
    avisosGenerales.push(
      `El período elegido en la app es ${String(mapping.period).split('-').reverse().join('-')} pero los archivos `
      + `son de ${mesTxt}-${anioTxt}: el reporte sale con el de los archivos.`
    );
  }

  // ── Consolidar por legajo, los dos lados, con la misma clave ───────────────
  const keyFn = makeLegajoKey(mapping.legajoKeyMode);
  const vacPorLegajo = groupRowsByLegajo(vacRows, 'legajo', { keyFn });
  const liqPorLegajo = groupRowsByLegajo(liq, 'legajo', { keyFn });

  for (const [clave, grupo] of vacPorLegajo) {
    if (grupo.length > 1) {
      throw new ErrorDeNegocio(
        `En el reporte de Vacaciones el legajo ${clave} aparece ${grupo.length} veces (filas ${grupo.map(g => g.fila).join(', ')}). `
        + 'Se espera una fila por legajo: no se elige una sola en silencio. Revisá el archivo.'
      );
    }
  }

  // Universo: la unión de los dos archivos, en orden ascendente por legajo.
  const numerico = (k) => (/^\d+$/.test(k) ? Number(k) : null);
  const claves = [...new Set([...vacPorLegajo.keys(), ...liqPorLegajo.keys()])].sort((a, b) => {
    const na = numerico(a), nb = numerico(b);
    if (na !== null && nb !== null) return na - nb;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return a.localeCompare(b, 'es');
  });

  const filas = [];
  const altas = [], bajas = [], sinProvision = [];
  const salidas = new Map();

  for (const clave of claves) {
    const v = vacPorLegajo.get(clave)?.[0] || null;
    const grupoLiq = liqPorLegajo.get(clave) || null;

    // Sumadas con el helper compartido; `null` = ninguna liquidación trajo dato.
    const provCant = sumColumn(grupoLiq, 'provCant');
    const provImp  = sumColumn(grupoLiq, 'provImp');
    const bajaCant = sumColumn(grupoLiq, 'bajaCant');
    const bajaImp  = sumColumn(grupoLiq, 'bajaImp');

    const ingreso = v ? fechaISO(v.ingreso, 'Ingreso', clave) : null;
    const egreso  = v ? fechaISO(v.egreso, 'Egreso', clave) : null;

    const tieneProvision = provCant !== null || provImp !== null;
    const tieneBaja = bajaCant !== null || bajaImp !== null;
    const esAlta = !!ingreso && ingreso.slice(0, 7) === period;
    const esBaja = tieneBaja || !v || !!egreso;

    const obs = [];
    if (esAlta) obs.push('Alta del mes: se tomó la provisión de Axton; criterio a revisar.');
    if (esBaja) {
      const falta = [];
      if (!v) falta.push('no figura en el reporte de Vacaciones (sin alta, días ni saldo)');
      if (!tieneProvision) falta.push(`sin provisión ${cfg.codigoProvision} en Liquidaciones`);
      obs.push('Baja: criterio a definir.'
        + (falta.length ? ` ${falta[0].charAt(0).toUpperCase()}${falta[0].slice(1)}${falta[1] ? `; ${falta[1]}` : ''}.` : ''));
    } else if (v && !tieneProvision) {
      obs.push('Sin provisión en Liquidaciones.');
    }

    const legajo = numerico(clave) !== null ? numerico(clave) : clave;
    const nombre = v ? conEspacioTrasLaComa(v.nombre) : (grupoLiq?.[0]?.nombre || null);
    const fila = {
      legajo,
      nombre,
      ingreso,
      egreso,
      saldo:   tieneProvision ? round2Opt(provCant) : null,
      prov:    tieneProvision ? round2Opt(provImp) : null,
      dias:    v ? v.dias : null,
      gozados: v ? v.gozados : null,
      bajaDias:    grupoLiq ? (tieneBaja ? round2Opt(bajaCant) : 0) : 0,
      bajaImporte: grupoLiq ? (tieneBaja ? round2Opt(bajaImp) : 0) : 0,
      obs: obs.join(' ') || null,
    };
    filas.push(fila);

    const ref = { legajo, nombre };
    if (esAlta) altas.push(ref);
    if (esBaja) bajas.push({ ...ref, detalle: obs.find(o => o.startsWith('Baja:')) });
    if (v && !tieneProvision && !esBaja) sinProvision.push(ref);
    fila.marcas = [esAlta ? 'alta' : null, esBaja ? 'baja' : null, (v && !tieneProvision && !esBaja) ? 'sinProvision' : null]
      .filter(Boolean);

    // Dos claves distintas que se escriben con el mismo número (sólo pasa si el
    // cliente distingue '007' de '7'): en el archivo serían indistinguibles.
    if (salidas.has(legajo) && salidas.get(legajo) !== clave) {
      avisosGenerales.push(
        `Los legajos «${salidas.get(legajo)}» y «${clave}» salen con el mismo número (${legajo}) en el archivo, `
        + 'porque el legajo va sin ceros a la izquierda y este cliente los distingue.'
      );
    }
    salidas.set(legajo, clave);
  }

  const enAmbos = claves.filter(k => vacPorLegajo.has(k) && liqPorLegajo.has(k)).length;
  const sumaFilas = (k) => round2(filas.reduce((a, f) => a + (f[k] || 0), 0));

  return {
    period,
    anio,
    mes,
    mesNombre: MESES[mes - 1],
    sheetName: `Vac_Liq_${MESES[mes - 1]}_${anio}`,
    fileName: `Saldo vac ${mesTxt}-${anioTxt}.xlsx`,
    codigos: cfg,
    conceptos: { provision: hProv, baja: hBaja },
    origen: { vacaciones: mapping.vacacionesFileName || null, liquidaciones: mapping.liquidacionesFileName || null },
    filas,
    conteos: {
      vacaciones: vacPorLegajo.size,
      liquidaciones: liqPorLegajo.size,
      ambos: enAmbos,
      soloVacaciones: vacPorLegajo.size - enAmbos,
      soloLiquidaciones: liqPorLegajo.size - enAmbos,
      total: claves.length,
      filasLiquidaciones: liq.length,
    },
    totales: {
      provCant: sumaFilas('saldo'), provImp: sumaFilas('prov'),
      bajaCant: sumaFilas('bajaDias'), bajaImp: sumaFilas('bajaImporte'),
      general: totalGeneralDe(liqMeta.totales, { hProv, hBaja }),
      cierra: true,
    },
    avisos: { altas, bajas, sinProvision, generales: avisosGenerales },
  };
}

function round2Opt(n) {
  return n === null || n === undefined ? null : round2(n);
}

function totalGeneralDe(totales, { hProv, hBaja }) {
  const t = totales?.[0];
  return {
    provCant: t?.[hProv]?.cant ?? 0, provImp: t?.[hProv]?.imp ?? 0,
    bajaCant: t?.[hBaja]?.cant ?? 0, bajaImp: t?.[hBaja]?.imp ?? 0,
  };
}

/**
 * La suma de las filas de Liquidaciones tiene que dar lo que dice el TOTAL
 * GENERAL del propio archivo, para los dos conceptos y en cantidad e importe.
 * Si no cierra, el archivo se leyó mal (o está editado) y cualquier número que
 * salga de ahí sería coherente y equivocado: se corta.
 */
function validarContraTotalGeneral(liq, totales, { hProv, hBaja }) {
  if (!totales?.length) {
    throw new ErrorDeNegocio(
      'El reporte de Liquidaciones no trae la fila "TOTAL GENERAL", así que no hay con qué comprobar que se leyó completo.'
    );
  }
  const campos = [
    { rotulo: `${hProv} (cantidad)`, h: hProv, campo: 'cant', col: 'provCant' },
    { rotulo: `${hProv} (importe)`,  h: hProv, campo: 'imp',  col: 'provImp' },
    { rotulo: `${hBaja} (cantidad)`, h: hBaja, campo: 'cant', col: 'bajaCant' },
    { rotulo: `${hBaja} (importe)`,  h: hBaja, campo: 'imp',  col: 'bajaImp' },
  ];
  const malos = [];
  for (const c of campos) {
    const suma = liq.reduce((a, r) => a + (r[c.col] ?? 0), 0);
    for (const t of totales) {
      const esperado = t[c.h]?.[c.campo] ?? 0;
      if (Math.abs(suma - esperado) > TOL_TOTAL + EPS_FLOAT) {
        malos.push(`${c.rotulo}: las filas suman ${fmtNum(suma)} y el TOTAL GENERAL dice ${fmtNum(esperado)}`);
        break;
      }
    }
  }
  if (malos.length) {
    throw new ErrorDeNegocio(
      `El reporte de Liquidaciones no cierra con su TOTAL GENERAL — ${malos.join('; ')}. `
      + 'El archivo se leyó incompleto o fue editado: bajalo de nuevo de Axton. No se genera el reporte.'
    );
  }
}

// ── El libro .xlsx ────────────────────────────────────────────────────────────
// El formato es el del Excel aprobado de referencia (Saldo vac 08/09-2026): los
// colores y números de acá son los de ese archivo, no los de la app.

const FUENTE = { name: 'Aptos Narrow', size: 11, family: 2 };
const AMARILLO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' }, bgColor: { indexed: 64 } };
const FORMATO_FECHA = 'mm-dd-yy';
const ANCHOS = [6.33203125, 25.5546875, 11.44140625, 11.109375, 23.109375, 26.88671875,
  28.109375, 31.109375, 25.33203125, 16.33203125, 45];
const FORMATOS = { ingreso: FORMATO_FECHA, egreso: FORMATO_FECHA, saldo: '0.00', prov: '#,##0.00', bajaImporte: '#,##0.00' };

const aFecha = (iso) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

/**
 * El libro completo. Recibe la librería de ExcelJS (la del navegador o la de
 * node) para poder armarlo y mirarle las celdas en los tests.
 */
export function armarLibroSaldoVac(ExcelJS, results) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(results.sheetName);
  ws.columns = ANCHOS.map(width => ({ width }));

  const fila1 = ws.getRow(1);
  fila1.height = 28.2;
  COLUMNAS.forEach((c, i) => {
    const titulo = TITULOS_FILA_1[c.key];
    if (!titulo) return;
    const celda = fila1.getCell(i + 1);
    celda.value = titulo;
    celda.font = FUENTE;
    celda.fill = AMARILLO;
  });
  COLUMNAS.forEach((c, i) => {
    const celda = ws.getRow(2).getCell(i + 1);
    celda.value = c.label;
    celda.font = FUENTE;
  });

  results.filas.forEach((f, r) => {
    const row = ws.getRow(3 + r);
    COLUMNAS.forEach((c, i) => {
      const celda = row.getCell(i + 1);
      celda.value = (c.key === 'ingreso' || c.key === 'egreso') ? aFecha(f[c.key]) : (f[c.key] ?? null);
      celda.font = FUENTE;
      if (FORMATOS[c.key]) celda.numFmt = FORMATOS[c.key];
    });
  });
  ws.views = [{ activeCell: 'A3' }];

  agregarHojaNotas(wb, results);
  return wb;
}

function agregarHojaNotas(wb, results) {
  const ns = wb.addWorksheet('Notas');
  ns.columns = [{ width: 32 }, { width: 90 }];
  const hP = results.conceptos.provision;
  const hB = results.conceptos.baja;
  const origen = [results.origen.vacaciones, results.origen.liquidaciones].filter(Boolean).join(' y ')
    || 'los dos archivos de Axton (Vacaciones y Liquidaciones)';

  const lineas = [
    ['Origen', null, true],
    ['Datos:', `${origen} (período ${results.mesNombre} ${results.anio}).`],
    [],
    ['Mapeo de columnas aplicado:', null, true],
    ['Legajo', 'Legajo (ambos archivos), sin ceros a la izquierda; si tiene varias filas en Liquidaciones se suman.'],
    ['NOMBRE', 'Apellido y Nombre (Vacaciones), con espacio después de la coma; si el legajo sólo está en Liquidaciones, se tomó de ahí sin normalizar formato.'],
    ['FECHA_ALTA', 'Ingreso (Vacaciones)'],
    ['Fecha_baja', 'Egreso (Vacaciones)'],
    ['Saldo_vacaciones', `Cantidad del concepto ${hP} (Liquidaciones), tal cual la informa Axton, 2 decimales.`],
    ['Prov_vac', `Importe del concepto ${hP} (Liquidaciones), tal cual lo informa Axton.`],
    ['VAC_A_DIC', 'Dias (primera columna Dias de Vacaciones) = días de vacaciones que corresponden en el año.'],
    ['Vac_Liq_en_el_MES', 'Gozados (Vacaciones).'],
    ['Vac_Proporcionales_(Baja)', `Cantidad del concepto ${hB} (Liquidaciones); 0 si el legajo no lo tiene.`],
    ['3553_Vacaciones', `Importe del concepto ${hB} (Liquidaciones); 0 si el legajo no lo tiene. El concepto 3553 no existe en el layout de Coty; se usó ${results.codigos.codigoBaja} como equivalente funcional.`],
    ['Celdas vacías', 'Un dato que no existe en ninguna fuente queda vacío (no 0) y se explica en Observaciones.'],
    [],
    ['Pendientes:', null, true],
    ['1. Altas del mes', 'Definir el criterio: tomar la provisión de Axton (como está en este armado) o 1 día de vacaciones.'],
    ['2. Bajas', 'Definir el criterio para legajos con ' + results.codigos.codigoBaja + ', con Egreso o que figuran sólo en Liquidaciones (Saldo y provisión).'],
  ];
  for (const [a, b, negrita] of lineas) {
    const r = ns.addRow([a ?? null, b ?? null]);
    r.getCell(1).font = negrita ? { ...FUENTE, bold: true } : FUENTE;
    r.getCell(2).font = FUENTE;
  }
}

async function exportarXlsx(results) {
  const ExcelJS = await loadExcelJS();
  await downloadWorkbook(armarLibroSaldoVac(ExcelJS, results), results.fileName);
}

// ── summarize() ───────────────────────────────────────────────────────────────

export function summarizeSaldoVacaciones(results) {
  if (results.error) {
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null,
      diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const a = results.avisos;
  const insights = [];
  if (a.altas.length) insights.push({ type: 'warning', label: 'altas del mes (criterio a revisar)', value: a.altas.length });
  if (a.bajas.length) insights.push({ type: 'warning', label: 'bajas (criterio a definir)', value: a.bajas.length });
  if (a.sinProvision.length) insights.push({ type: 'warning', label: 'legajos sin provisión en Liquidaciones', value: a.sinProvision.length });

  const c = results.conteos;
  return {
    // Genera un archivo, no cruza nada: no hay diferencias que contar.
    status: 'info',
    headline: `Saldo de vacaciones ${results.mesNombre} ${results.anio} generado — ${c.total} legajo${c.total === 1 ? '' : 's'}, listo para descargar.`,
    insights,
    unit: null,
    unitsTotal: null,
    unitsWithDiff: null,
    diffTotalAmount: null,
    worstCase: null,
    contextNote: `${c.ambos} en los dos archivos · ${c.soloVacaciones} sólo en Vacaciones · ${c.soloLiquidaciones} sólo en Liquidaciones`,
    resumen: resumenStats({
      unit: null,
      rows: [],
      notApplicable: ['signed', 'buckets', 'group', 'cause', 'top', 'keys'],
      bridge: {
        kind: 'counts',
        title: 'De dónde salen los legajos del reporte',
        steps: [
          { label: 'Legajos en Vacaciones', amount: c.vacaciones, tone: 'ink' },
          { label: 'Legajos en Liquidaciones', amount: c.liquidaciones, tone: 'ink' },
          { label: 'Legajos del reporte', amount: c.total, tone: 'accent',
            note: 'la unión de los dos archivos' },
        ],
      },
    }),
  };
}

// ── Pantalla de resultados ────────────────────────────────────────────────────

export function renderSaldoVacacionesResults(results, container) {
  if (results.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }
  container.innerHTML = '';
  renderResumenDetalle(container, {
    controlId: 'saldo_vacaciones',
    resumen: (panel) => renderResumenTab(panel, results),
    planilla: (panel) => renderPlanillaTab(panel, results),
  });
}

function listaCorta(refs, max = 12) {
  const vistos = refs.slice(0, max).map(r => `${r.legajo}${r.nombre ? ` ${r.nombre}` : ''}`).join(' · ');
  return refs.length > max ? `${vistos} · y ${refs.length - max} más` : vistos;
}

function renderResumenTab(panel, results) {
  const c = results.conteos;
  const a = results.avisos;
  const t = results.totales;
  const hayAvisos = a.altas.length || a.bajas.length || a.sinProvision.length || a.generales.length;

  renderVerdict(panel, {
    tone: hayAvisos ? 'warn' : 'ok',
    title: `Saldo de vacaciones ${results.mesNombre} ${results.anio}: ${c.total} legajo${c.total === 1 ? '' : 's'}`,
    body: `${esc(results.fileName)} · la suma de las filas de Liquidaciones cierra con su TOTAL GENERAL. `
      + (hayAvisos ? 'Hay criterios pendientes para revisar antes de mandarlo (abajo).' : 'Sin avisos.'),
  });

  renderTiles(panel, [
    { label: 'Legajos del reporte', value: c.total, sub: 'unión de los dos archivos' },
    { label: 'En los dos archivos', value: c.ambos },
    { label: 'Sólo en Vacaciones', value: c.soloVacaciones, tone: c.soloVacaciones ? 'warn' : undefined,
      sub: `de ${c.vacaciones} en ese archivo` },
    { label: 'Sólo en Liquidaciones', value: c.soloLiquidaciones, tone: c.soloLiquidaciones ? 'warn' : undefined,
      sub: `de ${c.liquidaciones} en ese archivo` },
    { label: 'Provisión del mes', value: esc(fmtNum(t.provImp)), sub: `${esc(fmtNum(t.provCant))} días de saldo` },
  ]);

  const items = [];
  if (a.altas.length) {
    items.push({
      sev: 'lo', who: 'Altas del mes',
      what: `${a.altas.length} legajo${a.altas.length === 1 ? '' : 's'} con ingreso dentro del mes: ${listaCorta(a.altas)}.`,
      why: 'Se tomó la provisión que informa Axton. Falta definir si corresponde eso o 1 día de vacaciones '
        + 'por cada 20 trabajados.',
    });
  }
  if (a.bajas.length) {
    items.push({
      sev: 'hi', who: 'Bajas',
      what: `${a.bajas.length} legajo${a.bajas.length === 1 ? '' : 's'} con baja (concepto ${results.codigos.codigoBaja}, egreso, o sólo en Liquidaciones): ${listaCorta(a.bajas)}.`,
      why: 'El criterio de las bajas está por definir, y la fecha de baja no viene en ninguno de los dos archivos. '
        + 'Los que no figuran en Vacaciones salen sin alta, días ni saldo (celdas vacías).',
    });
  }
  if (a.sinProvision.length) {
    items.push({
      sev: 'lo', who: 'Sin provisión en Liquidaciones',
      what: `${a.sinProvision.length} legajo${a.sinProvision.length === 1 ? ' figura' : 's figuran'} en Vacaciones pero no ${a.sinProvision.length === 1 ? 'tiene' : 'tienen'} el concepto ${results.codigos.codigoProvision}: ${listaCorta(a.sinProvision)}.`,
      why: 'Su saldo y su provisión salen vacíos, no en cero: no hay dato en Axton.',
    });
  }
  for (const g of a.generales) {
    items.push({ sev: 'lo', who: 'Período y archivos', what: g });
  }
  if (items.length) renderIssues(panel, { heading: 'Para revisar antes de mandarlo', items });

  const g = t.general;
  const cierra = (x, y) => Math.abs(x - y) <= TOL_TOTAL + EPS_FLOAT;
  renderChecks(panel, {
    heading: 'Chequeos de coherencia',
    items: [
      { ok: cierra(t.provCant, g.provCant), label: `${results.conceptos.provision} — cantidad contra TOTAL GENERAL`,
        detail: `${fmtNum(t.provCant)} contra ${fmtNum(g.provCant)}` },
      { ok: cierra(t.provImp, g.provImp), label: `${results.conceptos.provision} — importe contra TOTAL GENERAL`,
        detail: `${fmtNum(t.provImp)} contra ${fmtNum(g.provImp)}` },
      { ok: cierra(t.bajaCant, g.bajaCant), label: `${results.conceptos.baja} — cantidad contra TOTAL GENERAL`,
        detail: `${fmtNum(t.bajaCant)} contra ${fmtNum(g.bajaCant)}` },
      { ok: cierra(t.bajaImp, g.bajaImp), label: `${results.conceptos.baja} — importe contra TOTAL GENERAL`,
        detail: `${fmtNum(t.bajaImp)} contra ${fmtNum(g.bajaImp)}` },
    ],
  });
}

const fechaEnPantalla = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

function renderPlanillaTab(panel, results) {
  const columns = [
    { key: 'legajo', label: 'Legajo', band: 'Identificación', cell: f => esc(f.legajo) },
    { key: 'nombre', label: 'NOMBRE', band: 'Identificación', close: true, cell: f => esc(f.nombre ?? '—') },
    { key: 'ingreso', label: 'FECHA_ALTA', sub: 'Ingreso (Vacaciones)', band: 'Fechas', cell: f => esc(fechaEnPantalla(f.ingreso)) },
    { key: 'egreso', label: 'Fecha_baja', sub: 'Egreso (Vacaciones)', band: 'Fechas', close: true, cell: f => esc(fechaEnPantalla(f.egreso)) },
    { key: 'saldo', label: 'Saldo_vacaciones', sub: `cantidad ${results.codigos.codigoProvision}`, band: 'Provisión', num: true },
    { key: 'prov', label: 'Prov_vac', sub: `importe ${results.codigos.codigoProvision}`, band: 'Provisión', num: true, close: true },
    { key: 'dias', label: 'VAC_A_DIC', sub: 'Dias (Vacaciones)', band: 'Días', num: true },
    { key: 'gozados', label: 'Vac_Liq_en_el_MES', sub: 'Gozados (Vacaciones)', band: 'Días', num: true, close: true },
    { key: 'bajaDias', label: 'Vac_Proporcionales_(Baja)', sub: `cantidad ${results.codigos.codigoBaja}`, band: 'Baja', num: true },
    { key: 'bajaImporte', label: '3553_Vacaciones', sub: `importe ${results.codigos.codigoBaja}`, band: 'Baja', num: true, close: true },
    { key: 'obs', label: 'Observaciones', band: 'Observaciones', cell: f => esc(f.obs ?? '') },
  ];

  renderPlanillaPanel(panel, {
    rows: results.filas,
    columns,
    unitLabel: 'legajos',
    // Genera un archivo y no cruza nada: los cuatro chips de caso salen en gris.
    estadoDe: () => null,
    noAplica: NO_APLICA_REPORTE,
    marcas: [
      { value: 'alta', label: 'Alta del mes', match: f => f.marcas.includes('alta') },
      { value: 'baja', label: 'Baja', match: f => f.marcas.includes('baja') },
      { value: 'sinProvision', label: 'Sin provisión', match: f => f.marcas.includes('sinProvision') },
    ],
    getLabel: f => `${f.legajo} ${f.nombre ?? ''}`,
    searchLabel: 'Buscar legajo o nombre',
    searchPlaceholder: 'Legajo o nombre…',
    stickyCols: 2,
    onExport: (exportEl) => renderExportMenu(exportEl, {
      items: [
        { key: 'xlsx', label: '📊 Saldo de vacaciones (.xlsx)',
          desc: `${results.fileName}, en el formato aprobado con la hoja de notas.`,
          action: () => exportarXlsx(results) },
        { key: 'csv', label: '📄 Exportar CSV', desc: 'La tabla, sin formato.',
          action: () => downloadCsv(csvHeaders(), csvRows(results), `Saldo_vac_${results.period}.csv`) },
        { key: 'copy', label: '📋 Copiar la tabla', desc: 'Se pega directo en Excel, respetando las columnas.',
          action: () => copyRowsToClipboard(csvHeaders(), csvRows(results)) },
      ],
      note: 'El archivo lleva legajo, nombre y fechas de ingreso y egreso: es de uso interno del estudio y de Payroll.',
    }),
    emptyText: 'Ningún legajo quedó con los filtros puestos.',
    footnote: (shown) => `Mostrando ${shown.length} de ${results.filas.length} legajo${results.filas.length === 1 ? '' : 's'}. `
      + 'Los datos que no existen en ninguna fuente salen vacíos y se explican en Observaciones.',
  });
}

const csvHeaders = () => COLUMNS_CSV;
const COLUMNS_CSV = COLUMNAS.map(c => c.label);

function csvRows(results) {
  return results.filas.map(f => COLUMNAS.map(c => {
    const v = f[c.key];
    if (v === null || v === undefined) return '';
    if (c.key === 'ingreso' || c.key === 'egreso') return fechaEnPantalla(v);
    return typeof v === 'number' && c.key !== 'legajo' ? fmtNum(v) : v;
  }));
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
