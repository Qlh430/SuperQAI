# 无限画布项目管理与共享设计

## 目标

将 AI OS 的“无限画布”应用改造成 DX OS 风格的项目管理工作区：一个项目可以包含多个画布；每个画布拥有独立的访问范围；用户可以在“全部画布”“我的项目”和“协同文件”之间切换；已有画布迁移到每个账号自己的“未分类”项目且不丢失内容或共享设置。

## 参考实现

DX OS 的画布应用采用目录元数据、画布文档和访问成员分层：

- 画布目录返回全部可访问画布，并使用 `projectId` 关联项目。
- 项目页单独返回项目树和每个项目的画布数量。
- 画布文档保存节点、连线、素材引用、视口、版本和可见范围。
- `canvas_members` 保存指定账号，邀请口令作为独立能力。
- 画布列表按所有者过滤为“我的画布”，按访问者过滤为“与我共享”。
- 画布内容更新使用版本号和增量同步，权限更新使用画布级 PATCH。

AI OS 将采用同样的目录、归属和筛选语义，但保留当前已经稳定的 `canvas.db` 节点/连线存储与增量操作引擎，并复用现有 `system.sqlite` 账号和资源共享权限。

## 方案与边界

### 采用方案

使用“DX OS 目录模型 + AI OS 现有画布引擎”：

1. 在系统数据库中保存项目目录、项目所有者和更新时间。
2. 在画布数据库的 `boards` 元数据中保存 `project_id`，由应用层校验项目归属。
3. 画布资源继续在系统数据库 `resources` 中注册，使用 `workspace_id` 记录项目 ID，使用 `shares` 和 `share_members` 记录画布级共享。
4. 列表接口在服务端做权限过滤，前端不依赖隐藏字段或本地缓存来实现安全边界。
5. 现有画布节点、媒体引用、操作日志、版本冲突和回收站逻辑保持不变。

### 不在本轮范围内

- 项目级共享；项目树只属于项目所有者。
- 实时多人光标、实时多人编辑和冲突合并 UI。
- 外部访客账号、公开链接口令和跨主机同步。
- 将现有画布内容迁移到新的单一文档数据库。

画布的 `permission` 仍然控制只读、评论、编辑和复制能力；本轮的三个可见范围只决定“谁能看到画布”。

## 数据模型

### 项目目录

新增 `canvas_projects` 表：

```text
id             TEXT PRIMARY KEY
owner_user_id  TEXT NOT NULL REFERENCES users(id)
name           TEXT NOT NULL
created_at     TEXT NOT NULL
updated_at     TEXT NOT NULL
```

项目不设置独立共享状态。项目删除不是本轮操作；项目至少保留一个“未分类”项目，避免画布失去归属。

### 画布元数据

画布数据库 `boards` 增加：

```text
project_id TEXT
```

返回给客户端的画布摘要增加：

```json
{
  "id": "canvas-id",
  "title": "画布名称",
  "projectId": "project-id",
  "ownerUserId": "user-id",
  "mine": true,
  "visibility": "private",
  "access": "owner",
  "permission": "owner",
  "nodeCount": 0,
  "previewImages": []
}
```

`visibility` 的 UI 范围为 `private`、`all`、`users`；服务器继续支持已有 `password` 共享能力，以兼容历史数据和系统通用共享文件功能，但无限画布项目管理界面不主动展示口令选项。

### 资源关联

每个画布仍然对应一个 `resources` 行：

- `type = canvas`
- `ref_type = canvas`
- `ref_id = board.id`
- `owner_user_id = 画布所有者`
- `workspace_id = project.id`

旧画布已有的 `shares` 行保持原样，只在其资源的 `workspace_id` 上补齐项目归属。

## 旧数据迁移

迁移在读取画布列表时幂等执行：

1. 为每个活跃账号确保存在一个名称为“未分类”的项目。
2. 找出属于该账号且 `project_id` 为空的画布，将其绑定到该项目。
3. 将对应资源的 `workspace_id` 更新为该项目 ID。
4. 不改变画布 ID、节点、连线、媒体、版本、更新时间或已有共享行。
5. 已删除画布也补齐项目归属，以便回收站恢复后仍能回到原项目。
6. 如果旧数据没有明确所有者，沿用现有遗留数据规则，将其归属于超级管理员账号。

新建画布若未指定项目，进入当前账号的“未分类”项目；指定项目必须属于当前账号，否则返回 `canvas_project_forbidden`。

## API

### 项目接口

```text
GET   /api/canvas/projects
POST  /api/canvas/projects             { name }
PATCH /api/canvas/projects/:id         { name }
```

响应项目字段：`id`、`name`、`ownerUserId`、`mine`、`canvasCount`、`createdAt`、`updatedAt`。

只有项目所有者可以创建和重命名项目。名称去除首尾空白，连续空白折叠，长度限制为 80 个字符。

### 画布目录接口

保留原路径并增加查询参数，保持旧客户端兼容：

```text
GET  /api/canvas/boards?scope=all
GET  /api/canvas/boards?scope=mine
GET  /api/canvas/boards?scope=shared
GET  /api/canvas/boards?projectId=:id
POST /api/canvas/boards            { title, projectId?, viewport? }
```

默认 `scope=all`。响应继续返回 `boards` 和 `trash`，同时增加 `projects`，每个画布摘要包含项目与访问字段。

筛选语义：

- `all`：当前账号拥有的画布 + 当前账号可读的共享画布。
- `mine`：当前账号拥有的画布。
- `shared`：所有者不是当前账号、且当前账号可读的画布。
- `projectId`：仅当前账号拥有的项目下的画布；不能借此枚举他人项目。

### 画布归属接口

```text
PATCH /api/canvas/boards/:id/project  { projectId }
```

只能由画布所有者调用。`projectId` 必须属于该所有者；移动操作不修改画布内容版本，但会更新目录和资源的更新时间。

### 画布内容接口

现有以下接口不改变：

```text
GET  /api/canvas/boards/:id/meta
GET  /api/canvas/boards/:id/viewport
POST /api/canvas/boards/:id/operations
POST /api/canvas/boards/:id/trash
POST /api/canvas/boards/:id/restore
DELETE /api/canvas/boards/:id/permanent
```

它们继续先通过资源访问层执行 `read`/`write`/`delete` 权限检查。

### 共享接口

复用现有资源接口：

```text
POST  /api/resources/:resourceId/shares
PATCH /api/shares/:shareId
DELETE /api/shares/:shareId
```

无限画布共享弹窗只提供：

- 仅自己：`private`
- 所有人：`all`
- 指定账号：`users` + `userIds`

保存共享后，画布目录重新拉取，确保“协同文件”立即反映权限变化。

## 前端交互

### 画布应用入口

无限画布的“历史”入口升级为 DX OS 风格的工作区画廊，不破坏现有编辑器：

- 画廊负责浏览、筛选、项目树和共享操作。
- 点击画布卡片进入现有无限画布编辑器。
- 当前正在编辑的画布保留在桌面窗口中，返回画廊不会清除编辑状态。

### 左侧导航

```text
画布
  全部画布
  最近使用
  我的项目
    未分类
    项目 A
    项目 B
协作
  协同文件
管理
  回收站
```

“全部画布”显示 `scope=all`；“协同文件”显示 `scope=shared`；项目树只显示当前账号自己的项目。

### 画布卡片

卡片显示：

- 画布缩略图或空画布占位。
- 标题、节点数量、更新时间。
- 所属项目。
- 可见范围徽标。
- 共享画布的所有者/访问权限。

所有者可以从卡片菜单执行打开、重命名、移动项目、共享和移入回收站；共享者根据 `permission` 只看到被授权的操作。

### 项目操作

- “我的项目”旁的加号打开新建项目对话框。
- 项目节点点击后只筛选该项目中的自有画布。
- 项目名称支持重命名。
- 新建画布对话框允许选择当前账号的项目，默认“未分类”。

### 共享操作

共享对话框显示当前范围、指定账号多选和现有权限选择。选择“指定账号”时必须至少选择一个有效账号；取消或保存失败不改变当前画布状态。

## 服务端数据流

```text
登录账号
  -> GET /api/canvas/boards
  -> 项目目录 + 画布摘要
  -> resource-access.assertRead()
  -> all / mine / shared / project 过滤
  -> 画廊
  -> 打开画布
  -> 现有 canvas.db 增量读取与保存
```

共享画布的打开流程仍由资源访问层判定；项目 ID 只用于归类和过滤，不能代替权限校验。

## 错误处理

- 不存在的项目：`canvas_project_not_found`，HTTP 404。
- 非项目所有者写入或移动：`canvas_project_forbidden`，HTTP 403。
- 空项目名称或超过长度：`invalid_canvas_project`，HTTP 400。
- 画布属于其他账号项目：`canvas_project_forbidden`，HTTP 403。
- 共享指定账号不存在：沿用 `invalid_share_member`，HTTP 400。
- 画布版本冲突继续返回现有 409，不因目录操作改变。
- 迁移失败不能阻止已可读画布打开；服务端记录审计事件并在下一次列表请求重试。

## 测试与验收

### 单元与服务端测试

- 项目名称标准化和所有权校验。
- 旧画布幂等迁移到每个账号的“未分类”。
- 新建画布默认归属“未分类”，指定项目只能是自己的项目。
- 项目重命名和画布移动。
- `all`、`mine`、`shared`、`projectId` 四种目录筛选。
- 所有人共享、指定账号共享和私有画布的账号隔离。
- 共享设置更新后资源与画布目录一致。
- 现有画布增量保存、版本冲突、回收站和永久删除回归测试。

### 浏览器测试

- DX OS 风格项目树、画廊、画布卡片和空状态。
- 创建项目、重命名项目、新建画布并选择项目。
- 在项目之间移动画布，重新加载后归属不丢失。
- 在三个可见范围间切换，协同文件实时刷新。
- 账号 A 看不到账号 B 的私有画布，能看到授权的共享画布。
- 共享画布只显示被授予的编辑/复制操作。
- 在浅色、深色和五档系统缩放下，项目侧栏、卡片和共享弹窗均可操作。

## 兼容性与回滚

- 数据库迁移使用 `CREATE TABLE IF NOT EXISTS` 和可重复执行的列补齐，不删除旧列。
- 未识别 `project_id` 的旧客户端仍可通过默认画布列表打开画布。
- 目录层出现异常时，现有画布编辑器和内容接口继续可用。
- 回滚代码不会删除项目表或归属字段，旧画布内容和资源仍可恢复。
