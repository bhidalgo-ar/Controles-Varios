// novedadesImportador.js — Generador del importador de novedades de Axton (N1)
//
// El analista sube la planilla de novedades del cliente y la app arma el
// importador `F2_Consolidada` listo para subir a Axton, con el formato de celda
// `cantidad$importe`. Es el frente N1 de la familia de Novedades
// (`specs/familia-novedades-axton.md`, D-070): el error de transcripción
// planilla → importador desaparece por diseño en vez de detectarse después.
//
// **La pantalla de validación es parte del control, no un extra.** Antes de
// descargar nada, el analista ve QUÉ va a entrar al F2 —por legajo, por concepto
// y con sus totales— y QUÉ quedó afuera y por qué. Nada se ignora en silencio
// (D-070): una columna sin código con datos cargados, una fila sin legajo o un
// valor que no es un número salen listados con su motivo, no se descartan.
//
// Cuatro reglas que no se deducen leyendo el código:
//
//   · **El criollo nunca decide solo** (D-039). Si la columna trae código, se
//     usa ése. Si trae sólo el nombre en criollo, el código sale de lo que el
//     analista confirmó en el Paso 2 (`controlConfigs` por
//     `[clientCode+controlId]`) — el catálogo de conceptos del cliente puede
//     sugerirlo, pero la sugerencia no entra al F2 hasta que se la confirma.
//     Hay 17 códigos con rótulo distinto entre dos archivos del mismo cliente y
//     mes: matchear por nombre agarra el equivocado.
//   · **El mapeo se guarda por rótulo, no por letra de columna.** El juego de
//     conceptos cambia mes a mes (Epiroc: 12 columnas en junio, 11 en julio, y
//     se corre todo una letra), así que una config por posición queda mal al mes
//     siguiente sin que nada avise.
//   · **Consolidación por legajo** con `makeLegajoKey` (D-038): la planilla puede
//     traer el mismo empleado en dos filas. Se suman cantidad e importe; una
//     celda vacía no viaja al F2 (no es cero) y `null` no es `0`.
//   · **El archivo lo recibe el analista, no Finanzas.** Puede llevar legajo y
//     nombre; CUIL y CBU no salen de la planilla ni al F2 (D-020).
//
// **El importador ya armado es opcional y sirve para controlar lo generado.** Si
// el analista lo carga, el control compara por legajo + código y devuelve cuatro
// bandas: coincide, difiere, sólo en la planilla del cliente y sólo en el
// importador armado. La tercera es el caso que originó este frente —un empleado
// que estaba en la planilla del cliente y no llegó al importador, sin registro de
// por qué— y por eso sale marcada y no escondida. Sin ese archivo no hay
// comparación, y el resultado lo dice: no es "todo coincide".
//
// Lo que este control NO hace: no cruza nada contra la liquidación (eso es N2),
// no convierte unidades (D-065) y no deduce el período — lo declara el analista
// en el selector de la app.

import { groupRowsByLegajo } from './consolidate.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { renderResumenDetalle, renderVerdict, renderTiles, renderIssues, renderChecks }
  from '../ui/resultBlocks.js';
import { createResultsToolbar, wireTableTools } from '../ui/tableTools.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { periodSuffix } from '../utils/dates.js';

/**
 * Config del control, guardada por cliente en `controlConfigs` (D-035).
 * Devuelve una copia nueva: el editor del Paso 2 la muta en el lugar.
 */
export const DEFAULT_NOVEDADES_CONFIG = () => ({
  // Unidad organizativa del importador. Se usa la del archivo cuando el archivo
  // la trae; esto es para cuando no la trae (Epiroc, Merz y Geopagos declaran
  // Empresa y no UO) o cuando el analista la corrige.
  uoNro:    '',
  uoNombre: '',
  // rótulo normalizado → código de concepto, confirmado por el analista.
  codigoPorRotulo: {},
  // Rótulos que el analista marcó "no va al importador" (la columna
  // "Observaciones" de Merz, las notas del analista). Quedan afuera a propósito
  // y se informan como tal, no como problema.
  rotulosExcluidos: [],
});

// Cuadre del archivo generado, contra la planilla leída y contra el importador
// ya armado: son chequeos ESTRUCTURALES —¿entró todo lo que se leyó?, ¿dice lo
// mismo que lo que se subió?— y no el monto de diferencia que el analista
// configura por cliente (D-069). Los dos lados son el mismo dato del mismo mes:
// un centavo de diferencia es un error de armado, no una diferencia de criterio,
// y subir el umbral taparía justamente lo que hay que ver. Además del importe se
// comparan cantidades (horas, días): medirlas con un monto en pesos escondería
// tres horas de diferencia detrás de un umbral de $ 100.
const CUADRE_EPS = 0.01;

/**
 * Normaliza un rótulo en criollo para poder guardarlo como clave del mapeo:
 * mayúsculas, sin acentos, espacios (incluido el duro U+00A0) colapsados. No es
 * para decidir qué concepto es: es para reconocer el MISMO rótulo entre el
 * archivo de este mes y lo que el analista confirmó el mes pasado.
 */
export function normalizarRotulo(v) {
  return String(v ?? '')
    .replace(/\u00a0/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * El valor de una celda del F2, tal como lo espera Axton.
 *
 * `cantidad$importe` pegados en una celda es el formato normal del importador
 * (visto en Coelsa, Merz, Epiroc, Geopagos y SIASA), no un error de tipeo. Sale
 * como TEXTO porque es texto: si Excel lo interpretara, `1$500` se volvería una
 * moneda. Una cantidad sola sale como número.
 *
 * @returns {string|number|null} `null` si no hay nada que escribir — una celda
 *   vacía no viaja al F2, y no es cero.
 */
export function celdaF2({ cantidad, importe }) {
  if (importe !== null && importe !== undefined) {
    const izq = (cantidad === null || cantidad === undefined) ? '' : numeroF2(cantidad);
    return `${izq}$${numeroF2(importe)}`;
  }
  if (cantidad === null || cantidad === undefined) return null;
  return cantidad;
}

/** Número con coma decimal y sin separador de miles, como lo escribe Axton. */
function numeroF2(n) {
  const s = String(n);
  // `String()` cae en notación científica con magnitudes extremas; un importe de
  // sueldo nunca llega ahí, pero un archivo raro sí, y `1e-7` no es un importe.
  const plano = s.includes('e') || s.includes('E') ? Number(n).toFixed(12).replace(/0+$/, '').replace(/\.$/, '') : s;
  return plano.replace('.', ',');
}

/** Suma que respeta `null`: si ninguna fila trajo dato, el total es `null`, no `0`. */
function sumaNullable(valores) {
  let total = null;
  for (const v of valores) {
    if (v === null || v === undefined) continue;
    total = (total ?? 0) + v;
  }
  return total;
}

// ── El control ────────────────────────────────────────────────────────────────

/**
 * @param {object[]} novRows  parsedRows del lector ExpNov (una fila por celda cargada)
 * @param {object[]} _tabRows sin uso: este control no depende del Tabulado
 * @param {object}   mapping  { period, legajoKeyMode, novedadesMeta, novedadesConfig,
 *   f2ArmadoRows? } — `f2ArmadoRows` son las filas del importador ya armado, el
 *   archivo opcional contra el que se controla lo generado.
 */
export function runNovedadesImportador(novRows, _tabRows, mapping) {
  const meta = mapping.novedadesMeta || {};
  const cfg  = { ...DEFAULT_NOVEDADES_CONFIG(), ...(mapping.novedadesConfig || {}) };

  if (!novRows?.length && !(meta.celdasSinCodigo || []).length) {
    return { error: 'La planilla de novedades no trae ninguna novedad cargada: todas las celdas de concepto están vacías.' };
  }

  const keyFn = makeLegajoKey(mapping.legajoKeyMode);
  const excluidos = new Set((cfg.rotulosExcluidos || []).map(normalizarRotulo));
  const mapeoManual = {};
  for (const [rotulo, codigo] of Object.entries(cfg.codigoPorRotulo || {})) {
    const cod = String(codigo ?? '').trim();
    if (cod) mapeoManual[normalizarRotulo(rotulo)] = cod;
  }

  // ── Qué columna es qué concepto ─────────────────────────────────────────────
  // Primero las que traen código en el archivo; después las que el analista
  // resolvió en el Paso 2. Nada más: una columna sin código y sin confirmación
  // no entra al F2 con un código adivinado.
  const conceptos = new Map();   // codigo → { codigo, rotulo, origen, duplicado, codigoNoNumerico }
  for (const c of (meta.columnas || [])) {
    if (!conceptos.has(c.codigo)) {
      conceptos.set(c.codigo, {
        codigo: c.codigo, rotulo: c.rotulo || '', origen: 'archivo',
        duplicado: !!c.duplicado, codigoNoNumerico: !!c.codigoNoNumerico,
      });
    }
  }

  const columnasResueltas = [];   // columnas sin código que el analista mapeó
  const columnasAfuera    = [];   // las que siguen sin código
  const columnasExcluidas = [];   // las que el analista dejó afuera a propósito
  for (const c of (meta.columnasSinCodigo || [])) {
    if ((c.celdasCargadas || 0) === 0) continue;      // vacía: no hay nada que dejar afuera
    const clave  = normalizarRotulo(c.rotulo);
    const codigo = mapeoManual[clave];
    if (excluidos.has(clave)) { columnasExcluidas.push(c); continue; }
    if (codigo) {
      columnasResueltas.push({ ...c, codigo });
      if (!conceptos.has(codigo)) {
        conceptos.set(codigo, {
          codigo, rotulo: c.rotulo || '', origen: 'catalogo', duplicado: false, codigoNoNumerico: false,
        });
      }
      continue;
    }
    columnasAfuera.push(c);
  }

  // ── Las celdas que entran al F2 ─────────────────────────────────────────────
  // `parsedRows` (las que ya traían código) más las celdas de las columnas que
  // el analista resolvió. Las celdas resueltas que no son un número entran a
  // "quedó afuera": ahí sí importa, porque la columna ya tiene concepto.
  const codigoPorRotuloResuelto = new Map(columnasResueltas.map(c => [normalizarRotulo(c.rotulo), c.codigo]));
  const afuera = [];
  const celdas = novRows.map(r => ({ ...r }));

  for (const c of (meta.celdasSinCodigo || [])) {
    const clave  = normalizarRotulo(c.rotulo);
    const codigo = codigoPorRotuloResuelto.get(clave);
    if (!codigo) continue;                              // sin código o excluida: ya está contado por columna
    if (c.noParseable || (c.cantidad === null && c.importe === null)) {
      afuera.push({
        motivo: 'valor_no_parseable', legajo: c.legajo, rotulo: c.rotulo, codigo,
        letraCol: c.letraCol, fila: c.fila, texto: c.texto,
        detalle: c.noParseable || 'no se pudo leer como número',
      });
      continue;
    }
    celdas.push({
      legajo: c.legajo, codigo, cantidad: c.cantidad, importe: c.importe,
      unidadDeclarada: c.unidadDeclarada, fila: c.fila, col: c.col, letraCol: c.letraCol,
    });
  }

  // Los valores no parseables de columnas que YA tenían código los detectó el
  // lector: viajan tal cual, con su motivo.
  for (const v of (meta.noParseables || [])) {
    afuera.push({
      motivo: 'valor_no_parseable', legajo: null, rotulo: null, codigo: v.codigo || null,
      letraCol: v.letraCol, fila: v.fila, texto: v.texto, detalle: v.motivo,
    });
  }
  for (const c of columnasAfuera) {
    afuera.push({
      motivo: 'columna_sin_codigo', legajo: null, rotulo: c.rotulo || '(sin rótulo)', codigo: null,
      letraCol: c.letra, fila: null, texto: null, celdas: c.celdasCargadas,
      detalle: `${c.celdasCargadas} celda${c.celdasCargadas === 1 ? '' : 's'} cargada${c.celdasCargadas === 1 ? '' : 's'} sin código de concepto`,
    });
  }
  for (const f of (meta.filasSinLegajo || [])) {
    afuera.push({
      motivo: 'fila_sin_legajo', legajo: null, rotulo: null, codigo: null,
      letraCol: null, fila: f, texto: null,
      detalle: 'la fila trae datos pero no tiene legajo (suele ser un total al pie o una nota)',
    });
  }

  // ── Consolidación por legajo ────────────────────────────────────────────────
  // La planilla puede traer el mismo empleado en dos filas. Se suma, no se pisa
  // — es el bug más caro del repo (D-042). La clave de legajo es la del cliente
  // (D-038) y se resuelve una vez por corrida.
  const nombrePorLegajo = new Map();
  for (const e of (meta.empleados || [])) {
    const k = keyFn(e.legajo);
    if (k && !nombrePorLegajo.has(k)) nombrePorLegajo.set(k, e.apellidoNombre || '');
  }

  const grupos = groupRowsByLegajo(celdas, 'legajo', { keyFn });
  const avisosControl = [];
  const filas = [];
  let legajosConsolidados = 0;

  for (const [clave, group] of grupos) {
    // El legajo se escribe en el F2 tal como lo trae la planilla, no
    // normalizado: Axton lo espera como lo conoce el cliente. Si la planilla lo
    // escribe de dos formas distintas ('007' y '7'), se avisa — se consolidó
    // igual, pero alguien tiene que mirarlo.
    const literales = [...new Set(group.map(r => String(r.legajo)))];
    if (literales.length > 1) {
      avisosControl.push(
        `El mismo empleado aparece escrito de ${literales.length} formas distintas en la planilla `
        + `(${literales.map(l => `"${l}"`).join(', ')}): se consolidó como uno solo. `
        + 'Revisá cuál es la forma que espera Axton.'
      );
    }

    const porConcepto = new Map();
    for (const r of group) {
      if (!porConcepto.has(r.codigo)) porConcepto.set(r.codigo, []);
      porConcepto.get(r.codigo).push(r);
    }
    const valores = new Map();
    let repetido = false;
    for (const [codigo, rows] of porConcepto) {
      if (rows.length > 1) repetido = true;
      valores.set(codigo, {
        cantidad: sumaNullable(rows.map(r => r.cantidad)),
        importe:  sumaNullable(rows.map(r => r.importe)),
        // Con dos filas del mismo legajo la unidad declarada puede diferir; se
        // informa la de la última celda leída, que es la que gana el formato.
        unidadDeclarada: rows[rows.length - 1].unidadDeclarada,
        celdas: rows.length,
      });
    }
    if (repetido) legajosConsolidados++;

    filas.push({
      legajo: literales[0],
      clave,
      nombre: nombrePorLegajo.get(clave) || '',
      valores,
    });
  }

  // ── Totales por concepto ────────────────────────────────────────────────────
  const conceptosOrdenados = [...conceptos.values()].sort(porCodigo);
  const totales = conceptosOrdenados.map(c => {
    const conValor = filas.filter(f => f.valores.has(c.codigo));
    return {
      ...c,
      legajos:       conValor.length,
      cantidadTotal: sumaNullable(conValor.map(f => f.valores.get(c.codigo).cantidad)),
      importeTotal:  sumaNullable(conValor.map(f => f.valores.get(c.codigo).importe)),
    };
  }).filter(c => c.legajos > 0);

  // Un concepto con columna en la planilla pero sin ninguna celda cargada no es
  // un error: es un concepto que este mes no se liquidó (D-036). No entra al F2
  // y se informa.
  const conceptosSinCarga = conceptosOrdenados.filter(c => !totales.some(t => t.codigo === c.codigo));

  // ── Cuadre: ¿entró todo lo que se leyó? ─────────────────────────────────────
  const celdasEnF2   = filas.reduce((acc, f) => acc + f.valores.size, 0);
  const celdasLeidas = celdas.length;
  const importeLeido = sumaNullable(celdas.map(r => r.importe));
  const importeF2    = sumaNullable(totales.map(t => t.importeTotal));
  const cantidadLeida = sumaNullable(celdas.map(r => r.cantidad));
  const cantidadF2    = sumaNullable(totales.map(t => t.cantidadTotal));

  // ── Contra el importador ya armado, si el analista lo cargó ─────────────────
  const contra = compararContraF2(filas, mapping.f2ArmadoRows || [], keyFn);

  const uo = resolverUo(meta, cfg);
  const legajosConAfuera = new Set(afuera.filter(a => a.legajo).map(a => keyFn(a.legajo)));
  // Una columna sin código con datos afecta a todos los legajos que tengan algo
  // cargado ahí: no se sabe a quién sin mirar las celdas, y para eso están.
  for (const c of (meta.celdasSinCodigo || [])) {
    const clave = normalizarRotulo(c.rotulo);
    if (excluidos.has(clave) || codigoPorRotuloResuelto.has(clave)) continue;
    if (c.legajo) legajosConAfuera.add(keyFn(c.legajo));
  }

  // Qué legajos tiene que mirar el analista antes de subir el importador: los
  // que tienen algo afuera, más los que difieren contra el importador ya armado.
  // Es una UNIÓN y no una suma: el mismo legajo puede estar en las dos listas.
  const legajosParaRevisar = new Set([...legajosConAfuera, ...(contra?.legajosConDif || [])]);

  return {
    period: mapping.period || '',
    uo,
    empresa: meta.empresa || null,
    sheetName: meta.sheetName || null,
    conceptos: totales,
    conceptosSinCarga,
    filas,
    afuera,
    columnasExcluidas: columnasExcluidas.map(c => ({ letra: c.letra, rotulo: c.rotulo, celdas: c.celdasCargadas })),
    contra,
    avisos: [...(meta.avisos || []), ...avisosControl],
    summary: {
      legajos:            filas.length,
      legajosConsolidados,
      legajosConAfuera:   legajosConAfuera.size,
      legajosParaRevisar: legajosParaRevisar.size,
      conceptos:          totales.length,
      conceptosSinCarga:  conceptosSinCarga.length,
      conceptosDelCatalogo: totales.filter(c => c.origen === 'catalogo').length,
      celdasEnF2,
      celdasLeidas,
      celdasAfuera:       afuera.filter(a => a.motivo === 'valor_no_parseable').length,
      columnasAfuera:     columnasAfuera.length,
      celdasSinCodigo:    columnasAfuera.reduce((acc, c) => acc + (c.celdasCargadas || 0), 0),
      filasSinLegajo:     (meta.filasSinLegajo || []).length,
      importeTotal:       importeF2,
      cantidadTotal:      cantidadF2,
      cuadraImporte:      cuadra(importeLeido, importeF2),
      cuadraCantidad:     cuadra(cantidadLeida, cantidadF2),
      importeLeido,
      cantidadLeida,
      // Contra el importador ya armado (sólo si se cargó).
      contraLegajosConDif: contra ? contra.legajosConDif.size : null,
      contraDifiere:       contra ? contra.difiere.length : null,
      contraSoloGenerado:  contra ? contra.soloGenerado.length : null,
      contraSoloArmado:    contra ? contra.soloArmado.length : null,
    },
  };
}

/**
 * El importador generado contra el que ya se armó a mano, por legajo + código.
 *
 * Consolida por legajo **los dos lados** con la misma clave (D-042): el archivo
 * ya armado puede traer el mismo legajo en dos filas igual que la planilla, y con
 * un lado sumado y el otro pisado el control informa diferencias que no existen.
 *
 * Cuatro bandas: coincide, difiere, sólo en el generado y sólo en el armado. La
 * tercera es el caso que originó este frente —un empleado que está en la
 * planilla del cliente y no llegó al importador— y por eso sale marcada, no
 * escondida.
 *
 * @returns {object|null} `null` cuando el analista no cargó el archivo: no hay
 *   comparación, y eso no es "todo coincide".
 */
function compararContraF2(filas, f2Rows, keyFn) {
  // Sin archivo no hay comparación, y eso NO es "todo coincide": el resultado lo
  // dice con `null` para que la pantalla no muestre cuatro bandas en cero.
  if (!f2Rows.length) return null;

  const armado = new Map();   // clave de legajo → Map(codigo → { cantidad, importe })
  for (const [clave, group] of groupRowsByLegajo(f2Rows, 'legajo', { keyFn })) {
    const porConcepto = new Map();
    for (const r of group) {
      if (!porConcepto.has(r.codigo)) porConcepto.set(r.codigo, { cantidad: null, importe: null });
      const acc = porConcepto.get(r.codigo);
      acc.cantidad = sumaNullable([acc.cantidad, r.cantidad]);
      acc.importe  = sumaNullable([acc.importe, r.importe]);
    }
    armado.set(clave, porConcepto);
  }

  const coincide = [], difiere = [], soloGenerado = [], soloArmado = [];
  const legajosConDif = new Set();
  const vistos = new Set();

  for (const f of filas) {
    const delArmado = armado.get(f.clave);
    for (const [codigo, v] of f.valores) {
      vistos.add(`${f.clave}|${codigo}`);
      const otro = delArmado?.get(codigo);
      if (!otro) {
        soloGenerado.push({ legajo: f.legajo, nombre: f.nombre, codigo, ...v });
        legajosConDif.add(f.clave);
        continue;
      }
      // `null` no es `0`: una cantidad ausente de un lado y presente del otro es
      // una diferencia, y dos ausentes no se comparan.
      const difCantidad = diferencia(v.cantidad, otro.cantidad);
      const difImporte  = diferencia(v.importe, otro.importe);
      const fila = {
        legajo: f.legajo, nombre: f.nombre, codigo,
        cantidadGenerada: v.cantidad, cantidadArmada: otro.cantidad, difCantidad,
        importeGenerado:  v.importe,  importeArmado:  otro.importe,  difImporte,
      };
      if (difCantidad === 'difiere' || difImporte === 'difiere'
          || (typeof difCantidad === 'number' && Math.abs(difCantidad) > CUADRE_EPS)
          || (typeof difImporte === 'number' && Math.abs(difImporte) > CUADRE_EPS)) {
        difiere.push(fila);
        legajosConDif.add(f.clave);
      } else {
        coincide.push(fila);
      }
    }
  }

  const nombrePorClave = new Map(filas.map(f => [f.clave, f.legajo]));
  for (const [clave, porConcepto] of armado) {
    for (const [codigo, v] of porConcepto) {
      if (vistos.has(`${clave}|${codigo}`)) continue;
      soloArmado.push({ legajo: nombrePorClave.get(clave) || clave, nombre: '', codigo, ...v });
      legajosConDif.add(clave);
    }
  }

  return { coincide, difiere, soloGenerado, soloArmado, legajosConDif };
}

/**
 * Diferencia entre dos valores del mismo concepto. `'difiere'` cuando uno está y
 * el otro no —eso no es una diferencia de importe, es una novedad que falta de un
 * lado—, `null` cuando ninguno de los dos lados lo trae (no hay nada que
 * comparar) y el número cuando los dos están.
 */
function diferencia(a, b) {
  const hayA = a !== null && a !== undefined;
  const hayB = b !== null && b !== undefined;
  if (!hayA && !hayB) return null;
  if (hayA !== hayB) return 'difiere';
  return a - b;
}

function cuadra(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= CUADRE_EPS;
}

/** Los códigos son numéricos casi siempre; `SAL BAS` existe y ordena al final. */
function porCodigo(a, b) {
  const na = Number(a.codigo), nb = Number(b.codigo);
  const aNum = !isNaN(na), bNum = !isNaN(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return String(a.codigo).localeCompare(String(b.codigo));
}

/**
 * De dónde sale la unidad organizativa del F2. La declara el archivo (fila 1) o
 * el analista en el Paso 2; si no la declara nadie, el F2 se genera igual pero
 * lo dice — no se inventa un número de UO.
 */
function resolverUo(meta, cfg) {
  const delAnalista = String(cfg.uoNombre || '').trim() || String(cfg.uoNro || '').trim();
  if (delAnalista) {
    return {
      nro:      String(cfg.uoNro || '').trim(),
      nombre:   String(cfg.uoNombre || '').trim(),
      origen:   'analista',
      etiqueta: 'Unidad Organizativa',
    };
  }
  // El lector devuelve `{ numero, nombre }` para la UO y el nombre suelto para
  // Empresa: son las dos formas que trae la fila 1 según el cliente.
  if (meta.unidadOrganizativa) {
    return {
      nro:      String(meta.unidadOrganizativa.numero ?? '').trim(),
      nombre:   String(meta.unidadOrganizativa.nombre ?? '').trim(),
      origen:   'archivo',
      etiqueta: 'Unidad Organizativa',
    };
  }
  if (meta.empresa) {
    return { nro: '', nombre: String(meta.empresa).trim(), origen: 'archivo', etiqueta: 'Empresa' };
  }
  return { nro: '', nombre: '', origen: 'sin_declarar', etiqueta: 'Unidad Organizativa' };
}

// ── El archivo generado ───────────────────────────────────────────────────────

/**
 * El importador F2 como matriz de filas, tal como va a la hoja. Función pura a
 * propósito: es lo que se puede verificar en un test contra el F2 real del
 * cliente sin abrir un navegador, y es lo que el lector ExpNov tiene que poder
 * volver a leer (el ida y vuelta está escrito como assert).
 *
 * Layout, tal como salió del relevamiento de los F2 reales: fila 1 la metadata
 * de la UO, fila 2 el encabezado (`Legajo`, `Apellido y Nombres` y un código por
 * concepto) y desde la fila 3 un empleado por fila. El F2 **no** lleva fila de
 * nombres en criollo: los de SIASA y Merz —los dos pilotos— traen sólo códigos.
 */
export function buildF2Aoa(results, { fecha = '' } = {}) {
  const codigos = results.conceptos.map(c => c.codigo);
  const etiqueta = results.uo.etiqueta === 'Empresa' ? 'Empresa' : 'Unidad Organizativa';

  const aoa = [
    [etiqueta, results.uo.nro || '', results.uo.nombre || '', fecha],
    ['Legajo', 'Apellido y Nombres', ...codigos],
  ];
  for (const f of results.filas) {
    aoa.push([
      f.legajo,
      f.nombre || '',
      ...codigos.map(cod => {
        const v = f.valores.get(cod);
        return v ? celdaF2(v) : null;
      }),
    ]);
  }
  return aoa;
}

/** Nombre del archivo: el que usa el analista para archivarlo por UO y período. */
export function f2FileName(results) {
  const uo = (results.uo.nombre || results.uo.nro || 'SIN_UO')
    .replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, '_').toUpperCase();
  return `F2_Consolidada_${uo}_${periodSuffix(results.period)}.xlsx`;
}

async function descargarF2(results) {
  await loadExcelJS();
  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();
  const ws = wb.addWorksheet('F2_Consolidada');

  const hoy = new Date();
  const fecha = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
  for (const fila of buildF2Aoa(results, { fecha })) {
    ws.addRow(fila.map(v => (v === null ? null : v)));
  }
  // Los códigos de concepto y el legajo van como TEXTO: un código con ceros a la
  // izquierda se pierde como número, y `1$500` no es una moneda.
  ws.getRow(2).eachCell(c => { c.numFmt = '@'; });
  ws.getColumn(1).numFmt = '@';
  ws.getRow(2).font = { bold: true };
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 32;

  await downloadWorkbook(wb, f2FileName(results));
}

// ── Tarjeta colapsada ─────────────────────────────────────────────────────────

export function summarizeNovedadesImportador(results) {
  if (results.error) {
    return {
      status: 'warning', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null,
      diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const s = results.summary;
  const insights = [];
  if (s.columnasAfuera > 0) {
    insights.push({ type: 'warning', label: 'columnas sin código que no entran al importador', value: s.columnasAfuera });
  }
  if (s.celdasAfuera > 0) {
    insights.push({ type: 'warning', label: 'valores que no se pudieron leer', value: s.celdasAfuera });
  }
  if (s.filasSinLegajo > 0) {
    insights.push({ type: 'warning', label: 'filas con datos sin legajo', value: s.filasSinLegajo });
  }
  if (s.legajosConsolidados > 0) {
    insights.push({ type: 'info', label: 'legajos que venían repetidos y se sumaron', value: s.legajosConsolidados });
  }
  if (results.contra) {
    if (s.contraDifiere > 0) {
      insights.push({ type: 'warning', label: 'novedades que difieren contra el importador ya armado', value: s.contraDifiere });
    }
    if (s.contraSoloGenerado > 0) {
      insights.push({ type: 'warning', label: 'novedades de la planilla que no están en el importador armado', value: s.contraSoloGenerado });
    }
    if (s.contraSoloArmado > 0) {
      insights.push({ type: 'warning', label: 'novedades del importador armado que no están en la planilla', value: s.contraSoloArmado });
    }
  }
  if (results.uo.origen === 'sin_declarar') {
    insights.push({ type: 'warning', label: 'el importador sale sin unidad organizativa', value: '—' });
  }

  const cuadra = s.cuadraImporte && s.cuadraCantidad;
  // La unidad es el legajo: cuántos empleados quedan con algo sin entrar al
  // importador. Si el archivo generado no cuadra contra la planilla leída, el
  // importador entero es sospechoso y se marcan todos.
  const unitsTotal    = s.legajos;
  const unitsWithDiff = cuadra ? s.legajosParaRevisar : unitsTotal;

  return {
    status:   (cuadra && unitsWithDiff === 0 && results.uo.origen !== 'sin_declarar') ? 'success' : 'warning',
    headline: `${s.legajos} legajo${s.legajos === 1 ? '' : 's'} · ${s.conceptos} concepto${s.conceptos === 1 ? '' : 's'} · importador F2 generado`,
    insights,
    unit: 'legajo',
    unitsTotal,
    unitsWithDiff,
    diffTotalAmount: null,
    worstCase: null,
    contextNote: cuadra
      ? `entran ${s.celdasEnF2} novedades de las ${s.celdasLeidas} leídas en la planilla`
      : 'el importador no cuadra contra la planilla leída — no lo subas sin revisar',
  };
}

// ── Pantalla de resultados ────────────────────────────────────────────────────

const MOTIVO_LABEL = {
  columna_sin_codigo:  'Columna sin código de concepto',
  valor_no_parseable:  'Valor que no se pudo leer',
  fila_sin_legajo:     'Fila con datos y sin legajo',
};

export function renderNovedadesImportadorResults(results, container) {
  if (results.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }

  const s = results.summary;
  container.innerHTML = '';

  renderResumenDetalle(container, {
    controlId: 'novedades_importador',
    resumen(panel) {
      const problemas = s.columnasAfuera + s.celdasAfuera + s.filasSinLegajo;
      const contraDif = results.contra
        ? results.contra.difiere.length + results.contra.soloGenerado.length + results.contra.soloArmado.length
        : 0;
      renderVerdict(panel, {
        tone: !s.cuadraImporte || !s.cuadraCantidad ? 'error' : (problemas > 0 || contraDif > 0) ? 'warn' : 'info',
        title: !s.cuadraImporte || !s.cuadraCantidad
          ? 'El importador no cuadra contra la planilla: no lo subas sin revisar.'
          : problemas > 0
            ? `Importador armado, con ${problemas} ${problemas === 1 ? 'cosa que quedó' : 'cosas que quedaron'} afuera.`
            : contraDif > 0
              ? `Importador armado, pero ${contraDif} novedad${contraDif === 1 ? '' : 'es'} no coincide${contraDif === 1 ? '' : 'n'} con el que ya estaba armado.`
            : `Importador armado: ${s.legajos} legajo${s.legajos === 1 ? '' : 's'} y ${s.conceptos} concepto${s.conceptos === 1 ? '' : 's'}, sin nada afuera.`,
        body: `${uoTexto(results)} · ${s.celdasEnF2} novedad${s.celdasEnF2 === 1 ? '' : 'es'} entran al F2. `
          + (results.contra
            ? `Comparado contra el importador ya armado: ${contraDif} novedad${contraDif === 1 ? '' : 'es'} no coincide${contraDif === 1 ? '' : 'n'}. `
            : '')
          + 'Revisá abajo qué entra y qué quedó afuera antes de descargarlo.',
      });

      const acciones = document.createElement('div');
      acciones.style.cssText = 'padding:var(--sp-3) 0;';
      acciones.innerHTML = `
        <button type="button" class="btn btn--primary" data-f2-download>Descargar importador F2 (.xlsx)</button>
        <span class="text-muted" style="font-size:var(--text-sm);margin-left:var(--sp-3);">${esc(f2FileName(results))}</span>
      `;
      acciones.querySelector('[data-f2-download]').addEventListener('click', () => descargarF2(results));
      panel.appendChild(acciones);

      renderTiles(panel, [
        { label: 'Legajos en el importador', value: s.legajos,
          sub: s.legajosConsolidados > 0 ? `${s.legajosConsolidados} venían repetidos y se sumaron` : null },
        { label: 'Conceptos', value: s.conceptos,
          sub: s.conceptosDelCatalogo > 0 ? `${s.conceptosDelCatalogo} resuelto${s.conceptosDelCatalogo === 1 ? '' : 's'} con el catálogo del cliente` : null },
        { label: 'Novedades que entran', value: s.celdasEnF2, sub: `de ${s.celdasLeidas} leídas en la planilla` },
        { label: 'Quedó afuera', value: problemas, sub: problemas > 0 ? 'con el motivo, abajo' : 'nada' },
        ...(results.contra ? [{
          label: 'Difiere del F2 armado',
          value: s.contraDifiere + s.contraSoloGenerado + s.contraSoloArmado,
          sub: `${s.contraDifiere} difieren · ${s.contraSoloGenerado} sólo en la planilla · ${s.contraSoloArmado} sólo en el armado`,
        }] : []),
      ]);

      if (results.afuera.length > 0) {
        renderIssues(panel, {
          heading: 'Qué quedó afuera del importador',
          items: results.afuera.map(a => ({
            who:  MOTIVO_LABEL[a.motivo] || a.motivo,
            sev:  a.motivo === 'columna_sin_codigo' ? 'hi' : undefined,
            what: dondeTexto(a),
            why:  a.detalle,
          })),
        });
      }

      if (results.contra) {
        const casos = [
          ...results.contra.soloGenerado.map(x => ({
            who:  `Legajo ${x.legajo}${x.nombre ? ` — ${x.nombre}` : ''}`,
            sev:  'hi',
            what: `el concepto ${x.codigo} está en la planilla del cliente y NO en el importador armado`,
            why:  'si es una baja o una novedad dada de baja a mano, dejá constancia; si no, falta en el importador',
          })),
          ...results.contra.soloArmado.map(x => ({
            who:  `Legajo ${x.legajo}`,
            what: `el concepto ${x.codigo} está en el importador armado y NO en la planilla del cliente`,
            why:  'lo agregó el analista a mano, o la planilla que subiste no es la que se usó',
          })),
          ...results.contra.difiere.map(x => ({
            who:  `Legajo ${x.legajo}${x.nombre ? ` — ${x.nombre}` : ''}`,
            what: `el concepto ${x.codigo} no coincide: cantidad ${fmtNum(x.cantidadGenerada)} vs ${fmtNum(x.cantidadArmada)}, `
              + `importe ${fmtNum(x.importeGenerado)} vs ${fmtNum(x.importeArmado)}`,
            why:  'el primer número es el que arma la app desde la planilla; el segundo, el del importador armado',
          })),
        ];
        if (casos.length > 0) {
          renderIssues(panel, { heading: 'Contra el importador ya armado', items: casos });
        }
      }

      if (results.columnasExcluidas.length > 0) {
        renderIssues(panel, {
          heading: 'Dejado afuera a propósito',
          items: results.columnasExcluidas.map(c => ({
            who:  `Columna ${c.letra} — ${c.rotulo || '(sin rótulo)'}`,
            what: `${c.celdas} celda${c.celdas === 1 ? '' : 's'} cargada${c.celdas === 1 ? '' : 's'}, no viajan al importador`,
            why:  'la marcaste como "no va al importador" en el Paso 2',
          })),
        });
      }

      renderChecks(panel, {
        heading: 'Chequeos del armado',
        items: [
          { label: 'Los importes del F2 suman lo mismo que la planilla', ok: s.cuadraImporte,
            detail: s.cuadraImporte ? null : `planilla ${fmtNum(s.importeLeido)} · F2 ${fmtNum(s.importeTotal)}` },
          { label: 'Las cantidades del F2 suman lo mismo que la planilla', ok: s.cuadraCantidad,
            detail: s.cuadraCantidad ? null : `planilla ${fmtNum(s.cantidadLeida)} · F2 ${fmtNum(s.cantidadTotal)}` },
          { label: 'Todas las columnas con datos tienen concepto', ok: s.columnasAfuera === 0,
            detail: s.columnasAfuera === 0 ? null : `${s.columnasAfuera} sin código (${s.celdasSinCodigo} celdas)` },
          { label: 'La unidad organizativa está declarada', ok: results.uo.origen !== 'sin_declarar',
            detail: results.uo.origen === 'sin_declarar' ? 'cargala en el Paso 2' : uoTexto(results) },
          ...(results.contra ? [{
            label: 'Coincide con el importador ya armado',
            ok: results.contra.difiere.length === 0 && results.contra.soloGenerado.length === 0
                && results.contra.soloArmado.length === 0,
            detail: `${results.contra.coincide.length} novedades coinciden`,
          }] : [{
            label: 'Comparado contra el importador ya armado',
            ok: true,
            detail: 'no cargaste ninguno: el control generó el importador y no comparó nada',
          }]),
        ],
      });

      if (s.conceptosSinCarga > 0) {
        renderIssues(panel, {
          heading: 'Conceptos que este mes no se liquidaron',
          items: results.conceptosSinCarga.map(c => ({
            who:  `${c.codigo}${c.rotulo ? ` — ${c.rotulo}` : ''}`,
            what: 'tiene columna en la planilla y ninguna celda cargada',
            why:  'no entra al importador — que un concepto no exista en un período es un resultado válido (D-036)',
          })),
        });
      }

      if (results.avisos.length > 0) {
        renderIssues(panel, {
          heading: 'Avisos de la lectura de la planilla',
          items: results.avisos.map(a => ({ who: 'Lectura de la planilla', what: a })),
        });
      }
    },
    detalle(panel) { renderDetalle(panel, results); },
  });
}

function renderDetalle(container, results) {
  if (results.filas.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const vistaSel = document.createElement('div');
  vistaSel.className = 'form-group';
  vistaSel.style.cssText = 'margin-bottom:0;min-width:220px;';
  vistaSel.innerHTML = `
    <label class="form-label" style="font-size:var(--text-sm);">Vista</label>
    <select class="form-select form-select--sm" data-nov-vista>
      <option value="f2">Lo que entra al importador</option>
      <option value="totales">Totales por concepto</option>
      <option value="afuera">Quedó afuera (${results.afuera.length})</option>
      ${results.contra ? `<option value="contra">Contra el F2 armado (${results.contra.difiere.length + results.contra.soloGenerado.length + results.contra.soloArmado.length})</option>` : ''}
    </select>
  `;

  const { searchEl, exportEl } = createResultsToolbar(container, { left: vistaSel });

  // Las tres salidas son el importador completo, sin importar la vista de
  // pantalla: es el archivo que va a Axton.
  const csvHeaders = ['Legajo', 'Apellido y Nombres', ...results.conceptos.map(c => c.codigo)];
  const csvRows = () => results.filas.map(f => [
    f.legajo, f.nombre,
    ...results.conceptos.map(c => {
      const v = f.valores.get(c.codigo);
      const celda = v ? celdaF2(v) : null;
      return celda === null ? '' : String(celda);
    }),
  ]);
  renderExportMenu(exportEl, {
    onExcel: () => descargarF2(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), f2FileName(results).replace(/\.xlsx$/, '.csv')),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });

  const tableHost = document.createElement('div');
  container.appendChild(tableHost);

  function dibujar(vista) {
    if (vista === 'totales') return dibujarTotales(tableHost, results, searchEl);
    if (vista === 'afuera')  return dibujarAfuera(tableHost, results, searchEl);
    if (vista === 'contra')  return dibujarContra(tableHost, results, searchEl);
    return dibujarF2(tableHost, results, searchEl);
  }

  vistaSel.querySelector('[data-nov-vista]').addEventListener('change', (e) => dibujar(e.target.value));
  dibujar('f2');
}

function dibujarF2(host, results, searchEl) {
  const conceptos = results.conceptos;
  host.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th>Legajo</th>
          <th>Apellido y Nombres</th>
          ${conceptos.map(c => `<th style="white-space:nowrap;font-size:0.72em;">${esc(c.codigo)}${c.rotulo ? `<br><small>${esc(c.rotulo)}</small>` : ''}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${results.filas.map(f => `
          <tr>
            <td>${esc(f.legajo)}</td>
            <td>${esc(f.nombre)}</td>
            ${conceptos.map(c => {
              const v = f.valores.get(c.codigo);
              const celda = v ? celdaF2(v) : null;
              return `<td style="text-align:right;">${celda === null ? '' : esc(String(celda))}</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
      Cada celda sale al importador tal como se ve acá — el formato
      <code>cantidad$importe</code> es el que espera Axton. Una celda vacía no viaja: no es un cero.
    </p>
  `;
  wireTableTools(host.querySelector('table'), {
    rows: results.filas,
    getLabel: f => `${f.legajo} — ${f.nombre}`,
    searchEl,
    stickyCols: 2,
  });
}

function dibujarTotales(host, results, searchEl) {
  host.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th>Código</th><th>Concepto (criollo)</th><th>De dónde sale el código</th>
          <th style="text-align:right;">Legajos</th>
          <th style="text-align:right;">Cantidad</th>
          <th style="text-align:right;">Importe</th>
        </tr>
      </thead>
      <tbody>
        ${results.conceptos.map(c => `
          <tr>
            <td>${esc(c.codigo)}</td>
            <td>${esc(c.rotulo || '—')}</td>
            <td>${c.origen === 'catalogo' ? 'lo confirmaste en el Paso 2' : 'lo trae la planilla'}</td>
            <td style="text-align:right;">${c.legajos}</td>
            <td style="text-align:right;">${fmtNum(c.cantidadTotal)}</td>
            <td style="text-align:right;">${fmtNum(c.importeTotal)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3">TOTAL — ${results.conceptos.length} conceptos</td>
          <td style="text-align:right;">${results.summary.legajos}</td>
          <td style="text-align:right;">${fmtNum(results.summary.cantidadTotal)}</td>
          <td style="text-align:right;">${fmtNum(results.summary.importeTotal)}</td>
        </tr>
      </tfoot>
    </table>
  `;
  wireTableTools(host.querySelector('table'), {
    rows: results.conceptos,
    getLabel: c => `${c.codigo} — ${c.rotulo}`,
    searchEl,
    stickyCols: 2,
  });
}

function dibujarAfuera(host, results, searchEl) {
  if (results.afuera.length === 0) {
    host.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">No quedó nada afuera: todo lo que trae la planilla entró al importador.</p>`;
    return;
  }
  host.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr><th>Motivo</th><th>Dónde</th><th>Legajo</th><th>Valor</th><th>Por qué</th></tr>
      </thead>
      <tbody>
        ${results.afuera.map(a => `
          <tr>
            <td>${esc(MOTIVO_LABEL[a.motivo] || a.motivo)}</td>
            <td>${esc(dondeTexto(a))}</td>
            <td>${esc(a.legajo || '—')}</td>
            <td>${esc(a.texto ?? '—')}</td>
            <td>${esc(a.detalle)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  wireTableTools(host.querySelector('table'), {
    rows: results.afuera,
    getLabel: a => `${MOTIVO_LABEL[a.motivo] || a.motivo} — ${dondeTexto(a)}`,
    searchEl,
    stickyCols: 1,
  });
}

function dibujarContra(host, results, searchEl) {
  const filas = [
    ...results.contra.soloGenerado.map(x => ({ ...x, banda: 'Sólo en la planilla del cliente' })),
    ...results.contra.soloArmado.map(x   => ({ ...x, banda: 'Sólo en el importador armado' })),
    ...results.contra.difiere.map(x      => ({ ...x, banda: 'Difiere' })),
  ];
  if (filas.length === 0) {
    host.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">El importador generado coincide con el que ya estaba armado, novedad por novedad.</p>`;
    return;
  }
  host.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th>Banda</th><th>Legajo</th><th>Concepto</th>
          <th style="text-align:right;">Cantidad generada</th>
          <th style="text-align:right;">Cantidad armada</th>
          <th style="text-align:right;">Importe generado</th>
          <th style="text-align:right;">Importe armado</th>
        </tr>
      </thead>
      <tbody>
        ${filas.map(f => `
          <tr>
            <td>${esc(f.banda)}</td>
            <td>${esc(f.legajo)}</td>
            <td>${esc(f.codigo)}</td>
            <td style="text-align:right;">${fmtNum(f.cantidadGenerada ?? (f.banda === 'Sólo en la planilla del cliente' ? f.cantidad : null))}</td>
            <td style="text-align:right;">${fmtNum(f.cantidadArmada ?? (f.banda === 'Sólo en el importador armado' ? f.cantidad : null))}</td>
            <td style="text-align:right;">${fmtNum(f.importeGenerado ?? (f.banda === 'Sólo en la planilla del cliente' ? f.importe : null))}</td>
            <td style="text-align:right;">${fmtNum(f.importeArmado ?? (f.banda === 'Sólo en el importador armado' ? f.importe : null))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
      «—» es que ese lado no trae la novedad: no es un cero. Las ${results.contra.coincide.length}
      novedades que coinciden no se listan.
    </p>
  `;
  wireTableTools(host.querySelector('table'), {
    rows: filas,
    getLabel: f => `${f.legajo} — ${f.codigo}`,
    searchEl,
    stickyCols: 2,
  });
}

// ── Helpers de texto ──────────────────────────────────────────────────────────

function dondeTexto(a) {
  const partes = [];
  if (a.letraCol) partes.push(`columna ${a.letraCol}${a.rotulo ? ` "${a.rotulo}"` : ''}${a.codigo ? ` (${a.codigo})` : ''}`);
  if (a.fila)     partes.push(`fila ${a.fila}`);
  return partes.length ? partes.join(', ') : '—';
}

function uoTexto(results) {
  const { nro, nombre, origen } = results.uo;
  if (origen === 'sin_declarar') return 'sin unidad organizativa declarada';
  const quien = origen === 'analista' ? 'la cargaste en el Paso 2' : 'la trae la planilla';
  return `${[nro, nombre].filter(Boolean).join(' — ')} (${quien})`;
}

function fmtNum(v) {
  return v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
