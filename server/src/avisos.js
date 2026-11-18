import nodemailer from 'nodemailer'
import { db } from './db.js'
import { ESTADOS, tipoDe } from './catalogo.js'

// Dos avisos por mail:
//
// 1. Media hora antes de una transferencia: el dia y la hora se preguntan al
//    imprimir el Anexo 08 D (la DDJJ lleva esa fecha). Se manda una vez por
//    turno: queda anotado en el tramite que turno se aviso, y si se cambia el
//    dia o la hora se vuelve a avisar. Si el servidor estuvo apagado y el
//    turno ya paso, no se manda.
//
// 2. Recordatorio de un tramite que sigue abierto: a la semana sin ningun
//    movimiento (ni cambio de estado, ni nota, ni edicion), un mail por
//    tramite, y otro cada semana mientras siga quieto. El mail no cuenta como
//    movimiento: solo se anota en tramites.recordado_en, no en el seguimiento.
//
// SMTP con los mismos nombres de variables que Informar CPE, asi los valores
// se copian tal cual. Sin SMTP_HABILITADO=true no se manda nada (y la app lo
// dice en el formulario).

const MINUTOS_ANTES = 30
const CADA_MS = 60_000
const DIA_MS = 24 * 60 * 60_000
// Entre las 8 y las 20 de Argentina: ni de madrugada, ni se pierde el aviso
// si el servidor estuvo apagado a las 8.
const DESDE_HORA = 8
const HASTA_HORA = 20

export const diasRecordatorio = (env = process.env) => Math.max(1, Number(env.RECORDATORIO_DIAS) || 7)

// Argentina es UTC-3 todo el año: asi no depende de la zona del contenedor.
export const horaArgentina = (d = new Date()) => (d.getUTCHours() + 21) % 24

// "2026-11-05 13:00:00" de SQLite es UTC.
export function fechaSqlite(v) {
  if (!v) return null
  const s = String(v)
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function configMail(env = process.env) {
  return {
    habilitado: /^(1|true|si|sí|yes)$/i.test(env.SMTP_HABILITADO || ''),
    servidor: (env.SMTP_SERVER || 'smtp.office365.com').trim(),
    puerto: Number(env.SMTP_PORT || 587),
    usuario: (env.SMTP_USER || '').trim(),
    clave: env.SMTP_PASS || '',
    desde: (env.SMTP_FROM || env.SMTP_USER || '').trim(),
    para: (env.AVISO_TRANSFERENCIA_PARA || 'jreale@rivara.com.ar').split(',').map((x) => x.trim()).filter(Boolean),
  }
}

// Lo que muestra la app: si hay aviso y a quien va. Nada de credenciales.
export function estadoAvisos() {
  const c = configMail()
  return {
    habilitado: c.habilitado && Boolean(c.desde),
    para: c.para,
    minutosAntes: MINUTOS_ANTES,
    diasRecordatorio: diasRecordatorio(),
  }
}

// "2026-11-05" + "10:30" en hora argentina (UTC-3, sin horario de verano),
// sin depender de la zona horaria del contenedor.
export const instanteDe = (fecha, hora) =>
  /^\d{4}-\d{2}-\d{2}$/.test(fecha || '') && /^\d{2}:\d{2}$/.test(hora || '') ? new Date(`${fecha}T${hora}:00-03:00`) : null

/** Transferencias cuyo aviso toca ahora: entre 30 minutos antes y el turno. */
export function avisosPendientes(filas, ahora = new Date()) {
  return filas.filter((t) => {
    const tr = t.transferencia ? JSON.parse(t.transferencia) : null
    const turno = instanteDe(tr?.fecha, tr?.hora)
    if (!turno || tr.avisado === `${tr.fecha} ${tr.hora}`) return false
    const falta = turno - ahora
    return falta > 0 && falta <= MINUTOS_ANTES * 60_000
  })
}

/**
 * Tramites abiertos que hace una semana (o mas) no se mueven y a los que
 * toca recordar: nunca se recordo, o se recordo hace otra semana, o hubo un
 * movimiento despues del ultimo recordatorio.
 * @param filas  tramites con ultimo_movimiento (MAX de sus eventos) y recordado_en
 */
export function recordatoriosPendientes(filas, ahora = new Date(), dias = diasRecordatorio()) {
  const plazo = dias * DIA_MS
  return filas.filter((t) => {
    const movimiento = fechaSqlite(t.ultimo_movimiento || t.creado_en)
    if (!movimiento || ahora - movimiento < plazo) return false
    const recordado = fechaSqlite(t.recordado_en)
    // Un movimiento posterior al ultimo recordatorio reinicia la cuenta.
    if (recordado && recordado > movimiento && ahora - recordado < plazo) return false
    return true
  })
}

const nombre = (p) => (!p ? '' : p.tipo === 'JURIDICA' ? p.razonSocial : [p.apellido, p.nombres].filter(Boolean).join(', '))

const nombreEstado = (c) => ESTADOS.find((e) => e.clave === c)?.nombre || c
const enDias = (n) => (n === 1 ? '1 día' : `${n} días`)

export function armarRecordatorio(t, ahora = new Date()) {
  const movimiento = fechaSqlite(t.ultimo_movimiento || t.creado_en)
  const dias = Math.floor((ahora - movimiento) / DIA_MS)
  const tipo = tipoDe(t.tipo)?.nombre || t.tipo
  const estado = t.gestor_id ? nombreEstado(t.estado) : `${nombreEstado(t.estado)}, sin tomar`
  const url = (process.env.APP_URL || '').trim()
  const si = (cond, texto) => (cond ? texto : null)
  const lineas = [
    `El trámite #${t.id} (${tipo} de ${t.dominio}) sigue abierto y hace ${enDias(dias)} que no se mueve.`,
    '',
    `Dominio: ${t.dominio}`,
    `Trámite: ${tipo}`,
    `Estado: ${estado}`,
    si(t.nro_registro, `Nº de trámite del Registro: ${t.nro_registro}`),
    si(t.solicitante, `Lo pidió: ${t.solicitante}`),
    si(t.gestor, `Lo gestiona: ${t.gestor}`),
    '',
    url ? `Verlo en la app: ${url}` : 'Trámites del Registro Automotor.',
  ].filter((l) => l !== null)
  return { asunto: `Pendiente hace ${enDias(dias)}: ${tipo} de ${t.dominio}`, texto: lineas.join('\n') }
}

function armarMail(t) {
  const tr = JSON.parse(t.transferencia)
  const vendedor = nombre(t.vendedor ? JSON.parse(t.vendedor) : null)
  const comprador = nombre(t.comprador ? JSON.parse(t.comprador) : null)
  const fecha = tr.fecha.split('-').reverse().join('/')
  const si = (cond, texto) => (cond ? texto : null)
  const lineas = [
    `A las ${tr.hora} (${fecha}) es la transferencia de ${t.dominio}.`,
    '',
    `Dominio: ${t.dominio}`,
    si(vendedor, `Vendedor: ${vendedor}`),
    si(comprador, `Comprador: ${comprador}`),
    si(tr.anexo?.registro, `Registro: ${tr.anexo?.registro}`),
    si(tr.solicitud08d, `Solicitud 08 D Nº ${tr.solicitud08d}`),
    '',
    `Trámite #${t.id} en Trámites del Registro Automotor.`,
  ].filter((l) => l !== null)
  return { asunto: `Transferencia ${t.dominio} a las ${tr.hora}`, texto: lineas.join('\n') }
}

let transporte = null
function transportador(c) {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: c.servidor,
      port: c.puerto,
      secure: c.puerto === 465,
      auth: c.usuario ? { user: c.usuario, pass: c.clave } : undefined,
    })
  }
  return transporte
}

export async function enviarMail({ asunto, texto }, c = configMail()) {
  await transportador(c).sendMail({ from: c.desde, to: c.para.join(', '), subject: asunto, text: texto })
}

const SELECT_PENDIENTES = `
  SELECT t.*,
         s.nombre AS solicitante_nombre, s.email AS solicitante_email,
         g.nombre AS gestor_nombre, g.email AS gestor_email,
         (SELECT MAX(e.creado_en) FROM tramite_eventos e WHERE e.tramite_id = t.id) AS ultimo_movimiento
    FROM tramites t
    LEFT JOIN usuarios s ON s.id = t.solicitante_id
    LEFT JOIN usuarios g ON g.id = t.gestor_id
   WHERE t.estado <> 'TERMINADO'
`

// Los recordatorios no corren cada minuto como el aviso del turno: nada
// cambia tan rapido, y si el SMTP esta caido no se reintenta sin parar.
const CADA_RECORDATORIOS_MS = 15 * 60_000
let ultimaRevision = 0

async function revisarRecordatorios(c, ahora = new Date()) {
  if (ahora - ultimaRevision < CADA_RECORDATORIOS_MS) return
  ultimaRevision = ahora.getTime()
  const hora = horaArgentina(ahora)
  if (hora < DESDE_HORA || hora >= HASTA_HORA) return
  const filas = db.prepare(SELECT_PENDIENTES).all().map((t) => ({
    ...t,
    solicitante: t.solicitante_nombre || t.solicitante_email || '',
    gestor: t.gestor_nombre || t.gestor_email || '',
  }))
  for (const t of recordatoriosPendientes(filas, ahora)) {
    try {
      await enviarMail(armarRecordatorio(t, ahora), c)
      // Solo la marca del recordatorio: no toca actualizado_en ni el
      // seguimiento, para no reiniciar la cuenta de "sin movimiento".
      db.prepare("UPDATE tramites SET recordado_en = datetime('now') WHERE id = ?").run(t.id)
      console.log(`Recordatorio enviado: trámite #${t.id} (${t.dominio})`)
    } catch (e) {
      // Se reintenta en la vuelta siguiente.
      console.warn(`No se pudo mandar el recordatorio del trámite #${t.id}: ${e.message}`)
    }
  }
}

async function revisar() {
  const c = configMail()
  if (!c.habilitado || !c.desde || !c.para.length) return
  await revisarRecordatorios(c)
  const filas = db.prepare("SELECT * FROM tramites WHERE tipo = 'TRANSFERENCIA' AND estado <> 'TERMINADO' AND transferencia IS NOT NULL").all()
  for (const t of avisosPendientes(filas)) {
    try {
      await enviarMail(armarMail(t), c)
      // Se anota el turno avisado; se relee por si el tramite cambio mientras
      // salia el mail.
      const actual = JSON.parse(db.prepare('SELECT transferencia FROM tramites WHERE id = ?').get(t.id).transferencia || '{}')
      const tr = JSON.parse(t.transferencia)
      actual.avisado = `${tr.fecha} ${tr.hora}`
      db.prepare('UPDATE tramites SET transferencia = ? WHERE id = ?').run(JSON.stringify(actual), t.id)
      console.log(`Aviso de transferencia enviado: ${t.dominio} ${actual.avisado}`)
    } catch (e) {
      // Se reintenta en la vuelta siguiente, mientras no pase el turno.
      console.warn(`No se pudo mandar el aviso de ${t.dominio}: ${e.message}`)
    }
  }
}

export function iniciarAvisos() {
  const c = configMail()
  if (!c.habilitado) {
    console.log('Avisos por mail apagados (SMTP_HABILITADO no está en true).')
    return
  }
  let corriendo = false
  const vuelta = async () => {
    if (corriendo) return
    corriendo = true
    try { await revisar() } finally { corriendo = false }
  }
  setInterval(vuelta, CADA_MS).unref()
  vuelta()
}
