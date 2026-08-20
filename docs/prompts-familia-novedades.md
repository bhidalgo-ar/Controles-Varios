# Prompts de arranque — Familia de Novedades (Axton)

> Cuatro chats de Claude Code sobre este repo, en este orden. Cada uno abre en
> una rama nueva y termina en PR. La spec madre es
> `specs/familia-novedades-axton.md`; leerla es lo primero que pide cada prompt.
>
> **Modelo y esfuerzo recomendados por chat** (elegilos con `/model`):
>
> | Orden | Chat | Modelo | Esfuerzo / thinking | Por qué |
> |---|---|---|---|---|
> | 1 | Lector ExpNov (N0a) | **Opus 5** | **alto** | Muchos casos borde relevados; un parser permisivo de más produce el "número mal pero coherente" |
> | 2 | Parser Axton de Tabulado (N0b) | **Opus 5** | **alto** | Toca la pieza T que consumen varios controles; consolidación por legajo = el bug más caro del repo |
> | 3 | Generador de importador (N1) | **Opus 5** | **alto** | Diseño fino de mapeo + UI de validación; usar la skill `nuevo-control` |
> | 4 | Novedades vs Liquidación (N2) | **Opus 5** | **alto** | El cruce con las 4 bandas; depende de 1 y 2 |
>
> El 2 puede correr en paralelo con el 3 (no se pisan). El 4 recién cuando 1, 2
> y 3 estén mergeados (1 y 3 ya están). Sonnet 5 alcanza para retoques posteriores de UI o de
> textos sobre estos módulos, no para construirlos.

---

## Chat 1 — N0a: Lector de la familia ExpNov — **hecho (2026-08-20)**

```
Leé specs/familia-novedades-axton.md y DECISIONS.md D-070 antes de escribir nada.

Quiero el cimiento N0a: un parser en js/parsers/ para la familia de archivos de
novedades/importador de Axton (hoja "d  axFiles ...ExpNov..."). Reconoce por
firma, nunca por posición: encontrá la fila que contiene "Legajo" y "Apellido y
Nombres", la fila de códigos pegada a ella, y la fila de criollo si existe (puede
no existir, y puede estar todo corrido una fila para abajo con totales en la
fila 1 — los casos están en la spec, sección "Lo que NO es estable").

Devuelve: por celda cargada { legajo, codigo, cantidad, importe, unidadDeclarada },
separando el formato "cantidad$importe" de una celda; la lista de columnas SIN
código (con su rótulo y cuántas celdas cargadas tienen) — nada se ignora en
silencio; metadata (UO/empresa); y avisos: códigos duplicados en dos columnas,
códigos no numéricos (existe "SAL BAS"), hojas del workbook que no se leyeron,
valores no parseables. El período NO sale del archivo: lo declara el analista.

Validá la forma de lo leído y cortá con un error que diga qué se esperaba y qué
se encontró (CLAUDE.md, "un default silencioso es un bug"). Números con toNum()
de js/utils/currency.js; legajos crudos, sin normalizar acá (eso es del control
con makeLegajoKey).

Tests con datos inventados que cubran, como mínimo: conceptos que arrancan en
G, I, J y AF; bloque corrido una fila; sin fila de criollo; cantidad$importe con
muchos decimales; columna sin código con datos; código duplicado; SAL BAS; celda
vacía ≠ 0. Sumá el archivo de test a la cadena de package.json — un test fuera
de la cadena no lo corre nadie.

No toques ningún control existente. Terminá en PR con la doc al día
(documentalista antes de mergear).
```

## Chat 2 — N0b: Parser Axton del Tabulado + Totales de Concepto

```
Leé specs/familia-novedades-axton.md (sección "El lado liquidación"),
specs/lector-tabulado-formatos.md y DECISIONS.md D-065 y D-070 antes de empezar.

Quiero el cimiento N0b: que el repo pueda leer los Tabulados Axton reales de los
7 clientes relevados, extendiendo la pieza T (js/parsers/tabFormatDetector.js ya
detecta el formato; falta el parser robusto que lo consume). Tiene que bancar,
por firma y nunca por posición: preámbulo de 0, 1 o 2 filas (el campo "Reporte:"
del preámbulo distingue Resumen de Liquidacion / Consulta de Liquidacion /
Totales de Concepto); pares Cant/Imp (POP, Epiroc) y sólo-Imp (el resto);
TOTAL GENERAL una vez o duplicado arriba y abajo; fila por liquidación con la
columna "liquidacion" al final (un legajo hasta 3 veces -> consolidar los dos
lados con js/controls/consolidate.js y makeLegajoKey); filas agregadas a mano
DESPUÉS del TOTAL GENERAL (ignorarlas con aviso, no como datos); espacios duros
U+00A0 en encabezados; y encabezados de concepto "1000 - Sueldo Basico" (espacio
guion espacio, distinto del "4899-COCHERA_IG" de Meta4) — matchear por código.

Además: lector del reporte "Totales de Concepto" (hoja totalesconcepto.*,
preámbulo "----", código y rótulo en columnas separadas), porque el Tabulado NO
trae todos los conceptos liquidados (los casos verificados están en la spec) y
el control N2 lo va a necesitar como fuente complementaria.

Una cantidad ausente nunca se infiere (D-065). Tests con datos inventados para
cada variante de firma, en la cadena de package.json. No cambies el
comportamiento de ningún control existente en este PR — sólo dejá el lector
listo para que N2 lo consuma. PR con doc al día.
```

## Chat 3 — N1: Generador de importador de novedades — **hecho (2026-08-20)**

> Construido: control `novedades_importador`. Lo que quedó pendiente y por qué
> está en `specs/familia-novedades-axton.md` § "Lo que N1 espera de un archivo
> real" — el layout del F2 y el caso completo de SIASA 07/2026 necesitan un
> archivo real, que no entró al repo.

```
Leé specs/familia-novedades-axton.md y D-070, y usá la skill nuevo-control para
cablear los 5 puntos de integración. Depende del PR del lector ExpNov (N0a):
arrancá de main con eso mergeado.

Control nuevo, variante "Generar Reporte", scope sistema Axton: el analista sube
la planilla de novedades del cliente y la app le genera el importador
F2_Consolidada por unidad organizativa, listo para subir a Axton, con el formato
de celda cantidad$importe. Piloto: SIASA (4 UOs, tres capas guardadas) y Merz.

Reglas:
- Si la planilla trae códigos (la mayoría), se usan esos. Si una columna trae
  sólo nombre en criollo, se resuelve contra el catálogo del cliente
  (controlConfigs por [clientCode+controlId], editable en el Paso 2, sembrable
  desde el manual de conceptos del cliente). El criollo NUNCA decide solo: 17
  códigos con rótulo distinto entre archivos del mismo cliente están documentados
  en la spec. Lo que no se puede mapear no se inventa (D-039): se pide en el
  Paso 2 o sale en el reporte como "quedó afuera", con motivo.
- La pantalla de validación es parte del control: el analista ve QUÉ va a entrar
  al F2 (por UO: legajos, conceptos, totales por concepto) y QUÉ quedó afuera y
  por qué (columna sin código, fila sin legajo, valor no parseable) ANTES de
  descargar. Nada se ignora en silencio (D-070).
- Consolidación por legajo si la planilla trae un legajo repetido, con
  makeLegajoKey. Celda vacía no viaja al F2 (no es cero).
- El archivo generado lo recibe el propio analista (no Finanzas): puede llevar
  legajo y nombre, no CUIL ni CBU.

Verificación (D-064): reproducir de a UN caso el F2 real de SIASA 07/2026 desde
su planilla modificada — un legajo completo, con el cruce de control y la
descomposición de cualquier diferencia — y esperar mi confirmación antes de
generalizar. Ojo: en Aguas y Gaseosas hay un empleado que está en la planilla y no
en el F2 real; el generador tiene que mostrarlo como diferencia, no esconderlo.

Tests en la cadena. PR con doc al día.
```

## Chat 4 — N2: Control Novedades vs Liquidación

```
Leé specs/familia-novedades-axton.md y D-070, y usá la skill nuevo-control.
Depende de N0a, N0b y N1 mergeados: arrancá de main.

Control nuevo, scope sistema Axton: cruza el importador de novedades del período
(idealmente el generado y validado con N1) contra el Tabulado y el reporte
Totales de Concepto del mismo período. Por legajo+código, consolidando por
legajo LOS DOS lados (makeLegajoKey resuelto una vez en mapping.legajoKeyMode —
es el bug más caro del repo). Piloto: SIASA y Merz; prueba de volumen: POP (fila
por liquidación, un legajo hasta 3 veces).

Comparación (D-070): cantidad E importe cuando ambos lados los tienen. Cuando no
son comparables (novedad en días u horas contra un Tabulado sólo-importes, o
cantidad ausente en la variante sólo-Imp), NO bloquea ni aprueba: informa
claramente el motivo. Nada de convertir unidades (D-065). Diferencia = ambos
lados no-null y |diff| > tolerancia; null no es 0.

Resultados en cuatro bandas por legajo+concepto: coincide / difiere / no
comparable (informado) / sin contraparte. En "sin contraparte", distinguir con
el totalizador si el concepto no se liquidó o si el Tabulado no lo muestra (hay
conceptos liquidados sin columna — casos verificados en la spec). Las columnas
sin código que el lector reporta salen en una sección propia del resultado.
unitsTotal/unitsWithDiff en unidad 'legajo'; el semáforo sale de
computeSemaforoStatus, nunca de summary.status.

Verificación (D-064): un caso completo de SIASA 07/2026 —los crudos, el cruce de
control, el cálculo por las dos vías y la descomposición— y esperar confirmación
antes de generalizar. El caso de Aguas y Gaseosas —un empleado que está en la
planilla del cliente y no llegó al importador— tiene que salir marcado.

Tests en la cadena. PR con doc al día.
```

---

## Pendientes de Willy (no son chats, destraban verificaciones)

1. Abrir en el navegador las planillas bloqueadas por etiqueta de
   confidencialidad (Epiroc "Panilla de novedades", Red Bull "NN - Novedades",
   POP "templates") y pasar la estructura — o guardar una copia sin etiqueta.
2. Preguntar a la analista de SIASA por el empleado que está en la planilla
   recibida de Aguas y Gaseosas 07/2026 y no llegó al importador.
3. Confirmar que el manual de conceptos de cada cliente en SharePoint está
   vigente (POP y Geopagos tienen; ¿los demás?) — es la semilla del mapeo de N1.
