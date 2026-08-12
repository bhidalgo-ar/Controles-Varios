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

**Estado: cerrada** (2026-08-12). Los 5 ítems que quedaban accionables se arreglaron; los 2 que
siguen abiertos lo están por decisión de Guillermo, no por falta de tiempo:

- **#3 — badge "⚠ sin asignar" ilegible en dark mode.** Va a la Fase 2, que rehace esa capa entera
  (los 2 hex cableados son un caso del "sin hex fuera de `tokens.css`" de esa fase).
- **#6 — fallback de columna para NR y GS Pers (D-039).** Necesita un Tabulado real contra el cual
  confirmar los códigos. Hasta entonces los dos controles piden la columna explícitamente, que es el
  comportamiento correcto: un dato que no se puede resolver se informa, no se completa con 0,00.

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
| 6 | Fallback de columna sólo lo tiene Brutos (`'1003'`/`'1017'` cableados) | — | **decisión de Guillermo**: ¿NR/GS Pers necesitan fallback propio y con qué códigos? Se confirman contra un Tabulado real, no por simetría (D-039) |

### Decisiones pendientes, no técnicas (fuera del inventario de bugs pero abiertas desde antes)

- **D-010** — el seed con datos reales de clientes sigue en la raíz de un repo público. Opciones:
  repo privado / sacar el seed y distribuirlo por SharePoint / anonimizarlo.
- **D-013** — la contraseña del modo admin la generó un agente; el repo es público, así que el hash
  es visible. ¿Rotarla?

---

## Fase 1 — Fundamentos de cálculo

**Estado: planeada, no arrancada.** Es la que **destraba** a las Fases 2-4: extraer un módulo
compartido de consolidación antes de que exista un `toNum()` único rompería a Variaciones (ver
motivo abajo), así que el orden es obligatorio, no preferencia.

**Bloqueada por dos decisiones de Guillermo:**

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

---

## Fase 2 — Capa visual unificada

**Estado: en curso** (2026-08-12) — no depende de la Fase 1, así que se arrancó sin esperar las
decisiones de Guillermo.

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

Falta, de lo que sí es Fase 2 real — grep final del 2026-08-12 sobre `css/*.css` y todo `js/`:
- **`js/controls/variaciones.js:995`** (heatmap "Cómo se movieron los escalones"): `const fg = t > 0.62
  ? '#fff' : 'inherit';`. Se revisó y se deja: no es un color de UI, es una decisión de contraste
  contra un fondo calculado con `color-mix()` que se satura progresivamente — no hay token de
  tokens.css pensado para "texto sobre una celda de heatmap", así que no hay a qué `var()` migrarlo
  sin inventar un token para un solo caso.
- **`css/components.css` queda sin auditar** — tiene hex fuera de `tokens.css`: fallbacks
  `var(--token, #hex)` en `.banner`/`.toast--*`/`.badge--warning-hover` (líneas 12, 383, 685-688,
  posiblemente muertos igual que los de `helpPopover.js`, a confirmar) y valores literales en clases
  (`#009ABF`/`#B71C1C` en algunos `.btn--*`, `#fff` en `.ctrl-filter`/`.ctrl-row--active`/badges). A
  diferencia de lo ya cerrado, tocar esto es CSS que renderiza en toda la app, no un `style=""`
  puntual en un módulo — más blast radius y ninguna forma de verificarlo visualmente desde este
  entorno. **No se tocó a propósito.** Cuando se retome, hacerlo con la app abierta en un navegador
  real (luz y oscuro), no a ciegas.
- No se pudo verificar visualmente en dark mode lo que sí se cerró hoy. Pedirle a Willy que abra el
  panel "Columnas del Tabulado" de Brutos en dark mode antes de dar el ítem por cerrado del todo.

---

## Fase 3 — Tablas y vistas de resultados

**Estado: planeada.** Es donde se cumple "los resultados se ven parecido, y elegís cómo verlos".

- `wireTableTools()` en `js/ui/tableTools.js` — la secuencia de toolbar + paginación + buscador +
  sticky + export está copiada 13 veces en 9 archivos.
- Migrar `catXEmpleados.js` y `rendVsAsiento.js` a `renderExportMenu`/`resultBlocks.js` — son los
  dos controles que quedaron con un botón de Excel armado a mano y por eso no tienen CSV ni "copiar
  tabla" como los otros 9.
- Preferencia de vista por control (qué solapa abre, qué filtro), guardada — recién tiene sentido
  después de unificar el toggle "sólo con diferencia / todos", que hoy tiene 3 implementaciones.

Depende parcialmente de la Fase 2 (el toolbar compartido).

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

**Estado: adelantada.** El objetivo de esta fase era que el skill `nuevo-control` dejara de mandar a
copiar código — eso **ya se hizo** en el rightsizing del contexto del 2026-08-11, antes incluso de
que exista `consolidate.js`: hoy dice "buscá con `grep` si hay un módulo compartido; si no, extraelo
en tu mismo PR" en vez de "copiá de `nr.js:129-150`".

Lo que falta es sólo la consecuencia mecánica: cuando la Fase 1 cree `js/controls/consolidate.js`,
la instrucción de "extraelo" deja de aplicar porque el módulo ya va a existir — no hace falta tocar
el texto del skill para eso, ya está escrito en modo condicional.

---

## Cómo retomar

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
