param([Parameter(Mandatory=$true)][string]$Archive, [Parameter(Mandatory=$true)][string]$Destination, [Parameter(Mandatory=$true)][string]$Runtime)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = [IO.Path]::GetFullPath($Destination).TrimEnd('\') + '\'
if ((Test-Path -LiteralPath $Destination) -and @(Get-ChildItem -LiteralPath $Destination -Force).Count -ne 0) { throw 'Extraction destination must be empty' }
$zip = [IO.Compression.ZipFile]::OpenRead($Archive)
try {
  $names = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  [long]$total = 0
  if ($zip.Entries.Count -eq 0 -or $zip.Entries.Count -gt 50000) { throw 'Invalid archive entry count' }
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName.Replace('\','/').TrimEnd('/')
    $parts = $name.Split('/')
    if ($parts[0] -cne $Runtime) { throw 'Archive runtime directory mismatch' }
    foreach ($part in $parts) {
      if (!$part -or $part -eq '.' -or $part -eq '..' -or $part -match '[<>:"|?*\x00-\x1f]' -or $part -match '[. ]$' -or $part -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') { throw 'Unsafe archive path' }
    }
    if (!$names.Add($name)) { throw 'Duplicate archive path' }
    if (($entry.ExternalAttributes -band 1024) -ne 0 -or (($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'Archive links are forbidden' }
    $target = [IO.Path]::GetFullPath([IO.Path]::Combine($root, $name.Replace('/','\')))
    if (!$target.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escapes destination' }
    $total += $entry.Length
    if ($entry.Length -lt 0 -or $entry.Length -gt 2000000000 -or $total -gt 4000000000) { throw 'Archive size limit exceeded' }
  }
  [IO.Directory]::CreateDirectory($root) | Out-Null
  foreach ($entry in $zip.Entries) {
    $target = [IO.Path]::Combine($root, $entry.FullName.Replace('/','\'))
    if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) { [IO.Directory]::CreateDirectory($target) | Out-Null; continue }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $false)
  }
} finally { $zip.Dispose() }
