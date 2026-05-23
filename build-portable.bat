@echo off
setlocal

cd /d "%~dp0"
set "NO_PAUSE="
set "INCLUDE_DATA="

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"
if /I "%~1"=="--with-data" set "INCLUDE_DATA=1"
shift
goto parse_args
:args_done

set "APP_NAME=AI-Studio-Portable"
set "DIST_DIR=%~dp0dist"
set "TARGET_DIR=%DIST_DIR%\%APP_NAME%"
set "ZIP_FILE=%DIST_DIR%\%APP_NAME%.zip"

where powershell >nul 2>nul
if errorlevel 1 (
  echo PowerShell was not found.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo.
echo Building portable package...
echo Target folder:
echo %TARGET_DIR%
echo.

if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
if exist "%TARGET_DIR%" rmdir /s /q "%TARGET_DIR%"
mkdir "%TARGET_DIR%"

for %%F in (
  index.html
  styles.css
  script.js
  server.js
  package.json
  README.md
  logo.png
  .env.example
  start.bat
) do (
  if exist "%%F" copy /y "%%F" "%TARGET_DIR%\" >nul
)

echo .env is not included. Create or keep it on the target computer from .env.example.

for %%D in (assets workflows) do (
  if exist "%%D" robocopy "%%D" "%TARGET_DIR%\%%D" /E /NFL /NDL /NJH /NJS /NP >nul
)

mkdir "%TARGET_DIR%\data" >nul 2>nul
mkdir "%TARGET_DIR%\output" >nul 2>nul
mkdir "%TARGET_DIR%\tmp" >nul 2>nul

if defined INCLUDE_DATA (
  echo Including local data and output. Do not publish this package publicly.
  if exist "data" robocopy "data" "%TARGET_DIR%\data" /E /NFL /NDL /NJH /NJS /NP >nul
  if exist "output" robocopy "output" "%TARGET_DIR%\output" /E /NFL /NDL /NJH /NJS /NP >nul
)

if exist "tools" robocopy "tools" "%TARGET_DIR%\tools" /E /NFL /NDL /NJH /NJS /NP >nul

if defined INCLUDE_DATA (
  echo Optimizing canvas data in portable package...
  node "%TARGET_DIR%\tools\compact-canvas-data.js" "%TARGET_DIR%"
)

if exist "%ZIP_FILE%" del /f /q "%ZIP_FILE%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -LiteralPath '%TARGET_DIR%' -DestinationPath '%ZIP_FILE%' -Force"
if errorlevel 1 (
  echo.
  echo Package folder was created, but zip compression failed.
  echo Folder: %TARGET_DIR%
  if not defined NO_PAUSE pause
  exit /b 1
)

echo.
echo Portable package is ready:
echo %ZIP_FILE%
echo.
echo Copy the zip to another Windows computer, unzip it, then run start.bat.
if not defined NO_PAUSE pause
