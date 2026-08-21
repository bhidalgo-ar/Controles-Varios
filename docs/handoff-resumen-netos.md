# Handoff: Control de Netos — solapa Resumen (veredicto + dónde están los errores)

## Overview

La solapa **Resumen** de un run (app *Controles Nómina*, repo `bhidalgo-ar/Controles-Varios`) hoy es el hero de `buildHeroHtml()`: un círculo con `!`, el título "116 legajos con diferencias", una bajada y cuatro KPIs. Los cuatro repiten el mismo dato (116 · 30,5 % · $ 6.510.426,83) y lo único que habla de gravedad —"verde 0% · amarillo ≤2% · rojo >2%"— está como nota al pie en 11 px. El analista sale de esa pantalla sin saber **cuán grave es** ni **dónde mirar primero**, y termina yendo al Detalle a leer 116 filas.

Este handoff reemplaza el contenido de la solapa Resumen por un tablero que contesta tres preguntas en ese orden:

1. **¿Se puede liberar la liquidación?** — un veredicto en palabras, con la escala de severidad dibujada contra el umbral real del semáforo.
2. **¿Cuánta plata es?** — el puente Neto teórico → explicado por el mes → sin explicar → neto liquidado, más el signo (pagamos de más / de menos).
3. **¿Qué reviso primero?** — tres cortes (magnitud, empresa, rubro causante), la evolución mes a mes del control, y los 5 legajos que concentran la plata.

Y se parte en dos layouts según **cuántos controles trajo el run**, que era el pedido explícito:

- **Run de un control** (`3a`): el veredicto va en grande y el tablero completo es de ese control.
- **Run de varios controles** (`3b`, mockeado con 9): el veredicto se comprime a una banda con la tira de semáforos, aparece una **grilla de una tarjeta por control** ordenada por severidad, y abajo dos cortes que sólo existen cruzando controles: concentración por empresa y **legajos que aparecen en varios controles** (la señal de "es un dato de legajo mal cargado, no cinco errores distintos").

La solapa **Detalle** no se toca en este handoff (va en `design_handoff_control_netos_detalle/`).

## About the Design Files

Los archivos de este bundle son **referencias de diseño hechas en HTML**: prototipos que muestran el aspecto y el comportamiento buscado, **no código para copiar y pegar**. La tarea es **reimplementar estos diseños dentro del entorno que ya tiene el repo** — módulos ES sin framework ni build step, CSS propio en `css/` con custom properties, y los módulos de UI compartidos de `js/ui/` — respetando sus patrones actuales.

Concretamente, **no** escribir CSS inline como en el prototipo (el prototipo usa estilos inline por una restricción de la herramienta de diseño): las reglas nuevas van a `css/results.css` usando los tokens de `css/tokens.css`, y el markup se genera desde `js/ui/controlsResults.js` como ya se hace hoy.

Piezas del repo que hay que **reusar, no reescribir**:

| Pieza | Archivo | Para qué |
|---|---|---|
| `buildHeroHtml()` | `js/ui/controlsResults.js` | **es la función que este rediseño reemplaza**: ya recibe `controlSummaries`, `runFiles`, `thresholdPct` y `legajoKeyMode`, y ya calcula `overallTier`, `totalLegajosCruzados`, `totalDiffAmount` y los grupos por unidad |
| `buildCtrlCardsHtml()` / `buildCtrlCardHtml()` | `js/ui/controlsResults.js` | la tarjeta por control de `3b` es esta función con más contenido (%, sparkline, "venía en"); mantener la cascada de entrada y el pulso de mejora (A1/A4) |
| `computeSemaforoStatus()` + `DEFAULT_SEMAFORO_THRESHOLD_PCT` | `js/controls/semaforo.js` | **el color y el corte de la escala salen de acá**, nunca de `summary.status` ni de un 2 % cableado: el umbral es `getConfig('semaforoThresholdPct')` y el analista lo puede cambiar |
| `groupSummariesByUnit()` / `unitsMax` | `js/ui/controlsResults.js` | el denominador del porcentaje. **No sumar `unitsTotal` entre controles** (dos controles sobre la misma nómina no son 760 legajos) — es el "semáforo miente en verde" de `CLAUDE.md` |
| `unitNames()` / `fmtUnitCount()` / `fmtParticipio()` | `js/ui/controlsResults.js` | nombrar la unidad. Un run por centro de costo **no** dice "legajos": todo el copy nuevo tiene que pasar por estos helpers |
| `summarizeWithTolerance()` | `js/controls/tolerance.js` | los cortes nuevos se calculan sobre los resultados **ya filtrados por tolerancia**, igual que el resto del resumen |
| `getPrevTierByControlId()` | `js/ui/controlsResults.js` | el patrón de "leer la corrida anterior" ya existe; la evolución mes a mes es el mismo patrón cambiando el filtro de período (ver *State Management*) |
| `formatAmount()` | `js/utils/currency.js` | todos los importes |
| `renderResultsTabs()` / `mountResultsHeader()` | `js/ui/resultsHeader.js` | las solapas y la barra superior no cambian |

## Fidelity

**Hi-fi.** Colores, tipografía, espaciados, tamaños y copy son los definitivos y salen del design system de H&A (herramientas web internas) y de las clases que ya usa la app. Si un valor del prototipo no tiene token equivalente en `css/tokens.css`, agregarlo ahí antes de hardcodearlo.

Los **datos** de los mockups son **ficticios** y están rotulados como tales en el propio canvas: nombres de la lista de jugadores de Banfield de `CLAUDE.md` §Privacidad, legajos y montos inventados, y las empresas del holding como `TAL` / `BNF` / `LDZ`. Los totales sí cierran entre sí (el puente da exacto contra la fila TOTAL del Detalle) para que se pueda revisar la aritmética.

---

## Screens / Views

### Contexto común (ya existe, no cambia)

- **Barra superior** (`js/ui/appHeader.js` + `mountResultsHeader()`): alto 54 px, fondo `#15263D`, borde inferior 3 px `#00ACD4`. En `3b` la línea de veredicto de la barra pasa a "3 de 9 controles en rojo" — es `buildContextLine()`, ya lo hace.
- **Solapas Resumen / Detalle** (`renderResultsTabs()`): alto 46 px, fondo `#fff`, borde inferior 1 px `#E7E6E6`; activa con borde inferior 2 px `#00ACD4` y texto `#007896` 13/700. El Resumen mantiene el tope de 1280 px de `page-content` (D-060) — **el tablero está diseñado a 1352 px de contenido; si se respeta el tope de 1280, las tres columnas del bloque "dónde" bajan a 1fr cada una sin cambiar nada más**.
- **Aviso de columnas** (`buildColumnWarningsHtml()`): queda donde está, **arriba del veredicto**. Es un aviso sobre la validez del run entero.

---

### 3a · Run de un solo control

Contenedor: `display:flex; flex-direction:column; gap:14px`, padding `20px 24px 28px`.

#### 1. Banda de veredicto (reemplaza `.results-hero`)

Card `background:#15263D`, radio 14 px, padding `24px 28px`, `display:flex; align-items:center; gap:36px`.

**Izquierda (`flex:1`):**
- Eyebrow: `700 10,5px` uppercase, `letter-spacing:.12em`, color `#FB8254` en rojo / `#F59E0B` en amarillo / `#7FE0F4` en verde → "VEREDICTO · 1 CONTROL EJECUTADO" (el conteo de controles va siempre, era el pedido).
- Título: `800 36px/1.05` `#fff`, `letter-spacing:-.8px`. **Es una acción, no un número**: rojo → "No liberar la liquidación"; amarillo → "Liberar con reparos"; verde → "Listo para liberar"; sin cruce → "Sin controles de verificación".
- Bajada: `400 14px/1.5` `#C7D5E4`, `max-width:560px`, con los números en `#fff` bold. Incluye la comparación contra el umbral: *"El corte de rojo es 2 % de los legajos: este run está 15 veces arriba."* — el múltiplo se calcula `pctDiff / thresholdPct`, se muestra sólo si es ≥ 2 y se redondea a entero.
- Acciones: pill primaria `#00ACD4` "Ver los 116 legajos →" (va al Detalle con el control abierto: es el mismo handler que `[data-hero-detail]`) + pill ghost borde `rgba(255,255,255,.25)` "Marcar como revisado" (el toggle Borrador/Definitivo que ya existe en `mountHeader`).

**Derecha (`flex:0 0 480px`) — la escala de severidad:**
- Label `600 11px` uppercase `#8FA3BA`: "Legajos con diferencia sobre el total evaluado" (nombre de unidad por `unitNames()`).
- Barra de 14 px, radio 7 px, tres zonas: verde `#22C55E` (0 al primer punto), amarillo `#F59E0B` (hasta `thresholdPct`), rojo `linear-gradient(90deg,rgba(232,85,24,.45),#E85518)` (el resto). **El eje va de 0 a `max(pctDiff, thresholdPct*2)` redondeado hacia arriba**; en el mock el eje es 0–35 % con el umbral en 2 %, así que verde y amarillo miden 5,7 % del ancho cada uno.
- Marcador: barrita blanca 3×26 px con halo `0 0 0 3px rgba(21,38,61,.9)` en la posición del porcentaje, y abajo el valor en `800 15px` `#fff` tabular.
- Leyenda de tres puntos (`0 % verde` / `2 % amarillo` / `rojo →`) en `600 11px`, cada una con su color. **Sale del threshold real**, no del texto.
- Separador `1px solid rgba(255,255,255,.14)` y los 4 KPIs chicos en fila: valor `700 20px` (el de diferencias en `#FB8254`), label `600 10px` uppercase `#8FA3BA`. Son los de hoy más **Sin comparar** y **Tolerancia**, que hoy no están y son la primera pregunta del analista. Regla de `CLAUDE.md`: un KPI sin dato **no se muestra**, no sale en 0.

#### 2. "De dónde sale la diferencia" (62 %) + "Para qué lado" (38 %)

Dos cards `#fff`, borde `1px solid #E7E6E6`, radio 14 px, padding `20px 22px`. Título de sección: `700 11px` uppercase `letter-spacing:.09em` `#4A6080`.

**El puente**, cuatro bloques separados por `1px solid #E7E6E6`, cada uno con label `600 11,5px`, importe `700 19px` tabular y una nota `400 10,5px` `#8FA3BA` con la fórmula:

| Bloque | Label | Nota | Color |
|---|---|---|---|
| 1 | Neto teórico | remun + no rem − ret | `#15263D` |
| 2 | + Explicado por el mes | licencias, altas, ajustes del mes | `#007896` |
| 3 | + Sin explicar | bruto, sumando los dos signos | `#C0420F`, fondo `rgba(232,85,24,.06)`, radio 8 px |
| 4 | Neto liquidado | lo que se pagó | `#15263D` |

Debajo, **la barra de proporción**: 20 px de alto, radio 6 px, borde `1px solid #E7E6E6`, tres tramos — `#ECEEF0` el teórico, `#00ACD4` lo explicado, `#E85518` lo sin explicar — con la nota "Lo sin explicar es el **2,09 %** del neto teórico del mes". Es lo que pone la cifra en escala: 8,4 M sobre 402 M.

**Para qué lado**: dos filas (de más / de menos), cada una con label + importe a la derecha (`white-space:nowrap`), barra de 12 px sobre pista `#F7F3F0` **escalada al mayor de los dos**, y una nota que dice qué implica cada lado ("plata que hay que recuperar" / "reclamo del empleado si no se corrige"). Pie con **Neto** y **Bruto** — la distinción importa: el neto es lo que el analista informa, el bruto es el trabajo que tiene por delante.

#### 3. Los tres cortes (3 columnas iguales)

Misma card, mismo título de sección. Cada fila: label + valor a la derecha en `600 12px` (`nowrap`), y abajo una barra de 10 px sobre pista `#F1F3F5`, **escalada por plata, no por cantidad de legajos**. Cada card cierra con una conclusión en caja `#F7F9FB`, radio 8 px, `400 11,5px/1.5` — **esa frase es la mitad del valor del tablero**, no es decoración.

| Card | Filas | Conclusión del mock |
|---|---|---|
| **Qué tan grande es cada una** | ≥ 500.000 · 100.000–500.000 · 10.000–100.000 · 100–10.000 (el último corte es la tolerancia del control, no un número fijo) | "19 legajos (16 % de los casos) concentran el 82 % de la plata. Empezá por esos." |
| **En qué empresa** | una por empresa/UN: sigla `700 12,5px`, **% de legajos con diferencia** a la derecha (rojo o ámbar según el umbral), y abajo del bar "71 de 214 legajos · 5.104.880,20" | "Las tres arriba del rojo: no es una empresa sola, es el cálculo." |
| **Qué rubro la causa** | una por rubro con su base entre paréntesis + **"Sin identificar"** con barra rayada `repeating-linear-gradient(45deg,#C7D5E4 0 5px,#EEF3F8 5px 10px)` | "El motor le pone rubro a 88 de 116. Los 28 restantes se abren a mano en Fichas." |

La banda rayada de "Sin identificar" **no es opcional**: el motor identifica el rubro sólo en parte de los casos y el tablero tiene que decirlo. Un corte que se muestre como si fuera completo es peor que no mostrarlo (misma lógica que "un default silencioso es un bug").

#### 4. Evolución (420 px) + Por dónde empezar (resto)

**Cómo venía este control**: 6 barras verticales (un período por barra), alto máximo 92 px, escaladas al mayor valor; color por tier de cada mes (`#22C55E` / `#F59E0B` / `#E85518` / `#C0420F` el actual). Línea horizontal punteada `rgba(245,158,11,.7)` en el umbral, rotulada "2 %". Valores arriba de cada barra en `600 10px` tabular (el actual en `800 12px` `#C0420F`), meses abajo separados por `1px solid #EFEEEC`. Cierra con la lectura en caja `rgba(232,85,24,.06)`: *"Venía en 4,2 % y saltó a 30,5 %. Antigüedad y presentismo explican 67 casos: parece un parámetro que no se aplicó, no casos sueltos."* — **este bloque es el que cambia el diagnóstico** de "116 errores" a "un cambio paramétrico". Si no hay historia, la card no se renderiza (no una card vacía).

**Por dónde empezar**: tabla de 5 filas sin encabezado — legajo (`#8C837B` tabular, 60 px) · nombre `600` `#15263D` + tag de empresa · rubro causante (`sin identificar` en itálica `#8C837B`) · importe `700` `#C0420F` (o `#9A5A0B` si es negativo) · "ficha →" `600 11,5px` `#007896`. Filas separadas por `1px solid #EFEEEC`. En el header de la card, a la derecha, "Ver los 116 →". El orden es por **valor absoluto** del residuo, con el signo visible.

---

### 3b · Run de varios controles (mockeado con 9)

#### 1. Banda de veredicto comprimida

Misma card navy, padding `20px 24px`, en tres zonas:
- **Izquierda:** eyebrow "VEREDICTO · 9 CONTROLES EJECUTADOS", título `800 30px` ("No liberar"), y una bajada que separa lo que bloquea de lo que no: *"3 controles en rojo bloquean el cierre. Los 2 amarillos se pueden liberar con nota."*
- **Centro:** la **tira de semáforos** — un bloque por control, `flex:1`, alto 34 px, radio 6 px, en el orden de severidad que ya usa `TIER_RANK` (`#C0420F` el peor, `#E85518` rojo, `#F59E0B` amarillo, `#22C55E` verde), con la leyenda "3 en rojo · 2 en amarillo · 4 en verde" abajo en `600 11px`. A 10+ controles la tira sigue funcionando; el que no entra es el texto, no la tira.
- **Derecha:** tres KPIs de run separados por `1px solid rgba(255,255,255,.14)`: legajos, **tocados por algún rojo** (la unión de legajos con diferencia de los controles en rojo — el número que dice cuánta nómina está en juego) y Δ acumulada.

#### 2. Grilla de controles — `grid-template-columns:repeat(3,1fr); gap:12px`

Una card por control: `#fff`, borde `1px solid #E7E6E6`, **`border-left:4px solid` del color del tier**, radio 12 px, padding `16px 18px`.
- Fila 1: punto de estado 10 px + nombre `700 14px` `#15263D` + **% a la derecha** en `800 16px` (rojo `#C0420F` / ámbar `#9A5A0B`).
- Fila 2: `400 12px` `#4A6080` — "116 de 380 sin explicar · 6.510.426,83", con el texto de la unidad y del criterio de cada control (sale de `summary.headline` / `contextNote`).
- Fila 3: **sparkline de 6 períodos**, 26 px de alto, barras `flex:1` `gap:4px`, históricas en `#C7D5E4` y la actual en el color del tier.
- Fila 4: "venía en 4,2 %" / "estable" a la izquierda (`400 11px` `#8C837B`), y el link "Ver los 116 →" a la derecha (`600 11,5px` `#007896`, `nowrap`) — es el `[data-hero-detail]` de hoy.

Los **verdes no ocupan una card cada uno**: van agrupados en una card `#F7F9FB` "4 controles en verde" con una línea por control (punto verde 8 px + nombre + "0 de 380" a la derecha) y el cierre "Ninguna diferencia arriba de la tolerancia. No hay nada que revisar acá.". Con 9 controles eso son 6 cards en vez de 9, y el ojo va sólo a lo que falla.

#### 3. Dos cortes que sólo existen cruzando controles

- **Cruzando los 9 controles · dónde se concentra**: barras por empresa, con el % de legajos **tocados por algún control en rojo** y el conteo abajo. Cierra con la hipótesis: *"Los tres rojos comparten legajos: antigüedad mal calculada arrastra el neto. Corregir antigüedad debería bajar también Netos y Presentismo."*
- **Legajos que aparecen en varios controles**: legajo · nombre · badge "N de 9" (pill rojo si N ≥ 3, ámbar si N = 2) · importe. Cierra con *"Un legajo en 4 controles suele ser un dato de legajo mal cargado, no cinco errores distintos."* Ordenado por N y después por importe.

---

## Interactions & Behavior

- **"Ver los N →"** (en el veredicto, en cada card de control y en cada corte): es el handler de `[data-hero-detail]` que ya existe — `tabsCtl.setActive('detalle')` + `openCtrlToggle(card)`. Si el corte tiene filtro (una empresa, un bucket, un rubro), además **pre-filtra el Detalle** por ese valor: el chip correspondiente arranca activo y se muestra el hint "Este filtro arrancó activo porque venías del Resumen", con la misma mecánica del hint que ya tiene `createResultsToolbar()`.
- **"ficha →"** de la tabla de top legajos: va al Detalle, solapa Fichas, con esa ficha abierta y filtrada por ese legajo (el buscador de `initSearchCombobox()` acepta el legajo como valor).
- **"Marcar como revisado"**: es `onToggleDefinitive` — ya existe, con su toast. El label del botón cambia a "Volver a borrador" cuando el run es definitivo.
- **Animación**: la cascada de entrada de las cards (`cardIn 0.45s cubic-bezier(.4,0,.2,1)`, stagger capado a 6) y el pulso de mejora (`status-dot--pulse-ok`) siguen aplicando a la grilla de `3b`. Las barras de los cortes pueden crecer desde 0 con la misma curva; **respetar `prefers-reduced-motion`** como hoy.
- **Sin datos**: cada bloque se omite si no tiene con qué llenarse — sin historia no hay evolución, sin empresa cargada no hay corte por empresa, sin rubro identificado el corte muestra sólo "Sin identificar". Nunca un 0 ni un placeholder: `null` no es `0`.
- **Un solo control con cero diferencias**: el veredicto pasa a verde ("Listo para liberar"), la escala muestra el marcador en 0, el puente sigue (es informativo) y los tres cortes no se renderizan.
- **Responsive**: herramienta de escritorio. Abajo de ~1200 px el bloque de tres cortes pasa a 2 columnas y la grilla de `3b` a 2; el veredicto apila escala abajo del título.

## State Management

Sin framework: el estado vive en el DOM y en los módulos, como hoy. La solapa se sigue recordando con `viewPreference`.

**Lo que ya existe** y alimenta el tablero: `controlSummaries[]` (con `tier`, `summary.unit`, `unitsTotal`, `unitsWithDiff`, `diffTotalAmount`, `headline`, `insights`, `contextNote`, `worstCase`), `thresholdPct`, `runFiles`, `prevTierByControlId`.

**Lo que hay que agregar** — todo se calcula sobre los resultados ya filtrados por tolerancia, en el `summarize` de cada control (o en un helper compartido, que es lo razonable: sirve para los 11):

| Campo | Qué es | Nota |
|---|---|---|
| `diffSigned: { over, under }` | suma y conteo por signo (`{amount, units}` cada uno) | `diffTotalAmount` de hoy es el bruto; el neto es `over.amount − under.amount` |
| `diffBuckets: [{min, max, units, amount}]` | magnitud del residuo; el corte más chico arranca en la tolerancia del control | los umbrales son de presentación, pero el bucketing es del control |
| `byGroup: { empresa: [{key, units, unitsTotal, amount}] }` | corte por empresa/UN. Mismo shape para cualquier atributo agrupable (queda abierto para convenio y sector, que hoy no vienen) | el % de cada grupo se mide contra **su propio** `unitsTotal`, no contra el del run |
| `byCause: [{rubro, code, units, amount}]` + `unidentifiedCause: {units, amount}` | rubro causante. **Parcial por diseño** | el que no se puede atribuir va a `unidentifiedCause`, nunca repartido ni escondido |
| `topUnits: [{legajo, nombre, empresa, rubro, amount}]` | los 5 de mayor \|residuo\| | `esc()` sobre nombre y empresa: vienen de un Excel de un tercero |
| `history: [{period, pctDiff, tier}]` | hasta 6 períodos anteriores del **mismo control y cliente** | ver abajo |
| `crossControl: { touchedByRed, byGroup, repeatedUnits }` | sólo en runs de varios controles | `touchedByRed` es una **unión** de claves de legajo, no una suma de conteos |

**La historia mes a mes** es una consulta nueva pero con un patrón que ya está escrito: `getPrevTierByControlId()` levanta las corridas hermanas con `getControlRuns(clientCode)` y filtra por `period === run.period`. Para la evolución se filtra por **períodos anteriores**, se toma la corrida **definitiva** de cada período (o la última si ninguna está marcada), y se recalcula el tier con `summarizeWithTolerance` + `computeSemaforoStatus` — igual que ahí. Dos cuidados: se compara `pctDiff`, no cantidades (la dotación cambia mes a mes), y si un período no tiene corrida de ese control **se omite la barra**, no se dibuja un cero.

**Nada de esto es un fetch nuevo**: todo sale de IndexedDB en el navegador del analista, como el resto de la app.

## Design Tokens

**Marca / estructura**
| Token | Valor |
|---|---|
| Celeste H&A | `#00ACD4` (hover `#0090B4`) |
| Celeste texto sobre claro | `#007896` |
| Celeste sobre navy | `#7FE0F4` |
| Navy veredicto / header | `#15263D` |
| Navy texto | `#1E3A5F` · secundario `#4A6080` · terciario `#8FA3BA` |
| Gris cálido | `#8C837B` · claro `#B0A8A2` |
| Sobre navy | texto `#C7D5E4`, divisor `rgba(255,255,255,.14)`, pista `rgba(255,255,255,.10)`, borde ghost `rgba(255,255,255,.25)` |
| Borde | `#E7E6E6` · sutil `#EFEEEC` · digital `#DDE5EF` |
| Fondos | `#fff` · página `#F5F7F8` · caja de conclusión `#F7F9FB` · pista de barra `#F1F3F5` · pista cálida `#F7F3F0` · tramo neutro `#ECEEF0` |

**Estados** (los mismos del Detalle, sin tintes nuevos)
| Estado | Base | Texto | Fondo / borde de pill |
|---|---|---|---|
| Rojo grave | `#C0420F` | `#C0420F` | `rgba(232,85,24,.10)` / `rgba(232,85,24,.30)` |
| Rojo | `#E85518` (sobre navy `#FB8254`) | `#5D2F00` en texto largo | `rgba(232,85,24,.06)` la caja de lectura |
| Amarillo | `#F59E0B` | `#9A5A0B` | `rgba(245,158,11,.12)` / `rgba(245,158,11,.34)` |
| Verde | `#22C55E` | `#177A50` | `rgba(34,197,94,.10)` / `rgba(34,197,94,.30)` |
| Sin identificar | rayado `repeating-linear-gradient(45deg,#C7D5E4 0 5px,#EEF3F8 5px 10px)` | `#8C837B` | — |

**Tipografía** — `'Plus Jakarta Sans', system-ui, sans-serif` (la de las herramientas internas; **no** Source Sans Pro, que es la de marca/slides). Todos los números con `font-variant-numeric: tabular-nums`.

| Uso | Valor |
|---|---|
| Veredicto `3a` | 36 / 800, `letter-spacing:-.8px` |
| Veredicto `3b` | 30 / 800, `letter-spacing:-.6px` |
| Eyebrow del veredicto | 10,5 / 700 uppercase, `letter-spacing:.12em` |
| Bajada del veredicto | 14 / 400, `line-height 1.5` |
| Importe del puente | 19 / 700 |
| % de la escala | 15 / 800 |
| % de una card de control | 16 / 800 |
| Nombre del control | 14 / 700 |
| KPI del veredicto | 20–22 / 700, label 10 / 600 uppercase |
| Título de sección | 11 / 700 uppercase, `letter-spacing:.09em` |
| Fila de corte | 12 / 600 |
| Cuerpo de tabla | 12,5 / 400 |
| Conclusión / nota | 11,5 / 400, `line-height 1.5` |
| Meses y valores del gráfico | 10 / 600 (el actual 12 / 800) |

**Radios** — 6 px (tramo de barra, bloque de semáforo) · 8 px (caja de conclusión, pill del puente) · 12 px (card de control) · 14 px (card grande) · 9999 px (botones, badges) · 5–7 px (barras).
**Alturas de barra** — 10 px (cortes) · 12 px (signo) · 14 px (escala) · 20 px (proporción del puente) · 26 px (sparkline) · 34 px (bloque de semáforo) · 92 px (evolución).
**Espaciado** — 4 / 5 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 24 / 28 / 36 px (escala `--sp-*` de `css/tokens.css`).

**Una nota sobre las barras:** todas son `div`s con `width: N%` — no hay SVG, ni canvas, ni librería de gráficos, y no hace falta ninguna. Es la misma decisión que el resto del repo (sin dependencias de runtime nuevas).

## Assets

Ninguno nuevo. El isotipo H&A ya está en la app. Íconos: sólo glifos de texto que la app ya usa (`→ ← ▾ ▲ ⬇ ⌕ ⚠ ·`). **El círculo con `!` del hero actual desaparece**: el veredicto en palabras dice lo mismo mejor.

## Files

Capturas (carpeta `screenshots/`, 2x):

| Archivo | Qué muestra |
|---|---|
| `3a-resumen-un-control.png` | el Resumen completo de un run de un solo control |
| `3b-varios-controles.png` | el mismo Resumen con 9 controles: veredicto comprimido, grilla y cortes cruzados |

En la raíz de este bundle:

- **`Control Netos - Detalle.dc.html`** — el canvas de diseño. Se abre en el navegador; cada opción tiene su badge:
  - `3a` / `3b` — **este handoff** (turno 3, arriba del canvas).
  - `2a` — solapa "Totales por rubro" (handoff anterior).
  - `1a` / `1b` / `1c` — la solapa Detalle: como está hoy, la vista Fichas, y la planilla arreglada (handoff anterior).
- `support.js` — runtime del prototipo (no es del producto).
- `github.md` — mapeo pantalla ↔ archivos del repo y registro de la última sync.

Los `<link>` a `_ds/...` del prototipo apuntan al design system de H&A dentro del proyecto de diseño; abrir el HTML desde la raíz del proyecto para que resuelvan.

Archivos del repo a tocar: **`js/ui/controlsResults.js`** (`buildHeroHtml` → veredicto + puente + cortes; `buildCtrlCardHtml` → card con % y sparkline), **`css/results.css`** (todo el tablero), `css/tokens.css` (tokens que falten), **el `summarize` de cada control** o un helper compartido nuevo en `js/controls/` (los campos de la tabla de State Management), `js/controls/semaforo.js` (sin cambios: se consume), y `js/db.js` sólo si la consulta de historia por período conviene como función propia.

## Riesgos y decisiones abiertas

1. **El rubro causante es parcial.** El mock lo asume y lo muestra ("88 de 116"). Si en algún control el motor no puede atribuir **ningún** rubro, la card se reduce a una sola fila "Sin identificar" y conviene no renderizarla: mejor tres cortes que dos y uno vacío.
2. **La historia depende de que existan corridas anteriores guardadas.** Un cliente nuevo no la tiene y el bloque no se dibuja. Vale la pena confirmar con Willy si la comparación es contra la corrida **definitiva** de cada período (lo que asume este handoff) o contra la última.
3. **`touchedByRed` necesita las claves de legajo, no los conteos.** Si algún `summarize` no expone las claves de las unidades con diferencia, ese KPI no se puede calcular y sale del veredicto de `3b` — no se aproxima sumando.
4. **El tope de 1280 px del Resumen (D-060)** aprieta las tres columnas del bloque "dónde". El diseño aguanta, pero si Willy prefiere el ancho completo también en Resumen, es un `classList` y hay que decidirlo antes de maquetar.
