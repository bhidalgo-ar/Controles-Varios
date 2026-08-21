# Prompts de arranque — Vista estándar del Resumen

> Seis chats de Claude Code sobre este repo. Cada uno abre rama propia (`feat/…`) y termina en PR
> contra `main`. La spec madre de este frente es **`specs/vista-estandar-resumen.md`**; leerla es lo
> primero que pide cada prompt (y detrás de ella, `specs/vista-estandar-resultados.md`).
>
> **Nada de esto está implementado al 2026-08-21.** La tanda 1 construye la pieza que usan todas
> las demás; las tandas 2 a 6 corren en paralelo entre sí, sin archivos de control compartidos.
>
> **Antes de abrir el chat 1, Willy tiene que pasarle el diseño del Resumen** (el export del
> proyecto de Claude Design con ese turno, o capturas de esa pantalla). El zip
> `Control_Sportline_UI_mockups.zip` es el handoff del Detalle y NO la trae — ya está verificado.

## Modelo y esfuerzo por chat

Elegilos con `/model` antes de mandar el prompt.

| Orden | Chat | Modelo | Esfuerzo / thinking | Por qué |
|---|---|---|---|---|
| 1 | Pieza + piloto Netos | **Opus 5** | **high** · thinking prendido | Define el molde de 21 pantallas y el candado de CI: un error acá se multiplica por 21. Si se traba, subir a xhigh |
| 2 | Cruce Meta4/Marval (6 controles) | **Sonnet 5** | **high** · thinking prendido | Mecánico pero no puede mover ningún conteo, y la cascada de dos totales arrastra la regla D-086 |
| 3 | Cruce y temporales Axton/general (5) | **Opus 5** | **high** · thinking prendido | Agrupadores trae la doble diferencia de D-087 y Novedades vs Liquidación el D-073: criterio fino |
| 4 | Los que generan archivo (4) | **Sonnet 5** | **high** · thinking prendido | La semántica ya está decidida en D-077/D-078; es aplicar, no decidir |
| 5 | Contables + Acreditaciones (3) | **Opus 5** | **high** · thinking prendido | Toca el asiento, que sale al cliente, y D-020/D-021 no se pueden pisar |
| 6 | EE x CATEG + Acumuladores (2) | **Sonnet 5** | **high** · thinking prendido | Conteos y una reconciliación ya definida (D-077, D-082) |

**Dependencias.** Los chats 2 a 6, todos después del 1; entre ellos no se pisan (lotes sin módulos
compartidos). Si dos necesitan un helper nuevo en una pieza compartida, se declara en el PR para
unificar al integrar — la lección de D-088.

## Lo que todo chat tiene que hacer en este contenedor

- `npm run hooks:install` — el contenedor de una sesión remota es nuevo y el chequeo de datos
  sensibles no está activo hasta que se instale.
- Para abrir la app: el entorno remoto bloquea `unpkg.com` y `cdn.sheetjs.com`. Se resuelve con
  `npm i --no-save dexie@4` y apuntando esos `<script>` de `index.html` a `node_modules/`.
  **Es un parche local que no se commitea.**

---

## Chat 1 — La pieza + el piloto (Control de Netos)

```
Leé specs/vista-estandar-resumen.md COMPLETO antes de escribir nada — es la spec de este frente —,
el §7 de specs/vista-estandar-resultados.md (las piezas compartidas que ya existen), y de CLAUDE.md
las secciones de Código y de Tests y CI.

Vas a necesitar el diseño aprobado del Resumen de Netos: el veredicto grande ("No liberar la
liquidación"), la barra de semáforo con umbrales, la cascada de composición, el desglose de más /
de menos y los bloques de concentración. Willy te lo pega en este chat (export del proyecto de
diseño o capturas). SI NO LO TENÉS, PEDILO ANTES DE DIBUJAR NADA: el zip del Detalle no lo trae, y
el piloto se verifica contra ese diseño bloque por bloque.

Quiero dos cosas: la pieza compartida del Resumen, y el Control de Netos migrado a ella de punta a
punta, para verlo en el navegador.

1. js/ui/resumenPanel.js (nuevo) — renderResumenPanel(), con el contrato del §3 de la spec:
   - Bloques fijos: el veredicto accionable (textos del control, tono del semáforo) y la barra de
     semáforo con umbrales. EL COLOR SALE DE computeSemaforoStatus(unitsWithDiff, unitsTotal)
     ADENTRO DE LA PIEZA — el control no puede pasar un tono. El status crudo del summary entra
     sólo para cortocircuitar en 'error' (la corrida falló). El umbral es el mismo del checklist
     (semaforoThresholdPct): la barra y la tarjeta del checklist no pueden decir cosas distintas
     del mismo run.
   - Bloques declarativos, cada uno opcional y OMITIDO ENTERO si no viene (ni vacío, ni en cero,
     ni en gris): cascada (pastillas con números del run(), regla D-086: nunca la resta de dos
     totales cuando un lado puede faltar), unidadesConDif (la lista YA FILTRADA por el control —
     la pieza sólo agrupa y suma, nunca decide quién tiene diferencia), de más / de menos (del
     signo de diff), por tamaño (de |diff|), concentraciones por dimensión (de dims), y los
     chequeos de renderChecks() al pie.
   - Assert en la pieza: el conteo de lados suma unitsWithDiff. Si unidadesConDif.length no
     coincide con unitsWithDiff, se avisa en pantalla — no se muestran dos números que se
     contradicen (filosofía D-036).
2. El piloto: el Resumen de Netos pasa a la pieza. El agregado de la cascada se suma en el run()
   desde explicado/residuo por legajo, que ya existen — decilo en el PR. Dimensiones: empresa
   (1 a 3 Tabulados) y rubro. Según el §5 de la spec: la lista de "Legajos para revisar" se jubila
   (eso ya lo hace Fichas), los chequeos quedan al pie, y las tiles propias (tope de aportes,
   jubilados sin confirmar) bajan a chequeos — ninguna se pierde sin decirlo en el PR.
3. Los dos candados del §8 de la spec:
   - El 6º punto de integración en .claude/skills/nuevo-control/: declarar el Resumen.
   - El test de CI que recorre el CONTROL_REGISTRY y falla si un control con pantalla no pasa por
     renderResumenPanel(), con la lista de excepciones declarada (los 20 que todavía no migraron
     arrancan ahí, y cada tanda la achica). Patrón de check-datos-sensibles.mjs. EN LA CADENA de
     package.json.

Reglas que no se negocian:
- Ningún cálculo ni conteo cambia. unitsTotal/unitsWithDiff se siguen contando en la unidad que
  declara `unit`. Anotá los números que muestra Netos hoy y comprobá que salgan iguales.
- null no es 0: una pastilla sin dato no se dibuja como $ 0,00.
- Nada del Resumen agrega columnas a ningún export.
- Nada de hex en los módulos: tokens de css/tokens.css, comprobado en los tres temas.
- Tests con datos inventados y jugadores de Banfield, en la cadena de package.json.
- Abrí la app y sacá capturas del Resumen de Netos en los tres temas, contra el diseño. Si el CDN
  bloqueado no te deja, decilo en el PR en vez de dar por bueno lo que no viste.

Del §7 de la spec, tres decisiones que se toman en esta tanda SI EL DISEÑO LAS CONTESTA (y si no,
se preguntan acá antes de seguir): cuántos pasos tiene la cascada a nivel control (¿cuatro, o los
cinco de la ficha?), los cortes del bloque por tamaño, y si los bloques de concentración clickean
hacia Fichas filtradas (si clickean, decilo en el PR: Fichas hoy no recibe un filtro desde afuera).

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (pasale el diff al agente
documentalista antes de mergear) — y el PR NO se mergea sin que Willy vea el piloto.
```

## Chat 2 — Cruce Meta4/Marval

```
Leé specs/vista-estandar-resumen.md (§2, §3 y tu lote en el mapa del §4) y mirá cómo quedó el
Resumen de Netos en la tanda 1: es el modelo. La pieza es js/ui/resumenPanel.js — no escribas otra.

Quiero el Resumen estándar en estas seis entradas del registry:

  brutos, gs_pers, nr, rend_vs_tabu, rend_x_ee, rend_vs_asiento

Por control, según su fila del §4:
1. Veredicto accionable + barra de semáforo — en rend_vs_tabu y rend_vs_asiento la unidad es el
   CENTRO DE COSTO, no el legajo: la barra habla de CCs.
2. Cascada de dos totales: Total de un lado → Diferencia comparada → Total del otro. EN NR ES EL
   CASO QUE MOTIVÓ D-086: el reporte y el Tabulado pueden no traer el mismo concepto, así que la
   diferencia suma sólo lo que los dos lados tienen, los totales quedan los de cada archivo tal
   cual, y lo sin comparar se dice aparte con su importe y su lado. Si falta un agregado, se suma
   en el run() desde lo que ya calcula — decilo en el PR.
3. De más / de menos y por tamaño: antes de cablearlos, COMPROBÁ EN EL MÓDULO que la diferencia
   por fila conserva el signo de la resta. Si un control guarda sólo el valor absoluto, el bloque
   se omite en ese control y se anota en el §4 — no recalcules la resta en la pieza.
4. Dimensiones: rubro (los 2 conceptos en Brutos y GS Pers; los 18 o las 2 bandas en NR — arrancá
   por banda, que 18 renglones son pared, y decilo en el PR para que Willy elija en pantalla; las
   5 categorías en los dos Rendimiento vs). Rendimiento x EE no lleva rubro: un solo importe.
5. Según el §5: issues jubilados, chequeos al pie, tiles propias a chequeos. Y achicá la lista de
   excepciones del test de CI de la tanda 1: estos seis salen de ahí.

Ningún cálculo cambia, ningún conteo cambia. Anotá los números de cada control antes y comprobalos
después; si uno se movió, pará: es un bug. Nada de hex; los tres temas; abrí las seis pantallas —
si el CDN bloqueado no te deja, decilo en el PR.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 3 — Cruce y temporales, lote Axton/general

```
Mismo pedido que la tanda 2, con el otro lote. Leé specs/vista-estandar-resumen.md (§2, §3 y tu
lote en el §4) y mirá el Resumen de Netos de la tanda 1. La pieza es js/ui/resumenPanel.js.

Las cinco entradas:

  agrupadores, novedades_liquidacion, variaciones_sueldos, variaciones_conceptos, pop_variaciones

Lo mismo de la tanda 2, más lo propio de este lote:

1. agrupadores — la cascada muestra la diferencia NETA (Nómina − Resumen) y la TOTAL (la que suma
   el semáforo) separadas, como su ficha (D-087). La barra de semáforo cuenta LEGAJOS, nunca filas
   de legajo × agrupador: el denominador inflado ya se pagó acá (el semáforo mentía en verde).
   El bloque de más / de menos queda PENDIENTE DE WILLY (§7 punto 7 de la spec): ¿por legajo con
   su neta, o por agrupador? Hasta que conteste, no lo cablees — dejalo omitido y anotado.
2. novedades_liquidacion — la cascada es Pedido (importador) → Diferencia comparada → Liquidado,
   con las 4 bandas como conteos. El legajo del que no se pudo comparar nada cuenta para revisar,
   nunca aprobado (D-073).
3. Los tres de variaciones (variaciones_sueldos, variaciones_conceptos, pop_variaciones) — la
   cascada es temporal: Anterior → Variación → Actual. De más / de menos se lee "subieron /
   bajaron". En POP el valor hora sigue fuera de todo total (D-081).
4. Achicá la lista de excepciones del test de CI: estos cinco salen.

Ningún cálculo ni conteo cambia; números antes y después; signo verificado en el módulo antes de
cablear lados; nada de hex; tres temas; las cinco pantallas abiertas.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 4 — Los que generan archivo

```
Leé specs/vista-estandar-resumen.md (§2, §3, tu lote en el §4) y D-077/D-078 en DECISIONS.md — la
semántica de estos controles ya está decidida ahí y en lo que Willy haya contestado de las
pendientes de ESTADO.md. La pieza es js/ui/resumenPanel.js.

Las cuatro entradas:

  brutos_reporte, gs_pers_reporte, nr_reporte, novedades_importador

Estos no cruzan dos archivos: generan uno. Por eso:
1. El veredicto habla DEL ARCHIVO, no de liberar una liquidación: qué se generó, con cuántos
   registros, y si está listo para descargar o qué lo frena. El texto exacto por control queda
   listado en el PR para que Willy lo ajuste en pantalla.
2. Sin barra de semáforo en los tres de Marval (no cuentan unidades de cruce, unit: null), sin
   cascada de cruce, sin lados, sin concentraciones. El bloque se omite entero por el criterio del
   mapa — no sale vacío. Los chequeos de coherencia quedan al pie, como siempre.
3. novedades_importador es el distinto: su Resumen ya es "qué entra y qué quedó afuera, con
   motivo". Eso toma la forma de la cascada (qué entra → qué quedó afuera) y la barra habla de los
   legajos del archivo; el cruce opcional contra el importador ya armado sigue mostrando lo suyo.
4. Achicá la lista de excepciones del test de CI: estos cuatro salen.

Ningún número que hoy se muestre cambia. Nada de hex; tres temas; las cuatro pantallas abiertas.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 5 — Contables + Acreditaciones

```
Leé specs/vista-estandar-resumen.md (§2, §3, tu lote en el §4), D-084/D-085, y D-020/D-021 — los
dos últimos son el corazón de esta tanda. La pieza es js/ui/resumenPanel.js.

Las tres entradas:

  finadiet_asiento, conta_desglosada, acreditaciones_reporte

1. Los dos contables: la unidad es la CUENTA y cuadran al centavo. La cascada es DEBE → HABER →
   descuadre; la barra muestra % de cuentas que no cuadran, sin zona de margen (como su chip,
   D-078). De más / de menos se lee DEBE > / < HABER. Dimensiones: centro de costo en el Asiento;
   tipo (resultado / patrimonial) en la Desglosada — "por rubro" no aplica: la unidad ya es la
   cuenta. La cuenta sin código sigue leyéndose «Sin comparar» (D-085). Después de tocar la
   pantalla, comprobá que las cinco anclas de COTY 05/2026 de specs/conta-desglosada-asiento.md
   sigan dando igual — si una se movió, es un bug de esta tanda.
2. acreditaciones_reporte: la unidad es la LISTA (D-021). Cascada Total liquidación → Diferencia →
   Total acreditado; dimensiones: banco, y empresa sólo si la config separa por empresa. Y el
   cuidado que manda: EL ARCHIVO DE FINANZAS NO GANA NI UN DATO — el Resumen es pantalla del
   analista y el assert de D-020 tiene que seguir en verde. Si te encontrás agregando una columna
   a un export, pará. El aviso de grupo sin fecha queda arriba de las solapas (D-083).
3. Achicá la lista de excepciones del test de CI: estos tres salen.

Ningún cálculo ni conteo cambia; números antes y después; nada de hex; tres temas; las tres
pantallas abiertas.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```

## Chat 6 — EE x CATEG + Acumuladores

```
Leé specs/vista-estandar-resumen.md (§2, §3, tu lote en el §4), D-082 y D-077. La pieza es
js/ui/resumenPanel.js.

Las dos entradas que no cruzan importes:

  cat_x_empleados, acumuladores_ganancias

1. cat_x_empleados (EE x CATEG): compara campos de texto. La cascada es de CONTEOS — comparados →
   coinciden → difieren → sin comparar, la misma tira de su ficha (D-082). Sin lados (no hay
   signo) y sin por tamaño. "Dónde se concentra por campo" NO se duplica en el Resumen: eso ya lo
   contesta su cuarta solapa "Por campo" — el Resumen la linkea. La barra de semáforo cuenta
   legajos, y el que está en un archivo y no en el otro no se lee como aprobado.
2. acumuladores_ganancias: control de generación (D-026), sin unidades de cruce. El veredicto y la
   cascada hablan de lo único que verifica: la reconciliación del TOTAL del crudo contra sus
   componentes y el SAC teórico (D-077). Sin barra, sin lados, sin concentraciones.
3. Achicá la lista de excepciones del test de CI a CERO: con esta tanda los 21 están migrados, y
   el test pasa a proteger a los controles futuros. Si alguna excepción no puede salir, decí cuál
   y por qué en el PR.

Ningún conteo cambia; números antes y después; nada de hex; tres temas; las dos pantallas
abiertas.

Empezá corriendo npm run hooks:install. Terminá en PR con la doc al día (documentalista).
```
