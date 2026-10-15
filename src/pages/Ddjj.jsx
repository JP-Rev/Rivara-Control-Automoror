import { useState } from 'react'
import * as api from '../api.js'
import Modal from '../componentes/Modal.jsx'
import Selector from '../componentes/Selector.jsx'
import { TIPOS_REGISTRALES, hoyISO, marcaYModeloSugeridos } from '../formato.js'
import { Icono } from '../iconos.jsx'

// Formulario de la DDJJ de extravio. Arranca con lo que la flota sabe del
// vehiculo y marca lo que falta; lo que quede en blanco sale en la hoja como
// una linea para completar a mano, igual que el formulario de papel.
//
// Tres origenes para cada dato, y se ven distintos:
//   · de la flota (cargado por alguien): se usa tal cual;
//   · sugerido desde la planilla (VW Amarok -> VOLKSWAGEN): se usa pero se
//     marca para revisar, porque el Registro lo quiere como esta en el titulo;
//   · falta: se pide.
function valoresIniciales(tramite, catalogo) {
  const v = tramite.vehiculo
  const previo = tramite.ddjj
  const sugerido = marcaYModeloSugeridos(v)
  const def = catalogo.tipos.find((t) => t.clave === tramite.tipo)

  const dato = (registral, sugerencia) => {
    if (registral) return { valor: registral, origen: 'flota' }
    if (sugerencia) return { valor: sugerencia, origen: 'sugerido' }
    return { valor: '', origen: 'falta' }
  }

  const documentos = { cedula: '', cedulaAutorizado: '', titulo: '', placas: '' }
  // Las placas llevan el numero de dominio; el titulo y la cedula, el numero
  // de control impreso en el documento, que solo se sabe si se tiene a mano.
  if (def?.ddjj === 'placas') documentos.placas = tramite.dominio

  return {
    lugar: previo?.lugar || catalogo.ddjj.lugar,
    fecha: hoyISO(),
    seccional: previo?.seccional || catalogo.ddjj.seccional,
    documentos: previo?.documentos || documentos,
    marcados: previo
      ? Object.fromEntries(Object.entries(previo.documentos).map(([k, val]) => [k, Boolean(val)]))
      : { ...Object.fromEntries(Object.keys(documentos).map((k) => [k, false])), [def?.ddjj]: true },
    marca: previo?.marca ? { valor: previo.marca, origen: 'flota' } : dato(v?.marcaChasis, sugerido.marca),
    tipo: previo?.tipo ? { valor: previo.tipo, origen: 'flota' } : dato(v?.tipoRegistral, ''),
    modelo: previo?.modelo ? { valor: previo.modelo, origen: 'flota' } : dato(v?.modeloRegistral, sugerido.modelo),
    motor: previo?.motor ? { valor: previo.motor, origen: 'flota' } : dato(v?.nroMotor, ''),
    declaranteNombre: previo?.declaranteNombre || '',
    declaranteDocumento: previo?.declaranteDocumento || '',
  }
}

const ETIQUETA_ORIGEN = {
  sugerido: 'Sugerido desde la planilla: revisalo contra el título',
  falta: 'Falta: completalo o dejalo en blanco para escribirlo a mano',
}

export default function Ddjj({ tramite, catalogo, usuario, onListo, onCerrar }) {
  const [f, setF] = useState(() => valoresIniciales(tramite, catalogo))
  const faltabaAlgo = ['marca', 'tipo', 'modelo', 'motor'].some((k) => f[k].origen !== 'flota')
  const [guardar, setGuardar] = useState(usuario.esGestor && faltabaAlgo)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const set = (k, valor) => setF((x) => ({ ...x, [k]: valor }))
  const setDato = (k, valor) => setF((x) => ({ ...x, [k]: { valor, origen: valor ? 'escrito' : 'falta' } }))
  const setDoc = (k, valor) => setF((x) => ({ ...x, documentos: { ...x.documentos, [k]: valor } }))
  const marcar = (k, si) => setF((x) => ({
    ...x,
    marcados: { ...x.marcados, [k]: si },
    // Las placas se completan solas con el dominio al marcarlas.
    documentos: { ...x.documentos, [k]: si ? (x.documentos[k] || (k === 'placas' ? tramite.dominio : '')) : '' },
  }))

  async function generar(e) {
    e.preventDefault()
    setError('')
    // La ventana se abre ahora, en el clic: si se abre despues del fetch, el
    // navegador la toma como popup no pedido y la bloquea.
    const ventana = window.open('', '_blank')
    setEnviando(true)
    try {
      const documentos = Object.fromEntries(Object.entries(f.documentos).map(([k, val]) => [k, f.marcados[k] ? val : '']))
      const blob = await api.ddjj(tramite.id, {
        lugar: f.lugar, fecha: f.fecha, seccional: f.seccional, documentos,
        marca: f.marca.valor, tipo: f.tipo.valor, modelo: f.modelo.valor, motor: f.motor.valor,
        declaranteNombre: f.declaranteNombre, declaranteDocumento: f.declaranteDocumento,
        guardarEnVehiculo: guardar,
      })
      const url = URL.createObjectURL(blob)
      if (ventana) {
        ventana.location.href = url
      } else {
        // Popups bloqueados igual: se descarga.
        const a = document.createElement('a')
        a.href = url
        a.download = `DDJJ-extravio-${tramite.dominio}.pdf`
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

  const campoDato = (k, etiqueta, opciones = {}) => (
    <label className={`dato-ddjj dato-ddjj--${f[k].origen}`}>
      {etiqueta}
      {opciones.sugerencias
        ? <Selector libre valor={f[k].valor} opciones={opciones.sugerencias} placeholder={opciones.placeholder}
                    onCambio={(v) => setDato(k, v)} />
        : <input type="text" value={f[k].valor} placeholder={opciones.placeholder} onChange={(e) => setDato(k, e.target.value)} />}
      {ETIQUETA_ORIGEN[f[k].origen] && <small>{ETIQUETA_ORIGEN[f[k].origen]}</small>}
    </label>
  )

  return (
    <Modal titulo={`DDJJ de extravío · ${tramite.dominio}`} tamano="ancho" onCerrar={onCerrar}>
      <form className="forma" onSubmit={generar}>
        <p className="nota">
          Disposición D.N. Nº 235/03. Revisá los datos: salen en la hoja tal cual. Lo que quede vacío se imprime
          como una línea para completar a mano.
        </p>

        <div className="forma-fila">
          <label>Lugar<input type="text" value={f.lugar} onChange={(e) => set('lugar', e.target.value)} /></label>
          <label>Fecha<input type="date" value={f.fecha} onChange={(e) => set('fecha', e.target.value)} /></label>
          <label>Registro, sección<input type="text" value={f.seccional} placeholder="01292" onChange={(e) => set('seccional', e.target.value)} /></label>
        </div>

        <fieldset className="opciones">
          <legend>¿Qué se extravió?</legend>
          {catalogo.documentosDdjj.map(({ clave, etiqueta }) => (
            <div key={clave} className="doc-ddjj">
              <label className="check">
                <input type="checkbox" checked={Boolean(f.marcados[clave])} onChange={(e) => marcar(clave, e.target.checked)} />
                {etiqueta.replace(/ ?(control )?Nº:$/, '')}
              </label>
              {f.marcados[clave] && (
                <input type="text" aria-label={`Número: ${etiqueta}`} value={f.documentos[clave]}
                       placeholder={clave === 'placas' ? tramite.dominio : 'Nº de control (si lo tenés)'}
                       onChange={(e) => setDoc(clave, e.target.value)} />
              )}
            </div>
          ))}
        </fieldset>

        <fieldset className="opciones">
          <legend>Datos del automotor</legend>
          <p className="apagado">Dominio <b className="patente">{tramite.dominio}</b></p>
          <div className="forma-fila">
            {campoDato('marca', 'Marca', { placeholder: 'VOLKSWAGEN' })}
            {campoDato('tipo', 'Tipo', { sugerencias: TIPOS_REGISTRALES.map((t) => ({ clave: t, nombre: t })), placeholder: 'PICK UP' })}
          </div>
          <div className="forma-fila">
            {campoDato('modelo', 'Modelo', { placeholder: 'AMAROK TRENDLINE 4X4 2.0L TDI 140 CV' })}
            {campoDato('motor', 'Motor Nº', { placeholder: 'CFN 133182' })}
          </div>
        </fieldset>

        <fieldset className="opciones">
          <legend>Quién firma <span className="apagado">(opcional: si lo dejás vacío, se escribe a mano)</span></legend>
          <div className="forma-fila">
            <label className="crece">Apellido y nombre<input type="text" value={f.declaranteNombre} onChange={(e) => set('declaranteNombre', e.target.value)} /></label>
            <label>Documento<input type="text" inputMode="numeric" value={f.declaranteDocumento} onChange={(e) => set('declaranteDocumento', e.target.value)} /></label>
          </div>
        </fieldset>

        {usuario.esGestor && (
          <label className="check">
            <input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} />
            Guardar marca, tipo, modelo y motor en la flota, para no volver a pedirlos
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
