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

/* --------- recordatorio de tramites que no se mueven --------- */

import { armarRecordatorio, fechaSqlite, horaArgentina, recordatoriosPendientes } from '../src/avisos.js'

// Las fechas de SQLite: "AAAA-MM-DD HH:MM:SS" en UTC.
const haceDias = (n, desde = new Date('2026-11-18T12:00:00Z')) =>
  new Date(desde - n * 24 * 60 * 60_000).toISOString().replace('T', ' ').slice(0, 19)

const AHORA = new Date('2026-11-18T12:00:00Z')
const tramite = (extra = {}) => ({
  id: 1, dominio: 'AE229CF', tipo: 'TRANSFERENCIA', estado: 'PRESENTADO', nro_registro: '',
  creado_en: haceDias(30), ultimo_movimiento: haceDias(8), recordado_en: null, ...extra,
})

test('la hora argentina no depende de la zona del contenedor', () => {
  assert.equal(horaArgentina(new Date('2026-11-18T11:00:00Z')), 8)
  assert.equal(horaArgentina(new Date('2026-11-18T02:00:00Z')), 23)
  assert.equal(fechaSqlite('2026-11-18 12:00:00').toISOString(), '2026-11-18T12:00:00.000Z')
  assert.equal(fechaSqlite(null), null)
})

test('recuerda a la semana sin movimiento, y no antes', () => {
  const r = (t) => recordatoriosPendientes([tramite(t)], AHORA).length
  assert.equal(r({ ultimo_movimiento: haceDias(8) }), 1)
  assert.equal(r({ ultimo_movimiento: haceDias(6) }), 0)
  // Sin eventos se cuenta desde que se cargó.
  assert.equal(r({ ultimo_movimiento: null, creado_en: haceDias(10) }), 1)
  assert.equal(r({ ultimo_movimiento: null, creado_en: haceDias(2) }), 0)
})

test('no repite el mismo recordatorio, pero vuelve a la semana', () => {
  const r = (t) => recordatoriosPendientes([tramite(t)], AHORA).length
  assert.equal(r({ ultimo_movimiento: haceDias(8), recordado_en: haceDias(1) }), 0)
  assert.equal(r({ ultimo_movimiento: haceDias(20), recordado_en: haceDias(7) }), 1)
  // Un movimiento posterior al recordatorio reinicia la cuenta.
  assert.equal(r({ ultimo_movimiento: haceDias(8), recordado_en: haceDias(9) }), 1)
})

test('el mail dice qué trámite es y cuánto lleva', () => {
  const m = armarRecordatorio(tramite({ solicitante: 'Juan Pablo', gestor: '', nro_registro: '65184' }), AHORA)
  assert.equal(m.asunto, 'Pendiente hace 8 días: Transferencia de AE229CF')
  assert.match(m.texto, /sigue abierto y hace 8 días que no se mueve/)
  assert.match(m.texto, /Estado: Presentado, sin tomar/)
  assert.match(m.texto, /Nº de trámite del Registro: 65184/)
  assert.match(m.texto, /Lo pidió: Juan Pablo/)
  assert.doesNotMatch(m.texto, /Lo gestiona/)
})
