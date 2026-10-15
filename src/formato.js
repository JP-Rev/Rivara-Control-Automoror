// Fechas: la base guarda UTC ("2026-10-15 17:46:19" de SQLite o ISO). Se
// muestran en la hora de Argentina.
const ZONA = 'America/Argentina/Buenos_Aires'

export function aFecha(valor) {
  if (!valor) return null
  const s = String(valor)
  // datetime('now') de SQLite viene sin zona: es UTC.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + 'Z' : s
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

const fmtFecha = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtFechaHora = new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

export const fecha = (v) => (aFecha(v) ? fmtFecha.format(aFecha(v)) : '—')
export const fechaHora = (v) => (aFecha(v) ? fmtFechaHora.format(aFecha(v)) : '—')

export function haceCuanto(v) {
  const d = aFecha(v)
  if (!d) return ''
  const seg = Math.round((Date.now() - d.getTime()) / 1000)
  if (seg < 60) return 'recién'
  const min = Math.round(seg / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const dias = Math.round(h / 24)
  if (dias === 1) return 'ayer'
  if (dias < 60) return `hace ${dias} días`
  return `el ${fecha(v)}`
}

export const diasDesde = (v) => {
  const d = aFecha(v)
  return d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : 0
}

export const hoyISO = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  return p // en-CA da AAAA-MM-DD
}

// La planilla escribe la marca como se dice ("VW Amarok", "Corolla XLI"); el
// Registro la quiere como figura en el titulo (VOLKSWAGEN). Es solo una
// sugerencia para la DDJJ: se muestra marcada para que alguien la revise.
const MARCAS = {
  vw: 'VOLKSWAGEN', volkswagen: 'VOLKSWAGEN', toyota: 'TOYOTA', ford: 'FORD', iveco: 'IVECO',
  volvo: 'VOLVO', scania: 'SCANIA', mercedes: 'MERCEDES BENZ', mb: 'MERCEDES BENZ', fiat: 'FIAT',
  chevrolet: 'CHEVROLET', renault: 'RENAULT', peugeot: 'PEUGEOT', nissan: 'NISSAN',
  corolla: 'TOYOTA', hilux: 'TOYOTA', amarok: 'VOLKSWAGEN', saveiro: 'VOLKSWAGEN', ranger: 'FORD',
}

export function marcaYModeloSugeridos(v) {
  if (!v) return { marca: '', modelo: '' }
  const partes = String(v.marca || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return { marca: '', modelo: String(v.modelo || '').toUpperCase() }
  const primera = partes[0].toLowerCase()
  const marca = MARCAS[primera] || partes[0].toUpperCase()
  // Si la primera palabra ya era el modelo (Corolla), va entera al modelo.
  const resto = ['corolla', 'hilux', 'amarok', 'saveiro', 'ranger'].includes(primera) ? partes : partes.slice(1)
  const modelo = [...resto, v.modelo && v.modelo !== v.marca ? v.modelo : ''].join(' ').replace(/\s+/g, ' ').trim().toUpperCase()
  return { marca, modelo }
}

export const TIPOS_REGISTRALES = [
  'PICK UP', 'PICK-UP CABINA DOBLE', 'SEDAN 4 PUERTAS', 'RURAL 5 PUERTAS', 'UTILITARIO',
  'CAMION', 'TRACTOR DE CARRETERA', 'CHASIS CON CABINA', 'SEMIRREMOLQUE', 'ACOPLADO',
]

export const USOS = ['PRIVADO', 'PÚBLICO', 'OFICIAL']
