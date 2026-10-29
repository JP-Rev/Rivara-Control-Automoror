@echo off
rem Bot de la Transferencia Digital del DNRPA (ver LEEME.txt).
rem Se abre solo desde la app (boton "Abrir el bot" del tramite). La primera
rem vez hay que abrirlo con doble clic: registra el enlace rivara-dnrpa: para
rem este usuario de Windows (sin permisos de administrador) y queda listo.
setlocal
cd /d "%~dp0"

rem Enlace rivara-dnrpa: -> este archivo. Se rehace cada vez: si se mueve la
rem carpeta, apunta al lugar nuevo. Se borra con:
rem   reg delete "HKCU\Software\Classes\rivara-dnrpa" /f
reg add "HKCU\Software\Classes\rivara-dnrpa" /ve /d "URL:Bot DNRPA Rivara" /f >nul
reg add "HKCU\Software\Classes\rivara-dnrpa" /v "URL Protocol" /d "" /f >nul
reg add "HKCU\Software\Classes\rivara-dnrpa\shell\open\command" /ve /d "\"%~f0\" \"%%1\"" /f >nul

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
if "%~1"=="" (
  echo.
  echo Listo: el bot quedo instalado en esta PC.
  echo Ahora se abre desde la app: en el tramite, "Cargar en el DNRPA" y "Abrir el bot".
  pause
  exit /b 0
)
node dnrpa.mjs %*
if errorlevel 1 pause
