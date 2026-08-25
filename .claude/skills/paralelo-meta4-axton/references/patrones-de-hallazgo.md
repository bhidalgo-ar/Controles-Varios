# Patrones de hallazgo de un paralelo

Catálogo salido del paralelo real de OPmobility Florida, 1ra quincena de agosto 2026: cinco
vueltas, de 14.501.022 de diferencia a 2 pesos. Los legajos se nombran por lo que les pasa, no
por su número (regla de `CLAUDE.md`); los importes son los reales y sirven de ancla.

La utilidad de esto no es la anécdota: es que **un paralelo falla de pocas formas**, y cada una
tiene una firma que se reconoce mirando los números. Reconocer el patrón convierte
cuatrocientas diferencias en cuatro causas.

---

## 1. Un factor constante entre los dos lados

**Firma:** el cociente Meta4 ÷ Axton da **el mismo número exacto** en todos los casos de un
grupo de conceptos. No 8,97 y 9,04: nueve, clavado, en los 21 casos.

**Lo que fue:** todos los conceptos de licencia y ausencia salían a un noveno de lo que
correspondía — licencia gremial 1.614.124,48 contra 179.347,17; enfermedad 981.142,77 contra
109.015,84; ILT 308.891,62 contra 34.321,28; horas teóricas de licencias 776.712,42 contra
86.301,38. El sistema nuevo liquidaba **1 unidad donde iban 9** (los 9 días de la quincena).

**Cómo se busca:** dividir un lado por el otro en cada concepto que difiere y mirar si el
cociente se repite. Si se repite, es un solo arreglo y cae todo el grupo junto.

**Trampa:** dos de esos conceptos eran un haber y su descuento espejo (horas teóricas de
licencia y ausente con aviso, ±776.712,42), así que **se cancelaban y no movían el neto**.
Estaban igual de mal. Un paralelo que sólo mira el neto no los encuentra: hay que mirar
concepto por concepto.

---

## 2. Una liquidación entera que no entró

**Firma:** en Meta4 el legajo tiene **dos filas** y en Axton una sola. La diferencia de neto es
exactamente el neto de la segunda fila de Meta4, y aparece disfrazada de "un concepto que
difiere" — casi siempre el premio o las horas extras, que es lo que trae el ajuste.

**Lo que fue:** ocho legajos con la quincena más un ajuste del mismo mes; el ajuste no estaba
en el archivo de Axton. 1.730.865 de neto.

**Dónde estaba la causa:** en el encabezado del propio archivo de Axton. Decía
`Liquidacion: Vigentes`, y con ese filtro los ajustes no salen. Cuando pasó a
`Liquidacion: Todas` (y después `Confirmadas`) aparecieron los dos tipos —`(v)` y `(c)`— y las
ocho diferencias se cerraron sin tocar un solo concepto.

**Por eso el script imprime siempre el preámbulo y los tipos de liquidación que trae el
archivo, y el Excel los guarda en la hoja Resumen.** Es el primer lugar donde mirar cuando
faltan liquidaciones.

---

## 3. El concepto no tiene ni columna

**Firma:** el estado sale como "Falta en Axton (no hay columna)" — distinto de "columna vacía".
El código que declara la tabla de equivalencias no existe en el archivo.

**Lo que fue:** vacaciones (742.629,84), vacaciones sobre variables (620.063,01), anticipo de
sueldo (900.000,00) y embargo judicial (97.988,56). Los cuatro terminaron apareciendo, pero
tres de ellos **en un código distinto del que declaraba la tabla** (patrón 5).

**Ojo con el signo:** los dos últimos son descuentos. Un descuento que el sistema nuevo no hace
significa que **paga de más**, y eso puede tapar otro error en el mismo legajo: el legajo con el
anticipo pasó de −40.146 a +216.527 justo cuando se le arregló la licencia, y por poco queda
como "diferencia chica".

---

## 4. Media liquidación

**Firma:** un legajo al que le faltan varios haberes a la vez —horas normales, extras, franco—
y encima trae **la antigüedad en 0,01**. Ese centavo es el delator: el sistema calculó, pero
sobre una base vacía.

**Lo que fue:** un legajo con 819.475 de diferencia al que no le habían entrado las horas.
Cuando eso pasa, los aportes también salen distintos, pero son consecuencia (ver patrón 7).

---

## 5. El importe está, pero en otro código

**Firma:** un concepto de Meta4 sale como faltante y, en la hoja "Sin comparar", aparece un
código de Axton sin equivalencia **por el mismo importe**, hasta el centavo.

**Lo que fue, en una sola vuelta:** ganancias se mudó de `609995` a `609996`; las vacaciones se
liquidaron en `2255` cuando la tabla decía `2250`; el embargo en `605715` y no en `605710`;
apareció un segundo código de antigüedad (`3515`) para un legajo. Los cuatro reprodujeron el
importe de Meta4 exacto.

**Qué hacer:** declararlo en `mapeosDeclarados` del config, que salga listado en el Excel, y
avisarle al analista para que corrija la tabla de equivalencias — que es el documento del
cliente, no del repo. Emparejarlo en silencio sería justo el "default silencioso" que
`CLAUDE.md` prohíbe: el próximo mes el código puede volver a cambiar.

**Y el caso inverso:** la primera vez que apareció `609996`, ganancias quedó **repartido en dos
columnas** (la vieja con 1.607.840,66 sobre seis legajos, la nueva con el resto). Comparar
contra una sola de las dos daba dos diferencias falsas que se anulaban entre sí. Por eso el
mapeo declarado compara contra **la suma** de las columnas, no contra una.

---

## 6. La cantidad cargada en el lugar del importe

**Firma:** un importe absurdamente chico y redondo donde debería haber decenas o cientos de
miles — y que coincide con **la cantidad de unidades del mismo concepto en Meta4**.

**Lo que fue:** el legajo con vacaciones traía `7,00` en la columna de importe de licencia por
vacaciones. Meta4 le liquidaba 742.629,84… y 7 unidades de vacaciones. El 7 era los días.

**Cómo se confirma:** buscar ese número en las columnas de unidades del Tabulado de Meta4
(`UN_`, `DIAS_`, `CANT_`). Si aparece, es eso. Vale la pena mirarlo porque el importe chico no
dispara ninguna alarma de monto.

---

## 7. Los aportes que no son un hallazgo

**Firma:** jubilación, Ley 19032, obra social y sindicato difieren en muchos legajos a la vez,
siempre en la misma dirección que el bruto.

Se calculan sobre la base: si un haber está mal, los cuatro salen mal solos y se arreglan solos
cuando se arregla el haber. **Hay que decirlo explícitamente al contar el resultado**, porque si
no el implementador sale a buscar cuatro errores que no existen. El Excel los muestra, pero en
el chat van agrupados como consecuencia.

**La excepción que sí es un hallazgo:** un legajo cuyos cuatro aportes venían en **números
redondos** (242.440,00 / 66.120,00 / 66.120,00 / 55.100,00) contra los centavos de Meta4. Nadie
calcula así: estaban cargados a mano.

---

## 8. El padrón no es el mismo

**Firma:** los dos archivos tienen distinta cantidad de legajos.

**Lo que fue:** una vuelta trajo 125 legajos contra los 70 del Meta4 — 55 empleados de más, con
13.181.623 de neto, que no estaban en el archivo del otro sistema. La vuelta siguiente volvió a
70.

**Qué hacer:** cruzar sólo los que están en los dos lados —es el único universo comparable— y
**listar aparte los que sobran de cada lado, con su neto**. Nunca ignorarlos en silencio: puede
ser que el paralelo cubra más gente y falte el archivo del otro sistema. Preguntar.

---

## 9. El archivo nuevo es el mismo que el anterior

**Firma:** el neto total y el detalle dan idénticos a la vuelta anterior.

Pasa: el analista filtra el export, o vuelve a bajar el mismo. Antes de contar de nuevo los
mismos hallazgos, **comparar el archivo nuevo contra el anterior legajo por legajo** y, si no
cambió nada, decirlo en la primera línea. Una vez el archivo "corregido" era el anterior
recortado a menos legajos, sin un peso de diferencia en los que quedaban.

---

## 10. Los pesos del redondeo

**Firma:** varios legajos que difieren en **exactamente $1**, y el concepto de redondeo (`8999`
en Meta4, `599999` en Axton) explica la diferencia.

Son cuatro de los ocho legajos con doble liquidación: cada liquidación redondea por su lado y
el total queda un peso corrido. No es un error de concepto y no se comenta en el Excel, pero
conviene nombrarlo una vez para que nadie lo salga a buscar.

---

## Cómo termina un paralelo

Con estos diez patrones, el paralelo real cerró así:

| Vuelta | Diferencia de neto | Legajos que cierran | Con diferencia real |
|---|---|---|---|
| 1ª | −14.501.022 | 5 de 70 | 65 |
| 2ª | −3.264.862 | 53 de 70 | 17 |
| 3ª | −142 | 66 de 70 | 1 |
| Final | **−2** | 66 de 70 | 0 |

Los 2 pesos finales son el redondeo de cuatro legajos con doble liquidación. Un paralelo que
cierra al peso no existe: cierra cuando lo que queda tiene nombre y es redondeo.
