**Estado:** verificado el 2026-08-20 contra los tres Tabulados reales de Comercio de 05/2026 (IFSA, RELEF y FGSA — Intelicar queda afuera del control por ser Camioneros) y la planilla de armado manual de Willy: de 619 legajos evaluados, las diferencias sin explicar bajaron de 206 a **0** (ver D-074), y los 37 legajos de la planilla manual cierran todos dentro de la tolerancia de $100. La solapa Detalle se rediseñó el mismo día siguiendo un handoff de diseño: abre en **Fichas** (una tarjeta por legajo con la cascada del residuo) en vez de la planilla plana, que pasó a **Totales por rubro** (ver D-075). Sigue **pendiente**: probar en el navegador el tilde de jubilado del Paso 2; el cuarto ajuste que Willy pidió el 2026-08-19, el acuerdo no remunerativo variable por categoría (`noRemuAcuerdo` sigue siendo un único monto de config, no varía por categoría); y el export por solapa que pedía el handoff de Detalle (hoy las dos solapas comparten el export general) · el §3 y el §4 de este brief quedaron **superados por D-067**, ver la nota de abajo.

> **Nota del 2026-08-19 — lo que cambió al bajarlo a código (D-067).** Este brief planteaba comparar
> contra un *neto acordado pegado a mano* y descontar una lista fija de conceptos "perdonados"
> (§3.2 y §4 `variableBuckets`). Ninguna de las dos cosas quedó así:
>
> · El neto contra el que se compara es un **recibo teórico que el control calcula** desde el Tabulado,
>   no un número que el analista pega. Es la columna W de la planilla de Meli, y todo lo que necesita
>   está en el Tabulado (`sueldo + AFA` es invariante entre meses porque el AFA absorbe la paritaria).
>   El analista sube el Tabulado y la escala del convenio, y nada más.
>
> · **No hay lista de conceptos perdonados** (Willy, 2026-08-19: *"cualquiera puede explicar la
>   diferencia, si encontrás una diferencia con alguno tenés que marcarla"*). Se convierte a neto lo que
>   se liquidó por encima del recibo teórico y se marca lo que sobra.
>
> · Se agregaron dos cosas que el armado manual no tenía y que explicaban sus 5 descuadres de mayo: el
>   **2% extra del afiliado** al sindicato y el **tope de la base de aportes**.
>
> · Las dos preguntas que este brief dejaba abiertas para Meli (§7) están contestadas: el neto objetivo
>   sale de la planilla de fórmula, y **qué no remunerativo paga obra social lo dice el código del
>   concepto** —el Tabulado lo trae duplicado con y sin sufijo `_NO`/`_NOS`—, no una regla aparte.
>
> Lo que sigue vigente de este documento: el §0, el §1 (scope) y el §2 (qué resuelve). El resto se lee
> como el diseño anterior. La implementación está en `js/controls/controlNetos.js`.

> **Nota del 2026-08-20 — lo que cambió al verificar contra los tres Tabulados reales (D-074).** El
> §4 de este brief (`aporteRemPctConcepts` como config fija) y el §6.1 (factor derivado sumando los `%`
> de la fila) quedan superados: las alícuotas de retención se leen del Tabulado **por legajo**
> (columnas 610/612/616/632/676/623/669/677/678) y las de config pasan a ser el respaldo para el
> archivo que no traiga esas columnas — ganan siempre que estén, aunque digan 0. Se suma también un
> campo de config nuevo, `convenio` (semilla `'Comercio'`), que se compara contra la columna CONVENIO
> del Tabulado: el acuerdo no remunerativo, la antigüedad, el presentismo y el descuento sindical son
> del convenio que lo firmó, así que al empleado que no pertenece se lo sigue controlando pero con su
> sueldo + AFA menos sus propios aportes. Y `1684-ANTIC_INCENTIVO` deja de tratarse como no
> remunerativo común: pasa a una familia nueva, `noRemuSinAporte`, porque la liquidación no le cobra
> nada. Y hay un cuarto campo de config, `puestosSinAportes` (semilla `['Director']`), que se compara
> contra la columna PUESTO: a esos empleados no se les calcula jubilación, ley 19.032, obra social ni
> ANSSAL, diga lo que diga su columna de porcentaje. El criterio es el puesto y no la obra social en
> cero — hay empleados con la obra social en cero que aportan normal y cierran. Detalle completo, con
> los números de la verificación, en D-074. Y un quinto, `jubilados`: el control **sospecha** al
> jubilado que sigue trabajando —le retuvieron sólo jubilación teniendo las cuatro alícuotas
> declaradas— y el analista lo confirma con un tilde en el Paso 2; recién tildado se le dejan de
> calcular ley 19.032, obra social y ANSSAL.

> **Nota del 2026-08-20 — la solapa Detalle: tres vistas y la cascada del residuo (D-075).** El §8
> de este brief ("tabla por legajo, ordenable, con paginación") queda superado: siguiendo un handoff
> de diseño, el Detalle pasa a **tres solapas — Resumen · Fichas · Totales por rubro — y abre en
> Fichas**, no en la planilla. **Fichas** (nueva) es una tarjeta por legajo: cerrada muestra identidad
> y las marcas del caso (vacaciones en el mes, básico fuera de escala, topeó aportes, perfil de
> jubilado sin confirmar, fuera de convenio, sin aportes por su puesto, conceptos del mes, sin mes
> anterior cargado) y el importe sin explicar; abierta muestra la tira de conciliación en cinco pasos
> (neto teórico → explicado por el mes → neto esperado → neto liquidado ajustado → sin explicar), el
> recibo teórico y lo liquidado lado a lado, la cascada de conceptos del mes con su efecto real en el
> neto, y una conclusión con qué mirar. El cuerpo de cada ficha se arma al abrirla, no antes.
> **Totales por rubro** reemplaza a la planilla plana: los mismos rubros en cuatro bandas de
> encabezado (Identificación, Recibo teórico, Lo que se liquidó, Conciliación), 14 columnas, cada
> rubro con su base de cálculo abajo del título, legajo y empleado congelados, y la fila de TOTAL
> cierra por columna, no sólo en el neto. El dato nuevo que hace posibles las dos vistas es la
> **cascada del residuo por legajo** (concepto, código, tipo, importe, alícuota, efecto en el neto):
> la suma de los efectos es, al centavo, el `explicado` que usa el cruce — verificado como assert y
> contra los 619 legajos reales de 05/2026. De paso se corrigió un bug (dos códigos de UNIDADES
> sumados como pesos) y sigue pendiente el export por solapa que pedía el handoff. Detalle completo
> en D-075.

# Control de Netos — brief para Claude Code

> Documento de bajada al repo. Spec del **primer control de tipo `scope: 'cliente'`** para
> Sportline/IFSA.
> Convenciones del proyecto vigentes: código en inglés, UI en español argentino, 100%
> client-side, marca H&A, banner de privacidad. Ver `CLAUDE.md`.
>
> **Nota de esta versión (movida a `specs/` desde el brief original `CONTROL_NETOS.md`):** el
> §1 original proponía construir una taxonomía de controles (General/Empresa) y un filtro por
> cliente como precondición de este control. Esa taxonomía **ya existe** — se implementó en
> `js/controls/scope.js` (D-015, `specs/segmentacion-controles-por-cliente.md`) antes de que
> este documento llegara al repo, con un diseño de cuatro scopes en vez de dos tipos. El §1
> de abajo está reescrito para reflejar el mecanismo real; el resto del documento (§2 en
> adelante — el diseño del control en sí, validado a mano por Meli) queda igual que el
> original.

---

## 0. Decisión de scope (ya cubierta por D-015 — no hace falta una nueva)

Este control **vive dentro de Controles Nómina**, no como herramienta aparte. Motivo:
que el equipo no entre a mil vistas distintas — un solo lugar para todos los controles.

Implicancia honesta: el `CLAUDE.md` actual dice que la herramienta *"no es una herramienta
de cálculo de nómina"* y es *"100% lectura y análisis local"*. El Control de Netos rompe
parcialmente eso: **reconstruye** un neto (suma/resta conceptos y aplica coeficientes). No
escribe a Meta4 ni recalcula la liquidación entera, pero sí transforma. Esto no requiere una
distinción de tipos nueva (ver §1): encaja como un control más del `CONTROL_REGISTRY` con
`scope: 'cliente'`, igual que los 10 controles de Marval o los de POF — la diferencia de
"transforma en vez de solo comparar" es una propiedad de *este* control, no de una categoría
de controles que haya que declarar aparte.

---

## 1. Taxonomía de controles + filtro por cliente — estado real (no es trabajo nuevo)

### 1.1 Lo que existe hoy

No hay un tipo binario General/Empresa ni un store `controls` nuevo en Dexie. Lo que se
implementó (D-015, 2026-07-31) es un mecanismo de **cuatro scopes** declarados en código, en
cada entrada de `CONTROL_REGISTRY` (`js/controls/registry.js`):

| Scope | Alcance | Equivalente en este brief |
|---|---|---|
| `'general'` | Cualquier cliente activo. | "Tipo General" |
| `'sistema'` | Clientes cuyo `sourceSystem` esté en `scopeMeta.sourceSystems` (ej. `meta4`, `axton`). | (no tenía equivalente — control estándar de un sistema, no de un cliente puntual) |
| `'convenio'` | Clientes cuyos `ccts` intersecten `scopeMeta.ccts`. | (sin uso real todavía — ROADMAP 3.8) |
| `'cliente'` | Sólo los clientes listados en `scopeMeta.clients` (por `code`). | "Tipo Empresa" |

La resolución (`controlAppliesToClient` en `js/controls/scope.js`) ya contempla precedencia
**override de admin (`controlConfigs.status`) → scope declarativo → `appliesWhen(client)`**.
El **Control de Netos** entra directo como:

```js
const NETOS_ONLY = { scope: 'cliente', scopeMeta: { clients: ['SPORTLINE'] } };
// código real del cliente en la tabla `clients` — confirmar al cablear el registry,
// mismo patrón que MARVAL_ONLY / POF_ONLY en registry.js
```

No hace falta crear el store `controls` propuesto en la versión original de este documento:
la config por cliente ya tiene dónde vivir (ver §4) y el scope ya filtra qué se ofrece a quién.

### 1.2 UI — el filtro por cliente ya existe

No hay que agregar un selector de cliente nuevo: la app ya navega por cliente
(`#/controls/:clientId` en `js/main.js`, landing en `js/ui/clientsList.js`) y
`js/ui/controlsWizard.js` ya filtra la oferta de controles con `filterControlsForClient`. Al
registrar el Control de Netos con `NETOS_ONLY` aparece solo para ese cliente, sin tocar nada
de UI de scope.

**Abierto, no confirmado:** no encontré un mecanismo de "último cliente usado" persistido
(no existe `appConfig.lastClientId` ni equivalente en el código actual). Si Willy lo quiere,
es una mejora de UX separada de este control — no una precondición.

### 1.3 Config por cliente — vía `controlConfigs`, no un store nuevo

La tabla `controlConfigs` (`[clientCode+controlId], clientCode, controlId, status`) ya
existe y ya se usa para guardar configuración arbitraria por `[cliente+control]` en su campo
`params` (lo usan `rva_config`, `agrupadores_config`, `rendvstabu_concept_grouping`). El
perfil del Control de Netos (§4) va ahí — `controlConfigs.params` para
`[clientCode: 'SPORTLINE', controlId: 'control_netos']` — no en un store `controls` nuevo.

`sessions`/`controlRuns` ya tienen `controlId` (por id del registry) desde la migración a
`clientCode` (D-016) — tampoco hace falta agregarlo.

---

## 2. Control de Netos — qué resuelve

El cliente pide **netos objetivo** por empleado. Se calcula el bruto (hoy a mano, ver el
segundo control) y se carga en Meta4. **Problema:** el neto que sale en la liquidación no es
comparable directo contra el neto pedido, porque viene afectado por conceptos variables del
mes (plus feriados, vacaciones, examen, adicionales, anticipos, impuesto a las ganancias).

Este control **reconstruye el "neto limpio"** de la liquidación y verifica que la diferencia
contra el neto acordado quede **explicada únicamente** por esos conceptos variables. Si queda
un residuo, el bruto se calculó mal.

La lógica ya está validada a mano por Meli. Esto la automatiza y, sobre todo, **deriva los
coeficientes del propio archivo** en lugar de hardcodearlos (que es de donde salen los errores).

---

## 3. Inputs

1. **Archivo de liquidación** (export de Meta4, tabulado horizontal): una fila por legajo,
   columnas de datos personales + una columna por concepto con su **importe**. Mismo formato
   que ya parsea el tipo `resumen_tabulado_horizontal`.
2. **Netos acordados** por legajo (el objetivo). En la planilla de Meli es una columna pegada
   a mano. Ver §7 (pregunta abierta) sobre cómo entra a la herramienta.

---

## 4. Configuración del control (perfil por empresa)

El control se parametriza con un objeto de config guardado en `controlConfigs.params` para
`[clientCode: 'SPORTLINE', controlId: 'control_netos']`. **Nada de esto se hardcodea en el
código** — son mapeos por empresa:

```jsonc
{
  // concepto que contiene el neto liquidado
  "netoConceptCode": "NETO",
  // conceptos a sumar de vuelta para neutralizar (se restaron del neto)
  "neutralizeConcepts": ["8500", "5010"],   // anticipo, impuesto a las ganancias
  // buckets de conceptos variables, con su tratamiento de aportes
  "variableBuckets": [
    { "label": "Plus feriados",   "concepts": ["4096"],                 "remunerative": true  },
    { "label": "Vacaciones/examen","concepts": ["3553","4743","4100","4105"], "remunerative": true },
    { "label": "Vac. no rem.",    "concepts": ["4556","4557","4558","4559"], "remunerative": false },
    { "label": "Adic. mes",       "concepts": ["1062"],                 "remunerative": true  },
    { "label": "Adic. mes no rem","concepts": ["4660","4661"],          "remunerative": false }
  ],
  // columnas de % de aportes en el archivo, para derivar el factor remunerativo
  "aporteRemPctConcepts": ["610","612","616","632","623","676"],
  // tratamiento de aportes para conceptos NO remunerativos (ver §6.2 — confirmar con Meli)
  "aporteNoRemPctConcepts": ["616","632","623","676"],   // ⚠ PROVISORIO
  // constante de convenio: presentismo (comercio = 8.33%)
  "presentismoFactor": 1.0833,
  // tolerancia del residuo para marcar OK / revisar
  "residualTolerance": 100
}
```

> Los códigos de arriba salieron de mapear exactamente las fórmulas de la planilla de control
> de Meli (verificado celda por celda). **Confirmar con Meli** dos cosas: (a) que `4096`
> (aparece como `DTO_FERIADO` en el header) sea efectivamente el monto de plus feriado, y
> (b) el tratamiento de aportes no remunerativos (§6.2).

---

## 5. Algoritmo (por legajo)

```
1. netoLiquidado   = importe del concepto netoConceptCode
2. netoLimpio      = netoLiquidado + Σ(importe de neutralizeConcepts)
                     // suma anticipo + impuesto; los neutraliza
3. netoAcordado    = objetivo del legajo (input)
4. dif             = netoLimpio - netoAcordado
5. para cada bucket variable:
     base = Σ(importe de los conceptos del bucket)
     si bucket.remunerative:
        netEquiv = base * presentismoFactor * netFactorRem(legajo)
     si no:
        netEquiv = base * netFactorNoRem(legajo)
6. residuo = dif - Σ(netEquiv de todos los buckets)
7. flag: 'revisar' si |residuo| > residualTolerance ; 'ok' si no
```

`netFactorRem` y `netFactorNoRem` se definen en §6.

---

## 6. Factores — la parte crítica (NO hardcodear)

### 6.1 Factor remunerativo — SÍ se deriva del archivo

```
netFactorRem(legajo) = 1 - ( Σ aporteRemPctConcepts de esa fila ) / 100
```

Ejemplo verificado (comercio afiliado): 11 + 3 + 2,55 + 0,45 + 0,5 + 2 = 19,5% → factor
**0,805**. Para un no afiliado el 676 (sindicato) viene en 0 y el factor da 0,825
automáticamente. **Por eso se deriva del dato y no se hardcodea**: se adapta solo a la
afiliación de cada empleado.

### 6.2 Factor no remunerativo — NO se deriva de los % (hallazgo)

⚠ **Hallazgo a resolver con Meli antes de codificar esto.**

En el archivo de control, las columnas de % de aportes son **idénticas en todas las filas**
(2,55 obra social, 0,5 FAECYS, 2 sindicato, etc.). Sin embargo el factor no remunerativo de
Meli cambia: una fila usó **0,945** y todas las demás con el mismo perfil usaron **0,975**.
La diferencia es exactamente **3% = obra social**. Como casi todas las filas tienen importe
cero en los conceptos no remunerativos, el factor no afecta el resultado y la inconsistencia
no salta — pero está, y es justo el error de coeficiente a mano que esta herramienta elimina.

Conclusión: el tratamiento de aportes de un concepto no remunerativo **es propiedad del
concepto, no del empleado**. La regla correcta es por concepto: qué conceptos no remunerativos
pagan obra social (3%) y cuáles no. Esto se modela en `aporteNoRemPctConcepts` (o, mejor, un
tratamiento por bucket). El valor que dejé en la config (§4) es **provisorio** hasta que Meli
confirme qué conceptos no rem pagan OS.

```
netFactorNoRem(legajo) = 1 - ( Σ aportes no-rem que aplican ) / 100
```

### 6.3 Presentismo

`presentismoFactor` es una constante de convenio (comercio = 1,0833 = 8,33%). Configurable
por empresa. No derivarla del importe (puede traer ruido); dejarla en config.

---

## 7. Pregunta abierta (decidir antes de implementar)

**¿Cómo entra el "neto acordado" por legajo a la herramienta?**

Propuesta (decisión 8/10): tratarlo como un **segundo archivo** que el usuario sube y mapea
(legajo → neto acordado), igual que hoy se sube nómina + resumen. Encaja con el paradigma de
dos archivos que ya tiene el wizard. A futuro lo va a producir el segundo control
(calculadora de brutos, ver `specs/spec-gross-up.md`) y se va a poder encadenar.

Alternativa: una columna dentro del mismo archivo de liquidación. Menos flexible (obliga a que
alguien la pegue antes). La descarto salvo que Meli prefiera seguir trabajando así.

**Confirmar con Willy/Meli antes de que Claude Code defina el input.**

---

## 8. Output (pantalla de resultados)

Tabla por legajo, ordenable, con paginación (reutilizar el componente de tablas existente):

| Legajo | Apellido y nombre | Neto liquidado | Neto limpio | Neto acordado | Dif | Adicionales explicados | Residuo | Estado |

- `Estado` = pill verde "OK" / pill ámbar "Revisar" según tolerancia.
- Resumen arriba: cantidad de legajos OK vs a revisar, suma de residuos.
- Permitir **filtrar solo los "Revisar"** (que es lo que el analista va a querer ver).
- Export a Excel del resultado (cuando esté listo el export multi-hoja del MVP).

Mes a mes (opcional v1): si existe el neto acordado del mes anterior para el cliente, mostrar
la variación del neto acordado contra el mes previo (columna tipo "DIF mes anterior" de la
planilla de Meli). Si no hay dato previo, omitir la sección.

---

## 9. Marca y privacidad

Sin cambios respecto al resto: banner de privacidad visible, marca H&A aplicada, todo
client-side, los datos no salen del navegador. El archivo de liquidación tiene datos
personales — el aviso al exportar JSON aplica igual.

---

## 10. Texto para los docs vivos al implementar

No hace falta un `D-00X` nuevo para la taxonomía — ya es `D-015` en `DECISIONS.md`
(`specs/segmentacion-controles-por-cliente.md`). Al implementar este control, lo que sí
corresponde documentar:

**Para `DECISIONS.md`** (una entrada, sobre este control puntual — no sobre scope):

> ## D-0XX — Control de Netos: primer control con lógica de transformación (no solo cruce)
> **Contexto:** todos los controles existentes comparan/cruzan reportes sin recalcular nada.
> El Control de Netos (Sportline/IFSA) **reconstruye** un neto (suma/resta conceptos, aplica
> coeficientes derivados del propio archivo) para poder compararlo contra el neto acordado.
> **Decisión:** se acepta esta transformación dentro de Controles Nómina, registrada como
> `scope: 'cliente'` de `SPORTLINE` en `CONTROL_REGISTRY` — no amerita una categoría de
> control aparte (ver §0/§1 de esta spec).
> **Motivo:** el mecanismo de scope (D-015) ya resuelve "control a medida de un cliente"; lo
> único nuevo es que el `run()` de este control calcula en vez de solo comparar.

**Para `ROADMAP.md`:** marcar 3.4 como referenciando esta spec en vez de `CONTROL_NETOS.md`
(ya actualizado en este commit).
