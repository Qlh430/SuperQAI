# AI OS GitHub Release 发布流程

本文记录 AI OS 正式版本上传到 GitHub 的完整流程。目标仓库固定为公开仓库
`Qlh430/SuperQAI`，应用内更新依赖这个仓库的 Releases。

## 1. 发布前必须确认

1. 工作区只包含本次要发布的改动。
2. `package.json` 和 `package-lock.json` 的版本一致。
3. 版本号必须高于已经安装或发布过的版本。
4. Release 标签必须使用 `v<package.json 版本>` 格式，例如版本 `1.0.6` 对应标签 `v1.0.6`。
5. `Qlh430/SuperQAI` 必须保持公开。私有仓库会导致应用内更新失败。
6. Portable 和 Runtime 包内的 `data` 必须为空，不能包含本机账号、画布、数据库、日志或密钥。
7. 已存在的发布目录不会被构建器覆盖，不能直接复用旧版本的 `dist/release/<版本>`。

建议先检查 Git 状态：

```powershell
git status --short
git branch -vv
```

## 2. 修改版本

在项目根目录执行：

```powershell
npm version --no-git-tag-version patch
```

如果本次是明确的功能版本，也可以手工修改 `package.json` 和 `package-lock.json`，但两处版本必须一致。

检查版本：

```powershell
node -e "console.log(require('./package.json').version)"
```

## 3. 运行发布前检查

至少运行以下检查：

```powershell
npm run check:skills
npm run check:portable-runtime
npm run check:desktop-release
```

出现问题时不要继续发布。修复后重新运行，直到全部通过。

## 4. 提交并推送源码

确认没有把 `data`、`output`、`dist`、模型大文件或令牌提交进 Git：

```powershell
git status --short
git diff --check
git add -A
git commit -m "release: AI OS 1.0.6"
git push origin HEAD:main
```

把示例中的 `1.0.6` 替换为本次版本。

记录源码提交 SHA：

```powershell
git rev-parse HEAD
```

## 5. 构建 Release 资产

执行：

```powershell
npm run desktop:release
```

默认输出目录：

```text
dist\release\<版本>\
```

构建器会生成以下主要资产：

```text
AI-OS-Portable-<版本>-win-x64.zip
AI-OS-Runtime-<版本>-win-x64.zip
ai-os-update.json
ai-os-components.json
AI-OS-Component-<版本>-*.zip
```

组件 ZIP 的数量由 `ai-os-components.json` 决定。当前 `1.0.5` 共有 48 个组件 ZIP，加上两个完整包和两个 JSON，共 52 个需要上传的资产。

如果构建失败：

1. 查看报错，不要继续上传。
2. 检查 `dist\release\<版本>` 和 `dist\AI-OS-Portable-<版本>-win-x64` 是否为失败构建残留。
3. 只清理这一版本对应的生成目录，不要删除其他版本、`data` 或 `output`。
4. 修复后重新执行 `npm run desktop:release`。

## 6. 准备 Release 说明

Release 说明文件不作为下载资产上传，只作为 GitHub Release 正文。

例如创建：

```text
dist\release\<版本>\release-notes.md
```

上传资产时必须排除这个文件。

## 7. GitHub 登录与网络

优先使用 GitHub CLI 登录：

```powershell
gh auth login -h github.com
gh auth status
```

如果 `gh auth status` 显示令牌失效，但 Git Credential Manager 中仍有可用凭据，可以只为当前终端临时读取。不要把输出打印到日志或聊天中：

```powershell
$credential = "protocol=https`nhost=github.com`n`n" | git credential fill
$tokenLine = $credential | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
if (-not $tokenLine) { throw "GitHub credential not found." }
$env:GH_TOKEN = $tokenLine.Substring("password=".Length)
```

如果当前网络必须使用代理，只为当前终端设置：

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
```

验证登录身份，不要输出令牌：

```powershell
gh api user --jq .login
```

## 8. 创建并推送标签

先确认本地和远程没有同名标签：

```powershell
git show-ref --tags v1.0.6
git ls-remote --tags origin refs/tags/v1.0.6
```

确认不存在后创建标签。标签必须指向已经推送到 `main` 的源码提交：

```powershell
$version = "1.0.6"
$tag = "v$version"
$commit = (git rev-parse origin/main).Trim()

git tag $tag $commit
git push origin "refs/tags/$tag"
```

不要强制覆盖已经发布过的标签。如果标签已存在，先确认它是否已经关联旧 Release。

## 9. 创建 GitHub Release

先创建空 Release，再逐个上传资产。不要再使用 `@assets` 一次展开全部文件，PowerShell 下会触发
`no matches found for AI`，而且参数传递不稳定。

先设置版本变量：

```powershell
$repo = "Qlh430/SuperQAI"
$version = "1.0.6"
$tag = "v$version"
$releaseDir = "dist\release\$version"
$notesFile = Join-Path $releaseDir "release-notes.md"
```

创建 Release：

```powershell
gh release create $tag `
  --repo $repo `
  --verify-tag `
  --title "AI OS $version" `
  --latest `
  --notes-file $notesFile
```

如果这里出现 `tag_name is not a valid tag` 或 `Release.target_commitish is invalid`，说明标签没有
正确推送到远程。不要继续上传，先回到第 8 步检查并推送标签，然后重新执行 `--verify-tag` 命令。

## 10. 上传全部资产

逐个上传并在中断后使用 `--clobber` 续传。`release-notes.md` 必须排除：

```powershell
$assets = Get-ChildItem -LiteralPath $releaseDir -File |
  Where-Object Name -ne "release-notes.md" |
  Sort-Object Name

$count = 0
foreach ($asset in $assets) {
  $count++
  Write-Output "[$count/$($assets.Count)] Uploading $($asset.Name)"
  gh release upload $tag `
    --repo $repo `
    --clobber `
    -- $asset.FullName

  if ($LASTEXITCODE -ne 0) {
    throw "Upload failed: $($asset.Name)"
  }
}
```

Portable 和 Runtime 各约 452 MB，上传可能需要几分钟。命令没有输出时不要立即中断。

## 11. 发布后必须校验

检查 Release 状态和资产数量：

```powershell
gh release view $tag `
  --repo $repo `
  --json tagName,targetCommitish,isDraft,isPrerelease,url,assets

gh release list `
  --repo $repo `
  --limit 10 `
  --json tagName,isLatest
```

必须满足：

1. `tagName` 是本次版本标签。
2. `isDraft` 和 `isPrerelease` 都是 `false`。
3. `isLatest` 是 `true`。
4. 远程资产数量与本地资产数量一致。
5. 每个远程资产名称和字节数与本地文件一致。
6. Runtime 和 `ai-os-components.json` 的大小、SHA-256 与 `ai-os-update.json` 一致。

本地校验：

```powershell
$update = Get-Content (Join-Path $releaseDir "ai-os-update.json") -Raw |
  ConvertFrom-Json

$runtimePath = Join-Path $releaseDir $update.fileName
$componentsPath = Join-Path $releaseDir $update.components.fileName

$runtimeHash = (Get-FileHash $runtimePath -Algorithm SHA256).Hash.ToLowerInvariant()
$componentsHash = (Get-FileHash $componentsPath -Algorithm SHA256).Hash.ToLowerInvariant()

[pscustomobject]@{
  RuntimeSizeMatches = (Get-Item $runtimePath).Length -eq $update.size
  RuntimeHashMatches = $runtimeHash -eq $update.sha256.ToLowerInvariant()
  ComponentsSizeMatches = (Get-Item $componentsPath).Length -eq $update.components.size
  ComponentsHashMatches = $componentsHash -eq $update.components.sha256.ToLowerInvariant()
}
```

远程与本地资产比对：

```powershell
$remote = (gh release view $tag `
  --repo $repo `
  --json assets | ConvertFrom-Json).assets

$local = Get-ChildItem -LiteralPath $releaseDir -File |
  Where-Object Name -ne "release-notes.md"

$remoteMap = @{}
foreach ($item in $remote) { $remoteMap[$item.name] = [int64]$item.size }

$localMap = @{}
foreach ($item in $local) { $localMap[$item.Name] = [int64]$item.Length }

$missing = @($localMap.Keys | Where-Object {
  -not $remoteMap.ContainsKey($_)
})

$mismatch = @($localMap.Keys | Where-Object {
  $remoteMap.ContainsKey($_) -and $remoteMap[$_] -ne $localMap[$_]
})

[pscustomobject]@{
  LocalCount = $localMap.Count
  RemoteCount = $remoteMap.Count
  MissingCount = $missing.Count
  SizeMismatchCount = $mismatch.Count
}
```

三项数量必须全部相等，两个错误数量必须都是 `0`。

## 12. 资产清单与用途

| 资产 | 用途 | 是否必须 |
| --- | --- | --- |
| `AI-OS-Portable-<版本>-win-x64.zip` | 新电脑首次安装或手动重装 | 必须 |
| `AI-OS-Runtime-<版本>-win-x64.zip` | 无组件索引或组件更新失败时的完整运行时更新 | 必须 |
| `ai-os-update.json` | 版本、Runtime 文件、大小和 SHA-256 入口 | 必须 |
| `ai-os-components.json` | 组件清单、版本和文件哈希入口 | 必须 |
| `AI-OS-Component-<版本>-*.zip` | 只包含变化组件的增量更新 | 必须全部上传 |
| `release-notes.md` | 仅作为 Release 正文 | 不上传为资产 |

组件 ZIP 很小时不代表上传失败。是否有效以 `ai-os-components.json` 中的组件记录、文件列表和 SHA-256 为准，不能用文件大小单独判断。

## 13. 更新器行为

1. 安装器先读取 GitHub Release 中的 `ai-os-update.json`。
2. 有组件清单时，只下载发生变化的组件包。
3. 没有组件清单或组件更新不可用时，下载完整 Runtime 包。
4. Portable 包面向全新部署，不用于常规在线更新。
5. 更新完成后保留原 `data`，账号、画布、配置和输出数据不应丢失。

## 14. 常见错误

### `no matches found for AI`

原因是使用了 `@assets` 或把 `AI-OS-*` 作为未引用参数交给 PowerShell。不要使用 `@assets`，改为按第 10 节逐个上传。

### `tag_name is not a valid tag`

先创建并推送 `v<版本>` 标签，再使用 `gh release create --verify-tag`。

### `Release.target_commitish is invalid`

标签没有指向远程 `main` 中的有效提交。先推送源码到 `main`，再把标签指向该提交。

### `HTTP 401` 或 GitHub 登录失效

执行 `gh auth login -h github.com`。如果使用 Git Credential Manager，按第 7 节临时填入 `GH_TOKEN`，不要输出或提交令牌。

### `Release output already exists`

构建器不会覆盖 `dist\release\<版本>`。如果是失败产生的同名目录，确认内容后只删除该版本目录再重建。

### 上传中断

不要删除 Release，也不要重新创建同名 Release。重新执行第 10 节即可，`--clobber` 会补齐或覆盖未完成的资产。

### 上传完成但更新器仍看不到

检查：

1. `Qlh430/SuperQAI` 是否为 Public。
2. Release 是否为正式版并设为 Latest。
3. 标签是否为 `v<package.json 版本>`。
4. `ai-os-update.json` 和 `ai-os-components.json` 是否已上传。
5. Runtime 文件名、大小和 SHA-256 是否与 `ai-os-update.json` 一致。

## 15. 本次 1.0.5 发布记录

- GitHub 仓库：`Qlh430/SuperQAI`
- 源码分支：`main`
- 源码提交：`fb394554b724b265274b021c08e5fdcd7542bef6`
- 版本标签：`v1.0.5`
- Release 状态：正式版、Latest、非草稿、非预发布
- 上传资产：52 个
- Portable：`AI-OS-Portable-1.0.5-win-x64.zip`，474,601,403 字节
- Runtime：`AI-OS-Runtime-1.0.5-win-x64.zip`，474,464,610 字节
- Runtime SHA-256：`56818a04a7f3ff59cf891a2b3ad27d64cf4b5e573d658cf1c9553a4dabc0daa2`
- 组件清单 SHA-256：`c9c7a5037721f18a63e8d44d96d8df0e7ad3af19e4f5ec3e4f9f5665b6d60122`
- Release 地址：`https://github.com/Qlh430/SuperQAI/releases/tag/v1.0.5`

本次远程资产与本地资产文件名、大小完全一致，Portable、Runtime、组件清单和更新索引均上传成功。
