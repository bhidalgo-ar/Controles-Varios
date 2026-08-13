// main.js — El portero de la app
//
// Este archivo hace tres cosas:
//   1. Verifica que las librerías externas (SheetJS y Dexie) cargaron bien
//   2. Configura el banner de privacidad
//   3. Escucha los cambios de URL (navegación) y muestra la pantalla correcta
//
// La navegación usa el "hash" de la URL (lo que viene después del #):
//   #/                      → lista de clientes
//   #/client/:id/groupers   → editor de agrupadores
//   #/controls/:clientId    → wizard de controles (incluye el Cruce por Agrupadores, D-008/T9)
//   #/admin                 → modo admin (contraseña, ver D-005)

import { renderClientsList }    from './ui/clientsList.js';
import { renderGrouperEditor }  from './ui/grouperEditor.js';
import { renderControlsWizard } from './ui/controlsWizard.js';
import { renderControlsResults } from './ui/controlsResults.js';
import { renderChecklist }       from './ui/checklistView.js';
import { renderAdminView }       from './ui/adminView.js';
import { setHeader, clearHeader } from './ui/appHeader.js';

// La API de la barra superior se pide desde acá (el módulo vive en js/ui/ para
// no armar un ciclo main → vista → main; ver appHeader.js).
export { setHeader };

const APP_VERSION = '1.0.0-alpha';
const root = document.getElementById('js-app-root');

// ── Toast (notificaciones flotantes) ──────────────────────────────────────────
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

export function showToast(message, type = 'info', durationMs = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

// ── Banner de privacidad ──────────────────────────────────────────────────────
function setupPrivacyBanner() {
  const banner  = document.getElementById('js-privacy-banner');
  const closeBtn = document.getElementById('js-banner-close');
  if (!banner || !closeBtn) return;

  // Si el usuario ya cerró el banner en esta sesión de navegador, no lo mostramos
  if (sessionStorage.getItem('privacy-banner-dismissed')) {
    banner.style.display = 'none';
  }

  closeBtn.addEventListener('click', () => {
    banner.style.display = 'none';
    sessionStorage.setItem('privacy-banner-dismissed', '1');
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
// Cada vez que cambia el hash de la URL (ej: el usuario hace clic en un link),
// esta función decide qué pantalla mostrar.
async function handleRoute() {
  const hash  = window.location.hash || '#/';
  const parts = hash.replace('#/', '').split('/').filter(Boolean);

  // La barra arranca vacía en cada cambio de pantalla y la llena la vista que
  // se monta con setHeader() — así ninguna pantalla hereda el "volver" ni los
  // pasos de la anterior si tarda en renderizar (o si falla).
  clearHeader();

  try {
    if (parts.length === 0) {
      // #/ → lista de clientes
      await renderClientsList(root);
    } else if (parts[0] === 'client' && parts[2] === 'groupers') {
      // #/client/:id/groupers → editor de agrupadores
      await renderGrouperEditor(root, Number(parts[1]));
    } else if (parts[0] === 'controls' && parts[1]) {
      // #/controls/:clientId → wizard de controles
      await renderControlsWizard(root, Number(parts[1]));
    } else if (parts[0] === 'control-results' && parts[1]) {
      // #/control-results/:runId → resultados de controles
      await renderControlsResults(root, Number(parts[1]));
    } else if (parts[0] === 'checklist' && parts[1]) {
      // #/checklist/:clientId → grilla mensual de controles ejecutados
      await renderChecklist(root, Number(parts[1]));
    } else if (parts[0] === 'admin') {
      // #/admin → modo admin (protegido por contraseña, ver D-005)
      await renderAdminView(root);
    } else {
      // Ruta desconocida → volvemos al inicio
      window.location.hash = '#/';
    }
  } catch (err) {
    console.error('[main] Error al renderizar pantalla:', err);
    root.innerHTML = `
      <div class="page-content">
        <div class="alert alert--danger">
          ❌ Ocurrió un error inesperado: ${escHtml(err.message)}
          <br><br>
          <a href="#/">← Volver al inicio</a>
        </div>
      </div>
    `;
  }
}

// ── Tema de la app: Sobrio / Intenso / Oscuro ─────────────────────────────────
//
// El tema se guarda en `localStorage.theme` y se aplica como `data-theme` en el
// <html>; los valores los remapea css/tokens.css. El primer <script> del <head>
// hace lo mismo antes del primer paint para que no parpadee al cargar — acá se
// repite la resolución (misma lógica, dos lugares a propósito: el head no puede
// importar módulos) y se persiste la migración de la clave vieja.

const THEMES = ['sobrio', 'intenso', 'oscuro'];

// Claves guardadas por la versión anterior (toggle 🌙 claro/oscuro).
const LEGACY_THEMES = { light: 'sobrio', dark: 'oscuro' };

function resolveTheme() {
  const stored = localStorage.getItem('theme');
  const migrated = LEGACY_THEMES[stored];
  if (migrated) return { theme: migrated, migrated: true };
  if (THEMES.includes(stored)) return { theme: stored, migrated: false };
  // Nunca eligió: respetamos la preferencia del sistema y no la guardamos.
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return { theme: prefersDark ? 'oscuro' : 'sobrio', migrated: false };
}

function initTheme() {
  const { theme, migrated } = resolveTheme();
  applyTheme(theme, migrated);
}

function applyTheme(theme, save = true) {
  if (!THEMES.includes(theme)) return;
  document.documentElement.setAttribute('data-theme', theme);
  for (const opt of document.querySelectorAll('[data-theme-value]')) {
    opt.setAttribute('aria-checked', String(opt.dataset.themeValue === theme));
  }
  if (save) localStorage.setItem('theme', theme);
}

// Menú del selector: abre/cierra con el botón, cierra con click afuera y con
// Escape (mismo patrón que js/ui/helpPopover.js).
function setupThemePicker() {
  const btn   = document.getElementById('js-theme-toggle');
  const panel = document.getElementById('js-theme-panel');
  if (!btn || !panel) return;

  const close = () => {
    panel.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    panel.removeAttribute('hidden');
    btn.setAttribute('aria-expanded', 'true');
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.hasAttribute('hidden')) open(); else close();
  });

  panel.addEventListener('click', (e) => {
    e.stopPropagation();
    const option = e.target.closest('[data-theme-value]');
    if (!option) return;
    applyTheme(option.dataset.themeValue);
    close();
    btn.focus();
  });

  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hasAttribute('hidden')) return;
    close();
    btn.focus();
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  console.log(`[Controles Nómina] v${APP_VERSION} — iniciando`);

  // Verificamos que las librerías CDN cargaron correctamente
  /* global XLSX, Dexie */
  if (typeof XLSX === 'undefined') {
    console.warn('[main] SheetJS no está disponible. El parsing de Excel no funcionará.');
    showToast('No se pudo cargar SheetJS. Verificá tu conexión a internet.', 'danger', 8000);
  }
  if (typeof Dexie === 'undefined') {
    console.error('[main] Dexie.js no está disponible. La base de datos no funcionará.');
    showToast('No se pudo cargar Dexie.js. Verificá tu conexión a internet.', 'danger', 8000);
    root.innerHTML = `
      <div class="page-content">
        <div class="alert alert--danger">
          ❌ <strong>La app no puede funcionar sin la librería de base de datos (Dexie.js).</strong><br>
          Verificá que tenés conexión a internet (se necesita para descargar las librerías la primera vez).
        </div>
      </div>
    `;
    return;
  }

  initTheme();
  setupPrivacyBanner();
  setupThemePicker();

  // Escuchar cambios de URL (clicks en links con href="#/...")
  window.addEventListener('hashchange', handleRoute);

  // Renderizar la pantalla inicial
  await handleRoute();

  console.log('[Controles Nómina] Listo.');
}

// Arrancamos cuando el HTML termina de cargarse
document.addEventListener('DOMContentLoaded', init);

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
