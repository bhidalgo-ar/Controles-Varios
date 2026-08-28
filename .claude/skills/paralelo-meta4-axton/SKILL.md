---
name: paralelo-meta4-axton
description: Cruzar un paralelo de liquidación entre dos sistemas de payroll — el Tabulado de Meta4 (más el PDF de la liqui como ancla) contra el Tabulado de Axton — empleado por empleado y concepto por concepto según una tabla de equivalencias de códigos, y emitir el Excel de diferencias con el detalle de en qué concepto está cada peso. Usar SIEMPRE que el pedido sea "cruzar el paralelo de [cliente]", "volvé a cruzar", "el tabulado de Axton contra el de Meta4", "verificar que Axton dé el mismo neto", "corregí las diferencias, cruzá de nuevo", o cuando lleguen juntos un tabulado de Meta4, un PDF de liquidación y un tabulado de Axton del mismo período. También aplica a las vueltas siguientes del mismo paralelo, que son la mayoría del trabajo: el analista corrige el sistema nuevo y vuelve a subir el archivo varias veces hasta que cierre. NO usar para cruzar un reporte contra el Tabulado dentro de la app (eso es un control del registry, ver la skill nuevo-control), ni para paralelos donde no exista tabla de equivalencias de códigos.
---

# Paralelo Meta4 → Axton

Un paralelo es la misma quincena liquidada en los dos sistemas a la vez: el que ya está
andando (Meta4) y el que se está implementando (Axton). El objetivo del cliente es uno solo:
**que el tabulado de Axton dé el mismo neto que el de Meta4, empleado por empleado.**

El trabajo del analista es encontrar dónde no coincide y con qué concepto se explica, para que
el implementador lo corrija. Después vuelve a mandar el archivo y se cruza otra vez. Eso pasa
tres, cuatro, cinco veces: **la mayoría de las corridas son la segunda vuelta y las
siguientes**, no la primera.

## Los cuatro archivos

| Archivo | Qué es | Para qué |
|---|---|---|
| Tabulado de Meta4 (`tabulado_h.xlsx`) | Export horizontal, una fila por liquidación | El lado correcto |
| PDF "Control de liquidación" de Meta4 | Una ficha por liquidación + total general | **El ancla**: prueba que el Excel es el del período |
| Tabulado de Axton (`.xls`, en realidad HTML) | "Resumen de Liquidación" | El lado que se controla |
| Tabla de equivalencias (`.xlsx`) | 3 columnas: código Axton, código Meta4, nombre | Qué concepto es cuál |
| Control de cargas sociales de Meta4 (`.xlsx`) | Una fila por liquidación, columnas por **nombre** | Las contribuciones patronales (opcional) |

Si falta el PDF se puede correr igual, pero decilo: sin el ancla no hay forma de probar que el
Excel de Meta4 es del período y del tipo de liquidación correctos, y un cruce sobre el archivo
equivocado devuelve números coherentes y falsos, que es el error que nadie detecta.

## Cómo correrlo

Los scripts están en `scripts/` y necesitan tres librerías de Python:

```bash
pip install openpyxl lxml pymupdf
```

```bash
python3 .claude/skills/paralelo-meta4-axton/scripts/paralelo.py \
  --config .claude/skills/paralelo-meta4-axton/config/opmobility-florida.json \
  --meta4 tabulado_h.xlsx \
  --pdf OP_1er_Quincena_082026.pdf \
  --axton Tabulado_AXTON.xls \
  --equivalencias equivalencias_conceptos.xlsx \
  --periodo "1ra Quincena Agosto 2026" \
  --salida FLORIDA_paralelo_1raQ_082026.xlsx
```

`--cargas control_de_cargas.xlsx` suma el cruce de las **contribuciones patronales** y una
hoja aparte en el Excel — ver más abajo. `--sin-excel` corre sólo las validaciones y el resumen por consola: es lo que conviene en la
primera pasada de un cliente nuevo, mientras se acomoda el config. `--ruido` cambia el umbral
de comentario (default `$1`). `--forzar` sigue aunque las validaciones fallen — usalo sólo
sabiendo qué se pierde, y decíselo al analista.

## El orden del trabajo, que no es decorativo

**1. Validar cada archivo contra sí mismo.** En Meta4, Haberes − Descuentos tiene que dar el
NETO en **todas** las filas. En Axton, Bruto − Retenciones + Exento tiene que dar el Neto en
todas. Si no cierra, la clasificación de conceptos del config está mal y el cruce va a repartir
la diferencia entre conceptos que están bien. El script corta solo y dice qué fila falló.

**2. Anclar contra el PDF.** El neto del Excel de Meta4, consolidado por legajo, tiene que
reproducir el "Total Netos" de cada ficha del PDF y el total general. Si eso no da, no se cruza
nada.

**3. Recién ahí comparar**, y verificar que **la diferencia de neto de cada legajo se
descomponga sin resto** en la suma de sus conceptos. Si queda resto, hay un concepto afuera del
mapeo: casi siempre un código nuevo que Axton estrenó y hay que declarar. El script lo cuenta y
lo dice.

Esos tres chequeos son lo que hace que el Excel se pueda firmar. Sin ellos el resultado puede
estar mal y coherente al mismo tiempo.

## Las reglas que cuestan plata si no se saben

**Consolidar por legajo los dos lados.** El Tabulado trae una fila **por liquidación**, no por
empleado: un legajo con la quincena y un ajuste del mismo mes aparece dos veces, y el PDF
también le hace dos fichas. Si se pisa en vez de sumar, salen diferencias falsas en todos los
que tuvieron doble paga. Es el bug más caro del repo (ver `CLAUDE.md`) y en este paralelo
apareció el primer día.

**`null` no es `0`.** Una celda vacía significa "el concepto no se liquidó"; un 0 significa
"se liquidó y dio cero". Pero atención al matiz que evita cientos de líneas de ruido: Meta4
escribe **0,00 en todas las columnas de todos los empleados** y Axton deja la celda vacía, así
que "0 contra sin dato" es coincidencia, no diferencia. Lo que sí es un hallazgo es un importe
contra una celda vacía.

**Buscar por código, nunca por nombre.** Los nombres no coinciden entre sistemas ni siquiera
para el mismo concepto: en un caso real el mismo código se llamaba `GUARD_100_DIA` en Meta4 y
"Premio Productividad" en Axton. Y las etiquetas de Axton cambian de una vuelta a la otra sin
que cambie el código.

**Los aportes son consecuencia, no causa.** Jubilación, Ley 19032, Obra Social y sindicato se
calculan sobre la base: si un haber está mal, los cuatro salen mal solos. Al contar el
resultado hay que decirlo, porque si no el analista sale a buscar cuatro errores que no
existen.

**Las diferencias de menos de $1 no llevan comentario.** Son centavos de redondeo. Comentarlas
ensucia el archivo y hace que el analista deje de leer la columna que importa. Se ven en la
columna de diferencia con la etiqueta "Difiere $1 o menos", y ahí termina.

## Las contribuciones patronales

Van por `--cargas` y salen en su propia hoja, porque **no se leen como el resto**: una
contribución se calcula sobre la base, así que casi nunca es un error propio. Cada diferencia
sale clasificada por su causa, y esa columna es lo único que hay que leer:

| De dónde viene | Qué significa | Qué hacer |
|---|---|---|
| **Remuneración** | La base de contribuciones difiere y el neto del legajo también | Nada: se cierra sola cuando se corrija el haber |
| **Base** | El neto coincide pero la base no | Un concepto que un sistema toma para contribuir y el otro no. Es un hallazgo |
| **Contribución** | La base coincide en los dos | Alícuota, tope o detracción. Es el hallazgo más puro |
| **Redondeo** | Centavos | Nada |

**Lo que decide la clasificación es la base, no el neto.** Un legajo puede tener el neto
distinto por Ganancias sin que se mueva un peso de la base: ahí arreglar el neto no cierra la
contribución, y decir "es consecuencia" manda al implementador a buscar donde no está. Costó
una pasada: la primera versión clasificaba por el neto y mandaba a "Remuneración" cuatro líneas
que eran de alícuota.

Cuando la causa es **Contribución**, el comentario dice además **a qué porcentaje de la base
contribuye cada sistema**. Es lo que separa de un vistazo una alícuota distinta (los dos
porcentajes casi iguales, diferencia de pesos) de una base armada distinta puertas adentro (uno
de los dos se va lejos: 14,62 % contra 10,76 % en un caso real fue Meta4 contribuyendo sin
descontar las vacaciones).

**El archivo de cargas tiene su propia ancla**: sus columnas de aportes del empleado
(`TOT_JUB`, `TOT_LEY`, `TOT_OS`) tienen que dar idénticas a los conceptos del Tabulado. Si no,
los dos archivos son de corridas distintas y el script corta: se declara en `aportesDeControl`
del config.

## Cuando aparece un código nuevo

Es lo más frecuente entre una vuelta y la siguiente: el implementador arregla un concepto y lo
liquida en una columna que la tabla de equivalencias no declara. Se ve así — el concepto de
Meta4 sale como "falta en Axton" y del otro lado aparece plata en un código sin equivalencia,
casi siempre por el mismo importe.

No lo empareges en silencio. El camino es:

1. Verificar que el importe del código nuevo reproduzca el de Meta4, legajo por legajo.
2. Declararlo en `mapeosDeclarados` del config del cliente (la clave es el código que declara
   la tabla; la lista, los que Axton usa de verdad).
3. Que salga listado en la hoja "Sin comparar" del Excel y **decírselo al analista** para que
   corrija la tabla de equivalencias, que es el documento del cliente.

Si el código nuevo es una retención o un exento, además hay que sumarlo a `retenciones` o
`exentos` del config, o la validación 1 no cierra — el script te lo va a decir con la fila
exacta.

## Cómo contar el resultado

Va en el chat, en criollo, y el Excel es el respaldo. En la **primera** vuelta de un paralelo,
antes del veredicto agregado, pasá **un caso completo** — los crudos de los dos lados con el
código de cada concepto, el cruce contra el PDF que prueba que estás en el archivo correcto,
los dos netos y la descomposición de la diferencia — y esperá la confirmación. Es la regla de
`CLAUDE.md` y acá se cumple sola: elegí un legajo que esté en la primera página del PDF, así
el analista lo verifica a mano en el momento.

En las vueltas siguientes ya no hace falta el caso: lo que sirve es **qué se arregló, qué
queda y qué empeoró**, con la tabla de legajos y el motivo de cada uno. Comparar contra la
vuelta anterior es la mitad del valor — y si el archivo nuevo resulta ser el mismo que el
anterior (pasa), decilo en la primera línea en vez de contar de nuevo lo mismo.

Cerrá siempre con las **decisiones que tomaste vos** (los emparejamientos declarados) y las
**preguntas abiertas**, separadas de los hallazgos.

## Los patrones de hallazgo

Un paralelo no falla de mil formas distintas: falla de unas pocas, y cada una tiene una firma
reconocible. **Leé `references/patrones-de-hallazgo.md`** antes de escribir el resumen: está
el catálogo de lo que apareció en el paralelo real, con la firma de cada uno (un factor
constante entre los dos lados, una liquidación que no entró, una cantidad cargada en el lugar
del importe, un padrón de distinto tamaño…). Reconocer el patrón convierte cuatrocientas
diferencias en cuatro causas, que es lo que el implementador puede arreglar.

## Un cliente nuevo

Los formatos exactos de los tres archivos —dónde arranca cada uno, cómo se ubica la fila de
encabezados, qué columnas son de unidades y cuáles de importe— están en
`references/formatos-de-archivo.md`. Para armar el config:

1. Copiá `config/opmobility-florida.json` y cambiale el cliente.
2. Corré con `--sin-excel`. La validación 1 va a fallar y te va a decir qué fila y por cuánto.
3. Acomodá `descuentos` / `noSonConceptos` (Meta4) y `retenciones` / `exentos` (Axton) hasta
   que las dos identidades cierren en el 100% de las filas. El PDF ayuda: su bloque de total
   general lista cada concepto debajo de la columna que le corresponde (REMUNERATIVO,
   DESCUENTOS, NO REMUNERATIVO), así que de ahí sale la clasificación sin adivinar.
4. Recién con las dos identidades en verde, corré el cruce completo.

Los códigos del config son **semilla, no identidad**: si el cliente renumera, se corrige el
config, no el código de los scripts.

## Privacidad

Los archivos del cliente **no entran al repo**, ni como fixture. Trabajalos en el scratchpad de
la sesión y entregá el Excel por chat. En el chat el legajo sí viaja —es lo que le permite al
analista encontrar la fila—, pero nombre, CUIL y CBU no. Y en cualquier cosa que quede escrita
en el repo (una spec, el CHANGELOG, esta skill) el caso se nombra **por lo que le pasa** ("el
legajo con doble quincena"), nunca por su número: el chequeo automático de
`scripts/check-datos-sensibles.mjs` lo frena, y con razón. Los importes sí pueden quedar: son
las anclas que hacen verificable lo escrito.
