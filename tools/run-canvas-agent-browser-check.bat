@echo off
set NODE_PATH=C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules
set PLAYWRIGHT_CHROMIUM_EXECUTABLE=C:\Program Files\Google\Chrome\Application\chrome.exe
node tools\check-canvas-agent-ui-browser.js
