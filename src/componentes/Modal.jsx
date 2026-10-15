import { useEffect, useRef } from 'react'
import { Icono } from '../iconos.jsx'

/* Ventana modal.
 *
 * El formulario de alta y edición vivía arriba de la tabla y empujaba todo
 * hacia abajo: se perdía de vista la fila que se estaba editando y no quedaba
 * claro si lo de abajo era la lista o parte del formulario.
 *
 * Dos decisiones sobre cómo se cierra, por la misma razón que el borrado pide
 * contraseña: nada que se cierre solo y se lleve lo escrito.
 *
 *   · El click afuera NO cierra. Es el gesto más fácil de hacer sin querer y
 *     el que más trabajo se lleva.
 *   · Escape sí cierra, pero pasa por onCerrar, así que el formulario puede
 *     preguntar antes si hay cambios sin guardar.
 */
// Las ventanas se pueden apilar (el detalle de un tramite abre la DDJJ
// encima). Escape cierra solo la de arriba: el listener esta en window, asi
// que sin esto se cerraban las dos de un golpe.
const pila = []

export default function Modal({ titulo, tamano, children, onCerrar }) {
  const caja = useRef(null)
  const antes = useRef(null)
  // En un ref y no como dependencia del efecto: quien la usa suele pasar una
  // funcion nueva en cada render, y el efecto re-corria y le sacaba el foco al
  // campo en el que se estaba escribiendo.
  const cerrar = useRef(onCerrar)
  cerrar.current = onCerrar

  useEffect(() => {
    antes.current = document.activeElement
    // El fondo no tiene que poder scrollear debajo de la ventana.
    const previo = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // El foco entra a la ventana: si se queda afuera, tabular recorre la
    // pantalla de atrás y con lector de pantalla la modal no existe. Se busca
    // dentro del cuerpo y no en toda la caja, o el foco cae siempre en la X
    // del encabezado, que es lo primero del DOM y lo último que alguien
    // quiere apretar al abrir un formulario.
    const cuerpo = caja.current?.querySelector('.modal-cuerpo')
    const primero = cuerpo?.querySelector('input:not([type="hidden"]), select, textarea, button')
    ;(primero || caja.current?.querySelector('.modal-cerrar'))?.focus()

    const yo = Symbol('modal')
    pila.push(yo)
    const alTeclear = (e) => {
      if (e.key === 'Escape' && pila[pila.length - 1] === yo) { e.stopPropagation(); cerrar.current() }
    }
    window.addEventListener('keydown', alTeclear)
    return () => {
      document.body.style.overflow = previo
      window.removeEventListener('keydown', alTeclear)
      pila.splice(pila.indexOf(yo), 1)
      // Al cerrar, el foco vuelve a donde estaba, que casi siempre es el
      // botón "Editar" de la fila.
      if (antes.current instanceof HTMLElement) antes.current.focus()
    }
  }, [])

  return (
    <div className="rv-capa">
      <div ref={caja} className={'rv-dialogo' + (tamano ? ` rv-dialogo--${tamano}` : '')}
           role="dialog" aria-modal="true" aria-label={titulo}>
        <header className="modal-barra">
          <h2>{titulo}</h2>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <Icono clave="cerrar" tamano={20} />
          </button>
        </header>
        <div className="modal-cuerpo">{children}</div>
      </div>
    </div>
  )
}
