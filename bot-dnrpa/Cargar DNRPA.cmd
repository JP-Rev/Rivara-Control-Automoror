@echo off
rem Bot de la Transferencia Digital del DNRPA (ver LEEME.txt).
rem Doble clic: usa el dnrpa-*.json mas nuevo de Descargas.
rem O arrastrar un dnrpa-*.json sobre este archivo.
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y volve a abrir este archivo.
  pause
  exit /b 1
)
if not exist "node_modules\playwright-core" (
  echo Primera vez: instalando lo necesario, tarda un minuto...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo No se pudo instalar. Revisa la conexion a internet.
    pause
    exit /b 1
  )
)
node dnrpa.mjs %*
if errorlevel 1 pause
