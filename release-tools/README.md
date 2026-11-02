# P0 源码归属与隔离候选安全工具

仅供开发核验；**不是安装包、更新器或部署入口**。不接入当前工作台，不修改现有业务逻辑。

- `ownership.json`：1197 个当前生产文件的唯一 owner、权威输入、配方、大小与 SHA-256。`notInstallable:true`。
- `capture-current.cjs`：首次采集当前 Golden；已有归属清单时拒绝覆盖。只提升缺少主线来源的当前 runtime 字节到 `host-sources`；现有 design 源匹配则保留原来源，依赖/资源放内容寻址缓存。不是从旧发布物导入。
- `p0-integrity.cjs`：输入/输出哈希、文件集合、路径/符号链接/重复归属检查；只向工作区 `.planning` 下**不存在**的输出目录组装。恢复仅允许该工具带 ownership marker 的隔离候选，保留失败目录；绝不提供恢复生产 runtime 的命令。
- `.cache/sha256`：831 个已校验依赖/外部资源对象；未纳入源码 Git。删除缓存会使离线复现明确失败，不能静默从在线源补缺。该缓存不是完整供应链认证或签名。

在仓库根执行：

```powershell
node --test --test-isolation=none release-tools/p0-safety.test.cjs
node release-tools/p0-integrity.cjs verify-sources release-tools/ownership.json
node release-tools/p0-integrity.cjs assemble release-tools/ownership.json .planning/p0-new-candidate/resources/app
node release-tools/p0-integrity.cjs verify-tree release-tools/ownership.json .planning/p0-new-candidate/resources/app
```

`restore-candidate` 用法相同，但只能针对由**带 ownership marker 的工具版本**创建的候选。已存在目录不覆盖，不自动删除旧候选。工具本身不安装依赖、不访问网络、不运行应用主入口、不读取用户data/output、不调用模型、不发布、不调用deploy。

## 保证边界

组装复现使用当前内容锁定的生成物：`host-sources/golden-generated` 保存当前正确前端bundle/CSS/reader/worker作为明确的二进制基线。**组装逐字节一致不等于全部源码独立编译可以复现Golden。** 两次独立源码构建的JS和reader与Golden完全相符，CSS虽两轮确定却不同于Golden；见P0报告，禁止据组装通过替换CSS或自动放行发布。

旧 `ai-os-components.json` 已失真，候选不携带它；新ownership是P0审计清单，不冒充带真实ZIP/签名/版本依赖的可发布组件清单。当前生产清单、指针和更新器完全未修改。真实 app/data/output 仅排除出新候选，原位置未动。既有 index 重复脚本及历史兼容模块按Golden原样保留，本轮不顺带清理。

源码提升后的唯一归属以ownership为准：后续修改应改对应source，经审核更新清单，再走现有deploy流程；当前deploy仍未自动消费此新清单。不得直接修改runtime，不能使用旧sync reset/clean覆盖当前Golden。

路径/标记检查是离线单写者开发工具护栏，不是抵抗同机恶意进程竞态的安全沙箱，不承诺任意断电原子性。正式更新签名、兼容、原生运行时升级及事务由P3另行实现。本轮发现中文路径组件回滚与原生异常，发布门禁保持阻塞。
