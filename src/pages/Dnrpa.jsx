import { useEffect, useState } from 'react'
import * as api from '../api.js'
import Modal from '../componentes/Modal.jsx'
import { Icono } from '../iconos.jsx'

// Transferencia Digital del DNRPA: abre el bot que vuelca los datos del
// tramite en el sitio. El bot corre en la PC (abre Edge ahi), toma los datos
// de la app con un enlace de un solo uso, completa los campos de cada
// pantalla y no aprieta ningun boton: CONFIRMAR, GUARDAR y el captcha son de
// la persona. Ver bot-dnrpa/LEEME.txt.

// La direccion de los datos va en base64url: Windows le pasa el enlace al
// .cmd del bot, y asi no lleva caracteres que la consola interprete (& % ?).
const enlaceDelBot = (url) =>
  `rivara-dnrpa:${btoa(url).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`

export default function Dnrpa({ tramite, catalogo, onCerrar }) {
  const [faltan, setFaltan] = useState(null)
  const [error, setError] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    api.faltanDnrpa(tramite.id).then((r) => setFaltan(r.faltan)).catch((e) => setError(e.message))
  }, [tramite.id])

  async function abrir() {
    setError('')
    setAbriendo(true)
    try {
      const { ruta } = await api.enlaceBotDnrpa(tramite.id)
      window.location.href = enlaceDelBot(new URL(ruta, window.location.origin).href)
      setAbierto(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setAbriendo(false)
    }
  }

  return (
    <Modal titulo={`Transferencia Digital · ${tramite.dominio}`} tamano="ancho" onCerrar={onCerrar}>
      <div className="forma">
        <p className="nota">
          Un bot abre Edge <b>en tu PC</b>, en el sitio del DNRPA, y en cada pantalla completa los campos con los datos
          cargados en este trámite. <b>No aprieta ningún botón</b>: confirmar, guardar, los «Sí / No» y el captcha los hacés vos.
        </p>

        {faltan?.length > 0 && (
          <div className="nota nota--aviso">
            <p><b>Falta en la app</b> (el bot deja esos campos vacíos para completarlos a mano):</p>
            <ul className="avisos-lista">{faltan.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
        {faltan?.length === 0 && <p className="nota ok">Están todos los datos que pide el sitio.</p>}

        <div className="fila-acciones">
          <button type="button" className="boton" disabled={abriendo} onClick={abrir}>
            <Icono clave="enlace" tamano={18} /> {abriendo ? 'Abriendo…' : 'Abrir el bot'}
          </button>
        </div>
        {abierto && (
          <p className="apagado">
            Si el navegador pregunta si abre «Cargar DNRPA», aceptá. Si no pasa nada, el bot no está instalado en esta PC: mirá abajo.
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        <details className="instalar-bot">
          <summary>Primera vez en esta PC: instalar el bot</summary>
          <ol className="pasos-dnrpa">
            <li>Instalar <a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a> (versión LTS).</li>
            <li>
              Bajar el bot y descomprimirlo en una carpeta fija (por ejemplo <code>C:\Rivara\bot-dnrpa</code>).
              <div><a className="boton boton-suave boton-chico" href={api.URL_BOT_DNRPA} download>
                <Icono clave="descarga" tamano={16} /> Bajar el bot (.zip)
              </a></div>
            </li>
            <li>Doble clic en <b>Cargar DNRPA.cmd</b>: instala lo que necesita y queda registrado. Desde ahí, se abre con «Abrir el bot».</li>
          </ol>
        </details>

        <p className="apagado">Contacto que se carga siempre: {catalogo?.dnrpa?.email} · {catalogo?.dnrpa?.telefono}.</p>

        <div className="forma-acciones">
          <button type="button" className="boton boton-suave" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </Modal>
  )
}
