// registry.js — Registro central de todos los controles disponibles
//
// Para agregar un control nuevo:
//   1. Crear js/controls/{id}.js con runXxx(), renderXxxResults() y summarizeXxx()
//   2. Importarlos acá y agregar la entrada al CONTROL_REGISTRY
//
// Cada entrada define:
//   id              — identificador único (snake_case)
//   label           — nombre visible al usuario
//   scope           — a qué universo de clientes se le ofrece el control:
//                       'general'  → cualquier cliente
//                       'sistema'  → scopeMeta.sourceSystems: ['meta4'] / ['axton']
//                       'convenio' → scopeMeta.ccts: ['Comercio', ...]
//                       'cliente'  → scopeMeta.clients: ['MARVAL', ...] (por `code`)
//                     La resolución vive en js/controls/scope.js, no acá.
//   scopeMeta       — datos del scope según el caso (ver arriba) — {} si scope es 'general'
//   appliesWhen(client) — predicado fino sobre atributos del cliente, *además* del scope
//                     (T4 de PLAN_v2.md). Hoy todos devuelven true: ningún control real
//                     depende de un atributo puntual todavía. Cuando se construya uno que sí
//                     (ej. atado a `pluriempleo`/`paymentUsd`/`holding`), este es el lugar
//                     para restringirlo — ver ejemplos en ARCHITECTURE.md §4.
//   description     — descripción breve
//   tabRequired     — si necesita el Tabulado como archivo pivote
//   additionalFiles — archivos adicionales requeridos: [{ key, label, fileType }], más
//                     tres opcionales por archivo:
//                       optional        — se puede avanzar sin él
//                       shared          — lo piden varios controles y es literalmente el
//                                         mismo archivo: se muestra una vez y el resultado
//                                         se espeja en todos (el Tabulado anterior)
//                       slot            — selector CSS de un hueco propio en el layout del
//                                         paso; si el hueco no está en pantalla, el archivo
//                                         cae a la lista de abajo como cualquier otro
//                       rerenderOnLoad  — al cargarse cambia lo que OTRO panel del mismo paso
//                                         puede ofrecer, así que hay que redibujar el paso.
//                                         Sólo se dispara con un archivo nuevo de verdad:
//                                         renderAlreadyLoaded llama a onComplete de forma
//                                         sincrónica al re-mostrar uno ya cargado, y sin ese
//                                         guard el redibujo entra en bucle re-entrante.
//   group           — { id, label, mode, primary } para agrupar variantes del mismo control bajo una pill.
//                     `primary: true` marca la variante que "Seleccionar todos" incluye. Es una
//                     declaración explícita y no se infiere de `mode`: el filtro anterior miraba
//                     `mode === 'Controlar'` y dejaba afuera a POF (modes 'Sueldos'/'Conceptos') y
//                     a Acreditaciones, así que el botón no seleccionaba nada en esos clientes.
//                     Un grupo puede tener más de una primary (Variaciones tiene dos). Ver D-040.
//                     Si está, se renderiza dentro del grupo. Si falta, el control es standalone.
//   run(primaryRows, tabRows, mapping) → resultados
//   summarize(results)                 → { status, headline, insights[] } para la tarjeta colapsada
//   renderResults(results, container)  → HTML del detalle dentro del container
//
// Sobre la clasificación actual (decisión de Guillermo, 2026-07-31 — ver
// specs/segmentacion-controles-por-cliente.md): los 10 controles construidos
// contra los reportes de M4 de Marval son hoy `scope: 'cliente'` de MARVAL. A
// medida que se confirme que uno aplica a cualquier cliente Meta4, se lo
// "promueve" cambiándolo a `scope: 'sistema'` con `sourceSystems: ['meta4']`.
// El único genuinamente general es `agrupadores` (nómina vs resumen, con los
// agrupadores configurables por cliente).

import {
  runCatXEmpleados,
  renderCatXEmpleadosResults,
  summarizeCatXEmpleados,
} from './catXEmpleados.js';

import {
  runBrutos,
  renderBrutosResults,
  summarizeBrutos,
  runBrutosReporte,
  renderBrutosReporteResults,
  summarizeBrutosReporte,
} from './brutos.js';

import {
  runGsPers,
  renderGsPersResults,
  summarizeGsPers,
  runGsPersReporte,
  renderGsPersReporteResults,
  summarizeGsPersReporte,
} from './gsPers.js';

import {
  runNr,
  renderNrResults,
  summarizeNr,
  runNrReporte,
  renderNrReporteResults,
  summarizeNrReporte,
} from './nr.js';

import {
  runRendVsTabu,
  renderRendVsTabuResults,
  summarizeRendVsTabu,
} from './rendVsTabu.js';

import {
  runRendVsAsiento,
  renderRendVsAsientoResults,
  summarizeRendVsAsiento,
} from './rendVsAsiento.js';

import {
  runRendXEe,
  renderRendXEeResults,
  summarizeRendXEe,
} from './rendXEe.js';

import {
  runAgrupadores,
  renderAgrupadoresResults,
  summarizeAgrupadores,
} from './agrupadores.js';

import {
  runVariacionesSueldos,
  summarizeVariacionesSueldos,
  renderVariacionesSueldosResults,
  runVariacionesConceptos,
  summarizeVariacionesConceptos,
  renderVariacionesConceptosResults,
} from './variaciones.js';

import {
  runAcreditacionesReporte,
  renderAcreditacionesReporteResults,
  summarizeAcreditacionesReporte,
} from './acreditaciones.js';

import {
  runAcumuladoresGanancias,
  renderAcumuladoresResults,
  summarizeAcumuladoresGanancias,
} from './acumuladoresGanancias.js';

import {
  runFinadietAsiento,
  renderFinadietAsientoResults,
  summarizeFinadietAsiento,
} from './finadietAsiento.js';

// Los 10 controles construidos contra los reportes de M4 de Marval comparten
// clasificación: hoy se ofrecen sólo a MARVAL. Para "promover" uno a control
// estándar de Meta4 (que lo vea cualquier cliente meta4), reemplazar su
// `...MARVAL_ONLY` por:
//     scope: 'sistema', scopeMeta: { sourceSystems: ['meta4'] },
const MARVAL_ONLY = { scope: 'cliente', scopeMeta: { clients: ['MARVAL'] } };

// Plastic Omnium Florida (OPmobility C-Power Argentina S.A.). Los códigos de
// concepto de Variaciones (899999/1000/2517/2519) son de la liquidación de este
// cliente; para otro cliente los códigos son otros. Se promueve a 'sistema'
// cuando se confirme contra un segundo cliente, igual que los de Marval (D-015).
const POF_ONLY = { scope: 'cliente', scopeMeta: { clients: ['POF'] } };

// FINADIET. El plan de cuentas contables, los centros de costo y las categorías
// patrimoniales del asiento son de este cliente: para otro cliente son otros. Se
// promueve a 'sistema' cuando un segundo cliente pida el mismo asiento y la
// tabla de cuentas ya viva entera en `controlConfigs` (mismo camino que D-015).
const FINADIET_ONLY = { scope: 'cliente', scopeMeta: { clients: ['FINADIET'] } };

export const CONTROL_REGISTRY = {

  cat_x_empleados: {
    id:          'cat_x_empleados',
    label:       'EE x CATEG',
    ...MARVAL_ONLY,
    appliesWhen: () => true,
    description: 'Empleados por Categoría. Compara el catálogo del sistema contra el Tabulado: '
      + 'valida activos, diferencias de cantidad, discrepancias de campo y distribución por puesto y centro de costo.',
    help: {
      what: 'Compara la lista de empleados del sistema de RRHH contra el Tabulado. '
        + 'Detecta empleados que están en uno y no en el otro, y diferencias en campos como puesto y centro de costo.',
      how: [
        'Bajá el reporte de Empleados por Categoría de M4.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        'Ejecutá. El sistema cruza automáticamente los legajos.',
      ],
    },
    tabRequired: true,
    additionalFiles: [
      { key: 'cat', label: 'Empleados por Categoría', fileType: 'cat_empleados' },
    ],
    run:           runCatXEmpleados,
    summarize:     summarizeCatXEmpleados,
    renderResults: renderCatXEmpleadosResults,
  },

  brutos: {
    id:          'brutos',
    label:       'Brutos — Controlar',
    ...MARVAL_ONLY,
    appliesWhen: () => true,
    description: 'Cruza SAL_BASE y A_CTA_FUT_AUMEN del Reporte de Brutos contra '
      + 'las columnas configuradas en el Tabulado (SUELDO y A_CTA_FUT_AUMEN).',
    help: {
      what: 'Toma el Reporte de Brutos bajado de M4 y verifica que los valores de '
        + 'SAL_BASE y A_CTA_FUT_AUMEN coincidan con las columnas del Tabulado. '
        + 'Muestra en rojo los empleados con diferencias.',
      how: [
        'Bajá el Reporte de Brutos de M4.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        'En el panel de configuración indicá qué columnas del Tabulado corresponden a Sueldo y A_CTA_FUT_AUMEN.',
        'Ejecutá.',
      ],
    },
    group:       { id: 'brutos', label: 'Brutos', mode: 'Controlar', primary: true },
    tabRequired: true,
    additionalFiles: [
      { key: 'brutos', label: 'Reporte de Brutos', fileType: 'brutos_file' },
    ],
    run:           runBrutos,
    summarize:     summarizeBrutos,
    renderResults: renderBrutosResults,
  },

  brutos_reporte: {
    id:          'brutos_reporte',
    label:       'Brutos — Generar Reporte',
    ...MARVAL_ONLY,
    appliesWhen: () => true,
    description: 'Genera el Reporte de Brutos directamente desde el Tabulado, '
      + 'sin necesitar el archivo de Brutos.',
    help: {
      what: 'Genera el archivo de Brutos directamente desde el Tabulado, '
        + 'sin necesitar bajar el reporte de M4. '
        + 'Útil para armar el archivo en el formato estándar o comparar períodos.',
      how: [
        'En el panel de configuración del Paso 2 indicá qué columnas del Tabulado corresponden a Sueldo y A_CTA_FUT_AUMEN.',
        'Ejecutá.',
        'Descargá el .xlsx generado desde el resultado.',
      ],
    },
    group:       { id: 'brutos', label: 'Brutos', mode: 'Generar Reporte' },
    tabRequired: true,
    additionalFiles: [],
    run:           runBrutosReporte,
    summarize:     summarizeBrutosReporte,
    renderResults: renderBrutosReporteResults,
  },

  gs_pers: {
    id:          'gs_pers',
    label:       'GS Pers — Controlar',
    ...MARVAL_ONLY,
    appliesWhen: () => true,
    description: 'Cruza GTOS_PERSONALES y DTO_COCHERA del Reporte de Gastos Personales y Cochera '
      + 'contra las columnas configuradas en el Tabulado.',
    help: {
      what: 'Toma el Reporte de Gastos Personales y Cochera de M4 y compara los valores de '
        + 'GTOS_PERSONALES y DTO_COCHERA contra las columnas del Tabulado. '
        + 'Muestra en rojo los empleados con diferencias.',
      how: [
        'Bajá el Reporte de Gastos Personales y Cochera de M4.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        'En el panel de configuración indicá qué columnas del Tabulado corresponden a GTOS_PERSONALES y DTO_COCHERA.',
        'Ejecutá.',
      ],
    },
    group:       { id: 'gs_pers', label: 'GS Pers', mode: 'Controlar', primary: true },
    tabRequired: true,
    additionalFiles: [
      { key: 'gs_pers', label: 'Reporte de GS Pers', fileType: 'gs_pers_file' },
    ],
    run:           runGsPers,
    summarize:     summarizeGsPers,
    renderResults: renderGsPersResults,
  },

  gs_pers_reporte: {
    id:          'gs_pers_reporte',
    label:       'GS Pers — Generar Reporte',
    ...MARVAL_ONLY,
    appliesWhen: () => true,
    description: 'Genera el Reporte de Gastos Personales y Cochera directamente desde el Tabulado.',
    help: {
      what: 'Genera el archivo de GS Pers directamente desde el Tabulado, '
        + 'sin necesitar bajar el reporte de M4.',
      how: [
        'En el panel de configuración del Paso 2 indicá qué columnas del Tabulado corresponden a GTOS_PERSONALES y DTO_COCHERA.',
        'Ejecutá.',
        'Descargá el .xlsx generado desde el resultado.',
      ],
    },
    group:       { id: 'gs_pers', label: 'GS Pers', mode: 'Generar Reporte' },
    tabRequired: true,
    additionalFiles: [],
    run:           runGsPersReporte,
    summarize:     summarizeGsPersReporte,
    renderResults: renderGsPersReporteResults,
  },

  nr: {
    id:          'nr',
    label:       'Control NR — Controlar',
    ...MARVAL_ONLY,
    appliesWhen: () => true,
    description: 'Cruza los 18 conceptos No Remunerativos del Reporte de M4 contra '
      + 'las columnas configuradas en el Tabulado (Indemnizatorios y Otros NR).',
    help: {
      what: 'Controla que todos los 18 conceptos no remunerativos queden cargados '
        + 'correctamente en el Tabulado, comparando el Reporte de M4 contra los valores '
        + 'del Tabulado. Agrupa los conceptos en Indemnizatorios y Otros NR.',
      how: [
        'Bajá el Reporte de NR de M4.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        'En el panel de configuración indicá las columnas del Tabulado para cada uno de los 18 conceptos.',
        'Ejecutá. Las diferencias se muestran en rojo.',
      ],
    },
    group:       { id: 'nr', label: 'Control NR', mode: 'Controlar', primary: true },
    tabRequired: true,
    additionalFiles: [
      { key: 'nr', label: 'Reporte de NR', fileType: 'nr_file' },
    ],
    run:           runNr,
    summarize:     summarizeNr,
    renderResults: renderNrResults,
  },

  nr_reporte: {
    id:          'nr_reporte',
    label:       'Control NR — Generar Reporte',
    ...MARVAL_ONLY,
    appliesWhen: () => true,
    description: 'Genera el Reporte de No Remunerativos directamente desde el Tabulado, '
      + 'sin necesitar el archivo de M4.',
    help: {
      what: 'Genera el archivo de NR directamente desde el Tabulado con los 18 conceptos '
        + 'no remunerativos. Ningún concepto es obligatorio: el que no tenga columna '
        + 'asignada queda vacío en el reporte.',
      how: [
        'En el panel de configuración del Paso 2 indicá las columnas del Tabulado para cada uno de los 18 conceptos.',
        'Ejecutá.',
        'Descargá el .xlsx generado desde el resultado.',
      ],
    },
    group:       { id: 'nr', label: 'Control NR', mode: 'Generar Reporte' },
    tabRequired: true,
    additionalFiles: [],
    run:           runNrReporte,
    summarize:     summarizeNrReporte,
    renderResults: renderNrReporteResults,
  },


  rend_vs_tabu: {
    id:          'rend_vs_tabu',
    label:       'Rendimiento vs Tabulado',
    ...MARVAL_ONLY,
    appliesWhen: () => true,
    description: 'Cruza el Reporte de Rendimiento contra el Tabulado agrupado por centro de costo. '
      + 'Compara PRECIO, ASIG. ESTÍMULO, RETIROS, CARGAS SS, PROV. MES, PROV. CCSS MES y COSTO TOTAL.',
    help: {
      what: 'Toma el Reporte de Rendimiento (resumen de costos por CC de M4) y lo contrasta '
        + 'contra el Tabulado agrupado por centro de costo. Muestra diferencia por columna y por CC. '
        + 'RETIROS se calcula de conceptos 9200 + 9205 sólo para filas EMPRESA = 03.',
      how: [
        'Bajá el Reporte de Rendimiento de M4.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        'Ejecutá. Las diferencias se muestran en rojo.',
      ],
    },
    tabRequired: true,
    additionalFiles: [
      { key: 'rend', label: 'Reporte de Rendimiento', fileType: 'rend_file' },
    ],
    run:           runRendVsTabu,
    summarize:     summarizeRendVsTabu,
    renderResults: renderRendVsTabuResults,
  },

  rend_vs_asiento: {
    id:          'rend_vs_asiento',
    label:       'Rendimiento vs Asiento',
    ...MARVAL_ONLY,
    appliesWhen: () => true,
    description: 'Cruza el Reporte de Rendimiento de M4 contra la Contabilidad Desglosada (CONTA). '
      + 'Agrupa CONTA por CC × categoría (Σ Debe − Σ Haber) y compara contra el Rendimiento.',
    help: {
      what: 'Toma el Reporte de Rendimiento (resumen de costos por CC de M4) y lo contrasta '
        + 'contra la Contabilidad Desglosada. Cada fila de CONTA se clasifica por ID_CONCEPTO en '
        + 'PRECIO / ASIG. ESTÍMULO / CARGAS SS / PROV. MES / PROV. CCSS MES, se suma DEBE − HABER '
        + 'y se agrupa por CC_NOMBRE. Opcionalmente se puede sobrescribir el CC con un archivo '
        + 'CC x Empleado (cuando los CC de CONTA están desactualizados).',
      how: [
        'Bajá el Reporte de Rendimiento de M4.',
        'Bajá o exportá la Contabilidad Desglosada del período.',
        '(Opcional) cargá el archivo CC x Empleado si los CC de CONTA están desactualizados.',
        'Ejecutá. Las diferencias (CONTA − Rend) se muestran en rojo.',
      ],
    },
    tabRequired: false,
    additionalFiles: [
      { key: 'rend',  label: 'Reporte de Rendimiento',          fileType: 'rend_file' },
      // rerenderOnLoad: con CONTA cargada, el editor de config de abajo puede mostrar
      // el nombre de cada cuenta y concepto al lado de su código.
      { key: 'conta', label: 'Contabilidad Desglosada',         fileType: 'conta_file', rerenderOnLoad: true },
      { key: 'ccXEe', label: 'CC x Empleado (opcional)',         fileType: 'cc_x_ee_file', optional: true },
    ],
    run:           runRendVsAsiento,
    summarize:     summarizeRendVsAsiento,
    renderResults: renderRendVsAsientoResults,
  },

  rend_x_ee: {
    id:          'rend_x_ee',
    label:       'Rendimiento x EE',
    ...MARVAL_ONLY,
    appliesWhen: () => true,
    description: 'Cruza el Costo Total por empleado del reporte de M4 contra el Costo Total '
      + 'calculado desde el Tabulado (PRECIO + ASIG. ESTÍMULO + CARGAS SS + PROV. MES + PROV. CCSS MES).',
    help: {
      what: 'Toma el Reporte de Costo Total por empleado de M4 (Legajo + Costo Total) y lo contrasta '
        + 'contra el Costo Total calculado desde el Tabulado: por cada legajo suma los 5 totalizadores '
        + 'de Rend vs Tabulado usando la misma agrupación de conceptos. La columna Dif (verde) muestra '
        + 'Reporte − Calculado; las diferencias se pintan en rojo.',
      how: [
        'Bajá el Reporte de Costo Total por empleado de M4.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        '(Opcional) Ajustá la agrupación de conceptos — es la misma que usa Rend vs Tabulado.',
        'Ejecutá. Las diferencias se muestran en rojo dentro de la columna Dif.',
      ],
    },
    tabRequired: true,
    additionalFiles: [
      { key: 'costoTotal', label: 'Reporte de Costo Total (por empleado)', fileType: 'costo_total_file' },
    ],
    run:           runRendXEe,
    summarize:     summarizeRendXEe,
    renderResults: renderRendXEeResults,
  },

  agrupadores: {
    id:          'agrupadores',
    label:       'Cruce por Agrupadores',
    scope:       'general',
    scopeMeta:   {},
    appliesWhen: () => true,
    description: 'Cruza la Nómina Maestra contra un archivo Resumen del mismo período, sumando los '
      + 'conceptos de cada agrupador configurado para el cliente y marcando las diferencias por legajo. '
      + 'No usa el Tabulado como pivote (a diferencia del resto de los controles).',
    help: {
      what: 'Reemplaza el cruce manual entre la Nómina Maestra y un Resumen: agrupa los conceptos '
        + 'según los agrupadores del cliente (ver "Agrupadores" en el menú "⋯" de cada cliente) y '
        + 'compara los totales por legajo entre ambos archivos.',
      how: [
        'Cargá la Nómina Maestra exportada de Meta4.',
        'Cargá el archivo Resumen del mismo período — el formato Largo (una fila por concepto) o el '
          + 'Tabulado Horizontal (mismo formato que la nómina), el que corresponda.',
        'Elegí qué agrupadores incluir y ajustá los umbrales si hace falta.',
        'Ejecutá. Las diferencias se muestran por agrupador y por legajo.',
      ],
    },
    tabRequired: false,
    // El Resumen puede venir en 2 formatos distintos (a diferencia del resto de los
    // additionalFiles, que tienen un fileType fijo). En vez de un selector de tipo en
    // runtime (que el registry no soporta), se declaran los dos como additionalFiles
    // opcionales — el analista sube el que tenga, y run() usa el que haya llegado
    // (ver agrupadores.js). controlsWizard.js exige "al menos uno de los dos" con un
    // caso puntual en canGoNext, igual que otros controles validan sus propios extras.
    additionalFiles: [
      { key: 'nomina',          label: 'Nómina Maestra',                                    fileType: 'nomina_maestra' },
      { key: 'resumenLargo',    label: 'Resumen — Formato Largo (opcional)',                fileType: 'resumen_largo_excel', optional: true },
      { key: 'resumenTabulado', label: 'Resumen — Formato Tabulado Horizontal (opcional)',  fileType: 'resumen_tabulado_horizontal', optional: true },
    ],
    run:           runAgrupadores,
    summarize:     summarizeAgrupadores,
    renderResults: renderAgrupadoresResults,
  },

  // Primer control construido sobre un archivo de Axton (los otros 11 son de
  // reportes Meta4). El export `contacred` tiene el mismo formato en todas las
  // cuentas de Axton, así que arranca directo como control de sistema y no como
  // control de un cliente puntual. Ver specs/control-acreditaciones-axton.md.
  acreditaciones_reporte: {
    id:          'acreditaciones_reporte',
    label:       'Acreditaciones — Generar Reporte',
    scope:       'sistema',
    scopeMeta:   { sourceSystems: ['axton'] },
    appliesWhen: () => true,
    description: 'Ordena las acreditaciones del mes del export de Axton en un archivo limpio: '
      + 'una hoja por acreditación (tipo de liquidación × fecha) más una hoja CONTROL que las '
      + 'lista con su total y cierra contra el total del archivo de origen.',
    help: {
      what: 'Toma el export de Acreditaciones de Axton (una fila por legajo y liquidación) y lo '
        + 'parte en una hoja por acreditación real: cada tipo de liquidación en cada fecha de '
        + 'acreditación, mergeando los listados del mismo pago. La hoja CONTROL numera las listas '
        + 'con su fecha y total, y cierra con fórmulas contra el total del archivo de Axton.',
      how: [
        'Bajá el export de Acreditaciones (contacred) del período desde Axton.',
        'Cargalo en el Paso 2 cuando te lo pida.',
        '(Opcional) Si el cliente tiene más de una empresa, elegí en "Opciones del reporte" si las listas se separan por empresa.',
        'Ejecutá y descargá el .xlsx desde el resultado.',
      ],
    },
    group:       { id: 'acreditaciones', label: 'Acreditaciones', mode: 'Generar Reporte', primary: true },
    tabRequired: false,
    additionalFiles: [
      { key: 'acreditaciones', label: 'Acreditaciones (export de Axton)', fileType: 'acreditaciones_file' },
    ],
    run:           runAcreditacionesReporte,
    summarize:     summarizeAcreditacionesReporte,
    renderResults: renderAcreditacionesReporteResults,
  },

  // Segundo control Axton del proyecto, después de acreditaciones (D-021). Control
  // de generación: arma el archivo mensual de Acumuladores de Ganancias desde los
  // crudos repacumuladores, sin comparar nada contra el Tabulado. Ver
  // specs/control-acumuladores-ganancias.md.
  acumuladores_ganancias: {
    id:          'acumuladores_ganancias',
    label:       'Acumuladores Ganancias',
    scope:       'sistema',
    scopeMeta:   { sourceSystems: ['axton'] },
    appliesWhen: () => true,
    description: 'Genera el archivo mensual de Acumuladores de Ganancias desde los crudos repacumuladores '
      + 'de Axton (uno por mes de la ventana del SAC teórico), con la doceava parte y el acumulado del año.',
    help: {
      what: 'Reemplaza las dos tablas dinámicas encadenadas y el VLOOKUP que hoy arma el analista a mano: '
        + 'toma un crudo repacumuladores por cada mes que entra en el cálculo del SAC teórico (2 para RG 4030, '
        + 'hasta 8 para RG 4003) y arma la hoja del mes de proceso más la hoja DATOS con el acumulado del año.',
      how: [
        'Elegí el régimen (RG 4003 o RG 4030) en "Régimen y códigos de acumulador".',
        'Bajá de Axton un crudo repacumuladores por cada mes de la ventana y subilos todos juntos.',
        'Revisá el período detectado de cada archivo y corregilo si no coincide con el mes de los datos.',
        'Ejecutá y descargá el .xlsx (hojas MM-AAAA y DATOS) desde el resultado.',
      ],
    },
    tabRequired: false,
    additionalFiles: [
      { key: 'acumuladores', label: 'Acumuladores (export repacumuladores de Axton) — uno por mes', fileType: 'acumuladores_file' },
    ],
    run:           runAcumuladoresGanancias,
    summarize:     summarizeAcumuladoresGanancias,
    renderResults: renderAcumuladoresResults,
  },

  variaciones_sueldos: {
    id:          'variaciones_sueldos',
    label:       'Variación Sueldos',
    ...POF_ONLY,
    appliesWhen: () => true,
    description: 'Compara el Tabulado del período actual contra el del período anterior y muestra, '
      + 'por empleado, la variación del sueldo (concepto 899999 de jornales + 1000 de mensuales '
      + 'sumados en una sola columna).',
    help: {
      what: 'Único control que cruza el Tabulado contra el Tabulado de otro período. Se suben siempre los '
        + 'dos archivos y el período y la quincena salen de cada archivo, no del selector de la app. Suma '
        + 'los conceptos 899999 (jornales) y 1000 (mensuales) por empleado — cada uno liquida por uno de los '
        + 'dos — y muestra la variación en pesos y en porcentaje, con total general.',
      how: [
        'Cargá los dos Tabulados en el Paso 2: el del período anterior y el del actual.',
        'Confirmá en "Conceptos a comparar" qué columna es cada concepto en cada archivo.',
        'Ejecutá y revisá los empleados con variación en la pantalla de resultados.',
        'Usá "Imprimir / PDF" para el entregable A4 horizontal, o "Exportar" para el .xlsx.',
      ],
    },
    group:       { id: 'variaciones', label: 'Variación entre períodos', mode: 'Sueldos', primary: true },
    tabRequired: true,
    additionalFiles: [
      // `shared: true` → si los dos controles de Variaciones están seleccionados,
      // el wizard pide este archivo UNA sola vez y lo comparte (ver controlsWizard.js).
      // slot: tiene su propio hueco en la grilla de dos columnas, arriba.
      // rerenderOnLoad: sus encabezados son los que ofrece el panel "Conceptos a comparar".
      { key: 'tab_prev', label: 'Tabulado del período anterior', fileType: 'tab_prev_file', optional: false, shared: true,
        slot: '#js-var-prev-upload', rerenderOnLoad: true },
    ],
    run:           runVariacionesSueldos,
    summarize:     summarizeVariacionesSueldos,
    renderResults: renderVariacionesSueldosResults,
  },

  variaciones_conceptos: {
    id:          'variaciones_conceptos',
    label:       'Variación Conceptos',
    ...POF_ONLY,
    appliesWhen: () => true,
    description: 'Compara el Tabulado del período actual contra el del período anterior para los '
      + 'conceptos 2517 (Premio de progreso) y 2519 (Premio productividad), cada uno en su propia '
      + 'sección con su total.',
    help: {
      what: 'Misma comparación que Variación Sueldos (dos Tabulados, uno por período), pero sobre los '
        + 'premios: 2517 (Premio de progreso) y 2519 (Premio productividad). Cada concepto va en su propia '
        + 'sección, con el código y el nombre tal como figuran en el Tabulado, y arranca en página nueva '
        + 'del PDF.',
      how: [
        'Cargá los dos Tabulados en el Paso 2: el del período anterior y el del actual.',
        'Confirmá en "Conceptos a comparar" qué columna es cada concepto en cada archivo.',
        'Ejecutá y revisá cada concepto en su sección.',
        'Usá "Imprimir / PDF" para el entregable A4 horizontal, o "Exportar" para el .xlsx.',
      ],
    },
    group:       { id: 'variaciones', label: 'Variación entre períodos', mode: 'Conceptos', primary: true },
    tabRequired: true,
    additionalFiles: [
      // slot: tiene su propio hueco en la grilla de dos columnas, arriba.
      // rerenderOnLoad: sus encabezados son los que ofrece el panel "Conceptos a comparar".
      { key: 'tab_prev', label: 'Tabulado del período anterior', fileType: 'tab_prev_file', optional: false, shared: true,
        slot: '#js-var-prev-upload', rerenderOnLoad: true },
    ],
    run:           runVariacionesConceptos,
    summarize:     summarizeVariacionesConceptos,
    renderResults: renderVariacionesConceptosResults,
  },

  // Tercer control de generación del proyecto, después de acreditaciones (D-021)
  // y acumuladores (D-033): arma el asiento contable de remuneraciones de
  // FINADIET desde el excel mensual de conceptos liquidados, sin comparar nada
  // contra el Tabulado. Ver specs/finadiet-asiento-remuneraciones.md.
  finadiet_asiento: {
    id:          'finadiet_asiento',
    label:       'Asiento de Remuneraciones',
    ...FINADIET_ONLY,
    appliesWhen: () => true,
    description: 'Arma el asiento contable de remuneraciones del mes desde el excel "FINADIET CONCEPTOS" '
      + 'de Meta4: cuentas de Resultado agrupadas por centro de costo, cuentas Patrimoniales consolidadas '
      + 'por categoría, y el control de que el asiento cierre (Debe = Haber).',
    help: {
      what: 'Reemplaza el armado a mano del asiento que Payroll le manda a Contaduría de FINADIET. Cada fila '
        + 'del excel de conceptos es un movimiento (un importe al Debe de una cuenta y al Haber de otra): el '
        + 'control las clasifica con el plan de cuentas del cliente, le pone a cada cuenta de Resultado el '
        + 'prefijo de su centro de costo, consolida las Patrimoniales entre todos los centros y controla que '
        + 'Debe y Haber cierren. Una cuenta o un centro que no esté en la tabla del cliente no se clasifica '
        + 'sola: queda afuera y se lista en los resultados.',
      how: [
        'Bajá de Meta4 el excel "FINADIET CONCEPTOS" del período.',
        'Cargalo en el Paso 2 y confirmá el mapeo de columnas (importe, códigos de cuenta Debe/Haber, centro de costo).',
        'Completá la fecha de emisión en "Cuentas contables y centros de costo", y revisá ahí la tabla de cuentas si el cliente agregó alguna.',
        'Ejecutá, revisá que el asiento cierre y descargá el .xlsx de 3 solapas desde el resultado.',
      ],
    },
    group:       { id: 'finadiet_asiento', label: 'Asiento de Remuneraciones', mode: 'Generar Reporte', primary: true },
    tabRequired: false,
    additionalFiles: [
      { key: 'asiento_conceptos', label: 'Conceptos liquidados (excel "FINADIET CONCEPTOS" de Meta4)', fileType: 'asiento_conceptos_file' },
    ],
    run:           runFinadietAsiento,
    summarize:     summarizeFinadietAsiento,
    renderResults: renderFinadietAsientoResults,
  },

};
