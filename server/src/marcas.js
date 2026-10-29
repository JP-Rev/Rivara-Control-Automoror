// La planilla escribe marca y modelo juntos, como se dicen: "Toyota Hilux",
// "VW Amarok", "Iveco 280 Tector", y a veces solo el modelo ("Corolla XLI").
// Esto los separa: marca por un lado, el resto va al modelo.

// Primera palabra -> marca. Las abreviaturas y los modelos que la gente usa
// como si fueran la marca tambien cuentan.
const POR_PALABRA = {
  vw: 'Volkswagen', volkswagen: 'Volkswagen', toyota: 'Toyota', ford: 'Ford', iveco: 'Iveco',
  volvo: 'Volvo', scania: 'Scania', mercedes: 'Mercedes Benz', 'mercedes-benz': 'Mercedes Benz', mb: 'Mercedes Benz',
  fiat: 'Fiat', chevrolet: 'Chevrolet', renault: 'Renault', peugeot: 'Peugeot', nissan: 'Nissan',
}
// Modelos que en la planilla aparecen sin la marca adelante.
const MODELO_A_MARCA = {
  hilux: 'Toyota', corolla: 'Toyota', sw4: 'Toyota', etios: 'Toyota',
  amarok: 'Volkswagen', saveiro: 'Volkswagen', gol: 'Volkswagen',
  ranger: 'Ford', cargo: 'Ford',
}

const normal = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * ("Toyota Hilux", "DX Pack 2.5") -> { marca: 'Toyota', modelo: 'Hilux DX Pack 2.5' }
 * ("Corolla XLI 1.8 CVT", "Corolla XLI 1.8 CVT") -> { marca: 'Toyota', modelo: 'Corolla XLI 1.8 CVT' }
 * Si la marca no se reconoce, queda todo como vino.
 */
export function partirMarcaModelo(textoMarca, textoModelo = '') {
  const marcaCruda = String(textoMarca || '').replace(/\s+/g, ' ').trim()
  const modeloCrudo = String(textoModelo || '').replace(/\s+/g, ' ').trim()
  const [primera = '', ...resto] = marcaCruda.split(' ')

  let marca = POR_PALABRA[normal(primera)]
  let delModelo = resto
  if (!marca && MODELO_A_MARCA[normal(primera)]) {
    marca = MODELO_A_MARCA[normal(primera)]
    delModelo = [primera, ...resto]
  }
  if (!marca) return { marca: marcaCruda, modelo: modeloCrudo }

  const base = delModelo.join(' ')
  // Si la columna Modelo repite lo que ya decia la marca ("Corolla XLI" en
  // las dos), no se duplica.
  // Y si la columna Modelo ya nombra el modelo ("A2-Amarok comf V6 AT"),
  // va sola.
  let modelo = base
  if (modeloCrudo && !normal(base).includes(normal(modeloCrudo))) {
    modelo = base && normal(modeloCrudo).includes(normal(base)) ? modeloCrudo : [base, modeloCrudo].filter(Boolean).join(' ')
  }
  return { marca, modelo: modelo.trim() }
}
