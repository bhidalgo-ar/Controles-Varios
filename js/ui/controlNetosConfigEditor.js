// controlNetosConfigEditor.js — El panel del Paso 2 del Control de Netos
//
// Está acá y no en el módulo del control porque es pantalla y no cálculo (mismo
// lugar que `rendVsAsientoConfigEditor.js` y los otros editores de config).
//
// Tres decisiones del mes, en orden de cuánto mueven el resultado:
//
//   1. **El acuerdo no remunerativo.** Lo que cobran todos por paritaria. No
//      tiene semilla: cambia todos los meses, y si se asumiera cero el neto
//      teórico saldría bajo para toda la nómina sin que nada avise. Sin este
//      dato el control no corre — es el único campo que bloquea.
//
//   2. **El tope de la base imponible.** Willy pidió que se muestre siempre y
//      que se pueda cambiar y volver a ejecutar (2026-08-19). El panel propone el
//      tope que el propio archivo delata —al empleado que lo superó le
//      retuvieron sobre una base menor que sus haberes— pero no lo aplica solo:
//      el número oficial lo pone el analista.
//
//   3. **Las alícuotas de retención.** Son el RESPALDO: el control usa las que
//      el Tabulado declara para cada empleado (Willy, 2026-08-20), y estas
//      valen sólo para el archivo que no traiga esas columnas. Se muestran
//      igual porque son exactamente lo que el control existe para detectar: una
//      alícuota mal puesta llega a un bruto y a un neto equivocados sin que
//      nadie lo vea.
//
//   4. **El convenio del acuerdo.** Los adicionales y el descuento sindical son
//      del convenio que firmó la paritaria: al de fuera de convenio se lo sigue
//      controlando, pero con su sueldo y sus propios aportes.

import { DEFAULT_NETOS_CONFIG } from '../controls/controlNetos.js';
import { toNum } from '../utils/currency.js';

const TASA_LABELS = {
  jubilacion:       'Jubilación',
  ley19032:         'Ley 19.032',
  obraSocial:       'Obra social',
  anssal:           'ANSSAL',
  sindicato:        'Sindicato',
  faecys:           'FAECYS',
  obraSocialNoRemu: 'Obra social sobre lo no remunerativo',
  // La retención del afiliado no se edita acá: su alícuota la declara el
  // Tabulado por empleado (678-AFILIADO_PORC), que es además el único lugar
  // donde dice quién está afiliado.
};

/**
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {object}   [opts.config]         valor guardado del cliente
 * @param {boolean}  [opts.openByDefault]
 * @param {function} [opts.onChange]       recibe la config nueva completa
 * @param {object[]} [opts.tabRows]        filas del Tabulado, para sugerir el tope
 * @param {object[]} [opts.tab2Rows]       filas del Tabulado de la segunda empresa, si se cargó
 * @param {object[]} [opts.tab3Rows]       filas del Tabulado de la tercera empresa, si se cargó
 */
export function renderControlNetosConfigEditor(container, opts = {}) {
  const {
    config = {},
    openByDefault = false,
    onChange = () => {},
    tabRows = [],
    tab2Rows = [],
    tab3Rows = [],
  } = opts;

  const base = DEFAULT_NETOS_CONFIG();
  const current = {
    ...base,
    ...config,
    tasas:         { ...base.tasas,         ...(config.tasas         || {}) },
    codigos:       { ...base.codigos,       ...(config.codigos       || {}) },
    empresaLabels: { ...base.empresaLabels, ...(config.empresaLabels || {}) },
  };

  const empresaSlots = [
    { key: 'tab',  label: 'Tabulado principal',  rows: tabRows },
    { key: 'tab2', label: 'Segunda empresa',     rows: tab2Rows },
    { key: 'tab3', label: 'Tercera empresa',     rows: tab3Rows },
  ].filter(s => s.rows.length > 0);

  const sugerido = sugerirTope(tabRows, current);

  const editor = document.createElement('details');
  if (openByDefault || current.noRemuAcuerdo === null) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Datos del mes y alícuotas de retención
    </summary>

    <div style="margin-top:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:flex-start;">
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Acuerdo no remunerativo del mes</span>
        <input type="text" class="form-input form-input--sm" style="max-width:160px;"
               data-netos-nr inputmode="decimal" autocomplete="off"
               value="${esc(current.noRemuAcuerdo ?? '')}" placeholder="ej. 120000">
      </label>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:52ch;margin:var(--sp-4) 0 0;">
        La suma de los conceptos de paritaria que cobran todos, antes de antigüedad y presentismo.
        <strong>Sin este dato el control no corre</strong>: asumirlo en cero daría un neto teórico bajo
        para toda la nómina.
      </p>
    </div>

    <div style="margin-top:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:flex-start;">
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Convenio del acuerdo</span>
        <input type="text" class="form-input form-input--sm" style="max-width:160px;"
               data-netos-convenio autocomplete="off"
               value="${esc(current.convenio ?? '')}" placeholder="ej. Comercio">
      </label>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:52ch;margin:var(--sp-4) 0 0;">
        Se compara contra la columna CONVENIO del Tabulado. Al empleado que no es de este convenio
        el control le arma el recibo con su sueldo y sus propios aportes: <strong>sin el acuerdo, sin
        antigüedad ni presentismo y sin descuento sindical</strong>. Igual se lo controla y aparece en
        la lista.
      </p>
    </div>

    <div style="margin-top:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:flex-start;">
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Puestos sin aportes</span>
        <input type="text" class="form-input form-input--sm" style="max-width:200px;"
               data-netos-puestos autocomplete="off"
               value="${esc((current.puestosSinAportes || []).join(', '))}" placeholder="ej. Director">
      </label>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:52ch;margin:var(--sp-4) 0 0;">
        Separados por coma, se comparan contra la columna PUESTO. A estos empleados no se les
        descuenta jubilación, ley 19.032, obra social ni ANSSAL: el director no está en relación de
        dependencia y la liquidación no le retiene nada, pero el Tabulado igual le declara las
        alícuotas. Lo gremial, si el archivo declara alguna cuota, se le sigue calculando.
      </p>
    </div>

    <div style="margin-top:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:flex-start;">
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Tope de la base de aportes</span>
        <input type="text" class="form-input form-input--sm" style="max-width:160px;"
               data-netos-tope inputmode="decimal" autocomplete="off"
               value="${esc(current.topeBaseImponible ?? '')}" placeholder="sin tope">
      </label>
      <div data-netos-tope-hint style="flex:1 1 280px;min-width:260px;margin-top:var(--sp-4);"></div>
    </div>

    <div style="margin-top:var(--sp-3);display:flex;flex-wrap:wrap;gap:var(--sp-4);align-items:flex-start;">
      <label style="display:block;">
        <span class="form-label" style="font-size:var(--text-sm);">Tolerancia por legajo, en pesos ($)</span>
        <input type="text" class="form-input form-input--sm" style="max-width:120px;"
               data-netos-tol inputmode="decimal" autocomplete="off"
               value="${esc(current.tolerancia ?? 1)}">
      </label>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:52ch;margin:var(--sp-4) 0 0;">
        Cuánto puede quedar sin explicar, <strong>en pesos</strong>, antes de marcar el legajo. Meta4
        redondea cada concepto a dos decimales, así que unos centavos de diferencia son redondeo y no
        un error.
      </p>
    </div>

    ${empresaSlots.length ? `
    <div style="margin-top:var(--sp-3);">
      <span class="form-label" style="font-size:var(--text-sm);">Nombre de cada empresa</span>
      <p class="text-muted" style="font-size:var(--text-sm);margin:2px 0 var(--sp-2);">
        Ninguno de los Tabulados trae de qué empresa es — sin esto, el detalle del resultado
        va a mostrar "Empresa 1", "Empresa 2", etc. en su lugar.
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:var(--sp-3);">
        ${empresaSlots.map(s => `
          <label style="display:block;">
            <span class="text-muted" style="font-size:var(--text-sm);">${esc(s.label)}</span>
            <input type="text" class="form-input form-input--sm" style="max-width:140px;"
                   data-netos-empresa="${esc(s.key)}" autocomplete="off"
                   placeholder="ej. IFSA" value="${esc(current.empresaLabels[s.key] || '')}">
          </label>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <details style="margin-top:var(--sp-3);">
      <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--color-primary);">
        ▸ Alícuotas de retención (%)
      </summary>
      <div data-netos-tasas style="margin-top:var(--sp-2);display:flex;flex-wrap:wrap;gap:var(--sp-3);"></div>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:60ch;margin-top:var(--sp-2);">
        <strong>Son el respaldo</strong>: cuando el Tabulado trae la columna de porcentaje de un
        aporte —y los de Sportline la traen— el control usa la del propio empleado, que es la que
        sabe quién aporta el 1% de AMECYS, quién el del CEC y quién no tiene obra social. Estos
        valores se usan sólo para el archivo que no traiga esas columnas.
      </p>
      <p class="text-muted" style="font-size:var(--text-sm);max-width:60ch;margin-top:var(--sp-2);">
        La obra social que además cobra sobre lo no remunerativo es la
        <strong>${esc(current.obraSocialConAporteNoRemu)}</strong>; al resto no se le aplica ese
        porcentaje.
      </p>
    </details>
  `;

  const nrEl      = editor.querySelector('[data-netos-nr]');
  const topeEl    = editor.querySelector('[data-netos-tope]');
  const tolEl     = editor.querySelector('[data-netos-tol]');
  const convEl    = editor.querySelector('[data-netos-convenio]');
  const puestosEl = editor.querySelector('[data-netos-puestos]');
  const hintEl    = editor.querySelector('[data-netos-tope-hint]');
  const tasasEl   = editor.querySelector('[data-netos-tasas]');
  const empresaEls = editor.querySelectorAll('[data-netos-empresa]');

  tasasEl.innerHTML = Object.keys(TASA_LABELS).map(k => `
    <label style="display:block;">
      <span class="form-label" style="font-size:var(--text-sm);">${esc(TASA_LABELS[k])}</span>
      <input type="text" class="form-input form-input--sm" style="max-width:90px;"
             data-netos-tasa="${esc(k)}" inputmode="decimal" autocomplete="off"
             value="${esc(current.tasas[k])}">
    </label>
  `).join('');

  function pintarHint() {
    const declarado = num(topeEl.value);
    if (sugerido === null) {
      hintEl.innerHTML = linea('Ningún legajo llegó al tope en este archivo, así que este mes no afecta el resultado.', 'muted');
      return;
    }
    if (declarado === null) {
      hintEl.innerHTML = linea(
        `La liquidación aplicó un tope de ${fmt(sugerido)}. Cargalo acá para que el control lo use.`, 'warn');
      return;
    }
    hintEl.innerHTML = Math.abs(declarado - sugerido) <= 1
      ? linea(`Coincide con el tope que aplicó la liquidación (${fmt(sugerido)}).`, 'ok')
      : linea(`Ojo: la liquidación aplicó ${fmt(sugerido)} y acá está cargado ${fmt(declarado)}.`, 'warn');
  }

  const emitir = () => {
    current.noRemuAcuerdo     = num(nrEl.value);
    current.topeBaseImponible = num(topeEl.value);
    current.tolerancia        = num(tolEl.value) ?? 1;
    current.convenio          = convEl.value.trim();
    current.puestosSinAportes = puestosEl.value.split(',').map(v => v.trim()).filter(Boolean);
    for (const el of tasasEl.querySelectorAll('[data-netos-tasa]')) {
      current.tasas[el.dataset.netosTasa] = num(el.value) ?? 0;
    }
    for (const el of empresaEls) {
      current.empresaLabels[el.dataset.netosEmpresa] = el.value.trim();
    }
    pintarHint();
    onChange({
      ...current,
      tasas: { ...current.tasas }, codigos: { ...current.codigos },
      empresaLabels: { ...current.empresaLabels },
    });
  };

  for (const el of [nrEl, topeEl, tolEl, convEl, puestosEl]) el.addEventListener('input', emitir);
  tasasEl.addEventListener('input', emitir);
  for (const el of empresaEls) el.addEventListener('input', emitir);

  pintarHint();
  container.appendChild(editor);
}

/**
 * El tope que delata el propio Tabulado: si a alguien le retuvieron jubilación
 * sobre una base menor que sus haberes remunerativos, esa base es el techo.
 *
 * Se calcula acá y no en el control porque es una ayuda de pantalla —el control
 * lo recalcula por su cuenta sobre lo que efectivamente corrió—, y porque el
 * panel tiene que poder mostrarlo antes de ejecutar.
 */
function sugerirTope(tabRows, cfg) {
  if (!Array.isArray(tabRows) || tabRows.length === 0) return null;

  const colByCode = {};
  for (const col of Object.keys(tabRows[0])) {
    const m = String(col).trim().match(/^(\d+)[-_]/);
    if (m && !colByCode[m[1]]) colByCode[m[1]] = col;
  }

  const tasaJub = (cfg.tasas.jubilacion ?? 0) / 100;
  if (!tasaJub) return null;

  const jubCol = colByCode[(cfg.codigos.apJubilacion || [])[0]];
  if (!jubCol) return null;

  // Los haberes remunerativos de la fila, con los mismos códigos que usa el
  // control. No hace falta que sea exacto: alcanza con detectar que la base
  // sobre la que se retuvo quedó por debajo.
  const remuCodes = [
    ...(cfg.codigos.sueldo || []), ...(cfg.codigos.aCuentaFutAumen || []),
    ...(cfg.codigos.antiguedad || []), ...(cfg.codigos.presentismo || []),
    ...(cfg.codigos.remuOtros || []),
  ];

  let tope = null;
  for (const row of tabRows) {
    const jub = toNum(row[jubCol]);
    if (jub === null || jub === 0) continue;
    const baseRetenida = jub / tasaJub;
    const remu = remuCodes.reduce((a, c) => {
      const col = colByCode[c];
      return a + (col ? (toNum(row[col]) ?? 0) : 0);
    }, 0);
    if (baseRetenida >= remu - 1) continue;
    if (tope === null || baseRetenida > tope) tope = baseRetenida;
  }
  return tope === null ? null : Math.round(tope * 100) / 100;
}

/**
 * Lee un número del formulario. `''` es "no declarado" (`null`), no cero.
 *
 * Usa el `toNum()` del repo y no un parser propio: el analista puede escribir
 * `4.303.618,99` (es-AR) o `4303618.99`, y `toNum` distingue los dos casos. Un
 * `replace(/\./g, '')` a mano toma el punto decimal por separador de miles y
 * convierte el segundo en 430.361.899 — un tope cien veces más alto, que además
 * no rompe nada visible: el control corre igual y nadie topea nunca.
 */
function num(value) {
  return toNum(value);
}

function fmt(v) {
  return Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function linea(texto, tono) {
  const color = tono === 'warn' ? 'var(--color-danger)'
    : tono === 'ok' ? 'var(--color-success)' : 'var(--color-text-muted)';
  const icono = tono === 'warn' ? '⚠' : tono === 'ok' ? '✓' : '·';
  return `
    <div style="font-size:var(--text-sm);display:flex;gap:var(--sp-2);align-items:baseline;">
      <span style="color:${color};" aria-hidden="true">${icono}</span>
      <span style="color:${color};">${esc(texto)}</span>
    </div>
  `;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
