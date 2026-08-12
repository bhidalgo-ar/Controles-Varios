# Contrato de export — fuente única de la obligatoriedad de columnas

> **Estado:** **Pasos 0-3 hechos**, y ahora **4a y 5 también** (2026-08-12/13). El Paso 6 (el resto de
> los exports declara contrato) y el 4b (migrar los 3 "Controlar" a `writeContractSheet`) siguen sin
> arrancar. Ver "Ya cerrado" para el detalle de cada paso, y "Cómo retomar" al final.
>
> **Origen:** auditoría del 2026-08-12 pedida por Willy — 8 buckets cubriendo los 15 controles y los
> 10 tipos de archivo, **214 campos de mapeo relevados**, cada hallazgo verificado adversarialmente
> por un segundo agente que intentaba refutarlo leyendo el código. Los bugs de correctitud que salieron
> ya están arreglados (ver "Ya cerrado"); esto es el rediseño estructural.

---

## El pedido

> "Tenés que revisar todos los controles para que esto no se repita en otros. Todo lo que se usa para
> una exportación debería ser mandatorio, sino la exportación no va a funcionar como debe."
>
> "La prioridad es que esto quede a futuro modificable desde un solo lugar y no haya que ir a tocar
> cada reporte/control en particular."

---

## Por qué `required: true` no alcanza

La auditoría encontró **102 campos en severidad alta** — o sea, campos donde el archivo exportado sale
con un dato mal o incompleto sin que nadie se entere. Pero el número que reorienta el plan es otro:

**15 de esos 102 ya tienen `required: true` y aun así se filtran.**

El flag existe y no se hace cumplir donde importa. Hoy la obligatoriedad está declarada en **tres
lugares que no se hablan**:

| Dónde | ¿Bloquea? |
|---|---|
| `FIELD_DEFS` (`js/ui/fileUpload.js`) | **Sí**, en el submit de `renderMappingForm` (`:905-909`). Tenía una vía de escape por el panel de remapeo — ya cerrada. |
| `TAB_*_FIELDS` (`js/ui/controlsWizard.js`) | **No.** `f.required` se lee **una sola vez** en todo el archivo (`:1397`) y sólo para poner la clase CSS `form-label--required`, que es literalmente `content: ' *'`. Marcar `required: true` en un `TAB_NR_*` hoy no cambia **nada**. |
| `canGoNext` (`js/ui/controlsWizard.js:428-436`) | **Sí, pero enumerando a mano.** Una lista cableada de 4 claves (`tabSalBaseColumn`, `tabACuFutAumenColumn`, `tabGtosPersonalesColumn`, `tabDtoCocheraColumn`). Es una segunda fuente de verdad, y por eso **los 18 conceptos de NR no tienen ningún gate**: nadie escribió la tercera rama. |

Y hay dos agujeros que ninguna de las tres cubre:

- **Dos claves no declaradas en ninguna lista**: `tabIdCentroTrabColumn` y `tabIdCategoriaColumn` se
  auto-detectan (`controlsWizard.js:1323-1324`), se persisten en `controlConfigs`, y **se exportan en
  las columnas H e I del `.xlsx` de NR** (`nr.js:387-388`) — pero el panel no dibuja `<select>` para
  ellas, así que no hay forma de revisarlas ni corregirlas desde la pantalla.
- **El gate es de *truthiness*, no de existencia.** No compara el valor guardado contra los encabezados
  del Tabulado que se acaba de cargar. Un valor viejo (renumeración del cliente, otro layout) pasa el
  gate mientras el `<select>` se dibuja vacío en "— Sin asignar —", porque `opts(val)` no encuentra
  option que matchear. El único lugar del repo que resuelve esto bien es
  `variacionesConceptMap.js:94` (`if (previo && headers.includes(previo)) return previo`).

---

## La tensión con D-036, y cómo se resuelve

Hacer obligatorio todo lo que alimenta un export choca de frente con D-036: *"que un dato no exista en
un período **es** resultado válido y se informa"*. Si un cliente genuinamente no tiene `DTO_COCHERA`
en su archivo, `required: true` lo deja trabado sin salida.

**La primitiva que falta ya existe en el repo, escrita y probada:** el tercer estado `NO_LIQUIDADO` de
`js/ui/variacionesConceptMap.js`. Hoy, en todas las demás pantallas, tres cosas distintas colapsan en
el mismo `<select>` vacío:

1. **sin mapear** — el analista no lo resolvió todavía
2. **mapeado y vale cero** — se comparó y da cero, un cero verificado
3. **no corresponde** — este cliente/archivo no tiene ese concepto

Por eso una celda vacía en el `.xlsx` no se puede interpretar. Con el tercer estado explícito, un campo
puede ser obligatorio **sin** trabar a nadie: o lo mapeás, o **declarás que el archivo no lo trae, con
motivo**. Queda escrito, con fecha, visible en resultados y en el propio `.xlsx`, y con el semáforo
fuera de verde.

Willy aprobó este mecanismo el 2026-08-12.

**Honestidad sobre su límite:** la omisión declarada es una **firma, no una prueba**. Un analista puede
declarar "este archivo no trae DTO_COCHERA" sobre un archivo que sí la trae. La mejora es que queda
asentado y auditable, no que sea imposible. Mitigación barata que conviene incluir en el Paso 3: si la
columna declarada como ausente **sí aparece** entre los encabezados del archivo del mes, pedir
confirmación.

---

## La fuente única: `js/exports/contracts.js`

Cada export declara sus columnas y de qué clave de mapeo sale cada una. **La obligatoriedad se deriva
de ahí**, no se escribe a mano en ningún lado.

```js
export const NECESSITY = {
  CLAVE:       'clave',        // sin esto el archivo no sirve (ID_EMPLEADO). NO admite omisión.
  OBLIGATORIA: 'obligatoria',  // el destino la espera. Admite omisión declarada y visible.
  OPCIONAL:    'opcional',     // si no está, se informa en resultados y listo (D-036).
};

export const EXPORT_CONTRACTS = {
  gs_pers_reporte: {
    sheet: 'Reporte GS Pers', audience: 'payroll', layout: 'fijo',
    columns: [
      { label: 'ID_EMPLEADO',     key: 'legajo', type: 'txt', from: ['empleadoColumn'],
        necessity: NECESSITY.CLAVE },
      { label: 'NOMBRE',          key: 'nombre', type: 'txt',
        from: ['tabNombreColumn', 'apellidoNombreColumn'],   // en orden de precedencia (D-039)
        necessity: NECESSITY.OBLIGATORIA },
      { label: 'DTO_COCHERA',     key: 'dto',    type: 'num', from: ['tabDtoCocheraColumn'],
        necessity: NECESSITY.OBLIGATORIA,
        help: 'Si este cliente no tiene cocheras, declarala como ausente con el motivo.' },
      // …
    ],
  },
};
```

`from` es una **lista** en orden de precedencia porque así se expresa D-039 sin cablear nada, y porque
el export de "Controlar" tiene dos fuentes por columna (el reporte y el Tabulado).

`audience: 'finanzas'` activa un assert de D-020: el `.xlsx` de Acreditaciones lo recibe Finanzas del
cliente y **no puede llevar información de HR**.

### Cómo se hace cumplir — tres capas

1. **Estructural: no se puede escribir un export a mano.** `writeContractSheet(wb, contract, rows,
   resolution)` arma encabezado y filas iterando `contract.columns`. Nadie más hace `addRow`, así que
   no hay forma de emitir una columna que el contrato no declara ni de omitir una que sí. Y como el
   mismo `columns` alimenta la tabla de pantalla y el CSV, desaparecen los `colDefs` duplicados que
   hoy cada control tiene **dos veces** (`renderGsPersReporteResults` vs `exportGsPersReporteToXlsx`,
   ya divergidos: el `width` existe sólo en el segundo).
2. **Runtime: el gate deriva, no enumera.** `canGoNext` pasa de dos `if (hasBrutos)/(hasGsPers)`
   cableados a una línea: `if (pendingRequirements(...).length > 0) return false`. Un control nuevo
   queda gateado **el día que se agrega**, sin tocar `canGoNext`. El mismo cálculo alimenta el panel
   del Paso 2, el hint de "Siguiente" (que ahora **nombra la columna** en vez de decir "Completá los
   archivos y columnas requeridas"), el aviso de resultados y el badge.
3. **Test en la cadena `test:unit`.** Mismo patrón que el assert de `group.primary` que ya funcionó:
   itera el registry y falla si algo nuevo no declaró lo suyo. Incluye el assert que atrapa un **typo
   de clave de mapeo** — hoy eso produce `row[undefined]` → `null` → semáforo verde sin que nada chille.

### El matiz fino: al subir vs. en el Paso 2

`FIELD_DEFS` es por **tipo de archivo**, no por control — y `FIELD_DEFS.tab_prev_file =
FIELD_DEFS.tab_control` (`fileUpload.js:127`). Un `required` ahí aplica a los **5 controles** que
consumen el Tabulado y también al Tabulado del período anterior de Variaciones. Entonces:

- **al subir el archivo se exige sólo `clave`** (lo que el parser necesita para leer);
- **lo `obligatoria` se exige en el gate del Paso 2, ya scoped a los controles seleccionados.**

Así `puestoColumn` obligatoria para el Reporte de Brutos no traba a un cliente que sólo corre
EE x CATEG.

---

## Plan por pasos

Cada paso es mergeable por separado y deja el repo funcionando.

| # | Qué | Estado |
|---|---|---|
| **0** | `js/exports/contracts.js` con 6 contratos de Brutos/GS Pers/NR + `tests/exportContracts.test.js`. Sin cambio de comportamiento. | ✅ hecho (PR #104) |
| **1** | El contrato manda en la UI de carga. `fileUpload.js` deriva de `blocksProgress()`. Sin cambio de comportamiento a propósito (sólo `CLAVE` bloquea; `OBLIGATORIA` espera al Paso 2). | ✅ hecho (PR #104) |
| **3** | `isStaleTabValue()` — un valor obsoleto deja de pasar el gate con el badge en verde. | ✅ hecho (PR #105) |
| **2** | **El paso que cierra el hallazgo grande.** `pendingTabRequirements()` reemplaza la lista cableada de `canGoNext`, derivando de `necessityOfKey()`. Los 18 campos de NR tienen gate por primera vez. `OMITIDO` (toggle "⊘", sin motivo de texto libre) es la vía de escape — sin ella este paso rompería NR en producción. | ✅ hecho (PR de esta rama) |
| **4a** | `writeContractSheet` + migrar los 2 exports "Generar Reporte" con `cols.has*` (Brutos, GS Pers — NR ya emite las 18 columnas siempre, no necesita este fix) a `layout: 'fijo'` ("que salga vacía", respuesta de Willy). | ✅ hecho — `js/exports/contractSheet.js`, `tests/contractSheet.test.js` |
| **4b** | Migrar los 3 exports "Controlar" (encabezado de dos niveles con merges y bandas de color) al mismo `writeContractSheet`. Van aparte porque hoy **ya son** `layout:'fijo'` por construcción — es sólo des-duplicación, no un fix de comportamiento. | Desbloqueado, no arrancado |
| **5** | **Resultados dejan de mentir.** `summarize()` cuenta `unitsEvaluated` aparte de `unitsTotal`; se distingue "no evaluado" de "sin diferencia" en tiles y export. Cierra `salBaseColumn`/`aCuFutAumenColumn`/`gtosPersonalesColumn`/`dtoCocheraColumn` del lado archivo (ver nota de alcance del Paso 2 arriba). | ✅ hecho — `js/controls/brutos.js`/`gsPers.js`, `tests/brutosControl.test.js`, `tests/gsPersControl.test.js`, `tests/e2e/brutosGsPersEvaluados.spec.js` |
| **6** | El resto de los exports (`rendVsTabu`, `rendVsAsiento`, `rendXEe`, `catXEmpleados`, `variaciones`, `acumuladores`, `acreditaciones`) declaran su contrato. | No arrancado |
| **7** | D-041 en `DECISIONS.md`, actualizar el skill `nuevo-control`, tachar los hotspots de la auditoría. | Parcial — este documento; falta D-041 y el skill |

**Si sólo se podía hacer una cosa, era el Paso 2 + el Paso 5** — los dos ya están hechos. Los pasos
0-4a fueron el andamio necesario para que el Paso 5 tuviera un lugar honesto donde declarar el hueco
("legajos con dato de un solo lado, sin comparar") en vez de mentirlo en el tile de "sin diferencia".

---

## Decisiones (Willy, 2026-08-12)

**1. Cuando una columna no está: sale vacía, nunca desaparece.** Respuesta: **"que salga vacía"**.
`layout: 'fijo'` es la política para **todos** los contratos, sin excepción — el encabezado sale
siempre y la celda va en blanco. Desbloquea el Paso 4a/4b.

**2. `apellidoNombreColumn` / `puestoColumn` — "no lo sé, dejalo como está".** No se sube su
necessity por encima de lo que ya tienen hoy (`OPCIONAL`, `required: false` en
`FIELD_DEFS.tab_control`). El Paso 2 **no** las gatea, en ningún contrato: donde el `from` de una
columna de export incluya alguna de estas dos claves, la columna queda `NECESSITY.OPCIONAL` aunque
el resto del análisis sugiera `OBLIGATORIA`. Si en el futuro se confirma que ningún cliente corre sin
ellas, se sube la necessity ahí — no antes.

**3. `cat_empleados.idCenColumn` está en `CAT_REQUIRED_KEYS` y `required: true` pero ningún control lo
lee.** Sigue sin confirmar. No se toca en esta ronda — sacarlo cambia cuándo la auto-detección
devuelve `null`, y eso hay que decidirlo con Willy mirando el efecto concreto, no de paso.

---

## Lo que este diseño NO resuelve

Está acá para que no se lea como una bala de plata.

- **El mis-mapeo, que es el caso peor y el más silencioso.** Un contrato no puede saber que
  `tabFecPagoColumn` apunta a una columna de importes. **Mapeada + obligatoria = satisfecha, aunque
  esté mal — y la mandatoriedad lo *empeora*,** porque un `required` queda satisfecho por el valor
  equivocado. El mecanismo de riesgo está verificado: `autoDetectTabExtraConfig`
  (`controlsWizard.js:1307`) itera encabezados por fuera y palabras clave por dentro, así que **la
  prioridad de la lista de keywords no se respeta**: gana el primer encabezado del archivo que contenga
  cualquiera de ellas. Y `fmtDate` convierte cualquier número entre 1 y 100000 en una fecha plausible.
  Declarar `type: 'date'` no es validarlo — validar que la columna elegida parsee como fecha o número
  es trabajo aparte, y hay que hacerlo igual.
- **D-038 (clave de legajo) y `toNum()`.** Un contrato sobre la **salida** no arregla el **join** de la
  entrada: si `'007'` y `'7'` no matchean, la fila sale con la mitad del control en blanco y el
  contrato la considera perfectamente resuelta. Sigue siendo Fase 1, y sigue bloqueada por las dos
  decisiones pendientes de Willy.
- **No baja los 6 puntos de integración a menos.** Un control nuevo sigue tocando parser + fileUpload +
  wizard + módulo + registry + test. Lo que elimina es una **clase** de olvido (la obligatoriedad y la
  forma del export) y fusiona 2 de los 3 lugares de declaración. El tercero —la config por control
  dentro de cada módulo: `DEFAULT_CONCEPT_CONFIG`, `DEFAULT_RVA_CONFIG`, la config de acumuladores— **no
  lo cubre, y no debería**: eso no son columnas de un export, son parámetros de agrupación y umbrales.
- **No se puede verificar un `.xlsx` desde CI.** Los tests validan la forma del contrato, no los bytes
  del archivo. Cada paso de migración se abre en Excel real antes de mergear, o el PR queda abierto.

### Riesgo de proceso: fatiga de omisiones

Si el primer mes el analista se encuentra con 12 columnas pendientes, va a escribir "no viene" doce
veces sin leer, y quedamos con un default silencioso **firmado**. Mitigación: **sembrar las omisiones de
los clientes que ya corren hoy en el mismo PR** (se deducen de sus `controlConfigs` actuales, donde la
clave está vacía), y ordenar el panel por peso. Aun así, el primer mes hay fricción real.

---

## Ya cerrado

### Bugs de correctitud de la auditoría (previos al rediseño)

| Qué | Dónde |
|---|---|
| **GS Pers modo Reporte no consolidaba por legajo** — 4ª aparición del bug más caro del repo. El `.xlsx` entregable sacaba dos filas por cada legajo con doble paga, con los importes partidos. Los dos helpers ya estaban en el mismo archivo. | `gsPers.js` · `tests/gsPersControl.test.js` |
| **Dos conceptos mapeados a la misma columna** — `INDEM_INTEG` se comparaba contra la columna de `SAC_INDEM_INTEG`. Es la peor forma del problema: **da un número mal, no un vacío**, así que ningún aviso de "columna sin asignar" lo agarra. | `conceptMatcher.js` · `tests/conceptMatcher.test.js` |
| **El panel de remapeo avisaba pero no validaba** — 6 campos `required: true` vaciables en silencio, y quedaba persistido en el perfil del cliente. | `fileUpload.js` |
| **El badge "⚠ sin asignar" no salía en el panel de remapeo** — una columna opcional vacía se veía igual que una mapeada. | `fileUpload.js` |

### Pasos 0-3 del rediseño (2026-08-12)

| Paso | Qué | Dónde |
|---|---|---|
| **0** | `EXPORT_CONTRACTS` — 6 contratos (Brutos/GS Pers/NR × 2 modos). El de NR se **deriva** de `NR_CONCEPTS` (ahora exportado desde `nr.js`), no lo duplica. `necessityOfKey()` calcula la necesidad de una clave recorriendo los contratos. | `js/exports/contracts.js` · `tests/exportContracts.test.js` |
| — | **Riesgo encontrado comparando dos diseños en paralelo** (no un bug, una fragilidad): el mapa de necesidad es plano por clave, no por `(fileType, clave)` — hoy no hay colisión real (verificado), pero un contrato futuro con la misma clave y otra necesidad se resolvería mal. Blindado con un assert permanente, no rediseñado — el esquema completo es más código para un riesgo que hoy es cero. | `tests/exportContracts.test.js` |
| **1** | `fileUpload.js` deriva el gate del submit de `blocksProgress()` en vez de `f.required` a mano en 2 lugares. **Sin cambio de comportamiento a propósito**: sólo bloquea fuerte en `CLAVE`. Casi bloqueaba también en `OBLIGATORIA` — eso hubiera roto la carga de cualquier NR sin los 18 conceptos completos, antes de que existiera la omisión declarada. | `fileUpload.js` |
| **3** | `isStaleTabValue()` — un valor guardado que ya no está en los encabezados del Tabulado actual (renumeración del cliente) pasaba el gate con el `<select>` vacío y el badge en verde, afirmando lo contrario de lo que se veía. Ahora se repara si la auto-detección encuentra un reemplazo, y si no, se trata como sin asignar. | `controlsWizard.js` · `tests/staleTabConfig.test.js` |
| **2** | **El paso que cierra el hallazgo grande.** `pendingTabRequirements()` reemplaza la lista de 4 claves cableada a mano en `canGoNext` — deriva de `necessityOfKey()`, así que un control nuevo con contrato queda gateado el día que se agrega. **Los 18 conceptos de NR tienen gate por primera vez.** La omisión declarada (`OMITIDO`, toggle "⊘" junto a cada columna `OBLIGATORIA` — mismo patrón que `NO_LIQUIDADO` de Variaciones, sin motivo de texto libre para no sumar fricción) es la vía de escape: sin ella, el gate nuevo bloquearía a todo cliente sin los 18 conceptos, que es ninguno. El hint de "Siguiente" nombra la columna que falta. | `controlsWizard.js` · `tests/tabExtraOmission.test.js` |

### Pasos 4a y 5 (2026-08-13)

| Paso | Qué | Dónde |
|---|---|---|
| **4a** | `writeContractSheet(wb, contract, rows)` — un solo lugar que hace `ws.addRow` para un export con contrato. `contractColDefs(contract)` da la misma lista en la forma que ya usan la tabla de pantalla y el CSV. Brutos y GS Pers modo Reporte migrados: las 11 columnas de cada uno salen SIEMPRE, en el mismo orden, para pantalla/CSV/xlsx — los `colDefs` duplicados (que ya habían divergido: el `width` sólo vivía en la copia del export) desaparecen. | `js/exports/contractSheet.js` · `tests/contractSheet.test.js` |
| **5** | `summarize()` de Brutos y GS Pers distinguen "evaluado" (los DOS lados tenían dato) de "algún valor real en cualquiera de los dos lados" (lo que ya hacía `relevantRows`, que NO alcanza). Si el archivo del reporte nunca tuvo su columna mapeada pero el Tabulado sí tiene datos reales, antes el tile "Sin diferencia" contaba esos legajos como verificados — la pantalla decía "coinciden... sin diferencias" sin haber comparado ni un legajo. Con `unitsEvaluated === 0` (nada comparable en absoluto), el `status` pasa a `'error'` — el mecanismo ya existente de "cortocircuitar en error" (CLAUDE.md), no una cuarta categoría nueva en `computeSemaforoStatus`. Con cobertura parcial (un campo mapeado y limpio, el otro no), NO se fuerza error completo: el insight del campo faltante avisa "sin datos para comparar" sin tapar el campo que sí verificó. | `js/controls/brutos.js` · `js/controls/gsPers.js` · `tests/brutosControl.test.js` · `tests/gsPersControl.test.js` · `tests/e2e/brutosGsPersEvaluados.spec.js` (falla sin el fix — confirmado quitándolo y volviendo a correr el test) |

**Por qué el semáforo (`computeSemaforoStatus`) no se tocó:** es la función compartida por las 4
pantallas (checklist, wizard, resultados, lista de clientes) y CLAUDE.md la trata como intocable a la
ligera. El único lever sancionado para forzar un color sin pasar por el % de diferencia es
`summary.status === 'error'` — ya existe, ya lo usan las 4 pantallas de la misma forma (verificado
leyendo las 4). Un control que evaluó CERO legajos de los que tenía es, por definición, un estado de
error — no una categoría nueva que hubiera que inventar en `semaforo.js`.

**Precisión sobre el alcance real del Paso 2:** el gate nuevo cubre el lado **Tabulado** (`TAB_NR_*_FIELDS`, `tabExtraConfig`), que es el que la auditoría señaló como el agujero ("los 18 conceptos de NR no tienen ningún gate"). El lado **archivo NR** (`nrKey`, `FIELD_DEFS.nr_file`, validado en `fileUpload.js`) sigue en `OBLIGATORIA`-sin-bloquear del Paso 1 — activarlo ahí necesitaría la misma omisión declarada dentro del formulario de mapeo de archivo, que todavía no existe. Mismo criterio para `salBaseColumn`/`aCuFutAumenColumn`/`gtosPersonalesColumn`/`dtoCocheraColumn` de Brutos/GS Pers: siguen sin bloquear en la carga del archivo del reporte, sólo en el lado Tabulado (que ya bloqueaba antes, sin cambios).
