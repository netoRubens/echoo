@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js primeiro: https://nodejs.org
  start https://nodejs.org
  pause
  exit /b
)
echo [1/3] Instalando dependencias...
call npm install
echo [2/3] Gerando o app (dist\win-unpacked)...
call npx electron-builder --win dir --publish never
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set VER=%%v
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
  echo Inno Setup nao encontrado. Instale em https://jrsoftware.org/isdl.php e rode de novo.
  start https://jrsoftware.org/isdl.php
  pause
  exit /b
)
echo [3/3] Compilando o instalador com o Inno Setup...
"%ISCC%" /DAppVersion=%VER% installer\ECHOO.iss
echo.
echo Pronto: dist-installer\ECHOO-Setup.exe
explorer dist-installer
pause
