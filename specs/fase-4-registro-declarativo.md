# Fase 4 — Registro declarativo de archivos y controles

**Estado: spec, a confirmar por Willy antes de tocar código.**
Fecha: 2026-08-13 · Rama: `claude/fase-4-registro-declarativo-n1gz5v`

Continúa `specs/plan-escalabilidad-fases.md` (Fase 4) y **no pisa** el contrato de export
(D-041 / D-043 / D-045, `specs/contrato-export.md`): lo extiende. El Paso 4 de acá es literalmente
el "pendiente de fondo" que D-041 dejó documentado y que el Paso 6 del contrato volvió concreto.

> **El Paso 0 de la Fase 4 ya está mergeado.** El plan lo lista como pendiente, pero
> `promiseAllByKey()` (`js/ui/controlsWizard.js:134`) ya reemplazó el `Promise.all` de 11 promesas
> destructurado por posición. Este documento arranca después de eso.

---

## El problema, medido

**Un tipo de archivo nuevo toca 19 puntos** repartidos en dos archivos, sin un solo guard entre
ellos. Olvidarse de uno no rompe nada visible: el archivo sube y algo queda mal en silencio.

| # | Dónde | Qué |
|---|---|---|
| 1 | `fileUpload.js:5-23` | el `import` del parser (16 líneas hoy) |
| 2 | `fileUpload.js:35` | entrada en `FIELD_DEFS` (17 entradas) |
| 3 | `fileUpload.js:152` | el alias `FIELD_DEFS.tab_prev_file = FIELD_DEFS.tab_control` |
| 4 | `fileUpload.js:155` | `TIPOS_CON_NOMBRE` (¿tiene selector de apellido/nombre?) |
| 5 | `fileUpload.js:170` | rama de arranque `conta_file` (multi-archivo) |
| 6 | `fileUpload.js:178` | rama de arranque `acumuladores_file` (multi-archivo + período) |
| 7 | `fileUpload.js:217` | rama "formato fijo, sin mapeo" (`concept_catalog \|\| cc_x_ee_file`) |
| 8 | `fileUpload.js:659` | metadata: rama `cat_empleados` |
| 9 | `fileUpload.js:663` | metadata: rama `concept_catalog` |
| 10 | `fileUpload.js:669` | metadata: **la cadena de 11 `\|\|`** — el punto que el skill marca como "el que se olvida" |
| 11 | `fileUpload.js:978` | `detectHeadersFor()`: rama Tabulado (HTML-aware) |
| 12 | `fileUpload.js:984` | `detectHeadersFor()`: rama FINADIET |
| 13 | `fileUpload.js:990` | `parseFile()`: el `switch` de 16 `case` |
| 14 | `fileUpload.js:1012` | `fileTypeLabel()`: el mapa de 17 entradas |
| 15 | `controlsWizard.js:29-36` | los 8 `import` de `autoDetect*Mapping` |
| 16 | `controlsWizard.js:86` | entrada en `AUTO_DETECT` |
| 17 | `controlsWizard.js:1031` | slot especial (`tab_prev_file` → `#js-var-prev-upload`) |
| 18 | `controlsWizard.js:1081` | re-render al cargar (`fileSpec.key === 'conta'`) |
| 19 | `controlsWizard.js:1086` | re-render al cargar (`fileType === 'tab_prev_file'`) |

**Un control con configuración propia toca 7 puntos más**, todos en `controlsWizard.js`
(verificado sobre `finadiet_asiento`, el último que entró):

`import` del editor + `DEFAULT_*` (41-46) · carga en `promiseAllByKey` (157-170) + destructuring
(171-176) · inicialización en `state` (205-226) · constante de IDs (100-105) · bloque de editor en
`renderStepFiles` (1097-1176) · `saveControlConfig` en `executeControls` (1789-1809) ·
`mapping.<x>Config` en `executeControls` (1855-1886).

**Y el mapa de necesidad de `js/exports/contracts.js` es plano por clave, no por
`(fileType, clave)`.** Ya hay **2 colisiones reales** (`puestoColumn`: opcional en `tab_control`,
`required` en `cat_empleados` · `costoTotalColumn`: opcional en `rend_file`, `required` en
`costo_total_file`). Hoy no pueden producir un gate incorrecto —el contrato es un piso y nunca un
techo (D-045)— pero **no se puede declarar la verdad de los dos lados**, y
`tests/exportContracts.test.js:283` afirma "son exactamente 2" para que una tercera no aparezca en
producción sin que nadie la vea.

---

## Decisiones ya tomadas por Willy (2026-08-13)

1. **Los dos flujos multi-archivo entran a la ficha.** CONTA y Acumuladores se declaran
   (`flow: 'multi' | 'multi-periodo'`) en vez de quedar como excepción cableada al arranque de
   `initFileUploadStep`.
2. **Las 27 columnas del panel «Columnas del Tabulado» se mudan a la ficha de `tab_control`**
   (`TAB_SHARED_FIELDS` + `TAB_BRUTOS_FIELDS` + `TAB_GS_PERS_FIELDS` + `TAB_NR_INDEM_FIELDS` +
   `TAB_NR_OTROS_FIELDS`, hoy en `controlsWizard.js:1300-1340`). Es lo que permite que el test
   verifique que cada `from` de un contrato apunta a un campo que existe de verdad.
3. **La config por control absorbe el ciclo completo** (carga · state · editor · guardado ·
   `mapping`), no sólo el editor del Paso 2.

---

## 1. Guardrails — qué puede modificar y qué no

**Puede modificar:**

- `js/ui/fileUpload.js`, `js/ui/controlsWizard.js` — son los dos archivos que la fase existe para
  desarmar.
- `js/ui/fileTypes.js` (nuevo), `js/controls/registry.js`, `js/exports/contracts.js`.
- `tests/*.test.js` de los módulos que se tocan, y `package.json` **sólo** para sumar tests nuevos
  a la cadena `test:unit`.
- `.claude/skills/nuevo-control/SKILL.md`, `DECISIONS.md`, `ARCHITECTURE.md`,
  `specs/plan-escalabilidad-fases.md`, `CHANGELOG.md` — en el último paso.

**No puede modificar, ni "de paso":**

- **`package.json` fuera de la cadena de tests.** Sin build step, sin bundler, sin dependencias de
  runtime nuevas (CLAUDE.md). Las librerías siguen entrando por CDN desde `index.html`.
- **Los `run()` / `summarize()` / `renderResults()` de los 15 módulos de control.** La Fase 4 cambia
  cómo se *declara* la entrada, no cómo se *calcula* la salida. Si un `run()` hay que tocarlo, es
  señal de que el paso se está pasando de scope: parar y avisar.
- **`js/controls/consolidate.js`, `js/utils/currency.js`, `js/utils/legajo.js`,
  `js/controls/semaforo.js`, `js/controls/tabCodes.js`** — los fundamentos de la Fase 1 y el
  semáforo. Ninguno tiene nada que ver con esta fase.
- **`js/exports/contractSheet.js` y los writers.** Migrar los writers del Paso 6 es el otro ítem
  abierto de `specs/contrato-export.md`, y es otro trabajo.
- **Los parsers (`js/parsers/*`).** La ficha los referencia; no los reescribe.
- **`css/tokens.css` y `css/components.css`.** La Fase 2 está cerrada.
- **Cualquier cosa que apunte a Finanzas (D-020)** o al banner de privacidad de `index.html`.

**Riesgo técnico específico, con nombre:** los **ciclos de módulos rompen sólo en el navegador**
(D-045 los descubrió cuando `contracts.js` empezó a importar `rendVsTabu.js`). `fileTypes.js` va a
importar los 16 parsers; **`contracts.js` NO puede importar `fileTypes.js`** — declara el fileType
de cada clave en su propio texto y el cruce entre los dos lo verifica el test, que corre en Node y
no arma el grafo del navegador. Por eso `npx playwright test` completo es obligatorio antes de cada
PR, no opcional.

---

## 2. Comportamientos a preservar

Cero cambio visible. Es refactor estructural. Lo que tiene que seguir funcionando **exactamente**
igual, y cómo se verifica:

| Comportamiento | Cómo se verifica |
|---|---|
| Los gates de carga de archivo: `blocksProgress` sigue siendo un **piso, nunca un techo** | `tests/exportContracts.test.js:147-159` (el barrido de los 15 fileTypes) |
| `pendingTabRequirements`: bloquea CLAVE/OBLIGATORIA sin resolver, y `OMITIDO` cuenta como resuelto | `tests/tabExtraOmission.test.js` (5 escenarios) |
| Los 18 conceptos de NR **no** bloquean todavía por vía del contrato | `tests/exportContracts.test.js:320-323` |
| `apellidoNombreColumn` y `puestoColumn` quedan OPCIONAL ("dejalo como está", Willy 2026-08-12) | `tests/exportContracts.test.js:190-201` |
| D-020: ningún export de Finanzas gana una columna de HR | `tests/exportContracts.test.js:114-126` |
| Los 6 contratos con writer declaran layout; los del Paso 6, no | `tests/exportContracts.test.js:73-98` |
| Consolidación por legajo, `null ≠ 0`, semáforo por unidad declarada | los 15 tests de control de la cadena `test:unit` |
| La app levanta con Dexie e IndexedDB reales y el wizard corre de punta a punta | `npx playwright test` — baseline del sandbox **9 passed / 12 failed**, los 12 por falta de red al CDN (no son regresión). Se confirma que el número no empeora |
| Cada tipo de archivo sube, muestra su línea de metadata correcta y auto-detecta sus columnas | Verificación en Chromium real (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) antes de cada PR |

**Baseline registrada hoy, antes de tocar nada:** `npm run test:unit` en verde — los 29 archivos de
la cadena, 0 ✗.

---

## 3. Scope

### Entra — 7 pasos, cada uno su propio PR mergeable

Cada paso deja el repo funcionando y `npm run test:unit` + `npx playwright test` en el estado de la
baseline. Ninguno depende de que el siguiente exista.

**Paso 1 — `js/ui/fileTypes.js`: la ficha por tipo de archivo.**
Un mapa único `FILE_TYPES = { nr_file: { label, fields, parse, detectHeaders, autoDetect, meta,
flow, nameMapping, aliasOf } }` para los 15 tipos de un archivo por slot. `fileUpload.js` pasa a
derivar de ahí los puntos 1-4 y 7-14 de la tabla de arriba. `FIELD_DEFS` se sigue exportando desde
`fileUpload.js` (derivado de `FILE_TYPES`) para no romper `tests/exportContracts.test.js` en el
mismo PR — se limpia en el Paso 5.
· Test nuevo: `tests/fileTypes.test.js` — todo `fileType` referenciado por
`CONTROL_REGISTRY[*].additionalFiles` existe en `FILE_TYPES` y declara `label` + `parse`; todo tipo
con campos declara `fields`; el alias `tab_prev_file` resuelve a los campos de `tab_control`.

**Paso 2 — los dos flujos multi-archivo entran a la ficha.**
`flow: 'single' | 'multi' | 'multi-periodo'`. Las dos ramas del arranque de `initFileUploadStep`
(puntos 5 y 6) pasan a despachar por el flag. `initContaMultiUpload` e
`initAcumuladoresMultiUpload` siguen siendo dos funciones distintas —hacen cosas distintas: una
mergea y avisa duplicados, la otra pide un período por archivo— pero ya no se eligen por nombre de
archivo cableado.
· Verificación obligatoria en navegador: subir CONTA (Rend vs Asiento) y varios Acumuladores.

**Paso 3 — el wizard deriva de la ficha.**
Puntos 15-19. `AUTO_DETECT` desaparece (pasa a `FILE_TYPES[ft].autoDetect`) y con él los 8 `import`
de `autoDetect*Mapping` del wizard. El slot especial de Variaciones y los dos re-render al cargar
pasan a ser flags declarados en la ficha o en el `fileSpec` del registry, según cuál sea propiedad
del tipo de archivo y cuál del control que lo pide.
· `tests/fileTypes.test.js` se extiende: todo tipo con mapeo de columnas declara `autoDetect`, o
declara explícitamente que no lo tiene.

**Paso 4 — las 27 columnas del Tabulado entran a la ficha de `tab_control`.**
`TAB_SHARED_FIELDS` / `TAB_BRUTOS_FIELDS` / `TAB_GS_PERS_FIELDS` / `TAB_NR_INDEM_FIELDS` /
`TAB_NR_OTROS_FIELDS` se mudan a `FILE_TYPES.tab_control.extraFields`, agrupadas por qué control las
pide. `pendingTabRequirements()` y `renderTabExtraConfig()` derivan de ahí en vez de armar la lista
con tres `if`. `TAB_EXTRA_CODIGO_TO_KEY` (código del catálogo → clave) va al lado, que es donde
pertenece.
· `tests/tabExtraOmission.test.js` sigue en verde sin tocarse — es el contrato de esta pieza.

**Paso 5 — el mapa de necesidad scopeado a `(fileType, clave)`.**
Cada `from` de `EXPORT_CONTRACTS` declara de qué tipo de archivo sale la clave.
`fieldNecessityMap()` pasa a estar scopeado; `necessityOfKey(fileType, key)` y
`blocksProgress(fileType, key, legacyRequired)` cambian de firma, y sus 4 consumidores de
producción con ellas (`fileUpload.js` ×2, `controlsWizard.js` ×2).
**El assert de `tests/exportContracts.test.js:283` pasa de "las divergencias son exactamente 2" a
"no hay divergencias: el mapa está scopeado"**, y se suma un assert nuevo: todo `(fileType, clave)`
de un contrato existe en la ficha de ese tipo — es lo que agarra una clave mal tipeada.
· `FIELD_DEFS` deja de exportarse desde `fileUpload.js`: el barrido de "piso, nunca techo" pasa a
leer `FILE_TYPES` directo.

**Paso 6 — la config por control, declarada en el registry.**
`CONTROL_REGISTRY[id].config = { key, stateKey, default, editor, mappingKey, openByDefault }`. Los 7
puntos del wizard pasan a un loop sobre lo declarado. Las constantes de IDs (`BRUTOS_IDS`,
`GS_PERS_IDS`, `NR_IDS`, `ACREDITACIONES_IDS`, `ACUMULADORES_IDS`, `FINADIET_ASIENTO_IDS`) derivan
de `group.id` del registry donde coincidan; `REND_GROUPING_IDS` **no** es un grupo (son dos
controles distintos) y se declara como flag propio.
· Test nuevo: `tests/controlConfigRegistry.test.js` — todo control con editor declara su `config`;
toda clave de `controlConfigs` que el wizard carga está declarada por algún control; ninguna
declara una `key` de otro.
· Ojo con las **compartidas**: `brutos_tab_config` la comparten Brutos/GS Pers/NR y
`rendvstabu_concept_grouping` la comparten `rend_vs_tabu`/`rend_x_ee`/`rend_vs_asiento`. La
declaración tiene que poder expresar "esta config es de varios controles" sin que se cargue ni se
guarde dos veces.

**Paso 7 — cerrar el ciclo: skill + documentación.**
`.claude/skills/nuevo-control/SKILL.md`: los "**cinco** lugares de `fileUpload.js`" pasan a "una
entrada en `FILE_TYPES`", y los 6 puntos de integración se recuentan de verdad (no se declara una
reducción que no ocurrió). `DECISIONS.md` gana la entrada de esta fase. `ARCHITECTURE.md` y
`specs/plan-escalabilidad-fases.md` (Fase 4 → cerrada) se actualizan. `CHANGELOG.md`.

### Explícitamente afuera

- **Migrar los writers del Paso 6 del contrato de export.** Es el otro ítem abierto de
  `specs/contrato-export.md` y necesita cosas que el writer no tiene (fila de TOTAL, filas
  atenuadas). Migrarlo acá sería una regresión visible en el entregable.
- **Subir `apellidoNombreColumn` o `puestoColumn` de OPCIONAL a OBLIGATORIA.** Willy pidió el
  2026-08-12 dejarlas como están. Que el mapa quede scopeado *permite* declararlas distinto; no es
  permiso para hacerlo.
- **Activar el bloqueo de `OBLIGATORIA` en el formulario de carga de archivo.** Es el Paso 2
  pendiente del contrato de export y necesita la vía de escape (`OMITIDO`) en esa superficie. Sin
  eso, ningún archivo de NR se podría subir.
- **El override de clave de legajo por corrida** (D-038 punto 2, lo único que quedó de la Fase 1).
- **v2.6/2.7: el seam de adaptadores y el piloto de Axton con Merz.** Van después de esta fase, por
  decisión del plan.
- **Unificar los `norm()` de limpieza de texto**, los 6 `createResultsToolbar()` que la Fase 2 dejó
  afuera a propósito, y cualquier otro hotspot de duplicación que aparezca leyendo estos archivos.
- **Arreglar cualquier bug de comportamiento que aparezca en el camino.** Se reporta y se anota; no
  se arregla de paso (ver §5).

---

## 4. Evals — cómo se comprueba

**Método:** tests automatizados en Node + Chromium real + verificación manual en el navegador de lo
que ningún test cubre.

**Criterio de éxito, por PR** (los cuatro, sin excepción):

1. `npm run test:unit` en verde — la cadena completa, incluyendo los tests nuevos, que **entran a
   `package.json` en el mismo PR** (regla del repo: un test fuera de la cadena no lo corre nadie).
2. `npx playwright test` **completo** — no un subconjunto. Resultado igual o mejor que la baseline
   del sandbox: **9 passed / 12 failed**, con los 12 fallando por falta de red al CDN. Si aparece un
   fallo nuevo, es regresión hasta que se demuestre lo contrario (D-045: los ciclos de módulos
   rompen sólo acá).
3. `tests/exportContracts.test.js` en verde sin debilitar ningún assert. Debilitar un assert de este
   archivo para que pase el refactor es exactamente lo que la fase no puede hacer.
4. Verificación en Chromium real de la superficie que ese PR toca, con captura: el archivo sube,
   muestra su línea de metadata, auto-detecta sus columnas y el gate bloquea lo que bloqueaba.

**Criterio de éxito de la fase completa:**

- El assert de divergencias de `tests/exportContracts.test.js` afirma **0**, no 2.
- Agregar un tipo de archivo nuevo toca **`fileTypes.js` y nada más** — se demuestra escribiendo la
  ficha de un tipo ficticio en un test y verificando que el guard lo acepta sin tocar ningún otro
  archivo.
- El skill `nuevo-control` dice un número de puntos de integración que es cierto.

**Quién revisa antes de dar por cerrado:** los tests automáticos por PR; **Willy** el resultado
visual y el comportamiento del wizard con un archivo real. Un PR cuyo cambio sólo se puede verificar
en el navegador y no se pudo abrir queda **abierto**, no se mergea a ciegas (CLAUDE.md).

---

## 5. Autonomía — qué se decide solo y qué se consulta

**Se decide solo:**

- Nombres de las propiedades de la ficha, del archivo y de las funciones internas; cómo se ordena
  `fileTypes.js`; qué se extrae a un helper.
- Cómo se declara el `fileType` de cada `from` en `contracts.js` (`fromFile` a nivel columna vs.
  `from: [{ file, key }]`) — es representación interna, la elige quien lo escriba por el diff más
  chico y más legible.
- Qué pertenece a la ficha del tipo de archivo y qué al `fileSpec` del control que lo pide (el slot
  de Variaciones, los re-render al cargar).
- Cortar un paso en dos PRs si el diff se vuelve difícil de revisar. Nunca al revés: dos pasos no se
  juntan en un PR.
- El texto de los comentarios y de los mensajes de error nuevos (español argentino, y un error que
  sólo termina en `console.error` no está manejado).

**Se consulta con Willy antes de avanzar:**

- **Cualquier cambio de comportamiento visible**, por chico que parezca y aunque el comportamiento
  actual parezca un bug. Se reporta, se anota, y el paso sigue sin arreglarlo.
- **Debilitar, borrar o relajar cualquier assert existente** de `tests/exportContracts.test.js`,
  `tests/tabExtraOmission.test.js` o los tests de control. Cambiar el assert de "son 2" a "son 0"
  está autorizado por esta spec; nada más lo está.
- **Que una necesidad de columna cambie de nivel** al scopear el mapa. Scopear puede destapar que
  una clave estaba heredando una necesidad de otro archivo. Eso es un hallazgo para mostrar, no una
  corrección para aplicar.
- **Que un paso resulte no ser mergeable solo** — si el Paso N no se puede cerrar sin el N+1, el
  corte estaba mal y hay que rehacerlo antes de seguir.
- **Sumar cualquier dependencia, build step o archivo de configuración nuevo.** La respuesta por
  default es no; si parece necesario, es señal de que el diseño se torció.
- **Un cliente real, un código de concepto o un encabezado de archivo que haya que inventar.** No se
  inventan (D-039): se piden.

---

## 6. Condición de salida

**Se para cuando** los 7 pasos están mergeados, cada uno con `npm run test:unit` en verde,
`npx playwright test` en la baseline o mejor, el assert de divergencias en **0**, y el skill
`nuevo-control` actualizado con el conteo real.

**Un paso individual termina** cuando su PR está mergeado con CI en verde. Si CI está en rojo, o si
el cambio sólo se podía verificar en el navegador y no se pudo abrir: el PR queda **abierto** y se
avisa. No se mergea a ciegas.

**Explícitamente, no se hace:**

- Seguir refactorizando `fileUpload.js` o `controlsWizard.js` más allá de los 19 + 7 puntos
  enumerados, aunque queden cosas feas a la vista.
- Absorber a `FILE_TYPES` conocimiento que no es del tipo de archivo (reglas de negocio de un
  control, layout de un export, formato de un resultado).
- Tocar los módulos de control, los parsers o los writers.
- Optimizar performance, agregar tipos de archivo nuevos, o "aprovechar" para cerrar otro ítem del
  plan de escalabilidad.
- Arreglar un bug encontrado en el camino. Se anota en el PR y en `specs/auditoria-escalabilidad-2026-08.md`
  si corresponde, y se le muestra a Willy.

Si la condición de salida se cumple pero quedaron cabos sueltos fuera de scope, se **reportan** —
no se resuelven.

---

**Confirmada por Willy:** pendiente.
