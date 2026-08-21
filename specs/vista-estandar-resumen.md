# Vista estándar del Resumen — el veredicto del run y dónde están los errores, para los 21 controles

**Estado:** **tanda 1 implementada el 2026-08-21** (el tablero 3a/3b + `resumenStats` + Control de
Netos de piloto + los dos candados del §8) — ver **D-089**. Las tandas 2 a 6, que cablean los campos
del `summarize` de los otros 20 controles, siguen pendientes y pueden correr en paralelo. El piloto
espera que Willy lo mire en el navegador.
Reescrita el mismo día al recibir el handoff completo del diseño
(`docs/handoff-resumen-netos.md` — pantallas 3a y 3b del canvas de Netos): la primera versión de
esta spec, escrita sin el handoff, asumía que el rediseño era de la solapa Resumen de adentro de
cada control; el handoff aclara que es **el Resumen del run entero** —el que hoy pinta
`buildHeroHtml()`—, lo que simplifica todo el plan. Es el trabajo que el §2 de
`specs/vista-estandar-resultados.md` dejó explícitamente aparte.

> **La fuente es el handoff, no este documento**: `docs/handoff-resumen-netos.md` tiene el detalle
> pixel por pixel (medidas, tokens, copy, interacciones) y sus §Riesgos. Esta spec agrega lo que el
> handoff no cubre: **cómo se generaliza a los 21 controles**, el mapa control por control, las
> tandas y los candados para que quede por defecto. Si algo acá contradice al handoff en lo visual,
> gana el handoff; si lo contradice en conteos/semáforo/unidades, ganan las reglas de CLAUDE.md.

---

## 1. Por qué — y el cambio de arquitectura que trae el handoff

El Resumen de un run hoy es el hero: un círculo con `!`, "116 legajos con diferencias", y cuatro
KPIs que repiten el mismo dato. El analista sale sin saber cuán grave es ni dónde mirar primero.
El diseño lo reemplaza por un tablero que contesta, en orden: **¿se libera?** (veredicto en
palabras + la escala contra el umbral real), **¿cuánta plata es?** (el puente y el signo), y
**¿qué reviso primero?** (tres cortes, la evolución mes a mes, los 5 legajos que concentran la
plata). Y se parte en dos layouts: **3a** para un run de un control, **3b** para un run de varios
(el veredicto se comprime, aparece la grilla de tarjetas por control y dos cortes que sólo existen
cruzando controles).

**La consecuencia que ordena este plan: el tablero se construye UNA vez** — vive en
`js/ui/controlsResults.js`, donde hoy vive el hero, y consume `controlSummaries[]`. "Bajarlo a los
21 controles" no es tocar 21 pantallas: es que **cada `summarize` publique los campos nuevos** que
el tablero necesita (signo, cortes, causa, top de unidades), con un helper compartido para no
escribirlo 21 veces. Un control que no publica un campo no rompe nada: ese bloque se omite para él.

La solapa **Resumen de adentro de la card de cada control** (tiles + casos + chequeos, el trío
`renderVerdict`/`renderTiles`/`renderIssues`) **no la toca este frente** — el handoff es explícito
en que la solapa Detalle no cambia. Qué hacer con ella cuando el tablero exista (queda redundante
en runs de un control) es una decisión de Willy: §7, punto 2.

## 2. Los bloques del diseño — cuáles son del tablero y cuáles dependen del control

Los nombres son los del handoff. **Un bloque sin datos se omite entero — no sale vacío, ni en
cero, ni con placeholder** (`null` no es `0`); el criterio de por qué se omite queda en el mapa
del §4.

| Bloque | Qué muestra | Qué necesita del control | Dónde NO aplica |
|---|---|---|---|
| **Banda de veredicto** (3a) | La acción en palabras (rojo "No liberar la liquidación" / amarillo "Liberar con reparos" / verde "Listo para liberar"), la bajada con el múltiplo contra el umbral, y la escala de severidad con el marcador | Sólo `unitsTotal`/`unitsWithDiff` — ya obligatorios. El color y el corte salen de `computeSemaforoStatus()` + `semaforoThresholdPct`, **nunca** de `summary.status` ni de un 2 % cableado | En ninguno. En los que no cuentan unidades de cruce (los tres "Generar Reporte" de Marval, Acumuladores) la escala no se dibuja y el veredicto habla del archivo/reconciliación (D-077/D-078) |
| **De dónde sale la diferencia** (el puente + la barra de proporción) | Neto teórico → + Explicado por el mes → + Sin explicar → Neto liquidado, y qué % del total es lo sin explicar | Los 4 números del puente, del `run()` del control. La **forma** es por familia: dos totales cruzados (regla D-086), anterior → variación → actual, DEBE → HABER, conteos | Los cuatro pasos con "Explicado" son de Netos. Los "Generar Reporte" no tienen puente de cruce |
| **Para qué lado** | De más / de menos, con conteo de unidades, suma por lado, y el pie Neto/Bruto | `diffSigned: {over, under}` — exige que la diferencia por unidad conserve el **signo** | EE x CATEG (texto, sin signo), los que no cruzan |
| **Qué tan grande es cada una** | Los cortes de magnitud; el corte más chico arranca en la **tolerancia del control**, no en un número fijo | `diffBuckets` | Ídem anterior |
| **En qué empresa** | % de unidades con diferencia por empresa/UN, **cada grupo contra su propio total**, plata abajo | `byGroup.empresa` — sólo si la corrida trae más de una empresa | Casi todos los Meta4 (una empresa por corrida) |
| **Qué rubro la causa** | El rubro causante con su base, más **"Sin identificar" con barra rayada — obligatorio si la atribución es parcial**: un corte que se muestra como completo sin serlo es el default silencioso de siempre | `byCause` + `unidentifiedCause` | Donde la unidad ya es el rubro (los dos contables: la cuenta) o hay un solo importe (Rendimiento x EE) |
| **Cómo venía este control** | 6 períodos de % con su tier, el umbral punteado, y la lectura ("venía en 4,2 % y saltó a 30,5 %") | Nada nuevo en el control: es una consulta a las corridas guardadas (patrón `getPrevTierByControlId()`), comparando **%**, no cantidades. Sin historia, no se dibuja | Cliente nuevo o control sin corridas anteriores |
| **Por dónde empezar** | Los 5 de mayor \|diferencia\| con nombre, empresa, rubro causante e ir a la ficha | `topUnits` (con `esc()`: los nombres vienen de un Excel de un tercero) | Los que no cruzan |
| **3b: grilla + tira de semáforos** | Una card por control (%, sparkline, "venía en"), los verdes agrupados en una sola card | `unitsTotal`/`unitsWithDiff` + historia — nada más: **todo control del registry entra a la grilla gratis** | — |
| **3b: cortes cruzados** | Empresa cruzando controles, "tocados por algún rojo" (una **unión** de claves de legajo, jamás una suma de conteos), y los legajos que aparecen en varios controles | `crossControl` — exige que el summarize exponga las **claves** de las unidades con diferencia, con la clave del cliente (`makeLegajoKey`) | Runs de un solo control; controles cuya unidad no es el legajo no entran a "repetidos" entre unidades distintas |

**Las conclusiones en caja** ("19 legajos concentran el 82 %", "parece un parámetro que no se
aplicó") son la mitad del valor del tablero, y son de dos clases que no hay que mezclar: las
**aritméticas** (concentración, comparación con el mes anterior) se calculan y se templatean; las
**de diagnóstico** ("no es una empresa sola, es el cálculo") necesitan una heurística que hay que
definir con Willy antes de escribirla — una frase de diagnóstico equivocada es peor que ninguna
(§7, punto 5).

## 3. Dónde vive cada cosa — el contrato

Tres capas, de una sola escritura cada una:

1. **El tablero** — `js/ui/controlsResults.js`: `buildHeroHtml()` se reemplaza por el tablero 3a/3b
   y `buildCtrlCardHtml()` gana %, sparkline y "venía en". Una sola implementación para los 21;
   decide 3a o 3b por la cantidad de controles del run. Todo el copy de unidad pasa por
   `unitNames()`/`fmtUnitCount()` — un run por centro de costo no dice "legajos".
2. **El helper compartido** — nuevo, `js/controls/resumenStats.js`: recibe las filas ya filtradas
   por tolerancia (`summarizeWithTolerance`) y una declaración de qué campos aplican, y devuelve el
   sub-objeto `summary.resumen`: `diffSigned`, `diffBuckets`, `byGroup`, `byCause` +
   `unidentifiedCause`, `topUnits`, y las claves de unidad para `crossControl`. **La pieza agrupa y
   suma; nunca decide quién tiene diferencia** — eso ya lo decidió el control con su tolerancia. Un
   corte que el control declara como no aplicable queda declarado, no ausente por accidente.
3. **Cada control** — su `summarize` llama al helper con sus filas y su declaración, y su `run()`
   aporta los números del puente si le faltan (derivados de lo que ya calcula, dicho en el PR — la
   regla de la tanda 4 de Fichas). Ningún cálculo ni conteo existente cambia.

La **historia mes a mes** es una consulta nueva con el patrón de `getPrevTierByControlId()`
(corrida definitiva de cada período anterior, o la última si ninguna; el tier se recalcula con
`summarizeWithTolerance` + `computeSemaforoStatus`; un período sin corrida se omite, no se dibuja
en cero). Va en `controlsResults.js` o como función propia de `js/db.js` — lo decide la tanda 1.

### Reglas que no se negocian (las que ya mordieron)

1. **El color y el corte de la escala salen de `computeSemaforoStatus()` y `semaforoThresholdPct`**
   — nunca de `summary.status` ni de un 2 % escrito. La barra del veredicto y la tarjeta del
   checklist no pueden decir cosas distintas del mismo run.
2. **No se suman `unitsTotal` entre controles** (dos controles sobre la misma nómina no son 760
   legajos): el denominador del run sigue siendo el de `groupSummariesByUnit()`/`unitsMax`.
   `touchedByRed` es una unión de claves, no una suma.
3. **`null` no es `0`** — en cada bloque, cada barra y cada KPI: sin dato, no se dibuja.
4. **El puente no resta dos totales cuando un lado puede faltar** (D-086).
5. **Nada del Resumen agrega columnas a ningún export** (D-020 sigue en verde en Acreditaciones), y
   ningún dato de empleado real entra a fixtures ni capturas: datos inventados y Banfield.

## 4. El mapa — qué campos publica cada control

La unidad viene del §8 de la spec madre; los datos disponibles se relevaron sobre el código al
2026-08-21. **S** = `diffSigned`+`diffBuckets` (pide diferencia por unidad con signo) ·
**puente** = la forma del bloque 2 · las dimensiones nombran `byGroup`/`byCause`.

| Control | S | Puente — la forma | byGroup | byCause | Nota |
|---|---|---|---|---|---|
| **Control de Netos** | ✅ hecho | ✅ **el del diseño**, agregado en el `run()` (`bridge`): entra sólo lo comparable y el legajo sin neto se informa aparte (D-086); el paso "Sin explicar" va **con signo** para que el puente cierre contra la fila TOTAL de la Planilla — el bruto lo dice "Para qué lado" | ✅ **empresa**, sólo si la corrida trae más de un Tabulado | ✅ **las marcas que el control detecta** (básico fuera de escala · tope sin declarar · perfil de jubilado sin confirmar) + sin identificar. **NO la cascada**: la cascada es lo explicado, y atribuirle la diferencia diría lo contrario de lo que pasó (D-089). Willy puede cambiar la regla en pantalla | el piloto |
| Brutos — Controlar | sí | Total Tabulado → Diferencia comparada → Total Reporte | — | los 2 conceptos | |
| GS Pers — Controlar | sí | ídem | — | los 2 conceptos | |
| Control NR — Controlar | sí | dos totales con **D-086**: la diferencia suma sólo lo comparable, lo sin comparar se dice aparte | — | 18 conceptos o las 2 bandas (arrancar por banda; Willy elige en pantalla) | |
| Rendimiento vs Tabulado | sí | Total Rendimiento → Diferencia comparada → Total Tabulado | — | las 5 categorías | unidad CC: el copy pasa por `unitNames()` |
| Rendimiento vs Asiento | sí | ídem, contra el asiento | — | las 5 categorías | unidad CC |
| Rendimiento x EE | sí | dos totales | — | — (un solo importe) | |
| Cruce por Agrupadores | sí | Nómina → Diferencia → Resumen, con la **neta** y la **total** separadas (D-087) | — | agrupador | los conteos SIEMPRE en legajos, nunca en filas legajo × agrupador (el semáforo ya mintió en verde por eso). Lados: pendiente §7.6 |
| Novedades vs Liquidación | sí | Pedido → Diferencia comparada → Liquidado, con las 4 bandas como conteos (D-073) | UO si viene | concepto | el legajo sin nada comparable cuenta para revisar |
| Variación Sueldos | sí | **temporal**: Anterior → Variación → Actual; lados = "subieron / bajaron" | — | jornales / mensuales | |
| Variación Conceptos | sí | temporal | — | concepto | |
| Variación entre quincenas (POP) | sí | temporal | — | — | el valor hora fuera de todo total (D-081) |
| EE x CATEG | no | **conteos**: comparados → coinciden → difieren → sin comparar (D-082) | — | por campo — ya lo contesta su solapa "Por campo": el corte del tablero linkea, no duplica | sin signo ni buckets |
| Acumuladores Ganancias | no | la reconciliación de D-077: TOTAL del crudo → componentes | — | — | sin unidades de cruce: sin escala; veredicto de la reconciliación |
| Asiento de Remuneraciones | sí (DEBE > / < HABER) | DEBE → HABER → descuadre | — | centro de costo | unidad cuenta; cuadra al centavo, la escala muestra % de cuentas que no cuadran |
| Contabilidad Desglosada + Asiento | sí | DEBE → HABER → descuadre | — | tipo (resultado / patrimonial) | «Sin comparar» para la cuenta sin código (D-085); byCause por rubro no aplica: la unidad ya es la cuenta |
| Acreditaciones | sí | Total liquidación → Diferencia → Total acreditado | empresa (si la config separa) | banco | unidad lista (D-021); el archivo de Finanzas no gana ni un dato (D-020) |
| Brutos — Generar Reporte | no | no cruza: qué se generó | — | — | veredicto del archivo; entra a la grilla de 3b igual |
| GS Pers — Generar Reporte | no | ídem | — | — | |
| Control NR — Generar Reporte | no | ídem | — | — | |
| Importador de Novedades | no | qué entra → qué quedó afuera, con motivo (ya lo calcula) | UO | — | la escala habla de los legajos del archivo |

**El signo queda por verificar módulo por módulo:** el mapa asume que la diferencia por fila
conserva el signo de la resta en todos los marcados con S. Cada tanda lo comprueba antes de
cablear `diffSigned`; si un control guarda sólo el valor absoluto, el bloque se omite en ese
control y se anota acá — no se recalcula la resta en el tablero.

## 5. Qué muere y qué queda

- **El hero actual (`buildHeroHtml`) muere entero**, círculo con `!` incluido: el veredicto en
  palabras dice lo mismo mejor. "Ver los N →" y "Marcar como revisado" reusan los handlers que ya
  existen (`[data-hero-detail]`, `onToggleDefinitive`).
- **El aviso de columnas queda arriba del veredicto** — es sobre la validez del run entero.
- **La solapa Resumen de adentro de la card de cada control queda como está** en este frente
  (§1). Si Willy decide jubilarla o reducirla cuando vea el tablero, es un frente aparte.
- Los 4 KPIs del veredicto son los de hoy **más "Sin comparar" y "Tolerancia"**; un KPI sin dato no
  se muestra.

## 6. Orden de tandas

El prompt de cada tanda, listo para copiar, con el modelo y el esfuerzo por chat, está en
`docs/prompts-vista-estandar-resumen.md`. La tanda 1 construye el tablero completo; las siguientes
son cablear los campos del `summarize` por lote — mucho más chicas que las de Fichas/Planilla.

1. ~~**El tablero (3a y 3b) + el helper + Netos de piloto.**~~ **Hecha el 2026-08-21 (D-089).**
   `buildHeroHtml()` es el tablero, `buildCtrlCardHtml()` tiene %, sparkline y "venía en",
   `js/controls/resumenStats.js` existe, la historia sale de las corridas guardadas, "Ver los N →"
   pre-filtra el Detalle y "ficha →" abre la ficha, y Netos publica todos los campos. Los dos
   candados del §8 están puestos. **Lo único que falta de esta tanda es la mirada de Willy en el
   navegador.**
2. **Cruce Meta4/Marval** (6): brutos, gs_pers, nr, rend_vs_tabu, rend_x_ee, rend_vs_asiento.
   Con éstos, el run del checklist de Marval es el primer 3b real.
3. **Cruce y temporales Axton/general** (5): agrupadores, novedades_liquidacion,
   variaciones_sueldos, variaciones_conceptos, pop_variaciones.
4. **Los que generan archivo** (4): brutos_reporte, gs_pers_reporte, nr_reporte,
   novedades_importador — veredicto del archivo, sin puente de cruce (D-077/D-078).
5. **Al centavo y unidades contables/lista** (3): finadiet_asiento, conta_desglosada,
   acreditaciones_reporte — D-084/D-085 y D-020/D-021 intocables.
6. **Los dos sin cruce de importes** (2): cat_x_empleados, acumuladores_ganancias.

Las tandas 2 a 6 dependen sólo de la 1 y no comparten módulos entre sí — pueden correr en
paralelo, con la lección de D-088: un helper nuevo que dos tandas necesiten se declara en el PR
para unificar al integrar.

## 7. Lo que queda pendiente de que Willy lo mire — no se adivina

1. ~~El diseño contra este documento~~ — **resuelto**: el handoff completo está en
   `docs/handoff-resumen-netos.md` (recibido el 2026-08-21). Sus propios §Riesgos pasan a esta
   lista (puntos 3, 4 y 8).
2. **La solapa Resumen de adentro de la card**: con el tablero puesto, en un run de un control
   queda contando lo mismo dos veces. ¿Se jubila, se reduce a chequeos, o queda? Se decide viendo
   el tablero andando.
3. **La historia**: ¿la comparación es contra la corrida **definitiva** de cada período (lo que
   asume el handoff) o contra la última? (Riesgo 2 del handoff.) **La tanda 1 arrancó con
   definitiva** (entre dos definitivas o dos borradores gana la más reciente): cambiarlo es una
   línea en `getHistoryByControlId()`.
4. **El ancho**: el tablero está diseñado a 1352 px y el Resumen respeta el tope de 1280 (D-060) —
   ¿tres columnas apretadas a 1fr, o el Resumen pasa a ancho completo? (Riesgo 4 del handoff.) **La
   tanda 1 arrancó respetando D-060**: el Resumen dejó de ser la columna de lectura de 880 px y usa
   el ancho de `page-content`, con las tres columnas de cortes a 1fr. Entra bien; si Willy quiere
   más aire, es cambiar `--results-col-max` en `css/results.css`.
5. **Las conclusiones de diagnóstico** (§2): cuáles frases se pueden calcular con una regla que
   Willy firme ("N legajos concentran el X %": aritmética) y cuáles no se generan todavía ("parece
   un parámetro que no se aplicó": diagnóstico). **La tanda 1 salió sólo con las aritméticas**: la
   concentración, cuántos grupos están arriba del corte, la cobertura del corte por causa y la
   comparación con el mes anterior. Las de diagnóstico se definen viendo casos reales.
5 bis. **El rubro causante de Netos** (nuevo, salió al implementar el piloto): hoy sale de las
   marcas que el propio control detecta y todo lo demás va a "Sin identificar". La alternativa es el
   concepto de la cascada que más se movió en el mes — pero la cascada es lo EXPLICADO, así que esa
   regla la tiene que firmar Willy. Detalle y por qué en D-089.
6. **Agrupadores, bloque de lados**: ¿de más/de menos por legajo con su neta (un legajo compensado
   no aparece) o por agrupador (aparece en los dos)? La misma tensión que D-087 resolvió para el
   número grande de la ficha.
7. **NR, el corte por causa**: ¿los 18 conceptos o las 2 bandas? Arranca por banda; se elige en
   pantalla.
8. **`touchedByRed` en controles que no exponen claves**: si algún summarize no puede dar las
   claves de sus unidades con diferencia, ese KPI sale del veredicto de 3b para ese run — no se
   aproxima sumando. (Riesgo 3 del handoff.) Verificarlo control por control en las tandas.
9. **Los textos del veredicto de los "Generar Reporte"** (tanda 4): qué dice exactamente. Se
   listan en el PR y se ajustan en pantalla, junto con las pendientes de D-077/D-078 que ya
   esperan en ESTADO.

## 8. Que salga por defecto en todo control nuevo — y cómo se asegura

El pedido de Willy: que esto no haya que acordarse de ponerlo. Tres candados, del más blando al
más duro:

1. **El tablero es del run, no del control.** Un control nuevo entra a la banda de veredicto, la
   escala y la grilla de 3b **sin escribir una línea**, porque `unitsTotal`/`unitsWithDiff` ya son
   obligatorios. Lo único que puede faltarle son los bloques ricos (puente, lados, cortes) — y eso
   se ve como bloques omitidos, no como pantalla rota.
2. **La receta.** ✅ **Hecho.** La skill `.claude/skills/nuevo-control/` tiene el **6º punto de
   integración**: declarar `summary.resumen` vía `resumenStats()` (qué cortes aplican, de dónde sale
   el puente), con el ejemplo del control que cruza y el del que no cruza nada. Todo control nuevo
   nace por esa receta, así que ninguno nace sin declararlo.
3. **El candado de CI.** ✅ **Hecho:** `tests/resumenContract.test.js`, en la cadena de
   `package.json`. Recorre el `CONTROL_REGISTRY` y falla si un `summarize` no trae el sub-objeto
   `resumen` — aunque sea la declaración explícita de qué no aplica (`notApplicable`). La lista de
   excepciones arrancó con los 20 no migrados, cada uno con su tanda escrita, y **el test también
   falla si una excepción ya no hace falta**: así se achica sola cuando una tanda migra su lote, sin
   que nadie se acuerde de limpiarla. Termina vacía y protege a los futuros. Mismo patrón que
   `check-datos-sensibles.mjs`: si alguien se olvida, **el PR sale en rojo**.

## 9. Cómo se verifica

- **El piloto contra el handoff**, bloque por bloque, en el navegador y en los tres temas — el
  handoff es hi-fi: medidas, copy y tokens son los definitivos.
- **La aritmética del tablero contra el Detalle**: el puente cierra exacto contra la fila TOTAL de
  la Planilla (el mock lo cumple a propósito), y `de más − de menos = neto`, `de más + de menos =
  bruto` — escritos como asserts con datos inventados y jugadores de Banfield, **en la cadena de
  `package.json`**.
- **Los números de antes y después, por control**: ningún conteo del semáforo se mueve. La escala
  del veredicto contra la tarjeta del checklist: mismo run, mismo color, en los cuatro lugares que
  pintan estado.
- **El corte por causa nunca se muestra completo sin serlo**: si hay `unidentifiedCause`, la banda
  rayada está — assert.
- **Ningún export cambia ni una columna** — el assert de D-020 sigue en verde.
- Cada bloque omitido, omitido **por el criterio del mapa**: si el control debía traer el dato y
  no vino, se dice, no se tapa.
