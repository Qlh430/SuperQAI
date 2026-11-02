param(
  [string]$PortableRoot = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$PortableRoot = (Resolve-Path $PortableRoot).Path
$pointer = Join-Path $PortableRoot '.ai-runtime\.active-runtime'
if (-not (Test-Path $pointer)) { throw "找不到便携版运行时指针：$pointer" }
$active = (Get-Content -Raw $pointer).Trim()
$runtime = Join-Path $PortableRoot ".ai-runtime\versions\$active"
$node = Join-Path $runtime 'resources\runtime\node.exe'
$electron = Join-Path $runtime 'AI OS Runtime.exe'
if (-not (Test-Path $node)) { throw "找不到内置 Node：$node" }
if (-not (Test-Path $electron)) { throw "找不到 Electron 运行时：$electron" }

$temp = Join-Path ([IO.Path]::GetTempPath()) ("ai-os-update-network-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $nodeProbe = Join-Path $temp 'node-probe.cjs'
  $electronProbe = Join-Path $temp 'electron-probe.cjs'
  @'
const fs=require('node:fs');
const crypto=require('node:crypto');
const out=process.argv[2];
const host=u=>{try{return new URL(u).hostname}catch{return ''}};
async function sample(label,url,headers={}){
  const started=performance.now();let response,bytes=0,ttfb=null,error='';
  try{
    response=await fetch(url,{redirect:'follow',cache:'no-store',headers:{'User-Agent':'AI-OS-Updater-Network-Probe/1',...headers},signal:AbortSignal.timeout(30000)});
    ttfb=performance.now()-started;
    const reader=response.body?.getReader();
    while(reader){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>=1048576){await reader.cancel();break;}}
  }catch(e){error=e.cause?.code||e.code||e.message||String(e)}
  const ms=performance.now()-started;
  return {label,status:response?.status||0,bytes,ttfbMs:ttfb==null?null:Math.round(ttfb),totalMs:Math.round(ms),kibPerSec:Math.round(bytes/1024/(ms/1000)),responseUrl:response?.url||'',responseHost:host(response?.url||''),error};
}
(async()=>{
  const started=performance.now();
  const release=await (await fetch('https://api.github.com/repos/Qlh430/SuperQAI/releases/latest',{headers:{'User-Agent':'AI-OS-Updater-Network-Probe/1'},signal:AbortSignal.timeout(30000)})).json();
  const checkMs=Math.round(performance.now()-started);
  const asset=release.assets.find(x=>x.name==='AI-OS-Runtime-3.0.3-win-x64.zip')||release.assets.find(x=>/AI-OS-Runtime-.*-win-x64\.zip$/i.test(x.name));
  if(!asset)throw Error('找不到 AI OS Runtime Release 资源');
  const results=[await sample('node-default-asset',{toString(){return asset.browser_download_url}}.toString(),{Range:'bytes=0-1048575'})];
  const result={mode:'node-default-same-as-current-updater',runtime:process.version,releaseTag:release.tag_name,checkMs,asset:{name:asset.name,size:asset.size,url:asset.browser_download_url},samples:results};
  fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
'@ | Set-Content -Encoding UTF8 $nodeProbe
  @'
const fs=require('node:fs');
const {app,session}=require('electron');
const out=process.argv[2];
const host=u=>{try{return new URL(u).hostname}catch{return ''}};
async function sample(label,url,headers={}){
  const started=performance.now();let response,bytes=0,ttfb=null,error='';
  try{
    response=await session.defaultSession.fetch(url,{redirect:'follow',cache:'no-store',headers:{'User-Agent':'AI-OS-Updater-Network-Probe/1',...headers},signal:AbortSignal.timeout(30000)});
    ttfb=performance.now()-started;
    const reader=response.body?.getReader();
    while(reader){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>=1048576){await reader.cancel();break;}}
  }catch(e){error=e.cause?.code||e.code||e.message||String(e)}
  const ms=performance.now()-started;
  return {label,status:response?.status||0,bytes,ttfbMs:ttfb==null?null:Math.round(ttfb),totalMs:Math.round(ms),kibPerSec:Math.round(bytes/1024/(ms/1000)),responseUrl:response?.url||'',responseHost:host(response?.url||''),error};
}
app.whenReady().then(async()=>{
  const api='https://api.github.com/repos/Qlh430/SuperQAI/releases/latest';
  const routing=await session.defaultSession.resolveProxy(api);
  const started=performance.now();
  const release=await (await session.defaultSession.fetch(api,{headers:{'User-Agent':'AI-OS-Updater-Network-Probe/1'},signal:AbortSignal.timeout(30000)})).json();
  const checkMs=Math.round(performance.now()-started);
  const asset=release.assets.find(x=>x.name==='AI-OS-Runtime-3.0.3-win-x64.zip')||release.assets.find(x=>/AI-OS-Runtime-.*-win-x64\.zip$/i.test(x.name));
  if(!asset)throw Error('找不到 AI OS Runtime Release 资源');
  const result={mode:'electron-net-system-proxy',routing,releaseTag:release.tag_name,checkMs,asset:{name:asset.name,size:asset.size,url:asset.browser_download_url},samples:[await sample('electron-system-asset',asset.browser_download_url,{Range:'bytes=0-1048575'})]};
  fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.quit();
}).catch(e=>{console.error(e.stack||e);app.exit(1)});
'@ | Set-Content -Encoding UTF8 $electronProbe

  $nodeJson = & $node $nodeProbe (Join-Path $temp 'node.json') 2>&1
  $nodeExit = $LASTEXITCODE
  $electronJson = & $electron '--no-sandbox' $electronProbe (Join-Path $temp 'electron.json') 2>&1
  $electronExit = $LASTEXITCODE

  $wininet = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
  $winhttp = (netsh winhttp show proxy | Out-String).Trim()
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  $curlResult = $null
  if ($curl -and (Test-Path (Join-Path $temp 'node.json'))) {
    $assetUrl = ((Get-Content -Raw (Join-Path $temp 'node.json')) | ConvertFrom-Json).asset.url
    $curlResult = & curl.exe --location --noproxy '*' --range 0-1048575 --max-filesize 2097152 --max-time 30 --silent --show-error --output NUL --write-out 'status=%{http_code} final=%{url_effective} bytes=%{size_download} seconds=%{time_total} speed_bytes=%{speed_download}' $assetUrl 2>&1
  }
  [pscustomobject]@{
    portableRoot=$PortableRoot
    activeRuntime=$active
    nodeExit=$nodeExit
    electronExit=$electronExit
    wininetProxyEnabled=[int]$wininet.ProxyEnable
    wininetProxyServer=[string]$wininet.ProxyServer
    winhttpProxy=$winhttp
    nodeProbe=($nodeJson -join "`n")
    electronProbe=($electronJson -join "`n")
    curlDirectSample=($curlResult -join "`n")
    note='node-default 是当前更新器路径；electron-system 使用 Chromium 系统代理；curlDirectSample 仅作直连小样本，TUN 模式仍可能接管。'
  } | ConvertTo-Json -Depth 8
} finally {
  Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}
