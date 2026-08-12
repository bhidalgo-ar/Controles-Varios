// fileUpload.js — Pantalla de carga de un archivo Excel con mapeo de columnas

import { isValidExcelFile, readFileAsArrayBuffer } from '../utils/validators.js';
import { showToast } from './toast.js';
import { detectHeaders as detectHeadersXlsx, parseNominaMaestra } from '../parsers/nominaMaestra.js';
import { parseResumenLargo } from '../parsers/resumenLargoExcel.js';
import { parseResumenTabulado } from '../parsers/resumenTabuladoHorizontalExcel.js';
import { parseTabuladoControl, detectHeaders as detectHeadersTabulado } from '../parsers/tabuladoControl.js';
import { parseCatEmpleados } from '../parsers/catEmpleados.js';
import { parseBrutos } from '../parsers/brutosParser.js';
import { parseGsPers } from '../parsers/gsPersParser.js';
import { parseNr }     from '../parsers/nrParser.js';
import { parseRendimiento } from '../parsers/rendimientoParser.js';
import { parseCostoTotal }  from '../parsers/costoTotalParser.js';
import { parseConta, mergeContaFiles } from '../parsers/contaExcel.js';
import { parseAcreditaciones } from '../parsers/acreditacionesParser.js';
import { parseAcumuladores } from '../parsers/acumuladoresParser.js';
import { parseCcXEmpleado } from '../parsers/ccXEmpleadoExcel.js';
import { parseConceptCatalog } from '../parsers/conceptCatalog.js';
import { getFileProfile, saveFileProfile } from '../db.js';

// Campos "estándar" por tipo de archivo.
// Los campos de nombre (apellido/nombre/nombreCompleto) se manejan aparte
// con un selector especial porque pueden venir en 1 o 2 columnas.
const FIELD_DEFS = {
  nomina_maestra: [
    { key: 'legajoColumn',         label: 'Columna de Legajo',                required: true  },
    { key: 'conceptColumnsStartAt', label: 'Primera columna de conceptos',     required: true  },
  ],
  resumen_largo_excel: [
    { key: 'legajoColumnLong',  label: 'Columna de Legajo',             required: true },
    { key: 'conceptCodeColumn', label: 'Columna de Código de concepto',  required: true },
    { key: 'importColumn',      label: 'Columna de Importe',             required: true },
  ],
  resumen_tabulado_horizontal: [
    { key: 'legajoColumn',          label: 'Columna de Legajo',           required: true  },
    { key: 'conceptColumnsStartAt', label: 'Primera columna de conceptos', required: true  },
  ],
  tab_control: [
    { key: 'empleadoColumn',        label: 'Columna de Empleado (ID)',           required: true  },
    { key: 'apellidoNombreColumn',  label: 'Columna de Apellido y Nombre',       required: false },
    { key: 'puestoColumn',          label: 'Columna de Puesto',                  required: false },
    { key: 'idCCColumn',            label: 'Columna de ID Centro de Costo',      required: false },
    { key: 'ccColumn',              label: 'Columna de Centro de Costo',         required: false },
    { key: 'deptoColumn',           label: 'Columna de Departamento/Unidad',     required: false },
    { key: 'cuilColumn',            label: 'Columna de CUIL',                    required: false },
  ],
  cat_empleados: [
    { key: 'idEmpColumn',           label: 'Columna de ID Empleado',             required: true  },
    { key: 'puestoColumn',          label: 'Columna de Puesto',                  required: true  },
    { key: 'idCenColumn',           label: 'Columna de ID Centro de Costo',      required: true  },
    { key: 'centroCostoColumn',     label: 'Columna de Centro de Costo',         required: true  },
    { key: 'departamentoColumn',    label: 'Columna de Departamento',            required: true  },
    { key: 'fBajaColumn',           label: 'Columna de Fecha de Baja (F. BAJA)', required: true  },
    { key: 'fAltaColumn',           label: 'Columna de Fecha de Alta (F. ALTA)', required: false },
    { key: 'apellidoColumn',        label: 'Columna de Apellido',                required: false },
    { key: 'nombreColumn',          label: 'Columna de Nombre',                  required: false },
    { key: 'cuilColumn',            label: 'Columna de CUIL',                    required: false },
    { key: 'idPueColumn',           label: 'Columna de ID Puesto',               required: false },
  ],
  brutos_file: [
    { key: 'legajoColumn',          label: 'Columna de Legajo',                  required: true  },
    { key: 'salBaseColumn',         label: 'Columna de SAL_BASE',                required: false },
    { key: 'aCuFutAumenColumn',     label: 'Columna de A_CTA_FUT_AUMEN',         required: false },
  ],
  gs_pers_file: [
    { key: 'legajoColumn',          label: 'Columna de Legajo',                  required: true  },
    { key: 'gtosPersonalesColumn',  label: 'Columna de GTOS_PERSONALES',         required: false },
    { key: 'dtoCocheraColumn',      label: 'Columna de DTO_COCHERA',             required: false },
  ],
  nr_file: [
    { key: 'legajoColumn',          label: 'Columna de Legajo',                  required: true  },
    { key: 'reinHomeOficeColumn',   label: 'Columna de REIN_HOME_OFICE',         required: false },
    { key: 'indemPreavisoColumn',   label: 'Columna de INDEM_PREAVISO',          required: false },
    { key: 'sacPreavisoColumn',     label: 'Columna de SAC_PREAVISO',            required: false },
    { key: 'indemAntDespColumn',    label: 'Columna de INDEM_ANT_DESP',          required: false },
    { key: 'indemAntFalleColumn',   label: 'Columna de INDEM_ANT_FALLE',         required: false },
    { key: 'indemIntegColumn',      label: 'Columna de INDEM_INTEG',             required: false },
    { key: 'sacIndemIntegColumn',   label: 'Columna de SAC_INDEM_INTEG',         required: false },
    { key: 'indmMaternidadColumn',  label: 'Columna de INDM_MATERNIDAD',         required: false },
    { key: 'vacNoGozadasColumn',    label: 'Columna de VAC_NO_GOZADAS',          required: false },
    { key: 'vacNoGozSacColumn',     label: 'Columna de VAC_NO_GOZ_SAC',          required: false },
    { key: 'gratVacColumn',         label: 'Columna de GRAT_VAC',                required: false },
    { key: 'graVacnogSacColumn',    label: 'Columna de GRA_VACNOG_SAC',          required: false },
    { key: 'indemFuerMayColumn',    label: 'Columna de INDEM_FUER_MAY',          required: false },
    { key: 'indemEmbarazoColumn',   label: 'Columna de INDEM_EMBARAZO',          required: false },
    { key: 'gratExtraordColumn',    label: 'Columna de GRAT_EXTRAORD',           required: false },
    { key: 'asigPasColumn',         label: 'Columna de ASIG_PAS',               required: false },
    { key: 'reintGuardColumn',      label: 'Columna de REINT_GUARD',             required: false },
    { key: 'incrementoStColumn',    label: 'Columna de INCREMENTO_ST',           required: false },
  ],
  rend_file: [
    { key: 'ccCodeColumn',     label: 'Columna de código CC (1ª col., sin encabezado)', required: false },
    { key: 'ccNameColumn',     label: 'Columna de Centro de Costo',                     required: true  },
    { key: 'precioColumn',     label: 'Columna de PRECIO',                               required: true  },
    { key: 'estimuloColumn',   label: 'Columna de ASIG. ESTÍMULO',                      required: false },
    { key: 'retirosColumn',    label: 'Columna de RETIROS',                              required: false },
    { key: 'cargasColumn',     label: 'Columna de CARGAS SOCIALES',                     required: false },
    { key: 'provMesColumn',    label: 'Columna de PROVISIÓN MES',                       required: false },
    { key: 'provCcssColumn',   label: 'Columna de PROV. CCSS MES',                      required: false },
    { key: 'costoTotalColumn', label: 'Columna de COSTO TOTAL',                         required: false },
  ],
  costo_total_file: [
    { key: 'legajoColumn',     label: 'Columna de Legajo (ID Empleado)', required: true },
    { key: 'costoTotalColumn', label: 'Columna de COSTO TOTAL',          required: true },
  ],
  // Catálogo de conceptos: formato fijo, no requiere mapping de columnas
  concept_catalog: [],
  // Contabilidad Desglosada (CONTA): formato fijo, encabezados constantes
  conta_file:      [],
  // CC x Empleado: formato fijo, encabezados constantes
  cc_x_ee_file:    [],
  // Acreditaciones (export contacred de Axton): formato fijo, igual en todas las
  // cuentas de Axton. El parser resuelve las columnas por nombre y avisa cuáles
  // faltan si el archivo no es el esperado.
  acreditaciones_file: [],
  // Acumuladores (export repacumuladores de Axton): formato fijo, igual en
  // todas las cuentas de Axton. Se sube uno por mes de la ventana del SAC
  // teórico (additionalFiles[].multi: true) — ver control acumuladores_ganancias.
  acumuladores_file: [],
};

// Tabulado del período anterior (control de Variaciones): es el MISMO archivo
// que el Tabulado del período actual, sólo que de otro mes. Comparte los campos
// de verdad en vez de declarar una copia recortada — así el perfil de columnas
// que el cliente ya tiene guardado sirve para los dos slots.
FIELD_DEFS.tab_prev_file = FIELD_DEFS.tab_control;

// Tipos que soportan mapeo de nombre (horizontal: una fila por empleado)
const TIPOS_CON_NOMBRE = ['nomina_maestra', 'resumen_tabulado_horizontal'];

/**
 * Inicializa el paso de carga de archivo dentro de un contenedor.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 *   clientCode   {string}         - code del cliente (para buscar/guardar perfil, T10)
 *   fileType     {string}         - Tipo de archivo
 *   existingData {object|null}    - Datos ya cargados en esta sesión (null = primera vez)
 *   onComplete   {function(data)} - Se llama cuando el archivo está parseado y listo
 */
export async function initFileUploadStep(container, { clientCode, fileType, existingData, onComplete, autoDetect }) {
  // CONTA admite subir varios archivos del mismo formato en una sola corrida
  // (ver initContaMultiUpload) — flujo aparte del resto, que es un archivo por slot.
  if (fileType === 'conta_file') {
    initContaMultiUpload(container, { existingData, onComplete });
    return;
  }

  // Acumuladores (Axton): un crudo por cada mes de la ventana del SAC teórico —
  // mismo flujo multi-archivo que CONTA, pero cada archivo lleva además un
  // período editable (ver initAcumuladoresMultiUpload).
  if (fileType === 'acumuladores_file') {
    initAcumuladoresMultiUpload(container, { existingData, onComplete });
    return;
  }

  if (existingData) {
    renderAlreadyLoaded(container, existingData,
      () => initFileUploadStep(container, { clientCode, fileType, existingData: null, onComplete }),
      onComplete
    );
    return;
  }

  renderDropZone(container, fileType, async (file) => {
    renderLoadingProgress(container, 'reading', 0);

    let arrayBuffer;
    try {
      arrayBuffer = await readFileAsArrayBuffer(file, (pct) => {
        updateReadingProgress(container, pct);
      });
    } catch (err) {
      renderError(container, err.message,
        () => initFileUploadStep(container, { clientCode, fileType, existingData, onComplete, autoDetect }));
      return;
    }

    renderLoadingProgress(container, 'parsing');

    let headers, preview;
    try {
      ({ headers, preview } = detectHeadersFor(fileType, arrayBuffer));
    } catch (err) {
      renderError(container, `No se pudo leer el Excel: ${err.message}`,
        () => initFileUploadStep(container, { clientCode, fileType, existingData, onComplete, autoDetect }));
      return;
    }

    // Formatos fijos (sin mapping de columnas): catálogo y CC x Empleado
    if (fileType === 'concept_catalog' || fileType === 'cc_x_ee_file') {
      renderLoadingProgress(container, 'parsing');
      try {
        const result = parseFile(arrayBuffer, fileType, null);
        const data = { ...result, mapping: {}, fileName: file.name, fileType };
        renderAlreadyLoaded(
          container,
          data,
          () => initFileUploadStep(container, { clientCode, fileType, existingData: null, onComplete }),
          onComplete
        );
      } catch (err) {
        renderError(container, `Error al procesar: ${err.message}`,
          () => initFileUploadStep(container, { clientCode, fileType, existingData: null, onComplete }));
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

    // El formulario se vuelve a mostrar a sí mismo cuando el parseo falla. Antes
    // la rama de error reimplementaba el handler un nivel más adentro, y la
    // copia perdía dos cosas: `autoDetected` (después de un error los campos que
    // decían "✓ auto" pasaban a "↺ sesión anterior", informando un perfil
    // guardado que no existe) y `autoDetect` (al cancelar y volver a subir el
    // mismo archivo había que mapear las columnas a mano).
    const showMappingForm = () => renderMappingForm(container, {
      headers, preview, fileType, savedMapping, autoDetected,
      fileName: file.name,
      onConfirm: async (mapping) => {
        renderLoadingProgress(container, 'parsing');
        try {
          const result = parseFile(arrayBuffer, fileType, mapping);
          await saveFileProfile(clientCode, fileType, mapping);

          const data = { ...result, mapping, fileName: file.name, fileType, headers, arrayBuffer, clientCode };

          renderAlreadyLoaded(
            container,
            data,
            () => initFileUploadStep(container, { clientCode, fileType, existingData: null, onComplete }),
            onComplete
          );

        } catch (err) {
          renderError(container, `Error al procesar: ${err.message}`, showMappingForm);
        }
      },
      onCancel: () => initFileUploadStep(container, { clientCode, fileType, existingData, onComplete, autoDetect }),
    });

    showMappingForm();
  });
}

// ── Carga múltiple de Contabilidad Desglosada (CONTA) ─────────────────────────
//
// A diferencia del resto de los archivos (un archivo por slot), CONTA admite
// subir varios Excel del mismo formato en una sola corrida — típicamente porque
// se juntan varios meses en el mismo control. Cada archivo se parsea por
// separado y las filas se concatenan (mergeContaFiles); se avisa sin bloquear
// si dos archivos distintos comparten filas idénticas, señal de una carga
// duplicada por error.

function initContaMultiUpload(container, { existingData, onComplete }) {
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
      fileType:      'conta_file',
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
        const { parsedRows, parseMetadata } = parseConta(arrayBuffer);
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
          <strong>Contabilidad Desglosada</strong> — arrastrá uno o varios .xlsx, o hacé clic para elegir
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
function initAcumuladoresMultiUpload(container, { existingData, onComplete }) {
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
      fileType: 'acumuladores_file',
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
        const { parsedRows, parseMetadata } = parseAcumuladores(arrayBuffer);
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
          <strong>Acumuladores (Axton)</strong> — arrastrá uno o varios .xlsx (uno por mes), o hacé clic para elegir
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

function renderDropZone(container, fileType, onFile) {
  container.innerHTML = `
    <div class="file-drop" id="js-drop-zone">
      <div class="file-drop__icon">📂</div>
      <div class="file-drop__text">
        <strong>${fileTypeLabel(fileType)}</strong> — arrastrá o hacé clic para elegir (.xlsx)
      </div>
      <input type="file" accept=".xlsx,.xls" style="display:none" id="js-file-input">
    </div>
  `;

  const dropZone  = container.querySelector('#js-drop-zone');
  const fileInput = container.querySelector('#js-file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file, onFile, container, fileType);
  });

  // Drop zone interno: stopPropagation para no duplicar con el handler del container
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.add('file-drop--dragover');
  });
  dropZone.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    dropZone.classList.remove('file-drop--dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove('file-drop--dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, onFile, container, fileType);
  });

  // Expandir el área de drop al contenedor completo (captura drops fuera del ícono)
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('file-drop--dragover');
  });
  container.addEventListener('dragleave', (e) => {
    if (!container.contains(e.relatedTarget)) dropZone.classList.remove('file-drop--dragover');
  });
  container.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('file-drop--dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, onFile, container, fileType);
  });
}

function handleFile(file, onFile, container, fileType) {
  if (!isValidExcelFile(file)) {
    renderError(container,
      `"${file.name}" no es un Excel (.xlsx). Elegí un archivo Excel.`,
      () => renderDropZone(container, fileType, onFile));
    return;
  }
  onFile(file);
}

/**
 * Muestra la pantalla de carga con barra de progreso.
 * phase = 'reading'  → barra real con porcentaje
 * phase = 'parsing'  → barra indeterminada animada
 */
function renderLoadingProgress(container, phase, pct = 0) {
  const label = phase === 'reading' ? `Leyendo archivo… ${pct}%` : 'Procesando…';
  const indet = phase === 'parsing';
  container.innerHTML = `
    <div class="loading-screen">
      <div class="spinner"></div>
      <p class="text-muted" id="js-progress-label">${label}</p>
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill ${indet ? 'progress-bar-fill--indeterminate' : ''}"
             id="js-progress-fill"
             style="width:${indet ? '40' : pct}%"></div>
      </div>
    </div>
  `;
}

/** Actualiza el label y el ancho de la barra sin re-renderizar todo el DOM */
function updateReadingProgress(container, pct) {
  const label = container.querySelector('#js-progress-label');
  const fill  = container.querySelector('#js-progress-fill');
  if (label) label.textContent = `Leyendo archivo… ${pct}%`;
  if (fill)  fill.style.width  = `${pct}%`;
}

function renderError(container, msg, onRetry) {
  container.innerHTML = `
    <div class="alert alert--danger" style="margin-bottom:var(--sp-4);">⚠️ ${escHtml(msg)}</div>
    <button class="btn btn--secondary" id="js-retry-btn">← Volver a intentar</button>
  `;
  container.querySelector('#js-retry-btn').addEventListener('click', onRetry);
}

function renderAlreadyLoaded(container, existingData, onReplace, onComplete) {
  const { fileName, parseMetadata, fileType, mapping, headers, arrayBuffer, clientCode: dataClientCode } = existingData;
  const warns = parseMetadata?.warnings?.length
    ? `<span class="badge badge--warning" style="margin-left:var(--sp-2);">${parseMetadata.warnings.length} aviso(s)</span>` : '';

  let metaLine;
  if (fileType === 'cat_empleados') {
    const fil = parseMetadata?.filtradas ?? 0;
    metaLine = `${parseMetadata?.activos ?? 0} activos de ${parseMetadata?.total ?? 0} filas`
      + (fil > 0 ? ` &nbsp;·&nbsp; <span class="badge badge--warning">${fil} sumatorias excluidas</span>` : '');
  } else if (fileType === 'concept_catalog') {
    metaLine = `${parseMetadata?.totalRows ?? 0} conceptos`
      + (parseMetadata?.remu         ? ` · ${parseMetadata.remu} remu`               : '')
      + (parseMetadata?.noRemu       ? ` · ${parseMetadata.noRemu} no_remu`          : '')
      + (parseMetadata?.aporte       ? ` · ${parseMetadata.aporte} aportes`          : '')
      + (parseMetadata?.contribucion ? ` · ${parseMetadata.contribucion} contribuciones` : '');
  } else if (fileType === 'tab_control' || fileType === 'brutos_file' || fileType === 'gs_pers_file' || fileType === 'nr_file' || fileType === 'rend_file' || fileType === 'costo_total_file' || fileType === 'cc_x_ee_file' || fileType === 'acreditaciones_file' || fileType === 'acumuladores_file' || fileType === 'tab_prev_file') {
    metaLine = `${parseMetadata?.totalRows ?? 0} registros`;
  } else {
    metaLine = `${parseMetadata?.uniqueLegajos ?? 0} legajos · ${parseMetadata?.detectedConcepts?.length ?? 0} conceptos`;
  }

  // Sección colapsada de mapeo de columnas (solo si el tipo tiene campos de mapping y se guardó
  // el arrayBuffer de esta sesión — permite ajustar el mapeo sin re-subir el archivo)
  const fields = FIELD_DEFS[fileType] || [];
  const canRemap = fields.length > 0 && headers?.length > 0 && arrayBuffer;
  const opts = (selected = '') => ['', ...((headers) || [])]
    .map(h => `<option value="${escHtml(h)}" ${h === selected ? 'selected' : ''}>${escHtml(h) || '— Sin asignar —'}</option>`)
    .join('');

  const remapHtml = canRemap ? `
    <details style="margin-top:var(--sp-1);">
      <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--color-primary);list-style:none;display:flex;align-items:center;gap:var(--sp-2);user-select:none;padding:var(--sp-1) 0;">
        <span>▸</span> Ver / ajustar mapeo de columnas
      </summary>
      <div style="margin-top:var(--sp-2);padding:var(--sp-3);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-md);">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:var(--sp-2) var(--sp-3);margin-bottom:var(--sp-3);">
          ${fields.map(f => {
            const val = mapping?.[f.key] || '';
            // Sólo se marca el estado "sin asignar". Acá el mapeo ya está
            // confirmado, así que distinguir "✓ auto" de "↺ sesión anterior"
            // sería informar el origen del pre-completado del momento de la
            // carga — un dato ya viejo que puede mentir. Lo que sí sigue siendo
            // cierto es que la columna quedó vacía, y sin el aviso se ve igual
            // que una mapeada (mismo criterio que el panel "Columnas del
            // Tabulado" del Paso 2).
            const level = val ? 'none' : 'warn';
            const style = matchSelectStyle(level);
            return `
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label ${f.required ? 'form-label--required' : ''}" style="font-size:var(--text-sm);">${escHtml(f.label)}${matchBadge(level)}</label>
                <select class="form-select" data-fu-remap-key="${escHtml(f.key)}" style="font-size:var(--text-sm);${style}">
                  ${opts(val)}
                </select>
              </div>
            `;
          }).join('')}
        </div>
        <button type="button" class="btn btn--primary btn--sm" id="js-remap-apply">✓ Aplicar cambios</button>
      </div>
    </details>
  ` : '';

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-2) var(--sp-3);border:1px solid var(--color-match-exact);background:var(--color-match-exact-bg);border-radius:var(--radius-md);font-size:var(--text-sm);">
      <span style="color:var(--color-match-exact);font-weight:600;">✓</span>
      <strong style="flex-shrink:0;">${escHtml(fileName)}</strong>
      <span style="color:var(--color-text-muted);flex:1;">${metaLine}${warns}</span>
      <button class="btn btn--ghost btn--sm" id="js-replace-btn" style="flex-shrink:0;">↺ Cambiar</button>
    </div>
    ${remapHtml}
  `;
  // El archivo ya está confirmado — avisamos al wizard sin esperar click adicional
  onComplete(existingData);
  container.querySelector('#js-replace-btn').addEventListener('click', onReplace);

  if (canRemap) {
    container.querySelector('#js-remap-apply')?.addEventListener('click', async () => {
      const btn = container.querySelector('#js-remap-apply');
      btn.disabled = true;
      btn.textContent = 'Reprocesando…';
      const newMapping = {};
      container.querySelectorAll('[data-fu-remap-key]').forEach(sel => {
        const k = sel.dataset.fuRemapKey;
        if (sel.value) newMapping[k] = sel.value;
      });
      try {
        const result = parseFile(arrayBuffer, fileType, newMapping);
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

function renderMappingForm(container, { headers, preview, fileType, savedMapping, autoDetected, fileName, onConfirm, onCancel }) {
  const fields   = FIELD_DEFS[fileType] || [];
  const conNombre = TIPOS_CON_NOMBRE.includes(fileType);

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
  const opts = (selected = '') => ['', ...headers]
    .map(h => `<option value="${escHtml(h)}" ${h === selected ? 'selected' : ''}>${escHtml(h) || '— Seleccioná —'}</option>`)
    .join('');

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
        const val   = savedMapping?.[f.key] || '';
        const level = fieldLevel(val);
        const style = matchSelectStyle(level);
        return `
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label ${f.required ? 'form-label--required' : ''}">${f.label}${matchBadge(level)}</label>
            <select class="form-select" name="${f.key}"${style ? ` style="${style}"` : ''}>
              ${opts(val)}
            </select>
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

    // Campos estándar
    fields.forEach(f => {
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

    // Validar campos requeridos
    const faltantes = fields.filter(f => f.required && !mapping[f.key]).map(f => f.label);
    if (faltantes.length) {
      showToast(`Falta completar: ${faltantes.join(', ')}`, 'warning');
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

// ── Helpers ───────────────────────────────────────────────────────────────────

// El Tabulado de algunos clientes (OPmobility / Plastic Omnium Florida) llega
// con extensión .xls pero es HTML — necesita el detector HTML-aware de
// tabuladoControl.js. El resto de los tipos de archivo usan el detector plano
// de nominaMaestra.js (ver tabuladoHtml.js para el detalle del formato).
function detectHeadersFor(fileType, arrayBuffer) {
  if (fileType === 'tab_control' || fileType === 'tab_prev_file') {
    return detectHeadersTabulado(arrayBuffer);
  }
  return detectHeadersXlsx(arrayBuffer);
}

function parseFile(arrayBuffer, fileType, mapping) {
  switch (fileType) {
    case 'nomina_maestra':              return parseNominaMaestra(arrayBuffer, mapping);
    case 'resumen_largo_excel':         return parseResumenLargo(arrayBuffer, mapping);
    case 'resumen_tabulado_horizontal': return parseResumenTabulado(arrayBuffer, mapping);
    case 'tab_control':                 return parseTabuladoControl(arrayBuffer, mapping);
    case 'tab_prev_file':               return parseTabuladoControl(arrayBuffer, mapping);
    case 'cat_empleados':               return parseCatEmpleados(arrayBuffer, mapping);
    case 'brutos_file':                 return parseBrutos(arrayBuffer, mapping);
    case 'gs_pers_file':                return parseGsPers(arrayBuffer, mapping);
    case 'nr_file':                     return parseNr(arrayBuffer, mapping);
    case 'rend_file':                   return parseRendimiento(arrayBuffer, mapping);
    case 'costo_total_file':            return parseCostoTotal(arrayBuffer, mapping);
    case 'cc_x_ee_file':                return parseCcXEmpleado(arrayBuffer);
    case 'acreditaciones_file':         return parseAcreditaciones(arrayBuffer);
    case 'acumuladores_file':           return parseAcumuladores(arrayBuffer);
    case 'concept_catalog':             return parseConceptCatalog(arrayBuffer);
    default: throw new Error(`Tipo de archivo desconocido: "${fileType}".`);
  }
}

function fileTypeLabel(fileType) {
  return {
    nomina_maestra:              'Nómina Maestra',
    resumen_largo_excel:         'Resumen Largo Excel',
    resumen_tabulado_horizontal: 'Resumen Tabulado Horizontal',
    tab_control:                 'Tabulado (Controles)',
    cat_empleados:               'Reporte de Categorías',
    brutos_file:                 'Reporte de Brutos',
    gs_pers_file:                'Reporte de GS Pers (Gastos Personales y Cochera)',
    nr_file:                     'Reporte de NR (No Remunerativos)',
    rend_file:                   'Reporte de Rendimiento',
    costo_total_file:            'Reporte de Costo Total (por empleado)',
    conta_file:                  'Contabilidad Desglosada',
    cc_x_ee_file:                'CC x Empleado',
    acreditaciones_file:         'Acreditaciones (export de Axton)',
    acumuladores_file:           'Acumuladores (export de Axton)',
    tab_prev_file:               'Tabulado del período anterior',
    concept_catalog:             'Catálogo de Conceptos',
  }[fileType] || fileType;
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
