// rendVsTabuConceptEditor.js — Editor de agrupación de conceptos para Control 5 RendvsTabu
//
// Pantalla 10 del rediseño. Un grupo del Rendimiento (Precio, Asig. estímulo,
// Cargas SS, Prov. mes, Prov. CCSS mes) se arma sumando y restando conceptos del
// Tabulado. Cada concepto es un chip `SIGNO código · nombre ✕`:
//
//   - el **signo** es lo que decide si ese concepto suma o resta dentro del
//     grupo, y un clic lo invierte. Es la funcionalidad central de la pantalla:
//     no es decoración ni un estado visual.
//   - el ✕ lo saca del grupo.
//   - "+ N más…" es **sólo colapso visual**: los conceptos escondidos siguen en
//     el grupo y siguen sumando o restando igual.

import { DEFAULT_CONCEPT_CONFIG } from '../controls/rendVsTabu.js';
import { showConfirm }            from './toast.js';
import { renderHelpPopover }      from './helpPopover.js';

// `key` es la clave de la agrupación que viaja al control — no se toca. `name`
// es cómo lo diría un analista; en la tabla de resultados y en el export las
// mismas columnas se siguen llamando PRECIO, ASIG. ESTÍMULO, CARGAS SS,
// PROV. MES y PROV. CCSS MES (eso lo declara `rendVsTabu.js`, no esta pantalla).
const CAT_META = [
  { key: 'precio',   name: 'Precio' },
  { key: 'estimulo', name: 'Asig. estímulo' },
  { key: 'cargas',   name: 'Cargas SS' },
  { key: 'provMes',  name: 'Prov. mes' },
  { key: 'provCcss', name: 'Prov. CCSS mes' },
];

// Cuántos chips se ven antes de plegar el resto. Un grupo de 18 conceptos ocupa
// media pantalla y tapa a los otros cuatro; con el corte entran todos a la vez.
const CHIPS_VISIBLES = 10;

function buildColByCode(sampleRow) {
  const colByCode = {};
  for (const col of Object.keys(sampleRow)) {
    const s = String(col).trim();
    const m = s.match(/^(\d+)[-_]/);
    if (m) {
      if (!colByCode[m[1]]) colByCode[m[1]] = col;
    } else if (/^\d+$/.test(s)) {
      if (!colByCode[s]) colByCode[s] = col;
    }
  }
  return colByCode;
}

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** '1003-SUELDO' → 'SUELDO'. El código ya va en su propio tramo del chip. */
function nombreDeColumna(col, code) {
  const s   = String(col ?? '').trim();
  const pre = String(code ?? '');
  if (pre && s.startsWith(pre)) {
    const resto = s.slice(pre.length).replace(/^[-_\s]+/, '');
    if (resto) return resto;
  }
  return s;
}

const AYUDA_AGRUPACION = {
  label: 'Agrupación de conceptos',
  bodyHtml: `
    <p style="margin:0 0 var(--sp-2);">
      Cada grupo del Rendimiento (Precio, Asig. estímulo, Cargas SS…) se calcula sumando y restando
      conceptos del Tabulado. Este panel dice cuáles entran en cada uno.
    </p>
    <p style="margin:0 0 var(--sp-2);">
      El <b style="color:var(--ok-tx);">+</b> del chip suma ese concepto y el
      <b style="color:var(--error-tx);">−</b> lo resta; un clic en el signo lo invierte.
      El ✕ lo saca del grupo.
    </p>
    <p class="help-popover__note" style="margin:0;">
      Un concepto marcado con ⚠ está en el grupo pero este Tabulado no lo trae: suma 0,00 este mes
      y no traba la corrida. Se guarda por cliente y se aplica al ejecutar.
    </p>
  `,
};

export function renderConceptGroupingEditor(container, tabRows, currentGrouping, onChange) {
  const colByCode = buildColByCode(tabRows[0] || {});
  const allCodes  = Object.keys(colByCode).sort((a, b) => Number(a) - Number(b));

  let grouping = currentGrouping ? deepClone(currentGrouping) : deepClone(DEFAULT_CONCEPT_CONFIG);
  // `expanded` es puramente visual: qué grupos muestran todos sus chips. No
  // toca la agrupación ni lo que se guarda.
  let uiState  = { sort: 'num', hideNotFound: false, expanded: new Set() };

  function getAssignedCodes() {
    const s = new Set();
    for (const cat of CAT_META) {
      for (const e of (grouping[cat.key] || [])) s.add(e.code);
    }
    return s;
  }

  // Cuántos conceptos preconfigurados se encontraron en el Tabulado cargado.
  // Si son 0 (o muy pocos) y hay conceptos asignados, casi seguro se cargó el
  // archivo equivocado en el casillero Tabulado (ej: un recibo en vez del Tabulado).
  function countMatchedAssigned() {
    let total = 0, matched = 0;
    for (const cat of CAT_META) {
      for (const e of (grouping[cat.key] || [])) {
        total++;
        if (colByCode[e.code]) matched++;
      }
    }
    return { total, matched };
  }

  function renderEditor() {
    const assignedCodes = getAssignedCodes();
    const orphanCodes   = allCodes.filter(c => !assignedCodes.has(c));
    const { total: assignedTotal, matched: assignedMatched } = countMatchedAssigned();
    const fueraDelTab   = assignedTotal - assignedMatched;

    // Aviso fuerte si no se encontró (casi) ningún concepto preconfigurado
    const lowMatch = assignedTotal > 0 && assignedMatched <= Math.min(2, assignedTotal - 1);
    const warningBanner = lowMatch ? `
      <div style="margin-bottom:var(--sp-3);padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-warning);background:var(--color-warning-bg, rgba(234,179,8,0.08));border-radius:var(--radius-md);font-size:var(--text-sm);">
        <strong style="color:var(--color-warning);">⚠ Solo se detectaron ${allCodes.length} columna${allCodes.length !== 1 ? 's' : ''} de concepto en el Tabulado</strong>
        (de los ${assignedTotal} conceptos preconfigurados, ${assignedMatched === 0 ? 'ninguno coincide' : `solo ${assignedMatched} coinciden`}).
        <br>Esto suele pasar cuando el archivo cargado en el casillero <strong>Tabulado</strong> no es el correcto
        (por ejemplo un recibo o un rendimiento, en vez del Tabulado de columnas tipo <code>1003-SUELDO</code>).
        Verificá el archivo cargado más arriba y, si hace falta, tocá <strong>"Cambiar"</strong> para subir el Tabulado correcto.
      </div>` : '';

    const buckets = CAT_META.map(cat => {
      const entries    = grouping[cat.key] || [];
      const noEstan    = entries.filter(e => !colByCode[e.code]).length;
      const expandido  = uiState.expanded.has(cat.key);

      let displayEntries = entries.map((e, i) => ({ ...e, originalIdx: i }));
      if (uiState.hideNotFound) displayEntries = displayEntries.filter(e => colByCode[e.code]);
      if (uiState.sort === 'num') {
        displayEntries.sort((a, b) => Number(a.code) - Number(b.code));
      } else if (uiState.sort === 'alpha') {
        displayEntries.sort((a, b) => (colByCode[a.code] || a.code).localeCompare(colByCode[b.code] || b.code, 'es'));
      }

      // Colapso visual: los conceptos que no se dibujan siguen en el grupo.
      const ocultos  = expandido ? 0 : Math.max(0, displayEntries.length - CHIPS_VISIBLES);
      const visibles = ocultos > 0 ? displayEntries.slice(0, CHIPS_VISIBLES) : displayEntries;

      const chips = visibles.map(entry => {
        const found     = colByCode[entry.code];
        const suma      = entry.sign === 1;
        const signLabel = suma ? '+' : '−';
        const signTitle = suma
          ? `${entry.code} suma en ${cat.name} — clic para que reste`
          : `${entry.code} resta en ${cat.name} — clic para que sume`;
        const nombre = found
          ? `<span class="concept-chip__sep">·</span><span class="concept-chip__name">${esc(nombreDeColumna(found, entry.code))}</span>`
          : '';
        return `
          <span class="concept-chip${found ? '' : ' concept-chip--warn'}">
            <button type="button" class="concept-chip__sign concept-chip__sign--${suma ? 'plus' : 'minus'}"
              data-sign="${esc(cat.key)}:${entry.originalIdx}"
              title="${esc(signTitle)}" aria-label="${esc(signTitle)}">${signLabel}</button>
            ${found ? '' : '<span title="No está en este Tabulado" aria-label="no está en este Tabulado">⚠</span>'}
            <span class="concept-chip__code">${esc(entry.code)}</span>
            ${nombre}
            <button type="button" class="concept-chip__x" data-remove="${esc(cat.key)}:${entry.originalIdx}"
              title="Quitar de ${esc(cat.name)}" aria-label="Quitar ${esc(entry.code)} de ${esc(cat.name)}">✕</button>
          </span>`;
      }).join('');

      const masChip = ocultos > 0
        ? `<button type="button" class="concept-chip concept-chip--more" data-expand="${esc(cat.key)}">+ ${ocultos} más…</button>`
        : (expandido && displayEntries.length > CHIPS_VISIBLES
            ? `<button type="button" class="concept-chip concept-chip--more" data-collapse="${esc(cat.key)}">Ver menos</button>`
            : '');

      const availableCodes = allCodes.filter(c => !entries.some(e => e.code === c));
      const addChip = availableCodes.length > 0 ? `
        <label class="concept-chip concept-chip--add">
          ＋ Agregar del Tabulado…
          <select class="concept-chip__select" data-add-to="${esc(cat.key)}"
                  aria-label="Agregar un concepto del Tabulado a ${esc(cat.name)}">
            <option value="">＋ Agregar del Tabulado…</option>
            ${availableCodes.map(c => `<option value="${esc(c)}">${esc(colByCode[c] || c)}</option>`).join('')}
          </select>
        </label>` : '';

      return `
        <div class="bucket">
          <div class="bucket__head">
            <span class="bucket__name">${esc(cat.name)}</span>
            <span class="bucket__meta">
              ${entries.length} concepto${entries.length !== 1 ? 's' : ''}${noEstan > 0 ? ` · ${noEstan} fuera de este Tabulado` : ''}
            </span>
          </div>
          <div class="bucket__chips">
            ${chips || '<span class="bucket__empty">Sin conceptos asignados</span>'}
            ${masChip}
            ${addChip}
          </div>
        </div>`;
    }).join('');

    const orphanRows = orphanCodes.map(c => {
      const catOpts = CAT_META.map(cat =>
        `<option value="${cat.key}">${esc(cat.name)}</option>`
      ).join('');
      return `
        <div class="grouping-orphan">
          <span class="grouping-orphan__name" title="${esc(colByCode[c])}">${esc(colByCode[c])}</span>
          <label class="grouping-orphan__neg">
            <input type="checkbox" data-orphan-neg="${esc(c)}" style="margin:0;width:11px;height:11px;">−
          </label>
          <select class="form-select" data-assign-orphan="${esc(c)}"
            style="width:auto;max-width:120px;font-size:10px;height:22px;padding:1px 4px;"
            aria-label="Asignar ${esc(colByCode[c])} a un grupo">
            <option value="">→ ...</option>
            ${catOpts}
          </select>
        </div>`;
    }).join('');

    const segButtons = ['none', 'num', 'alpha'].map(mode => {
      const labels = { none: 'Sin ordenar', num: 'Por número', alpha: 'Alfabético' };
      return `<button type="button" class="seg__btn${uiState.sort === mode ? ' is-active' : ''}"
        data-sort="${mode}" aria-pressed="${uiState.sort === mode}">${labels[mode]}</button>`;
    }).join('');

    container.innerHTML = `
      <div class="wizard-panel">
        <div class="wizard-panel__head">
          <h4 class="wizard-panel__title">Agrupación de conceptos</h4>
          <span data-grouping-help></span>
          <div class="wizard-panel__end">
            ${fueraDelTab > 0
              ? `<span class="wizard-panel__warn">⚠ ${fueraDelTab} concepto${fueraDelTab !== 1 ? 's' : ''} fuera del Tabulado</span>`
              : ''}
            <button type="button" id="js-rtv-restore" class="btn btn--ghost btn--sm" style="white-space:nowrap;">
              ↺ Restaurar defaults
            </button>
          </div>
        </div>
        <p class="wizard-panel__sub">
          Qué conceptos del Tabulado suma cada grupo del Rendimiento. Se guarda por cliente.
        </p>
        ${warningBanner}
        <div class="grouping-toolbar">
          <span class="grouping-toolbar__label">Ordenar:</span>
          <div class="seg" role="group" aria-label="Orden de los conceptos">${segButtons}</div>
          <label class="grouping-toolbar__check">
            <input type="checkbox" id="js-rtv-hide-notfound" ${uiState.hideNotFound ? 'checked' : ''}>
            Ocultar los que no están en este Tabulado
          </label>
          <span class="grouping-legend">
            <span class="grouping-legend__plus">+</span> suma ·
            <span class="grouping-legend__minus">−</span> resta (un clic en el signo lo invierte) ·
            <span class="grouping-legend__warn">⚠</span> no está en este Tabulado
          </span>
        </div>
        <div class="bucket-grid">${buckets}</div>
        ${orphanCodes.length > 0 ? `
          <details class="grouping-orphans">
            <summary class="grouping-orphans__summary">
              <span class="grouping-orphans__caret" aria-hidden="true">▸</span>
              Sin asignar — ${orphanCodes.length} concepto${orphanCodes.length !== 1 ? 's' : ''} del Tabulado
              <span class="grouping-orphans__hint">(− = resta, → asigná a un grupo)</span>
            </summary>
            <div class="grouping-orphans__grid">${orphanRows}</div>
          </details>` : ''}
      </div>`;

    renderHelpPopover(container.querySelector('[data-grouping-help]'), AYUDA_AGRUPACION);

    // ── Eventos ──────────────────────────────────────────────────────────────

    container.querySelectorAll('[data-sign]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [catKey, idxStr] = btn.dataset.sign.split(':');
        grouping[catKey][Number(idxStr)].sign *= -1;
        onChange(deepClone(grouping));
        renderEditor();
      });
    });

    container.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const [catKey, idxStr] = btn.dataset.remove.split(':');
        grouping[catKey].splice(Number(idxStr), 1);
        onChange(deepClone(grouping));
        renderEditor();
      });
    });

    container.querySelectorAll('[data-add-to]').forEach(sel => {
      sel.addEventListener('change', () => {
        const catKey = sel.dataset.addTo;
        const code   = sel.value;
        if (!code) return;
        if (!grouping[catKey]) grouping[catKey] = [];
        grouping[catKey].push({ code, sign: 1 });
        onChange(deepClone(grouping));
        renderEditor();
      });
    });

    container.querySelectorAll('[data-assign-orphan]').forEach(sel => {
      sel.addEventListener('change', () => {
        const code   = sel.dataset.assignOrphan;
        const catKey = sel.value;
        if (!catKey) return;
        const negCheck = container.querySelector(`[data-orphan-neg="${CSS.escape(code)}"]`);
        const sign = negCheck?.checked ? -1 : 1;
        if (!grouping[catKey]) grouping[catKey] = [];
        grouping[catKey].push({ code, sign });
        onChange(deepClone(grouping));
        renderEditor();
      });
    });

    container.querySelector('#js-rtv-restore')?.addEventListener('click', async () => {
      if (!await showConfirm('¿Restaurar la agrupación predeterminada? Se perderán los cambios actuales.')) return;
      grouping = deepClone(DEFAULT_CONCEPT_CONFIG);
      onChange(deepClone(grouping));
      renderEditor();
    });

    container.querySelectorAll('[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        uiState.sort = btn.dataset.sort;
        renderEditor();
      });
    });

    container.querySelector('#js-rtv-hide-notfound')?.addEventListener('change', e => {
      uiState.hideNotFound = e.target.checked;
      renderEditor();
    });

    // Plegar/desplegar un grupo no toca la agrupación: sólo cambia cuántos chips
    // se dibujan, así que no llama a `onChange`.
    container.querySelectorAll('[data-expand]').forEach(btn => {
      btn.addEventListener('click', () => {
        uiState.expanded.add(btn.dataset.expand);
        renderEditor();
      });
    });
    container.querySelectorAll('[data-collapse]').forEach(btn => {
      btn.addEventListener('click', () => {
        uiState.expanded.delete(btn.dataset.collapse);
        renderEditor();
      });
    });
  }

  renderEditor();
}
