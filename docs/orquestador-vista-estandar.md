# Orquestador — Vista estándar (8 tandas)

Prompts verbatim: `docs/prompts-vista-estandar.md` en main. Copias locales: tanda1.txt .. tanda8.txt
Preámbulo de ejecución: preamble.txt (reemplazar __BRANCH__ y __BASE__).

Repo: https://github.com/bhidalgo-ar/Controles-Varios   env: env_01HTdEJ9dpkcoEB3xTuPtx4p

## Olas

| Ola | Tandas | Modelo | Base | Arranca cuando |
|---|---|---|---|---|
| A | 1 | claude-opus-5 | main | ya (20:58 UTC 2026-08-20) |
| B | 2, 3 | claude-sonnet-5 | feat/vista-estandar-cimientos | la rama de la tanda 1 esté pusheada con PR |
| C | 4, 5, 7 | claude-opus-5 | feat/vista-estandar-cimientos | la ola B tenga sus dos PRs abiertos |
| C | 6, 8 | claude-sonnet-5 | feat/vista-estandar-cimientos | ídem |

Ramas: feat/vista-estandar-cimientos, -barra-meta4, -barra-axton, -fichas-legajo-concepto,
-fichas-agrupador-cc, -ee-categ, -fichas-cuenta, -acreditaciones

Netos: lo abre Willy aparte. El orquestador no lo lanza.

## Estado

- tanda1 — session_01DeaMD6Trremoe2iUhszYiy — LANZADA 2026-08-20 20:58Z
- tanda2..8 — pendientes

## Qué hace el chequeo (cada ~40 min)

1. `git ls-remote --heads origin` y `list_pull_requests` para ver qué ramas/PRs existen.
2. Si la ola anterior está completa, lanzar la siguiente con create_session
   (source_revision = feat/vista-estandar-cimientos, outcome_branch = la rama de la tanda).
3. Actualizar este archivo y re-agendar con send_later.
4. Nada de mergear. Nada de avisar a Willy salvo que una tanda esté trabada de verdad.
