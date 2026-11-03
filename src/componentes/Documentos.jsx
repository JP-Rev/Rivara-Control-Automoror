import { useEffect, useRef, useState } from 'react'
import * as api from '../api.js'
import { fechaHora } from '../formato.js'
import { Icono } from '../iconos.jsx'

// Lista de documentos guardados: los de un tramite o, en la ficha del
// vehiculo, los de todos los tramites de ese dominio (el titulo mas nuevo
// queda primero). Cada uno se abre en otra pestaña o se baja.
//
// cargar: () => Promise<{ documentos }>
// conTramite: muestra de que tramite es cada uno (en la ficha del vehiculo)
// tramiteId + puedeAdjuntar: boton para adjuntar archivos (en cualquier
//   estado del tramite); onCambio recibe { tramite, eventos } despues de
//   adjuntar o borrar.
const MAXIMO_MB = 15
const tamano = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export default function Documentos({ cargar, conTramite, onAbrirTramite, vacio, tramiteId, puedeAdjuntar, onCambio }) {
  const [docs, setDocs] = useState(null)
  const [error, setError] = useState('')
  const [subiendo, setSubiendo] = useState('')
  const [borrar, setBorrar] = useState(null) // id a confirmar
  const entrada = useRef(null)

  async function subir(archivos) {
    setError('')
    const lista = [...archivos]
    const grandes = lista.filter((a) => a.size > MAXIMO_MB * 1024 * 1024)
    if (grandes.length) return setError(`Máximo ${MAXIMO_MB} MB por archivo: ${grandes.map((a) => a.name).join(', ')}.`)
    let ultimo = null
    try {
      for (const [i, a] of lista.entries()) {
        setSubiendo(lista.length > 1 ? `Subiendo ${i + 1} de ${lista.length}…` : 'Subiendo…')
        ultimo = await api.adjuntar(tramiteId, a)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSubiendo('')
      if (ultimo) onCambio?.(ultimo)
    }
  }

  async function confirmarBorrar(id) {
    setError('')
    try {
      onCambio?.(await api.borrarDocumento(id))
    } catch (e) {
      setError(e.message)
    } finally {
      setBorrar(null)
    }
  }

  const boton = puedeAdjuntar && (
    <div className="fila-acciones documentos-adjuntar">
      <button type="button" className="boton boton-chico" disabled={Boolean(subiendo)} onClick={() => entrada.current?.click()}>
        <Icono clave="mas" tamano={16} /> {subiendo || 'Adjuntar archivos'}
      </button>
      <small className="apagado">PDF, fotos, planillas… hasta {MAXIMO_MB} MB cada uno.</small>
      <input ref={entrada} type="file" multiple hidden
             onChange={(e) => { const f = e.target.files; if (f?.length) subir(f); e.target.value = '' }} />
    </div>
  )

  useEffect(() => {
    let vivo = true
    cargar().then((r) => vivo && setDocs(r.documentos)).catch((e) => vivo && setError(e.message))
    return () => { vivo = false }
    // cargar cambia en cada render; se recarga cuando cambia la clave del
    // componente (key) desde afuera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const aviso = error && <p className="error" role="alert">{error}</p>
  if (!docs) return error ? aviso : <p className="apagado">Cargando…</p>
  if (!docs.length) return <>{boton}{aviso}<p className="apagado">{vacio}</p></>

  // En la ficha del vehiculo, el ultimo titulo se destaca arriba.
  const ultimoTitulo = conTramite ? docs.find((d) => d.tipo === 'TITULO') : null

  return (
    <>
      {boton}
      {aviso}
      {ultimoTitulo && (
        <div className="titulo-listo">
          <p><b>Último título</b><span className="apagado"> · {fechaHora(ultimoTitulo.creadoEn)} · trámite #{ultimoTitulo.tramite}</span></p>
          <div className="fila-acciones">
            <a className="boton boton-chico" href={api.urlDocumento(ultimoTitulo.id)} target="_blank" rel="noreferrer">
              <Icono clave="documento" tamano={16} /> Ver el título
            </a>
          </div>
        </div>
      )}
      <ul className="documentos">
        {docs.map((d) => (
          <li key={d.id}>
            <span className={`documento-tipo documento-tipo--${d.tipo.toLowerCase()}`}>
              {d.tipo === 'ADJUNTO' ? <span className="documento-nombre" title={d.nombre}>{d.nombre}</span> : d.tipoNombre}
            </span>
            <span className="documento-dato">
              {fechaHora(d.creadoEn)}{d.usuario && ` · ${d.usuario}`}{d.tipo === 'ADJUNTO' && ` · ${tamano(d.bytes)}`}
              {conTramite && (
                <> · <button type="button" className="link" onClick={() => onAbrirTramite?.(d.tramite)}>trámite #{d.tramite}</button></>
              )}
            </span>
            <span className="fila-acciones">
              {borrar === d.id ? (
                <>
                  <span className="confirmar">¿Borrar?</span>
                  <button type="button" className="boton boton-chico boton-peligro" onClick={() => confirmarBorrar(d.id)}>Sí, borrar</button>
                  <button type="button" className="boton boton-suave boton-chico" onClick={() => setBorrar(null)}>No</button>
                </>
              ) : (
                <>
                  {d.enPantalla && <a className="boton boton-suave boton-chico" href={api.urlDocumento(d.id)} target="_blank" rel="noreferrer">Ver</a>}
                  <a className="boton boton-suave boton-chico" href={api.urlDocumento(d.id, true)} download aria-label={`Bajar ${d.nombre}`} title="Bajar">
                    <Icono clave="descarga" tamano={16} />
                  </a>
                  {d.puedeBorrar && onCambio && (
                    <button type="button" className="boton boton-suave boton-chico" aria-label={`Borrar ${d.nombre}`} title="Borrar"
                            onClick={() => setBorrar(d.id)}>
                      <Icono clave="cerrar" tamano={16} />
                    </button>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
