// Normativa: las disposiciones y circulares de APROA, por el feed RSS que se
// armo en rss.app (https://www.aproa.org.ar/disposiciones-y-circulares/).
//
// El feed lo baja el servidor y no el navegador: rss.app no siempre deja que
// otra pagina lo lea directo (CORS), y asi se pide una vez para todos. Se
// guarda en memoria NORMATIVA_MINUTOS (30 por defecto); si al renovarlo
// falla, se sigue mostrando lo ultimo que se leyo, con el aviso.

const FEED_POR_DEFECTO = 'https://rss.app/feeds/jlunKmfQl7QhkylE.xml'
const TIMEOUT_MS = 15_000

let cache = null // { items, leidoEn, error }
let pidiendo = null

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decodificar(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
}

// El contenido de <etiqueta>…</etiqueta>, con o sin CDATA.
function etiqueta(xml, nombre) {
  const m = xml.match(new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`, 'i'))
  if (!m) return ''
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return cdata ? cdata[1] : decodificar(m[1])
}

// La descripcion viene en HTML (rss.app suele poner una imagen y el texto):
// a la pantalla va solo el texto.
const textoPlano = (html) => decodificar(String(html || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

const enlaceSeguro = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '')

/** RSS 2.0 (y Atom, por si el feed cambia) -> [{ titulo, enlace, fecha, resumen }] */
export function interpretarFeed(xml) {
  const texto = String(xml || '')
  const bloques = [...texto.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => m[1])
  const atom = !bloques.length ? [...texto.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]) : []
  const items = [...bloques, ...atom].map((b) => {
    const enlaceAtom = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1]
    const fechaCruda = etiqueta(b, 'pubDate') || etiqueta(b, 'dc:date') || etiqueta(b, 'published') || etiqueta(b, 'updated')
    const fecha = fechaCruda && !Number.isNaN(Date.parse(fechaCruda)) ? new Date(fechaCruda).toISOString() : ''
    const resumen = textoPlano(etiqueta(b, 'description') || etiqueta(b, 'summary') || etiqueta(b, 'content'))
    return {
      titulo: textoPlano(etiqueta(b, 'title')) || '(sin título)',
      enlace: enlaceSeguro(etiqueta(b, 'link') || decodificar(enlaceAtom) || etiqueta(b, 'guid')),
      fecha,
      resumen: resumen.length > 400 ? `${resumen.slice(0, 397)}…` : resumen,
    }
  })
  // Lo mas nuevo arriba; lo que no tiene fecha, al final en el orden del feed.
  return items.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
}

async function leerFeed(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'Rivara-Automotor/1.0 (lector de normativa)', Accept: 'application/rss+xml, application/xml, text/xml' },
  })
  if (!res.ok) throw new Error(`el feed respondió ${res.status}`)
  const items = interpretarFeed(await res.text())
  if (!items.length) throw new Error('el feed no trae ninguna disposición')
  return items
}

/** Lo que muestra la seccion Normativa. forzar: lee ya, sin esperar el cache. */
export async function obtenerNormativa({ forzar = false } = {}) {
  const url = (process.env.NORMATIVA_FEED_URL || FEED_POR_DEFECTO).trim()
  const minutos = Number(process.env.NORMATIVA_MINUTOS) || 30
  // Si la ultima lectura fallo, se reintenta recien a los 2 minutos: un feed
  // caido no se pide en cada visita.
  const vigente = cache && (cache.error
    ? Date.now() - Date.parse(cache.intentoEn) < 2 * 60_000
    : Date.now() - Date.parse(cache.leidoEn) < minutos * 60_000)
  if (vigente && !forzar) return { ...cache, fuente: url }

  // Dos pedidos a la vez comparten la misma lectura.
  if (!pidiendo) {
    pidiendo = leerFeed(url)
      .then((items) => {
        const ahora = new Date().toISOString()
        cache = { items, leidoEn: ahora, intentoEn: ahora, error: '' }
      })
      .catch((e) => {
        const error = `No se pudo leer el feed de normativa: ${e.name === 'TimeoutError' ? 'no respondió a tiempo' : e.message}.`
        const ahora = new Date().toISOString()
        cache = { items: cache?.items || [], leidoEn: cache?.leidoEn || '', intentoEn: ahora, error }
      })
      .finally(() => { pidiendo = null })
  }
  await pidiendo
  return { ...cache, fuente: url }
}
