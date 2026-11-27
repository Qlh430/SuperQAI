"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const FILE_NAMES = Object.freeze(["prompt-a.txt", "prompt-b.txt", "package.md", "result.json"]);
const MAX_FILE_BYTES = 256 * 1024;
const PACKAGE_ID = /^\d{10,16}-[0-9a-f]{16}$/;

function resolveH3CommerceImageSnapshot(node, requestedUrl) {
  const history = Array.isArray(node?.generationHistory) ? node.generationHistory : [];
  const imageMembers = node?.kind === "asset-collection"
    ? (node.assetCollection?.members || []).filter(item => item.kind === "image") : [];
  const current = node?.kind === "asset-collection" ? (imageMembers.length === 1 && (imageMembers[0].savedUrl || imageMembers[0].src))
    : ["image", "comfy"].includes(node?.kind) && (node.resultSrc || node.originalSrc || node.imageSrc);
  const url = String(requestedUrl || current || "");
  if (!/^\/output\/.+\.(?:png|jpe?g|webp)$/i.test(url)) return null;
  const entry = history.find(item => item?.kind === "image" && url === (item.savedUrl || item.src));
  if (["image", "comfy"].includes(node?.kind) && (url === current || entry)) {
    return { url, result_id: entry?.id || (url === current ? node.currentGenerationId : "") || "" };
  }
  if (imageMembers.some(item => url === (item.savedUrl || item.src))) return { url, result_id: "" };
  return null;
}

function createH3CommercePackageService({ outputDir, ensureReferencedResource, resourceAccess, resolveTarget, fsImpl = fs, cryptoImpl = crypto } = {}) {
  if (!String(outputDir || "").trim()) throw new TypeError("H3 commerce package service requires outputDir.");
  if (typeof ensureReferencedResource !== "function") throw new TypeError("H3 commerce package service requires resource authorization.");
  if (!resourceAccess || typeof resourceAccess.assertWrite !== "function") throw new TypeError("H3 commerce package service requires write access.");
  const root = path.resolve(outputDir);
  const targetRoot = path.resolve(root, "h3-commerce-video");

  async function authorize(userId, boardId, mode) {
    const owner = String(userId || "").trim();
    const board = String(boardId || "").trim();
    if (!owner || !board) throw Object.assign(new Error("保存带货方案需要有效的账户和当前画布。"), { statusCode: 400 });
    const resource = await ensureReferencedResource(owner, {
      type: "canvas",
      title: `画布 ${board}`,
      refType: "canvas",
      refId: board,
    });
    await resourceAccess[mode](owner, resource.id);
    return { owner, board };
  }

  function packagePaths(board, packageId) {
    const boardKey = cryptoImpl.createHash("sha256").update(board).digest("hex").slice(0, 24);
    const directory = path.join(targetRoot, boardKey, packageId);
    let cursor = fsImpl.realpathSync(root);
    for (const segment of ["h3-commerce-video", boardKey, packageId]) {
      cursor = path.join(cursor, segment);
      try {
        if (!fsImpl.lstatSync(cursor).isDirectory()) throw new Error("带货方案目录无效。");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    return { directory, boardKey };
  }

  function fileEntries(board, boardKey, packageId) {
    return FILE_NAMES.map(name => ({
      name,
      url: resolveTarget
        ? `/api/canvas-agent/h3-commerce-package?${new URLSearchParams({ board_id: board, package_id: packageId, file: name })}`
        : `/output/h3-commerce-video/${boardKey}/${packageId}/${name}`,
    }));
  }

  async function save(userId, boardId, supplied = {}, binding = {}) {
    const { owner, board } = await authorize(userId, boardId, "assertWrite");
    const files = supplied && typeof supplied === "object" ? supplied : {};
    const normalized = {};
    for (const name of FILE_NAMES) {
      const content = files[name];
      if (typeof content !== "string" || !content.trim()) {
        throw Object.assign(new Error(`带货方案缺少文件 ${name}。`), { statusCode: 400 });
      }
      const bytes = Buffer.byteLength(content, "utf8");
      if (bytes > MAX_FILE_BYTES) throw Object.assign(new Error(`带货方案文件 ${name} 超过大小限制。`), { statusCode: 413 });
      normalized[name] = content;
    }
    let nodeId = "";
    let imageReferences = [];
    if (resolveTarget) {
      nodeId = String(binding.node_id || "").trim();
      const imageIds = Array.isArray(binding.image_node_ids) ? binding.image_node_ids.map(String) : [];
      const sourceUrls = binding.image_source_urls;
      if (!nodeId || imageIds.length !== 4 || imageIds.some(id => !id.trim())
        || sourceUrls !== undefined && (!Array.isArray(sourceUrls) || sourceUrls.length !== 4
          || sourceUrls.some(url => typeof url !== "string" || !url || url.length > 1600))) {
        throw Object.assign(new Error("带货方案需要关联一个带货节点和四个有效的图片槽位。"), { statusCode: 400 });
      }
      let result;
      try { result = JSON.parse(normalized["result.json"]); } catch {}
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw Object.assign(new Error("带货方案的 result.json 必须是 JSON 对象。"), { statusCode: 400 });
      }
      imageReferences = await resolveTarget(owner, board, nodeId, imageIds, sourceUrls);
      if (!Array.isArray(imageReferences) || imageReferences.length !== 4 || imageReferences.some((ref, index) => (
        ref?.slot !== index + 1 || ref.node_id !== imageIds[index] || !ref.url || sourceUrls && ref.url !== sourceUrls[index]
      ))) {
        throw Object.assign(new Error("带货方案的图片版本或槽位已变化，请核对四个槽位。"), { statusCode: 400 });
      }
      normalized["result.json"] = JSON.stringify({
        ...result,
        prompt_a: normalized["prompt-a.txt"],
        prompt_b: normalized["prompt-b.txt"],
        canvas: { board_id: board, node_id: nodeId, image_references: imageReferences },
      }, null, 2);
      if (Buffer.byteLength(normalized["result.json"]) > MAX_FILE_BYTES) {
        throw Object.assign(new Error("带货方案文件 result.json 超过大小限制。"), { statusCode: 413 });
      }
    }
    const packageId = `${Date.now()}-${cryptoImpl.randomBytes(8).toString("hex")}`;
    const { directory, boardKey } = packagePaths(board, packageId);
    fsImpl.mkdirSync(path.dirname(directory), { recursive: true });
    fsImpl.mkdirSync(directory);
    try {
      for (const name of FILE_NAMES) {
        fsImpl.writeFileSync(path.join(directory, name), normalized[name], { encoding: "utf8", flag: "wx", mode: 0o600 });
      }
    } catch (error) {
      try { fsImpl.rmSync(directory, { recursive: true, force: true }); } catch {}
      throw error;
    }
    return { package_id: packageId, node_id: nodeId, image_references: imageReferences, files: fileEntries(board, boardKey, packageId) };
  }

  async function read(userId, boardId, packageId, name = "") {
    const { board } = await authorize(userId, boardId, "assertRead");
    if (!PACKAGE_ID.test(packageId) || name && !FILE_NAMES.includes(name)) {
      throw Object.assign(new Error("带货方案编号或文件名无效。"), { statusCode: 400 });
    }
    const { directory, boardKey } = packagePaths(board, packageId);
    function readFile(file) {
      const target = path.join(directory, file);
      try {
        const stat = fsImpl.lstatSync(target);
        if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("invalid package file");
        return fsImpl.readFileSync(target, "utf8");
      } catch {
        throw Object.assign(new Error("当前画布中未找到完整带货方案。"), { statusCode: 404 });
      }
    }
    if (name) return { name, content: readFile(name) };
    const contents = Object.fromEntries(FILE_NAMES.map(file => [file, readFile(file)]));
    const metadata = JSON.parse(contents["result.json"]).canvas;
    return {
      package_id: packageId, node_id: metadata?.node_id || "",
      image_references: metadata?.image_references || [], files: fileEntries(board, boardKey, packageId), contents,
    };
  }

  return Object.freeze({ save, read });
}

module.exports = { FILE_NAMES, MAX_FILE_BYTES, createH3CommercePackageService, resolveH3CommerceImageSnapshot };
