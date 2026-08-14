// exportMenu.js — Dropdown "⬇ Exportar ▾" para el detalle de cualquier control:
// Excel (.xlsx), CSV y copiar al portapapeles. Reemplaza el botón suelto
// "⬇ Exportar .xlsx" que cada control repetía por separado.
//
// Con `items` toma su propia lista en vez de esos tres, cada uno con una
// descripción abajo, y con `note` un renglón al pie: así lo usa el menú de la
// corrida entera, que vive en la barra superior de la pantalla de resultados
// y avisa ahí mismo que el archivo lleva datos personales.
//
// Reusa las clases .row-menu / .row-menu__panel / .row-menu__item que ya
// existen para el menú "⋯" de clientsList.js, pero con su propio listener de
// click-afuera-para-cerrar (no depende de que clientsList.js esté cargado).

import { showToast } from './toast.js';

// Un solo listener a nivel de módulo (no uno por cada renderExportMenu()) —
// si no, cada corrida vista en la sesión deja un listener de document
// colgado apuntando a un panel ya desmontado. Mismo patrón que clientsList.js.
function closeAllPanels() {
  document.querySelectorAll('.row-menu__panel').forEach(p => {
    p.setAttribute('hidden', '');
    p.previousElementSibling?.setAttribute('aria-expanded', 'false');
  });
}
document.addEventListener('click', closeAllPanels);

let idCounter = 0;

/**
 * @param {HTMLElement} container - se reemplaza su innerHTML con el dropdown
 * @param {object} opts
 * @param {() => Promise<void>} [opts.onExcel] - genera y descarga el .xlsx
 * @param {() => void}          [opts.onCsv]   - genera y descarga el .csv
 * @param {() => Promise<void>|void} [opts.onCopy] - copia al portapapeles
 * @param {{key: string, label: string, desc?: string, action: Function}[]} [opts.items]
 *   Ítems propios en vez de los tres de arriba (los usa el menú de la corrida
 *   entera, en la barra superior de resultados). `desc` es la línea de abajo
 *   que dice qué trae el archivo.
 * @param {string} [opts.note] - renglón al pie del menú (ej. el recordatorio de
 *   que el archivo lleva datos personales). No es un ítem: no se puede clickear.
 */
export function renderExportMenu(container, { onExcel, onCsv, onCopy, items: customItems, note } = {}) {
  const id = `export-menu-${++idCounter}`;
  const items = [];
  if (customItems?.length) {
    items.push(...customItems);
  } else {
    if (onExcel) items.push({ key: 'excel', label: '📊 Exportar a Excel (.xlsx)', action: onExcel });
    if (onCsv)   items.push({ key: 'csv',   label: '📄 Exportar CSV',              action: onCsv });
    if (onCopy)  items.push({ key: 'copy',  label: '📋 Copiar tabla',              action: onCopy });
  }
  if (items.length === 0) { container.innerHTML = ''; return; }

  const hasDesc = items.some(i => i.desc);
  const itemHtml = i => (i.desc
    ? `<span class="export-menu__item-name">${i.label}</span><span class="export-menu__item-desc">${esc(i.desc)}</span>`
    : i.label);

  container.innerHTML = `
    <div class="row-menu">
      <button type="button" class="btn btn--primary btn--sm" id="${id}-btn" aria-haspopup="true" aria-expanded="false">⬇ Exportar ▾</button>
      <div class="row-menu__panel${hasDesc ? ' export-menu__panel' : ''}" id="${id}-panel" role="menu" hidden>
        ${items.map(i => `
          <button type="button" class="row-menu__item${i.desc ? ' export-menu__item' : ''}" role="menuitem" data-key="${esc(i.key)}">
            <span>${itemHtml(i)}</span>
          </button>
        `).join('')}
        ${note ? `<div class="export-menu__note">${esc(note)}</div>` : ''}
      </div>
    </div>
  `;

  const btn   = container.querySelector(`#${id}-btn`);
  const panel = container.querySelector(`#${id}-panel`);

  function closePanel() {
    panel.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', 'false');
  }
  function openPanel() {
    closeAllPanels(); // cierra cualquier otro dropdown de exportar abierto
    panel.removeAttribute('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }

  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (panel.hasAttribute('hidden')) openPanel(); else closePanel();
  });
  btn.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePanel();
  });
  panel.addEventListener('click', e => e.stopPropagation());
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePanel(); btn.focus(); }
  });

  for (const item of items) {
    panel.querySelector(`[data-key="${item.key}"]`).addEventListener('click', async () => {
      closePanel();
      if (item.key === 'excel') {
        // El export a Excel puede demorar (ExcelJS + workbook grande) — feedback en el botón.
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Generando…';
        try {
          await item.action();
        } catch (err) {
          showToast('Error al generar el archivo: ' + err.message, 'danger');
        } finally {
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      } else {
        try {
          await item.action();
          if (item.key === 'copy') showToast('📋 Tabla copiada al portapapeles', 'success');
        } catch (err) {
          showToast('Error: ' + err.message, 'danger');
        }
      }
    });
  }
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
