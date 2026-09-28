# 服务端组合根与惰性组件容器

## 背景

上一轮把服务端组件做成"主干 + 可裁剪"，但装配代码仍然全部长在 `server.js`
里：2200 多行的入口文件同时负责环境变量、路径常量、宿主服务、60 多个组件实例
的连接，以及 HTTP 入口和进程生命周期。任何一处组件改动都要动这个文件，
正是"牵一发动全身"的来源。

## 目标

1. `server.js` 只保留：环境与配置、宿主服务、HTTP 入口、进程生命周期。
2. 组件之间的连接放进独立模块，可以单独替换、单独测试。
3. 组件依赖通过容器惰性解析：被裁剪的组件连工厂都不执行。
4. 忘记注入宿主依赖时要立刻报错，而不是在生产里变成 `undefined`。

## 设计

### `core/component-container.js`

惰性、可隔离失败的依赖容器：

- `define(id, { component, required, requires, factory })`
- `get(id)`：已禁用 / 失败 / 未定义时抛出，带 `code`
- `tryGet(id)`：同样情况返回 `null`
- `boot()`：按定义顺序构造所有未禁用节点；`required` 节点失败直接抛出，
  可选节点失败只记录状态
- `report()`：每个节点的 `component / required / requires / status / error`

关键语义：

- 节点归属某个组件（`component`）。组件被 `disable` 后，它的节点状态是
  `disabled`，工厂**永远不会被调用**。
- 依赖失败的节点不会被静默构建；错误信息会指出是哪个依赖挂了。
- 循环依赖、重复定义、boot 之后再定义都会抛错。

### `server-components/composition.js`

承载全部组件连接，签名是 `createServerComposition({ host })`。

- 需要的一切都从 `host` 传入，模块本身不 require 宿主文件。
- 入口用 `Proxy` 包住 `host`：读取不存在的键会抛出
  `Server composition host is missing "<name>"`，把"漏注入"变成启动期错误。
- 只对外返回入口真正需要的对象（数据库、鉴权、静态资源、画布协作、组件内核等）。

### 画布协作中心的晚绑定

`canvasCollabHub` 依赖惰性的画布存储，只能在组件装配之后创建。它通过
`setCanvasCollabHub()` 回填，组件侧只持有 `() => canvasCollabHub` 的读取闭包，
不会读到装配期的 `null`。

### 源码级检查

不少回归检查断言"某段连接存在"。这些检查改为读取入口全貌
（`tools/server-source.js` → `server.js` + 配置、图片规则、设置服务 +
`server-components/composition.js`），这样入口怎么拆分都不会让检查失效。

### 可选组件工厂注册

`registerServerComponents()` 的 `instances` 同时接受实例和同步工厂：

- 主干组件仍可直接传实例，缺失或构造失败立即中止启动。
- 可选组件传工厂时，显式禁用会先于工厂执行，组件被裁剪后连构造函数都不会运行。
- 可选工厂自身抛错只降级当前组件，其路由返回明确的 503，不影响其他组件。
- 工厂必须同步返回带生命周期钩子的实例；返回 Promise 会作为配置错误直接报出。

组合根中的可选 HTTP API、图片任务管理器、缩略图派生服务和视频任务链都改为工厂或
惰性单例。共享能力（例如模型设置、Skill 注册表、Provider 执行器和图片生成服务）
在第一次真正需要时创建，并保持全进程单实例。ComfyUI 客户端、工作流任务、
RunningHub、MiniMax H3 和图片本地化服务也进入同一套惰性链路。

## 结果

- `server.js`：2415 行 → 1427 行，且不再包含任何组件实例连接。
- 移动的装配代码 692 行，注入宿主依赖 188 项。
- 配置解析移入 `server-config.js`；图片上游请求规则移入
  `image-provider-request-rules.js`；旧设置文件兼容层移入
  `server-settings-service.js`。
- 图片模型目录版本通过 `buildSettingsResponse` 显式注入，设置服务不再隐式
  引用装配模块局部变量。
- `npm run precheck`、`check:auth`、`check:provider-api`、`check:resources`、
  `check:canvas-storage`、`check:image-jobs`、`check:skills`、`check:cutout`、
  `check:canvas-projects`、`check:providers` 全部通过。
- 可选组件支持实例或同步工厂；禁用组件的工厂不会执行，可选工厂失败会按组件隔离。
- 图片任务、缩略图派生服务、视频任务服务、Agent 模型设置、Skill 注册表、
  Provider 执行器、图片生成服务、ComfyUI 媒体链和图片本地化服务均已改为按需构造。

## 验证过的真实行为

- 默认启动：`/api/system/ready`、`/api/models`、`/api/providers`、`/api/skills`、
  `/api/background-removal/models`、`/api/canvas/boards`、`/api/assets`、
  `/api/resources`、`/api/history/images`、`/api/comfyui/status`、
  `/api/settings`、`/api/auth/session` 均返回 200。
- 裁剪 `skill-http-api,comfyui-http-api` 后：这两条路由返回 503
  `server_component_unavailable`，其余路由照常 200。
- 装配期删掉一个可选组件的 require 路径，只会让该组件降级为"未安装"并打印原因，
  进程继续启动。

## 尚未完成

- 可选组件之间仍有共享服务（如 `skillRegistry` 同时被 Skill API 与画布 Agent
  使用），因此"裁剪某个组件"目前省掉的是它自己的装配与路由，共享依赖按需保留。
- 旧设置文件与 Provider Store 之间仍有迁移兼容代码，后续可以继续收敛到
  Provider 子系统。
- `script.js`（约 2.4 万行）与 `canvas-runtime` 组件包仍未拆分。
