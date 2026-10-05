// asientoPiano.js — Contabilidad Desglosada + Asiento de Piano desde el Tabulado de Axton
//
// Núcleo de cálculo, sin pantalla: convierte el Tabulado de Axton de Piano (una
// fila por LIQUIDACIÓN, cada concepto en su columna `imp_<codigo>`, ver
// `js/parsers/tabAxtonReader.js`) en los dos entregables contables del mes:
//
//   1. **Contabilidad Desglosada** (`buildDesglosadaLines`) — una línea por
//      legajo + concepto + cuenta, del lado DEBE o del lado HABER según la
//      imputación del concepto. Es el drill-down del asiento: cada peso se puede
//      rastrear hasta el legajo y el concepto que lo generó.
//   2. **Asiento agrupado** (`buildAsiento`) — la desglosada agrupada por legajo
//      + cuenta, neteada (DEBE − HABER) a un solo lado, con el centro de costo
//      que es el legajo con ceros a la izquierda y la función/departamento del
//      empleado en las cuentas de resultado. Es la forma del asiento que Piano
//      venía recibiendo de Meta4.
//
// Y controla lo único que se puede controlar sin otro archivo contra el que
// cruzar: que el asiento **cuadre** y que no use cuentas fuera del plan del
// cliente (`checkPlanDeCuentas`).
//
// **Por qué todo entra por parámetro.** Cuando se escribió esto el Tabulado de
// Piano todavía no había llegado: qué concepto de Axton va a qué cuenta y en qué
// columnas vienen la función y el departamento son configuración que se carga
// después, por cliente (D-035). Por eso acá **no hay ninguna imputación de
// conceptos sembrada**: no se conocen, y una inventada por analogía sería un
// default silencioso (D-039). Un concepto con importe y sin imputación no se
// manda a ninguna cuenta: sale como aviso. Lo que sí está sembrado (plan de
// cuentas, cuentas de pasivo, códigos de función y de departamento) es SEMILLA
// visible en los archivos de Meta4 de Piano, no identidad: lo que manda es lo
// que el analista tenga guardado.
//
// **Por qué no reusa `contaDesglosada.js` ni `finadietAsiento.js`.** Los dos
// arman el asiento desde otro reporte y con otra clave: COTY agrupa por NOMBRE
// de cuenta + centro de costo y resuelve el código con un reporte de cuentas
// aparte; FINADIET agrupa por cuenta + centro sin legajo. Acá la cuenta ya viene
// como código desde la imputación y la clave del asiento es legajo + cuenta. Sus
// helpers de neteo y cuadre son internos del módulo (no exportados) y están
// atados a esas claves, así que se reusa el molde compartido —`consolidate.js`,
// `makeLegajoKey`, `toNum`— y no la lógica de esos dos controles.
//
// **Consolidación por legajo.** La unidad de la desglosada es la LÍNEA, no el
// empleado: un legajo con la mensual y la de vacaciones aparece en las dos, y las
// dos se emiten. Pero quién es el mismo empleado lo decide la clave del cliente
// (`makeLegajoKey(legajoKeyMode)`, D-038/D-042), no un `trim` a mano: '007' y '7'
// tienen que caer en la misma fila del asiento, y la función/departamento salen
// de la ÚLTIMA liquidación del legajo (`lastRow`), no se suman.

import { groupRowsByLegajo, lastRow } from './consolidate.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { toNum } from '../utils/currency.js';

// Tolerancia ESTRUCTURAL del cuadre DEBE contra HABER. No es la tolerancia de
// diferencias del analista (`isDiff`, panel "Umbrales"): un asiento que no
// cierra por más de un centavo de redondeo está mal armado, y subir este número
// taparía una imputación mal cargada.
const TOL_CUADRE_ASIENTO = 0.01;

// "¿Este concepto se liquidó?" no es "¿difiere?": debajo de medio centavo el
// importe es ruido de float de Excel, no un movimiento. Constante propia para
// que no se confunda con ninguna tolerancia de diferencias.
const VALOR_REAL_EPS = 0.005;

// Prefijo de las columnas de importe en las filas del Tabulado de Axton.
const IMP_PREFIX = 'imp_';

// Lo que va en función/departamento de una cuenta de pasivo: así sale en el
// asiento de Meta4 de Piano, que es el formato que el cliente ya recibe.
const PASIVO_ID_FUNCION = '00';
const PASIVO_NOMBRE_FUNCION = 'Desconocido';

// Ancho del centro de costo: el legajo completado con ceros a la izquierda.
const C_COSTO_WIDTH = 4;

export const LADO_DEBE = 'DEBE';
export const LADO_HABER = 'HABER';

/**
 * Plan de cuentas de Piano. SEMILLA confirmada por el usuario contra el plan
 * del cliente: lo que manda es lo que el analista tenga guardado.
 */
export const PLAN_CUENTAS_SEED = [
  { cuenta: '213100', nombre: 'Remuneraciones a Pagar' },
  { cuenta: '213110', nombre: 'Provision SAC' },
  { cuenta: '213120', nombre: 'Provision Vacaciones' },
  { cuenta: '213200', nombre: 'Cargas Sociales (SUSS) a pagar' },
  { cuenta: '214702', nombre: 'Retenciones Ganancias empleados a depositar' },
  { cuenta: '521100', nombre: 'Remuneraciones' },
  { cuenta: '521101', nombre: 'Cargas Sociales' },
  { cuenta: '521118', nombre: 'Vacaciones' },
  { cuenta: '521126', nombre: 'SAC' },
  { cuenta: '521142', nombre: 'Bono' },
  { cuenta: '114109', nombre: 'Adelantos al Personal' },
  { cuenta: '521143', nombre: 'Severance' },
];

/**
 * Cuentas que van al asiento sin función ni departamento (pasivos). SEMILLA:
 * son las que en el asiento de Meta4 de Piano 08/09-2026 salen con
 * "00"/"Desconocido".
 */
export const LIABILITY_ACCOUNTS_SEED = ['213100', '213110', '213120', '213200', '214702'];

/**
 * Función (nombre → código). SEMILLA visible en los archivos de Meta4 de Piano
 * 08/09-2026; una función nueva del cliente se agrega por configuración.
 */
export const FUNCION_CODES_SEED = {
  'Client Technology': '66',
  'Sales': '68',
  'G&A': '69',
  'CCO_Client Services': '71',
  'Client Services': '72',
  'Finance': '73',
};

/**
 * Departamento (nombre → código). SEMILLA visible en los archivos de Meta4 de
 * Piano 08/09-2026; un departamento nuevo se agrega por configuración.
 */
export const DEPTO_CODES_SEED = {
  'Pre-Sales': '04',
  'Client Success': '08',
  'Account Management': '12',
  'Human Resources': '13',
  'Client Success Management': '14',
  'Finance': '15',
  'Product Support': '16',
  'Solution Architecture': '17',
  'Solution Consulting': '18',
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const normName = (s) => text(s).toLowerCase().replace(/\s+/g, ' ');

/**
 * El código de concepto de una columna `imp_<codigo>`. Si el Tabulado trae el
 * mismo concepto en dos columnas, el lector las emite como `<codigo>__2`: es el
 * mismo concepto y se imputa igual (el lector ya lo avisa como duplicado).
 */
function conceptCodeOf(key) {
  return key.slice(IMP_PREFIX.length).replace(/__\d+$/, '');
}

// ── 1. Contabilidad Desglosada ───────────────────────────────────────────────

/**
 * @param {object[]} tabRows  filas del Tabulado de Axton, una por liquidación.
 * @param {object}   cfg
 * @param {string}   cfg.legajoCol      columna del legajo en la fila.
 * @param {string}  [cfg.legajoKeyMode] clave de legajo del cliente (D-038).
 * @param {Array<{codigo, cuentaDebe?, cuentaHaber?}>} cfg.imputacion
 * @param {string}  [cfg.funcionCol]    columna de la función del empleado.
 * @param {string}  [cfg.deptoCol]      columna del departamento del empleado.
 * @returns {{ lines: object[], warnings: object[], error?: string }}
 *   Cada línea: { legajo, codigo, cuenta, lado, importe, funcion, depto, liquidacion }.
 *   `legajo` es la clave del cliente, no el texto crudo.
 */
export function buildDesglosadaLines(tabRows, cfg = {}) {
  const lines = [];
  const warnings = [];
  if (!cfg.legajoCol) {
    return {
      lines, warnings,
      error: 'Falta indicar en qué columna del Tabulado está el legajo: sin eso no se puede armar '
        + 'ninguna línea de la desglosada.',
    };
  }
  const rows = Array.isArray(tabRows) ? tabRows : [];
  const keyFn = makeLegajoKey(cfg.legajoKeyMode);

  // Imputación por código. Un código repetido no se resuelve en silencio con
  // el último que aparezca: se usa el primero y se avisa.
  const imputByCode = new Map();
  for (const imp of cfg.imputacion || []) {
    const codigo = text(imp?.codigo);
    if (!codigo) continue;
    if (imputByCode.has(codigo)) {
      warnings.push({ type: 'imputacion_duplicada', codigo });
      continue;
    }
    imputByCode.set(codigo, { cuentaDebe: text(imp.cuentaDebe), cuentaHaber: text(imp.cuentaHaber) });
  }

  // Función y departamento: de la ÚLTIMA liquidación de cada legajo.
  const fichaByLegajo = new Map();
  for (const [legajo, group] of groupRowsByLegajo(rows, cfg.legajoCol, { keyFn })) {
    const last = lastRow(group);
    fichaByLegajo.set(legajo, {
      funcion: cfg.funcionCol ? (text(last[cfg.funcionCol]) || null) : null,
      depto:   cfg.deptoCol   ? (text(last[cfg.deptoCol])   || null) : null,
    });
  }

  const sinImputacion = new Map();   // codigo → { legajos:Set, importe }
  const legajosConLineas = new Set();

  for (const row of rows) {
    const legajo = keyFn(row[cfg.legajoCol]);
    if (!legajo) continue;
    const ficha = fichaByLegajo.get(legajo);
    for (const key of Object.keys(row)) {
      if (!key.startsWith(IMP_PREFIX)) continue;
      const importe = toNum(row[key]);
      if (importe === null || Math.abs(importe) < VALOR_REAL_EPS) continue;
      const codigo = conceptCodeOf(key);
      const imp = imputByCode.get(codigo);

      // Una imputación sin ninguna cuenta es lo mismo que no tenerla: el
      // importe no iría a ningún lado y el asiento cerraría igual, mal.
      if (!imp || (!imp.cuentaDebe && !imp.cuentaHaber)) {
        const acc = sinImputacion.get(codigo) || { legajos: new Set(), importe: 0 };
        acc.legajos.add(legajo);
        acc.importe += importe;
        sinImputacion.set(codigo, acc);
        continue;
      }

      const base = {
        legajo, codigo, importe,
        funcion: ficha.funcion, depto: ficha.depto,
        liquidacion: row.liquidacion ?? null,
      };
      if (imp.cuentaDebe)  lines.push({ ...base, cuenta: imp.cuentaDebe,  lado: LADO_DEBE });
      if (imp.cuentaHaber) lines.push({ ...base, cuenta: imp.cuentaHaber, lado: LADO_HABER });
      legajosConLineas.add(legajo);
    }
  }

  for (const [codigo, acc] of sinImputacion) {
    warnings.push({
      type: 'sin_imputacion', codigo,
      legajos: acc.legajos.size, importe: round2(acc.importe),
    });
  }

  // Sólo importa la función/departamento de quien tiene líneas en el asiento.
  for (const legajo of legajosConLineas) {
    const { funcion, depto } = fichaByLegajo.get(legajo);
    const campos = [];
    if (funcion === null) campos.push('funcion');
    if (depto === null) campos.push('depto');
    if (campos.length) warnings.push({ type: 'sin_funcion_depto', legajo, campos });
  }

  return { lines, warnings };
}

// ── 2. Asiento agrupado ──────────────────────────────────────────────────────

/** C COSTO: el legajo con ceros a la izquierda si es numérico; si no, tal cual. */
export function cCostoOf(legajo) {
  const s = text(legajo);
  return /^\d+$/.test(s) ? s.padStart(C_COSTO_WIDTH, '0') : s;
}

function codeLookup(table) {
  const m = new Map();
  for (const [nombre, codigo] of Object.entries(table || {})) m.set(normName(nombre), text(codigo));
  return (nombre) => (nombre === null || nombre === undefined ? null : (m.get(normName(nombre)) || null));
}

/**
 * @param {object[]} lines  las líneas de `buildDesglosadaLines`.
 * @param {object}   cfg
 * @param {Set|string[]} [cfg.liabilityAccounts]  default: LIABILITY_ACCOUNTS_SEED
 * @param {object} [cfg.funcionCodes]  nombre → código; default: FUNCION_CODES_SEED
 * @param {object} [cfg.deptoCodes]    nombre → código; default: DEPTO_CODES_SEED
 * @param {object} [cfg.cuentaNombres] cuenta → nombre; default: del PLAN_CUENTAS_SEED
 * @returns {{ rows, totalDebe, totalHaber, cuadra, descuadre, warnings }}
 *   `warnings` lista los nombres de función/departamento sin código (la fila
 *   sale con el código en `null`, nunca con uno inventado).
 */
export function buildAsiento(lines, cfg = {}) {
  const liability = new Set([...(cfg.liabilityAccounts ?? LIABILITY_ACCOUNTS_SEED)].map(text));
  const funcionCode = codeLookup(cfg.funcionCodes ?? FUNCION_CODES_SEED);
  const deptoCode = codeLookup(cfg.deptoCodes ?? DEPTO_CODES_SEED);
  const cuentaNombres = cfg.cuentaNombres
    ?? Object.fromEntries(PLAN_CUENTAS_SEED.map(p => [p.cuenta, p.nombre]));

  const groups = new Map();
  for (const l of lines || []) {
    const cuenta = text(l.cuenta);
    const key = `${l.legajo}⋮${cuenta}`;
    const g = groups.get(key)
      || { legajo: l.legajo, cuenta, funcion: l.funcion ?? null, depto: l.depto ?? null, debe: 0, haber: 0 };
    if (l.lado === LADO_DEBE) g.debe += l.importe;
    else if (l.lado === LADO_HABER) g.haber += l.importe;
    groups.set(key, g);
  }

  const sinCodigo = new Map();
  const rows = [...groups.values()].map((g) => {
    // Neteo: lo que queda después de compensar los dos lados, a un solo lado.
    // Un neto 0 se emite igual (0/0): así viene el asiento de Meta4 de Piano.
    const neto = round2(g.debe - g.haber);
    const esPasivo = liability.has(g.cuenta);
    const row = {
      cuenta: g.cuenta,
      nombreCuenta: cuentaNombres[g.cuenta] ?? null,
      legajo: g.legajo,
      cCosto: cCostoOf(g.legajo),
      idFuncion: PASIVO_ID_FUNCION,
      nombreFuncion: PASIVO_NOMBRE_FUNCION,
      idDepto: '',
      nombreDepto: '',
      debe: neto > 0 ? neto : 0,
      haber: neto < 0 ? -neto : 0,
    };
    if (!esPasivo) {
      row.nombreFuncion = g.funcion;
      row.idFuncion = funcionCode(g.funcion);
      row.nombreDepto = g.depto;
      row.idDepto = deptoCode(g.depto);
      if (g.funcion !== null && row.idFuncion === null) sinCodigo.set(`funcion⋮${g.funcion}`, { type: 'funcion_sin_codigo', nombre: g.funcion });
      if (g.depto !== null && row.idDepto === null) sinCodigo.set(`depto⋮${g.depto}`, { type: 'depto_sin_codigo', nombre: g.depto });
    }
    return row;
  });

  rows.sort((a, b) =>
    a.cuenta.localeCompare(b.cuenta, 'es', { numeric: true })
    || a.cCosto.localeCompare(b.cCosto, 'es', { numeric: true }));

  const totalDebe = round2(rows.reduce((s, r) => s + r.debe, 0));
  const totalHaber = round2(rows.reduce((s, r) => s + r.haber, 0));
  const descuadre = round2(totalDebe - totalHaber);
  return {
    rows,
    totalDebe,
    totalHaber,
    cuadra: Math.abs(descuadre) <= TOL_CUADRE_ASIENTO,
    descuadre,
    warnings: [...sinCodigo.values()],
  };
}

// ── 3. Plan de cuentas ───────────────────────────────────────────────────────

/**
 * Cuentas del asiento que no están en el plan del cliente (error: el asiento no
 * se puede mandar así) y cuentas del plan que el asiento no usa (aviso).
 *
 * @param {object[]} asientoRows  filas de `buildAsiento`.
 * @param {Array<{cuenta, nombre}>} plan
 */
export function checkPlanDeCuentas(asientoRows, plan = PLAN_CUENTAS_SEED) {
  const enPlan = (plan || []).map(p => text(p.cuenta)).filter(Boolean);
  const planSet = new Set(enPlan);
  const usadas = new Set((asientoRows || []).map(r => text(r.cuenta)).filter(Boolean));
  return {
    fueraDelPlan: [...usadas].filter(c => !planSet.has(c)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
    noUsadas: [...new Set(enPlan)].filter(c => !usadas.has(c)),
  };
}
