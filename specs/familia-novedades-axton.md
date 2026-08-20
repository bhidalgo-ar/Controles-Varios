# Familia de Novedades (Axton) — spec

**Estado:** relevada, con decisiones cerradas y con el cimiento N0a implementado (2026-08-20).
N0b, N1 y N2 siguen en diseño.
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

### N0b — Parser Axton del Tabulado (cimiento, extiende la pieza T / D-065)

Preámbulo 0/1/2 filas (el campo `Reporte:` del preámbulo distingue Resumen /
Consulta / Totales de Concepto), pares Cant/Imp vs sólo-Imp, `TOTAL GENERAL`
simple o duplicado, fila por liquidación → **consolidar con
`js/controls/consolidate.js`**, ignorar filas manuales post-total, normalizar
U+00A0, y leer el totalizador `totalesconcepto` como fuente complementaria.

### N1 — Generador de importador ("Generar Reporte")

Entrada: planilla del cliente (por N0a cuando trae códigos; con mapeo
nombre→código del **catálogo del cliente** cuando no — semillas en los manuales
de conceptos que ya existen en SharePoint). Salida: `F2` por UO con el formato
`cantidad$importe`, más el listado de **lo que quedó afuera y por qué** (sin
código, sin legajo, no mapeable). El analista valida en pantalla antes de
descargar. Nada se completa por analogía (D-039): concepto sin mapeo se pide o
sale listado, nunca se inventa.

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
| 0 | N0b Parser Axton de Tabulado + totalizador + tests | detector D-065 (hecho) |
| 1 | N1 Generador de importador (piloto: SIASA y Merz) | N0a |
| 2 | N2 Novedades vs Liquidación (piloto: SIASA y Merz; volumen: POP) | N0a + N0b |

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
