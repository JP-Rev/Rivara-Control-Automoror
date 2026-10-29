import { useEffect, useState } from 'react'
import * as api from '../api.js'
import Modal from '../componentes/Modal.jsx'
import { Icono } from '../iconos.jsx'

// Transferencia Digital del DNRPA: baja los datos del tramite y el bot que
// los vuelca en el sitio. El bot corre en la PC (abre Edge ahi), completa los
// campos de cada pantalla y no aprieta ningun boton: CONFIRMAR, GUARDAR y el
// captcha son de la persona. Ver bot-dnrpa/LEEME.txt.

export default function Dnrpa({ tramite, catalogo, onCerrar }) {
  const [faltan, setFaltan] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.faltanDnrpa(tramite.id).then((r) => setFaltan(r.faltan)).catch((e) => setError(e.message))
  }, [tramite.id])

  return (
    <Modal titulo={`Transferencia Digital · ${tramite.dominio}`} tamano="ancho" onCerrar={onCerrar}>
      <div className="forma">
        <p className="nota">
          Un bot abre Edge <b>en tu PC</b>, en el sitio del DNRPA, y en cada pantalla completa los campos con los datos de
          este trámite. <b>No aprieta ningún botón</b>: confirmar, guardar, los «Sí / No» y el captcha los hacés vos.
        </p>

        {error && <p className="error" role="alert">{error}</p>}
        {faltan?.length > 0 && (
          <div className="nota nota--aviso">
            <p><b>Falta en la app</b> (el bot deja esos campos vacíos para completarlos a mano):</p>
            <ul className="avisos-lista">{faltan.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
        {faltan?.length === 0 && <p className="nota ok">Están todos los datos que pide el sitio.</p>}

        <ol className="pasos-dnrpa">
          <li>
            <b>Una sola vez en cada PC:</b> instalar <a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a> (LTS),
            bajar el bot y descomprimirlo en una carpeta fija (por ejemplo <code>C:\Rivara\bot-dnrpa</code>).
            <div><a className="boton boton-suave boton-chico" href={api.URL_BOT_DNRPA} download>
              <Icono clave="descarga" tamano={16} /> Bajar el bot (.zip)
            </a></div>
          </li>
          <li>
            Bajar los datos de esta transferencia: queda <code>dnrpa-{tramite.dominio}.json</code> en Descargas.
            <div><a className="boton boton-chico" href={api.urlDatosDnrpa(tramite.id)} download>
              <Icono clave="descarga" tamano={16} /> Bajar los datos
            </a></div>
          </li>
          <li>
            Doble clic en <b>Cargar DNRPA.cmd</b>. Entrá a Transferencia Digital y seguí con los botones: en cada pantalla el bot
            completa los campos y avisa en un cartel verde qué cargó.
          </li>
        </ol>

        <p className="apagado">
          Contacto que se carga siempre: {catalogo?.dnrpa?.email} · {catalogo?.dnrpa?.telefono}. El archivo de datos tiene datos
          personales: borralo de Descargas cuando el trámite esté presentado.
        </p>

        <div className="forma-acciones">
          <button type="button" className="boton boton-suave" onClick={onCerrar}>Cerrar</button>
        </div>
      </div>
    </Modal>
  )
}
