import { useEffect, useState } from 'react'
import * as api from '../api.js'
import { fechaHora } from '../formato.js'
import { Icono } from '../iconos.jsx'

// Lista de documentos guardados: los de un tramite o, en la ficha del
// vehiculo, los de todos los tramites de ese dominio (el titulo mas nuevo
// queda primero). Cada uno se abre en otra pestaña o se baja.
//
// cargar: () => Promise<{ documentos }>
// conTramite: muestra de que tramite es cada uno (en la ficha del vehiculo)
export default function Documentos({ cargar, conTramite, onAbrirTramite, vacio }) {
  const [docs, setDocs] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    cargar().then((r) => vivo && setDocs(r.documentos)).catch((e) => vivo && setError(e.message))
    return () => { vivo = false }
    // cargar cambia en cada render; se recarga cuando cambia la clave del
    // componente (key) desde afuera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) return <p className="error">{error}</p>
  if (!docs) return <p className="apagado">Cargando…</p>
  if (!docs.length) return <p className="apagado">{vacio}</p>

  // En la ficha del vehiculo, el ultimo titulo se destaca arriba.
  const ultimoTitulo = conTramite ? docs.find((d) => d.tipo === 'TITULO') : null

  return (
    <>
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
            <span className={`documento-tipo documento-tipo--${d.tipo.toLowerCase()}`}>{d.tipoNombre}</span>
            <span className="documento-dato">
              {fechaHora(d.creadoEn)}{d.usuario && ` · ${d.usuario}`}
              {conTramite && (
                <> · <button type="button" className="link" onClick={() => onAbrirTramite?.(d.tramite)}>trámite #{d.tramite}</button></>
              )}
            </span>
            <span className="fila-acciones">
              <a className="boton boton-suave boton-chico" href={api.urlDocumento(d.id)} target="_blank" rel="noreferrer">Ver</a>
              <a className="boton boton-suave boton-chico" href={api.urlDocumento(d.id, true)} download aria-label={`Bajar ${d.nombre}`}>
                <Icono clave="descarga" tamano={16} />
              </a>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
