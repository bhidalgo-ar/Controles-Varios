// tabs.js — Solapas accesibles y reutilizables para pantallas de resultados
// con más de una tabla (patrón WAI-ARIA "Tabs": role=tablist/tab/tabpanel).
//
// Cada panel se renderiza perezosamente la primera vez que se activa y queda
// cacheado en el DOM (no se desmonta al cambiar de solapa) — importa porque un
// panel puede montar su propia paginación (initShowMorePagination) y su propio
// buscador (initSearchCombobox), que no deben re-inicializarse al volver.

let tabsIdCounter = 0;

/**
 * @param {HTMLElement} container - dónde montar el tablist + los paneles
 * @param {object} opts
 * @param {{id: string, label: string, render: (panelEl: HTMLElement) => void}[]} opts.tabs
 * @param {string} [opts.activeId] - id de la solapa activa al montar (default: la primera)
 * @param {(id: string) => void} [opts.onChange]
 * @returns {{ setActive(id: string): void }}
 */
export function initTabs(container, { tabs, activeId, onChange = () => {} } = {}) {
  const uid = `tabs-${++tabsIdCounter}`;
  let active = tabs.some(t => t.id === activeId) ? activeId : tabs[0]?.id;
  const rendered = new Set();

  container.innerHTML = '';
  container.classList.add('tabs');

  const tablist = document.createElement('div');
  tablist.className = 'tabs__list';
  tablist.setAttribute('role', 'tablist');

  const panelsHost = document.createElement('div');
  panelsHost.className = 'tabs__panels';

  const tabEls = new Map();
  const panelEls = new Map();

  for (const tab of tabs) {
    const tabId = `${uid}-tab-${tab.id}`;
    const panelId = `${uid}-panel-${tab.id}`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = tabId;
    btn.className = 'tabs__tab';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', panelId);
    btn.setAttribute('aria-selected', String(tab.id === active));
    btn.setAttribute('tabindex', tab.id === active ? '0' : '-1');
    if (tab.id === active) btn.classList.add('tabs__tab--active');
    btn.textContent = tab.label;
    btn.addEventListener('click', () => setActive(tab.id));
    tablist.appendChild(btn);
    tabEls.set(tab.id, btn);

    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'tabs__panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tabId);
    panel.hidden = tab.id !== active;
    panelsHost.appendChild(panel);
    panelEls.set(tab.id, panel);
  }

  tablist.addEventListener('keydown', (e) => {
    const ids = tabs.map(t => t.id);
    const idx = ids.indexOf(active);
    let nextIdx = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % ids.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = ids.length - 1;
    if (nextIdx === null) return;
    e.preventDefault();
    setActive(ids[nextIdx]);
    tabEls.get(ids[nextIdx])?.focus();
  });

  container.appendChild(tablist);
  container.appendChild(panelsHost);

  function renderPanel(id) {
    if (rendered.has(id)) return;
    rendered.add(id);
    tabs.find(t => t.id === id)?.render(panelEls.get(id));
  }

  function setActive(id) {
    if (!tabEls.has(id) || id === active) { renderPanel(id); return; }
    active = id;
    for (const [tid, el] of tabEls) {
      const isActive = tid === id;
      el.classList.toggle('tabs__tab--active', isActive);
      el.setAttribute('aria-selected', String(isActive));
      el.setAttribute('tabindex', isActive ? '0' : '-1');
    }
    for (const [tid, el] of panelEls) el.hidden = tid !== id;
    renderPanel(id);
    onChange(id);
  }

  renderPanel(active);

  return { setActive };
}
