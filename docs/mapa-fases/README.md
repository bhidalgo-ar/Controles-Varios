# Mapa de fases — qué destraba qué

Mockup interactivo para decidir por dónde seguir: los **42 controles** del catálogo maestro de payroll
(familias A–I, los mismos que están cargados en el tablero *Catálogo de Controles de Payroll* de monday)
y las **11 llaves** que los destraban. Tildás una llave y ves cuántos controles quedan al alcance.

Publicado en: https://claude.ai/code/artifact/cbbeb11a-53de-498b-8439-a976e124dd94

## Las tres pantallas

| Archivo | Qué muestra |
|---|---|
| `Main.dc.html` | El tablero: 11 llaves tildables a la izquierda, los 42 controles a la derecha, y el conteo en vivo. El número al lado de cada llave es lo que suma **con lo ya tildado**, así que cambia a medida que se avanza. |
| `Novedades.dc.html` | El caso de B1 (validador de novedades antes de importar): qué llave necesita de verdad, qué valida en cada estado, y los tres escalones. |
| `Orden.dc.html` | Un orden posible, con el acumulado escalón por escalón; el rendimiento suelto de cada llave; las 4 tandas del catálogo; y los tres controles del roadmap del repo que no entran en los 42. |

## De dónde salen los datos

- Los 42 controles, las familias y las tandas: `.claude/skills/relevamiento-controles/references/catalogo-controles.md`.
- El estado de cada uno (andando / a medio camino / trabado): la tabla "Mapeo contra el repo" de ese mismo
  catálogo, cruzada contra `js/controls/registry.js`, `ESTADO.md` y `ROADMAP.md`.
- Las llaves: los prerrequisitos del catálogo (A0, B0, E0), la pieza común T, la tabla de parámetros D7 y
  los "pendientes de definición" con su dueño.

**Las dependencias entre llave y control las armé yo donde el catálogo no las dice.** El catálogo declara
qué cruza contra qué, no siempre qué archivo hace falta. Los casos deducidos, para revisar: I1 e I2
colgados de A0 + T; C1 de D7 por el lado de la escala de convenio; A4 de A0 porque la jerarquía de fuentes
nombra al registro de altas y bajas. Si alguna está mal, cambia el conteo.

## Para editarlo

Los `.dc.html` y `canvas.json` son la fuente. La página publicada se arma con el helper de la skill
`design` y **no** se versiona (son 2 MB del editor, que se regeneran solos):

```
node "<base de la skill design>/seed-canvas.mjs" \
  --template "<base de la skill design>/payload.template.html" \
  --out mapa-de-fases-controles.html \
  --title "Mapa de Fases" \
  --artboard Main.dc.html --artboard Novedades.dc.html --artboard Orden.dc.html \
  --canvas canvas.json
```

y después se republica al mismo link. Si alguien editó el mockup desde el navegador y guardó, primero hay
que traerse esa versión (`--extract`) antes de volver a armarlo, o se pisan esos cambios.

Los colores, la tipografía y los espaciados salen de `css/tokens.css` (tema Intenso): barra ink de 54 px
con el borde celeste, cards sin hairline con `--sh-tool`, y los cuatro tonos del semáforo — `ok`, `warn`,
`celeste`, `neutral` — para los cuatro estados de un control.
