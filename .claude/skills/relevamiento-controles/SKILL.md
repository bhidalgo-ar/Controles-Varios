---
name: relevamiento-controles
description: "Relevar todo el circuito de liquidación y control de un cliente de payroll de H&A — carpetas de SharePoint, tableros de monday con sus updates — cruzarlo contra el catálogo maestro de controles Y contra lo ya construido en el repo Controles-Varios, y entregar un mockup HTML anotable con el estado de cobertura y por dónde seguir. Disparar ante 'quiero revisar todo de [cliente]', 'relevá los controles de [cliente]', 'qué controles le faltan a [cliente]', 'repliquemos el análisis de POP en [cliente]', 'mapa de cobertura de controles'. NO usar para capturar el criterio fino de un control puntual, ni para construir un control (eso es la skill nuevo-control del propio repo)."
---

# Relevamiento de controles por cliente

## Por qué existe

Sale del relevamiento de Plastic Pilar (agosto 2026) y de sus dos errores, que
esta skill existe para no repetir:

1. **Partir de las carpetas en vez del catálogo.** Listar lo que hay responde
   "qué se hace hoy", no "qué habría que hacer". Un control que no existe no
   deja rastro en SharePoint.
2. **Proponer construir algo que ya estaba construido.** El cuadre de
   acreditaciones se propuso como desarrollo nuevo y ya vivía en el repo. Por
   eso el cruce contra el repo es la primera fase, no la última.

El resultado alimenta tres cosas: el mockup que revisa Willy, el registro del
control en el tablero **Catálogo de Controles de Payroll** de monday (board
`18426712423`, workspace **Operaciones** — ver Fase 6), y —lo más concreto—
el `controlConfigs[]` del seed del repo, que hoy está vacío para los 21
clientes que no son Marval.

## Reglas no negociables

- **Nunca inventar ni completar datos de empleados, clientes o personas.** Si
  un dato no está, se escribe "no visible". Tampoco en ejemplos.
- **Hecho ≠ conclusión.** "No hay archivo X en la carpeta Y" es un hecho.
  "Falta el control X" es una conclusión que exige haberlo buscado en las
  demás carpetas Y en el repo. En POP el control existía en otra carpeta con
  otro nombre.
- **Todo hallazgo que va al entregable pasa por el agente `auditor`.** Lo que
  no confirma se presenta como parcial o no verificable, nunca como cerrado.
- **Los entregables no llevan datos de nómina.** Ni legajos, ni CUIL, ni CBU,
  ni nombres, ni importes de personas. Códigos de concepto y de acumulador sí,
  porque son configuración.

## Fase 0 — Alcance

Confirmar con AskUserQuestion antes de tocar nada:

1. Qué cliente, y **cómo se llama en cada sistema**. Suelen ser tres nombres
   distintos: SharePoint, monday Solicitudes y la ticketera. En POP eran
   "Plastic Pilar", "PO Pilar" y "Plasticomnium Pilar".
2. Qué período se releva. Un ciclo mensual completo es el mínimo útil.
3. Eje: validación de datos, proceso, o ambos.
4. Entregable: mockup anotable (default) o informe.

Verificar que estén conectados Microsoft 365 y monday. Sin alguno, avisar qué
pata queda coja y seguir con la otra.

## Fase 1 — El repo, PRIMERO

Antes de relevar nada, saber qué ya está construido. El repo es público:

```bash
git clone --depth 1 https://github.com/bhidalgo-ar/Controles-Varios.git cv-repo
```

Leer `references/repo-controles-varios.md` (de esta skill) y contrastarlo con
`cv-repo/js/controls/registry.js`. Ese archivo de referencia trae el inventario
de controles construidos, la forma del objeto del registry, cómo funciona
`scope`/`scopeMeta`, el schema del seed, y qué quedó especificado sin
construir. Si el registry del repo tiene entradas que la referencia no lista,
el repo manda: la referencia quedó vieja y hay que actualizarla al terminar.

Anotar tres listas antes de seguir:

- **Construido y genérico** (por ejemplo `acreditaciones_reporte` y
  `acumuladores_ganancias`, con `scope` por sistema de origen): candidatos a
  aplicar al cliente nuevo casi sin trabajo.
- **Construido pero atado a otro cliente** (la mayoría tiene
  `scope: cliente`): candidatos a generalizar, no a rehacer.
- **Especificado y sin construir** (roadmap y `specs/`): si el relevamiento lo
  pide, ya hay diseño y no hay que empezar de cero.

## Fase 2 — SharePoint

Estructura típica: sitio **Payroll → Documentos compartidos → Empresas →
[cliente]**, con subcarpetas por función (Liquidaciones, Novedades,
Acreditaciones, Reportes, Cargas Sociales, Libro Ley, L.L. Digital, Ganancias,
Sicore, Cronogramas, Facturación) y dentro año/mes. Los papeles de trabajo
personales viven aparte, en OneDrive
(`H&A/07_Proyectos/00_Papeles de Trabajo/Controles Varios/Clientes/[cliente]`
en el caso de Willy). Buscar los dos lugares: los controles hechos a mano
suelen estar en el segundo.

Para el circuito de liquidación y control alcanza con Liquidaciones,
Novedades, Acreditaciones, Reportes y papeles de trabajo del período elegido.

Cómo relevar:

- Lanzar **un agente `relevador` por carpeta, en paralelo**, cada uno
  escribiendo fichas `.md` en el workspace: una por archivo, con nombre,
  hojas, filas × columnas, encabezados completos textuales, fórmulas que
  reporte la lectura y máximo 3 filas de ejemplo. Más un `INVENTARIO.md` por
  carpeta.
- Los archivos de control se documentan con precisión de fórmula: qué columna
  compara qué contra qué.
- Los `.txt` de banco se describen por formato (ancho fijo, registros H/D/T,
  qué campo en qué posición), sin volcar datos.
- Anotaciones sueltas y mails `.eml` se transcriben literales: son la
  explicación en palabras de quien hace el control hoy.

## Fase 3 — monday

Tres fuentes, en el workspace **Clientes** y en el de Soporte:

1. **[Cliente] - Solicitudes.** Ojo: en varios clientes lo carga el equipo de
   H&A como registro interno, no el cliente. Que el Detalle esté vacío no
   significa que el tablero esté roto. Preguntar quién lo carga antes de
   diagnosticar.
2. **[Cliente] - Cronograma de Liquidación.** Grupos por mes. Da el mapa de
   tareas y responsables del ciclo.
3. **📞 Ticketera Soporte** (board `5171238580`). Acá está el registro real de
   qué falló. La columna de cliente es un dropdown: **filtrar por índice
   numérico del label, no por texto**, que devuelve vacío.

**Leer siempre los updates, no solo las columnas.** Con `get_updates` en modo
Board, `includeItemUpdates: true` y rango de fechas sale todo junto. La causa
raíz, cuando está registrada, está ahí. En POP solo 16 de 36 updates traían
diagnóstico, y varias respuestas del proveedor llegaron como imagen adjunta:
eso se asienta como límite, no se adivina.

Por ticket interesa: cómo se diagnosticó, quién lo detectó (H&A o el cliente),
y si la causa fue configuración, parámetro normativo, bug o carga. Cada causa
raíz alimenta un control del catálogo. Un ticket reincidente es la firma de un
control que falta.

Estas tres fuentes son por cliente. Hay una cuarta pieza de monday que es
cross-cliente y vive en el workspace **Operaciones**, no en Clientes: el
tablero *Catálogo de Controles de Payroll* (Fase 6). No hace falta tocarlo en
esta fase — se usa al cerrar el relevamiento.

## Fase 4 — Auditoría

Antes de armar el entregable, pasar los hallazgos centrales por el agente
`auditor` con la evidencia escrita en el workspace, pidiendo veredicto
CONFIRMADO / REFUTADO / NO VERIFICABLE con cita. Tres trampas que ya atrapó:

- El control "faltante" que existía en otra carpeta con otro nombre.
- La coincidencia numérica que era artefacto de una lectura truncada.
- El rótulo redondeado con la fórmula correcta (2,47% vs 2,472%): quien
  "corrige" la fórmula al rótulo rompe el control.

## Fase 5 — Mapa de cobertura

Leer `references/catalogo-controles.md` y asignar a cada control del catálogo
un estado **con evidencia y con el cruce contra el repo hecho**:

- **Construido** — existe en el registry del repo. Citar el `id` y si aplica a
  este cliente o hay que ampliarle el `scope`.
- **Cubierto a mano** — se hace, pero en una planilla. Citar el archivo.
- **Parcial** — existe incompleto o frágil. Citar qué parte.
- **Especificado** — está en `specs/` o el roadmap, sin construir.
- **Sin cubrir** — no existe, después de buscarlo en carpetas y en el repo.

Si la evidencia del cliente pide un control que el catálogo no tiene, se
propone como nuevo con su evidencia y **se actualiza el catálogo maestro**.
El catálogo es un documento vivo; cada relevamiento lo mejora.

## Fase 6 — Entrega y siguiente paso

El entregable es un mockup anotable hecho con la skill `spec-html` (que ya
aplica `hya-brand`): un bloque por familia con su tabla de controles y
estados, mapa de cobertura, orden de construcción por tandas, y pendientes de
definición con quién los debe responder. IDs `data-rev` estables entre
versiones, para que la aprobación sobreviva a las iteraciones.

El mockup tiene que separar explícitamente tres cosas, porque el costo de cada
una es muy distinto:

| Categoría | Qué implica |
|---|---|
| **Ya está** | Existe en el repo y aplica. Costo cero, solo verificar con datos del cliente |
| **Ampliar scope** | Existe para otro cliente. Se toca `scope`/`scopeMeta` y se configura, no se reescribe |
| **Construir** | No existe. Recién acá aplica el circuito completo de captura y desarrollo |

El registro compartido del equipo es el tablero de monday **Catálogo de
Controles de Payroll** (board `18426712423`, workspace **Operaciones**,
https://bhidalgo.monday.com/boards/18426712423). Nació el 15/08/2026 con 46
ítems — los 42 controles del catálogo maestro más A0/E0/B0 y T, con B2
desdoblado en B2a/B2b/B2c — agrupados en 11 grupos por familia. Columnas,
además de Nombre:

| Columna | Qué guarda |
|---|---|
| Cliente | Cliente(s) al que está atado hoy en el repo (`scopeMeta.clients`). Vacío si el alcance es general o de sistema — nunca completar a mano solo para "llenar el campo" |
| Alcance | Cliente específico / General de un sistema / Todos — mapea directo a `scope` del repo |
| Sistema | Axton / Meta4 / Manual / planilla / N/A — el sistema cuando el alcance es de sistema, o el del cliente cuando el alcance es de un cliente específico |
| Estado | Construido / Cubierto a mano / Parcial / Especificado / Sin cubrir — los mismos estados de la Fase 5 |
| Costo | Ya está / Ampliar scope / Construir — la misma tabla de tres categorías de más abajo |
| Tanda | 1–4 según el orden de construcción del catálogo, o N/A si ya está resuelto o no aplica |
| Orden + Lote | El plan de ataque real: qué controles se construyen juntos en una misma sesión de Claude Code, y en qué orden. 18 lotes (0 a 17). Todos los ítems de un lote comparten número de Orden. La vista *Plan de ataque (por lote)* del tablero ya viene ordenada y agrupada por acá |
| Dónde | Claude Code / Cowork / Chat |
| Modelo · Esfuerzo · Thinking | Configuración recomendada por la skill `que-modelo`, **por control individual**. Si corrés un lote entero en una sola sesión, usá el modelo y esfuerzo más altos del lote |
| Verificado con datos reales | Casilla. Construido no es lo mismo que verificado — hoy solo 5 de 46 ítems la tienen marcada (D1–D3, G1, H1) |
| Registry ID (repo) | `id` en `CONTROL_REGISTRY`, cuando existe |
| Qué mira / Contra qué | Precargadas desde el catálogo maestro |
| Condición de falla / Acción si falla / Excepciones conocidas | Vacías a propósito en los 46 ítems iniciales |

`Costo` y `Estado` describen el mejor estado conocido **cruzando todos los
clientes**, no el estado para un cliente puntual: un control `scope: cliente`
cuenta como "Ampliar scope" aunque para ese cliente ya sea gratis, porque lo
que mide es el esfuerzo de generalizarlo. Para el estado de un control en TU
cliente, cruzar `Cliente` + `Sistema` + `Alcance`, no leer `Estado` solo.

Lo mismo vale para `Orden`/`Lote`: son el plan **global** del repo, no el
plan de un cliente. Un relevamiento nuevo puede justificar adelantar un lote
—si el cliente sangra por ahí— pero eso se decide en el mockup, y si el orden
global cambia se corrige en el tablero, no solo en el informe del cliente.

El criterio de agrupación en lotes: **comparten archivo de entrada, motor de
comparación o decisión previa**. No agrupar por familia del catálogo — las
familias organizan el dominio, los lotes organizan el trabajo, y no coinciden
(el lote 6 mezcla G y F; el lote 3 mezcla G e I).

Con la revisión aplicada, el circuito para cada control aprobado es:

1. **Buscar el ítem en el tablero** (por nombre o por `ID — nombre` del
   catálogo). Si no existe —por ejemplo, un control que el cliente necesita y
   el catálogo maestro todavía no tiene—, crearlo ahí, no en un archivo local.
2. **Completar su criterio**: `Condición de falla`, `Acción si falla` y
   `Excepciones conocidas`. Nacieron vacías a propósito — se capturan control
   por control con la skill personal `controles-payroll`, nunca inventadas en
   el relevamiento.
3. **Actualizar `Estado`, `Costo`, `Cliente`, `Alcance`, `Sistema` y
   `Verificado`** si tu evidencia los corrige. El tablero es un documento
   vivo: si tu cliente prueba que un "Sin cubrir" ya está resuelto en otro
   lado, o que un "Construido" no le aplica, se corrige ahí mismo.
4. **Volcar la info al repo**: la configuración del cliente al seed
   (`controlConfigs[]`), y el control nuevo con la skill `nuevo-control` que
   vive en el propio repo (`.claude/skills/nuevo-control/`).
5. Terminado es cuando un usuario real lo usó y funcionó, no cuando está
   documentado.

No hace falta actualizar ninguna skill para registrar un control. Si alguna
vez leíste que había que sumarlo a `reference/controles/` y resubir la skill,
eso quedó obsoleto: el control se carga en el tablero maestro de monday y la
implementación va al repo.

## Gotchas

- **Los layouts cambian sin aviso, incluso dentro del mismo mes.** En POP el
  tabulado pasó de 116 a 128 columnas entre quincenas. Ubicar campos por
  nombre y conceptos por código, nunca por posición.
- **Unidades mezcladas.** Novedades de jornalizados en horas, de
  mensualizados en días. Normalizar antes de comparar.
- **Lecturas truncadas.** El conector corta archivos grandes. Toda conclusión
  sobre un archivo leído parcial se marca como parcial, y nunca se comparan
  conteos de una fuente completa contra una truncada.
- **`appliesWhen` no es donde vive la segmentación.** En el repo todos
  devuelven `true`; lo que segmenta de verdad es `scope` y `scopeMeta`. No
  concluir "este control aplica a todos" leyendo solo `appliesWhen`.
- **Construido no es lo mismo que verificado.** El repo tiene controles
  construidos y sin probar contra archivo real. Un control así no cuenta como
  cobertura plena en el mockup.
- **El relevador no concluye y el auditor no corrige.** Respetar el reparto:
  relevador junta, auditor refuta, el modelo principal decide, Willy aprueba.
