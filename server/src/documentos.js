import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dominioValido } from './dominio.js'

// Lectura de cedulas y titulos del automotor para completar la flota.
//
//   · PDF con texto (el titulo digital que entrega el Registro): pdftotext,
//     exacto, sin OCR.
//   · Foto, o PDF escaneado sin texto: se mejora la imagen con ImageMagick y
//     se lee con Tesseract en castellano. Todo local: nada sale a internet, y
//     son documentos con datos personales del titular.
//
// El resultado SIEMPRE pasa por una pantalla de revision antes de guardarse:
// el OCR de una foto se equivoca, y un chasis mal leido en un formulario del
// Registro es peor que un chasis vacio.

const TIMEOUT_MS = 60_000

function correr(cmd, args, opciones = {}) {
  return new Promise((resolve, reject) => {
    const hijo = execFile(cmd, args, { timeout: TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024, encoding: opciones.encoding || 'utf8' },
      (err, stdout, stderr) => {
        if (err) {
          if (err.code === 'ENOENT') return reject(new Error(`Falta ${cmd} en el contenedor.`))
          return reject(new Error(`${cmd} falló: ${String(stderr || err.message).split('\n')[0]}`))
        }
        resolve(stdout)
      })
    if (opciones.entrada) { hijo.stdin.end(opciones.entrada) }
  })
}

const esPDF = (buffer) => buffer.subarray(0, 5).toString('latin1') === '%PDF-'

async function ocr(rutaImagen, dir, { recorte = '', escala = '200%' } = {}) {
  // Escala de grises, mas tamaño y contraste: con las fotos de una cedula
  // gastada es lo que mas mejora la lectura. -auto-orient respeta la rotacion
  // que guarda el celular en el EXIF.
  const preparada = path.join(dir, `ocr-${recorte ? 'r' : 'e'}.png`)
  await correr('convert', [rutaImagen + '[0]', '-auto-orient', ...(recorte ? ['-crop', recorte, '+repage'] : []),
    '-colorspace', 'Gray', '-resize', escala, '-normalize', '-sharpen', '0x1', preparada])
  // psm 6: un bloque de texto uniforme. Es el que mejor respeta las lineas
  // "ETIQUETA: valor" de los dos documentos.
  return correr('tesseract', [preparada, 'stdout', '-l', 'spa', '--psm', '6'])
}

// La tarjeta en la foto: zona clara sobre el fondo (la mesa, la funda). Se
// difumina, se umbraliza y se toma el recuadro de lo que quedo claro. Con
// el fondo recortado y la tarjeta mas grande, Tesseract lee la letra chica
// (el domicilio del DNI) que en la foto entera se pierde. Si el recuadro no
// tiene sentido (casi toda la foto, o casi nada), no se recorta.
async function recuadroTarjeta(rutaImagen) {
  try {
    const salida = await correr('convert', [rutaImagen + '[0]', '-auto-orient', '-colorspace', 'Gray', '-blur', '0x8',
      '-threshold', '55%', '-format', '%@ %w %h', 'info:'])
    const m = salida.trim().match(/^(\d+)x(\d+)\+(\d+)\+(\d+) (\d+) (\d+)$/)
    if (!m) return ''
    const [, w, h, , , W, H] = m.map(Number)
    const fraccion = (w * h) / (W * H)
    return fraccion > 0.08 && fraccion < 0.9 ? `${w}x${h}+${m[3]}+${m[4]}` : ''
  } catch {
    return ''
  }
}

/**
 * Para documentos de tarjeta (el DNI): devuelve las lecturas de la foto
 * entera y de la tarjeta recortada; quien interpreta se queda con la mejor.
 * Un PDF con texto devuelve ese texto.
 */
export async function extraerTextosTarjeta(buffer) {
  if (esPDF(buffer)) {
    const { texto, metodo } = await extraerTexto(buffer)
    return { textos: [texto], metodo }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-'))
  try {
    const archivo = path.join(dir, 'foto')
    fs.writeFileSync(archivo, buffer)
    const textos = [await ocr(archivo, dir)]
    const recorte = await recuadroTarjeta(archivo)
    if (recorte) textos.push(await ocr(archivo, dir, { recorte, escala: '300%' }))
    return { textos, metodo: 'ocr' }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** Devuelve { texto, metodo: 'pdf' | 'ocr' } */
export async function extraerTexto(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-'))
  try {
    if (esPDF(buffer)) {
      const archivo = path.join(dir, 'doc.pdf')
      fs.writeFileSync(archivo, buffer)
      const texto = await correr('pdftotext', ['-layout', '-l', '2', archivo, '-'])
      // Con texto de verdad, listo. Si casi no hay (un escaneo), a OCR.
      if (texto.replace(/\s/g, '').length > 80) return { texto, metodo: 'pdf' }
      await correr('pdftoppm', ['-r', '300', '-png', '-f', '1', '-l', '1', archivo, path.join(dir, 'pagina')])
      const pagina = fs.readdirSync(dir).find((f) => f.startsWith('pagina') && f.endsWith('.png'))
      if (!pagina) throw new Error('No se pudo convertir el PDF a imagen.')
      return { texto: await ocr(path.join(dir, pagina), dir), metodo: 'ocr' }
    }
    const archivo = path.join(dir, 'foto')
    fs.writeFileSync(archivo, buffer)
    return { texto: await ocr(archivo, dir), metodo: 'ocr' }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/* ------------------------------ interpretacion ------------------------------ */

const sinTildes = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const vacio = (v) => !v || /^[-–—.\s]*$/.test(v)

// El OCR confunde letras y numeros que se parecen. En un dominio la posicion
// dice cual va: AA999AA (o AAA999).
const A_LETRA = { 0: 'O', 1: 'I', 2: 'Z', 5: 'S', 6: 'G', 8: 'B' }
const A_NUMERO = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8', T: '7' }

export function corregirDominio(crudo) {
  const t = String(crudo || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (dominioValido(t)) return t
  const forzar = (s, patron) => [...s].map((c, i) => (patron[i] === 'L' ? A_LETRA[c] || c : A_NUMERO[c] || c)).join('')
  if (t.length === 7) { const d = forzar(t, 'LLNNNLL'); if (dominioValido(d)) return d }
  if (t.length === 6) { const d = forzar(t, 'LLLNNN'); if (dominioValido(d)) return d }
  return ''
}

// Un VIN no lleva I, O ni Q: si aparecen, son 1 y 0 mal leidos.
const corregirChasis = (v) => {
  const t = v.toUpperCase().replace(/\s+/g, '')
  return t.length === 17 ? t.replace(/[IO Q]/g, (c) => (c === 'I' ? '1' : '0')) : t
}

// Los codigos que el Registro antepone: "04-SEMIRREMOLQUE...", "31-SEMIRREMOLQUE",
// "EX-EL FIERRO".
// Son numeros ("04-", "277-") o dos letras ("EX-"): "PICK-UP" no es un codigo.
const sinCodigo = (v) => v.replace(/^\s*(\d{1,4}|[A-Z]{2})-(?=[A-Z])/, '').trim()

// El tipo registral dice que clase de vehiculo es; la app lo agrupa en
// Camioneta / Camion / Acoplado. Lo que no encaja queda sin categoria y se
// elige a mano en la revision.
export function categoriaDeTipo(tipo) {
  const t = sinTildes(String(tipo || '')).toUpperCase()
  if (!t) return ''
  if (/REMOLQUE|ACOPLADO|CARRETON|TOLVA|BATEA/.test(t)) return 'ACOPLADO'
  if (/TRACTOR|CAMION|CHASIS/.test(t)) return 'CAMION'
  if (/PICK|UTILITARIO|RURAL|SEDAN|FURGON|TODO\s*TERRENO|SUV/.test(t)) return 'CAMIONETA'
  return ''
}

// Al vocabulario de la app. El Registro escribe el uso de varias formas.
function normalizarUso(v) {
  const t = sinTildes(v).toUpperCase()
  if (/CARGA/.test(t) && /INTERJ/.test(t)) return 'PRIV. TRANSP. DE CARGA INTERJ.'
  if (/^PRIV/.test(t) && !/TRAN/.test(t)) return 'PRIVADO'
  if (/^PUBL/.test(t)) return 'PÚBLICO'
  if (/^OFIC/.test(t)) return 'OFICIAL'
  return v.toUpperCase().replace(/\s+/g, ' ').trim()
}

// Todas las etiquetas que aparecen en los dos documentos. Sirven para cortar
// un valor donde empieza el campo siguiente: en una foto, el OCR deja las
// columnas separadas por un solo espacio ("EL FIERRO Nro. Chasis: 8E9...").
const ETIQUETAS = [
  /MCA\.?\s*MOTOR/, /NRO\.?\s*MOTOR/, /MCA\.?\s*CHASIS/, /NRO\.?\s*CHASIS/, /FABRICACION\s*ANO/,
  /MODELO\s*ANO/, /FECHA\s*DE\s*ADQUISICION/, /CARROCERIA/, /CONDICION/, /USO/, /CANTIDAD\s*DE\s*PLACAS/,
  /PESO/, /CARGA/, /FECHA\s*DE\s*EMISION/, /FECHA\s*DE\s*VENCIMIENTO/, /NRO\.?\s*IGJ/, /CUIT/, /CUIL/,
  /PORCENTAJE\s*DE\s*TITULAR/, /VENCE/, /TIPO\s*DOC/, /NRO\.?\s*DOC/, /EMANCIPACION/, /FECHA\s*INSC/,
  /MARCA/, /MODELO/, /TIPO/, /CHASIS/, /MOTOR/, /DOMINIO/, /TITULAR/, /PROCEDENCIA/, /FABRICA/,
]
// Etiqueta = palabra completa seguida de ":" (o "." / ";", que el OCR
// confunde). Sin eso no cuenta: "carga" dentro del uso no corta el valor.
const CORTES = ETIQUETAS.map((re) => new RegExp(`(?<![A-Z])${re.source}\\s*[:;.]`))

/**
 * Busca "ETIQUETA: valor" y devuelve el valor, cortado en la etiqueta
 * siguiente, en dos espacios seguidos (la columna siguiente del PDF) o en el
 * fin de linea. Tolera basura antes de la etiqueta: el OCR de una foto agrega
 * letras sueltas del borde ("O MARCA: TOYOTA").
 * @param {string[]} lineas  ya en mayusculas y sin tildes
 * @param {RegExp} etiqueta
 */
function campo(lineas, etiqueta) {
  const re = new RegExp(`(?<![A-Z])${etiqueta.source}\\s*[:;.]\\s*:?`)
  for (const l of lineas) {
    const m = l.match(re)
    if (!m) continue
    const resto = l.slice(m.index + m[0].length)
    let fin = resto.search(/\s{2,}/)
    if (fin < 0) fin = resto.length
    for (const corte of CORTES) {
      const c = resto.match(corte)
      if (c && c.index > 0 && c.index < fin) fin = c.index
    }
    const valor = resto.slice(0, fin).trim()
    if (!vacio(valor)) return valor
  }
  return ''
}

/**
 * Interpreta el texto de un titulo o una cedula.
 * @returns {{ documento: 'TITULO'|'CEDULA'|'DESCONOCIDO', dominio: string, campos: object, avisos: string[] }}
 */
export function interpretar(textoCrudo) {
  const texto = sinTildes(String(textoCrudo || '')).toUpperCase().replace(/\r/g, '')
  const lineas = texto.split('\n').map((l) => l.replace(/\t/g, '  ').trimEnd()).filter((l) => l.trim())
  const avisos = []

  const documento = /TITULO DEL AUTOMOTOR|NUMERO DE TITULO|DECRETO LEY 6582/.test(texto)
    ? 'TITULO'
    : /CEDULA DE IDENTIFICACION|DNRPA|CONTROLE SU CEDULA/.test(texto) ? 'CEDULA' : 'DESCONOCIDO'

  // Dominio: "DOMINIO: AD376JT" (cedula) o "...numero de dominio\nAE550ZL el
  // Automotor" (titulo). Se mira el texto entero porque puede cortar linea.
  let dominio = ''
  const mDominio = texto.match(/DOMINIO\s*[:;.]?\s*([A-Z0-9]{2,3}\s?[A-Z0-9]{3}\s?[A-Z0-9]{0,2})\b/)
  if (mDominio) dominio = corregirDominio(mDominio[1])
  if (!dominio) {
    // Plan B: el primer token con forma de dominio en todo el documento.
    for (const m of texto.matchAll(/\b([A-Z0-9]{6,7})\b/g)) {
      const d = corregirDominio(m[1])
      if (d && /[A-Z]/.test(m[1]) && /\d/.test(m[1])) { dominio = d; break }
    }
  }
  if (!dominio) avisos.push('No se encontró el dominio en el documento.')

  const marcaChasis = campo(lineas, /MCA\.?\s*CHASIS/) || sinCodigo(campo(lineas, /MARCA/))
  const modelo = sinCodigo(campo(lineas, /MODELO(?!\s*ANO)/))
  const tipo = sinCodigo(campo(lineas, /TIPO(?!\s*DOC)/))
  const marcaMotor = campo(lineas, /MCA\.?\s*MOTOR/)
  const nroMotor = campo(lineas, /NRO\.?\s*MOTOR/) || campo(lineas, /MOTOR(?!\s*:?\s*-)/)
  const nroChasis = campo(lineas, /NRO\.?\s*CHASIS/) || campo(lineas, /CHASIS/)
  const uso = campo(lineas, /USO/)
  const anio = campo(lineas, /MODELO\s*ANO/) || campo(lineas, /FABRICACION\s*ANO/)
  const nroTitulo = campo(lineas, /NUMERO\s*DE\s*TITULO/)
  const nroCedula = campo(lineas, /NUMERO\s*DE\s*CEDULA/)
  // Titulo: "Razon Social:" (empresa) o "Nombre:" (persona). Cedula:
  // "TITULAR:". Ojo con "Porcentaje de Titular:" y "Titular desde:".
  const titular = campo(lineas, /RAZON\s*SOCIAL/) ||
    (documento === 'TITULO' ? campo(lineas, /NOMBRE/) : '') ||
    campo(lineas, /(?<!DE\s)TITULAR(?!\s*(DESDE|DE\s*RADIC))/)
  const seccional = (texto.match(/SECCIONAL\s*(?:EMISOR\s*NRO\.?\s*)?(\d{4,5})/) || texto.match(/REGISTRO\s*SECCIONAL\s*:?\s*(\d{4,5})/) || [])[1] || ''

  const campos = {
    marcaChasis: marcaChasis.replace(/\s+/g, ' '),
    modeloRegistral: modelo.replace(/\s+/g, ' '),
    tipoRegistral: tipo.replace(/\s+/g, ' '),
    categoria: categoriaDeTipo(tipo),
    // Si el documento no la trae, casi siempre es la del chasis.
    marcaMotor: (marcaMotor || (categoriaDeTipo(tipo) !== 'ACOPLADO' ? marcaChasis : '')).replace(/\s+/g, ' '),
    // El motor puede tener un espacio de verdad ("CFN 133182"): solo se
    // limpian los dobles.
    nroMotor: nroMotor.replace(/\s+/g, ' '),
    nroChasis: nroChasis ? corregirChasis(nroChasis) : '',
    uso: uso ? normalizarUso(uso) : '',
    anio: /^(19|20)\d{2}$/.test(anio) ? anio : '',
    titular: titular.replace(/\s+/g, ' '),
    // "008829499 PR": el numero son los digitos; lo que sigue es ruido.
    nroTitulo: (nroTitulo.replace(/\s+/g, '').match(/^\d+/) || [nroTitulo.replace(/\s+/g, '')])[0],
    nroCedula: nroCedula.replace(/[^A-Z0-9*]/g, ''),
    seccional: seccional.padStart(5, '0').slice(-5),
  }
  // El OCR deja a veces una letra suelta al final, del borde de la foto
  // ("RIVARA SOCIEDAD ANONIMA E"). En un texto, una letra sola al final no es
  // dato.
  for (const k of ['marcaChasis', 'modeloRegistral', 'tipoRegistral', 'marcaMotor', 'titular']) {
    campos[k] = campos[k].replace(/(\s+[A-Z])+$/, '').trim()
  }
  for (const k of Object.keys(campos)) if (vacio(campos[k]) || campos[k] === '00000') campos[k] = ''

  if (campos.nroChasis && campos.nroChasis.length !== 17) {
    avisos.push(`El chasis leído tiene ${campos.nroChasis.length} caracteres (un VIN tiene 17): revisalo contra el documento.`)
  }
  if (documento === 'DESCONOCIDO') avisos.push('No parece una cédula ni un título del automotor: revisá lo leído con cuidado.')

  return { documento, dominio, campos, avisos }
}
