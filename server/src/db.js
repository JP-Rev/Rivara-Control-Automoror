import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

// El contrato (§7) manda el DIRECTORIO de datos como bind mount de
// /storage/automotor, nunca el archivo .db suelto: SQLite necesita crear los
// hermanos -wal y -shm al lado.
export const DATA_DIR = process.env.DATA_DIR || '/data'
const DB_FILE = path.join(DATA_DIR, 'automotor.db')

fs.mkdirSync(DATA_DIR, { recursive: true })

export const db = new Database(DB_FILE)

db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 5000')
db.pragma('foreign_keys = ON')

export function migrate() {
  db.exec(`
    -- id TEXT y no INTEGER a proposito: cuando el usuario entra por el portal
    -- se lo auto-provisiona con el 'sub' del JWT, que es el uuid del portal.
    -- Asi la misma persona es la misma fila entre en una app o en la otra.
    CREATE TABLE IF NOT EXISTS usuarios (
      id             TEXT PRIMARY KEY,
      email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
      nombre         TEXT NOT NULL DEFAULT '',
      -- Vacia mientras el usuario no defina su contrasena de respaldo: entra
      -- por el portal y no necesita ninguna.
      password       TEXT NOT NULL DEFAULT '',
      -- Lo decide el portal (es_admin) y se pisa en cada ingreso por ahi.
      es_admin       INTEGER NOT NULL DEFAULT 0,
      -- Propio de esta app: quien puede tomar tramites, cambiarles el estado
      -- y completar los datos de la flota. Un admin lo es siempre.
      es_gestor      INTEGER NOT NULL DEFAULT 0,
      activo         INTEGER NOT NULL DEFAULT 1,
      ultimo_ingreso TEXT,
      creado_en      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Un vehiculo por DOMINIO, que es la unidad del Registro: un camion con
    -- tolva son dos vehiculos (dos titulos, dos juegos de placas), unidos por
    -- el numero de unidad.
    CREATE TABLE IF NOT EXISTS vehiculos (
      id             INTEGER PRIMARY KEY,
      dominio        TEXT NOT NULL UNIQUE,
      -- CAMIONETA, CAMION, ACOPLADO u OTRO.
      categoria      TEXT NOT NULL DEFAULT 'OTRO',
      -- Numero interno ("Camion N°", "#" de la planilla de camionetas).
      unidad         TEXT NOT NULL DEFAULT '',
      -- Lugar del dominio dentro de la unidad: Tractor, Tolva/Acoplado...
      rol            TEXT NOT NULL DEFAULT '',
      marca          TEXT NOT NULL DEFAULT '',
      modelo         TEXT NOT NULL DEFAULT '',
      -- La columna "Tipo" de la planilla de camionetas (C/D 4x4). No es el
      -- tipo registral (PICK UP, SEMIRREMOLQUE), que va en tipo_registral.
      configuracion  TEXT NOT NULL DEFAULT '',
      anio           INTEGER,
      chofer         TEXT NOT NULL DEFAULT '',
      estado         TEXT NOT NULL DEFAULT '',
      titular        TEXT NOT NULL DEFAULT '',
      localidad      TEXT NOT NULL DEFAULT '',
      sector         TEXT NOT NULL DEFAULT '',

      -- Datos registrales que no estan en ninguna planilla: se cargan a mano.
      tipo_registral TEXT NOT NULL DEFAULT '',
      -- El modelo como figura en el titulo (AMAROK TRENDLINE 4X4 2.0L TDI
      -- 140 CV), que no es el de la planilla (TDI 140cv).
      modelo_registral TEXT NOT NULL DEFAULT '',
      marca_chasis   TEXT NOT NULL DEFAULT '',
      nro_chasis     TEXT NOT NULL DEFAULT '',
      marca_motor    TEXT NOT NULL DEFAULT '',
      nro_motor      TEXT NOT NULL DEFAULT '',
      uso            TEXT NOT NULL DEFAULT '',
      -- Numeros de control del titulo y de la cedula: son los que pide la
      -- DDJJ de extravio. Se cargan a mano o leyendo el documento.
      nro_titulo     TEXT NOT NULL DEFAULT '',
      nro_cedula     TEXT NOT NULL DEFAULT '',
      observaciones  TEXT NOT NULL DEFAULT '',

      -- De que planilla viene ('camionetas', 'camiones') o '' si se cargo a
      -- mano. origen es el detalle legible: 'Camionetas.xlsx › Actual1, fila 4'.
      fuente         TEXT NOT NULL DEFAULT '',
      origen         TEXT NOT NULL DEFAULT 'Carga manual',
      -- 1 si aparecio en la ultima lectura de su planilla. Un vehiculo que se
      -- vendio deja de figurar, pero no se borra: puede tener tramites.
      en_planilla    INTEGER NOT NULL DEFAULT 0,
      -- Campos de planilla que alguien corrigio a mano en la app (JSON). La
      -- sincronizacion no los vuelve a pisar.
      manuales       TEXT NOT NULL DEFAULT '[]',
      sincronizado_en TEXT,
      creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tramites (
      id             INTEGER PRIMARY KEY,
      -- El dominio y no una FK al vehiculo: quien pide el tramite puede cargar
      -- un dominio que todavia no esta en la flota, y se cruza al leer.
      dominio        TEXT NOT NULL,
      tipo           TEXT NOT NULL,
      -- Para reposicion y duplicados: EXTRAVIO, ROBO o DETERIORO.
      motivo         TEXT NOT NULL DEFAULT '',
      -- SOLICITADO (sin tomar o en preparacion), PRESENTADO, EN_ESPERA o
      -- TERMINADO.
      estado         TEXT NOT NULL DEFAULT 'SOLICITADO',
      observaciones  TEXT NOT NULL DEFAULT '',
      -- Numero de tramite o de control que da el Registro al presentar.
      nro_registro   TEXT NOT NULL DEFAULT '',
      solicitante_id TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
      gestor_id      TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
      tomado_en      TEXT,
      presentado_en  TEXT,
      terminado_en   TEXT,
      -- Lo que se imprimio en la DDJJ de extravio la ultima vez (JSON), para
      -- reimprimirla igual.
      ddjj           TEXT,
      -- Transferencias y denuncias de venta: datos del comprador (JSON).
      -- Son datos personales: no se guarda la foto del DNI, solo esto.
      comprador      TEXT,
      creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS tramites_dominio ON tramites(dominio);
    CREATE INDEX IF NOT EXISTS tramites_estado ON tramites(estado);

    -- El seguimiento: cada cosa que le pasa a un tramite queda como una fila.
    CREATE TABLE IF NOT EXISTS tramite_eventos (
      id          INTEGER PRIMARY KEY,
      tramite_id  INTEGER NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
      usuario_id  TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
      -- CREADO, TOMADO, SOLTADO, ESTADO, NOTA, EDITADO, DDJJ
      tipo        TEXT NOT NULL,
      estado_desde TEXT,
      estado_hasta TEXT,
      texto       TEXT NOT NULL DEFAULT '',
      creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS eventos_tramite ON tramite_eventos(tramite_id);

    -- Una fila por intento de leer una planilla de la red.
    CREATE TABLE IF NOT EXISTS sincronizaciones (
      id          INTEGER PRIMARY KEY,
      fuente      TEXT NOT NULL,
      archivo     TEXT NOT NULL DEFAULT '',
      inicio      TEXT NOT NULL,
      fin         TEXT,
      ok          INTEGER NOT NULL DEFAULT 0,
      -- Hash del archivo leido: si no cambio desde la ultima vez, no se vuelve
      -- a procesar.
      hash        TEXT,
      -- La ultima vez que se volvio a leer y no habia cambios. Se actualiza
      -- sobre la misma fila para no sumar una por cada vez que alguien entra.
      verificado_en TEXT,
      nuevos      INTEGER NOT NULL DEFAULT 0,
      actualizados INTEGER NOT NULL DEFAULT 0,
      leidos      INTEGER NOT NULL DEFAULT 0,
      mensaje     TEXT NOT NULL DEFAULT '',
      avisos      TEXT NOT NULL DEFAULT '[]'
    );
  `)

  // Columnas que se agregaron despues de la primera version: CREATE TABLE IF
  // NOT EXISTS no las suma a una base que ya existe. ALTER ... ADD COLUMN no
  // toca los datos que ya estan.
  const columnas = new Set(db.prepare('PRAGMA table_info(vehiculos)').all().map((c) => c.name))
  for (const [col, def] of [['nro_titulo', "TEXT NOT NULL DEFAULT ''"], ['nro_cedula', "TEXT NOT NULL DEFAULT ''"]]) {
    if (!columnas.has(col)) db.exec(`ALTER TABLE vehiculos ADD COLUMN ${col} ${def}`)
  }
  const deTramites = new Set(db.prepare('PRAGMA table_info(tramites)').all().map((c) => c.name))
  if (!deTramites.has('comprador')) db.exec('ALTER TABLE tramites ADD COLUMN comprador TEXT')
}
