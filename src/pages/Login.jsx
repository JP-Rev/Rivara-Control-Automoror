import { useState } from 'react'
import logo from '../assets/logo-rivara.png'
import { useAuth } from '../auth/AuthContext.jsx'

// El portal es la puerta normal. Este formulario es el respaldo para cuando el
// portal esta caido, asi que la pantalla lo dice en ese orden y no al reves:
// el antecedente de Horas Extra fue quedar en "Cargando..." sin forma de entrar.
export default function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recordar, setRecordar] = useState(true)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const urlPortal = `${window.location.protocol}//${window.location.hostname}:1003/`

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await login(email, password, recordar)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login">
      <aside className="login-marca">
        <div>
          <span className="login-disco"><img src={logo} alt="Compañía Agrícola Rivara" /></span>
          <h2>Los trámites del Registro, en un solo lugar.</h2>
          <p className="login-bajada">
            Transferencias, reposición de placas, duplicados de título y cédula y
            denuncias de venta de toda la flota: quién lo pidió, en qué estado está y qué falta.
          </p>
        </div>
        <p className="login-pie">Trámites del Registro Automotor</p>
      </aside>

      <main className="login-panel">
        <div className="login-form">
          <div className="login-titulo">
            <p className="eyebrow">Acceso</p>
            <h1>Entrar</h1>
          </div>

          <a className="boton boton-portal" href={urlPortal}>Ir al portal</a>
          <p className="login-legal">
            La forma normal de entrar es desde el portal: si ya iniciaste sesión ahí,
            esta aplicación te reconoce sola y no hace falta otra contraseña.
          </p>

          <div className="separador"><span>o, si el portal no está disponible</span></div>

          <form onSubmit={enviar} className="login-campos">
            <label>
              Usuario
              <input type="email" value={email} autoComplete="username" required
                     onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Contraseña de respaldo
              <input type="password" value={password} autoComplete="current-password" required
                     onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
              Mantener la sesión abierta
            </label>

            {error && <p className="error" role="alert">{error}</p>}

            <button type="submit" className="boton" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar con contraseña'}
            </button>
          </form>

          <p className="login-legal">
            La contraseña de respaldo se define desde adentro de la aplicación, entrando
            por el portal, o te la da quien administra la app si no tenés cuenta en el
            portal. Si nunca te dieron una, no tenés — entrá por el portal.
          </p>
        </div>
      </main>
    </div>
  )
}
