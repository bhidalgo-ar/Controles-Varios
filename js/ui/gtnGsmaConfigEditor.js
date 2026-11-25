// gtnGsmaConfigEditor.js — Los dos paneles del Paso 2 del GTN de GSMA.
//
//   1. **El tipo de cambio del mes** (ARS por USD). Obligatorio: va a la celda
//      Exchange Rate del cuadro de autorización del GTN. Es un dato DEL MES y no
//      se guarda entre corridas (`perRun` en el registry): si se precargara el
//      del mes anterior, el GTN saldría con un tipo de cambio viejo y coherente,
//      que es el error que nadie ve.
//   2. **Las asignaciones código de Axton → columna del GTN**, guardadas para
//      GSMA (D-035/D-039). La tabla es la de js/ui/gtnGsmaAsignaciones.js, la
//      misma que se lee en resultados. Se abre sola cuando hay algo sin asignar.
//
// Lo que frena (concepto sin asignar, falta el tipo de cambio) lo decide
// `motivosGtnGsma()` de js/controls/gtnGsmaConfig.js, que es lo mismo que mira el
// gate del wizard: el panel lo muestra, no lo decide.

import {
  DEFAULT_GTN_GSMA_CONFIG, resolverConceptos, asignar, tipoCambioValido, nombreColumna, columnasNoConceptoGtn,
} from '../controls/gtnGsmaConfig.js';
import { EXCHANGE_RATE_CELL } from '../exports/gtnGsmaLayout.js';
import { renderAsignacionesTable } from './gtnGsmaAsignaciones.js';

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const fmt = (v) => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * El campo del tipo de cambio.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {number|null} [opts.config] — el valor que ya está en el state (no se guarda entre corridas)
 * @param {(n: number|null) => void} [opts.onChange]
 */
export function renderGtnGsmaTipoCambioEditor(container, opts = {}) {
  const { config = null, onChange = () => {} } = opts;
  const inicial = tipoCambioValido(config);

  const card = document.createElement('div');
  card.className = 'gtn-card';
  card.innerHTML = `
    <label class="gtn-tc__label" for="gtn-tc-input">Tipo de cambio del mes (ARS por USD) · obligatorio</label>
    <input id="gtn-tc-input" type="text" inputmode="decimal" autocomplete="off"
           class="form-input gtn-tc__input" placeholder="Ej.: 1.050,00"
           value="${inicial === null ? '' : esc(fmt(inicial))}" data-gtn-tc>
    <div class="gtn-tc__msg" data-gtn-tc-msg></div>
  `;
  container.appendChild(card);

  const input = card.querySelector('[data-gtn-tc]');
  const msg = card.querySelector('[data-gtn-tc-msg]');
  const pintar = () => {
    const raw = input.value.trim();
    const n = tipoCambioValido(raw);
    const falta = n === null;
    input.classList.toggle('gtn-tc__input--falta', falta);
    msg.classList.toggle('gtn-tc__msg--falta', falta);
    msg.textContent = falta
      ? (raw === '' ? `Obligatorio: va a la celda Exchange Rate (${EXCHANGE_RATE_CELL}) del GTN.`
        : `"${raw}" no es un tipo de cambio válido: tiene que ser un número mayor a 0.`)
      : `Va a la celda Exchange Rate (${EXCHANGE_RATE_CELL}) del GTN: ${fmt(n)} ARS por USD.`;
    return n;
  };
  input.addEventListener('input', () => onChange(pintar()));
  pintar();
}

/**
 * La tabla de asignaciones.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {object}   [opts.config]        la config guardada de GSMA (o las semillas)
 * @param {boolean}  [opts.openByDefault]
 * @param {function} [opts.onChange]      recibe la config nueva completa
 * @param {object}   [opts.tabMeta]       parseMetadata del Tabulado de Axton cargado
 * @param {object[]} [opts.tabRows]       parsedRows del Tabulado (para el importe del mes)
 */
export function renderGtnGsmaAsignacionesEditor(container, opts = {}) {
  const {
    config = DEFAULT_GTN_GSMA_CONFIG(),
    openByDefault = false,
    onChange = () => {},
    tabMeta = null,
    tabRows = [],
  } = opts;

  let current = { ...DEFAULT_GTN_GSMA_CONFIG(), ...(config || {}) };
  current = { ...current, asignaciones: { ...(current.asignaciones || {}) } };

  const details = document.createElement('details');
  details.className = 'gtn-card gtn-card--destacada';
  if (openByDefault) details.open = true;
  container.appendChild(details);

  const conceptos = () => resolverConceptos(tabMeta?.conceptos || [], current, tabRows);

  const resumen = (lista) => {
    const sin = lista.filter(c => c.estado === 'sin_asignar').length;
    if (!tabMeta) return 'cargá el Tabulado de Axton para ver qué conceptos trae';
    return sin > 0
      ? `<span class="badge badge--danger">${sin} sin asignar</span> de ${lista.length} conceptos`
      : `${lista.length} conceptos, todos asignados`;
  };

  const lista0 = conceptos();
  details.innerHTML = `
    <summary style="cursor:pointer;list-style:none;">
      <span class="gtn-card__title"><span class="gtn-card__caret" aria-hidden="true">▸</span> Asignación de conceptos: Axton → GTN</span>
      <span class="text-muted" style="font-size:var(--text-sm);margin-left:var(--sp-2);" data-gtn-resumen>${resumen(lista0)}</span>
    </summary>
    <p class="gtn-card__intro" style="margin-top:var(--sp-2);">
      Cada concepto del Tabulado tiene que tener su columna del GTN, o estar marcado como “Fuera del GTN”.
      Las columnas que no son conceptos (Legajo, Apellido y Nombre, CUIL, F.R.P., Recibo, Mov., Bruto, Retenciones,
      Salario Familiar, Exento, Neto, TOTAL -, LSD, liquidacion) no se listan. La asignación se guarda para GSMA y vale
      los meses siguientes.
    </p>
    <div data-gtn-nuevos></div>
    <div data-gtn-tabla></div>
  `;

  const resumenEl = details.querySelector('[data-gtn-resumen]');
  const nuevosEl = details.querySelector('[data-gtn-nuevos]');
  const tablaEl = details.querySelector('[data-gtn-tabla]');

  // Una columna con forma de concepto pero sin «código - nombre» no se puede
  // asignar desde acá: frena igual, y se dice qué hacer (el export).
  const columnasMal = tabMeta ? columnasNoConceptoGtn(tabMeta).frenan : [];
  const columnasMalHtml = columnasMal.length ? `
      <div class="gtn-asig__banner" role="alert" style="margin-bottom:var(--sp-3);">
        <span aria-hidden="true">✕</span>
        <span>${columnasMal.map(c => esc(c.motivo)).join('<br>')}</span>
      </div>` : '';

  const pintarNuevos = (lista) => {
    const sin = lista.filter(c => c.estado === 'sin_asignar');
    resumenEl.innerHTML = resumen(lista)
      + (columnasMal.length ? ` · <span class="badge badge--danger">${columnasMal.length} columna${columnasMal.length === 1 ? '' : 's'} sin formato</span>` : '');
    if (sin.length === 0) { nuevosEl.innerHTML = columnasMalHtml; return; }
    nuevosEl.innerHTML = columnasMalHtml + `
      <div class="rb-issues" style="margin-bottom:var(--sp-3);">
        ${sin.map(c => `
          <div class="rb-issue">
            <div class="rb-issue__sev rb-issue__sev--hi"></div>
            <div class="rb-issue__who">Concepto nuevo<small>${esc(c.codigo)}</small></div>
            <div class="rb-issue__body">
              <div class="rb-issue__what">Este mes apareció ${esc(c.codigo)} - ${esc(c.nombre)}, que nunca se había asignado para GSMA. Elegí su columna en la tabla; la app la recuerda para los meses siguientes.</div>
              <div class="rb-issue__why">${c.sugerencia
                ? `Sugerencia del Manual de Conceptos de la migración: ${esc(nombreColumna(c.sugerencia))} — sin confirmar en un Tabulado real; elegila vos. La app no la aplica sola.`
                : 'El Manual de Conceptos de la migración no trae sugerencia para este código.'}</div>
            </div>
          </div>`).join('')}
      </div>`;
  };

  if (!tabMeta) {
    tablaEl.innerHTML = `<p class="text-muted" style="font-size:var(--text-sm);">
      Cuando cargues el Tabulado de Axton, acá aparecen sus conceptos con la columna del GTN a la que va cada uno.
      GSMA tiene ${Object.keys(current.asignaciones).length} asignaciones guardadas.</p>`;
    return;
  }

  pintarNuevos(lista0);
  renderAsignacionesTable(tablaEl, {
    conceptos: lista0,
    mode: 'edit',
    onAsignar: (codigo, columna) => {
      current = asignar(current, codigo, columna);
      onChange(current);
      const lista = conceptos();
      pintarNuevos(lista);
      return lista;
    },
  });
}
