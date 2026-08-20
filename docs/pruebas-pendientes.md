# Pruebas pendientes de tu lado — auditoría al 2026-08-20

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

1. **Control de Netos (Sportline)** — hay tres arreglos tuyos ya mergeados que nunca viste, y un
   cuarto punto que nadie tocó porque falta que expliques el mecanismo. §1
2. **Contabilidad Desglosada + Asiento (COTY)** — el cálculo cierra al centavo contra el prototipo,
   pero **nadie abrió nunca los tres Excel que descarga la app**. Es el riesgo más silencioso de la
   lista: un archivo que sale mal formateado no lo detecta ningún test. §2
3. **Novedades N1 + N2 (SIASA / Merz)** — dos controles nuevos, completos y en el registry, que
   **no vieron un solo archivo real**. El layout del importador está deducido de un relevamiento, no
   confirmado. §4 y §5

---

## 1 · Control de Netos (Sportline / IFSA)

**Qué es.** Rearma el recibo teórico de cada legajo desde el Tabulado y verifica que el neto
liquidado coincida.

**Cómo llegó hasta acá.** Se construyó y verificó contra el archivo real de IFSA de 05/2026: los
legajos cierran, salvo uno que queda a −1,62 por redondeo acumulado de Meta4. Vos lo probaste y
reportaste cuatro problemas; **tres se arreglaron y ya están mergeados, y no los viste**.

### Lo que hay que probar

| Qué mirar | Cómo se ve si está bien | Si está mal |
|---|---|---|
| El rótulo de la tolerancia | Dice el monto **en pesos** ($100), no "0,01" ni un porcentaje | Volvés a no saber contra qué se está midiendo |
| La columna **Nombre** | Está, al lado del legajo, en la ficha y en la planilla | Tenés que ir a buscar quién es cada uno a otro archivo |
| El rótulo de **Empresa** | Dice "IFSA" (lo que configuraste), no un nombre cableado | Sale el nombre de otra empresa del grupo |
| El **filtro de 4 categorías** | Los cuatro números **suman el total de legajos**. Con tolerancia $100 sobre IFSA 05/2026 tiene que dar: 19 al centavo + 3 dentro del margen + 0 con diferencia = 22 | Si "con diferencia" te muestra el legajo de −1,62 estando la tolerancia en $100, el filtro se quedó midiendo con $0,01 (ése era el bug de fondo del arreglo) |

**Cómo probarlo.** Cliente Sportline → Control de Netos → subís el Tabulado real de IFSA + el archivo
de la escala → tolerancia $100 → correr. Después pasá por las cuatro vistas (Resumen, ficha,
planilla, exportado) y confirmá que el nombre, la empresa y los cuatro números aparecen igual en
todas. **Miralo también en tema oscuro**: el arreglo del ancho de la ficha (D-068) tocó un componente
compartido y conviene ver que ninguna tabla ancha se desarme.

### Lo que está trabado esperándote a vos

- **El acuerdo no remunerativo varía por categoría, y a veces es fijo + porcentaje.** Éste era tu
  cuarto punto y **sigue sin tocarse a propósito**: hasta que no digas cuál es el mecanismo exacto
  (¿qué categorías?, ¿el porcentaje sobre qué base?, ¿el fijo se suma antes o después?), cambiar el
  cálculo sería inventar. Es lo único de este control que puede dar un número mal y coherente, o sea
  del tipo que no detecta nadie.
- **La tolerancia de la comparación con el mes anterior** — hoy el casillero del mes anterior existe
  pero no está definido con qué margen se compara.
- **El legajo a −1,62** — redondeo acumulado de Meta4 en el adicional del mes. Hay que decidir si eso
  se informa como diferencia, se absorbe, o se marca aparte.
- **El calculador de AFA** está pendiente: comparte la fórmula del neto pero corre *antes* de
  liquidar, sobre un Tabulado de prueba. Es otro control, no un ajuste de éste.

**Detalle:** `specs/spec-control-netos.md`, D-067, D-068.

---

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
- **La vista estándar de resultados** — decidida y planificada, con el mapa control por control
  aprobado, **sin una línea de código escrita**. Cuando salga la primera tanda (Acumuladores
  Ganancias como piloto) ahí sí hay pantalla para mirar.
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
