# CHANGELOG — Controles Nómina

> Formato: [Conventional Commits](https://www.conventionalcommits.org/). Mensajes en español.
> Cada entrada: versión · fecha · tipo · descripción.

---

## [Unreleased] — MVP en desarrollo

### chore: skill `nuevo-control` + allowlist de permisos versionados — 2026-08-04

- `.claude/skills/nuevo-control/SKILL.md` — guía operativa para agregar un control nuevo (o una variante "Generar Reporte" de uno existente): los 6 puntos de integración con referencias `archivo:línea` a `nr.js`, contratos de `run`/`summarize`/`renderResults`, patrones de UI obligatorios (hero de diferencias, ocultar filas/columnas sin valor real), mínimo de test exigido y errores frecuentes.
- `.claude/settings.json` — allowlist de comandos del proyecto (scripts de `package.json`, runner de tests, `python3 -m http.server`, lecturas de git), derivado de `package.json` y `.github/workflows/ci.yml`.
- `.gitignore` — `.claude/` pasa a `.claude/*` con excepciones para `skills/` y `settings.json`, para que ambos se compartan con el equipo. Ver D-017.

### feat: bootstrap del proyecto (bloque 1.1) — 2026-05-18

- `index.html` — shell de la app con header H&A (logo + wordmark + fallback CSS offline), banner de privacidad obligatorio, área de contenido principal y footer corporativo con las 3 sedes y datos de contacto.
- `css/tokens.css` — variables CSS de diseño: paleta H&A (`#00ACD4`, `#8C837B`), tipografía Source Sans Pro, escala de espaciado, bordes, sombras, z-index.
- `css/base.css` — reset, estilos generales, estructura del header y footer, clases utilitarias (text-muted, text-primary, container, page-content).
- `css/components.css` — sistema completo de componentes UI: botones (primary/secondary/ghost/danger), pills de agrupadores, badges, cards, tablas de datos con paginación, wizard de pasos, formularios, file upload, spinner, toast, modal, empty state, alert, welcome screen.
- `js/main.js` — bootstrap: inicialización de la app, verificación de CDNs (SheetJS + Dexie), setup del banner de privacidad, router básico, helper `showToast()` exportable, pantalla de bienvenida con estado del MVP.
- `DECISIONS.md` — creado. Log de decisiones técnicas (D-001 a D-003).

---

*Próximo: bloque 1.2 — DB layer con Dexie + schemas + helpers CRUD.*
