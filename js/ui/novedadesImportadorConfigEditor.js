// novedadesImportadorConfigEditor.js — El panel del Paso 2 del generador de importador
//
// Dos decisiones del analista, las dos imposibles de resolver desde el archivo:
//
//   1. **Qué concepto es cada columna que no trae código.** El rótulo en criollo
//      no identifica nada (D-039): hay 17 códigos con rótulo distinto entre dos
//      archivos del mismo cliente y del mismo mes. Así que acá el analista pone
//      el código, o marca la columna como "no va al importador". Si el cliente
//      tiene su catálogo de conceptos cargado en la app, el panel **sugiere** el
//      código que matchea el rótulo — la sugerencia se ve, se puede clickear y
//      no entra al importador hasta que se la confirma.
//   2. **La unidad organizativa del importador**, cuando la planilla no la trae
//      (Epiroc, Merz y Geopagos declaran Empresa y no UO).
//
// El mapeo se guarda **por rótulo**, no por letra de columna: el juego de
// conceptos cambia mes a mes y se corre de columna (Epiroc pasó de 12 a 11 entre
// junio y julio). Una config por posición quedaría mal al mes siguiente sin que
// nada avise.
//
// Está acá y no en el módulo del control porque es pantalla y no cálculo, igual
// que los otros editores de config del Paso 2.

import { DEFAULT_NOVEDADES_CONFIG, normalizarRotulo } from '../controls/novedadesImportador.js';

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {object}   [opts.config]         valor guardado del cliente
 * @param {boolean}  [opts.openByDefault]
 * @param {function} [opts.onChange]       recibe la config nueva completa
 * @param {object}   [opts.meta]           parseMetadata de la planilla cargada
 * @param {object[]} [opts.catalogRows]    catálogo de conceptos del cliente, si lo cargó
 */
export function renderNovedadesImportadorConfigEditor(container, opts = {}) {
  const {
    config = DEFAULT_NOVEDADES_CONFIG(),
    openByDefault = false,
    onChange = () => {},
    meta = null,
    catalogRows = [],
  } = opts;

  const current = { ...DEFAULT_NOVEDADES_CONFIG(), ...config };
  current.codigoPorRotulo  = { ...(current.codigoPorRotulo || {}) };
  current.rotulosExcluidos = [...(current.rotulosExcluidos || [])];

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  const sinCodigo = (meta?.columnasSinCodigo || []).filter(c => (c.celdasCargadas || 0) > 0);
  const conCodigo = meta?.columnas || [];

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Conceptos y unidad organizativa del importador
    </summary>
    <div style="margin-top:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:flex-start;">
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Nº de unidad organizativa</span>
        <input type="text" class="form-input form-input--sm" style="max-width:120px;"
               data-nov-uo-nro value="${esc(current.uoNro)}" autocomplete="off">
      </label>
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Nombre de la unidad organizativa</span>
        <input type="text" class="form-input form-input--sm" style="max-width:260px;"
               data-nov-uo-nombre value="${esc(current.uoNombre)}" autocomplete="off">
      </label>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:46ch;margin:0;">
        ${uoAyuda(meta)}
      </p>
    </div>
    <div data-nov-columnas style="margin-top:var(--sp-4);"></div>
  `;

  const columnasEl = editor.querySelector('[data-nov-columnas]');

  editor.querySelector('[data-nov-uo-nro]').addEventListener('input', (e) => {
    current.uoNro = String(e.target.value || '').trim();
    onChange(copia(current));
  });
  editor.querySelector('[data-nov-uo-nombre]').addEventListener('input', (e) => {
    current.uoNombre = String(e.target.value || '').trim();
    onChange(copia(current));
  });

  function pintarColumnas() {
    if (!meta) {
      columnasEl.innerHTML = `
        <p class="text-muted" style="font-size:var(--text-sm);margin:0;">
          Cargá la planilla de novedades y acá aparecen sus columnas: las que traen código entran
          derecho al importador, y las que no, para resolverlas.
        </p>`;
      return;
    }

    columnasEl.innerHTML = `
      <p style="font-size:var(--text-sm);margin:0 0 var(--sp-2);">
        <strong>${conCodigo.length}</strong> columna${conCodigo.length === 1 ? '' : 's'} con código
        entra${conCodigo.length === 1 ? '' : 'n'} al importador tal como viene${conCodigo.length === 1 ? '' : 'n'}.
        ${sinCodigo.length === 0
          ? 'Ninguna columna con datos quedó sin código.'
          : `<strong>${sinCodigo.length}</strong> columna${sinCodigo.length === 1 ? '' : 's'} con datos cargados no trae código: sin resolverla${sinCodigo.length === 1 ? '' : 's'}, no entra${sinCodigo.length === 1 ? '' : 'n'}.`}
      </p>
      ${sinCodigo.length === 0 ? '' : `
        <table class="data-table data-table--compact" style="margin-top:var(--sp-2);">
          <thead>
            <tr>
              <th>Columna</th><th>Rótulo en la planilla</th><th style="text-align:right;">Celdas</th>
              <th>Código de concepto</th><th>No va al importador</th>
            </tr>
          </thead>
          <tbody>
            ${sinCodigo.map(c => renderFila(c, current, catalogRows)).join('')}
          </tbody>
        </table>
        <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-2) 0 0;">
          El rótulo en criollo no alcanza para decidir el concepto: dos archivos del mismo cliente
          y del mismo mes le ponen nombres distintos al mismo código. Por eso el código lo confirmás
          vos, aunque el catálogo lo sugiera. Lo que quede sin resolver sale listado en el resultado
          como «quedó afuera», con el motivo.
        </p>
      `}
    `;

    for (const input of columnasEl.querySelectorAll('[data-nov-codigo]')) {
      input.addEventListener('input', (e) => {
        const clave = e.target.dataset.novCodigo;
        const cod   = String(e.target.value || '').trim();
        if (cod) current.codigoPorRotulo[clave] = cod;
        else     delete current.codigoPorRotulo[clave];
        onChange(copia(current));
      });
    }
    for (const chk of columnasEl.querySelectorAll('[data-nov-excluir]')) {
      chk.addEventListener('change', (e) => {
        const clave = e.target.dataset.novExcluir;
        const set   = new Set(current.rotulosExcluidos.map(normalizarRotulo));
        if (e.target.checked) set.add(clave); else set.delete(clave);
        current.rotulosExcluidos = [...set];
        onChange(copia(current));
        pintarColumnas();
      });
    }
    for (const btn of columnasEl.querySelectorAll('[data-nov-sugerido]')) {
      btn.addEventListener('click', (e) => {
        const clave = e.target.dataset.novSugerido;
        const cod   = e.target.dataset.novCod;
        current.codigoPorRotulo[clave] = cod;
        onChange(copia(current));
        pintarColumnas();
      });
    }
  }

  pintarColumnas();
  container.appendChild(editor);
}

function renderFila(c, current, catalogRows) {
  const clave     = normalizarRotulo(c.rotulo);
  const excluida  = current.rotulosExcluidos.map(normalizarRotulo).includes(clave);
  const asignado  = current.codigoPorRotulo[clave] || '';
  const sugerido  = asignado ? null : sugerirCodigo(c.rotulo, catalogRows);

  return `
    <tr${excluida ? ' style="opacity:.55;"' : ''}>
      <td>${esc(c.letra)}</td>
      <td>${esc(c.rotulo || '(sin rótulo)')}</td>
      <td style="text-align:right;">${c.celdasCargadas}</td>
      <td>
        <input type="text" class="form-input form-input--sm" style="max-width:110px;"
               data-nov-codigo="${esc(clave)}" value="${esc(asignado)}" autocomplete="off"
               ${excluida ? 'disabled' : ''}>
        ${sugerido && !excluida ? `
          <button type="button" class="btn btn--ghost btn--sm" style="margin-left:var(--sp-2);"
                  data-nov-sugerido="${esc(clave)}" data-nov-cod="${esc(sugerido.codigo)}"
                  title="Del catálogo de conceptos del cliente: ${esc(sugerido.descripcion)}">
            ¿${esc(sugerido.codigo)}?
          </button>` : ''}
      </td>
      <td>
        <input type="checkbox" data-nov-excluir="${esc(clave)}" ${excluida ? 'checked' : ''}>
      </td>
    </tr>
  `;
}

/**
 * Sugerencia del catálogo de conceptos del cliente: el código cuyo nombre (o
 * alguno de sus alias) coincide con el rótulo de la columna. Es una SUGERENCIA
 * y nada más — el código entra al importador recién cuando el analista lo
 * confirma (D-039). Match exacto sobre el rótulo normalizado: uno parcial
 * ("COCHERA" agarra `4899-COCHERA_IG` y `8805-DTO_COCHERA`) propone el concepto
 * equivocado con la misma cara de acierto.
 */
export function sugerirCodigo(rotulo, catalogRows = []) {
  const clave = normalizarRotulo(rotulo);
  if (!clave) return null;
  for (const r of catalogRows) {
    const nombres = [r.descripcion, ...(r.alias || [])].map(normalizarRotulo);
    if (nombres.includes(clave)) return { codigo: r.codigo, descripcion: r.descripcion };
  }
  return null;
}

function uoAyuda(meta) {
  if (meta?.unidadOrganizativa) {
    const { numero, nombre } = meta.unidadOrganizativa;
    return `La planilla declara «${[numero, nombre].filter(Boolean).join(' — ')}». `
      + 'Dejalo vacío para usar ésa, o escribila acá para pisarla.';
  }
  if (meta?.empresa) {
    return `La planilla declara la empresa «${meta.empresa}» y no una unidad organizativa. `
      + 'Si el importador tiene que llevar UO, cargala acá.';
  }
  return 'La planilla no declara unidad organizativa. Si no la cargás acá, el importador sale sin ella '
    + 'y el resultado lo avisa.';
}

/** Copia nueva: el wizard guarda lo que le llega y el editor sigue mutando lo suyo. */
function copia(cfg) {
  return {
    ...cfg,
    codigoPorRotulo:  { ...cfg.codigoPorRotulo },
    rotulosExcluidos: [...cfg.rotulosExcluidos],
  };
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
