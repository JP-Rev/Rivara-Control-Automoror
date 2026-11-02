import { useRef, useState } from 'react'
import * as api from '../api.js'
import { fecha, fechaHora } from '../formato.js'
import { Icono } from '../iconos.jsx'

// Titulo Digital de una transferencia o un duplicado: se sube la CAT que
// manda el Registro (o se escriben sus tres datos) y el servidor entra al
// sitio del DNRPA sin ventana, carga Registro, Nº de tramite y Nº de control
// web, y baja el PDF del titulo. Queda guardado en el tramite.

export default function TituloDigital({ tramite, puede, onActualizado }) {
  const td = tramite.tituloDigital
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState(null) // { mensaje, captura }
  const [aMano, setAMano] = useState(false)
  const [f, setF] = useState({ registro: td?.registro || '', tramite: td?.tramite || '', control: '' })
  const entrada = useRef(null)

  async function bajar(cat) {
    setError(null)
    setBajando(true)
    try {
      const r = await api.bajarTitulo(tramite.id, cat)
      onActualizado(r)
      setAMano(false)
    } catch (e) {
      setError({ mensaje: e.message, captura: e.captura })
      if (e.tramite) onActualizado({ tramite: e.tramite })
    } finally {
      setBajando(false)
    }
  }

  const ultimoError = error?.mensaje || td?.error

  return (
    <section className="detalle-bloque">
      <div className="fila-acciones">
        <h4 className="rv-eyebrow">Título digital</h4>
        {puede && (
          <button type="button" className={`boton boton-chico ${td?.documento ? 'boton-suave' : ''}`} disabled={bajando}
                  onClick={() => entrada.current?.click()}>
            <Icono clave="documento" tamano={16} /> {td?.documento ? 'Subir otra CAT' : 'Subir la CAT'}
          </button>
        )}
        <input ref={entrada} type="file" hidden accept="application/pdf"
               onChange={(e) => { const a = e.target.files?.[0]; e.target.value = ''; if (a) bajar(a) }} />
      </div>

      {td?.documento ? (
        <div className="titulo-listo">
          <p>
            <b>Título{td.nroTitulo ? ` Nº ${td.nroTitulo}` : ''}</b>
            <span className="apagado"> · bajado del DNRPA {td.descargadoEn ? fechaHora(td.descargadoEn) : ''}</span>
          </p>
          <div className="fila-acciones">
            <a className="boton boton-chico" href={api.urlTitulo(tramite.id)} target="_blank" rel="noreferrer">
              <Icono clave="documento" tamano={16} /> Ver el título
            </a>
            <a className="boton boton-suave boton-chico" href={api.urlTitulo(tramite.id, true)} download>
              <Icono clave="descarga" tamano={16} /> Bajar PDF
            </a>
          </div>
        </div>
      ) : !bajando && (
        <p className="apagado">
          Cuando el trámite queda inscripto el Registro manda la CAT (Constancia de Asignación de Título). Subila y la app entra
          al DNRPA, carga los tres datos y baja el título.
        </p>
      )}

      {td?.registro && (
        <p className="apagado">
          CAT: Registro {td.registro} · Trámite {td.tramite} · Control web {td.control}
          {td.fechaCat && ` · ${fecha(td.fechaCat + 'T12:00:00Z')}`}
        </p>
      )}

      {bajando && <p className="nota">Entrando al DNRPA y bajando el título… puede tardar hasta un minuto.</p>}

      {!bajando && ultimoError && (
        <div className="nota nota--aviso">
          <p>{ultimoError}</p>
          <div className="fila-acciones">
            {puede && td?.registro && <button type="button" className="boton boton-chico" onClick={() => bajar(null)}>Reintentar</button>}
            {error?.captura && (
              <a className="boton boton-suave boton-chico" href={api.urlCapturaTitulo(tramite.id)} target="_blank" rel="noreferrer">
                Ver dónde quedó la página
              </a>
            )}
          </div>
        </div>
      )}

      {puede && !bajando && (
        aMano ? (
          <form className="forma titulo-a-mano" onSubmit={(e) => { e.preventDefault(); bajar(f) }}>
            <div className="forma-fila">
              <label>Registro Seccional<input value={f.registro} inputMode="numeric" onChange={(e) => setF({ ...f, registro: e.target.value })} /></label>
              <label>Nº de trámite<input value={f.tramite} inputMode="numeric" onChange={(e) => setF({ ...f, tramite: e.target.value })} /></label>
              <label>Nº de control web<input value={f.control} autoComplete="off" placeholder={td?.control || ''}
                                             onChange={(e) => setF({ ...f, control: e.target.value })} /></label>
            </div>
            <div className="fila-acciones">
              <button type="submit" className="boton boton-chico">Bajar el título</button>
              <button type="button" className="boton boton-suave boton-chico" onClick={() => setAMano(false)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <button type="button" className="boton-texto" onClick={() => setAMano(true)}>No tengo el PDF: cargar los datos a mano</button>
        )
      )}
    </section>
  )
}
