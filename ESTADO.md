# ESTADO.md — dónde estamos hoy

> Un bloque por frente abierto. Se pisa, no se acumula: el que avanza se reescribe, el que cierra se saca.
> Creado por el documentalista (2026-08-18) a partir de `ROADMAP.md`, specs y los últimos commits — lo
> marcado con `?` es deducido y falta que Willy lo confirme.

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
