@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js primeiro: https://nodejs.org
  start https://nodejs.org
  pause
  exit /b
)
echo Gerando o instalador de teste (a versao oficial sai pelo GitHub). Aguarde alguns minutos...
call npm install
call npm run build
echo.
echo Pronto! O instalador esta na pasta dist: ECHOO-Setup.exe
explorer dist
pause
