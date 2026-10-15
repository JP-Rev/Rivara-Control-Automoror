import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { normalizar } from '../filtros.js'

// Selector "inteligente" para los formularios: en vez de un <select> o de una
// grilla de opciones, un campo donde se escribe y la lista se achica.
//
//   · Busca en el nombre, en la descripcion y en sinonimos ("chapa" encuentra
//     Reposición de placas, "verde" el duplicado de cédula). Varias palabras
//     se suman, sin tildes ni mayusculas.
//   · Primero lo que empieza con lo escrito, despues lo que lo contiene.
//   · Flechas, Enter y Escape; Tab elige la resaltada.
//   · `libre`: acepta un valor que no esta en la lista (tipo registral, uso),
//     y la lista queda como sugerencias.
//
// opciones: [{ clave, nombre, detalle?, palabras?: string[] }]
export default function Selector({
  valor, opciones, onCambio, placeholder = 'Escribí para buscar…', libre = false,
  autoFocus, id: idExterno, vacio = 'Ninguna opción coincide', invalido,
}) {
  const elegida = opciones.find((o) => o.clave === valor)
  const [texto, setTexto] = useState(elegida?.nombre ?? (libre ? valor || '' : ''))
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState(0)
  const idLista = useId()
  const lista = useRef(null)

  // Si el valor cambia desde afuera, el texto lo acompaña. Solo depende del
  // valor: quien usa el selector suele armar `opciones` en cada render, y con
  // eso como dependencia se borraba lo que se estaba escribiendo.
  const ultimas = useRef(opciones)
  ultimas.current = opciones
  useEffect(() => {
    const o = ultimas.current.find((x) => x.clave === valor)
    setTexto((t) => o?.nombre ?? (libre ? (valor ?? t) : ''))
  }, [valor, libre])

  const visibles = useMemo(() => {
    const q = normalizar(texto).trim()
    // Con una opcion ya elegida y el texto intacto, se muestran todas: abrir
    // el selector es para cambiar, no para ver solo la que ya estaba.
    if (!q || (elegida && texto === elegida.nombre)) return opciones
    const palabras = q.split(/\s+/)
    const puntaje = (o) => {
      const nombre = normalizar(o.nombre)
      const todo = [nombre, normalizar(o.detalle), ...(o.palabras || []).map(normalizar)].join(' ')
      if (!palabras.every((p) => todo.includes(p))) return -1
      if (nombre.startsWith(q)) return 3
      if (nombre.split(/\s+/).some((w) => w.startsWith(palabras[0]))) return 2
      return 1
    }
    return opciones.map((o) => [o, puntaje(o)]).filter(([, p]) => p >= 0).sort((a, b) => b[1] - a[1]).map(([o]) => o)
  }, [texto, opciones, elegida])

  useEffect(() => {
    lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activa])

  const elegir = (o) => {
    setTexto(o.nombre)
    onCambio(o.clave)
    setAbierto(false)
  }

  const alTeclear = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActiva((a) => Math.min(a + 1, visibles.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiva((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && abierto && visibles[activa]) { e.preventDefault(); elegir(visibles[activa]) }
    else if (e.key === 'Tab' && abierto && visibles[activa] && texto && !(elegida && texto === elegida.nombre)) elegir(visibles[activa])
    else if (e.key === 'Escape' && abierto) { e.stopPropagation(); setAbierto(false) }
  }

  const alSalir = () => {
    setTimeout(() => {
      setAbierto(false)
      if (libre) {
        // Texto libre: si coincide con una opcion por nombre, se usa esa.
        const igual = opciones.find((o) => normalizar(o.nombre) === normalizar(texto))
        if (igual) onCambio(igual.clave)
      } else if (!elegida || texto !== elegida.nombre) {
        // Sin libre, lo escrito a medias no queda: vuelve a lo elegido.
        setTexto(elegida?.nombre || '')
      }
    }, 120)
  }

  return (
    <div className={`selector ${invalido ? 'selector--invalido' : ''}`}>
      <input
        id={idExterno}
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={elegida ? elegida.nombre : placeholder}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setActiva(0)
          setAbierto(true)
          // En libre, el valor es lo escrito desde la primera tecla: si se
          // espera al blur, un "Guardar" inmediato manda el valor viejo.
          if (libre) onCambio(e.target.value)
          else if (!e.target.value) onCambio('')
        }}
        onFocus={(e) => { setAbierto(true); e.target.select() }}
        onClick={() => setAbierto(true)}
        onBlur={alSalir}
        onKeyDown={alTeclear}
      />
      <svg className="selector-flecha" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      {abierto && (
        <ul className="selector-lista" id={idLista} role="listbox" ref={lista}>
          {visibles.map((o, i) => (
            <li key={o.clave} role="option" aria-selected={i === activa}>
              <button type="button" tabIndex={-1}
                      className={`${i === activa ? 'activa' : ''} ${o.clave === valor ? 'elegida' : ''}`}
                      onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActiva(i)} onClick={() => elegir(o)}>
                <span>{o.nombre}</span>
                {o.detalle && <small>{o.detalle}</small>}
              </button>
            </li>
          ))}
          {!visibles.length && (
            <li className="selector-vacio">{libre && texto.trim() ? `Se va a usar «${texto.trim()}» tal cual` : vacio}</li>
          )}
        </ul>
      )}
    </div>
  )
}
