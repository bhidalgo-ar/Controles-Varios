# CHANGELOG — Controles Nómina

> Formato: [Conventional Commits](https://www.conventionalcommits.org/). Mensajes en español.
> Cada entrada: versión · fecha · tipo · descripción.

---

## [Unreleased] — MVP en desarrollo

### feat: Rendimiento vs Asiento admite varios archivos de Contabilidad — 2026-08-05

- `js/parsers/contaExcel.js` — `mergeContaFiles()`: concatena las filas parseadas de varios archivos de Contabilidad Desglosada (CONTA) y avisa (sin bloquear) si dos archivos distintos comparten filas idénticas — pensado para acumular varios meses en una sola corrida.
- `js/ui/fileUpload.js` — `initContaMultiUpload()`: el paso de carga de CONTA pasa a aceptar selección/arrastre múltiple, con lista de archivos cargados y opción de quitar cualquiera antes de ejecutar. Es el único `additionalFile` con este comportamiento; el resto sigue siendo un archivo por slot.
- `tests/contaMerge.test.js` — cubre el merge de meses distintos (sin falsos positivos de duplicado por `ID_CONTA`), la detección de un archivo subido dos veces, y que las repeticiones dentro de un mismo archivo no se marcan como duplicado cruzado. Sumado a `test:unit` en `package.json`.
- Ver D-018 en `DECISIONS.md`.

### docs: agregar README.md — 2026-08-04

- `README.md` — guía práctica de uso del repo: cómo levantar la app localmente (static server, por qué no funciona con doble click), flujo de uso básico, tabla de controles disponibles hoy (`CONTROL_REGISTRY`), modo admin, privacidad, cómo correr los tests (`npm run test:unit` / `test:e2e`) y estructura real del repo. Referenciado desde `CLAUDE.md` §3, §9 y §10 pero no existía hasta ahora.

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
