// clientCatalogs.test.js — Test de buildClientCatalogs() (ajuste del 2026-07-30:
// equipo/consultor/CCTs del alta de cliente salen de un <select> con lo ya
// cargado, no de texto libre).
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/clientCatalogs.test.js
//
// clientsList.js importa (transitivamente) módulos de UI que registran un
// listener a nivel de módulo — necesitan un `document` mínimo para poder
// importarse fuera del navegador. No se ejercita nada de esos módulos acá.
globalThis.document = { addEventListener: () => {} };

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
globalThis.Dexie = Dexie;

const { createClient, setConfig } = await import('./js/db.js');
const { buildClientCatalogs } = await import('./js/ui/clientsList.js');

let ok = 0, fail = 0;
function assert(desc, val) {
  if (val) { console.log('✓', desc); ok++; }
  else      { console.error('✗', desc); fail++; }
}

// 1) Sin nada cargado (ni seed importado, ni clientes previos): catálogos vacíos.
{
  const { teamOptions, consultantOptions, cctOptions } = await buildClientCatalogs();
  assert('sin datos: teamOptions vacío', teamOptions.length === 0);
  assert('sin datos: consultantOptions vacío', consultantOptions.length === 0);
  assert('sin datos: cctOptions vacío', cctOptions.length === 0);
}

// 2) Con un seed importado (teams con lead) + clientes existentes con team/consultant/ccts
//    propios que no estaban en el seed: todo se junta y se deduplica.
await setConfig('seedTeams', [
  { code: 'EQ_CANDELA', lead: 'Candela' },
  { code: 'EQ_MELINA', lead: 'Melina' },
]);
await createClient('Cliente Uno', '', { team: 'EQ_CANDELA', consultant: 'Candela', ccts: ['Comercio'] });
await createClient('Cliente Dos', '', { team: 'EQ_SIN_SEED', consultant: 'Otro Consultor', ccts: ['Camioneros', 'Comercio'] });

{
  const { teamOptions, consultantOptions, cctOptions } = await buildClientCatalogs();

  const teamCodes = teamOptions.map(([code]) => code);
  assert('incluye los equipos del seed', teamCodes.includes('EQ_CANDELA') && teamCodes.includes('EQ_MELINA'));
  assert('incluye un equipo que no estaba en el seed pero sí en un cliente', teamCodes.includes('EQ_SIN_SEED'));
  assert('el label del equipo del seed incluye el lead', teamOptions.find(([c]) => c === 'EQ_CANDELA')[1] === 'EQ_CANDELA — Candela');
  assert('quedan ordenados alfabéticamente por code', teamCodes.join(',') === [...teamCodes].sort().join(','));

  assert('incluye el lead de un equipo del seed como consultor', consultantOptions.includes('Candela'));
  assert('incluye el lead del otro equipo aunque ningún cliente lo use', consultantOptions.includes('Melina'));
  assert('incluye un consultor que solo viene de un cliente', consultantOptions.includes('Otro Consultor'));
  assert('no hay duplicados (Candela aparece una sola vez)', consultantOptions.filter(c => c === 'Candela').length === 1);

  assert('junta los CCTs de todos los clientes sin duplicar', cctOptions.length === 2 && cctOptions.includes('Comercio') && cctOptions.includes('Camioneros'));
}

// 3) Compañías conocidas (autocompletar por nombre, ajuste del 2026-07-30):
//    su team/consultant/ccts también entran al catálogo, aunque todavía no
//    exista ningún cliente local con esos datos — así el <select> tiene la
//    opción disponible cuando el autocompletado la quiera seleccionar.
{
  const knownCompanies = [
    { code: 'SIASA', name: 'Siasa Logística', team: 'EQ_NUEVO_DEL_SEED', consultant: 'Consultor Nuevo', ccts: ['Convenio Nuevo'] },
  ];
  const { teamOptions, consultantOptions, cctOptions } = await buildClientCatalogs(knownCompanies);

  assert('trae el equipo de una compañía conocida aunque nadie lo use todavía', teamOptions.some(([code]) => code === 'EQ_NUEVO_DEL_SEED'));
  assert('trae el consultor de una compañía conocida', consultantOptions.includes('Consultor Nuevo'));
  assert('trae el CCT de una compañía conocida', cctOptions.includes('Convenio Nuevo'));
}

// 4) Catálogo de consultores (D-012): un consultor sin cliente asignado
//    todavía (ej. Florencia/Eileen/Laura en el seed real) tiene que aparecer
//    igual, tanto si viene de seedConsultants (ya importado) como del
//    parámetro knownConsultants (fetch directo del seed real, sin importar).
{
  await setConfig('seedConsultants', [{ name: 'Consultor Sin Cliente (seed importado)' }]);
  const { consultantOptions } = await buildClientCatalogs([], ['Consultor Sin Cliente (fetch directo)']);
  assert('incluye un consultor de seedConsultants aunque no tenga cliente', consultantOptions.includes('Consultor Sin Cliente (seed importado)'));
  assert('incluye un consultor de knownConsultants aunque no tenga cliente', consultantOptions.includes('Consultor Sin Cliente (fetch directo)'));
}

console.log(`\n${ok} ✓  ${fail} ✗`);
if (fail) process.exit(1);
