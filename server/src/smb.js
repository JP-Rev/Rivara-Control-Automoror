import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Lectura de archivos de la red Windows (\\server\recurso\carpeta\archivo).
//
// Por que smbclient y no montar el recurso en el host: con smbclient la app
// trae todo lo que necesita en su imagen y las credenciales viven en su .env,
// sin tocar el /etc/fstab del servidor ni dejar un punto de montaje que se
// cuelga si \\server no responde. Si algun dia se prefiere montar, alcanza con
// poner una ruta local (/mnt/...) en lugar de la UNC: leerArchivo la lee
// directo del disco.
//
// Las credenciales NUNCA van en la linea de comandos (se verian en `ps`): se
// escriben en un archivo de autenticacion con permisos 600 que se borra al
// terminar.

const TIMEOUT_MS = 30_000

export const esRutaUNC = (ruta) => /^(\\\\|\/\/)/.test(String(ruta || '').trim())

// \\server\Rivara Transportes y logistica\Camiones\Control Camiones.xlsx
//   -> { host: 'server', recurso: 'Rivara Transportes y logistica',
//        carpeta: 'Camiones', archivo: 'Control Camiones.xlsx' }
export function partirUNC(ruta) {
  const partes = String(ruta).trim().replace(/^[\\/]+/, '').split(/[\\/]+/).filter(Boolean)
  if (partes.length < 3) throw new Error(`La ruta «${ruta}» no tiene la forma \\\\servidor\\recurso\\archivo.xlsx`)
  const [host, recurso, ...resto] = partes
  const archivo = resto.pop()
  return { host, recurso, carpeta: resto.join('\\'), archivo }
}

export function configSMB(env = process.env) {
  return {
    usuario: (env.SMB_USUARIO || '').trim(),
    password: env.SMB_PASSWORD || '',
    dominio: (env.SMB_DOMINIO || '').trim(),
    // El contenedor no resuelve nombres NetBIOS ("server") por broadcast: si
    // el DNS de la red tampoco lo conoce, hay que darle la IP.
    ip: (env.SMB_IP || '').trim(),
    // Para servidores viejos que solo hablan SMB1: SMB_PROTOCOLO_MINIMO=NT1
    protocoloMinimo: (env.SMB_PROTOCOLO_MINIMO || '').trim(),
  }
}

// Las comillas no se pueden escapar dentro de un comando de smbclient; un
// nombre con comillas no deberia existir, pero si existe se rechaza en vez de
// armar un comando roto.
const citar = (s) => {
  if (s.includes('"')) throw new Error(`El nombre «${s}» tiene comillas, smbclient no lo puede pedir.`)
  return `"${s}"`
}

// Un nombre "parecido" al pedido: sin mayusculas, tildes, espacios ni puntos
// sobrantes. Asi "Control Camiones. xlsx" encuentra "Control Camiones.xlsx".
const parecido = (nombre) => nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

function correr(args, cfg) {
  return new Promise((resolve, reject) => {
    execFile('smbclient', args, { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const salida = `${stdout || ''}\n${stderr || ''}`
      if (err) {
        if (err.code === 'ENOENT') return reject(new Error('smbclient no está instalado en el contenedor.'))
        if (err.killed) return reject(new Error(`\\\\${cfg.host} no respondió en ${TIMEOUT_MS / 1000} segundos.`))
        return reject(new Error(traducirError(salida, cfg)))
      }
      // smbclient a veces sale con 0 aunque un "get" haya fallado.
      const status = salida.match(/NT_STATUS_[A-Z_]+/)
      if (status) return reject(new Error(traducirError(salida, cfg)))
      resolve(salida)
    })
  })
}

function traducirError(salida, cfg) {
  const status = salida.match(/NT_STATUS_[A-Z_]+/)?.[0]
  const donde = `\\\\${cfg.host}\\${cfg.recurso}`
  const conocidos = {
    NT_STATUS_LOGON_FAILURE: `Windows rechazó usuario o contraseña al entrar a ${donde}. Revisá SMB_USUARIO, SMB_PASSWORD y SMB_DOMINIO en el .env.`,
    NT_STATUS_ACCOUNT_LOCKED_OUT: 'La cuenta de Windows está bloqueada.',
    NT_STATUS_PASSWORD_EXPIRED: 'La contraseña de Windows venció: cambiala en una PC y actualizá SMB_PASSWORD.',
    NT_STATUS_ACCESS_DENIED: `El usuario no tiene permiso de lectura sobre ${donde}.`,
    NT_STATUS_BAD_NETWORK_NAME: `No existe el recurso compartido «${cfg.recurso}» en \\\\${cfg.host}.`,
    NT_STATUS_OBJECT_NAME_NOT_FOUND: 'No se encontró el archivo.',
    NT_STATUS_OBJECT_PATH_NOT_FOUND: 'No se encontró la carpeta.',
    NT_STATUS_NO_SUCH_FILE: 'No se encontró el archivo.',
    NT_STATUS_SHARING_VIOLATION: 'El archivo está bloqueado por otro programa.',
    NT_STATUS_CONNECTION_REFUSED: `\\\\${cfg.host} rechazó la conexión al puerto 445.`,
    NT_STATUS_HOST_UNREACHABLE: `No se llega a \\\\${cfg.host} desde el servidor.`,
    NT_STATUS_IO_TIMEOUT: `\\\\${cfg.host} no respondió.`,
    NT_STATUS_UNSUCCESSFUL: `No se pudo conectar con \\\\${cfg.host}. Si es un nombre NetBIOS, definí SMB_IP con su dirección.`,
    NT_STATUS_NOT_SUPPORTED: `\\\\${cfg.host} no acepta el protocolo: si es un Windows viejo, probá SMB_PROTOCOLO_MINIMO=NT1.`,
    NT_STATUS_INVALID_NETWORK_RESPONSE: `\\\\${cfg.host} respondió algo inesperado: si es un Windows viejo, probá SMB_PROTOCOLO_MINIMO=NT1.`,
  }
  if (status) return `${conocidos[status] || `Error de Windows al leer ${donde}.`} (${status})`
  if (/Name or service not known|not known|resolve/i.test(salida)) {
    return `No se puede resolver el nombre «${cfg.host}». Definí SMB_IP con la dirección de ese equipo.`
  }
  const linea = salida.split('\n').map((l) => l.trim()).find(Boolean)
  return `smbclient falló: ${linea || 'sin detalle'}`
}

function argumentosBase(cfg, archivoAuth) {
  const args = [`//${cfg.host}/${cfg.recurso}`, '-A', archivoAuth, '-g']
  if (cfg.ip) args.push('-I', cfg.ip)
  if (cfg.protocoloMinimo) args.push('--option', `client min protocol=${cfg.protocoloMinimo}`)
  return args
}

/**
 * Baja un archivo de una ruta UNC a un Buffer.
 * Si el nombre exacto no existe, busca en la carpeta uno parecido (mismo nombre
 * sin espacios, tildes ni mayusculas) y devuelve cual uso.
 */
export async function leerUNC(ruta, env = process.env) {
  const unc = partirUNC(ruta)
  const cfg = { ...configSMB(env), ...unc }
  if (!cfg.usuario || !cfg.password) {
    throw new Error('Faltan SMB_USUARIO y SMB_PASSWORD en el .env: son las credenciales de Windows para leer la red.')
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smb-'))
  const archivoAuth = path.join(tmp, 'auth')
  const destino = path.join(tmp, 'archivo')
  const lineas = [`username = ${cfg.usuario}`, `password = ${cfg.password}`]
  if (cfg.dominio) lineas.push(`domain = ${cfg.dominio}`)
  fs.writeFileSync(archivoAuth, lineas.join('\n') + '\n', { mode: 0o600 })

  const base = argumentosBase(cfg, archivoAuth)
  const rutaRemota = (nombre) => (cfg.carpeta ? `${cfg.carpeta}\\${nombre}` : nombre)

  try {
    let usado = cfg.archivo
    try {
      await correr([...base, '-c', `get ${citar(rutaRemota(usado))} ${citar(destino)}`], cfg)
    } catch (e) {
      if (!/OBJECT_NAME_NOT_FOUND|NO_SUCH_FILE/.test(e.message)) throw e
      // Nombre exacto no esta: se lista la carpeta y se busca uno parecido.
      const listado = await correr([...base, '-c', `ls ${citar(rutaRemota('*'))}`], cfg)
      const nombres = [...listado.matchAll(/^\s{2}(.+?)\s+[ADHNRS]*\s+\d+\s+\w{3} \w{3}\s+\d+ [\d:]+ \d{4}$/gm)].map((m) => m[1])
      const buscado = parecido(cfg.archivo)
      const candidato = nombres.find((n) => parecido(n) === buscado)
      if (!candidato) {
        const xlsx = nombres.filter((n) => /\.xls[xm]?$/i.test(n))
        throw new Error(
          `No está «${cfg.archivo}» en \\\\${cfg.host}\\${cfg.recurso}\\${cfg.carpeta}.` +
          (xlsx.length ? ` Hay: ${xlsx.join(', ')}.` : ''),
        )
      }
      usado = candidato
      await correr([...base, '-c', `get ${citar(rutaRemota(usado))} ${citar(destino)}`], cfg)
    }
    const buffer = fs.readFileSync(destino)
    return { buffer, nombre: usado, ruta: `\\\\${cfg.host}\\${cfg.recurso}\\${rutaRemota(usado)}` }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// UNC por SMB, o una ruta del disco si el recurso se monto en el host.
export async function leerArchivo(ruta, env = process.env) {
  if (esRutaUNC(ruta)) return leerUNC(ruta, env)
  const buffer = fs.readFileSync(ruta)
  return { buffer, nombre: path.basename(ruta), ruta }
}

export const hashDe = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')
