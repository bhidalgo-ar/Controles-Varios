// novedadesLiquidacionConfigEditor.js — El panel del Paso 2 de Novedades vs Liquidación
//
// Dos decisiones del analista que no se pueden resolver desde los archivos:
//
//   1. **Qué conceptos no se comparan porque están en otra unidad.** Una novedad
//      cargada en horas contra una liquidación en días da una diferencia que
//      parece real y no lo es, y no hay ningún dato en los archivos que lo
//      declare. Nada se convierte (D-065): el concepto marcado acá sale como
//      "no comparable" con el motivo escrito.
//   2. **Qué conceptos no llegan nunca a la liquidación del mes** (informativos,
//      provisiones que el cliente carga para su propio control). Sin esto, cada
//      mes salen como "sin contraparte" y el analista se acostumbra a ignorar la
//      banda que más importa.
//
// Las dos listas se guardan **por código de concepto**, nunca por rótulo: el
// criollo cambia entre dos archivos del mismo cliente y del mismo mes
// (D-039/D-070). Y por eso mismo el panel muestra el rótulo al lado del código,
// para que el analista sepa qué está marcando.
//
// Está acá y no en el módulo del control porque es pantalla y no cálculo, igual
// que los otros editores de config del Paso 2.

import { DEFAULT_NOV_LIQ_CONFIG, claveConcepto } from '../controls/novedadesLiquidacion.js';

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {object}   [opts.config]                 valor guardado del cliente
 * @param {boolean}  [opts.openByDefault]
 * @param {function} [opts.onChange]               recibe la config nueva completa
 * @param {object}   [opts.importadorMeta]         parseMetadata del importador cargado
 * @param {object}   [opts.tabMeta]               parseMetadata del Tabulado cargado
 */
export function renderNovedadesLiquidacionConfigEditor(container, opts = {}) {
  const {
    config = DEFAULT_NOV_LIQ_CONFIG(),
    openByDefault = false,
    onChange = () => {},
    importadorMeta = null,
    tabMeta = null,
  } = opts;

  const current = { ...DEFAULT_NOV_LIQ_CONFIG(), ...config };
  current.conceptosNoComparables = [...(current.conceptosNoComparables || [])];
  current.conceptosSinLiquidacion = [...(current.conceptosSinLiquidacion || [])];

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Conceptos que no se comparan
    </summary>
    <div data-nl-conceptos style="margin-top:var(--sp-3);"></div>
  `;

  const host = editor.querySelector('[data-nl-conceptos]');

  // Los conceptos del importador cargado, con su rótulo en criollo y si el
  // Tabulado del período trae columna propia para ese código.
  const columnas = importadorMeta?.columnas || [];
  const conceptos = [];
  const vistos = new Set();
  for (const c of columnas) {
    const clave = claveConcepto(c.codigo);
    if (!clave || vistos.has(clave)) continue;
    vistos.add(clave);
    conceptos.push({ clave, codigo: String(c.codigo), rotulo: c.rotulo || '' });
  }

  const clavesTabulado = new Set(
    (tabMeta?.conceptos || []).map(c => claveConcepto(c.codigoBase ?? c.codigo)).filter(Boolean)
  );

  function pintar() {
    if (!conceptos.length) {
      host.innerHTML = `
        <p class="text-muted" style="font-size:var(--text-sm);margin:0;">
          Cargá el importador de novedades y acá aparecen sus conceptos, para marcar los que no se
          pueden comparar contra la liquidación.
        </p>`;
      return;
    }

    const noComparables = new Set(current.conceptosNoComparables.map(claveConcepto));
    const sinLiquidacion = new Set(current.conceptosSinLiquidacion.map(claveConcepto));

    host.innerHTML = `
      <p style="font-size:var(--text-sm);margin:0 0 var(--sp-2);">
        El importador trae <strong>${conceptos.length}</strong> concepto${conceptos.length === 1 ? '' : 's'}.
        Todos se comparan contra la liquidación salvo los que marqués acá.
      </p>
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>Código</th><th>Rótulo en el importador</th><th>En el Tabulado</th>
            <th>Otra unidad: no comparar</th><th>No llega a la liquidación</th>
          </tr>
        </thead>
        <tbody>
          ${conceptos.map(c => `
            <tr>
              <td>${esc(c.codigo)}</td>
              <td>${c.rotulo ? esc(c.rotulo) : '<span class="text-muted">sin rótulo</span>'}</td>
              <td>${clavesTabulado.has(c.clave)
                ? 'tiene columna'
                : '<span class="text-muted">sin columna propia</span>'}</td>
              <td><input type="checkbox" data-nl-nocomp="${esc(c.clave)}"${noComparables.has(c.clave) ? ' checked' : ''}></td>
              <td><input type="checkbox" data-nl-sinliq="${esc(c.clave)}"${sinLiquidacion.has(c.clave) ? ' checked' : ''}></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-2) 0 0;">
        «Otra unidad» es para la novedad que se carga en horas y se liquida en días (o al revés): el
        control la lista como no comparable con el motivo, y no la convierte. «No llega a la
        liquidación» es para el concepto informativo, que si no marcás sale todos los meses como
        novedad sin contraparte. Un concepto sin columna propia en el Tabulado no es un problema:
        se compara contra el reporte de Totales de Concepto.
      </p>
    `;

    for (const chk of host.querySelectorAll('[data-nl-nocomp]')) {
      chk.addEventListener('change', (e) => {
        const set = new Set(current.conceptosNoComparables.map(claveConcepto));
        if (e.target.checked) set.add(e.target.dataset.nlNocomp);
        else set.delete(e.target.dataset.nlNocomp);
        current.conceptosNoComparables = [...set];
        onChange(copia(current));
      });
    }
    for (const chk of host.querySelectorAll('[data-nl-sinliq]')) {
      chk.addEventListener('change', (e) => {
        const set = new Set(current.conceptosSinLiquidacion.map(claveConcepto));
        if (e.target.checked) set.add(e.target.dataset.nlSinliq);
        else set.delete(e.target.dataset.nlSinliq);
        current.conceptosSinLiquidacion = [...set];
        onChange(copia(current));
      });
    }
  }

  pintar();
  container.appendChild(editor);
  return editor;
}

/** Copia nueva: el wizard guarda lo que le llega y el editor sigue mutando lo suyo. */
function copia(cfg) {
  return {
    ...cfg,
    conceptosNoComparables: [...cfg.conceptosNoComparables],
    conceptosSinLiquidacion: [...cfg.conceptosSinLiquidacion],
  };
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
