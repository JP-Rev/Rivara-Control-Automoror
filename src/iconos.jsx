// Iconos de las tarjetas. SVG propios y no emojis: un emoji lo dibuja cada
// sistema operativo a su manera (y a color), asi que rompe la paleta y se ve
// distinto en Windows, Android y iPhone. Estos heredan currentColor y quedan
// parejos en todos lados.
//
// El campo `icono` de la tabla apps guarda una de estas claves. Si no coincide
// con ninguna, la tarjeta cae a la sigla, asi que una fila vieja o mal cargada
// no deja el hueco vacio.

const TRAZOS = {
  reloj: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  carpeta: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  contenedor: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </>
  ),
  baseDatos: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  planilla: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 10v10M3 15h18" />
    </>
  ),
  personas: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16.5 5.6a3.2 3.2 0 0 1 0 5.6M17.5 14.2c2.6.6 3.5 2.6 3.5 5.8" />
    </>
  ),
  camion: (
    <>
      <path d="M3 6h10v10H3zM13 9h4l4 4v3h-8z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17.5" cy="18" r="2" />
    </>
  ),
  hoja: (
    <>
      <path d="M20 4c0 8.5-4.6 13-10.5 13H5.5C5.5 9.5 10 4 20 4z" />
      <path d="M5 21c1.8-4.5 5-7.5 9.5-9.5" />
    </>
  ),
  engranaje: (
    <>
      <circle cx="12" cy="12" r="7.2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 4.8V2.7M12 19.2v2.1M19.2 12h2.1M4.8 12H2.7" />
      <path d="M17.1 6.9l1.5-1.5M5.4 18.6l1.5-1.5M17.1 17.1l1.5 1.5M6.9 6.9L5.4 5.4" />
    </>
  ),
  grafico: (
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-6M12 20V6M17 20v-9" />
    </>
  ),
  calendario: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </>
  ),
  documento: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </>
  ),
  llave: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17.5 5.5l2 2M20 3l1.5 1.5" />
    </>
  ),
  carrito: (
    <>
      <circle cx="9.5" cy="20" r="1.6" />
      <circle cx="18" cy="20" r="1.6" />
      <path d="M3 4h2.2l2.5 11.3a1.8 1.8 0 0 0 1.8 1.4h8a1.8 1.8 0 0 0 1.8-1.4L21 8H6" />
    </>
  ),
  herramienta: (
    <>
      <path d="M14.1 12.4a5 5 0 0 0 6.6-6.2l-2.6 2.6-2.7-.7-.7-2.7 2.6-2.6a5 5 0 0 0-6.2 6.6" />
      <path d="M11.1 9.4l-6.8 6.8a2 2 0 0 0 2.8 2.8l6.8-6.8" />
    </>
  ),
  enlace: (
    <>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ),

  // --- Iconos de interfaz (no de aplicativo) ---
  casa: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  perfil: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
    </>
  ),
  salir: (
    <>
      <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </>
  ),
  lupa: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8.5h.01" />
    </>
  ),
  chequeo: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.4 2.6 2.6L16 9.6" />
    </>
  ),
  // Propios de Tramites del Registro Automotor.
  mas: <path d="M12 5v14M5 12h14" />,
  bandeja: (
    <>
      <path d="M4 5h16l1 8v6H3v-6z" />
      <path d="M3 13h5l1.5 2.5h5L16 13h5" />
    </>
  ),
  impresora: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 14h10v6H7z" />
    </>
  ),
  descarga: (
    <>
      <path d="M12 4v11" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  refrescar: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 4 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
}

// Cada categoria se dibuja con un icono en el menu lateral. La clave es el
// nombre de la categoria tal como esta en la base; lo que no figure cae en
// `documento`, que es neutro.
const ICONO_POR_CATEGORIA = {
  'recursos humanos': 'personas',
  documentos: 'documento',
  tecnologia: 'engranaje',
  tecnología: 'engranaje',
  finanzas: 'grafico',
  campo: 'hoja',
  compras: 'carrito',
  almacen: 'contenedor',
  almacén: 'contenedor',
  calidad: 'chequeo',
  mantenimiento: 'herramienta',
}

export const iconoDeCategoria = (nombre) =>
  ICONO_POR_CATEGORIA[(nombre ?? '').trim().toLowerCase()] ?? 'documento'

// Lo que ve el administrador al elegir. El orden es el del selector.
export const CATALOGO_ICONOS = [
  { clave: 'reloj', etiqueta: 'Reloj' },
  { clave: 'personas', etiqueta: 'Personas' },
  { clave: 'planilla', etiqueta: 'Planilla' },
  { clave: 'documento', etiqueta: 'Documento' },
  { clave: 'carpeta', etiqueta: 'Carpeta' },
  { clave: 'grafico', etiqueta: 'Gráfico' },
  { clave: 'calendario', etiqueta: 'Calendario' },
  { clave: 'baseDatos', etiqueta: 'Base de datos' },
  { clave: 'contenedor', etiqueta: 'Contenedor' },
  { clave: 'engranaje', etiqueta: 'Engranaje' },
  { clave: 'llave', etiqueta: 'Llave' },
  { clave: 'carrito', etiqueta: 'Compras' },
  { clave: 'camion', etiqueta: 'Camión' },
  { clave: 'hoja', etiqueta: 'Campo' },
  { clave: 'herramienta', etiqueta: 'Herramienta' },
  { clave: 'enlace', etiqueta: 'Enlace externo' },
]

export const hayIcono = (clave) => Boolean(TRAZOS[clave])

export function Icono({ clave, tamano = 20 }) {
  const trazo = TRAZOS[clave]
  if (!trazo) return null

  return (
    <svg
      width={tamano} height={tamano} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      {trazo}
    </svg>
  )
}
