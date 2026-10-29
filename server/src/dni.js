// Lectura de un DNI argentino para cargar los datos del comprador de una
// transferencia o una denuncia de venta.
//
// El dato bueno esta en el DORSO: las tres lineas de abajo son la zona de
// lectura mecanica (MRZ, formato TD1 de la OACI), hecha para que la lea una
// maquina y con digitos de control. Con esos digitos se verifica la lectura
// del OCR y se corrigen las confusiones tipicas (O por 0, B por 8). Si no
// verifica, se avisa: un DNI mal leido en un 08 es un tramite observado.
//
//   IDARG12345678<8<<<<<<<<<<<<<<<     tipo, pais, DNI + control
//   9002155F3001019ARG<<<<<<<<<<<0     nacimiento + control, sexo, vencimiento + control, nacionalidad
//   PEREZ<GOMEZ<<ANA<MARIA<<<<<<<<     apellidos << nombres
//
// (Ejemplo inventado: los DNI reales no van al repo.)
//
// El FRENTE no tiene MRZ: se leen las etiquetas (Apellido, Nombre, Sexo,
// Documento...). El domicilio esta arriba del dorso y no tiene control.

const A_NUMERO = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8', T: '7' }
const numerico = (s) => [...s].map((c) => A_NUMERO[c] || c).join('')

// Digito de control de la OACI: pesos 7-3-1, letras A=10..Z=35, "<" vale 0.
export function digitoControl(texto) {
  const pesos = [7, 3, 1]
  let suma = 0
  ;[...texto].forEach((c, i) => {
    const v = /\d/.test(c) ? Number(c) : /[A-Z]/.test(c) ? c.charCodeAt(0) - 55 : 0
    suma += v * pesos[i % 3]
  })
  return String(suma % 10)
}

const verifica = (dato, control) => digitoControl(dato) === control

// AAMMDD -> AAAA-MM-DD. Nacimiento: siglo pasado si el año "todavia no
// llego"; vencimiento: siempre este siglo.
function fecha(aammdd, tipo) {
  if (!/^\d{6}$/.test(aammdd)) return ''
  const aa = Number(aammdd.slice(0, 2))
  const actual = new Date().getFullYear() % 100
  const siglo = tipo === 'nacimiento' ? (aa > actual ? 1900 : 2000) : 2000
  return `${siglo + aa}-${aammdd.slice(2, 4)}-${aammdd.slice(4, 6)}`
}

const titulo = (s) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase())

/**
 * CUIL a partir del DNI y el sexo, con el algoritmo de AFIP: prefijo 20
 * (masculino) o 27 (femenino), digito verificador modulo 11, y si da 10 el
 * prefijo pasa a 23. Es como se asigna en la enorme mayoria de los casos,
 * pero no en todos: se muestra como "calculado" para que alguien lo verifique.
 */
export function calcularCuil(dni, sexo) {
  const d = String(dni || '').replace(/\D/g, '')
  if (!d || d.length > 8 || !['M', 'F'].includes(sexo)) return ''
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const digito = (pref) => {
    const base = pref + d.padStart(8, '0')
    const resto = [...base].reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11
    return resto === 0 ? 0 : 11 - resto
  }
  let prefijo = sexo === 'M' ? '20' : '27'
  let dv = digito(prefijo)
  if (dv === 10) {
    prefijo = '23'
    dv = sexo === 'M' ? 9 : 4
  } else if (dv === 11) {
    dv = 0
  }
  return `${prefijo}-${d.padStart(8, '0')}-${dv}`
}

// Las lineas de la MRZ como las deja el OCR: sin espacios, con los "<" que
// a veces salen como «, K o C pegadas a otros <.
function lineasMrz(texto) {
  return String(texto || '').toUpperCase().split('\n')
    .map((l) => l.replace(/\s+/g, '').replace(/[«‹]/g, '<').replace(/(?<=<)[KC](?=<)/g, '<').replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 20)
}

function leerMrz(texto) {
  const lineas = lineasMrz(texto)
  const i1 = lineas.findIndex((l) => /^I[DO<]ARG/.test(l))
  if (i1 < 0) return null
  const l1 = lineas[i1].padEnd(30, '<')
  const l2 = (lineas[i1 + 1] || '').padEnd(30, '<')
  const l3 = (lineas[i1 + 2] || '').padEnd(30, '<')

  const avisos = []
  const controles = { documento: false, nacimiento: false, vencimiento: false }

  // Linea 1: posiciones 6-14 el numero (relleno con <), 15 el control.
  const docCrudo = numerico(l1.slice(5, 14))
  const docCtrl = numerico(l1[14])
  controles.documento = verifica(docCrudo, docCtrl)
  const dni = docCrudo.replace(/</g, '').replace(/\D/g, '')

  // Linea 2.
  const nacCrudo = numerico(l2.slice(0, 6))
  controles.nacimiento = verifica(nacCrudo, numerico(l2[6]))
  const sexo = { M: 'M', F: 'F' }[l2[7]] || ''
  const vtoCrudo = numerico(l2.slice(8, 14))
  controles.vencimiento = verifica(vtoCrudo, numerico(l2[14]))
  const nacionalidad = l2.slice(15, 18).replace(/</g, '')

  // Linea 3: APELLIDOS<<NOMBRES, con < entre palabras.
  const [ape = '', nom = ''] = l3.replace(/<+$/, '').split('<<')
  const limpiar = (s) => titulo(s.replace(/<+/g, ' ').replace(/[^A-Z\s]/g, '').trim())

  if (!controles.documento) avisos.push('El número de documento no pasó el dígito de control: revisalo contra el DNI.')
  if (!controles.nacimiento) avisos.push('La fecha de nacimiento no pasó el dígito de control: revisala.')

  return {
    persona: {
      apellido: limpiar(ape),
      nombres: limpiar(nom),
      dni,
      sexo,
      fechaNacimiento: fecha(nacCrudo, 'nacimiento'),
      nacionalidad: nacionalidad === 'ARG' ? 'Argentina' : nacionalidad,
      vencimiento: fecha(vtoCrudo, 'vencimiento'),
    },
    controles,
    avisos,
  }
}

const sinTildes = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// El domicilio va arriba del dorso: "DOMICILIO: SAN MARTIN 100 - ALBERTI -
// ALBERTI - BUENOS AIRES". El OCR suele comerse la etiqueta, asi que tambien
// se reconoce por su forma: una linea con dos o mas " - ".
function leerDomicilio(texto) {
  const lineas = sinTildes(String(texto || '')).split('\n').map((l) => l.trim()).filter(Boolean)
  const i = lineas.findIndex((l) => /DOMICILIO|MICILIO|DOMIC/i.test(l) || (l.match(/ - /g) || []).length >= 2)
  if (i < 0) return ''
  let dom = lineas[i].replace(/^.*?(DOMICILIO|MICILIO|DOMIC\w*)\s*[:.,]?\s*/i, '')
  // Si la etiqueta vino ilegible ("oouctio, SAN MARTIN 100 -..."), se corta lo que
  // hay antes de la primera palabra en mayusculas de 3 letras o mas.
  if (dom === lineas[i]) dom = dom.replace(/^[^A-Z]*?(?=[A-Z]{3,})/, '')
  // La provincia suele cortar linea ("BUENOS" / "AIRES").
  const siguiente = lineas[i + 1] || ''
  if (/^AIRES\b/i.test(siguiente) || /\bBUENOS\s*$/i.test(dom)) dom = dom.replace(/\s*AIRES\s*$/i, '') + ' AIRES'
  return dom.replace(/\s+/g, ' ').replace(/[^\p{L}\d\s.,º°/-]/gu, '').trim().toUpperCase()
}

// Frente del DNI (sin MRZ): etiquetas bilingues "Apellido / Surname".
function leerFrente(texto) {
  const t = sinTildes(String(texto || '')).toUpperCase()
  const despues = (re) => {
    const lineas = t.split('\n')
    for (let i = 0; i < lineas.length; i++) {
      if (re.test(lineas[i])) {
        const resto = lineas[i].replace(re, '').replace(/^[\s/:A-Z]*?(SURNAME|NAME|SEX|NATIONALITY|DATE OF BIRTH|DOCUMENT)\b\s*/, '').trim()
        return resto.length > 1 ? resto : (lineas[i + 1] || '').trim()
      }
    }
    return ''
  }
  const apellido = despues(/APELLIDO/)
  const nombres = despues(/NOMBRE/)
  const doc = (t.match(/\b(\d{1,2}[.\s]?\d{3}[.\s]?\d{3})\b/) || [])[1] || ''
  if (!apellido && !nombres && !doc) return null
  const sexoTxt = despues(/SEXO/)
  return {
    persona: {
      apellido: titulo(apellido.replace(/[^A-Z\s]/g, '').trim()),
      nombres: titulo(nombres.replace(/[^A-Z\s]/g, '').trim()),
      dni: doc.replace(/\D/g, ''),
      sexo: /^M/.test(sexoTxt) ? 'M' : /^F/.test(sexoTxt) ? 'F' : '',
      fechaNacimiento: '',
      nacionalidad: /ARGENTIN/.test(t) ? 'Argentina' : '',
      vencimiento: '',
    },
    controles: null,
    avisos: ['Se leyó el frente del DNI, que no tiene dígitos de control: revisá cada dato. El dorso se lee más seguro.'],
  }
}

/**
 * @param {string[]} textos  lecturas del mismo documento (la imagen entera y
 *                           la tarjeta recortada); se queda con la mejor
 */
export function interpretarDni(textos) {
  const lista = Array.isArray(textos) ? textos : [textos]
  // La MRZ que mas controles pasa.
  let mejor = null
  for (const t of lista) {
    const r = leerMrz(t)
    if (!r) continue
    const puntos = Object.values(r.controles).filter(Boolean).length
    if (!mejor || puntos > mejor.puntos) mejor = { ...r, puntos }
  }
  const lectura = mejor || lista.map(leerFrente).find(Boolean)
  if (!lectura) {
    return { persona: null, verificado: false, avisos: ['No se encontraron los datos del DNI. Probá con una foto del dorso, de frente y con buena luz.'] }
  }

  const domicilio = lista.map(leerDomicilio).find(Boolean) || ''
  const persona = { ...lectura.persona, domicilio }
  const cuil = calcularCuil(persona.dni, persona.sexo)
  const verificado = Boolean(lectura.controles?.documento && lectura.controles?.nacimiento)
  const avisos = [...lectura.avisos]
  if (domicilio) avisos.push('El domicilio no tiene control: revisalo contra el DNI (el OCR confunde números).')
  if (persona.vencimiento && persona.vencimiento < new Date().toISOString().slice(0, 10)) {
    avisos.push(`El DNI venció el ${persona.vencimiento.split('-').reverse().join('/')}.`)
  }
  return { persona: { ...persona, cuil, cuilCalculado: Boolean(cuil) }, verificado, avisos }
}
