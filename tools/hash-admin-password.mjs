// hash-admin-password.mjs — Calcula el hash de una contraseña nueva de #/admin.
//
// Por qué existe: el hash de la contraseña del modo admin está escrito en
// `js/ui/adminView.js`, y este repo es público (D-013). Rotarla no debería
// obligar a que la contraseña pase por un chat, un mail o un PR — con esto la
// elegís vos en tu máquina y lo único que compartís es el hash.
//
// Uso:
//   node tools/hash-admin-password.mjs
//   (te la pide sin mostrarla en pantalla, y no queda en el historial del shell)
//
// Después pegá el hash que imprime en `ADMIN_PASSWORD_HASH` de
// `js/ui/adminView.js`. La contraseña no se escribe en ningún archivo.
//
// Recordá lo que el hash NO es: una barrera contra el acceso accidental al modo
// admin, no un control de seguridad. Al estar el hash en un repo público,
// cualquiera puede intentar romperlo offline — así que elegí una frase larga,
// no una palabra. La forma de cerrar eso del todo es sacar el hash del código
// (guardarlo en IndexedDB, definido en el primer uso), que quedó anotado como
// paso siguiente en D-013.

import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

// Silencia el eco para que la contraseña no quede visible en la terminal.
const stdout = process.stdout;
const origWrite = stdout.write.bind(stdout);
let ocultando = false;
stdout.write = (chunk, ...rest) => (ocultando ? true : origWrite(chunk, ...rest));

origWrite('Contraseña nueva para #/admin (no se muestra): ');
ocultando = true;

rl.question('', (password) => {
  ocultando = false;
  origWrite('\n');
  rl.close();

  const limpia = String(password).trim();
  if (limpia.length < 12) {
    console.error(
      `\n✗ Son ${limpia.length} caracteres. Usá al menos 12 — el hash queda visible en un repo ` +
      `público y una contraseña corta se rompe offline en minutos.\n`
    );
    process.exit(1);
  }

  const hash = createHash('sha256').update(limpia, 'utf8').digest('hex');
  console.log(`\nHash SHA-256:\n\n  ${hash}\n`);
  console.log('Pegalo en ADMIN_PASSWORD_HASH (js/ui/adminView.js). La contraseña no se guarda en ningún lado.\n');
});
