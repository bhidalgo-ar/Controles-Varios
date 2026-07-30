# Esquema del seed de configuración

> El archivo real (`hya-controles-config.json`, 22 clientes) no vive en este repo — ver `DECISIONS.md` D-010. El ejemplo anonimizado que existió en `config/hya-controles-config.example.json` se borró (D-012); este documento describe el esquema para referencia, y los tests que necesitan un seed de prueba lo arman en memoria.

## Campos de nivel raíz

| Campo | Tipo | Descripción |
|---|---|---|
| `schemaVersion` | number | Versión de la estructura del archivo. Un import rechaza el archivo si no coincide con lo que la app sabe leer. |
| `configVersion` | number | Versión del contenido (sube cada vez que Willy exporta desde admin). Un import avisa si el archivo es más viejo que el ya cargado. |
| `updatedAt` | string (`YYYY-MM-DD`) | Fecha del último export. |
| `updatedBy` | string | Quién lo exportó. |
| `_about` | string | Nota libre, no la lee la app. |
| `sourceSystems` | array | Catálogo de sistemas de origen soportados (`meta4`, `axton`). |
| `teams` | array | Equipos de analistas (`code`, `lead` — `lead` puede ser `null` si el equipo todavía no tiene referente asignado). |
| `consultants` | array | Catálogo de consultores/as conocidos (`{ name }`), incluye a quienes todavía no tienen un cliente asignado. Se usa para autocompletar el alta de cliente. |
| `clients` | array | Los clientes de la cartera — ver abajo. |
| `controlConfigs` | array | Configuración de controles por cliente (T5 de `PLAN_v2.md`). Vacío hasta que se releve. |
| `catalogs` | array | Catálogos de conceptos por cliente, si se distribuyen por seed en vez de por import individual. |
| `_pendingReview` | array | Notas de lo que falta relevar o confirmar. No la lee la app — es para uso humano. |

## Cliente (`clients[]`)

| Campo | Tipo | Descripción |
|---|---|---|
| `code` | string | Identidad estable (D-004). Mayúsculas, sin espacios. **No se renombra una vez distribuido.** |
| `name` | string | Nombre para mostrar. |
| `team` | string | `code` de un equipo en `teams[]`. |
| `consultant` | string | Consultor/a asignado. |
| `complexity` | number | 1-5, informativo. |
| `pays` | number | Dotación (cantidad de legajos). |
| `ccts` | string[] | Convenios colectivos aplicables — usado por controles `scope: 'convenio'`. |
| `entityCount` | number | Cantidad de entidades legales. `1` si el cliente es una sola razón social. |
| `sourceSystem` | `"meta4"` \| `"axton"` | Determina qué adaptador de parsing usa. |
| `migratedAt` | string \| null | Fecha de migración de sistema de origen, si aplica. |
| `active` | boolean | Si el cliente está activo en la cartera. |
| `attributes` | object | Booleanos que alimentan `appliesWhen` de los controles (T4): `paymentUsd`, `pluriempleo`, `holding`, `retroactividad`, `confidential`, `downloadF572`. (`f1359` se sacó del modelo — no correspondía a ningún control real, ver D-012.) |

## Notas

- El import (T3) hace upsert de `clients`, `sourceSystems` y `teams` por `code` — nunca toca `controlRuns`, `controlRunFiles`, `controlRunResults` ni `clientCatalogs` (ver ARCHITECTURE §6).
- `controlConfigs[]` (cuando deje de estar vacío) tiene la forma `{ clientCode, controlId, status, overrideReason, params }` — ver ARCHITECTURE §4 y T5 de `PLAN_v2.md`.
