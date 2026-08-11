---
name: nuevo-control
description: Agregar un control nuevo a Controles Nómina, o una variante ("Generar Reporte") de uno existente. Cablea los 6 puntos de integración (parser, fileUpload, controlsWizard, módulo, registry, test) y las reglas que hacen que el resultado sea correcto — consolidación por legajo, null vs 0, semáforo por unidad declarada. Usar cuando el pedido sea "agregar el control X", "controlar el reporte Y contra el Tabulado", "generar el reporte Z desde el Tabulado", o cualquier variante de sumar un control a la batería.
---

# Agregar un control nuevo

Un control cruza un reporte de Meta4 (o de Axton) contra el Tabulado, o dos reportes entre sí.
Agregarlo **no es escribir un archivo**: son 6 puntos de integración, y el que se olvida siempre es
`fileUpload.js`. Síntoma típico: la pill aparece en el wizard pero el archivo no se puede subir.

Referencias, todas código y todas vigentes: `js/controls/nr.js` (control de referencia, los dos
modos), `js/parsers/nrParser.js` (parser de referencia), el encabezado de `js/controls/registry.js`
(contrato de la entrada, campo por campo), `tests/gsPersControl.test.js` (la regla de consolidación
escrita como test).

## Antes de escribir código

Willy prefiere que preguntes a que supongas. Cinco cosas que el código no te va a decir:

1. Contra qué se cruza: el Tabulado (el caso normal) u otro reporte — `rend_vs_asiento` cruza
   Rendimiento contra CONTA.
2. Los encabezados **exactos** del reporte. Sin el archivo real o los headers literales, el parser y
   la auto-detección son adivinanza. Pedilos.
3. Qué conceptos se comparan y el signo de la diferencia. La convención es `Tabulado − Reporte`;
   `rend_vs_asiento` usa `CONTA − Rend`. Confirmá cuál aplica.
4. Si hace falta la variante "Generar Reporte" (armar el archivo desde el Tabulado en vez de
   controlarlo). Si sí, van dos entradas de registry bajo el mismo `group.id`.
5. A qué clientes se ofrece. El default es el cliente que lo pidió (D-015); `scope: 'general'` sólo
   si Willy lo confirma.

## Los 6 puntos

| # | Archivo | Qué |
|---|---|---|
| 1 | `js/parsers/<x>Parser.js` | `parse<X>`, `autoDetect<X>Mapping`, re-export de `detectHeaders` |
| 2 | `js/ui/fileUpload.js` | **cinco** lugares — ver abajo |
| 3 | `js/ui/controlsWizard.js` | import + entrada en `AUTO_DETECT` |
| 4 | `js/controls/<x>.js` | `run` / `summarize` / `renderResults` |
| 5 | `js/controls/registry.js` | imports + entrada (los campos, en el encabezado del archivo) |
| 6 | `tests/<x>Control.test.js` | + agregarlo a la cadena `test:unit` |

### 1 — el parser

Seguí la forma de `nrParser.js`. Dos cosas que no se deducen del archivo:

- `autoDetect<X>Mapping` devuelve **`null`**, no un objeto vacío, cuando no encuentra la columna
  identificadora — el wizard usa ese `null` para decidir si pide mapeo manual.
- Los reportes de M4 traen subtotales y separadores mezclados con los datos: descartá las filas sin
  legajo válido antes de devolver nada.

### 2 — `fileUpload.js`, los cinco lugares

El import, `FIELD_DEFS`, `parseFile()`, `fileTypeLabel()` — y la cadena de `||` de la rama que arma
la línea de metadata (`grep -n "fileType === 'tab_control'" js/ui/fileUpload.js`). Ese quinto es el
que se olvida: sin él el archivo sube pero no muestra "N registros".

En `FIELD_DEFS`, el legajo va `required: true` y los conceptos `required: false`: un cliente puede no
liquidar un concepto y el control tiene que correr igual. Un tipo de archivo de formato fijo
(`conta_file`) va con `[]`.

### 3 — `controlsWizard.js`

Alcanza con importar el `autoDetect` y registrarlo en `AUTO_DETECT` con clave = `fileType`.
`canGoNext` no se toca salvo que la validación no sea "están todos los archivos requeridos" — el
único caso hoy es `agrupadores` ("al menos uno de dos opcionales"). Si hay variantes agrupadas, sumá
la constante de IDs junto a las que ya están.

### 4 — el módulo del control

**Consolidar por legajo.** El Tabulado trae una fila **por liquidación**, no por empleado: un legajo
con mensual + baja aparece dos veces y Meta4 informa el total sumado. Sin consolidar, la última
liquidación pisa a las anteriores → diferencias falsas en todo empleado con doble paga. Ya pasó tres
veces (Brutos, NR, GS Pers).

No lo escribas de cero ni lo copies. Buscá primero:

```
grep -rn "function sumColumn\|function sumTabColumn" js/
```

Si hay un módulo compartido, **importalo**. Si todavía sigue duplicado en `nr.js` / `brutos.js` /
`gsPers.js` / `variaciones.js`, extraelo a un módulo compartido en tu mismo PR y hacé que esos cuatro
importen de ahí — sale más barato que mantener la quinta copia, y es lo que la Fase 1 del ROADMAP
tiene planeado igual. La regla está escrita como test ejecutable en `tests/gsPersControl.test.js`:
copiá **ese escenario** a tu test. Copiar tests está bien; copiar lógica de producción es
exactamente lo que produjo el bug tres veces.

Excepción conocida: `acreditaciones.js`, donde la unidad del reporte es la acreditación y no el
empleado-mes (D-021). Si creés estar en ese caso, confirmalo con Willy.

**`null` no es `0`.** `null` = la columna no está mapeada o ninguna liquidación trajo dato; `0` = hay
dato y vale cero. La diferencia se calcula sólo si los dos lados son distintos de `null`, y se compara
con `Math.abs(diff) > 0.01` — los floats de Excel no dan igualdad exacta.

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

### 5 — el registry

Los campos están documentados en el encabezado de `js/controls/registry.js`. Lo que se olvida:
`help: { what, how[] }` es el popover "?" que ve el analista — `what` en una o dos oraciones, `how`
como pasos imperativos ("Bajá el Reporte de X de M4."). Y en variantes agrupadas, el `group.id` tiene
que ser idéntico en las dos entradas o se renderizan como pills sueltas.

### 6 — el test

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
  tests, datos inventados: legajos `'1'`/`'2'`, apellidos `Perez`/`Gomez`.
- **HR no va a entregables de Finanzas.** Si el archivo que genera el control lo recibe
  Finanzas/tesorería del cliente y no el equipo de Payroll, lleva sólo lo necesario para pagar
  (legajo, nombre, CUIT, CBU, banco, importe, fecha). Dotación, conteos, altas/bajas y excepciones van
  a la pantalla de resultados, que la ve el analista (D-020).
- **`esc()` en todo valor que entra a un template literal de HTML.** Los nombres de empleados vienen
  de un Excel de un tercero.
- **Consolidación por legajo, `null ≠ 0` y tolerancia 0,01.** Producen números incorrectos que el
  analista se lleva al cliente.

Todo lo demás de acá es criterio con su porqué: si en tu caso no aplica, decilo y seguí.

## Checklist

```
[ ] parser · fileUpload (5 lugares) · wizard · módulo · registry · test
[ ] test agregado a la cadena test:unit de package.json, y `npm run test:unit` pasa
[ ] probado en el navegador con un archivo real (para servir la app, ver README.md)
[ ] CHANGELOG.md
[ ] ARCHITECTURE.md / DECISIONS.md sólo si cambió un contrato o hubo una decisión no obvia
```

Un control que nunca vio un archivo real no está verificado — si no lo tenés, pedíselo a Willy.
Y el ciclo de git de CLAUDE.md: commit → PR contra `main` → merge con CI en verde.
