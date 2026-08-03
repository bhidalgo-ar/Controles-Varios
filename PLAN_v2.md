# PLAN — Integración de los documentos v2 y ejecución por tajadas

> **Fecha:** 2026-07-29
> **Alcance:** cómo llevar al repo los seis archivos subidos (PRD, ARCHITECTURE, DECISIONS_nuevas_entradas, ROADMAP, seed) y cómo ejecutar el rediseño v2 en incrementos chicos, priorizando funcionalidad visible por sobre refactors internos.
> **Regla del plan:** una tajada = un PR = algo que un analista puede usar (o, si es refactor, algo que no cambia nada observable y se verifica con los tests existentes).

---

## 0. Antes de empezar: estado a 2026-07-30

### 0.1 El seed real está en el repo — por ahora, aceptado

El commit `ea6f38e` subió `hya-controles-config.seed.json` a la raíz de `main` de un repo hoy público. Guillermo confirmó que no hay problema en que los datos de clientes estén ahí mientras tanto; el repo pasa a privado más adelante. No se reescribe historial. Queda igual la recomendación de fondo para cuando eso ocurra: el seed **real** (con los 22 clientes) termina viviendo en SharePoint, y en el repo solo queda un ejemplo anonimizado — no es urgente, es la forma correcta de mantenerlo una vez que el repo sea privado y el flujo de import (T3) esté andando.

### 0.2 Los `code` de cliente están confirmados

**Cerrado el 2026-07-30 por Guillermo Esposito.** Los 22 `code` del seed dejan de ser propuesta: son identidad estable (D-004) desde ahora. Registrado en `hya-controles-config.seed.json` (`_pendingReview`). Esto destraba la tajada 3 sin condiciones — importar el seed ya no espera nada.

Sigue pendiente, sin bloquear nada: `controlConfigs` vacío (releva en paralelo con T4/T5, ROADMAP 2.9) y la brecha de 9 consultores contra ~15 analistas estimados.

### 0.3 Axton queda deprioritizado

**Decisión del 2026-07-30:** Axton (T7 seam de adaptadores + T8 piloto Merz) no es prioridad ahora — se retoma más adelante. No hace falta pedir los archivos de Merz todavía. El plan se ejecuta hasta T6 (herramienta multi-cliente, multi-analista, con seed y modo admin) y ahí se reevalúa si seguir a T7-T9 o priorizar otra cosa.

---

## 1. Desvío respecto de ARCHITECTURE.md §2 (y por qué)

`ARCHITECTURE.md` propone pasar `clients` a `&code` como clave primaria en un solo salto v3→v4, reescribiendo las FK de `groupers`, `fileProfiles`, `sessions`, `controlRuns` y `clientCatalogs`. `ROADMAP.md` lo pone como ítem 2.1, prioridad 1.

Eso es un big-bang: hay **42 usos de `clientId` en `db.js` y 9 archivos que lo pasan** (`main.js`, `wizard.js`, `controlsWizard.js`, `controlsResults.js`, `checklistView.js`, `fileUpload.js`, `grouperEditor.js`, `resultsView.js`). Un PR que toca los nueve, migra datos existentes y no entrega ninguna funcionalidad nueva es exactamente lo que este plan quiere evitar.

**Estrategia alternativa: migración aditiva.**

- v4 agrega `code` como **índice único junto a `++id`**, que sigue siendo la PK: `clients: '++id, &code, name, sourceSystem, active, team'`.
- Las tablas **nuevas** (`controlConfigs`) usan `clientCode` desde el día uno.
- Las tablas **existentes** siguen con `clientId` hasta que algo funcional exija cambiarlas.
- El cierre de la migración (FKs a `clientCode`, drop de `clientId`) queda como última tajada, **opcional**: si nada la necesita, no se paga.

El resultado observable es el mismo que describe ARCHITECTURE (seed compartido referenciando clientes por `code`), con el riesgo repartido en pasos reversibles. Esto contradice el texto del documento, así que se registra como decisión (D-011 en la tajada 0) en vez de dejar el código y el doc en desacuerdo.

---

## 2. Las tajadas

Tamaños: **S** <1 día · **M** 1-3 días · **L** >3 días. Cada tajada indica qué gana el analista, qué archivos toca y cómo se verifica.

### T0 — Documentos y hogar del seed · S · sin código

Lo único que hace falta hacer para "aplicar los archivos", sin tocar la app.

| Acción | Detalle |
|---|---|
| Consolidar docs en la raíz | Los archivos subidos ya están en la raíz; borrar los duplicados de `Claude md/` (`PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`) y **mover `CLAUDE.md` a la raíz** |
| Anexar decisiones | Pegar D-004 … D-008 al final de `DECISIONS.md` (D-001 a D-003 intactos) y borrar `DECISIONS_nuevas_entradas.md` |
| Dejar el esquema de ejemplo en el repo | `config/hya-controles-config.example.json` con 2 clientes ficticios + `config/SEED_SCHEMA.md` describiendo los campos — sin sacar todavía el seed real (§0.1) |
| Corregir `CLAUDE.md` | Hoy dice "dar doble click al HTML y que funcione"; con ES modules es falso (ya corregido en PRD §6 y ARCHITECTURE §1). Es el archivo que Claude Code lee en cada sesión: dejarlo desactualizado cuesta trabajo real |

**Decisiones nuevas a registrar:** D-009 (docs a la raíz, supersede D-001 — y el motivo concreto: `CLAUDE.md` en la raíz es el único lugar donde Claude Code lo carga solo), D-010 (el seed real se acepta temporalmente en el repo público; pasa a SharePoint cuando el repo sea privado, ejemplo anonimizado queda igual en el repo), D-011 (migración aditiva en vez del v4 big-bang de ARCHITECTURE §2).

**Listo cuando:** hay un solo `PRD.md`, un solo `ARCHITECTURE.md` y un solo `ROADMAP.md` en el repo; `DECISIONS.md` llega hasta D-011; existe el ejemplo anonimizado en `config/`.

---

### T1 — Respaldo local exportable · S · red de seguridad de todo lo demás

Botón **Exportar respaldo (JSON)** en el home: volcado de todas las tablas de IndexedDB a un archivo, con su contraparte de import.

Va primero porque cada tajada siguiente corre un `upgrade()` de Dexie sobre datos que solo existen en el navegador del analista. Hoy, si una migración sale mal, el historial de corridas de ese analista no se recupera. Cubre además el ítem 3.7 del ROADMAP.

**Toca:** `js/db.js` (+ `exportDbBackup()` / `importDbBackup()`), `js/ui/clientsList.js`.
**Listo cuando:** exportar en un navegador con datos, borrar la base, importar, y el listado de clientes y corridas queda igual.

---

### T2 — `code` y atributos de cliente · M · DB v4 (aditiva)

- `db.version(4)`: `clients: '++id, &code, name, sourceSystem, active, team'`, resto de las tablas sin cambios.
- `upgrade()`: a cada cliente existente, `code` = slug del `name` en mayúsculas, `sourceSystem: 'meta4'`, `active: true`, `attributes: {}`, `ccts: []`, `entityCount: 1`.
- Formulario de cliente: `code` (editable solo al crear), `sourceSystem`, equipo, consultor, CCTs, dotación, atributos (`pluriempleo`, `holding`, `paymentUsd`, `f1359`, `retroactividad`).
- Helper `getClientByCode(code)` y `resolveClient(codeOrId)` para que lo nuevo hable en `code` sin romper lo viejo.

**Gana el analista:** ve sistema de origen, equipo y CCT de cada cliente en la lista — hoy solo hay nombre y notas.
**Toca:** `js/db.js`, `js/ui/clientsList.js`.
**Riesgo:** el `upgrade()` corre una sola vez por navegador. Mitigación: T1, más colisión de slug resuelta con sufijo numérico y aviso.
**Listo cuando:** un navegador con clientes v3 abre la app y todos tienen `code` único y `sourceSystem`, sin perder corridas.

---

### T3 — Import del seed: los 22 clientes · M · primer valor grande

Import manual del JSON desde la UI, con `fetch('./config/hya-controles-config.json')` intentado en silencio primero (inútil en GitHub Pages, listo para cuando el hosting se mueva — ROADMAP parking lot).

- Chequeo de `schemaVersion` (incompatible → se rechaza con mensaje claro) y de `configVersion` (más viejo que el cargado → avisa antes de aplicar).
- Merge por `code`: upsert de clientes, `sourceSystems`, `teams`. **Nunca toca `controlRuns`, `controlRunFiles`, `controlRunResults`, `clientCatalogs`** (ARCHITECTURE §6).
- Versión del seed cargado visible en el header o el footer (mitigación del primer riesgo del PRD §7).

**Gana el analista:** abre la app, importa un archivo y tiene la cartera completa. Hoy tendría que crear 22 clientes a mano, cada uno en su navegador, con nombres distintos entre analistas.
**Depende de:** T2 y de los `code` confirmados (§0.2).
**Toca:** `js/db.js`, `js/ui/clientsList.js`, nuevo `js/seed/importSeed.js`.
**Listo cuando:** dos navegadores importan el mismo seed y quedan con los mismos 22 clientes y códigos; el que ya tenía corridas las conserva.

---

### T4 — `appliesWhen` y scopes · M

- Cada entrada del `CONTROL_REGISTRY` gana `scope` (default `'general'`), `scopeMeta` y `appliesWhen(client)` (default `() => true`): los 10 controles actuales siguen apareciendo igual salvo donde se declare un predicado real.
- El wizard separa **"Aplican a este cliente"** de **"Otros controles"** (colapsado, no oculto, y solo aparece si hay algo que mostrar ahí): si un predicado se equivoca, el analista no queda bloqueado.

**Ajuste del 2026-07-30:** esta sección preveía 3 "primeros predicados reales" (`f1359`→Marval, `pluriempleo`→Sportline/Lowsedo, `paymentUsd`→Geopagos/Piano). No se implementaron: ninguno de los 10 controles del registry corresponde a esos atributos — F.1359 es un control hipotético de `ARCHITECTURE.md` §4, no uno de los 10 reales. Se le preguntó al usuario a qué control real atarlos y no hubo respuesta, así que se avanzó solo con el mecanismo (sin inventar la regla de negocio). Ver detalle en `specs/plan-v2-t0-t6.md` T4.

**Gana el analista:** hoy, nada observable todavía (los 10 controles siguen aplicando siempre) — pero el mecanismo queda probado y listo para el primer control que sí necesite restringirse.
**Depende de:** T2 (atributos).
**Toca:** `js/controls/registry.js`, `js/ui/controlsWizard.js`.
**Listo cuando:** `tests/controlsRegistryScope.test.js` y `tests/e2e/controlsWizardScope.spec.js` pasan en CI, confirmando que nada cambió para ningún cliente real.

---

### T5 — `controlConfigs` · M · DB v5

- `db.version(5)`: `controlConfigs: '[clientCode+controlId], clientCode, controlId, status'`.
- `upgrade()`: migrar las tres claves que hoy viven mal en `fileProfiles` — `brutos_tab_config`, `rendvstabu_concept_grouping`, `rva_config` (`controlsWizard.js:96-99`, `1264-1270`) — a `controlConfigs.params`, resolviendo `clientId → clientCode`. `fileProfiles` vuelve a ser solo mapeo de columnas (ARCHITECTURE §4).
- `status`: `activo` / `no_aplica` / `sin_configurar` / `forzado_activo` / `forzado_no_aplica`, con `overrideReason` obligatorio en los forzados.
- El seed pasa a poder traer `controlConfigs`; si el analista cambió un parámetro respecto del seed, la UI lo marca como **override visible** y no se pisa en silencio.

**Gana el analista:** la configuración de un control es del cliente y viaja en el seed — deja de reconfigurarse navegador por navegador. Y puede decir "este control no aplica acá" con motivo, cuando el predicado de T4 se equivoca.
**Depende de:** T3, T4.
**Toca:** `js/db.js`, `js/ui/controlsWizard.js`, `js/seed/importSeed.js`.
**Listo cuando:** un navegador con `brutos_tab_config` guardado en v4 abre la app y el control de Brutos arranca con la misma configuración de antes.

---

### T6 — Modo admin y export del seed · M

Pantalla `#/admin` con contraseña (hash SHA-256 comparado del lado cliente), documentada como barrera contra el acceso accidental y no como seguridad real (D-005). Permite editar atributos de cliente y `controlConfigs`, y **exportar el seed actualizado**.

Cierra el ciclo completo: Willy edita → exporta → sube a SharePoint → los analistas importan (T3).

**Gana Willy:** mantener el seed sin editar JSON a mano.
**Depende de:** T3, T5.
**Toca:** nuevo `js/ui/adminView.js`, `js/main.js` (ruta), `js/seed/exportSeed.js`.
**Listo cuando:** exportar desde admin, importar en otro navegador y obtener la misma configuración, sin perder corridas locales.

---

### T7 — Seam de adaptadores Meta4 · M · refactor, cero funcionalidad nueva · **deprioritizado**

`js/adapters/meta4/*` envolviendo los parsers actuales; los controles declaran `inputs` en forma lógica (`tabulado`, `reporte_brutos`, `reporte_nr`); los textos de "cómo consigo este archivo" pasan del control al adaptador (D-007).

**Deprioritizado el 2026-07-30 (§0.3):** no se agenda todavía. Cuando se retome, va acá y no antes porque no entrega nada observable por sí solo — es el precio de entrada de T8. Se valida con `tests/costoTotalParser.test.js` y `tests/rendVsAsientoDrill.test.js` más una corrida real de Marval antes/después.

**Toca:** nuevo `js/adapters/meta4/`, `js/controls/*.js`, `js/ui/controlsWizard.js`.
**Listo cuando:** una corrida de Marval con los mismos archivos da resultados idénticos a los de antes del refactor.

---

### T8 — Adaptador Axton, piloto Merz · M-L · desbloquea 8 clientes · **deprioritizado**

`js/adapters/axton/tabulado.js` y lo que exija el piloto. Merz: 44 pays, complejidad 1, un CCT.

Sería la tajada de mayor impacto funcional del plan — hoy los 8 clientes de Axton (Siasa, COELSA, Red Bull, Plastic Omnium Pilar, Epiroc, Geopagos, Poincenot, Coty) **no pueden usar la herramienta** — pero **queda fuera de alcance por ahora** (§0.3, decisión de Guillermo del 2026-07-30). No hace falta pedir los archivos de Merz mientras tanto. T0-T6 entregan igual una herramienta multi-cliente completa para los 14 clientes Meta4; Axton se retoma cuando vuelva a ser prioridad.

**Depende de:** T7 + archivos de Merz (ninguno de los dos, en curso).
**Listo cuando:** Merz corre con adaptador Axton y da el mismo resultado que daría el parser Meta4 con datos equivalentes (DoD de v2 en ROADMAP).

---

### T9 — Retirar la ruta de agrupadores · S · ✅ hecho (2026-07-31)

El cruce por agrupadores pasa a ser un control del registry con `scope: 'general'`; se retira `#/wizard/:clientId` y queda una sola ruta de validación (D-008). Cleanup: va al final, cuando nada nuevo dependa de la ruta vieja.

**Toca:** `js/main.js`, `js/ui/wizard.js` (borrado), `js/ui/resultsView.js` (borrado), `js/matching.js` (reusado, no borrado), `js/controls/agrupadores.js` (nuevo), `js/controls/registry.js`, `js/ui/controlsWizard.js`.
**Listo cuando:** no quedan dos rutas de validación paralelas (DoD de v2). Ver spec y decisiones concretas en `specs/plan-v2-t9-t10.md` y D-014.

---

### T10 — Cierre de la migración a `clientCode` · L · opcional · ✅ hecho (2026-07-31)

FKs de `groupers`, `fileProfiles`, `sessions`, `controlRuns` a `clientCode` (DB v6, agregando el índice nuevo y sacando `clientId` del índice — ver D-016 para por qué no es un "drop" literal). `clientCatalogs` es la excepción: Dexie no permite cambiar la primary key de una tabla existente, así que sigue usando `clientId` como PK por dentro, con `clientCode` como índice secundario resuelto en `db.js`.

Ejecutada por decisión de Guillermo (2026-07-31) como deuda técnica preventiva, sin que hubiera un caso funcional bloqueado. Detalle completo (incluida la limitación de Dexie descubierta al implementarla) en `specs/plan-v2-t9-t10.md` y D-016 de `DECISIONS.md`. Las rutas de la URL no cambiaron — siguen usando el id numérico de siempre.

---

## 3. Orden, y en qué se aparta del ROADMAP

| Tajada | ROADMAP | Prio ROADMAP | Orden acá | Por qué el cambio |
|---|---|---|---|---|
| T0 | — | — | 1 | Prerrequisito documental, sin código |
| T1 | 3.7 (v3) | 4 | 2 | Adelantado: es la red de seguridad de cada `upgrade()` posterior |
| T2 | 2.1 | 1 | 3 | Recortado a lo aditivo; el resto se va a T10 |
| T3 | 2.2 | 1 | 4 | Igual: es el primer valor grande de verdad |
| T4 | 2.5 | 3 | 5 | Adelantado sobre 2.3/2.4: es lo que hace que el seed se note en el wizard |
| T5 | 2.4 | 2 | 6 | Después de T4, que ya usa los atributos |
| T6 | 2.3 | 2 | 7 | Postergado: sin T5 no habría casi nada que editar desde admin |
| T7 | 2.6 | 3 | — (deprioritizado) | Sin fecha: se retoma cuando Axton vuelva a ser prioridad (§0.3) |
| T8 | 2.7 | 4 | — (deprioritizado) | Ídem — no se piden archivos de Merz por ahora |
| T9 | 2.8 | 5 | 8 | Sigue en pie, ya no depende de esperar a T7/T8 |
| T10 | 2.1 (resto) | 1 | 9 | Degradado a opcional (ver §1) |

`2.9` (relevar `controlConfigs` de los 21 clientes fuera de Marval) no es código: corre en paralelo desde T0 y alimenta T4 y T5.

**Con Axton deprioritizado, el plan ejecutable hoy es T0 → T6, después T9 y T10 si hacen falta.** T7/T8 quedan documentadas pero fuera del backlog activo hasta nueva decisión.

**Actualización 2026-07-31:** T9 y T10 se ejecutaron (ver sus secciones arriba). Con eso, el único ítem de este plan sin cerrar es Axton (T7/T8), deprioritizado sin fecha.

---

## 4. Definition of Done de v2

Los cuatro criterios del ROADMAP, contra las tajadas que los cierran:

- [ ] Un analista selecciona cualquiera de los 22 clientes y ve solo sus controles aplicables → **T3 + T4**
- [ ] El seed se exporta desde admin y se importa en otro navegador sin perder historial local → **T3 + T6**
- [ ] Merz corre con adaptador Axton y da el mismo resultado que Meta4 con datos equivalentes → **T7 + T8 (en pausa, §0.3)**
- [x] No quedan dos rutas de validación paralelas → **T9** (hecho 2026-07-31)

Con T0-T6 la herramienta ya es multi-cliente y multi-analista para los 14 clientes Meta4. El criterio de Axton queda abierto hasta que T7/T8 se retomen; no bloquea considerar la v2 utilizable en producción para esa porción de la cartera.

---

## 5. Riesgos del plan (los del producto están en PRD §7)

| Riesgo | Mitigación |
|---|---|
| Una migración de Dexie corrompe la base de un analista | T1 primero; cada `upgrade()` es aditivo y se prueba con una base v3 real antes de mergear |
| Los `code` cambian después de distribuir el primer seed | Confirmarlos antes de T3; después de T3, un cambio de `code` es una migración de datos, no una corrección |
| El refactor de adaptadores (T7) rompe controles que hoy funcionan | Los 2 test files existentes + corrida de Marval antes/después; T7 no cambia nada observable, así que cualquier diferencia es un bug (aplica cuando se retome, §0.3) |
| El repo sigue público más tiempo del previsto con datos de clientes | Aceptado por Guillermo (§0.1); pasar a privado sigue siendo la acción pendiente, sin fecha comprometida en este plan |
