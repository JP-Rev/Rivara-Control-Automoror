import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import XLSX from 'xlsx'

// Base temporal: db.js lee DATA_DIR al importarse.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'automotor-test-'))
process.env.DATA_DIR = dir
const archivo = path.join(dir, 'Camionetas.xlsx')
process.env.PLANILLA_CAMIONETAS = archivo
process.env.PLANILLA_CAMIONES = path.join(dir, 'no-existe.xlsx')

const { db, migrate } = await import('../src/db.js')
const { sincronizar } = await import('../src/sincronizar.js')
migrate()

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ['#', 'Camioneta', 'Modelo', 'Año', 'Responsable', 'Patente'],
  [1, 'Toyota Hilux', 'DX Pack 2.5', 2020, 'A', 'AE229CF'], // formato viejo -> se actualiza
  [2, 'Toyota Hilux', 'DX Pack 2.5', 2020, 'B', 'AE229CE'], // ya tiene otro modelo -> no se toca
  [3, 'VW Amarok', 'TDI 140cv', 2021, 'C', 'AE622BG'],      // vacio -> se completa
  [4, 'VW Amarok', 'TDI 140cv', 2021, 'D', 'AE622BH'],      // nuevo
]), 'Actual1')
fs.writeFileSync(archivo, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))

const insertar = db.prepare("INSERT INTO vehiculos (dominio, categoria, marca, modelo, marca_chasis, fuente) VALUES (?, 'CAMIONETA', ?, ?, ?, 'camionetas')")
insertar.run('AE229CF', 'Toyota Hilux', 'DX Pack 2.5', '')
insertar.run('AE229CE', 'Toyota', 'HILUX SRV 2.8', 'TOYOTA ARGENTINA')
insertar.run('AE622BG', '', '', '')

test('la sincronizacion no reemplaza un modelo que ya esta', async () => {
  const r = await sincronizar({ forzar: true })
  assert.ok(r.resultados.find((x) => x.fuente === 'camionetas').ok)
  const v = (d) => db.prepare('SELECT * FROM vehiculos WHERE dominio = ?').get(d)

  assert.equal(v('AE229CF').marca, 'Toyota')
  assert.equal(v('AE229CF').modelo, 'Hilux DX Pack 2.5')
  assert.equal(v('AE229CF').marca_chasis, 'TOYOTA')

  assert.equal(v('AE229CE').modelo, 'HILUX SRV 2.8')
  assert.equal(v('AE229CE').marca_chasis, 'TOYOTA ARGENTINA')
  assert.equal(v('AE229CE').chofer, 'B') // el resto si se actualiza

  assert.equal(v('AE622BG').marca, 'Volkswagen')
  assert.equal(v('AE622BG').modelo, 'Amarok TDI 140cv')
  assert.equal(v('AE622BH').modelo, 'Amarok TDI 140cv')
})

test.after(() => fs.rmSync(dir, { recursive: true, force: true }))
