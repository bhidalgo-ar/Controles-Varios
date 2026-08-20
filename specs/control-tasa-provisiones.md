# Spec — Control de Tasa de Provisiones (desvíos por legajo)

> **Nota de privacidad.** Esta spec describe el control en términos genéricos a propósito: no
> incluye legajos, importes, nombres de centro de costo, códigos de cuenta ni de concepto de ningún
> cliente. Los datos concretos del caso que originó el control viven fuera del repo. Ver `CLAUDE.md` §6.

> Pedido de Guillermo (2026-08-05), a partir de un caso real en el cliente piloto: el cruce
> Rendimiento vs Asiento dejó un residuo sin explicar en la columna de provisión de cargas sociales
> de un centro de costo. El análisis lo atribuyó a **un legajo cuya provisión de CCSS se calculó a
> aproximadamente la mitad de la tasa del resto de la nómina**. Al buscar el mismo patrón apareció
> **un segundo legajo con el mismo defecto, de impacto varias veces mayor, que ningún control puede
> ver** — porque el error está en los dos lados del cruce y la diferencia da cero.
>
> De ahí el control: mirar **un solo archivo** y autovalidarlo, sin depender de un cruce.

**Objetivo declarado por Guillermo:** que la **lógica sea general** (sirva para cualquier sistema de
origen) y que los **inputs varíen según el sistema**; que la **fórmula de provisión sea configurable**
y se pregunte al principio. Primera tajada: implementación acotada al cliente piloto.

---

## Estado del mecanismo "general" en el repo (verificado, no supuesto)

| Pieza | Estado hoy |
|---|---|
| `controlConfigs.params` por `[clientCode+controlId]` | **Existe y funciona** — lo usan `rva_config`, `agrupadores_config`, `rendvstabu_concept_grouping` |
| `scope: 'sistema'` + `scopeMeta.sourceSystems` | **Existe y funciona** en `js/controls/scope.js` — ningún control lo usa todavía |
| `paramSchema` (validación formal de params) | **Sólo diseño** — descrito en `PRD.md:44` y `ARCHITECTURE.md:86`, ningún control lo declara |
| Seam de adaptadores `js/adapters/` por sistema | **Sólo diseño** — `ARCHITECTURE.md §5`; el directorio **no existe** |

Consecuencia: la configuración por cliente y el scope ya tienen dónde vivir. Lo que falta para el
plano general es la capa que normaliza el archivo de entrada. Esta tajada **no la construye**, pero
deja el núcleo del control como función pura sobre filas lógicas para que enchufarla después sea
escribir un adaptador y no reescribir el control.

---

## Hallazgos del análisis que condicionan el diseño

Sobre un mes real de Contabilidad Desglosada del cliente piloto:

1. **La distribución de tasas efectivas es extremadamente concentrada.** Cerca del **98% de los
   legajos evaluables comparten una única tasa**; un grupo chico está medio punto porcentual por
   encima (variación legítima); y **dos legajos están a aproximadamente la mitad de la tasa general**
   — son los dos casos reales.
2. **El desvío anómalo supera los 13 puntos porcentuales, contra una variación legítima de medio
   punto.** Una tolerancia en puntos porcentuales de ~2 pp separa perfecto, sin falsos positivos.
3. **La cohorte no hace falta para resolver el caso piloto.** Los campos de dimensión disponibles en
   el archivo no discriminan el grupo de tasa levemente superior del grupo general, y con la
   tolerancia del punto 2 el problema queda resuelto sin agrupar. **Se implementa el mecanismo de
   cohorte igual** (lo pidió Guillermo y sirve para un cliente futuro con dos regímenes conviviendo
   a escala), pero el **default es moda global**.
4. **"Conceptos de contribución faltantes" no sirve como disparador.** A varias decenas de legajos
   les falta al menos uno de los conceptos de contribución patronal que tiene la mayoría, y sólo dos
   son casos reales. Hay un **legajo testigo con exactamente el mismo set de conceptos que uno de los
   casos y que provisiona correctamente** — o sea que la falta de contribuciones **no causa** el
   desvío de tasa; son dos defectos independientes sobre el mismo legajo. Se degrada a **panel
   informativo que no dispara el semáforo**.
5. **Los legajos sin base o sin provisión se excluyen** del cálculo de tasa. Salen solos y son de dos
   tipos: altas sin remuneración en el mes, y legajos de remuneración alta sin provisión (probable
   régimen distinto). Sin esta exclusión serían falsos positivos.

### Pares de provisión a cubrir

Tres pares **base ↔ CCSS**, cada uno con su reversión:

| Par | Base | CCSS sobre la base | Reversión |
|---|---|---|---|
| Vacaciones | concepto de provisión de vacaciones | concepto de provisión de CCSS s/vacaciones | sí |
| SAC | concepto de provisión de SAC | concepto de provisión de CCSS s/SAC | sí |
| Bonus | concepto de provisión de bonus | concepto de provisión de CCSS s/bonus | sí |

Los **códigos concretos de cada cliente no van en esta spec ni en ningún documento del repo**. Van
como default editable en la configuración del control — ver el ítem abierto al pie sobre dónde
alojarlos.

---

## Decisiones tomadas por Guillermo (2026-08-05)

1. **Tres detecciones pedidas.** El análisis degradó la de conceptos faltantes a informativa
   (hallazgo 4); las otras dos disparan. **Confirmado por Guillermo.**
2. **Tasa esperada:** moda por cohorte con override manual. Por el hallazgo 3, el **default es moda
   global**; los modos `moda_cohorte` y `declarada` quedan disponibles en la config.
   **Confirmado por Guillermo.**
3. **Input:** Contabilidad Desglosada obligatoria + Tabulado opcional (para la cohorte).
4. **Pares:** Vacaciones + SAC + Bonus como default editable desde la config del control.
5. **Registro:** acotado al cliente piloto en esta tajada, con el núcleo ya escrito como puro para
   poder promover después.

---

| Dimensión | Definición |
|---|---|
| **Guardrails** | **Puede modificar:** nuevo `js/controls/tasaProvisiones.js`; `js/controls/registry.js` (agregar **una** entrada — sin tocar las 11 existentes ni sus `run`/`summarize`/`renderResults`); `js/ui/controlsWizard.js` (import del editor de config y persistencia de su config — sin tocar la lógica de otros controles); nuevo `tests/tasaProvisionesControl.test.js`; `package.json` (sumarlo a la cadena `test:unit`); `CHANGELOG.md`, `DECISIONS.md`, `README.md` (tabla de controles). **No puede modificar:** `js/parsers/contaExcel.js` ni `js/parsers/tabuladoControl.js` — ya existen, los consume `rend_vs_asiento`, se **reusan** tal cual; la lógica de cálculo de cualquier control existente (guardrail transversal de `specs/plan-v2-t0-t6.md` §0); el schema de `controlConfigs` (se usa `params`, no se agregan campos); el flujo de carga múltiple de Contabilidad recién mergeado en PR #71. |
| **Comportamientos a preservar** | `rend_vs_asiento` sigue dando exactamente los mismos números, incluida la carga múltiple de Contabilidad — se verifica con `tests/contaMerge.test.js` y con una corrida manual sobre los archivos reales del mes de referencia (el residuo debe seguir dando el mismo valor que antes de este cambio). Los 11 controles existentes siguen ofreciéndose igual al cliente piloto y sólo `agrupadores` a un cliente nuevo — `tests/controlsScope.test.js`, `tests/e2e/controlsWizardScope.spec.js`. El parser de Contabilidad sigue devolviendo la misma forma `{ parsedRows, parseMetadata }` — `tests/contaMerge.test.js`. |
| **Scope** | **Entra:** (a) núcleo **puro** sobre filas lógicas `{ legajo, concepto, importe, cuenta, cc }` — exports `computeEffectiveRates(rows, pairs)` y `detectRateDeviations(rates, expectedCfg, tol)`, sin ver nunca una columna cruda de un sistema concreto; (b) **detección primaria 1** — desvío de tasa efectiva contra la esperada, modos `moda_global` \| `moda_cohorte` \| `declarada`, tolerancia en **puntos porcentuales** + umbral de materialidad en pesos; (c) **detección primaria 2** — inconsistencia interna del legajo: tasa de la reversión vs tasa de la provisión nueva, en el mismo archivo (la señal más portable: no necesita saber la tasa "correcta" de la nómina); (d) **detección informativa 3** — conceptos de contribución ausentes respecto de la mayoría, en panel aparte, **no cuenta para el semáforo** (hallazgo 4); (e) editor de configuración en el paso Archivos siguiendo el patrón de `renderRendVsAsientoConfigEditor`, persistido en `controlConfigs`; (f) entrada: Contabilidad Desglosada obligatoria (reusa parser y multi-archivo) + Tabulado opcional para la cohorte, con **fallback a moda global** cuando el Tabulado no está; (g) UI completa según CLAUDE.md §11 y la skill `nuevo-control`: hero de sin-diferencia vs con-diferencia, ocultar filas y columnas sin valor real, semáforo, export xlsx/csv/copiar, paginación y buscador; (h) entrada de registry acotada al cliente piloto, con `help: { what, how[] }`. **Explícitamente afuera:** no se construye `js/adapters/` ni el seam por sistema de origen (`ARCHITECTURE.md §5`) — el núcleo queda puro para enchufarlo después, pero el adaptador del segundo sistema **no** entra; no se declara `paramSchema` formal ni se valida `params` contra un schema (sigue siendo diseño — se usa `controlConfigs.params` como el resto de los controles); no se promueve el scope a `general` ni a `sistema`; **no** se resuelve que la Contabilidad se suba una sola vez cuando se corren `rend_vs_asiento` y este control juntos — hoy los slots son por control, así que se subiría dos veces (limitación conocida, queda anotada); no se calcula el asiento de ajuste a contabilizar (el control **flaguea**; el monto exacto a bookear sale de reliquidar en el sistema); no se toca `rend_vs_asiento` para que muestre este desvío. |
| **Evals** | **Automático** — `tests/tasaProvisionesControl.test.js` con **datos sintéticos, nunca reales** (legajos `'1'`,`'2'`, nombres de la lista de jugadores de Banfield de `CLAUDE.md`, `SANGUINETTI JAVIER`/`FALCIONI JULIO`): legajo a la moda → sin desvío; legajo a mitad de tasa → detectado con el monto faltante correcto; legajo **sin provisión** → excluido, no falso positivo (hallazgo 5); **legajo con dos liquidaciones en el mismo mes → consolida en vez de duplicar** (regression del bug más caro del repo, `nuevo-control` §4); legajo con tasa de reversión ≠ tasa de provisión nueva → detección 2; legajo al que le faltan conceptos pero provisiona bien → **no** dispara semáforo (regression del hallazgo 4, el caso del legajo testigo); cada rama de `{ error }` de `run()`. Sumado a `test:unit` para que CI lo corra. **Manual, fuera de CI** (mismo criterio que `tests/rendVsAsientoDrill.test.js`: necesita archivos reales que no van ni deben ir al repo) — sobre el mes de referencia el control debe flaguear **exactamente los dos legajos identificados en el análisis previo, y ninguno más**, y el faltante calculado para cada uno debe coincidir con lo verificado en ese análisis (la lista concreta y los importes se validan contra el archivo real, fuera del repo). **Criterio de éxito:** las dos evals pasan. **Quién revisa antes de cerrar:** Guillermo (la eval manual depende de archivos que sólo están de su lado). |
| **Autonomía** | **Decide solo:** nombres de archivos, funciones y variables; el `id` y `label` del control (propuesta: `tasa_provisiones` / "Tasa de Provisiones"); layout de la tabla, del hero y del editor de config; estructura interna de `params`; los valores default de tolerancia (2 pp) y materialidad; todos los textos de UI en español argentino. **Consulta antes de:** cambiar cuál detección es primaria y cuál informativa (se decidió con los datos, no se reinterpreta); tocar cualquier archivo de la lista "no puede modificar"; agregar un archivo de entrada que no sea la Contabilidad o el Tabulado; promover el scope; **decidir dónde alojar los códigos de concepto por defecto** (ver ítem abierto); **y sobre todo — si la eval manual flaguea legajos distintos de los dos identificados, reportarlo y parar: puede ser un hallazgo real (como lo fue el segundo legajo) o un falso positivo, y en ningún caso se ajusta la tolerancia para que "cierre" el número esperado.** |
| **Condición de salida** | **Para cuando:** `npm run test:unit` pasa en CI con el test nuevo incluido; la eval manual sobre el mes de referencia devuelve exactamente los dos legajos esperados; y el ciclo de CLAUDE.md §7 está hecho (commit → push → PR). **Explícitamente NO debe:** construir `js/adapters/`; refactorizar `rend_vs_asiento` ni ningún control existente; agregar detecciones más allá de las tres definidas; optimizar performance; promover el scope; ni "arreglar" los otros hallazgos que aparezcan en el camino — **se reportan a Guillermo, no se resuelven por cuenta propia**. |

---

## Ítem abierto — dónde viven los códigos de concepto por defecto

La instrucción de privacidad de Guillermo (2026-08-05) es que ningún documento del repo lleve las
cuentas ni los conceptos de un cliente. Eso deja una pregunta a resolver antes de implementar:

- **Precedente:** `DEFAULT_RVA_CONFIG` en `js/controls/rendVsAsiento.js` **ya tiene** códigos
  concretos hardcodeados en el código de la app.
- **Opciones:** (a) seguir el precedente y poner los defaults en el módulo del control;
  (b) dejarlos vacíos en el código y que se carguen por cliente vía `controlConfigs.params` /
  el seed de configuración, que se distribuye fuera del repo.

**(b) es más consistente con la instrucción, pero cambia el precedente del repo y obliga al analista
a cargar los códigos la primera vez.** Requiere decisión de Guillermo — no se elige por cuenta propia.

---

## Ideas para el plano general (registradas, fuera de esta tajada)

De mayor a menor valor:

1. **Núcleo puro sobre filas lógicas.** Es lo único de esta lista que **sí** entra ahora, porque es
   gratis hacerlo hoy y caro después. Todo lo demás depende de esto.
2. **La detección de inconsistencia interna es la más portable.** No necesita conocer la tasa
   correcta de la nómina ni la fórmula de provisión del cliente: compara al legajo contra sí mismo.
   Funcionaría incluso en un cliente donde *toda* la nómina esté mal parametrizada.
3. **Los pares provisión ↔ base como configuración.** Cada cliente y cada sistema tiene sus propios
   códigos. Misma lógica, distinta config — es exactamente para lo que `ARCHITECTURE.md §4` previó
   `paramSchema`.
4. **Cohorte por CCT/categoría** para clientes con dos regímenes conviviendo a escala. El mecanismo
   entra ahora; el caso de uso real todavía no existe (hallazgo 3).
5. **Tolerancia en puntos porcentuales, materialidad en pesos.** Las tasas varían por topes, mínimos
   y redondeo — una tolerancia en pesos no es transportable entre clientes de tamaños distintos.
6. **No atarlo a un cruce de dos archivos.** Es la propiedad que le permite ver el segundo legajo,
   que el cruce Rendimiento vs Asiento no puede ver porque el error está en ambos lados.

---

**Fecha de creación:** 2026-08-05
**Confirmada por el usuario:** sí — Guillermo confirmó los hallazgos 3 y 4 y las 5 decisiones de
diseño el 2026-08-05. Queda pendiente sólo el ítem abierto de arriba.
