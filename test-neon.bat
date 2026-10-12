@echo off
REM ============================================================================
REM  AI OS Neon 设计系统 - 快速测试脚本
REM ============================================================================

echo.
echo ================================================================================
echo   AI OS Neon 设计系统测试
echo ================================================================================
echo.

set APP_DIR=E:\CODEX项目\AI-OS-Portable-1.0.5-win-x64\AI-OS-Portable-1.0.5-win-x64\.ai-runtime\versions\1.0.5-win-x64\resources\app

echo [1/4] 检查必需文件...
echo.

if not exist "%APP_DIR%\neon-tokens.css" (
    echo [X] 错误: neon-tokens.css 不存在
    exit /b 1
)
echo [OK] neon-tokens.css

if not exist "%APP_DIR%\neon-components.css" (
    echo [X] 错误: neon-components.css 不存在
    exit /b 1
)
echo [OK] neon-components.css

if not exist "%APP_DIR%\neon-overrides.css" (
    echo [X] 错误: neon-overrides.css 不存在
    exit /b 1
)
echo [OK] neon-overrides.css

if not exist "%APP_DIR%\index.html" (
    echo [X] 错误: index.html 不存在
    exit /b 1
)
echo [OK] index.html

echo.
echo [2/4] 检查文件大小...
echo.

for %%f in ("%APP_DIR%\neon-tokens.css") do echo neon-tokens.css: %%~zf bytes
for %%f in ("%APP_DIR%\neon-components.css") do echo neon-components.css: %%~zf bytes
for %%f in ("%APP_DIR%\neon-overrides.css") do echo neon-overrides.css: %%~zf bytes

echo.
echo [3/4] 检查 index.html 集成...
echo.

findstr /C:"neon-overrides.css" "%APP_DIR%\index.html" >nul
if errorlevel 1 (
    echo [X] 警告: index.html 中未找到 neon-overrides.css 引用
) else (
    echo [OK] neon-overrides.css 已在 index.html 中引用
)

echo.
echo [4/4] 启动测试选项
echo.
echo 请选择测试方式:
echo.
echo   1. 打开组件演示页面 (neon-showcase.html)
echo   2. 运行 AI OS 应用
echo   3. 查看部署文档
echo   4. 运行硬编码分析
echo   5. 退出
echo.

set /p choice="请输入选项 (1-5): "

if "%choice%"=="1" (
    echo.
    echo 正在打开组件演示页面...
    start "" "%APP_DIR%\neon-showcase.html"
    echo [OK] 已在浏览器中打开演示页面
)

if "%choice%"=="2" (
    echo.
    echo 正在启动 AI OS...
    cd /d "E:\CODEX项目\AI-OS-Portable-1.0.5-win-x64"
    start "" "AI-OS-Portable.exe"
    echo [OK] AI OS 已启动，请检查界面是否应用了 Neon 主题
)

if "%choice%"=="3" (
    echo.
    echo 正在打开部署文档...
    start "" notepad "%APP_DIR%\NEON-DEPLOYMENT-COMPLETE.md"
    echo [OK] 文档已打开
)

if "%choice%"=="4" (
    echo.
    echo 正在运行硬编码分析...
    cd /d "%APP_DIR%"
    node analyze-hardcoded.js
    pause
)

if "%choice%"=="5" (
    echo.
    echo 退出测试脚本
    exit /b 0
)

echo.
echo ================================================================================
echo   测试提示
echo ================================================================================
echo.
echo   预期效果:
echo   1. 背景色: 近黑色 (#0a0a0a)
echo   2. 主色: 霓虹绿 (#00ff41)
echo   3. 按钮: 霓虹绿色发光效果
echo   4. 输入框: 霓虹绿色焦点环
echo   5. 卡片: 深灰色 (#1a1a1a) 背景
echo.
echo   如有问题:
echo   - 查看 NEON-DEPLOYMENT-COMPLETE.md 获取排查指南
echo   - 检查浏览器控制台是否有 CSS 加载错误
echo   - 确认所有 Neon CSS 文件都已正确加载
echo.
echo ================================================================================
echo.

pause
