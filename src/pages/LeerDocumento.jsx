import { useRef, useState } from 'react'
import * as api from '../api.js'
import DominioInput from '../componentes/DominioInput.jsx'
import Info from '../componentes/Info.jsx'
import Modal from '../componentes/Modal.jsx'
import Selector from '../componentes/Selector.jsx'
import { Icono } from '../iconos.jsx'

// Completar un vehiculo leyendo su cedula o su titulo.
//
// Tres pasos: elegir el archivo (PDF o foto, tambien desde la camara del
// celular), leer, y REVISAR. Nada se guarda sin que alguien lo mire: el OCR
// de una foto se equivoca, y un chasis mal leido en un formulario del
// Registro es peor que uno vacio. Por eso cada dato va al lado del que ya
// tenia el vehiculo, y lo que lo pisaria viene destildado.

const CAMPOS = [
  ['categoria', 'Tipo de vehículo'],
  ['marcaChasis', 'Marca de chasis'],
  ['modeloRegistral', 'Modelo (título)'],
  ['tipoRegistral', 'Tipo (título)'],
  ['nroChasis', 'Nº de chasis'],
  ['marcaMotor', 'Marca de motor'],
  ['nroMotor', 'Nº de motor'],
  ['uso', 'Uso'],
  ['nroTitulo', 'Nº de título'],
  ['nroCedula', 'Nº de cédula'],
  ['anio', 'Año'],
  ['titular', 'Titular'],
]

const igual = (a, b) => String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase()

export default function LeerDocumento({ vehiculos, vehiculoInicial, usuario, catalogo, onAplicado, onCerrar }) {
  const [paso, setPaso] = useState('elegir') // elegir | leyendo | revisar | listo
  const [arrastrando, setArrastrando] = useState(false)
  const [error, setError] = useState('')
  const [lectura, setLectura] = useState(null)
  const [dominio, setDominio] = useState(vehiculoInicial?.dominio || '')
  const [valores, setValores] = useState({})
  const [usar, setUsar] = useState({})
  const [guardando, setGuardando] = useState(false)
  const entrada = useRef(null)
  const camara = useRef(null)

  const vehiculo = vehiculos.find((v) => v.dominio === dominio) || null

  // Que se tilda de entrada: lo leido que completa un dato vacio. Si el
  // vehiculo ya tenia otro valor, se muestra pero destildado: pisarlo es una
  // decision, no un efecto secundario.
  function prepararRevision(r, v) {
    const vals = {}
    const marcas = {}
    for (const [k] of CAMPOS) {
      vals[k] = r.campos[k] || ''
      const actual = k === 'categoria' && v?.categoria === 'OTRO' ? '' : String(v?.[k] ?? '').trim()
      marcas[k] = Boolean(vals[k]) && !actual
    }
    setValores(vals)
    setUsar(marcas)
  }

  async function leer(archivo) {
    if (!archivo) return
    setError('')
    setPaso('leyendo')
    try {
      const r = await api.leerDocumento(archivo)
      setLectura(r)
      // El dominio del documento manda, salvo que no se haya podido leer:
      // ahi queda el del vehiculo desde el que se abrio.
      const d = r.dominio || vehiculoInicial?.dominio || ''
      setDominio(d)
      prepararRevision(r, vehiculos.find((v) => v.dominio === d))
      setPaso('revisar')
    } catch (e) {
      setError(e.message)
      setPaso('elegir')
    }
  }

  function cambiarVehiculo(d) {
    setDominio(d)
    if (lectura) prepararRevision(lectura, vehiculos.find((v) => v.dominio === d))
  }

  async function guardar() {
    setError('')
    setGuardando(true)
    try {
      const datos = Object.fromEntries(CAMPOS.filter(([k]) => usar[k]).map(([k]) => [k, valores[k]]))
      const { vehiculo: v } = vehiculo
        ? await api.editarVehiculo(vehiculo.id, datos)
        : await api.crearVehiculo({ categoria: valores.categoria || 'OTRO', ...datos, dominio })
      onAplicado(v)
      setPaso('listo')
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const otraVez = () => {
    setLectura(null)
    setError('')
    setPaso('elegir')
  }

  const elegidos = CAMPOS.filter(([k]) => usar[k]).length
  const dominioLeidoDistinto = lectura?.dominio && vehiculoInicial && lectura.dominio !== vehiculoInicial.dominio

  return (
    <Modal titulo="Leer cédula o título" tamano="ancho" onCerrar={onCerrar}>
      {paso === 'elegir' && (
        <div className="forma">
          <p className="nota">
            Subí el <b>título digital en PDF</b> (se lee exacto) o una <b>foto</b> de la cédula o del título. Antes de
            guardar vas a poder revisar cada dato.
          </p>
          <div
            className={`zona-archivo ${arrastrando ? 'zona-archivo--encima' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastrando(false); leer(e.dataTransfer.files?.[0]) }}
          >
            <span className="rv-disco"><Icono clave="documento" tamano={24} /></span>
            <strong>Arrastrá el archivo acá</strong>
            <span className="apagado">PDF, JPG, PNG o WEBP · hasta 15 MB</span>
            <div className="fila-acciones fila-acciones--centro">
              <button type="button" className="boton" onClick={() => entrada.current?.click()}>Elegir archivo</button>
              {/* capture abre la camara directo en el celular; en la
                  computadora se comporta como "elegir archivo". */}
              <button type="button" className="boton boton-suave" onClick={() => camara.current?.click()}>Sacar una foto</button>
            </div>
            <input ref={entrada} type="file" hidden accept="application/pdf,image/*" onChange={(e) => leer(e.target.files?.[0])} />
            <input ref={camara} type="file" hidden accept="image/*" capture="environment" onChange={(e) => leer(e.target.files?.[0])} />
          </div>
          <p className="apagado">
            Consejos para la foto: con buena luz, sin reflejos, de frente y que el documento ocupe casi toda la imagen.
          </p>
          {error && <p className="nota error" role="alert">{error}</p>}
        </div>
      )}

      {paso === 'leyendo' && (
        <div className="vacio vacio--chico">
          <h2>Leyendo el documento…</h2>
          <p>Un PDF es casi instantáneo; una foto puede tardar unos segundos.</p>
        </div>
      )}

      {paso === 'listo' && (
        <div className="vacio vacio--chico">
          <h2>Datos guardados en {dominio}</h2>
          <p>Si tenés el otro lado de la cédula o el título, podés leerlo también.</p>
          <div className="fila-acciones fila-acciones--centro">
            <button type="button" className="boton" onClick={otraVez}>Leer otro documento</button>
            <button type="button" className="boton boton-suave" onClick={onCerrar}>Listo</button>
          </div>
        </div>
      )}

      {paso === 'revisar' && lectura && (
        <div className="forma">
          <p className={`nota ${lectura.metodo === 'pdf' ? 'ok' : ''}`}>
            {{ TITULO: 'Título del automotor leído', CEDULA: 'Cédula leída' }[lectura.documento] || 'Documento leído'}
            {lectura.metodo === 'pdf'
              ? ' del PDF: los datos son exactos.'
              : ' de una foto: revisá cada dato contra el documento antes de guardar.'}
          </p>
          {lectura.avisos.map((a) => <p key={a} className="nota error">{a}</p>)}

          <label>
            <span>Vehículo {lectura.dominio && <span className="apagado">(el documento dice {lectura.dominio})</span>}</span>
            <DominioInput valor={dominio} onCambio={(d) => { if (d) cambiarVehiculo(d) }} vehiculos={vehiculos} sinAvisoFuera />
          </label>
          {dominioLeidoDistinto && (
            <p className="nota error">
              Abriste esto desde {vehiculoInicial.dominio}, pero el documento es de {lectura.dominio}. Se va a cargar en
              el vehículo que figure arriba.
            </p>
          )}
          {!vehiculo && dominio && (
            <p className="nota">
              {dominio} no está en la flota. {usuario.esGestor ? 'Al guardar se agrega con estos datos.' : ''}
            </p>
          )}

          <div className="tabla-scroll">
            <table className="rv-tabla tabla-lectura">
              <thead>
                <tr>
                  <th>Usar</th>
                  <th>Dato</th>
                  <th>Leído del documento</th>
                  <th>
                    <span className="th-info">
                      Tiene ahora
                      <Info etiqueta="Qué se tilda">Se tildan solos los datos que completan algo vacío. Si el vehículo ya tenía otro valor, aparece marcado como distinto y destildado: tildalo si el del documento es el correcto.</Info>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {CAMPOS.map(([k, nombre]) => {
                  const actual = vehiculo?.[k] ?? ''
                  const leido = valores[k]
                  const estado = !leido ? 'vacio' : !String(actual).trim() ? 'nuevo' : igual(actual, leido) ? 'igual' : 'distinto'
                  return (
                    <tr key={k} className={`lectura--${estado}`}>
                      <td>
                        <input type="checkbox" aria-label={`Usar ${nombre}`} checked={Boolean(usar[k])}
                               disabled={!leido || estado === 'igual'}
                               onChange={(e) => setUsar((u) => ({ ...u, [k]: e.target.checked }))} />
                      </td>
                      <td>{nombre}</td>
                      <td>
                        {k === 'categoria' ? (
                          <Selector valor={leido} opciones={catalogo.categorias} placeholder="Elegí el tipo"
                                    onCambio={(v) => {
                                      setValores((x) => ({ ...x, categoria: v }))
                                      setUsar((u) => ({ ...u, categoria: Boolean(v) && !igual(actual, v) }))
                                    }} />
                        ) : (
                          <input type="text" value={leido} placeholder="No se leyó"
                                 onChange={(e) => {
                                   const v = e.target.value
                                   setValores((x) => ({ ...x, [k]: v }))
                                   setUsar((u) => ({ ...u, [k]: Boolean(v) && !igual(actual, v) }))
                                 }} />
                        )}
                      </td>
                      <td>
                        {String(actual).trim()
                          ? (k === 'categoria' ? catalogo.categorias.find((c) => c.clave === actual)?.nombre || actual : actual)
                          : <span className="apagado">vacío</span>}
                        {estado === 'distinto' && <small className="celda-detalle falta">Distinto a lo leído</small>}
                        {estado === 'igual' && <small className="celda-detalle ok-texto">Coincide</small>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {error && <p className="nota error" role="alert">{error}</p>}

          <div className="forma-acciones">
            <button type="button" className="boton" disabled={guardando || !dominio || (!elegidos && vehiculo)}
                    onClick={guardar}>
              {guardando ? 'Guardando…' : vehiculo ? `Guardar ${elegidos} ${elegidos === 1 ? 'dato' : 'datos'} en ${dominio}` : `Agregar ${dominio} a la flota`}
            </button>
            <button type="button" className="boton boton-suave" onClick={otraVez}>Leer otro archivo</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
