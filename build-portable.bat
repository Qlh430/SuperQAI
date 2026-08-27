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
  canvas-agent.css
  script.js
  canvas-agent-capabilities.js
  canvas-agent-core.js
  canvas-agent-broker.js
  canvas-agent-mcp-protocol.js
  canvas-agent-mcp-server.js
  canvas-agent-tool-adapters.js
  canvas-agent-conversation.js
  canvas-agent-conversation-store.js
  canvas-agent-router.js
  canvas-agent-verification.js
  canvas-agent-llm-connectors.js
  canvas-agent-model-adapters.js
  canvas-agent-ui.js
  server.js
  canvas-agent-runtime.js
  outbound-fetch.js
  image-model-routing.js
  image-resolution-rules.js
  image-loading-rules.js
  image-resource-manager.js
  image-thumbnail-worker.js
  image-thumbnail-store.js
  image-job-manager.js
  canvas-board-loading-rules.js
  canvas-virtualization-rules.js
  canvas-virtual-store.js
  canvas-paged-store.js
  canvas-engine-contract.js
  canvas-node-preview-rules.js
  canvas-scene-rules.js
  canvas-primitive-layer.js
  canvas-viewport-data-source.js
  canvas-media-scheduler.js
  canvas-scene-layer.js
  canvas-virtualizer.js
  canvas-spatial-rules.js
  canvas-schema.js
  canvas-db-worker.js
  canvas-repository.js
  canvas-legacy-migrator.js
  canvas-query-service.js
  canvas-command-service.js
  canvas-export-service.js
  video-history-rules.js
  grid-slicing-rules.js
  minimax-h3-workflow.js
  package.json
  package-lock.json
  README.md
  logo.png
  .env.example
  start.bat
) do (
  if not exist "%%F" (
    echo ERROR: Required runtime file is missing: %%F
    if not defined NO_PAUSE pause
    exit /b 1
  )
  copy /y "%%F" "%TARGET_DIR%\" >nul
  if errorlevel 1 (
    echo ERROR: Could not copy required runtime file: %%F
    if not defined NO_PAUSE pause
    exit /b 1
  )
)

echo .env is not included. Create or keep it on the target computer from .env.example.

for %%D in (assets workflows skills) do (
  if exist "%%D" robocopy "%%D" "%TARGET_DIR%\%%D" /E /NFL /NDL /NJH /NJS /NP >nul
)

if exist "node_modules\undici" robocopy "node_modules\undici" "%TARGET_DIR%\node_modules\undici" /E /NFL /NDL /NJH /NJS /NP >nul

mkdir "%TARGET_DIR%\data" >nul 2>nul
mkdir "%TARGET_DIR%\output" >nul 2>nul
mkdir "%TARGET_DIR%\tmp" >nul 2>nul

if defined INCLUDE_DATA (
  echo Including local data and output. Do not publish this package publicly.
  if exist "data" robocopy "data" "%TARGET_DIR%\data" /E /NFL /NDL /NJH /NJS /NP >nul
  if exist "output" robocopy "output" "%TARGET_DIR%\output" /E /NFL /NDL /NJH /NJS /NP >nul
)

mkdir "%TARGET_DIR%\tools" >nul 2>nul
copy /y "tools\compact-canvas-data.js" "%TARGET_DIR%\tools\" >nul
if errorlevel 1 (
  echo ERROR: Could not copy canvas data migration tool.
  if not defined NO_PAUSE pause
  exit /b 1
)

if defined INCLUDE_DATA (
  echo Optimizing canvas data in portable package...
  node "%TARGET_DIR%\tools\compact-canvas-data.js" "%TARGET_DIR%"
)

echo Verifying portable package runtime files...
node "%~dp0tools\check-portable-package.js" "%TARGET_DIR%"
if errorlevel 1 (
  echo.
  echo Portable package verification failed. The zip was not created.
  if not defined NO_PAUSE pause
  exit /b 1
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
