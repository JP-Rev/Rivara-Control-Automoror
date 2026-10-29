import { test } from 'node:test'
import assert from 'node:assert/strict'
import { corregirDominio, interpretar } from '../src/documentos.js'

// Textos sinteticos con la forma de los documentos reales (los reales tienen
// datos personales del titular y no van al repo).

const TITULO_PDF = `
                                          TÍTULO DEL AUTOMOTOR
                                     (Decreto Ley 6582/58 - Ley Nro. 14467)
El Registro Nacional de la Propiedad del Automotor certifica que ha sido inscripto con el número de dominio
AA123BC el Automotor, identificado por número de Certificado de Origen 277-000000000/2021
Marca: EX-EL FIERRO
Modelo: 04-SEMIRREMOLQUE PARA TRANSPORTE DE CARGA GENERAL 3E
Tipo: 31-SEMIRREMOLQUE
Mca.Motor: ---                                         Nro.Motor: ---
Mca. Chasis: EL FIERRO                                 Nro. Chasis: 8E9TPS303L1600000
Fabricación Año: 2021                 Modelo Año: 2021                    Fecha de Adquisición: 24/08/2020
Carrocería: ---                       Condición: ---                      Uso: Priv.-Tran. carga interjur.
Número de Título: 012345678
                                                           TITULAR
Razón Social: EMPRESA DE PRUEBA SA
Porcentaje de Titular: 100 %
Número de cédula: AZB00000                Fecha de emisión: 23/09/2026
Para trámites posteriores, deberá dirigirse al Registro Seccional 01292 - ALBERTI
`

// Como sale del OCR de una foto: basura antes de las etiquetas, columnas con
// un solo espacio, O por 0.
const CEDULA_OCR = `
EA REPÚBLICA ARGENTINA
Ls. CÉDULA DE IDENTIFICACIÓN DE VEHÍCULOS
my DOMINIO: AB1O0CD Original e
O MARCA: TOYOTA
Os MODELO: HILUX 4X4 C/S DX 2.4 TDI 6 MT
=— TIPO: PICK-UP
mM) Uso: PRIV.-TRAN. CARGA INTERJUR.
YU CHASIS: 8AJFB8CB9K1OOOOO0
pa MOTOR: 2GD-G000000
TÍ VENCE:  -/=!-
`

const TITULO_FOTO = `TÍTULO DEL AUTOMOTOR
de dominio AES50ZL el Automotor
Mca.Motor. —- Nro.Motor: ---
Mca. Chasis: EL FIERRO Nro. Chasis: 8E9TPS303L 1600000
Fabricación Año: 2021 Modelo Año: 2021 Fecha de Adquisición: 24/08/2020
Carrocería: --- Condición: --- Uso: Priv.-Tran. carga interjur.
Número de Título: 008800000 PR
Razón Social: EMPRESA DE PRUEBA SA
`

test('titulo digital (PDF con texto)', () => {
  const r = interpretar(TITULO_PDF)
  assert.equal(r.documento, 'TITULO')
  assert.equal(r.dominio, 'AA123BC')
  assert.deepEqual(r.campos, {
    marcaChasis: 'EL FIERRO', modeloRegistral: 'SEMIRREMOLQUE PARA TRANSPORTE DE CARGA GENERAL 3E',
    tipoRegistral: 'SEMIRREMOLQUE', categoria: 'ACOPLADO', marcaMotor: '', nroMotor: '', nroChasis: '8E9TPS303L1600000',
    uso: 'PRIV. TRANSP. DE CARGA INTERJ.', anio: '2021', titular: 'EMPRESA DE PRUEBA SA',
    nroTitulo: '012345678', nroCedula: 'AZB00000', seccional: '01292',
  })
})

test('cedula leida por OCR', () => {
  const r = interpretar(CEDULA_OCR)
  assert.equal(r.documento, 'CEDULA')
  assert.equal(r.dominio, 'AB100CD') // la O en posicion de numero es un 0
  assert.equal(r.campos.marcaChasis, 'TOYOTA')
  assert.equal(r.campos.marcaMotor, 'TOYOTA') // la cedula no la trae: la del chasis
  assert.equal(r.campos.modeloRegistral, 'HILUX 4X4 C/S DX 2.4 TDI 6 MT')
  assert.equal(r.campos.tipoRegistral, 'PICK-UP') // PICK- no es un codigo
  assert.equal(r.campos.categoria, 'CAMIONETA')
  assert.equal(r.campos.uso, 'PRIV. TRANSP. DE CARGA INTERJ.')
  assert.equal(r.campos.nroChasis, '8AJFB8CB9K1000000') // un VIN no lleva O
  assert.equal(r.campos.nroMotor, '2GD-G000000')
})

test('titulo por foto: columnas con un solo espacio', () => {
  const r = interpretar(TITULO_FOTO)
  assert.equal(r.dominio, 'AE550ZL') // S en posicion de numero es un 5
  assert.equal(r.campos.marcaChasis, 'EL FIERRO')
  assert.equal(r.campos.nroChasis, '8E9TPS303L1600000')
  assert.equal(r.campos.nroMotor, '')
  assert.equal(r.campos.nroTitulo, '008800000')
  assert.equal(r.campos.titular, 'EMPRESA DE PRUEBA SA')
})

test('dominio: corrige letras y numeros por posicion', () => {
  assert.equal(corregirDominio('AD376JT'), 'AD376JT')
  assert.equal(corregirDominio('A0376JT'), 'AO376JT')
  assert.equal(corregirDominio('EPZ7O2'), 'EPZ702')
  assert.equal(corregirDominio('XX'), '')
})

test('categoria a partir del tipo registral', async () => {
  const { categoriaDeTipo } = await import('../src/documentos.js')
  assert.equal(categoriaDeTipo('TRACTOR DE CARRETERA'), 'CAMION')
  assert.equal(categoriaDeTipo('CHASIS CON CABINA'), 'CAMION')
  assert.equal(categoriaDeTipo('SEMIRREMOLQUE'), 'ACOPLADO')
  assert.equal(categoriaDeTipo('PICK-UP'), 'CAMIONETA')
  assert.equal(categoriaDeTipo('MOTOCICLETA'), '')
})
