// Lo que la app sabe de los tramites del Registro. Vive aca y el front lo pide
// por /api/catalogo: un solo lugar para los nombres, asi la etiqueta de un
// estado no es una en la bandeja y otra en el historial.

// detalle y palabras alimentan el buscador del alta: la gente no dice
// "reposicion de placas", dice "se le cayo la chapa".
export const TIPOS = [
  {
    clave: 'TRANSFERENCIA', nombre: 'Transferencia', corto: 'Transferencia', comprador: true,
    detalle: 'Cambio de titular por compra o venta',
    palabras: ['08', 'formulario 08', 'cambio de titular', 'titularidad', 'compra', 'venta', 'vender', 'comprador'],
  },
  {
    clave: 'REPOSICION_PLACAS', nombre: 'Reposición de placas', corto: 'Placas', motivo: true, ddjj: 'placas',
    detalle: 'Placas perdidas, robadas o rotas',
    palabras: ['patente', 'patentes', 'chapa', 'chapas', 'placa', 'se cayo', 'perdida'],
  },
  {
    clave: 'DUPLICADO_TITULO', nombre: 'Duplicado de título', corto: 'Dup. título', motivo: true, ddjj: 'titulo',
    detalle: 'Nuevo título del automotor',
    palabras: ['titulo', 'titulo automotor', 'segundo titulo'],
  },
  {
    clave: 'DUPLICADO_CEDULA', nombre: 'Duplicado de cédula', corto: 'Dup. cédula', motivo: true, ddjj: 'cedula',
    detalle: 'Cédula verde o azul',
    palabras: ['cedula', 'verde', 'azul', 'tarjeta', 'autorizado', 'autorizado a conducir', 'cedula azul', 'cedula verde'],
  },
  {
    clave: 'DENUNCIA_VENTA', nombre: 'Denuncia de venta', corto: 'Denuncia venta', comprador: true,
    detalle: 'Se vendió y el comprador no transfirió',
    palabras: ['denuncia', 'vendido', 'vendida', 'venta', 'no transfirio', 'responsabilidad'],
  },
  {
    clave: 'OTRO', nombre: 'Otro trámite', corto: 'Otro',
    detalle: 'Contalo en observaciones',
    palabras: ['informe', 'dominio', 'baja', 'alta', 'prenda', 'cambio de radicacion', 'radicacion', 'verificacion'],
  },
]

// Por que se repone o se duplica. Solo el extravio lleva la DDJJ de la
// Disposicion 235/03; el robo va con denuncia policial.
export const MOTIVOS = [
  { clave: 'EXTRAVIO', nombre: 'Extravío', detalle: 'Lleva la DDJJ de la Disposición 235/03', palabras: ['perdida', 'perdio', 'perdi', 'extraviado'] },
  { clave: 'ROBO', nombre: 'Robo o hurto', detalle: 'Va con la denuncia policial', palabras: ['robaron', 'hurto', 'denuncia policial'] },
  { clave: 'DETERIORO', nombre: 'Deterioro', detalle: 'Rotas, ilegibles o dañadas', palabras: ['rota', 'roto', 'dañada', 'ilegible', 'gastada'] },
]

// SOLICITADO es el estado de entrada: lo cargo alguien y todavia no se
// presento. Mientras nadie lo toma se muestra como "Sin tomar"; tomado, como
// "En preparación".
export const ESTADOS = [
  { clave: 'SOLICITADO', nombre: 'Solicitado' },
  { clave: 'PRESENTADO', nombre: 'Presentado' },
  { clave: 'EN_ESPERA', nombre: 'En espera' },
  { clave: 'TERMINADO', nombre: 'Terminado' },
]

export const CATEGORIAS = [
  { clave: 'CAMIONETA', nombre: 'Camioneta' },
  { clave: 'CAMION', nombre: 'Camión' },
  { clave: 'ACOPLADO', nombre: 'Acoplado' },
  { clave: 'OTRO', nombre: 'Otro' },
]

// Los datos registrales que la planilla no trae y hay que cargar a mano. Un
// vehiculo sin alguno de estos aparece como "faltan datos".
export const CAMPOS_REGISTRALES = [
  { clave: 'marca_chasis', nombre: 'Marca de chasis' },
  { clave: 'nro_chasis', nombre: 'Nº de chasis' },
  { clave: 'marca_motor', nombre: 'Marca de motor' },
  { clave: 'nro_motor', nombre: 'Nº de motor' },
  { clave: 'uso', nombre: 'Uso' },
]

export const claves = (lista) => lista.map((x) => x.clave)
export const tipoDe = (clave) => TIPOS.find((t) => t.clave === clave)

// Listas de los datos del vehiculo. Son sugerencias: el selector acepta un
// valor nuevo, y una vez guardado aparece en la lista para todos (el endpoint
// del catalogo suma los valores que ya hay en la flota).
export const MARCAS = [
  'VOLKSWAGEN', 'FORD', 'IVECO', 'TOYOTA', 'VOLVO', 'SCANIA', 'MERCEDES BENZ',
  'FIAT', 'CHEVROLET', 'RENAULT', 'PEUGEOT', 'NISSAN',
]
// Los motores llevan a veces otra marca que el chasis (un Iveco con motor FPT).
export const MARCAS_MOTOR = [...MARCAS, 'FPT', 'CUMMINS', 'MWM', 'DEUTZ']

export const USOS = ['PRIVADO', 'PRIV. TRANSP. DE CARGA INTERJ.', 'PÚBLICO', 'OFICIAL']

export const TIPOS_REGISTRALES = [
  'PICK UP', 'PICK-UP CABINA DOBLE', 'SEDAN 4 PUERTAS', 'RURAL 5 PUERTAS', 'UTILITARIO',
  'CAMION', 'TRACTOR DE CARRETERA', 'CHASIS CON CABINA', 'SEMIRREMOLQUE', 'ACOPLADO',
]
