// fileUpload.js — Pantalla de carga de un archivo Excel con mapeo de columnas

import { isValidExcelFile, readFileAsArrayBuffer } from '../utils/validators.js';
import { showToast } from './toast.js';
import { mergeContaFiles } from '../parsers/contaExcel.js';
import { getFileProfile, saveFileProfile } from '../db.js';
import { blocksProgress, necessityOfKey, typeOfKey, NECESSITY, OMITIDO, esOmitido } from '../exports/contracts.js';
import { columnValuesFromMatrix, columnHintHtml } from './columnHints.js';
import {
  fieldsFor,
  fileTypeLabel,
  isFixedFormat,
  hasNameMapping,
  metaLineFor,
  detectHeadersFor,
  parseFor,
  flowFor,
  dropLabelFor,
  dropHintFor,
  siglasFor,
  nameMatchesSiglas,
} from './fileTypes.js';

// Qué pantalla de carga le toca a cada `flow` declarado en la ficha. Las dos
// siguen siendo funciones distintas porque hacen cosas distintas —CONTA mergea y
// avisa filas duplicadas, Acumuladores pide un período por archivo— pero ya no
// se eligen por nombre de archivo cableado. `'single'` no está acá: es el
// camino normal de `initFileUploadStep`, no una pantalla aparte.
//
// El mapa vive de este lado y no en la ficha a propósito: si `fileTypes.js`
// importara estas funciones, cerraría el ciclo `fileUpload → fileTypes →
// fileUpload`, que es la clase de cosa que sólo rompe en el navegador (D-045).
const MULTI_UPLOADS = {
  'multi':         initContaMultiUpload,
  'multi-periodo': initAcumuladoresMultiUpload,
};

/**
 * Inicializa el paso de carga de archivo dentro de un contenedor.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 *   clientCode   {string}         - code del cliente (para buscar/guardar perfil, T10)
 *   fileType     {string}         - Tipo de archivo
 *   existingData {object|null}    - Datos ya cargados en esta sesión (null = primera vez)
 *   onComplete   {function(data)} - Se llama cuando el archivo está parseado y listo
 *   required     {boolean}        - si es obligatorio para la corrida; sólo pinta el
 *                                   tag de la zona de drop (quién bloquea el avance
 *                                   lo sigue decidiendo `canGoNext` del wizard).
 *                                   Sin declarar, no se pinta ningún tag
 */
export async function initFileUploadStep(container, { clientCode, fileType, existingData, onComplete, autoDetect, required }) {
  // Cómo se sube este tipo lo declara su ficha, no un `if` por nombre de
  // archivo: un tipo multi-archivo nuevo declara su `flow` y funciona sin tocar
  // nada de acá. Un `flow` sin implementación corta con un error que lo nombra
  // en vez de caer al flujo de un archivo por slot, que es lo que un default
  // silencioso haría — y el analista subiría UN mes donde el control espera N.
  const flow = flowFor(fileType);
  if (flow !== 'single') {
    const initMultiUpload = MULTI_UPLOADS[flow];
    if (!initMultiUpload) {
      renderError(container,
        `El tipo de archivo "${fileTypeLabel(fileType)}" declara un flujo de carga que la app no sabe manejar ("${flow}").`,
        () => {});
      return;
    }
    initMultiUpload(container, { fileType, existingData, onComplete });
    return;
  }

  if (existingData) {
    renderAlreadyLoaded(container, existingData,
      () => initFileUploadStep(container, { clientCode, fileType, existingData: null, onComplete, autoDetect, required }),
      onComplete
    );
    return;
  }

  renderDropZone(container, fileType, async (file, { siglaMismatch = false } = {}) => {
    renderLoadingProgress(container, 'reading', 0, { fileName: file.name });

    let arrayBuffer;
    try {
      arrayBuffer = await readFileAsArrayBuffer(file, (pct) => {
        updateReadingProgress(container, pct);
      });
    } catch (err) {
      renderError(container, err.message,
        () => initFileUploadStep(container, { clientCode, fileType, existingData, onComplete, autoDetect, required }));
      return;
    }

    renderLoadingProgress(container, 'parsing', 0, { fileName: file.name });

    let headers, preview;
    try {
      ({ headers, preview } = detectHeadersFor(fileType, arrayBuffer));
    } catch (err) {
      renderError(container, `No se pudo leer el Excel: ${err.message}`,
        () => initFileUploadStep(container, { clientCode, fileType, existingData, onComplete, autoDetect, required }));
      return;
    }

    // Formatos fijos (sin mapping de columnas): lo declara la ficha del tipo.
    // Ojo: NO es lo mismo que "no tiene campos" — `acreditaciones_file` no tiene
    // ninguno y aun así pasa por la pantalla de confirmación (ver fileTypes.js).
    if (isFixedFormat(fileType)) {
      renderLoadingProgress(container, 'parsing', 0, { fileName: file.name });
      try {
        const result = parseFor(fileType, arrayBuffer, null);
        const data = { ...result, mapping: {}, fileName: file.name, fileType, siglaMismatch };
        renderAlreadyLoaded(
          container,
          data,
          () => initFileUploadStep(container, { clientCode, fileType, existingData: null, onComplete, autoDetect, required }),
          onComplete
        );
      } catch (err) {
        renderError(container, `Error al procesar: ${err.message}`,
          () => initFileUploadStep(container, { clientCode, fileType, existingData: null, onComplete, autoDetect, required }));
      }
      return;
    }

    const savedProfile = await getFileProfile(clientCode, fileType);
    let savedMapping  = savedProfile?.mapping || null;
    let autoDetected  = false;

    // Auto-detección: si no hay perfil guardado y se pasó una función de detección, intentar
    if (!savedMapping && autoDetect) {
      const detected = autoDetect(headers);
      if (detected) {
        savedMapping  = detected;
        autoDetected  = true;
      }
    }

    // La auto-detección nunca pisa un ⊘ del perfil guardado (misma regla que
    // `shouldAutoFillTabValue` en el wizard: la omisión es una decisión del
    // analista, no un artefacto de una carga anterior). Pero si ESTE archivo
    // trae una columna que matchea una clave declarada ausente —el cliente
    // pudo haber empezado a liquidar ese concepto—, se avisa junto al campo
    // para que el analista destilde el ⊘ si corresponde. Decisión de Willy,
    // 2026-08-13 (specs/obligatoria-gate-carga-archivo.md).
    let omitCandidates = null;
    if (savedMapping && autoDetect && Object.values(savedMapping).some(esOmitido)) {
      const detected = autoDetect(headers);
      if (detected) {
        omitCandidates = Object.fromEntries(
          Object.entries(savedMapping)
            .filter(([k, v]) => esOmitido(v) && detected[k])
            .map(([k]) => [k, detected[k]])
        );
      }
    }

    // El formulario se vuelve a mostrar a sí mismo cuando el parseo falla. Antes
    // la rama de error reimplementaba el handler un nivel más adentro, y la
    // copia perdía dos cosas: `autoDetected` (después de un error los campos que
    // decían "✓ auto" pasaban a "↺ sesión anterior", informando un perfil
    // guardado que no existe) y `autoDetect` (al cancelar y volver a subir el
    // mismo archivo había que mapear las columnas a mano).
    const showMappingForm = () => renderMappingForm(container, {
      headers, preview, fileType, savedMapping, autoDetected, omitCandidates,
      fileName: file.name,
      onConfirm: async (mapping) => {
        renderLoadingProgress(container, 'parsing', 0, { fileName: file.name });
        try {
          const result = parseFor(fileType, arrayBuffer, mapping);
          await saveFileProfile(clientCode, fileType, mapping);

          // `preview` viaja junto con `headers` para que el panel de remapeo
          // pueda mostrar la muestra de valores de cada columna sin volver a
          // parsear el workbook. Vive en memoria y no se persiste (igual que
          // `arrayBuffer`): son filas de un archivo con datos de empleados.
          // `siglaMismatch` viaja con los datos del archivo: el aviso no
          // desaparece al confirmar el mapeo — sigue visible en el casillero
          // cargado, que es donde el analista lo va a volver a ver antes de
          // ejecutar (D-036: avisa, no traba).
          const data = { ...result, mapping, fileName: file.name, fileType, headers, preview, arrayBuffer, clientCode, siglaMismatch };

          renderAlreadyLoaded(
            container,
            data,
            () => initFileUploadStep(container, { clientCode, fileType, existingData: null, onComplete, autoDetect, required }),
            onComplete
          );

        } catch (err) {
          renderError(container, `Error al procesar: ${err.message}`, showMappingForm);
        }
      },
      onCancel: () => initFileUploadStep(container, { clientCode, fileType, existingData, onComplete, autoDetect, required }),
    });

    showMappingForm();
  }, { required });
}

// ── Carga múltiple de Contabilidad Desglosada (CONTA) ─────────────────────────
//
// A diferencia del resto de los archivos (un archivo por slot), CONTA admite
// subir varios Excel del mismo formato en una sola corrida — típicamente porque
// se juntan varios meses en el mismo control. Cada archivo se parsea por
// separado y las filas se concatenan (mergeContaFiles); se avisa sin bloquear
// si dos archivos distintos comparten filas idénticas, señal de una carga
// duplicada por error.

function initContaMultiUpload(container, { fileType, existingData, onComplete }) {
  let entries = existingData?.entries ? [...existingData.entries] : [];

  const commit = (newEntries) => {
    entries = newEntries;
    if (entries.length === 0) {
      render(null);
      onComplete(null);
      return;
    }
    const merged = mergeContaFiles(entries);
    const data = {
      parsedRows:    merged.parsedRows,
      parseMetadata: merged.parseMetadata,
      mapping:       {},
      fileType,
      fileName: entries.length === 1
        ? entries[0].fileName
        : `${entries.length} archivos · ${merged.parsedRows.length} filas`,
      entries,
    };
    render(data);
    onComplete(data);
  };

  const addFiles = async (fileList) => {
    const files = [...fileList].filter(f => {
      if (!isValidExcelFile(f)) {
        showToast(`"${f.name}" no es un Excel (.xlsx). Se lo ignoró.`, 'warning');
        return false;
      }
      return true;
    });
    if (files.length === 0) return;

    renderLoadingProgress(container, 'parsing');
    const newEntries = [];
    for (const file of files) {
      try {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const { parsedRows, parseMetadata } = parseFor(fileType, arrayBuffer);
        newEntries.push({ fileName: file.name, parsedRows, parseMetadata });
      } catch (err) {
        showToast(`Error al procesar "${file.name}": ${err.message}`, 'danger');
      }
    }
    commit([...entries, ...newEntries]);
  };

  function render(data) {
    const dupWarningsHtml = (data?.parseMetadata?.duplicates || []).map(d => `
      <div class="alert alert--warning" style="margin-top:var(--sp-2);padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">
        ⚠ <strong>${escHtml(d.fileName)}</strong> tiene ${d.count} fila(s) idénticas a otro archivo ya cargado
        — revisá que no sea el mismo período subido dos veces.
      </div>
    `).join('');

    const entriesHtml = entries.map((e, i) => {
      const desc = e.parseMetadata?.descartadasSinCC ?? 0;
      return `
        <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-2) var(--sp-3);border:1px solid var(--color-match-exact);background:var(--color-match-exact-bg);border-radius:var(--radius-md);font-size:var(--text-sm);">
          <span style="color:var(--color-match-exact);font-weight:600;">✓</span>
          <strong style="flex-shrink:0;">${escHtml(e.fileName)}</strong>
          <span style="color:var(--color-text-muted);flex:1;">
            ${e.parseMetadata?.totalRows ?? e.parsedRows.length} filas con CC
            ${desc > 0 ? ` &nbsp;·&nbsp; <span class="badge badge--warning">${desc} sin CC descartadas</span>` : ''}
          </span>
          <button type="button" class="btn btn--ghost btn--sm" data-conta-remove="${i}" style="flex-shrink:0;">✕ Quitar</button>
        </div>
      `;
    }).join('');

    const totalHtml = entries.length > 1
      ? `<p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-1) 0 var(--sp-2);">Total combinado: ${data?.parseMetadata?.totalRows ?? 0} filas de ${entries.length} archivos.</p>`
      : '';

    container.innerHTML = `
      ${entries.length ? `<div style="display:flex;flex-direction:column;gap:var(--sp-2);margin-bottom:var(--sp-2);">${entriesHtml}</div>${totalHtml}${dupWarningsHtml}` : ''}
      <div class="file-drop" id="js-conta-drop">
        <div class="file-drop__icon">📂</div>
        <div class="file-drop__text">
          <strong>${escHtml(dropLabelFor(fileType))}</strong> — arrastrá uno o varios .xlsx${escHtml(dropHintFor(fileType))}, o hacé clic para elegir
          ${entries.length ? ' (se suman a los ya cargados)' : ''}
        </div>
        <input type="file" accept=".xlsx,.xls" multiple style="display:none" id="js-conta-file-input">
      </div>
    `;

    const dropZone  = container.querySelector('#js-conta-drop');
    const fileInput = container.querySelector('#js-conta-file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) addFiles(e.target.files);
      fileInput.value = '';
    });
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('file-drop--dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('file-drop--dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('file-drop--dragover');
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    container.querySelectorAll('[data-conta-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.contaRemove);
        commit(entries.filter((_, j) => j !== idx));
      });
    });
  }

  render(existingData);
  if (entries.length > 0) onComplete(existingData);
}

// ── Carga múltiple de Acumuladores (Axton) ────────────────────────────────────
//
// El control Acumuladores Ganancias necesita un crudo `repacumuladores` por
// cada mes de la ventana del SAC teórico (RG 4030: 2 meses · RG 4003: hasta 8).
// Mismo flujo que initContaMultiUpload (N archivos del mismo tipo, sin mapping),
// con una diferencia: cada archivo lleva un período propio ('YYYY-MM'), inferido
// de la fecha de generación en el nombre del archivo y editable a mano (la fecha
// de generación no siempre cae en el mes de los datos — ver
// specs/control-acumuladores-ganancias.md). Las filas se concatenan tageadas con
// `_period`/`_fileName`; acumuladoresGanancias.js las agrupa por período, no por
// archivo — no le importa cuántos crudos hubo, sólo qué período tiene cada fila.
function initAcumuladoresMultiUpload(container, { fileType, existingData, onComplete }) {
  let entries = existingData?.entries ? [...existingData.entries] : [];

  const commit = (newEntries) => {
    entries = newEntries;
    if (entries.length === 0) { render(null); onComplete(null); return; }
    const parsedRows = entries.flatMap(e =>
      e.parsedRows.map(r => ({ ...r, _period: e.period || null, _fileName: e.fileName }))
    );
    const data = {
      parsedRows,
      parseMetadata: { totalRows: parsedRows.length, files: entries.length },
      mapping:  {},
      fileType,
      fileName: entries.length === 1
        ? entries[0].fileName
        : `${entries.length} archivos · ${parsedRows.length} filas`,
      entries,
    };
    render(data);
    onComplete(data);
  };

  const addFiles = async (fileList) => {
    const files = [...fileList].filter(f => {
      if (!isValidExcelFile(f)) {
        showToast(`"${f.name}" no es un Excel (.xlsx). Se lo ignoró.`, 'warning');
        return false;
      }
      return true;
    });
    if (files.length === 0) return;

    renderLoadingProgress(container, 'parsing');
    const newEntries = [];
    for (const file of files) {
      try {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const { parsedRows, parseMetadata } = parseFor(fileType, arrayBuffer);
        newEntries.push({ fileName: file.name, period: inferPeriodFromFileName(file.name), parsedRows, parseMetadata });
      } catch (err) {
        showToast(`Error al procesar "${file.name}": ${err.message}`, 'danger');
      }
    }
    commit([...entries, ...newEntries]);
  };

  function render(data) {
    const entriesHtml = entries.map((e, i) => `
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:var(--sp-3);padding:var(--sp-2) var(--sp-3);border:1px solid ${e.period ? 'var(--color-match-exact)' : 'var(--color-warning)'};background:${e.period ? 'var(--color-match-exact-bg)' : 'var(--color-warning-bg)'};border-radius:var(--radius-md);font-size:var(--text-sm);">
        <span style="color:${e.period ? 'var(--color-match-exact)' : 'var(--color-warning)'};font-weight:600;">${e.period ? '✓' : '⚠'}</span>
        <strong style="flex-shrink:0;">${escHtml(e.fileName)}</strong>
        <span style="color:var(--color-text-muted);">${e.parseMetadata?.totalRows ?? e.parsedRows.length} filas</span>
        <label style="display:flex;align-items:center;gap:var(--sp-2);margin-left:auto;">
          Período
          <input type="month" class="form-input" style="width:auto;padding:2px 8px;" data-acum-period="${i}" value="${e.period || ''}">
        </label>
        <button type="button" class="btn btn--ghost btn--sm" data-acum-remove="${i}">✕ Quitar</button>
      </div>
    `).join('');

    const pendingCount = entries.filter(e => !e.period).length;
    const warningHtml = pendingCount > 0
      ? `<div class="alert alert--warning" style="margin-top:var(--sp-2);padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">
           ⚠ Asigná el período a ${pendingCount} archivo${pendingCount === 1 ? '' : 's'} antes de ejecutar.
         </div>`
      : '';

    container.innerHTML = `
      ${entries.length ? `<div style="display:flex;flex-direction:column;gap:var(--sp-2);margin-bottom:var(--sp-2);">${entriesHtml}</div>${warningHtml}` : ''}
      <div class="file-drop" id="js-acum-drop">
        <div class="file-drop__icon">📂</div>
        <div class="file-drop__text">
          <strong>${escHtml(dropLabelFor(fileType))}</strong> — arrastrá uno o varios .xlsx${escHtml(dropHintFor(fileType))}, o hacé clic para elegir
          ${entries.length ? ' (se suman a los ya cargados)' : ''}
        </div>
        <input type="file" accept=".xlsx,.xls" multiple style="display:none" id="js-acum-file-input">
      </div>
    `;

    const dropZone  = container.querySelector('#js-acum-drop');
    const fileInput = container.querySelector('#js-acum-file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) addFiles(e.target.files);
      fileInput.value = '';
    });
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('file-drop--dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('file-drop--dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('file-drop--dragover');
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    container.querySelectorAll('[data-acum-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.acumRemove);
        commit(entries.filter((_, j) => j !== idx));
      });
    });

    container.querySelectorAll('[data-acum-period]').forEach(input => {
      input.addEventListener('change', () => {
        const idx = Number(input.dataset.acumPeriod);
        commit(entries.map((e, j) => j === idx ? { ...e, period: input.value } : e));
      });
    });
  }

  render(existingData);
  if (entries.length > 0) onComplete(existingData);
}

// El nombre trae la fecha de GENERACIÓN del export, no necesariamente el mes de
// los datos ('repacumuladores.20260728.102501' → 2026-07-28) — se usa sólo como
// punto de partida; el analista lo corrige si no corresponde.
function inferPeriodFromFileName(name) {
  const m = String(name).match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return '';
  const [, y, mo] = m;
  const monthNum = Number(mo);
  if (monthNum < 1 || monthNum > 12) return '';
  return `${y}-${mo}`;
}

// ── Renders internos ──────────────────────────────────────────────────────────

// Un casillero de archivo pasa por cinco estados sin cambiar de tamaño ni de
// lugar (pantalla 4 del rediseño): vacío → arrastrando → procesando → aviso de
// sigla → cargado. Los cinco son la misma caja `.dropzone` con un modificador,
// para que la pantalla no salte mientras se cargan los archivos.

function renderDropZone(container, fileType, onFile, { required } = {}) {
  const label   = dropLabelFor(fileType);
  const hint    = dropHintFor(fileType);
  const tag     = required === true ? 'OBLIGATORIO' : required === false ? 'OPCIONAL' : '';
  const tagCls  = required === false ? ' dropzone__tag--optional' : '';
  const titulo  = `Arrastrá el ${label}${hint}`;

  container.innerHTML = `
    <div class="dropzone dropzone--empty" id="js-drop-zone" role="button" tabindex="0"
         aria-label="Cargar ${escHtml(label)}">
      <span class="dropzone__icon" aria-hidden="true">⬆</span>
      <div class="dropzone__body">
        <div class="dropzone__title" data-dz-title>${escHtml(titulo)}</div>
        <div class="dropzone__hint">o hacé clic para buscarlo — .xlsx</div>
      </div>
      <span class="dropzone__tag${tagCls}" data-dz-tag ${tag ? '' : 'hidden'}>${escHtml(tag)}</span>
      <input type="file" accept=".xlsx,.xls" style="display:none" id="js-file-input">
    </div>
  `;

  const dropZone  = container.querySelector('#js-drop-zone');
  const fileInput = container.querySelector('#js-file-input');
  const tituloEl  = dropZone.querySelector('[data-dz-title]');
  const tagEl     = dropZone.querySelector('[data-dz-tag]');

  // El texto cambia mientras el archivo está en el aire: "Soltá acá" es lo que
  // hay que hacer en ese momento, y "Arrastrá el X" ya no.
  const setDragging = (on) => {
    dropZone.classList.toggle('dropzone--dragover', on);
    tituloEl.textContent = on ? `Soltá acá — ${label}` : titulo;
    tagEl.textContent = on ? 'ARRASTRANDO' : tag;
    tagEl.classList.toggle('dropzone__tag--plain', on);
    tagEl.hidden = on ? false : !tag;
  };

  const tomar = (file) => { if (file) handleFile(file, onFile, container, fileType, { required }); };

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', (e) => tomar(e.target.files[0]));

  // Drop zone interno: stopPropagation para no duplicar con el handler del container
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragging(true);
  });
  dropZone.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    setDragging(false);
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    setDragging(false);
    tomar(e.dataTransfer.files[0]);
  });

  // Expandir el área de drop al contenedor completo (captura drops fuera del ícono)
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    setDragging(true);
  });
  container.addEventListener('dragleave', (e) => {
    if (!container.contains(e.relatedTarget)) setDragging(false);
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    setDragging(false);
    tomar(e.dataTransfer.files[0]);
  });
}

function handleFile(file, onFile, container, fileType, { required } = {}) {
  if (!isValidExcelFile(file)) {
    renderError(container,
      `"${file.name}" no es un Excel (.xlsx). Elegí un archivo Excel.`,
      () => renderDropZone(container, fileType, onFile, { required }));
    return;
  }

  // El nombre no trae la sigla del reporte: se avisa y se sigue igual si el
  // analista lo dice (D-036). Un archivo raro del cliente no puede dejarlo sin
  // salida, así que "Usarlo igual" es una acción de primer nivel, no un rincón.
  if (!nameMatchesSiglas(file.name, siglasFor(fileType))) {
    renderSiglaWarning(container, file, fileType, {
      onKeep:  () => onFile(file, { siglaMismatch: true }),
      onOther: () => renderDropZone(container, fileType, onFile, { required }),
    });
    return;
  }

  onFile(file, { siglaMismatch: false });
}

/**
 * "No parece un X" — el aviso de sigla, con sus dos salidas. **Nunca bloquea:**
 * las dos salidas dejan al analista donde quiere estar, y la de seguir adelante
 * deja marcado el archivo para que el aviso se siga viendo después.
 */
function renderSiglaWarning(container, file, fileType, { onKeep, onOther }) {
  container.innerHTML = `
    <div class="dropzone dropzone--warn" data-dz-sigla-warning>
      <span class="dropzone__icon" aria-hidden="true">⚠</span>
      <div class="dropzone__body">
        <div class="dropzone__title">
          No parece un ${escHtml(fileTypeLabel(fileType))} — el nombre no trae la sigla.
        </div>
        <div class="dropzone__file">${escHtml(file.name)}</div>
      </div>
      <div class="dropzone__actions">
        <button type="button" class="btn btn--secondary btn--sm" id="js-sigla-keep">Usarlo igual</button>
        <button type="button" class="btn btn--ghost btn--sm" id="js-sigla-other">Elegir otro</button>
      </div>
    </div>
  `;
  container.querySelector('#js-sigla-keep').addEventListener('click', onKeep);
  container.querySelector('#js-sigla-other').addEventListener('click', onOther);
}

/**
 * El casillero mientras se lee el archivo.
 * phase = 'reading'  → barra real con porcentaje
 * phase = 'parsing'  → barra indeterminada animada (el parser no reporta avance,
 *                      y una barra que sube sola sería progreso inventado)
 */
function renderLoadingProgress(container, phase, pct = 0, { fileName = '' } = {}) {
  const indet = phase === 'parsing';
  const label = indet
    ? `Procesando ${fileName || 'el archivo'}…`
    : `Leyendo ${fileName || 'el archivo'}… ${pct}%`;
  container.innerHTML = `
    <div class="dropzone dropzone--loading">
      <span class="spinner spinner--sm" aria-hidden="true"></span>
      <div class="dropzone__body">
        <div class="dropzone__title" id="js-progress-label">${escHtml(label)}</div>
        <div class="dropzone__progress">
          <div class="dropzone__progress-fill ${indet ? 'dropzone__progress-fill--indeterminate' : ''}"
               id="js-progress-fill"
               style="width:${indet ? '40' : pct}%"></div>
        </div>
      </div>
      <span class="dropzone__tag dropzone__tag--plain">PROCESANDO</span>
    </div>
  `;
  // El nombre del archivo que se está leyendo, para que `updateReadingProgress`
  // no tenga que recibirlo otra vez en cada tick del progreso.
  container.querySelector('#js-progress-label').dataset.dzFile = fileName;
}

/** Actualiza el label y el ancho de la barra sin re-renderizar todo el DOM */
function updateReadingProgress(container, pct) {
  const label = container.querySelector('#js-progress-label');
  const fill  = container.querySelector('#js-progress-fill');
  if (label) label.textContent = `Leyendo ${label.dataset.dzFile || 'el archivo'}… ${pct}%`;
  if (fill)  fill.style.width  = `${pct}%`;
}

function renderError(container, msg, onRetry) {
  container.innerHTML = `
    <div class="alert alert--danger" style="margin-bottom:var(--sp-4);">⚠️ ${escHtml(msg)}</div>
    <button class="btn btn--secondary" id="js-retry-btn">← Volver a intentar</button>
  `;
  container.querySelector('#js-retry-btn').addEventListener('click', onRetry);
}

// ── Omisión declarada (⊘) en la carga de archivo ─────────────────────────────
// El gate de OBLIGATORIA está activo en esta pantalla (D-041 punto 4,
// specs/obligatoria-gate-carga-archivo.md): un campo que algún contrato de
// export marca OBLIGATORIA bloquea el submit igual que un `required: true`, y
// la vía de escape es el toggle ⊘ — el analista declara que este archivo no
// trae esa columna, queda asentado en el perfil del cliente (viaja dentro de
// `mapping` como OMITIDO, ver contracts.js) y el concepto se computa como sin
// dato, no como cero. Mismo patrón visual que el panel "Columnas del Tabulado"
// del Paso 2 (renderTabExtraConfig, controlsWizard.js) a propósito; no se
// extrajo un componente compartido para no atar las dos superficies.

/**
 * ¿Este campo ofrece el toggle ⊘? Sólo OBLIGATORIA por contrato y sin
 * `required` legado: CLAVE no admite omisión (sin eso el parser ni puede leer
 * el archivo) y un `required: true` de la ficha sigue bloqueando duro, sin
 * salida — dársela le sacaría una obligación que ya existía (el contrato es
 * un piso, nunca un techo, D-045).
 */
export function puedeOmitirse(fileType, field) {
  return !field.required && necessityOfKey(fileType, field.key) === NECESSITY.OBLIGATORIA;
}

/**
 * Campos que impiden confirmar el mapeo: bloquean (por contrato o por flag
 * legado, ver blocksProgress) y no están resueltos. `OMITIDO` cuenta como
 * resuelto — sin esa salida, activar el bloqueo de OBLIGATORIA habría roto la
 * carga de cualquier NR al que le falte uno de los 18 conceptos, y ningún
 * cliente los tiene todos (D-041 punto 4).
 *
 * Pero sólo donde el campo la ofrece: un OMITIDO en un campo que no admite ⊘
 * (una CLAVE, un required legado — sólo puede venir de un perfil guardado
 * corrupto o editado a mano, la UI no lo escribe) NO cuenta como resuelto.
 * Si contara, el parser recibiría una "columna" que ninguna fila trae y
 * seguiría de largo con 0 filas — el default silencioso exacto que el gate
 * existe para cortar.
 */
export function pendingUploadRequirements(fileType, fields, mapping) {
  return fields.filter(f => {
    if (!blocksProgress(fileType, f.key, f.required)) return false;
    const val = mapping?.[f.key];
    if (esOmitido(val)) return !puedeOmitirse(fileType, f);
    return !val;
  });
}

/** Texto del toast de faltantes: nombra las columnas y ofrece el ⊘ sólo si
 * alguna de las que faltan lo admite (una CLAVE o un required legado no
 * tienen esa salida y ofrecerla mentiría). */
function faltantesToast(fileType, faltantes) {
  const labels    = faltantes.map(f => f.label).join(', ');
  const omisibles = faltantes.filter(f => puedeOmitirse(fileType, f)).length;
  const salida = omisibles === 0 ? ''
    : omisibles === 1 ? ' — o declarala ausente con ⊘'
    : ' — o declaralas ausentes con ⊘';
  return `Falta completar: ${labels}${salida}`;
}

// Los tramos del campo que cambian con el toggle — compartidos por el
// formulario de mapeo y el panel de remapeo para que los dos rendericen la
// omisión exactamente igual.
function omitBadgeHtml(omitido) {
  return `<span data-fu-omit-badge style="color:var(--color-text-muted);font-size:0.8em;${omitido ? '' : 'display:none;'}"> ⊘ declarada ausente</span>`;
}
function omitButtonHtml(key, omitido) {
  return `<button type="button" class="btn btn--sm ${omitido ? 'btn--primary' : 'btn--ghost'}"
    data-fu-omit="${escHtml(key)}" aria-pressed="${omitido}"
    title="Declarar que este archivo no trae esta columna">⊘</button>`;
}
function omitHintHtml(omitido) {
  return `<div data-fu-omit-hint class="text-muted" style="font-size:var(--text-xs);margin-top:2px;${omitido ? '' : 'display:none;'}">No se resuelve — se computa como sin dato, no como cero.</div>`;
}

/**
 * Cablea la muestra de valores: cuando el analista cambia de columna, la muestra
 * y el aviso se rehacen para la columna nueva. Sin esto quedan mostrando los
 * valores de la anterior, que es peor que no mostrar nada.
 *
 * Mismo cableado para las TRES superficies donde se elige una columna: el
 * formulario de mapeo, el panel de remapeo y el panel "Columnas del Tabulado"
 * del Paso 2 (que lo importa de acá, igual que ya importa
 * `matchLevel`/`matchBadge`). Cada una pasa su propio `hintFor`, porque los
 * valores salen de distinto lado — la vista previa del archivo que se está
 * subiendo, o las filas ya parseadas del Tabulado.
 *
 * El contrato del markup es el mismo en las tres: un contenedor
 * `data-fu-field-group="<clave>"` con un `<select>` y un `data-fu-col-hint`
 * adentro. Un grupo al que le falte cualquiera de los dos se saltea en vez de
 * explotar: el campo sigue funcionando, sólo se queda sin muestra.
 *
 * @param {HTMLElement} scope
 * @param {(key: string, col: string) => string} hintFor
 */
export function wireColumnHints(scope, hintFor) {
  scope.querySelectorAll('[data-fu-field-group]').forEach(group => {
    const key  = group.dataset.fuFieldGroup;
    const sel  = group.querySelector('select');
    const hint = group.querySelector('[data-fu-col-hint]');
    if (!sel || !hint) return;
    sel.addEventListener('change', () => { hint.innerHTML = hintFor(key, sel.value); });
  });
}

/**
 * Cablea los toggles ⊘ de un formulario ya renderizado. El estado vive en el
 * Set `omitted` (clave del campo declarada ausente) y el DOM se actualiza en
 * el lugar, en vez de re-renderizar el formulario entero como hace el panel
 * del Paso 2 — acá lo que el analista ya eligió en los otros selects (y el
 * modo de nombre) vive sólo en el DOM hasta el submit, y un re-render lo
 * perdería.
 */
function wireOmitToggles(scope, omitted) {
  scope.querySelectorAll('[data-fu-omit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key   = btn.dataset.fuOmit;
      const group = btn.closest('[data-fu-omit-group]');
      const on    = !omitted.has(key);
      if (on) omitted.add(key); else omitted.delete(key);

      const sel = group.querySelector('select');
      sel.disabled = on;
      sel.style.opacity = on ? '0.6' : '';
      if (on) sel.value = '';
      btn.classList.toggle('btn--primary', on);
      btn.classList.toggle('btn--ghost', !on);
      btn.setAttribute('aria-pressed', String(on));
      const show = (attr, visible) => {
        const el = group.querySelector(`[${attr}]`);
        if (el) el.style.display = visible ? '' : 'none';
      };
      show('data-fu-omit-badge', on);
      show('data-fu-match-badge', !on);
      show('data-fu-omit-hint', on);
      // Al declarar la columna ausente, el select queda vacío: la muestra de
      // valores de la columna que estaba elegida antes tiene que irse con ella,
      // o queda afirmando algo sobre una columna que ya no está seleccionada.
      const hint = group.querySelector('[data-fu-col-hint]');
      if (hint) hint.innerHTML = '';
    });
  });
}

function renderAlreadyLoaded(container, existingData, onReplace, onComplete) {
  const { fileName, parseMetadata, fileType, mapping, headers, preview, arrayBuffer, clientCode: dataClientCode } = existingData;
  const warns = parseMetadata?.warnings?.length
    ? `<span class="badge badge--warning" style="margin-left:var(--sp-2);">${parseMetadata.warnings.length} aviso(s)</span>` : '';

  // La declara la ficha del tipo (`meta` en fileTypes.js). Antes era una cadena
  // de 11 `||` acá: el tipo que no estaba en la lista caía al molde equivocado
  // sin que nada avisara.
  const metaLine = metaLineFor(fileType, parseMetadata);

  // Sección colapsada de mapeo de columnas (solo si el tipo tiene campos de mapping y se guardó
  // el arrayBuffer de esta sesión — permite ajustar el mapeo sin re-subir el archivo)
  const fields = fieldsFor(fileType);
  const canRemap = fields.length > 0 && headers?.length > 0 && arrayBuffer;
  // El option vacío dice qué hacer, no cómo se llama el estado en el que está
  // ("— Sin asignar —"). El value sigue siendo '': para el gate y para el
  // mapeo, "sin elegir" no cambió de significado.
  const placeholder = `Elegí la columna del ${fileTypeLabel(fileType)}…`;
  const opts = (selected = '') => ['', ...((headers) || [])]
    .map(h => `<option value="${escHtml(h)}" ${h === selected ? 'selected' : ''}>${escHtml(h) || escHtml(placeholder)}</option>`)
    .join('');

  // Omisiones declaradas (⊘) del mapeo confirmado — mismo Set y mismo cableado
  // que el formulario de mapeo inicial (ver la sección "Omisión declarada"
  // arriba). Sin esto, un OMITIDO persistido se dibujaría como select vacío y
  // "Aplicar cambios" lo pisaría en silencio.
  const omitted = canRemap
    ? new Set(fields.filter(f => esOmitido(mapping?.[f.key])).map(f => f.key))
    : new Set();

  // Igual que en el formulario de mapeo: la muestra sale de la vista previa que
  // viajó con los datos del archivo. Si no la hay (datos de otra sesión sin
  // `preview`), `columnValuesFromMatrix` devuelve vacío y no se dibuja nada — no
  // se inventa una muestra ni se vuelve a parsear el workbook en cada render.
  const hintFor = (key, col) => columnHintHtml(
    columnValuesFromMatrix(preview, headers, col),
    typeOfKey(fileType, key),
    { esc: escHtml },
  );

  const remapHtml = canRemap ? `
    <details style="margin-top:var(--sp-1);">
      <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--color-primary);list-style:none;display:flex;align-items:center;gap:var(--sp-2);user-select:none;padding:var(--sp-1) 0;">
        <span>▸</span> Ver / ajustar mapeo de columnas
      </summary>
      <div style="margin-top:var(--sp-2);padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--sp-2) var(--sp-3);margin-bottom:var(--sp-3);">
          ${fields.map(f => {
            const omitido = omitted.has(f.key);
            const val = omitido ? '' : (mapping?.[f.key] || '');
            // Sólo se marca el estado "sin asignar". Acá el mapeo ya está
            // confirmado, así que distinguir "✓ auto" de "↺ sesión anterior"
            // sería informar el origen del pre-completado del momento de la
            // carga — un dato ya viejo que puede mentir. Lo que sí sigue siendo
            // cierto es que la columna quedó vacía, y sin el aviso se ve igual
            // que una mapeada (mismo criterio que el panel "Columnas del
            // Tabulado" del Paso 2). Una omitida no está vacía: está resuelta.
            const level = (val || omitido) ? 'none' : 'warn';
            const style = matchSelectStyle(level);
            // El asterisco tiene que coincidir con lo que el gate de abajo
            // realmente exige — si no, un campo bloqueante sale sin marcar.
            const esBloqueante = blocksProgress(fileType, f.key, f.required);
            const puedeOmitir  = puedeOmitirse(fileType, f);
            const selectHtml = `
                <select class="form-select" data-fu-remap-key="${escHtml(f.key)}"${omitido ? ' disabled' : ''} style="font-size:var(--text-sm);${style}${omitido ? 'opacity:0.6;' : ''}">
                  ${opts(val)}
                </select>`;
            return `
              <div class="form-group" style="margin-bottom:0;" data-fu-field-group="${escHtml(f.key)}"${puedeOmitir ? ` data-fu-omit-group="${escHtml(f.key)}"` : ''}>
                <label class="form-label ${esBloqueante ? 'form-label--required' : ''}" style="font-size:var(--text-sm);">${escHtml(f.label)}${puedeOmitir
                  ? `<span data-fu-match-badge${omitido ? ' style="display:none;"' : ''}>${matchBadge(level)}</span>${omitBadgeHtml(omitido)}`
                  : matchBadge(level)}</label>
                ${puedeOmitir
                  ? `<div style="display:flex;gap:var(--sp-2);align-items:center;">${selectHtml}${omitButtonHtml(f.key, omitido)}</div>${omitHintHtml(omitido)}`
                  : selectHtml}
                <div data-fu-col-hint>${omitido ? '' : hintFor(f.key, val)}</div>
              </div>
            `;
          }).join('')}
        </div>
        <button type="button" class="btn btn--primary btn--sm" id="js-remap-apply">✓ Aplicar cambios</button>
      </div>
    </details>
  ` : '';

  container.innerHTML = `
    <div class="dropzone dropzone--loaded">
      <span class="dropzone__icon" aria-hidden="true">✓</span>
      <div class="dropzone__body">
        <div class="dropzone__title">${escHtml(fileTypeLabel(fileType))}</div>
        <div class="dropzone__meta">
          <span class="dropzone__file">${escHtml(fileName)}</span>
          <span>·</span>
          <span>${metaLine}</span>
          ${warns}
          ${existingData.siglaMismatch
            ? `<span class="dropzone__warnchip" title="El nombre del archivo no trae la sigla de este reporte. Lo estás usando igual.">sigla no coincide</span>`
            : ''}
        </div>
      </div>
      <button class="btn btn--ghost btn--sm" id="js-replace-btn">Cambiar</button>
    </div>
    ${remapHtml}
  `;
  // El archivo ya está confirmado — avisamos al wizard sin esperar click adicional
  onComplete(existingData);
  container.querySelector('#js-replace-btn').addEventListener('click', onReplace);

  if (canRemap) {
    wireOmitToggles(container, omitted);
    wireColumnHints(container, hintFor);
    container.querySelector('#js-remap-apply')?.addEventListener('click', async () => {
      const btn = container.querySelector('#js-remap-apply');
      btn.disabled = true;
      btn.textContent = 'Reprocesando…';
      const newMapping = {};
      container.querySelectorAll('[data-fu-remap-key]').forEach(sel => {
        const k = sel.dataset.fuRemapKey;
        if (omitted.has(k)) newMapping[k] = OMITIDO;
        else if (sel.value) newMapping[k] = sel.value;
      });

      // Mismo gate que el formulario de carga inicial (ver el submit de
      // renderMappingForm). Este panel no lo tenía: se podía vaciar una columna
      // obligatoria, reprocesar, y quedaba persistida en el perfil del cliente
      // para la próxima corrida. Los `throw` de los parsers tapaban sólo las
      // columnas identificatorias (legajo, empleado, CC, F. BAJA); seis campos
      // declarados `required: true` —puesto, ID/nombre de centro de costo,
      // departamento de Cat. Empleados, PRECIO de Rendimiento y COSTO TOTAL—
      // se podían dejar vacíos desde acá sin que nada avisara.
      const faltantes = pendingUploadRequirements(fileType, fields, newMapping);
      if (faltantes.length) {
        showToast(faltantesToast(fileType, faltantes), 'warning');
        btn.disabled = false;
        btn.textContent = '✓ Aplicar cambios';
        return;
      }

      try {
        const result = parseFor(fileType, arrayBuffer, newMapping);
        if (dataClientCode) await saveFileProfile(dataClientCode, fileType, newMapping).catch(() => {});
        const newData = { ...existingData, ...result, mapping: newMapping };
        // Re-render: el nuevo renderAlreadyLoaded llamará a onComplete con los datos actualizados
        renderAlreadyLoaded(container, newData, onReplace, onComplete);
      } catch (err) {
        showToast('Error al reprocesar: ' + err.message, 'danger');
        btn.disabled = false;
        btn.textContent = '✓ Aplicar cambios';
      }
    });
  }
}

function renderMappingForm(container, { headers, preview, fileType, savedMapping, autoDetected, omitCandidates, fileName, onConfirm, onCancel }) {
  const fields    = fieldsFor(fileType);
  const conNombre = hasNameMapping(fileType);

  // Omisiones declaradas (⊘): arranca de lo que traiga el perfil guardado —
  // sin esto, un OMITIDO persistido se perdería en silencio al reconfirmar
  // (el select no tiene option que matchee y cae a "— Seleccioná —"). Vive en
  // este Set mientras el formulario está abierto; al confirmar viaja dentro
  // de `mapping`.
  const omitted = new Set(fields.filter(f => esOmitido(savedMapping?.[f.key])).map(f => f.key));

  // Detectar el modo de nombre guardado previamente
  let savedNombreMode = 'junto'; // 'junto' = una columna, 'separado' = dos columnas
  if (savedMapping?.apellidoColumn || savedMapping?.nombreColumn) savedNombreMode = 'separado';
  if (savedMapping?.nombreApellidoColumn) savedNombreMode = 'junto';

  // Preview de las primeras filas
  const previewHtml = preview?.length ? `
    <details style="margin-bottom:var(--sp-3);">
      <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--color-primary);margin-bottom:var(--sp-2);">
        ▸ Vista previa del archivo (${preview.slice(0, 3).length} filas)
      </summary>
      <div style="overflow-x:auto;">
        <table class="data-table data-table--compact">
          <thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${(preview || []).slice(0, 3).map(row =>
              `<tr>${headers.map((_, i) => `<td>${escHtml(fmtPreviewCell(row[i]))}</td>`).join('')}</tr>`
            ).join('')}
          </tbody>
        </table>
      </div>
    </details>
  ` : '';

  // Construir opciones del selector de columnas
  const placeholder = `Elegí la columna del ${fileTypeLabel(fileType)}…`;
  const opts = (selected = '') => ['', ...headers]
    .map(h => `<option value="${escHtml(h)}" ${h === selected ? 'selected' : ''}>${escHtml(h) || escHtml(placeholder)}</option>`)
    .join('');

  // Muestra de valores reales de la columna elegida + aviso si su contenido no
  // se parece a lo que el contrato espera ahí. El archivo todavía no se parseó,
  // así que los valores salen de la vista previa (filas de array alineadas con
  // `headers`), no de `parsedRows`.
  const hintFor = (key, col) => columnHintHtml(
    columnValuesFromMatrix(preview, headers, col),
    typeOfKey(fileType, key),
    { esc: escHtml },
  );

  // Calidad del match pre-completado para un campo: usa las mismas
  // `matchLevel`/`matchSelectStyle`/`matchBadge` exportadas más abajo en este
  // módulo (antes eran una copia local que ya había divergido de la exportada
  // en los dos hex de "warn" — ver auditoría de escalabilidad, hallazgo #3).
  const hasSavedMapping = !!savedMapping;
  const fieldLevel = (val) => matchLevel(val, { autoDetected, hasSavedMapping });

  // Campos estándar en grid horizontal
  const stdFieldsHtml = fields.length === 0 ? '' : `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--sp-2) var(--sp-3);margin-bottom:var(--sp-3);">
      ${fields.map(f => {
        const omitido = omitted.has(f.key);
        const val   = omitido ? '' : (savedMapping?.[f.key] || '');
        const level = fieldLevel(val);
        const style = matchSelectStyle(level);
        const esBloqueante = blocksProgress(fileType, f.key, f.required);
        const puedeOmitir  = puedeOmitirse(fileType, f);
        const candidata    = omitido ? omitCandidates?.[f.key] : null;
        const selStyle     = `${style}${omitido ? 'opacity:0.6;' : ''}`;
        const selectHtml = `
            <select class="form-select" name="${f.key}"${omitido ? ' disabled' : ''}${selStyle ? ` style="${selStyle}"` : ''}>
              ${opts(val)}
            </select>`;
        return `
          <div class="form-group" style="margin-bottom:0;" data-fu-field-group="${escHtml(f.key)}"${puedeOmitir ? ` data-fu-omit-group="${escHtml(f.key)}"` : ''}>
            <label class="form-label ${esBloqueante ? 'form-label--required' : ''}">${f.label}${puedeOmitir
              ? `<span data-fu-match-badge${omitido ? ' style="display:none;"' : ''}>${matchBadge(level)}</span>${omitBadgeHtml(omitido)}`
              : matchBadge(level)}</label>
            ${puedeOmitir
              ? `<div style="display:flex;gap:var(--sp-2);align-items:center;">${selectHtml}${omitButtonHtml(f.key, omitido)}</div>${omitHintHtml(omitido)}`
              : selectHtml}
            ${candidata ? `<div class="text-muted" style="font-size:var(--text-xs);margin-top:2px;">🤖 Este archivo trae una columna candidata («${escHtml(candidata)}») — destildá el ⊘ si el cliente empezó a liquidarla.</div>` : ''}
            <div data-fu-col-hint>${omitido ? '' : hintFor(f.key, val)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Sección especial de nombre (solo para formatos tabulados)
  const valNAC = savedMapping?.nombreApellidoColumn || '';
  const valAp  = savedMapping?.apellidoColumn || '';
  const valNm  = savedMapping?.nombreColumn || '';
  const lvlNAC = fieldLevel(valNAC);
  const lvlAp  = fieldLevel(valAp);
  const lvlNm  = fieldLevel(valNm);

  const nombreHtml = conNombre ? `
    <div class="form-group" style="margin-top:var(--sp-2);">
      <label class="form-label">Apellido y nombre del empleado</label>
      <p class="form-hint" style="margin-bottom:var(--sp-3);">
        ¿Cómo aparecen en el archivo?
      </p>
      <div style="display:flex;flex-direction:column;gap:var(--sp-2);margin-bottom:var(--sp-4);">
        <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;">
          <input type="radio" name="nombre_mode" value="junto"
            ${savedNombreMode === 'junto' ? 'checked' : ''}>
          <span>En <strong>una sola columna</strong> (ej: "García Juan" o "GARCIA, JUAN")</span>
        </label>
        <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;">
          <input type="radio" name="nombre_mode" value="separado"
            ${savedNombreMode === 'separado' ? 'checked' : ''}>
          <span>En <strong>columnas separadas</strong> (una para apellido, otra para nombre)</span>
        </label>
        <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;">
          <input type="radio" name="nombre_mode" value="ninguno">
          <span>No hay columna de nombre en este archivo</span>
        </label>
      </div>

      <!-- Modo: una sola columna -->
      <div id="js-nombre-junto" style="display:${savedNombreMode === 'junto' ? 'block' : 'none'};">
        <label class="form-label">Columna con el nombre completo${matchBadge(lvlNAC)}</label>
        <select class="form-select" name="nombreApellidoColumn" style="max-width:360px;${matchSelectStyle(lvlNAC)}">
          ${opts(valNAC)}
        </select>
      </div>

      <!-- Modo: columnas separadas -->
      <div id="js-nombre-separado" style="display:${savedNombreMode === 'separado' ? 'block' : 'none'};">
        <div class="form-group">
          <label class="form-label">Columna de Apellido${matchBadge(lvlAp)}</label>
          <select class="form-select" name="apellidoColumn" style="max-width:360px;${matchSelectStyle(lvlAp)}">
            ${opts(valAp)}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Columna de Nombre${matchBadge(lvlNm)}</label>
          <select class="form-select" name="nombreColumn" style="max-width:360px;${matchSelectStyle(lvlNm)}">
            ${opts(valNm)}
          </select>
        </div>
      </div>
    </div>
  ` : '';

  const hasSaved = savedMapping && Object.keys(savedMapping).length > 0;
  const savedMsg = autoDetected
    ? '🤖 Se detectaron las columnas automáticamente — verificá que sean correctas.'
    : '💾 Se pre-completó con el perfil guardado — verificá que siga siendo correcto.';

  container.innerHTML = `
    <div class="alert alert--info" style="margin-bottom:var(--sp-2);padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm);">
      📄 <strong>${escHtml(fileName)}</strong> — ${headers.length} columnas detectadas.
      ${hasSaved ? savedMsg : 'Primera vez: indicá qué columna corresponde a cada campo.'}
    </div>
    ${previewHtml}
    <form id="js-mapping-form">
      ${stdFieldsHtml}
      ${nombreHtml}
      <div style="display:flex;gap:var(--sp-2);margin-top:var(--sp-3);">
        <button type="submit" class="btn btn--primary btn--sm">✓ Confirmar y procesar</button>
        <button type="button" class="btn btn--ghost btn--sm" id="js-cancel-mapping">← Cancelar</button>
      </div>
    </form>
  `;

  wireOmitToggles(container.querySelector('#js-mapping-form'), omitted);
  wireColumnHints(container.querySelector('#js-mapping-form'), hintFor);

  // Toggle para mostrar/ocultar las secciones de nombre
  if (conNombre) {
    const junto    = container.querySelector('#js-nombre-junto');
    const separado = container.querySelector('#js-nombre-separado');
    container.querySelectorAll('[name="nombre_mode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        junto.style.display    = radio.value === 'junto'    ? 'block' : 'none';
        separado.style.display = radio.value === 'separado' ? 'block' : 'none';
      });
    });
  }

  // Submit del formulario de mapeo
  container.querySelector('#js-mapping-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form    = e.target;
    const mapping = {};

    // Campos estándar. Una omisión declarada viaja como OMITIDO: cuenta como
    // resuelta para el gate y como ausencia real (null, no cero) para el
    // control — ver contracts.js.
    fields.forEach(f => {
      if (omitted.has(f.key)) { mapping[f.key] = OMITIDO; return; }
      const val = form.querySelector(`[name="${f.key}"]`)?.value;
      if (val) mapping[f.key] = val;
    });

    // Campos de nombre (según el modo elegido)
    if (conNombre) {
      const mode = form.querySelector('[name="nombre_mode"]:checked')?.value;
      if (mode === 'junto') {
        const val = form.querySelector('[name="nombreApellidoColumn"]')?.value;
        if (val) mapping.nombreApellidoColumn = val;
      } else if (mode === 'separado') {
        const ap = form.querySelector('[name="apellidoColumn"]')?.value;
        const nm = form.querySelector('[name="nombreColumn"]')?.value;
        if (ap) mapping.apellidoColumn = ap;
        if (nm) mapping.nombreColumn   = nm;
      }
    }

    // Validar campos requeridos — deriva de EXPORT_CONTRACTS (CLAVE y
    // OBLIGATORIA bloquean, ver blocksProgress) para toda clave que algún
    // export ya consuma; cae a `f.required` para lo que todavía no está
    // contratado. OMITIDO cuenta como resuelto.
    const faltantes = pendingUploadRequirements(fileType, fields, mapping);
    if (faltantes.length) {
      showToast(faltantesToast(fileType, faltantes), 'warning');
      return;
    }

    onConfirm(mapping);
  });

  container.querySelector('#js-cancel-mapping')
    .addEventListener('click', onCancel);

  // Esc para cancelar el formulario de mapeo
  container.querySelector('#js-mapping-form').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onCancel();
  });
}

// ── Helpers de calidad de match para selects de columnas ─────────────────────
// matchLevel: devuelve 'exact' | 'saved' | 'warn' | 'none'
//   exact  — valor pre-completado por auto-detección en esta carga
//   saved  — valor pre-completado desde el perfil de sesión anterior
//   warn   — había mapping pero el campo quedó vacío
//   none   — sin dato previo
export function matchLevel(val, { autoDetected, hasSavedMapping }) {
  if (autoDetected && val)              return 'exact';
  if (!autoDetected && hasSavedMapping && val) return 'saved';
  if (hasSavedMapping && !val)          return 'warn';
  return 'none';
}

export function matchSelectStyle(level) {
  if (level === 'exact') return 'border-color:var(--color-match-exact);background:var(--color-match-exact-bg);';
  if (level === 'saved') return 'border-color:var(--color-match-saved);background:var(--color-match-saved-bg);';
  if (level === 'warn')  return 'border-color:var(--color-warning);background:var(--color-warning-bg);';
  return '';
}

export function matchBadge(level) {
  if (level === 'exact') return ' <span style="color:var(--color-match-exact);font-size:0.75em;font-weight:600;">✓ auto</span>';
  if (level === 'saved') return ' <span style="color:var(--color-match-saved);font-size:0.75em;">↺ sesión anterior</span>';
  if (level === 'warn')  return ' <span style="color:var(--color-warning);font-size:0.8em;">⚠ sin asignar</span>';
  return '';
}

function fmtPreviewCell(val) {
  if (val instanceof Date) {
    const d = String(val.getDate()).padStart(2, '0');
    const m = String(val.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${val.getFullYear()}`;
  }
  return String(val ?? '');
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
