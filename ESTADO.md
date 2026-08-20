# ESTADO.md — dónde estamos hoy

> Un bloque por frente abierto. Se pisa, no se acumula: el que avanza se reescribe, el que cierra se saca.
> Creado por el documentalista (2026-08-18) a partir de `ROADMAP.md`, specs y los últimos commits — lo
> marcado con `?` es deducido y falta que Willy lo confirme.

## Monto de diferencia — cerrado el 2026-08-19
- Qué es: el número que el analista escribe en el panel "Umbrales" ("de acá para abajo no me interesa"). Hasta hoy era un `$ 1,00` escrito a mano que ningún control leía.
- Punto: **hecho**. Se edita en el panel del wizard y en `#/admin`, se guarda por cliente (`clients.diffTolerance`), viaja en el seed, y lo leen los 19 controles desde `js/controls/tolerance.js`. Cada corrida guarda el monto con el que se midió, así que una corrida vieja no cambia de resultado sola. Un control nuevo lo hereda sin cablear nada. Verificado en navegador (claro y oscuro) y con 67 asserts nuevos + 2 e2e.
- Próximo paso: que Willy lo pruebe con un archivo real y confirme el monto que quiere dejar por cliente. Abierto a definir: si Cruce por Agrupadores —que hoy conserva su monto, su porcentaje y su marcado de faltantes en su propio panel— debería pasar a usar el monto del cliente cuando salga de `hidden`.
- Detalle: **D-069**, `tests/tolerance.test.js`, `tests/e2e/umbralDiferencia.spec.js`.

## Familia de Novedades (Axton) — N0a y N1 construidos, faltan N0b y N2
- Qué es: el circuito planilla del cliente → planilla depurada → importador `F2_Consolidada` → liquidación, para los 7 clientes Axton. Dos controles: **N1** genera el importador desde la planilla del cliente (el analista valida en pantalla y descarga), **N2** cruza el importador contra el Tabulado + Totales de Concepto. Dos cimientos: **N0a** lector de la familia ExpNov (hecho) y **N0b** parser Axton del Tabulado (extiende la pieza T, sin arrancar).
- Punto: el 2026-08-20 se relevó el formato real de julio 2026 en los 7 clientes (14 barridos de SharePoint, nada entró al repo) y Willy cerró las tres decisiones de diseño (D-070): la app genera el importador, el cruce compara cantidad e importe y lo no comparable informa sin bloquear, y las columnas sin código se listan siempre. B0 del catálogo quedó contestado: el template común de Axton es el propio importador.
- **N0a hecho** (mismo día): `js/parsers/expNovParser.js` lee la familia ExpNov por firma —la fila con "Legajo" y "Apellido y Nombres", los códigos pegados a ella— y devuelve una novedad por celda cargada (legajo crudo, código, cantidad, importe, unidad declarada), las columnas sin código con su rótulo, sus celdas cargadas y **su contenido** (`celdasSinCodigo`), la metadata de UO/empresa y los avisos (código duplicado, código no numérico, fila sin legajo, valor ilegible, hojas no leídas). El período no sale del archivo. 73 asserts en `tests/expNovParser.test.js`.
- **N1 hecho** (mismo día): control `novedades_importador` (20º del registry), scope sistema Axton, variante "Generar Reporte". Arma el `F2_Consolidada` con el formato `cantidad$importe`, consolidando por legajo, y **antes de descargar muestra qué entra —legajos, conceptos, totales— y qué quedó afuera con su motivo**. Las columnas que sólo traen nombre en criollo se resuelven en el Paso 2 (el catálogo del cliente sugiere, el analista confirma; el mapeo se guarda por rótulo, no por letra de columna). Casillero opcional para el importador ya armado: compara por legajo+código en cuatro bandas, y ahí sale el legajo que está en la planilla y no llegó al importador. 72 asserts + 6 e2e en los tres temas, con datos inventados.
- **Lo que N1 tiene pendiente de verificar contra archivos reales** (D-064, no se generaliza sin la confirmación de Willy): (1) el **layout del F2 generado** —fila 1 unidad organizativa, fila 2 los códigos con `Legajo`/`Apellido y Nombres`, datos desde la 3, sin fila de criollo— se dedujo del relevamiento de los F2 de SIASA y Merz y hay que compararlo contra uno real, si no Axton puede rechazar el archivo; (2) **un caso completo de SIASA 07/2026** —un legajo, desde la planilla modificada hasta el F2 real, con la descomposición de cualquier diferencia—; (3) que el lector reconozca la planilla real (los del relevamiento no entraron al repo). El entorno remoto no llega al CDN (Dexie/SheetJS), así que la app no se pudo abrir: la pantalla se verificó con fixture en navegador real, no con un archivo de cliente.
- Próximo paso: los dos chats que faltan — N0b (paralelizable) y N2 (depende de N0a + N0b + N1) — con los prompts, modelo y esfuerzo en `docs/prompts-familia-novedades.md`. De Willy: una planilla y su F2 real de una UO de SIASA 07/2026 para cerrar la verificación de N1; abrir en el navegador las planillas bloqueadas por etiqueta de confidencialidad (Epiroc, Red Bull, POP templates); y preguntar a la analista de SIASA por el empleado que quedó fuera del importador en Aguas y Gaseosas.
- Detalle: `specs/familia-novedades-axton.md`, D-070.

## Contabilidad Desglosada + Asiento (COTY) — construido, falta abrir los Excel
- Qué es: el control `conta_desglosada` convierte el "Totales de Concepto" de Axton en la desglosada DEBE/HABER, el asiento agrupado por cuenta y la desglosada con código, y controla que cierre.
- Punto: implementado y verificado el 2026-08-19 contra los dos archivos reales de COTY de 05/2026 — reproduce exactas las cinco anclas del prototipo (balance bruto 1.441.239.270,46, neteado 1.359.204.242,38, 273 filas, 12 cuentas patrimoniales, 0 sin código). La pantalla se probó en navegador en los tres temas.
- Próximo paso: dos cosas que sólo Willy puede cerrar — (1) abrir los tres `.xlsx` descargados de la app y compararlos con los del prototipo (la descarga no se pudo ejercitar en el entorno de desarrollo: ExcelJS viene por CDN y está bloqueado); (2) confirmar si la Contabilidad Desglosada sale del estudio, porque hoy lleva legajo y fecha de ingreso como papel de trabajo del analista.
- Detalle: `specs/conta-desglosada-asiento.md`, D-066.

## Control de Netos (Sportline) — 3 de los 4 ajustes que pidió Willy en vivo, resueltos sin commitear
- Qué es: rearma el recibo teórico de cada legajo desde el Tabulado (sueldo + AFA, antigüedad, presentismo, acuerdo no remunerativo, retenciones) y verifica que el neto liquidado coincida una vez descontados los conceptos del mes. Reemplaza el control manual en Excel de Meli.
- Punto: Willy probó el PR #165 recién mergeado contra el archivo real de IFSA y reportó 4 problemas. Resueltos en el working tree de `claude/lote-3-controles-payroll-3kggma`, **sin commitear todavía**: rótulo de la tolerancia en pesos, columna Nombre, rótulo de Empresa configurable, y filtro de 4 categorías (que de paso corrigió que "N con diferencias" ignoraba la tolerancia configurada y usaba siempre $0,01). También salió, de un componente compartido, el fix de `.ctrl-detail-grid` que rompía el ancho de cualquier ficha con tabla ancha (D-068). Verificado en vivo con Playwright contra IFSA 05/2026: 0 con diferencias con tolerancia $100.
- **Cómo levantar la app acá:** el entorno remoto bloquea `unpkg.com` y `cdn.sheetjs.com` (Dexie y SheetJS de `index.html`) — se resuelve con `npm i --no-save dexie@4` apuntando esos `<script>` a `node_modules/`, parche local que no se commitea.
- Próximo paso: commitear y abrir PR con estos 3 arreglos. El cuarto punto de Willy —el acuerdo no remunerativo varía por categoría, a veces fijo + porcentaje— sigue **sin tocar**: falta que aclare el mecanismo exacto antes de cambiar `noRemuAcuerdo`. Además siguen abiertas la tolerancia de la comparación con el mes anterior, qué hacer con el legajo a −1,62 de redondeo, y el **calculador de AFA** pendiente (comparte la fórmula pero corre antes de liquidar, sobre el Tabulado de prueba).
- Detalle: `specs/spec-control-netos.md`, D-067, **D-068**.

## Lector de Tabulado — detector de formato (pieza T)
- Qué es: reconocer si un Tabulado es Meta4 horizontal, Axton completo o Axton sólo-Imp por la firma del archivo (hoja, preámbulo, subencabezados), nunca por el cliente ni por posición de columna.
- Punto: detector construido y testeado (`js/parsers/tabFormatDetector.js`, `tests/tabFormatDetector.test.js`, 2026-08-18); ningún control lo llama todavía.
- Próximo paso: cablear el detector en los controles que reciben Tabulado (A1, B2, C1–C4, G1–G6, H2, I1) y sumar a la pantalla de resultados el aviso de qué columnas entraron y salieron.
- Detalle: `specs/lector-tabulado-formatos.md`, D-065.

## Acumuladores Ganancias — SAC teórico de Epiroc
- Qué es: verificar `calcDoceava` contra la planilla manual de Epiroc (columna AG, "SAC TEORICO"), de a un caso.
- Punto: no reconcilia; hay tres preguntas de criterio sin contestar (¿entra `1101`?, ¿se resta `1137`?, ¿entra `1103` al juego base?).
- Próximo paso: que Willy conteste las tres — no se toca `calcDoceava` antes.
- Detalle: D-063, D-064.

## NR (Marval) — 8 conceptos sin semilla de código
- Qué es: 8 de los 18 conceptos de NR no tienen código confirmado porque no se liquidaron en el Tabulado de muestra.
- Punto: se piden a mano en el Paso 2, con el toggle ⊘ como salida; no se inventan por analogía.
- Próximo paso: conseguir un Tabulado de un mes con indemnizaciones liquidadas.
- Detalle: D-039.

## Auto-detección del Paso 2 — prioridad de palabras clave (?)
- Qué es: `autoDetectTabExtraConfig` recorre encabezados por fuera y palabras clave por dentro, así que gana el primer encabezado del archivo que contenga cualquiera de ellas.
- Punto: identificado el 2026-08-13, no arrancado — es la opción 3, pendiente, de "muestra y aviso de columna".
- Próximo paso: definir el orden correcto de prioridad entre palabras clave.
- Detalle: `specs/muestra-y-aviso-de-columna.md`, D-053.

## Asiento de Remuneraciones (FINADIET) — postergado
- Qué es: control 3.9 (asiento contable), construido y disponible para el cliente que ya lo tiene configurado.
- Punto: postergado el 2026-08-17 por relación esfuerzo/valor; el archivo de cierre real que hay en SharePoint no tiene el layout que pide `finadietAsientoParser.js`.
- Próximo paso: al retomar, definir cuál es el archivo de entrada real (no es el de cierre de SharePoint).
- Detalle: D-062.

## Deuda de proceso, sin urgencia (?)
- Qué es: `tests/rendVsAsientoDrill.test.js` fuera de la cadena de CI; relevar `controlConfigs` real de los 21 clientes fuera de Marval; pendientes de v1 (insights mes a mes, export Excel multi-hoja, export/import JSON de sesión).
- Punto: sin novedades desde el 2026-08-13.
- Próximo paso: fixtures anonimizados para el primer ítem; el resto espera prioridad de Willy.
- Detalle: `ROADMAP.md` § "Estado al 2026-08-13", ítem 6.
