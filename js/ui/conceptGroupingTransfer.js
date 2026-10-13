// conceptGroupingTransfer.js — La agrupación de conceptos de Rendimiento como
// texto, para pasarla de mano en mano.
//
// El analista edita la agrupación en el Paso 2 y queda guardada sólo en SU
// navegador. Para que Willy la revise y la publique (con "Exportar seed", desde
// Administración), el analista la copia como texto, la manda por ticket, y la
// vuelta —la corregida— se pega en la misma pantalla. Este módulo es sólo el
// formato: armar el texto y validar el que se pega. No toca el DOM, así que se
// prueba en node (tests/conceptGroupingTransfer.test.js).
//
// Lleva la agrupación y nada más: códigos de concepto y signos, que son
// configuración. Ningún dato de empleados.

import { DEFAULT_CONCEPT_CONFIG } from '../controls/rendVsTabu.js';

/** Lo que identifica el texto como una agrupación de Rendimiento. */
export const GROUPING_TRANSFER_TYPE = 'agrupacion-conceptos-rendimiento';
const VERSION = 1;

// Las cinco categorías, en el orden de la semilla. Son las claves que lee el
// control: una de más o de menos no es una agrupación de Rendimiento.
const CATEGORIES = Object.keys(DEFAULT_CONCEPT_CONFIG);

/**
 * El texto que se copia: JSON legible, con un envoltorio que dice qué es, de qué
 * cliente salió y cuándo, y un concepto por renglón.
 *
 * @param {object} grouping — { precio: [{ code, sign }], … }
 * @param {{ clientCode?: string|null, now?: Date }} [opts]
 * @returns {string}
 */
export function serializeConceptGrouping(grouping, { clientCode = null, now = new Date() } = {}) {
  const agrupacion = {};
  for (const cat of CATEGORIES) {
    agrupacion[cat] = (grouping?.[cat] || []).map(e => ({ code: String(e.code), sign: e.sign }));
  }
  const envelope = {
    tipo:    GROUPING_TRANSFER_TYPE,
    version: VERSION,
    cliente: clientCode || null,
    copiado: now.toISOString(),
    agrupacion,
  };
  // Un concepto por renglón: con el indentado de JSON.stringify cada uno ocupa
  // cuatro, y una agrupación de 40 conceptos no se puede leer en un ticket.
  return JSON.stringify(envelope, null, 2)
    .replace(/\{\s*"code": ("[^"]*"),\s*"sign": (-?\d+)\s*\}/g, '{ "code": $1, "sign": $2 }');
}

/** Cómo se nombra un valor en un mensaje de error: qué se encontró. */
function describir(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'una lista';
  if (typeof v === 'object') return 'un objeto';
  if (typeof v === 'string') return `el texto "${v.length > 30 ? `${v.slice(0, 30)}…` : v}"`;
  return `el valor ${String(v)}`;
}

/**
 * Lee el texto pegado. Devuelve la agrupación lista para usar, o el primer
 * problema que encontró — nunca una agrupación a medias.
 *
 * @param {string} text
 * @returns {{ ok: true, grouping: object, clientCode: string|null }
 *         | { ok: false, error: string }}
 */
export function parseConceptGroupingTransfer(text) {
  const fail = (error) => ({ ok: false, error });

  const raw = String(text ?? '').trim();
  if (!raw) return fail('No hay nada pegado. Pegá el texto que se copió con «Copiar configuración».');

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail('El texto pegado no se puede leer: se esperaba el texto completo que arma '
      + '«Copiar configuración» (empieza con «{» y termina con «}»). Puede haber quedado '
      + 'cortado al copiarlo o tener algo de más.');
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return fail(`Se esperaba una configuración copiada con «Copiar configuración» y se encontró ${describir(data)}.`);
  }
  if (data.tipo !== GROUPING_TRANSFER_TYPE) {
    return fail('Esto no es una agrupación de conceptos de Rendimiento: se esperaba '
      + `"tipo": "${GROUPING_TRANSFER_TYPE}" y se encontró `
      + `${data.tipo === undefined ? 'que no dice de qué tipo es' : describir(data.tipo)}.`);
  }

  const ag = data.agrupacion;
  if (!ag || typeof ag !== 'object' || Array.isArray(ag)) {
    return fail('Falta la agrupación: se esperaba "agrupacion" con las cinco categorías '
      + `(${CATEGORIES.join(', ')}) y se encontró ${ag === undefined ? 'que no está' : describir(ag)}.`);
  }

  const desconocidas = Object.keys(ag).filter(k => !CATEGORIES.includes(k));
  if (desconocidas.length > 0) {
    return fail(`La agrupación trae ${desconocidas.length === 1 ? 'una categoría que no existe' : 'categorías que no existen'}: `
      + `${desconocidas.join(', ')}. Se esperaban sólo: ${CATEGORIES.join(', ')}.`);
  }
  const faltan = CATEGORIES.filter(k => !(k in ag));
  if (faltan.length > 0) {
    return fail(`A la agrupación le ${faltan.length === 1 ? 'falta la categoría' : 'faltan las categorías'} `
      + `${faltan.join(', ')}. Se esperaban las cinco (una lista vacía si no lleva conceptos).`);
  }

  const grouping = {};
  for (const cat of CATEGORIES) {
    const entries = ag[cat];
    if (!Array.isArray(entries)) {
      return fail(`En "${cat}" se esperaba una lista de conceptos y se encontró ${describir(entries)}.`);
    }
    const vistos = new Set();
    grouping[cat] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const donde = `En "${cat}", el concepto ${i + 1}`;
      if (!e || typeof e !== 'object' || Array.isArray(e)) {
        return fail(`${donde}: se esperaba { "code": "1003", "sign": 1 } y se encontró ${describir(e)}.`);
      }
      // El código se acepta como número también: es lo que queda si alguien
      // edita el texto a mano y le saca las comillas.
      const code = typeof e.code === 'number' && Number.isInteger(e.code) && e.code >= 0
        ? String(e.code)
        : typeof e.code === 'string' ? e.code.trim() : null;
      if (!code || !/^\d+$/.test(code)) {
        return fail(`${donde}: el código tiene que ser sólo números (como "1003") y se encontró `
          + `${e.code === undefined ? 'que no tiene código' : describir(e.code)}.`);
      }
      if (e.sign !== 1 && e.sign !== -1) {
        return fail(`${donde} (${code}): el signo tiene que ser 1 (suma) o -1 (resta) y se encontró `
          + `${e.sign === undefined ? 'que no tiene signo' : describir(e.sign)}.`);
      }
      if (vistos.has(code)) {
        return fail(`En "${cat}" el código ${code} aparece dos veces: se sumaría dos veces. `
          + 'Dejalo una sola vez.');
      }
      vistos.add(code);
      grouping[cat].push({ code, sign: e.sign });
    }
  }

  const clientCode = typeof data.cliente === 'string' && data.cliente.trim() ? data.cliente.trim() : null;
  return { ok: true, grouping, clientCode };
}
