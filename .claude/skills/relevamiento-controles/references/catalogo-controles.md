# Catálogo maestro de controles de payroll — H&A

Versión: 1.0 — 15/08/2026
Origen: relevamiento Plastic Pilar (POP) 07-2026 + revisión de Guille (v3 aprobada con observaciones)
Estados de referencia: los "Estado POP" reflejan a Plastic Pilar en agosto 2026. Para otro cliente, el estado se releva de cero; el catálogo (familias, controles, cruces) es el mismo.

Cómo leerlo: cada control dice QUÉ cruza y CONTRA qué. La condición de falla fina, las excepciones y la acción al fallar NO viven acá: se capturan por control con la skill `controles-payroll` antes de construir nada.

---

## Prerrequisitos (no son controles; sin ellos su familia no arranca)

| ID | Qué es | Bloquea |
|---|---|---|
| A0 | **Jerarquía de fuentes**: por dato, qué archivo tiene el valor definitivo (padrón, importador, tabulado, nómina declarada en F.931). La nómina del F.931 es el ancla propuesta: declara a todos los que tuvieron liquidación en el mes y el organismo la valida contra el registro de altas y bajas. | Familia A |
| E0 | **Registro de oficios judiciales**: legajo, carátula, monto total, cuotas, saldo. Hoy el saldo vive solo en el sistema. Guille está buscando cómo recolectar estos datos. | E1, E2, E3 |
| B0 | **Template de novedades por sistema**: formato definido de planilla del cliente y de importador, por sistema de liquidación. **Contestado para Axton (2026-08-20, D-070):** el template común es el propio importador `F2_Consolidada`, presente en los 7 clientes Axton relevados — no hace falta negociar nada con los clientes. Queda pendiente para Meta4. Detalle: `specs/familia-novedades-axton.md` | B1 escalón 1, B2 |

## Pieza común T — Lector de tabulado

Consumida por A1, B2, C1–C4, G1–G6, H2, I1. No tiene pantalla propia. Detector de formato construido el
2026-08-18 (`js/parsers/tabFormatDetector.js`), todavía sin cablear a ningún control — detalle en
`specs/lector-tabulado-formatos.md` y D-065.
- Detecta el formato por la firma del archivo (Meta4 horizontal / Axton completo / Axton sólo-Imp), nunca
  por el cliente.
- Ubica campos por nombre y conceptos por código, nunca por posición (en POP el tabulado pasó de 116 a 128 columnas entre quincenas del mismo mes).
- Compara layouts entre dos archivos y avisa qué columnas entraron o salieron.
- Si un campo esperado falta, corta con error claro, no devuelve un número mal.
- **No normaliza unidades**: entrega las cantidades tal como vienen, con su código de concepto; la
  conversión (horas jornalizadas / días mensualizados) es responsabilidad del control que las consume
  (D-065 — corrige lo que decía esta versión del catálogo).

---

## Familia A — Cobertura de nómina, altas y bajas

| ID | Control | Cruza | Contra | Estado POP |
|---|---|---|---|---|
| A1 | Cobertura de legajos | Nómina declarada del período | Legajos con recibo | Sin cubrir |
| A2 | Altas del mes | Novedad de alta con fecha de ingreso | Primera liquidación: proporcionalidad, categoría, convenio, obra social | Sin cubrir |
| A3 | Bajas del mes | Novedad de baja con fecha y causal | Liquidación final: SAC prop., vacaciones no gozadas, preaviso/integración según causal, y que no falte ningún concepto obligatorio del período | Sin cubrir |
| A4 | Alta y baja registral | Movimientos del registro de altas y bajas | Altas y bajas liquidadas | Sin cubrir |
| A5 | Legajo fantasma | Legajo con recibo | Padrón: existe, activo, sin egreso anterior | Sin cubrir |
| A6 | Cierre de tres puntas | Nómina declarada | Legajos liquidados Y registro de altas y bajas, a la vez | Sin cubrir |

Evidencia POP: rechazo del lote LSD por legajos con liquidación final sin 1Q a los que faltó un concepto (→ también I6). A6 replica el cruce que hace el organismo.

## Familia B — Novedades y trazabilidad

**B1 — Validador de novedades antes de importar.** Tres escalones (definidos por Guille):
1. Template único compartido con el cliente (estado deseado).
2. Autoparseo: detectar pestaña, fila de cabeceras y columnas solo.
3. Si el autoparseo no alcanza, preguntar al liquidador (pestaña / fila de cabeceras / columna de arranque) y guardar la respuesta por cliente.

Validaciones (iguales en los tres escalones): legajo inexistente o egresado, concepto fuera del manual del cliente, legajo+concepto duplicado en el período, requeridos vacíos en altas, formato CUIL/CBU, valor fuera de rango vs histórico. Estado POP: parcial (el importador marca requeridos, nadie valida antes de subir).

**B2 — Trazabilidad novedad → recibo**, en dos saltos separados porque fallan distinto:
- B2a: planilla original del cliente vs importador (error de transcripción).
- B2b: importador vs tabulado/totalizador liquidado, por legajo y concepto (error de importación).
- B2c: registro de que se controló, archivado por período.

Requiere B0 (template por sistema, cada sistema con sus inputs). Anotado y NO desarrollado: una ejecución previa de normalización — decidir antes de correr estos controles en Loopsys, no antes de construirlos. Estado POP: sin cubrir.

**Actualización 2026-08-20 (D-070), para Axton:** B2a se disuelve por diseño — la app **genera** el importador desde la planilla del cliente (control N1 del repo, con validación del analista en pantalla), así que no hay transcripción que controlar. B2b se construye como control N2 (importador vs Tabulado + Totales de Concepto). Roadmap y formato relevado: `specs/familia-novedades-axton.md` del repo Controles-Varios.

## Familia C — Remuneración, categoría y valores parametrizados

| ID | Control | Cruza | Contra | Estado POP |
|---|---|---|---|---|
| C1 | Cambio de básico | Novedad de incremento o escala de convenio | Básico liquidado por legajo | Sin cubrir |
| C2 | Cambio de categoría | Novedad de recategorización | Categoría y básico liquidados (que una arrastre la otra) | Sin cubrir |
| C3 | Sueldo sin novedad | Básico que cambió | Existencia de novedad que lo justifique | Sin cubrir |
| C4 | Valores parametrizados | Tabla de parámetros vigente (D7) | Valor efectivamente liquidado | Sin cubrir |

Nota: lo comparativo entre períodos y versiones NO va acá, va en G (decisión de Guille, 15/08). Evidencia POP para C4: conceptos de valor variable actualizados por ticket manual 7 veces en 3 meses, sin verificación posterior.

## Familia D — Bases imponibles, topes y tabla de parámetros

| ID | Control | Qué verifica | Estado POP |
|---|---|---|---|
| D1 | Aportes personales | Recalc. jubilación, INSSJyP, obra social vs liquidado | Cubierto (Control CCSS) |
| D2 | Contribuciones patronales | Recalc. contribuciones y OS patronal, neto de detracción | Cubierto (Control CCSS) |
| D3 | ART | Alícuota variable sobre base + fijo | Cubierto (Control CCSS) |
| D4 | Tope imponible | Tope al legajo correcto, base correcta según tipo de liquidación | Parcial — **[FALTA criterio de Guille: el tope depende del tipo de liquidación, definir]** |
| D5 | Base remunerativa vs no remunerativa | Cada concepto pega en las bases que le corresponden, solo en esas | Sin cubrir |
| D6 | Mínimo imponible | Legajos con base bajo el mínimo y su efecto en detracción/contribuciones | Sin cubrir |
| D7 | Tabla de parámetros | Ver detalle | Sin cubrir |

**D7 — Tabla de parámetros con vigencia** (pedido explícito de Guille, "muy valiosa"; C4, D4, D6 y parte de F dependen de ella):
- Cada parámetro con fecha desde/hasta: alícuotas, topes, mínimo, detracción, valores de conceptos variables, escalas.
- Resuelve el valor según la FECHA DE EJECUCIÓN de la liquidación, no el valor de hoy.
- Editable a mano; cada cambio registra quién y cuándo.
- Valor vencido sin reemplazo → avisa, no arrastra el último conocido.

Evidencia POP para D6: ticket escalado al proveedor por detracción "faltante" que era bruto bajo el mínimo del SIPA. Trampa conocida en D3: el rótulo de columna puede estar redondeado (2,47%) y la fórmula bien (2,472%) — no "corregir" la fórmula al rótulo.

## Familia E — Embargos, cuota alimentaria y terceros

| ID | Control | Qué verifica | Estado POP |
|---|---|---|---|
| E1 | Continuidad | Embargo que venía y este mes no aparece, o reaparece terminado | Sin cubrir |
| E2 | Acumulado | Suma de descontado período a período vs total del oficio | Sin cubrir (necesita E0) |
| E3 | Tope de embargabilidad | Descuento ≤ porcentaje legal sobre parte embargable del neto | Sin cubrir |
| E4 | Sindicatos y terceros | Alícuota vs base por afiliado, y coincidencia con archivo al sindicato | Parcial |

Sin E0 solo se puede E1 (comportamiento, no saldo). Evidencia POP: ticket por embargo ya saldado que seguía arrastrando saldo; el archivo al sindicato con alícuotas distintas al reporte interno y encoding roto.

## Familia F — Ganancias (alcance reducido por decisión de Guille: va al final, muchas variables)

| ID | Control | Qué verifica | Estado POP |
|---|---|---|---|
| F1 | Retenido entre períodos | Variación del impuesto retenido por legajo — vive DENTRO de G3, no es herramienta aparte | Sin cubrir |
| F2 | Validador SIRADIG | Lo declarado por el empleado vs lo cargado — esperando HTML que sube Guille | Pendiente de Guille |
| F3 | Deducciones, acumuladores y SAC teórico | Recálculo completo | Diferido |

Anotado para F3 (no perder): la planilla actual devuelve deducción 0 en silencio cuando la clave familiar+período no está en la tabla; no cruza contra retención real; el SAC teórico se arma a mano (no existe como concepto) unificando dos descargas de acumuladores con columnas distintas.

## Familia G — Diferencias entre períodos y entre versiones

| ID | Control | Qué verifica | Estado POP |
|---|---|---|---|
| G1 | Variación entre quincenas | Valor hora, neto, puesto, altas/bajas, 1Q vs 2Q | Cubierto (pop-variaciones-quincena.html) |
| G2 | Variación entre meses | Ídem mes vs mes, umbral configurable | Parcial |
| G3 | **Diferencia entre períodos** (nombre de Guille) | Qué hay hoy que no había en la quincena/mes anterior: conceptos nuevos, conceptos que dejaron de aparecer, legajos que entran/salen. Incluye impuesto retenido (F1) | Sin cubrir |
| G4 | **Diferencia entre versiones** (nombre de Guille) | Qué cambió vs lo ya liquidado del mismo período. Esperable: altas, bajas, cambios de novedades. Lo que no encaja ahí es lo que se mira | Sin cubrir |
| G5 | Netos imposibles | Neto negativo, neto 0 con conceptos, neto > bruto, descuentos > haberes | Sin cubrir |
| G6 | Reconstrucción de variaciones | Calcular Variación y % desde tabulados (el reporte del sistema las devuelve vacías) | Sin cubrir |

G3/G4 pueden trabajar sobre totalizadores o tabulados. Evidencia POP: concepto 800100 indebido en anticipos dos veces en 5 días (G3 lo atrapa); reporte de variaciones con columnas vacías en todas las filas (G6).

## Familia H — Pago y acreditaciones

| ID | Control | Qué verifica | Estado POP |
|---|---|---|---|
| H1 | Cuadre de acreditaciones del mes | Trailer de cada .txt a banco vs detalle; tabla de tandas automática; total del mes vs neto de totales por concepto | **Cubierto — ya construido en el repo.** Usa templates de Axton, debería servir para todo cliente Axton; puede variar la salida específica de POP. Pendiente: probar con otro cliente |
| H2 | Cotejo por legajo | Neto liquidado vs acreditado por legajo sumando tandas; liquidados sin pago y pagados sin liquidación; CBU cambiado o repetido; dígito verificador CUIL/CBU; vs acreditación efectiva cuando esté | Sin cubrir — extiende H1, medio camino hecho |

Formato .txt a banco (Axton): ancho fijo, registros H (CUIT+tipo 01 Río / 03 otros por CBU + nro de envío), D (legajo, período, nombre, CUIL, CBU, fecha AAAAMMDD, neto 15 díg. 2 dec. implícitos), T (total 30 díg. + cantidad 7 díg.). Cada fecha se parte en envío "rio" (nómina propia) y "otros" (transferencias). El PDF espejo del sistema trae Cantidad y total al pie. El .txt puede agrupar por CBU filas que el PDF muestra separadas (cantidad distinta, importe igual: esperado, no error).

## Familia I — Cierre fiscal y contable

| ID | Control | Cruza | Contra | Estado POP |
|---|---|---|---|---|
| I1 | Libro de sueldos digital | Remuneraciones del libro | Tabulado por legajo y tipo de remuneración | Sin cubrir |
| I2 | Declaración jurada | Bases y aportes declarados | Bases y aportes liquidados | Sin cubrir |
| I3 | Asiento contable | Debe y haber | Totales por concepto: balancea, neto en cuenta correcta | Sin cubrir |
| I4 | Contabilidad desglosada | Asiento resumido | Desglose por centro de costo y unidad de negocio | Parcial |
| I5 | Recibos emitidos | Cantidad de recibos | Legajos liquidados, sin duplicados ni faltantes | Sin cubrir |
| I6 | Acumuladores antes del lote | Acumuladores del período | Ninguno negativo ni vacío antes de generar el archivo al organismo | Sin cubrir |

I6 sale de la única causa raíz documentada del trimestre POP: acumulador 1200 en negativo (faltó concepto 900012 en liquidaciones finales sin 1Q) → lote LSD rechazado, detectado recién al subirlo. I3/I4: antes del control, fijar cuál es el reporte contable vigente (el proveedor da de baja el actual).

---

## Orden de construcción (tandas, revisado por Guille 15/08)

| Tanda | Qué | Por qué |
|---|---|---|
| 1 | T, G5, I6, H2 | Cero decisión pendiente. T habilita el resto; G5/I6 son chequeos de segundos con daño real documentado; H2 extiende H1 ya construido |
| 2 | D7, G3, G4, G6, C4 | D7 es "muy valiosa" y C4/D4/D6 dependen de ella; G3/G4 atrapan lo que aparece en la ticketera |
| 3 | A1, A5, A6, D6, C1–C3, B1 | Necesitan A0 definido o D7 poblada; B1 espera la decisión del template |
| 4 | A2–A4, B2, D4, D5, E, I1–I5, F | Bloqueados por definiciones (tope, oficios, template por sistema, reporte vigente, HTML SIRADIG) |

## Pendientes de definición (a quién)

1. **[Guille]** Criterio de tope imponible según tipo de liquidación → D4.
2. **[Guille + proveedor]** Qué conceptos pegan en cada base y excepciones legítimas → D5.
3. **[Guille + cliente]** Registro de oficios judiciales: se arma, quién lo mantiene → E0.
4. **[Guille]** Jerarquía de fuentes por dato → familia A.
5. **[Guille + comercial]** Template de novedades: único o por cliente → B1.
6. **[Proveedor]** Reporte contable vigente → I3, I4.
7. **[Guille]** HTML del validador SIRADIG → F2.
8. **[Guille]** ¿El detalle de acreditación efectiva (contacred) se sigue bajando? ¿Dónde queda? → H2.
9. **[Proveedor]** ¿El cambio de layout del tabulado fue puntual o recurrente? → T.
10. **[Guille + cliente]** ¿La planilla original del cliente se guarda tal como llega? → B2a.

## Transferibilidad

- Genéricos tal cual: A1, G5, G3, G4, H1, H2, I6 (cambia padrón y manual de conceptos, no la lógica).
- Genéricos con parámetros: D, F, E (misma lógica; alícuotas, topes y convenio en D7).
- Específicos por cliente: corte por banco de tandas de pago, formato del entregable.
- El paso que lo hace transferible de verdad: manual de conceptos y padrón de cada cliente en un formato único que los controles lean.

## Mapeo contra el repo Controles-Varios

Estado al 15/08/2026. Verificar siempre contra `js/controls/registry.js`, que manda sobre esta tabla. Detalle completo en `repo-controles-varios.md`.

| Control del catálogo | `id` en el repo | Scope actual | Qué haría falta |
|---|---|---|---|
| H1 · Cuadre de acreditaciones | `acreditaciones_reporte` | sistema: axton | Nada para clientes Axton. Para otros sistemas, adaptador |
| G1 · Variación entre quincenas | `pop_variaciones` | cliente: POP | Ampliar scope a otros clientes Axton |
| G2 · Variación entre meses | `variaciones_sueldos`, `variaciones_conceptos` | cliente: POF | Ampliar scope; hoy con conceptos fijos de POF |
| F3 · Acumuladores y SAC teórico | `acumuladores_ganancias` | sistema: axton | Construido, sin verificar end-to-end en POP |
| I3 · Asiento contable | `finadiet_asiento` | cliente: FINADIET | Construido y **sin verificar contra archivo real**. No contar como cobertura |
| I4 · Contabilidad desglosada | `rend_vs_asiento` | cliente: MARVAL | Lógica cercana, generalizable |
| C1 · Cambio de básico | `brutos` | cliente: MARVAL | Compara SAL_BASE vs Tabulado. Base para C1 |
| D5 · Bases rem. vs no rem. | `nr` | cliente: MARVAL | 18 conceptos NR de Meta4, 8 sin verificar. Base para D5 |
| A1 · Cobertura de legajos | `cat_x_empleados` | cliente: MARVAL | Compara empleados por categoría vs Tabulado. Parcial |
| G5 · Netos imposibles | — | — | Especificado para Sportline, **trabado por definiciones** |
| Resto del catálogo | — | — | Sin construir |

Otros del repo sin equivalente en el catálogo: `rend_vs_tabu`, `rend_x_ee`, `gs_pers` (todos MARVAL), `agrupadores` (general, `hidden: true`).

**Trampa a evitar:** todos los `appliesWhen` del repo devuelven `true`. Lo que segmenta es `scope` y `scopeMeta`. Leer solo `appliesWhen` lleva a concluir que todo aplica a todos.

## Proceso acordado (no saltearlo)

1. Relevar cliente con la skill `relevamiento-controles` → mapa de cobertura cruzado contra el repo.
2. Willy revisa el mockup y aprueba o ajusta.
3. Por cada control aprobado, **registrar el criterio en el tablero *Catálogo de Controles de Payroll*** (monday, board `18426712423`, workspace Operaciones): qué mira, contra qué, condición de falla, acción si falla, excepciones conocidas. Es el registro compartido del equipo — 46 ítems ya precargados el 15/08/2026, uno por control del catálogo (buscar el ítem antes de crear uno nuevo). Nada se construye sin criterio escrito.
4. **Volcar al repo**: la configuración del cliente al seed (`controlConfigs[]`, hoy vacío para los 21 clientes que no son Marval), y el control nuevo con la skill `nuevo-control` del propio repo.
5. Terminado = un usuario real lo usó y funcionó.
6. Cada causa raíz nueva de un ticket → excepción registrada en el control correspondiente del tablero, y actualización de este catálogo.

No hace falta actualizar ninguna skill para registrar un control.
