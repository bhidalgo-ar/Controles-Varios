---
name: nuevo-control
description: Agregar un control nuevo a Controles Nómina, o agregar una variante ("Generar Reporte") a uno existente. Cablea los 6 puntos de integración (parser, fileUpload, controlsWizard, módulo del control, registry, test) y aplica los patrones de UI obligatorios del proyecto — hero de diferencias, ocultar filas/columnas sin valor real, semáforo, export. Usar cuando el pedido sea "agregar el control X", "quiero controlar el reporte Y contra el Tabulado", "generar el reporte Z desde el Tabulado", o cualquier variante de sumar un control/reporte nuevo a la batería existente.
---

# Agregar un control nuevo

Un "control" en este proyecto es un cruce entre un reporte de Meta4 y el Tabulado
(o entre dos reportes), con su propia pantalla de resultados y export. Hoy hay 11
entradas en `js/controls/registry.js`.

Agregar uno **no es escribir un archivo**: son 6 puntos de integración. Si falta
uno, el control aparece a medias — típicamente se ve la pill en el wizard pero el
archivo no se puede subir, o se sube pero no se auto-detectan las columnas.

## 0. Antes de escribir código

Preguntale a Willy y no supongas (CLAUDE.md §8: "datos reales, no suposiciones"):

1. **¿Contra qué se cruza?** Tabulado (`tabRequired: true`, el caso normal) u
   otro reporte (como `rend_vs_asiento`, que cruza Rendimiento contra CONTA).
2. **¿Cuáles son los encabezados exactos** del reporte de M4? Sin esto el parser
   y la auto-detección son adivinanza. Pedí el archivo o los headers literales.
3. **¿Qué conceptos/columnas se comparan** y cuál es el signo de la diferencia?
   La convención del repo es `Tabulado − Reporte` (ver `nr.js:108`), y en
   `rend_vs_asiento` es `CONTA − Rend`. Confirmá cuál aplica.
4. **¿Hace falta la variante "Generar Reporte"?** (armar el archivo desde el
   Tabulado en vez de controlarlo). Si sí, va como `group` — ver §5.
5. **¿A qué clientes se le ofrece?** Por defecto `MARVAL_ONLY` — los controles de
   M4 hoy son de Marval (D-015 en `DECISIONS.md`). Si es genuinamente general,
   `scope: 'general'`.

Si el pedido tiene ambigüedad en cualquiera de estos 5 puntos, **pará y preguntá**
antes de tocar archivos. Para features de tamaño medio, considerá pasar primero
por el skill `spec-first`.

## 1. Parser — `js/parsers/<x>Parser.js`

Modelo: `js/parsers/nrParser.js` (75 líneas, el más limpio).

Dos exports obligatorios:

```js
/* global XLSX */
export { detectHeaders } from './nominaMaestra.js';   // re-export, siempre igual

// Devuelve el mapping o null si no reconoce el archivo.
export function autoDetect<X>Mapping(headers, catalogRows) { … }

// Devuelve { parsedRows, parseMetadata: { totalRows, parsedAt } }.
// Tira Error con mensaje en español si el archivo está vacío o falta el mapping.
export function parse<X>(arrayBuffer, mapping) { … }
```

Reglas:

- **Filtrar filas sin identificador.** Los reportes de M4 traen subtotales y
  separadores: se descartan las filas sin legajo válido (`nrParser.js:63-66`).
- **Auto-detección por catálogo, no por string hardcodeado.** Si las columnas son
  conceptos de nómina, usá `buildParserMapping(headers, catalog, CODIGO_TO_KEY)`
  de `conceptMatcher.js` — resuelve alias contra el catálogo del cliente.
  Para columnas de identificación sí van aliases explícitos
  (`LEGAJO_ALIASES = ['LEGAJO', 'ID_EMPLEADO', 'LEGAJO_SAP']`).
- `autoDetect` devuelve `null` (no un objeto vacío) si no encuentra la columna
  identificadora — el wizard lo usa para decidir si pide mapeo manual.

## 2. `js/ui/fileUpload.js` — 4 lugares

Es el punto que más se olvida. Los cuatro:

| Qué | Dónde | Cambio |
|---|---|---|
| Import del parser | encabezado del archivo | `import { parse<X>, autoDetect<X>Mapping } from '../parsers/<x>Parser.js';` |
| `FIELD_DEFS` | mapa de ~línea 23 | agregar `<x>_file: [{ key, label, required }, …]` |
| Línea de metadata | rama `else if (fileType === 'tab_control' \|\| …)` (~línea 355) | sumar `\|\| fileType === '<x>_file'` para que muestre "N registros" |
| `parseFile()` | `switch` (~línea 650) | `case '<x>_file': return parse<X>(arrayBuffer, mapping);` |
| `fileTypeLabel()` | mapa (~línea 669) | `<x>_file: 'Reporte de …',` |

Sobre `FIELD_DEFS`: la columna de legajo va `required: true`, **los conceptos van
todos `required: false`**. Es deliberado — un cliente puede no usar un concepto y
el control tiene que correr igual (ver el comentario de `nr_reporte` en el
registry: "ningún concepto es obligatorio"). Si el tipo de archivo tiene formato
fijo sin mapeo (como `conta_file`), la entrada es `[]`.

## 3. `js/ui/controlsWizard.js`

1. Importar el `autoDetect<X>Mapping` (bloque de imports de parsers, ~línea 30).
2. Registrarlo en el mapa `AUTO_DETECT` (~línea 70), clave = `fileType`.
3. **Solo si hay variantes agrupadas:** agregar la constante de IDs junto a
   `NR_IDS` / `BRUTOS_IDS` / `GS_PERS_IDS` (~línea 80).
4. **Solo si la validación de archivos no es la estándar:** tocar `canGoNext`.
   El único caso hoy es `agrupadores`, que exige "al menos uno de dos archivos
   opcionales". Si tu control tiene un `additionalFiles` normal, **no toques
   `canGoNext`** — la validación genérica ya alcanza.

## 4. Módulo del control — `js/controls/<x>.js`

Tres exports. Modelo de referencia: `js/controls/nr.js`.

### `run(primaryRows, tabRows, mapping)`

- `primaryRows` = filas parseadas de `additionalFiles[0]`. En una variante
  "Generar Reporte" que no pide archivo, llega vacío → nombralo `_primaryRows`.
- `tabRows` = filas del Tabulado (vacío si `tabRequired: false`).
- `mapping` = `{ tab, <key de additionalFiles>, period, …config del control }`.
- Devuelve `{ summary, rows, period }`. Para errores de negocio (falta un archivo,
  no hay agrupadores elegidos) devolvé `{ error: 'mensaje en español' }` — no tires
  excepción (ver `agrupadores.js`).

**Consolidar por legajo, siempre.** Un legajo puede tener varias liquidaciones en
el mismo mes (mensual + baja) y Meta4 informa el total sumado. Copiá
`groupRowsByLegajo` + `sumColumn` de `nr.js:129-150`. Saltear esto es el bug más
caro del proyecto: da diferencias falsas en todos los empleados con doble paga.

`sumColumn` devuelve `null` (no `0`) cuando la columna no está mapeada o ninguna
liquidación tiene dato. `null` significa "no hay dato", `0` significa "hay dato y
es cero" — no los confundas: la diferencia solo se calcula si ambos lados son
distintos de `null`.

### `summarize(results)`

Alimenta la tarjeta colapsada y el semáforo. Forma exacta:

```js
return {
  status:   s.conDif > 0 ? 'warning' : 'success',   // 'success' | 'warning' | 'info'
  headline: `${s.total} registros · …`,
  insights: [{ type: 'warning', label: '…', value: n }],
  unit: 'legajo',            // 'legajo' | 'CC' — mirá controlsResults.js:403
  unitsTotal, unitsWithDiff, // los consume computeSemaforoStatus()
  diffTotalAmount, worstCase,
  contextNote,               // reemplaza a worstCase en la tarjeta si está
};
```

Las tres métricas del medio **no se calculan a mano**: salen de `diffStats()` de
`./semaforo.js`, que recibe las filas y una lista de campos con su getter
(`nr.js:46-50`). La tolerancia default es `0.01`.

Para una variante "Generar Reporte" (no compara nada) el status es `'info'` y
`unit`/`unitsTotal`/`unitsWithDiff`/`diffTotalAmount`/`worstCase`/`contextNote`
van todos en `null` — ver `summarizeNrReporte` (`nr.js:383-395`).

### `renderResults(results, container)`

Acá viven los patrones obligatorios del proyecto (CLAUDE.md §11). En orden:

1. **Guard de vacío:** `if (rows.length === 0)` → `<p class="text-muted">Sin datos.</p>`.
2. **Filtrar filas sin valor real.** Antes de contar cualquier cosa, quedate solo
   con las filas que tienen algún valor distinto de cero en alguno de los campos
   del control — el patrón `hasAnyNrValue` (`nr.js:154-158`). Nunca listes filas
   de un catálogo fijo que están todas en cero.
3. **Hero de "sin diferencia vs con diferencia".** Copiá el bloque de
   `nr.js:190-207` tal cual y adaptá los labels: dos números grandes (verde /
   rojo) y, a la derecha, cuántas filas son evaluables y cuántas se ocultaron por
   no tener valor. Es obligatorio en todo control nuevo.
4. **Early return si no hay diferencias.** Tarjeta verde con ✓ y salí sin dibujar
   tabla (`nr.js:210-219`). Una tabla de ceros no aporta nada.
5. **Toolbar** `class="results-toolbar"`: filtros + buscador a la izquierda,
   `renderExportMenu` a la derecha.
6. **Tabla** `class="data-table data-table--compact"`. Ocultá también las
   **columnas** sin diferencia y decí al pie cuántas se ocultaron
   (`nr.js:284-288, 321-326`).
7. **Paginación y buscador** al final de cada render de tabla:
   `initShowMorePagination(tbody, { pageSize: 50 })` y después
   `initSearchCombobox(...)` pasándole la paginación. Si re-renderizás el
   `<tbody>` (filtro que cambia), hay que re-inicializar los dos.

### Export

`renderExportMenu(el, { onExcel, onCsv, onCopy })`. Las tres salidas exportan
**todas** las filas con diferencia y **todos** los conceptos, sin importar el
filtro de pantalla (`nr.js:257-259`). El `.xlsx` se arma con ExcelJS vía
`loadExcelJS()` de `../utils/exportData.js`; nombre de archivo
`<Control>_<Modo>_${periodSuffix(results.period)}.xlsx`.

## 5. `js/controls/registry.js`

Importar los tres exports y agregar la entrada. Campos: están documentados en el
encabezado del archivo (`registry.js:1-37`) — leelo, no lo repito acá.

Lo que se olvida:

- **`help: { what, how[] }`** — no es opcional en la práctica: es el popover "?"
  que ve el analista. `what` en una o dos oraciones, `how` como pasos imperativos
  ("Bajá el Reporte de X de M4.").
- **`...MARVAL_ONLY`** salvo que Willy confirme que es general.
- **`appliesWhen: () => true`** siempre presente aunque no filtre nada.
- **Variantes agrupadas:** dos entradas separadas (`x` y `x_reporte`) que comparten
  `group: { id: 'x', label: 'X', mode: 'Controlar' | 'Generar Reporte' }`. El
  `group.id` tiene que ser idéntico en las dos o se renderizan como pills sueltas.

## 6. Test — `tests/<x>Control.test.js`

Obligatorio, y hay que **agregarlo a la cadena `test:unit` de `package.json`** o
CI no lo corre. Modelo: `tests/agrupadoresControl.test.js`.

```js
// registry.js importa módulos de UI que registran listeners a nivel de módulo.
globalThis.document = { addEventListener: () => {} };
const { CONTROL_REGISTRY } = await import('./js/controls/registry.js');
```

Ese shim de `document` es necesario porque el test corre en Node. Se invoca desde
la raíz: `node --input-type=module < tests/<x>Control.test.js`.

Qué cubrir como mínimo:

- la entrada existe en el registry y `tabRequired` / `additionalFiles[0].key` son
  los esperados;
- `run()` con datos que **coinciden** → `summarize().status === 'success'`;
- `run()` con una diferencia conocida → la detecta y `unitsWithDiff > 0`;
- **un legajo con dos liquidaciones** → suma en vez de duplicar (esto es el
  regression test de la consolidación, no lo saltees);
- un legajo presente en un lado y ausente en el otro;
- cada rama de `{ error }` de `run()`.

**Datos inventados, nunca reales.** Legajos `'1'`, `'2'`, apellidos `Perez`,
`Gomez`. Nada de exports de clientes en el repo.

## Checklist de cierre

```
[ ] js/parsers/<x>Parser.js        — autoDetect + parse + re-export detectHeaders
[ ] js/ui/fileUpload.js            — import, FIELD_DEFS, metaLine, parseFile, fileTypeLabel
[ ] js/ui/controlsWizard.js        — import + AUTO_DETECT (+ IDS si hay variantes)
[ ] js/controls/<x>.js             — run + summarize + renderResults + export xlsx
[ ] js/controls/registry.js        — imports + entrada con help y scope
[ ] tests/<x>Control.test.js       — + agregado a test:unit de package.json
[ ] npm run test:unit              — pasa
[ ] CHANGELOG.md                   — entrada del control nuevo
[ ] ARCHITECTURE.md                — solo si cambió un schema o el contrato del registry
[ ] DECISIONS.md                   — solo si hubo una decisión no obvia
```

Y el ciclo de git de CLAUDE.md §7: commit → push → PR → merge a main.

## Errores concretos a no cometer

- **No consolidar por legajo.** Diferencias falsas en todo empleado con más de una
  liquidación en el mes. El bug más caro del repo. (Única excepción hasta hoy:
  `acreditaciones.js`, donde la unidad del reporte es la acreditación y no el
  empleado-mes — ver D-021. Si crees estar en ese caso, confirmalo con Willy.)
- **Meter información de HR en un entregable que va a Finanzas.** Si el archivo que
  genera el control lo recibe Finanzas/tesorería del cliente y no el equipo de
  Payroll, no lleva dotación, conteos de empleados, altas/bajas ni atributos del
  empleado: sólo lo necesario para pagar. Eso va en la pantalla de resultados, que
  la ve el analista. Ver `CLAUDE.md` §6.5 y D-020.
- **Confundir `null` con `0`.** `null` = sin dato, `0` = cero real. La diferencia
  se calcula solo si los dos lados son distintos de `null`.
- **Comparar con `!==` en vez de tolerancia.** Siempre
  `Math.abs(diff) > 0.01`; los floats de Excel no dan igualdad exacta.
- **Interpolar sin escapar.** Todo valor que entra a un template literal de HTML
  pasa por `esc()`. Los nombres de empleados vienen de un Excel de tercero.
- **Colores hardcodeados.** Variables CSS de `css/tokens.css`
  (`var(--color-danger)`, `var(--color-success)`, `var(--sp-3)`). Las únicas
  constantes de color aceptadas son los tintes por grupo de concepto, y van
  declaradas arriba del módulo y compartidas entre tabla y export
  (`nr.js:167-170`).
- **`console.log` de datos de empleados.** Prohibido (CLAUDE.md §6.2). Limpiá
  antes de commitear.
- **Formatear números a mano.** `toLocaleString('es-AR', { minimumFractionDigits: 2,
  maximumFractionDigits: 2 })`, y `'—'` para `null` (`nr.js:160-162`).
- **Listar filas o columnas vacías.** El criterio del proyecto es mostrar solo lo
  que tiene valor real (CLAUDE.md §11.1).

## Verificar en el navegador

La app usa ES modules: **no funciona con doble click desde `file://`**. Servila:

```
python3 -m http.server 8000
```

y abrí `http://localhost:8000`. El flujo para probar: cliente → Controles →
elegir el control nuevo → cargar Tabulado + reporte → Ejecutar. Si no tenés un
archivo de prueba, pedíselo a Willy antes de dar el control por terminado — un
control que nunca vio un archivo real no está verificado.
