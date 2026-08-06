# Reporte de Variación de Conceptos Liquidados — OPmobility

**Cliente:** OPmobility C-Power Argentina S.A. (apodo interno del equipo: "Florida" / "Plastic Florida").
En archivos, encabezados y configuración se usa siempre **OPmobility**, que es el nombre que trae el header del tabulado.

**Entregables (dos, y conviven a propósito):**

1. **Controles de la app** — `variaciones_sueldos` y `variaciones_conceptos` en el `CONTROL_REGISTRY`,
   scope de cliente `POF`, agrupados bajo "Variación entre períodos". Es el camino normal: reusa el
   Tabulado que ya se cargó en la corrida del mes anterior, así que se sube un solo archivo por mes.
   Ver D-023.
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

Columnas de salida (iguales en los dos reportes): `Legajo`, `Apellido y Nombre`, `[Mes anterior]`,
`[Mes actual]`, `Variación $`, `Variación %`. Orden por legajo ascendente, con fila `TOTAL GENERAL` al pie.

Los códigos **1028 y 1029** que aparecen en documentos de referencia del cliente son de otro sistema de
liquidación y no se usan como identificador en la salida. Mapeo sólo de referencia interna: `2517`=1028, `2519`=1029.

## 2. Formato del archivo de entrada (Tabulado)

El archivo llega como `.xls` pero es **HTML disfrazado** (export del sistema de payroll). El parser:

- Lo decodifica como **Windows-1252** salvo que el contenido sea UTF-8 válido (el export no declara charset y trae acentos).
- Toma el período del texto del encabezado: `Periodo: MM/AAAA`. La quincena, de `Tipo: 2da Quincena …`.
  La empresa, de `EA: <razón social> | Usuario: …` — el nombre del reporte sale del propio archivo.
- Matchea cada concepto **por el código del `<th>`** (`"1010 - Horas Normales"` → `1010`), nunca por posición:
  la cantidad de columnas cambia entre meses según qué conceptos se liquidaron (83 en marzo 2025, 84 en abril).
- Toma como fila de empleado la que tiene la **cantidad de celdas más frecuente** y un legajo numérico en la primera.
- La fila `TOTAL GENERAL` tiene `colspan=3` en su primera celda, así que sus índices están corridos 2 columnas.
  **No se usa para mapear columnas**, sólo para validar sumas: el total calculado de cada concepto se compara
  contra el del archivo y cualquier diferencia > 0,05 sale como aviso en pantalla.
- Un concepto que no se liquidó en el período **no es un error**: se computa 0,00 y se avisa en pantalla.

## 3. Salida

- **PDF A4 horizontal** (`@page { size: A4 landscape }`), `thead` repetido en cada página (`table-header-group`),
  sin cortar filas al medio, y salto de página forzado antes de cada sección a partir de la segunda.
- Encabezado del reporte: isotipo H&A, tipo de reporte, empresa tomada del tabulado, período comparado
  (`Marzo 2025 vs Abril 2025`), liquidaciones comparadas, cantidad de empleados y fecha de emisión.
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
- Tira de contexto con los dos períodos, la dotación y el total de variación de cada concepto.
- **Avisos del procesamiento:** conceptos no liquidados en un período, totales que no cierran contra la fila
  `TOTAL GENERAL` del tabulado, y cambio de dotación entre períodos.
- Toggle opcional **"ocultar empleados sin valores en ninguno de los dos períodos"** (§11.1 del `CLAUDE.md`).
  Va apagado por defecto: el documento base pide que los empleados sin dato en un mes se muestren en 0,00.

## 6. Verificación manual hecha

Con los dos tabulados reales de muestra (2ª quincena marzo 2025 y 2ª quincena abril 2025, 71 empleados):

| Chequeo | Resultado |
|---|---|
| Totales de `899999`, `2517` y `2519` contra la fila `TOTAL GENERAL` del tabulado | Coinciden al centavo (400.005,10 / 3.579.550,20 / 21.199.585,40 en marzo; 3.080.990,00 / 18.033.950,33 en abril) |
| Columnas distintas entre meses (83 vs 84) | El match por código resuelve bien las dos |
| Concepto `1000` ausente en los dos tabulados | Se computa 0,00 y sale como aviso, sin romper |
| Segunda corrida subiendo sólo el tabulado actual contra el período guardado | Genera el reporte igual |
| Acentos en nombres (`ACUÑA`, `MORENO JUAN JOSÉ`) | Correctos (decodificación Windows-1252) |
| Orden de carga invertido (anterior en el slot de actual) | Se ordena por período: el más viejo siempre queda a la izquierda |
| Impresión a PDF A4 horizontal, 2 secciones | Salto de página entre secciones, `thead` repetido |
| Lectura del tabulado por la app (`detectHeaders` + `parseTabuladoControl` en el navegador) | 83 encabezados, 71 empleados, período y quincena detectados del propio archivo |
| Auto-detección de columnas (`autoDetectTabMapping`) | Mapea `Legajo`, `Apellido y Nombre` y `CUIL` sin intervención del analista |
| Scope del control | POF ve los 2 controles nuevos; Marval y Plastic Omnium Pilar quedan igual |

## 7. Cómo se resuelve el período anterior (en la app)

Antes de ejecutar, el wizard busca el Tabulado de la corrida del mes anterior del mismo cliente
(`getRunFileFromPeriod` sobre `controlRunFiles`, que ya guardaba las filas parseadas por período) y lo
pasa al control por `mapping.variacionesPrev`. Si ese mes no se corrió, el control pide el archivo como
adicional **opcional** (`tab_prev_file`) y, si tampoco está, devuelve un error que explica las dos salidas.
El archivo subido tiene prioridad sobre el guardado.

En la pantalla de resultados se avisa de dónde salió el período anterior.

## 8. Diferencias entre la app y el HTML standalone

| | App (controles) | HTML standalone |
|---|---|---|
| Período anterior | Se reusa de la corrida del mes anterior; se pide solo si falta | Se guarda en `localStorage`, con export/import JSON |
| Empleado sin el concepto en un período | `—` en pantalla (convención del proyecto), `0,00` en el PDF | `0,00` |
| Salidas | .xlsx, CSV, portapapeles y PDF | PDF |
| Requiere servidor | Sí (la app usa ES modules) | No |

## 9. Pendiente

- El documento base menciona una población de **mensuales que liquida por el código `1000`**. En los dos
  tabulados de muestra ese concepto no aparece (los 71 empleados liquidan por `899999`). La lógica está y se
  suma sola cuando el concepto exista; falta validarla contra un tabulado que efectivamente tenga mensuales.
