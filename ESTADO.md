# ESTADO.md — dónde estamos hoy

> Un bloque por frente abierto. Se pisa, no se acumula: el que avanza se reescribe, el que cierra se saca.
> Creado por el documentalista (2026-08-18) a partir de `ROADMAP.md`, specs y los últimos commits — lo
> marcado con `?` es deducido y falta que Willy lo confirme.

## Familia de Novedades (Axton) — relevada y decidida, lista para construir
- Qué es: el circuito planilla del cliente → planilla depurada → importador `F2_Consolidada` → liquidación, para los 7 clientes Axton. Dos controles: **N1** genera el importador desde la planilla del cliente (el analista valida en pantalla y descarga), **N2** cruza el importador contra el Tabulado + Totales de Concepto. Dos cimientos antes: **N0a** lector de la familia ExpNov y **N0b** parser Axton del Tabulado (extiende la pieza T).
- Punto: el 2026-08-20 se relevó el formato real de julio 2026 en los 7 clientes (14 barridos de SharePoint, nada entró al repo) y Willy cerró las tres decisiones de diseño (D-069): la app genera el importador, el cruce compara cantidad e importe y lo no comparable informa sin bloquear, y las columnas sin código se listan siempre. B0 del catálogo quedó contestado: el template común de Axton es el propio importador. Ya hay un caso real esperando al control: SIASA Aguas y Gaseosas 07/2026, 12 empleados en la planilla del cliente y 11 en el importador.
- Próximo paso: construir en 4 chats, en orden — N0a, N0b (paralelizable con N1), N1, N2 — con los prompts, modelo y esfuerzo ya escritos en `docs/prompts-familia-novedades.md`. De Willy: abrir en el navegador las planillas bloqueadas por etiqueta de confidencialidad (Epiroc, Red Bull, POP templates) y preguntar a la analista de SIASA por el legajo 12→11.
- Detalle: `specs/familia-novedades-axton.md`, D-069.

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
