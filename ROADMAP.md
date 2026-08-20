# ROADMAP — Controles Nómina

> **Última actualización:** 17 de agosto de 2026 (la familia contable se posterga —D-062— y Epiroc
> reemplaza a POP como cliente de prueba de Acumuladores Ganancias —D-063—; el resto del estado sigue
> siendo el del PR #130, ver "Estado al 2026-08-13")
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
| 2.6 | Seam de adaptadores: `js/adapters/meta4/` (extraer de parsers actuales) | 3 | M | planeado — **destrabado** por la Fase 4 (un sistema de origen nuevo declara sus tipos en `js/ui/fileTypes.js` en vez de copiar los del anterior). Willy, 2026-08-13: **es a futuro, no afecta lo actual** — no arrancar sin pedido explícito |
| 2.7 | Adaptador Axton — piloto con Merz | 4 | M | planeado — mismo criterio que 2.6 (a futuro) |
| 2.8 | Retirar ruta de agrupadores; reimplementar como control `scope: general` | 5 | S | hecho ✅ (2026-07-31 — D-008/D-014) |
| 2.9 | Relevar `controlConfigs` real de los 21 clientes fuera de Marval (validar `appliesWhen` con consultores) | 5 | L | planeado |

**Definition of Done de v2:**
- [x] Un analista puede seleccionar cualquiera de los 22 clientes y ver solo sus controles aplicables (2026-07-31 — hoy sólo Marval tiene los 10 controles de M4; el resto ve "Cruce por Agrupadores").
- [x] El seed se puede exportar desde modo admin e importar en otro navegador sin perder historial local (2026-07-31 — `tests/e2e/adminExport.spec.js`).
- [ ] Merz corre con adaptador Axton y da el mismo resultado que el parser Meta4 daría con datos equivalentes.
- [x] No quedan dos rutas de validación paralelas (2026-07-31 — D-014).

---

## v2.1 — Escalabilidad interna (las 5 fases cerradas)

Sale de la auditoría del 2026-08-11 (inventario de bugs y hotspots en
`specs/auditoria-escalabilidad-2026-08.md`; estado detallado fase por fase, con qué está bloqueado
por qué decisión, en `specs/plan-escalabilidad-fases.md`).
El orden importaba: F1 destrabó a las demás, y F5 es lo que evita que todo esto vuelva a pasar.

**Cerradas las cinco** entre el 2026-08-12 y el 2026-08-13, más los 8 pasos del contrato de export
(`specs/contrato-export.md`). Los 14 bugs y los 5 hotspots del relevamiento original están todos
cerrados. Lo que quedó abierto está listado abajo, en "Estado al 2026-08-13".

| Fase | Qué | Estado |
|---|---|---|
| F0 | Bugs que dan un resultado incorrecto hoy | hecho ✅ (2026-08-12) — cerrado del todo: el fallback de NR/GS Pers se resolvió con el Tabulado real que trajo Willy (D-039), y el badge en dark mode se lo llevó F2 |
| F1 | `toNum` único + clave de legajo única (D-038) y recién ahí extraer el módulo de consolidación | hecho ✅ (2026-08-12) — `js/utils/currency.js` (`toNum`), `js/utils/legajo.js`, `js/controls/consolidate.js`, `js/controls/tabCodes.js`; las 7 copias de `toNum`, los 3 criterios de legajo y las 4 de consolidación borradas. Verificado contra archivos reales de Marval (D-042). Pendiente: override de clave por corrida (D-038 punto 2) |
| F2 | Capa visual: sin hex fuera de `tokens.css`, `createResultsToolbar()`, CSS de PDF compartido | hecho ✅ (2026-08-13) — `createResultsToolbar()` en 9/15 sitios (el resto queda afuera a propósito, ver detalle de fase); `css/components.css` cerrado con Chromium real: 6 tokens sin default en `:root` (bug real, no cosmético — `tests/e2e/tokenDefaults.spec.js`) + hex de hover/`#fff` relocalizados a `tokens.css` sin cambio visual |
| F3 | `wireTableTools()`; migrar `catXEmpleados` y `rendVsAsiento` a `renderExportMenu`/`resultBlocks`; preferencia de vista por control | hecho ✅ (2026-08-12) — `wireTableTools()` en `js/ui/tableTools.js` reemplaza los 13 sitios repetidos de paginación+buscador+sticky en 9 controles; `catXEmpleados`/`rendVsAsiento` ya tienen CSV y "copiar tabla"; `js/ui/viewPreference.js` recuerda la solapa Resumen/Detalle por control (localStorage, `tests/viewPreference.test.js`) |
| F4 | `fileTypes.js` con un mapa único, config declarada en el registry, matar el `Promise.all` posicional | hecho ✅ (2026-08-13) — los tres ítems cerrados, en 7 PRs (#119-#125) con cero cambio de comportamiento visible; detalle en `specs/fase-4-registro-declarativo.md` y D-048. **`js/ui/fileTypes.js` es la ficha única de cada tipo de archivo**: la lista vieja que vivía en la pantalla de carga (`FIELD_DEFS`) ya no existe, y un assert de `tests/fileTypes.test.js` falla si alguien la reescribe o si `fileUpload.js` vuelve a nombrar un tipo de archivo por su nombre. Paso 0 (`Promise.all` por clave) hecho en el PR #102. En paralelo, el **contrato de export** cerró sus 8 pasos (`specs/contrato-export.md`) — Pasos 0-6 (2026-08-12/13) — `js/exports/contractSheet.js` (`writeContractSheet` + `writeGroupedContractSheet`), `unitsEvaluated` en Brutos/GS Pers (D-043), y los 5 contratos que faltaban + el fix de "un contrato es piso, nunca techo" (D-045). El asiento de FINADIET entró después con sus dos contratos ya escritos por `writeContractSheet` (D-046). Los writers del Paso 6 migraron el 2026-08-13 — 4 de 5, `writeContractSheet`/`writeGroupedContractSheet` ganaron fila de TOTAL y filas atenuadas; Acreditaciones se queda con su .xlsx a mano, cerrado como excepción permanente declarada y verificada contra su contrato (D-051), con lo que el Paso 6 queda cerrado. El Paso 7 (D-041 en `DECISIONS.md`, el skill y el tachado de los hotspots de la auditoría) y el Paso 8 (gate de OBLIGATORIA en la carga de archivo, con el toggle ⊘ como salida — D-052) también están cerrados |
| F5 | Skill `nuevo-control`: de "copiá X" a "importá X", una vez que exista el módulo de F1 | hecho ✅ (2026-08-12) — el módulo de F1 ya existe, así que el skill apunta a `consolidate.js` en vez de decir "extraelo vos" |

F5 no es cosmético: el skill mandaba a copiar el helper de consolidación, y por eso el mismo bug se
arregló **cuatro** veces (Brutos, NR, GS Pers modo Controlar y GS Pers modo Reporte) — la copia número N
siempre se olvida. Con `js/controls/consolidate.js` en pie, el skill ya no manda a copiar ni a extraer:
manda a importar.

**Lo que queda de la F1**, y no es bloqueante: el override de clave de legajo **por corrida** sin pisar el
default del cliente (D-038 punto 2). Entró el estándar por cliente, editable desde `#/admin` y distribuido
en el seed; el override efímero para el mes en que un archivo viene distinto necesita decidir en qué paso
del wizard va, y sin un caso real no se puede decidir bien.

---

## Estado al 2026-08-13 — qué quedó abierto después de los PR #100-#129

Revisado contra el código, no contra estos documentos (que tenían tres ítems marcados como pendientes
y ya estaban hechos: la F4, el `fileTypes.js` y las dos cosas que la Fase 4 había dejado "para
decidir"). La batería de tests: **33 archivos, 0 fallas**.

**Cerrado y confirmado con Willy el 2026-08-13:**

- **PR #95 cerrado.** Estaba abierto en borrador desde el 10-ago proponiendo `textFormatters.js` +
  `dataAggregation.js` — lo mismo que el PR #107 resolvió mejor con `currency.js`/`legajo.js`/
  `consolidate.js`. Su propia descripción documentaba que su `toNum` hacía valer **0** a una celda
  vacía (el default silencioso que prohíbe `CLAUDE.md`), así que mergearlo por inercia era un riesgo
  real, no sólo trabajo duplicado.
- **El seed con datos de los 22 clientes en el repo público (D-010).** Willy confirmó que no hay
  exposición que preocupe; el repo pasa a privado y la app se hostea en otro lado más adelante, y ahí
  el seed real se muda. Sin acción pendiente de este lado.
- **Axton / adaptadores (2.6, 2.7, 3.1): es a futuro y no afecta lo actual.** No arrancar sin pedido
  explícito, aunque la F4 ya lo haya destrabado.

**Abierto, en orden de conveniencia:**

| # | Qué | Por qué primero / qué lo traba |
|---|---|---|
| 1 | **Las tres definiciones del SAC teórico de Acumuladores Ganancias, para poder verificar con Epiroc** | Es la verificación activa contra un armado manual y hoy no cierra: `1101`, `1137` y `1103` (**D-063**). Las contestás vos; hasta entonces no se toca `calcDoceava`. La verificación va de a un caso completo, no con un conteo agregado (**D-064**) |
| 2 | **Que se vea qué columna eligió el analista, y avisar si el contenido no es del tipo esperado** (el mis-mapeo) | **Opciones 1 y 2 hechas** (2026-08-13): la muestra de valores reales debajo de cada columna elegida y el aviso de tipo, en las dos pantallas, más el aviso anotado en los resultados de la corrida. Ver `specs/muestra-y-aviso-de-columna.md` y D-053. **Queda la opción 3** — arreglar la prioridad de las palabras clave de la auto-detección (`autoDetectTabExtraConfig` recorre los encabezados por fuera y las palabras por dentro, así que gana el primer encabezado del archivo que contenga cualquiera). Va aparte a propósito: mueve mapeos que hoy salen bien por casualidad, y con la muestra ya visible el analista puede ver qué cambió |
| 3 | **Los 8 conceptos de NR sin semilla de código** | Trabajo chico, bloqueado sólo por un archivo: hace falta un Tabulado de un mes con indemnizaciones liquidadas. No se inventan por analogía (D-039). **Pendiente de prueba** (Willy, 2026-08-13). Mientras tanto se piden en el Paso 2, con el toggle ⊘ como salida — que es el comportamiento correcto |
| 4 | **Los códigos de Rend vs Tabulado, a `tabCodes.js`** | Consistencia, no corrección: los ~56 códigos de `DEFAULT_CONCEPT_CONFIG` (`js/controls/rendVsTabu.js`) **sí** son semilla y **sí** se pueden editar por cliente desde el Paso 2 (`js/ui/rendVsTabuConceptEditor.js`, guardados en `controlConfigs`), así que una renumeración del cliente no necesita un commit. Lo único desalineado es que esa lista no vive junto a las otras semillas |
| 5 | **Lo que espera un caso real, y no por olvido** | Override de clave de legajo por corrida (F1 · D-038 punto 2); NR derivado del catálogo del cliente en vez de los 18 cableados (recién es requisito cuando un 2º cliente pida NR); las pantallas que le faltan a Variaciones (editor de conceptos y de ausencias, reuso de la corrida anterior, concepto `1000` sin validar). Los tres necesitan un archivo o un cliente concreto: decidirlos en el aire sale mal |
| 6 | **Deuda de proceso, sin urgencia** | `tests/rendVsAsientoDrill.test.js` fuera de la cadena de CI (necesita fixtures anonimizados); relevar los `controlConfigs` reales de los 21 clientes fuera de Marval (2.9); y los pendientes de v1 (insights mes a mes parcial, export Excel multi-hoja, export/import JSON de sesión) |
| 7 | **Asiento de FINADIET contra el archivo real** (3.9) | **Postergado el 2026-08-17** (D-062): la familia contable sale del foco. Sigue construido y disponible para FINADIET; lo que se posterga es verificarlo y generalizarlo |

---

## Pruebas pendientes de tu lado, por cliente (al 2026-08-17)

Repaso hecho después de cerrar el rediseño visual (PRs #139-#150). Separado por cliente porque cada
ítem se destraba con **un archivo distinto**, y ninguno se destraba programando. El rediseño visual no
dejó ninguna prueba pendiente de tu lado: las 10 pantallas se recorrieron en los tres temas en un
navegador real y lo que no se pudo correr en el sandbox (los e2e que levantan la app entera, que
necesitan los CDN) lo cubre CI, que está en verde.

| Cliente | Sistema | Qué falta probar | Con qué se destraba | Riesgo si no se hace |
|---|---|---|---|---|
| **FINADIET** | Meta4 | **Postergado (2026-08-17).** La familia contable sale del foco: es muy customizada por cliente y entrega menos valor con más esfuerzo que la familia de novedades — ver **D-062** | — | Ninguno hoy, por decisión. Al retomar, la primera pregunta es cuál es el archivo de entrada real: el de cierre que sí existe en SharePoint no tiene el layout que pide el parser (detalle en D-062) |
| **Marval** | Meta4 | Confirmar el código de 8 de los 18 conceptos de NR | Un Tabulado de un mes **con indemnizaciones liquidadas** | Bajo mientras tanto: los 8 se piden a mano en el Paso 2 y el toggle ⊘ los saltea. No se inventan por analogía (D-039) |
| **Epiroc** (era POP) | Axton | Correr Acumuladores Ganancias **end-to-end en el navegador** con el `.xlsx` real, y comparar contra la columna **AG** (`IG_CMASIS_REMU`, "SAC TEORICO") de `EPIR Control IG Nuevo MM-2026.xlsx`, tab `IMPGAN` — de a un legajo y con el caso completo, no con un conteo (**D-064**) | Los crudos `repacumuladores` de `Empresas/Epiroc/Ganancias/2026/MM` — Epiroc reemplaza a POP como cliente de prueba porque es el único Axton con serie mensual completa (04 a 07/2026); en POP sólo hay extractos de un legajo | **Medio, y hay tres definiciones ANTES de la prueba:** reconstruido el cálculo desde el crudo de 05/2026, la columna AG **no reconcilia** con `calcDoceava`. Las tres preguntas y por qué no se toca el código todavía, en **D-063** |
| **OPmobility Florida (POF)** | Meta4 | Validar el concepto `1000` (los mensuales) en Variación entre períodos | Un Tabulado que **tenga** mensuales — en los dos de muestra los 71 empleados liquidan por `899999` | Bajo. La lógica está y suma sola cuando el concepto exista, pero nunca corrió con datos |
| **OPmobility Florida (POF)** | Meta4 | Cerrar **con el cliente** qué quincena compara contra cuál | Una respuesta del cliente, no un archivo | Medio, y es lo que traba el "subir un solo archivo por mes". Hoy comparás los dos que subís y el reporte dice exactamente qué comparó — que es lo correcto mientras la regla no esté cerrada |
| **Sportline / IFSA** | Meta4 | **Desbloqueado y construido (2026-08-19).** Las dos preguntas se contestaron solas con los archivos: el neto objetivo sale de la planilla de fórmula y qué no remunerativo paga obra social lo dice el código del concepto (D-067). Queda probarlo en el navegador con los archivos reales | Una pasada por el navegador (no se pudo en el entorno remoto: la red bloquea los CDN de la app) | Bajo: el cálculo está verificado contra la liquidación real de 05/2026, los 22 legajos cierran |
| **Cliente piloto de Tasa de Provisiones** | Meta4 | La eval manual: sobre el mes de referencia el control tiene que marcar **exactamente los dos legajos** del análisis previo y ninguno más | La Contabilidad Desglosada de ese mes (fuera del repo) | El control **todavía no está implementado** — la prueba es parte de su condición de salida |
| **Merz** | Axton | El piloto del adaptador Axton | **Desbloqueado (2026-08-20):** novedades y Tabulado de 07/2026 relevados (D-070). Merz queda como piloto de la familia de Novedades junto con SIASA — cliente chico (43 legajos) que guarda ORIGINAL/MODIFICADO de sus planillas | Bajo: el trabajo ahora es construir N0a-N2 (`docs/prompts-familia-novedades.md`), no conseguir archivos |
| **SIASA** | Axton | Verificar N1 y N2 punta a punta contra 07/2026 (guarda las 3 capas: recibida / modificada / importador, por 4 UOs) | Preguntar a la analista por el empleado que está en la planilla recibida de Aguas y Gaseosas 07/2026 y no llegó al importador — es el primer caso de verificación de N2 (D-064) | Medio: sin esa respuesta, el primer caso del cruce no se puede cerrar |

**Decisiones tuyas pendientes, que no son pruebas** (ninguna traba nada hoy):

1. **Las fechas inventadas** (`fmtDate` en `gsPers.js`, `nr.js`, `catXEmpleados.js`): qué mostrar cuando
   un número no es una fecha creíble — vacío, el número crudo, o un aviso en la fila. El rango correcto
   ya está escrito y probado en `js/ui/columnHints.js`; falta sólo tu criterio. Ver el detalle en el
   parking lot de abajo.
2. **Dónde viven los códigos de concepto por defecto de Tasa de Provisiones**: en el módulo (como hace
   hoy `rendVsAsiento.js`) o vacíos en el código y cargados por cliente vía el seed. La segunda es más
   consistente con tu instrucción de privacidad pero cambia el precedente del repo y obliga al analista
   a cargarlos la primera vez. Ver `specs/control-tasa-provisiones.md` § "Ítem abierto".
3. **Los títulos de página salen en celeste** y los screenshots 18 y 20 del rediseño los muestran en
   ink. Es igual en los tres temas, así que no es una deriva de tema; cambiarlo mueve todas las
   pantallas y por eso quedó como su propia tarea.

4. **Los tres puntos abiertos del SAC teórico de Acumuladores Ganancias**, que traban la verificación con
   Epiroc y que ninguno se resuelve programando: si `1101` entra en la doceava, si `1137` se resta, y si
   `1103` va en el juego base de acumuladores. Las tres preguntas, los números de la diferencia y el
   corolario para D-026 están en **D-063** — no se toca la fórmula antes de que las contestes.

---

## v3 — Escalar adaptador Axton + consolidación de equipo

| # | Feature | Prio | Esfuerzo | Notas |
|---|---|---|---|---|
| 3.12 | **Familia de Novedades (Axton) — N0a: lector ExpNov** | **1** | M | Cimiento: parser de la familia de archivos de novedades/importador (`d  axFiles ...ExpNov...`), reconoce por firma y nunca por posición, separa `cantidad$importe`, lista aparte las columnas sin código. Formato relevado en los 7 clientes Axton el 2026-08-20 (D-070, `specs/familia-novedades-axton.md`). Prompt de arranque en `docs/prompts-familia-novedades.md` |
| 3.13 | **Familia de Novedades — N0b: parser Axton del Tabulado + Totales de Concepto** | **1** | M | Extiende la pieza T (detector ya hecho, D-065): preámbulo 0/1/2 filas, Cant/Imp vs sólo-Imp, `TOTAL GENERAL` simple o duplicado, fila por liquidación (consolidar), filas manuales post-total, U+00A0. Incluye el lector del totalizador `totalesconcepto`, porque el Tabulado no trae todos los conceptos liquidados |
| 3.14 | **Familia de Novedades — N1: generador de importador** | **1** | L | La app arma el `F2_Consolidada` por UO desde la planilla del cliente; el analista valida en pantalla y descarga. Disuelve B2a por diseño (D-070). Piloto: SIASA (guarda las 3 capas del circuito) y Merz. Depende de N0a |
| 3.15 | **Familia de Novedades — N2: novedades vs liquidación (B2b)** | **1** | L | Importador validado vs Tabulado + Totales de Concepto, por legajo+código, consolidando los dos lados. Cantidad e importe cuando ambos existen; lo no comparable informa, no bloquea (D-070). Piloto: SIASA y Merz; volumen: POP. Depende de N0a+N0b+N1. Primer caso de verificación: el empleado que en SIASA Aguas y Gaseosas 07/2026 está en la planilla del cliente y no llegó al importador |
| 3.1 | Adaptador Axton para los 7 clientes restantes (Siasa, COELSA, Red Bull, Plastic Omnium Pilar, Epiroc, Geopagos, Poincenot, Coty) | 2 | L | Post-piloto Merz. **Desbloqueado en datos (2026-08-20):** las firmas de Tabulado de los 7 están relevadas en `specs/familia-novedades-axton.md` § "El lado liquidación" |
| 3.2 | Registro de cobertura mensual vía monday.com (item por corrida: cliente, período, control, estado, cantidad de diferencias — sin datos de empleados) | 2 | M | Resuelve visibilidad de equipo sin backend propio |
| 3.3 | Jerarquía cliente → entidad operable (Sportline, Carrier, Lowsedo, Poincenot) | 4 | L | Solo si un caso real lo exige |
| 3.4 | ~~Control de Netos (Sportline) — implementación~~ **hecho (2026-08-19)** | — | — | Ver D-067. Queda aparte el **calculador de AFA**: comparte la fórmula pero corre antes de liquidar |
| 3.5 | Gross-up calculator (AFA, concepto 1017) reemplazando goal-seek de Excel | 3 | M | Segundo control nuevo priorizado, ver `specs/spec-gross-up.md` |
| 3.9 | Asiento de Remuneraciones (FINADIET) | 5 | M | hecho ✅ (2026-08-12) — control `finadiet_asiento`, ver `specs/finadiet-asiento-remuneraciones.md` y D-046. **Pendiente de prueba** (confirmado con Willy el 2026-08-13): correrlo contra el archivo real del cliente y confirmar con Gaby que da lo mismo que el armado a mano de un mes ya cerrado. **Postergado el 2026-08-17** (decisión de Willy, ver D-062): la familia contable sale del foco por relación esfuerzo/valor. Prioridad baja de 2 a 5 |
| 3.6 | Export a Excel multi-hoja | 3 | M | Pendiente de v1 |
| 3.7 | Export/import JSON de sesión | 4 | M | Pendiente de v1 |
| 3.8 | Control de escala salarial por convenio (Comercio: COELSA, Red Bull, TIM, Sportline, Carrier) | 5 | M | Primer control real de `scope: convenio` |
| 3.10 | **Control de Tasa de Provisiones** (desvíos de tasa por legajo, un solo archivo) | 2 | M | Diseño **cerrado y confirmado** por Guillermo el 2026-08-05, spec completa con evals declaradas: `specs/control-tasa-provisiones.md`. Estaba escrito y sin entrar acá — de ahí que no apareciera en ninguna lista de "qué viene". Ve un defecto que **ningún cruce puede ver** (el error está en los dos lados y la diferencia da cero). Falta: decidir dónde viven los códigos por defecto (§ "Ítem abierto") y la eval manual contra el mes de referencia |
| 3.11 | Acreditaciones — **modo "Controlar"** (cruzar las acreditaciones contra el Tabulado) | 5 | M | Declarado como "pendiente, sin definir todavía" en `specs/control-acreditaciones-axton.md` § Modos desde el 2026-08-05. El modo "Generar Reporte" está hecho y verificado. Falta el diseño: qué se compara contra qué y con qué unidad |

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
- **Las fechas: `fmtDate` convierte cualquier número en una fecha creíble.** Willy pidió el 2026-08-13
  dejarlo anotado como trabajo a futuro, y es importante. Las tres copias
  (`js/controls/gsPers.js`, `js/controls/nr.js`, `js/controls/catXEmpleados.js`) tratan **todo** número
  entre 1 y 100.000 como fecha de Excel: un importe que quedó mapeado en una columna de fecha sale como
  una fecha plausible en el `.xlsx` que recibe el cliente, y nadie lo detecta. Es el amplificador del
  mis-mapeo, no el mis-mapeo en sí: el aviso de columna (D-053) avisa **antes**, en pantalla, pero si el
  analista lo pasa por alto el archivo igual sale con una fecha inventada.
  **Por qué no entró con D-053:** cambiar ese rango cambia lo que sale en el entregable de tres controles
  (una celda que hoy dice "15/03/2026" podría pasar a decir "1234"), así que necesita su propia decisión
  de Willy sobre qué mostrar cuando el número no es una fecha creíble — vacío, el número crudo, o un
  aviso en la fila. Lo que sí quedó hecho: el rango angosto y correcto (1970-2100) ya está escrito y
  probado en `js/ui/columnHints.js`, así que cuando se decida, el criterio no hay que volver a pensarlo.
- **Que la corrida guarde con qué columnas del Tabulado corrió.** Salió al implementar D-053: el aviso de
  columna se recalcula de lo que la corrida guarda (`controlRunFiles`: filas + mapeo por archivo), y ahí
  está el mapeo del **archivo** pero no las columnas que se eligen en el **Paso 2** (`tabExtraConfig`:
  los 18 conceptos NR del lado Tabulado, SUELDO / A_CTA_FUT_AUMEN / GTOS_PERSONALES / DTO_COCHERA y las
  3 de fecha) — viajan al control pero no al registro del archivo.
  **Parcialmente resuelto por D-058:** el run guarda ahora sus **avisos** (`warnings`, texto ya redactado),
  armados al ejecutar, así que el aviso de esas columnas sí se ve después — en "Detalles del run" y en el
  export. Lo que sigue pendiente es lo otro que este punto pedía: guardar el **mapeo** del Tabulado ya
  mergeado, para que la corrida sea auto-descriptiva (con qué columna corrió cada concepto, no sólo qué
  avisos hubo). Sigue siendo una decisión sobre qué se persiste.
- **Los 8 conceptos NR sin semilla de código** — verificado en el código el 2026-08-13: siguen siendo
  exactamente estos 8, y los otros 10 los resuelve sola la app. `INDEM_ANT_FALLE`, `INDM_MATERNIDAD`,
  `GRAT_VAC`, `GRA_VACNOG_SAC`, `INDEM_FUER_MAY`, `INDEM_EMBARAZO`, `ASIG_PAS` e `INCREMENTO_ST` no
  aparecen en el Tabulado de Marval 04-2026, así que su código no se pudo confirmar y se siguen pidiendo
  a mano en el Paso 2 (D-039), ahora con el toggle ⊘ como salida para que no traben la carga (D-052).
  Para cerrarlo hace falta un Tabulado de un mes con indemnizaciones liquidadas — no se inventan por
  analogía. **Pendiente de prueba** (Willy, 2026-08-13).
- **NR derivado del catálogo de conceptos del cliente, en vez de los 18 cableados.** Dirección definida por
  Willy el 2026-08-13, al confirmar el gate de OBLIGATORIA en la carga de archivo
  (`specs/obligatoria-gate-carga-archivo.md`): el Tabulado es el archivo madre —trae los conceptos que
  **realmente se liquidaron** ese período— y el entregable es un **template fijo** que pide un conjunto
  declarado de conceptos. Hoy ese conjunto son los 18 de `NR_CONCEPTS` (`js/controls/nr.js`), escritos a
  mano y compartidos por todos los clientes. Lo que corresponde es que cada cliente cargue su **catálogo de
  conceptos**, marque ahí cuáles son no remunerativos, y que el control derive su lista de eso: matchear
  solo y avisar en los dos sentidos — **una columna del entregable que quedó sin match** (el concepto no se
  liquidó, o el catálogo del cliente no lo tiene) y **un concepto NR nuevo en el Tabulado que el entregable
  todavía no contempla** (alta de concepto en Meta4 que hay que sumar al template).
  **Media maquinaria ya está:** `js/parsers/conceptCatalog.js` parsea el `.xlsx` por cliente y ya valida
  `CLASIFICACION` con el valor `no_remu`; `clientCatalogs` está en la DB desde v3; y la auto-detección de
  columnas de NR ya lee del catálogo activo (`buildParserMapping` en `js/parsers/conceptMatcher.js`, con
  `CATALOGO_SEED` como fallback). Lo que falta es que la **lista de conceptos del control y del contrato de
  export** salga del catálogo en vez de la constante.
  **Lo que hay que resolver antes de codearlo, y es la parte difícil:** `EXPORT_CONTRACTS` es hoy estático y
  `contracts.js` deriva las 18 columnas de `NR_CONCEPTS` (con asserts que las cuentan en
  `tests/exportContracts.test.js`); derivarlo del catálogo lo vuelve **por cliente**, que es un cambio de
  forma del contrato, no un ajuste. Y el aviso de "concepto nuevo" **no puede auto-agregar la columna**: el
  template es fijo porque del otro lado hay un destino que espera ese layout — sumarle una columna es una
  decisión coordinada con quien recibe el archivo, así que la app detecta y avisa, no decide. Tampoco
  reemplaza a la omisión declarada: "el catálogo dice que este cliente no lo tiene" y "el analista declaró
  que este archivo no lo trae" son dos afirmaciones distintas, y la segunda sigue siendo la que habilita
  subir el archivo de este mes.
  **Cuándo conviene hacerlo:** hoy el control de NR lo usa **sólo Marval**, así que los 18 cableados no
  duelen. El día que un segundo cliente pida NR con otro juego de conceptos, esto pasa de mejora a
  requisito.
- **Asiento de Remuneraciones — promoción a control de sistema.** Con el plan de cuentas, los centros de
  costo y las categorías fuera del código (viven en `controlConfigs`, editables desde el Paso 2), lo único
  específico de FINADIET que queda es la semilla de esa config. Cuando un segundo cliente pida el mismo
  asiento, evaluar pasar el scope de `cliente` a `sistema` — mismo camino que D-015 y que el de Variaciones.
- **`tests/rendVsAsientoDrill.test.js` a CI.** Hoy es un test manual: necesita los archivos reales del cliente en `archivos test/`, que son datos de nómina y no se versionan. Para que entre a `npm run test:unit` hay que rehacerlo con fixtures anonimizados, como el resto de los tests.
- **Variación entre períodos — "Dirección B" (ficha por legajo).** Al rediseñar la pantalla de resultados (D-025) se evaluaron tres direcciones: "Qué cambió y por qué" (implementada, es la pantalla actual) y "Detalle" (implementada, es la solapa de tabla) resuelven "¿por qué bajó?" y "quiero ver los 71 juntos"; queda pendiente la tercera — una ficha expandible por legajo (patrón `.emp-card`, como el modo detalle de SIRADIG) que junta premios + bruto + horas del mismo empleado en una vista vertical sin scroll horizontal, para cuando el analista ya sabe qué legajo mirar y quiere el contexto completo de ese empleado. Explorada visualmente en `https://claude.ai/code/artifact/a69789a0-65e7-4b43-84af-b06a9c448491` (Dirección B). No es urgente: la solapa «Detalle» ya permite buscar un legajo puntual.

---

## Histórico de releases

| Versión | Fecha | Cambios principales |
|---|---|---|
| v1.0 | (en curso) | MVP: agrupadores + registry de 10 controles |
| v2.0 | (planificado) | Rediseño multi-cliente: `code`, seed, `appliesWhen`, adaptadores |
