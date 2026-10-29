import zlib from 'node:zlib'

// Un .zip minimo (deflate, sin carpetas ni cifrado) para bajar el bot del
// DNRPA desde la app sin sumar una dependencia: cabecera local + datos por
// archivo, directorio central al final (formato PKWARE APPNOTE).

const dosFechaHora = (d) => ({
  hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  fecha: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
})

/** @param {{ nombre: string, datos: Buffer }[]} archivos */
export function armarZip(archivos, cuando = new Date()) {
  const { hora, fecha } = dosFechaHora(cuando)
  const locales = []
  const centrales = []
  let offset = 0
  for (const { nombre, datos } of archivos) {
    const n = Buffer.from(nombre, 'utf8')
    const comprimido = zlib.deflateRawSync(datos)
    const crc = zlib.crc32(datos)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version para extraer
    local.writeUInt16LE(0x0800, 6) // nombres en UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(hora, 10)
    local.writeUInt16LE(fecha, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(datos.length, 22)
    local.writeUInt16LE(n.length, 26)
    locales.push(local, n, comprimido)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(hora, 12)
    central.writeUInt16LE(fecha, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(comprimido.length, 20)
    central.writeUInt32LE(datos.length, 24)
    central.writeUInt16LE(n.length, 28)
    central.writeUInt32LE(offset, 42)
    centrales.push(central, n)

    offset += local.length + n.length + comprimido.length
  }
  const directorio = Buffer.concat(centrales)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(archivos.length, 8)
  fin.writeUInt16LE(archivos.length, 10)
  fin.writeUInt32LE(directorio.length, 12)
  fin.writeUInt32LE(offset, 16)
  return Buffer.concat([...locales, directorio, fin])
}
