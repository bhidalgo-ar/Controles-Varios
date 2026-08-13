# Handoff — Rediseño de Controles Nómina (sistema "Sobrio")

Paquete para implementar el rediseño en el repo real con Claude Code.

- **Repo destino:** `bhidalgo-ar/Controles-Varios` (branch `main`)
- **Stack:** Vanilla JS con ES modules, sin framework ni build step. CSS en `css/tokens.css`, `css/base.css`, `css/components.css`. Render por `innerHTML` en módulos de `js/ui/`.
- **Diseño de referencia:** `Rediseño Fase 1.dc.html` (incluido en este bundle). Es un **prototipo HTML de referencia**, no código para copiar: hay que **recrear** estas pantallas dentro de los módulos existentes del repo, respetando sus patrones (módulos `js/ui/*.js` que renderizan con template strings + `esc()`, tokens CSS en `:root`).
- **Fidelidad:** alta (hi-fi). Colores, tipografía, espaciados y copys son finales salvo indicación.
- **Idioma de la UI:** español argentino, voseo. No inventar copys nuevos: usar los del prototipo.

## Cómo leer el prototipo

El archivo es un canvas con turnos numerados (el más nuevo arriba). Ids relevantes:

| Id | Contenido |
|---|---|
| `1a` | Las 3 pantallas base en tema **Sobrio (default elegido)** |
| `1b` | Las mismas en tema **Intenso** (segundo tema opcional) |
| `2a` | Selector de tema (reemplaza el toggle 🌙) |
| `3a/3b/3c` | Estados por pantalla: búsqueda, dropzones, popovers, semáforos, export |
| `4a/4b/4c` | Estados en pantallas completas + flujo de error de archivo |
| `5a/5b` | Paso 3 con progreso + popover "Detalles del run" |
| `6a/6b/6c` | Home de clientes, Detalle filtrado en diferencias, versiones Intenso |
| `7a/7b` | Pantallas densas de Rendimiento (vs Asiento / vs Tabulado) |
| Cards superiores del turno 1 | **Las 5 reglas del sistema** (leerlas antes de codear) |

## Las 5 reglas del sistema (obligatorias en toda pantalla)

1. **Zonas de layout.** Una sola barra superior sticky (54px) con identidad + contexto del cliente + acción primaria. El contenido scrollea solo (`overflow-y:auto` en su contenedor, nunca la página entera); panel lateral de contexto fijo de 300px con borde izquierdo; en tablas, `thead` sticky top y fila de totales sticky bottom. El botón de avance nunca queda fuera de vista.
2. **Jerarquía de acciones.** Una primaria por pantalla (pill celeste `#00ACD4`), siempre arriba a la derecha, mismo lugar en todas. Secundarias outline 2px celeste, terciarias ghost (`border:#DDE5EF; color:#8C837B`). Si la primaria no está lista: no desaparece — se atenúa (`background:#A9DFEE`) y un hint al lado dice qué falta ("Falta: 1 archivo · 1 columna"). Acciones raras se pliegan a menús ("Datos ▾" en el home).
3. **Ayuda contextual por campo.** Patrón fijo: nombre en criollo (12.5px/700 `#1E3A5F`) + código técnico en mono 10px `#8FA3BA` + badge de origen (`auto ✓` verde / `↺ sesión anterior` verde suave / `⚠ sin asignar` warn / `⊘ no viene` neutral) + muestra real "ej.: valor1 · valor2" (11px `#8FA3BA`, ya existe en `js/ui/columnHints.js`) + "?" popover con la explicación larga. Cuando el campo está pendiente, la explicación baja a texto visible bajo el select.
4. **Obligatorio arriba, opcional abajo.** Los archivos obligatorios abren la pantalla como dropzones grandes; lo opcional (Catálogo de Conceptos, CC x Empleado) es UN renglón dashed compacto al final con su default explícito ("Usando el estándar (22 conceptos)") y la acción como link.
5. **Textos que orientan.** "— Sin asignar —" → "Elegí la columna del Tabulado…"; "Escribí para buscar…" → "Buscá por legajo o nombre…"; "(opcional)" → default explícito. Todo texto de estado dice qué hacer o qué va a pasar. Estados vacíos siempre con salida (link para deshacer/limpiar).

## Design tokens

Ya existen casi todos en `css/tokens.css` (bloque "tools"). Usar esos nombres:

- Celeste `#00ACD4` (`--celeste`), hover `#0090B4`, profundo `#007896`, dim `rgba(0,172,212,.10)`
- Ink `#15263D` (`--ink`), texto `#1E3A5F` (`--t1`), secundario `#4A6080` (`--t2`), terciario `#8FA3BA` (`--t3`)
- Fondo de página `#F5F7F8`, superficies `#FFF`, hairlines `#E7E6E6` / `#EFEEEC`, bordes de input `#DDE5EF`
- Estados: ok `#22C55E` / texto `#177A50`; warn `#F59E0B` / `#9A5A0B`; error `#E85518` / `#C0420F`; patrón badge = bg dim + borde rgba + texto saturado
- Tipografía: **Plus Jakarta Sans** (operativa, ya cargada en `index.html`); **DM Serif Display** solo display y solo en tema Intenso. Números SIEMPRE `font-variant-numeric:tabular-nums`.
- Radios: inputs 8px, cards 12px (14px Intenso), botones/chips/badges `9999px` (pill siempre)
- Transición estándar: `all .22s cubic-bezier(.4,0,.2,1)`, sin bounces. Hover de cards: borde celeste + sombra + `translateY(-1px)`.
- Section label: 10px/700 uppercase `letter-spacing:.09em` color celeste.
- Sombra de popover: `0 12px 32px rgba(30,58,95,.16)`.

## Temas

- **Sobrio = default.** Barra blanca con `border-bottom:2px solid #00ACD4`, cards con hairline, sombras mínimas.
- **Intenso = segundo tema.** Misma estructura exacta; cambian tokens de superficie: barra `#15263D` con borde 3px celeste, cards sin borde con sombra `0 6px 24px rgba(30,58,95,.09)`, títulos y KPIs en DM Serif Display, thead/totales de tabla navy.
- El toggle 🌙 actual se reemplaza por el **selector de tema** (`2a`): menú con Sobrio ✓ / Intenso / Oscuro (deshabilitado "Próximamente"). Persistir en `localStorage` (clave `theme` actual: migrar a `sobrio|intenso`, mantener detección en el primer `<script>` del head para evitar flash). Implementar como `[data-theme="intenso"]` remapeando variables en `tokens.css`.

## Pantallas (referencia → archivos del repo)

Para cada una: recrear layout y estados del prototipo. El footer institucional **se elimina** de la app (decisión tomada). Viewport de referencia: 1366×768.

1. **Shell / barra superior** (todas) — `index.html`, `css/base.css`, `js/main.js`. Barra única 54px: iso 30px + pill "Controles Nómina" + divider + botón volver ghost + "Cliente · Período" + stepper compacto (solo en wizard) + hint de estado + primaria + selector de tema. Reemplaza a `app-header` 68px + `page-actions` + `wizard-steps` sueltos.
2. **Home de clientes** (`6a`) — `js/ui/clientsList.js`. Selector de mes pill en la barra; "Importar cartera / Respaldo / Restaurar" dentro de "Datos ▾"; "+ Nuevo cliente" secundaria; tabla con head sticky (border-bottom 2px `#15263D`), semáforo + label, mini-dots, última corrida, acciones por fila (▶ Ejecutar pill celeste sm, Resultados ghost — disabled si no hay corridas —, ⋯ menú). Link "N clientes ocultos" abajo.
3. **Paso 1 — Controles** (`1a` primera pantalla, estados en `3a`/`4a`) — `js/ui/controlsWizard.js`. Chips de filtro + búsqueda con match resaltado (`<mark>` celeste dim) y estado "sin resultados"/"ocultos" con salida; cards de control con checkbox, tag, descripción completa (sin truncar) y **badges de archivos requeridos/opcionales a la derecha (funcionalidad intocable)**; card seleccionada con borde celeste + tinte; panel lateral "Vas a ejecutar (n)" + "Archivos que te va a pedir" + "¿Qué hace cada control?" (reusar `helpPopover.js`).
4. **Paso 2 — Archivos y columnas** (`1a` segunda, estados `3b`, flujo error `4c`) — `js/ui/controlsWizard.js`, `js/ui/fileUpload.js`, `js/ui/fileTypes.js`, `js/ui/columnHints.js`. Dropzones grandes arriba (estados: vacío/drag-over/procesando/error de sigla con "Usarlo igual · Elegir otro"/cargado con nombre mono + filas); grid 2 col de campos con el patrón de ayuda (regla 3); contador "X de Y listas"; catálogo opcional como renglón final; panel lateral: control elegido + checklist "Para ejecutar te falta" + umbrales (vista previa). El aviso de archivo/columna **avisa, no traba** (D-036) y queda registrado en el run.
5. **Paso 3 — Ejecutar** (`5a`) — `js/ui/controlsWizard.js`. Barra general de progreso + card por control (terminado ✓ verde con duración / corriendo con spinner y % / en cola dashed); "Cancelar" única acción; panel con archivos usados, umbrales y avisos heredados; runbar final "Corrida completa en X s" con errores primero y "Ver resultados →" primaria.
6. **Resultados — Resumen** (`3c`, rojo en `4b`) — `js/ui/controlsResults.js`, `js/ui/resultsHeader.js`, `js/ui/resultBlocks.js`. Barra de contexto con **semáforo (intocable: verde 0% / amarillo ≤2% / rojo >2%)** + veredicto en una línea; tabs Resumen/Detalle; hero centrado (check/! + título + KPIs 30px/700 celeste, en rojo los negativos); card por control con dot + meta + "Ver detalle →" (control en rojo primero, borde error). Primaria = "⬇ Exportar ▾" (menú con Excel / JSON de sesión + recordatorio de privacidad).
7. **Resultados — Detalle** (`1a` tercera, filtrado en `6b`) — `js/ui/controlsResults.js`, `js/ui/tableTools.js`. Toolbar sticky: tabs + chips de filtro (si terminó con errores, "Con diferencias" arranca activo — regla "errores primero") + búsqueda + KPIs; tabla en card con scroll propio, thead sticky (grupos de columnas tintados: celeste dim / navy dim), Δ con badge (error para diferencias, warn "ausente en Tab"/"solo en Brutos"), **fila TOTAL sticky bottom** (border-top 2px `#15263D`; muestra el total de la selección filtrada).
8. **Detalles del run** (`5b`) — `js/ui/resultsHeader.js`. Popover: fecha, período (nota de Tabulado reusado), estado (⚡ Ejecución rápida / 📝 Borrador / ✅ Definitivo — comportamiento actual, no cambiar), **sección "N avisos de esta corrida"** (nuevo: los avisos de archivos/columnas viajan con el run), acciones Marcar definitivo / Reconfigurar / Ejecutar de nuevo.
9. **Rendimiento vs Asiento** (`7a`) — `js/ui/controlsWizard.js`, `js/ui/fileUpload.js`. Contabilidad Desglosada multi-archivo (chip "N archivos", "+ Sumar", nota de duplicados); "Clasificación por cuenta contable" en grid 3 col con patrón de ayuda: código mono en input, badge `✓ N filas` si matchea o `⚠ sin match` con texto "revisá el código o dejalo: las filas sin clasificar salen aparte"; "＋ Agregar clasificación…"; CC x Empleado como opcional final explicando qué se pierde sin él.
10. **Rendimiento vs Tabulado** (`7b`) — `js/ui/controlsWizard.js`, `js/ui/rendVsTabuConceptEditor.js`, `js/ui/tabuladoAnalysis.js`. "Análisis del Tabulado" como tira de una línea (✓ asignadas · ⚠ huérfanas · faltantes + "Ver las N ▾"); "Agrupación de conceptos": toolbar (segmented Sin ordenar/Por número/Alfabético, checkbox ocultar no encontrados, ↺ Restaurar defaults), buckets por grupo con chips `SIGNO código · nombre ✕`. **Funcionalidad intocable: cada concepto tiene signo + (suma) o − (resta) dentro del grupo; un clic en el signo lo invierte.** Leyenda: "+ suma · − resta · ⚠ no está en este Tabulado". Overflow con "+ N más…" expandible; "＋ Agregar del Tabulado…" como chip dashed.

## Interacciones y comportamiento

- Hover: botones primarios `background:#0090B4` + sombra celeste; cards elevación + borde celeste; filas de tabla tinte celeste 3%.
- Focus de inputs: `border-color:#00ACD4; box-shadow:0 0 0 3px rgba(0,172,212,.12)` (ya en el DS).
- Popovers: sombra `0 12px 32px rgba(30,58,95,.16)`, cierre por click afuera y Escape (reusar patrón de `helpPopover.js`).
- Toasts: fondo `#15263D`, texto blanco, check verde (multi-drop: "2 archivos reconocidos por su sigla").
- Dot del semáforo en la barra de resultados: pulso suave 2.4s (keyframe `dotpulse` del prototipo) solo en verde.
- Scroll: `body` sin scroll en pantallas de app; cada zona con `overflow-y:auto; min-height:0`.

## Orden sugerido de implementación (tareas para Claude Code)

Cada tarea = un prompt/PR chico y verificable. Correr `npm test` tras cada una.

1. **Tokens y tema:** sumar `[data-theme="intenso"]`/`sobrio` a `tokens.css`, migrar la clave `theme` de localStorage, selector de tema en el header (diseño `2a`). Eliminar footer institucional de `index.html`.
2. **Shell:** nueva barra superior única de 54px (diseño `1a`) con slots (volver, contexto, stepper, hint, primaria); adaptar `main.js`/`base.css`; body sin scroll + zonas con scroll propio.
3. **Home** (`6a`): mes en la barra, menú "Datos ▾", tabla con head sticky y jerarquía de acciones.
4. **Paso 1** (`1a`/`4a`): cards de control + panel lateral + búsqueda con estados.
5. **Paso 2 base** (`1a`/`3b`): dropzones con ciclo completo, patrón de ayuda por campo sobre `columnHints.js`, opcionales al final, checklist del panel, gate con hint.
6. **Paso 3** (`5a`): progreso por control + runbar final.
7. **Resultados** (`3c`/`4b`/`6b`/`5b`): barra de veredicto + Resumen + Detalle con sticky totals y filtros errores-primero + avisos en Detalles del run.
8. **Pantallas Rendimiento** (`7a`/`7b`): clasificación por cuenta y agrupación de conceptos con signo +/−.
9. **Pasada Intenso:** verificar que todo responde al tema con solo variables.

Regla general para los prompts: pasarle a Claude Code la sección de pantalla correspondiente de este README + pedirle que lea el módulo actual antes de tocar, que preserve funcionalidades existentes (semáforo, badges de archivos por control, signos +/− de conceptos, estados de run, "avisa no traba") y que no invente copys.

## Archivos del bundle

- `README.md` — este documento (sistema, tokens, pantallas)
- `CAMBIOS_TECNICOS.md` — cambios exhaustivos por archivo del repo, garantía de "solo visual", agregados opcionales y qué no tocar
- `screenshots/01–23 *.png` — captura de cada pantalla y estado (numeradas; referenciadas desde ambos documentos)
- `Rediseño Fase 1.dc.html` — prototipo completo (abrir en el proyecto de diseño para verlo renderizado; los estilos están inline en el markup)
