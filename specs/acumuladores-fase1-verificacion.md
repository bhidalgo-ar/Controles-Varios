# Spec — Acumuladores Ganancias, Fase 1: panel de verificación + fichas + planilla

> Fase 1 de 3 del plan más amplio (ver hilo de diseño 2026-08-06/07). Fase 2
> (padrón de convenio) y Fase 3 ("super control" de Impuesto a las Ganancias
> con escalas/SIRADIG/licencias) quedan explícitamente afuera de esta spec.
>
> **Actualización 2026-08-07:** PR #83 (mergeado a `main`, sin tocar
> Acumuladores Ganancias a propósito — "Willy los está encarando por otro
> lado") generalizó a los otros 9 controles el mismo patrón de pantalla que
> esta spec preveía construir a mano, y lo sacó a un módulo compartido:
> **`js/ui/resultBlocks.js`** (`renderVerdict`, `renderTiles`, `renderIssues`,
> `renderChecks`, `renderResumenDetalle`, `enhanceGrid`, `diffCellHtml` /
> `mvArrow` / `fmtSigned`). Construido *sobre* `js/ui/tabs.js` de esta misma
> feature. `CLAUDE.md` §11.2 ya dice explícitamente: "para un control nuevo,
> usar `resultBlocks.js` desde el principio en vez de armar el hero a mano".
> Esta spec se actualiza para reusarlo — ver §1 y §3.

---

## ⚠️ Supuestos asumidos

- **Columnas exactas del "padrón de convenio"** (Fase 2, no esta spec) — no
  confirmadas todavía. Se deja como `additionalFile` opcional sin construir su
  lógica de cruce en esta fase; cuando Guillermo confirme columnas, entra
  como iteración aparte.
- **Valores por defecto de tope jubilatorio / tope obra social** — son datos
  regulatorios (AFIP, actualización RIPTE) que **no puedo inventar**. Quedan
  en `null` (chequeo apagado) hasta que Guillermo cargue el valor vigente vía
  el editor con PIN. No se hardcodea ningún valor de tope en el código.
- **Umbral de "salto grande" vs. mes anterior** — se asume 2× (mediana de la
  población real dio banda p5–p95 de 0,81x–1,36x; 2x es un margen conservador
  documentado, editable con PIN).

---

## 1. Guardrails — qué puede modificar y qué no

**Puede modificar:**
- `js/controls/acumuladoresGanancias.js` — extensión del módulo existente:
  nuevas funciones de chequeo, nuevo `renderAcumuladoresResults` que **reusa**
  `js/ui/resultBlocks.js` (ver nota de actualización arriba) en vez de
  reconstruir CSS/markup propio:
  - Veredicto (siempre visible, afuera de las tabs) → `renderVerdict`.
  - Tiles de reconciliación/tributación → `renderTiles`.
  - Casos para revisar (CUIL faltante, salto grande, etc.) → `renderIssues`.
  - Chequeos de coherencia (jubilación/obra social) → `renderChecks`.
  - Dirección C (planilla) → `enhanceGrid()` para el sticky de
    header/footer/columnas, en vez de CSS `rb-grid` propio.
  - **Desviación deliberada del patrón de 2 tabs (Resumen/Detalle) que usan
    los otros 9 controles:** acá van 3 tabs (Resumen · Fichas · Planilla),
    porque Guillermo pidió explícitamente las tres direcciones como vistas
    separadas, no una tabla de detalle única. Se arma con `initTabs`
    directamente (no con `renderResumenDetalle`, que asume exactamente 2).
    Documentar esta desviación en el comentario de cabecera del render.
  - `diffCellHtml`/`mvArrow`/`fmtSigned` **no aplican**: son para variación
    entre dos valores (comparación), y Acumuladores es un control de
    generación sin "diferencia" que mostrar con signo.
- `js/ui/fileUpload.js` / `js/ui/controlsWizard.js` — sólo para: (a) capturar
  CUIL en `run()` (ya lo trae el parser, hoy se descarta), (b) el slot
  opcional del padrón de convenio (Fase 2, sin lógica de cruce todavía),
  (c) el editor de config con gate de PIN.
- Nuevo archivo `js/ui/pinGate.js` (componente reusable, gate de PIN
  client-side) — puede quedar disponible para otros controles a futuro.
- `tests/acumuladoresGananciasControl.test.js` — nuevos asserts.
- `specs/`, `DECISIONS.md`, `CHANGELOG.md`.

**Puede leer/importar, no modificar sin consultar primero:**
- `js/ui/resultBlocks.js` y `js/ui/tabs.js` — son compartidos por los 9
  controles de PR #83 (más este). Si Fase 1 necesita algo que
  `resultBlocks.js` no ofrece (ej. una variante de tile o de check), **parar
  y consultar** antes de modificarlo — un cambio ahí impacta a los otros 9
  controles ya en producción. Preferir siempre extender con props/opciones
  nuevas y opcionales antes que cambiar el comportamiento default existente.

**No puede modificar (bajo ninguna circunstancia, ni "de paso"):**
- Ningún otro control (`acreditaciones.js`, `nr.js`, `brutos.js`, etc.) ni su
  registro en `registry.js` — cero relación con esta feature.
- El contrato del registry (`additionalFiles`, `run`/`summarize`/`renderResults`)
  — Fase 1 no lo necesita, ya lo confirmamos en la spec anterior (D-026).
- El formato del `.xlsx` exportado (hojas `MM-AAAA`/`DATOS`) — sigue siendo el
  entregable oficial; los chequeos nuevos son **sólo de pantalla**, no tocan
  el Excel salvo que Guillermo lo pida explícitamente después.
- La lógica de `run()` ya validada (consolidación por legajo, doceava, SAC
  teórico, ventana RG4003/4030) — verificada al centavo contra la planilla
  real de Guillermo (3.377 celdas, 0 diferencias). Se extiende, no se toca.

---

## 2. Comportamientos a preservar

- Los 34 asserts de `tests/acumuladoresGananciasControl.test.js` siguen
  pasando sin modificar sus expectativas actuales.
- `exportAcumuladoresToXlsx` sigue produciendo el mismo `.xlsx` de siempre
  (mismas dos hojas, mismo formato) — verificado por inspección manual, no
  hay test automatizado del `.xlsx` hoy y esta fase no lo agrega.
- El flujo de carga multi-archivo (`initAcumuladoresMultiUpload`) no cambia.
- `npm run test:unit` completo en verde (15 suites) antes de dar la fase por
  cerrada.

---

## 3. Scope

**Entra en esta fase:**

1. **Dirección A — Panel de verificación**, como pantalla por defecto:
   - Contador de reconciliación: cuántas de las N comprobaciones aritméticas
     cierran (acumulado = previo + mes; TOTAL = suma de componentes). Con la
     lógica ya validada, esto siempre da 100% salvo que algo raro pase en el
     parseo — si falla, es la señal más fuerte de que algo está mal.
   - Lista de "casos para revisar": CUIL faltante, legajo sin movimiento en
     el mes (con la alerta genérica, **sin** asumir que es bug — ver §5),
     salto grande vs. mes anterior (requiere ≥2 archivos subidos; con 1 solo
     archivo esta sección no aplica y se avisa por qué).
   - Chequeo de coherencia de aportes (jubilación/obra social contra los
     topes configurados) — **si el tope no está cargado, el chequeo se
     muestra apagado con un aviso**, nunca con un resultado inventado.
   - Gráfico de dispersión (total anual gravado vs. impuesto retenido) con
     línea de piso real de tributación — calculado de los datos, no de una
     escala legal externa. Etiqueta neutral ("para revisar"), no "error" ni
     "mal calculado" (ver §5, punto sobre el caso 1561).
2. **Dirección B — Fichas por legajo**, accesible desde una segunda tab:
   buscador, filtro (todos / con algo para revisar / sin movimiento), orden
   (mayor bruto / mayor SAC teórico / legajo / nombre), tarjeta expandible
   con detalle unificado mes + acumulado del año.
3. **Dirección C — Planilla**, tercera tab: la tabla ya construida
   (`renderConceptTable` actual), pasada por `enhanceGrid()` de
   `resultBlocks.js` para el sticky de columnas Legajo/Nombre + encabezado +
   fila de totales (en vez de CSS propio) — orden por columna (ya existe),
   buscador (ya existe).
4. **Editor de config con gate de PIN**: un PIN único de la app (no por
   cliente), guardado en `localStorage` del navegador. Detrás del gate:
   topes de jubilación/obra social, multiplicador de "salto grande", on/off
   por chequeo. Documentado como freno operativo, no como seguridad real
   (client-side, sin backend).
5. **CUIL en `run()`**: se resuelve por legajo desde las filas `SUMA` (ya lo
   hace el parser) y se usa en las tres direcciones — display únicamente
   (legajo + nombre + CUIL), no se exporta al `.xlsx` salvo pedido explícito.

**Explícitamente afuera (aunque parezca relacionado):**
- El padrón de convenio/categoría y el corte Jornalizado/Mensualizado —
  Fase 2. El slot de archivo puede dejarse declarado pero sin lógica de
  cruce funcionando.
- Escalas de Ganancias (art. 94), deducciones SIRADIG F572, licencias,
  cualquier cálculo de "¿está bien liquidado el impuesto?" — Fase 3, control
  aparte, pasa primero por `controles-payroll` en modo CAPTURA.
- Cualquier veredicto tipo "este legajo está mal" sobre el caso 1561 o
  cualquier "fuera de patrón" de tributación — se muestra como dato a
  revisar, nunca como afirmación de error, porque sin las deducciones no se
  puede saber.
- El caso puntual del legajo 137 (SENIA JORGE OMAR): **cerrado como "no
  resoluble sin el Tabulado".** Guillermo confirmó (2026-08-07): probablemente
  es una licencia sin goce, pero Acumuladores Ganancias no tiene ese dato —
  sólo lo tendría cruzando contra el Tabulado, y este control es
  deliberadamente `tabRequired: false` (no lo pide, ver spec original y
  D-026). La alerta se muestra siempre **genérica** ("sin movimiento en el
  mes, con acumulado del año") para cualquier legajo en esa situación, sin
  intentar adivinar la causa (licencia / egreso mal cargado / liquidación
  faltante) — eso queda para quien mire la ficha y tenga el Tabulado a mano.
- Cruzar contra el Tabulado en ningún chequeo de esta fase — es justamente lo
  que distingue a Acumuladores del resto de los controles (D-026).
- Tocar el `.xlsx` de salida.

---

## 4. Evals — cómo se comprueba que está correcto

- **Método:** tests automatizados con datos inventados (nunca datos reales
  de POP en el repo) + verificación manual en navegador con Playwright.
- **Criterio de éxito concreto:**
  - Nuevos asserts en `tests/acumuladoresGananciasControl.test.js` cubriendo
    cada chequeo nuevo (reconciliación con un caso roto a propósito, CUIL
    faltante, salto grande, coherencia con tope configurado y sin configurar).
  - `npm run test:unit` en verde, 15+ suites.
  - Verificación visual en navegador (`python3 -m http.server` + Playwright)
    de las 3 tabs, el filtro/orden/buscador de la ficha, y el gate de PIN
    (con y sin PIN correcto).
- **Quién revisa antes de cerrar:** Guillermo revisa la pantalla en la app
  real (no sólo el mockup) antes de mergear.

---

## 5. Autonomía — qué decide el agente solo vs. qué consulta

**Puede decidir solo:**
- Estructura interna de las funciones de chequeo, nombres de variables,
  markup/CSS exacto de tarjetas y scatter (ya validado en los mockups
  previos, se traslada el mismo lenguaje visual).
- Qué conceptos ocultar por falta de valor real (mismo criterio que ya
  existe en el proyecto).

**Tiene que consultar antes de avanzar:**
- Columnas exactas del padrón de convenio, cuando Guillermo lo defina
  (Fase 2 — no bloquea esta fase).
- El valor de los topes regulatorios — nunca inventar un número, siempre
  pedir el valor vigente o dejar el chequeo apagado.
- Cualquier caso donde el dato real (cuando Guillermo suba un archivo de
  prueba) contradiga un supuesto de esta spec — parar y avisar, no
  reinterpretar en silencio.
- El caso del legajo 137 ya está resuelto (ver §3): la alerta es genérica,
  no hay más que consultar acá — no diseñar ninguna heurística que intente
  adivinar "licencia" vs. "egreso mal cargado" sin el Tabulado.

---

## 6. Condición de salida

**El agente para de iterar cuando:**
- Las 3 direcciones (A/B/C) están integradas como tabs de
  `renderAcumuladoresResults` en `js/controls/acumuladoresGanancias.js`.
- El editor de config con PIN funciona (esconde/muestra el panel de
  umbrales).
- Los tests nuevos + los 34 existentes pasan; `npm run test:unit` completo
  en verde.
- Se verificó en navegador con un dataset sintético (inventado) que
  reproduce los patrones reales (algún CUIL faltante, algún salto grande,
  algún caso de tope) sin usar datos de POP.
- Se documentó en `DECISIONS.md` y se actualizó
  `specs/control-acumuladores-ganancias.md` con lo que cambió.

**Explícitamente, el agente NO debe:**
- Empezar la Fase 2 (padrón de convenio) ni la Fase 3 (super control) sin
  que Guillermo lo pida de nuevo explícitamente.
- Tocar otros controles o el contrato del registry.
- Convertir el gate de PIN en un sistema de autenticación real (usuarios,
  roles, backend) — es un freno simple, nada más.
- Afirmar que el legajo 1561 tiene un error, ni asumir la causa del 137
  (licencia / egreso mal cargado / liquidación faltante) — quedan como
  "casos para revisar" con dato neutral, nunca como veredicto.

Si durante la implementación aparece la necesidad de tocar algo fuera de
este scope, el agente para y avisa — no amplía el alcance por su cuenta.

---

**Fecha de creación:** 2026-08-07
**Confirmada por el usuario:** con supuestos pendientes — ver arriba (topes
regulatorios y columnas del padrón quedan explícitamente abiertos hasta que
Guillermo los resuelva). El caso del legajo 137 quedó cerrado el 2026-08-07:
no resoluble sin el Tabulado, se muestra genérico.
