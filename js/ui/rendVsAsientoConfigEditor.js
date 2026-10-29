// rendVsAsientoConfigEditor.js — "Clasificación por cuenta contable" (pantalla 9)
//
// Vivía dentro de `js/controls/rendVsAsiento.js`, que es el control. Se mudó acá
// —donde ya viven los otros editores del Paso 2— porque es pantalla, no cálculo:
// el control sigue leyendo la misma config con la misma forma.
//
// Qué hace: cada código de CUENTA_CONTAB de la Contabilidad Desglosada se
// clasifica en uno de los grupos del Rendimiento (Precio, Asig. estímulo, Cargas
// SS, Prov. mes), y PROV. CCSS MES se clasifica por ID_CONCEPTO. Lo que no
// matchea ningún código no se pierde: sale aparte en los resultados. Por eso el
// código que no encuentra filas avisa y no traba (D-036).

import { DEFAULT_RVA_CONFIG, resolveRvaConfig } from '../controls/rendVsAsiento.js';
import { renderHelpPopover }  from './helpPopover.js';
import { makeLegajoKey }      from '../utils/legajo.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const fmtN = n => new Intl.NumberFormat('es-AR').format(n);

/**
 * Las clasificaciones, en el orden en que se leen. `name` es cómo lo diría un
 * analista y `code` es la clave técnica que se ve al lado, igual que en el resto
 * del Paso 2 (regla 3 del rediseño).
 *
 * `unidad` distingue las dos formas de clasificar: las cuatro primeras miran la
 * CUENTA_CONTAB de la fila; PROV. CCSS MES mira el ID_CONCEPTO y se lleva la
 * fila entera, sin pasar por las cuentas.
 */
const CLASIFICACIONES = [
  { key: 'precio',   name: 'Precio',         code: 'PRECIO',        unidad: 'cuenta' },
  { key: 'estimulo', name: 'Asig. estímulo', code: 'ASIG_ESTIMULO', unidad: 'cuenta' },
  { key: 'cargas',   name: 'Cargas SS',      code: 'CARGAS_SS',     unidad: 'cuenta' },
  { key: 'provMes',  name: 'Prov. mes',      code: 'PROV_MES',      unidad: 'cuenta' },
  { key: 'provCcss', name: 'Prov. CCSS mes', code: 'ID_CONCEPTO',   unidad: 'concepto' },
];

const AYUDA_CLASIFICACION = {
  label: 'Clasificación por cuenta contable',
  bodyHtml: `
    <p style="margin:0 0 var(--sp-2);">
      Cada fila de la Contabilidad Desglosada se clasifica por su <code>CUENTA_CONTAB</code>
      (o por su <code>ID_CONCEPTO</code>, en el caso de Prov. CCSS mes). Por cada centro de costo
      se suma <b>DEBE − HABER</b> y el total se compara contra la columna del Rendimiento.
    </p>
    <p class="help-popover__note" style="margin:0;">
      Un código que no encuentra filas avisa pero no traba: las filas que ningún código clasifica
      salen aparte en los resultados, no se pierden ni se cuentan mal.
    </p>
  `,
};

const TEXTO_SIN_MATCH_LARGO =
  'No encontrado en la Contabilidad cargada — revisá el código o dejalo: las filas sin clasificar salen aparte.';
const TEXTO_SIN_MATCH_CORTO = 'No encontrado en la Contabilidad cargada.';

const parseList = s => String(s || '').split(/[,\s]+/).map(t => t.trim()).filter(Boolean);

const parseRedirects = s => String(s || '').split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => {
    const m = line.match(/^(.+?)\s*(?:→|->|=>)\s*(.+)$/);
    return m ? { from: m[1].trim(), to: m[2].trim() } : null;
  })
  .filter(Boolean);

/** `04 → Asesoramiento`, una por línea → `[{ code, to }]` (mismo formato que los redirects). */
const parseCodeMap = s => parseRedirects(s).map(({ from, to }) => ({ code: from, to }));

/**
 * Renderiza el editor de clasificación. Cada cambio dispara onChange(newConfig).
 *
 * @param {HTMLElement} container
 * @param {Object}   opts
 * @param {Object}   opts.config         — config actual (default: DEFAULT_RVA_CONFIG)
 * @param {Object}   opts.accountStats   — { [CUENTA_CONTAB]: { rows, names[] } } de la CONTA cargada
 * @param {Object}   opts.conceptStats   — { [ID_CONCEPTO]:   { rows, names[] } } de la CONTA cargada
 * @param {boolean}  opts.contaCargada   — si hay Contabilidad contra la que contar filas
 * @param {string[]|null} opts.areasRendimiento — las áreas del Rendimiento cargado (null si no hay)
 * @param {Object}   opts.nombrePorLegajo — { [clave de legajo]: 'APELLIDO, NOMBRE' } de la CONTA cargada
 * @param {string}   opts.legajoKeyMode  — cómo compara legajos el cliente ('007' = '7' o no)
 * @param {Function} opts.onChange       — callback(newConfig)
 */
export function renderRendVsAsientoConfigEditor(container, opts = {}) {
  const {
    config = DEFAULT_RVA_CONFIG,
    accountStats = {},
    conceptStats = {},
    contaCargada = false,
    areasRendimiento = null,
    nombrePorLegajo = {},
    legajoKeyMode,
    onChange = () => {},
  } = opts;
  const legajoKeyOf = makeLegajoKey(legajoKeyMode);

  // Clon mutable que el editor va modificando. `resolveRvaConfig` completa la
  // tabla por código y los centros por persona de una config guardada antes de
  // que existieran: el analista ve —y guarda— lo mismo que va a usar la corrida.
  let current = JSON.parse(JSON.stringify(resolveRvaConfig(config)));
  if (!current.cuentaCats) current.cuentaCats = {};
  if (!current.provCcssConcepts) current.provCcssConcepts = [];
  if (!current.ccRedirects) current.ccRedirects = [];
  if (!current.legajoAreas) current.legajoAreas = [];

  // "Agregar clasificación" arranca plegado: el caso normal es no tocarlo.
  let agregando = false;

  const panel = document.createElement('div');
  panel.className = 'wizard-panel';

  /** Los códigos de una clasificación, salgan de `cuentaCats` o de la lista de conceptos. */
  const codigosDe = c => (c.unidad === 'concepto'
    ? current.provCcssConcepts
    : (current.cuentaCats[c.key] || [])) || [];

  const statsDe = c => (c.unidad === 'concepto' ? conceptStats : accountStats);

  /** Filas de la Contabilidad que matchean los códigos de esta clasificación. */
  function filasDe(c) {
    const stats = statsDe(c);
    return codigosDe(c).reduce((total, code) => total + (stats[code]?.rows || 0), 0);
  }

  /** Hasta dos nombres reales de cuenta/concepto — la muestra del campo (regla 3). */
  function muestraDe(c) {
    const stats = statsDe(c);
    const out = [];
    for (const code of codigosDe(c)) {
      for (const n of (stats[code]?.names || [])) {
        if (n && !out.includes(n)) out.push(n);
        if (out.length === 2) return out;
      }
    }
    return out;
  }

  /**
   * Las áreas que se pueden elegir como destino de un legajo: las del Rendimiento
   * cargado y, si todavía no hay Rendimiento, los destinos de la tabla por código.
   * No se tipea un nombre libre: un área mal escrita no matchea nada y el legajo
   * saldría "sólo en CONTA".
   */
  function areasPosibles() {
    const fuente = (areasRendimiento && areasRendimiento.length)
      ? areasRendimiento
      : (current.ccCodeMap || []).map(e => String(e?.to || '').trim());
    return [...new Set(fuente.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  }

  /** La tabla de legajos que el Rendimiento pone en otra área (D-103). */
  function legajosHtml() {
    const areas = areasPosibles();
    const filas = current.legajoAreas.map((e, i) => {
      const legajo = String(e?.legajo ?? '');
      const to = String(e?.to ?? '');
      const nombre = legajo ? (nombrePorLegajo[legajoKeyOf(legajo)] || '') : '';
      // Un área guardada que no está entre las posibles se sigue mostrando, marcada.
      const opciones = [...areas];
      const fuera = to && !opciones.includes(to);
      if (fuera) opciones.unshift(to);
      const nombreHtml = !legajo ? ''
        : (nombre
          ? `<div class="col-hint">${esc(nombre)}</div>`
          : (contaCargada ? '<div class="col-hint">No aparece en la Contabilidad cargada.</div>' : ''));
      return `
        <tr>
          <td style="vertical-align:top;">
            <input type="text" class="form-input rva-input" data-rva-leg-legajo="${i}"
              value="${esc(legajo)}" placeholder="Legajo" aria-label="Legajo" style="max-width:9rem;">
            ${nombreHtml}
          </td>
          <td style="vertical-align:top;">
            <select class="form-select" data-rva-leg-to="${i}" aria-label="Área del Rendimiento">
              <option value=""${to ? '' : ' selected'}>Elegí el área…</option>
              ${opciones.map(a => `<option value="${esc(a)}"${a === to ? ' selected' : ''}>${esc(a)}${
                a === to && fuera ? ' (no está en el Rendimiento cargado)' : ''}</option>`).join('')}
            </select>
          </td>
          <td style="vertical-align:top;">
            <input type="text" class="form-input" data-rva-leg-motivo="${i}"
              value="${esc(e?.motivo ?? '')}" placeholder="Por qué (ej.: lo pidió el cliente)" aria-label="Motivo">
          </td>
          <td style="vertical-align:top;">
            <button type="button" class="btn btn--ghost btn--sm" data-rva-leg-quitar="${i}">Quitar</button>
          </td>
        </tr>`;
    }).join('');
    const tabla = current.legajoAreas.length === 0 ? '' : `
      <div style="overflow-x:auto;">
        <table class="data-table data-table--compact" style="margin:var(--sp-2) 0;">
          <thead>
            <tr><th>Legajo</th><th>Área del Rendimiento</th><th>Motivo</th><th></th></tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
    const sinAreas = areas.length === 0
      ? '<div class="field__help field__help--muted">Cargá el Reporte de Rendimiento para elegir el área.</div>'
      : '';
    return `
      <div class="rva-redirects" data-rva-legajos>
        <div class="field__head">
          <span class="field__label">Legajos que el Rendimiento pone en otra área</span>
          <span class="field__code">ID_EMPLEADO</span>
        </div>
        <div class="field__help field__help--muted">
          Sus filas de la Contabilidad se comparan contra el área que digas acá, sin importar el centro
          contable con que vengan.
        </div>
        ${tabla}
        ${sinAreas}
        <button type="button" class="rva-add__open" data-rva-leg-agregar>＋ Agregar legajo</button>
      </div>`;
  }

  function renderInner() {
    const ccRedirText = current.ccRedirects.map(r => `${r.from} → ${r.to}`).join('\n');
    const codeMapText = current.ccCodeMap.map(r => `${r.code} → ${r.to}`).join('\n');
    const porPersonaText = current.ccPorPersona.join(', ');

    // El texto largo se dice UNA vez — en el primero que no matchea. Repetirlo en
    // los cinco lo convierte en ruido y deja de leerse.
    let yaExplicado = false;
    const sinMatch = contaCargada
      ? CLASIFICACIONES.filter(c => codigosDe(c).length > 0 && filasDe(c) === 0).length
      : 0;

    const cards = CLASIFICACIONES.map(c => {
      const codes  = codigosDe(c);
      const filas  = filasDe(c);
      const hayMatch = contaCargada && filas > 0;
      const noMatch  = contaCargada && codes.length > 0 && filas === 0;

      let badge = '';
      if (hayMatch) {
        badge = `<span class="field__badge field__badge--auto">✓ ${fmtN(filas)} fila${filas !== 1 ? 's' : ''}</span>`;
      } else if (noMatch) {
        badge = '<span class="field__badge field__badge--warn">⚠ sin match</span>';
      } else if (contaCargada && codes.length === 0) {
        badge = '<span class="field__badge field__badge--omit">sin códigos</span>';
      }

      let ayuda = '';
      if (noMatch) {
        ayuda = `<div class="field__help">${esc(yaExplicado ? TEXTO_SIN_MATCH_CORTO : TEXTO_SIN_MATCH_LARGO)}</div>`;
        yaExplicado = true;
      } else if (!contaCargada) {
        ayuda = '<div class="field__help field__help--muted">Cargá la Contabilidad Desglosada para ver cuántas filas matchea cada código.</div>';
      } else if (codes.length === 0) {
        ayuda = '<div class="field__help">Sin códigos asignados — esta columna del Rendimiento se va a comparar contra $ 0,00.</div>';
      }

      const muestra = muestraDe(c);
      const hint = muestra.length
        ? `<div class="col-hint">ej.: ${muestra.map(esc).join(' · ')}</div>`
        : '';

      const inputCls = hayMatch ? ' rva-input--ok' : (noMatch ? ' rva-input--warn' : '');

      return `
        <div class="field">
          <div class="field__head">
            <span class="field__label">${esc(c.name)}</span>
            <span class="field__code">${esc(c.code)}</span>
            <span class="field__spacer"></span>
            ${badge}
          </div>
          <input type="text" class="form-input rva-input${inputCls}" data-rva-codes="${esc(c.key)}"
            value="${esc(codes.join(', '))}" placeholder="ej: 5208001, 5208002"
            aria-label="Códigos de ${esc(c.name)}">
          ${ayuda}
          ${hint}
        </div>`;
    }).join('');

    const addCard = agregando ? `
      <div class="rva-add">
        <div class="rva-add__row">
          <select class="form-select" data-rva-add-cat aria-label="Clasificación a la que va el código">
            ${CLASIFICACIONES.map(c => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="rva-add__row">
          <input type="text" class="form-input rva-input" data-rva-add-code
            placeholder="Código" aria-label="Código nuevo">
          <button type="button" class="btn btn--primary btn--sm" data-rva-add-ok>Agregar</button>
        </div>
      </div>` : `
      <div class="rva-add">
        <button type="button" class="rva-add__open" data-rva-add-open>＋ Agregar clasificación…</button>
      </div>`;

    panel.innerHTML = `
      <div class="wizard-panel__head">
        <h4 class="wizard-panel__title">Clasificación por cuenta contable</h4>
        <span class="wizard-panel__code">CUENTA_CONTAB</span>
        <span data-rva-help></span>
        <div class="wizard-panel__end">
          ${sinMatch > 0
            ? `<span class="wizard-panel__warn">⚠ ${sinMatch} código${sinMatch !== 1 ? 's' : ''} sin match</span>`
            : ''}
          <button type="button" class="btn btn--ghost btn--sm" data-rva-reset style="white-space:nowrap;">
            ↺ Restaurar defaults
          </button>
        </div>
      </div>
      <p class="wizard-panel__sub">
        Cada código define cómo se clasifica una fila de la Contabilidad. Se guardan por cliente y se aplican al ejecutar.
      </p>
      <div class="rva-grid">
        ${cards}
        ${addCard}
      </div>
      <div class="rva-redirects">
        <div class="field__head">
          <span class="field__label">Centro de costo de la Contabilidad → del Rendimiento</span>
          <span class="field__code">CC_NOMBRE</span>
        </div>
        <textarea class="form-input rva-redirects__area" data-rva-cc-redirects
          rows="${Math.max(current.ccRedirects.length + 1, 3)}"
          placeholder="Uno por línea — formato: CONTA → Rendimiento"
          aria-label="Redirecciones de centro de costo">${esc(ccRedirText)}</textarea>
        <div class="field__help field__help--muted">
          Uno por línea, para los CC que en la Contabilidad se llaman distinto. Ejemplo: <code>Finanzas → Servicios Legales</code>
        </div>
      </div>
      <div class="rva-redirects">
        <div class="field__head">
          <span class="field__label">Centro de costo de la Contabilidad → área del Rendimiento (por código)</span>
          <span class="field__code">ID_CENTRO_COSTO</span>
        </div>
        <textarea class="form-input rva-redirects__area" data-rva-cc-codes
          rows="${Math.max(current.ccCodeMap.length + 1, 3)}"
          placeholder="Uno por línea — formato: código → área del Rendimiento"
          aria-label="Centro de costo por código">${esc(codeMapText)}</textarea>
        <div class="field__help field__help--muted">
          Uno por línea. El código toma también sus sub-centros: <code>04 → Asesoramiento</code> junta
          el 04.01, el 04.02… (y el 4), pero el 1 no toma al 10 ni al 13. Si un sub-centro va a otra área,
          escribilo aparte (<code>04.03 → …</code>): gana el más específico. Lo que no está acá se busca
          por nombre, como siempre.
        </div>
      </div>
      <div class="rva-redirects">
        <div class="field__head">
          <span class="field__label">Centros que se reparten persona por persona (con el listado de CC x Empleado)</span>
          <span class="field__code">ID_CENTRO_COSTO</span>
        </div>
        <input type="text" class="form-input rva-input" data-rva-por-persona
          value="${esc(porPersonaText)}" placeholder="ej: 13"
          aria-label="Centros que se reparten persona por persona">
        <div class="field__help field__help--muted">
          Códigos separados por coma. Cada empleado de estos centros va al área que diga el listado de
          CC x Empleado; el listado no toca a nadie más. Si queda vacío, el listado cambia el centro de
          todos los empleados que trae.
        </div>
      </div>
      ${legajosHtml()}
    `;

    renderHelpPopover(panel.querySelector('[data-rva-help]'), AYUDA_CLASIFICACION);

    // ── Eventos ──────────────────────────────────────────────────────────────
    // Se re-renderiza en `change` (al salir del campo) y no en `input`: los
    // badges cuentan filas de la Contabilidad y recontar en cada tecla haría
    // parpadear "sin match" mientras se escribe el código.

    const guardarCodes = (key, valor) => {
      const codes = parseList(valor);
      const clas  = CLASIFICACIONES.find(c => c.key === key);
      if (clas?.unidad === 'concepto') current.provCcssConcepts = codes;
      else current.cuentaCats[key] = codes;
      onChange(current);
    };

    panel.querySelectorAll('[data-rva-codes]').forEach(input => {
      input.addEventListener('change', () => {
        guardarCodes(input.dataset.rvaCodes, input.value);
        renderInner();
      });
    });

    panel.querySelector('[data-rva-cc-redirects]')?.addEventListener('change', e => {
      current.ccRedirects = parseRedirects(e.target.value);
      onChange(current);
    });

    panel.querySelector('[data-rva-cc-codes]')?.addEventListener('change', e => {
      current.ccCodeMap = parseCodeMap(e.target.value);
      onChange(current);
    });

    panel.querySelector('[data-rva-por-persona]')?.addEventListener('change', e => {
      current.ccPorPersona = parseList(e.target.value);
      onChange(current);
    });

    // Legajos en otra área: el legajo vuelve a dibujar (para mostrar el nombre
    // de la persona); el área y el motivo sólo guardan.
    panel.querySelectorAll('[data-rva-leg-legajo]').forEach(input => {
      input.addEventListener('change', () => {
        current.legajoAreas[Number(input.dataset.rvaLegLegajo)].legajo = input.value.trim();
        onChange(current);
        renderInner();
      });
    });
    panel.querySelectorAll('[data-rva-leg-to]').forEach(sel => {
      sel.addEventListener('change', () => {
        current.legajoAreas[Number(sel.dataset.rvaLegTo)].to = sel.value;
        onChange(current);
      });
    });
    panel.querySelectorAll('[data-rva-leg-motivo]').forEach(input => {
      input.addEventListener('change', () => {
        current.legajoAreas[Number(input.dataset.rvaLegMotivo)].motivo = input.value.trim();
        onChange(current);
      });
    });
    panel.querySelectorAll('[data-rva-leg-quitar]').forEach(btn => {
      btn.addEventListener('click', () => {
        current.legajoAreas.splice(Number(btn.dataset.rvaLegQuitar), 1);
        onChange(current);
        renderInner();
      });
    });
    panel.querySelector('[data-rva-leg-agregar]')?.addEventListener('click', () => {
      current.legajoAreas.push({ legajo: '', to: '', motivo: '' });
      onChange(current);
      renderInner();
      const inputs = panel.querySelectorAll('[data-rva-leg-legajo]');
      inputs[inputs.length - 1]?.focus();
    });

    panel.querySelector('[data-rva-add-open]')?.addEventListener('click', () => {
      agregando = true;
      renderInner();
      panel.querySelector('[data-rva-add-code]')?.focus();
    });

    const confirmarAgregado = () => {
      const key   = panel.querySelector('[data-rva-add-cat]')?.value;
      const nuevo = parseList(panel.querySelector('[data-rva-add-code]')?.value);
      if (!key || nuevo.length === 0) { agregando = false; renderInner(); return; }
      const clas    = CLASIFICACIONES.find(c => c.key === key);
      const actuales = clas?.unidad === 'concepto'
        ? current.provCcssConcepts
        : (current.cuentaCats[key] || []);
      guardarCodes(key, [...actuales, ...nuevo].join(','));
      agregando = false;
      renderInner();
    };

    panel.querySelector('[data-rva-add-ok]')?.addEventListener('click', confirmarAgregado);
    panel.querySelector('[data-rva-add-code]')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); confirmarAgregado(); }
    });

    panel.querySelector('[data-rva-reset]')?.addEventListener('click', () => {
      current = JSON.parse(JSON.stringify(DEFAULT_RVA_CONFIG));
      onChange(current);
      renderInner();
    });
  }

  renderInner();
  container.appendChild(panel);
}
