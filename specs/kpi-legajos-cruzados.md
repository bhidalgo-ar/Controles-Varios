# Spec — "Legajos cruzados" cuenta empleados, no filas del Tabulado

**Estado:** **implementada** el 2026-08-13 (`js/controls/consolidate.js`, `js/ui/controlsResults.js`,
`js/ui/controlsWizard.js`, `tests/legajosCruzados.test.js`)
**Fecha:** 2026-08-13
**PR:** nuevo, contra `main` (el PR #133 de las etiquetas del hero ya está mergeado y no se puede reusar)

---

## El problema

El Tabulado trae **una fila por liquidación**, no por empleado: un legajo con la mensual y la baja del
mismo mes aparece dos veces. El KPI "Legajos cruzados" del hero cuenta filas, así que con 4 empleados
donde uno tiene doble liquidación muestra **5**.

`js/ui/controlsResults.js:272-275`:

```js
const totalLegajosCruzados = tabFile?.parseMetadata?.totalRows
  ?? legajoCtrls.reduce((max, c) => Math.max(max, c.summary.unitsTotal), 0);
```

`parseMetadata.totalRows` es `parsedRows.length` crudo — las tres ramas del parser
(`js/parsers/tabuladoControl.js:196`, `:233`, `:272`) lo setean así, sin agrupar por legajo, y nadie lo
toca entre el parser y la pantalla.

Que el número está mal —y no es "otra definición válida"— lo prueba el propio fallback de la línea 275:
para ese mismo archivo da **4**. Con Tabulado dice 5, sin Tabulado dice 4. El mismo dato, dos números,
según qué archivos traiga la corrida.

Es el bug que CLAUDE.md marca como el más caro del repo (consolidar por legajo), esta vez en un KPI de
pantalla en lugar de en un cruce. Deuda previa del 6 de agosto, confirmada por auditoría.

**Decisión de Willy (2026-08-13):** se alinean **las tres pantallas** en este mismo PR, para que el
analista no vea 5 al ejecutar y 4 al ver el resultado del mismo archivo.

---

## 1. Guardrails — qué puede modificar y qué no

**Puede modificar:**
- `js/ui/controlsResults.js` — el cálculo del KPI del hero.
- `js/ui/controlsWizard.js` — el texto del botón de ejecutar (`:1871`) y el paso "Cruzando N legajos"
  (`:1627`/`:1644`).
- `js/controls/consolidate.js` — para agregar ahí el helper compartido que cuenta empleados únicos
  (es el módulo que ya existe justamente para que esta regla no se escriba una quinta vez).
- `package.json` — sumar el test nuevo a la cadena de `test:unit`.
- `tests/` — el test nuevo.

**No puede modificar (ni "de paso"):**
- **`js/parsers/tabuladoControl.js`.** `parseMetadata.totalRows` **sigue siendo filas** y sigue
  significando filas: es un dato del archivo, correcto como está, y hay pantallas y validaciones que lo
  usan con ese significado. El arreglo va en quien lo consume, no en el parser.
- **El esquema de `controlRunFiles`** (`js/db.js`). No se agregan campos ni migraciones: `parsedRows` y
  `mapping.empleadoColumn` ya viajan en el registro del run (`js/db.js:569`), y el `legajoKeyMode` del
  cliente está en el `client` que la pantalla de resultados ya carga (`controlsResults.js:32-37`) — ojo,
  **no** está en `tab.mapping`.
- **`js/utils/legajo.js`.** Se usa `makeLegajoKey()` tal como está. Nunca `String(v).trim()` a mano ni
  `parseInt` (D-038: `parseInt` colapsa `'12-B'` y `'12-C'` en `12`).
- **El resumen del Paso 3 del wizard** (`controlsWizard.js:1520`, "Tabulado: archivo.xlsx (5 registros)").
  Ahí dice "registros" y 5 filas es el número correcto — es la única pantalla donde el conteo de filas es
  el dato útil, porque le avisa al analista que el archivo trae doble liquidación. Decisión de Willy.
- Cualquier cosa que el arreglo anterior (etiquetas de unidad del hero, PR #133) ya tocó y dejó andando.

---

## 2. Comportamientos a preservar

- **Las etiquetas de unidad del hero** (PR #133) siguen igual — `tests/heroUnitNaming.test.js` tiene que
  seguir pasando, incluido el assert de que "Legajos cruzados" sale del Tabulado.
- **`parseMetadata.totalRows` sigue devolviendo filas.** Verificación: los tests del parser de Tabulado y
  el resumen del Paso 3 del wizard no cambian de número.
- **El semáforo, los tiers y `computeSemaforoStatus` no se tocan.** Este KPI es informativo: no entra en
  ningún cálculo de estado. Verificación: la cadena completa de `test:unit` en verde.
- **Un Tabulado sin columna de empleado mapeada no puede tirar la pantalla.** Hoy el KPI muestra un número
  igual; después del cambio tiene que seguir mostrando algo coherente y no romper el render.
- **La clave de legajo del cliente se respeta.** `'007'` y `'7'` son el mismo empleado salvo que el cliente
  diga `trim` (D-038/D-042). Verificación: assert con los dos modos.

---

## 3. Scope

**Entra:**
1. Un helper compartido en `js/controls/consolidate.js` que cuenta **claves de legajo únicas** de un set de
   filas, con `makeLegajoKey(legajoKeyMode)`. Un solo lugar para la regla, usado por las tres pantallas —
   si vive duplicado en dos archivos, es el quinto arreglo del mismo bug esperando a pasar.
2. El KPI "Legajos cruzados" del hero cuenta empleados únicos del Tabulado.
3. El botón del wizard ("▶ Ejecutar N controles sobre X legajos") y el paso de ejecución
   ("Cruzando X legajos") usan la misma cuenta.
4. Test con el legajo de doble liquidación, sumado a la cadena de `test:unit` en `package.json`.

**El fallback — decisión propia, como pediste:** se **conserva tal cual está** (el mayor `unitsTotal`
entre los controles por legajo). El motivo es que, una vez que la rama principal cuenta empleados únicos,
las dos ramas pasan a medir **lo mismo**: empleados, no filas. Hoy se contradicen (5 vs 4) porque una
cuenta filas del Tabulado y la otra empleados del reporte; después del cambio las dos dan 4 para el mismo
archivo. La diferencia de fuente queda —una mira el Tabulado, la otra los reportes— pero deja de haber dos
definiciones para el mismo KPI, que es el problema real. Lo dejo escrito como assert: **las dos ramas
tienen que dar el mismo número para el archivo del caso de test**. La alternativa era esconder el KPI
cuando no hay Tabulado, y descarta información que hoy el analista ve y es correcta.

**Explícitamente afuera:**
- Cambiar `parseMetadata.totalRows` en el parser, o agregar ahí un conteo de empleados (ver guardrails).
- El "(N registros)" del resumen del Paso 3 del wizard.
- Renombrar el KPI o cambiar su etiqueta ("Legajos cruzados" queda).
- Cualquier otro uso de `totalRows` que aparezca en el camino y no sea uno de los tres sitios listados —
  se reporta, no se arregla.
- Revisar si otros KPIs o headlines de otros controles tienen el mismo problema. Si aparece alguno, se
  reporta al final y queda para otro PR.

---

## 4. Evals

- **Método:** test unitario nuevo (`node --input-type=module`, patrón del repo, datos 100% inventados) +
  la cadena completa de `test:unit` + revisión en el navegador de las tres pantallas.
- **Criterio de éxito concreto:**
  1. Un Tabulado inventado de 5 filas / 4 empleados, con un legajo repetido en dos liquidaciones, da
     **4** en el hero y **4** en el texto del wizard.
  2. Para ese mismo archivo, la rama con Tabulado y la rama del fallback dan **el mismo número**.
  3. `'007'` y `'7'` cuentan como **un** empleado en modo `sin_ceros` y como **dos** en modo `trim`.
  4. Filas sin legajo no cuentan como un empleado más (`legajoKey` devuelve `''` y se descarta).
  5. `tests/heroUnitNaming.test.js` y el resto de la cadena de `test:unit`, en verde.
- **Quién revisa antes de cerrar:** el test decide 1-5; Willy revisa el número en pantalla.

---

## 5. Autonomía

**Se decide solo:**
- El nombre y la firma del helper, y su ubicación exacta dentro de `consolidate.js`.
- Cómo se evita recalcular la cuenta en cada re-render del wizard (el botón se recalcula en vivo con cada
  cambio de selección).
- El texto de los comentarios y del test.
- Qué pasa cuando la columna de empleado no está mapeada o `parsedRows` no viaja: se cae al fallback
  existente en vez de mostrar 0 — un 0 ahí sería un default silencioso, y CLAUDE.md lo trata como bug.

**Se consulta antes de avanzar:**
- Cualquier cambio de texto visible más allá del número (renombrar el KPI, agregar aclaraciones tipo
  "4 empleados / 5 liquidaciones").
- Si aparece que hay que tocar el parser o el esquema de la base para que esto cierre.
- Si el número correcto resulta ambiguo para algún archivo real (por ejemplo un Tabulado donde muchas
  filas no traen legajo).
- Cualquier otro sitio con el mismo bug: se reporta, no se arregla.

---

## 6. Condición de salida

**Se para cuando:**
- Los 5 criterios de la sección 4 se cumplen, el test nuevo está en la cadena de `package.json`, las tres
  pantallas están revisadas en el navegador (claro y oscuro), y el PR está abierto con el CI en verde.

**Explícitamente NO:**
- Unificar otros conteos o KPIs que aparezcan de paso.
- Refactorizar `controlsWizard.js` más allá de los dos textos en scope (es un archivo grande y tentador).
- Tocar el parser de Tabulado ni el esquema de la base.
- Cambiar la etiqueta del KPI ni agregar información nueva a la tarjeta.
- Seguir después de que el CI esté verde: lo que quedó afuera se reporta.

---

**Confirmada por el usuario:** sí (Willy, 2026-08-13)

**Cabo suelto reportado, fuera de scope.** El subtítulo del hero suma el `unitsTotal` de cada control,
así que dos controles sobre 4 empleados dicen "8 legajos verificados sin diferencias" — el mismo empleado
contado una vez por control. Es el mismo tipo de bug en otro número y necesita una decisión de Willy sobre
qué debería decir ahí. No se tocó.
