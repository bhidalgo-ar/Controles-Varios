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
