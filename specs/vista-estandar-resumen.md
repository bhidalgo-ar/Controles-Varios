# Vista estándar del Resumen — el veredicto del run y dónde están los errores, para los 21 controles

**Estado:** **las seis tandas están implementadas.** La tanda 1 el 2026-08-21 (el tablero 3a/3b +
`resumenStats` + Control de Netos de piloto + los dos candados del §8, **D-089**, mergeada a `main`
en el PR #193) y las tandas 2 a 6 el 2026-08-22, cada una en su chat en paralelo: tanda 2 Cruce
Meta4/Marval (**D-090**), tanda 3 el lote Axton/temporales (**D-091**), tanda 4 los que generan
archivo (**D-092**), tanda 5 contables + acreditaciones (**D-093**) y tanda 6 los dos sin cruce de
importes (**D-094**). **Con la tanda 6 los 21 controles publican `summary.resumen` y el candado de
`tests/resumenContract.test.js` se queda sin excepciones.** Lo que falta de todo el frente es una
sola cosa: que Willy mire el tablero en el navegador (el entorno de desarrollo no llega al CDN de
xlsx.js/Dexie, así que no se pudo verificar acá), y que cierre los puntos abiertos del §7.
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
| **Brutos — Controlar** | ✅ hecho | ✅ Total Tabulado → Diferencia comparada → Total Reporte (D-086) | — no aplica (una sola razón social) | ✅ los 2 conceptos (SAL_BASE, A_CTA_FUT_AUMEN), cada legajo se abre en hasta 2 instancias para que `byCause` los separe | tanda 2, D-090. Nombre viaja en `topUnits` |
| **GS Pers — Controlar** | ✅ hecho | ✅ ídem (GTOS_PERSONALES, DTO_COCHERA) (D-086) | — no aplica | ✅ los 2 conceptos, mismo patrón que Brutos | tanda 2, D-090. **No trae nombre de legajo** (el archivo no lo trae): `topUnits` sale con `nombre: null`, no inventado |
| **Control NR — Controlar** | ✅ hecho | ✅ dos totales con **D-086**: la diferencia suma sólo lo comparable, lo sin comparar se dice aparte — es el caso que motivó la decisión (un concepto liquidado de un solo lado) | — no aplica | ✅ **arranca por las 2 bandas** (Indemnizatorios / Otros NR), no por los 18 conceptos — resuelto §7.7: Willy elige en pantalla si conviene abrir a concepto | tanda 2, D-090 |
| **Rendimiento vs Tabulado** | ✅ hecho | ✅ Total Rendimiento → Diferencia comparada → Total Tabulado (D-086). **Limitación preexistente**: no hay lista de CC del Tabulado sin Rendimiento (sólo la inversa, `sinTabData`), así que "sin comparar" del puente sólo informa esa única dirección | — no aplica (la unidad ya es el CC) | ✅ las 5 categorías (nunca COSTO TOTAL, que es la suma) | unidad `'cc'`: el copy pasa por `unitNames()`. Clave de unidad para el corte cruzado de 3b unificada con Rendimiento vs Asiento por nombre, código de respaldo (**D-090**) |
| **Rendimiento vs Asiento** | ✅ hecho | ✅ ídem, contra el asiento (D-086). Acá SÍ hay las dos direcciones (`ccsSoloEnConta` ya existía): el puente informa "sin comparar" de los dos lados | — no aplica | ✅ las 5 categorías, mismo criterio que Rendimiento vs Tabulado | unidad `'cc'`. Misma clave de unidad que Rendimiento vs Tabulado, ver **D-090** |
| **Rendimiento x EE** | ✅ hecho | ✅ dos totales, cubre las dos direcciones de "sin comparar" (el control ya traía `sinTabData`/`soloEnTab`) | — no aplica | — no aplica (un solo importe, Costo Total) | tanda 2, D-090 |
| Cruce por Agrupadores | sí | Nómina → Diferencia → Resumen, con la **neta** y la **total** separadas (D-087) | — | agrupador | los conteos SIEMPRE en legajos, nunca en filas legajo × agrupador (el semáforo ya mintió en verde por eso). Lados: pendiente §7.6 |
| Novedades vs Liquidación | sí | Pedido → Diferencia comparada → Liquidado, con las 4 bandas como conteos (D-073) | UO si viene | concepto | el legajo sin nada comparable cuenta para revisar |
| Variación Sueldos | sí | **temporal**: Anterior → Variación → Actual; lados = "subieron / bajaron" | — | jornales / mensuales | |
| Variación Conceptos | sí | temporal | — | concepto | |
| Variación entre quincenas (POP) | sí | temporal | — | — | el valor hora fuera de todo total (D-081). **Implementado (tanda 3, D-091) distinto de lo previsto acá**: sin Axton no hay `resumen`; con Axton, el puente terminó siendo de **conteos** (legajos comparados/con diferencia/coinciden), no temporal, y S no aplica (no hay un número en pesos que resuma valor hora + MOD + altas/bajas + neto sin inventar un criterio) |
| EE x CATEG | no | **conteos**: comparados → coinciden → difieren → sin comparar (D-082) | — | por campo — ya lo contesta su solapa "Por campo": el corte del tablero linkea, no duplica | sin signo ni buckets |
| Acumuladores Ganancias | no | la reconciliación de D-077: TOTAL del crudo → componentes | — | — | sin unidades de cruce: sin escala; veredicto de la reconciliación |
| Asiento de Remuneraciones | sí (DEBE > / < HABER), sólo si no cierra — con el asiento cerrado las únicas unidades con diferencia (sin clasificar) no tienen importe cargado | DEBE → HABER → descuadre | — | centro de costo — sólo las cuentas de Resultado lo tienen; Patrimoniales y sin clasificar van a "Sin identificar" | unidad cuenta; cuadra al centavo, la escala muestra % de cuentas que no cuadran |
| Contabilidad Desglosada + Asiento | sí (DEBE > / < HABER) | DEBE → HABER → descuadre | — | tipo (resultado / patrimonial); la cuenta sin código no tiene tipo asignable sin inventarlo → "Sin identificar" | «Sin comparar» para la cuenta sin código (D-085); byCause por rubro no aplica: la unidad ya es la cuenta |
| Acreditaciones | sólo el grupo pendiente (D-093): lo que todavía no se acreditó, siempre "de menos" | Total liquidación → Diferencia → Total acreditado | empresa (si la config separa) — sólo si es la MISMA para toda la lista/grupo | banco — ídem, sólo si no es ambiguo (D-093) | unidad lista (D-021); el archivo de Finanzas no gana ni un dato (D-020) |
| Brutos — Generar Reporte | no | no cruza: qué se generó | — | — | veredicto del archivo; entra a la grilla de 3b igual |
| GS Pers — Generar Reporte | no | ídem | — | — | |
| Control NR — Generar Reporte | no | ídem | — | — | |
| Importador de Novedades | no | qué entra → qué quedó afuera, con motivo (ya lo calcula) | UO | — | la escala habla de los legajos del archivo |

**El signo queda por verificar módulo por módulo:** el mapa asume que la diferencia por fila
conserva el signo de la resta en todos los marcados con S. Cada tanda lo comprueba antes de
cablear `diffSigned`; si un control guarda sólo el valor absoluto, el bloque se omite en ese
control y se anota acá — no se recalcula la resta en el tablero. **Ya verificado con assert sobre
`diffSigned.over`/`diffSigned.under`**: Control de Netos (tanda 1), Brutos, NR, Rendimiento vs
Tabulado y Rendimiento x EE (tanda 2, `tests/resumenCruceMeta4.test.js`), Novedades vs Liquidación
y Variación Sueldos (tanda 3, `tests/resumenTanda3.test.js`, que además asserta que Agrupadores y
POP lo declaran no aplicable).

**Lo que NO tiene assert propio de `diffSigned`, al cerrar las seis tandas:** GS Pers y Rendimiento
vs Asiento (tanda 2) conservan el signo por construcción —misma función (`diffOrNull`/resta
directa) que sus pares ya verificados— y el test lo confirma indirectamente vía `byCause` (importes
positivos en el sentido esperado). Y **los tres controles de la tanda 5** —Asiento de Remuneraciones,
Contabilidad Desglosada y Acreditaciones—: esa tanda no sumó test propio, así que su signo
(`conciliacion.saldo` leído como DEBE > / < HABER en los dos contables, y el grupo pendiente en
Acreditaciones) está apoyado en la lectura del código y no en un assert. Las tandas 4 y 6 no dejan
nada por comprobar acá: sus controles declaran el bloque `signed` no aplicable, y eso sí está
asserteado. **Es lo primero a cubrir con un test cuando se vuelva sobre este frente.**

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
2. ~~**Cruce Meta4/Marval** (6): brutos, gs_pers, nr, rend_vs_tabu, rend_x_ee, rend_vs_asiento.~~
   **Hecha el 2026-08-22 (D-090).** Los seis publican `summary.resumen`; con éstos, un run del
   checklist de Marval arma su primer tablero 3b real con datos en los seis. Queda pendiente que
   Willy lo mire en el navegador (bloqueado acá por el CDN de xlsx.js/Dexie).
3. ~~**Cruce y temporales Axton/general** (5): agrupadores, novedades_liquidacion,
   variaciones_sueldos, variaciones_conceptos, pop_variaciones.~~ **Hecha el 2026-08-22 (D-091).**
   Las cinco publican `summary.resumen`. Agrupadores separa la diferencia NETA de la TOTAL en su
   puente y deja el signo pendiente de Willy (§7.6); Novedades vs Liquidación lee el signo como
   "Liquidado de más/de menos"; las dos Variaciones van con puente temporal ("Subieron"/"Bajaron");
   POP publica `resumen` sólo con el reporte de Axton cargado y con un puente de **conteos**, no el
   temporal que preveía el mapa del §4 (nota agregada ahí). Detalle en D-091. Espera la mirada de
   Willy sobre §7.6 y el punto 3 de D-091.
4. ~~**Los que generan archivo** (4): brutos_reporte, gs_pers_reporte, nr_reporte,
   novedades_importador — veredicto del archivo, sin puente de cruce (D-077/D-078).~~ **Hecha el
   2026-08-22 (D-092).** Los tres primeros declaran sus siete bloques `notApplicable`; novedades_importador
   publica `bridge` (qué entra al F2 → qué queda afuera, con motivo) y `byGroup` por UO — para lo cual
   `buildGroupCardHtml` sumó el modo por unidades de D-092. El veredicto de un run de un solo control
   ahora reproduce el `headline` de ese control en vez del texto genérico fijo. Falta que Willy vea los
   textos exactos en pantalla (§7 punto 9).
5. ~~**Al centavo y unidades contables/lista** (3): finadiet_asiento, conta_desglosada,
   acreditaciones_reporte.~~ **Hecha el 2026-08-22 (D-093).** Los dos contables reusan las fichas que
   ya arman `fichasDeAsiento`/`fichasDeCuentas` para no volver a decidir quién tiene diferencia; el
   puente es DEBE → HABER → descuadre en los dos. Acreditaciones reusa `estadoDeLista`; el puente es
   Total liquidación → Diferencia → Total acreditado, con lo "SIN ASIGNAR" en `bridge.uncompared`
   (D-086) — el .xlsx de Finanzas no ganó ninguna columna (D-020 sigue en verde). D-084/D-085 y
   D-020/D-021 quedaron intocados: ningún cálculo ni conteo existente se movió.
6. ~~**Los dos sin cruce de importes** (2): cat_x_empleados, acumuladores_ganancias.~~ **Hecha el
   2026-08-22 (D-094).** Los dos publican `summary.resumen`; ninguno tocó el tablero ni
   `resumenStats.js`. Falta que Willy la mire en el navegador.

Las tandas 2 a 6 dependían sólo de la 1 y corrieron en paralelo. Al integrarlas en una sola pila
aparecieron dos roces, ninguno de criterio: los tres módulos que traen dos variantes en el mismo
archivo (`brutos.js`, `gsPers.js`, `nr.js`) los tocaron la tanda 2 y la tanda 4, y se unificó el
import de `resumenStats` que las dos necesitaban —justo la lección de D-088—; y **las cinco tandas
habían reservado el número D-090 para su entrada de DECISIONS**, así que al apilarlas se renumeraron
en orden de tanda (D-090 a D-094). La próxima vez que salgan varios chats en paralelo del mismo
commit, el número de la decisión se reparte antes de arrancar.

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
7. ~~**NR, el corte por causa**: ¿los 18 conceptos o las 2 bandas?~~ **Implementado el 2026-08-22
   (tanda 2, D-090) arrancando por las 2 bandas** (Indemnizatorios / Otros NR). Sigue pendiente que
   Willy lo vea en pantalla y confirme si prefiere abrir directo a los 18 conceptos.
8. **`touchedByRed` en controles que no exponen claves**: si algún summarize no puede dar las
   claves de sus unidades con diferencia, ese KPI sale del veredicto de 3b para ese run — no se
   aproxima sumando. (Riesgo 3 del handoff.) Verificarlo control por control en las tandas.
9. ~~**Los textos del veredicto de los "Generar Reporte"** (tanda 4): qué dice exactamente. Se
   listan en el PR y se ajustan en pantalla, junto con las pendientes de D-077/D-078 que ya
   esperan en ESTADO.~~ **Resuelto por la tanda 4 (2026-08-22, D-092)**: cada control escribió su
   propio `headline`/`contextNote` (qué se generó, cuántos registros, si está listo para descargar o
   qué lo frena) y el veredicto de un run de un solo control lo reproduce. Son un default, no una
   confirmación: los textos exactos siguen esperando que Willy los vea en pantalla.

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
