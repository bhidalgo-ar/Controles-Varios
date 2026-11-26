// gtnGsma.js — GTN GSMA desde Tabulado Axton (specs/gtn-gsma-axton.md).
//
// Un GENERADOR, sólo para GSMA: arma el Excel "Gross to Net" que GSMA recibe
// todos los meses —el que armaba Meta4 hasta octubre 2026— a partir del Tabulado
// de Axton, con el mismo layout y las mismas fórmulas (js/exports/gtnGsmaLayout.js).
// Como control, verifica por empleado que Net Pay (Gross − deducciones) cierre
// contra ER Net Paid (concepto 605203 de Axton).
//
// Tres entradas: el Tabulado de Axton del mes (lector tolerante, D-072), el GTN
// del mes anterior (de ahí salen Employee Number, Cost Centre, Location Code y el
// sueldo anual en USD, que Axton no tiene) y el tipo de cambio que tipea el
// analista. Las asignaciones código → columna del GTN son config de GSMA
// (js/controls/gtnGsmaConfig.js).
//
// Reglas del repo que se aplican acá y por qué:
//   · **Consolidar por legajo** (`consolidate.js` + `makeLegajoKey`): el Tabulado
//     trae una fila por liquidación. Un empleado con la mensual y otra paga en el
//     mes aparece dos veces, y en el GTN va UNA fila con los importes sumados.
//   · **`null` no es `0`**: un concepto que ningún recibo trajo es `null` en todo
//     el cálculo. El 0 de las columnas que Meta4 completa con 0 es SÓLO de
//     escritura y lo pone el layout. ER Net Paid que no vino no se compara con 0:
//     sale como aviso y su celda va vacía y en amarillo.
//   · **Nada en silencio**: el cruce con el GTN anterior es por nombre (no hay
//     legajo de Axton ni CUIL en el GTN), y todo lo que no cruza exacto —ningún
//     candidato, varios, homónimos, una palabra de más— se lista; nunca se
//     resuelve por orden de aparición.
//   · **El monto de diferencia es estructural** (`GTN_NET_TOLERANCE`): los dos
//     lados —el neto armado y el ER Net Paid— salen del mismo archivo, así que
//     cierran al centavo. No mide con el monto del cliente (D-069).

import { groupRowsByLegajo, sumColumn, lastRow } from './consolidate.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { toNum, formatAmount } from '../utils/currency.js';
import { isDiff } from './tolerance.js';
import { resumenStats } from './resumenStats.js';
import {
  GTN_ASSIGNABLE, USD_DIVISOR, EXCHANGE_RATE_CELL,
  buildGtnGsmaWorkbook, gtnFileName,
} from '../exports/gtnGsmaLayout.js';
import {
  FUERA_DEL_GTN, resolverConceptos, pendientesGtnGsma, tipoCambioValido, nombreColumna, columnasNoConceptoGtn,
} from './gtnGsmaConfig.js';
import {
  renderResumenDetalle, renderVerdict, renderTiles, renderIssues, renderChecks, diffCellHtml,
} from '../ui/resultBlocks.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { renderPlanillaPanel } from '../ui/planillaPanel.js';
import { renderFichasPanel } from '../ui/fichaList.js';
import { estadoDeDiferencia } from '../ui/tableTools.js';
import { renderAsignacionesTable } from '../ui/gtnGsmaAsignaciones.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';

/**
 * El monto de diferencia del neto: estructural, no del analista. Net Pay y ER
 * Net Paid salen del mismo Tabulado, así que cierran al centavo; subirlo
 * taparía un concepto mal asignado. Lo declara el registry con `ownTolerance`.
 */
export const GTN_NET_TOLERANCE = 0.01;

/** Validar la suma de un concepto contra el TOTAL GENERAL del Tabulado: los floats de Excel. */
const TOL_TOTAL_GENERAL = 0.01;

const periodoAR = (p) => {
  const [y, m] = String(p || '').split('-');
  return y && m ? `${m}/${y}` : '—';
};

function mesAnterior(p) {
  const [y, m] = String(p || '').split('-').map(Number);
  if (!y || !m) return null;
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

const fmt = (v) => formatAmount(v);

/** Redondeo al centavo, sin el "-0" de punto flotante. */
const centavos = (v) => Math.round(v * 100) / 100 + 0;

/** Suma que respeta `null`: `null` si ningún sumando trae dato. */
function sumaNullable(valores) {
  let total = null;
  for (const v of valores) if (v !== null && v !== undefined) total = (total ?? 0) + v;
  return total;
}

// ── Cruce por nombre ─────────────────────────────────────────────────────────

/** Las palabras de un nombre: sin tildes, sin mayúsculas, sin signos. */
export function palabrasDeNombre(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

const contieneTodas = (grande, chica) => chica.length > 0 && chica.every(w => grande.has(w));

/**
 * Cruza los empleados del GTN anterior con los del Tabulado, por nombre
 * (spec §5). Un empleado del GTN cruza con uno del Tabulado si TODAS las
 * palabras del nombre del GTN están en el nombre de Axton (sin tildes, sin
 * mayúsculas, en cualquier orden), el candidato es ÚNICO y ningún otro empleado
 * del GTN lo pide. Todo lo demás se lista, nada se elige por orden:
 *   · ninguno → 'no_vino'. Si el nombre del GTN trae una palabra de más (un
 *     empleado de Axton sin cruzar tiene todas sus palabras dentro del nombre
 *     del GTN), NO se cruza: si el par es único en los dos sentidos se anota
 *     como `parecido` ("no cruzó — el GTN trae una palabra de más"); si el GTN
 *     contiene a más de un empleado de Axton, o dos filas del GTN se parecen al
 *     mismo empleado, la fila del GTN queda 'parecidoVarios' ("no cruzó, varios
 *     candidatos") y el empleado de Axton como nuevo (`parecidoAmbiguo`);
 *   · varios candidatos → 'varios', con los candidatos;
 *   · dos filas del GTN con el mismo nombre → 'homonimo', las dos;
 *   · dos filas del GTN que piden al mismo empleado de Axton → 'conflicto'.
 *
 * @param {{nombre: string}[]} gtnRows   empleados del GTN anterior
 * @param {{nombre: string}[]} axtonEmps empleados del Tabulado (ya consolidados)
 * @returns {{ match: Map<number, number>, prevEstado: object[], parecidos: Map<number, number>,
 *             parecidoAmbiguo: Map<number, number[]> }}
 *   `match`: índice de Axton → índice del GTN. `prevEstado[i]`: { tipo,
 *   candidatos: number[], parecidos: number[] } de cada fila del GTN.
 *   `parecidos`: índice de Axton → índice del GTN con el que se parece (par
 *   único). `parecidoAmbiguo`: índice de Axton → filas del GTN que se le parecen
 *   sin que el par sea único.
 */
export function cruzarPorNombre(gtnRows, axtonEmps) {
  const axSets = axtonEmps.map(e => new Set(palabrasDeNombre(e.nombre)));
  const axPal = axtonEmps.map(e => palabrasDeNombre(e.nombre));
  const prevPal = gtnRows.map(p => palabrasDeNombre(p.nombre));
  const claveNombre = (pal) => [...pal].sort().join(' ');

  const porNombre = new Map();
  prevPal.forEach((pal, i) => {
    if (pal.length === 0) return;
    const k = claveNombre(pal);
    porNombre.set(k, [...(porNombre.get(k) || []), i]);
  });

  const prevEstado = gtnRows.map(() => ({ tipo: null, candidatos: [] }));
  prevPal.forEach((pal, i) => {
    prevEstado[i].candidatos = axSets.map((s, j) => (contieneTodas(s, pal) ? j : -1)).filter(j => j >= 0);
    if (pal.length > 0 && porNombre.get(claveNombre(pal)).length > 1) prevEstado[i].tipo = 'homonimo';
    else if (prevEstado[i].candidatos.length > 1) prevEstado[i].tipo = 'varios';
    else if (prevEstado[i].candidatos.length === 0) prevEstado[i].tipo = 'no_vino';
  });

  // Un empleado de Axton pedido por más de una fila del GTN no se le da a ninguna.
  const pedidos = new Map();
  prevEstado.forEach((e, i) => {
    if (e.tipo === null) pedidos.set(e.candidatos[0], [...(pedidos.get(e.candidatos[0]) || []), i]);
  });
  const match = new Map();
  for (const [j, filas] of pedidos) {
    if (filas.length === 1) { match.set(j, filas[0]); prevEstado[filas[0]].tipo = 'cruzo'; }
    else filas.forEach(i => { prevEstado[i].tipo = 'conflicto'; });
  }

  // "Una palabra de más": el GTN que no cruzó con nadie y que contiene todas las
  // palabras de algún empleado de Axton que tampoco cruzó. Se decide mirando
  // los dos sentidos a la vez, nunca por orden de aparición: el par es
  // `parecido` sólo si la fila del GTN contiene a UN empleado y ese empleado
  // está contenido en UNA fila del GTN.
  prevEstado.forEach((e, i) => {
    e.parecidos = [];
    if (e.tipo !== 'no_vino' || prevPal[i].length === 0) return;
    const set = new Set(prevPal[i]);
    e.parecidos = axPal.map((pal, j) => (!match.has(j) && contieneTodas(set, pal) ? j : -1)).filter(j => j >= 0);
  });
  const filasQueSeParecen = new Map(); // Axton → filas del GTN que lo contienen
  prevEstado.forEach((e, i) => e.parecidos.forEach(j => filasQueSeParecen.set(j, [...(filasQueSeParecen.get(j) || []), i])));
  const parecidos = new Map();
  const parecidoAmbiguo = new Map();
  prevEstado.forEach((e, i) => {
    if (e.parecidos.length === 0) return;
    if (e.parecidos.length === 1 && filasQueSeParecen.get(e.parecidos[0]).length === 1) {
      parecidos.set(e.parecidos[0], i);
      return;
    }
    e.tipo = 'parecidoVarios';
    e.parecidos.forEach(j => parecidoAmbiguo.set(j, [...(parecidoAmbiguo.get(j) || []), i]));
  });

  return { match, prevEstado, parecidos, parecidoAmbiguo };
}

// ── run() ────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} primaryRows — `parsedRows` del Tabulado de Axton (una fila por liquidación)
 * @param {object[]} _tabRows    — no usa el Tabulado del casillero estándar (es el de Meta4)
 * @param {object}   mapping     — `tabAxtonMeta`, `gtnPrevRows`, `gtnPrevMeta`,
 *                                 `gtnConfig`, `gtnTipoCambio`, `legajoKeyMode`, `period`
 */
export function runGtnGsma(primaryRows, _tabRows, mapping = {}) {
  const tabRows = primaryRows || [];
  const tabMeta = mapping.tabAxtonMeta || {};
  const config = mapping.gtnConfig || null;
  const prevRows = mapping.gtnPrevRows || [];
  const prevMeta = mapping.gtnPrevMeta || {};

  if (tabRows.length === 0) return { error: 'No llegó el Tabulado de Axton: cargalo en el Paso 2.' };
  if (!Array.isArray(tabMeta.conceptos) || tabMeta.conceptos.length === 0) {
    return { error: 'El Tabulado de Axton no trae conceptos leídos: volvé a cargarlo en el Paso 2.' };
  }
  if (prevRows.length === 0) return { error: 'No llegó el GTN del mes anterior: cargalo en el Paso 2.' };

  // La defensa del gate: un concepto sin asignar NUNCA se pierde sin aviso, ni
  // aunque la corrida llegue hasta acá por otro camino.
  const { sinAsignar, columnasSinFormato, faltaTipoCambio } =
    pendientesGtnGsma({ tabMeta, config, tipoCambio: mapping.gtnTipoCambio });
  if (columnasSinFormato.length > 0) {
    return {
      error: `${columnasSinFormato.map(c => c.motivo).join(' ')} Sin eso, su importe no entraría al GTN.`,
    };
  }
  if (sinAsignar.length > 0) {
    return {
      error: `${sinAsignar.length === 1 ? 'Hay un concepto' : `Hay ${sinAsignar.length} conceptos`} del Tabulado sin asignar `
        + `a una columna del GTN (${sinAsignar.map(c => `${c.codigo} - ${c.nombre}`).join('; ')}). `
        + 'Asignalos en el Paso 2, en «Asignación de conceptos: Axton → GTN»: sin eso el importe no entraría al GTN.',
    };
  }
  if (faltaTipoCambio) {
    return { error: 'Falta el tipo de cambio del mes (ARS por USD): cargalo en el Paso 2. Va a la celda Exchange Rate del GTN.' };
  }
  const tipoCambio = tipoCambioValido(mapping.gtnTipoCambio);

  const conceptos = resolverConceptos(tabMeta.conceptos, config, tabRows);
  const porColumna = new Map(); // columna → conceptos asignados
  for (const c of conceptos) {
    if (c.columna === FUERA_DEL_GTN) continue;
    porColumna.set(c.columna, [...(porColumna.get(c.columna) || []), c]);
  }

  // ── Control contra el TOTAL GENERAL, por código ────────────────────────────
  const tg = tabMeta.totalGeneral || null;
  const checks = {};
  for (const c of conceptos) {
    const tgValor = tg ? toNum(tg[c.keyImp]) : null;
    checks[c.codigo] = {
      sumado: c.total,
      tg: tgValor,
      cierra: tgValor === null ? null : Math.abs((c.total ?? 0) - tgValor) <= TOL_TOTAL_GENERAL,
    };
  }

  // ── Consolidar por legajo ──────────────────────────────────────────────────
  const keyFn = makeLegajoKey(mapping.legajoKeyMode);
  const empleadosAx = [];
  for (const [clave, group] of groupRowsByLegajo(tabRows, 'legajo', { keyFn })) {
    const ficha = lastRow(group);
    const porCodigo = {};
    for (const c of conceptos) porCodigo[c.codigo] = sumColumn(group, c.keyImp);
    const valores = {};
    for (const col of GTN_ASSIGNABLE) {
      const asignados = porColumna.get(col.key) || [];
      valores[col.key] = sumaNullable(asignados.map(c => porCodigo[c.codigo]));
    }
    empleadosAx.push({
      clave,
      legajo: String(ficha.legajo ?? '').trim(),
      nombre: String(ficha.apellido_nombre ?? '').trim(),
      liquidaciones: group.length,
      porCodigo,
      valores,
    });
  }

  // ── Cruce con el GTN anterior ──────────────────────────────────────────────
  const { match, prevEstado, parecidos, parecidoAmbiguo } = cruzarPorNombre(prevRows, empleadosAx);
  const prevDe = new Map([...match].map(([j, i]) => [j, prevRows[i]]));

  // Orden del GTN nuevo: los que siguen, en el orden del GTN anterior; después
  // los que no estaban, en el orden del Tabulado.
  const orden = [
    ...[...match].sort((a, b) => a[1] - b[1]).map(([j]) => j),
    ...empleadosAx.map((_, j) => j).filter(j => !match.has(j)),
  ];

  const avisos = [];
  const empleados = orden.map((j) => {
    const ax = empleadosAx[j];
    const prev = prevDe.get(j) || null;
    const v = ax.valores;
    const sumaBloque = (block) => sumaNullable(GTN_ASSIGNABLE.filter(c => c.block === block).map(c => v[c.key]));
    const grossPay = sumaBloque('gross');
    const totalDeductions = sumaBloque('deduction');
    const netPay = grossPay === null && totalDeductions === null ? null : (grossPay ?? 0) - (totalDeductions ?? 0);
    const erNetPaid = v.erNetPaid;
    // Al centavo: los dos lados son sumas de importes de 2 decimales, y el
    // ruido de punto flotante no puede pintar un "-0,00" en la planilla.
    const diferencia = netPay === null || erNetPaid === null ? null : centavos(netPay - erNetPaid);
    const employerTotal = sumaBloque('employer');

    const marcas = [];
    const tipos = [];
    const marcar = (col, nota) => marcas.push({ col, nota });

    if (!prev) {
      const parecidoIdx = parecidos.get(j);
      const parecido = parecidoIdx !== undefined ? prevRows[parecidoIdx] : null;
      const ambiguo = prevEstado.some(e => ['varios', 'homonimo', 'conflicto'].includes(e.tipo) && e.candidatos.includes(j));
      const parecidoA = (parecidoAmbiguo.get(j) || []).map(i => prevRows[i].nombre);
      const nota = parecidoA.length
        ? `REVISAR: no cruzó por nombre. En el GTN anterior se parece a ${parecidoA.join(' / ')}, pero no es un par único. Completar Employee Number, Cost Centre, Location Code y el sueldo en USD.`
        : parecido
        ? `REVISAR: no cruzó por nombre con el GTN anterior (allá figura como ${parecido.nombre}). Completar Employee Number, Cost Centre, Location Code y el sueldo en USD.`
        : ambiguo
          ? 'REVISAR: el nombre coincide con más de una fila del GTN anterior y no se cruzó. Completar Employee Number, Cost Centre, Location Code y el sueldo en USD.'
          : 'REVISAR: empleado nuevo en el Tabulado de Axton, no estaba en el GTN anterior. Completar Employee Number, Cost Centre, Location Code y el sueldo en USD (fórmula importe anual / 13,3).';
      ['employeeNumber', 'costCentre', 'locationCode', 'monthlySalaryUsd'].forEach(c => marcar(c, nota));
      tipos.push(parecido || ambiguo ? 'noCruzo' : 'nuevo');
      avisos.push(parecidoA.length
        ? { tipo: 'nuevo', sev: 'hi', who: ax.nombre, what: 'sin Employee Number: no cruzó con el GTN anterior por nombre.',
          why: `Se parece a ${parecidoA.join(' / ')} del GTN anterior (palabra de más), con más de un candidato: no se elige uno. `
            + 'Completá Employee Number, Cost Centre, Location Code y sueldo USD en el Excel (quedan en amarillo).' }
        : parecido
        ? { tipo: 'noCruzo', sev: 'hi', who: ax.nombre, what: 'no cruzó con el GTN anterior por nombre.',
          why: `El GTN trae una palabra de más (${parecido.nombre}). Quedó sin Employee Number: completalo a mano en el Excel (las celdas quedan en amarillo).` }
        : ambiguo
          ? { tipo: 'noCruzo', sev: 'hi', who: ax.nombre, what: 'no cruzó con el GTN anterior por nombre: coincide con más de una fila.',
            why: 'Quedó sin Employee Number: completalo a mano en el Excel (las celdas quedan en amarillo). El detalle está en el cruce por nombre.' }
          : { tipo: 'nuevo', sev: 'hi', who: ax.nombre, what: 'empleado nuevo: no estaba en el GTN anterior.',
            why: 'Completá Employee Number, Cost Centre, Location Code y sueldo USD en el Excel (quedan en amarillo).' });
    } else if (prev.usdOrigen !== 'formula') {
      const nota = prev.usdOrigen === 'valor'
        ? `REVISAR: en el GTN anterior el sueldo en USD no era la fórmula anual / ${String(USD_DIVISOR).replace('.', ',')}; se copió el valor.`
        : 'REVISAR: el GTN anterior no traía el sueldo en USD. Completarlo (fórmula importe anual / 13,3).';
      marcar('monthlySalaryUsd', nota);
      tipos.push('usd');
      avisos.push({ tipo: 'usd', sev: 'lo', who: prev.nombre,
        what: prev.usdOrigen === 'valor'
          ? `el sueldo en USD del GTN anterior no es la fórmula anual / ${String(USD_DIVISOR).replace('.', ',')}.`
          : 'el GTN anterior no traía el sueldo en USD.',
        why: prev.usdOrigen === 'valor'
          ? 'Se copió el valor tal cual (celda en amarillo). Revisá que sea el mensual en USD.'
          : 'Completalo en el Excel (celda en amarillo).' });
    }

    for (const [key, label] of [['recognitionAward', 'Recognition Award'], ['businessReferral', 'Business Referrral']]) {
      if (v[key] !== null && v[key] !== 0) {
        marcar(key, `REVISAR: ${label} con importe. Revisar códigos e importes.`);
        tipos.push(key);
        avisos.push({ tipo: key, sev: 'lo', who: prev?.nombre || ax.nombre,
          what: `${label} con importe (${fmt(v[key])}).`,
          why: 'Revisá códigos e importes (celda en amarillo con comentario).' });
      }
    }

    if (erNetPaid === null) {
      marcar('erNetPaid', 'REVISAR: el Tabulado no trae ER Net Paid (605203) para este empleado. No se completó con 0.');
      tipos.push('sinErNetPaid');
      avisos.push({ tipo: 'sinErNetPaid', sev: 'hi', who: prev?.nombre || ax.nombre,
        what: 'no tiene ER Net Paid en el Tabulado: el neto no se pudo controlar.',
        why: 'La celda queda vacía y en amarillo: no se completa con 0. Revisá el recibo en Axton.' });
    }

    return {
      clave: ax.clave,
      legajo: ax.legajo,
      nombreAxton: ax.nombre,
      nombre: prev ? prev.nombre : ax.nombre,
      employeeNumber: prev ? prev.employeeNumber : null,
      costCentre: prev ? prev.costCentre : null,
      locationCode: prev ? prev.locationCode : null,
      usd: prev ? { anual: prev.usdAnual, valor: prev.usdValor, origen: prev.usdOrigen } : { anual: null, valor: null, origen: null },
      cruzo: !!prev,
      liquidaciones: ax.liquidaciones,
      porCodigo: ax.porCodigo,
      valores: v,
      grossPay, totalDeductions, netPay, erNetPaid, diferencia, employerTotal,
      marcas,
      tipos,
    };
  });

  // ── El cruce por nombre, completo, para la pantalla ────────────────────────
  const cruce = empleados.map(e => {
    const j = empleadosAx.findIndex(a => a.clave === e.clave);
    const parecidoIdx = parecidos.get(j);
    if (e.cruzo) return { resultado: 'cruzo', axton: e.nombreAxton, gtn: e.nombre, employeeNumber: e.employeeNumber, nota: null };
    if (parecidoIdx !== undefined) {
      const p = prevRows[parecidoIdx];
      return { resultado: 'noCruzo', axton: e.nombreAxton, gtn: p.nombre, employeeNumber: null,
        nota: `el GTN trae una palabra de más — revisá (Employee Number ${p.employeeNumber ?? '—'} en el GTN anterior)` };
    }
    const parecidoA = (parecidoAmbiguo.get(j) || []).map(i => prevRows[i].nombre);
    if (parecidoA.length) {
      return { resultado: 'nuevo', axton: e.nombreAxton, gtn: null, employeeNumber: null,
        nota: `se parece a ${parecidoA.join(' / ')} del GTN anterior, sin un par único — no se cruzó` };
    }
    const amb = prevEstado.map((pe, i) => ({ pe, i }))
      .filter(({ pe }) => ['varios', 'homonimo', 'conflicto'].includes(pe.tipo) && pe.candidatos.includes(j));
    if (amb.length) {
      return { resultado: 'noCruzo', axton: e.nombreAxton, gtn: amb.map(({ i }) => prevRows[i].nombre).join(' / '), employeeNumber: null,
        nota: 'coincide con más de una fila del GTN anterior — no se cruzó' };
    }
    return { resultado: 'nuevo', axton: e.nombreAxton, gtn: null, employeeNumber: null, nota: null };
  });
  const parecidosUsados = new Set(parecidos.values());
  prevRows.forEach((p, i) => {
    const pe = prevEstado[i];
    if (pe.tipo === 'cruzo' || parecidosUsados.has(i)) return;
    const candidatos = pe.candidatos.map(j => empleadosAx[j].nombre);
    if (pe.tipo === 'no_vino') {
      cruce.push({ resultado: 'noVino', axton: null, gtn: p.nombre, employeeNumber: p.employeeNumber,
        nota: 'no se incluye en el GTN nuevo' });
      avisos.push({ tipo: 'noVino', sev: 'lo', who: p.nombre || `(fila ${p.fila} sin nombre)`,
        what: 'estaba en el GTN anterior y no vino en el Tabulado: no se incluye.',
        why: 'Si es una baja, está bien así.' });
      return;
    }
    const parecidoNombres = (pe.parecidos || []).map(j => empleadosAx[j].nombre);
    const nota = pe.tipo === 'parecidoVarios'
      ? (pe.parecidos.length > 1
        ? `el GTN trae una palabra de más y se parece a más de un empleado del Tabulado (${parecidoNombres.join(', ')}): no se cruzó`
        : `el GTN trae una palabra de más y otra fila del GTN anterior se parece al mismo empleado del Tabulado (${parecidoNombres.join(', ')}): no se cruzó ninguna`)
      : pe.tipo === 'homonimo'
      ? 'hay otra fila del GTN anterior con el mismo nombre: no se cruzó ninguna de las dos'
      : pe.tipo === 'conflicto'
        ? `otra fila del GTN anterior pide al mismo empleado de Axton (${candidatos.join(', ')}): no se cruzó ninguna`
        : `coincide con más de un empleado del Tabulado (${candidatos.join(', ')}): no se cruzó`;
    cruce.push({ resultado: pe.tipo, axton: null, gtn: p.nombre, employeeNumber: p.employeeNumber, nota });
    avisos.push({ tipo: pe.tipo, sev: 'hi', who: p.nombre,
      what: `del GTN anterior: ${nota}.`,
      why: `Employee Number ${p.employeeNumber ?? '—'}. Completá a mano el Employee Number del empleado que corresponda (queda en amarillo).` });
  });

  // ── Avisos generales ───────────────────────────────────────────────────────
  for (const c of conceptos) {
    const k = checks[c.codigo];
    if (k.cierra === false) {
      avisos.push({ tipo: 'totalGeneral', sev: 'hi', who: `Concepto ${c.codigo}`,
        what: `${c.codigo} - ${c.nombre} suma ${fmt(k.sumado)} entre los empleados y el TOTAL GENERAL del Tabulado dice ${fmt(k.tg)}.`,
        why: 'Puede ser una fila editada a mano o una columna que no se leyó completa. Revisá el Tabulado antes de mandar el GTN.' });
    }
  }

  const periodoTab = tabMeta.periodo || null;
  const period = periodoTab || mapping.period || null;
  const generales = [];
  if (!periodoTab) {
    generales.push(`El Tabulado no dice su período: se usó el de la corrida (${periodoAR(mapping.period)}).`);
  } else if (mapping.period && mapping.period !== periodoTab) {
    generales.push(`El Tabulado es de ${periodoAR(periodoTab)} y la corrida es de ${periodoAR(mapping.period)}: el GTN sale con el período del Tabulado.`);
  }
  const esperadoPrev = mesAnterior(period);
  if (prevMeta.periodo && esperadoPrev && prevMeta.periodo !== esperadoPrev) {
    generales.push(`El GTN anterior es de ${periodoAR(prevMeta.periodo)} y se esperaba el de ${periodoAR(esperadoPrev)}: revisá que sea el último que se mandó.`);
  }
  for (const a of prevMeta.avisos || []) generales.push(`GTN anterior: ${a}`);
  // Los avisos del lector del Tabulado viajan, como en N2 (hojas que no se
  // leyeron, filas sin legajo, conceptos duplicados, sumas que no cierran…),
  // salvo tres que acá se dicen con más precisión: "sólo importes" (el GTN no
  // usa cantidades), las columnas que no se pudieron atribuir (las clasifica
  // `columnasNoConceptoGtn`: frenan o avisan según traigan plata) y la falta de
  // TOTAL GENERAL (aviso propio, abajo).
  const REEMPLAZADOS = [/sólo con importes/i, /no se pudo atribuir|no se pudieron atribuir/i, /No encontré la fila TOTAL GENERAL/i];
  for (const a of tabMeta.avisos || []) {
    if (!REEMPLAZADOS.some(re => re.test(a))) generales.push(`Tabulado: ${a}`);
  }
  for (const g of generales) avisos.push({ tipo: 'general', sev: 'lo', who: 'Archivos', what: g });
  if (!tg) {
    avisos.push({ tipo: 'totalGeneral', sev: 'hi', who: 'Tabulado',
      what: 'El Tabulado no trae la fila TOTAL GENERAL: no se pudo controlar que se hayan leído todos los importes.',
      why: 'Revisá que sea el export completo del Resumen de Liquidacion.' });
  }
  const noConcepto = columnasNoConceptoGtn(tabMeta);
  for (const c of noConcepto.avisan) {
    avisos.push({ tipo: 'noConcepto', sev: 'hi', who: `Columna ${c.letra}`,
      what: `"${c.rotulo}" trae importes este mes (${c.celdasConImporte} ${c.celdasConImporte === 1 ? 'empleado' : 'empleados'}, `
        + `${fmt(c.importe)}) y no es un concepto: no entra al GTN.`,
      why: 'Revisá si corresponde que esté en el GTN; si es así, tiene que venir como concepto con su código.' });
  }

  // ── Totales y conteos ──────────────────────────────────────────────────────
  const totalDe = (key) => sumaNullable(empleados.map(e => e[key]));
  const conDiferencia = empleados.filter(e => isDiff(e.diferencia, GTN_NET_TOLERANCE));
  const totales = {
    grossPay: totalDe('grossPay'),
    totalDeductions: totalDe('totalDeductions'),
    netPay: totalDe('netPay'),
    erNetPaid: totalDe('erNetPaid'),
    diferencia: sumaNullable(conDiferencia.map(e => e.diferencia)),
    employerTotal: totalDe('employerTotal'),
  };

  // La composición de cada columna del GTN, con su control contra TOTAL GENERAL.
  const columnas = GTN_ASSIGNABLE
    .filter(col => porColumna.has(col.key))
    .map(col => ({
      key: col.key, ui: col.ui, block: col.block,
      total: sumaNullable(porColumna.get(col.key).map(c => c.total)),
      codigos: porColumna.get(col.key).map(c => c.codigo),
    }));

  return {
    period,
    periodoTabulado: periodoTab,
    periodoGtnPrevio: prevMeta.periodo || null,
    origenGtnPrevio: prevMeta.origen || null,
    tipoCambio,
    fileName: gtnFileName(period),
    tabFileName: mapping.tabAxtonFileName || null,
    gtnPrevFileName: mapping.gtnPrevFileName || null,
    tolerancia: GTN_NET_TOLERANCE,
    conceptos,
    checks,
    columnas,
    empleados,
    cruce,
    avisos,
    totales,
    tabLectura: {
      liquidaciones: tabRows.length,
      noConceptoOk: noConcepto.ok.map(c => `${c.letra} "${c.rotulo || '(sin encabezado)'}"`),
      noConceptoConImporte: noConcepto.avisan.map(c => `${c.letra} "${c.rotulo}"`),
      totalGeneral: !!tg,
    },
    conteos: {
      empleados: empleados.length,
      cruzados: empleados.filter(e => e.cruzo).length,
      sinEmployeeNumber: empleados.filter(e => !e.cruzo).length,
      noVinieron: cruce.filter(c => c.resultado === 'noVino').length,
      gtnPrevio: prevRows.length,
      conDiferencia: conDiferencia.length,
      sinErNetPaid: empleados.filter(e => e.erNetPaid === null).length,
      consolidados: empleados.filter(e => e.liquidaciones > 1).length,
      conceptos: conceptos.length,
      fuera: conceptos.filter(c => c.columna === FUERA_DEL_GTN).length,
    },
  };
}

// ── Lo que va al Excel ───────────────────────────────────────────────────────

/** Las filas del GTN en la forma que lee el layout. */
export function gtnParaExcel(results) {
  return {
    period: results.period,
    tipoCambio: results.tipoCambio,
    filas: results.empleados.map(e => ({
      employeeNumber: e.employeeNumber,
      nombre: e.nombre,
      costCentre: e.costCentre,
      locationCode: e.locationCode,
      usd: { anual: e.usd?.anual ?? null, valor: e.usd?.valor ?? null },
      valores: e.valores,
      marcas: e.marcas,
    })),
  };
}

async function exportarGtn(results) {
  const ExcelJS = await loadExcelJS();
  await downloadWorkbook(buildGtnGsmaWorkbook(ExcelJS, gtnParaExcel(results)), results.fileName);
}

// ── summarize() ──────────────────────────────────────────────────────────────

export function summarizeGtnGsma(results) {
  if (results.error) {
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null,
      diffTotalAmount: null, worstCase: null, contextNote: null,
      resumen: resumenStats({ unit: null, rows: [], notApplicable: ['signed', 'buckets', 'group', 'cause', 'top', 'keys', 'bridge'] }),
    };
  }

  const c = results.conteos;
  const conDif = results.empleados.filter(e => isDiff(e.diferencia, GTN_NET_TOLERANCE));
  const insights = [];
  if (conDif.length) insights.push({ type: 'danger', label: 'empleados cuyo neto no cierra con ER Net Paid', value: conDif.length });
  if (c.sinEmployeeNumber) insights.push({ type: 'warning', label: 'empleados sin Employee Number (completar en el Excel)', value: c.sinEmployeeNumber });
  if (c.noVinieron) insights.push({ type: 'warning', label: 'empleados del GTN anterior que no vinieron', value: c.noVinieron });
  if (c.sinErNetPaid) insights.push({ type: 'warning', label: 'empleados sin ER Net Paid en el Tabulado', value: c.sinErNetPaid });
  if (c.consolidados) insights.push({ type: 'info', label: 'empleados con más de una liquidación (se sumaron)', value: c.consolidados });

  const peor = conDif.slice().sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))[0];
  // Tres grupos, como en la pantalla de resultados: cierran, no cierran, y sin
  // comparar (sin ER Net Paid). "Cierra en los N" sólo si no falta ninguno.
  const sinComparar = results.empleados.filter(e => e.diferencia === null).length;
  const cierran = c.empleados - conDif.length - sinComparar;
  const partes = [
    `el neto cierra con ER Net Paid en ${cierran} de ${c.empleados} empleado${c.empleados === 1 ? '' : 's'}`,
    conDif.length ? `${conDif.length} no cierra${conDif.length === 1 ? '' : 'n'}` : null,
    sinComparar ? `${sinComparar} sin comparar (sin ER Net Paid)` : null,
  ].filter(Boolean);
  return {
    status: conDif.length || sinComparar ? 'warning' : 'success',
    headline: conDif.length || sinComparar
      ? `GTN ${periodoAR(results.period)} generado: ${partes.join(' · ')}`
      : `GTN ${periodoAR(results.period)} generado: el neto cierra con ER Net Paid en los ${c.empleados} empleados`,
    insights,
    unit: 'legajo',
    unitsTotal: c.empleados,
    unitsWithDiff: conDif.length,
    // Si no se pudo comparar el neto de ningún empleado (ninguno trae ER Net
    // Paid), el control no controló nada: no puede salir verde (D-107).
    semaforoFloor: c.empleados > 0 && sinComparar === c.empleados ? 'warn' : null,
    diffTotalAmount: conDif.reduce((s, e) => s + Math.abs(e.diferencia), 0),
    worstCase: peor ? { legajo: peor.legajo, nombre: peor.nombre, diff: peor.diferencia } : null,
    contextNote: `${results.avisos.length} aviso${results.avisos.length === 1 ? '' : 's'} para revisar · tipo de cambio ${fmt(results.tipoCambio)}`,
    resumen: resumenStats({
      unit: 'legajo',
      tolerance: GTN_NET_TOLERANCE,
      rows: conDif,
      allRows: results.empleados,
      diff: (e) => e.diferencia,
      key: (e) => e.clave,
      unitLabel: (e) => e.nombre,
      top: (e) => ({ legajo: e.legajo, nombre: e.nombre, empresa: null, rubro: null }),
      sideLabels: {
        over: { label: 'Net Pay mayor que ER Net Paid' },
        under: { label: 'Net Pay menor que ER Net Paid' },
      },
      bridge: {
        kind: 'amounts',
        title: 'Del Gross Pay al neto',
        steps: [
          { label: 'Gross Pay', amount: results.totales.grossPay ?? 0, tone: 'ink' },
          { label: '− Total Employee deductions', amount: results.totales.totalDeductions ?? 0, tone: 'ink' },
          { label: 'Net Pay', amount: results.totales.netPay ?? 0, tone: 'accent' },
          { label: 'ER Net Paid (605203)', amount: results.totales.erNetPaid ?? 0, tone: 'ink' },
          { label: 'Diferencia', amount: results.totales.diferencia ?? 0, tone: conDif.length ? 'error' : 'neutral',
            note: conDif.length ? `${conDif.length} empleado${conDif.length === 1 ? '' : 's'}` : 'ningún empleado' },
        ],
        // D-086: el neto de quien no tiene ER Net Paid no entra en la diferencia.
        uncompared: c.sinErNetPaid
          ? { label: 'Net Pay de empleados sin ER Net Paid', amount: sumaNullable(results.empleados
            .filter(e => e.erNetPaid === null).map(e => e.netPay)) ?? 0 }
          : null,
      },
      notApplicable: ['group', 'cause'],
    }),
  };
}

// ── Pantalla ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderGtnGsmaResults(results, container) {
  if (results.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }
  container.innerHTML = '';
  const conDif = results.empleados.some(e => isDiff(e.diferencia, GTN_NET_TOLERANCE));
  renderResumenDetalle(container, {
    controlId: 'gtn_gsma',
    conDiferencias: conDif,
    resumen: (panel) => renderResumenTab(panel, results),
    fichas: (panel) => renderFichasTab(panel, results),
    planilla: (panel) => renderPlanillaTab(panel, results),
  });
}

function seccion(panel, titulo, intro) {
  const el = document.createElement('div');
  el.className = 'gtn-card';
  el.innerHTML = `<h3 class="gtn-card__title">${esc(titulo)}</h3>${intro ? `<p class="gtn-card__intro">${esc(intro)}</p>` : ''}<div data-cuerpo></div>`;
  panel.appendChild(el);
  return el.querySelector('[data-cuerpo]');
}

function renderResumenTab(panel, results) {
  const c = results.conteos;
  const t = results.totales;
  const conDif = results.empleados.filter(e => isDiff(e.diferencia, GTN_NET_TOLERANCE));
  const cierran = c.empleados - conDif.length - c.sinErNetPaid;
  const avisos = results.avisos;

  renderVerdict(panel, {
    // Mismo criterio que el semáforo (D-107): amarillo si algún neto no cierra o
    // si no se pudo comparar ninguno; un empleado sin comparar solo es un aviso.
    tone: conDif.length || (c.empleados > 0 && results.empleados.every(e => e.diferencia === null)) ? 'warn' : 'ok',
    title: (conDif.length
      ? `El GTN de ${periodoAR(results.period)} está listo, pero ${conDif.length} empleado${conDif.length === 1 ? '' : 's'} no cierra${conDif.length === 1 ? '' : 'n'} por $ ${fmt(t.diferencia)}`
      : `El GTN de ${periodoAR(results.period)} está listo: el neto cierra con ER Net Paid en ${cierran} de ${c.empleados} empleados`)
      + (c.sinErNetPaid ? ` · ${c.sinErNetPaid} sin comparar (sin ER Net Paid)` : ''),
    body: `${esc(results.fileName)} · ${avisos.length ? `<strong>${avisos.length} aviso${avisos.length === 1 ? '' : 's'}</strong> para revisar antes de mandarlo (abajo).` : 'Sin avisos.'} `
      + 'El color dice sólo si el neto cierra; los avisos no lo cambian.',
  });

  renderTiles(panel, [
    { label: 'Empleados', value: c.empleados,
      sub: c.sinEmployeeNumber ? `${c.sinEmployeeNumber} sin Employee Number` : `todos cruzaron con el GTN ${periodoAR(results.periodoGtnPrevio)}` },
    { label: 'Gross Pay', value: esc(fmt(t.grossPay)), sub: `suma de los ${c.empleados}` },
    { label: 'Net Pay', value: esc(fmt(t.netPay)), sub: `Gross − deducciones ($ ${esc(fmt(t.totalDeductions))})` },
    { label: 'ER Net Paid', value: esc(fmt(t.erNetPaid)), sub: 'concepto 605203 de Axton' },
    { label: 'Diferencia', value: esc(fmt(t.diferencia ?? 0)), tone: conDif.length ? 'error' : 'ok',
      sub: conDif.length ? `${conDif.length} empleado${conDif.length === 1 ? '' : 's'}` : 'ningún empleado' },
    { label: 'Tipo de cambio usado', value: esc(fmt(results.tipoCambio)), sub: `ARS por USD · celda ${EXCHANGE_RATE_CELL}` },
  ]);

  const armado = seccion(panel, 'Cómo se armó cada columna del GTN',
    'Qué códigos de Axton suma cada columna, con qué asignación y si cierra contra el TOTAL GENERAL del Tabulado.');
  renderAsignacionesTable(armado, { conceptos: results.conceptos, mode: 'read', vista: 'columna', checks: results.checks });

  if (avisos.length) {
    renderIssues(panel, {
      heading: 'Para revisar antes de mandarlo — ninguno cambia el color del semáforo',
      items: avisos.map(a => ({ sev: a.sev, who: a.who, what: a.what, why: a.why })),
    });
  }

  const cruceHost = seccion(panel, 'Cruce con el GTN anterior (por nombre)',
    `El GTN no trae el legajo de Axton, así que el cruce es por nombre: todas las palabras del nombre del GTN tienen que estar en el de Axton, y el candidato tiene que ser único. GTN anterior: ${results.gtnPrevFileName || periodoAR(results.periodoGtnPrevio)}.`);
  const etiqueta = {
    cruzo: '<span class="badge badge--success">Cruzó</span>',
    nuevo: '<span class="badge badge--warning">Nuevo</span>',
    noCruzo: '<span class="badge badge--warning">No cruzó</span>',
    noVino: '<span class="badge badge--neutral">No vino</span>',
    varios: '<span class="badge badge--danger">Varios candidatos</span>',
    homonimo: '<span class="badge badge--danger">Homónimo</span>',
    conflicto: '<span class="badge badge--danger">Conflicto</span>',
    parecidoVarios: '<span class="badge badge--danger">No cruzó (varios candidatos)</span>',
  };
  cruceHost.innerHTML = `
    <div class="gtn-asig__scroll">
      <table class="data-table data-table--compact">
        <thead><tr><th>Nombre en Axton</th><th>Nombre en el GTN anterior</th><th>Employee Number</th><th>Resultado</th></tr></thead>
        <tbody>${results.cruce.map(x => `
          <tr${x.resultado === 'cruzo' ? '' : ' class="gtn-asig__row--fuera"'}>
            <td>${x.axton ? esc(x.axton) : '<span class="text-muted">— (no vino)</span>'}</td>
            <td>${x.gtn ? esc(x.gtn) : '<span class="text-muted">— (no estaba)</span>'}</td>
            <td>${x.employeeNumber !== null && x.employeeNumber !== undefined ? esc(x.employeeNumber)
              : (x.axton ? '<span class="badge badge--warning">falta</span>' : '—')}</td>
            <td>${etiqueta[x.resultado] || esc(x.resultado)}${x.nota ? ` <span class="text-muted" style="font-size:var(--text-sm);">${esc(x.nota)}</span>` : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const noCierran = results.conceptos.filter(k => results.checks[k.codigo]?.cierra === false);
  const items = [
    { ok: results.tabLectura.totalGeneral && noCierran.length === 0, label: 'Cada concepto suma igual que el TOTAL GENERAL del Tabulado',
      detail: results.tabLectura.totalGeneral
        ? (noCierran.length ? `no cierran: ${noCierran.map(k => k.codigo).join(', ')}` : `${results.conceptos.length} conceptos`)
        : 'el Tabulado no trae TOTAL GENERAL' },
    { ok: !!results.periodoTabulado, label: `Período ${periodoAR(results.period)}`,
      detail: results.periodoTabulado ? 'leído del Tabulado' : 'el Tabulado no lo dice: se usó el de la corrida' },
    { ok: true, label: `${results.tabLectura.liquidaciones} liquidaciones del Tabulado en ${c.empleados} empleados`,
      detail: c.consolidados ? `${c.consolidados} con más de una liquidación: se sumaron` : 'ninguno con dos liquidaciones' },
    { ok: true, label: `GTN anterior: ${c.gtnPrevio} empleados`,
      detail: results.origenGtnPrevio === 'app' ? 'el que generó la app' : 'el de Meta4' },
    { ok: true, label: `${c.fuera} concepto${c.fuera === 1 ? '' : 's'} fuera del GTN, a propósito`,
      detail: results.conceptos.filter(k => k.columna === FUERA_DEL_GTN).map(k => k.codigo).join(', ') || 'ninguno' },
  ];
  const lect = results.tabLectura;
  if (lect.noConceptoConImporte.length) {
    items.push({ ok: false, label: 'Columnas del Tabulado que no son conceptos y traen importes: no entran al GTN',
      detail: lect.noConceptoConImporte.join(', ') });
  }
  if (lect.noConceptoOk.length) {
    items.push({ ok: true, label: 'Columnas del Tabulado que no son conceptos (sin importes que falten en el GTN)',
      detail: lect.noConceptoOk.join(', ') });
  }
  renderChecks(panel, { heading: 'Chequeos de lectura', items });
}

/** El estado de un empleado para los chips: el neto contra ER Net Paid. */
const estadoEmpleado = (e) => estadoDeDiferencia(e.diferencia, GTN_NET_TOLERANCE);

const MARCAS = [
  { value: 'sinEmployeeNumber', label: 'Sin Employee Number', match: (e) => !e.cruzo },
  { value: 'sinErNetPaid', label: 'Sin ER Net Paid', match: (e) => e.erNetPaid === null },
  { value: 'premio', label: 'Recognition Award / Business Referrral', match: (e) => e.tipos.includes('recognitionAward') || e.tipos.includes('businessReferral') },
  { value: 'variasLiq', label: 'Más de una liquidación', match: (e) => e.liquidaciones > 1 },
];

function renderFichasTab(panel, results) {
  const fichas = results.empleados.map(e => {
    const dif = isDiff(e.diferencia, GTN_NET_TOLERANCE);
    const filasDe = (block) => GTN_ASSIGNABLE.filter(c => c.block === block && e.valores[c.key] !== null)
      .map(c => ({ label: c.ui, value: e.valores[c.key] }));
    return {
      id: e.clave,
      unit: e.legajo,
      severity: e.erNetPaid === null ? 'warn' : dif ? 'error' : 'ok',
      name: e.nombre,
      tag: { text: e.employeeNumber !== null ? `Employee Number ${e.employeeNumber}` : 'sin Employee Number', tone: e.cruzo ? undefined : 'warn' },
      context: [e.costCentre, e.locationCode, e.liquidaciones > 1 ? `${e.liquidaciones} liquidaciones sumadas` : null],
      marks: e.tipos.filter(t => t !== 'nuevo' && t !== 'noCruzo').map(t => ({ text: {
        recognitionAward: 'Recognition Award', businessReferral: 'Business Referrral', sinErNetPaid: 'sin ER Net Paid', usd: 'sueldo USD',
      }[t] || t, tone: 'info' })),
      amountLabel: 'NET PAY − ER NET PAID',
      amount: e.diferencia,
      amountTone: e.diferencia === null ? 'warn' : dif ? 'error' : 'ok',
      body: {
        strip: [
          { label: 'Gross Pay', value: e.grossPay },
          { label: 'Deducciones', value: e.totalDeductions, invert: true },
          { label: 'Net Pay', value: e.netPay },
          { label: 'ER Net Paid', value: e.erNetPaid, invert: true },
          { label: 'Diferencia', value: e.diferencia, residuo: true, tone: dif ? 'error' : undefined },
        ],
        tables: [
          { title: 'Gross Pay', rows: filasDe('gross'), foot: { label: 'Gross Pay', value: e.grossPay } },
          { title: 'Deducciones del empleado', rows: filasDe('deduction'), foot: { label: 'Total Employee deductions', value: e.totalDeductions } },
        ],
        detail: {
          title: 'Códigos de Axton de este empleado',
          columns: [{ key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Concepto en Axton' },
            { key: 'columna', label: 'Columna del GTN' }, { key: 'importe', label: 'Importe', num: true }],
          rows: results.conceptos.filter(k => e.porCodigo[k.codigo] !== null)
            .map(k => ({ codigo: k.codigo, nombre: k.nombre, columna: nombreColumna(k.columna), importe: e.porCodigo[k.codigo] })),
        },
        conclusion: e.erNetPaid === null
          ? { tone: 'warn', title: 'No se pudo controlar el neto', text: 'El Tabulado no trae ER Net Paid (605203) para este empleado. Revisá el recibo en Axton.' }
          : dif
            ? { tone: 'error', title: `El neto no cierra por $ ${fmt(e.diferencia)}`,
              text: 'Net Pay es Gross Pay menos las deducciones según las asignaciones de GSMA. Revisá si algún código de este empleado está asignado a la columna equivocada.' }
            : { tone: 'ok', title: 'El neto cierra con ER Net Paid', text: 'No hay nada que revisar en el neto de este empleado.' },
      },
    };
  });
  renderFichasPanel(panel, {
    fichas,
    estadoDe: (f) => estadoEmpleado(results.empleados.find(e => e.clave === f.id)),
    noAplica: { margen: 'el neto se controla al centavo: no hay margen' },
    marcas: MARCAS.map(m => ({ ...m, match: (f) => m.match(results.empleados.find(e => e.clave === f.id)) })),
    getLabel: (f) => `${f.unit} — ${f.name}`,
    getAmount: (f) => f.amount,
    amountLabel: 'Σ diferencia',
    unitLabel: 'empleados',
    onExport: (exportEl) => exportMenu(exportEl, results),
  });
}

const PLANILLA_COLS = [
  { key: 'legajo', label: 'Legajo Axton', band: 'Empleado' },
  { key: 'nombre', label: 'Nombre', band: 'Empleado' },
  { key: 'employeeNumber', label: 'Employee Number', band: 'Empleado', close: true },
  { key: 'grossPay', label: 'Gross Pay', band: 'Del Tabulado', num: true },
  { key: 'totalDeductions', label: 'Total deductions', band: 'Del Tabulado', num: true },
  { key: 'netPay', label: 'Net Pay', sub: 'Gross − deducciones', band: 'Del Tabulado', num: true },
  { key: 'erNetPaid', label: 'ER Net Paid', sub: '605203', band: 'Del Tabulado', num: true, close: true },
  { key: 'diferencia', label: 'Diferencia', sub: 'Net Pay − ER Net Paid', band: 'Control', num: true, mag: true },
];

function renderPlanillaTab(panel, results) {
  const maxDif = Math.max(0, ...results.empleados.map(e => Math.abs(e.diferencia ?? 0)));
  const columns = PLANILLA_COLS.map(c => {
    if (c.key === 'employeeNumber') {
      return { ...c, cell: (e) => (e.employeeNumber !== null ? esc(e.employeeNumber) : '<span class="badge badge--warning">falta</span>') };
    }
    if (c.key === 'diferencia') {
      return { ...c, cell: (e) => diffCellHtml(e.diferencia, { max: maxDif, eps: GTN_NET_TOLERANCE, absentLabel: 'sin comparar' }) };
    }
    if (!c.num) return { ...c, cell: (e) => esc(e[c.key] ?? '—') };
    return c;
  });
  renderPlanillaPanel(panel, {
    rows: results.empleados,
    columns,
    unitLabel: 'empleados',
    estadoDe: estadoEmpleado,
    noAplica: { margen: 'el neto se controla al centavo: no hay margen' },
    marcas: MARCAS,
    getLabel: (e) => `${e.legajo} ${e.nombre} ${e.nombreAxton} ${e.employeeNumber ?? ''}`,
    searchLabel: 'Buscar legajo, nombre o Employee Number',
    searchPlaceholder: 'Legajo, nombre o Employee Number…',
    stickyCols: 2,
    onExport: (exportEl) => exportMenu(exportEl, results),
    emptyText: 'Ningún empleado quedó con los filtros puestos.',
    footnote: (shown) => `Mostrando ${shown.length} de ${results.empleados.length} empleados. `
      + 'Un importe que no vino en el Tabulado se ve como "—", no como 0.',
  });
}

// ── Export ───────────────────────────────────────────────────────────────────

function exportMenu(exportEl, results) {
  renderExportMenu(exportEl, {
    items: [
      { key: 'gtn', label: '📊 GTN para GSMA (.xlsx)',
        desc: `${results.fileName} — mismo layout y fórmulas que el de Meta4 + columna Recognition Award.`,
        action: () => exportarGtn(results) },
      { key: 'xlsx', label: 'Planilla de control (.xlsx)', desc: 'Una fila por empleado: Gross, deducciones, Net Pay, ER Net Paid y la diferencia.',
        action: () => exportarPlanilla(results) },
      { key: 'csv', label: 'CSV', desc: 'La planilla de control, sin formato.',
        action: () => downloadCsv(PLANILLA_HEADERS, planillaFilas(results), `GTN_GSMA_Control_${results.period}.csv`) },
      { key: 'copy', label: 'Copiar', desc: 'Se pega directo en Excel, respetando las columnas.',
        action: () => copyRowsToClipboard(PLANILLA_HEADERS, planillaFilas(results)) },
    ],
    note: 'El GTN lleva nombres, Employee Number y sueldos: es el informe de payroll que recibe GSMA.',
  });
}

const PLANILLA_HEADERS = ['Legajo Axton', 'Nombre', 'Nombre en Axton', 'Employee Number', 'Gross Pay',
  'Total Employee deductions', 'Net Pay', 'ER Net Paid', 'Diferencia', 'Avisos'];

function planillaFilas(results) {
  const num = (v) => (v === null || v === undefined ? '' : fmt(v));
  return results.empleados.map(e => [
    e.legajo, e.nombre, e.nombreAxton, e.employeeNumber ?? '', num(e.grossPay), num(e.totalDeductions),
    num(e.netPay), num(e.erNetPaid), num(e.diferencia), e.tipos.join(', '),
  ]);
}

async function exportarPlanilla(results) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Control GTN');
  ws.columns = [{ width: 12 }, { width: 32 }, { width: 32 }, { width: 16 }, { width: 18 }, { width: 18 },
    { width: 18 }, { width: 18 }, { width: 14 }, { width: 40 }];
  const head = ws.addRow(PLANILLA_HEADERS);
  head.font = { bold: true };
  for (const e of results.empleados) {
    const r = ws.addRow([e.legajo, e.nombre, e.nombreAxton, e.employeeNumber ?? null, e.grossPay, e.totalDeductions,
      e.netPay, e.erNetPaid, e.diferencia, e.tipos.join(', ')]);
    [5, 6, 7, 8, 9].forEach(i => { r.getCell(i).numFmt = '#,##0.00'; });
  }
  const t = results.totales;
  const tot = ws.addRow(['TOTAL', `${results.empleados.length} empleados`, null, null, t.grossPay, t.totalDeductions,
    t.netPay, t.erNetPaid, t.diferencia ?? 0, null]);
  tot.font = { bold: true };
  [5, 6, 7, 8, 9].forEach(i => { tot.getCell(i).numFmt = '#,##0.00'; });
  await downloadWorkbook(wb, `GTN_GSMA_Control_${results.period}.xlsx`);
}

