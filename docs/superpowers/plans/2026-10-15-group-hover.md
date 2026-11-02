# 组工具栏与连接点交互

用户已确认：组工具栏随单选保持，点其它对象收起；只有实际悬停节点/组才显示对应端口，组和成员互斥，移到端口保持显示及吸附，不加悬停名称提示、不默认错位端口。

实现文件：`script-before-save-bridge.js`移除全局松手清组选择，组名点击选择；`flora-connection-interaction.js`统一实际悬停所有者及端口过渡，限制磁吸候选；`flora-node-shell.css`统一端口显隐与组磁吸反馈；`neon-canvas-surface.css`恢复组输入左置；`deploy.mjs`缓存版本同步。

- [x] 专项浏览器回归复现松手工具栏消失、外侧靠近误触发及端口重叠。
- [x] 修复选择生命周期与悬停归属，保留可见区域命中、标题编辑和连接语义。
- [x] 四宽、多档缩放、真实鼠标菜单/连线/反向连线/取消及组成员端口互斥验收。
- [x] build、deploy备份部署、部署后专项与完整acceptance，更新文档。

最终：源码44项、部署44项与完整acceptance、图片工具25项、可见命中55项通过；acceptance48图无页面错误或横向溢出。部署备份`.design/deploy-backups/2026-10-15T03-55-14-982Z`，报告`.design/group-hover-20261015/REPORT.md`。

测试独立33199，模拟API；不写真实画布、不终止3199服务40200或桌面39000，不提交推送。源码备份`.design/group-hover-20261015/source-before/`。
