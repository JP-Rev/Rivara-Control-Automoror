async function pedir(ruta, opciones = {}) {
  const res = await fetch(`/api${ruta}`, {
    credentials: 'same-origin',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opciones,
  })
  if (opciones.crudo && res.ok) return res
  const cuerpo = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(cuerpo.error || 'Error inesperado')
    error.status = res.status
    throw error
  }
  return cuerpo
}

const json = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos ?? {}) })

export const me = () => pedir('/auth/me')
export const login = (email, password, recordar) => pedir('/auth/login', json('POST', { email, password, recordar }))
export const logout = () => pedir('/auth/logout', { method: 'POST' })
export const definirPassword = (actual, nueva) => pedir('/auth/password', json('POST', { actual, nueva }))

export const catalogo = () => pedir('/catalogo')

export const vehiculos = () => pedir('/vehiculos')
export const crearVehiculo = (datos) => pedir('/vehiculos', json('POST', datos))
export const editarVehiculo = (id, datos) => pedir(`/vehiculos/${id}`, json('PATCH', datos))
export const sincronizar = (forzar = false) => pedir('/sincronizar', json('POST', { forzar }))

export const tramites = () => pedir('/tramites')
export const tramite = (id) => pedir(`/tramites/${id}`)
export const crearTramite = (datos) => pedir('/tramites', json('POST', datos))
export const editarTramite = (id, datos) => pedir(`/tramites/${id}`, json('PATCH', datos))
export const borrarTramite = (id) => pedir(`/tramites/${id}`, { method: 'DELETE' })
export const tomar = (id) => pedir(`/tramites/${id}/tomar`, { method: 'POST' })
export const soltar = (id) => pedir(`/tramites/${id}/soltar`, { method: 'POST' })
export const cambiarEstado = (id, datos) => pedir(`/tramites/${id}/estado`, json('POST', datos))
export const agregarNota = (id, texto) => pedir(`/tramites/${id}/notas`, json('POST', { texto }))

// Devuelve el PDF como Blob. Va por POST porque lleva los datos que se
// completaron en el formulario.
export async function ddjj(id, datos) {
  const res = await pedir(`/tramites/${id}/ddjj`, { ...json('POST', datos), crudo: true })
  return res.blob()
}

export const usuarios = () => pedir('/usuarios')
export const crearUsuario = (datos) => pedir('/usuarios', json('POST', datos))
export const editarUsuario = (id, datos) => pedir(`/usuarios/${id}`, json('PATCH', datos))

// Cedula o titulo (PDF o foto): el archivo va crudo en el cuerpo. Devuelve lo
// leido; no guarda nada.
export async function leerDocumento(archivo) {
  const res = await fetch('/api/documentos/leer', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
    body: archivo,
  })
  const cuerpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(cuerpo.error || 'No se pudo leer el documento')
  return cuerpo
}

// DNI del comprador (foto del dorso o del frente). Devuelve lo leido.
export async function leerDni(archivo) {
  const res = await fetch('/api/documentos/dni', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
    body: archivo,
  })
  const cuerpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(cuerpo.error || 'No se pudo leer el DNI')
  return cuerpo
}

// Transferencia Digital del DNRPA: lo que falta cargar antes de bajar los
// datos para el bot. Los archivos se bajan con un <a download> directo.
export const faltanDnrpa = (id) => pedir(`/tramites/${id}/dnrpa?ver=1`)
export const urlDatosDnrpa = (id) => `/api/tramites/${id}/dnrpa`
export const URL_BOT_DNRPA = '/api/dnrpa/bot.zip'
export const probarAviso = () => pedir('/avisos/prueba', { method: 'POST' })
