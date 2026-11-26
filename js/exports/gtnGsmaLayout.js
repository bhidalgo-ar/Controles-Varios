// gtnGsmaLayout.js — El Excel "Gross to Net" (GTN) que GSMA recibe todos los
// meses, escrito como código (specs/gtn-gsma-axton.md §4).
//
// Reproduce el GTN que armaba Meta4 hasta octubre 2026 —mismas columnas, mismas
// filas de encabezado, mismas fórmulas, mismo cuadro de autorización— con UNA
// columna insertada: `Recognition Award`, a la derecha de `Referral Bonus`
// (Element Code D0159, GL Account 200360, ARS: los de Bonus, decisión de la
// analista del 25/11/2026). Todo lo que en Meta4 está de `Bonus` hacia la
// derecha corre una columna.
//
// **No hay plantilla binaria, a propósito.** Un `.xlsx` en el repo lo frena el
// chequeo de datos sensibles, y la plantilla del prototipo traía en sus
// propiedades el nombre de quien la creó. El layout vive acá, como una tabla de
// columnas (`GTN_COLUMNS`) de la que sale TODO: los encabezados, las letras, las
// fórmulas, qué se escribe vacío y qué en 0, el contrato de export
// (js/exports/contracts.js) y el desplegable de columnas del Paso 2. Una columna
// que se mueve se mueve en un solo lugar.
//
// **Las fórmulas se escriben por código según la cantidad de empleados**: el
// GTN de Meta4 tenía 11 filas (9 a 19) y los totales en la 20, pero la nómina
// cambia mes a mes. Nada de "la fila 20" acá: sale de cuántas filas hay.
//
// El armado no decide nada: recibe las filas ya calculadas por el control
// (js/controls/gtnGsma.js) y las escribe. `null` no es `0` en el cálculo; acá,
// y SÓLO acá, una columna que Meta4 completaba con 0 se escribe con 0 (es la
// forma del archivo que espera GSMA, no un dato).

// ── Constantes del layout de GSMA ────────────────────────────────────────────

/** Sueldo mensual en USD = sueldo anual en USD / 13,3 (fijo en el GTN de GSMA). */
export const USD_DIVISOR = 13.3;

/**
 * La detracción del art. 23 de la Ley 27.541 que el GTN de Meta4 trae fija,
 * debajo de los totales, y que entra sólo en el cuadro (Social Security
 * Payments). No sale del Tabulado — no es el 880001 de Axton. Pregunta abierta
 * en el §10 de la spec: si cambia, se cambia acá.
 */
export const DETRACCION_ART23 = -2040;
export const DETRACCION_LABEL = 'Detracción art. 23 Ley 27.541';

/** Primera fila de empleados (como en Meta4). */
export const FIRST_EMPLOYEE_ROW = 9;

/** La detracción va 3 filas debajo de los totales (Meta4: totales 20, detracción 23). */
const DETRACCION_OFFSET = 3;

// ── Las columnas ─────────────────────────────────────────────────────────────
//
// Cada columna:
//   key      — identificador estable (la config de asignaciones lo guarda)
//   header   — el encabezado LITERAL de la fila 4, con sus espacios (Meta4 los
//              trae y GSMA los ve); `null` = sin celda (la columna sin título a la
//              derecha de Income Tax)
//   ui       — cómo se la nombra en la pantalla (el `header` sin espacios de más,
//              o una descripción si no tiene título)
//   kind     — 'id' (datos del empleado), 'usd' (fórmula del sueldo en USD),
//              'amount' (importe que sale del Tabulado), 'calc' (fórmula)
//   block    — dónde suma: 'gross' (entra en Gross Pay), 'deduction' (en Total
//              Employee deductions), 'net' (ER Net Paid), 'employer' (en Employer
//              Total costs). Sólo para `kind: 'amount'`.
//   fill     — qué se escribe si el empleado no trae importe: 'always' (0, Meta4
//              lo completa siempre), 'zero' (0) o 'blank' (vacío)
//   local    — fila 5 ("Local Language")
//   element  — fila 6 ("Element Code")
//   gl       — fila 7 ("GL Account")
//   currency — fila 8 ("Currency")
//   width    — ancho de columna (el de Meta4 11/2026)
//   style    — 'calc' (relleno gris, como Meta4) o 'bold' para las de neto
//   greenTotal — el total de la columna va en verde (como Meta4)

const C = (o) => ({ fill: 'blank', block: null, local: null, element: null, gl: null, currency: null, style: null, greenTotal: false, ...o });

export const GTN_COLUMNS = [
  C({ key: 'employeeNumber', header: 'Employee Number', ui: 'Employee Number', kind: 'id', width: 17 }),
  C({ key: 'employeeName', header: 'Employee Name', ui: 'Employee Name', kind: 'id', width: 33 }),
  C({ key: 'costCentre', header: 'Cost Centre', ui: 'Cost Centre', kind: 'id', width: 15.6640625 }),
  C({ key: 'locationCode', header: 'Location Code', ui: 'Location Code', kind: 'id', width: 13.5546875 }),
  C({ key: 'monthlySalaryUsd', header: 'Monthly Salary in USD', ui: 'Monthly Salary in USD', kind: 'usd',
    element: 'B9999', currency: 'USD', style: 'calc', width: 13.5546875 }),
  C({ key: 'monthlySalary', header: 'Monthly Salary ', ui: 'Monthly Salary', kind: 'amount', block: 'gross',
    fill: 'always', element: 'D0156', gl: 200100, currency: 'ARS', greenTotal: true, width: 15.33203125 }),
  C({ key: 'daysNotWorked', header: 'Days not worked', ui: 'Days not worked', kind: 'amount', block: 'gross',
    element: 'D0156', gl: 200100, currency: 'ARS', width: 14.77734375 }),
  C({ key: 'variablePay', header: 'Variable Pay', ui: 'Variable Pay', kind: 'amount', block: 'gross',
    fill: 'always', element: 'D0156', gl: 200100, currency: 'ARS', greenTotal: true, width: 15.6640625 }),
  C({ key: 'excedencia', header: 'Excedencia', ui: 'Excedencia', kind: 'amount', block: 'gross',
    element: 'D0156', gl: 200110, currency: 'ARS', width: 15.6640625 }),
  C({ key: 'referralFee', header: 'Referral Fee', ui: 'Referral Fee', kind: 'amount', block: 'gross',
    element: 'D0157', gl: 200300, currency: 'ARS', width: 14.109375 }),
  C({ key: 'commission', header: 'Commission', ui: 'Commission', kind: 'amount', block: 'gross',
    element: 'D0158', gl: 200115, currency: 'ARS', greenTotal: true, width: 15.33203125 }),
  C({ key: 'referralBonus', header: 'Referral Bonus', ui: 'Referral Bonus', kind: 'amount', block: 'gross',
    fill: 'zero', element: 'D0159', gl: 200360, currency: 'ARS', width: 16.6640625 }),
  // La columna nueva: no existe en el GTN de Meta4.
  C({ key: 'recognitionAward', header: 'Recognition Award', ui: 'Recognition Award', kind: 'amount', block: 'gross',
    fill: 'zero', element: 'D0159', gl: 200360, currency: 'ARS', width: 16.6640625 }),
  C({ key: 'bonus', header: 'Bonus', ui: 'Bonus', kind: 'amount', block: 'gross',
    fill: 'zero', element: 'D0159', gl: 200360, currency: 'ARS', width: 16.6640625 }),
  C({ key: 'teleworking', header: 'Teleworking expenses', ui: 'Teleworking expenses', kind: 'amount', block: 'gross',
    fill: 'always', element: 'D0156', gl: 200100, currency: 'ARS', greenTotal: true, width: 12.21875 }),
  C({ key: 'thirteenthSalary', header: '13th salary ', ui: '13th salary', kind: 'amount', block: 'gross',
    fill: 'zero', element: 'D0156', gl: 200100, currency: 'ARS', width: 15.33203125 }),
  C({ key: 'holidayPay', header: 'Holiday Pay', ui: 'Holiday Pay', kind: 'amount', block: 'gross',
    element: 'D0156', gl: 200100, currency: 'ARS', width: 15.33203125 }),
  C({ key: 'businessReferral', header: 'Business Referrral ', ui: 'Business Referrral', kind: 'amount', block: 'gross',
    fill: 'zero', element: 'D0156', gl: 200100, currency: 'ARS', width: 15.33203125 }),
  C({ key: 'directorAllowance', header: 'Director Allowance', ui: 'Director Allowance', kind: 'amount', block: 'gross',
    fill: 'zero', element: 'D0156', gl: 200100, currency: 'ARS', greenTotal: true, width: 14.109375 }),
  C({ key: 'vacationDeduction', header: 'Vacation Deduction', ui: 'Vacation Deduction', kind: 'amount', block: 'gross',
    element: 'D0156', gl: 200100, currency: 'ARS', width: 9.21875 }),
  C({ key: 'severance', header: 'Severance Payment (Grat x Cese)', ui: 'Severance Payment (Grat x Cese)', kind: 'amount',
    block: 'gross', element: 'D0160', gl: 200150, currency: 'ARS', width: 17.44140625 }),
  C({ key: 'noticePay', header: 'Notice Pay', ui: 'Notice Pay', kind: 'amount', block: 'gross',
    element: 'D0160', gl: 200150, currency: 'ARS', width: 9.88671875 }),
  C({ key: 'grossPay', header: 'Gross Pay', ui: 'Gross Pay', kind: 'calc', element: 'B9999', currency: 'ARS',
    style: 'calc', greenTotal: true, width: 19.33203125 }),
  C({ key: 'socialSecurity', header: 'Social Security', ui: 'Social Security', kind: 'amount', block: 'deduction',
    fill: 'always', local: 'Jubilacion', element: 'C0133', gl: 700440, currency: 'ARS', greenTotal: true, width: 14.33203125 }),
  C({ key: 'healthInsurance', header: 'Health Insurance', ui: 'Health Insurance', kind: 'amount', block: 'deduction',
    fill: 'always', local: 'Obra Social', element: 'C0133', gl: 700440, currency: 'ARS', greenTotal: true, width: 14.6640625 }),
  C({ key: 'law19032', header: 'Law 19032', ui: 'Law 19032', kind: 'amount', block: 'deduction',
    fill: 'always', local: 'Ley 19032', element: 'C0133', gl: 700440, currency: 'ARS', greenTotal: true, width: 14.109375 }),
  C({ key: 'incomeTax', header: 'Income Tax', ui: 'Income Tax', kind: 'amount', block: 'deduction',
    fill: 'always', local: 'Impuesto a las ganancias', element: 'C0136', gl: 700158, currency: 'ARS', greenTotal: true,
    width: 21.77734375 }),
  // Sin encabezado en Meta4 (la celda de la fila 4 no existe), pero sí con 0 en
  // cada empleado y dentro de Total Employee deductions y de Withholding Tax.
  C({ key: 'incomeTaxExtra', header: null, ui: 'Columna sin título (a la derecha de Income Tax)', kind: 'amount',
    block: 'deduction', fill: 'zero', local: ' ', element: ' ', gl: ' ', currency: 'ARS', width: 15.109375 }),
  C({ key: 'miscDeduction', header: 'Miscellaneous deduction', ui: 'Miscellaneous deduction', kind: 'amount',
    block: 'deduction', fill: 'zero', local: ' ', element: ' ', gl: ' ', currency: 'ARS', width: 12.6640625 }),
  C({ key: 'otherDeduction', header: ' ', ui: 'Columna sin título (a la derecha de Miscellaneous deduction)', kind: 'amount',
    block: 'deduction', fill: 'zero', element: ' ', gl: ' ', currency: 'ARS', width: 6.33203125 }),
  C({ key: 'totalDeductions', header: 'Total Employee deductions', ui: 'Total Employee deductions', kind: 'calc',
    element: 'B9999', currency: 'ARS', greenTotal: true, width: 15.88671875 }),
  C({ key: 'netPay', header: 'Net Pay', ui: 'Net Pay', kind: 'calc', element: 'C0132', gl: 700440, currency: 'ARS',
    style: 'bold', greenTotal: true, width: 18 }),
  C({ key: 'erNetPaid', header: 'ER Net Paid', ui: 'ER Net Paid', kind: 'amount', block: 'net',
    fill: 'always', currency: 'ARS', style: 'calc', greenTotal: true, width: 17.6640625 }),
  C({ key: 'netPayOnPayslips', header: 'Net Pay on Payslips          ARS 0,00', ui: 'Net Pay on Payslips', kind: 'calc',
    currency: 'ARS', style: 'bold', greenTotal: true, width: 17.6640625 }),
  C({ key: 'ssEmployer', header: 'Social Security (20,4%)', ui: 'Social Security (20,4%)', kind: 'amount', block: 'employer',
    fill: 'always', local: ' ', element: 'E0065', gl: 'D-200130 / C-700440', currency: 'ARS', greenTotal: true,
    width: 17.77734375 }),
  C({ key: 'hiEmployer', header: 'Health Insurance (6%)', ui: 'Health Insurance (6%)', kind: 'amount', block: 'employer',
    fill: 'always', local: ' ', element: 'E0066', gl: 'D-200200 / C-700440', currency: 'ARS', greenTotal: true,
    width: 16.5546875 }),
  C({ key: 'accidentInsurance', header: 'Accident Insurance (1,69%)', ui: 'Accident Insurance (1,69%)', kind: 'amount',
    block: 'employer', fill: 'always', local: ' ', element: 'E0067', gl: 'D-200350 / C-700440', currency: 'ARS',
    greenTotal: true, width: 18.109375 }),
  C({ key: 'fixedAccident', header: 'Fixed Accident Insurance              ', ui: 'Fixed Accident Insurance', kind: 'amount',
    block: 'employer', fill: 'always', local: ' ', element: 'E0067', gl: 'D-200350 / C-700440', currency: 'ARS',
    greenTotal: true, width: 12.88671875 }),
  C({ key: 'fixedLife', header: 'Fixed Life Insurance ', ui: 'Fixed Life Insurance', kind: 'amount', block: 'employer',
    fill: 'always', element: 'E0067', gl: 'D-200350 / C-700440', currency: 'ARS', greenTotal: true, width: 13.5546875 }),
  C({ key: 'erPension', header: 'ER Pension', ui: 'ER Pension', kind: 'amount', block: 'employer',
    element: 'E0068', gl: 'D-200140 / C-700440', currency: 'ARS', width: 13.88671875 }),
  C({ key: 'employerTotal', header: 'Employer Total costs', ui: 'Employer Total costs', kind: 'calc', element: 'B9999',
    currency: 'ARS', style: 'calc', width: 17.77734375 }),
  C({ key: 'totalCost', header: 'TOTAL COST', ui: 'TOTAL COST', kind: 'calc', element: 'B9999', currency: 'ARS',
    style: 'calc', width: 16.6640625 }),
];

/** Las columnas a las que se puede asignar un código de Axton (las de importe). */
export const GTN_ASSIGNABLE = GTN_COLUMNS.filter(c => c.kind === 'amount');

/** Por clave. */
export const GTN_COLUMN_BY_KEY = Object.fromEntries(GTN_COLUMNS.map(c => [c.key, c]));

// ── Letras ───────────────────────────────────────────────────────────────────

/** 1 → 'A', 27 → 'AA'. */
export function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Número de columna (1-based) de cada clave en el GTN generado. */
export const GTN_COL_NUM = Object.fromEntries(GTN_COLUMNS.map((c, i) => [c.key, i + 1]));
const L = (key) => colLetter(GTN_COL_NUM[key]);

/** Cuántas columnas tiene la tabla (A..TOTAL COST). */
export const GTN_WIDTH = GTN_COLUMNS.length;

// El cuadro de autorización: en Meta4 AV..BA; acá todo corre una columna, así
// que va de AW a BB. Se ubica a partir del final de la tabla, con el mismo
// hueco de columnas que en Meta4 (AP..AU entre TOTAL COST y el cuadro).
const CUADRO_LABEL_COL = GTN_WIDTH + 7;      // AW
const CUADRO_SUBLABEL_COL = GTN_WIDTH + 8;   // AX
const CUADRO_VALUE_COL = GTN_WIDTH + 12;     // BB

/** La celda del tipo de cambio en el GTN generado (Meta4: BA4). */
export const EXCHANGE_RATE_CELL = `${colLetter(CUADRO_VALUE_COL)}4`;

// Anchos de las columnas entre la tabla y el cuadro, y del cuadro (Meta4 AP..BB).
const ANCHOS_CUADRO = [13.5546875, 13.5546875, 13.5546875, 13.5546875, 13.5546875, 3.77734375,
  13.5546875, 13.5546875, 13.5546875, 14.109375, 13.5546875, 18.21875, 3.77734375];

// ── Estilos (los del GTN de Meta4, simplificados) ───────────────────────────
// Son colores del ARCHIVO que se entrega, no de la app: no salen de tokens.css
// (mismo criterio que saldoVacaciones.js y contracts.js).

const ARGB_GRIS     = 'FFC0C0C0';
const ARGB_VERDE    = 'FF00FF00';
const ARGB_CUADRO   = 'FFB3F9A7';
const ARGB_AMARILLO = 'FFFFFF00';

const FMT_IMPORTE = '#,##0.00';
const FMT_USD     = '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)';
const FMT_CUADRO  = '_ * #,##0.00_ ;_ * \\-#,##0.00_ ;_ * \\-??_ ;_ @_ ';
const FMT_KR      = '#,##0.00\\ [$kr-41D]';

const font = (o = {}) => ({ name: 'Arial', family: 2, size: 10, ...o });
const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' };
const medium = { style: 'medium' };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const BORDER_TOTAL = { top: thin, left: medium, bottom: medium, right: medium };

// ── El nombre del archivo ────────────────────────────────────────────────────

/** `5_AAAA_MM_GSMA_Argentina_GTN.xlsx` — el de Meta4, con extensión .xlsx. */
export function gtnFileName(period) {
  const [y, m] = String(period || '').split('-');
  return `5_${y || 'AAAA'}_${m || 'MM'}_GSMA_Argentina_GTN.xlsx`;
}

// ── Valores por fila ────────────────────────────────────────────────────────

/**
 * Lo que se escribe en una celda de importe: el valor si hay, y si no lo que
 * pide la columna (0 o vacío). Es el ÚNICO lugar donde un `null` pasa a `0`, y
 * es la forma del archivo, no un dato.
 */
export function valorDeEscritura(col, valor) {
  if (valor !== null && valor !== undefined) return valor;
  return col.fill === 'blank' ? null : 0;
}

/** Las fórmulas de una fila de empleado, por clave. */
export function formulasDeFila(r) {
  return {
    grossPay:         `SUM(${L('monthlySalary')}${r}:${L('noticePay')}${r})`,
    totalDeductions:  `SUM(${L('socialSecurity')}${r}:${L('otherDeduction')}${r})`,
    netPay:           `${L('grossPay')}${r}-${L('totalDeductions')}${r}`,
    netPayOnPayslips: `+${L('netPay')}${r}-${L('erNetPaid')}${r}`,
    employerTotal:    `SUM(${L('ssEmployer')}${r}:${L('erPension')}${r})`,
    totalCost:        `${L('grossPay')}${r}+${L('employerTotal')}${r}`,
  };
}

/** Lo que vale una celda para una fórmula de Excel: vacío o texto = 0. */
function numero(v) {
  if (v && typeof v === 'object' && 'result' in v) return numero(v.result);
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

const KEYS_GROSS = GTN_COLUMNS.filter(c => c.block === 'gross').map(c => c.key);
const KEYS_DEDUCCION = GTN_COLUMNS.filter(c => c.block === 'deduction').map(c => c.key);
const KEYS_EMPLEADOR = GTN_COLUMNS.filter(c => c.block === 'employer').map(c => c.key);

/**
 * Lo que dan las fórmulas de una fila sobre los valores escritos — exactamente
 * lo que va a calcular Excel (vacío = 0). No es el cálculo del control (ahí
 * `null` no es `0`): es el resultado cacheado de cada fórmula.
 */
export function resultadosDeFila(escrito) {
  const suma = (keys) => keys.reduce((acc, k) => acc + numero(escrito[k]), 0);
  const grossPay = suma(KEYS_GROSS);
  const totalDeductions = suma(KEYS_DEDUCCION);
  const netPay = grossPay - totalDeductions;
  const employerTotal = suma(KEYS_EMPLEADOR);
  return {
    grossPay, totalDeductions, netPay,
    netPayOnPayslips: netPay - numero(escrito.erNetPaid),
    employerTotal,
    totalCost: grossPay + employerTotal,
  };
}

/** Cómo se escribe el sueldo anual en la fórmula: tal cual vino, sin redondear. */
function usdFormula(anual) {
  return `${anual}/${USD_DIVISOR}`;
}

// ── El libro ─────────────────────────────────────────────────────────────────

/**
 * Arma el GTN. Recibe la librería de ExcelJS (la del navegador o la de node)
 * para poder armarlo y mirarle las celdas en los tests.
 *
 * Escribe la hoja fila por fila con `addRow` (1, 2, 3…), así el número de cada
 * fila es su posición y las fórmulas se arman con ese número. El cuadro de
 * autorización (a la derecha de la tabla, filas 1 a 10) se escribe con
 * `getCell` sobre esas mismas filas: no es parte de la tabla del contrato de
 * export (ver `tests/exportSinWriterConformidad.test.js`).
 *
 * @param {object} ExcelJS
 * @param {object} gtn — lo arma `gtnParaExcel()` del control:
 *   { period: 'AAAA-MM', tipoCambio: number,
 *     filas: [{ employeeNumber, nombre, costCentre, locationCode,
 *               usd: { anual: number|null, valor: number|null },
 *               valores: { <key>: number|null },
 *               marcas: [{ col: <key>, nota: string }] }] }
 */
export function buildGtnGsmaWorkbook(ExcelJS, gtn) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Controles Nómina';
  wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };

  const ws = wb.addWorksheet('GSMA');
  ws.columns = [...GTN_COLUMNS.map(c => ({ width: c.width })), ...ANCHOS_CUADRO.map(width => ({ width }))];

  const filas = gtn.filas || [];
  const n = filas.length;
  const lastEmp = FIRST_EMPLOYEE_ROW + n - 1;
  const totalRow = lastEmp + 1;
  const detRow = totalRow + DETRACCION_OFFSET;
  const lastRow = Math.max(detRow, 10);

  // Una matriz de valores por fila (índice 0 = columna A) y los estilos aparte.
  const values = Array.from({ length: lastRow + 1 }, () => []);
  const styles = new Map(); // `${r}:${c}` → estilo
  const setCell = (r, key, value, style) => {
    const c = GTN_COL_NUM[key];
    values[r][c - 1] = value;
    if (style) styles.set(`${r}:${c}`, style);
  };
  const setStyle = (r, key, style) => styles.set(`${r}:${GTN_COL_NUM[key]}`, style);

  // ── Filas 1 a 3 ────────────────────────────────────────────────────────────
  values[1][0] = 'Gross to Net';
  styles.set('1:1', { font: font({ size: 14, bold: true }) });
  values[2][0] = 'GSMA';
  styles.set('2:1', { font: font({ size: 14, bold: true }) });
  const [py, pm] = String(gtn.period || '').split('-').map(Number);
  values[2][1] = (py && pm) ? new Date(Date.UTC(py, pm - 1, 1)) : null;
  styles.set('2:2', { font: font({ size: 10, bold: true }), numFmt: 'mmm-yy', alignment: { horizontal: 'left' } });

  const bloque = { font: font({ bold: true }), alignment: { horizontal: 'center', vertical: 'middle' },
    border: { top: medium, left: thin, right: thin, bottom: thin } };
  setCell(3, 'employeeName', 'Employee Information', { ...bloque, alignment: { vertical: 'middle' }, numFmt: '@' });
  setCell(3, 'socialSecurity', 'Employee Deductions', bloque);
  setCell(3, 'ssEmployer', 'Employer Costs', bloque);

  // ── Filas 4 a 8: encabezados, Local Language, Element Code, GL, Currency ──
  values[5][0] = 'Local Language ';
  values[6][0] = 'Element Code';
  values[7][0] = 'GL Account';
  values[8][0] = 'Currency';
  for (const r of [5, 6, 7, 8]) {
    styles.set(`${r}:1`, { font: font(), alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }, border: BORDER });
  }
  values[5][1] = ' ';

  GTN_COLUMNS.forEach((col) => {
    const head = {
      font: font({ bold: col.style === 'calc' || col.style === 'bold' }),
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: BORDER,
      ...(col.kind !== 'id' ? { numFmt: col.kind === 'usd' ? FMT_KR : FMT_IMPORTE } : {}),
      ...(col.style === 'calc' ? { fill: solid(ARGB_GRIS) } : {}),
    };
    if (col.header !== null) setCell(4, col.key, col.header, head);
    else setStyle(4, col.key, head);
    if (col.kind === 'id') return;
    const sub = { ...head, font: font() };
    if (col.local !== null) setCell(5, col.key, col.local, sub); else setStyle(5, col.key, sub);
    if (col.element !== null) setCell(6, col.key, col.element, sub); else setStyle(6, col.key, sub);
    // La cuenta contable es un número que se lee como código ("200100"), no un
    // importe: en formato General, como en Meta4 — con `#,##0.00` saldría "200.100,00".
    const gl = { ...sub, numFmt: 'General' };
    if (col.gl !== null) setCell(7, col.key, col.gl, gl); else setStyle(7, col.key, gl);
    if (col.currency !== null) setCell(8, col.key, col.currency, { ...sub, numFmt: FMT_KR });
    else setStyle(8, col.key, sub);
  });

  // ── Empleados ──────────────────────────────────────────────────────────────
  const notas = new Map(); // `${r}:${c}` → texto del comentario
  const filaResultados = [];
  filas.forEach((f, i) => {
    const r = FIRST_EMPLOYEE_ROW + i;
    const formulas = formulasDeFila(r);
    const marcadas = new Map((f.marcas || []).map(m => [m.col, m.nota]));

    // Primero lo que se escribe en cada celda de dato; después las fórmulas,
    // con el resultado que va a dar Excel sobre ESOS valores (vacío = 0). El
    // resultado viaja en la celda para quien abra el archivo sin recalcular; con
    // `fullCalcOnLoad` Excel lo recalcula igual.
    const escrito = {};
    for (const col of GTN_COLUMNS) {
      if (col.kind === 'id' || col.kind === 'calc') continue;
      if (col.kind === 'usd') {
        if (f.usd?.anual !== null && f.usd?.anual !== undefined) {
          escrito[col.key] = { formula: usdFormula(f.usd.anual), result: f.usd.anual / USD_DIVISOR };
        } else if (f.usd?.valor !== null && f.usd?.valor !== undefined) {
          // El GTN anterior no traía la fórmula: se copia el valor tal cual
          // (marcado en amarillo), no se reconstruye un anual que nadie escribió.
          escrito[col.key] = f.usd.valor;
        } else {
          escrito[col.key] = null;
        }
        continue;
      }
      // Un importe que se marcó como faltante (ER Net Paid que no vino) queda
      // vacío y en amarillo: escribirle un 0 lo haría pasar por un dato.
      const v = f.valores?.[col.key] ?? null;
      escrito[col.key] = marcadas.has(col.key) && v === null ? null : valorDeEscritura(col, v);
    }
    const resultados = resultadosDeFila(escrito);
    filaResultados.push({ ...escrito, ...resultados });

    for (const col of GTN_COLUMNS) {
      const base = {
        font: font({ bold: col.style === 'bold' }),
        alignment: { vertical: 'middle' },
        border: BORDER,
        ...(col.kind !== 'id' ? { numFmt: col.kind === 'usd' ? FMT_USD : FMT_IMPORTE } : {}),
        ...(col.style === 'calc' ? { fill: solid(ARGB_GRIS) } : {}),
      };
      let value;
      if (col.key === 'employeeNumber') value = f.employeeNumber ?? null;
      else if (col.key === 'employeeName') value = f.nombre ?? null;
      else if (col.key === 'costCentre') value = f.costCentre ?? null;
      else if (col.key === 'locationCode') value = f.locationCode ?? null;
      else if (col.kind === 'calc') value = { formula: formulas[col.key], result: resultados[col.key] };
      else value = escrito[col.key];
      const style = marcadas.has(col.key) ? { ...base, fill: solid(ARGB_AMARILLO) } : base;
      setCell(r, col.key, value, style);
      if (marcadas.has(col.key)) notas.set(`${r}:${GTN_COL_NUM[col.key]}`, marcadas.get(col.key));
    }
  });

  // ── Totales ────────────────────────────────────────────────────────────────
  const tot = {};
  for (const col of GTN_COLUMNS) {
    if (col.kind === 'id') continue;
    tot[col.key] = filaResultados.reduce((acc, fr) => acc + numero(fr[col.key]), 0);
  }
  GTN_COLUMNS.forEach((col) => {
    if (col.kind === 'id') return;
    const letra = L(col.key);
    setCell(totalRow, col.key, {
      formula: `SUM(${letra}${FIRST_EMPLOYEE_ROW}:${letra}${lastEmp})`,
      result: tot[col.key] ?? 0,
    }, {
      font: font({ size: 12, bold: true }),
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: BORDER_TOTAL,
      numFmt: FMT_IMPORTE,
      ...(col.greenTotal ? { fill: solid(ARGB_VERDE) } : {}),
    });
  });

  // ── Detracción (3 filas debajo de los totales) ─────────────────────────────
  setCell(detRow, 'socialSecurity', DETRACCION_LABEL, {
    font: { name: 'Tahoma', family: 2, size: 9, bold: true },
    border: { top: medium, left: medium, bottom: medium },
  });
  setCell(detRow, 'law19032', DETRACCION_ART23, {
    font: font({ size: 11, bold: true }), numFmt: FMT_IMPORTE,
    border: { top: medium, right: medium, bottom: medium },
  });

  // ── Escritura ──────────────────────────────────────────────────────────────
  const alturas = { 1: 17.4, 2: 15.6, 3: 21, 4: 27.6, 7: 21, 8: 21 };
  const rows = [];
  for (let r = 1; r <= lastRow; r++) {
    // Densa (null en los huecos): un array con huecos no se recorre igual en
    // todos lados, y cada celda tiene que existir para recibir su estilo.
    const row = ws.addRow(Array.from({ length: values[r].length }, (_, i) => values[r][i] ?? null));
    rows[r] = row;
    if (alturas[r]) row.height = alturas[r];
    else if (r >= FIRST_EMPLOYEE_ROW && r <= lastEmp) row.height = 24.45;
    else if (r === totalRow) row.height = 18.75;
  }
  for (const [pos, st] of styles) {
    const [r, c] = pos.split(':').map(Number);
    const cell = rows[r].getCell(c);
    if (st.font) cell.font = st.font;
    if (st.fill) cell.fill = st.fill;
    if (st.border) cell.border = st.border;
    if (st.alignment) cell.alignment = st.alignment;
    if (st.numFmt) cell.numFmt = st.numFmt;
  }
  for (const [pos, nota] of notas) {
    const [r, c] = pos.split(':').map(Number);
    rows[r].getCell(c).note = nota;
  }

  escribirCuadro(rows, { totalRow, detRow, tipoCambio: gtn.tipoCambio, totales: tot });
  return wb;
}

/**
 * El cuadro de autorización (Meta4 AV1:BA10; acá AW1:BB10). Las fórmulas
 * apuntan a la fila de totales y a la detracción, que dependen de cuántos
 * empleados haya.
 */
function escribirCuadro(rows, { totalRow, detRow, tipoCambio, totales }) {
  const t = (key) => `${L(key)}${totalRow}`;
  const V = colLetter(CUADRO_VALUE_COL);
  const etiqueta = { font: font({ size: 11, italic: true }), border: BORDER, numFmt: FMT_KR };
  const valor = { font: font({ size: 11, italic: true }), border: BORDER, numFmt: FMT_CUADRO, fill: solid(ARGB_CUADRO) };

  const put = (r, c, value, style) => {
    const cell = rows[r].getCell(c);
    cell.value = value;
    if (style.font) cell.font = style.font;
    if (style.fill) cell.fill = style.fill;
    if (style.border) cell.border = style.border;
    if (style.alignment) cell.alignment = style.alignment;
    if (style.numFmt) cell.numFmt = style.numFmt;
  };

  const num = (v) => (Number.isFinite(v) ? v : 0);
  const netPesos = num(totales.netPay);
  const ss = ['socialSecurity', 'healthInsurance', 'law19032', 'ssEmployer', 'hiEmployer', 'accidentInsurance',
    'fixedAccident', 'fixedLife'].reduce((s, k) => s + num(totales[k]), 0) + DETRACCION_ART23;
  const wht = num(totales.incomeTax) + num(totales.incomeTaxExtra);
  const usd = tipoCambio ? netPesos / tipoCambio : 0;

  put(1, CUADRO_SUBLABEL_COL, 'INFORMATION PAYROLL AUTHORISATION FORM', {
    font: font({ size: 12, bold: true }), border: BORDER, numFmt: FMT_KR,
    alignment: { horizontal: 'left', vertical: 'middle' },
  });
  put(2, CUADRO_VALUE_COL, 'Currency (Pesos)', {
    font: font({ size: 11, bold: true }), border: BORDER, numFmt: FMT_KR, alignment: { horizontal: 'center' },
  });
  put(3, CUADRO_LABEL_COL, 'Net Payments - Pesos', etiqueta);
  put(3, CUADRO_VALUE_COL, { formula: `+${t('netPay')}`, result: netPesos }, valor);
  put(4, CUADRO_LABEL_COL, 'Exchange Rate', etiqueta);
  put(4, CUADRO_VALUE_COL, tipoCambio ?? null, valor);
  put(5, CUADRO_LABEL_COL, '(Net Payments - USD)', { ...etiqueta, font: font({ size: 11, bold: true, italic: true }) });
  put(5, CUADRO_VALUE_COL, { formula: `+${V}3/${V}4`, result: usd },
    { ...valor, font: font({ size: 11, bold: true, italic: true }), fill: undefined });
  put(6, CUADRO_LABEL_COL, 'Social Security Payments', etiqueta);
  put(6, CUADRO_VALUE_COL, {
    formula: `+${t('socialSecurity')}+${t('healthInsurance')}+${t('law19032')}+${t('ssEmployer')}+${t('hiEmployer')}`
      + `+${t('accidentInsurance')}+${t('fixedAccident')}+${t('fixedLife')}+${L('law19032')}${detRow}`,
    result: ss,
  }, valor);
  put(7, CUADRO_LABEL_COL, 'Withholding Tax Payments', etiqueta);
  put(7, CUADRO_VALUE_COL, { formula: `+${t('incomeTax')}+${t('incomeTaxExtra')}`, result: wht }, valor);
  put(8, CUADRO_LABEL_COL, 'All Payments to be Arranged by GSMA', {
    ...etiqueta, font: font({ size: 11, bold: true, italic: true }), alignment: { horizontal: 'left' },
  });
  put(9, CUADRO_SUBLABEL_COL, 'Net (USD)', { font: font({ size: 11, bold: true }), border: BORDER, numFmt: FMT_KR });
  put(9, CUADRO_VALUE_COL, { formula: `${V}5`, result: usd },
    { font: font({ size: 11, bold: true, italic: true }), border: BORDER, numFmt: FMT_IMPORTE });
  put(10, CUADRO_SUBLABEL_COL, 'Statutory Payments', { font: font({ size: 11, bold: true }), border: BORDER, numFmt: FMT_KR });
  put(10, CUADRO_VALUE_COL, { formula: `${V}6+${V}7`, result: ss + wht },
    { font: font({ size: 11, bold: true, italic: true }), border: BORDER, numFmt: FMT_IMPORTE });
}

/** Las celdas del cuadro, para el test de conformidad: lo único que se escribe a la derecha de la tabla. */
export const CUADRO_COLUMNS = { label: CUADRO_LABEL_COL, sublabel: CUADRO_SUBLABEL_COL, value: CUADRO_VALUE_COL };
