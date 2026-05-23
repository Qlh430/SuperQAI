@echo off
setlocal

cd /d "%~dp0"

if not exist ".env" (
  echo Missing .env file.
  echo Please copy .env.example to .env and fill AI_API_KEY first.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install Node.js first, then run this launcher again.
  pause
  exit /b 1
)

echo Starting AI API website...
start "AI API Server" cmd /k "cd /d ""%~dp0"" && node server.js"

ping -n 3 127.0.0.1 >nul
start "" "http://localhost:3099"

echo Website opened: http://localhost:3099
echo On another computer in the same LAN, open:
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "LAN_IP=%%A"
  goto :show_lan_url
)

:show_lan_url
set "LAN_IP=%LAN_IP: =%"
if defined LAN_IP echo http://%LAN_IP%:3099
exit /b 0
