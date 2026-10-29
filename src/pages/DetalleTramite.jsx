import { useCallback, useEffect, useState } from 'react'
import * as api from '../api.js'
import { EstadoChip } from '../componentes/Estado.jsx'
import Dnrpa from './Dnrpa.jsx'
import Persona from './Persona.jsx'
import SiNo, { VOLUNTAD_DE_PAGO } from '../componentes/SiNo.jsx'
import { resumenVehiculo } from '../componentes/DominioInput.jsx'
import Modal from '../componentes/Modal.jsx'
import Selector from '../componentes/Selector.jsx'
import { fecha, fechaHora, haceCuanto } from '../formato.js'
import { Icono } from '../iconos.jsx'

// "SAN MARTIN 100 piso 2 dto B · ALBERTI, ALBERTI, BUENOS AIRES (6634)"
function domicilioTexto(c) {
  const calle = [c.calle, c.numero, c.piso && `piso ${c.piso}`, c.depto && `dto ${c.depto}`].filter(Boolean).join(' ')
  const lugar = [...new Set([c.localidad, c.partido])].filter(Boolean).concat(c.provincia || []).join(', ')
  const texto = [calle, lugar].filter(Boolean).join(' · ')
  return texto ? `${texto}${c.cp ? ` (${c.cp})` : ''}` : c.domicilio || ''
}

const ACCIONES_EVENTO = {
  CREADO: 'cargó el trámite',
  TOMADO: 'lo tomó',
  SOLTADO: 'lo soltó: queda sin tomar',
  NOTA: 'dejó una nota',
  EDITADO: 'lo editó',
  DDJJ: 'generó la DDJJ de extravío',
}

export default function DetalleTramite({ id, catalogo, usuario, onCambio, onBorrado, onCerrar, onVehiculo, onDdjj, onAnexo08d }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [nota, setNota] = useState('')
  const [pasarA, setPasarA] = useState('')
  const [notaEstado, setNotaEstado] = useState('')
  const [nroRegistro, setNroRegistro] = useState('')
  const [editando, setEditando] = useState(false)
  const [edicion, setEdicion] = useState({})
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const [parte, setParte] = useState(null) // 'comprador' | 'vendedor'
  const [dnrpaAbierto, setDnrpaAbierto] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setDatos(await api.tramite(id))
    } catch (e) {
      setError(e.message)
    }
  }, [id])
  useEffect(() => { cargar() }, [cargar])

  const nombreTipo = (c) => catalogo.tipos.find((t) => t.clave === c)?.nombre || c
  const nombreMotivo = (c) => catalogo.motivos.find((m) => m.clave === c)?.nombre || ''
  const nombreEstado = (c) => catalogo.estados.find((e) => e.clave === c)?.nombre || c

  async function hacer(fn) {
    setError('')
    setOcupado(true)
    try {
      const r = await fn()
      if (r?.tramite) {
        setDatos(r)
        onCambio(r.tramite)
      }
      return r
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setOcupado(false)
    }
  }

  if (!datos) {
    return (
      <Modal titulo={`Trámite #${id}`} tamano="ancho" onCerrar={onCerrar}>
        {error ? <p className="nota error">{error}</p> : <p className="aviso">Cargando…</p>}
      </Modal>
    )
  }

  const { tramite: t, eventos } = datos
  const def = catalogo.tipos.find((x) => x.clave === t.tipo)
  const esMio = t.gestor?.id === usuario.id
  const puedeEditar = usuario.esGestor || (t.solicitante?.id === usuario.id && !t.gestor && t.estado === 'SOLICITADO')
  const puedeBorrar = usuario.esAdmin || (t.solicitante?.id === usuario.id && !t.gestor && t.estado === 'SOLICITADO')
  const v = t.vehiculo
  // El comprador lo puede cargar tambien quien pidio el tramite, aunque ya lo
  // haya tomado alguien: suele ser quien tiene la foto del DNI.
  const puedeCargarComprador = usuario.esGestor || t.solicitante?.id === usuario.id

  const abrirEstado = (clave) => {
    setPasarA(clave)
    setNotaEstado('')
    setNroRegistro(t.nroRegistro || '')
  }

  const confirmarEstado = async (e) => {
    e.preventDefault()
    const r = await hacer(() => api.cambiarEstado(t.id, { estado: pasarA, nota: notaEstado, nroRegistro }))
    if (r) setPasarA('')
  }

  const empezarEdicion = () => {
    setEdicion({ tipo: t.tipo, motivo: t.motivo, observaciones: t.observaciones, nroRegistro: t.nroRegistro })
    setEditando(true)
  }

  const guardarEdicion = async (e) => {
    e.preventDefault()
    const r = await hacer(() => api.editarTramite(t.id, edicion))
    if (r) setEditando(false)
  }

  const enviarNota = async (e) => {
    e.preventDefault()
    if (!nota.trim()) return
    const r = await hacer(() => api.agregarNota(t.id, nota))
    if (r) setNota('')
  }

  const borrar = async () => {
    setOcupado(true)
    try {
      await api.borrarTramite(t.id)
      onBorrado(t.id)
    } catch (e) {
      setError(e.message)
      setOcupado(false)
    }
  }

  return (
    <Modal titulo={`Trámite #${t.id}`} tamano="ancho" onCerrar={onCerrar}>
      <div className="detalle">
        <header className="detalle-cabecera">
          <div>
            <strong className="patente patente--grande">{t.dominio}</strong>
            <h3>{nombreTipo(t.tipo)}{t.motivo && <span className="apagado"> · {nombreMotivo(t.motivo)}</span>}</h3>
            <p className="apagado">
              Lo pidió {t.solicitante?.nombre || '—'} el {fechaHora(t.creadoEn)}
              {t.nroRegistro && <> · Nº en el Registro: <b>{t.nroRegistro}</b></>}
            </p>
          </div>
          <EstadoChip tramite={t} conDias />
        </header>

        {error && <p className="nota error" role="alert">{error}</p>}

        {/* ---- Vehiculo ---- */}
        <section className="detalle-bloque">
          <h4 className="rv-eyebrow">Vehículo</h4>
          {v ? (
            <div className="vehiculo-resumen">
              <p>{resumenVehiculo(v) || 'Sin datos de planilla'}{v.anio ? ` · ${v.anio}` : ''}</p>
              <p className="apagado">
                {[v.titular && `Titular: ${v.titular}`, v.nroChasis && `Chasis ${v.nroChasis}`, v.nroMotor && `Motor ${v.nroMotor}`, v.uso && `Uso ${v.uso}`].filter(Boolean).join(' · ')}
              </p>
              {v.faltan.length > 0 && (
                <p className="falta">
                  Faltan: {v.faltan.map((c) => catalogo.camposRegistrales.find((x) => x.clave === c)?.nombre).join(', ')}
                </p>
              )}
              <button type="button" className="link" onClick={() => onVehiculo(v)}>
                {usuario.esGestor ? 'Ver y completar los datos del vehículo' : 'Ver los datos del vehículo'}
              </button>
            </div>
          ) : (
            <p className="nota">
              {t.dominio} no está en la flota.{' '}
              {usuario.esGestor ? 'Si hace falta, cargalo desde Flota o completando la DDJJ.' : 'Quien gestiona completa los datos.'}
            </p>
          )}
        </section>

        {t.observaciones && !editando && (
          <section className="detalle-bloque">
            <h4 className="rv-eyebrow">Observaciones</h4>
            <p className="detalle-texto">{t.observaciones}</p>
          </section>
        )}

        {/* ---- Vendedor (transferencias) ---- */}
        {def?.vendedor && (
          <section className="detalle-bloque">
            <div className="fila-acciones">
              <h4 className="rv-eyebrow">Vendedor</h4>
              {puedeCargarComprador && (
                <button type="button" className={`boton boton-chico ${t.vendedor ? 'boton-suave' : ''}`} onClick={() => setParte('vendedor')}>
                  <Icono clave="perfil" tamano={16} /> {t.vendedor ? 'Editar' : 'Cargar'}
                </button>
              )}
            </div>
            {t.vendedor ? (
              <div className="comprador">
                {t.vendedor.tipo === 'JURIDICA' ? (
                  <>
                    <p><b>{t.vendedor.razonSocial}</b></p>
                    <p className="apagado">{['Persona jurídica', t.vendedor.cuil && `CUIT ${t.vendedor.cuil}`].filter(Boolean).join(' · ')}</p>
                  </>
                ) : (
                  <>
                    <p>
                      <b>{[t.vendedor.apellido, t.vendedor.nombres].filter(Boolean).join(', ')}</b>
                      {t.vendedor.verificado && <span className="pastilla">DNI verificado</span>}
                    </p>
                    <p className="apagado">
                      {[
                        t.vendedor.dni && `DNI ${Number(t.vendedor.dni).toLocaleString('es-AR')}`,
                        t.vendedor.cuil && `CUIT ${t.vendedor.cuil}`,
                        t.vendedor.estadoCivil && `${t.vendedor.estadoCivil} al comprarlo`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <p className="apagado">Todavía no hay datos del vendedor{t.vehiculo?.titular ? ` (titular en la flota: ${t.vehiculo.titular})` : ''}.</p>
            )}
          </section>
        )}

        {/* ---- Comprador (transferencias y denuncias de venta) ---- */}
        {def?.comprador && (
          <section className="detalle-bloque">
            <div className="fila-acciones">
              <h4 className="rv-eyebrow">Comprador</h4>
              {puedeCargarComprador && (
                <button type="button" className={`boton boton-chico ${t.comprador ? 'boton-suave' : ''}`} onClick={() => setParte('comprador')}>
                  <Icono clave="perfil" tamano={16} /> {t.comprador ? 'Editar' : 'Cargar desde el DNI'}
                </button>
              )}
            </div>
            {t.comprador ? (
              <div className="comprador">
                <p>
                  <b>{[t.comprador.apellido, t.comprador.nombres].filter(Boolean).join(', ')}</b>
                  {t.comprador.verificado && <span className="pastilla">DNI verificado</span>}
                </p>
                <p className="apagado">
                  {[
                    t.comprador.dni && `DNI ${Number(t.comprador.dni).toLocaleString('es-AR')}`,
                    t.comprador.cuil && `CUIL ${t.comprador.cuil}`,
                    t.comprador.fechaNacimiento && `nac. ${fecha(t.comprador.fechaNacimiento + 'T12:00:00Z')}`,
                    t.comprador.nacionalidad,
                    t.comprador.estadoCivil,
                    t.comprador.ocupacion,
                  ].filter(Boolean).join(' · ')}
                </p>
                {t.comprador.estadoCivil === 'Casado' && t.comprador.conyugeApellido && (
                  <p className="apagado">
                    Cónyuge: {[t.comprador.conyugeApellido, t.comprador.conyugeNombre].filter(Boolean).join(', ')}
                    {t.comprador.caracterBien && ` · bien ${t.comprador.caracterBien.toLowerCase()}`}
                  </p>
                )}
                {domicilioTexto(t.comprador) && <p className="apagado">{domicilioTexto(t.comprador)}</p>}
                {(t.comprador.telefono || t.comprador.email) && (
                  <p className="apagado">{[t.comprador.telefono, t.comprador.email].filter(Boolean).join(' · ')}</p>
                )}
              </div>
            ) : (
              <p className="apagado">Todavía no hay datos del comprador. Se cargan sacándole una foto al DNI.</p>
            )}
          </section>
        )}

        {/* ---- Transferencia: voluntad de pago y Anexo 08 D ---- */}
        {def?.anexo08d && (
          <section className="detalle-bloque">
            <div className="fila-acciones">
              <h4 className="rv-eyebrow">Anexo 08 D</h4>
              {puedeCargarComprador && (
                <button type="button" className="boton boton-chico" onClick={() => onAnexo08d(t)}>
                  <Icono clave="impresora" tamano={16} /> {t.transferencia?.anexo ? 'Volver a imprimir el Anexo 08 D' : 'Imprimir el Anexo 08 D'}
                </button>
              )}
            </div>
            {t.transferencia?.solicitud08d && <p className="apagado">Solicitud tipo 08 D Nº <b>{t.transferencia.solicitud08d}</b></p>}
            <p className="apagado">Opta abonar (Disp. 142/2024):</p>
            <div className="voluntad voluntad--detalle">
              {VOLUNTAD_DE_PAGO.map(([k, nombre]) => (
                <SiNo key={k} etiqueta={nombre} valor={t.transferencia?.[k] || ''} deshabilitado={ocupado || !puedeCargarComprador}
                      onCambio={(v) => hacer(() => api.editarTramite(t.id, { transferencia: { [k]: v } }))} />
              ))}
            </div>
          </section>
        )}

        {/* ---- Transferencia Digital del DNRPA (el bot) ---- */}
        {def?.vendedor && puedeCargarComprador && (
          <section className="detalle-bloque">
            <div className="fila-acciones">
              <h4 className="rv-eyebrow">Transferencia Digital</h4>
              <button type="button" className="boton boton-chico" onClick={() => setDnrpaAbierto(true)}>
                <Icono clave="descarga" tamano={16} /> Cargar en el DNRPA
              </button>
            </div>
            <p className="apagado">Un bot completa los campos del sitio del DNRPA con el vendedor, el comprador y el vehículo. Los botones y el captcha, vos.</p>
          </section>
        )}

        {/* ---- DDJJ ---- */}
        {def?.ddjj && (
          <section className="detalle-bloque">
            <h4 className="rv-eyebrow">DDJJ de extravío</h4>
            {t.motivo === 'EXTRAVIO' ? (
              <div className="fila-acciones">
                <button type="button" className="boton" onClick={() => onDdjj(t)}>
                  <Icono clave="impresora" tamano={18} /> {t.ddjj ? 'Volver a imprimir la DDJJ' : 'Imprimir la DDJJ'}
                </button>
                <span className="apagado">Se completa con los datos del vehículo; lo que falte te lo pide.</span>
              </div>
            ) : (
              <p className="apagado">
                {t.motivo ? 'Este trámite no es por extravío, así que no lleva la DDJJ.' : 'Si es por extravío, marcalo en «Editar» y se habilita la DDJJ para imprimir.'}
              </p>
            )}
          </section>
        )}

        {/* ---- Gestion ---- */}
        {usuario.esGestor && (
          <section className="detalle-bloque">
            <h4 className="rv-eyebrow">Gestión</h4>
            <div className="fila-acciones">
              {!t.gestor && (
                <button type="button" className="boton" disabled={ocupado} onClick={() => hacer(() => api.tomar(t.id))}>
                  Tomar el trámite
                </button>
              )}
              {t.gestor && !esMio && usuario.esAdmin && (
                <button type="button" className="boton boton-suave" disabled={ocupado} onClick={() => hacer(() => api.tomar(t.id))}>
                  Pasarlo a mi nombre
                </button>
              )}
              {t.gestor && <span className="apagado">Lo gestiona {esMio ? 'vos' : t.gestor.nombre} desde {haceCuanto(t.tomadoEn)}.</span>}
              {(esMio || usuario.esAdmin) && t.gestor && t.estado === 'SOLICITADO' && (
                <button type="button" className="boton-texto" disabled={ocupado} onClick={() => hacer(() => api.soltar(t.id))}>Soltarlo</button>
              )}
            </div>

            <div className="pasos" role="group" aria-label="Estado del trámite">
              {catalogo.estados.map((e) => (
                <button
                  key={e.clave}
                  type="button"
                  className={`paso ${t.estado === e.clave ? 'paso--actual' : ''} ${pasarA === e.clave ? 'paso--elegido' : ''}`}
                  aria-pressed={t.estado === e.clave}
                  disabled={ocupado}
                  onClick={() => abrirEstado(e.clave)}
                >
                  {e.clave === 'SOLICITADO' ? (t.gestor ? 'En preparación' : 'Solicitado') : e.nombre}
                </button>
              ))}
            </div>

            {pasarA && (
              <form className="forma forma--caja" onSubmit={confirmarEstado}>
                <p>
                  {pasarA === t.estado
                    ? <>Ya está <b>{nombreEstado(pasarA).toLowerCase()}</b>. Podés dejar una nota o el número del Registro.</>
                    : <>Pasar a <b>{pasarA === 'SOLICITADO' ? 'en preparación' : nombreEstado(pasarA).toLowerCase()}</b>.</>}
                  {!t.gestor && ' Al moverlo, queda tomado por vos.'}
                </p>
                {pasarA !== 'SOLICITADO' && (
                  <label>
                    <span>Nº de trámite del Registro <span className="apagado">(opcional)</span></span>
                    <input type="text" value={nroRegistro} onChange={(e) => setNroRegistro(e.target.value)} />
                  </label>
                )}
                <label>
                  <span>Nota <span className="apagado">(opcional: qué falta, qué pidió el Registro, cuándo retirar)</span></span>
                  <textarea rows={2} value={notaEstado} onChange={(e) => setNotaEstado(e.target.value)} />
                </label>
                <div className="forma-acciones forma-acciones--simple">
                  <button type="submit" className="boton" disabled={ocupado}>Confirmar</button>
                  <button type="button" className="boton boton-suave" onClick={() => setPasarA('')}>Cancelar</button>
                </div>
              </form>
            )}
          </section>
        )}

        {/* ---- Edicion ---- */}
        {editando && (
          <section className="detalle-bloque">
            <h4 className="rv-eyebrow">Editar</h4>
            <form className="forma forma--caja" onSubmit={guardarEdicion}>
              <label>
                Trámite
                <Selector valor={edicion.tipo} opciones={catalogo.tipos} onCambio={(tipo) => setEdicion((x) => ({ ...x, tipo }))} />
              </label>
              {catalogo.tipos.find((x) => x.clave === edicion.tipo)?.motivo && (
                <label>
                  Motivo
                  <Selector valor={edicion.motivo} opciones={catalogo.motivos} placeholder="Sin indicar"
                            onCambio={(motivo) => setEdicion((x) => ({ ...x, motivo }))} />
                </label>
              )}
              {usuario.esGestor && (
                <label>
                  Nº de trámite del Registro
                  <input type="text" value={edicion.nroRegistro} onChange={(e) => setEdicion((x) => ({ ...x, nroRegistro: e.target.value }))} />
                </label>
              )}
              <label>
                Observaciones
                <textarea rows={3} value={edicion.observaciones} onChange={(e) => setEdicion((x) => ({ ...x, observaciones: e.target.value }))} />
              </label>
              <div className="forma-acciones forma-acciones--simple">
                <button type="submit" className="boton" disabled={ocupado}>Guardar</button>
                <button type="button" className="boton boton-suave" onClick={() => setEditando(false)}>Cancelar</button>
              </div>
            </form>
          </section>
        )}

        {/* ---- Seguimiento ---- */}
        <section className="detalle-bloque">
          <h4 className="rv-eyebrow">Seguimiento</h4>
          <ol className="linea-tiempo">
            {eventos.map((e) => (
              <li key={e.id} className={`evento evento--${e.tipo.toLowerCase()}`}>
                <i aria-hidden="true" />
                <div>
                  <p>
                    <b>{e.usuario}</b>{' '}
                    {e.tipo === 'ESTADO'
                      ? <>pasó el trámite a <b>{e.estadoHasta === 'SOLICITADO' ? 'en preparación' : nombreEstado(e.estadoHasta).toLowerCase()}</b></>
                      : ACCIONES_EVENTO[e.tipo] || e.tipo.toLowerCase()}
                    <time className="apagado" title={fechaHora(e.creadoEn)}> · {haceCuanto(e.creadoEn)}</time>
                  </p>
                  {e.texto && <p className="evento-texto">{e.texto}</p>}
                </div>
              </li>
            ))}
          </ol>
          <form className="nota-nueva" onSubmit={enviarNota}>
            <textarea rows={2} value={nota} placeholder="Escribí una nota: una pregunta, qué falta, una novedad…"
                      onChange={(e) => setNota(e.target.value)} aria-label="Nota nueva" />
            <button type="submit" className="boton boton-chico" disabled={ocupado || !nota.trim()}>Agregar nota</button>
          </form>
        </section>

        {parte && (
          <Persona tramite={t} rol={parte} catalogo={catalogo} onCerrar={() => setParte(null)}
                   onGuardado={(r) => { setDatos(r); onCambio(r.tramite); setParte(null) }} />
        )}
        {dnrpaAbierto && <Dnrpa tramite={t} catalogo={catalogo} onCerrar={() => setDnrpaAbierto(false)} />}

        {(puedeEditar || puedeBorrar) && !editando && (
          <footer className="detalle-pie">
            {puedeEditar && <button type="button" className="boton boton-suave boton-chico" onClick={empezarEdicion}>Editar</button>}
            {puedeBorrar && !confirmarBorrar && (
              <button type="button" className="boton-texto peligro" onClick={() => setConfirmarBorrar(true)}>Borrar el trámite</button>
            )}
            {confirmarBorrar && (
              <span className="confirmar">
                ¿Borrarlo con todo su seguimiento? No se puede deshacer.
                <button type="button" className="boton boton-chico boton-peligro" disabled={ocupado} onClick={borrar}>Sí, borrar</button>
                <button type="button" className="boton-texto" onClick={() => setConfirmarBorrar(false)}>No</button>
              </span>
            )}
          </footer>
        )}
      </div>
    </Modal>
  )
}
