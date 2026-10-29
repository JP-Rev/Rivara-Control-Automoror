# Rivara — Trámites del Registro Automotor

Gestión de los trámites que se hacen en el Registro Automotor para la flota:
transferencias, reposición de placas, duplicados de título y de cédula,
denuncias de venta y cualquier otro. Cualquiera carga un trámite con el
dominio y qué hay que hacer; quien gestiona lo toma, lo presenta y lo sigue
hasta terminarlo.

Corre en el **puerto 1010**. Código en `/srv/automotor`, datos en
`/storage/automotor` (ver el [contrato de despliegue][contrato]). Molde B:
un solo contenedor con el front, la API y SQLite.

## Qué hace

| Pantalla | Para qué |
|---|---|
| **Bandeja** | Todos los trámites, con su estado, quién lo pidió y quién lo gestiona. Búsqueda general y filtros desplegables por estado, trámite y «más filtros» (los que cargué yo, los tomados por mí). |
| **Nuevo trámite** | Dominio (escrito o buscado por chofer, unidad o marca) y qué hay que hacer. Para reposición y duplicados, el motivo. |
| **Detalle** | Datos del vehículo, cambio de estado, número de trámite del Registro, notas y todo el seguimiento. Desde acá se imprime la DDJJ de extravío. |
| **Flota** | Camiones, acoplados y camionetas, leídos de las planillas de la red. Acá se cargan chasis, motor y uso, que las planillas no tienen. |
| **Usuarios** | (Administradores) quién gestiona trámites, quién está activo, contraseñas de respaldo. |

### Estados

`Solicitado` → `Presentado` → `En espera` → `Terminado`.

Un trámite recién cargado está **Solicitado**; mientras nadie lo toma se ve
como **Sin tomar**, y tomado, como **En preparación**. Mover un trámite que
nadie tenía lo deja tomado por quien lo movió. Se puede volver atrás (por
ejemplo, de Terminado a En espera si el Registro observó algo), y cada cambio
queda en el seguimiento con quién y cuándo.

### Filtros inteligentes

En todas las listas:

- Una caja que busca en todos los campos a la vez, sin tildes ni mayúsculas.
  Los dominios se comparan compactados: `ae 622-bg`, `AE622BG` y `622bg`
  encuentran lo mismo.
- Varias palabras se suman: `volvo alberti`.
- `campo:valor` busca en un campo solo: `chofer:perez`, `estado:espera`,
  `tipo:placas`, `unidad:24`, `año:2019`, `chasis:8avz`.
- `-palabra` excluye: `-terminado`, `-vacante`.
- Cada filtro es un menú desplegable que muestra cuántos resultados quedarían
  con cada opción (contando todo lo demás que ya está filtrado); las opciones
  que dejarían la lista vacía aparecen deshabilitadas.
- Los filtros se recuerdan por pantalla en el navegador.

## La flota sale de las planillas de la red

No hay importación manual: la app lee directamente

```
\\server\Rivara Transportes y logistica\Camionetas\Camionetas.xlsx
\\server\Rivara Transportes y logistica\Camiones\Control Camiones.xlsx
```

con las **credenciales de Windows** del `.env`, usando `smbclient` desde el
contenedor. Se leen:

- **al arrancar** el contenedor (es el seed: la base nace de la red, no de
  datos de ejemplo), y
- **cada vez que alguien entra** a la app, con un mínimo de `SYNC_MINUTOS`
  (10 por defecto) entre lecturas. Si el archivo no cambió (mismo hash), no
  se procesa.
- Desde **Flota → «Leer las planillas ahora»**, cuando haga falta ya.

### Cómo se interpretan

Las planillas van a cambiar de forma, así que **no se busca nada por posición
ni por nombre exacto**:

- Se recorren todas las hojas del libro. En cada una se busca la fila de
  encabezados (entre las primeras 20) que más columnas conocidas tenga.
- Las columnas se reconocen por sinónimos: `Dominio`/`Patente`,
  `Chofer`/`Responsable`, `Camion N°`/`#`, `Marca`/`Camioneta`,
  `Estado`/`Plan`, `Año`, `Modelo`, `Tipo`, `Titular`, `Localidad`, `Sector`.
- **Un vehículo por dominio**, que es la unidad del Registro: en Control
  Camiones, el tractor, la tolva/acoplado y el dominio adicional son tres
  vehículos unidos por el número de camión. Una celda con dos dominios
  (`AD032EK-AD032EJ`) da dos vehículos.
- Si un dominio aparece en dos hojas, manda la primera hoja del libro; las
  demás solo completan datos vacíos.
- Lo que no se puede interpretar (un dominio inválido como `ADB203OZ`, un año
  «6», `#REF!`) no se importa y aparece como aviso en Flota.
- Si el nombre del archivo no coincide exacto (por ejemplo `Control Camiones.
  xlsx` con un espacio de más), se busca en la carpeta uno parecido y se avisa
  cuál se leyó.

### Qué pisa y qué no

1. **Lo cargado a mano no se pisa nunca**: chasis, motor, uso, tipo y modelo
   registral, observaciones; y cualquier dato de planilla que alguien haya
   corregido en la app (queda marcado como «corregido a mano», y se puede
   devolver a la planilla desde la ficha del vehículo).
2. Un dominio nuevo en la planilla se da de alta solo.
3. Un dato que cambió en la planilla (otro chofer, otro estado) se actualiza.
   Una celda que quedó vacía **no** borra lo que había.
4. Un vehículo que dejó de figurar no se borra (puede tener trámites): queda
   marcado como «ya no figura en la planilla».

## DDJJ de extravío

Para reposición de placas y duplicados de título o cédula **por extravío**,
el detalle del trámite ofrece imprimir la DDJJ de la Disposición D.N. 235/03
(el mismo formulario que se usaba, dibujado igual).

- Se completa con los datos del vehículo. Lo que la flota no tiene, lo pide:
  marca, tipo, modelo y motor. Si la planilla permite sugerirlo («VW Amarok» →
  VOLKSWAGEN) se propone marcado para revisar contra el título.
- Lo que quede en blanco sale como una línea para completar a mano, igual que
  el formulario de papel.
- Quien gestiona puede guardar esos datos en la flota para no volver a
  pedirlos.
- Lo impreso queda guardado en el trámite, para reimprimirlo igual.

## Leer la cédula o el título

Desde **Flota → «Leer cédula o título»**, o desde la ficha de un vehículo
(«Completar desde la cédula o el título»), se sube el documento y se completan
los datos registrales: marca y Nº de chasis, marca y Nº de motor, modelo y tipo
como figuran en el título, uso, año, titular, Nº de título y Nº de cédula.

- **Título digital en PDF** (el que entrega el Registro): se lee el texto del
  PDF con `pdftotext`. Es exacto.
- **Foto** de la cédula o del título (también desde la cámara del celular):
  se mejora la imagen con ImageMagick y se lee con **Tesseract en castellano**.
  Corrige los errores típicos (`O`/`0` en el dominio, `I`/`O` en un VIN) y lleva
  el uso a la lista («Priv.-Tran. carga interjur.» → «PRIV. TRANSP. DE CARGA
  INTERJ.»).
- **Todo local**: el documento no sale a internet ni se guarda en el servidor
  (tiene datos personales del titular).
- **Nada se guarda sin revisar.** Cada dato leído aparece al lado del que ya
  tenía el vehículo. Se tildan solos los que completan algo vacío; los que
  pisarían un valor distinto aparecen marcados y destildados.
- Si el dominio del documento no está en la flota, al guardar se agrega.

El Nº de título y el Nº de cédula son los que pide la DDJJ de extravío: si el
vehículo los tiene, la DDJJ los precarga.

## Usuarios y permisos

Igual que el resto de las apps de la intranet:

- **Entrar por el portal alcanza.** La app acepta la cookie `rivara_he` del
  portal (mismo `JWT_SECRET`) y crea el usuario la primera vez que entra, con
  el rol que le da el portal.
- **Contraseña de respaldo**, para cuando el portal está caído: cada uno la
  define desde adentro, o se la da un administrador desde Usuarios. Es solo de
  esta app (cookie `rivara_automotor`, firmada con una clave derivada).
- **Usuario de emergencia** opcional en el `.env`.

| Rol | Puede |
|---|---|
| Cualquiera | Cargar trámites, verlos todos, dejar notas, imprimir la DDJJ. Editar o borrar los suyos mientras nadie los tomó. |
| Gestiona | Además: tomar trámites, cambiarles el estado, editar cualquiera, completar la flota. Se marca en Usuarios. |
| Administrador del portal | Gestiona siempre, y además administra usuarios y puede borrar cualquier trámite. |

## Variables de entorno

Todas en el `.env` al lado del compose. Ver `.env.example`.

| Variable | Obligatoria | Para qué |
|---|---|---|
| `JWT_SECRET` | sí | El mismo valor que en el `.env` del portal |
| `SMB_USUARIO`, `SMB_PASSWORD` | sí | Credenciales de Windows con lectura sobre el recurso |
| `SMB_DOMINIO` | según la red | Dominio de Windows, o grupo de trabajo |
| `SMB_IP` | casi siempre | IP de `\\server`: el contenedor no resuelve nombres NetBIOS |
| `SMB_PROTOCOLO_MINIMO` | no | `NT1` solo si el servidor es un Windows muy viejo |
| `PLANILLA_CAMIONETAS`, `PLANILLA_CAMIONES` | no | Rutas UNC; por defecto las de arriba. También aceptan una ruta local si el recurso se monta en el host |
| `SYNC_MINUTOS` | no | Mínimo entre lecturas automáticas (10) |
| `DDJJ_LUGAR`, `DDJJ_SECCIONAL` | no | Lo que sale en la DDJJ (editable en cada una) |
| `AUTOMOTOR_ADMIN_EMAIL`, `AUTOMOTOR_ADMIN_PASSWORD` | no | Usuario de emergencia |

> **Seguridad:** la contraseña de Windows queda escrita en el `.env` del
> servidor. Usá una **cuenta de servicio con permiso de solo lectura** sobre
> `Rivara Transportes y logistica`, no tu usuario personal. El `.env` no se
> commitea (está en `.gitignore`). Dentro del contenedor la contraseña nunca
> va en la línea de comandos: se escribe en un archivo temporal con permisos
> 600 que se borra al terminar cada lectura.

## Desarrollo

Dos procesos: la API en :3010 y Vite en :5173, que redirige `/api`.

```bash
# API (necesita smbclient instalado para leer la red: apt install smbclient)
cd server
npm install
DATA_DIR=./data PORT=3010 JWT_SECRET=dev \
  SMB_USUARIO=... SMB_PASSWORD=... SMB_IP=... \
  AUTOMOTOR_ADMIN_EMAIL=admin@rivara.local AUTOMOTOR_ADMIN_PASSWORD=cambiar123 \
  npm run dev

# Front, en otra terminal
npm install
npm run dev        # http://localhost:5173

# Tests del lector de planillas
cd server && npm test
```

## Despliegue

1. Verificá que el puerto esté libre en el host (el contrato ya se
   desactualizó una vez):

   ```bash
   docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep 1010
   ```

   No tiene que mostrar nada.

2. Probá desde el host que se llega a `\\server` con la cuenta de servicio
   (antes de tocar la app; si esto falla, la app va a fallar igual):

   ```bash
   sudo apt install -y smbclient
   smbclient '//IP_DEL_SERVER/Rivara Transportes y logistica' -U 'DOMINIO\usuario' -c 'ls Camiones\*'
   ```

   Tiene que listar `Control Camiones.xlsx`.

3. Clonar, crear el `.env` y el directorio de datos:

   ```bash
   /srv/deploy-app.sh automotor https://github.com/JP-Rev/Rivara-Control-Automoror.git
   # la primera vez falla por falta de .env: es esperado
   cd /srv/automotor
   cp .env.example .env
   chmod 600 .env
   nano .env          # JWT_SECRET del portal, SMB_*, SMB_IP
   sudo mkdir -p /storage/automotor
   docker compose up -d --build
   ```

4. Verificar:

   ```bash
   docker compose ps                    # automotor -> healthy
   docker logs automotor | tail -20     # "Planilla Camionetas: N dominios, N nuevos..."
   ```

   Si en el log aparece `NT_STATUS_LOGON_FAILURE`, `NT_STATUS_BAD_NETWORK_NAME`
   o «No se puede resolver el nombre», el mensaje dice qué variable revisar.
   El mismo error se ve en la pantalla Flota.

5. Para que aparezca en el portal: desde la pantalla de administración del
   portal, agregar la app con puerto **1010** y asignarla a quien corresponda.

Para actualizar, el mismo `deploy-app.sh`. La base no se toca: el esquema se
crea con `CREATE TABLE IF NOT EXISTS`.

### Backup

La base es `/storage/automotor/automotor.db`. **Nunca copiarla con `cp`
estando la app arriba** (WAL). Backup en caliente:

```bash
docker exec automotor sqlite3 /data/automotor.db ".backup '/data/backup-$(date +%F).db'"
```

## Stack

React 19 + Vite en el front, Express 4 + better-sqlite3 en el servidor, como
Finanzas Axion. Además: `xlsx` para leer las planillas, `pdf-lib` para la
DDJJ (Helvetica estándar, sin fuentes embebidas), y en la imagen `smbclient`
para la red Windows y `poppler-utils`, `tesseract-ocr-spa` e `imagemagick`
para leer cédulas y títulos. Sin router: la vista vive en `App.jsx`.

`src/rivara-ui.css` es una copia de la base del portal y **no se edita acá**.

[contrato]: https://github.com/JP-Rev/Rivara-Infraestructura/blob/main/docs/contrato-despliegue-apps.md
