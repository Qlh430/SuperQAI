---
name: natural-aesthetic-product-photography
description: Plan product-faithful commercial photography from original images, including photography intended for later layout.
license: Proprietary
metadata:
  version: "1.2.10"
  creative_planning: art-direction
canvas:
  label: 自然美学产品摄影
  category: image
  icon: aperture
  required_selection: image
  approval: before-paid-generation
  triggers:
    - 自然美学产品摄影
    - 产品摄影策划
    - 为产品设计自然场景主视觉
  tools:
    - read_skill_reference
    - request_design_brief
    - create_image_node
    - activate_canvas_skill
---

# 自然美学产品摄影

## 看图并确认商品

核对当前产品原图及顺序。无产品原图时请用户选择或上传。区分商品、部件、随售配件与独立场景道具。跨视角重复出现同一件商品时沿用对象 ID，记录各图补充的可见细节。不同商品用不同 ID。对身份、数量、归属或物理连接有疑问时等待确认。记录可见的颜色和材质观感，实际成分、暗部与未见面保持未知。

提取 3–5 项直接可见的产品特征。每项指向原图及清单里的对象，说明该特征的拍摄价值。用户指出观察错误时，对照当前原图修正，再更新受影响的拍法。风格图与场景图仅提供布光、构图、色彩或空间参考。

## 交付纯摄影底图

海报、推广位和商品页面可作为投放语境。摄影底图只呈现产品、实际布景、光线和构图。保留实物上原有标识的位置与状态。标题、宣传语、独立品牌字样、功能图标、参数及其他排版内容交给后期或独立文字节点。用户明确委托制作海报版面时，使用海报设计流程。

## 根据信息作摄影决策

每次策划读取 `references/photography-methods.md` 和 `references/visual-method-catalog.md`。从画面的艺术意图出发，用 A–G 七种预设、辅助技法和优秀作品的视觉观察解决具体拍摄问题。商品原图直接用于视觉策划和图像编辑。

1. **先定用途和约束。** 用户指定的画幅、版位、风格、色彩和摆放优先。简单需求按可见依据直接策划，只有影响方案的关键信息缺失时才提问。
2. **先写视觉概念。** 结合形状、透明度、反射、原色、关键结构及投放对象，写清最值得表现的特征、希望观者感受到什么、什么空间或光影关系会被记住。每次为当前产品设计 3–5 个可执行方向。有自定义方向时在其约束内给出不同拍法。逐案说明采用哪些特征、各自取舍与首推理由。
3. **建立可拍摄的画面。** 确定主体占比与留白，明确承托面、前景遮挡边界、背景距离、主光来自哪里及光照落点。用产品表面和环境材质的关系决定高光、反射及阴影。环境色以商品原色为准，通过明度、冷暖或质感分离轮廓。只有用户明确要求科技风时才采用发光框、科技光廊或数字展陈。
4. **安排商品在整张照片里的角色。** 由构图决定平放、斜置、侧视、仰拍或偏心等拍法，按需要改变整体朝向、位置和占比。用可见面与真实接触判断新姿态是否可信；新机位依赖未见面时，请求补图。画面的最亮处、最大色块、焦点和阴影轴线都应有明确作用。
5. **核对并提交。** 每案完成后再归纳对应的主预设及必要辅技法，说明它们怎样服务商品与用途。核对光向、反射和接触影，与原图可见面、姿态和标识相互一致。`known_context.analysis` 保留共同商品事实及未知项，各案的创意与具体拍法独立填写。

## 提交结构化清单

使用 `request_design_brief`。按产品原图顺序填写 `source_node_ids` 和 `images`。在 `known_context` 中填一次序列化的 version 2 JSON 字符串。每张产品原图只出现一次。对象和关系 ID 用简短英文及数字，同一张图内唯一。以下是字段示例，实际按附件识别商品。

```json
{"version":2,"analysis":"瓶身需要侧逆光表现透明边缘，采用偏心陈列。","images":[{"nodeId":"实际产品节点ID","subjectInventory":{"targetObjects":[{"id":"bottle","name":"香水瓶","count":1,"appearance":"透明瓶身、浅金液体","structure":"方形瓶体、短颈和原盖"}],"packaging":[{"id":"box","name":"外盒","count":1,"appearance":"米白哑光","structure":"矩形纸盒","markings":"保留原盒可辨文字"}],"relationships":[{"id":"pair","from":"bottle","to":"box","kind":"paired-with","detail":"外盒与瓶体配套，均入镜"}]}}],"presentation":{"support":"surface","placement":"瓶体和外盒直接站在平整哑光桌面","compositionChange":"瓶体与外盒错位陈列，左上留白，低畸变机位保持标签可见"}}
```

- 只填写相关类别。记录数量、外观、关键结构与可辨标记。已有可辨文字填 `markings`。局部文字不可辨且确有必要记录时，在 `unknowns` 使用 `unreadable-markings`。`unknowns` 可省略。需问用户时填写 `targetId`、`field`、`detail` 和 `required:true`。
- relationships.kind 可用 attached（连接）、wrapped-by（被包覆于）、inside（在内部）、aligned（对位）、paired-with（配套）或 displayed-with（独立同场陈列）。写清主客体及可见相对位置，附真实原图可见细节。物理关系与配套关系自动锁定，独立同场陈列可重新布局。
- 在 `known_context.visualFeatures` 填 `nodeId`、`targetId`、`observation` 和 `importance`。随后在 `known_context.creativeDirections` 写 `recommendedId`、`reason` 和 `options`。每案用短英文 `id`，填写 `name`、`concept`、`scene`、`placement`、`composition`、`camera`、`light`、`color`、`method`、`use`、`reason`、`featureIndices` 和 `references`。`featureIndices` 从 1 起。参考项填写实际索引中的 `id` 和 `borrow`，说明迁移到本商品的构图、光色或材质关系。
- `summary` 和 `image_prompt` 对应首推方向。宿主将原图绑定、视觉特征、场景构图、布光、色彩材质、机位景深和纯摄影边界组装为执行词。投放渠道留在确认卡。`questions` 只询问会影响产品识别或成片的事实。

## 确认并配置节点

确认卡展示原图、产品识别、方向与推荐理由、摄影方案和模型参数。切换方向时从对应方案完整组装提示词。用户修改摄影时，沿用同一商品清单，重新设计受影响的场景、构图、布光和拍法，再提交完整方案。用户选择「确认并创建节点」后，只创建或复用并配置图片生成节点，包含完整摄影提示词及真实产品引用。Agent 在节点保存后停止，用户在节点中手动发起生成。使用同一素材顺序与指纹，保留原图和既有成片。

工作流只交付策划和可编辑节点。等待用户单独发起生图确认。通过实际成片才能验收摄影效果及可见小字、精细纹样和复杂结构。
