import { Router } from 'express'
import crypto from 'node:crypto'
import { db } from './db.js'
import {
  COOKIE_LOCAL, cookieOptions, esGestor, firmarTokenLocal, hashPassword,
  requireAdmin, requireAuth, requireGestor, sesionOpcional, usuarioPublico, verificarPassword,
} from './auth.js'
import {
  CAMPOS_REGISTRALES, CATEGORIAS, ESTADOS, MARCAS, MARCAS_MOTOR, MOTIVOS, ROLES, TIPOS, TIPOS_REGISTRALES, USOS,
  claves, tipoDe,
} from './catalogo.js'
import { dominioValido, normalizarDominio } from './dominio.js'
import { DOCUMENTOS_DDJJ, generarDDJJ } from './ddjj.js'
import { CAMPOS_PLANILLA, estadoSincronizacion, sincronizar } from './sincronizar.js'

export const api = Router()

const texto = (v, max = 500) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const textoLargo = (v, max = 4000) => String(v ?? '').trim().slice(0, max)

api.get('/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

/* ----------------------------- sesion ----------------------------- */

api.get('/auth/me', sesionOpcional, (req, res) => {
  if (!req.usuario) return res.status(401).json({ error: 'No autenticado' })
  db.prepare("UPDATE usuarios SET ultimo_ingreso = datetime('now') WHERE id = ?").run(req.usuario.id)
  res.json({ usuario: usuarioPublico(req.usuario, req.via) })
})

// Login de respaldo. Solo sirve si el usuario ya definio su contrasena desde
// adentro de la app, si un administrador le puso una, o si es el usuario de
// emergencia del .env.
api.post('/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim()
  const password = String(req.body?.password || '')
  if (!email || !password) return res.status(400).json({ error: 'Ingresá el usuario y la contraseña' })

  const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email)
  if (!usuario || !usuario.activo || !verificarPassword(password, usuario.password)) {
    // Un solo mensaje para los tres casos: decir cual fallo le confirma a
    // quien prueba si el usuario existe.
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })
  }

  res.cookie(COOKIE_LOCAL, firmarTokenLocal(usuario), cookieOptions(Boolean(req.body?.recordar)))
  res.json({ usuario: usuarioPublico(usuario, 'local') })
})

// Solo borra la cookie propia. La del portal se cierra desde el portal: si la
// borraramos aca, salir de esta app cerraria tambien todas las demas.
api.post('/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_LOCAL, { ...cookieOptions(false), maxAge: undefined })
  res.json({ ok: true })
})

api.post('/auth/password', requireAuth, (req, res) => {
  const nueva = String(req.body?.nueva || '')
  if (nueva.length < 8) return res.status(400).json({ error: 'La contraseña tiene que tener al menos 8 caracteres' })
  // Si ya tenia una, hay que saberla: una sesion robada no alcanza para
  // quedarse con la cuenta.
  if (req.usuario.password && !verificarPassword(String(req.body?.actual || ''), req.usuario.password)) {
    return res.status(400).json({ error: 'La contraseña actual no coincide' })
  }
  db.prepare('UPDATE usuarios SET password = ? WHERE id = ?').run(hashPassword(nueva), req.usuario.id)
  res.json({ ok: true })
})

/* ------------------- de aca para abajo, con sesion ------------------- */

api.use(requireAuth)

// Lista base + lo que ya se cargo en la flota, sin repetir (sin distinguir
// mayusculas ni tildes) y en orden alfabetico salvo la base, que va primero.
function lista(base, ...columnas) {
  const vistos = new Set()
  const clave = (v) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const salida = []
  const agregar = (v) => {
    const t = String(v || '').trim()
    if (!t || vistos.has(clave(t))) return
    vistos.add(clave(t))
    salida.push(t)
  }
  base.forEach(agregar)
  const extra = columnas.flatMap((c) =>
    db.prepare(`SELECT DISTINCT ${c} AS v FROM vehiculos WHERE ${c} <> ''`).all().map((r) => r.v))
  extra.sort((a, b) => a.localeCompare(b, 'es')).forEach(agregar)
  return salida
}

api.get('/catalogo', (_req, res) => {
  res.json({
    listas: {
      marcas: lista(MARCAS, 'marca_chasis'),
      marcasMotor: lista(MARCAS_MOTOR, 'marca_motor', 'marca_chasis'),
      usos: lista(USOS, 'uso'),
      tiposRegistrales: lista(TIPOS_REGISTRALES, 'tipo_registral'),
      roles: lista(ROLES, 'rol'),
      marcasPlanilla: lista([], 'marca'),
      titulares: lista([], 'titular'),
      localidades: lista([], 'localidad'),
      sectores: lista([], 'sector'),
      estadosFlota: lista([], 'estado'),
    },
    tipos: TIPOS, motivos: MOTIVOS, estados: ESTADOS, categorias: CATEGORIAS,
    camposRegistrales: CAMPOS_REGISTRALES, documentosDdjj: DOCUMENTOS_DDJJ,
    ddjj: {
      lugar: process.env.DDJJ_LUGAR || 'Buenos Aires',
      seccional: process.env.DDJJ_SECCIONAL || '',
    },
  })
})

/* ---------------------------- vehiculos ---------------------------- */

const faltantes = (v) => CAMPOS_REGISTRALES.filter((c) => !String(v[c.clave] || '').trim()).map((c) => c.clave)

const vehiculoPublico = (v) => ({
  id: v.id,
  dominio: v.dominio,
  categoria: v.categoria,
  unidad: v.unidad,
  rol: v.rol,
  marca: v.marca,
  modelo: v.modelo,
  configuracion: v.configuracion,
  anio: v.anio,
  chofer: v.chofer,
  estado: v.estado,
  titular: v.titular,
  localidad: v.localidad,
  sector: v.sector,
  tipoRegistral: v.tipo_registral,
  modeloRegistral: v.modelo_registral,
  marcaChasis: v.marca_chasis,
  nroChasis: v.nro_chasis,
  marcaMotor: v.marca_motor,
  nroMotor: v.nro_motor,
  uso: v.uso,
  observaciones: v.observaciones,
  fuente: v.fuente,
  origen: v.origen,
  enPlanilla: Boolean(v.en_planilla),
  manuales: JSON.parse(v.manuales || '[]'),
  faltan: faltantes(v),
  sincronizadoEn: v.sincronizado_en,
  actualizadoEn: v.actualizado_en,
})

api.get('/vehiculos', (_req, res) => {
  const filas = db.prepare(`
    SELECT v.*, (SELECT COUNT(*) FROM tramites t WHERE t.dominio = v.dominio AND t.estado <> 'TERMINADO') AS abiertos
      FROM vehiculos v ORDER BY v.categoria, CAST(v.unidad AS INTEGER), v.unidad, v.dominio
  `).all()
  res.json({
    vehiculos: filas.map((v) => ({ ...vehiculoPublico(v), tramitesAbiertos: v.abiertos })),
    sincronizacion: estadoSincronizacion(),
  })
})

// Los nombres de la API (camelCase) contra las columnas. Los de planilla los
// puede pisar la sincronizacion salvo que se corrijan a mano; los registrales
// solo se cargan desde aca.
const CAMPOS_VEHICULO = {
  categoria: 'categoria', unidad: 'unidad', rol: 'rol', marca: 'marca', modelo: 'modelo',
  configuracion: 'configuracion', anio: 'anio', chofer: 'chofer', estado: 'estado',
  titular: 'titular', localidad: 'localidad', sector: 'sector',
  tipoRegistral: 'tipo_registral', modeloRegistral: 'modelo_registral',
  marcaChasis: 'marca_chasis', nroChasis: 'nro_chasis', marcaMotor: 'marca_motor',
  nroMotor: 'nro_motor', uso: 'uso', observaciones: 'observaciones',
}

function limpiarCampoVehiculo(columna, valor) {
  if (columna === 'anio') {
    if (valor === '' || valor == null) return null
    const n = Number(valor)
    if (!Number.isInteger(n) || n < 1950 || n > new Date().getFullYear() + 1) throw new Error('El año no es válido')
    return n
  }
  if (columna === 'categoria') {
    if (!claves(CATEGORIAS).includes(valor)) throw new Error('Categoría desconocida')
    return valor
  }
  if (columna === 'observaciones') return textoLargo(valor, 2000)
  // Chasis y motor se guardan en mayusculas y sin espacios dobles: asi se
  // escriben en el titulo y asi hay que copiarlos en un formulario.
  if (['nro_chasis', 'nro_motor'].includes(columna)) return texto(valor, 60).toUpperCase()
  return texto(valor, 200)
}

api.post('/vehiculos', requireGestor, (req, res) => {
  const dominio = normalizarDominio(req.body?.dominio)
  if (!dominioValido(dominio)) return res.status(400).json({ error: 'El dominio no tiene un formato válido (AA123BB o ABC123)' })
  if (db.prepare('SELECT 1 FROM vehiculos WHERE dominio = ?').get(dominio)) {
    return res.status(409).json({ error: `${dominio} ya está en la flota` })
  }
  const datos = { categoria: 'OTRO' }
  try {
    for (const [campo, columna] of Object.entries(CAMPOS_VEHICULO)) {
      if (req.body?.[campo] !== undefined) datos[columna] = limpiarCampoVehiculo(columna, req.body[campo])
    }
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }
  const cols = ['dominio', ...Object.keys(datos)]
  const info = db.prepare(`INSERT INTO vehiculos (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`)
    .run({ dominio, ...datos })
  res.status(201).json({ vehiculo: vehiculoPublico(db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(info.lastInsertRowid)) })
})

api.patch('/vehiculos/:id', requireGestor, (req, res) => {
  const previo = db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(req.params.id)
  if (!previo) return res.status(404).json({ error: 'No existe ese vehículo' })

  const cambios = {}
  try {
    for (const [campo, columna] of Object.entries(CAMPOS_VEHICULO)) {
      if (req.body?.[campo] === undefined) continue
      const valor = limpiarCampoVehiculo(columna, req.body[campo])
      if (String(previo[columna] ?? '') !== String(valor ?? '')) cambios[columna] = valor
    }
  } catch (e) {
    return res.status(400).json({ error: e.message })
  }

  // Un dato de planilla corregido a mano queda anotado para que la proxima
  // sincronizacion no lo vuelva al valor de la planilla. "liberar" lo
  // devuelve a la planilla.
  const manuales = new Set(JSON.parse(previo.manuales || '[]'))
  for (const col of Object.keys(cambios)) if (CAMPOS_PLANILLA.includes(col)) manuales.add(col)
  const liberar = Array.isArray(req.body?.liberar) ? req.body.liberar : []
  for (const campo of liberar) manuales.delete(CAMPOS_VEHICULO[campo] || campo)

  const sets = Object.keys(cambios).map((c) => `${c} = @${c}`)
  db.prepare(`UPDATE vehiculos SET ${[...sets, 'manuales = @manuales', "actualizado_en = datetime('now')"].join(', ')} WHERE id = @id`)
    .run({ ...cambios, manuales: JSON.stringify([...manuales]), id: previo.id })
  res.json({ vehiculo: vehiculoPublico(db.prepare('SELECT * FROM vehiculos WHERE id = ?').get(previo.id)) })
})

// Sin "forzar" respeta el minimo entre lecturas: es lo que llama la app al
// abrirse. Con "forzar" lee ya, aunque el archivo no haya cambiado.
api.post('/sincronizar', async (req, res) => {
  const resultado = await sincronizar({ forzar: Boolean(req.body?.forzar) })
  res.json(resultado)
})

api.get('/sincronizacion', (_req, res) => res.json({ sincronizacion: estadoSincronizacion() }))

/* ----------------------------- tramites ----------------------------- */

const SELECT_TRAMITE = `
  SELECT t.*,
         s.nombre AS solicitante_nombre, s.email AS solicitante_email,
         g.nombre AS gestor_nombre, g.email AS gestor_email,
         v.id AS v_id,
         (SELECT COUNT(*) FROM tramite_eventos e WHERE e.tramite_id = t.id AND e.tipo = 'NOTA') AS notas,
         (SELECT MAX(e.creado_en) FROM tramite_eventos e WHERE e.tramite_id = t.id) AS ultimo_movimiento
    FROM tramites t
    LEFT JOIN usuarios s ON s.id = t.solicitante_id
    LEFT JOIN usuarios g ON g.id = t.gestor_id
    LEFT JOIN vehiculos v ON v.dominio = t.dominio
`

function tramitePublico(t, vehiculos) {
  const v = t.v_id ? vehiculos.get(t.v_id) : null
  return {
    id: t.id,
    dominio: t.dominio,
    tipo: t.tipo,
    motivo: t.motivo,
    estado: t.estado,
    observaciones: t.observaciones,
    nroRegistro: t.nro_registro,
    solicitante: t.solicitante_id ? { id: t.solicitante_id, nombre: t.solicitante_nombre || t.solicitante_email } : null,
    gestor: t.gestor_id ? { id: t.gestor_id, nombre: t.gestor_nombre || t.gestor_email } : null,
    tomadoEn: t.tomado_en,
    presentadoEn: t.presentado_en,
    terminadoEn: t.terminado_en,
    creadoEn: t.creado_en,
    actualizadoEn: t.actualizado_en,
    ultimoMovimiento: t.ultimo_movimiento || t.creado_en,
    notas: t.notas,
    ddjj: t.ddjj ? JSON.parse(t.ddjj) : null,
    vehiculo: v ? vehiculoPublico(v) : null,
  }
}

const mapaVehiculos = (ids) => {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return new Map()
  const filas = db.prepare(`SELECT * FROM vehiculos WHERE id IN (${unicos.map(() => '?').join(',')})`).all(...unicos)
  return new Map(filas.map((v) => [v.id, v]))
}

function leerTramite(id) {
  const t = db.prepare(`${SELECT_TRAMITE} WHERE t.id = ?`).get(id)
  if (!t) return null
  return tramitePublico(t, mapaVehiculos([t.v_id]))
}

function eventosDe(id) {
  return db.prepare(`
    SELECT e.*, u.nombre AS usuario_nombre, u.email AS usuario_email
      FROM tramite_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
     WHERE e.tramite_id = ? ORDER BY e.creado_en, e.id
  `).all(id).map((e) => ({
    id: e.id,
    tipo: e.tipo,
    estadoDesde: e.estado_desde,
    estadoHasta: e.estado_hasta,
    texto: e.texto,
    usuario: e.usuario_id ? (e.usuario_nombre || e.usuario_email) : 'Sistema',
    creadoEn: e.creado_en,
  }))
}

const evento = (tramiteId, usuarioId, tipo, extra = {}) =>
  db.prepare(`INSERT INTO tramite_eventos (tramite_id, usuario_id, tipo, estado_desde, estado_hasta, texto)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(tramiteId, usuarioId, tipo, extra.desde || null, extra.hasta || null, extra.texto || '')

const tocar = (id) => db.prepare("UPDATE tramites SET actualizado_en = datetime('now') WHERE id = ?").run(id)

function cargarTramite(req, res) {
  const t = db.prepare('SELECT * FROM tramites WHERE id = ?').get(req.params.id)
  if (!t) res.status(404).json({ error: 'No existe ese trámite' })
  return t
}

// Quien lo pidio puede corregirlo o borrarlo mientras nadie lo tomo; despues
// es de quien lo gestiona.
const puedeEditar = (u, t) => esGestor(u) || (t.solicitante_id === u.id && !t.gestor_id && t.estado === 'SOLICITADO')

const enFlota = (dominio) => Boolean(db.prepare('SELECT 1 FROM vehiculos WHERE dominio = ?').get(dominio))

function validarTipoYMotivo(tipo, motivo, observaciones) {
  const def = tipoDe(tipo)
  if (!def) return 'Elegí qué trámite hay que hacer'
  if (def.motivo && motivo && !claves(MOTIVOS).includes(motivo)) return 'Motivo desconocido'
  if (tipo === 'OTRO' && !observaciones) return 'Para «Otro trámite» contá en observaciones qué hay que hacer'
  return null
}

api.get('/tramites', (_req, res) => {
  const filas = db.prepare(`${SELECT_TRAMITE} ORDER BY t.id DESC`).all()
  const vehiculos = mapaVehiculos(filas.map((t) => t.v_id))
  res.json({ tramites: filas.map((t) => tramitePublico(t, vehiculos)) })
})

api.get('/tramites/:id', (req, res) => {
  const t = leerTramite(req.params.id)
  if (!t) return res.status(404).json({ error: 'No existe ese trámite' })
  res.json({ tramite: t, eventos: eventosDe(t.id) })
})

api.post('/tramites', (req, res) => {
  const dominio = normalizarDominio(req.body?.dominio)
  if (!dominioValido(dominio)) return res.status(400).json({ error: 'Elegí el dominio de la lista de la flota' })
  // Solo dominios de la flota: un dominio mal tipeado generaba un tramite
  // huerfano, sin vehiculo, que despues nadie encontraba.
  if (!enFlota(dominio)) return res.status(400).json({ error: `${dominio} no está en la flota. Si es un vehículo nuevo, primero hay que agregarlo en Flota.` })
  const tipo = String(req.body?.tipo || '')
  const motivo = tipoDe(tipo)?.motivo ? String(req.body?.motivo || '') : ''
  const observaciones = textoLargo(req.body?.observaciones)
  const error = validarTipoYMotivo(tipo, motivo, observaciones)
  if (error) return res.status(400).json({ error })

  const id = db.transaction(() => {
    const info = db.prepare(`INSERT INTO tramites (dominio, tipo, motivo, observaciones, solicitante_id) VALUES (?, ?, ?, ?, ?)`)
      .run(dominio, tipo, motivo, observaciones, req.usuario.id)
    evento(info.lastInsertRowid, req.usuario.id, 'CREADO', { hasta: 'SOLICITADO', texto: observaciones })
    return info.lastInsertRowid
  })()
  res.status(201).json({ tramite: leerTramite(id), eventos: eventosDe(id) })
})

api.patch('/tramites/:id', (req, res) => {
  const t = cargarTramite(req, res)
  if (!t) return
  if (!puedeEditar(req.usuario, t)) return res.status(403).json({ error: 'Ya lo tomó quien gestiona: pedile el cambio con una nota' })

  const nuevo = {
    dominio: req.body?.dominio !== undefined ? normalizarDominio(req.body.dominio) : t.dominio,
    tipo: req.body?.tipo ?? t.tipo,
    motivo: req.body?.motivo ?? t.motivo,
    observaciones: req.body?.observaciones !== undefined ? textoLargo(req.body.observaciones) : t.observaciones,
    nro_registro: req.body?.nroRegistro !== undefined ? texto(req.body.nroRegistro, 60) : t.nro_registro,
  }
  if (!dominioValido(nuevo.dominio)) return res.status(400).json({ error: 'Elegí el dominio de la lista de la flota' })
  if (nuevo.dominio !== t.dominio && !enFlota(nuevo.dominio)) {
    return res.status(400).json({ error: `${nuevo.dominio} no está en la flota. Si es un vehículo nuevo, primero hay que agregarlo en Flota.` })
  }
  if (!tipoDe(nuevo.tipo)?.motivo) nuevo.motivo = ''
  const error = validarTipoYMotivo(nuevo.tipo, nuevo.motivo, nuevo.observaciones)
  if (error) return res.status(400).json({ error })

  const etiquetas = { dominio: 'dominio', tipo: 'trámite', motivo: 'motivo', observaciones: 'observaciones', nro_registro: 'nº de trámite del Registro' }
  const cambiados = Object.keys(nuevo).filter((k) => String(nuevo[k]) !== String(t[k]))
  if (!cambiados.length) return res.json({ tramite: leerTramite(t.id), eventos: eventosDe(t.id) })

  db.transaction(() => {
    db.prepare(`UPDATE tramites SET dominio = @dominio, tipo = @tipo, motivo = @motivo, observaciones = @observaciones,
                nro_registro = @nro_registro, actualizado_en = datetime('now') WHERE id = @id`).run({ ...nuevo, id: t.id })
    const detalle = cambiados.map((k) => {
      if (k === 'observaciones') return 'observaciones'
      if (k === 'tipo') return `trámite: ${tipoDe(nuevo.tipo)?.nombre}`
      if (k === 'motivo') return `motivo: ${MOTIVOS.find((m) => m.clave === nuevo.motivo)?.nombre || 'sin motivo'}`
      return `${etiquetas[k]}: ${nuevo[k] || '—'}`
    })
    evento(t.id, req.usuario.id, 'EDITADO', { texto: `Cambió ${detalle.join(', ')}` })
  })()
  res.json({ tramite: leerTramite(t.id), eventos: eventosDe(t.id) })
})

api.delete('/tramites/:id', (req, res) => {
  const t = cargarTramite(req, res)
  if (!t) return
  const propioSinTomar = t.solicitante_id === req.usuario.id && !t.gestor_id && t.estado === 'SOLICITADO'
  if (!req.usuario.es_admin && !propioSinTomar) {
    return res.status(403).json({ error: 'Solo se puede borrar un trámite propio que todavía nadie tomó' })
  }
  db.prepare('DELETE FROM tramites WHERE id = ?').run(t.id)
  res.json({ ok: true })
})

api.post('/tramites/:id/tomar', requireGestor, (req, res) => {
  const t = cargarTramite(req, res)
  if (!t) return
  if (t.gestor_id === req.usuario.id) return res.json({ tramite: leerTramite(t.id), eventos: eventosDe(t.id) })
  if (t.gestor_id && !req.usuario.es_admin) {
    const quien = db.prepare('SELECT nombre, email FROM usuarios WHERE id = ?').get(t.gestor_id)
    return res.status(409).json({ error: `Ya lo tomó ${quien?.nombre || quien?.email || 'otra persona'}` })
  }
  db.transaction(() => {
    db.prepare("UPDATE tramites SET gestor_id = ?, tomado_en = datetime('now'), actualizado_en = datetime('now') WHERE id = ?")
      .run(req.usuario.id, t.id)
    evento(t.id, req.usuario.id, 'TOMADO', { texto: t.gestor_id ? 'Lo reasignó a su nombre' : '' })
  })()
  res.json({ tramite: leerTramite(t.id), eventos: eventosDe(t.id) })
})

api.post('/tramites/:id/soltar', requireGestor, (req, res) => {
  const t = cargarTramite(req, res)
  if (!t) return
  if (t.gestor_id !== req.usuario.id && !req.usuario.es_admin) return res.status(403).json({ error: 'Lo tiene otra persona' })
  if (t.estado !== 'SOLICITADO') return res.status(400).json({ error: 'Ya está presentado: cambiale el estado en vez de soltarlo' })
  db.transaction(() => {
    db.prepare("UPDATE tramites SET gestor_id = NULL, tomado_en = NULL, actualizado_en = datetime('now') WHERE id = ?").run(t.id)
    evento(t.id, req.usuario.id, 'SOLTADO')
  })()
  res.json({ tramite: leerTramite(t.id), eventos: eventosDe(t.id) })
})

api.post('/tramites/:id/estado', requireGestor, (req, res) => {
  const t = cargarTramite(req, res)
  if (!t) return
  const estado = String(req.body?.estado || '')
  if (!claves(ESTADOS).includes(estado)) return res.status(400).json({ error: 'Estado desconocido' })
  const nota = textoLargo(req.body?.nota, 2000)
  const nroRegistro = req.body?.nroRegistro !== undefined ? texto(req.body.nroRegistro, 60) : t.nro_registro
  if (estado === t.estado && !nota && nroRegistro === t.nro_registro) {
    return res.json({ tramite: leerTramite(t.id), eventos: eventosDe(t.id) })
  }

  db.transaction(() => {
    // Mover un tramite que nadie tenia es tomarlo: no tiene sentido que quede
    // presentado y "sin tomar".
    const gestor = t.gestor_id || req.usuario.id
    db.prepare(`
      UPDATE tramites SET estado = @estado, gestor_id = @gestor,
        tomado_en = COALESCE(tomado_en, datetime('now')),
        presentado_en = CASE WHEN @estado IN ('PRESENTADO', 'EN_ESPERA', 'TERMINADO') THEN COALESCE(presentado_en, datetime('now')) ELSE presentado_en END,
        terminado_en = CASE WHEN @estado = 'TERMINADO' THEN COALESCE(terminado_en, datetime('now')) ELSE NULL END,
        nro_registro = @nro, actualizado_en = datetime('now')
      WHERE id = @id
    `).run({ estado, gestor, nro: nroRegistro, id: t.id })
    if (!t.gestor_id) evento(t.id, req.usuario.id, 'TOMADO')
    if (estado !== t.estado) evento(t.id, req.usuario.id, 'ESTADO', { desde: t.estado, hasta: estado, texto: nota })
    else if (nota) evento(t.id, req.usuario.id, 'NOTA', { texto: nota })
    if (nroRegistro !== t.nro_registro) evento(t.id, req.usuario.id, 'EDITADO', { texto: `Nº de trámite del Registro: ${nroRegistro || '—'}` })
  })()
  res.json({ tramite: leerTramite(t.id), eventos: eventosDe(t.id) })
})

api.post('/tramites/:id/notas', (req, res) => {
  const t = cargarTramite(req, res)
  if (!t) return
  const nota = textoLargo(req.body?.texto, 2000)
  if (!nota) return res.status(400).json({ error: 'Escribí la nota' })
  evento(t.id, req.usuario.id, 'NOTA', { texto: nota })
  tocar(t.id)
  res.json({ tramite: leerTramite(t.id), eventos: eventosDe(t.id) })
})

// DDJJ de extravio. Recibe lo que se ve en el formulario (que puede venir
// completado a mano) y devuelve el PDF. Lo impreso se guarda en el tramite
// para poder reimprimirlo igual, y si quien gestiona lo pide, los datos del
// automotor quedan en la flota para la proxima.
api.post('/tramites/:id/ddjj', (req, res) => {
  const t = cargarTramite(req, res)
  if (!t) return
  if (!tipoDe(t.tipo)?.ddjj) return res.status(400).json({ error: 'La DDJJ de extravío es para reposición de placas o duplicados' })
  if (t.motivo !== 'EXTRAVIO') return res.status(400).json({ error: 'La DDJJ es solo para extravío: cambiá el motivo del trámite' })

  const b = req.body || {}
  const docs = b.documentos || {}
  const datos = {
    lugar: texto(b.lugar, 60) || 'Buenos Aires',
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') ? b.fecha : new Date().toISOString().slice(0, 10),
    seccional: texto(b.seccional, 20),
    documentos: Object.fromEntries(DOCUMENTOS_DDJJ.map(({ clave }) => [clave, texto(docs[clave], 40).toUpperCase()])),
    dominio: t.dominio,
    marca: texto(b.marca, 60).toUpperCase(),
    tipo: texto(b.tipo, 60).toUpperCase(),
    modelo: texto(b.modelo, 90).toUpperCase(),
    motor: texto(b.motor, 60).toUpperCase(),
    declaranteNombre: texto(b.declaranteNombre, 60),
    declaranteDocumento: texto(b.declaranteDocumento, 20),
  }

  db.transaction(() => {
    db.prepare("UPDATE tramites SET ddjj = ?, actualizado_en = datetime('now') WHERE id = ?").run(JSON.stringify(datos), t.id)
    evento(t.id, req.usuario.id, 'DDJJ', { texto: 'Generó la DDJJ de extravío' })

    if (b.guardarEnVehiculo && esGestor(req.usuario)) {
      const v = db.prepare('SELECT * FROM vehiculos WHERE dominio = ?').get(t.dominio)
      const registrales = {
        marca_chasis: datos.marca, tipo_registral: datos.tipo, modelo_registral: datos.modelo, nro_motor: datos.motor,
      }
      if (v) {
        // Solo lo que se completo: un campo que en el formulario quedo vacio
        // no borra lo que la flota ya tenia.
        const sets = Object.entries(registrales).filter(([, val]) => val)
        if (sets.length) {
          db.prepare(`UPDATE vehiculos SET ${sets.map(([k]) => `${k} = ?`).join(', ')}, actualizado_en = datetime('now') WHERE id = ?`)
            .run(...sets.map(([, val]) => val), v.id)
        }
      } else {
        db.prepare(`INSERT INTO vehiculos (dominio, marca_chasis, tipo_registral, modelo_registral, nro_motor)
                    VALUES (?, ?, ?, ?, ?)`).run(t.dominio, ...Object.values(registrales))
      }
    }
  })()

  generarDDJJ(datos).then((pdf) => {
    res.set('Content-Type', 'application/pdf')
    res.set('Content-Disposition', `inline; filename="DDJJ-extravio-${t.dominio}.pdf"`)
    res.send(Buffer.from(pdf))
  }).catch((e) => res.status(500).json({ error: `No se pudo generar el PDF: ${e.message}` }))
})

/* ----------------------------- usuarios ----------------------------- */

const usuarioAdmin = (u) => ({
  ...usuarioPublico(u),
  esGestorPropio: Boolean(u.es_gestor),
  activo: Boolean(u.activo),
  ultimoIngreso: u.ultimo_ingreso,
  creadoEn: u.creado_en,
})

api.get('/usuarios', requireAdmin, (_req, res) => {
  const filas = db.prepare('SELECT * FROM usuarios ORDER BY activo DESC, nombre COLLATE NOCASE').all()
  res.json({ usuarios: filas.map(usuarioAdmin) })
})

// Alta de alguien que no tiene cuenta en el portal. Si despues entra por el
// portal con el mismo email, se le adopta el id del portal (ver
// autoProvisionar) y no queda duplicado.
api.post('/usuarios', requireAdmin, (req, res) => {
  const email = texto(req.body?.email, 120).toLowerCase()
  const nombre = texto(req.body?.nombre, 80)
  const password = String(req.body?.password || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'El email no es válido' })
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña tiene que tener al menos 8 caracteres' })
  if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) return res.status(409).json({ error: 'Ya existe un usuario con ese email' })

  const id = crypto.randomUUID()
  db.prepare('INSERT INTO usuarios (id, email, nombre, password, es_gestor) VALUES (?, ?, ?, ?, ?)')
    .run(id, email, nombre || email, hashPassword(password), req.body?.esGestor ? 1 : 0)
  res.status(201).json({ usuario: usuarioAdmin(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)) })
})

api.patch('/usuarios/:id', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id)
  if (!u) return res.status(404).json({ error: 'No existe ese usuario' })
  const b = req.body || {}
  // Sin esto un admin se puede desactivar a si mismo y dejar la app sin nadie
  // que la administre.
  if (u.id === req.usuario.id && b.activo === false) return res.status(400).json({ error: 'No podés desactivar tu propio usuario' })

  const cambios = {}
  if (b.nombre !== undefined) cambios.nombre = texto(b.nombre, 80) || u.email
  if (b.esGestor !== undefined) cambios.es_gestor = b.esGestor ? 1 : 0
  if (b.activo !== undefined) cambios.activo = b.activo ? 1 : 0
  if (b.password !== undefined && b.password !== '') {
    if (String(b.password).length < 8) return res.status(400).json({ error: 'La contraseña tiene que tener al menos 8 caracteres' })
    cambios.password = hashPassword(String(b.password))
  }
  if (Object.keys(cambios).length) {
    db.prepare(`UPDATE usuarios SET ${Object.keys(cambios).map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`)
      .run({ ...cambios, id: u.id })
  }
  res.json({ usuario: usuarioAdmin(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(u.id)) })
})
