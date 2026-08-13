// clientsList.js — Pantalla de inicio: lista de clientes
//
// De un vistazo: el estado del mes de cada cliente (semáforo), qué controles
// corrió y cuándo. Desde acá el usuario ejecuta controles, ve resultados,
// o entra al menú "⋯" para agrupadores / checklist / borrar.

import { getClients, getInactiveClients, createClient, hideClient, unhideClient, deleteClient, getControlRuns, getControlRunResults, exportDbBackup, importDbBackup, getConfig } from '../db.js';
import { showToast, showConfirm } from './toast.js';
import { CONTROL_REGISTRY } from '../controls/registry.js';
import { computeSemaforoStatus, DEFAULT_SEMAFORO_THRESHOLD_PCT } from '../controls/semaforo.js';
import { periodToLabel, currentPeriod, previousPeriod, nextPeriod } from '../utils/dates.js';
import { renderHelpPopover, CONTROL_HELP } from './helpPopover.js';
import { downloadBlob } from '../utils/exportData.js';
import { tryAutoLoadSeed, getLoadedSeedMeta, inspectSeed, applySeed, tryLoadKnownCompanies, tryLoadKnownConsultants } from '../seed/importSeed.js';
import { setHeader } from './appHeader.js';

const TIER_DOT = { ok: 'ok', warn: 'warn', error: 'error', neutral: 'neutral', info: 'neutral' };

function closeAllRowMenus() {
  document.querySelectorAll('.row-menu__panel').forEach(p => p.setAttribute('hidden', ''));
}

// Cierra cualquier menú "⋯" abierto al clickear afuera. Se registra una sola
// vez a nivel módulo (el módulo sólo se evalúa una vez por carga de página).
document.addEventListener('click', closeAllRowMenus);

// El panel usa position:fixed calculado desde el botón (en vez de depender
// de position:absolute contra un ancestro) porque la tabla vive dentro de un
// contenedor con overflow-x:auto — eso hace que el navegador recorte
// cualquier hijo que se salga verticalmente, y el menú quedaba tapado.
function positionRowMenuPanel(btn, panel) {
  const rect = btn.getBoundingClientRect();
  panel.style.position = 'fixed';
  panel.style.top = `${rect.bottom + 4}px`;
  panel.style.left = 'auto';
  panel.style.right = `${window.innerWidth - rect.right}px`;
}

/**
 * Renderiza la pantalla de clientes en el elemento indicado.
 * @param {HTMLElement} root
 */
export async function renderClientsList(root) {
  const state = { period: currentPeriod() };

  // El inicio no tiene contexto de cliente ni pasos: la barra queda con la
  // identidad y el selector de tema, nada más. El selector de mes y el menú
  // "Datos ▾" se mudan a sus slots cuando se rediseñe esta pantalla.
  setHeader();

  root.innerHTML = `
    <div class="page-content">
      <div class="page-actions">
        <div class="page-actions__title">
          <h2>Clientes</h2>
          <span id="js-control-help"></span>
          <span id="js-seed-version" style="font-size:12px;color:var(--t3);margin-left:var(--sp-3);"></span>
        </div>
        <div class="page-actions__buttons" style="align-items:center;">
          <div class="month-selector">
            <button type="button" class="month-selector__arrow" id="js-month-prev" aria-label="Mes anterior">‹</button>
            <span class="month-selector__label" id="js-month-label"></span>
            <button type="button" class="month-selector__arrow" id="js-month-next" aria-label="Mes siguiente">›</button>
          </div>
          <button class="btn btn--ghost btn--pill" id="js-seed-import-btn" title="Importa la cartera de clientes desde un archivo de seed">📥 Importar cartera</button>
          <input type="file" accept="application/json" id="js-seed-file-input" hidden>
          <button class="btn btn--ghost btn--pill" id="js-backup-export-btn" title="Descarga un archivo con todos los clientes, sesiones y corridas guardadas en este navegador">⬇ Respaldo</button>
          <button class="btn btn--ghost btn--pill" id="js-backup-import-btn" title="Reemplaza todos los datos de este navegador por los de un archivo de respaldo">⬆ Restaurar</button>
          <input type="file" accept="application/json" id="js-backup-file-input" hidden>
          <button class="btn btn--primary btn--pill" id="js-new-client-btn">+ Nuevo cliente</button>
        </div>
      </div>
      <div id="js-clients-container">
        <div class="skeleton-cards">
          ${[0,1,2].map(() => `
            <div class="skeleton-card">
              <div class="skeleton-line skeleton-line--title"></div>
              <div class="skeleton-line skeleton-line--sm"></div>
              <div class="skeleton-line skeleton-line--sm"></div>
              <div class="skeleton-footer"></div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  root.querySelector('#js-new-client-btn').addEventListener('click', () => showCreateModal(root, state));
  root.querySelector('#js-month-prev').addEventListener('click', () => changeMonth(root, state, previousPeriod));
  root.querySelector('#js-month-next').addEventListener('click', () => changeMonth(root, state, nextPeriod));
  root.querySelector('#js-backup-export-btn').addEventListener('click', handleBackupExport);
  root.querySelector('#js-backup-import-btn').addEventListener('click', () => root.querySelector('#js-backup-file-input').click());
  root.querySelector('#js-backup-file-input').addEventListener('change', (e) => handleBackupImport(e, root, state));
  root.querySelector('#js-seed-import-btn').addEventListener('click', () => root.querySelector('#js-seed-file-input').click());
  root.querySelector('#js-seed-file-input').addEventListener('change', (e) => handleSeedFileChosen(e, root, state));
  renderHelpPopover(root.querySelector('#js-control-help'), CONTROL_HELP);

  updateMonthLabel(root, state);
  await updateSeedVersionLabel(root);
  await reloadList(root, state);

  // Intento silencioso de auto-carga (útil cuando la app se sirva desde
  // infraestructura propia de H&A — hoy en GitHub Pages este archivo no
  // existe a propósito, así que esto no hace nada la mayoría de las veces).
  const autoSeed = await tryAutoLoadSeed();
  if (autoSeed) await handleSeedFile(autoSeed, root, state);
}

async function updateSeedVersionLabel(root) {
  const label = root.querySelector('#js-seed-version');
  if (!label) return;
  const meta = await getLoadedSeedMeta();
  label.textContent = meta
    ? `Seed v${meta.configVersion}${meta.updatedAt ? ` · ${meta.updatedAt}` : ''}`
    : 'Sin seed importado';
}

async function changeMonth(root, state, stepFn) {
  state.period = stepFn(state.period);
  updateMonthLabel(root, state);
  await reloadList(root, state);
}

function updateMonthLabel(root, state) {
  const label = root.querySelector('#js-month-label');
  if (label) label.textContent = periodToLabel(state.period);
}

async function reloadList(root, state) {
  const container = root.querySelector('#js-clients-container');
  const [clients, hiddenCount] = await Promise.all([
    getClients(),
    getInactiveClients().then(l => l.length),
  ]);

  const hiddenLinkHtml = hiddenCount > 0
    ? `<button class="btn btn--ghost btn--sm" id="js-hidden-clients-btn" style="margin-bottom:var(--sp-3);">
         🙈 ${hiddenCount} cliente${hiddenCount === 1 ? '' : 's'} oculto${hiddenCount === 1 ? '' : 's'}
       </button>`
    : '';

  if (clients.length === 0) {
    // Con clientes ocultos pero ninguno activo, la pantalla de bienvenida
    // ("Bienvenido a Controles Nómina") sería engañosa — no es la primera vez.
    if (hiddenCount > 0) {
      container.innerHTML = `
        <div class="empty-state" style="max-width:480px;margin:0 auto;">
          <div class="empty-state__icon" style="margin-bottom:var(--sp-3);font-size:2.4em;">🙈</div>
          <div class="empty-state__title">No hay clientes activos</div>
          <p class="empty-state__text" style="margin-bottom:var(--sp-5);">
            Tenés ${hiddenCount} cliente${hiddenCount === 1 ? '' : 's'} oculto${hiddenCount === 1 ? '' : 's'} — nada se borró, sólo están fuera de esta lista.
          </p>
          <button class="btn btn--primary" id="js-hidden-clients-btn">Ver clientes ocultos</button>
        </div>
      `;
      container.querySelector('#js-hidden-clients-btn').addEventListener('click', () => showHiddenClientsModal(root, state));
      return;
    }
    container.innerHTML = `
      <div class="empty-state" style="max-width:680px;margin:0 auto;">
        <div class="empty-state__icon" style="margin-bottom:var(--sp-3);">
          <img
            src="https://hidalgoyasociados.com.ar/wp-content/uploads/2023/10/ha-iso.png"
            alt="Hidalgo &amp; Asociados"
            width="64" height="64"
            style="display:block;margin:0 auto;border-radius:50%;"
            onerror="this.outerHTML='<div style=&quot;width:64px;height:64px;margin:0 auto;border-radius:50%;background:var(--color-primary);color:var(--color-white);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;&quot;>H&amp;A</div>'">
        </div>
        <div class="empty-state__title">Bienvenido a Controles Nómina</div>
        <p class="empty-state__text" style="margin-bottom:var(--sp-5);">
          Esta app cruza los archivos que te manda el cliente contra el Tabulado de nómina y
          detecta diferencias de manera automática — todo en tu navegador, sin subir nada a Internet.
        </p>

        <div style="
          display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
          gap:var(--sp-3);text-align:left;margin-bottom:var(--sp-5);
        ">
          <div style="padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
            <div style="font-size:1.4em;margin-bottom:var(--sp-1);">1️⃣</div>
            <strong style="font-size:var(--text-sm);">Creá un cliente</strong>
            <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Cada cliente guarda su propio catálogo de conceptos y sus perfiles de columnas.</p>
          </div>
          <div style="padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
            <div style="font-size:1.4em;margin-bottom:var(--sp-1);">2️⃣</div>
            <strong style="font-size:var(--text-sm);">Cargá los archivos</strong>
            <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Tabulado, Cat. Empleados, Brutos, NR, Rendimiento — solo los que necesite cada control.</p>
          </div>
          <div style="padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
            <div style="font-size:1.4em;margin-bottom:var(--sp-1);">3️⃣</div>
            <strong style="font-size:var(--text-sm);">Ejecutá los controles</strong>
            <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Mirás los resultados, descargás un Excel con las diferencias y listo.</p>
          </div>
        </div>

        <button class="btn btn--primary btn--lg" id="js-first-client-btn">+ Crear primer cliente</button>
        <p class="text-sm text-muted" style="margin-top:var(--sp-3);">
          🔒 Todos los datos quedan guardados localmente en este navegador.
        </p>
      </div>
    `;
    container.querySelector('#js-first-client-btn').addEventListener('click', () => showCreateModal(root, state));
    return;
  }

  const thresholdPct = (await getConfig('semaforoThresholdPct')) ?? DEFAULT_SEMAFORO_THRESHOLD_PCT;
  const rows = await Promise.all(clients.map(c => buildClientRowData(c, state.period, thresholdPct)));

  const monthName = periodToLabel(state.period).split(' ')[0];
  container.innerHTML = `
    ${hiddenLinkHtml}
    <div class="card" style="overflow-x:auto;">
      <div class="home-table" style="min-width:900px;">
        <div class="home-table__head">
          <span>Cliente</span>
          <span>Estado ${esc(monthName)}</span>
          <span>Controles del mes</span>
          <span>Última corrida</span>
          <span style="text-align:right;">Acciones</span>
        </div>
        ${rows.map(renderClientRow).join('')}
      </div>
    </div>
  `;

  rows.forEach(r => attachRowEvents(container, r, root, state));
  container.querySelector('#js-hidden-clients-btn')?.addEventListener('click', () => showHiddenClientsModal(root, state));
}

/**
 * Panel de clientes ocultos: reactivar (vuelve a la lista, sin tocar nada)
 * o borrar definitivamente (cascada completa, irreversible — pide tipear el
 * nombre del cliente para confirmar, misma fricción que borrar un repo en
 * GitHub). Sólo se llega hasta acá desde el link "N clientes ocultos", nunca
 * directo desde el menú de un cliente activo.
 */
async function showHiddenClientsModal(root, state) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  async function renderBody() {
    const hidden = await getInactiveClients();
    const body = overlay.querySelector('.modal__body');
    body.innerHTML = hidden.length === 0
      ? `<p class="text-muted" style="padding:var(--sp-4) 0;text-align:center;">No hay clientes ocultos.</p>`
      : hidden.map(c => `
          <div class="row-menu-list-item" data-client-id="${c.id}" style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);padding:var(--sp-3) 0;border-bottom:1px solid var(--color-border);">
            <div>
              <strong>${esc(c.name)}</strong>
              <span class="text-sm text-muted" style="display:block;">${esc(c.code)}</span>
            </div>
            <div style="display:flex;gap:var(--sp-2);flex-shrink:0;">
              <button class="btn btn--ghost btn--sm js-unhide-btn">↩ Reactivar</button>
              <button class="btn btn--danger btn--sm js-hard-delete-btn">🗑 Borrar definitivamente</button>
            </div>
          </div>
        `).join('');

    body.querySelectorAll('.js-unhide-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.closest('[data-client-id]').dataset.clientId);
        await unhideClient(id);
        await renderBody();
        await reloadList(root, state);
      });
    });
    body.querySelectorAll('.js-hard-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('[data-client-id]');
        const id = Number(row.dataset.clientId);
        const client = hidden.find(c => c.id === id);
        const ok = await showConfirm(
          `Esto borra TODO lo de "${client.name}" para siempre: corridas, resultados, agrupadores, catálogo — no hay vuelta atrás.\n\n`
          + `Escribí el nombre del cliente para confirmar.`,
          { type: 'danger', confirmLabel: 'Borrar definitivamente', requireText: client.name }
        );
        if (!ok) return;
        try {
          await deleteClient(id);
          await renderBody();
          await reloadList(root, state);
        } catch (err) {
          showToast(`Error al borrar: ${err.message}`, 'danger');
        }
      });
    });
  }

  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal__header">
        <h3>Clientes ocultos</h3>
        <button class="modal__close" id="js-close-hidden-modal">✕</button>
      </div>
      <div class="modal__body"></div>
    </div>
  `;

  overlay.querySelector('#js-close-hidden-modal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  document.body.appendChild(overlay);
  await renderBody();
}

// Deriva, para un cliente y un período, el estado del mes + mini-dots por
// control + fecha de la última corrida (de ese período, o la más reciente
// de cualquier período si este mes no se corrió nada).
async function buildClientRowData(client, period, thresholdPct) {
  const allRuns = await getControlRuns(client.code); // ya viene ordenado desc por createdAt
  const runsForPeriod = allRuns.filter(r => r.period === period);
  const statusRun = runsForPeriod.find(r => r.isDefinitive) || runsForPeriod[0] || null;
  const lastRunOverall = allRuns[0] || null;

  let status = { tier: 'neutral', label: 'Sin correr este mes' };
  let miniDots = [];

  if (statusRun) {
    const resultsRows = await getControlRunResults(statusRun.id);
    const summaries = resultsRows.map(row => {
      const ctrl = CONTROL_REGISTRY[row.controlId];
      if (!ctrl) return null;
      const summary = ctrl.summarize ? ctrl.summarize(row.results) : { status: 'info' };
      const tier = summary.status === 'error'
        ? 'error'
        : summary.unitsTotal == null
          ? 'info'
          : computeSemaforoStatus(summary.unitsWithDiff, summary.unitsTotal, thresholdPct);
      return { ctrl, tier, unitsWithDiff: summary.unitsWithDiff || 0 };
    }).filter(Boolean);

    miniDots = summaries.map(s => ({ label: s.ctrl.label, tier: s.tier }));

    const checked = summaries.filter(s => s.tier !== 'info');
    const overallTier = checked.some(s => s.tier === 'error') ? 'error'
      : checked.some(s => s.tier === 'warn') ? 'warn'
      : checked.length > 0 ? 'ok' : 'neutral';
    const totalDiffUnits = checked.reduce((sum, s) => sum + s.unitsWithDiff, 0);

    if (overallTier === 'ok') {
      status = { tier: 'ok', label: statusRun.isDefinitive ? 'Definitivo · sin difs' : 'Sin diferencias · borrador' };
    } else if (overallTier === 'error') {
      status = { tier: 'error', label: `${totalDiffUnits} dif${totalDiffUnits === 1 ? '' : 's'} · revisar` };
    } else if (overallTier === 'warn') {
      status = { tier: 'warn', label: `${totalDiffUnits} dif${totalDiffUnits === 1 ? '' : 's'} · en revisión` };
    } else {
      status = { tier: 'neutral', label: statusRun.isDefinitive ? 'Definitivo' : 'Borrador' };
    }
  }

  const dateSourceRun = statusRun || lastRunOverall;
  const lastRunText = dateSourceRun
    ? `${fmtRelativeShort(dateSourceRun.createdAt)} · ${dateSourceRun.isDefinitive ? 'definitivo' : 'borrador'}`
      + (dateSourceRun.period !== period ? ` (${periodToLabel(dateSourceRun.period)})` : '')
    : '—';

  return { client, period, statusRun, lastRunOverall, status, miniDots, lastRunText };
}

const SOURCE_SYSTEM_LABEL = { meta4: 'M4', axton: 'Axton' };

function renderClientRow(r) {
  const { client, status, miniDots, lastRunText, lastRunOverall } = r;

  const miniDotsHtml = miniDots.length
    ? miniDots.map(d => `<span class="status-dot status-dot--sm status-dot--${TIER_DOT[d.tier]}" title="${esc(d.label)}"></span>`).join('')
    : '<span style="font-size:12px;color:var(--t3);">—</span>';

  const metaParts = [
    client.sourceSystem ? SOURCE_SYSTEM_LABEL[client.sourceSystem] || client.sourceSystem : null,
    client.team || null,
    client.ccts && client.ccts.length ? client.ccts.join(', ') : null,
  ].filter(Boolean);

  return `
    <div class="home-table__row" data-client-id="${client.id}">
      <div>
        <strong class="home-table__client-name">${esc(client.name)}</strong>
        ${metaParts.length ? `<span class="home-table__client-sub">${esc(metaParts.join(' · '))}</span>` : ''}
        ${client.notes ? `<span class="home-table__client-sub">${esc(client.notes)}</span>` : ''}
      </div>
      <span class="home-table__status home-table__status--${TIER_DOT[status.tier]}">
        <span class="status-dot status-dot--sm status-dot--${TIER_DOT[status.tier]}"></span>
        ${esc(status.label)}
      </span>
      <span class="home-mini-dots">${miniDotsHtml}</span>
      <span class="home-table__last-run">${esc(lastRunText)}</span>
      <div class="home-table__actions">
        <button class="btn btn--primary btn--sm btn--pill js-run-btn">▶ Ejecutar</button>
        <button class="btn btn--ghost btn--sm btn--pill js-results-btn" ${lastRunOverall ? '' : 'disabled'}>Resultados</button>
        <div class="row-menu">
          <button class="btn btn--ghost btn--sm btn--pill js-menu-btn" aria-label="Más acciones">⋯</button>
          <div class="row-menu__panel" hidden>
            <button class="row-menu__item js-groupers-btn">⚙ Agrupadores</button>
            <button class="row-menu__item js-checklist-btn">📊 Estado mensual</button>
            <button class="row-menu__item js-hide-btn">🙈 Ocultar cliente</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function attachRowEvents(container, r, root, state) {
  const row = container.querySelector(`[data-client-id="${r.client.id}"]`);
  if (!row) return;

  row.querySelector('.js-run-btn').addEventListener('click', () => {
    window.location.hash = `#/controls/${r.client.id}`;
  });

  const resultsBtn = row.querySelector('.js-results-btn');
  if (r.lastRunOverall) {
    resultsBtn.addEventListener('click', () => {
      window.location.hash = `#/control-results/${r.lastRunOverall.id}`;
    });
  }

  row.querySelector('.js-checklist-btn').addEventListener('click', () => {
    window.location.hash = `#/checklist/${r.client.id}`;
  });
  row.querySelector('.js-groupers-btn').addEventListener('click', () => {
    window.location.hash = `#/client/${r.client.id}/groupers`;
  });
  row.querySelector('.js-hide-btn').addEventListener('click', async () => {
    row.querySelector('.row-menu__panel')?.setAttribute('hidden', '');
    if (!await showConfirm(
      `¿Ocultar el cliente "${r.client.name}"?\nDesaparece de esta lista pero no se borra nada — lo podés volver a mostrar desde "Clientes ocultos".`,
      { type: 'warning', confirmLabel: 'Ocultar' }
    )) return;
    try {
      await hideClient(r.client.id);
      await reloadList(root, state);
    } catch (err) {
      showToast(`Error al ocultar: ${err.message}`, 'danger');
    }
  });

  const menuBtn = row.querySelector('.js-menu-btn');
  const panel   = row.querySelector('.row-menu__panel');
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasHidden = panel.hasAttribute('hidden');
    closeAllRowMenus();
    if (wasHidden) {
      positionRowMenuPanel(menuBtn, panel);
      panel.removeAttribute('hidden');
      // Si el usuario scrollea con el menú abierto, la posición fija queda
      // desactualizada — más simple cerrarlo que ir recalculando.
      window.addEventListener('scroll', closeAllRowMenus, { once: true, capture: true });
    }
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
}

async function handleBackupExport() {
  try {
    const backup = await exportDbBackup();
    const stamp = backup.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
    downloadBlob(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
      `controles-nomina-respaldo-${stamp}.json`
    );
    showToast('Respaldo descargado.', 'success');
  } catch (err) {
    showToast(`Error al exportar el respaldo: ${err.message}`, 'danger');
  }
}

async function handleBackupImport(e, root, state) {
  const input = e.target;
  const file = input.files?.[0];
  input.value = ''; // permite volver a elegir el mismo archivo más adelante
  if (!file) return;

  const ok = await showConfirm(
    'Restaurar un respaldo reemplaza TODOS los clientes, sesiones y corridas guardadas en este navegador por los del archivo. '
    + 'No se puede deshacer. ¿Continuar?',
    { type: 'danger', confirmLabel: 'Restaurar y reemplazar' }
  );
  if (!ok) return;

  try {
    const backup = JSON.parse(await file.text());
    await importDbBackup(backup);
    showToast('Respaldo restaurado. Recargando…', 'success');
    setTimeout(() => window.location.reload(), 900);
  } catch (err) {
    showToast(`Error al restaurar el respaldo: ${err.message}`, 'danger');
  }
}

async function handleSeedFileChosen(e, root, state) {
  const input = e.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  let seed;
  try {
    seed = JSON.parse(await file.text());
  } catch {
    showToast('El archivo elegido no es un JSON válido.', 'danger');
    return;
  }
  await handleSeedFile(seed, root, state);
}

async function handleSeedFile(seed, root, state) {
  const loadedMeta = await getLoadedSeedMeta();
  const inspection = inspectSeed(seed, loadedMeta);

  if (!inspection.compatible) {
    showToast(`No se pudo importar el seed: ${inspection.reason}`, 'danger');
    return;
  }

  const lines = [`Vas a importar ${inspection.clientCount} clientes del seed (v${inspection.seedConfigVersion}).`];
  if (inspection.olderThanLoaded) {
    lines.push(`⚠ Este seed es más viejo que el que ya tenés cargado (v${inspection.loadedConfigVersion}).`);
  }
  lines.push('No se toca tu historial de corridas guardado en este navegador. ¿Continuar?');

  const ok = await showConfirm(lines.join('\n'), {
    type: inspection.olderThanLoaded ? 'danger' : 'warning',
    confirmLabel: 'Importar',
  });
  if (!ok) return;

  try {
    const result = await applySeed(seed);
    showToast(`Seed importado: ${result.created.length} clientes nuevos, ${result.updated.length} actualizados.`, 'success');
    if (result.nameConflicts.length) {
      const detail = result.nameConflicts.map(c => `${c.code}: local="${c.localName}" vs seed="${c.seedName}"`).join(' · ');
      showToast(`${result.nameConflicts.length} cliente(s) con nombre distinto al del seed (no se pisó automáticamente): ${detail}`, 'warning', 0);
    }
    if (result.configOverrides.length) {
      const detail = result.configOverrides.map(c => `${c.clientCode}/${c.controlId}`).join(', ');
      showToast(`${result.configOverrides.length} configuración(es) de control ya tenían un ajuste local distinto al del seed y no se tocaron: ${detail}`, 'warning', 0);
    }
    await updateSeedVersionLabel(root);
    await reloadList(root, state);
  } catch (err) {
    showToast(`Error al importar el seed: ${err.message}`, 'danger');
  }
}

// Arma las opciones de Equipo/Consultor/CCTs a partir de lo que ya hay
// cargado (seed importado + clientes existentes + compañías conocidas del
// seed real todavía commiteado, D-010) — nunca texto libre, así las
// respuestas quedan encerradas a lo que ya se conoce. Si no hay nada
// cargado todavía, el campo queda vacío con una nota explicando por qué
// (en vez de dejar escribir cualquier cosa).
export async function buildClientCatalogs(knownCompanies = [], knownConsultants = []) {
  const [seedTeams, seedConsultants, existingClients] = await Promise.all([
    getConfig('seedTeams'),
    getConfig('seedConsultants'),
    getClients(),
  ]);

  const teamMap = new Map();
  (seedTeams || []).forEach(t => teamMap.set(t.code, t.lead ? `${t.code} — ${t.lead}` : t.code));
  existingClients.forEach(c => { if (c.team && !teamMap.has(c.team)) teamMap.set(c.team, c.team); });
  knownCompanies.forEach(c => { if (c.team && !teamMap.has(c.team)) teamMap.set(c.team, c.team); });
  const teamOptions = [...teamMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const consultantSet = new Set();
  (seedTeams || []).forEach(t => { if (t.lead) consultantSet.add(t.lead); });
  (seedConsultants || []).forEach(c => { if (c.name) consultantSet.add(c.name); });
  existingClients.forEach(c => { if (c.consultant) consultantSet.add(c.consultant); });
  knownCompanies.forEach(c => { if (c.consultant) consultantSet.add(c.consultant); });
  knownConsultants.forEach(name => { if (name) consultantSet.add(name); });
  const consultantOptions = [...consultantSet].sort((a, b) => a.localeCompare(b));

  const cctSet = new Set();
  existingClients.forEach(c => (c.ccts || []).forEach(cct => { if (cct) cctSet.add(cct); }));
  knownCompanies.forEach(c => (c.ccts || []).forEach(cct => { if (cct) cctSet.add(cct); }));
  const cctOptions = [...cctSet].sort((a, b) => a.localeCompare(b));

  return { teamOptions, consultantOptions, cctOptions };
}

async function showCreateModal(root, state) {
  const [knownCompanies, knownConsultants] = await Promise.all([
    tryLoadKnownCompanies(),
    tryLoadKnownConsultants(),
  ]);
  const { teamOptions, consultantOptions, cctOptions } = await buildClientCatalogs(knownCompanies, knownConsultants);

  const emptyHint = (label) => `<p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Todavía no hay ${label} cargados/as — importá el seed o pedile a un admin que los agregue.</p>`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3>Nuevo cliente</h3>
        <button class="modal__close" id="js-close-modal">✕</button>
      </div>
      <div class="modal__body">
        <form id="js-create-client-form">
          <div class="form-group">
            <label class="form-label form-label--required">Nombre del cliente</label>
            <input type="text" class="form-input" id="js-client-name" placeholder="Ej: ACME SA" autofocus
                   list="js-known-companies" autocomplete="off">
            <datalist id="js-known-companies">
              ${knownCompanies.map(c => `<option value="${esc(c.name)}">`).join('')}
            </datalist>
            ${knownCompanies.length
              ? `<p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Si el nombre coincide con una de las ${knownCompanies.length} compañías conocidas, el resto de los datos se completa solo (podés cambiarlo después).</p>`
              : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Notas internas (opcional)</label>
            <input type="text" class="form-input" id="js-client-notes" placeholder="Ej: CUIT, contacto, observaciones...">
          </div>
          <details style="margin-top:var(--sp-4);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:var(--sp-3);">
            <summary style="cursor:pointer;font-weight:600;font-size:var(--text-sm);">Más datos del cliente (opcional)</summary>
            <div style="margin-top:var(--sp-4);">
              <div class="form-group">
                <label class="form-label">Código</label>
                <input type="text" class="form-input" id="js-client-code" placeholder="Se genera solo a partir del nombre si lo dejás vacío" style="text-transform:uppercase;">
              </div>
              <div class="form-group">
                <label class="form-label">Sistema de origen</label>
                <select class="form-input" id="js-client-source-system">
                  <option value="meta4">Meta4 / PeopleNet</option>
                  <option value="axton">Axton IT</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Equipo</label>
                <select class="form-input" id="js-client-team">
                  <option value="">Sin equipo</option>
                  ${teamOptions.map(([code, label]) => `<option value="${esc(code)}">${esc(label)}</option>`).join('')}
                </select>
                ${teamOptions.length === 0 ? emptyHint('equipos') : ''}
              </div>
              <div class="form-group">
                <label class="form-label">Consultor/a</label>
                <select class="form-input" id="js-client-consultant">
                  <option value="">Sin consultor/a</option>
                  ${consultantOptions.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}
                </select>
                ${consultantOptions.length === 0 ? emptyHint('consultores') : ''}
              </div>
              <div class="form-group">
                <label class="form-label">Convenios / CCTs</label>
                <select class="form-input" id="js-client-ccts" multiple size="4">
                  ${cctOptions.map(cct => `<option value="${esc(cct)}">${esc(cct)}</option>`).join('')}
                </select>
                ${cctOptions.length
                  ? `<p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">Ctrl/Cmd + clic para elegir varios.</p>`
                  : emptyHint('convenios')}
              </div>
              <div class="form-group">
                <label class="form-label">Dotación</label>
                <input type="number" class="form-input" id="js-client-pays" placeholder="Cantidad de legajos" min="0">
              </div>
              <div class="form-group">
                <label class="form-label">Atributos</label>
                <div style="display:flex;flex-wrap:wrap;gap:var(--sp-3);">
                  <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);">
                    <input type="checkbox" id="js-client-attr-pluriempleo"> Pluriempleo
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);">
                    <input type="checkbox" id="js-client-attr-holding"> Holding
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);">
                    <input type="checkbox" id="js-client-attr-paymentUsd"> Pago en USD
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);">
                    <input type="checkbox" id="js-client-attr-retroactividad"> Retroactividad
                  </label>
                </div>
              </div>
            </div>
          </details>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn--ghost" id="js-cancel-create">Cancelar</button>
        <button class="btn btn--primary" id="js-confirm-create">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.querySelector('#js-close-modal').addEventListener('click', close);
  overlay.querySelector('#js-cancel-create').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // Autocompletar: si el nombre tipeado coincide con una compañía conocida,
  // completa el resto de los campos con sus datos reales — el usuario puede
  // cambiar cualquiera después, esto solo ahorra tipeo cuando ya se conoce
  // la compañía.
  const nameInput = overlay.querySelector('#js-client-name');
  let lastAutofilledName = null;
  nameInput.addEventListener('input', () => {
    const typed = nameInput.value.trim().toLowerCase();
    const match = knownCompanies.find(c => c.name.trim().toLowerCase() === typed);
    if (!match || match.name === lastAutofilledName) return;
    lastAutofilledName = match.name;

    overlay.querySelector('#js-client-code').value = match.code || '';
    overlay.querySelector('#js-client-source-system').value = match.sourceSystem || 'meta4';
    overlay.querySelector('#js-client-team').value = match.team || '';
    overlay.querySelector('#js-client-consultant').value = match.consultant || '';
    overlay.querySelector('#js-client-pays').value = match.pays ?? '';
    const cctsSelect = overlay.querySelector('#js-client-ccts');
    Array.from(cctsSelect.options).forEach(o => { o.selected = (match.ccts || []).includes(o.value); });
    const attrs = match.attributes || {};
    overlay.querySelector('#js-client-attr-pluriempleo').checked = !!attrs.pluriempleo;
    overlay.querySelector('#js-client-attr-holding').checked = !!attrs.holding;
    overlay.querySelector('#js-client-attr-paymentUsd').checked = !!attrs.paymentUsd;
    overlay.querySelector('#js-client-attr-retroactividad').checked = !!attrs.retroactividad;

    overlay.querySelector('#js-create-client-form details').open = true;
    showToast(`Datos de "${match.name}" completados automáticamente. Podés cambiar lo que necesites.`, 'info');
  });

  overlay.querySelector('#js-confirm-create').addEventListener('click', async () => {
    const name = overlay.querySelector('#js-client-name').value.trim();
    const notes = overlay.querySelector('#js-client-notes').value.trim();
    if (!name) { showToast('El nombre del cliente es obligatorio.', 'warning'); return; }

    const ccts = Array.from(overlay.querySelector('#js-client-ccts').selectedOptions).map(o => o.value);
    const paysValue = overlay.querySelector('#js-client-pays').value;

    const extra = {
      code:         overlay.querySelector('#js-client-code').value,
      sourceSystem: overlay.querySelector('#js-client-source-system').value,
      team:         overlay.querySelector('#js-client-team').value,
      consultant:   overlay.querySelector('#js-client-consultant').value,
      ccts,
      pays:         paysValue ? Number(paysValue) : null,
      attributes: {
        pluriempleo:     overlay.querySelector('#js-client-attr-pluriempleo').checked,
        holding:         overlay.querySelector('#js-client-attr-holding').checked,
        paymentUsd:      overlay.querySelector('#js-client-attr-paymentUsd').checked,
        retroactividad:  overlay.querySelector('#js-client-attr-retroactividad').checked,
      },
    };

    try {
      await createClient(name, notes, extra);
      close();
      await reloadList(root, state);
    } catch (err) {
      showToast(`Error al crear el cliente: ${err.message}`, 'danger');
    }
  });

  // Enter en el campo de nombre también guarda
  overlay.querySelector('#js-client-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('#js-confirm-create').click();
  });
}

function fmtRelativeShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Hoy ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
