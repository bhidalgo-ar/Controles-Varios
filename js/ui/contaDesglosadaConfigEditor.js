// contaDesglosadaConfigEditor.js — Panel del Paso 2 de Contabilidad Desglosada
//
// Cinco cosas que son del cliente y no del control, así que se editan acá y no se
// cambian con un commit (D-035):
//   · **la cuenta del neto**: cuál de las cuentas contables no se lista línea por
//     línea sino que se netea por empleado ("Sueldos a pagar" en COTY);
//   · **el concepto de esa línea de neto**: su número y su nombre, que no existen
//     en la liquidación — los inventa el asiento (9000 / "Neto a pagar");
//   · **cómo se escribe el legajo** en el archivo: con los ceros de relleno tal
//     como los trae Axton, o sin ellos ('007' → '7'), que es como lo pidió
//     Contaduría del cliente (D-095);
//   · **las equivalencias de número de concepto Axton → Meta4**, para la columna
//     "Nro Meta4" que pidió Contaduría (la semilla son los 96 pares del reporte
//     del cliente, ver `js/controls/meta4Codes.js`);
//   · **las excepciones nombre de cuenta → código**, para lo que el reporte de
//     cuentas del cliente no resuelve.
//
// La tabla de excepciones arranca **vacía** y eso es deliberado: una cuenta sin
// código sale listada en los resultados, que es lo que hace que alguien la
// resuelva. Un código puesto por analogía sale igual de "bien" y nadie lo mira.
//
// Vive en js/ui/ y no en el módulo del control porque es pantalla, no cálculo
// (mismo criterio que rendVsAsientoConfigEditor.js y grouperEditor.js).

import { DEFAULT_CONTA_DESGLOSADA_CONFIG } from '../controls/contaDesglosada.js';

// Centro de costo de una excepción que vale para cualquier centro. Se escribe
// así en el editor y viaja como `null`.
const CENTRO_CUALQUIERA = '*';

export function renderContaDesglosadaConfigEditor(container, opts = {}) {
  const { config = null, openByDefault = false, onChange = () => {} } = opts;
  const current = {
    cuentaNeto:      config?.cuentaNeto      ?? DEFAULT_CONTA_DESGLOSADA_CONFIG.cuentaNeto,
    nroConceptoNeto: config?.nroConceptoNeto ?? DEFAULT_CONTA_DESGLOSADA_CONFIG.nroConceptoNeto,
    conceptoNeto:    config?.conceptoNeto    ?? DEFAULT_CONTA_DESGLOSADA_CONFIG.conceptoNeto,
    excepciones:     Array.isArray(config?.excepciones) ? config.excepciones.map(e => ({ ...e })) : [],
    legajoSinCeros:  config?.legajoSinCeros ?? DEFAULT_CONTA_DESGLOSADA_CONFIG.legajoSinCeros,
    // Igual que en el control: una tabla vacía es una decisión guardada, una
    // config vieja que no la tiene cae a la semilla (D-095).
    equivalenciasMeta4: Array.isArray(config?.equivalenciasMeta4)
      ? config.equivalenciasMeta4.map(e => ({ ...e }))
      : DEFAULT_CONTA_DESGLOSADA_CONFIG.equivalenciasMeta4.map(e => ({ ...e })),
  };

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Contabilidad Desglosada · neto, legajo, números de Meta4 y excepciones de código
    </summary>

    <div style="margin-top:var(--sp-3);display:flex;gap:var(--sp-4);flex-wrap:wrap;align-items:flex-end;">
      <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
        Cuenta del neto a pagar
        <input type="text" class="form-input" data-cd-cuenta-neto
          value="${esc(current.cuentaNeto)}" style="padding:4px 8px;min-width:220px;">
      </label>
      <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
        Nro del concepto de neto
        <input type="text" class="form-input" data-cd-nro-neto
          value="${esc(current.nroConceptoNeto)}" style="padding:4px 8px;max-width:120px;">
      </label>
      <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
        Nombre de ese concepto
        <input type="text" class="form-input" data-cd-concepto-neto
          value="${esc(current.conceptoNeto)}" style="padding:4px 8px;min-width:180px;">
      </label>
    </div>
    <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-2) 0 0;max-width:640px;">
      Los conceptos que van a esa cuenta no se listan uno por uno: se suman por empleado —respetando el
      signo y sumando todas sus liquidaciones del mes— y salen en una sola línea, con ese número y ese
      nombre. Tiene que estar escrita igual que en el reporte de Axton.
    </p>

    <div style="margin-top:var(--sp-4);">
      <label style="display:flex;gap:var(--sp-2);align-items:flex-start;font-size:var(--text-sm);cursor:pointer;">
        <input type="checkbox" data-cd-legajo-sin-ceros ${current.legajoSinCeros ? 'checked' : ''}
          style="margin-top:3px;">
        <span>
          Escribir el legajo <strong>sin los ceros de la izquierda</strong> («007» sale como «7»)
          <span class="text-muted" style="display:block;">
            Es cómo lo pidió Contaduría del cliente. Cambia sólo cómo se escribe en el archivo: quién es
            el mismo empleado lo sigue decidiendo la clave de legajo del cliente. Un legajo con letras o
            guiones («12-B») sale tal cual.
          </span>
        </span>
      </label>
    </div>

    <div style="margin-top:var(--sp-4);">
      <label class="form-label" style="font-size:var(--text-sm);">
        Números de concepto de Meta4 — uno por línea: <code>código de Axton ⇥ código de Meta4</code>
      </label>
      <textarea class="form-input" data-cd-meta4 rows="6"
        style="width:100%;font-family:var(--font-mono, monospace);font-size:var(--text-sm);"
        placeholder="1000&#9;1003"></textarea>
      <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-1) 0 0;" data-cd-meta4-info></p>
      <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-1) 0 0;max-width:640px;">
        Es la columna "Nro Meta4" del archivo: con qué número salía cada concepto del sistema anterior
        del cliente. Un concepto que no esté en la lista sale con la celda vacía y se avisa en los
        resultados — el número no se deduce por parecido.
      </p>
    </div>

    <div style="margin-top:var(--sp-4);">
      <label class="form-label" style="font-size:var(--text-sm);">
        Excepciones de código — una por línea: <code>nombre de cuenta ⇥ centro de costo ⇥ código</code>
      </label>
      <textarea class="form-input" data-cd-excepciones rows="5"
        style="width:100%;font-family:var(--font-mono, monospace);font-size:var(--text-sm);"
        placeholder="SAC&#9;60&#9;710100143"></textarea>
      <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-1) 0 0;" data-cd-excepciones-info></p>
    </div>

    <p class="text-muted" style="font-size:var(--text-sm);margin-top:var(--sp-3);max-width:640px;">
      Normalmente no hace falta ninguna: el código de cada cuenta sale del "Reporte de Cuentas de
      Redefinición" del cliente. Usá una excepción sólo cuando ese archivo no la resuelva y el cliente
      te confirme el código. Poné <code>${esc(CENTRO_CUALQUIERA)}</code> en el centro de costo para que
      valga para todos. Lo que quede sin resolver sale listado en los resultados —no se completa solo—.
      <button type="button" class="btn btn--ghost btn--sm" data-cd-reset style="margin-left:var(--sp-2);">
        ↺ Volver a los valores originales
      </button>
    </p>
  `;

  const cuentaEl    = editor.querySelector('[data-cd-cuenta-neto]');
  const nroEl       = editor.querySelector('[data-cd-nro-neto]');
  const conceptoEl  = editor.querySelector('[data-cd-concepto-neto]');
  const excEl       = editor.querySelector('[data-cd-excepciones]');
  const excInfoEl   = editor.querySelector('[data-cd-excepciones-info]');
  const cerosEl     = editor.querySelector('[data-cd-legajo-sin-ceros]');
  const meta4El     = editor.querySelector('[data-cd-meta4]');
  const meta4InfoEl = editor.querySelector('[data-cd-meta4-info]');

  const pintar = () => {
    cuentaEl.value   = current.cuentaNeto;
    nroEl.value      = current.nroConceptoNeto;
    conceptoEl.value = current.conceptoNeto;
    excEl.value      = excepcionesATexto(current.excepciones);
    cerosEl.checked  = !!current.legajoSinCeros;
    meta4El.value    = equivalenciasATexto(current.equivalenciasMeta4);
  };
  pintar();

  const emitir = () => onChange({
    cuentaNeto:      current.cuentaNeto,
    nroConceptoNeto: current.nroConceptoNeto,
    conceptoNeto:    current.conceptoNeto,
    excepciones:     current.excepciones.map(e => ({ ...e })),
    legajoSinCeros:  !!current.legajoSinCeros,
    equivalenciasMeta4: current.equivalenciasMeta4.map(e => ({ ...e })),
  });

  // `avisar: false` al montar: pintar el contador no es una edición del analista.
  // Si emitiera, la semilla quedaría guardada como config del cliente con sólo
  // abrir el Paso 2, y "sin configurar" dejaría de distinguirse de "configurado
  // igual a la semilla" (mismo criterio que el editor del asiento de FINADIET).
  const releerExcepciones = ({ avisar = true } = {}) => {
    const { excepciones, errores } = textoAExcepciones(excEl.value);
    // Un error de formato no se completa con un default ni se ignora: se dice qué
    // línea está mal y la tabla anterior sigue en pie hasta que se arregle.
    if (errores.length > 0) {
      excInfoEl.innerHTML = `<span style="color:var(--color-danger);">Sin aplicar — ${esc(errores[0])}`
        + `${errores.length > 1 ? ` (y ${errores.length - 1} línea(s) más con problemas)` : ''}.</span>`;
      return;
    }
    current.excepciones = excepciones;
    excInfoEl.textContent = excepciones.length === 0
      ? 'Sin excepciones: todos los códigos salen del reporte de cuentas del cliente.'
      : `${excepciones.length} excepción(es) cargada(s).`;
    if (avisar) emitir();
  };

  // Mismo criterio que las excepciones: un error de formato NO se completa con un
  // default ni se ignora en silencio — se dice qué línea está mal y la tabla
  // anterior sigue en pie hasta que se arregle.
  const releerMeta4 = ({ avisar = true } = {}) => {
    const { equivalencias, errores } = textoAEquivalencias(meta4El.value);
    if (errores.length > 0) {
      meta4InfoEl.innerHTML = `<span style="color:var(--color-danger);">Sin aplicar — ${esc(errores[0])}`
        + `${errores.length > 1 ? ` (y ${errores.length - 1} línea(s) más con problemas)` : ''}.</span>`;
      return;
    }
    current.equivalenciasMeta4 = equivalencias;
    meta4InfoEl.textContent = equivalencias.length === 0
      ? 'Sin equivalencias: la columna "Nro Meta4" va a salir vacía en todas las líneas.'
      : `${equivalencias.length} concepto(s) con número de Meta4.`;
    if (avisar) emitir();
  };

  cuentaEl.addEventListener('change', () => { current.cuentaNeto = cuentaEl.value.trim(); emitir(); });
  nroEl.addEventListener('change', () => { current.nroConceptoNeto = nroEl.value.trim(); emitir(); });
  conceptoEl.addEventListener('change', () => { current.conceptoNeto = conceptoEl.value.trim(); emitir(); });
  excEl.addEventListener('change', () => releerExcepciones());
  cerosEl.addEventListener('change', () => { current.legajoSinCeros = cerosEl.checked; emitir(); });
  meta4El.addEventListener('change', () => releerMeta4());
  editor.querySelector('[data-cd-reset]').addEventListener('click', () => {
    current.cuentaNeto      = DEFAULT_CONTA_DESGLOSADA_CONFIG.cuentaNeto;
    current.nroConceptoNeto = DEFAULT_CONTA_DESGLOSADA_CONFIG.nroConceptoNeto;
    current.conceptoNeto    = DEFAULT_CONTA_DESGLOSADA_CONFIG.conceptoNeto;
    current.excepciones     = [];
    current.legajoSinCeros  = DEFAULT_CONTA_DESGLOSADA_CONFIG.legajoSinCeros;
    current.equivalenciasMeta4 =
      DEFAULT_CONTA_DESGLOSADA_CONFIG.equivalenciasMeta4.map(e => ({ ...e }));
    pintar();
    releerExcepciones();
    releerMeta4();
  });

  releerExcepciones({ avisar: false });
  releerMeta4({ avisar: false });

  container.appendChild(editor);
}

/** Tabla de excepciones → texto del editor (una por línea, separadas por tab). */
export function excepcionesATexto(excepciones) {
  return (excepciones || [])
    .map(e => [e.nombre, e.centroCosto === null || e.centroCosto === undefined ? CENTRO_CUALQUIERA : e.centroCosto, e.codigo].join('\t'))
    .join('\n');
}

/** Texto del editor → tabla de excepciones. Devuelve también qué líneas no se entienden. */
export function textoAExcepciones(texto) {
  const excepciones = [];
  const errores = [];

  String(texto || '').split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const partes = linea.split(/\t|;/).map(p => p.trim());
    const [nombre, centro, codigo] = partes;
    const nro = i + 1;

    if (partes.length < 3) {
      errores.push(`la línea ${nro} tiene ${partes.length} dato(s) y hacen falta 3 (nombre, centro de costo, código)`);
      return;
    }
    if (!nombre) { errores.push(`la línea ${nro} no tiene nombre de cuenta`); return; }
    if (!/^\d+$/.test(codigo || '')) {
      errores.push(`el código de la línea ${nro} ("${codigo || ''}") no es un número`);
      return;
    }
    excepciones.push({
      nombre,
      centroCosto: (!centro || centro === CENTRO_CUALQUIERA) ? null : centro,
      codigo,
    });
  });

  return { excepciones, errores };
}

/** Tabla de equivalencias → texto del editor (una por línea, separadas por tab). */
export function equivalenciasATexto(equivalencias) {
  return (equivalencias || []).map(e => [e.axton, e.meta4].join('\t')).join('\n');
}

/**
 * Texto del editor → tabla de equivalencias Axton → Meta4. Devuelve también qué
 * líneas no se entienden.
 *
 * El código de Meta4 **no se valida como número**: hay conceptos cuyo código
 * termina en letra ('1191X' es el presentismo). Lo que sí se valida es que sea
 * un código y no una frase — sin espacios adentro.
 */
export function textoAEquivalencias(texto) {
  const equivalencias = [];
  const errores = [];
  const vistos = new Set();

  String(texto || '').split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const partes = linea.split(/\t|;|,/).map(p => p.trim());
    const [axton, meta4] = partes;
    const nro = i + 1;

    if (partes.filter(Boolean).length < 2) {
      errores.push(`la línea ${nro} tiene 1 dato y hacen falta 2 (código de Axton, código de Meta4)`);
      return;
    }
    if (!/^[\w-]+$/.test(axton || '')) {
      errores.push(`el código de Axton de la línea ${nro} ("${axton || ''}") no parece un código`);
      return;
    }
    if (!/^[\w-]+$/.test(meta4 || '')) {
      errores.push(`el código de Meta4 de la línea ${nro} ("${meta4 || ''}") no parece un código`);
      return;
    }
    // El mismo código de Axton dos veces con destinos distintos no se resuelve
    // solo: se avisa, en vez de aplicar el último y que nadie se entere.
    const previo = vistos.has(axton);
    if (previo) {
      errores.push(`el código de Axton "${axton}" está dos veces (línea ${nro})`);
      return;
    }
    vistos.add(axton);
    equivalencias.push({ axton, meta4 });
  });

  return { equivalencias, errores };
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
