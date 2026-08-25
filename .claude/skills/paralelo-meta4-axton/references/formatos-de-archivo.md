# Los formatos de los cuatro archivos

Radiografía de los archivos reales de OPmobility Florida (1ra quincena 08/2026). Sirve para
entender qué hace cada lector de `scripts/lectores.py` y para adaptar el config a un cliente
nuevo. Los datos de empleado no se reproducen acá: sólo la estructura y los códigos, que son
configuración.

---

## 1. Tabulado horizontal de Meta4 — `tabulado_h.xlsx`

Un `.xlsx` de verdad, una sola hoja, **encabezados en la fila 1** y datos desde la 2. En el
archivo real: 78 filas de datos, 97 columnas.

Las columnas de concepto vienen como **`CODIGO-NOMBRE`** (`1063-JORNAL`,
`3513-COMP_ANTIGUEDAD`, `6005-TOT_JUB`). Las primeras 15 son datos del empleado y de la
liquidación (`ID_EMPLEADO`, `FEC_PAGO`, `APPELIDO Y NOMBRE`, `CUIL`, `CBU`, `N_CENTRO`…) y
tres columnas sueltas al final del bloque de importes: `TOTAL_DESCUENTO`, `NETO` y algunas
vacías.

**Una fila por liquidación.** Un legajo con la quincena y un ajuste del mismo mes aparece dos
veces, con el mismo `ID_EMPLEADO`. Hay que consolidar sumando.

**Tres familias de columnas que no son importes liquidados** y no van al cruce:

| Familia | Ejemplos | Qué son |
|---|---|---|
| Unidades y días | `401-DIAS_TRAB`, `450-DIAS_VACACIONES`, `1061-UN_JORNAL`, `3550-UN_VACACIONES`, `4430-UN_HORAS_50` | Cantidades, no pesos |
| Porcentajes | `616-PORC_OBR_SOCIAL`, `624-PORC_PAT_JUBIL`, `6090-PORC_PAT_ART` | Tasas |
| Acumuladores | `5810-REMUN_IMPO`, `5840-TOT_HAB_CON_AP`, `8900-TOTAL_RETENIDO`, `4050-PROM_6_ULT_MES` | Totales calculados |

Si alguna de estas entra al cruce, el detalle se llena de diferencias que no son conceptos.

**El redondeo (`8999-REDONDEO`) suma al neto.** Vale unos centavos por legajo y es lo que hace
que el neto termine en peso entero. Ojo: el PDF lo deja **afuera** de su "Total Haberes" y de
su "Total Descuentos", así que si querés reproducir esos dos totales del PDF hay que tratarlo
aparte; para reproducir el NETO alcanza con contarlo como haber, que es lo que hace el script.

**Identidad que tiene que cerrar:** Haberes − Descuentos = `NETO`, fila por fila. Y la suma de
los descuentos tiene que dar `TOTAL_DESCUENTO`.

---

## 2. PDF "Control de liquidación" de Meta4

Título `SUELDOS Y JORNALES` / `CONTROL DE LIQUIDACIÓN`, con el mes y año arriba. **Un bloque por
liquidación** (no por empleado: los legajos con dos liquidaciones tienen dos bloques) y **un
bloque de total general al final**, que no tiene ficha de empleado.

Cada bloque arranca con `Empleado:` y trae `Legajo:`, `C.Costo:`, `Ingreso:`, `F.Imp.:`,
`Valor Jornal:`, después la lista de conceptos con su código y su nombre, y cierra con:

```
Total Haberes:      1.557.066,26
Total Descuentos:     301.478,05
Total Netos:        1.255.589,00
```

**Cómo lo lee el script:** parte el texto por `Empleado:` y de cada bloque saca el legajo y los
tres totales. El bloque final queda después del último `Empleado:` y de ahí sale el total
general.

**Cuidado con el texto extraído.** El PDF sale desordenado: los importes aparecen partidos
(`,20` en una línea y `768.544` en otra) y el nombre del concepto **después** de su importe. Por
eso el lector busca **etiquetas exactas** (`Total Netos:` y la línea siguiente) y no intenta
reconstruir la tabla de conceptos. Los conceptos ya están en el Excel; del PDF sólo se necesita
el ancla.

**Para qué sirve además:** el bloque de total general lista **cada concepto debajo de la columna
que le corresponde** (REMUNERATIVO / DESCUENTOS / NO REMUNERATIVO / CONTRIBUCIONES). Es la
forma más rápida de armar la clasificación de un cliente nuevo sin adivinar.

---

## 3. Tabulado de Axton — `Tabulado_AXTON.xls`

**Tiene extensión `.xls` pero es HTML** (`file` lo confirma: "HTML document, ISO-8859 text").
Una sola `<table>`. Codificación **ISO-8859-1**, no UTF-8.

El orden de las filas es particular y hay que ubicarse por firma, nunca por posición:

1. Un `<span>` con el **preámbulo**, que es información valiosa:
   `EA: <empresa> | Reporte: Resumen de Liquidacion | Liquidacion: Confirmadas | Periodo: 08/2026 | Tipo: 1er Quincena c/sobregiro | Patronales: Si`.
   El campo `Liquidacion:` (`Vigentes` / `Todas` / `Confirmadas`) decide si los ajustes salen o
   no — ver el patrón 2 de `patrones-de-hallazgo.md`.
2. La fila **`TOTAL GENERAL`**, *antes* de los encabezados. Su primera celda tiene `colspan=3`,
   así que si se la lee por índice las columnas quedan corridas dos lugares. El script la
   guarda cruda y no la usa para calcular: los totales se recalculan de las filas.
3. La fila de **encabezados** (`<th>`): `Legajo`, `Apellido y Nombre`, `CUIL`, `F.R.P.`,
   `Recibo`, `Mov.`, `Bruto`, `Retenciones`, `Salario Familiar`, `Exento`, `Neto`, después las
   columnas de concepto como **`CODIGO - Nombre`**, y al final `TOTAL -`, `LSD`, `liquidacion`.
4. Una subfila de `<th>` con `Imp` repetido (o `Cant`), que dice si la columna trae importe o
   cantidad. En este cliente son todas `Imp`.
5. Las filas de datos, **una por liquidación**, con la última celda diciendo qué liquidación es
   (`... (1er Q 08-2026) - (v)` / `- (c)`).

**Los números vienen en formato argentino** (`1.376.321,35`) y las celdas vacías como `&nbsp;`.

**Familias de códigos:**

| Rango | Qué es | ¿Entra al neto? |
|---|---|---|
| `1xxx`, `2xxx`, `3xxx` | Haberes | Sí, al bruto |
| `502xxx` | Exentos (alimentación, estímulo) | Sí, como exento |
| `599999` | Redondeo | Sí, como exento |
| `600xxx`, `605xxx`, `609xxx` | Retenciones (sindicato, jubilación, OS, ganancias, embargos) | Sí, restando |
| `800xxx`, `899999`, `900xxx` | Bases y acumuladores de cálculo | **No** |
| `88xxxx` | ART y seguros: contribución patronal | **No** (no toca el neto del empleado) |

**Identidad que tiene que cerrar:** Bruto − Retenciones + Exento = Neto, fila por fila, y cada
uno de los tres contra su propia columna. Es lo que prueba que la clasificación de arriba está
bien para este cliente y este mes — y lo que detecta al toque un código nuevo.

---

## 4. Tabla de equivalencias — `equivalencias_conceptos.xlsx`

Tres columnas, encabezado en la fila 1: **código de Axton**, **código de Meta4**, **nombre**.
En el archivo real, 134 renglones.

Lo que hay que esperar de un archivo hecho a mano:

- **Renglones donde el código no es un número**: `#N/A` (una búsqueda que no encontró nada), `*`,
  o un texto como `"Adicional 2"`. No se descartan en silencio: salen listados en la hoja
  "Sin comparar" del Excel. En el paralelo real eran 5, y ninguno tuvo plata ese mes — pero eso
  hay que verificarlo, no suponerlo.
- **Renglones sin código de Meta4** (2 en el archivo real). Uno era un duplicado incompleto de
  otro renglón que sí estaba bien; el otro, un concepto sin equivalencia.
- **Un código de Axton repetido**, apuntando a dos conceptos de Meta4 distintos: son 8 casos
  (antigüedad, vacaciones, sindicato, seguros, gratificaciones). El cruce compara el concepto de
  Axton contra la **suma** de los dos de Meta4. Si uno de los dos fuera un descuento del otro
  (hay un par que se llama "Días con permiso pagas" y "Dto días con permiso pagas"), sumarlos
  derecho daría un número que no se puede comparar con nada: conviene confirmarlo con el
  analista antes.
- **Del lado de Meta4 los códigos no se repiten**, así que leyendo de Meta4 hacia Axton la
  equivalencia es única. Es la dirección en la que conviene pensar el cruce.

La tabla es **el documento del cliente**: cuando Axton cambia un código, lo que corresponde es
avisar para que la tabla se corrija, y mientras tanto declarar el mapeo en el config.
