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

## Los tres prompts

- **Prompt A — al arrancar.** Lo pega el analista *antes* de describir el control. No cambia el
  entregable (sigue siendo un HTML de una página) pero fija las reglas que dan números correctos y
  pide la ficha al final.
- **Prompt B — sobre un control ya armado.** Le pide a Claude que escriba la ficha a partir del
  prototipo que ya funciona, y que diga en qué se aparta de las reglas. Es autosuficiente: se pega
  entero, sin ir a buscar nada al Prompt A.
- **Prompt C — de nuestro lado.** Lo que se pega en Claude Code, en el repo, junto con la ficha.

El que rinde es el A: un control que nace con las reglas no hay que auditarlo después. El B es la red
para los controles que ya están armados, que son varios.

La ficha no es burocracia: cubre las **cinco preguntas que la skill `nuevo-control` manda a hacer antes
de escribir código**. Si vienen escritas, la integración arranca el mismo día; si no, son idas y
vueltas por chat con un analista que quizás ya no tiene el archivo a mano.

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
Salieron de bugs reales que costaron caro. No son preferencias de estilo:

1. Consolidar por legajo, de los DOS lados del cruce. El Tabulado trae una fila POR
   LIQUIDACIÓN, no por empleado: un legajo con la mensual y la baja del mismo mes aparece
   dos veces (hay legajos con hasta cinco). El reporte normalmente informa el total ya
   sumado. Si la última fila del legajo pisa a las anteriores en vez de sumarse, salen
   diferencias falsas en TODOS los empleados con más de una paga. Los datos de ficha
   (nombre, centro de costo, fechas) se toman de la última liquidación; los importes se
   SUMAN. Los dos lados arman la clave del legajo igual: por default '007' y '7' son el
   mismo empleado. Si el cliente usa legajos con letras ('12-B' y '12-C'), son distintos:
   preguntame.

2. "Sin dato" no es "cero". Si una columna no está o ninguna liquidación trajo valor, eso
   es SIN DATO y se muestra como "—". Cero es un valor: hay dato y vale cero. La diferencia
   se calcula sólo si los dos lados tienen dato. Ojo con el Tabulado de Meta4: ahí un
   concepto no liquidado viene con 0, no vacío, así que desde el archivo no se distingue
   "no se liquidó" de "se liquidó en cero". Si el control necesita esa distinción, avisame.
   Diferencia es lo que supera 0,01 (los números de Excel no dan igualdad exacta). Si el
   control necesita otro monto, que se vea en pantalla y se pueda cambiar, y anotamos por
   qué. Excepción: para decidir si un concepto "se liquidó o no" no se usa ese monto.

3. Nada completado con 0,00 en silencio. Si el control no puede resolver una columna o un
   concepto, me lo pide en pantalla o sale como aviso en el resultado. Un número mal pero
   coherente no lo detecta nadie. Que un concepto no se haya liquidado ese mes SÍ es un
   resultado válido y se informa; lo que no puede pasar es que no haya forma de resolverlo
   y el control siga como si nada.

4. Los conceptos se buscan por CÓDIGO, nunca por nombre ni por posición de columna.
   - Por nombre falla: el Tabulado trae '4899-COCHERA_IG' y '8805-DTO_COCHERA', y buscar
     "COCHERA" agarra el equivocado. Hay clientes con dos códigos rotulados igual.
   - Por posición falla: en Axton una columna de concepto aparece sólo si ese concepto se
     liquidó ese mes. En un cliente el Tabulado pasó de 116 a 128 columnas entre una
     quincena y la siguiente, y todo lo que estaba ubicado por posición se corrió.
   TOTAL BRUTO, TOTAL_DESCUENTO, NETO, TOTAL GENERAL no son conceptos.

DÓNDE AVISAR Y DÓNDE TRABAR
Un aviso avisa, no traba: si el archivo no parece el correcto o una columna trae algo raro,
decímelo y dejame seguir. Trabar es sólo para lo que hace que el resultado no exista.

SI LO VERIFICAMOS CONTRA UNA PLANILLA MÍA
No me digas "cierran 180 de 200". Mostrame UN legajo completo: los datos tal como salen
del archivo, línea por línea con el código de cada concepto; dos o tres valores de mi
planilla que se reproduzcan exactos desde esos datos; el cálculo por los dos lados; y la
diferencia separada por concepto. Esperá que lo confirme antes de pasar al resto. Si no
cierra, mi planilla no es la verdad por definición: primero decidimos juntos qué criterio
vale, y recién ahí se corrige el lado que esté mal. Nunca toques el control sólo para que
dé lo mismo que la planilla.

ENTREGABLE QUE VIAJA AL REPO (importante)
Cuando el control ya funcione contra el archivo real, además del HTML escribime una
"FICHA DE TRASPASO" en un bloque de texto aparte, con estos títulos y nada más:

  1. QUÉ CONTROLA — dos oraciones. Qué compara y qué encuentra cuando algo no cierra.
  2. CLIENTE Y SISTEMA — nombre del cliente y si el archivo sale de Meta4 o de Axton.
     Si el control serviría igual para cualquier cliente de ese sistema, decilo.
  3. ARCHIVOS DE ENTRADA — uno por uno: qué reporte es, de dónde se baja, formato
     (.xlsx / .html / .csv), en qué fila están los encabezados, en qué fila arrancan los
     datos, si hay filas de subtotal o separadores que haya que descartar, y si la última
     fila es un TOTAL GENERAL que sirva de control. Si es un Tabulado, cuál de estos:
     Meta4 horizontal (hoja "tabulado_h", código pegado al nombre: '1003-SUELDO'), Axton
     completo (dos columnas por concepto, Cant e Imp) o Axton sólo importes (sin Cant).
  4. ENCABEZADOS EXACTOS — la lista literal de encabezados de cada archivo, como está
     escrita en el archivo (con guiones, mayúsculas y códigos incluidos). Los nombres de
     las columnas, NO su contenido.
  5. QUÉ SE COMPARA CONTRA QUÉ — fila por fila: este concepto de acá contra ese de allá, y
     el signo de la diferencia (¿Tabulado menos Reporte, o al revés?).
  6. CÓDIGOS DE CONCEPTO — los códigos que usaste y de qué cliente los confirmaste. Marcá
     con ASUMIDO los que no viste en el archivo: ésos no se pueden dar por buenos.
  7. LA UNIDAD DEL RESULTADO — qué se cuenta cuando se dice "23 con diferencia": legajos,
     centros de costo, listas de pago, líneas de asiento.
  8. REGLAS DE NEGOCIO Y CASOS BORDE — todo lo que decidimos en la conversación y no se
     deduce mirando el archivo: qué se excluye, qué se redondea, qué pasa si falta un dato,
     qué monto de diferencia se usó si no fue 0,01 y por qué.
  9. QUÉ SALE COMO ARCHIVO, Y QUIÉN LO RECIBE — si el resultado se baja como Excel: qué
     columnas lleva y si lo recibe el equipo de Payroll o Finanzas del cliente. Es
     importante: a Finanzas va sólo lo necesario para pagar (legajo, nombre, CUIL, CBU,
     banco, importe, fecha) y nada de dotación, altas y bajas ni atributos del empleado.
 10. VERIFICADO CONTRA — qué archivo real y de qué período, y los totales que dieron bien
     (montos globales del período, no datos de empleados). Si se comparó contra una
     planilla manual, cuál, y qué se decidió cuando no cerró.

En la ficha NO pongas legajos, nombres, CUIL, CBU ni importes de empleados: la ficha se
guarda en nuestro repositorio de trabajo. Encabezados, códigos de concepto y totales del
período sí van.
```

## Prompt B — para un control ya armado

```
Este control ya funciona contra el archivo real del cliente. Lo vamos a integrar en
nuestra herramienta interna, y para eso necesito una FICHA DE TRASPASO: lo que hay que
saber para reconstruirlo sin leer el código.

Si el HTML del control no está en esta conversación, pedímelo y esperá a que lo adjunte.
No escribas la ficha de memoria.

Describí lo que el HTML EFECTIVAMENTE HACE, no lo que sería ideal ni lo que hablamos. Si
en la conversación decidimos algo que el HTML no hace, anotalo como discrepancia.

LA FICHA, con estos títulos y nada más:

  1. QUÉ CONTROLA — dos oraciones. Qué compara y qué encuentra cuando algo no cierra.
  2. CLIENTE Y SISTEMA — nombre del cliente y si el archivo sale de Meta4 o de Axton.
     Si el control serviría igual para cualquier cliente de ese sistema, decilo.
  3. ARCHIVOS DE ENTRADA — uno por uno: qué reporte es, de dónde se baja, formato
     (.xlsx / .html / .csv), en qué fila están los encabezados, en qué fila arrancan los
     datos, si hay filas de subtotal o separadores que haya que descartar, y si la última
     fila es un TOTAL GENERAL que sirva de control. Si es un Tabulado, cuál de estos:
     Meta4 horizontal (hoja "tabulado_h", código pegado al nombre: '1003-SUELDO'), Axton
     completo (dos columnas por concepto, Cant e Imp) o Axton sólo importes (sin Cant).
  4. ENCABEZADOS EXACTOS — la lista literal de encabezados de cada archivo, como está
     escrita en el archivo (con guiones, mayúsculas y códigos incluidos). Los nombres de
     las columnas, NO su contenido.
  5. QUÉ SE COMPARA CONTRA QUÉ — fila por fila: este concepto de acá contra ese de allá, y
     el signo de la diferencia (¿Tabulado menos Reporte, o al revés?).
  6. CÓDIGOS DE CONCEPTO — los códigos que usa el HTML y de qué cliente se confirmaron.
  7. LA UNIDAD DEL RESULTADO — qué se cuenta cuando se dice "23 con diferencia": legajos,
     centros de costo, listas de pago, líneas de asiento.
  8. REGLAS DE NEGOCIO Y CASOS BORDE — lo que no se deduce mirando el archivo: qué se
     excluye, qué se redondea, qué pasa si falta un dato, qué monto de diferencia usa.
  9. QUÉ SALE COMO ARCHIVO, Y QUIÉN LO RECIBE — si el resultado se baja como Excel: qué
     columnas lleva y si lo recibe el equipo de Payroll o Finanzas del cliente. A Finanzas
     va sólo lo necesario para pagar (legajo, nombre, CUIL, CBU, banco, importe, fecha) y
     nada de dotación, altas y bajas ni atributos del empleado.
 10. VERIFICADO CONTRA — qué archivo real y de qué período, y los totales que dieron bien
     (montos globales del período, no datos de empleados). Si se comparó contra una
     planilla manual, cuál, y qué pasó cuando no cerró.

Marcá con ASUMIDO, en el punto donde aparezca, todo lo que no se confirmó contra el
archivo real: un código deducido por el nombre, una columna supuesta, una regla inferida
de un solo caso. Es lo que hay que revisar antes de que esto salga a un cliente.

DESPUÉS DE LA FICHA, un bloque aparte "CÓMO SE COMPORTA" que conteste estas cinco con lo
que hace el HTML, no con lo que debería hacer:

  a. Cuando un legajo aparece en más de una fila del Tabulado (mensual y baja del mismo
     mes), ¿SUMA las filas o la última PISA a las anteriores? ¿Y del lado del reporte?
  b. Cuando falta un dato (la columna no está, o el legajo no trae valor), ¿lo muestra
     como "—" o lo cuenta como 0,00?
  c. ¿'007' y '7' los trata como el mismo legajo?
  d. ¿Encuentra cada concepto por su código, por su nombre, o por la posición de la
     columna?
  e. ¿Con qué monto decide que hay diferencia, y está fijo o se puede cambiar en pantalla?

Si alguna respuesta es la que da números mal (pisa en vez de sumar, cuenta como cero,
busca por nombre o por posición), decilo claro. No lo arregles: lo arreglamos al integrar.

En la ficha no pongas legajos, nombres, CUIL, CBU ni importes de empleados. Encabezados,
códigos de concepto y totales del período sí.
```

## Prompt C — de nuestro lado, en el repo

```
Agregar el control [nombre] a Controles Nómina. Lo prototipó [quién] en Claude Chat como
HTML standalone y corre contra el archivo real del cliente. Abajo van su ficha de
traspaso y el bloque "Cómo se comporta"; el HTML lo adjunto aparte.

Usá la skill `nuevo-control` y seguila entera, incluido el mockup que tengo que aprobar
antes de los puntos 3 y 4. El HTML es referencia de comportamiento, no código para copiar.

ANTES DE ESCRIBIR CÓDIGO, contestame en lenguaje llano:

1. Cuáles de las cinco preguntas de la skill NO quedan resueltas por la ficha.
2. Todo lo marcado ASUMIDO, y todo lo que "Cómo se comporta" dice que el prototipo hace
   distinto de las reglas de la skill. Eso no se replica: se construye como dice la skill,
   y la diferencia con el prototipo se anota.
3. Si lee el Tabulado: qué formato trae según la ficha, y si el repo ya lo sabe leer
   (`specs/lector-tabulado-formatos.md`).
4. Si la ficha usa un monto de diferencia distinto de 0,01: si es preferencia del
   analista, va al monto por cliente y no al control (D-069); si es por la forma del
   archivo, explicame por qué.

Eso lo confirmo yo antes de que arranques.

Si te paso el archivo real, va primero al agente `inspector-archivo`, antes del parser, y
no entra al repo. Los códigos de concepto se siembran sólo si están confirmados contra un
archivo real: los ASUMIDO no se siembran.

VERIFICACIÓN. Los totales del punto 10 de la ficha son el número contra el cual comparar.
Si no dan igual, un caso completo como dice `CLAUDE.md`, y el prototipo no es la fuente de
verdad: no toques el control para que dé lo mismo que el prototipo. Primero confirmamos
conmigo qué criterio vale, y recién ahí se decide qué lado está mal.

AL CERRAR, además del PR con CI en verde:
- la ficha pasa a ser la spec del control en `specs/`, con una sección de diferencias
  entre el prototipo y lo construido (el modelo es `specs/reporte-variaciones-opmobility.md` §8);
- `ESTADO.md` y `CHANGELOG.md` al día, con el `documentalista`;
- el control en `docs/pruebas-pendientes.md`, con qué archivo y qué período tengo que
  probar yo;
- decime el `id` que quedó en el registry, para cargarlo en el ítem del catálogo en monday.

--- FICHA DE TRASPASO Y CÓMO SE COMPORTA ---
[pegar]
```

---

## Lo que igual queda de nuestro lado

La ficha ahorra el relevamiento, no la integración. Lo que no viaja en ninguna ficha:

- **Los 6 puntos de integración** de la skill `nuevo-control` (parser, ficha del tipo de archivo,
  módulo, registry, test, resumen del tablero) más el test sumado a la cadena de `package.json`, y el
  mockup aprobado antes de los puntos 3 y 4.
- **El contrato de export** (`js/exports/contracts.js`), si el control genera un archivo con layout fijo.
- **Correrlo en el navegador contra el archivo real**, en los tres temas. Un control que nunca vio un
  archivo real no está verificado, y el prototipo del analista **no cuenta como esa verificación**: son
  dos programas distintos y pueden diferir. Lo que sí sirve —y mucho— es que el prototipo dejó los
  totales del período anotados: son el número contra el cual comparar.

## Privacidad

En el chat del analista el archivo real del cliente entra: es lo que permite validar el control, y esos
archivos no salen del chat ni se suben acá. La **ficha** es otra cosa: se guarda en el repo, así que
lleva encabezados, códigos de concepto y totales del período, y no lleva legajos, nombres, CUIL, CBU ni
importes de empleados. Mismo criterio que el resto del proyecto (`CLAUDE.md` § Privacidad): los tests
usan datos inventados y un export de cliente no entra al repo, ni como fixture.

Si el prototipo va a quedar como entregable con identidad H&A (un HTML que se le muestra al cliente),
aplicá el skill `hya-brand`.
