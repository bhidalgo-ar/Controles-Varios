# Contabilidad Desglosada + Asiento — COTY (Axton)

**Estado:** implementado — control `conta_desglosada` del `CONTROL_REGISTRY`, cubierto por
`tests/contaDesglosadaControl.test.js` (74 asserts). Verificado el 2026-08-19 contra los dos
archivos reales de COTY del período 05/2026: reproduce **exactas** las cinco anclas del prototipo
(ver §7). **Gana su solapa Fichas por cuenta contable el 2026-08-21** (tanda 7 de
`specs/vista-estandar-resultados.md`, D-084), cubierta por `tests/fichasCuentaContable.test.js`, y de
paso se corrige un criterio de clasificación que había quedado mal en la tanda 3: una cuenta sin código
pasa a leerse "Sin comparar" y no "Con diferencia" (D-085, ver §3 y §5). Ningún número que calcula el
control cambió —lo que cambia es la etiqueta de pantalla—: se verificó corriendo el módulo anterior y el
nuevo sobre la misma entrada sintética y comparando los balances, las filas del asiento, las cuentas
patrimoniales, las líneas sin código y el semáforo completo. **Publica `summary.resumen` el
2026-08-22** (tanda 5 de `specs/vista-estandar-resumen.md`, D-093): entra al tablero del Resumen del
run con el puente DEBE → HABER → descuadre y el corte por tipo (Resultado/Patrimonial), reusando las
mismas fichas — tampoco acá se movió ningún cálculo de `armarDesglosada`/`armarAsiento`.

**Qué es:** un control de **generación** (`mode: 'Generar Reporte'`, `tabRequired: false`): no cruza
dos archivos, arma tres. A partir del reporte "Totales de Concepto" de Axton produce la Contabilidad
Desglosada del mes, y con el plan de cuentas del cliente el Asiento Contable que recibe Contaduría.
Lo único que controla —porque es lo único controlable sin otro archivo contra el que cruzar— es que
el asiento **cierre**: DEBE = HABER, en bruto y neteado.

**De dónde viene:** lo prototipó el equipo en Claude Chat como HTML standalone y llegó por el camino
de `docs/traspaso-controles-equipo.md`, con su ficha de traspaso. Es el tercer control que entra por
ahí (después de la variación entre quincenas de POP y el asiento de FINADIET).

---

## 1. Los archivos de entrada

| Archivo | Tipo | Obligatorio | Qué aporta |
|---|---|---|---|
| **Totales de Concepto** (Axton) | `totales_concepto_file` | sí | Una fila por legajo × concepto × liquidación, con las dos cuentas contables de cada concepto |
| **Reporte de Cuentas de Redefinición** (del cliente) | `cuentas_redefinicion_file` | no | El código de cada cuenta del plan del cliente |

Sin el segundo, la desglosada se genera igual y **el asiento no**: sale como aviso en resultados, no
con códigos inventados.

### Cómo se leen

El "Totales de Concepto" baja en dos formatos y el parser reconoce los dos: **`.xls` que en realidad
es HTML** (el caso normal, ~23 MB) y **`.xlsx` real** (cuando se vuelve a guardar desde Excel). La
rama HTML es la verificada contra el archivo real; la de `.xlsx` está cubierta por test con un
archivo armado a mano.

**Todo se resuelve por nombre de encabezado, nada por posición.** El prototipo leía por índice fijo
(Legajo=0, Importe=25, Cuenta Debe=31…) y ya había tenido que parchear la fecha de ingreso, que en un
export cae en la columna 14 y en otro en la 15, votando entre cuatro candidatas. Con los encabezados
—que el archivo trae siempre— ese problema desaparece: una columna nueva de Axton no corre a las
demás. Las columnas que se usan son Legajo, Centro de Costo, Ingreso, Nro, Concepto, Importe, Cuenta
Debe, Cuenta Haber y Liquidacion; sin una de las seis primeras el parser corta diciendo cuál falta.

El encabezado del reporte viene en **dos filas**: arriba las columnas de ficha con `rowspan=2` y una
celda con `colspan=6` para el período, abajo los seis subencabezados de ese grupo (Cantidad,
Importe, Cant. Facturable, Imp. Facturable, Dif. Cant., Dif. Imp.). El parser las aplana y **valida
que el encabezado aplanado mida exactamente lo mismo que las filas de datos**: si se corriera una
columna, las cuentas contables —que están al final— saldrían cruzadas y el archivo cerraría igual.

En el reporte de cuentas, el encabezado repite "Codigo" tres veces (una por cada cuenta que nombra la
fila), así que la columna de código se busca como **la primera "Codigo" que viene después de
"Nombre"**, y no en la posición K/L del prototipo.

---

## 2. Paso 1 — las 6 reglas de la desglosada

Por cada fila del reporte, en este orden:

1. **Desdoblamiento** — hasta dos líneas: una al DEBE con la cuenta de "Cuenta Debe", otra al HABER
   con la de "Cuenta Haber", con el mismo importe.
2. **Exclusión** — el lado cuya cuenta está vacía o dice "Nada al asiento" no genera línea.
3. **Anulación** — si las dos cuentas son la misma (sin distinguir mayúsculas), la fila entera se
   descarta: el movimiento entra y sale de la misma cuenta.
4. **Neto a pagar** — la cuenta de neto (en COTY, `Sueldos a pagar`) no se lista concepto por
   concepto: se acumula por legajo respetando el signo y se emite **una** línea por empleado, con el
   código de concepto configurado (9000) y el nombre "Neto a pagar". `neto = HABER − DEBE`: si es
   positivo va al HABER, si es negativo al DEBE con el monto en positivo.
5. **Negativos** — un importe negativo invierte el lado y va en positivo en la columna opuesta; la
   columna **Importe conserva el signo original**, que es lo que permite reconocer la fila en el
   archivo de origen.
6. **Formato** — la fecha de ingreso y el centro de costo salen tal como vienen del reporte.

**Consolidación por legajo.** La unidad del entregable es la línea contable, así que la desglosada
emite todas las líneas de todas las liquidaciones de un legajo (en COTY, la mensual y la de
provisiones). Donde el legajo **sí** es la unidad es la línea de neto: se agrupa con
`groupRowsByLegajo` y la clave de legajo del cliente (D-038/D-042). Con un `trim` a mano, un cliente
que rellena legajos con ceros («007» y «7») emitiría dos líneas de neto para el mismo empleado y el
asiento seguiría cerrando, mal.

**Lo que la línea de neto hereda de la primera liquidación** son el centro de costo y la fecha de
ingreso; los montos siempre se suman. Si un legajo neteara en dos centros de costo distintos, la
línea muestra el del primero y **el control lo avisa** (en el período verificado no pasa en ninguno
de los 130 legajos).

---

## 3. Paso 2 — de nombre de cuenta a código

La liquidación de Axton escribe el **nombre** de la cuenta; el asiento se agrupa por **código**. El
cruce, por línea y en este orden:

1. Una **excepción** cargada por el analista (con su centro de costo, o con `*` para cualquiera).
2. Cuentas **patrimoniales** (código que empieza con 1 o 2): cruzan sólo por nombre. Se reconocen
   porque *todos* los códigos de ese nombre empiezan con 1 o 2 — no se declaran en ningún lado.
3. Nombre con un **único** código: cruza por nombre.
4. Nombre **ambiguo** (varios códigos): cruza por nombre + centro de costo. Si el reporte trae ese
   nombre con el centro vacío, ese código es el **comodín**.

Lo que no se resuelve **no se completa**: la línea igual suma al asiento (para que el balance no se
maquille) y sale listada como "sin código" en la pantalla de resultados, con cuántas líneas y por
cuánto importe. En las solapas Fichas y Planilla esa cuenta se lee **"Sin comparar" y no "Con
diferencia"** (D-085): no hay ninguna diferencia de importe —la línea suma igual y el balance puede
cerrar— sino que falta el Reporte de Cuentas de Redefinición del cliente, que es lo que resuelve el
código.

**Las dos excepciones cableadas del prototipo no se sembraron.** La ficha de traspaso las traía como
supuestas y sin verificar (`sac` con centro 60 → `710100143`, y `sindicato fuva a pagar` →
`215100120`), y contra el archivo real **ninguna se dispara**: el SAC de COTY liquida en los centros
656, 70 y 104, y el propio reporte de cuentas resuelve los tres; "Sindicato FUVA a pagar" no aparece
ni en el Tabulado ni en el reporte de cuentas. Sembrarlas sería inventar un código por analogía
(D-039), así que la tabla de excepciones nace **vacía** y editable desde el Paso 2. Ver D-066.

### Armado del asiento

- **Patrimoniales** (1x/2x): una sola línea por código, centro de costo en `0`, y el **nombre oficial
  del reporte de cuentas** — que es lo que unifica las variantes de mayúsculas con las que la
  liquidación escribe la misma cuenta.
- **Las demás** (resultado, 6x/7x…): agrupadas por código + nombre + centro de costo.
- **Neteo de cada línea**: `neto = HABER − DEBE`; negativo va a NETO DEBE en positivo, positivo a
  NETO HABER, y si da cero las dos columnas quedan en `0,00`.
- **Orden**: por código de cuenta y después por centro de costo. Lo que quedó sin código va al final.

---

## 4. Los tres archivos que salen

| Archivo | Columnas | Quién lo recibe |
|---|---|---|
| `Contabilidad_Desglosada_<período>.xlsx` | 10: Legajo · Ingreso · Nro · Concepto · Importe · Centro de Costo · Cuenta · DEBE_HABER · DEBE · HABER | El analista (papel de trabajo) |
| `Asiento_Contable_<período>.xlsx` | 7: Nro Cuenta · Nombre de cuenta · Centro de costo · DEBE · HABER · NETO DEBE · NETO HABER | Contaduría del cliente |
| `Contabilidad_Desglosada_con_Codigo_<período>.xlsx` | 11: las 10 de la desglosada + Código después de Cuenta | El analista (auditar el asiento línea por línea) |

Los tres salen por `writeContractSheet` (contratos `conta_desglosada`, `conta_asiento` y
`conta_desglosada_codigo` en `js/exports/contracts.js`), así que las columnas del archivo y las de la
pantalla son la misma lista.

**La solapa Fichas (tanda 7, D-084) no agrega una cuarta columna a ninguno de los tres.** Es pantalla,
la ve el analista, y su desglose es por concepto de liquidación —código y nombre, que son
configuración, no información de HR—. Los tres `.xlsx` y el CSV siguen saliendo exactamente con las
columnas de la tabla de arriba.

**El asiento es `audience: 'finanzas'` y la desglosada no** (D-020): el asiento no lleva legajo ni
nada del empleado —un asiento se lee por cuenta contable—, mientras que la desglosada lleva legajo y
fecha de ingreso y es papel de trabajo del analista. Con el asiento se agregaron a
`FINANZAS_ALLOWED_KEYS` el centro de costo (imputación contable, no atributo del empleado) y los dos
netos.

---

## 5. El semáforo

`unit: 'cuenta'` (cuentas contables). `unitsTotal` = líneas del asiento + cuentas sin código;
`unitsWithDiff` = las cuentas sin código si todo cierra, y **todas** si no cierra: un asiento
descuadrado hace sospechoso al entregable entero. Sin el reporte de cuentas la unidad es la cuenta
distinta de la desglosada, y el estado es `warning` con el aviso de que el asiento no se armó.

**Esto no cambió con la tanda 7.** Lo que sí cambió es cómo lo describen las solapas Fichas y Planilla:
una cuenta sin código se lee "Sin comparar", no "Con diferencia" (D-085) — es una etiqueta de pantalla,
no el cálculo de `unitsWithDiff`, que sigue contándola igual que antes.

La solapa Fichas (`fichasDeCuentas`, tanda 7, D-084) muestra una ficha por línea del asiento con su
desglose por concepto —cada uno con su código— y su conciliación contra el saldo. Sin el reporte de
cuentas la unidad es la cuenta distinta de la desglosada, agrupada con la misma clave normalizada que usa
el semáforo, para que los chips no cuenten un número y el semáforo otro.

---

## 6. Configuración por cliente (Paso 2)

Panel "Contabilidad Desglosada · cuenta del neto y excepciones de código"
(`js/ui/contaDesglosadaConfigEditor.js`, clave `conta_desglosada_config`):

- **Cuenta del neto** — cuál es la cuenta que se netea por empleado. Semilla: `Sueldos a pagar`.
- **Nro y nombre del concepto de neto** — no existen en la liquidación, los inventa el asiento.
  Semilla: `9000` / `Neto a pagar`.
- **Excepciones** de nombre de cuenta → código, una por línea (`nombre ⇥ centro ⇥ código`, con `*`
  para cualquier centro). Nace vacía (ver §3).

---

## 7. Verificación contra los archivos reales

COTY S.A., período 05/2026, export del 17/07 (HTML de 23 MB) + reporte de cuentas del 19/08
(633 cuentas, 161 nombres distintos). Los archivos **no entran al repo**.

| Ancla del prototipo | Esperado | Reproducido |
|---|---|---|
| Balance bruto | 1.441.239.270,46 | ✓ igual |
| Balance neteado | 1.359.204.242,38 | ✓ igual |
| Filas del asiento | 273 | ✓ igual |
| Cuentas de código 1/2 | 12 | ✓ igual |
| Líneas sin código | 0 | ✓ igual |

Lo que además queda medido de esa corrida: 5.809 filas de origen → 5.325 líneas de desglosada
(incluidas 130 de neto, una por legajo), 623 filas anuladas por tener la misma cuenta en los dos
lados, 2.059 filas sin ninguna cuenta contable (conceptos que no van al asiento), 644 importes
negativos (la regla 5 se ejercita), ningún importe vacío, ningún legajo con dos centros de costo, y
el saldo de `Sueldos a pagar` en 391.658.121,00.

La otra ancla de la ficha (1.148.768.944,20 con 4.851 filas) es de **otro export del mismo mes**, no
del que se verificó.

**Lo que no se pudo probar en este entorno:** la descarga de los `.xlsx`. ExcelJS se carga por CDN y
la red del entorno de desarrollo lo bloquea; la pantalla de resultados y las tres tablas sí se
verificaron en el navegador, en los tres temas, sin errores de consola.

---

## 8. Pendientes

- **Confirmar con Willy si la desglosada sale del estudio.** Hoy está tratada como papel de trabajo
  del analista, y por eso lleva legajo y fecha de ingreso. Si el archivo se le manda a Contaduría del
  cliente, la fecha de ingreso tiene que salir (D-020).
- **Las dos excepciones del prototipo**, si alguna vez se disparan: SAC en el centro 60 va a salir
  como "sin código" hasta que alguien confirme el código y lo cargue en el Paso 2.
- **Un `.xlsx` real de este reporte**, para verificar esa rama del parser contra un archivo de verdad
  y no sólo contra el armado a mano del test.
- **Promoverlo a `scope: 'sistema'`** (cualquier cliente Axton) cuando un segundo cliente pida el
  mismo asiento: el Paso 1 ya es genérico, lo que ata a COTY es el plan de cuentas, que viaja en un
  archivo, y la forma de nombrar las cuentas en la liquidación (D-015).
