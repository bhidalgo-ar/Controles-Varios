# ROADMAP — Controles Nómina

> **Última actualización:** 11 de agosto de 2026
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
| 2.1 | Migración schema v3→v4: `code` como identidad de cliente + backfill | 1 | M | hecho ✅ (`db.version(4)`, cerrada en v6 — D-011/D-016) |
| 2.2 | Import del seed (`hya-controles-config.json`), chequeo de versión, merge no destructivo sobre `controlRuns` | 1 | M | hecho ✅ (`js/seed/importSeed.js`) |
| 2.3 | Modo admin con contraseña (hash local) para editar clientes/config y exportar seed | 2 | M | hecho ✅ (`js/ui/adminView.js` + `js/seed/exportSeed.js` — D-013) |
| 2.4 | Tabla `controlConfigs` + migrar fuera de `fileProfiles` lo que no es mapeo de columnas | 2 | M | hecho ✅ (`db.version(5)`) |
| 2.5 | `appliesWhen` por control + scopes general/convenio/cliente | 3 | M | hecho ✅ (2026-07-31, agrega scope `sistema`; ver `specs/segmentacion-controles-por-cliente.md`) |
| 2.6 | Seam de adaptadores: `js/adapters/meta4/` (extraer de parsers actuales) | 3 | M | planeado |
| 2.7 | Adaptador Axton — piloto con Merz | 4 | M | planeado |
| 2.8 | Retirar ruta de agrupadores; reimplementar como control `scope: general` | 5 | S | hecho ✅ (2026-07-31 — D-008/D-014) |
| 2.9 | Relevar `controlConfigs` real de los 21 clientes fuera de Marval (validar `appliesWhen` con consultores) | 5 | L | planeado |

**Definition of Done de v2:**
- [x] Un analista puede seleccionar cualquiera de los 22 clientes y ver solo sus controles aplicables (2026-07-31 — hoy sólo Marval tiene los 10 controles de M4; el resto ve "Cruce por Agrupadores").
- [x] El seed se puede exportar desde modo admin e importar en otro navegador sin perder historial local (2026-07-31 — `tests/e2e/adminExport.spec.js`).
- [ ] Merz corre con adaptador Axton y da el mismo resultado que el parser Meta4 daría con datos equivalentes.
- [x] No quedan dos rutas de validación paralelas (2026-07-31 — D-014).

---

## v2.1 — Escalabilidad interna (en ejecución)

Sale de la auditoría del 2026-08-11 (inventario de bugs y hotspots en
`specs/auditoria-escalabilidad-2026-08.md`; estado detallado fase por fase, con qué está bloqueado
por qué decisión, en `specs/plan-escalabilidad-fases.md`).
El orden importa: F1 destraba a las demás, y F5 es lo que evita que todo esto vuelva a pasar.

| Fase | Qué | Estado |
|---|---|---|
| F0 | Bugs que dan un resultado incorrecto hoy | hecho ✅ (2026-08-12) — quedan 2 abiertos a propósito: el badge en dark mode se lo lleva F2, y el fallback de NR/GS Pers espera un Tabulado real (D-039) |
| F1 | `toNum` único + clave de legajo única (D-038) y recién ahí extraer el módulo de consolidación | planeado — **bloqueada** por dos decisiones de Willy (ver el spec de fases) |
| F2 | Capa visual: sin hex fuera de `tokens.css`, `createResultsToolbar()`, CSS de PDF compartido | en curso (2026-08-12) — `createResultsToolbar()` hecho para 9/15 sitios, hex de JS cerrado; falta `css/components.css` (sin tocar a propósito, necesita navegador real) y el resto de la lista |
| F3 | `wireTableTools()`; migrar `catXEmpleados` y `rendVsAsiento` a `renderExportMenu`/`resultBlocks`; preferencia de vista por control | planeado — pendiente de decisión de Willy: qué recordar del toggle "sólo con diferencia/todos" |
| F4 | `fileTypes.js` con un mapa único, config declarada en el registry, matar el `Promise.all` posicional | en curso (2026-08-12) — Paso 0 (`Promise.all` por clave en `controlsWizard.js`) hecho; el resto sigue planeado |
| F5 | Skill `nuevo-control`: de "copiá X" a "importá X", una vez que exista el módulo de F1 | planeado |

F5 no es cosmético: el skill mandaba a copiar el helper de consolidación, y por eso el mismo bug se
arregló tres veces (Brutos, NR y GS Pers) — la copia número N siempre se olvida. Mientras el módulo
compartido no exista, el skill ya dice buscar las copias con `grep` y extraer en vez de copiar.

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
- **Variación entre períodos — editor de conceptos y de causas de ausencia.** El modelo de datos ya está (`controlConfigs` / `variaciones_config`, con `sueldos`, `conceptos` y `ausencias`) y el control lo lee, pero no hay UI para editarlo: la lista que se confirma en el Paso 2 es la sembrada. Falta la pantalla para **agregar o sacar cualquier columna del tabulado** de la comparación (incluidas las que no tienen código, como `Bruto` o `Neto`) y para editar los códigos que explican una baja de escalón. A decidir: inline en el panel "Conceptos a comparar" vs. pantalla de configuración aparte tipo `#/admin`. Diferido a propósito el 2026-08-10 para no agrandar el PR (ver D-035).
- **Variación entre períodos — reuso de la corrida anterior.** Volver a resolver el período anterior desde IndexedDB para subir un solo archivo por mes. Requiere primero **cerrar con el cliente la regla de qué quincena compara contra cuál** (los dos tabulados de muestra comparan 2ª de marzo contra 2ª de abril, pero el documento base dice que los jornales van contra la quincena inmediata anterior y los mensuales contra el mes anterior), y que el histórico del cliente guarde la quincena y no sólo el mes. Se sacó en D-035 justamente porque adivinarlo armaba comparaciones mal sin avisar.
- **Variación entre períodos — concepto `1000` (mensuales) sin validar.** No aparece en ninguno de los tabulados de muestra. La lógica está y suma sola cuando exista, pero nunca corrió contra datos reales.
- **Variación entre períodos — promoción a control de sistema.** Con los códigos fuera del código fuente, lo único específico de `POF` que queda es la semilla de la config. Cuando haya un segundo cliente con el mismo reporte, evaluar pasar el scope de `cliente` a `sistema`, igual que se hizo con los de Marval (D-015).
- **`tests/rendVsAsientoDrill.test.js` a CI.** Hoy es un test manual: necesita los archivos reales del cliente en `archivos test/`, que son datos de nómina y no se versionan. Para que entre a `npm run test:unit` hay que rehacerlo con fixtures anonimizados, como el resto de los tests.
- **Variación entre períodos — "Dirección B" (ficha por legajo).** Al rediseñar la pantalla de resultados (D-025) se evaluaron tres direcciones: "Qué cambió y por qué" (implementada, es la pantalla actual) y "Detalle" (implementada, es la solapa de tabla) resuelven "¿por qué bajó?" y "quiero ver los 71 juntos"; queda pendiente la tercera — una ficha expandible por legajo (patrón `.emp-card`, como el modo detalle de SIRADIG) que junta premios + bruto + horas del mismo empleado en una vista vertical sin scroll horizontal, para cuando el analista ya sabe qué legajo mirar y quiere el contexto completo de ese empleado. Explorada visualmente en `https://claude.ai/code/artifact/a69789a0-65e7-4b43-84af-b06a9c448491` (Dirección B). No es urgente: la solapa «Detalle» ya permite buscar un legajo puntual.

---

## Histórico de releases

| Versión | Fecha | Cambios principales |
|---|---|---|
| v1.0 | (en curso) | MVP: agrupadores + registry de 10 controles |
| v2.0 | (planificado) | Rediseño multi-cliente: `code`, seed, `appliesWhen`, adaptadores |
