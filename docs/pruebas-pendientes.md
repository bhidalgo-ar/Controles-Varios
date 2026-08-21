# Pruebas pendientes de tu lado — auditoría al 2026-08-21

> **Qué es esto.** Todo lo que se construyó y mergeó y que **ninguna persona probó todavía con un
> archivo real**. Agrupado por control o reporte, no por PR: lo que importa es qué pantalla abrís y
> con qué archivo, no en qué rama se escribió.
>
> Reemplaza a la sección "Pruebas pendientes de tu lado, por cliente" de `ROADMAP.md` (que quedó al
> 2026-08-17 y no cubre los 15 PRs que entraron después). Se regenera con la skill
> `pruebas-pendientes`.
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
   pero **nadie abrió nunca los tres Excel que descarga la app**. Es el riesgo más silencioso de la
   lista: un archivo que sale mal formateado no lo detecta ningún test. §2
3. **Novedades N1 + N2 (SIASA / Merz)** — dos controles nuevos, completos y en el registry, que
   **no vieron un solo archivo real**. El layout del importador está deducido de un relevamiento, no
   confirmado. §4 y §5

Y una cuarta que no necesita ningún archivo y se destraba en diez minutos: **las pantallas de la vista
estándar están en dos PR en borrador esperando que las mires** — las diez de la tanda 2 (§6 ter) y la
de EE x CATEG de la tanda 6 (§6 quater, que sale de la rama de la tanda 2). Ninguno de los dos se
mergea hasta entonces, y en ese orden.

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

**Qué es.** Convierte el "Totales de Concepto" de Axton en la desglosada DEBE/HABER, el asiento
agrupado por cuenta y la desglosada con código, y controla que cierre.

**Cómo llegó hasta acá.** Verificado contra los dos archivos reales de COTY de 05/2026: reproduce
**exactas** las cinco anclas del prototipo. La pantalla se recorrió en los tres temas.

### Lo que hay que probar

**Abrir los tres `.xlsx` que descarga la app y compararlos con los del prototipo.** Esto no se pudo
hacer en el entorno de desarrollo porque la librería que arma los Excel viene por CDN y la red la
bloquea. Los cinco números que tienen que aparecer, y que ya se sabe que el cálculo produce bien:

- balance bruto **1.441.239.270,46**
- balance neteado **1.359.204.242,38**
- **273** filas de asiento
- **12** cuentas patrimoniales
- **0** líneas sin código

**Qué mirar en los archivos**, más allá de los números: que los importes salgan como número y no como
texto (si salen como texto, no podés sumarlos en Excel y no se ve a simple vista), que la coma
decimal sea la que espera tu Excel, que los encabezados estén en la primera fila, y que las tres
hojas/archivos tengan el nombre que el contador espera.

### Decisión tuya pendiente

**¿La Contabilidad Desglosada sale del estudio?** Hoy lleva legajo y fecha de ingreso, que son papel
de trabajo del analista. Si el archivo va a Finanzas del cliente, esas dos columnas no pueden ir
(D-020: lo que va a Finanzas lleva sólo lo necesario para pagar). Si se queda adentro, está bien como
está. Nadie puede contestar esto sin vos.

**Detalle:** `specs/conta-desglosada-asiento.md`, D-066.

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

## 6 bis · Vista estándar — tanda 1 y Acumuladores Ganancias

**Qué es.** Las piezas compartidas de la pantalla de resultados (las tres solapas, los cinco chips, el
buscador, `Marcas ▾`, `Orden ▾`, el exportar siempre último) más **Acumuladores Ganancias migrado de
punta a punta** como piloto. Ningún cálculo cambió: la ficha vieja se reemplazó por una que explica la
cascada del SAC teórico paso a paso.

### Qué mirar

- **El scroll horizontal de las planillas anchas.** Estaba declarado a 10 px desde hacía tiempo y el
  navegador lo dibujaba a 2 px igual, porque dos propiedades de CSS lo apagaban sin que nadie lo
  notara. Ahora son 14 px con pista visible. **El navegador de este entorno no lo deja verificar: hay
  que mirarlo en pantalla.** Se ve en las 19 planillas, así que si algo quedó raro, quedó raro en todas.
- **El rótulo de una banda ya no se esconde al scrollear a la derecha** — se queda pegado al borde de
  las columnas congeladas. De paso se arreglaron dos superposiciones de la misma familia: el rótulo de
  la fila de TOTAL tapado por el primer importe, y la banda "Identificación" tapada por la de al lado.
- **Cinco desplegables de otros controles** (Brutos, GS Pers, Control de Netos, NR y Novedades vs
  Liquidación) siguen mostrándose como chips a propósito; los de otros tres (Importador de Novedades,
  Asiento de FINADIET, Contabilidad Desglosada) **vuelven a ser desplegables** porque se mostraban como
  chips por accidente. Ninguno cambia lo que esos controles calculan, pero se ven distinto.

### Dos decisiones que se tomaron sin vos

Están escritas en D-077 y la pantalla ya funciona con ellas, pero es tu criterio el que vale:

1. **Qué significa cada chip en un control que no cruza dos archivos.** Acumuladores genera, no cruza,
   así que los chips se redefinieron sobre lo único que el control sí verifica —que la reconciliación
   del TOTAL cierre y que el SAC teórico salga completo—. **"Dentro del margen" no aplica** y sale en
   gris con su 0: no hay una zona intermedia que tolerar.
2. **Un tipo de aviso que nadie clasificó se lee como "Con diferencia"**, no como que está bien. Con el
   default al revés, un caso que nadie previó saldría en verde sin que nadie lo note.

**Detalle:** `specs/vista-estandar-resultados.md`, D-074, D-076, D-077.

## 6 ter · Vista estándar — tanda 2: las diez pantallas del lote Meta4/Marval

> **Ojo: esto NO está mergeado.** Está en un PR **en borrador** (#181) justamente porque son diez
> pantallas que los analistas abren todos los días y lo que falta es tu mirada. Es el ítem de esta
> lista que más rápido se destraba: no necesita ningún archivo, sólo que abras las pantallas.

**Qué es.** Brutos, GS Pers y Control NR (los tres en sus dos modos: Controlar y Generar Reporte),
Rendimiento vs Tabulado, Rendimiento x EE, Rendimiento vs Asiento y EE x CATEG pasan a la misma barra
y la misma planilla que ya tiene Acumuladores. La solapa que se llamaba «Detalle» en esas diez pasa a
llamarse **«Planilla»**.

**Cómo llegó hasta acá.** Ningún cálculo se tocó. De cada una de las diez pantallas se anotaron, antes
y después, la cantidad de filas y el total de cada columna, y se compararon uno por uno. Se miraron en
un navegador de verdad, en los tres temas, y se disparó la descarga del CSV de cada una. **Pero con
datos inventados**: no hay archivos de cliente en el repo con los cuales llegar a una pantalla de
resultados por el camino del analista, así que la primera vez que estas diez pantallas ven un Tabulado
real vas a ser vos.

### Qué mirar

| Qué | Cómo se ve si está bien | Si está mal |
|---|---|---|
| **Los totales de cada columna** en las diez planillas | **Exactamente los mismos números que antes.** Es lo único que no puede haber cambiado | Si un total se movió, la migración se comió una fila o una columna |
| El renglón de abajo | Dice `TOTAL — N legajos` (o `N centros de costo`), y pasa a `TOTAL de la selección` cuando filtrás | Un total que no cierra con lo que estás mirando |
| Los cinco chips | Las mismas cinco palabras y en el mismo orden en las diez, y **la suma de los cuatro últimos da el primero** | Un caso que no aparece con ningún chip es un caso que nadie va a encontrar |
| **Lo que sale en rojo** | Sólo lo que supera **tu** monto de diferencia. Antes la tabla medía siempre con $ 0,01 aunque el panel dijera otra cosa | Con el monto en $ 100, un legajo de $ 40 salía en rojo en la tabla y "sin diferencia" en el resumen de arriba |
| La base de cálculo abajo de cada título | Dice de dónde sale el número ("la suma de sus conceptos en el Tabulado", "suma de todas las liquidaciones del mes") | Si alguna dice algo que no es, la planilla miente con confianza |
| **EE x CATEG** | Una sola tabla con una fila por caso y una columna "Qué pasa", en vez de las tres de antes. Abajo siguen las dos distribuciones | |
| **Rendimiento vs Asiento** | El desglose de una celda de CONTA (click en el importe) sigue abriendo conceptos y empleados | Se sacó el desglose de la fila de TOTAL y el ordenar clickeando el encabezado: si los usabas, decilo |

**El número ancla.** No hay uno solo: son los totales que ya conocés de tu última corrida de cada
control. La regla es que **tienen que dar igual**. La única excepción prevista es la columna "# Difs"
de NR y la cantidad de celdas en rojo, que ahora se miden con el monto que configuraste y antes se
medían con $ 0,01 — o sea que pueden **bajar**, nunca subir.

### Lo que espera un criterio tuyo

Están en D-078 y la pantalla ya funciona con ellas, pero es tu criterio el que vale:

1. **Los tres "Generar Reporte"** (Brutos, GS Pers, NR) muestran los cinco chips igual, en gris y en
   cero, con un cartelito que explica que ese control arma un archivo y no cruza nada. ¿Preferís que
   ahí no aparezcan?
2. **Rendimiento vs Asiento perdió el ordenar por columna** (clickear el encabezado) y el desglose que
   colgaba de la fila de TOTAL. ¿Los usabas?
3. **El rótulo "Qué pasa"** de la columna nueva de EE x CATEG, y que sus tres listas ahora sean una
   sola tabla.
4. **Qué solapa abre.** Estas diez siguen abriendo en Resumen, no en Planilla, porque el veredicto vive
   adentro de esa solapa. Se cambia cuando cada control tenga su ficha.

**Detalle:** `specs/vista-estandar-resultados.md` (§3, §5, §7, §8 y §9), **D-078**, PR #181.

---

## 6 quater · Vista estándar — tanda 6: la ficha y la matriz "Por campo" de EE x CATEG

> **Ojo: esto NO está mergeado, y encima va segundo.** Está en un PR **en borrador** (#184) que sale
> de la rama de la tanda 2, así que primero entra el #181 y después éste. Como la tanda 2, no necesita
> ningún archivo: sólo que abras la pantalla.

**Qué es.** EE x CATEG suma dos solapas. **Fichas**: una tarjeta por legajo en vez de una fila por
campo que no coincide — hasta ahora un legajo con tres campos mal aparecía tres veces y no lo podías
ver entero. Y **"Por campo"**: una tabla chica con una fila por campo (Puesto, Centro de costo,
Departamento) que dice en cuántos legajos no coincide cada uno, ordenada de peor a mejor.

**Para qué sirve la segunda.** Para contestar de una lo que hoy hay que exportar y contar a mano: si
"Centro de costo" no coincide en 80 de 100 legajos, no hay 80 errores de carga — hay un archivo mal
armado, y revisarlo empleado por empleado es trabajo tirado. La pantalla lo dice con todas las letras
("Parece una carga masiva"), y la conclusión de cada ficha también.

**Cómo llegó hasta acá.** Ningún cálculo ni conteo se movió: el semáforo sigue contando legajos y da
los mismos números. Se miró en un navegador de verdad, en los tres temas, **pero con datos
inventados**: para llegar a esta pantalla por el camino del analista hace falta un reporte de
Categorías y un Tabulado reales, y en el repo no hay ninguno.

### Qué mirar

| Qué | Cómo se ve si está bien | Si está mal |
|---|---|---|
| **Los conteos del Resumen** | **Exactamente los mismos que antes.** Activos, en Tabulado, sin Tabulado, sin Rep. Categ. y discrepancias de campo | Si alguno se movió, la migración se comió un caso |
| La solapa **Fichas** | Una tarjeta **por legajo**. Un legajo con dos campos mal aparece **una** vez y dice "2 campos no coinciden" | Si aparece dos veces, volvió el problema que esto vino a resolver |
| La ficha abierta | Un renglón por campo con el valor de cada lado; el que no coincide, en rojo; el que coincide, en verde | Un campo que falta en el renglón es un campo que nadie va a revisar |
| **La conclusión de la ficha** | Dice si el problema parece de ese empleado o de una carga masiva, con el número: "«Puesto» no coincide en 3 de 5 legajos comparados" | Si te dice "carga masiva" para algo que sabés que es de un empleado (o al revés), es el corte de abajo |
| El legajo que está en **un solo archivo** | Su número grande es **"—", nunca 0**, y el chip ámbar "Sin comparar" | Un 0 ahí se leería como "está todo bien", que es lo contrario de lo que pasa |
| La solapa **"Por campo"** | Tres filas, la peor arriba, cada una con cuántos legajos no coinciden y el % | |
| La solapa **Planilla** | **Igual que en la tanda 2**, con las dos distribuciones abajo. Lo único que cambió: la columna "Campo" dice "Centro de costo" en vez de "CENTRO_COSTO" | |

**El número ancla.** Los conteos del Resumen de tu última corrida de este control: tienen que dar
igual. Y adentro: la cantidad de fichas tiene que ser **discrepancias de campo + sin Tabulado + sin
Rep. Categ.**, y "No coinciden" de la solapa "Por campo", sumado a lo largo de los legajos, tiene que
dar la misma cantidad de filas que tiene la Planilla para los casos de campo.

### Lo que espera un criterio tuyo

Están en D-079 y la pantalla ya funciona con ellas:

1. **El corte de "carga masiva":** hoy un campo se marca así cuando no coincide en **al menos un tercio
   de los legajos comparados y en por lo menos 3**. Es un criterio inventado, no medido. Con un caso
   real vas a ver enseguida si está alto o bajo, y son dos números que se cambian en un lugar.
2. **Este control tiene CUATRO solapas y no tres.** El estándar dice `Resumen · Fichas · Planilla`; acá
   se sumó "Por campo" al final en vez de reemplazar a la Planilla, porque las dos sirven y para distinto.
   Si preferís tres, la matriz se mete arriba de la Planilla, en la misma solapa.
3. **Los campos ahora se llaman en criollo** en toda la pantalla: Puesto, Centro de costo,
   Departamento — antes decía PUESTO, CENTRO_COSTO, DEPTO.

**Detalle:** `specs/vista-estandar-resultados.md` (§2, §7, §8 y §9), **D-079**, PR #184.

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
- **La vista estándar de resultados** — la **tanda 1 ya salió** (§6 bis) y la **tanda 2 está en un PR
  en borrador** esperando tu mirada (§6 ter). Lo que queda sin código son las tandas 3 a 8, o sea los
  otros nueve controles y las fichas.
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
