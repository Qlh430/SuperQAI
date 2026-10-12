# ComfyUI H3 视频结果回写

## 真实结果定位

只读检查用户指定任务相关数据：ComfyUI 946da3d3-2a6f-4d76-a906-17cb274d9a05 历史为 success，SaveVideo 节点 375 返回 MP4，提示词“香蕉被人拿起剥开”。工作台已保存 data/output/minimax_h3_1791456128166_2ef47959.mp4，3310187 字节，2026-10-08T10:42:08.455Z。相关 H3 节点持久化历史为空，未把此结果写回节点。

未读取登录凭据、未改用户数据库、未重新提交真实 ComfyUI 生成。已有桌面会话不在当前可用浏览器控制表面，不能声称已在真实登录 UI 修复既有节点；提供已找到的原始视频文件给用户查看或导入。

## 原因与修复

复现：真实 runCanvasMinimaxH3Node 调用期间，通过 replaceCanvasVirtualNode 重建节点。原调用持有被移除的 DOM，applyCanvasGenerationHistoryItem 对 disconnected 节点直接返回，后续历史只写在旧实例。结果未进入当前节点和虚拟模型。

完成时按捕获的节点 ID 找当前挂载实例；脱离视口时由现有虚拟器重新挂载；验证画布与节点类型，再提交视频与历史并同步虚拟模型。禁止结果写到切换后的其它画布或已删除/改类型节点；错误及按钮状态定位当前实例。没有改变空视频占位规则和播放器外观。

## 验证与部署

- h3-result-delivery-regression.cjs：部署前红灯复现；源码修复后及部署后通过。两次独立模拟任务，各提交一次，节点替换/卸载后正确回写并再次恢复。
- 使用上述真实用户 MP4 替代模拟媒体返回，实际解码及播放通过；生成任务响应模拟，没有付费或重复真实生成。
- empty-video-regression.cjs 四宽度默认/清空/恢复回归通过；h3-output-regression.cjs 与 h3-deployed-check.cjs 各 10 项通过。
- npm run build 成功后通过 deploy.mjs 备份部署。宿主 script.js 缓存版本 20261008-h3-result-delivery，备份 .design/deploy-backups/2026-10-08T10-55-30-317Z。
- 部署后 acceptance.cjs：四宽度及项目/回收站/素材/模拟生图/模拟对话/返回/移动导航流程通过，48 图，errors=[]、overflow=[]。

本次未停止或重启 3199，诊断 serverPid=31312。真实登录下任务回写和保存仍需已有会话验收；Better Design MCP 未连接。
