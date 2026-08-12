# Plan de escalabilidad — estado por fase

> **Para retomar en otra sesión sin el contexto de la conversación original.** Este archivo es la
> foto de cada fase; el inventario completo de bugs y hotspots (con archivo:línea, evidencia y
> repro) está en `specs/auditoria-escalabilidad-2026-08.md`. El resumen de una línea por fase vive
> también en `ROADMAP.md` — acá está el detalle para seguir trabajando.

**Origen:** auditoría repo-wide del 2026-08-11 (15 agentes: relevar → sintetizar → verificar
adversarialmente, reproduciendo cada hallazgo con `node` antes de darlo por bueno). Encontró 14 bugs
reales corriendo en producción — no deuda técnica — y 5 hotspots de duplicación.

**El objetivo de fondo, para no perderlo de vista en ninguna fase:** que un cambio (visual, de
lógica de un control, de un archivo que se sube, de cómo se ven los resultados) se aplique una vez y
alcance a todos los controles que corresponda, en vez de tocar 9-13 archivos por separado.

---

## Fase 0 — Bugs que dan un resultado incorrecto hoy

**Estado: cerrada del todo** (2026-08-12, segunda pasada del día). Los 5 ítems accionables se arreglaron, y
los 2 que quedaban por decisión de Guillermo también se cerraron:

- **#3 — badge "⚠ sin asignar" ilegible en dark mode.** Lo cerró la Fase 2 (los 2 hex pasaron a
  `var(--color-warning)`). Falta sólo que Willy lo confirme visualmente en un navegador.
- **#6 — fallback de columna para NR y GS Pers (D-039).** Cerrado: Willy trajo el Tabulado real de Marval
  04-2026 y los códigos se leyeron del archivo en vez de inferirse. 14 semillas en
  `js/controls/tabCodes.js`; los 8 conceptos NR que no se liquidaron ese mes siguen sin semilla a propósito
  y se piden explícitamente, que es el comportamiento correcto.

### Cerrados en el tercer PR (2026-08-12)

| # | Qué | Dónde |
|---|---|---|
| 1 | `rendVsTabu` daba `NaN` y pintaba el tile en **verde** — la única de severidad alta | `diffOrNull()` en `js/utils/currency.js` · `tests/rendVsTabuControl.test.js` |
| 2 | "Seleccionar todos" no seleccionaba nada en POF ni Acreditaciones | `group.primary` en el registry · D-040 |
| 4 | Reintentar tras un error de parseo perdía la auto-detección | `showMappingForm()` en `js/ui/fileUpload.js` |
| 5 | El mapeo de conceptos de Variaciones se perdía al salir del wizard | `controlConfigs` / `variaciones_concept_map` |
| 7 | Las divergencias entre copias del mismo molde | `js/utils/dates.js` + `formatAmount` · ver la auditoría |

El #7 se cerró **extrayendo** en vez de emparejando copia por copia: `dateSuffix`/`periodSuffix`
salieron de los 9 controles a `js/utils/dates.js`, y las 9 copias de `fmt`/`fmtNum` pasaron a
importar `formatAmount` de `js/utils/currency.js`, que ya existía y ya tenía el guard que a 8 de
ellas les faltaba. No toca la Fase 1: son helpers de formato sin la ambigüedad semántica que traba a
`toNum` y a la clave de legajo.

### Cerrados antes (PR #98 + PR #99)

| # | Qué | Dónde |
|---|---|---|
| 1 | Gate de Variaciones relajado de más: dejaba pasar un concepto sin resolver en los DOS archivos | PR #98 · D-036 |
| 2 | Columnas confirmadas huérfanas se usaban a ciegas en vez de avisar | PR #98 |
| 3 | Mapeo guardado de Variaciones aplanado (el período actual pisaba al anterior) | PR #98 |
| 4 | PDF de Variaciones imprimía secciones sin dato real, indistinguibles de un cero verificado | PR #98 |
| 5 | GS Pers no consolidaba liquidaciones múltiples por legajo (pisaba en vez de sumar) | PR #99 · `tests/gsPersControl.test.js` |
| 6 | `loadExcelJS()` no devolvía la librería — export de Variaciones roto | PR #99 |
| 7 | EE x CATEG: `downloadXlsx` inexistente (ReferenceError) + resumen contaba filas en vez de empleados | PR #99 |
| 8 | Agrupadores: semáforo contaba legajo×agrupador; `diffTotalAmount` topeado en el top-10 | PR #99 |
| 9 | Checklist mensual con criterio de semáforo distinto al resto de las pantallas | PR #99 |
| 10 | `deleteClient()` sin 4 tablas en la cascada → datos de empleados podían reaparecer en un cliente nuevo homónimo. Resuelto con Ocultar/Borrar definitivamente | PR #99 · D-037 |

(La numeración no coincide con los commits — son 10 arreglos repartidos en los 2 PRs; "7 cerrados" en
el sentido del inventario de la auditoría, que agrupa algunos juntos.)

### Abiertos (detalle completo con repro en `specs/auditoria-escalabilidad-2026-08.md`)

| # | Qué | Severidad | Bloqueado por |
|---|---|---|---|
| 3 | Badge "⚠ sin asignar" ilegible en dark mode (2 hex cableados en vez de tokens) | media | nada — **movido a la Fase 2**, que rehace esa capa entera |
| 6 | Fallback de columna sólo lo tiene Brutos (`'1003'`/`'1017'` cableados) | — | ✅ cerrado 2026-08-12 — códigos confirmados contra el Tabulado real; y el fallback de Brutos resultó ser **letra muerta** (buscaba una columna `'1003'`, Meta4 la exporta `'1003-SUELDO'`) |

### Decisiones pendientes, no técnicas (fuera del inventario de bugs pero abiertas desde antes)

- **D-010** — el seed con datos reales de clientes sigue en la raíz de un repo público. Opciones:
  repo privado / sacar el seed y distribuirlo por SharePoint / anonimizarlo.
- **D-013** — la contraseña del modo admin la generó un agente; el repo es público, así que el hash
  es visible. ¿Rotarla?

---

## Fase 1 — Fundamentos de cálculo

**Estado: cerrada** (2026-08-12). Willy resolvió las dos decisiones que la trababan y trajo, además, los
tres archivos reales (Tabulado 04-2026 de Marval + Reporte de NR + Gastos personales y dto cochera del
mismo período) que también destrabaron el punto 3 de D-039. Detalle completo en D-042.

**Lo que entró:**

- **`toNum` único** en `js/utils/currency.js`. No se eligió un bando: un `number` (SheetJS ya parseó la
  celda) pasa sin tocar, y un string se lee como es-AR; con dos separadores el **último** es el decimal, y
  con un solo punto es de miles sólo si forma grupos de tres exactos. Las 7 copias, borradas.
- **`js/utils/legajo.js`** — default `sin_ceros` (`'007'` y `'7'` son el mismo empleado), configurable por
  cliente en `clients.legajoKeyMode` desde `#/admin`, distribuido en el seed, resuelto una vez por corrida
  en `mapping.legajoKeyMode`. Los 3 criterios que convivían, borrados.
- **`js/controls/consolidate.js`** — `groupRowsByLegajo(rows, col, { keyFn })`, `sumColumn(group, col,
  { toNum })`, `lastRow(group)`. Parametrizados, que es lo que el primer intento de este plan había hecho
  mal. Las 4 copias, borradas.
- **`js/controls/tabCodes.js`** — `buildColByCode` (estaba duplicado en `rendXEe` y `rendVsTabu`) más las
  14 semillas de código confirmadas contra el Tabulado real.
- **Los dos lados de cada cruce se consolidan.** Brutos y GS Pers consolidaban el Tabulado pero recorrían
  el reporte fila por fila. Con el reporte de NR real, que trae una fila por liquidación, quedó demostrado
  que no es un caso hipotético.

**Verificación contra los archivos reales** (no sólo tests con datos inventados): las 14 semillas resuelven
solas; NR consolida 543 filas de reporte en 527 legajos y cruza sin una sola diferencia (5.270 celdas
comparadas con dato en los dos lados, 550 con importe distinto de cero); los tres modos "Generar Reporte"
sacan una fila por empleado; el legajo con 9 liquidaciones suma 30.000 en los dos lados.

**Lo que queda de esta fase:** el **override de clave de legajo por corrida** sin pisar el default del
cliente (D-038 punto 2). Entró el estándar por cliente; el override efímero necesita decidir en qué paso del
wizard va, y sin un caso real esa decisión se toma mal.

<details>
<summary>El estado anterior de esta fase, para entender por qué el orden era obligatorio</summary>

**Estaba bloqueada por dos decisiones de Guillermo:**

1. **`toNum()` único** (7 implementaciones hoy: la mayoría hace `Number(v)`, y `variaciones.js`
   tiene el único parser es-AR completo — maneja miles, decimales y paréntesis para negativos). **No
   se unifica "hacia el más común":** con un Tabulado HTML (`tabuladoHtml.js` devuelve todas las
   celdas como string) `"1.234,56"` da `null` en los 6 controles naive y `1234.56` en Variaciones.
   Adoptar el de Variaciones a ciegas en los otros rompe al revés (`"1234.56"` pasaría a leerse
   `123456`, porque en Excel real vía SheetJS la celda ya llega como número). El helper final tiene
   que distinguir el caso string-es-AR del caso número-ya-parseado, no elegir un bando.
2. **Clave de legajo — default global mientras no haya config por cliente** (D-038, acordada,
   **falta el default**). Hoy 3 criterios distintos deciden si `"007"` y `"7"` son el mismo
   empleado: `norm()` (sólo trim, en nr/brutos/gsPers/variaciones/rendVsAsiento), `normId()` con
   `replace(/^0+/,'')` en `rendXEe.js`, y otro `normId()` con `parseInt` en `catXEmpleados.js`.
   Opciones para el default:
   - **(a) `trim` solo** — conservador, es lo que hace la mayoría hoy, pero deja `"007"` y `"7"`
     como empleados distintos en 5 de los 6 módulos.
   - **(b) Sin ceros a la izquierda** — es lo que ya hacen `rendXEe` y `catXEmpleados`, matchea más,
     pero puede colapsar dos legajos en un cliente que no rellena con ceros.
   El estándar final es **por cliente, en `controlConfigs`, precargado por corrida y editable sin
   pisar el default** (mismo patrón que D-035, con un override efímero que D-035 no tiene) — el
   default global sólo hace falta para el cliente que todavía no configuró nada.

**Una vez resueltas esas dos:**

3. Extraer `js/controls/consolidate.js` con `groupRowsByLegajo(rows, col, keyFn)` y
   `sumColumn(group, col, toNum)` — los dos parametrizados (el error del primer intento de este
   plan fue proponer una versión sin parámetros, que rompía Variaciones).
4. Migrar `nr.js`, `brutos.js`, `gsPers.js`, `variaciones.js` a importar de ahí y borrar las 4 copias.
5. El `fallbackCode` de Brutos (`'1003'`/`'1017'`) migra a `controlConfigs`, no se borra sin
   reemplazo (D-039).

**Qué YA está listo para cuando se resuelvan las decisiones:** el skill `nuevo-control` (ver Fase 5)
ya le dice a cualquiera que agregue un control que busque este módulo con `grep` antes de copiar
nada — así que en cuanto exista, se adopta solo.

</details>

---

## Fase 2 — Capa visual unificada

**Estado: cerrada** (2026-08-13). Lo único que faltaba —`css/components.css`— se cerró con Chromium real
disponible en el sandbox desde esta sesión (antes no se podía verificar sin abrir la app a mano). Detalle
al final de esta fase.

- **Hex hardcodeados: cerrado.** El bug abierto #3 de Fase 0 (badge "⚠ sin asignar" en
  `fileUpload.js`, ilegible en dark mode) tenía dos causas juntas: una copia local de
  `matchLevel`/`fieldStyle`/`fieldBadge` que ya usaba tokens bien, y la versión exportada —única
  consumidora real del panel "Columnas del Tabulado" de Brutos/GS Pers/NR— con `#EAB308`/`#B45309`
  cableados. Se borró la copia local (llamaba a las funciones exportadas con la firma que ya tenían)
  y los dos hex pasaron a `var(--color-warning)`/`var(--color-warning-bg)`. Quedaban además 4
  fallbacks tipo `var(--token, #hex)` en `helpPopover.js` y `rendVsAsiento.js` — muertos en la
  práctica porque el token siempre está definido en `:root`, pero seguían siendo hex fuera de
  `tokens.css` — se les sacó el fallback.
  **Excepción deliberada, no pendiente:** el CSS de impresión de `imprimirVariaciones()`
  (`variaciones.js`) sigue con hex cableado. Es un documento HTML separado
  (`window.open('', '_blank')` + `document.write`), sin acceso a las custom properties del árbol
  principal, y su paleta tiene que quedar fija en modo claro sin importar el tema del navegador — es
  un entregable A4 en papel para el cliente, no una pantalla de la app. Convertirlo a `var(...)`
  sería un no-op silencioso (el token no resolvería en ese documento) o, peor, requeriría inyectar
  los valores calculados a mano — ninguna gana nada.
- **`createResultsToolbar()`: hecho para 9 de 15 sitios.** Vive en `js/ui/tableTools.js` (mismo
  módulo que `initShowMorePagination`/`initSearchCombobox`, con quienes siempre corre junto).
  Migrados: `brutos.js` (2), `gsPers.js` (2), `nr.js` (2), `rendVsTabu.js` (1), `rendXEe.js` (1),
  `acreditaciones.js` (1, el de la lista con filtro por tipo). **Los otros 6 quedaron afuera a
  propósito**, porque no son el mismo molde: `acreditaciones.js:788` es un header sin exportar (sólo
  texto + buscador); los 3 de `acumuladoresGanancias.js` son export-only, un widget de tres selects
  bespoke sin exportar, y buscador-sin-export; los 2 de `variaciones.js` son export+PDF sin buscador
  y dos selects de sentido de variación sin buscador ni exportar. Forzarlos a la forma de
  `createResultsToolbar()` hubiera significado un parámetro por variante para cubrir un solo caso
  cada uno — la abstracción que `CLAUDE.md` pide no sumar. Si alguno de esos 6 vuelve a divergir
  entre sí (no de los otros 9), ahí sí amerita su propio helper.
- **CSS de PDF compartido: no aplica todavía.** Hoy hay **una sola** función `imprimir*()` en toda la
  app (`imprimirVariaciones`). El ítem del roadmap original asumía que había más de una para
  compartir — no la hay. Se retoma cuando exista un segundo PDF (ver `specs/spec-control-netos.md`
  y `specs/spec-gross-up.md`, los dos candidatos más próximos en v3).

**`js/controls/variaciones.js:995`** (heatmap "Cómo se movieron los escalones"): `const fg = t > 0.62
? '#fff' : 'inherit';`. Se revisó y se deja: no es un color de UI, es una decisión de contraste
contra un fondo calculado con `color-mix()` que se satura progresivamente — no hay token de
tokens.css pensado para "texto sobre una celda de heatmap", así que no hay a qué `var()` migrarlo
sin inventar un token para un solo caso.

### `css/components.css` (cerrado 2026-08-13)

El grep del 2026-08-12 había encontrado dos clases de hex fuera de `tokens.css`, y asumía que los
fallbacks `var(--token, #hex)` eran "posiblemente muertos igual que los de `helpPopover.js`". Con
Chromium real disponible, se pudo medir en vez de asumir — y **el supuesto estaba mal para el caso más
importante**:

- **`--color-banner-text`, los 4 `--color-toast-*` y `--color-warning-bg-hover` NO estaban muertos —
  eran los únicos vivos.** Sólo tenían valor dentro de `@media (prefers-color-scheme: dark)`,
  `[data-theme="dark"]` y `[data-theme="light"]` — nunca en un `:root` base, a diferencia de TODO lo
  demás en `tokens.css` (que siempre define el claro en `:root` y recién después overridea el
  oscuro). En el estado por default del navegador (sin `data-theme`, sistema en modo claro) ninguna
  de las tres reglas aplicaba: la variable quedaba indefinida, confirmado con
  `getComputedStyle(:root).getPropertyValue(...)` devolviendo `''`. No se rompía nada visible porque
  el fallback inline tapaba el hueco — pero sacarlo a ciegas (como sí correspondía para
  `helpPopover.js`, donde el token SÍ estaba siempre definido) habría roto el banner de privacidad y
  los 4 toasts en ese estado. Fix real: un `:root` con el default, igual que hace `tokens.css` para
  todo lo demás — no un fallback por cada `var()` que usa el token. Los 6 fallbacks, ahora sí muertos,
  se sacaron.
- **`#009ABF`/`#B71C1C` en `.btn--primary:hover`/`.btn--danger:hover`/`.pill--active:hover`, y `#fff`
  en `.ctrl-filter.is-active`/`.ctrl-row--active`/`.threshold-checkbox-static__box`/`.exec-step__dot`**
  — verificados en navegador real (captura antes/después, claro y oscuro, hover incluido): legibles
  en los dos temas, sin defecto visual. Relocalizados a `--color-primary-hover`/`--color-danger-hover`
  (`tokens.css`) y `var(--color-white)` con el mismo valor exacto — cero cambio visual, sólo
  cumplimiento de "nada de hex en los módulos". No se les inventó un tono distinto por tema: eso es
  una decisión de diseño, no una migración mecánica, y no hay una razón confirmada para pedirla.

**Verificación:** `tests/e2e/tokenDefaults.spec.js` — confirmado que la primera assertion falla si se
saca el `:root` nuevo (se probó explícitamente: se revirtió el fix, corrió el test, falló, se
restauró). Capturas de pantalla en claro/oscuro para banner, toasts, botones (normal + hover), pill,
checkbox y exec-step — todas idénticas a como se veían antes del cambio.

---

## Fase 3 — Tablas y vistas de resultados

**Estado: cerrada** (2026-08-12). Es donde se cumple "los resultados se ven parecido, y elegís cómo
verlos".

- **`wireTableTools()` en `js/ui/tableTools.js`: hecho.** Encadena `initShowMorePagination` +
  `initSearchCombobox` + `enhanceGrid` — el tramo de abajo que estaba escrito a mano en los 13 sitios
  de 9 archivos (`acreditaciones.js` ×2, `acumuladoresGanancias.js`, `brutos.js` ×2, `catXEmpleados.js`
  ×1 vía `wireDiffTableTools` llamado 3 veces, `gsPers.js` ×2, `nr.js` ×2, `rendVsTabu.js`,
  `rendXEe.js`, `variaciones.js`). No absorbe `createResultsToolbar()` ni `renderExportMenu()` (cada
  control necesita sus propios `onExcel`/`onCsv`/`onCopy`) — sólo pagina+busca+sticky sobre la tabla ya
  en el DOM. `variaciones.js` es el único caso con `sticky: false`: sus tablas van una debajo de otra,
  no en un panel de scroll acotado como las demás, y ya no llamaba a `enhanceGrid` antes de este
  cambio — se preservó ese comportamiento en vez de agregarlo de yapa.
- **Migrar `catXEmpleados.js` y `rendVsAsiento.js`: hecho.** Los dos tenían un botón de Excel armado a
  mano, sin CSV ni "copiar tabla". Ahora usan `renderExportMenu()`: el CSV/copiar de `catXEmpleados`
  aplana las dos distribuciones (Puesto/CC) que ya trae el .xlsx — no las 3 listas de diferencias de
  arriba, que son de revisión en pantalla, no del entregable. El de `rendVsAsiento` espeja las 3
  columnas (Rend/CONTA/CTRL) por categoría de la tabla principal.
- **Preferencia de vista por control: hecho.** `js/ui/viewPreference.js` (localStorage, clave
  `viewPref:<controlId>`) recuerda qué solapa (Resumen/Detalle) dejó abierta el analista la última vez
  para ESE control, y la reabre por default la próxima corrida. Cableado en `renderResumenDetalle()`
  (`js/ui/resultBlocks.js`) vía un `controlId` opcional — los 11 controles que la usan lo declaran; no
  se tocó el toggle "sólo con diferencia/todos" (Willy confirmó el 2026-08-12 que queda como está, con
  sus 3 implementaciones, y que lo que cada control puede sumar es una agrupación propia que le sirva,
  no una unificación). `acreditaciones.js` combina esto con su manejo propio de `activeId` entre
  redraws (D-022): arranca desde la preferencia guardada, y sigue actualizando su `activeTabId` en
  memoria para los redraws dentro de la misma corrida. `acumuladoresGanancias.js` (3 solapas
  Resumen/Fichas/Planilla, `initTabs` directo, no `renderResumenDetalle`) tiene su propio cableado
  equivalente. Test: `tests/viewPreference.test.js`.

Verificado: `npm run test:unit` (510 asserts, incluidas las 7 nuevas de `viewPreference.test.js`) y los
e2e que ejercitan las tablas migradas (`gridHeaderContrast.spec.js`, `brutosGsPersEvaluados.spec.js`)
en verde contra Chromium real. Los e2e que fallan en este sandbox (`seedImport`, `agrupadoresControl`,
`adminExport`, etc.) lo hacen por la misma razón que ya estaba documentada más abajo — sin red al CDN
la app no llega a levantar Dexie — y se confirmó que fallan igual en la rama sin estos cambios.

---

## Fase 4 — Registro declarativo de archivos y controles

**Estado: planeada.** Es la más grande de las cinco, y donde se cumple "agregar un control no toca
12 lugares".

- Paso 0, chico y aislado, se puede mergear ya: reemplazar el `Promise.all` de 10 nombres por
  posición en `controlsWizard.js` por carga por clave — es un default silencioso de manual
  (desalinear el destructuring mete la config de un control en el state de otro sin ningún error).
- `js/ui/fileTypes.js` con un mapa único (`FILE_TYPES = { nr_file: { label, fields, parse,
  autoDetect, ... } }`) — hoy agregar un tipo de archivo toca ~12 puntos en `fileUpload.js` +
  `controlsWizard.js`, sin ningún guard entre ellos.
- Config declarada en el registry en vez de 6 bloques de código por control con config.

No depende de las Fases 1-3, pero es la de mayor esfuerzo — dejarla última no es por prioridad baja,
es por tamaño.

---

## Fase 5 — Cerrar el ciclo (el skill)

**Estado: cerrada** (2026-08-12). Con `consolidate.js` en pie, el skill dejó de decir "buscá con `grep`; si
no está, extraelo" y pasa a mostrar el `import` concreto, con las tres cosas que se rompen al escribirlo a
mano (`null` vs `0`, el string es-AR vs el número ya parseado, y qué datos salen de `lastRow` en vez de
sumarse). También apunta a `tabCodes.js` para la resolución por código, con la advertencia de que una semilla
se confirma contra un Tabulado real y no por analogía.

<details>
<summary>Estado anterior</summary>

**Estado: adelantada.** El objetivo de esta fase era que el skill `nuevo-control` dejara de mandar a
copiar código — eso **ya se hizo** en el rightsizing del contexto del 2026-08-11, antes incluso de
que exista `consolidate.js`: hoy dice "buscá con `grep` si hay un módulo compartido; si no, extraelo
en tu mismo PR" en vez de "copiá de `nr.js:129-150`".

Lo que falta es sólo la consecuencia mecánica: cuando la Fase 1 cree `js/controls/consolidate.js`,
la instrucción de "extraelo" deja de aplicar porque el módulo ya va a existir — no hace falta tocar
el texto del skill para eso, ya está escrito en modo condicional.

---

## Cómo retomar

**Actualizado el 2026-08-12 (cuarta pasada del día).** Las Fases 0, 1, 2, 3 y 5 están cerradas. Los
Pasos 4a, 5 y 4b del contrato de export también (`specs/contrato-export.md`) — el Paso 5 cerró el último
falso verde conocido: Brutos/GS Pers con la columna del archivo sin mapear pasaban por "0 diferencias =
todo bien" cuando en realidad no se había comparado un solo legajo. El Paso 4b sacó las últimas ~80
líneas de ExcelJS a mano por control (Brutos/GS Pers/NR Controlar + NR Reporte) a
`writeGroupedContractSheet()`. Lo que sigue, en orden de menor a mayor tamaño:

1. **Paso 6 del contrato de export** — el resto de los controles (`rendVsTabu`, `rendVsAsiento`,
   `rendXEe`, `catXEmpleados`, `variaciones`, `acumuladores`, `acreditaciones`) declara su contrato.
2. **Fase 4** — la más grande. `fileTypes.js` con un mapa único y la config declarada en el registry.
3. **v2.6/2.7** (seam de adaptadores + Axton piloto con Merz) recién después de la Fase 4: un adaptador nuevo
   sobre parsers todavía duplicados hereda la duplicación.

**Nota de entorno, para no repetir la pregunta:** desde esta sesión hay Chromium real disponible en el
sandbox (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, ver
`playwright.config.js`). Lo que antes quedaba "no se puede verificar a ciegas desde este entorno" ya no
aplica — se puede montar cualquier módulo en un fixture de `tests/e2e/fixtures/` y verificarlo en los dos
temas antes de tocar CSS compartido. Sigue faltando red al CDN (Dexie/XLSX/ExcelJS no cargan en este
sandbox), así que la app completa con IndexedDB real no arranca acá — los e2e que la necesitan siguen
corriendo sólo en CI.

<details>
<summary>Cómo se retomaba antes de cerrar las Fases 0/1/5</summary>

1. Si no se resolvieron las decisiones de Fase 1 (toNum + clave de legajo), no arrancar ahí — pedirle
   a Guillermo que elija entre las opciones de arriba. Es lo primero que hay que preguntarle: la Fase
   0 ya no tiene nada accionable, así que las dos decisiones de Fase 1 son lo único que traba el
   plan entero.
2. Si esas dos decisiones no están, la **Fase 2** es la que se puede arrancar sin pedir nada: no
   depende de la Fase 1 y arrastra el único bug de Fase 0 que quedó en el inventario (el badge en
   dark mode). El Paso 0 de la Fase 4 (matar el `Promise.all` posicional de `controlsWizard.js`)
   también es chico, aislado y no depende de nadie — y ya tiene 11 entradas, una más que cuando se
   escribió esto.
3. Todo lo que se cierre, actualizar `specs/auditoria-escalabilidad-2026-08.md` (bugs) o este archivo
   (fases) — son los dos documentos que existen para no perder este estado entre sesiones.

</details>
