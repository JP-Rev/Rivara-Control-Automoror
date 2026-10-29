// Bot de la Transferencia Digital del DNRPA (https://www2.jus.gov.ar/dnrpa-site/).
//
// Abre Edge en la PC (no en el servidor: el captcha y los botones los aprieta
// una persona), y en cada pantalla del tramite COMPLETA LOS CAMPOS con los
// datos que bajo la app (dnrpa-<DOMINIO>.json). No aprieta ningun boton: ni
// CONFIRMAR, ni SIGUIENTE, ni GUARDAR, ni los SI/NO de los carteles. Se queda
// mirando: cuando la pagina cambia de pantalla, completa la nueva.
//
// Los campos se buscan por su etiqueta en pantalla ("Nombre", "Estado Civil",
// "Partido/Dpto"...) y por el titulo de la seccion en la que estan ("Datos de
// Conyuge", "Domicilio Legal"...), no por ids internos del sitio: si el DNRPA
// cambia el codigo pero no lo que se ve, sigue andando.
//
// Un campo se completa UNA vez por pantalla: si despues lo corregis a mano, el
// bot no lo vuelve a pisar.
//
// Uso:  node dnrpa.mjs [dnrpa-AE229CF.json]
//   Sin archivo, toma el dnrpa-*.json mas nuevo de la carpeta Descargas.
//   --navegador=chrome   usa Chrome en lugar de Edge
//   --ejecutable=RUTA    un Chromium cualquiera (pruebas)
//   --url=URL            otra direccion de inicio (pruebas)

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const URL_DNRPA = 'https://www2.jus.gov.ar/dnrpa-site/#!/'

const opciones = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--'))
  .map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || true] }))
const sueltos = process.argv.slice(2).filter((a) => !a.startsWith('--'))

function archivoDeDatos() {
  if (sueltos[0]) return path.resolve(sueltos[0])
  const descargas = path.join(os.homedir(), 'Downloads')
  const candidatos = fs.existsSync(descargas)
    ? fs.readdirSync(descargas).filter((n) => /^dnrpa-.*\.json$/i.test(n))
      .map((n) => path.join(descargas, n)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : []
  if (!candidatos.length) {
    throw new Error(`No hay ningun dnrpa-*.json en ${descargas}. Bajalo desde el tramite en la app («Cargar en el DNRPA») o arrastralo sobre este programa.`)
  }
  return candidatos[0]
}

/* ----------------------- que va en cada campo ----------------------- */

// Cada regla: en que seccion (null = cualquiera), que etiqueta (regex sobre el
// texto normalizado: minusculas, sin tildes ni signos), si es un <select> o un
// campo de texto, y el valor. La primera regla que coincide gana.
export function reglas(d, ruta) {
  const c = d.comprador || {}
  const v = d.vendedor || {}
  const tel = d.contacto?.telefono || ''
  const mail = d.contacto?.email || ''
  const R = (seccion, etiqueta, valor, tag, opcional = false) => ({ seccion, etiqueta, valor: valor ?? '', tag: tag || null, opcional })

  const contacto = [
    R('contacto', '^repetir e ?mail', mail),
    R('contacto', '^e ?mail', mail),
    R('contacto', '^telefono', tel),
  ]
  const domicilio = (sec, dom = {}) => [
    R(sec, '^provincia', dom.provincia, 'select'),
    R(sec, '^partido', dom.partido),
    R(sec, '^localidad', dom.localidad),
    R(sec, '^calle', dom.calle),
    R(sec, '^(nro|numero)', dom.numero),
    R(sec, '^piso', dom.piso, null, true),
    R(sec, '^(dpto|depto|departamento)', dom.depto, null, true),
    R(sec, '^(cp|codigo)', dom.cp),
  ]
  const vehiculo = [
    R(null, '^(dominio|patente)', d.dominio),
    R(null, 'ultimos 7 digitos|chasis', d.chasis7),
  ]

  if (/comprador/.test(ruta)) {
    const cy = c.conyuge || {}
    return [
      R('conyuge', '^documento', cy.dni ? 'DNI' : '', 'select'),
      R('conyuge', '^documento', cy.dni, 'input'),
      R('conyuge', '^nombre', cy.nombre),
      R('conyuge', '^apellido', cy.apellido),
      R('conyuge', '^caracter', cy.caracter, 'select'),
      ...domicilio('legal', c.domicilio),
      ...domicilio('real', c.domicilioReal || c.domicilio),
      ...contacto,
      R(null, '^documento', 'DNI', 'select'),
      R(null, '^documento', c.dni, 'input'),
      R(null, '^sexo', c.sexo, 'select'),
      R(null, '^nombre', c.nombre),
      R(null, '^apellido', c.apellido),
      R(null, '^estado civil', c.estadoCivil, 'select'),
      R(null, '^nacionalidad', c.nacionalidad, 'select'),
      R(null, '^fecha', c.fechaNacimiento),
      R(null, '^(cuit|cuil)', c.cuit),
      R(null, '^ocupacion', c.ocupacion),
      R(null, '^porcentaje', '100'),
    ]
  }
  if (/vendedor/.test(ruta)) {
    return [
      ...contacto,
      R(null, '^documento', v.dni ? 'DNI' : '', 'select'),
      R(null, '^documento', v.dni, 'input'),
      R(null, '^(razon social|denominacion|nombre o razon)', v.razonSocial),
      R(null, '^(cuit|cuil)', v.cuit),
      R(null, '^nombre', v.nombre),
      R(null, '^apellido', v.apellido),
      R(null, '^estado civil', v.estadoCivil, 'select'),
      R(null, '^porcentaje', '100'),
    ]
  }
  return vehiculo
}

/* --------------------- lo que corre DENTRO de la pagina --------------------- */

// Recorre los campos visibles que el bot todavia no completo, les busca la
// etiqueta y la seccion, y devuelve que poner en cada uno. Les deja una marca
// (data-rivara) para encontrarlos despues desde Playwright.
export function planEnPagina({ reglas }) {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const st = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'
  }
  const texto = (el) => norm(el.innerText || el.textContent)
  const controles = [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => !['hidden', 'button', 'submit', 'checkbox', 'radio', 'file', 'image', 'reset'].includes(el.type))
    // Los de solo lectura tambien: la fecha con calendario suele serlo.
    .filter((el) => !el.disabled && visible(el))
  const antes = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  const encabezados = [...document.querySelectorAll('h1, h2, h3, h4, h5, legend')].filter(visible)
  const seccionDe = (el) => {
    const h = encabezados.filter((x) => antes(x, el)).pop()
    const t = h ? texto(h) : ''
    if (/conyuge/.test(t)) return 'conyuge'
    if (/domicilio legal|figura en su documento/.test(t)) return 'legal'
    if (/domicilio real|reside/.test(t)) return 'real'
    if (/contacto/.test(t)) return 'contacto'
    return 'general'
  }

  const etiquetaDe = (el) => {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      if (l && texto(l)) return texto(l)
    }
    // Sube por los contenedores hasta encontrar una etiqueta; si hay varias
    // (una fila con Nro, Piso, Dpto y CP), la ultima que esta antes del campo.
    let n = el
    for (let i = 0; i < 5 && n.parentElement; i++) {
      n = n.parentElement
      if (n.querySelectorAll('input, select, textarea').length > 6) break
      const ls = [...n.querySelectorAll('label, .control-label, .col-form-label')]
        .filter((l) => !l.contains(el) && texto(l) && antes(l, el))
      if (ls.length) return texto(ls.pop())
    }
    return ''
  }

  const plan = []
  let marca = Number(document.documentElement.dataset.rivaraSiguiente || 0)
  for (const el of controles) {
    if (el.dataset.rivara) continue
    const seccion = seccionDe(el)
    const etiqueta = etiquetaDe(el)
    const placeholder = norm(el.placeholder)
    const tag = el.tagName === 'SELECT' ? 'select' : 'input'
    const regla = reglas.find((r) =>
      (!r.seccion ? seccion !== 'conyuge' && seccion !== 'legal' && seccion !== 'real' && seccion !== 'contacto' : r.seccion === seccion) &&
      (!r.tag || r.tag === tag) &&
      (new RegExp(r.etiqueta).test(etiqueta) || (!etiqueta && new RegExp(r.etiqueta).test(placeholder))))
    if (!regla) continue
    const id = String(++marca)
    el.dataset.rivara = id
    if (!regla.valor) { if (!regla.opcional) plan.push({ id, etiqueta: etiqueta || placeholder, seccion, sinDato: true }); continue }
    let opcion = null
    if (tag === 'select') {
      // La opcion por su texto: igual, o que una empiece con la otra
      // ("Casado" / "Casado/a").
      const buscado = norm(regla.valor)
      const ops = [...el.options].filter((o) => !o.disabled)
      const o = ops.find((x) => norm(x.text) === buscado) ||
        ops.find((x) => norm(x.text) && (norm(x.text).startsWith(buscado) || buscado.startsWith(norm(x.text))))
      opcion = o ? o.text : null
    }
    plan.push({ id, tag, valor: regla.valor, opcion, etiqueta: etiqueta || placeholder, seccion })
  }
  document.documentElement.dataset.rivaraSiguiente = String(marca)
  return plan
}

// Cartel chico arriba a la derecha: que hizo el bot en esta pantalla.
function cartelEnPagina({ titulo, lineas }) {
  let c = document.getElementById('rivara-bot')
  if (!c) {
    c = document.createElement('div')
    c.id = 'rivara-bot'
    c.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483647;max-width:340px;padding:10px 34px 10px 12px;' +
      'background:#0f5132;color:#fff;font:13px/1.35 system-ui,sans-serif;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25)'
    document.body.appendChild(c)
  }
  c.innerHTML = ''
  const x = document.createElement('span')
  x.textContent = '×'
  x.title = 'Cerrar'
  x.style.cssText = 'position:absolute;top:4px;right:10px;cursor:pointer;font-size:18px'
  x.onclick = () => c.remove()
  const t = document.createElement('b')
  t.textContent = titulo
  c.append(x, t)
  for (const l of lineas) {
    const p = document.createElement('div')
    p.textContent = l
    p.style.marginTop = '4px'
    c.appendChild(p)
  }
}

/* ------------------------------ completar ------------------------------ */

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function completarCampo(page, paso) {
  const el = page.locator(`[data-rivara="${paso.id}"]`)
  if (paso.tag === 'select') {
    if (!paso.opcion) return false
    await el.selectOption({ label: paso.opcion })
    return true
  }
  try {
    await el.fill(String(paso.valor), { timeout: 3000 })
  } catch {
    // Campos con calendario que no se dejan escribir: valor por JS, con los
    // eventos que escucha Angular.
    await el.evaluate((e, v) => {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), 'value').set
      set.call(e, v)
      e.dispatchEvent(new Event('input', { bubbles: true }))
      e.dispatchEvent(new Event('change', { bubbles: true }))
    }, String(paso.valor))
  }
  await el.dispatchEvent('blur').catch(() => {})
  // Autocompletado (Partido, Localidad): si aparece una lista con una opcion
  // igual a lo escrito, se elige. Elegir de la lista no es un boton del
  // tramite; si no hay una igual, queda escrito y se elige a mano.
  await espera(350)
  const opcion = page.locator('ul.dropdown-menu li:visible, [role="listbox"] [role="option"]:visible, .ui-autocomplete li:visible')
    .filter({ hasText: new RegExp(`^\\s*${String(paso.valor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') })
  if (await opcion.count() === 1) await opcion.click().catch(() => {})
  return true
}

export async function completarPantalla(page, datos) {
  const ruta = new URL(page.url()).hash
  const todas = reglas(datos, ruta)
  const hechos = []
  const sinDato = []
  const sinOpcion = []
  // Varias pasadas: algunos campos aparecen recien al completar otros
  // (Estado Civil "Casado" muestra los del conyuge; la Provincia, el Partido).
  for (let pasada = 0; pasada < 6; pasada++) {
    const plan = await page.evaluate(planEnPagina, { reglas: todas }).catch(() => [])
    if (!plan.length) break
    for (const paso of plan) {
      if (paso.sinDato) { sinDato.push(paso.etiqueta); continue }
      try {
        if (await completarCampo(page, paso)) hechos.push(paso.etiqueta)
        else sinOpcion.push(`${paso.etiqueta} (${paso.valor})`)
      } catch (e) {
        sinOpcion.push(`${paso.etiqueta}: ${e.message.split('\n')[0]}`)
      }
    }
    await espera(700)
  }
  return { ruta, hechos, sinDato, sinOpcion }
}

/* -------------------------------- main -------------------------------- */

async function main() {
  const archivo = archivoDeDatos()
  const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'))
  if (datos.rivara !== 'dnrpa-transferencia') throw new Error(`${archivo} no es un archivo de datos del bot DNRPA.`)

  console.log(`Datos: ${path.basename(archivo)} · dominio ${datos.dominio}`)
  if (datos.faltan?.length) console.log(`Faltan en la app (completalos a mano en el sitio): ${datos.faltan.join(', ')}`)

  let pw
  try {
    pw = await import('playwright-core')
  } catch {
    pw = await import('playwright')
  }
  const perfil = path.join(process.env.LOCALAPPDATA || os.homedir(), 'RivaraBotDnrpa', 'perfil')
  fs.mkdirSync(perfil, { recursive: true })
  const lanzar = {
    headless: Boolean(opciones.oculto),
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
    // Sin la barra "un software automatizado controla este navegador" y sin
    // avisarle al sitio que hay un robot: el captcha lo resuelve una persona.
    ignoreDefaultArgs: ['--enable-automation'],
  }
  if (opciones.ejecutable) lanzar.executablePath = opciones.ejecutable
  else lanzar.channel = opciones.navegador === 'chrome' ? 'chrome' : 'msedge'

  const ctx = await pw.chromium.launchPersistentContext(perfil, lanzar)
  const page = ctx.pages()[0] || await ctx.newPage()
  await page.goto(opciones.url || URL_DNRPA)
  console.log('Navegador abierto. Entrá a «Transferencia Digital» y seguí con los botones: el bot completa cada pantalla.')
  console.log('Para terminar, cerrá el navegador.')

  let cerrado = false
  ctx.on('close', () => { cerrado = true })

  // Se mira cada pestaña del sitio; cada pantalla nueva (cambio de #!/ruta o
  // campos nuevos) se completa. Los campos ya tocados quedan marcados.
  while (!cerrado) {
    for (const p of ctx.pages()) {
      if (p.isClosed()) continue
      const url = p.url()
      if (!/jus\.gov\.ar|^file:|localhost|127\.0\.0\.1/.test(url)) continue
      const r = await completarPantalla(p, datos).catch(() => null)
      if (!r || (!r.hechos.length && !r.sinDato.length && !r.sinOpcion.length)) continue
      const lineas = []
      if (r.hechos.length) lineas.push(`Completé ${r.hechos.length} campo${r.hechos.length > 1 ? 's' : ''}. Revisalos y seguí vos con los botones.`)
      if (r.sinDato.length) lineas.push(`Sin dato en la app: ${[...new Set(r.sinDato)].join(', ')}.`)
      if (r.sinOpcion.length) lineas.push(`No pude elegir: ${r.sinOpcion.join(', ')}.`)
      console.log(`[${r.ruta}] ${lineas.join(' ')}`)
      await p.evaluate(cartelEnPagina, { titulo: `Rivara · ${datos.dominio}`, lineas }).catch(() => {})
    }
    await espera(800)
  }
}

// Como programa (no cuando lo importa una prueba).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((e) => {
  if (/closed|Target page|has been closed/i.test(e.message)) process.exit(0)
  console.error(`\nNo se pudo seguir: ${e.message}`)
  if (/Executable doesn't exist|msedge|chrome/i.test(e.message)) {
    console.error('No se encontró Edge. Probá con --navegador=chrome si usás Chrome.')
  }
  process.exit(1)
})
