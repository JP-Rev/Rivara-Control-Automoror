// Lo que la app sabe de los tramites del Registro. Vive aca y el front lo pide
// por /api/catalogo: un solo lugar para los nombres, asi la etiqueta de un
// estado no es una en la bandeja y otra en el historial.

export const TIPOS = [
  { clave: 'TRANSFERENCIA', nombre: 'Transferencia', corto: 'Transferencia' },
  { clave: 'REPOSICION_PLACAS', nombre: 'Reposición de placas', corto: 'Placas', motivo: true, ddjj: 'placas' },
  { clave: 'DUPLICADO_TITULO', nombre: 'Duplicado de título', corto: 'Dup. título', motivo: true, ddjj: 'titulo' },
  { clave: 'DUPLICADO_CEDULA', nombre: 'Duplicado de cédula', corto: 'Dup. cédula', motivo: true, ddjj: 'cedula' },
  { clave: 'DENUNCIA_VENTA', nombre: 'Denuncia de venta', corto: 'Denuncia venta' },
  { clave: 'OTRO', nombre: 'Otro trámite', corto: 'Otro' },
]

// Por que se repone o se duplica. Solo el extravio lleva la DDJJ de la
// Disposicion 235/03; el robo va con denuncia policial.
export const MOTIVOS = [
  { clave: 'EXTRAVIO', nombre: 'Extravío' },
  { clave: 'ROBO', nombre: 'Robo o hurto' },
  { clave: 'DETERIORO', nombre: 'Deterioro' },
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
