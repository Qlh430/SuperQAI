"use strict";
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { createCanvasRepository } = require("../canvas-repository");

module.exports = async function createRichBoardFixture(temp, options = {}) {
  const id = "rich-media-pressure";
  const output = path.join(temp, "output");
  const generatorCount = Math.max(1, Math.min(106, Math.trunc(Number(options.generatorCount) || 106)));
  const galleryCount = Math.max(1, Math.min(81, Math.trunc(Number(options.galleryCount) || 81)));
  fs.mkdirSync(output, { recursive: true });
  // A real textured 3840px image. The server must produce and the browser must
  // decode 640px previews; a data-URI pixel cannot satisfy this workload.
  const pixels = Buffer.alloc(640 * 480 * 3);
  let seed = 187;
  for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels[i] = seed >>> 24; }
  const original = await sharp(pixels, { raw: { width: 640, height: 480, channels: 3 } }).resize(3840, 2880).jpeg({ quality: 88 }).toBuffer();
  for (let i = 0; i < galleryCount; i++) fs.writeFileSync(path.join(output, `rich-${i}.jpg`), original);
  const nodes = [], connections = [];
  for (let i = 0; i < generatorCount; i++) {
    const x = (i % 9) * 800, y = Math.floor(i / 9) * 470;
    nodes.push({ id: `generator-${i}`, kind: "image", x, y, width: 320, height: 330, prompt: `性能测试 ${i}`, model: "gpt-image-2", resolution: "1K", size: "1024x1024" });
    if (i >= galleryCount) continue;
    nodes.push({ id: `gallery-${i}`, kind: "gallery-container", x: x + 390, y, width: 320, height: 310,
      galleryContainer: { title: "真实图片测试", members: [{ id: `member-${i}`, src: `/output/rich-${i}.jpg`, name: `真实预览 ${i}`, width: 3840, height: 2880 }] } });
    connections.push({ id: `result-${i}`, from: `generator-${i}`, to: `gallery-${i}` });
    if (i + 1 < generatorCount) connections.push({ id: `ref-${i}`, from: `gallery-${i}`, to: `generator-${i + 1}` });
  }
  const repository = createCanvasRepository({ dbPath: path.join(temp, "canvas.db") });
  try {
    await repository.ready();
    await repository.createBoard({
      id,
      title: `${nodes.length} 节点 / ${galleryCount} 张真实图片`,
      viewport: { x: 80, y: 60, scale: 0.16 },
    });
    await repository.applyOperations({ boardId: id, baseRevision: 0, operations: [
      ...nodes.map(node => ({ operationId: `node-${node.id}`, type: "node.upsert", entityId: node.id, after: node })),
      ...connections.map(edge => ({ operationId: `edge-${edge.id}`, type: "connection.upsert", entityId: edge.id, after: edge })),
    ] });
  } finally { await repository.close(); }
  return { external_id: id };
};
