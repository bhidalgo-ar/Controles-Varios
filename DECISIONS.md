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

**Reconfirmado el 2026-08-13 (Willy).** Se le volvió a plantear como el único ítem con riesgo hacia afuera del inventario de escalabilidad. Respuesta: ya lo revisó y no hay exposición que preocupe; el repo pasa a privado y la app se hostea en otro lado más adelante, y ahí el seed real se muda. **No hay acción pendiente en el repo** — la entrada deja de figurar como decisión abierta en `specs/plan-escalabilidad-fases.md`.

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

**Cierre 2026-08-12 (decisión de Willy).** El hash **sale del código fuente**. Ahora la contraseña se
cambia desde un panel en `#/admin` ("🔑 Cambiar contraseña") y su hash queda en
`appConfig.adminPasswordHash` (IndexedDB del navegador). La contraseña la elige Willy, nunca un agente, y
no vuelve a quedar escrita en un repo público. La del código queda como **contraseña de arranque**: sirve
sólo mientras ese navegador no tenga una propia guardada —así ningún navegador del equipo queda afuera— y
mientras se use, la pantalla lo avisa y ofrece cambiarla. Mínimo 12 caracteres.

**Lo que Willy pidió y no se puede hacer, con el motivo:** que la app le mande la contraseña por mail a
`gesposito@bhidalgo.com.ar` y la vaya rotando por apertura. Las dos cosas necesitan un servidor: uno que
guarde la credencial del correo (en una página estática iría en el mismo repo público donde ya estaba el
hash, o sea peor que el problema que resuelve) y uno que sepa cuál es la clave vigente en cada apertura —
un navegador no puede coordinar eso con otro. Sumar un servicio de mail de terceros tampoco entra: la app
no tiene dependencias de runtime más allá de los CDN de `index.html` (CLAUDE.md).

Si eso se quiere de verdad, el camino es el que ya está en el ROADMAP: mudar el hosting de GitHub Pages a
infraestructura de H&A, y ahí sí un endpoint mínimo puede mandar un código de un solo uso por mail. Es
trabajo de v4 (backend real), no algo que se pueda encajar en la app de hoy.

**Se descartó también** un script de línea de comandos (`tools/hash-admin-password.mjs`, escrito y borrado
el mismo día): calculaba el hash sin que la contraseña pasara por un chat, pero obligaba a Willy a abrir
una terminal para rotar una clave, que es exactamente la fricción que hizo que el tema quedara abierto seis
semanas. Un panel en la pantalla que ya está abierta no tiene ese problema.

**Límite que sigue en pie:** la contraseña guardada es **por navegador**. No viaja en el seed a propósito —
un seed es un archivo que se manda por SharePoint y se importa a mano, así que meter ahí el hash de acceso
lo reparte en un archivo que circula por mail, que es el mismo problema con más pasos. Cada navegador del
equipo la define una vez.

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

## D-018 — CONTA admite subir varios archivos en Rendimiento vs Asiento

**Fecha:** 2026-08-05
**Contexto:** Todos los `additionalFiles` del wizard siguen el mismo patrón desde el bootstrap: un archivo por slot (`initFileUploadStep` en `js/ui/fileUpload.js`). Marval necesita juntar varios meses de Contabilidad Desglosada (CONTA) en una sola corrida de "Rendimiento vs Asiento", y no hay ningún control que necesite eso hoy con otro tipo de archivo.
**Decisión:**
1. `initFileUploadStep` bifurca al principio: si `fileType === 'conta_file'` delega en una función nueva, `initContaMultiUpload`, en vez de generalizar el patrón de un-archivo-por-slot para todos los tipos. El resto de los `additionalFiles` (incluido `cc_x_ee_file`, el otro archivo de este mismo control) no cambia.
2. `initContaMultiUpload` mantiene una lista de `entries` (`{ fileName, parsedRows, parseMetadata }`, uno por archivo subido) y expone una sola zona de drop que acepta selección/arrastre múltiple y sigue aceptando más archivos después de la primera carga; cada entry tiene su botón "✕ Quitar". El objeto que se le devuelve al wizard (`data.parsedRows`, `.parseMetadata`, `.fileName`) tiene la misma forma que el de un archivo único — el resto del pipeline (`runRendVsAsiento`, `saveControlRunFile`, etc.) no sabe que hubo más de un archivo.
3. `mergeContaFiles` (`js/parsers/contaExcel.js`) concatena las filas parseadas de todos los archivos y detecta filas idénticas entre archivos *distintos* comparando el `JSON.stringify` de la fila completa — incluye `ID_CONTA`, así que dos meses con el mismo empleado/concepto/importe recurrente no matchean (cada corrida contable de M4 tiene su propio `ID_CONTA`), pero subir el mismo archivo dos veces por error sí se detecta. Repeticiones dentro de un mismo archivo no cuentan como duplicado cruzado. El resultado es un aviso no bloqueante (`parseMetadata.duplicates`), nunca un error.
4. El guard existente en `controlsWizard.js` (`prev !== data`, para re-renderizar el editor de mapeo cuando cambia CONTA) sigue funcionando sin tocarlo: `initContaMultiUpload` reusa la misma referencia de `data` cuando sólo se está re-mostrando el estado ya cargado, y crea una referencia nueva únicamente cuando el usuario agrega o quita un archivo.
**Alternativas descartadas:** Generalizar `additionalFiles` en el registry para que cualquier archivo pueda declararse `multiple: true` (más flexible, pero hoy ningún otro control lo necesita y el mecanismo de mapeo de columnas de los archivos "no fijos" no está pensado para múltiples headers distintos a la vez — se puede migrar a esto después si aparece un segundo caso real); pedir que el usuario combine los meses en un solo Excel antes de subirlo (le devuelve a Marval un paso manual que la herramienta existe justamente para evitar).
**Motivo:** Resolver el caso real (CONTA de Marval en Rendimiento vs Asiento) sin generalizar un mecanismo que hoy sólo tiene un consumidor.

---

## D-019 — Paso 1 del wizard: de una fila de pills a lista filtrable con badge de origen

**Fecha:** 2026-08-05
**Contexto:** D-015 clasificó los 11 controles por origen (`general`/`sistema`/`convenio`/`cliente`), pero el Paso 1 del wizard (`controlsWizard.js` → `renderStepControls`) seguía mostrándolos como una sola fila de pills sin ninguna marca de a qué universo pertenece cada uno. Con Marval (10 de los 11 controles) ya era una pared; iba a empeorar a medida que se promuevan controles a `scope: 'sistema'` y se agreguen clientes. Guillermo pidió explorar el ordenamiento con mockups interactivos y eligió: lista densa con panel lateral (qué archivos va a pedir el Paso 2) + filtro de origen y buscador por encima.
**Decisión:**
1. `js/controls/scope.js` gana `controlOrigin(ctrl, client)`: devuelve `{ tier, label }` para la UI. `tier` sólo tiene dos valores visuales (`'general'` | `'scoped'`) — **deliberadamente no usa los colores del semáforo de resultados** (ok/warn/error); el texto (`label`, ej. "Meta4", "MARVAL") es lo que distingue el origen puntual, no el color. Queda separado de `scopeLabel` (el texto largo que ya usaba `#/admin`).
2. `renderStepControls` deja de agrupar por bloques con expansión (`buildControlBlocks`/`renderBlockHtml`/`data-group`) y pasa a una lista plana de filas (`.ctrl-row`, un `<button>` por fila — un control con modos como Brutos aporta una fila por modo, con el modo como badge en vez de un pill que hay que expandir). Arriba, chips de filtro por origen (sólo los que ese cliente efectivamente tiene) + buscador por nombre/descripción. Al lado, un panel (reusa `.wizard-onepane`/`.wizard-section-label` del rediseño de Paso 2) que responde en vivo "¿qué controles vas a ejecutar?" y "¿qué archivos te van a pedir?" — hoy esa pregunta sólo se contestaba llegando al Paso 2.
3. Container pasa de `#js-control-pills` a `#js-control-rows`; la clase de fila activa pasa de `pill--active` a `ctrl-row--active` (`tests/e2e/controlsWizardScope.spec.js` y `agrupadoresControl.spec.js` actualizados — el `data-ctrl="<id>"` de cada fila no cambió).
**Alternativas descartadas:** Filtros + grilla de tarjetas sin panel lateral (mockup "C" — resuelve mejor a 30+ controles, pero con 11 el filtro sobra y no contesta la pregunta de archivos); rutinas guardadas ("cierre mensual" en un click — mockup "D", anotado como feature a futuro en CLAUDE.md §11: resuelve una pregunta distinta, "qué corro este mes", no el apilamiento en sí, y requiere una entidad nueva en IndexedDB).
**Motivo:** El pedido de Guillermo. El origen deja de ser información invisible y pasa a ser filtro; el panel lateral acorta el ida y vuelta entre Paso 1 y Paso 2.

---

## D-020 — Los entregables que van a Finanzas no llevan información de HR

**Fecha:** 2026-08-05
**Contexto:** Al diseñar el reporte de Acreditaciones (D-021) se propusieron para la hoja `CONTROL` del .xlsx una columna con la cantidad de empleados por lista y un bloque de excepciones (los empleados que están en el listado de pago sin importe). Guillermo rechazó las dos: el archivo de acreditaciones lo recibe Finanzas/tesorería del cliente, y **en varios clientes Finanzas no tiene acceso a información de HR**. Hasta ahora todos los controles generaban archivos para el equipo de Payroll, así que la distinción no había aparecido.
**Decisión:**
1. Cuando el archivo que genera un control está destinado a Finanzas/tesorería del cliente (y no al equipo de Payroll), **no incluye información de HR**: dotación, conteos de empleados, altas/bajas, comparaciones de headcount entre períodos, excepciones por empleado, ni atributos del empleado (jornalizado/mensualizado, centro de costo, puesto). Va sólo lo necesario para ejecutar el pago: legajo, nombre, CUIT, CBU, banco, importe y fecha.
2. Eso **no** significa perder la información: se muestra en la pantalla de resultados de la app, que la ve el analista de H&A. En Acreditaciones ahí viven el conteo por lista, las alertas de integridad, el corte por banco y las filas sin asignar.
3. Los controles cuyo entregable es para Payroll (Brutos, GS Pers, NR, etc.) no cambian: siguen exportando lo que exportan.
4. La regla quedó escrita en `CLAUDE.md` §6.5 (se lee en toda sesión) y en el skill `nuevo-control` (se lee al construir el próximo control), no sólo acá.
**Alternativas descartadas:** Dejar la decisión a criterio de quien construye cada control (es justo el criterio que no se puede reconstruir mirando el código, y el costo de equivocarse es mandarle a Finanzas de un cliente información que no debería ver); dos exports por control, uno "interno" y uno "para el cliente" (duplica la superficie de export de cada control para un caso que hoy tiene un solo consumidor — se puede hacer si aparece un segundo).
**Motivo:** Pedido explícito de Guillermo, con el pedido adicional de dejarlo registrado como guardrail para los próximos controles.

---

## D-021 — Control Acreditaciones: primer control sobre un archivo de Axton

**Fecha:** 2026-08-05
**Contexto:** Los 11 controles existentes cruzan reportes de Meta4 (10 de ellos scopeados a Marval, D-015) y el adaptador Axton quedó fuera de alcance en PLAN_v2 §0.3. Guillermo pidió un control de Acreditaciones a partir del export `contacred` de Axton, arrancando por Plastic Omnium Pilar pero con la intención explícita de que aplique a todo el espectro Axton, porque ese archivo tiene el mismo formato en todas las cuentas de Axton. Se reconstruyeron las reglas contra dos archivos reales del mismo período: el export crudo y el reporte que el equipo armaba a mano.
**Decisión:**
1. El control entra directo como `scope: 'sistema'` con `sourceSystems: ['axton']` — lo ven los 8 clientes Axton — y no como `scope: 'cliente'` de POP. Es la primera entrada del registry que se ofrece a clientes Axton además de `agrupadores`, y **no abre el adaptador Axton**: es un control puntual sobre un archivo puntual, sin Tabulado (`tabRequired: false`).
2. Arranca con el modo "Generar Reporte" (`acreditaciones_reporte`), declarado con `group: { id: 'acreditaciones', mode: 'Generar Reporte' }` para que el modo "Controlar" (cruce contra el Tabulado, todavía sin definir) entre después como segunda entrada del mismo grupo sin renombrar nada.
3. `acreditaciones_file` va con `FIELD_DEFS: []`, como `conta_file` y `cc_x_ee_file`: el formato es fijo, el parser resuelve las columnas por nombre (tolerando acentos, mayúsculas y espacios duros) y tira un error en español nombrando las columnas que faltan si el archivo no es el esperado. No hay mapeo manual de columnas ni auto-detección en el wizard.
4. **La consolidación por legajo, que es obligatoria en todos los otros controles, acá no se aplica a propósito.** La unidad del reporte es la acreditación, no el empleado-mes: un legajo con anticipo + quincena + mensual tiene tres acreditaciones en tres listas distintas y sumarlas sería el bug, no lo contrario. El test lo cubre como regresión.
5. La agrupación de las hojas es por **(tipo de liquidación normalizado, fecha de acreditación)**, no por el número de `Listado` de Axton: los listados "rio" y "otros" del mismo pago se mergean, y un mismo listado con dos liquidaciones se parte en dos hojas. Los tipos se normalizan por patrón sobre el texto crudo, con fallback a la etiqueta limpia — nunca se descarta una acreditación por no reconocer su tipo.
6. Las filas sin fecha de acreditación heredan la de su liquidación **sólo si esa liquidación tiene una única fecha** en el archivo; si tiene varias van a una hoja `SIN ASIGNAR` con alerta. Deliberadamente no se replican las reclasificaciones de criterio del analista (en el archivo de referencia, un anticipo sin fecha había sido movido a mano a la hoja de 1era Quincena).
7. El cierre de la hoja `CONTROL` va con fórmulas de Excel, salvo el "Total archivo Axton", que es un literal leído del origen: si fuera una fórmula sobre nuestras propias hojas la diferencia daría cero siempre y no probaría nada.
**Alternativas descartadas:** Scopearlo a POP y promoverlo después (Guillermo confirmó el formato común de Axton en la misma conversación, así que el paso intermedio no aportaba); agrupar por número de `Listado` (no reproduce el archivo real: ni el merge de rio/otros ni el corte por liquidación dentro de un mismo listado); inferir la fecha de las filas huérfanas por proximidad o por el resto del mes (adivina un criterio que es del analista).
**Motivo:** El reporte se armaba a mano todos los meses. Las reglas reconstruidas reproducen el archivo de julio de POP al centavo (14 listas, cierre 0,00) — ver `specs/control-acreditaciones-axton.md`.

---

## D-022 — El reporte de Variaciones de OPmobility va como HTML standalone, fuera de la app de controles

**Fecha:** 2026-08-06
**Contexto:** El documento base validado por Gaby y Guille pide un HTML con exportación a PDF que compare el tabulado de OPmobility de dos períodos y muestre la variación por empleado de determinados conceptos. La batería de controles de la app (`index.html` + `CONTROL_REGISTRY`) cruza un reporte contra el Tabulado del período y guarda todo en IndexedDB por sesión; acá el cruce es Tabulado contra Tabulado de **dos períodos distintos**, el consumidor del entregable es un PDF para el cliente, y el pedido explícito es que el mes siguiente alcance con subir un solo archivo.
**Decisión:**
1. Entra como `reportes/opmobility-variaciones.html`, **un solo archivo standalone** que se abre con doble click: sin ES modules, sin SheetJS ni Dexie, sin build. El tabulado ya es HTML, así que se parsea con `DOMParser` — no hace falta ninguna librería.
2. **No** se agrega al `CONTROL_REGISTRY`. El modelo de sesión de la app (un período, un Tabulado, resultados en IndexedDB) no representa una comparación entre dos períodos, y forzarlo implicaría tocar el wizard, el schema y el scope por cliente para un entregable que es un PDF, no una pantalla de control.
3. Persistencia en **`localStorage` del período completo** (empleados y valores de los conceptos configurados, no el tabulado crudo), más export/import JSON para mover el histórico entre máquinas. El JSON tiene datos de empleados: se avisa al exportar, igual que con el export de sesión de la app.
4. Los conceptos se matchean **por código del `<th>`**, nunca por posición de columna: la cantidad de columnas del tabulado cambia entre meses. La fila `TOTAL GENERAL` (con `colspan=3`, corrida 2 columnas) se usa **sólo para validar sumas**, y la validación se muestra como aviso en pantalla.
5. Con período anterior en 0 el porcentaje se informa **`s/base`**, no 100%: un aumento desde cero no tiene variación porcentual y mostrar 100% invita a leerlo como "duplicó".
6. Los patrones de UI del proyecto que sí aplican se aplican: hero de empleados con y sin diferencia (§11.2), y el filtro de ocultar filas sin valor real (§11.1) **apagado por defecto**, porque el documento base pide explícitamente que el empleado sin dato en un mes se muestre en 0,00.
**Alternativas descartadas:** Meterlo como control de la app con `mode: 'Generar Reporte'` (el registry no modela dos períodos y el entregable no es un .xlsx para Payroll); generar el PDF con una librería (pdf.js no genera, y sumar jsPDF/html2pdf rompe la regla de cero dependencias del proyecto — la impresión del navegador con `@page { size: A4 landscape }` da el mismo resultado); guardar el tabulado crudo en lugar del período parseado (pesa ~1 MB por archivo y no cabe en `localStorage` a los pocos meses).
**Motivo:** Pedido del documento base (`specs/reporte-variaciones-opmobility.md`), reconstruido y verificado contra los dos tabulados reales de muestra.

---

## D-023 — Variaciones entra a la app: soporte de Tabulado HTML y comparación entre dos períodos

**Fecha:** 2026-08-06
**Contexto:** En D-022 el reporte de Variaciones de OPmobility quedó como HTML standalone, fuera del `CONTROL_REGISTRY`. Guillermo lo buscó en la pantalla de Controles de Plastic Omnium Florida y no estaba, y confirmó que ahí es donde tiene que estar. Además confirmó que el tabulado de OPmobility **es el mismo archivo** que se carga en el paso "Tabulado" de la app para ese cliente.
**Decisión:**
1. **Soporte de Tabulado HTML en el paso de Tabulado** (`js/parsers/tabuladoHtml.js`). Se verificó que hoy la app no puede leer ese archivo: SheetJS no lo reconoce como HTML, lo lee como texto plano y lo parte por las comas de los atributos `style=`, así que la primera "columna" termina siendo el `<span>` del encabezado. `parseTabuladoControl` y `detectHeaders` detectan el formato (`isHtmlTabulado`) y derivan a la rama HTML; el resto de la app no cambia. Para los clientes que traen un Excel real la rama vieja queda intacta, porque la detección mira el contenido.
2. El parser va con **expresiones regulares y no con DOMParser**, para que el mismo código corra en el navegador y en los tests de Node (que no tienen DOM).
3. `autoDetectTabMapping` pasa a aceptar **varios nombres por columna** (`EMPLEADO` o `LEGAJO`, etc.). Con eso el Tabulado de OPmobility se auto-detecta solo y el analista no tiene que mapear columnas a mano.
4. **Dos entradas del registry** (`variaciones_sueldos` y `variaciones_conceptos`) bajo el mismo `group` "Variación entre períodos", con `scope: 'cliente'` de `POF`: los códigos 899999/1000/2517/2519 son de la liquidación de este cliente. Se promueve a `'sistema'` cuando se confirme contra un segundo cliente (mismo camino que D-015).
5. **El período anterior lo resuelve el wizard, no el control.** Antes de llamar a `run()` busca el Tabulado de la corrida del mes anterior del cliente (`getRunFileFromPeriod`, sobre `controlRunFiles`, que ya guardaba las filas parseadas por período) y lo pasa por `mapping.variacionesPrev`. Si ese mes no se corrió, el control lo pide como archivo adicional **opcional** (`tab_prev_file`) y avisa. Así `run()` sigue siendo sincrónico y testeable, y el analista sube un solo archivo por mes en el caso normal.
6. **`null` vs `0` según el destino:** en pantalla, un empleado sin el concepto liquidado en un período muestra `—` (convención del proyecto: `null` es "sin dato"); en el PDF que va al cliente muestra `0,00`, como pide el documento base del reporte.
7. En pantalla, con el filtro en "solo con variación" el pie de tabla dice **"TOTAL de las filas mostradas"** y no "TOTAL GENERAL": el TOTAL GENERAL del reporte es sobre toda la dotación, y usar la misma etiqueta para la suma de un subconjunto invita a leer mal el número. El PDF siempre lleva el total de todos los empleados.
**Alternativas descartadas:** Ampliar el parser de `tab_control` sin detección de formato, tratando el archivo de POF como el caso normal (rompería a los 11 controles existentes de clientes con Excel real); hacer `run()` asíncrono para que el propio control lea IndexedDB (rompe el contrato del registry y hace los tests dependientes de la base); pedir siempre los dos tabulados (es una carga extra por mes que el dato ya guardado hace innecesaria).
**Motivo:** Pedido explícito de Guillermo, que corrige el alcance de D-022. El HTML standalone de `reportes/` queda como está: sirve para correr el reporte sin la app y sin cargar el histórico del cliente.

---

## D-024 — Aclaración de nombres: OPmobility es el nombre nuevo de Plastic Omnium; Pilar y Florida son clientes únicos

**Fecha:** 2026-08-06
**Contexto:** D-022/D-023 documentan el reporte de Variaciones usando indistintamente "OPmobility" y "Plastic Omnium Florida" para el mismo cliente (`POF`), sin dejar explícito en ningún lugar del repo que **OPmobility es el nombre comercial nuevo del grupo Plastic Omnium** — el tabulado que llega de este cliente ya trae "OPmobility" en su encabezado (`EA: OPmobility C-Power Argentina S.A.`), mientras que el resto de la documentación (`ARCHITECTURE.md`, `ROADMAP.md`, `PLAN_v2.md`, D-021) sigue nombrando "Plastic Omnium Pilar" para el cliente de Axton. Guillermo confirmó que **Pilar y Florida son dos sedes que el equipo trata como clientes únicos** (códigos distintos, complejidad y consultor distintos), y que el rebrand a OPmobility aplica al grupo completo, no sólo a Florida.
**Decisión:**
1. Queda anotado que **Plastic Omnium = OPmobility** (mismo grupo, nombre comercial actualizado) y que eso **no cambia** la separación en dos clientes del sistema: `POP` (Plastic Omnium Pilar, Axton, `contacred`) y `POF` (Plastic Omnium Florida, Meta4, tabulado HTML) siguen siendo clientes únicos e independientes en `hya-controles-config.seed.json`, cada uno con su propio scope, sus propios controles y su propio histórico. Nada del código ni de los controles cambia por esta entrada — es una aclaración de nomenclatura, no un cambio de dato ni de scope.
2. En textos nuevos sobre este cliente, usar "OPmobility C-Power Argentina S.A." (o "OPmobility Florida" si hace falta distinguirlo de Pilar) para el `POF`, y "OPmobility Pilar" o "Plastic Omnium Pilar" indistintamente para el `POP` — ambos nombres son válidos porque el tabulado/`contacred` de Pilar todavía puede traer el nombre viejo.
3. **No se tocan los campos `name` del seed** (`"Plastic Omnium Pilar"`, `"Plastic Omnium Florida"`) en esta entrada: son datos reales que ve todo el equipo en el selector de cliente de la app, y renombrarlos es un cambio de UI/negocio que se hace desde el modo admin cuando Guillermo lo pida explícitamente, no como consecuencia de una aclaración de documentación.
**Alternativas descartadas:** Renombrar ya los `name` del seed a "OPmobility Pilar" / "OPmobility Florida" (cambia lo que ve todo el equipo sin que se haya pedido; el pedido fue "revisá que esté anotado", no "renombrá los clientes").
**Motivo:** Pedido explícito de Guillermo — evitar que una sesión futura interprete "OPmobility" y "Plastic Omnium" como dos empresas distintas, o que confunda Pilar con Florida.

---

## D-025 — Acreditaciones: ancla de fecha por Listado, alertas unificadas por grupo, asignación manual

**Fecha:** 2026-08-06
**Contexto:** El export de agosto de Plastic Omnium Pilar mostró un caso que el archivo de julio no tenía: un Listado completo (18336, 13 empleados) sin **ninguna** fecha de acreditación conocida en todo el archivo. Con la regla de D-021 (heredar la fecha por el texto crudo de la liquidación, ambiguo cuando esa liquidación tiene varias fechas en el mes), esas 13 filas caían en `SIN ASIGNAR` — correctamente detectadas, pero como **13 alertas idénticas**, una por empleado, en vez de un solo problema a resolver. Guillermo pidió unificarlas y agregar una forma de asignar la fecha a mano y regenerar el reporte.
**Decisión:**
1. **Se cambia el ancla principal de "texto de la liquidación" a "Listado".** Un Listado es la unidad real del banco: si algún empleado de ese Listado tiene fecha, todos la comparten. `buildReport()` construye `datesByListado` (Map de Listado → fechas conocidas entre sus filas) y, para una fila sin fecha, primero intenta resolver por su Listado; sólo si la fila **no tiene Listado** cae al fallback anterior (fecha única por texto crudo de liquidación, sin distinguir Listado) — necesario para casos como el anticipo suelto de NEIRA (D-021), que no tiene Listado que lo ancle.
2. **Los grupos pendientes se agrupan por la misma clave que se usó para intentar resolverlos** — `L:<listado>` o `Q:<liquidación cruda>` — en vez de quedar como filas sueltas. `results.sinAsignar` pasa de ser un objeto único `{rows, total, count}` a un **array de grupos**, cada uno con su propio `count`/`total`. La alerta correspondiente (`tipo: 'sin_asignar'`) es una por grupo, no una por fila — dice "Listado 18336 — 13 empleados", no 13 líneas idénticas.
3. **Asignación manual con regeneración instantánea, sin volver a cargar el archivo.** `buildReport(rows, cfg, ...)` es una función pura de las filas ya tipadas + `cfg.dateOverrides` (Map de `anchorKey → 'YYYY-MM-DD'`) — no muta `rows`, así se puede volver a invocar con otro `dateOverrides` cuantas veces haga falta. `assignAcreditacionesDate(results, groupKey, isoDate)` y `unassignAcreditacionesDate(results, groupKey)` recomputan el reporte completo a partir de `results._rows`/`_cfg` (guardados en el resultado de `run()` con prefijo `_` para señalar que son estado interno, no parte del contrato público del control). La pantalla de resultados usa un patrón `draw(res)` que reconstruye todo el DOM y vuelve a llamarse a sí misma tras cada asignación/deshecho — el botón "Exportar" queda siempre atado al resultado más reciente.
4. **La asignación manual usa la misma regla de agrupación que las fechas del archivo:** si la fecha asignada coincide con el tipo+fecha de una lista ya existente, el grupo se mergea ahí (con su Listado sumado a la columna `Listado` de esa lista); si no, forma una lista nueva. No hay lógica especial para "fechas asignadas a mano" en el paso de agrupación — sólo en el paso de resolución de fecha, antes de agrupar.
5. **No se persiste entre sesiones.** Las fechas asignadas a mano son una corrección puntual de este run, no una configuración del cliente — un Listado/liquidación nueva aparece cada mes con un número distinto, así que no hay nada reusable de un período a otro. Si el analista cierra la pantalla sin exportar, se pierde (igual que cualquier ajuste manual sobre un run no persistido).
**Alternativas descartadas:** Mantener el ancla por texto de liquidación y sólo agrupar las alertas visualmente (no resuelve el problema real — seguiría fallando en resolver Listados con una sola fecha cuando el texto de la liquidación tiene varias en el mes, un caso más común que el que motivó esto); persistir los `dateOverrides` en `controlConfigs` por cliente (no tiene sentido: la clave `L:<listado>` es específica del archivo de este mes, nunca se repite).
**Motivo:** El pedido explícito de Guillermo. Verificado contra dos archivos reales: julio de POP sigue dando las mismas 14 listas y el mismo cierre en 0,00 (sin regresión), y agosto de POP pasa de 13 alertas sueltas a 1 grupo asignable, que al asignarle la fecha correcta mergea con la lista existente y el cierre sigue en 0,00.

---

## D-026 — Control Acumuladores Ganancias (Axton): entrada de N archivos sin tocar el contrato del registry, y solapas como patrón nuevo de pantalla

**Fecha:** 2026-08-06
**Contexto:** Guillermo pidió el control Acumuladores Ganancias de Axton (segundo control Axton después de Acreditaciones, D-021): genera, desde los crudos `repacumuladores`, el archivo mensual que hoy el analista arma a mano con dos tablas dinámicas encadenadas y un VLOOKUP por mes. Es lo primero del proyecto que necesita **una cantidad variable de archivos del mismo tipo** (un crudo por cada mes de la ventana del SAC teórico — 2 para RG 4030, hasta 8 para RG 4003), y Guillermo pidió que la pantalla de resultados siguiera el patrón visual del motor SIRADIG F572 de H&A: tira de KPIs, solapas y tablas paginadas — algo que el proyecto tampoco tenía todavía.

**Decisión:**
1. **No se extendió el contrato de `additionalFiles`.** La spec original planteaba un flag `multi: true` nuevo en el registry (`state.controlFiles[id][key]` pasando de objeto a array), pero D-018 ya había resuelto exactamente este problema para Contabilidad Desglosada (`initContaMultiUpload` en `js/ui/fileUpload.js`): un `fileType` especial acepta selección/arrastre múltiple, parsea cada archivo por separado y entrega al resto de la app un único `fileData` fusionado. Acumuladores reusa el mismo mecanismo (`initAcumuladoresMultiUpload`) en vez de tocar `canGoNext`/`executeControls`/`saveControlRunFile` en `controlsWizard.js` — el control sigue siendo, para el wizard, un `additionalFiles` de un solo slot como cualquier otro.
2. **Diferencia con CONTA: cada archivo lleva además un período propio (`'YYYY-MM'`).** El nombre del crudo (`repacumuladores.20260728.102501`) trae la fecha de *generación*, que no siempre cae en el mes de los datos. `initAcumuladoresMultiUpload` infiere el período del nombre como punto de partida y lo deja editable con un `<input type="month">` por archivo cargado — el analista lo corrige si no corresponde. Las filas de cada archivo salen tageadas con `_period`/`_fileName`; `acumuladoresGanancias.js` agrupa por `_period`, no por archivo — no le importa cuántos crudos hubo, sólo qué período tiene cada fila. Un archivo sin período asignado hace que `run()` devuelva `{ error }` en vez de ejecutar con datos ambiguos.
3. **El toggle RG 4003 / RG 4030 y el override de códigos de acumulador van en el bloque de configuración del control**, en el mismo lugar del Paso 2 donde ya viven los de Rendimiento vs Asiento, Agrupadores y Acreditaciones (`renderAcumuladoresConfigEditor`, cableado igual que `acreditacionesConfig`). No hay paso nuevo del wizard. El régimen sólo **valida** la ventana esperada contra los períodos subidos (avisa si falta o sobra un mes) — no recorta nada.
4. **Códigos de acumulador (1100–1150) hardcodeados como default, con override por cliente persistido** en `controlConfigs` (`acumuladores_config`, mismo mecanismo que `acreditaciones_config`) — todavía no se confirmó si otra cuenta Axton numera distinto, y el override cubre ese caso sin necesitar un segundo release.
5. **Nuevo componente reusable `js/ui/tabs.js`** (`initTabs`, patrón WAI-ARIA tabs — `role=tablist/tab/tabpanel`, navegación con flechas/Home/End, paneles perezosos y cacheados). Es la primera vez que el proyecto necesita solapas en una pantalla de resultados; hasta ahora el idioma para segmentar contenido era `<details open>` (`catXEmpleados.js`, `rendVsAsiento.js`). Se usa para las dos tablas del control (`MM-AAAA` y `DATOS`), y queda disponible para el resto de los controles.
6. **Patrones de `nuevo-control` que no aplican, documentados como excepción explícita en la spec**: hero de diferencias, semáforo y early-return verde no tienen sentido en un control de generación (no hay nada contra qué comparar, `status: 'info'` siempre salvo error). Sí aplican: ocultar filas/columnas sin valor real, paginación, buscador, export único al final (no uno por tabla) y `esc()` en todo lo interpolado.
7. **Un legajo sin movimiento en el mes de proceso desaparece de la tabla en pantalla** (con un KPI que cuenta cuántos quedaron afuera) **pero se incluye en el `.xlsx` en cero** — a diferencia del criterio general del proyecto ("mostrar sólo lo que tiene valor real"), acá el entregable es el archivo que reemplaza el armado manual y tiene que traer la nómina completa, aunque la pantalla se filtre para que se revise mejor.

**Alternativas descartadas:** Extender `additionalFiles` con `multi: true` como planteaba la spec original (funciona, pero duplica un mecanismo que D-018 ya resolvió para CONTA, tocando cuatro puntos de `controlsWizard.js` para un problema que ya tenía solución); un paso nuevo del wizard para la configuración RG 4003/4030 (más reutilizable a futuro, pero ningún otro control lo necesita hoy y el bloque dentro del Paso 2 ya es el patrón vigente); mostrar los legajos sin movimiento también en pantalla, en cero, para no romper la regla general de "ocultar sin valor real" (con ~308 legajos y sólo unos pocos sin movimiento, la tabla se llena de filas que no aportan nada al analista — el KPI de conteo ya avisa que existen).
**Motivo:** Pedido explícito de Guillermo (`ControlAcumuladoresGanancias.md`, `ReferenciaPatronSiradig.md`), con la reconciliación entre el patrón visual pedido (SIRADIG) y los patrones obligatorios de `CLAUDE.md` §11 resuelta como parte de esta decisión.

---

## D-027 — La Fase 1 de Acumuladores Ganancias reusa `js/ui/resultBlocks.js` en vez de duplicar CSS/markup propio

**Fecha:** 2026-08-07
**Contexto:** Con la spec de Fase 1 de Acumuladores Ganancias ya escrita (`specs/acumuladores-fase1-verificacion.md`) pero sin implementar, se mergeó PR #83: generaliza a los otros 9 controles el mismo lenguaje visual de veredicto + tiles + casos para revisar + chequeos de coherencia + planilla con sticky, sacándolo a un módulo compartido nuevo, `js/ui/resultBlocks.js` (construido *sobre* `js/ui/tabs.js` de D-026). PR #83 excluyó a propósito a Acumuladores Ganancias y a Variación entre períodos ("Willy los está encarando por otro lado"), así que no hay conflicto de código — pero la spec de Fase 1, tal como estaba escrita, iba a reconstruir a mano exactamente lo que `resultBlocks.js` ya resuelve.
**Decisión:**
1. La spec de Fase 1 se actualiza (antes de empezar a codear) para que el Panel de Verificación (Dirección A) use `renderVerdict`/`renderTiles`/`renderIssues`/`renderChecks` de `resultBlocks.js`, y la Planilla (Dirección C) use `enhanceGrid()` para el sticky, en vez de CSS `rb-*` propio duplicado.
2. **Se mantienen 3 tabs (Resumen · Fichas · Planilla), no 2 (Resumen/Detalle) como el resto de los controles** — Guillermo pidió explícitamente las tres direcciones como vistas separadas (panel de verificación, fichas expandibles por legajo, planilla). Se arma con `initTabs` directamente, no con `renderResumenDetalle()` (que asume exactamente 2 tabs). Es una desviación deliberada del patrón de PR #83, documentada en el propio módulo del control.
3. `diffCellHtml`/`mvArrow`/`fmtSigned` de `resultBlocks.js` no se usan: son para variación con signo entre dos valores (comparación), y Acumuladores es un control de generación sin ese concepto.
4. `resultBlocks.js`/`tabs.js` quedan marcados en la spec como "puede leer/importar, no modificar sin consultar" — son compartidos por los 9 controles de PR #83 más este; cualquier cambio ahí impacta producción ya desplegada.
**Alternativas descartadas:** Ignorar `resultBlocks.js` y seguir con la spec original tal cual estaba escrita (duplica CSS/lógica que ya existe, dos implementaciones del mismo patrón visual divergiendo con el tiempo); forzar Acumuladores al patrón de 2 tabs de los otros 9 controles (no representa el pedido real de Guillermo — B y C son dos formas genuinamente distintas de ver el detalle, no una sola tabla).
**Motivo:** Evitar mantener dos implementaciones del mismo patrón (una en `resultBlocks.js`, otra hecha a mano en `acumuladoresGanancias.js`) cuando la primera ya está en producción y validada por 9 controles.

---

## D-028 — Rediseño de la pantalla de Variación entre períodos: escalón, causas y matriz de transición

**Fecha:** 2026-08-07
**Contexto:** La pantalla de resultados de `variaciones_sueldos`/`variaciones_conceptos` (D-023) mostraba una tabla de variación en pesos y listo. Analizando los dos tabulados reales de OPmobility (2ª quincena marzo y abril 2025) salieron tres hallazgos que la tabla no mostraba: el premio de progreso (`2517`) no es un importe libre, se paga en **escalones fijos** (0/50%/70%/100% de una base); 14 de los 23 empleados que bajaron de escalón **no tienen ninguna licencia, ausencia, franco ni permiso cargado** que lo explique; y el reporte de Variación Sueldos (`899999`+`1000`) da **0,00 en los 71 empleados los dos meses**, porque `899999` es el valor de escala de la categoría (4 valores fijos en toda la planta), no un sueldo. Se explora el rediseño en tres direcciones visuales (`https://claude.ai/code/artifact/a69789a0-65e7-4b43-84af-b06a9c448491`), validadas por Guillermo.
**Decisión:**
1. **Dirección "Qué cambió y por qué" entra como pantalla principal** de `renderVariacionesResults` (antes solapa única): veredicto, tiles (dotación, Bruto del Tabulado, legajos que bajaron de escalón, sin causa visible), lista de "legajos para poder explicar" y matriz de transición de escalones (heatmap secuencial de un solo hue, `color-mix()` sobre `--color-primary`). La tabla completa que existía antes queda como **solapa "Detalle"** (dirección "Planilla comparativa"), con una columna de Escalón agregada cuando aplica — usa `initTabs` (`js/ui/tabs.js`), el mismo componente de Acumuladores Ganancias (D-026).
2. **Detección de escalón genérica, no hardcodeada al cliente.** `detectarEscala()` mira los valores no-cero de un concepto (un solo código, nunca la suma de Sueldos) juntando los dos períodos: si son pocos (≤6) y se repiten, es una escala; si no, es un importe libre y no se muestra escalón. Cada valor se ubica como % del escalón más alto (`escalonDe`). Un legajo presente ese período sin dato en el concepto liquidó 0% — pero un legajo ausente del Tabulado ese período (alta/baja) no tiene escalón, para no confundir "no le tocaba" con "perdió el premio".
3. **Causa de una baja de escalón = tiene algo cargado en conceptos de ausencia conocidos** (`CODIGOS_AUSENCIA`: licencias, ausencias, francos, permisos) en el período actual. Es una lista de códigos, no un cálculo genérico — si otro cliente usa otros códigos, se amplía la lista o se promueve a config por cliente cuando aparezca el segundo caso (mismo camino que D-015/D-024 para el scope).
4. **El titular del veredicto es siempre sobre lo que encontró el reporte, nunca sobre el Bruto total.** El Bruto del Tabulado se muestra como contexto (tile + subtítulo), pero no maneja el semáforo ni el texto principal: usarlo de titular en Variación Sueldos (que no tiene escalón ni variación propia) le atribuiría a ese reporte una caída que es de otros conceptos que no mira. El primer intento de esta pantalla cometió justo ese error y se corrigió antes de cerrar la tarea.
5. **Dirección "Ficha por legajo" (B) queda pendiente** — anotada en `ROADMAP.md` § Ideas sueltas. Resuelve "¿qué pasó con este legajo puntual?", que hoy ya se puede responder buscando en la solapa Detalle; no es la prioridad frente a las otras dos.
**Alternativas descartadas:** Config de escalones por cliente en vez de detección automática (es exactamente la clase de dato que no hay forma de mantener actualizado a mano si cambia una escala salarial; la detección se ajusta sola); mostrar el veredicto con el Bruto siempre (más simple, pero mezcla hallazgos de reportes distintos — ver punto 4); implementar la Dirección B ahora (el pedido explícito fue A como pantalla y C como solapa, dejando B para después).
**Motivo:** Pedido explícito de Guillermo, con las tres direcciones acordadas de antemano en la exploración visual. Cubierto por 12 asserts nuevos en `tests/variacionesControl.test.js` (detección de escala, `null` como escalón 0 sólo si el legajo está presente, causa por ausencia, variación de Bruto) — 69 asserts en total, sin tocar `run()`/`summarize()` de forma incompatible con los 57 asserts previos.

---

## D-029 — Acumuladores Ganancias, Fase 1: panel de verificación + fichas + planilla, chequeos de pantalla y gate de PIN

**Fecha:** 2026-08-07
**Contexto:** Implementación de `specs/acumuladores-fase1-verificacion.md` (D-027) sobre el control ya validado al centavo (D-026): agrega una capa de chequeos de pantalla y una pantalla de resultados de 3 solapas, sin tocar el `.xlsx` exportado ni la lógica de `run()` ya verificada.
**Decisión:**
1. **Chequeos nuevos, todos calculados de los propios datos subidos (nunca de una escala legal externa):** reconciliación aritmética (recalcula `DATOS.total` independientemente y lo compara contra el guardado — detecta un bug de parseo, no un error del cliente), CUIL faltante, "sin movimiento en el mes" (alerta siempre genérica, nunca intenta adivinar causa — cierra el caso del legajo sin movimiento tal como pidió Guillermo), "salto grande" vs. el mes anterior (requiere ≥2 archivos; umbral configurable, default 2x), y coherencia de topes de jubilación/obra social — **estos últimos quedan apagados (`null`) hasta que Guillermo cargue el monto vigente**, nunca se inventa un valor.
2. **`js/ui/pinGate.js` nuevo, reusable:** un PIN único de la app en `localStorage`, documentado explícitamente en el propio componente como freno operativo, no autenticación real (sin backend, sin usuarios — cualquiera con devtools lo evita). Detrás del gate: topes de jubilación/obra social, multiplicador de "salto grande", on/off por chequeo. El régimen (RG4003/RG4030) y los códigos de acumulador siguen fuera del gate, como ya estaban (D-026) — no son un dato sensible de tocar "por error".
3. **Pantalla de 3 solapas (Resumen · Fichas · Planilla)** armada con `initTabs` directamente, reusando `renderVerdict`/`renderTiles`/`renderIssues`/`renderChecks`/`enhanceGrid` de `resultBlocks.js` (D-027) sin modificarlo. Fichas (Dirección B) es nueva: tarjetas expandibles por legajo (`<details>`) con buscador de texto libre, filtro (todos/con algo para revisar/sin movimiento) y orden (mayor bruto/mayor SAC teórico/legajo/nombre) — no usa `initSearchCombobox` porque filtra tarjetas, no filas de una tabla.
4. **Scatter de total anual gravado vs. impuesto retenido** (Resumen), SVG inline sin librería: la "línea de piso" es la mediana de impuesto/total de la propia ventana subida, nunca una escala AFIP externa. Los puntos muy por debajo de esa mediana se etiquetan "para revisar" en texto neutral, nunca "error" — mismo criterio que el caso del legajo fuera de patrón (spec §3).
5. **CUIL se resuelve en `consolidateFile()`** desde las filas `SUMA` (ya lo traía el parser, se descartaba) y viaja en `mes.rows`/`datos.rows` — sólo para mostrar, no se exporta al `.xlsx`.
**Alternativas descartadas:** Inferir el tope de jubilación/obra social de una tabla hardcodeada en el código (es exactamente el tipo de dato regulatorio que cambia y esta app no puede mantener actualizado sin depender de un release — CLAUDE.md lo prohíbe explícitamente); usar `initSearchCombobox` para las fichas (fue diseñado para filtrar filas de `<tr>`, no tarjetas `<details>`; una búsqueda simple por texto alcanza y es más clara acá).
**Motivo:** Cierre de la Fase 1 acordada con Guillermo el 2026-08-07. Cubierto por 13 asserts nuevos en `tests/acumuladoresGananciasControl.test.js` (47 en total) + verificación visual en navegador con Playwright sobre un dataset sintético (verdict/tiles/issues/checks/scatter en Resumen, filtro/búsqueda/orden/expansión en Fichas, sticky en Planilla, PIN: bloqueo/configuración/PIN incorrecto/PIN correcto).

---

## D-030 — Se saca el gate de PIN del editor de umbrales de Acumuladores Ganancias

**Fecha:** 2026-08-07
**Contexto:** Apenas mergeada la Fase 1 (D-029, PR #84), Guillermo revisó la pantalla real y objetó el gate de PIN sobre los umbrales de chequeos (topes de jubilación/obra social, multiplicador de "salto grande", on/off por chequeo): "esto no tiene mucho sentido, los valores deberían estar visibles para el que lo ejecute y si puedo modificarlo que lo haga, podemos confiar en los analistas".
**Decisión:**
1. Se saca `renderPinGatedSection` de `renderAcumuladoresConfigEditor` — la sección de umbrales pasa a ser un `<details>` común, visible y editable directo, con el mismo lenguaje visual que "Régimen y códigos de acumulador" (que ya vivía sin PIN al lado, D-026). Nada de lo que había atrás del gate era en sí mismo peligroso de tocar por error una vez visible: son campos con su propio texto explicativo ("dejar vacío = sin chequear", "esta app nunca inventa un valor").
2. **`js/ui/pinGate.js` NO se borra.** Queda en el repo sin uso por ahora — si otro control necesita un freno real más adelante (con más razón para ocultar algo, ej. un valor que si se toca sin querer rompe un cálculo en producción sin aviso visible), está disponible. No hay ningún otro control que lo use hoy.
3. La lección para la próxima vez: un freno de UI (PIN, confirmación, lo que sea) tiene que justificarse por el riesgo concreto de tocar ese campo por accidente, no aplicarse por default a "todo lo que suene a configuración sensible" — acá el campo ya se explicaba solo y el equipo de Payroll es de confianza para tocarlo directo.
**Alternativas descartadas:** Mantener el PIN pero mostrar los valores en modo lectura sin desbloquear (Guillermo pidió explícitamente que además de verse, se pueda editar sin fricción); borrar `pinGate.js` del repo (es un componente genérico, no específico de Acumuladores, y no cuesta nada dejarlo disponible sin usar).
**Motivo:** Pedido explícito de Guillermo el 2026-08-07, revisando la pantalla ya mergeada. Verificado en navegador: el `<details>` de umbrales se ve y edita igual que el de "Régimen y códigos", sin ningún gate; los 47 asserts de `tests/acumuladoresGananciasControl.test.js` siguen en verde (no testean el editor de UI, sólo `run()`/`summarize()`, que no cambiaron).

---

## D-031 — Acumuladores Ganancias: el tope previsional es uno solo sobre la base, y el scatter pasa a "piso real de tributación"

**Fecha:** 2026-08-07
**Contexto:** Revisando la Fase 1 ya mergeada, Guillermo marcó dos cosas: (a) "el tope es el mismo para Jubilación y Obra Social" — el modelo de D-029, con dos montos tope independientes, estaba mal planteado; y (b) preguntó cómo mostrar en la app el scatter del mockup de exploración (`direcciones.html`), que era bastante más informativo que el que se implementó. También preguntó cómo se calculan los valores de IG.
**Decisión:**
1. **Un solo tope, y aplica sobre la BASE, no sobre el monto retenido.** El tope previsional argentino es una base imponible máxima única; jubilación y obra social se diferencian por su alícuota, no por tener topes distintos. Se reemplaza `topeJubilacion`/`topeObraSocial` por `topeBaseImponible` (null por default, nunca inventado) más `alicuotaJubilacion` (11%) y `alicuotaObraSocial` (3%), ambas editables porque pueden variar por convenio. El techo de cada retención se deriva como `base × alícuota` y el editor lo muestra en vivo; el detalle del caso explicita de dónde sale ("11% de la base máxima X"). Los valores viejos, guardados en `controlConfigs`, se ignoran silenciosamente: el chequeo nunca llegó a usarse con un valor real (estuvo detrás del PIN desde que se mergeó hasta que se sacó, horas después).
2. **La app NO calcula el Impuesto a las Ganancias.** El "IMPUESTO" de la hoja DATOS y las "Retenciones efectuadas" del mes son el acumulador **1150 leído tal cual del crudo de Axton** — no hay escala del art. 94, ni deducciones, ni mínimo no imponible en ningún lado. Se documenta explícitamente en el comentario de `renderScatter` porque es justo la clase de cosa que a los seis meses alguien asume al revés. Calcular el impuesto es Fase 3.
3. **El scatter cambia de pregunta.** La versión de D-029 dibujaba una diagonal con la mediana de `impuesto/total`, que con un impuesto progresivo no significa gran cosa (el ratio varía enormemente por tramo). Se reemplaza por el modelo del mockup: una **vertical en el "piso real de tributación"** — el total anual más bajo entre los legajos a los que Axton efectivamente les retuvo — y tres grupos (Tributa · No tributa · Fuera de patrón). El piso es un valor **observado en estos datos**, no el mínimo no imponible legal; el texto al pie lo aclara para que nadie lo lea como si la app conociera la escala. Lo único afirmable sin la escala es la asimetría: a la derecha del piso y sobre el eje no debería haber casi nadie.
4. **`fueraDePatron` entra como chequeo propio** (on/off como el resto), así el hallazgo no vive sólo en el gráfico sino también en "Casos para revisar", que es desde donde trabaja el analista. Redacción neutral obligatoria: "puede tener deducciones que lo justifiquen (SIRADIG, cargas de familia) — la app no las ve", nunca "está mal" (spec §3, caso 1561).
5. **Un legajo sin fila 1150 cuenta como impuesto 0, no como "sin dato".** Si Axton no emitió fila de retención, no hubo retención. La versión anterior del scatter los excluía por `impuesto !== null` mientras el chequeo sí los tomaba — una inconsistencia que se detectó justamente al verificar en el navegador, no en los tests.
**Alternativas descartadas:** Mantener dos topes independientes pero documentando que "normalmente coinciden" (modela mal la realidad: el dato que existe es la base, no dos montos); hardcodear 11%/3% sin exponerlos (varían por convenio y el analista no tendría cómo corregirlo); dejar el scatter viejo y sumar el nuevo (dos gráficos de lo mismo compitiendo, y el viejo era el peor de los dos).
**Motivo:** Pedido explícito de Guillermo el 2026-08-07 sobre la Fase 1 ya en producción. Cubierto por 7 asserts nuevos (54 en total) + verificación en navegador con una población sintética de 42 legajos que reproduce los tres grupos del gráfico (15 tributan, 26 no, 1 fuera de patrón) y los techos derivados del editor.

---

## D-032 — Acumuladores Ganancias: piso de Ganancias 4ta categoría como segunda referencia del scatter (aproximado, caso base)

**Fecha:** 2026-08-07
**Contexto:** Sobre D-031 (piso real de tributación observado en los datos), Guillermo pidió: "Cargá los datos para Ganancias así sabemos cual es el piso y de un vistazo se confirma si está bien o no". A diferencia del tope previsional (D-031), el piso de Ganancias 4ta categoría no es un número único: depende de cargas de familia (soltero/casado/hijos), dato que Acumuladores no tiene ni va a tener en esta fase.
**Decisión:**
1. Se carga sólo el **caso más simple**: bruto mensual mínimo no imponible para un soltero sin cargas de familia, dato de las Deducciones Personales de AFIP (`pisoGananciasMensual`, null por default). El "piso anual aproximado" que se grafica es ese valor `× 12` — una aproximación gruesa (ignora la actualización semestral a mitad de año, el efecto del SAC en el cálculo real, etc.), documentada como tal en el código y en el texto de la pantalla.
2. **Verificación de la fuente:** búsquedas directas dieron cifras contradictorias entre sí (mezclaban valores anuales/mensuales de distintos semestres — $2.995.000, $3.502.511, $5.151.802,50 aparecían como si fueran comparables). Ante la duda, se paró y se preguntó a Guillermo en vez de adivinar cuál era la correcta (regla de CLAUDE.md: nunca inventar un dato regulatorio). Guillermo confirmó la fuente (`afip.gob.ar/.../deducciones-personales.asp`, bloqueada por el proxy de red del sandbox para fetch directo) y se contrastó el valor con una segunda fuente independiente (iprofesional + calcularsueldo, ambas coincidiendo en $3.502.511 bruto mensual, vigente agosto 2026) antes de cargarlo como default de referencia en la conversación — el campo en sí queda vacío en el código; el valor lo carga Guillermo en el editor.
3. **En el scatter, la segunda línea es visualmente distinta** de la del piso observado (punteada gris vs. sólida naranja) y con su rótulo propio, para que nunca se confundan como el mismo tipo de dato. El texto al pie compara ambos pisos automáticamente y avisa si están "bastante alejados" (>30% de diferencia) — sugiriendo revisar mapeo de acumuladores o configuración, nunca afirmando un error.
4. **No se toca `run()` de Ganancias en absoluto** — el piso vive sólo en la config y en el render del scatter; no es un chequeo con casos para revisar (a diferencia de `topes` o `fueraDePatron`), porque no hay una forma honesta de decir "este legajo puntual está mal" sin conocer su situación familiar. Es una referencia visual, no una afirmación por legajo.
**Alternativas descartadas:** Agregar un chequeo por legajo tipo "sub-tributa vs. el piso teórico" (sin cargas de familia, sería falsos positivos masivos — cualquier casado o con hijos tributa menos que el caso soltero); pedir que Guillermo cargue cónyuge/hijos por legajo para un cálculo real (es directamente la Fase 3, con escalas y SIRADIG, fuera de alcance de esta spec).
**Motivo:** Pedido explícito de Guillermo el 2026-08-07. Cubierto por 2 asserts nuevos (56 en total) + verificación en navegador con el valor real cargado (piso observado 42,9 M vs. piso AFIP aprox. 42,0 M, líneas distinguibles y sin superponerse).

---

## D-033 — Acumuladores Ganancias vuelve a su objetivo: el SAC teórico. Los chequeos de topes y Ganancias se repliegan (sin borrarse)

**Fecha:** 2026-08-07
**Contexto:** En tres iteraciones seguidas (D-029, D-031, D-032) el control fue sumando chequeos y visualizaciones alrededor del Impuesto a las Ganancias: coherencia de topes previsionales, gráfico "¿quién tributa?", piso de tributación observado, piso legal aproximado de AFIP. Guillermo frenó: *"creo que se está yendo el foco. El objetivo es armar el SAC teórico con el acumulador. Ese es el objetivo principal de este reporte. Todo lo otro que agregamos de topes y de Ganancias es demasiado complejo... si no, nos estamos yendo de tema y hay que tener un montón de consideraciones"*.
**Decisión:**
1. **El foco vuelve al SAC teórico**, que es lo único que este reporte existe para calcular. Los chequeos ahora son sobre eso: `sacNoCalculado` (el legajo no liquidó en ningún mes de la ventana, no hay doceava que acumular), `sacParcial` (armado con menos meses de los subidos — típicamente un alta posterior), `sacNegativo` (las deducciones de algún mes superaron al gravado) y `doceavaAtipica` (una doceava se sale de la línea de las otras del mismo legajo — retroactivo, liquidación extra). El veredicto, un tile nuevo ("Sin SAC teórico") y el primer chequeo de coherencia pasan a hablar de esto y no de "N legajos generados".
2. **`saltoGrande` (bruto mes contra mes) se reemplaza por `doceavaAtipica`.** Misma idea, pero medida sobre la doceava, que es el insumo real del SAC teórico, y comparando contra la mediana de los propios meses del legajo en vez de sólo contra el mes anterior. Un aviso por legajo como máximo.
3. **Los extras se repliegan detrás de `EXTRAS_GANANCIAS_HABILITADOS = false`**, no se borran: quedan el chequeo de topes, el de `fueraDePatron`, el gráfico de dispersión y sus dos bloques del editor, completos y en su lugar. Un solo flag los devuelve. Se eligió esto sobre borrarlos (se pierde trabajo válido y verificado) y sobre moverlos a otro archivo (más ruido de refactor que valor, para código que hoy no corre).
4. **Razón técnica de peso para replegar, no sólo de alcance:** el tope previsional de la cuota del SAC **no es el tope mensual** — la cuota del SAC tiene su propio tope, del 50% del mensual. O sea que el chequeo de topes, tal como quedó en D-031, estaba mal justo para el concepto que este reporte calcula. Antes de reactivarlo hay que resolver eso; queda anotado en el comentario del flag.
5. **Lo que se mantiene además del SAC teórico** es lo que habla de si el reporte salió bien o del crudo de origen: reconciliación aritmética, CUIL faltante y "sin movimiento en el mes". Son baratos, no arrastran consideraciones regulatorias y no compiten con el objetivo.
**Alternativas descartadas:** Borrar el código de los extras (se pierde una parte válida y ya verificada; el costo de dejarla apagada es cero); dejarlos visibles pero apagados por default (siguen ocupando la pantalla y sugiriendo que el control hace algo que no hace); arreglar el tope del SAC ahora y seguir (es justamente la clase de consideración que Guillermo pidió no acumular en este reporte).
**Motivo:** Pedido explícito de Guillermo el 2026-08-07. Cubierto por 58 asserts (los 4 casos nuevos del SAC teórico, que el más grave gana por legajo, y que los extras no aparecen con el flag apagado) + verificación en navegador con un dataset sintético que reproduce los cuatro casos.

---

## D-034 — Rediseño de la cabecera de resultados (1C): dos barras sticky, hero-gauge sin tocar

**Fecha:** 2026-08-07
**Contexto:** La pantalla de resultados (`controlsResults.js` para un run guardado, y el paso 3 del wizard para un run rápido) apilaba `app-header` (68px) + `page-actions` (título + `?`) + `wizard-steps` + header de card + banner de estado + veredicto: el contenido útil arrancaba a ~430px del borde superior. Willy mandó dos mockups (`Cabecera de resultados - opciones.dc.html`, `Resultados Acumuladores.dc.html`) y un handoff pidiendo reemplazar ese stack por dos barras sticky de 88px en total. Antes de codear surgieron dos dudas de alcance, resueltas con Willy vía un boceto comparativo (artifact) y una pregunta directa:
1. Qué hacer con el hero-gauge grande (arco + KPIs + lista de controles) en un run con varios controles, ya que el mock de referencia es de un run de un solo control (Acumuladores) y no lo muestra.
2. Si las secciones 2/3 de la spec (agrupar "casos para revisar" por legajo, severidad `minor`, filtro de Fichas por severidad) se aplican a los 10 controles ya en esta pasada o sólo al que trae el mock.
**Decisión:**
1. **Opción B — el hero-gauge se mantiene intacto**, debajo de la nueva barra de contexto. La barra sólo resume en una línea de prosa (`buildContextLine()` en `controlsResults.js` / lógica equivalente en `controlsWizard.js`); el gauge, los KPIs y el ranking de controles no se tocan. Se descartó condensar todo a prosa (Opción A) porque hubiera sido un cambio mucho más grande en `controlsResults.js` para una pantalla que hoy funciona bien, sin pedido explícito de sacarla.
2. **Cabecera nueva = 2 barras sticky, ambas montadas por `js/ui/resultsHeader.js`:** el `.app-header` global se comprime con una clase (`.app-header--compact`, `css/base.css`) — no se duplica ni se reemplaza, sigue siendo el único header de la app — y debajo se monta `.results-ctx-bar` (`css/components.css`): volver, status-dot + cliente·período + la línea de veredicto, y un popover "Detalles del run" que reemplaza los dos banners viejos (`renderRunStatusBanner` de `controlsResults.js` y `renderStatusBanner` de `controlsWizard.js`, ambos borrados). El mismo componente sirve para el run guardado y el run rápido del wizard (que **siempre** es "Ejecución rápida" — `executeControls` navega a `#/control-results/:id` apenas hay `runId`, así que `renderInlineResults` nunca necesitó los estados Borrador/Definitivo).
3. **El wizard necesitó separar dos "shells"** dentro de la misma pantalla: el shell de pasos (page-actions/wizard-steps/card/nav, sin tocar en pasos 0-2 pre-ejecución) y el shell de resultados (las 2 barras, sin nada de lo anterior). `render()` decide cuál montar según `state.step === 2 && !!state.lastRunResults`, guardado en `root.dataset.wizardView` para no remontar de más.
4. **Sección 2/3 de la spec (agrupar por legajo, `sev:'minor'`, filtro de Fichas) sólo se aplica ya a `acumuladoresGanancias.js`** — el único control con más de un issue por legajo hoy y el único con una vista de Fichas. La infraestructura (`renderIssues({ groupBy })`, `renderMinorObservations()` en `resultBlocks.js`) queda disponible para los otros 9, documentados control por control en `specs/resultblocks-migracion-controles.md` para la próxima pasada (candidatos con impacto real: `acreditaciones.js` y `agrupadores.js`, que arman un row por alerta/grouper en vez de por legajo).
5. **Planilla (`enhanceGrid`): ancho de la 1ª columna fija declarado (`col1Width`, default 74px), no medido en runtime.** Antes se medía con `requestAnimationFrame` después del layout; si el `<tbody>` se reconstruía (búsqueda, orden, resize) el valor quedaba viejo y se abría una franja entre las dos columnas fijas. `rendVsTabu.js`/`rendVsAsiento.js` (columna 1 = código de CC, más ancho que un legajo) pasan `col1Width: 100`.
**Alternativas descartadas:** Comprimir el `.app-header` global para toda la app (afectaría Home/wizard pasos 1-2/checklist/admin, explícitamente fuera de alcance de la spec); un solo shell en el wizard con `display:none` sobre las partes que no aplican (más simple de escribir, pero deja montado el `#js-wizard-nav` sticky de abajo compitiendo visualmente con el popover de la cabecera nueva); hardcodear las opciones del filtro de Fichas (la spec pide explícitamente que se deriven de los issues presentes).
**Motivo:** Handoff de Willy 2026-08-07 (mockups + spec en `specs/`), decisiones de alcance confirmadas por Willy antes de codear. Verificado con `npm run test:unit` (todos los tests existentes en verde, incluidos los 58 de `acumuladoresGananciasControl.test.js` sin cambios de comportamiento) — la verificación visual en navegador no se pudo completar en este sandbox por falta de acceso de red a los CDN de SheetJS/Dexie/fuentes desde el contexto del browser de Playwright (limitación del entorno, no del código); revisar visualmente antes de mergear a producción.

---

## D-035 — Variaciones: se suben siempre los dos Tabulados, y la columna de cada concepto la confirma el analista

**Estado:** el punto 3 (el gate cierra el paso hasta que todos los conceptos estén resueltos) fue refinado por D-036.

**Fecha:** 2026-08-10
**Contexto:** Guillermo revisó los dos controles de Variación de OPmobility / Plastic Florida (`POF`) contra dos tabulados reales (2ª quincena de marzo y de abril 2025) y encontró que no funcionaban como necesita. Cuatro problemas de fondo: (1) los códigos de concepto estaban fijos en `js/controls/variaciones.js`, así que si el cliente renumeraba o renombraba un concepto el reporte devolvía 0,00 y nadie lo podía corregir desde la pantalla; (2) el período anterior se adivinaba reusando el Tabulado de la corrida del mes anterior, sin que existiera una regla cerrada de qué quincena compara contra cuál; (3) la quincena y el tipo de liquidación se leían del archivo y se perdían; (4) `totalRow` se parseaba y no lo miraba nadie. Además aparecieron tres fallos silenciosos del parser al probar con los archivos reales.
**Decisión:**
1. **Los dos Tabulados se suben siempre.** `additionalFiles[0]` pasa de `optional: true` a obligatorio y se elimina el bloque `VARIACIONES_IDS` del wizard que llamaba a `previousPeriod()` + `getRunFileFromPeriod()`. El período y la quincena de cada archivo salen del propio archivo (`Periodo:` y `Tipo:` de su encabezado), **nunca** del selector de período de la app. Revierte el punto 5 de **D-023**: reusar la corrida anterior armaba comparaciones mal sin avisar.
2. **Orden por fecha, no por slot.** El control ordena los dos archivos por `(período, quincena)` y el más viejo queda siempre a la izquierda del reporte, sin importar en qué slot lo subió el analista (sale un aviso cuando estaban invertidos). Mismo período **y** misma quincena → error, no se ejecuta. Mismo período con una quincena sin declarar → se compara igual y se avisa.
3. **El código de concepto es precarga, no identificador.** Un panel nuevo (`js/ui/variacionesConceptMap.js`) confirma, por archivo, qué columna es cada concepto. Lo detectado en los dos archivos viene resuelto y plegado; sólo se abre lo que necesita una decisión, y el wizard no deja avanzar hasta que esté — sin default silencioso. "No se liquidó en este período" es una opción explícita: computa 0,00 y sale como aviso, pero como decisión del analista. `columnasPorCodigo` devuelve ahora **todas** las columnas de cada código (antes se quedaba con la primera y descartaba la segunda en silencio).
4. **Un solo archivo compartido.** `additionalFiles[].shared` hace que el wizard pida el Tabulado anterior una sola vez cuando los dos controles están seleccionados, y espeje el resultado en los dos. Los dos slots van lado a lado en 2 columnas, **siempre anterior → actual**, y el panel "Catálogo de Conceptos (opcional)" no se muestra para estos controles (sirve para matchear por catálogo; acá el mapeo es directo por archivo).
5. **Soporte de Tabulado en Excel real con preámbulo.** Si alguien abre el `.xls` y lo guarda desde Excel, los encabezados quedan en la fila 3 y `sheet_to_json` tomaba el texto del preámbulo como encabezados: el archivo entraba mapeando cualquier cosa, sin ningún error. `tabuladoControl.js` detecta la fila de encabezados y lee `Periodo` / `Tipo` / `EA:` / `TOTAL GENERAL` también por esa rama. En esa rama el offset de `TOTAL GENERAL` es 0 (Excel ya expandió el `colspan=3`), contra 2 en la rama HTML: el desfasaje se informa en `totalRowOffset` en vez de repetirse como número mágico. La rama de Excel de los otros 11 controles no cambia — el camino nuevo se activa sólo si la primera fila no parece de encabezados.
6. **Tres fallos silenciosos del parser, cerrados.** (a) `parseHtmlTabulado` usa la primera fila con `<th>` como encabezados y **valida que su ancho sea el de los datos**; antes aplanaba todos los `<th>` y cortaba, así que una fila de encabezado más angosta o más ancha corría los conceptos y el reporte salía con números mal sin tirar error. (b) El "cascarón" que genera Excel al guardar como *página web* (un `<frameset>` que apunta a una carpeta `.files` que no se sube) ahora corta con un error que lo explica, en vez de "0 encabezados". (c) El tipo de liquidación se conserva entero (`"2da Quincena c/ sobregiro"`), no sólo el dígito de la quincena.
7. **Validación contra `TOTAL GENERAL`.** Por concepto y por archivo se compara el total calculado contra el de la fila del archivo; diferencia > 0,05 sale como aviso con concepto, período, valor del archivo y valor calculado. **No bloquea la corrida y no va al PDF** — es la única señal de que los encabezados se desalinearon, porque en ese caso los números salen mal pero coherentes entre sí.
8. **Columna "Modificación" (S/N)** entre las dos columnas de período y "Variación $", en pantalla, Excel, CSV y PDF. Sale del PDF de referencia real del cliente que pasó Guillermo. El encabezado del PDF **no** se cambia al de ese documento: queda el de la app (isotipo H&A, razón social del tabulado, período comparado y tipo de liquidación).
9. **Filtros y orden en la pantalla de revisión:** filtro por sentido de la variación (suba / baja) además del de "solo con variación", y orden por cualquier columna clickeando el encabezado. Los nulls van siempre al final, en los dos sentidos.
10. **La configuración por cliente existe como dato, sin editor todavía.** `controlConfigs` con `controlId: 'variaciones_config'` guarda qué conceptos compara cada reporte y qué códigos cuentan como causa de ausencia (`CODIGOS_AUSENCIA` suma `1600` Lic. Examen y `1695` Suspensión, que faltaban y aparecen en el tabulado de abril). Sin config guardada se usa la semilla de `variaciones.js`, así que el resultado es idéntico al de hoy. La UI para agregar/sacar conceptos queda para una próxima fase (ver `ROADMAP.md`) — se decidió el modelo de datos ahora para no migrar nada después.
**Alternativas descartadas:** Seguir reusando la corrida anterior desde IndexedDB (requiere primero cerrar con el cliente qué quincena compara contra cuál, y que el histórico guarde la quincena y no sólo el mes — queda en `ROADMAP.md`); fundir los dos controles en uno solo con lista de conceptos libre (cambio de scope y de registry que nadie pidió); construir un componente propio de selector con búsqueda (`<input list>` + `<datalist>` nativo alcanza y no suma dependencias — `initSearchCombobox` de `tableTools.js` filtra filas de una tabla, no sirve como picker); adoptar el encabezado del PDF de referencia del cliente (Guillermo confirmó que se queda el de la app).
**Motivo:** Pedido de Guillermo en `correccionesvariacionesopmobility.md` más lo que salió de correr los parsers contra los dos tabulados reales, y las correcciones que dejó sobre el mockup de revisión.

---

## D-036 — Variaciones: el gate bloquea sólo si un concepto no se resolvió en NINGUNO de los dos archivos (refina D-035)

**Fecha:** 2026-08-11
**Contexto:** D-035 punto 3 cerró el paso de archivos hasta que todos los conceptos estuvieran resueltos ("sin default silencioso", regla de `CLAUDE.md`). Con Plastic Florida / OPmobility apareció el caso legítimo que ese gate no contemplaba: jornales y mensualizados son mutuamente excluyentes por diseño —un legajo liquida por uno o por el otro, nunca por los dos—, así que un concepto que sólo existe en uno de los archivos nunca iba a poder resolverse en los dos y el analista quedaba trabado sin salida. El fix de ese momento (`9540fbc`, PR #96) sacó el gate entero y lo dejó en "nada chequeado": alcanzaba con que los dos Tabulados cargaran. Eso reabrió, sin querer, justo lo que D-035 había cerrado — un concepto sin resolver en **los dos** archivos (mapeo roto, no el caso de diseño) dejaba al legajo afuera de la tabla, del export y del PDF, con el control reportando `success` en verde.
**Decisión:**
1. El gate bloquea si y sólo si un concepto no se resolvió en **ninguno** de los dos archivos: `sinResolverEnNinguno(grupos, estado)` en `js/ui/variacionesConceptMap.js`, que reemplaza al `pendientes()` de D-035.
2. Que un concepto falte de un solo lado es un **resultado válido**, no un error: computa 0,00 en el período donde no está y sale como aviso en la pantalla de resultados.
3. Con esto, la regla del default silencioso se lee así: lo que no puede pasar en silencio es que el control **no tenga forma de resolver** un dato. Que el dato no exista en un período es un hecho del archivo, y se informa.
**Alternativas descartadas:** Volver al gate de D-035 y pedirle al analista que marque "no se liquidó en este período" concepto por concepto (fricción mensual garantizada para un caso que en este cliente es la norma, no la excepción); dejar el gate relajado de `9540fbc` y compensar con un aviso en resultados (el aviso no impide que el PDF salga impreso en 0,00 y el semáforo en verde, que es exactamente el costo que la regla evita).
**Motivo:** Los dos extremos se probaron en producción en la misma semana y los dos fallaron por motivos opuestos. Los otros tres arreglos del mismo PR (columnas huérfanas, mapeo persistido por lado, PDF sin secciones fantasma) son consecuencias mecánicas de haber vuelto a mirar el gate: van al `CHANGELOG.md`, no acá. Cubierto por `tests/variacionesConceptMap.test.js`.

---

## D-037 — "Borrar cliente" pasa a ocultar; el borrado definitivo queda aparte y pide tipear el nombre

**Fecha:** 2026-08-11
**Contexto:** `deleteClient()` borraba el cliente y sus agrupadores, pero dejaba afuera de la cascada `controlRuns`, `controlRunFiles`, `controlRunResults` y `controlConfigs`. Como la identidad del cliente es `clients.code` (D-004) y ese `code` queda libre apenas se borra la fila de `clients`, un cliente nuevo dado de alta con el mismo nombre lo reusaba y **heredaba las corridas del borrado, con datos de empleados adentro**. Arreglar sólo la cascada dejaba un borrado irreversible y ahora completo a un click, en una pantalla que el equipo usa todos los días.
**Decisión:**
1. El "Borrar cliente" del día a día pasa a ser **ocultar** (`hideClient()` / `unhideClient()`, `js/db.js`): marca `active: false`, no borra nada, es reversible, y **reserva el `code`** — la fila de `clients` sigue existiendo, así que ningún cliente nuevo puede reusarlo por accidente. `getClients()` devuelve sólo activos; `getInactiveClients()` es nueva y alimenta el panel "Clientes ocultos".
2. `deleteClient()` queda como acción aparte, con la cascada completa sobre las tablas que faltaban, alcanzable **sólo** desde ese panel y con confirmación **por tipeo del nombre del cliente** (`showConfirm` gana `requireText`, `js/ui/toast.js`).
3. El costo de la fila oculta es el `code` reservado: para volver a usar ese código hay que borrar definitivamente primero. Es deliberado — es lo único que garantiza que "lo borré y lo volví a crear" no pueda mezclar los datos de dos clientes.
**Alternativas descartadas:** Arreglar sólo la cascada y dejar el botón como estaba (resuelve la privacidad, pero deja el borrado de todo el histórico de un cliente a un click, con una fricción que no es proporcional al daño); soft-delete sin borrado definitivo (cierra la puerta a un borrado legítimo — un cliente cargado por error, o una baja real en la que no se quiere conservar datos de empleados en el navegador).
**Motivo:** El bug de origen es de privacidad, y separar "sacarlo de la lista" de "borrar los datos" es lo que hace que la acción riesgosa cueste lo que tiene que costar. Cubierto por `tests/clientDeletion.test.js` (25 asserts: hide/unhide/delete, la cascada completa, y el reuso de `code` en los dos sentidos — con cliente oculto NO se reusa, después de borrar definitivamente SÍ).

---

## D-038 — Clave de legajo: un estándar por cliente, precargado por corrida y editable sin pisar el default

**Estado:** **implementada** el 2026-08-12 (`js/utils/legajo.js`, `tests/consolidate.test.js`).
**Fecha:** 2026-08-11, cerrada el 2026-08-12
**Contexto:** Hoy conviven tres criterios distintos para decidir si `"007"` y `"7"` son el mismo empleado: `norm()` (sólo `trim`) en `nr.js`, `brutos.js`, `gsPers.js`, `variaciones.js` y `rendVsAsiento.js`; `normId()` con `replace(/^0+/, '')` en `rendXEe.js`; y otro `normId()` con `parseInt` en `catXEmpleados.js`. Dos controles corridos sobre los mismos dos archivos pueden entonces contar dotaciones distintas, y cuál "acierta" depende de cómo emita los legajos el sistema del cliente — que es dato del cliente, no del control.
**Decisión:** La clave de legajo pasa a ser un **estándar por cliente**, guardado en `controlConfigs` (mismo mecanismo que `variaciones_config`, D-035), **precargado al ejecutar** y **editable para esa corrida sin pisar el default del cliente** — cuando un archivo puntual viene distinto, el analista lo corrige desde la pantalla y el estándar del cliente queda como estaba. Un único helper compartido reemplaza a los tres criterios actuales; entra junto con el `toNum` único y la extracción del módulo de consolidación.
**Alternativas descartadas:** Unificar los tres en el más permisivo (`parseInt`) sin configuración (colapsa legajos que algún cliente sí distingue: si el sistema de origen no rellena con ceros, `"0012"` y `"12"` pueden ser dos empleados); dejar los tres criterios y sólo documentar la diferencia (es la clase de divergencia que produce un número mal sin que nadie lo note — no falla, cuenta distinto).
**Motivo:** Decisión de Guillermo el 2026-08-11, tomada antes de implementar. Lo que hay que preservar hasta entonces no es el helper (eso se escribe solo) sino las tres propiedades del criterio: por cliente, precargado, y override por corrida que no pisa el default.

**Cierre 2026-08-12 (decisión de Willy).** `"007"` y `"7"` **son el mismo empleado**: el default global es
`sin_ceros`. Willy había marcado la letra (a) —sólo `trim`— y a la vez escrito "son el mismo empleado",
que es la (b); se le repreguntó con el dato de que en los tres archivos reales de Marval (04-2026) los
legajos son enteros sin ceros a la izquierda, así que para el cliente que corre hoy las dos opciones dan
idéntico resultado, y confirmó la (b). Es además lo que ya hacían `rendXEe` y `catXEmpleados`, así que
unifica hacia arriba en vez de degradar dos módulos que matcheaban bien.

Tres precisiones sobre lo implementado, respecto de lo que esta entrada había acordado en agosto:

1. **Vive en `clients.legajoKeyMode`, no en `controlConfigs`.** Willy pidió "que el controlConfigs tenga
   las opciones de elegir cómo se toma el legajo para cada cliente"; la tabla `controlConfigs` tiene clave
   `[clientCode+controlId]`, o sea que todo lo que se guarde ahí es config **de un control**. La clave de
   legajo es del **cliente** y tiene que alcanzar también a los controles que no tienen ninguna fila de
   config — meterla ahí obligaba a inventar un `controlId` fantasma que después aparece como control en
   las pantallas que listan `controlConfigs`. Guardada en el registro del cliente se edita desde `#/admin`,
   viaja en el seed (así la decisión se toma una vez para todo el equipo, no una vez por navegador) y el
   wizard la resuelve **una sola vez por corrida** en `mapping.legajoKeyMode`, que es lo que hace que
   valga para todos los controles y entregables de ese cliente sin tocar control por control.
2. **El override por corrida sin pisar el default queda pendiente.** Lo que entró es el estándar por
   cliente editable desde `#/admin`. El override efímero para el archivo que viene distinto un mes no se
   implementó — no había pantalla donde ponerlo sin agrandar el PR, y sin un caso real no está claro si el
   lugar es el Paso 1 o el Paso 2.
3. **El `parseInt` de `catXEmpleados` no se conservó como opción.** Además de ignorar los ceros a la
   izquierda, colapsaba `'12-B'` y `'12-C'` en el mismo `12`: un match falso, no un match más flexible.
   El modo `sin_ceros` sólo toca legajos enteramente numéricos.

---

## D-039 — Precedencia para resolver la columna de un concepto: lo confirmado por el analista, después el catálogo, después el fallback

**Fecha:** 2026-08-11
**Contexto:** Brutos, NR y GS Pers resuelven qué columna del Tabulado corresponde a cada concepto por tres caminos que nunca se enunciaron como un orden. Los dos primeros ya existen y son iguales en los tres controles. El tercero es exclusivo de Brutos: `sumTabColumn(rows, col, fallbackCode)` (`js/controls/brutos.js`) lee la columna por el código crudo cuando no hay columna mapeada, con `'1003'` y `'1017'` cableados en el módulo. Visto de afuera parece una inconsistencia a emparejar.
**Decisión:**
1. La precedencia es, y en este orden: **(1) lo que el analista confirmó** (guardado por cliente en `controlConfigs`) siempre gana; **(2) búsqueda por catálogo/código, matcheando por prefijo del encabezado**; **(3) recién ahí, un fallback hardcodeado en el módulo.**
2. El nivel (3) es último recurso, no default. Un código cableado es justo lo que D-035 saca del código fuente y lleva a `controlConfigs`: sirve como semilla para el cliente que todavía no configuró nada, nunca para ganarle a lo que el analista confirmó.
3. **Queda abierto** si NR y GS Pers deben tener fallback propio y con qué códigos. Se decide con Guillermo contra un Tabulado real, no por simetría con Brutos. Anotado en `ROADMAP.md`.
**Alternativas descartadas:** Poner el fallback arriba del catálogo "porque es más específico" (invierte la regla del proyecto — lo que el analista confirmó manda); sacarle el `fallbackCode` a Brutos ahora para que los tres controles queden iguales (hoy tapa tabulados que traen la columna sólo con el código; sacarlo sin un reemplazo configurado los rompe); copiar `fallbackCode` a NR y GS Pers eligiendo códigos por analogía (inventar un código de concepto de un cliente es exactamente el default silencioso que el proyecto prohíbe).
**Motivo:** Precedencia confirmada por Guillermo el 2026-08-11. Se anota porque la asimetría entre los tres controles se lee como bug y la corrección "obvia" (emparejarlos) es la equivocada.

**Actualización 2026-08-12:** el punto 3 sigue abierto por decisión de Guillermo — no se agrega fallback a NR ni a GS Pers mientras no haya un Tabulado real contra el cual confirmar los códigos. Hasta entonces los dos controles piden la columna explícitamente cuando no está mapeada, que es el comportamiento correcto: un dato que no se puede resolver se informa, no se completa con 0,00. Es el único ítem de la Fase 0 que queda abierto a propósito.

**Cierre del punto 3 — 2026-08-12 (segunda actualización del día).** Willy trajo el Tabulado real
(Marval 04-2026, 101 columnas) junto con el Reporte de NR y el de Gastos personales del mismo período, así
que los códigos ya no se infieren: se leyeron del archivo. Quedan como **semilla** en
`js/controls/tabCodes.js` (`TAB_CODE_SEEDS`), no en los módulos de control:

- **GS Pers:** `8802` (`8802-GTOS_PERSONAL`) y `8805` (`8805-DTO_COCHERA`).
- **NR:** 10 de los 18 conceptos — `3025`, `3903`, `3905`, `3913`, `3943`, `3945`, `3973`, `3974`, `1203`, `4897`.
- **Brutos:** `1003` y `1017` confirmados, los que ya estaban cableados.
- **Los 8 conceptos NR restantes** (`INDEM_ANT_FALLE`, `INDM_MATERNIDAD`, `GRAT_VAC`, `GRA_VACNOG_SAC`,
  `INDEM_FUER_MAY`, `INDEM_EMBARAZO`, `ASIG_PAS`, `INCREMENTO_ST`) **no aparecen en ese Tabulado**: no se
  liquidaron ese mes, así que no hay con qué confirmar su código y **siguen sin semilla a propósito**. Se
  piden explícitamente en el Paso 2, que es el comportamiento correcto (D-036). Confirmarlos necesita un
  Tabulado de un mes con indemnizaciones liquidadas.

Dos correcciones que salieron de mirar el archivo real, y que son el motivo de que esto no se pudiera
"emparejar por simetría" antes:

1. **El fallback que tenía Brutos era letra muerta.** `sumTabColumn(rows, col, '1003')` buscaba una columna
   llamada literalmente `'1003'`; Meta4 la exporta `'1003-SUELDO'`. Nunca se activó contra un archivo real.
   La resolución ahora es por **prefijo de código** (`buildColByCode`), que cubre los dos formatos.
2. **La búsqueda por nombre elegía mal en un caso concreto.** El Tabulado trae `'4899-COCHERA_IG'` y
   `'8805-DTO_COCHERA'`: matchear "COCHERA" por nombre puede enganchar el impuesto a las ganancias de la
   cochera en lugar del descuento. Por código no hay ambigüedad.

**Dónde vive la resolución:** en la auto-detección del Paso 2 del wizard, **después** del catálogo del
cliente y sólo para las claves que quedaron vacías. El catálogo es dato del cliente y los códigos son
semilla, así que esto no cambia nada de lo que ya resolvía bien — sólo completa lo que antes quedaba en
"— Sin asignar —". Verificado contra los archivos reales: **las 14 semillas resuelven solas**, y el control
de NR cruza los 527 legajos (5.270 celdas comparadas con dato en los dos lados, 550 con importe distinto de
cero) sin una sola diferencia; las 4.216 celdas de los 8 conceptos sin semilla quedan con dato de un solo
lado y **no se comparan**, que es exactamente lo que D-036 pide.

---

## D-040 — Qué selecciona "Seleccionar todos" lo declara el registry (`group.primary`), no se infiere del `mode`

**Fecha:** 2026-08-12
**Contexto:** El botón "Seleccionar todos" del Paso 1 del wizard filtraba por `u.ctrl.group.mode === 'Controlar'` (`js/ui/controlsWizard.js`). `group.mode` es el texto de la pill que separa variantes del mismo control en la UI, y el registry ya tiene cinco valores distintos: `'Controlar'`, `'Generar Reporte'`, `'Sueldos'` y `'Conceptos'`. Resultado: en POF, cuyos dos controles son `variaciones_sueldos` y `variaciones_conceptos` (modes `'Sueldos'`/`'Conceptos'`), el botón **no seleccionaba nada**; en los clientes de Axton entraba Acumuladores Ganancias (sin grupo) pero quedaba afuera Acreditaciones. La intención ("cuál de las variantes es *el* control") estaba codificada en un string pensado para mostrarse en pantalla.
**Decisión:**
1. El registry declara `group.primary: true` en la variante que el botón incluye. Son `brutos`, `gs_pers` y `nr` en modo `'Controlar'`, las dos de Variaciones (el grupo tiene **dos** primary, y está bien: son dos reportes distintos, no una variante del otro) y Acreditaciones, que es la única variante de su grupo.
2. El filtro pasa a ser `!ctrl.group || ctrl.group.primary`. Un control sin grupo no tiene variantes y entra siempre.
3. Las variantes "Generar Reporte" de Brutos, GS Pers y NR quedan **afuera**: son el entregable, y el control gemelo que las valida ya entra. Acreditaciones sí entra aunque su `mode` sea `'Generar Reporte'`, porque es el control, no una segunda forma de uno que ya está seleccionado.
**Alternativas descartadas:** Ampliar el filtro a todos los `mode` que hoy son controles reales (arregla los dos clientes rotos pero deja la intención atada a strings de UI: la pill se renombra y el botón cambia de comportamiento sin que nadie lo toque); seleccionar todo lo aplicable sin distinguir variantes (un click generaría entregables además de correr controles).
**Motivo:** Decisión de Guillermo el 2026-08-12, sobre el bug abierto #2 de la auditoría de escalabilidad. Cubierto por `tests/controlsRegistryScope.test.js`, que falla si alguien agrega un grupo nuevo sin declarar cuál es su variante principal.

---

## D-041 — Contrato de export como fuente única de la obligatoriedad de columnas; omisión declarada como resolución de la tensión con D-036

**Fecha:** 2026-08-12
**Contexto:** Willy pidió "que todo lo que se usa para una exportación sea mandatorio" después de que un badge de "sin asignar" no apareciera en un panel. Una auditoría de 214 campos de mapeo (8 buckets, verificación adversarial de cada hallazgo) encontró 102 campos en severidad alta — pero **15 de esos 102 ya tenían `required: true` y aun así se filtraban**: la obligatoriedad vivía en tres lugares que no se hablan entre sí (`FIELD_DEFS` de `js/ui/fileUpload.js`, que sí bloquea; `TAB_*_FIELDS` de `js/ui/controlsWizard.js`, donde el flag es puro CSS; y una lista de 4 claves cableada a mano en `canGoNext`, que por eso dejaba a los 18 conceptos de NR sin ningún gate). Marcar más campos `required: true` no alcanzaba — el mecanismo que lo hace cumplir estaba roto, no faltaban flags.
**Decisión:**
1. **Fuente única:** `js/exports/contracts.js` declara, para cada export, sus columnas y de qué clave de mapeo sale cada una (`EXPORT_CONTRACTS`). La obligatoriedad de una clave de mapeo (`necessityOfKey()`) se **deriva** recorriendo los contratos, en vez de tipearse en un flag por cada superficie que la valida.
2. **Tres niveles de necesidad**, no un booleano: `CLAVE` (sin esto el parser ni puede leer el archivo, no admite omisión), `OBLIGATORIA` (el destino la espera, pero admite que se declare ausente), `OPCIONAL` (D-036: si no está, se informa y no bloquea). El nivel intermedio es lo que un `required: true`/`false` no puede expresar.
3. **La tensión con D-036** ("un dato ausente es resultado válido") se resuelve con `OMITIDO`, un sentinel que el analista declara con un toggle "⊘" junto a la columna (mismo patrón que `NO_LIQUIDADO` de `variacionesConceptMap.js`, sin motivo de texto libre — la fricción de escribir por qué en cada uno de 18 campos pesa más que el valor de guardarlo). `OMITIDO` cuenta como "resuelto" para el gate, y como ausencia real (no como cero) para todo el código que ya hacía `columna ? … : null` — no hizo falta tocar los `run()` de los controles.
4. **Un campo `OBLIGATORIA` no bloquea hasta que exista la vía de escape en esa misma superficie.** Es la razón por la que el Paso 1 (fileUpload.js) y el Paso 2 (canGoNext + omisión) se separaron: activar el bloqueo de `OBLIGATORIA` sin la omisión declarada habría roto la carga de cualquier archivo de NR al que le falte uno de los 18 conceptos — y ningún cliente los tiene todos.
**Riesgo conocido, no resuelto:** el mapa de necesidad (`fieldNecessityMap()`) es plano por clave, no por `(fileType, clave)`. Hoy no hay colisión real entre contratos (verificado y blindado con un assert permanente en `tests/exportContracts.test.js`), pero un contrato futuro con la misma clave y otra necesidad se resolvería mal — se prestaría la necesidad más fuerte de un archivo no relacionado. Se decidió blindar con un test en vez de rediseñar el esquema a `(fileType, clave)`: el rediseño es más código para un riesgo que hoy es cero.
**Alternativas descartadas:** Marcar `required: true` en los campos que faltan sin tocar el mecanismo (no arregla nada — 15 de 102 ya lo tenían); un flag booleano único en vez de tres niveles (no puede expresar "obligatoria pero con salida" sin una segunda estructura aparte); omisión con motivo de texto libre obligatorio (más fricción, mismo riesgo de "firma sin verificación" que la versión sin motivo — ver el límite explícito más abajo).
**Límite conocido, no un descuido:** la omisión declarada es una firma, no una prueba — un analista puede declarar ausente una columna que el archivo sí trae. La mejora sobre el estado anterior es que queda asentado, visible en el panel y fuera del semáforo verde; no que sea imposible.
**Motivo:** Decisión de Willy el 2026-08-12, sobre la auditoría de campos-vs-export. Plan completo, con lo que falta y lo que este diseño no resuelve (D-038, `toNum`, el mis-mapeo que la mandatoriedad *empeora*), en `specs/contrato-export.md`.

---

## D-042 — Fundamentos de cálculo compartidos: un `toNum`, una clave de legajo, un módulo de consolidación

**Fecha:** 2026-08-12
**Contexto:** La Fase 1 del plan de escalabilidad estaba trabada desde el 2026-08-11 esperando dos
decisiones de Willy, y trababa a su vez al resto del plan. El problema de fondo era medible: **7 copias de
`toNum`**, **3 criterios distintos de clave de legajo** (D-038) y **4 copias del par
`groupRowsByLegajo`/`sumColumn`** con cuatro nombres distintos (`groupTabRowsByLegajo`/`sumTabColumn` en
Brutos y GS Pers, `groupRowsByLegajo`/`sumColumn` en NR y Variaciones). La consecuencia no era estética: el
bug de "consolidar por legajo en vez de pisar" se arregló **cuatro veces por separado** (Brutos `bba8958`,
NR `b2f8bef`, GS Pers el 2026-08-11, GS Pers modo Reporte el 2026-08-12), porque la copia número N siempre
se olvida.
**Decisión:**
1. **`toNum` único en `js/utils/currency.js`.** No se unificó "hacia el más común" ni se adoptó el parser
   es-AR de Variaciones a ciegas — las dos cosas rompían al revés, y es lo que hacía que la decisión no
   fuera mecánica. El criterio es **distinguir los dos casos de entrada**: un `number` (SheetJS ya parseó
   la celda del `.xlsx`) pasa sin tocar; un string se lee como es-AR. Cuando hay dos separadores, el
   **último** es el decimal (así `"1.234,56"` y `"1,234.56"` dan lo mismo sin adivinar locale); con un solo
   punto, es separador de miles sólo si forma grupos de tres exactos (`"1.234"` → 1234), y si no es decimal
   (`"1234.56"` → 1234.56, que las 6 copias naive leían como `null` y la de Variaciones como `123456`).
2. **Clave de legajo:** ver D-038, cerrada el mismo día. `js/utils/legajo.js`, default `sin_ceros`,
   configurable por cliente, resuelta una vez por corrida en `mapping.legajoKeyMode`.
3. **`js/controls/consolidate.js`** con `groupRowsByLegajo(rows, col, { keyFn })`, `sumColumn(group, col,
   { toNum })` y `lastRow(group)`. Los dos primeros **parametrizados**: el intento anterior de este plan
   proponía una versión sin parámetros, que rompía Variaciones. Las 4 copias se borraron.
4. **`js/controls/tabCodes.js`** con `buildColByCode` (estaba duplicado en `rendXEe` y `rendVsTabu`) y las
   semillas de código de concepto confirmadas contra un Tabulado real — ver D-039.
5. **Los dos lados de cada cruce se consolidan.** Brutos y GS Pers consolidaban el Tabulado pero recorrían
   el reporte fila por fila (`brutosRows.map`), lo que da una diferencia falsa en cuanto el reporte trae dos
   filas de un legajo. Verificado que el Reporte de NR real **sí** trae una fila por liquidación (un legajo
   con 9 pagas aparece 9 veces en los dos archivos), así que la asimetría era una bomba de tiempo, no un
   caso imposible. Los archivos de Brutos y GS Pers del período de muestra no traen legajos repetidos, así
   que el cambio no altera ningún resultado de hoy.
**Alternativas descartadas:** Emparejar copia por copia sin extraer (es lo que se hizo cuatro veces con el
bug de consolidación); extraer la consolidación antes de tener el `toNum` único (rompía Variaciones, por eso
el orden de las fases era obligatorio y no preferencia); dejar `norm()` como clave de legajo y sólo
documentar la diferencia entre módulos (la clase de divergencia que cuenta distinto sin fallar).
**Verificación:** `tests/consolidate.test.js` (69 asserts, en la cadena de `npm run test:unit`) + corrida
de NR, GS Pers y los tres modos "Generar Reporte" contra los archivos reales de Marval 04-2026 que trajo
Willy: 527 legajos consolidados de 543 filas de reporte, 0 diferencias, una fila por empleado en los tres
entregables, y el legajo de 9 liquidaciones sumando 30.000 en los dos lados.
**Lo que esto NO resuelve:** el `norm()` de limpieza de texto sigue copiado en cada módulo (4 líneas, sin
ambigüedad semántica — no es la clase de duplicación que produce bugs); el override de clave de legajo por
corrida (ver D-038, punto 2); y los 6 puntos de integración de un control nuevo, que esta entrada no baja
— lo que elimina es que uno de ellos sea "copiá el helper de consolidación de otro control".

---

## D-043 — Pasos 4a/5 del contrato de export: `writeContractSheet` y el falso verde de "0 diferencias"

**Fecha:** 2026-08-13
**Contexto:** D-041 dejó el Paso 5 como "el que mata el último falso verde conocido": si el archivo de
Brutos o de GS Pers nunca tuvo su columna mapeada (`salBaseColumn`, `aCuFutAumenColumn`,
`gtosPersonalesColumn`, `dtoCocheraColumn` — `OBLIGATORIA` en el contrato pero sin bloqueo en la carga del
archivo, ver la nota de alcance del Paso 2 en D-041), la pantalla de resultados leía "0 diferencias" como
"todo verificado". El mecanismo exacto: `relevantRows` (definido antes de esta entrada) cuenta un legajo
como "evaluable" si hay **algún valor real en cualquiera de los dos lados** — con el Tabulado aportando
sueldos reales y el archivo del reporte vacío por la columna sin mapear, `relevantRows` salía grande y
`diffRows` salía en 0 (nunca hay par para comparar), así que el tile "Sin diferencia" contaba esos legajos
como verificados sin haber comparado ni uno.
**Decisión:**
1. **`js/exports/contractSheet.js` (Paso 4a).** `writeContractSheet(wb, contract, rows)` es el único lugar
   que hace `ws.addRow` para un export con contrato — layout:'fijo' (D-041): las columnas de
   `contract.columns` salen siempre, en ese orden, con la celda vacía si `row[key]` es `null`.
   `contractColDefs(contract)` da la misma lista en la forma que ya usan la tabla de pantalla y el CSV.
   Brutos y GS Pers modo Reporte migrados — los `colDefs` que cada uno tenía **dos veces** (pantalla vs
   export, ya divergidos: el `width` sólo vivía en la copia del export) desaparecen. NR Reporte no lo
   necesitaba: ya emitía las 18 columnas siempre.
2. **`unitsEvaluated` (Paso 5).** `summarizeBrutos`/`summarizeGsPers` distinguen "evaluado" (los DOS lados
   tenían dato — `ctrlXxx !== null`) de "relevante" (algún valor real en cualquiera de los dos lados). El
   tile "Sin diferencia" pasa a contarse sobre `unitsEvaluated`, no sobre `relevantRows`. Con
   `unitsEvaluated === 0` (nada comparable en absoluto), `summary.status` pasa a `'error'`.
3. **`'error'` es el lever existente, no una categoría nueva.** `computeSemaforoStatus()` (semaforo.js) es
   compartida por las 4 pantallas (checklist, wizard, resultados, lista de clientes) y CLAUDE.md la trata
   como intocable a la ligera — no se le agregó un cuarto estado. El único lever sancionado para forzar un
   color sin pasar por el % de diferencia es `summary.status === 'error'`, que ya usan las 4 pantallas de
   la misma forma (verificado leyendo las 4 antes de decidir esto). Un control que evaluó CERO legajos de
   los que tenía es, por definición, un estado de error.
4. **Cobertura parcial no fuerza error completo.** Si un campo está mapeado y limpio y el otro no, sólo el
   insight del campo faltante avisa "sin datos para comparar" — el campo que sí verificó no queda tapado
   por un rojo desproporcionado. `status:'error'` sólo se fuerza cuando **ningún** campo del control tuvo
   ni un legajo evaluado.
**Alternativas descartadas:** Agregar un 4° estado a `computeSemaforoStatus` (ej. `'sin-evaluar'`) — más
riesgoso de tocar una función compartida por 4 pantallas para un caso que el mecanismo existente ya cubre;
cambiar el denominador del semáforo (`unitsTotal` → `unitsEvaluated`) en vez de usar el status — deja
`computeSemaforoStatus(0, 0)` devolviendo `'ok'` igual (`!unitsTotal` es la primera guarda de esa función),
así que no resuelve el caso "cero evaluados" sin tocar la función de todas formas; forzar `'error'` también
en cobertura parcial — tapa un campo limpio por otro sin mapear, desproporcionado.
**Verificación:** `tests/contractSheet.test.js` (fake mínimo de ExcelJS — no es una dependencia de npm, se
carga por CDN en el navegador); `tests/brutosControl.test.js` (nuevo — no existía ningún test de Brutos) y
`tests/gsPersControl.test.js` cubren `unitsEvaluated`/`status:'error'`/cobertura parcial;
`tests/e2e/brutosGsPersEvaluados.spec.js` en un navegador real, con capturas en claro y oscuro — confirmado
que falla si se revierte el fix del tile "Sin diferencia" (se probó explícitamente, no se asumió).
**Motivo:** Continuación directa de D-041 (Paso 5, "el que mata el último falso verde") — misma auditoría,
mismo pedido de Willy.

---

## D-044 — Cierre de la Fase 2: `css/components.css` tenía 6 tokens sin default en `:root`

**Fecha:** 2026-08-13
**Contexto:** El grep del 2026-08-12 (ver nota de Fase 2 en `specs/plan-escalabilidad-fases.md`) había
encontrado hex fuera de `tokens.css` en `css/components.css` y lo dejó sin tocar "a propósito" — sin
navegador real disponible en el entorno, tocar CSS que renderiza en toda la app no se podía verificar, y
asumía que los fallbacks `var(--token, #hex)` eran "posiblemente muertos igual que los de
`helpPopover.js`". Con Chromium disponible en el sandbox desde esta sesión, se pudo medir en vez de
asumir — y el supuesto estaba mal para el caso que más importaba.
**Hallazgo:** `--color-banner-text`, los 4 `--color-toast-*` y `--color-warning-bg-hover` sólo tenían
valor dentro de `@media (prefers-color-scheme: dark)`, `[data-theme="dark"]` y `[data-theme="light"]` —
nunca en un `:root` base, a diferencia de todo lo demás en `tokens.css` (que define el claro en `:root` y
recién después overridea el oscuro). En el estado por default del navegador (sin `data-theme`, sistema en
modo claro) ninguna de las tres reglas aplicaba: la variable quedaba indefinida, confirmado con
`getComputedStyle(:root).getPropertyValue(...)` devolviendo `''` en un navegador real. No se rompía nada
visible porque el fallback inline tapaba el hueco exacto en el que hacía falta — pero eran los únicos 6
fallbacks vivos de toda la lista que el grep había encontrado, no "posiblemente muertos".
**Decisión:**
1. Se agrega un `:root` base a `css/components.css` con los 6 valores en claro — mismo patrón que
   `tokens.css` usa para todo lo demás. Los 6 fallbacks inline, ahora sí muertos, se sacan.
2. `#009ABF`/`#B71C1C` (hover de `.btn--primary`/`.btn--danger`/`.pill--active`) y `#fff` (texto sobre
   `var(--celeste)` en `.ctrl-filter.is-active`/`.ctrl-row--active`/`.threshold-checkbox-static__box`/
   `.exec-step__dot`) se relocalizan a `--color-primary-hover`/`--color-danger-hover` (`tokens.css`) y
   `var(--color-white)`, con el **mismo valor exacto** — verificado en navegador real (captura antes/
   después, claro y oscuro, estado `:hover` incluido) que no cambia nada visualmente. No se les inventó un
   tono distinto por tema: eso es una decisión de diseño que nadie pidió, no una migración mecánica.
**Alternativas descartadas:** Sacar los 6 fallbacks sin agregar el `:root` (rompía el banner de privacidad
y los 4 toasts en el estado por default); inventar valores de hover distintos por tema para
`--color-primary-hover`/`--color-danger-hover` (ninguna de las dos bases —`--color-primary`/
`--color-danger`— sigue el mismo patrón entre sí: `--color-primary` es fijo en los dos temas,
`--color-danger` sí varía — diseñar un hover "correcto" para cada caso es un juicio de diseño, no algo que
se pueda derivar mecánicamente, y no hay un defecto confirmado que lo exija).
**Verificación:** `tests/e2e/tokenDefaults.spec.js`, confirmado que la primera aserción falla si se saca
el `:root` nuevo (se probó explícitamente: revertido, corrido, visto fallar, restaurado). Screenshots en
claro/oscuro para banner, toasts, botones (normal + `:hover`), pill, checkbox y exec-step.
**Motivo:** Continuación del plan de escalabilidad, Fase 2 — cierra el último ítem que quedaba abierto de
esa fase.

---

## D-045 — Paso 6 del contrato de export: un contrato es un PISO, nunca un techo (y la colisión de clave plana dejó de ser hipotética)

**Fecha:** 2026-08-12
**Contexto:** El Paso 6 (que los 7 controles restantes declaren su contrato) destapó dos cosas al
intentar escribirlo, ninguna de las dos prevista en D-041.

**1. Un bug vivo en `main`, no una deuda.** `blocksProgress()` decía
`if (necessity === OPCIONAL) return false` **antes** de mirar el flag legado, así que un contrato podía
*apagar* un `required: true` que ya existía. Y lo estaba haciendo: `puestoColumn` existe en dos
`FIELD_DEFS` con necesidades opuestas (`tab_control` opcional · `cat_empleados` **required**), el mapa de
necesidad es plano por clave y no por `(fileType, clave)`, y el contrato de `brutos_reporte` la declara
OPCIONAL desde el lado del Tabulado. Resultado: la **Columna de Puesto del Reporte de Categorías dejó de
bloquear**. Se podía subir el archivo sin ella, y EE x CATEG salteaba en silencio el chequeo de
discrepancias de Puesto (`if (cm.puestoColumn && tm.puestoColumn)`) y armaba la "Distribución por Puesto"
agrupando por una columna sin resolver. Es exactamente el default silencioso que el Paso 1 había cerrado
para esos mismos 6 campos (ver el comentario del panel de remapeo en `fileUpload.js`): el fix de entonces
lo reabrió para uno de ellos. Alcance medido: **1 campo hoy**, y el Paso 6 lo multiplicaba
(`costoTotalColumn` era el siguiente).

**2. El assert que D-041 dejó "por las dudas" se disparó.** D-041 documentó el mapa plano como
"fragilidad, hoy no hay colisión real (verificado)" y lo blindó con un assert de "ninguna clave pide
necesidades distintas en contratos distintos". Con los contratos del Paso 6 hay **dos** colisiones
legítimas: `puestoColumn` y `costoTotalColumn` (`rend_file` opcional · `costo_total_file` required). No
son un error a corregir en los contratos —la misma columna es opcional en un archivo y obligatoria en
otro— sino la señal de que el esquema plano no puede declararlas sin mentir de un lado.

**Decisión:**
1. **`blocksProgress()`: el contrato suma obligación, nunca la saca.** Sólo `CLAVE` bloquea por sí sola;
   todo lo demás cae al `required` del `FIELD_DEFS` de **su propio** fileType, que sí está scopeado. Es lo
   que el diseño siempre dijo (el test lo afirma desde el Paso 0: "el mapa derivado no le baja la necesidad
   a nada que hoy ya bloquea"); el código decía otra cosa. Con esto la colisión de clave plana deja de
   poder producir un gate incorrecto, aunque siga sin poder representarse.
2. **El assert de "no debilitar" se deriva de `FIELD_DEFS`, no de una lista a mano.** La versión anterior
   enumeraba 6 claves elegidas al escribirla y el caso que se escapó no estaba entre ellas. Ahora recorre
   los 15 fileTypes: toda clave con `required: true` tiene que seguir bloqueando. `FIELD_DEFS` se exportó
   de `js/ui/fileUpload.js` sólo para esto.
3. **El assert de colisión se hace preciso en vez de amplio.** Lo que puede dar un gate incorrecto es que
   una clave sea `CLAVE` en un contrato y no-`CLAVE` en otro — eso sigue prohibido. La divergencia
   OPCIONAL/OBLIGATORIA queda permitida y **contada**: el test afirma que son exactamente 2 y las nombra,
   así que si aparece una tercera hay que mirarla, no descubrirla en producción.
4. **Se declaran 5 de los 7 contratos**, y los contratos del Paso 6 declaran **semántica, no layout**
   (nada de `width`/`groups`/`headerRows`/`diffHighlight`). Sus writers todavía arman el `.xlsx` a mano:
   un `width` declarado que ningún writer lee es una segunda fuente de verdad que se desincroniza del
   archivo real sin que nada avise — justo lo que el contrato existe para evitar. Un assert lo hace
   cumplir en las dos direcciones (los migrados declaran layout, los no migrados no).
5. **`acreditaciones_reporte` es el primer `audience: 'finanzas'`**, y con eso **D-020 pasa de comentario a
   assert**: sus columnas tienen que estar en `FINANZAS_ALLOWED_KEYS` (legajo, nombre, CUIT, neto, fecha,
   banco, CBU) y no puede aparecer ninguna de conteo/dotación/alta/baja.

**Lo que queda afuera, a propósito:** `variaciones` y `acumuladores`. `ExportContract` modela **una** hoja
con nombre declarado, y esos dos generan un **conjunto** de hojas calculado en runtime (una por grupo de
conceptos configurado por cliente · una por período). Declararles un contrato de una hoja pondría en
`sheet` un nombre que nunca aparece en el archivo — una mentira en la fuente única, peor que no declararlos.
Ninguno de los dos usa claves de `FIELD_DEFS` (sus parsers dan filas de forma fija), así que no declararlos
no deja ningún gate sin derivar: es el único costo, y es cero.

**Verificación:** `tests/exportContracts.test.js` (970 asserts). El barrido nuevo se probó revirtiendo el
fix de `blocksProgress`: falla en `cat_empleados.puestoColumn`, se restaura, pasa. `npx playwright test`
completo para descartar un ciclo de módulos como el de D-041 (`contracts.js` ahora importa también
`COLS` de `rendVsTabu.js`).
**Motivo:** Paso 6 de `specs/contrato-export.md`.

---

## D-046 — El asiento de FINADIET entra a la app como control, no como HTML standalone en `reportes/`

**Fecha:** 2026-08-12
**Contexto:** El asiento contable de remuneraciones de FINADIET (lógica y tablas validadas con Gaby
Fukuhara sobre datos reales el 12/08/2026) se construyó primero como HTML standalone en
`reportes/finadiet-asiento-remuneraciones.html` (PR #111), citando el patrón de D-022 — el reporte de
Variaciones de OPmobility. Pero D-022 ya había sido corregida por **D-023**: ese standalone se trajo a la
app porque Willy fue a buscarlo a la pantalla de Controles del cliente y no estaba, "y ahí es donde tiene
que estar". Los dos motivos por los que D-022 descartó `mode: 'Generar Reporte'` tampoco aplican al asiento:
es **un** período con **un** archivo (no una comparación entre dos), y el entregable es un `.xlsx` para el
cliente, no un PDF. Desde D-022, además, el registry ganó exactamente la forma que este caso necesita —
`tabRequired: false` + un `additionalFiles` + un `.xlsx` de salida — y ya la usan dos controles
(`acreditaciones_reporte`, `acumuladores_ganancias`). FINADIET es cliente activo Meta4 del seed, así que
tiene pantalla de controles donde el control aparece solo.
**Decisión:**
1. **Entra al `CONTROL_REGISTRY` como `finadiet_asiento`** (`scope: 'cliente'` de FINADIET, `mode: 'Generar
   Reporte'`, `tabRequired: false`, un archivo adicional `asiento_conceptos_file`). Con eso queda en la
   pantalla del cliente, deja `controlRuns` para el checklist mensual y el semáforo, y va a poder contarse
   en el registro de cobertura mensual (ROADMAP 3.2) — nada de lo cual existe para un HTML suelto.
2. **Nada de código propio para lo que ya está construido.** El importe se lee con `toNum` (F1), las dos
   solapas planas se escriben con `writeContractSheet` sobre un contrato de export declarado (Paso 6 de
   `specs/contrato-export.md`), la tabla de detalle usa `wireTableTools` (F3) y los colores salen de
   `tokens.css` (F2). El standalone tenía su propio `esc`, su propio formateo de moneda, su propio armado
   de `aoa`/`!cols`/`numFmt` y **SheetJS entero embebido minificado** (902 KB en el repo, contra la regla
   de CLAUDE.md de que las librerías entran por CDN).
3. **La tabla de cuentas contables, los centros de costo y el orden de categorías son config del cliente**
   (`controlConfigs`, `finadiet_asiento_config`), editables desde el Paso 2 y distribuidas en el seed. En el
   código quedan sólo como **semilla** (D-035). En el standalone estaban cableadas en el HTML y el aviso en
   pantalla decía "avisale a Gaby/Lau para agregarlas al archivo": una cuenta nueva del cliente exigía un
   commit. La config guardada **reemplaza** a la semilla, no se mergea — si se mergeara, una cuenta que el
   analista borró del editor volvería sola y el editor dejaría de decir la verdad sobre qué tabla corre.
4. **Las columnas del archivo se resuelven por nombre de encabezado, no por posición.** El standalone leía
   `COL = { IMPORTE: 25, ... }` y `aoa.slice(3)` sin mirar nunca la fila de encabezados: una columna
   insertada por Meta4 corre todas las de la derecha y sale un asiento **coherente y mal**. Ahora la fila de
   encabezados se ubica por densidad, la auto-detección propone por alias, y lo que el analista confirma en
   el Paso 2 gana siempre (D-039); una requerida sin resolver bloquea con asterisco en vez de leer la
   columna de al lado.
5. **Cero lados clasificables devuelve `{ error }`, no un asiento vacío.** Un asiento sin líneas tiene
   Debe = Haber = 0 y "cierra": el standalone mostraba banner verde "El asiento cierra" si se le subía
   cualquier otro excel. Es el mismo falso verde que D-043 mató en Brutos/GS Pers, y se resuelve con el
   mismo lever ya sancionado: `summary.status === 'error'`.
6. **Una fila sin centro de costo pierde sólo su pata de Resultado, no la fila.** El prefijo de una cuenta
   de Resultado ES el código del centro, así que sin centro esa pata no se puede asentar; la pata
   Patrimonial lleva `100` sin importar el centro y entra igual. El standalone descartaba la fila completa
   (`if (!centro) return`), que le sacaba al asiento un importe que sí correspondía — y de forma
   inconsistente con el caso "centro desconocido", donde sí conservaba la pata patrimonial.
7. **Tolerancia 0,01, la del proyecto.** El standalone declaraba 0,005 en su spec y comparaba con `>= 0.5`
   en el código: 49 centavos de descuadre se informaban como "el asiento cierra".
8. **`audience: 'finanzas'` en los dos contratos** (D-020): el archivo lo recibe Contaduría del cliente, así
   que no lleva legajo, nombre ni atributos del empleado — un asiento se lee por cuenta y por concepto, y el
   empleado no aparece en ninguna de las tres solapas. D-045 (mergeada antes que esto) ya había convertido
   D-020 en un assert con `FINANZAS_ALLOWED_KEYS`, una allow-list modelada sobre Acreditaciones, que es un
   archivo de **pago**. Un asiento es el otro destino legítimo de Finanzas y pide columnas distintas, así que
   la lista pasa a declarar los dos usos —pagar (legajo, nombre, CUIT, CBU, banco, importe, fecha) y asentar
   (cuenta, concepto, código de concepto, debe, haber)— y el assert de "hay exactamente un contrato finanzas"
   se cambia por "hay al menos uno": ese número va a seguir creciendo y contarlo no prueba nada, mientras que
   la allow-list sí — una columna nueva en un export de Finanzas no pasa hasta que alguien la agregue a mano.
**Alternativas descartadas:** Dejarlo standalone y sólo arreglarle los bugs (queda afuera del checklist, del
semáforo y de la cobertura mensual, y con la tabla de cuentas cableada seguiría necesitando un commit por
cada cuenta nueva del cliente); mergear la config guardada sobre la semilla (una cuenta borrada del editor
resucita); mantener las posiciones de columna como fallback silencioso cuando el encabezado no se reconoce
(es exactamente el default silencioso que CLAUDE.md prohíbe — el Paso 2 ya es la vía de escape visible);
darle contrato de export también a la solapa ASIENTO (no es una tabla plana: tiene encabezado con mes y
fecha, filas de título por bloque y total al pie; forzarla sería más maquinaria que la que el caso pide,
mismo criterio con el que el Paso 4b quedó separado del 4a).
**Motivo:** Corrige el alcance del PR #111 antes de que entre. La lógica contable y las tablas de ese PR se
conservan enteras (son el trabajo validado con Gaby); lo que cambia es dónde vive y de dónde saca sus datos.

---

## D-047 — Migrar los writers del Paso 6: al writer le faltaban fila de TOTAL y filas atenuadas

**Fecha:** 2026-08-13
**Contexto:** D-045 declaró la semántica de los 5 contratos que le faltaban al Paso 6 (Rend vs Tabulado, Rend
vs Asiento, Rend x EE, EE x CATEG ×2 hojas, Acreditaciones) pero dejó sus writers armando el `.xlsx` a mano
— "Lo que falta para migrar los writers del Paso 6" en `specs/contrato-export.md` documentó por qué: al
writer (`js/exports/contractSheet.js`) le faltaban dos features que estos exports usan de verdad (fila de
TOTAL, filas atenuadas por dato) y dos que sólo usa una parte (fórmulas de Excel, multi-hoja) — migrar sin
las dos primeras hubiera sido una regresión visible en el entregable.
**Decisión:**
1. **`writeContractSheet`/`writeGroupedContractSheet` ganan `opts`.** `opts.totalRow` (mismo shape que una
   `row`, escrito al final con negrita + borde superior en las columnas numéricas + rojo si una columna
   `diffHighlight` supera 0.01); `opts.dimIf(row)` atenúa a gris una fila de datos completa (Rend x
   EE/Tabulado/Asiento: legajos o CC sin dato de un lado del cruce) — se aplica DESPUÉS del resto del estilo,
   así que el gris gana incluso sobre `diffHighlight`, igual que los 3 originales a mano; `opts.highlightIf`/
   `opts.highlightColor` (sólo en `writeContractSheet`) resalta la fila ENTERA con un color propio (EE x
   CATEG: naranja claro en Puesto/CC con diferencia, no sólo en la celda de la diferencia); `opts.headerLabel(col)`
   override del texto de un sub-encabezado individual (Rend vs Asiento: "Rend abr26" lleva el período de la
   corrida, que no es un dato del contrato).
2. **Las fórmulas de Excel no necesitaron ninguna feature nueva.** `row[c.key]` ya viajaba tal cual a la
   celda; un valor `{ formula, result }` (SUM(...), `=B2-C2`) lo escribe ExcelJS como fórmula sin que el
   writer tenga que saberlo. Lo único que hacía falta era desenvolver `.result` donde el writer necesita el
   NÚMERO (`diffHighlight`, la fila de TOTAL) — `numericValue()`, exportada porque el módulo que arma
   `opts.highlightIf` también lo necesita (EE x CATEG compara `row.diff` contra 0, y `row.diff` puede ser la
   fórmula).
3. **4 de los 5 migraron limpio; Acreditaciones se queda afuera, a propósito.** Rend vs Tabulado/Asiento (con
   `writeGroupedContractSheet`, headerRows:2, un grupo por categoría con sus colores — comparten `COLS` de
   `rendVsTabu.js`), Rend x EE (headerRows:1) y EE x CATEG ×2 hojas (con `writeContractSheet`) entraron sin
   forzar nada. Acreditaciones no: cada hoja de detalle lleva una fila de TÍTULO **antes** del encabezado
   (nombre de la lista + el total, para no bajar a buscarlo) — no es "encabezado + N filas iguales", y sumar
   un título opcional al writer para un solo consumidor es la abstracción que CLAUDE.md pide no forzar.
   Además el archivo es multi-hoja calculado en runtime (CONTROL + una por acreditación, mismo problema que
   `variaciones`/`acumuladores`, D-045) con fórmulas que cierran ENTRE hojas. Sigue con su `.xlsx` a mano;
   `tests/exportContracts.test.js` seguirá exigiendo que no declare layout mientras tanto.
4. **Un gris que no era el mismo gris.** Las 3 hojas de Rendimiento pintan "CC"/"Legajo" con `FFE0E0E0`, no
   con el `FFE8E8E8` genérico que ya usaba el writer para las columnas sin grupo (Brutos/GS Pers no tienen
   este problema: ahí SÍ coincide). Se resolvió con un grupo `meta` **sin `label`** — sigue sin generar merge
   de encabezado (misma rama que ya existía para "columna suelta"), pero aporta un `headerColor` propio en
   vez de caer al default. La fila de TOTAL usa esto para decidir si pinta fondo: sólo un grupo CON `label`
   (una categoría real) lo hace en `headerRows:2` — así "CC"/"Centro de Costo" quedan en negrita sin fondo en
   el TOTAL, igual que en los 3 originales a mano, mientras que en `headerRows:1` (Rend x EE) el TOTAL pinta
   la fila entera, coherente con que su encabezado también pinta todo.
5. **Una normalización cosmética, aceptada a propósito.** Dos diferencias sub-pixel entre los 3 originales de
   Rendimiento desaparecieron al pasar por el mismo writer: la fila de TOTAL de Rend vs Asiento no bolseaba
   su 2ª columna (vacía) y la de Rend vs Tabulado sí — ahora las dos lo hacen, invisible porque la celda está
   vacía; y el borde superior de la fila TOTAL de EE x CATEG usaba un gris ligeramente más oscuro
   (`FF888888`) que el borde genérico del writer (`FFB0B0B0`) — mismo criterio de "no es un bug, es la
   inconsistencia de tener 3 copias a mano" que ya aplicó el Paso 4b.
**Alternativas descartadas:** Forzar Acreditaciones al writer sumando "título opcional" + "multi-hoja" como
parámetros — dos features para un solo consumidor, exactamente lo que CLAUDE.md pide no hacer; darle a
`opts.dimIf` y `opts.highlightIf` un único mecanismo compartido — son visualmente opuestos (atenuar vs
resaltar) y ningún contrato necesita los dos a la vez, así que un solo hook con un modo termina siendo más
código para leer que dos hooks con un nombre cada uno.
**Verificación:** `tests/contractSheet.test.js` fija el layout de los 4 contratos ANTES de tocar sus módulos
— merges exactos, colores, fórmulas con y sin diferencia, fila de TOTAL con y sin fórmula, filas atenuadas
ganándole a `diffHighlight` — y se corrió sin cambios después de migrar `rendVsTabu.js`/`rendVsAsiento.js`/
`rendXEe.js`/`catXEmpleados.js` (mismo método que D-041/D-043). `tests/exportContracts.test.js`: los 4 entran
a `CON_WRITER`, `acreditaciones_reporte` se queda afuera. `npx playwright test` completo para descartar el
ciclo de módulos de D-041/D-045 (`rendVsTabu.js`/`rendXEe.js` ahora hacen `import()` dinámico de
`contracts.js`, que a su vez importa `COLS` de `rendVsTabu.js`).
**Motivo:** Paso 6 de `specs/contrato-export.md`, "Lo que falta para migrar los writers" — cierra el punto
7 pendiente de la Fase F4 del ROADMAP salvo por `fileTypes.js`.

---

## D-048 — Fase 4: registro declarativo de archivos y controles, y el fin del mapa de necesidad plano

**Fecha:** 2026-08-13
**Contexto:** Agregar un tipo de archivo tocaba **19 puntos** repartidos entre `js/ui/fileUpload.js` y
`js/ui/controlsWizard.js` (el plan decía ~12; contarlos uno por uno dio 19), y un control con
configuración propia sumaba **7 más**, todos en el wizard. Ninguno de los 26 tenía guard: olvidarse de
uno no rompe nada visible — el archivo sube igual y algo queda mal en silencio. El síntoma clásico era
una cadena de 11 `||` que armaba la línea de metadata: el tipo que no figuraba ahí caía al molde de
otro ("N legajos · N conceptos" en vez de "N registros") sin que nada avisara.

**Decisión:** la fase entró en **7 PRs mergeables por separado**, cada uno con cero cambio de
comportamiento visible y verificado contra la baseline:

1. **`js/ui/fileTypes.js`** — una ficha por tipo de archivo (`label`, `fields`, `parse`,
   `detectHeaders`, `autoDetect`, `meta`, `nameMapping`, `fixedFormat`, `flow`, `aliasOf`). Se llevó
   12 de los 19 puntos; `fileUpload.js` quedó 197 líneas más corto.
2. **Los dos flujos multi-archivo** (CONTA, Acumuladores) entran a la ficha con `flow`, en vez de dos
   `if (fileType === '…')` al principio de `initFileUploadStep`.
3. **El wizard deriva de la ficha:** `AUTO_DETECT` y sus 8 imports desaparecen; el hueco propio del
   Tabulado anterior y los dos redibujos del paso pasan a `fileSpec.slot` / `fileSpec.rerenderOnLoad`
   en el registry. Los dos redibujos eran el mismo caso escrito dos veces.
4. **Las 27 columnas del Paso 2** (`TAB_*_FIELDS` + el mapa de códigos) se mudan a
   `FILE_TYPES.tab_control.extraFieldGroups`.
5. **El mapa de necesidad se scopea a `(fileType, clave)`** — ver abajo.
6. **La config por control se declara en el registry** (`config: [{ key, stateKey, default, editor,
   mappingKey, … }]`), y el wizard deriva los cinco momentos de su ciclo de vida.
7. Skill, documentación y el barrido de ciclos como test permanente.

**Lo que cierra de fondo (el punto 5):** D-041 documentó `fieldNecessityMap()` como plano por clave y
lo blindó con un assert "por las dudas"; D-045 lo vio dispararse con **dos colisiones legítimas**
(`puestoColumn`: opcional en el Tabulado, `required` en el Reporte de Categorías · `costoTotalColumn`:
opcional en Rendimiento, `required` en el Reporte de Costo Total) y las dejó **contadas** porque el
esquema no podía representarlas. Ahora cada columna de contrato declara `fromFile`, el mapa se arma
por `${fileType}::${key}`, y `necessityOfKey(fileType, key)` / `blocksProgress(fileType, key,
legacyRequired)` cambian de firma. **El assert pasó de "las divergencias son exactamente 2" a "no hay
ninguna divergencia"** — con tres asserts nuevos que impiden conseguir ese cero borrando información:
las dos claves siguen viniendo de dos archivos distintos, y `costo_total_file.costoTotalColumn` sale
OBLIGATORIA mientras `rend_file.costoTotalColumn` sigue OPCIONAL, que es exactamente lo que el mapa
plano no podía expresar.

**Lo que la fase rescató de quedar implícito** (estaba en el código, sin nada que dijera que era a
propósito, y se habría perdido en el próximo refactor):
1. **`fixedFormat` no se deriva de `fields: []`.** Cuatro tipos no declaran columnas; sólo dos se
   parsean derecho. `acreditaciones_file` pasa igual por la pantalla de confirmación, que es lo único
   que le muestra al analista que subió el archivo correcto.
2. **El panel del Paso 2 y el gate de avance usan conjuntos distintos** de campos: el panel incluye
   los 5 compartidos, el gate no. Hoy da igual (los 5 son OPCIONAL), pero el día que uno suba a
   OBLIGATORIA importa.
3. **`readOnly` en la config:** Rend vs Asiento lee la agrupación de conceptos pero no la edita ni la
   guarda. Sin eso, correr sólo ese control persistiría una agrupación que su pantalla nunca mostró.
4. **Cuándo una config viaja como `null` y cuándo no viaja.** El asiento de FINADIET la manda siempre,
   incluso `null`, porque su `run()` distingue "nunca se configuró" de "configurado igual a la
   semilla" (D-035).

**Alternativas descartadas:** un PR monolítico (la fase es grande por tamaño, no por dificultad, y un
solo PR de ~1000 líneas sobre la pantalla de carga no se revisa); derivar `fixedFormat` de
`fields.length === 0` (le saca a Acreditaciones su pantalla de confirmación); poner el mapa de flujos
multi-archivo dentro de la ficha (cierra el ciclo `fileUpload → fileTypes → fileUpload`, y los ciclos
rompen sólo en el navegador, D-045); unificar los dos textos divergentes de la zona de drop de
Acumuladores (es una decisión de producto, no una migración mecánica — queda declarada y fijada por un
assert); scopear también `NO_TOCAR_TODAVIA` (subiría de necesidad a `puestoColumn` en algún archivo, y
Willy pidió dejarla como está).

**Verificación.** Cada paso, contra la baseline: `npm run test:unit` (31 archivos) y `npx playwright
test` con Chromium real, 12 passed / 12 failed, con la lista de fallos comparada **uno a uno** — los
12 son los que necesitan Dexie del CDN. Los pasos 4 y 6, además, por **equivalencia contra el código
anterior** sacado de git: las 8 combinaciones de controles seleccionados dan listas de campos
idénticas (panel y gate por separado, campo por campo con label y required), y el `mapping` que recibe
cada `run()` sale idéntico para los 16 controles en dos escenarios (cliente sin configurar y cliente
configurado). Tests nuevos: `tests/fileTypes.test.js` (531 asserts) y
`tests/controlConfigRegistry.test.js` (143), los dos en la cadena.

**El riesgo que este entorno no podía verificar, y cómo se cubrió.** Los ciclos de import rompen
**sólo en el navegador** (D-045): Node los tolera y los unitarios pasan igual. Y los 12 e2e que
levantan la app entera —los únicos que los agarrarían— no corren sin red al CDN. Se cubrió por dos
vías nuevas: `tests/e2e/moduleGraph.spec.js`, que importa `controlsWizard.js` (el grafo más grande de
la app) sirviendo Dexie desde `node_modules`, y `tests/moduleCycles.test.js`, un barrido estático de
los 69 módulos de `js/` — validado inyectando un ciclo real y confirmando que lo reporta con la ruta
exacta, porque un detector que siempre dice "todo bien" no prueba nada. Se sumó también
`tests/e2e/multiUpload.spec.js`: las dos pantallas multi-archivo eran la única superficie de carga sin
ninguna cobertura.

**Lo que esto NO resuelve, y queda reportado:** `tabIdCentroTrabColumn` y `tabIdCategoriaColumn` las
consume el contrato de `nr_reporte` y las completa sola la auto-detección, pero **no están en el panel
"Columnas del Tabulado"** — si la auto-detección se equivoca, el analista no tiene dónde corregirlas ni
cómo declararlas ausentes. Agregarlas cambia lo que se ve en pantalla, así que quedan listadas con su
porqué en `tests/exportContracts.test.js` y la decisión es de Willy. Tampoco se tocó: migrar el writer
que le falta al Paso 6 del contrato (`acreditaciones_reporte`), activar el bloqueo de `OBLIGATORIA` en
el formulario de carga, ni el override de clave de legajo por corrida (D-038 punto 2).

**Motivo:** Fase 4 de `specs/plan-escalabilidad-fases.md`, con la spec acordada punto por punto en
`specs/fase-4-registro-declarativo.md` antes de escribir código.

---

## D-049 — `tabIdCentroTrabColumn` / `tabIdCategoriaColumn` entran al panel del Paso 2

**Fecha:** 2026-08-13
**Contexto:** D-048 dejó reportado, para que lo decida Willy, que estas dos columnas las consume el
contrato de `nr_reporte` y las completa sola `autoDetectTabExtraConfig`, pero no estaban en el panel
"Columnas del Tabulado" — si la auto-detección se equivocaba, el analista no tenía dónde corregirlas
ni cómo declararlas ausentes. `tests/exportContracts.test.js` las llevaba en un `Set`
(`SIN_CAMPO_EN_LA_FICHA`) como excepción explícita al guard de que todo `from` de un contrato existe en
la ficha de su archivo.
**Decisión:** agregarlas como grupo propio de `FILE_TYPES.tab_control.extraFieldGroups`
(`js/ui/fileTypes.js`) — `nrIdent`, con `header: 'Identificación NR'`, en vez de meterlas en `shared`:
a diferencia de las 5 columnas compartidas (nombre, apellido, tres fechas), a estas sólo las lee
`nr_reporte` — ni Brutos ni GS Pers las tocan — así que van con `requiredBy: 'nr'` como `nrIndem` y
`nrOtros`, no con `requiredBy: null`. Las dos quedan `required: false` en la ficha, consistente con la
`NECESSITY.OPCIONAL` que ya tenían en el contrato — así que `pendingTabRequirements()` (el gate de
"no podés avanzar") sigue sin bloquear por ellas, exactamente como antes. Se sacó la excepción de
`tests/exportContracts.test.js`: ahora cruzan como cualquier otra columna contra la ficha.
**Alternativas descartadas:** dejarlas en `shared` (mezclaría en el subtítulo compartido dos columnas
que sólo NR usa, y el día que alguna suba a OBLIGATORIA el gate las aplicaría también a Brutos/GS Pers,
que es lo que la nota de `extraFieldGroups` en la ficha advierte que hay que evitar).
**Verificación.** `npm run test:unit` completo (los conteos de `tests/fileTypes.test.js` que dependían
del total de grupos/columnas de `tab_control` se actualizaron: 5→6 grupos, 27→29 columnas). Screenshot
manual del panel del Paso 2 con el Tabulado cargado: el subtítulo "Identificación NR" aparece entre
"Otros NR" y las 5 compartidas, con las dos columnas auto-detectadas contra un Tabulado de prueba.

---

## D-050 — Se unifica el texto de la zona de drop de Acumuladores con la etiqueta del tipo

**Fecha:** 2026-08-13
**Contexto:** D-048 encontró que la zona de drop de Acumuladores decía "Acumuladores (Axton)"
(`dropLabel` en la ficha) mientras la etiqueta del tipo (`label`, la que ven las demás pantallas) decía
"Acumuladores (export de Axton)" — divergencia anterior a la ficha, preservada a propósito en un paso
de cero cambio de comportamiento y fijada con un assert que avisaba el día que alguien la tocara
(`tests/fileTypes.test.js`). Quedó para que lo decidiera Willy.
**Decisión:** unificar en "Acumuladores (export de Axton)" — se sacó el `dropLabel` de la ficha
(`js/ui/fileTypes.js`) en vez de cambiar `label`, así que `dropLabelFor('acumuladores_file')` cae al
mismo fallback (`fileTypeLabel`) que ya usaba CONTA, sin necesidad de un override. `dropHint`
(" (uno por mes)") no cambia — no era parte de la divergencia.
**Alternativas descartadas:** quedarse con "Acumuladores (Axton)" cambiando `label` — hubiera tocado
la etiqueta que usan también el chip de "archivos que este control pide" (Paso 1) y cualquier otra
pantalla que lea `fileTypeLabel`, más superficie para un cambio que sólo pedía unificar la zona de
drop.
**Verificación.** `npm run test:unit` (los asserts que fijaban la divergencia en
`tests/fileTypes.test.js` pasan a afirmar que ya no diverge) y `npx playwright test
tests/e2e/multiUpload.spec.js` (2 passed) con el texto esperado actualizado.

---

## D-051 — `acreditaciones_reporte` va a mano **por diseño**: la excepción se declara, y se verifica contra su contrato

**Fecha:** 2026-08-13
**Contexto:** Último pendiente del Paso 6 de `specs/contrato-export.md`. D-047 migró 4 de los 5 writers y
dejó `acreditaciones_reporte` afuera con dos motivos: título antes del encabezado, y multi-hoja con
fórmulas entre hojas. Al ir a cerrarlo, el relevamiento celda por celda contra `writeContractSheet`
corrigió las dos mitades del planteo:

1. **Las fórmulas entre hojas no son un motivo.** Viven todas en la hoja CONTROL, que no tiene contrato
   ni lo va a tener (bloque de título, dos layouts según `splitByEmpresa`, filas de cierre). Dentro de
   una hoja de detalle la fórmula es `SUM(D3:D<n>)`, misma hoja, y desde D-047 eso viaja tal cual en
   `row[c.key]` sin que el writer tenga que saber nada.
2. **No faltan 2 capacidades, faltan 6**, cada una con este único consumidor: la fila de TÍTULO (celdas
   en las columnas 1/3/4 y un `'Total'` que no es la etiqueta de ninguna columna), el nombre de hoja en
   runtime, `numFmt` por columna como **string** (CUIT/CBU como texto — el CBU tiene 22 dígitos y ceros
   a la izquierda, como número Excel lo pasa a notación científica y se pierde; y Fecha con formato de
   fecha sobre un serial), la fila en blanco antes del TOTAL, el TOTAL sin borde superior, y
   `autoFilter`. Hoy `numFmt` sólo se puede **apagar** (`numFmt: false`), no fijar: sin esa capacidad la
   fecha saldría como `46142` — o sea que "migrar y aceptar diferencias cosméticas" no era una opción.

**Y el hallazgo que decidió la opción**, que no era ninguno de los dos anteriores: el contrato tenía **un
solo consumidor vivo**, el assert de D-020. Nada verificaba que el `.xlsx` emitiera esas 7 columnas y
sólo esas, así que `FINANZAS_ALLOWED_KEYS` probaba algo sobre la lista de columnas y **nada sobre el
archivo que se descarga**: una columna de fecha de alta o de dotación agregada a mano en el módulo salía
a Finanzas del cliente con los 1291 asserts en verde. El riesgo real no era el layout duplicado.

**Decisión (Willy, 2026-08-13):** el writer **no** gana las capacidades. `acreditaciones_reporte` queda
declarado como excepción permanente, y la excepción se paga con verificación:

1. **`CON_WRITER` y `SIN_WRITER_POR_DISENO` particionan `EXPORT_CONTRACTS`**, y viven en
   `js/exports/contracts.js` (no en el test: los leen dos tests, y el motivo de una excepción es una
   declaración sobre el export). Antes esto no era una partición — `CON_WRITER` vivía en el test y todo
   lo demás caía en un `else` con el mensaje "sin writer **todavía**", así que **un contrato nuevo que se
   olvidara del writer pasaba el test en silencio**, indistinguible de una excepción deliberada. Y
   "todavía" afirmaba una intención de migrar que en este caso no existe. El motivo es texto obligatorio
   (≥60 caracteres), para que la lista no se vuelva un opt-out cómodo.
2. **`tests/exportSinWriterConformidad.test.js`** arma el workbook de verdad —con el fake de ExcelJS, el
   mismo enfoque de `contractSheet.test.js`— y verifica que cada hoja de detalle emita exactamente las
   columnas del contrato, en orden, y que **ninguna fila escriba más allá de la última columna
   declarada**. Ese segundo assert es el que ataja lo que a D-020 se le escapaba. Está escrito para una
   población que crece: sumar una excepción exige su caso acá, y otro assert verifica que toda entrada de
   `SIN_WRITER_POR_DISENO` lo tenga.
3. **El encabezado sale del contrato** (`DETALLE_COLUMNS`), no de una copia a mano. Queda una línea
   limpia: el contrato declara la **semántica** (qué columnas y en qué orden), el módulo el **layout**
   (anchos, formatos, título) — que es la misma línea que ya usaban los contratos del Paso 6.
4. **`sheetNaming: 'runtime'`.** `sheet: 'Detalle de acreditación'` era un nombre que **nunca aparece en
   el archivo** (las hojas reales se llaman `01 A 02-07`, una por acreditación): exactamente la "mentira
   en la fuente única" que D-045 usó para dejar afuera a `variaciones`/`acumuladores`. Declararlo lo
   vuelve honesto, y un assert impide combinarlo con `CON_WRITER` (el writer usa `contract.sheet` literal).
5. **`buildAcreditacionesWorkbook()`** separada de `exportAcreditacionesToXlsx()` — puro movimiento de
   código — para poder inspeccionar las celdas sin DOM ni Blob. Completa la intención que el jsdoc del
   módulo ya declaraba ("así se puede verificar sin pasar por el DOM") y que la descarga contradecía.

**Alternativas descartadas:** sumarle las 6 capacidades al writer y migrar. Se descartó por tres razones,
en orden de peso: (a) 5 de las 6 tendrían un único consumidor, la abstracción que CLAUDE.md pide no
forzar; (b) hay que reescribir el archivo que recibe Finanzas del cliente y **no había ninguna cobertura
sobre sus bytes** para comparar contra qué; (c) **no compra la garantía**: la hoja CONTROL sigue a mano
bajo cualquier opción, así que "ningún export se escribe a mano" tampoco se cumple después del trabajo.
También se descartó la variante "migrar aceptando diferencias cosméticas" (precedente de D-047 punto 5):
acá una de las diferencias sería la fecha saliendo como número serial, que no es cosmética.

**Verificación.** El guardrail era que el archivo no cambiara: se comparó **celda por celda** el workbook
de `main` (con sólo el split mecánico aplicado, para poder llamarlo) contra el de esta rama, en los dos
escenarios de `splitByEmpresa`, volcando valor + font + fill + border + numFmt + alignment + anchos +
`views` + `autoFilter` + merges de las 5 hojas: **idénticos** (~49k caracteres de volcado). Y se confirmó
que la comparación no pasa por vacuidad cambiando el alto del encabezado de 18 a 20 y viéndola fallar en
la línea exacta. El test nuevo se validó con las dos regresiones que dice atajar: una 8ª columna en el
`addRow` de las filas de detalle (falla con "2 fila(s) escriben hasta 8 valores") y el encabezado vuelto
a cablear con una etiqueta cambiada (falla con el diff completo). `npm run test:unit`: 32 archivos, 0 ✗.
`tests/moduleCycles.test.js` en verde con el `import` estático nuevo de `contracts.js` en
`acreditaciones.js` — el gotcha de D-041/D-045, que acá no aplica porque `contracts.js` no importa
`acreditaciones.js`.

**Motivo:** cierra el Paso 6 de `specs/contrato-export.md`. Willy: *"esto nos va a seguir pasando"* — de
ahí que la excepción se diseñe como población que crece y no como caso especial: la forma de un
entregable la elige el destinatario, no el writer.

---

## D-052 — El gate de OBLIGATORIA llega a la carga de archivo: el toggle ⊘ primero, el bloqueo después

**Fecha:** 2026-08-13
**Contexto:** D-041 (punto 4) dejó la regla escrita: un campo `OBLIGATORIA` no bloquea hasta que exista
la vía de escape **en esa misma superficie** — bloquear sin la salida de "esto no lo trae" rompe la carga
de cualquier NR al que le falte uno de los 18 conceptos, y ningún cliente los tiene todos. El toggle ⊘
existía sólo en el panel del Paso 2 (`renderTabExtraConfig`), así que `blocksProgress()` dejaba caer
`OBLIGATORIA` al flag legado en la pantalla de carga, con el porqué en su docstring. D-048 lo listó como
pendiente ("no se tocó"). Spec confirmada por Willy punto por punto antes de codear:
`specs/obligatoria-gate-carga-archivo.md` (hoy el control de NR lo usa sólo Marval, así que la omisión
declarada por archivo cubre el caso real completo; la dirección de futuro —derivar los conceptos NR del
catálogo del cliente— quedó en `ROADMAP.md`, no acá).
**Decisión:**
1. **El toggle ⊘ entra a las dos superficies de `fileUpload.js`** —formulario de mapeo y panel de
   remapeo— con el mismo patrón visual del Paso 2, y **recién entonces** `blocksProgress()` pasa a
   devolver `true` para `OBLIGATORIA`. Los campos que cambian de comportamiento son exactamente 22
   (los 18 `nrKey` de NR, `salBase`/`aCuFutAumen` de Brutos, `gtos`/`dtoCochera` de GS Pers), y la lista
   no se cablea: `tests/uploadOmission.test.js` la deriva de `FIELD_DEFS` × `necessityOfKey()` y afirma
   que todo campo que bloquea-con-salida ofrece el toggle.
2. **El ⊘ sólo aparece donde corresponde** (`puedeOmitirse`): `OBLIGATORIA` por contrato y sin
   `required` legado. CLAVE no admite omisión, y un `required: true` sigue bloqueando duro — darle la
   salida le sacaría una obligación que ya existía (piso, nunca techo, D-045).
3. **`OMITIDO` viaja dentro de `mapping`** (`mapping[key] = OMITIDO`) y de ahí al perfil del cliente vía
   `saveFileProfile` — la omisión es una propiedad estable del cliente, igual que en el Paso 2, y se
   precompleta en la próxima corrida. Verificado antes de decidirlo: los parsers de NR/Brutos/GS Pers
   sólo leen `mapping.legajoColumn`, y aguas abajo `row[OMITIDO]` no existe en ninguna fila real, así
   que `sumColumn` da `null` (sin dato), no 0 — no se tocó ningún parser ni ningún `run()`.
4. **Defensa contra el perfil corrupto:** un `OMITIDO` colado en un campo que no ofrece ⊘ (una CLAVE,
   un required legado — la UI no lo escribe nunca) NO cuenta como resuelto en
   `pendingUploadRequirements()`. Si contara, el parser recibiría una "columna" que ninguna fila trae y
   seguiría de largo con 0 filas: el default silencioso exacto que el gate existe para cortar.
5. **La auto-detección respeta el ⊘ pero avisa** (decisión de Willy): nunca pisa una omisión declarada
   (misma regla que `shouldAutoFillTabValue` en el wizard), y si el archivo que se está subiendo trae
   una columna que matchea una clave omitida, un hint junto al campo lo dice — el cliente pudo haber
   empezado a liquidar ese concepto, y destildar el ⊘ es del analista.
**Alternativas descartadas:** activar el bloqueo sin llevar antes el toggle (rompe la carga de todo NR
real — es el escenario que D-041 punto 4 existe para impedir); omisión efímera por corrida en vez de
persistida (el Paso 2 ya persiste la suya, y "este cliente no tiene esta columna" es estable);
que la auto-detección pise el ⊘ cuando encuentra columna (rompe "es una decisión del analista");
extraer un componente de toggle compartido con el wizard (ata dos superficies con ciclos de import
que sólo rompen en el navegador, D-045/D-048 — el markup se imita, no se comparte).
**Verificación:** `tests/uploadOmission.test.js` (16 asserts, en la cadena) + los dos asserts de
`tests/exportContracts.test.js` que afirmaban el estado pre-activación, invertidos junto con el
mecanismo (como su propio comentario pedía); `tests/tabExtraOmission.test.js` pasa sin modificarse
(el wizard no se tocó). `tests/e2e/uploadOmission.spec.js` en Chromium real: subir un NR con 2 de los
18 conceptos → el submit bloquea nombrando la salida → ⊘ en los 18 → pasa; el remapeo dibuja la
omisión y destildar sin resolver vuelve a bloquear; la vuelta completa (perfil → precompletado → hint
de candidata) y capturas en claro y oscuro. Suite e2e completa: mismos 12 fallos que la baseline
(los que necesitan CDN, D-048), verificado corriendo la baseline con `git stash`.
**Límite conocido (heredado de D-041, no nuevo):** la omisión declarada es una firma, no una prueba —
un analista apurado puede declarar ausente una columna que el archivo sí trae. La mejora es que queda
asentada, visible y fuera del verde; no que sea imposible.

---

## D-053 — La muestra de valores de la columna elegida, y el aviso cuando su contenido no es lo que ahí va

**Fecha:** 2026-08-13
**Contexto:** Después de los PR #100-#129 quedó abierto un solo hallazgo del relevamiento de
escalabilidad, y no salía del inventario de bugs sino de la letra chica de `specs/contrato-export.md`
("lo que este diseño NO resuelve"): el **mis-mapeo**. Los 8 pasos del contrato de export lograron que una
columna **vacía** grite —gate, badge "⚠ sin asignar", toggle ⊘—, pero una columna **equivocada** sigue
pasando en verde: mapeada + obligatoria = satisfecha, aunque apunte al lugar errado. Y la mandatoriedad
lo *empeora*, porque un `required` queda satisfecho por el valor equivocado. Tres mecanismos verificados
en el código lo vuelven probable y no teórico: `autoDetectTabExtraConfig` recorre los encabezados por
fuera y las palabras clave por dentro (gana el primer encabezado que contenga cualquiera, no la palabra
más específica); las 3 copias de `fmtDate` convierten todo número entre 1 y 100.000 en una fecha
plausible; y el `type` que los contratos declaran no lo mira nadie.

Se le presentaron a Willy tres opciones y eligió el orden: **(1) muestra de valores → (2) aviso de tipo
→ (3) prioridad de la auto-detección**, esta última en otro PR. Spec previa acordada antes de codear:
`specs/muestra-y-aviso-de-columna.md`.

**Decisión:**

1. **La muestra va siempre visible**, dos valores reales debajo de cada columna elegida
   (`ej.: 15/03/2026 · 28/03/2026`). El caso más común es que el analista **no toque nada**, porque la app
   propone el mapeo sola: una muestra que aparece sólo al abrir el desplegable no la ve nadie. Se dibuja
   en las **dos** superficies donde se elige una columna (formulario de mapeo y panel de remapeo de
   `fileUpload.js`, y panel "Columnas del Tabulado" del Paso 2) y se rehace al cambiar de columna — si
   no, queda afirmando algo sobre la columna anterior, que es peor que no mostrar nada.
2. **El aviso avisa, no traba.** Un archivo raro del cliente no puede dejar al analista sin trabajar
   (D-036), y la salida declarada (⊘) es para "no viene", no para "está mal".
3. **Y queda anotado en la pantalla de resultados** de la corrida, para que el que revisa después vea que
   se corrió con una columna sospechosa. **Se recalcula, no se guarda**: sale de las filas y el mapeo que
   cada archivo de la corrida ya tiene guardados, así no hay una segunda copia que se desincronice del
   archivo con el que se corrió, y no cambia el esquema de la base.
4. **El criterio es conservador a propósito:** avisa sólo si **ninguno** de los valores mirados (hasta 20
   con dato) se parece al tipo esperado, y con menos de 2 valores no afirma nada. Un aviso que salta de
   más se ignora a la tercera vez y deja de proteger — el mismo riesgo de fatiga que `contrato-export.md`
   anota para las omisiones declaradas.
5. **`typeOfKey(fileType, key)` deriva el tipo esperado de los contratos**, hermana de `necessityOfKey()`
   y por el mismo motivo: ninguna pantalla tiene su propia lista de qué es qué. Y las 3 columnas que son
   fecha de verdad (`FECHA_ALTA`/`FECHA_BAJA`/`FEC_PAGO`) pasan a declarar `type: 'date'` en vez de
   `'txt'`. **`type` describía cómo se escribe el valor en el archivo final, no qué tiene que traer la
   columna de origen** — por eso estaban declaradas texto (pasan por `fmtDate` y salen como texto), y por
   eso el aviso no podía decir "acá va una fecha". Sin este alineamiento, la opción 2 no cubría el caso
   que la motivó.

**Alternativas descartadas:** mostrar la muestra sólo al abrir el desplegable o al pasar el mouse (no la
ve el que no toca nada, que es el caso común); trabar hasta confirmar (rompe D-036 y convierte el ⊘ en
"aceptar cualquier cosa"); guardar la lista de avisos con la corrida (una segunda copia que puede
desincronizarse del archivo, sin ganar nada: los datos para recalcularla ya están); sumar la copia número
29 de `esc` en el módulo nuevo o crear `js/utils/html.js` de paso (el escapador viaja como parámetro,
mismo patrón de `consolidate.js`, que es lo que D-042 aprendió a hacer bien); arreglar `fmtDate` en el
mismo PR (cambia el entregable de tres controles — queda anotado en `ROADMAP.md` con la decisión que
necesita).

**Motivo:** el mis-mapeo es el caso peor y el más silencioso —**da un número mal, no un vacío**, así que
ningún aviso de "columna sin asignar" lo agarra— y la única defensa que no depende de adivinar es que el
analista **vea** qué eligió. Por eso la muestra va primero y el aviso segundo: el aviso sólo puede
detectar lo que es distinguible por forma, y "un importe donde va otro importe" no lo es.

**Verificación:** `tests/columnHints.test.js` (55 asserts, en la cadena de `package.json`), con cada
propiedad crítica validada al revés — revertir `type: 'date'`, aflojar el criterio conservador a 1 valor,
o sacar el escapado hacen fallar asserts específicos (probado). `tests/exportContracts.test.js` sube a
1296 asserts con tres nuevos: los 3 `type: 'date'`, que ninguna clave declare dos tipos distintos, y que
`typeOfKey` devuelva `null` (no un default) para una clave que ningún contrato consume.
`tests/e2e/columnHints.spec.js` en Chromium real, 4 tests: la muestra aparece sin tocar nada y se rehace
al cambiar de columna, el ⊘ se la lleva, el panel del Paso 2 la muestra igual, y el aviso se lee en los
dos temas. **El `.xlsx` no cambia:** los 4 contratos con writer se escribieron celda por celda (valor,
fuente, relleno, bordes, `numFmt`, alineación, anchos, merges) con `type: 'date'` y con `'txt'` — salida
idéntica, y la comparación se validó cambiando un `type` que sí importa y viéndola diferir. Suite e2e
completa: los mismos 12 fallos que la baseline (los que necesitan CDN, D-048), verificado corriendo
`origin/main` en un worktree limpio.

**Límite conocido, escrito en la spec y en el módulo:** el aviso deja pasar lo que es indistinguible por
forma (un importe donde va otro importe; una fecha donde va un número, porque un serial de Excel *es* un
número). Eso lo ataja la muestra visible, no el aviso — y es la razón del orden. Y las columnas del
Paso 2 no se repiten en la pantalla de resultados porque la corrida no guarda ese mapeo (anotado en
`ROADMAP.md` como la decisión que falta).

---

## D-054 — Una sola barra superior de 54px con slots, y el body deja de scrollear

**Fecha:** 2026-08-13
**Contexto:** Segunda tarea del rediseño Fase 1 (`docs/rediseno/README.md` → "Orden sugerido", punto 2;
detalle por archivo en `CAMBIOS_TECNICOS.md` §3 y §5). Hasta acá la identidad y la navegación se
repartían en tres franjas apiladas que cada pantalla armaba por su cuenta: el `app-header` de 68px, el
bloque `page-actions` (volver + título + botones) que cada vista renderizaba dentro de su
`.page-content`, y la tira `wizard-steps` de 32px sólo en el wizard. Sumaban ~150px de alto en el Paso 2
y, como el que scrolleaba era el `body`, el botón "Siguiente" —que vivía en una barra sticky al pie de
la página— podía quedar fuera de vista o pisado. La pantalla de resultados resolvía lo mismo con un
tercer mecanismo, `setCompactHeader`, que achicaba el header global a 44px para hacerle lugar a su barra
de contexto.

**Decisión:**

1. **Una barra sola, siempre de la misma altura**, con huecos fijos: volver · Cliente · Período · pasos
   del wizard · hint · acción primaria · selector de tema. `#js-header-nav` se conserva como el slot de
   "volver" —los e2e y las vistas lo conocen por ese nombre—. `app-header--compact` se elimina: la barra
   ya no cambia de tamaño según la pantalla, así que nada tiene que acordarse de restaurarla.
2. **`setHeader({ back, context, steps, hint, primary })` define la barra ENTERA en cada llamada**: lo
   que no se pasa queda vacío. Las vistas la llaman al montar y no heredan restos de la pantalla
   anterior; el router además la vacía en cada cambio de ruta, así que una vista que tarde (o que falle)
   no deja el "volver" ni los pasos de la anterior colgados. **Sólo mueve DOM**: los handlers siguen
   siendo los de cada vista, que se pasan como `onClick`.
3. **El módulo vive en `js/ui/appHeader.js`, no en `js/main.js`**, aunque el handoff lo pedía ahí:
   `main.js` importa a todas las vistas, así que una vista importándolo de vuelta arma un ciclo, y un
   ciclo rompe la app en el navegador y en ningún otro lado (D-048, `tests/moduleCycles.test.js`).
   `main.js` lo re-exporta para que la API se pida desde un solo lugar.
4. **El `body` deja de scrollear** (regla 1 del rediseño): `.app-main` mide `calc(100vh - 54px)` y el
   contenido scrollea adentro. Es lo que garantiza que la barra y el botón de avance no se vayan de
   pantalla sin depender de un `sticky` por pantalla. Las filas 1 y 2 de esa grilla son para barras fijas
   de la pantalla (hoy, la de veredicto de resultados) y `.page-content` se ancla a la fila 3 aunque sea
   el único hijo: en una fila `auto` se estiraría con su contenido y el recorte se comería lo de abajo.
5. **La barra de resultados se parte en dos**: el volver y el "Cliente · Período" con su dot se van a los
   slots de arriba, y abajo queda la línea de veredicto con "Detalles del run". El semáforo lo sigue
   decidiendo quien llama (`computeSemaforoStatus`), la barra sólo lo pinta.

**Verificación:** las 5 pantallas recorridas en Chromium (home, Pasos 1/2/3 y resultados, más
agrupadores y checklist) en Sobrio y en Intenso: barra de 54px, `body` sin scroll, `.app-main` dentro del
viewport y la primaria a la vista en todas. Con el contenido más largo que la pantalla, scrollea la zona
y ni la barra ni "Siguiente" se mueven, y se llega al final del contenido. Suite e2e completa: los mismos
14 fallos que la baseline (los que necesitan CDN, D-048), verificado corriendo `main` con `git stash`.

**Lo que queda para las tareas siguientes del rediseño:** el selector de mes y el menú "Datos ▾" del home
(tarea 3), "← Anterior" al lado de la primaria en vez de en la barra al pie del wizard y el "Cancelar"
del Paso 3 (tareas 5 y 6), y el "⬇ Exportar" como primaria de resultados (tarea 7).


## D-055 — Paso 2: los archivos obligatorios abren la pantalla, y cada columna se pide con su nombre en criollo

**Fecha:** 2026-08-13
**Contexto:** Quinta tarea del rediseño Fase 1 (`docs/rediseno/README.md` → pantalla 4 y reglas 3 y 4;
`CAMBIOS_TECNICOS.md` §7, §8 y §9). El Paso 2 abría con el Catálogo de Conceptos —opcional, con default,
casi nunca se toca— en un `<details>` arriba de todo, y los archivos que la corrida sí necesita quedaban
abajo, cada uno con un `<h4>` propio. El panel "Columnas del Tabulado" pedía hasta 29 columnas con el
`label` de su ficha, que es el código del concepto: `'A_CTA_FUT_AUMEN — columna en Tabulado'`. El
analista que no lo tiene memorizado no puede decidir qué columna elegir sin ir a preguntar.

**Decisión:**

1. **Obligatorio arriba, opcional abajo.** Los casilleros de los archivos que la corrida necesita abren
   la pantalla en grilla de 2 columnas; el Catálogo de Conceptos y CC x Empleado bajan a un renglón
   dashed al final con su default dicho en palabras ("Usando el estándar (22 conceptos)", "Sin él, el
   centro de costo de cada empleado sale del asiento contable") y la carga detrás de un link.
   Excepción declarada: los dos formatos de Resumen de Agrupadores están marcados `optional` pero el
   gate exige uno de los dos (ver `canGoNext`), así que se quedan arriba —mandarlos a la zona de lo
   opcional diría que se pueden saltear— y ninguno lleva tag, porque ni "OBLIGATORIO" ni "OPCIONAL"
   serían ciertos. Lo aclara el checklist del panel: "Resumen (Largo o Tabulado)".
2. **Un casillero, cinco estados, el mismo tamaño** (`.dropzone`): vacío, arrastrando, procesando, aviso
   de sigla y cargado. Sin esto la pantalla saltaba en cada carga.
3. **La sigla en el nombre se chequea, y avisa sin trabar (D-036).** Cada ficha puede declarar `siglas`;
   si el nombre no trae ninguna, el casillero dice "No parece un X" y ofrece **Usarlo igual · Elegir
   otro**. Las dos salidas dejan al analista pudiendo seguir. `siglas` es **semilla, no identidad**
   (mismo criterio que `TAB_CODE_SEEDS`, D-035) y una ficha sin `siglas` no se chequea nunca: preferimos
   no avisar a avisar de más, porque un aviso que salta siempre se ignora a la tercera vez. El aviso
   viaja con el archivo (`siglaMismatch`) y se sigue viendo en el casillero cargado después de confirmar
   el mapeo — persistirlo en el run es la tarea 7 del rediseño.
4. **Nombre en criollo + código técnico + badge de origen + muestra, por campo** (regla 3). Los nombres
   viven en una **tabla** (`js/ui/fieldHelp.js`), no en una derivación: nada en el código sabe que
   `INDEM_ANT_DESP` es "Indemnización por antigüedad (despido)", y adivinarlo con reglas de texto daría
   nombres plausibles y equivocados. **Ninguna clave interna se renombra.** Cuatro claves quedan sin
   nombre criollo a propósito (`ASIG_PAS`, `REINT_GUARD`, `INCREMENTO_ST`, `GRA_VACNOG_SAC`): se
   muestran con su código, que es lo que se veía antes, hasta que Willy confirme qué nombran.
   `tests/fieldHelp.test.js` es el guard de que la tabla cubra las claves que el panel muestra y de que
   el código en mono sea el mismo que usa la auto-detección.
5. **La explicación de "qué pasa si esta columna falta" se genera de la necesidad del contrato**, no se
   escribe por campo: si se escribiera a mano podría decir algo distinto de lo que el gate hace de
   verdad. Cuando el campo está pendiente esa explicación baja a texto visible bajo el `<select>`; el
   resto del tiempo vive detrás del "?" (`helpPopover.js`, con su Escape y su click-afuera).
6. **El amarillo sólo para lo que hay que ir a resolver.** Una columna OPCIONAL vacía no se pinta ni
   lleva badge: el control corre igual. Marcarla como las que bloquean es el aviso que salta de más.
7. **El gate no cambia, cambia dónde se cuenta.** `canGoNext` sigue decidiendo. El hint de la barra pasa
   a ser compacto ("Falta: 1 archivo · 1 columna") y el detalle se lee en el checklist "Para ejecutar te
   falta" del panel lateral. Los dos salen de la MISMA lista (`step2Checklist`) para que no puedan decir
   cosas distintas.
8. **Los placeholders dicen qué hacer** (regla 5): "— Sin asignar —" / "— Seleccioná —" → "Elegí la
   columna del Tabulado…" (en la pantalla de carga, la columna del archivo que se está subiendo). El
   `value` sigue siendo `''`: para el gate y para el mapeo, "sin elegir" no cambió de significado.

**Verificación:** `tests/e2e/paso2Dropzone.spec.js` (9 casos) recorre el ciclo completo del casillero y
la grilla de campos en Chromium; el Paso 2 entero se recorrió a mano en el navegador (grilla de
casilleros, checklist del panel con "Falta: 4 archivos · 2 columnas" en la barra, renglones opcionales
abriéndose, columnas en claro y en oscuro). Suite e2e: los mismos 15 fallos que la baseline (los que
necesitan CDN, D-048), verificado corriendo `main` con `git stash`.

**Lo que queda:** el multi-archivo de Contabilidad Desglosada sigue con su pantalla propia sin
restylear (va con la tarea 8, que es la pantalla de Rendimiento vs Asiento), y los avisos de la corrida
todavía no viajan al run (tarea 7).

## D-056 — Paso 3: la corrida se muestra control por control, y termina en una runbar en vez de navegar sola

**Fecha:** 2026-08-13
**Contexto:** Sexta tarea del rediseño Fase 1 (`docs/rediseno/README.md` → pantalla 5;
`CAMBIOS_TECNICOS.md` §7, punto "Paso 3"). Hasta acá la ejecución mostraba una barra de progreso con un
checklist fijo de 3 renglones —"Leyendo N archivos Excel", "Cruzando N legajos", "Aplicando umbrales y
semáforos"— con anchos cableados (`EXEC_BAR_WIDTHS = ['6%','38%','70%','100%']`) y esperas de 220ms para
que se alcanzaran a ver. Esos renglones no eran los controles: con 4 controles seleccionados, el paso
"Cruzando legajos" abarcaba los 4 y no se sabía en cuál iba, ni cuál había terminado, ni cuánto tardó
cada uno. Al terminar, la pantalla navegaba sola a los resultados.

**Decisión:**

1. **Una tarjeta por control, con sus tres estados**: terminado (✓ verde, "N legajos cruzados ·
   terminado en 1,5 s" y una pill con el resultado), corriendo (spinner + borde celeste) y en cola
   (dashed, numerado). La unidad de la pantalla pasa a ser el control, que es la unidad en la que el
   analista piensa la corrida.
2. **La barra general mide controles terminados sobre el total, y nada más.** Es el único avance que el
   motor conoce: cada `run()` es sincrónico y adentro no reporta nada. Por eso **la tarjeta del control
   en curso no muestra porcentaje** —muestra una barra indeterminada—: un número que no sale del motor
   se lee igual que uno que sí, y el prototipo mostraba "62%" que ninguna función podría calcular.
   Mientras no terminó ninguno, la barra general también va indeterminada: quieta en 0% se lee como que
   no arrancó.
3. **Entre control y control se cede el hilo** (`setTimeout(0)`, no `requestAnimationFrame`: con la
   pestaña en segundo plano rAF no dispara y la corrida quedaría colgada). Sin eso el navegador no
   pinta el cambio de estado de las tarjetas y el clic en "Cancelar" no llegaría a procesarse hasta que
   terminara todo.
4. **"Cancelar" es la única acción mientras corre** (regla 2), y corta *entre* controles: al que ya está
   corriendo no se lo puede interrumpir a mitad de camino, y la barra lo dice ("Cancelando al terminar
   el control en curso…"). **Una corrida cancelada no guarda resultados**: el run ya creado se queda con
   sus archivos y una nota que dice que se canceló. Media corrida guardada como si fuera una corrida es
   la clase de número que después nadie revisa. También se saca el "← Anterior" del pie y las flechas
   ← →: el paso no puede cambiar abajo de un control que está corriendo.
5. **La corrida ya no navega sola: termina en la runbar** ("Corrida completa en 4,2 s" + el veredicto en
   una línea, con lo rojo primero y en color de error) con "Ver resultados →" como primaria y "↺
   Ejecutar de nuevo" al lado. Antes el `window.location.hash` se pisaba apenas terminaba el último
   control, así que cuánto tardó y qué salió en rojo pasaba de largo. Las tarjetas se reordenan
   errores-primero al terminar, con el mismo `EXEC_TIER_RANK` que ordena la cascada de resultados.
6. **El color de cada pill sale de `computeSemaforoStatus` sobre la unidad declarada**, no de
   `summary.status` (regla de CLAUDE.md): el mismo control tiene que salir del mismo color acá y en
   resultados.
7. **El panel lateral repite los archivos usados y los umbrales** con los que se está corriendo. Los
   umbrales salen de `thresholdsSectionHtml()`, la misma función que usa el panel del Paso 2, para que
   no puedan decir números distintos antes y durante la corrida.

**Lo que queda afuera:** la sección "N avisos" del panel (screenshot 15) necesita que los avisos de
archivo/columna viajen en el run — eso es la tarea 7 (agregado [ADITIVO] 2 de `CAMBIOS_TECNICOS.md`) y
todavía no existe el campo. Se prefirió no mostrar una sección vacía antes que inventar avisos.

## D-057 — Resultados: el veredicto vive en la barra única, y el Resumen es un hero con tarjetas

**Fecha:** 2026-08-14
**Contexto:** Séptima tarea del rediseño Fase 1 (`docs/rediseno/README.md` → pantalla 6 "Resultados —
Resumen", screenshots 10, 11 y 13; `CAMBIOS_TECNICOS.md` §10). La pantalla tenía dos franjas fijas
apiladas —la barra superior de 54px y su propia `.results-ctx-bar` de 46px con el veredicto y "Detalles
del run"— y abajo un hero de 380px de ancho con un medidor circular (`% de legajos OK`) más una fila por
control, y debajo otra vez las mismas fichas desplegables. El mismo control se nombraba tres veces en la
misma pantalla, y el número grande era un porcentaje que había que interpretar antes de saber si había
algo que revisar.

**Decisión:**

1. **La barra de contexto se funde con la barra única.** `mountResultsHeader()` (ex
   `renderResultsContextBar`) ya no renderiza un contenedor propio: cuelga el ● + "Cliente · Período" +
   el veredicto en una línea del slot de contexto, "Detalles del run" del de herramientas y el menú
   "⬇ Exportar ▾" del de la primaria. El veredicto se pinta con el color del tier (verde/ámbar/rojo) y
   el dot pulsa **sólo en verde**. Para que la primaria pueda ser un dropdown ya armado y no la
   descripción de un botón, `setHeader({ primary })` acepta también un `Node` — el mismo trato que ya
   tenía `context` para el selector de mes del inicio.
2. **Debajo queda una zona fija de solapas Resumen / Detalle** con, a la derecha, cuándo se ejecutó el
   run y en qué estado quedó. **El Detalle es exactamente el de hoy** (las fichas `.control-card`): su
   rediseño es otra tarea. Al llegar siempre abre en Resumen, incluso en rojo — "errores primero" es el
   orden de las tarjetas, no la solapa.
3. **El Resumen es un hero centrado + una tarjeta por control.** El medidor circular se fue: el número
   grande ahora es el título en palabras ("Sin diferencias" / "23 legajos con diferencia"), que nombra
   la unidad que el control verificó de verdad, con los KPIs abajo (30px/700 celeste, **en rojo los que
   hay que ir a mirar**: unidades con diferencia y Δ acumulada). Cada tarjeta lleva su dot, su meta en
   una línea y "Ver detalle →" / "Ver los 23 →", que cambia de solapa, abre la ficha de ese control y la
   trae a la vista. El control en rojo va primero y con borde de error.
4. **El porcentaje del hero se mide contra el control más grande, no contra la suma.** Brutos sobre 514
   legajos y GS Pers sobre 512 son los mismos empleados mirados dos veces, no 1026: con el denominador
   sumado, 23 diferencias daban 2,2% en el hero y 4,5% en la tarjeta del control, y el número chico es
   el que se lee como "no pasa nada". Es el mismo `unitsMax` que ya usaba la frase "514 legajos
   verificados en 2 controles".
5. **El color lo sigue decidiendo `computeSemaforoStatus`** (verde 0% · amarillo ≤2% · rojo >2%):
   `js/controls/semaforo.js` no se tocó, y la leyenda del umbral quedó al pie del hero para que el color
   se pueda explicar sin salir de la pantalla.
6. **La acción primaria es "⬇ Exportar ▾"**, con dos ítems y el recordatorio de privacidad al pie
   (CLAUDE.md §Privacidad). **Excel es el veredicto de la corrida —una fila por control—, no una hoja
   por control:** la hoja completa de cada control la arma cada control con su contrato de export
   (`js/exports/contracts.js`) y esa lógica vive adentro de `js/controls/**`, que esta tarea no toca.
   El detalle fila por fila se sigue exportando desde la tabla de cada control, en la solapa Detalle. El
   JSON sí lleva la corrida entera —con datos de empleados—, y por eso el aviso.
7. **`setCompactHeader` ya no existía**: se había ido con D-054 junto con `.app-header--compact`. Quedó
   sólo la nota en `base.css`, actualizada.

**Verificación:** `npm run test:unit` en verde (121 asserts). Los dos tests que fijaban el hero se
actualizaron al markup nuevo conservando cada regla, y se les sumó una sección que fija que **la tarjeta
de cada control nombra su propia unidad** aunque el hero mida otra. La pantalla se verificó en Chromium
en verde y en rojo, y en Sobrio / Intenso / Oscuro, sobre un fixture nuevo
(`tests/e2e/fixtures/resultsResumen.html`) con su spec (`tests/e2e/resultsResumen.spec.js`, 4 tests): no
hay dos franjas, el rojo va primero, el link cambia de solapa y el menú de export avisa lo que avisa. Los
e2e que levantan la app entera no corren en este entorno (los CDN de `index.html` están bloqueados,
D-048): quedan para CI.

---

## D-058 — Detalle: el TOTAL es el de lo que se está mirando, y los avisos viajan con la corrida

**Fecha:** 2026-08-14
**Contexto:** Octava tarea del rediseño Fase 1 (`docs/rediseno/README.md` → pantallas 7 "Resultados —
Detalle" y 8 "Detalles del run", screenshots 03, 17 y 19; `CAMBIOS_TECNICOS.md` §10 y aditivos 2, 3 y 4).
La solapa Detalle de cada control ya tenía todo lo que hace falta —filtro, buscador, paginación, export,
sticky de encabezado y de columnas— pero tres cosas mentían o se perdían:

- El filtro y el buscador **sólo escondían filas**: la fila de TOTAL seguía siendo la de todas. Con un
  legajo en pantalla abajo decía "TOTAL — 514 legajos" y un número que no cerraba con nada de lo visible.
- El encabezado de dos niveles tenía las dos filas en `top:0`: al scrollear, la de abajo tapaba a la de
  arriba. Y el tinte de cada grupo lo elegía cada control con un hex inline (celeste y lila en Brutos y
  GS Pers), o sea que el mismo concepto salía de distinto color según el control.
- Los dos avisos de "avisa, no traba" (D-036) **no quedaban en ningún lado**: el de la sigla del archivo
  se veía sólo al cargarlo, y el de columna se recalculaba en resultados pero nunca alcanzaba a las
  columnas del Paso 2, que no están en el mapeo que la corrida guarda (limitación anotada en ROADMAP).

**Decisión:**

1. **La fila de TOTAL muestra el total de la selección filtrada** (`initSelectionTotals` en
   `js/ui/tableTools.js`). Se recalcula leyendo la **tabla ya pintada**, no los datos del control: así
   vale para los 9 controles sin que ninguno pase nada nuevo. Sólo totaliza las columnas que la fila de
   TOTAL ya mostraba como número, y si alguna no se puede totalizar sale `—` en vez de un número
   inventado. La etiqueta lo dice: "TOTAL de la selección — 23 legajos". **La paginación no es un
   filtro:** con 50 de 514 filas a la vista el total sigue siendo el de las 514 (no cambió lo que se está
   mirando, cambió cuánto entra en pantalla).
2. **Los filtros cortos se ven como chips, pero el `<select>` sigue siendo el control.** `chipifySelect`
   deja el select en el DOM —visualmente oculto, no `hidden`— y le escribe `value` + `change`; los chips
   van `aria-hidden`. Así cada control lee su filtro exactamente como antes, el teclado y el lector de
   pantalla siguen teniendo **un** control (no dos que dicen lo mismo), y los e2e que ya seleccionaban
   por `selectOption` siguen pasando. Con más de 4 opciones no hay chips: 18 conceptos de NR en chips no
   son un filtro, son una pared.
3. **"Con diferencias" arranca activo — y se dice por qué.** El default ya lo decidía cada control (y se
   respeta: sigue siendo suyo); lo que faltaba era el cartel al lado ("Este filtro arrancó activo porque
   el control terminó con errores"), que desaparece al tocar otro chip. Sin eso, el analista cree que
   está viendo la tabla entera.
4. **El encabezado de dos niveles se pega escalonado y los grupos se tintan desde el sistema.**
   `enhanceGrid()` mide la 1ª fila (`--rb-thead-h1`, con `ResizeObserver` porque la ficha del control
   puede estar colapsada al montar), asigna el tinte alternado (celeste dim / navy dim) al grupo entero
   —encabezado, celdas y totales— y **borra el `background` inline** de esas celdas, que si no ganaría por
   especificidad. Ningún control cambió: el tinte dejó de ser una decisión de cada uno.
5. **Δ es un badge.** La diferencia sale como badge de error y el cero en discreto, y `null` —que **no es
   0**: falta un lado, no se pudo comparar— sale como badge warn ("sin comparar") en vez del `—` mudo de
   antes, que se leía igual que "dio cero". `diffCellHtml` acepta `absentLabel` para el control que sepa
   de qué lado falta ("ausente en Tab"); hoy ninguno lo pasa, y el texto genérico dice sólo lo que se sabe.
6. **Los avisos de la corrida se guardan con el run** (`warnings: string[]`, aditivo declarado sobre
   `js/db.js`). Se arman **al ejecutar** (`collectRunWarnings`, `js/ui/runWarnings.js`) con lo que el
   analista tenía en pantalla: es la única oportunidad de verlos completos, porque los de las columnas del
   Paso 2 no se pueden recalcular después. **Campo aditivo de verdad:** no se indexa (no hace falta subir
   la versión de Dexie), crear un run sin pasarlo sigue funcionando, y un run viejo —sin el campo— muestra
   la sección vacía. Se ven en "Detalles del run" y en el export (Excel y JSON). El cartel que ya se
   recalculaba en la pantalla de resultados **queda**: son dos caminos con el mismo criterio, y el
   recalculado sigue siendo el que no puede desincronizarse del archivo con el que se corrió.
7. **Sin avisos también se dice** ("Sin avisos en esta corrida"). Un bloque ausente no distingue "no hubo"
   de "no se miró" — el mismo criterio de D-036: que un dato no exista en un período es un resultado.
8. **`.ctrl-detail-grid__inner` pasa de `overflow:hidden` a `overflow:clip`.** Recorta igual mientras la
   ficha se abre, pero no crea un contenedor de scroll: con `hidden`, las solapas y la barra del Detalle
   se anclaban a esa caja (que nunca scrollea) y no se pegaban nunca.

**Lo que NO cambió:** los estados del run (⚡ rápida / 📝 borrador / ✅ definitivo) y su relación con el
checklist mensual; `js/controls/semaforo.js` y el color de cada control; `unitsTotal`/`unitsWithDiff`, que
se siguen contando en la unidad que declara `unit`; y ningún archivo de `js/controls/**` — todo el Detalle
nuevo sale de los módulos compartidos (`tableTools.js`, `resultBlocks.js`) y del CSS.

**Verificación:** `npm run test:unit` en verde (136 asserts; `tests/runWarnings.test.js` nuevo en la
cadena, incluido el barrido de ciclos de import). En Chromium real: `tests/e2e/detalleTabla.spec.js`
(fixture nuevo con el Detalle de Brutos) fija el total de la selección al buscar y al limpiar, los KPIs,
el filtro inicial con su cartel, los badges de Δ y de ausencia, y el encabezado de dos niveles con sus
tintes; `tests/e2e/resultsResumen.spec.js` suma los avisos en el popover, la sección vacía, y que la barra
del Detalle quede a la vista al scrollear la pantalla real (ficha del control incluida). Los e2e que
levantan la app entera no corren en este entorno (los CDN de `index.html` están bloqueados, D-048): quedan
para CI, y fallan igual sin estos cambios.

---

## D-059 — El tema se resuelve entero en tokens.css: nada de reglas por tema ni hex sueltos

**Fecha:** 2026-08-14
**Contexto:** Novena y última tarea del rediseño Fase 1 (`docs/rediseno/README.md` → "Orden sugerido",
punto 9: *"Pasada Intenso: verificar que todo responde al tema con solo variables"*), extendida a los
tres temas. Se recorrieron las 10 pantallas en Sobrio, Intenso y Oscuro en un navegador real (1366×768),
comparando Intenso contra los screenshots 04, 05, 06, 20 y 21 y midiendo el contraste de cada nodo de
texto visible contra su fondo efectivo. Ningún módulo de `js/` ramificaba por tema —eso estaba bien—,
pero sí había color decidido fuera de `css/tokens.css`, y ese color no seguía al tema.

**Decisión:** `css/tokens.css` es el único archivo donde un tema cambia algo. Las otras tres hojas y
todos los módulos de `js/` escriben `var(--token)` y nunca preguntan qué tema está activo.

1. **Los tokens del banner de privacidad y de los toasts se mudan a `tokens.css`.** Vivían en
   `components.css` con su propio juego de cuatro reglas por tema (`:root`, `@media (dark)`,
   `[data-theme="dark|oscuro"]`, `[data-theme="light|sobrio|intenso"]`): dos archivos decidiendo
   colores de tema, que es exactamente lo que hace que un componente quede fuera del sistema.
2. **Lo que se apoya en la barra tiene tokens de barra.** Los tonos `--ok-tx` / `--warn-tx` /
   `--error-tx` están calculados para superficies claras; sobre la barra ink de Intenso el veredicto de
   resultados quedaba en 2,9:1 (el screenshot 21 lo muestra en naranja claro). Se suman
   `--header-ok-fg` / `--header-warn-fg` / `--header-error-fg`, hermanos del `--header-hint-fg` que ya
   existía por la misma razón, y en Intenso toman los tonos del tema Oscuro.
3. **Los paneles flotantes de la barra vuelven a los valores de página.** El popover de "Detalles del
   run", los menús "Datos ▾"/"⬇ Exportar ▾" y el selector de tema cuelgan del DOM de la barra pero se
   dibujan sobre una superficie de página, y la regla `.app-header .btn--ghost { color:
   var(--header-fg-muted) }` de `base.css` los alcanzaba igual: en Intenso, **"📌 Marcar como
   definitivo" quedaba en #C7D5E4 sobre blanco — 1,5:1, invisible.** Se arregla redefiniendo los tokens
   de barra dentro del panel, no tocando la regla del componente ni agregando una excepción por tema.
4. **`--on-celeste`: el texto sobre un fondo celeste sólido lo decide el tema.** En Oscuro el celeste
   sube a `#1FBEE0` y el blanco encima cae a 2,2:1 (el contador del chip de filtro, con su
   `rgba(255,255,255,.75)` cableado, a 1,8:1). El token es blanco en los temas claros y un ink oscuro en
   Oscuro; el chip activo, el checkbox marcado, la burbuja del paso activo, el segmented y la matriz de
   Variaciones lo usan sin preguntar nada.
5. **El resto de los literales pasa a token:** anillo de foco (`--focus-ring`, que en Oscuro seguía
   siendo el celeste del tema claro), velo del modal (`--overlay-bg`, más opaco en Oscuro), pulso del
   semáforo (`--ok-pulse`), fondo del ícono de casillero cargado (`--ok-soft-bg`) y las muestras del
   selector de tema (`--swatch-*`, los únicos colores que a propósito **no** siguen al tema activo:
   cada una es la miniatura de un tema y tiene que verse igual desde los tres).
6. **El serif se pide por `--font-display`, nunca por `--serif`.** El KPI de las tarjetas de resultados
   estaba cableado a `--serif` y salía en DM Serif Display también en Sobrio y en Oscuro, donde el resto
   de los números va en la sans operativa. `--serif` sólo se referencia desde `tokens.css`.
7. **Se borran los ocho `--color-group-*`:** estaban declarados sólo en el bloque oscuro (o sea, sin
   valor en el estado por default del navegador, el bug que fija `tests/e2e/tokenDefaults.spec.js`) y no
   los usaba nadie.

**Escrito como assert:** `tests/themeSourceOfTruth.test.js` falla si una hoja que no sea `tokens.css`
declara una regla por tema, mira `prefers-color-scheme`, tiene un color literal o pide `var(--serif)`;
si un token de `tokens.css` no tiene su valor claro en `:root`; si un módulo de `js/` ramifica por tema;
o si aparece un hex cableado en `js/`. Excepción declarada y única: `js/controls/variaciones.js` arma un
documento HTML standalone para imprimir a PDF —el entregable que se le manda al cliente— que se abre en
una ventana propia, sin las hojas de la app y sin tema. En el navegador, `themePicker.spec.js` cubre que
los tokens resuelvan en los tres temas y que el texto sobre el celeste se dé vuelta en Oscuro, y
`resultsResumen.spec.js` cubre los dos casos de la barra ink de Intenso.

**Lo que NO se tocó, y por qué:** el celeste H&A `#00ACD4` con texto blanco da 2,7:1 y el primario
atenuado (`--primary-disabled`) 1,5:1. Los dos son idénticos en los tres temas y son lo que muestran los
screenshots de referencia: son decisiones de marca y de la regla 2 del rediseño ("la primaria no
desaparece, se atenúa"), no una deriva de tema. Tampoco se tocó `h1..h6 { color: var(--color-primary) }`
de `base.css`, que pinta los títulos de página en celeste donde los screenshots 18 y 20 los muestran en
ink: es igual en los tres temas y cambiarlo mueve todas las pantallas, así que es su propia tarea.

---

## D-060 — Una planilla más ancha que la pantalla: el ancho es del Detalle, y el total nunca se derrama

**Fecha:** 2026-08-14
**Contexto:** Willy mandó una captura de la solapa Planilla → DATOS de Acumuladores Ganancias: en la fila
de TOTAL se leía `0,0036.857.323,85` —dos importes distintos pegados, que se leen como un número que no
existe— y las últimas columnas de la derecha no se veían. Es la planilla más ancha de la app (13 columnas
sobre 308 legajos), pero el problema no es de ese control: son los mismos `enhanceGrid()` /
`wireTableTools()` en **19 lugares de 12 controles**, así que se arregla una vez y para todos.

Medido en un navegador real antes de tocar nada: la tabla pide **1699px** y el recuadro donde vive tiene
**1096px**. O sea ~580px de columnas —casi 5 de las 13— fuera de la vista, sin nada que lo avise: la
barra de scroll horizontal del sistema mide 2px y es transparente hasta que le pasás el mouse.

**Decisión — tres reglas, más una salida:**

1. **El Detalle usa el ancho de la ventana; el Resumen mantiene el tope de 1280px.**
   `.page-content--wide` (`css/base.css`) se aplica a la solapa Detalle de `controlsResults.js` y a la
   pantalla de resultados del wizard, que es sólo detalle. La app estaba topeada a `--max-width: 1280px`
   en todas las pantallas: en un monitor de 1920 tiraba 640px justo donde más falta hacen. El Resumen
   **no** se toca — es texto y tarjetas, y una línea de texto de 1800px no se lee.

2. **Ningún importe se dibuja en una caja más angosta que él.** Dos partes:
   - `white-space: nowrap` en las celdas de `.rb-grid`: la planilla ya scrollea, que sea más ancha es
     barato; que un número se lea mal, no.
   - **El ancho que necesita la fila de TOTAL se reserva** (`reserveTotalsWidth` en `resultBlocks.js`).
     Un total suma cientos de legajos, así que tiene dos o tres dígitos más que cualquier importe de la
     tabla (`36.857.323,85` por legajo → `28.777.461.315,60` de total). Cuando la planilla no entra a lo
     ancho, el navegador reparte mirando el encabezado y las filas de datos, le da a la columna lo que
     necesita **un** legajo, y el total —alineado a la derecha— se derrama **hacia la izquierda** sobre la
     columna de al lado. Ese derrame es el `0,0036.857.323,85` de la captura, y no lo delata ningún
     `scrollWidth`: el desborde a la izquierda no cuenta como overflow.
     No se puede pedir en CSS: `min-width: max-content` en una celda de tabla lo ignora el navegador
     (verificado), y un `min-width` fijo en px sería un número inventado. Así que se mide el texto que la
     fila de TOTAL ya tiene puesto —una medición por columna, una sola vez— y se reserva como piso.
     **El piso se escribe en la celda del ENCABEZADO**, no en la del pie: con la planilla apretada el
     navegador **no mira** las celdas del `<tfoot>` para repartir el ancho (un `min-width` en el pie no
     mueve nada — verificado), y el encabezado además es la fila que ningún control reconstruye al
     ordenar o filtrar. No hace falta recalcular al filtrar: el total de la selección es más corto que el
     general, así que el piso sigue alcanzando.

3. **Se avisa que la planilla sigue para el costado**, sin JS: sombra en los bordes que se apaga sola al
   llegar a la punta (cuatro fondos — las "tapas" viajan con el contenido, las sombras quedan fijas al
   recuadro) y barra de scroll declarada a 10px en vez de la overlay de 2px del sistema. El color sale
   del token nuevo `--scroll-shadow`, que en oscuro no puede ser el mismo negro translúcido.

   **Salida para las más anchas:** botón **"Ampliar"** (`enhanceWidthEscape`), que lleva la planilla a
   toda la pantalla y se cierra con el botón o con Escape. No es un modal: es la misma tabla, con su
   filtro y su orden intactos, así que al cerrar el analista vuelve exactamente a donde estaba. Aparece
   **sólo si de verdad falta ancho** — ofrecer una solución a un problema que el analista no tiene es
   ruido — y se re-evalúa con un `ResizeObserver`, porque la tabla puede montarse dentro de una ficha
   colapsada (ancho 0) o cambiar de ancho al abrirse otra solapa.

**El bug de la columna fija de la fila de TOTAL.** El sticky de las dos primeras columnas se declara por
posición (`:first-child` / `:nth-child(2)`) para sobrevivir a los controles que reconstruyen el `<tbody>`
al ordenar. En la fila de TOTAL eso miente: el rótulo ocupa las dos columnas fijas con `colspan="2"`, así
que `:nth-child(2)` no es la 2ª columna, **es el primer importe** — y quedaba clavado a 74px del borde,
montado encima de los importes que pasaban por debajo al scrollear. Se corrige por atributo
(`[colspan]:not([colspan="1"]):first-child + *` recibe `left: auto`), no en JS, para que siga valiendo
cuando `initSelectionTotals` reescriba la fila al filtrar. El rótulo sí se sigue fijando, pero midiendo
lo que ocupan las dos columnas juntas.

**De paso:** la fila de TOTAL de las planillas de Acumuladores decía `TOTAL` sin la unidad, y al filtrar
salía "TOTAL de la selección — **1 fila**" en vez de "1 legajo" (`selectionLabelHtml` saca la unidad del
rótulo original). Ahora dice `TOTAL — N legajos`, como los otros 8 controles.

**Escrito como assert:** `tests/e2e/planillaAncha.spec.js` sobre un fixture de 13 columnas y 308 legajos
—la única forma de verificar esto es en un navegador real, porque las tres reglas son de layout: cuánto
ancho da el navegador a cada columna, qué celda queda fija al scrollear, y si el contenido entra—. Cubre
que cada columna reserve el ancho de su total y que ningún total se derrame, que el botón "Ampliar"
aparezca sólo cuando falta ancho y vuelva con Escape, que el primer importe del pie **no** quede clavado,
y que el rótulo sí quede fijo y nombre la unidad al filtrar. Los tres primeros fallan si se saca el
arreglo (verificado).

**Lo que NO se hizo:** un modal de pantalla completa como default (opción descartada con Willy: te saca
del listado de controles y para comparar dos controles hay que abrir y cerrar), y elegir qué columnas
mirar. Con el ancho de la ventana entran casi todas las planillas; si alguna sigue molestando, ahí se
evalúa el selector de columnas.

## D-061 — Alta y Baja del reporte de variaciones salen de las fechas, no de que el legajo aparezca en un archivo

**Fecha:** 2026-08-14
**Contexto:** el control de Variación entre quincenas de POP (`specs/control-variacion-quincenas-pop.md`)
marca, por legajo, si hubo un alta o una baja entre las dos quincenas comparadas. El prototipo que llegó
con la ficha de traspaso lo resolvía **por presencia**: si el legajo está en el Tabulado de la quincena
actual y no en el de la anterior es un alta, y al revés una baja. La ficha lo declaraba como ASUMIDO y
pedía confirmarlo.

Verificado contra los archivos reales de julio 2026: hay un legajo que liquidó **sólo en la 1ª
quincena** y que **no tiene fecha de egreso** en ninguno de los dos Tabulados. Por presencia sale
`Baja = S`; el reporte real de Axton no lo marca ni alta ni baja (pone `-`). No se fue: no liquidó horas
en la 2ª quincena. O sea que el criterio por presencia le avisa a HR del cliente de una baja que no
existió — y el archivo lo recibe HR, no el analista, así que el error sale del estudio.

**Decisión (Willy, 2026-08-14):** Alta y Baja salen de las **fechas** del Tabulado. Alta = la fecha de
`Ingreso` cae dentro de la quincena actual; Baja = la de `Egreso` cae dentro de la quincena actual. La 1ª
quincena es del 1 al 15 y la 2ª del 16 al último día del mes, y el mes y la quincena salen de la columna
`liquidacion` del propio archivo.

Con eso, los legajos que liquidaron en una sola de las dos quincenas **se listan aparte** —"liquidó sólo
en la quincena anterior"— sin llamarlos ni alta ni baja. Es la información que el analista necesita para
ir a mirar, sin afirmar una baja que el archivo no dice.

**Las tres respuestas, y por qué la celda vacía no significa lo mismo en las dos columnas:**

| | Celda vacía | Columna ausente del archivo |
|---|---|---|
| **Alta** (`Ingreso`) | `—` — todo empleado tiene fecha de ingreso, así que una vacía es un dato que falta | `—` + aviso |
| **Baja** (`Egreso`) | `N` — en Axton un empleado activo no tiene fecha de egreso: vacío es "no se fue" | `—` + aviso |

Esa asimetría es lo que obligó a que el parser del Tabulado de Axton **omita la clave** de una columna
que el archivo no trae, en vez de emitirla vacía: con una clave vacía siempre, "no sé si hubo bajas" y
"no hubo bajas" se leen igual, y una de las dos miente. Es el mismo `null ≠ 0` de CLAUDE.md aplicado a
una marca S/N en vez de a un importe.

**Sin período legible no se calculan:** si no se pudo leer la quincena del Tabulado actual, las dos
columnas salen `—` con su aviso, en vez de evaluarse contra un mes inventado.

**Efecto medido:** contra el reporte real de Axton de la 2ª quincena de julio 2026, el criterio por
fechas baja de 2 campos con diferencia a 1 en ese legajo (el `Alta = N` ahora coincide con Axton; queda
la `Baja`, donde Axton pone `-` porque no evalúa a quien no liquidó en la quincena). El total de legajos
con alguna diferencia contra Axton sigue siendo 9 de 203.

**Lo que NO se hizo:** copiar el `-` de Axton para el legajo que no liquidó en la quincena actual. Sería
inventar una regla a partir de un solo caso observado para que el control coincida con el archivo que
está controlando, que es exactamente al revés de para qué existe el control. Queda como el ASUMIDO
abierto del §8 de la spec, junto con el criterio de exclusión de legajos de Axton.

**Escrito como assert:** `tests/popVariacionesControl.test.js` — el legajo que liquidó sólo en la
quincena anterior y sin fecha de egreso no es baja; el egreso y el ingreso dentro de la quincena sí
marcan; un ingreso de la 1ª quincena no es alta de la 2ª; y sin la columna de egreso la marca sale `—`.

---

## D-062 — La familia contable se posterga: el foco pasa a novedades

**Fecha:** 2026-08-17. **Decisión de:** Willy.

**Qué se decidió.** Los dos controles contables construidos —`finadiet_asiento` (I3) y
`rend_vs_asiento` (I4)— salen del lote de verificación y bajan de prioridad. El foco de
construcción y verificación pasa a la familia de **novedades y trazabilidad**.

**Por qué.** El asiento contable es muy customizado por cliente: el plan de cuentas, los centros de
costo y el formato del reporte de origen cambian caso por caso, y el propio proveedor está dando de
baja el reporte contable vigente de FINADIET. Generalizar un control así cuesta mucho y sirve para
pocos clientes. La familia de novedades es la que se repite igual en toda la cartera.

**Qué NO cambia.** Ninguno de los dos controles se borra ni se marca como roto. Siguen construidos y
disponibles para el cliente que los tiene configurado. Lo que se posterga es **verificarlos y
generalizarlos**.

**Consecuencia técnica no obvia.** Queda sin resolver la promoción de scope de los dos: `finadiet_asiento`
sigue `scope: 'cliente'` de FINADIET y `rend_vs_asiento` sigue `scope: 'cliente'` de MARVAL. La nota del
registry sobre promover a `sistema: meta4` cuando aparezca un 2º cliente sigue válida, sólo que ya no es
un pendiente activo.

**El archivo de entrada de I3 no está definido, y eso es lo primero al retomar.** El archivo de cierre que
sí existe en SharePoint (`Finadiet Ctrol Fin MM-AAAA.xlsx`, hoja `Conta_desgl.`) **no tiene el layout que
`finadietAsientoParser.js` pide**: trae una sola columna de cuenta (`CUENTA_CONTAB`) con marcador
`DEBE_HABER` por fila, no dos códigos, y **no trae columna de Centro de Costo**, que el parser declara
obligatoria. Mapear a ojo contra ese archivo produce exactamente el "número mal pero coherente" que nadie
detecta.

**Pista que quedó registrada y conviene no perder.** Esa misma hoja `Conta_desgl.` tiene el **mismo
layout** que el `conta_file` de MARVAL (`ID_EMPLEADO`, `FEC_PAGO`, `ID_CONCEPTO`, `NOMBRE_LARGO`,
`CUENTA_CONTAB`, `DEBE_HABER`, `DEBE`, `HABER`). Si se confirma, I3 e I4 podrían compartir parser en vez
de tener dos. Evaluarlo cuando se retome, no antes.

**Dónde vive el detalle.** Updates de los ítems **I3** e **I4** del tablero *Catálogo de Controles de
Payroll* (board `18426712423`, workspace Operaciones).

---

## D-063 — SAC teórico de Epiroc: la planilla manual no reconcilia, y hay tres definiciones antes de tocar código

**Fecha:** 2026-08-17. **Estado:** abierto — las tres preguntas las contesta Willy, ninguna se resuelve
programando.

**Contexto.** Epiroc reemplaza a POP como cliente de prueba de Acumuladores Ganancias: es el único Axton
con serie mensual completa (04 a 07/2026), mientras que de POP sólo hay extractos de un legajo. La
verificación es contra la columna **AG** (rotulada `IG_CMASIS_REMU`, comentada "SAC TEORICO") de
`EPIR Control IG Nuevo MM-2026.xlsx`, tab `IMPGAN`. Reconstruido el cálculo desde el crudo de 05/2026,
esa columna **no reconcilia** con `calcDoceava` (`js/controls/acumuladoresGanancias.js:496`).

**Las tres definiciones abiertas:**

1. **¿`1101` (No Remunerativo gravado por IIGG) entra en la doceava?** El repo lo suma. La planilla
   manual de Epiroc no.
2. **¿`1137` (Excluye del SAC teorico) se resta?** El repo lo resta. La planilla manual no. En un legajo
   con `1137` acumulado del orden de $1,1M la diferencia en el SAC teórico es de unos $92.000. El
   acumulador se llama literalmente "Excluye del SAC teorico" y el repo hace lo que el nombre dice, así
   que la sospecha inicial es sobre la planilla — pero es sospecha, no conclusión, y **no hay que
   "corregir" la fórmula al rótulo antes de confirmarlo**.
3. **¿`1103` (Bruto para Ganancias Prorrateado) entra en el juego de acumuladores, y en qué columna del
   entregable?** No está en los 10 códigos de `ACUMULADORES` — la spec se armó sobre el crudo de POP, que
   no lo trae. El crudo de Epiroc sí, y la planilla manual lo usa: es uno de los componentes de su
   `TOT_CON_IMP`. Con el default actual se ignora en silencio. El override por cliente de D-026 no
   alcanza: hay que decidir si va en el juego base.

**Ante la diferencia, no se ajusta el código a la planilla.** El intento de verificación arrancó tratando
el armado manual como fuente de verdad y salió al revés: el defecto estaba en la planilla. Primero se
confirma el criterio con quien lo define, después se decide qué lado se corrige. Es lo que originó el
método de D-064.

**Corolario para D-026 y para la referencia de la skill `relevamiento-controles`:** **"en Axton el
`repacumuladores` es igual para todos" vale para los encabezados, no para el juego de acumuladores
presentes.** El caso de `1103` es la prueba: mismo layout, distinto juego de códigos.

**Dónde vive el detalle.** Update del ítem **F3** del tablero *Catálogo de Controles de Payroll*
(board `18426712423`, workspace Operaciones).

---

## D-064 — Un control se verifica contra un armado manual de a un caso, no de a un veredicto agregado

**Fecha:** 2026-08-17. **Instrucción de:** Willy. **Aplica a:** todo control que se verifique contra un
armado manual (planilla del analista, mes ya cerrado, reporte del sistema del cliente).

**Qué se decidió.** No se trae un veredicto agregado. Se analiza **un** caso, se pasa completo, y se
espera la confirmación de Willy antes de generalizar al resto de la nómina. La forma exacta que tiene que
tener el caso —las cuatro partes y su orden— está en `CLAUDE.md` § "Cómo trabajar con Willy", que es lo
que se lee antes de verificar; acá queda el por qué.

**Por qué.** Un conteo agregado ("15 de 20 legajos coinciden") no permite decidir nada: no dice qué lado
está mal ni por qué. El caso individual sí, y además Willy lo audita en su propio archivo en dos minutos.
Es la misma lógica del "número mal pero coherente" de `CLAUDE.md`: un porcentaje de coincidencia alto es
justamente lo que hace pasar desapercibido un criterio equivocado.

**Caso que originó la regla.** El SAC teórico de Epiroc (D-063): la verificación arrancó tratando el
armado manual como fuente de verdad y el defecto estaba en la planilla. De ahí el corolario que ahora es
regla: **ante una diferencia contra un armado manual, primero se confirma el criterio con quien lo
define, después se decide qué lado se corrige. Nunca ajustar el código hasta que dé lo mismo que la
planilla.**

---

## D-065 — Pieza T (Lector de Tabulado): tres formatos en alcance, el lector no convierte unidades, y una cantidad ausente nunca se completa por inferencia

**Fecha:** 2026-08-18. **Instrucción de:** Willy, entrevista de captura registrada en el ítem "T — Lector
de tabulado" del tablero monday *Catálogo de Controles de Payroll* (board `18426712423`).

**Contexto.** Antes de construir el detector de formato (`js/parsers/tabFormatDetector.js`), había que
cerrar tres preguntas de alcance y de criterio que no se resuelven programando.

**1. Qué formatos entran y cuál queda afuera.** Entran los tres que hoy manda la cartera: Meta4
horizontal (hoja `tabulado_h` — Finadiet, POF), Axton completo con pares Cant/Imp (hoja
`Liquidaciones.AAAAMMDD.HHMMSS.n` — Epiroc, POP) y Axton reducido a sólo importes (misma hoja, subencabezado
sólo `Imp`, preámbulo `EA: …`, `TOTAL GENERAL` duplicado — SIASA; se acepta aunque venga posiblemente
retocado a mano antes de enviarse). **Queda afuera el Tabulado Vertical de Toyota/TASA — no por
incompatibilidad, sino porque todavía no se relevó.** El formato se decide siempre por la firma del
archivo, nunca por el cliente: un cliente puede migrar de sistema de un período a otro (POF exportaba la
familia `EA:` en 2025 — lo que documentan como "OPmobility" los comentarios de `tabuladoControl.js` y
`tabuladoHtml.js` — y hoy manda `tabulado_h`).

**2. El lector no convierte unidades (opción 1 de las presentadas).** Entrega las cantidades tal como
vienen en el archivo, con su código de concepto. **Se descartó que el lector normalice unidades por su
cuenta** (horas jornalizadas → días mensualizados o viceversa). La conversión, cuando hace falta, queda del
lado del control que consume esos datos, porque ahí es donde se sabe qué convenio rige al empleado (tabla
de parámetros D7). Si un cruce mezcla unidades sin convertir, avisa en vez de calcular con ellas mezcladas.
Corrige lo que documentaba la v1.0 del catálogo maestro (`normaliza unidades`, en
`.claude/skills/relevamiento-controles/references/catalogo-controles.md`), que quedó describiendo un plan
anterior a esta decisión.

**3. Una cantidad ausente (variante Axton sólo-Imp) nunca se completa por inferencia.** El lector avisa y
pide re-subir el export con cantidades. Si el analista sigue sin conseguirlas, la cantidad queda "no
visible" y el control que la necesitaba sale **INCIERTO**, no aprobado — nunca se infiere a partir del
importe o de una tarifa. Es la misma regla del "default silencioso es un bug" de `CLAUDE.md`: un número
inferido y coherente es peor que un hueco declarado, porque nadie lo vuelve a cuestionar.

**Verificado contra 6 archivos reales de 4 clientes (07/2026, no entran al repo):** el no-liquidado viene
con `0` explícito en Meta4 (no distinguible de "liquidado en cero") y con celda vacía en Axton (sí
distinguible); fila por liquidación en los dos sistemas; el CBU puede venir tipado como float; los códigos
de concepto no vienen ordenados; en SIASA conviven `999` y `1000`, ambos rotulados "Sueldo Basico" — de ahí
que los conceptos se matcheen siempre por código, nunca por nombre.

**Dónde vive el detalle.** `specs/lector-tabulado-formatos.md`.

---

## D-066 — Contabilidad Desglosada de COTY: por nombre de encabezado, sin excepciones sembradas, y la desglosada no es un entregable de Finanzas

**Fecha:** 2026-08-19 · **Contexto:** entrada al repo del control `conta_desglosada`, prototipado por el
equipo en Claude Chat y traído con su ficha de traspaso (`docs/traspaso-controles-equipo.md`).

**1. Las columnas del reporte se resuelven por nombre de encabezado, no por posición.** El prototipo leía
el "Totales de Concepto" por índice fijo (Legajo=0, Importe=25, Cuenta Debe=31, Cuenta Haber=32) y ya
había tenido que parchear la fecha de ingreso, que en un export cae en la columna 14 y en otro en la 15:
la resolvía **votando** entre cuatro columnas candidatas cuál tiene forma de fecha. El parser del repo
lee los encabezados —que el archivo trae siempre, en dos filas que se aplanan— y no necesita ninguna
ventana de candidatas. Además **valida que el encabezado aplanado mida lo mismo que las filas de datos**:
sin esa validación, una columna corrida cruza las cuentas contables (que están al final del reporte) y el
archivo cierra igual, que es exactamente la clase de error que nadie detecta. Mismo criterio que
`tabAxtonParser.js` ("nada se resuelve por posición").

**2. Las dos excepciones cableadas del prototipo NO se sembraron.** La ficha las traía marcadas como
supuestas, del instructivo y sin verificar: (`sac`, centro 60) → `710100143` y (`sindicato fuva a pagar`,
cualquier centro) → `215100120`. Contra el archivo real de 05/2026 **ninguna se dispara**: el SAC de COTY
liquida en los centros 656, 70 y 104 y el propio reporte de cuentas del cliente resuelve los tres, y
"Sindicato FUVA a pagar" no aparece ni en el Tabulado ni en el reporte de cuentas. Sembrarlas sería
inventar un código por analogía (D-039), con el agravante de que un código de cuenta equivocado produce un
asiento que cierra. La tabla de excepciones nace **vacía** y se edita en el Paso 2; lo que no se resuelve
sale listado como "sin código" en resultados, que es lo que hace que alguien lo resuelva.

**3. El importe vacío no se completa con 0 en silencio.** El prototipo trataba un importe no parseable
como `0` y su propia ficha lo marcaba como aviso ("si una fila tiene cuenta pero el importe vacío, cuenta
como cero y no avisa"). Acá la línea se emite con el importe vacío —la celda del `.xlsx` queda en blanco,
igual que antes— pero **se cuenta y se informa** en la pantalla de resultados. En el período verificado no
hay ninguna; la diferencia es qué pasa el día que haya.

**4. La desglosada es papel de trabajo del analista; el asiento es el entregable de Finanzas.** El asiento
va `audience: 'finanzas'` y no lleva legajo ni nada del empleado (un asiento se lee por cuenta contable);
la desglosada va `audience: 'payroll'` porque lleva legajo y fecha de ingreso, que es información de HR
(D-020). Con el asiento se agregaron a `FINANZAS_ALLOWED_KEYS` el centro de costo —imputación contable, no
atributo del empleado, y el asiento se lee agrupado por él— y las dos columnas de neto. **Queda por
confirmar con Willy** si la desglosada sale del estudio: si se le manda a Contaduría del cliente, la fecha
de ingreso tiene que salir.

**5. El neto a pagar se consolida con la clave de legajo del cliente.** Es el único punto del control donde
la unidad es el empleado y no la línea contable, y por eso va con `groupRowsByLegajo` y
`makeLegajoKey(mapping.legajoKeyMode)` (D-038/D-042): un cliente que rellena legajos con ceros («007» y
«7») emitiría dos líneas de neto para el mismo empleado y el asiento seguiría cerrando, mal. Los montos
siempre se suman; el centro de costo y la fecha de ingreso de esa línea se toman de la primera liquidación
del legajo, y si un legajo neteara en dos centros distintos el control lo avisa.

**Verificado contra los dos archivos reales de COTY del período 05/2026** (no entran al repo): reproduce
exactas las cinco anclas del prototipo — balance bruto 1.441.239.270,46, neteado 1.359.204.242,38, 273
filas de asiento, 12 cuentas patrimoniales y 0 líneas sin código.

**Dónde vive el detalle.** `specs/conta-desglosada-asiento.md`.

---

## D-067 — Control de Netos: se reconstruye el recibo teórico, y el armado manual se corrige en dos puntos

**Fecha:** 2026-08-19. **Instrucción de:** Willy, sobre la liquidación real de IFSA 05/2026 y la
planilla "Formula sueldos mayo 2026" con la que Meli calcula los brutos.

**Contexto.** El brief original (`specs/spec-control-netos.md` §3) planteaba comparar el neto liquidado
contra un **neto acordado pegado a mano**, y descontar de la diferencia una lista fija de conceptos
"perdonados" (feriados, vacaciones, adicionales). Al bajarlo a código, esa lista resultó no ser
necesaria y el neto acordado resultó no ser el número que la planilla usa.

**1. El neto contra el que se compara es un recibo teórico, no el neto pactado.** La columna que Meli
usa como objetivo del mes (`NETO ACORDADO final`) es la columna **W** de su planilla: el neto que
resulta de la estructura salarial vigente —básico de escala + AFA, antigüedad, presentismo, el acuerdo
no remunerativo y las retenciones—, no el neto que se pactó con el empleado. Para el legajo del acuerdo de categoría el
pactado es 1.740.000 y la comparación va contra 1.795.943,68. El control lo **calcula**, no lo pide:
todo lo que necesita está en el Tabulado, y `sueldo + AFA` es invariante entre meses porque el AFA
absorbe exactamente lo que sube el básico por paritaria (verificado: 1.135.835 + 156.344,95 en mayo
equivale a 1.117.925 + 174.254,95 de abril). Así el analista sube el Tabulado y la escala, y nada más.

**2. No hay lista de conceptos "perdonados".** Willy (2026-08-19): *"cualquiera puede explicar la
diferencia, si encontrás una diferencia con alguno tenés que marcarla"*. El control no decide de
antemano qué concepto justifica qué: convierte a neto **lo que efectivamente se liquidó por encima del
recibo teórico** y marca lo que sobra. Eso además elimina el coeficiente 1,0833 del armado manual (el
presentismo estimado de cada concepto extra): el presentismo real ya viene liquidado en su propio
concepto, así que se toma el número en vez de estimarlo.

**3. El armado manual no cerraba en 5 de 22 legajos, y las dos causas se corrigieron del lado del
modelo, no de la planilla** (aplicando D-064: primero se confirmó el criterio, después se decidió qué
lado se corregía).

- **El 2% extra del afiliado (4 legajos).** Al empleado con `678-AFILIADO_PORC = 2` se le retiene dos
  veces el 2% sobre la misma base: `8522-C_SINDIC_VOL` (que el modelo ya contemplaba dentro del 2,5%
  gremial) y `8520-RET_VOL` (que no). El residuo de esos 4 legajos era exactamente ese importe, con
  signo. Willy confirmó que **el control tiene que reconocerlo**: es un descuento fijo de ese empleado,
  no un error, así que entra en el recibo teórico y no en la lista de lo que se devuelve al neto.
- **El tope de la base imponible (1 legajo).** Los cuatro aportes del 17% (jubilación, ley 19.032, obra
  social, ANSSAL) se calculan hasta un tope; sindicato y FAECYS no lo tienen — verificado dividiendo
  cada aporte por su alícuota. Al legajo que superó el tope el plus vacacional lo llevó por encima: 71.879,63
  quedaron sin aportar, y 71.879,63 × 17% = **12.219,54** contra el residuo de 12.219,53 de la planilla.
  Willy pidió que el tope **se muestre siempre** y que el analista pueda cambiarlo y volver a ejecutar,
  así que es configuración editable del Paso 2 y no una constante. El control además detecta del propio
  archivo qué tope aplicó la liquidación y avisa si no coincide con el declarado.

**4. Qué se suma de vuelta al neto.** Anticipo (`8500`), ganancias (`5010`), retención alimentaria
(`8530`), retención judicial (`8540`), descuento de préstamo (`8820`) e impuesto adicional de obra
social (`6031`). Los descuentos **sindicales no**: forman parte del neto acordado. Confirmado por Willy
el 2026-08-19.

**5. El aporte de obra social sobre lo no remunerativo lo dice el código del concepto, no una regla.**
Era la pregunta que estaba esperando a Meli desde el brief original. El Tabulado la contesta solo: cada
concepto no remunerativo viene duplicado en dos códigos —`4566`/`4567`, `4568`/`4569`, `4612`/`4613`,
`4614`/`4615`, `4660`/`4661`, `4556`/`4558`— y el que **no** lleva sufijo `_NO`/`_NOS` se liquida
únicamente cuando la obra social del empleado es la que cobra ese 3%. Verificado en los 22 legajos: el
único con conceptos sin sufijo es el único con obra social `126205`.

**Alcance.** `scope: 'cliente'` de SPORTLINE. Las alícuotas, el tope, el acuerdo no remunerativo del mes
y los códigos de concepto son configuración del cliente (D-035/D-039) con semilla confirmada contra el
Tabulado real; nada de eso es identidad. El control se promueve a `scope: 'convenio'` (Comercio) cuando
un segundo cliente lo pida y se confirme que la mecánica del AFA es la misma.

**Lo que queda afuera y por qué.** El **calculador de AFA** —automatizar el "buscar objetivo" con el que
Meli llega al bruto— comparte toda esta fórmula pero corre en otro momento del circuito (sobre el
Tabulado de prueba, antes de liquidar; el control corre sobre el definitivo). Se construye aparte.

**6. La comparación con el mes anterior entra como casillero opcional, y por ahora sólo informa**
(Willy, 2026-08-19: *"agreguemos un placeholder para subir el mes anterior como opcional por ahora"*).
Si el analista sube el Tabulado del mes pasado, se le calcula el **mismo** recibo teórico y se muestra
cuánto se movió el neto de acuerdo de cada legajo. No marca diferencia ni pinta el semáforo: cumplir un
año de antigüedad mueve el neto de forma legítima —es lo que Willy justifica hoy a mano en la columna
"DIF ABRIL MAYO" de su planilla— y cuánto movimiento es normal todavía no está definido. Que el cálculo
sea el mismo de los dos lados no es un detalle de implementación: con dos fórmulas, la comparación entre
meses mediría la diferencia entre ellas y no entre las liquidaciones. Por eso el recibo teórico vive en
una función aparte (`reciboTeorico`) y no dentro del recorrido.

---

## D-068 — `.ctrl-detail-grid` sin `grid-template-columns`: la ficha de detalle se rompía con tablas anchas, y no era un bug del Control de Netos

**Fecha:** 2026-08-20. **Instrucción de:** Willy, probando en vivo el Control de Netos recién mergeado
(PR #165) contra el archivo real de mayo de IFSA con "Todos los legajos" seleccionado — no se veía la
pantalla completa ni el botón de exportar.

**Contexto.** `.ctrl-detail-grid` es el acordeón que abre y cierra la ficha de detalle de **cualquier**
control en la pantalla de resultados (`css/components.css`), no algo propio del Control de Netos.
Declaraba `display: grid; grid-template-rows: 0fr` para animar la apertura, pero nunca fijaba
`grid-template-columns`: la única columna implícita se medía por el contenido en vez de quedar acotada al
ancho de la ficha. Con una tabla de muchas columnas y `white-space: nowrap` en las celdas (la regla que
sostiene D-060, para que un importe nunca se corte a la mitad), el "grid" crecía más allá de la pantalla y
se llevaba puesta la barra de herramientas de abajo —el botón Exportar incluido— fuera del área visible,
sin scroll posible salvo el de toda la página. Se veía más seguido con "Todos los legajos" porque ahí es
más probable que aparezca la fila con el listado de conceptos más largo.

**Decisión.** Una línea, `grid-template-columns: minmax(0, 1fr)`, que fuerza el mínimo a 0 para que la
tabla scrollee dentro de su propio `.rb-grid-wrap` en vez de estirar la ficha. Se corrige en el componente
compartido y no con un ajuste puntual del Control de Netos —achicar o truncar la columna de conceptos, por
ejemplo— porque el mismo problema iba a reaparecer en el próximo control con una tabla ancha: ya le había
pasado antes a Acumuladores Ganancias por otra causa (D-060).

**Verificado en vivo con Playwright** contra el archivo real de IFSA 05/2026 con "Todos los legajos": el
exportador y el resto de la barra de herramientas quedan visibles en las cuatro vistas del filtro del
Control de Netos.

**Detalle.** `css/components.css`, entrada de `.ctrl-detail-grid`. Sin test automatizado nuevo: es el
mismo tipo de bug de layout que D-060 —se mide en un navegador real, no con un assert de DOM— y no se
sumó un e2e dedicado en este cambio.


---

## D-069 — El monto de diferencia lo pone el analista, se guarda por cliente y lo leen todos los controles

**Fecha:** 2026-08-19. **Instrucción de:** Willy — *"los montos de diferencia de cada control hoy se ven
pero no funcionan realmente para filtrar diferencias en ningún control. Tenés que corregirlo en la base y
que se pueda aplicar para cada control nuevo también"*.

**El problema.** El panel "Umbrales" del wizard mostraba `$ 1,00` y `0,1 %` **escritos a mano en el HTML**.
Ningún control los leía: cada uno traía su propio `0,01` cableado —unos 47 repartidos por
`js/controls/`— así que la pantalla prometía un filtro que no existía. Un analista que quería ignorar las
diferencias de menos de $ 100 no tenía forma de hacerlo, y lo que leía en pantalla no era lo que la app
estaba midiendo. El arreglo mínimo del 2026-08-19 (`ownThresholdNote`, que apagaba el bloque para el
Control de Netos) tapaba la contradicción visible sin resolverla.

**La decisión.** El monto de diferencia es **un atributo del cliente** (`clients.diffTolerance`), editable
desde el panel "Umbrales" del wizard y desde `#/admin`, y viaja en el seed junto con el resto de la
configuración del cliente. Lo leen los 19 controles.

Cómo se resuelve, en orden: (1) la tolerancia propia del control, si el registry declara `ownTolerance`;
(2) el monto del cliente; (3) `$ 0,01`, el redondeo de Excel, que además es el **piso**: por debajo del
centavo el filtro deja de significar algo, así que un `0` o un valor inválido suben al piso en vez de
apagar todos los avisos.

**Por qué un valor de corrida en un módulo y no un parámetro más.** Decidir "esto es una diferencia" pasa
en ~50 lugares de `js/controls/`: contadores del resumen, celdas pintadas, filtros de la tabla. Pasarlo por
parámetro obliga a cada control **nuevo** a acordarse de enchufarlo, y el que se olvida no falla: mide con
otro número y nadie se entera — que es exactamente cómo nació este bug. Con el monto en
`js/controls/tolerance.js`, los helpers que los controles ya usan (`diffStats` del semáforo, `diffCellHtml`
de la celda Δ, `isDiff`) salen midiendo bien solos, y un control nuevo lo hereda sin escribir una línea.
Lo fija **el borde de la app** y nunca un control: la corrida (`controlsWizard`) y el re-render de una
corrida guardada, siempre con `withTolerance()`, que restaura el valor anterior aunque el control explote
a mitad de camino.

**Una corrida guardada se relee con el monto con el que se corrió.** El wizard lo estampa en los
resultados de cada control (`results.diffTolerance`) y en el run. Cambiar el monto del cliente hoy no
reescribe lo que ya se revisó y se cerró; una corrida vieja, sin el campo, se lee al centavo — que es
exactamente con lo que se midió entonces. Las cuatro pantallas que pintan el semáforo del mismo control
(corrida, resultados, checklist y lista de clientes) pasan por `summarizeWithTolerance`: con una sola que
llamara a `summarize()` pelado, el mismo control saldría de distinto color según dónde se lo mire.

**Lo que el monto NO toca.** Sólo decide qué es diferencia **de cara al analista**. Quedan midiendo al
centavo, con constante propia y comentario:
- **"¿este concepto se liquidó?"**, que es otra pregunta que "¿difiere?" (`VALOR_REAL_EPS` en `nr.js`,
  `brutos.js`, `gsPers.js`, `acumuladoresGanancias.js`). Con el monto en $ 100, tratarlas igual haría
  desaparecer de la comparación al legajo con una cochera de $ 50 en vez de marcarlo.
- **Las tolerancias estructurales**: que un asiento cuadre DEBE contra HABER, que una suma calculada dé la
  fila `TOTAL GENERAL`, que el reporte de acreditaciones cierre contra su archivo de origen, o que un
  valor hora coincida con el que Axton informa redondeado. No son preferencia de nadie —son la forma del
  archivo— y subirlas a $ 100 taparía un archivo mal leído.

**El porcentaje y "los que están de un lado y no del otro" salieron del panel** (Willy, 2026-08-19). Sólo
funcionan en Cruce por Agrupadores, el único control que tiene los dos lados del cruce fila a fila y por
lo tanto un "sobre cuánto" claro para sacar el porcentaje; ahí se editan, en su propio panel, junto con su
monto. Ofrecerlos para los 19 era volver al problema que este cambio vino a cerrar.

**Los controles que no miden con este monto lo dicen en pantalla.** `ownTolerance: { note, from? }` en el
registry, en dos variantes: el que tiene el suyo editable (Control de Netos, Cruce por Agrupadores) declara
`from` y el panel muestra ese número; el que directamente no compara importes contra un umbral —Cat. x
Empleados compara campos de texto, Acreditaciones y los dos asientos cuadran al centavo, POP Variaciones
verifica una reconstrucción contra el redondeo de Axton, Acumuladores Ganancias son chequeos sobre un solo
lado— declara sólo `note`. Reemplaza a `ownThresholdNote`, que se borró.

**Detalle.** `js/controls/tolerance.js` (el módulo), `tests/tolerance.test.js` (la regla como assert,
incluido el barrido que falla si alguien vuelve a cablear un `0,01` suelto en `js/controls/`),
`tests/e2e/umbralDiferencia.spec.js` (el panel y la persistencia en el navegador). Cierra ROADMAP 3.10.

---

## D-070 — Familia de Novedades (Axton): la app genera el importador, el cruce informa lo no comparable sin bloquear, y las columnas sin código se listan siempre

**Fecha:** 2026-08-20. **Instrucción de:** Willy, tras el relevamiento del formato de novedades y de
liquidación de julio 2026 en los 7 clientes Axton (POP, Merz, Epiroc, SIASA, Geopagos, Red Bull, Coelsa)
— 14 barridos de SharePoint con agentes de recolección; ningún archivo de cliente entró al repo. El
detalle completo del relevamiento, cliente por cliente, está en `specs/familia-novedades-axton.md`.

**Contexto.** La novedad viaja en tres pasos: la planilla del cliente, la planilla depurada por el
analista, y el importador `F2_Consolidada` que se sube a Axton. Los dos saltos se controlan a mano o no
se controlan: hay BUSCARV manuales contra exports de Liquidaciones adentro de las planillas (POP 09/2025),
VLOOKUP contra el borrador del mes anterior que devuelven `#N/D` (Coelsa), y un mes real donde el cliente
informó un empleado que no llegó al importador, sin registro de por qué (SIASA Aguas y Gaseosas 07/2026).
El relevamiento confirmó además que el importador `F2_Consolidada` es el formato común de Axton en toda la
cartera — con lo cual el ítem B0 del catálogo maestro ("¿template único o negociado por cliente?") queda
contestado sin negociar nada: el template es el importador.

**Qué se decidió.**

1. **La app genera el importador, no controla la transcripción a posteriori.** El analista sube la
   planilla del cliente, la app arma el `F2` por unidad organizativa, el analista lo valida en pantalla y
   lo descarga. El error de transcripción (B2a del catálogo) desaparece por diseño en vez de detectarse
   después. Con el importador validado, el cruce contra la liquidación (B2b) compara ese archivo contra
   el Tabulado y el reporte "Totales de Concepto" del período.
2. **El cruce compara cantidad E importe cuando los dos lados los tienen.** Cuando no son comparables
   —una novedad en días u horas contra un Tabulado que sólo trae importes, o la cantidad ausente de la
   variante sólo-Imp— el control **no bloquea ni aprueba: informa claramente** el motivo. Todo lo extraño
   se marca. Consistente con D-065 (nada se convierte ni se infiere).
3. **Las columnas sin código se listan aparte, siempre.** Existen con datos cargados adentro (Coelsa trae
   una columna "Revisar que se aplique descuento por ayuda especial" con importes). Nada se ignora en
   silencio — es la misma regla del default silencioso de `CLAUDE.md`, aplicada a columnas enteras.

**Hallazgos que condicionan el diseño** (verificados contra archivos reales, detalle en la spec): el
bloque de identificación mide 3, 6, 8, 9 o 31 columnas según cliente y variante, así que el primer
concepto puede caer en D, E, F, G, I, J o AF — nunca asumir "columna J" ni "fila 2"; en SIASA y Coelsa el
bloque está corrido una fila; la fila de nombres en criollo puede no existir; la fecha de la fila 1 puede
ser la de la plantilla original y no la del período (POP: 09/08/2024 en archivos de 2026); hay códigos
duplicados en dos columnas (605705, 1530, 1600), códigos no numéricos (`SAL BAS`) y 17 códigos con rótulo
distinto entre dos archivos del mismo cliente y mes (Coelsa) — refuerza D-039: matchear siempre por
código; el valor del importador viene como `cantidad$importe` pegados en una celda y es formato normal,
no error; y el Tabulado **no trae todos los conceptos liquidados** (Red Bull: un concepto sumado en la
columna Exento sin columna propia, verificado por suma), por lo que N2 necesita también el totalizador.

**Alternativas descartadas:** controlar la transcripción planilla→importador como control aparte (B2a) —
lo disuelve el generador; negociar un template de novedades con cada cliente (B0) — el importador ya es
el template común; convertir unidades para comparar horas contra importes — D-065; bloquear la corrida
cuando algo no es comparable — esconde el resto del cruce que sí funciona.

**Motivo:** decisión explícita de Willy en la sesión del 2026-08-20, sobre las tres preguntas que dejó el
relevamiento. El roadmap por fases (N0a lector ExpNov, N0b parser Axton de Tabulado, N1 generador, N2
cruce), los pilotos (SIASA y Merz; POP para volumen) y lo que queda afuera están en
`specs/familia-novedades-axton.md`; los prompts de arranque de cada frente, en
`docs/prompts-familia-novedades.md`.

---

## D-071 — El importador de novedades que genera la app: layout deducido (a confirmar), una UO por corrida, y el cuadre cierra al centavo

**Fecha:** 2026-08-20. **Contexto:** implementación de N1, el generador de importador de la familia de
Novedades de Axton (D-070, `specs/familia-novedades-axton.md`). Cuatro decisiones que el código no explica
solo y que conviene no volver a discutir sin motivo — la primera está **abierta a confirmación de Willy**.

**1. El layout del `F2` generado se dedujo del relevamiento y falta confirmarlo contra un archivo real.**
Fila 1 la metadata de la unidad organizativa (o `Empresa` cuando la planilla declara empresa y no UO),
fila 2 el encabezado —`Legajo`, `Apellido y Nombres` y un código de concepto por columna—, datos desde la
fila 3, **sin fila de nombres en criollo**: los F2 de SIASA y de Merz, los dos pilotos, traen sólo códigos.
La celda va como texto (`1$159811,7958` interpretado por Excel se vuelve una moneda) y el legajo también
(los ceros a la izquierda se pierden como número), y el legajo se escribe **tal como lo trae la planilla**,
no normalizado: Axton lo espera como lo conoce el cliente. Lo que sostiene esto mientras no haya un F2
real: el **ida y vuelta** escrito como assert —el archivo que genera la app lo vuelve a leer el lector
ExpNov con los mismos valores— que prueba coherencia interna y no que Axton lo acepte. Si el sistema
espera otra cosa, el archivo se rechaza al subirlo y eso no se descubre leyendo código: es el primer ítem
de "Lo que N1 espera de un archivo real" en la spec.

**2. Una unidad organizativa por corrida.** El `F2` sale por UO y la planilla del cliente cubre una: así
están guardadas las de SIASA, una carpeta por UO, y con 4 UOs son 4 corridas. La UO sale de la fila 1 del
archivo o de lo que el analista carga en el Paso 2; si no la declara nadie, el importador se genera igual
y la pantalla lo avisa — no se inventa un número de UO. **Alternativa descartada:** partir una planilla en
varios F2 por una columna de UO. El lector no devuelve la UO por empleado y ninguna planilla relevada la
trae por fila: agrupar por una columna que hay que adivinar es exactamente el default silencioso que
`CLAUDE.md` prohíbe. Si aparece un cliente que manda las UOs juntas, se extiende el lector primero.

**3. El mapeo rótulo → código se guarda por rótulo, no por letra de columna.** El juego de conceptos
cambia mes a mes y se corre de columna (Epiroc pasó de 12 a 11 entre junio y julio, "se corre todo una
letra"): una config por posición queda apuntando al concepto de al lado al mes siguiente, sin que nada
avise. Y el catálogo de conceptos del cliente **sugiere** el código de una columna que sólo trae criollo,
con match **exacto** sobre el rótulo normalizado, pero no lo aplica: la confirmación es del analista
(D-039). Un match parcial —"COCHERA" contra `4899-COCHERA_IG` y `8805-DTO_COCHERA`— propone el concepto
equivocado con la misma cara de acierto que uno bueno.

**4. Los dos cuadres del control cierran al centavo, y no con el monto de diferencia del cliente
(D-069).** El control declara `ownTolerance`. Los dos lados de cada comparación son **el mismo dato del
mismo mes**: el archivo generado contra la planilla de la que salió, y el archivo generado contra el
importador que se armó a mano. Una diferencia de $ 0,50 ahí es un error de armado, no una diferencia de
criterio, y subir el umbral taparía justamente lo que el control existe para mostrar. Se suma que además
de importes se comparan **cantidades** (horas, días): medirlas con un monto en pesos escondería tres horas
de diferencia detrás de un umbral de $ 100.

**Dos cambios de contrato que entraron con esto:**

- **`parseMetadata.celdasSinCodigo`** en el lector ExpNov (N0a): el **contenido** de las columnas sin
  código, celda por celda, que antes sólo se contaba. Es lo que permite ofrecerle al analista resolver el
  código en pantalla y decir **quién** quedó afuera, no sólo cuántas celdas. Va aparte de `parsedRows` a
  propósito: `parsedRows` es lo que ya tiene concepto, y mezclarlos haría que un total de novedades
  incluya en silencio lo que todavía no se pudo asignar.
- **`mapping['<key>Meta']`** en `controlsWizard.js`: la metadata de cada `additionalFile` viaja al `run()`
  igual que sus filas, de forma genérica para cualquier control. Hay formatos donde lo que el parser **no
  pudo** asignar es parte del resultado; sin esto el control no tiene con qué informarlo y volvería a
  quedar ignorado en silencio.

---

## D-072 — El lector robusto del Tabulado de Axton vive aparte del parser estricto, y el totalizador se distingue por el campo `Reporte:`

**Fecha:** 2026-08-20. **Contexto:** construcción del cimiento N0b de la familia de Novedades
(`specs/familia-novedades-axton.md`), sobre el relevamiento de los 7 clientes Axton y las firmas de
Tabulado que dejó (D-070, § "El lado liquidación").

**El problema.** Ya existía `js/parsers/tabAxtonParser.js`, que lee el Tabulado de Axton en su forma
**estricta**: encabezados en la fila 1, subencabezados Cant/Imp en la fila 2 —obligatorios— y datos desde
la fila 3. Sirve para lo que se construyó (el control de Variación entre quincenas de POP, que recibe
exactamente ese layout) y no sirve para los otros seis clientes: cinco exportan **sin ninguna columna
Cant**, cuatro traen preámbulo de 1 o 2 filas antes de los encabezados, dos traen `TOTAL GENERAL`
duplicado, y uno trae filas con fórmulas agregadas a mano debajo del cierre.

**Qué se decidió — 1. Módulo nuevo, no ampliar el estricto en el mismo PR.** El lector robusto es
`js/parsers/tabAxtonReader.js` (`readTabAxton` + `layoutTabAxton`), y `tabAxtonParser.js` queda intacto.
Ampliar el estricto habría cambiado, de paso, el resultado de un control que ya corre en producción:
emite claves distintas (`cant_<codigo>` no existe en la variante sólo-Imp), no mete la fila `TOTAL GENERAL`
entre los empleados, y acepta filas que el otro descarta (un legajo `'12-B'`, que el estricto filtra con
`/^\d+$/`). **Deuda declarada:** que `tabAxtonParser.js` pase a delegar en el lector es un PR aparte, con
la verificación de que Variaciones sigue dando lo mismo. Lo que **no** se acepta es que las dos lógicas
sigan divergiendo: cualquier firma nueva se agrega al lector, no al parser estricto.

**2. La fila `TOTAL GENERAL` no viaja entre los empleados.** El parser estricto la emite en `parsedRows`
con `legajo: null`; el lector la deja en `parseMetadata.totalGeneral`. Es la misma razón por la que
`countUniqueLegajos` existe (D-042): una fila de totales metida entre los datos infla cualquier conteo que
no se acuerde de filtrarla, y acordarse es opcional. Con la fila afuera, `parsedRows.length` es la cantidad
de liquidaciones y nada más.

**3. El corte de las filas agregadas a mano es el ÚLTIMO `TOTAL GENERAL`, no el primero.** En la variante
duplicada la copia de arriba puede caer dentro del preámbulo (SIASA) o pegada debajo de los
subencabezados. Cortar en la primera copia descartaría la nómina entera como "fila agregada a mano" y el
archivo se leería sin un solo empleado — con un error que hablaría de otra cosa. Escrito como assert en
`tests/tabAxtonReader.test.js`.

**4. El campo `Reporte:` del preámbulo entra al detector de formato, con un cuarto formato: `axton_tot`.**
Los tres exports de Axton arrancan igual —preámbulo `EA: …`, columna `Legajo`— y lo único que los
distingue es ese campo: `Resumen de Liquidacion` y `Consulta de Liquidacion` son el Tabulado, `Totales de
Concepto` es el totalizador, que es otro archivo y tiene otro lector. Sin esa firma, el totalizador subido
en el casillero del Tabulado se clasificaba como `axton_imp` y moría más adelante con un error sobre
subencabezados que el archivo nunca tuvo. Ahora el lector corta diciendo qué archivo es y dónde va.
`classifyTabulado` devuelve además `reporte` en todos los casos; ningún control lo consume todavía.

**5. La validación de sumas contra `TOTAL GENERAL` es aviso, no corte.** El export puede venir retocado a
mano antes de enviarse y se acepta igual (D-065); si un concepto no cierra, el resto del archivo sigue
sirviendo. Lo que no puede pasar es que no se note: los conceptos que no cierran salen en
`totalesQueNoCierran` con los dos números y en un aviso. La tolerancia es de un centavo fijo y **no** es
la del cliente (`clients.diffTolerance`, D-069): esa mide una diferencia de negocio, ésta mide si leímos
bien el archivo.

**6. El totalizador se lee con un segundo export del mismo módulo, no con uno nuevo.**
`readTotalesConcepto` convive con `parseTotalesConcepto` en `js/parsers/totalesConceptoParser.js` y
comparte con él la lectura de la tabla (las dos ramas, HTML y .xlsx real). Se diferencian sólo en qué
columnas exigen y qué devuelven: la Contabilidad Desglosada exige las dos cuentas contables —ahí el
movimiento contable *es* el entregable— y el cruce no, porque el export que se baja para comparar
novedades puede venir sin ellas y sirve igual. Exigirlas rechazaría un archivo válido; duplicar el módulo
volvería a partir en dos la lectura de un mismo formato, que es el error que este repo ya pagó cuatro
veces.

**Alternativas descartadas:** hacer que `tabAxtonParser.js` delegue en el lector en este mismo PR — cambia
un control en producción sin verificarlo contra un archivo real; inferir la cantidad desde el importe en la
variante sólo-Imp — D-065; completar con `null` las claves `cant_<codigo>` que el archivo no trae — un
`null` se lee igual que "vino vacía" y una de las dos lecturas miente; cortar la corrida cuando una suma no
cierra contra el `TOTAL GENERAL` — esconde el resto del archivo, que sí sirve.

**Pendiente de verificación:** el lector todavía no se corrió contra un Tabulado real — los del
relevamiento no entraron al repo. Ahí puede aparecer alguna variante de firma no vista.

---

## D-073 — Novedades vs Liquidación (N2): el legajo sin nada comparado cuenta para el semáforo, el Tabulado entra como archivo adicional, y el totalizador es obligatorio

**Fecha:** 2026-08-20. **Contexto:** implementación de N2, el cruce contra la liquidación de la familia de
Novedades de Axton (D-070, `specs/familia-novedades-axton.md`). Tres decisiones de criterio que hicieron
falta para entregar el control funcionando y que el código no explica solo — las tres quedan **abiertas a
confirmación de Willy** cuando aparezca el primer archivo real (D-064).

**1. El legajo del que no se pudo comparar nada cuenta para el semáforo, igual que uno con diferencia.**
`unitsWithDiff` es la unión de los legajos con alguna diferencia, los que tienen algo sin contraparte, y
los que no tuvieron ni un solo par comparable (por ejemplo, todos sus conceptos cayeron en "no comparable"
o el legajo no aparece en ningún lado con algo comparable). **Alternativa descartada:** dejarlo fuera del
numerador porque "no hay diferencia detectada". Se descartó porque el semáforo saldría verde sobre un
legajo que en realidad nunca se miró — la misma lógica que ya usa D-070 para la banda "no comparable" (no
bloquea, pero tampoco aprueba), llevada al semáforo.

**Con una excepción, encontrada en la revisión del propio PR:** el legajo cuyas novedades son **todas**
conceptos que el analista declaró como "no llega a la liquidación" **no** entra al numerador. Ahí no hay
nada que comparar por decisión suya y no por un hueco del archivo, y sin la excepción una sola columna
informativa cargada para toda la nómina pintaba el control en rojo por lo que el propio analista había
declarado como esperado — justo lo contrario de lo que promete el panel del Paso 2. Escrito como assert.

**2. El Tabulado de Axton entra como archivo adicional (`tab_axton_cruce_file`), no por el casillero
estándar del Tabulado.** Ese casillero cablea el lector de Meta4 (`parseTabuladoControl`), y además el
`parseMetadata` del Tabulado principal no llega completo a `run()` — y este control necesita la metadata
entera: qué conceptos tienen columna propia, si el export trae cantidades. Como archivo adicional, el
wizard le pasa filas y metadata sin ningún caso especial. De la misma decisión salen dos fichas de tipo de
archivo hermanas de las que ya existían para otros usos: `tab_axton_cruce_file` usa el lector **tolerante**
(`readTabAxton`, D-072) en vez del estricto que usa Variación entre quincenas de POP, y
`totales_concepto_cruce_file` usa `readTotalesConcepto` en vez de `parseTotalesConcepto`, porque no exige
las cuentas contables que sí necesita la Contabilidad Desglosada. **Alternativa descartada:** ampliar el
casillero del Tabulado estándar para que acepte también el formato Axton — cambiaría, de paso, el
resultado de un control que ya corre en producción (mismo motivo de D-072).

**3. El reporte "Totales de Concepto" es obligatorio, no opcional.** Sin él, la banda "sin contraparte" no
tiene un motivo cierto: no se puede distinguir "el concepto no se liquidó" de "el Tabulado no lo muestra en
columna propia", que es justo la pregunta que el analista se hace en la banda que más le importa (hay
conceptos liquidados sin columna propia, verificado por suma en Red Bull, Epiroc y SIASA). El código ya
soporta que el día de mañana se declare opcional: las filas salen igual, con el motivo
`no_determinable_sin_totalizador`. **Alternativa descartada:** dejarlo opcional desde el vamos — la banda
"sin contraparte" perdería el motivo por el que existe en más de la mitad de los clientes Axton, que son
justamente los que no traen columna propia para todos los conceptos.

**Pendiente de verificación:** el control no se corrió todavía contra ningún archivo real — no hay exports
de cliente en el repo ni en el entorno de desarrollo. Hace falta un importador + un Tabulado + un Totales
de Concepto reales del mismo período de una UO de SIASA 07/2026, y con eso un caso completo de un legajo
(D-064) antes de generalizar cualquiera de las tres decisiones de arriba.

**Deuda que dejó la revisión de este PR, en otros módulos y por eso no arreglada acá:**

1. **`expNovParser.js` pierde una columna de concepto con código no numérico** cuando los códigos vienen en
   la fila de **abajo** del ancla (la variante donde la fila de criollo ES la del ancla): el estirado del
   bloque de identificación hacia la izquierda no corre, y la columna no aparece ni en `columnas` ni en
   `columnasSinCodigo` ni en `avisos`. Las celdas desaparecen y el control informa que no falta ninguna
   columna. Toca el contrato de N0a y cambia el resultado de N1, así que va en su propio PR con su test.
2. **`novedadesImportador.js` (N1) y `acreditaciones.js` devuelven `status: 'warning'` en su rama de
   error**, donde los otros nueve controles devuelven `'error'`. Con `'warning'` la tarjeta sale neutra y
   la corrida se lee "N/N controles en verde" mientras el checklist pinta el mismo control en rojo. El test
   de N1 fija hoy ese `'warning'` en tres asserts, así que corregirlo es un PR aparte.

---

## D-074 — Control de Netos: las alícuotas y el acuerdo son del Tabulado y del convenio, no de una config única

**Fecha:** 2026-08-20. **Instrucción de:** Willy, después de correr el control contra los cuatro
Tabulados reales de 05/2026 (IFSA, RELEF, FGSA e Intelicar) y su planilla de armado manual "Formula
sueldos 05.2026 afa actualizado" (hoja "personal en convenio" para el AFA, hoja "ESCALA COM" para la
escala). Intelicar es Camioneros y queda fuera de este control (su recibo trae adicional de rama,
MOPRE y viáticos, que el modelo no contempla). Con los tres Tabulados de Comercio: 619 legajos
evaluados, 206 con diferencia sin explicar antes de estos cambios.

**1. Las alícuotas de retención se leen del Tabulado, empleado por empleado — la config queda como
respaldo, no como fuente.** El archivo trae una columna de porcentaje por cada aporte (610
jubilación, 612 ley 19.032, 616 obra social, 632 ANSSAL, 676 sindicato, 623 FAECYS, 669 CEC, 677
AMECYS, 678 retención del afiliado) y ahí está declarado quién aporta qué. Las alícuotas del Paso 2
sólo se usan cuando el archivo no trae esas columnas. Si la columna está y dice 0, manda el 0: "no
aporta" es un dato, no un hueco a completar con la config (Willy: *"si dice 0, va 0"*). Con esto
entran tres retenciones que el control no conocía: el 1% de AMECYS (código 8559, 7 legajos), el 1%
del CEC —que en este Tabulado se liquida bajo el código `8538-FAECYS_VAC`, cuyo nombre engaña— (52
legajos) y los empleados sin obra social. La retención del afiliado (el segundo 2% al sindicato) sale
del Tabulado por el mismo motivo y ya no tiene alícuota en la config (`cfg.tasas.afiliadoExtra` se
elimina): el archivo es el único lugar que dice **quién** está afiliado, así que un porcentaje suelto
en la config se lo cobraría a toda la nómina.
   - Alternativa descartada: seguir derivando el factor remunerativo sumando los `%` de la config
     (el diseño original de la spec, §6.1). Se descarta porque esa suma es igual para toda la nómina y
     no puede distinguir al afiliado del que no, ni al que no tiene obra social.
   - Nota técnica de soporte: las alícuotas y los años de antigüedad se leen con el **máximo** del
     grupo de liquidaciones del legajo, no con la suma (función `maxCodes`). El Tabulado trae una fila
     por liquidación (ver el gotcha de consolidación en `CLAUDE.md`) y el legajo con la mensual y la
     baja del mismo mes declara su 11% de jubilación en las dos filas: sumadas daban 22%. Afecta a 4
     legajos de Comercio en los archivos de 05/2026.

**2. `1684-ANTIC_INCENTIVO` no aporta nada — familia nueva, `noRemuSinAporte`.** Estaba en
`noRemuOtros` (no remunerativo común), y el control le cobraba el 2,5% gremial que la liquidación no
le cobra: ese 2,5% quedaba como diferencia sin explicar en 109 legajos. Willy confirmó el criterio el
2026-08-20: *"no aporta nada"*. `noRemuSinAporte` suma entero al neto, sin ningún descuento.
   - Caso verificado (spec, D-064): el legajo cajero con 18 años de antigüedad. Base sueldo + AFA
     1.119.857,62, anticipo de incentivo 44.704,94, residuo antes del cambio +1.117,63 — exactamente
     el 2,5% de ese concepto. En el empleado que además tiene la obra social que cobra sobre lo no
     remunerativo o el 2% del afiliado, la diferencia era ese mismo concepto por 5,5% o 4,5%.

**3. El acuerdo es del convenio — no de todos los que liquida el cliente.** Config nueva, `convenio`
(semilla `'Comercio'`), comparada contra la columna CONVENIO del Tabulado. Al empleado que no
pertenece a ese convenio el control lo sigue controlando —Willy pidió expresamente que se los siga
controlando a todos, no que se los excluya— pero le arma el recibo con su sueldo + AFA menos sus
propios aportes: sin acuerdo no remunerativo, sin antigüedad, sin presentismo y sin descuento
sindical (cuando la columna del porcentaje gremial no está para ese legajo, el respaldo es 0 y no el
2% de la config, porque ese 2% es del convenio que no le corresponde).
   - Alternativa descartada: la que había hasta este commit, calcularle a todos el acuerdo y los
     adicionales del convenio de Comercio. Le inflaba el recibo teórico a cualquier fuera de convenio
     —el ejemplo verificado es un legajo con 39 años de antigüedad, que la antigüedad sola ya lo sacaba
     con diferencia— y eran 50 de los 206 legajos sin explicar.
   - Si el Tabulado no trae la columna CONVENIO, no se adivina quién está fuera: se avisa en pantalla
     y se los trata a todos como del convenio, que es lo que hacía el control antes de este cambio.

**Resultado de la verificación.** Con los tres cambios, las diferencias sin explicar de los tres
Tabulados de Comercio bajaron de 206 a **17** legajos. Los 37 legajos de la planilla manual de Willy
cierran todos dentro de la tolerancia de $100, y en 32 de los 37 el neto teórico del control es
idéntico al centavo al de la planilla; los 5 que difieren son los 4 afiliados al sindicato y el que
paga AMECYS, donde el control contempla retenciones que la planilla de Willy no tiene — confirmado
que el control es el que está bien, porque esos 5 legajos cierran contra la liquidación real.

**Pendiente, sin resolver — no es un criterio confirmado, es una pregunta abierta.** De los 17
legajos que siguen con diferencia, 15 son de fuera de convenio y 2 de Comercio, y los 17 tienen la
columna OBRA_SOCIAL en 0. A los 15 la liquidación no les retuvo absolutamente nada (el neto liquidado
es igual al remunerativo); a los 2 sólo les retuvo jubilación, aunque el Tabulado declara para todos
ellos las alícuotas 11 / 3 / 2,55 / 0,45. Parecen directores o socios sin aportes, pero eso es una
lectura de quien mira el dato, no una regla que Willy haya confirmado: **PENDIENTE: falta que Willy
defina el criterio** antes de tocar el control para estos casos.

**Fuera de esta decisión, identificado y sin arreglar:** el KPI "Legajos cruzados" del hero de
resultados cuenta sólo los empleados del Tabulado principal (380 en esta corrida), mientras la
tarjeta del control informa 619 porque las otras dos empresas entran por los casilleros adicionales
del control. Es el mismo dato con dos poblaciones distintas en la misma pantalla; no se tocó en este
commit.

**Alcance.** Sigue siendo `scope: 'cliente'` de SPORTLINE (D-067). Verificado contra los tres
Tabulados de Comercio del grupo (IFSA, RELEF, FGSA); Intelicar no participa de este control.
