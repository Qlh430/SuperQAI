const assert = require("node:assert/strict");
const preview = require("../canvas-preview-rules");

const cases = [
  {
    model: {
      id: "image",
      kind: "image",
      imageName: "红色产品图",
      thumbnailSrc: "/thumbs/red.webp",
      imageSrc: "/output/red-original.png",
      status: "已完成",
    },
    imageSource: "/thumbs/red.webp",
    typeLabel: "图片",
  },
  {
    model: {
      id: "gallery",
      kind: "gallery",
      galleryTitle: "方案图集",
      galleryActiveImageId: "g2",
      galleryImages: [
        { id: "g1", savedUrl: "/output/one.png" },
        { id: "g2", thumbnailSrc: "/thumbs/two.webp", savedUrl: "/output/two.png" },
      ],
    },
    imageSource: "/thumbs/two.webp",
    typeLabel: "图集",
  },
  {
    model: {
      id: "group",
      kind: "group",
      groupTitle: "主视觉参考",
      groupImages: [{ thumbnailSrc: "/thumbs/group.webp", savedUrl: "/output/group.png" }],
    },
    imageSource: "/thumbs/group.webp",
    typeLabel: "图片组",
  },
  {
    model: { id: "text", kind: "text", text: "这是一段可辨识的文案", status: "已编辑" },
    imageSource: "",
    typeLabel: "文字",
  },
  {
    model: { id: "comfy", kind: "comfy", title: "放大工作流", resultSrc: "/output/comfy.png", state: "成功" },
    imageSource: "/output/comfy.png",
    typeLabel: "ComfyUI",
  },
  {
    model: { id: "generator", kind: "generator", title: "生图节点", prompt: "产品摄影", status: "等待生成" },
    imageSource: "",
    typeLabel: "生成器",
  },
  {
    model: { id: "llm", kind: "llm", llmPrompt: "生成卖点文案", runtimeStatus: "已就绪" },
    imageSource: "",
    typeLabel: "LLM",
  },
  {
    model: { id: "video", kind: "video", mediaName: "成片预览", poster: "/thumbs/video.webp", status: "可播放" },
    imageSource: "/thumbs/video.webp",
    typeLabel: "视频",
  },
  {
    model: { id: "legacy", kind: "legacy-widget", name: "旧版控制节点" },
    imageSource: "",
    typeLabel: "legacy-widget",
  },
];

for (const item of cases) {
  const descriptor = preview.describeNode(item.model);
  assert.equal(descriptor.kind, item.model.kind);
  assert.equal(descriptor.typeLabel, item.typeLabel);
  assert.equal(descriptor.imageSource, item.imageSource);
  assert.ok(descriptor.icon || descriptor.imageSource, `${item.model.id} has no image or icon`);
  assert.ok(descriptor.typeLabel.trim(), `${item.model.id} has no type`);
  assert.ok(descriptor.title.trim(), `${item.model.id} has no title`);
  assert.ok(descriptor.status.trim(), `${item.model.id} has no status`);
  assert.ok(descriptor.title.length <= 80, `${item.model.id} title is unbounded`);
  assert.ok(descriptor.status.length <= 48, `${item.model.id} status is unbounded`);
}

const aggregate = preview.describeAggregate({
  level: 4,
  count: 186,
  typeCounts: { image: 120, gallery: 40, text: 26 },
});
assert.equal(aggregate.kind, "image");
assert.equal(aggregate.typeLabel, "图片");
assert.equal(aggregate.count, 186);
assert.ok(aggregate.icon);
assert.ok(aggregate.title.includes("图片"));
assert.ok(aggregate.status.includes("186"));

const unknownAggregate = preview.describeAggregate({ count: 3, typeCounts: {} });
assert.ok(unknownAggregate.icon);
assert.ok(unknownAggregate.typeLabel);
assert.ok(unknownAggregate.title);
assert.ok(unknownAggregate.status.includes("3"));

console.log("Canvas preview rule checks passed.");
