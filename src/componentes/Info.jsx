import { useEffect, useId, useRef, useState } from 'react'
import { Icono } from '../iconos.jsx'

// La "i" de informacion: ayudas y aclaraciones que no tienen que ocupar la
// pantalla todo el tiempo. Se abre al pasar el mouse o con el foco del
// teclado, y con un toque en el celular (donde no hay hover). Escape o un
// toque afuera la cierran.
export default function Info({ children, etiqueta = 'Más información', lado = 'derecha' }) {
  const [fija, setFija] = useState(false)
  const [encima, setEncima] = useState(false)
  const caja = useRef(null)
  const id = useId()
  const abierta = fija || encima

  useEffect(() => {
    if (!fija) return
    const afuera = (e) => { if (!caja.current?.contains(e.target)) setFija(false) }
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setFija(false) } }
    document.addEventListener('mousedown', afuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [fija])

  return (
    <span className="info" ref={caja} onMouseEnter={() => setEncima(true)} onMouseLeave={() => setEncima(false)}>
      <button type="button" className={`info-boton ${abierta ? 'info-boton--abierta' : ''}`}
              aria-label={etiqueta} aria-expanded={abierta} aria-describedby={abierta ? id : undefined}
              onClick={() => setFija((f) => !f)}
              onFocus={() => setEncima(true)} onBlur={() => setEncima(false)}>
        <Icono clave="info" tamano={18} />
      </button>
      {abierta && (
        <span role="tooltip" id={id} className={`info-globo info-globo--${lado}`}>{children}</span>
      )}
    </span>
  )
}
