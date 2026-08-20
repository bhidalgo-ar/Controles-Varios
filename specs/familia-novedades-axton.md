# Familia de Novedades (Axton) — spec

**Estado:** relevada, con decisiones cerradas, y con los dos cimientos —N0a (lector ExpNov) y
N0b (lector del Tabulado de Axton + totalizador)— más el generador N1 implementados el
2026-08-20. **N2 sigue en diseño.** N1 está construido pero **sin verificar contra un archivo
real**: ver "Lo que N1 espera de un archivo real". El lector de Tabulado tampoco se corrió
todavía contra un Tabulado real.
**Origen:** relevamiento de Guillermo sobre SharePoint, 2026-08-20 — carpetas de
Novedades y de Liquidaciones de **julio 2026** de los 7 clientes Axton: Plastic
Pilar (POP), Merz, Epiroc, SIASA, Geopagos, Red Bull y Coelsa (más el histórico
09/2025 de POP). 14 barridos con agentes de recolección; ningún archivo de
cliente entró al repo. Prompts de arranque de cada frente en
`docs/prompts-familia-novedades.md`.

## Para qué sirve la familia

Hoy la novedad viaja en tres pasos y los dos saltos se controlan a mano (o no se
controlan):

1. **La planilla del cliente** — cada cliente manda la suya, con sus nombres y
   sus notas.
2. **La planilla depurada por el analista** — la misma, retocada: columnas de
   cálculo agregadas, conceptos que el cliente no puso, filas completadas.
3. **El importador `F2_Consolidada`** — lo que efectivamente se sube a Axton.

La evidencia de que los saltos fallan está en los propios archivos: el BUSCARV
manual contra el export de Liquidaciones adentro de la planilla de POP 09/2025,
el VLOOKUP de Coelsa contra el borrador del mes anterior que devuelve `#N/D`, y
SIASA Aguas y Gaseosas 07/2026, donde la planilla del cliente trae un empleado
que no llegó al importador (sin registro de por qué).

## Decisiones de Guillermo (2026-08-20) — ver D-070

1. **La app genera el importador** (no controla la transcripción a posteriori):
   el analista sube la planilla del cliente, la app arma el `F2` por unidad
   organizativa, el analista lo valida en pantalla y lo descarga. El error de
   transcripción (B2a del catálogo) desaparece por diseño en vez de detectarse.
2. **El cruce contra la liquidación compara cantidad E importe cuando los dos
   existen.** Lo no comparable (novedad en días contra Tabulado sólo-importes)
   **no bloquea: se informa claramente** como "no comparable" con su motivo.
   Todo lo extraño se marca.
3. **Las columnas sin código se listan aparte, siempre.** Nada se ignora en
   silencio (coherente con "un default silencioso es un bug" de `CLAUDE.md`).

## El formato — qué es estable y qué no

### Lo que se repite en los 7 clientes (la firma)

- Hoja cuyo nombre matchea `d  axFiles *ExpNov*` (con variantes:
  `HidalgoExpNov_1132_2`, `Hidalgo ExpNov_1251_`, `Hidalgo ExpNov_1` — el
  número cambia por cliente y hay versiones con y sin espacio y con y sin `_2`).
- Una fila de **nombres de concepto en criollo** y, debajo, una fila con el
  **código** de cada concepto; a la izquierda un bloque de identificación que
  siempre contiene `Legajo` y `Apellido y Nombres`.
- Datos desde la fila siguiente, **una fila por empleado**.
- Celda vacía = "no tiene esa novedad" (no es cero).
- Valor de concepto en el importador: `cantidad$importe` pegados en una celda
  (ej. `1$159811,7958`, hasta 12 decimales) **o** una cantidad suelta. Es el
  formato normal del importador, no un error de tipeo — visto en Coelsa, Merz,
  Epiroc, Geopagos y SIASA.

### Lo que NO es estable (verificado, con cliente y archivo)

| Variación | Evidencia |
|---|---|
| **Carpeta del mes** | `07` (POP, Coelsa) · `07-2026` (Merz, SIASA, Red Bull) · `07- Julio` (Epiroc, Geopagos). Y Geopagos guarda la liquidación en `Liquidación` (singular, con tilde), no `Liquidaciones`. La subcarpeta puede cambiar de nombre entre meses (SIASA: `2-NOVEDADE MODIFICADAS` en 06, `B - Novedades modificadas` en 07) |
| **Ancho del bloque de identificación** | 3, 6, 8, 9 o 31 columnas según cliente y variante → el primer concepto cae en D, E, F, G, I, J o AF. **Nunca asumir "columna J"** |
| **Fila donde arranca el bloque** | En SIASA y en el F2 original de Coelsa todo está corrido: criollo en fila 2, códigos en fila 3, datos desde la 4. En Coelsa la fila 1 son **totales por concepto**, no metadata |
| **La fila de criollo puede no existir** | F2 de SIASA y de Merz, "Novedades FUERA DE CONVENIO" de Red Bull: sólo códigos |
| **Metadata de la fila 1** | `Unidad Organizativa / nro / nombre / Fecha` (POP, Red Bull, Coelsa F3) o `Empresa / nombre / Fecha` (Epiroc, Merz F2/F3, Geopagos). La fecha puede ser el timestamp real del export **o la fecha de la plantilla original** (POP: `09/08/2024` en archivos de 2026) → **el período nunca sale de esa fecha**; sale de la carpeta o del nombre del archivo |
| **El juego de conceptos cambia mes a mes** | POP: 40 columnas en 09/2025, 45 en 07/2026. Epiroc: 12 en junio, 11 en julio (se corre todo una letra) |
| **Códigos duplicados en dos columnas** | `605705` ×2 (POP mensual), `1530` ×2 (Epiroc), `1600` ×2 (Merz) |
| **Códigos no numéricos** | `SAL BAS` (Geopagos). Y etiquetas que ocupan el lugar del código sin serlo: `Inicio`/`Fin`, `Salida`/`Regreso`, `Informar Cantidad`, `Suma total` (SIASA) |
| **Columnas sin código** | "Lic. Paternidad" y "Revisar que se aplique descuento por ayuda especial" (**con datos cargados**) en Coelsa; "Licencia por ART", "Ausente Just. Por Paro" en SIASA; columna "Observaciones" en Merz |
| **El criollo no identifica nada** | 17 códigos con rótulo distinto entre el F2 y el F3 del mismo cliente y mes (Coelsa); `2500` = "BONO" en la plantilla y "Spot Bonus" en el archivo del cliente (Merz); `1100` = "Horas extras al 100%" y "Horas Extras 50%" según el archivo (Geopagos); rótulos que son anotaciones ("SOLO PLASTIC", "Original=Fina", "DC" ×4 códigos, "Renombrar a: Otros descuentos"). **Matchear siempre por código** — refuerza D-039 |
| **Retoques del analista adentro del archivo** | Columnas de cálculo sin encabezado (Geopagos Estimación: `=K5*G5`), filas de totales al pie, VLOOKUP contra libros externos — incluso contra un SharePoint **del cliente**, fuera del tenant (POP anticipos) y contra otro sitio (`/RRHH SIASA`) |
| **Hojas extra** | Workbooks de hasta 10 hojas (POP jornales), hojas **ocultas** (Geopagos: `OS`, `DOMICILIO`), hoja `Tcs` vacía |
| **Otro export emparentado** | `d  axFiles Hidalgo ExpConceptos` (Coelsa `CONCEPTO 1022`): un concepto por archivo con columnas satélite `Inicio_`/`Vto_`/`Detalle_` |
| **Formato largo sin código** | POP anticipos y bajas: hoja `Novedades`, una fila por empleado-concepto, concepto **por nombre** ("ANTICIPO DE SUELDO") y la unidad declarada en una columna Comentarios |
| **Bloqueos** | Varias planillas "Novedades del mes" (Epiroc, Red Bull, POP templates) tienen etiqueta de confidencialidad (Purview) y no se leen por conector — en el navegador del analista abren normal |

### El lado liquidación (insumo del cruce — alimenta la pieza T, D-065)

| | POP | Epiroc | Merz | SIASA | Red Bull | Coelsa | Geopagos |
|---|---|---|---|---|---|---|---|
| Filas de preámbulo | 0 | 0 | 1 | 1 | 2 | 2 | 0 |
| Pares Cant/Imp | **sí** | **sí** | no | no | no | no | no |
| Fila por liquidación | **sí** (hasta ×3 por legajo, columna `liquidacion`) | **sí** | no | no | no | no | no |
| `TOTAL GENERAL` | 1 (última) | 1 | 2 (arriba y abajo) | 2 | 2 | 2 | 1 |

Además, verificado:

- **El Tabulado no trae todos los conceptos liquidados.** Red Bull: `520121`
  ($200.000,94) sumado en la columna Exento **sin columna propia** (verificado
  por suma); Epiroc: `3100` y `605707` sólo en el totalizador; SIASA: 7 códigos
  ídem. → El cruce necesita también el reporte **"Totales de Concepto"** (hoja
  `totalesconcepto.*`, preámbulo `----`, código y rótulo en columnas separadas).
- **Dos versiones del mismo mes cambian el ancho**: Merz V1 23 vs V2 24
  columnas (entra `Cargo`+`Recibo`, sale `Legajos`); SIASA V1 85 vs V2 83;
  Coelsa V1 16 vs V2 15 columnas de identificación. Nada por posición (D-066).
- **SIASA tiene 6 tabulados por mes** (uno por liquidación) y el consolidado
  por legajo vive en `Empresas/SIASA/Reportes/… Tabulado COMPLETO MM-AAAA.xlsx`
  (12 columnas de identificación, netos ya sumados). POP al revés: el general
  mezcla las 7 liquidaciones del mes en filas.
- **Un código puede colapsar varios conceptos reales**: SIASA `605130` = 10
  obras sociales en el totalizador, una sola columna en el Tabulado; `2250` = 4
  rótulos. Rótulos repetidos con código distinto: `999`/`1000` "Sueldo Basico".
- **Basura alrededor**: filas agregadas a mano **debajo** del `TOTAL GENERAL`
  con fórmulas (Geopagos LF); espacios duros U+00A0 en encabezados (`Centro de
  Costo`, POP y Coelsa); typo `% Varicación` en un reporte de POP; sufijo `(c)`
  en el export consolidado y `(v)` en el de cada corrida.

## Los dos controles y sus cimientos

### N0a — Lector de la familia ExpNov (cimiento) — **hecho** (2026-08-20)

`js/parsers/expNovParser.js`. Reconoce por firma (nombre de hoja + fila que
contiene `Legajo`/`Apellido y Nombres`), nunca por posición, y devuelve
`{ parsedRows, parseMetadata }`:

- `parsedRows`: una fila **por celda cargada** —la unidad de este formato es la
  novedad, no el empleado— con `{ legajo, codigo, cantidad, importe,
  unidadDeclarada, fila, col, letraCol }`. El legajo viaja **crudo** (quién es el
  mismo empleado lo decide el control con `makeLegajoKey`); `unidadDeclarada` es
  `'cantidad_e_importe'` cuando la celda vino como `cantidad$importe` y
  `'cantidad'` cuando vino un valor suelto. Celda vacía no emite nada; un `0`
  escrito sí.
- `parseMetadata`: `columnas` (código, rótulo en criollo, celdas cargadas,
  duplicado, código no numérico), `columnasSinCodigo` (rótulo + celdas cargadas),
  `empleados`, `bloqueIdentificacion`, `unidadOrganizativa` / `empresa` /
  `fechaArchivo`, `noParseables`, `filasSinLegajo`, las filas de encabezado
  detectadas y `avisos`. **`periodo` es siempre `null`: lo declara el analista.**

Cómo se ubica, sin asumir posición: ancla = la fila con `Legajo` y `Apellido y
Nombres`; fila de códigos = la pegada a ella (arriba o abajo, las dos variantes
existen), elegida por cuántos códigos numéricos trae a la derecha del legajo, con
prioridad para la fila del ancla; fila de criollo = la de arriba, sólo si trae
rótulos de verdad (en Coelsa la fila 1 son totales); primer concepto = la primera
columna con código numérico, estirada hacia la izquierda mientras haya rótulo en
criollo (así `SAL BAS` y `Licencia por ART` no se pierden dentro de la ficha).
Un código no numérico se acepta como código si tiene su rótulo en la fila de
criollo, y sale como aviso; si no lo tiene, la columna se lista como sin código
con esa etiqueta de rótulo (`Informar Cantidad`, `Suma total`).

Contrato escrito como test ejecutable en `tests/expNovParser.test.js` (68
asserts, datos inventados), en la cadena de `package.json`. Pendiente: correrlo
contra un archivo real de cliente — los del relevamiento no entraron al repo.

### N0b — Lector del Tabulado de Axton (cimiento, extiende la pieza T / D-065) — **hecho** (2026-08-20)

`js/parsers/tabAxtonReader.js`. `readTabAxton(arrayBuffer)` devuelve
`{ parsedRows, parseMetadata }` y `layoutTabAxton({ sheetName, rows, maxCol })` es
la resolución de estructura sola, pura y exportada para testear las firmas.

Cómo se ubica, sin asumir posición: **la fila de encabezados es la que trae la
columna `Legajo`** (se busca en las primeras 12 filas, así se banca el preámbulo de
0, 1 o 2 filas y el `TOTAL GENERAL` de arriba metido en el preámbulo); los
subencabezados son la fila pegada abajo, y son los que dicen la variante —al menos
un `Cant` → `axton`; sólo `Imp` → `axton_imp`— y qué columna es cantidad y cuál
importe. Después cada columna se clasifica **por su encabezado**: ficha (por alias,
sin acentos ni espacios duros), concepto (`1000 - Sueldo Basico`, **por código**),
totalizador (`Bruto`/`Retenciones`/`Exento`/`Neto`), no-concepto conocido
(`TOTAL -`, `LSD`) o columna que no se pudo atribuir. Así el bloque de
identificación puede medir 12, 15, 16 o 31 columnas sin que cambie nada.

- `parsedRows`: **una fila por liquidación**, no por empleado (un legajo hasta 3
  veces en POP). Lleva la ficha con las claves que el archivo trae, los
  totalizadores como `<nombre>_cant`/`<nombre>_imp` y cada concepto como
  `cant_<codigo>`/`imp_<codigo>`. El legajo viaja **crudo**. Una columna que el
  archivo no trae **no se emite como clave vacía** —se omite— para que el control
  distinga "la columna no está" de "la celda vino vacía"; una celda vacía de
  concepto es `null`, y `null` no es `0`. **La fila `TOTAL GENERAL` no viaja acá**,
  para que ningún cruce la tome por un empleado: está en
  `parseMetadata.totalGeneral`.
- **Consolidar es del control**, con `js/controls/consolidate.js` y
  `makeLegajoKey(mapping.legajoKeyMode)` en los dos lados del cruce (D-042). El
  contrato está escrito como assert en `tests/tabAxtonReader.test.js`: agrupado por
  legajo, el total por concepto reproduce el `TOTAL GENERAL` del archivo.
- **Una cantidad ausente no se infiere** (D-065): en la variante sólo-Imp las claves
  `cant_<codigo>` **no existen**, `cantidadesDisponibles` viaja en `false` y el
  aviso pide el export con cantidades y anticipa que el control sale INCIERTO.
- `parseMetadata` lleva además `formato`, `reporte` (el campo del preámbulo),
  `empresa`, `periodo`, las filas de encabezado y de datos, `conceptos` y
  `totalizadores` con sus claves, `uniqueLegajos`,
  `legajosConVariasLiquidaciones` / `maxLiquidacionesPorLegajo`, `liquidaciones`,
  `columnasSinClasificar`, `columnasIgnoradas`, `totalGeneralFilas`,
  `totalGeneralDuplicado`, `totalesQueNoCierran`, `filasPostTotal`,
  `filasSinLegajo` y `avisos`.
- **El corte de las filas agregadas a mano es el ÚLTIMO `TOTAL GENERAL`**, no el
  primero: en la variante duplicada la copia de arriba puede caer debajo de los
  subencabezados y cortar ahí tiraría la nómina entera (D-072).
- **Las sumas se validan contra el `TOTAL GENERAL` del propio archivo**, con
  tolerancia de un centavo. Lo que no cierra sale en `totalesQueNoCierran` con los
  dos números y en un aviso — aviso y no error: el export puede venir retocado a
  mano (D-065) y el resto sigue sirviendo.

El totalizador se lee con `readTotalesConcepto` en
`js/parsers/totalesConceptoParser.js` —el mismo módulo que ya usa la Contabilidad
Desglosada, compartiendo la lectura de la tabla en sus dos formatos (HTML y .xlsx
real)— y devuelve la unidad **legajo × concepto × liquidación** con su cantidad y su
importe, **sin exigir las cuentas contables**: el export que se baja para comparar
novedades puede venir sin ellas y sirve igual. Avisa cuando no trae columna
`Cantidad`, cuando una fila no tiene número de concepto, y cuando un mismo código
agrupa varios conceptos reales (SIASA: `605130` son 10 obras sociales, `2250` tiene
4 rótulos).

El campo `Reporte:` del preámbulo entró al detector de formato con un cuarto
formato, `axton_tot`: es lo único que distingue los tres exports de Axton, que
arrancan todos igual. Si el analista sube el totalizador en el casillero del
Tabulado, `readTabAxton` corta diciendo qué archivo es y dónde va.

83 asserts en `tests/tabAxtonReader.test.js`, en la cadena de `package.json`.
**Ningún control existente cambia y todavía no hay pantalla.** Pendiente: correrlo
contra un Tabulado real —los del relevamiento no entraron al repo— y que
`tabAxtonParser.js` (el estricto, que hoy usa Variaciones de POP) pase a delegar en
el lector, en un PR aparte (D-072).

### N1 — Generador de importador ("Generar Reporte") — **hecho** (2026-08-20)

`js/controls/novedadesImportador.js` + `js/ui/novedadesImportadorConfigEditor.js`.
Control `novedades_importador`, scope `sistema` / `axton`, grupo propio, modo
"Generar Reporte", `tabRequired: false`.

Entrada: la planilla de novedades del cliente (ficha `novedades_axton_file`, la
lee N0a) y, **opcional**, el importador ya armado (ficha `f2_armado_file`, alias
de la anterior — es el mismo formato en el otro extremo del circuito). Salida: el
`F2_Consolidada` en `.xlsx`, más la pantalla de validación.

**Layout del F2 que genera** (deducido de los F2 reales de SIASA y de Merz —los
dos pilotos—, pendiente de confirmar contra uno real):

| Fila | Qué |
|---|---|
| 1 | `Unidad Organizativa` · nro · nombre · fecha de generación. `Empresa` · nombre · fecha cuando la planilla declara empresa y no UO |
| 2 | `Legajo` · `Apellido y Nombres` · un código de concepto por columna |
| 3+ | un empleado por fila; celda `cantidad$importe` cuando hay los dos, la cantidad sola cuando no hay importe, **vacía** cuando no hay novedad |

**No lleva fila de nombres en criollo**: los F2 de SIASA y de Merz traen sólo
códigos. El legajo sale **tal como lo escribió el cliente**, no normalizado
(Axton lo espera como lo conoce); si la planilla escribe el mismo legajo de dos
formas (`007` y `7`), se consolida y **se avisa**. La celda va como texto para
que Excel no interprete `1$500` como una moneda, y el legajo también (los ceros a
la izquierda se pierden como número).

**Cómo se resuelve el concepto de cada columna** (D-039, en este orden):

1. el código que trae la propia planilla — es el caso normal;
2. lo que el analista confirmó en el Paso 2, guardado en `controlConfigs` por
   `[clientCode+controlId]` con la clave `novedades_importador_config`. Se guarda
   **por rótulo normalizado, no por letra de columna**: el juego de conceptos
   cambia mes a mes y se corre de columna (Epiroc pasó de 12 a 11 entre junio y
   julio), así que una config por posición queda mal al mes siguiente sin avisar;
3. nada más. Una columna con datos, sin código y sin confirmación **no entra** al
   importador: sale listada como "quedó afuera", con el motivo.

El catálogo de conceptos del cliente (si está cargado en la app) **sugiere** el
código de una columna cuyo rótulo coincide exacto con la descripción o un alias.
Sugiere y nada más: la sugerencia se ve como un botón y no entra hasta que el
analista la confirma. El match es exacto a propósito — uno parcial ("COCHERA"
contra `4899-COCHERA_IG` y `8805-DTO_COCHERA`) propone el concepto equivocado con
la misma cara de acierto. El analista también puede marcar una columna como "no
va al importador" (Observaciones de Merz, notas del analista): queda afuera **a
propósito** y se informa como tal, no como problema.

**Qué se informa antes de descargar:** legajos y conceptos que entran, total de
cantidad y de importe por concepto, la planilla completa tal como va a salir, y
en "quedó afuera" —con su motivo— las columnas sin código, las filas con datos y
sin legajo, y los valores que no son un número. Más cuatro chequeos de armado:
que los importes y las cantidades del F2 sumen lo mismo que la planilla leída
(al centavo — es estructural), que todas las columnas con datos tengan concepto,
y que la unidad organizativa esté declarada.

**Contra el importador ya armado** (cuando el analista lo carga): cruce por
legajo + código, consolidando por legajo **los dos lados** con la misma clave, en
cuatro bandas — coincide / difiere / sólo en la planilla del cliente / sólo en el
importador armado. La tercera es el caso que originó el frente: un empleado que
estaba en la planilla y no llegó al importador. Cierra al centavo (`CUADRE_EPS`):
son dos versiones del mismo dato del mismo mes, así que el monto de diferencia
del cliente no aplica —el control lo declara en `ownTolerance`—, y además se
comparan cantidades (horas, días), que medidas con un monto en pesos esconderían
tres horas detrás de un umbral de $ 100.

**Unidad del semáforo: `legajo`.** `unitsTotal` = legajos que entran al
importador; `unitsWithDiff` = **unión** (no suma) de los que tienen algo afuera y
los que difieren contra el importador armado. Si el archivo generado no cuadra
contra la planilla leída, se marcan todos: el importador entero es sospechoso.

**Una UO por corrida.** La planilla del cliente cubre una unidad organizativa
—así están guardadas las de SIASA, una carpeta por UO— y el `F2` sale por UO. Con
4 UOs son 4 corridas, una por planilla. La UO sale de la fila 1 del archivo o de
lo que el analista carga en el Paso 2; si no la declara nadie, el importador se
genera igual y se avisa. Una planilla con varias UOs adentro necesitaría que el
lector devuelva la UO por empleado, que hoy no existe.

Contrato escrito como test ejecutable en `tests/novedadesImportadorControl.test.js`
(72 asserts, datos inventados), en la cadena de `package.json`, más
`tests/e2e/novedadesImportador.spec.js` (6 pruebas de navegador, los tres temas).
Entre los asserts está el **ida y vuelta**: el F2 que genera la app lo vuelve a
leer el lector ExpNov con los mismos valores — es lo que ocupa el lugar de la
comparación contra el archivo real mientras no haya uno.

Sin contrato en `js/exports/contracts.js` a propósito: las columnas del F2 son
las de los conceptos que trajo la planilla de ese mes —cambian en cada corrida—,
y un contrato describe un juego fijo de columnas. Mismo caso que
`acumuladores_ganancias` y `control_netos`.

#### Lo que N1 espera de un archivo real (D-064 — no se generaliza sin confirmación)

1. **Un F2 real de una UO de SIASA 07/2026** (o de Merz) para confirmar el layout
   de arriba: si Axton espera otra cosa —otra fila de metadata, otro rótulo de
   encabezado, la fila de criollo presente— el archivo generado se rechaza al
   subirlo, y eso no se descubre leyendo código.
2. **Un caso completo**: un legajo de la planilla modificada de SIASA 07/2026, sus
   datos crudos, dos o tres valores del F2 real reproducidos desde esos crudos, el
   cálculo por las dos vías y la descomposición de la diferencia. Uno, revisado, y
   después el resto.
3. **Que el lector reconozca la planilla real**: las variantes de firma del
   relevamiento están cubiertas, pero ninguna planilla real entró al repo.
4. El caso de **Aguas y Gaseosas**: cargando la planilla del cliente y el F2 real
   como archivo opcional, el empleado que no llegó tiene que salir en la banda
   "sólo en la planilla del cliente".

### N2 — Novedades vs Liquidación (B2b del catálogo)

Entrada: el importador (idealmente el generado y validado) + Tabulado del
período + Totales de Concepto. Cruce por **legajo+código**, consolidando por
legajo los dos lados (`makeLegajoKey`), comparando cantidad e importe cuando
ambos existen. Resultados en cuatro bandas: coincide / difiere / **no
comparable (informado, no bloquea)** / sin contraparte — y ahí distinguir "no
se liquidó" de "el Tabulado no lo muestra" mirando el totalizador. Unidad del
semáforo: `legajo`. Sin conversión de unidades (D-065): horas contra días se
informa como no comparable.

## Roadmap de implementación

| Fase | Qué | Depende de |
|---|---|---|
| 0 | ~~N0a Lector ExpNov + tests~~ **hecho** (`js/parsers/expNovParser.js`) | — |
| 0 | ~~N0b Lector Axton de Tabulado + totalizador + tests~~ **hecho** (`js/parsers/tabAxtonReader.js`, `readTotalesConcepto`) | detector D-065 (hecho) |
| 1 | ~~N1 Generador de importador~~ **hecho**, sin verificar contra archivo real (`js/controls/novedadesImportador.js`) | N0a |
| 2 | N2 Novedades vs Liquidación (piloto: SIASA y Merz; volumen: POP) | N0a + N0b + N1 (los tres hechos) |

**Pilotos elegidos por evidencia:** SIASA guarda las tres capas del circuito en
carpetas (`A - Novedades recibidas` / `B - Novedades modificadas` /
`C - Importadores`, por 4 UOs) — es el único donde N1 y N2 se pueden verificar
punta a punta contra un mes real ya cerrado, incluido el caso de Aguas y Gaseosas
(un empleado en la planilla del cliente que no llegó al importador). Merz es chico (43 legajos) y guarda ORIGINAL/MODIFICADO. La
verificación sigue D-064: de a un caso completo, nunca un conteo.

## Falta información (no traba las fases 0–1)

1. **Planillas bloqueadas por Purview**: `Panilla de novedades` de Epiroc,
   `NN - Novedades <Mes>` de Red Bull, los dos `templates` de POP. Willy las
   abre en el navegador y pasa la estructura, o exporta una copia sin etiqueta.
2. **`Novedades sueldos Julio'26` de Coelsa** (2,6 MB): timeout del conector.
3. **Las 9 hojas restantes** del workbook de novedades de jornales de POP.
4. **El caso de SIASA Aguas y Gaseosas**: preguntar a la analista por qué se cayó un empleado
   entre la planilla recibida y el importador (¿baja legítima?). Es el primer
   caso de verificación de N2.
5. **Manual de conceptos por cliente**: existen al menos el de POP y el de
   Geopagos en SharePoint — son la semilla del mapeo nombre→código de N1.

## Queda afuera (por ahora, con motivo)

- **Novedades Meta4** (POF, Marval, FINADIET, Sportline): este relevamiento fue
  sólo Axton. Requiere su propio barrido.
- **B2a como control separado**: lo disuelve N1 — si el importador se genera,
  no hay transcripción que controlar. Si un cliente nunca adopta el generador,
  se reevalúa.
- **B1 contra padrón e histórico** (legajo egresado, valor fuera de rango):
  fase posterior; necesita el padrón/histórico del cliente en la app.
- **Altas y bajas de legajos** (`F3`, `Plantilla_Importador_Asignaciones`,
  `Importador_Legajos`): son datos maestros, familia A del catálogo, no
  novedades de conceptos.
- **Conversión de unidades** horas↔días: excluida por D-065.
- **Formato largo de POP (anticipos/bajas)**: entra recién cuando N1 esté
  probado con el formato ancho — es mapeo por nombre puro y merece su propio
  caso.
- **Tabulado vertical de Toyota/TASA**: sigue afuera (D-065).
