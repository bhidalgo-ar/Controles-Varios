# Saldo de vacaciones — COTY (Axton)

**Estado:** implementado el 2026-09-30 — control `saldo_vacaciones` del `CONTROL_REGISTRY` (modo
"Generar Reporte", solo para COTY), cubierto por `tests/saldoVacacionesControl.test.js` y
`tests/e2e/saldoVacaciones.spec.js`. Verificado contra los archivos reales de agosto y septiembre de
2026 (ver §7). Criterio de saldo y provisión decidido en D-097. **Pendientes de criterio, sin resolver:** altas del mes y bajas (§6). Falta que Willy
confirme la pantalla de resultados: se armó con las piezas estándar (Resumen + Planilla), sin mockup
previo.

**Qué es:** un control de **generación**: no cruza contra el Tabulado ni contra un umbral. Toma dos
archivos de Axton tal cual se bajan y arma el `Saldo vac MM-AAAA.xlsx` que hasta ahora se armaba a mano:
una fila por legajo con el saldo y la provisión de vacaciones del mes, los días que corresponden, los
gozados y lo que pasó en las bajas. Lo único que controla es que el archivo de Liquidaciones se haya
leído completo (§5).

---

## 1. Los archivos de entrada

| Archivo | Tipo | Qué aporta |
|---|---|---|
| **Reporte de Vacaciones** (Axton) | `vacaciones_axton_file` | Una fila por legajo: ingreso, egreso, días que corresponden y gozados |
| **Reporte de Liquidaciones** (totales por concepto, Axton) | `liquidaciones_vac_file` | Cantidad e importe por concepto, una fila por legajo × liquidación |

Los dos bajan como **`.xls` que por dentro es una tabla HTML** (latin-1). Liquidaciones en septiembre
vino además como **`.xlsx` real**: se aceptan los dos formatos. Las dos ramas terminan en la misma
grilla de celdas, con `colspan`/`rowspan` expandidos (`js/parsers/saldoVacacionesParser.js`), así que
HTML y `.xlsx` no pueden divergir. Reusa `isHtmlTabulado`/`decodeHtmlTabulado`/`textoDeCelda` de
`tabuladoHtml.js`; no reusa `parseHtmlTabulado` porque ese lee un solo renglón de encabezado y acá hay
dos.

**Vacaciones** — encabezados leídos **por nombre**: `Legajo`, `Apellido y Nombre`, `Ingreso`, `Egreso`,
`Dias`, `Gozados`. El export trae además `Cliente | Año | No Gozados | Saldo | Convenio | Detalle |
CentrodeCosto | Cargo | SectorInterno | Periodo | Desde | Hasta | Dias | Liquidacion | Linea` que no se
usan. **`Dias` está dos veces: se usa la primera.** Los legajos vienen con ceros a la izquierda y las
fechas como `dd/mm/aaaa`.

**Liquidaciones** — fila `TOTAL GENERAL` (arriba, y en el `.xlsx` también al final); encabezado de dos
filas: `Legajo | Apellido y Nombre | CUIL | F.R.P. | Recibo | Mov. |` un par `Cant`/`Imp` por concepto
(`800172 - Provision Vacaciones`, `503310 - Vac. no gozadas 2026`, `TOTAL -`) `| LSD | liquidacion`. En
el HTML los importes vienen en formato argentino (`1.234,56`) y la celda de `TOTAL GENERAL` lleva
`colspan=3`, que se expande igual que el resto. El parser devuelve **todos** los conceptos con su
encabezado completo; cuál es el de la provisión y cuál el de la baja lo decide el control.

---

## 2. Reglas generales

- **Clave de legajo:** `makeLegajoKey(mapping.legajoKeyMode)`, la **misma** para los dos archivos. Por
  default «007» y «7» son el mismo empleado.
- **Consolidar sumando en Liquidaciones** (`groupRowsByLegajo` + `sumColumn` de `consolidate.js`): un
  legajo con la liquidación de provisiones y la de su baja aparece en dos filas y se **suman**. En
  Vacaciones se espera una fila por legajo; si hay dos, corta (no elige una en silencio).
- **Universo:** la unión de los legajos de los dos archivos, en orden ascendente por número de legajo.
- **Códigos de concepto:** `800172` y `503310` son **semilla** (`DEFAULT_SALDO_VAC_CONFIG`, D-035/D-039),
  se buscan como prefijo del encabezado y `mapping.saldoVacacionesConfig` los pisa. **Todavía no hay
  editor en el Paso 2** para cambiarlos (sumarlo inflaba el alcance y COTY no lo pidió): una
  renumeración hoy se arregla en ese único lugar del código.
- **`null` no es `0`:** un dato que no existe en ninguna fuente queda **vacío** en el Excel y se explica
  en Observaciones.
- **Período:** sale del texto de la columna `liquidacion`, el `MM-AAAA` del paréntesis (`Provisiones
  09-2026`, `Bajas 09-2026`). Sin período en ninguna fila, o con más de uno, **corta con un error**: no
  se adivina por el nombre del mes ni por la fecha de la fila. Si el período elegido en la app es otro,
  avisa y usa el de los archivos.

---

## 3. Columnas del `.xlsx`

Hoja `Vac_Liq_<Mes>_<AAAA>` (p. ej. `Vac_Liq_Septiembre_2026`). Fila 1: títulos en E..J con fondo
amarillo. Fila 2: encabezados. Datos desde la fila 3, **valores sin fórmulas y sin fila de total**.

| Col | Encabezado (fila 2) | Título (fila 1) | De dónde sale | Formato |
|---|---|---|---|---|
| A | `Legajo` | | Número sin ceros | General |
| B | `NOMBRE` | | Vacaciones, como `Apellido, Nombre` (espacio tras la coma); si el legajo sólo está en Liquidaciones, el de ahí tal cual | |
| C | `FECHA_ALTA` | | `Ingreso` de Vacaciones (fecha real de Excel) | `mm-dd-yy` |
| D | `Fecha_baja` | | `Egreso` de Vacaciones; vacía si no viene | `mm-dd-yy` |
| E | `Saldo_vacaciones` | Saldo acumulado al mes | **Cantidad** del 800172, tal cual; **no** se recalcula Días × mes / 12 | `0.00` |
| F | `Prov_vac` | Valor de la Provision del mes | **Importe** del 800172, tal cual | `#,##0.00` |
| G | `VAC_A_DIC` | Dias de Vac que corresponden | `Dias` (la primera) de Vacaciones | General |
| H | `Vac_Liq_en_el_MES` | Dias de Vac Liquidadas en el  mes (dos espacios, literal) | `Gozados` de Vacaciones | General |
| I | `Vac_Proporcionales_(Baja)` | Dias de Vac en la baja | Cantidad del 503310; **0** si el legajo no lo tiene | General |
| J | `3553_Vacaciones` | Concepto 3553 | Importe del 503310; **0** si el legajo no lo tiene | `#,##0.00` |
| K | `Observaciones` | | Ver §4 | |

Formato copiado del Excel aprobado de referencia: anchos de columna, fuente Aptos Narrow 11, fila 1 de
28,2 de alto, amarillo `FFFFFF00`. La fecha de baja lleva el mismo formato que la de alta (en el modelo
esa columna no tenía ninguno, pero no traía ninguna fecha). Segunda hoja `Notas`: archivos de origen
(por nombre), mapeo aplicado (una línea por columna) y los dos pendientes de §6, **sin nombres de
personas**.

---

## 4. Observaciones

| Caso | Texto |
|---|---|
| Alta del mes (Ingreso dentro del mes del período) | `Alta del mes: se tomó la provisión de Axton; criterio a revisar.` |
| Baja (el legajo tiene 503310, **o** sólo está en Liquidaciones, **o** tiene Egreso) | `Baja: criterio a definir.` + qué falta, p. ej. ` No figura en el reporte de Vacaciones (sin alta, días ni saldo); sin provisión 800172 en Liquidaciones.` |
| Figura en Vacaciones y no tiene 800172 (y no es baja) | `Sin provisión en Liquidaciones.` |

Un legajo puede tener dos (alta y baja en el mismo mes): van una atrás de la otra.

---

## 5. Validaciones que cortan

Todas devuelven `{ error }` con un mensaje en español que se lee en pantalla (no `console.error`):

- **Encabezados esperados no encontrados** (Vacaciones: `Legajo`, `Apellido y Nombre`, `Ingreso`,
  `Egreso`, `Dias`, `Gozados`; Liquidaciones: `Legajo`, `Apellido y Nombre`, `liquidacion` y al menos un
  par `Cant`/`Imp`): dice qué se esperaba y qué trae el archivo. Un concepto `800172`/`503310` que no
  está en los encabezados corta igual, listando los conceptos que sí trae.
- **La suma de las filas de Liquidaciones tiene que dar el `TOTAL GENERAL`** del propio archivo, para
  800172 y 503310, en cantidad e importe, contra **cada** fila `TOTAL GENERAL` que traiga. Tolerancia
  0,01 (estructural: mide si el archivo se leyó completo, no es el monto de diferencia del cliente).
  Sin fila `TOTAL GENERAL` también corta.
- **Período** no determinable o con más de uno (§2).
- **Legajo repetido en Vacaciones**, o una fecha que no es `dd/mm/aaaa`, o un número ilegible.

---

## 6. Pendientes de criterio

1. **Altas del mes.** Hoy se toma la provisión que informa Axton. Falta definir si corresponde eso o
   **1 día de vacaciones por cada 20 trabajados** (a revisar con Willy/COTY).
2. **Bajas.** Criterio a definir para el saldo y la provisión de los legajos con 503310, con Egreso o
   que figuran sólo en Liquidaciones. **La fecha de baja no viene en ninguno de los dos archivos**, así
   que `Fecha_baja` sólo se completa con el `Egreso` de Vacaciones.

---

## 7. Anclas de verificación

**Septiembre 2026** (Vacaciones `.xls` HTML + Liquidaciones `.xlsx`): 122 legajos en Vacaciones, 125
filas y 125 legajos en Liquidaciones, 122 en los dos archivos y 3 sólo en Liquidaciones (las tres
bajas sin alta ni días en Vacaciones). Cuatro altas del mes.

| Concepto | Cantidad | Importe |
|---|---|---|
| 800172 Provision Vacaciones | 1.500,00 | 262.764.464,21 |
| 503310 Vac. no gozadas 2026 | 32,63 | 17.653.187,52 |
| TOTAL - | 1.532,63 | 280.417.651,73 |

El resultado es **igual celda por celda** (1.397 celdas: valores, tipos, formatos numéricos, relleno y
anchos) al `Saldo vac 09-2026.xlsx` aprobado, salvo 3 nombres: el export trae un espacio duro (U+00A0)
antes de la coma y el armado manual lo había conservado; la app lo normaliza a espacio común.

**Cruce contra la Contabilidad desglosada 09-2026:** la cuenta 215100180 (concepto 898850) suma
262.764.464,21 —el importe del 800172— y coincide legajo por legajo en **122 de 122**; el concepto
503310 suma 17.653.187,52 y coincide en **3 de 3**. La reversión (concepto 898855) de un legajo es igual
a su provisión del mes anterior.

**Agosto 2026** (los dos archivos HTML): 119 legajos en Vacaciones, 122 en Liquidaciones, 119 en los dos
y 3 sólo en Liquidaciones. Cierra contra su `TOTAL GENERAL` (800172: 1.352,43 / 246.066.038,00; 503310:
3,81 / 381.000,00). Contra el `Saldo vac 08-2026.xlsx` las diferencias esperadas son: el saldo con 2
decimales de Axton contra el modelo con más decimales (9,33 contra 9,3333…); dos legajos que están en el
modelo y no en estos crudos de Vacaciones (acá salen como baja sin alta ni días); una baja que no está
en el modelo; y tres altas con saldo distinto (el modelo lo calculó, Axton informa otro). Además, el
modelo de agosto no traía la columna Observaciones.
