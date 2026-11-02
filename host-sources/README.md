# 当前 Golden 缺失源码来源的提升区（P0）

这些文件来自用户确认的**当前运行时**，逐字节复制，未从旧GitHub发布物恢复，未修改业务逻辑。此前已有匹配design source的文件不重复提升。

- `app/`：270个当前runtime源码、配置和页面来源，含Agent、后端、core、desktop等。
- `golden-generated/`：4个明确标记的当前生成物检查点。不能把此处冻结CSS称为从src重编译成功。
- 唯一owner、权威输入、来源hash和复制/组装配方：`release-tools/ownership.json`；原始来源台账：`.planning/agent-native-p0-20261018/source-provenance.json`。

此目录不作为新增运行入口，当前应用仍运行原目录；没有部署，也不在本轮迁移业务。含历史兼容节点的旧代码只保留当前Golden既有字节，不恢复已删除入口。后续只以经过审核的映射进入deploy，不在这里手工改完后直接复制到用户runtime。
