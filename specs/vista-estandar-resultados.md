# Vista estándar de resultados — Fichas + Planilla, iguales en toda la app

**Estado:** decidido el 2026-08-20 con Willy. **Las ocho tandas están hechas** (2026-08-20 y 21) e
integradas a `main` el 2026-08-21, en el orden del §9:

| Tanda | Qué | Decisión |
|---|---|---|
| 1 | las piezas compartidas del §7 + Acumuladores Ganancias como piloto | D-077 |
| 2 | barra + planilla, las diez entradas del lote Meta4/Marval | D-078 |
| 3 | barra + planilla, las nueve del lote Axton/general | D-079, D-080, D-081 |
| 4 | ficha de legajo × concepto — NR, Novedades vs Liquidación, Variación Conceptos | D-086 |
| 5 | ficha por legajo × agrupador y por centro de costo — Agrupadores, Rendimiento vs Tabulado | D-087 |
| 6 | ficha por legajo + matriz campo × legajo — EE x CATEG | D-082 |
| 7 | ficha por cuenta contable — Asiento de Remuneraciones, Contabilidad Desglosada | D-084, D-085 |
| 8 | ficha por lista de acreditación — Acreditaciones | D-083 |

Con eso, **la barra estándar está en los 21 controles, la planilla con bandas en los 19 que la llevan
y la ficha en los 10 que la justifican.** Las tandas 2 a 8 corrieron en paralelo, sin verse entre
ellas, y al integrarlas hubo que unificar la pieza de la Planilla —que dos tandas habían creado por
separado con el mismo nombre— y dejar en una sola las funciones que quedaron duplicadas: D-088.

**Lo que falta es lo que CI no puede hacer: que Willy mire las 21 pantallas en el navegador.** Cada
decisión de las tandas 2 a 8 que se tomó sin él está marcada como pendiente de confirmación en su
entrada de `DECISIONS.md` y resumida en `ESTADO.md`.

Sale del handoff de diseño del Control de Netos (Sportline) y se generaliza a los 21 controles. El
mapa de abajo está aprobado; los prompts de cada tanda de trabajo están en
`docs/prompts-vista-estandar.md`.

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

> **Única excepción, tanda 6 (D-082): EE x CATEG lleva una cuarta solapa, "Por campo"** (la matriz
> campo × legajo), después de Planilla. No reemplaza a ninguna de las tres — la planilla de la tanda 2
> sigue listando los casos uno por uno — y no abre la puerta a que otro control sume la suya: la solapa
> extra sólo entra si la spec se la reconoce por nombre a un control puntual en el mapa del §8
> (`extraTabs` en `renderResumenDetalle()`, con ese contrato en su propio JSDoc).

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

**Confirmado en la tanda 2 (D-078): "Orden ▾" es de la solapa Fichas y de ninguna otra.** Rendimiento
vs Asiento era la única de las diecinueve planillas que ordenaba por su cuenta (clickeando el
encabezado); esa función se sacó de la Planilla al migrarla y vuelve cuando el control tenga su ficha
por centro de costo (tanda 5).

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

> **Nota — desvío en la implementación (D-081).** El piloto de la tanda 1 (Acumuladores) puso
> `Marcas ▾` a la IZQUIERDA del buscador, no a la derecha como dice el párrafo de arriba, y la tanda 3
> copió esa posición en las 9 pantallas del lote Axton/general para que las pantallas queden iguales
> entre sí. Sigue así hasta que Willy lo vea en pantalla; si prefiere el orden de este documento, se
> cambia en un solo lugar por pieza (`js/ui/fichaList.js`, `js/ui/planillaPanel.js`).

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

**Una tercera, que salió en la tanda 4 (D-086):** cuando la tira suma dos totales que vienen de
archivos distintos y uno de los dos puede no traer dato para un concepto, la diferencia de la tira
**no puede ser la resta de esos dos totales** — resta cuenta el lado que falta como si valiera cero.
La tira suma sólo lo que los dos lados sí tienen (`Diferencia comparada`, en Control NR), los dos
totales de arriba siguen siendo los de cada archivo tal cual, y lo que quedó sin comparar se dice en
la conclusión: el importe, de qué lado está, y que no entra en la diferencia.

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

**Excepción encontrada en la tanda 2 (D-078): EE x CATEG no lleva bandas ni fila de TOTAL.** Compara
campos de texto (puesto, centro de costo) y presencia en cada archivo, no importes — no hay rubro que
agrupar ni número que totalizar. `renderRubroGrid()` acepta `bands: false` para este caso; ver el mapa
del §8.

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

**Construido en la tanda 2 (2026-08-20 — D-078), sobre las diez entradas del lote Meta4/Marval del §8:**

| Pieza | Dónde | Por qué |
|---|---|---|
| `renderPlanillaPanel()` — el gemelo de `renderFichasPanel()` para la solapa Planilla | `js/ui/planillaPanel.js` (nuevo) | §10: el control declara columnas, estado por fila y qué exporta; hereda la barra, el TOTAL y el cruce de filtros |
| `estadoDeFila()`, `contarEstados()` — el peor estado de una fila que compara varias columnas | `js/ui/tableTools.js` | una fila con varias columnas necesita un solo chip (D-073) |
| `createMarcasFilter()` — el desplegable `Marcas ▾` como pieza (antes vivía copiado en `fichaList.js`) | `js/ui/tableTools.js` | §3 |
| El buscador y los chips como dos ejes cruzados sobre la misma selección | `js/ui/tableTools.js` | antes buscar apagaba el chip puesto |
| Descriptor de columna con `diff: true` (badge, ámbar "sin comparar", barra de magnitud) y `bands: false` | `js/ui/resultBlocks.js` | para no repetir el armado del badge de diferencia en cada control, y para la planilla que no agrupa nada (EE x CATEG) |
| `reporteColumns()` — columnas del contrato de exportación con banda y base de cálculo | `js/ui/planillaPanel.js` | los tres controles que generan un archivo (Brutos, GS Pers, NR "Generar Reporte") |

Deuda pagada de paso, para los 21 controles: Brutos, GS Pers y Control NR dejan de pintar sus bandas
con `CYAN_HDR`/`LILAC_HDR` y los tres de Rendimiento con `rgba(...)` escritos a mano — el violeta que
no era de la marca desaparece.

**Construido en la tanda 3 (2026-08-20 — D-079, D-080, D-081), sobre las 9 pantallas del lote
Axton/general (agrupadores, variaciones_sueldos, variaciones_conceptos, pop_variaciones,
acreditaciones_reporte, novedades_importador, novedades_liquidacion, finadiet_asiento,
conta_desglosada):**

| Pieza | Dónde | Por qué |
|---|---|---|
| `sortable`, `footnote` y `mag` en la solapa Planilla | `js/ui/planillaPanel.js` | lo que necesitaban las nueve y la tanda 2 no había previsto; entraron a la pieza unificada (D-088) |
| Paginación sobre lo que pasa el filtro, no sobre el índice original | `js/ui/tableTools.js` | un legajo en la fila 300 no aparecía con un filtro activo, y "Mostrar todas" se ocultaba sin dar salida (D-080) |
| Rótulo de la 2ª banda legible con sólo dos bandas | `css/results.css` | salía celeste sobre blanco, le ganaba la regla de la columna congelada por especificidad (D-080) |

Con esto **las diecinueve planillas del §8 están migradas** y ya no queda ninguna barra propia: las tres
que faltaban (Agrupadores, Variación Sueldos, Variación Conceptos) se jubilaron en la tanda 3.

**Construido en la tanda 6 (2026-08-21 — D-082), sobre EE x CATEG:**

| Pieza | Dónde | Por qué |
|---|---|---|
| Solapa **Fichas** (una tarjeta por legajo, con la tira de conteo de campos en vez de una cascada de importes) | `js/controls/catXEmpleados.js` (`buildFichasCatXEmpleados`, `renderCatXEmpleadosFichas`) | §4: acá no hay plata que cascadear, hay campos que coinciden o no |
| Cuarta solapa **"Por campo"**, la matriz campo × legajo, sin fila de TOTAL | `js/controls/catXEmpleados.js` (`renderPorCampo`) | contesta si un campo falla en un legajo o en toda la nómina, sin exportar y contar a mano |
| `extraTabs` en `renderResumenDetalle()` — una solapa más, reservada a la que la spec reconoce por nombre en el §8 | `js/ui/resultBlocks.js` | §2 |
| El número grande de la ficha acepta un conteo, no sólo un importe | `js/ui/fichaList.js` | una ficha que cuenta campos, no pesos |
| El KPI de la selección acepta `amountDecimals: 0` | `js/ui/tableTools.js` | "Σ campos que no coinciden: 3", no "3,00" |

**Construido en la tanda 7 (2026-08-21 — D-084, D-085), verificado en los dos controles cuya unidad es
la cuenta contable (finadiet_asiento, conta_desglosada):**

| Pieza | Dónde | Por qué |
|---|---|---|
| El desglose por concepto de una cuenta contable, con clave por código | `js/controls/cuentaConceptos.js` (nuevo) | acumulado en la misma pasada que el saldo, para que no pueda desalinearse del asiento (D-084) |
| El cuerpo de la ficha de una cuenta (conciliación, tira, tabla de detalle, línea de contexto) | `js/ui/fichaCuenta.js` (nuevo) | para que las dos pantallas no se vayan separando |
| Texto del buscador configurable por control (`searchLabel` / `searchPlaceholder`) | `js/ui/fichaList.js` | el default ("Buscá por legajo o nombre…") no vale en un control por cuenta contable, por centro de costo ni por lista |


## 8. El mapa — control por control

Aprobado por Willy el 2026-08-20.

| Control | Barra estándar | Planilla con bandas | Ficha | Nota |
|---|---|---|---|---|
| **Control de Netos** | sí | sí | **sí** | el del handoff; se hace en su propio chat |
| **Cruce por Agrupadores** | **hecho (tanda 3)** | **hecho (tanda 3)** | **hecho (tanda 5, D-087)** | migrado a una sola planilla, una fila por legajo con una banda por agrupador — antes eran ~1000 filas para ~100 empleados. Y la ficha por legajo con sus agrupadores adentro, con la diferencia **neta** (Nómina − Resumen) y la **total** (la que suma el semáforo) separadas: el número grande es la total, para que un empleado con dos agrupadores compensados no salga en 0 |
| **Control NR** | **hecho (tanda 2, D-078)** | **hecho (tanda 2, D-078)** | **hecho (tanda 4, D-086)** | 18 conceptos, en `Marcas ▾` ("el legajo liquidó ese concepto"). La ficha abre un legajo y dice en qué conceptos no cierra, con su código y los dos lados — antes la fila decía "# Difs" y nada más |
| **Novedades vs Liquidación** | **hecho (tanda 3)** | **hecho (tanda 3)** | **hecho (tanda 4, D-086)** | migrado: las cuatro bandas del cruce se leen ahora en los cinco chips de estado; la ficha invierte el cruce: un legajo por tarjeta con las cuatro bandas adentro |
| **Acumuladores Ganancias** | **hecho (tanda 1)** | **hecho (tanda 1)** | **sí — reemplaza la ficha vieja** | migrado de punta a punta en la tanda 1, piloto del estándar (D-077) |
| **EE x CATEG** | **hecho (tanda 2, D-078)** | **hecho sin bandas ni TOTAL (tanda 2, D-078)** | **hecho (tanda 6, D-082)** | las tres tablas de diferencias se fusionaron en una planilla con columna "Qué pasa"; sigue sin totales porque compara campos de texto, no importes. La ficha es una tarjeta por legajo con la tira de conteo de campos (no una cascada de importes) y una conclusión que dice si el problema es del empleado o de una carga masiva. Suma una **cuarta** solapa, "Por campo" — la matriz campo × legajo, única excepción a las tres solapas del §2 |
| **Variación Conceptos** | **hecho (tanda 3)** | **hecho (tanda 3)** | **hecho (tanda 4, D-086)** | un legajo con varios conceptos que se movieron, y adentro el escalón de los que se pagan en escalones (`100 % → 70 %` dice algo que "bajó $ 16.805,40" no dice) |
| **Rendimiento vs Tabulado** | **hecho (tanda 2, D-078)** | **hecho (tanda 2, D-078)** | **hecho (tanda 5, D-087), por centro de costo** | la unidad es el CC, no el legajo; la lista de conceptos por columna pasó del `<th>` a una leyenda desplegable arriba de la planilla. La ficha abre el Tabulado **concepto por concepto, con su código** a la izquierda y el Reporte de Rendimiento —que sólo informa las cinco categorías ya sumadas— a la derecha: son distintas a propósito |
| **Rendimiento vs Asiento** | **hecho (tanda 2, D-078)** | **hecho (tanda 2, D-078)** | ya tiene algo parecido → migrar | pierde el orden por columna de la planilla principal (era la única que ordenaba por su cuenta; vuelve con la ficha) y el desglose que colgaba de la fila de TOTAL (el desglose por celda sigue igual); el rótulo pasa de "TOTAL GENERAL" a "TOTAL — N centros de costo" |
| Brutos — Controlar / Generar Reporte | **hecho (tanda 2, D-078)** | **hecho (tanda 2, D-078)** | no la necesita | 2-3 conceptos por legajo: la fila ya lo dice todo; se van los colores de banda escritos a mano (`CYAN_HDR`/`LILAC_HDR`) |
| GS Pers — Controlar / Generar Reporte | **hecho (tanda 2, D-078)** | **hecho (tanda 2, D-078)** | no la necesita | ídem |
| Control NR — Generar Reporte | **hecho (tanda 2, D-078)** | **hecho (tanda 2, D-078)** | no | la salida es un archivo; los cinco chips salen igual, en gris y con `title` explicando que no aplican |
| Rendimiento x EE | **hecho (tanda 2, D-078)** | **hecho (tanda 2, D-078)** | no la necesita | |
| Variación Sueldos | **hecho (tanda 3)** | **hecho (tanda 3)** | no la necesita | la fila ya dice anterior / actual / variación |
| Variación entre quincenas (POP) | **hecho (tanda 3)** | **hecho (tanda 3)** | no la necesita | el valor hora es la única columna de importe sin TOTAL, D-081 |
| **Asiento de Remuneraciones** | **hecho (tanda 3)** | **hecho (tanda 3, DEBE/HABER)** | **hecho (tanda 7, D-084), por cuenta contable** | la ficha por legajo no aplica: lo que sirve es abrir la cuenta y ver qué conceptos la componen — eso es lo que muestra. Las cuentas y los centros sin clasificar entran como ficha propia, en «Sin comparar» y con saldo `—` |
| **Contabilidad Desglosada + Asiento** | **hecho (tanda 3)** | **hecho (tanda 3, DEBE/HABER)** | **hecho (tanda 7, D-084), por cuenta contable** | ídem. Una cuenta sin código pasa a leerse «Sin comparar» y no «Con diferencia», en las dos solapas del control (D-085) |
| **Acreditaciones** | **hecho (tanda 3)** | **hecho (tanda 3)** | **hecho (tanda 8, D-083), por lista de acreditación** | la unidad es la acreditación, no el empleado (`D-021`). **Y el archivo lo recibe Finanzas: la ficha no lleva atributos del empleado** (`D-020`, escrito como assert). El aviso de grupo sin fecha se movió arriba de las tres solapas (`D-083`) |
| Importador de Novedades | **hecho (tanda 3)** | **hecho (tanda 3)** | no la necesita | migrado con sub-solapas anidadas en Planilla (una por vista: importador, totales por concepto, lo que quedó afuera, contra el importador ya armado), cada una con su propia barra |




**Además de la ficha, dónde conviene otra cosa:**
- **Variaciones y Variación entre quincenas** ya tienen el escalón/histograma, que es lo que sirve
  ahí. No se les fuerzan bandas donde el eje es el tiempo.
- **EE x CATEG**: hecho (tanda 6, D-082) — ver §2 y §7.

**El total, para tener la escala clara: la barra estándar va a los 21. La planilla con bandas, a
19. La ficha con cascada la justifican 10** (9 más Netos).

## 9. Orden de trabajo y dependencias

El detalle de cada tanda, con su prompt listo para copiar, está en
`docs/prompts-vista-estandar.md`. El esqueleto:

1. **Cimientos + un control piloto (Acumuladores Ganancias). Hecho el 2026-08-20 (D-077).** Las
   piezas de §7 más el primer control migrado de punta a punta, verificado en el navegador en los
   tres temas. **Todo lo demás depende de esta tanda, incluido el chat de Netos — que ya puede
   arrancar.**
2. **Barra + planilla, lote Meta4/Marval. Hecho el 2026-08-20 (D-078).** 10 entradas del registry.
3. **Barra + planilla, lote Axton/general. Hecho el 2026-08-20 (D-079, D-080, D-081).** 9 entradas.
   Corrió en paralelo con la 2: no se pisaron controles, pero las dos crearon un
   `js/ui/planillaPanel.js` con el mismo nombre, que al integrar quedó unificado (D-088).
4. **Fichas de legajo × concepto — NR, Novedades vs Liquidación, Variación Conceptos. Hecho el
   2026-08-21 (D-086).** Se hizo directo sobre `main`, sin esperar las tandas 2 y 3, eligiendo
   nombres de función que no chocaran con los de esos dos PR — aun así quedaron tres pares de
   funciones equivalentes, que al integrar se dejaron en una sola (D-088).

5. **Fichas de legajo × agrupador y CC × concepto — Agrupadores, Rendimiento vs Tabulado. Hecho
   el 2026-08-21 (D-087).** Agrupadores: una ficha por legajo con sus agrupadores adentro, con la
   diferencia neta (Nómina menos Resumen) y la total (la que suma el semáforo) separadas.
   Rendimiento vs Tabulado: una ficha por centro de costo, con el Tabulado abierto concepto por
   concepto a la izquierda y el Reporte de Rendimiento por categoría a la derecha. Se hizo sobre
   `main`, antes de que estos dos controles tuvieran la barra estándar, así que copió dos
   funciones de la tanda 3 y escribió una tercera que ya existía compartida; al integrar quedó
   una sola de cada una (D-088).
6. **Ficha de campos que no coinciden + matriz campo × legajo — EE x CATEG. Hecho el 2026-08-21
   (D-082).** Se construyó sobre la tanda 2 y entró después de ella.
7. **Fichas por cuenta contable — Asiento de Remuneraciones, Contabilidad Desglosada. Hecho el
   2026-08-21 (D-084, D-085).** Se apoyó en la barra y la planilla de la tanda 3.
8. **Ficha por lista de acreditación — Acreditaciones. Hecho el 2026-08-21 (D-083).** Corrió en
   paralelo con las 3 a 7,
   apoyada en la barra y la planilla de la tanda 3. La unidad es la lista, no el legajo (D-021), y
   lo de HR se queda en la pantalla (D-020, ahora escrito como assert contra el contrato de export).



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
