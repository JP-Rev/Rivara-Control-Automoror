import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// DDJJ Anexo 08 D (Disp. D.N. 38/2018), con la manifestacion de voluntad de
// pago de la Disp. 142/2024: sellos, patentes e infracciones.
//
// A diferencia de la DDJJ de extravio, aca se escribe ENCIMA del formulario
// original (server/plantillas/anexo-08d.pdf, en blanco): es un PDF de Word
// sin campos, y el Registro lo conoce asi. Las coordenadas salen de ese PDF
// (pdfplumber, puntos, origen arriba a la izquierda); pdf-lib mide desde
// abajo, de ahi el ALTO - y.
//
// Criterio: donde hay dato, se tapa la linea punteada con blanco y se
// escribe; donde no hay, la linea queda para completar a mano.

const aqui = path.dirname(fileURLToPath(import.meta.url))
const PLANTILLA = path.join(aqui, '../plantillas/anexo-08d.pdf')
const ALTO = 841.92
const TINTA = rgb(0.08, 0.08, 0.1)

// [x donde terminan la etiqueta, x donde terminan los puntos, base del texto]
const LINEAS = {
  encabezado: [157.0, 541.8, 109.4],
  registro: [260.5, 543.2, 137.0],
  solicitud: [171.4, 318.0, 265.9],
  dominio: [121.2, 331.2, 293.5],
  marca: [91.2, 332.2, 320.9],
  tipo: [82.3, 335.3, 334.9],
  modelo: [96.7, 333.9, 348.5],
  marcaMotor: [119.3, 336.5, 362.5],
  nroMotor: [102.5, 337.2, 376.1],
  marcaChasis: [118.1, 338.7, 390.1],
  nroChasis: [103.9, 339.1, 403.8],
}
const OBSERVACIONES = { x: 56.7, fin: 542.9, bases: [449.8, 465.9, 481.9, 498.0, 514.3] }
// Centro del "SI" y del "NO" de cada renglon (x) y el centro vertical (y).
const OPCIONES = {
  sellos: { si: 344.5, no: 379.7, y: 588.3 },
  patentes: { si: 344.8, no: 379.7, y: 611.8 },
  infracciones: { si: 344.3, no: 379.5, y: 634.6 },
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']

const seguro = (fuente, t) => {
  const s = String(t ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
  return [...s].map((c) => { try { fuente.encodeText(c); return c } catch { return '?' } }).join('')
}

// Achica la letra hasta que entra en el ancho; un modelo largo no puede
// pisar el margen.
function entra(fuente, texto, ancho, tamano = 11) {
  let t = tamano
  while (t > 7 && fuente.widthOfTextAtSize(texto, t) > ancho) t -= 0.5
  return t
}

function partirEnLineas(fuente, texto, ancho, tamano) {
  const lineas = []
  for (const parrafo of String(texto || '').split(/\n+/)) {
    let actual = ''
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra
      if (fuente.widthOfTextAtSize(prueba, tamano) > ancho && actual) {
        lineas.push(actual)
        actual = palabra
      } else {
        actual = prueba
      }
    }
    if (actual) lineas.push(actual)
  }
  return lineas
}

/**
 * @param {object} d
 *   lugar, fecha (AAAA-MM-DD), registro, solicitud, dominio, marca, tipo,
 *   modelo, marcaMotor, nroMotor, marcaChasis, nroChasis, observaciones,
 *   sellos / patentes / infracciones: 'SI' | 'NO' | ''
 */
export async function generarAnexo08D(d) {
  const pdf = await PDFDocument.load(fs.readFileSync(PLANTILLA))
  pdf.setTitle(`Anexo 08 D ${d.dominio || ''}`.trim())
  pdf.setAuthor('Rivara — Trámites del Registro Automotor')
  const pagina = pdf.getPages()[0]
  const fuente = await pdf.embedFont(StandardFonts.TimesRoman)

  // Los puntos y barras del formulario asoman por arriba de la base: la
  // tapa cubre hasta la altura de una mayuscula.
  const tapar = (x1, x2, base, alto = 16) =>
    pagina.drawRectangle({ x: x1, y: ALTO - base - 3, width: x2 - x1 + 1, height: alto, color: rgb(1, 1, 1) })

  const enLinea = (clave, valor, { derecha = false } = {}) => {
    const t = seguro(fuente, valor)
    if (!t) return
    const [x1, x2, base] = LINEAS[clave]
    tapar(x1, x2, base)
    const tamano = entra(fuente, t, x2 - x1 - 6)
    const ancho = fuente.widthOfTextAtSize(t, tamano)
    pagina.drawText(t, { x: derecha ? x2 - ancho : x1 + 4, y: ALTO - base + 1, size: tamano, font: fuente, color: TINTA })
  }

  // "Alberti, 29 de octubre de 2026", alineado a la derecha como una carta.
  const [a, m, dia] = String(d.fecha || '').split('-').map(Number)
  const fecha = a && m && dia ? `${dia} de ${MESES[m - 1]} de ${a}` : ''
  if (d.lugar || fecha) enLinea('encabezado', [d.lugar, fecha].filter(Boolean).join(', '), { derecha: true })

  enLinea('registro', d.registro)
  enLinea('solicitud', d.solicitud)
  for (const k of ['dominio', 'marca', 'tipo', 'modelo', 'marcaMotor', 'nroMotor', 'marcaChasis', 'nroChasis']) {
    enLinea(k, String(d[k] || '').toUpperCase())
  }

  // Observaciones: hasta cinco renglones; lo que no entra se avisa antes,
  // en la pantalla (ver la ruta).
  const lineas = partirEnLineas(fuente, seguro(fuente, d.observaciones).replace(/ \/\/ /g, '\n'), OBSERVACIONES.fin - OBSERVACIONES.x - 8, 11)
  lineas.slice(0, OBSERVACIONES.bases.length).forEach((l, i) => {
    const base = OBSERVACIONES.bases[i]
    tapar(OBSERVACIONES.x, OBSERVACIONES.fin + 4, base, 15)
    pagina.drawText(l, { x: OBSERVACIONES.x + 2, y: ALTO - base + 2, size: 11, font: fuente, color: TINTA })
  })

  // SI / NO: un circulo alrededor de la opcion elegida, como se marca a mano.
  for (const [clave, pos] of Object.entries(OPCIONES)) {
    const valor = String(d[clave] || '').toUpperCase()
    if (valor !== 'SI' && valor !== 'NO') continue
    pagina.drawEllipse({
      x: valor === 'SI' ? pos.si : pos.no, y: ALTO - pos.y,
      xScale: valor === 'SI' ? 11 : 14, yScale: 8,
      borderColor: TINTA, borderWidth: 1.2,
    })
  }

  return pdf.save()
}

export const RENGLONES_OBSERVACIONES = OBSERVACIONES.bases.length
