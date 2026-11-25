# Spec — GTN GSMA desde Tabulado Axton

> Estado: **construido y verificado contra archivos reales de 11/2026; falta que lo use una analista** (2026-11-25). Mockup aprobado por Willy el 2026-11-25. Origen: prototipo HTML
> standalone de Gaby (`gtn-gsma-axton.html`, Claude Chat, noviembre 2026) y su ficha de traspaso. El HTML es
> referencia de comportamiento, no código: lo construido sigue las reglas del repo y las diferencias están en
> el §9.

## 1. Qué es

Un **generador** (modo "Generar Reporte"), sólo para GSMA. Arma el Excel "Gross to Net" (GTN) que GSMA recibe
todos los meses —el que armaba Meta4 hasta octubre 2026— a partir del Tabulado de Axton, con el mismo layout y
las mismas fórmulas, más la columna Recognition Award. Como control, verifica por empleado que Net Pay
(Gross − deducciones) cierre contra ER Net Paid (concepto 605203 de Axton).

Lo recibe GSMA como informe de payroll (`audience: 'payroll'`). No es un archivo de pago para Finanzas.

## 2. Archivos de entrada

1. **Tabulado de Axton del mes** — reporte "Resumen de Liquidacion", formato `axton_imp` (sólo importes).
   Lo lee el lector tolerante existente (`readTabAxton`, D-072), en un casillero propio del control (el
   casillero estándar de Tabulado usa el lector de Meta4), igual que N2. Si el analista sube el `.xls` que
   exporta Axton (una página web con marcos, sin los datos adentro), corta con: "Este archivo es la página
   web que exporta Axton y no trae los datos. Abrilo en Excel y guardalo como .xlsx."
2. **GTN del mes anterior** — `.xls` BIFF8 de Meta4 o el `.xlsx` que generó la app el mes anterior. Parser
   nuevo. Busca la fila de encabezados por el texto "Employee Number" en la columna A y las columnas **por
   título, nunca por letra** (el de Meta4 no tiene Recognition Award; el generado sí, y todo lo que está a la
   derecha corre una columna). Toma: Employee Number, Employee Name, Cost Centre, Location Code y el importe
   anual de la fórmula de "Monthly Salary in USD" (`=<importe>/13.3`). Empleados: desde la fila siguiente a
   la de Currency hasta la fila anterior a la de totales (la primera fila cuyas columnas de concepto son
   `SUM(`). Corta si no encuentra "Employee Number" o alguna de esas columnas, o si no hay empleados.
3. **Tipo de cambio del mes** — lo tipea el analista en el Paso 2. Obligatorio, número mayor a 0. **No se guarda
   entre corridas** (config `perRun` del registry): precargado el mes siguiente sería un tipo de cambio viejo con
   cara de nuevo.

Estructura real verificada con el inspector (archivos que no entran al repo):
- Tabulado 11/2026: hoja `Liquidaciones.AAAAMMDD.HHMMSS.n`, preámbulo en A1 (`EA: GSMA SRL | … | Reporte:
  Resumen de Liquidacion | … | Periodo: 11/2026 - 11/2026 | …`), TOTAL GENERAL en la fila 2 y al pie,
  encabezados en la fila 3, "Imp" en la 4, datos desde la 5. 20 columnas de concepto `NNNN - Nombre`.
  No liquidado = celda vacía. 880023 trae importes negativos.
- GTN Meta4 10/2026 y 11/2026: BIFF8, una hoja `GSMA`, mismo layout los dos (§4).

## 3. Asignaciones: código de Axton → columna del GTN

Configuración **de GSMA**, guardada en `controlConfigs` (D-035/D-039). Cada columna de concepto del Tabulado
tiene que tener exactamente un estado:

| Estado | Qué es |
|---|---|
| Confirmado | Semilla verificada contra meses reales de Meta4 y contra el Tabulado Axton 11/2026 |
| Asignado por el analista | Lo eligió el analista en el Paso 2, con la fecha; vale igual que un confirmado |
| Fuera del GTN | Decisión explícita de que no va al informe; se informa con su importe |
| **Sin asignar** | Código que aparece por primera vez. **Frena**: no se ejecuta ni se genera el GTN |

Las columnas del Tabulado que no son conceptos (`Legajo`, `Apellido y Nombre`, `CUIL`, `F.R.P.`, `Recibo`,
`Mov.`, `Bruto`, `Retenciones`, `Salario Familiar`, `Exento`, `Neto`, `TOTAL -`, `LSD`, `liquidacion`) no se
listan. El concepto se identifica **por código** (prefijo del encabezado), nunca por nombre.

**Semillas confirmadas** (18 + 2 fuera del GTN; las 20 aparecen en el Tabulado 11/2026):

| Columna GTN | Códigos Axton |
|---|---|
| Monthly Salary | 1000 |
| Variable Pay | 1498 |
| Commission | 3000 |
| Teleworking expenses | 503815 |
| Director Allowance | 1032 |
| Social Security | 605110 |
| Health Insurance | 605130 |
| Law 19032 | 605120 |
| Income Tax | 609996 |
| ER Net Paid | 605203 |
| Social Security (20,4%) | 880011 + 880012 + 880013 + 880014 |
| Health Insurance (6%) | 880015 |
| Accident Insurance (1,69%) | 880022 |
| Fixed Accident Insurance | 880021 |
| Fixed Life Insurance | 880025 |
| Fuera del GTN | 880023 (Plan prepaga a cargo de la empresa, sólo costo empresa) · 880001 (Detracción Ley 27.430, sin columna) |

**No sembrados (ASUMIDO en la ficha: salen del Manual de Conceptos de la migración y nunca se vieron en un
Tabulado de Axton).** Cuando aparezcan salen como "sin asignar". El panel muestra al lado la sugerencia del
Manual, **sin aplicarla**:

| Código | Sugerencia del Manual (sin confirmar) |
|---|---|
| 1003 | Days not worked |
| 2487, 2492 | Recognition Award |
| 2545, 2546 | Bonus |
| 2804, 2800 | 13th salary |
| 2252 | Holiday Pay |
| 2620 | Business Referrral |
| 609995 | Income Tax |
| 609999 | columna sin título a la derecha de Income Tax |
| 605691 | Miscellaneous deduction |
| 880027 | Health Insurance (6%) |

Columnas del GTN conocidas por el reporte de Meta4 pero sin código de Axton todavía (Vacation Pay, Vacation
Deduction, Severance, Notice Pay, SAC 3813/3823, contribuciones separadas sobre SAC, ART 6094, Salary
Adjustment): no hay sugerencia; si aparece su código, se asigna a mano.

## 4. Layout del GTN generado

Se reproduce el GTN de Meta4 11/2026 (inspeccionado) **escrito como código** —no hay plantilla binaria en el
repo: un `.xlsx` lo frena el chequeo de datos sensibles y la plantilla del prototipo traía en sus propiedades
el nombre de quien la creó—, con **una columna insertada**: `Recognition Award` inmediatamente a la derecha
de `Referral Bonus`, con Element Code `D0159`, GL Account `200360` y Currency `ARS` (los mismos de Bonus;
decisión de la analista del 25/11/2026), dentro del Gross. Todo lo que en Meta4 está de `Bonus` hacia la
derecha corre una columna.

Layout de Meta4 (letras de Meta4; en el generado, de la M en adelante +1):
- Fila 1: A1 "Gross to Net". Fila 2: A2 "GSMA", B2 fecha día 1 del período, formato `mmm-yy`.
- Fila 3: rótulos de bloque B3 "Employee Information", W3 "Employee Deductions", AH3 "Employer Costs".
- Fila 4: encabezados (literales, con sus espacios): `Employee Number`, `Employee Name`, `Cost Centre`,
  `Location Code`, `Monthly Salary in USD`, `Monthly Salary ` … `TOTAL COST` (lista completa en el
  inspector; AA4 sin celda, AC4 = " ").
- Filas 5–8: "Local Language" (W5:Z5 Jubilacion / Obra Social / Ley 19032 / Impuesto a las ganancias),
  "Element Code", "GL Account", "Currency" por columna.
- Empleados desde la fila 9, una por empleado; totales en la fila siguiente a la última (`=SUM` por columna
  de E a la última).
- Fórmulas por fila: Monthly Salary in USD `=<anual>/13.3`; Gross Pay `=SUM(F{r}:<col antes de Gross>{r})`;
  Total Employee deductions `=SUM(<Social Security>{r}:<col sin título>{r})`; Net Pay `=Gross−deductions`;
  Net Pay on Payslips `=+NetPay−ERNetPaid`; Employer Total costs `=SUM(<SS 20,4%>:<ER Pension>)`;
  TOTAL COST `=Gross+Employer Total costs`.
- Detracción: 3 filas debajo de los totales, rótulo "Detracción art. 23 Ley 27.541" en la columna de Social
  Security y −2.040 fijo en la de Law 19032 (en Meta4, W23/Y23). No sale del Tabulado; entra sólo en el
  cuadro.
- Cuadro de autorización (Meta4: AV1:BA10): "INFORMATION PAYROLL AUTHORISATION FORM", Net Payments − Pesos
  (`=+<Net Pay total>`), **Exchange Rate (Meta4 BA4; en el generado BB4) = el tipo de cambio del Paso 2**,
  (Net Payments − USD), Social Security Payments (`=+SS+HI+Law19032+SS20,4+HI6+Acc+FixAcc+FixLife+detracción`),
  Withholding Tax Payments (`=+Income Tax+col sin título`), Net (USD), Statutory Payments.
- Vacío vs 0, como Meta4: Monthly Salary, Variable Pay, Teleworking y las deducciones mensuales llevan
  importe siempre (0 si no vino); Referral Bonus, Recognition Award, Bonus, 13th salary, Business Referrral,
  Director Allowance y las tres columnas de descuento (sin título, Miscellaneous, sin título) llevan 0; el
  resto queda vacío si no hay importe.
- Nombre: `5_AAAA_MM_GSMA_Argentina_GTN.xlsx`, hoja `GSMA`, recálculo completo al abrir.
- Marcas: celdas en amarillo con comentario para el empleado nuevo (Employee Number, Cost Centre, Location
  Code y sueldo USD vacíos) y para Recognition Award / Business Referrral con importe. También (construido):
  ER Net Paid que no vino en el Tabulado → celda **vacía** en amarillo (no 0); sueldo USD del GTN anterior que
  no era la fórmula `/13.3` → se copia el valor tal cual, en amarillo (no se reconstruye un anual).
- Orden de las filas (construido): primero los empleados que cruzaron, en el orden del GTN anterior; después
  los que no cruzaron, en el orden del Tabulado. Employee Name: el del GTN anterior si cruzó; si no, el de Axton.
- Cada fórmula lleva su resultado cacheado (el que va a dar Excel sobre los valores escritos), para quien abra
  el archivo sin recalcular; con `fullCalcOnLoad` Excel lo recalcula igual.

## 5. Cruce con el GTN anterior (por nombre)

El GTN no tiene legajo de Axton ni CUIL: se cruza por nombre. Todas las palabras del nombre del GTN (sin
tildes, sin mayúsculas, sin importar el orden) tienen que estar en el nombre de Axton, y el candidato tiene
que ser único y no estar tomado. Nada se resuelve en silencio:
- ningún candidato → el empleado de Axton queda como **nuevo** y el del GTN como **no vino**; los dos se
  listan;
- más de un candidato → no se cruza, se lista con los candidatos;
- dos filas del GTN con el mismo nombre → se listan las dos, ninguna se descarta y **ninguna se cruza**;
- dos filas del GTN que piden al mismo empleado de Axton (p. ej. "PEREZ" y "PEREZ JUAN") → conflicto: ninguna
  se cruza, se listan (construido: no se resuelve por orden de aparición);
- el GTN trae una palabra de más que Axton (todas las palabras de Axton están en el GTN, pero no al revés) → NO
  cruza; se muestra en una línea como "no cruzó — el GTN trae una palabra de más" para que el analista lo
  complete a mano;
- el cruce por nombre se muestra completo en resultados (nombre Axton ↔ nombre GTN ↔ Employee Number).

Se descartó una tabla legajo Axton ↔ Employee Number por ahora: la configuración del cliente viaja en el seed,
que se commitea, y metería identificadores de empleados en el repo. Queda como deuda si un caso real falla.

## 6. Qué frena y qué avisa

**Frena (no deja ejecutar ni generar):** concepto del Tabulado sin asignar; falta el tipo de cambio; el
Tabulado es el `.xls` web; el GTN anterior no tiene "Employee Number" o alguna de sus columnas. Además
`run()` devuelve `{ error }` si le llega un concepto sin asignar (defensa: nunca un concepto se pierde sin
aviso).

**Avisa (genera igual, lo lista para revisar):** empleado nuevo sin Employee Number; nombre que no cruzó o
cruzó con más de uno; empleado del GTN anterior que no vino; Recognition Award o Business Referrral con
importe; ER Net Paid faltante en un empleado (no se completa con 0 en silencio); un concepto que no cierra
con el TOTAL GENERAL; GTN anterior cuyo sueldo USD no es la fórmula `/13.3`.

## 7. Pantalla (mockup aprobado 2026-11-25)

- **Paso 2:** casilleros de Tabulado y GTN anterior; tipo de cambio obligatorio; **tabla de asignaciones**
  destacada, con dos vistas ("Por código" / "Agrupada por columna del GTN", con subtotal y cantidad de
  códigos por grupo, "Sin asignar" como grupo rojo arriba y "Fuera del GTN" al final), chips por estado con
  cantidad, desplegable por columna del GTN y filtro por columna de la tabla. El aviso rojo de "N sin
  asignar" nunca lo esconde un filtro ("Hay N sin asignar fuera del filtro — ver"). Ejecutar deshabilitado
  con los motivos listados. Construido: el registry declara `blockers(state)` (campo nuevo, documentado en el
  encabezado de `registry.js`); con algún motivo "Siguiente →" queda deshabilitado, la barra dice "Falta: 1
  concepto · 1 dato" y el panel lateral "Para ejecutar te falta" lista cada motivo con sus códigos.
- **Resultados** (`Resumen · Fichas · Planilla`): veredicto, semáforo, tiles (empleados, Gross, Net, ER Net
  Paid, diferencia, tipo de cambio), **"Cómo se armó cada columna del GTN"** con los mismos filtros y dos
  vistas —"Por columna del GTN" agrupada: cada columna es un encabezado (ej. 13th salary) con una fila por
  código que la alimenta y su importe, expandible; y "Por código"— (pedido de Willy en la revisión),
  avisos, cruce por nombre, chequeos de lectura, planilla por empleado, export.
- **Semáforo:** unidad `legajo` (empleado); con diferencia = Net Pay ≠ ER Net Paid. Los avisos no cambian el
  color.
- **Monto de diferencia:** 0,01 fijo, constante con nombre (tolerancia estructural: los dos lados salen del
  mismo archivo). Declarado con `ownTolerance`.
- **Export:** primero "GTN para GSMA (.xlsx)"; después la planilla de control (.xlsx · CSV · Copiar).

## 8. Verificación

Anclas (Tabulado Axton 11/2026 + GTN Meta4 10/2026 como mes anterior): 11 empleados, Gross Pay
143.597.186,80, Total Employee deductions 47.118.089,86, Net Pay 96.479.096,94 = ER Net Paid 96.479.096,94.
Contra el GTN de Meta4 11/2026 (Gross 143.597.159,05, Net 96.479.069,19): la diferencia de 27,75 está en
Variable Pay y es de Axton vs Meta4, no del armado. Comparación celda por celda (fórmulas, layout, vacíos/0)
contra el GTN de Meta4 11/2026, con la columna Recognition Award como única diferencia de estructura.

## 9. Diferencias entre el prototipo y lo construido

| Prototipo | Construido | Por qué |
|---|---|---|
| Códigos fijos en el código | Configuración de GSMA con semillas confirmadas, editable en el Paso 2 | D-035/D-039 |
| ASUMIDO aplicados solos | No sembrados; salen "sin asignar" con la sugerencia del Manual al lado | Regla del traspaso: sólo se siembra lo confirmado contra un archivo real |
| Concepto sin columna: nombre en naranja, el GTN se genera igual | Frena hasta asignarlo | Pedido de Willy: no puede quedar un concepto sin asignar |
| Homónimo en el GTN anterior: la segunda fila se descarta sin aviso | Se listan las dos | Nada en silencio |
| ER Net Paid faltante → 0 sin aviso | Aviso propio | `null` no es `0` |
| Semáforo amarillo con cualquier aviso | El color sólo mide el neto; los avisos se listan | Decisión de Willy |
| Plantilla `.xlsx` embebida en base64 | Layout escrito como código | Hook de datos sensibles; la plantilla traía el nombre del autor en sus propiedades |
| Lector de Tabulado y clave de legajo propios | `readTabAxton`, `consolidate.js`, `makeLegajoKey`, `toNum` | Piezas compartidas del repo |
| No valida la fila "Imp" | La valida el lector (`axton_imp`) | — |

## 10. Abierto

- **Detracción:** el −2.040 fijo ("Detracción art. 23 Ley 27.541") ¿sigue igual con Axton? No es el 880001
  (que en 11/2026 suma 77.040,48). Pregunta para Gaby.
- El 13,3 del sueldo USD y el −2.040 quedan como constantes del layout de GSMA; si cambian, se cambian ahí.
- GSMA figura con `sourceSystem: 'meta4'` en el seed; no afecta (el control se ofrece por cliente).
