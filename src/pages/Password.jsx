import { useState } from 'react'
import * as api from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'

// La contrasena de respaldo: sirve solo para entrar a esta app cuando el portal
// esta caido. No reemplaza la del portal ni viaja a las otras aplicaciones.
export default function Password({ onCerrar }) {
  const { usuario, refrescar } = useAuth()
  const yaTiene = usuario?.tienePasswordLocal
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [listo, setListo] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (nueva !== repetir) return setError('Las dos contraseñas nuevas no coinciden.')
    setEnviando(true)
    try {
      await api.definirPassword(actual, nueva)
      await refrescar()
      setListo(true)
      setActual(''); setNueva(''); setRepetir('')
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="tarjeta angosta">
      <header className="seccion-titulo">
        <div>
          <h2>Contraseña de respaldo</h2>
          <p>
            Sirve para entrar a Trámites del Registro cuando el portal no está disponible.
            Es solo de esta aplicación: no cambia la del portal.
          </p>
        </div>
        <button type="button" className="boton boton-suave" onClick={onCerrar}>Volver</button>
      </header>

      <form onSubmit={enviar} className="formulario">
        {yaTiene && (
          <label>
            Contraseña actual
            <input type="password" value={actual} autoComplete="current-password" required
                   onChange={(e) => setActual(e.target.value)} />
          </label>
        )}
        <label>
          Contraseña nueva
          <input type="password" value={nueva} autoComplete="new-password" required minLength={8}
                 onChange={(e) => setNueva(e.target.value)} />
        </label>
        <label>
          Repetir la nueva
          <input type="password" value={repetir} autoComplete="new-password" required minLength={8}
                 onChange={(e) => setRepetir(e.target.value)} />
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        {listo && <p className="nota ok" role="status">Contraseña guardada.</p>}

        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? 'Guardando…' : yaTiene ? 'Cambiar contraseña' : 'Definir contraseña'}
        </button>
      </form>
    </section>
  )
}
