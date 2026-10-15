import { useState } from 'react'
import * as api from '../api.js'
import DominioInput from '../componentes/DominioInput.jsx'
import { EstadoChip } from '../componentes/Estado.jsx'
import Modal from '../componentes/Modal.jsx'
import Selector from '../componentes/Selector.jsx'

// Alta de un tramite. Lo minimo es el dominio y que hay que hacer: el resto
// lo completa quien lo gestiona. Los dos campos se buscan escribiendo: el
// dominio por patente, chofer, unidad o marca; el tramite por como lo dice la
// gente ("chapa", "cédula verde", "08").
export default function NuevoTramite({ catalogo, vehiculos, tramites = [], dominioInicial = '', onCreado, onAbrir, onAgregarVehiculo, onCerrar }) {
  const [dominio, setDominio] = useState(dominioInicial)
  // Reposicion de placas por defecto: es, por lejos, el que mas se carga.
  const [tipo, setTipo] = useState('REPOSICION_PLACAS')
  const [motivo, setMotivo] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const def = catalogo.tipos.find((t) => t.clave === tipo)
  const listo = dominio && tipo && (tipo !== 'OTRO' || observaciones.trim())

  // Lo que ese dominio ya tiene en curso: el error mas comun es cargar dos
  // veces lo mismo desde dos personas distintas.
  const abiertos = dominio ? tramites.filter((t) => t.dominio === dominio && t.estado !== 'TERMINADO') : []
  const repetido = abiertos.find((t) => t.tipo === tipo)

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (!dominio) return setError('Elegí el vehículo de la lista de la flota.')
    if (!tipo) return setError('Elegí qué trámite hay que hacer.')
    setEnviando(true)
    try {
      const { tramite } = await api.crearTramite({ dominio, tipo, motivo: def?.motivo ? motivo : '', observaciones })
      onCreado(tramite)
    } catch (err) {
      setError(err.message)
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Nuevo trámite" tamano="medio" onCerrar={onCerrar}>
      <form className="forma" onSubmit={enviar}>
        <label>
          Dominio
          <DominioInput valor={dominioInicial} onCambio={setDominio} vehiculos={vehiculos} autoFocus={!dominioInicial}
                        onAgregar={onAgregarVehiculo} />
        </label>

        {abiertos.length > 0 && (
          <div className={`nota ${repetido ? 'error' : ''}`}>
            <p>
              {repetido
                ? <>Ese dominio ya tiene un trámite de <b>{def?.nombre.toLowerCase()}</b> abierto. ¿No es el mismo?</>
                : <>{dominio} ya tiene {abiertos.length === 1 ? 'un trámite abierto' : `${abiertos.length} trámites abiertos`}:</>}
            </p>
            <ul className="mini-lista">
              {abiertos.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => onAbrir(t.id)}>
                    <span>#{t.id} · {catalogo.tipos.find((x) => x.clave === t.tipo)?.nombre}</span>
                    <EstadoChip tramite={t} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label>
          ¿Qué hay que hacer?
          <Selector valor={tipo} opciones={catalogo.tipos} onCambio={setTipo}
                    placeholder="Escribí: transferencia, chapa, cédula, título, venta…" />
        </label>

        {def?.motivo && (
          <label>
            <span>Motivo <span className="apagado">(si no lo sabés, dejalo; lo completa quien gestiona)</span></span>
            <Selector valor={motivo} opciones={catalogo.motivos} onCambio={setMotivo} placeholder="Extravío, robo o deterioro" />
            {motivo === 'EXTRAVIO' && (
              <small className="ayuda-campo">Por extravío se presenta la DDJJ de la Disposición 235/03: se imprime desde el trámite, con los datos del vehículo.</small>
            )}
          </label>
        )}

        <label>
          <span>Observaciones {tipo === 'OTRO' ? '' : <span className="apagado">(opcional)</span>}</span>
          <textarea rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                    placeholder={tipo === 'OTRO' ? 'Contá qué trámite hay que hacer' : 'Comprador, urgencia, dónde está la documentación…'} />
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="forma-acciones">
          <button type="submit" className="boton" disabled={enviando || !listo}>
            {enviando ? 'Cargando…' : 'Cargar trámite'}
          </button>
          <button type="button" className="boton boton-suave" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
