"use strict";

function replaceOnce(text, needle, replacement, label) {
  if (text.split(needle).length !== 2) throw new Error(`${label}入口不匹配，已停止部署。`);
  return text.replace(needle, replacement);
}
function patchAssetComposition(text) {
  if (text.includes("/* NEON_CURATED_ASSET_SERVICE */")) return text;
  let patched = replaceOnce(text, "const resourceAccess = createResourceAccess({ db: systemDb });", [
    "const resourceAccess = createResourceAccess({ db: systemDb });",
    "/* NEON_CURATED_ASSET_SERVICE */",
    'const curatedAssets = require("../curated-asset-service").createCuratedAssetService({',
    "  db: systemDb, resourceAccess,",
    "  resolveAuthorizedMedia: (userId, url) => assertOutputMediaRead(userId, url),",
    "});",
  ].join("\n"), "资产服务组合");
  patched = replaceOnce(patched, "const createAssetLibraryHttpApiComponent = () => createAssetLibraryHttpApi({", "const createLegacyAssetLibraryHttpApiComponent = () => createAssetLibraryHttpApi({", "资产接口组合");
  patched = replaceOnce(patched, "const createMediaHttpApiComponent = () => createMediaHttpApi({", [
    "const createAssetLibraryHttpApiComponent = () => {",
    "  const legacy = createLegacyAssetLibraryHttpApiComponent();",
    '  const curated = require("../curated-asset-http-api").createCuratedAssetHttpApi({ curatedAssets, readJson, sendJson });',
    "  return { handle: async (req, res) => await curated.handle(req, res) || legacy.handle(req, res) };",
    "};",
    "const createMediaHttpApiComponent = () => createMediaHttpApi({",
  ].join("\n"), "资产接口路由");
  return patched;
}
function patchAssetManifest(text) {
  if (text.includes('routePrefixes: ["/api/assets", "/api/asset-library"]')) return text;
  return replaceOnce(text, 'routePrefixes: ["/api/assets"],', 'routePrefixes: ["/api/assets", "/api/asset-library"],', "资产接口清单");
}
function patchMediaLifecycleComposition(text) {
  if (text.includes("/* NEON_CANVAS_MEDIA_LIFECYCLE */")) return text;
  let patched = replaceOnce(text, "const createThumbnailHttpApiComponent = () => {", [
    "/* NEON_CANVAS_MEDIA_LIFECYCLE */",
    'const mediaGc = require("../canvas-media-gc-service").createCanvasMediaGcService({ outputDir: OUTPUT_DIR, db: systemDb, getCanvasStorage, thumbnailStore });',
    "const createThumbnailHttpApiComponent = () => {",
  ].join("\n"), "媒体清理服务");
  patched = replaceOnce(patched, "const createCanvasStorageHttpApiComponent = () => createCanvasStorageHttpApi({", "const createCanvasStorageHttpApiComponent = () => createCanvasStorageHttpApi({\n  mediaGc,", "画布清理接线");
  patched = replaceOnce(patched, "const createCanvasProjectHttpApiComponent = () => createCanvasProjectHttpApi({", "const createCanvasProjectHttpApiComponent = () => createCanvasProjectHttpApi({\n  getCanvasCollabHub: () => canvasCollabHub,\n  publicUser,", "项目删除广播");
  for (const name of ["Resource", "History"]) {
    const needle = `const create${name}HttpApiComponent = () => create${name}HttpApi({`;
    patched = replaceOnce(patched, needle, `${needle}\n  listMediaResources: () => systemDb.listAllResources({ includeDeleted: true }).filter(resource => resource.refType === 'output_media'),`, `${name}媒体预览过滤`);
  }
  return patched;
}
function patchAssetServer(text) {
  const tombstoneGuard = "  if (resource?.deletedAt) return resource;";
  if (text.includes("/* NEON_CANVAS_PROJECT_REFERENCE_SYNC */")) {
    if (text.includes(tombstoneGuard)) return text;
    return replaceOnce(text,
      "  let resource = systemDb.getResourceByRef(refType, refId);\n  /* NEON_CANVAS_PROJECT_REFERENCE_SYNC */",
      `  let resource = systemDb.getResourceByRef(refType, refId);\n${tombstoneGuard}\n  /* NEON_CANVAS_PROJECT_REFERENCE_SYNC */`,
      "已删除画布登记同步保护");
  }
  let patched = replaceOnce(text,
    "  let resource = systemDb.getResourceByRef(refType, refId);\n  if (resource) {",
    [
      "  let resource = systemDb.getResourceByRef(refType, refId);",
      tombstoneGuard,
      "  /* NEON_CANVAS_PROJECT_REFERENCE_SYNC */",
      '  if (refType === "canvas" && !currentUserOwnsNew) {',
      "    const { repository } = getCanvasStorage();",
      "    let metadata;",
      "    try { metadata = await repository.getBoardMeta(refId); } catch (error) {",
      '      if (error.code !== "board_not_found") throw error;',
      "    }",
      "    const project = metadata?.projectId ? systemDb.getCanvasProject(metadata.projectId) : null;",
      "    if (resource && metadata) {",
      "      const workspaceId = project?.ownerUserId === resource.ownerUserId ? project.id : null;",
      "      const canvasTrashed = Boolean(metadata.deletedAt);",
      "      if (resource.workspaceId !== workspaceId || Boolean(resource.metadata?.canvasTrashed) !== canvasTrashed) {",
      "        resource = systemDb.updateResource(resource.id, { workspaceId, metadata: { ...resource.metadata, canvasTrashed } }) || resource;",
      "      }",
      "    } else if (project) input = { ...input, workspaceId: project.id, metadata: { ...input.metadata, canvasTrashed: Boolean(metadata.deletedAt) } };",
      "  }",
      "  if (resource) {",
    ].join("\n"), "画布项目引用同步");
  patched = replaceOnce(patched,
    '    type: /\\.(mp4|webm|mov|mkv)$/i.test(media.refId) ? "video" : "image",',
    '    type: /\\.(mp4|webm|mov|mkv|m4v)$/i.test(media.refId) ? "video" : /\\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(media.refId) ? "audio" : "image",',
    "音频原文件引用");
  patched = replaceOnce(patched,
    "    const referencedUrls = await collectReferencedCanvasOutputUrls();\n    const result = deleteUnreferencedOutputMedia({",
    [
      "    const referencedUrls = await collectReferencedCanvasOutputUrls();",
      "    /* NEON_REGISTERED_MEDIA_RETENTION */",
      "    for (const resource of systemDb.listAllResources()) {",
      "      if (resource.deletedAt) continue;",
      "      collectOutputMediaUrls([resource.refType === 'output_media' ? resource.refId : null, resource.metadata], { outputDir: OUTPUT_DIR }, referencedUrls);",
      "    }",
      "    const result = deleteUnreferencedOutputMedia({",
    ].join("\n"), "历史与资产媒体保留");
  return patched;
}
module.exports = { patchAssetComposition, patchAssetManifest, patchAssetServer, patchMediaLifecycleComposition };
