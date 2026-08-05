# DECISIONS — Log de decisiones técnicas

> Registrar aquí decisiones no obvias: por qué se eligió algo, qué alternativas se descartaron y cuál fue el motivo.
> Una entrada por decisión. Formato: fecha · contexto · decisión · alternativas descartadas · motivo.

---

## D-001 — Los archivos MD de planificación viven en `Claude md/`

**Fecha:** 2026-05-18
**Contexto:** Los documentos de planificación (PRD, ARCHITECTURE, ROADMAP, CLAUDE.md) fueron creados en una carpeta `Claude md/` antes del bootstrap del código.
**Decisión:** Dejarlos en `Claude md/` sin moverlos. Los documentos operativos nuevos (DECISIONS.md, CHANGELOG.md, README.md) viven en la raíz del proyecto.
**Alternativas descartadas:** Mover todo a la raíz (hubiera roto referencias previas y confundido a Willy).
**Motivo:** Mínima fricción, máxima compatibilidad con el estado existente.

---

## D-002 — `@import` en base.css para tokens.css

**Fecha:** 2026-05-18
**Contexto:** `tokens.css` define las variables CSS. `base.css` las usa.
**Decisión:** Usar `@import './tokens.css'` al inicio de `base.css` en lugar de requerir que `index.html` declare los dos `<link>` en orden correcto.
**Alternativas descartadas:** Solo declarar ambos en `index.html` (más frágil: depende del orden).
**Motivo:** La dependencia queda explícita en el código, no en el HTML.

---

## D-003 — Fallback CSS para el logo H&A

**Fecha:** 2026-05-18
**Contexto:** La herramienta se usa en equipos corporativos que pueden estar offline o con acceso restringido a URLs externas.
**Decisión:** Usar `<img onerror="...">` que reemplaza la imagen por el isotipo CSS (círculo celeste con "H&A") si la URL del logo no carga.
**Alternativas descartadas:** Solo imagen (falla offline), solo CSS (no muestra logo real cuando hay red).
**Motivo:** Mejor experiencia en todos los contextos, sin costo extra.

---

## D-004 — Identidad de cliente pasa de `++id` a `code`

**Fecha:** 2026-07-29
**Contexto:** Escalado a 22 clientes / 15 analistas, con configuración distribuida por seed entre navegadores. Un `++id` autoincremental de Dexie no es estable entre instalaciones distintas.
**Decisión:** `clients.code` (string, ej. `MARVAL`) es la identidad estable. Toda referencia cruzada (`controlConfigs`, `controlRuns`, seed) usa `code`, no el id de Dexie. Migración de schema a v4 con backfill.
**Alternativas descartadas:** Mantener `++id` y mapear por nombre en runtime (frágil ante typos/renames); usar UUID generado (innecesario, `code` ya es legible y suficiente).
**Motivo:** El seed compartido entre 15 analistas no puede depender de un id que cada navegador genera de forma independiente.

---

## D-005 — Contraseña de modo admin es barrera de acceso, no control de seguridad

**Fecha:** 2026-07-29
**Contexto:** GitHub Pages sirve el JS sin ofuscar; cualquier hash o validación de contraseña es legible en el código fuente.
**Decisión:** Se implementa modo admin con contraseña (hash SHA-256 comparado del lado cliente) igual, entendiendo explícitamente que su función es evitar el acceso accidental de un analista, no proteger contra acceso deliberado. La protección real de integridad del sistema es el permiso de escritura sobre la carpeta de SharePoint donde se publica el seed: quien entra al modo admin puede editar su copia local, pero no puede afectar a los demás sin ese permiso.
**Alternativas descartadas:** No poner contraseña (peor UX, cualquiera cae en modo admin sin querer); auth real vía Microsoft 365 (over-engineering para el problema real, que es de distribución de un archivo, no de autenticación de usuarios).
**Motivo:** Resolver el problema real (integridad del seed compartido) con el mecanismo que ya existe (permisos de SharePoint) en vez de simular seguridad que la plataforma no puede dar.

---

## D-006 — Controles se activan por `appliesWhen`, no por tildado manual

**Fecha:** 2026-07-29
**Contexto:** Con 22 clientes y un catálogo de controles creciendo, tildar manualmente qué control aplica a qué cliente escala mal (22 × N decisiones, repetidas en cada cliente nuevo).
**Decisión:** Cada control declara `appliesWhen(client)`, un predicado sobre atributos ya existentes del cliente (pluriempleo, holding, CCT, paymentUsd, f1359, etc.). `controlConfigs.status` permite override manual explícito con motivo para las excepciones.
**Alternativas descartadas:** Tildado manual puro (no escala); motor de reglas genérico configurable desde la UI (over-engineering para los casos reales identificados).
**Motivo:** Los atributos que determinan si un control aplica ya existen en el tracker de clientes de Willy; conviene derivarlo en vez de duplicar la decisión a mano.

---

## D-007 — Parsers dejan de acoplarse a Meta4: seam de adaptadores por `sourceSystem`

**Fecha:** 2026-07-29
**Contexto:** 8 de 22 clientes liquidan en Axton, no en Meta4. Los controles y parsers actuales asumen layout de Meta4 (nombres de columna, textos de ayuda "Bajá el Reporte de M4").
**Decisión:** Los controles declaran inputs en forma lógica (`tabulado`, `reporte_brutos`), y un índice de adaptadores por `sourceSystem` (`js/adapters/meta4/`, `js/adapters/axton/`) resuelve el parsing real. El texto de ayuda de "cómo conseguir el archivo" se mueve del control al adaptador.
**Alternativas descartadas:** Un parser Axton paralelo por control, duplicando la lógica de cruce (mantenimiento doble); esperar a tener todos los archivos de Axton antes de tocar la arquitectura (ya hay 8 clientes activos en Axton, no es un caso futuro).
**Motivo:** El sistema de origen es una propiedad del cliente, no del control; la lógica de validación es la misma independientemente de dónde salió el archivo.

---

## D-008 — Se retira la ruta de agrupadores como flujo separado

**Fecha:** 2026-07-29
**Contexto:** `main.js` mantiene dos rutas de validación paralelas: agrupadores (`#/wizard/:clientId`) y registry de controles (`#/controls/:clientId`). Con 22 clientes no se sostienen dos sistemas.
**Decisión:** El cruce por agrupadores se reimplementa como un control más del `CONTROL_REGISTRY`, `scope: 'general'`. Se retira la ruta separada.
**Alternativas descartadas:** Mantener ambos flujos indefinidamente (confunde qué usar y duplica lógica de sesión).
**Motivo:** Es, de hecho, el único control genuinamente general que existe hoy — pertenece al registry, no a un flujo aparte.

---

## D-009 — Docs de planificación pasan de `Claude md/` a la raíz del repo

**Fecha:** 2026-07-30
**Contexto:** D-001 (18-may-2026) dejó los documentos de planificación en `Claude md/` por mínima fricción con el estado existente en ese momento. Las versiones v2.0 de PRD/ARCHITECTURE/ROADMAP se subieron directamente a la raíz del repo el 2026-07-29, dejando duplicados desactualizados en `Claude md/`. Además, Claude Code carga automáticamente `CLAUDE.md` solo cuando vive en la raíz del repo — desde una subcarpeta requiere que cada sesión lo lea a mano.
**Decisión:** Se consolidan `PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DECISIONS.md`, `CHANGELOG.md` y `CLAUDE.md` en la raíz. Se borra la carpeta `Claude md/`. Supera a D-001.
**Alternativas descartadas:** Mantener duplicados sincronizados a mano en las dos ubicaciones (fuente de desactualización garantizada — ya pasó con PRD/ARCHITECTURE/ROADMAP v1).
**Motivo:** La raíz es donde Claude Code carga `CLAUDE.md` automáticamente, y donde cualquiera del equipo espera encontrar la documentación de un repo sin tener que buscarla.

---

## D-010 — El seed real se acepta temporalmente en el repo público; el ejemplo anonimizado queda versionado

**Fecha:** 2026-07-30
**Contexto:** El commit `ea6f38e` subió `hya-controles-config.seed.json` (datos reales de los 22 clientes: nombre, dotación, consultor, complejidad, CCT) a la raíz de un repo público. Reescribir el historial para sacarlo (`git filter-repo` + force push) rompe los clones del equipo, y no hay credenciales ni datos de empleados en juego.
**Decisión:** Se acepta la exposición actual; el repo pasa a privado más adelante (decisión de negocio, fuera del alcance de esta entrada) y ahí el seed real se muda a SharePoint, quedando en el repo solo `config/hya-controles-config.example.json` con datos ficticios.
**Alternativas descartadas:** Reescribir el historial de `main` ahora (costo alto para un dato que no es secreto en sentido estricto); borrar el archivo del working tree sin más (no saca nada del historial, da falsa sensación de resuelto).
**Motivo:** El costo de una reescritura de historial no se justifica frente a un dato que no es secreto y que de todos modos se resuelve cuando el repo pase a privado.

---

## D-011 — Migración de `clients` a `code` es aditiva, no un reemplazo de PK en un solo paso

**Fecha:** 2026-07-30
**Contexto:** `ARCHITECTURE.md` §2 (v2.0) describe pasar `clients` de `++id` a `&code` como clave primaria en un solo salto de schema (v3→v4), reescribiendo las FK de `groupers`, `fileProfiles`, `sessions`, `controlRuns` y `clientCatalogs`. Eso toca los 9 archivos que hoy usan `clientId` y no entrega funcionalidad nueva por sí solo.
**Decisión:** v4 agrega `code` como índice único (`&code`) junto a `++id`, que sigue siendo la PK. Las tablas nuevas (`controlConfigs`) usan `clientCode` desde el día uno; las tablas existentes siguen con `clientId` hasta que algo funcional lo exija. El cierre de la migración (FKs a `clientCode`, drop de `clientId`) queda como tajada opcional (T10 de `PLAN_v2.md`).
**Alternativas descartadas:** El big-bang que describe `ARCHITECTURE.md` §2 (alto riesgo, cero valor entregado en el camino).
**Motivo:** El resultado observable para el seed compartido es el mismo (clientes referenciados por `code`); repartir el riesgo en pasos reversibles vale más que cerrar el schema ideal de una sola vez.

---

## D-012 — Se saca el atributo `f1359`; catálogo de consultores propio; ejemplo anonimizado eliminado

**Fecha:** 2026-07-30
**Contexto:** Decisión de Guillermo, tres cambios relacionados. (1) `f1359` era el único atributo del modelo que no correspondía a ningún control real de los 10 existentes — quedó marcado como ambigüedad abierta en T4 (ver PR #59) y ahora se resuelve sacándolo del todo. (2) Los "consultores" solo existían como valor derivado de `clients[].consultant` o de `teams[].lead` — no había forma de declarar un consultor nuevo (ej. Florencia, Eileen, Laura) sin asignarlo antes a un cliente. (3) `config/hya-controles-config.example.json` (2 clientes ficticios de T0) ya no hace falta.
**Decisión:** Se borra `attributes.f1359` de todos los clientes del seed real y del modelo (formulario, autocompletado, `SEED_SCHEMA.md`). Se agrega `consultants: [{ name }]` como catálogo de nivel raíz del seed — mismo rol que `teams`, pero para nombres de consultores, con o sin cliente asignado todavía. Se agrega el equipo `EQ_TOYOTA` (sin `lead` asignado — `teams[].lead` ahora puede ser `null`). Se borra `config/hya-controles-config.example.json`; los tests que lo usaban arman su propio seed de prueba en memoria.
**Alternativas descartadas:** Dejar `f1359` "por las dudas" (generaba la misma pregunta sin respuesta en cada tajada que tocara scopes); mantener el ejemplo anonimizado "por si sirve" (sin ningún uso real siete tajadas después de creado, y los tests no lo necesitan como archivo commiteado).
**Motivo:** Los tres cambios reducen el modelo a lo que efectivamente se usa — un atributo sin control que lo consuma, un catálogo de consultores incompleto, y un archivo de ejemplo sin lectores reales.

---

## D-013 — Modo admin (T6): contraseña generada por el agente, no elegida por Guillermo

**Fecha:** 2026-07-30
**Contexto:** T6 pide una contraseña real para el hash SHA-256 de `#/admin` (D-005 ya definió que es barrera de acceso, no seguridad real). Se le preguntó a Guillermo si prefería decirla él o que se generara una, sin respuesta en el momento de implementar.
**Decisión:** Se generó una contraseña al azar (`KjZiorNwZ8hyfS`) y se hasheó en `js/ui/adminView.js` (`ADMIN_PASSWORD_HASH`). Queda documentada acá en texto plano a propósito — no protege nada sensible (D-005) y Guillermo la necesita para entrar la primera vez. Puede rotarla cuando quiera: cambiar el hash en `adminView.js` (`sha256("nueva contraseña")` en cualquier consola con Web Crypto).
**Alternativas descartadas:** Bloquear T6 hasta tener respuesta (la tajada no dependía de nada más para avanzar); dejar un valor por defecto obvio tipo "admin" (peor barrera de acceso accidental, que es la única función real que cumple).
**Motivo:** Auto Mode — con una decisión de bajo impacto y reversible (rotar la contraseña es cambiar una constante), conviene avanzar y avisar en vez de bloquear la tajada.

---

## D-014 — T9 ejecutado: agrupadores como control del registry, sin migrar el historial viejo

**Fecha:** 2026-07-31
**Contexto:** D-008 (2026-07-29) ya había decidido retirar `#/wizard/:clientId` en favor de un control del `CONTROL_REGISTRY`. Al implementarlo (T9 de `PLAN_v2.md`, spec en `specs/plan-v2-t9-t10.md`) aparecieron dos decisiones concretas no cubiertas por D-008: qué hacer con las corridas viejas ya guardadas por agrupadores, y cómo declarar en el registry un control cuyo segundo archivo (Resumen) puede venir en 2 formatos distintos.
**Decisión:**
1. Se retira `#/wizard/:clientId` y `#/results/:sessionId` enteros (borrados `js/ui/wizard.js` y `js/ui/resultsView.js`). Las tablas `sessions`/`sessionFiles`/`sessionResults` con corridas viejas quedan huérfanas en IndexedDB — sin pantalla que las muestre, sin migración a `controlRuns`. Confirmado por Guillermo el 2026-07-31.
2. El nuevo control `agrupadores` declara **2 additionalFiles opcionales** para el Resumen (`resumen_largo_excel` y `resumen_tabulado_horizontal`) en vez de un selector de tipo en runtime — el registry no tiene mecanismo para "un additionalFile con fileType elegible al vuelo". `controlsWizard.js` exige con un caso puntual en `canGoNext` que llegue al menos uno de los dos (mismo patrón que usan Brutos/GS Pers/NR para sus columnas del Tabulado).
3. La selección de agrupadores + umbrales del control vive en `controlConfigs` (`agrupadores_config`), mecanismo de T5 — mismo patrón que `rva_config` de Rendimiento vs Asiento.
**Alternativas descartadas:** Migrar `sessions` a `controlRuns` (más trabajo para un historial que, según Guillermo, no hace falta conservar accesible); replicar el selector de tipo de Resumen del wizard viejo dentro del registry (hubiera exigido extender el contrato de `additionalFiles`, que hoy asume un `fileType` fijo por entrada).
**Motivo:** Los tres puntos priorizan reusar la infraestructura ya construida en T5 (`controlConfigs`) y en el propio `controlsWizard.js` (casos puntuales por `controlId`, ya usado por `rend_vs_asiento`) antes que ampliar el contrato del registry para un caso que solo tiene este control.

---

## D-015 — Segmentación real de controles por cliente/sistema (los 10 de M4 quedan solo para Marval)

**Fecha:** 2026-07-31
**Contexto:** T4 (2026-07-29) construyó `scope`/`scopeMeta`/`appliesWhen` en las 11 entradas del registry, pero dejó los 11 en `scope: 'general'` — se ofrecían a cualquier cliente por igual. Guillermo pidió segmentación real: los 10 controles construidos contra reportes de M4 hoy sólo tienen sentido para Marval; un cliente nuevo no debería verlos. Además `ARCHITECTURE.md` §4 sólo define tres scopes (`general`/`convenio`/`cliente`) y no cubre "estándar del sistema de origen" (Meta4 vs Axton), que es justo lo que hacía falta para poder "promover" un control de Marval a general-de-Meta4 sin inventar nada nuevo.
**Decisión:**
1. Se agrega un cuarto scope, `'sistema'` (`scopeMeta.sourceSystems: ['meta4' | 'axton']`), documentado en `js/controls/scope.js` y `registry.js`. Ningún control lo usa todavía — es el mecanismo de "promoción" para cuando se confirme que un control de Marval aplica a cualquier cliente Meta4.
2. Los 10 controles de M4 pasan a `scope: 'cliente'`, `scopeMeta: { clients: ['MARVAL'] }` (constante `MARVAL_ONLY` en `registry.js`, para que "promover" uno sea cambiar una línea). `agrupadores` queda `scope: 'general'`.
3. La resolución de "¿este control se le ofrece a este cliente?" vive en un módulo nuevo (`js/controls/scope.js`), con precedencia **override de admin (`controlConfigs.status`) → scope/scopeMeta → `appliesWhen`**. El override de admin, que ya existía en el schema de T5 pero nadie leía, pasa a funcionar de verdad — es la vía de escape si una clasificación queda mal cargada.
4. Los controles que no aplican a un cliente se **ocultan del todo** (se retira la sección "Otros controles" que T4 había introducido colapsada). `controlsWizard.js`, `checklistView.js` y `#/admin` (columna "Aplica hoy") respetan la misma resolución.
**Alternativas descartadas:** Dejar los 10 controles en `scope: 'general'` con `appliesWhen` restringido por atributo (no hay un atributo de cliente que distinga "es Marval" de forma genérica — hubiera sido inventar un atributo ad-hoc para lo que ya es, literalmente, el `code` del cliente); mostrar los no aplicables colapsados en vez de ocultarlos (Guillermo prefirió ocultar; el override de admin ya cubre el caso de una regla mal cargada).
**Motivo:** El pedido es de negocio, no de código — "un cliente nuevo no debería ver la batería de Marval". El mecanismo de T4 ya estaba construido; faltaba clasificar de verdad y hacer que el override de admin, ya modelado desde T5, tuviera efecto real.

---

## D-016 — T10 ejecutado: cierre de la migración a `clientCode` (DB v6)

**Fecha:** 2026-07-31
**Contexto:** D-011 (2026-07-30) había dejado el cierre de la migración de `clientId` a `clientCode` como tajada opcional ("sólo si algo funcional lo pide"). Guillermo decidió hacerla igual, como deuda técnica preventiva, sin que hubiera un caso bloqueado hoy — `controlConfigs` (T5) ya convivía bien con `clientId` en el resto de las tablas.
**Decisión:**
1. Antes de escribir la migración se probó empíricamente (script descartable con `fake-indexeddb`) qué hace Dexie al cambiar la primary key de una tabla existente: tira `DexieError [UpgradeError]: Not yet support for changing primary key`. Esto **no está soportado**, a diferencia de agregar o quitar un índice secundario (probado también, funciona sin pérdida de datos).
2. Por eso `groupers`, `fileProfiles`, `sessions` y `controlRuns` (todas `++id`) migran agregando `clientCode` como índice nuevo y sacando `clientId` del índice — la primary key real (`++id`) no se toca, sólo cambia por qué campo se puede hacer `.where(...)`.
3. `clientCatalogs` es la excepción: su primary key hoy **es** `clientId` (no tiene `++id`). Por la limitación del punto 1, sigue siendo `clientId` la primary key real por dentro — se le agrega `clientCode` como índice secundario, y `getClientCatalog`/`saveClientCatalog`/`deleteClientCatalog` resuelven ese `clientId` internamente (vía `getClientByCode`) para que nada fuera de `db.js` tenga que saberlo.
4. Los 9 archivos que usaban `clientId` (`db.js` y las 8 pantallas que lo consumían) pasan a hablar en `clientCode` para estas 5 tablas. Las **rutas de la URL siguen usando el id numérico de siempre** (`#/controls/:clientId`, `#/client/:id/groupers`, etc.) — la conversión id→code pasa a ser interna, resuelta una vez por pantalla (`getClient(id)` seguido de `.code`), tal como preveía la spec.
**Alternativas descartadas:** Intentar cambiar la primary key de `clientCatalogs` de todos modos (Dexie lo rechaza en tiempo de upgrade — no es una opción, es una limitación de la librería); dejar `clientCatalogs` sin migrar nada (rompía la consistencia de "las 5 tablas hablan en `clientCode`" sin necesidad, ya que agregar el índice secundario alcanza).
**Motivo:** Repartir el riesgo real (cambiar primary keys) del riesgo aparente (agregar índices) — lo primero Dexie ni siquiera lo permite, lo segundo es una operación bien soportada y ya probada en este mismo repo (T2, T5). La spec completa queda en `specs/plan-v2-t9-t10.md`.

---

## D-017 — `.claude/skills/` y `.claude/settings.json` pasan a versionarse

**Fecha:** 2026-08-04
**Contexto:** Agregar un control nuevo toca 6 archivos en 4 capas (parser, `fileUpload.js`, `controlsWizard.js`, módulo del control, `registry.js`, test) más la cadena `test:unit` de `package.json`. Cuatro de esos puntos son cableado mecánico que no se deduce leyendo un solo archivo — el encabezado de `registry.js` documenta el contrato del registry pero no los 4 lugares de `fileUpload.js` ni el mapa `AUTO_DETECT` del wizard. En la práctica cada control nuevo se agregó copiando el anterior y descubriendo los olvidos por síntoma (la pill aparece pero el archivo no se puede subir, o se sube y no se auto-detectan las columnas). Además los patrones de UI que Willy fijó como criterio del proyecto (hero de diferencias, ocultar filas/columnas sin valor real — CLAUDE.md §11) vivían solo como pendientes anotados, sin un lugar que los exija al construir.
**Decisión:**
1. Se agrega `.claude/skills/nuevo-control/SKILL.md`: los 6 puntos de integración con referencias `archivo:línea` a la implementación de referencia (`nr.js`), los contratos de `run`/`summarize`/`renderResults`, los patrones de UI obligatorios, el mínimo de test exigido y una lista de errores concretos a no cometer (encabezada por "no consolidar por legajo", que da diferencias falsas en todo empleado con doble liquidación en el mes).
2. `.gitignore` pasa de `.claude/` a `.claude/*` con `!.claude/skills/` y `!.claude/settings.json`. La barra final impide re-incluir: con `.claude/` git no desciende al directorio y las negaciones no tienen efecto.
3. Se agrega `.claude/settings.json` con el allowlist de comandos del proyecto (los scripts de `package.json`, el runner `node --input-type=module`, `python3 -m http.server` para servir la app, y lecturas de git). Es el equivalente compartido de lo que cada uno iba aprobando a mano.
**Alternativas descartadas:** Dejar la guía como una sección más de `CLAUDE.md` (se lee siempre, en toda sesión, y agregar ~200 líneas de cableado de un control encarece cada conversación del repo — una skill se carga solo cuando el pedido la dispara); dejar la skill a nivel usuario y no versionarla (no la ve el resto del equipo, que es justo el punto); derivar el allowlist de los transcripts con el skill `fewer-permission-prompts` (los transcripts de Willy están en su máquina, no en el repo ni en el contenedor remoto — el allowlist se derivó de `package.json` y `.github/workflows/ci.yml`).
**Motivo:** El conocimiento de "cómo se agrega un control acá" estaba solo en la cabeza de quien lo hizo la vez anterior y en el diff del control previo. Escribirlo como skill lo pone donde se usa (al momento de construir, no al momento de leer docs) y lo versiona para el equipo.

---

## D-018 — Paso 1 del wizard: de una fila de pills a lista filtrable con badge de origen

**Fecha:** 2026-08-05
**Contexto:** D-015 clasificó los 11 controles por origen (`general`/`sistema`/`convenio`/`cliente`), pero el Paso 1 del wizard (`controlsWizard.js` → `renderStepControls`) seguía mostrándolos como una sola fila de pills sin ninguna marca de a qué universo pertenece cada uno. Con Marval (10 de los 11 controles) ya era una pared; iba a empeorar a medida que se promuevan controles a `scope: 'sistema'` y se agreguen clientes. Guillermo pidió explorar el ordenamiento con mockups interactivos y eligió: lista densa con panel lateral (qué archivos va a pedir el Paso 2) + filtro de origen y buscador por encima.
**Decisión:**
1. `js/controls/scope.js` gana `controlOrigin(ctrl, client)`: devuelve `{ tier, label }` para la UI. `tier` sólo tiene dos valores visuales (`'general'` | `'scoped'`) — **deliberadamente no usa los colores del semáforo de resultados** (ok/warn/error); el texto (`label`, ej. "Meta4", "MARVAL") es lo que distingue el origen puntual, no el color. Queda separado de `scopeLabel` (el texto largo que ya usaba `#/admin`).
2. `renderStepControls` deja de agrupar por bloques con expansión (`buildControlBlocks`/`renderBlockHtml`/`data-group`) y pasa a una lista plana de filas (`.ctrl-row`, un `<button>` por fila — un control con modos como Brutos aporta una fila por modo, con el modo como badge en vez de un pill que hay que expandir). Arriba, chips de filtro por origen (sólo los que ese cliente efectivamente tiene) + buscador por nombre/descripción. Al lado, un panel (reusa `.wizard-onepane`/`.wizard-section-label` del rediseño de Paso 2) que responde en vivo "¿qué controles vas a ejecutar?" y "¿qué archivos te van a pedir?" — hoy esa pregunta sólo se contestaba llegando al Paso 2.
3. Container pasa de `#js-control-pills` a `#js-control-rows`; la clase de fila activa pasa de `pill--active` a `ctrl-row--active` (`tests/e2e/controlsWizardScope.spec.js` y `agrupadoresControl.spec.js` actualizados — el `data-ctrl="<id>"` de cada fila no cambió).
**Alternativas descartadas:** Filtros + grilla de tarjetas sin panel lateral (mockup "C" — resuelve mejor a 30+ controles, pero con 11 el filtro sobra y no contesta la pregunta de archivos); rutinas guardadas ("cierre mensual" en un click — mockup "D", anotado como feature a futuro en CLAUDE.md §11: resuelve una pregunta distinta, "qué corro este mes", no el apilamiento en sí, y requiere una entidad nueva en IndexedDB).
**Motivo:** El pedido de Guillermo. El origen deja de ser información invisible y pasa a ser filtro; el panel lateral acorta el ida y vuelta entre Paso 1 y Paso 2.
