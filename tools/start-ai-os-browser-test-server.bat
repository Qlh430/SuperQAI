@echo off
set "PORT=3199"
set "HOST=127.0.0.1"
set "AI_OS_DATA_DIR=%~dp0..\.ai-os-browser-test-20260903"
set "CANVAS_AGENT_USE_SETTINGS_PROVIDERS=false"
set "CANVAS_AGENT_ROUTE_HISTORY_ENABLED=false"
node --disable-warning=ExperimentalWarning "%~dp0..\server.js"
