import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarFeed } from '../src/normativa.js'

// Con la forma que publica rss.app (inventado).
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" version="2.0">
<channel>
  <title><![CDATA[Disposiciones y circulares - APROA]]></title>
  <item>
    <title><![CDATA[Circular Nº 12/2026 – Cambios en la inscripción inicial]]></title>
    <link>https://www.aproa.org.ar/circular-12-2026/</link>
    <guid isPermaLink="false">abc123</guid>
    <dc:creator><![CDATA[APROA]]></dc:creator>
    <pubDate>Mon, 16 Nov 2026 13:00:00 GMT</pubDate>
    <description><![CDATA[<div><img src="https://rss.app/x.jpg" style="width: 100%;" /><div>Se informa a los &amp; registros que&nbsp;desde el lunes…</div></div>]]></description>
  </item>
  <item>
    <title>Disposición DN 38/2018 &amp; modificatorias</title>
    <link>https://www.aproa.org.ar/disposicion-38/</link>
    <pubDate>Tue, 03 Nov 2026 10:00:00 GMT</pubDate>
    <description>Texto ordenado</description>
  </item>
  <item>
    <title>Sin fecha</title>
    <link>javascript:alert(1)</link>
  </item>
</channel></rss>`

test('lee los items del feed de rss.app, lo más nuevo arriba', () => {
  const items = interpretarFeed(RSS)
  assert.equal(items.length, 3)
  assert.deepEqual(items[0], {
    titulo: 'Circular Nº 12/2026 – Cambios en la inscripción inicial',
    enlace: 'https://www.aproa.org.ar/circular-12-2026/',
    fecha: '2026-11-16T13:00:00.000Z',
    resumen: 'Se informa a los & registros que desde el lunes…',
  })
  assert.equal(items[1].titulo, 'Disposición DN 38/2018 & modificatorias')
  assert.equal(items[2].fecha, '')
})

test('un enlace que no es http no se usa', () => {
  assert.equal(interpretarFeed(RSS)[2].enlace, '')
})

test('Atom también', () => {
  const atom = `<feed><entry><title>Uno</title><link href="https://x.org/1"/><updated>2026-11-01T00:00:00Z</updated><summary>Res</summary></entry></feed>`
  assert.deepEqual(interpretarFeed(atom), [{ titulo: 'Uno', enlace: 'https://x.org/1', fecha: '2026-11-01T00:00:00.000Z', resumen: 'Res' }])
})
