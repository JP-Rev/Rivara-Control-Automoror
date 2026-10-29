import { useState } from 'react'
import Modal from '../componentes/Modal.jsx'
import Selector from '../componentes/Selector.jsx'
import SiNo, { VOLUNTAD_DE_PAGO } from '../componentes/SiNo.jsx'
import { marcaYModeloSugeridos } from '../formato.js'
import { Icono } from '../iconos.jsx'

// DDJJ Anexo 08 D de una transferencia (Disp. D.N. 38/2018), con la voluntad
// de pago de la Disp. 142/2024. Arranca con lo que sabe la flota y el
// tramite; lo que quede vacio sale en la hoja como la linea punteada del
// formulario, para completar a mano.
//
// Los datos del automotor son los del TITULO (marca de chasis, tipo y modelo
// registral), no los de la planilla.

// Las observaciones entran en cinco renglones del formulario.
const MAX_OBSERVACIONES = 420

function valoresIniciales(t, catalogo) {
  const v = t.vehiculo
  const previo = t.transferencia?.anexo
  const sugerido = marcaYModeloSugeridos(v)
  const de = (campo, alternativa = '') => previo?.[campo] ?? alternativa
  return {
    lugar: de('lugar', catalogo.ddjj.lugar),
    // La fecha es la de la transferencia, no la de hoy: se pregunta (y se
    // recuerda para reimprimir igual).
    fecha: t.transferencia?.fecha || de('fecha'),
    hora: t.transferencia?.hora || de('hora'),
    registro: de('registro', catalogo.ddjj.registro),
    solicitud: t.transferencia?.solicitud08d || de('solicitud'),
    marca: de('marca', v?.marcaChasis || sugerido.marca),
    tipo: de('tipo', v?.tipoRegistral || ''),
    modelo: de('modelo', v?.modeloRegistral || sugerido.modelo),
    marcaMotor: de('marcaMotor', v?.marcaMotor || (v?.categoria !== 'ACOPLADO' ? v?.marcaChasis : '') || ''),
    nroMotor: de('nroMotor', v?.nroMotor || ''),
    marcaChasis: de('marcaChasis', v?.marcaChasis || ''),
    nroChasis: de('nroChasis', v?.nroChasis || ''),
    observaciones: de('observaciones'),
    sellos: t.transferencia?.sellos || '',
    patentes: t.transferencia?.patentes || '',
    infracciones: t.transferencia?.infracciones || '',
  }
}

export default function Anexo08d({ tramite, catalogo, usuario, onListo, onCerrar }) {
  const [f, setF] = useState(() => valoresIniciales(tramite, catalogo))
  const faltabaAlgo = ['marca', 'tipo', 'modelo', 'nroMotor', 'nroChasis'].some((k) => !f[k])
  const [guardar, setGuardar] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const lista = (nombre) => (catalogo.listas?.[nombre] || []).map((v) => ({ clave: v, nombre: v }))
  const sinPago = VOLUNTAD_DE_PAGO.filter(([k]) => !f[k]).map(([, n]) => n.toLowerCase())

  async function generar(e) {
    e.preventDefault()
    setError('')
    if (!f.fecha) return setError('Indicá qué día se hace la transferencia: la DDJJ lleva esa misma fecha.')
    if (!f.hora) return setError('Indicá a qué hora es la transferencia: media hora antes llega el aviso por mail.')
    // La ventana se abre en el clic: si se abre despues del fetch, el
    // navegador la toma como popup no pedido y la bloquea.
    const ventana = window.open('', '_blank')
    setEnviando(true)
    try {
      const res = await fetch(`/api/tramites/${tramite.id}/anexo08d`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, guardarEnVehiculo: guardar }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo generar el PDF')
      const url = URL.createObjectURL(await res.blob())
      if (ventana) {
        ventana.location.href = url
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = `Anexo-08D-${tramite.dominio}.pdf`
        a.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      onListo()
    } catch (err) {
      ventana?.close()
      setError(err.message)
      setEnviando(false)
    }
  }

  const campo = (k, etiqueta, props = {}) => (
    <label className={`${props.crece ? 'crece' : ''} ${!f[k] && props.importante ? 'dato-ddjj dato-ddjj--falta' : ''}`}>
      {etiqueta}
      {props.sugerencias
        ? <Selector libre valor={f[k]} opciones={props.sugerencias} placeholder={props.placeholder} onCambio={(v) => set(k, v)} />
        : <input type={props.tipo || 'text'} value={f[k]} placeholder={props.placeholder} onChange={(e) => set(k, e.target.value)} />}
    </label>
  )

  return (
    <Modal titulo={`Anexo 08 D · ${tramite.dominio}`} tamano="ancho" onCerrar={onCerrar}>
      <form className="forma" onSubmit={generar}>
        <p className="nota">
          Enmiendas de la solicitud de transferencia digital (Disp. D.N. 38/2018). Lo que quede vacío se imprime como la
          línea punteada del formulario, para completar a mano.
        </p>

        <div className="forma-fila">
          <label className={!f.fecha ? 'dato-ddjj dato-ddjj--falta' : ''}>
            ¿Qué día se hace la transferencia?
            <input type="date" value={f.fecha} required onChange={(e) => set('fecha', e.target.value)} />
            <small className="ayuda-campo">La DDJJ lleva esa misma fecha.</small>
          </label>
          <label className={!f.hora ? 'dato-ddjj dato-ddjj--falta' : ''}>
            ¿A qué hora?
            <input type="time" value={f.hora} required onChange={(e) => set('hora', e.target.value)} />
            <small className="ayuda-campo">
              {catalogo.avisos?.habilitado
                ? `Aviso por mail a ${catalogo.avisos.para.join(', ')} media hora antes.`
                : 'Sin aviso por mail: falta configurar el SMTP del servidor.'}
            </small>
          </label>
        </div>
        <div className="forma-fila">
          {campo('lugar', 'Lugar')}
        </div>
        <div className="forma-fila">
          {campo('registro', 'Al Sr. Encargado del Registro Automotor', { crece: true, placeholder: 'Registro Seccional Nº 01292 - Alberti' })}
          {campo('solicitud', 'Solicitud tipo 08 D Nº', { placeholder: 'Nº de la solicitud' })}
        </div>

        <fieldset className="opciones">
          <legend>Datos del automotor <span className="apagado">(como figuran en el título)</span></legend>
          <p className="apagado">Dominio <b className="patente">{tramite.dominio}</b></p>
          <div className="grilla-campos">
            {campo('marca', 'Marca', { sugerencias: lista('marcas'), importante: true })}
            {campo('tipo', 'Tipo', { sugerencias: lista('tiposRegistrales'), importante: true })}
            {campo('modelo', 'Modelo', { importante: true })}
            {campo('marcaMotor', 'Marca motor', { sugerencias: lista('marcasMotor') })}
            {campo('nroMotor', 'Nº motor', { importante: true })}
            {campo('marcaChasis', 'Marca chasis', { sugerencias: lista('marcas') })}
            {campo('nroChasis', 'Nº chasis', { importante: true })}
          </div>
        </fieldset>

        <label>
          <span>Observaciones <span className="apagado">(qué hay que enmendar · entra en cinco renglones)</span></span>
          <textarea rows={4} maxLength={MAX_OBSERVACIONES} value={f.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
          <small className="ayuda-campo">{f.observaciones.length} / {MAX_OBSERVACIONES}</small>
        </label>

        <fieldset className="opciones">
          <legend>Manifestación de voluntad de pago <span className="apagado">(Disp. 142/2024 DNRPA)</span></legend>
          <div className="voluntad voluntad--detalle">
            {VOLUNTAD_DE_PAGO.map(([k, nombre]) => (
              <SiNo key={k} etiqueta={`Opta abonar ${nombre.toLowerCase()}`} valor={f[k]} onCambio={(v) => set(k, v)} />
            ))}
          </div>
          {sinPago.length > 0 && <small className="ayuda-campo">Sin marcar: {sinPago.join(', ')}. En la hoja quedan SI y NO sin circular.</small>}
        </fieldset>

        {usuario.esGestor && faltabaAlgo && (
          <label className="check">
            <input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} />
            Guardar los datos del automotor en la flota, para no volver a pedirlos
          </label>
        )}

        {error && <p className="error" role="alert">{error}</p>}

        <div className="forma-acciones">
          <button type="submit" className="boton" disabled={enviando}>
            <Icono clave="impresora" tamano={18} /> {enviando ? 'Generando…' : 'Generar PDF para imprimir'}
          </button>
          <button type="button" className="boton boton-suave" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
