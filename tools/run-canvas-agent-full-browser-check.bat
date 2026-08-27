@echo off
set CANVAS_AGENT_TEST_URL=http://127.0.0.1:3113
set PLAYWRIGHT_CHROMIUM_EXECUTABLE=C:\Program Files\Google\Chrome\Application\chrome.exe
node tools\check-canvas-agent-browser.js
