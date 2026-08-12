# Auditoría de escalabilidad — agosto 2026

> **Estado:** vigente — inventario de trabajo abierto. Se actualiza a medida que se cierra cada ítem.
> **Origen:** relevamiento de los 60 archivos JS del repo (2026-08-11), con verificación adversarial:
> cada hallazgo se confirmó leyendo el código y reproduciendo el síntoma con `node` antes de anotarlo.

Este documento existe porque el inventario vivía sólo fuera del repo. Los hallazgos ya cerrados están
en el `CHANGELOG.md` y en `git log`; acá queda lo que falta.

**Actualización 2026-08-12 — se cerró la Fase 0.** Quedan abiertos dos ítems, los dos a propósito: el
#3 (badge en dark mode) porque la Fase 2 rehace esa capa entera, y el #6 porque necesita datos reales
del cliente para decidirse. El detalle de lo cerrado está más abajo.

---

## Bugs abiertos

Cada uno es una afirmación verificable: se puede escribir un assert que hoy falle.

### 3. El badge "⚠ sin asignar" es ilegible en dark mode

Los helpers de calidad de match están escritos dos veces en el mismo archivo. La copia local
(`js/ui/fileUpload.js:776-788`) usa `var(--color-warning)`; la copia exportada (`:1012-1024`), única
consumidora del panel "Columnas del Tabulado" de Brutos/GS Pers/NR, tiene `#EAB308` y `#B45309`
cableados. Los tokens cambian en dark mode; los hex no.

**Severidad:** media — el badge que tiene que gritar "esto no está mapeado" se pinta marrón oscuro
sobre fondo casi negro.
**Fix:** borrar las closures locales, usar los exports, y corregir esos dos hex a tokens. Entra en
la Fase 2 (capa visual).

### 6. El fallback de columna sólo lo tiene Brutos

Ver **D-039**. Decidida la precedencia; queda abierto si NR y GS Pers deben tener fallback propio y
con qué códigos — se confirma contra un Tabulado real, no por simetría. Guillermo lo dejó abierto a
propósito el 2026-08-12: hasta que haya un Tabulado contra el cual confirmarlos, NR y GS Pers piden
la columna explícitamente, que es el comportamiento correcto.

---

## Bugs cerrados

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

## Hotspots de duplicación

Rankeados por palanca. El detalle del plan por fases está en `ROADMAP.md`.

| # | Hotspot | Radio | Fase |
|---|---|---|---|
| 1 | Consolidar por legajo + `sumColumn`: 4 copias, y el skill mandaba a copiarlas | 6 archivos | 1 |
| 2 | La cascada de montaje de la tabla Detalle (toolbar + paginación + buscador + sticky + export), 13 veces | 13 sitios / 9 archivos | 3 |
| 3 | Agregar un control toca ~12 puntos en `fileUpload.js` + `controlsWizard.js`, sin ningún guard entre ellos | 12 puntos | 4 |
| 4 | El `.xlsx` se arma a mano en 13 funciones de 10 archivos | 10 archivos | 2-3 |
| 5 | `toNum()` y la clave de legajo: 7 y 3 semánticas distintas para la misma operación | 11 archivos | 1 |

Dos precisiones que salieron de la verificación y conviene no perder:

- **`toNum` no se unifica "hacia el más común".** Seis controles usan `Number(v)`; `variaciones.js`
  tiene el único parser es-AR completo. Con un Tabulado HTML (`tabuladoHtml.js` devuelve todas las
  celdas como string) `"1.234,56"` da `null` en los seis y `1234.56` en Variaciones. Pero adoptar el
  de Variaciones a ciegas rompe al revés: `"1234.56"` pasa a leerse `123456`. El helper único tiene
  que distinguir el caso string-es-AR del número ya parseado por SheetJS.
- **El `fallbackCode` de Brutos no es un default silencioso que haya que borrar** — lee una columna
  real por código cuando el analista no mapeó. Ver D-039.
