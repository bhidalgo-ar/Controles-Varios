# ROADMAP — Controles Nómina

> **Última actualización:** 29 de julio de 2026
> Reescrito: la v1 (18-may) quedó desactualizada frente al código real (registry de controles ya construido). Este documento parte de lo que existe hoy y prioriza el rediseño multi-cliente.

---

## Convención

Prioridad 1 (más alta) a 10 (más baja). Esfuerzo: S (<1 día) · M (1-3 días) · L (>3 días). Estado: planeado · en progreso · hecho · descartado.

---

## v1 — MVP core (hecho)

| # | Ítem | Estado |
|---|---|---|
| Bootstrap, marca H&A, tokens CSS | hecho ✅ |
| DB layer Dexie v1-v3 | hecho ✅ |
| Gestión de clientes, agrupadores | hecho ✅ |
| Parsers Nómina Maestra / Resumen Largo / Resumen Tabulado | hecho ✅ |
| Wizard de ejecución + matching + diferencias | hecho ✅ |
| `CONTROL_REGISTRY` con 10 controles (EE x CATEG, Brutos, GS Pers, NR, Rend vs Tabulado, Rend vs Asiento, Rend x EE) | hecho ✅ |
| Catálogo de conceptos por cliente (`clientCatalogs`, DB v3) | hecho ✅ |
| Semáforo de estado por control | hecho ✅ |
| Checklist mensual de controles ejecutados | hecho ✅ |
| Insights mes a mes | parcial ⚠️ |
| Listado de sesiones históricas, export Excel/JSON | planeado |

---

## v2 — Rediseño multi-cliente (prioridad actual)

| # | Bloque | Prio | Esfuerzo | Estado |
|---|---|---|---|---|
| 2.1 | Migración schema v3→v4: `code` como identidad de cliente + backfill | 1 | M | planeado |
| 2.2 | Import del seed (`hya-controles-config.json`), chequeo de versión, merge no destructivo sobre `controlRuns` | 1 | M | planeado |
| 2.3 | Modo admin con contraseña (hash local) para editar clientes/config y exportar seed | 2 | M | planeado |
| 2.4 | Tabla `controlConfigs` + migrar fuera de `fileProfiles` lo que no es mapeo de columnas | 2 | M | planeado |
| 2.5 | `appliesWhen` por control + scopes general/convenio/cliente | 3 | M | hecho ✅ (2026-07-31, agrega scope `sistema`; ver `specs/segmentacion-controles-por-cliente.md`) |
| 2.6 | Seam de adaptadores: `js/adapters/meta4/` (extraer de parsers actuales) | 3 | M | planeado |
| 2.7 | Adaptador Axton — piloto con Merz | 4 | M | planeado |
| 2.8 | Retirar ruta de agrupadores; reimplementar como control `scope: general` | 5 | S | planeado |
| 2.9 | Relevar `controlConfigs` real de los 21 clientes fuera de Marval (validar `appliesWhen` con consultores) | 5 | L | planeado |

**Definition of Done de v2:**
- [x] Un analista puede seleccionar cualquiera de los 22 clientes y ver solo sus controles aplicables (2026-07-31 — hoy sólo Marval tiene los 10 controles de M4; el resto ve "Cruce por Agrupadores").
- [ ] El seed se puede exportar desde modo admin e importar en otro navegador sin perder historial local.
- [ ] Merz corre con adaptador Axton y da el mismo resultado que el parser Meta4 daría con datos equivalentes.
- [ ] No quedan dos rutas de validación paralelas.

---

## v3 — Escalar adaptador Axton + consolidación de equipo

| # | Feature | Prio | Esfuerzo | Notas |
|---|---|---|---|---|
| 3.1 | Adaptador Axton para los 7 clientes restantes (Siasa, COELSA, Red Bull, Plastic Omnium Pilar, Epiroc, Geopagos, Poincenot, Coty) | 2 | L | Post-piloto Merz |
| 3.2 | Registro de cobertura mensual vía monday.com (item por corrida: cliente, período, control, estado, cantidad de diferencias — sin datos de empleados) | 2 | M | Resuelve visibilidad de equipo sin backend propio |
| 3.3 | Jerarquía cliente → entidad operable (Sportline, Carrier, Lowsedo, Poincenot) | 4 | L | Solo si un caso real lo exige |
| 3.4 | Control de Netos (Sportline) — implementación | 2 | M | Diseño ya validado, ver `specs/spec-control-netos.md` |
| 3.5 | Gross-up calculator (AFA, concepto 1017) reemplazando goal-seek de Excel | 3 | M | Segundo control nuevo priorizado, ver `specs/spec-gross-up.md` |
| 3.6 | Export a Excel multi-hoja | 3 | M | Pendiente de v1 |
| 3.7 | Export/import JSON de sesión | 4 | M | Pendiente de v1 |
| 3.8 | Control de escala salarial por convenio (Comercio: COELSA, Red Bull, TIM, Sportline, Carrier) | 5 | M | Primer control real de `scope: convenio` |

---

## v4 — Backend real / roles

| # | Feature | Prio | Notas |
|---|---|---|---|
| 4.1 | Backend SharePoint (Graph API) para consolidar resultados, no solo configuración | 2 | Solo si monday.com (3.2) no alcanza |
| 4.2 | Roles y permisos (analista/admin ya cubierto por password; agregar supervisor) | 4 | |
| 4.3 | Versionado de archivos cargados más allá de "definitiva/borrador" | 5 | |

---

## Ideas sueltas / parking lot

- PDF como tipo de archivo de cruce.
- Autodetección de mapeo de columnas.
- Reglas personalizadas de alerta ("si concepto X cae >Y% mes a mes").
- Filtros y búsqueda en pantalla de análisis.
- Modo oscuro, atajos de teclado, PWA installable.
- Migración de hosting de GitHub Pages a la web de hidalgoyasociados (habilita `fetch('./config/')` para el seed en vez de import manual — ver `ARCHITECTURE.md` sección 6).
- Rutinas guardadas por cliente en el Paso 1 del wizard (ej. "Cierre mensual" preselecciona de un click la batería completa en vez de tildar control por control). Mockup "D" evaluado el 2026-08-05 junto con el rediseño del Paso 1 (D-018 en `DECISIONS.md`) — no resuelve el apilamiento por sí solo, se combinaría con la lista filtrable ya implementada. Requiere una entidad nueva en IndexedDB (rutina = cliente + lista de controlIds) y ABM desde `#/admin`.

---

## Histórico de releases

| Versión | Fecha | Cambios principales |
|---|---|---|
| v1.0 | (en curso) | MVP: agrupadores + registry de 10 controles |
| v2.0 | (planificado) | Rediseño multi-cliente: `code`, seed, `appliesWhen`, adaptadores |
