# Spec — Pieza T: Lector de Tabulado, detección de formato

> Estado: detector de formato construido y testeado (2026-08-18, `js/parsers/tabFormatDetector.js` +
> `tests/tabFormatDetector.test.js`). Ningún control lo consume todavía — es la pieza base del lote 2;
> falta cablearlo control por control y sumar el aviso de columnas a la pantalla de resultados.

Complementa la "Pieza común T — Lector de tabulado" descripta en
`.claude/skills/relevamiento-controles/references/catalogo-controles.md` (consumida, cuando se cablee,
por A1, B2, C1–C4, G1–G6, H2, I1 — no tiene pantalla propia).

Criterio capturado con Willy el 18/08/2026, entrevista de captura registrada en el ítem "T — Lector de
tabulado" del tablero monday *Catálogo de Controles de Payroll* (board `18426712423`).

---

## Los tres formatos en alcance

El formato se detecta por la **firma del archivo**, nunca por el cliente: un cliente puede migrar de
sistema de liquidación de un período a otro.

| Formato | Sistema | Clientes hoy | Firma |
|---|---|---|---|
| `meta4_h` | Meta4 horizontal | Finadiet, POF | Hoja `tabulado_h`; encabezados en la fila 1; conceptos con el código pegado al nombre (`1003-SUELDO`); totales al final sin etiqueta; no liquidado = `0` explícito |
| `axton` | Axton completo | Epiroc, POP | Hoja `Liquidaciones.AAAAMMDD.HHMMSS.n`; par de columnas Cant/Imp por concepto; `TOTAL GENERAL` literal al cierre; conceptos `1000 - Sueldo Basico` (con espacios); no liquidado = celda vacía |
| `axton_imp` | Axton reducido a sólo importes | SIASA | Misma hoja Axton; subencabezado sólo `Imp`, sin ningún `Cant`; preámbulo `EA: … \| Reporte: … \| Periodo: …` en la fila 1; `TOTAL GENERAL` duplicado arriba y abajo. Posiblemente retocado a mano antes de enviarse — se acepta igual |

**Fuera de alcance, sin relevar:** el Tabulado Vertical de Toyota/TASA. No se descartó por incompatibilidad,
simplemente no se relevó todavía.

**El comentario de "OPmobility" que documentan hoy `tabuladoControl.js` y `tabuladoHtml.js` describe el
export que POF mandaba en 2025 (familia `EA:`, HTML disfrazado de Excel).** Hoy POF manda `tabulado_h` de
Meta4. Es historia del archivo, no un error del comentario — si se cita, aclarar la fecha; no "corregirlo"
borrándolo.

---

## Unidades: el lector no convierte

**Decisión de Willy (opción 1, D-065).** El lector entrega las cantidades tal como vienen en el archivo,
con su código de concepto — no convierte horas a días ni jornalizados a mensualizados. La conversión, cuando
hace falta, es responsabilidad del control que consume esos datos (jornada por convenio → tabla de
parámetros D7). Si un cruce mezcla unidades sin convertir, avisa.

Corrige lo que documentaba la versión 1.0 del catálogo maestro
(`.claude/skills/relevamiento-controles/references/catalogo-controles.md`, "Normaliza unidades (horas
jornalizados / días mensualizados)"): esa normalización **no** la hace la Pieza T.

---

## Cantidades ausentes (variante `axton_imp`)

Cuando el export sólo trae importes (sin columna `Cant`), el lector avisa y pide re-subir el export con
cantidades. Si el analista sigue sin conseguirlas, la cantidad queda "no visible" — **nunca se completa por
inferencia** — y el control que la necesitaba sale **INCIERTO**, no aprobado.

---

## Qué verificó el criterio

Firmas confirmadas contra 6 archivos reales de 4 clientes (período 07/2026), que no entran al repo:

- En Meta4 `tabulado_h` el no-liquidado viene con `0` explícito: no se puede distinguir "no liquidado" de
  "liquidado en cero" desde el archivo. En Axton viene celda vacía y sí se puede distinguir.
- Fila por liquidación en los dos sistemas (legajos con hasta 5 pagas en el mismo período).
- El CBU puede venir tipado como float — hay que leerlo como texto.
- Los códigos de concepto no vienen ordenados en el archivo.
- En SIASA conviven los códigos `999` y `1000`, ambos rotulados "Sueldo Basico" — por eso los conceptos se
  matchean siempre por código, jamás por nombre.
- `TOTAL BRUTO` / `TOTAL_DESCUENTO` / `NETO` (Meta4) y `TOTAL -` / `LSD` / `liquidacion` (Axton) no son
  conceptos: no hay que tratarlos como si lo fueran.

---

## Lo construido en este lote

- `js/parsers/tabFormatDetector.js`: `sniffContainer` (zip/ole2/html/desconocido por los primeros bytes),
  `classifyTabulado` (clasifica por hoja + primeras filas, sin depender de `XLSX`), `detectTabFormat`
  (abre el archivo y clasifica; corta con error legible si no reconoce el formato, si viene cifrado con
  contraseña, o si es HTML sin el preámbulo `EA:`), `compareLayouts` (qué columnas entraron/salieron entre
  dos Tabulados — aviso, no error).
- `js/parsers/tabuladoControl.js`: alias de columna `ID_EMPLEADO` (legajo) y `APPELIDO Y NOMBRE` (el typo
  literal del export Meta4 de Finadiet y POF) en la auto-detección del Paso 2.
- `tests/tabFormatDetector.test.js`, sumado a la cadena de `npm run test:unit` en `package.json`.

## Qué queda para adelante

- Que los controles consumidores (A1, B2, C1–C4, G1–G6, H2, I1) llamen a `detectTabFormat` al recibir un
  Tabulado, en vez de asumir el layout.
- El aviso de `compareLayouts` (columnas entraron/salieron) todavía no tiene lugar en la pantalla de
  resultados — hoy es una función sin caller de UI.
- El Tabulado Vertical de Toyota/TASA, cuando se releve.
