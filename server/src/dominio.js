// Dominios argentinos. Se guardan siempre normalizados: mayusculas y sin
// espacios, guiones ni puntos. "ae 622-bg" y "AE622BG" son el mismo vehiculo,
// y si no se normaliza al guardar, el cruce entre tramites y flota falla en
// silencio.

const FORMATOS = [
  /^[A-Z]{2}\d{3}[A-Z]{2}$/, // Mercosur auto: AE622BG
  /^[A-Z]{3}\d{3}$/,         // anterior a 2016: EPZ702
  /^[A-Z]\d{3}[A-Z]{3}$/,    // Mercosur moto: A123BCD
  /^\d{3}[A-Z]{3}$/,         // moto anterior: 123ABC
]

export const normalizarDominio = (texto) =>
  String(texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export const dominioValido = (dominio) => FORMATOS.some((re) => re.test(dominio))

// Una celda de planilla puede traer mas de un dominio ("AD032EK-AD032EJ"
// cuando la unidad lleva dos acoplados). Devuelve los validos y lo que no se
// pudo interpretar, para avisarlo en vez de descartarlo callado.
export function extraerDominios(celda) {
  const crudo = String(celda ?? '').trim()
  if (!crudo) return { dominios: [], invalidos: [] }

  const entero = normalizarDominio(crudo)
  if (dominioValido(entero)) return { dominios: [entero], invalidos: [] }

  const partes = crudo.split(/[\s\-/,;|+]+|\by\b/i).map(normalizarDominio).filter(Boolean)
  const dominios = partes.filter(dominioValido)
  // Si partido tampoco da nada, se informa la celda entera: es lo que la
  // persona va a buscar en la planilla.
  const invalidos = dominios.length ? partes.filter((p) => !dominioValido(p)) : [crudo]
  return { dominios, invalidos }
}
