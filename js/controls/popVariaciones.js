// popVariaciones.js — Variación entre quincenas (OPmobility Pilar · Axton)
//
// Compara dos Tabulados de Axton —quincena anterior vs quincena actual— y arma
// el reporte de variaciones que recibe HR del cliente: valor hora de cada
// legajo, cuánto varió, cambio de CBU, altas, bajas y neto. Si además se sube el
// reporte de variaciones que exporta Axton, controla campo a campo lo generado
// contra ése y lista los legajos donde difieren.
//
// **No cruza contra el Tabulado de Meta4.** Es el segundo control del repo que
// compara un Tabulado contra otro de otro período (el primero es `variaciones.js`,
// de OPmobility Florida), y el único que lo hace con el Tabulado de Axton. Que
// los dos clientes se llamen OPmobility no los vuelve el mismo control: Florida
// (POF) compara IMPORTES de conceptos mes contra mes en Meta4; Pilar (POP)
// deriva el VALOR HORA de dos quincenas de Axton. Ver D-024.
//
// El valor hora no es una columna del archivo: se DERIVA como
// `Imp ÷ Cant` del concepto de horas normales (código 1010 en POP) de cada
// Tabulado, sumando las liquidaciones de cada legajo antes de dividir.
//
// Lo que este control NO genera, a propósito: la columna Puesto del reporte de
// Axton (M100, M0016…). No está en ninguna columna del Tabulado — sale de otro
// módulo de Axton — así que no se inventa ni se valida.
//
// Ver specs/control-variacion-quincenas-pop.md.

import { renderExportMenu } from '../ui/exportMenu.js';
import { createResultsToolbar, wireTableTools } from '../ui/tableTools.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum } from '../utils/currency.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { groupRowsByLegajo, sumColumn, lastRow } from './consolidate.js';
import { periodSuffix } from '../utils/dates.js';
import {
  renderVerdict, renderTiles, renderIssues, renderChecks, renderMinorObservations,
  renderResumenDetalle, mvClass, mvArrow, fmtSigned,
} from '../ui/resultBlocks.js';

/**
 * Semilla del cliente que todavía no configuró nada, **no identidad** (D-035).
 * El `1010` está confirmado contra los Tabulados reales de POP de julio 2026 y
 * verificado contra el reporte de variaciones de Axton del mismo período
 * (198 de 203 legajos coinciden por `Imp ÷ Cant`). Si el cliente renumera el
 * concepto, se cambia desde el Paso 2 y no con un commit.
 */
export const DEFAULT_POP_VARIACIONES_CONFIG = {
  valorHoraCode: '1010',
};

// Tolerancias. Cada una tiene su porqué y no son intercambiables:
const TOL_MOD        = 0.01;  // los floats de Excel no dan igualdad exacta
const TOL_TOTAL      = 0.05;  // suma calculada contra la fila TOTAL GENERAL
const TOL_CTRL_VH    = 0.02;  // Axton informa el valor hora redondeado a 2 decimales
const TOL_CTRL_NETO  = 1;     // …y el neto redondeado a entero

/**
 * Lo que se muestra cuando no hay dato. **No es `0,00` y no es `'N'`**: es la
 * tercera respuesta. Un valor hora que no se pudo derivar, un CBU que falta en
 * un lado o una fecha que el archivo no trae no son "sin variación" — se ven
 * distinto y se comparan distinto contra el reporte de Axton.
 */
const SIN_DATO = '—';

// ── El control ────────────────────────────────────────────────────────────────

/**
 * @param {object[]} prevRows   Tabulado de la quincena ANTERIOR (additionalFiles[0])
 * @param {object[]} _tabRows   sin uso: este control no lleva Tabulado pivote
 * @param {object}   mapping    + `tab_actRows`, `variacRows`, `popVariacionesConfig`
 */
export function runPopVariaciones(prevRows, _tabRows, mapping) {
  const cfg  = { ...DEFAULT_POP_VARIACIONES_CONFIG, ...(mapping.popVariacionesConfig || {}) };
  const code = String(cfg.valorHoraCode ?? '').trim();
  const actRows    = mapping.tab_actRows || [];
  const variacRows = mapping.variacRows  || [];

  if (!prevRows?.length) return { error: 'Falta el Tabulado de la quincena anterior.' };
  if (!actRows.length)   return { error: 'Falta el Tabulado de la quincena actual.' };
  if (!code) {
    return { error: 'No está definido el código del concepto de horas normales. Completalo en '
      + '«Concepto del valor hora» (Paso 2): sin ese código no se puede derivar el valor hora de ningún legajo.' };
  }

  const keyCant = `cant_${code}`;
  const keyImp  = `imp_${code}`;
  // Que el concepto no esté en el archivo no se completa con 0,00: sin él no hay
  // valor hora que derivar y el reporte no existe.
  const faltaEn = [];
  if (!tieneConcepto(prevRows, keyCant)) faltaEn.push('la quincena anterior');
  if (!tieneConcepto(actRows,  keyCant)) faltaEn.push('la quincena actual');
  if (faltaEn.length) {
    return { error: `El concepto ${code} (horas normales) no aparece en el Tabulado de ${faltaEn.join(' ni en ')}. `
      + 'Revisá que el código sea el correcto en «Concepto del valor hora» (Paso 2), o que los archivos sean los del período que querés comparar.' };
  }

  // Los DOS lados con la misma clave de legajo, resuelta una vez por corrida
  // (D-038): con criterios distintos por lado, el control informa faltantes que
  // no faltan.
  const keyFn = makeLegajoKey(mapping.legajoKeyMode);
  const A = indexQuincena(prevRows, { keyFn, keyCant, keyImp });
  const B = indexQuincena(actRows,  { keyFn, keyCant, keyImp });

  // Alta y Baja salen de las FECHAS de ingreso y egreso del Tabulado, no de que
  // el legajo aparezca en un archivo y no en el otro (decisión de Willy,
  // 2026-08-14). Verificado con los archivos reales: un legajo que liquidó sólo
  // en la 1ª quincena no tiene fecha de egreso —no se fue, no liquidó horas— y
  // marcarlo Baja por ausencia le avisa a HR de una baja que no existió. Los que
  // aparecen en una sola quincena salen listados aparte, sin llamarlos ni una
  // cosa ni la otra.
  const rango = quincenaRango(B.periodoKey);

  const legajos = [...new Set([...A.emps.keys(), ...B.emps.keys()])];
  const rows = legajos.map((legajo) => {
    const a = A.emps.get(legajo) || null;
    const b = B.emps.get(legajo) || null;
    const ficha = b || a;                       // la ficha de la quincena actual manda

    const vhAnterior = valorHora(a);
    const vhActual   = valorHora(b);

    let mod = SIN_DATO, dif = null, pct = null, pctSinBase = false;
    if (vhAnterior !== null && vhActual !== null) {
      const bruto = vhActual - vhAnterior;
      mod = Math.abs(bruto) > TOL_MOD ? 'S' : 'N';
      // Dentro de tolerancia la variación ES cero: mostrar 0,004 como variación
      // contradice el MOD = N de la misma fila.
      dif = mod === 'S' ? bruto : 0;
      if (vhAnterior !== 0)   pct = (dif / vhAnterior) * 100;
      else if (dif === 0)     pct = 0;
      else                    pctSinBase = true;  // sin base no hay porcentaje: no es 100%
    }

    return {
      legajo,
      legajoNum: Number(legajo) || 0,
      nombre:    (b?.nombre || a?.nombre) || null,
      vhAnterior,
      vhActual,
      mod,
      dif,
      pct,
      pctSinBase,
      pctLabel:  pctSinBase ? 's/base' : (pct === null ? SIN_DATO : `${fmtNum(pct)}%`),
      modCbu:    flagCbu(a, b),
      alta:      flagAlta(ficha, rango),
      baja:      flagBaja(ficha, rango),
      // El neto que se informa es el de la quincena ACTUAL, y no se compara
      // contra nada: es el dato que HR necesita al lado de la variación.
      neto:      b ? b.neto : null,
      soloEn:    (a && b) ? null : (b ? 'actual' : 'anterior'),
      liquidaciones: (b?.liquidaciones ?? 0) + (a?.liquidaciones ?? 0),
    };
  }).sort((x, y) => x.legajoNum - y.legajoNum || x.legajo.localeCompare(y.legajo));

  const control = variacRows.length ? controlarContraAxton(rows, variacRows, keyFn) : null;

  return {
    conceptCode: code,
    periodos: { anterior: etiquetaPeriodo(A), actual: etiquetaPeriodo(B) },
    // Para el sufijo del nombre de archivo: el período de la quincena actual.
    period: B.periodoKey ? `${B.periodoKey.anio}-${String(B.periodoKey.mes).padStart(2, '0')}` : (mapping.period || ''),
    quincenaActual: B.periodoKey?.q ?? null,
    rows,
    checks: coherencia(A, B, code),
    // Dos cosas distintas, y por eso van separadas: `observaciones` es una por
    // LEGAJO (la pantalla las agrupa por texto y las lista al abrir), y `notas`
    // son del reporte entero. Mezclarlas hacía que un aviso general se mostrara
    // como "1 legajo", que es falso.
    observaciones: observacionesPorLegajo(rows, A, B),
    notas:         notasDelReporte(rows, rango, code),
    control,
    summary: {
      total:         rows.length,
      conVariacion:  rows.filter(r => r.mod === 'S').length,
      sinVariacion:  rows.filter(r => r.mod === 'N').length,
      sinValorHora:  rows.filter(r => r.vhAnterior === null || r.vhActual === null).length,
      soloAnterior:  rows.filter(r => r.soloEn === 'anterior').length,
      soloActual:    rows.filter(r => r.soloEn === 'actual').length,
      altas:         rows.filter(r => r.alta === 'S').length,
      bajas:         rows.filter(r => r.baja === 'S').length,
      cambiosCbu:    rows.filter(r => r.modCbu === 'S').length,
      comparados:    control?.comparados ?? null,
      conDifAxton:   control?.difs.length ?? null,
    },
  };
}

/**
 * Un Tabulado de Axton, consolidado por legajo.
 *
 * **Consolida los dos lados del cruce** (D-042): el Tabulado trae una fila por
 * LIQUIDACIÓN, no por empleado, así que un legajo con dos pagas en la misma
 * quincena aparece dos veces. La cantidad de horas, el importe y el neto se
 * SUMAN entre sus liquidaciones; la ficha (nombre, CBU, fechas) sale de la
 * última. Si se pisara en vez de sumar, el valor hora de todo empleado con doble
 * paga saldría calculado sobre una sola de ellas.
 */
function indexQuincena(rows, { keyFn, keyCant, keyImp }) {
  const emps = new Map();
  const repetidos = [];

  for (const [legajo, group] of groupRowsByLegajo(rows, 'legajo', { keyFn })) {
    const ficha = lastRow(group);
    if (group.length > 1) repetidos.push(legajo);
    emps.set(legajo, {
      legajo,
      nombre: ficha.apellido_nombre || null,
      // `tieneX` distingue "la columna no está en el archivo" (no se puede
      // afirmar nada) de "la celda vino vacía" (hay dato y dice que no hay).
      // El parser omite la clave cuando la columna no existe.
      cbu:         ficha.cbu || null,      tieneCbu:     'cbu'     in ficha,
      ingreso:     ficha.ingreso || null,  tieneIngreso: 'ingreso' in ficha,
      egreso:      ficha.egreso  || null,  tieneEgreso:  'egreso'  in ficha,
      liquidaciones: group.length,
      cant: sumColumn(group, keyCant),
      imp:  sumColumn(group, keyImp),
      // El Neto viene en un par Cant/Imp como cualquier concepto, y el importe
      // es el de `Imp`: verificado contra los archivos reales (cierra como
      // Bruto − Retenciones + Exento en los 202 legajos y coincide con el Neto
      // del reporte de Axton). El `Cant` del par es Axton sumando la columna de
      // cantidades, que para el Neto no significa nada.
      neto: sumColumn(group, 'neto_imp'),
    });
  }

  const totalRow = rows.find(r => r.esTotalGeneral) || null;
  const empleados = [...emps.values()];
  const periodo = rows.find(r => !r.esTotalGeneral && r.liquidacion)?.liquidacion || null;

  return {
    emps,
    repetidos,
    periodo,
    periodoKey: leerQuincena(periodo),
    // Suma calculada vs. la que informa el archivo — para el chequeo de coherencia.
    sumaCant:  empleados.reduce((s, e) => s + (e.cant ?? 0), 0),
    sumaImp:   empleados.reduce((s, e) => s + (e.imp  ?? 0), 0),
    totalCant: totalRow ? totalRow[keyCant] ?? null : null,
    totalImp:  totalRow ? totalRow[keyImp]  ?? null : null,
    tieneTotalGeneral: !!totalRow,
  };
}

/** `Imp ÷ Cant` del concepto de horas, o `null` si no hay con qué dividir. */
function valorHora(e) {
  if (!e) return null;
  if (e.cant === null || e.imp === null) return null;  // no liquidó el concepto
  if (e.cant === 0) return null;                       // sin horas no hay valor hora
  return e.imp / e.cant;
}

/** CBU de la quincena anterior contra el de la actual. */
function flagCbu(a, b) {
  if (!a || !b) return SIN_DATO;                       // no hay dos CBU que comparar
  if (!a.tieneCbu || !b.tieneCbu) return SIN_DATO;     // el archivo no trae la columna
  if (!a.cbu || !b.cbu) return SIN_DATO;               // falta el CBU de un lado
  return a.cbu === b.cbu ? 'N' : 'S';
}

/**
 * Alta = la fecha de ingreso cae dentro de la quincena actual.
 *
 * La celda vacía sale `'—'` y no `'N'`: todo empleado tiene fecha de ingreso, así
 * que una vacía es un dato que falta, no un "no ingresó".
 */
function flagAlta(ficha, rango) {
  if (!rango || !ficha || !ficha.tieneIngreso || !ficha.ingreso) return SIN_DATO;
  return enRango(ficha.ingreso, rango) ? 'S' : 'N';
}

/**
 * Baja = la fecha de egreso cae dentro de la quincena actual.
 *
 * Acá la celda vacía SÍ decide: en el Tabulado de Axton un empleado activo no
 * tiene fecha de egreso, así que vacío es "no se fue" → `'N'`. Lo que no decide
 * nada es que la columna no esté en el archivo → `'—'` y sale como aviso.
 */
function flagBaja(ficha, rango) {
  if (!rango || !ficha || !ficha.tieneEgreso) return SIN_DATO;
  if (!ficha.egreso) return 'N';
  return enRango(ficha.egreso, rango) ? 'S' : 'N';
}

const enRango = (iso, { desde, hasta }) => iso >= desde && iso <= hasta;

/**
 * La quincena como rango de fechas: la 1ª va del 1 al 15, la 2ª del 16 al último
 * día del mes. Devuelve `null` si no se pudo leer el período del archivo — sin
 * rango, Alta y Baja salen en `'—'` en vez de calcularse contra un mes inventado.
 */
function quincenaRango(periodoKey) {
  if (!periodoKey) return null;
  const { q, mes, anio } = periodoKey;
  const mm = String(mes).padStart(2, '0');
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return q === 1
    ? { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-15` }
    : { desde: `${anio}-${mm}-16`, hasta: `${anio}-${mm}-${String(ultimoDia).padStart(2, '0')}` };
}

/**
 * La quincena y el período, del texto de la columna `liquidacion` del propio
 * archivo — nunca del selector de período de la app, que es del mes y no sabe de
 * quincenas. Ej.: `"2da Quincena c/ sobregiro Julio 2026 (2da Quincena 07-2026) - (v)"`.
 */
function leerQuincena(texto) {
  if (!texto) return null;
  const m = String(texto).match(/\((\d)\s*(?:era|er|ra|da|do|ª)?\s*Quincena\s+(\d{1,2})-(\d{4})\)/i);
  if (!m) return null;
  return { q: Number(m[1]), mes: Number(m[2]), anio: Number(m[3]) };
}

function etiquetaPeriodo(lado) {
  const k = lado.periodoKey;
  return {
    texto: lado.periodo,
    corta: k ? `${k.q}ª quinc. ${String(k.mes).padStart(2, '0')}/${k.anio}` : null,
  };
}

const tieneConcepto = (rows, key) => rows.length > 0 && Object.prototype.hasOwnProperty.call(rows[0], key);

// ── Chequeos de coherencia y avisos ───────────────────────────────────────────

/** Lo que se verifica siempre: que las sumas cierren y que los períodos tengan sentido. */
function coherencia(A, B, code) {
  const items = [];
  for (const [nombre, lado] of [['anterior', A], ['actual', B]]) {
    if (!lado.tieneTotalGeneral) {
      items.push({ label: `TOTAL GENERAL (${nombre})`, ok: false,
        detail: 'no está en el archivo: no se pueden validar las sumas' });
      continue;
    }
    const okImp  = lado.totalImp  === null || Math.abs(lado.sumaImp  - lado.totalImp)  <= TOL_TOTAL;
    const okCant = lado.totalCant === null || Math.abs(lado.sumaCant - lado.totalCant) <= TOL_TOTAL;
    items.push({
      label: `Concepto ${code} cierra contra el archivo (${nombre})`,
      ok: okImp && okCant,
      detail: okImp && okCant
        ? `${fmtNum(lado.sumaCant)} hs · ${fmtNum(lado.sumaImp)}`
        : `calculado ${fmtNum(lado.sumaCant)} hs / ${fmtNum(lado.sumaImp)} vs archivo `
          + `${fmtNum(lado.totalCant)} hs / ${fmtNum(lado.totalImp)}`,
    });
  }

  const ka = A.periodoKey, kb = B.periodoKey;
  if (!ka || !kb) {
    items.push({ label: 'Períodos leídos del archivo', ok: false,
      detail: 'no pude leer la quincena de ' + (!ka && !kb ? 'ninguno de los dos Tabulados' : (!ka ? 'la quincena anterior' : 'la quincena actual')) });
  } else {
    const na = ka.anio * 100 + ka.mes, nb = kb.anio * 100 + kb.mes;
    const invertido = na > nb || (na === nb && ka.q > kb.q);
    const misma     = na === nb && ka.q === kb.q;
    items.push({
      label: 'Orden de los dos Tabulados',
      ok: !invertido && !misma,
      detail: misma ? 'los dos archivos son de la misma quincena'
        : invertido ? 'el archivo de "anterior" es posterior al de "actual"'
        : `${ka.q}ª ${String(ka.mes).padStart(2, '0')}/${ka.anio} → ${kb.q}ª ${String(kb.mes).padStart(2, '0')}/${kb.anio}`,
    });
  }
  return items;
}

/**
 * Las observaciones de calidad del dato, **una por legajo**: la pantalla las
 * agrupa por texto y muestra cuántos legajos y cuáles. Avisan, no traban (D-036).
 */
function observacionesPorLegajo(rows, A, B) {
  const items = [];
  const quien = r => ({ who: `Legajo ${r.legajo}`, sub: r.nombre || undefined });

  for (const r of rows) {
    if (r.vhAnterior === null || r.vhActual === null) {
      items.push({ ...quien(r),
        what: 'Sin valor hora derivable en alguna de las dos quincenas',
        why: 'no liquidó el concepto de horas o liquidó 0 horas (licencia, alta o baja a mitad de quincena). '
          + `Sale "${SIN_DATO}", nunca 0,00: Axton muestra ahí el valor hora de la ficha del empleado, que el Tabulado no trae` });
    }
    if (r.soloEn === 'anterior') {
      items.push({ ...quien(r), what: 'Liquidó sólo en la quincena anterior',
        why: 'no se marca como baja — Alta y Baja salen de las fechas de ingreso y egreso, no de la presencia en un archivo' });
    }
    if (r.soloEn === 'actual') {
      items.push({ ...quien(r), what: 'Liquidó sólo en la quincena actual',
        why: 'no se marca como alta — Alta y Baja salen de las fechas de ingreso y egreso' });
    }
    if (r.modCbu === SIN_DATO && r.soloEn === null) {
      items.push({ ...quien(r), what: 'Sin CBU en alguna de las dos quincenas',
        why: `su MOD CBU sale "${SIN_DATO}" y no "N"` });
    }
    if (r.alta === SIN_DATO && r.soloEn === null) {
      items.push({ ...quien(r), what: 'Sin fecha de ingreso en el Tabulado',
        why: `su Alta sale "${SIN_DATO}"` });
    }
  }

  for (const [nombre, lado] of [['anterior', A], ['actual', B]]) {
    for (const legajo of lado.repetidos) {
      items.push({ who: `Legajo ${legajo}`,
        what: `Más de una liquidación en la quincena ${nombre}`,
        why: 'las horas, el importe y el neto se suman entre sus liquidaciones; la ficha sale de la última' });
    }
  }
  return items;
}

/** Lo que vale para el reporte entero, no para un legajo. Texto plano. */
function notasDelReporte(rows, rango, code) {
  const notas = [];
  if (!rango) {
    notas.push(`Alta y Baja salen en "${SIN_DATO}": no se pudo leer la quincena del Tabulado actual, así que no hay rango de fechas contra el cual evaluarlas.`);
  }
  if (rows.some(r => r.baja === SIN_DATO)) {
    notas.push(`El Tabulado no trae la columna de Egreso: la Baja sale en "${SIN_DATO}" en vez de "N", porque sin esa columna no se puede afirmar que nadie se fue.`);
  }
  notas.push(`El valor hora se deriva del concepto ${code} (importe ÷ cantidad de horas), y el reporte cubre sólo al personal que lo liquida: los mensualizados no entran.`);
  notas.push('Puesto y MOD Puesto no se generan ni se controlan: el código de puesto no viene en ninguna columna del Tabulado, sale de otro módulo de Axton.');
  return notas;
}

// ── El control contra el reporte de variaciones de Axton ──────────────────────

/**
 * Campo a campo, sólo para los legajos que están en los dos lados. Puesto y MOD
 * Puesto quedan afuera: no se generan, así que no hay contra qué compararlos.
 */
function controlarContraAxton(rows, variacRows, keyFn) {
  const gen = new Map(rows.map(r => [r.legajo, r]));
  const ax  = new Map();
  for (const r of variacRows) {
    const k = keyFn(r.legajo);
    if (k) ax.set(k, r);
  }

  const difs = [];
  let comparados = 0;
  for (const [legajo, axRow] of ax) {
    const g = gen.get(legajo);
    if (!g) continue;
    comparados++;
    const campos = [];
    cmpNum(campos,  'VH anterior', axRow.vh_anterior, g.vhAnterior, TOL_CTRL_VH);
    cmpNum(campos,  'VH actual',   axRow.vh_actual,   g.vhActual,   TOL_CTRL_VH);
    cmpFlag(campos, 'MOD',         axRow.mod,         g.mod);
    cmpFlag(campos, 'MOD CBU',     axRow.mod_cbu,     g.modCbu);
    cmpFlag(campos, 'Alta',        axRow.alta,        g.alta);
    cmpFlag(campos, 'Baja',        axRow.baja,        g.baja);
    cmpNum(campos,  'Neto',        axRow.neto,        g.neto,       TOL_CTRL_NETO);
    if (campos.length) difs.push({ legajo, nombre: g.nombre, campos });
  }

  const numerico = (a, b) => (Number(a) || 0) - (Number(b) || 0);
  return {
    comparados,
    coinciden:   comparados - difs.length,
    difs,
    soloAxton:   [...ax.keys()].filter(k => !gen.has(k)).sort(numerico),
    soloGenerado: [...gen.keys()].filter(k => !ax.has(k)).sort(numerico),
  };
}

/**
 * Compara dos importes con tolerancia. Que uno tenga dato y el otro no ES una
 * diferencia y se informa como tal ("0,00 vs —"): Axton completa con cero donde
 * el Tabulado no trae valor, y taparlo es exactamente el default silencioso que
 * el proyecto no admite.
 */
function cmpNum(out, campo, axVal, genVal, tol) {
  const axNulo = axVal === null || axVal === undefined;
  const gNulo  = genVal === null || genVal === undefined;
  if (axNulo && gNulo) return;
  if (axNulo !== gNulo || Math.abs(axVal - genVal) > tol) {
    out.push({ campo, axton: axNulo ? SIN_DATO : fmtNum(axVal), generado: gNulo ? SIN_DATO : fmtNum(genVal) });
  }
}

/** Los S/N. El `-` de Axton llega como `null` del parser y se lee como `'—'`. */
function cmpFlag(out, campo, axVal, genVal) {
  const ax = axVal === null || axVal === undefined ? SIN_DATO : String(axVal);
  if (ax !== String(genVal)) out.push({ campo, axton: ax, generado: String(genVal) });
}

// ── Resumen para la tarjeta colapsada ─────────────────────────────────────────

export function summarizePopVariaciones(results) {
  if (results?.error) {
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null, diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const s = results.summary;
  const periodos = `${results.periodos.anterior.corta || 'quincena anterior'} → ${results.periodos.actual.corta || 'quincena actual'}`;

  // Sin el reporte de Axton no se comparó nada: el control generó un archivo, y
  // eso es `'info'` con la unidad en `null` — el semáforo no tiene qué contar
  // (mismo criterio que las variantes "Generar Reporte", ver `summarizeNrReporte`).
  if (!results.control) {
    return {
      status: 'info',
      headline: `${s.total} legajos · ${s.conVariacion} con variación de valor hora · ${periodos}`,
      insights: [
        { type: 'info', label: 'legajos con variación de valor hora', value: s.conVariacion },
      ],
      unit: null, unitsTotal: null, unitsWithDiff: null, diffTotalAmount: null, worstCase: null,
      contextNote: 'reporte generado — subí el reporte de Axton para controlarlo',
    };
  }

  const c = results.control;
  const sueltos = c.soloAxton.length + c.soloGenerado.length;
  return {
    status: (c.difs.length > 0 || sueltos > 0) ? 'warning' : 'success',
    headline: `${c.comparados} legajos comparados contra el reporte de Axton · ${c.coinciden} coinciden · ${periodos}`,
    insights: [
      { type: c.difs.length > 0 ? 'warning' : 'success',
        label: 'legajos con alguna diferencia contra el reporte de Axton',
        value: c.difs.length },
    ],
    unit: 'legajo',
    unitsTotal:    c.comparados,
    unitsWithDiff: c.difs.length,
    // No hay una diferencia en pesos que sumar: lo que difiere son valores hora,
    // netos y marcas S/N, que no se totalizan entre sí.
    diffTotalAmount: null,
    worstCase: null,
    contextNote: sueltos > 0
      ? `${sueltos} legajo(s) en un solo archivo`
      : `concepto ${results.conceptCode} · Puesto no se controla`,
  };
}

// ── Pantalla de resultados ────────────────────────────────────────────────────

export function renderPopVariacionesResults(results, container) {
  if (results?.error) {
    container.innerHTML = `<div class="alert alert--danger" style="margin:0;">❌ ${esc(results.error)}</div>`;
    return;
  }
  if (results.rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  container.innerHTML = '';
  renderResumenDetalle(container, {
    controlId: 'pop_variaciones',
    resumen(panel) { renderResumen(panel, results); },
    detalle(panel) { renderDetalle(panel, results); },
  });
}

function renderResumen(panel, results) {
  const s = results.summary;
  const c = results.control;
  const periodos = `${esc(results.periodos.anterior.corta || 'quincena anterior')} → ${esc(results.periodos.actual.corta || 'quincena actual')}`;

  if (!c) {
    renderVerdict(panel, {
      tone: 'info',
      title: `Reporte de variaciones generado — ${s.total} legajos.`,
      body: `Comparando <strong>${periodos}</strong>. ${s.conVariacion} legajo${s.conVariacion === 1 ? '' : 's'} `
        + `con variación de valor hora. Para controlarlo, cargá el reporte de variaciones que exporta Axton `
        + `en el Paso 2 y volvé a ejecutar.`,
    });
  } else {
    const tone = c.difs.length === 0 ? 'ok' : 'warn';
    renderVerdict(panel, {
      tone,
      title: c.difs.length === 0
        ? `Los ${c.comparados} legajos del reporte de Axton coinciden con lo generado.`
        : `${c.difs.length} de ${c.comparados} legajos difieren contra el reporte de Axton.`,
      body: `Comparando <strong>${periodos}</strong>. Se controlan valor hora de las dos quincenas, MOD, MOD CBU, `
        + `Alta, Baja y Neto. <strong>Puesto y MOD Puesto no se controlan</strong>: no vienen en el Tabulado.`,
    });
  }

  renderTiles(panel, [
    { label: 'Legajos en el reporte', value: s.total,
      sub: s.soloAnterior + s.soloActual > 0 ? `${s.soloAnterior + s.soloActual} en una sola quincena` : 'en las dos quincenas' },
    { label: 'Con variación de valor hora', value: s.conVariacion, tone: s.conVariacion > 0 ? 'warn' : 'ok' },
    { label: 'Sin variación', value: s.sinVariacion, tone: 'ok' },
    { label: 'Sin valor hora', value: s.sinValorHora, tone: s.sinValorHora > 0 ? 'warn' : 'ok',
      sub: 'sale «—», no 0,00' },
    { label: 'Altas / Bajas', value: `${s.altas} / ${s.bajas}`, sub: 'por fecha de ingreso y egreso' },
    { label: 'Cambios de CBU', value: s.cambiosCbu, tone: s.cambiosCbu > 0 ? 'warn' : 'ok' },
  ]);

  renderChecks(panel, { heading: 'Chequeos de coherencia', items: results.checks });

  if (c && c.difs.length > 0) {
    const top = c.difs.slice(0, 12);
    renderIssues(panel, {
      heading: `Diferencias contra el reporte de Axton · ${top.length} de ${c.difs.length}`,
      items: top.flatMap(d => d.campos.map(campo => ({
        sev: d.campos.length > 1 ? 'hi' : 'lo',
        who: `Legajo ${d.legajo}`,
        sub: d.nombre || undefined,
        what: `${campo.campo}: Axton ${campo.axton} · generado ${campo.generado}`,
        why: 'Axton − generado.',
      }))),
    });
  }

  // UNA sola llamada: cada `renderMinorObservations` pinta su propio título, y
  // dos seguidas mostraban "Observaciones menores" dos veces.
  renderMinorObservations(panel, [
    ...results.observaciones,
    ...(c?.soloAxton || []).map(l => ({ who: `Legajo ${l}`,
      what: 'Está en el reporte de Axton y no en los Tabulados',
      why: 'no se pudo comparar' })),
    ...(c?.soloGenerado || []).map(l => ({ who: `Legajo ${l}`,
      what: 'Está en los Tabulados y no en el reporte de Axton',
      why: 'si es una exclusión intencional de Axton, confirmá el criterio con el analista' })),
  ]);

  // Las notas del reporte entero no son observaciones "de N legajos": van como
  // pie de la pantalla, no como una lista que se pueda abrir por legajo.
  const notas = document.createElement('ul');
  notas.className = 'text-muted';
  notas.style.cssText = 'font-size:var(--text-sm);margin:var(--sp-3) 0 0;padding-left:var(--sp-4);display:grid;gap:var(--sp-1);';
  notas.innerHTML = results.notas.map(n => `<li>${esc(n)}</li>`).join('');
  panel.appendChild(notas);
}

const COLS_DETALLE = [
  { key: 'legajo',     label: 'Legajo',            tipo: 'txt' },
  { key: 'nombre',     label: 'Apellido y Nombre', tipo: 'txt' },
  { key: 'vhAnterior', label: 'VH anterior',       tipo: 'num' },
  { key: 'vhActual',   label: 'VH actual',         tipo: 'num' },
  { key: 'mod',        label: 'MOD',               tipo: 'flag' },
  { key: 'dif',        label: 'Variación $',       tipo: 'signo' },
  { key: 'pctLabel',   label: 'Variación %',       tipo: 'pct' },
  { key: 'modCbu',     label: 'MOD CBU',           tipo: 'flag' },
  { key: 'alta',       label: 'Alta',              tipo: 'flag' },
  { key: 'baja',       label: 'Baja',              tipo: 'flag' },
  { key: 'neto',       label: 'Neto',              tipo: 'num' },
];

function renderDetalle(container, results) {
  const { rows, control } = results;

  const filtro = document.createElement('select');
  filtro.className = 'form-select form-select--sm';
  filtro.dataset.popVarFilter = '';
  const conDifAxton = new Set((control?.difs || []).map(d => d.legajo));
  filtro.innerHTML = `
    <option value="todos">Todos (${rows.length})</option>
    <option value="var">Sólo con variación (${rows.filter(r => r.mod === 'S').length})</option>
    <option value="movs">Altas, bajas y cambios de CBU (${rows.filter(r => esMovimiento(r)).length})</option>
    <option value="sindato">Sin valor hora (${rows.filter(r => r.vhAnterior === null || r.vhActual === null).length})</option>
    ${control ? `<option value="difaxton">Con diferencia vs Axton (${conDifAxton.size})</option>` : ''}
  `;

  const filterGroup = document.createElement('div');
  filterGroup.className = 'form-group';
  filterGroup.style.cssText = 'margin-bottom:0;min-width:220px;';
  filterGroup.innerHTML = `<label class="form-label" style="font-size:var(--text-sm);">Qué se muestra</label>`;
  filterGroup.appendChild(filtro);

  const { searchEl, exportEl } = createResultsToolbar(container, { left: filterGroup });

  // Las tres salidas llevan SIEMPRE el reporte completo, sin importar el filtro
  // de pantalla: es el entregable que recibe HR del cliente.
  const csvHeaders = COLS_DETALLE.map(c => c.label);
  const csvRows = () => rows.map(r => COLS_DETALLE.map(c => (
    c.tipo === 'num' || c.tipo === 'signo' ? fmtNum(r[c.key]) : (r[c.key] ?? SIN_DATO)
  )));
  renderExportMenu(exportEl, {
    onExcel: () => exportPopVariacionesToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `${nombreArchivo(results)}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });

  const tableHost = document.createElement('div');
  container.appendChild(tableHost);

  // La columna "vs Axton" lleva CUÁNTOS campos difieren, no la lista: los
  // nombres de los campos ensanchan la planilla y quedan cortados. Cuáles son
  // está en el bloque de diferencias del Resumen, y el filtro de arriba aísla
  // estos legajos.
  const difsPorLegajo = new Map((control?.difs || []).map(d => [d.legajo, d.campos.length]));

  function renderTable(modo) {
    const shown = rows.filter(r => (
      modo === 'var'       ? r.mod === 'S'
      : modo === 'movs'    ? esMovimiento(r)
      : modo === 'sindato' ? (r.vhAnterior === null || r.vhActual === null)
      : modo === 'difaxton' ? conDifAxton.has(r.legajo)
      : true
    ));
    tableHost.innerHTML = `
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            ${COLS_DETALLE.map(c => `<th${c.tipo === 'num' || c.tipo === 'signo' || c.tipo === 'pct' ? ' style="text-align:right;"' : ''}>${esc(
              c.key === 'vhAnterior' ? `VH ${results.periodos.anterior.corta || 'anterior'}`
              : c.key === 'vhActual' ? `VH ${results.periodos.actual.corta || 'actual'}`
              : c.label
            )}</th>`).join('')}
            ${control ? '<th>Axton</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${shown.map(r => `
            <tr>
              <td>${esc(r.legajo)}</td>
              <td>${esc(r.nombre || SIN_DATO)}</td>
              <td style="text-align:right;">${fmtNum(r.vhAnterior)}</td>
              <td style="text-align:right;">${fmtNum(r.vhActual)}</td>
              <td>${flagHtml(r.mod)}</td>
              <td style="text-align:right;" class="${mvClass(r.dif)}">${r.dif === null ? SIN_DATO : `${mvArrow(r.dif)} ${fmtSigned(r.dif)}`}</td>
              <td style="text-align:right;" class="${r.pctSinBase ? '' : mvClass(r.pct)}">${esc(r.pctLabel)}</td>
              <td>${flagHtml(r.modCbu)}</td>
              <td>${flagHtml(r.alta)}</td>
              <td>${flagHtml(r.baja)}</td>
              <td style="text-align:right;">${fmtNum(r.neto)}</td>
              ${control ? `<td>${celdaVsAxton(r, difsPorLegajo, control)}</td>` : ''}
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2"><strong>TOTAL — ${shown.length} legajos</strong></td>
            <td></td><td></td><td></td>
            <td style="text-align:right;">${fmtNum(shown.reduce((t, r) => t + (r.dif ?? 0), 0))}</td>
            <td></td><td></td><td></td><td></td>
            <td style="text-align:right;">${fmtNum(shown.reduce((t, r) => t + (r.neto ?? 0), 0))}</td>
            ${control ? '<td></td>' : ''}
          </tr>
        </tfoot>
      </table>
      <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
        Mostrando ${shown.length} de ${rows.length} legajos. «${SIN_DATO}» es sin dato, no cero.
        El valor hora sale del concepto ${esc(results.conceptCode)} (importe ÷ cantidad de horas).
      </p>
    `;

    wireTableTools(tableHost.querySelector('table'), {
      rows: shown,
      getLabel: r => (r.nombre ? `${r.legajo} — ${r.nombre}` : `${r.legajo}`),
      searchEl,
      label: 'Buscar legajo o nombre',
      stickyCols: 2,
    });
  }

  filtro.addEventListener('change', e => renderTable(e.target.value));
  renderTable('todos');
}

const esMovimiento = r => r.alta === 'S' || r.baja === 'S' || r.modCbu === 'S';

/**
 * La celda "vs Axton": cuántos campos difieren, `ok` si coincide, y `—` si ese
 * legajo no está en el reporte de Axton — no se comparó, que no es lo mismo que
 * coincidir.
 */
function celdaVsAxton(r, difsPorLegajo, control) {
  const n = difsPorLegajo.get(r.legajo);
  if (n) return `<span class="badge badge--warning">${n} dif${n === 1 ? '' : 's'}</span>`;
  if (control.soloGenerado.includes(r.legajo)) return `<span class="text-muted">${SIN_DATO}</span>`;
  return '<span class="text-muted">ok</span>';
}

function flagHtml(v) {
  const clase = v === 'S' ? 'badge badge--warning' : v === 'N' ? 'badge' : 'text-muted';
  return `<span class="${clase}">${esc(v)}</span>`;
}

// ── Export a Excel — el entregable que recibe HR del cliente ──────────────────

/** `POP_Variaciones_2Q_072026` — la quincena en el nombre, no sólo el mes. */
function nombreArchivo(results) {
  const q = results.quincenaActual ? `${results.quincenaActual}Q_` : '';
  return `POP_Variaciones_${q}${periodSuffix(results.period)}`;
}

/**
 * El .xlsx del reporte. Lo recibe **HR** del cliente, no Finanzas: por eso lleva
 * altas, bajas y variaciones además del neto (D-020 aplica al revés — lo que no
 * puede llevar información de HR es un entregable de Finanzas).
 *
 * Las columnas salen del contrato (`EXPORT_CONTRACTS.pop_variaciones`), que es
 * la misma fuente que declara qué se le pide al analista: no hay una segunda
 * lista de columnas acá.
 */
export async function exportPopVariacionesToXlsx(results) {
  await loadExcelJS();
  const [{ EXPORT_CONTRACTS }, { writeContractSheet }] = await Promise.all([
    import('../exports/contracts.js'),
    import('../exports/contractSheet.js'),
  ]);
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();
  // Los encabezados son los del contrato, tal cual ("VH anterior" / "VH
  // actual"). La quincena de cada uno va en el nombre del archivo y en la
  // pantalla, no en el rótulo de la columna: el layout del entregable es fijo.
  writeContractSheet(wb, EXPORT_CONTRACTS.pop_variaciones, results.rows);
  await downloadWorkbook(wb, `${nombreArchivo(results)}.xlsx`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
