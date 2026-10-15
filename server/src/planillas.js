import XLSX from 'xlsx'
import { extraerDominios } from './dominio.js'

// Lectura de las planillas de flota.
//
// Las planillas las mantiene otra gente y van a cambiar: hojas renombradas,
// columnas que se mueven o se agregan, encabezados con espacios de mas. Por
// eso NO se busca una hoja ni una columna por posicion o por nombre exacto:
//
//   · se recorren todas las hojas del libro;
//   · en cada una se busca la fila de encabezados entre las primeras 20, la que
//     mas columnas conocidas tenga (y al menos una de dominio);
//   · cada encabezado se reconoce por sinonimos ("Patente" o "Dominio",
//     "Chofer" o "Responsable", "Año" o "Modelo año"...).
//
// Lo que no se puede interpretar no se descarta callado: vuelve como aviso.

const MAX_FILAS_ENCABEZADO = 20
const ANIO_MIN = 1950

// Minusculas, sin tildes ni signos: "Camion N°" -> "camion n", "Año" -> "ano".
const normalizarEncabezado = (texto) => {
  const crudo = String(texto ?? '').trim()
  if (crudo === '#' || crudo === 'N°' || crudo === 'Nº') return 'numero'
  return crudo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

// Orden de las reglas: importa. "Dominio Tractor" tiene que caer en tractor
// antes que en dominio, y "Camion N°" en unidad antes que en marca.
const REGLAS = [
  [(h) => /(dominio|patente)/.test(h) && /tractor|chasis|camion/.test(h), 'dominioTractor'],
  [(h) => /(dominio|patente)/.test(h) && /tolva|acoplado|semi|batea|carreton/.test(h), 'dominioAcoplado'],
  [(h) => /^(dominio|patente)( \d+)?$/.test(h) || /^(dominio|patente) /.test(h), 'dominio'],
  [(h) => /^(numero|nro|n|num|interno|unidad|movil)$/.test(h) || /^(camion|camioneta|unidad|movil) (n|nro|numero|num)$/.test(h), 'unidad'],
  [(h) => /^(marca|camioneta|vehiculo|camion|marca y modelo|marca modelo|unidad marca)$/.test(h), 'marca'],
  [(h) => /^(modelo|version|modelo version)$/.test(h), 'modelo'],
  [(h) => /^(ano|anio|ano modelo|modelo ano|anno)$/.test(h), 'anio'],
  [(h) => /^(tipo|cabina|carroceria)$/.test(h), 'configuracion'],
  [(h) => /^(chofer|choferes|responsable|conductor|asignado|asignada a|usuario)$/.test(h), 'chofer'],
  [(h) => /^(estado|plan|situacion)$/.test(h), 'estado'],
  [(h) => /^(titular|propietario)$/.test(h), 'titular'],
  [(h) => /^(localidad|ubicacion|base)$/.test(h), 'localidad'],
  [(h) => /^(sector|area)$/.test(h), 'sector'],
]

const COLUMNAS_DOMINIO = ['dominioTractor', 'dominioAcoplado', 'dominio']

function campoDe(encabezado) {
  const h = normalizarEncabezado(encabezado)
  if (!h) return null
  for (const [prueba, campo] of REGLAS) if (prueba(h)) return campo
  return null
}

// Celda -> texto limpio. Los errores de Excel (#REF!, #N/A) son ausencia de
// dato, no un valor: guardar "#REF!" como chofer seria peor que dejarlo vacio.
function texto(celda) {
  if (!celda || celda.t === 'e' || celda.v == null) return ''
  const v = celda.t === 'n' && Number.isInteger(celda.v) ? String(celda.v) : String(celda.w ?? celda.v)
  const limpio = v.replace(/\s+/g, ' ').trim()
  return /^#(REF|N\/A|VALUE|DIV\/0|NAME|NULL|NUM)[!?]?$/i.test(limpio) ? '' : limpio
}

function anioDe(celda) {
  const t = texto(celda)
  if (!t) return { anio: null, invalido: false }
  const n = Number(t)
  const max = new Date().getFullYear() + 1
  if (Number.isInteger(n) && n >= ANIO_MIN && n <= max) return { anio: n, invalido: false }
  return { anio: null, invalido: t }
}

function detectarEncabezado(hoja, rango) {
  let mejor = null
  const hasta = Math.min(rango.e.r, rango.s.r + MAX_FILAS_ENCABEZADO - 1)
  for (let r = rango.s.r; r <= hasta; r++) {
    const columnas = {}
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const celda = hoja[XLSX.utils.encode_cell({ r, c })]
      const campo = campoDe(celda?.v)
      // La primera columna que matchea gana: si una planilla repite "Patente",
      // la de la izquierda es la original.
      if (campo && columnas[campo] === undefined) columnas[campo] = c
    }
    const tieneDominio = COLUMNAS_DOMINIO.some((k) => columnas[k] !== undefined)
    const puntaje = Object.keys(columnas).length
    if (tieneDominio && puntaje >= 2 && (!mejor || puntaje > mejor.puntaje)) {
      mejor = { fila: r, columnas, puntaje }
    }
  }
  return mejor
}

/**
 * Lee un libro de Excel y devuelve un registro por dominio.
 *
 * @param {Buffer} buffer       el .xlsx
 * @param {object} opciones
 * @param {string} opciones.archivo     nombre para los mensajes
 * @param {'CAMIONETA'|'CAMION'} opciones.categoria  que hay en la planilla
 * @returns {{ registros: object[], avisos: string[], hojas: object[] }}
 */
export function leerPlanilla(buffer, { archivo, categoria }) {
  const libro = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const avisos = []
  const hojas = []
  // dominio -> registro. La primera hoja del libro manda: las de mas atras
  // solo completan lo que falte (en Camionetas.xlsx, "Actual1" es la vigente y
  // "Actual" una version anterior).
  const porDominio = new Map()

  for (const nombreHoja of libro.SheetNames) {
    const hoja = libro.Sheets[nombreHoja]
    if (!hoja['!ref']) continue
    const rango = XLSX.utils.decode_range(hoja['!ref'])
    const enc = detectarEncabezado(hoja, rango)
    if (!enc) {
      hojas.push({ hoja: nombreHoja, filas: 0, reconocida: false })
      continue
    }

    const col = enc.columnas
    const celda = (r, campo) => (col[campo] === undefined ? undefined : hoja[XLSX.utils.encode_cell({ r, c: col[campo] })])
    const hayTractor = col.dominioTractor !== undefined
    let filas = 0

    for (let r = enc.fila + 1; r <= rango.e.r; r++) {
      const fila = r + 1 // como la ve la persona en Excel
      const donde = `${archivo} › ${nombreHoja}, fila ${fila}`

      const comun = {
        unidad: texto(celda(r, 'unidad')),
        chofer: texto(celda(r, 'chofer')),
        estado: texto(celda(r, 'estado')),
        titular: texto(celda(r, 'titular')),
        localidad: texto(celda(r, 'localidad')),
        sector: texto(celda(r, 'sector')),
      }
      const propio = {
        marca: texto(celda(r, 'marca')),
        modelo: texto(celda(r, 'modelo')),
        configuracion: texto(celda(r, 'configuracion')),
      }
      const { anio, invalido: anioInvalido } = anioDe(celda(r, 'anio'))

      // Cada columna de dominio es un vehiculo distinto para el Registro.
      // Marca, modelo y año son del tractor (o del unico dominio de la fila):
      // la tolva tiene los suyos, que la planilla no trae.
      const encontrados = []
      for (const campo of COLUMNAS_DOMINIO) {
        const { dominios, invalidos } = extraerDominios(texto(celda(r, campo)))
        for (const inv of invalidos) avisos.push(`${donde}: «${inv}» no parece un dominio válido, no se importó.`)
        dominios.forEach((dominio, i) => {
          let cat = categoria
          let rol = ''
          let datosPropios = true
          if (categoria === 'CAMION') {
            if (campo === 'dominioTractor') rol = 'Tractor'
            else if (campo === 'dominioAcoplado') { cat = 'ACOPLADO'; rol = 'Tolva/Acoplado'; datosPropios = false }
            else if (hayTractor) { cat = 'ACOPLADO'; rol = 'Dominio adicional'; datosPropios = false }
            if (i > 0) datosPropios = false
          }
          encontrados.push({
            dominio, categoria: cat, rol, ...comun,
            ...(datosPropios ? { ...propio, anio } : { marca: '', modelo: '', configuracion: '', anio: null }),
            origen: donde,
          })
        })
      }

      if (!encontrados.length) {
        // Fila con datos pero sin dominio: probablemente una unidad nueva a la
        // que todavia no le cargaron la patente. Vale avisar.
        if (comun.unidad && propio.marca) avisos.push(`${donde}: la unidad ${comun.unidad} (${propio.marca}) no tiene dominio cargado.`)
        continue
      }
      if (anioInvalido) avisos.push(`${donde}: el año «${anioInvalido}» no es válido, se dejó vacío.`)

      for (const reg of encontrados) {
        filas++
        const previo = porDominio.get(reg.dominio)
        if (!previo) { porDominio.set(reg.dominio, reg); continue }
        // Mismo dominio en dos filas u hojas: lo primero gana, lo de despues
        // solo completa huecos.
        for (const [k, v] of Object.entries(reg)) {
          if ((previo[k] === '' || previo[k] == null) && v !== '' && v != null) previo[k] = v
        }
      }
    }
    hojas.push({ hoja: nombreHoja, filas, reconocida: true, columnas: Object.keys(col) })
  }

  if (!hojas.some((h) => h.reconocida)) {
    avisos.push(`${archivo}: ninguna hoja tiene una columna de dominio o patente reconocible.`)
  }

  return { registros: [...porDominio.values()], avisos, hojas }
}
