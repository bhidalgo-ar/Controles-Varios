# Tipo: spec de implementación de cliente

Para definir cómo se implementa un cliente nuevo o una migración de sistema
antes de tocar nada. El lector es el equipo interno de H&A, no el cliente.

## Bloques

Cada uno lleva su `data-rev`. Los marcados como opcionales se incluyen solo si
aplican; un bloque vacío es peor que un bloque ausente.

| `data-rev` | Contenido | Por qué es un bloque aparte |
|---|---|---|
| `alcance` | Qué entra y qué queda afuera de esta implementación | Es lo primero que se discute y lo que más se corrige |
| `sistema-origen` | De dónde vienen los datos, en qué formato, con qué frecuencia | Se aprueba o se rechaza independientemente del destino |
| `sistema-destino` | A dónde van, qué configuración requiere | Idem |
| `mapeo-datos` | Tabla campo origen → campo destino, con los que no tienen par | El bloque con más iteraciones, siempre |
| `datos-faltantes` | Qué hace falta pedirle al cliente antes de arrancar | Habilita o bloquea toda la implementación |
| `fases` | Las etapas con su condición de salida | Se reordena seguido |
| `validaciones` | Qué se controla en cada fase y contra qué | Criterio técnico, se aprueba por separado del cronograma |
| `responsables` | Quién hace qué: cliente, Administración H&A, Payroll H&A | Los tres tipos de recurso, uno por columna |
| `riesgos` | Qué puede salir mal y qué se hace si pasa (opcional) | Suele agregarse en la segunda vuelta |
| `salida-vivo` | Qué tiene que ser cierto para decir que el cliente está en vivo | Es la definición de terminado, se discute aparte |

Rango típico: 8 a 10 bloques. Si el `mapeo-datos` tiene más de 30 filas, darle
un `data-rev` por grupo de campos (`mapeo-legajo`, `mapeo-haberes`,
`mapeo-descuentos`) en lugar de uno solo, porque un rechazo global de la tabla
no dice nada sobre qué fila está mal.

## Cómo se ve

Componentes de `hya-brand` §10 que aplican acá:

- Tabla densa con `thead` sticky para el mapeo, y pills de estado en la columna
  de si el campo tiene par o no.
- Cards de KPI para el conteo de campos mapeados, sin par y pendientes.
- Barra de fases horizontal con la condición de salida de cada una visible, no
  escondida en un tooltip.
- Footer de herramientas internas.

Fila con stripe de estado en el borde izquierdo para los campos sin par:
`s-sinpar`. Los faltantes de datos del cliente van con `s-error`, porque
bloquean.

## Reglas de contenido

**Nada inventado.** Si no sabés el convenio, la fecha de alta o el formato de un
archivo, el bloque lo dice: `[FALTA: formato del export de Meta4]` visible en el
mockup, no un valor plausible. Un mockup con un dato inventado es peor que uno
incompleto, porque se aprueba sin que nadie note el problema.

**Cada fase con condición de salida explícita.** "Validación de ERP" no es una
fase, es un título. La fase es "Validación de ERP: termina cuando los 340
legajos del export coinciden con el maestro y las diferencias están
justificadas por escrito".

**Los tres tipos de recurso siempre separados.** Cliente, Administración H&A y
Payroll H&A tienen responsabilidades distintas y quien lee necesita ver la suya
sin filtrar. Una columna por tipo, no una lista mezclada con el nombre de la
persona.

**El bloque de datos faltantes va arriba, no al final.** Es lo que traba el
arranque. Si está en el pie del documento, se aprueba la spec completa y después
aparece que faltaban seis datos.

## Al iterar

El `mapeo-datos` es el que vuelve marcado más veces. Cuando venga con CAMBIAR
sobre un grupo, tocar solo las filas de ese grupo. El resto de la tabla está
implícitamente congelado incluso si no vino marcado OK, porque ya se revisó en
la vuelta anterior: si hay que cambiar una fila fuera del grupo marcado,
avisarlo antes.
