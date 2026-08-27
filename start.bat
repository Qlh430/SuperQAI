@echo off
setlocal

cd /d "%~dp0"

if not exist ".env" (
  echo Missing .env file.
  echo Copy .env.example to .env and fill your API settings first.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Node.js 24.13 or newer within Node 24 LTS is required.
  pause
  exit /b 1
)

node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major===24&&minor>=13?0:1)" >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.13 or newer within Node 24 LTS is required.
  pause
  exit /b 1
)

echo Starting AI Studio...
start "AI Studio Server" cmd /k "cd /d ""%~dp0"" && node server.js"

ping -n 3 127.0.0.1 >nul
start "" "http://localhost:3099"

echo Website opened: http://localhost:3099
echo LAN addresses:
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
  echo http://%%A:3099
)
pause
