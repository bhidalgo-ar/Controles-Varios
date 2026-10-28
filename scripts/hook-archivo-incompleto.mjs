#!/usr/bin/env node
// hook-archivo-incompleto.mjs — Frena el análisis cuando un archivo llegó cortado.
//
// Lo corre Claude Code después de cada `read_resource` de un conector MCP (ver
// .claude/settings.json, eventos PostToolUse y PostToolUseFailure). Recibe por
// stdin el JSON del hook, busca en la respuesta de la herramienta las señales de
// que el archivo no llegó entero y, si encuentra alguna, le devuelve a Claude la
// orden de frenar y avisarle a Willy (regla "Si el archivo llegó incompleto" del
// CLAUDE.md).
//
// Caso que lo originó: la "Contabilidad desglosada" de Marval leída desde
// SharePoint devolvió 1.135 de 25.143 filas y el análisis siguió igual.
//
// Cuando la salida es muy grande, Claude Code la guarda en un archivo y la
// herramienta devuelve sólo el aviso con la ruta. Por eso, además del texto,
// se abren los archivos que el aviso menciona ("saved to <ruta>") y se buscan
// ahí las mismas señales. Si ese archivo no se puede abrir, se avisa igual:
// no se puede confirmar que el contenido esté entero.
//
// Probar a mano:
//   echo '{"hook_event_name":"PostToolUse","tool_name":"mcp__Microsoft_365__read_resource",
//          "tool_response":"... were not shown ..."}' | node scripts/hook-archivo-incompleto.mjs
// Sin dependencias: corre con el node que haya.

import { readFileSync, existsSync, statSync } from 'fs';
import { pathToFileURL } from 'url';

export const SIGNALS = [
  { re: /were not shown/i, label: 'filas que el conector no mostró ("were not shown")' },
  { re: /Binary attachment/i, label: 'adjunto binario que no se pudo leer ("Binary attachment")' },
  { re: /content cannot be returned inline/i, label: 'contenido que no se pudo devolver ("content cannot be returned inline")' },
  { re: /\[truncated:/i, label: 'contenido cortado ("[truncated:")' },
  { re: /Sheets?\b[^\n]{0,300}?\bwere not read/i, label: 'hojas que no se leyeron ("Sheets ... were not read")' },
];

// Ruta que viene después de "saved to" / "written to" en el aviso de salida grande.
const SAVED_PATH_RE = /\b(?:saved|written|stored)\s+(?:to|at|in)\s*:?\s*["'`]?((?:\/|[A-Za-z]:\\)[^\s"'`]+)/gi;

// Junta todo el texto de un valor cualquiera (string, array de bloques MCP, objeto).
function collectText(value, out = []) {
  if (value == null) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => collectText(v, out));
  else if (typeof value === 'object') Object.values(value).forEach(v => collectText(v, out));
  return out;
}

function findSignals(text) {
  return SIGNALS.filter(s => s.re.test(text)).map(s => s.label);
}

export function analyze(input) {
  const text = collectText([input.tool_response, input.error]).join('\n');
  const found = new Set(findSignals(text));
  const unreadable = [];

  for (const m of text.matchAll(SAVED_PATH_RE)) {
    const path = m[1].replace(/[.,;:)\]]+$/, '');
    try {
      if (!existsSync(path) || !statSync(path).isFile()) { unreadable.push(path); continue; }
      findSignals(readFileSync(path, 'utf8')).forEach(l => found.add(l));
    } catch {
      unreadable.push(path);
    }
  }
  return { signals: [...found], unreadable };
}

export function buildOutput(input, { signals, unreadable }) {
  if (!signals.length && !unreadable.length) return null;
  const event = input.hook_event_name || 'PostToolUse';

  const lines = [];
  if (signals.length) {
    lines.push(
      'ARCHIVO INCOMPLETO — FRENÁ ACÁ. La lectura que acabás de hacer no trajo el archivo entero. Se encontró:',
      ...signals.map(s => `- ${s}`),
    );
  }
  if (unreadable.length) {
    lines.push(
      'La salida se guardó en un archivo que este control no pudo abrir para confirmar que esté entero:',
      ...unreadable.map(p => `- ${p}`),
      'Antes de usarlo, buscá en él estas señales: "were not shown", "Binary attachment", ' +
        '"content cannot be returned inline", "[truncated:", "Sheets ... were not read".',
    );
  }
  if (signals.length) {
    lines.push(
      'No analices con lo que llegó, ni saques conclusiones "provisorias". Tu próximo mensaje a Willy tiene que decir: ' +
        'qué archivo es, qué parte falta (cuántas filas de cuántas, qué hoja, qué adjunto) y cómo pasártelo entero ' +
        '(por ejemplo, subiéndolo a la sesión). Esperá a tenerlo antes de seguir. (Regla "Si el archivo llegó incompleto" del CLAUDE.md.)',
    );
  }
  const reason = lines.join('\n');

  // Con señales en PostToolUse va como `decision: block` (Claude lo lee pegado al resultado).
  // PostToolUseFailure no tiene `decision`, y una ruta que no se pudo abrir es sólo un aviso:
  // en esos dos casos va como additionalContext. Nunca por las dos vías, para no duplicarlo.
  const out = signals.length && event === 'PostToolUse'
    ? { decision: 'block', reason }
    : { hookSpecificOutput: { hookEventName: event, additionalContext: reason } };
  if (signals.length) {
    out.systemMessage = 'El archivo llegó incompleto: Claude tiene que frenar y pedirte el archivo entero.';
  }
  return out;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch { return; }
  const out = buildOutput(input, analyze(input));
  if (out) process.stdout.write(JSON.stringify(out));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {}).finally(() => process.exit(0));
}
