# Repo `Controles-Varios` (H&A) — referencia para responder "¿este control ya está construido?"

Fuente: https://github.com/bhidalgo-ar/Controles-Varios — commit `e544170` (2026-08-15).
Todo lo de acá sale del repo. Lo que el repo no dice se marca "no visible en el repo".

---

## 1. Qué es el repo (5 líneas)

1. Herramienta interna de H&A para validar la nómina mensual de un cliente contra sus archivos de control (Tabulado como archivo pivote, más el reporte a controlar). Reemplaza cruces manuales en Excel.
2. Corre 100% en el navegador: vanilla JS + ES modules, sin build, sin bundler, sin backend. SheetJS (Excel) + Dexie (IndexedDB) por CDN. Se sirve estática (`python3 -m http.server 4173`); **no funciona con doble click sobre `index.html`** (`file://` bloquea los `import`).
3. Escala declarada: ~22 clientes, ~15 analistas. Configuración y catálogo de clientes se distribuyen por un **seed JSON versionado** (`hya-controles-config.json`), importado a mano; el historial de corridas es local por navegador.
4. NO hace: no toca Meta4/Axton en vivo, no modifica datos productivos, no sube nada a ningún lado, no tiene backend ni telemetría, no consolida resultados entre analistas, no tiene roles más allá de analista/admin-con-password.
5. Entry point único `index.html` + router por hash: `#/`, `#/controls/:clientCode`, `#/admin`.

---

## 2. Inventario de controles construidos

Fuente: `js/controls/registry.js` (`CONTROL_REGISTRY`). **16 entradas**, agrupadas en 12 controles lógicos (las variantes "Controlar"/"Generar Reporte" y "Sueldos"/"Conceptos" comparten `group.id`).

| `id` | `label` | Qué compara contra qué | `tabRequired` | `additionalFiles` (`key` → `fileType`) | Scope / clientes |
|---|---|---|---|---|---|
| `cat_x_empleados` | EE x CATEG | Catálogo de Empleados por Categoría del sistema vs Tabulado: activos, diferencias de cantidad, discrepancias de campo, distribución por puesto y CC | `true` | `cat` → `cat_empleados` | `cliente`: `MARVAL` |
| `brutos` | Brutos — Controlar | `SAL_BASE` y `A_CTA_FUT_AUMEN` del Reporte de Brutos vs columnas configuradas del Tabulado (`SUELDO`, `A_CTA_FUT_AUMEN`) | `true` | `brutos` → `brutos_file` | `cliente`: `MARVAL` |
| `brutos_reporte` | Brutos — Generar Reporte | Genera el Reporte de Brutos desde el Tabulado (no controla contra nada) | `true` | — | `cliente`: `MARVAL` |
| `gs_pers` | GS Pers — Controlar | `GTOS_PERSONALES` y `DTO_COCHERA` del Reporte de Gastos Personales y Cochera vs Tabulado | `true` | `gs_pers` → `gs_pers_file` | `cliente`: `MARVAL` |
| `gs_pers_reporte` | GS Pers — Generar Reporte | Genera el Reporte de GS Pers y Cochera desde el Tabulado | `true` | — | `cliente`: `MARVAL` |
| `nr` | Control NR — Controlar | Los 18 conceptos No Remunerativos del Reporte de M4 vs columnas configuradas del Tabulado (Indemnizatorios y Otros NR) | `true` | `nr` → `nr_file` | `cliente`: `MARVAL` |
| `nr_reporte` | Control NR — Generar Reporte | Genera el Reporte de No Remunerativos desde el Tabulado | `true` | — | `cliente`: `MARVAL` |
| `rend_vs_tabu` | Rendimiento vs Tabulado | Reporte de Rendimiento vs Tabulado agrupado por centro de costo. Compara `PRECIO`, `ASIG. ESTÍMULO`, `RETIROS`, `CARGAS SS`, `PROV. MES`, `PROV. CCSS MES`, `COSTO TOTAL` | `true` | `rend` → `rend_file` | `cliente`: `MARVAL` |
| `rend_vs_asiento` | Rendimiento vs Asiento | Reporte de Rendimiento de M4 vs Contabilidad Desglosada (CONTA), agrupando CONTA por CC × categoría (Σ Debe − Σ Haber). Signo: `CONTA − Rend` | `false` | `rend` → `rend_file`; `conta` → `conta_file` (`rerenderOnLoad: true`, admite varios archivos); `ccXEe` → `cc_x_ee_file` (`optional: true`) | `cliente`: `MARVAL` |
| `rend_x_ee` | Rendimiento x EE | Costo Total por empleado del reporte de M4 vs Costo Total calculado desde el Tabulado (`PRECIO + ASIG. ESTÍMULO + CARGAS SS + PROV. MES + PROV. CCSS MES`) | `true` | `costoTotal` → `costo_total_file` | `cliente`: `MARVAL` |
| `agrupadores` | Cruce por Agrupadores | Nómina Maestra vs archivo Resumen del mismo período, sumando los conceptos de cada agrupador configurado por cliente. No usa el Tabulado como pivote | `false` | `nomina` → `nomina_maestra`; `resumenLargo` → `resumen_largo_excel` (`optional`); `resumenTabulado` → `resumen_tabulado_horizontal` (`optional`) | `general` — **pero `hidden: true`**: no se ofrece a nadie hasta definir el archivo de Nómina Maestra estándar |
| `acreditaciones_reporte` | Acreditaciones — Generar Reporte | Ordena las acreditaciones del mes del export `contacred` de Axton: una hoja por acreditación (tipo de liquidación × fecha) + hoja CONTROL que cierra contra el total del archivo de origen | `false` | `acreditaciones` → `acreditaciones_file` | `sistema`: `sourceSystems: ['axton']` |
| `acumuladores_ganancias` | Acumuladores Ganancias | Genera el archivo mensual de Acumuladores de Ganancias desde los crudos `repacumuladores` de Axton (uno por mes de la ventana del SAC teórico), con la doceava parte y el acumulado del año | `false` | `acumuladores` → `acumuladores_file` (uno por mes) | `sistema`: `sourceSystems: ['axton']` |
| `variaciones_sueldos` | Variación Sueldos | Tabulado del período actual vs Tabulado del período anterior: variación de sueldo por empleado (concepto `899999` jornales + `1000` mensuales, sumados en una columna) | `true` | `tab_prev` → `tab_prev_file` (`shared: true`, no opcional) | `cliente`: `POF` |
| `variaciones_conceptos` | Variación Conceptos | Tabulado actual vs anterior para los conceptos `2517` (Premio de progreso) y `2519` (Premio productividad), cada uno en su sección con su total | `true` | `tab_prev` → `tab_prev_file` (`shared: true`) | `cliente`: `POF` |
| `pop_variaciones` | Variación entre quincenas | Dos Tabulados de Axton (quincena anterior vs actual): valor hora por legajo (importe ÷ cantidad del concepto de horas normales, código `1010`), variación en $ y %, cambio de CBU, altas, bajas y neto. Altas/bajas salen de fechas de ingreso/egreso, no de presencia en un archivo. Si se sube el reporte de variaciones de Axton, lo controla campo a campo | `false` | `tab_prev` → `tab_axton_prev_file`; `tab_act` → `tab_axton_file`; `variac` → `pop_variac_file` (opcional) | `cliente`: `POP` |
| `finadiet_asiento` | Asiento de Remuneraciones | Arma el asiento contable de remuneraciones del mes desde el excel "FINADIET CONCEPTOS" de Meta4: cuentas de Resultado por centro de costo, Patrimoniales consolidadas por categoría, y control de cierre (Debe = Haber). Salida .xlsx de 3 solapas | `false` | `asiento_conceptos` → `asiento_conceptos_file` | `cliente`: `FINADIET` |

**Todos los `appliesWhen` del registry son `() => true` hoy.** Ningún control real se restringe por atributo de cliente: la segmentación real la hace `scope` + `scopeMeta`.

**Grupos declarados** (`group.id`): `brutos`, `gs_pers`, `nr`, `acreditaciones`, `variaciones` (dos `primary`), `finadiet_asiento`. Los standalone no tienen `group`.

### Reporte standalone (fuera de la app)
`reportes/opmobility-variaciones.html` — mismo cálculo que `variaciones_sueldos` / `variaciones_conceptos` pero como HTML suelto (sin ES modules, se abre con doble click), para OPmobility C-Power Argentina S.A., con export PDF A4 horizontal. Ver `specs/reporte-variaciones-opmobility.md`.

---

## 3. Cómo se define un control en el registry

`CONTROL_REGISTRY` es un objeto `{ [id]: entrada }` en `js/controls/registry.js`. Campos documentados en el encabezado de ese archivo:

- `id` — identificador único (snake_case). **Obligatorio.**
- `label` — nombre visible. **Obligatorio.**
- `scope` — `'general' | 'sistema' | 'convenio' | 'cliente'`. **Obligatorio** (si falta o es desconocido, `scope.js` ofrece el control igual, para no bloquear al analista).
- `scopeMeta` — `{}` si `general`; `{ sourceSystems: [...] }`, `{ ccts: [...] }` o `{ clients: [...] }` según el caso.
- `appliesWhen(client)` — predicado fino además del scope. Default si falta: `() => true`.
- `description` — descripción breve. **Obligatoria en la práctica** (todas las entradas la tienen).
- `help: { what, how[] }` — popover "?" del analista (`what` 1-2 oraciones, `how` pasos imperativos).
- `tabRequired` — booleano: si necesita el Tabulado como pivote. **Obligatorio.**
- `additionalFiles` — array de `{ key, label, fileType }` + opcionales por archivo: `optional`, `shared`, `slot`, `rerenderOnLoad`. **Obligatorio** (puede ser `[]`).
- `group` — `{ id, label, mode, primary }` para agrupar variantes bajo una pill. `primary: true` marca la variante que incluye "Seleccionar todos"; un grupo puede tener más de una. Opcional (sin `group` el control es standalone).
- `hidden` — saca el control de circulación para todos, aun dentro de su scope (hoy sólo `agrupadores`).
- `config` — **array** de configuraciones por cliente guardadas en `controlConfigs`. Campos: `key`, `stateKey`, `default()` (devuelve copia nueva), `editor`, `editorProps(state)`, `openByDefault`, `mappingKey`, `mappingValue(state)`, `readOnly`.
- `run(primaryRows, tabRows, mapping)` → resultados. **Obligatorio.**
- `summarize(results)` → `{ status, headline, insights[] }`. **Obligatorio.**
- `renderResults(results, container)` → HTML del detalle. **Obligatorio.**

### Ejemplo real, copiado textual (`registry.js`, entrada `cat_x_empleados`)

```js
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
```

Los shorthands de scope, textuales:

```js
const MARVAL_ONLY   = { scope: 'cliente', scopeMeta: { clients: ['MARVAL'] } };
const POF_ONLY      = { scope: 'cliente', scopeMeta: { clients: ['POF'] } };
const FINADIET_ONLY = { scope: 'cliente', scopeMeta: { clients: ['FINADIET'] } };
const POP_ONLY      = { scope: 'cliente', scopeMeta: { clients: ['POP'] } };
```

Nota del propio registry: los 10 controles construidos contra los reportes de M4 de Marval son hoy `scope: 'cliente'` de MARVAL a propósito (decisión de Guillermo 2026-07-31, `specs/segmentacion-controles-por-cliente.md`, D-015). Se "promueve" un control a estándar Meta4 reemplazando `...MARVAL_ONLY` por `scope: 'sistema', scopeMeta: { sourceSystems: ['meta4'] }`.

---

## 4. `appliesWhen` y el motor de reglas por cliente

Implementado en `js/controls/scope.js`. Un control se ofrece a un cliente si pasa **tres filtros en este orden**:

1. **Override explícito del admin** (`controlConfigs.status`) — gana sobre todo:
   - `'forzado_activo'` → `true` (ignora scope)
   - `'forzado_no_aplica'` → `false`
   - `'no_aplica'` → `false`
2. `ctrl.hidden === true` → `false` (salvo `forzado_activo`).
3. **Scope declarativo** (`scopeMatchesClient`):
   - `'general'` → `true` para cualquier cliente activo
   - `'sistema'` → `scopeMeta.sourceSystems.includes(client.sourceSystem)`
   - `'convenio'` → `scopeMeta.ccts` intersecta `client.ccts`
   - `'cliente'` → `scopeMeta.clients.includes(client.code)`
   - scope desconocido → `true` (se ofrece de más antes que bloquear)
4. **Predicado fino** `ctrl.appliesWhen(client)`, default `() => true`; debe devolver **exactamente** `true`.

API exportada: `scopeMatchesClient(ctrl, client)`, `controlAppliesToClient(ctrl, client, config)`, `scopeLabel(ctrl)`, `filterControlsForClient(controls, client, configByControlId)`, `controlOrigin(ctrl, client)` → `{ tier: 'general'|'scoped', label }` para el chip del Paso 1.

Esto filtra qué controles se **ofrecen**; no filtra resultados guardados (`checklistView.js` / `controlsResults.js` resuelven `CONTROL_REGISTRY[controlId]` por id sin pasar por `scope.js`).

**Atributos de cliente disponibles** (seed, `clients[].attributes`, todos booleanos): `paymentUsd`, `pluriempleo`, `holding`, `retroactividad`, `confidential`, `downloadF572`. (`f1359` se sacó del modelo — D-012.) Además, del cliente: `code`, `sourceSystem` (`meta4`|`axton`), `ccts[]`, `entityCount`, `active`, `team`, `complexity`, `pays`, `migratedAt`.

**Ejemplo de `appliesWhen`** — el repo no tiene ninguno real; el único ejemplo escrito es hipotético, en `ARCHITECTURE.md` §4, textual:

```js
{
  id:          'control_holding',
  label:       '(ejemplo hipotético — ningún control real usa esto todavía)',
  scope:       'cliente',           // 'general' | 'convenio' | 'cliente'
  scopeMeta:   { clients: ['POINCENOT'] },   // o { ccts: ['Comercio'] } si scope=convenio
  appliesWhen: (client) => client.attributes.holding === true,
  paramSchema: { /* qué parámetros pide configurar */ },
  inputs:      [{ key: 'tabulado', logical: 'tabulado' }],  // formas lógicas, no columnas crudas
  run, summarize, renderResults,
}
```

Cuidado: `paramSchema` e `inputs` aparecen en `ARCHITECTURE.md` y `PRD.md` pero **no existen en el registry real** — el registry usa `config[]` y `additionalFiles[]`. `ARCHITECTURE.md` §4 está adelantado respecto del código.

Predicados candidatos citados en `ARCHITECTURE.md` §4 con datos ya cargados en el seed: `pluriempleo === true` (Sportline, Lowsedo), `holding === true` (Poincenot, Sportline, Lowsedo), `paymentUsd === true` (Geopagos, Piano).

---

## 5. El seed de configuración

Archivo `hya-controles-config.json` (en el repo hay `hya-controles-config.seed.json`). Schema en `config/SEED_SCHEMA.md`. Generado desde `#/admin` (`js/seed/exportSeed.js`), importado con `js/seed/importSeed.js`. Carga: intento silencioso de `fetch('./config/hya-controles-config.json')`; si falla, import manual.

**Raíz:** `schemaVersion` (number, el import rechaza si no coincide), `configVersion` (number, avisa si el archivo es más viejo que el cargado), `updatedAt` (`YYYY-MM-DD`), `updatedBy`, `_about`, `sourceSystems[]`, `teams[]` (`{ code, lead }`, `lead` puede ser `null`), `consultants[]` (`{ name }`), `clients[]`, `controlConfigs[]`, `catalogs[]`, `_pendingReview[]`.

**`clients[]`:** `code` (identidad estable, mayúsculas, no se renombra), `name`, `team`, `consultant`, `complexity` (1-5), `pays` (dotación), `ccts[]`, `entityCount`, `sourceSystem` (`"meta4"|"axton"`), `migratedAt` (string|null), `active` (bool), `attributes` (objeto de booleanos, §4).

**`controlConfigs[]`:** `{ clientCode, controlId, status, overrideReason, params }`, clave `[clientCode+controlId]`. `status` ∈ `'activo' | 'no_aplica' | 'sin_configurar' | 'forzado_activo' | 'forzado_no_aplica'`.

**Merge:** autoritativo sobre `clients`, `sourceSystems`, `teams` y `controlConfigs` (upsert por `code`); **nunca toca** `controlRuns`, `controlRunFiles`, `controlRunResults` ni `clientCatalogs`. Un parámetro local distinto del seed queda marcado como override visible, no se pisa en silencio.

**Estado del seed en el repo** (`hya-controles-config.seed.json`, `schemaVersion: 1`, `configVersion: 2`, `updatedAt: 2026-07-30`): 22 clientes, `controlConfigs: []` (vacío — todavía sin relevar), `catalogs: []`. Equipos: `EQ_CANDELA`, `EQ_MELINA`, `EQ_SERGIO`, `EQ_TOYOTA`. Sistemas: `meta4` ("Meta4 / PeopleNet", short `M4`), `axton` ("Axton IT").

Clientes por `code` y `sourceSystem`:
- **meta4 (13):** FINADIET, POF, TIM, PIANO, MARVAL, SPORTLINE, COPETRO, DLA, CARRIER, LOWSEDO, BONAFIDE, CAMPARI, GSMA
- **axton (9):** SIASA, COELSA, REDBULL, MERZ, POP, EPIROC, GEOPAGOS, POINCENOT, COTY

CCTs presentes en el seed: `Camioneros`, `Carga y Descarga`, `FC`, `Comercio`, `Plasticos`, `Sanidad`, `APM`, `Viajantes de Comercio`, `Petroleros Privados`, `UOM`, `ASIMRA`, `ATSA`, `Vitivinicolas`, `Viajantes Perfumistas`.

**DB (Dexie, `js/db.js`, v6):** tablas `clients`, `groupers`, `grouperConcepts`, `fileProfiles`, `sessions`, `sessionFiles`, `sessionResults`, `appConfig`, `controlRuns`, `controlRunFiles`, `controlRunResults`, `clientCatalogs`, `controlConfigs`. `controlRuns.sourceSystem` guarda con qué sistema corrió la corrida. `fileProfiles` es **sólo** mapeo de columnas; lo que no es mapeo vive en `controlConfigs` (D-035).

---

## 6. Cómo se agrega un control nuevo

Resumen de `.claude/skills/nuevo-control/SKILL.md` (skill `/nuevo-control`) + `ui-resultados.md`.

**Preguntar antes de codear (5 cosas que el código no dice):** contra qué se cruza; los encabezados exactos del reporte; qué conceptos se comparan y el signo de la diferencia (convención `Tabulado − Reporte`; `rend_vs_asiento` usa `CONTA − Rend`); si hace falta la variante "Generar Reporte" (→ dos entradas de registry con el mismo `group.id`); a qué clientes se ofrece (default: el cliente que lo pidió, D-015).

**Los 5 puntos de integración:**

| # | Archivo | Qué |
|---|---|---|
| 1 | `js/parsers/<x>Parser.js` | `parse<X>`, `autoDetect<X>Mapping` (devuelve **`null`**, no `{}`, si no encuentra la columna identificadora), re-export de `detectHeaders`; descartar filas sin legajo válido (subtotales de M4) |
| 2 | `js/ui/fileTypes.js` | **una** entrada en `FILE_TYPES`: `autoDetect` siempre declarado (aunque sea `null`), `fixedFormat` = "se parsea sin pantalla de confirmación", `meta` (`metaRegistros` para reporte normal), `flow` sólo si hay varios archivos del mismo tipo; en `fields` el legajo `required: true` y `required` declarado en todos los campos |
| 3 | `js/controls/<x>.js` | `run` / `summarize` / `renderResults` |
| 4 | `js/controls/registry.js` | imports + entrada (campos §3), incluidos `help` y `config` |
| 5 | `tests/<x>Control.test.js` | + agregarlo a la cadena `test:unit` |

`js/ui/fileUpload.js` y `js/ui/controlsWizard.js` **no se tocan** (`tests/fileTypes.test.js` falla si `fileUpload.js` nombra un tipo de archivo). Punto condicional #6: si el control pide columnas nuevas del Tabulado (`extraFieldGroups` de la ficha `tab_control`), cada clave necesita entrada en `TAB_FIELD_LABELS` (`js/ui/fieldHelp.js`) — guard en `tests/fieldHelp.test.js` (D-055).

**Reglas de cálculo obligatorias:**
- **Consolidar por legajo los dos lados** — el Tabulado trae una fila por liquidación, no por empleado. Importar (no copiar) `groupRowsByLegajo`, `sumColumn`, `lastRow` de `js/controls/consolidate.js`, `makeLegajoKey` de `js/utils/legajo.js`, `toNum` de `js/utils/currency.js`. Este bug se arregló 4 veces por copiar.
- **`null` no es `0`.** `sumColumn` devuelve `null` si ninguna liquidación trajo dato. La diferencia se calcula sólo si ambos lados son `≠ null`, y se compara con `Math.abs(diff) > 0.01`.
- **Nada del cliente cableado.** Códigos de concepto → `controlConfigs`; en el código sólo como semilla. Precedencia (D-039): (1) lo confirmado por el analista en el Paso 2, (2) catálogo/código por prefijo (`buildParserMapping` de `conceptMatcher.js`), (3) fallback cableado sólo si Willy confirma. Si nada resuelve: **no completar con 0,00**.
- Columnas del Tabulado por código de concepto → `buildColByCode` de `js/controls/tabCodes.js` + semilla en `TAB_CODE_SEEDS`, sólo si se confirmó contra un Tabulado real.
- **Semáforo:** `unit` en minúscula (`'legajo'`, `'cc'`, `'lista'`, o `null`); `unitsTotal`/`unitsWithDiff` en la unidad declarada, no en filas; el color sale de `computeSemaforoStatus(unitsWithDiff, unitsTotal)` (`js/controls/semaforo.js`), no de `status`.
- Variante "Generar Reporte": el primer argumento se nombra `_primaryRows`, `status: 'info'`, y `unit`/`unitsTotal`/`unitsWithDiff`/`diffTotalAmount`/`worstCase`/`contextNote` en `null`. Errores de negocio: devolver `{ error: 'mensaje en español' }`, no lanzar excepción.
- El editor de la config del control va a `js/ui/<x>ConfigEditor.js`, no al módulo del control. Una `config` sin `mappingKey` es una config que el analista toca y el control nunca ve — `tests/controlConfigRegistry.test.js` lo prohíbe.

---

## 7. Capas de soporte (qué hace cada carpeta)

- **`js/parsers/`** — un archivo por tipo de archivo de origen; parsea el Excel/CSV a filas y auto-detecta el mapeo de columnas. Presentes: `acreditacionesParser`, `acumuladoresParser`, `brutosParser`, `catEmpleados`, `ccXEmpleadoExcel`, `conceptCatalog` (catálogo de conceptos por cliente, valida `CLASIFICACION` con valor `no_remu`), `conceptMatcher` (`buildParserMapping`, matcheo por código/prefijo), `contaExcel`, `costoTotalParser`, `finadietAsientoParser`, `gsPersParser`, `nominaMaestra`, `nrParser`, `popVariacParser`, `rendimientoParser`, `resumenLargoExcel`, `resumenTabuladoHorizontalExcel`, `tabAxtonParser`, `tabuladoControl`, `tabuladoHtml`.
- **`js/ui/fileTypes.js`** — ficha única de cada tipo de archivo (`FILE_TYPES`). Tipos declarados: `nomina_maestra`, `resumen_largo_excel`, `resumen_tabulado_horizontal`, `tab_control`, `cat_empleados`, `brutos_file`, `gs_pers_file`, `nr_file`, `rend_file`, `costo_total_file`, `concept_catalog`, `conta_file`, `cc_x_ee_file`, `acreditaciones_file`, `acumuladores_file`, `tab_axton_file`, `pop_variac_file`, `asiento_conceptos_file`, más dos alias: `tab_prev_file` (`aliasOf: 'tab_control'`) y `tab_axton_prev_file` (`aliasOf: 'tab_axton_file'`).
- **`js/data/catalogoSeed.js`** — `CATALOGO_SEED`, catálogo de conceptos usado como fallback de la auto-detección.
- **`js/exports/`** — `contracts.js` (`EXPORT_CONTRACTS`: columnas del entregable y de qué `(archivo, clave)` sale cada una; la obligatoriedad de una columna de entrada se **deriva** del contrato vía `blocksProgress(fileType, key, legacyRequired)` — el contrato es piso, nunca techo, D-041/D-045) y `contractSheet.js` (`writeContractSheet`, `writeGroupedContractSheet`). Excepción declarada: Acreditaciones escribe su `.xlsx` a mano (D-051).
- **`js/seed/`** — `importSeed.js` / `exportSeed.js`. **`js/utils/`** — `currency.js` (`toNum` único), `legajo.js` (clave de legajo, D-038), `dates.js`, `exportData.js`, `validators.js`.
- **Tres registros declarativos con test-guard** (D-048): tipos de archivo (`js/ui/fileTypes.js`), controles (`js/controls/registry.js`), exports (`js/exports/contracts.js`).

---

## 8. Qué está especificado y NO construido

### Controles diseñados con spec, sin implementar
| Control | Spec | Estado |
|---|---|---|
| **Control de Netos** (Sportline / IFSA) | `specs/spec-control-netos.md` (3.4 del ROADMAP) | Diseño validado, **no implementado**. Bloqueado por dos definiciones de Meli: cómo entra el "neto acordado" por legajo (archivo aparte vs columna) y qué conceptos NR pagan obra social |
| **Gross-up calculator** (AFA, concepto `1017`) | `specs/spec-gross-up.md` (3.5) | **No implementado**. Reemplazaría el goal-seek de Excel |
| **Control de Tasa de Provisiones** (desvíos de tasa por legajo, un solo archivo) | `specs/control-tasa-provisiones.md` (3.10) | Diseño **cerrado y confirmado** (2026-08-05), **no implementado**. Abierto: dónde viven los códigos de concepto por defecto, y la eval manual (debe marcar exactamente 2 legajos del mes de referencia). Detecta un defecto que ningún cruce puede ver (el error está en los dos lados y la diferencia da cero) |
| **Acreditaciones — modo "Controlar"** | `specs/control-acreditaciones-axton.md` § Modos (3.11) | **Sin diseñar** desde 2026-08-05: falta definir qué se compara contra qué y con qué unidad. Sólo existe "Generar Reporte" |
| **Control de escala salarial por convenio** (Comercio: COELSA, REDBULL, TIM, SPORTLINE, CARRIER) | — (3.8) | **No implementado**. Sería el primer control real con `scope: 'convenio'` |

### Infraestructura especificada y no construida
- **Seam de adaptadores por `sourceSystem`** (ROADMAP 2.6/2.7, PLAN_v2 T7/T8, ARCHITECTURE §5): `js/adapters/meta4/` y `js/adapters/axton/` **no existen** en el repo. Los controles siguen viendo columnas crudas. Destrabado por la Fase 4, pero Willy (2026-08-13): "es a futuro, no afecta lo actual — no arrancar sin pedido explícito".
- **Adaptador Axton, piloto Merz** (2.7 / T8): planeado, no arrancado. Es el único ítem del "Definition of Done de v2" sin cerrar.
- **Escalar Axton a los 7-8 clientes restantes** (3.1): post-piloto.
- **`paramSchema` / `inputs`** del control: descritos en PRD y ARCHITECTURE §4, **no existen en el código** (el registry usa `config[]` y `additionalFiles[]`).
- **Migración a `clientCode`**: cerrada en DB v6 con una excepción — `clientCatalogs` sigue usando `clientId` como primary key interna (Dexie no deja cambiar la PK); `clientCode` es índice secundario y `db.js` lo resuelve.
- **Relevar los `controlConfigs` reales de los 21 clientes fuera de Marval** (2.9): `controlConfigs[]` del seed está vacío.
- **Consolidación de equipo**: registro de cobertura mensual vía monday.com (3.2), backend SharePoint/Graph (4.1), roles más allá de analista/admin (4.2) — todo v3/v4, no arrancado.
- **Pendientes de v1**: insights mes a mes (parcial), export Excel multi-hoja (3.6), export/import JSON de sesión (3.7).

### Pendientes de verificación (construido pero no probado contra archivo real), al 2026-08-14
- **FINADIET** — el Asiento de Remuneraciones nunca se comparó contra un mes cerrado armado a mano (Gaby). Riesgo declarado **alto**: "número mal pero coherente". Los alias de encabezado del parser se escribieron de nombres documentados, no de un archivo en mano.
- **MARVAL** — 8 de los 18 conceptos de NR sin código de semilla confirmado (`INDEM_ANT_FALLE`, `INDM_MATERNIDAD`, `GRAT_VAC`, `GRA_VACNOG_SAC`, `INDEM_FUER_MAY`, `INDEM_EMBARAZO`, `ASIG_PAS`, `INCREMENTO_ST`). Necesita un Tabulado con indemnizaciones liquidadas. Mientras tanto se piden a mano en el Paso 2 con el toggle ⊘ (D-052).
- **POP** — Acumuladores Ganancias nunca corrió end-to-end en el navegador con el `.xlsx` real.
- **POF** — el concepto `1000` (mensuales) de Variación entre períodos nunca corrió con datos; y falta cerrar con el cliente qué quincena compara contra cuál.

### Deuda/ítems abiertos menores
- Override de clave de legajo **por corrida** (D-038 punto 2) — el estándar por cliente ya está.
- Auto-detección de columnas del Tabulado: prioridad de palabras clave mal ordenada (`autoDetectTabExtraConfig` — "opción 3" de D-053).
- `fmtDate` en `gsPers.js`/`nr.js`/`catXEmpleados.js` trata todo número entre 1 y 100.000 como fecha de Excel → puede imprimir una fecha inventada en el entregable. El rango correcto (1970-2100) ya está en `js/ui/columnHints.js`; falta la decisión de Willy sobre qué mostrar.
- NR derivado del catálogo de conceptos del cliente en vez de los 18 cableados en `NR_CONCEPTS` — recién es requisito cuando un 2º cliente pida NR.
- Los ~56 códigos de `DEFAULT_CONCEPT_CONFIG` (`rendVsTabu.js`) no viven en `tabCodes.js` (consistencia, no corrección).
- `tests/rendVsAsientoDrill.test.js` fuera de CI (necesita fixtures anonimizados).
- Variación entre períodos: falta UI para editar conceptos y causas de ausencia, y el reuso de la corrida anterior desde IndexedDB.
- Promociones de scope pendientes de un 2º cliente: Variaciones (POF), Asiento (FINADIET), y los 10 de MARVAL a `sistema: meta4`.

---

## 9. Receta de 5 pasos para responder "¿esto ya está?"

```bash
git clone https://github.com/bhidalgo-ar/Controles-Varios /tmp/cv && cd /tmp/cv
```

**Paso 1 — Listar los controles construidos (1 archivo).**
```bash
grep -n "^  [a-z_]*: {\|    id:\|    label:\|    scope:\|_ONLY\|scopeMeta:\|    tabRequired:\|      { key:" js/controls/registry.js
```
Si el control propuesto aparece como `id`/`label` → **ya está construido**. Ojo con `hidden: true` (construido pero no ofrecido) y con las variantes `_reporte` (existe "Generar Reporte" pero no "Controlar", o viceversa).

**Paso 2 — Ver qué compara y qué archivos pide.**
```bash
grep -n -A3 "description:" js/controls/registry.js
```
Confirma el cruce exacto (qué conceptos, contra qué archivo) y los `additionalFiles`.

**Paso 3 — Si no aparece en el registry, buscar si está especificado y sin construir.**
```bash
head -4 specs/*.md            # cada spec abre con su línea "Estado:"
grep -n "no implementado\|todavía no está implementado\|planeado\|Falta\|pendiente" ROADMAP.md
```
`ROADMAP.md` §v3 (tabla 3.x) y §"Estado al 2026-08-13" son las dos listas canónicas de pendiente. `PLAN_v2.md` §2 T7/T8 = adaptadores deprioritizados.

**Paso 4 — Confirmar a qué cliente se le ofrecería.**
```bash
grep -n "scope\|scopeMeta\|appliesWhen" js/controls/scope.js | head -30
python3 -c "import json;d=json.load(open('hya-controles-config.seed.json'));print([(c['code'],c['sourceSystem'],c['ccts'],c['attributes']) for c in d['clients']])"
```
Si el cliente del pedido no está en el seed, o el control existe pero con `scope: 'cliente'` de otro `code`, la respuesta es "existe la lógica pero no se le ofrece a ese cliente — hay que promoverlo o forzarlo".

**Paso 5 — Verificar si está construido pero sin verificar.**
```bash
grep -n -A20 "Pruebas pendientes de tu lado, por cliente" ROADMAP.md
grep -rn "Pendiente de prueba\|nunca corrió\|sin validar" ROADMAP.md specs/*.md | head -20
```

**Veredicto:**
- En `registry.js` y sin flag → **construido**.
- En `registry.js` pero `hidden: true`, o sólo una de las dos variantes, o en "Pruebas pendientes" → **a medias**.
- Sólo en `specs/` o en la tabla v3 de `ROADMAP.md` → **especificado, no construido**.
- En ningún lado → **no existe**; para construirlo, seguir §6 (skill `/nuevo-control`).
