import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// DDJJ de extravio (Disposicion D.N. N° 235/03): titulo, placas y cedulas.
//
// Se dibuja desde cero en lugar de rellenar el PDF original: el que se usaba
// en la oficina es un formulario de CorelDRAW ya aplanado, sin campos, con los
// datos de la ultima camioneta "impresos" en el contenido. Las coordenadas
// salen de ese original (A4, puntos PDF, origen abajo a la izquierda), asi que
// la hoja impresa queda igual a la que el Registro ya conoce.
//
// Helvetica es la estandar de PDF: no hay que embeber fuentes, y su
// codificacion (WinAnsi) tiene la Í, la ñ y el º.

const TINTA = rgb(0.216, 0.204, 0.208)
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const IZQ = 84
const DER = 511

export const DOCUMENTOS_DDJJ = [
  { clave: 'cedula', etiqueta: 'Cédula/s del Automotor control Nº:' },
  { clave: 'cedulaAutorizado', etiqueta: 'Cédula/s Autorizado a Conducir Nº:' },
  { clave: 'titulo', etiqueta: 'Título del Automotor control Nº:' },
  { clave: 'placas', etiqueta: 'Placas de Identificación Automotor Nº:' },
]

// "2026-10-02" -> "02 Octubre de 2026", como el original.
export function fechaLarga(iso) {
  const [a, m, d] = String(iso || '').split('-').map(Number)
  const f = a && m && d ? { a, m, d } : (() => {
    const hoy = new Date()
    return { a: hoy.getFullYear(), m: hoy.getMonth() + 1, d: hoy.getDate() }
  })()
  return `${String(f.d).padStart(2, '0')} ${MESES[f.m - 1]} de ${f.a}`
}

// pdf-lib tira si un caracter no existe en WinAnsi (un emoji, comillas
// tipograficas raras). Mejor reemplazarlo que perder el PDF entero.
const seguro = (fuente, texto) => {
  const t = String(texto ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
  try {
    fuente.encodeText(t)
    return t
  } catch {
    return [...t].map((c) => { try { fuente.encodeText(c); return c } catch { return '?' } }).join('')
  }
}

function justificado(pagina, texto, { x, y, ancho, fuente, tamano, interlineado }) {
  const palabras = seguro(fuente, texto).split(' ')
  const lineas = []
  let actual = []
  for (const p of palabras) {
    const prueba = [...actual, p].join(' ')
    if (actual.length && fuente.widthOfTextAtSize(prueba, tamano) > ancho) {
      lineas.push(actual)
      actual = [p]
    } else {
      actual.push(p)
    }
  }
  if (actual.length) lineas.push(actual)

  lineas.forEach((ls, i) => {
    const yy = y - i * interlineado
    const ultima = i === lineas.length - 1
    if (ultima || ls.length === 1) {
      pagina.drawText(ls.join(' '), { x, y: yy, size: tamano, font: fuente, color: TINTA })
      return
    }
    const anchoPalabras = ls.reduce((s, p) => s + fuente.widthOfTextAtSize(p, tamano), 0)
    const hueco = (ancho - anchoPalabras) / (ls.length - 1)
    let xx = x
    for (const p of ls) {
      pagina.drawText(p, { x: xx, y: yy, size: tamano, font: fuente, color: TINTA })
      xx += fuente.widthOfTextAtSize(p, tamano) + hueco
    }
  })
}

/**
 * @param {object} d
 * @param {string} d.lugar              "Buenos Aires"
 * @param {string} d.fecha              AAAA-MM-DD
 * @param {string} d.seccional          "01292"
 * @param {object} d.documentos         { cedula, cedulaAutorizado, titulo, placas } -> numero o ''
 * @param {string} d.dominio, d.marca, d.tipo, d.modelo, d.motor
 * @param {string} [d.declaranteNombre], [d.declaranteDocumento]
 * @returns {Promise<Uint8Array>}
 */
export async function generarDDJJ(d) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`DDJJ extravío ${d.dominio || ''}`.trim())
  pdf.setAuthor('Rivara — Trámites del Registro Automotor')
  pdf.setCreator('Rivara Intranet')
  const pagina = pdf.addPage([595.276, 841.89])
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold)

  const texto = (t, x, y, { tamano = 10, fuente = normal } = {}) =>
    pagina.drawText(seguro(fuente, t), { x, y, size: tamano, font: fuente, color: TINTA })
  const centrado = (t, cx, y, opciones = {}) => {
    const fuente = opciones.fuente || normal
    const tamano = opciones.tamano || 10
    const s = seguro(fuente, t)
    texto(s, cx - fuente.widthOfTextAtSize(s, tamano) / 2, y, opciones)
  }
  const linea = (x1, y1, x2, y2, grosor = 0.6) =>
    pagina.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: grosor, color: TINTA })

  // ---- Encabezado ----
  linea(33.9, 812.6, 556.2, 812.6, 2)
  centrado('DDJJ EXTRAVÍO', 297.6, 770.7, { tamano: 25, fuente: negrita })
  centrado('TITULO - PLACAS - CEDULAS', 297.6, 747.3, { tamano: 20, fuente: negrita })
  centrado('de IDENTIFICACION y de AUTORIZADO a CONDUCIR', 297.6, 726.7, { tamano: 18, fuente: negrita })
  linea(33.9, 704.6, 556.2, 704.6, 2)

  // ---- Lugar y fecha, destinatario ----
  const lugarFecha = `${d.lugar || 'Buenos Aires'}, ${fechaLarga(d.fecha)}`
  texto(lugarFecha, DER - 40 - normal.widthOfTextAtSize(seguro(normal, lugarFecha), 10), 668)
  texto('Al Registro Automotor', IZQ, 627)
  texto(`Secc:${d.seccional || ''}`, IZQ, 616)

  justificado(pagina,
    'Por intermedio de la presente y en virtud de lo establecido en la DISPOSICIÓN D.N. Nº 235 de fecha 02/05/03 de la Dirección Nacional del Registro de la Propiedad del Automotor y Créditos Prendarios, DECLARO el extravío de la siguiente documentación registral:',
    { x: IZQ, y: 574, ancho: DER - IZQ - 2, fuente: normal, tamano: 10, interlineado: 17.5 })

  // ---- Recuadro 1: que se extravio ----
  pagina.drawRectangle({ x: IZQ, y: 376, width: DER - IZQ, height: 131, borderColor: TINTA, borderWidth: 0.8 })
  const docs = d.documentos || {}
  DOCUMENTOS_DDJJ.forEach(({ clave, etiqueta }, i) => {
    const y = 486.5 - i * 22.3
    texto(etiqueta, 99, y)
    const xValor = 99 + normal.widthOfTextAtSize(seguro(normal, etiqueta), 10) + 4
    const valor = String(docs[clave] ?? '').trim()
    // Sin numero va la linea para completar a mano, como en el original.
    if (valor) texto(valor, xValor, y)
    else linea(xValor, y - 1.5, 496, y - 1.5)
  })

  // ---- Recuadro 2: datos del automotor ----
  pagina.drawRectangle({ x: IZQ, y: 187, width: DER - IZQ, height: 189, borderColor: TINTA, borderWidth: 0.8 })
  texto('DATOS DEL AUTOMOTOR:', 99, 333, { fuente: negrita })
  const datos = [
    ['Dominio', d.dominio], ['Marca:', d.marca], ['Tipo:', d.tipo], ['Modelo:', d.modelo], ['Motor Nº:', d.motor],
  ]
  datos.forEach(([etiqueta, valor], i) => {
    const y = 311 - i * 22.2
    texto(etiqueta, 99, y)
    const xValor = 99 + normal.widthOfTextAtSize(etiqueta, 10) + 4
    if (String(valor ?? '').trim()) texto(String(valor).toUpperCase(), xValor, y)
    else linea(xValor, y - 1.5, 496, y - 1.5)
  })

  // ---- Firmas ----
  const firmas = [
    { cx: 177, ancho: 95, etiqueta: 'Apellido y Nombre', valor: d.declaranteNombre },
    { cx: 308, ancho: 74, etiqueta: 'Documento', valor: d.declaranteDocumento },
    { cx: 430, ancho: 80, etiqueta: 'Firma' },
  ]
  for (const f of firmas) {
    if (f.valor) centrado(f.valor, f.cx, 172, { tamano: 9 })
    linea(f.cx - f.ancho / 2, 168, f.cx + f.ancho / 2, 168, 0.5)
    centrado(f.etiqueta, f.cx, 158, { tamano: 9 })
  }
  linea(297 - 55, 84, 297 + 55, 84, 0.5)
  centrado('Sello y firma del Encargado', 297, 75, { tamano: 9 })

  return pdf.save()
}
