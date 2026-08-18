# payroll-recon-ar

Skill para generar herramientas HTML standalone de validación y reconciliación de datos de payroll/RRHH argentino. Procesamiento 100% en browser (sin backend), formato "un solo archivo con doble click" para distribución por email/SharePoint.

> **Nota:** esta skill ahora es parte del plugin `hya-toolkit`. La sección
> "Instalación" de más abajo describe cómo instalarla suelta (fuera del
> plugin); si la recibiste vía `hya-toolkit.plugin`, no hace falta nada de
> eso, se instala sola con el resto del plugin.

## ¿Qué hace?

Cuando le pedís a Claude algo como:

- *"Armame una herramienta para cruzar el payroll de Bejerman con el resumen de transferencias del Galicia y marcarme las diferencias de importe"*
- *"Necesito validar los CUIL de este archivo F931"*
- *"Comparame liquidación de octubre vs noviembre para detectar altas y bajas"*

...Claude toma este template, elige los módulos necesarios, y te genera **un HTML de ~1.3 MB** que hace el trabajo, validando CUIT/CUIL/DNI con los algoritmos oficiales, normalizando headers inconsistentes, matcheando nombres con Spanish Metaphone, y exportando un XLSX con los resultados.

---

## Instalación

### Para Claude Code (recomendado - se activa sola)

Claude Code descubre automáticamente skills colocadas en cualquiera de estas ubicaciones:

**Opción 1 - Personal (disponible en todos tus proyectos):**
```
~/.claude/skills/payroll-recon-ar/
```

En Windows (tu caso con Hidalgo & Asociados):
```
C:\Users\<tu-usuario>\.claude\skills\payroll-recon-ar\
```

**Opción 2 - Específica al proyecto actual:**
```
<raiz-del-proyecto>/.claude/skills/payroll-recon-ar/
```

Pasos:
1. Copiá toda la carpeta `payroll-recon-ar/` (con `SKILL.md` en la raíz) a una de las ubicaciones de arriba.
2. Abrí una sesión de Claude Code en cualquier proyecto.
3. Pedí algo que matchee los triggers del `description` en `SKILL.md` (ej: "armame una herramienta para cruzar payroll con banco"). Claude Code detecta la skill sola.

Verificación rápida — en Claude Code podés preguntar: *"¿qué skills tenés disponibles?"* y debería listar `payroll-recon-ar`.

### Para Claude.ai (web y mobile)

**Opción A - Projects (recomendado):**
1. Andá a Claude.ai, creá un proyecto nuevo (por ejemplo, "Herramientas Payroll").
2. En la sección "Project knowledge" del proyecto, subí el `SKILL.md` y los archivos de `src/` y `templates/`.
3. Cada vez que abras un chat dentro de ese proyecto, Claude va a ver la skill y activarla según el trigger.

**Opción B - Custom Skills (si Anthropic lo habilita a nivel cuenta):**
Desde Settings → Skills, crear una skill nueva y pegar el contenido. Esto la hace disponible en todos los chats sin necesidad de estar en un proyecto.

**Opción C - Chat suelto (sin proyecto):**
Pegá el contenido del `SKILL.md` como primer mensaje del chat. No es elegante pero funciona para una sesión puntual.

---

## ¿Tenés que avisarle a Claude que use la skill en cada proyecto?

**No si está bien instalada.** Una vez que la skill está en `~/.claude/skills/` (Code) o en un Project (claude.ai), Claude la activa automáticamente cuando detecta que tu pedido matchea el `description` del `SKILL.md`.

**Sí en estos casos:**
- Si estás en un chat nuevo de claude.ai que no pertenece a un proyecto con la skill.
- Si tu pedido es muy genérico y no matchea los triggers (ej: "ayudame con un Excel"). Podés forzarla diciendo "usá la skill payroll-recon-ar".
- Si Claude elige otra skill (por ejemplo la genérica de `xlsx`) y vos preferís esta. Decile explícitamente.

La clave está en que el `description` del `SKILL.md` cubra bien los triggers que vos usás en la práctica. Si notás que la skill no se activa cuando debería, agregá esos triggers al `description` y reinstalá.

---

## Estructura de archivos

```
payroll-recon-ar/
├── SKILL.md                          ← Instrucciones para Claude (lo más importante)
├── README.md                         ← Este archivo
├── templates/
│   └── tool.html                     ← Boilerplate HTML con CSP, worker inline funcional,
│                                       router de archivos por magic bytes, UI completa
│                                       (stats, filtros, search, paginación, export XLSX)
├── src/
│   ├── core/
│   │   └── canonicalSchema.js        ← Diccionario canónico de payroll AR (17 campos)
│   ├── parsers/
│   │   ├── parseExcel.js             ← SheetJS + detección automática de header row
│   │   ├── parseCSV.js               ← PapaParse + detección UTF-8 / windows-1252
│   │   └── parsePDF.js               ← PDF.js + reconstrucción tabular por clustering
│   ├── normalizers/
│   │   ├── normalizeHeader.js        ← NFD + stopwords + puntuación
│   │   ├── normalizeName.js          ← Protege ñ antes de NFD + splitFullName
│   │   └── normalizeValues.js        ← Legajo, importes AR, fechas DD/MM/YYYY, códigos
│   ├── validators/
│   │   ├── validateCUIT.js           ← Módulo 11 con manejo de overflow (dv=10)
│   │   ├── validateDNI.js            ← Rangos oficiales RENAPER
│   │   └── validateCBU.js            ← Módulo 10 doble bloque + 65 códigos de banco AR
│   ├── similarity/
│   │   ├── stringSimilarity.js       ← Jaro-Winkler, Dice, Levenshtein, combinedSimilarity
│   │   └── spanishMetaphone.js       ← Fonético para apellidos AR (Mosquera 2011)
│   └── reconcilers/
│       ├── headerMapper.js           ← Cascada: exact → synonym → fuzzy → manual
│       ├── reconcile.js              ← Map-based, 4 buckets, O(N+M)
│       └── cascadeMatch.js           ← CUIL → DNI → Legajo → Nombre + fuzzy con blocking
└── examples/
    └── (se van sumando según casos de uso reales)
```

---

## Cómo la usa Claude

Cuando se activa, el flujo es:

1. **Clarifica** — te pregunta qué fuentes son, qué campo de match usás, qué comparar.
2. **Elige módulos** — no inlinea todo, solo lo necesario para tu caso.
3. **Genera un HTML único** — toma `templates/tool.html`, inlinea módulos, completa placeholders.
4. **Entrega el archivo** — lo podés descargar y abrir con doble click.
5. **Te recuerda** — no subir PII real mientras iteramos.

---

## Convenciones del código generado

Reglas que la skill respeta siempre:

- `PapaParse`: `dynamicTyping: false` (para no perder ceros a la izquierda).
- `SheetJS`: `raw: false` en `sheet_to_json` (preserva formato textual de CUIT).
- CSP con `connect-src 'none'` (garantía técnica de que los datos no salen).
- Web Worker si el volumen justifica (>5k filas o >1MB).
- `Map` para lookups, nunca `array.find` en loops.
- Validación CUIL con módulo 11 oficial, DNI con rangos RENAPER.
- Nombres normalizados protegiendo la ñ antes de NFD.

---

## Mantener y extender

### Agregar un sinónimo de header

Editá `src/core/canonicalSchema.js` y agregá a la lista `synonyms` del campo correspondiente. La próxima herramienta generada lo incluirá.

### Agregar un adapter para un sistema nuevo

Crear `src/adapters/<sistema>.js` con la estructura:

```js
const miSistemaAdapter = {
  name: 'Nombre del sistema',
  headerMap: {
    cuil: ['CUIL', 'Nro CUIL', ...],
    // ...
  },
  transforms: {
    cuil: v => String(v).replace(/\D/g, ''),
    // ...
  },
  parseOptions: {
    skipRows: 0,
    encoding: 'utf-8',  // o 'latin1' para sistemas legacy
    delimiter: ',' 
  }
};
```

### Ajustar umbrales de matching fuzzy

En `src/reconcilers/headerMapper.js`:
- `autoThreshold: 0.9` — score ≥ auto-match sin confirmación.
- `suggestThreshold: 0.6` — score ≥ sugerencia para confirmar.

---

## Reminder de privacidad (importante)

Esta skill está diseñada para manejar PII (CUIL, DNI, sueldos). Dos principios que el código y el `SKILL.md` refuerzan:

1. **El HTML generado procesa todo localmente** — la CSP con `connect-src 'none'` lo garantiza técnicamente. Podés auditar el código del HTML y ver que no hay ningún `fetch`, `XMLHttpRequest` o WebSocket.

2. **Mientras diseñás una herramienta nueva con Claude, NO subas datos reales al chat.** Usá siempre datasets anonimizados/dummy. El código de la skill es público (para que Claude lo use), pero los datos que vos cargás al chat para probar, no. La regla: *datos reales solo en el HTML ya generado y abierto en tu máquina*.

---

## Licencia y origen

Código propio, pensado para el uso de Hidalgo & Asociados. Basado en:
- SheetJS CE (Apache 2.0)
- PapaParse (MIT)
- PDF.js (Apache 2.0)
- Algoritmo CUIT módulo 11 (RG DGI 2700/1987)
- Rangos DNI (Disposición RENAPER 4678/2019)
- Spanish Metaphone (Mosquera 2011, MIT)
