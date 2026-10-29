import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chasis7, datosDnrpa } from '../src/dnrpa.js'
import { armarZip } from '../src/zip.js'

// Personas inventadas.
const tramite = {
  id: 7,
  dominio: 'AE229CF',
  vehiculo: { nroChasis: '8AJBA3CD1N1632042' },
  vendedor: { tipo: 'FISICA', apellido: 'Perez', nombres: 'Ana', dni: '12345678', cuil: '27-12345678-0', estadoCivil: 'Soltero' },
  comprador: {
    apellido: 'Gomez', nombres: 'Juan', dni: '23456789', cuil: '20-23456789-6', sexo: 'M', fechaNacimiento: '1985-07-09',
    nacionalidad: 'Argentina', estadoCivil: 'Casado', ocupacion: 'Comerciante',
    calle: 'San Martin', numero: '100', localidad: 'Alberti', partido: 'Alberti', provincia: 'BUENOS AIRES', cp: '',
    conyugeDni: '34567890', conyugeNombre: 'Laura', conyugeApellido: 'Diaz', caracterBien: 'Ganancial',
  },
}

test('datos para el bot con los formatos del sitio del DNRPA', () => {
  const d = datosDnrpa(tramite)
  assert.equal(d.rivara, 'dnrpa-transferencia')
  assert.equal(d.chasis7, '1632042')
  assert.deepEqual(d.contacto, { email: 'jreale@rivara.com.ar', telefono: '2346472000' })
  assert.equal(d.vendedor.cuit, '27123456780')
  assert.equal(d.vendedor.nombre, 'ANA')
  assert.equal(d.comprador.sexo, 'Masculino')
  assert.equal(d.comprador.fechaNacimiento, '09/07/1985')
  assert.deepEqual(d.comprador.conyuge, { dni: '34567890', nombre: 'LAURA', apellido: 'DIAZ', caracter: 'Ganancial' })
  assert.equal(d.comprador.domicilio.calle, 'SAN MARTIN')
  assert.deepEqual(d.comprador.domicilioReal, d.comprador.domicilio)
  assert.deepEqual(d.faltan, ['código postal del comprador'])
})

test('avisa lo que falta y no pide conyuge a un soltero', () => {
  const d = datosDnrpa({ id: 1, dominio: 'AB123CD', vehiculo: null, comprador: { estadoCivil: 'Soltero' } })
  assert.ok(d.faltan.includes('nº de chasis del vehículo'))
  assert.ok(d.faltan.includes('DNI del vendedor'))
  assert.ok(!d.faltan.some((f) => f.includes('cónyuge')))
  assert.deepEqual(d.comprador.conyuge, {})
})

test('vendedor persona juridica', () => {
  const d = datosDnrpa({ ...tramite, vendedor: { tipo: 'JURIDICA', razonSocial: 'Empresa Ejemplo SA', cuil: '30-11111111-1' } })
  assert.deepEqual(d.vendedor, { tipo: 'JURIDICA', razonSocial: 'EMPRESA EJEMPLO SA', cuit: '30111111111' })
})

test('ultimos 7 del chasis', () => {
  assert.equal(chasis7('9bm-958 0 4 1aB123456'), 'AB123456'.slice(-7))
  assert.equal(chasis7(''), '')
})

test('el zip del bot se abre con unzip', { skip: !fs.existsSync('/usr/bin/unzip') && 'sin unzip' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'))
  try {
    const zip = path.join(dir, 'b.zip')
    fs.writeFileSync(zip, armarZip([{ nombre: 'a/uno.txt', datos: Buffer.from('hola\r\n') }, { nombre: 'a/dos ñ.cmd', datos: Buffer.alloc(5000, 'x') }]))
    execFileSync('unzip', ['-q', zip, '-d', dir])
    assert.equal(fs.readFileSync(path.join(dir, 'a/uno.txt'), 'utf8'), 'hola\r\n')
    assert.equal(fs.readFileSync(path.join(dir, 'a/dos ñ.cmd')).length, 5000)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
