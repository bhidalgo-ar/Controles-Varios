# Spec — Ejecución de PLAN_v2.md, tajadas T0 a T6

> Cubre la implementación acordada en `PLAN_v2.md`. T7/T8 (adaptadores Meta4/Axton) y T10 (cierre de migración a `clientCode`) quedan fuera de esta spec — deprioritizados por decisión del 2026-07-30 (ver `PLAN_v2.md` §0.3). T9 (retirar ruta de agrupadores) tampoco entra acá: se especifica aparte cuando se llegue.

---

## 0. Acuerdos transversales (aplican a las 7 tajadas)

**Cadencia:** una tajada por vez. Se completa T0, se muestra el resultado y se espera confirmación explícita antes de arrancar T1 — y así sucesivamente. No se encadenan tajadas sin OK intermedio.

**Acceso a GitHub:** resuelto el 2026-07-30 — el push funciona con normalidad.

**Cómo se prueba cada tajada (actualizado el 2026-07-30 — reemplaza el criterio original de "el usuario prueba en un navegador real" como único gate):**

El sandbox donde corre el agente tiene la salida de red restringida y no puede cargar las librerías que la app usa desde internet (Dexie, SheetJS), así que no puede abrir la app en un navegador él mismo. Se resuelve en dos capas, ninguna de las cuales depende de que el usuario opere la app:

1. **Pruebas automáticas que el agente escribe y corre.** Cuando la función a probar se puede aislar (ej. "exportar/importar el respaldo", "migrar un dato de una tabla a otra"), el agente arma una prueba con datos inventados que ejercita el código real (no una reimplementación simplificada) y la corre. Al reportar, describe en español llano — qué probó, qué esperaba que pasara, qué pasó — sin nombres de funciones ni jerga técnica, salvo que el usuario pida el detalle técnico.
2. **CI en GitHub Actions**, que sí tiene acceso normal a internet (a diferencia del sandbox del agente): corre esas mismas pruebas automáticas en cada cambio, más una prueba de extremo a extremo con un navegador real (Playwright) que abre la app tal como la abriría un analista y hace clic en los botones. Ver `.github/workflows/ci.yml`.

Esto cubre la mayoría de los casos. Sigue habiendo un límite real: el agente arma datos de prueba plausibles, pero no tiene acceso a una base real de un analista con meses de uso — así que un caso raro que solo aparece en datos reales (un cliente con un dato viejo en un formato inesperado, por ejemplo) puede no estar cubierto. Para T2 y T5 en particular (migraciones de schema que tocan el historial real de corridas), esto queda anotado como riesgo residual conocido en vez de bloqueo: si algo raro aparece en producción, se soluciona como un bug puntual, no se exige probar contra una base real antes de mergear.

**No tocar sin consultar, en ninguna tajada:**
- Los 22 `code` de cliente ya confirmados (`hya-controles-config.seed.json`) — son identidad estable (D-004); no se renombran.
- La lógica de cálculo de los 10 controles existentes en `js/controls/*.js` (`run`, `summarize`, `renderResults`) — las tajadas de esta spec tocan cómo se configuran y ofrecen los controles, no su lógica interna.
- El formato de exportación a Excel/clipboard que ya usan los analistas (`js/utils/exportData.js`, `js/ui/exportMenu.js`).

---

## T0 — Documentos y hogar del seed

| Dimensión | Definición |
|---|---|
| **Guardrails** | Puede modificar: `PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DECISIONS.md` en la raíz; `Claude md/` (se vacía y se borra la carpeta); crear `config/`. No puede tocar: `index.html`, `css/`, `js/` — T0 es 100% documental. |
| **Comportamientos a preservar** | Ninguno de código (no se toca código). El único riesgo es que algún link relativo a `Claude md/CLAUDE.md` quede roto — se verifica con `grep -rn "Claude md" .` después del movimiento. |
| **Scope** | Entra: borrar `PRD.md`/`ARCHITECTURE.md`/`ROADMAP.md` de `Claude md/` (quedan los de la raíz, ya subidos); mover `Claude md/CLAUDE.md` → `CLAUDE.md` en la raíz (confirmado); borrar la carpeta `Claude md/` una vez vacía; anexar D-004 a D-011 al final de `DECISIONS.md` (D-001 a D-003 intactos — D-001 queda registrado como superado por D-009, no se borra); borrar `DECISIONS_nuevas_entradas.md`; crear `config/hya-controles-config.example.json` (2 clientes ficticios) y `config/SEED_SCHEMA.md`; corregir en `CLAUDE.md` la línea sobre "doble click al HTML". Afuera: no se toca el seed real (`hya-controles-config.seed.json` sigue en la raíz, decisión §0.1 de `PLAN_v2.md` — se acepta ahí hasta que el repo pase a privado); no se crea nada bajo `js/` ni `config/hya-controles-config.json` real todavía (eso es T3). |
| **Evals** | Método: revisión manual (es documental). Criterio: un solo `PRD.md`/`ARCHITECTURE.md`/`ROADMAP.md` en el repo, `CLAUDE.md` en la raíz, `DECISIONS.md` termina en D-011, no quedan referencias rotas a `Claude md/`. Revisa: el usuario, mostrando el diff antes de continuar a T1. |
| **Autonomía** | Decide solo: redacción exacta de D-009/D-010/D-011 (ya redactadas en `PLAN_v2.md` §1 y §T0, se reusa ese texto), contenido de los 2 clientes ficticios del ejemplo. Consulta antes de: cualquier cambio al contenido de PRD/ARCHITECTURE/ROADMAP más allá de lo que ya dice la versión subida (esta tajada no reescribe esos documentos, solo los ubica). |
| **Condición de salida** | Para cuando la tabla de "Listo cuando" de T0 en `PLAN_v2.md` se cumple. No reescribe contenido de PRD/ARCHITECTURE/ROADMAP, no empieza código de T1/T2 aunque sea tentador seguir. |

---

## T1 — Respaldo local exportable (export/import de IndexedDB)

| Dimensión | Definición |
|---|---|
| **Guardrails** | Puede modificar: `js/db.js` (agregar funciones, no tocar los `db.version()` existentes), `js/ui/clientsList.js` (agregar el botón y su handler). No puede tocar: ningún `db.version()` ya declarado, ninguna función existente de `db.js` más allá de agregar las nuevas. |
| **Comportamientos a preservar** | Todo el flujo actual de clientes/sesiones/corridas sigue igual — T1 solo agrega, no modifica lectura/escritura existente. Se verifica corriendo la app sin usar el botón nuevo: nada cambia. |
| **Scope** | Entra: `exportDbBackup()` (vuelca todas las tablas de la versión de Dexie vigente a un JSON descargable) e `importDbBackup(file)` (restaura, con confirmación explícita del usuario antes de sobreescribir); botón "Exportar respaldo" en el home; botón/flujo de import con advertencia de que pisa la base actual. Afuera: no hay merge inteligente en el import (es todo o nada, restaurar = reemplazar) — un import parcial o "fusionar con lo existente" es explícitamente otra iteración, no esta. |
| **Evals** | Método: prueba automática (`tests/dbBackup.test.js`, corre en CI) que simula un cliente con corridas guardadas, exporta, agrega un cliente "basura" (simula que algo más se guardó encima), importa el respaldo, y verifica que la basura desaparece y el cliente + sus corridas quedan igual que antes de exportar. Más una prueba de extremo a extremo (`tests/e2e/backup.spec.js`, Playwright, corre en CI) que hace exactamente eso mismo pero clickeando los botones reales en un navegador. Criterio: ambas pasan en verde en GitHub Actions. Revisa: el agente corre y reporta en español llano qué probó; el usuario puede confirmar mirando el resultado en verde de CI en el PR, sin tener que operar la app él mismo. |
| **Autonomía** | Decide solo: formato interno del JSON de respaldo, texto de los mensajes de confirmación. Consulta antes de: si aparece alguna tabla cuyo volumen de datos haga inviable un export en memoria del navegador (no se espera con los datos actuales, pero si pasa, se avisa en vez de truncar en silencio). |
| **Condición de salida** | Para cuando `tests/dbBackup.test.js` y `tests/e2e/backup.spec.js` pasan en CI. No agrega import selectivo por tabla, no agrega programación de respaldos automáticos — eso no se pidió. |

---

## T2 — `code` y atributos de cliente (DB v4 aditiva)

| Dimensión | Definición |
|---|---|
| **Guardrails** | Puede modificar: `js/db.js` (agrega `db.version(4)` con `upgrade()`, agrega helpers), `js/ui/clientsList.js` (formulario de cliente). No puede tocar: `db.version(1)` a `db.version(3)` tal como están (se agregan versiones, no se editan las existentes — así es como funciona el versionado de Dexie), ni ningún otro archivo que lea `clientId` (`wizard.js`, `controlsWizard.js`, etc. — siguen usando `clientId` sin cambios; `code` se agrega en paralelo, no reemplaza nada todavía, según la migración aditiva de `PLAN_v2.md` §1). |
| **Comportamientos a preservar** | Todo cliente creado antes de T2 tiene que seguir siendo accesible por su `id` numérico exactamente igual que antes (groupers, sesiones, corridas, catálogo — todo lo que hoy cuelga de `clientId` sigue funcionando sin tocar). Se verifica con el eval de abajo. |
| **Scope** | Entra: `clients: '++id, &code, name, sourceSystem, active, team'`; `upgrade()` que asigna a cada cliente existente `code` (slug de `name` en mayúsculas, con sufijo numérico si hay colisión), `sourceSystem: 'meta4'`, `active: true`, `attributes: {}`, `ccts: []`, `entityCount: 1`; campos nuevos en el formulario de alta/edición de cliente (`code` editable solo al crear, `sourceSystem`, equipo, consultor, CCTs, dotación, atributos booleanos); helpers `getClientByCode(code)` / `resolveClient(codeOrId)`. Afuera: no se toca ninguna tabla que no sea `clients`; no se migra `fileProfiles`/`sessions`/`controlRuns`/`clientCatalogs` a `clientCode` (eso es T10, opcional); no se borra `clientId` de ningún lado. |
| **Evals** | Método: **el usuario o Willy corren la migración contra un navegador con una base v3 real** (acuerdo transversal §0), después de que el agente la valide con datos sintéticos (2-3 clientes de prueba con nombres que colisionen en el slug, para probar el sufijo). Criterio: todos los clientes preexistentes quedan con `code` único y `sourceSystem: 'meta4'`; ningún grouper, sesión, corrida o catálogo existente deja de aparecer o cambia de dueño. Revisa: el usuario/Willy en un navegador real antes de cerrar la tajada. |
| **Autonomía** | Decide solo: algoritmo exacto de slugificación (mayúsculas, reemplazo de espacios/acentos), estructura interna del formulario. Consulta antes de: qué hacer si dos clientes existentes generan el mismo slug base (la spec ya define "sufijo numérico + aviso" como default, así que solo consulta si aparece un caso que ese default no resuelva bien). |
| **Condición de salida** | Para cuando el eval con base real da OK. No empieza a migrar otras tablas a `clientCode` (T10), no toca `controlConfigs` (T5) aunque esté relacionado. |

---

## T3 — Import del seed: los 22 clientes

| Dimensión | Definición |
|---|---|
| **Guardrails** | Puede modificar: `js/db.js`, `js/ui/clientsList.js`, crear `js/seed/importSeed.js`. No puede tocar: `controlRuns`, `controlRunFiles`, `controlRunResults`, `clientCatalogs` — el import nunca escribe en esas tablas, bajo ninguna circunstancia (es la garantía central de ARCHITECTURE §6). |
| **Comportamientos a preservar** | Un analista que ya tiene corridas locales (`controlRuns`) las conserva intactas después de importar el seed, sin excepción. Se verifica con el eval de abajo. |
| **Scope** | Entra: UI de import manual de archivo JSON; intento silencioso de `fetch('./config/hya-controles-config.json')` antes de pedir el archivo a mano (sin bloquear si falla, típico en GitHub Pages); chequeo de `schemaVersion` (rechaza si no coincide, con mensaje) y `configVersion` (avisa si el que se importa es más viejo que el ya cargado); upsert por `code` de `clients`, `sourceSystems`, `teams`; versión del seed visible en la UI (header o footer). Afuera: no se procesa todavía `controlConfigs` del seed (viene vacío según `_pendingReview`, y aunque no viniera, T5 es quien define esa tabla) ni `catalogs` (mismo motivo). |
| **Evals** | Método: dos navegadores (o dos perfiles) distintos, cada uno importando el mismo archivo de seed. Criterio: ambos quedan con los mismos 22 clientes y los mismos `code`; uno de los dos parte con corridas locales preexistentes y las conserva después de importar. Revisa: el usuario. |
| **Autonomía** | Decide solo: estructura interna de `importSeed.js`, formato del mensaje de versión. Consulta antes de: qué hacer si el seed trae un `code` que ya existe local con un `name` distinto al del seed (conflicto real de datos, no error de versión) — no se resuelve en silencio a favor de ninguno de los dos lados. |
| **Condición de salida** | Para cuando el eval de los dos navegadores pasa. No implementa todavía edición desde la app de lo importado (eso es T6) ni toca `controlConfigs`. |

---

## T4 — `appliesWhen` y scopes

| Dimensión | Definición |
|---|---|
| **Guardrails** | Puede modificar: `js/controls/registry.js` (agregar `scope`/`scopeMeta`/`appliesWhen` a las 10 entradas existentes), `js/ui/controlsWizard.js` (separar aplicables/otros). No puede tocar: los objetos `run`/`summarize`/`renderResults` de cada control (guardrail transversal §0) — solo se agregan los tres campos nuevos a nivel de entrada del registry. |
| **Comportamientos a preservar** | Para un cliente sin atributos especiales, los 10 controles siguen ofreciéndose exactamente igual que hoy (default `scope: 'general'`, `appliesWhen: () => true`). Se verifica corriendo el wizard con un cliente de prueba sin atributos activados. |
| **Scope** | Entra: campos `scope`/`scopeMeta`/`appliesWhen` en las 10 entradas del registry con default no-op; 3 predicados reales (`f1359` para Marval, `pluriempleo` para Sportline/Lowsedo, `paymentUsd` para Geopagos/Piano); sección "Aplican a este cliente" / "Otros controles" (colapsada, no oculta) en el wizard. Afuera: no se agregan predicados para atributos que el seed no trae todavía; no se toca `controlConfigs` (no existe hasta T5) — el override manual con motivo es T5, acá el predicado es solo informativo/organizador. |
| **Evals** | Método: manual en la app, con el seed de T3 ya importado. Criterio: al entrar a Marval aparece F.1359 en "Aplican"; al entrar a un cliente sin ese atributo, F.1359 aparece en "Otros controles" pero sigue siendo seleccionable. Revisa: el usuario. |
| **Autonomía** | Decide solo: texto exacto de los encabezados de sección, estructura interna del filtro. Consulta antes de: cualquier predicado más allá de los 3 explícitamente acordados arriba — si aparece la tentación de inferir más reglas de los atributos del seed, se consulta antes de codificarlas. |
| **Condición de salida** | Para cuando el eval pasa para Marval, Sportline/Lowsedo y Geopagos/Piano. No sigue agregando predicados especulativos para el resto de los 22 clientes — eso es ROADMAP 2.9, relevamiento aparte. |

---

## T5 — `controlConfigs` (DB v5)

| Dimensión | Definición |
|---|---|
| **Guardrails** | Puede modificar: `js/db.js` (`db.version(5)`, migración), `js/ui/controlsWizard.js` (leer/escribir contra la tabla nueva en vez de `fileProfiles` para las 3 claves puntuales), `js/seed/importSeed.js` (procesar `controlConfigs` del seed, ahora sí). No puede tocar: el uso de `fileProfiles` para mapeo de columnas real (`getFileProfile`/`saveFileProfile` para tipos de archivo que no sean las 3 claves migradas) — eso sigue siendo mapeo de columnas, fuera de scope. |
| **Comportamientos a preservar** | Un analista con `brutos_tab_config`, `rendvstabu_concept_grouping` o `rva_config` ya guardados en `fileProfiles` (v4) tiene que ver el control arrancar con la misma configuración después de migrar a v5 — verificado contra el navegador real del eval de T2 (mismo acuerdo transversal), reutilizando el mismo dataset sintético + validación real. |
| **Scope** | Entra: `controlConfigs: '[clientCode+controlId], clientCode, controlId, status'`; `upgrade()` que lee las 3 claves de `fileProfiles` (`controlsWizard.js:96-99`, `1264-1270`), resuelve `clientId → clientCode` (vía el índice de T2) y las reescribe en `controlConfigs.params`; `status` (`activo`/`no_aplica`/`sin_configurar`/`forzado_activo`/`forzado_no_aplica`) con `overrideReason` obligatorio en los forzados; el import de seed (T3) ahora sí aplica `controlConfigs` si el seed las trae; marca de "override visible" cuando el valor local difiere del seed. Afuera: no se borran las 3 claves viejas de `fileProfiles` en este paso — quedan sin usarse hasta confirmar que la migración fue exitosa en producción (limpieza queda para una tajada de cleanup posterior, no bloquea T5). |
| **Evals** | Método: **usuario/Willy corren la migración contra un navegador real** con al menos una de las 3 claves ya configurada (acuerdo transversal §0). Criterio: el control correspondiente (Brutos, Rend vs Tabu, o Rend vs Asiento) arranca con la misma configuración que tenía antes de migrar. Revisa: el usuario/Willy. |
| **Autonomía** | Decide solo: estructura interna de `params` dentro de `controlConfigs`. Consulta antes de: cualquier caso donde el `clientId` de una de las 3 claves viejas no resuelva a un `code` válido (cliente borrado, o creado después de T2 sin pasar por el flujo nuevo) — no se descarta esa config en silencio. |
| **Condición de salida** | Para cuando el eval con base real da OK para al menos una de las 3 claves migradas. No limpia `fileProfiles` de las claves viejas, no construye la UI de edición de `controlConfigs` desde admin (eso es T6). |

---

## T6 — Modo admin y export del seed

| Dimensión | Definición |
|---|---|
| **Guardrails** | Puede modificar: crear `js/ui/adminView.js`, `js/seed/exportSeed.js`, agregar ruta en `js/main.js`. No puede tocar: la lógica de negocio de ningún control ni de `importSeed.js` más allá de reusarla — el admin exporta el mismo shape que T3 sabe importar, sin inventar un formato paralelo. |
| **Comportamientos a preservar** | El resto de la app (rutas existentes, wizard, resultados) sigue funcionando igual — T6 solo agrega una ruta nueva protegida por contraseña, no toca ninguna ruta existente. |
| **Scope** | Entra: pantalla `#/admin` con contraseña (hash SHA-256 comparado del lado cliente, documentado como barrera de acceso accidental — D-005); edición de atributos de cliente y `controlConfigs` desde esa pantalla; botón de exportar el seed actualizado (mismo `schemaVersion`/estructura que T3 espera). Afuera: no se implementan roles ni permisos más allá de la contraseña única (eso es ROADMAP 4.2, fuera de v2); no se agrega auditoría de quién exportó qué versión. |
| **Evals** | Método: manual, dos navegadores. Criterio: editar algo en admin, exportar, importar en otro navegador (reusando el flujo de T3) y verificar que el cambio llega sin perder corridas locales del segundo navegador. Revisa: el usuario. |
| **Autonomía** | Decide solo: estructura interna de la pantalla de admin, texto de los mensajes. Consulta antes de: la contraseña real a hashear (no se elige un valor por defecto sin decirlo explícitamente) y cualquier campo de `controlConfigs`/cliente que el admin debería poder editar y no esté ya cubierto por T2/T5. |
| **Condición de salida** | Para cuando el eval de export→import entre dos navegadores pasa. No se agrega nada de T7/T8/T9/T10 aunque el modo admin sea un lugar tentador para "dejar todo preparado". |

---

**Fecha de creación:** 2026-07-30
**Confirmada por el usuario:** pendiente — mostrar este archivo antes de empezar a codear T0 (y el trabajo de código queda en pausa hasta que el acceso de push a GitHub esté resuelto, por decisión explícita del usuario).
