import crypto from 'node:crypto'
import { db } from './db.js'
import { hashPassword } from './auth.js'

// Usuario de emergencia, opcional. Existe para un solo caso: el portal esta
// caido y todavia nadie definio su contrasena de respaldo desde adentro de la
// app, asi que no habria forma de entrar. Mismo criterio que Finanzas Axion.
//
// Los vehiculos NO se siembran aca: la flota sale de las planillas de la red
// (ver sincronizar.js), que se leen al arrancar.
export function seed() {
  const email = String(process.env.AUTOMOTOR_ADMIN_EMAIL || '').trim()
  const password = process.env.AUTOMOTOR_ADMIN_PASSWORD || ''
  if (!email || !password) return

  if (password.length < 8) {
    console.warn('AUTOMOTOR_ADMIN_PASSWORD tiene menos de 8 caracteres: no se crea el usuario de emergencia.')
    return
  }

  const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email)
  if (existente) {
    db.prepare('UPDATE usuarios SET password = ?, es_admin = 1, activo = 1 WHERE id = ?')
      .run(hashPassword(password), existente.id)
    console.log(`Usuario de emergencia actualizado: ${email}`)
    return
  }

  // El id se lo va a adoptar el portal la primera vez que la persona entre por
  // ahi (ver autoProvisionar), asi que arranca con uno propio y transitorio.
  db.prepare('INSERT INTO usuarios (id, email, nombre, password, es_admin) VALUES (?, ?, ?, ?, 1)')
    .run(crypto.randomUUID(), email, email, hashPassword(password))
  console.log(`Usuario de emergencia creado: ${email}`)
}
