# Vista estándar de resultados — Fichas + Planilla, iguales en toda la app

**Estado:** decidido el 2026-08-20 con Willy. **Tanda 1 hecha (2026-08-20):** las piezas compartidas
del §7 y Acumuladores Ganancias migrado de punta a punta, como piloto (D-077). **Tanda 5 hecha
(2026-08-21, D-081):** la solapa Fichas de Cruce por Agrupadores y de Rendimiento vs Tabulado —los dos
controles cuya unidad no es el legajo con sus conceptos—, verificada con fixture, sin archivo de
cliente real. **Ojo:** la barra y la planilla de esos dos controles (tandas 2 y 3) todavía no
entraron a `main` — están en PRs abiertos sin mergear (#181 `feat/vista-estandar-barra-meta4` para
Rendimiento vs Tabulado y la rama `feat/vista-estandar-barra-axton` para Agrupadores), así que la
tercera solapa de los dos sigue llamándose "Detalle" y no "Planilla" hasta que entren. Tandas 2, 3,
4, 6, 7 y 8 siguen pendientes, en el orden del §9. Sale del handoff de diseño del Control de Netos
(Sportline) y se generaliza a los 21 controles. El mapa de abajo está aprobado; los prompts de cada
tanda de trabajo están en `docs/prompts-vista-estandar.md`.

> Este documento es la referencia: cuando un chat nuevo toque la pantalla de resultados de
> cualquier control, se lee esto primero. Si algo acá no coincide con lo que hace el código, gana
> este documento hasta que Willy diga lo contrario.

---

## 1. Por qué

Hoy cada control armó su pantalla de resultados por separado. El resultado, medido: de los 17
módulos con pantalla, 12 usan la barra compartida y 5 tienen barra propia; el botón de exportar
está en tres lugares distintos según el control; tres controles pintan las bandas del encabezado
con colores escritos a mano (hay un violeta que no es de la marca); y un solo control tiene fichas
desplegables, de primera generación, con los estilos adentro del módulo.

El pedido de Willy: **que las 21 pantallas se vean iguales**, que los botones estén siempre en el
mismo lugar, y que lo que construyamos de acá en adelante salga con esto por defecto. La razón no
es estética: un analista que reconoce la pantalla sin leerla trabaja tranquilo, y el que tiene que
volver a averiguar dónde está exportar en cada control desconfía del número que ve.

## 2. Las tres solapas

**`Resumen` · `Fichas` · `Planilla`**, en ese orden, con esos nombres, en todos los controles. Un
control sin fichas muestra dos (`Resumen · Planilla`) — nunca un tercer nombre para lo mismo.

- **Resumen** — lo que ya hay: tiles, casos, chequeos. Willy va a rehacerlo aparte; ese trabajo no
  depende de este documento.
- **Fichas** — una tarjeta desplegable por unidad (legajo, centro de costo, cuenta o lista, según lo
  que el control declare en `unit`). Es donde se entiende **por qué** un caso no cierra.
- **Planilla** — la tabla ancha, con los rubros agrupados en bandas, la base de cálculo abajo de
  cada título, las dos primeras columnas congeladas y fila de TOTAL por columna. Es donde se
  **compara entre casos** y se totaliza.

**Cuál abre.** Si el control terminó con diferencias, abre en **Fichas** (lo primero que se ve es
por qué falla). Si cerró, abre en **Planilla**. La preferencia del analista pisa el default, pero se
guarda **por control y por estado del control** (`viewPref:<controlId>:conDif` /
`:sinDif`) — si se guardara sólo por control, la primera vez que alguien cambia de solapa la regla
de arriba deja de aplicar para siempre.

> **Nota — un cambio contra el mockup.** El mockup llama a la tercera solapa "Totales por rubro".
> Queda **Planilla** por dos razones: es la palabra que el analista ya usa (y la que Acumuladores
> tiene hoy), y hay dos controles donde no hay importes que totalizar (EE x CATEG cruza campos de
> texto), donde "Totales por rubro" prometería algo que la solapa no da. Willy: si preferís el
> rótulo del mockup, es una palabra y se cambia.

## 3. La barra de herramientas — siempre la misma, siempre en el mismo lugar

Una sola barra, arriba de Fichas y de Planilla, pegada al scrollear. De izquierda a derecha:

| Posición | Qué | Regla |
|---|---|---|
| 1 | **Chips de estado** | los 5 de abajo, siempre, en ese orden |
| 2 | **Buscador** | `initSearchCombobox()`, pill, "Buscá por legajo o nombre…" |
| 3 | **Marcas ▾** | desplegable propio de cada control, opcional |
| — | *(espacio)* | |
| 4 | **Orden ▾** | sólo en Fichas |
| 5 | **KPI de la selección** | Σ del importe que el control mide |
| 6 | **`⬇ Exportar ▾`** | **último, siempre**. `renderExportMenu()`, con Excel / CSV / Copiar tabla |

El exportar de la corrida entera sigue en la barra superior de la app, y no se duplica acá.
Ningún control inventa otro botón de exportar ni le cambia el rótulo.

### Los 5 chips de estado

Los mismos cinco, con las mismas palabras, en el mismo orden, en los 21 controles:

| Chip | Qué agrupa | Color |
|---|---|---|
| **Todos** | la vista completa — es la salida de cualquier filtro | neutro |
| **Con diferencia** | arriba del monto de diferencia del cliente (`D-069`) | rojo |
| **Dentro del margen** | arriba de $ 0,01 y hasta ese monto | celeste |
| **Al centavo** | hasta $ 0,01 — el redondeo de Meta4 | verde |
| **Sin comparar** | falta un lado: no está en el otro archivo, la columna no está mapeada, el período no trae el dato | ámbar |

Se leen de peor a cerrado. **"Sin comparar" va último y en ámbar porque no es un grado de cierre,
es el resto**: nunca se lee como aprobado (`D-073`), y en ámbar no se confunde con el verde de lo
que cerró.

Reglas que hacen que la fila sea de verdad idéntica:

- **Arranca activo "Con diferencia"** si hay alguno; si no, "Todos". Cuando arranca filtrado, la
  barra dice por qué (ya lo hace `createResultsToolbar()`).
- **Un chip sin casos se muestra igual**, en gris y sin poder tocarse, con su 0. Sacarlo movería
  los demás de lugar, que es justo lo que estamos arreglando. El `title` dice si es que no hubo
  ninguno en esta corrida o si el estado no aplica a este control (el que cuadra al centavo por
  definición no tiene "Dentro del margen").
- **Los chips son la piel de un `<select>` real**, oculto pero en el DOM, que sigue siendo el único
  control que ve el teclado y el lector de pantalla. Esto ya es así y no cambia.
- **Qué se chipifica se declara, no se adivina.** Hoy `chipifySelect()` convierte a chips cualquier
  `<select>` de la izquierda con 2 a 4 opciones — o sea, por accidente. Pasa a chipificarse **sólo**
  el select de estado, marcado explícitamente; cualquier otro filtro queda desplegable por diseño.
  Así la fila de chips es siempre la misma y nada se cuela.

### Marcas — el segundo eje, y por qué no son chips

El mockup de Netos pone "Fuera de escala" y "Topearon aportes" como chips, al lado de los estados.
Son dos ejes distintos: el estado dice **cómo cerró**, la marca dice **qué más le pasa** al caso.
Mezclarlos hace que la fila de chips diga cosas distintas en cada pantalla, que es lo contrario de
lo que se pidió.

Entonces: las marcas van en un desplegable **`Marcas ▾`** inmediatamente a la derecha del buscador,
propio de cada control y opcional. En Netos: fuera de escala, topeó aportes, vacaciones en el mes,
sin mes anterior cargado. En NR: los 18 conceptos (que ya son un desplegable hoy, y ahí se quedan —
18 chips no son un filtro, son una pared). En Agrupadores: el agrupador.

## 4. La ficha

`<details>`/`<summary>` nativo: funciona sin JS, se navega con teclado, y el `Ctrl+F` del navegador
encuentra lo que está abierto. Se pueden abrir varias. El cuerpo se dibuja al primer despliegue, no
al pintar la lista.

**Cerrada** — cuatro zonas fijas:
1. **Avatar** redondo con el número de la unidad, en gradiente según severidad (rojo arriba del
   monto, ámbar a revisar / sin comparar, celeste dentro del margen).
2. **Línea de identidad**: nombre + tag de contexto (empresa, centro de costo, cuenta) + un badge
   con la causa principal.
3. **Línea de contexto** en gris, separada por `·` (categoría, antigüedad, obra social…).
4. **Línea de marcas**: pills chicas, informativas en celeste, neutras en gris.
5. **A la derecha**: rótulo chico en mayúsculas + el importe grande + el caret que gira al abrir.

**Abierta** — cuatro bloques, en este orden. **La tira y la conclusión son obligatorias; las dos
tablas y el detalle son opcionales según lo que el control tenga para mostrar:**

1. **Tira de conciliación** — la cascada en pastillas, de lo teórico a lo que sobra. La última
   pastilla antes del residuo va invertida (fondo oscuro), y el residuo en rojo.
2. **Dos tablas al lado** — a la izquierda *cómo debería ser*, a la derecha *cómo salió*. Cada fila
   con su código de concepto entre paréntesis, importes a la derecha. Cada tabla cierra en un pie
   de color: el teórico en oscuro, el residuo en rojo.
3. **Tabla de detalle** línea por línea, con el efecto de cada línea sobre el número que se
   controla. Filas positivas en verde suave, negativas en rojo suave. Pie con el total de lo
   explicado.
4. **Conclusión** — una caja de color con el monto que queda arriba de la tolerancia y **qué
   mirar**, descartando lo que ya quedó explicado. No un resumen: una instrucción.

Al pie de la lista, "Mostrar 50 más" y "N de M fichas".

**Dos cosas que ya costaron caro y no se repiten:** cada ficha lleva `flex: none` (sin eso, en una
lista flex las tarjetas se comprimen y el contenido se corta — es el bug que ya se arregló en
Acumuladores) y el hover no usa `transform` (movería la lista entera).

## 5. La planilla

Encabezado de dos filas, las dos pegadas arriba:

- **Fila 1, bandas** sobre fondo oscuro, con separador entre bandas. Las bandas dependen del
  control, pero la primera es siempre `Identificación` y viaja con las columnas congeladas.
- **Fila 2, rubros**, cada título con **su base de cálculo abajo** en chico y gris (`1003 + 1017`,
  `1 % por año`, `8,33 %`). Es lo que hace que la planilla se explique sola.
- Las columnas de cierre de banda van en negrita sobre un gris más marcado.

Cuerpo: importes a la derecha, con cifras de ancho fijo, sin cortar. **Ausencia de dato es `—`,
nunca `0,00`.** Diferencia arriba de tolerancia como badge rojo; dentro del margen, texto gris;
sin comparar, badge ámbar.

Pie: fila de **TOTAL pegada abajo, que totaliza todas las columnas de importe** —no sólo las de
cierre— y que sigue al filtro: "TOTAL — N legajos" pasa a "TOTAL de la selección — N legajos"
cuando hay filtro activo (ya lo hace `initSelectionTotals()`).

**El rótulo de la banda tiene que quedar visible al scrollear a la derecha.** Hoy se mete abajo de
las columnas congeladas y desaparece — y la banda *es* la idea de esta vista. Se arregla en la pieza
compartida, una vez, y lo heredan los tres controles que ya usan bandas.

## 6. El scroll horizontal

Hoy: 10 px, pista transparente, pulgar del mismo gris que el borde. No se ve que la tabla sigue
300 px a la derecha. Pasa a 14 px, con pista visible, pulgar con contraste y 80 px de largo mínimo.
Es un bloque de CSS y lo heredan las 21 pantallas el mismo día.

## 7. Qué ya está construido y qué falta

Esto es lo que hace que el trabajo sea abordable. **Ya está, compartido y andando:**

- La paleta y la tipografía del handoff **son las de la app**: los ~30 colores salen de
  `css/tokens.css` (`--celeste`, `--ink`, `--t1/t2/t3`, `--ok/warn/error` con su terna
  fondo/borde/texto, `--font-tool`), y el modo oscuro ya los redefine todos.
- El encabezado de dos filas con bandas pegadas y tinte por grupo: `enhanceGrid()` +
  `rb-grid--2lvl` + `paintColumnGroups()`.
- El ancho que reserva la fila de TOTAL para que no se derrame sobre la columna de al lado
  (`reserveTotalsWidth()`, D-060).
- La barra con chips, el buscador accesible, la paginación, el TOTAL de la selección y el
  `⬇ Exportar ▾`: `createResultsToolbar()`, `wireTableTools()`, `renderExportMenu()`.

**Construido en la tanda 1 (2026-08-20 — D-077), verificado de punta a punta con Acumuladores
Ganancias como piloto:**

| Pieza | Dónde | Por qué |
|---|---|---|
| Los 8 tintes de fondo que faltaban, con su par oscuro | `css/tokens.css` | los grises de cierre de banda y de tira |
| Scroll de 14 px | `css/components.css` | §6 |
| Chips: opt-in explícito + los 5 estados + chip deshabilitado | `js/ui/tableTools.js` | §3 |
| Rótulo de banda que sobrevive al scroll | `js/ui/resultBlocks.js` | §5 |
| Ficha estándar como pieza | `js/ui/fichaList.js` (nuevo) | §4 |
| Búsqueda, paginación y KPI sobre una **lista** | `js/ui/tableTools.js` | hoy sólo saben leer un `<tbody>` |
| Descriptor de columnas `{ key, label, sub, num, band }` + `renderRubroGrid()` | `js/ui/resultBlocks.js` | §5, para no repetir el HTML en 13 controles |
| Tercera solapa en `renderResumenDetalle()` + preferencia por estado | `js/ui/resultBlocks.js` | §2 |

Una cosa quedó sin verificar (D-077): el ancho de 14 px del scroll (§6). El Chromium headless de
este entorno fuerza su propia barra de 2 px e ignora `::-webkit-scrollbar`, así que hay que mirarlo
en una pantalla de verdad. De paso quedó a la vista por qué nunca se había visto: declarar
`scrollbar-width` o `scrollbar-color` en el mismo elemento apaga esos pseudo-elementos en Chromium.

**Y una deuda que se sigue pagando en las próximas tandas (2 y 3):** Brutos, GS Pers y Rendimiento vs
Asiento pintan las bandas con colores escritos a mano (`CYAN_HDR`, `LILAC_HDR`) en vez de usar el
tinte compartido. Pasan a la pieza y desaparece el violeta que no es de la marca.

## 8. El mapa — control por control

Aprobado por Willy el 2026-08-20.

| Control | Barra estándar | Planilla con bandas | Ficha | Nota |
|---|---|---|---|---|
| **Control de Netos** | sí | sí | **sí** | el del handoff; se hace en su propio chat |
| **Cruce por Agrupadores** | sí *(hoy tiene barra propia)* | sí | **sí — el que más gana** | hoy son ~1000 filas para ~100 empleados: una fila por legajo × agrupador. La ficha por legajo con sus agrupadores adentro resuelve exactamente eso |
| **Control NR** | sí | sí | **sí** | 18 conceptos; hoy la fila dice "# Difs" y nada más |
| **Novedades vs Liquidación** | sí | sí | **sí** | legajo × concepto en cuatro bandas — mismo caso que NR |
| **Acumuladores Ganancias** | sí *(hoy tiene barra propia)* | sí | **sí — reemplaza la ficha vieja** | es el que fija el estándar: ya tiene fichas de primera generación para jubilar |
| **EE x CATEG** | sí *(hoy tiene barra propia)* | **no** | **sí** | el detalle son campos de texto que no coinciden, no importes: no hay nada que totalizar. La tercera solapa útil acá es una **matriz campo × legajo** — en qué campo falla más — no totales |
| **Variación Conceptos** | sí *(hoy tiene barra propia)* | sí | **sí** | un legajo con varios conceptos que se movieron |
| **Rendimiento vs Tabulado** | sí | sí | **sí, por centro de costo** | la unidad es el CC, no el legajo |
| **Rendimiento vs Asiento** | sí | sí | ya tiene algo parecido → migrar | |
| Brutos — Controlar / Generar Reporte | sí | sí | no la necesita | 2-3 conceptos por legajo: la fila ya lo dice todo |
| GS Pers — Controlar / Generar Reporte | sí | sí | no la necesita | ídem |
| Control NR — Generar Reporte | sí | sí | no | la salida es un archivo |
| Rendimiento x EE | sí | sí | no la necesita | |
| Variación Sueldos | sí *(hoy tiene barra propia)* | sí | no la necesita | la fila ya dice anterior / actual / variación |
| Variación entre quincenas (POP) | sí | sí | no la necesita | |
| **Asiento de Remuneraciones** | sí | sí (DEBE/HABER) | **sí, por cuenta contable** | la ficha por legajo no aplica: lo que sirve es abrir la cuenta y ver qué conceptos la componen |
| **Contabilidad Desglosada + Asiento** | sí | sí (DEBE/HABER) | **sí, por cuenta contable** | ídem |
| **Acreditaciones** | sí | sí | **sí, por lista de acreditación** | la unidad es la acreditación, no el empleado (`D-021`). **Y el archivo lo recibe Finanzas: la ficha no puede llevar atributos del empleado** (`D-020`) |
| Importador de Novedades | sí | sí | no la necesita | la comparación contra el F2 ya armado sí gana con bandas (cantidad/importe generado vs armado) |

**Además de la ficha, dónde conviene otra cosa:**
- **Variaciones y Variación entre quincenas** ya tienen el escalón/histograma, que es lo que sirve
  ahí. No se les fuerzan bandas donde el eje es el tiempo.
- **EE x CATEG**: ver la nota de la matriz campo × legajo.

**El total, para tener la escala clara: la barra estándar va a los 21. La planilla con bandas, a
19. La ficha con cascada la justifican 10** (9 más Netos).

## 9. Orden de trabajo y dependencias

El detalle de cada tanda, con su prompt listo para copiar, está en
`docs/prompts-vista-estandar.md`. El esqueleto:

1. **Cimientos + un control piloto (Acumuladores Ganancias). Hecho el 2026-08-20 (D-077).** Las
   piezas de §7 más el primer control migrado de punta a punta, verificado en el navegador en los
   tres temas. **Todo lo demás depende de esta tanda, incluido el chat de Netos — que ya puede
   arrancar.**
2. **Barra + planilla, lote Meta4/Marval** — 10 entradas del registry.
3. **Barra + planilla, lote Axton/general** — 9 entradas. Puede ir en paralelo con la 2: no se
   pisan archivos.
4. **Fichas de legajo × concepto** — NR, Novedades vs Liquidación, Variación Conceptos.
5. **Fichas de legajo × agrupador y CC × concepto — Agrupadores, Rendimiento vs Tabulado. Hecho el
   2026-08-21 (D-081).** Agrupadores: una ficha por legajo con sus agrupadores adentro, con la
   diferencia neta (Nómina menos Resumen) y la total (la que suma el semáforo) separadas. Rendimiento
   vs Tabulado: una ficha por centro de costo, con el Tabulado abierto concepto por concepto a la
   izquierda y el Reporte de Rendimiento por categoría a la derecha. Se hizo antes de que estos dos
   controles tuvieran la barra estándar (tandas 2 y 3, todavía en PRs sin mergear): la tercera solapa
   de los dos sigue llamándose "Detalle" hasta que entren.
6. **Ficha de campos que no coinciden + matriz campo × legajo** — EE x CATEG.
7. **Fichas por cuenta contable** — Asiento de Remuneraciones, Contabilidad Desglosada.
8. **Ficha por lista de acreditación** — Acreditaciones.

**Netos** va en su propio chat, después de la tanda 1.

## 10. Lo que esto le agrega a un control nuevo

Cuando esto esté, la skill `.claude/skills/nuevo-control/` gana un punto de integración: un control
nuevo declara su descriptor de columnas con banda y sublabel, y qué va adentro de su ficha. La
barra, los chips, las tres solapas, el TOTAL, el exportar y el scroll los hereda sin escribir una
línea. **Eso es lo que hace que "salga con esto por defecto".**

## 11. Cómo se verifica

- **Los cinco chips, palabra por palabra, en los 21 controles.** Es lo que se pidió y es lo que hay
  que chequear a mano, control por control, en el navegador.
- **El `⬇ Exportar ▾` siempre en el mismo píxel** — último a la derecha de la barra.
- Cada tanda, en **los tres temas** (sobrio, intenso, oscuro): nada de hex en los módulos.
- Tests: la pieza de la ficha y el descriptor de columnas se testean una vez, con datos inventados
  y jugadores de Banfield. Y el archivo de test va **en la cadena de `package.json`** — uno que no
  esté ahí no lo corre nadie.
- El semáforo y los conteos no los toca esta migración: `unitsTotal`/`unitsWithDiff` se siguen
  contando en la unidad que declara `unit`, y el color sigue saliendo de
  `computeSemaforoStatus()`. Si una tanda cambia un conteo, es un bug de esa tanda.
