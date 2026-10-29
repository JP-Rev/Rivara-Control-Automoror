import { useEffect, useId, useRef, useState } from 'react'
import { normalizar } from '../filtros.js'
import { Icono } from '../iconos.jsx'
import Info from './Info.jsx'

// Barra de filtros de cualquier lista: la caja de busqueda general y, al
// lado, un menu desplegable por cada filtro (no fichas sueltas: con diez
// opciones por fila la pantalla se llenaba de pastillas).
//
// Cada menu es "inteligente":
//   · muestra cuantos resultados quedarian con cada opcion, contando lo que
//     ya filtra todo lo demas;
//   · las opciones que dejarian la lista vacia aparecen deshabilitadas;
//   · con muchas opciones trae su propia caja para buscar adentro;
//   · el boton dice que esta elegido ("Estado: En espera"), asi se ve el
//     filtro aplicado sin abrir nada.

export function Buscador({ valor, onCambio, placeholder, ayuda }) {
  return (
    <div className="buscador-bloque">
      <label className="rv-buscador">
        <Icono clave="lupa" tamano={18} />
        <input
          type="search"
          value={valor}
          placeholder={placeholder}
          aria-label="Buscar"
          onChange={(e) => onCambio(e.target.value)}
        />
        {valor && (
          <button type="button" className="buscador-limpiar" aria-label="Borrar búsqueda" onClick={() => onCambio('')}>
            <Icono clave="cerrar" tamano={16} />
          </button>
        )}
        {/* Fuera del flujo del label: tocar la "i" no tiene que mover el foco
            al campo de busqueda. */}
        {ayuda && <span onClick={(e) => e.preventDefault()}><Info etiqueta="Cómo buscar" lado="izquierda">{ayuda}</Info></span>}
      </label>
    </div>
  )
}

// Menu desplegable generico: se cierra con Escape, con un clic afuera y al
// elegir (en los de una sola opcion).
function Desplegable({ etiqueta, activo, children, ancho, clase = '' }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    const afuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false) }
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false) } }
    document.addEventListener('mousedown', afuera)
    caja.current?.addEventListener('keydown', tecla)
    const nodo = caja.current
    return () => {
      document.removeEventListener('mousedown', afuera)
      nodo?.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  return (
    <div className={`filtro ${clase}`} ref={caja}>
      <button type="button" className={`filtro-boton ${activo ? 'filtro-boton--activo' : ''}`}
              aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto((a) => !a)}>
        {etiqueta}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {abierto && (
        <div className="filtro-menu" id={id} style={ancho ? { minWidth: ancho } : undefined}>
          {children(() => setAbierto(false))}
        </div>
      )}
    </div>
  )
}

/**
 * Filtro de una sola opcion.
 * @param opciones  [{ clave, nombre }]
 * @param conteos   { clave: n }  (los que quedarian eligiendo esa opcion)
 * @param todas     texto de la opcion "sin filtro"; null si no hay
 * @param total     cuantos hay sin este filtro (para la opcion "todas")
 */
export function FiltroOpciones({ titulo, opciones, valor, conteos, onCambio, todas = 'Todos', total, porDefecto = '' }) {
  const [busqueda, setBusqueda] = useState('')
  const elegida = opciones.find((o) => o.clave === valor)
  const conBuscador = opciones.length > 7
  const visibles = busqueda ? opciones.filter((o) => normalizar(o.nombre).includes(normalizar(busqueda))) : opciones
  const totalSin = total ?? Object.values(conteos || {}).reduce((s, n) => s + n, 0)

  return (
    <Desplegable etiqueta={<><span className="filtro-titulo">{titulo}:</span> {elegida?.nombre || todas}</>}
                 activo={valor !== porDefecto}>
      {(cerrar) => (
        <>
          {conBuscador && (
            <input type="search" className="filtro-buscar" autoFocus placeholder={`Buscar ${titulo.toLowerCase()}…`}
                   value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          )}
          <ul role="listbox" aria-label={titulo}>
            {todas && !busqueda && (
              <li>
                <button type="button" role="option" aria-selected={!valor} className={!valor ? 'elegida' : ''}
                        onClick={() => { onCambio(''); cerrar() }}>
                  <span>{todas}</span><span className="filtro-n">{totalSin}</span>
                </button>
              </li>
            )}
            {visibles.map((o) => {
              const n = conteos?.[o.clave] || 0
              const esta = valor === o.clave
              return (
                <li key={o.clave}>
                  <button type="button" role="option" aria-selected={esta} className={esta ? 'elegida' : ''}
                          disabled={!n && !esta} onClick={() => { onCambio(o.clave); cerrar() }}>
                    <span>{o.nombre}</span><span className="filtro-n">{n}</span>
                  </button>
                </li>
              )
            })}
            {!visibles.length && <li className="filtro-vacio">Nada coincide con «{busqueda}»</li>}
          </ul>
        </>
      )}
    </Desplegable>
  )
}

/**
 * Orden de una lista, en un boton como los filtros (y no una barra suelta).
 * Elegir un criterio lo aplica con su sentido habitual; el sentido se cambia
 * abajo del menu.
 * @param opciones  [[clave, nombre]]
 * @param orden     { campo, desc }
 */
export function FiltroOrden({ opciones, orden, onCambio, onSentido }) {
  const actual = opciones.find(([c]) => c === orden.campo)?.[1] || ''
  return (
    <Desplegable clase="filtro--orden" etiqueta={<><span className="filtro-titulo">Ordenar:</span> {actual} {orden.desc ? '↓' : '↑'}</>}>
      {(cerrar) => (
        <>
          <ul role="listbox" aria-label="Ordenar por">
            {opciones.map(([c, n]) => (
              <li key={c}>
                <button type="button" role="option" aria-selected={orden.campo === c} className={orden.campo === c ? 'elegida' : ''}
                        onClick={() => { if (orden.campo !== c) onCambio(c); cerrar() }}>
                  <span>{n}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="filtro-sentido" role="group" aria-label="Sentido">
            {[[true, '↓ Descendente'], [false, '↑ Ascendente']].map(([desc, n]) => (
              <button key={n} type="button" className={orden.desc === desc ? 'elegida' : ''} aria-pressed={orden.desc === desc}
                      onClick={() => { onSentido(desc); cerrar() }}>{n}</button>
            ))}
          </div>
        </>
      )}
    </Desplegable>
  )
}

/**
 * Filtros de si/no agrupados en un menu con casillas ("Faltan datos",
 * "Tomados por mi"...). Se pueden combinar.
 * @param marcas  [{ clave, nombre, activa, conteo }]
 */
export function FiltroMarcas({ titulo = 'Más filtros', marcas, onCambio }) {
  const activas = marcas.filter((m) => m.activa)
  return (
    <Desplegable etiqueta={<><span className="filtro-titulo">{titulo}</span>{activas.length > 0 && <span className="filtro-cuenta">{activas.length}</span>}</>}
                 activo={activas.length > 0} ancho={250}>
      {() => (
        <ul aria-label={titulo}>
          {marcas.map((m) => (
            <li key={m.clave}>
              <label className={`filtro-check ${!m.conteo && !m.activa ? 'deshabilitada' : ''}`}>
                <input type="checkbox" checked={m.activa} disabled={!m.conteo && !m.activa}
                       onChange={(e) => onCambio(m.clave, e.target.checked)} />
                <span>{m.nombre}</span>
                <span className={`filtro-n ${m.aviso && m.conteo ? 'filtro-n--aviso' : ''}`}>{m.conteo}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Desplegable>
  )
}

export function Resumen({ mostrados, total, hayFiltros, onLimpiar, nombre = 'resultados' }) {
  return (
    <p className="resumen-filtro">
      {hayFiltros ? `${mostrados} de ${total} ${nombre}` : `${total} ${total === 1 ? nombre.replace(/s$/, '') : nombre}`}
      {hayFiltros && <button type="button" className="link" onClick={onLimpiar}>Quitar filtros</button>}
    </p>
  )
}
