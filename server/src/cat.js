import { normalizarDominio } from './dominio.js'

// Constancia de Asignacion de Titulo (CAT): el PDF que manda el Registro
// cuando queda inscripto un tramite que emite titulo (una transferencia, un
// duplicado). Trae los tres datos con los que se baja el Titulo Digital en
// el sitio del DNRPA (Descarga de documentacion), mas el dominio y el numero
// del titulo nuevo:
//
//   ...otorgamiento del elemento Nro. de control 012345678 perteneciente al Dominio AB123CD
//   Registro Seccional:   01292
//   Nro.Trámite:          12345
//   Nro.Control Web:      ABCDEF1234
//
// El Nro. de Control Web da acceso al titulo: es un dato confidencial.

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

export function interpretarCat(textoCrudo) {
  const t = sinTildes(String(textoCrudo || '')).replace(/\r/g, '')
  const de = (re) => (t.match(re) || [])[1] || ''
  const datos = {
    registro: de(/Registro\s+Seccional\s*:\s*(\d{3,6})/i),
    tramite: de(/Nro\.?\s*Tramite\s*:\s*(\d+)/i),
    control: de(/Nro\.?\s*Control\s*Web\s*:\s*([A-Z0-9]+)/i).toUpperCase(),
    dominio: normalizarDominio(de(/perteneciente\s+al\s+Dominio\s+([A-Z0-9]{6,7})/i)),
    nroTitulo: de(/elemento\s+Nro\.?\s*de\s+control\s+(\d+)/i),
    fecha: (() => {
      const f = de(/Lugar\s+y\s+Fecha\s*:\s*[^,\n]*,\s*(\d{2}\/\d{2}\/\d{4})/i)
      return f ? f.split('/').reverse().join('-') : ''
    })(),
  }
  const esCat = /CONSTANCIA\s+DE\s+ASIGNACION\s+DE\s+TITULO/i.test(t)
  return { esCat, ...datos }
}

// Lo que se guarda o se manda al DNRPA: solo digitos y letras, sin espacios.
export function limpiarDatosCat(d = {}) {
  return {
    registro: String(d.registro || '').replace(/\D/g, '').slice(0, 6),
    tramite: String(d.tramite || '').replace(/\D/g, '').slice(0, 12),
    control: String(d.control || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 20),
  }
}

export const datosCatCompletos = (d) => Boolean(d?.registro && d?.tramite && d?.control)
