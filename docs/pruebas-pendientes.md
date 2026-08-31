# Pruebas pendientes de tu lado — auditoría al 2026-08-21

> **Qué es esto.** Todo lo que se construyó y mergeó y que **ninguna persona probó todavía con un
> archivo real**. Agrupado por control o reporte, no por PR: lo que importa es qué pantalla abrís y
> con qué archivo, no en qué rama se escribió.
>
> Reemplaza a la sección "Pruebas pendientes de tu lado, por cliente" de `ROADMAP.md` (que quedó al
> 2026-08-17 y no cubre los 15 PRs que entraron después). Se regenera con la skill
> `pruebas-pendientes`.
>
> **Revisión del 2026-08-21 (segunda pasada).** La vista estándar de resultados dejó de estar contada
> por tanda de trabajo y pasó a estar contada **por pantalla**: §6 bis tiene una entrada por control,
> ordenadas de la que puede darte un número mal y coherente a la que se ve sola, cada una con qué
> mirar, cómo se ve si está bien, qué pasa si está mal y el número contra el cual confirmarlo. Se
> sumaron §6 ter (los cuatro bugs de criterio que aparecieron mirando la pantalla) y §6 quater (las
> decisiones que las tandas tomaron sin vos, con la alternativa descartada al lado).
>
> **Qué significa "verificado" acá.** Que el cálculo se comprobó contra un archivo real y/o contra un
> armado manual, y que las cuentas dan. **No** significa que vos hayas visto la pantalla: la app se
> abrió con Playwright, y hay cosas —las descargas de Excel, sobre todo— que en el entorno remoto
> directamente no se pueden ejercitar porque la red bloquea los CDN de las librerías.

## Lo primero, en orden de riesgo

Si sólo tenés tiempo para tres cosas, son estas, y en este orden:

1. **Control de Netos (Sportline)** — el cálculo cierra completo (0 con diferencia sobre 619 legajos),
   pero hay **tres cosas mergeadas que nunca viste**: tus tres arreglos, el Detalle rediseñado en fichas
   y un bug de unidades que afectaba a 263 legajos. Más el tilde de jubilado, que nadie vio funcionando
   en pantalla. §1
2. **Contabilidad Desglosada + Asiento (COTY)** — el cálculo cierra al centavo contra el prototipo,
   pero **nadie abrió nunca los Excel que descarga la app**. Es el riesgo más silencioso de la
   lista: un archivo que sale mal formateado no lo detecta ningún test. Y ahora hay algo más para
   mirar ahí: las **tres columnas que pidió Contaduría del cliente** (legajo sin ceros, número de
   cuenta y número de concepto de Meta4), que se probaron con datos inventados y no todavía con el
   archivo real. §2
3. **Novedades N1 + N2 (SIASA / Merz)** — dos controles nuevos, completos y en el registry, que
   **no vieron un solo archivo real**. El layout del importador está deducido de un relevamiento, no
   confirmado. §4 y §5

Y una cuarta que no necesita ningún archivo y se destraba con sólo mirar la pantalla: **las 21
pantallas de la vista estándar de resultados ya están integradas a `main`**, las ocho tandas completas
(D-088). Lo único que falta es que las mires una por una: **§6 bis** las tiene control por control,
ordenadas por qué tan callado es el error de cada una, y arranca con las cinco cosas que se miran una
sola vez y quedan probadas para las 19 planillas. Aparte, **§6 ter** son los cuatro bugs de criterio
que aparecieron mirando la pantalla y cómo confirmar que quedaron arreglados, y **§6 quater** las
decisiones que las tandas tomaron solas, con la alternativa descartada al lado, para que las confirmes
o las mandes atrás.

---

## 1 · Control de Netos (Sportline / IFSA)

**Qué es.** Rearma el recibo teórico de cada legajo desde el Tabulado y verifica que el neto liquidado
coincida.

**Cómo llegó hasta acá.** El cálculo **cierra completo**: contra los tres Tabulados reales de Comercio,
**0 legajos con diferencia sobre 619**. Ese resultado salió de los cinco criterios que confirmaste el
2026-08-20 (las alícuotas se leen del Tabulado empleado por empleado, el anticipo de incentivo no
aporta, el acuerdo es del convenio, los puestos sin aportes son los del puesto y no los de obra social
en cero, y el jubilado que sigue trabajando se sospecha y lo confirma el analista): las diferencias sin
explicar bajaron de 206 a 17 y de ahí a 0.

**Lo que está mergeado y no viste, que ahora son tres cosas y no una:**

- **Los tres arreglos que pediste en vivo** — rótulo de la tolerancia en pesos, columna Nombre, rótulo
  de Empresa configurable, y el filtro de 4 categorías (que de paso corregía que "con diferencias"
  ignorara tu tolerancia y midiera siempre con $0,01).
- **El Detalle rediseñado.** Pasó de planilla plana a las tres solapas del estándar, abre en Fichas si
  hay diferencias y en Planilla si cerró, con una tarjeta por legajo y la cascada del residuo concepto
  por concepto.
- **Un bug de fondo corregido de paso:** dos códigos que son de UNIDADES se estaban sumando como pesos.
  Afectaba a **263 legajos** de 05/2026.

### Qué mirar

| Qué | Cómo se ve si está bien | Si está mal |
|---|---|---|
| El rótulo de la tolerancia | Dice el monto **en pesos**, no "0,01" ni un porcentaje | Volvés a no saber contra qué se está midiendo |
| La columna **Nombre** y el rótulo de **Empresa** | El nombre al lado del legajo, y la empresa que configuraste | Vas a otro archivo a ver quién es cada uno, o sale otra empresa del grupo |
| El **filtro de 4 categorías** | Los cuatro números **suman el total de legajos** | Si "con diferencia" te muestra un caso que está dentro de tu tolerancia, el filtro quedó midiendo con $0,01 — ése era el bug de fondo |
| La corrida de los tres Tabulados de Comercio | **0 con diferencia sobre 619** | Cualquier número distinto de 0 es algo que cambió después de la verificación |
| **El tilde de jubilado** | El analista lo marca y el legajo deja de exigir la ley 19.032 | Es lo único de los cinco criterios que **nadie vio funcionando en pantalla** |
| El KPI "Legajos cruzados" del hero | Debería decir lo mismo que la tarjeta | **Hoy no coinciden y se sabe:** el hero cuenta 380 y la tarjeta informa 619. Está identificado y sin arreglar — no te asustes, pero confirmá que es sólo el número del hero |

**Cómo probarlo.** Cliente Sportline → Control de Netos → los Tabulados reales + el archivo de la
escala → correr. Pasá por las cuatro vistas (Resumen, Fichas, Planilla, exportado) y confirmá que el
nombre, la empresa y los números aparecen igual en todas. **Miralo también en tema oscuro.**

### Lo que espera una decisión tuya

- **El acuerdo no remunerativo que varía por categoría** (a veces fijo + porcentaje) sigue pedido desde
  el 2026-08-19 y **sin tocar a propósito**. Ojo: el criterio de que el acuerdo es *del convenio* ya
  quedó resuelto y aplicado; lo que falta es el mecanismo del monto cuando cambia por categoría. Es lo
  único de este control que puede dar un número mal y coherente.
- **¿Cada solapa tiene que exportar lo que se está viendo?** El handoff lo pedía —Fichas una hoja por
  legajo con su conciliación, Planilla la matriz con el TOTAL— y hoy las dos comparten el export que ya
  existía, que baja la reconstrucción completa. Sirve, pero no es lo que pedía el handoff. **Falta que
  digas si vale la pena.**
- La tolerancia de la comparación con el mes anterior, y el **calculador de AFA** (comparte la fórmula
  pero corre antes de liquidar — es otro control, no un ajuste de éste).

**Deuda técnica que no te traba:** esta pantalla fue la primera implementación de la vista estándar y se
hizo *antes* de que existiera la pieza compartida, así que su ficha y su planilla son propias y hay que
migrarlas. Cuando pase, la pantalla tiene que seguir viéndose igual.

**Detalle:** `specs/spec-control-netos.md`, D-067, D-068, D-075, D-076.

## 2 · Contabilidad Desglosada + Asiento (COTY, Axton)

**Qué es.** Convierte el "Totales de Concepto" de Axton en la desglosada DEBE/HABER y en el asiento
agrupado por cuenta, y controla que cierre. Desde el 2026-08-31 son **dos** archivos y no tres: la
"Desglosada con Código" dejó de existir porque la desglosada ahora lleva el número de cuenta adentro.

**Cómo llegó hasta acá.** Verificado contra los dos archivos reales de COTY de 05/2026: reproduce
**exactas** las cinco anclas del prototipo. La pantalla se recorrió en los tres temas.

### Lo que hay que probar

**Abrir los dos `.xlsx` que descarga la app y compararlos con los del prototipo.** Esto no se pudo
hacer en el entorno de desarrollo porque la librería que arma los Excel viene por CDN y la red la
bloquea. Los cinco números que tienen que aparecer, y que ya se sabe que el cálculo produce bien:

- balance bruto **1.441.239.270,46**
- balance neteado **1.359.204.242,38**
- **273** filas de asiento
- **12** cuentas patrimoniales
- **0** líneas sin código

**Qué mirar en los archivos**, más allá de los números: que los importes salgan como número y no como
texto (si salen como texto, no podés sumarlos en Excel y no se ve a simple vista), que la coma
decimal sea la que espera tu Excel, que los encabezados estén en la primera fila, y que los dos
archivos tengan el nombre que el contador espera.

### Lo nuevo: las tres cosas que pidió Contaduría del cliente (2026-08-31, D-095)

Están las tres en la desglosada, se probaron con datos inventados y en la pantalla del navegador, y
**ninguna se corrió todavía contra el "Totales de Concepto" real de COTY**. Qué mirar en el archivo:

| Qué pidió Contaduría | Cómo tiene que verse | Qué mirar si está mal |
| --- | --- | --- |
| El legajo **sin el cero del principio** | La columna Legajo dice «7» donde el reporte de Axton dice «007» | Un legajo con letras o guiones («12-B») sale tal cual **a propósito**: ahí el cero puede ser parte del número. Si querés que salgan con los ceros, se apaga desde el Paso 2 |
| El **número de cuenta** junto al nombre | Columna `Nro Cuenta` **antes** de `Cuenta`, igual que en el asiento | Una celda que diga "sin código" es una cuenta que no está en el Reporte de Cuentas del cliente: sale listada en la pantalla, no se inventa |
| El **número de concepto de Meta4** | Columna `Nro Meta4` después de `Nro` | **Es lo más probable que aparezca:** un concepto que COTY liquide y no esté en los 96 pares del reporte que mandó el cliente sale con la celda **vacía**, y la pantalla lo lista con su código y su nombre. Cargalo en el Paso 2 (código de Axton ⇥ código de Meta4) y volvé a ejecutar |

La línea de **"Neto a pagar"** repite su propio número (9000) en la columna de Meta4: ese concepto no
existe en la liquidación, lo inventa el asiento, así que no tiene equivalencia que buscar.

**Lo que ya está decidido y no te vuelve a preguntar:** la **fecha de ingreso se queda** en el archivo,
aunque ahora se sepa que la desglosada la recibe Contaduría del cliente — es el mismo archivo que el
cliente venía recibiendo (D-095).

**Detalle:** `specs/conta-desglosada-asiento.md`, D-066, D-095.

---

## 3 · Monto de diferencia (el panel "Umbrales") — afecta a los 19 controles

**Qué es.** El número que escribís en "Umbrales" y que significa "de acá para abajo no me interesa".
Hasta hace poco era un $1,00 decorativo que **ningún control leía**. Ahora lo leen los 19.

**Cómo llegó hasta acá.** Se edita en el wizard y en `#/admin`, se guarda por cliente, viaja en el
seed, y cada corrida guarda con qué monto se midió (así una corrida vieja no cambia de resultado
sola). 67 asserts + 2 pruebas de navegador, verificado en claro y oscuro.

### Lo que hay que probar

1. **Correrlo con un archivo real y decidir el monto por cliente.** Es la parte que sólo vos podés
   hacer: ¿$1? ¿$100? ¿distinto para Marval que para Sportline? Probá con dos montos bien distintos
   sobre el mismo archivo y mirá cuántas diferencias quedan de cada lado — ése es el número que estás
   eligiendo.
2. **Confirmá que una corrida vieja no se movió.** Abrí una corrida anterior al cambio y mirá que dé
   lo mismo que daba. Si cambió, el monto se está aplicando hacia atrás y eso rompe la historia.
3. **Ojo con el semáforo.** Al subir el monto, controles que estaban en amarillo se van a poner
   verdes. Eso es correcto, pero conviene que lo veas pasar una vez para que no te sorprenda después.

### Abierto a definir

**Cruce por Agrupadores** conserva hoy su propio panel (su monto, su porcentaje y su marcado de
faltantes). Cuando salga de oculto hay que decidir si pasa a usar el monto del cliente como los
demás, o se queda con el suyo.

**Detalle:** D-069, `tests/tolerance.test.js`.

---

## 4 · Novedades N1 — la app genera el importador (SIASA, Merz y los 7 Axton)

**Qué es.** Tomás la planilla de novedades que manda el cliente y la app arma el `F2_Consolidada`
que se importa a Axton, consolidando por legajo. Antes de dejarte descargar te muestra qué entra
—legajos, conceptos, totales— y qué quedó afuera con el motivo.

**Cómo llegó hasta acá.** 72 asserts + 6 pruebas de navegador, todo con datos inventados.
**Nunca vio un archivo real.** El layout del importador está **deducido** del relevamiento de las
planillas de SIASA y Merz, no confirmado contra un F2 que realmente haya entrado a Axton.

### Lo que hay que probar — y es lo más importante de esta sección

**Conseguir una planilla real de una UO de SIASA 07/2026 y el F2 que la analista armó a mano ese
mismo mes, generar el importador con la app, y comparar los dos archivos.** No de a un total: **de a
un legajo**, con el criterio de D-064. Qué mirar, en este orden:

1. **El layout del F2.** Orden de las columnas, encabezados exactos, si hay filas de preámbulo, el
   formato `cantidad$importe` (¿el separador es `$`?, ¿los decimales con coma o punto?, ¿la cantidad
   lleva decimales?). Si el layout está mal, Axton lo rechaza y te enterás recién al importar.
2. **Un legajo completo**, línea por línea con el código de cada concepto, generado por la app vs. el
   armado a mano. Si hay diferencia, descomponerla por concepto — una diferencia que no se puede
   descomponer no está entendida.
3. **Las columnas que sólo traen nombre en criollo.** Se resuelven en el Paso 2 y el mapeo se guarda
   por rótulo. Confirmá que la app propuso el código correcto para cada una, y que la que no supo
   resolver te la **pidió** en vez de saltearla.
4. **Lo que quedó afuera y por qué.** Cada exclusión tiene que tener un motivo que entiendas. Si dice
   "sin código" y el concepto sí existe, es un problema de catálogo, no del control.

### Un caso que ya está esperando

En SIASA Aguas y Gaseosas 07/2026 hay **un legajo que está en la planilla que mandó el cliente y no
llegó al importador**. Nadie sabe si eso fue a propósito (la analista lo excluyó) o si es una
pérdida. **Preguntale a la analista.** Es el primer caso de verificación real de esta familia y sirve
para los dos controles.

**Detalle:** `specs/familia-novedades-axton.md` § "Lo que N1 espera de un archivo real", D-070, D-071.

---

## 5 · Novedades N2 — importador contra la liquidación

**Qué es.** Cruza el importador (idealmente el que generó y validaste con N1) contra el Tabulado de
Axton y el reporte "Totales de Concepto", legajo por legajo y concepto por concepto. Clasifica cada
comparación en cuatro bandas: coincide, difiere, no comparable (informado, con su motivo) y sin
contraparte.

**Cómo llegó hasta acá.** 91 asserts + 9 pruebas de navegador, datos inventados. **No vio ningún
archivo real, de ningún cliente, nunca.** Es el control más nuevo y el menos probado de la app.

### Lo que hay que probar

**Hacen falta tres archivos del mismo período y de la misma UO** —importador + Tabulado + Totales de
Concepto de SIASA 07/2026—, y con eso armar **un caso completo de un legajo** antes de mirar el resto
de la nómina. Sin los tres del mismo mes el cruce no significa nada.

Ojo con dos cosas del armado:

- **El Tabulado de este control no entra por el casillero de siempre.** Va como archivo adicional,
  porque el casillero estándar cablea el lector de Meta4 y acá el archivo es de Axton. Si lo subís en
  el lugar equivocado te va a decir qué archivo esperaba.
- **El "Totales de Concepto" es obligatorio**, y no es un capricho: es lo único que distingue "este
  concepto no se liquidó" de "se liquidó pero el Tabulado no lo muestra en columna propia". Sin él,
  todo lo que falte parece un error.

### Qué mirar en el resultado

| Banda | Qué significa | Qué revisar |
|---|---|---|
| Coincide | Cantidad e importe iguales en los dos lados | Que sean *muchos*. Si coincide poco, algo se está comparando mal, no está todo mal liquidado |
| Difiere | Los dos lados tienen dato y no da igual | Acá está el valor del control. Descomponer por concepto |
| No comparable | Falta un dato de un lado, o la unidad no se puede comparar | Que el motivo se entienda. Informa y **no** bloquea, a propósito |
| Sin contraparte | El legajo o el concepto está en un lado y no en el otro | El caso más peligroso: puede ser una novedad que no se liquidó |

**Importante para leer el semáforo:** el legajo del que **no se pudo comparar nada** cuenta como "a
revisar", no como aprobado. No tener con qué comparar no es lo mismo que estar bien (D-073).

### Tres criterios tuyos, sin confirmar

Están escritos en **D-073** y el control ya funciona con una decisión tomada, pero es tu decisión la
que vale. Vienen con la config nueva por cliente: dos listas de conceptos, los que están en **otra
unidad** y los que **no llegan a la liquidación**. Esas dos listas hoy están vacías para todos los
clientes: **hasta que las cargues, esos conceptos van a salir como "no comparable"**.

**Detalle:** `specs/familia-novedades-axton.md`, D-070, D-072, D-073.

---

## 6 · Los dos lectores nuevos de archivos de Axton (N0a y N0b)

**Qué es.** Dos piezas que no tienen pantalla: el lector de la familia de planillas de novedades
(ExpNov) y el lector del Tabulado de Axton de los 7 clientes, más el del "Totales de Concepto".

**Cómo llegó hasta acá.** 73 + 83 asserts contra fixtures inventados que copian todas las rarezas
relevadas en los archivos reales: el preámbulo de 0, 1 o 2 filas, los conceptos con cantidad e
importe o sólo importe, el `TOTAL GENERAL` una vez o repetido, las filas que el analista agrega a
mano al pie, los espacios duros de los encabezados. **Ningún archivo real pasó por ellos.**

**Cómo se prueban:** no tienen pantalla propia, así que **se prueban solos cuando pruebes N1 y N2**.
Lo que conviene mirar cuando eso pase:

- Que **valide las sumas contra el `TOTAL GENERAL` del propio archivo** y, si no cierra, te muestre
  los dos números. Ese aviso es la red de seguridad de todo lo que viene después.
- Que las **filas que alguien agregó a mano al pie** salgan avisadas y **no** entren como datos.
- Que una cantidad que el archivo no trae quede como hueco y el control salga INCIERTO, nunca cero.

**Deuda técnica que conviene saber que existe:** hoy conviven **dos lecturas del mismo Tabulado de
Axton** — el lector nuevo tolerante y el lector estricto que usa Variaciones de POP. Está pendiente
que el estricto pase a delegar en el nuevo, con la verificación de que Variaciones sigue dando lo
mismo. Mientras conviven, cualquier formato nuevo se agrega al nuevo, no al estricto.

**Detalle:** D-072, `specs/lector-tabulado-formatos.md`.

---

## 6 bis · Vista estándar de resultados — las 21 pantallas, una por una

**Ya está todo integrado a `main`** (las ocho tandas, D-077 a D-088). **No hace falta ningún archivo
nuevo:** con abrir cada pantalla de una corrida que ya tenés alcanza. Es el ítem de la lista que más
rápido se destraba y el único donde la prueba es mirar.

**Cómo llegó hasta acá.** Ningún cálculo ni conteo del semáforo se movió en ninguna de las 21. De cada
pantalla se anotaron, antes y después de migrar, la cantidad de filas y el total de cada columna, y se
compararon uno por uno. Se miraron en un navegador de verdad, en los tres temas. **Pero siempre con datos
inventados:** en el repo no hay ningún archivo de cliente con el que llegar a una pantalla de resultados
por el camino del analista, así que **la primera vez que estas pantallas ven un Tabulado real vas a ser
vos.**

**La lista de abajo está ordenada por qué tan silencioso es el error**, no por tanda ni por tamaño:
arranca por lo que puede darte un número mal y coherente —que no lo detecta nadie— y termina en lo
visual, que se ve solo. Una entrada por control, con qué mirar, cómo se ve si está bien, qué pasa si está
mal, y el número contra el cual confirmarlo.

**La regla general de los números ancla.** Salvo las excepciones que cada entrada dice explícitamente,
**los totales y los conteos tienen que dar exactamente los mismos números que tu última corrida de ese
control**. Si un total se movió, la migración se comió una fila o una columna. Las únicas excepciones
previstas son tres, y todas hacen **bajar** un número, nunca subir: la cantidad de celdas en rojo y el
"# Difs" de NR (que antes se medían siempre con $ 0,01 y ahora con el monto que configuraste), y la
diferencia por legajo de NR (que antes restaba totales).

### Lo que se prueba una vez y vale para las 19 planillas

Cinco cosas viven en la pieza compartida, así que se miran en **cualquier** pantalla y quedan probadas
para todas. Si algo de esto quedó raro, quedó raro en las 19:

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| **La barra de arriba de cada tabla** | Siempre el mismo orden en las 21: los cinco chips (Todos · Con diferencia · Dentro del margen · Al centavo · Sin comparar), el buscador, `Marcas ▾`, y el `⬇ Exportar ▾` **último**. La suma de los cuatro últimos chips da el primero | Un caso que no aparece con ningún chip es un caso que nadie va a encontrar |
| **El buscador y el chip se cruzan** | Tipeás algo, clickeás un chip, y **el texto sigue ahí**: el chip filtra adentro de lo buscado | Antes, en nueve pantallas, el chip te borraba lo tipeado. Es la decisión D-088 de la sección siguiente |
| **La barra de scroll horizontal** de una planilla ancha | Gruesa (14 px) y con pista visible. **Esto el entorno de desarrollo no lo puede verificar: hay que mirarlo en pantalla** | Estaba declarada a 10 px y el navegador la dibujaba a 2 px igual, porque dos reglas de CSS la apagaban |
| **El rótulo de una banda al scrollear a la derecha** | Se queda pegado al borde de las columnas congeladas y se lee siempre. "IDENTIFICACIÓN" en blanco sobre oscuro, nunca blanco sobre blanco | Un rótulo que se esconde o que sale celeste sobre blanco (el caso que apareció primero fue Variación Sueldos, la única planilla con sólo dos bandas) |
| **El renglón de abajo** | Dice `TOTAL — N legajos` (o `N centros de costo`, `N cuentas`), y pasa a `TOTAL de la selección` cuando filtrás | Un total que no cierra con lo que estás mirando |

---

### 1 · Control NR (Marval) — es el que puede mentir más callado

**Qué cambió.** Ganó la solapa Fichas (una tarjeta por legajo, con un renglón por concepto liquidado y su
código) y, al construirla, **cambió el criterio de la diferencia por legajo**: antes se calculaba restando
los dos totales, lo que cuenta como cero el lado que falta. Antes la fila decía sólo "# Difs: 3" y para
saber cuáles había que bajar el `.xlsx`.

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| Los dos totales de arriba de la tira, en una ficha | Cada uno es el total de **su** archivo (Reporte NR / Tabulado), tal como los venís comparando a ojo | — |
| **La diferencia de la ficha** | Suma sólo los conceptos que tienen dato en los dos lados, y lo que quedó afuera se dice en la conclusión: el importe y de qué lado está | Un legajo con un concepto liquidado que el Tabulado no informa salía con una diferencia negativa por ese importe entero, cuando lo que corresponde decir es "no se puede comparar" |
| El número grande de la tarjeta | Dice **"A revisar"** y es la suma en valor absoluto de las diferencias que pasan tu monto — **no el neto** | Un legajo con +12.000 en un concepto y −12.000 en otro tiene neto cero y dos conceptos mal: con el neto, ese caso desaparecía |
| `Marcas ▾` | Los 18 conceptos, y cada marca significa "el legajo liquidó ese concepto" (no "tiene diferencia ahí") | — |

**Números ancla.** Los dos totales del control, iguales a tu última corrida. La columna **"# Difs" puede
bajar y nunca subir** (ahora mide con tu monto, antes con $ 0,01). Y la diferencia total del Resumen tiene
que dar **la suma de los "A revisar" de todas las fichas**: son el mismo número por construcción.

---

### 2 · Cruce por Agrupadores — dos números que se parecen y no son el mismo

**Qué cambió.** Pasó de una tabla por agrupador (~1000 filas para ~100 empleados, donde no se podía ver a
un empleado entero) a **una sola planilla, una fila por legajo con una banda por agrupador**, más la ficha
por legajo con sus agrupadores adentro.

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| **Los dos números de la tira de la ficha** | La **neta** (Nómina Maestra − Resumen, que puede compensar un agrupador con otro y dar 0) y la **total** (la suma en valor absoluto de los que pasan el umbral). El número grande es **la total** | Con la neta arriba, un legajo con un agrupador +100 y otro −100 sale en 0 y desaparece justo el caso a revisar |
| El KPI "Σ diferencia" de la barra | Da **exactamente** la suma de los números grandes de todas las fichas | Si no cierra, el semáforo y la ficha están contando cosas distintas — es el error que este control ya pagó una vez, contando legajo × agrupador en el denominador |
| Un legajo que está en **un solo archivo** | Sin ningún renglón en rojo, chip ámbar "Sin comparar", y el badge dice de qué archivo falta | Los renglones en rojo se leerían como "hay una diferencia real", cuando lo que pasa es que no hay con qué comparar |
| **El estado de cada fila de la planilla** | Se mide con el monto y el % del panel propio de Agrupadores, **no** con el de "Umbrales" | Es lo único que todavía no se unificó: si esperabas que respetara el monto del cliente, todavía no lo hace |

**Número ancla.** La suma de los números grandes de las fichas = el "Σ diferencia" de la barra = el total
que ya publicaba el semáforo antes de esta tanda. Hay un test que lo fija, pero el que cuenta es el de tu
corrida.

---

### 3 · Contabilidad Desglosada + Asiento (COTY) — el cálculo cierra, la etiqueta cambió

**Qué cambió.** Ganó la solapa Fichas **por cuenta contable** (no por legajo): cerrada, número y nombre de
la cuenta, DEBE, HABER y si cuadra; abierta, la tabla concepto por concepto con su código hasta el saldo.
Y **una cuenta sin código pasa de leerse "Con diferencia" a leerse "Sin comparar"**, en las dos solapas.

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| Los cinco números del control | Balance bruto **1.441.239.270,46**, neteado **1.359.204.242,38**, **273** filas, **12** cuentas patrimoniales, **0** sin código | Cualquiera que se mueva: ningún cálculo se tocó en esta tanda |
| **El residuo de cada ficha** | **Siempre cero.** Por construcción el desglose es el mismo saldo partido por concepto | Un residuo distinto de cero es la única señal de que el desglose y el saldo se desalinearon — y eso no se nota mirando los totales, que siguen cerrando |
| Una cuenta **sin código** | Chip ámbar "Sin comparar", con la conclusión de que falta el Reporte de Cuentas de Redefinición del cliente | En rojo "Con diferencia" se leía como un problema de importes, cuando el balance cierra y lo que falta es el otro archivo |
| Una **corrida vieja** reabierta (guardada antes de que existiera el desglose) | Dice que la corrida no guardó el desglose | Antes leía eso mismo como "los conceptos no suman al saldo" y te marcaba todas las cuentas en rojo |
| **Los tres `.xlsx` que descarga la app** | Sigue pendiente de antes (§2): abrirlos y compararlos con los del prototipo | Un Excel con importes como texto se ve bien en pantalla y no se puede sumar. Ningún test lo agarra |

---

### 4 · Asiento de Remuneraciones (FINADIET) — cada ficha tiene que ser una unidad del semáforo

**Qué cambió.** Ganó la misma ficha por cuenta contable, y **las cuentas y centros de costo sin
clasificar entran como ficha propia** — antes sólo se veían en el Resumen.

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| **Cuántas fichas hay** | Exactamente una por cada unidad que cuenta el semáforo; y las que no cerraron son exactamente las que el semáforo cuenta como a revisar | Si sobran o faltan, el semáforo y la pantalla están mirando universos distintos |
| Una cuenta o centro **sin clasificar** | Saldo **"—", nunca "0,00"**, chip "Sin comparar", y la conclusión dice qué cargar en el Paso 2 | Un 0,00 ahí se lee como "esta cuenta está en cero", que es lo contrario de "esta cuenta no se pudo clasificar" |
| La palabra del saldo | Dice **"SALDO"**, como el archivo de FINADIET (en la Desglosada dice "NETO") — la cuenta detrás es la misma, DEBE − HABER | — |

**Nota.** Este control sigue **postergado** por relación esfuerzo/valor y su archivo de entrada real
todavía no está definido (§ de `ESTADO.md`): la ficha es sobre lo ya construido, no reabre el frente.

---

### 5 · Novedades vs Liquidación (SIASA / Merz) — dos diferencias que no se suman entre sí

**Qué cambió.** Las cuatro bandas del cruce (coincide, difiere, no comparable, sin contraparte) se leen
ahora en los cinco chips de estado, y ganó la ficha: **un legajo por tarjeta con las cuatro bandas juntas
en una sola tabla**, en vez de cuatro tablas donde un legajo con varias novedades se repetía una vez por
cada una.

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| Las dos diferencias de la tira | **Δ importe y Δ cantidad separadas.** La cantidad no es plata y no se mide con tu monto | Sumar horas con pesos en un solo número no significa nada |
| El número grande | Dice "A revisar" y es la suma en valor absoluto de las diferencias que pasan tu monto, no el neto | Ídem NR: dos conceptos compensados esconden el caso |
| Un legajo cuya **única** diferencia son horas | El número grande queda en **ámbar, no en rojo** — un $ 0,00 en rojo se lee como una contradicción | — |
| El legajo cuyas novedades son todas conceptos "no llega a la liquidación" | Chip **ámbar "Sin comparar"**, con el badge y la conclusión explicándolo; el semáforo lo deja afuera del numerador a propósito | Si sale en rojo se lee como un error de carga cuando es un concepto declarado |
| Lo que muestra la ficha del legajo | **Bruto y unidad organizativa incluidos**: es la pantalla del analista de Payroll, no un archivo que sale hacia Finanzas | — |

**Ojo:** este control **todavía no vio ningún archivo real** (§5 de este documento). Cuando lo pruebes,
la ficha y el cruce se prueban de una.

---

### 6 · Rendimiento vs Tabulado — la unidad es el centro de costo, no el legajo

**Qué cambió.** Ganó la solapa Fichas, **una por centro de costo**. A la izquierda, el Tabulado abierto
concepto por concepto con su código; a la derecha, el Reporte de Rendimiento por categoría. Y la lista de
qué conceptos alimentan cada columna salió del encabezado y pasó a una leyenda desplegable arriba de la
planilla.

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| **Las dos tablas de arriba de la ficha** | **Distintas a propósito:** el Tabulado se puede abrir por concepto, el Reporte de Rendimiento sólo informa las categorías ya sumadas | Armar la de la derecha por concepto sería mostrar un desglose que el archivo de origen no tiene |
| Una **corrida vieja** reabierta | La tabla del Tabulado por concepto dice explícitamente que esa corrida no guardó el dato | Si completara con ceros, sería el default silencioso que el proyecto prohíbe |
| La comparación categoría por categoría | Está en la tabla de detalle de abajo, con la diferencia al lado de cada una | — |
| El rótulo de la fila de TOTAL | `TOTAL — N centros de costo` (antes decía "TOTAL GENERAL") | — |

**Número ancla.** Los totales por categoría de tu última corrida, iguales; y la suma de las diferencias de
todas las fichas = la que publica el semáforo.

---

### 7 · EE x CATEG — el corte de "carga masiva" es un criterio inventado

**Qué cambió.** Las tres tablas de diferencias se fundieron en **una planilla** con una fila por caso y una
columna "Qué pasa"; ganó **Fichas** (una tarjeta por legajo: un legajo con tres campos mal aparecía tres
veces y ahora aparece una) y una **cuarta solapa, "Por campo"** (una fila por campo, la peor arriba, con en
cuántos legajos no coincide). Y los campos se llaman en criollo: Puesto, Centro de costo, Departamento.

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| Los conteos del Resumen | **Exactamente los mismos:** activos, en Tabulado, sin Tabulado, sin Rep. Categ. y discrepancias de campo | Si alguno se movió, la migración se comió un caso |
| Una tarjeta de un legajo con dos campos mal | Aparece **una** vez y dice "2 campos no coinciden", con un renglón por campo (rojo el que no coincide, verde el que sí) | Si aparece dos veces volvió el problema que esto vino a resolver; un campo que falta en el renglón es un campo que nadie va a revisar |
| **La conclusión de la ficha** | Dice si el problema parece de ese empleado o de una carga masiva, con el número: "«Puesto» no coincide en 3 de 5 legajos comparados" | Si te dice "carga masiva" para algo que sabés que es de un empleado (o al revés), es el corte sin confirmar de la sección de decisiones |
| El legajo que está en **un solo archivo** | Número grande **"—", nunca 0**, y chip ámbar "Sin comparar" | Un 0 ahí se lee como "está todo bien", que es lo contrario de lo que pasa |
| La planilla | Igual que antes, con las dos distribuciones abajo; **sin bandas ni fila de TOTAL a propósito** (compara textos, no importes) | Un TOTAL ahí sería un número inventado |

**Números ancla.** Los conteos del Resumen, iguales. La cantidad de fichas = discrepancias de campo + sin
Tabulado + sin Rep. Categ. Y el "No coinciden" de "Por campo", sumado a lo largo de los campos, da la
cantidad de filas de campo que tiene la Planilla.

---

### 8 · Variación Conceptos — acá el número grande sí es el neto

**Qué cambió.** Ganó la ficha por legajo: la tira muestra **período anterior → actual → variación**, y
adentro el escalón de la escala cuando el control lo detecta (por ejemplo `100 % → 70 %`, que dice algo que
"bajó $ 16.805,40" no dice).

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| El número grande de la tarjeta | Es el **neto con signo** — a diferencia de NR y Novedades, acá la pregunta es "cuánto se movió", no "cuánto hay que revisar" | Si mostrara el valor absoluto, perderías la dirección del movimiento |
| El orden de la tira | anterior → actual → **variación última**, porque es el residuo y así la resta cierra a la vista | El pedido original decía anterior → variación → actual: si lo preferís así, está en la sección de decisiones |
| El escalón | Sólo aparece cuando el control detectó una escala, con los dos porcentajes | — |
| La barra de Fichas | **No lleva `⬇ Exportar ▾`**: el exportar y el 🖨 Imprimir / PDF ya están arriba de las solapas y valen para las dos | Dos botones de exportar en la misma pantalla es justo lo que el estándar vino a sacar |

---

### 9 · Acreditaciones — Generar Reporte — la unidad es la lista, no el empleado

**Qué cambió.** Ganó la solapa Fichas, **una tarjeta por lista de acreditación** (un legajo con anticipo +
quincena + mensual está en tres listas: sumarlo por legajo sería el bug que este control evita a
propósito). Y el aviso de "grupo sin fecha de acreditación" se movió **arriba de las tres solapas**.

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| La tarjeta cerrada | Número de lista, `código — liquidación` ("1Q — 1era Quincena"), empresa, fecha, cuántas acreditaciones y qué hoja del `.xlsx` es | — |
| Una lista que **no cierra** contra el archivo de Axton | Sale marcada **la lista entera**, no sólo la acreditación puntual con la alerta | Una lista que no cierra y se ve verde salvo una fila se manda al banco igual |
| **El aviso de grupo sin fecha** | Arriba de las tres solapas, con el campo y "Asignar"; y la lista de fechas asignadas a mano con "Deshacer" | Antes vivía adentro de Planilla, y como el control ahora abre en Fichas cuando hay un grupo pendiente, el aviso quedaba invisible justo cuando más importa |
| **El `.xlsx` que va a Finanzas** | Sigue con sus 7 columnas de pago y **ninguna más**: nada de lo que muestra la ficha entra ahí | Finanzas no tiene acceso a los datos de HR; que se filtren por el archivo es el peor error de este control |

---

### 10 · Acumuladores Ganancias (Epiroc) — el piloto del estándar

**Qué cambió.** Migrado de punta a punta: la barra propia con selects sueltos se jubiló, y la ficha vieja
se reemplazó por una que explica **la cascada del SAC teórico paso a paso** (gravado del mes → deducciones
→ base → doceava → SAC teórico) y de dónde sale el residuo cuando la reconciliación del TOTAL no cierra.

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| Los cinco chips | Los mismos cinco, pero **redefinidos**: este control genera, no cruza, así que miden que la reconciliación del TOTAL cierre y que el SAC teórico salga completo. **"Dentro del margen" sale en gris con su 0** | No hay una zona intermedia que tolerar: si apareciera con casos, estaría midiendo otra cosa |
| Un aviso que el control **no clasificó** | Se lee como **"Con diferencia"** | Con el default al revés, un caso que nadie previó saldría en verde sin que nadie lo note |
| El `Orden ▾` de Fichas | **Ordena de verdad.** Se veía y no ordenaba nada | Ver la sección de bugs |

**Recordá que este control sigue trabado por otra cosa** (§9): `calcDoceava` no reconcilia contra la
planilla de Epiroc y hay tres preguntas de criterio sin contestar. La ficha nueva no lo destraba.

---

### 11 · Brutos — Controlar y Generar Reporte

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| Los totales de las dos columnas | Los mismos de tu última corrida | Un total movido es una fila o columna perdida |
| **Lo que sale en rojo** | Sólo lo que supera **tu** monto de diferencia | Antes la tabla medía siempre con $ 0,01: con el monto en $ 100, un legajo de $ 40 salía rojo en la tabla y "sin diferencia" en el resumen de al lado |
| El estado de una fila que compara dos columnas | Es el **peor** de las dos, y "Sin comparar" pesa más que "Dentro del margen" | Una columna que no se pudo comparar nunca se lee como aprobada |
| **Generar Reporte** | Los cinco chips salen en gris y en cero, con un cartel que explica que ese control arma un archivo y no cruza nada | — |
| Los colores de banda | Salen de la paleta de la marca: **desapareció el violeta escrito a mano** | — |

---

### 12 · GS Pers — Controlar y Generar Reporte

Lo mismo que Brutos, más una cosa propia:

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| El rótulo de la fila de TOTAL al filtrar | Dice `TOTAL — N legajos` y **se queda ahí** | Este es el control donde se vio: el "5" de "TOTAL — 5 legajos" se tomaba por un importe y el rótulo se pisaba con la suma de la columna |
| Los totales y los chips | Ídem Brutos | — |

---

### 13 · Rendimiento vs Asiento — perdió dos cosas que quizá usabas

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| **El orden por columna** de la planilla principal | **Ya no está** (clickear el encabezado). Era la única planilla que ordenaba por su cuenta; el `Orden ▾` del estándar es de la solapa Fichas | Si lo usabas, decilo: está en la sección de decisiones |
| **El desglose de la fila de TOTAL** | **Ya no está.** El desglose por celda (click en un importe de CONTA → conceptos y empleados) sigue igual | La fila de TOTAL ahora se reescribe al filtrar, así que un desglose anclado ahí mostraría toda la corrida al lado de un total de tres centros filtrados |
| La tabla chica del mapa de cuentas | **Conserva** su orden por columna: no es la planilla del estándar | — |
| El rótulo de la fila de TOTAL | `TOTAL — N centros de costo` (antes "TOTAL GENERAL"), con los mismos importes | — |

---

### 14 · Rendimiento x EE

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| Los totales de las hasta 6 columnas | Los mismos de tu última corrida | — |
| La lista de qué conceptos alimentan cada columna | En una **leyenda desplegable arriba** de la planilla, no adentro del encabezado | Quince conceptos no entran en un rótulo de banda sin romper el encabezado |
| Rojo y chips | Ídem Brutos: se mide con tu monto | — |

---

### 15 · Variación Sueldos

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| **El rótulo de la segunda banda** | Blanco sobre fondo oscuro. Es la única planilla con **dos** bandas y es donde se vio el problema | Salía celeste sobre blanco: ilegible |
| Los totales y la fila anterior / actual / variación | Los mismos de antes | — |
| La barra | La estándar: se jubiló la barra propia que tenía | — |

---

### 16 · Variación entre quincenas (POP)

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| **La columna de valor hora** | Es la única columna de importe **sin fila de TOTAL**, a propósito: sumar el valor hora de legajos distintos no da un número que signifique algo | Si esperabas un TOTAL ahí, es un desvío deliberado — está en la sección de decisiones |
| El botón suelto "Imprimir / PDF" | Se jubiló: ahora vive en el menú de exportar | — |
| Los totales del resto | Los mismos de antes | — |

---

### 17 · Importador de Novedades (N1)

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| **El desplegable de "Vista"** | Ya no es un desplegable: son **sub-solapas dentro de Planilla** (el importador, los totales por concepto, lo que quedó afuera, el cruce contra el importador ya armado), cada una con su barra completa | — |
| Los cinco chips | En gris y en cero: este control arma un archivo | — |
| Lo que entra y lo que queda afuera | Antes de descargar sigue mostrando legajos, conceptos y totales, y lo que quedó afuera con su motivo | — |

**Ojo:** este control tampoco vio un archivo real (§4). El layout del importador está deducido de un
relevamiento.

---

### 18 · Control de Netos (Sportline) — está en el §1

Fue la primera implementación de la vista estándar y se hizo antes de la tanda 1, así que su ficha y su
planilla todavía son propias y no las piezas compartidas. Qué mirar está en el **§1** de este documento,
que es además el ítem más urgente de la lista.

---

## 6 ter · Los cuatro bugs de criterio que las tandas encontraron mirando la pantalla

No son bugs que buscara nadie: aparecieron al migrar pantalla por pantalla, y los cuatro daban un número
**mal pero coherente** — que es la clase de error que no detecta ningún test y ninguna persona apurada.
Están arreglados; lo que falta es confirmar en tu corrida que quedaron arreglados **de verdad**.

### 1 · Cada solapa se dibujaba con $ 0,01 y no con tu monto de diferencia

**Qué pasaba.** El monto que configuraste en "Umbrales" se aplicaba al dibujar la pantalla, pero una
solapa se dibuja recién cuando la clickeás, ya afuera de ese momento — y ahí volvía al $ 0,01 de fábrica.
Con el monto en $ 100, un legajo de $ 40 salía **en rojo en la Planilla** y **"sin diferencia" en el tile
del Resumen**, en la misma pantalla, para el mismo legajo.

**Cómo confirmarlo, en dos minutos y sin ningún archivo nuevo.** Poné el monto del cliente en un número
redondo y grande (por ejemplo $ 100), abrí un control que tenga diferencias chicas y **compará el tile del
Resumen contra las celdas rojas de la Planilla**: los dos tienen que contar lo mismo. Después bajá el monto
a $ 0,01 y las celdas rojas tienen que **aumentar**, nunca al revés.

**Número ancla.** La cantidad de casos del chip "Con diferencia" = la cantidad de legajos que el tile del
Resumen dice que hay que revisar, con cualquier monto que pongas. Y el "# Difs" de NR = lo que dice el
Resumen (antes no coincidían, y ése fue el síntoma).

### 2 · La diferencia de NR se calculaba restando los dos totales

**Qué pasaba.** Restar el total del Reporte NR menos el total del Tabulado cuenta **como cero el lado que
falta**. Un legajo con un importe liquidado en un concepto que el Tabulado no informa salía con una
diferencia negativa por ese importe entero, cuando lo que corresponde decir es "esto no se puede
comparar".

**Cómo confirmarlo.** Buscá en la solapa Fichas un legajo cuyo chip diga **"Sin comparar"** o que en la
conclusión mencione un concepto sin contraparte. Abrilo y mirá tres cosas: (a) los dos totales de arriba
siguen siendo cada uno el de su archivo; (b) la diferencia **no** es la resta de esos dos; (c) la
conclusión dice el importe que quedó sin comparar y **de qué lado está**.

**Número ancla.** La diferencia de la ficha tiene que dar la **suma de los renglones que tienen los dos
lados con dato** — se puede verificar a mano con la calculadora sobre la tabla de conceptos de esa misma
tarjeta. Y a nivel control, la diferencia total puede **bajar** respecto de tu corrida vieja, nunca subir.

### 3 · El `Orden ▾` se veía y no ordenaba nada

**Qué pasaba.** El desplegable estaba en la barra de la solapa Fichas y elegir una opción no cambiaba el
orden de las tarjetas. Lo encontraron y arreglaron por separado dos tandas distintas; quedó uno solo.
Afectaba a Acumuladores Ganancias y a todas las fichas que vinieron después.

**Cómo confirmarlo.** En cualquier solapa Fichas: mirá el legajo (o la cuenta, o el centro de costo) de la
**primera tarjeta**, cambiá el `Orden ▾`, y tiene que **cambiar la primera tarjeta**. Y con paginación:
después de ordenar, los "primeros 50" tienen que ser los del orden nuevo, no los del original.

**Número ancla.** Ordenando por mayor diferencia, el número grande de la primera tarjeta tiene que ser el
más alto de todo el control — y ése es un número que ya conocés del tile del Resumen.

### 4 · El buscador no llegaba a una fila lejana

**Qué pasaba.** La paginación armaba la página con el **número de fila original** en vez de con las filas
que pasaron el filtro. Una fila que estaba en la posición 300 del archivo quedaba fuera de la primera
página **aunque fuera la única que hacía match** con lo que buscaste — y el botón "Mostrar todas" además
se escondía, porque miraba el filtro y no la cantidad visible. O sea: **no había forma de llegar a esa
fila desde la pantalla.**

**Cómo confirmarlo.** En una planilla larga (500 legajos o más), buscá algo que sepas que está **al final
del archivo** — un legajo de los últimos, un centro de costo que aparece recién abajo. Tiene que aparecer
en la primera pantalla de resultados, sin tocar nada más.

**Número ancla.** El pie de la planilla ("Mostrando 23 de 514…") tiene que decir un número **igual a la
cantidad de filas que ves**, no menos. Si dice 23 y ves 0, es este bug.

---

## 6 quater · Las decisiones que las tandas tomaron solas y cambian lo que ves en pantalla

Las tandas 2 a 8 se escribieron de madrugada, en paralelo, sin que estuvieras disponible. Todas estas
decisiones **ya están funcionando en la pantalla** y ninguna cambia lo que un control calcula: cambian lo
que muestran, cómo lo rotulan o dónde lo ponen. **Cada una se revierte donde dice, y ninguna se generaliza
hasta que la confirmes.** Marcadas con ★ las dos que más conviene que mires primero.

| Qué decidió | Alternativa descartada | Dónde la ves | Se revierte | D- |
|---|---|---|---|---|
| ★ **El número grande de la tarjeta es "A revisar"** —la suma en valor absoluto de las diferencias que pasan tu monto— **y no el neto** | El neto, que es la resta más intuitiva de leer. Se descartó porque un legajo con +12.000 en un concepto y −12.000 en otro tiene neto cero y **dos conceptos mal**: es exactamente el caso que la ficha existe para mostrar | Fichas de **Control NR** y **Novedades vs Liquidación**. En **Variación Conceptos** el número grande **sí** es el neto con signo, porque ahí la pregunta es "cuánto se movió" | En un lugar por control | D-086 |
| ★ **El corte de "esto es una carga masiva y no un empleado": el campo no coincide en al menos un tercio de los legajos comparados y en por lo menos 3** | Ninguna: **es un criterio inventado, no medido.** El mínimo de 3 está para que "1 de 2" no se lea como carga masiva en un cliente chico; del tercio no hay nada que lo justifique más que el ojo | La conclusión de cada ficha de **EE x CATEG** y el rótulo "Parece una carga masiva" | Son **dos números juntos en un solo lugar**. Con un caso real vas a ver enseguida si está alto o bajo | D-082 |
| **El número grande de la ficha de Agrupadores es la diferencia TOTAL** (la suma en valor absoluto de los agrupadores que pasan el umbral, la que aporta al semáforo), con la **neta** al lado en la tira | Mostrar sólo la neta. Se descartó porque un legajo con dos agrupadores compensados saldría en 0 y esconde el caso a revisar | Fichas de **Cruce por Agrupadores** | En un lugar | D-087 |
| **Un click en un chip ya no te borra lo que tipeaste en el buscador**: el chip filtra adentro de lo buscado | Que el chip limpie la búsqueda, que es como se comportaban las nueve pantallas del lote Axton hasta la integración. Quedó el comportamiento de las otras diez para que las 19 se comporten igual | Las 19 planillas, y se nota sobre todo en **Agrupadores, Variaciones, Acreditaciones, los dos asientos y el Importador** | En un solo lugar | D-088 |
| **EE x CATEG tiene CUATRO solapas y no tres** — se sumó "Por campo" al final | Poner la matriz en el lugar de la Planilla. Se descartó porque la planilla de casos uno por uno ya estaba hecha y sirve, y las dos contestan preguntas distintas (una lista los casos, la otra dice si el campo es un problema de la nómina entera) | **EE x CATEG**. Es la única excepción a las tres solapas iguales en los 21 | La matriz se mete arriba de la Planilla, en la misma solapa | D-082 |
| **`Marcas ▾` quedó a la IZQUIERDA del buscador**, no a la derecha como pide la spec | El orden de la spec. Se copió la posición del piloto para que las 21 pantallas terminen iguales entre sí, que es el objetivo real | Las 21 pantallas | En un lugar por pieza | D-081 |
| **Los tres "Generar Reporte" (Brutos, GS Pers, NR) muestran los cinco chips en gris y en cero**, con un cartel que explica que arman un archivo y no cruzan nada | No mostrarlos. Se descartó porque esconderlos vuelve a mover los demás elementos de la barra de lugar, que es lo que el estándar vino a evitar | Los tres modos "Generar Reporte", y el **Importador de Novedades** | — | D-078 |
| **Rendimiento vs Asiento perdió el orden por columna** (clickear el encabezado) **y el desglose que colgaba de la fila de TOTAL** | Conservarlos. El orden por columna es de la solapa Fichas en el estándar, y un desglose anclado al TOTAL mostraría toda la corrida al lado de un total filtrado | **Rendimiento vs Asiento**. El desglose por celda sigue igual | El orden vuelve con la ficha del control | D-078 |
| **Una cuenta sin código se lee "Sin comparar" (ámbar) y no "Con diferencia" (rojo)** | Dejarla en rojo. No hay ninguna diferencia de importe: el balance cierra, lo que falta es el Reporte de Cuentas de Redefinición del cliente | Las dos solapas de la **Contabilidad Desglosada** | En una línea | D-085 |
| **El aviso de "grupo sin fecha de acreditación" se ve arriba de las tres solapas** | Dejarlo dentro de Planilla y replicarlo en Fichas. Se descartó por duplicar la misma información en dos lugares que se pueden desincronizar | **Acreditaciones**. Un grupo pendiente bloquea el export, así que resolverlo no puede depender de en qué solapa estés | — | D-083 |
| **En un control que genera en vez de cruzar, los chips se redefinen sobre lo que ese control sí verifica, y "Dentro del margen" sale en gris con su 0** | Que "Dentro del margen" cuente algo. No hay zona intermedia que tolerar cuando no hay dos archivos que comparar | **Acumuladores Ganancias** | — | D-077 |
| **Un aviso que el control no clasificó se lee "Con diferencia"** y no "está bien" | El default al revés. Con ése, un caso que nadie previó saldría en verde sin que nadie lo note | **Acumuladores Ganancias** | — | D-077 |
| **El orden de la tira es anterior → actual → variación**, con la variación última | El orden del pedido original (anterior → variación → actual). La variación queda última porque es el residuo y así la resta cierra a la vista, igual que en las otras dos fichas de esa tanda | **Variación Conceptos** | — | D-086 |
| **La ficha de Agrupadores no lleva las dos tablas de "cómo debería ser / cómo salió"** | Incluirlas con un renglón cada una. Se descartó por redundante: los dos lados ya son dos columnas del detalle por agrupador de abajo. **Si te sirven igual como ancla visual, se agregan** | **Cruce por Agrupadores** | — | D-087 |
| **Las dos tablas de la ficha de Rendimiento vs Tabulado son asimétricas** — el Tabulado por concepto, el Reporte por categoría | Armar la de la derecha también por concepto, repitiendo totales. Se descartó porque el Reporte de Rendimiento no informa por concepto: sería mostrar un desglose que el archivo no tiene | **Rendimiento vs Tabulado** | — | D-087 |
| **El valor hora es la única columna de importe sin fila de TOTAL** | Ponerle TOTAL. Sumar el valor hora de legajos distintos no da un número que signifique algo | **Variación entre quincenas (POP)** | — | D-081 |
| **Las cuentas y centros sin clasificar entran como ficha propia**, en "Sin comparar" y con saldo "—" | Dejarlos sólo en el Resumen. Así hay exactamente una ficha por cada unidad que cuenta el semáforo | **Asiento de Remuneraciones (FINADIET)** | — | D-084 |
| **La ficha de Novedades muestra el bruto y la unidad organizativa** del legajo | Aplicarle la restricción de "sólo lo necesario para pagar". No corresponde: es la pantalla del analista de Payroll, no un archivo que sale hacia Finanzas | **Novedades vs Liquidación** | — | D-086 |
| **El legajo cuyas novedades son todas conceptos "no llega a la liquidación" cae en ámbar**, aunque el semáforo lo deje afuera del numerador | Rojo. El chip dice cómo cerró el caso, el semáforo dice si hay que revisarlo — no es una contradicción, y la ficha lo aclara | **Novedades vs Liquidación** | — | D-086 |
| **La barra de Fichas de Variación Conceptos no lleva `⬇ Exportar ▾`** | Sumarlo. Ese control ya tiene el exportar y el 🖨 Imprimir / PDF arriba de las solapas: serían dos botones de exportar en la misma pantalla | **Variación Conceptos** | — | D-086 |
| **Los campos se llaman en criollo** (Puesto, Centro de costo, Departamento) y la columna nueva de la planilla se llama **"Qué pasa"** | PUESTO / CENTRO_COSTO / DEPTO, como venían | **EE x CATEG**, en las cuatro solapas | — | D-078, D-082 |

---

## 7 · Detector de formato del Tabulado (pieza T)

**Qué es.** Reconocer, por la firma del archivo, si un Tabulado es Meta4 horizontal, Axton completo,
Axton sólo-importe, o si en realidad es el reporte "Totales de Concepto" y no un Tabulado.

**Punto.** Construido y testeado. **Ningún control lo llama todavía**, así que no hay casi nada que
probar. La única cosa observable hoy, y es una prueba de treinta segundos:

**Subí el "Totales de Concepto" en el casillero del Tabulado.** Antes eso pasaba y daba resultados
raros. Ahora tiene que **cortar explicando qué archivo es y qué esperaba**. Vale la pena verlo una
vez, porque es exactamente el error que un analista apurado comete.

**Detalle:** `specs/lector-tabulado-formatos.md`, D-065.

---

## 8 · Variación entre quincenas / entre períodos (POP y OPmobility Florida)

### Lo nuevo sin probar: el PDF

Se le sacó la leyenda de marca H&A al PDF y ahora **imprime directo** (sin el paso intermedio).
Prueba corta: generá el reporte, dale imprimir, y mirá la vista previa. Que no quede la leyenda, que
no se corte una columna al borde de la hoja, y que la orientación sea la que sirve.

### Lo que sigue pendiente de antes

- **POP:** el control cierra contra el reporte real de Axton de julio 2026 (203 legajos comparados,
  194 coinciden, 9 con diferencias, todas explicadas). Cuatro de esas nueve son legajos donde Axton
  muestra el valor hora de la ficha del empleado, **dato que el Tabulado no trae**: hay que pedirle al
  analista un archivo que lo tenga. Hasta entonces esas cuatro no se pueden cerrar.
- **OPmobility Florida:** el concepto de los mensuales está programado y **nunca corrió con datos**,
  porque en los dos Tabulados de muestra los 71 empleados liquidan por otro concepto. Necesitás un
  Tabulado que **tenga** mensuales. Riesgo bajo: la lógica suma sola cuando el concepto exista.
- **OPmobility Florida:** cerrar **con el cliente** qué quincena se compara contra cuál. No es un
  archivo, es una respuesta. Es lo que traba el "subir un solo archivo por mes". Hoy la app compara
  los dos que subís y el reporte dice exactamente qué comparó — que es lo correcto mientras la regla
  no esté cerrada.
- Le faltan pantallas: el editor de conceptos y de ausencias, y reusar la corrida anterior.

**Detalle:** `specs/control-variacion-quincenas-pop.md` §7, `specs/reporte-variaciones-opmobility.md`.

---

## 9 · Acumuladores Ganancias (Epiroc) — trabado, y no por falta de archivo

**Qué es.** Verificar el SAC teórico calculado por la app contra la columna "SAC TEORICO" de la
planilla manual de Epiroc.

**Punto.** **No reconcilia**, y eso ya está reconstruido desde el crudo de 05/2026. Antes de tocar
una línea hay **tres preguntas de criterio que sólo vos podés contestar**:

1. ¿El concepto `1101` entra en la doceava?
2. ¿El `1137` se resta?
3. ¿El `1103` va en el juego base de acumuladores?

**No se toca la fórmula antes de que las contestes**, y con razón: ante una diferencia, el armado
manual **no** es la fuente de verdad (D-064). Ajustar el código hasta que dé lo mismo que la planilla
es exactamente cómo se entierra un error de criterio.

Epiroc reemplazó a POP como cliente de prueba porque es el único Axton con serie mensual completa
(04 a 07/2026).

**Detalle:** D-063, D-064.

---

## 10 · NR (Marval) — 8 conceptos sin código confirmado

8 de los 18 conceptos de NR no tienen código sembrado porque **no se liquidaron en el mes de
muestra**. Se piden a mano en el Paso 2 y el toggle ⊘ los saltea. No se inventan por analogía.

**Se destraba con:** un Tabulado de un mes **con indemnizaciones liquidadas**. Riesgo bajo mientras
tanto.

**Detalle:** D-039.

---

## 11 · Lo que NO deja nada para probar (para que no lo busques)

Varios de los PRs recientes son documentación o andamiaje interno. **Ninguno cambia lo que ves en la
app**, así que no hay nada que abrir:

- **Los datos de prueba pasaron a ser jugadores de Banfield** — cambia sólo lo que dicen los tests y
  los dos ejemplos de nombre de la app. Si ves "SANGUINETTI JAVIER" en un placeholder, es esto.
- **El gate de mockup antes de construir un control** — regla de proceso para las próximas veces.
- **La vista estándar de resultados** — las ocho tandas ya están integradas a `main` (§6 bis). No
  queda ninguna sin código: lo único pendiente es que la mires pantalla por pantalla. Que se hicieron
  en ocho tandas y en qué orden ya no hace falta saberlo para probarlas.
- **El runbook del orquestador y los prompts por tanda** — cómo se van a repartir los ocho chats.
- **Los agentes nuevos** (documentalista, inspector-archivo) y el chequeo de datos sensibles antes de
  commitear — herramientas de trabajo, no app.
- **Asiento de FINADIET** — postergado por decisión tuya (D-062). Sigue construido y disponible. Al
  retomar, la primera pregunta es cuál es el archivo de entrada real: el de cierre que hay en
  SharePoint no tiene el layout que pide el parser.
- **Tasa de Provisiones** — todavía **no está implementado**. Su eval manual (que marque exactamente
  los dos legajos del análisis previo y ninguno más) es parte de su condición de salida, no una deuda.

---

## Antes de empezar: cómo levantar la app

En tu máquina es directo, se sirve estática y las librerías vienen por CDN. **En una sesión remota
de Claude no**: la red bloquea `unpkg.com` y `cdn.sheetjs.com`, y por eso hay cosas —las descargas de
Excel, sobre todo— que sólo se pueden probar del lado tuyo. Si alguna vez ves la app arrancar en
blanco en un entorno raro, es eso y no un bug.

## Cómo registrar lo que probaste

Cada ítem que cierres, decilo con el resultado, no sólo con un "OK": qué archivo usaste, qué
período, y el número que te dio. Con eso el ítem sale de esta lista y, si el número no era el
esperado, queda el rastro de contra qué se comparó. La skill `pruebas-pendientes` regenera este
documento y mueve lo cerrado.

## Tres decisiones tuyas que arrastramos y no son pruebas

1. **Las fechas inventadas** (en GS Pers, NR y Categorías x Empleados): qué mostrar cuando un número
   no es una fecha creíble — vacío, el número crudo, o un aviso en la fila. El rango correcto ya está
   programado y probado; falta sólo tu criterio.
2. **Dónde viven los códigos de concepto por defecto de Tasa de Provisiones**: en el módulo (como
   hace hoy Rendimiento vs Asiento) o vacíos y cargados por cliente vía el seed. La segunda es más
   consistente con tu instrucción de privacidad pero obliga al analista a cargarlos la primera vez.
3. **Los títulos de página salen en celeste** y los screenshots del rediseño los muestran en ink. Es
   igual en los tres temas, así que no es una deriva de tema; cambiarlo mueve todas las pantallas.
