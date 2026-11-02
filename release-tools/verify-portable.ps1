param([Parameter(Mandatory=$true)][string]$ReleaseRoot)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$ReleaseRoot=(Resolve-Path -LiteralPath $ReleaseRoot).Path
$manifest=Get-Content -Raw -LiteralPath (Join-Path $ReleaseRoot 'portable-files.json') | ConvertFrom-Json
$components=Get-Content -Raw -LiteralPath (Join-Path $ReleaseRoot 'ai-os-components.json') | ConvertFrom-Json
$results=[System.Collections.Generic.List[object]]::new()
function Verify-Zip([string]$File,[object[]]$Expected,[string]$Prefix='') {
  $map=[System.Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
  foreach($f in $Expected){$key=if($Prefix){$Prefix+'/'+$f.path}else{$f.path};$map.Add($key,$f)}
  $seen=[System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $problems=[System.Collections.Generic.List[object]]::new()
  $zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $ReleaseRoot $File))
  $sha=[Security.Cryptography.SHA256]::Create()
  try {
    foreach($entry in $zip.Entries){
      if($entry.FullName.EndsWith('/')){continue}
      if(-not $seen.Add($entry.FullName)){throw 'Duplicate ZIP entry'}
      if(-not $map.ContainsKey($entry.FullName)){$problems.Add(@{path=$entry.FullName;reason='unowned'});continue}
      $f=$map[$entry.FullName]
      $stream=$entry.Open()
      try{$hash=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose()}
      if($hash -ne $f.sha256 -or $entry.Length -ne $f.size){$problems.Add(@{path=$entry.FullName;reason='hash-or-size'})}
    }
    foreach($key in $map.Keys){if(-not $seen.Contains($key)){$problems.Add(@{path=$key;reason='missing'})}}
  } finally {$zip.Dispose();$sha.Dispose()}
  $script:results.Add([ordered]@{file=$File;files=$seen.Count;expected=$map.Count;problems=@($problems);sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $ReleaseRoot $File)).Hash.ToLowerInvariant()})
}
Verify-Zip ('AI-OS-v'+$manifest.version+'-win-x64-Portable.zip') $manifest.files
$runtimePrefix='.ai-runtime/versions/'+$manifest.version+'-win-x64/'
$runtime=@($manifest.files | Where-Object {$_.path.StartsWith($runtimePrefix)} | ForEach-Object { [pscustomobject]@{path=$_.path.Substring($runtimePrefix.Length);size=$_.size;sha256=$_.sha256} })
Verify-Zip ('AI-OS-Runtime-'+$manifest.version+'-win-x64.zip') $runtime ($manifest.version+'-win-x64')
foreach($c in $components.components){
  $asset=Join-Path $ReleaseRoot $c.asset.fileName
  if((Get-Item -LiteralPath $asset).Length -ne $c.asset.size -or (Get-FileHash -Algorithm SHA256 -LiteralPath $asset).Hash.ToLowerInvariant() -ne $c.asset.sha256){throw 'Component outer integrity failure'}
  Verify-Zip $c.asset.fileName $c.files $c.id
}
$failed=@($results | Where-Object {$_.problems.Count -gt 0})
$out=[ordered]@{scope='ZIP exact file sets and decompressed per-file SHA256 using .NET; no signature attestation';ok=($failed.Count -eq 0);archives=@($results)}
$out | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $ReleaseRoot 'zip-verification.json') -Encoding utf8
$out | ConvertTo-Json -Depth 8
if($failed.Count -gt 0){exit 1}
