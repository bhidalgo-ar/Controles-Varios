# Adapters

Un **adapter** describe cómo traducir un archivo de un sistema específico (Bejerman, Tango, Meta4, Galicia, Nación, F931, etc) al schema canónico.

La filosofía es idéntica a un Singer tap o un dbt staging model: **el adapter es el único lugar donde vive el conocimiento de la fuente**. El resto del pipeline (normalize, validate, reconcile, report) es agnóstico.

## Estructura de un adapter

```js
const miAdapter = {
  name: 'Nombre legible del sistema',
  
  // Mapeo manual de headers del archivo → campo canónico.
  // Se puede dejar vacío si querés que headerMapper haga fuzzy automático.
  headerMap: {
    cuil:           ['CUIL', 'C.U.I.L.', 'Cuil Beneficiario'],
    apellidoNombre: ['Beneficiario', 'Nombre', 'Apellido y Nombre'],
    cbu:            ['CBU', 'CBU Destino'],
    sueldoNeto:     ['Importe', 'Monto', 'Importe Neto']
  },
  
  // Transformaciones por campo (normalización pre-reconciliación).
  transforms: {
    cuil: v => String(v).replace(/\D/g, ''),
    sueldoNeto: v => Number(String(v).replace(/\./g, '').replace(',', '.')),
    periodo: v => { /* ... */ }
  },
  
  // Opciones de parseo según formato del archivo.
  parseOptions: {
    skipRows: 3,              // filas a saltar antes del header (títulos, filtros aplicados)
    encoding: 'windows-1252', // 'utf-8' por default, 'windows-1252' para sistemas legacy AR
    delimiter: ';',           // para CSV. Auto-detect por default.
    sheetName: 0              // para XLSX: nombre o índice de la hoja
  }
};
```

## Adapters típicos a crear cuando aparezcan

| Sistema | Notas |
|---|---|
| `bejerman.js` | Exports suelen tener título y período en filas 1-3. Encoding Latin1 común. |
| `tango.js` | Códigos de concepto con padding de 4 dígitos. |
| `meta4.js` / `peoplenet.js` | `M4T_*` tables si viene export directo de SQL. |
| `sap_hcm_ar.js` | Headers largos, típicamente XLSX con merged cells. |
| `buk.js` | UTF-8, headers en inglés mezclados con español. |
| `afip_f931.js` | Formato fijo AFIP, "APELLIDO, NOMBRE", CUIL con guiones. |
| `lsd.js` | Libro de Sueldos Digital AFIP. |
| `banco_galicia.js` | TXT posicional o CSV con `;`. CBU + Importe + CUIL. |
| `banco_nacion.js` | Variantes según producto (cuenta sueldo vs transferencias). |
| `banco_macro.js` | |
| `osde.js` / `galeno.js` / `swiss.js` | Prepagas - aportes y contribuciones. |
| `art.js` | Cada ART tiene su propio formato - generar uno por aseguradora. |

## Cómo agregar un adapter nuevo (junto con Claude)

Cuando te aparezca un archivo de un sistema que no tenés cubierto:

1. Abrí un chat con Claude y la skill activa.
2. Adjuntá (o pegá) las **2-3 primeras filas reales** del archivo — **anonimizadas**, obviamente. Si tiene PII, generá un mock con la misma estructura.
3. Pedile: *"Generá el adapter `<nombre>.js` para este archivo según el patrón de `src/adapters/README.md`"*.
4. Claude inspecciona los headers, detecta el encoding, el delimitador y el skipRows, y te devuelve el archivo.
5. Lo guardás en `src/adapters/` y ya está disponible para todas las herramientas futuras.

## Regla de oro

**Nunca** hardcodear lógica específica de un sistema fuera del adapter. Si en un `reconcile.js` ves un `if (source === 'bejerman')`, algo está mal — esa lógica va en el adapter.
