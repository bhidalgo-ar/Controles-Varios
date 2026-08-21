# Orquestador — Vista estándar (8 tandas)

Prompts verbatim: `docs/prompts-vista-estandar.md` en main. Copias locales: tanda1.txt .. tanda8.txt
Preámbulo de ejecución: preamble.txt (reemplazar __BRANCH__ y __BASE__).

Repo: https://github.com/bhidalgo-ar/Controles-Varios   env: env_01HTdEJ9dpkcoEB3xTuPtx4p

## Olas

| Ola | Tandas | Modelo | Base | Arranca cuando |
|---|---|---|---|---|
| A | 1 | claude-opus-5 | main | ya (20:58 UTC 2026-08-20) |
| B | 2, 3 | claude-opus-5 | feat/vista-estandar-cimientos | la rama de la tanda 1 esté pusheada con PR |
| C | 4, 5, 6, 7, 8 | claude-opus-5 | feat/vista-estandar-cimientos | la ola B tenga sus dos PRs abiertos |

Ramas: feat/vista-estandar-cimientos, -barra-meta4, -barra-axton, -fichas-legajo-concepto,
-fichas-agrupador-cc, -ee-categ, -fichas-cuenta, -acreditaciones

Netos: lo abre Willy aparte. El orquestador no lo lanza.

**Todas las tandas van con `claude-opus-5` y esfuerzo alto**, también las que la doc original
asignaba a Sonnet (2, 3, 6, 8). Decisión de Willy: prioridad a no fallar por sobre el costo. El
esfuerzo alto no es un parámetro de `create_session`, así que viaja como `append_system_prompt`
(ver abajo) y hay que incluirlo en cada lanzamiento.

## append_system_prompt de cada tanda

    Trabajás sin nadie que revise en el momento, y un error acá se multiplica por 21 pantallas.
    Pensá cada paso con el máximo esfuerzo: razoná en extenso antes de tocar un archivo, verificá
    cada supuesto contra el código real en vez de deducirlo, y corré los tests antes de dar
    cualquier cosa por hecha. Preferí demorar más y entregar bien: nadie te está esperando.

## Estado

- tanda1 — session_01DeaMD6Trremoe2iUhszYiy — LANZADA 2026-08-20 20:58Z
- tanda2..8 — pendientes

## Cómo se despierta el orquestador

Dos mecanismos, a propósito:

- **`send_later`, de un disparo**, que cada chequeo vuelve a agendar a ~40 min. Es el que da la
  cadencia fina.
- **Rutina recurrente `trig_01GN8sMAAQtvPrx5exAQ9tWn`**, cada hora al minuto 23, como red de
  seguridad: si un chequeo falla y no re-agenda el `send_later`, la cadena sigue igual. El mínimo
  que admite una rutina es horario, por eso no reemplaza al `send_later`.

Cuando las 8 tandas tengan su PR abierto, hay que **borrar la rutina recurrente** (se auto-expira
a los 7 días de todos modos).

## Qué hace el chequeo (cada ~40 min)

1. `git ls-remote --heads origin` y `list_pull_requests` para ver qué ramas/PRs existen.
2. Si la ola anterior está completa, lanzar la siguiente con create_session
   (source_revision = feat/vista-estandar-cimientos, outcome_branch = la rama de la tanda).
3. Actualizar este archivo y re-agendar con send_later.
4. Nada de mergear. Nada de avisar a Willy salvo que una tanda esté trabada de verdad.

---

## Cierre — las 8 tandas terminadas (2026-08-21 01:35Z)

Las ocho corrieron. Siete PRs en borrador, CI verde en todos, **ninguno mergeado** (la tanda 1 es la
excepción: mergeó sola su #180 antes de que la prohibición se reforzara).

| Tanda | PR | Rama | Base real |
|---|---|---|---|
| 1 | #180 (MERGEADO) | feat/vista-estandar-cimientos | main |
| 2 | #181 | feat/vista-estandar-barra-meta4 | main |
| 3 | #182 | feat/vista-estandar-barra-axton | main |
| 4 | #186 | feat/vista-estandar-fichas-legajo-concepto | main |
| 5 | #187 | feat/vista-estandar-fichas-agrupador-cc | main |
| 6 | #184 | feat/vista-estandar-ee-categ | **la rama de la tanda 2** |
| 7 | #185 | feat/vista-estandar-fichas-cuenta | main + la rama de la tanda 3 mergeada adentro |
| 8 | #183 | feat/vista-estandar-acreditaciones | main + la rama de la tanda 3 mergeada adentro |

### Los tres choques a resolver antes de mergear

1. **`js/ui/planillaPanel.js` existe distinto en #181 y en #182.** Las dos tandas lo crearon como
   archivo nuevo, cada una para su lote, creyendo que así no se pisaban. 353 líneas de diferencia
   entre las dos versiones. Hay que unificarlo **antes** de mergear el segundo de los dos.
2. **Funciones duplicadas.** #187 copió textualmente `buildPlanillaRows()` y `estadoDeLegajo()` de la
   rama de la tanda 3 (lo dice en su PR): al mergear aparecen dos veces idénticas y se borra una.
   #186 y #181 tienen cada uno su `estadoDeFichaNr` / `estadoDeLegajoNr`, que hacen casi lo mismo.
3. **Numeración de DECISIONS pisada.** D-078 lo usan la tanda 2 y la tanda 4; D-081 lo usan las
   tandas 5, 7 y 8. Hay que renumerar al mergear.

### Orden de merge sugerido

1. **#181** (tanda 2) — es la base de #184.
2. **#182** (tanda 3) — unificando `planillaPanel.js` con el de #181 en este paso.
3. **#184** (tanda 6) — GitHub la reapunta a main sola cuando entra #181.
4. **#183** (tanda 8) y **#185** (tanda 7) — sus diffs se reducen solos cuando entra #182.
5. **#186** (tanda 4) y **#187** (tanda 5) — conflictos de import y de doc, de agregado.

### Lo que ninguna tanda pudo verificar

Ningún control se corrió de punta a punta en la app con un archivo real de cliente: no hay uno en el
repo, y el contenedor bloquea los CDN de Dexie y SheetJS. Todas miraron sus pantallas en un Chromium
real con fixtures que corren el `run()` y el `render()` verdaderos y datos inventados.
