# 空视频生成节点验收

## 修复

空历史恢复或清空结果时，宿主会保留无 src 的 video 元素及隐藏的媒体壳体。Flora 原先仅按元素存在就创建播放控件，结果区的强制 display 又覆盖了 hidden，导致默认占位与黑色空播放器同时显示。

播放器增强改为检查实际 src/source，空壳体保持 hidden 且不创建播放器控件；媒体结果区明确尊重 hidden。有视频源后沿用现有播放、进度及全屏逻辑。节点选中描边保留，无新视觉组件或业务数据结构。

## 验证

- empty-video-regression.cjs 在部署前复现并断言失败；源码修复后及部署后均通过。真实宿主 API 视频、MiniMax H3 创建、空回调、结果写入、清空、刷新、保存恢复；390/768/1440/1728，默认/选中/悬停及放大操作区，无 pageerror 或页面横向溢出。此测试播放方法模拟，未请求真实视频生成。
- video-node-regression.cjs 通过：已有视频播放、暂停、进度、拖动、选中和全屏交互。测试夹具补充视频 src，明确表达已有结果。
- 部署后 video-seek-host-regression.cjs 37 项通过：实际 MP4 解码、进度、播放/暂停、画面拖动和全屏。业务 API 模拟、媒体测试服务隔离，未修改真实画布。
- npm run build 成功后通过 deploy.mjs 备份部署；缓存 flora-node-shell.js/css 为 20261008-empty-video。备份 .design/deploy-backups/2026-10-08T09-57-39-077Z。
- 部署后 node acceptance.cjs 通过，48 图，errors=[]、overflow=[]；包含四宽度、项目创建/回收站/素材/模拟生图/模拟对话/返回及移动导航。

本次未停止或重启 3199，诊断 serverPid=19976。真实登录下模型生成、权限和持久化仍需用户会话验收；Better Design MCP 未连接，未声称动态审查结果。
