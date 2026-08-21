# Prompts de arranque — Vista estándar del Resumen (el tablero del run)

> Seis chats de Claude Code sobre este repo. Cada uno abre rama propia (`feat/…`) y termina en PR
> contra `main`. La spec de este frente es **`specs/vista-estandar-resumen.md`** y el diseño
> aprobado, pixel por pixel, **`docs/handoff-resumen-netos.md`** (pantallas 3a y 3b) — leerlos es
> lo primero que pide cada prompt.
>
> **Nada de esto está implementado al 2026-08-21.** La tanda 1 construye el tablero y el helper
> que usan todas las demás; las tandas 2 a 6 cablean los campos del `summarize` por lote y corren
> en paralelo entre sí, sin módulos compartidos.

## Modelo y esfuerzo por chat

Elegilos con `/model` antes de mandar el prompt.

| Orden | Chat | Modelo | Esfuerzo / thinking | Por qué |
|---|---|---|---|---|
| 1 | El tablero (3a + 3b) + helper + piloto Netos | **Opus 5** | **high** · thinking prendido | Reemplaza el hero para los 21 runs y define el contrato de `summary.resumen`: un error acá se multiplica por 21. Si se traba, subir a xhigh |
| 2 | Campos del summarize — cruce Meta4/Marval (6) | **Sonnet 5** | **high** · thinking prendido | Mecánico, pero no puede mover un conteo y el puente de NR arrastra D-086 |
| 3 | Campos del summarize — Axton/temporales (5) | **Opus 5** | **high** · thinking prendido | Agrupadores trae D-087 (neta vs total, denominador) y Novedades D-073: criterio fino |
| 4 | Los que generan archivo (4) | **Sonnet 5** | **high** · thinking prendido | Semántica ya decidida en D-077/D-078; es aplicar |
| 5 | Contables + Acreditaciones (3) | **Opus 5** | **high** · thinking prendido | Toca el asiento, que sale al cliente, y D-020/D-021 no se pueden pisar |
| 6 | EE x CATEG + Acumuladores (2) | **Sonnet 5** | **high** · thinking prendido | Conteos y una reconciliación ya definida (D-077, D-082) |

**Dependencias.** Los chats 2 a 6, todos después del 1; entre ellos no se pisan. Si dos necesitan
un helper nuevo compartido, se declara en el PR para unificar al integrar — la lección de D-088.

## Lo que todo chat tiene que hacer en este contenedor

- `npm run hooks:install` — el contenedor de una sesión remota es nuevo y el chequeo de datos
  sensibles no está activo hasta que se instale.
- Para abrir la app: el entorno remoto bloquea `unpkg.com` y `cdn.sheetjs.com`. Se resuelve con
  `npm i --no-save dexie@4` y apuntando esos `<script>` de `index.html` a `node_modules/`.
  **Es un parche local que no se commitea.**

---

## Chat 1 — El tablero + el helper + el piloto (Control de Netos)

```
Leé, en este orden y COMPLETOS, antes de escribir nada: docs/handoff-resumen-netos.md (el diseño
aprobado, hi-fi — medidas, tokens, copy e interacciones son definitivos),
specs/vista-estandar-resumen.md (cómo se generaliza a los 21), y de CLAUDE.md las secciones de
Gotchas, Código y Tests y CI.

Quiero el tablero del Resumen del run, con el Control de Netos publicando todos los campos, para
verlo en el navegador contra el handoff.

1. js/ui/controlsResults.js — buildHeroHtml() se reemplaza por el tablero: layout 3a si el run
   trae un control, 3b si trae varios. Todo lo del handoff: banda de veredicto (la acción en
   palabras + la escala de severidad + los KPIs, ahora con Sin comparar y Tolerancia), el puente
   con su barra de proporción, Para qué lado, los tres cortes (el de causa con la banda rayada
   "Sin identificar" OBLIGATORIA cuando la atribución es parcial), Cómo venía este control, Por
   dónde empezar, y en 3b la banda comprimida con la tira de semáforos, la grilla (los verdes
   agrupados en una sola card) y los dos cortes cruzados. buildCtrlCardHtml() gana %, sparkline y
   "venía en". El aviso de columnas queda arriba del veredicto. El círculo con ! desaparece.
2. js/controls/resumenStats.js (nuevo) — el helper que arma summary.resumen sobre las filas YA
   FILTRADAS por tolerancia: diffSigned, diffBuckets (el corte más chico arranca en la tolerancia
   del control), byGroup, byCause + unidentifiedCause, topUnits (esc() sobre nombre y empresa), y
   las claves de unidad para crossControl. El helper agrupa y suma; NUNCA decide quién tiene
   diferencia — eso ya lo decidió el control.
3. La historia mes a mes: el patrón de getPrevTierByControlId() filtrando períodos anteriores —
   corrida definitiva de cada período (o la última si ninguna), tier recalculado con
   summarizeWithTolerance + computeSemaforoStatus, comparando %, no cantidades. Un período sin
   corrida se omite, no se dibuja en cero. Sin historia, la card no se renderiza.
4. La navegación: "Ver los N →" usa el handler [data-hero-detail] que ya existe, y si viene de un
   corte PRE-FILTRA el Detalle (el chip correspondiente arranca activo, con el hint de
   createResultsToolbar()). "ficha →" abre el Detalle en Fichas con esa ficha abierta y el
   buscador con ese legajo. "Marcar como revisado" es onToggleDefinitive, que ya existe.
5. El piloto: el summarize de Netos publica summary.resumen completo, y su run() suma el agregado
   del puente (Neto teórico → Explicado → Sin explicar → Neto liquidado) desde explicado/residuo
   por legajo, que ya existen — decilo en el PR. byGroup: empresa (1-3 Tabulados); byCause: rubro
   causante + sin identificar.
6. Los dos candados del §8 de la spec: el 6º punto de integración en .claude/skills/nuevo-control/
   (declarar summary.resumen vía resumenStats), y el test de CI que recorre el CONTROL_REGISTRY y
   falla si un summarize no trae el sub-objeto resumen — con la lista de excepciones declarada
   (los 20 no migrados arrancan ahí y cada tanda la achica). Patrón de check-datos-sensibles.mjs.
   EN LA CADENA de package.json.

Reglas que no se negocian:
- El color y el corte de la escala salen de computeSemaforoStatus() + semaforoThresholdPct —
  nunca de summary.status ni de un 2 % cableado. La escala y la tarjeta del checklist no pueden
  decir cosas distintas del mismo run.
- No se suman unitsTotal entre controles (groupSummariesByUnit/unitsMax siguen mandando);
  touchedByRed es una UNIÓN de claves de legajo con makeLegajoKey, jamás una suma de conteos.
- null no es 0: cada bloque, barra y KPI sin dato se omite entero.
- Todo el copy de unidad pasa por unitNames()/fmtUnitCount() — un run por centro de costo no dice
  "legajos".
- Ningún cálculo ni conteo existente cambia. Anotá los números que muestra hoy el hero de un run
  de Netos y comprobá que el tablero cuente lo mismo.
- Las conclusiones en caja: SOLO las aritméticas (concentración "N legajos son el X %",
  comparación con el mes anterior). Las de diagnóstico ("parece un parámetro que no se aplicó")
  NO se generan en esta tanda — es el punto 5 del §7 de la spec, lo define Willy.
- Nada de hex en los módulos: tokens de css/tokens.css (agregá los que falten del handoff, con su
  par oscuro), comprobado en los tres temas. Las barras son divs con width:% — sin SVG, canvas ni
  librerías.
- Asserts con datos inventados y jugadores de Banfield, en la cadena: el puente cierra contra la
  fila TOTAL de la Planilla; de más − de menos = neto y de más + de menos = bruto; con
  unidentifiedCause presente, la banda rayada está.
- Abrí la app y sacá capturas de 3a (run de Netos) y 3b (armá un run multi-control con fixture) en
  los tres temas, contra las capturas del handoff. Si el CDN bloqueado no te deja, decilo en el PR
  en vez de dar por bueno lo que no viste.

Dos decisiones que van al PR para que Willy las cierre en pantalla (§7 de la spec): el ancho
(tope de 1280 px de D-060 vs los 1352 del diseño — arrancá respetando D-060, tres columnas a 1fr)
y si la historia compara contra la corrida definitiva (arrancá con definitiva, como asume el
handoff).

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (pasale el diff al agente
documentalista antes de mergear) — y el PR NO se mergea sin que Willy vea el piloto.
```

## Chat 2 — Campos del summarize, cruce Meta4/Marval

```
Leé specs/vista-estandar-resumen.md (§2, §3 y tu lote en el mapa del §4) y mirá cómo quedó Netos
en la tanda 1: el tablero ya existe (js/ui/controlsResults.js) y el helper es
js/controls/resumenStats.js — no escribas otro. Esta tanda NO toca el tablero: publica campos.

Las seis entradas:

  brutos, gs_pers, nr, rend_vs_tabu, rend_x_ee, rend_vs_asiento

Por control, según su fila del §4:
1. summary.resumen vía resumenStats(): diffSigned y diffBuckets — antes de cablearlos, COMPROBÁ EN
   EL MÓDULO que la diferencia por fila conserva el signo de la resta; si un control guarda sólo
   el valor absoluto, el campo se omite en ese control y se anota en el §4, no se recalcula.
2. El puente: dos totales cruzados. EN NR ES EL CASO QUE MOTIVÓ D-086 — la diferencia suma sólo lo
   que los dos lados tienen, los totales quedan los de cada archivo tal cual, y lo sin comparar se
   dice aparte con su importe y su lado. Si falta un agregado, se suma en el run() desde lo que ya
   calcula — decilo en el PR.
3. byCause: los 2 conceptos en Brutos y GS Pers; en NR arrancá por las 2 bandas (18 renglones son
   pared — Willy elige en pantalla, §7.7); las 5 categorías en los dos Rendimiento vs. Rendimiento
   x EE no lleva byCause (un solo importe). byGroup: ninguno de estos seis trae empresa.
4. En rend_vs_tabu y rend_vs_asiento la unidad es el CENTRO DE COSTO: verificá que el tablero
   diga "centros de costo" en todos los textos (unitNames ya lo resuelve; no lo puentees).
5. Las claves de unidad para crossControl, con makeLegajoKey — con este lote, el run del checklist
   de Marval es el primer 3b real: abrilo y mirá la grilla, los cortes cruzados y touchedByRed.
6. Achicá la lista de excepciones del test de CI: estos seis salen.

Ningún cálculo ni conteo existente cambia: anotá los números de cada control antes y comprobalos
después; si uno se movió, pará — es un bug. Asserts nuevos con datos inventados y Banfield en la
cadena. Nada de hex. Tres temas. Si el CDN bloqueado no te deja abrir la app, decilo en el PR.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 3 — Campos del summarize, Axton/temporales

```
Mismo pedido que la tanda 2, con el otro lote. Leé specs/vista-estandar-resumen.md (§2, §3, tu
lote en el §4). El tablero y resumenStats ya existen; esta tanda publica campos.

Las cinco entradas:

  agrupadores, novedades_liquidacion, variaciones_sueldos, variaciones_conceptos, pop_variaciones

Lo mismo de la tanda 2, más lo propio de este lote:

1. agrupadores — el puente muestra la diferencia NETA (Nómina − Resumen) y la TOTAL (la que suma
   el semáforo) separadas, como su ficha (D-087). Los conteos y las claves SIEMPRE en legajos,
   nunca en filas de legajo × agrupador: el denominador inflado ya se pagó acá (el semáforo mentía
   en verde). diffSigned queda PENDIENTE DE WILLY (§7.6 de la spec): ¿por legajo con su neta, o
   por agrupador? Hasta que conteste, omitido y anotado. byCause: agrupador.
2. novedades_liquidacion — puente Pedido → Diferencia comparada → Liquidado con las 4 bandas como
   conteos; el legajo del que no se pudo comparar nada cuenta para revisar, nunca aprobado
   (D-073). byCause: concepto; byGroup: UO si viene.
3. Los tres de variaciones — puente temporal: Anterior → Variación → Actual; diffSigned se lee
   "subieron / bajaron". En POP el valor hora sigue fuera de todo total (D-081).
4. Achicá la lista de excepciones del test de CI: estos cinco salen.

Ningún cálculo ni conteo cambia; números antes y después; signo verificado en el módulo antes de
cablear; asserts con Banfield en la cadena; nada de hex; tres temas.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 4 — Los que generan archivo

```
Leé specs/vista-estandar-resumen.md (§2, §3, tu lote en el §4) y D-077/D-078 en DECISIONS.md — la
semántica de estos controles ya está decidida ahí y en lo que Willy haya contestado de las
pendientes de ESTADO.md. El tablero ya existe.

Las cuatro entradas:

  brutos_reporte, gs_pers_reporte, nr_reporte, novedades_importador

Estos no cruzan dos archivos: generan uno. Por eso:
1. El veredicto habla DEL ARCHIVO: qué se generó, con cuántos registros, y si está listo para
   descargar o qué lo frena. Los textos exactos van listados en el PR para que Willy los ajuste
   en pantalla (§7.9 de la spec).
2. Sin escala de severidad en los tres de Marval (unit: null — no hay % que dibujar), sin puente
   de cruce, sin lados ni cortes: summary.resumen es la DECLARACIÓN EXPLÍCITA de que no aplican
   (así el test de CI los reconoce migrados). Cada bloque se omite entero por el criterio del
   mapa, no sale vacío.
3. novedades_importador es el distinto: su puente es "qué entra → qué quedó afuera, con motivo"
   (ya lo calcula), la escala habla de los legajos del archivo y byGroup es la UO.
4. En la grilla de 3b los cuatro entran igual, con su card — verificalo con un run mixto.
5. Achicá la lista de excepciones del test de CI: estos cuatro salen.

Ningún número que hoy se muestre cambia. Nada de hex; tres temas; los cuatro Resumen abiertos.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 5 — Contables + Acreditaciones

```
Leé specs/vista-estandar-resumen.md (§2, §3, tu lote en el §4), D-084/D-085, y D-020/D-021 — los
dos últimos son el corazón de esta tanda. El tablero ya existe.

Las tres entradas:

  finadiet_asiento, conta_desglosada, acreditaciones_reporte

1. Los dos contables: la unidad es la CUENTA y cuadran al centavo. Puente DEBE → HABER →
   descuadre; la escala muestra % de cuentas que no cuadran (unitNames dice "cuentas", no
   "legajos"). diffSigned se lee DEBE > / < HABER. byCause: centro de costo en el Asiento; tipo
   (resultado / patrimonial) en la Desglosada — por rubro no aplica, la unidad ya es la cuenta.
   La cuenta sin código sigue leyéndose «Sin comparar» (D-085). Después de tocar, comprobá que
   las cinco anclas de COTY 05/2026 de specs/conta-desglosada-asiento.md sigan dando igual — si
   una se movió, es un bug de esta tanda.
2. acreditaciones_reporte: la unidad es la LISTA (D-021). Puente Total liquidación → Diferencia →
   Total acreditado; byCause: banco; byGroup: empresa sólo si la config separa por empresa. Y el
   cuidado que manda: EL ARCHIVO DE FINANZAS NO GANA NI UN DATO — el tablero es pantalla del
   analista y el assert de D-020 tiene que seguir en verde. Si te encontrás agregando una columna
   a un export, pará. El aviso de grupo sin fecha queda arriba de las solapas (D-083).
3. Estas unidades no entran a "legajos repetidos" de 3b cruzadas con controles por legajo — no
   inventes una equivalencia.
4. Achicá la lista de excepciones del test de CI: estos tres salen.

Ningún cálculo ni conteo cambia; números antes y después; asserts con datos inventados en la
cadena; nada de hex; tres temas.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 6 — EE x CATEG + Acumuladores

```
Leé specs/vista-estandar-resumen.md (§2, §3, tu lote en el §4), D-082 y D-077. El tablero ya
existe.

Las dos entradas que no cruzan importes:

  cat_x_empleados, acumuladores_ganancias

1. cat_x_empleados (EE x CATEG): compara campos de texto. El puente es de CONTEOS — comparados →
   coinciden → difieren → sin comparar, la misma tira de su ficha (D-082). Sin diffSigned ni
   buckets (no hay signo ni plata). El corte por campo NO se duplica en el tablero: eso ya lo
   contesta su cuarta solapa "Por campo" — el tablero linkea. La escala cuenta legajos, y el que
   está en un archivo y no en el otro no se lee como aprobado.
2. acumuladores_ganancias: control de generación (D-026), sin unidades de cruce. El veredicto y
   el puente hablan de lo único que verifica: la reconciliación del TOTAL del crudo contra sus
   componentes y el SAC teórico (D-077). Sin escala, sin lados, sin cortes — todo declarado.
3. Achicá la lista de excepciones del test de CI a CERO: con esta tanda los 21 están migrados y
   el test pasa a proteger a los controles futuros. Si alguna excepción no puede salir, decí cuál
   y por qué en el PR.

Ningún conteo cambia; números antes y después; nada de hex; tres temas; los dos Resumen abiertos.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```
