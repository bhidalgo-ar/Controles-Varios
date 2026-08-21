---
name: pruebas-pendientes
description: Auditar qué quedó sin probar del lado de Willy después de mergear PRs, y mantener al día docs/pruebas-pendientes.md. Usar cuando el pedido sea "qué me quedó por probar", "auditá las últimas sesiones", "mergeé sin testear", "actualizá las pruebas pendientes", "ya probé X" o "cerrá el ítem de Y". Agrupa por control o reporte —nunca por PR— y separa lo que espera un archivo, lo que espera una decisión de criterio, y lo que no deja nada para probar.
---

# Pruebas pendientes de tu lado

La app se construye en sesiones remotas donde **el entorno no puede abrir un archivo de cliente ni
ejercitar una descarga de Excel** (la red bloquea los CDN de las librerías). Cada PR que se mergea
deja, casi siempre, algo que sólo Willy puede comprobar. Si eso no queda escrito en el momento, a los
diez PRs nadie sabe qué se probó de verdad.

El entregable vive en **`docs/pruebas-pendientes.md`**, y esta skill lo genera y lo mantiene.

## Los dos modos

**AUDITAR** — "qué me quedó por probar". Se recorre el historial desde la fecha del encabezado del
documento y se reconstruye la lista. Salida: el documento actualizado.

**CERRAR** — "ya probé el Control de Netos, dio 22 legajos". Se saca el ítem del documento, se anota
el resultado en el `CHANGELOG` y, si lo que se probó contradice lo que decía el código o la spec, se
dice **antes** de tocar nada.

---

## AUDITAR

### 1 · De dónde sale la información, en este orden

1. **`ESTADO.md`** — un bloque por frente abierto, con su "Próximo paso". Es la fuente más honesta:
   el documentalista la escribe al cerrar cada PR y suele decir explícitamente "falta verificar
   contra archivos reales".
2. **`CHANGELOG.md`** — buscá `no se pudo`, `queda pendiente`, `falta`, `Verificado`, `navegador`,
   `CDN`. Cada entrada dice hasta dónde se verificó y con qué. Lo que dice "verificado con datos
   inventados" o "con fixture" **no está probado**.
3. **`DECISIONS.md`** — las entradas recientes traen los criterios que se tomaron **a confirmar**.
   Una decisión sin confirmar es un pendiente de Willy aunque el código funcione.
4. **`git log --merges`** y los commits de cada PR — para no perderse un PR que nadie documentó.
5. **`ROADMAP.md`** — los ítems tachados como hechos que igual dicen "pendiente de prueba".

### 2 · Agrupá por control o reporte, nunca por PR

Willy no abre un PR: abre una pantalla y sube un archivo. Tres PRs sobre el Control de Netos son
**un** ítem. Un PR que toca cuatro controles se reparte en cuatro.

### 3 · Clasificá cada pendiente en una de cuatro cajas

| Caja | Qué es | Cómo se escribe |
|---|---|---|
| **Espera un archivo** | El cálculo está y verificado con datos inventados; falta el archivo real | Decí **qué archivo, de qué cliente, de qué período**, y por qué ése y no otro |
| **Espera una pantalla** | El cálculo está verificado con un archivo real, pero la pantalla o la descarga no se pudo ejercitar | Decí **qué mirar** y **cómo se ve si está bien** |
| **Espera un criterio de Willy** | Ninguna cantidad de programación lo resuelve | Formulá **la pregunta**, no la alternativa técnica. Y decí explícitamente que el código **no se toca** hasta que conteste |
| **No deja nada para probar** | Documentación, andamiaje, tests, decisiones sin código | Va en su propia sección al final, **con nombre**. Si no está escrito, Willy lo va a buscar igual |

Esa última caja no es relleno: es lo que evita que revise cinco PRs de documentación buscando una
pantalla que no cambió.

### 4 · Ordená por riesgo, y decí los tres primeros

Arriba del documento, "si sólo tenés tiempo para tres cosas". El riesgo se mide por **qué tan
silencioso es el error**, no por tamaño:

1. **Lo que puede dar un número mal y coherente** — el peor caso, no lo detecta nadie. Un criterio de
   cálculo sin confirmar, una fórmula ajustada contra un armado manual.
2. **Un archivo que sale de la app y nadie abrió** — un Excel con importes como texto se ve bien en
   pantalla y no se puede sumar. Los tests no lo agarran.
3. **Un control completo que no vio un archivo real** — muchas cosas pueden estar mal, pero se
   descubren rápido en la primera corrida.
4. **Un layout deducido de un relevamiento** — falla fuerte y temprano (el sistema del cliente
   rechaza el archivo), así que es menos peligroso de lo que parece.
5. **Lo visual y lo que ya está acotado** — un rótulo, un PDF, un tema oscuro.

### 5 · Escribí cada ítem con las cinco partes

Sin una de ellas el ítem no se puede accionar:

1. **Qué es el control** en una línea, en criollo.
2. **Cómo llegó hasta acá** — hasta dónde se verificó y con qué. Sin esto Willy no sabe si está
   revisando o descubriendo.
3. **Qué hay que probar**, como tabla `qué mirar / cómo se ve si está bien / si está mal`. La tercera
   columna es la que hace que valga la pena: dice qué consecuencia tiene el bug.
4. **Con qué se destraba** — el archivo o la respuesta concreta, con cliente y período.
5. **Lo que espera un criterio suyo**, aparte y visible.

Cuando el control se verifica contra un armado manual, la prueba es **de a un caso** con las cuatro
partes de D-064 (crudos, cruce de control, cálculo por las dos vías, descomposición de la
diferencia), y se aclara en el ítem. Un veredicto agregado no sirve.

### 6 · Poné los números ancla

Si una corrida anterior dio un número, escribilo: "con tolerancia $100 tiene que dar 19 + 3 + 0 = 22".
Eso convierte "probar el control" en "confirmar un número", que se hace en dos minutos y no se puede
hacer mal.

---

## CERRAR

1. **Pedí el resultado, no el OK.** Qué archivo, qué período, qué número dio. Un "funcionó" no se
   puede volver a verificar dentro de tres meses.
2. **Si el número no es el esperado, no toques el código.** Primero se confirma el criterio con quien
   lo define. Ajustar el código hasta que dé lo mismo que la planilla del analista entierra el error
   en vez de encontrarlo (D-063, D-064).
3. **Sacá el ítem del documento** y anotá el resultado en el `CHANGELOG`, con el número ancla.
4. **Actualizá `ESTADO.md`** si el frente cambió de punto — o pasale el diff al agente
   `documentalista`.
5. **Si la prueba destrabó un criterio**, escribilo como entrada nueva de `DECISIONS.md`: lo que Willy
   contestó vale para los próximos controles, no sólo para éste.

---

## Reglas que no se negocian

- **Español criollo, cero tecnicismos.** Willy no programa. "El archivo que descarga la app" y no
  "el blob del export"; "no cierra contra el total del archivo" y no "falla la aserción de suma".
- **Ningún número de legajo en el documento.** El caso se nombra por lo que le pasa —"el legajo con
  doble quincena", "el que está en la planilla y no llegó al importador"—. Los importes sí pueden
  quedar: son las anclas. El chequeo de datos sensibles frena `legajo` seguido de un número.
- **Nada de datos de cliente.** Nombres, CUIL y CBU no entran. Si hace falta un nombre de ejemplo,
  sale de la lista de Banfield de `CLAUDE.md`.
- **No inventes un pendiente.** Si no podés decir qué archivo lo destraba, no es un pendiente: es una
  duda, y va en su propia sección como tal.
- **Ejecutá el chequeo de datos sensibles antes de commitear** (`npm run hooks:install` primero: en
  una sesión remota el contenedor es nuevo).

## Entregable opcional

Si Willy va a recorrer la lista en varias sesiones, además del markdown conviene un tablero HTML
autocontenido con una tarjeta por ítem, el orden de riesgo y un tilde que se recuerde en el
navegador. Se publica como Artifact y queda como checklist.
