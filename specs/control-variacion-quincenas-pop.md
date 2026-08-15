**Estado:** implementado y verificado contra archivos reales de julio 2026 · 4 ASUMIDOS, dos resueltos, uno decidido por Willy y uno abierto (§8).

# Variación entre quincenas — OPmobility Pilar (POP · Axton)

**Cliente:** OPmobility / Plastic Omnium **Pilar**, código `POP`, sistema **Axton**.
Control `pop_variaciones` en el `CONTROL_REGISTRY`, `scope: 'cliente'` de POP.

**No confundir con Florida.** El grupo tiene otra sede que el equipo trata como cliente
independiente: OPmobility C-Power Argentina S.A. ("Florida", código `POF`, Meta4), que también tiene
un reporte llamado "de variaciones" (`specs/reporte-variaciones-opmobility.md`). Son **dos controles
distintos**: Florida compara **importes de conceptos** mes contra mes en Meta4; Pilar deriva el **valor
hora** de dos quincenas de Axton. Ver D-024.

**Origen:** lo prototipó Willy en Claude Chat como HTML standalone y llegó al repo con su ficha de
traspaso (`docs/traspaso-controles-equipo.md`), más los tres archivos reales de julio 2026. El
prototipo es referencia de comportamiento, no código: acá está reconstruido con los patrones del repo.
Las diferencias con el prototipo están en §9.

---

## 1. Qué hace

Compara **dos Tabulados de Axton** —quincena anterior vs quincena actual— y arma el reporte de
variaciones que recibe **HR del cliente**: valor hora de cada legajo en cada quincena, cuánto varió en
pesos y en porcentaje, si cambió el CBU, altas, bajas y neto.

Si además se sube el **reporte de variaciones que exporta Axton** para la quincena actual, controla
campo a campo lo generado contra ése y lista legajo por legajo dónde difieren. Ese archivo es
**opcional**: sin él el control genera el reporte y no compara nada (status `'info'`, sin semáforo);
con él, el semáforo cuenta legajos con alguna diferencia sobre legajos comparados.

**El valor hora no es una columna del archivo:** se deriva como `Imp ÷ Cant` del concepto de horas
normales (`1010` en POP), consolidando antes las liquidaciones de cada legajo.

## 2. Archivos de entrada

| Archivo | Tipo | Obligatorio |
|---|---|---|
| Tabulado de Axton — quincena anterior | `tab_axton_prev_file` | sí |
| Tabulado de Axton — quincena actual | `tab_axton_file` | sí |
| Reporte de variaciones de Axton | `pop_variac_file` | no |

### Tabulado de Axton (`js/parsers/tabAxtonParser.js`)

`.xlsx` real (no HTML disfrazado), una sola hoja. **No es el mismo archivo que `tab_control`**, que es
el Tabulado de Meta4: los dos parsers no son intercambiables.

- Fila 1: encabezados. Fila 2: subencabezados `Cant` / `Imp`. Fila 3+: datos. Última: `TOTAL GENERAL`,
  alineada con las columnas (sin corrimiento).
- **Cada concepto ocupa un PAR de columnas** (`Cant`, `Imp`): el encabezado está en la primera del par
  y la segunda viene vacía. Los 4 totalizadores (`Bruto`, `Retenciones`, `Exento`, `Neto`) también
  vienen en pares.
- **Una fila por LIQUIDACIÓN, no por empleado.**
- La cantidad de columnas **cambia entre quincenas** según qué se liquidó: 116 en la 1ª de julio 2026,
  128 en la 2ª. Por eso nada se resuelve por posición — las columnas de ficha salen por nombre y los
  conceptos por código. (La 2ª quincena trae además `C.Costo Red.1` y `Uni. Negocio`, que la 1ª no
  tiene: la ficha de traspaso las listaba como si estuvieran en las dos.)
- Varios encabezados traen **NBSP** en vez de espacio: se normaliza al comparar.
- El parser emite por fila: las columnas de ficha, los totalizadores como `<nombre>_cant`/`<nombre>_imp`
  y **todos** los conceptos como `cant_<código>`/`imp_<código>`. La fila `TOTAL GENERAL` viaja con
  `esTotalGeneral: true` y `legajo: null`, así queda disponible para validar sumas y a la vez la
  descarta cualquier cruce por legajo.
- **Una columna que el archivo no trae no se emite como clave vacía: se omite.** Es lo que le permite
  al control distinguir "la columna no está" de "la celda vino vacía" — la diferencia entre informar
  "no sé si hubo bajas" y "no hubo bajas" (ver §5, Alta/Baja).

Encabezados usados (literales): `Legajo` · `Apellido y Nombre` · `CUIL` · `Ingreso` · `Egreso` ·
`Convenio` · `Categoría` · `Cargo` · `Centro de Costo` · `Sector Interno` · `Uni. Negocio` · `Banco` ·
`CBU` · `Recibo` · `Mov.` · `liquidacion` · los pares `Bruto`/`Retenciones`/`Exento`/`Neto` · los pares
de concepto `"<código> - <nombre>"`.

### Reporte de variaciones de Axton (`js/parsers/popVariacParser.js`)

`.xlsx` real, encabezados en fila 1, datos desde la 2, puede cerrar con una fila vacía.
**14 columnas por POSICIÓN**, y es a propósito: los dos períodos vienen como una fecha suelta (el mismo
serial en las dos cuando la comparación es dentro del mismo mes), las dos de Puesto se llaman igual
(`Puesto 07/2026`) y el archivo real trae `% Varicación`, con el typo. Buscar por nombre ahí es más
frágil que contar columnas. Las 6 columnas con encabezado estable se verifican y, si no coinciden,
**avisan** (no traban).

`0 Legajo · 1 Apellido y Nombre · 2 VH anterior · 3 VH actual · 4 MOD · 5 Variación · 6 % Varicación ·
7 MOD CBU · 8 Puesto ant · 9 Puesto act · 10 MOD Puesto · 11 Alta · 12 Baja · 13 Neto`

## 3. Qué se compara contra qué

**Generación** (los dos Tabulados):

| Columna | Cómo sale |
|---|---|
| VH anterior / VH actual | `Imp ÷ Cant` del concepto `1010` de cada Tabulado, consolidado por legajo |
| MOD | `S` si `|VH actual − VH anterior| > 0,01`, si no `N`. `—` si falta uno de los dos |
| Variación $ | **VH actual − VH anterior** (actual menos anterior). Dentro de tolerancia, `0` |
| Variación % | `Variación ÷ VH anterior × 100`. Con VH anterior en 0: **`s/base`**, no 100% |
| MOD CBU | CBU del Tabulado anterior contra el del actual |
| Alta / Baja | Fechas de `Ingreso` / `Egreso` contra el rango de la quincena actual (§5) |
| Neto | El de la quincena **ACTUAL**. Se informa, no se compara |

**Control** (lo generado contra el reporte de Axton), sólo para los legajos que están en los dos
lados: VH anterior, VH actual, MOD, MOD CBU, Alta, Baja y Neto. **Puesto y MOD Puesto no se
controlan** — no se generan (§5).

## 4. Códigos de concepto

`1010 - Horas Normales`, **confirmado** contra los dos Tabulados reales de POP de julio 2026 y
verificado contra el reporte de variaciones de Axton del mismo período (198 de 203 legajos coinciden
por `Imp ÷ Cant`). Se busca por **código**, nunca por nombre.

El código es **semilla, no identidad** (D-035/D-039): vive en `DEFAULT_POP_VARIACIONES_CONFIG` para el
cliente que todavía no configuró nada, y el analista lo cambia desde «Concepto del valor hora» en el
Paso 2 (`js/ui/popVariacionesConfigEditor.js`, config `pop_variaciones_config`). El panel muestra, al
lado del código, si ese código matchea una columna **en cada Tabulado cargado**. Una renumeración del
cliente se arregla desde la pantalla y no con un commit.

## 5. Reglas de negocio y casos borde

- **Unidad del resultado: legajos.** "9 con diferencias" = 9 legajos donde al menos un campo difiere
  entre lo generado y el reporte de Axton.
- **Consolidación por legajo, los dos lados** (D-042). Si un legajo trae más de una liquidación en una
  quincena, `Cant`, `Imp` y el neto se **SUMAN** y la ficha (nombre, CBU, fechas) sale de la última.
  El valor hora se calcula sobre las sumas: `Σ Imp ÷ Σ Cant`, no promediando valores hora. En los
  archivos de julio 2026 no hubo legajos repetidos, así que esta rama está **cubierta por test pero no
  verificada contra un caso real** — cuando aparezca uno, es lo primero a mirar.
- **Clave de legajo del cliente** (D-038): por default `'007'` y `'7'` son el mismo empleado, y los dos
  Tabulados y el reporte de Axton se comparan con la **misma** clave.
- **`null` no es 0.** Sin el concepto liquidado, o con `Cant` en 0, el valor hora es `—` y sale como
  aviso con la lista de legajos. Nunca 0,00.
- **Alta y Baja salen de las FECHAS, no de la presencia** (decisión de Willy, 2026-08-14 — ver D-061):
  Alta = la fecha de `Ingreso` cae dentro de la quincena actual; Baja = la de `Egreso` cae ahí. La 1ª
  quincena es del 1 al 15 y la 2ª del 16 al último día del mes.
  - Celda de `Egreso` vacía → `N`: en Axton un empleado activo no tiene fecha de egreso, así que vacío
    es "no se fue".
  - Celda de `Ingreso` vacía → `—`: todo empleado tiene fecha de ingreso, así que una vacía es un dato
    que falta.
  - La **columna** ausente del archivo → `—` y aviso: no se puede afirmar nada.
  - Sin período legible no hay rango contra el cual evaluar → `—` y aviso.
  - Los legajos que liquidaron en una sola de las dos quincenas **se listan aparte** y no se marcan ni
    alta ni baja.
- **El Neto es la sub-columna `Imp` del par Neto.** El par es igual al de cualquier concepto
  (`Cant`/`Imp`); el `Cant` es Axton sumando la columna de cantidades, que para el Neto no significa
  nada. Verificado: `Imp` cierra como `Bruto − Retenciones + Exento` en los 202 legajos de la 2ª
  quincena y coincide con el Neto del reporte de Axton en 199 de 202. Axton lo redondea a entero:
  tolerancia 1 en el control.
- **Axton completa el Neto con 0** donde el Tabulado no trae valor (los 3 legajos con neto negativo de
  julio 2026, donde la sub-columna `Imp` viene vacía): el control lo marca como diferencia `0,00 vs —`
  **a propósito**. Nada completado con cero en silencio.
- **Puesto (M100, M0016…) no está en ninguna columna del Tabulado**: sale de otro módulo de Axton. No
  se genera y no se valida.
- **Tolerancias, cada una con su motivo:** `0,01` para MOD (floats de Excel) · `0,02` para el valor
  hora contra Axton (redondea a 2 decimales) · `1` para el neto contra Axton (redondea a entero) ·
  `0,05` contra `TOTAL GENERAL`.
- **Períodos:** salen de la columna `liquidacion` del propio archivo, patrón `"(Na Quincena MM-AAAA)"`
  — nunca del selector de período de la app, que es del mes y no sabe de quincenas. Se puede comparar
  entre meses distintos. Orden invertido, o las dos del mismo período: **avisa y no traba** (chequeo de
  coherencia en rojo), y **no se reordenan** los slots — a diferencia de Variaciones de POF, que sí
  reordena. El analista sube los dos archivos que quiere comparar y la pantalla muestra qué comparó.
- **Sólo el personal que liquida el concepto**: los mensualizados de POP no liquidan `1010` en estos
  tabulados y no entran al reporte.
- **Traba solo si:** no se puede leer el `.xlsx`, falta la columna `Legajo`, la fila 2 no trae
  `Cant`/`Imp` (no es el Tabulado de Axton), no hay filas de empleado, falta el código del concepto o
  ese código no está en alguno de los dos archivos. Todo lo demás avisa y deja seguir (D-036).

## 6. Qué sale como archivo, y quién lo recibe

`POP_Variaciones_<Q>Q_<MMAAAA>.xlsx`, hoja `Variaciones`, 11 columnas: `Legajo`, `Apellido y Nombre`,
`VH anterior`, `VH actual`, `MOD`, `Variación $`, `Variación %`, `MOD CBU`, `Alta`, `Baja`, `Neto`.

Lo recibe **HR del cliente**, no Finanzas: por eso lleva altas, bajas y variaciones además del neto.
El contrato es `EXPORT_CONTRACTS.pop_variaciones` (`audience: 'payroll'`, en `CON_WRITER`), así que las
columnas del archivo y lo que se le pide al analista salen de la misma fuente. `Variación %` va como
**texto** porque `s/base` no es un número.

## 7. Verificado contra

Tabulados reales de POP de julio 2026 (1ª quincena c/sobregiro, 204 legajos, 116 columnas; 2ª quincena
c/sobregiro, 202 legajos, 128 columnas) y el reporte de variaciones de Axton de la 2ª quincena
(203 legajos).

| Chequeo | Resultado |
|---|---|
| Total de `1010` contra la fila `TOTAL GENERAL` | 1ª: **13.818 hs / 122.716.888,64** · 2ª: **13.344 hs / 118.643.934,14** — exacto en las dos |
| Períodos leídos del propio archivo | `1ª quinc. 07/2026` → `2ª quinc. 07/2026` |
| Legajos en el reporte | 204 (202 en las dos quincenas + 2 sólo en la 1ª) |
| Control contra el reporte de Axton | **203 comparados · 194 coinciden · 9 con diferencias**, todas explicadas abajo |
| Columnas distintas entre quincenas (116 vs 128) | La resolución por nombre y por código lee las dos igual |
| Neto: `Imp` del par contra el reporte de Axton | 199 de 202 (los otros 3 son los de neto negativo) |

Las 9 diferencias: **4** legajos sin `1010` en una quincena (Axton muestra el valor hora de la ficha
del empleado, que el Tabulado no trae) · **3** con neto negativo (Axton informa 0, el Tabulado no trae
valor) · **1** con el CBU vacío en una quincena (Axton dice `N`, el control dice `—`) · **1** que
liquidó sólo en la 1ª quincena y para el que Axton no evalúa `Baja` (dice `-`, el control dice `N`
porque no tiene fecha de egreso).

## 8. ASUMIDOS

| # | ASUMIDO de la ficha | Estado |
|---|---|---|
| 1 | Origen del valor hora cuando no hay `1010` | **Decidido por Willy (2026-08-14):** queda en `—` y sale como aviso. Encontrado de dónde lo saca Axton: en los 4 casos reales el valor hora que muestra es exactamente `Imp ÷ Cant` del concepto de licencia que sí liquidó (`1530 Lic. Enfermedad`, `1545 Lic. Nacimiento`) — o sea, la licencia se paga al mismo valor hora, que es el de la ficha del empleado. **Pendiente:** conseguir del analista un archivo de Axton con el valor hora de la ficha, para completar esos legajos sin derivarlo de un concepto |
| 2 | Criterio de Alta/Baja | **Decidido por Willy (2026-08-14):** por fecha de ingreso/egreso (§5, D-061). El criterio por presencia del prototipo marcaba una baja que no existió |
| 3 | Significado del "segundo valor" del par Neto | **Resuelto** mirando los archivos: es la sub-columna `Imp` (§5) |
| 4 | Criterio con el que Axton excluye legajos de su reporte | **ABIERTO.** Los dos legajos que liquidaron sólo en la 1ª quincena son indistinguibles en el Tabulado —ninguno tiene fecha de egreso, los dos con ingreso viejo— y uno entró al reporte de Axton y el otro no. El control los lista como "solo en el generado" para que el analista confirme; no se adivina |

## 9. Diferencias con el prototipo standalone

| | Prototipo (HTML) | Control de la app |
|---|---|---|
| Alta / Baja | Por presencia en un archivo y no en el otro | Por fecha de ingreso/egreso contra el rango de la quincena |
| Código del concepto | Fijo en el código (`1010`) | Semilla editable por cliente desde el Paso 2 |
| Consolidación de liquidaciones | Suma (implementada, sin caso real) | Igual, con el módulo compartido `consolidate.js` y test |
| Clave de legajo | `trim` + saca ceros a la izquierda | La del cliente (`legajoKeyMode`, D-038) |
| Salidas | `.xlsx` | `.xlsx` (por contrato), CSV y portapapeles |
| Chequeos de sumas | Aviso de texto | Chequeos de coherencia en la pantalla de resultados |

## 10. Pendiente

- El archivo con el **valor hora de la ficha del empleado** en Axton (ASUMIDO 1), para los legajos que
  no liquidaron el concepto de horas normales en una quincena.
- El **criterio de exclusión** que Axton aplica a su reporte (ASUMIDO 4).
- La rama de **legajo con dos liquidaciones en la misma quincena** contra un archivo real que la tenga.
- **Promoción a control de sistema** (`sourceSystems: ['axton']`) cuando un segundo cliente Axton pida
  el mismo reporte y su código de concepto esté confirmado contra su archivo (mismo camino que D-015).
