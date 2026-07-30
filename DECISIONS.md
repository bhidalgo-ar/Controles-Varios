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
