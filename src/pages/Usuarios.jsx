import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../api.js'
import { Buscador, FiltroMarcas, Resumen } from '../componentes/Filtros.jsx'
import Modal from '../componentes/Modal.jsx'
import { haceCuanto } from '../formato.js'
import { useFiltrado, useRecordado } from '../filtros.js'
import { Icono } from '../iconos.jsx'

const INICIAL = { q: '', gestores: false, inactivos: false }

// Quien entra por el portal aparece solo la primera vez que abre la app, con
// el rol que le da el portal (administrador o no). Lo propio de esta app es
// quien gestiona los tramites: eso se marca aca.
export default function Usuarios({ usuario }) {
  const [probando, setProbando] = useState(false)
  const [pruebaMail, setPruebaMail] = useState(null)
  const [usuarios, setUsuarios] = useState(null)
  const [error, setError] = useState('')
  const [alta, setAlta] = useState(false)
  const [clave, setClave] = useState(null)
  const [filtro, setFiltro] = useRecordado('automotor.usuarios', INICIAL)

  const cargar = useCallback(async () => {
    try {
      setUsuarios((await api.usuarios()).usuarios)
    } catch (e) {
      setError(e.message)
    }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const config = useMemo(() => ({
    texto: { campos: { nombre: (u) => u.nombre, email: (u) => u.email } },
    marcas: { gestores: (u) => u.esGestor, inactivos: (u) => !u.activo },
  }), [])
  const { resultado, conteos, hayFiltros } = useFiltrado(usuarios || [], config, filtro)

  async function cambiar(u, datos) {
    setError('')
    try {
      const { usuario: nuevo } = await api.editarUsuario(u.id, datos)
      setUsuarios((lista) => lista.map((x) => (x.id === nuevo.id ? nuevo : x)))
    } catch (e) {
      setError(e.message)
    }
  }

  async function probarMail() {
    setProbando(true)
    setPruebaMail(null)
    try {
      const r = await api.probarAviso()
      setPruebaMail({ ok: true, texto: `Mail de prueba enviado a ${r.para.join(', ')}.` })
    } catch (e) {
      setPruebaMail({ ok: false, texto: e.message })
    } finally {
      setProbando(false)
    }
  }

  if (!usuarios) return error ? <p className="nota error">{error}</p> : <p className="aviso">Cargando…</p>

  return (
    <section className="rv-card panel">
      <div className="seccion-titulo">
        <div>
          <h2>Usuarios</h2>
          <p>
            Todos pueden cargar trámites y seguirlos. <b>Gestiona</b> quien los toma, les cambia el estado y completa la
            flota; los administradores del portal gestionan siempre. Quien entra por el portal aparece acá solo, la primera
            vez que abre la app.
          </p>
        </div>
        <div className="fila-acciones">
          <button type="button" className="boton boton-suave boton-chico" disabled={probando} onClick={probarMail}
                  title="Manda un mail de prueba con la configuración del aviso de transferencias">
            {probando ? 'Mandando…' : 'Probar aviso por mail'}
          </button>
          <button type="button" className="boton boton-chico" onClick={() => setAlta(true)}>
            <Icono clave="mas" tamano={16} /> Agregar usuario
          </button>
        </div>
      </div>
      {pruebaMail && <p className={`nota ${pruebaMail.ok ? 'ok' : 'error'}`} role="status">{pruebaMail.texto}</p>}

      <div className="filtros">
        <Buscador valor={filtro.q} onCambio={(q) => setFiltro((f) => ({ ...f, q }))} placeholder="Buscá por nombre o email…" />
        <div className="barra-filtros">
          <FiltroMarcas titulo="Filtrar"
            marcas={[
              { clave: 'gestores', nombre: 'Gestionan trámites', activa: filtro.gestores, conteo: conteos.gestores },
              { clave: 'inactivos', nombre: 'Desactivados', activa: filtro.inactivos, conteo: conteos.inactivos },
            ]}
            onCambio={(clave, si) => setFiltro((f) => ({ ...f, [clave]: si }))} />
        </div>
        <Resumen mostrados={resultado.length} total={usuarios.length} nombre="usuarios" hayFiltros={hayFiltros} onLimpiar={() => setFiltro(INICIAL)} />
      </div>

      {error && <p className="nota error" role="alert">{error}</p>}

      <ul className="filas">
        {resultado.map((u) => (
          <li key={u.id} className={`fila-usuario ${u.activo ? '' : 'inactivo'}`}>
            <span className="fila-dominio">
              <strong>{u.nombre || u.email}</strong>
              <small>{u.email}</small>
            </span>
            <span className="apagado">
              {u.esAdmin ? 'Administrador del portal' : u.tienePasswordLocal ? 'Con contraseña propia' : 'Entra por el portal'}
              <small>{u.ultimoIngreso ? `Entró ${haceCuanto(u.ultimoIngreso)}` : 'Nunca entró'}</small>
            </span>
            <label className="check">
              <input type="checkbox" checked={u.esGestor} disabled={u.esAdmin}
                     onChange={(e) => cambiar(u, { esGestor: e.target.checked })} />
              Gestiona
            </label>
            <label className="check">
              <input type="checkbox" checked={u.activo} disabled={u.id === usuario.id}
                     onChange={(e) => cambiar(u, { activo: e.target.checked })} />
              Activo
            </label>
            <button type="button" className="link" onClick={() => setClave(u)}>
              {u.tienePasswordLocal ? 'Cambiar contraseña' : 'Darle contraseña'}
            </button>
          </li>
        ))}
      </ul>

      {alta && <AltaUsuario onCerrar={() => setAlta(false)} onCreado={(u) => { setUsuarios((l) => [...l, u]); setAlta(false) }} />}
      {clave && (
        <ClaveUsuario u={clave} onCerrar={() => setClave(null)}
                      onListo={(nuevo) => { setUsuarios((l) => l.map((x) => (x.id === nuevo.id ? nuevo : x))); setClave(null) }} />
      )}
    </section>
  )
}

function AltaUsuario({ onCerrar, onCreado }) {
  const [f, setF] = useState({ nombre: '', email: '', password: '', esGestor: false })
  const [error, setError] = useState('')
  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    try {
      onCreado((await api.crearUsuario(f)).usuario)
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <Modal titulo="Agregar usuario" tamano="medio" onCerrar={onCerrar}>
      <form className="forma" onSubmit={enviar}>
        <p className="nota">Para alguien que no tiene cuenta en el portal. Si después se la crean con el mismo email, es la misma persona.</p>
        <label>Nombre<input type="text" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
        <label>Email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Contraseña<input type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={f.esGestor} onChange={(e) => setF({ ...f, esGestor: e.target.checked })} /> Gestiona trámites</label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="forma-acciones">
          <button type="submit" className="boton">Agregar</button>
          <button type="button" className="boton boton-suave" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}

function ClaveUsuario({ u, onCerrar, onListo }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const enviar = async (e) => {
    e.preventDefault()
    setError('')
    try {
      onListo((await api.editarUsuario(u.id, { password })).usuario)
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <Modal titulo={`Contraseña de ${u.nombre || u.email}`} tamano="medio" onCerrar={onCerrar}>
      <form className="forma" onSubmit={enviar}>
        <p className="nota">Es la contraseña de respaldo de esta app: no cambia la del portal.</p>
        <label>Contraseña nueva<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="forma-acciones">
          <button type="submit" className="boton">Guardar</button>
          <button type="button" className="boton boton-suave" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
