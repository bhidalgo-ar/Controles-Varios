// adminView.js — Modo admin (T6 de PLAN_v2.md)
//
// Pantalla #/admin, protegida por una contraseña cuyo hash SHA-256 se
// compara del lado del cliente. Esto es una barrera de acceso accidental,
// NO seguridad real — el código fuente es público (ver DECISIONS.md D-005).
// La protección real de integridad del seed compartido es el permiso de
// escritura sobre la carpeta de SharePoint donde se publica, no esta
// contraseña.
//
// Desde acá se edita lo mismo que trae el seed (atributos de cliente y
// controlConfigs) y se exporta un archivo con el mismo shape que
// importSeed.js sabe leer — no un formato paralelo.

import { getClients, getClient, updateClient, getControlConfigsForClient, saveControlConfig } from '../db.js';
import {
  LEGAJO_KEY_MODES, LEGAJO_KEY_MODE_LABELS, DEFAULT_LEGAJO_KEY_MODE, isValidLegajoKeyMode,
} from '../utils/legajo.js';
import { buildClientCatalogs } from './clientsList.js';
import { buildSeedExport } from '../seed/exportSeed.js';
import { downloadBlob } from '../utils/exportData.js';
import { showToast, showConfirm } from './toast.js';
import { CONTROL_REGISTRY } from '../controls/registry.js';
import { scopeLabel, controlAppliesToClient } from '../controls/scope.js';

// SHA-256 de la contraseña de acceso. Generada al implementar T6 (el usuario
// no llegó a elegir una propia) — hay que avisarle que puede rotarla acá.
const ADMIN_PASSWORD_HASH = '84c88b598db066db85f30cc6b48a64fdf731e6adac8654e567df125a3c170ccc';
const UNLOCK_SESSION_KEY = 'admin-unlocked';

const CONTROL_CONFIG_STATUSES = [
  { value: 'activo',              label: 'Activo' },
  { value: 'no_aplica',           label: 'No aplica' },
  { value: 'sin_configurar',      label: 'Sin configurar' },
  { value: 'forzado_activo',      label: 'Forzado activo (override)' },
  { value: 'forzado_no_aplica',   label: 'Forzado no aplica (override)' },
];

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function renderAdminView(root) {
  const unlocked = sessionStorage.getItem(UNLOCK_SESSION_KEY) === '1';
  if (!unlocked) {
    renderPasswordGate(root);
    return;
  }
  await renderAdminPanel(root);
}

function renderPasswordGate(root) {
  root.innerHTML = `
    <div class="page-content" style="max-width:420px;margin:0 auto;">
      <div class="card" style="padding:var(--sp-5);">
        <h2 style="margin-top:0;">Modo admin</h2>
        <p class="text-sm text-muted">
          Esta contraseña es una barrera de acceso accidental, no una protección real
          (el código de esta app es público). Sirve para no entrar acá sin querer.
        </p>
        <form id="js-admin-password-form">
          <div class="form-group">
            <label class="form-label">Contraseña</label>
            <input type="password" class="form-input" id="js-admin-password" autofocus autocomplete="off">
          </div>
          <button type="submit" class="btn btn--primary" style="width:100%;">Entrar</button>
        </form>
        <p style="margin-top:var(--sp-4);"><a href="#/">← Volver al inicio</a></p>
      </div>
    </div>
  `;

  const form = root.querySelector('#js-admin-password-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = root.querySelector('#js-admin-password');
    const hash = await sha256Hex(input.value);
    if (hash !== ADMIN_PASSWORD_HASH) {
      showToast('Contraseña incorrecta.', 'danger');
      return;
    }
    sessionStorage.setItem(UNLOCK_SESSION_KEY, '1');
    await renderAdminPanel(root);
  });
}

async function renderAdminPanel(root) {
  const clients = await getClients();
  const state = { selectedClientId: clients[0]?.id ?? null };

  root.innerHTML = `
    <div class="page-content">
      <div class="page-actions">
        <div class="page-actions__title">
          <h2>Modo admin</h2>
        </div>
        <div class="page-actions__buttons">
          <button class="btn btn--ghost btn--pill" id="js-admin-lock-btn">🔒 Salir del modo admin</button>
          <button class="btn btn--primary btn--pill" id="js-admin-export-btn">⬇ Exportar seed actualizado</button>
        </div>
      </div>

      ${clients.length === 0 ? `
        <div class="empty-state"><p>Todavía no hay clientes cargados.</p></div>
      ` : `
        <div class="card" style="display:grid;grid-template-columns:240px 1fr;gap:var(--sp-4);padding:var(--sp-4);">
          <div>
            <label class="form-label">Cliente</label>
            <select class="form-input" id="js-admin-client-select" size="12" style="height:auto;">
              ${clients.map(c => `<option value="${c.id}">${esc(c.name)} (${esc(c.code || '—')})</option>`).join('')}
            </select>
          </div>
          <div id="js-admin-client-detail"></div>
        </div>
      `}

      <p style="margin-top:var(--sp-4);"><a href="#/">← Volver al inicio</a></p>
    </div>
  `;

  root.querySelector('#js-admin-lock-btn').addEventListener('click', () => {
    sessionStorage.removeItem(UNLOCK_SESSION_KEY);
    window.location.hash = '#/';
  });

  root.querySelector('#js-admin-export-btn').addEventListener('click', handleExport);

  const select = root.querySelector('#js-admin-client-select');
  if (select) {
    select.addEventListener('change', () => {
      state.selectedClientId = Number(select.value);
      renderClientDetail(root, state);
    });
    select.value = String(state.selectedClientId);
    await renderClientDetail(root, state);
  }
}

async function handleExport() {
  try {
    const seed = await buildSeedExport('admin');
    downloadBlob(
      new Blob([JSON.stringify(seed, null, 2)], { type: 'application/json' }),
      `hya-controles-config.seed.v${seed.configVersion}.json`
    );
    showToast(`Seed v${seed.configVersion} exportado.`, 'success');
  } catch (err) {
    showToast(`Error al exportar el seed: ${err.message}`, 'danger');
  }
}

async function renderClientDetail(root, state) {
  const container = root.querySelector('#js-admin-client-detail');
  if (!container || !state.selectedClientId) return;

  const client = await getClient(state.selectedClientId);
  if (!client) { container.innerHTML = ''; return; }

  const [{ teamOptions, consultantOptions, cctOptions }, configs] = await Promise.all([
    buildClientCatalogs(),
    getControlConfigsForClient(client.code),
  ]);
  const configByControl = new Map(configs.map(c => [c.controlId, c]));
  const attrs = client.attributes || {};
  const legajoKeyMode = isValidLegajoKeyMode(client.legajoKeyMode)
    ? client.legajoKeyMode
    : DEFAULT_LEGAJO_KEY_MODE;

  container.innerHTML = `
    <h3 style="margin-top:0;">${esc(client.name)} <span class="text-sm text-muted">(${esc(client.code || '—')})</span></h3>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--sp-3);">
      <div class="form-group">
        <label class="form-label">Sistema de origen</label>
        <select class="form-input" id="js-admin-source-system">
          <option value="meta4" ${client.sourceSystem === 'meta4' ? 'selected' : ''}>Meta4 / PeopleNet</option>
          <option value="axton" ${client.sourceSystem === 'axton' ? 'selected' : ''}>Axton IT</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Equipo</label>
        <select class="form-input" id="js-admin-team">
          <option value="">Sin equipo</option>
          ${teamOptions.map(([code, label]) => `<option value="${esc(code)}" ${client.team === code ? 'selected' : ''}>${esc(label)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Consultor/a</label>
        <select class="form-input" id="js-admin-consultant">
          <option value="">Sin consultor/a</option>
          ${consultantOptions.map(name => `<option value="${esc(name)}" ${client.consultant === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Dotación</label>
        <input type="number" class="form-input" id="js-admin-pays" min="0" value="${client.pays ?? ''}">
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Cómo se compara el legajo</label>
        <select class="form-input" id="js-admin-legajo-key">
          ${Object.values(LEGAJO_KEY_MODES).map(mode => `
            <option value="${esc(mode)}" ${legajoKeyMode === mode ? 'selected' : ''}>
              ${esc(LEGAJO_KEY_MODE_LABELS[mode])}
            </option>`).join('')}
        </select>
        <p class="text-sm text-muted" style="margin:var(--sp-1) 0 0;">
          Se aplica a todos los controles y entregables de este cliente. Cambialo sólo si
          los archivos del cliente rellenan el legajo con ceros de forma distinta entre sí.
        </p>
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Convenios / CCTs</label>
        <select class="form-input" id="js-admin-ccts" multiple size="4">
          ${cctOptions.map(cct => `<option value="${esc(cct)}" ${(client.ccts || []).includes(cct) ? 'selected' : ''}>${esc(cct)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Atributos</label>
        <div style="display:flex;flex-wrap:wrap;gap:var(--sp-3);">
          <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);">
            <input type="checkbox" id="js-admin-attr-pluriempleo" ${attrs.pluriempleo ? 'checked' : ''}> Pluriempleo
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);">
            <input type="checkbox" id="js-admin-attr-holding" ${attrs.holding ? 'checked' : ''}> Holding
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);">
            <input type="checkbox" id="js-admin-attr-paymentUsd" ${attrs.paymentUsd ? 'checked' : ''}> Pago en USD
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:var(--text-sm);">
            <input type="checkbox" id="js-admin-attr-retroactividad" ${attrs.retroactividad ? 'checked' : ''}> Retroactividad
          </label>
        </div>
      </div>
    </div>

    <button class="btn btn--primary" id="js-admin-save-client-btn" style="margin-top:var(--sp-3);">Guardar cliente</button>

    <h4 style="margin-top:var(--sp-5);">Configuración de controles</h4>
    <p class="text-sm text-muted" style="margin:0 0 var(--sp-2);">
      "Aplica hoy" es lo que decide el scope declarado en el código (<code>registry.js</code>).
      "Estado" es el override manual — "Forzado activo"/"Forzado no aplica" ganan por sobre el scope.
    </p>
    <div class="card" style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="text-align:left;">
            <th style="padding:var(--sp-2);">Control</th>
            <th style="padding:var(--sp-2);">Scope</th>
            <th style="padding:var(--sp-2);">Aplica hoy</th>
            <th style="padding:var(--sp-2);">Estado</th>
            <th style="padding:var(--sp-2);">Motivo (si es forzado)</th>
          </tr>
        </thead>
        <tbody>
          ${Object.values(CONTROL_REGISTRY).map(ctrl => {
            const cfg = configByControl.get(ctrl.id);
            const status = cfg?.status || 'sin_configurar';
            const applies = controlAppliesToClient(ctrl, client, cfg);
            return `
              <tr data-control-id="${esc(ctrl.id)}">
                <td style="padding:var(--sp-2);">${esc(ctrl.label)}</td>
                <td style="padding:var(--sp-2);" class="text-sm text-muted">${esc(scopeLabel(ctrl))}</td>
                <td style="padding:var(--sp-2);">
                  ${applies
                    ? '<span class="badge badge--success">Sí</span>'
                    : '<span class="badge badge--neutral">No</span>'}
                </td>
                <td style="padding:var(--sp-2);">
                  <select class="form-input js-control-status">
                    ${CONTROL_CONFIG_STATUSES.map(s => `<option value="${s.value}" ${status === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
                  </select>
                </td>
                <td style="padding:var(--sp-2);">
                  <input type="text" class="form-input js-control-reason" value="${esc(cfg?.overrideReason || '')}" placeholder="Obligatorio si el estado es forzado">
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <button class="btn btn--primary" id="js-admin-save-configs-btn" style="margin-top:var(--sp-3);">Guardar configuración de controles</button>
  `;

  container.querySelector('#js-admin-save-client-btn').addEventListener('click', async () => {
    const ccts = Array.from(container.querySelector('#js-admin-ccts').selectedOptions).map(o => o.value);
    const paysValue = container.querySelector('#js-admin-pays').value;
    try {
      await updateClient(client.id, {
        sourceSystem: container.querySelector('#js-admin-source-system').value,
        legajoKeyMode: container.querySelector('#js-admin-legajo-key').value,
        team:         container.querySelector('#js-admin-team').value,
        consultant:   container.querySelector('#js-admin-consultant').value,
        ccts,
        pays: paysValue ? Number(paysValue) : null,
        attributes: {
          pluriempleo:    container.querySelector('#js-admin-attr-pluriempleo').checked,
          holding:        container.querySelector('#js-admin-attr-holding').checked,
          paymentUsd:     container.querySelector('#js-admin-attr-paymentUsd').checked,
          retroactividad: container.querySelector('#js-admin-attr-retroactividad').checked,
        },
      });
      showToast('Cliente actualizado.', 'success');
    } catch (err) {
      showToast(`Error al guardar el cliente: ${err.message}`, 'danger');
    }
  });

  container.querySelector('#js-admin-save-configs-btn').addEventListener('click', async () => {
    const rows = Array.from(container.querySelectorAll('tr[data-control-id]'));
    const forcedWithoutReason = rows.filter(row => {
      const status = row.querySelector('.js-control-status').value;
      const reason = row.querySelector('.js-control-reason').value.trim();
      return status.startsWith('forzado_') && !reason;
    });
    if (forcedWithoutReason.length) {
      showToast('Los estados "forzado" necesitan un motivo antes de guardar.', 'warning');
      return;
    }

    if (!await showConfirm('¿Guardar la configuración de controles de este cliente?', { confirmLabel: 'Guardar' })) return;

    try {
      for (const row of rows) {
        const controlId = row.dataset.controlId;
        const status = row.querySelector('.js-control-status').value;
        const overrideReason = row.querySelector('.js-control-reason').value.trim() || null;
        await saveControlConfig(client.code, controlId, { status, overrideReason });
      }
      showToast('Configuración de controles guardada.', 'success');
    } catch (err) {
      showToast(`Error al guardar la configuración: ${err.message}`, 'danger');
    }
  });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
