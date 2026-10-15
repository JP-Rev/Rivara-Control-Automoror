# Trámites del Registro Automotor

App de la intranet Rivara, puerto 1010. Molde B (un contenedor: Express sirve
el front y la API, SQLite en /storage/automotor).

Antes de tocar código, leer del repo `JP-Rev/Rivara-Infraestructura`:
- `docs/guia-apps.md` — stack, estructura y aspecto
- `docs/contrato-despliegue-apps.md` — despliegue

La referencia de sesión (SSO con la cookie `rivara_he` del portal y login de
respaldo) es `JP-Rev/Rivara-Finanzas-Axion`: `server/src/auth.js` es el mismo
esquema.

`src/rivara-ui.css` es una copia de la base del portal (`Rivara-Intranet`):
no editarlo acá.

La flota NO se importa a mano: sale de las planillas de `\\server` por SMB
(`server/src/smb.js`, `planillas.js`, `sincronizar.js`). Lo cargado a mano en
la app nunca lo pisa la sincronización. Los Excel reales tienen nombres de
personas: no se commitean (están en `.gitignore`); los tests usan libros
sintéticos (`server/test`).
