param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$projectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path.TrimEnd("\\")
$electronPath = Join-Path $projectRoot "node_modules\electron\dist\electron.exe"
$mainScript = Join-Path $projectRoot "desktop\main.js"
$iconPath = Join-Path $projectRoot "desktop\icon.ico"

if (-not (Test-Path -LiteralPath $electronPath)) {
  throw "Electron is not installed. Run npm install in the AI OS project directory first."
}

$shell = New-Object -ComObject WScript.Shell
$desktopDirectory = [Environment]::GetFolderPath("Desktop")
$startMenuDirectory = Join-Path ([Environment]::GetFolderPath("Programs")) "AI OS"
New-Item -ItemType Directory -Path $startMenuDirectory -Force | Out-Null

foreach ($shortcutPath in @(
  (Join-Path $desktopDirectory "AI OS Host.lnk"),
  (Join-Path $startMenuDirectory "AI OS Host.lnk")
)) {
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $electronPath
  $shortcut.Arguments = '"' + $mainScript + '"'
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.IconLocation = $iconPath + ",0"
  $shortcut.Description = "启动 AI OS 局域网主机服务"
  $shortcut.Save()
}

Write-Host "AI OS Host shortcuts were created on the desktop and Start menu."
