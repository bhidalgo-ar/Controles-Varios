// fichaCuenta.js — El cuerpo de una ficha cuya unidad es una CUENTA CONTABLE
// (§4 de specs/vista-estandar-resultados.md, tanda 7 del §9).
//
// Dos controles de la batería no se leen por empleado sino por cuenta: el
// Asiento de Remuneraciones (`finadiet_asiento`) y la Contabilidad Desglosada +
// Asiento (`conta_desglosada`). En los dos, lo que el analista no puede ver hoy
// sin exportar a Excel y filtrar a mano es lo mismo: **qué conceptos de
// liquidación forman el saldo de una cuenta**. Eso es lo que arma este módulo, y
// está una sola vez para que las dos pantallas no se vayan separando —que es
// exactamente lo que el estándar viene a arreglar.
//
// Lo que NO hace: no decide en qué estado cerró la cuenta ni escribe la
// conclusión. El estado sale de la regla de cada control (si el asiento cierra,
// si la cuenta tiene código) y la conclusión es una instrucción que depende de
// ese control. Acá está la parte que en los dos es idéntica: la conciliación y
// las dos piezas de cuerpo que salen de ella.
//
// **Estos dos controles cuadran al centavo, no contra un umbral.** No hay monto
// de diferencia del cliente que aflojar: un asiento que descuadra un centavo
// descuadra. Por eso la tolerancia de acá es el centavo del proyecto y nada más.

/** El redondeo de Excel: el piso de todo el repo (CLAUDE.md). */
export const CENTAVO = 0.01;

function round2(n) {
  return Math.round(((n || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * La conciliación de una cuenta contra los conceptos que la componen.
 *
 * El **saldo** va firmado como `DEBE − HABER`, que es la convención con la que
 * se lee un asiento (el debe en positivo): así una cuenta de resultado da
 * positivo y una patrimonial a pagar da negativo, y el signo dice de qué lado
 * queda sin que haya que leer dos columnas.
 *
 * El **residuo** es lo que los conceptos NO explican. Por construcción tiene que
 * dar cero: los conceptos se acumulan en la misma pasada y con el mismo importe
 * que el saldo de la cuenta. Se calcula igual, y se muestra igual, porque es el
 * único lugar donde se vería si algún día se desalinean — un desglose que no
 * suma al saldo que dice explicar es la clase de error que no se detecta mirando
 * los totales, que siguen cerrando.
 *
 * @param {object} cuenta
 * @param {number|null} [cuenta.debe]
 * @param {number|null} [cuenta.haber]
 * @param {{ nro: string|null, concepto: string|null, debe: number, haber: number }[]} [cuenta.conceptos]
 */
export function conciliarCuenta({ debe = 0, haber = 0, conceptos } = {}) {
  // Una corrida guardada ANTES de que existiera este desglose no lo trae, y la
  // pantalla de resultados vuelve a dibujarse sobre lo guardado en IndexedDB
  // (js/ui/controlsResults.js). Sin esta distinción, reabrir el asiento del mes
  // pasado marcaría todas sus cuentas en rojo con un "los conceptos no suman al
  // saldo" que es falso: no es que no sumen, es que no se guardaron. `null` no
  // es `0` y tampoco es `false` (CLAUDE.md).
  const conDesglose = Array.isArray(conceptos);
  const lista = conDesglose ? conceptos : [];
  const d = round2(debe);
  const h = round2(haber);
  const conceptosDebe  = round2(lista.reduce((a, c) => a + (c.debe  || 0), 0));
  const conceptosHaber = round2(lista.reduce((a, c) => a + (c.haber || 0), 0));

  const saldo     = round2(d - h);
  const explicado = round2(conceptosDebe - conceptosHaber);
  const residuo   = round2(explicado - saldo);

  return {
    debe: d,
    haber: h,
    saldo,
    /** De qué lado queda el saldo; `null` si la cuenta se cancela sola. */
    lado: Math.abs(saldo) <= CENTAVO ? null : (saldo > 0 ? 'DEBE' : 'HABER'),
    /** El saldo en positivo: es el número grande de la ficha cerrada. */
    monto: Math.abs(saldo),
    conceptosDebe,
    conceptosHaber,
    explicado,
    /** Qué NO explican los conceptos; `null` si la corrida no guardó el desglose. */
    residuo: conDesglose ? residuo : null,
    /** `true` cuadra · `false` no suma · `null` no se guardó el desglose. */
    cuadra: conDesglose ? Math.abs(residuo) <= CENTAVO : null,
    /** Si esta corrida guardó el desglose por concepto de la cuenta. */
    conDesglose,
    cantidad: lista.length,
  };
}

/**
 * "El único concepto … suma" en singular y "Los 3 conceptos … suman" en plural.
 *
 * Está acá, y no escrito a mano en el mensaje de cada control, porque a mano sale
 * "sus 1 concepto suman exacto": en una pantalla que el analista mira todos los
 * meses, esa clase de detalle es lo que la hace sentir descuidada.
 *
 * @param {number} n
 */
export function concordancia(n) {
  return {
    /** Sujeto para arrancar una oración: 'El único concepto' / 'Los 3 conceptos'. */
    sujeto:    n === 1 ? 'El único concepto' : `Los ${n} conceptos`,
    /** El mismo sujeto para el medio de una frase: 'su único concepto' / 'sus 3 conceptos'. */
    sujetoSuyo: n === 1 ? 'su único concepto' : `sus ${n} conceptos`,
    /** El verbo que concuerda con los dos. */
    suman:     n === 1 ? 'suma' : 'suman',
  };
}

/**
 * La tira de conciliación (§4, bloque 1): de los conceptos al saldo de la
 * cuenta. La última pastilla antes del residuo va invertida y el residuo en rojo
 * sólo si de verdad quedó algo sin explicar.
 *
 * @param {ReturnType<typeof conciliarCuenta>} c
 */
export function tiraDeCuenta(c) {
  // Sin desglose guardado no se puede armar la cascada desde los conceptos: se
  // muestra lo que la corrida sí tiene, que son los dos lados y el saldo. Poner
  // "Suman al DEBE 0,00" sería inventar un dato que no existe.
  if (!c.conDesglose) {
    return [
      { label: 'DEBE de la cuenta',  value: c.debe },
      { label: 'HABER de la cuenta', value: c.haber },
      { label: 'Saldo de la cuenta (DEBE − HABER)', value: c.saldo, invert: true },
    ];
  }
  return [
    { label: c.cantidad === 1 ? 'Concepto que la compone' : 'Conceptos que la componen',
      value: String(c.cantidad) },
    { label: 'Suman al DEBE',  value: c.conceptosDebe },
    { label: 'Suman al HABER', value: c.conceptosHaber },
    { label: 'Saldo de la cuenta (DEBE − HABER)', value: c.saldo, invert: true },
    { label: 'Sin explicar', value: c.residuo, residuo: !c.cuadra },
  ];
}

/**
 * La tabla de detalle (§4, bloque 3): una fila por concepto, **con su código**,
 * y el efecto de ese concepto sobre el saldo de la cuenta. Es lo que hoy sólo se
 * puede ver exportando a Excel y filtrando a mano.
 *
 * Las filas que empujan el saldo al DEBE salen en verde suave y las que lo
 * empujan al HABER en rojo suave — el mismo código de color que la ficha del
 * piloto: no es "bueno/malo", es de qué lado tira cada concepto.
 *
 * Un `0,00` de un lado no es ausencia de dato: es que ese concepto no puso nada
 * de ese lado, y es un valor calculado. Por eso va como número y no como `—`.
 *
 * @param {{ nro, concepto, debe, haber }[]} conceptos
 * @param {ReturnType<typeof conciliarCuenta>} c
 * @param {{ title?: string }} [opts]
 * @returns {object|undefined} `undefined` cuando la cuenta no tiene desglose
 *   (el bloque de detalle es opcional: no se dibuja una tabla vacía)
 */
export function detalleDeConceptos(conceptos, c, { title } = {}) {
  if (!conceptos?.length) return undefined;
  return {
    title: title || 'Qué conceptos la componen — y cómo suman hasta el saldo',
    columns: [
      { key: 'nro',      label: 'Cód.' },
      { key: 'concepto', label: 'Concepto' },
      { key: 'debe',     label: 'DEBE',  num: true },
      { key: 'haber',    label: 'HABER', num: true },
      { key: 'efecto',   label: 'Efecto en el saldo', num: true },
    ],
    rows: conceptos.map((x) => {
      const efecto = round2((x.debe || 0) - (x.haber || 0));
      return {
        nro:      x.nro || '—',
        concepto: x.concepto || '(sin nombre de concepto)',
        debe:     round2(x.debe),
        haber:    round2(x.haber),
        efecto,
        tone: Math.abs(efecto) <= CENTAVO ? undefined : (efecto > 0 ? 'pos' : 'neg'),
      };
    }),
    foot: { label: 'Suma de los conceptos (DEBE − HABER)', value: c.explicado },
  };
}

/**
 * La línea de contexto en gris de la ficha cerrada: su DEBE, su HABER y si
 * cuadra. Los tres tienen que verse **sin abrir la ficha**, que es lo que se
 * pidió para estos dos controles.
 *
 * @param {ReturnType<typeof conciliarCuenta>} c
 * @param {(n: number) => string} fmt - el formateador de importes del control
 */
export function contextoDeCuenta(c, fmt) {
  return [
    `DEBE ${fmt(c.debe)}`,
    `HABER ${fmt(c.haber)}`,
    !c.conDesglose
      ? 'sin desglose por concepto: esta corrida se guardó antes'
      : c.cuadra
        ? `${c.cantidad} concepto${c.cantidad === 1 ? ' que suma' : 's que suman'} exacto`
        : `los conceptos no suman al saldo: faltan ${fmt(c.residuo)}`,
  ];
}

/**
 * El rótulo chico arriba del importe grande: de qué lado queda el saldo.
 *
 * `palabra` existe porque los dos entregables lo llaman distinto y la ficha se
 * lee al lado del archivo: el asiento de FINADIET tiene columnas DEBE y HABER y
 * ahí el número es el SALDO, mientras que el asiento de la Desglosada tiene
 * además NETO DEBE y NETO HABER y ahí ese mismo número es el NETO. La cuenta es
 * la misma (`DEBE − HABER`); lo que cambia es cómo lo nombra el cliente.
 */
export function rotuloDeSaldo(c, palabra = 'SALDO') {
  return c.lado ? `${palabra} AL ${c.lado}` : palabra;
}
