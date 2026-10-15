import { diasDesde } from '../formato.js'

// SOLICITADO se parte en dos para quien mira: sin tomar es lo que espera a
// quien gestiona; tomado es que ya se esta preparando.
export function claveVisible(t) {
  if (t.estado === 'SOLICITADO') return t.gestor ? 'PREPARACION' : 'SIN_TOMAR'
  return t.estado
}

export const ESTADOS_VISIBLES = [
  { clave: 'SIN_TOMAR', nombre: 'Sin tomar' },
  { clave: 'PREPARACION', nombre: 'En preparación' },
  { clave: 'PRESENTADO', nombre: 'Presentado' },
  { clave: 'EN_ESPERA', nombre: 'En espera' },
  { clave: 'TERMINADO', nombre: 'Terminado' },
]

export const nombreEstado = (clave) => ESTADOS_VISIBLES.find((e) => e.clave === clave)?.nombre || clave

// Desde cuando esta en el estado actual, que es lo que importa para saber si
// algo se quedo trabado.
export function desdeEstado(t) {
  if (t.estado === 'TERMINADO') return t.terminadoEn
  if (t.estado === 'SOLICITADO') return t.gestor ? t.tomadoEn : t.creadoEn
  return t.ultimoMovimiento
}

export function EstadoChip({ tramite, conDias = false }) {
  const clave = claveVisible(tramite)
  const dias = diasDesde(desdeEstado(tramite))
  return (
    <span className={`estado estado--${clave.toLowerCase()}`}>
      <i aria-hidden="true" />
      {nombreEstado(clave)}
      {conDias && clave !== 'TERMINADO' && dias > 0 && <small>{dias} {dias === 1 ? 'día' : 'días'}</small>}
    </span>
  )
}
