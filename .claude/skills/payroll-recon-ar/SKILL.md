---
name: payroll-recon-ar
description: Usar esta skill cuando el usuario pida generar una herramienta HTML standalone (un solo archivo, sin backend) para validar, cruzar o reconciliar datos de payroll/RRHH argentino. Triggers típicos - "cruzar payroll con banco", "comparar F931 con liquidación", "validar CUIL/CUIT/DNI", "comparar período vs período", "detectar altas y bajas", "cruzar Bejerman con Galicia", "validar archivo de AFIP", "Meta4 vs banco", "archivo de transferencias vs liquidación", "reconciliar datos entre dos archivos", "validar legajos", "normalizar headers inconsistentes", "Libro de Sueldos Digital", "cruce ART", "validar CBU", "cotejar datos entre tablas". También aplica cuando el usuario menciona archivos .xls/.xlsx/.csv/.txt/.pdf de payroll con headers variables (Legajo vs Leg. vs ID vs N° Empleado) o cuando necesita matching fuzzy entre tablas con claves inconsistentes. NO usar para tareas de payroll que requieran backend, conexión a sistemas en vivo o modificación de datos productivos.
---

# Payroll Reconciliation Skill - Argentina

Esta skill genera herramientas HTML standalone (un único archivo, abrible con doble click) para validar y reconciliar datos de payroll/RRHH argentino. El procesamiento es 100% en el navegador - ningún dato sale de la máquina del usuario.

## Contexto del usuario
- Payroll/IT/Implementation Manager trabajando con sistemas argentinos (Meta4/PeopleNet, Bejerman, Tango, SAP HCM local, Buk).
- Distribuye herramientas a su equipo por email/SharePoint - por eso el formato "un solo HTML con doble click" es crítico.
- Volúmenes típicos: <1000 filas, ocasionalmente decenas de miles.
- Datos que maneja: Legajo, CUIT, CUIL, DNI, Nombre y Apellido, Código/Nombre de Concepto, Centro de Costo, CBU, importes.

## Flujo de trabajo obligatorio

Cuando el usuario pide una herramienta nueva:

**1. Clarificar antes de codear** (el usuario prefiere brainstorming primero):
   - ¿Cuál es la fuente del archivo A? (sistema que lo generó)
   - ¿Cuál es la fuente del archivo B?
   - ¿Cuál es la clave principal de match? (CUIL > DNI > Legajo > Nombre)
   - ¿Qué campos comparar para detectar diferencias?
   - ¿Qué querés ver en el reporte? (solo diffs, altas/bajas, stats, todo)

**2. Recordar al usuario** (SIEMPRE al inicio y en el HTML generado):
   > ⚠️ No subir datos personales reales de empleados o clientes al chat. Usar siempre datasets anonimizados o dummy para probar. El HTML generado procesa todo localmente en el navegador - los datos no salen de la máquina.

**3. Elegir template y módulos**:
   - Template base: `templates/tool.html`
   - Inlinear los módulos de `src/` que la herramienta necesite (no todos - solo los necesarios).
   - Si existe adapter para la fuente en `src/adapters/`, usarlo. Si no, generar uno nuevo.

**4. Reglas no-negociables al generar código**:
   - **PapaParse**: `dynamicTyping: false` SIEMPRE (sino se pierden leading zeros de CUIT/DNI).
   - **SheetJS**: `raw: false` SIEMPRE en `sheet_to_json` (preserva formato textual de CUIT).
   - **CSP**: incluir `<meta http-equiv="Content-Security-Policy">` con `connect-src 'none'`.
   - **CDN con SRI**: toda librería externa con `integrity=` hash.
   - **Web Worker**: si se espera >5000 filas o archivos >1MB, spawn worker inline (ver `templates/tool.html`).
   - **Validar CUIL** con algoritmo módulo 11 de `src/validators/validateCUIT.js`.
   - **Validar DNI** con rangos oficiales de `src/validators/validateDNI.js` (ojo con rango 60M-69M reservado).
   - **Normalizar nombres** protegiendo la ñ antes de NFD (ver `src/normalizers/normalizeName.js`).
   - **Map para lookups**, nunca `array.find` en loops anidados.

**5. Pipeline estándar** (respetarlo en todas las herramientas):
   ```
   parse → adapter → normalize → validate → reconcile → report
   ```

**6. Output siempre incluye**:
   - Stats dashboard (total A, total B, match rate, onlyA, onlyB, diffs).
   - Tabla con highlight por tipo (verde match, rojo diff, amarillo onlyA, gris onlyB).
   - Filtros (solo diffs, solo onlyA, etc).
   - Botón "Exportar XLSX" con sheets: Matched, Diffs, OnlyInA, OnlyInB, Stats.
   - Footer con texto "🔒 Procesamiento 100% local - los datos no salen de tu navegador".

## Estructura de archivos

```
payroll-recon-ar/
├── SKILL.md                          ← este archivo
├── README.md                         ← instalación y uso
├── templates/
│   └── tool.html                     ← boilerplate con CSP, worker inline, UI completa
├── src/
│   ├── core/
│   │   └── canonicalSchema.js        ← diccionario canónico AR (legajo, cuil, dni, etc)
│   ├── parsers/
│   │   ├── parseExcel.js             ← SheetJS + detectHeaderRow (heurística automática)
│   │   ├── parseCSV.js               ← PapaParse + encoding detection (UTF-8/Latin1)
│   │   └── parsePDF.js               ← PDF.js + reconstructTable por clustering X/Y
│   ├── normalizers/
│   │   ├── normalizeHeader.js        ← NFD + stopwords + puntuación
│   │   ├── normalizeName.js          ← protege ñ antes de NFD, splitFullName
│   │   └── normalizeValues.js        ← legajo, importes AR "1.234,56", fechas, códigos
│   ├── validators/
│   │   ├── validateCUIT.js           ← módulo 11 con overflow (dv=10)
│   │   ├── validateDNI.js            ← rangos oficiales RENAPER
│   │   └── validateCBU.js            ← módulo 10 doble bloque + códigos de banco AR
│   ├── similarity/
│   │   ├── stringSimilarity.js       ← Jaro-Winkler, Dice, Levenshtein combinados
│   │   └── spanishMetaphone.js       ← fonético para apellidos AR (Mosquera 2011)
│   ├── reconcilers/
│   │   ├── headerMapper.js           ← cascada exact → synonym → fuzzy → manual
│   │   ├── reconcile.js              ← Map-based, 4 buckets (onlyA/onlyB/matched/diff)
│   │   └── cascadeMatch.js           ← CUIL → DNI → Legajo → Nombre + fuzzy con blocking
│   └── adapters/
│       └── README.md                 ← patrón para crear adapters por sistema
└── examples/
    └── (se suman casos reales según se vayan armando)
```

## Funciones clave por módulo (referencia rápida)

- `canonicalSchema.js` → `CANONICAL_SCHEMA` (objeto con sinónimos por campo)
- `parseExcel.js` → `parseExcelBuffer(ab, opts)`, `listExcelSheets(ab)`, `detectHeaderRow(aoa)`
- `parseCSV.js` → `parseCSVBuffer(ab, opts)`, `decodeWithFallback(bytes)`
- `parsePDF.js` → `parsePDFBuffer(ab, { pdfjsLib })`, `reconstructTable(items)`
- `normalizeHeader.js` → `normalizeHeader(h)`
- `normalizeName.js` → `normalizeName(s)`, `splitFullName(s)` (detecta "APELLIDO, NOMBRE")
- `normalizeValues.js` → `normalizeLegajo`, `normalizeAmount`, `normalizeCode`, `normalizeDate`
- `validateCUIT.js` → `validateCUIT(v, opts)`, `formatCUIT`, `dniFromCUIT`
- `validateDNI.js` → `validateDNI(v, opts)` (devuelve `kind`: standard/legacy/foreign/etc)
- `validateCBU.js` → `validateCBU(v)` (devuelve banco, sucursal, cuenta)
- `stringSimilarity.js` → `jaroWinkler`, `diceCoefficient`, `combinedSimilarity`, `levenshtein`
- `spanishMetaphone.js` → `spanishMetaphone(word)`, `nameSimilarity(a, b, levFn)`
- `headerMapper.js` → `mapHeaders(fileHeaders, schema, opts)`, `applyMapping`
- `reconcile.js` → `reconcile(tableA, tableB, { keyField, compareFields, normalizers })`
- `cascadeMatch.js` → `cascadeMatch(tableA, tableB, opts)` (niveles: cuil→dni→legajo→fuzzy)

## Cómo componer una herramienta nueva

1. Leer `templates/tool.html` (es el esqueleto).
2. Decidir qué módulos de `src/` son necesarios según el caso.
3. Inlinear (copiar el contenido, no importar) cada módulo necesario dentro del `<script>` o del `<script id="reconWorker">`.
4. Completar los placeholders `{{TITLE}}`, `{{ADAPTER_A}}`, `{{ADAPTER_B}}`, `{{COMPARE_FIELDS}}`.
5. Si se usa un adapter nuevo, generarlo siguiendo el patrón de `src/adapters/README.md`.
6. Presentar el archivo único al usuario.

## Cuando NO usar esta skill

- Si el usuario necesita modificar datos en un sistema productivo (Meta4, SAP) → esto requiere backend y no es el caso.
- Si el usuario pide un dashboard con datos en tiempo real → necesita backend.
- Si son archivos que no son de payroll/RRHH argentino → usar herramientas generales.
- Si el usuario quiere una integración con API → usar skill de integraciones, no esta.
