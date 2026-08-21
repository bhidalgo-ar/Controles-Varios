// fichaList.js — La ficha estándar de la vista de resultados (§4 de
// specs/vista-estandar-resultados.md): una tarjeta desplegable por unidad
// —legajo, centro de costo, cuenta contable o lista de acreditación, según lo
// que el control declare en `unit`— donde se entiende POR QUÉ un caso no cierra.
//
// La planilla sirve para comparar entre casos; la ficha, para entender uno. Diez
// de los 21 controles la justifican (legajo × concepto, legajo × agrupador,
// cuenta contable), y hasta acá existía una sola, de primera generación, con los
// estilos escritos adentro del módulo de Acumuladores. Acá está una vez.
//
// **`<details>`/`<summary>` nativo**, a propósito: funciona sin JS, se navega
// con teclado, se pueden abrir varias a la vez, y el Ctrl+F del navegador
// encuentra lo que está abierto. El cuerpo se dibuja al PRIMER despliegue, no al
// pintar la lista: con 500 legajos, dibujar 500 cuerpos que nadie va a abrir es
// medio segundo de pantalla congelada.
//
// Dos cosas que ya costaron caro y no se repiten (las dos están en la spec):
//   - cada ficha lleva `flex: none` (css/results.css). Sin eso, en una lista
//     flex las tarjetas se comprimen entre sí y el contenido se corta — el bug
//     que ya se arregló una vez en Acumuladores.
//   - el hover NO usa `transform`: movería la lista entera abajo del mouse.

import {
  createResultsToolbar, createEstadoFilter, wireListTools, initSearchCombobox,
} from './tableTools.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Importe con cifras de ancho fijo; ausencia de dato es `—`, nunca `0,00`. */
function fmtAmount(v, decimals = 2) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** El valor de una celda de la ficha: un texto se muestra tal cual, un importe
 *  se formatea, y lo que no existe sale como `—` (nunca vacío ni 0,00). */
function fmtCell(v) {
  return typeof v === 'string' ? v : fmtAmount(v);
}

function fmtInt(n) {
  return Math.round(n || 0).toLocaleString('es-AR');
}

// ── La tarjeta cerrada ──────────────────────────────────────────────────────
//
// Descriptor de una ficha:
//   id          — clave de la unidad (el legajo, la cuenta, la lista)
//   unit        — lo que va adentro del avatar (default: `id`)
//   severity    — 'error' | 'warn' | 'info' | 'ok': el gradiente del avatar.
//                 Rojo arriba del monto, ámbar a revisar / sin comparar,
//                 celeste dentro del margen, verde lo que cerró.
//   name        — la línea de identidad
//   tag         — { text, tone? }: el contexto que identifica (empresa, CC, cuenta)
//   badge       — { text, tone?, title? }: la causa principal, en una línea. El
//                 `title` lleva el texto entero cuando el `text` viene recortado.
//   context     — [string]: la línea gris, separada por '·' (categoría, antigüedad…)
//   marks       — [{ text, tone?: 'info'|'neutral', title? }]: el segundo eje —
//                 qué MÁS le pasa al caso, que no es cómo cerró
//   amountLabel — rótulo chico en mayúsculas ('RESIDUO', 'SAC TEÓRICO')
//   amount      — el importe grande de la derecha
//   amountTone  — 'error' | 'warn' | 'ok' | undefined
//   body        — lo de abajo (ver fichaBodyHtml)

/**
 * @param {object} ficha
 * @returns {string} el HTML de la tarjeta CERRADA (el cuerpo se dibuja al abrir)
 */
export function fichaCardHtml(ficha) {
  const sev = ficha.severity || 'info';
  const marks = ficha.marks || [];
  const ctx = (ficha.context || []).filter(Boolean);

  return `
    <details class="ficha ficha--${esc(sev)}" data-ficha-id="${esc(ficha.id)}">
      <summary class="ficha__head">
        <span class="ficha__avatar ficha__avatar--${esc(sev)}" aria-hidden="true">${esc(ficha.unit ?? ficha.id)}</span>
        <span class="ficha__main">
          <span class="ficha__identity">
            <span class="ficha__name">${esc(ficha.name ?? '')}</span>
            ${ficha.tag ? `<span class="ficha__tag${ficha.tag.tone ? ` ficha__tag--${esc(ficha.tag.tone)}` : ''}">${esc(ficha.tag.text)}</span>` : ''}
            ${ficha.badge ? `<span class="ficha__badge ficha__badge--${esc(ficha.badge.tone || sev)}"${
              ficha.badge.title ? ` title="${esc(ficha.badge.title)}"` : ''}>${esc(ficha.badge.text)}</span>` : ''}
          </span>
          ${ctx.length ? `<span class="ficha__ctx">${ctx.map(c => esc(c)).join(' · ')}</span>` : ''}
          ${marks.length ? `<span class="ficha__marks">${marks.map(m => `
            <span class="ficha__mark ficha__mark--${esc(m.tone || 'neutral')}"${m.title ? ` title="${esc(m.title)}"` : ''}>${esc(m.text)}</span>
          `).join('')}</span>` : ''}
        </span>
        <span class="ficha__right">
          ${ficha.amountLabel ? `<span class="ficha__amount-label">${esc(ficha.amountLabel)}</span>` : ''}
          <span class="ficha__amount${ficha.amountTone ? ` ficha__amount--${esc(ficha.amountTone)}` : ''}">${esc(fmtAmount(ficha.amount))}</span>
        </span>
        <span class="ficha__caret" aria-hidden="true">⌄</span>
      </summary>
      <div class="ficha__body" data-ficha-body></div>
    </details>
  `;
}

// ── La tarjeta abierta: cuatro bloques, en este orden ───────────────────────
//
// La TIRA de conciliación y la CONCLUSIÓN son obligatorias; las dos tablas y la
// tabla de detalle son opcionales, según lo que el control tenga para mostrar.
// Que la tira y la conclusión sean obligatorias no es una formalidad: la tira es
// de dónde sale el número y la conclusión es qué hacer con él. Una ficha que
// abre y sólo muestra tablas deja al analista con el mismo trabajo que antes.
//
//   body = {
//     strip:      [{ label, value, tone?, invert?: true, residuo?: true }],
//     tables:     [{ title, rows: [{ label, code?, value }], foot? }],  // 0 a 2
//     detail:     { title?, columns: [{ key, label, num? }], rows, foot? },
//     conclusion: { tone?, title, text },
//   }

/** @returns {string} el HTML del cuerpo. Tira y conclusión son obligatorias. */
export function fichaBodyHtml(body, { id } = {}) {
  // Un default silencioso es un bug: si un control declara una ficha sin la tira
  // o sin la conclusión, no se dibuja media ficha — se dice acá, donde se
  // programa, y no en la pantalla del analista.
  if (!body) throw new Error(`La ficha ${id ?? ''} no declara cuerpo: la tira de conciliación y la conclusión son obligatorias (§4).`);
  if (!body.strip?.length) throw new Error(`La ficha ${id ?? ''} no declara la tira de conciliación, que es obligatoria (§4).`);
  if (!body.conclusion) throw new Error(`La ficha ${id ?? ''} no declara la conclusión, que es obligatoria (§4): no un resumen, una instrucción.`);

  const tables = (body.tables || []).slice(0, 2);
  return `
    ${stripHtml(body.strip)}
    ${tables.length ? `<div class="ficha-tables">${tables.map(tableHtml).join('')}</div>` : ''}
    ${body.detail ? detailHtml(body.detail) : ''}
    ${conclusionHtml(body.conclusion)}
  `;
}

/** La cascada en pastillas, de lo teórico a lo que sobra. */
function stripHtml(steps) {
  return `
    <div class="ficha-strip">
      ${steps.map((s, i) => `
        ${i > 0 ? '<span class="ficha-strip__op" aria-hidden="true">→</span>' : ''}
        <span class="ficha-strip__pill${s.invert ? ' ficha-strip__pill--invert' : ''}${
          s.residuo ? ' ficha-strip__pill--residuo' : ''}${s.tone ? ` ficha-strip__pill--${esc(s.tone)}` : ''}">
          <span class="ficha-strip__label">${esc(s.label)}</span>
          <span class="ficha-strip__value">${esc(fmtCell(s.value))}</span>
        </span>
      `).join('')}
    </div>
  `;
}

/** Una de las dos tablas: a la izquierda cómo debería ser, a la derecha cómo salió. */
function tableHtml(t) {
  return `
    <div class="ficha-table">
      <div class="ficha-table__title">${esc(t.title)}</div>
      <table class="ficha-table__grid">
        <tbody>
          ${(t.rows || []).map(r => `
            <tr>
              <td>${esc(r.label)}${r.code ? ` <span class="ficha-table__code">(${esc(r.code)})</span>` : ''}</td>
              <td class="ficha-table__num">${esc(fmtCell(r.value))}</td>
            </tr>
          `).join('')}
        </tbody>
        ${t.foot ? `<tfoot>
          <tr class="ficha-table__foot ficha-table__foot--${esc(t.foot.tone || 'ink')}">
            <td>${esc(t.foot.label)}</td>
            <td class="ficha-table__num">${esc(fmtCell(t.foot.value))}</td>
          </tr>
        </tfoot>` : ''}
      </table>
    </div>
  `;
}

/** El detalle línea por línea, con el efecto de cada línea sobre lo que se controla. */
function detailHtml(d) {
  const cols = d.columns || [];
  return `
    <div class="ficha-detail">
      ${d.title ? `<div class="ficha-table__title">${esc(d.title)}</div>` : ''}
      <table class="ficha-detail__grid">
        <thead>
          <tr>${cols.map(c => `<th${c.num ? ' class="ficha-table__num"' : ''}>${esc(c.label)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${(d.rows || []).map(r => `
            <tr${r.tone ? ` class="ficha-detail__row--${esc(r.tone)}"` : ''}>
              ${cols.map(c => `<td${c.num ? ' class="ficha-table__num"' : ''}>${
                c.num ? esc(fmtAmount(r[c.key])) : esc(r[c.key] ?? '—')}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
        ${d.foot ? `<tfoot>
          <tr class="ficha-table__foot ficha-table__foot--ink">
            <td colspan="${Math.max(1, cols.length - 1)}">${esc(d.foot.label)}</td>
            <td class="ficha-table__num">${esc(fmtCell(d.foot.value))}</td>
          </tr>
        </tfoot>` : ''}
      </table>
    </div>
  `;
}

/** No un resumen: una instrucción. Qué queda arriba de la tolerancia y qué mirar. */
function conclusionHtml(c) {
  return `
    <div class="ficha-conclusion ficha-conclusion--${esc(c.tone || 'warn')}">
      <div class="ficha-conclusion__title">${esc(c.title)}</div>
      ${c.text ? `<div class="ficha-conclusion__text">${esc(c.text)}</div>` : ''}
    </div>
  `;
}

// ── La lista ────────────────────────────────────────────────────────────────

/**
 * Pinta la lista de fichas (cerradas) y engancha el dibujado perezoso del
 * cuerpo. No monta la barra de herramientas: eso lo hace `renderFichasPanel()`.
 *
 * @param {HTMLElement} host
 * @param {object[]} fichas
 * @param {object} [opts]
 * @param {(ficha: object, bodyEl: HTMLElement) => void} [opts.onOpen] - para lo
 *   que no se puede escribir como HTML de una (una planilla adentro de la ficha,
 *   que necesita `enhanceGrid` sobre el DOM ya montado).
 * @returns {{ listEl: HTMLElement, els: HTMLElement[] }}
 */
export function renderFichaList(host, fichas, { onOpen } = {}) {
  const listEl = document.createElement('div');
  listEl.className = 'fichas-list';
  listEl.innerHTML = fichas.map(fichaCardHtml).join('');
  host.appendChild(listEl);

  const els = [...listEl.querySelectorAll(':scope > .ficha')];
  els.forEach((el, i) => {
    const ficha = fichas[i];
    el.addEventListener('toggle', () => {
      if (!el.open) return;
      const bodyEl = el.querySelector('[data-ficha-body]');
      if (!bodyEl || bodyEl.dataset.drawn === '1') return;
      bodyEl.dataset.drawn = '1';
      bodyEl.innerHTML = fichaBodyHtml(ficha.body, { id: ficha.id });
      onOpen?.(ficha, bodyEl);
    });
  });

  return { listEl, els };
}

/**
 * La solapa Fichas completa: la barra compartida (chips de estado · buscador ·
 * Marcas ▾ · Orden ▾ · KPI · ⬇ Exportar ▾, siempre en ese orden y siempre en el
 * mismo lugar) más la lista paginada.
 *
 * El estado y las marcas son DOS EJES distintos: el estado dice cómo cerró el
 * caso, la marca dice qué más le pasa. Por eso el estado va en los cinco chips y
 * las marcas en su propio desplegable — mezclarlos haría que la fila de chips
 * diga algo distinto en cada pantalla, que es lo contrario de lo que se pidió.
 *
 * @param {HTMLElement} panel
 * @param {object} opts
 * @param {object[]} opts.fichas
 * @param {(ficha: object) => string} opts.estadoDe - en qué estado cerró cada
 *   ficha ('conDif' | 'margen' | 'centavo' | 'sinComparar')
 * @param {Record<string,string>} [opts.noAplica] - estado → por qué no aplica a
 *   este control (el chip sale en gris con su 0 y ese texto en el `title`)
 * @param {{ value: string, label: string, match: (f: object) => boolean }[]} [opts.marcas]
 * @param {{ value: string, label: string, compare: (a: object, b: object) => number }[]} [opts.ordenes]
 * @param {(ficha: object) => string} [opts.getLabel] - texto buscable
 * @param {(ficha: object) => number|null} [opts.getAmount] - el importe que el control mide
 * @param {string} [opts.amountLabel]
 * @param {string} [opts.unitLabel='fichas']
 * @param {string} [opts.searchLabel] - el buscador dice por qué se puede buscar,
 *   y eso depende de la unidad: en un control por centro de costo, "Buscá por
 *   legajo o nombre" manda al analista a escribir algo que la lista no tiene.
 * @param {string} [opts.searchPlaceholder]
 * @param {(exportEl: HTMLElement) => void} [opts.onExport] - el control monta su
 *   `renderExportMenu()` acá: el exportar va último, siempre, y ningún control
 *   inventa otro botón ni le cambia el rótulo.
 * @param {(ficha: object, bodyEl: HTMLElement) => void} [opts.onOpen]
 */
export function renderFichasPanel(panel, {
  fichas, estadoDe, noAplica = {}, marcas = [], ordenes = [],
  getLabel = (f) => `${f.id} — ${f.name ?? ''}`,
  getAmount, amountLabel, unitLabel = 'fichas',
  searchLabel, searchPlaceholder,
  onExport, onOpen, pageSize,
} = {}) {
  if (fichas.length === 0) {
    panel.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">No hay ninguna ${esc(unitLabel.replace(/s$/, ''))} para mostrar.</p>`;
    return null;
  }

  const estadoPorFicha = new Map(fichas.map(f => [f, estadoDe ? estadoDe(f) : 'centavo']));
  const counts = { todos: fichas.length };
  for (const f of fichas) {
    const e = estadoPorFicha.get(f);
    counts[e] = (counts[e] || 0) + 1;
  }

  const estadoSel = createEstadoFilter({ counts, noAplica });

  const left = [estadoSel];
  if (marcas.length) left.push(marcasDropdown(marcas, fichas));

  const { toolbar, searchEl, exportEl, kpisEl } = createResultsToolbar(panel, { left });

  // El "Orden ▾" es de la solapa Fichas y de ninguna otra: va antes del KPI,
  // que es lo último antes de exportar.
  const ordenSel = ordenes.length ? ordenDropdown(ordenes) : null;
  if (ordenSel) toolbar.querySelector('.results-toolbar__right').prepend(ordenSel);
  // El `<select>` de adentro. `ordenDropdown()` devuelve el ENVOLTORIO —es lo
  // que se monta en la barra— y un `<div>` no tiene `.value`: leyéndolo de ahí,
  // `ordenar()` no encontraba nunca el criterio y el desplegable no hacía nada.
  const ordenSelect = ordenSel?.querySelector('select') || null;

  const { listEl, els } = renderFichaList(panel, fichas, { onOpen });

  const tools = wireListTools(listEl, {
    rows: fichas, els, kpisEl, getAmount, amountLabel, unitLabel,
    ...(pageSize !== undefined ? { pageSize } : {}),
  });

  // El buscador y los filtros de la barra son criterios distintos sobre la
  // MISMA selección: se guardan por separado y se cruzan (si no, buscar un
  // legajo apagaría el chip que el analista dejó puesto, y al limpiar la
  // búsqueda volvería la lista entera en vez de su filtro).
  let porFiltros = null;
  let porBusqueda = null;
  const aplicar = () => {
    if (porFiltros === null && porBusqueda === null) { tools.setFilter(null); return; }
    if (porFiltros === null) { tools.setFilter(porBusqueda); return; }
    if (porBusqueda === null) { tools.setFilter(porFiltros); return; }
    tools.setFilter(new Set([...porFiltros].filter(el => porBusqueda.has(el))));
  };

  initSearchCombobox(searchEl, {
    rows: fichas, trEls: els, getLabel,
    ...(searchLabel !== undefined ? { label: searchLabel } : {}),
    ...(searchPlaceholder !== undefined ? { placeholder: searchPlaceholder } : {}),
    pagination: { setFilter(s) { porBusqueda = s; aplicar(); } },
  });

  const marcaSel = toolbar.querySelector('[data-ficha-marca]');

  function filtrar() {
    const estado = estadoSel.value;
    const marca = marcaSel?.value || 'todas';
    const marcaDef = marcas.find(m => m.value === marca);

    const activo = estado !== 'todos' || marcaDef;
    if (!activo) { porFiltros = null; aplicar(); return; }

    const set = new Set();
    fichas.forEach((f, i) => {
      if (estado !== 'todos' && estadoPorFicha.get(f) !== estado) return;
      if (marcaDef && !marcaDef.match(f)) return;
      set.add(els[i]);
    });
    porFiltros = set;
    aplicar();
  }

  function ordenar() {
    const def = ordenes.find(o => o.value === ordenSelect?.value);
    if (!def) return;
    const pares = fichas.map((f, i) => ({ f, el: els[i] }));
    pares.sort((a, b) => def.compare(a.f, b.f));
    for (const { el } of pares) listEl.appendChild(el);
    // Reordenar cambia cuál es la primera página: la paginación se recalcula
    // sobre el orden nuevo (y el pie vuelve al final solo).
    aplicar();
  }

  estadoSel.addEventListener('change', filtrar);
  marcaSel?.addEventListener('change', filtrar);
  ordenSelect?.addEventListener('change', ordenar);

  onExport?.(exportEl);

  // Arranca en el estado que createEstadoFilter dejó elegido ("Con diferencia"
  // si hay alguno) — el filtro inicial se aplica igual que si lo hubiera tocado
  // el analista, así la lista y el KPI coinciden con el chip encendido.
  filtrar();
  if (ordenSel) ordenar();

  return { listEl, els, tools, estadoSel };
}

/** El segundo eje: qué MÁS le pasa al caso. Desplegable, propio de cada control. */
function marcasDropdown(marcas, fichas) {
  const wrap = document.createElement('div');
  wrap.className = 'form-group results-toolbar__drop';
  wrap.innerHTML = `
    <select class="form-select form-select--sm" data-ficha-marca aria-label="Marcas">
      <option value="todas">Marcas ▾</option>
      ${marcas.map(m => {
        const n = fichas.filter(m.match).length;
        return `<option value="${esc(m.value)}"${n === 0 ? ' disabled' : ''}>${esc(m.label)} (${fmtInt(n)})</option>`;
      }).join('')}
    </select>
  `;
  return wrap;
}

/** Sólo en Fichas (§3). */
function ordenDropdown(ordenes) {
  const wrap = document.createElement('div');
  wrap.className = 'form-group results-toolbar__drop';
  wrap.innerHTML = `
    <select class="form-select form-select--sm" data-ficha-orden aria-label="Orden">
      ${ordenes.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}
    </select>
  `;
  return wrap;
}
