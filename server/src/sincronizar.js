import { db } from './db.js'
import { leerPlanilla } from './planillas.js'
import { hashDe, leerArchivo } from './smb.js'

// Actualiza la flota desde las planillas de la red.
//
// Corre al arrancar el servidor (es el seed: la base nace de las planillas,
// no de datos de ejemplo) y cada vez que alguien entra a la app, con un
// minimo de SYNC_MINUTOS entre lecturas para no bajar el archivo en cada
// recarga de pagina. Desde la pantalla de flota se puede forzar.
//
// Reglas de actualizacion, en orden de importancia:
//   1. Lo cargado a mano en la app no se pisa nunca: ni los datos registrales
//      (chasis, motor, uso), que la planilla no tiene, ni un campo de planilla
//      que alguien corrigio (queda anotado en vehiculos.manuales).
//   2. Un dominio nuevo en la planilla se da de alta.
//   3. Un dato que cambio en la planilla (otro chofer, otro estado) se
//      actualiza. Una celda que quedo vacia NO borra el dato que habia.
//   4. Un vehiculo que dejo de figurar no se borra (puede tener tramites):
//      queda marcado como "no figura en la planilla".

export const FUENTES = [
  {
    id: 'camionetas',
    nombre: 'Camionetas',
    categoria: 'CAMIONETA',
    variable: 'PLANILLA_CAMIONETAS',
    porDefecto: '\\\\server\\Rivara Transportes y logistica\\Camionetas\\Camionetas.xlsx',
  },
  {
    id: 'camiones',
    nombre: 'Camiones',
    categoria: 'CAMION',
    variable: 'PLANILLA_CAMIONES',
    porDefecto: '\\\\server\\Rivara Transportes y logistica\\Camiones\\Control Camiones.xlsx',
  },
]

// Los campos que vienen de la planilla. El resto de las columnas de
// vehiculos solo se cargan desde la app.
export const CAMPOS_PLANILLA = [
  'categoria', 'unidad', 'rol', 'marca', 'modelo', 'configuracion', 'anio',
  'chofer', 'estado', 'titular', 'localidad', 'sector',
]

const minutosEntreLecturas = () => {
  const n = Number(process.env.SYNC_MINUTOS)
  return Number.isFinite(n) && n >= 0 ? n : 10
}

const rutaDe = (fuente) => (process.env[fuente.variable] || fuente.porDefecto).trim()

const ahora = () => new Date().toISOString()

let enCurso = null
let ultimoIntento = 0

function ultimaOk(fuente) {
  return db.prepare('SELECT * FROM sincronizaciones WHERE fuente = ? AND ok = 1 ORDER BY id DESC LIMIT 1').get(fuente)
}

function aplicar(fuente, registros) {
  const buscar = db.prepare('SELECT * FROM vehiculos WHERE dominio = ?')
  const insertar = db.prepare(`
    INSERT INTO vehiculos (dominio, categoria, unidad, rol, marca, modelo, configuracion, anio,
      chofer, estado, titular, localidad, sector, fuente, origen, en_planilla, sincronizado_en)
    VALUES (@dominio, @categoria, @unidad, @rol, @marca, @modelo, @configuracion, @anio,
      @chofer, @estado, @titular, @localidad, @sector, @fuente, @origen, 1, @ahora)
  `)
  let nuevos = 0
  let actualizados = 0
  const marca = ahora()

  db.transaction(() => {
    for (const reg of registros) {
      const previo = buscar.get(reg.dominio)
      if (!previo) {
        insertar.run({ ...reg, fuente: fuente.id, ahora: marca })
        nuevos++
        continue
      }

      const manuales = new Set(JSON.parse(previo.manuales || '[]'))
      const cambios = {}
      for (const campo of CAMPOS_PLANILLA) {
        if (manuales.has(campo)) continue
        const valor = reg[campo]
        if (valor === '' || valor == null) continue // celda vacia no borra
        if (String(previo[campo] ?? '') !== String(valor)) cambios[campo] = valor
      }

      const sets = Object.keys(cambios).map((k) => `${k} = @${k}`)
      // Un vehiculo cargado a mano que aparece en la planilla pasa a ser de
      // esa planilla; uno que ya era de la otra (un dominio en las dos) se
      // queda donde estaba.
      const fuenteNueva = previo.fuente || fuente.id
      if (fuenteNueva === fuente.id) sets.push('origen = @origen')
      db.prepare(`
        UPDATE vehiculos SET ${[...sets, 'fuente = @fuente', 'en_planilla = 1', 'sincronizado_en = @ahora',
          ...(Object.keys(cambios).length ? ["actualizado_en = datetime('now')"] : [])].join(', ')}
        WHERE id = @id
      `).run({ ...cambios, origen: reg.origen, fuente: fuenteNueva, ahora: marca, id: previo.id })
      if (Object.keys(cambios).length) actualizados++
    }

    // Los que eran de esta planilla y ya no estan.
    const presentes = new Set(registros.map((r) => r.dominio))
    const deLaFuente = db.prepare('SELECT id, dominio FROM vehiculos WHERE fuente = ? AND en_planilla = 1').all(fuente.id)
    const bajar = db.prepare('UPDATE vehiculos SET en_planilla = 0 WHERE id = ?')
    for (const v of deLaFuente) if (!presentes.has(v.dominio)) bajar.run(v.id)
  })()

  return { nuevos, actualizados }
}

async function sincronizarFuente(fuente, forzar) {
  const ruta = rutaDe(fuente)
  const inicio = ahora()
  try {
    const { buffer, nombre, ruta: rutaLeida } = await leerArchivo(ruta)
    const hash = hashDe(buffer)
    const previa = ultimaOk(fuente.id)

    // Mismo archivo que la ultima vez: no hay nada que procesar. Se anota la
    // verificacion sobre la misma fila para no sumar una por cada ingreso.
    if (!forzar && previa && previa.hash === hash) {
      db.prepare('UPDATE sincronizaciones SET verificado_en = ? WHERE id = ?').run(ahora(), previa.id)
      return { fuente: fuente.id, ok: true, sinCambios: true }
    }

    const { registros, avisos } = leerPlanilla(buffer, { archivo: nombre, categoria: fuente.categoria })
    if (!registros.length) throw new Error(`${nombre}: no se encontró ningún dominio. ${avisos.join(' ')}`.trim())

    const { nuevos, actualizados } = aplicar(fuente, registros)
    const mensaje = rutaLeida !== ruta ? `Se leyó ${rutaLeida} (el nombre configurado no coincidía exacto).` : ''
    db.prepare(`
      INSERT INTO sincronizaciones (fuente, archivo, inicio, fin, ok, hash, nuevos, actualizados, leidos, mensaje, avisos, verificado_en)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    `).run(fuente.id, rutaLeida, inicio, ahora(), hash, nuevos, actualizados, registros.length, mensaje, JSON.stringify(avisos), ahora())
    console.log(`Planilla ${fuente.nombre}: ${registros.length} dominios, ${nuevos} nuevos, ${actualizados} actualizados.`)
    return { fuente: fuente.id, ok: true, nuevos, actualizados, avisos }
  } catch (e) {
    db.prepare(`
      INSERT INTO sincronizaciones (fuente, archivo, inicio, fin, ok, mensaje) VALUES (?, ?, ?, ?, 0, ?)
    `).run(fuente.id, ruta, inicio, ahora(), e.message)
    console.warn(`Planilla ${fuente.nombre}: ${e.message}`)
    return { fuente: fuente.id, ok: false, error: e.message }
  }
}

/**
 * Sincroniza las dos planillas.
 * Sin `forzar`, no hace nada si la ultima lectura fue hace menos de
 * SYNC_MINUTOS. Dos pedidos simultaneos comparten la misma lectura.
 */
export async function sincronizar({ forzar = false } = {}) {
  if (enCurso) return enCurso
  const espera = minutosEntreLecturas() * 60_000
  if (!forzar && Date.now() - ultimoIntento < espera) return { omitida: true, estado: estadoSincronizacion() }

  ultimoIntento = Date.now()
  enCurso = (async () => {
    const resultados = []
    for (const f of FUENTES) resultados.push(await sincronizarFuente(f, forzar))
    return { omitida: false, resultados, estado: estadoSincronizacion() }
  })()
  try {
    return await enCurso
  } finally {
    enCurso = null
  }
}

// Lo que muestra la pantalla: por planilla, la ultima lectura buena y, si la
// ultima fallo, el error.
export function estadoSincronizacion() {
  return FUENTES.map((f) => {
    const ultima = db.prepare('SELECT * FROM sincronizaciones WHERE fuente = ? ORDER BY id DESC LIMIT 1').get(f.id)
    const ok = ultimaOk(f.id)
    // Una lectura sin cambios no agrega fila: actualiza verificado_en de la
    // ultima buena. Por eso el error cuenta solo si es posterior a eso.
    const vigente = ultima && !ultima.ok && (!ok || ultima.fin > (ok.verificado_en || ok.fin))
    return {
      fuente: f.id,
      nombre: f.nombre,
      ruta: rutaDe(f),
      ultimaLectura: ok ? {
        archivo: ok.archivo,
        en: ok.fin,
        verificadoEn: ok.verificado_en,
        nuevos: ok.nuevos,
        actualizados: ok.actualizados,
        leidos: ok.leidos,
        mensaje: ok.mensaje,
        avisos: JSON.parse(ok.avisos || '[]'),
      } : null,
      error: vigente ? { en: ultima.fin, mensaje: ultima.mensaje } : null,
      enCurso: Boolean(enCurso),
    }
  })
}
