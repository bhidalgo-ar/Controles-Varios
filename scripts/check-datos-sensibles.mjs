#!/usr/bin/env node
// Freno para que no vuelva a entrar al repo un dato de un empleado real.
// Corre sobre los archivos que se están por commitear (pre-commit) y sobre el
// diff del PR (CI). No adivina: bloquea patrones que sólo aparecen en archivos
// de cliente. Si algo es un falso positivo, se agrega a ALLOWLIST con el motivo.

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';

// Archivos que sí pueden estar en el repo aunque matcheen una regla.
const ALLOWLIST = new Set([
  // Plantilla vacía del catálogo de conceptos: no trae datos de nadie.
  'Catalogo_Conceptos_Plantilla.xlsx',
  // Skill del plugin hya-toolkit: CUIT/CBU de ejemplo en docstrings de los
  // validadores (módulo 11 / módulo 10), no son datos de ningún empleado.
  '.claude/skills/payroll-recon-ar/src/parsers/parseCSV.js',
  '.claude/skills/payroll-recon-ar/src/parsers/parseExcel.js',
  '.claude/skills/payroll-recon-ar/src/validators/validateCBU.js',
  '.claude/skills/payroll-recon-ar/src/validators/validateCUIT.js',
]);

// Archivos que no tiene sentido escanear por contenido (hashes, minificados).
const SKIP_CONTENT = [/^package-lock\.json$/, /^node_modules\//, /^\.git\//];

const RULES = [
  {
    id: 'planilla-de-cliente',
    // Un export de Meta4/Axton nunca es documentación: es la nómina de alguien.
    path: /\.(xlsx|xlsm|xls|csv|tsv)$/i,
    msg: 'planilla de datos (export de cliente). No va al repo — usá SharePoint.',
  },
  {
    id: 'cbu',
    content: /\b\d{22}\b/,
    msg: 'parece un CBU (22 dígitos seguidos).',
  },
  {
    id: 'cuit',
    content: /\b\d{2}-\d{8}-\d\b/,
    msg: 'parece un CUIT/CUIL.',
  },
];

function stagedFiles() {
  const out = execSync('git diff --cached --name-only --diff-filter=ACMR', { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

const args = process.argv.slice(2);
const files = args.length ? args : stagedFiles();
const hits = [];

for (const file of files) {
  if (ALLOWLIST.has(file)) continue;
  if (!existsSync(file) || statSync(file).isDirectory()) continue;

  for (const rule of RULES) {
    if (rule.path) {
      if (rule.path.test(file)) hits.push({ file, rule, line: null, sample: null });
      continue;
    }
    if (SKIP_CONTENT.some((re) => re.test(file))) continue;

    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue; // ilegible: las reglas de contenido no aplican
    }
    if (text.includes(String.fromCharCode(0))) continue; // binario (una captura)

    text.split('\n').forEach((linea, i) => {
      const m = linea.match(rule.content);
      if (m) hits.push({ file, rule, line: i + 1, sample: m[0] });
    });
  }
}

if (!hits.length) process.exit(0);

console.error('\nSe frenó el commit: hay datos que parecen reales.\n');
for (const h of hits) {
  const donde = h.line ? `${h.file}:${h.line}` : h.file;
  const que = h.sample ? ` -> ${h.sample}` : '';
  console.error(`  ${donde}${que}\n     ${h.rule.msg}`);
}
console.error(`
Qué hacer:
  - Si es un dato real: sacalo. En una captura, regenerá la imagen con datos
    inventados; en un texto, reemplazá por un caso genérico ("el legajo 137").
  - Si es inventado y el chequeo se equivocó: agregá el archivo a ALLOWLIST en
    scripts/check-datos-sensibles.mjs con el motivo.
  - Sólo si estás seguro y apurado: git commit --no-verify (CI vuelve a
    chequearlo en el PR igual).
`);
process.exit(1);
