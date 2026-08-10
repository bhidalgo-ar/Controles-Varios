# Reporte de Variación de Conceptos Liquidados — OPmobility

**Cliente:** OPmobility C-Power Argentina S.A. (apodo interno del equipo: "Florida" / "Plastic Florida"),
código `POF` — **OPmobility es el nombre comercial nuevo del grupo Plastic Omnium**, no una empresa distinta.
El grupo tiene otra sede que el equipo trata como **cliente único e independiente**: Plastic Omnium /
OPmobility **Pilar** (código `POP`, Axton, control de Acreditaciones — `specs/control-acreditaciones-axton.md`).
Este documento es sólo sobre Florida (`POF`); no aplica a Pilar. Ver D-024 en `DECISIONS.md`.
En archivos, encabezados y configuración de este control se usa siempre **OPmobility**, que es el nombre que
trae el header del tabulado.

**Entregables (dos, y conviven a propósito):**

1. **Controles de la app** — `variaciones_sueldos` y `variaciones_conceptos` en el `CONTROL_REGISTRY`,
   scope de cliente `POF`, agrupados bajo "Variación entre períodos". Es el camino normal. **Se suben
   siempre los dos Tabulados** y el período y la quincena de cada uno salen del propio archivo.
   Ver D-023 y **D-035** (que corrige el reuso de la corrida anterior).
2. **HTML standalone** — `reportes/opmobility-variaciones.html`, se abre con doble click sin servidor.
   Sirve para correr el reporte fuera de la app (o sin el histórico del cliente cargado). Ver D-022.

Los dos aplican las mismas reglas de parseo y de comparación que se describen abajo.

**Origen:** documento base validado por Gaby y Guille (`Documento_Base_Claude_Code_OPmobility.docx`),
más dos tabulados reales de muestra (2ª quincena de marzo y de abril 2025) y los PDF de referencia del cliente.

---

## 1. Qué hace

Compara **tabulado contra tabulado** — el mismo tipo de archivo entre dos períodos, mes anterior vs mes actual —
y muestra la variación por empleado de determinados conceptos liquidados. No hay cruce contra otro sistema
(no interviene CONTA ni ningún otro reporte).

Dos reportes, cada uno en su propia pestaña:

| Reporte | Conceptos | Forma |
|---|---|---|
| **Variación Sueldos** | `899999` (jornales) + `1000` (mensuales) | Los dos conceptos **sumados en una sola columna**. Cada empleado liquida por uno de los dos; el que falte se toma como 0. |
| **Variación Conceptos** | `2517` (Premio de progreso) y `2519` (Premio productividad) | **Una sección por concepto**, cada una con su tabla y su total. La segunda arranca en página nueva del PDF. |

Columnas de salida (iguales en los dos reportes): `Legajo`, `Apellido y Nombre`, `[Período anterior]`,
`[Período actual]`, `Modificación`, `Variación $`, `Variación %`. Orden por legajo ascendente, con fila
`TOTAL GENERAL` al pie. `Modificación` es `S`/`N` según si esa fila tuvo variación — sale del PDF de
referencia del cliente y va también al Excel, al CSV y al PDF.

Las etiquetas de período llevan la quincena: **"2ª quincena de marzo 2025 vs 2ª quincena de abril 2025"**,
con el tipo de liquidación debajo en segundo plano. `periodToLabel` (`js/utils/dates.js`) no se toca — la
etiqueta con quincena se arma en el control.

Los códigos **1028 y 1029** que aparecen en documentos de referencia del cliente son de otro sistema de
liquidación y no se usan como identificador en la salida. Mapeo sólo de referencia interna: `2517`=1028, `2519`=1029.

## 2. Formato del archivo de entrada (Tabulado)

El archivo llega como `.xls` pero es **HTML disfrazado** (export del sistema de payroll). El parser:

- Lo decodifica como **Windows-1252** salvo que el contenido sea UTF-8 válido (el export no declara charset y trae acentos).
- Toma el período del texto del encabezado: `Periodo: MM/AAAA`. La quincena, de `Tipo: 2da Quincena …`,
  y el **tipo de liquidación completo** (`"2da Quincena c/ sobregiro"`) se conserva entero para mostrarlo.
  La empresa, de `EA: <razón social> | Usuario: …` — el nombre del reporte sale del propio archivo.
- Usa el código del `<th>` (`"1010 - Horas Normales"` → `1010`) como **precarga**, nunca por posición: la
  cantidad de columnas cambia entre meses según qué conceptos se liquidaron (83 en marzo 2025, 84 en abril).
  Qué columna es cada concepto lo **confirma el analista** en el Paso 2 (ver §5.1); el código sugiere.
- Valida que la fila de `<th>` tenga el ancho de las filas de datos. Si no, corta con un error: antes se
  aplanaban todos los `<th>` del archivo y una fila de encabezado desalineada corría los conceptos y
  sacaba el reporte con números mal **sin tirar ningún error**.
- Detecta el "cascarón" que genera Excel al guardar como *página web* (un `<frameset>` que apunta a una
  carpeta `.files` que no se sube) y corta con un error que lo explica.
- **También lee el Tabulado exportado como Excel real.** Si alguien abre el `.xls` y lo guarda desde Excel,
  el preámbulo pasa del `<span>` a celdas y los encabezados quedan en la fila 3. `tabuladoControl.js`
  detecta la fila de encabezados y saca `Periodo` / `Tipo` / `EA:` / `TOTAL GENERAL` también por ahí. En esa
  rama la fila `TOTAL GENERAL` **no** está corrida (Excel ya expandió el `colspan=3`): el desfasaje se
  informa en `totalRowOffset` (2 en HTML, 0 en Excel) en vez de repetirse como número mágico.
- Toma como fila de empleado la que tiene la **cantidad de celdas más frecuente** y un legajo numérico en la primera.
- La fila `TOTAL GENERAL` tiene `colspan=3` en su primera celda, así que sus índices están corridos 2 columnas.
  **No se usa para mapear columnas**, sólo para validar sumas: el total calculado de cada concepto se compara
  contra el del archivo y cualquier diferencia > 0,05 sale como aviso en pantalla.
- Un concepto que no se liquidó en el período **no es un error**: se computa 0,00 y se avisa en pantalla.

## 3. Salida

- **PDF A4 horizontal** (`@page { size: A4 landscape }`), `thead` repetido en cada página (`table-header-group`),
  sin cortar filas al medio, y salto de página forzado antes de cada sección a partir de la segunda.
- Encabezado del reporte: isotipo H&A, tipo de reporte, **empresa tomada del tabulado**, período comparado
  con quincena (`2ª quincena de marzo 2025 vs 2ª quincena de abril 2025`), tipo de liquidación en segundo
  plano, cantidad de empleados y fecha de emisión. El PDF de referencia del cliente usa otro encabezado
  (`Empresa: … / VARIACIÓN ENTRE LIQUIDACIONES POR EMPLEADO / rango de fechas`): de ahí se tomó la columna
  `Modificación`, pero **el encabezado queda el de la app** (confirmado con Guillermo el 2026-08-10).
- Acento `#00ACD4`, filas alternadas, variación positiva en verde, negativa en rojo, cero en gris.
- Cuando el período anterior es 0 el porcentaje no existe: se muestra **`s/base`**, no 100%.

## 4. Persistencia entre períodos

- Al generar un reporte, **los dos períodos quedan guardados** en `localStorage` (clave
  `opmobility_<reporte>_periodos`), así que el mes siguiente alcanza con subir el tabulado nuevo y elegir de la
  lista contra qué comparar. La configuración de conceptos y formato por reporte se guarda una sola vez
  (`opmobility_config_reportes`).
- **Export / import JSON** de los períodos guardados, para mover el histórico a otra máquina o navegador.
  El JSON contiene datos de empleados: al exportar se avisa que es información confidencial.
- Los períodos se pueden borrar de a uno o todos juntos.

## 5. En pantalla (no va al PDF)

- **Aviso de privacidad** antes de cualquier input: procesamiento 100% local, no compartir PII fuera de los
  canales autorizados por H&A.
- **Hero de diferencias** (patrón de §11.2 del `CLAUDE.md`): empleados con variación vs sin variación —
  un empleado cuenta como "con variación" si varió en al menos un concepto del reporte.
- Debajo, los dos períodos con su quincena y el tipo de liquidación en segundo plano.
- **Avisos del procesamiento:** conceptos no liquidados en un período, totales que no cierran contra la fila
  `TOTAL GENERAL` del tabulado, cambio de dotación entre períodos, archivos subidos en orden invertido,
  tipos de liquidación distintos entre los dos archivos, y mismo período sin quincena declarada.
- **Filtros y orden** en la solapa "Detalle": filtro "solo con variación / todos", filtro por sentido de la
  variación (suba / baja), y orden por cualquier columna clickeando el encabezado (los sin dato van siempre
  al final, en los dos sentidos). Más el buscador y la paginación que ya estaban.

### 5.1 Confirmación de conceptos (Paso 2)

El código de concepto es **precarga, no identificador**. En el Paso 2, con los dos Tabulados cargados, un
panel confirma qué columna es cada concepto **en cada archivo** (`js/ui/variacionesConceptMap.js`):

- Lo que se detectó en los dos archivos viene **resuelto y plegado** — ocho selectores con 84 opciones cada
  uno es exactamente lo que hay que evitar. Sólo se abre solo lo que necesita una decisión, y el wizard
  **no deja avanzar** hasta que esté: no hay default silencioso.
- **"No se liquidó en este período"** es una opción explícita: computa 0,00 y sale como aviso, pero como
  decisión del analista y no como silencio del parser.
- El selector es un `<input list>` + `<datalist>` nativo (escribís "premio" y filtra). `initSearchCombobox`
  de `tableTools.js` **no sirve** acá: filtra filas de una tabla, no es un picker de columnas.
- Si un código aparece en dos columnas (desambiguadas con sufijo `__2`), **las dos** aparecen como opciones.
- Los dos slots de carga van lado a lado, en 2 columnas, **siempre anterior → actual**. El panel "Catálogo
  de Conceptos (opcional)" no se muestra para estos controles: sirve para matchear por catálogo, y acá el
  mapeo es directo por archivo.
- Si el **nombre del archivo** sugiere un mes o una quincena distintos a los que declara su contenido, sale
  un aviso en ese slot. El período real sale siempre del contenido.

La lista de conceptos en sí (agregar/sacar columnas) sale de `controlConfigs` / `variaciones_config` del
cliente, sembrada con los códigos de siempre. **El editor para modificarla desde la pantalla queda para una
próxima fase** — ver `ROADMAP.md`.

## 6. Verificación manual hecha

Con los dos tabulados reales de muestra (2ª quincena marzo 2025 y 2ª quincena abril 2025, 71 empleados):

| Chequeo | Resultado |
|---|---|
| Totales de `899999`, `2517` y `2519` contra la fila `TOTAL GENERAL` del tabulado | Coinciden al centavo (400.005,10 / 3.579.550,20 / 21.199.585,40 en marzo; 400.005,10 / 3.080.990,00 / 18.033.950,33 en abril) — verificado por la validación automática, cero avisos |
| Columnas distintas entre meses (83 vs 84) | La precarga por código resuelve bien las dos |
| Concepto `1000` ausente en los dos tabulados | Se computa 0,00 y sale como aviso, sin romper |
| El tabulado de marzo llegando como `.xlsx` (guardado desde Excel) | Se detecta la fila de encabezados y se lee período, quincena, tipo, empresa y `TOTAL GENERAL` igual que en el HTML |
| "Cascarón" de Excel guardado como *página web* (sin la carpeta `.files`) | Corta con un error que explica qué archivo subir |
| Escalones de `2517` | 4 escalones detectados sobre datos reales |
| Acentos en nombres (`ACUÑA`, `MORENO JUAN JOSÉ`) | Correctos (decodificación Windows-1252) |
| Orden de carga invertido (anterior en el slot de actual) | Se ordena por período: el más viejo siempre queda a la izquierda |
| Impresión a PDF A4 horizontal, 2 secciones | Salto de página entre secciones, `thead` repetido |
| Lectura del tabulado por la app (`detectHeaders` + `parseTabuladoControl`) | 83/84 encabezados, 71 empleados, período, quincena, tipo de liquidación y empresa detectados del propio archivo |
| Nombre de archivo que no coincide con el contenido | Sale el aviso en ese slot; el período real sale del contenido |
| Auto-detección de columnas (`autoDetectTabMapping`) | Mapea `Legajo`, `Apellido y Nombre` y `CUIL` sin intervención del analista |
| Scope del control | POF ve los 2 controles nuevos; Marval y Plastic Omnium Pilar quedan igual |

## 7. Los dos períodos (en la app)

Se suben **siempre los dos Tabulados**: no se reusa el de una corrida anterior. El período y la quincena de
cada uno salen del encabezado del propio archivo, nunca del selector de período de la app.

El control los ordena por `(período, quincena)` y **el más viejo queda siempre a la izquierda del reporte**,
sin importar en qué slot lo subió el analista (si estaban invertidos, sale un aviso). Mismo período **y**
misma quincena → error, no se ejecuta. Mismo período con alguna quincena sin declarar → se compara igual,
en el orden en que se subieron, y se avisa.

**No hay regla automática de qué quincena compara contra cuál.** El analista sube los dos archivos que
quiere comparar y el encabezado del reporte muestra exactamente qué comparó. Volver a resolver el período
anterior desde IndexedDB está en `ROADMAP.md`, y depende de cerrar esa regla con el cliente.

## 8. Diferencias entre la app y el HTML standalone

| | App (controles) | HTML standalone |
|---|---|---|
| Período anterior | Se sube siempre; se ordena por fecha, no por slot | Se guarda en `localStorage`, con export/import JSON |
| Columna del concepto | La confirma el analista, por archivo | Match por código, fijo |
| Empleado sin el concepto en un período | `—` en pantalla (convención del proyecto), `0,00` en el PDF | `0,00` |
| Salidas | .xlsx, CSV, portapapeles y PDF | PDF |
| Requiere servidor | Sí (la app usa ES modules) | No |

## 9. Pendiente

Todo esto está anotado en `ROADMAP.md`:

- **Editor de conceptos y de causas de ausencia** desde la pantalla. El modelo de datos ya existe
  (`variaciones_config`), falta la UI para agregar/sacar columnas de la comparación.
- **Reuso de la corrida anterior** para subir un solo archivo por mes — requiere cerrar antes con el cliente
  qué quincena compara contra cuál, y que el histórico guarde la quincena y no sólo el mes.
- El documento base menciona una población de **mensuales que liquida por el código `1000`**. En los dos
  tabulados de muestra ese concepto no aparece (los 71 empleados liquidan por `899999`). La lógica está y se
  suma sola cuando el concepto exista; falta validarla contra un tabulado que efectivamente tenga mensuales.
- **Promoción a control de sistema** cuando haya un segundo cliente con el mismo reporte.
