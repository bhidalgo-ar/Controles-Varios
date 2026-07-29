# PRD — Controles Nómina

> **Última actualización:** 29 de julio de 2026
> **Versión:** 2.0 (rediseño multi-cliente)
> **Owner:** Willy (Guille) Esposito — Payroll, IT & Implementation Manager, H&A

---

## 1. Resumen ejecutivo

Controles Nómina es una herramienta browser-side, sin backend, que centraliza la validación mensual de nómina para toda la cartera de clientes de H&A (~22 clientes, ~15 analistas). Reemplaza cruces manuales en Excel por un catálogo de controles configurables por cliente, con estado y configuración distribuidos por seed versionado (no por backend).

Este PRD reemplaza la v1.0 (18-may-2026). La v1.0 describía un producto de agrupadores de conceptos que no refleja lo que terminó construyéndose: un registro de controles nombrados (`CONTROL_REGISTRY`) con Tabulado como archivo pivote. Este documento parte del código real.

---

## 2. Problema que resuelve

Con 22 clientes y 15 analistas, validar nómina contra archivos de control hoy implica: reconfigurar reportes en el sistema de origen (Meta4 o Axton, según el cliente), cruzar manualmente en Excel cada mes, y no tener forma de saber qué controló cada analista ni si su configuración coincide con la de sus compañeros.

La escala agrega tres problemas que la v1 no tenía: (a) cada analista tiene su propio IndexedDB, sin fuente de verdad compartida; (b) los clientes usan dos sistemas de origen distintos con layouts distintos; (c) no hay forma de saber, a nivel equipo, qué se controló y qué no en un mes dado.

---

## 3. Usuarios

| Persona | Rol | Uso |
|---|---|---|
| **Analista de Payroll** | Equipo H&A (~15) | Selecciona cliente, ejecuta los controles que le aparecen ya configurados, exporta resultados |
| **Willy / Admin** | Payroll, IT & Implementation Manager | Mantiene el catálogo de clientes y configuración de controles, publica el seed, entra a modo admin con contraseña |
| **Cliente final** | Externo | No usa la herramienta; recibe el Excel exportado |

---

## 4. Conceptos del modelo (nuevo en v2.0)

**Cliente:** identificado por un `code` estable (ej. `MARVAL`), no por el id autoincremental de Dexie. El seed referencia clientes por `code`.

**Sistema de origen (`sourceSystem`):** `meta4` o `axton`, propiedad del cliente. Determina qué adaptador de parsing se usa. Es switcheable de forma prospectiva: un cliente migrado tiene `migratedAt` y las corridas históricas conservan el `sourceSystem` con el que se ejecutaron.

**Control:** definición de lógica (código, en el repo) separada de configuración (dato, por cliente). Cada control declara:
- `scope`: `general` (aplica a cualquier cliente), `convenio` (aplica según CCT), o `cliente` (lógica propia de un cliente puntual).
- `appliesWhen(client)`: predicado sobre los atributos del cliente que determina automáticamente si el control aplica, en lugar de requerir activación manual cliente por cliente.
- `paramSchema`: qué parámetros necesita configurar cada cliente donde aplica.

**Configuración de control (`controlConfigs`):** por `[clientCode + controlId]`. Guarda `status` (`activo` / `no_aplica` / `sin_configurar` / override manual con motivo) y los `params` validados contra el `paramSchema` del control.

**Seed de configuración:** archivo JSON versionado (`hya-controles-config.json`) que contiene clientes, atributos y `controlConfigs`. Se genera desde el modo admin y se distribuye por import manual (y, a futuro, por `fetch()` cuando la app se sirva desde infraestructura de H&A). No reemplaza el historial local de corridas (`controlRuns`), que nunca se pisa por un import.

---

## 5. Alcance de la v2 (rediseño)

### 5.1 Incluido

- Migración de `clients` de `++id` a `code` como identidad estable.
- Modelo de tres scopes de control: general / convenio / cliente.
- `appliesWhen` como mecanismo principal de activación de controles por cliente (reemplaza tildado manual como default).
- Tabla `controlConfigs` separada de `fileProfiles` (que vuelve a su rol original: mapeo de columnas).
- Seam de adaptadores por `sourceSystem`: los controles dejan de ver columnas crudas de Meta4; un adaptador Meta4 y uno Axton resuelven la forma lógica del input.
- Modo admin protegido por contraseña (hash del lado cliente) para editar clientes/configuración y exportar el seed.
- Import del seed con chequeo de versión, marcando overrides locales como visibles (no silenciosos).
- Retiro del flujo de agrupadores como ruta separada (`#/wizard/:clientId`): se convierte en un control más del registry, `scope: general`.
- Jerarquía cliente → entidad para clientes con múltiples entidades (Poincenot, Carrier, Lowsedo, Sportline). En v2 solo se registra el conteo de entidades; el detalle por entidad queda para cuando haga falta operarlo.

### 5.2 Excluido de v2 (ver ROADMAP.md)

- Adaptador de Axton más allá del primer piloto (Merz).
- Backend compartido (SharePoint Lists / Graph API) para consolidar resultados entre analistas.
- Registro de cobertura mensual por equipo (candidato: integración con monday.com).
- Roles y permisos más allá de analista / admin.
- Operar por entidad individual dentro de un cliente multi-entidad.

---

## 6. Restricciones (sin cambios respecto a v1)

100% client-side, sin build step, privacidad ante todo, marca H&A obligatoria, código en inglés / UI en español argentino. Ver `CLAUDE.md` para el detalle operativo.

Aclaración técnica: la app usa ES modules (`type="module"` en `index.html`), por lo que **no funciona abriendo el HTML con doble click desde `file://`** — requiere servirse (hoy GitHub Pages). El principio de "sin build step" se mantiene; el de "doble click" queda desactualizado por el uso de módulos y así se documenta en `DECISIONS.md`.

---

## 7. Riesgos nuevos de la v2

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Seed desactualizado corriendo en el navegador de un analista | Medio | Chequeo de versión al importar, mostrar versión cargada en UI |
| Contraseña del modo admin visible en el código fuente (GitHub Pages es público) | Bajo si se entiende bien | Documentado como barrera de acceso accidental, no como control de seguridad real. El control real es el permiso de escritura sobre la carpeta de SharePoint donde vive el seed |
| `appliesWhen` mal definido activa/oculta controles de forma incorrecta para un cliente | Medio | Overrides manuales por cliente siempre disponibles y visibles en `controlConfigs` |
| Adaptador de Axton no cubre un caso real que sí cubría el parser directo de Meta4 | Alto | Piloto con Merz (cliente chico, 1 CCT) antes de escalar a los 7 clientes Axton restantes |

---

## 8. Glosario (agrega a v1)

| Término | Definición |
|---|---|
| **code** | Identificador estable de cliente, no autoincremental. Viaja en el seed. |
| **scope** | `general` / `convenio` / `cliente` — a quién le aplica un control. |
| **appliesWhen** | Predicado sobre atributos del cliente que determina automáticamente si un control aplica. |
| **sourceSystem** | Sistema de origen de liquidación del cliente: `meta4` o `axton`. |
| **adaptador** | Módulo que traduce el layout de un sourceSystem a la forma lógica que espera un control. |
| **seed** | JSON versionado con clientes, atributos y configuración de controles, distribuido fuera del repo. |

---

## 9. Cambios sobre este PRD

| Fecha | Cambio | Motivo |
|---|---|---|
| 2026-05-18 | Versión inicial (v1.0) | Diseño del MVP en sesión con Claude |
| 2026-07-29 | Reescritura completa (v2.0) | El código real (registry de controles) había divergido del PRD v1.0; escalado a 22 clientes / 15 analistas requiere modelo multi-cliente |
