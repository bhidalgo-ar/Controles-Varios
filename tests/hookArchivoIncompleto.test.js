// hookArchivoIncompleto.test.js — El hook que frena cuando un archivo llegó cortado
// Correr desde la raíz del proyecto:
//   node --input-type=module < tests/hookArchivoIncompleto.test.js
//
// Lo que este archivo defiende: que una lectura por conector (SharePoint, Outlook)
// que trae el aviso de filas no mostradas, de adjunto binario o de contenido cortado
// FRENE a Claude, y que una lectura completa pase sin ruido. Corre el script de
// verdad, por stdin, como lo corre Claude Code.
//
// Datos 100% inventados.

import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const SCRIPT = 'scripts/hook-archivo-incompleto.mjs';
let failed = 0;
function check(name, cond) {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}`);
  if (!cond) failed++;
}
function runHook(input) {
  const r = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(input), encoding: 'utf8' });
  return { code: r.status, out: r.stdout.trim() ? JSON.parse(r.stdout) : null };
}
const base = { hook_event_name: 'PostToolUse', tool_name: 'mcp__Microsoft_365__read_resource' };

// 1. Truncado: frena.
{
  const { code, out } = runHook({ ...base, tool_response: [{ type: 'text', text:
    'Cuenta;Importe\n1;100\n[The last 24,008 rows of sheet 1 (Hoja1) were not shown; open the file in OneDrive/SharePoint to see them.]' }] });
  check('truncado: sale con código 0', code === 0);
  check('truncado: decision block', out?.decision === 'block');
  check('truncado: el motivo pide frenar y avisar a Willy', /FRENÁ/.test(out?.reason) && /Willy/.test(out?.reason));
  check('truncado: no se duplica en additionalContext', !out?.hookSpecificOutput);
  check('truncado: aviso visible para el usuario', typeof out?.systemMessage === 'string');
}

// 2. Completo: no dice nada.
{
  const { code, out } = runHook({ ...base, tool_response: [{ type: 'text', text: 'Cuenta;Importe\n1;100\n2;200' }] });
  check('completo: código 0 y sin salida', code === 0 && out === null);
}

// 3. Adjunto binario y hojas no leídas.
for (const text of [
  'Binary attachment — content cannot be returned inline',
  'Sheets 2, 3 were not read',
  'fila\n[truncated: 500 rows]',
]) {
  const { out } = runHook({ ...base, tool_response: { content: text } });
  check(`frena con: ${text.split('\n').pop().slice(0, 40)}`, out?.decision === 'block');
}

// 4. Salida grande guardada en archivo: se abre el archivo y se busca adentro.
{
  const dir = mkdtempSync(join(tmpdir(), 'hook-'));
  const cortado = join(dir, 'cortado.txt');
  const entero = join(dir, 'entero.txt');
  writeFileSync(cortado, 'fila1\nfila2\n[The last 10 rows of sheet 1 (Hoja1) were not shown]\n');
  writeFileSync(entero, 'fila1\nfila2\n');

  const f = runHook({ ...base, hook_event_name: 'PostToolUseFailure',
    error: `Error: result exceeds maximum allowed tokens. Output has been saved to ${cortado}. Use offset and limit.` });
  check('archivo guardado cortado (Failure): additionalContext que frena',
    /FRENÁ/.test(f.out?.hookSpecificOutput?.additionalContext ?? '') && f.out?.decision === undefined);

  const ok = runHook({ ...base, tool_response: `Output has been saved to ${entero}.` });
  check('archivo guardado entero: sin salida', ok.out === null);

  const missing = runHook({ ...base, tool_response: `Output has been saved to ${join(dir, 'no-existe.txt')}.` });
  check('archivo guardado que no se puede abrir: avisa sin frenar',
    missing.out?.decision === undefined && /no pudo abrir/.test(missing.out?.hookSpecificOutput?.additionalContext ?? ''));
  rmSync(dir, { recursive: true, force: true });
}

// 5. JSON roto en stdin: no rompe.
{
  const r = spawnSync(process.execPath, [SCRIPT], { input: 'no es json', encoding: 'utf8' });
  check('entrada inválida: código 0 y sin salida', r.status === 0 && r.stdout === '');
}

if (failed) { console.error(`\n${failed} chequeo(s) fallaron`); process.exit(1); }
console.log('\nhookArchivoIncompleto: todo OK');
