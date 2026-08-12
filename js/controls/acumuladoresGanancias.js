// acumuladoresGanancias.js — Control Acumuladores Ganancias (Axton)
//
// Control de generación (no de cruce): arma, desde los crudos `repacumuladores`
// de Axton, el archivo mensual de acumuladores de Ganancias que hoy el analista
// arma a mano con dos tablas dinámicas encadenadas y un VLOOKUP por mes. No hay
// nada contra qué comparar (status 'info', sin semáforo ni hero de diferencias).
//
// Entrada múltiple: el analista sube un crudo por cada mes que entra en el
// cálculo del SAC teórico (RG 4030: 2 meses · RG 4003: hasta 8). Cada archivo
// llega ya tageado con su período (`_period`, 'YYYY-MM') por el multi-upload de
// js/ui/fileUpload.js (initAcumuladoresMultiUpload, modelo de CONTA) — este
// módulo no sabe nada de archivos individuales, sólo de filas con `_period`.
//
// Reglas de cálculo completas en specs/control-acumuladores-ganancias.md.

import { initTabs } from '../ui/tabs.js';
import { renderVerdict, renderTiles, renderIssues, renderMinorObservations, renderChecks } from '../ui/resultBlocks.js';
import { renderExportMenu } from '../ui/exportMenu.js';
import { wireTableTools } from '../ui/tableTools.js';
import { getViewPreference, setViewPreference } from '../ui/viewPreference.js';
import { loadExcelJS, downloadWorkbook, downloadCsv, copyRowsToClipboard } from '../utils/exportData.js';
import { formatAmount as fmtNum } from '../utils/currency.js';
import { periodToLabel } from '../utils/dates.js';

// ── Códigos de acumulador (Nro) ───────────────────────────────────────────────
// Matcheo por Nro, no por texto: el origen mezcla acentuación
// ('Retencion' vs 'Retención', 'teorico' sin tilde). El texto es sólo fallback/rótulo.
export const ACUMULADORES = {
  brutoGanancias:     1100,  // Bruto para ganancias
  noRemGravado:       1101,  // No Remunerativo gravado por IIGG
  retribNoHabituales: 1107,  // Retribuciones no habituales
  sacPrimera:         1108,  // SAC primera cuota
  sacSegunda:         1109,  // SAC segunda cuota
  jubilacion:         1120,  // Retención sobre bruto - jubilación
  sindicato:          1121,  // Retencion sobre bruto - sindicato
  obraSocial:         1122,  // Retención sobre bruto - obra social
  excluyeSac:         1137,  // Excluye del SAC teorico
  retenciones:        1150,  // Retenciones efectuadas (= Impuesto a las Ganancias)
};

// ── Extras de Ganancias/topes: APAGADOS a propósito (ver D-033) ──────────────
// El objetivo de este reporte es armar el SAC teórico desde los acumuladores.
// Los chequeos de tope previsional y el gráfico de tributación de Ganancias se
// construyeron (D-031, D-032) y se replegaron: se iban del tema y arrastraban
// consideraciones que este control no puede sostener bien — la más clara, que
// el tope previsional del SAC no es el mensual (la cuota del SAC tiene su
// propio tope, del 50% del mensual), con lo cual el chequeo de topes estaba
// mal justo para lo único que este reporte calcula.
//
// El código queda entero y en su lugar. Para reactivarlo: poner esto en `true`
// — vuelven el chequeo de topes, el de "fuera de patrón", el gráfico y sus dos
// bloques del editor. Antes de hacerlo, resolver el tope propio del SAC.
const EXTRAS_GANANCIAS_HABILITADOS = false;

export const DEFAULT_ACUMULADORES_CONFIG = {
  regimen: 'RG4030',            // 'RG4003' (año calendario) | 'RG4030' (semestral)
  codigos: { ...ACUMULADORES },  // override por cliente, si otra cuenta Axton numera distinto
  // Umbrales de los chequeos de pantalla (Fase 1) — nunca se usan para tocar el
  // .xlsx exportado, sólo para "casos para revisar" en la pantalla de resultados.
  // El tope previsional es UNO SOLO y aplica sobre la BASE imponible, no sobre
  // el monto retenido: jubilación y obra social comparten la misma base máxima
  // y se diferencian por su alícuota. La retención máxima de cada uno sale de
  // `topeBaseImponible × alícuota`. El tope es un dato regulatorio (AFIP,
  // actualización RIPTE) que esta app NO puede inventar: queda en null (chequeo
  // apagado, con aviso) hasta que se cargue el valor vigente en el editor.
  topeBaseImponible:         null,  // base imponible máxima mensual (misma para 1120 y 1122)
  alicuotaJubilacion:        11,    // % sobre la base (Ley 24.241) — editable
  alicuotaObraSocial:        3,     // % sobre la base (Ley 23.660) — editable
  // Piso de Ganancias 4ta categoría: a diferencia del previsional, NO es un
  // número único para todos — depende de cargas de familia (soltero/casado/
  // hijos), que este control no tiene. Se carga sólo el caso más simple
  // (soltero, sin cargas) como referencia aproximada: el bruto mensual x 12 no
  // debería tener a nadie tributando por debajo. Se actualiza por AFIP cada
  // semestre (enero y julio) — hay que revisarlo con esa frecuencia.
  pisoGananciasMensual:      null,  // bruto mensual soltero sin cargas (AFIP, deducciones personales)
  saltoGrandeMultiplicador:  2,     // "salto grande" = el mes actual es > Nx o < 1/Nx el mes anterior
  checksEnabled: {
    reconciliacion: true,
    cuil:           true,
    sinMovimiento:  true,
    sacTeorico:     true,   // el chequeo central: ¿salió bien el SAC teórico?
    // Sólo si EXTRAS_GANANCIAS_HABILITADOS (ver arriba).
    fueraDePatron:  true,
    topes:          true,
  },
};

const ACCUM_FIELDS = [
  { key: 'brutoGanancias',     label: 'Bruto para ganancias (1100)' },
  { key: 'noRemGravado',       label: 'No Rem. gravado IIGG (1101)' },
  { key: 'retribNoHabituales', label: 'Retribuciones no habituales (1107)' },
  { key: 'sacPrimera',         label: 'SAC primera cuota (1108)' },
  { key: 'sacSegunda',         label: 'SAC segunda cuota (1109)' },
  { key: 'jubilacion',         label: 'Retención jubilación (1120)' },
  { key: 'sindicato',          label: 'Retención sindicato (1121)' },
  { key: 'obraSocial',         label: 'Retención obra social (1122)' },
  { key: 'excluyeSac',         label: 'Excluye del SAC teórico (1137)' },
  { key: 'retenciones',        label: 'Retenciones efectuadas (1150)' },
];

// Columnas de la hoja/solapa MM-AAAA (mes de proceso + SAC teórico acumulado)
const MES_CONCEPTS = [
  { key: 'brutoGanancias', label: 'Bruto para ganancias' },
  { key: 'retribNoHabit',  label: 'Retribuciones no habituales' },
  { key: 'noRemGravado',   label: 'No Rem. gravado IIGG' },
  { key: 'sacSegunda',     label: 'SAC segunda cuota' },
  { key: 'excluyeSac',     label: 'Excluye del SAC teórico' },
  { key: 'retJubilacion',  label: 'Ret. jubilación' },
  { key: 'retObraSocial',  label: 'Ret. obra social' },
  { key: 'retSindicato',   label: 'Ret. sindicato' },
  { key: 'retenciones',    label: 'Retenciones efectuadas' },
  { key: 'sacTeorico',     label: 'SAC TEÓRICO' },
];

// Columnas de la hoja/solapa DATOS (acumulado del año, del crudo más nuevo)
const DATOS_CONCEPTS = [
  { key: 'brutoGanancias', label: 'Bruto para ganancias' },
  { key: 'excluyeSac',     label: 'Excluye del SAC teórico' },
  { key: 'noRemGravado',   label: 'No Rem. gravado IIGG' },
  { key: 'retribNoHabit',  label: 'Retribuciones no habituales' },
  { key: 'sacPrimera',     label: 'SAC primera cuota' },
  { key: 'sacSegunda',     label: 'SAC segunda cuota' },
  { key: 'total',          label: 'TOTAL' },
  { key: 'retJubilacion',  label: 'Jubilación' },
  { key: 'retObraSocial',  label: 'Obra social' },
  { key: 'retSindicato',   label: 'Sindicato' },
  { key: 'impuesto',       label: 'IMPUESTO' },
];

// Conceptos que definen si un legajo "tuvo movimiento" en el mes de proceso
// (todos los de MES_CONCEPTS salvo el SAC teórico, que es acumulado de la ventana).
const MOVEMENT_KEYS = MES_CONCEPTS.filter(c => c.key !== 'sacTeorico').map(c => c.key);

// ── run() ──────────────────────────────────────────────────────────────────────

/**
 * @param {object[]} primaryRows - filas de TODOS los crudos subidos, cada una
 *   tageada con `_period` ('YYYY-MM') por initAcumuladoresMultiUpload.
 * @param {object[]} _tabRows - sin uso (tabRequired: false)
 * @param {object}   mapping  - { period, acumuladoresConfig }
 */
export function runAcumuladoresGanancias(primaryRows, _tabRows, mapping) {
  if (!primaryRows?.length) {
    return { error: 'No hay datos de Acumuladores. Subí al menos un crudo repacumuladores de Axton.' };
  }

  const cfgIn = mapping.acumuladoresConfig || {};
  const cfg = {
    ...DEFAULT_ACUMULADORES_CONFIG,
    ...cfgIn,
    codigos: { ...ACUMULADORES, ...(cfgIn.codigos || {}) },
  };
  const CODES = cfg.codigos;

  // Agrupar filas por período (un período = un crudo subido).
  const byPeriod = new Map();
  const sinPeriodo = new Set();
  for (const r of primaryRows) {
    if (!r._period) { sinPeriodo.add(r._fileName || '(archivo sin nombre)'); continue; }
    if (!byPeriod.has(r._period)) byPeriod.set(r._period, []);
    byPeriod.get(r._period).push(r);
  }
  if (sinPeriodo.size > 0) {
    return {
      error: `Falta asignar el período a ${sinPeriodo.size} archivo(s) de Acumuladores `
        + `(${[...sinPeriodo].join(', ')}). Volvé al Paso 2 y completalo antes de ejecutar.`,
    };
  }
  if (byPeriod.size === 0) {
    return { error: 'No hay datos de Acumuladores con período asignado.' };
  }

  const periods    = [...byPeriod.keys()].sort();
  const mesProceso = periods[periods.length - 1];

  // Por archivo: consolidar por legajo (SUMA = acumulado a mes anterior, mes =
  // valores propios del mes, sumando todas las liquidaciones del legajo).
  const perFile = new Map();
  for (const [period, rows] of byPeriod) perFile.set(period, consolidateFile(rows, CODES));

  const alerts = validateWindow(periods, mesProceso, cfg.regimen);

  // ── Tabla MM-AAAA: valores del mes de proceso + SAC teórico acumulado ───────
  const mesData    = perFile.get(mesProceso);
  const mesRows = [...mesData.porLegajo.entries()].map(([legajo, entry]) => {
    const val = key => entry.mes[CODES[key]] ?? null;

    const row = {
      legajo,
      nombre:          entry.nombre,
      cuil:            entry.cuil,
      brutoGanancias:  val('brutoGanancias'),
      retribNoHabit:   val('retribNoHabituales'),
      noRemGravado:    val('noRemGravado'),
      sacSegunda:      val('sacSegunda'),
      excluyeSac:      val('excluyeSac'),
      retJubilacion:   val('jubilacion'),
      retObraSocial:   val('obraSocial'),
      retSindicato:    val('sindicato'),
      retenciones:     val('retenciones'),
    };
    return row;
  });

  // SAC teórico = suma de las doceavas de TODOS los meses subidos, por legajo.
  // Se guarda además el desglose por período: los chequeos del SAC teórico
  // (parcial, doceava atípica) lo necesitan, y sin él no se puede explicar de
  // dónde sale el número que el analista está por mandar.
  const sacPorLegajo = new Map();  // legajo -> { total, porPeriodo: Map<period, doceava> }
  for (const [period, data] of perFile) {
    for (const [legajo, entry] of data.porLegajo) {
      const doceava = calcDoceava(entry.mes, CODES);
      if (doceava === null) continue;
      if (!sacPorLegajo.has(legajo)) sacPorLegajo.set(legajo, { total: 0, porPeriodo: new Map() });
      const sac = sacPorLegajo.get(legajo);
      sac.total = round2(sac.total + doceava);
      sac.porPeriodo.set(period, doceava);
    }
  }
  for (const row of mesRows) row.sacTeorico = sacPorLegajo.get(row.legajo)?.total ?? null;

  // ── Tabla DATOS: acumulado del año, SOLO del crudo más nuevo (SUMA + sus
  // propias filas de mes) — no se suman los crudos entre sí. ─────────────────
  const datosRows = [...mesData.porLegajo.entries()].map(([legajo, entry]) => {
    const val = key => {
      const nro = CODES[key];
      const s = entry.suma[nro];
      const m = entry.mes[nro];
      if (s === undefined && m === undefined) return null;
      return round2((s ?? 0) + (m ?? 0));
    };

    const brutoGanancias = val('brutoGanancias');
    const noRemGravado   = val('noRemGravado');
    const retribNoHabit  = val('retribNoHabituales');
    const sacPrimera     = val('sacPrimera');
    const sacSegunda     = val('sacSegunda');

    return {
      legajo,
      nombre:         entry.nombre,
      cuil:           entry.cuil,
      brutoGanancias,
      excluyeSac:     val('excluyeSac'),
      noRemGravado,
      retribNoHabit,
      sacPrimera,
      sacSegunda,
      // TOTAL = 1100 + 1101 + 1107 + 1108 + 1109 — sin 1137 (Excluye del SAC teórico).
      total:          round2(sumOrNull([brutoGanancias, noRemGravado, retribNoHabit, sacPrimera, sacSegunda])),
      retJubilacion:  val('jubilacion'),
      retObraSocial:  val('obraSocial'),
      retSindicato:   val('sindicato'),
      impuesto:       val('retenciones'),
    };
  });

  const checks = computeChecks({ mesRows, datosRows, sacPorLegajo, periods, mesProceso, cfg });

  // Referencia aproximada para el scatter: bruto mensual (soltero sin cargas) x
  // 12. Es un caso base, no un cálculo real de Ganancias — se documenta en
  // renderScatter y nunca se usa para nada más que dibujar esta línea.
  const pisoGananciasAnualAprox = (cfg.pisoGananciasMensual === null || cfg.pisoGananciasMensual === undefined)
    ? null
    : round2(cfg.pisoGananciasMensual * 12);

  return {
    mes:       { rows: mesRows },
    datos:     { rows: datosRows },
    period:    mapping.period || mesProceso,
    mesProceso,
    periods,
    regimen:   cfg.regimen,
    alerts,
    checks,
    pisoGananciasAnualAprox,
  };
}

/**
 * Chequeos de pantalla (nunca tocan el .xlsx exportado). El foco es el SAC
 * teórico, que es lo que este reporte existe para calcular:
 * - SAC teórico: no se pudo calcular / quedó parcial / dio negativo / una de
 *   las doceavas se sale de la línea de las otras del mismo legajo.
 * - reconciliación: TOTAL de DATOS recalculado independientemente vs. el ya
 *   almacenado — si algo raro pasó en el parseo/consolidación, esto lo marca.
 * - CUIL faltante y "sin movimiento en el mes": calidad del crudo de origen.
 * Los de tope previsional y tributación de Ganancias quedan detrás de
 * EXTRAS_GANANCIAS_HABILITADOS (ver D-033).
 */
function computeChecks({ mesRows, datosRows, sacPorLegajo, periods, mesProceso, cfg }) {
  const enabled = { ...DEFAULT_ACUMULADORES_CONFIG.checksEnabled, ...(cfg.checksEnabled || {}) };
  const issues = [];

  // ── Reconciliación aritmética (DATOS.total independiente del guardado) ─────
  let reconciliation = { total: 0, ok: 0 };
  if (enabled.reconciliacion) {
    reconciliation.total = datosRows.length;
    for (const row of datosRows) {
      const expected = round2(sumOrNull([row.brutoGanancias, row.noRemGravado, row.retribNoHabit, row.sacPrimera, row.sacSegunda]));
      const stored   = row.total;
      const bothNull = expected === null && stored === null;
      if (bothNull || (expected !== null && stored !== null && Math.abs(expected - stored) <= 0.01)) {
        reconciliation.ok++;
      } else {
        issues.push({
          type: 'reconciliacion', sev: 'hi', legajo: row.legajo, nombre: row.nombre,
          what: 'El TOTAL de DATOS no coincide con la suma de sus componentes.',
          why:  `Calculado: ${fmtNum(expected)} · Guardado: ${fmtNum(stored)}.`,
        });
      }
    }
  }

  // ── CUIL faltante ───────────────────────────────────────────────────────────
  if (enabled.cuil) {
    for (const row of datosRows) {
      if (!row.cuil) {
        issues.push({
          // 'minor': calidad del dato de origen, no una diferencia a revisar —
          // va a "Observaciones menores", no al listado principal (ver D-027 / spec §2).
          type: 'cuil', sev: 'minor', legajo: row.legajo, nombre: row.nombre,
          what: 'No trae CUIL en el crudo de Axton.',
          why:  'Puede ser un dato faltante en el origen — no bloquea el reporte.',
        });
      }
    }
  }

  // ── Sin movimiento en el mes de proceso (alerta SIEMPRE genérica) ──────────
  if (enabled.sinMovimiento) {
    for (const row of mesRows) {
      if (!hasMovement(row)) {
        issues.push({
          type: 'sinMovimiento', sev: 'lo', legajo: row.legajo, nombre: row.nombre,
          what: 'Sin movimiento en el mes de proceso.',
          why:  'Puede deberse a una licencia, un egreso o una liquidación aún no cargada — revisar con el Tabulado, que este control no usa.',
        });
      }
    }
  }

  // ── SAC teórico: el chequeo central de este reporte ────────────────────────
  // Un solo caso por legajo, del más grave al menos: si no se pudo calcular no
  // tiene sentido además decir que quedó parcial.
  let sacStats = { total: mesRows.length, calculados: 0 };
  if (enabled.sacTeorico) {
    const mult = cfg.saltoGrandeMultiplicador || DEFAULT_ACUMULADORES_CONFIG.saltoGrandeMultiplicador;

    for (const row of mesRows) {
      const sac = sacPorLegajo.get(row.legajo);

      // No liquidó en ningún mes de la ventana: no hay doceava de dónde sacarlo.
      if (!sac || sac.porPeriodo.size === 0) {
        issues.push({
          type: 'sacNoCalculado', sev: 'hi', legajo: row.legajo, nombre: row.nombre,
          what: 'No se pudo calcular el SAC teórico.',
          why:  'No tiene valores propios del mes en ninguno de los crudos subidos, así que no hay doceava que acumular. Sale en cero en el .xlsx.',
        });
        continue;
      }
      sacStats.calculados++;

      // Negativo: las deducciones del mes superaron al gravado.
      if (sac.total < -0.01) {
        issues.push({
          type: 'sacNegativo', sev: 'hi', legajo: row.legajo, nombre: row.nombre,
          what: `SAC teórico negativo: ${fmtNum(sac.total)}.`,
          why:  'En algún mes las deducciones (jubilación, obra social, sindicato, excluidos) superaron al gravado. Revisar ese mes antes de mandar el archivo.',
        });
        continue;
      }

      // Parcial: le faltan meses de la ventana. El mes de proceso no cuenta acá
      // — ese caso ya lo reporta "sin movimiento en el mes", no se duplica.
      const faltan = periods.filter(p => p !== mesProceso && !sac.porPeriodo.has(p));
      if (faltan.length > 0) {
        issues.push({
          type: 'sacParcial', sev: 'lo', legajo: row.legajo, nombre: row.nombre,
          what: `SAC teórico armado con ${sac.porPeriodo.size} de ${periods.length} meses de la ventana.`,
          why:  `Sin doceava en: ${faltan.map(periodToLabel).join(', ')}. Puede ser un alta posterior o una licencia — el SAC teórico queda proporcional a lo que sí liquidó.`,
        });
        continue;
      }

      // Una doceava que se sale de la línea de las otras del mismo legajo.
      if (sac.porPeriodo.size >= 2) {
        const vals    = [...sac.porPeriodo.values()].sort((a, b) => a - b);
        const mediana = vals[Math.floor(vals.length / 2)];
        if (mediana > 0.01) {  // con mediana ~0 o negativa la razón no dice nada
          for (const [period, v] of sac.porPeriodo) {
            const ratio = v / mediana;
            if (ratio > mult || ratio < 1 / mult) {
              issues.push({
                type: 'doceavaAtipica', sev: 'lo', legajo: row.legajo, nombre: row.nombre,
                what: `La doceava de ${periodToLabel(period)} se sale de la línea de los otros meses.`,
                why:  `${periodToLabel(period)}: ${fmtNum(v)} · mediana de sus meses: ${fmtNum(mediana)}. Puede ser un retroactivo o una liquidación extra — mirar que el SAC teórico no quede inflado.`,
              });
              break;  // un solo aviso por legajo, aunque se salgan varios meses
            }
          }
        }
      }
    }
  }

  // ── Fuera de patrón de tributación ─────────────────────────────────────────
  // No se le retuvo nada en el año, pero su total anual está por encima del
  // total más bajo al que SÍ se le retuvo. Es lo único afirmable sin la escala
  // legal — y se dice en neutral: puede haber deducciones que lo expliquen.
  if (EXTRAS_GANANCIAS_HABILITADOS && enabled.fueraDePatron) {
    const conImpuesto = datosRows.filter(r => isVal(r.total) && r.impuesto !== null && r.impuesto > 0.01);
    if (conImpuesto.length > 0) {
      const minTrib = Math.min(...conImpuesto.map(r => r.total));
      for (const row of datosRows) {
        if (!isVal(row.total) || row.total < minTrib) continue;
        if (row.impuesto !== null && row.impuesto > 0.01) continue;
        issues.push({
          type: 'fueraDePatron', sev: 'hi', legajo: row.legajo, nombre: row.nombre,
          what: 'Total anual sobre el piso de tributación, pero sin impuesto retenido.',
          why:  `Total anual: ${fmtNum(row.total)} · El más bajo con retención es ${fmtNum(minTrib)}. `
            + 'Puede tener deducciones que lo justifiquen (SIRADIG, cargas de familia) — la app no las ve.',
        });
      }
    }
  }

  // ── Coherencia de topes (sólo si están configurados) ───────────────────────
  const coherenceChecks = [];
  if (EXTRAS_GANANCIAS_HABILITADOS && enabled.topes) {
    // Un solo tope de base imponible; cada concepto deriva su techo por alícuota.
    const base = cfg.topeBaseImponible;
    const techo = alic => (base === null || base === undefined) ? null : round2(base * (alic / 100));
    const topeChecks = [
      { key: 'retJubilacion', tope: techo(cfg.alicuotaJubilacion ?? 11), alic: cfg.alicuotaJubilacion ?? 11, label: 'Retención de jubilación bajo el tope' },
      { key: 'retObraSocial', tope: techo(cfg.alicuotaObraSocial ?? 3),  alic: cfg.alicuotaObraSocial ?? 3,  label: 'Retención de obra social bajo el tope' },
    ];
    for (const tc of topeChecks) {
      if (tc.tope === null || tc.tope === undefined) {
        coherenceChecks.push({ label: tc.label, detail: 'sin base imponible máxima configurada', ok: true });
        continue;
      }
      const excedidos = mesRows.filter(r => r[tc.key] !== null && r[tc.key] > tc.tope);
      for (const row of excedidos) {
        issues.push({
          type: 'tope', sev: 'lo', legajo: row.legajo, nombre: row.nombre,
          what: `${tc.label.replace(' bajo el tope', '')} supera el techo del tope.`,
          why:  `Retenido: ${fmtNum(row[tc.key])} · Techo: ${fmtNum(tc.tope)} (${tc.alic}% de la base máxima ${fmtNum(base)}).`,
        });
      }
      coherenceChecks.push({ label: tc.label, detail: `${mesRows.length - excedidos.length}/${mesRows.length}`, ok: excedidos.length === 0 });
    }
  }
  if (enabled.reconciliacion) {
    coherenceChecks.unshift({
      label: 'Reconciliación aritmética',
      detail: `${reconciliation.ok}/${reconciliation.total}`,
      ok: reconciliation.ok === reconciliation.total,
    });
  }
  // El del SAC teórico va primero: es lo que este reporte viene a hacer.
  if (enabled.sacTeorico) {
    coherenceChecks.unshift({
      label: 'SAC teórico calculado',
      detail: `${sacStats.calculados}/${sacStats.total}`,
      ok: sacStats.calculados === sacStats.total,
    });
  }

  return { reconciliation, sacStats, issues, coherenceChecks };
}

/** Consolida las filas de un crudo por legajo: { suma: {nro: total}, mes: {nro: total}, nombre, cuil }. */
function consolidateFile(rows) {
  const porLegajo = new Map();
  for (const r of rows) {
    if (!porLegajo.has(r.legajo)) porLegajo.set(r.legajo, { suma: {}, mes: {}, nombre: '', cuil: '' });
    const entry = porLegajo.get(r.legajo);
    if (!entry.nombre && r.apellido_nombre) entry.nombre = r.apellido_nombre;
    if (!entry.cuil && r.cuil) entry.cuil = r.cuil;

    if (r.valor === null) continue;  // sin valor: no aporta ni marca el concepto como presente
    const bucket = r.operacion === 'SUMA' ? entry.suma : entry.mes;
    bucket[r.nro] = (bucket[r.nro] ?? 0) + r.valor;
  }
  return { porLegajo };
}

/**
 * Doceava parte del mes sobre los valores propios (no SUMA):
 *   (Bruto + Retrib.NoHabit + NoRemGravado + SAC2da − Excluye − Jub − ObraSoc − Sindicato) / 12
 * SAC primera cuota y Retenciones no entran (ver spec). Si el legajo no tiene
 * NINGÚN valor ese mes (no liquidó), la doceava es null — se excluye del acumulado,
 * no se cuenta como cero.
 */
function calcDoceava(mesBucket, CODES) {
  const keys = ['brutoGanancias', 'retribNoHabituales', 'noRemGravado', 'sacSegunda', 'excluyeSac', 'jubilacion', 'obraSocial', 'sindicato'];
  const hasAny = keys.some(k => mesBucket[CODES[k]] !== undefined);
  if (!hasAny) return null;

  const g = k => mesBucket[CODES[k]] ?? 0;
  const total = g('brutoGanancias') + g('retribNoHabituales') + g('noRemGravado') + g('sacSegunda')
    - g('excluyeSac') - g('jubilacion') - g('obraSocial') - g('sindicato');
  return round2(total / 12);
}

/**
 * RG 4003 = enero → mes de proceso. RG 4030 = inicio del semestre (ene o jul) →
 * mes de proceso. Valida, no recorta: sólo avisa si falta o sobra un crudo.
 */
function validateWindow(periods, mesProceso, regimen) {
  const [y, m] = mesProceso.split('-').map(Number);
  const startMonth = regimen === 'RG4003' ? 1 : (m <= 6 ? 1 : 7);

  const expected = [];
  for (let mm = startMonth; mm <= m; mm++) expected.push(`${y}-${String(mm).padStart(2, '0')}`);

  const have    = new Set(periods);
  const missing = expected.filter(p => !have.has(p));
  const extra   = periods.filter(p => !expected.includes(p));

  const regimenLabel = regimen === 'RG4003' ? 'RG 4003' : 'RG 4030';
  const alerts = [];
  if (missing.length > 0) {
    alerts.push({
      type: 'warning',
      text: `Faltan crudos de ${missing.length} mes(es) para ${regimenLabel}: ${missing.map(periodToLabel).join(', ')}.`,
    });
  }
  if (extra.length > 0) {
    alerts.push({
      type: 'warning',
      text: `Hay ${extra.length} archivo(s) fuera de la ventana esperada de ${regimenLabel}: ${extra.map(periodToLabel).join(', ')}.`,
    });
  }
  return alerts;
}

function hasMovement(row) {
  return MOVEMENT_KEYS.some(k => row[k] !== null && Math.abs(row[k]) > 0.01);
}

function isVal(v) {
  return v !== null && Math.abs(v) > 0.01;
}

function sumOrNull(values) {
  if (values.every(v => v === null)) return null;
  return values.reduce((acc, v) => acc + (v ?? 0), 0);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ── summarize() ────────────────────────────────────────────────────────────────

export function summarizeAcumuladoresGanancias(results) {
  if (results.error) {
    return {
      status: 'error', headline: results.error, insights: [],
      unit: null, unitsTotal: null, unitsWithDiff: null,
      diffTotalAmount: null, worstCase: null, contextNote: null,
    };
  }

  const totalLegajos  = results.datos.rows.length;
  const conMovimiento = results.mes.rows.filter(hasMovement).length;
  const regimenLabel  = results.regimen === 'RG4003' ? 'RG 4003' : 'RG 4030';

  const insights = [];
  if (results.alerts.length) insights.push({ type: 'warning', label: 'alertas de ventana de meses', value: results.alerts.length });
  if (results.checks?.issues.length) insights.push({ type: 'warning', label: 'casos para revisar', value: results.checks.issues.length });

  return {
    status:   'info',
    headline: `${totalLegajos} legajos · ${conMovimiento} con movimiento en ${periodToLabel(results.mesProceso)} · ${regimenLabel}`,
    insights,
    unit: null, unitsTotal: null, unitsWithDiff: null,
    diffTotalAmount: null, worstCase: null, contextNote: null,
  };
}

// ── Pantalla de resultados ────────────────────────────────────────────────────

// NOTA de diseño (D-027): esta pantalla usa 3 solapas (Resumen · Fichas ·
// Planilla) en vez de las 2 (Resumen/Detalle) de `renderResumenDetalle()` que
// usan los otros 9 controles — Guillermo pidió explícitamente las tres
// direcciones como vistas separadas. Se arma con `initTabs` directamente.
// El veredicto queda SIEMPRE visible arriba, afuera de las solapas.
export function renderAcumuladoresResults(results, container) {
  if (results.error) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(results.error)}</p>`;
    return;
  }

  const { mes, datos, alerts, mesProceso, periods, regimen, checks } = results;

  if (datos.rows.length === 0) {
    container.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">Sin datos.</p>`;
    return;
  }

  const mesConMov   = mes.rows.filter(hasMovement);
  const sinMovCount = mes.rows.length - mesConMov.length;
  const sacTeoricoTotal = mes.rows.reduce((acc, r) => acc + (r.sacTeorico ?? 0), 0);
  const regimenLabel = regimen === 'RG4003' ? 'RG 4003' : 'RG 4030';
  const { reconciliation, sacStats, issues, coherenceChecks } = checks;

  container.innerHTML = '';

  // ── Veredicto ──────────────────────────────────────────────────────────────
  // El titular es siempre sobre el SAC teórico: es lo que este reporte calcula.
  const reconciliaOk = reconciliation.total === 0 || reconciliation.ok === reconciliation.total;
  const sinCalcular  = (sacStats?.total ?? 0) - (sacStats?.calculados ?? 0);
  const tone = !reconciliaOk || sinCalcular > 0 ? 'warn' : issues.length > 0 ? 'warn' : 'ok';
  const title = !reconciliaOk
    ? `${reconciliation.total - reconciliation.ok} reconciliación(es) no cierran — revisar antes de usar este reporte`
    : sinCalcular > 0
      ? `SAC teórico calculado para ${sacStats.calculados} de ${sacStats.total} legajos — ${sinCalcular} sin calcular`
      : issues.length > 0
        ? `SAC teórico calculado para los ${sacStats.total} legajos, con ${issues.length} caso(s) para revisar`
        : `SAC teórico calculado para los ${sacStats.total} legajos, sin casos para revisar`;
  renderVerdict(container, {
    tone, title,
    body: `${periodToLabel(mesProceso)} · ${regimenLabel} · ${periods.length} mes(es) en la ventana.`,
  });

  // ── Alertas de la validación de ventana ────────────────────────────────────
  if (alerts.length > 0) {
    const box = document.createElement('div');
    box.style.cssText = 'margin:var(--sp-3);padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-warning);border-radius:var(--radius-md);background:var(--color-surface);';
    box.innerHTML = alerts.map(a => `<div style="font-size:var(--text-sm);">⚠ ${esc(a.text)}</div>`).join('');
    container.appendChild(box);
  }

  // ── Solapas Resumen · Fichas · Planilla ────────────────────────────────────
  const tabsHost = document.createElement('div');
  container.appendChild(tabsHost);

  initTabs(tabsHost, {
    tabs: [
      { id: 'resumen',  label: 'Resumen',  render: (panel) => renderResumenTab(panel, {
          datos, mesRows: mes.rows, sinMovCount, sacTeoricoTotal, periods, regimenLabel, issues, coherenceChecks,
          sinCalcular, pisoGananciasAnualAprox: results.pisoGananciasAnualAprox,
        }) },
      { id: 'fichas',   label: 'Fichas',   render: (panel) => renderFichasTab(panel, { mes, datos, issues }) },
      { id: 'planilla', label: 'Planilla', render: (panel) => renderPlanillaTab(panel, {
          mesConMov, datos, sinMovCount, mesProceso,
        }) },
    ],
    activeId: getViewPreference('acumuladores_ganancias').tab,
    onChange(id) { setViewPreference('acumuladores_ganancias', { tab: id }); },
  });

  // ── Export único (arma el .xlsx con ambas hojas) ──────────────────────────
  const exportBar = document.createElement('div');
  exportBar.className = 'results-toolbar';
  exportBar.style.justifyContent = 'flex-end';
  container.appendChild(exportBar);

  const csvHeaders = ['Legajo', 'Apellido y Nombre', ...MES_CONCEPTS.map(c => c.label)];
  const csvRows = () => mesConMov.map(r => [r.legajo, r.nombre, ...MES_CONCEPTS.map(c => fmtNum(r[c.key]))]);

  renderExportMenu(exportBar, {
    onExcel: () => exportAcumuladoresToXlsx(results),
    onCsv:   () => downloadCsv(csvHeaders, csvRows(), `Acumuladores_Ganancias_${mesProceso}.csv`),
    onCopy:  () => copyRowsToClipboard(csvHeaders, csvRows()),
  });
}

// ── Dirección A — Resumen (tiles + casos para revisar + chequeos + scatter) ──

function renderResumenTab(panel, { datos, mesRows, sinMovCount, sacTeoricoTotal, periods, regimenLabel, issues, coherenceChecks, sinCalcular, pisoGananciasAnualAprox }) {
  renderTiles(panel, [
    { label: 'Legajos', value: datos.rows.length },
    { label: 'SAC teórico total', value: fmtNum(sacTeoricoTotal) },
    { label: 'Sin SAC teórico', value: sinCalcular ?? 0, tone: (sinCalcular ?? 0) > 0 ? 'warn' : undefined,
      sub: 'no liquidaron en ningún mes' },
    { label: 'Sin movimiento en el mes', value: sinMovCount, tone: sinMovCount > 0 ? 'warn' : undefined },
    { label: 'Meses en ventana', value: periods.length, sub: regimenLabel },
  ]);

  const mainIssues  = issues.filter(i => i.sev !== 'minor');
  const minorIssues = issues.filter(i => i.sev === 'minor');
  const mainLegajos = new Set(mainIssues.map(i => i.legajo)).size;

  if (mainIssues.length > 0) {
    renderIssues(panel, {
      heading: `Casos para revisar · ${mainLegajos} legajo${mainLegajos === 1 ? '' : 's'}`,
      items: mainIssues.map(i => ({
        sev: i.sev, who: `Legajo ${i.legajo} — ${i.nombre}`, what: i.what, why: i.why,
      })),
    });
  } else {
    const p = document.createElement('p');
    p.className = 'text-muted';
    p.style.cssText = 'font-size:var(--text-sm);margin:var(--sp-3);';
    p.textContent = 'Sin casos para revisar.';
    panel.appendChild(p);
  }

  if (minorIssues.length > 0) {
    renderMinorObservations(panel, minorIssues.map(i => ({
      who: `Legajo ${i.legajo} — ${i.nombre}`, what: i.what, why: i.why,
    })));
  }

  renderChecks(panel, { heading: 'Chequeos de coherencia', items: coherenceChecks });

  if (EXTRAS_GANANCIAS_HABILITADOS) renderScatter(panel, datos.rows, pisoGananciasAnualAprox);
}

/**
 * Dispersión total anual gravado (DATOS.total) vs. impuesto retenido
 * (DATOS.impuesto = acumulador 1150). Ojo: la app **no calcula** el impuesto —
 * lo lee tal cual del crudo de Axton. Acá sólo lo grafica.
 *
 * El "piso real de tributación" es el total anual MÁS BAJO entre los legajos a
 * los que Axton efectivamente les retuvo algo. Es un valor observado en estos
 * datos, NO el mínimo no imponible legal (que la app no conoce). Sirve para lo
 * único que puede afirmarse sin la escala: a la derecha de esa línea y sobre el
 * eje (impuesto 0) no debería haber casi nadie — quien caiga ahí queda como
 * "fuera de patrón", en texto neutral, nunca como error (spec §3, caso 1561).
 *
 * `pisoGananciasAnualAprox`, si está cargado, agrega una SEGUNDA línea: el piso
 * legal aproximado de Ganancias (bruto mensual soltero sin cargas × 12, dato de
 * AFIP). Es el caso más simple posible — no vale para nadie con cónyuge o
 * hijos — y sólo sirve para comparar de un vistazo contra el piso observado:
 * si están muy lejos uno del otro, algo amerita revisión (código de acumulador
 * mal mapeado, deducciones atípicas, etc.), nunca una certeza por sí sola.
 */
function renderScatter(panel, datosRows, pisoGananciasAnualAprox = null) {
  // `impuesto === null` = el crudo no trae fila 1150 para ese legajo, o sea que
  // no se le retuvo nada. Para el gráfico eso es un 0 real (mismo criterio que
  // el chequeo `fueraDePatron`), no un "sin dato" que haya que excluir.
  const points = datosRows
    .filter(r => isVal(r.total) && r.total > 0)
    .map(r => ({ legajo: r.legajo, nombre: r.nombre, x: r.total, y: Math.max(0, r.impuesto ?? 0) }));

  if (points.length < 3) return; // muy pocos puntos para que un gráfico aporte algo

  const tributan = points.filter(p => p.y > 0.01);
  if (tributan.length === 0) return;
  const minTrib = Math.min(...tributan.map(p => p.x)); // piso real observado

  // 't' tributa · 'f' fuera de patrón (no tributa pero está sobre el piso) · 'n' no tributa
  const clase = p => p.y > 0.01 ? 't' : (p.x >= minTrib ? 'f' : 'n');
  const grupos = { t: 0, n: 0, f: 0 };
  for (const p of points) grupos[clase(p)]++;

  const maxX = Math.max(...points.map(p => p.x), pisoGananciasAnualAprox ?? 0);
  const maxY = Math.max(...points.map(p => p.y));
  // MT deja aire arriba para que el rótulo del eje Y no se pise con el tick más alto.
  const W = 720, H = 310, ML = 62, MR = 14, MT = 28, MB = 40;
  const pw = W - ML - MR, ph = H - MT - MB;
  const sx = v => ML + (v / maxX) * pw;
  const sy = v => MT + ph - (v / maxY) * ph;

  const ticks = (max, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max / n) * i);
  const fmtM = v => v === 0 ? '0' : `${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;

  const COLORS = { t: 'var(--color-primary)', n: 'var(--color-text-muted)', f: 'var(--color-warning)' };

  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin:var(--sp-3);padding:var(--sp-3) var(--sp-4);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);overflow-x:auto;';
  wrap.innerHTML = `
    <div class="rb-section-h">¿Quién tributa? — total anual gravado vs. impuesto retenido</div>
    <p class="text-muted" style="font-size:var(--text-sm);margin:0 0 var(--sp-2);">
      Cada punto es un legajo. <strong>${grupos.t} de ${points.length}</strong>
      (${Math.round(grupos.t / points.length * 100)}%) tienen impuesto retenido. La línea marca el total anual
      más bajo que sí tributa: <strong>${fmtNum(minTrib)}</strong>. A su derecha, sobre el eje, no debería
      haber casi nadie${grupos.f > 0 ? ` — y hay ${grupos.f}` : ''}.
    </p>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;overflow:visible;" role="img"
      aria-label="Dispersión de total anual gravado contra impuesto retenido por legajo">
      ${ticks(maxY).map(v => `
        <line x1="${ML}" y1="${sy(v).toFixed(1)}" x2="${W - MR}" y2="${sy(v).toFixed(1)}" stroke="var(--color-border)" stroke-width="1"/>
        <text x="${ML - 9}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--color-text-muted)">${fmtM(v)}</text>
      `).join('')}
      ${ticks(maxX).map(v => `
        <text x="${sx(v).toFixed(1)}" y="${H - MB + 18}" text-anchor="middle" font-size="10" fill="var(--color-text-muted)">${fmtM(v)}</text>
      `).join('')}
      <line x1="${sx(minTrib).toFixed(1)}" y1="${MT}" x2="${sx(minTrib).toFixed(1)}" y2="${MT + ph}"
        stroke="var(--color-warning)" stroke-width="2"/>
      <text x="${(sx(minTrib) + 7).toFixed(1)}" y="${MT + 12}" font-size="10.5" fill="var(--color-warning)" font-weight="700">
        Piso real de tributación · ${fmtM(minTrib)}
      </text>
      ${pisoGananciasAnualAprox !== null ? `
        <line x1="${sx(pisoGananciasAnualAprox).toFixed(1)}" y1="${MT}" x2="${sx(pisoGananciasAnualAprox).toFixed(1)}" y2="${MT + ph}"
          stroke="var(--color-text-muted)" stroke-width="2" stroke-dasharray="5 4"/>
        <text x="${(sx(pisoGananciasAnualAprox) + 7).toFixed(1)}" y="${MT + ph - 6}" font-size="10.5" fill="var(--color-text-muted)" font-weight="700">
          Piso AFIP aprox. (soltero sin cargas) · ${fmtM(pisoGananciasAnualAprox)}
        </text>
      ` : ''}
      ${points.map(p => {
        const c = clase(p);
        return `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${c === 'f' ? 6 : 4}"
          fill="${COLORS[c]}"${c === 'n' ? ' opacity="0.45"' : ''}${c === 'f' ? ' stroke="var(--color-surface)" stroke-width="2"' : ''}>
          <title>Legajo ${esc(p.legajo)} — ${esc(p.nombre)}: total anual ${fmtNum(p.x)} · impuesto ${fmtNum(p.y)}</title>
        </circle>`;
      }).join('')}
      <text x="${ML}" y="${H - 4}" font-size="10" fill="var(--color-text-muted)">Total anual gravado (bruto + no rem. + retribuciones + SAC)</text>
      <text x="6" y="12" font-size="10" fill="var(--color-text-muted)">Impuesto</text>
    </svg>
    <div style="display:flex;gap:var(--sp-4);flex-wrap:wrap;font-size:var(--text-sm);margin-top:var(--sp-2);">
      <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${COLORS.t};"></span> Tributa (${grupos.t})</span>
      <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${COLORS.n};opacity:.45;"></span> No tributa (${grupos.n})</span>
      <span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${COLORS.f};"></span> Fuera de patrón (${grupos.f})</span>
    </div>
    <p class="text-muted" style="font-size:var(--text-sm);margin-top:var(--sp-2);">
      El piso naranja sale de estos datos (el total más bajo con retención), no de la escala del art. 94 ni del
      mínimo no imponible legal. Un "fuera de patrón" puede tener deducciones que lo expliquen (SIRADIG, cargas
      de familia); es un caso para mirar, no un error confirmado.
      ${pisoGananciasAnualAprox !== null ? `
        La línea gris es la referencia de AFIP para el caso más simple (soltero, sin cargas) — no aplica a
        quien tenga cónyuge o hijos, y se actualiza cada semestre (enero y julio).
        ${Math.abs(minTrib - pisoGananciasAnualAprox) / pisoGananciasAnualAprox > 0.3
          ? ' Están bastante alejadas entre sí — vale la pena revisar el mapeo de acumuladores o la configuración del régimen.'
          : ' Están razonablemente cerca.'}
      ` : ' Cargá el piso de Ganancias en el editor de umbrales para compararlo contra este valor observado.'}
    </p>
  `;
  panel.appendChild(wrap);
}

// ── Dirección B — Fichas por legajo ──────────────────────────────────────────

function renderFichasTab(panel, { mes, datos, issues }) {
  const issuesByLegajo = new Map();
  for (const i of issues) {
    if (!issuesByLegajo.has(i.legajo)) issuesByLegajo.set(i.legajo, []);
    issuesByLegajo.get(i.legajo).push(i);
  }
  const mesByLegajo = new Map(mes.rows.map(r => [r.legajo, r]));

  const fichas = datos.rows.map(d => {
    const legajoIssues = issuesByLegajo.get(d.legajo) || [];
    return {
      legajo: d.legajo, nombre: d.nombre, cuil: d.cuil,
      datos: d, mes: mesByLegajo.get(d.legajo) || null,
      tieneMovimiento: mesByLegajo.has(d.legajo) ? hasMovement(mesByLegajo.get(d.legajo)) : false,
      issues: legajoIssues,
      revisar: legajoIssues.filter(i => i.sev !== 'minor'),
      minorWhats: [...new Set(legajoIssues.filter(i => i.sev === 'minor').map(i => i.what))],
    };
  });

  // Opciones del filtro de severidad — derivadas de los issues presentes en
  // este run, no hardcodeadas: "Con algo para revisar" agrupa todo lo no-minor,
  // y cada texto `minor` distinto (ej. "no trae CUIL") es su propia opción,
  // separada de "revisar" (D-027 / spec §3).
  const minorTexts = [...new Set(fichas.flatMap(f => f.minorWhats))];
  const filterOptions = [
    { value: 'todos', label: `Todos (${fichas.length})` },
    { value: 'revisar', label: `Con algo para revisar (${fichas.filter(f => f.revisar.length > 0).length})` },
    ...minorTexts.map((what, idx) => ({
      value: `minor:${idx}`, what,
      label: `${what} (${fichas.filter(f => f.minorWhats.includes(what)).length})`,
    })),
    { value: 'sinMov', label: `Sin movimiento (${fichas.filter(f => !f.tieneMovimiento).length})` },
  ];

  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  toolbar.innerHTML = `
    <input type="text" class="form-input" data-fichas-search placeholder="Buscar legajo o nombre…" style="max-width:220px;padding:6px 10px;">
    <select class="form-input" data-fichas-filter style="max-width:260px;">
      ${filterOptions.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}
    </select>
    <select class="form-input" data-fichas-sort style="max-width:200px;">
      <option value="bruto">Mayor bruto (DATOS)</option>
      <option value="sacTeorico">Mayor SAC teórico</option>
      <option value="legajo">Legajo</option>
      <option value="nombre">Nombre</option>
    </select>
  `;
  panel.appendChild(toolbar);

  const listHost = document.createElement('div');
  listHost.className = 'fichas-list';
  panel.appendChild(listHost);

  const searchEl = toolbar.querySelector('[data-fichas-search]');
  const filterEl = toolbar.querySelector('[data-fichas-filter]');
  const sortEl   = toolbar.querySelector('[data-fichas-sort]');

  function apply() {
    const q = searchEl.value.trim().toLowerCase();
    const filter = filterEl.value;
    const sort = sortEl.value;

    let shown = fichas.filter(f => {
      if (q && !`${f.legajo} ${f.nombre}`.toLowerCase().includes(q)) return false;
      if (filter === 'revisar' && f.revisar.length === 0) return false;
      if (filter === 'sinMov' && f.tieneMovimiento) return false;
      if (filter.startsWith('minor:')) {
        const what = minorTexts[Number(filter.split(':')[1])];
        if (!f.minorWhats.includes(what)) return false;
      }
      return true;
    });

    shown = shown.slice().sort((a, b) => {
      if (sort === 'bruto') return (b.datos.total ?? 0) - (a.datos.total ?? 0);
      if (sort === 'sacTeorico') return (b.mes?.sacTeorico ?? 0) - (a.mes?.sacTeorico ?? 0);
      if (sort === 'nombre') return a.nombre.localeCompare(b.nombre);
      return String(a.legajo).localeCompare(String(b.legajo), undefined, { numeric: true });
    });

    renderFichasList(listHost, shown);
  }

  searchEl.addEventListener('input', apply);
  filterEl.addEventListener('change', apply);
  sortEl.addEventListener('change', apply);
  apply();
}

function renderFichasList(host, fichas) {
  if (fichas.length === 0) {
    host.innerHTML = `<p class="text-muted" style="padding:var(--sp-3);">Ningún legajo coincide con el filtro.</p>`;
    return;
  }

  host.innerHTML = fichas.map(f => `
    <details class="ficha-card" style="border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:var(--sp-2);background:var(--color-surface);">
      <summary style="cursor:pointer;padding:var(--sp-2) var(--sp-3);display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap;list-style:none;">
        <strong>${esc(f.legajo)}</strong>
        <span>${esc(f.nombre)}</span>
        ${f.revisar.length > 0 ? `<span class="text-muted" style="font-size:var(--text-sm);">⚠ ${f.revisar.length} para revisar</span>` : ''}
        ${f.minorWhats.map(w => `<span class="rb-chip-minor" title="${esc(w)}">${esc(w.length > 28 ? w.slice(0, 27) + '…' : w)}</span>`).join('')}
        ${!f.tieneMovimiento ? `<span class="text-muted" style="font-size:var(--text-sm);">sin movimiento en el mes</span>` : ''}
        <span style="margin-left:auto;font-size:var(--text-sm);" class="text-muted">TOTAL: ${fmtNum(f.datos.total)}</span>
      </summary>
      <div style="padding:0 var(--sp-3) var(--sp-3);display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4);">
        <div>
          <div class="rb-section-h">Mes de proceso</div>
          ${f.mes ? MES_CONCEPTS.filter(c => isVal(f.mes[c.key])).map(c => `
            <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);padding:2px 0;">
              <span class="text-muted">${esc(c.label)}</span><span>${fmtNum(f.mes[c.key])}</span>
            </div>`).join('') || '<p class="text-muted" style="font-size:var(--text-sm);">Sin movimiento.</p>'
            : '<p class="text-muted" style="font-size:var(--text-sm);">Sin movimiento.</p>'}
        </div>
        <div>
          <div class="rb-section-h">Acumulado del año (DATOS)</div>
          ${DATOS_CONCEPTS.filter(c => isVal(f.datos[c.key])).map(c => `
            <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);padding:2px 0;">
              <span class="text-muted">${esc(c.label)}</span><span>${fmtNum(f.datos[c.key])}</span>
            </div>`).join('')}
        </div>
      </div>
      ${f.issues.length > 0 ? `
        <div style="padding:0 var(--sp-3) var(--sp-3);">
          ${f.issues.map(i => `<div style="font-size:var(--text-sm);color:var(--color-text-muted);">${i.sev === 'minor' ? 'i' : '⚠'} ${esc(i.what)}</div>`).join('')}
        </div>` : ''}
    </details>
  `).join('');
}

// ── Dirección C — Planilla (la tabla completa, con sticky) ───────────────────

function renderPlanillaTab(panel, { mesConMov, datos, sinMovCount, mesProceso }) {
  const tabsHost = document.createElement('div');
  panel.appendChild(tabsHost);

  initTabs(tabsHost, {
    tabs: [
      { id: 'mes',   label: periodToLabel(mesProceso), render: (p) => renderConceptTable(p, {
          rows: mesConMov, concepts: MES_CONCEPTS,
          emptyMessage: 'Ningún legajo tiene movimiento en este período.',
          footnote: `Mostrando ${mesConMov.length} legajo${mesConMov.length === 1 ? '' : 's'} con movimiento en el mes.`
            + (sinMovCount > 0 ? ` El .xlsx incluye además los ${sinMovCount} legajo${sinMovCount === 1 ? '' : 's'} sin movimiento, en cero.` : ''),
        }) },
      { id: 'datos', label: 'DATOS (acumulado)', render: (p) => renderConceptTable(p, {
          rows: datos.rows, concepts: DATOS_CONCEPTS,
          emptyMessage: 'Sin datos acumulados.',
          footnote: `Mostrando ${datos.rows.length} legajo${datos.rows.length === 1 ? '' : 's'}. Acumulado del año, del crudo más nuevo.`,
        }) },
    ],
  });
}

/** Tabla genérica (compartida por Planilla): oculta columnas sin valor real, pagina, busca, totaliza, sticky. */
function renderConceptTable(panel, { rows, concepts, emptyMessage, footnote }) {
  if (rows.length === 0) {
    panel.innerHTML = `<p class="text-muted" style="padding:var(--sp-4);">${esc(emptyMessage)}</p>`;
    return;
  }

  const shownConcepts = concepts.filter(c => rows.some(r => isVal(r[c.key])));
  const hiddenCols = concepts.length - shownConcepts.length;

  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  const searchEl = document.createElement('div');
  toolbar.appendChild(searchEl);
  panel.appendChild(toolbar);

  const tableHost = document.createElement('div');
  tableHost.style.overflowX = 'auto';
  panel.appendChild(tableHost);

  const totals = {};
  for (const c of shownConcepts) totals[c.key] = rows.reduce((acc, r) => acc + (r[c.key] ?? 0), 0);

  tableHost.innerHTML = `
    <table class="data-table data-table--compact">
      <thead>
        <tr>
          <th>Legajo</th>
          <th>Apellido y Nombre</th>
          ${shownConcepts.map(c => `<th style="text-align:right;white-space:nowrap;">${esc(c.label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${esc(r.legajo)}</td>
            <td>${esc(r.nombre)}</td>
            ${shownConcepts.map(c => `<td style="text-align:right;">${fmtNum(r[c.key])}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="font-weight:700;border-top:2px solid var(--color-border);">
          <td colspan="2">TOTAL</td>
          ${shownConcepts.map(c => `<td style="text-align:right;">${fmtNum(totals[c.key])}</td>`).join('')}
        </tr>
      </tfoot>
    </table>
    <p class="text-muted" style="font-size:var(--text-sm);padding:var(--sp-2) var(--sp-3);">
      ${esc(footnote)}
      ${hiddenCols > 0 ? ` Se ocultan ${hiddenCols} concepto${hiddenCols === 1 ? '' : 's'} sin valores.` : ''}
    </p>
  `;

  // Sólo el <tbody> (filas de datos) — el <tfoot> es la fila de TOTAL, que
  // queda fuera de paginación y búsqueda (mismo patrón que rendXEe.js) y
  // permite que enhanceGrid() la fije abajo con sticky.
  wireTableTools(tableHost.querySelector('table'), {
    rows, getLabel: r => `${r.legajo} — ${r.nombre}`,
    searchEl,
    stickyCols: 2,
  });
}

// ── Export a Excel ─────────────────────────────────────────────────────────────

/** 'YYYY-MM' → 'MM-YYYY' (nombre de hoja/archivo, ej. '07-2026'). */
function toMesAnio(period) {
  const [y, m] = period.split('-');
  return `${m}-${y}`;
}

export async function exportAcumuladoresToXlsx(results) {
  await loadExcelJS();
  const { mes, datos, mesProceso } = results;

  const wb = new window.ExcelJS.Workbook();
  wb.creator = 'H&A Controles Nómina';
  wb.created = new Date();

  const solidFill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const base = { name: 'Calibri', size: 10 };
  const bold = { ...base, bold: true };
  const GRAY_HDR = 'FFE8E8E8';
  const NUM_FMT  = '#,##0.00';

  const addSheet = (name, concepts, rows) => {
    const ws = wb.addWorksheet(sanitizeSheetName(name));
    ws.columns = [{ width: 10 }, { width: 30 }, ...concepts.map(() => ({ width: 18 }))];

    const hdrRow = ws.addRow(['Legajo', 'Apellido y Nombre', ...concepts.map(c => c.label)]);
    hdrRow.height = 20;
    for (let c = 1; c <= 2 + concepts.length; c++) {
      const cell = hdrRow.getCell(c);
      cell.font      = { ...bold };
      cell.fill      = solidFill(GRAY_HDR);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border    = { bottom: { style: 'medium', color: { argb: 'FFB0B0B0' } } };
    }

    for (const r of rows) {
      const dr = ws.addRow([toNumOrText(r.legajo), r.nombre, ...concepts.map(c => r[c.key] ?? 0)]);
      dr.getCell(1).font = { ...base };
      dr.getCell(2).font = { ...base };
      concepts.forEach((c, i) => {
        const cell = dr.getCell(3 + i);
        cell.font      = { ...base };
        cell.numFmt    = NUM_FMT;
        cell.alignment = { horizontal: 'right' };
      });
    }

    if (rows.length > 0) {
      const totalRow = ws.addRow([null, 'TOTAL', ...concepts.map(c => round2(rows.reduce((acc, r) => acc + (r[c.key] ?? 0), 0)))]);
      totalRow.getCell(2).font = { ...bold };
      concepts.forEach((c, i) => {
        const cell = totalRow.getCell(3 + i);
        cell.font   = { ...bold };
        cell.numFmt = NUM_FMT;
        cell.alignment = { horizontal: 'right' };
      });
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 2 + concepts.length } };
    }
    return ws;
  };

  addSheet(toMesAnio(mesProceso), MES_CONCEPTS, mes.rows);
  addSheet('DATOS', DATOS_CONCEPTS, datos.rows);

  await downloadWorkbook(wb, `Acumuladores_Ganancias_${toMesAnio(mesProceso)}.xlsx`);
}

// El legajo es numérico en Axton, pero si viene alfanumérico se escribe como texto.
function toNumOrText(v) {
  const n = Number(v);
  return (v !== '' && !isNaN(n)) ? n : String(v ?? '');
}

// Excel no acepta : \ / ? * [ ] en el nombre de una hoja, ni más de 31 caracteres.
function sanitizeSheetName(name) {
  return String(name).replace(/[:\\/?*[\]']/g, '-').slice(0, 31).trim();
}

// ── Editor de configuración (Paso 2 del wizard) ───────────────────────────────

export function renderAcumuladoresConfigEditor(container, opts = {}) {
  const { config = DEFAULT_ACUMULADORES_CONFIG, openByDefault = true, onChange = () => {} } = opts;
  const current = {
    ...DEFAULT_ACUMULADORES_CONFIG,
    ...config,
    codigos: { ...ACUMULADORES, ...(config.codigos || {}) },
  };

  const editor = document.createElement('details');
  if (openByDefault) editor.open = true;
  editor.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';

  editor.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Régimen y códigos de acumulador
    </summary>
    <div style="margin-top:var(--sp-3);display:flex;gap:var(--sp-5);flex-wrap:wrap;">
      <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;">
        <input type="radio" name="acum-regimen" value="RG4030" ${current.regimen === 'RG4030' ? 'checked' : ''}>
        <span style="font-size:var(--text-sm);">RG 4030 (semestral)</span>
      </label>
      <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;">
        <input type="radio" name="acum-regimen" value="RG4003" ${current.regimen === 'RG4003' ? 'checked' : ''}>
        <span style="font-size:var(--text-sm);">RG 4003 (año calendario)</span>
      </label>
    </div>
    <p class="text-muted" style="font-size:var(--text-sm);margin:var(--sp-2) 0 0;">
      Define qué ventana de meses valida la app contra los archivos subidos (no recorta nada: sólo avisa si falta o sobra un mes).
    </p>
    <details style="margin-top:var(--sp-3);">
      <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--color-text-muted);">▸ Códigos de acumulador (avanzado)</summary>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:var(--sp-2);margin-top:var(--sp-2);">
        ${ACCUM_FIELDS.map(f => `
          <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
            ${esc(f.label)}
            <input type="number" class="form-input" data-acum-code="${f.key}" value="${current.codigos[f.key]}" style="padding:4px 8px;">
          </label>
        `).join('')}
      </div>
    </details>
  `;

  editor.querySelectorAll('input[name="acum-regimen"]').forEach(r => {
    r.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      current.regimen = e.target.value;
      onChange({ ...current, codigos: { ...current.codigos } });
    });
  });

  editor.querySelectorAll('[data-acum-code]').forEach(input => {
    input.addEventListener('change', (e) => {
      const key = e.target.dataset.acumCode;
      const n = Number(e.target.value);
      if (!isNaN(n)) current.codigos = { ...current.codigos, [key]: n };
      onChange({ ...current, codigos: { ...current.codigos } });
    });
  });

  container.appendChild(editor);

  // ── Umbrales de los chequeos de pantalla (Fase 1) ──────────────────────────
  // Visibles y editables directamente por el analista que ejecuta el control
  // (sin gate de PIN — Guillermo prefiere confiar en el equipo de Payroll acá,
  // igual que con "Régimen y códigos" arriba).
  const umbrales = document.createElement('details');
  umbrales.style.cssText = 'margin-top:var(--sp-3);padding:var(--sp-3) var(--sp-4);'
    + 'border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);';
  umbrales.innerHTML = `
    <summary style="cursor:pointer;font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--color-primary);list-style:none;">
      ▸ Umbrales de chequeos (Acumuladores Ganancias)
    </summary>
  `;
  {
    const box = document.createElement('div');
    box.style.marginTop = 'var(--sp-3)';
    // Los bloques de tope previsional y piso de Ganancias existen pero no se
    // muestran: ver EXTRAS_GANANCIAS_HABILITADOS arriba y D-033.
    box.innerHTML = `
        <div style="display:flex;gap:var(--sp-4);flex-wrap:wrap;margin-bottom:var(--sp-3);align-items:flex-end;">
          <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
            Multiplicador para "doceava atípica"
            <input type="number" step="0.1" min="1" class="form-input" data-acum-salto
              value="${current.saltoGrandeMultiplicador}" style="padding:4px 8px;max-width:120px;">
          </label>
          ${EXTRAS_GANANCIAS_HABILITADOS ? `
            <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
              Base imponible máxima mensual (dejar vacío = sin chequear)
              <input type="number" class="form-input" data-acum-tope="topeBaseImponible"
                value="${current.topeBaseImponible ?? ''}" style="padding:4px 8px;max-width:220px;">
            </label>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
              Alícuota jubilación (%)
              <input type="number" step="0.1" min="0" class="form-input" data-acum-tope="alicuotaJubilacion"
                value="${current.alicuotaJubilacion ?? 11}" style="padding:4px 8px;max-width:110px;">
            </label>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);">
              Alícuota obra social (%)
              <input type="number" step="0.1" min="0" class="form-input" data-acum-tope="alicuotaObraSocial"
                value="${current.alicuotaObraSocial ?? 3}" style="padding:4px 8px;max-width:110px;">
            </label>
          ` : ''}
        </div>
        <p class="text-muted" style="font-size:var(--text-sm);margin:0 0 var(--sp-3);" data-acum-techos
          ${EXTRAS_GANANCIAS_HABILITADOS ? '' : 'hidden'}></p>
        <div style="display:flex;gap:var(--sp-4);flex-wrap:wrap;">
          ${Object.entries({
            sacTeorico: 'SAC teórico (no calculado, parcial, atípico)',
            reconciliacion: 'Reconciliación aritmética',
            cuil: 'CUIL faltante',
            sinMovimiento: 'Sin movimiento en el mes',
            ...(EXTRAS_GANANCIAS_HABILITADOS ? {
              fueraDePatron: 'Fuera de patrón de tributación',
              topes: 'Coherencia de topes',
            } : {}),
          }).map(([key, label]) => `
            <label style="display:flex;align-items:center;gap:var(--sp-2);cursor:pointer;font-size:var(--text-sm);">
              <input type="checkbox" data-acum-check="${key}" ${current.checksEnabled[key] ? 'checked' : ''}>
              ${esc(label)}
            </label>
          `).join('')}
        </div>
        <p class="text-muted" style="font-size:var(--text-sm);margin-top:var(--sp-2);">
          Este reporte existe para armar el SAC teórico desde los acumuladores: los avisos son sobre eso —
          si no se pudo calcular, si quedó armado con menos meses de los que subiste, o si alguna doceava se
          sale de la línea de las otras del mismo legajo.
        </p>
        ${EXTRAS_GANANCIAS_HABILITADOS ? `
          <p class="text-muted" style="font-size:var(--text-sm);margin-top:var(--sp-2);">
            El tope previsional es uno solo y aplica sobre la <strong>base</strong>: jubilación y obra social
            comparten la misma base máxima y se diferencian por la alícuota. Ojo: la cuota del SAC tiene su
            propio tope y este chequeo todavía no lo contempla.
          </p>
          <hr style="border:none;border-top:1px solid var(--color-border);margin:var(--sp-3) 0;">
          <label style="display:flex;flex-direction:column;gap:2px;font-size:var(--text-sm);max-width:260px;">
            Piso de Ganancias — bruto mensual, soltero sin cargas (dejar vacío = no comparar)
            <input type="number" class="form-input" data-acum-piso-ganancias
              value="${current.pisoGananciasMensual ?? ''}" style="padding:4px 8px;">
          </label>
          <p class="text-muted" style="font-size:var(--text-sm);margin-top:var(--sp-2);">
            Referencia visual del gráfico "¿Quién tributa?" — el caso más simple posible, no vale para nadie
            con cónyuge o hijos. Cambia en enero y julio de cada año.
          </p>
        ` : ''}
      `;
      umbrales.appendChild(box);

      const techosEl = box.querySelector('[data-acum-techos]');
      const pintarTechos = () => {
        if (!techosEl) return;
        const base = current.topeBaseImponible;
        if (base === null || base === undefined || isNaN(base)) {
          techosEl.textContent = 'Sin base cargada: el chequeo de topes queda apagado.';
          return;
        }
        const jub = round2(base * ((current.alicuotaJubilacion ?? 11) / 100));
        const os  = round2(base * ((current.alicuotaObraSocial ?? 3) / 100));
        techosEl.textContent = `Techos derivados — jubilación: ${fmtNum(jub)} · obra social: ${fmtNum(os)}.`;
      };
      pintarTechos();

      box.querySelectorAll('[data-acum-tope]').forEach(input => {
        input.addEventListener('change', (e) => {
          const key = e.target.dataset.acumTope;
          const v = e.target.value.trim();
          current[key] = v === '' ? null : Number(v);
          pintarTechos();
          onChange({ ...current, codigos: { ...current.codigos }, checksEnabled: { ...current.checksEnabled } });
        });
      });

      const saltoInput = box.querySelector('[data-acum-salto]');
      saltoInput.addEventListener('change', (e) => {
        const n = Number(e.target.value);
        if (!isNaN(n) && n >= 1) current.saltoGrandeMultiplicador = n;
        onChange({ ...current, codigos: { ...current.codigos }, checksEnabled: { ...current.checksEnabled } });
      });

      box.querySelectorAll('[data-acum-check]').forEach(input => {
        input.addEventListener('change', (e) => {
          const key = e.target.dataset.acumCheck;
          current.checksEnabled = { ...current.checksEnabled, [key]: e.target.checked };
          onChange({ ...current, codigos: { ...current.codigos }, checksEnabled: { ...current.checksEnabled } });
        });
      });

      const pisoGananciasInput = box.querySelector('[data-acum-piso-ganancias]');
      pisoGananciasInput?.addEventListener('change', (e) => {
        const v = e.target.value.trim();
        current.pisoGananciasMensual = v === '' ? null : Number(v);
        onChange({ ...current, codigos: { ...current.codigos }, checksEnabled: { ...current.checksEnabled } });
      });
  }

  container.appendChild(umbrales);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
