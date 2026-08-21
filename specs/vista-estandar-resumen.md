# Vista estándar del Resumen — el veredicto y dónde se concentra, iguales en toda la app

**Estado:** propuesta del 2026-08-21, **pendiente de aprobación de Willy. Nada implementado.** Es el
trabajo que el §2 de `specs/vista-estandar-resultados.md` dejó explícitamente aparte ("Resumen — lo
que ya hay: tiles, casos, chequeos. Willy va a rehacerlo aparte"). Sale del diseño aprobado del
Resumen del Control de Netos (Sportline) y se generaliza a los 21 controles, con el mismo método de
las ocho tandas de Fichas y Planilla (§9 de la spec madre, D-077 a D-088).

> **Nota sobre la fuente (actualizada el 2026-08-21).** El diseño aprobado vive en el proyecto de
> Claude Design del Control de Netos. El zip que Willy subió a esta sesión
> (`Control_Sportline_UI_mockups.zip`) resultó ser **el handoff del Detalle** — las pantallas
> 1a/1b/1c/2a (Fichas y Totales por rubro), ya implementadas en D-076 y las ocho tandas; se
> verificó sobre el canvas que la pantalla del Resumen no está en ese export (snapshot del
> 2026-08-20, anterior a ese turno del diseño). Lo que ese handoff **sí** confirma y esta spec
> hereda: la tira de la ficha tiene **cinco** pasos (neto teórico → explicado → neto esperado →
> neto liquidado ajustado → sin explicar), y los tokens/lenguaje visual (pastillas, pills, bandas)
> ya están en la app. El inventario de bloques del §2 sale de la descripción de Willy: veredicto
> grande, barra de semáforo con umbrales, cascada de composición, de más / de menos con conteo de
> legajos, y concentración por tamaño, por empresa y por rubro. **Para la tanda 1 hace falta el
> export del proyecto de diseño que incluya el turno del Resumen** (o capturas de esa pantalla):
> el prompt de la tanda 1 lo pide antes de dibujar nada.

> Este documento es la referencia del Resumen: cuando un chat toque la solapa Resumen de cualquier
> control, se lee esto primero, después de la spec madre. Si algo acá no coincide con el código,
> gana este documento hasta que Willy diga lo contrario.

---

## 1. Por qué

Las ocho tandas dejaron Fichas y Planilla iguales en los 21 controles; el Resumen quedó como
estaba: el trío genérico `renderVerdict` + `renderTiles` + `renderIssues`, con tiles distintas en
cada control y la lista de casos repetida contra lo que Fichas ya hace mejor. Verificado al
2026-08-21: ninguno de los 17 controles con pantalla tiene nada del diseño nuevo.

El Resumen nuevo contesta otra pregunta que Fichas y Planilla. Fichas dice **por qué** no cierra un
caso; Planilla **compara entre casos**; el Resumen dice **si se libera o no, y dónde mirar
primero**. Por eso sus bloques son de agregado: el veredicto accionable, el semáforo contra su
umbral, la cascada de cómo se compone la diferencia total, para qué lado se va, y dónde se
concentra.

## 2. Los bloques del diseño — cuáles son genéricos y cuáles son de Netos

Seis bloques, con el criterio explícito de a quién le toca cada uno. **Un bloque que no aplica se
omite entero — no sale vacío, ni en cero, ni en gris.** No es un default silencioso: el mapa del §4
declara por qué se omite, control por control, y el test de la pieza lo asegura.

| Bloque | Qué muestra | Criterio de aplicación | Dónde NO aplica |
|---|---|---|---|
| **1. Veredicto accionable** ("No liberar la liquidación") | Una instrucción, no un resumen. El tono sale del semáforo; el texto lo declara el control | **Los 21.** Todos tienen veredicto hoy; cambia que pasa de descriptivo a accionable | En ninguno — pero el texto cambia de familia: un cruce dice liberar/no liberar; un "Generar Reporte" habla del archivo (usalo / no lo uses todavía); Acumuladores, de su reconciliación (D-077) |
| **2. Barra de semáforo con umbrales** | El % de unidades con diferencia sobre el total, contra el umbral del semáforo (hoy 2%, `computeSemaforoStatus`), con las zonas verde/ámbar/rojo | Todo control que publica `unitsTotal`/`unitsWithDiff` — la barra es la visualización del semáforo que el checklist ya calcula, en la unidad que declara `unit` | brutos_reporte, gs_pers_reporte, nr_reporte y Acumuladores: no cuentan unidades de cruce (`unit: null`), no hay % que dibujar. El veredicto carga con todo |
| **3. Cascada de composición** (en Netos: Neto teórico → Explicado por el mes → Sin explicar → Neto liquidado) | Las pastillas de lo teórico a lo que sobra, a nivel control (la suma de toda la corrida) — la versión agregada de la tira que la ficha ya tiene por unidad | Todo control cuyo `run()` ya publica (o puede sumar de lo que ya calcula) los totales de cada paso. La **forma** de la cascada es de cada familia: dos totales cruzados, anterior → actual, DEBE → HABER, conteos | Los cuatro pasos con "Explicado por el mes" son **de Netos** — es el único que explica la brecha con conceptos del mes. El resto usa su forma degenerada (ver §4). En los tres "Generar Reporte" de Marval no hay cascada: no cruzan nada |
| **4. De más / de menos** (con conteo de unidades por lado) | Cuántas unidades tienen diferencia a favor y cuántas en contra, con la suma de cada lado | La diferencia por unidad tiene **signo** — sale de una resta que el control ya guarda por fila | EE x CATEG (campos de texto, no hay signo), los tres "Generar Reporte" de Marval y Acumuladores (no cruzan), Importador de Novedades (sus bandas no son un signo) |
| **5. Concentración por tamaño** | Las diferencias agrupadas en cortes de magnitud (cuántas chicas, cuántas grandes), para distinguir "muchos redondeos" de "tres casos graves" | Hay importe de diferencia por unidad | Los mismos cuatro del bloque 4, más EE x CATEG (su "tamaño" es el conteo de campos, y eso ya lo contesta su solapa "Por campo" — no se duplica) |
| **6. Concentración por dimensión** (por empresa, por rubro) | Dónde se concentra la diferencia: top de grupos por suma y conteo | Cada dimensión se declara por control y **sólo si la trae en sus datos**: empresa donde hay más de una en la corrida; rubro donde el resultado ya desglosa por concepto/agrupador/categoría/banco | "Por empresa" se omite con una sola empresa (casi todos los Meta4). "Por rubro" se omite donde la unidad ya ES el rubro (Asiento y Desglosada: la cuenta) o donde hay un solo importe (Rendimiento x EE) |

**El criterio general, dicho una vez:** los bloques 1 y 2 son la parte fija (como los cinco chips
de la barra); los bloques 3 a 6 se **declaran** con datos que el `run()` del control ya publica. La
pieza nunca deriva un número que el control no verificó: si para armar la cascada falta un
agregado, se suma **en el `run()`** del control a partir de lo que ya tiene, como se hizo en la
tanda 4 de Fichas, y se dice en el PR.

## 3. La pieza compartida — `renderResumenPanel()`

Nueva, en `js/ui/resumenPanel.js`, análoga a `renderFichasPanel()`/`renderPlanillaPanel()`: el
control declara contenido, la pieza pone forma, orden y reglas. Se monta como el callback `resumen`
de `renderResumenDetalle()`, que ya captura el monto de diferencia de la corrida (D-069) — la pieza
no maneja tolerancia por su cuenta.

### Qué declara el control

```js
renderResumenPanel(host, {
  // ── Bloques 1 y 2 — la parte fija ──
  unitLabel,                    // 'legajo' | 'centro de costo' | 'cuenta' | 'lista' — la unidad del §8
  unitsTotal, unitsWithDiff,    // LOS DEL SUMMARY, tal cual — la pieza no los recuenta
  status,                       // el crudo del summary: SOLO para cortocircuitar en 'error' (la corrida falló)
  veredicto: {                  // los textos; el tono NO se declara: sale del semáforo
    siCierra:   { title, body },
    siNoCierra: { title, body },
    accion,                     // la instrucción: 'No liberar la liquidación' / 'El archivo está listo para descargar'
  },

  // ── Bloques 3 a 6 — declarativos, cada uno opcional y omitido si no viene ──
  cascada,          // [{ label, value, tipo?: 'invertida'|'residuo' }] — números del run(), regla D-086
  unidadesConDif,   // [{ id, label, diff, dims: { empresa?, rubro?, ... } }] — la lista YA FILTRADA
                    // por el control con su propio criterio y su tolerancia. La pieza sólo agrupa
                    // y suma: nunca decide quién tiene diferencia. diff con signo alimenta el
                    // bloque 4; |diff| el 5; dims el 6.
  concentraciones,  // [{ id, label }] — qué claves de dims se muestran y con qué rótulo, en orden
  chequeos,         // los de renderChecks() de hoy, que siguen al pie (ver §5)
});
```

### Qué hereda

- **El color del semáforo sale de `computeSemaforoStatus(unitsWithDiff, unitsTotal)` adentro de la
  pieza — nunca de `summary.status`.** Es la regla que ya mordió cuatro pantallas; acá se cumple
  por construcción, porque el control no puede pasar un tono. El status crudo entra sólo para el
  cortocircuito en `'error'`.
- **La barra de umbrales usa el mismo umbral que el checklist** (`semaforoThresholdPct`): si un día
  cambia, cambia en los dos lados a la vez. La barra y el color de la tarjeta del checklist no
  pueden decir cosas distintas del mismo run.
- El conteo del bloque 4 más el de "sin signo" tiene que dar `unitsWithDiff`; el test de la pieza
  lo asegura. Si `unidadesConDif.length` no coincide con `unitsWithDiff`, la pieza avisa en
  pantalla en vez de mostrar dos números que se contradicen — la misma filosofía de D-036: lo que
  no cierra se dice, no se tapa.
- Tokens de `css/tokens.css` (nada de hex), modo oscuro, `esc()` sobre todo lo interpolado,
  formato de moneda de `js/utils/currency.js`.
- La regla de omisión: bloque sin datos, bloque que no existe en el DOM.

### Reglas que no se negocian (las que ya mordieron)

1. **Ningún cálculo ni conteo cambia.** `unitsTotal`/`unitsWithDiff` se siguen contando en la
   unidad que declara `unit`; cada tanda anota los números de cada control antes y los comprueba
   después. El único código nuevo permitido en un control es un **agregado en su `run()`** derivado
   de lo que ya calcula (para las pastillas de la cascada), dicho en el PR.
2. **La cascada no resta dos totales cuando un lado puede no traer dato** (D-086): suma sólo lo que
   los dos lados tienen ("Diferencia comparada"), los totales de arriba quedan los de cada archivo
   tal cual, y lo sin comparar se dice aparte con su importe y su lado.
3. **`null` no es `0`**: una pastilla sin dato no se dibuja como $ 0,00 — o el control la resuelve
   en su `run()` o la cascada entera se omite.
4. **Nada del Resumen agrega columnas a ningún export.** El Resumen es pantalla del analista; en
   Acreditaciones el archivo de Finanzas no gana ni un dato (D-020, ya escrito como assert).

## 4. El mapa — control por control

La unidad y las notas vienen del §8 de la spec madre; qué datos publica cada control se relevó
sobre el código al 2026-08-21. **B** = barra de semáforo · **C** = cascada · **L** = de más/de
menos · **T** = por tamaño · las dimensiones del bloque 6 se nombran.

| Control | B | C — la forma | L | T | Dimensiones | Nota |
|---|---|---|---|---|---|---|
| **Control de Netos** | sí | **la del diseño**: Neto teórico → Explicado por el mes → Sin explicar → Neto liquidado | sí | sí | **empresa** (1-3 Tabulados), **rubro** | el piloto; el agregado de la cascada se suma en el `run()` desde `explicado`/`residuo` por legajo, que ya existen |
| Brutos — Controlar | sí | Total Tabulado → Diferencia comparada → Total Reporte | sí | sí | rubro (SAL_BASE, A_CTA_FUT_AUMEN) | dos conceptos: el bloque de rubro es chico pero contesta cuál de los dos se movió |
| GS Pers — Controlar | sí | ídem Brutos | sí | sí | rubro (GTOS_PERSONALES, DTO_COCHERA) | ídem |
| Control NR — Controlar | sí | Total Reporte NR ↔ Diferencia comparada ↔ Total Tabulado — **el caso que motivó D-086**, con lo sin comparar dicho aparte | sí | sí | rubro (18 conceptos, o las 2 bandas Indemnizatorios / Otros NR) | si 18 renglones son pared, el corte por banda es la salida — a decidir en pantalla |
| Rendimiento vs Tabulado | sí (unidad: **CC**) | Total Rendimiento → Diferencia comparada → Total Tabulado | sí | sí | rubro (las 5 categorías) | los conteos en centros de costo, no en legajos |
| Rendimiento vs Asiento | sí (unidad: **CC**) | ídem, contra el asiento | sí | sí | rubro (las 5 categorías) | ídem |
| Rendimiento x EE | sí | Total Rendimiento → Diferencia → Total Tabulado | sí | sí | — | un solo importe (COSTO TOTAL): no hay rubro que abrir |
| Cruce por Agrupadores | sí (en **legajos**, D-087) | Nómina Maestra → Diferencia → Resumen, con la **neta** y la **total** separadas como en su ficha | sí | sí (sobre la total) | rubro (agrupador) | el denominador inflado ya se pagó acá: nada se cuenta por fila legajo × agrupador. De más/de menos: ver §7 |
| Novedades vs Liquidación | sí | Pedido (importador) → Diferencia comparada → Liquidado, con las 4 bandas como conteos (D-073) | sí | sí | rubro (concepto) | el legajo sin nada comparable sigue contando para revisar, nunca aprobado |
| Variación Sueldos | sí | **temporal**: Anterior → Variación → Actual | sí ("subieron / bajaron") | sí | rubro (jornales / mensuales) | |
| Variación Conceptos | sí | temporal, ídem | sí | sí | rubro (concepto) | |
| Variación entre quincenas (POP) | sí | temporal, ídem | sí | sí | — | el valor hora sigue fuera de todo total (D-081) |
| EE x CATEG | sí | **conteos, no importes**: comparados → coinciden → difieren → sin comparar (la misma tira de su ficha, D-082) | no (sin signo) | no | — | "dónde se concentra por campo" ya lo contesta su solapa "Por campo": no se duplica en el Resumen, se linkea |
| Acumuladores Ganancias | no (`unit: null`) | la reconciliación de D-077: TOTAL del crudo → componentes → cierra / no cierra | no | no | — | control de generación: el veredicto habla de la reconciliación y del SAC teórico |
| Asiento de Remuneraciones | sí (unidad: **cuenta**) | DEBE → HABER → descuadre | sí (DEBE > / < HABER) | sí | centro de costo | cuadra al centavo: la barra muestra % de cuentas que no cuadran, sin zona de margen (como su chip, D-078/tanda 3) |
| Contabilidad Desglosada + Asiento | sí (unidad: **cuenta**) | DEBE → HABER → descuadre | sí | sí | tipo (resultado / patrimonial) | la cuenta sin código sigue en «Sin comparar» (D-085); "por rubro" no aplica: la unidad ya es la cuenta |
| Acreditaciones | sí (unidad: **lista**, D-021) | Total liquidación → Diferencia → Total acreditado | sí | sí | **empresa** (si la config separa por empresa), banco | pantalla del analista; el archivo de Finanzas no gana nada (D-020). El aviso de grupo sin fecha queda arriba de las solapas (D-083) |
| Brutos — Generar Reporte | no | no (no cruza) | no | no | — | veredicto sobre el archivo generado + sus chequeos; los chips ya salen grises (D-078) |
| GS Pers — Generar Reporte | no | no | no | no | — | ídem |
| Control NR — Generar Reporte | no | no | no | no | — | ídem |
| Importador de Novedades | sí (legajos del archivo) | qué entra → qué quedó afuera, con motivo (ya lo calcula) | no | no | UO | su Resumen ya es "qué entra y qué no": se le da la forma nueva sin inventarle un cruce que no tiene |

**Dónde queda pendiente verificar el signo:** el mapa asume que la diferencia por fila conserva el
signo de la resta en todos los marcados con L. Cada tanda lo comprueba en el módulo antes de
cablear el bloque 4; si algún control guarda sólo el valor absoluto, el bloque se omite en ese
control y se anota acá — no se recalcula la resta en la pieza.

## 5. Qué pasa con lo que hoy vive en el Resumen

Hoy el Resumen de cada control es tiles + casos + chequeos. Propuesta, a confirmar por Willy en
pantalla (§7):

- **La lista de casos (`renderIssues`) se jubila del Resumen.** Es lo que Fichas ya hace mejor, y
  tenerla dos veces es la clase de duplicación que la vista estándar vino a matar. En su lugar, los
  bloques de concentración llevan al analista a Fichas (idealmente filtradas — §7, punto 4).
- **Los chequeos de coherencia (`renderChecks`) quedan**, al pie del Resumen, como están: son otra
  cosa que la diferencia (validan que la corrida esté bien armada) y no tienen otro lugar.
- **Las observaciones menores (`renderMinorObservations`) quedan** junto a los chequeos.
- **Las tiles genéricas mueren** (sus números viven ahora en la barra de semáforo y la cascada).
  Las tiles **propias** de cada control que no son diferencia —el tope de aportes de Netos, los
  jubilados sin confirmar, el régimen de Acumuladores— no desaparecen: bajan a chequeos o a una
  línea de contexto, control por control, en su tanda. Ninguna se pierde sin decirlo en el PR.
- `renderVerdict`/`renderTiles`/`renderIssues` **no se borran de `resultBlocks.js`** mientras algún
  control no migrado los use; se jubilan al final, como pasó con las barras propias.

## 6. Orden de tandas

Mismo método que el §9 de la spec madre: tanda 1 construye la pieza con un piloto verificable en
navegador; el resto corre en paralelo sin pisarse (lotes sin archivos de control compartidos), y lo
que una tanda decide sin Willy queda marcado en su entrada de DECISIONS. **El prompt de cada tanda,
listo para copiar, con el modelo y el esfuerzo por chat, está en
`docs/prompts-vista-estandar-resumen.md`.**

1. **Pieza + piloto Netos.** `js/ui/resumenPanel.js`, los tokens/CSS que falten, y el Control de
   Netos migrado de punta a punta — es el que tiene el diseño aprobado y el único con los seis
   bloques completos (cascada de cuatro pasos, empresa real). Abrir el artifact del diseño es el
   primer paso de esta tanda (nota del encabezado). **Todo lo demás depende de ésta.**
2. **Cruce Meta4/Marval** (6): brutos, gs_pers, nr, rend_vs_tabu, rend_x_ee, rend_vs_asiento.
   Cascada de dos totales con D-086, lados, tamaño, rubro.
3. **Cruce y temporales Axton/general** (5): agrupadores, novedades_liquidacion,
   variaciones_sueldos, variaciones_conceptos, pop_variaciones. Trae las dos formas que la tanda 2
   no tiene: la cascada temporal y la doble diferencia de Agrupadores (D-087).
4. **Los que generan archivo** (4): brutos_reporte, gs_pers_reporte, nr_reporte,
   novedades_importador. Veredicto sobre el archivo, sin bloques de cruce; la semántica es la de
   D-077/D-078 y lo que Willy conteste al verlas (hoy pendiente en ESTADO).
5. **Al centavo y unidades contables/lista** (3): finadiet_asiento, conta_desglosada,
   acreditaciones_reporte. DEBE/HABER, D-084/D-085, y D-020/D-021 intocables.
6. **Los dos sin cruce de importes** (2): cat_x_empleados (conteos, sin duplicar "Por campo"),
   acumuladores_ganancias (reconciliación D-077).

Las tandas 2 a 6 dependen sólo de la 1 y no comparten módulos entre sí — pueden correr en paralelo,
con la lección de D-088 aprendida: si dos necesitan un helper nuevo en una pieza compartida, se
declara en el PR para unificar al integrar.

## 7. Lo que queda pendiente de que Willy lo mire — no se adivina

1. **El diseño del Resumen contra este documento.** El zip subido es el handoff del Detalle y no
   trae esa pantalla (ver la nota del encabezado): falta el export del proyecto de diseño con el
   turno del Resumen, o capturas. Con eso, confirmar que los seis bloques del §2 son todos los del
   diseño y que la cascada del Resumen es la de cuatro pasos (la de la ficha tiene cinco, con
   "neto esperado" en el medio — confirmado en el handoff del Detalle: hay que saber cuál va a
   nivel control).
2. **El destino de lo que hoy está en el Resumen** (§5): si la lista de casos muere a favor de
   Fichas, y dónde aterrizan las tiles propias de cada control.
3. **Los textos del veredicto accionable por familia**: qué dice exactamente un cruce que cierra
   ("Liberar"?), uno que no, un "Generar Reporte", y los dos al centavo. Es texto de UI: se decide
   viéndolo.
4. **Si los bloques de concentración clickean**: tocar "de más" o una empresa ¿lleva a Fichas con
   ese filtro puesto, o son informativos? Cambia el alcance de la tanda 1 (hoy Fichas no recibe un
   filtro desde afuera).
5. **Los cortes del bloque por tamaño** (¿cuáles buckets?) y el N del top de concentraciones.
6. **La barra de umbrales**: ¿muestra el número del umbral (hoy 2% global, `semaforoThresholdPct`)?
   ¿Willy quiere poder moverlo por cliente, como el monto de diferencia (D-069)? Eso sería un
   frente aparte, no entra en estas tandas.
7. **Agrupadores, bloque de lados**: ¿de más/de menos se cuenta por legajo con su neta (un legajo
   compensado no aparece en ningún lado) o por agrupador (aparece en los dos)? Es la misma tensión
   que D-087 resolvió para el número grande de la ficha; acá falta decidirla.
8. **Las pendientes que ya esperan en ESTADO** sobre los "Generar Reporte" (D-077/D-078): lo que
   Willy conteste ahí define el veredicto de la tanda 4.

## 8. Que salga por defecto en todo control nuevo — y cómo se asegura

El pedido de Willy: que esto no haya que acordarse de ponerlo — que cualquier control que se genere
de acá en más lo traiga solo. Son tres candados, del más blando al más duro:

1. **La pieza única.** Un control nuevo no escribe su Resumen: declara los datos (§3) y
   `renderResumenPanel()` pone la forma. No existe otra manera de armar la solapa — igual que hoy
   nadie escribe su propia barra de chips. Lo viejo (`renderTiles` para armar un Resumen a mano) se
   jubila al final de las tandas, así que ni siquiera queda el camino para hacerlo distinto.
2. **La receta.** La skill `.claude/skills/nuevo-control/` —los 5 puntos de integración que se usan
   cada vez que Willy pide "agregá el control X"— gana el **6º punto**: declarar el Resumen
   (veredicto, cascada, unidades con diferencia y sus dimensiones). Como todo control nuevo nace
   por esa receta, ninguno nace sin esto. Lo actualiza la tanda 1, junto con la pieza.
3. **El candado de CI.** Un test **en la cadena de `package.json`** recorre el `CONTROL_REGISTRY` y
   falla si un control con pantalla no pasa por `renderResumenPanel()` (con la lista de excepciones
   declarada y vacía al terminar las tandas). Es el mismo patrón del chequeo de datos sensibles: si
   alguien —incluido un chat futuro— se olvida, **el PR sale en rojo**, no depende de memoria.
   El mecanismo exacto (inspección de los módulos del registry desde node, como hace
   `check-datos-sensibles.mjs`) lo define la tanda 1.

## 9. Cómo se verifica

- **El piloto contra el diseño aprobado**, bloque por bloque, en el navegador y en los tres temas.
- **Los números de antes y después, por control**: el veredicto, el % del semáforo y todos los
  conteos idénticos a los de la pantalla vieja. Si uno se movió, es un bug de esa tanda.
- **La barra de semáforo contra la tarjeta del checklist**: mismo run, mismo color, en los cuatro
  lugares que pintan estado (checklist, wizard, resultados, lista de clientes).
- **El conteo de lados suma `unitsWithDiff`** — escrito como assert en el test de la pieza, con
  datos inventados y jugadores de Banfield, y el archivo **en la cadena de `package.json`**.
- **Ningún export cambia ni una columna** — en Acreditaciones, el assert de D-020 sigue en verde.
- Cada bloque omitido, omitido **por el criterio del mapa** y no por un dato que faltó en silencio:
  si el control debía traer el dato y no vino, la pieza lo dice en pantalla.
