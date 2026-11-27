param([Parameter(Mandatory = $true)][string]$Root)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$portable = (Resolve-Path -LiteralPath $Root).ProviderPath
if ((Get-Item -LiteralPath $portable -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked root is not supported' }
function Assert-NoLink([string]$Target) {
    $cursor = $Target
    while ($cursor -and $cursor.Length -ge $portable.Length) {
        if ((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Linked path is not supported: $cursor" }
        if ($cursor -eq $portable) { break }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
}
function Read-Optional([string]$Relative) {
    $target = Join-Path $portable $Relative
    Assert-NoLink $target
    if (Test-Path -LiteralPath $target -PathType Leaf) { return (Get-Content -LiteralPath $target -Raw).Trim() }
    return $null
}
function Measure-Tree([string]$Directory) {
    $bytes = [long]0
    $files = 0
    $links = 0
    $queue = [Collections.Generic.Stack[string]]::new()
    $queue.Push($Directory)
    while ($queue.Count) {
        foreach ($entry in Get-ChildItem -LiteralPath $queue.Pop() -Force) {
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { $links++; continue }
            if ($entry.PSIsContainer) { $queue.Push($entry.FullName) }
            else { $bytes += $entry.Length; $files++ }
        }
    }
    return @{ bytes = $bytes; files = $files; linksSkipped = $links }
}
$active = Read-Optional '.ai-runtime/.active-runtime'
$previous = Read-Optional '.ai-runtime/.previous-runtime'
$journals = @{}
foreach ($name in @('ready', 'install', 'helper', 'result')) {
    $text = Read-Optional ".ai-runtime/updates/$name.json"
    if ($text) { $journals[$name] = $text | ConvertFrom-Json }
}
$items = @()
foreach ($kind in @('versions', 'rollback', 'updates')) {
    $directory = Join-Path $portable ".ai-runtime/$kind"
    Assert-NoLink $directory
    if (!(Test-Path -LiteralPath $directory -PathType Container)) { continue }
    if ((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked $kind is not supported" }
    foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            $items += @{ kind = $kind; name = $entry.Name; state = 'link-skipped' }; continue
        }
        $size = if ($entry.PSIsContainer) { Measure-Tree $entry.FullName } else { @{ bytes = $entry.Length; files = 1; linksSkipped = 0 } }
        $state = 'review-required'
        if ($kind -eq 'versions' -and $entry.Name -eq $active) { $state = 'current' }
        elseif ($kind -eq 'versions' -and $entry.Name -eq $previous) { $state = 'previous' }
        $items += @{ kind = $kind; name = $entry.Name; state = $state; bytes = $size.bytes; files = $size.files; linksSkipped = $size.linksSkipped }
    }
}
$drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($portable).TrimEnd('\').TrimEnd(':')) -ErrorAction SilentlyContinue
@{ root = $portable; mode = 'read-only-no-cleanup'; active = $active; previous = $previous; journals = $journals; items = $items; freeBytes = $drive.Free; userData = 'preserved-not-scanned' } | ConvertTo-Json -Depth 8
