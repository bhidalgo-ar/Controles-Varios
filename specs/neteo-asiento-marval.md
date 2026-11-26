**Estado:** implementado — control `neteo_asiento_marval` del `CONTROL_REGISTRY`, cubierto por
`tests/neteoAsientoMarvalControl.test.js` (datos ficticios). Verificado el 2026-11-26 contra la
Contabilidad Desglosada real de Marval de 11-2026 (ver §6). Falta que lo use la analista con un mes
nuevo y que Marval reciba el archivo.

# Neteo del asiento — Marval (Meta4)

**Qué es:** un control de **generación** (`mode: 'Generar Reporte'`, `tabRequired: false`), sólo para
Marval (D-015). Entra la Contabilidad Desglosada de Meta4 y sale el asiento contable del mes ya
neteado, en el formato de siete columnas que Marval recibe hoy. Reemplaza la tabla dinámica que se
armaba a mano y el script de Python con el que se neteaba.

**De dónde viene:** pedido de Marval; las reglas las decidió Guille el 26/11/2026 (D200 del proyecto
de migraciones). La spec aprobada es el mockup `SPEC-neteo-asiento-marval-v1.html` (P1 a P9); la
implementación de referencia, el script `netear_asiento.py`. Los dos viven fuera de este repo.

---

## 1. El archivo de entrada

| Archivo | Tipo | Qué aporta |
|---|---|---|
| **Contabilidad Desglosada** de Meta4 | `conta_neteo_file` | Una fila por legajo × concepto, con cuenta, dimensión, centro, Debe y Haber |

Es el mismo Excel que lee Rendimiento vs Asiento (`conta_file`), pero con **su propio lector**
(`js/parsers/contaNeteoParser.js`) y su propio tipo de archivo:

- El asiento necesita **todas** las filas con cuenta. `contaExcel.js` descarta las que vienen sin
  nombre de centro de costo, y en Marval esas son las de pasivo y provisiones.
- La columna **NOMBRE2** del asiento es la **segunda** columna titulada `NOMBRE` de la desglosada, la
  que sigue a `ID_CENTRO_COSTO`. La primera `NOMBRE` es la del empleado y no se lee.
- La hoja se busca **por sus títulos de columna** (`CUENTA_CONTAB`, `N_CUENTA_CONTABLE`, `ID_CONTA`,
  `ID_CENTRO_COSTO`, `DEBE`, `HABER`), no por su nombre: el libro de Marval trae además una hoja con
  el asiento armado.
- Tipo aparte y no una opción de `conta_file` porque una corrida guarda un archivo por tipo: con el
  mismo tipo, el lector de un control pisaría al del otro.

Cuenta, dimensión, centro y nombres se guardan **como vinieron** (un número sigue siendo número) y
así salen en el asiento, salvo dos casos que salen como **celda vacía**: el centro que viene sólo con
espacios y el NOMBRE2 que viene como `Null` (la dimensión `Null` se deja como viene).

**Importes.** Una celda vacía se suma como cero. Un número escrito como texto se lee si el formato es
claro: argentino (`1.234,56`, `1234,56`) o plano (`1234.56`). Un solo punto con tres dígitos detrás
(`1.234`) es ambiguo y cualquier otro texto (`abc`, `Null`) no es un importe: los dos frenan (§3).
Si la hoja se reconoce como la desglosada (están al menos 4 de los 6 títulos) pero le falta una
columna, el error dice cuál.

## 2. Las reglas del neteo

1. **Clave:** cuenta + dimensión (`ID_CONTA`) + centro de costo (P9).
2. **Neto** = ΣDebe − ΣHaber, en centavos enteros (exacto). Positivo al Debe; negativo al Haber, en
   positivo; cero → la línea queda con 0,00 y 0,00 y se cuenta en "Para revisar".
3. **No se netean** las cuentas de **pasivo** —las que empiezan con el dígito configurado, `2` de
   inicio (P3)— ni las líneas **sin dimensión** (`ID_CONTA` vacío o `Null`). Quedan una línea por cada
   lado con importe, primero la del Debe.
4. **Orden:** por cuenta (como número), después dimensión, después centro. En el archivo la cuenta y
   su nombre van sólo en la primera línea de cada cuenta.

## 3. Los frenos

- **Importe que no se puede leer (frena):** no se arma el asiento y se informa cuántas filas, en qué
  columna (DEBE o HABER) y si es un texto o un número ambiguo. No se muestra ningún dato de la fila.
- **Regla de centros (P5, frena):** una dimensión con legajo (7mo tramo del `ID_CONTA`, distinto de
  `SIN_ASIGNAR`) no puede tener más de un centro; una sin legajo con más de un centro tiene que
  incluir el **centro compartido**, `13` de inicio (P4). Si no se cumple no se arma el asiento: la
  banda sale en rojo y lista cada dimensión con su motivo y sus centros. Las líneas sin dimensión no
  entran a esta regla.
- **Netear cambió la diferencia Debe − Haber (frena):** control interno; no debería pasar nunca.
  Con este freno la planilla se ve pero no se puede descargar.
- **Descuadre del detalle (P6, no frena):** si la desglosada ya viene con Debe ≠ Haber, se informa
  en "Para revisar" con el importe ("Detalle de Meta4 descuadrado en … (Haber mayor)").
- **Importes con más de 2 decimales (no frena):** se redondean al centavo como siempre y se avisa en
  "Para revisar" con la cantidad de filas.

## 4. La salida (P8)

`Asiento_Neteado_<período>.xlsx`, una hoja, desde "⬇ Exportar" de la solapa Planilla (también CSV y
Copiar). Columnas del contrato `neteo_asiento_marval`: CUENTA_CONTAB · N_CUENTA_CONTABLE · ID_CONTA ·
ID_CENTRO_COSTO · NOMBRE2 · Suma de DEBE · Suma de HABER, y la fila **Total general**. Los importes
con el formato contable de Excel (dos decimales, guion en los ceros), como el asiento de hoy. El
antes y el después de cada línea se ven en la Planilla, no en el archivo.

`audience: 'payroll'`: la dimensión lleva el legajo en su 7mo tramo porque así la arma Marval.

## 5. Configuración por cliente (Paso 2)

Panel "Neteo del asiento" (`js/ui/neteoAsientoMarvalConfigEditor.js`, clave
`neteo_asiento_marval_config`): el dígito de las cuentas de pasivo y el centro compartido. Sin
configurar viaja `null` y el control usa `2` y `13`. Un campo vacío no se completa solo: el control
no corre y dice qué falta.

## 6. Verificación contra el archivo real

Contabilidad Desglosada de Marval de 11-2026. El archivo no entra al repo y sus importes no se
escriben acá.

Contra los archivos reales del mes da el mismo asiento que el script de referencia: de 2.370 líneas
sin netear a 1.337 neteadas, con las mismas líneas (cuenta, dimensión, centro, Debe y Haber), en el
mismo orden y con los mismos totales; netear no cambia la diferencia Debe − Haber que trae el
detalle. Dos copias de la desglosada alteradas a mano (una dimensión con legajo en un segundo
centro; una sin legajo con dos centros sin el 13) frenan las dos con la regla de centros.

## 7. Pendientes

- [FALTA: que Marval reciba bien el formato. El asiento neteado todavía no se le mandó (D200).]
- [FALTA: qué analista lo usa todos los meses y desde cuándo.]
- Probarlo en el navegador, en los tres temas, con el archivo real.
