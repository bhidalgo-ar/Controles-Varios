# Auditoría de escalabilidad — agosto 2026

> **Estado:** vigente — inventario de trabajo abierto. Se actualiza a medida que se cierra cada ítem.
> **Origen:** relevamiento de los 60 archivos JS del repo (2026-08-11), con verificación adversarial:
> cada hallazgo se confirmó leyendo el código y reproduciendo el síntoma con `node` antes de anotarlo.

Este documento existe porque el inventario vivía sólo fuera del repo. Los hallazgos ya cerrados están
en el `CHANGELOG.md` y en `git log`; acá queda lo que falta.

**Actualización 2026-08-13 — el inventario original quedó vacío.** Los 14 bugs y los 5 hotspots que
encontró la auditoría están todos cerrados: los dos que seguían abiertos en la lista (el #3, badge en
dark mode, y el #6, fallback de columna) se cerraron el 2026-08-12, y las 5 fases del plan
(`specs/plan-escalabilidad-fases.md`) están las cinco cerradas. Se verificó leyendo el código el
2026-08-13, después del PR #130 — el detalle de cada cierre está más abajo.

**Lo que queda abierto de este relevamiento es un solo hallazgo, y no salió del inventario de bugs
sino de la letra chica del rediseño**: el mis-mapeo (una columna mapeada a la columna equivocada).
Ver la sección al final.

---

## Bugs abiertos

Ninguno del inventario original. El hallazgo abierto es el de la última sección (mis-mapeo).

---

## Bugs cerrados

### 3. El badge "⚠ sin asignar" es ilegible en dark mode — cerrado 2026-08-12 (Fase 2)

Los helpers de calidad de match estaban escritos dos veces en el mismo archivo: la copia local usaba
`var(--color-warning)` y la copia exportada —única consumidora del panel "Columnas del Tabulado" de
Brutos/GS Pers/NR— tenía `#EAB308` y `#B45309` cableados. Los tokens cambian en dark mode; los hex no,
así que el badge que tiene que gritar "esto no está mapeado" se pintaba marrón oscuro sobre fondo casi
negro.

Lo cerró la Fase 2: se borró la copia local (llamaba a las funciones exportadas con la firma que ya
tenían) y los dos hex pasaron a `var(--color-warning)`/`var(--color-warning-bg)`. Detalle en
`specs/plan-escalabilidad-fases.md`, Fase 2.

### 6. El fallback de columna sólo lo tenía Brutos — cerrado 2026-08-12 (D-039/D-042)

Willy trajo el Tabulado real de Marval 04-2026 y los códigos se **leyeron del archivo** en vez de
inferirse por simetría, que es lo que D-039 prohíbe. Quedaron 14 semillas en `js/controls/tabCodes.js`,
compartidas por Brutos, GS Pers y NR. De paso apareció que el fallback de Brutos era **letra muerta**:
buscaba una columna llamada `'1003'` y Meta4 la exporta `'1003-SUELDO'`.

Los 8 conceptos de NR que no se liquidaron ese mes siguen **sin semilla a propósito** y se piden
explícitamente en el Paso 2 (con el toggle ⊘ como salida desde D-052). Eso no es este bug: es el
comportamiento correcto de D-036, y para completarlos hace falta un Tabulado de un mes con
indemnizaciones liquidadas. Anotado en `ROADMAP.md`.

### 1. `rendVsTabu` producía `NaN` y pintaba el tile en VERDE — cerrado 2026-08-12

`js/controls/rendVsTabu.js:233` usaba `!==` donde `rendVsAsiento.js:685` usaba `!=`, y se invocaba
con optional chaining sobre un objeto que puede ser `null`: llegaba `undefined`, `undefined !== null`
es `true`, y evaluaba `undefined - r` → `NaN`. El `reduce` del hero no lo atrapaba (`?? 0` sólo cubre
`null`/`undefined`), imprimía "Diferencia total de NaN", y como `Math.abs(NaN) > 0.01` es `false`,
**el tile salía verde**. La tabla de Detalle lo disimulaba porque filtra con `Number.isFinite`.

Resuelto con el fix de fondo, no el mínimo: `diffOrNull(a, b)` en `js/utils/currency.js`, con guard
`Number.isFinite` en los dos lados, usado por los dos controles gemelos. `hasDiff` de rendVsTabu pasó
también a `Number.isFinite`. Cubierto por `tests/rendVsTabuControl.test.js` (13 asserts; los 4 que
prueban el bug fallan si se revierte el guard).

### 2. "Seleccionar todos" no seleccionaba ningún control de POF ni Acreditaciones — cerrado 2026-08-12

El filtro miraba `group.mode === 'Controlar'`, un string de UI, cuando el registry ya tiene cinco
modes. La intención pasa a declararse en el registry con `group.primary`. Ver **D-040** — cubierto
por `tests/controlsRegistryScope.test.js`, que falla si un grupo nuevo no declara su variante
principal.

### 4. Reintentar tras un error de parseo perdía la auto-detección — cerrado 2026-08-12

La rama `catch` de `js/ui/fileUpload.js` reimplementaba el handler `onConfirm` un nivel más adentro,
y la copia no reenviaba `autoDetected` (después de un error los campos que decían "✓ auto" pasaban a
"↺ sesión anterior", informando un perfil guardado que no existe) ni `autoDetect` (cancelar y volver
a subir el mismo archivo obligaba a mapear las columnas a mano). Reemplazado por un
`showMappingForm()` nombrado que se re-muestra a sí mismo; la copia desapareció, así que además el
segundo error ya no expulsa al analista al drop zone.

### 5. `variacionesMapGuardado` nunca se persistía — cerrado 2026-08-12

Vivía sólo en el objeto `state`, que se arma de cero en cada entrada al wizard, mientras el
comentario decía "se recuerda para la próxima corrida del cliente". Ahora se guarda en
`controlConfigs` bajo el controlId `variaciones_concept_map`, en el mismo `onChange`, y se precarga
con el resto de las configs. Al estar en `controlConfigs` viaja también en el export/import del seed
(D-035). Cubierto por `tests/variacionesConceptMap.test.js`, que hace el round-trip por IndexedDB y
verifica que los dos lados (anterior/actual) no se aplanen.

### 7. Divergencias entre copias del mismo molde — cerrado 2026-08-12

| Dónde | Qué pasó | Cómo se cerró |
|---|---|---|
| `js/main.js` | `escHtml` no escapaba la comilla doble | Se agregó el `.replace(/"/g, '&quot;')` |
| `fmt`/`fmtNum` en 9 controles | Sólo la de `acreditaciones.js` guardaba contra `undefined`; las otras 8 tiraban `TypeError` y rompían el render entero ante una clave ausente | Las 9 copias se borraron: importan `formatAmount` de `js/utils/currency.js`, que ya guardaba `null`, `undefined` y `NaN` |
| `periodSuffix`/`dateSuffix` en 9 controles | `dateSuffix` devolvía `YYYYMMDD` en UTC en 8 copias y `DDMMYYYY` local en Variaciones — un export a las 22:00 de Argentina salía fechado al día siguiente en unas y no en otras; `periodSuffix` tenía el guard `String(period)` en una sola | Extraídos a `js/utils/dates.js`, en `YYYYMMDD` **local** (el formato de la mayoría, con el bug de UTC corregido) |
| `normCCName` en `rendVsTabu.js` vs `rendVsAsiento.js` | Uno normalizaba acentos y el otro no: "Administración" matcheaba en un control y no en su gemelo | rendVsTabu normaliza acentos igual que su gemelo; con assert en `tests/rendVsTabuControl.test.js` |
| `js/controls/brutos.js` (pre-escape) | Pre-escapaba el nombre y `resultBlocks.js` lo volvía a escapar: se veía "PEREZ &amp;amp; GOMEZ" | Se sacó el `esc()` del call site; escapa `renderIssues`, como en los otros 10 controles |
| `js/controls/brutos.js` (guard) | `colDefs.length <= 1` como guard de "sin columnas configuradas", con 3 entradas incondicionales en el array: el aviso era código inalcanzable | `<= 3`, el umbral que ya tenía `gsPers.js` |

La extracción no cierra el problema de fondo (siguen 28 copias de `esc`/`escHtml` y las 4 de
consolidación por legajo), pero saca del inventario las que ya habían divergido.

---

## Hotspots de duplicación — los 5 cerrados

Rankeados por palanca, como se relevaron. El detalle fase por fase está en
`specs/plan-escalabilidad-fases.md`.

| # | Hotspot | Radio | Fase | Estado |
|---|---|---|---|---|
| 1 | Consolidar por legajo + `sumColumn`: 4 copias, y el skill mandaba a copiarlas | 6 archivos | 1 | ✅ cerrado 2026-08-12 — `js/controls/consolidate.js`, las 4 copias borradas (D-042), y el skill manda a **importar** (Fase 5) |
| 2 | La cascada de montaje de la tabla Detalle (toolbar + paginación + buscador + sticky + export), 13 veces | 13 sitios / 9 archivos | 3 | ✅ cerrado 2026-08-12 — `wireTableTools()` + `createResultsToolbar()` en `js/ui/tableTools.js` |
| 3 | Agregar un control toca ~12 puntos en `fileUpload.js` + `controlsWizard.js`, sin ningún guard entre ellos | 12 puntos (medidos: **19**) | 4 | ✅ cerrado 2026-08-13 — `js/ui/fileTypes.js` (una ficha por tipo) + config por control declarada en el registry, en 7 PRs (#119-#125). Assert: `fileUpload.js` no nombra ningún tipo de archivo ni declara su propia lista de campos |
| 4 | El `.xlsx` se arma a mano en 13 funciones de 10 archivos | 10 archivos | 2-3 | ✅ cerrado 2026-08-13 por el contrato de export (no por las Fases 2-3, como estimaba esta tabla): `writeContractSheet`/`writeGroupedContractSheet` escriben los exports con contrato, y el único que va a mano —Acreditaciones— está declarado como excepción y **verificado contra su contrato** (D-051). `variaciones`/`acumuladores` quedan afuera con motivo (D-045) |
| 5 | `toNum()` y la clave de legajo: 7 y 3 semánticas distintas para la misma operación | 11 archivos | 1 | ✅ cerrado 2026-08-12 — `js/utils/currency.js` (`toNum`) y `js/utils/legajo.js` (`makeLegajoKey`), las 10 copias borradas (D-042) |

Dos precisiones que salieron de la verificación y conviene no perder:

- **`toNum` no se unifica "hacia el más común".** Seis controles usan `Number(v)`; `variaciones.js`
  tiene el único parser es-AR completo. Con un Tabulado HTML (`tabuladoHtml.js` devuelve todas las
  celdas como string) `"1.234,56"` da `null` en los seis y `1234.56` en Variaciones. Pero adoptar el
  de Variaciones a ciegas rompe al revés: `"1234.56"` pasa a leerse `123456`. El helper único tiene
  que distinguir el caso string-es-AR del número ya parseado por SheetJS.
- **El `fallbackCode` de Brutos no es un default silencioso que haya que borrar** — lee una columna
  real por código cuando el analista no mapeó. Ver D-039.

---

## Lo único abierto: el mis-mapeo (una columna apuntando a la columna equivocada)

**Estado: abierto, esperando que Willy elija el alcance.** Es lo que queda del relevamiento después de
los PR #100-#129, y no salió del inventario de bugs: estaba declarado como "lo que este diseño NO
resuelve" en `specs/contrato-export.md`, que es justamente donde una cosa se pierde de vista.

**Qué pasa, en una línea:** todo el trabajo de obligatoriedad (contrato de export, gate del Paso 2,
toggle ⊘, Pasos 0-8) hace que una columna **vacía** grite. Una columna **equivocada** sigue pasando en
verde: mapeada + obligatoria = satisfecha, aunque apunte al lugar errado. Y la mandatoriedad lo
*empeora*, porque un `required` queda satisfecho por el valor equivocado.

**Los tres mecanismos verificados en el código (2026-08-13), que es lo que lo vuelve probable y no
hipotético:**

1. **La auto-detección no respeta la prioridad de sus propias palabras clave.**
   `autoDetectTabExtraConfig` (`js/ui/controlsWizard.js:1272`) hace
   `tabHeaders.find(h => kws.some(kw => h.includes(kw)))`: recorre los **encabezados** por fuera y las
   palabras clave por dentro, así que gana el primer encabezado del archivo que contenga cualquiera de
   ellas, no la palabra clave más específica. `find('fec_pago', 'fecha_pago', 'pago')` se queda con
   `FORMA_PAGO` si viene antes que `FEC_PAGO`; `find('fecha_alta', …, 'alta')` engancha cualquier
   encabezado con "alta" adentro. Es el mismo mecanismo del bug de `conceptMatcher` ya cerrado
   (`INDEM_INTEG` contra la columna de `SAC_INDEM_INTEG`), en otra función.
2. **`fmtDate` convierte cualquier número plausible en una fecha plausible.** Las copias de
   `js/controls/gsPers.js:538`, `js/controls/nr.js:666` y `js/controls/catXEmpleados.js:621` tratan
   todo número entre 1 y 100.000 como serial de Excel. Un importe mapeado por error en una columna de
   fecha sale como una fecha creíble en el `.xlsx`, no como un error.
3. **`type` se declara pero no se valida.** Los contratos ya declaran `type: 'num'` / `'date'` /
   `'txt'` por columna (`js/exports/contracts.js`) y **nadie lo mira**: declarar el tipo no es
   validarlo.

**Cómo se corrige — tres opciones, de menor a mayor:**

- **(a) Mostrar una muestra de valores reales al lado de cada columna elegida** (Paso 2 y pantalla de
  carga). No bloquea nada, no puede equivocarse, y ataja lo que ninguna validación automática puede
  saber: que el analista vea que en "Fecha de pago" eligió una columna de importes. Es lo más barato y
  lo que más casos cubre.
- **(b) Validar el contenido contra el `type` que el contrato ya declara.** Al confirmar el mapeo,
  mirar las primeras N filas con dato de la columna elegida y avisar si no parsean como lo declarado
  ("elegiste una columna donde 9 de 10 valores son importes, y acá va una fecha"). Aviso, no bloqueo:
  un archivo raro no puede dejar al analista sin salida (D-036), y la salida ya existe (⊘).
- **(c) Arreglar la prioridad de la auto-detección** — recorrer las palabras clave por fuera y los
  encabezados por dentro, y preferir la coincidencia exacta antes que la parcial. Es un cambio chico
  con riesgo real de mover mapeos que hoy salen bien por casualidad, así que va **después** de (a),
  cuando el analista pueda ver qué cambió.

**Recomendado: (a) primero, (b) después, (c) al final.** Las dos primeras no cambian ningún resultado
de un control; sólo hacen visible lo que hoy es invisible.
