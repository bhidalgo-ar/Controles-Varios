# Control Acreditaciones (Axton) — spec

**Estado:** en implementación (modo "Generar Reporte").
**Origen del pedido:** Guillermo, 2026-08-05. Archivos de referencia: export
`contacred` de Axton de Plastic Omnium Pilar 07-2026 (865 filas) y el
`Control_Acredit.` armado a mano sobre ese mismo período (hoja `CONTROL` + 14
hojas de detalle).

## Para qué sirve

Ordenar las acreditaciones de un cliente de todo el mes en un archivo limpio y
detallado: una hoja por acreditación real (tipo de liquidación × fecha de
acreditación) más una hoja `CONTROL` que las lista con su fecha y su total.

Hoy el analista lo arma a mano partiendo el export de Axton. El control lo
genera desde el archivo crudo.

**Alcance:** todos los clientes Axton (`scope: 'sistema'`,
`sourceSystems: ['axton']`). El export `contacred` respeta el mismo formato en
todas las cuentas de Axton (confirmado por Guillermo), así que el reporte no es
específico de POP.

**Es el primer control Axton del proyecto.** Los otros 11 son de reportes Meta4
(ver D-015). No abre el adaptador Axton completo que PLAN_v2 §0.3 dejó fuera de
alcance: es un control puntual sobre un archivo puntual.

## Modos

| Modo | Estado | Qué hace |
|---|---|---|
| Generar Reporte | en implementación | Arma el .xlsx de acreditaciones desde el export de Axton. |
| Controlar | pendiente | Cruzará las acreditaciones contra el Tabulado. Sin definir todavía. |

## Archivo de entrada

Export `contacred` de Axton, formato fijo. La fila 1 es un separador (`----`);
los encabezados están en la fila 2 y los datos arrancan en la 3. La última fila
es `TOTAL GENERAL` (se descarta por no tener legajo).

Encabezados: `Legajo`, `Apellido y Nombre`, `CUIT`, `Cliente`, `U.O. Cliente`,
`U.O. Propia`, `Liquidacion`, `Neto`, `Grupo`, `Día de Pago`, `Listado`,
`Descripcion`, `Procesado en Movimiento`, `Fecha de Movimiento`, `Estado`,
`Fecha Estado`, `Fecha Acreditacion`, `Cta Debe`, `Cta Haber`, `Lugar de Pago`,
`Forma Cobro`, `Banco`, `Sucursal`, `Nro. Cta Bancaria`, `CBU`, `Empresa`.

Particularidades verificadas sobre el archivo de julio de POP:

- Una fila por **legajo × liquidación**. El legajo es numérico; `Neto` numérico;
  `Fecha Acreditacion` es fecha real.
- El `CBU` viene con un **espacio duro (` `) adelante** y tiene 22 dígitos:
  hay que limpiarlo y tratarlo como texto o Excel lo pasa a notación científica.
- Hay filas **sin `Neto` y sin `Listado`**: son liquidaciones que no acreditan
  (en POP, 305 filas de `z PLASTIC - Provisiones`). Se descartan.
- Hay filas **con `Listado` y sin `Neto`**: empleados incluidos en el listado de
  pago sin importe (4 en julio). **Entran al reporte** — son justamente lo que el
  analista tiene que mirar.
- Hay filas **con `Neto` y sin `Listado` ni `Fecha Acreditacion`** (147 en julio,
  todas de 1era Quincena). Entran, con la fecha heredada (ver más abajo).

## Reglas

### 1. Qué filas entran

Entra la fila que tenga `Listado` **o** `Neto`. Cierra exacto contra el archivo
de julio: 556 con importe + 4 con listado sin importe + 305 descartadas = 865.

### 2. Cómo se agrupan las hojas

Clave = **(tipo de liquidación normalizado, fecha de acreditación)**. No es el
`Listado`:

- Dos listados del mismo pago se **mergean** (en julio, `rio` + `otros`:
  18268+18269, 18325+18326, 18327+18328).
- Un mismo listado se **parte** si tiene dos liquidaciones distintas (el 18268 se
  abre en anticipos de sueldo y anticipo de vacaciones).
- Dos textos crudos distintos que normalizan al mismo tipo en la misma fecha
  mergean (en julio, la lista del 23-07 junta `(Anticipos 07-2026 -)` con
  `(Anticipos 07-2026)`).

### 3. Tipos de liquidación

Se normalizan por patrón sobre el texto crudo de Axton. Cada tipo tiene código
(para el nombre de la pestaña), etiqueta y orden:

| Código | Etiqueta | Orden |
|---|---|---|
| `A`   | Anticipos de sueldo    | 10 |
| `AV`  | Anticipo de vacaciones | 20 |
| `1Q`  | 1era Quincena          | 30 |
| `2Q`  | 2da Quincena           | 40 |
| `M`   | Mensual                | 50 |
| `SAC` | SAC                    | 60 |
| `B`   | Bono                   | 70 |
| `LF`  | Liquidación Final      | 80 |

Los tipos de cada cuenta salen del propio archivo, no de una lista cerrada: si un
texto no matchea ningún patrón, el tipo se arma con la etiqueta limpia del texto
crudo y un código derivado de sus iniciales (orden 90, al final). Nunca se
descarta una acreditación por no reconocer su tipo.

El orden de la tabla es el que da el archivo armado a mano (para el 16-07:
anticipos → vacaciones → 1era quincena → liquidación final).

### 4. Fecha de acreditación faltante

**Ancla principal: el Listado.** Un Listado es un envío real al banco — si algún
empleado de ese Listado tiene fecha, todos la comparten. Una fila sin fecha
hereda la de su Listado cuando ese Listado tiene **una sola** fecha conocida
entre todos sus empleados.

**Fallback: la liquidación cruda, sólo para filas sin Listado.** Si la fila no
tiene Listado (el caso menos común — un anticipo suelto sin listado ni fecha),
se busca una fecha única entre todas las filas que comparten el mismo texto de
liquidación, tenga o no Listado. Si hay más de una fecha en el mes (caso típico
de los anticipos, que se pagan varias veces), no se adivina.

**Si no hay ancla resoluble, la fila va a un grupo pendiente — nunca a filas
sueltas.** La clave del grupo es el Listado (`L:<listado>`) o, si no hay
Listado, la liquidación cruda (`Q:<liquidación>`). Esto es deliberado: cuando
**todos** los empleados de un Listado están sin fecha (agosto de POP: el
Listado 18336 completo, 13 empleados, ningún dato de fecha en el archivo), el
reporte lo trata como **un solo** problema a resolver — una alerta, no trece
(D-025) — y ofrece un campo para asignar la fecha a mano en la pantalla de
resultados.

**Asignación manual y regeneración (D-025).** Al asignar una fecha a un grupo
pendiente, sus filas se unen a la lista existente de ese mismo tipo+fecha si
hay una, o forman una lista nueva si no — exactamente la misma regla de
agrupación que las fechas que vienen del archivo. El reporte (pantalla + .xlsx
exportable) se regenera al instante, sin volver a cargar el archivo ni pasar
por el wizard. La asignación se puede deshacer.

Esto deja afuera, a propósito, las reclasificaciones de criterio: en julio de POP
un anticipo de 1.337.491 sin listado ni fecha lo puso el analista a mano en la
hoja de 1era Quincena. El reporte no adivina eso — lo manda a un grupo pendiente
y lo avisa en la app; es el analista quien decide qué fecha corresponde.

### 5. Corte por empresa

Configurable (`splitByEmpresa`, default activado): si el archivo trae más de una
`Empresa`, las listas se parten por empresa; con una sola empresa el toggle no
tiene efecto. POP tiene una.

### 6. Orden y numeración

Fecha ascendente → orden del tipo → empresa. Numeración `1..N` en ese orden.
`SIN ASIGNAR` no se numera y va al final.

## Salida — el .xlsx

Réplica del archivo armado a mano, con las mejoras aprobadas por Guillermo.

### Hoja `CONTROL`

Encabezado (cliente + período), y una fila por lista:

`Lista` · `Liquidación` · `Fecha de acred` · `Fecha de paga` · `Listado` · `Total`

(+ `Empresa` sólo si se está partiendo por empresa.)

`Fecha de acred` y `Fecha de paga` llevan la misma fecha: no deben diferir
(confirmado por Guillermo). El `Total` de cada lista es una **fórmula** que
apunta al total de su hoja.

Cierre al pie, todo con fórmulas:

```
TOTAL ACREDITADO      =SUMA(totales de las listas)
Sin asignar           ='SIN ASIGNAR'!D1          (sólo si hay)
Total archivo Axton   <literal, leído del origen>
Diferencia            =TOTAL + SIN ASIGNAR − TOTAL ORIGEN   → tiene que dar 0
```

El "Total archivo Axton" es un literal a propósito: es el ancla independiente
contra la que se valida el reporte. Si fuera una fórmula sobre nuestras propias
hojas, el cierre daría 0 siempre y no probaría nada.

### Hojas de detalle

Una por lista, nombradas `NN CODE DD-MM` (`01 A 02-07`, `07 1Q 16-07`,
`13 2Q 30-07`, `14 M 30-07`).

- Fila 1: título (`cliente · tipo · fecha`) y el total, para no tener que bajar
  200 filas.
- Fila 2: encabezados — `Legajo`, `Apellido y Nombre`, `CUIT`, `Neto`,
  `Fecha Acreditacion`, `Banco`, `CBU`.
- Datos ordenados por apellido y nombre.
- Fila final: `TOTAL` con fórmula.
- `CUIT` y `CBU` como texto; `Neto` con formato `#,##0.00`; fecha como fecha real
  (serial, para no depender de la zona horaria del navegador).
- Encabezados congelados y autofiltro.

## Salida — la app

Lo que **no** va al Excel se muestra acá (ver el guardrail de D-020): conteo de
empleados por lista, excepciones, bancos y alertas de integridad. Patrones de UI
obligatorios de `CLAUDE.md` §11 y del skill `nuevo-control`: hero, semáforo,
ocultar filas/columnas sin valor real, paginación, buscador y menú de export.

La pantalla sigue la vista estándar (`specs/vista-estandar-resultados.md`): tres
solapas `Resumen · Fichas · Planilla`. **Fichas** (tanda 8) es una tarjeta por
**lista** de acreditación, no por legajo — la unidad de este control es la
acreditación y no el empleado-mes (D-021), la única excepción conocida a
consolidar por legajo. Cerrada: número de lista, `código — liquidación`,
empresa, fecha de acreditación, cuántas acreditaciones tiene y qué hoja del
`.xlsx` es. Abierta: la tira del listado de pago al total que va al banco, el
desglose por banco, las alertas de esa lista por tipo con el detalle fila por
fila, y una conclusión que dice qué resolver antes de mandarla. El aviso de
grupo pendiente y las fechas asignadas a mano se ven arriba de las tres
solapas, no sólo dentro de Planilla (D-081).

Alertas que calcula la app:

- fila en listado de pago **sin importe**;
- **grupo pendiente** (un Listado, o una liquidación sin Listado, completo sin
  fecha resoluble) — una alerta por grupo, no una por empleado (D-025);
- **duplicado exacto** (mismo legajo, importe, fecha y tipo más de una vez);
- **CBU compartido** entre dos legajos distintos;
- **CBU inválido** (largo distinto de 22 o con caracteres no numéricos);
- **neto ≤ 0**.

Cada grupo pendiente tiene, en la misma pantalla, un campo de fecha y un botón
"Asignar" — al usarlo, el reporte (pantalla y .xlsx) se regenera con esa fecha
aplicada. Las asignaciones del run quedan listadas con un botón "Deshacer".

En el archivo de julio de POP no salta ninguna alerta salvo las 4 filas sin
importe y el grupo pendiente del anticipo suelto sin listado ni fecha — el resto
sale limpio. En el
archivo de agosto, el Listado 18336 (13 empleados, ninguno con fecha) aparece
como un solo grupo pendiente, no como 13 alertas sueltas.

## Verificación contra el archivo real

El reporte generado sobre el export de julio de POP tiene que dar:

- 14 listas numeradas, con los totales del archivo armado a mano (10.000.000 /
  3.050.000 / 679.083,12 / 4.900.000 / 2.490.000 / 7.663.072,73 / 228.072.216 /
  230.113 / 3.300.000 / 528.175,76 / 2.000.000 / 25.142.085,13 /
  173.511.494,10 / 363.376.148,53);
- 1 grupo pendiente (clave `Q:Anticipo de sueldo...`, sin Listado) con 1 fila de
  1.337.491 (el anticipo que el analista reclasificó a mano);
- `TOTAL ACREDITADO` 824.942.388,37 + sin asignar 1.337.491 = 826.279.879,37 =
  `TOTAL GENERAL` del origen, `Diferencia` 0,00.

La lista 7 da 228.072.216 y no 229.409.707 justamente porque el 1.337.491 del
criterio manual queda separado.

Sobre el export de agosto de POP (`contacred.20260806...`, 23 filas, Listados
18335/18336/18338/18339, todos "Anticipo de sueldo"): tiene que dar 2 listas
(18335 → 2026-08-04, 6 empleados, 3.630.000; 18338+18339 → 2026-08-06,
4 empleados, 1.200.000) y **1** grupo pendiente (`L:18336`, 13 empleados,
9.950.000) — no 13 alertas sueltas. Al asignarle 2026-08-04 al grupo pendiente,
se une a la lista del 18335 (mismo tipo A, misma fecha): 19 empleados,
13.580.000, `Diferencia` sigue en 0,00.
