# Migración a los patrones nuevos de `resultBlocks.js` — control por control

> Contexto: rediseño transversal de resultados (cabecera 1C + agrupado de casos +
> severidad `minor` + fix de planilla). Ver handoff de Willy (2026-08-07) y
> `Resultados Acumuladores.dc.html` / `Cabecera de resultados - opciones.dc.html`.
> Esta pasada sólo toca `js/ui/resultBlocks.js` (infraestructura) +
> `js/controls/acumuladoresGanancias.js` (el control del mock). Este doc es la
> hoja de ruta para los otros 9 — no se tocan todavía.

## Qué cambia en `resultBlocks.js`

- `renderIssues()` agrupa por `who` (default) — si dos items comparten `who`,
  se funden en un bloque con una sola barra de severidad.
- Nuevo `sev: 'minor'` — sale del listado principal, va a un `<details>`
  "Observaciones menores" agrupado por texto de `what`.
- Filtro de Fichas por severidad (donde exista una vista de Fichas) con
  opciones derivadas de los issues presentes, no hardcodeadas.

Ningún control necesita tocarse para seguir funcionando: `groupBy: 'who'` con
items que ya tienen `who` únicos por fila (que es el caso de casi todos, ver
abajo) no cambia nada visualmente.

## Control por control

### `acumuladoresGanancias.js` — se toca en esta pasada
- Ya usa `sev: 'hi'|'lo'` por issue y puede traer **más de un issue por
  legajo** (ej. legajo 137 del mock: `sacNoCalculado` + `sinMovimiento`) →
  es el único control donde el agrupado por `who` cambia algo visible hoy.
- El issue de CUIL faltante (`type: 'cuil'`, hoy `sev: 'lo'`) pasa a
  `sev: 'minor'` — es calidad de dato del crudo, no una diferencia a revisar.
- Único control con vista de **Fichas** (Resumen/Fichas/Planilla vía
  `initTabs` directo, no `renderResumenDetalle`) → único candidato real al
  filtro de severidad en el desplegable de Fichas.

### `acreditaciones.js` — candidato para la próxima pasada
- `items` sale de `res.alerts` con **un row por alerta**, no por legajo → un
  legajo con 2 alertas (ej. neto negativo + lista sin match) hoy aparece 2
  veces separado. Es el segundo caso, después de Acumuladores, donde
  `groupBy: 'who'` va a fundir filas reales.
- No tiene tipos de alerta "menores" obvios todavía (`ALERT_LABEL`: revisar
  si algún tipo es candidato a `sev: 'minor'` cuando se migre).
- Sin vista de Fichas — el filtro de severidad no aplica.

### `agrupadores.js` — candidato para la próxima pasada
- `items` sale de `topDifferences`, un row por `(legajo, grouper)` → un
  legajo con diferencia en 2 agrupadores hoy aparece 2 veces. Mismo caso que
  Acreditaciones: agrupar por `who` va a fundir filas.
- No hay severidad "menor" evidente en este control (todo lo que entra en
  `topDifferences` es una diferencia real de importe).
- Sin vista de Fichas.

### `brutos.js`, `gsPers.js`, `nr.js` — ya colapsan por legajo, bajo impacto
- Cada uno ya arma **un row por legajo** (toma el peor concepto + "y N más"
  en `why`), así que `groupBy: 'who'` no cambia nada — ya están agrupados a
  mano con la misma lógica que el helper nuevo formaliza.
- Ya usan `sev: 'hi'|'lo'` (más de un concepto con diferencia = `hi`) — no
  hay un caso obvio de `sev: 'minor'` en estos tres; son diferencias de
  importe, no calidad de dato.
- Sin vista de Fichas.

### `rendVsTabu.js`, `rendXEe.js`, `rendVsAsiento.js` — mismo patrón, otra unidad
- Mismo caso que Brutos/GS Pers/NR pero por CC (`rendVsTabu`, `rendVsAsiento`)
  o por legajo (`rendXEe`): ya colapsan a un row por unidad. Bajo impacto.
- Sin candidatos a `minor` ni vista de Fichas.

### `catXEmpleados.js` — no aplica
- No usa `renderIssues` (sólo veredicto + tiles + tabla). Nada que migrar.

### `variaciones.js` — no usa `resultBlocks.js` todavía
- No aparece en el grep de controles que importan el módulo — sigue con su
  propio armado de bloques (deuda previa, no de este rediseño). Antes de
  tocarlo para adoptar `groupBy`/`sev` habría que migrarlo a `resultBlocks.js`
  primero, que es un cambio más grande y no entra en esta pasada.

## Resumen para decidir el orden de la próxima tanda

| Control | Filas se funden con `groupBy` | Candidato a `sev: 'minor'` | Vista Fichas |
|---|---|---|---|
| acumuladoresGanancias | ✅ (ya migrado) | ✅ (ya migrado — CUIL) | ✅ (ya migrado) |
| acreditaciones | ✅ probable | a revisar con Willy | ❌ |
| agrupadores | ✅ probable | ❌ | ❌ |
| brutos / gsPers / nr | ➖ ya colapsado | ❌ | ❌ |
| rendVsTabu / rendXEe / rendVsAsiento | ➖ ya colapsado | ❌ | ❌ |
| catXEmpleados | ➖ no usa renderIssues | ❌ | ❌ |
| variaciones | ⚠ no usa resultBlocks.js — migración previa pendiente | — | — |

Orden sugerido para la próxima pasada: **acreditaciones → agrupadores**
(los dos casos reales de fusión de filas), y dejar `variaciones.js` para
cuando se justifique una migración completa a `resultBlocks.js`.
