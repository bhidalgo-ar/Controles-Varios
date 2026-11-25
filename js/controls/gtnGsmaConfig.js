// gtnGsmaConfig.js — Las asignaciones de GSMA: qué código de Axton va a qué
// columna del GTN (specs/gtn-gsma-axton.md §3).
//
// Es configuración DEL CLIENTE, guardada en `controlConfigs` (D-035/D-039): lo
// que el analista elige en el Paso 2 gana siempre; los códigos de acá son
// **semilla** para cuando todavía no eligió nada, no identidad. Una renumeración
// de Axton se arregla desde la pantalla, no con un commit.
//
// Sólo se siembra lo CONFIRMADO contra archivos reales (los 18 + 2 de la tabla
// del §3: verificados contra meses reales de Meta4 y contra el Tabulado Axton
// 11/2026). Lo que salió del Manual de Conceptos de la migración y nunca se vio
// en un Tabulado de Axton NO se siembra: aparece "sin asignar", con la
// sugerencia del Manual al lado y sin aplicarla — un código sembrado por
// analogía es un default silencioso, y un concepto mal asignado sale al cliente
// con números coherentes y equivocados.
//
// Cada concepto del Tabulado tiene que quedar en exactamente uno de cuatro
// estados, y "sin asignar" FRENA: no se ejecuta ni se genera el GTN. Está acá y
// no en el módulo del control porque lo leen tres lugares —el gate del Paso 2
// (registry), el editor y `run()`— y ninguno de los tres puede importar al otro.

import { GTN_ASSIGNABLE, GTN_COLUMN_BY_KEY } from '../exports/gtnGsmaLayout.js';
import { toNum } from '../utils/currency.js';

/** La "columna" de un concepto que va a propósito fuera del GTN. */
export const FUERA_DEL_GTN = '__fuera__';

/** Los cuatro estados, en el orden en que se listan. */
export const ESTADOS_ASIGNACION = [
  { value: 'sin_asignar', label: 'Sin asignar' },
  { value: 'confirmado',  label: 'Confirmado' },
  { value: 'analista',    label: 'Asignado por el analista' },
  { value: 'fuera',       label: 'Fuera del GTN' },
];

/** Semillas confirmadas: código de Axton → columna del GTN. */
const SEMILLAS_COLUMNA = {
  '1000':   'monthlySalary',
  '1498':   'variablePay',
  '3000':   'commission',
  '503815': 'teleworking',
  '1032':   'directorAllowance',
  '605110': 'socialSecurity',
  '605130': 'healthInsurance',
  '605120': 'law19032',
  '609996': 'incomeTax',
  '605203': 'erNetPaid',
  '880011': 'ssEmployer',
  '880012': 'ssEmployer',
  '880013': 'ssEmployer',
  '880014': 'ssEmployer',
  '880015': 'hiEmployer',
  '880022': 'accidentInsurance',
  '880021': 'fixedAccident',
  '880025': 'fixedLife',
};

/** Semillas confirmadas que van a propósito fuera del GTN, con el porqué. */
const SEMILLAS_FUERA = {
  '880023': 'Plan prepaga a cargo de la empresa: sólo costo empresa',
  '880001': 'Detracción Ley 27.430: no tiene columna en el GTN',
};

/**
 * Lo que dice el Manual de Conceptos de la migración para códigos que nunca se
 * vieron en un Tabulado de Axton de GSMA. Se MUESTRA al lado del concepto sin
 * asignar; nunca se aplica.
 */
export const SUGERENCIAS_MANUAL = {
  '1003':   'daysNotWorked',
  '2487':   'recognitionAward',
  '2492':   'recognitionAward',
  '2545':   'bonus',
  '2546':   'bonus',
  '2804':   'thirteenthSalary',
  '2800':   'thirteenthSalary',
  '2252':   'holidayPay',
  '2620':   'businessReferral',
  '609995': 'incomeTax',
  '609999': 'incomeTaxExtra',
  '605691': 'miscDeduction',
  '880027': 'hiEmployer',
};

/** Las semillas como entradas de config (copia nueva cada vez). */
function semillas() {
  const out = {};
  for (const [codigo, columna] of Object.entries(SEMILLAS_COLUMNA)) out[codigo] = { columna, origen: 'semilla' };
  for (const [codigo, nota] of Object.entries(SEMILLAS_FUERA)) out[codigo] = { columna: FUERA_DEL_GTN, origen: 'semilla', nota };
  return out;
}

/**
 * La config de un cliente que todavía no eligió nada: las semillas. Devuelve
 * una copia nueva cada vez — el editor la muta en el lugar.
 *
 * Forma: `{ asignaciones: { <codigo>: { columna, origen: 'semilla'|'analista', fecha?, nota? } } }`
 */
export const DEFAULT_GTN_GSMA_CONFIG = () => ({ asignaciones: semillas() });

/** ¿La columna guardada es una que el GTN todavía tiene? */
function columnaValida(columna) {
  return columna === FUERA_DEL_GTN || GTN_ASSIGNABLE.some(c => c.key === columna);
}

/**
 * La asignación que manda para un código: la del cliente si la eligió, si no la
 * semilla, si no ninguna. Una columna guardada que el layout ya no tiene cuenta
 * como sin asignar (no se adivina a dónde se movió).
 *
 * @returns {{ columna: string, origen: string, fecha?: string, nota?: string }|null}
 */
export function asignacionDe(codigo, config) {
  const guardada = config?.asignaciones?.[codigo];
  if (guardada && columnaValida(guardada.columna)) return guardada;
  const semilla = semillas()[codigo];
  return semilla || null;
}

/** El estado de una asignación (o de su ausencia). */
export function estadoDe(asignacion) {
  if (!asignacion) return 'sin_asignar';
  if (asignacion.columna === FUERA_DEL_GTN) return 'fuera';
  return asignacion.origen === 'analista' ? 'analista' : 'confirmado';
}

/** El nombre en pantalla de una columna del GTN (o de "fuera"). */
export function nombreColumna(columna) {
  if (columna === FUERA_DEL_GTN) return 'Fuera del GTN (no va al informe)';
  return GTN_COLUMN_BY_KEY[columna]?.ui ?? columna;
}

/**
 * Los conceptos del Tabulado con su asignación resuelta, en el orden del
 * archivo. Los totales se suman sobre TODAS las filas del Tabulado (una por
 * liquidación): es el importe del mes del concepto, no por empleado.
 *
 * @param {object[]} conceptos — `parseMetadata.conceptos` de `readTabAxton`
 * @param {object} config
 * @param {object[]} [rows] — `parsedRows` del Tabulado, para el importe del mes
 * @returns {object[]} `{ codigo, nombre, keyImp, letra, columna, estado, origen,
 *   fecha, nota, sugerencia, total }`
 */
export function resolverConceptos(conceptos, config, rows = []) {
  return (conceptos || []).map(c => {
    const a = asignacionDe(c.codigo, config);
    let total = null;
    for (const r of rows) {
      const v = toNum(r[c.keyImp]);
      if (v !== null) total = (total ?? 0) + v;
    }
    return {
      codigo: c.codigo,
      nombre: c.nombre,
      keyImp: c.keyImp,
      letra: c.letra,
      columna: a?.columna ?? null,
      estado: estadoDe(a),
      origen: a?.origen ?? null,
      fecha: a?.fecha ?? null,
      nota: a?.nota ?? null,
      sugerencia: SUGERENCIAS_MANUAL[c.codigo] ?? null,
      total,
    };
  });
}

/** Hoy en formato AAAA-MM-DD (la fecha de una asignación del analista). */
export function hoyISO(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Asigna un código (lo llama el editor). Devuelve una config nueva: cualquier
 * cambio, aunque sea sobre una semilla, pasa a "asignado por el analista" con la
 * fecha de hoy.
 */
export function asignar(config, codigo, columna, { fecha = hoyISO() } = {}) {
  const asignaciones = { ...(config?.asignaciones || {}) };
  if (columna === null || columna === undefined || columna === '') delete asignaciones[codigo];
  else asignaciones[codigo] = { columna, origen: 'analista', fecha };
  return { ...(config || {}), asignaciones };
}

/** El tipo de cambio como número válido (> 0), o `null`. */
export function tipoCambioValido(v) {
  const n = toNum(v);
  return n !== null && n > 0 ? n : null;
}

/**
 * Lo que frena la corrida. Lo usan el gate del Paso 2 (con los motivos en
 * pantalla) y `run()` (que devuelve `{ error }` si igual le llega).
 *
 * @returns {{ sinAsignar: { codigo: string, nombre: string }[], faltaTipoCambio: boolean }}
 */
export function pendientesGtnGsma({ tabMeta, config, tipoCambio }) {
  const sinAsignar = (tabMeta?.conceptos || [])
    .filter(c => estadoDe(asignacionDe(c.codigo, config)) === 'sin_asignar')
    .map(c => ({ codigo: c.codigo, nombre: c.nombre }));
  return { sinAsignar, faltaTipoCambio: tipoCambioValido(tipoCambio) === null };
}

/**
 * Los motivos del gate, en la forma que lee el wizard (`blockers` del registry):
 * `{ kind, label, detail?, count }`. Sin Tabulado cargado no hay conceptos que
 * mirar todavía: el casillero vacío ya frena por su cuenta.
 */
export function motivosGtnGsma({ tabMeta, config, tipoCambio }) {
  const { sinAsignar, faltaTipoCambio } = pendientesGtnGsma({ tabMeta, config, tipoCambio });
  const out = [];
  if (sinAsignar.length > 0) {
    out.push({
      kind: 'concepto',
      label: sinAsignar.length === 1 ? '1 concepto sin asignar' : `${sinAsignar.length} conceptos sin asignar`,
      detail: sinAsignar.map(c => c.codigo).join(', '),
      count: sinAsignar.length,
    });
  }
  if (faltaTipoCambio) {
    out.push({ kind: 'dato', label: 'Falta el tipo de cambio', detail: 'GTN GSMA: va a la celda Exchange Rate', count: 1 });
  }
  return out;
}
