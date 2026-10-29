# Spec — Rendimiento vs Asiento (Marval): CC por código, provisiones SAC, directores por persona

**Estado:** implementado el 2026-10-28 (commit `f48c75b` más un arreglo posterior: lo no repartido por persona tampoco pasa por los redirects por nombre) — decisión D-101. Aprobado por Willy: "vamos por código"; directores = "subir el listado de Marval tal cual". Pendiente de que Willy lo pruebe en pantalla con los archivos de 10-2026.

## Por qué
Desde 10-2026 la Contabilidad Desglosada (CONTA) de Marval parte los centros de costo en sub-centros con
nombre y código nuevos (ID_CENTRO_COSTO `04.01` "Asesoramiento BAN", `05.05` "Contencioso PRE", `01.01`
"Finanzas 002", etc.). El control junta CONTA con el Rendimiento por NOMBRE de CC → Asesoramiento y
Contencioso quedan sin asiento y 16 sub-centros sueltos "sólo en CONTA". Además el Reporte de Rendimiento
renombró dos columnas y el Paso 2 ya no las detecta. Y "Directores" (CC 13) no es un área: cada director va
a un área distinta del Rendimiento.

## Cambio 1 — Reporte de Rendimiento: alias de columnas de provisión
`js/parsers/rendimientoParser.js`, `REND_COL_MAP`: sumar
- `PROVISIÓN SAC MES` / `PROVISION SAC MES` → `provMesColumn`
- `PROVISIÓN SAC CARGAS SOCIALES MES` / `PROVISION SAC CARGAS SOCIALES MES` → `provCcssColumn`
Encabezados reales de 10-2026: `["__EMPTY","CENTRO COSTO","PRECIO","ASIGNACIÓN ESTIMULO","RETIROS",
"CARGAS SOCIALES (Sin sac)","PROVISIÓN SAC MES","PROVISIÓN SAC CARGAS SOCIALES MES","COSTO TOTAL"]`.
Verificado: con esas columnas asignadas, PROV. MES y PROV. CCSS de CONTA (cuentas 5208007/4/3 y conceptos
de PROV. CCSS) cierran al centavo contra ellas en 7 de 10 áreas — es el mismo contenido renombrado.
Los nombres viejos siguen funcionando.

## Cambio 2 — CONTA → área del Rendimiento por CÓDIGO de CC
En `rvaConfig` (`DEFAULT_RVA_CONFIG` de `js/controls/rendVsAsiento.js`) sumar:
- `ccCodeMap`: lista `[{ code, to }]` — código de CC contable → nombre del área en el Rendimiento.
- `ccPorPersona`: lista de códigos de CC que se reparten persona por persona con el listado (ver Cambio 3).

Semilla (D-035: semilla, no identidad; tabla de Araceli "DIMENSIONES - Listado con cc y rendimiento",
hoja "Detalle 09-2026", más el Rendimiento real de 10-2026):
| code | to |
|---|---|
| 01 | Servicios Legales |  ← FIN 002/003. Marval confirmó Servicios Legales el 2026-10-29 (antes Araceli había propuesto Administración); el Rendimiento de 10-2026 todavía los trae en Servicios Legales y cierran ahí. Se cambia desde la pantalla, sin commit.
| 3  | Administración |
| 04 | Asesoramiento |
| 05 | Contencioso |
| 6  | Marcas-Teconología-PI |  ← así, con el typo, es como lo nombra el Rendimiento
| 7  | Marketing |
| 8  | Patentes |
| 9  | RRHH |
| 10 | Servicios Comunes |
| 11 | Servicios Legales |
| 12 | Sistemas |
`ccPorPersona` semilla: `['13']` (Directores).

Reglas de match (el código viene de `row.id_centro_costo`, que `parseConta` ya lee; puede venir como número
`3` o texto `'04.01'`):
- Por **segmentos separados por punto**, sin ceros a la izquierda en cada segmento: `'04'` == `'4'`,
  `'04.01'` == `'4.1'`. Una entrada matchea un código si sus segmentos son prefijo de los del código:
  `'04'` agarra `'04.01'`…`'04.08'` y también `'4'` (CONTA de 09-2026 tenía `4` "Asesoramiento").
  **`'1'` NO agarra `'10'`, `'11'`, `'12'`, `'13'`** (prefijo por segmento, no por texto).
- Gana la entrada más específica (más segmentos): `'04.03' → X` le gana a `'04' → Asesoramiento`.
- Precedencia por fila de CONTA: (a) si el código está en `ccPorPersona` y hay listado con ese legajo →
  área del listado; (b) si matchea `ccCodeMap` → `to`; (c) si no, lo de hoy: `ccRedirects` por nombre y
  si no, el CC_NOMBRE tal cual. Las filas sin código siguen exactamente igual que hoy.
- Lo que no matchea nada NO se completa con nada: sigue saliendo como "sólo en CONTA" (visible).
- Cuando una fila se traduce por código, el detalle conserva el CC original (`ccOriginal`, como ya hace el
  redirect) para que el analista vea de dónde vino.

Config guardada vieja (D-039: lo guardado gana): un `rvaConfig` guardado en `controlConfigs` ANTES de este
cambio no tiene las claves `ccCodeMap`/`ccPorPersona`. Si la clave **no existe** (`undefined`) → se usa la
semilla; si existe y es `[]` → se respeta vacía. Sin esto, el analista de Marval que ya había guardado
config nunca vería el cambio.

Editor (`js/ui/rendVsAsientoConfigEditor.js`): dos campos nuevos, en el mismo estilo que el de redirects
(`ccRedirects`, textarea "uno por línea"):
- "Centro de costo de la Contabilidad → área del Rendimiento (por código)": líneas `04 → Asesoramiento`.
- "Centros que se reparten persona por persona (con el listado de CC x Empleado)": códigos separados por
  coma o línea, ej. `13`.
Textos en español argentino, llanos (Willy no es programador; el analista tampoco). Colores de
`css/tokens.css`, nada de hex. `esc()` en todo lo que vaya a un template.
El panel que muestra la config aplicada en Resultados (hoy lista `ccRedirects`, ~líneas 414–477 de
rendVsAsiento.js) también lista la tabla por código y los códigos por persona.

## Cambio 3 — Directores persona por persona con el listado de Marval
`js/parsers/ccXEmpleadoExcel.js`: además del formato actual (`EMPLEADO` + `CENTRO_COSTO`, primera hoja),
aceptar el listado de Marval tal cual lo manda: encabezados `ID_EMPLEADO`, `FEC_ALTA_EMPLEADO`,
`ID_CC_CONTA`, `ID_CONTA`, `ID RENDIMIENTO`, `RENDIMIENTO`, `ID_EMPRESA` (fila 1), en **todas las hojas**
(trae "Activos" y "Bajas"). En ese formato: `id_empleado` ← ID_EMPLEADO, `centro_costo` ← RENDIMIENTO,
`id_centro_costo` ← ID_CC_CONTA. Si no reconoce ninguno de los dos formatos, error que diga qué esperaba y
qué encontró (ya lo hace para el formato viejo). Puede haber una 8ª/9ª columna sin título con notas: ignorar.

En `runRendVsAsiento`: si `ccPorPersona` NO está vacío, el override de CC x Empleado aplica **sólo** a las
filas de CONTA cuyo código está en `ccPorPersona`. Si `ccPorPersona` está vacío, el override se comporta
como hoy (todas las filas). Motivo: con el listado completo (545 legajos) subido, pisar todo taparía
diferencias reales — p. ej. un legajo que la Contabilidad tiene en Servicios Comunes y el Rendimiento en
Servicios Legales tiene que seguir saltando.
Clave de legajo: `makeLegajoKey(mapping.legajoKeyMode)` (ya se usa), nunca trim a mano.

Aviso (no default silencioso): si hay filas de CONTA con código en `ccPorPersona` que no se pudieron
repartir (no se subió el listado, o el legajo no está en el listado), quedan con su CC_NOMBRE (→ salen "sólo
en CONTA") **y** el resultado lleva un aviso en pantalla que diga cuántos legajos de qué centro no se
pudieron repartir y qué hacer ("subí el listado de CC x Empleado" / "el legajo no figura en el listado").
Usar el mecanismo de avisos que ya tenga el control (buscar `issues`/`renderIssues`/warnings en
rendVsAsiento.js); si hay que sumar un campo al summary, que no rompa `tests/resumenContract.test.js` ni el
semáforo (unidad sigue siendo 'cc').

## Cambio 4 — Legajos que el Rendimiento pone en otra área (2026-10-29, D-103)
Config `legajoAreas: [{ legajo, to, motivo }]`, semilla `[]` (el repo es público: el analista carga el legajo
una vez en el Paso 2). Las filas de la CONTA de ese legajo se comparan en el área `to`, con el legajo comparado
por la clave del cliente. Precedencia por fila: en un centro de `ccPorPersona` manda el listado y la regla no se
aplica; en cualquier otro centro la regla gana sobre la tabla por código y sobre el nombre, sin pasar por los
redirects. Resumen: aviso celeste con lo movido por categoría y total, y aviso de regla sin uso (no aparece en la
CONTA / ya viene en el área destino / sólo tiene filas de un centro por persona). Planilla: CONTA ya movida, con
etiqueta "+ N legajo(s) de otra área" / "− N legajo(s) movido(s)" y el detalle en el `title`. Excel: columna
"Movido por regla de legajo" en "Detalle por empleado". Test: `tests/rendVsAsientoLegajoArea.test.js`.

## Números de aceptación (archivos reales de 10-2026, verificados con el código actual + config manual)
Con la config por defecto nueva, mapeo AUTO-detectado del Rendimiento, CONTA completa y el listado de Marval
como CC x Empleado, el control tiene que dar exactamente:
- Cierran (|dif| ≤ 0,05 en todas las categorías): Marcas, Patentes, Contencioso, Asesoramiento, Sistemas,
  RRHH, Marketing.
- Servicios Legales: dPrecio −3.390.000,00; dCargas −904.806,87; dProvMes −1.291.043,47;
  dProvCcss −347.290,70; dTotal −5.933.141,04.
- Servicios Comunes: lo mismo con signo +: dTotal +5.933.141,05.
- Administración: dPrecio +105.556,00, resto 0; dTotal +105.556,00.
- `ccsSoloEnConta` vacío; `noCategorizadas` 0.
Sin el listado: Directores sale "sólo en CONTA" con total 223.675.424,65 y aparece el aviso.
Los archivos reales de 10-2026 se subieron a mano en la sesión y **nunca entran al repo**. La prueba que cubre
estas reglas con datos inventados es `tests/rendVsAsientoCcCode.test.js`.
