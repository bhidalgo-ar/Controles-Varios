# ESTADO.md — dónde estamos hoy

> Un bloque por frente abierto. Se pisa, no se acumula: el que avanza se reescribe, el que cierra se saca.
> Creado por el documentalista (2026-08-18) a partir de `ROADMAP.md`, specs y los últimos commits — lo
> marcado con `?` es deducido y falta que Willy lo confirme.

## Monto de diferencia — cerrado el 2026-08-19
- Qué es: el número que el analista escribe en el panel "Umbrales" ("de acá para abajo no me interesa"). Hasta hoy era un `$ 1,00` escrito a mano que ningún control leía.
- Punto: **hecho**. Se edita en el panel del wizard y en `#/admin`, se guarda por cliente (`clients.diffTolerance`), viaja en el seed, y lo leen los 19 controles desde `js/controls/tolerance.js`. Cada corrida guarda el monto con el que se midió, así que una corrida vieja no cambia de resultado sola. Un control nuevo lo hereda sin cablear nada. Verificado en navegador (claro y oscuro) y con 67 asserts nuevos + 2 e2e.
- Próximo paso: que Willy lo pruebe con un archivo real y confirme el monto que quiere dejar por cliente. Abierto a definir: si Cruce por Agrupadores —que hoy conserva su monto, su porcentaje y su marcado de faltantes en su propio panel— debería pasar a usar el monto del cliente cuando salga de `hidden`.
- Detalle: **D-069**, `tests/tolerance.test.js`, `tests/e2e/umbralDiferencia.spec.js`.

## Familia de Novedades (Axton) — N0a, N0b, N1 y N2 construidos, ninguno corrido contra un archivo real
- Qué es: el circuito planilla del cliente → planilla depurada → importador `F2_Consolidada` → liquidación, para los 7 clientes Axton. Dos controles: **N1** genera el importador desde la planilla del cliente (el analista valida en pantalla y descarga), **N2** lo cruza contra el Tabulado + Totales de Concepto, legajo por legajo y concepto por concepto. Dos cimientos: **N0a** lector de la familia ExpNov y **N0b** lector del Tabulado de Axton (extiende la pieza T). Los cuatro están hechos.
- Punto: el 2026-08-20 se relevó el formato real de julio 2026 en los 7 clientes (14 barridos de SharePoint, nada entró al repo) y Willy cerró las tres decisiones de diseño (D-070): la app genera el importador, el cruce compara cantidad e importe y lo no comparable informa sin bloquear, y las columnas sin código se listan siempre. B0 del catálogo quedó contestado: el template común de Axton es el propio importador.
- **N0a hecho** (mismo día): `js/parsers/expNovParser.js` lee la familia ExpNov por firma —la fila con "Legajo" y "Apellido y Nombres", los códigos pegados a ella— y devuelve una novedad por celda cargada (legajo crudo, código, cantidad, importe, unidad declarada), las columnas sin código con su rótulo, sus celdas cargadas y **su contenido** (`celdasSinCodigo`), la metadata de UO/empresa y los avisos (código duplicado, código no numérico, fila sin legajo, valor ilegible, hojas no leídas). El período no sale del archivo. 73 asserts en `tests/expNovParser.test.js`.
- **N0b hecho** (mismo día): `js/parsers/tabAxtonReader.js` lee el Tabulado de Axton de los 7 clientes, no de uno. Se ubica por la fila que dice "Legajo" —no por posición— y así se banca el preámbulo de 0, 1 o 2 filas, los conceptos con cantidad e importe (POP, Epiroc) o **sólo importe** (los otros cinco), el `TOTAL GENERAL` una vez o repetido arriba y abajo, las filas que el analista agrega a mano al pie (se cuentan y se avisan, no entran como datos) y los espacios duros de los encabezados. Emite **una fila por liquidación** —un legajo aparece hasta 3 veces— para que el cruce las sume, y eso está escrito como test. Una cantidad que el archivo no trae queda como hueco declarado, nunca como cero, y el control que la necesite sale INCIERTO (D-065). Valida las sumas contra el `TOTAL GENERAL` del propio archivo y avisa lo que no cierra, con los dos números. Además `readTotalesConcepto` lee el "Totales de Concepto" como fuente complementaria, porque el Tabulado no muestra todos los conceptos liquidados, y el campo `Reporte:` entró al detector con el cuarto formato `axton_tot`: subir el totalizador en el casillero del Tabulado ahora corta explicando qué archivo es. 83 asserts en `tests/tabAxtonReader.test.js`, en la cadena. **Ningún control existente cambia y todavía no hay pantalla.**
- **N1 hecho** (mismo día): control `novedades_importador` (20º del registry), scope sistema Axton, variante "Generar Reporte". Arma el `F2_Consolidada` con el formato `cantidad$importe`, consolidando por legajo, y **antes de descargar muestra qué entra —legajos, conceptos, totales— y qué quedó afuera con su motivo**. Las columnas que sólo traen nombre en criollo se resuelven en el Paso 2 (el catálogo del cliente sugiere, el analista confirma; el mapeo se guarda por rótulo, no por letra de columna). Casillero opcional para el importador ya armado: compara por legajo+código en cuatro bandas, y ahí sale el legajo que está en la planilla y no llegó al importador. 72 asserts + 6 e2e en los tres temas, con datos inventados.
- **N2 hecho** (2026-08-20): control `novedades_liquidacion` (21º del registry), scope sistema Axton, grupo propio, modo "Controlar". Cruza el importador (idealmente el que generó y validó N1) contra el Tabulado de Axton (lector tolerante, D-072) y el reporte Totales de Concepto, los tres como archivos adicionales —el Tabulado **no** entra por el casillero estándar porque ése cablea el lector de Meta4—, consolidando los tres lados por legajo con la misma clave. Por legajo+concepto compara cantidad e importe en cuatro bandas: coincide, difiere, no comparable (informado, con su motivo) y sin contraparte, donde el reporte Totales de Concepto es lo que distingue "no se liquidó" de "el Tabulado no lo muestra en columna propia". Config nueva por cliente con dos listas de conceptos (otra unidad / no llega a la liquidación). Unidad del semáforo: legajo; el legajo del que no se pudo comparar nada también cuenta para revisar, no se lee como aprobado (D-073). 91 asserts + 9 e2e, datos inventados.
- **Lo que falta verificar contra archivos reales, en los dos controles** (D-064, no se generaliza sin la confirmación de Willy): de **N1**, el layout del F2 generado (se dedujo del relevamiento de SIASA y Merz) y un caso completo de SIASA 07/2026; de **N2**, directamente **no vio ningún archivo real todavía** — hace falta un importador + un Tabulado + un Totales de Concepto reales del mismo período de una UO de SIASA 07/2026, y con eso armar un caso completo de un legajo antes de generalizar. El entorno remoto no llega al CDN (Dexie/SheetJS), así que las dos pantallas se verificaron con fixture en navegador real, no con un archivo de cliente.
- Próximo paso: conseguir de Willy el importador + Tabulado + Totales de Concepto reales de una UO de SIASA 07/2026 (mismo período) para cerrar el primer caso completo de N2, y de paso la planilla y el F2 real que sigue faltando para N1. Sigue como deuda que `tabAxtonParser.js` —el lector estricto de Tabulado que hoy usa Variaciones de POP— pase a delegar en `tabAxtonReader.js`, en un PR aparte. También: abrir en el navegador las planillas bloqueadas por etiqueta de confidencialidad (Epiroc, Red Bull, POP templates); y preguntar a la analista de SIASA por el legajo que quedó fuera del importador en Aguas y Gaseosas.
- Detalle: `specs/familia-novedades-axton.md`, D-070, D-071 (N1), D-072 (N0b), **D-073** (N2).

## Contabilidad Desglosada + Asiento (COTY) — construido, falta abrir los Excel
- Qué es: el control `conta_desglosada` convierte el "Totales de Concepto" de Axton en la desglosada DEBE/HABER, el asiento agrupado por cuenta y la desglosada con código, y controla que cierre.
- Punto: implementado y verificado el 2026-08-19 contra los dos archivos reales de COTY de 05/2026 — reproduce exactas las cinco anclas del prototipo (balance bruto 1.441.239.270,46, neteado 1.359.204.242,38, 273 filas, 12 cuentas patrimoniales, 0 sin código). La pantalla se probó en navegador en los tres temas.
- Próximo paso: dos cosas que sólo Willy puede cerrar — (1) abrir los tres `.xlsx` descargados de la app y compararlos con los del prototipo (la descarga no se pudo ejercitar en el entorno de desarrollo: ExcelJS viene por CDN y está bloqueado); (2) confirmar si la Contabilidad Desglosada sale del estudio, porque hoy lleva legajo y fecha de ingreso como papel de trabajo del analista.
- Detalle: `specs/conta-desglosada-asiento.md`, D-066.

## Control de Netos (Sportline) — verificado contra los 3 Tabulados reales de Comercio, 17 legajos sin cerrar
- Qué es: rearma el recibo teórico de cada legajo desde el Tabulado (sueldo + AFA, antigüedad, presentismo, acuerdo no remunerativo, retenciones) y verifica que el neto liquidado coincida una vez descontados los conceptos del mes. Reemplaza el control manual en Excel de Meli.
- Punto: corrido el 2026-08-20 contra los tres Tabulados reales de Comercio de 05/2026 (IFSA, RELEF, FGSA; Intelicar es Camioneros y queda afuera) y la planilla de armado manual de Willy. Con cuatro cambios de criterio —alícuotas por legajo desde el Tabulado, `1684-ANTIC_INCENTIVO` sin aporte, el acuerdo es del convenio (config nueva `convenio`) y los directores sin aportes (config nueva `puestosSinAportes`)— las diferencias sin explicar bajaron de 206 a **3** sobre 619 legajos, y los 37 legajos de la planilla manual cierran todos dentro de la tolerancia de $100. Ver **D-074**.
- Próximo paso: que Willy defina el criterio de los 3 legajos que siguen sin cerrar (uno de fuera de convenio y dos de Comercio, a los que la liquidación les retuvo sólo jubilación y ninguna columna del archivo los distingue — el perfil coincide con el de un jubilado que sigue trabajando, pero es una lectura, no una regla confirmada). Además: el acuerdo no remunerativo variable por categoría (el cuarto punto que Willy pidió el 2026-08-19) sigue sin tocar; el KPI "Legajos cruzados" del hero cuenta sólo el Tabulado principal (380) mientras la tarjeta del control informa 619 (identificado, sin arreglar); y el **calculador de AFA** pendiente (comparte la fórmula pero corre antes de liquidar, sobre el Tabulado de prueba).
- Detalle: `specs/spec-control-netos.md`, D-067, D-068, **D-074**.

## Lector de Tabulado (pieza T) — detector + lector robusto del lado Axton
- Qué es: reconocer si un Tabulado es Meta4 horizontal, Axton completo o Axton sólo-Imp por la firma del archivo (hoja, preámbulo, subencabezados), nunca por el cliente ni por posición de columna — y después leerlo.
- Punto: detector construido y testeado el 2026-08-18 (`js/parsers/tabFormatDetector.js`); el 2026-08-20 se le sumó el campo `Reporte:` del preámbulo y el cuarto formato `axton_tot` (el reporte "Totales de Concepto", que arranca igual que un Tabulado y no es uno), y se construyó el **lector robusto del lado Axton** (`js/parsers/tabAxtonReader.js`, cimiento N0b de la familia de Novedades). **Ningún control llama a ninguna de las dos piezas todavía.** Del lado Meta4 el lector robusto no existe: hoy lo lee `tabuladoControl.js` como siempre, y no hay evidencia todavía de que haga falta.
- Próximo paso: cablear el detector en los controles que reciben Tabulado (A1, B2, C1–C4, G1–G6, H2, I1) y sumar a la pantalla de resultados el aviso de qué columnas entraron y salieron. Y que `tabAxtonParser.js` —el lector estricto de Variaciones de POP— pase a delegar en `tabAxtonReader.js`, con la verificación de que el control sigue dando lo mismo: hasta entonces conviven dos lecturas del mismo formato, y cualquier firma nueva se agrega al lector, no al estricto.
- Detalle: `specs/lector-tabulado-formatos.md`, D-065, **D-072**.

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
