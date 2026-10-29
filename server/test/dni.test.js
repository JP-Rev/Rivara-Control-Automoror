import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularCuil, digitoControl, interpretarDni, partirDomicilio } from '../src/dni.js'

// Un DNI inventado, con los digitos de control calculados como los calcula
// el Registro de las Personas (OACI 9303, formato TD1).
const doc = '12345678<'
const nac = '900215'
const vto = '300101'
const L1 = `IDARG${doc}${digitoControl(doc)}`.padEnd(30, '<')
const L2 = `${nac}${digitoControl(nac)}F${vto}${digitoControl(vto)}ARG`.padEnd(29, '<') + '0'
const L3 = 'PEREZ<GOMEZ<<ANA<MARIA'.padEnd(30, '<')

test('dorso del DNI: MRZ verificada', () => {
  const r = interpretarDni([`DOMICILIO: SAN MARTIN 100 - ALBERTI - ALBERTI - BUENOS\nAIRES\n${L1}\n${L2}\n${L3}`])
  assert.equal(r.verificado, true)
  assert.deepEqual(
    { ...r.persona },
    {
      apellido: 'Perez Gomez', nombres: 'Ana Maria', dni: '12345678', sexo: 'F',
      fechaNacimiento: '1990-02-15', nacionalidad: 'Argentina', vencimiento: '2030-01-01',
      domicilio: 'SAN MARTIN 100 - ALBERTI - ALBERTI - BUENOS AIRES',
      calle: 'SAN MARTIN', numero: '100', piso: '', depto: '', localidad: 'ALBERTI', partido: 'ALBERTI',
      provincia: 'BUENOS AIRES', cp: '',
      cuil: calcularCuil('12345678', 'F'), cuilCalculado: true,
    },
  )
})

test('MRZ con errores tipicos del OCR: O por 0, « por <', () => {
  const sucia = [L1.replace('1234', '1Z34').replace(/</g, '«'), L2.replace('9002', '9OO2'), L3].join('\n')
  const r = interpretarDni([sucia])
  assert.equal(r.persona.dni, '12345678')
  assert.equal(r.persona.fechaNacimiento, '1990-02-15')
  assert.equal(r.verificado, true)
})

test('si un digito no verifica, se avisa', () => {
  const r = interpretarDni([[L1.replace('12345678', '12345679'), L2, L3].join('\n')])
  assert.equal(r.verificado, false)
  assert.ok(r.avisos.some((a) => a.includes('documento')))
})

test('se queda con la lectura que mejor verifica', () => {
  const mala = [L1.replace('12345678', '12345679'), L2, L3].join('\n')
  const buena = [L1, L2, L3].join('\n')
  assert.equal(interpretarDni([mala, buena]).persona.dni, '12345678')
})

test('CUIL calculado', () => {
  assert.equal(calcularCuil('12345678', 'M'), '20-12345678-6')
  assert.equal(calcularCuil('', 'M'), '')
})

test('sin MRZ ni frente reconocible', () => {
  const r = interpretarDni(['una foto cualquiera'])
  assert.equal(r.persona, null)
})

test('domicilio del DNI partido en los campos del DNRPA', () => {
  assert.deepEqual(partirDomicilio('AV. 9 DE JULIO 1234 PISO 3 DTO B - PLATANOS - BERAZATEGUI - BUENOS AIRES'), {
    calle: 'AV. 9 DE JULIO', numero: '1234', piso: '3', depto: 'B', localidad: 'PLATANOS', partido: 'BERAZATEGUI',
    provincia: 'BUENOS AIRES', cp: '',
  })
  const caba = partirDomicilio('CORRIENTES 500 - CAPITAL FEDERAL')
  assert.equal(caba.provincia, 'CIUDAD AUTONOMA DE BUENOS AIRES')
  assert.equal(caba.calle, 'CORRIENTES')
  assert.equal(partirDomicilio('RUTA 5 S/N - ALBERTI - BUENOS AIRES').numero, 'S/N')
  assert.equal(partirDomicilio('').calle, '')
})
