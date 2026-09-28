# 服务端组件可裁剪设计

## 背景

服务端已经用 `core/server-component-kernel.js` + `server-components/manifest.js` 把
HTTP API 与服务拆成独立组件，具备依赖排序、生命周期和失败回滚能力。但清单里
28 个组件**全部是 `required: true`**：任何一个组件实例缺失或启动失败，整个进程
都会退出。这跟"拆掉某个部分不影响系统使用"的目标还差一层。

## 目标

1. 明确区分"主干组件"和"可裁剪的功能组件"。
2. 裁掉一个可选组件后，服务端仍能正常启动并服务其余功能。
3. 被裁掉的功能即使被客户端调用，也要给出明确原因，而不是伪装成 404 或 500。
4. 裁剪能力本身要有回归测试，防止后续新增组件时把主干依赖悄悄挂到可选组件上。

## 设计

### 主干与可选

`required: true` 的主干只保留"没有它就无法服务"的部分：

- `auth-http-api`：登录与账户
- `static-http-api`：静态资源与输出文件
- `system-http-api`：健康检查与备份
- `preferences-http-api`：账户偏好与设置
- `provider-telemetry-service` / `provider-bootstrap-service` /
  `provider-catalog-service` / `image-model-catalog`：Provider 与模型底座
- `chat-message-service`：聊天消息组装

其余组件（ComfyUI、Skill、抠图、媒体生成、在线状态、资源与分享、媒体上传、
图片本地化、图片任务、素材库、画布项目、画布存储、画布 Agent、聊天 API、
历史记录、缩略图、模型目录 API、Provider API）都是功能面，标记 `required: false`。

### 裁剪入口

`registerServerComponents({ kernel, instances, disabled, sendJson })`

- `disabled` 显式停用组件；命中 `required: true` 的组件会直接抛错，避免误配把系统拆坏。
- 可选组件实例缺失时不再抛错，登记进 `report.pruned`。
- 显式停用的可选组件登记进 `report.disabled`。
- `instances` 的值可以是实例，也可以是同步工厂。显式停用会先判断，再决定是否执行工厂；
  被裁剪组件的工厂不会运行。
- 可选工厂抛错时登记进 `report.failed` 和 `report.pruned`，并注册对应路由的 503
  占位处理器；主干工厂抛错仍会中止启动。

运行期通过环境变量裁剪：

```
AI_OS_DISABLED_SERVER_COMPONENTS=thumbnail-http-api,background-removal-http-api
```

### 路由降级

HTTP API 组件在清单里声明 `routePrefixes`。可选组件被裁剪后，仍然注册一个占位
处理器，只认领自己的路由前缀，返回：

```json
{
  "error": "缩略图 HTTP API 组件未安装，功能暂不可用。",
  "code": "server_component_unavailable",
  "componentId": "thumbnail-http-api",
  "routes": ["/api/image-thumbnails"]
}
```

不匹配任何前缀的请求照旧穿透到后面的组件或最终 404，所以占位不会吞掉别人的路由。

### 可观测性

- 启动时会打印被裁剪/停用的组件清单。
- `GET /api/system/components`（超级管理员）返回组件内核状态，包含 `required`、
  依赖、`status` 和 `error`。

## 回归测试

`tools/check-server-component-pruning.js`（由 `tools/check-server-components.js` 调用）覆盖：

- 清单 id 唯一，且主干/可选都非空。
- **不变量**：任何组件声明的硬依赖都必须是 `required: true`，否则裁剪会拖垮启动。
- 每个 `http-api` 组件都必须声明 `routePrefixes`。
- 全量注册行为与原来一致。
- 只注册主干、裁掉全部可选组件后：内核能启动，全部组件 `running`，
  被裁路由返回 503 `server_component_unavailable`，无关路由穿透。
- 显式停用可选组件同样降级；缺失主干组件、停用主干组件仍然抛错。
- 路由前缀匹配是"按段"匹配：`/api/image-jobs-extra` 不会被 `/api/image-jobs` 吞掉。

## 尚未完成

- 组合根中的可选 HTTP API 已改为工厂注册；图片任务、缩略图派生服务、视频任务链和
  只服务于可选能力的共享服务已改为按需构造，ComfyUI 客户端、工作流任务、
  RunningHub、MiniMax H3 和图片本地化服务也不会在禁用时启动。后续可继续把更多
  媒体上游客户端收敛到各自组件包，减少组合根持有的服务引用。
- `script.js`（约 2.4 万行）与 `canvas-runtime` 组件包还没拆到可独立替换的粒度。
