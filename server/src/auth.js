import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { db } from './db.js'

// La cookie del portal. Misma clave y mismo formato que en Rivara-Intranet,
// Rivara-HorasExtra y Finanzas Axion: por RFC 6265 las cookies no estan
// aisladas por puerto, asi que la que el portal setea en :1003 llega igual al
// :1010.
export const COOKIE_PORTAL = 'rivara_he'

// La del login propio de respaldo, para entrar cuando el portal esta caido.
// Va aparte a proposito: si el respaldo escribiera 'rivara_he', entrar aca
// pisaria la sesion del portal y de las otras apps.
export const COOKIE_LOCAL = 'rivara_automotor'

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-no-usar-en-produccion'
if (!process.env.JWT_SECRET) {
  console.warn('ATENCION: JWT_SECRET no esta definida, se usa una clave de desarrollo. Tiene que ser el MISMO valor que en el .env del portal.')
}

// Clave derivada, no la misma: asi un token del login de respaldo no vale en el
// portal ni en las otras apps aunque alguien le cambie el nombre a la cookie.
const SECRET_LOCAL = crypto.createHmac('sha256', JWT_SECRET).update('automotor-respaldo').digest('hex')

// secure: false a proposito, igual que el portal: la intranet se sirve por HTTP
// plano en la LAN y una cookie "secure" el navegador no la manda por HTTP.
// Cuando el stack pase a HTTPS (contrato §11) tienen que cambiar todas juntas.
export const cookieOptions = (recordar = true) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: false,
  path: '/',
  ...(recordar ? { maxAge: MAX_AGE_MS } : {}),
})

export const hashPassword = (password) => bcrypt.hashSync(password, 10)
export const verificarPassword = (password, hash) => Boolean(hash) && bcrypt.compareSync(password, hash)

export const firmarTokenLocal = (usuario) =>
  jwt.sign({ sub: usuario.id, email: usuario.email, name: usuario.nombre }, SECRET_LOCAL, { expiresIn: '7d' })

// Preparadas dentro de las funciones y no en el cuerpo del modulo: importar
// este archivo pasa antes de migrate(), asi que en una base nueva las tablas
// todavia no existen.
const buscarPorId = (id) => db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)
const buscarPorEmail = (email) => db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email)

// El portal es la fuente de verdad de quien es quien. Si el token trae un
// usuario que esta app todavia no vio, se lo crea con los datos del token en
// vez de devolver 401: es el "camino b" del README del portal, el mismo que
// usa Finanzas Axion.
export function autoProvisionar(payload) {
  const email = String(payload.email || '').trim()
  if (!payload.sub || !email) return null
  const esAdmin = payload.role === 'ADMIN' ? 1 : 0

  const porId = buscarPorId(payload.sub)
  if (porId) {
    // Solo se escribe si algo cambio: esto corre en cada request.
    if (porId.email !== email || (payload.name && porId.nombre !== payload.name) || porId.es_admin !== esAdmin) {
      db.prepare('UPDATE usuarios SET email = ?, nombre = ?, es_admin = ? WHERE id = ?')
        .run(email, payload.name || porId.nombre, esAdmin, porId.id)
      return buscarPorId(payload.sub)
    }
    return porId
  }

  // Puede existir con otro id si primero se lo creo desde la pantalla de
  // usuarios o como usuario de emergencia. Se le adopta el id del portal para
  // que las dos sesiones sean la misma persona, y los tramites que ya tenia
  // se mueven con el.
  const porEmail = buscarPorEmail(email)
  if (porEmail) {
    db.transaction(() => {
      // foreign_keys esta activo y las FK no tienen ON UPDATE CASCADE: se
      // mueven a mano antes de cambiar la clave.
      db.prepare('INSERT INTO usuarios (id, email, nombre, password, es_admin, es_gestor, activo, creado_en) SELECT ?, email || \'.tmp\', nombre, password, ?, es_gestor, activo, creado_en FROM usuarios WHERE id = ?')
        .run(payload.sub, esAdmin, porEmail.id)
      for (const [tabla, col] of [['tramites', 'solicitante_id'], ['tramites', 'gestor_id'], ['tramite_eventos', 'usuario_id']]) {
        db.prepare(`UPDATE ${tabla} SET ${col} = ? WHERE ${col} = ?`).run(payload.sub, porEmail.id)
      }
      db.prepare('DELETE FROM usuarios WHERE id = ?').run(porEmail.id)
      db.prepare('UPDATE usuarios SET email = ?, nombre = ? WHERE id = ?')
        .run(email, payload.name || porEmail.nombre, payload.sub)
    })()
    return buscarPorId(payload.sub)
  }

  db.prepare('INSERT INTO usuarios (id, email, nombre, es_admin) VALUES (?, ?, ?, ?)')
    .run(payload.sub, email, payload.name || email, esAdmin)
  return buscarPorId(payload.sub)
}

// Se prueba primero la sesion del portal y despues la de respaldo, para que
// entrar por el portal sea siempre lo que manda.
function resolverUsuario(req) {
  const delPortal = req.cookies?.[COOKIE_PORTAL]
  if (delPortal) {
    try {
      const usuario = autoProvisionar(jwt.verify(delPortal, JWT_SECRET))
      if (usuario?.activo) return { usuario, via: 'portal' }
    } catch { /* cookie vencida o firmada con otra clave: se sigue con la de respaldo */ }
  }

  const local = req.cookies?.[COOKIE_LOCAL]
  if (local) {
    try {
      const usuario = buscarPorId(jwt.verify(local, SECRET_LOCAL).sub)
      if (usuario?.activo) return { usuario, via: 'local' }
    } catch { /* vencida o invalida */ }
  }
  return null
}

export function requireAuth(req, res, next) {
  const sesion = resolverUsuario(req)
  if (!sesion) return res.status(401).json({ error: 'No autenticado' })
  req.usuario = sesion.usuario
  req.via = sesion.via
  next()
}

export function sesionOpcional(req, _res, next) {
  const sesion = resolverUsuario(req)
  req.usuario = sesion?.usuario ?? null
  req.via = sesion?.via ?? null
  next()
}

export const esGestor = (u) => Boolean(u?.es_admin || u?.es_gestor)

export function requireGestor(req, res, next) {
  if (!esGestor(req.usuario)) return res.status(403).json({ error: 'Solo quien gestiona los trámites puede hacer esto' })
  next()
}

export function requireAdmin(req, res, next) {
  if (!req.usuario?.es_admin) return res.status(403).json({ error: 'Requiere permisos de administrador' })
  next()
}

export const usuarioPublico = (u, via) => ({
  id: u.id,
  email: u.email,
  nombre: u.nombre,
  esAdmin: Boolean(u.es_admin),
  esGestor: esGestor(u),
  tienePasswordLocal: Boolean(u.password),
  via,
})
