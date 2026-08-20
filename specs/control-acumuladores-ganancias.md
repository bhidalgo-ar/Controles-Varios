# Control Acumuladores Ganancias (Axton) — spec

**Estado:** implementado. **Ver D-026 en `DECISIONS.md`** para las decisiones de
diseño (entrada multi-archivo, solapas, códigos de acumulador, período por
archivo) y el módulo `js/controls/acumuladoresGanancias.js`.
**Origen del pedido:** Guillermo, 2026-08-06. Archivo de referencia: export
`repacumuladores.20260728.102501` de Axton de Plastic Omnium Pilar (POP), con
4.564 filas crudas y las cuatro hojas del armado manual (`TD TODOS`, `DATOS`,
`SAC TEORICO`, `07-2026`).

## Para qué sirve

Genera, desde los crudos de acumuladores de Axton, el archivo mensual que hoy el
analista arma a mano en Excel con dos tablas dinámicas encadenadas y un VLOOKUP
por mes.

Es un control de **generación**, no de cruce: no compara nada contra el Tabulado,
no tiene semáforo ni hero de diferencias. `tabRequired: false`, status `'info'`.

**Alcance:** todos los clientes Axton (`scope: 'sistema'`,
`sourceSystems: ['axton']`). Se prueba con POP.

**Segundo control Axton del proyecto**, después de `acreditaciones` (ver D-021 y
`specs/control-acreditaciones-axton.md`). Los otros 11 son de reportes Meta4
(D-015).

## Archivo de entrada

Export `repacumuladores` de Axton. **Formato largo: una fila por legajo ×
acumulador.** Encabezados en la fila 1, datos desde la 2:

`Legajo` · `Apellido y Nombre` · `CUIL` · `Ingreso` · `Egreso` · `Nro` ·
`Acumulador` · `Operacion` · `Valor` · `Empresa`

### La columna `Operacion` es la clave del parser

| `Operacion` | Qué es | Columnas de identificación |
|---|---|---|
| `SUMA` | acumulado **hasta el mes anterior**, una fila por legajo y acumulador | trae `CUIL`, `Ingreso`, `Empresa` |
| vacía | valores **del mes propio del archivo**, **una fila por liquidación** | vienen vacías |

Verificado en el archivo de POP de julio:

- Legajo de referencia (una liquidación en el mes), Bruto para ganancias: `SUMA` 24.346.073,30 + mes 5.375.194,53 =
  29.721.267,83, que es exactamente lo que muestra `TD TODOS`.
- Legajo con dos quincenas: **dos filas de mes** para el mismo acumulador (una por quincena),
  1.191.045,59 + 861.586,72. 204 de los 308 legajos están en esta situación.
- Los totales por legajo de las filas de `Operacion` vacía coinciden exactamente
  con la suma de las liquidaciones del mes (contrastado contra la hoja `07-2026`,
  que es un export distinto que el equipo arma para otro control).

**Consolidar por legajo es obligatorio** (regla del skill `nuevo-control`): las
filas de mes vienen partidas por liquidación y hay que sumarlas. Saltear esto
duplicaría o subestimaría el mes en dos tercios de la nómina.
`js/controls/acumuladoresGanancias.js` → `consolidateFile()` cubre esto; el
regression test vive en `tests/acumuladoresGananciasControl.test.js`
("legajo 2: las dos liquidaciones... se SUMAN, no se duplican").

**El CUIL y la fecha de ingreso solo vienen en las filas `SUMA`.** No se usan en
la salida del control (ver "Identificación de legajo" más abajo — Guillermo
decidió Legajo + Nombre, sin CUIL) — el parser los captura igual por si hacen
falta a futuro, pero el módulo del control no los resuelve ni los muestra.

### Acumuladores presentes

| Nro | Acumulador |
|---|---|
| 1100 | Bruto para ganancias |
| 1101 | No Remunerativo gravado por IIGG |
| 1107 | Retribuciones no habituales |
| 1108 | SAC primera cuota |
| 1109 | SAC segunda cuota |
| 1120 | Retención sobre bruto - jubilación |
| 1121 | Retencion sobre bruto - sindicato (sin tilde en el origen) |
| 1122 | Retención sobre bruto - obra social |
| 1137 | Excluye del SAC teorico (sin tilde en el origen) |
| 1150 | Retenciones efectuadas (= retenciones de Impuesto a las Ganancias) |

Matchear por **`Nro`, no por el texto** del acumulador: el origen mezcla
acentuación (`Retencion` vs `Retención`, `teorico` sin tilde). El texto sirve
como fallback y para el rótulo.

**Ese juego de 10 es el del crudo de POP, no el de todo Axton.** El crudo de Epiroc trae además `1103`
(Bruto para Ganancias Prorrateado), que la planilla manual del cliente usa y que hoy se ignora en
silencio. Si entra en el juego base o no es una de las tres definiciones abiertas de **D-063** — y el
corolario que quedó escrito ahí es que "en Axton el `repacumuladores` es igual para todos" vale para los
encabezados, no para los acumuladores presentes.

**Decisión (D-026):** los códigos van **hardcodeados como default**
(`ACUMULADORES` en `acumuladoresGanancias.js`), con **override por cliente**
persistido en `controlConfigs` (`acumuladores_config`, igual mecanismo que
`acreditaciones_config`) — todavía no se confirmó si otra cuenta Axton numera
distinto, y el override cubre ese caso sin necesitar tocar código.

### El período del archivo

El crudo **no trae el período en ninguna columna**. Se saca del nombre del
archivo (`repacumuladores.20260728.102501` → 07-2026, la fecha es la de
generación).

**Decisión (D-026):** se infiere del nombre del archivo como punto de partida y
queda **editable por archivo** (`initAcumuladoresMultiUpload` en
`js/ui/fileUpload.js`, un `<input type="month">` por crudo cargado) — la fecha
de generación no siempre cae en el mes de los datos, así que el analista lo
corrige antes de ejecutar. Un archivo sin período asignado hace que `run()`
devuelva `{ error }` en vez de ejecutar con datos ambiguos.

## Entrada múltiple: N crudos, uno por mes

Es lo que diferencia este control de todos los demás del registry (salvo
Contabilidad Desglosada, ver más abajo).

El analista sube **un crudo por cada mes que entra en el cálculo del SAC
teórico**. Procesando agosto:

- **RG 4030** (semestre): julio y agosto → 2 archivos
- **RG 4003** (año calendario): enero a agosto → 8 archivos

El **mes de proceso** es el del crudo más nuevo. Los demás solo aportan su
doceava parte.

**Decisión (D-026):** no se extendió el contrato de `additionalFiles` del
registry (el flag `multi: true` que planteaba la primera versión de esta spec).
`conta_file` (Contabilidad Desglosada, D-018) ya había resuelto el mismo
problema — "N archivos del mismo tipo en un solo slot" — con
`initContaMultiUpload`. Acumuladores reusa el mecanismo
(`initAcumuladoresMultiUpload`), agregándole el período editable por archivo
que CONTA no necesita. El wizard (`canGoNext`, `executeControls`,
`saveControlRunFile`) no se tocó: para esas piezas, Acumuladores sigue siendo un
`additionalFiles` de un solo slot como cualquier otro control.

### El toggle RG 4003 / RG 4030

Se pregunta **antes de ejecutar** y su función es **validar**, no recortar: con
el mes de proceso y el régimen elegido, la app sabe qué meses tiene que haber y
avisa si falta o sobra un crudo antes de correr.

| Régimen | Ventana esperada | Ejemplo procesando agosto |
|---|---|---|
| RG 4003 | enero → mes de proceso | 01 a 08 |
| RG 4030 | inicio del semestre → mes de proceso (enero-junio o julio-diciembre) | 07 y 08 |

**Decisión (D-026):** el toggle vive en el bloque de configuración del control
(`renderAcumuladoresConfigEditor`), dentro del Paso 2 del wizard — mismo lugar
donde ya viven los de Rendimiento vs Asiento, Agrupadores y Acreditaciones. No
se agregó un paso nuevo del wizard.

## Reglas de cálculo

### Doceava parte (SAC teórico)

Por cada crudo subido, sobre los **valores propios de ese mes** (filas de
`Operacion` vacía, consolidadas por legajo):

```
doceava_mes = ( Bruto para ganancias
              + Retribuciones no habituales
              + No Remunerativo gravado por IIGG
              + SAC segunda cuota
              − Excluye del SAC teorico
              − Retención sobre bruto - jubilación
              − Retención sobre bruto - obra social
              − Retencion sobre bruto - sindicato ) / 12
```

`SAC primera cuota` **no entra** (el SAC teórico se calcula sobre los ingresos
remunerativos y no remunerativos del mes, sin SAC). `Retenciones efectuadas`
tampoco: son retenciones del impuesto, no remuneración.

**La columna SAC TEORICO del entregable es la suma de las doceavas de todos los
meses subidos.** Procesando agosto con RG 4030: doceava de julio + doceava de
agosto. Si julio dio 5 y agosto 5, la columna muestra 10.

Un mes en el que el legajo no tiene **ninguna** fila propia (no liquidó ese mes:
alta posterior, por ejemplo) aporta doceava `null`, que se excluye de la suma —
no se cuenta como cero. Si el legajo tiene alguna fila ese mes pero le falta un
concepto puntual (p. ej. no le corresponde SAC segunda cuota ese mes), ese
concepto se trata como 0 en la fórmula — mismo criterio que `sumColumn` en
`nr.js`.

Nota de diseño, por si aparece la tentación de simplificar: dividir por 12 y
sumar conmuta, así que la suma de las doceavas es igual a la doceava del
acumulado de la ventana. El motivo de recorrer mes a mes es que el crudo no
permite reconstruir un mes anterior por separado, no la aritmética.

### Tolerancia y nulos

Regla general del proyecto: `null` = sin dato, `0` = cero real. Un acumulador
ausente para un legajo es `null`, no `0`. Comparaciones siempre con
`Math.abs(x) > 0.01`.

## Salida — el .xlsx

Dos hojas.

### Hoja `MM-AAAA` (nombrada con el mes de proceso, ej. `07-2026`)

Una fila por legajo (Legajo + Apellido y Nombre + los 10 conceptos). Las nueve
columnas de conceptos son **del mes de proceso solamente**; la décima es la
acumulada de la ventana. **Incluye a todos los legajos, también a los sin
movimiento en el mes (en cero)** — a diferencia de la pantalla, que los oculta
(ver "Salida — la app"). Fila de totales al pie.

| # | Columna | Origen |
|---|---|---|
| 1 | Bruto para ganancias | mes de proceso |
| 2 | Retribuciones no habituales | mes de proceso |
| 3 | No Remunerativo gravado por IIGG | mes de proceso |
| 4 | SAC segunda cuota | mes de proceso |
| 5 | Excluye del SAC teorico | mes de proceso |
| 6 | Retención sobre bruto - jubilación | mes de proceso |
| 7 | Retención sobre bruto - obra social | mes de proceso |
| 8 | Retencion sobre bruto - sindicato | mes de proceso |
| 9 | Retenciones efectuadas | mes de proceso |
| 10 | SAC TEORICO | suma de doceavas de todos los meses subidos |

### Hoja `DATOS`

Una fila por legajo, sobre el **acumulado del año**, que sale del crudo más nuevo
(`SUMA` + sus propias filas de mes). No se suman los crudos entre sí. Fila de
totales al pie.

| # | Columna | Cálculo |
|---|---|---|
| 1 | Bruto para ganancias | acumulado |
| 2 | Excluye del SAC teorico | acumulado |
| 3 | No Remunerativo gravado por IIGG | acumulado |
| 4 | Retribuciones no habituales | acumulado |
| 5 | SAC primera cuota | acumulado |
| 6 | SAC segunda cuota | acumulado |
| 7 | TOTAL | 1 + 3 + 4 + 5 + 6 (**sin** «Excluye del SAC teorico») |
| 8 | jubilación | acumulado |
| 9 | obra social | acumulado |
| 10 | sindicato | acumulado |
| 11 | IMPUESTO | Retenciones efectuadas, acumulado |

### Formato

Números con `#,##0.00`. Legajo como número. Encabezados congelados y
autofiltro. Nombre del archivo `Acumuladores_Ganancias_<MM-AAAA>.xlsx`.

## Salida — la app

Presentación al estilo del motor SIRADIG F572 de H&A (tira de KPIs arriba,
solapas, tablas paginadas con filtros) — ver
`specs/referencia-patron-siradig.md` para el detalle de la referencia visual y
qué de ese patrón se reutiliza.

**Decisiones tomadas (D-026):**

- **Identificación de legajo:** Legajo + Apellido y Nombre, sin CUIL (dato
  personal innecesario para revisar acumuladores).
- **Legajo sin movimiento en el mes de proceso:** desaparece de la solapa
  `MM-AAAA` en pantalla (con un KPI que cuenta cuántos quedaron afuera), pero
  se incluye en el `.xlsx` en cero. Es una excepción puntual al criterio general
  del proyecto ("mostrar sólo lo que tiene valor real"): acá el entregable tiene
  que traer la nómina completa porque reemplaza el armado manual, mientras que
  la pantalla se filtra para que se revise mejor.
- **Fila de totales:** sí, en pantalla y en el Excel.
- **Solapas vs. tablas apiladas:** solapas (`MM-AAAA` / `DATOS`), con el
  componente nuevo `js/ui/tabs.js` (`initTabs`) — reusable para el resto de los
  controles.

Patrones obligatorios de `CLAUDE.md` §11 / skill `nuevo-control` que **no**
aplican acá (control de generación, no de cruce): hero de diferencias,
semáforo, early-return verde. Los que sí siguen aplicando: ocultar filas y
columnas sin valor real (en pantalla), paginación (`initShowMorePagination`),
buscador (`initSearchCombobox`), y export — acá **un solo menú al final**, no
uno por tabla, que arma el `.xlsx` con las dos hojas.

## Verificación contra el archivo real

Corriendo con el crudo de julio de POP (RG 4030, un solo mes):

- 308 legajos en `DATOS`, 307 con movimiento en el mes;
- `DATOS` legajo de referencia: Bruto 29.721.267,83 · No Rem gravado 93.063,88 · SAC 1ra
  2.350.322,84 · jubilación 4.164.817,54 · obra social 892.460,91 · IMPUESTO
  1.108.705,52;
- `07-2026` legajo de referencia: Bruto 5.375.194,53 · No Rem gravado 92.663,88 ·
  jubilación 631.339,44 · obra social 135.287,02 · Retenciones efectuadas
  296.740,47;
- legajo con dos quincenas, mes: Bruto 1.191.045,59 + 861.586,72 = 2.052.632,31 (regression
  test de la consolidación por legajo, cubierto en
  `tests/acumuladoresGananciasControl.test.js`).

**Pendiente, y ahora con Epiroc en vez de POP:** falta correr el control
end-to-end en el navegador con el `.xlsx` real y comparar contra el armado
manual del cliente (la verificación de arriba fue contra los números ya
conocidos de la spec — ver checklist de `nuevo-control`: "un control que nunca
vio un archivo real no está verificado"). El cliente de prueba pasa a ser
**Epiroc**, el único Axton con serie mensual completa (04 a 07/2026); de POP
sólo hay extractos de un legajo. Y **la comparación no arranca hasta que estén
contestadas las tres definiciones de D-063** (`1101`, `1137`, `1103`): hoy la
columna AG de la planilla de Epiroc no reconcilia con `calcDoceava`, y la
fórmula no se ajusta a la planilla antes de confirmar el criterio. La
verificación se pasa de a un caso completo, no como conteo agregado (D-064).
