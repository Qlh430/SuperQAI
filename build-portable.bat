@echo off
setlocal
cd /d "%~dp0"
set "NO_PAUSE="
for %%A in (%*) do if /I "%%~A"=="--no-pause" set "NO_PAUSE=1"
echo Checking portable runtime and image reliability...
node tools\check-image-reliability.js
if errorlevel 1 goto failed
node tools\check-desktop-runtime-paths.js
if errorlevel 1 goto failed
node --disable-warning=ExperimentalWarning tools\check-portable-migration.js
if errorlevel 1 goto failed
echo Building Electron portable package...
node tools\build-electron-portable.js --zip %*
if errorlevel 1 goto failed
echo Extract the zip, then run AI OS.exe. Select your old project to migrate on first launch.
if not defined NO_PAUSE pause
exit /b 0
:failed
echo Packaging stopped. Existing packages and data were not overwritten.
if not defined NO_PAUSE pause
exit /b 1
