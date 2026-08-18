/**
 * Canonical Schema - Payroll AR
 * Diccionario de nombres canónicos + sinónimos habituales en sistemas argentinos.
 * Extensible por el usuario - agregar sinónimos según los archivos que aparezcan.
 */

const CANONICAL_SCHEMA = {
  legajo: {
    label: 'Legajo',
    required: true,
    type: 'string',
    synonyms: [
      'legajo', 'leg', 'leg.', 'nro legajo', 'n° legajo', 'nro. legajo',
      'numero de legajo', 'numero legajo', 'cod empleado', 'codigo empleado',
      'cod. empleado', 'id', 'id empleado', 'employee id', 'empid',
      'file number', 'nro', 'nro empleado', 'numero empleado'
    ]
  },
  cuil: {
    label: 'CUIL',
    required: false,
    type: 'cuil',
    synonyms: [
      'cuil', 'c.u.i.l.', 'cuil/t', 'cuil empleado', 'nro cuil',
      'numero cuil', 'cuil beneficiario', 'tax id'
    ]
  },
  cuit: {
    label: 'CUIT',
    type: 'cuit',
    synonyms: ['cuit', 'c.u.i.t.', 'nro cuit', 'numero cuit']
  },
  dni: {
    label: 'DNI',
    type: 'dni',
    synonyms: [
      'dni', 'd.n.i.', 'documento', 'nro documento', 'nro doc',
      'doc', 'ident', 'identificacion', 'numero documento', 'n° documento'
    ]
  },
  apellidoNombre: {
    label: 'Apellido y Nombre',
    type: 'name',
    synonyms: [
      'apellido y nombre', 'nombre y apellido', 'apellido, nombre',
      'nombre completo', 'full name', 'empleado', 'trabajador',
      'beneficiario', 'nombre', 'apellido nombre'
    ]
  },
  apellido: {
    label: 'Apellido',
    type: 'name',
    synonyms: ['apellido', 'apellidos', 'surname', 'last name']
  },
  nombre: {
    label: 'Nombre',
    type: 'name',
    synonyms: ['nombre', 'nombres', 'first name', 'given name']
  },
  codigoConcepto: {
    label: 'Código de Concepto',
    type: 'code',
    synonyms: [
      'codigo concepto', 'cod concepto', 'cod. concepto', 'nro concepto',
      'concepto', 'item', 'rubro', 'cod haber', 'codigo haber',
      'cod descuento', 'codigo'
    ]
  },
  nombreConcepto: {
    label: 'Nombre de Concepto',
    type: 'string',
    synonyms: [
      'nombre concepto', 'descripcion concepto', 'desc concepto',
      'descripcion', 'concepto descripcion', 'haber', 'descuento',
      'detalle', 'descripcion haber'
    ]
  },
  centroCosto: {
    label: 'Centro de Costo',
    type: 'code',
    synonyms: [
      'centro de costo', 'centro costo', 'cc', 'c.c.', 'ccosto',
      'cost center', 'ceco', 'depto', 'departamento', 'sector',
      'area', 'division', 'unidad'
    ]
  },
  fechaIngreso: {
    label: 'Fecha de Ingreso',
    type: 'date',
    synonyms: [
      'fecha de ingreso', 'fecha ingreso', 'f. ingreso', 'f ingreso',
      'alta', 'fecha alta', 'hire date', 'admision', 'ingreso'
    ]
  },
  fechaEgreso: {
    label: 'Fecha de Egreso',
    type: 'date',
    synonyms: [
      'fecha egreso', 'f. egreso', 'baja', 'fecha baja',
      'termination date', 'end date', 'egreso'
    ]
  },
  importe: {
    label: 'Importe',
    type: 'amount',
    synonyms: [
      'importe', 'monto', 'valor', 'amount', 'total', 'subtotal',
      '$', 'pesos', 'ars'
    ]
  },
  sueldoBasico: {
    label: 'Sueldo Básico',
    type: 'amount',
    synonyms: [
      'sueldo basico', 'basico', 'salario basico', 'base',
      'haber basico', 'base salary', 'sueldo base'
    ]
  },
  sueldoNeto: {
    label: 'Sueldo Neto',
    type: 'amount',
    synonyms: [
      'neto', 'sueldo neto', 'neto a cobrar', 'neto transferencia',
      'importe neto', 'total neto'
    ]
  },
  cbu: {
    label: 'CBU',
    type: 'cbu',
    synonyms: ['cbu', 'cuenta cbu', 'cbu destino', 'nro cbu']
  },
  periodo: {
    label: 'Período',
    type: 'period',
    synonyms: [
      'periodo', 'período', 'mes', 'liquidacion', 'mes liquidacion',
      'mes/año', 'ejercicio'
    ]
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CANONICAL_SCHEMA };
}
