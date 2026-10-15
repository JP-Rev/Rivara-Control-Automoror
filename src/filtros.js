import { useEffect, useMemo, useState } from 'react'

// Filtros "inteligentes" de las listas.
//
// Lo que hacen y por que:
//   · Una sola caja de busqueda que mira todos los campos a la vez, sin
//     tildes ni mayusculas: "jose" encuentra "José".
//   · Los dominios se comparan compactados: "ae 622-bg", "AE622BG" y "622bg"
//     encuentran lo mismo.
//   · Varias palabras se suman (Y): "volvo alberti" son los Volvo de Alberti.
//   · "campo:valor" busca en un campo solo: "chofer:perez", "estado:espera",
//     "tipo:placas", "unidad:24", "año:2019".
//   · "-palabra" excluye: "-terminado", "-vacante".
//   · Las fichas (estado, tipo, categoria) muestran cuantos quedarian al
//     tocarlas, contando lo que ya filtra todo lo demas, asi nunca se elige una
//     combinacion que deja la lista vacia sin saberlo.
//   · Lo elegido se recuerda por pantalla (localStorage): volver a la bandeja
//     la deja como estaba.

export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const compactar = (s) => normalizar(s).replace(/[^a-z0-9]/g, '')

// 'estado:"en espera" volvo -vacante' -> [{campo:'estado', valor:'en espera'}, {valor:'volvo'}, {valor:'vacante', negado:true}]
export function parsearConsulta(consulta) {
  const terminos = []
  const re = /(-)?(?:([a-zA-Zñáéíóú]+):)?(?:"([^"]*)"|(\S+))/g
  let m
  while ((m = re.exec(String(consulta || '')))) {
    const valor = normalizar(m[3] ?? m[4] ?? '').trim()
    if (!valor) continue
    terminos.push({ negado: Boolean(m[1]), campo: m[2] ? normalizar(m[2]) : null, valor })
  }
  return terminos
}

/**
 * @param {object} item
 * @param {Array} terminos         salida de parsearConsulta
 * @param {object} campos          { nombre: (item) => texto }; los alias van
 *                                 como claves extra que apuntan a la misma
 *                                 funcion.
 * @param {string[]} compactos     campos que se comparan compactados (dominio)
 */
export function coincide(item, terminos, campos, compactos = []) {
  for (const t of terminos) {
    let hay
    if (t.campo && campos[t.campo]) {
      const v = campos[t.campo](item)
      hay = normalizar(v).includes(t.valor) || compactar(v).includes(compactar(t.valor))
    } else {
      const valorCompacto = compactar(t.valor)
      hay = Object.entries(campos).some(([nombre, fn]) => {
        const v = fn(item)
        if (normalizar(v).includes(t.valor)) return true
        return compactos.includes(nombre) && valorCompacto.length >= 2 && compactar(v).includes(valorCompacto)
      })
    }
    if (hay === t.negado) return false
  }
  return true
}

// Estado que sobrevive a recargar la pagina. localStorage puede no estar
// (modo privado, almacenamiento bloqueado): ahi funciona igual, sin recordar.
export function useRecordado(clave, inicial) {
  const [valor, setValor] = useState(() => {
    try {
      const guardado = localStorage.getItem(clave)
      return guardado ? { ...inicial, ...JSON.parse(guardado) } : inicial
    } catch {
      return inicial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(clave, JSON.stringify(valor)) } catch { /* sin almacenamiento */ }
  }, [clave, valor])
  return [valor, setValor]
}

// Una faceta es una funcion item -> clave, o { valor, filtro } cuando hay
// opciones que no son un valor sino un grupo ("Abiertos" = todo menos
// terminados).
const valorDe = (def) => (typeof def === 'function' ? def : def.valor)
const filtroDe = (def) => (typeof def === 'function' ? (item, elegido) => def(item) === elegido : def.filtro)

/**
 * Filtro con facetas.
 *
 * @param {object[]} items
 * @param {object} config
 *   texto:     { campos, compactos }        para la caja de busqueda
 *   facetas:   { nombre: (item) => clave }  fichas de un solo valor (o { valor, filtro })
 *   marcas:    { nombre: (item) => bool }   fichas de si/no ("faltan datos")
 * @param {object} estado  { q, ...facetas: clave|'' , ...marcas: bool }
 */
export function useFiltrado(items, config, estado) {
  return useMemo(() => {
    const terminos = parsearConsulta(estado.q)
    const facetas = config.facetas || {}
    const marcas = config.marcas || {}

    const pasa = (item, salvo) => {
      if (!coincide(item, terminos, config.texto.campos, config.texto.compactos)) return false
      for (const [nombre, def] of Object.entries(facetas)) {
        if (nombre === salvo || !estado[nombre]) continue
        if (!filtroDe(def)(item, estado[nombre])) return false
      }
      for (const [nombre, fn] of Object.entries(marcas)) {
        if (nombre === salvo || !estado[nombre]) continue
        if (!fn(item)) return false
      }
      return true
    }

    const resultado = (items || []).filter((i) => pasa(i))

    // Conteo de cada faceta con todos los demas filtros aplicados.
    const conteos = {}
    for (const [nombre, def] of Object.entries(facetas)) {
      const c = {}
      const valor = valorDe(def)
      for (const i of items || []) if (pasa(i, nombre)) { const k = valor(i); c[k] = (c[k] || 0) + 1 }
      conteos[nombre] = c
    }
    for (const [nombre, fn] of Object.entries(marcas)) {
      conteos[nombre] = (items || []).filter((i) => pasa(i, nombre) && fn(i)).length
    }
    const hayFiltros = Boolean(estado.q?.trim()) ||
      Object.keys(facetas).some((k) => estado[k]) || Object.keys(marcas).some((k) => estado[k])
    return { resultado, conteos, hayFiltros }
  }, [items, config, estado])
}

// Orden por columna, con un clic invierte.
export function ordenar(lista, { campo, desc }, accesores) {
  const fn = accesores[campo]
  if (!fn) return lista
  const col = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
  return [...lista].sort((a, b) => {
    const va = fn(a)
    const vb = fn(b)
    const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : col.compare(String(va ?? ''), String(vb ?? ''))
    return desc ? -r : r
  })
}
