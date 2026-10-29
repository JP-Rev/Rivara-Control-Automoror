// Datos de una transferencia para el bot de la Transferencia Digital del
// DNRPA (bot-dnrpa/dnrpa.mjs). El bot corre en la PC de quien hace el
// tramite y completa el sitio con este JSON; aca se arma con los nombres y
// formatos que muestra el sitio (fecha DD/MM/AAAA, sexo "Femenino", CUIT sin
// guiones), y se avisa lo que falta antes de bajarlo.

const SEXOS = { M: 'Masculino', F: 'Femenino', X: 'No Binario' }
const mayus = (s) => String(s || '').trim().toUpperCase()
const digitos = (s) => String(s || '').replace(/\D/g, '')
const fechaDNRPA = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : '')

// Los ultimos 7 caracteres del numero de chasis: lo que pide la primera
// pantalla para confirmar el vehiculo.
export const chasis7 = (nro) => String(nro || '').replace(/[^0-9A-Z]/gi, '').toUpperCase().slice(-7)

export const CONTACTO_DNRPA = {
  email: () => process.env.DNRPA_EMAIL || 'jreale@rivara.com.ar',
  telefono: () => process.env.DNRPA_TELEFONO || '2346472000',
}

/**
 * @param {object} t  tramite publico (con comprador, vendedor y vehiculo)
 */
export function datosDnrpa(t) {
  const c = t.comprador || {}
  const v = t.vendedor || {}
  const juridica = v.tipo === 'JURIDICA'
  const domicilio = {
    provincia: mayus(c.provincia), partido: mayus(c.partido), localidad: mayus(c.localidad), calle: mayus(c.calle),
    numero: mayus(c.numero), piso: mayus(c.piso), depto: mayus(c.depto), cp: mayus(c.cp),
  }
  const casado = c.estadoCivil === 'Casado'
  const datos = {
    rivara: 'dnrpa-transferencia',
    version: 1,
    tramite: t.id,
    generado: new Date().toISOString(),
    dominio: t.dominio,
    chasis7: chasis7(t.vehiculo?.nroChasis),
    contacto: { email: CONTACTO_DNRPA.email(), telefono: CONTACTO_DNRPA.telefono() },
    vendedor: juridica
      ? { tipo: 'JURIDICA', razonSocial: mayus(v.razonSocial), cuit: digitos(v.cuil) }
      : {
          tipo: 'FISICA', dni: digitos(v.dni), cuit: digitos(v.cuil),
          nombre: mayus(v.nombres), apellido: mayus(v.apellido), estadoCivil: v.estadoCivil || '',
        },
    comprador: {
      dni: digitos(c.dni), sexo: SEXOS[c.sexo] || '', nombre: mayus(c.nombres), apellido: mayus(c.apellido),
      estadoCivil: c.estadoCivil || '', nacionalidad: c.nacionalidad || '', fechaNacimiento: fechaDNRPA(c.fechaNacimiento),
      cuit: digitos(c.cuil), ocupacion: mayus(c.ocupacion),
      conyuge: casado
        ? { dni: digitos(c.conyugeDni), nombre: mayus(c.conyugeNombre), apellido: mayus(c.conyugeApellido), caracter: c.caracterBien || '' }
        : {},
      domicilio,
      // El sitio pide tambien el domicilio real: el mismo que el del DNI.
      domicilioReal: domicilio,
    },
  }

  const faltan = []
  const falta = (cond, nombre) => { if (!cond) faltan.push(nombre) }
  falta(datos.chasis7, 'nº de chasis del vehículo')
  const dv = datos.vendedor
  if (juridica) {
    falta(dv.razonSocial, 'razón social del vendedor')
    falta(dv.cuit, 'CUIT del vendedor')
  } else {
    falta(dv.dni, 'DNI del vendedor')
    falta(dv.cuit, 'CUIT/CUIL del vendedor')
    falta(dv.apellido && dv.nombre, 'nombre y apellido del vendedor')
    falta(dv.estadoCivil, 'estado civil del vendedor al comprar')
  }
  const dc = datos.comprador
  falta(dc.dni, 'DNI del comprador')
  falta(dc.apellido && dc.nombre, 'nombre y apellido del comprador')
  falta(dc.sexo, 'sexo del comprador')
  falta(dc.estadoCivil, 'estado civil del comprador')
  falta(dc.fechaNacimiento, 'fecha de nacimiento del comprador')
  falta(dc.cuit, 'CUIL del comprador')
  falta(dc.ocupacion, 'ocupación del comprador')
  falta(domicilio.provincia && domicilio.partido && domicilio.localidad && domicilio.calle && domicilio.numero, 'domicilio del comprador')
  falta(domicilio.cp, 'código postal del comprador')
  if (casado) {
    falta(dc.conyuge.dni && dc.conyuge.nombre && dc.conyuge.apellido, 'datos del cónyuge')
    falta(dc.conyuge.caracter, 'carácter del bien (ganancial o propio)')
  }
  return { ...datos, faltan }
}
