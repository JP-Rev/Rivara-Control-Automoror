import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api.js'
import logo from './assets/logo-rivara.png'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { Icono } from './iconos.jsx'
import Bandeja from './pages/Bandeja.jsx'
import Anexo08d from './pages/Anexo08d.jsx'
import Ddjj from './pages/Ddjj.jsx'
import DetalleTramite from './pages/DetalleTramite.jsx'
import Flota from './pages/Flota.jsx'
import LeerDocumento from './pages/LeerDocumento.jsx'
import Login from './pages/Login.jsx'
import NuevoTramite from './pages/NuevoTramite.jsx'
import Password from './pages/Password.jsx'
import Usuarios from './pages/Usuarios.jsx'
import Vehiculo from './pages/Vehiculo.jsx'
import './App.css'

const TITULOS = {
  bandeja: 'Trámites',
  flota: 'Flota',
  usuarios: 'Usuarios',
  password: 'Contraseña de respaldo',
}

// Cada cuanto se vuelve a pedir la bandeja con la pestaña a la vista: el
// seguimiento lo mueve otra persona y no hay que recargar para verlo.
const REFRESCO_MS = 60_000

// Resume lo que trajo la lectura automatica de las planillas al entrar. Solo
// se muestra si paso algo: una lectura sin novedades no merece un cartel.
function avisoDeSincronizacion(r) {
  if (!r || r.omitida) return null
  const errores = r.resultados.filter((x) => !x.ok)
  const nuevos = r.resultados.reduce((s, x) => s + (x.nuevos || 0), 0)
  const actualizados = r.resultados.reduce((s, x) => s + (x.actualizados || 0), 0)
  if (errores.length) {
    const nombres = r.estado.filter((e) => e.error).map((e) => e.nombre).join(' y ')
    return { tipo: 'error', texto: `No se pudo leer la planilla de ${nombres}. La flota quedó como estaba.`, detalle: errores.map((e) => e.error).join(' ') }
  }
  if (nuevos || actualizados) {
    return {
      tipo: 'ok',
      texto: `Se leyeron las planillas de la red: ${nuevos} ${nuevos === 1 ? 'vehículo nuevo' : 'vehículos nuevos'}, ${actualizados} con datos actualizados.`,
    }
  }
  return null
}

function App() {
  const { usuario, verificando, logout } = useAuth()
  const [vista, setVista] = useState('bandeja')
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [catalogo, setCatalogo] = useState(null)
  const [tramites, setTramites] = useState(null)
  const [vehiculos, setVehiculos] = useState([])
  const [sincronizacion, setSincronizacion] = useState([])
  const [leyendo, setLeyendo] = useState(false)
  const [aviso, setAviso] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  // Ventanas: se pueden apilar (detalle -> DDJJ, detalle -> vehiculo).
  const [nuevo, setNuevo] = useState(null)        // { dominio }
  const [detalle, setDetalle] = useState(null)    // id
  const [ddjj, setDdjj] = useState(null)          // tramite
  const [vehiculo, setVehiculo] = useState(null)  // objeto, o { nuevo: true, dominio? }
  const [leerDoc, setLeerDoc] = useState(null)    // { vehiculo? }
  const [anexo, setAnexo] = useState(null)        // tramite
  // Sube cuando algo de afuera cambia el tramite abierto (la DDJJ, los datos
  // del vehiculo): el detalle se vuelve a montar y relee todo.
  const [versionDetalle, setVersionDetalle] = useState(0)
  // Si se guardo el vehiculo, el detalle de abajo se relee al cerrar esa
  // ventana y no antes: remontarlo con la del vehiculo abierta encima le roba
  // el foco y el Escape.
  const vehiculoCambio = useRef(false)

  const cargarTramites = useCallback(async () => {
    try {
      setTramites((await api.tramites()).tramites)
    } catch (e) {
      if (e.status !== 401) setError(e.message)
    }
  }, [])

  // El catalogo trae las listas de marcas, usos, titulares... que incluyen lo
  // ya cargado en la flota: se relee al guardar un vehiculo.
  const cargarCatalogo = useCallback(async () => {
    try {
      setCatalogo(await api.catalogo())
    } catch (e) {
      if (e.status !== 401) setError(e.message)
    }
  }, [])

  const cargarVehiculos = useCallback(async () => {
    try {
      const r = await api.vehiculos()
      setVehiculos(r.vehiculos)
      setSincronizacion(r.sincronizacion)
    } catch (e) {
      if (e.status !== 401) setError(e.message)
    }
  }, [])

  // Al entrar: lo que hay en la base primero (para que la pantalla aparezca
  // ya) y despues la lectura de las planillas de la red, que puede tardar.
  useEffect(() => {
    if (!usuario) return
    let vigente = true
    ;(async () => {
      await cargarCatalogo()
      await Promise.all([cargarTramites(), cargarVehiculos()])
      setLeyendo(true)
      try {
        const r = await api.sincronizar(false)
        if (!vigente) return
        setAviso(avisoDeSincronizacion(r))
        if (!r.omitida) await Promise.all([cargarVehiculos(), cargarTramites()])
      } catch (e) {
        if (vigente) setAviso({ tipo: 'error', texto: `No se pudo leer la red: ${e.message}` })
      } finally {
        if (vigente) setLeyendo(false)
      }
    })()
    return () => { vigente = false }
  }, [usuario, cargarTramites, cargarVehiculos, cargarCatalogo])

  useEffect(() => {
    if (!usuario) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') cargarTramites() }, REFRESCO_MS)
    return () => clearInterval(id)
  }, [usuario, cargarTramites])

  // Con el panel abierto el fondo no tiene que scrollear debajo, y Escape lo
  // cierra como cualquier capa.
  useEffect(() => {
    if (!menuAbierto) return
    const alTeclear = (e) => { if (e.key === 'Escape') setMenuAbierto(false) }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', alTeclear)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', alTeclear)
    }
  }, [menuAbierto])

  const ir = (id) => { setVista(id); setMenuAbierto(false) }

  const leerAhora = async () => {
    setLeyendo(true)
    try {
      const r = await api.sincronizar(true)
      setAviso(avisoDeSincronizacion(r) || { tipo: 'ok', texto: 'Planillas leídas: no había novedades.' })
      await cargarVehiculos()
    } catch (e) {
      setAviso({ tipo: 'error', texto: e.message })
    } finally {
      setLeyendo(false)
    }
  }

  // Un tramite cambio desde una ventana: se reemplaza en la lista sin volver
  // a pedirla entera.
  const actualizarTramite = useCallback((t) => {
    setTramites((lista) => {
      if (!lista) return lista
      return lista.some((x) => x.id === t.id) ? lista.map((x) => (x.id === t.id ? t : x)) : [t, ...lista]
    })
  }, [])

  const tomarDesdeLista = async (id) => {
    setOcupado(true)
    try {
      actualizarTramite((await api.tomar(id)).tramite)
    } catch (e) {
      setError(e.message)
    } finally {
      setOcupado(false)
    }
  }

  if (verificando) return <p className="aviso">Cargando…</p>
  if (!usuario) return <Login />

  const abiertos = (tramites || []).filter((t) => t.estado !== 'TERMINADO').length
  const sinTomar = (tramites || []).filter((t) => t.estado === 'SOLICITADO' && !t.gestor).length
  const faltanDatos = vehiculos.filter((v) => v.faltan.length > 0).length
  const urlPortal = `${window.location.protocol}//${window.location.hostname}:1003/`

  const MENUS = [
    {
      titulo: 'Trámites',
      items: [
        { id: 'bandeja', label: 'Bandeja', icono: 'bandeja', conteo: abiertos },
        { id: 'nuevo', label: 'Nuevo trámite', icono: 'mas', accion: () => { setNuevo({}); setMenuAbierto(false) } },
      ],
    },
    {
      titulo: 'Vehículos',
      items: [{ id: 'flota', label: 'Flota', icono: 'camion', conteo: vehiculos.length }],
    },
    ...(usuario.esAdmin ? [{ titulo: 'Administración', items: [{ id: 'usuarios', label: 'Usuarios', icono: 'personas' }] }] : []),
  ]

  return (
    <div className={`ic ${menuAbierto ? 'ic--menu-abierto' : ''}`}>
      {menuAbierto && (
        <button type="button" className="ic-velo" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)} />
      )}

      {/* Mismo armado que Informar CPE a Visec: arriba, a todo el ancho, la
          banda de la app y el titulo de la pantalla; abajo, la barra lateral
          (un solo panel blanco) y el contenido, con los bordes alineados. */}
      <div className="ic-arriba">
        <header className="ic-barra">
          <button type="button" className="ic-hamburguesa" aria-label="Abrir menú" aria-expanded={menuAbierto}
                  onClick={() => setMenuAbierto(true)}>
            <Icono clave="menu" tamano={22} />
          </button>
          {leyendo && <span className="rv-chip rv-chip--neutro">Leyendo las planillas de la red…</span>}
        </header>

        <section className="rv-hero ic-hero">
          {/* El isotipo es un PNG claro: sobre el degradé necesita su propio
              recuadro blanco. */}
          <span className="ic-hero-logo"><img src={logo} alt="Rivara" /></span>
          <span className="ic-hero-texto">
            <strong>Trámites del Registro Automotor</strong>
            <small>Transferencias, placas, duplicados y denuncias de venta de toda la flota.</small>
          </span>
          <span className="ic-hero-cifras">
            <span><strong className="rv-num">{abiertos}</strong><small>Abiertos</small></span>
            <span><strong className="rv-num">{sinTomar}</strong><small>Sin tomar</small></span>
            <span><strong className="rv-num">{vehiculos.length}</strong><small>Vehículos</small></span>
          </span>
        </section>

        <div className="ic-encabezado-pagina">
          <h1 className="ic-titulo-pagina">{TITULOS[vista]}</h1>
          {vista === 'bandeja' && (
            <button type="button" className="boton" onClick={() => setNuevo({})}>
              <Icono clave="mas" tamano={18} /> Nuevo trámite
            </button>
          )}
        </div>
      </div>

      <div className="ic-fila">
        <aside className="ic-lateral">
          <button type="button" className="ic-cerrar-menu" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)}>
            <Icono clave="cerrar" tamano={20} />
          </button>

          <div className="rv-card ic-marca">
            <span className="rv-disco rv-disco--sm" aria-hidden="true"><Icono clave="perfil" tamano={20} /></span>
            <span className="ic-marca-texto">
              <strong>{usuario.nombre || usuario.email}</strong>
              <small>{usuario.esAdmin ? 'Administrador' : usuario.esGestor ? 'Gestiona trámites' : 'Carga trámites'} · Registro automotor</small>
            </span>
          </div>

          <nav className="rv-nav" aria-label="Secciones">
            {MENUS.flatMap((menu) => menu.items).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rv-nav-item ${vista === item.id ? 'rv-nav-item--activo' : ''}`}
                aria-current={vista === item.id ? 'page' : undefined}
                onClick={item.accion || (() => ir(item.id))}
              >
                <Icono clave={item.icono} tamano={21} />
                <span className="ic-nav-label">{item.label}</span>
                {item.conteo > 0 && <span className="rv-nav-conteo">{item.conteo}</span>}
              </button>
            ))}
          </nav>

          <div className="rv-card ic-lateral-pie">
            <span className="ic-pie-titulo">
              <img src={logo} alt="" width="22" height="22" />Rivara · Registro automotor
            </span>
            <button type="button" className="link" onClick={() => ir('password')}>Contraseña de respaldo</button>
            {/* Solo si entró por la contraseña de respaldo: la sesión del
                portal se cierra desde el portal, no desde acá. */}
            {usuario.via === 'local' && <button type="button" className="link" onClick={logout}>Salir</button>}
            <a className="rv-btn rv-btn--secundario" href={urlPortal}>Volver al portal</a>
          </div>
        </aside>

      <div className="ic-principal">
        <main className="contenido">
          {error && (
            <p className="nota error" role="alert">
              {error} <button type="button" className="link" onClick={() => setError('')}>Cerrar</button>
            </p>
          )}

          {aviso && (
            <div className={`cartel cartel--${aviso.tipo}`} role="status">
              <Icono clave={aviso.tipo === 'error' ? 'alerta' : 'chequeo'} tamano={20} />
              <div>
                <p>{aviso.texto}</p>
                {aviso.detalle && <p className="cartel-detalle">{aviso.detalle}</p>}
              </div>
              {vista !== 'flota' && <button type="button" className="link" onClick={() => ir('flota')}>Ver la flota</button>}
              <button type="button" className="cartel-cerrar" aria-label="Cerrar aviso" onClick={() => setAviso(null)}>
                <Icono clave="cerrar" tamano={16} />
              </button>
            </div>
          )}

          {vista === 'bandeja' && usuario.esGestor && (sinTomar > 0 || faltanDatos > 0) && (
            <div className="pendientes">
              {sinTomar > 0 && (
                <span className="pendiente">
                  <b>{sinTomar}</b> {sinTomar === 1 ? 'trámite espera' : 'trámites esperan'} que lo{sinTomar === 1 ? '' : 's'} tomes
                </span>
              )}
              {faltanDatos > 0 && (
                <button type="button" className="pendiente pendiente--boton" onClick={() => ir('flota')}>
                  <b>{faltanDatos}</b> {faltanDatos === 1 ? 'vehículo sin' : 'vehículos sin'} chasis, motor o uso: completalos en Flota
                </button>
              )}
            </div>
          )}

          {!catalogo || tramites === null ? (
            <p className="aviso">Cargando…</p>
          ) : (
            <>
              {vista === 'bandeja' && (
                <Bandeja tramites={tramites} catalogo={catalogo} usuario={usuario} ocupado={ocupado}
                         onAbrir={setDetalle} onNuevo={() => setNuevo({})} onTomar={tomarDesdeLista} />
              )}
              {vista === 'flota' && (
                <Flota vehiculos={vehiculos} sincronizacion={sincronizacion} catalogo={catalogo} usuario={usuario}
                       onAbrir={setVehiculo} onNuevo={() => setVehiculo({ nuevo: true })}
                       onLeerDocumento={() => setLeerDoc({})} onLeer={leerAhora} leyendo={leyendo} />
              )}
              {vista === 'usuarios' && usuario.esAdmin && <Usuarios usuario={usuario} />}
              {vista === 'password' && <Password onCerrar={() => setVista('bandeja')} />}
            </>
          )}
        </main>

        <footer className="rv-card pie">
          <p>
            <strong>La flota sale de las planillas de la red</strong> (Camionetas y Control Camiones): se vuelven a leer cada vez
            que alguien entra, y cada dominio nuevo aparece solo. Chasis, motor y uso no están en las planillas: se cargan acá
            y la lectura de la red no los toca.
          </p>
        </footer>
      </div>
      </div>

      {nuevo && catalogo && (
        <NuevoTramite catalogo={catalogo} vehiculos={vehiculos} tramites={tramites || []} dominioInicial={nuevo.dominio}
                      onAbrir={(id) => { setNuevo(null); setDetalle(id) }}
                      onAgregarVehiculo={usuario.esGestor ? (dominio) => setVehiculo({ nuevo: true, dominio }) : undefined}
                      onCerrar={() => setNuevo(null)}
                      onCreado={(t) => { actualizarTramite(t); setNuevo(null); setVista('bandeja'); setDetalle(t.id) }} />
      )}
      {detalle && catalogo && (
        <DetalleTramite key={`${detalle}-${versionDetalle}`} id={detalle} catalogo={catalogo} usuario={usuario}
                        onCambio={actualizarTramite}
                        onBorrado={(id) => { setTramites((l) => l.filter((t) => t.id !== id)); setDetalle(null) }}
                        onCerrar={() => setDetalle(null)}
                        onVehiculo={(v) => setVehiculo(v)}
                        onDdjj={(t) => setDdjj(t)}
                        onAnexo08d={(t) => setAnexo(t)} />
      )}
      {vehiculo && catalogo && (
        <Vehiculo key={vehiculo.nuevo ? 'nuevo' : vehiculo.id} vehiculo={vehiculo}
                  catalogo={catalogo} usuario={usuario} tramites={tramites || []}
                  onGuardado={() => { cargarVehiculos(); cargarTramites(); cargarCatalogo(); vehiculoCambio.current = true }}
                  onNuevoTramite={(dominio) => { setVehiculo(null); setNuevo({ dominio }) }}
                  onAbrirTramite={(id) => { setVehiculo(null); setDetalle(id) }}
                  onLeerDocumento={(v) => { setVehiculo(null); setLeerDoc({ vehiculo: v }) }}
                  onCerrar={() => {
                    setVehiculo(null)
                    if (vehiculoCambio.current) setVersionDetalle((n) => n + 1)
                    vehiculoCambio.current = false
                  }} />
      )}
      {leerDoc && catalogo && (
        <LeerDocumento vehiculos={vehiculos} vehiculoInicial={leerDoc.vehiculo} usuario={usuario} catalogo={catalogo}
                       onAplicado={() => { cargarVehiculos(); cargarCatalogo(); cargarTramites() }}
                       onCerrar={() => setLeerDoc(null)} />
      )}
      {anexo && catalogo && (
        <Anexo08d tramite={anexo} catalogo={catalogo} usuario={usuario}
                  onCerrar={() => setAnexo(null)}
                  onListo={() => {
                    setAnexo(null)
                    setVersionDetalle((n) => n + 1)
                    cargarVehiculos()
                    cargarTramites()
                  }} />
      )}
      {ddjj && catalogo && (
        <Ddjj tramite={ddjj} catalogo={catalogo} usuario={usuario}
              onCerrar={() => setDdjj(null)}
              onListo={() => {
                setDdjj(null)
                setVersionDetalle((n) => n + 1)
                cargarVehiculos()
                cargarTramites()
              }} />
      )}
    </div>
  )
}

export default function Raiz() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  )
}
