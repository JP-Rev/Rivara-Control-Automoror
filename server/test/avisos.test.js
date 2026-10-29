import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisosPendientes, instanteDe } from '../src/avisos.js'

const fila = (tr) => ({ id: 1, dominio: 'AE229CF', transferencia: JSON.stringify(tr) })

test('la hora es la argentina, sin importar la zona del servidor', () => {
  assert.equal(instanteDe('2026-11-05', '10:30').toISOString(), '2026-11-05T13:30:00.000Z')
  assert.equal(instanteDe('2026-11-05', ''), null)
})

test('el aviso sale en la media hora anterior al turno, una vez', () => {
  const tr = { fecha: '2026-11-05', hora: '10:30' }
  const a = (iso, t = tr) => avisosPendientes([fila(t)], new Date(iso)).length
  assert.equal(a('2026-11-05T12:59:00Z'), 0) // 10:29 menos 30: todavia no
  assert.equal(a('2026-11-05T13:00:00Z'), 1) // 10:00
  assert.equal(a('2026-11-05T13:29:00Z'), 1)
  assert.equal(a('2026-11-05T13:31:00Z'), 0) // ya paso
  assert.equal(a('2026-11-05T13:10:00Z', { ...tr, avisado: '2026-11-05 10:30' }), 0) // ya avisado
  assert.equal(a('2026-11-05T13:40:00Z', { fecha: '2026-11-05', hora: '11:00', avisado: '2026-11-05 10:30' }), 1) // cambio la hora
})
