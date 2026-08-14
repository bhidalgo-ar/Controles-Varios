# Traspaso de controles armados por el equipo

Cómo pasar al repo un control que un analista prototipó en Claude Chat como HTML standalone.

**Para quién:** los analistas de Payroll que diseñan controles en Claude Chat (Meli, Gaby y quien se
sume), y quien después lo integra acá con Claude Code.

---

## Por qué esto existe

El equipo arma controles en Claude Chat: le explican el cruce, suben el archivo del cliente y Claude
les devuelve un HTML de una sola página que corre en el navegador. Eso está bien y no hay que
cambiarlo — es lo que permite ver el control funcionando contra un archivo real el mismo día, que es
justo lo que la app no puede hacer sin que alguien la integre primero.

El problema no es el formato del prototipo: es que **el conocimiento de nómina que se validó en ese
chat se queda en el chat**. Cuando el prototipo llega acá, lo que hace falta no es su código —el repo
es ES modules, con parsers, registry, contratos de export y tests, y de todos modos se reescribe— sino
las decisiones que hay detrás: contra qué se cruza, con qué encabezados exactos, qué concepto es cuál,
con qué signo, para qué clientes. Sin eso, integrarlo es adivinar, y un control construido sobre una
suposición se descubre recién cuando ya salió al cliente.

Ya pasó bien una vez: el reporte de Variación de Conceptos de OPmobility (POF) se diseñó como HTML
standalone y después se integró. Las diferencias entre las dos versiones están anotadas en
`specs/reporte-variaciones-opmobility.md` §8 — ése es el modelo.

## La recomendación, en una línea

**Las dos cosas, pero el que rinde es el de arranque.** Que el prototipo salga con una **Ficha de
traspaso** al final, y con las cuatro reglas de nómina bien desde el minuto uno. Lo de cierre es la
red para los controles que ya están armados (que son varios).

- **Prompt A — al arrancar.** Lo pega el analista *antes* de describir el control. No cambia el
  entregable (sigue siendo un HTML de una página) pero fija las reglas que dan números correctos y
  pide la ficha al final.
- **Prompt B — al terminar, o sobre uno ya hecho.** Le pide a Claude que escriba la ficha a partir del
  prototipo que ya funciona. Es lo que hay que usar con los controles que ya están armados.
- **Prompt C — de nuestro lado.** Lo que se pega en Claude Code, en el repo, junto con la ficha.

La ficha no es burocracia: son exactamente las **cinco cosas que el skill `nuevo-control` manda a
preguntar antes de escribir código**. Si vienen escritas, la integración es media hora; si no, son dos
idas y vueltas por chat con el analista que quizás ya no tiene el archivo a mano.

---

## Prompt A — para pegar al empezar en Claude Chat

```
Vamos a diseñar un control de nómina argentina. Sos parte del equipo de Payroll de H&A
(estudio de payroll): yo soy analista, no programador — explicame todo en términos de lo
que se ve en pantalla o en el archivo, nunca en términos de código.

ENTREGABLE
Un HTML standalone de una sola página, que abra con doble clic y corra entero en mi
navegador (los datos no salen de ahí). Podés usar SheetJS por CDN para leer los .xlsx.
No me pidas instalar nada.

CÓMO TRABAJAR
Preguntá antes de suponer. Si no sabés qué encabezado trae un archivo, contra qué se cruza
una columna o qué concepto es cuál, pará y preguntámelo: no lo adivines. Mostrame algo
funcionando temprano y después lo ajustamos.

LAS CUATRO REGLAS QUE DAN NÚMEROS CORRECTOS
Estas cuatro salieron de bugs reales que costaron caro. No son preferencias de estilo:

1. Consolidar por legajo, de los DOS lados del cruce, siempre que se cruce contra el
   Tabulado. El Tabulado trae una fila POR LIQUIDACIÓN, no por empleado: un legajo con la
   mensual y la baja del mismo mes aparece dos veces. El reporte normalmente informa el
   total ya sumado. Si al leer el Tabulado la última fila del legajo pisa a las anteriores
   en vez de sumarse, salen diferencias falsas en TODOS los empleados con doble paga. Los
   datos de ficha (nombre, centro de costo, fechas) se toman de la última liquidación; los
   importes se SUMAN. Y los dos lados tienen que armar la clave del legajo igual: por
   default '007' y '7' son el mismo empleado.

2. "Sin dato" no es "cero". Si una columna no está o ninguna liquidación trajo valor, eso
   es SIN DATO y se muestra como "—". Cero es un valor: hay dato y vale cero. La diferencia
   se calcula sólo si los dos lados tienen dato, y se compara con tolerancia de 0,01 — los
   números que vienen de Excel no dan igualdad exacta.

3. Nada completado con 0,00 en silencio. Si el control no puede resolver una columna o un
   concepto, me lo pide en pantalla o sale como aviso en el resultado. Un número mal pero
   coherente no lo detecta nadie. Que un concepto no se haya liquidado ese mes SÍ es un
   resultado válido y se informa; lo que no puede pasar es que no haya forma de resolverlo
   y el control siga como si nada.

4. Los conceptos se buscan por CÓDIGO, no por nombre. El Tabulado trae '4899-COCHERA_IG' y
   '8805-DTO_COCHERA': buscar el texto "COCHERA" agarra el equivocado.

DÓNDE AVISAR Y DÓNDE TRABAR
Un aviso avisa, no traba: si el archivo no parece el correcto o una columna trae algo raro,
decímelo y dejame seguir. Trabar es sólo para lo que hace que el resultado no exista.

ENTREGABLE QUE VIAJA AL REPO (importante)
Cuando el control ya funcione contra el archivo real, además del HTML escribime una
"FICHA DE TRASPASO" en un bloque de texto aparte, con estos títulos y nada más:

  1. QUÉ CONTROLA — dos oraciones. Qué compara y qué encuentra cuando algo no cierra.
  2. CLIENTE Y SISTEMA — nombre del cliente y si el archivo sale de Meta4 o de Axton.
     Si el control serviría igual para cualquier cliente de ese sistema, decilo.
  3. ARCHIVOS DE ENTRADA — uno por uno: qué reporte es, de dónde se baja, formato
     (.xlsx / .html / .csv), en qué fila están los encabezados, en qué fila arrancan los
     datos, si hay filas de subtotal o separadores que haya que descartar, y si la última
     fila es un TOTAL GENERAL que sirva de control.
  4. ENCABEZADOS EXACTOS — la lista literal de encabezados de cada archivo, como está
     escrita en el archivo (con guiones, mayúsculas y códigos incluidos). Los nombres de
     las columnas, NO su contenido.
  5. QUÉ SE COMPARA CONTRA QUÉ — fila por fila: este concepto de acá contra ese de allá, y
     el signo de la diferencia (¿Tabulado menos Reporte, o al revés?).
  6. CÓDIGOS DE CONCEPTO — los códigos que usaste y de qué cliente los confirmaste. Marcá
     los que asumiste sin ver el archivo: ésos no se pueden dar por buenos.
  7. LA UNIDAD DEL RESULTADO — qué se cuenta cuando se dice "23 con diferencia": legajos,
     centros de costo, listas de pago, líneas de asiento.
  8. REGLAS DE NEGOCIO Y CASOS BORDE — todo lo que decidimos en la conversación y no se
     deduce mirando el archivo: qué se excluye, qué se redondea, qué pasa si falta un dato,
     qué tolerancia se aceptó y por qué.
  9. QUÉ SALE COMO ARCHIVO, Y QUIÉN LO RECIBE — si el resultado se baja como Excel: qué
     columnas lleva y si lo recibe el equipo de Payroll o Finanzas del cliente. Es
     importante: a Finanzas va sólo lo necesario para pagar (legajo, nombre, CUIT, CBU,
     banco, importe, fecha) y nada de dotación, altas y bajas ni atributos del empleado.
 10. VERIFICADO CONTRA — qué archivo real y de qué período, y los totales que dieron bien
     (montos globales del período, no datos de empleados).

En la ficha NO pongas legajos, nombres, CUIT, CBU ni importes de empleados: la ficha se
guarda en nuestro repositorio de trabajo. Encabezados, códigos de concepto y totales del
período sí van.
```

## Prompt B — para un control ya armado

```
Este control ya funciona (el HTML de arriba, probado contra el archivo real). Ahora lo
vamos a integrar en nuestra herramienta interna, y para eso necesito que escribas una FICHA
DE TRASPASO: lo que hay que saber para reconstruirlo, sin tener que leer el código.

Escribila con estos títulos, y en cada uno poné lo que efectivamente hace el prototipo (no
lo que sería ideal):

[pegar acá los 10 puntos de la FICHA DE TRASPASO del Prompt A]

Tres cosas más, y son las que más me importan:

- Marcá con "ASUMIDO" todo lo que no confirmamos contra el archivo real: un código de
  concepto que dedujiste por el nombre, una columna que supusiste, una regla que inferiste
  de un solo caso. Es la parte que hay que revisar antes de que esto salga a un cliente.
- Decime si el prototipo, al leer el Tabulado, SUMA las liquidaciones de un mismo legajo o
  si la última pisa a las anteriores. Un legajo con la mensual y la baja del mismo mes
  aparece dos veces, y si se pisa en vez de sumar salen diferencias falsas en todos los
  empleados con doble paga. Si se pisa, decilo — no lo arregles, lo arreglamos al integrar.
- Decime qué hace cuando falta un dato: ¿lo muestra como "—" o lo cuenta como 0,00? Si lo
  cuenta como cero, avisame, porque cambia el resultado.

En la ficha no pongas legajos, nombres, CUIT, CBU ni importes de empleados. Encabezados,
códigos de concepto y totales del período sí.
```

## Prompt C — de nuestro lado, en el repo

```
Agregar el control [nombre] a Controles Nómina. Lo prototipó [quién] en Claude Chat como
HTML standalone y ya corre contra el archivo real del cliente; su ficha de traspaso está
abajo. Usá el skill `nuevo-control`.

El HTML standalone es referencia de comportamiento, no código para copiar: reconstruilo con
los patrones del repo (parser, ficha en fileTypes.js, módulo, registry, test).

Antes de escribir código, decime cuáles de los 5 puntos que el skill manda a preguntar NO
quedan resueltos por la ficha, y qué está marcado como ASUMIDO ahí. Eso lo confirmo yo
antes de que arranques.

--- FICHA DE TRASPASO ---
[pegar]
```

---

## Lo que igual queda de nuestro lado

La ficha ahorra el relevamiento, no la integración. Lo que no viaja en ninguna ficha:

- **Los 5 puntos de integración** del skill `nuevo-control` (parser, ficha del tipo de archivo, módulo,
  registry, test) más el test sumado a la cadena de `package.json`.
- **El contrato de export** (`js/exports/contracts.js`), si el control genera un archivo con layout fijo.
- **Correrlo en el navegador contra el archivo real**, en los tres temas. Un control que nunca vio un
  archivo real no está verificado, y el prototipo del analista **no cuenta como esa verificación**: son
  dos programas distintos y pueden diferir. Lo que sí sirve —y mucho— es que el prototipo dejó los
  totales del período anotados: son el número contra el cual comparar.

## Privacidad

En el chat del analista el archivo real del cliente entra: es lo que permite validar el control, y esos
archivos no salen del chat ni se suben acá. La **ficha** es otra cosa: se guarda en el repo, así que
lleva encabezados, códigos de concepto y totales del período, y no lleva legajos, nombres, CUIT, CBU ni
importes de empleados. Mismo criterio que el resto del proyecto (`CLAUDE.md` § Privacidad): los tests
usan datos inventados y un export de cliente no entra al repo, ni como fixture.

Si el prototipo va a quedar como entregable con identidad H&A (un HTML que se le muestra al cliente),
aplicá el skill `hya-brand`.
