# CLAUDE.md — Controles Nómina

Herramienta interna de H&A (estudio de payroll argentino). Un analista sube el Tabulado de un
cliente —export de Meta4 o de Axton— más un reporte del mismo período, y la app le muestra dónde no
cierran. Corre entera en el navegador del analista: no hay backend y los datos no salen de ahí.

Owner: Willy (Guillermo), único dueño del repo. Los usuarios son los analistas de Payroll de H&A.

---

## Cómo trabajar con Willy

**Willy no es programador.** Las explicaciones, los resúmenes de lo hecho y sobre todo las preguntas
sobre decisiones tienen que estar en lenguaje llano, sin tecnicismos: describí el efecto que ve el
analista en la pantalla o en el archivo, no la implementación. Si una decisión necesita su input,
planteá las opciones como "qué va a pasar cuando..." y no como alternativas técnicas.

Español argentino, directo, sin sobre-formatear. Si el pedido tiene ambigüedad sobre un archivo de
cliente —qué encabezados trae, contra qué se cruza, qué concepto es cuál— pará y preguntá: eso no se
adivina, y un control construido sobre una suposición se descubre recién cuando ya salió al cliente.
Mostrar algo funcionando temprano vale más que un plan largo.

### Verificar contra un armado manual: un caso, revisado, y después generalizar

Cuando un control se verifica contra un armado manual —una planilla del analista, un mes ya cerrado, un
reporte del sistema del cliente— **no traigas un veredicto agregado.** Analizá **un** caso, pasalo
completo y esperá la confirmación de Willy antes de extrapolar al resto de la nómina. Un caso bien armado
tiene cuatro partes, en este orden:

1. **Los datos crudos del caso**, tal como salen del archivo de origen, línea por línea y con el código de
   cada componente. Sin resumir.
2. **El cruce de control:** dos o tres valores del armado manual reproducidos exactos desde esos crudos.
   Es lo que prueba que estás mirando el archivo correcto y el caso correcto. Sin esto, el resto no se
   puede leer.
3. **El cálculo por las dos vías**, la del repo y la del armado manual, con la diferencia.
4. **La descomposición de la diferencia** en sus componentes con nombre y código. Una diferencia que no se
   puede descomponer no está entendida.

**Ante una diferencia, el armado manual no es la fuente de verdad.** Primero se confirma el criterio con
quien lo define, después se decide qué lado se corrige: nunca ajustes el código hasta que dé lo mismo que
la planilla. El caso que originó la regla y el por qué están en D-063 y D-064.

Del caso participa el **número de legajo** —es lo que le permite a Willy encontrar la fila en su archivo—
y los códigos de concepto y de acumulador, que son configuración. Nombre, CUIL y CBU no.

---

## Gotchas — lo que cuesta caro si no lo sabés de antemano

**Consolidar por legajo, los DOS lados, siempre que se cruce contra el Tabulado.** El Tabulado trae una
fila **por liquidación**, no por empleado: un legajo con la mensual y la baja del mismo mes aparece dos
veces. El reporte de Meta4 informa el total sumado — salvo el de NR, que también trae una fila por
liquidación (verificado con archivos reales: un legajo con 9 pagas aparece 9 veces en los dos archivos).
Si pisás en vez de sumar, salen diferencias falsas en todos los empleados con doble paga. Es el bug más
caro del repo: se arregló **cuatro** veces por separado antes de que existiera un módulo compartido (Brutos
`bba8958`, NR `b2f8bef`, GS Pers el 2026-08-11, GS Pers modo Reporte el 2026-08-12).
**Importá `js/controls/consolidate.js`** — `groupRowsByLegajo(rows, col, { keyFn })` y
`sumColumn(group, col)` — y pasale la **misma** `keyFn` a los dos lados del cruce
(`makeLegajoKey(mapping.legajoKeyMode)`, resuelta una vez por corrida). La regla está escrita como test
ejecutable en `tests/consolidate.test.js` y `tests/gsPersControl.test.js`. Excepción conocida:
`acreditaciones.js`, donde la unidad del reporte es la acreditación y no el empleado-mes (D-021).

**`null` no es `0`.** `null` = no hay dato (la columna no está mapeada, o ninguna liquidación trajo
valor); `0` = hay dato y vale cero. La diferencia se calcula sólo si los dos lados son distintos de
`null`, y se compara con tolerancia (`Math.abs(diff) > 0.01`): los floats de Excel no dan igualdad
exacta. Para leer un importe usá `toNum()` de
`js/utils/currency.js` — no `Number(v)`, que da `null` para `"1.234,56"`, ni `parseAmount()`, que devuelve
`0` para una celda vacía (sirve para totalizar, no para decidir si un concepto se liquidó).

**Un default silencioso es un bug.** Si un control no puede resolver una columna o un concepto, no lo
completa con 0,00: lo pide explícitamente y no deja avanzar, o sale como aviso en resultados. Igual
los parsers: validar que lo leído tenga la forma esperada (ancho de la fila de encabezados, totales
contra `TOTAL GENERAL`) y cortar con un error que diga qué se esperaba y qué se encontró. Un número
mal pero coherente no lo detecta nadie. Matiz que costó dos PRs seguidos (D-036): que un dato no
exista en un período **es** resultado válido y se informa; lo que no puede pasar en silencio es que
el control no tenga forma de resolverlo.

**El color del semáforo sale de `computeSemaforoStatus(unitsWithDiff, unitsTotal)`, nunca de
`summary.status`.** Cuatro pantallas pintan el estado del mismo control (checklist, wizard,
resultados, lista de clientes); con el status crudo el mismo control sale de distinto color según
dónde lo mires, porque marca `'warning'` con una sola diferencia sin mirar el porcentaje. El status
crudo es para el texto de la tarjeta y para cortocircuitar en `'error'`.

**`unitsTotal` / `unitsWithDiff` se cuentan en la unidad que declara `unit`** (`'legajo'`, `'cc'`,
`'lista'`, en minúscula). Contar filas de cálculo infla el denominador —Agrupadores contaba legajo ×
agrupador, 1000 sobre 100 empleados— y con el denominador inflado el umbral nunca se cruza: el
semáforo miente en verde.

**Qué columna del archivo representa a cada concepto, en este orden** (D-039): (1) lo que el analista
confirmó en el Paso 2, guardado en `controlConfigs` por `[clientCode+controlId]` — siempre gana;
(2) búsqueda por catálogo/código matcheando por **prefijo** del encabezado; (3) recién ahí, un
fallback cableado. Los códigos que están en el módulo son **semilla** para el cliente que todavía no
configuró nada, no identidad: una renumeración del cliente se arregla desde la pantalla y no con un
commit (D-035). Las semillas de código de concepto viven en
`js/controls/tabCodes.js` (`TAB_CODE_SEEDS`, confirmadas contra un Tabulado real de Marval) y las resuelve
la auto-detección del Paso 2, después del catálogo del cliente y sólo para lo que quedó vacío. Buscá por
**código**, nunca por nombre: el Tabulado trae `'4899-COCHERA_IG'` y `'8805-DTO_COCHERA'`, y matchear
"COCHERA" agarra el equivocado. Deuda conocida: 8 de los 18 conceptos de NR siguen sin semilla porque no se
liquidaron en el mes de muestra —no se inventan por analogía— y `rendVsTabu.js` todavía tiene su lista de
códigos cableada.

**Un legajo matchea consigo mismo con la clave del cliente, no con `trim`.** Por default `'007'` y `'7'`
son el **mismo** empleado; cada cliente puede cambiarlo desde `#/admin` (`clients.legajoKeyMode`, viaja en
el seed) y el wizard lo resuelve una vez por corrida en `mapping.legajoKeyMode` (D-038/D-042). Usá
`makeLegajoKey(mapping.legajoKeyMode)` de `js/utils/legajo.js` — nunca `String(v).trim()` a mano, y nunca
`parseInt` (colapsa `'12-B'` y `'12-C'` en `12`). El `norm()` que sigue en cada módulo es para limpiar
texto (nombres, centro de costo), no para comparar legajos. Si un cruce devuelve empleados "faltantes" de
un solo lado, mirá esto antes que nada.

**Lo que va a Finanzas no lleva información de HR.** Cuando el archivo que genera un control lo
recibe Finanzas/tesorería del cliente y no el equipo de Payroll, va sólo lo necesario para pagar:
legajo, nombre, CUIT, CBU, banco, importe y fecha. Nada de dotación, conteos, altas y bajas ni
atributos del empleado — en muchos clientes Finanzas no tiene acceso a eso. El resto se muestra en la
pantalla de resultados, que la ve el analista (D-020).

**Ocultar un cliente reserva su `code` para siempre.** `uniqueClientCode()` consulta `clients` sin
filtrar por `active`, y eso es deliberado: es lo que impide que un cliente nuevo homónimo reuse el
code y herede corridas con datos de empleados adentro. `deleteClient()` es el borrado real, en
cascada, y su contrato completo está en `tests/clientDeletion.test.js` (D-037).

---

## Privacidad

Los datos de empleados viven sólo en el IndexedDB del navegador del analista. No hay telemetría ni
analytics y no se agregan. Nada de `console.log` con datos de empleados si va a quedar commiteado.
Los tests usan datos inventados (`'1'`/`'2'`, `Perez`/`Gomez`): un export de cliente no entra al
repo, ni siquiera como fixture. El export JSON de sesión y el respaldo de base **sí** llevan datos
personales — avisarlo donde se descargan. El banner de privacidad de `index.html` es requisito del
negocio: no se saca.

**Antes de commitear corre un chequeo automático** (`scripts/check-datos-sensibles.mjs`): frena
planillas (`.xlsx`, `.csv`, `.xls`) y textos con CBU o CUIT. Se activa una sola vez por máquina con
`npm run hooks:install`; CI lo repite sobre los archivos del PR, así que si alguien no lo instaló, el
PR sale en rojo. No cubre nombres ni sueldos —eso no se detecta por patrón—: para una captura de
pantalla o un ejemplo en una spec, los datos se inventan siempre, aunque el repo sea privado.

---

## Código

Escribí código que se lea como el de al lado. Lo que no se deduce leyéndolo: los identificadores van
en **inglés** y todo lo que ve el analista —strings de UI, mensajes de error, comentarios— en
**español argentino**. Un error que sólo termina en `console.error` no está manejado: el analista
tiene que leer en pantalla qué pasó y qué hacer. `esc()` sobre todo valor que entre a un template
literal de HTML — los nombres vienen de un Excel de un tercero.

No hay build step ni bundler, y es deliberado: la app se sirve estática y cualquiera la levanta sin
instalar nada (`npm` es sólo para los tests). Las librerías entran por CDN desde `index.html`; no
sumes dependencias de runtime.

Colores, tipografía y espaciados salen de `css/tokens.css` — nada de hex en los módulos, y lo que
toques comprobalo en dark mode. Para entregables con identidad H&A fuera de la app (un PDF, un HTML
standalone), aplicá el skill `hya-brand`.

---

## Tests y CI

`npm run test:unit` corre una cadena explícita de archivos declarada en `package.json`: **un test que
no esté en esa cadena no lo corre nadie** (hoy `tests/rendVsAsientoDrill.test.js` está afuera a
propósito — necesita archivos reales de cliente). CI corre unit + e2e (Playwright) en cada PR.

Cuando una regla se puede escribir como assert, escribila como assert: `tests/gsPersControl.test.js`
documenta la consolidación por legajo mejor que cualquier párrafo de acá, y falla solo si alguien la
rompe.

---

## Git

El trabajo termina en un PR contra `main`: commit, branch (`feat/…` o `fix/…`), push, PR. Willy es el
único owner y no hay reviewers, así que mergealo vos cuando CI esté en verde. Si CI está en rojo, o
el cambio sólo se puede verificar en el navegador y no lo pudiste abrir, dejá el PR abierto y decilo
— no mergees a ciegas. Si `gh` no está disponible, avisá en vez de adivinar la ruta. Commits en
español, Conventional Commits.

Un cambio no está terminado si `ESTADO.md` sigue describiendo el mundo anterior: antes de
mergear, pasale el diff al agente `documentalista` y dejá que actualice estado, changelog,
decisiones y la spec del frente. Vale lo mismo que el CI en verde — es lo único que ven
Cowork y Chat cuando retomás el trabajo desde ahí.

---

## Dónde está el resto

- `ESTADO.md` — dónde estamos hoy, un bloque por frente abierto. Leelo primero.
- `.claude/agents/` — relevador (recolección), auditor (refutar hallazgos), documentalista
  (dejar la doc al día), inspector-archivo (radiografía de un archivo real de cliente).
- `README.md` — cómo levantar la app y qué hace cada control, para el equipo.
- `ARCHITECTURE.md` — identidad de cliente, ciclo de vida, seed, los tres niveles del control.
- `DECISIONS.md` — por qué algo está como está; los módulos citan estas entradas (D-0xx).
- `ROADMAP.md` — lo que viene, incluido el plan de escalabilidad por fases.
- `.claude/skills/nuevo-control/` — los 5 puntos de integración para sumar un control o una variante
  (más el condicional: las columnas nuevas del Tabulado necesitan su nombre en criollo en `fieldHelp.js`).
- `specs/` — una spec por control o feature grande; cada una declara su estado en la primera línea.
- `docs/traspaso-controles-equipo.md` — cómo traer al repo un control que el equipo prototipó en Claude
  Chat como HTML standalone: los prompts de arranque y de cierre, y la ficha de traspaso que viaja.
