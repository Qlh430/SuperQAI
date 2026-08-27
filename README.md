# AI API 控制台

这是一个 AI 接口使用网站。默认采用后端代理模式：你的平台 API Key 放在服务器环境变量中，用户只在网页里输入问题，不会看到真实 Key。

## 使用方式

### 推荐：后端代理模式

复制 `.env.example` 为 `.env`，然后在 `.env` 里填写你的 API 地址和 Key：

```text
PORT=3099
MAX_REQUEST_MB=30
AI_API_URL=https://ai.t8star.cn/v1/chat/completions
AI_API_KEY=你的真实APIKey
AI_MODEL=gpt-4o-mini
AI_MODELS=gpt-4o-mini,gpt-4o,gpt-3.5-turbo
AI_IMAGE_API_URL=https://ai.t8star.cn/v1/images/generations
AI_IMAGE_EDIT_API_URL=https://ai.t8star.cn/v1/images/edits
AI_IMAGE_MODEL=gpt-image-1
AI_IMAGE_MODELS=gpt-image-1
```

`AI_MODEL` 是默认选中的模型，`AI_MODELS` 是页面下拉框里允许用户选择的模型列表，用英文逗号分隔。
`AI_IMAGE_API_URL` 用于纯文本生图，`AI_IMAGE_EDIT_API_URL` 用于上传参考图后的图生图。
`AI_IMAGE_MODEL` 是默认选中的图片模型，`AI_IMAGE_MODELS` 是图片生成页面允许用户选择的模型列表。
`MAX_REQUEST_MB` 控制上传参考图时允许的请求大小。

图片生成成功后，后端会自动把图片保存到项目的 `output` 文件夹，并在页面结果卡片里提供本地图片入口。

然后启动服务：

```powershell
node server.js
```

打开浏览器访问：

```text
http://localhost:3099
```

也可以直接双击 `启动网站.bat`，它会自动启动后端并打开网站。

### 直连测试模式

也可以直接用浏览器打开 `index.html`，在页面里填写完整 API 地址和 API Key。这适合用户使用自己的 Key 做测试。

## 安全说明

- 不要把平台主 Key 写进前端代码。前端代码会被任何访问者看到。
- 正式上线建议加入登录、额度、限流、日志和风控。

## 常见问题

有些 API 服务不允许浏览器直接跨域请求，可能会出现 CORS 报错。遇到这种情况需要改成后端代理模式。

## 部署到另一台 Windows 电脑

在项目目录运行：

```powershell
.\build-portable.bat --no-pause
```

构建完成后，将 `dist\AI-Studio-Portable.zip` 复制到目标电脑并解压。目标电脑需要安装 Node.js 24.13 或更高的 Node 24 版本，然后：

1. 将 `.env.example` 复制为 `.env`。
2. 在 `.env` 中填写目标电脑使用的 API 地址、Key 和 ComfyUI 地址。
3. 双击 `start.bat`，浏览器访问 `http://localhost:3099`。

默认便携包不会包含 `.env`、历史画布、聊天记录、生成图片和其他本机数据，适合干净部署，也不会泄露 API Key。

如果目标电脑需要保留当前电脑的历史画布和图片，可在可信环境中运行：

```powershell
.\build-portable.bat --with-data --no-pause
```

带数据包可能很大，并包含私人内容，只应在自己的电脑之间传输，不要公开发布。迁移完成后仍需在目标电脑单独创建 `.env`。
