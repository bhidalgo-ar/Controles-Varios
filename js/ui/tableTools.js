// tableTools.js — La barra de herramientas de la vista estándar y las
// utilidades para listas largas de resultados (una fila o una ficha por
// legajo/CC, a veces cientos): los cinco chips de estado, el combobox accesible
// de búsqueda, la paginación y el TOTAL/KPI de la selección.
//
// Todo esto vale para las dos formas que puede tener el detalle de un control:
// una TABLA (`initShowMorePagination` / `wireTableTools`, sobre un `<tbody>`) y
// una LISTA de fichas (`initListPagination` / `wireListTools`, sobre elementos).
//
// Los dos convergen en la MISMA visibilidad de cada fila/ficha: paginación
// decide qué se ve "por longitud", el combobox decide qué se ve "por búsqueda",
// y el apply combina ambos criterios.

import { enhanceGrid, diffBadgeHtml } from './resultBlocks.js';
import { currentTolerance } from '../controls/tolerance.js';

const PAGE_SIZE_DEFAULT = 50;

/** **Qué se chipifica se declara, no se adivina** (§3 de
 *  specs/vista-estandar-resultados.md). Hasta acá se dibujaba como chips
 *  cualquier `<select>` de la izquierda con 2 a 4 opciones — o sea, por
 *  accidente: la "Vista" de un control y la "Solapa" de otro terminaron de
 *  chips sin que nadie lo decidiera, y la fila de chips decía algo distinto en
 *  cada pantalla. Se chipifica SÓLO el select de estado, y sólo si lo pide con
 *  `data-chips="1"`; cualquier otro filtro queda desplegable por diseño (los 18
 *  conceptos de NR no son un filtro, son una pared). El límite por cantidad de
 *  opciones ya no existe: lo dejó escrito el Detalle de Netos cuando declaró el
 *  suyo — "cuando las 21 pantallas declaren su select de estado, el límite se
 *  va". Esta es esa tanda. */
const CHIPS_DECLARADOS = '1';

/** Qué opción de filtro es "lo que hay que ir a mirar": se pinta con el color
 *  del error y, si arranca activa, la barra explica por qué. "Sin explicar" es
 *  como lo dice el Control de Netos; el resto de los controles dice
 *  "con diferencia". */
const ES_DIFERENCIA = /diferencia|sin explicar/i;

// ── Los cinco estados, iguales en los 21 controles ──────────────────────────
//
// Las mismas cinco palabras, en el mismo orden, en todos los controles: es lo
// que hace que el analista reconozca la pantalla sin leerla. Se leen de peor a
// cerrado, y "Sin comparar" va ÚLTIMO y en ámbar porque no es un grado de
// cierre, es el resto: nunca se lee como aprobado (D-073), y en ámbar no se
// confunde con el verde de lo que cerró.

/** @type {{ value: string, label: string, tone: string, help: string }[]} */
export const ESTADOS = [
  { value: 'todos',       label: 'Todos',              tone: 'neutral', help: 'la vista completa' },
  { value: 'conDif',      label: 'Con diferencia',     tone: 'dif',     help: 'arriba del monto de diferencia del cliente' },
  { value: 'margen',      label: 'Dentro del margen',  tone: 'info',    help: 'arriba de $ 0,01 y hasta ese monto' },
  { value: 'centavo',     label: 'Al centavo',         tone: 'ok',      help: 'hasta $ 0,01 — el redondeo de Meta4' },
  { value: 'sinComparar', label: 'Sin comparar',       tone: 'warn',    help: 'falta un lado: no está en el otro archivo, la columna no está mapeada, o el período no trae el dato' },
];

/** Los cuatro estados que clasifican un caso ('todos' es la salida del filtro). */
export const ESTADOS_DE_CASO = ESTADOS.filter(e => e.value !== 'todos').map(e => e.value);

/** El redondeo de Meta4: el piso de todo el repo. */
const CENTAVO = 0.01;

/**
 * En qué estado cae una diferencia. Es la definición del §3, en un solo lugar:
 * `null` no es `0` (no se pudo comparar), el centavo es el redondeo de Meta4, y
 * el margen es el monto de diferencia del cliente (D-069).
 *
 * @param {number|null} diff
 * @param {number} [tol] - el monto de diferencia de la corrida
 * @returns {'conDif'|'margen'|'centavo'|'sinComparar'}
 */
export function estadoDeDiferencia(diff, tol = currentTolerance()) {
  if (diff === null || diff === undefined || !Number.isFinite(diff)) return 'sinComparar';
  const abs = Math.abs(diff);
  if (abs <= CENTAVO) return 'centavo';
  if (abs <= tol) return 'margen';
  return 'conDif';
}

/**
 * El `<select>` de estado de un control, listo para chipificarse: los cinco
 * estados con esas palabras y en ese orden, con su conteo.
 *
 * **Un estado sin casos se muestra igual**, en gris y sin poder tocarse, con su
 * 0: sacarlo movería los demás de lugar, que es justo lo que este estándar viene
 * a arreglar. El `title` dice cuál de las dos cosas es — que no hubo ninguno en
 * esta corrida, o que el estado no aplica a este control (el que cuadra al
 * centavo por definición no tiene "Dentro del margen").
 *
 * @param {object} opts
 * @param {Record<string, number>} opts.counts - por estado; `todos` se suma solo si no viene
 * @param {Record<string, string>} [opts.noAplica] - estado → por qué no aplica a este control
 * @param {string} [opts.ariaLabel='Estado del caso']
 * @returns {HTMLSelectElement} con el valor inicial ya puesto: "Con diferencia"
 *   si hay alguno, "Todos" si no (§3).
 */
export function createEstadoFilter({ counts = {}, noAplica = {}, ariaLabel = 'Estado del caso' } = {}) {
  const sel = document.createElement('select');
  sel.className = 'form-select form-select--sm';
  sel.dataset.chips = CHIPS_DECLARADOS;
  sel.setAttribute('aria-label', ariaLabel);
  sel.innerHTML = estadoOptionsHtml({ counts, noAplica });
  sel.value = estadoInicial(counts);
  return sel;
}

/** Las cinco `<option>` del filtro de estado. Función pura (se testea sin navegador). */
export function estadoOptionsHtml({ counts = {}, noAplica = {} } = {}) {
  const n = (v) => Number(counts[v] ?? 0);
  const total = counts.todos !== undefined
    ? Number(counts.todos)
    : ESTADOS_DE_CASO.reduce((acc, v) => acc + n(v), 0);

  return ESTADOS.map(e => {
    const cant = e.value === 'todos' ? total : n(e.value);
    const vacio = cant === 0 && e.value !== 'todos';
    const title = !vacio ? e.help
      : noAplica[e.value]
        ? `No aplica a este control: ${noAplica[e.value]}.`
        : `Ningún caso quedó en este estado en esta corrida (${e.help}).`;
    return `<option value="${esc(e.value)}" data-tone="${esc(e.tone)}"`
      + `${vacio ? ' disabled' : ''} title="${esc(title)}">`
      + `${esc(e.label)} (${fmtInt(cant)})</option>`;
  }).join('');
}

/** Arranca activo "Con diferencia" si hay alguno; si no, "Todos" (§3). */
export function estadoInicial(counts = {}) {
  return Number(counts.conDif ?? 0) > 0 ? 'conDif' : 'todos';
}

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

  // El filtro de estado pasa a chips. Si arrancó en "con diferencia" —lo decide
  // cada control, que ya lo hacía— se dice por qué: el analista tiene que saber
  // que está mirando un recorte y no toda la tabla (regla "errores primero" +
  // regla 5 de textos que orientan).
  const chipped = [...leftGroup.querySelectorAll(`select[data-chips="${CHIPS_DECLARADOS}"]`)]
    .map(chipifySelect).filter(Boolean);
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
 * Dibuja el `<select>` de estado como chips. Devuelve `null` si ese select no
 * es candidato (una sola opción, o ya chipificado).
 *
 * **Los chips son la piel del select, no un control nuevo.** El `<select>` sigue
 * siendo el único control real —queda en el DOM, sólo visualmente oculto— y es
 * el que ve el teclado y el lector de pantalla; los chips van `aria-hidden` y
 * escriben `value` + `change` sobre él. Por eso cada control sigue leyendo su
 * filtro como siempre, y no hay dos controles diciendo lo mismo en el árbol de
 * accesibilidad.
 *
 * Lo que decide cada chip sale de su `<option>` y de ningún otro lado: el color
 * de `data-tone`, el `title` del `title`, y el gris deshabilitado de que la
 * opción esté `disabled` (que es también lo que ve el teclado — un estado sin
 * casos no se puede elegir, ni con el mouse ni con las flechas).
 *
 * @param {HTMLSelectElement} sel
 * @returns {{ startedFiltered: boolean, onUserChange: (fn: () => void) => void }|null}
 */
function chipifySelect(sel) {
  const options = [...sel.options];
  // La marca explícita y nada más: sin `data-chips="1"` este select se queda
  // desplegable, tenga las opciones que tenga.
  if (sel.dataset.chips !== CHIPS_DECLARADOS || options.length < 2) return null;
  if (sel.dataset.chipped === '1') return null;
  sel.dataset.chipped = '1';
  sel.classList.add('results-filter-sr');

  const group = document.createElement('div');
  group.className = 'results-chips';
  group.setAttribute('aria-hidden', 'true');
  group.innerHTML = options.map(o => {
    // "Con diferencia (23)" → el texto y el número, que se leen distinto.
    const m = o.textContent.trim().match(/^(.*?)\s*\((\d[\d.,\s]*)\)$/);
    // Un estado sin casos se muestra igual, apagado y con su 0: sacarlo movería
    // los demás de lugar, que es justo lo que la fila de chips viene a evitar.
    const tone = o.dataset.tone
      // El control que todavía no declara el tono: el filtro de diferencias se
      // pinta con el color de lo que hay que ir a mirar, como hasta ahora.
      || (ES_DIFERENCIA.test(o.textContent) ? 'dif' : '');
    return `
      <button type="button" tabindex="-1" data-chip-value="${esc(o.value)}"
              ${o.disabled ? 'disabled' : ''}
              ${o.title ? `title="${esc(o.title)}"` : ''}
              class="results-chip${tone ? ` results-chip--${esc(tone)}` : ''}${o.disabled ? ' results-chip--vacio' : ''}">
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
    if (chip.disabled || chip.dataset.chipValue === sel.value) return;
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
    // La página se cuenta sobre las filas que PASAN el filtro, no sobre el
    // índice original. Contándola sobre el índice, buscar un legajo que estaba
    // en la fila 300 no mostraba nada —quedaba fuera de la primera página y el
    // botón "Mostrar todas" además se ocultaba, así que no había salida— y lo
    // mismo pasaba con cualquier chip de estado sobre una tabla larga. Es la
    // misma cuenta que ya hace `initListPagination` para la lista de fichas.
    let visibles = 0;
    for (const tr of dataRows) {
      const matchesFilter = filterSet === null || filterSet.has(tr);
      const withinPage = matchesFilter && (expanded || visibles < pageSize);
      if (withinPage) visibles++;
      tr.style.display = withinPage ? '' : 'none';
    }
    const totalMatch = filterSet === null ? dataRows.length : dataRows.filter(tr => filterSet.has(tr)).length;
    if (moreRow) {
      moreRow.style.display = visibles < totalMatch ? '' : 'none';
      moreRow.querySelector('.js-show-more').textContent = `Mostrar todas (${totalMatch - visibles} más)`;
    }
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

// ── Lo mismo, sobre una LISTA de elementos ──────────────────────────────────
//
// Paginar, buscar y totalizar la selección estaban escritos contra un `<tbody>`:
// leían las `<tr>` pintadas y sumaban leyendo el texto de las celdas. La ficha
// (§4) necesita exactamente lo mismo sobre tarjetas, así que acá va la versión
// que trabaja sobre una lista de elementos y sobre los DATOS —no sobre el texto
// dibujado—, que en una tarjeta no está en una celda de la que se pueda leer un
// número.

/**
 * Pagina una lista ya renderizada con TODOS sus elementos: muestra los primeros
 * `pageSize` y agrega al pie "Mostrar 50 más" y el contador "N de M fichas".
 *
 * A diferencia de la tabla —que ofrece "Mostrar todas" de una— acá cada click
 * suma una página: una lista de fichas abiertas es mucho más alta que 500 filas
 * de tabla, y saltar de 50 a 500 tarjetas deja al analista sin referencia de
 * dónde estaba.
 *
 * @param {HTMLElement} listEl - el contenedor con los elementos ya insertados
 * @param {object} [opts]
 * @param {number} [opts.pageSize=50]
 * @param {string} [opts.unitLabel='fichas'] - lo que cuenta el contador del pie
 * @returns {{ items: HTMLElement[], setFilter: (s: Set|null) => void, visibleCount: () => number }}
 */
export function initListPagination(listEl, { pageSize = PAGE_SIZE_DEFAULT, unitLabel = 'fichas' } = {}) {
  const items = [...listEl.children].filter(el => !el.classList.contains('list-more'));
  let shown = Math.min(pageSize, items.length);
  let filterSet = null; // null = sin búsqueda activa

  const foot = document.createElement('div');
  foot.className = 'list-more';
  foot.innerHTML = `
    <button type="button" class="btn btn--ghost btn--sm js-show-more">Mostrar ${pageSize} más</button>
    <span class="list-more__count"></span>
  `;
  listEl.appendChild(foot);
  const moreBtn  = foot.querySelector('.js-show-more');
  const countEl  = foot.querySelector('.list-more__count');

  moreBtn.addEventListener('click', () => {
    shown = Math.min(shown + pageSize, items.length);
    apply();
  });

  function matching() {
    return filterSet === null ? items : items.filter(el => filterSet.has(el));
  }

  function apply() {
    // En orden de DOM, no en el del array: la lista se puede reordenar (el
    // "Orden ▾" de la barra mueve las tarjetas) y la primera página tiene que
    // ser la de arriba de la pantalla, no la del orden con el que se pintó.
    if (listEl.lastElementChild !== foot) listEl.appendChild(foot);
    const match = matching();
    let visibles = 0;
    for (const el of [...listEl.children].filter(el => el !== foot)) {
      const inFilter = filterSet === null || filterSet.has(el);
      const withinPage = inFilter && visibles < shown;
      if (withinPage) visibles++;
      el.hidden = !withinPage;
    }
    const totalMatch = match.length;
    moreBtn.hidden = visibles >= totalMatch;
    moreBtn.textContent = `Mostrar ${Math.min(pageSize, totalMatch - visibles)} más`;
    countEl.textContent = `${fmtInt(visibles)} de ${fmtInt(totalMatch)} ${unitLabel}`;
    foot.hidden = totalMatch === 0;
  }

  apply();

  return {
    items,
    setFilter(matchSet) { filterSet = matchSet; apply(); },
    visibleCount: () => items.filter(el => !el.hidden).length,
  };
}

/**
 * El KPI de la selección para una lista: cuántas unidades se están mirando y la
 * Σ del importe que el control mide. Sobre los DATOS, no sobre el texto: en una
 * tarjeta el importe no está en una celda de la que se pueda parsear.
 *
 * @param {HTMLElement} kpisEl - el `kpisEl` de `createResultsToolbar`
 * @param {object} opts
 * @param {any[]} opts.rows - los datos, en el MISMO orden que los elementos
 * @param {HTMLElement[]} opts.els
 * @param {(row: any) => number|null} [opts.getAmount] - el importe que el control mide
 * @param {string} [opts.amountLabel='Σ'] - cómo se llama esa suma
 * @param {string} [opts.unitLabel='fichas']
 */
export function initListKpis(kpisEl, { rows, els, getAmount, amountLabel = 'Σ', unitLabel = 'fichas' } = {}) {
  if (!kpisEl) return { update() {} };

  const pairs = rows.map((row, i) => ({ row, el: els[i] })).filter(p => p.el);

  const sumOf = (selection) => {
    let acc = null;
    for (const { row } of selection) {
      const v = getAmount?.(row);
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      acc = (acc ?? 0) + v;
    }
    return acc;
  };

  const paint = (selection, filtrado) => {
    const suma = getAmount ? sumOf(selection) : null;
    kpisEl.innerHTML = `
      <span class="results-kpi">${filtrado
        ? `<strong>${fmtInt(selection.length)}</strong> de ${fmtInt(pairs.length)} ${esc(unitLabel)}`
        : `<strong>${fmtInt(pairs.length)}</strong> ${esc(unitLabel)}`}</span>
      ${getAmount ? `<span class="results-kpi">${esc(amountLabel)} <strong>${
        suma === null ? '—' : esc(fmtAmount(suma, 2))}</strong></span>` : ''}
    `;
  };

  paint(pairs, false);
  return {
    update(filterSet) {
      if (!filterSet) { paint(pairs, false); return; }
      paint(pairs.filter(p => filterSet.has(p.el)), true);
    },
  };
}

/**
 * El equivalente de `wireTableTools()` para una lista: paginación + buscador +
 * KPI de la selección, todos mirando la MISMA selección.
 *
 * @param {HTMLElement} listEl - la lista con los elementos ya insertados
 * @param {object} opts
 * @param {any[]} opts.rows - los datos, en el MISMO orden que los elementos
 * @param {(row: any) => string} opts.getLabel - texto buscable
 * @param {HTMLElement} opts.searchEl
 * @param {HTMLElement} [opts.kpisEl]
 * @param {(row: any) => number|null} [opts.getAmount]
 * @param {string} [opts.amountLabel]
 * @param {string} [opts.unitLabel='fichas']
 * @param {number} [opts.pageSize=50]
 */
export function wireListTools(listEl, {
  rows, getLabel, searchEl, kpisEl, getAmount, amountLabel, unitLabel = 'fichas',
  pageSize = PAGE_SIZE_DEFAULT, label, placeholder,
} = {}) {
  const pagination = initListPagination(listEl, { pageSize, unitLabel });
  const kpis = initListKpis(kpisEl, {
    rows, els: pagination.items, getAmount, amountLabel, unitLabel,
  });

  const controller = {
    ...pagination,
    setFilter(matchSet) {
      pagination.setFilter(matchSet);
      kpis.update(matchSet);
    },
  };

  if (searchEl) {
    initSearchCombobox(searchEl, {
      rows, trEls: pagination.items, getLabel, pagination: controller,
      ...(label !== undefined ? { label } : {}),
      ...(placeholder !== undefined ? { placeholder } : {}),
    });
  }
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
