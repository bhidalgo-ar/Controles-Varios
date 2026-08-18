---
name: spec-html
description: "Armar un mockup HTML interactivo y anotable para que el usuario revise una propuesta antes de implementarla, y leer la revisión que devuelve. Usar cuando haya que definir algo visual, estructural o de flujo y el usuario tenga que aprobarlo: specs de implementación de clientes, planes de features o herramientas, documentación de procesos, reportes y análisis para revisión. Disparar también ante 'armame un mockup', 'quiero verlo antes', 'mostrame cómo quedaría', 'necesito revisarlo con el equipo'. NO usar para respuestas conversacionales, ni cuando el usuario ya aprobó el diseño y solo falta ejecutar, ni para entregables que van a un cliente."
---

# Mockup HTML para revisión

## Qué problema resuelve

Cuando una propuesta se entrega en prosa o en markdown, la revisión vuelve en
prosa: "el segundo cuadro está mal, y el paso de validación cambialo". Eso
obliga a adivinar a qué se refiere cada comentario y a releer el documento
entero para ubicarlo.

Este flujo cambia el medio en las dos direcciones. La propuesta sale como HTML
interactivo con un identificador estable por bloque; la revisión vuelve anclada
a esos identificadores. El delta se lee en veinte líneas en lugar de releer el
documento.

## El loop

1. Armás el mockup con la capa de revisión incluida (`assets/review-layer.html`).
2. El usuario lo abre, marca cada bloque y escribe el motivo donde hace falta.
3. Aprieta "Copiar revisión" y pega el resultado en el chat.
4. Vos leés el delta anclado e iterás **solo** sobre lo marcado.

## Reglas del protocolo

**Un `data-rev` por bloque revisable.** Un bloque es una unidad sobre la que el
usuario puede tener una opinión independiente: una card, una sección, un paso
de un flujo, una columna de una tabla, un criterio. No poner `data-rev` en
elementos decorativos ni en contenedores que solo agrupan.

**IDs semánticos y estables.** `kpi-cobertura`, `paso-validacion-erp`,
`criterio-corte`. Nunca `div-3` ni `bloque-7`. Cuando itere, el mismo bloque
tiene que conservar su ID entre versiones, o el historial de revisiones deja de
servir.

**Granularidad: entre 8 y 25 bloques.** Menos de 8 y la revisión es tan gruesa
como un mail. Más de 25 y el usuario abandona a mitad de camino. Si el
contenido pide más, partirlo en dos mockups.

**Lo aprobado importa tanto como lo rechazado.** Un bloque marcado OK es una
instrucción explícita de no tocarlo en la iteración siguiente. Al iterar,
tratar los OK como congelados: si hay que cambiar uno por consistencia,
avisarlo antes en vez de hacerlo callado.

**Iterar sobre el mismo archivo, no empezar de nuevo.** La versión 2 del mockup
es la versión 1 con los cambios aplicados y los IDs intactos.

## Lo visual no se decide acá

Todo lo de paleta, tipografía, componentes y patrones sale de la skill
`hya-brand`, sección 10 (herramientas web internas de Payroll). Leerla antes de
escribir CSS. Nada de criterio visual propio, nada de inventar componentes que
ya existen ahí.

Lo único que este flujo agrega encima es la capa de revisión, que está en
`assets/review-layer.html` y se pega tal cual.

## Tipos de contenido

Cada tipo tiene su archivo de referencia con qué bloques lleva y cómo
granularlos. Leer el que corresponda, no todos:

| Tipo | Archivo |
|---|---|
| Spec de implementación de cliente | `reference/tipo-spec-implementacion.md` |
| Plan de feature o herramienta | *(pendiente)* |
| Documentación de proceso | *(pendiente)* |
| Reporte o análisis para revisión | *(pendiente)* |

## Verificar antes de entregar

Al terminar un mockup, correr estos chequeos sobre el archivo y reportar cada
falla con el bloque involucrado. Si algo falla, arreglarlo antes de entregar; no
entregar con la falla anotada.

1. **Cobertura.** Todo bloque de contenido sustantivo tiene `data-rev`. Si un
   bloque quedó sin él, el usuario no puede opinar sobre esa parte y no se va a
   dar cuenta de que le falta.
2. **IDs semánticos.** Ningún `data-rev` es posicional (`div-3`, `bloque-7`,
   `seccion-2`) ni genérico (`item`, `card`). Si no se puede nombrar
   semánticamente, probablemente no es un bloque revisable.
3. **IDs únicos.** No hay dos `data-rev` iguales en el archivo. Uno repetido
   hace que la revisión apunte a dos lugares y el delta se vuelve ambiguo.
4. **Granularidad.** Entre 8 y 25 bloques. Menos, la revisión es tan gruesa
   como un mail; más, el usuario abandona a mitad. Fuera de rango, partir o
   agrupar antes de entregar.
5. **Datos de nómina.** Ningún CUIL, CUIT, DNI, legajo, CBU, importe ni nombre
   de persona real. Si hay datos de ejemplo, están rotulados como ficticios de
   forma visible en el propio mockup, no solo en el mensaje. Si falta un dato
   real, aparece como `[FALTA: ...]` visible, nunca completado con un valor
   plausible. **Este chequeo no se saltea nunca, ni en un mockup de prueba.**
6. **Capa de revisión presente y funcional.** El bloque de
   `assets/review-layer.html` está pegado, y el botón de copiado existe. Un
   mockup sin capa de revisión rompe el loop entero.
7. **Marca.** Los colores y tipografías salen de `hya-brand` §10. No hay hex
   inventados fuera de la paleta ni de los colores de estado ya definidos ahí.

Si el chequeo 5 falla, es la única falla que además hay que informarle al
usuario explícitamente en el mensaje, incluso después de arreglarla.

## Gotchas

**El usuario no abre el archivo.** Si el mockup no llega como archivo que se
abre en el navegador, el flujo no arranca. En chat va como artifact HTML; en
Claude Code se escribe al disco y se le da la ruta. Nunca pegar el HTML en el
mensaje.

**Datos de nómina en el mockup.** Un mockup lleva estructura, no datos reales.
Si hace falta mostrar cómo se ve con datos, van rotulados como ficticios de
forma visible. Nunca CUIL, DNI, legajos ni importes reales de un empleado.

**La revisión llega incompleta.** Es normal que el usuario marque 6 de 20
bloques. Los no marcados no son ni OK ni rechazados: son sin revisar. No
asumir aprobación por silencio; preguntar si los omitidos quedan como están.

**Un comentario contradice a otro.** Pasa cuando la revisión la hicieron dos
personas o en dos momentos. Señalar la contradicción y preguntar, nunca elegir
una y seguir.

**El mockup se convierte en el entregable.** No es el objetivo. El mockup es un
paso de revisión; el entregable es lo que se construye después. Si el usuario
lo empieza a usar como documento final, avisarlo: le falta todo lo que un
documento necesita y sobra la capa de revisión.
