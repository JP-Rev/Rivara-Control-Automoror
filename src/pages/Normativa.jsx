import { useMemo, useState } from 'react'
import { Buscador, Resumen } from '../componentes/Filtros.jsx'
import { normalizar } from '../filtros.js'
import { fecha, haceCuanto } from '../formato.js'
import { Icono } from '../iconos.jsx'

// Normativa: disposiciones y circulares de APROA, del feed RSS que lee el
// servidor (server/src/normativa.js). Cada una se abre en la web de APROA.
// Las que salieron despues de la ultima vez que se abrio esta seccion se
// marcan como nuevas.

export default function Normativa({ datos, vistaAnterior, cargando, onActualizar }) {
  const [q, setQ] = useState('')
  const items = datos?.items || []

  const lista = useMemo(() => {
    const palabras = normalizar(q).split(/\s+/).filter(Boolean)
    if (!palabras.length) return items
    return items.filter((it) => {
      const texto = normalizar(`${it.titulo} ${it.resumen} ${it.fecha ? fecha(it.fecha) : ''}`)
      return palabras.every((p) => texto.includes(p))
    })
  }, [items, q])

  const esNueva = (it) => Boolean(vistaAnterior && it.fecha && it.fecha > vistaAnterior)

  return (
    <section className="rv-card panel">
      <div className="seccion-titulo">
        <div>
          <h2>Disposiciones y circulares</h2>
          <p>
            Lo que publica APROA en <a href="https://www.aproa.org.ar/disposiciones-y-circulares/" target="_blank" rel="noreferrer">
            aproa.org.ar</a>. Cada una se abre en su web.
          </p>
        </div>
        <button type="button" className="boton boton-suave boton-chico" disabled={cargando} onClick={onActualizar}>
          <Icono clave="refrescar" tamano={16} /> {cargando ? 'Leyendo…' : 'Actualizar'}
        </button>
      </div>

      {datos?.error && <p className="nota error" role="alert">{datos.error}{items.length > 0 && ' Se muestra lo último que se leyó.'}</p>}

      {!datos ? (
        <p className="aviso">Cargando…</p>
      ) : (
        <>
          <div className="filtros">
            <Buscador valor={q} onCambio={setQ} placeholder="Buscá por número, tema, palabra…" />
            <Resumen mostrados={lista.length} total={items.length} nombre="disposiciones" hayFiltros={Boolean(q)} onLimpiar={() => setQ('')} />
          </div>

          {items.length === 0 && !datos.error ? (
            <p className="apagado">El feed no trae disposiciones por ahora.</p>
          ) : lista.length === 0 ? (
            <div className="vacio vacio--chico">
              <h2>Ninguna coincide</h2>
              <p>Probá con menos palabras.</p>
            </div>
          ) : (
            <ul className="normativa">
              {lista.map((it, i) => (
                <li key={`${it.enlace}-${i}`}>
                  <a className="normativa-item" href={it.enlace || undefined} target="_blank" rel="noreferrer">
                    <span className="normativa-cabeza">
                      <strong>{it.titulo}</strong>
                      {esNueva(it) && <span className="pastilla">Nueva</span>}
                    </span>
                    {it.resumen && it.resumen !== it.titulo && <span className="normativa-resumen">{it.resumen}</span>}
                    <small className="apagado">
                      {it.fecha ? `${fecha(it.fecha)} · ${haceCuanto(it.fecha)}` : 'Sin fecha'}
                    </small>
                  </a>
                </li>
              ))}
            </ul>
          )}

          {datos.leidoEn && (
            <p className="apagado normativa-pie">Feed leído {haceCuanto(datos.leidoEn)}. Se vuelve a leer solo cada media hora.</p>
          )}
        </>
      )}
    </section>
  )
}
