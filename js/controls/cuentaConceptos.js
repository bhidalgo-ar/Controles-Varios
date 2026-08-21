// cuentaConceptos.js — El desglose por concepto de una cuenta contable. El molde
// único de los dos controles cuya unidad es la CUENTA y no el empleado:
// `finadietAsiento.js` (Asiento de Remuneraciones) y `contaDesglosada.js`
// (Contabilidad Desglosada + Asiento).
//
// **Por qué está acá y no copiado en los dos.** Es la misma lección que dejó
// `consolidate.js` (D-042): un helper copiado en dos módulos se arregla dos
// veces, y hasta que alguien lo note los dos entregables contables dicen cosas
// distintas sobre el mismo archivo. Acá el desglose se acumula con una sola
// regla, y esa regla está escrita como assert en
// `tests/fichasCuentaContable.test.js`.
//
// **La clave es el CÓDIGO del concepto, no su nombre** (CLAUDE.md: buscá por
// código, nunca por nombre). El mismo concepto puede venir escrito con otra
// grafía en dos filas del archivo del cliente —'Vacaciones' y 'VACACIONES'— y
// partirse en dos líneas del desglose: así se ve un desglose que no suma. Sin
// código se cae al nombre, y sin ninguno de los dos queda '(sin concepto)': la
// fila igual se muestra, porque su importe **ya está** en el saldo de la cuenta y
// esconderla haría que el desglose dejara de explicarlo.

function round2(n) {
  return Math.round(((n || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Suma un aporte al concepto que corresponda dentro de una cuenta.
 *
 * @param {Map<string, object>} map - el acumulador de esa cuenta
 * @param {object} aporte
 * @param {string|number|null} [aporte.nro] - código del concepto de liquidación
 * @param {string|null} [aporte.concepto] - nombre del concepto
 * @param {number} [aporte.debe]
 * @param {number} [aporte.haber]
 */
export function acumularConcepto(map, { nro, concepto, debe = 0, haber = 0 } = {}) {
  const codigo = String(nro ?? '').trim();
  const nombre = String(concepto ?? '').trim();
  const clave = codigo || nombre || '(sin concepto)';

  let c = map.get(clave);
  if (!c) {
    c = { nro: codigo || null, concepto: nombre || null, debe: 0, haber: 0 };
    map.set(clave, c);
  }
  c.debe  = round2(c.debe  + (debe  || 0));
  c.haber = round2(c.haber + (haber || 0));
  // El nombre lo pone la primera fila que lo traiga: la clave es el código, así
  // que una fila sin nombre no puede dejar la línea del desglose sin rótulo.
  if (!c.concepto && nombre) c.concepto = nombre;
  return c;
}

/**
 * El desglose ordenado por código de concepto, para mostrar.
 *
 * **No se descarta el concepto que quedó en 0,00 de los dos lados**, al revés de
 * lo que hace la línea del asiento con una cuenta que se canceló sola: la ficha
 * promete que sus conceptos suman exactamente el saldo de la cuenta, y un
 * concepto escondido rompe esa promesa justo cuando hay algo raro que mirar (un
 * movimiento que entró y salió por la misma cuenta).
 *
 * @param {Map<string, object>} map
 * @returns {{ nro: string|null, concepto: string|null, debe: number, haber: number }[]}
 */
export function conceptosEnOrden(map) {
  return [...(map?.values() || [])]
    .map(c => ({ ...c, debe: round2(c.debe), haber: round2(c.haber) }))
    .sort((a, b) => {
      // Lo que no tiene código va al final: es lo que hay que resolver, no lo
      // que se lee primero (mismo criterio que el orden del asiento).
      const ca = a.nro ?? '', cb = b.nro ?? '';
      if (!ca && cb) return 1;
      if (ca && !cb) return -1;
      const porCodigo = String(ca).localeCompare(String(cb), 'es', { numeric: true });
      if (porCodigo !== 0) return porCodigo;
      return String(a.concepto ?? '').localeCompare(String(b.concepto ?? ''), 'es');
    });
}
