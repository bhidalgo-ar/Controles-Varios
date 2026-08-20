---
name: nuevo-control
description: Agregar un control nuevo a Controles Nómina, o una variante ("Generar Reporte") de uno existente. Cablea los 5 puntos de integración (parser, ficha del tipo de archivo, módulo, registry, test) y las reglas que hacen que el resultado sea correcto — consolidación por legajo, null vs 0, semáforo por unidad declarada. Usar cuando el pedido sea "agregar el control X", "controlar el reporte Y contra el Tabulado", "generar el reporte Z desde el Tabulado", o cualquier variante de sumar un control a la batería.
---

# Agregar un control nuevo

Un control cruza un reporte de Meta4 (o de Axton) contra el Tabulado, o dos reportes entre sí.
Agregarlo **no es escribir un archivo**: son 5 puntos de integración.

Hasta la Fase 4 eran 6, y el que se olvidaba siempre era `fileUpload.js` — porque un tipo de archivo
vivía repartido en ~12 lugares entre `fileUpload.js` y `controlsWizard.js`, sin ningún guard entre
ellos. Hoy el tipo de archivo se declara **una vez** en `js/ui/fileTypes.js` y `tests/fileTypes.test.js`
falla si la ficha queda a medias. Los otros 5 puntos siguen siendo tuyos.

Referencias, todas código y todas vigentes: `js/controls/nr.js` (control de referencia, los dos
modos), `js/parsers/nrParser.js` (parser de referencia), los encabezados de `js/ui/fileTypes.js` y
`js/controls/registry.js` (los dos contratos, campo por campo), `tests/gsPersControl.test.js` (la
regla de consolidación escrita como test).

## Antes de escribir código

Willy prefiere que preguntes a que supongas. Cinco cosas que el código no te va a decir:

1. Contra qué se cruza: el Tabulado (el caso normal) u otro reporte — `rend_vs_asiento` cruza
   Rendimiento contra CONTA.
2. Los encabezados **exactos** del reporte. Si tenés el archivo real, pasáselo al agente
   `inspector-archivo` antes de escribir una línea: te devuelve encabezados literales, fila
   de arranque, columnas de concepto por código y si hay una fila por liquidación o por
   empleado. Si no lo tenés, pedilo — sin eso el parser es adivinanza.
3. Qué conceptos se comparan y el signo de la diferencia. La convención es `Tabulado − Reporte`;
   `rend_vs_asiento` usa `CONTA − Rend`. Confirmá cuál aplica.
4. Si hace falta la variante "Generar Reporte" (armar el archivo desde el Tabulado en vez de
   controlarlo). Si sí, van dos entradas de registry bajo el mismo `group.id`.
5. A qué clientes se ofrece. El default es el cliente que lo pidió (D-015); `scope: 'general'` sólo
   si Willy lo confirma.

## Los 5 puntos

| # | Archivo | Qué |
|---|---|---|
| 1 | `js/parsers/<x>Parser.js` | `parse<X>`, `autoDetect<X>Mapping`, re-export de `detectHeaders` |
| 2 | `js/ui/fileTypes.js` | **una** entrada en `FILE_TYPES` — ver abajo |
| 3 | `js/controls/<x>.js` | `run` / `summarize` / `renderResults` |
| 4 | `js/controls/registry.js` | imports + entrada (los campos, en el encabezado del archivo) |
| 5 | `tests/<x>Control.test.js` | + agregarlo a la cadena `test:unit` |

`js/ui/fileUpload.js` y `js/ui/controlsWizard.js` **no se tocan**. Si te encontrás escribiendo un
`if (fileType === '…')` en alguno de los dos, algo falta en la ficha —
`tests/fileTypes.test.js` afirma que `fileUpload.js` no menciona ningún tipo de archivo por nombre.

### 1 — el parser

Seguí la forma de `nrParser.js`. Dos cosas que no se deducen del archivo:

- `autoDetect<X>Mapping` devuelve **`null`**, no un objeto vacío, cuando no encuentra la columna
  identificadora — el wizard usa ese `null` para decidir si pide mapeo manual.
- Los reportes de M4 traen subtotales y separadores mezclados con los datos: descartá las filas sin
  legajo válido antes de devolver nada.

### 2 — la ficha del tipo de archivo

Una entrada en `FILE_TYPES` (`js/ui/fileTypes.js`). El contrato completo está en el encabezado de ese
archivo; copiá la ficha de `nr_file`, que es la más parecida a un reporte típico. Lo que no se deduce:

- **`autoDetect` se declara siempre, aunque sea `null`.** Sin declararlo queda `undefined`,
  indistinguible de un olvido, y el analista mapea a mano un archivo que la app sabía leer sola.
- **`fixedFormat` no es "no tiene columnas".** Es "se parsea derecho, sin pantalla de confirmación".
  `acreditaciones_file` no tiene ninguna columna que mapear y aun así pasa por la vista previa, que
  es lo único que le muestra al analista que subió el archivo correcto.
- **`meta`** es la línea que se ve al lado del nombre del archivo cargado. Un reporte normal usa
  `metaRegistros`. Si te olvidás, el test falla; antes salía la línea de otro tipo, en silencio.
- **`flow`** sólo si el analista sube varios archivos del mismo tipo en una corrida (CONTA,
  Acumuladores). El default es uno por slot.

En `fields`, el legajo va `required: true`, y **`required` se declara en todos los campos**, aunque
sea `false` — sin él queda `undefined` → falsy → el campo deja de bloquear en silencio. Para los
conceptos: **si tu control ya tiene contrato en `js/exports/contracts.js`** (ver D-041 y
`specs/contrato-export.md`), la obligatoriedad se deriva del contrato
(`necessityOfKey(fileType, key)`), y el `required` de la ficha queda como piso — un contrato suma
obligación, nunca la saca (D-045). Si tu control **todavía no** tiene contrato, `required: false` en
los conceptos sigue siendo el default correcto: un cliente puede no liquidar un concepto y el control
tiene que correr igual — no lo vuelvas `true` "para que se note", eso traba a cualquier cliente sin
ese concepto sin ninguna vía de escape (ver el Paso 2 de `specs/contrato-export.md`: activar
`OBLIGATORIA` sin la omisión declarada rompe la carga). Un tipo de formato fijo va con `fields: []`.

`canGoNext` no se toca salvo que la validación no sea "están todos los archivos requeridos" — el
único caso hoy es `agrupadores` ("al menos uno de dos opcionales").

**Si tu control pide columnas nuevas del Tabulado en el Paso 2** (`extraFieldGroups` de la ficha
`tab_control`), cada clave nueva necesita además su entrada en `TAB_FIELD_LABELS`
(`js/ui/fieldHelp.js`): nombre en criollo + código técnico y, si agrega algo, la explicación larga del
"?". Es el único punto de integración condicional que quedó fuera de los 5, y tiene guard:
`tests/fieldHelp.test.js` falla si una clave del panel no está en la tabla o no declara su `code`
(D-055). **Es una tabla y no una derivación a propósito** — nada en el código sabe que `INDEM_ANT_DESP`
es "Indemnización por antigüedad (despido)", y adivinarlo con reglas de texto da nombres plausibles y
equivocados. Si no sabés qué nombra exactamente una columna, dejala sin `name`: se ve con su código, que
es peor pero nunca miente. Preguntale a Willy y agregala después.

### 3 — el módulo del control

**Consolidar por legajo, los dos lados.** El Tabulado trae una fila **por liquidación**, no por
empleado: un legajo con mensual + baja aparece dos veces. El reporte informa el total sumado — salvo
el de NR, que también trae una fila por liquidación. Sin consolidar, la última liquidación pisa a las
anteriores → diferencias falsas en todo empleado con doble paga. Ya pasó **cuatro** veces (Brutos, NR,
GS Pers modo Controlar y GS Pers modo Reporte), y por eso ahora hay un módulo compartido.

No lo escribas de cero ni lo copies — **importalo**:

```js
import { groupRowsByLegajo, sumColumn, lastRow } from './consolidate.js';
import { makeLegajoKey } from '../utils/legajo.js';
import { toNum } from '../utils/currency.js';

// Una vez por corrida: la clave de legajo es del cliente (D-038), y los DOS
// lados del cruce tienen que usar la misma o el control informa faltantes que
// no faltan.
const keyFn = makeLegajoKey(mapping.legajoKeyMode);

for (const [legajo, group] of groupRowsByLegajo(tabRows, tm.empleadoColumn, { keyFn })) {
  const total = sumColumn(group, tm.miConceptoColumn);   // null si no hay dato, nunca 0
  const ficha = lastRow(group);                          // nombre/CC/fecha: NO se suman
}
```

Tres cosas que se rompen si las escribís a mano: `sumColumn` devuelve `null` —no `0`— cuando ninguna
liquidación trajo dato; `toNum` distingue el string es-AR (`"1.234,56"`) del número que SheetJS ya
parseó, que es lo que hacía divergir a las 7 copias que había; y `lastRow` marca explícitamente qué
datos se toman de la última liquidación en vez de sumarse. La regla está escrita como test ejecutable
en `tests/consolidate.test.js` y `tests/gsPersControl.test.js`: copiá **ese escenario** a tu test.
Copiar tests está bien; copiar lógica de producción es exactamente lo que produjo el bug cuatro veces.

**Y si tu control resuelve columnas del Tabulado por código de concepto**, importá `buildColByCode` de
`js/controls/tabCodes.js` y agregá tu semilla a `TAB_CODE_SEEDS` — sólo si la confirmaste contra un
Tabulado real del cliente (D-039). Un código inventado por analogía es un default silencioso.

Excepción conocida: `acreditaciones.js`, donde la unidad del reporte es la acreditación y no el
empleado-mes (D-021). Si creés estar en ese caso, confirmalo con Willy.

**`null` no es `0`.** `null` = la columna no está mapeada o ninguna liquidación trajo dato; `0` = hay
dato y vale cero. La diferencia se calcula sólo si los dos lados son distintos de `null`.

**Nunca escribas `Math.abs(diff) > 0.01`. Usá `isDiff(diff)` de `./tolerance.js`** (D-069). De cuánto
para arriba una diferencia es una diferencia lo pone el analista por cliente, en el panel "Umbrales"
del wizard, y tu control lo hereda sin cablear nada: `isDiff()`, `diffStats()` y `diffCellHtml()` ya
miden con ese monto. Un `0,01` suelto en tu módulo mide con otro número que el que la pantalla
promete, y `tests/tolerance.test.js` falla si lo dejás.

Dos casos en que **no** corresponde ese monto, y ahí el `0,01` va con nombre y comentario:
- **"¿este concepto se liquidó?"** no es "¿difiere?". Con el monto en $ 100, un `Math.abs(v) > tol`
  haría desaparecer de la comparación al legajo con una cochera de $ 50. Constante propia
  (`VALOR_REAL_EPS`, como en `nr.js`/`brutos.js`).
- **Tolerancias estructurales**: cuadrar un asiento DEBE contra HABER, validar una suma contra
  `TOTAL GENERAL`, o comparar contra un archivo que viene redondeado. No son preferencia del
  analista, son la forma del archivo, y subirlas taparía un archivo mal leído.

Si tu control **no** mide con ese monto —tiene el suyo editable en su propio panel, o directamente no
compara importes— declaralo en el registry con `ownTolerance: { note, from? }`: el panel lateral se lo
dice al analista en vez de mostrarle una cifra que no manda.

**Nada del cliente cableado, ningún default silencioso.** Los códigos de concepto de un cliente van a
`controlConfigs` (`[clientCode+controlId]`, ver `js/db.js`), no como constantes del módulo; en el
código quedan sólo como semilla para el cliente que todavía no configuró nada (D-035). Precedencia
para resolver qué columna es cada concepto (D-039): (1) lo que el analista confirmó en el Paso 2,
guardado por cliente — siempre gana; (2) catálogo/código matcheando por prefijo del encabezado
(`buildParserMapping` de `conceptMatcher.js`); (3) un fallback cableado, sólo si Willy confirma los
códigos para ese control. Si nada resuelve, **no lo completes con 0,00**: pedilo explícitamente y no
dejes avanzar, o sacalo como aviso en la pantalla de resultados. Lo mismo en el parser: validá que lo
leído tenga la forma esperada y cortá con un error que diga qué se esperaba y qué se encontró. Que un
concepto no exista en un período **sí** es un resultado válido y se informa (D-036); lo que no puede
pasar en silencio es no tener forma de resolverlo.

**`summarize()` y el semáforo.** Tres cosas que no se ven leyendo un `summarize` existente:

- `unit` va en **minúscula** (`'legajo'`, `'cc'`, `'lista'`, o `null` si el control no compara nada).
  `controlsResults.js` compara `summary.unit === 'cc'`; un `'CC'` no rompe nada visible, sólo cuenta
  centros de costo como si fueran legajos.
- `unitsTotal`/`unitsWithDiff` se cuentan **en la unidad que declarás en `unit`**, no en filas de
  cálculo. `diffStats()` de `./semaforo.js` sirve cuando hay una fila por unidad (el caso de `nr.js`).
  Cuando no la hay — `agrupadores` produce legajo × agrupador — contalas a mano sobre la unidad real
  (`legajoStats` en `agrupadores.js`). Contar filas ahí daba 1000 "legajos" sobre 100 empleados.
- El color del semáforo **no** sale de `status`: sale de `computeSemaforoStatus(unitsWithDiff,
  unitsTotal)`. `status` alimenta la tarjeta colapsada, y `'error'` es la única rama que lo
  cortocircuita. Si agregás una pantalla que pinte el estado de un control, usá
  `computeSemaforoStatus` o va a discrepar con las otras cuatro.

En una variante "Generar Reporte" no llega archivo primario: nombralo `_primaryRows`, el `status` es
`'info'` y `unit`/`unitsTotal`/`unitsWithDiff`/`diffTotalAmount`/`worstCase`/`contextNote` van en
`null` (ver `summarizeNrReporte` en `js/controls/nr.js`). Para errores de negocio devolvé
`{ error: 'mensaje en español' }` en vez de tirar excepción (ver `agrupadores.js`).

Para `renderResults` → leé `ui-resultados.md`, en esta misma carpeta.

### 4 — el registry

Los campos están documentados en el encabezado de `js/controls/registry.js`. Lo que se olvida:
`help: { what, how[] }` es el popover "?" que ve el analista — `what` en una o dos oraciones, `how`
como pasos imperativos ("Bajá el Reporte de X de M4."). Y en variantes agrupadas, el `group.id` tiene
que ser idéntico en las dos entradas o se renderizan como pills sueltas.

**Si tu control tiene configuración propia del cliente** (una tabla de cuentas, un régimen, umbrales),
declarala en `config` — no la cablees en `controlsWizard.js`. Una declaración cubre los cinco momentos
(cargar, state, editor del Paso 2, guardar y viajar a `run()`); antes eran siete lugares sin nada que
los ligara, y olvidarse del `mapping` daba un control corriendo con su default sin que nada avisara.
Dos que no se deducen: `default()` devuelve una **copia nueva** (el editor la muta en el lugar), y un
editor sin `mappingKey` es una config que el analista toca y el control nunca ve —
`tests/controlConfigRegistry.test.js` lo prohíbe.

**El editor de esa config va a `js/ui/<x>ConfigEditor.js`, no al módulo del control**: es pantalla, no
cálculo, y ahí ya viven los otros (`rendVsAsientoConfigEditor.js`, `rendVsTabuConceptEditor.js`,
`grouperEditor.js`, `variacionesConceptMap.js`). El del asiento vivía dentro de
`js/controls/rendVsAsiento.js` y se mudó en el rediseño; el control lee la misma config, con la misma
forma, y en el registry cambia sólo de qué archivo sale la función.

### 5 — el test

Corre en Node, así que necesita el shim **antes** de importar el registry (que importa módulos de UI
que registran listeners a nivel de módulo):

```js
globalThis.document = { addEventListener: () => {} };
```

`test:unit` en `package.json` es una cadena de `&&` escrita a mano: si no agregás tu archivo, CI no
lo corre y nadie se entera. Cubrí como mínimo: la entrada existe en el registry con el `tabRequired`
y el `additionalFiles[0].key` esperados; coincidencia total → `status === 'success'`; una diferencia
conocida → `unitsWithDiff > 0`; **un legajo con dos liquidaciones** → suma, no pisa; un legajo
presente de un solo lado; y cada rama de `{ error }`.

## Reglas que no admiten criterio

- **Datos de empleados.** Ni un `console.log` con ellos, ni un export de cliente en el repo. En los
  tests, datos inventados: legajos `'1'`/`'2'`, y los nombres salen de la lista de jugadores de
  Banfield de `CLAUDE.md` (`SANGUINETTI JAVIER`, `FALCIONI JULIO`, …).
- **HR no va a entregables de Finanzas.** Si el archivo que genera el control lo recibe
  Finanzas/tesorería del cliente y no el equipo de Payroll, lleva sólo lo necesario para pagar
  (legajo, nombre, CUIT, CBU, banco, importe, fecha). Dotación, conteos, altas/bajas y excepciones van
  a la pantalla de resultados, que la ve el analista (D-020).
- **`esc()` en todo valor que entra a un template literal de HTML.** Los nombres de empleados vienen
  de un Excel de un tercero.
- **Ningún color cableado en `js/`, y ningún módulo pregunta por el tema.** `css/tokens.css` es el
  único lugar donde un tema cambia algo; `tests/themeSourceOfTruth.test.js` falla con un `#hex` en
  cualquier módulo de `js/` (D-059). Detalle en `ui-resultados.md`.
- **Consolidación por legajo, `null ≠ 0` y el monto de diferencia (`isDiff`, nunca un `0,01` suelto).**
  Producen números incorrectos que el analista se lleva al cliente.

Todo lo demás de acá es criterio con su porqué: si en tu caso no aplica, decilo y seguí.

## Checklist

```
[ ] parser · ficha en fileTypes.js · módulo · registry · test
[ ] "es diferencia" resuelto con isDiff()/diffStats(), sin 0,01 sueltos (D-069)
[ ] columnas nuevas del Tabulado → su entrada en TAB_FIELD_LABELS (js/ui/fieldHelp.js)
[ ] test agregado a la cadena test:unit de package.json, y `npm run test:unit` pasa
[ ] probado en el navegador con un archivo real, en los tres temas (para servir la app, ver README.md)
[ ] CHANGELOG.md
[ ] ARCHITECTURE.md / DECISIONS.md sólo si cambió un contrato o hubo una decisión no obvia
```

Un control que nunca vio un archivo real no está verificado — si no lo tenés, pedíselo a Willy.
Y si la verificación es contra un armado manual, va de a un caso completo antes de generalizar: el
formato de ese caso está en `CLAUDE.md` § "Verificar contra un armado manual" (D-064).
Y el ciclo de git de CLAUDE.md: commit → PR contra `main` → merge con CI en verde.
