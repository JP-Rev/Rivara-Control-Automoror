import { test } from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import { leerPlanilla } from '../src/planillas.js'
import { extraerDominios, normalizarDominio } from '../src/dominio.js'

// Libro sintetico con la forma de las planillas reales (sin sus datos).
function libro(hojas) {
  const wb = XLSX.utils.book_new()
  for (const [nombre, filas] of Object.entries(hojas)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

test('dominios: normaliza y separa celdas con dos', () => {
  assert.equal(normalizarDominio('ae 622-bg'), 'AE622BG')
  assert.deepEqual(extraerDominios('AD032EK-AD032EJ').dominios, ['AD032EK', 'AD032EJ'])
  assert.deepEqual(extraerDominios('ADB203OZ'), { dominios: [], invalidos: ['ADB203OZ'] })
})

test('camiones: tractor, tolva y dominio adicional son vehiculos distintos', () => {
  const buffer = libro({
    General: [
      ['Camion N°', 'Marca ', 'Chofer ', 'Estado', 'Dominio Tractor', 'Dominio Tolva/Acoplado', 'Dominio', 'Año'],
      [21, 'Iveco 280 Tector', 'Chofer Uno', '#REF!', 'AA870NO', 'AE477RA', 'MHB003', 6],
      [53, 'Volvo 350', 'Chofer Dos', 'EN USO', 'AH390EN', 'AD032EK-AD032EJ', 'ADB203OZ', 2025],
    ],
  })
  const { registros, avisos } = leerPlanilla(buffer, { archivo: 'Control Camiones.xlsx', categoria: 'CAMION' })
  const por = Object.fromEntries(registros.map((r) => [r.dominio, r]))
  assert.equal(por.AA870NO.rol, 'Tractor')
  assert.equal(por.AA870NO.marca, 'Iveco 280 Tector')
  assert.equal(por.AA870NO.anio, null) // "6" no es un año
  assert.equal(por.AA870NO.estado, '') // #REF! no es un dato
  assert.equal(por.AE477RA.categoria, 'ACOPLADO')
  assert.equal(por.AE477RA.marca, '') // la marca es del tractor
  assert.equal(por.MHB003.rol, 'Dominio adicional')
  assert.ok(por.AD032EK && por.AD032EJ)
  assert.equal(por.AH390EN.anio, 2025)
  assert.equal(registros.length, 6) // ADB203OZ se descarta con aviso
  assert.ok(avisos.some((a) => a.includes('ADB203OZ')))
  assert.ok(avisos.some((a) => a.includes('«6»')))
})

test('camionetas: encabezados por sinonimo, cualquier hoja, la primera manda', () => {
  const buffer = libro({
    Actual1: [
      ['#', 'Camioneta ', 'Modelo', 'Tipo', 'Año', 'Responsable', 'Plan', 'Patente', 'Titular'],
      [2, 'VW Amarok ', 'TDI 140cv', 'C/D 4x4', 2021, 'Persona A', null, 'AE622BG', 'LTV'],
    ],
    Actual: [
      ['Algo arriba del encabezado'],
      ['#', 'Camioneta ', 'Modelo', 'Año', 'Responsable', 'Localidad', 'Patente'],
      [8, 'VW Amarok ', 'TDI 140cv', 2021, 'Persona B', 'Bolivar', 'AE622BG'],
      [1, 'Toyota Hilux', 'DX', 2019, 'Persona C', 'Alberti', 'AD376JU'],
    ],
  })
  const { registros } = leerPlanilla(buffer, { archivo: 'Camionetas.xlsx', categoria: 'CAMIONETA' })
  const por = Object.fromEntries(registros.map((r) => [r.dominio, r]))
  assert.equal(registros.length, 2)
  assert.equal(por.AE622BG.chofer, 'Persona A') // la primera hoja gana
  assert.equal(por.AE622BG.localidad, 'Bolivar') // la segunda solo completa huecos
  assert.equal(por.AE622BG.configuracion, 'C/D 4x4')
  assert.equal(por.AE622BG.unidad, '2')
  assert.equal(por.AD376JU.categoria, 'CAMIONETA')
})
