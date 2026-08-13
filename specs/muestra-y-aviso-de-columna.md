# Spec — Muestra de valores y aviso de tipo en la columna elegida

> **Estado:** propuesta, esperando confirmación de Willy.
> **Origen:** el mis-mapeo, único ítem abierto del relevamiento de escalabilidad
> (`specs/auditoria-escalabilidad-2026-08.md`, "Lo único abierto"; ítem 2 de "Estado al 2026-08-13"
> en `ROADMAP.md`). Son las opciones **1 y 2** de las tres que se le presentaron a Willy el
> 2026-08-13. La **opción 3** (arreglar la prioridad de las palabras clave de la auto-detección)
> queda explícitamente para otro PR posterior.

---

## El problema, en una línea

Todo el trabajo de obligatoriedad (contrato de export, gate del Paso 2, toggle ⊘ — Pasos 0 a 8 de
`specs/contrato-export.md`) hace que una columna **vacía** grite. Una columna **equivocada** sigue
pasando en verde: mapeada + obligatoria = satisfecha, aunque apunte al lugar errado. Y la
mandatoriedad lo *empeora*, porque un `required` queda satisfecho por el valor equivocado.

## Lo que va a ver el analista

1. **Debajo de cada columna elegida, una línea gris chica con 2 valores reales del archivo** —
   `ej.: 15/03/2026 · 28/03/2026`. Siempre visible, sin hacer nada (decisión de Willy, 2026-08-13).
2. **Un aviso amarillo al lado de la columna** cuando el contenido no se parece a lo que ahí va —
   "elegiste una columna con importes, y acá va una fecha". No traba: avisa.
3. **Si corre el control igual, el aviso queda anotado en la pantalla de resultados** de esa corrida,
   así el que revisa después ve que se corrió con una columna sospechosa.

---

## 1. Guardrails — qué puede modificar y qué no

**Puede modificar:**

- `js/ui/columnHints.js` — **módulo nuevo** (hoja del árbol de imports, sin dependencias de UI), con
  las dos primitivas: sacar la muestra de valores de una columna, y decidir si el contenido se parece
  al tipo esperado.
- `js/ui/fileUpload.js` — sólo el formulario de mapeo y el panel de remapeo, para colgar la muestra y
  el aviso debajo de cada `<select>`.
- `js/ui/controlsWizard.js` — sólo el panel "Columnas del Tabulado" del Paso 2, lo mismo.
- `js/ui/controlsResults.js` — un bloque de avisos de mapeo a nivel corrida (una sola vez, arriba de
  los controles), no dentro de cada control.
- `js/exports/contracts.js` — **sólo dos cosas**: agregar `typeOfKey(fileType, key)` (hermana de
  `necessityOfKey`, misma familia y misma fuente única) y declarar `type: 'date'` en las 3 columnas de
  fecha que hoy dicen `'txt'` (`FECHA_ALTA`, `FECHA_BAJA`, `FEC_PAGO`).
- `css/tokens.css` / `css/components.css` — sólo si hace falta una clase para la línea de muestra.
  Nada de hex en los módulos.
- Tests: `tests/columnHints.test.js` (nuevo, y entra a la cadena de `package.json`),
  `tests/exportContracts.test.js` (el assert de tipos permitidos), `tests/e2e/columnHints.spec.js`
  (nuevo).

**No puede modificar, ni "de paso":**

- **`autoDetectTabExtraConfig()` y cualquier otra auto-detección.** Es la opción 3, va en otro PR: un
  cambio de prioridad mueve mapeos que hoy salen bien de casualidad, y eso hay que mirarlo cuando el
  analista ya pueda ver qué cambió (o sea, después de esta feature).
- **Los 16 módulos de `js/controls/`.** El aviso es de la pantalla, no del control: si cada `summarize()`
  tuviera que enterarse, volvemos al "un cambio toca 12 archivos" que cerró la Fase 4.
- **`computeSemaforoStatus()` y el color del semáforo.** Un aviso de mapeo no cambia el color de un
  control (CLAUDE.md lo trata como intocable a la ligera, y acá no hay motivo).
- **La forma de ningún `.xlsx` que se descarga.** El `type: 'date'` es sólo para saber qué se espera
  en esa columna: hoy `contractSheet.js` sólo tiene un caso especial para `'num'`, así que `'date'` cae
  en el mismo lugar que `'txt'` — verificado antes de escribir esta spec, y se verifica de nuevo como
  eval.
- **El gate y la omisión declarada (⊘, `blocksProgress`, `pendingTabRequirements`).** Se mira, no se
  toca: el aviso nuevo es independiente y no puede impedir avanzar.
- **El esquema de IndexedDB.** Los avisos se recalculan de lo que ya se guarda de la corrida; si los
  datos no alcanzaran, se persiste la lista de avisos y **se avisa antes de hacerlo**, no se cambia el
  esquema por decisión propia.

---

## 2. Comportamientos a preservar

| Qué tiene que seguir igual | Cómo se verifica |
|---|---|
| El gate del Paso 2 y de la carga bloquea y libera exactamente igual que hoy (incluida la omisión ⊘) | `tests/tabExtraOmission.test.js`, `tests/uploadOmission.test.js`, `tests/e2e/uploadOmission.spec.js` |
| Un valor guardado que ya no está en el archivo del mes se sigue detectando y reparando | `tests/staleTabConfig.test.js` |
| `fileUpload.js` no nombra ningún tipo de archivo ni declara su propia lista de campos (lo que cerró la Fase 4) | `tests/fileTypes.test.js` |
| Todos los `.xlsx` salen byte a byte como hoy | `tests/contractSheet.test.js`, `tests/exportSinWriterConformidad.test.js` + comparación celda por celda del workbook de Brutos/GS Pers/NR contra `main` |
| Los 15 contratos siguen declarando lo que declaran, sin debilitar ningún `required` | `tests/exportContracts.test.js` |
| La batería completa | `npm run test:unit` — hoy 33 archivos, 0 fallas |

---

## 3. Scope

**Entra:**

- Muestra de **2 valores reales** debajo de cada columna elegida, en las **dos** pantallas: el
  formulario de mapeo al subir el archivo (y su panel de remapeo) y el panel "Columnas del Tabulado"
  del Paso 2. Valores truncados a un largo fijo y escapados con `esc()` — vienen de un Excel de un
  tercero.
- Aviso de tipo cuando **ninguno** de los valores mirados se parece al tipo que declara el contrato.
  Conservador a propósito: ver "Lo que este diseño no resuelve".
- `typeOfKey(fileType, key)` en `contracts.js` y `type: 'date'` en las 3 columnas de fecha.
- El aviso, anotado en la pantalla de resultados de la corrida, en un bloque propio a nivel corrida.
- Tests unitarios de las dos primitivas + un e2e que confirme que la muestra y el aviso se ven en las
  dos pantallas, en modo claro y oscuro.

**Explícitamente afuera:**

- **La opción 3** (prioridad de las palabras clave de la auto-detección). Otro PR.
- **Arreglar `fmtDate`** (las 3 copias que convierten cualquier número entre 1 y 100.000 en fecha
  plausible). Es un cambio en la salida de tres controles y merece su propia decisión.
- Bloquear, trabar o cambiar el semáforo por un aviso de tipo.
- Validar que el legajo sea único, que los importes sean positivos, o cualquier otra regla de negocio
  sobre el contenido: acá se valida **forma**, no plausibilidad.
- Los `<select>` de las pantallas que no eligen columnas del archivo (agrupadores, umbrales, la tabla
  de cuentas de FINADIET).

---

## 4. Evals — cómo se comprueba

- **Método:** tests unitarios + e2e en Chromium real (disponible en el sandbox) + comparación de
  workbook contra `main`.
- **Criterio de éxito concreto:**
  1. `npm run test:unit` en verde, con `tests/columnHints.test.js` incluido en la cadena de
     `package.json` (si no está en la cadena, no lo corre nadie).
  2. `tests/columnHints.test.js` cubre, como mínimo: columna con celdas vacías intercaladas (la muestra
     saltea los vacíos y no inventa); columna con menos valores que los pedidos; valor largo truncado;
     comilla doble y `&` escapados; importes es-AR contra `'date'` → **avisa**; fechas `dd/mm/yyyy`
     contra `'date'` → **no avisa**; texto contra `'num'` → **avisa**; columna sin ningún dato → **no
     avisa** (no hay con qué afirmar nada).
  3. Cada assert nuevo se valida al revés: se revierte el fix, se corre, **falla**, se restaura. Un test
     que no puede fallar no prueba nada.
  4. `tests/e2e/columnHints.spec.js`: la muestra y el aviso se ven en el panel del Paso 2 y en el
     formulario de carga, en modo claro y oscuro, sin desbordes.
  5. El workbook de Brutos/GS Pers/NR de esta rama, idéntico celda por celda al de `main` (el
     `type: 'date'` no cambia ningún archivo descargado).
- **Quién revisa antes de cerrar:** Willy mira las dos pantallas en el navegador. Los avisos son
  cualitativos: si el aviso salta cuando no corresponde, es peor que no tenerlo (mismo riesgo de fatiga
  que ya está anotado en `specs/contrato-export.md`).

---

## 5. Autonomía — qué decido solo y qué consulto

**Decido solo:**

- Cuántas filas se miran para decidir el aviso (arranco en 20 con dato) y el largo del truncado.
- Cómo se ve exactamente la línea de muestra (tamaño, color desde tokens, separador).
- Cómo se reconoce "esto parece una fecha" / "esto parece un importe": reuso `toNum()` de
  `js/utils/currency.js`, no escribo un parser nuevo.
- Dónde va el bloque de avisos en la pantalla de resultados.
- Si `parsedRows` no está disponible al armar la pantalla de resultados, recalcular desde otra fuente
  ya guardada antes de proponer cualquier cambio de esquema.

**Consulto antes de avanzar:**

- Si para que el aviso llegue a resultados hiciera falta **tocar los módulos de control** o **cambiar
  el esquema de IndexedDB** (los dos están en los guardrails).
- Si aparece una columna donde el tipo declarado por el contrato está **mal** (no sólo incompleto):
  corregir un contrato cambia lo que se exige en el gate, y eso no se hace de paso.
- Si el aviso salta en algún caso legítimo de un archivo real de cliente: antes de aflojar el criterio,
  lo muestro.

---

## 6. Condición de salida — cuándo paro

Paro cuando se cumplen las cinco condiciones de la sección 4 y el PR queda abierto para que Willy mire
las dos pantallas. **No sigo** con: la opción 3, `fmtDate`, unificar los `<select>` de las dos
pantallas en un componente compartido, ni ninguna otra mejora de la pantalla de carga que aparezca en
el camino. Si algo de eso parece necesario, lo anoto en `ROADMAP.md` y lo digo — no lo hago.

---

## Lo que este diseño NO resuelve (para que no se lea como bala de plata)

- **El aviso es conservador y va a dejar pasar casos.** Salta sólo si **ninguno** de los valores
  mirados se parece al tipo esperado. Una columna de importes elegida donde va un número (otro
  importe, pero el equivocado) es indistinguible por forma — eso lo ataja la **muestra visible**, que
  es la razón por la que la opción 1 va primero y no la 2.
- **Una fecha puesta donde va un número no se detecta**, porque un serial de Excel *es* un número.
- **`type` describe cómo se escribe el valor en el export, no qué tiene que traer la columna de
  origen.** Por eso las columnas de fecha estaban declaradas `'txt'`: pasan por `fmtDate` y salen como
  texto. Agregar `'date'` alinea las dos lecturas para estas 3 columnas; el día que otra columna
  necesite un tipo más fino, se declara ahí y no en el módulo.
- **La muestra no prueba que el mapeo esté bien**, igual que la omisión declarada es una firma y no una
  prueba (D-041). Hace visible lo que hoy es invisible, que es todo lo que se puede pedir sin un
  segundo archivo contra el cual cruzar.
