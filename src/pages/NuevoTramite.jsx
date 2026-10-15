import { useState } from 'react'
import * as api from '../api.js'
import DominioInput from '../componentes/DominioInput.jsx'
import Modal from '../componentes/Modal.jsx'

// Alta de un tramite. Lo minimo es el dominio y que hay que hacer: el resto
// lo completa quien lo gestiona.
export default function NuevoTramite({ catalogo, vehiculos, dominioInicial = '', onCreado, onCerrar }) {
  const [dominio, setDominio] = useState(dominioInicial)
  const [tipo, setTipo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const def = catalogo.tipos.find((t) => t.clave === tipo)
  const listo = dominio && tipo && (tipo !== 'OTRO' || observaciones.trim())

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (!dominio) return setError('Ingresá un dominio válido o elegilo de la lista.')
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
          <DominioInput valor={dominioInicial} onCambio={setDominio} vehiculos={vehiculos} autoFocus={!dominioInicial} />
        </label>

        <fieldset className="opciones">
          <legend>¿Qué hay que hacer?</legend>
          <div className="opciones-grilla">
            {catalogo.tipos.map((t) => (
              <label key={t.clave} className={`opcion ${tipo === t.clave ? 'opcion--elegida' : ''}`}>
                <input type="radio" name="tipo" value={t.clave} checked={tipo === t.clave} onChange={() => setTipo(t.clave)} />
                {t.nombre}
              </label>
            ))}
          </div>
        </fieldset>

        {def?.motivo && (
          <fieldset className="opciones">
            <legend>Motivo <span className="apagado">(si no lo sabés, dejalo; lo completa quien gestiona)</span></legend>
            <div className="opciones-fila">
              {catalogo.motivos.map((m) => (
                <label key={m.clave} className={`opcion ${motivo === m.clave ? 'opcion--elegida' : ''}`}>
                  <input type="radio" name="motivo" value={m.clave} checked={motivo === m.clave}
                         onChange={() => setMotivo(m.clave)} />
                  {m.nombre}
                </label>
              ))}
            </div>
            {motivo === 'EXTRAVIO' && (
              <p className="nota">Por extravío se presenta la DDJJ de la Disposición 235/03: se imprime desde el trámite, con los datos del vehículo.</p>
            )}
          </fieldset>
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
