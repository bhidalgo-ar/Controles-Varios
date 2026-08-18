/**
 * Validación de CBU (Clave Bancaria Uniforme) argentino.
 *
 * Estructura (22 dígitos):
 *   Bloque 1 (8 dígitos): 3 código banco + 4 código sucursal + 1 dígito verificador
 *   Bloque 2 (14 dígitos): 13 número cuenta + 1 dígito verificador
 *
 * Algoritmo: módulo 10 con pesos diferentes por bloque.
 *
 * Referencia: BCRA Com. "A" 2559 y actualizaciones.
 *
 * Uso:
 *   validateCBU("0070099530004017653471")  → { valid: true, bank: "007" (Galicia), ... }
 */

// Pesos para verificación módulo 10
const CBU_WEIGHTS_BLOCK1 = [7, 1, 3, 9, 7, 1, 3];           // primeros 7 dígitos del bloque 1
const CBU_WEIGHTS_BLOCK2 = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]; // primeros 13 del bloque 2

// Códigos de banco más comunes en AR (no exhaustivo - se puede extender)
const BANK_CODES = {
  "005": "ABN AMRO Bank",
  "007": "Banco Galicia",
  "011": "Banco de la Nación Argentina",
  "014": "BAPRO (Banco Provincia)",
  "015": "ICBC (ex Standard Bank)",
  "016": "Citibank",
  "017": "BBVA",
  "018": "Banco de la Pampa",
  "020": "Banco de la Ciudad",
  "027": "Supervielle",
  "029": "Banco de la Ciudad de Buenos Aires",
  "034": "Banco Patagonia",
  "044": "Nuevo Banco de Santa Fe",
  "045": "Banco del Chaco",
  "046": "Banco Formosa",
  "060": "Banco del Tucumán",
  "065": "Banco Municipal de Rosario",
  "072": "Santander",
  "083": "Banco del Chubut",
  "086": "Banco de Santa Cruz",
  "093": "Banco de Corrientes",
  "094": "Banco Provincia del Neuquén",
  "097": "Banco BICA",
  "147": "Banco BICA",
  "150": "HSBC",
  "165": "JPMorgan",
  "191": "Banco Credicoop",
  "198": "Banco de Valores",
  "247": "Banco Roela",
  "254": "Banco Mariva",
  "259": "Banco Itaú",
  "262": "Banco Hipotecario",
  "266": "BNP Paribas",
  "268": "Banco Provincia de Tierra del Fuego",
  "269": "Banco de la República Oriental del Uruguay",
  "277": "Banco San Juan",
  "281": "Banco Meridian",
  "285": "Macro",
  "299": "Banco Coinag",
  "300": "Banco de Inversión y Comercio Exterior",
  "301": "Banco Piano",
  "305": "Banco Julio",
  "309": "Nuevo Banco de La Rioja",
  "310": "Banco del Sol",
  "311": "Nuevo Banco del Chaco",
  "312": "Banco VOII",
  "315": "Banco de Formosa",
  "319": "Banco CMF",
  "321": "Banco de Santiago del Estero",
  "322": "Banco Industrial",
  "330": "Nuevo Banco de Santa Fe",
  "331": "Banco Cetelem",
  "332": "Banco de Servicios Financieros",
  "336": "Banco Bradesco Argentina",
  "338": "Banco de Servicios y Transacciones",
  "339": "RCI Banque",
  "340": "BACS Banco de Crédito y Securitización",
  "341": "Banco Mas Ventas",
  "384": "Wilobank",
  "386": "Nuevo Banco de Entre Ríos",
  "389": "Banco Columbia",
  "405": "Ford Credit Compañía Financiera",
  "406": "Metrópolis Compañía Financiera",
  "408": "Compañía Financiera Argentina",
  "413": "Montemar Compañía Financiera",
  "415": "Multifinanzas Compañía Financiera",
  "428": "Caja de Crédito Coop. La Capital del Plata",
  "431": "Nuevo Banco de Entre Ríos",
  "432": "Banco Comafi",
  "435": "Banco Supervielle",
  "448": "Banco Dino"
};

function normalizeCBU(v) {
  if (v == null) return "";
  return String(v).replace(/\D+/g, "");
}

/**
 * Verifica el dígito verificador de un bloque usando módulo 10.
 * @param {string} block - bloque sin el DV
 * @param {number[]} weights - pesos para cada posición
 * @param {number} expectedDV - dígito verificador esperado
 */
function verifyCBUBlock(block, weights, expectedDV) {
  if (block.length !== weights.length) return false;
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += parseInt(block[i], 10) * weights[i];
  }
  const dv = (10 - (sum % 10)) % 10;
  return dv === expectedDV;
}

/**
 * Valida un CBU completo.
 * @param {string} v
 * @returns {{valid: boolean, reason: string|null, normalized: string, bank: {code, name}|null, branch: string|null, account: string|null}}
 */
function validateCBU(v) {
  const s = normalizeCBU(v);
  if (s.length !== 22) {
    return { valid: false, reason: "length", normalized: s, bank: null, branch: null, account: null };
  }

  const block1 = s.slice(0, 8);
  const block2 = s.slice(8, 22);
  const dv1 = parseInt(block1[7], 10);
  const dv2 = parseInt(block2[13], 10);

  if (!verifyCBUBlock(block1.slice(0, 7), CBU_WEIGHTS_BLOCK1, dv1)) {
    return { valid: false, reason: "block1_checksum", normalized: s, bank: null, branch: null, account: null };
  }
  if (!verifyCBUBlock(block2.slice(0, 13), CBU_WEIGHTS_BLOCK2, dv2)) {
    return { valid: false, reason: "block2_checksum", normalized: s, bank: null, branch: null, account: null };
  }

  const bankCode = s.slice(0, 3);
  const branchCode = s.slice(3, 7);
  const accountNumber = s.slice(8, 21);

  return {
    valid: true,
    reason: null,
    normalized: s,
    bank: { code: bankCode, name: BANK_CODES[bankCode] || "Banco desconocido" },
    branch: branchCode,
    account: accountNumber
  };
}

/**
 * Formatea un CBU con separadores visuales.
 * "0070099530004017653471" → "0070099-5-30004017653-471" (ilustrativo, no estándar oficial)
 */
function formatCBU(v) {
  const s = normalizeCBU(v);
  if (s.length !== 22) return s;
  return `${s.slice(0, 8)}-${s.slice(8, 22)}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateCBU, normalizeCBU, formatCBU, BANK_CODES };
}
