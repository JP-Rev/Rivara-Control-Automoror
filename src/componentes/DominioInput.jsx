import { useId, useMemo, useState } from 'react'
import { coincide, compactar, parsearConsulta } from '../filtros.js'

// Mismos formatos que el servidor (server/src/dominio.js).
const FORMATOS = [/^[A-Z]{2}\d{3}[A-Z]{2}$/, /^[A-Z]{3}\d{3}$/, /^[A-Z]\d{3}[A-Z]{3}$/, /^\d{3}[A-Z]{3}$/]
export const normalizarDominio = (t) => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const dominioValido = (d) => FORMATOS.some((re) => re.test(d))

const CAMPOS = {
  dominio: (v) => v.dominio,
  marca: (v) => `${v.marca} ${v.modelo}`,
  chofer: (v) => v.chofer,
  unidad: (v) => v.unidad,
}

export const resumenVehiculo = (v) =>
  [v.marca || v.rol, v.modelo, v.unidad && `unidad ${v.unidad}`, v.chofer].filter(Boolean).join(' · ')

// Campo de dominio con sugerencias de la flota. Se puede escribir el dominio
// directo o buscar por chofer, marca o numero de unidad ("24", "perez"), y
// tambien cargar un dominio que no esta en la flota.
export default function DominioInput({ valor, onCambio, vehiculos, autoFocus }) {
  const [texto, setTexto] = useState(valor || '')
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const id = useId()

  const sugerencias = useMemo(() => {
    const q = texto.trim()
    if (!q) return []
    const terminos = parsearConsulta(q)
    const compacto = compactar(q)
    return (vehiculos || [])
      .filter((v) => coincide(v, terminos, CAMPOS, ['dominio']))
      // Primero los que empiezan con lo tipeado: "AE6" tiene que mostrar
      // AE622BG antes que un chofer que se llama "Aeberhard".
      .sort((a, b) => Number(!compactar(a.dominio).startsWith(compacto)) - Number(!compactar(b.dominio).startsWith(compacto)))
      .slice(0, 8)
  }, [texto, vehiculos])

  const dominio = normalizarDominio(texto)
  const exacto = (vehiculos || []).find((v) => v.dominio === dominio)

  const elegir = (v) => {
    setTexto(v.dominio)
    onCambio(v.dominio)
    setAbierto(false)
  }

  const alTeclear = (e) => {
    if (!abierto || !sugerencias.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((a) => Math.min(a + 1, sugerencias.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); elegir(sugerencias[activo]) }
    if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false) }
  }

  return (
    <div className="dominio-campo">
      <input
        type="text"
        role="combobox"
        aria-expanded={abierto && sugerencias.length > 0}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder="AE622BG, o buscá por chofer, unidad o marca"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setActivo(0)
          setAbierto(true)
          const d = normalizarDominio(e.target.value)
          onCambio(dominioValido(d) ? d : '')
        }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={alTeclear}
      />
      {abierto && sugerencias.length > 0 && !(exacto && sugerencias.length === 1) && (
        <ul className="dominio-lista" id={`${id}-lista`} role="listbox">
          {sugerencias.map((v, i) => (
            <li key={v.id} role="option" aria-selected={i === activo}>
              <button type="button" className={i === activo ? 'activa' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(v)}>
                <strong>{v.dominio}</strong>
                <span>{resumenVehiculo(v)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {texto.trim() && (
        exacto
          ? <p className="dominio-info ok">{resumenVehiculo(exacto) || 'En la flota'}</p>
          : dominioValido(dominio)
            ? <p className="dominio-info">{dominio} no está en la flota: el trámite se carga igual y los datos del vehículo se completan después.</p>
            : !sugerencias.length && <p className="dominio-info aviso">No es un dominio válido (AA123BB o ABC123) ni coincide con ningún vehículo.</p>
      )}
    </div>
  )
}
