// gtnGsmaAsignaciones.js — La tabla "código de Axton → columna del GTN" de GSMA.
//
// Es UNA tabla con dos lugares: el Paso 2 (donde se asigna) y la pantalla de
// resultados ("Cómo se armó cada columna del GTN", donde se lee). Las dos tienen
// los mismos filtros y las mismas dos vistas —pedido de Willy en la revisión del
// mockup: la vista por columna del GTN es AGRUPADA, cada columna una fila-
// encabezado con su subtotal y cuántos códigos la alimentan, desplegable, y
// debajo una fila por código—, así que se escribe una vez acá.
//
// Lo que la tabla no deja pasar nunca: un concepto SIN ASIGNAR escondido por un
// filtro. El aviso rojo de arriba cuenta todos, se vea lo que se vea, y si el
// filtro tapa alguno lo dice y ofrece verlo (specs/gtn-gsma-axton.md §7).
//
// No calcula ni decide: recibe los conceptos ya resueltos
// (`resolverConceptos()` de js/controls/gtnGsmaConfig.js) y, en el Paso 2,
// avisa qué eligió el analista con `onAsignar`.

import { GTN_COLUMNS, GTN_ASSIGNABLE } from '../exports/gtnGsmaLayout.js';
import { ESTADOS_ASIGNACION, FUERA_DEL_GTN, nombreColumna } from '../controls/gtnGsmaConfig.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const fmt = (v) => (v === null || v === undefined || !Number.isFinite(v)
  ? '—'
  : v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const fechaAR = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '');

const normTxt = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Los bloques del desplegable, en el orden del GTN. */
const BLOQUES = [
  { block: 'gross',     label: 'Entra en Gross Pay' },
  { block: 'deduction', label: 'Deducciones del empleado' },
  { block: 'net',       label: 'Neto pagado' },
  { block: 'employer',  label: 'Costo del empleador' },
];

/** El `<select>` de columnas del GTN. */
export function columnaSelectHtml({ codigo, actual = null, conVacio = true } = {}) {
  const opt = (value, label) =>
    `<option value="${esc(value)}"${value === actual ? ' selected' : ''}>${esc(label)}</option>`;
  return `
    <select class="form-select form-select--sm gtn-asig__select" data-asignar="${esc(codigo)}"
            aria-label="Columna del GTN para el concepto ${esc(codigo)}">
      ${conVacio ? '<option value="">— Elegí la columna del GTN —</option>' : ''}
      ${BLOQUES.map(b => `
        <optgroup label="${esc(b.label)}">
          ${GTN_ASSIGNABLE.filter(c => c.block === b.block).map(c => opt(c.key, c.ui)).join('')}
        </optgroup>`).join('')}
      <optgroup label="No va al informe">
        ${opt(FUERA_DEL_GTN, nombreColumna(FUERA_DEL_GTN))}
      </optgroup>
    </select>
  `;
}

function estadoBadgeHtml(c) {
  switch (c.estado) {
    case 'sin_asignar': return '<span class="badge badge--danger">Sin asignar</span>';
    case 'confirmado':  return '<span class="badge badge--success">Confirmado</span>';
    case 'analista':    return `<span class="badge badge--primary">Asignado por el analista${c.fecha ? ` · ${esc(fechaAR(c.fecha))}` : ''}</span>`;
    case 'fuera':       return `<span class="badge badge--neutral">Fuera del GTN, a propósito${c.origen === 'analista' && c.fecha ? ` · ${esc(fechaAR(c.fecha))}` : ''}</span>`;
    default:            return '';
  }
}

function estadoTexto(c) {
  const base = ESTADOS_ASIGNACION.find(e => e.value === c.estado)?.label ?? '';
  return c.fecha ? `${base} ${fechaAR(c.fecha)}` : base;
}

function checkHtml(chk) {
  if (!chk) return '<span class="text-muted">—</span>';
  if (chk.cierra === null) return '<span class="text-muted" title="El Tabulado no trae TOTAL GENERAL para este concepto">sin TOTAL GENERAL</span>';
  if (chk.cierra) return '<span class="badge badge--success">✓ cierra</span>';
  return `<span class="badge badge--danger" title="${esc(`Sumado ${fmt(chk.sumado)} · TOTAL GENERAL ${fmt(chk.tg)}`)}">no cierra</span>`;
}

/**
 * @param {HTMLElement} host
 * @param {object} opts
 * @param {object[]} opts.conceptos — de `resolverConceptos()`
 * @param {'edit'|'read'} [opts.mode='read']
 * @param {'codigo'|'columna'} [opts.vista] — la vista con la que abre
 * @param {(codigo: string, columna: string) => object[]} [opts.onAsignar] — en
 *   el Paso 2: guarda la elección y devuelve los conceptos re-resueltos
 * @param {Record<string, {cierra: boolean|null, sumado: number|null, tg: number|null}>} [opts.checks]
 *   — en resultados: el control contra TOTAL GENERAL de cada código
 * @returns {{ refresh: (conceptos: object[]) => void }}
 */
export function renderAsignacionesTable(host, { conceptos, mode = 'read', vista, onAsignar, checks = null } = {}) {
  const editable = mode === 'edit';
  const st = {
    conceptos: conceptos || [],
    vista: vista || (editable ? 'codigo' : 'columna'),
    estado: 'todos',
    columna: 'todas',
    texto: { codigo: '', concepto: '', importe: '', columna: '', estado: '' },
    colapsados: new Set(),
    editando: new Set(),
  };

  const textCols = [
    { key: 'codigo', label: 'Código' },
    { key: 'concepto', label: 'Concepto en Axton' },
    { key: 'importe', label: editable ? 'Importe del mes (total)' : 'Importe total', num: true },
    { key: 'columna', label: 'Columna del GTN' },
    { key: 'estado', label: editable ? 'Estado' : 'Estado de la asignación' },
    ...(checks ? [{ key: 'check', label: 'Control contra TOTAL GENERAL', noFilter: true }] : []),
  ];
  const ncols = textCols.length;

  host.innerHTML = `
    <div class="gtn-asig">
      <div data-banner></div>
      <div class="gtn-asig__controls">
        <div class="gtn-asig__ctl">
          <span class="gtn-asig__lbl">Vista</span>
          <div class="seg" role="group" aria-label="Vista de la tabla">
            <button type="button" class="seg__btn" data-vista="${editable ? 'codigo' : 'columna'}">${editable ? 'Por código' : 'Por columna del GTN'}</button>
            <button type="button" class="seg__btn" data-vista="${editable ? 'columna' : 'codigo'}">${editable ? 'Agrupada por columna del GTN' : 'Por código'}</button>
          </div>
        </div>
        <div class="gtn-asig__ctl">
          <span class="gtn-asig__lbl">Estado</span>
          <div class="results-chips" data-chips></div>
        </div>
        <div class="gtn-asig__ctl">
          <span class="gtn-asig__lbl">Columna del GTN</span>
          <select class="form-select form-select--sm gtn-asig__colsel" data-colfiltro aria-label="Filtrar por columna del GTN"></select>
        </div>
        <div class="gtn-asig__ctl" data-grupos-ctl>
          <span class="gtn-asig__lbl">Grupos</span>
          <span class="gtn-asig__links"><button type="button" class="ctrl-link" data-expandir>Expandir todos</button>
            · <button type="button" class="ctrl-link" data-colapsar>Colapsar todos</button></span>
        </div>
      </div>
      <div class="gtn-asig__scroll">
        <table class="data-table data-table--compact gtn-asig__table">
          <thead>
            <tr>${textCols.map(c => `<th${c.num ? ' class="text-right"' : ''}>${esc(c.label)}</th>`).join('')}</tr>
            <tr class="gtn-asig__filters">${textCols.map(c => `<th>${c.noFilter ? ''
              : `<input type="search" class="form-input form-input--sm" data-f="${c.key}" placeholder="Filtrar…" aria-label="Filtrar ${esc(c.label)}">`}</th>`).join('')}</tr>
          </thead>
          <tbody data-body></tbody>
        </table>
      </div>
      ${editable ? '<p class="gtn-asig__note">Cambiar una asignación ya confirmada la pasa a “Asignado por el analista” con la fecha de hoy. La asignación se guarda para GSMA al ejecutar y vale los meses siguientes.</p>' : ''}
    </div>
  `;

  const bannerEl = host.querySelector('[data-banner]');
  const chipsEl = host.querySelector('[data-chips]');
  const colSel = host.querySelector('[data-colfiltro]');
  const bodyEl = host.querySelector('[data-body]');
  const gruposCtl = host.querySelector('[data-grupos-ctl]');

  // ── Filtros ────────────────────────────────────────────────────────────────
  const pasaTexto = (c) => {
    const t = st.texto;
    if (t.codigo && !normTxt(c.codigo).includes(normTxt(t.codigo))) return false;
    if (t.concepto && !normTxt(c.nombre).includes(normTxt(t.concepto))) return false;
    if (t.importe) {
      const q = normTxt(t.importe).replace(/[.\s$]/g, '');
      const v = fmt(c.total).replace(/\./g, '');
      if (!v.includes(q)) return false;
    }
    if (t.columna) {
      const nom = c.estado === 'sin_asignar' ? 'sin asignar' : nombreColumna(c.columna);
      if (!normTxt(nom).includes(normTxt(t.columna))) return false;
    }
    if (t.estado && !normTxt(estadoTexto(c)).includes(normTxt(t.estado))) return false;
    return true;
  };
  const pasaColumna = (c) => {
    if (st.columna === 'todas') return true;
    if (st.columna === 'sin_asignar') return c.estado === 'sin_asignar';
    return c.columna === st.columna;
  };
  const pasa = (c) => (st.estado === 'todos' || c.estado === st.estado) && pasaColumna(c) && pasaTexto(c);

  // ── Dibujo ─────────────────────────────────────────────────────────────────
  function dibujarBanner() {
    const sin = st.conceptos.filter(c => c.estado === 'sin_asignar');
    if (sin.length === 0) { bannerEl.innerHTML = ''; return; }
    const ocultos = sin.filter(c => !pasa(c)).length;
    bannerEl.innerHTML = `
      <div class="gtn-asig__banner" role="alert">
        <span aria-hidden="true">✕</span>
        <span><strong>${sin.length} ${sin.length === 1 ? 'concepto sin asignar' : 'conceptos sin asignar'}</strong>
        (${sin.map(c => esc(c.codigo)).join(', ')}). No se puede generar el GTN hasta que cada concepto del Tabulado
        tenga su columna (o esté marcado como Fuera del GTN).
        ${ocultos > 0 ? ` Hay ${ocultos} sin asignar fuera del filtro — <button type="button" class="ctrl-link" data-ver-sin>ver</button>` : ''}</span>
      </div>`;
    bannerEl.querySelector('[data-ver-sin]')?.addEventListener('click', () => {
      st.estado = 'sin_asignar';
      st.columna = 'todas';
      st.texto = { codigo: '', concepto: '', importe: '', columna: '', estado: '' };
      host.querySelectorAll('[data-f]').forEach(i => { i.value = ''; });
      dibujarTodo();
    });
  }

  function dibujarChips() {
    const opciones = [{ value: 'todos', label: 'Todos' }, ...ESTADOS_ASIGNACION.map(e => ({
      value: e.value,
      label: { sin_asignar: 'Sin asignar', confirmado: 'Confirmados', analista: 'Asignados por el analista', fuera: 'Fuera del GTN' }[e.value],
    }))];
    const n = (v) => (v === 'todos' ? st.conceptos.length : st.conceptos.filter(c => c.estado === v).length);
    chipsEl.innerHTML = opciones.map(o => {
      const tono = o.value === 'sin_asignar' ? ' results-chip--dif' : o.value === 'confirmado' ? ' results-chip--ok' : '';
      return `<button type="button" class="results-chip${tono}${st.estado === o.value ? ' results-chip--active' : ''}"
                      data-estado="${o.value}" aria-pressed="${st.estado === o.value}">
                ${esc(o.label)} <span class="results-chip__count">${n(o.value)}</span></button>`;
    }).join('');
  }

  function dibujarColSel() {
    const usadas = GTN_COLUMNS.filter(c => st.conceptos.some(k => k.columna === c.key));
    const hayFuera = st.conceptos.some(k => k.columna === FUERA_DEL_GTN);
    const haySin = st.conceptos.some(k => k.estado === 'sin_asignar');
    const opt = (v, l) => `<option value="${esc(v)}"${st.columna === v ? ' selected' : ''}>${esc(l)}</option>`;
    colSel.innerHTML = opt('todas', 'Todas las columnas')
      + (haySin ? opt('sin_asignar', 'Sin asignar') : '')
      + usadas.map(c => opt(c.key, c.ui)).join('')
      + (hayFuera ? opt(FUERA_DEL_GTN, 'Fuera del GTN') : '');
  }

  function celdaColumna(c) {
    const enEdicion = editable && (c.estado === 'sin_asignar' || st.editando.has(c.codigo));
    if (enEdicion) {
      const sug = c.estado === 'sin_asignar'
        ? (c.sugerencia
          ? `<div class="gtn-asig__sug">Sugerencia del Manual de Conceptos de la migración: <strong>${esc(nombreColumna(c.sugerencia))}</strong> — sin confirmar en un Tabulado real; elegila vos.</div>`
          : '<div class="gtn-asig__sug">El Manual de Conceptos no trae sugerencia para este código.</div>')
        : ` <button type="button" class="ctrl-link" data-cancelar="${esc(c.codigo)}">cancelar</button>`;
      return columnaSelectHtml({ codigo: c.codigo, actual: c.estado === 'sin_asignar' ? null : c.columna,
        conVacio: c.estado === 'sin_asignar' }) + sug;
    }
    return `${esc(nombreColumna(c.columna))}${c.nota ? ` <span class="gtn-asig__nota">· ${esc(c.nota)}</span>` : ''}`
      + (editable ? ` <button type="button" class="ctrl-link" data-cambiar="${esc(c.codigo)}">✎ cambiar</button>` : '');
  }

  function filaHtml(c) {
    return `
      <tr class="${c.estado === 'sin_asignar' ? 'gtn-asig__row--sin' : ''}${c.estado === 'fuera' ? ' gtn-asig__row--fuera' : ''}">
        <td class="gtn-asig__cod">${esc(c.codigo)}</td>
        <td>${esc(c.nombre)}</td>
        <td class="text-right gtn-asig__num">${esc(fmt(c.total))}</td>
        <td>${celdaColumna(c)}</td>
        <td>${estadoBadgeHtml(c)}</td>
        ${checks ? `<td>${checkHtml(checks[c.codigo])}</td>` : ''}
      </tr>`;
  }

  function grupos(visibles) {
    const out = [];
    const sin = visibles.filter(c => c.estado === 'sin_asignar');
    if (sin.length) out.push({ key: 'sin_asignar', label: 'Sin asignar', tone: 'sin', filas: sin });
    for (const col of GTN_COLUMNS) {
      const filas = visibles.filter(c => c.estado !== 'sin_asignar' && c.columna === col.key);
      if (filas.length) out.push({ key: col.key, label: col.ui, tone: 'col', filas });
    }
    const fuera = visibles.filter(c => c.columna === FUERA_DEL_GTN);
    if (fuera.length) out.push({ key: FUERA_DEL_GTN, label: 'Fuera del GTN, a propósito — no van al informe', tone: 'fuera', filas: fuera });
    return out;
  }

  function dibujarCuerpo() {
    const visibles = st.conceptos.filter(pasa);
    gruposCtl.hidden = st.vista !== 'columna';
    if (visibles.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="${ncols}" class="text-muted">Ningún concepto quedó con los filtros puestos.</td></tr>`;
      return;
    }
    if (st.vista === 'codigo') {
      // Los sin asignar van arriba: son lo único que frena.
      const orden = [...visibles.filter(c => c.estado === 'sin_asignar'), ...visibles.filter(c => c.estado !== 'sin_asignar')];
      bodyEl.innerHTML = orden.map(filaHtml).join('');
      return;
    }
    bodyEl.innerHTML = grupos(visibles).map(g => {
      const abierto = !st.colapsados.has(g.key);
      const subtotal = g.filas.reduce((acc, c) => (c.total === null ? acc : (acc ?? 0) + c.total), null);
      return `
        <tr class="gtn-asig__grp gtn-asig__grp--${g.tone}">
          <td colspan="${ncols}">
            <button type="button" class="gtn-asig__toggle" data-grp="${esc(g.key)}" aria-expanded="${abierto}">
              <span class="gtn-asig__caret" aria-hidden="true">${abierto ? '▾' : '▸'}</span>
              <strong>${esc(g.label)}</strong>
              <span class="gtn-asig__grpmeta">· ${g.filas.length} ${g.filas.length === 1 ? 'código' : 'códigos'}
                · $ ${esc(fmt(subtotal))}</span>
            </button>
          </td>
        </tr>
        ${abierto ? g.filas.map(filaHtml).join('') : ''}`;
    }).join('');
  }

  function dibujarVista() {
    host.querySelectorAll('[data-vista]').forEach(b => {
      const activo = b.dataset.vista === st.vista;
      b.classList.toggle('is-active', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
  }

  function dibujarTodo() {
    dibujarVista();
    dibujarChips();
    dibujarColSel();
    dibujarBanner();
    dibujarCuerpo();
  }

  // ── Eventos ────────────────────────────────────────────────────────────────
  host.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => {
    st.vista = b.dataset.vista;
    dibujarVista();
    dibujarCuerpo();
  }));
  chipsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-estado]');
    if (!b) return;
    st.estado = b.dataset.estado;
    dibujarChips();
    dibujarBanner();
    dibujarCuerpo();
  });
  colSel.addEventListener('change', () => { st.columna = colSel.value; dibujarBanner(); dibujarCuerpo(); });
  host.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('input', () => {
    st.texto[inp.dataset.f] = inp.value;
    dibujarBanner();
    dibujarCuerpo();
  }));
  host.querySelector('[data-expandir]').addEventListener('click', () => { st.colapsados.clear(); dibujarCuerpo(); });
  host.querySelector('[data-colapsar]').addEventListener('click', () => {
    grupos(st.conceptos).forEach(g => st.colapsados.add(g.key));
    dibujarCuerpo();
  });
  bodyEl.addEventListener('click', (e) => {
    const t = e.target.closest('[data-grp],[data-cambiar],[data-cancelar]');
    if (!t) return;
    if (t.dataset.grp !== undefined) {
      const k = t.dataset.grp;
      if (st.colapsados.has(k)) st.colapsados.delete(k); else st.colapsados.add(k);
      dibujarCuerpo();
    } else if (t.dataset.cambiar !== undefined) {
      st.editando.add(t.dataset.cambiar);
      dibujarCuerpo();
    } else if (t.dataset.cancelar !== undefined) {
      st.editando.delete(t.dataset.cancelar);
      dibujarCuerpo();
    }
  });
  bodyEl.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-asignar]');
    if (!sel || !editable || !onAsignar || !sel.value) return;
    const codigo = sel.dataset.asignar;
    st.editando.delete(codigo);
    st.conceptos = onAsignar(codigo, sel.value) || st.conceptos;
    dibujarTodo();
  });

  dibujarTodo();

  return {
    refresh(nuevos) { st.conceptos = nuevos || st.conceptos; dibujarTodo(); },
  };
}
