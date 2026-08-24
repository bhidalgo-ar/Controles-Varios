// catXEmpleados.js — Lógica y render del Control "EE x CATEG" (Empleados por Categoría)
//
// El reporte de Categorías trae TODA la nómina (activos + bajas). El control
// separa unos de otros con la columna F. BAJA y NO marca como faltantes a los
// empleados que figuran en el Tabulado pero ya son bajas en el reporte.
//
// Valida:
//   1. Diferencias de cantidad: activos en Rep. Categ. vs Tabulado
//   2. Activos en Rep. Categ. que no están en Tabulado (con F. Alta)
//   3. Empleados en Tabulado que no están en Rep. Categ. (ni activos ni bajas)
//   4. Discrepancias de campo (PUESTO, CC, DEPTO) en empleados coincidentes
//   5. Distribución por PUESTO — con detalle de empleados cuando hay diferencia
//   6. Distribución por CC — ídem

import { renderExportMenu } from '../ui/exportMenu.js';
import { renderPlanillaPanel } from '../ui/planillaPanel.js';
import { renderFichasPanel } from '../ui/fichaList.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { periodSuffix } from '../utils/dates.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { renderVerdict, renderTiles, renderResumenDetalle, renderRubroGrid } from '../ui/resultBlocks.js';
import { resumenStats } from './resumenStats.js';

// ── Los campos que este control cruza ────────────────────────────────────────
//
// Están declarados en un solo lugar porque los usan las cuatro vistas: la
// planilla (una fila por campo que no coincide), la ficha (un renglón por campo,
// coincida o no), la matriz "Por campo" (una fila por campo, con en cuántos
// legajos falla) y el conteo del Resumen.
//
// El `key` es interno y viaja en los datos; el `label` es lo único que ve el
// analista, y es el mismo en las cuatro vistas — antes la planilla decía
// "CENTRO_COSTO" y no hay ningún archivo donde el campo se llame así.
//
// `cat` y `tab` son los nombres de la columna en el mapeo de cada archivo. Si a
// un campo le falta la columna de alguno de los dos lados no se compara y no se
// completa en silencio: sale como "sin comparar", con su nombre, en la matriz y
// en cada ficha.
const CAMPOS = [
  { key: 'PUESTO',       label: 'Puesto',          cat: 'puestoColumn',       tab: 'puestoColumn' },
  { key: 'CENTRO_COSTO', label: 'Centro de costo', cat: 'centroCostoColumn',  tab: 'ccColumn' },
  { key: 'DEPTO',        label: 'Departamento',    cat: 'departamentoColumn', tab: 'deptoColumn' },
];

// ── Cuándo un campo deja de ser un problema de un empleado ───────────────────
//
// Es la pregunta que la matriz "Por campo" viene a contestar: si "Centro de
// costo" no coincide en 80 de 100 legajos, no hay 80 errores de carga — hay un
// archivo mal armado, y revisarlo legajo por legajo es trabajo tirado.
//
// El corte es un criterio, no una medición: un tercio de los legajos comparados
// y por lo menos tres. El mínimo de tres es lo que evita que "1 de 2" se lea
// como una carga masiva en un cliente chico o en una corrida de prueba. Los dos
// números están acá, juntos, para que se puedan mover de un lugar.
const MASIVO_PROPORCION = 1 / 3;
const MASIVO_MIN_LEGAJOS = 3;

/** ¿Este conteo se explica por una carga masiva y no por un empleado? */
function esMasivo(cuantos, sobre) {
  return sobre > 0 && cuantos >= MASIVO_MIN_LEGAJOS && (cuantos / sobre) >= MASIVO_PROPORCION;
}

/**
 * Resumen del control para la tarjeta colapsada en la pantalla de resultados.
 * Devuelve { status, headline, insights[] }.
 */
export function summarizeCatXEmpleados(results) {
  const s = results.summary;
  const hasDiff = s.missingInTabCount > 0
    || s.missingInCatCount > 0
    || s.fieldDiscrepancyCount > 0;
  const sign = s.diff > 0 ? '+' : '';

  // Este control no cruza montos en $ — es de conteo/coincidencia de empleados
  // y campos (puesto/CC/depto). "Unidad" = legajo; unitsTotal toma el universo
  // del Tabulado (referencia común a todos los controles de esta app).
  const unitsWithDiff = s.missingInTabCount + s.missingInCatCount + s.fieldDiscrepancyCount;
  const contextNote = unitsWithDiff > 0
    ? `${s.missingInTabCount} sin Tabulado · ${s.missingInCatCount} sin Rep. Categ. · ${s.fieldDiscrepancyCount} discrepancias de campo`
    : 'Empleados y campos (puesto/CC/depto) verificados';

  return {
    status: hasDiff ? 'warning' : 'success',
    headline: `EE x CATEG activos: ${s.catActivos} · Tabulado: ${s.tabTotal} · Diferencia neta: ${sign}${s.diff}`,
    insights: [
      {
        type:  s.missingInTabCount > 0 ? 'warning' : 'success',
        label: 'En Rep. Categ., faltan en Tabulado',
        value: s.missingInTabCount,
      },
      {
        type:  s.missingInCatCount > 0 ? 'warning' : 'success',
        label: 'En Tabulado, faltan en Rep. Categ.',
        value: s.missingInCatCount,
      },
      {
        type:  s.fieldDiscrepancyCount > 0 ? 'warning' : 'success',
        label: 'Discrepancias de campo',
        value: s.fieldDiscrepancyCount,
      },
    ],
    unit:            'legajo',
    unitsTotal:      s.tabTotal,
    unitsWithDiff,
    diffTotalAmount: null,
    worstCase:       null,
    contextNote,
    resumen:         resumenDeCatXEmpleados(results),
  };
}

// ── El sub-objeto que dibuja el tablero del Resumen ─────────────────────────
//
// Este control compara CAMPOS DE TEXTO, no importes: sin signo y sin plata, así
// que `diffSigned`/`diffBuckets` no aplican, y tampoco hay una empresa contra
// otra que agrupar. El puente es de CONTEOS — comparados → coinciden → difieren
// → sin comparar, la misma tira que ya usa la ficha de cada legajo (D-082) —, y
// el corte por campo NO se repite acá: eso ya lo contesta la cuarta solapa
// "Por campo", no un bloque nuevo del tablero.
function resumenDeCatXEmpleados(results) {
  return resumenStats({
    unit: 'legajo',
    rows: [],
    bridge: bridgeDeCatXEmpleados(results),
    notApplicable: ['signed', 'buckets', 'group', 'cause', 'top', 'keys'],
  });
}

/**
 * Comparados → coinciden → difieren → sin comparar, la misma tira que ya usa
 * la ficha de cada legajo (D-082). Una corrida guardada antes de esta versión
 * no trae `matchedCount` ni `byField` (ver `tieneDetalleDeCampos` más abajo):
 * sin ellos no se puede armar el puente sin inventar el número, así que no se
 * dibuja — igual que esa corrida ya no ofrece la ficha ni la solapa "Por campo".
 */
function bridgeDeCatXEmpleados(results) {
  if (!tieneDetalleDeCampos(results)) return null;
  const { matchedCount, fieldDiscrepancies, missingInTab, missingInCat } = results;
  const sinComparar = missingInTab.length + missingInCat.length;
  if (matchedCount + sinComparar === 0) return null;

  return {
    kind: 'counts',
    title: 'Cuántos legajos se pudieron comparar',
    steps: [
      { label: 'Comparados',   amount: matchedCount,                            tone: 'ink' },
      { label: 'Coinciden',    amount: matchedCount - fieldDiscrepancies.length, tone: 'ink' },
      { label: 'Difieren',     amount: fieldDiscrepancies.length,               tone: 'error' },
      { label: 'Sin comparar', amount: sinComparar,                             tone: 'warn' },
    ],
  };
}

export function runCatXEmpleados(catAllRows, tabRows, mapping) {
  const cm = mapping.cat;
  const tm = mapping.tab;

  // Clave de comparación de legajo para este cliente (D-038). Antes era un
  // `normId` local con `parseInt`, que además de ignorar los ceros a la
  // izquierda colapsaba `'12-B'` y `'12-C'` en el mismo `12` — un match falso,
  // no un match más flexible.
  const normId = makeLegajoKey(mapping.legajoKeyMode);

  // Partir el reporte en activos y bajas usando F. BAJA.
  const fBajaCol = cm.fBajaColumn;
  const esBaja = (row) => {
    if (!fBajaCol) return false;
    const v = row[fBajaCol];
    return !(v === null || v === undefined || String(v).trim() === '');
  };
  const catActivos = catAllRows.filter(r => !esBaja(r));
  const catBajaIds = new Set(
    catAllRows.filter(esBaja).map(r => normId(r[cm.idEmpColumn]))
  );

  const catByEmp = new Map(catActivos.map(r => [normId(r[cm.idEmpColumn]), r]));
  const tabByEmp = new Map(tabRows.map(r => [normId(r[tm.empleadoColumn]), r]));

  // ── 1. Empleados faltantes ─────────────────────────────────────────────────

  // Qué campos se pueden mirar en esta corrida: los que tienen columna de los
  // dos lados. El que no la tiene igual viaja, para poder decir que no se pudo
  // comparar en vez de dejarlo afuera sin avisar.
  const camposDelCruce = CAMPOS.map(c => ({
    key: c.key, label: c.label,
    catCol: cm[c.cat] || null,
    tabCol: tm[c.tab] || null,
  }));

  /** Los campos de un legajo que está en UN solo archivo: se muestran los
   *  valores del lado que sí lo tiene, y ninguno se puede comparar. */
  const camposDeUnLado = (row, lado) => camposDelCruce.map(c => {
    const col = lado === 'cat' ? c.catCol : c.tabCol;
    const valor = col ? norm(row[col]) : null;
    return {
      key: c.key, label: c.label,
      cat: lado === 'cat' ? valor : null,
      tab: lado === 'tab' ? valor : null,
      estado: 'sinComparar',
    };
  });

  const missingInTab = [];
  for (const [, r] of catByEmp) {
    if (!tabByEmp.has(normId(r[cm.idEmpColumn]))) {
      missingInTab.push({
        id:      norm(r[cm.idEmpColumn]),   // display: valor original (con ceros)
        apellido: norm(r[cm.apellidoColumn]),
        nombre:   norm(r[cm.nombreColumn]),
        fAlta:    cm.fAltaColumn ? fmtDate(r[cm.fAltaColumn]) : '',
        campos:   camposDeUnLado(r, 'cat'),
      });
    }
  }

  const missingInCat = [];
  for (const [, r] of tabByEmp) {
    // Si el empleado existe en Rep. Categ. como baja, no es un error: el
    // Tabulado todavía lo lista pero el reporte ya lo dio de baja.
    const tid = normId(r[tm.empleadoColumn]);
    if (!catByEmp.has(tid) && !catBajaIds.has(tid)) {
      missingInCat.push({
        id:              norm(r[tm.empleadoColumn]),  // display: valor original
        apellidoNombre:  norm(r[tm.apellidoNombreColumn]),
        campos:          camposDeUnLado(r, 'tab'),
      });
    }
  }

  // ── 2. Discrepancias de campo en empleados coincidentes ────────────────────

  // Cada legajo que está en los DOS archivos se mira campo por campo, y se
  // guardan todos los campos —coincidan o no— porque la ficha muestra el
  // renglón entero: sin los que coinciden no se puede ver si el problema es de
  // ese campo o del legajo.
  const fieldDiscrepancies = [];
  const difierenPorCampo = new Map(camposDelCruce.map(c => [c.key, 0]));
  let matchedCount = 0;

  for (const [nid, catRow] of catByEmp) {
    const tabRow = tabByEmp.get(nid);
    if (!tabRow) continue;
    matchedCount++;

    const campos = camposDelCruce.map(c => {
      if (!c.catCol || !c.tabCol) {
        return { key: c.key, label: c.label, cat: null, tab: null, estado: 'sinComparar' };
      }
      const cat = norm(catRow[c.catCol]);
      const tab = norm(tabRow[c.tabCol]);
      return { key: c.key, label: c.label, cat, tab, estado: cat === tab ? 'coincide' : 'difiere' };
    });

    const diffs = campos.filter(c => c.estado === 'difiere');
    for (const d of diffs) difierenPorCampo.set(d.key, difierenPorCampo.get(d.key) + 1);

    if (diffs.length) {
      fieldDiscrepancies.push({
        id:      norm(catRow[cm.idEmpColumn]),  // display: valor original
        apellido: norm(catRow[cm.apellidoColumn]),
        nombre:   norm(catRow[cm.nombreColumn]),
        campos,
        diffs: diffs.map(d => ({ field: d.key, label: d.label, cat: d.cat, tab: d.tab })),
      });
    }
  }

  // ── La matriz campo × legajo (la solapa "Por campo") ───────────────────────
  //
  // El universo son los legajos que este control considera un caso: los que
  // están en los dos archivos más los que están en uno solo. Las bajas del Rep.
  // Categ. que el Tabulado todavía lista quedan afuera acá igual que en el resto
  // del control — no son un error, ya se dieron de baja.
  //
  // Un campo sólo se puede comparar en los legajos que están en los dos
  // archivos: el resto queda en "sin comparar", que no es lo mismo que coincidir
  // (D-073).
  const universo = matchedCount + missingInTab.length + missingInCat.length;
  const byField = camposDelCruce.map(c => {
    const comparados = (c.catCol && c.tabCol) ? matchedCount : 0;
    const difieren   = difierenPorCampo.get(c.key);
    return {
      key: c.key,
      label: c.label,
      comparable: Boolean(c.catCol && c.tabCol),
      comparados,
      difieren,
      coinciden: comparados - difieren,
      sinComparar: universo - comparados,
      pct: comparados > 0 ? difieren / comparados : null,
      masivo: esMasivo(difieren, comparados),
    };
  }).sort((a, b) =>
    // De peor a mejor: primero el campo que falla en más legajos. Con el mismo
    // conteo, adelante el que menos se pudo mirar.
    b.difieren - a.difieren
    || b.sinComparar - a.sinComparar
    || a.label.localeCompare(b.label));

  // ── 3. Distribuciones con detalle de empleados por grupo ───────────────────
  // Las distribuciones agrupan SOLO empleados activos en Rep. Categ. y
  // empleados del Tabulado que no son bajas en el reporte. Las bajas se
  // excluyen para no inflar el lado Tabulado con gente que ya no está activa.

  const tabRowsForDist = tabRows.filter(r => !catBajaIds.has(normId(r[tm.empleadoColumn])));

  const dedupeCAT = cm.cuilColumn || cm.idEmpColumn;
  const dedupeTAB = tm.cuilColumn || tm.empleadoColumn;

  const catDispFn = r => ({
    id:     norm(r[cm.idEmpColumn]),
    nombre: [norm(r[cm.apellidoColumn]), norm(r[cm.nombreColumn])].filter(Boolean).join(' '),
  });
  const tabDispFn = r => ({
    id:     norm(r[tm.empleadoColumn]),
    nombre: norm(r[tm.apellidoNombreColumn]) || norm(r[tm.empleadoColumn]),
  });

  const byPuesto = mergeAggregations(
    groupByKey(catActivos,     cm.puestoColumn, dedupeCAT, catDispFn, normId),
    groupByKey(tabRowsForDist, tm.puestoColumn, dedupeTAB, tabDispFn, normId)
  );

  const byCC = mergeAggregations(
    groupByKey(catActivos,     cm.centroCostoColumn, dedupeCAT, catDispFn, normId),
    groupByKey(tabRowsForDist, tm.ccColumn,           dedupeTAB, tabDispFn, normId)
  );

  return {
    summary: {
      catActivos:            catActivos.length,
      catBajas:              catBajaIds.size,
      // tabByEmp.size, no tabRows.length: el Tabulado trae una fila por
      // liquidación, no por empleado (un legajo con doble liquidación en el
      // mes contaba dos veces) — el resto del archivo ya dedupea por empleado
      // (tabByEmp arriba), acá se había quedado con el conteo crudo.
      tabTotal:              tabByEmp.size,
      diff:                  catActivos.length - tabByEmp.size,
      missingInTabCount:     missingInTab.length,
      missingInCatCount:     missingInCat.length,
      fieldDiscrepancyCount: fieldDiscrepancies.length,
    },
    missingInTab,
    missingInCat,
    fieldDiscrepancies,
    byField,
    matchedCount,
    universo,
    byPuesto,
    byCC,
    period: mapping.period || '',
  };
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderCatXEmpleadosResults(results, container) {
  const { summary } = results;
  const totalDiffs = summary.missingInTabCount + summary.missingInCatCount + summary.fieldDiscrepancyCount;
  const conDetalle = tieneDetalleDeCampos(results);
  const fichas = buildFichasCatXEmpleados(results);

  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'cat_x_empleados',
    // Con diferencias abre en Fichas (lo primero que se ve es por qué falla);
    // si cerró, en la Planilla. La preferencia del analista pisa el default,
    // pero se guarda por control Y por estado del control (§2).
    conDiferencias: conDetalle ? totalDiffs > 0 : undefined,
    resumen(panel) {
      const tone = totalDiffs === 0 ? 'ok' : 'warn';
      renderVerdict(panel, {
        tone,
        title: totalDiffs === 0
          ? 'El Rep. Categ. y el Tabulado coinciden en empleados y campos.'
          : `${totalDiffs} diferencia${totalDiffs === 1 ? '' : 's'} entre Rep. Categ. y Tabulado.`,
        body: `${summary.catActivos} activos en Rep. Categ. · ${summary.tabTotal} en Tabulado`
          + (summary.catBajas > 0 ? ` · ${summary.catBajas} bajas excluidas` : '') + '.',
      });
      const diffSign = summary.diff > 0 ? '+' : '';
      renderTiles(panel, [
        { label: 'Activos en Rep. Categ.', value: summary.catActivos },
        { label: 'En Tabulado', value: summary.tabTotal, sub: summary.diff !== 0 ? `${diffSign}${summary.diff} vs Rep. Categ.` : 'diferencia neta 0' },
        { label: 'Sin Tabulado', value: summary.missingInTabCount, tone: summary.missingInTabCount > 0 ? 'error' : 'ok' },
        { label: 'Sin Rep. Categ.', value: summary.missingInCatCount, tone: summary.missingInCatCount > 0 ? 'error' : 'ok' },
        { label: 'Discrepancias de campo', value: summary.fieldDiscrepancyCount, tone: summary.fieldDiscrepancyCount > 0 ? 'error' : 'ok' },
      ]);
      if (!conDetalle) {
        const aviso = document.createElement('p');
        aviso.className = 'text-muted';
        aviso.style.cssText = 'font-size:var(--text-sm);padding:var(--sp-2) 0;';
        aviso.textContent = 'Esta corrida se guardó con una versión anterior y no trae el detalle campo '
          + 'por campo, así que no están las solapas "Fichas" ni "Por campo". Volvé a correr el control '
          + 'con los mismos archivos para verlas.';
        panel.appendChild(aviso);
      }
    },
    ...(conDetalle ? {
      fichas(panel) { renderCatXEmpleadosFichas(panel, { fichas, results }); },
    } : {}),
    planilla(panel) { renderCatXEmpleadosPlanilla(panel, results); },
    // La cuarta solapa. Ver el comentario de `renderPorCampo()`: no es una
    // planilla de totales y no reemplaza a la Planilla — contesta otra pregunta.
    extraTabs: conDetalle
      ? [{ id: 'porCampo', label: 'Por campo', render: (panel) => renderPorCampo(panel, results) }]
      : [],
  });
}

// ── La ficha por legajo (§4 de specs/vista-estandar-resultados.md) ───────────
//
// La planilla lista un caso por fila, así que un legajo con tres campos mal
// aparece tres veces y no se lo puede ver entero. La ficha da vuelta el eje: una
// tarjeta por LEGAJO, con sus campos adentro.
//
// **Acá no hay cascada de importes**, que es lo que la ficha muestra en el resto
// de los controles: este cruza campos de texto. La tira de conciliación es
// entonces el conteo de campos — de los que el cruce mira, cuántos no se
// pudieron comparar, cuántos coinciden y cuántos no —, que es la misma idea
// (de lo que había que revisar a lo que queda sin explicar) con lo que este
// control tiene para contar.
//
// Y la conclusión contesta lo que el analista se pregunta al abrir la ficha:
// **si el problema es de este empleado o de una carga masiva**. Un campo que no
// coincide en 80 de 100 legajos no son 80 errores de carga.
//
// El universo de fichas es el mismo que el de la planilla: los legajos que
// tienen algo para revisar. Un legajo que coincide en todo no tiene ficha —no
// hay nada que abrir—, y por eso los chips "Al centavo" y "Dentro del margen"
// salen apagados con el porqué en el `title`.

/**
 * ¿Esta corrida trae el detalle campo por campo?
 *
 * Las corridas se guardan en la base y se vuelven a dibujar tal cual (ver
 * `js/ui/controlsResults.js`). Una guardada antes de esta versión sólo tiene los
 * campos que NO coincidían: los que sí coincidían no se guardaban. Con eso no se
 * puede armar ni la ficha ni la matriz, y armarlas igual daría números
 * equivocados —dirían que se comparó un campo solo—, así que esas dos solapas no
 * se ofrecen y la pantalla dice por qué. Se arregla volviendo a correr el
 * control con los mismos archivos.
 */
function tieneDetalleDeCampos(results) {
  return Array.isArray(results.byField);
}

/** 'Coincide' / 'No coincide' / 'Sin comparar', para el renglón de la ficha. */
const ESTADO_CAMPO = {
  coincide:    'Coincide',
  difiere:     'No coincide',
  sinComparar: 'Sin comparar',
};

/** El valor de un campo tal como se muestra: lo que no se pudo mirar es `—`, y
 *  una celda vacía se dice con todas las letras (vacío no es lo mismo que no
 *  hay dato, y el analista tiene que poder distinguirlos). */
function valorDeCampo(v) {
  if (v === null || v === undefined) return '—';
  return v === '' ? '(vacío)' : v;
}

/**
 * Las fichas de una corrida: una por legajo con algo para revisar. Función pura
 * (arma descriptores, no toca el DOM), así que se testea sin navegador.
 */
export function buildFichasCatXEmpleados(results) {
  // Una corrida guardada antes de esta versión no trae el detalle campo por
  // campo (ver `tieneDetalleDeCampos`): sin él no hay ficha que armar.
  if (!tieneDetalleDeCampos(results)) return [];
  const porCampo = new Map(results.byField.map(f => [f.key, f]));
  return [
    ...results.fieldDiscrepancies.map(e => fichaDeCampos(e, porCampo)),
    ...results.missingInTab.map(e => fichaDeAusente(e, 'tab', results)),
    ...results.missingInCat.map(e => fichaDeAusente(e, 'cat', results)),
  ];
}

/** La tira: de los campos del cruce a los que no coinciden, restando. */
function tiraDeCampos(campos, { difieren }) {
  const sinComparar = campos.filter(c => c.estado === 'sinComparar').length;
  const coinciden   = campos.filter(c => c.estado === 'coincide').length;
  return [
    { label: 'Campos del cruce', value: String(campos.length) },
    { label: '− Sin comparar',   value: String(sinComparar) },
    { label: 'Comparados',       value: String(campos.length - sinComparar) },
    { label: '− Coinciden',      value: String(coinciden), invert: true },
    // El residuo: lo que queda para revisar. En un legajo que está en un solo
    // archivo no es 0 sino `—`: no se pudo saber, y no se lee como aprobado.
    { label: 'No coinciden',     value: difieren === null ? '—' : String(difieren), residuo: true },
  ];
}

/** El renglón por campo con el valor de cada lado, marcando el que difiere. */
function detalleDeCampos(campos) {
  return {
    title: 'Campo por campo — cómo figura de cada lado',
    columns: [
      { key: 'campo',  label: 'Campo' },
      { key: 'cat',    label: 'En Rep. Categ.' },
      { key: 'tab',    label: 'En Tabulado' },
      { key: 'estado', label: 'Estado' },
    ],
    rows: campos.map(c => ({
      campo:  c.label,
      cat:    valorDeCampo(c.cat),
      tab:    valorDeCampo(c.tab),
      estado: ESTADO_CAMPO[c.estado],
      tone:   c.estado === 'difiere' ? 'neg' : c.estado === 'coincide' ? 'pos' : undefined,
    })),
  };
}

/** El legajo que está en los dos archivos y tiene algún campo distinto. */
function fichaDeCampos(e, porCampo) {
  const difieren = e.diffs.length;
  const masivos = e.diffs.filter(d => porCampo.get(d.field)?.masivo);
  const name = [e.apellido, e.nombre].filter(Boolean).join(' ');

  return {
    id: e.id,
    name,
    caso: CASO.campo,
    estado: 'conDif',
    difieren,
    diffLabels: e.diffs.map(d => d.label),
    masivo: masivos.length > 0,
    severity: 'error',
    badge: {
      text: difieren === 1 ? '1 campo no coincide' : `${difieren} campos no coinciden`,
      tone: 'error',
    },
    context: e.diffs.map(d => d.label),
    marks: masivos.length ? [{
      text: 'Puede ser una carga masiva',
      tone: 'info',
      title: `${masivos.map(d => d.label).join(', ')} no coincide${masivos.length === 1 ? '' : 'n'} `
        + 'en buena parte de la nómina, no sólo en este legajo.',
    }] : [],
    amountLabel: 'NO COINCIDEN',
    amount: String(difieren),
    amountTone: 'error',
    body: {
      strip: tiraDeCampos(e.campos, { difieren }),
      detail: detalleDeCampos(e.campos),
      conclusion: conclusionDeCampos(e.diffs, porCampo),
    },
  };
}

/** El legajo que está en un archivo y no en el otro: no hay con qué comparar. */
function fichaDeAusente(e, falta, results) {
  const name = falta === 'tab'
    ? [e.apellido, e.nombre].filter(Boolean).join(' ')
    : e.apellidoNombre;
  const sinComparar = e.campos.length;

  return {
    id: e.id,
    name,
    caso: falta === 'tab' ? CASO.sinTab : CASO.sinCat,
    estado: 'sinComparar',
    // `null`, no 0: no es que no haya diferencias, es que no se pudieron mirar.
    difieren: null,
    diffLabels: [],
    masivo: ausenciaMasiva(falta, results),
    severity: 'warn',
    badge: { text: falta === 'tab' ? CASO.sinTab : CASO.sinCat, tone: 'warn' },
    context: [
      falta === 'tab' && e.fAlta ? `Alta ${e.fAlta}` : null,
      `${sinComparar} campo${sinComparar === 1 ? '' : 's'} sin comparar`,
    ].filter(Boolean),
    marks: [],
    amountLabel: 'NO COINCIDEN',
    amount: null,          // '—': no se pudo saber (D-073)
    amountTone: 'warn',
    body: {
      strip: tiraDeCampos(e.campos, { difieren: null }),
      detail: detalleDeCampos(e.campos),
      conclusion: conclusionDeAusente(e, falta, results),
    },
  };
}

/** ¿Falta tanta gente de un lado que ya no es un legajo, es el archivo? */
function ausenciaMasiva(falta, results) {
  return falta === 'tab'
    ? esMasivo(results.missingInTab.length, results.summary.catActivos)
    : esMasivo(results.missingInCat.length, results.summary.tabTotal);
}

// ── La conclusión: no un resumen, una instrucción ───────────────────────────

/** "¿Esto le pasa a este empleado o a todos?" — la pregunta de esta ficha. */
function conclusionDeCampos(diffs, porCampo) {
  const filas = diffs.map(d => ({ label: d.label, m: porCampo.get(d.field) })).filter(x => x.m);
  const frase = (x) => `«${x.label}» no coincide en ${fmtInt(x.m.difieren)} de ${fmtInt(x.m.comparados)} `
    + `legajo${x.m.comparados === 1 ? '' : 's'} comparado${x.m.comparados === 1 ? '' : 's'}`;

  if (filas.length === 0) {
    return {
      tone: 'error',
      title: `${diffs.length} campo${diffs.length === 1 ? '' : 's'} de este legajo no coinciden`,
      text: 'Compará los valores de la tabla de arriba contra el reporte de Categorías y contra el '
        + 'Tabulado del período, y corregí el que esté mal.',
    };
  }

  const masivos = filas.filter(x => x.m.masivo);
  const propios = filas.filter(x => !x.m.masivo);

  if (masivos.length && !propios.length) {
    return {
      tone: 'warn',
      title: masivos.length === 1
        ? `No parece de este empleado: ${frase(masivos[0])}`
        : `No parece de este empleado: ${masivos.map(x => `«${x.label}»`).join(' y ')} fallan en buena parte de la nómina`,
      // Con un solo campo la frase ya está en el título y no se repite.
      text: (masivos.length === 1 ? '' : `${masivos.map(frase).join('. ')}. `)
        + 'Un campo que no coincide en tantos legajos a la vez sale de cómo se armó o se exportó el '
        + 'archivo, no de este legajo. Mirá la solapa «Por campo» y resolvé eso antes de corregir '
        + 'empleado por empleado.',
    };
  }

  if (masivos.length && propios.length) {
    return {
      tone: 'warn',
      title: 'Hay de las dos: un campo de toda la nómina y uno de este empleado',
      text: `${masivos.map(frase).join('. ')} — eso se arregla en el archivo y no en este legajo. `
        + `En cambio ${propios.map(frase).join(', ')}: ése sí es de este empleado. `
        + 'Mirá la solapa «Por campo» para el primero y corregí el segundo donde corresponda.',
    };
  }

  return {
    tone: 'error',
    title: propios.length === 1
      ? `Es de este empleado: ${frase(propios[0])}`
      : `Es de este empleado: ${propios.length} campos que casi no fallan en el resto de la nómina`,
    text: (propios.length === 1 ? '' : `${propios.map(frase).join('. ')}. `)
      + 'Compará los valores de la tabla de arriba contra el reporte de Categorías y contra el Tabulado '
      + 'del período, y corregí el que esté mal antes de mandar el control.',
  };
}

/** Lo mismo, para el legajo que está en un solo archivo. */
function conclusionDeAusente(e, falta, results) {
  const { summary } = results;

  if (falta === 'tab') {
    const n = results.missingInTab.length;
    if (ausenciaMasiva('tab', results)) {
      return {
        tone: 'warn',
        title: `${fmtInt(n)} de ${fmtInt(summary.catActivos)} activos del Rep. Categ. no están en el Tabulado`,
        text: 'No parece de este empleado: falta demasiada gente para que sea una liquidación sin cargar. '
          + 'Confirmá que el Tabulado sea del mismo período y que traiga todas las liquidaciones del mes '
          + 'antes de revisar legajo por legajo.',
      };
    }
    return {
      tone: 'warn',
      title: 'Está activo en Rep. Categ. y no liquidó en el Tabulado',
      text: (e.fAlta ? `Figura con alta el ${e.fAlta}. ` : '')
        + 'Si entró después del cierre o estuvo el mes entero sin liquidar, está bien que no aparezca. '
        + 'Si no, falta su liquidación en el Tabulado: no se puede comparar ninguno de sus campos.',
    };
  }

  const n = results.missingInCat.length;
  if (ausenciaMasiva('cat', results)) {
    return {
      tone: 'warn',
      title: `${fmtInt(n)} de ${fmtInt(summary.tabTotal)} legajos del Tabulado no están en Rep. Categ.`,
      text: 'No parece de este empleado: el reporte de Categorías está incompleto. Volvé a bajarlo sin '
        + 'filtros antes de revisar legajo por legajo.',
    };
  }
  return {
    tone: 'warn',
    title: 'Liquidó en el Tabulado y el Rep. Categ. no lo tiene, ni activo ni como baja',
    text: 'O el reporte se bajó con un filtro puesto, o el legajo no está dado de alta en el sistema. '
      + 'Confirmá cuál de las dos: si estuviera dado de baja el control no lo marcaría, así que esto no es una baja.',
  };
}

// ── La solapa Fichas ────────────────────────────────────────────────────────

function renderCatXEmpleadosFichas(panel, { fichas, results }) {
  // El segundo eje, igual que en la planilla: de qué tipo es el caso, en qué
  // campo, y si el campo huele a carga masiva.
  const camposConDif = [...new Set(fichas.flatMap(f => f.diffLabels))];

  renderFichasPanel(panel, {
    fichas,
    unitLabel: 'legajos',
    estadoDe: f => f.estado,
    noAplica: NO_APLICA_CAT,
    marcas: [
      { value: 'sinTab', label: CASO.sinTab, match: f => f.caso === CASO.sinTab },
      { value: 'sinCat', label: CASO.sinCat, match: f => f.caso === CASO.sinCat },
      ...camposConDif.map(l => ({ value: `campo:${l}`, label: l, match: f => f.diffLabels.includes(l) })),
      { value: 'masivo', label: 'Puede ser una carga masiva', match: f => f.masivo },
    ],
    ordenes: [
      // Los que no se pudieron comparar (`difieren === null`) van al final: no
      // es que tengan cero campos mal, es que no se sabe.
      { value: 'campos', label: 'Más campos distintos',
        compare: (a, b) => (b.difieren ?? -1) - (a.difieren ?? -1) },
      { value: 'legajo', label: 'Legajo',
        compare: (a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }) },
      { value: 'nombre', label: 'Nombre',
        compare: (a, b) => String(a.name).localeCompare(String(b.name)) },
    ],
    getLabel: f => `${f.id} — ${f.name}`,
    // El KPI de la selección cuenta campos, no pesos: por eso va sin decimales.
    getAmount: f => f.difieren,
    amountLabel: 'Σ campos que no coinciden',
    amountDecimals: 0,
    onExport: (exportEl) => montarExport(exportEl, results),
  });
}

// ── La planilla (§5 de specs/vista-estandar-resultados.md) ───────────────────
//
// **Sin bandas y sin TOTAL**, y no por olvido: este control no compara importes
// sino campos de texto (puesto, centro de costo, departamento) y la presencia de
// cada empleado en cada archivo. No hay nada que agrupar en rubros ni nada que
// totalizar — una fila de TOTAL acá sería un número inventado.
//
// Las tres listas que antes eran tres tablas separadas —cada una con su propio
// buscador— ahora son una sola planilla con una fila por caso y una columna que
// dice qué le pasa. Es lo que permite que haya UNA barra: un buscador que
// encuentra un legajo esté en la lista que esté, un solo ⬇ Exportar ▾, y los
// cinco chips diciendo cuántos casos son de cada tipo.
//
// Qué significa cada chip en un control que no compara importes:
//   Con diferencia → el empleado está en los dos archivos y un campo no coincide
//   Sin comparar   → el empleado está en uno solo de los dos: no hay con qué
//                    comparar sus campos (§3 — "falta un lado")
//   Al centavo / Dentro del margen → no aplican: acá un campo coincide o no
//                    coincide, no hay un monto que tolerar

const NO_APLICA_CAT = {
  margen:  'compara campos de texto (puesto, centro de costo, departamento) y no importes, '
    + 'así que no hay un monto de diferencia que tolerar',
  centavo: 'compara campos de texto y no importes: un campo coincide o no coincide. '
    + 'Los empleados que coinciden en todo no se listan',
};

const CASO = {
  sinTab: 'No está en el Tabulado',
  sinCat: 'No está en Rep. Categ. activos',
  campo:  'Un campo no coincide',
};

/** Una fila por caso: las tres listas de diferencias, en una sola planilla. */
function casosDeCruce({ missingInTab, missingInCat, fieldDiscrepancies }) {
  return [
    ...missingInTab.map(r => ({
      caso: CASO.sinTab,
      id: r.id,
      empleado: [r.apellido, r.nombre].filter(Boolean).join(' '),
      campo: null, valorCat: null, valorTab: null,
      fAlta: r.fAlta || null,
      estado: 'sinComparar',
    })),
    ...missingInCat.map(r => ({
      caso: CASO.sinCat,
      id: r.id,
      empleado: r.apellidoNombre,
      campo: null, valorCat: null, valorTab: null, fAlta: null,
      estado: 'sinComparar',
    })),
    // Una fila por (empleado, campo con diferencia): es la unidad que el
    // analista revisa, y es también la que se aplanaba antes en su tabla.
    ...fieldDiscrepancies.flatMap(e => e.diffs.map(d => ({
      caso: CASO.campo,
      id: e.id,
      empleado: [e.apellido, e.nombre].filter(Boolean).join(' '),
      // `d.label` es de esta versión; una corrida vieja sólo tiene el código.
      campo: d.label ?? d.field, valorCat: d.cat, valorTab: d.tab, fAlta: null,
      estado: 'conDif',
    }))),
  ];
}

function renderCatXEmpleadosPlanilla(container, results) {
  const { byPuesto, byCC } = results;
  const casos = casosDeCruce(results);
  const conFAlta = casos.some(c => c.fAlta);

  const columns = [
    // Sin sublabel: la columna del legajo va congelada y mide 74 px, así que
    // cualquier base de cálculo se corta con puntos suspensivos.
    { key: 'id',       label: 'Legajo' },
    { key: 'empleado', label: 'Empleado', sub: 'del Rep. Categ. o del Tabulado' },
    { key: 'caso',     label: 'Qué pasa', sub: 'el cruce por legajo' },
    ...(conFAlta ? [{ key: 'fAlta', label: 'F. Alta', sub: 'del Rep. Categ.' }] : []),
    { key: 'campo',    label: 'Campo',    sub: 'el que no coincide' },
    { key: 'valorCat', label: 'Valor en Rep. Categ.', sub: 'tal cual figura en el archivo' },
    { key: 'valorTab', label: 'Valor en Tabulado',    sub: 'tal cual figura en el archivo' },
  ];

  // El segundo eje: de qué tipo es el caso y —cuando es un campo— cuál.
  const campos = [...new Set(casos.map(c => c.campo).filter(Boolean))];
  const marcas = [
    { value: 'sinTab', label: CASO.sinTab, match: c => c.caso === CASO.sinTab },
    { value: 'sinCat', label: CASO.sinCat, match: c => c.caso === CASO.sinCat },
    ...campos.map(f => ({ value: `campo:${f}`, label: f, match: c => c.campo === f })),
  ];

  // Sin ni un caso no hay planilla —ni chips, ni buscador, que no filtrarían
  // nada— pero sí hay distribuciones y hay que poder exportar igual.
  if (casos.length === 0) {
    const barra = document.createElement('div');
    barra.className = 'results-toolbar';
    barra.style.justifyContent = 'flex-end';
    container.appendChild(barra);
    montarExport(barra, results);

    const ok = document.createElement('p');
    ok.className = 'text-muted';
    ok.style.cssText = 'padding:var(--sp-4);';
    ok.textContent = 'El Rep. Categ. y el Tabulado coinciden en empleados y campos: '
      + 'no hay ningún caso para revisar.';
    container.appendChild(ok);
    renderDistribuciones(container, { byPuesto, byCC });
    return;
  }

  renderPlanillaPanel(container, {
    columns,
    rows: casos,
    unitLabel: 'casos',
    bands: false,
    totals: false,
    estadoDe: c => c.estado,
    noAplica: NO_APLICA_CAT,
    marcas,
    getLabel: c => `${c.id} — ${c.empleado}${c.campo ? ` — ${c.campo}` : ''}`,
    searchLabel: 'Buscar empleado',
    searchPlaceholder: 'Legajo o nombre…',
    stickyCols: 2,
    afterTable: (host) => renderDistribuciones(host, { byPuesto, byCC }),
    onExport: (exportEl) => montarExport(exportEl, results),
  });
}

// ── Las dos distribuciones (por puesto y por centro de costo) ────────────────
// No son parte de la planilla: son dos agregados de pocas filas que se leen
// aparte, y por eso conservan su propio "sólo con diferencia / todos".

function renderDistribuciones(host, { byPuesto, byCC }) {
  const sec = document.createElement('div');
  sec.innerHTML = distSection(byPuesto, 'Puesto', 'Distribución por Puesto', 'puesto')
    + distSection(byCC, 'Centro de Costo', 'Distribución por Centro de Costo', 'cc');
  host.appendChild(sec);
  wireDistToggle(sec, 'puesto', byPuesto, 'Puesto');
  wireDistToggle(sec, 'cc', byCC, 'Centro de Costo');
}

const SUM_STYLE = [
  'cursor:pointer', 'list-style:none', 'display:flex', 'align-items:center',
  'gap:var(--sp-2)', 'padding:var(--sp-2) 0', 'font-weight:600',
  'color:var(--color-primary)', 'font-size:var(--text-base)',
  'border-bottom:1px solid var(--color-border)', 'margin-bottom:var(--sp-3)',
].join(';');

function distRow(r) {
  if (r.diff === 0) {
    return `
      <tr>
        <td>${esc(r.key)}</td>
        <td style="text-align:right;">${r.catCount}</td>
        <td style="text-align:right;">${r.tabCount}</td>
        <td style="text-align:right;">—</td>
      </tr>
    `;
  }

  const soloEn = (titulo, lista) => lista.length === 0 ? '' : `
    <div style="margin-top:var(--sp-2);">
      <strong style="font-size:var(--text-sm);">${esc(titulo)} (${lista.length}):</strong>
      <table class="data-table data-table--compact" style="margin-top:var(--sp-1);">
        <thead><tr><th>Legajo</th><th>Empleado</th></tr></thead>
        <tbody>
          ${lista.map(e => `<tr><td>${esc(e.id)}</td><td>${esc(e.nombre)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  return `
    <tr style="background:var(--color-warning-bg);">
      <td>
        <details>
          <summary style="cursor:pointer;">${esc(r.key)}</summary>
          <div style="padding:var(--sp-2) var(--sp-3) var(--sp-3);">
            ${soloEn('Solo en Rep. Categ.', r.onlyInCat)}
            ${soloEn('Solo en Tabulado', r.onlyInTab)}
          </div>
        </details>
      </td>
      <td style="text-align:right;">${r.catCount}</td>
      <td style="text-align:right;">${r.tabCount}</td>
      <td style="text-align:right;font-weight:600;color:var(--color-danger);">${r.diff > 0 ? '+' : ''}${r.diff}</td>
    </tr>
  `;
}

function distTable(rows, labelCol) {
  return `
    <div style="overflow-x:auto;">
      <table class="data-table data-table--compact">
        <thead>
          <tr>
            <th>${esc(labelCol)}</th>
            <th style="text-align:right;">Rep. Categ.</th>
            <th style="text-align:right;">Tabulado</th>
            <th style="text-align:right;">Dif.</th>
          </tr>
        </thead>
        <tbody>${rows.map(distRow).join('')}</tbody>
      </table>
    </div>
  `;
}

/**
 * Por default sólo se muestran las filas con diferencia — el resto coincide 1:1
 * y listarlas no aporta nada. Un desplegable deja ver el universo completo.
 * **No lleva `data-chips`**: la fila de chips es la de los cinco estados y nada
 * más, en las 21 pantallas (§3).
 */
function distSection(allRows, labelCol, title, key) {
  if (allRows.length === 0) return '';
  const conDif = allRows.filter(r => r.diff !== 0);
  const okCount = allRows.length - conDif.length;
  const iniciales = conDif.length > 0 ? conDif : allRows;
  const toggle = conDif.length > 0 && okCount > 0 ? `
    <div style="margin-bottom:var(--sp-2);">
      <select class="form-select form-select--sm" data-dist-toggle="${key}" aria-label="${esc(title)}">
        <option value="dif">Sólo con diferencia (${conDif.length})</option>
        <option value="all">Todos (${allRows.length})</option>
      </select>
    </div>` : '';
  return `
    <div style="margin-bottom:var(--sp-6);">
      <details open>
        <summary style="${SUM_STYLE}">${esc(`${title} (${allRows.length}${okCount > 0 ? ` · ${okCount} sin diferencia` : ''})`)}</summary>
        ${toggle}<div data-dist-body="${key}">${distTable(iniciales, labelCol)}</div>
      </details>
    </div>
  `;
}

function wireDistToggle(root, key, allRows, labelCol) {
  const sel = root.querySelector(`[data-dist-toggle="${key}"]`);
  const body = root.querySelector(`[data-dist-body="${key}"]`);
  if (!sel || !body) return;
  const conDif = allRows.filter(r => r.diff !== 0);
  sel.addEventListener('change', () => {
    body.innerHTML = distTable(sel.value === 'dif' ? conDif : allRows, labelCol);
  });
}

// ── La solapa "Por campo": la matriz campo × legajo ─────────────────────────
//
// **No es una planilla de totales, y no reemplaza a la Planilla**: contesta otra
// pregunta. La Planilla lista los casos uno por uno y la Ficha explica uno; acá
// las filas son los CAMPOS, y cada uno dice en cuántos legajos no coincide.
//
// Es lo que hoy no se puede contestar sin exportar y contar a mano: **¿esto le
// pasa a un empleado o a todos?**. Si "Centro de costo" no coincide en 80 de 100
// legajos, no hay 80 errores de carga — hay un archivo mal armado, y revisarlo
// legajo por legajo es trabajo tirado. Va ordenada de peor a mejor para que ese
// campo sea la primera fila.
//
// Sin fila de TOTAL a propósito: sumar "legajos comparados" de tres campos daría
// 300 sobre 100 empleados, que es un número inventado. Y sin la barra estándar,
// que es de las solapas Fichas y Planilla (§3): son tres filas, no hay nada que
// buscar ni que paginar.

const COLS_POR_CAMPO = [
  { key: 'label',       label: 'Campo',                sub: 'del Rep. Categ. contra el Tabulado' },
  { key: 'difieren',    label: 'No coinciden',         sub: 'legajos', num: true,
    cell: r => esc(fmtInt(r.difieren)) },
  { key: 'pct',         label: 'Sobre los comparados', sub: '% de los que se pudieron mirar', num: true,
    cell: r => r.pct === null ? '—' : esc(fmtPct(r.pct)) },
  { key: 'coinciden',   label: 'Coinciden',            sub: 'legajos', num: true,
    cell: r => esc(fmtInt(r.coinciden)) },
  { key: 'comparados',  label: 'Comparados',           sub: 'están en los dos archivos', num: true,
    cell: r => esc(fmtInt(r.comparados)) },
  { key: 'sinComparar', label: 'Sin comparar',         sub: 'están en un solo archivo', num: true,
    cell: r => esc(fmtInt(r.sinComparar)) },
  { key: 'lectura',     label: 'Qué parece',           sub: 'carga masiva o caso puntual',
    cell: r => lecturaDeCampo(r) },
];

/** La lectura de la fila, en una palabra: es lo que el analista viene a buscar. */
function lecturaDeCampo(r) {
  if (!r.comparable) {
    return '<span class="badge badge--neutral">No se pudo comparar</span>';
  }
  if (r.difieren === 0) return '<span class="badge badge--success">Coincide en todos</span>';
  if (r.masivo)         return '<span class="badge badge--danger">Parece una carga masiva</span>';
  return '<span class="badge badge--warning">Casos puntuales</span>';
}

function renderPorCampo(panel, results) {
  const { byField, universo, matchedCount, summary } = results;

  if (universo === 0) {
    panel.innerHTML = '<p class="text-muted" style="padding:var(--sp-4);">'
      + 'No hay ningún legajo para cruzar en esta corrida.</p>';
    return;
  }

  const nota = document.createElement('p');
  nota.className = 'text-muted';
  nota.style.cssText = 'font-size:var(--text-sm);padding:var(--sp-3) var(--sp-3) 0;';
  nota.textContent = `El cruce mira ${plural(byField.length, 'campo')} sobre ${plural(universo, 'legajo')}: `
    + `${fmtInt(matchedCount)} ${matchedCount === 1 ? 'está' : 'están'} en los dos archivos `
    + `y ${fmtInt(universo - matchedCount)} en uno solo. `
    + 'Un campo sólo se puede comparar en los que están en los dos: el resto queda en "sin comparar", '
    + 'que no es lo mismo que coincidir.';
  panel.appendChild(nota);

  const tableHost = document.createElement('div');
  panel.appendChild(tableHost);
  renderRubroGrid(tableHost, {
    columns: COLS_POR_CAMPO,
    rows: byField,
    unitLabel: 'campos',
    bands: false,
    totals: false,
    stickyCols: 1,
  });

  const sinComparar = universo - matchedCount;
  if (sinComparar > 0) {
    const pie = document.createElement('p');
    pie.className = 'text-muted';
    pie.style.cssText = 'font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);';
    pie.textContent = `Sin comparar quedan ${plural(sinComparar, 'legajo')}: `
      + `${fmtInt(summary.missingInTabCount)} en Rep. Categ. y no en el Tabulado, `
      + `${fmtInt(summary.missingInCatCount)} en el Tabulado y no en Rep. Categ. `
      + 'Cada uno tiene su ficha, con el chip "Sin comparar" puesto.';
    panel.appendChild(pie);
  }
}

// ── El menú de exportar, uno solo para las dos solapas con barra ─────────────
//
// El .xlsx trae las dos distribuciones (Puesto/CC) en hojas separadas; el CSV y
// el copiar las aplanan en una sola tabla. No incluyen las listas de diferencias
// de la pantalla, que son de revisión y no del entregable.

const CSV_HEADERS_CAT = ['Agrupador', 'Valor', 'Rep. Categ.', 'Tabulado', 'Dif.'];

function montarExport(exportEl, results) {
  const csvRows = () => [
    ...results.byPuesto.map(r => ['Puesto', r.key, r.catCount, r.tabCount, r.diff]),
    ...results.byCC.map(r => ['Centro de Costo', r.key, r.catCount, r.tabCount, r.diff]),
  ];
  return renderExportMenu(exportEl, {
    onExcel: () => exportCatXEmpleadosToXlsx(results),
    onCsv:   () => downloadCsv(CSV_HEADERS_CAT, csvRows(), `EE_x_CATEG_${periodSuffix(results.period)}.csv`),
    onCopy:  () => copyRowsToClipboard(CSV_HEADERS_CAT, csvRows()),
  });
}

// ── Export a Excel ────────────────────────────────────────────────────────────

// Migrado a `writeContractSheet` (specs/contrato-export.md, "Lo que falta para
// migrar los writers del Paso 6" — D-047). `contracts.js` no importa nada de
// este archivo (no hay ciclo posible), pero se usa `import()` dinámico igual
// que el resto de los exports del Paso 6, por prolijidad.
async function exportCatXEmpleadosToXlsx(results) {
  await loadExcelJS();
  const { byPuesto, byCC } = results;
  const { EXPORT_CONTRACTS } = await import('../exports/contracts.js');
  const { writeContractSheet, numericValue } = await import('../exports/contractSheet.js');

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  // ── Hojas: Distribuciones (Puesto y CC) ────────────────────────────────────
  addDistributionSheet(wb, EXPORT_CONTRACTS.cat_x_empleados_puesto, 'Puesto',          byPuesto, writeContractSheet, numericValue);
  addDistributionSheet(wb, EXPORT_CONTRACTS.cat_x_empleados_cc,     'Centro de Costo', byCC,     writeContractSheet, numericValue);

  await downloadWorkbook(wb, `EE_x_CATEG_${periodSuffix(results.period)}.xlsx`);
}

/**
 * "Dif." y la fila de TOTAL siguen siendo fórmulas de Excel (`=B2-C2`,
 * `SUM(...)`) — más auditables para el cliente que un valor cacheado a mano
 * (D-047). El número de fila se deriva de la posición (1 encabezado + `i`),
 * no de `ws.addRow` a mano, porque `writeContractSheet` es quien escribe las
 * filas ahora.
 */
function addDistributionSheet(wb, contract, labelCol, rows, writeContractSheet, numericValue) {
  const HDR_BG = 'FFE8E8E8';
  const dataRows = rows.map((r, i) => {
    const rn = 2 + i; // fila 1 = encabezado
    return { key: r.key, catCount: r.catCount, tabCount: r.tabCount,
      diff: { formula: `B${rn}-C${rn}`, result: r.diff } };
  });

  let totalRow = null;
  if (rows.length > 0) {
    const first = 2;
    const last  = 1 + rows.length;
    const tn    = 2 + rows.length;
    totalRow = {
      key: 'TOTAL',
      catCount: { formula: `SUM(B${first}:B${last})`, result: rows.reduce((s, r) => s + r.catCount, 0) },
      tabCount: { formula: `SUM(C${first}:C${last})`, result: rows.reduce((s, r) => s + r.tabCount, 0) },
      diff:     { formula: `B${tn}-C${tn}`,           result: rows.reduce((s, r) => s + r.diff, 0) },
    };
  }

  const ws = writeContractSheet(wb, contract, dataRows, {
    totalRow,
    highlightIf: r => numericValue(r.diff) !== 0,
    highlightColor: 'FFFFF4E5',
  });

  // Detalle de diferencias debajo — no es una tabla de contrato (filas
  // variables, sin `key` fijo), sigue armándose a mano sobre la misma hoja.
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const styleHeader = (row) => {
    row.height = 20;
    row.eachCell(cell => {
      cell.font      = bold;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill      = solidFill(HDR_BG);
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
    });
  };

  const hasDetail = rows.some(r => r.onlyInCat.length > 0 || r.onlyInTab.length > 0);
  if (!hasDetail) return;

  ws.addRow([]);
  const titleRow = ws.addRow(['Detalle de diferencias']);
  titleRow.getCell(1).font = bold;

  const detailHdr = ws.addRow([labelCol, 'Origen', 'ID', 'Empleado']);
  styleHeader(detailHdr);

  for (const r of rows) {
    if (r.diff === 0) continue;
    for (const e of r.onlyInCat) {
      const dr = ws.addRow([r.key, 'Solo en Rep. Categ.', e.id, e.nombre]);
      dr.eachCell(cell => { cell.font = base; });
    }
    for (const e of r.onlyInTab) {
      const dr = ws.addRow([r.key, 'Solo en Tabulado', e.id, e.nombre]);
      dr.eachCell(cell => { cell.font = base; });
    }
  }
}

// ── Helpers internos ──────────────────────────────────────────────────────────

/** Agrupa filas por groupCol, indexando por idCol → displayFn(row).
 *  `keyOf` es la clave de legajo del cliente (D-038) y se usa para deduplicar. */
function groupByKey(rows, groupCol, idCol, displayFn, keyOf) {
  const map = new Map();
  if (!groupCol || !idCol) return map;
  for (const r of rows) {
    const key = norm(r[groupCol]) || '(sin valor)';
    if (!map.has(key)) map.set(key, new Map());
    const id = keyOf(r[idCol]);
    if (id) map.get(key).set(id, displayFn(r));
  }
  return map;
}

/** Fusiona dos Maps en array { key, catCount, tabCount, diff, onlyInCat, onlyInTab } */
function mergeAggregations(catGroupMap, tabGroupMap) {
  const keys = new Set([...catGroupMap.keys(), ...tabGroupMap.keys()]);
  return [...keys].sort().map(key => {
    const catMap = catGroupMap.get(key) ?? new Map();
    const tabMap = tabGroupMap.get(key) ?? new Map();
    const diff   = catMap.size - tabMap.size;
    const onlyInCat = diff !== 0
      ? [...catMap.entries()].filter(([id]) => !tabMap.has(id)).map(([, d]) => d)
      : [];
    const onlyInTab = diff !== 0
      ? [...tabMap.entries()].filter(([id]) => !catMap.has(id)).map(([, d]) => d)
      : [];
    return { key, catCount: catMap.size, tabCount: tabMap.size, diff, onlyInCat, onlyInTab };
  });
}

/** Formatea fechas: acepta serial de Excel (número) o string */
function fmtDate(val) {
  if (val == null || String(val).trim() === '') return '';
  if (typeof val === 'number' && val > 1000) {
    const d = new Date(Math.round((val - 25569) * 86400000));
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return String(val).trim();
}

function norm(v) { return v != null ? String(v).trim() : ''; }

/** Un conteo de legajos: entero, con el separador de miles de acá. */
function fmtInt(n) { return Math.round(n || 0).toLocaleString('es-AR'); }

/** '1 legajo' / '5 legajos': un conteo que se lee adentro de una oración. */
function plural(n, singular, muchos = `${singular}s`) {
  return `${fmtInt(n)} ${n === 1 ? singular : muchos}`;
}

/** El porcentaje de la matriz: sin decimales cuando es redondo, con uno cuando
 *  es chico — "0 %" para 1 de 500 diría que no falla en ninguno. */
function fmtPct(v) {
  return `${(v * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
