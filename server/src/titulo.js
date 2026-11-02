import fs from 'node:fs'

// Baja el Titulo Digital del sitio del DNRPA (Descarga de documentacion) con
// los tres datos de la CAT, en un Chromium sin ventana dentro del contenedor.
//
//   https://www2.jus.gov.ar/dnrpa-site/#!/consultarTramite
//   Tipo de Documento: Titulo Digital
//   Numero de Registro Seccional / Numero de Tramite / Numero de Control Web
//   BUSCAR
//
// Despues de BUSCAR el sitio puede bajar el PDF directo, abrirlo en otra
// pestaña o mostrar un resultado con un boton para descargarlo: se esperan
// las tres cosas y se aprieta lo que diga "Descargar" / "Ver".
//
// El sitio tiene un reCAPTCHA invisible. Si decide mostrar el desafio de
// imagenes, sin ventana nadie lo puede resolver: se corta y se avisa.
//
// Los campos se buscan por lo que se ve (placeholder, etiqueta), no por ids
// internos del sitio.

export const URL_CONSULTA = 'https://www2.jus.gov.ar/dnrpa-site/#!/consultarTramite'
const TIMEOUT_MS = 90_000
// Un navegador por vez: es pesado y el sitio no necesita mas.
let ocupado = false

const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const esPdf = (b) => Buffer.isBuffer(b) && b.subarray(0, 5).toString('latin1') === '%PDF-'

function rutaChromium(env = process.env) {
  const candidatos = [env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean)
  return candidatos.find((r) => fs.existsSync(r)) || ''
}

export class ErrorTitulo extends Error {
  constructor(mensaje, captura) {
    super(mensaje)
    this.captura = captura // PNG de la pantalla, para entender que paso
  }
}

/**
 * @param {{ registro: string, tramite: string, control: string }} datos
 * @param {{ url?: string, ejecutable?: string, log?: (s: string) => void }} opciones
 * @returns {Promise<Buffer>} el PDF del titulo
 */
export async function descargarTitulo(datos, opciones = {}) {
  if (ocupado) throw new ErrorTitulo('Ya se está bajando otro título: probá de nuevo en un minuto.')
  const ejecutable = opciones.ejecutable || rutaChromium()
  if (!ejecutable) throw new ErrorTitulo('No hay Chromium en el contenedor (CHROMIUM_PATH).')
  const log = opciones.log || (() => {})
  ocupado = true

  const { chromium } = await import('playwright-core')
  const navegador = await chromium.launch({
    executablePath: ejecutable,
    headless: true,
    // En el contenedor corre como root: sin el sandbox de Chromium.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  })
  let page
  try {
    const ctx = await navegador.newContext({
      acceptDownloads: true,
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Buenos_Aires',
      viewport: { width: 1366, height: 900 },
      // El de un Chrome comun: el de "HeadlessChrome" lo delata.
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    })
    ctx.setDefaultTimeout(20_000)
    page = await ctx.newPage()

    // Lo que llegue como PDF por cualquier camino (descarga, pestaña nueva,
    // respuesta de la API del sitio) queda aca.
    let pdf = null
    const tomar = async (fuente, obtener) => {
      if (pdf) return
      try {
        const b = await obtener()
        if (esPdf(b)) { pdf = b; log(`PDF por ${fuente}`) }
      } catch {}
    }
    const mirarRespuesta = (r) => {
      if (/application\/(pdf|octet-stream)/i.test(r.headers()['content-type'] || '')) tomar('respuesta', () => r.body())
    }
    ctx.on('response', mirarRespuesta)
    page.on('download', (d) => tomar('descarga', async () => fs.readFileSync(await d.path())))
    ctx.on('page', (p) => {
      p.on('response', mirarRespuesta)
      p.on('download', (d) => tomar('descarga', async () => fs.readFileSync(await d.path())))
    })
    // Una pestaña que muestra el PDF (por URL o como blob: armado en la pagina).
    const bajarDePestana = async (p) => {
      const url = p.url()
      if (!url.startsWith('blob:')) return (await ctx.request.get(url)).body()
      // Un blob: se lee desde la pagina que lo creo (mismo origen) o, si no,
      // desde la pestaña que lo muestra.
      const leer = async (u) => {
        const a = new Uint8Array(await (await fetch(u)).arrayBuffer())
        let s = ''
        for (const x of a) s += String.fromCharCode(x)
        return btoa(s)
      }
      const b64 = await page.evaluate(leer, url).catch(() => p.evaluate(leer, url))
      return Buffer.from(b64, 'base64')
    }

    log('Abriendo la consulta del DNRPA')
    await page.goto(opciones.url || process.env.DNRPA_URL_CONSULTA || URL_CONSULTA, { waitUntil: 'domcontentloaded' })

    // Si la direccion directa no deja en el formulario, se entra por la
    // tarjeta "Descarga de documentacion" del inicio.
    const campoControl = page.getByPlaceholder(/control web/i)
    if (!await campoControl.isVisible({ timeout: 15_000 }).catch(() => false)) {
      log('Entrando por «Descarga de documentación»')
      await page.getByText(/Descarga de documentaci[oó]n/i).first().click()
      await campoControl.waitFor({ state: 'visible' })
    }

    // Tipo de documento: Titulo Digital (suele venir elegido).
    const radio = page.getByLabel(/t[ií]tulo digital/i).first()
    if (await radio.isVisible().catch(() => false)) await radio.check().catch(() => page.getByText(/t[ií]tulo digital/i).first().click())

    await page.getByPlaceholder(/registro seccional/i).fill(datos.registro)
    await page.getByPlaceholder(/n[uú]mero de tr[aá]mite/i).fill(datos.tramite)
    await campoControl.fill(datos.control)
    log('Datos cargados: BUSCAR')
    await page.getByRole('button', { name: /buscar/i }).click()

    // Se espera el PDF; mientras, se mira la pantalla: un boton para
    // descargarlo, un mensaje de error o el desafio del captcha.
    const hasta = Date.now() + TIMEOUT_MS
    const apretados = new Set()
    while (!pdf && Date.now() < hasta) {
      await espera(1500)
      if (pdf) break

      const desafio = page.frameLocator('iframe[title*="desafío" i], iframe[title*="challenge" i], iframe[src*="bframe"]')
        .locator('.rc-imageselect, #rc-imageselect')
      if (await desafio.first().isVisible().catch(() => false)) {
        throw new ErrorTitulo('El DNRPA pidió resolver un captcha de imágenes, y sin ventana no se puede. Probá más tarde o bajalo a mano.', await page.screenshot({ fullPage: true }).catch(() => null))
      }

      const error = await page.locator('.alert-danger, .alert-warning, .toast-error, .help-block, .text-danger, [role=alert]')
        .filter({ hasText: /\S/ }).allInnerTexts().catch(() => [])
      const mensaje = error.map((x) => x.trim()).filter((x) => x && !/falta ingresar/i.test(x)).join(' ')
      if (mensaje && /no se encontr|inexistente|inv[aá]lid|incorrect|no corresponde|error|vencid/i.test(mensaje)) {
        throw new ErrorTitulo(`El DNRPA respondió: ${mensaje}`, await page.screenshot({ fullPage: true }).catch(() => null))
      }

      for (const p of ctx.pages()) {
        if (/^blob:|\.pdf(\?|$)/i.test(p.url())) await tomar('pestaña', () => bajarDePestana(p))
      }
      if (pdf) break

      for (const p of ctx.pages()) {
        const boton = p.locator('a, button').filter({ hasText: /descargar|ver t[ií]tulo|ver documento|^\s*ver\s*$|imprimir/i })
        const n = await boton.count().catch(() => 0)
        for (let i = 0; i < n; i++) {
          const b = boton.nth(i)
          const texto = (await b.innerText().catch(() => '')).trim()
          if (!texto || apretados.has(texto) || !await b.isVisible().catch(() => false)) continue
          apretados.add(texto)
          log(`Aprieto «${texto}»`)
          await b.click({ timeout: 5000 }).catch(() => {})
          break
        }
      }
    }
    if (!pdf) {
      throw new ErrorTitulo('No llegó el PDF del título. Mirá la captura de la pantalla para ver dónde quedó.', await page.screenshot({ fullPage: true }).catch(() => null))
    }
    return pdf
  } catch (e) {
    if (e instanceof ErrorTitulo) throw e
    throw new ErrorTitulo(`No se pudo bajar el título: ${e.message.split('\n')[0]}`, await page?.screenshot({ fullPage: true }).catch(() => null))
  } finally {
    ocupado = false
    await navegador.close().catch(() => {})
  }
}
