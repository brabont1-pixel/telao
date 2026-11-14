@echo off
chcp 65001 >nul
title Gerar o instalador do Telão
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta instalar o Node.js. Vou abrir o site: baixe a versao LTS, instale e rode este arquivo de novo.
  start https://nodejs.org/pt
  pause
  exit /b
)
echo.
echo  [1/3] Baixando o Electron (so na primeira vez, pode demorar uns minutos)...
call npm install
if errorlevel 1 ( echo. & echo  Deu erro no npm install. Confira sua internet e tente de novo. & pause & exit /b )

echo.
echo  [2/3] Preparando as ferramentas do Windows...
rem O electron-builder tenta extrair arquivos do Mac que pedem permissao de administrador no Windows.
rem Aqui a gente baixa e extrai essa ferramenta sem a parte do Mac, e o erro some.
set "WCS=%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
set "WCSDIR=%WCS%\winCodeSign-2.6.0"
set "Z7=%~dp0node_modules\7zip-bin\win\x64\7za.exe"
if exist "%WCSDIR%\rcedit-x64.exe" goto pronto
if not exist "%WCS%" mkdir "%WCS%"
if exist "%WCSDIR%" rmdir /s /q "%WCSDIR%"
powershell -NoProfile -Command "try { [Net.ServicePointManager]::SecurityProtocol = 'Tls12'; Invoke-WebRequest -UseBasicParsing 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z' -OutFile '%WCS%\wcs-telao.7z' } catch { exit 1 }"
if errorlevel 1 ( echo. & echo  Nao consegui baixar a ferramenta. Confira sua internet e tente de novo. & pause & exit /b )
"%Z7%" x "%WCS%\wcs-telao.7z" -o"%WCSDIR%" -y -xr!darwin >nul
del /q "%WCS%\wcs-telao.7z" >nul 2>nul
if not exist "%WCSDIR%\rcedit-x64.exe" ( echo. & echo  Nao consegui preparar a ferramenta. Tente rodar este arquivo como administrador. & pause & exit /b )
:pronto

echo.
echo  [3/3] Montando o instalador...
call npx electron-builder --win nsis --x64 --publish never
if errorlevel 1 ( echo. & echo  Deu erro ao montar o instalador. Mande um print desta tela. & pause & exit /b )
echo.
echo  Pronto! O instalador e o arquivo dist\Telao-Setup.exe
explorer dist
pause
