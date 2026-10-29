import { useRef, useState } from 'react'
import * as api from '../api.js'
import Modal from '../componentes/Modal.jsx'
import Selector from '../componentes/Selector.jsx'
import { Icono } from '../iconos.jsx'

// Datos del comprador de una transferencia o una denuncia de venta.
//
// Se cargan a mano o leyendo el DNI: lo leido completa el formulario y nada
// se guarda hasta tocar "Guardar". Del dorso se lee la zona de lectura
// mecanica (MRZ), que trae digitos de control: si verifica, apellido,
// nombres, DNI y fecha de nacimiento son confiables. El domicilio no tiene
// control y el CUIL se calcula: esos dos hay que mirarlos siempre.
//
// La foto no se guarda: solo los datos.

const VACIO = { apellido: '', nombres: '', dni: '', cuil: '', sexo: '', fechaNacimiento: '', nacionalidad: '', domicilio: '', telefono: '', email: '' }
const SEXOS = [{ clave: 'M', nombre: 'Masculino' }, { clave: 'F', nombre: 'Femenino' }, { clave: 'X', nombre: 'No binario (X)' }]

export default function Comprador({ tramite, onGuardado, onCerrar }) {
  const [f, setF] = useState({ ...VACIO, ...(tramite.comprador || {}) })
  const [verificado, setVerificado] = useState(Boolean(tramite.comprador?.verificado))
  const [lectura, setLectura] = useState(null) // { avisos, verificado, cuilCalculado }
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const entrada = useRef(null)
  const camara = useRef(null)

  const set = (k, v) => {
    setF((x) => ({ ...x, [k]: v }))
    // Si se corrige a mano un dato que vino verificado, deja de estarlo.
    if (['apellido', 'nombres', 'dni', 'fechaNacimiento'].includes(k)) setVerificado(false)
  }

  async function leer(archivo) {
    if (!archivo) return
    setError('')
    setLeyendo(true)
    try {
      const r = await api.leerDni(archivo)
      if (!r.persona) {
        setLectura({ avisos: r.avisos, verificado: false })
        return
      }
      const { vencimiento, cuilCalculado, ...persona } = r.persona
      // Lo leido completa el formulario, pero lo que no se pudo leer no borra
      // lo que ya estaba escrito (telefono, email).
      setF((x) => ({ ...x, ...Object.fromEntries(Object.entries(persona).filter(([, v]) => v)) }))
      setVerificado(r.verificado)
      setLectura({ avisos: r.avisos, verificado: r.verificado, cuilCalculado, vencimiento })
    } catch (e) {
      setError(e.message)
    } finally {
      setLeyendo(false)
    }
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!f.apellido.trim() || !f.dni.trim()) return setError('Completá al menos apellido y DNI.')
    setGuardando(true)
    try {
      const r = await api.editarTramite(tramite.id, { comprador: { ...f, verificado } })
      onGuardado(r)
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  const campo = (k, etiqueta, props = {}) => (
    <label className={props.crece ? 'crece' : ''}>
      <span>{etiqueta}{props.ayuda && <small className="ayuda-campo"> · {props.ayuda}</small>}</span>
      <input type={props.tipo || 'text'} value={f[k]} inputMode={props.inputMode} autoComplete="off"
             onChange={(e) => set(k, e.target.value)} />
    </label>
  )

  return (
    <Modal titulo="Datos del comprador" tamano="ancho" onCerrar={onCerrar}>
      <form className="forma" onSubmit={guardar}>
        <div className="lector-dni">
          <span className="rv-disco rv-disco--sm"><Icono clave="perfil" tamano={20} /></span>
          <div>
            <strong>Leer el DNI</strong>
            <p className="apagado">Mejor el <b>dorso</b> (las líneas con «&lt;&lt;&lt;»): se verifica solo. Con buena luz y de frente.</p>
          </div>
          <div className="fila-acciones">
            <button type="button" className="boton boton-chico" disabled={leyendo} onClick={() => entrada.current?.click()}>
              {leyendo ? 'Leyendo…' : 'Elegir foto'}
            </button>
            <button type="button" className="boton boton-suave boton-chico" disabled={leyendo} onClick={() => camara.current?.click()}>Sacar foto</button>
          </div>
          <input ref={entrada} type="file" hidden accept="image/*,application/pdf" onChange={(e) => { leer(e.target.files?.[0]); e.target.value = '' }} />
          <input ref={camara} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { leer(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        {lectura && (
          <div className={`nota ${lectura.verificado ? 'ok' : ''}`}>
            {lectura.verificado
              ? <p><b>DNI verificado</b> con los dígitos de control: apellido, nombres, número y fecha de nacimiento son correctos.</p>
              : <p>Se leyó el DNI pero <b>no se pudo verificar</b>: revisá cada dato contra la foto.</p>}
            {lectura.avisos?.length > 0 && <ul className="avisos-lista">{lectura.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
          </div>
        )}

        <div className="forma-fila">
          {campo('apellido', 'Apellido', { crece: true })}
          {campo('nombres', 'Nombres', { crece: true })}
        </div>
        <div className="forma-fila">
          {campo('dni', 'DNI', { inputMode: 'numeric' })}
          {campo('cuil', 'CUIL / CUIT', { ayuda: lectura?.cuilCalculado ? 'calculado: verificalo' : '' })}
          <label>
            Sexo
            <Selector valor={f.sexo} opciones={SEXOS} onCambio={(v) => set('sexo', v)} placeholder="Elegí" />
          </label>
        </div>
        <div className="forma-fila">
          {campo('fechaNacimiento', 'Fecha de nacimiento', { tipo: 'date' })}
          {campo('nacionalidad', 'Nacionalidad')}
        </div>
        <div className="forma-fila">
          {campo('domicilio', 'Domicilio', { crece: true, ayuda: lectura ? 'revisalo: el DNI no lo verifica' : '' })}
        </div>
        <div className="forma-fila">
          {campo('telefono', 'Teléfono', { inputMode: 'tel' })}
          {campo('email', 'Email', { tipo: 'email' })}
        </div>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="forma-acciones">
          <button type="submit" className="boton" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="boton boton-suave" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
