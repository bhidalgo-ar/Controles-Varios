// tabFormatDetector.js — Detector de formato del Tabulado (pieza T del catálogo)
//
// Los formatos conocidos y sus firmas (capturados con Willy el 18/08/2026 y
// verificados contra 6 archivos reales de 4 clientes, período 07/2026 — el
// criterio completo vive en el ítem "T — Lector de tabulado" del tablero
// Catálogo de Controles de Payroll de monday):
//
//   meta4_h   — Meta4 "tabulado horizontal" (Finadiet, POF hoy). Hoja llamada
//               `tabulado_h`, encabezados en la fila 1 (ID_EMPLEADO, …),
//               conceptos `1003-SUELDO` (código pegado al nombre), totales al
//               final SIN etiqueta, no liquidado = 0 explícito.
//   axton     — Axton completo (Epiroc, POP). Hoja `Liquidaciones.AAAAMMDD.HHMMSS.n`,
//               un par de columnas Cant/Imp por concepto, `TOTAL GENERAL`
//               literal al cierre, conceptos `1000 - Sueldo Basico` (espacio,
//               guion, espacio), no liquidado = celda vacía.
//   axton_tot — El reporte "Totales de Concepto" de Axton, que arranca igual que
//               un Tabulado (preámbulo `EA: …`, columna Legajo) pero es OTRO
//               archivo: formato largo, una fila por legajo × concepto × liquidación
//               y sin subencabezados Cant/Imp. Se distingue por el campo
//               `Reporte:` del preámbulo y por la hoja `totalesconcepto.*`. Lo lee
//               `totalesConceptoParser.js`, no el parser del Tabulado — sin esta
//               firma, subido en el casillero del Tabulado, se clasificaba como
//               `axton_imp` y moría más adelante con un error que no explica nada.
//   axton_imp — Axton reducido a sólo importes (SIASA; posiblemente retocado a
//               mano antes de enviarse — se acepta igual, por las dudas).
//               Preámbulo `EA: … | Reporte: … | Periodo: …` en la fila 1,
//               TOTAL GENERAL duplicado arriba y abajo, subencabezado `Imp`
//               sin ningún `Cant`. Es la misma familia que el Tabulado HTML
//               disfrazado de .xls que ya lee `tabuladoHtml.js`.
//
// El formato se decide por la firma del ARCHIVO, nunca por el cliente: dos
// layouts pueden usar el mismo nombre de campo para cosas distintas, y un
// cliente puede migrar de sistema sin aviso (POF exportaba la familia `EA:`
// en 2025 y hoy manda `tabulado_h`). Por lo mismo, acá no se resuelve nada
// por posición de columna: el ancho cambia entre corridas del mismo mes
// (POP 116→128; POF 100→113).
//
// Queda afuera a propósito el Tabulado Vertical de Toyota/TASA: sin relevar.
//
/* global XLSX */

// Nombre de hoja de cada sistema. El de Axton lleva el timestamp de generación,
// así que se matchea por patrón — nunca por igualdad.
const HOJA_META4_H = 'tabulado_h';
const HOJA_AXTON = /^Liquidaciones\.\d{8}\.\d{6}\.\d+$/;
const HOJA_AXTON_TOTALES = /^totalesconcepto/i;

// Marcadores internos, para archivos re-guardados donde el nombre de hoja no
// alcanza o no está (el Tabulado HTML no tiene hojas).
const PREAMBULO_EA = /^EA:\s/;
// El campo `Reporte:` del preámbulo: es lo que dice CUÁL de los exports de Axton
// es el archivo. `Resumen de Liquidacion` y `Consulta de Liquidacion` son el
// Tabulado; `Totales de Concepto` es el totalizador.
const CAMPO_REPORTE = /reporte:\s*([^|]+?)\s*(?:\||$)/i;
const REPORTE_TOTALES = /totales?\s+de\s+concepto/i;
const CONCEPTO_META4 = /^\d+-\S/; // "1003-SUELDO": código pegado al nombre
const PRIMERA_COLUMNA_META4 = /^(id_)?empleado$|^legajo$/i;

const norm = v => (v == null ? '' : String(v).trim());

/**
 * ¿Qué contenedor es el archivo, mirando sólo los primeros bytes?
 * 'zip' = .xlsx real · 'ole2' = .xls binario o .xlsx cifrado con contraseña ·
 * 'html' = tabla HTML disfrazada de Excel · 'desconocido' = ninguno.
 */
export function sniffContainer(arrayBuffer) {
  const b = new Uint8Array(arrayBuffer);
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole2';
  const inicio = new TextDecoder('latin1').decode(b.subarray(0, 4096)).toLowerCase();
  if (inicio.includes('<table') || inicio.includes('<html') || inicio.includes('<span')) return 'html';
  return 'desconocido';
}

/**
 * Clasifica un Tabulado ya abierto: nombre de hoja + primeras filas crudas.
 * Pura, sin XLSX: es la parte testeable y la que documenta las firmas.
 *
 * @param {{ sheetName?: string, rows: any[][] }} input - `rows` son las primeras
 *   filas de la hoja (alcanza con ~8) como array de arrays.
 * @returns {{ format: string, sistema: string, reporte: string|null, evidencia: string[] } |
 *           { format: null, reporte: string|null, evidencia: string[] }}
 *   `reporte` es el texto del campo `Reporte:` del preámbulo cuando el archivo lo
 *   trae (`Resumen de Liquidacion`, `Consulta de Liquidacion`, `Totales de
 *   Concepto`), y `null` cuando no hay preámbulo — POP, Epiroc y Geopagos exportan
 *   con los encabezados en la fila 1.
 */
export function classifyTabulado({ sheetName, rows }) {
  const hoja = norm(sheetName);
  const primeras = (rows || []).slice(0, 8);

  // El campo `Reporte:` del preámbulo, cuando el archivo lo trae: dice cuál de los
  // exports de Axton es, y viaja en el resultado para que el lector no tenga que
  // volver a buscarlo.
  const reporte = leerCampoReporte(primeras);

  // Sub-variante de Axton: con pares Cant/Imp (completo) o sólo Imp (reducido).
  const hayCant = primeras.some(f => (f || []).some(c => norm(c) === 'Cant'));
  const variantAxton = evidencia => hayCant
    ? { format: 'axton', sistema: 'Axton', reporte, evidencia: [...evidencia, 'subencabezado con pares Cant/Imp'] }
    : { format: 'axton_imp', sistema: 'Axton', reporte, evidencia: [...evidencia, 'subencabezado sólo Imp, sin ningún Cant'] };

  if (hoja === HOJA_META4_H) {
    return { format: 'meta4_h', sistema: 'Meta4', reporte, evidencia: [`hoja "${HOJA_META4_H}"`] };
  }

  // El totalizador se decide ANTES de las dos variantes del Tabulado: arranca con
  // el mismo preámbulo y también tiene columna Legajo, así que si no se lo separa
  // acá sale clasificado como Tabulado y el error aparece recién al leerlo.
  const esTotalizador = HOJA_AXTON_TOTALES.test(hoja) || (reporte && REPORTE_TOTALES.test(reporte));
  if (esTotalizador) {
    return {
      format: 'axton_tot', sistema: 'Axton', reporte,
      evidencia: [
        HOJA_AXTON_TOTALES.test(hoja) ? `hoja "${hoja}" (totalizador)` : `preámbulo con "Reporte: ${reporte}"`,
        'es el reporte "Totales de Concepto", no el Tabulado de la liquidación',
      ],
    };
  }

  if (HOJA_AXTON.test(hoja)) {
    return variantAxton([`hoja con firma de Axton ("${hoja}")`]);
  }

  // Sin firma en el nombre de hoja: marcadores internos.
  const conEA = primeras.some(f => PREAMBULO_EA.test(norm(f?.[0])));
  if (conEA) return variantAxton(['preámbulo "EA: … | Reporte: …" en las primeras filas']);

  const encabezados = (primeras[0] || []).map(norm);
  const arrancaConLegajo = PRIMERA_COLUMNA_META4.test(encabezados[0] || '');
  if (arrancaConLegajo && encabezados.some(h => CONCEPTO_META4.test(h))) {
    return {
      format: 'meta4_h', sistema: 'Meta4',
      evidencia: [`fila 1 arranca con "${encabezados[0]}"`, 'conceptos con código pegado al nombre (ej. "1003-SUELDO")'],
    };
  }
  if (arrancaConLegajo && (hayCant || primeras.some(f => (f || []).some(c => norm(c) === 'Imp')))) {
    return variantAxton([`fila de encabezados arranca con "${encabezados[0]}"`]);
  }

  return {
    format: null,
    reporte,
    evidencia: [
      `hoja "${hoja || '(sin nombre)'}" — no es "${HOJA_META4_H}" (Meta4) ni "Liquidaciones.AAAAMMDD.HHMMSS.n" (Axton)`,
      'tampoco se encontró preámbulo "EA:", ni encabezados de Tabulado en la fila 1',
    ],
  };
}

/** El texto del campo `Reporte:` del preámbulo, o `null` si el archivo no lo trae. */
function leerCampoReporte(primeras) {
  for (const fila of primeras) {
    for (const celda of fila || []) {
      const m = norm(celda).match(CAMPO_REPORTE);
      if (m) return m[1].trim();
    }
  }
  return null;
}

/**
 * Detecta el formato de un Tabulado ANTES de elegir con qué parser leerlo.
 * Corta con un error legible cuando el archivo no se puede clasificar: un
 * Tabulado leído con el formato equivocado da números coherentes y mal, y eso
 * no lo detecta nadie.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ format: string, sistema: string, container: string, sheetName: string|null, evidencia: string[] }}
 */
export function detectTabFormat(arrayBuffer) {
  const container = sniffContainer(arrayBuffer);

  if (container === 'ole2') {
    throw new Error(
      'El Tabulado está protegido con contraseña (o es un .xls binario viejo) y no se puede leer. ' +
      'Pedí el export sin contraseña, o abrilo en Excel y guardalo de nuevo sin cifrar.'
    );
  }

  if (container === 'html') {
    const inicio = new TextDecoder('latin1').decode(new Uint8Array(arrayBuffer).subarray(0, 4096));
    if (/EA:\s/.test(inicio)) {
      const mReporte = inicio.replace(/<[^>]*>/g, ' ').match(CAMPO_REPORTE);
      const reporte = mReporte ? mReporte[1].trim() : null;
      if (reporte && REPORTE_TOTALES.test(reporte)) {
        return {
          format: 'axton_tot', sistema: 'Axton', container, sheetName: null, reporte,
          evidencia: [`HTML disfrazado de Excel con "Reporte: ${reporte}"`,
            'es el reporte "Totales de Concepto" (lo lee totalesConceptoParser.js), no el Tabulado'],
        };
      }
      return {
        format: 'axton_imp', sistema: 'Axton', container, sheetName: null, reporte,
        evidencia: ['HTML disfrazado de Excel con preámbulo "EA: …" (familia que ya lee tabuladoHtml.js)'],
      };
    }
    throw new Error(
      'El archivo es HTML disfrazado de Excel pero no tiene el preámbulo "EA: …" del Tabulado. ' +
      'Verificá que sea el export correcto del sistema de liquidación.'
    );
  }

  if (container !== 'zip') {
    throw new Error(
      'El archivo no es un Excel (.xlsx), ni un Tabulado HTML conocido. ' +
      'Se esperaba un export del Tabulado de Meta4 o de Axton.'
    );
  }

  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false, sheetRows: 8 });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });

  const result = classifyTabulado({ sheetName, rows });
  if (!result.format) {
    throw new Error(
      'No se reconoció el formato del Tabulado. ' + result.evidencia.join('; ') + '. ' +
      'Si es un formato nuevo (por ejemplo el Tabulado Vertical de Toyota), hay que relevarlo antes de usarlo.'
    );
  }
  return { ...result, container, sheetName };
}

/**
 * Compara los encabezados de dos Tabulados del mismo formato y dice qué
 * columnas entraron y cuáles salieron. Que cambien es lo esperado cuando
 * cambian los conceptos liquidados: es aviso para el analista, no error.
 *
 * @param {string[]} headersPrev - encabezados del archivo anterior
 * @param {string[]} headersCurr - encabezados del archivo actual
 * @returns {{ entraron: string[], salieron: string[], comunes: number }}
 */
export function compareLayouts(headersPrev, headersCurr) {
  const prev = new Set((headersPrev || []).map(norm).filter(Boolean));
  const curr = new Set((headersCurr || []).map(norm).filter(Boolean));
  return {
    entraron: [...curr].filter(h => !prev.has(h)),
    salieron: [...prev].filter(h => !curr.has(h)),
    comunes: [...curr].filter(h => prev.has(h)).length,
  };
}
