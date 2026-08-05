// contaMerge.test.js — Tests unitarios de mergeContaFiles (carga múltiple de CONTA)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/contaMerge.test.js
//
// Nota: los fixtures se generan en memoria con datos inventados. Nunca incluir
// datos personales reales de empleados en estos tests.

import * as XLSX from './node_modules/xlsx/xlsx.mjs';
globalThis.XLSX = XLSX; // el parser usa el global XLSX (como en browser)

import { parseConta, mergeContaFiles } from './js/parsers/contaExcel.js';

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const HEADERS = ['ID_EMPLEADO', 'NOMBRE', 'APELLIDO_1', 'ID_CONCEPTO', 'NOMBRE_LARGO',
  'CUENTA_CONTAB', 'ID_CONTA', 'ID_CENTRO_COSTO', 'CC_NOMBRE', 'DEBE', 'HABER', 'N_CUENTA_CONTABLE'];

function buildConta(rows) {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CONTA');
  const ab = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return parseConta(ab);
}

// ── Dos archivos de meses distintos (mismo empleado/concepto/importe, ID_CONTA
// distinto — así viene realmente de M4, cada corrida contable tiene su propio
// ID_CONTA) no deberían marcarse como duplicados entre sí ────────────────────

{
  const abril = buildConta([
    [1001, 'MARÍA', 'GÓMEZ', '8001', 'SUELDO BASE', '9990001', 'A-04-1', '10', 'CENTRO UNO', 1000, 0, 'REMUNERACIONES'],
  ]);
  const mayo = buildConta([
    [1001, 'MARÍA', 'GÓMEZ', '8001', 'SUELDO BASE', '9990001', 'A-05-1', '10', 'CENTRO UNO', 1000, 0, 'REMUNERACIONES'],
  ]);

  const merged = mergeContaFiles([
    { fileName: 'CONTA 04-2026.xlsx', parsedRows: abril.parsedRows, parseMetadata: abril.parseMetadata },
    { fileName: 'CONTA 05-2026.xlsx', parsedRows: mayo.parsedRows,  parseMetadata: mayo.parseMetadata },
  ]);

  assert('dos meses: filas concatenadas (2)', merged.parsedRows.length === 2);
  assert('dos meses: totalRows combinado (2)', merged.parseMetadata.totalRows === 2);
  assert('dos meses: NO se marcan como duplicados (ID_CONTA distinto)', merged.parseMetadata.duplicates.length === 0);
  assert('dos meses: metadata por archivo (2 entradas)', merged.parseMetadata.files.length === 2);
}

// ── El mismo archivo subido dos veces por error: todas las filas del segundo
// archivo deben marcarse como duplicadas ─────────────────────────────────────

{
  const abril = buildConta([
    [1001, 'MARÍA', 'GÓMEZ', '8001', 'SUELDO BASE', '9990001', 'A-04-1', '10', 'CENTRO UNO', 1000, 0, 'REMUNERACIONES'],
    [1002, 'JUAN',  'PÉREZ', '8002', 'PROV CARGAS', '9990005', 'A-04-2', '10', 'CENTRO UNO',  200, 50, 'PROVISIONES'],
  ]);
  const abrilDeNuevo = buildConta([
    [1001, 'MARÍA', 'GÓMEZ', '8001', 'SUELDO BASE', '9990001', 'A-04-1', '10', 'CENTRO UNO', 1000, 0, 'REMUNERACIONES'],
    [1002, 'JUAN',  'PÉREZ', '8002', 'PROV CARGAS', '9990005', 'A-04-2', '10', 'CENTRO UNO',  200, 50, 'PROVISIONES'],
  ]);

  const merged = mergeContaFiles([
    { fileName: 'CONTA 04-2026.xlsx',      parsedRows: abril.parsedRows,        parseMetadata: abril.parseMetadata },
    { fileName: 'CONTA 04-2026 (1).xlsx',  parsedRows: abrilDeNuevo.parsedRows, parseMetadata: abrilDeNuevo.parseMetadata },
  ]);

  assert('archivo duplicado: filas concatenadas igual (4, aunque repetidas)', merged.parsedRows.length === 4);
  assert('archivo duplicado: se marca UN archivo con duplicados', merged.parseMetadata.duplicates.length === 1);
  assert(
    'archivo duplicado: el marcado es el segundo, con sus 2 filas',
    merged.parseMetadata.duplicates[0].fileName === 'CONTA 04-2026 (1).xlsx'
      && merged.parseMetadata.duplicates[0].count === 2
  );
}

// ── Repeticiones DENTRO del mismo archivo no cuentan como duplicado cruzado ──

{
  const conFilaRepetida = buildConta([
    [1001, 'MARÍA', 'GÓMEZ', '8001', 'SUELDO BASE', '9990001', 'A-04-1', '10', 'CENTRO UNO', 1000, 0, 'REMUNERACIONES'],
    [1001, 'MARÍA', 'GÓMEZ', '8001', 'SUELDO BASE', '9990001', 'A-04-1', '10', 'CENTRO UNO', 1000, 0, 'REMUNERACIONES'],
  ]);
  const merged = mergeContaFiles([
    { fileName: 'CONTA 04-2026.xlsx', parsedRows: conFilaRepetida.parsedRows, parseMetadata: conFilaRepetida.parseMetadata },
  ]);
  assert('un solo archivo con filas repetidas dentro de sí mismo: sin duplicados cruzados', merged.parseMetadata.duplicates.length === 0);
  assert('un solo archivo: filas conservadas tal cual (2)', merged.parsedRows.length === 2);
}

// ── descartadasSinCC se suma entre archivos ──────────────────────────────────

{
  const conDescarte1 = buildConta([
    [1001, 'MARÍA', 'GÓMEZ', '8001', 'SUELDO BASE', '9990001', 'A-04-1', '10', 'CENTRO UNO', 1000, 0, 'REMUNERACIONES'],
    [1003, 'ANA',   'DÍAZ',  '8001', 'SUELDO BASE', '9990001', 'A-04-3', '',   'Null',      500, 0, 'REMUNERACIONES'],
  ]);
  const conDescarte2 = buildConta([
    [1002, 'JUAN', 'PÉREZ', '8001', 'SUELDO BASE', '9990001', 'A-05-1', '', 'null', 700, 0, 'REMUNERACIONES'],
  ]);
  const merged = mergeContaFiles([
    { fileName: 'CONTA 04-2026.xlsx', parsedRows: conDescarte1.parsedRows, parseMetadata: conDescarte1.parseMetadata },
    { fileName: 'CONTA 05-2026.xlsx', parsedRows: conDescarte2.parsedRows, parseMetadata: conDescarte2.parseMetadata },
  ]);
  assert('descartadasSinCC combinado (1 + 1 = 2)', merged.parseMetadata.descartadasSinCC === 2);
  assert('sólo las filas con CC llegan a parsedRows (1 + 0 = 1)', merged.parsedRows.length === 1);
}

// ── Resultado ─────────────────────────────────────────────────────────────────

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
