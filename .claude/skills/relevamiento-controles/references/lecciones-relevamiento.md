# Lecciones de relevamiento — acumuladas por cliente

Documento vivo. Cada relevamiento agrega las suyas al final, con cliente y fecha.
Leerlo completo ANTES de arrancar un relevamiento nuevo.

## POP (Plastic Pilar) — agosto 2026

### De método

1. **Partir del catálogo, no de las carpetas.** Listar lo que hay responde "qué se hace", no "qué falta". Un control inexistente no deja rastro. Este fue el error de la v1 del análisis de POP y obligó a rehacerlo entero.
2. **Hecho de archivo ≠ conclusión.** "No hay POP Control Acredit en Acreditaciones/07" era cierto; "falta el control de acreditaciones" era falso — estaba en Reportes/07 con el cruce completo. Buscar en todas las carpetas antes de declarar un faltante.
3. **Auditar antes de presentar.** De 8 hallazgos del relevamiento inicial, la auditoría adversarial refutó la conclusión de 1, degradó 2 a "parcial" y detectó 1 artefacto de truncamiento. Sin esa pasada, 4 de 8 afirmaciones llegaban mal al entregable.
4. **Lecturas truncadas generan coincidencias falsas.** "47 legajos acá y 47 allá" era un conteo sobre 82 filas leídas de ~105 contra un archivo completo. Nunca comparar conteos de fuentes con distinto nivel de lectura.
5. **Los nombres de un mismo cliente difieren por sistema.** SharePoint "Plastic Pilar", monday "PO Pilar", ticketera "Plasticomnium Pilar" (dropdown, filtrar por índice del label, no por texto). Resolver el mapeo antes de buscar.

### De datos

6. **Los layouts del tabulado cambian sin aviso, incluso dentro del mismo mes.** 1Q 116 columnas, 2Q 128: dos campos de ficha nuevos corrieron todos los conceptos dos posiciones. Leer por nombre de campo y código de concepto, jamás por posición.
7. **Unidades mezcladas:** novedades de jornalizados en HORAS, de mensualizados en DÍAS. Normalizar antes de comparar.
8. **El rótulo puede estar redondeado y la fórmula bien.** Control CCSS: rótulo "2,47%", fórmula 2,472%, y la fórmula es la correcta (da ≈0 contra lo liquidado). Quien "corrige" la fórmula al rótulo rompe el control.
9. **El .txt a banco agrupa por CBU filas que el listado PDF muestra separadas.** Cantidades distintas con importe igual = esperado, no error.
10. **En el crudo de acreditaciones de Axton hay filas de "Provisiones"** sin neto ni fecha que hay que descartar antes de cualquier cuadre.
11. **Los reportes nativos pueden venir con columnas clave vacías** (Variación y % en el variac de Axton, todas las filas). El dato "que falta" a veces hay que reconstruirlo desde los tabulados.

### De monday

12. **Los updates son la fuente, las columnas son el índice.** El campo Detalle puede estar vacío y la conversación real vivir en los updates de la ticketera. Leer updates en modo Board con includeItemUpdates.
13. **Un tablero "vacío" puede ser un registro interno deliberado.** PO Pilar - Solicitudes lo carga el equipo de H&A para llevar registro, no el cliente; el Detalle vacío no es un formulario roto. Preguntar quién carga cada tablero antes de diagnosticarlo.
14. **20 de 36 updates de la ticketera cierran sin causa raíz** ("listo, modificado"). No asumir que la resolución documenta el diagnóstico. Y las respuestas del proveedor a veces son imágenes adjuntas: límite explícito, no adivinar.
15. **Un ticket reincidente es la firma de un control que falta** (concepto 800100 indebido en anticipos, 2 veces en 5 días).
16. **Tickets de "error" que eran parámetros normativos** (detracción no liquidada por bruto < mínimo SIPA). Un control de mínimo imponible evita abrir y escalar el ticket.

### De entrega

17. **IDs data-rev estables entre versiones del mockup**, así la aprobación de Guille sobrevive a las iteraciones. Si un bloque aprobado (OK) tiene que cambiar por consistencia, avisarlo arriba de todo, nunca cambiarlo callado.
18. **Los OK de una revisión se congelan.** Solo se itera sobre CAMBIAR/SACAR/DUDA, y los no marcados se preguntan, no se asumen aprobados.

### De inventario previo (agregadas 15/08/2026)

19. **Cruzar contra el repo ANTES de proponer, no después.** El cuadre de acreditaciones se propuso como desarrollo nuevo y ya estaba construido en el repo desde antes. El repo es público: `git clone --depth 1 https://github.com/bhidalgo-ar/Controles-Varios.git`. Un clone shallow tarda segundos y evita el error más caro del relevamiento.
20. **Separar "construir" de "ampliar scope".** La mayoría de los controles del repo existen atados a un cliente vía `scope`. Para un cliente nuevo casi nunca hay que reescribir: hay que ampliar el alcance y configurar. El costo es de otro orden y el mockup tiene que decirlo.
21. **Construido no es verificado.** El repo tiene controles construidos y nunca probados contra archivo real (el asiento de Finadiet, 8 de 18 códigos NR de Marval). En el mockup van como cobertura parcial, no plena.
22. **Antes de proponer un tablero de monday, buscar si ya existe.** El tablero "(Interno) Marval - Detalle de Controles" ya tenía columnas Método (DataOK/Claude/Manual), Etapa, Explicación y Prompt, con un prompt completo cargado y funcionando. Estaba privado y scopeado a un cliente, pero la estructura ya estaba resuelta. Buscar con `search` tipo BOARD por "Controles", "DataOK" y el nombre del cliente antes de diseñar nada.
23. **Descartados como registro de controles, no volver a mirarlos:** "Checklist DataOK" registra inputs a subir, no controles; "Controles" y "Controles con Detalle" (workspace Testing) están abandonados desde 2024 con datos de prueba.
24. **El seed del repo tiene `controlConfigs[]` vacío para los 21 clientes que no son Marval.** El relevamiento no termina en un informe: su salida es lo que llena esa configuración. Decirlo en el mockup le da destino concreto al trabajo.

### Del tablero maestro (agregadas 15/08/2026)

25. **El tablero cross-cliente vive en Operaciones, no en Clientes.** *Catálogo de Controles de Payroll* (board `18426712423`) agrupa por familia, no por cliente: cada ítem es un control del catálogo, no un cliente ni un período. No confundirlo con los tableros de Solicitudes/Cronograma, que sí son por cliente.
26. **Costo y Estado describen el mejor estado conocido hoy, cruzando todos los clientes — no el estado para un cliente puntual.** Un control `scope: cliente` cuenta como "Construido"/"Ampliar scope" aunque para ESE cliente sea gratis: lo que mide es el esfuerzo de generalizarlo, no el esfuerzo para quien ya lo tiene. Para el estado de un control en un cliente nuevo, leer `Cliente` + `Sistema` + `Alcance` juntos, nunca solo `Estado`.
27. **`Cliente` sale del seed real (22 códigos), nunca inventado.** Antes de poblar esa columna hubo que releer `hya-controles-config.seed.json` vía `repo-controles-varios.md` — los nombres de cliente son datos, no se adivinan ni se completan por analogía.
28. **Condición de falla, Acción si falla y Excepciones nacen vacías a propósito.** El catálogo maestro documenta qué cruza cada control contra qué, pero no cuándo falla ni qué hacer si falla — eso lo captura la skill personal `controles-payroll`, control por control, con un usuario real enfrente. Completar esas columnas sin esa entrevista sería inventar criterio.
29. **Los lotes de construcción no coinciden con las familias del catálogo.** Las familias A–I organizan el dominio de payroll; los lotes organizan el trabajo, y se agrupan por lo que comparten en la máquina: archivo de entrada, motor de comparación o decisión previa. Por eso el lote de comparadores mezcla G con F1, y el de chequeos de sanidad mezcla G5 con I5 e I6. Agrupar por familia habría dado lotes cómodos de leer e inútiles para ejecutar.
30. **Verificar lo construido es un lote propio y va casi primero.** F3, I3 y H1 están construidos y nunca corrieron contra un archivo real — I3 con riesgo declarado alto ("número mal pero coherente"). Eso no es "trabajo terminado", es deuda escondida, y sale más barato que cualquier control nuevo. Va en Cowork con los archivos reales, no en Claude Code.
31. **Migrar a código lo que hoy funciona en Excel es trabajo real que ningún estado captura.** El Control CCSS (D1, D2, D3) figura como "Cubierto a mano / Ya está" y por eso desaparece de cualquier lista de pendientes — pero mientras viva en una planilla no es transferible al equipo. Quedó como último lote: no urgente, tampoco inexistente.
32. **Una fuente contradijo a otra y se dejó anotado, no resuelto en silencio.** El catálogo ubica a G5 en la tanda 1 ("cero decisión pendiente"); `repo-controles-varios.md` dice que está bloqueado por dos definiciones de Meli. Ninguna de las dos fuentes es claramente la vieja — se anotó la discrepancia en el ítem del tablero en vez de elegir una a ciegas.
