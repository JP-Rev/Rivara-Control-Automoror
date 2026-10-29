import { useMemo, useState } from 'react'
import { Buscador, FiltroMarcas, FiltroOpciones, Resumen } from '../componentes/Filtros.jsx'
import { haceCuanto } from '../formato.js'
import { ordenar, useFiltrado, useRecordado } from '../filtros.js'
import { Icono } from '../iconos.jsx'

const INICIAL = { q: '', categoria: '', faltan: false, fuera: false, abiertos: false }

const ORDENES = {
  unidad: (v) => [v.categoria === 'ACOPLADO' ? 'CAMION' : v.categoria, v.unidad.padStart(5, '0'), v.rol === 'Tractor' ? 0 : 1].join('|'),
  dominio: (v) => v.dominio,
  marca: (v) => `${v.marca} ${v.modelo}`,
  chofer: (v) => v.chofer,
  anio: (v) => v.anio || 0,
}

// El estado de las dos planillas de la red: cuando se leyeron, que trajeron,
// y si fallaron, por que. Es lo primero que hay que mirar si "falta un
// vehiculo".
export function EstadoPlanillas({ sincronizacion, onLeer, leyendo }) {
  // El detalle (ruta, archivo leido, avisos por fila) se mira cuando algo no
  // cierra: plegado por defecto. Los errores no: si una planilla no se pudo
  // leer, eso se ve siempre.
  const [abierto, setAbierto] = useState(false)
  const avisos = sincronizacion.reduce((n, s) => n + (s.ultimaLectura?.avisos?.length || 0), 0)

  return (
    <div className="planillas">
      <div className="planillas-resumen">
        {sincronizacion.map((s) => (
          <div key={s.fuente} className={`planilla ${s.error ? 'planilla--error' : ''}`}>
            <span className="rv-disco rv-disco--sm"><Icono clave={s.fuente === 'camiones' ? 'camion' : 'planilla'} /></span>
            <div className="planilla-texto">
              <strong>{s.nombre}</strong>
              <small>
                {s.ultimaLectura
                  ? <>{s.ultimaLectura.leidos} dominios · leída {haceCuanto(s.ultimaLectura.verificadoEn || s.ultimaLectura.en)}</>
                  : s.error ? 'No se pudo leer' : 'Todavía no se leyó'}
              </small>
            </div>
          </div>
        ))}
        <div className="planillas-acciones">
          <button type="button" className="boton boton-suave boton-chico" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
            {abierto ? 'Ocultar detalles' : 'Ver detalles'}
            {!abierto && avisos > 0 && <span className="cuenta-aviso">{avisos}</span>}
            <svg className={`plegar ${abierto ? 'plegar--abierto' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          {onLeer && (
            <button type="button" className="boton boton-suave boton-chico" disabled={leyendo} onClick={onLeer}>
              <Icono clave="refrescar" tamano={16} /> {leyendo ? 'Leyendo la red…' : 'Leer ahora'}
            </button>
          )}
        </div>
      </div>

      {sincronizacion.filter((s) => s.error).map((s) => (
        <p key={s.fuente} className="nota error"><b>{s.nombre}:</b> {s.error.mensaje}</p>
      ))}

      {abierto && (
        <div className="planillas-detalle">
          {sincronizacion.map((s) => (
            <div key={s.fuente} className="planilla-detalle">
              <strong>{s.nombre}</strong>
              <dl>
                <dt>Archivo</dt><dd className="ruta-larga">{s.ultimaLectura?.archivo || s.ruta}</dd>
                {s.ultimaLectura && (
                  <>
                    <dt>Última lectura</dt>
                    <dd>{haceCuanto(s.ultimaLectura.en)}: {s.ultimaLectura.nuevos} nuevos, {s.ultimaLectura.actualizados} actualizados</dd>
                    {s.ultimaLectura.verificadoEn && s.ultimaLectura.verificadoEn !== s.ultimaLectura.en && (
                      <><dt>Última verificación</dt><dd>{haceCuanto(s.ultimaLectura.verificadoEn)}, sin cambios</dd></>
                    )}
                  </>
                )}
              </dl>
              {s.ultimaLectura?.mensaje && <p className="apagado">{s.ultimaLectura.mensaje}</p>}
              {s.ultimaLectura?.avisos?.length > 0 && (
                <>
                  <p className="falta">{s.ultimaLectura.avisos.length} {s.ultimaLectura.avisos.length === 1 ? 'fila no se pudo leer bien' : 'filas no se pudieron leer bien'}:</p>
                  <ul className="avisos-lista">{s.ultimaLectura.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Flota({ vehiculos, sincronizacion, catalogo, usuario, onAbrir, onNuevo, onLeer, onLeerDocumento, leyendo }) {
  const [filtro, setFiltro] = useRecordado('automotor.flota', INICIAL)
  const [orden, setOrden] = useState({ campo: 'unidad', desc: false })

  const config = useMemo(() => ({
    texto: {
      campos: {
        dominio: (v) => v.dominio,
        patente: (v) => v.dominio,
        marca: (v) => `${v.marca} ${v.modelo} ${v.marcaChasis} ${v.modeloRegistral}`,
        modelo: (v) => `${v.modelo} ${v.modeloRegistral}`,
        chofer: (v) => v.chofer,
        responsable: (v) => v.chofer,
        unidad: (v) => v.unidad,
        estado: (v) => v.estado,
        titular: (v) => v.titular,
        localidad: (v) => v.localidad,
        sector: (v) => v.sector,
        anio: (v) => String(v.anio || ''),
        ano: (v) => String(v.anio || ''),
        chasis: (v) => v.nroChasis,
        motor: (v) => v.nroMotor,
        uso: (v) => v.uso,
      },
      compactos: ['dominio', 'patente', 'chasis', 'motor'],
    },
    facetas: { categoria: (v) => v.categoria },
    marcas: {
      faltan: (v) => v.faltan.length > 0,
      fuera: (v) => !v.enPlanilla,
      abiertos: (v) => v.tramitesAbiertos > 0,
    },
  }), [])

  const { resultado, conteos, hayFiltros } = useFiltrado(vehiculos, config, filtro)
  const lista = ordenar(resultado, orden, ORDENES)
  const set = (c) => setFiltro((f) => ({ ...f, ...c }))
  const nombreCategoria = (c) => catalogo.categorias.find((x) => x.clave === c)?.nombre || c
  const cambiarOrden = (campo) => setOrden((o) => ({ campo, desc: o.campo === campo ? !o.desc : false }))

  return (
    <>
      <section className="rv-card panel">
        <EstadoPlanillas sincronizacion={sincronizacion} onLeer={onLeer} leyendo={leyendo} />
      </section>

      {!vehiculos.length ? (
        <div className="vacio">
          <h2>La flota está vacía</h2>
          <p>
            Se carga sola desde las planillas de Camionetas y Camiones de la red. Si arriba hay un error, es eso lo que hay
            que resolver (casi siempre usuario, contraseña o la IP del servidor en el .env). Después tocá «Leer las planillas ahora».
          </p>
        </div>
      ) : (
        <section className="rv-card panel">
          <div className="filtros">
            <Buscador valor={filtro.q} onCambio={(q) => set({ q })}
                      placeholder="Buscá por dominio, unidad, chofer, marca, chasis, motor…"
                      ayuda={<><b>Cómo buscar</b>Varias palabras se suman. Para buscar en un solo dato: <code>unidad:24</code>, <code>chofer:vacante</code>, <code>año:2019</code>, <code>sector:campos</code>, <code>chasis:8avz</code>. Para excluir, un guion adelante: <code>-vendida</code>.</>} />
            <div className="barra-filtros">
              <FiltroOpciones titulo="Tipo" opciones={catalogo.categorias} valor={filtro.categoria}
                              conteos={conteos.categoria} onCambio={(categoria) => set({ categoria })} />
              <FiltroMarcas
                marcas={[
                  { clave: 'faltan', nombre: 'Faltan datos registrales', activa: filtro.faltan, conteo: conteos.faltan, aviso: true },
                  { clave: 'abiertos', nombre: 'Con trámites abiertos', activa: filtro.abiertos, conteo: conteos.abiertos },
                  { clave: 'fuera', nombre: 'Ya no figuran en la planilla', activa: filtro.fuera, conteo: conteos.fuera },
                ]}
                onCambio={(clave, si) => set({ [clave]: si })} />
            </div>
            <div className="fila-acciones">
              <Resumen mostrados={lista.length} total={vehiculos.length} nombre="vehículos" hayFiltros={hayFiltros} onLimpiar={() => setFiltro(INICIAL)} />
              {usuario.esGestor && (
                <div className="fila-acciones">
                  <button type="button" className="boton boton-chico" onClick={onLeerDocumento}>
                    <Icono clave="documento" tamano={16} /> Leer cédula o título
                  </button>
                  <button type="button" className="boton boton-suave boton-chico" onClick={onNuevo}>
                    <Icono clave="mas" tamano={16} /> Agregar a mano
                  </button>
                </div>
              )}
            </div>
          </div>

          {lista.length === 0 ? (
            <div className="vacio vacio--chico">
              <h2>Ningún vehículo coincide</h2>
              <p>Probá con menos palabras o tocá «Quitar filtros».</p>
            </div>
          ) : (
            <div className="tabla-scroll">
              <table className="rv-tabla tabla-flota">
                <thead>
                  <tr>
                    {[['dominio', 'Dominio'], ['unidad', 'Unidad'], ['marca', 'Marca y modelo'], ['anio', 'Año'], ['chofer', 'Chofer / responsable']].map(([c, n]) => (
                      <th key={c} aria-sort={orden.campo === c ? (orden.desc ? 'descending' : 'ascending') : undefined}>
                        <button type="button" onClick={() => cambiarOrden(c)}>{n}{orden.campo === c && (orden.desc ? ' ↓' : ' ↑')}</button>
                      </th>
                    ))}
                    <th>Registrales</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((v) => (
                    <tr key={v.id} onClick={() => onAbrir(v)} className={v.enPlanilla || !v.fuente ? '' : 'fuera'}>
                      <td>
                        <button type="button" className="patente patente--boton" onClick={(e) => { e.stopPropagation(); onAbrir(v) }}>{v.dominio}</button>
                        {v.tramitesAbiertos > 0 && <span className="pastilla">{v.tramitesAbiertos} abierto{v.tramitesAbiertos > 1 ? 's' : ''}</span>}
                      </td>
                      <td>
                        <span>{nombreCategoria(v.categoria)}{v.unidad && ` ${v.unidad}`}</span>
                      </td>
                      <td>
                        {[v.marca, v.modelo].filter(Boolean).join(' ') || <span className="apagado">—</span>}
                        {v.configuracion && <small className="celda-detalle">{v.configuracion}</small>}
                      </td>
                      <td className="rv-num">{v.anio || '—'}</td>
                      <td>
                        {v.chofer || <span className="apagado">—</span>}
                        {(v.estado || !v.enPlanilla) && (
                          <small className="celda-detalle">{[v.estado, v.fuente && !v.enPlanilla && 'No figura en la planilla'].filter(Boolean).join(' · ')}</small>
                        )}
                      </td>
                      <td>
                        {v.faltan.length === 0
                          ? <span className="ok-texto">Completos</span>
                          : <span className="falta">Faltan {v.faltan.length}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )
}
