# Auditoría de escalabilidad — agosto 2026

> **Estado:** vigente — inventario de trabajo abierto. Se actualiza a medida que se cierra cada ítem.
> **Origen:** relevamiento de los 60 archivos JS del repo (2026-08-11), con verificación adversarial:
> cada hallazgo se confirmó leyendo el código y reproduciendo el síntoma con `node` antes de anotarlo.

Este documento existe porque el inventario vivía sólo fuera del repo. Los 7 hallazgos ya cerrados
están en el `CHANGELOG.md` del 2026-08-11 y en `git log`; acá queda lo que falta.

---

## Bugs abiertos

Cada uno es una afirmación verificable: se puede escribir un assert que hoy falle.

### 1. `rendVsTabu` produce `NaN` y pinta el tile en VERDE

`js/controls/rendVsTabu.js:233` usa `!==` donde `js/controls/rendVsAsiento.js:685` usa `!=`:

```js
const diff = (t, r) => (t !== null && r !== null) ? t - r : null;   // rendVsTabu
const diff = (c, r) => (c != null && r != null) ? c - r : null;     // rendVsAsiento — correcto
```

Se invoca con optional chaining sobre un objeto que puede ser `null` (`:244-249`), así que llega
`undefined`; `undefined !== null` es `true` y evalúa `undefined - r` → `NaN`. Después el `reduce`
de `:280` no lo atrapa (`?? 0` sólo cubre `null`/`undefined`), el veredicto imprime "Diferencia
total de NaN", y como `Math.abs(NaN) > 0.01` es `false`, **el tile se pinta en verde**. La tabla de
Detalle sí muestra "—" porque filtra con `Number.isFinite`: la tabla disimula el bug y el hero lo
publica.

**Severidad:** alta — un control roto que dice estar bien.
**Fix mínimo:** `!=` en `:233`. **De fondo:** un `diffOrNull` compartido con `Number.isFinite`.

### 2. "Seleccionar todos" no selecciona ningún control real de POF ni de Axton

`js/ui/controlsWizard.js:690` filtra `u.ctrl.group.mode === 'Controlar'`, pero el registry ya tiene
cinco `mode` distintos: `'Controlar'`, `'Generar Reporte'`, `'Sueldos'` y `'Conceptos'`. Los
controles de POF son `variaciones_sueldos` y `variaciones_conceptos` (modes `'Sueldos'`/`'Conceptos'`)
y quedan afuera; para Axton sólo entra Acumuladores Ganancias y queda afuera Acreditaciones.

**Severidad:** media — fricción de uso, no da un número mal.
**Necesita decisión:** cambiar el filtro hace que las variantes "Generar Reporte" entren con un
click, y eso produce entregables. Alternativa: declarar la intención en el registry
(`group.primary: true`) en vez de inferirla de un string de UI.

### 3. El badge "⚠ sin asignar" es ilegible en dark mode

Los helpers de calidad de match están escritos dos veces en el mismo archivo. La copia local
(`js/ui/fileUpload.js:776-788`) usa `var(--color-warning)`; la copia exportada (`:1012-1024`), única
consumidora del panel "Columnas del Tabulado" de Brutos/GS Pers/NR, tiene `#EAB308` y `#B45309`
cableados. Los tokens cambian en dark mode; los hex no.

**Severidad:** media — el badge que tiene que gritar "esto no está mapeado" se pinta marrón oscuro
sobre fondo casi negro.
**Fix:** borrar las closures locales, usar los exports, y corregir esos dos hex a tokens. Entra en
la Fase 2 (capa visual).

### 4. Reintentar tras un error de parseo pierde la auto-detección

En `js/ui/fileUpload.js`, la rama `catch` (`:241-262`) reimplementa el handler `onConfirm` un nivel
más adentro, y la copia perdió dos cosas: no reenvía `autoDetected` (`:223` sí lo pasa, `:243` no),
así que después de un error todos los campos que decían "✓ auto" pasan a decir "↺ sesión anterior"
—informando un perfil guardado que no existe—; y no reenvía `autoDetect` en las salidas (`:259`,
`:256`), así que al cancelar y volver a subir el mismo archivo hay que mapear las columnas a mano.

**Severidad:** media — fricción, con un mensaje que además miente sobre el origen del mapeo.
**Fix:** una función nombrada llamada desde los dos lugares, en vez de la copia.

### 5. `variacionesMapGuardado` nunca se persiste, aunque el comentario dice que sí

`js/ui/controlsWizard.js:1101` lo lee y `:1110` lo escribe; no hay ninguna otra referencia en el
repo. Vive sólo en el objeto `state`, que se construye de cero en cada entrada al wizard: salir y
volver a entrar lo pierde. El comentario dice "se recuerda para la próxima corrida del cliente".

**Severidad:** media — el analista reconfirma concepto por concepto, en los dos Tabulados, todos los
meses.
**Fix:** `saveControlConfig(clientCode, 'variaciones_concept_map', …)` en el mismo `onChange`, y
cargarlo con el resto de las configs. Es además la única config de cliente del wizard que no llega a
`controlConfigs`, así que tampoco viaja en el export/import del seed (D-035).

### 6. El fallback de columna sólo lo tiene Brutos

Ver **D-039**. Decidida la precedencia; queda abierto si NR y GS Pers deben tener fallback propio y
con qué códigos — se confirma contra un Tabulado real, no por simetría.

### 7. Cinco divergencias entre copias del mismo molde

Un fix que entró en una copia y no en sus hermanas:

| Dónde | Qué pasó |
|---|---|
| `js/main.js:183` | `escHtml` es la única de 28 copias que no escapa la comilla doble. Hoy no es explotable (su único call site interpola en posición de texto). |
| `js/controls/acreditaciones.js:1105` | `fmt` es la única de 9 copias que guarda contra `undefined`; las otras 8 tiran `TypeError` y rompen el render entero si les llega una clave ausente. |
| `js/controls/variaciones.js:1373` | `periodSuffix` es la única de 9 con el guard `String(period)`; las otras llaman `.split` directo. |
| `js/controls/variaciones.js:1377` | `dateSuffix` devuelve `DDMMYYYY` en hora local; las otras 8 copias devuelven `YYYYMMDD` en UTC y `acumuladoresGanancias.js` usa un tercer formato. Un export a las 22:00 de Argentina sale fechado al día siguiente en unos y no en otros. |
| `js/controls/rendVsTabu.js:85` vs `rendVsAsiento.js:136` | `normCCName` normaliza acentos en uno y no en el otro: "Administración" matchea contra "Administracion" en un control y no en su gemelo. En rendVsTabu el nombre es el camino principal cuando el cliente no mapea el código de CC, y se combina con el bug 1. |

Aparte, dos defectos de una sola copia: `js/controls/brutos.js:198` pre-escapa el nombre y
`js/ui/resultBlocks.js:133` lo vuelve a escapar (se ve "PEREZ &amp;amp; GOMEZ"); y
`js/controls/brutos.js:418` usa `colDefs.length <= 1` como guard de "sin columnas configuradas"
cuando el array tiene 3 entradas incondicionales — el aviso es código inalcanzable
(`js/controls/gsPers.js:392` tiene el umbral correcto).

**Severidad:** baja cada uno, pero es el síntoma del problema de fondo: sin un módulo compartido, el
próximo fix también va a entrar en una sola copia.

---

## Hotspots de duplicación

Rankeados por palanca. El detalle del plan por fases está en `ROADMAP.md`.

| # | Hotspot | Radio | Fase |
|---|---|---|---|
| 1 | Consolidar por legajo + `sumColumn`: 4 copias, y el skill mandaba a copiarlas | 6 archivos | 1 |
| 2 | La cascada de montaje de la tabla Detalle (toolbar + paginación + buscador + sticky + export), 13 veces | 13 sitios / 9 archivos | 3 |
| 3 | Agregar un control toca ~12 puntos en `fileUpload.js` + `controlsWizard.js`, sin ningún guard entre ellos | 12 puntos | 4 |
| 4 | El `.xlsx` se arma a mano en 13 funciones de 10 archivos | 10 archivos | 2-3 |
| 5 | `toNum()` y la clave de legajo: 7 y 3 semánticas distintas para la misma operación | 11 archivos | 1 |

Dos precisiones que salieron de la verificación y conviene no perder:

- **`toNum` no se unifica "hacia el más común".** Seis controles usan `Number(v)`; `variaciones.js`
  tiene el único parser es-AR completo. Con un Tabulado HTML (`tabuladoHtml.js` devuelve todas las
  celdas como string) `"1.234,56"` da `null` en los seis y `1234.56` en Variaciones. Pero adoptar el
  de Variaciones a ciegas rompe al revés: `"1234.56"` pasa a leerse `123456`. El helper único tiene
  que distinguir el caso string-es-AR del número ya parseado por SheetJS.
- **El `fallbackCode` de Brutos no es un default silencioso que haya que borrar** — lee una columna
  real por código cuando el analista no mapeó. Ver D-039.
