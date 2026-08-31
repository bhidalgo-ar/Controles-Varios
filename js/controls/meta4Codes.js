// meta4Codes.js — Equivalencia código de Axton → código de Meta4 (COTY)
//
// COTY cambió de sistema: la liquidación sale de Axton, pero Contaduría del
// cliente venía leyendo la contabilidad desglosada con los números de concepto
// de Meta4 y pidió seguir viéndolos. Esta tabla es la que traduce.
//
// **Es SEMILLA, no identidad** (D-035/D-039): lo que manda es lo que el analista
// tenga guardado por cliente en el Paso 2. Los 96 pares de acá salen del
// "Reporte de conceptos AFIP" que mandó el cliente (COTY S.A., con las columnas
// "Código AXTON", "Concepto" y "Código META4"), así que están **confirmados
// contra un archivo real** — ninguno se dedujo por analogía. Un concepto que
// Axton liquide y no esté en esta lista sale con la celda de Meta4 vacía y el
// control lo avisa: no se completa con un número parecido.
//
// El nombre del concepto va como comentario, para poder leer la tabla; el cruce
// es siempre **por código** (CLAUDE.md: en el Tabulado conviven '4899-COCHERA_IG'
// y '8805-DTO_COCHERA', y matchear por nombre agarra el equivocado).
//
// Dos cosas que la tabla tiene y conviene saber de antemano:
//   · **Varios códigos de Axton pueden caer en el mismo de Meta4** (los tres
//     preavisos van a 3903, las dos jubilaciones a 6005): la traducción es de
//     ida, de Axton a Meta4, y en ese sentido no hay ambigüedad.
//   · **Un código de Meta4 puede no ser sólo dígitos** ('1191X' para el
//     presentismo), así que se maneja siempre como texto.

/** [código de Axton, código de Meta4] — el comentario es el concepto en Axton. */
export const META4_CODE_SEEDS = [
  ['1000',   '1003'],    // Sueldo Basico
  ['1005',   '1005'],    // Asignacion Estimulo
  ['1018',   '3542'],    // Dia del Gremio
  ['1050',   '4433'],    // Horas extras al 50%
  ['1058',   '1038'],    // Adicional Convenio
  ['1060',   '1205'],    // Adicional dedicacion
  ['1062',   '1076'],    // Ticket Ley 26341
  ['1077',   '1311'],    // Almuerzo CCT 157/91
  ['1210',   '1013'],    // Plus Nocturno
  ['1239',   '3002'],    // Feriado Trabajado
  ['1530',   '4110'],    // Lic. Enfermedad
  ['1540',   '4132'],    // Lic. Maternidad
  ['1550',   '4092'],    // Lic. Excedencia
  ['1560',   '4091'],    // Lic. sin goce de haberes
  ['1580',   '4070'],    // Lic. Casamiento
  ['1590',   '4135'],    // Lic. Mudanza
  ['1600',   '4100'],    // Lic. Examen
  ['1699',   '1004'],    // Descuento x Licencias
  ['1720',   '1004'],    // Descuento Ingreso-Egreso
  ['2000',   '1191X'],   // Presentismo
  ['2005',   '4453'],    // Plus Feriado
  ['2250',   '3553'],    // Lic. Vacaciones CCV
  ['2251',   '4743'],    // Desc Dias Vacaciones CCV
  ['2500',   '1174'],    // BONO
  ['2503',   '1141'],    // Bono Semestral
  ['2504',   '1142'],    // SAC S/ BONO Semestral
  ['2506',   '1174'],    // Bono Anual
  ['2507',   '1175'],    // SAC S/ Bono Anual
  ['2513',   '1215'],    // Objetivo Asistencia F.C.
  ['2517',   '4814'],    // Premiacion extra
  ['2518',   '1230'],    // Premio CU
  ['2519',   '8916'],    // Premio objetivo
  ['2520',   '2134'],    // Bono Extraordinario
  ['2530',   '2135'],    // SAC S/ Bono Extraordinario
  ['2770',   '9080'],    // Ajuste Mes Anterior
  ['2800',   '3854'],    // SAC
  ['2804',   '3613'],    // SAC Primer Semestre
  ['2805',   '3823'],    // SAC Proporcional
  ['2809',   '3623'],    // Anticipo Sac Primer Sem.
  ['3513',   '3513'],    // Antigüedad
  ['502001', '1133'],    // Gratificacion Extraordinaria NR
  ['502005', '2510'],    // Reintegros Gastos de Guarderia
  ['503310', '3973'],    // Vac. no gozadas
  ['503320', '3974'],    // SAC s/ V.N.G.
  ['503760', '3973'],    // Vacaciones No Gozadas
  ['503761', '3974'],    // SAC s/ Vac. No Gozadas
  ['503815', '1025'],    // COMP GASTOS TELETRABAJO
  ['507700', '4210'],    // Anticipo Sueldo
  ['510010', '3903'],    // Preaviso
  ['510012', '3903'],    // SAC s/Preaviso
  ['510014', '3903'],    // Preaviso
  ['510020', '3913'],    // Indemnizacion por Antiguedad
  ['510021', '3913'],    // Indemnizacion por Antiguedad DC
  ['510030', '3943'],    // Integracion Mes Despido
  ['510032', '3943'],    // SAC s/ Integracion
  ['599999', '8999'],    // Redondeo
  ['600000', '7018'],    // Cuota Sindical
  ['600012', '7027'],    // Cuota Sindical FUVA
  ['600015', '8522'],    // Aporte Solidario Perfumistas
  ['605110', '6005'],    // JUBILACION
  ['605111', '6005'],    // JUBILACION
  ['605120', '6018'],    // INSSJ Y P
  ['605121', '6018'],    // INSSJ Y P
  ['605129', '6041'],    // OBRA SOCIAL
  ['605130', '6041'],    // OBRA SOCIAL
  ['605694', '7013'],    // Descuento multas
  ['605696', '8508'],    // Descuento de Comedor
  ['605697', '8507'],    // Descuento Maquina de Cafe
  ['605698', '8544'],    // Desc Llave Maq de Cafe
  ['605699', '8501'],    // Descuento Celular
  ['605700', '8500'],    // Descuento Anticipo
  ['605710', '8540'],    // Embargo Judicial
  ['605715', '8539'],    // Embargo Judicial DC
  ['609995', '5010'],    // Impuesto a los Ingresos Personales
  ['609999', '5310'],    // Imp. ganancias año anterior
  ['800006', '6170'],    // Anula toda automatizacion P.P.
  ['880006', '6170'],    // Credito fiscal IVA
  ['880011', '6105'],    // Contribucion Jubilacion
  ['880012', '6125'],    // Contribucion Ley 19032
  ['880013', '6135'],    // Contribucion ANSES
  ['880014', '6142'],    // Contribucion FNE
  ['880015', '6118'],    // Contribucion AFIP Obra Social
  ['880021', '6050'],    // ART Fijo
  ['880022', '8852'],    // ART % Variable
  ['880023', '6038'],    // Diferencia Prepagas
  ['880025', '4095'],    // Seguro de Vida
  ['880027', '880027'],  // Obra social ANSSAL Contrib.
  ['880104', '7028'],    // Contribucion Extraord. Solidaria
  ['898840', '3670'],    // Provision SAC
  ['898841', '3672'],    // Contribucion s/Prov SAC
  ['898845', '3674'],    // Reversión Provisión SAC
  ['898846', '3676'],    // Reversion Contribucion s/Prov SAC
  ['898850', '3570'],    // Provision Vacaciones
  ['898851', '3572'],    // Cargas Prov. Vacaciones
  ['898855', '3574'],    // Reversion Provision Vacaciones
  ['898856', '3576'],    // Reversion Cargas Prov. Vacaciones
];

/** La semilla en la forma en la que viaja la config del control. */
export const DEFAULT_META4_EQUIVALENCIAS =
  META4_CODE_SEEDS.map(([axton, meta4]) => ({ axton, meta4 }));

/**
 * Clave de comparación de un código de concepto. Sin espacios y en mayúscula
 * (un código de Meta4 puede terminar en letra), y sin los ceros a la izquierda
 * que un export puede agregar: '01000' y '1000' son el mismo concepto.
 */
export function conceptCodeKey(value) {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return '';
  return s.replace(/^0+(?=.)/, '');
}

/**
 * Tabla de equivalencias → Map(código de Axton → código de Meta4).
 *
 * Si la misma línea de Axton aparece dos veces gana la última, que es lo que el
 * analista acaba de escribir más abajo en el editor.
 */
export function buildMeta4Map(equivalencias) {
  const map = new Map();
  for (const e of equivalencias || []) {
    const axton = conceptCodeKey(e?.axton);
    const meta4 = String(e?.meta4 ?? '').trim();
    if (!axton || !meta4) continue;
    map.set(axton, meta4);
  }
  return map;
}
