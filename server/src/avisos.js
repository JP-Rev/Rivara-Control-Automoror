import nodemailer from 'nodemailer'
import { db } from './db.js'

// Aviso por mail media hora antes de una transferencia: el dia y la hora se
// preguntan al imprimir el Anexo 08 D (la DDJJ lleva esa fecha).
//
// SMTP con los mismos nombres de variables que Informar CPE, asi los valores
// se copian tal cual. Sin SMTP_HABILITADO=true no se manda nada (y la app lo
// dice en el formulario).
//
// Se revisa cada minuto. Un aviso se manda una vez por turno: queda anotado
// en el tramite qué turno se aviso, y si se cambia el dia o la hora se vuelve
// a avisar. Si el servidor estuvo apagado y el turno ya paso, no se manda.

const MINUTOS_ANTES = 30
const CADA_MS = 60_000

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
  return { habilitado: c.habilitado && Boolean(c.desde), para: c.para, minutosAntes: MINUTOS_ANTES }
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

const nombre = (p) => (!p ? '' : p.tipo === 'JURIDICA' ? p.razonSocial : [p.apellido, p.nombres].filter(Boolean).join(', '))

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

async function revisar() {
  const c = configMail()
  if (!c.habilitado || !c.desde || !c.para.length) return
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
