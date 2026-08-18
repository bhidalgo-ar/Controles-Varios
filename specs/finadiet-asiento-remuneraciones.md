# Asiento de Remuneraciones — FINADIET

**Estado:** implementado — control `finadiet_asiento` del `CONTROL_REGISTRY`, cubierto por
`tests/finadietAsientoControl.test.js`. **Verificación postergada el 2026-08-17 (D-062):** la familia
contable sale del foco por relación esfuerzo/valor. El control sigue construido y disponible para FINADIET;
lo que se posterga es correrlo contra el archivo real y generalizarlo (ver §7).

**Qué es:** un control de **generación** (`mode: 'Generar Reporte'`, `tabRequired: false`): no cruza dos
archivos, arma uno. A partir del excel mensual de conceptos liquidados de FINADIET ("FINADIET CONCEPTOS",
export de Meta4) produce el excel del asiento contable de remuneraciones que Payroll le entrega a
Contaduría del cliente para que lo cargue en su sistema contable.

Es el tercer control de generación del proyecto, después de Acreditaciones (D-021) y Acumuladores
Ganancias (D-033): misma forma — un archivo adicional, sin Tabulado, con un `.xlsx` como entregable.

**Origen:** lógica y tablas validadas con Gaby Fukuhara sobre datos de muestra reales de FINADIET
(12/08/2026). El instructivo para el equipo y los excels de prueba viven en el proyecto de Claude
"FINADIET salidas contables" — no se suben al repo (contienen datos del cliente).

**Por qué está en la app y no como HTML standalone en `reportes/`:** se evaluó y se descartó. Es la misma
corrección que D-023 le hizo a D-022 (el reporte de Variaciones de OPmobility salió standalone y hubo que
traerlo a la pantalla del cliente porque ahí es donde el analista lo busca). Los dos motivos de D-022 para
quedar afuera del registry no aplican acá: es **un** período y **un** archivo, y el entregable es un
`.xlsx`, no un PDF. Estando adentro, el control queda en la pantalla de Controles de FINADIET, deja
`controlRuns` para el checklist mensual y el semáforo, y usa lo que ya está construido (`toNum`,
`writeContractSheet`, `wireTableTools`, `controlConfigs`) en vez de una copia propia de cada cosa.

---

## 1. Entrada: excel "FINADIET CONCEPTOS"

Export mensual de Meta4. Abre con unas filas de título y después trae la fila de encabezados y los datos.

**Cada fila es un movimiento contable completo**: el mismo importe va al Debe de una cuenta y al Haber de
otra. No es una fila por cuenta — de ahí que el parser lea dos columnas de código por fila, y que el
control siempre pueda controlar que el asiento cierre.

Columnas que se usan (claves de mapeo de `asiento_conceptos_file`):

| Clave de mapeo | Qué es | Requerida |
|---|---|---|
| `cuentaDebeColumn` | Código de cuenta contable del lado Debe | sí |
| `cuentaHaberColumn` | Código de cuenta contable del lado Haber | sí |
| `importeColumn` | Importe del movimiento | sí |
| `centroColumn` | Centro de costo de la fila | sí |
| `cuentaDebeNombreColumn` | Nombre de la cuenta del lado Debe | no |
| `cuentaHaberNombreColumn` | Nombre de la cuenta del lado Haber | no |
| `nroConceptoColumn` | Código del concepto de liquidación | no |
| `conceptoColumn` | Nombre del concepto de liquidación | no |

**Las columnas se resuelven por nombre de encabezado, nunca por posición.** El reporte de Meta4 cambia de
ancho entre versiones y una columna insertada corre todas las de la derecha: leer "la columna 25 porque ahí
estaba el importe" produce un asiento coherente y mal, que es el peor resultado posible. La precedencia es
la del resto del repo (D-039): (1) lo que el analista confirmó en el Paso 2, guardado en el perfil de
columnas del cliente — siempre gana; (2) auto-detección por alias de encabezado
(`autoDetectFinadietAsientoMapping`). Si una requerida no se resuelve, el Paso 2 la pide con asterisco y el
parser corta con un error que dice qué falta y lista los encabezados que encontró.

La **fila de encabezados** se ubica por densidad (la fila con más celdas con texto entre las primeras 10),
no buscando un nombre puntual: si se buscara "Importe" y el cliente renombrara esa columna, el parser no
podría ni ubicar la fila y el analista no tendría de dónde elegir en el Paso 2.

Las cuatro requeridas son requeridas de verdad: sin los dos códigos, el importe y el centro no hay asiento
posible, y completarlas con nada sería el default silencioso que `CLAUDE.md` prohíbe.

---

## 2. Filas que se descartan (contadas, nunca silenciosas)

El parser descarta y **cuenta** en `parseMetadata`:

- **Código Debe == Código Haber** (`descartadasIguales`): conceptos base/informativos de Meta4
  (`BASEEXT`, `BASE ING/EGR`), no movimientos contables reales.
- **Los dos códigos vacíos** (`descartadasSinCodigo`).
- **Con código pero sin importe legible** (`descartadasSinImporte`). `null` no es `0`: la fila no se suma
  como cero. El importe se lee con `toNum()` (`js/utils/currency.js`), que distingue el número que ya
  parseó SheetJS del texto es-AR — `parseFloat('1.234,56')` devuelve `1.234`, un importe mil veces más
  chico que no rompe nada y que nadie detecta.

Si **todas** las filas se descartan, el parser corta con un error que dice cuántas leyó y por qué las
descartó. No devuelve "0 filas, todo en orden".

---

## 3. Clasificación de cada cuenta

Para cada uno de los dos lados de cada fila, con el código de cuenta contra la tabla del cliente:

- **Cuenta de Resultado** → se le antepone el código del centro de costo de la fila.
  `ADMINISTRACION` (400) + `521101` = `400.521101`.
- **Cuenta Patrimonial** → se le antepone `100`, sin importar el centro, y se consolida entre todos los
  centros bajo su categoría. `213111` → `100.213111`.

El nombre del centro se compara **normalizado** (sin acentos, sin espacios de más, en mayúsculas): viene de
un excel del cliente, y `Administración` y `ADMINISTRACION` son el mismo centro. Comparándolos crudos, el
segundo mes que alguien cambie la grafía aparece un "centro sin clasificar" sin que haya nada mal en el
archivo.

**Tres casos en los que un lado no se puede asentar.** Ninguno se adivina, los tres se informan en la
pantalla de resultados con qué hacer, y ninguno descarta la fila entera:

| Caso | Qué pasa con ese lado | Qué pasa con el otro lado de la fila |
|---|---|---|
| El código de cuenta no está en la tabla | queda afuera, se lista el código y en cuántos movimientos apareció | entra normalmente |
| El centro de costo no está en la tabla | queda afuera **el lado de Resultado**, se lista el centro | el Patrimonial entra (no necesita centro) |
| La fila no trae centro de costo | queda afuera **el lado de Resultado**, se cuenta | el Patrimonial entra |

Que un lado quede afuera y el otro entre hace que el asiento **deje de cerrar**: es exactamente la señal de
que falta actualizar la tabla, y por eso el descuadre no se esconde.

**Si no se puede clasificar NINGÚN lado**, el control devuelve `{ error }` en vez de un asiento vacío. Un
asiento sin líneas tiene Debe = Haber = 0 y "cierra": ese es el falso verde que D-043 mató en Brutos/GS
Pers, y acá tiene que ser rojo. Pasa, por ejemplo, si se sube el archivo de otro cliente.

---

## 4. Consolidación

`js/controls/consolidate.js` **no aplica** acá: la unidad no es el legajo (el archivo no lo trae, y dos
filas del mismo empleado no se distinguen ni tienen por qué distinguirse). Misma clase de excepción que
`acreditaciones.js`, donde la unidad es la acreditación (D-021). Lo que se consolida es la cuenta contable:

| Salida | Unidad de consolidación |
|---|---|
| Solapa ASIENTO, cuentas de Resultado | cuenta final + centro de costo |
| Solapa ASIENTO, cuentas Patrimoniales | categoría + cuenta final (entre todos los centros) |
| Solapas planas 2 y 3 | cuenta + concepto (dos conceptos de la misma cuenta van en filas separadas) |

Se **suma**, no se pisa: dos movimientos de la misma cuenta y centro son una sola línea con el total, y eso
está escrito como assert en `tests/finadietAsientoControl.test.js`.

Una cuenta que quedó en 0,00 de los dos lados (dos movimientos que se cancelaron) no es una línea del
asiento y no se emite. Todas las comparaciones de importe usan la tolerancia del proyecto, `0,01`.

---

## 5. Las 3 solapas del excel final

| Solapa | Contenido |
|---|---|
| **ASIENTO** | El asiento final. Encabezado con `MES` (del período de la corrida) y `FECHA` (la de emisión, que carga el analista). Un bloque por centro de costo, ordenados por código de centro; después un bloque por categoría patrimonial, en el orden de `ordenCategorias`. Fila `TOTAL` al pie. |
| **Ctas Cbles CENTRO COSTO** | Tabla plana: una fila por cuenta + concepto, con la cuenta llevando su prefijo (centro o `100`). |
| **Cuentas Contables GRAL** | La misma tabla con el código de cuenta limpio, sin prefijo. |

Las **dos solapas planas tienen contrato de export** (`finadiet_asiento_cc` y `finadiet_asiento_gral` en
`js/exports/contracts.js`) y las escribe `writeContractSheet`. Son las dos únicas del Paso 6 que nacen con
writer, así que declaran también su layout (`width`); el resto del Paso 6 declara sólo semántica hasta que su
writer las consuma (D-045). La fila `TOTAL` viaja como una fila más, para que `writeContractSheet` siga
siendo el único lugar que escribe filas de estas hojas (D-043).

La solapa ASIENTO **no** tiene contrato a propósito: no es una tabla plana (encabezado con mes y fecha,
filas de título por bloque, total al pie), y forzarle esa forma sería más maquinaria de la que el caso
necesita — el mismo criterio con el que el Paso 4b quedó separado del 4a.

**`audience: 'finanzas'` (D-020).** El archivo lo recibe Contaduría del cliente, no el equipo de Payroll:
no lleva ni legajo, ni nombre de empleado, ni dotación. Un asiento se lee por cuenta y por concepto de
liquidación, y el empleado no aparece en ninguna de las tres solapas. Lo hace cumplir la allow-list
`FINANZAS_ALLOWED_KEYS` de `js/exports/contracts.js` (D-045), que a partir de este control declara sus **dos**
usos: pagar (Acreditaciones → tesorería) y asentar (este asiento → Contaduría). Una columna nueva en un
export de Finanzas no pasa el test hasta que alguien la agregue ahí a mano.

`Mes` sale del período de la corrida. `Fecha de emisión` la completa el analista en el Paso 2: no se
infiere del archivo ni se completa con la de hoy — una fecha inventada en un comprobante contable no la
detecta nadie. Si falta, el asiento se genera igual y el chequeo de coherencia lo marca.

---

## 6. La tabla de cuentas es del cliente, no del código (D-035)

El plan de cuentas (38 cuentas), los centros de costo (17) y el orden de las 7 categorías patrimoniales
viven como **semilla** en `js/controls/finadietAsiento.js`, y lo que manda es lo que el cliente tenga
guardado en `controlConfigs` bajo `finadiet_asiento_config`, editable desde **"Cuentas contables y centros
de costo" en el Paso 2** del wizard. Una cuenta nueva del cliente se agrega desde la pantalla, no con un
commit — y viaja en el seed como cualquier otra config de cliente.

La config guardada **reemplaza** a la semilla, no se mergea: si se mergeara, una cuenta que el analista
borró del editor volvería a aparecer sola en la corrida siguiente y el editor dejaría de decir la verdad
sobre qué tabla se está usando.

El editor toma la tabla como texto pegable desde Excel (una línea por cuenta, columnas separadas por TAB o
por `;`) porque así es como el dato llega: Gaby manda un excel y el analista lo pega. Un formulario fila por
fila para 38 cuentas serían más clicks para el mismo resultado. Una línea que no se entiende **no se
completa con un default**: se dice qué línea está mal y la tabla anterior sigue en pie hasta que se
arregle. Una cuenta Patrimonial sin categoría es un error de línea, no una cuenta "sin agrupar".

---

## 7. Semáforo y qué falta verificar

La **unidad** del semáforo es la línea de cuenta del asiento (`unit: 'cuenta'`). `unitsTotal` = líneas del
asiento + cada cuenta y cada centro sin clasificar (todavía no son una línea, pero tienen que dejar de no
serlo). Si el asiento no cierra, `unitsWithDiff` = todas: el reporte entero es sospechoso, igual que hace
Acreditaciones cuando no cierra contra el archivo de origen. `status: 'error'` queda para lo que no produce
asiento (sin archivo, tabla vacía, nada clasificable).

**Pendiente antes de usarlo en producción, hoy postergado (D-062):** correrlo contra el excel real de
FINADIET — y la primera pregunta al retomar es **cuál es ese archivo**, porque el de cierre que sí existe en
SharePoint no tiene el layout que pide el parser (detalle en D-062). Los alias de
encabezado del parser están escritos a partir de los nombres documentados de las columnas, no de un archivo
real en mano; si alguno no coincide, el Paso 2 lo pide a mano (así que el control corre igual) y sumar el
alias es una línea en `ALIASES`. Lo que sí conviene confirmar con Gaby es que el asiento generado cierre y
dé lo mismo que el armado a mano para un mes ya cerrado.
