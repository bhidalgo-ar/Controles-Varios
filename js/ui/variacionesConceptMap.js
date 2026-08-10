// variacionesConceptMap.js — Panel "Conceptos a comparar" del control de Variaciones
//
// El código de concepto (2517, 899999, …) dejó de ser identificador y pasó a ser
// precarga: acá el analista confirma, para CADA uno de los dos tabulados, qué
// columna representa cada concepto. Si el cliente renumera o renombra un
// concepto se arregla desde esta pantalla, sin tocar el código del control.
//
// Reglas de la pantalla (ver specs/reporte-variaciones-opmobility.md):
//   - Lo que se detectó en los dos archivos viene RESUELTO Y PLEGADO. Ocho
//     selectores con 84 opciones cada uno es exactamente lo que hay que evitar.
//   - Sólo se abre solo lo que necesita una decisión, y el wizard no deja
//     avanzar hasta que esté: no hay default silencioso.
//   - "No se liquidó en este período" es una opción explícita — se computa 0,00
//     y sale como aviso, pero como decisión del analista y no como silencio del
//     parser.
//   - El selector es un <input list> nativo con datalist: escribís "premio" y
//     filtra sobre los 83/84 encabezados. `initSearchCombobox` de tableTools.js
//     NO sirve acá — filtra filas de una tabla, no es un picker de columnas.
//
// La lista de conceptos en sí (agregar/sacar) todavía no se edita desde acá:
// sale de la config del cliente, sembrada con los códigos de siempre. Ver
// ROADMAP.md — "Editor de conceptos y causas de ausencia".

import { VARIACIONES_SUELDOS_CONCEPTS, VARIACIONES_CONCEPTOS_CONCEPTS } from '../controls/variaciones.js';

/** Valor centinela de "el concepto no se liquidó en este período". */
export const NO_LIQUIDADO = '__no_liquidado__';

const VARIACIONES_IDS = ['variaciones_sueldos', 'variaciones_conceptos'];

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Código del encabezado: "2517 - Premio de progreso" → "2517". */
const codigoDeHeader = h => (String(h ?? '').match(/^(\d+)\s*-\s*/) || [])[1] || null;

/** Identidad de una entrada de concepto — igual que en variaciones.js. */
export const entryId = e => e.codigo || e.nombre || e.label;

/**
 * Conceptos que hay que confirmar, según qué controles se seleccionaron y qué
 * dice la config del cliente. Devuelve dos grupos porque los dos controles se
 * muestran juntos pero se comportan distinto (Sueldos suma en una columna).
 *
 * @param {string[]} selectedControls
 * @param {object|null} config  params de `variaciones_config` del cliente
 */
export function conceptosDeControles(selectedControls, config) {
  const grupos = [];
  if (selectedControls.includes('variaciones_sueldos')) {
    grupos.push({
      clave: 'sueldos',
      titulo: 'Variación Sueldos',
      nota: 'todos se suman en UNA sola columna del reporte',
      entradas: config?.sueldos?.length ? config.sueldos : VARIACIONES_SUELDOS_CONCEPTS,
    });
  }
  if (selectedControls.includes('variaciones_conceptos')) {
    grupos.push({
      clave: 'conceptos',
      titulo: 'Variación Conceptos',
      nota: 'una sección del reporte por cada uno',
      entradas: config?.conceptos?.length ? config.conceptos : VARIACIONES_CONCEPTOS_CONCEPTS,
    });
  }
  return grupos;
}

/** ¿Hay algún control de Variaciones seleccionado? */
export const hayVariaciones = selectedControls =>
  selectedControls.some(id => VARIACIONES_IDS.includes(id));

export { VARIACIONES_IDS };

/**
 * Columna precargada para una entrada en un archivo.
 * Precedencia: lo confirmado en una corrida anterior (si esa columna existe en
 * este archivo) → match por código → match por nombre exacto → sin resolver.
 *
 * @returns {string|null}
 */
export function precargar(headers, entrada, guardado) {
  if (!Array.isArray(headers) || headers.length === 0) return null;
  const id = entryId(entrada);

  const previo = guardado?.[id];
  if (previo === NO_LIQUIDADO) return NO_LIQUIDADO;
  if (previo && headers.includes(previo)) return previo;

  if (entrada.codigo) {
    const porCodigo = headers.find(h => codigoDeHeader(h) === entrada.codigo);
    if (porCodigo) return porCodigo;
  }
  if (entrada.nombre && headers.includes(entrada.nombre)) return entrada.nombre;
  return null;
}

/**
 * Estado inicial del mapeo: { anterior: {id: col|NO_LIQUIDADO|null}, actual: {...} }
 *
 * @param {object} opts
 * @param {Array}  opts.grupos    salida de `conceptosDeControles`
 * @param {string[]} opts.headersAnterior
 * @param {string[]} opts.headersActual
 * @param {object|null} opts.guardado  mapeo confirmado en una corrida anterior
 */
export function estadoInicial({ grupos, headersAnterior, headersActual, guardado }) {
  const estado = { anterior: {}, actual: {} };
  for (const g of grupos) {
    for (const e of g.entradas) {
      const id = entryId(e);
      estado.anterior[id] = precargar(headersAnterior, e, guardado);
      estado.actual[id]   = precargar(headersActual, e, guardado);
    }
  }
  return estado;
}

/** Entradas que todavía no tienen una decisión en los dos archivos. */
export function pendientes(grupos, estado) {
  const faltan = [];
  for (const g of grupos) {
    for (const e of g.entradas) {
      const id = entryId(e);
      if (!estado.anterior?.[id]) faltan.push({ entrada: e, lado: 'anterior' });
      if (!estado.actual?.[id])   faltan.push({ entrada: e, lado: 'actual' });
    }
  }
  return faltan;
}

/**
 * Traduce el estado de la pantalla al formato que consume el control:
 * `{ [entryId]: nombreDeColumna | null }`, donde null = "no se liquidó".
 */
export function aColumnasDelControl(lado) {
  const out = {};
  for (const [id, v] of Object.entries(lado || {})) {
    out[id] = v === NO_LIQUIDADO ? null : (v || null);
  }
  return out;
}

// ── Render ───────────────────────────────────────────────────────────────────

let datalistSeq = 0;

/**
 * Dibuja el panel completo.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {Array}  opts.grupos
 * @param {{headers: string[], label: string}} opts.anterior
 * @param {{headers: string[], label: string}} opts.actual
 * @param {object} opts.estado      mutado in place al confirmar
 * @param {Function} opts.onChange  se llama después de cada cambio
 */
export function renderConceptMap(container, { grupos, anterior, actual, estado, onChange }) {
  const abiertos = new Set();
  const errores = {};   // `${lado}:${id}` → mensaje

  const idsDatalist = {
    anterior: `js-dl-var-ant-${++datalistSeq}`,
    actual:   `js-dl-var-act-${datalistSeq}`,
  };

  function datalistHtml(lado, headers) {
    // Los conceptos (con código) primero: son lo que se busca el 99% de las veces.
    const conCodigo = headers.filter(h => codigoDeHeader(h));
    const resto     = headers.filter(h => !codigoDeHeader(h));
    return `<datalist id="${idsDatalist[lado]}">
      ${[...conCodigo, ...resto].map(h => `<option value="${esc(h)}"></option>`).join('')}
    </datalist>`;
  }

  function pickHtml(lado, info, entrada) {
    const id = entryId(entrada);
    const v = estado[lado][id];
    const err = errores[`${lado}:${id}`];
    const noLiq = v === NO_LIQUIDADO;
    const clase = err ? 'is-error' : noLiq ? 'is-none' : v ? 'is-ok' : '';
    return `
      <div class="varmap__pick">
        <label class="varmap__picklabel">${esc(info.label)}</label>
        <div class="varmap__pickrow">
          <input type="text" list="${idsDatalist[lado]}" class="form-input form-input--sm varmap__input ${clase}"
                 placeholder="— elegir —" value="${esc(noLiq ? '' : (v || ''))}"
                 data-pick="${esc(lado)}" data-entry="${esc(id)}"
                 aria-label="Columna de ${esc(entrada.label)} en ${esc(info.label)}"
                 ${noLiq ? 'disabled' : ''}>
          <button type="button" class="btn btn--sm varmap__none" data-none="${esc(lado)}" data-entry="${esc(id)}"
                  aria-pressed="${noLiq}" title="No se liquidó en este período">⊘</button>
        </div>
        ${noLiq ? '<div class="varmap__hint">No se liquidó en este período — se computa 0,00.</div>' : ''}
        ${err ? `<div class="varmap__error">${esc(err)}</div>` : ''}
      </div>`;
  }

  function filaHtml(entrada) {
    const id = entryId(entrada);
    const vAnt = estado.anterior[id];
    const vAct = estado.actual[id];
    const hayError = errores[`anterior:${id}`] || errores[`actual:${id}`];
    const resuelto = !hayError && vAnt && vAct;
    const abierto = abiertos.has(id) || !resuelto;

    const nNoLiq = [vAnt, vAct].filter(v => v === NO_LIQUIDADO).length;
    let estadoTxt;
    if (hayError) estadoTxt = 'Esa columna no está en el archivo';
    else if (!resuelto) estadoTxt = 'Falta elegir la columna';
    else if (nNoLiq === 2) estadoTxt = 'No se liquidó en ninguno de los dos';
    else if (nNoLiq === 1) estadoTxt = 'No se liquidó en uno de los dos';
    else estadoTxt = 'Detectado en los dos archivos';

    return `
      <div class="varmap__row ${resuelto ? 'varmap__row--ok' : 'varmap__row--warn'}">
        <div class="varmap__top">
          <span class="varmap__ico" aria-hidden="true">${resuelto ? '✓' : '!'}</span>
          <span class="varmap__name">${esc(entrada.label)}</span>
          ${entrada.codigo ? `<code class="varmap__code">${esc(entrada.codigo)}</code>` : ''}
          <span class="varmap__state">${esc(estadoTxt)}</span>
          ${resuelto ? `<button type="button" class="varmap__link" data-toggle="${esc(id)}">${abierto ? 'listo' : 'cambiar'}</button>` : ''}
        </div>
        ${abierto ? `<div class="varmap__body">
          ${pickHtml('anterior', anterior, entrada)}
          ${pickHtml('actual', actual, entrada)}
        </div>` : ''}
      </div>`;
  }

  function render() {
    container.innerHTML = `
      ${datalistHtml('anterior', anterior.headers)}
      ${datalistHtml('actual', actual.headers)}
      <div class="varmap">
        <div class="varmap__head">
          <h4>Conceptos a comparar</h4>
          <span class="text-muted">Lo detectado viene resuelto y plegado. Sólo se abre lo que necesita una decisión tuya.</span>
        </div>
        ${grupos.map(g => `
          <div class="varmap__group">
            <div class="varmap__grouphead">
              <strong>${esc(g.titulo)}</strong>
              <span class="text-muted">${esc(g.nota)}</span>
            </div>
            ${g.entradas.map(filaHtml).join('')}
          </div>
        `).join('')}
      </div>`;
  }

  function confirmar(lado, id, valor) {
    const clave = `${lado}:${id}`;
    const headers = (lado === 'anterior' ? anterior : actual).headers;
    const texto = String(valor || '').trim();

    if (texto === '') { estado[lado][id] = null; delete errores[clave]; }
    else if (headers.includes(texto)) { estado[lado][id] = texto; delete errores[clave]; }
    else { errores[clave] = `"${texto}" no es una columna de este archivo. Elegí una de la lista.`; }

    render();
    onChange?.();
  }

  container.addEventListener('click', (ev) => {
    const toggle = ev.target.closest('[data-toggle]');
    if (toggle) {
      const id = toggle.dataset.toggle;
      abiertos.has(id) ? abiertos.delete(id) : abiertos.add(id);
      render();
      return;
    }
    const none = ev.target.closest('[data-none]');
    if (none) {
      const { none: lado, entry: id } = none.dataset;
      estado[lado][id] = estado[lado][id] === NO_LIQUIDADO ? null : NO_LIQUIDADO;
      delete errores[`${lado}:${id}`];
      render();
      onChange?.();
    }
  });

  container.addEventListener('change', (ev) => {
    const input = ev.target.closest('[data-pick]');
    if (!input) return;
    confirmar(input.dataset.pick, input.dataset.entry, input.value);
  });

  render();
}
