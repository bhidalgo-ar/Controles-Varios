# Gate de OBLIGATORIA en la carga de archivo — toggle ⊘ en fileUpload.js

> **Estado:** **implementada el 2026-08-13** (D-052; confirmada por Willy el mismo día, antes de codear).
> Cierra el pendiente que D-041 (punto 4) dejó declarado y D-048 listó como "no se tocó":
> activar el bloqueo de `OBLIGATORIA` en el formulario de carga, llevando antes la omisión
> declarada (`OMITIDO`, toggle ⊘) a esa superficie. Es el mismo movimiento que el Paso 2 de
> `specs/contrato-export.md` hizo en el wizard, aplicado ahora al lado archivo.

---

## Contexto en una línea

`blocksProgress()` hoy deja caer `OBLIGATORIA` al flag legado **a propósito**: bloquear sin la
salida de "esto no lo trae" es peor que no bloquear (su docstring lo dice textual). La salida
existe sólo en el panel del Paso 2 (`renderTabExtraConfig`, `controlsWizard.js`); este trabajo
la lleva a las dos superficies de `fileUpload.js` y recién entonces activa el bloqueo.

**Campos que pasan a bloquear-con-salida** (OBLIGATORIA por contrato, sin `required: true` legado):
los 18 conceptos de `nr_file`, `salBaseColumn`/`aCuFutAumenColumn` de `brutos_file`,
`gtosPersonalesColumn`/`dtoCocheraColumn` de `gs_pers_file`. La lista NO se cablea: se deriva de
`necessityOfKey(fileType, key) === OBLIGATORIA && !f.required`, así un contrato futuro queda
gateado solo.

**Alcance de uso hoy, y por qué el diseño alcanza:** el control de NR lo usa **sólo Marval**. Los 18
conceptos están cableados en `NR_CONCEPTS` y son los mismos para todos, así que la omisión declarada
por archivo resuelve el caso real completo. La dirección de futuro —que la lista de conceptos NR salga
del **catálogo de conceptos de cada cliente**, y que el control avise tanto de una columna del
entregable sin match como de un concepto NR nuevo aparecido en el Tabulado— quedó definida por Willy el
2026-08-13 y anotada en `ROADMAP.md` (parking lot), con lo que falta y lo que hay que resolver antes.
No es parte de este trabajo: pasa de mejora a requisito el día que un segundo cliente pida NR.

**Verificado antes de escribir esto** (no son supuestos):
- `parseNr`/`parseBrutos`/`parseGsPers` sólo leen `mapping.legajoColumn`; el resto de las claves
  se consume como `row[mapping[key]]`, y `row['__omitido__']` cae a `null` — `OMITIDO` puede
  viajar adentro de `mapping` sin tocar ningún parser ni ningún `run()`.
- `blocksProgress` se consume en 3 call-sites de `fileUpload.js` (asterisco del form, gate del
  submit, gate del remap) y en ningún otro módulo — activar OBLIGATORIA ahí no cambia el wizard.
- `tests/exportContracts.test.js` afirma el comportamiento actual y hay que actualizarlo con el
  nuevo (ver Evals).

---

## 1. Guardrails — qué puede modificar y qué no

**Puede modificar:**
- `js/ui/fileUpload.js` — `renderMappingForm` (formulario de mapeo), `renderAlreadyLoaded`
  (panel de remapeo) y los helpers del gate; extraer un helper puro testeable está bien.
- `js/exports/contracts.js` — `blocksProgress()` y su docstring (que describe el estado
  pre-activación y queda obsoleto con este cambio). De paso, y sólo porque están en los
  docstrings de este mismo archivo: corregir las 3 referencias muertas
  (`js/exports/omissions.js` no existe — el mecanismo vive en `contracts.js`;
  `PARSER_PRECONDITIONS` y `necessityOfField()` no existen en `fileUpload.js`).
- `tests/exportContracts.test.js` — actualizar los asserts del gate al comportamiento nuevo.
- Tests nuevos: un unit para el helper del gate (sumarlo a la cadena de `package.json` —
  un test fuera de la cadena no lo corre nadie) y un e2e Playwright del toggle en la carga.
- `specs/contrato-export.md` y `DECISIONS.md` — asentar el cierre del pendiente (entrada nueva
  D-0xx, no editar las existentes).

**No puede modificar (ni "de paso"):**
- `js/ui/controlsWizard.js` — el Paso 2 ya funciona; el toggle nuevo **imita** su patrón, no lo
  refactoriza ni extrae un componente compartido. Si al implementarlo parece obvio compartir
  código con `renderTabExtraConfig`, se reporta y se decide aparte.
- Los `FIELD_DEFS` de `js/ui/fileTypes.js` — ningún `required` sube ni baja. La obligación nueva
  entra por el contrato, no por flags.
- Los parsers (`js/parsers/*`) y los `run()` de los controles — el diseño existe justamente para
  no tocarlos.
- `NO_TOCAR_TODAVIA` (`apellidoNombreColumn`, `puestoColumn`) — Willy pidió dejarlas.
- La regla "piso, nunca techo": `CLAVE` sigue sin admitir omisión, y un campo con
  `required: true` legado sigue bloqueando **duro**, sin toggle ⊘ — dárselo le sacaría una
  obligación que ya existía.
- `computeSemaforoStatus`, `unitsEvaluated` y todo lo de resultados — este cambio es de gate de
  entrada, no de semáforo.

## 2. Comportamientos a preservar

- **Un archivo de NR sin los 18 conceptos se puede seguir subiendo** — declarando ⊘ lo que
  falta. Ningún cliente tiene los 18; si el gate nuevo no tiene la salida a mano en la misma
  pantalla, este PR rompe producción (D-041 punto 4). Se verifica: e2e nuevo + assert unit.
- **Todo lo que hoy bloquea sigue bloqueando**: el barrido "piso, nunca techo" de
  `tests/exportContracts.test.js` (recorre los `required: true` de los 17 tipos) tiene que
  seguir pasando sin cambios.
- **CLAVE sigue sin vía de escape** — `legajoColumn` no se puede omitir. Assert existente.
- **El remap del panel sigue reprocesando y persistiendo** igual que hoy (mismo
  `parseFor` + `saveFileProfile`), con el gate nuevo aplicado también ahí — el panel de remapeo
  ya tuvo su propio agujero una vez (ver el comentario del gate en `renderAlreadyLoaded`).
- **El wizard no cambia**: `pendingTabRequirements` y el panel del Paso 2 quedan idénticos.
  Se verifica: `tests/tabExtraOmission.test.js` pasa sin modificarse.
- **La auto-detección nunca pisa un `OMITIDO`** (decisión del analista, mismo criterio que
  `isStaleTabValue` en el wizard).

## 3. Scope

**Entra:**
1. Toggle ⊘ en `renderMappingForm`, junto a cada campo con
   `necessityOfKey(fileType, f.key) === OBLIGATORIA && !f.required`: mismo patrón visual y de
   accesibilidad que el Paso 2 (botón `⊘` con `aria-pressed`, select deshabilitado con el badge
   "⊘ declarada ausente", hint "No se resuelve — se computa como sin dato, no como cero").
2. El mismo toggle en el panel de remapeo de `renderAlreadyLoaded`.
3. `renderMappingForm` y el remap **renderizan** el estado `OMITIDO` que venga en
   `savedMapping`/`mapping` (hoy `savedMapping?.[f.key] || ''` lo perdería en silencio al
   mostrar el select vacío).
4. Activación del gate: `blocksProgress()` pasa a devolver `true` también para `OBLIGATORIA`
   (además de `CLAVE` y del flag legado), y los 3 call-sites tratan `OMITIDO` como resuelto.
   El toast de faltantes ofrece la salida: "…o declarala ausente con ⊘" (mismo texto que el
   hint del wizard).
5. Persistencia: `OMITIDO` viaja dentro de `mapping` a `saveFileProfile` (decisión confirmada:
   la omisión es propiedad estable del cliente y se precompleta la próxima corrida).
6. Si la auto-detección encuentra columna para una clave declarada `OMITIDO`: se respeta el ⊘ y
   se muestra un hint junto al campo ("la auto-detección encontró una columna candidata") para
   que el analista lo destildee si corresponde (decisión confirmada).
7. Docstring de `blocksProgress` + las 3 referencias muertas de `contracts.js`; actualización de
   `specs/contrato-export.md` (tabla de pasos) y entrada nueva en `DECISIONS.md`.

**Explícitamente afuera (aunque parezca relacionado):**
- Migrar el writer de `acreditaciones_reporte` (D-047 lo deja a mano a propósito).
- El override de clave de legajo por corrida (D-038 punto 2).
- `tabIdCentroTrabColumn`/`tabIdCategoriaColumn` en el panel del Paso 2 (pendiente listado en
  D-048, decisión de Willy).
- Subir de necesidad `NO_TOCAR_TODAVIA` o cualquier otra clave OPCIONAL.
- Las 8 semillas de NR que faltan y la lista cableada de `rendVsTabu.js` (deuda declarada en
  CLAUDE.md).
- **Derivar los conceptos NR del catálogo del cliente** en vez de `NR_CONCEPTS`, y los dos avisos que
  eso habilita (columna del entregable sin match · concepto NR nuevo en el Tabulado). Dirección
  confirmada y anotada en `ROADMAP.md`; cambia la forma del contrato de export (pasa a ser por
  cliente), así que es un trabajo aparte y posterior a este.
- Refactor/unificación del toggle con el del wizard (ver Guardrails).
- Cualquier cambio de resultados, semáforo o exports.

## 4. Evals — cómo se comprueba que está correcto

- **Unit:** helper puro del gate de carga exportado de `fileUpload.js` y testeado (archivo nuevo
  en la cadena de `npm run test:unit`): OBLIGATORIA sin resolver bloquea; `OMITIDO` cuenta como
  resuelto; CLAVE no admite omisión; `required` legado bloquea sin toggle.
- **`tests/exportContracts.test.js` actualizado:** el assert que afirma que OBLIGATORIA no
  bloquea por sí sola se invierte; el barrido "piso, nunca techo" pasa sin cambios.
- **e2e Playwright nuevo:** subir un NR de fixture al que le falta un concepto → el submit
  bloquea nombrando la columna → se declara ⊘ → el submit pasa; reabrir el remap muestra
  "⊘ declarada ausente". Verificar en claro y oscuro (regla de CLAUDE.md para UI).
- **Criterio de éxito:** `npm run test:unit` (cadena completa) y `npx playwright test` en verde
  en CI; `tests/tabExtraOmission.test.js` sin modificar.
- **Quién revisa:** CI + Willy sobre el PR (merge propio sólo con CI verde, regla del repo; si
  algo sólo se pudo verificar a medias en navegador, el PR queda abierto y se dice).

## 5. Autonomía — qué decide el agente solo vs. qué consulta

**Decide solo:**
- Nombres de helpers, estructura interna, dónde exacto vive el estado del toggle en el form.
- Redacción de textos de UI nuevos, siempre en español argentino y consistentes con los del
  Paso 2 (reusar los existentes donde aplique).
- Detalles del fixture e2e (datos inventados, jamás un export real de cliente).

**Consulta antes de avanzar:**
- Si algún parser o flujo no relevado (p. ej. los multi-archivo, CONTA/Acumuladores) resulta
  validar los valores de `mapping` contra los encabezados y `OMITIDO` lo rompe — eso invalida
  el punto 5 del scope y hay que decidir dónde guardar la omisión.
- Si aparece un cuarto call-site de `blocksProgress` o una superficie de mapeo no contemplada
  (algo que el relevamiento no vio), antes de activarle el gate.
- Si activar el gate deja sin poder subir un tipo de archivo por una clave OBLIGATORIA que no
  está en el formulario (no tendría dónde declararse ⊘) — es el mismo agujero que D-048 reportó
  para `tabIdCentroTrab`/`tabIdCategoria` en el wizard.
- Cualquier cambio que toque los archivos listados como intocables en Guardrails.

## 6. Condición de salida

**Para de iterar cuando:**
- El toggle ⊘ está en las dos superficies de `fileUpload.js`, el gate de OBLIGATORIA activo en
  los 3 call-sites, los evals de la sección 4 en verde, docs/DECISIONS actualizados, y el PR
  contra `main` creado (mergeado sólo si CI está en verde; si no, abierto y avisado).

**Explícitamente NO debe:**
- Seguir refactorizando `fileUpload.js` o el wizard más allá del scope.
- Ampliar el alcance a los pendientes listados como "afuera", aunque el cambio parezca chico.
- Agregar validaciones "ya que estamos" a otros tipos de archivo u otras necesidades.
- Tocar comportamientos de la sección 2 aunque parezcan mejorables.

Cabos sueltos fuera de scope que aparezcan durante la implementación: se **reportan** en el PR
o en la conversación, no se resuelven.

---

**Fecha de creación:** 2026-08-13
**Confirmada por el usuario:** sí — Willy, 2026-08-13 (las 3 decisiones de las secciones 4 y 5
respondidas; el arreglo de las referencias muertas de `contracts.js` va en el mismo PR)
