// tableTools.js — Utilidades compartidas para tablas largas de resultados
// (una fila por legajo/CC, a veces cientos): paginación "Mostrar todas" +
// combobox accesible de búsqueda/filtro. Usado por la tabla principal de cada
// control (catXEmpleados, brutos, gsPers, nr, rendVsTabu, rendVsAsiento,
// rendXEe). Las tablas de resumen/distribución (pocas filas) no lo necesitan.
//
// Los dos convergen en la MISMA visibilidad de cada <tr>: paginación decide
// qué se ve "por longitud", el combobox decide qué se ve "por búsqueda", y
// applyVisibility() combina ambos criterios.

import { enhanceGrid, diffBadgeHtml } from './resultBlocks.js';

const PAGE_SIZE_DEFAULT = 50;

/** Qué opción de filtro es "lo que hay que ir a mirar": se pinta con el color
 *  del error y, si arranca activa, la barra explica por qué. "Sin explicar" es
 *  como lo dice el Control de Netos; el resto de los controles dice
 *  "con diferencia". */
const ES_DIFERENCIA = /diferencia|sin explicar/i;

/** Un `<select>` de filtro con hasta tantas opciones se dibuja como chips; con
 *  más (el filtro por concepto de NR, 18 opciones) sigue siendo un desplegable:
 *  18 chips no son un filtro, son una pared.
 *
 *  Son 7 y no 4 desde el rediseño del Detalle de Netos, que separa los estados
 *  de un legajo en siete (todos, sin explicar, dentro del margen, al centavo,
 *  fuera de escala, topearon aportes, sin comparar). Con siete etiquetas cortas
 *  siguen entrando en una fila; el control que tenga más los deja en el select. */
const MAX_CHIP_OPTIONS = 7;

/**
 * Monta la barra de arriba de la tabla Detalle (pantalla 7 del rediseño):
 * filtro(s) como chips a la izquierda, buscador al lado, KPIs y exportar a la
 * derecha. Queda pegada arriba mientras se scrollea (`--sticky`), abajo de las
 * solapas Resumen/Detalle, que también se fijan.
 *
 * Es el mismo molde que estaba escrito a mano en 9 controles — algunos con un
 * `<select>` de "sólo con diferencia/todos", otros sin filtro — y ya había
 * empezado a divergir en el espaciado. No cubre toolbars con otra forma (sólo
 * exportar, sin buscador; selects bespoke de orden/sentido): esos no son el
 * mismo molde y forzarlos acá sería más abstracción de la que hace falta.
 *
 * Los chips NO reemplazan al `<select>`: lo dejan en el DOM, oculto, y le
 * escriben `value` + `change`. Así cada control sigue leyendo su filtro como
 * siempre y esta barra es puramente presentación.
 *
 * @param {HTMLElement} container - dónde montar la barra
 * @param {object} [opts]
 * @param {HTMLElement|HTMLElement[]} [opts.left] - filtro(s) a la izquierda del buscador
 * @returns {{ toolbar: HTMLElement, searchEl: HTMLElement, exportEl: HTMLElement, kpisEl: HTMLElement }}
 */
export function createResultsToolbar(container, { left } = {}) {
  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar results-toolbar--sticky';

  const leftGroup = document.createElement('div');
  leftGroup.className = 'results-toolbar__left';
  const rightGroup = document.createElement('div');
  rightGroup.className = 'results-toolbar__right';

  const searchEl = document.createElement('div');
  const kpisEl   = document.createElement('div');
  kpisEl.className = 'results-toolbar__kpis';
  const exportEl = document.createElement('div');

  const leftEls = left ? (Array.isArray(left) ? left : [left]) : [];
  leftEls.forEach(el => leftGroup.appendChild(el));
  leftGroup.appendChild(searchEl);
  rightGroup.append(kpisEl, exportEl);
  toolbar.append(leftGroup, rightGroup);
  container.appendChild(toolbar);

  // Los filtros cortos pasan a chips. Si alguno arrancó en "con diferencia" —lo
  // decide cada control, que ya lo hacía— se dice por qué: el analista tiene que
  // saber que está mirando un recorte y no toda la tabla (regla "errores
  // primero" + regla 5 de textos que orientan).
  const chipped = [...leftGroup.querySelectorAll('select')].map(chipifySelect).filter(Boolean);
  if (chipped.some(c => c.startedFiltered)) {
    const hint = document.createElement('span');
    hint.className = 'results-toolbar__hint';
    hint.textContent = 'Este filtro arrancó activo porque el control terminó con errores.';
    rightGroup.insertBefore(hint, kpisEl);
    for (const c of chipped) c.onUserChange(() => hint.remove());
  }

  // Las solapas Resumen/Detalle de arriba se fijan junto con la barra: la
  // marca la pone el JS y no un `:has()` en el CSS porque `.tabs` es la misma
  // clase en pantallas que no tienen tabla (ver css/results.css).
  container.closest('.tabs')?.classList.add('tabs--sticky');

  return { toolbar, searchEl, exportEl, kpisEl };
}

/**
 * Dibuja un `<select>` de filtro como chips. Devuelve `null` si ese select no
 * es candidato (una sola opción, o demasiadas).
 *
 * **Los chips son la piel del select, no un control nuevo.** El `<select>` sigue
 * siendo el único control real —queda en el DOM, sólo visualmente oculto— y es
 * el que ve el teclado y el lector de pantalla; los chips van `aria-hidden` y
 * escriben `value` + `change` sobre él. Por eso cada control sigue leyendo su
 * filtro como siempre, y no hay dos controles diciendo lo mismo en el árbol de
 * accesibilidad.
 *
 * @param {HTMLSelectElement} sel
 * @returns {{ startedFiltered: boolean, onUserChange: (fn: () => void) => void }|null}
 */
function chipifySelect(sel) {
  const options = [...sel.options];
  if (options.length < 2 || options.length > MAX_CHIP_OPTIONS) return null;
  if (sel.dataset.chipped === '1') return null;
  sel.dataset.chipped = '1';
  sel.classList.add('results-filter-sr');

  const group = document.createElement('div');
  group.className = 'results-chips';
  group.setAttribute('aria-hidden', 'true');
  group.innerHTML = options.map(o => {
    // "Sólo con diferencia (23)" → el texto y el número, que se leen distinto.
    const m = o.textContent.trim().match(/^(.*?)\s*\((\d[\d.,\s]*)\)$/);
    return `
      <button type="button" tabindex="-1" data-chip-value="${esc(o.value)}"
              class="results-chip${ES_DIFERENCIA.test(o.textContent) ? ' results-chip--dif' : ''}">
        ${esc(m ? m[1] : o.textContent.trim())}
        ${m ? `<span class="results-chip__count">${esc(m[2])}</span>` : ''}
      </button>
    `;
  }).join('');
  sel.insertAdjacentElement('afterend', group);

  const chips = [...group.querySelectorAll('.results-chip')];
  const paint = () => {
    chips.forEach(chip => chip.classList.toggle('results-chip--active', chip.dataset.chipValue === sel.value));
  };

  const listeners = [];
  chips.forEach(chip => chip.addEventListener('click', () => {
    if (chip.dataset.chipValue === sel.value) return;
    sel.value = chip.dataset.chipValue;
    paint();
    listeners.forEach(fn => fn(sel.value));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }));
  // Cambiado desde el select (teclado, lector de pantalla) o por el control:
  // los chips lo siguen.
  sel.addEventListener('change', () => {
    paint();
    listeners.forEach(fn => fn(sel.value));
  });
  paint();

  const selected = options.find(o => o.value === sel.value);
  return {
    startedFiltered: ES_DIFERENCIA.test(selected?.textContent || ''),
    onUserChange: (fn) => listeners.push(fn),
  };
}

/**
 * Pagina un <tbody> ya renderizado con TODAS las filas: muestra las primeras
 * `pageSize` y agrega una fila "Mostrar todas (N más)" al final. No cambia el
 * HTML de cada <tr> ni pide los datos de nuevo — sólo oculta con `display:none`
 * las que exceden la página, hasta que se pide ver todas.
 *
 * @param {HTMLTableSectionElement} tbodyEl - el <tbody> con todas las filas ya insertadas
 * @param {object} [opts]
 * @param {number} [opts.pageSize=50]
 * @returns {{
 *   dataRows: HTMLTableRowElement[],
 *   setFilter: (matchSet: Set<HTMLTableRowElement>|null) => void,
 * }}
 */
export function initShowMorePagination(tbodyEl, { pageSize = PAGE_SIZE_DEFAULT } = {}) {
  const dataRows = [...tbodyEl.querySelectorAll(':scope > tr')];
  let expanded = dataRows.length <= pageSize;
  let filterSet = null; // null = sin búsqueda activa

  let moreRow = null;
  if (!expanded) {
    const nCols = dataRows[0]?.children.length || 1;
    moreRow = document.createElement('tr');
    moreRow.className = 'table-show-more-row';
    moreRow.innerHTML = `
      <td colspan="${nCols}" style="text-align:center;padding:var(--sp-3);">
        <button type="button" class="btn btn--ghost btn--sm js-show-more">
          Mostrar todas (${dataRows.length - pageSize} más)
        </button>
      </td>
    `;
    tbodyEl.appendChild(moreRow);
    moreRow.querySelector('.js-show-more').addEventListener('click', () => {
      expanded = true;
      applyVisibility();
    });
  }

  function applyVisibility() {
    dataRows.forEach((tr, i) => {
      const withinPage = expanded || i < pageSize;
      const matchesFilter = filterSet === null || filterSet.has(tr);
      tr.style.display = (withinPage && matchesFilter) ? '' : 'none';
    });
    if (moreRow) moreRow.style.display = (filterSet === null && !expanded) ? '' : 'none';
  }

  applyVisibility();

  return {
    dataRows,
    setFilter(matchSet) { filterSet = matchSet; applyVisibility(); },
  };
}

/**
 * Encadena los tres pasos que siempre van juntos después de pintar una tabla
 * de detalle: paginar el `<tbody>`, montar el buscador sobre esas mismas
 * filas, y fijar columnas/encabezado con sticky. Estaba escrito a mano en 13
 * sitios de 9 controles — algunos re-renderizan la tabla entera al cambiar un
 * filtro y vuelven a llamar esto con la tabla nueva, otros la montan una sola
 * vez.
 *
 * No reemplaza `createResultsToolbar()` (la barra de arriba) ni
 * `renderExportMenu()` (que necesita sus propios `onExcel`/`onCsv`/`onCopy`
 * por control) — sólo el tramo de abajo, sobre la tabla ya en el DOM.
 *
 * @param {HTMLTableElement} tableEl - la tabla ya insertada en el DOM, con su `<tbody>`
 * @param {object} opts
 * @param {any[]} opts.rows - filas en el MISMO orden que las `<tr>` del tbody
 * @param {(row: any) => string} opts.getLabel - texto buscable de `initSearchCombobox`
 * @param {HTMLElement} opts.searchEl - dónde montar el buscador (el de `createResultsToolbar`)
 * @param {number} [opts.pageSize=50]
 * @param {string} [opts.label] - override de `initSearchCombobox`
 * @param {string} [opts.placeholder] - override de `initSearchCombobox`
 * @param {boolean} [opts.sticky=true] - false para saltear `enhanceGrid` (variaciones.js no lo usa en esta tabla)
 * @param {0|1|2} [opts.stickyCols=1]
 * @param {number} [opts.col1Width]
 * @returns {{ dataRows: HTMLTableRowElement[], setFilter: (s: Set|null) => void }} el resultado de `initShowMorePagination`
 */
export function wireTableTools(tableEl, {
  rows, getLabel, searchEl,
  pageSize = PAGE_SIZE_DEFAULT,
  label, placeholder,
  sticky = true, stickyCols = 1, col1Width,
} = {}) {
  const tbodyEl = tableEl.querySelector('tbody');
  const pagination = initShowMorePagination(tbodyEl, { pageSize });

  // La fila de TOTAL y los KPIs miran la MISMA selección que el buscador — no
  // la página visible: "TOTAL — 514 legajos" con 50 filas en pantalla es
  // correcto (paginar no cambia lo que se está mirando), pero dejar el total
  // global cuando el filtro dejó una sola fila es un número que no cierra con
  // nada de lo que se ve.
  const totals = initSelectionTotals(tableEl, pagination.dataRows);
  const kpis   = initToolbarKpis(searchEl, tableEl, pagination.dataRows);

  const controller = {
    ...pagination,
    setFilter(matchSet) {
      pagination.setFilter(matchSet);
      totals.update(matchSet);
      kpis.update(matchSet);
    },
  };

  initSearchCombobox(searchEl, {
    rows, trEls: pagination.dataRows, getLabel, pagination: controller,
    ...(label !== undefined ? { label } : {}),
    ...(placeholder !== undefined ? { placeholder } : {}),
  });
  if (sticky) enhanceGrid(tableEl, { stickyCols, ...(col1Width !== undefined ? { col1Width } : {}) });
  return controller;
}

// ── Total de la selección + KPIs de la barra ────────────────────────────────
//
// Las dos piezas leen la tabla que ya está pintada (no los datos del control):
// así valen para los 9 controles sin que ninguno tenga que pasar nada nuevo, y
// un control que arma su tabla distinto simplemente no las activa.

/**
 * Recalcula la fila de TOTAL con las filas que matchean el filtro. Sólo toca
 * las columnas que la fila de TOTAL ya mostraba como número: si una no se puede
 * totalizar (la celda de alguna fila no es un importe), sale "—" en vez de un
 * número inventado.
 *
 * @param {HTMLTableElement} tableEl
 * @param {HTMLTableRowElement[]} dataRows
 */
function initSelectionTotals(tableEl, dataRows) {
  const footRow = tableEl.tFoot?.rows?.[0];
  if (!footRow) return { update() {} };

  const cells    = [...footRow.cells];
  const original = cells.map(c => c.innerHTML);
  const origText = cells.map(c => c.textContent);

  // Columna donde arranca cada celda de la fila de totales (colspan mediante).
  const colOf = [];
  let col = 0;
  for (const c of cells) { colOf.push(col); col += c.colSpan || 1; }

  const sumCol   = cells.map((c, i) => ((c.colSpan || 1) === 1 && parseARNumber(c.textContent) !== null) ? colOf[i] : null);
  const decimals = cells.map(c => decimalsOf(c.textContent));
  const labelIdx = sumCol.findIndex(c => c === null);

  function update(filterSet) {
    if (!filterSet) {
      cells.forEach((c, i) => { c.innerHTML = original[i]; });
      footRow.classList.remove('rb-total--selection');
      return;
    }

    const matched = dataRows.filter(tr => filterSet.has(tr));
    const sums = new Map();
    for (const c of sumCol) if (c !== null) sums.set(c, 0);

    for (const tr of matched) {
      const byCol = cellsByColumn(tr);
      for (const c of [...sums.keys()]) {
        const acc = sums.get(c);
        if (acc === null) continue;
        const txt = byCol[c]?.textContent ?? '';
        if (!/\d/.test(txt)) continue;              // vacío, "—" o un badge de ausencia: no suma
        const v = parseARNumber(txt);
        sums.set(c, v === null ? null : acc + v);
      }
    }

    cells.forEach((cell, i) => {
      const c = sumCol[i];
      if (c === null) {
        if (i === labelIdx) cell.innerHTML = selectionLabelHtml(origText[i], matched.length);
        return;
      }
      const v = sums.get(c);
      if (v === null) { cell.textContent = '—'; return; }
      cell.innerHTML = cell.classList.contains('rb-magcell')
        ? diffBadgeHtml(v, { decimals: decimals[i] })
        : esc(fmtAmount(v, decimals[i]));
    });
    footRow.classList.add('rb-total--selection');
  }

  return { update };
}

/**
 * Los KPIs de la derecha de la barra: cuántas filas hay y cuántas tienen
 * diferencia. El conteo de diferencias sale de las celdas Δ que ya pintó
 * `diffCellHtml`; si el control no las usa, no se muestra — un "0 con
 * diferencias" sobre una tabla que no compara nada sería falso.
 */
function initToolbarKpis(searchEl, tableEl, dataRows) {
  const host = searchEl?.closest('.results-toolbar')?.querySelector('.results-toolbar__kpis');
  if (!host) return { update() {} };

  const total    = dataRows.length;
  const comparaA = tableEl.querySelector('tbody .rb-magcell') !== null;
  const conDif   = dataRows.filter(tr => tr.querySelector('.rb-diffbadge--error')).length;

  const difHtml = comparaA
    ? `<span class="results-kpi__badge results-kpi__badge--${conDif > 0 ? 'error' : 'ok'}">${fmtInt(conDif)} con diferencias</span>`
    : '';

  const paint = (mostradas) => {
    host.innerHTML = `
      <span class="results-kpi">${mostradas === null
        ? `<strong>${fmtInt(total)}</strong> filas`
        : `<strong>${fmtInt(mostradas)}</strong> de ${fmtInt(total)} filas`}</span>
      ${difHtml}
    `;
  };

  paint(null);
  return {
    update(filterSet) {
      paint(filterSet ? dataRows.filter(tr => filterSet.has(tr)).length : null);
    },
  };
}

/** "TOTAL — 514 legajos" → "TOTAL de la selección — 23 legajos". */
function selectionLabelHtml(originalText, n) {
  const m = String(originalText || '').match(/—\s*[\d.,]+\s*(.*)$/);
  const unidad = singularizar((m?.[1] || '').trim() || 'filas', n);
  return `<strong>TOTAL de la selección</strong> — ${fmtInt(n)} ${esc(unidad)}`;
}

/** "legajos" → "legajo" · "centros de costo" → "centro de costo" (sólo si n = 1). */
function singularizar(texto, n) {
  if (n === 1) {
    const [primera, ...resto] = texto.split(' ');
    if (primera.endsWith('s')) return [primera.slice(0, -1), ...resto].join(' ');
  }
  return texto;
}

/** Las celdas de una fila indexadas por columna (colspan mediante). */
function cellsByColumn(tr) {
  const out = [];
  let col = 0;
  for (const cell of tr.cells) {
    const span = cell.colSpan || 1;
    for (let k = 0; k < span; k++) out[col + k] = cell;
    col += span;
  }
  return out;
}

/** "1.443.877.275,18" / "−15.000,00" → número. `null` si no hay número que leer. */
function parseARNumber(txt) {
  const s = String(txt ?? '').replace(/−/g, '-').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Cuántos decimales muestra la celda original — el total se escribe igual. */
function decimalsOf(txt) {
  const m = String(txt ?? '').match(/,(\d+)/);
  return m ? m[1].length : 0;
}

function fmtAmount(n, decimals) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtInt(n) {
  return Math.round(n || 0).toLocaleString('es-AR');
}

let comboIdCounter = 0;

/**
 * Combobox accesible (patrón WAI-ARIA "Combobox with Listbox Popup") para
 * buscar y filtrar filas de una tabla. Al elegir una opción, filtra el
 * <tbody> para mostrar sólo esa fila (coordinado con `pagination.setFilter`
 * si se pasa un resultado de initShowMorePagination).
 *
 * - role="combobox" en el <input>, role="listbox" en el popup, cada
 *   resultado con role="option".
 * - aria-expanded / aria-controls siempre sincronizados con el estado real.
 * - El foco del DOM nunca sale del <input> — la opción activa se comunica
 *   con aria-activedescendant, no moviendo el foco.
 * - Flechas ↑/↓ navegan, Enter selecciona, Escape cierra (o limpia si ya
 *   estaba cerrado y hay texto). Sin autofocus al montar.
 *
 * @param {HTMLElement} container - dónde montar el combobox (arriba de la tabla)
 * @param {object} opts
 * @param {any[]} opts.rows - los datos originales, en el MISMO orden que se usó para pintar las filas
 * @param {HTMLTableRowElement[]} opts.trEls - los <tr> ya en el DOM, mismo orden que `rows` (ej: pagination.dataRows)
 * @param {(row: any) => string} opts.getLabel - texto buscable/mostrado de una fila (ej: "847 — Sanguinetti Javier")
 * @param {{ setFilter: (s: Set|null) => void }} [opts.pagination] - resultado de initShowMorePagination
 * @param {string} [opts.label='Buscar legajo o nombre']
 * @param {string} [opts.placeholder='Buscá por legajo o nombre…']
 */
export function initSearchCombobox(container, {
  rows, trEls, getLabel, pagination,
  label = 'Buscar legajo o nombre',
  // Regla 5 del rediseño (textos que orientan): el placeholder dice POR QUÉ se
  // puede buscar, no que hay que escribir.
  placeholder = 'Buscá por legajo o nombre…',
} = {}) {
  const id = `combo-${++comboIdCounter}`;
  const items = rows.map((row, i) => ({ tr: trEls[i], text: getLabel(row) })).filter(it => it.tr);

  container.innerHTML = `
    <div class="table-search">
      <label class="table-search__label" for="${id}-input">${esc(label)}</label>
      <div class="table-search__control">
        <input
          type="text"
          id="${id}-input"
          class="table-search__input"
          role="combobox"
          aria-expanded="false"
          aria-controls="${id}-listbox"
          aria-autocomplete="list"
          autocomplete="off"
          placeholder="${esc(placeholder)}"
        >
        <button type="button" class="table-search__clear" id="${id}-clear" hidden aria-label="Limpiar búsqueda">✕</button>
      </div>
      <ul class="table-search__listbox" id="${id}-listbox" role="listbox" aria-label="${esc(label)}" hidden></ul>
      <p class="sr-only" id="${id}-status" role="status"></p>
    </div>
  `;

  const input    = container.querySelector(`#${id}-input`);
  const listbox  = container.querySelector(`#${id}-listbox`);
  const clearBtn = container.querySelector(`#${id}-clear`);
  const statusEl = container.querySelector(`#${id}-status`);

  let activeIndex = -1;
  let visibleOptions = [];

  function closeListbox() {
    listbox.setAttribute('hidden', '');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function renderOptions(query) {
    const q = query.trim().toLowerCase();
    if (q === '') { closeListbox(); listbox.innerHTML = ''; return; }

    visibleOptions = items.filter(it => it.text.toLowerCase().includes(q)).slice(0, 10);
    activeIndex = -1;
    input.removeAttribute('aria-activedescendant');

    if (visibleOptions.length === 0) {
      listbox.innerHTML = `<li class="table-search__empty" role="presentation">Sin resultados</li>`;
      listbox.removeAttribute('hidden');
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    listbox.innerHTML = visibleOptions.map((it, i) => `
      <li role="option" id="${id}-opt-${i}" class="table-search__option" data-index="${i}">${esc(it.text)}</li>
    `).join('');
    listbox.removeAttribute('hidden');
    input.setAttribute('aria-expanded', 'true');

    listbox.querySelectorAll('.table-search__option').forEach(optEl => {
      // mousedown (no click) para que dispare ANTES del blur del input al clickear.
      optEl.addEventListener('mousedown', e => {
        e.preventDefault();
        selectOption(Number(optEl.dataset.index));
      });
    });
  }

  function setActiveIndex(i) {
    activeIndex = i;
    listbox.querySelectorAll('.table-search__option').forEach((el, idx) => {
      el.classList.toggle('table-search__option--active', idx === i);
    });
    if (i >= 0) {
      input.setAttribute('aria-activedescendant', `${id}-opt-${i}`);
      listbox.querySelector(`#${id}-opt-${i}`)?.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function selectOption(i) {
    const opt = visibleOptions[i];
    if (!opt) return;
    input.value = opt.text;
    closeListbox();
    if (pagination) pagination.setFilter(new Set([opt.tr]));
    clearBtn.removeAttribute('hidden');
    statusEl.textContent = `Mostrando 1 resultado para "${opt.text}"`;
  }

  function clearFilter({ focusInput = false } = {}) {
    input.value = '';
    closeListbox();
    listbox.innerHTML = '';
    if (pagination) pagination.setFilter(null);
    clearBtn.setAttribute('hidden', '');
    statusEl.textContent = '';
    if (focusInput) input.focus();
  }

  input.addEventListener('input', () => {
    if (input.value.trim() === '') clearFilter();
    renderOptions(input.value);
  });

  input.addEventListener('keydown', e => {
    const isOpen = !listbox.hasAttribute('hidden');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) { renderOptions(input.value); return; }
      if (visibleOptions.length) setActiveIndex(Math.min(activeIndex + 1, visibleOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen && visibleOptions.length) setActiveIndex(Math.max(activeIndex - 1, 0));
    } else if (e.key === 'Enter') {
      if (!isOpen) return;
      if (activeIndex >= 0) { e.preventDefault(); selectOption(activeIndex); }
      else if (visibleOptions.length === 1) { e.preventDefault(); selectOption(0); }
    } else if (e.key === 'Escape') {
      if (isOpen) { e.preventDefault(); closeListbox(); }
      else if (input.value) { e.preventDefault(); clearFilter({ focusInput: true }); }
    }
  });

  // Blur cierra el popup; el timeout deja que el mousedown de una opción se
  // procese primero (si no, el blur cerraría la lista antes del click).
  input.addEventListener('blur', () => setTimeout(closeListbox, 0));

  clearBtn.addEventListener('click', () => clearFilter({ focusInput: true }));

  // Sin autofocus al montar — el usuario decide cuándo buscar.
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
