# Cambios técnicos por archivo — Rediseño Controles Nómina

Guía exhaustiva para Claude Code. **Alcance: el rediseño es 100% visual/estructural de la capa de UI.** No se toca ninguna lógica de negocio: parsers, controles, cálculos de diferencias, semáforo, gates de validación, persistencia (Dexie), seed, export ni rutas. Las únicas excepciones aditivas (nunca modifican comportamiento existente) están marcadas como **[ADITIVO]** al final.

## Garantía de funcionalidades intocables

Estas funcionalidades existen hoy y deben quedar EXACTAMENTE iguales (solo cambia cómo se ven):

- Semáforo de resultados: verde 0% · amarillo ≤2% · rojo >2% de legajos con diferencia (`js/controls/semaforo.js` — no tocar).
- Badges de archivos requeridos/opcionales por control en el Paso 1 (vienen del `CONTROL_REGISTRY` — no tocar el registry).
- Signo **+/− por concepto** en la agrupación de Rendimiento vs Tabulado (suma o resta dentro del grupo; un clic lo invierte).
- Estados del run: ⚡ Ejecución rápida / 📝 Borrador / ✅ Definitivo y su relación con el checklist mensual.
- "Avisa, no traba" (D-036): archivo con sigla que no coincide y columna con contenido raro avisan pero nunca bloquean; el toggle ⊘ "no viene" sigue siendo la única declaración de ausencia.
- Muestra de 2 valores reales por columna (`columnHints.js`) siempre visible, y el aviso de tipo conservador.
- Gate del wizard: los mismos requisitos de archivos/columnas habilitan "Siguiente"; solo cambia cómo se comunica (hint junto al botón en vez de texto suelto).
- Reuso del Tabulado del período anterior; multi-archivo de Contabilidad con aviso de filas duplicadas.
- Autocompletar de compañías conocidas al crear cliente; ocultar/reactivar/borrar clientes; importar seed/respaldo (solo se mueven de lugar: menú "Datos ▾").
- Modo admin, PIN, agrupadores, checklist mensual: sin cambios en esta fase.
- Dark mode: **no se elimina**. Pasa a ser una opción más del selector de tema (ver abajo). Si se decide posponerlo, dejar la opción visible deshabilitada pero NO borrar los tokens dark existentes.

## 1. `index.html`

- Eliminar el `<footer class="app-footer">` completo (decisión: app interna sin footer institucional).
- Reemplazar el header actual por la barra única de 54px (ver `screenshots/01`): iso 30px, pill "Controles Nómina", divider, slot de navegación contextual (`#js-header-nav` se mantiene como slot — los módulos siguen inyectando ahí), slot de contexto "Cliente · Período", slot de stepper, slot de hint + acción primaria, botón selector de tema.
- El script anti-flash de tema del `<head>` se mantiene; ampliar valores de `theme` en localStorage: `light` → `sobrio`, `dark` → `oscuro`, nuevo `intenso`. Migración: si el valor guardado es `light`/`dark`, mapear a `sobrio`/`oscuro` (una línea, retrocompatible).
- El banner de privacidad se mantiene tal cual (obligatorio por marca).
- Fuentes: ya carga Plus Jakarta Sans y DM Serif Display — sin cambios.

## 2. `css/tokens.css`

- Mantener TODO lo existente (incluido dark). Agregar:
  - `[data-theme="sobrio"]` = alias del light actual (los mismos valores).
  - `[data-theme="intenso"]`: solo superficie — `--header-bg:#15263D`, `--header-fg:#FFF`, cards sin borde con `--sh-tool`, radios 14px, y activar `--serif` para display. Todo lo demás hereda del light.
  - Tokens nuevos: `--primary-disabled:#A9DFEE`, `--table-head-border:#15263D`, `--popover-shadow:0 12px 32px rgba(30,58,95,.16)`.
- Explicación: los dos temas claros comparten estructura; Intenso debe salir SOLO de variables (si un componente necesita un if de tema, está mal factorizado).

## 3. `css/base.css`

- `.app-header`: altura 68px → 54px, `border-bottom:2px solid var(--celeste)` (3px + fondo `--header-bg` en Intenso). Absorbe `app-header--compact` (ya no hace falta: la barra es una sola siempre).
- Nuevo layout de app: `body` deja de scrollear en pantallas de app; `.app-main` pasa a `display:grid; grid-template-rows:auto auto 1fr; height:calc(100vh - 54px)`. Cada zona scrollea con `overflow-y:auto; min-height:0`.
- Eliminar estilos de `.app-footer*`.
- `h1/h2/h3` dejan de ser celestes por defecto en pantallas de app: títulos de pantalla 19px/800 `var(--ink)` (ver screenshots). Los headings celestes quedan solo para materiales de marca.

## 4. `css/components.css`

Reescritura visual de clases existentes (mismos nombres → los módulos JS casi no cambian):

- `.btn--primary/--secondary/--ghost`: pill siempre; primary disabled `#A9DFEE` con cursor not-allowed (nunca `display:none`); hover primary `#0090B4` + sombra celeste.
- `.wizard-steps` → stepper compacto en header (círculos 18px, check verde en pasos hechos).
- Nuevo `.gate-hint` (pill warn junto a la primaria: "Falta: …").
- `.side-panel` (300px, borde izquierdo hairline, section labels celestes 10px uppercase) + `.side-checklist` (✓ verde / ○ pendiente / ⚠ warn).
- Dropzones: estados `--empty` (dashed celeste), `--dragover`, `--loading` (spinner), `--warn` (sigla no coincide, con acciones "Usarlo igual · Elegir otro"), `--loaded` (verde, nombre mono + meta + "Cambiar").
- Field-help block (regla 3): `.field__label`, `.field__code` (mono 10px), `.field__badge` (auto/sesión/sin asignar/⊘), `.col-hint` (ya existe — solo restyle), `.field__help` (texto visible cuando está pendiente).
- Renglón opcional: `.optional-row` (dashed, 1 línea, default explícito + link).
- Tablas de resultados: `.results-table` con `thead th {position:sticky;top:0}` (2 niveles con `top` calculado para grupos), `tfoot td {position:sticky;bottom:0}` con `border-top:2px solid var(--table-head-border)`, tintes de grupo (celeste dim / navy dim), `tabular-nums` en toda celda numérica, badge de Δ (error) y de ausencia (warn).
- Chips de concepto: `.concept-chip` con signo `+`/`−` clicable (verde/rojo), variante `--warn` (⚠ no está en el Tabulado), `--add` (dashed).
- `.home-table`: head sticky con border-bottom 2px ink; fila hover celeste 3%.
- `.month-selector`: pill compacto para el header.
- Popovers (`.help-popover__panel`, `.results-ctx-bar__popover`, menú Datos, menú Exportar): sombra `--popover-shadow`, radio 12px.
- Hero de Resumen: `.results-hero` (card centrada, icono circular de estado, KPIs 30px/700 celeste — rojo para negativos).
- Transición global de componentes interactivos: `.22s cubic-bezier(.4,0,.2,1)`; keyframes `dotpulse` (dot verde de veredicto) y spinner.
- Eliminar cualquier `border-left` de acento de un solo lado (regla del DS).

## 5. `js/main.js`

- Header: además de `#js-header-nav`, poblar los slots nuevos (contexto, stepper, hint+primaria) vía una pequeña API `setHeader({ back, context, steps, hint, primary })` que cada vista llama al montar. Solo mueve DOM: los handlers son los mismos que hoy viven en cada vista.
- Quitar referencias al footer.

## 6. `js/ui/clientsList.js` (screenshots 18)

- Mover el month-selector al header (mismos handlers `js-month-prev/next`).
- Agrupar "📥 Importar cartera / ⬇ Respaldo / ⬆ Restaurar" en un menú `Datos ▾` (mismos ids y handlers, solo cambian de contenedor). "+ Nuevo cliente" pasa a `.btn--secondary`.
- Re-templatear `renderClientRow` con las clases nuevas (`▶ Ejecutar` primary sm por fila, Resultados ghost — sigue disabled sin corridas —, ⋯ igual). `buildClientRowData` NO se toca.
- Empty states: mismos textos, contenedores nuevos.

## 7. `js/ui/controlsWizard.js` (screenshots 01, 02, 12, 15, 22, 23)

- Paso 1: cards de control con checkbox + tag + descripción completa + badges de archivos a la derecha (los badges se siguen derivando del registry). Búsqueda: resaltar coincidencia con `<mark>` y mostrar "N ocultos por la búsqueda — borrala" (la lógica de filtrado ya existe). Panel lateral: "Vas a ejecutar (n)" + "Archivos que te va a pedir" (datos que ya calcula el wizard).
- Paso 2: mover el Catálogo de Conceptos (opcional) del tope al renglón final `.optional-row`; dropzones obligatorios arriba en grid 2 col; formulario de columnas en grid 2 col con el field-help block. Los mensajes del gate existentes ("Seleccioná al menos un control…", "Completá los archivos y columnas requeridas") se muestran en `.gate-hint` junto a la primaria — misma condición, otro lugar.
- Paso 3: UI de progreso por control (terminado/corriendo/en cola) + runbar final. Si hoy la corrida es sincrónica sin progreso granular, mostrar spinner general + lista con estado terminado/pendiente — no inventar progreso que el motor no reporta.
- Nombres humanos de campos ("A cta. de futuros aumentos" para `A_CTA_FUT_AUMEN`): tabla de labels en el módulo o en `fileTypes.js`, con el código técnico siempre visible al lado. No renombrar claves internas.

## 8. `js/ui/fileUpload.js` + `js/ui/fileTypes.js` (screenshots 09, 14)

- Re-templatear dropzones con los 5 estados; el flujo "no parece X → Usarlo igual / Elegir otro" ya existe como comportamiento — solo cambia la presentación.
- Placeholders: "— Sin asignar —" → "Elegí la columna del Tabulado…" y "— Seleccioná —" → ídem (solo el texto del option vacío; el value sigue siendo `''`).

## 9. `js/ui/columnHints.js`

- Sin cambios de lógica. Solo consume las clases restyleadas (`.col-hint`, `.col-hint--warn`).

## 10. `js/ui/resultsHeader.js` + `js/ui/controlsResults.js` + `js/ui/tableTools.js` + `js/ui/resultBlocks.js` (screenshots 03, 10, 11, 13, 17, 19)

- Barra de contexto: se funde con el header único (mismo `renderResultsContextBar`, montado en los slots del header). `setCompactHeader` queda obsoleto (borrar con cuidado: buscar sus dos call sites).
- Tabs Resumen/Detalle, filtros chips, búsqueda ("Buscá por legajo o nombre…"), export menú: restyle sobre `tableTools.js`/`exportMenu.js`, mismos handlers.
- Tabla: thead sticky de 2 niveles + tfoot sticky con el total (el total de la selección filtrada ya se recalcula hoy en el filtrado — si no, es **[ADITIVO]** de presentación: recalcular la suma de las filas visibles al renderizar).
- "Errores primero": si el filtro por defecto al llegar con errores no existe hoy, es **[ADITIVO]** de UI (elegir el filtro inicial según el tier del resultado — no cambia datos).
- Hero de Resumen + card por control con el control en rojo primero (orden de presentación, no de datos).

## 11. `js/ui/rendVsTabuConceptEditor.js` + `js/ui/grouperEditor.js` + `js/ui/variacionesConceptMap.js` (screenshot 23)

- Restyle de chips con `.concept-chip`; **el toggle +/− y el ✕ conservan sus handlers actuales**. Leyenda "+ suma · − resta · ⚠ no está en este Tabulado". Overflow "+ N más…" expandible (solo colapso visual; todos los chips siguen en el DOM o se renderizan al expandir).
- Toolbar: segmented de orden (Sin ordenar/Por número/Alfabético), checkbox "Ocultar los que no están", "↺ Restaurar defaults" — funcionalidades existentes, solo restyle.

## 12. `js/ui/helpPopover.js` + `js/ui/toast.js`

- Solo estilos (panel con `--popover-shadow`, pasos numerados con círculos celestes; toast ink con check verde). Accesibilidad existente (aria, Escape, click afuera) intacta.

## 13. Tests (`tests/`, `tests/e2e/`)

- Los e2e seleccionan por ids `js-*`: se conservan TODOS los ids existentes. Ajustar solo asserts de textos cambiados (placeholders) y de estructura (footer eliminado, header único). Correr `npm test` después de cada tarea.

## Agregados [ADITIVO] — nuevos, opcionales, no modifican nada existente

1. **Selector de tema** (screenshot 07): reemplaza el botón 🌙 por el menú Sobrio/Intenso/Oscuro. El dark existente queda como "Oscuro".
2. **Avisos del run** (screenshot 17): persistir el array de avisos ("sigla no coincide", "valores no parecen importes") en el objeto run al ejecutar y listarlos en "Detalles del run" y en el export. Campo nuevo `warnings: string[]` — los runs viejos sin el campo muestran la sección vacía.
3. **Filtro inicial "Con diferencias"** al llegar a Detalle con errores, si no existe hoy.
4. **Total de la selección** en el tfoot sticky del Detalle filtrado, si hoy solo existe el total global.

## Qué NO tocar (cero cambios)

`js/controls/**` (registry, semáforo, cada control), `js/parsers/**`, `js/data/**`, `js/db.js`, `js/seed/**`, `js/utils/**`, `config/**`, `reportes/**`, modo admin (`adminView.js`, `pinGate.js`) en esta fase, y el flujo de rutas de `main.js` (`#/`, `#/controls/:id`, `#/control-results/:id`, `#/checklist/:id`, `#/admin`).
