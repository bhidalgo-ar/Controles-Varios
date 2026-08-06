# Pendientes y segundo control — Controles Nómina

> Lo que queda después del Control de Netos: el **segundo control** (calculadora de brutos /
> gross-up), los **pendientes del MVP** y el **relevamiento abierto**.
> El Control de Netos arranca primero (`specs/spec-control-netos.md`). Esto es lo que viene
> después.
>
> **Nota de esta versión (movida a `specs/` desde el brief original):** las referencias a
> "taxonomía Empresa" de más abajo apuntaban a una distinción General/Empresa que nunca se
> construyó así — el mecanismo real es el de **scopes** (`scope: 'general' | 'sistema' |
> 'convenio' | 'cliente'`) implementado en `js/controls/scope.js` (D-015,
> `specs/segmentacion-controles-por-cliente.md`), ya en producción desde antes de que este
> documento llegara al repo. Quedan actualizadas las menciones puntuales; el resto del
> contenido (el diseño del gross-up, los pendientes del MVP, el relevamiento y el parking lot)
> sigue igual que el original.

---

## 1. Segundo control — Calculadora de Brutos (la "previa" / gross-up)

> Tipo de control: `scope: 'cliente'` (atado a Sportline/IFSA, lógica de convenio comercio) —
> mismo mecanismo que el Control de Netos, no una categoría aparte.
> Prioridad: va **segundo**. Más valor a largo plazo, pero más riesgo. No empezar por acá.

### 1.1 Qué resuelve

Hoy, para llegar al neto que pide el cliente, el equipo calcula el bruto a mano:

- **Fuera de convenio:** el cliente los pasa ya calculados con una fórmula propia. No hay que
  calcular nada — solo cargar.
- **Convencionados (comercio):** tienen un Excel con conceptos y % de retenciones, y con un
  **"buscar objetivo"** de Excel modifican el **AFA** (concepto `1017-A_CTA_FUT_AUMEN`, "a
  cuenta de futuros aumentos") hasta alcanzar el neto solicitado.

El problema: si el % de retención que se mete está mal, el bruto y el neto salen mal. Este
control reemplaza el buscar objetivo manual y reduce el margen de error.

### 1.2 Lógica (alto nivel)

Por empleado convencionado, dado el **neto objetivo**:

```
bruto = básico de escala (por categoría/mes)
      + antigüedad
      + presentismo
      + adicionales fijos
      + AFA (incógnita)
neto  = bruto - aportes (% sobre base remunerativa)
resolver AFA tal que neto == neto objetivo
```

Es despeje directo (no hace falta iterar como el buscar objetivo, si la relación neto/AFA es
lineal): `AFA = (neto_objetivo / netFactor - resto_del_bruto)`, con el `netFactor` derivado de
los % igual que en el Control de Netos (§6.1 de `specs/spec-control-netos.md`).

### 1.3 Inputs

1. **Netos objetivo** del cliente (por legajo/categoría).
2. **Nómina con categoría y convenio** por empleado (define qué reglas aplican: fuera de
   convenio / comercio / variable manual).
3. **Escala salarial** por categoría y mes (la hoja `ESCALA COM`: código de categoría → básico
   por mes). Decidir si entra como archivo o se mantiene como tabla editable en la app.

### 1.4 Distinción por tipo de empleado

- **Fuera de convenio:** no calcular, pasar el valor del cliente.
- **Comercio:** calcular con escala + aportes + despeje del AFA.
- **Variable manual:** permitir que el usuario agregue casos a mano (lo pidió Willy
  explícitamente: "alguna variable que pueda agregar a mano").

### 1.5 Riesgo a tener presente

Esto **replica un pedazo del motor de Meta4**. Si la calculadora y Meta4 difieren, se vuelve
al control manual — o sea, no sirve. Por eso:

- Validar el output contra **varios meses reales** antes de confiar.
- El Control de Netos (primero) le da al equipo la red de seguridad: aunque el bruto se calcule
  acá, el Control de Netos verifica que la liquidación real cerró. Las dos piezas se
  complementan.

### 1.6 Preguntas abiertas (resolver en brainstorming antes de codear)

- ¿La escala entra como archivo subido cada mes o como tabla mantenida en la app?
- ¿Entra **Ganancias** en el cálculo del bruto, o el neto objetivo es siempre pre-Ganancias?
  (En el Control de Netos, Ganancias se neutraliza sumándola de vuelta — habría que ser
  consistente.)
- Topes de base imponible jubilatoria: ¿aplican a esta población? ¿hay sueldos que los superen?
- ¿La relación neto/AFA es lineal en todos los casos, o hay conceptos que rompen el despeje
  directo y obligan a iterar?

---

## 2. Pendientes del MVP de Controles Nómina

Estado según `ROADMAP.md` — lo que falta para cerrar v1 (controles de `scope: 'general'`):

| # | Bloque | Estado | Nota |
|---|---|---|---|
| 1.10 | Insight de variación **mes a mes** | parcial | Falta implementar el comparativo contra la sesión definitiva del mes anterior. |
| 1.12 | Listado de **sesiones históricas** por cliente | planeado | — |
| 1.13 | Marcar sesión como **definitiva** (validación de unicidad por cliente×mes) | planeado | Requerido por el mes a mes. |
| 1.14 | **Export a Excel** multi-hoja | planeado | Lo necesita también el Control de Netos para entregar resultados. |
| 1.15 | **Export / Import JSON** de sesión | planeado | — |
| 1.16 | **README** de uso para el equipo | planeado | — |
| 1.17 | **Fixtures** anonimizados + testing manual | planeado | Crucial para validar parsers y cálculos sin datos reales. |

Recomendación de orden: **1.13 → 1.10** (la definitiva habilita el mes a mes) y **1.14**
(export Excel) conviene priorizarlo porque lo comparten el flujo general y el Control de Netos.

---

## 3. Relevamiento abierto

- **Controles de Marval (`scope: 'cliente'` de MARVAL):** mencionados como "igual que este es
  de empresa", pero **no relevados** en detalle uno por uno. Hay que entender qué controla
  cada uno para ver si comparten piezas con el Control de Netos. No inventar — relevar con el
  equipo.

---

## 4. Parking lot relacionado (de `ROADMAP.md`, sin priorizar)

- Reglas personalizadas de alerta ("si concepto X cae >Y% mes a mes, alertar").
- Cruce por CUIL como alternativa a legajo.
- Autodetección de mapeo de columnas (heurísticas).
- Integración con monday.com para crear items cuando se detectan diferencias críticas.
- Plantillas de agrupadores/configs compartibles entre clientes similares.

---

## 5. Secuencia sugerida (resumen)

1. **Control de Netos** (`specs/spec-control-netos.md`) — el mecanismo de scope y el filtro
   por cliente que necesita **ya existen** (D-015); no son precondición a construir, solo hay
   que registrar el control con `scope: 'cliente'`.
2. **Export a Excel** (1.14) — lo usan los dos flujos.
3. **Definitiva + mes a mes** (1.13 → 1.10).
4. **Sesiones / JSON / README / fixtures** (1.12, 1.15, 1.16, 1.17).
5. **Calculadora de Brutos** (§1, este documento) — al final, validada contra varios meses,
   con la red del Control de Netos ya funcionando.
