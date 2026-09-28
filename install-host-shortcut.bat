@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-host-shortcut.ps1" -ProjectRoot "%~dp0"
if errorlevel 1 (
  echo.
  echo Failed to create the AI OS Host shortcut.
  pause
  exit /b 1
)
echo.
echo AI OS Host is ready. Double-click the desktop icon to start it.
pause
