import { useMemo, useState } from 'react'
import { Buscador, FiltroMarcas, FiltroOpciones, Resumen } from '../componentes/Filtros.jsx'
import { ESTADOS_VISIBLES, EstadoChip, claveVisible, desdeEstado } from '../componentes/Estado.jsx'
import { resumenVehiculo } from '../componentes/DominioInput.jsx'
import { aFecha, haceCuanto } from '../formato.js'
import { ordenar, useFiltrado, useRecordado } from '../filtros.js'
import { Icono } from '../iconos.jsx'

const INICIAL = { q: '', estado: 'ABIERTOS', tipo: '', mios: false, conmigo: false }

// "Abiertos" es lo que se mira todos los dias: todo lo que no termino.
const OPCIONES_ESTADO = [
  { clave: 'ABIERTOS', nombre: 'Abiertos' },
  ...ESTADOS_VISIBLES,
]

const ORDENES = {
  movimiento: (t) => aFecha(t.ultimoMovimiento)?.getTime() || 0,
  numero: (t) => t.id,
  dominio: (t) => t.dominio,
  estado: (t) => ESTADOS_VISIBLES.findIndex((e) => e.clave === claveVisible(t)),
  antiguedad: (t) => -(aFecha(desdeEstado(t))?.getTime() || 0),
}

export default function Bandeja({ tramites, catalogo, usuario, onAbrir, onNuevo, onTomar, ocupado }) {
  const [filtro, setFiltro] = useRecordado('automotor.bandeja', INICIAL)
  const [orden, setOrden] = useState({ campo: 'movimiento', desc: true })
  const nombreTipo = (c) => catalogo.tipos.find((t) => t.clave === c)?.nombre || c
  const nombreMotivo = (c) => catalogo.motivos.find((m) => m.clave === c)?.nombre || ''
  const nombreEstado = (c) => ESTADOS_VISIBLES.find((e) => e.clave === c)?.nombre || c

  const config = useMemo(() => ({
    texto: {
      // Alias en castellano para "campo:valor". Varios nombres para el mismo
      // campo porque nadie recuerda cual era.
      campos: {
        dominio: (t) => t.dominio,
        patente: (t) => t.dominio,
        tipo: (t) => `${nombreTipo(t.tipo)} ${t.tipo}`,
        tramite: (t) => nombreTipo(t.tipo),
        motivo: (t) => nombreMotivo(t.motivo),
        estado: (t) => nombreEstado(claveVisible(t)),
        chofer: (t) => t.vehiculo?.chofer || '',
        marca: (t) => `${t.vehiculo?.marca || ''} ${t.vehiculo?.modelo || ''}`,
        unidad: (t) => t.vehiculo?.unidad || '',
        pidio: (t) => t.solicitante?.nombre || '',
        solicitante: (t) => t.solicitante?.nombre || '',
        gestor: (t) => t.gestor?.nombre || '',
        obs: (t) => t.observaciones,
        nro: (t) => `${t.id} ${t.nroRegistro}`,
      },
      compactos: ['dominio', 'patente'],
    },
    facetas: {
      estado: {
        valor: claveVisible,
        filtro: (t, elegido) => (elegido === 'ABIERTOS' ? t.estado !== 'TERMINADO' : claveVisible(t) === elegido),
      },
      tipo: (t) => t.tipo,
    },
    marcas: {
      mios: (t) => t.solicitante?.id === usuario.id,
      conmigo: (t) => t.gestor?.id === usuario.id,
    },
  }), [catalogo, usuario.id])

  const { resultado, conteos, hayFiltros } = useFiltrado(tramites, config, filtro)
  const lista = ordenar(resultado, orden, ORDENES)
  const conteoEstados = { ...conteos.estado, ABIERTOS: Object.entries(conteos.estado || {}).filter(([k]) => k !== 'TERMINADO').reduce((s, [, n]) => s + n, 0) }
  const set = (cambio) => setFiltro((f) => ({ ...f, ...cambio }))
  const cambiarOrden = (campo) => setOrden((o) => ({ campo, desc: o.campo === campo ? !o.desc : campo === 'movimiento' || campo === 'antiguedad' }))

  if (!tramites.length) {
    return (
      <div className="vacio">
        <h2>Todavía no hay trámites cargados</h2>
        <p>
          Cargá el primero con el dominio y qué hay que hacer: una transferencia, una reposición de placas,
          un duplicado o una denuncia de venta. Después se sigue desde acá.
        </p>
        <button type="button" className="boton" onClick={onNuevo}><Icono clave="mas" tamano={18} /> Cargar un trámite</button>
      </div>
    )
  }

  return (
    <section className="rv-card panel">
      <div className="filtros">
        <Buscador
          valor={filtro.q}
          onCambio={(q) => set({ q })}
          placeholder="Buscá por dominio, chofer, unidad, marca, quién lo pidió…"
          ayuda={<><b>Cómo buscar</b>Varias palabras se suman. Para buscar en un solo dato: <code>tipo:placas</code>, <code>chofer:perez</code>, <code>unidad:24</code>, <code>estado:espera</code>. Para excluir, un guion adelante: <code>-vacante</code>.</>}
        />
        <div className="barra-filtros">
          <FiltroOpciones titulo="Estado" opciones={OPCIONES_ESTADO} valor={filtro.estado} conteos={conteoEstados}
                          total={Object.values(conteos.estado || {}).reduce((s, n) => s + n, 0)}
                          porDefecto="ABIERTOS" onCambio={(estado) => set({ estado })} />
          <FiltroOpciones titulo="Trámite" opciones={catalogo.tipos} valor={filtro.tipo}
                          conteos={conteos.tipo} onCambio={(tipo) => set({ tipo })} />
          <FiltroMarcas
            marcas={[
              { clave: 'mios', nombre: 'Los que cargué yo', activa: filtro.mios, conteo: conteos.mios },
              ...(usuario.esGestor ? [{ clave: 'conmigo', nombre: 'Tomados por mí', activa: filtro.conmigo, conteo: conteos.conmigo }] : []),
            ]}
            onCambio={(clave, si) => set({ [clave]: si })} />
        </div>
        <Resumen mostrados={lista.length} total={tramites.length} nombre="trámites"
                 hayFiltros={hayFiltros && !(filtro.estado === 'ABIERTOS' && !filtro.q && !filtro.tipo && !filtro.mios && !filtro.conmigo)}
                 onLimpiar={() => setFiltro(INICIAL)} />
      </div>

      {lista.length === 0 ? (
        <div className="vacio vacio--chico">
          <h2>Ningún trámite coincide</h2>
          <p>Probá con menos palabras o tocá «Quitar filtros». Si buscás uno terminado, elegí «Todos» en estado.</p>
        </div>
      ) : (
        <>
          <div className="orden" role="group" aria-label="Ordenar">
            <span className="fichas-titulo">Ordenar por</span>
            {[['movimiento', 'Último movimiento'], ['antiguedad', 'Más tiempo en el estado'], ['numero', 'Número'], ['dominio', 'Dominio'], ['estado', 'Estado']].map(([c, n]) => (
              <button key={c} type="button" className={`orden-btn ${orden.campo === c ? 'activo' : ''}`} onClick={() => cambiarOrden(c)}>
                {n}{orden.campo === c && (orden.desc ? ' ↓' : ' ↑')}
              </button>
            ))}
          </div>
          <ul className="filas">
            {lista.map((t) => (
              <li key={t.id} className="fila-tramite">
                <button type="button" className="fila-cuerpo" onClick={() => onAbrir(t.id)}>
                  <span className="fila-num rv-num">#{t.id}</span>
                  <span className="fila-dominio">
                    <strong className="patente">{t.dominio}</strong>
                    <small>{t.vehiculo ? resumenVehiculo(t.vehiculo) : 'No está en la flota'}</small>
                  </span>
                  <span className="fila-tipo">
                    <strong>{nombreTipo(t.tipo)}</strong>
                    <small>{[nombreMotivo(t.motivo), t.nroRegistro && `Registro: ${t.nroRegistro}`].filter(Boolean).join(' · ') || ' '}</small>
                  </span>
                  <span className="fila-estado"><EstadoChip tramite={t} conDias /></span>
                  <span className="fila-gente">
                    <small>Pidió <b>{t.solicitante?.nombre || '—'}</b></small>
                    <small>{t.gestor ? <>Gestiona <b>{t.gestor.nombre}</b></> : 'Nadie lo tomó'}</small>
                  </span>
                  <span className="fila-mov">
                    {haceCuanto(t.ultimoMovimiento)}
                    {t.notas > 0 && <small>{t.notas} {t.notas === 1 ? 'nota' : 'notas'}</small>}
                  </span>
                </button>
                {usuario.esGestor && !t.gestor && (
                  <button type="button" className="boton boton-chico fila-accion" disabled={ocupado} onClick={() => onTomar(t.id)}>
                    Tomar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
