import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cookieParser from 'cookie-parser'
import { migrate } from './db.js'
import { seed } from './seed.js'
import { api } from './routes.js'
import { sincronizar } from './sincronizar.js'
import { iniciarAvisos } from './avisos.js'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.resolve(aqui, '../../dist')
const PORT = Number(process.env.PORT || 80)

migrate()
seed()

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '64kb' }))
app.use(cookieParser())

app.use('/api', api)
// Una ruta de /api que no existe tiene que dar un 404 en JSON, no el index.html
// del catch-all de abajo: si no, un error de tipeo en la URL le llega al front
// como HTML y el fetch falla al parsearlo.
app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado' }))
app.use('/api', (err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es demasiado grande (máximo 15 MB)' })
  console.error(err)
  res.status(500).json({ error: 'Error inesperado del servidor' })
})

// Los assets de Vite llevan hash en el nombre, asi que son inmutables.
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { immutable: true, maxAge: '1y' }))
app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }))

// El equivalente al try_files del nginx del contrato (§3.3): sin esto, F5 en
// una ruta interna devuelve 404 porque no existe ese archivo.
const indexHtml = path.join(PUBLIC_DIR, 'index.html')
app.get('*', (_req, res) => {
  if (!fs.existsSync(indexHtml)) return res.status(500).send('Falta el build del front.')
  res.set('Cache-Control', 'no-cache').sendFile(indexHtml)
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tramites del Registro Automotor escuchando en el puerto ${PORT}`)
  // El seed de la flota: se lee la red apenas arranca, sin frenar el arranque.
  // Si \\server no responde, la app levanta igual y el error queda visible en
  // la pantalla de Flota.
  sincronizar({ forzar: true }).catch((e) => console.warn('Sincronizacion inicial:', e.message))
  iniciarAvisos()
})
