@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js 20 or newer: https://nodejs.org/
  pause
  exit /b 1
)
node -e "process.exit(+(Number(process.versions.node.split('.')[0])<20))"
if errorlevel 1 (
  echo Hearth needs Node.js 20 or newer. Please update: https://nodejs.org/
  pause
  exit /b 1
)

rem Optional machine-specific settings such as a proxy; see Start.local.example.bat.
if exist "%~dp0Start.local.bat" call "%~dp0Start.local.bat"

set "NODE_FLAGS="
if defined HTTP_PROXY set "NODE_FLAGS=--use-env-proxy"
if defined HTTPS_PROXY set "NODE_FLAGS=--use-env-proxy"
if defined NODE_FLAGS (
  node --use-env-proxy -e "0" >nul 2>nul
  if errorlevel 1 (
    echo A proxy is set in Start.local.bat, but proxy support needs Node.js 24.5 or newer: https://nodejs.org/
    pause
    exit /b 1
  )
  echo Hearth outbound proxy: %HTTPS_PROXY%
)

echo Starting Hearth. Keep this window open; close it to stop Hearth.
node %NODE_FLAGS% dist\server.mjs --open
pause
