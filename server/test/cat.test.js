import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarCat, limpiarDatosCat } from '../src/cat.js'

// Una CAT inventada, con la forma que deja pdftotext -layout.
const CAT = `                   CONSTANCIA DE ASIGNACION DE TITULO
DIRECCIÓN NACIONAL DE LOS REGISTROS DE LA PROPIEDAD DEL AUTOMOTOR Y CRÉDITOS PRENDARIOS
Por la presente el Registro Seccional Nº 01292 se hace constar que se procedió al otorgamiento del elemento Nro.
de control 012345678 perteneciente al Dominio AB123CD
Registro Seccional:               01292
Nro.Trámite:                      12345
Nro.Control Web:           ABCDEF1234
Lugar y Fecha:        ALBERTI, 02/11/2026
`

test('lee los tres datos de la CAT, el dominio y el titulo nuevo', () => {
  assert.deepEqual(interpretarCat(CAT), {
    esCat: true, registro: '01292', tramite: '12345', control: 'ABCDEF1234',
    dominio: 'AB123CD', nroTitulo: '012345678', fecha: '2026-11-02',
  })
})

test('un PDF que no es una CAT', () => {
  const r = interpretarCat('TITULO DEL AUTOMOTOR\nDominio: AB123CD')
  assert.equal(r.esCat, false)
  assert.equal(r.control, '')
})

test('datos escritos a mano', () => {
  assert.deepEqual(limpiarDatosCat({ registro: ' 01292 ', tramite: '12.345', control: 'abc def-1234' }),
    { registro: '01292', tramite: '12345', control: 'ABCDEF1234' })
})
