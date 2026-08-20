# Prompts de arranque — Vista estándar de resultados (Fichas + Planilla)

> Ocho chats de Claude Code sobre este repo, más el de Netos que Willy abre aparte. Cada uno abre
> rama propia (`feat/…`) y termina en PR contra `main`. La spec madre es
> **`specs/vista-estandar-resultados.md`**; leerla es lo primero que pide cada prompt.
>
> **Nada de esto está implementado al 2026-08-20.** El orden y las dependencias importan: la
> tanda 1 construye las piezas que usan todas las demás.

## Modelo y esfuerzo por chat

Elegilos con `/model` antes de mandar el prompt.

| Orden | Chat | Modelo | Esfuerzo / thinking | Por qué |
|---|---|---|---|---|
| 1 | Cimientos + piloto (Acumuladores) | **Opus 5** | **high** · thinking prendido | Define el molde de 21 pantallas: un error acá se multiplica por 21. Si se traba, subir a xhigh |
| 2 | Barra + planilla, lote Meta4/Marval | **Sonnet 5** | **high** · thinking prendido | Mecánico pero toca 10 controles y no puede romper ningún filtro ni conteo |
| 3 | Barra + planilla, lote Axton/general | **Sonnet 5** | **high** · thinking prendido | Ídem, 9 controles. Puede ir en paralelo con el 2 |
| 4 | Fichas de legajo × concepto | **Opus 5** | **high** · thinking prendido | Hay que decidir qué cuenta va adentro de la ficha en tres controles distintos |
| 5 | Fichas de legajo × agrupador y CC × concepto | **Opus 5** | **high** · thinking prendido | Agrupadores arrastra el problema del denominador inflado: hay que no repetirlo |
| 6 | EE x CATEG — ficha de campos + matriz | **Sonnet 5** | **high** · thinking prendido | Es transposición, no cálculo nuevo |
| 7 | Fichas por cuenta contable | **Opus 5** | **high** · thinking prendido | Toca el asiento, que sale al cliente |
| 8 | Acreditaciones — ficha por lista | **Sonnet 5** | **high** · thinking prendido | Poco cálculo, pero D-020 y D-021 no se pueden pisar |
| — | **Control de Netos** (chat aparte de Willy) | **Opus 5** | **high** · thinking prendido | Toca retenciones y la cascada de aportes. Después de la tanda 1 |

**Dependencias.** El 2 y el 3 pueden correr al mismo tiempo (no comparten archivos de control), y
los dos después del 1. El 4 al 8 y el de Netos, todos después del 1; entre ellos no se pisan.

## Lo que todo chat tiene que hacer en este contenedor

Va en cada prompt, pero conviene tenerlo suelto:

- `npm run hooks:install` — el contenedor de una sesión remota es nuevo y el chequeo de datos
  sensibles no está activo hasta que se instale.
- Para abrir la app: el entorno remoto bloquea `unpkg.com` y `cdn.sheetjs.com`. Se resuelve con
  `npm i --no-save dexie@4` y apuntando esos `<script>` de `index.html` a `node_modules/`.
  **Es un parche local que no se commitea.**

---

## Chat 1 — Cimientos + piloto

```
Leé specs/vista-estandar-resultados.md completo antes de escribir nada, y de CLAUDE.md las
secciones de Código y de Tests y CI.

Quiero las piezas compartidas de la vista estándar, más UN control migrado de punta a punta para
poder verlo en el navegador. El control piloto es Acumuladores Ganancias, porque ya tiene fichas de
primera generación (con los estilos escritos adentro del módulo) que hay que jubilar contra el
molde nuevo.

Piezas a construir, todas compartidas y testeadas:

1. css/tokens.css — los tintes de fondo que faltan (cierre de banda, celda de cierre, tira de la
   ficha, fila resaltada, pista del scroll, divisor de banda), cada uno con su par para modo
   oscuro. Ninguno se hardcodea en un módulo.
2. css/components.css — el scroll horizontal de .rb-grid-wrap pasa a 14 px, pista visible, pulgar
   con contraste y 80 px de largo mínimo. Es el §6 de la spec y lo heredan las 21 pantallas.
3. js/ui/tableTools.js — los chips: (a) que se chipifique SOLO el select de estado, marcado de
   forma explícita, y no cualquier select de 2 a 4 opciones como hoy; (b) los cinco estados fijos
   del §3 de la spec, con esas palabras y en ese orden; (c) un chip sin casos se muestra en gris,
   deshabilitado, con su 0 y un title que diga si no hubo ninguno o si no aplica al control.
4. js/ui/tableTools.js — que la búsqueda, la paginación y el KPI de la selección funcionen sobre
   una LISTA de elementos y no sólo sobre un <tbody>. Hoy initShowMorePagination e
   initSelectionTotals leen la tabla pintada; la ficha necesita lo mismo sobre tarjetas.
5. js/ui/fichaList.js (nuevo) — la ficha estándar del §4: avatar con gradiente por severidad,
   línea de identidad, línea de contexto, línea de marcas, importe a la derecha con caret, y el
   cuerpo con sus cuatro bloques (tira de conciliación y conclusión OBLIGATORIAS, las dos tablas y
   la tabla de detalle opcionales). <details>/<summary> nativo, cuerpo dibujado al primer
   despliegue, flex:none en cada ficha, hover sin transform. Los dos últimos son bugs ya pagados:
   están explicados en la spec.
6. js/ui/resultBlocks.js — el descriptor de columnas { key, label, sub, num, band } y un
   renderRubroGrid() que arma la planilla del §5: bandas, sublabel con la base de cálculo, dos
   columnas congeladas, TOTAL por columna. Reusá lo que ya está: enhanceGrid con rb-grid--2lvl y
   paintColumnGroups ya hacen el encabezado de dos filas pegado y el tinte por grupo; no lo
   reescribas.
7. js/ui/resultBlocks.js — el rótulo de la banda hoy se mete abajo de las columnas congeladas y
   desaparece al scrollear a la derecha. Arreglalo en la pieza, una vez.
8. js/ui/resultBlocks.js — renderResumenDetalle() pasa a soportar la tercera solapa
   (Resumen · Fichas · Planilla). La solapa que abre: Fichas si el control terminó con diferencias,
   Planilla si cerró; y la preferencia del analista se guarda POR CONTROL Y POR ESTADO
   (viewPref:<controlId>:conDif / :sinDif), no sólo por control — si no, la primera vez que alguien
   cambia de solapa la regla muere para siempre.

Después, el piloto: Acumuladores Ganancias pasa a las tres solapas, con la barra compartida
(hoy tiene una propia, con selects crudos y sin exportar en la solapa de fichas), los cinco chips,
las fichas del molde nuevo y la planilla con el descriptor. Borrá la ficha vieja: no queden dos
formas de hacer lo mismo.

Reglas que no se negocian:
- Ningún cálculo cambia. Ni un conteo. unitsTotal/unitsWithDiff se siguen contando en la unidad que
  declara `unit`, y el color del semáforo sigue saliendo de computeSemaforoStatus(). Si un número
  se movió, es un bug de esta tanda.
- Nada de hex en los módulos: todo por token, y comprobado en los tres temas (sobrio, intenso,
  oscuro).
- Tests con datos inventados y nombres de la lista de Banfield, y el archivo nuevo SUMADO a la
  cadena de package.json — uno que no esté ahí no lo corre nadie.
- Abrí la app y sacá capturas de las tres solapas de Acumuladores en los tres temas. Si el CDN
  bloqueado no te deja, decilo en el PR en vez de dar por bueno lo que no viste.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (pasale el diff al agente
documentalista antes de mergear).
```

## Chat 2 — Barra + planilla, lote Meta4/Marval

```
Leé specs/vista-estandar-resultados.md (§2, §3, §5 y el mapa del §8) y mirá cómo quedó Acumuladores
Ganancias en la tanda 1: es el modelo a copiar.

Quiero la barra estándar y la planilla con bandas en estas diez entradas del registry, sin tocar
fichas todavía:

  brutos, brutos_reporte, gs_pers, gs_pers_reporte, nr, nr_reporte,
  rend_vs_tabu, rend_x_ee, rend_vs_asiento, cat_x_empleados

Por control:
1. Barra: los cinco chips de estado con las palabras y el orden de la spec, el buscador, el
   desplegable "Marcas ▾" si el control tiene un segundo eje propio, los KPIs, y el
   ⬇ Exportar ▾ ÚLTIMO a la derecha. En EE x CATEG eso implica jubilar la barra propia que tiene
   hoy. En NR, el filtro por concepto (18 opciones) se queda desplegable y pasa a "Marcas ▾":
   18 chips no son un filtro.
2. Planilla: pasar las columnas al descriptor { key, label, sub, num, band } y armarla con
   renderRubroGrid(). El sublabel de cada columna es su base de cálculo y hay que escribirlo en
   criollo — es lo que hace que la planilla se explique sola. TOTAL en todas las columnas de
   importe, no sólo en las de cierre.
3. Brutos, GS Pers y Rendimiento vs Asiento pintan hoy las bandas con colores escritos a mano
   (CYAN_HDR, LILAC_HDR). Pasan al tinte compartido y esas constantes desaparecen. El violeta no
   es de la marca.
4. EE x CATEG no lleva bandas ni totales: el detalle son campos de texto que no coinciden, no hay
   nada que totalizar. Barra estándar sí, planilla sin bandas. La matriz campo × legajo que le
   corresponde se hace en su propia tanda, no acá.

Ningún cálculo cambia, ningún conteo cambia, ninguna diferencia aparece o desaparece. Antes de
empezar con cada control, anotá los números que muestra hoy (cuántos con diferencia, el total de
cada columna) y comprobá que salgan iguales después. Si uno se movió, pará: es un bug.

Nada de hex en los módulos; comprobado en los tres temas. Abrí la app y mirá las diez pantallas —
si el CDN bloqueado no te deja, decilo en el PR.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 3 — Barra + planilla, lote Axton/general

```
Mismo pedido que la tanda 2, con el otro lote. Leé specs/vista-estandar-resultados.md (§2, §3, §5
y el mapa del §8) y mirá Acumuladores Ganancias, que es el modelo.

Las nueve entradas:

  agrupadores, variaciones_sueldos, variaciones_conceptos, pop_variaciones,
  acreditaciones_reporte, novedades_importador, novedades_liquidacion,
  finadiet_asiento, conta_desglosada

Lo mismo de la tanda 2 (cinco chips con las palabras exactas, buscador, "Marcas ▾", KPIs,
⬇ Exportar ▾ último; columnas al descriptor con su sublabel; TOTAL en todas las de importe), más
tres cosas propias de este lote:

1. Agrupadores, Variación Sueldos y Variación Conceptos tienen barra propia hoy. Se jubilan.
2. Agrupadores tiene además su propio monto de diferencia, su porcentaje y su marcado de faltantes
   en su panel del Paso 2 (ownTolerance, D-069). Eso NO se toca en esta tanda: los chips leen el
   monto que el control ya usa, sea el del cliente o el propio.
3. Asiento de Remuneraciones y Contabilidad Desglosada: las bandas naturales son DEBE y HABER.
   Ninguno de los dos compara contra un umbral (cuadran al centavo), así que el chip "Dentro del
   margen" va deshabilitado con su title de "no aplica a este control" — no oculto.
4. Variaciones y Variación entre quincenas ya tienen el escalón/histograma, que es lo que sirve
   ahí. No les agregues bandas donde el eje es el tiempo: barra estándar y planilla, y el escalón
   queda como está.

Ningún cálculo cambia, ningún conteo cambia. Anotá los números de cada control antes y comprobalos
después. Nada de hex; los tres temas; abrí las nueve pantallas.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 4 — Fichas de legajo × concepto

```
Leé specs/vista-estandar-resultados.md (§4 sobre todo) y mirá la ficha de Acumuladores Ganancias
que salió de la tanda 1: es la pieza a usar, js/ui/fichaList.js. No escribas una ficha nueva.

Quiero la ficha en los tres controles donde la unidad es el legajo y adentro hay varios conceptos,
que hoy es justo lo que no se puede leer:

  nr (18 conceptos; hoy la fila de un legajo dice "# Difs" y nada más)
  novedades_liquidacion (legajo × concepto en cuatro bandas: coincide, difiere, no comparable,
    sin contraparte — D-073)
  variaciones_conceptos (los conceptos que se movieron entre períodos)

Para cada uno, lo que hay que decidir y escribir es QUÉ VA ADENTRO, con la anatomía de la spec:
- La tira de conciliación: la cascada de ese control, en pastillas. En NR es el total del reporte
  contra el total del Tabulado y qué conceptos lo explican; en Novedades vs Liquidación es lo
  pedido contra lo liquidado por banda; en Variación Conceptos es el período anterior, la
  variación y el actual.
- La tabla de detalle línea por línea: un renglón por concepto, con su CÓDIGO —nunca sólo el
  nombre: el Tabulado trae '4899-COCHERA_IG' y '8805-DTO_COCHERA' y matchear por nombre agarra el
  equivocado— los dos lados y la diferencia. Filas positivas en verde suave, negativas en rojo
  suave.
- La conclusión: qué mirar, descontando lo que ya está explicado. No un resumen del importe que ya
  se ve arriba: una instrucción.
- Las marcas de cada legajo como pills, y las mismas marcas disponibles en el desplegable
  "Marcas ▾" de la barra.

En Novedades vs Liquidación, ojo con dos cosas que ya están decididas: el legajo del que no se
pudo comparar nada NO queda aprobado (entra al numerador del semáforo, D-073), y "no comparable"
sale informado con su motivo, sin bloquear ni aprobar. La ficha tiene que mostrar el motivo, no
esconderlo detrás de un guión.

No recalcules nada: la ficha muestra lo que el control ya publica. Si te falta un dato para armar
la cascada, agregalo en el run() del control derivándolo de lo que ya tiene, y decilo en el PR —
pero no cambies ningún número que hoy se muestre, ni ningún conteo del semáforo.

Datos inventados y nombres de Banfield en los tests, archivo nuevo en la cadena de package.json,
nada de hex, los tres temas, y abrí las tres pantallas en el navegador.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 5 — Fichas de legajo × agrupador y CC × concepto

```
Leé specs/vista-estandar-resultados.md (§4 y la fila de Agrupadores en el mapa del §8) y usá la
pieza js/ui/fichaList.js que salió de la tanda 1.

Dos controles, dos unidades distintas:

1. agrupadores — la ficha por LEGAJO, con sus agrupadores adentro. Es el control que más gana:
   hoy la planilla tiene una fila por legajo × agrupador, o sea ~1000 filas para ~100 empleados, y
   no se puede ver a un empleado completo. La ficha cerrada muestra el legajo y su diferencia
   total; abierta, un renglón por agrupador con nómina, resumen y diferencia.
   OJO — el problema de contar en la unidad equivocada ya se pagó en este control: unitsTotal y
   unitsWithDiff se cuentan en LEGAJOS, no en filas de legajo × agrupador. Con el denominador
   inflado el umbral no se cruza nunca y el semáforo miente en verde. No lo reintroduzcas al
   armar la lista de fichas: la ficha se cuenta como un legajo.

2. rend_vs_tabu — la ficha por CENTRO DE COSTO, que es la unidad que el control declara. Cerrada,
   el CC con su diferencia; abierta, un renglón por concepto con Rendimiento, Tabulado y la
   diferencia. El nombre del centro de costo va en la línea de identidad, donde en los otros
   controles va el nombre del empleado.

En los dos, la anatomía completa de la spec: tira de conciliación, tabla de detalle con el código
de cada concepto o el nombre del agrupador, y conclusión que diga qué mirar. Las marcas del caso
como pills, y disponibles en "Marcas ▾".

No recalcules nada y no muevas ningún número ni conteo. Datos inventados y nombres de Banfield,
test nuevo en la cadena de package.json, nada de hex, los tres temas, y las dos pantallas abiertas
en el navegador.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 6 — EE x CATEG: ficha de campos + matriz campo × legajo

```
Leé specs/vista-estandar-resultados.md, la fila de EE x CATEG en el mapa del §8 y la nota del §2
sobre por qué este control no lleva "totales por rubro".

Este control es el distinto: no cruza importes, cruza CAMPOS del reporte de categorías contra el
Tabulado (fecha de alta, categoría, centro de trabajo…). Hoy el detalle es una fila por campo que
no coincide, así que un legajo con tres campos mal aparece tres veces y no se lo puede ver
completo.

Dos cosas:

1. La ficha por legajo, con la pieza js/ui/fichaList.js de la tanda 1. Cerrada: el legajo, el
   nombre y cuántos campos no coinciden. Abierta: un renglón por campo con el valor de cada lado,
   marcando el que difiere. Acá no hay cascada de importes, así que la "tira de conciliación" es el
   conteo de campos comparados / coinciden / difieren / sin comparar, y la conclusión dice si el
   problema parece de ese empleado o de una carga masiva.

2. La tercera solapa NO es una planilla de totales: es una MATRIZ campo × legajo. Las filas son los
   campos, y por cada campo cuántos legajos no coinciden, ordenado de peor a mejor. Es lo que
   contesta la pregunta que hoy no se puede contestar: "¿esto le pasa a un empleado o a todos?".
   Si un campo falla en 80 de 100 legajos, no es un error de carga individual y el analista tiene
   que verlo de una. Rotulala "Por campo".

La barra estándar con los cinco chips ya viene de la tanda 2; acá sólo se suman las solapas. "Sin
comparar" en este control es el legajo que está en un archivo y no en el otro, y no se lee como
aprobado.

Ningún conteo del semáforo cambia: la unidad es el legajo. Datos inventados y nombres de Banfield,
test en la cadena de package.json, nada de hex, los tres temas, pantalla abierta en el navegador.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 7 — Fichas por cuenta contable

```
Leé specs/vista-estandar-resultados.md (§4 y las filas de Asiento y Contabilidad Desglosada en el
mapa del §8), specs/finadiet-asiento-remuneraciones.md, specs/conta-desglosada-asiento.md y D-066.

Dos controles donde la unidad NO es el empleado sino la CUENTA CONTABLE — y por eso la ficha por
legajo no aplica:

  finadiet_asiento (Asiento de Remuneraciones)
  conta_desglosada (Contabilidad Desglosada + Asiento)

La ficha es por cuenta. Cerrada: el número y el nombre de la cuenta, su DEBE, su HABER y si cuadra.
Abierta: qué conceptos la componen, cada uno con su código, y cómo suman hasta el saldo de la
cuenta. Eso es lo que hoy no se puede ver sin exportar a Excel y filtrar a mano.

Tres cuidados propios de estos dos:
1. Cuadran al centavo, no contra un umbral. El chip "Dentro del margen" va deshabilitado con su
   title de "no aplica a este control", no oculto: la fila de chips es la misma en las 21
   pantallas.
2. La Contabilidad Desglosada lleva hoy legajo y fecha de ingreso como papel de trabajo del
   analista, y está pendiente que Willy confirme si ese archivo sale del estudio. Hasta que lo
   confirme, la ficha en pantalla puede mostrarlo —la pantalla la ve el analista— pero no agregues
   ni un dato del empleado al archivo exportado. Si el diseño te obliga a decidirlo, preguntá.
3. La verificación de este control está anclada en cinco números reales de COTY 05/2026 que están
   en su spec. Después de tocar la pantalla, comprobá que los cinco sigan dando igual. Si uno se
   movió, es un bug de esta tanda.

Datos inventados en los tests, test en la cadena de package.json, nada de hex, los tres temas, las
dos pantallas abiertas en el navegador.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 8 — Acreditaciones: ficha por lista

```
Leé specs/vista-estandar-resultados.md (§4 y la fila de Acreditaciones en el mapa del §8),
specs/control-acreditaciones-axton.md, y D-020 y D-021. Los dos últimos son el corazón de esta
tanda.

La ficha acá es por LISTA DE ACREDITACIÓN, no por empleado: la unidad de este control es la
acreditación y no el empleado-mes (D-021), y es la única excepción conocida a la regla de
consolidar por legajo. No la conviertas en una ficha por legajo "para que quede igual a las otras".

Cerrada: la lista, su empresa, la liquidación, la fecha de acreditación, cuántos empleados y el
total. Abierta: el desglose por banco, las alertas de esa lista, y qué la hace no cuadrar contra la
liquidación.

Y el cuidado que manda: **el archivo que este control genera lo recibe Finanzas del cliente, no el
equipo de Payroll** (D-020). Al archivo exportado va sólo lo necesario para pagar. Nada de dotación,
conteos, altas y bajas ni atributos del empleado — en muchos clientes Finanzas no tiene acceso a
eso. Todo lo demás se muestra en la pantalla, que la ve el analista. Esta tanda toca la PANTALLA:
si te encontrás agregando una columna al archivo, pará.

La barra estándar ya viene de la tanda 3. Acá se suman las solapas y la ficha.

Ningún conteo cambia: la unidad sigue siendo la lista. Datos inventados y nombres de Banfield, test
en la cadena de package.json, nada de hex, los tres temas, pantalla abierta en el navegador.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

---

## El chat de Netos (lo abre Willy aparte)

No lleva prompt acá porque el handoff de diseño ya lo describe pantalla por pantalla. Lo que sí
conviene pasarle al chat, además del handoff:

- **Depende de la tanda 1**: la ficha y la planilla salen de `js/ui/fichaList.js` y del descriptor
  de columnas, no se escriben de nuevo.
- **Los chips son los cinco del estándar**, no los seis del mockup: "Fuera de escala" y "Topearon
  aportes" son marcas y van al desplegable "Marcas ▾". El §3 de la spec explica por qué.
- **La tercera solapa se llama "Planilla"**, no "Totales por rubro" (§2).
- Lo que hay que **agregar en el control** es la cascada por legajo: el porcentaje de aportes de
  cada concepto y su efecto real en el neto, y las líneas de diferencia contra el teórico (sueldo
  proporcional por licencia, antigüedad y presentismo no liquidados). Buena parte ya está en el
  `run()`: `antiguedadTeo`/`antiguedadLiq`, `presentismoTeo`/`presentismoLiq`,
  `remuTeo`/`remuLiquidado`, `explicado` y `detalle[]`.
- Sigue **pendiente de Willy** el mecanismo del acuerdo no remunerativo por categoría (fijo +
  porcentaje). La ficha se puede construir igual, pero la línea "No remunerativo del acuerdo" y la
  conclusión van a arrastrar la misma diferencia que se ve hoy hasta que se defina.
