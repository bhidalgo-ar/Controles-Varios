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
