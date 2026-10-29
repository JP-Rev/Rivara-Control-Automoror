import { useRef, useState } from 'react'
import * as api from '../api.js'
import Modal from '../componentes/Modal.jsx'
import Selector from '../componentes/Selector.jsx'
import { Icono } from '../iconos.jsx'

// Datos de una de las partes de una transferencia o una denuncia de venta:
// el comprador o, en las transferencias, el vendedor.
//
// Se cargan a mano o leyendo el DNI: lo leido completa el formulario y nada
// se guarda hasta tocar "Guardar". Del dorso se lee la zona de lectura
// mecanica (MRZ), que trae digitos de control: si verifica, apellido,
// nombres, DNI y fecha de nacimiento son confiables. El domicilio no tiene
// control y el CUIL se calcula: esos dos hay que mirarlos siempre.
//
// Los campos son los que pide la Transferencia Digital del DNRPA, que los
// completa el bot (bot-dnrpa/): estado civil, ocupacion, conyuge y el
// domicilio por partes. La foto no se guarda: solo los datos.

const VACIO_COMPRADOR = {
  apellido: '', nombres: '', dni: '', cuil: '', sexo: '', fechaNacimiento: '', nacionalidad: '', estadoCivil: '', ocupacion: '',
  calle: '', numero: '', piso: '', depto: '', localidad: '', partido: '', provincia: '', cp: '', domicilio: '',
  conyugeDni: '', conyugeNombre: '', conyugeApellido: '', caracterBien: '', telefono: '', email: '',
}
const VACIO_VENDEDOR = { tipo: 'FISICA', apellido: '', nombres: '', dni: '', cuil: '', estadoCivil: '', razonSocial: '' }
const SEXOS = [{ clave: 'M', nombre: 'Masculino' }, { clave: 'F', nombre: 'Femenino' }, { clave: 'X', nombre: 'No binario (X)' }]
const ES_EMPRESA = /\b(S\.?\s?A\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?\s?S\.?|SOCIEDAD|COOPERATIVA|LTDA)\b/i

function iniciales(tramite, rol) {
  if (rol === 'comprador') return { ...VACIO_COMPRADOR, ...(tramite.comprador || {}) }
  if (tramite.vendedor) return { ...VACIO_VENDEDOR, ...tramite.vendedor }
  // Sin vendedor cargado: si el titular de la flota es una empresa, se
  // arranca por ahi.
  const titular = tramite.vehiculo?.titular || ''
  return ES_EMPRESA.test(titular) ? { ...VACIO_VENDEDOR, tipo: 'JURIDICA', razonSocial: titular.toUpperCase() } : { ...VACIO_VENDEDOR }
}

export default function Persona({ tramite, rol = 'comprador', catalogo, onGuardado, onCerrar }) {
  const esComprador = rol === 'comprador'
  const [f, setF] = useState(() => iniciales(tramite, rol))
  const [verificado, setVerificado] = useState(Boolean(tramite[rol]?.verificado))
  const [lectura, setLectura] = useState(null) // { avisos, verificado, cuilCalculado }
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const entrada = useRef(null)
  const camara = useRef(null)
  const juridica = !esComprador && f.tipo === 'JURIDICA'
  const lista = (nombre) => (catalogo?.listas?.[nombre] || []).map((v) => ({ clave: v, nombre: v }))

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
      // Del vendedor solo interesa la identidad; del comprador, todo.
      const campos = esComprador ? persona : { apellido: persona.apellido, nombres: persona.nombres, dni: persona.dni, cuil: persona.cuil }
      // Lo leido completa el formulario, pero lo que no se pudo leer no borra
      // lo que ya estaba escrito.
      setF((x) => ({ ...x, ...Object.fromEntries(Object.entries(campos).filter(([, v]) => v)) }))
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
    if (juridica) {
      if (!f.razonSocial.trim()) return setError('Completá la razón social.')
    } else if (!f.apellido.trim() || !f.dni.trim()) {
      return setError('Completá al menos apellido y DNI.')
    }
    setGuardando(true)
    try {
      const r = await api.editarTramite(tramite.id, { [rol]: { ...f, verificado: juridica ? false : verificado } })
      onGuardado(r)
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  const campo = (k, etiqueta, props = {}) => (
    <label className={props.crece ? 'crece' : ''}>
      <span>{etiqueta}{props.ayuda && <small className="ayuda-campo"> · {props.ayuda}</small>}</span>
      <input type={props.tipo || 'text'} value={f[k]} inputMode={props.inputMode} autoComplete="off" placeholder={props.placeholder}
             onChange={(e) => set(k, e.target.value)} />
    </label>
  )
  const opciones = (k, etiqueta, ops, props = {}) => (
    <label className={props.crece ? 'crece' : ''}>
      {etiqueta}
      <Selector libre={props.libre} valor={f[k]} opciones={ops} onCambio={(v) => set(k, v)} placeholder={props.placeholder || 'Elegí'} />
    </label>
  )

  return (
    <Modal titulo={esComprador ? 'Datos del comprador' : 'Datos del vendedor'} tamano="ancho" onCerrar={onCerrar}>
      <form className="forma" onSubmit={guardar}>
        {!esComprador && (
          <div className="pasos" role="group" aria-label="Tipo de persona">
            {[['FISICA', 'Persona física'], ['JURIDICA', 'Persona jurídica']].map(([k, n]) => (
              <button key={k} type="button" className={`paso ${f.tipo === k ? 'paso--actual' : ''}`} aria-pressed={f.tipo === k}
                      onClick={() => set('tipo', k)}>{n}</button>
            ))}
          </div>
        )}

        {!juridica && (
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
        )}

        {lectura && !juridica && (
          <div className={`nota ${lectura.verificado ? 'ok' : ''}`}>
            {lectura.verificado
              ? <p><b>DNI verificado</b> con los dígitos de control: apellido, nombres, número y fecha de nacimiento son correctos.</p>
              : <p>Se leyó el DNI pero <b>no se pudo verificar</b>: revisá cada dato contra la foto.</p>}
            {lectura.avisos?.length > 0 && <ul className="avisos-lista">{lectura.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
          </div>
        )}

        {juridica ? (
          <div className="forma-fila">
            {campo('razonSocial', 'Razón social', { crece: true })}
            {campo('cuil', 'CUIT', { inputMode: 'numeric' })}
          </div>
        ) : (
          <>
            <div className="forma-fila">
              {campo('apellido', 'Apellido', { crece: true })}
              {campo('nombres', 'Nombres', { crece: true })}
            </div>
            <div className="forma-fila">
              {campo('dni', 'DNI', { inputMode: 'numeric' })}
              {campo('cuil', esComprador ? 'CUIL / CUIT' : 'CUIT / CUIL', { ayuda: lectura?.cuilCalculado ? 'calculado: verificalo' : '' })}
              {esComprador && opciones('sexo', 'Sexo', SEXOS)}
            </div>
            {esComprador ? (
              <>
                <div className="forma-fila">
                  {campo('fechaNacimiento', 'Fecha de nacimiento', { tipo: 'date' })}
                  {campo('nacionalidad', 'Nacionalidad')}
                </div>
                <div className="forma-fila">
                  {opciones('estadoCivil', 'Estado civil', lista('estadosCiviles'))}
                  {campo('ocupacion', 'Ocupación', { crece: true, placeholder: 'Empleado, comerciante…' })}
                </div>
              </>
            ) : (
              <div className="forma-fila">
                {opciones('estadoCivil', 'Estado civil al comprar el vehículo', lista('estadosCiviles'))}
              </div>
            )}
          </>
        )}

        {esComprador && f.estadoCivil === 'Casado' && (
          <fieldset className="opciones">
            <legend>Cónyuge</legend>
            <div className="forma-fila">
              {campo('conyugeApellido', 'Apellido', { crece: true })}
              {campo('conyugeNombre', 'Nombres', { crece: true })}
            </div>
            <div className="forma-fila">
              {campo('conyugeDni', 'DNI', { inputMode: 'numeric' })}
              {opciones('caracterBien', 'Carácter del bien', lista('caracterBien'))}
            </div>
          </fieldset>
        )}

        {esComprador && (
          <fieldset className="opciones">
            <legend>Domicilio <span className="apagado">(el del DNI · revisalo: el DNI no lo verifica)</span></legend>
            {f.domicilio && <p className="apagado">Leído: {f.domicilio}</p>}
            <div className="forma-fila">
              {campo('calle', 'Calle', { crece: true })}
              {campo('numero', 'Nº')}
              {campo('piso', 'Piso')}
              {campo('depto', 'Dpto')}
            </div>
            <div className="forma-fila">
              {campo('localidad', 'Localidad', { crece: true })}
              {campo('partido', 'Partido', { crece: true })}
            </div>
            <div className="forma-fila">
              {opciones('provincia', 'Provincia', lista('provincias'), { crece: true, libre: true })}
              {campo('cp', 'Código postal', { inputMode: 'numeric' })}
            </div>
          </fieldset>
        )}

        {esComprador && (
          <div className="forma-fila">
            {campo('telefono', 'Teléfono', { inputMode: 'tel' })}
            {campo('email', 'Email', { tipo: 'email' })}
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="forma-acciones">
          <button type="submit" className="boton" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="boton boton-suave" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
