# Asiento de Remuneraciones — FINADIET

**Estado:** implementado — `reportes/finadiet-asiento-remuneraciones.html`, cubierto por
`tests/e2e/finadietAsiento.spec.js`.

**Qué es:** no es un control de la app (no compara dos archivos ni corre contra el `CONTROL_REGISTRY`).
Es una **herramienta generadora**: a partir del excel mensual de conceptos liquidados de FINADIET, arma el
excel del asiento contable de remuneraciones — el archivo que Payroll le entrega a Contaduría/Finanzas del
cliente para que lo cargue en su sistema contable. Mismo patrón standalone que
`reportes/opmobility-variaciones.html` (D-022): un HTML único, sin servidor, que se abre con doble click y
procesa todo en el navegador de quien lo usa — ningún dato de FINADIET sale de esa computadora.

**Origen:** lógica validada con Gaby Fukuhara sobre datos de muestra reales de FINADIET (12/08/2026).
El instructivo completo para el equipo (paso a paso de uso, cómo leer los avisos, y esta misma lógica de
armado) vive en el proyecto de Claude "FINADIET salidas contables", junto con los excels de prueba y la
versión de referencia de la tabla de cuentas/centros de costo — no se suben al repo (contienen datos del
cliente).

## 1. Entrada: excel "FINADIET CONCEPTOS"

Export mensual de Meta4, con la fila de datos empezando en la 4ª fila (`aoa.slice(3)`, 0-based). Columnas
usadas (nombres tal como vienen en el reporte; **índice 0-based** entre paréntesis):

| Columna del excel | Índice | Uso |
|---|---|---|
| Centro de Costo (L) | 11 | Centro de costo de la fila |
| Nro (W) | 22 | Código del concepto de liquidación |
| Concepto (X) | 23 | Nombre del concepto de liquidación |
| Importe (Z) | 25 | Monto de la transacción |
| Cuenta Debe — nombre (AF) | 31 | Nombre de la cuenta contable del lado Debe |
| Código Debe (AG) | 32 | Código de cuenta contable del lado Debe |
| Cuenta Haber — nombre (AH) | 33 | Nombre de la cuenta contable del lado Haber |
| Código Haber (AI) | 34 | Código de cuenta contable del lado Haber |

Cada fila del excel representa **ambos lados de un movimiento** (Debe y Haber por el mismo importe), no una
fila por cuenta. Si Meta4 cambia el formato de este reporte, hay que actualizar `COL` en el HTML.

**No se sube ningún archivo de cuentas contables ni de centros de costo aparte** — esa tabla de referencia
está embebida en el propio HTML (`REFERENCE_CUENTAS`, `REFERENCE_CENTROS`, `CATEGORIA_PATRIMONIAL`,
`ORDEN_CATEGORIAS`), tal como la definió Gaby. Si FINADIET agrega o cambia una cuenta/centro, se edita ese
bloque a mano dentro del HTML (sección 6 del instructivo) — la herramienta no lo infiere ni lo aproxima.

## 2. Filas excluidas (sin aviso)

Se descartan antes de cualquier clasificación, sobre los valores crudos de la fila:

- **Código Debe == Código Haber**: son conceptos base/informativos de Meta4, no movimientos contables
  reales (ej. `BASEEXT`, `BASE ING/EGR`).
- **Código Debe y Código Haber vacíos los dos.**

## 3. Clasificación de cada cuenta

Para cada código de cuenta que sí resuelve contra `REFERENCE_CUENTAS`:

- **Cuenta de Resultado** → se antepone el código del centro de costo (`REFERENCE_CENTROS[centro]`).
  Ejemplo: centro ADMINISTRACION (400) + cuenta `521101` = `400.521101`.
- **Cuenta Patrimonial** → siempre se antepone `100`, sin importar el centro. Ejemplo: `213111` →
  `100.213111`.

**Un código de cuenta o un nombre de centro de costo que no está en la tabla de referencia se excluye del
cálculo de ese lado (Debe o Haber) y se avisa en pantalla** (banner rojo, lista los códigos/centros) — nunca
se inventa a qué cuenta o centro pertenece. Como sólo se excluye el lado que no resuelve, el asiento puede
dejar de cerrar (Debe ≠ Haber): es la señal de que hay que actualizar la tabla de referencia antes de emitir
ese asiento. El balance Debe/Haber se controla siempre, y con el archivo real de liquidación tiene que dar
exactamente 0 (comparación con tolerancia de $0,005 antes de mostrar el aviso amarillo).

## 4. Las 3 solapas del excel final

| Solapa | Contenido |
|---|---|
| **ASIENTO** | El asiento final. Cuentas de Resultado agrupadas por nombre de centro de costo (un bloque por centro, ordenados por el código numérico del centro; cuentas ordenadas por código dentro de cada bloque). Cuentas Patrimoniales agrupadas y **consolidadas entre todos los centros de costo** bajo 7 categorías fijas de `ORDEN_CATEGORIAS` (código en la herramienta, no se derivan del nombre de la cuenta). Fila `TOTAL` al pie. |
| **Ctas Cbles CENTRO COSTO** | Tabla plana: una fila por combinación cuenta + concepto, con la cuenta llevando el prefijo de centro de costo o `100`. Suma de Debe y de Haber por fila. |
| **Cuentas Contables GRAL** | La misma tabla plana, pero con el código de cuenta limpio (sin el prefijo de centro de costo/`100`), tal como está en la tabla de referencia. |

`Mes del asiento` y `Fecha de emisión` los completa el analista a mano en la pantalla — no se infieren del
archivo.

## 5. Consolidación

Dos filas del excel de origen con la **misma cuenta final + mismo centro de costo** (para Resultado) o
**misma categoría patrimonial + misma cuenta final** (para Patrimonial) se suman en una sola línea de la
solapa ASIENTO — es la misma regla de "consolidar antes de comparar/mostrar" que el resto del repo aplica
por legajo (`js/controls/consolidate.js`), acá aplicada por cuenta contable en lugar de por legajo porque la
unidad de este archivo es el asiento contable, no el empleado. En las solapas planas (2 y 3) la unidad es
cuenta + concepto, así que dos conceptos distintos sobre la misma cuenta aparecen en filas separadas.

## 6. Seguridad

Los nombres de cuenta, de concepto y los códigos sin clasificar que se listan en los avisos vienen crudos
del excel de un tercero (el cliente) — se escapan con `esc()` antes de insertarlos en el HTML de resultados
(mismo criterio que el resto del repo, ver CLAUDE.md). Cubierto por
`tests/e2e/finadietAsiento.spec.js` con un payload de prueba en el nombre de cuenta y en el nombre de
concepto.
