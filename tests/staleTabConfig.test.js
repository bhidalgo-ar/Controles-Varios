// staleTabConfig.test.js — Detección de valores obsoletos en "Columnas del
// Tabulado" (Paso 3 de specs/contrato-export.md)
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/staleTabConfig.test.js
//
// Hallazgo de la auditoría de campos-vs-export (2026-08-12): el gate de este
// panel era de *truthiness*, no de existencia. Un valor guardado de una
// renumeración vieja del cliente (u otro layout) pasaba el gate mientras el
// <select> se dibujaba vacío en "— Sin asignar —" — el badge seguía diciendo
// "✓ auto" o "↺ sesión anterior" en verde, afirmando lo contrario de lo que
// se veía en pantalla, y la auto-detección nunca lo corregía porque el guard
// de merge sólo miraba "vacío", no "obsoleto".
//
// `isStaleTabValue` es el predicado que cierra las dos puntas.

globalThis.document = { addEventListener: () => {} };

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { isStaleTabValue } = await import('./js/ui/controlsWizard.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

const HEADERS_ACTUALES = ['LEGAJO', '1003-SUELDO', '1017-A_CTA_FUT_AUMEN'];

assert('un valor que YA NO está en los encabezados de este Tabulado es obsoleto',
  isStaleTabValue('COLUMNA_DE_UNA_CARGA_VIEJA', HEADERS_ACTUALES) === true);
assert('un valor que SÍ está entre los encabezados no es obsoleto',
  isStaleTabValue('1003-SUELDO', HEADERS_ACTUALES) === false);
assert('vacío no es obsoleto — es simplemente "sin asignar", otro caso',
  isStaleTabValue('', HEADERS_ACTUALES) === false);
assert('null no es obsoleto', isStaleTabValue(null, HEADERS_ACTUALES) === false);
assert('undefined no es obsoleto', isStaleTabValue(undefined, HEADERS_ACTUALES) === false);

// Sin Tabulado cargado todavía (headers = []) no hay contra qué comparar — un
// valor guardado de sesiones anteriores NO se vacía antes de que el archivo
// termine de cargar. Sin este guard, todo el panel se vería "sin asignar" en
// el instante entre entrar al Paso 2 y que se resuelva el Tabulado.
assert('sin encabezados cargados todavía, ningún valor es obsoleto',
  isStaleTabValue('CUALQUIER_COSA', []) === false);

// El caso real que motivó el fix: el cliente renumeró conceptos, o se subió
// el Tabulado de otro cliente/período con headers distintos.
{
  const guardadoElMesPasado = '470-LIC_S_GOS_SUELDO';
  const nuevosHeaders = ['LEGAJO', '1003-SUELDO', '1017-A_CTA_FUT_AUMEN'];
  assert('renumeración del cliente entre dos cargas: el valor guardado queda obsoleto',
    isStaleTabValue(guardadoElMesPasado, nuevosHeaders) === true);
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail > 0) process.exit(1);
