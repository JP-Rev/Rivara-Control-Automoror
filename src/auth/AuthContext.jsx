import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as api from '../api.js'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [verificando, setVerificando] = useState(true)

  const refrescar = useCallback(async () => {
    try {
      const { usuario: u } = await api.me()
      setUsuario(u)
      return u
    } catch {
      setUsuario(null)
      return null
    }
  }, [])

  useEffect(() => { refrescar().finally(() => setVerificando(false)) }, [refrescar])

  const login = useCallback(async (email, password, recordar) => {
    const { usuario: u } = await api.login(email, password, recordar)
    setUsuario(u)
    return u
  }, [])

  // Solo cierra la sesion de respaldo. La del portal se cierra desde el portal:
  // si la borraramos aca, salir de esta app cerraria tambien todas las demas.
  const logout = useCallback(async () => {
    await api.logout().catch(() => {})
    await refrescar()
  }, [refrescar])

  return (
    <Ctx.Provider value={{ usuario, verificando, login, logout, refrescar }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
