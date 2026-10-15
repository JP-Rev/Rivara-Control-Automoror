import { useState } from 'react'
import * as api from '../api.js'
import { EstadoChip } from '../componentes/Estado.jsx'
import Modal from '../componentes/Modal.jsx'
import { TIPOS_REGISTRALES, USOS, fechaHora } from '../formato.js'

// Los datos que vienen de la planilla y los que se cargan a mano, separados:
// los primeros los puede pisar la proxima lectura de la red (salvo que se
// corrijan aca, y entonces quedan marcados), los segundos solo cambian desde
// aca.
const PLANILLA = [
  ['unidad', 'Unidad (Nº interno)'], ['rol', 'Rol en la unidad'], ['marca', 'Marca'], ['modelo', 'Modelo'],
  ['configuracion', 'Tipo / cabina'], ['anio', 'Año'], ['chofer', 'Chofer / responsable'], ['estado', 'Estado'],
  ['titular', 'Titular'], ['localidad', 'Localidad'], ['sector', 'Sector'],
]
const REGISTRALES = [
  ['marcaChasis', 'Marca de chasis'], ['nroChasis', 'Nº de chasis'],
  ['marcaMotor', 'Marca de motor'], ['nroMotor', 'Nº de motor'],
  ['uso', 'Uso', 'usos'], ['tipoRegistral', 'Tipo (como figura en el título)', 'tipos-registrales'],
  ['modeloRegistral', 'Modelo (como figura en el título)'],
]
// Nombre de columna (lo que devuelve "manuales") -> campo de la API.
const COLUMNA_A_CAMPO = { configuracion: 'configuracion', anio: 'anio' }

export default function Vehiculo({ vehiculo, catalogo, usuario, tramites, onGuardado, onNuevoTramite, onAbrirTramite, onCerrar }) {
  const nuevo = !vehiculo
  const editable = usuario.esGestor
  const [f, setF] = useState(() => {
    const base = { dominio: '', categoria: 'CAMIONETA', observaciones: '' }
    for (const [k] of [...PLANILLA, ...REGISTRALES]) base[k] = ''
    return vehiculo ? { ...base, ...Object.fromEntries(Object.entries(vehiculo).map(([k, v]) => [k, v ?? ''])) } : base
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState(false)
  const manuales = new Set((vehiculo?.manuales || []).map((c) => COLUMNA_A_CAMPO[c] || c))
  const delDominio = vehiculo ? tramites.filter((t) => t.dominio === vehiculo.dominio) : []

  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setListo(false) }

  async function guardar(e, extra = {}) {
    e?.preventDefault()
    setError('')
    setGuardando(true)
    try {
      const datos = { categoria: f.categoria, observaciones: f.observaciones, ...extra }
      for (const [k] of [...PLANILLA, ...REGISTRALES]) datos[k] = f[k]
      const { vehiculo: v } = nuevo ? await api.crearVehiculo({ ...datos, dominio: f.dominio }) : await api.editarVehiculo(vehiculo.id, datos)
      onGuardado(v)
      setListo(true)
      if (nuevo) onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const campo = (k, etiqueta, lista) => (
    <label key={k} className={manuales.has(k) ? 'corregido' : ''}>
      <span>{etiqueta}{manuales.has(k) && <small> · corregido a mano</small>}</span>
      <input type={k === 'anio' ? 'number' : 'text'} value={f[k]} list={lista} readOnly={!editable}
             onChange={(e) => set(k, e.target.value)} />
    </label>
  )

  return (
    <Modal titulo={nuevo ? 'Agregar un vehículo' : `Vehículo ${vehiculo.dominio}`} tamano="ancho" onCerrar={onCerrar}>
      <form className="forma" onSubmit={guardar}>
        {nuevo ? (
          <div className="forma-fila">
            <label>Dominio<input type="text" value={f.dominio} autoCapitalize="characters" onChange={(e) => set('dominio', e.target.value)} /></label>
            <label>
              Tipo de vehículo
              <select value={f.categoria} onChange={(e) => set('categoria', e.target.value)}>
                {catalogo.categorias.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
              </select>
            </label>
          </div>
        ) : (
          <p className="apagado">
            <b className="patente">{vehiculo.dominio}</b>{' '}
            {catalogo.categorias.find((c) => c.clave === vehiculo.categoria)?.nombre} · {vehiculo.origen}
            {vehiculo.fuente && !vehiculo.enPlanilla && <span className="falta"> · Ya no figura en la planilla</span>}
          </p>
        )}

        <fieldset className="opciones">
          <legend>Datos registrales <span className="apagado">(no están en la planilla: se cargan acá)</span></legend>
          {!nuevo && vehiculo.faltan.length > 0 && (
            <p className="falta">Faltan: {vehiculo.faltan.map((c) => catalogo.camposRegistrales.find((x) => x.clave === c)?.nombre).join(', ')}</p>
          )}
          <div className="grilla-campos">
            {REGISTRALES.map(([k, n, lista]) => campo(k, n, lista))}
          </div>
          <datalist id="tipos-registrales">{TIPOS_REGISTRALES.map((t) => <option key={t} value={t} />)}</datalist>
          <datalist id="usos">{USOS.map((t) => <option key={t} value={t} />)}</datalist>
        </fieldset>

        <fieldset className="opciones">
          <legend>
            De la planilla{' '}
            <span className="apagado">
              {nuevo ? '(opcional)' : '(se actualizan solos al leer la red; si corregís uno, queda fijo)'}
            </span>
          </legend>
          <div className="grilla-campos">
            {PLANILLA.map(([k, n]) => campo(k, n))}
          </div>
          {editable && manuales.size > 0 && (
            <button type="button" className="link" disabled={guardando}
                    onClick={() => guardar(null, { liberar: [...manuales] })}>
              Volver a tomar de la planilla lo corregido a mano
            </button>
          )}
        </fieldset>

        <label>
          Observaciones
          <textarea rows={2} value={f.observaciones} readOnly={!editable} onChange={(e) => set('observaciones', e.target.value)} />
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        {listo && <p className="nota ok" role="status">Guardado.</p>}

        {editable && (
          <div className="forma-acciones">
            <button type="submit" className="boton" disabled={guardando}>{guardando ? 'Guardando…' : nuevo ? 'Agregar' : 'Guardar'}</button>
            <button type="button" className="boton boton-suave" onClick={onCerrar}>Cerrar</button>
          </div>
        )}
      </form>

      {!nuevo && (
        <section className="detalle-bloque detalle-bloque--separado">
          <div className="fila-acciones">
            <h4 className="rv-eyebrow">Trámites de este dominio</h4>
            <button type="button" className="boton boton-chico" onClick={() => onNuevoTramite(vehiculo.dominio)}>Nuevo trámite</button>
          </div>
          {delDominio.length === 0 ? (
            <p className="apagado">Nunca se le hizo un trámite desde acá.</p>
          ) : (
            <ul className="mini-lista">
              {delDominio.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => onAbrirTramite(t.id)}>
                    <span>#{t.id} · {catalogo.tipos.find((x) => x.clave === t.tipo)?.nombre}</span>
                    <EstadoChip tramite={t} />
                    <small className="apagado">{fechaHora(t.creadoEn)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Modal>
  )
}
