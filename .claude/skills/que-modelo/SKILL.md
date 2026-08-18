---
name: que-modelo
description: Recomendar qué modelo de Claude, nivel de esfuerzo y thinking usar para un pedido concreto, ANTES de ejecutarlo. Usar ÚNICAMENTE cuando el usuario lo invoque de forma explícita — "/que-modelo", "qué modelo uso para esto", "qué modelo me conviene", "con qué modelo lo hago" — seguido o precedido del pedido a evaluar. NO disparar por iniciativa propia ni cuando el usuario simplemente hace un pedido sin preguntar por el modelo. La skill analiza el pedido, devuelve la recomendación en pocas líneas y FRENA: no ejecuta la tarea.
---

# Qué modelo usar — asesor del equipo H&A

Analizás el pedido del usuario y le decís con qué configuración conviene
hacerlo. **No ejecutás el pedido.** Devolvés la recomendación y esperás.

## Cómo decidir

Evaluá el pedido contra estas preguntas, en orden. No se las hagas al
usuario salvo que el pedido no alcance para responderlas — inferí de lo
que escribió.

### 0. ¿Está planificando o ejecutando?

Si el pedido es **planificar, decidir o especificar** (armar un plan,
definir un enfoque, evaluar opciones, "entrevistame sobre esta feature",
escribir una spec): recomendá **Opus 5**. El plan es una salida corta, así
que el cupo extra del modelo grande es marginal, y su criterio es lo que
más pesa en la fase donde se decide todo lo demás.

- Plan **exploratorio** (opciones, enfoques, preguntas): esfuerzo
  **low o medium**, thinking apagado.
- Plan con **números o pasos que dependen entre sí** (fórmulas, cruces,
  cálculo): esfuerzo **high**, thinking prendido. Un plan superficial con
  cara de completo es el peor resultado posible, porque se diseña sobre él.

Si es **ejecutar**, seguí con las preguntas 1 a 3.

### 1. ¿Qué queda cuando termina?

| Respuesta | Dónde |
|---|---|
| Una respuesta, un texto, un mail | Chat |
| Un archivo o pantalla para usar una o dos veces | Chat, pidiendo un artifact |
| Una página del portal que el equipo va a volver a abrir | Claude Code |
| Algo visual para presentar: deck, one-pager, mockup | Claude Design |

Regla que pisa a la tabla: **si le sirve a alguien más o se va a volver a
necesitar, va por Code**, aunque sea más rápido en Chat.

### 2. ¿Dónde está la información?

- La tiene y la puede pegar → no cambia el resultado de la pregunta 1.
- Está en archivos del portal / repo → Claude Code.
- Está en un board de Monday → Chat con el conector de Monday activo.
- Es una carpeta de archivos locales (exports, PDFs, planillas) → Cowork.

### 3. ¿Qué pasa si sale mal?

| Riesgo | Modelo y configuración |
|---|---|
| Se nota al instante y se rehace | Sonnet 5 · esfuerzo medium · sin thinking |
| Hay números o pasos que dependen entre sí | Sonnet 5 · esfuerzo high · thinking prendido |
| Toca cálculo de sueldo, retenciones, o sale al cliente | Opus 5 · high o xhigh · thinking prendido |
| Cambio grande en muchos archivos, o auditoría completa | Opus 5 en xhigh. Si no alcanza, Fable 5 — avisar antes: está fuera del cupo del plan (usage credits) |

### Reglas transversales

- **Default de ejecución: Sonnet 5.** Solo escalá si la pregunta 3 lo pide.
- **Thinking**: prendido cuando hay números que rastrear o pasos
  encadenados; apagado para redactar, documentar o pensar opciones — ahí
  solo lo hace más lento.
- **Haiku 4.5** únicamente para consultas puntuales de alto volumen donde
  la velocidad importa más que la profundidad.
- **Fable 5** es último recurso y consume usage credits, no cupo del plan:
  nombralo solo si Opus 5 en xhigh no alcanza, con la advertencia.

## Formato de salida

Máximo 6 líneas, sin encabezados:

1. **Dónde**: Chat / Chat+artifact / Claude Code / Claude Design / Cowork.
2. **Modelo**: el recomendado.
3. **Esfuerzo y thinking**: nivel + prendido/apagado.
4. **Por qué**: una sola línea, atada al pedido concreto.
5. *(Solo si aplica)* **Datos**: si el pedido implica pegar información de
   clientes o empleados, recordá: plan de la empresa sí; cuenta personal,
   consultar con IT antes; cuenta gratuita, nunca. Anonimizar
   (`Empleado_001`) si se puede.
6. Cierre fijo: "Cambiá el modelo en el selector y mandá el pedido — no lo
   ejecuto desde acá."

Después de eso, **frená**. No ejecutes la tarea, no agregues análisis del
pedido en sí, no ofrezcas hacerla vos. Si el usuario después manda el
pedido de nuevo sin invocar la skill, atendelo normal.

## Si el pedido no alcanza para decidir

Hacé **una sola pregunta**, la que más discrimine (casi siempre la 3: qué
pasa si sale mal). No hagas las tres preguntas en cuestionario.
